// chain_trace_planner.js — zero-training controllers for the chain-trace
// ("signing machine") setup: a model-based receding-horizon PLANNER, plus the
// reactive feedback law it is honestly measured against.
//
// WHY A PLANNER. Chain-trace is the same bet as dodge_planner.js and the
// pendulum LQR modes: the world is fully known, so instead of learning a
// policy, USE THE MODEL. Every few steps we roll a handful of candidate cart
// programs through the REAL physics on an exact state clone, score each by
// accumulated |tip − cursor|, execute the first slice of the winner, replan.
//
// WHY ONLY THE CART IS PLANNED. The chain is a pendulum hanging off the cart;
// essentially all tip authority is the swing DOF, driven by the cart. The three
// joint servos were measured as TRIM TABS — a full ±1 command deflects the
// static tip by only ~1–4.5 deg of arm angle — so putting them in the search
// space multiplies the branching factor while moving the tip a few px. They are
// held at zero here; the feedback law below still uses them as a slow DLS trim,
// which is all they are good for.
//
// WHY THE TELESCOPE IS REACTIVE, NOT PLANNED. Segment rest length sets the
// chain's RADIUS, and the radius the tip needs is a pure function of the cursor
// height and the current swing angle: r = y / cos(θ). That is a closed-form
// inverse, not a search problem — planning it (measured: planTele with 24
// coarse mutants) bought nothing over the law. The one thing the law does need
// is LEAD: the telescope slews at a bounded rate, so compensating with the
// angle θ measured NOW arrives late. telLead extrapolates θ by the swing rate
// (θ += ω·telLead) before the cos-compensation — worth ~4 px on figure-8.
//
// CLONE FIDELITY IS THE WHOLE BALLGAME. The forward model is not an
// approximation: it is BF.physics.step + setup.tick run on a deep copy of the
// live state. Anything the real step mutates that the copy shares by reference
// (a node, a spring, jointCmds, the telescope's spring handles) makes the
// planner plan for a world it is simultaneously corrupting. cloneState below is
// verified at 0.00e+0 px tip divergence over 300 driven steps; if you touch it,
// re-run that assertion first.
//
//   create(opts)              -> planner instance
//   command(pl, state)        -> action array for the CURRENT step (length
//                                1 + numActuatedJoints + numSegments)
//   makePolicy(getState,opts) -> {command, commandAll, planner} adapter the app
//                                can hand to its display loop as showPolicy.
//                                Ignores the observation vector entirely — this
//                                is model-based, it reads the live world.
//
// MEASURED (headless, mean |tip − cursor| px, first 1.0 s skipped, FULL loops;
// rigid material, servo joints, telescope on, 4 segments / 3 actuated joints;
// triangle = radius 100 / period 12, figure-8 = radius 140 / period 10).
// Two protocols, because the honest headline moves with the start tilts:
//                                    tilts ±0.1, 2 loops   tilts ±0.1/±0.05, 3 loops
//   kind 'planner'  (defaults below)  41.9 / 69.9           42.7 / 71.5
//   kind 'feedback' (defaults below)  49.7 / 90.8           47.8 / 87.5
//   best LEARNED tracker (CMA-ES)         —                 45.7 / 66.7
//   null policy (do nothing)         218  / 268                  —
// So the planner beats the learned tracker on the shape with corners and loses
// on the smooth one — a legitimate engineered baseline, not an oracle.

(function (BF) {
  'use strict';
  if (!BF) return;

  const DT = 1 / 120;
  // Mirrors BF.chainJoint.CHAIN_JOINT.angleRange (kept local so this file
  // depends only on physics / setups / chainTraceCurves).
  const JOINT_RANGE = Math.PI / 2;

  // ---- Planner defaults = the measured "Planner-G" config ------------------
  // BROWSER BUDGET. Cost per replan = 1 (anchor law) + 1 (shifted previous
  // plan) + nMutCoarse + nMutFine = 18 clone rollouts of H/DT = 288 real
  // physics steps each, every `replan` steps. MEASURED (node, this machine):
  //   defaults            2.2 ms/step amortized, replan spike 13 ms median / 23 ms max
  //   {replan:12, 6/6}    0.9 ms/step amortized, spike 10 ms median / 18 ms max
  //   {simBudget: 8}      1.1 ms/step amortized, spike  6 ms median / 11 ms max
  // The AMORTIZED number is comfortable at 60 Hz; the SPIKE is not — a full
  // replan costs most of a frame and lands every `replan` frames if the display
  // loop steps once per rAF. Two ways out, both configurable:
  //   * CHEAPER FALLBACK {replan: 12, nMutCoarse: 6, nMutFine: 6} — halves the
  //     replan rate and drops to 14 rollouts, for +0.6 px on triangle and
  //     +8.1 px on figure-8 (measured, tilts ±0.1, 2 loops).
  //   * simBudget — a HARD ceiling on rollouts per replan, checked between
  //     candidates. It truncates the coarse pool first and can starve the fine
  //     round entirely, so it degrades gracefully rather than predictably
  //     (at 8: triangle 38.7 px, figure-8 82.1 px vs 41.9 / 69.9 unclamped).
  // The default 24 is deliberately ABOVE the 18 the defaults need, so it never
  // binds on the shipped config — set it lower only to cap a slow machine.
  const PLANNER_DEFAULTS = {
    lead: 0.25,          // cursor lead used by the internal reactive laws (px-servo lag comp)
    kx: 4.0,             // P gain of the anchor tracking law (cart px/s per px error)
    ffCap: 450,          // cap on the cursor-velocity feedforward (px/s)
    sag: 8,              // static droop of the chain under gravity (px), removed from r
    RMIN: 160,           // reachable radius band (px) — below/above these the servo saturates
    RMAX: 505,
    thCap: 1.1,          // cap on the smoothed swing angle fed to 1/cos (rad)
    thTau: 0.10,         // low-pass time constant on that angle (s)
    telLead: 0.18,       // θ extrapolation for the telescope (s) — see header
    H: 2.4,              // planning horizon (s)
    NSEG: 6,             // piecewise-constant cart segments per plan
    replan: 6,           // steps between replans (0.05 s)
    nMutCoarse: 8, ampCoarse: 0.9,
    nMutFine: 8, ampFine: 0.35,
    mutMode: 'mixed',    // 'all' = jitter every segment; 'mixed' = alternate with single-segment resets
    simBudget: 24,       // hard ceiling on clone rollouts per replan (defaults need 18)
    seed: 12345,         // the mutation search is a SEARCH, not learning — keep it reproducible
    viz: false,          // record the winning plan's tip path (costs one extra rollout)
  };

  // ---- Feedback defaults = the measured "law-B3" config --------------------
  // Deliberately dumb and O(1): P-track the lead cursor x with a velocity
  // feedforward, damp the swing, invert r = y/cos θ for the telescope, and let
  // the trim-tab joints integrate out the residual. Energy-pumping and
  // swing-peak-targeting variants were both tried and measured WORSE than this,
  // so they are not shipped.
  const FEEDBACK_DEFAULTS = {
    kx: 4.0, lead: 0.30, ffCap: 450, ffSmooth: 0.2,
    sag: 8, thCap: 0.9, thTau: 0.12,
    kd: 80,              // swing damper (cart px/s per rad/s) — the whole win of law-B3
    RMIN: 160, RMAX: 505,
    xCap: 250,           // rail half-length; asking for more just saturates
    joints: true, kJ: 3.0, lambda: 200,   // damped-least-squares trim gain / regularizer
  };

  const DEFAULTS = { kind: 'planner', planner: PLANNER_DEFAULTS, feedback: FEEDBACK_DEFAULTS };

  // -------------------------------------------------------------------------
  // Exact deep clone of a chain-trace sim state. Everything BF.physics.step and
  // setup.tick mutate must be copied, and the telescope's spring handles must be
  // REMAPPED into the copied springs array (they are the same objects the solver
  // reads, so a shared handle means the plan edits the live world).
  // paint mode is dropped: the planner only makes sense against a moving cursor.
  function cloneState(st) {
    const w = st.world;
    const w2 = Object.assign({}, w, {
      nodes: w.nodes.map(n => Object.assign({}, n)),
      rods: w.rods.map(r => Object.assign({}, r)),
      springs: w.springs.map(s => Object.assign({}, s)),
      jointActuators: w.jointActuators.map(a => Object.assign({}, a)),
      jointCmds: w.jointCmds.slice(),
      pendingImpulses: [],
    });
    return Object.assign({}, st, {
      world: w2,
      chainTrace: Object.assign({}, st.chainTrace, {
        center: Object.assign({}, st.chainTrace.center),
        trail: [],   // render-only; keep the clone from growing the live trail
      }),
      chainReach: Object.assign({}, st.chainReach, {
        target: Object.assign({}, st.chainReach.target),
      }),
      telescope: st.telescope ? Object.assign({}, st.telescope, {
        springs: st.telescope.springs.map(sp => {
          const i = w.springs.indexOf(sp);
          if (i < 0) throw new Error('chain_trace_planner: telescope spring missing from world.springs');
          return w2.springs[i];
        }),
      }) : null,
      lastCmds: st.lastCmds ? st.lastCmds.slice() : null,
      paint: null,
    });
  }

  // Curve position in world coords at absolute trace time t.
  function curveAt(state, t) {
    const ct = state.chainTrace;
    const u = BF.chainTraceCurves.pointAt(ct.curveId, t, ct.period);
    return { x: ct.center.x + u.x * ct.radius, y: ct.center.y + u.y * ct.radius };
  }

  const clamp1 = (v) => (v > 1 ? 1 : (v < -1 ? -1 : (v || 0)));

  // -------------------------------------------------------------------------
  // Shared reactive laws. Used IDENTICALLY live and inside the planner's
  // rollouts — if they diverged, the plan would be scored against a controller
  // that never runs.

  // Telescope: r <- clamp(y_cursor / cos(θ_smoothed), RMIN, RMAX) − sag, then
  // converted to the per-segment rest-length command the setup's servo expects.
  // (Command → rest length is piecewise: +1 reaches 1.6·base, −1 reaches
  // 0.5·base, so the two slopes differ — hence the 48/40 split.)
  function teleLaw(c, state, thSm, rOff) {
    const w = state.world;
    const cart = w.nodes[state.cartIdx], tip = w.nodes[state.tipIdx];
    const p = curveAt(state, state.chainTrace.traceTime + c.lead);
    const dx = tip.x - cart.x, dy = tip.y - cart.y;
    let th = Math.atan2(dx, dy);
    if (c.telLead > 0) {
      const r = Math.hypot(dx, dy) || 1;
      const om = ((tip.vx - cart.vx) * Math.cos(th) - (tip.vy - cart.vy) * Math.sin(th)) / r;
      th += om * c.telLead;
    }
    thSm.v += (th - thSm.v) * Math.min(1, DT / c.thTau);
    const thU = Math.max(-c.thCap, Math.min(c.thCap, thSm.v));
    const rDes = p.y / Math.max(0.17, Math.cos(thU)) + (rOff || 0);
    const rCmd = Math.max(c.RMIN, Math.min(c.RMAX, rDes - c.sag));
    const perSeg = rCmd / 4;
    return perSeg >= 80 ? (perSeg - 80) / 48 : (perSeg - 80) / 40;
  }

  // Cart anchor law: P on the lead cursor's x + its velocity feedforward.
  // This is the candidate the search must BEAT; keeping it in the pool means the
  // planner can never do worse than a sane reactive tracker.
  function trackLaw(c, state) {
    const cart = state.world.nodes[state.cartIdx];
    const t0 = state.chainTrace.traceTime;
    const p = curveAt(state, t0 + c.lead);
    const p2 = curveAt(state, t0 + c.lead + 0.1);
    let ff = (p2.x - p.x) / 0.1;
    if (ff > c.ffCap) ff = c.ffCap; if (ff < -c.ffCap) ff = -c.ffCap;
    return Math.max(-1, Math.min(1, (c.kx * (p.x - cart.x) + ff) / 600));
  }

  // -------------------------------------------------------------------------
  // Per-state binding. The app rebuilds the world on reset, so re-derive the
  // action layout and clear the plan whenever the state object changes.
  function bind(pl, state) {
    if (pl.state === state) return;
    const nJoints = state.world.jointActuators.length;
    const nTele = state.telescope ? state.telescope.springs.length : 0;
    pl.state = state;
    pl.setup = BF.setups.getSetup('chain-trace');
    pl.nJoints = nJoints;
    pl.teleOffset = state.telescope ? state.telescope.cmdOffset : -1;
    pl.nTele = nTele;
    pl.cmd = new Array(1 + nJoints + nTele).fill(0);
    pl.thSm = { v: 0 };
    pl.rng = pl.config.seed >>> 0;
    // planner
    pl.prevVals = null; pl.execVals = null; pl.stepInPlan = Infinity;
    pl.lastPlanMs = 0; pl.lastSims = 0; pl.planCount = 0; pl.lastViz = null;
    // feedback
    pl.restA = state.world.jointActuators.map(a => a.restAngle);
    pl.jointT = pl.restA.slice();
    pl.prevFF = null;
  }

  function writeCmd(pl, cart, tele) {
    const cmd = pl.cmd;
    cmd[0] = clamp1(cart);
    for (let j = 0; j < pl.nJoints; j++) cmd[1 + j] = 0;
    for (let s = 0; s < pl.nTele; s++) cmd[pl.teleOffset + s] = clamp1(tele);
    return cmd;
  }

  // -------------------------------------------------------------------------
  // PLANNER
  // -------------------------------------------------------------------------

  // Roll one candidate cart program from st0 through the REAL simulator.
  // cand is {law:true} (run the anchor law) or {vals:[NSEG]} (absolute cart
  // commands, one per plan segment). Returns the accumulated tip→cursor cost and
  // the per-segment mean command, which becomes a mutation seed next round.
  function simulate(pl, st0, cand, thSm0, wantPath) {
    const c = pl.config;
    const s = cloneState(st0);
    const thBox = { v: thSm0 };
    const cmd = new Array(pl.cmd.length).fill(0);
    const segMeans = new Array(c.NSEG).fill(0);
    const segCnt = new Array(c.NSEG).fill(0);
    const path = wantPath ? [] : null;
    let cost = 0;
    for (let i = 0; i < c.horizonSteps; i++) {
      const seg = Math.min(c.NSEG - 1, Math.floor(i / c.segSteps));
      const c0 = cand.law ? trackLaw(c, s) : cand.vals[seg];
      const tc = pl.nTele ? teleLaw(c, s, thBox, 0) : 0;
      cmd[0] = c0;
      for (let j = 0; j < pl.nJoints; j++) cmd[1 + j] = 0;
      for (let k = 0; k < pl.nTele; k++) cmd[pl.teleOffset + k] = tc;
      s.lastCmd = c0; s.lastCmds = cmd;
      BF.physics.step(s.world, DT, c0);
      pl.setup.tick(s, DT);
      const tip = s.world.nodes[s.tipIdx], tgt = s.chainReach.target;
      cost += Math.hypot(tip.x - tgt.x, tip.y - tgt.y);
      segMeans[seg] += c0; segCnt[seg]++;
      if (path && i % 4 === 0) path.push({ x: tip.x, y: tip.y, tx: tgt.x, ty: tgt.y });
    }
    for (let k = 0; k < c.NSEG; k++) segMeans[k] = segCnt[k] ? segMeans[k] / segCnt[k] : 0;
    pl.lastSims++;
    return { cost, seq: segMeans, path };
  }

  // Deterministic LCG. This is a search over action sequences, so the "noise"
  // must be reproducible run-to-run or the same world gives different plans.
  function rnd(pl) {
    pl.rng = (pl.rng * 1664525 + 1013904223) >>> 0;
    return pl.rng / 4294967296;
  }

  function mutate(pl, base, amp, m) {
    const c = pl.config;
    // 'mixed': odd draws RESET a single segment to a fresh random command
    // instead of jittering all of them. Pure jitter only ever explores a ball
    // around the seed; the resets are what find a qualitatively different swing.
    if (c.mutMode === 'mixed' && m % 2 === 1) {
      const vals = base.slice();
      vals[(m >> 1) % c.NSEG] = Math.max(-1, Math.min(1, rnd(pl) * 2 - 1));
      return { vals };
    }
    return { vals: base.map(v => Math.max(-1, Math.min(1, v + (rnd(pl) * 2 - 1) * amp))) };
  }

  function replan(pl, state) {
    const c = pl.config;
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    pl.lastSims = 0;
    const budget = c.simBudget > 0 ? c.simBudget : Infinity;

    const lawSim = simulate(pl, state, { law: true }, pl.thSm.v, false);
    let best = { cost: lawSim.cost, cand: { law: true } };

    const cands = [];
    if (pl.prevVals) {
      // Shift the previous plan forward by the replan interval. At the shipped
      // cadence (replan 6 << segSteps 48) this is the identity — it is here so
      // coarser cadences stay warm-started rather than re-searching from scratch.
      const shift = c.replan / c.segSteps;
      const sh = [];
      for (let k = 0; k < c.NSEG; k++) sh.push(pl.prevVals[Math.min(c.NSEG - 1, Math.floor(k + shift))]);
      cands.push({ vals: sh });
    }
    const seeds = pl.prevVals ? [pl.prevVals, lawSim.seq] : [lawSim.seq];
    for (let m = 0; m < c.nMutCoarse; m++) cands.push(mutate(pl, seeds[m % seeds.length], c.ampCoarse, m));
    for (let i = 0; i < cands.length && pl.lastSims < budget; i++) {
      const r = simulate(pl, state, cands[i], pl.thSm.v, false);
      if (r.cost < best.cost) best = { cost: r.cost, cand: cands[i] };
    }

    // Fine round: jitter every segment around the winner (even m → all-segment
    // jitter, so the fine pass refines rather than re-randomizing).
    const fineBase = best.cand.law ? lawSim.seq : best.cand.vals;
    for (let m = 0; m < c.nMutFine && pl.lastSims < budget; m++) {
      const cand = mutate(pl, fineBase, c.ampFine, m * 2);
      const r = simulate(pl, state, cand, pl.thSm.v, false);
      if (r.cost < best.cost) best = { cost: r.cost, cand: cand };
    }

    if (best.cand.law) { pl.execVals = null; pl.prevVals = lawSim.seq; }
    else { pl.execVals = best.cand.vals; pl.prevVals = best.cand.vals; }
    pl.stepInPlan = 0;
    pl.planCount++;
    pl.bestCost = best.cost;
    pl.lawCost = lawSim.cost;
    if (c.viz) {
      // "How the planner decides": the tip path it BELIEVES the chosen program
      // produces, next to the cursor path over the same horizon. Costs one extra
      // rollout and consumes no randomness, so it cannot perturb the plan.
      const v = simulate(pl, state, best.cand, pl.thSm.v, true);
      pl.lastViz = { path: v.path, horizonS: c.H, bestCost: best.cost, lawCost: lawSim.cost,
                     usingLaw: !!best.cand.law, plan: pl.execVals ? pl.execVals.slice() : null };
    }
    pl.lastPlanMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
  }

  function plannerStep(pl, state) {
    const c = pl.config;
    if (pl.stepInPlan >= c.replan) replan(pl, state);
    const segNow = Math.min(c.NSEG - 1, Math.floor(pl.stepInPlan / c.segSteps));
    const cart = pl.execVals == null ? trackLaw(c, state) : pl.execVals[segNow];
    const tele = pl.nTele ? teleLaw(c, state, pl.thSm, 0) : 0;
    pl.stepInPlan++;
    return writeCmd(pl, cart, tele);
  }

  // -------------------------------------------------------------------------
  // FEEDBACK (zero-lookahead baseline)
  // -------------------------------------------------------------------------
  function feedbackStep(pl, state) {
    const c = pl.config;
    const w = state.world;
    const cart = w.nodes[state.cartIdx];
    const tip = w.nodes[state.tipIdx];
    const tCur = state.chainTrace.traceTime;
    const p = curveAt(state, tCur + c.lead);

    const dx = tip.x - cart.x, dy = tip.y - cart.y;
    const r = Math.hypot(dx, dy) || 1;
    const th = Math.atan2(dx, dy);
    const sth = Math.sin(th), cth = Math.cos(th);
    const om = ((tip.vx - cart.vx) * cth - (tip.vy - cart.vy) * sth) / r;

    pl.thSm.v += (th - pl.thSm.v) * Math.min(1, DT / c.thTau);
    const thU = Math.max(-c.thCap, Math.min(c.thCap, pl.thSm.v));

    // Telescope: same closed-form radius inversion as the planner, minus the
    // lead term (this law is the deliberately un-tuned comparison point).
    const rCmd = Math.max(c.RMIN, Math.min(c.RMAX, p.y / Math.max(0.17, Math.cos(thU)) - c.sag));
    const perSeg = rCmd / 4;
    const tele = perSeg >= 80 ? (perSeg - 80) / 48 : (perSeg - 80) / 40;

    let xDes = p.x;
    if (xDes > c.xCap) xDes = c.xCap; if (xDes < -c.xCap) xDes = -c.xCap;

    // Cursor-velocity feedforward, low-passed (the raw numeric derivative steps
    // at polygon corners and kicks the cart).
    const p2 = curveAt(state, tCur + c.lead + 0.1);
    let ff = (p2.x - p.x) / 0.1;
    if (pl.prevFF == null) pl.prevFF = ff;
    ff = pl.prevFF + (ff - pl.prevFF) * c.ffSmooth; pl.prevFF = ff;
    if (ff > c.ffCap) ff = c.ffCap; if (ff < -c.ffCap) ff = -c.ffCap;

    // Swing damper: the cart chases the tip's angular rate projected on x, which
    // bleeds the pendulum mode instead of exciting it. Worth ~10 px on figure-8.
    let vCmd = c.kx * (xDes - cart.x) + ff;
    if (c.kd > 0) vCmd += -c.kd * om * cth;

    const cmd = writeCmd(pl, vCmd / 600, tele);

    // Joints: damped-least-squares integrator on the residual tip error. With
    // ~1-4.5 deg of static authority this cannot track, but it can trim.
    if (c.joints && pl.nJoints) {
      const ex = p.x - tip.x, ey = p.y - tip.y;
      const JA = w.jointActuators;
      let a11 = c.lambda * c.lambda, a12 = 0, a22 = c.lambda * c.lambda;
      const cols = [];
      for (let j = 0; j < JA.length; j++) {
        const b = w.nodes[JA[j].b];
        const c0 = -(tip.y - b.y), c1 = tip.x - b.x;   // ∂tip/∂θ_j about node b
        cols.push([c0, c1]);
        a11 += c0 * c0; a12 += c0 * c1; a22 += c1 * c1;
      }
      const det = a11 * a22 - a12 * a12 || 1;
      const y1 = (a22 * ex - a12 * ey) / det;
      const y2 = (-a12 * ex + a11 * ey) / det;
      for (let j = 0; j < JA.length; j++) {
        const dq = cols[j][0] * y1 + cols[j][1] * y2;
        pl.jointT[j] += c.kJ * dq * DT;
        const lo = pl.restA[j] - JOINT_RANGE, hi = pl.restA[j] + JOINT_RANGE;
        if (pl.jointT[j] < lo) pl.jointT[j] = lo;
        if (pl.jointT[j] > hi) pl.jointT[j] = hi;
        cmd[1 + j] = clamp1((pl.jointT[j] - pl.restA[j]) / JOINT_RANGE);
      }
    }
    return cmd;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  function create(opts) {
    opts = opts || {};
    const kind = opts.kind === 'feedback' ? 'feedback' : 'planner';
    const c = Object.assign({}, kind === 'feedback' ? FEEDBACK_DEFAULTS : PLANNER_DEFAULTS, opts);
    c.kind = kind;
    if (kind === 'planner') {
      c.horizonSteps = Math.round(c.H / DT);
      c.segSteps = Math.ceil(c.horizonSteps / c.NSEG);
    }
    return { kind, config: c, state: null, cmd: [0] };
  }

  // Fills and returns this planner's action buffer for the CURRENT step.
  // Length = 1 cart + numActuatedJoints + numSegments telescope commands (8 in
  // the standard signing config).
  function command(pl, state) {
    if (!state || !state.chainTrace || state.tipIdx == null) return pl.cmd;
    bind(pl, state);
    return pl.kind === 'feedback' ? feedbackStep(pl, state) : plannerStep(pl, state);
  }

  // Adapter for the app's display loop. Ignores the observation vector: this is
  // model-based, it reads the LIVE world through getState() (same contract as
  // dodgePlanner.makePolicy).
  function makePolicy(getState, opts) {
    const pl = create(opts);
    return {
      isPlanner: true,
      planner: pl,          // pl.lastViz / pl.lastPlanMs for the HUD
      command() {
        return command(pl, getState())[0];
      },
      commandAll(obs, out) {
        const cmd = command(pl, getState());
        const n = out ? out.length : cmd.length;
        for (let i = 0; i < n; i++) out[i] = i < cmd.length ? cmd[i] : 0;
        return out;
      },
    };
  }

  BF.chainTracePlanner = { create, command, makePolicy, cloneState, DEFAULTS };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
