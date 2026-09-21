// dodge_planner.js — model-based receding-horizon planner for the dodge setup.
// The dodge world is fully predictable in flight: bullets fly straight lines,
// the agent's dynamics are known. So instead of learning a policy, PLAN: every
// few steps enumerate 81 candidate accel sequences (9 directions x 2 segments)
// over a ~1.2s horizon, roll each against the known ballistic bullet futures,
// and execute the safest. The same idea as LQR for the pendulum: when you have
// the model, use it. On the corrected September model, the audit completed
// ten held-out 20s mixed-pattern episodes at spawn rates 1.5 and 3.
//
// The one thing lookahead can't see is FUTURE spawns — every one of the
// planner's pre-fix deaths was a point-blank edge spawn. All spawns happen at
// the field edges, so the planner keeps a ~100px standoff from every wall
// (edge margin scored like bullet clearance). That standoff is the single most
// valuable behavior a learned dodge policy could acquire.
//
//   create(opts)            -> planner instance (plan cache + replan cadence)
//   command(pl, state)      -> [cx, cy] in [-1,1]^2 for the CURRENT step
//   makePolicy(getState)    -> {command, commandAll} adapter for the app's
//                              display loop (ignores obs; plans from the live
//                              dodge state — model-based, like LQR)
//   runEpisode(opts)        -> {survivedS, capped} headless ground-truth
//                              episode (real P.step + setup.tick)

(function (BF) {
  'use strict';
  if (!BF) return;

  const DT = 1 / 120;
  const DEFAULTS = {
    horizonS: 1.2,      // lookahead
    replanSteps: 3,     // replan every 0.025s
    clrCap: 150,        // bullet-clearance tie-break cap (px)
    edgeCap: 100,       // wall standoff target (px) — vs unknowable edge spawns
  };

  const DIRS = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) DIRS.push([dx, dy]);
  const CANDS = [];
  for (const a of DIRS) for (const b of DIRS) CANDS.push([a, b]);   // 81

  // Exact explicit-agent model, synchronized with setups.js. One displacement
  // per tick; retain x/px representation for inexpensive candidate cloning.
  function agentStep(st, cX, cY, env) {
    let vx = env.mode === 'velocity' ? cX * env.maxV : (st.x - st.px) / DT * env.damp + cX * env.maxA * DT;
    let vy = env.mode === 'velocity' ? cY * env.maxV : (st.y - st.py) / DT * env.damp + cY * env.maxA * DT;
    const sp = Math.hypot(vx, vy);
    if (env.mode !== 'velocity' && sp > env.maxV) { const k = env.maxV / sp; vx *= k; vy *= k; }
    st.x += vx * DT; st.y += vy * DT;
    if (st.x < -env.HW) { st.x = -env.HW; vx = 0; } else if (st.x > env.HW) { st.x = env.HW; vx = 0; }
    if (st.y < -env.HH) { st.y = -env.HH; vy = 0; } else if (st.y > env.HH) { st.y = env.HH; vy = 0; }
    st.px = st.x - vx * DT; st.py = st.y - vy * DT;
  }

  function envOf(state) {
    return {
      damp: 1 - state.world.damping,
      mode: state.controlMode,
      maxA: state.maxAccel,
      maxV: state.maxSpeed,
      HW: state.worldExtent.halfW,
      HH: state.worldExtent.halfH,
    };
  }

  function create(opts) {
    const c = Object.assign({}, DEFAULTS, opts || {});
    c.segSteps = Math.round(c.horizonS / 2 / DT);
    c.horizonSteps = c.segSteps * 2;
    return { config: c, plan: [[0, 0], [0, 0]], since: Infinity };
  }

  // Full replan: lexicographic score over 81 candidates —
  //   1) steps survived vs KNOWN bullets, 2) worst-of(bullet clearance, edge
  //   margin) both capped, 3) end-position centrality (keeps maneuvering room).
  function computePlan(pl, state) {
    const c = pl.config;
    const agent = state.world.nodes[state.agentIdx];
    const env = envOf(state);
    const AGENT_R = agent.radius;
    const src = state.dodge.bullets;
    let nB = 0;
    for (let i = 0; i < src.length; i++) if (src[i].alive) nB++;
    const H = c.horizonSteps;
    // Bullet ballistic futures (candidate-independent); mirrors tick():
    // move, then despawn beyond field+40. Despawned slots parked far away.
    const bx = new Float64Array(H * nB), by = new Float64Array(H * nB);
    const cr2 = new Float64Array(nB);
    {
      const cx = new Float64Array(nB), cy = new Float64Array(nB);
      const cvx = new Float64Array(nB), cvy = new Float64Array(nB);
      const alv = new Uint8Array(nB);
      let k = 0;
      for (let i = 0; i < src.length; i++) {
        const b = src[i];
        if (!b.alive) continue;
        cx[k] = b.x; cy[k] = b.y; cvx[k] = b.vx; cvy[k] = b.vy;
        const cr = b.r + AGENT_R; cr2[k] = cr * cr; alv[k] = 1; k++;
      }
      const OX = env.HW + 40, OY = env.HH + 40;
      for (let t = 0; t < H; t++) {
        const off = t * nB;
        for (let i = 0; i < nB; i++) {
          if (!alv[i]) { bx[off + i] = 1e9; by[off + i] = 1e9; continue; }
          cx[i] += cvx[i] * DT; cy[i] += cvy[i] * DT;
          if (cx[i] < -OX || cx[i] > OX || cy[i] < -OY || cy[i] > OY) {
            alv[i] = 0; bx[off + i] = 1e9; by[off + i] = 1e9; continue;
          }
          bx[off + i] = cx[i]; by[off + i] = cy[i];
        }
      }
    }
    let bestSurv = -1, bestSec = -Infinity, bestCentr = -Infinity, bestIdx = 0;
    const st = { x: 0, y: 0, px: 0, py: 0 };
    for (let ci = 0; ci < CANDS.length; ci++) {
      const cand = CANDS[ci];
      st.x = agent.x; st.y = agent.y; st.px = agent.px; st.py = agent.py;
      let surv = H, minD2 = Infinity, minEdge = Infinity, hit = false;
      for (let t = 0; t < H; t++) {
        const cc = t < c.segSteps ? cand[0] : cand[1];
        agentStep(st, cc[0], cc[1], env);
        const ex = env.HW - Math.abs(st.x), ey = env.HH - Math.abs(st.y);
        const edge = ex < ey ? ex : ey;
        if (edge < minEdge) minEdge = edge;
        const off = t * nB;
        for (let i = 0; i < nB; i++) {
          const ddx = bx[off + i] - st.x, ddy = by[off + i] - st.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < minD2) minD2 = d2;
          if (d2 <= cr2[i]) { hit = true; surv = t; break; }
        }
        if (hit) break;
      }
      const clr = Math.min(Math.sqrt(minD2), c.clrCap);
      const sec = Math.min(clr, Math.min(minEdge, c.edgeCap));
      const centr = -((st.x * st.x) / (env.HW * env.HW)
                    + (st.y * st.y) / (env.HH * env.HH));
      if (surv > bestSurv
          || (surv === bestSurv
              && (sec > bestSec || (sec === bestSec && centr > bestCentr)))) {
        bestSurv = surv; bestSec = sec; bestCentr = centr; bestIdx = ci;
      }
    }
    // Lookahead viz: the chosen plan's agent path + each bullet's predicted
    // straight-line future. This IS "how the planner decides" — it looks ahead
    // at where the bullets will be and steers onto the safe path. Skipped for
    // headless runs (config.viz off) to keep them fast.
    if (c.viz) {
      const cand = CANDS[bestIdx], path = [];
      st.x = agent.x; st.y = agent.y; st.px = agent.px; st.py = agent.py;
      for (let t = 0; t < H; t++) {
        const cc = t < c.segSteps ? cand[0] : cand[1];
        agentStep(st, cc[0], cc[1], env);
        if (t % 4 === 0) path.push({ x: st.x, y: st.y });
      }
      const futures = [];
      for (let i = 0; i < src.length; i++) {
        const b = src[i];
        if (!b.alive) continue;
        futures.push({ x0: b.x, y0: b.y, x1: b.x + b.vx * DT * H, y1: b.y + b.vy * DT * H, r: b.r });
      }
      pl.lastViz = { path: path, futures: futures, HW: env.HW, HH: env.HH,
                     agentR: AGENT_R, agent: { x: agent.x, y: agent.y },
                     bestSurv: bestSurv, horizonSteps: H };
    }
    return CANDS[bestIdx];
  }

  function command(pl, state) {
    if (!state || !state.dodge || state.agentIdx == null) return [0, 0];
    if (pl.since >= pl.config.replanSteps) { pl.plan = computePlan(pl, state); pl.since = 0; }
    pl.since++;
    return pl.plan[0];
  }

  // Adapter so the app's display loop can drive the planner like any policy.
  // Ignores the observation vector — plans from the LIVE state (model-based).
  function makePolicy(getState, opts) {
    const pl = create(Object.assign({ viz: true }, opts || {}));
    return {
      isPlanner: true,
      planner: pl,           // exposes pl.lastViz for the lookahead panel
      command(obs) {
        const cmd = command(pl, getState());
        return cmd[0];
      },
      commandAll(obs, buf) {
        const cmd = command(pl, getState());
        buf[0] = cmd[0]; buf[1] = cmd[1];
        for (let i = 2; i < buf.length; i++) buf[i] = 0;
        return buf;
      },
    };
  }

  // Headless ground-truth episode (real physics + tick). Used by the app's
  // "generation" loop: each gen = one full episode at a fresh seed, plotting
  // survival seconds (capped) — solved-from-gen-0, verified per seed.
  function runEpisode(o) {
    o = o || {};
    const setup = BF.setups.getSetup('dodge');
    const P = BF.physics;
    const state = setup.buildWorld({
      dodgePattern: o.pattern || 'mixed',
      dodgeSpawnRate: o.spawnRate != null ? o.spawnRate : 3,
      seed: o.seed != null ? o.seed : 1,
      dodgePatternSeed: o.seed != null ? o.seed : 1,
      dodgeNoDie: false,
    });
    const pl = create(o);
    const cap = o.capSeconds != null ? o.capSeconds : 12;
    const maxSteps = Math.round(cap / DT);
    let s = 0;
    for (; s < maxSteps; s++) {
      const cmd = command(pl, state);
      state.lastCmds = [cmd[0], cmd[1]];
      state.lastCmd = cmd[0];
      P.step(state.world, DT, cmd[0]);
      setup.tick(state, DT);
      if (state.dead) break;
    }
    return { survivedS: s * DT, capped: s >= maxSteps };
  }

  BF.dodgePlanner = { create, command, makePolicy, runEpisode, agentStep, envOf, DEFAULTS };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
