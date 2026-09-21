// diffsim_trainer.js — a reusable, incremental EXACT-GRADIENT trainer.
//
// Wraps the differentiable-simulator balance training (proven in
// double-balance-adam.js) behind a small stateful API the browser can drive a
// few iterations at a time (so the UI stays responsive and shows it learn), and
// that a headless probe can unit-test. It trains a feedback MLP to balance an
// inverted double pendulum by Adam backprop THROUGH BF.diffSim, then hands back
// a rollout trajectory of the current-best policy for the renderer to animate.
//
// Requires BF.diffSim (js/diff_simulator.js) loaded first.
//
// API (all on BF.diffsimTrainer):
//   create(opts) -> t          build a trainer (weights + Adam state + config)
//   trainIters(t, n) -> stats  run n Adam iterations; {iter, loss, meanUp, best}
//   trajectory(t, pertDeg, seconds) -> {frames, meanUp, target}
//                              roll the BEST policy out for `seconds` from a
//                              pertDeg tilt; frames = [{cx, n1:{x,y}, n2:{x,y}}]
//                              for the renderer (world units, +y = down).
//   exportBest(t) -> number[]  best weights as plain numbers (for save/transfer)

(function (BF) {
  'use strict';
  if (!BF || !BF.diffSim) return;   // diff_simulator.js must load first
  const D = BF.diffSim;
  const D2R = Math.PI / 180;

  const DEFAULTS = {
    numSeg: 2, segLen: 80, stiffness: 8000, damping: 2.0, gravity: 700,
    pertDeg: 3, horizonS: 1.5, physDt: 1 / 240, controlDt: 1 / 60,
    cartAccel: 1600, hidden: 8, lr: 2e-3, beta1: 0.9, beta2: 0.999, eps: 1e-8,
    wInit: 0.3, wCart: 0.03, gradClip: 1e4,
    // Soft rail wall. railHalf > 0 bounds the cart to +/-railHalf via a
    // differentiable spring (relu overshoot * wallK), so the policy can't
    // "balance" by drifting the cart off to infinity -- it must solve the
    // SAME bounded-track problem the display shows. 0 = unbounded (the old
    // behaviour; standalone probes keep it off, the app turns it on).
    railHalf: 0, wallK: 300,
    // Energy-shaping loss weight (0 = off). Adds sqr((E - E_upright)/E_upright)
    // per control step, where E = kinetic + potential of the two links. This is
    // the classic swing-up enabler (Astrom-Furuta): far from upright, a pure
    // "be upright" loss has no gradient toward the back-and-forth PUMPING that
    // builds energy -- the energy error does. Near upright E ~= E_des so the
    // term fades and the uprightness loss takes over.
    energyShapeW: 0,
    // Terminal weighting (0 = off = uniform). >0 ramps the uprightness loss
    // weight linearly from 1 at rollout start to 1+terminalW at the end, so
    // ENDING stabilized outweighs slowing the initial fall. Without it, a
    // "brake the fall but never catch it" policy scores nearly as well as a
    // true catch -- the local optimum the optimizer parks in.
    terminalW: 0,
    // Train over both tilt signs + two magnitudes -> symmetric, wide basin.
    trainPerts: [3, -3, 6, -6],
    // Random initial link-velocity kick magnitude (px/s) applied during
    // TRAINING only, so the policy learns to recover from states with motion
    // (a true stabilizer) rather than a fixed-start transient. 0 = rest starts.
    velKick: 0,
  };

  function create(opts) {
    const c = Object.assign({}, DEFAULTS, opts || {});
    c.stepsPerControl = Math.round(c.controlDt / c.physDt);
    c.horizon = Math.round(c.horizonS / c.controlDt);
    c.inputDim = 2 + 3 * c.numSeg + 1;   // cartx, cartvx, [sin,up,omega]xN, bias
    // Hoisted constant Vars (reused across rollouts; identity stays stable).
    const K = {
      dt: D.v(c.physDt), accel: D.v(c.cartAccel), xs: D.v(240), vxs: D.v(600),
      ws: D.v(8), one: D.v(1), stepw: D.v(c.physDt), cartw: D.v(c.wCart * c.physDt),
      rail: D.v(c.railHalf), wallK: D.v(c.wallK),
    };
    // Seeded param init (deterministic).
    let seed = (opts && opts.seed != null) ? (opts.seed >>> 0) : 20260712;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 0x100000000) * 2 - 1; };
    const W1 = []; for (let h = 0; h < c.hidden; h++) { W1[h] = []; for (let i = 0; i < c.inputDim; i++) W1[h][i] = D.v(rand() * c.wInit); }
    const b1 = []; for (let h = 0; h < c.hidden; h++) b1[h] = D.v(0);
    const W2 = [[]]; for (let h = 0; h < c.hidden; h++) W2[0][h] = D.v(rand() * c.wInit);
    const p = { W1, b1, W2, b2: [D.v(0)] };
    const flat = flatten(p, c);
    // Separate RNG for training velocity kicks (deterministic per seed).
    let kseed = ((seed ^ 0x9e3779b9) >>> 0) || 1;
    const krand = () => { kseed = (kseed * 1664525 + 1013904223) >>> 0; return (kseed / 0x100000000); };
    return {
      config: c, K, params: p, flat, krand,
      m: new Array(flat.length).fill(0), v: new Array(flat.length).fill(0),
      iter: 0, bestMeanUp: -Infinity, bestEndUp: -Infinity,
      bestFlat: new Array(flat.length).fill(0),
      lastLoss: NaN,
    };
  }

  function flatten(p, c) {
    const out = [];
    for (let h = 0; h < c.hidden; h++) for (let i = 0; i < c.inputDim; i++) out.push(p.W1[h][i]);
    for (let h = 0; h < c.hidden; h++) out.push(p.b1[h]);
    for (let h = 0; h < c.hidden; h++) out.push(p.W2[0][h]);
    out.push(p.b2[0]);
    return out;
  }

  // Inverted double-pendulum world, links UP (-y) with a pertDeg tilt. Optional
  // `kicks` = [{vx,vy}, ...] gives each link a small initial velocity so the
  // policy trains from states WITH MOTION (not just rest) -> it learns a true
  // state-feedback stabilizer that holds indefinitely, not a 1.5s transient.
  function buildWorld(c, pertDeg, kicks) {
    const w = D.makeMassSpringWorld({ numNodes: 1 + c.numSeg, gravity: c.gravity, damping: c.damping });
    w.pinned[0] = 1; w.x[0] = D.v(0); w.y[0] = D.v(0);
    let px = 0, py = 0; const tilt = pertDeg * D2R;
    for (let s = 0; s < c.numSeg; s++) {
      px += Math.sin(tilt) * c.segLen; py -= Math.cos(tilt) * c.segLen;
      w.x[s + 1] = D.v(px); w.y[s + 1] = D.v(py);
      const k = kicks && kicks[s];
      w.vx[s + 1] = D.v(k ? k.vx : 0); w.vy[s + 1] = D.v(k ? k.vy : 0); w.mass[s + 1] = 1.0;
    }
    for (let s = 0; s < c.numSeg; s++) D.addSpring(w, s, s + 1, { restLen: c.segLen, k: c.stiffness });
    return w;
  }
  function segUp(w, a, b) {
    const dx = D.sub(w.x[b], w.x[a]), dy = D.sub(w.y[b], w.y[a]);
    const len = D.sqrt(D.add(D.sqr(dx), D.sqr(dy)));
    return { up: D.div(D.neg(dy), len), sin: D.div(dx, len), dx, dy, len };
  }
  function buildObs(t, w, cartX, cartVx) {
    const c = t.config, K = t.K, out = new Array(c.inputDim);
    out[0] = D.div(cartX, K.xs); out[1] = D.div(cartVx, K.vxs);
    for (let s = 0; s < c.numSeg; s++) {
      const L = segUp(w, s, s + 1);
      const dvx = D.sub(w.vx[s + 1], w.vx[s]), dvy = D.sub(w.vy[s + 1], w.vy[s]);
      const omega = D.div(D.add(D.mul(D.neg(L.dy), dvx), D.mul(L.dx, dvy)), D.add(D.sqr(L.len), D.v(1e-6)));
      out[2 + s * 3] = L.sin; out[2 + s * 3 + 1] = L.up; out[2 + s * 3 + 2] = D.div(omega, K.ws);
    }
    out[c.inputDim - 1] = K.one;
    return out;
  }
  function mlp(t, obs) {
    const c = t.config, p = t.params, hid = new Array(c.hidden);
    for (let h = 0; h < c.hidden; h++) { let s = p.b1[h]; for (let i = 0; i < c.inputDim; i++) s = D.add(s, D.mul(p.W1[h][i], obs[i])); hid[h] = D.tanh(s); }
    let o = p.b2[0]; for (let h = 0; h < c.hidden; h++) o = D.add(o, D.mul(p.W2[0][h], hid[h]));
    return D.tanh(o);
  }
  // Soft rail wall acceleration (differentiable). relu(cartX - rail) past the
  // right wall pushes LEFT; relu(-cartX - rail) past the left wall pushes RIGHT;
  // zero inside [-rail, rail]. Only used when c.railHalf > 0 -- callers gate it,
  // because with rail = 0 this collapses to a global centering spring.
  function wallAccel(cartX, K) {
    const overR = D.relu(D.sub(cartX, K.rail));
    const overL = D.relu(D.sub(D.neg(cartX), K.rail));
    return D.mul(K.wallK, D.sub(overL, overR));
  }
  // Differentiable rollout: returns { loss(Var), meanUp(number) }.
  function rollout(t, pertDeg, kicks) {
    const c = t.config, K = t.K, w = buildWorld(c, pertDeg, kicks);
    const useWall = c.railHalf > 0;
    const useE = c.energyShapeW > 0;
    // Total mechanical energy at upright rest (masses 1, links at -L and -2L;
    // +y is down so PE = -g*y). Recomputed per rollout because the curriculum
    // mutates c.gravity between gens.
    const eDes = 3 * c.gravity * c.segLen;
    const eW = useE ? D.v(c.energyShapeW * c.controlDt) : null;
    const eDesV = useE ? D.v(eDes) : null;
    const useT = c.terminalW > 0;
    // End-window uprightness (last third of the rollout) — the curriculum's
    // gate metric. Whole-horizon meanUp includes the unavoidable fall transient
    // from the tilted start, so its ceiling decays with tilt (a perfect catch
    // from 44 deg averages ~0.79); the end window excludes the transient, so a
    // real catch scores ~0.95 at ANY tilt while a failed one scores ~0.4.
    const endStart = Math.floor(c.horizon * 2 / 3);
    let endUpSum = 0, endN = 0;
    let cartX = D.v(0), cartVx = D.v(0), loss = D.v(0), up = 0, n = 0;
    for (let h = 0; h < c.horizon; h++) {
      const accel = D.mul(mlp(t, buildObs(t, w, cartX, cartVx)), K.accel);
      // Late-rollout emphasis: weight this control step's uprightness loss by
      // 1..(1+terminalW) so the tail (holding) dominates the head (falling).
      const wq = useT ? D.v(1 + c.terminalW * (h / Math.max(1, c.horizon - 1))) : null;
      for (let s = 0; s < c.stepsPerControl; s++) {
        const a = useWall ? D.add(accel, wallAccel(cartX, K)) : accel;
        cartVx = D.add(cartVx, D.mul(a, K.dt)); cartX = D.add(cartX, D.mul(cartVx, K.dt));
        w.x[0] = cartX; w.y[0] = D.v(0);
        D.step(w, c.physDt);
        const u1 = segUp(w, 0, 1).up, u2 = segUp(w, 1, 2).up;
        let stepLoss = D.mul(D.add(D.sub(D.v(1), u1), D.sub(D.v(1), u2)), K.stepw);
        if (useT) stepLoss = D.mul(stepLoss, wq);
        loss = D.add(loss, stepLoss);
        loss = D.add(loss, D.mul(D.sqr(D.div(cartX, K.xs)), K.cartw));
        const uNow = (u1.val + u2.val) / 2;
        up += uNow; n++;
        if (h >= endStart) { endUpSum += uNow; endN++; }
      }
      if (useE) {
        // E = KE + PE of the two link nodes, once per control step.
        let ke = D.add(D.sqr(w.vx[1]), D.sqr(w.vy[1]));
        ke = D.add(ke, D.add(D.sqr(w.vx[2]), D.sqr(w.vy[2])));
        const pe = D.mul(D.v(-c.gravity), D.add(w.y[1], w.y[2]));
        const eErr = D.div(D.sub(D.add(D.mul(ke, D.v(0.5)), pe), eDesV), eDesV);
        loss = D.add(loss, D.mul(D.sqr(eErr), eW));
      }
    }
    return { loss, meanUp: n ? up / n : -1, endUp: endN ? endUpSum / endN : -1 };
  }

  function trainIters(t, n) {
    const c = t.config, flat = t.flat;
    let lastLoss = NaN, lastUp = NaN, lastEnd = NaN;
    for (let k = 0; k < n; k++) {
      D.zeroGrad(flat);
      const r = D.withTape(() => {
        let loss = null, up = 0, end = 0, cnt = 0;
        for (const pd of c.trainPerts) {
          // Random initial-velocity kick per link (training only) so the policy
          // learns to recover from moving states -> a sustained stabilizer.
          const vk = c.velKick;
          const kicks = vk > 0 ? [
            { vx: (t.krand() * 2 - 1) * vk, vy: (t.krand() * 2 - 1) * vk },
            { vx: (t.krand() * 2 - 1) * vk, vy: (t.krand() * 2 - 1) * vk },
          ] : null;
          const rr = rollout(t, pd, kicks);
          loss = loss == null ? rr.loss : D.add(loss, rr.loss); up += rr.meanUp; end += rr.endUp; cnt++;
        }
        const meanUp = up / cnt, endUp = end / cnt;
        D.backward(loss);
        return { lossVal: loss.val, meanUp, endUp };
      });
      lastLoss = r.lossVal; lastUp = r.meanUp; lastEnd = r.endUp;
      if (r.meanUp > t.bestMeanUp) t.bestMeanUp = r.meanUp;
      // bestFlat is keyed on the END-window metric (the curriculum gate + the
      // display policy): "ends stabilized" beats "fell slower on average".
      if (r.endUp > t.bestEndUp) { t.bestEndUp = r.endUp; for (let i = 0; i < flat.length; i++) t.bestFlat[i] = flat[i].val; }
      t.iter++;
      const t1 = t.iter;
      for (let i = 0; i < flat.length; i++) {
        let g = flat[i].grad; if (!Number.isFinite(g)) g = 0;
        if (g > c.gradClip) g = c.gradClip; else if (g < -c.gradClip) g = -c.gradClip;
        t.m[i] = c.beta1 * t.m[i] + (1 - c.beta1) * g;
        t.v[i] = c.beta2 * t.v[i] + (1 - c.beta2) * g * g;
        flat[i].val -= c.lr * (t.m[i] / (1 - Math.pow(c.beta1, t1))) / (Math.sqrt(t.v[i] / (1 - Math.pow(c.beta2, t1))) + c.eps);
      }
    }
    t.lastLoss = lastLoss;
    return { iter: t.iter, loss: lastLoss, meanUp: lastUp, endUp: lastEnd,
             best: t.bestMeanUp, bestEnd: t.bestEndUp };
  }

  // Roll the BEST-so-far policy out for `seconds` from a pertDeg tilt and return
  // per-control-step frames for the renderer. Runs inside one tape (discarded).
  function trajectory(t, pertDeg, seconds, useCurrent) {
    const c = t.config, K = t.K;
    // Roll out the BEST weights by default; useCurrent=true rolls out the LIVE
    // weights instead (the memetic mode displays an individual's current policy,
    // not its best-ever, which may be from an easier curriculum level).
    const cur = new Array(t.flat.length);
    if (!useCurrent) {
      for (let i = 0; i < t.flat.length; i++) { cur[i] = t.flat[i].val; t.flat[i].val = t.bestFlat[i]; }
    }
    const horizon = Math.round((seconds || c.horizonS) / c.controlDt);
    const frames = []; let upSum = 0, nUp = 0;
    const useWall = c.railHalf > 0;
    D.withTape(() => {
      const w = buildWorld(c, pertDeg);
      let cartX = D.v(0), cartVx = D.v(0);
      for (let h = 0; h < horizon; h++) {
        const accel = D.mul(mlp(t, buildObs(t, w, cartX, cartVx)), K.accel);
        for (let s = 0; s < c.stepsPerControl; s++) {
          const a = useWall ? D.add(accel, wallAccel(cartX, K)) : accel;
          cartVx = D.add(cartVx, D.mul(a, K.dt)); cartX = D.add(cartX, D.mul(cartVx, K.dt));
          w.x[0] = cartX; w.y[0] = D.v(0);
          D.step(w, c.physDt);
        }
        const u1 = segUp(w, 0, 1).up.val, u2 = segUp(w, 1, 2).up.val;
        upSum += (u1 + u2) / 2; nUp++;
        frames.push({ cx: w.x[0].val, n1: { x: w.x[1].val, y: w.y[1].val }, n2: { x: w.x[2].val, y: w.y[2].val } });
      }
    });
    // Restore the live (non-best) weights (only swapped when !useCurrent).
    if (!useCurrent) { for (let i = 0; i < t.flat.length; i++) t.flat[i].val = cur[i]; }
    return { frames, meanUp: nUp ? upSum / nUp : -1, target: { segLen: c.segLen } };
  }

  function exportBest(t) { return t.bestFlat.slice(); }
  // Weight snapshot / load for the memetic mode's GA operators (clone an elite,
  // mutate, write it into a non-elite). loadWeights(resetAdam) zeroes the Adam
  // moment estimates + iteration count so the fresh individual doesn't inherit
  // its predecessor's momentum.
  function snapshotWeights(t) { return t.flat.map(v => v.val); }
  function loadWeights(t, vals, resetAdam) {
    for (let i = 0; i < t.flat.length; i++) t.flat[i].val = vals[i];
    if (resetAdam) {
      for (let i = 0; i < t.m.length; i++) { t.m[i] = 0; t.v[i] = 0; }
      t.iter = 0; t.bestMeanUp = -Infinity; t.bestEndUp = -Infinity;
    }
  }

  // Gradient diagnostics for VISUALIZATION (grad-only — a grad-free optimizer
  // has none of this). Runs ONE rollout on the current weights, backprops, and
  // returns:
  //   adjoint[]     = dLoss/d(action_t) at each control step -- "which control
  //                   moments the gradient blames" (the signature diff-physics
  //                   view; you literally see backprop-through-time).
  //   weightGrads[] = dLoss/dw for every MLP weight (which weights are pushed).
  //   loss, gradNorm.
  // Read-only: does not touch the Adam state (m/v/iter) or bestFlat.
  function gradTrace(t) {
    const c = t.config, K = t.K, flat = t.flat;
    D.zeroGrad(flat);
    return D.withTape(() => {
      const w = buildWorld(c, c.pertDeg);
      let cartX = D.v(0), cartVx = D.v(0), loss = D.v(0);
      const actionVars = [];
      for (let h = 0; h < c.horizon; h++) {
        const u = mlp(t, buildObs(t, w, cartX, cartVx));
        actionVars.push(u);
        const accel = D.mul(u, K.accel);
        for (let s = 0; s < c.stepsPerControl; s++) {
          cartVx = D.add(cartVx, D.mul(accel, K.dt)); cartX = D.add(cartX, D.mul(cartVx, K.dt));
          w.x[0] = cartX; w.y[0] = D.v(0);
          D.step(w, c.physDt);
          const u1 = segUp(w, 0, 1).up, u2 = segUp(w, 1, 2).up;
          loss = D.add(loss, D.mul(D.add(D.sub(D.v(1), u1), D.sub(D.v(1), u2)), K.stepw));
          loss = D.add(loss, D.mul(D.sqr(D.div(cartX, K.xs)), K.cartw));
        }
      }
      D.backward(loss);
      const adjoint = actionVars.map((v) => (Number.isFinite(v.grad) ? v.grad : 0));
      const weightGrads = flat.map((v) => (Number.isFinite(v.grad) ? v.grad : 0));
      let gn = 0; for (const g of weightGrads) gn += g * g;
      return { loss: loss.val, adjoint, weightGrads, gradNorm: Math.sqrt(gn) };
    });
  }

  // Change the training horizon mid-run (for the horizon curriculum: find the
  // basin at a short horizon, then warm-start and lengthen so the policy learns
  // to hold LONGER -> a sustained stabilizer). meanUp is horizon-relative, so
  // reset the best tracker (and seed it with the CURRENT weights so we never
  // regress below the just-extended policy).
  function setHorizon(t, seconds) {
    t.config.horizonS = seconds;
    t.config.horizon = Math.round(seconds / t.config.controlDt);
    t.bestMeanUp = -Infinity;
    t.bestEndUp = -Infinity;
    for (let i = 0; i < t.flat.length; i++) t.bestFlat[i] = t.flat[i].val;
  }

  BF.diffsimTrainer = { create, trainIters, trajectory, gradTrace, exportBest,
                        snapshotWeights, loadWeights, setHorizon, DEFAULTS };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
