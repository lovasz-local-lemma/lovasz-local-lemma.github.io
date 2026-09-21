// diffsim_trajopt.js — swing-up by DIRECT TRAJECTORY OPTIMIZATION through the
// differentiable simulator, the same architecture the real double/triple-
// pendulum showcases use: compute an open-loop optimal trajectory offline
// (here: gradient descent on the control SEQUENCE, not on policy weights),
// then hand over to LQR at the top to catch and hold indefinitely.
//
// Why this instead of a neural policy: a feedback policy trained on an
// uprightness loss must DISCOVER the multi-swing pumping motion through policy
// space — five optimizer variants all failed past ~40 deg. Optimizing the
// action sequence directly makes the pumping motion an explicit decision
// variable per timestep; the exact gradient through the simulator then shapes
// the whole swing. This is direct single shooting; the classic offline half of
// Astrom-Furuta / trajectory-optimization control stacks.
//
//   create(opts)              -> t (optimizer state; control params p[N])
//   iterate(t, n)             -> {iter, loss, termUp, best} run n Adam steps
//   replay(t, {lqr, holdS})   -> {frames, catchAtS, holdMeanUp, termUp}
//                                rollout of the BEST sequence; if opts.lqr (a
//                                BF.diffsimLqr.design result) is given, switch
//                                to LQR when the catch basin is entered and
//                                keep simulating for holdS seconds.
//   gradTrace(t)              -> {adjoint[], gradNorm} dLoss/du_h per control
//                                step from the last iterate (BPTT viz).
//
// Requires BF.diffSim (autodiff sim); BF.diffsimLqr only used by the caller.

(function (BF) {
  'use strict';
  if (!BF || !BF.diffSim) return;
  const D = BF.diffSim;
  const D2R = Math.PI / 180;

  const DEFAULTS = {
    numSeg: 2, segLen: 80, stiffness: 8000, damping: 2.0, gravity: 700,
    physDt: 1 / 240, controlDt: 1 / 60,
    horizonS: 3.5,            // swing-up window the sequence spans
    cartAccel: 5000,          // control authority; u = cartAccel * tanh(p_h)
    railHalf: 185, wallK: 500,
    startTiltDeg: 180,        // hang straight down
    lr: 0.025, beta1: 0.9, beta2: 0.999, eps: 1e-8, gradClip: 1e3,
    // Loss weights: energy shaping teaches the pumping; the terminal window
    // (last termWindowS) demands "upright, slow, centered" so the LQR can catch.
    // The energy error is tanh-saturated before squaring: violent swings ring
    // the stiff springs and blow E to ~90x target, which otherwise dwarfs every
    // other term and makes Adam bounce chaotically (observed in the probe).
    // wCart terminal centering is STRONG (cart normalized by termXs=110): the
    // first working solution parked upright pressed against the rail wall at
    // x=-186, which the LQR (no wall in its model) cannot hold.
    wEnergy: 0.8, wTerm: 6, termWindowS: 0.6, wVel: 2e-4, wCart: 1.2, termXs: 110, wEffort: 1e-4,
    // Pass-through catchability bonus: exp(-(distance to the LQR catch basin)/
    // catchSoft) over the trajectory's second half. Softened (catchSoft 3) so it
    // GUIDES from afar — a bare exp(-dist) is ~4.5e-4 even one step outside the
    // basin (sparse-reward starvation; observed: optimization went nowhere).
    // The dense terminal window remains the primary shaping signal.
    wCatch: 2, catchSoft: 3, catchVelScale: 250, catchXScale: 90, catchVxScale: 160,
    // Sinusoidal pump initialization near the hanging chain's natural rhythm —
    // a random or zero init tends to park in a "hang still" local optimum.
    initPumpHz: 0.35, initPumpAmp: 1.0,
    seed: 20260713,
  };

  function create(opts) {
    const c = Object.assign({}, DEFAULTS, opts || {});
    c.stepsPerControl = Math.round(c.controlDt / c.physDt);
    c.N = Math.round(c.horizonS / c.controlDt);
    c.termSteps = Math.max(1, Math.round(c.termWindowS / c.controlDt));
    let seed = (c.seed >>> 0) || 1;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0x100000000) * 2 - 1; };
    // Control parameters: u_h = cartAccel * tanh(p_h). Pump init + tiny noise.
    const p = [];
    for (let h = 0; h < c.N; h++) {
      const tSec = h * c.controlDt;
      const ramp = Math.min(1, tSec / (c.horizonS * 0.5));
      p.push(D.v(c.initPumpAmp * ramp * Math.sin(2 * Math.PI * c.initPumpHz * tSec) + rand() * 0.05));
    }
    return {
      config: c, p,
      m: new Array(c.N).fill(0), v: new Array(c.N).fill(0),
      iter: 0, lastLoss: NaN, lastTermUp: -Infinity,
      bestTermUp: -Infinity, bestP: p.map(x => x.val),
      lastGrad: new Array(c.N).fill(0),
    };
  }

  function buildWorld(c) {
    const w = D.makeMassSpringWorld({ numNodes: 1 + c.numSeg, gravity: c.gravity, damping: c.damping });
    w.pinned[0] = 1; w.x[0] = D.v(0); w.y[0] = D.v(0);
    let px = 0, py = 0; const tilt = c.startTiltDeg * D2R;
    for (let s = 0; s < c.numSeg; s++) {
      px += Math.sin(tilt) * c.segLen; py -= Math.cos(tilt) * c.segLen;
      w.x[s + 1] = D.v(px); w.y[s + 1] = D.v(py);
      w.vx[s + 1] = D.v(0); w.vy[s + 1] = D.v(0); w.mass[s + 1] = 1.0;
    }
    for (let s = 0; s < c.numSeg; s++) D.addSpring(w, s, s + 1, { restLen: c.segLen, k: c.stiffness });
    return w;
  }
  function segUp(w, a, b, L) {
    return { u1: D.div(D.neg(D.sub(w.y[1], w.y[0])), D.v(L)), u2: D.div(D.neg(D.sub(w.y[2], w.y[1])), D.v(L)) };
  }

  // One differentiable rollout of the CURRENT sequence. Returns {loss, termUp}.
  function rollout(t) {
    const c = t.config, p = t.p;
    const eDes = 3 * c.gravity * c.segLen;
    const w = buildWorld(c);
    const accelV = D.v(c.cartAccel), dtV = D.v(c.physDt);
    const railV = D.v(c.railHalf), wallKV = D.v(c.wallK);
    const eW = D.v(c.wEnergy * c.controlDt), eDesV = D.v(eDes);
    const termW = D.v(c.wTerm * c.controlDt), velW = D.v(c.wVel * c.controlDt);
    const cartW = D.v(c.wCart * c.controlDt), effW = D.v(c.wEffort * c.controlDt);
    const catchW = D.v(c.wCatch * c.controlDt);
    const xs = D.v(240), one = D.v(1);
    const cvs2 = c.catchVelScale * c.catchVelScale;
    let cartX = D.v(0), cartVx = D.v(0), loss = D.v(0);
    let termUpSum = 0, termN = 0, catchMax = 0;
    const termStart = c.N - c.termSteps, catchStart = c.N >> 1;
    for (let h = 0; h < c.N; h++) {
      const uNorm = D.tanh(p[h]);
      const accel = D.mul(uNorm, accelV);
      for (let s = 0; s < c.stepsPerControl; s++) {
        const overR = D.relu(D.sub(cartX, railV));
        const overL = D.relu(D.sub(D.neg(cartX), railV));
        const a = D.add(accel, D.mul(wallKV, D.sub(overL, overR)));
        cartVx = D.add(cartVx, D.mul(a, dtV)); cartX = D.add(cartX, D.mul(cartVx, dtV));
        w.x[0] = cartX; w.y[0] = D.v(0);
        D.step(w, c.physDt);
      }
      // Energy shaping (whole trajectory): E = KE + PE of the links.
      let ke = D.add(D.sqr(w.vx[1]), D.sqr(w.vy[1]));
      ke = D.add(ke, D.add(D.sqr(w.vx[2]), D.sqr(w.vy[2])));
      const pe = D.mul(D.v(-c.gravity), D.add(w.y[1], w.y[2]));
      const eErr = D.div(D.sub(D.add(D.mul(ke, D.v(0.5)), pe), eDesV), eDesV);
      // Soft saturation (x0.6 inside tanh): bounds the violent-swing spikes
      // without flattening the pumping gradient at hang (eErr=-2 keeps ~40% of
      // its slope vs ~7% with a bare tanh).
      loss = D.add(loss, D.mul(D.sqr(D.tanh(D.mul(eErr, D.v(0.6)))), eW));
      loss = D.add(loss, D.mul(D.sqr(uNorm), effW));
      const su = segUp(w, 0, 1, c.segLen);
      // Pass-through catchability (second half): reward ANY slow, centered,
      // upright moment. exp(-dist) is bounded (0,1] and focuses credit sharply
      // on near-basin passes.
      if (c.wCatch > 0 && h >= catchStart) {
        const upDef = D.add(D.sub(one, su.u1), D.sub(one, su.u2));
        let v2 = D.add(D.sqr(w.vx[1]), D.sqr(w.vy[1]));
        v2 = D.add(v2, D.add(D.sqr(w.vx[2]), D.sqr(w.vy[2])));
        const dist = D.add(
          D.add(D.mul(upDef, D.v(3)), D.div(v2, D.v(cvs2))),
          D.add(D.sqr(D.div(cartX, D.v(c.catchXScale))), D.sqr(D.div(cartVx, D.v(c.catchVxScale)))));
        const score = D.exp(D.neg(D.div(dist, D.v(c.catchSoft))));
        loss = D.sub(loss, D.mul(score, catchW));
        if (score.val > catchMax) catchMax = score.val;
      }
      // Terminal window: upright + slow + centered (the LQR catch basin).
      if (h >= termStart) {
        loss = D.add(loss, D.mul(D.add(D.sub(one, su.u1), D.sub(one, su.u2)), termW));
        let v2 = D.add(D.sqr(w.vx[1]), D.sqr(w.vy[1]));
        v2 = D.add(v2, D.add(D.sqr(w.vx[2]), D.sqr(w.vy[2])));
        v2 = D.add(v2, D.sqr(cartVx));
        loss = D.add(loss, D.mul(v2, velW));
        loss = D.add(loss, D.mul(D.sqr(D.div(cartX, D.v(c.termXs))), cartW));
        termUpSum += (su.u1.val + su.u2.val) / 2; termN++;
      }
    }
    return { loss, termUp: termN ? termUpSum / termN : -1, catchMax };
  }

  function iterate(t, n) {
    const c = t.config, p = t.p;
    for (let k = 0; k < n; k++) {
      D.zeroGrad(p);
      const r = D.withTape(() => {
        const rr = rollout(t);
        D.backward(rr.loss);
        return { lossVal: rr.loss.val, termUp: rr.termUp, catchMax: rr.catchMax };
      });
      t.lastLoss = r.lossVal; t.lastTermUp = r.termUp; t.lastCatchMax = r.catchMax;
      for (let i = 0; i < c.N; i++) t.lastGrad[i] = Number.isFinite(p[i].grad) ? p[i].grad : 0;
      // Best sequence = dense terminal quality PLUS best basin pass — the dense
      // term keeps selection informative from the start, the catch term breaks
      // ties toward sequences the LQR can actually grab.
      const score = r.termUp + (c.wCatch > 0 ? r.catchMax : 0);
      if (score > t.bestTermUp) { t.bestTermUp = score; for (let i = 0; i < c.N; i++) t.bestP[i] = p[i].val; }
      t.iter++;
      const t1 = t.iter;
      for (let i = 0; i < c.N; i++) {
        let g = t.lastGrad[i];
        if (g > c.gradClip) g = c.gradClip; else if (g < -c.gradClip) g = -c.gradClip;
        t.m[i] = c.beta1 * t.m[i] + (1 - c.beta1) * g;
        t.v[i] = c.beta2 * t.v[i] + (1 - c.beta2) * g * g;
        p[i].val -= c.lr * (t.m[i] / (1 - Math.pow(c.beta1, t1))) / (Math.sqrt(t.v[i] / (1 - Math.pow(c.beta2, t1))) + c.eps);
      }
    }
    return { iter: t.iter, loss: t.lastLoss, termUp: t.lastTermUp, best: t.bestTermUp };
  }

  // Replay the BEST sequence (numbers only). If o.lqr is a BF.diffsimLqr.design
  // result, hand control to LQR the moment the catch basin is entered (both
  // links >= catchUp upright and link speeds below catchVel), then keep
  // simulating for o.holdS seconds. Frames use the same {cx,n1,n2} shape as the
  // other diffsim engines (+y down).
  function replay(t, o) {
    o = o || {};
    const c = t.config, lqr = o.lqr || null;
    const holdS = o.holdS != null ? o.holdS : 6;
    const catchUp = o.catchUp != null ? o.catchUp : 0.92;
    const catchVel = o.catchVel != null ? o.catchVel : 260;
    // The LQR's model has no rail wall and a local linearization: only hand
    // over near center at low cart speed (diagnosed: catching pressed against
    // the wall at cart x=-186, vx=-225 fell instantly).
    const catchX = o.catchX != null ? o.catchX : 90;
    const catchVx = o.catchVx != null ? o.catchVx : 160;
    const totalS = c.horizonS + (lqr ? holdS : 0);
    const steps = Math.round(totalS / c.controlDt);
    const frames = [];
    let catchAtS = null, holdUpSum = 0, holdN = 0, termUpSum = 0, termN = 0;
    const termStart = c.N - c.termSteps;
    // Diagnostics: the closest approach to the catch gates during the sequence,
    // so a failed catch reports WHICH gate blocked it.
    let bestPass = null, bestPassKey = -Infinity;
    D.withTape(() => {
      const w = buildWorld(c);
      let cartX = 0, cartVx = 0;
      for (let h = 0; h < steps; h++) {
        let u;
        if (catchAtS == null && h < c.N) {
          u = c.cartAccel * Math.tanh(t.bestP[h]);
        } else if (catchAtS != null && lqr) {
          const fp = lqr.fp;
          const xdev = [cartX, cartVx,
            w.x[1].val - fp.x[1], w.y[1].val - fp.y[1], w.vx[1].val, w.vy[1].val,
            w.x[2].val - fp.x[2], w.y[2].val - fp.y[2], w.vx[2].val, w.vy[2].val];
          u = BF.diffsimLqr.controlU(lqr, xdev);
        } else {
          u = 0;   // sequence exhausted, no LQR -> free run
        }
        for (let s = 0; s < c.stepsPerControl; s++) {
          const overR = Math.max(0, cartX - c.railHalf), overL = Math.max(0, -cartX - c.railHalf);
          const a = u + c.wallK * (overL - overR);
          cartVx += a * c.physDt; cartX += cartVx * c.physDt;
          w.x[0] = D.v(cartX); w.y[0] = D.v(0);
          D.step(w, c.physDt);
        }
        const u1 = -(w.y[1].val - w.y[0].val) / c.segLen;
        const u2 = -(w.y[2].val - w.y[1].val) / c.segLen;
        frames.push({ cx: cartX, n1: { x: w.x[1].val, y: w.y[1].val }, n2: { x: w.x[2].val, y: w.y[2].val } });
        if (h >= termStart && h < c.N) { termUpSum += (u1 + u2) / 2; termN++; }
        if (catchAtS == null && h < c.N) {
          const sp = Math.hypot(w.vx[1].val, w.vy[1].val) + Math.hypot(w.vx[2].val, w.vy[2].val);
          const key = (u1 + u2) - sp / 500 - Math.abs(cartX) / 300;
          if (key > bestPassKey) {
            bestPassKey = key;
            bestPass = { t: h * c.controlDt, up1: u1, up2: u2, sp: sp, cartX: cartX, cartVx: cartVx };
          }
          if (lqr && u1 >= catchUp && u2 >= catchUp
              && Math.abs(cartX) < catchX && Math.abs(cartVx) < catchVx && sp < catchVel) {
            catchAtS = h * c.controlDt;
          }
        }
        if (catchAtS != null) { holdUpSum += (u1 + u2) / 2; holdN++; }
      }
    });
    return { frames,
             catchAtS,
             holdMeanUp: holdN ? holdUpSum / holdN : -1,
             termUp: termN ? termUpSum / termN : -1,
             bestPass };
  }

  function gradTrace(t) {
    let norm = 0;
    for (const g of t.lastGrad) norm += g * g;
    return { adjoint: t.lastGrad.slice(), gradNorm: Math.sqrt(norm), loss: t.lastLoss };
  }

  // Continuation step: change the problem (typically gravity) while KEEPING the
  // current control sequence as the warm start. Single shooting through the
  // chaotic double pendulum is basin-dominated — descending from a solution at
  // lower gravity deforms continuously to the harder problem, where a cold
  // start just bounces (probes: best stalls ~0.76 cold at g=700).
  function retarget(t, opts) {
    Object.assign(t.config, opts || {});
    t.m.fill(0); t.v.fill(0); t.iter = 0;
    t.bestTermUp = -Infinity;
    for (let i = 0; i < t.config.N; i++) t.bestP[i] = t.p[i].val;
    t.lastLoss = NaN; t.lastTermUp = -Infinity;
  }

  BF.diffsimTrajopt = { create, iterate, replay, gradTrace, retarget, DEFAULTS };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
