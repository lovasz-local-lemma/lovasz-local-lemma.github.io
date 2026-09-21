// diffsim_lqr.js — an ANALYTIC (LQR) balancer for the diff-sim double pendulum.
//
// The model-based counterpart to the neural diffsim_trainer: instead of a
// memoryless policy with a finite basin (~1.5-2s hold), this computes a provably
// asymptotically-stable state-feedback law u = -K·x that holds the inverted
// double pendulum upright INDEFINITELY near the equilibrium -- exactly how real
// multi-pendulum rigs do it. The linearization (A, B) is read straight out of
// the SAME differentiable simulator by finite-differencing its dynamics at the
// true fixed point, so the controller runs on the physics the demo renders.
//
// State = the FULL node state as a DEVIATION from the inverted fixed point:
//   [cartX, cartVx, dn1x, dn1y, dn1vx, dn1vy, dn2x, dn2y, dn2vx, dn2vy]
// (the reduced angle-only state loses the spring dynamics and LQR can't stabilize
// that projection; the full node state is a valid state-space model). u = cart
// acceleration; the cart is a double-integrator, the springs approximate rods.
//
// Requires BF.diffSim. API on BF.diffsimLqr:
//   design(opts) -> d           find the fixed point + linearize + solve DARE
//   trajectory(d, pertDeg, seconds) -> {frames, meanUp}
//   holdTest(d, pertDeg, seconds) -> {meanUp, fellAt, frames}

(function (BF) {
  'use strict';
  if (!BF || !BF.diffSim) return;
  const D = BF.diffSim;
  const N = 10;   // [cartX, cartVx, dn1x, dn1y, dn1vx, dn1vy, dn2x, dn2y, dn2vx, dn2vy]

  const DEFAULTS = {
    numSeg: 2, segLen: 80, stiffness: 8000, damping: 2.0, gravity: 700,
    physDt: 1 / 240, controlDt: 1 / 60, maxAccel: 6000,
    // Weights: penalize link positions (stay upright) hard, cart lightly, spring
    // velocities moderately; cheap control. Order matches the state vector.
    Q: [0.6, 0.1, 30, 30, 0.4, 0.4, 30, 30, 0.4, 0.4], R: 0.0006,
    dareIters: 2500,
  };

  // ---------- small dense matrix helpers (row-major number[][]) ----------
  function zeros(r, c) { const m = []; for (let i = 0; i < r; i++) m[i] = new Array(c).fill(0); return m; }
  function T(A) { const r = A.length, c = A[0].length, m = zeros(c, r); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) m[j][i] = A[i][j]; return m; }
  function mm(A, B) { const r = A.length, k = B.length, c = B[0].length, m = zeros(r, c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = 0; for (let t = 0; t < k; t++) s += A[i][t] * B[t][j]; m[i][j] = s; } return m; }
  function add(A, B) { const m = zeros(A.length, A[0].length); for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) m[i][j] = A[i][j] + B[i][j]; return m; }
  function sub(A, B) { const m = zeros(A.length, A[0].length); for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) m[i][j] = A[i][j] - B[i][j]; return m; }

  function buildWorld(c, snap) {
    const w = D.makeMassSpringWorld({ numNodes: 1 + c.numSeg, gravity: c.gravity, damping: c.damping });
    w.pinned[0] = 1;
    for (let i = 0; i < 1 + c.numSeg; i++) { w.x[i] = D.v(snap.x[i]); w.y[i] = D.v(snap.y[i]); w.vx[i] = D.v(snap.vx[i]); w.vy[i] = D.v(snap.vy[i]); w.mass[i] = 1; }
    for (let s = 0; s < c.numSeg; s++) D.addSpring(w, s, s + 1, { restLen: c.segLen, k: c.stiffness });
    return w;
  }
  // geometric upright snapshot (rest-length springs), used to seed the fixed point.
  function uprightSnap(c) {
    return { x: [0, 0, 0], y: [0, -c.segLen, -2 * c.segLen], vx: [0, 0, 0], vy: [0, 0, 0] };
  }
  function accelMag(c, snap) {
    let mag = 0;
    D.withTape(() => {
      const s0 = { x: snap.x.slice(), y: snap.y.slice(), vx: [0, 0, 0], vy: [0, 0, 0] };
      const w = buildWorld(c, s0); w.x[0] = D.v(s0.x[0]); w.y[0] = D.v(0); D.step(w, c.physDt);
      for (let i = 1; i < 3; i++) mag += w.vx[i].val * w.vx[i].val + w.vy[i].val * w.vy[i].val;
    });
    return mag;
  }
  function findFixedPoint(c) {
    let snap = uprightSnap(c), step = 0.4, best = accelMag(c, snap);
    for (let it = 0; it < 300; it++) {
      let improved = false;
      for (const idx of [1, 2]) for (const coord of ['y', 'x']) for (const dir of [step, -step]) {
        const s2 = { x: snap.x.slice(), y: snap.y.slice(), vx: [0, 0, 0], vy: [0, 0, 0] };
        s2[coord][idx] += dir;
        const m = accelMag(c, s2);
        if (m < best) { snap = s2; best = m; improved = true; }
      }
      if (!improved) { step *= 0.5; if (step < 1e-5) break; }
    }
    return snap;
  }

  // full-state deviation <-> full node snapshot (fixedSnap is the reference).
  function snapFromState(fp, x) {
    return {
      x: [x[0], fp.x[1] + x[2], fp.x[2] + x[6]],
      y: [0, fp.y[1] + x[3], fp.y[2] + x[7]],
      vx: [x[1], x[4], x[8]],
      vy: [0, x[5], x[9]],
    };
  }
  function stateFromWorld(fp, w, cartX, cartVx) {
    return [cartX, cartVx,
      w.x[1].val - fp.x[1], w.y[1].val - fp.y[1], w.vx[1].val, w.vy[1].val,
      w.x[2].val - fp.x[2], w.y[2].val - fp.y[2], w.vx[2].val, w.vy[2].val];
  }
  // one control step from full-state x with control u -> { x2, snap }
  function stepControl(c, fp, x, u) {
    let cartX = x[0], cartVx = x[1], w = null;
    const startSnap = snapFromState(fp, x);
    D.withTape(() => {
      w = buildWorld(c, startSnap);
      const dt = c.physDt, sp = Math.round(c.controlDt / c.physDt);
      for (let s = 0; s < sp; s++) { cartVx += u * dt; cartX += cartVx * dt; w.x[0] = D.v(cartX); w.y[0] = D.v(0); D.step(w, dt); }
    });
    return { x2: stateFromWorld(fp, w, cartX, cartVx),
             snap: { x: [w.x[0].val, w.x[1].val, w.x[2].val], y: [w.y[0].val, w.y[1].val, w.y[2].val],
                     vx: [w.vx[0].val, w.vx[1].val, w.vx[2].val], vy: [w.vy[0].val, w.vy[1].val, w.vy[2].val] } };
  }

  function linearize(c, fp) {
    const A = zeros(N, N), B = zeros(N, 1);
    const eps = [1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3];
    const x0 = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      const xp = x0.slice(); xp[j] += eps[j];
      const xm = x0.slice(); xm[j] -= eps[j];
      const fp2 = stepControl(c, fp, xp, 0).x2, fm2 = stepControl(c, fp, xm, 0).x2;
      for (let i = 0; i < N; i++) A[i][j] = (fp2[i] - fm2[i]) / (2 * eps[j]);
    }
    const eu = 50;
    const fpU = stepControl(c, fp, x0, eu).x2, fmU = stepControl(c, fp, x0, -eu).x2;
    for (let i = 0; i < N; i++) B[i][0] = (fpU[i] - fmU[i]) / (2 * eu);
    return { A, B };
  }

  function solveDARE(A, B, Qdiag, R, iters) {
    const Q = zeros(N, N); for (let i = 0; i < N; i++) Q[i][i] = Qdiag[i];
    const At = T(A), Bt = T(B);
    let P = Q.map((r) => r.slice());
    for (let it = 0; it < iters; it++) {
      const AtP = mm(At, P), AtPA = mm(AtP, A), AtPB = mm(AtP, B), BtP = mm(Bt, P);
      const BtPB = mm(BtP, B)[0][0] + R, BtPA = mm(BtP, A);
      const corr = zeros(N, N);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) corr[i][j] = AtPB[i][0] * (1 / BtPB) * BtPA[0][j];
      const Pn = add(sub(AtPA, corr), Q);
      let d = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) d += Math.abs(Pn[i][j] - P[i][j]);
      P = Pn; if (d < 1e-7) break;
    }
    const BtP = mm(Bt, P), BtPB = mm(BtP, B)[0][0] + R, BtPA = mm(BtP, A);
    return BtPA[0].map((v) => v / BtPB);
  }

  function design(opts) {
    const c = Object.assign({}, DEFAULTS, opts || {});
    const fp = findFixedPoint(c);
    const { A, B } = linearize(c, fp);
    const K = solveDARE(A, B, c.Q, c.R, c.dareIters);
    return { config: c, A, B, K, fp };
  }
  function controlU(d, x) {
    let u = 0; for (let i = 0; i < N; i++) u -= d.K[i] * x[i];
    const m = d.config.maxAccel; return u > m ? m : u < -m ? -m : u;
  }
  // initial full-state deviation for a pertDeg tilt of both links.
  function initState(c, pertDeg) {
    const L = c.segLen, a = pertDeg * Math.PI / 180, a2 = a * 0.5;
    const n1x = L * Math.sin(a), n1y = -L * Math.cos(a);
    const n2x = n1x + L * Math.sin(a2), n2y = n1y - L * Math.cos(a2);
    // deviation from geometric upright (fp is ~geometric so this is ~ the tilt)
    return [0, 0, n1x - 0, n1y + L, 0, 0, n2x - 0, n2y + 2 * L, 0, 0];
  }
  function trajectory(d, pertDeg, seconds) {
    const c = d.config, horizon = Math.round((seconds || 4) / c.controlDt);
    let x = initState(c, pertDeg);
    const frames = []; let upSum = 0, n = 0;
    for (let h = 0; h < horizon; h++) {
      const u = controlU(d, x);
      const r = stepControl(c, d.fp, x, u); x = r.x2;
      const s = r.snap;
      frames.push({ cx: s.x[0], n1: { x: s.x[1], y: s.y[1] }, n2: { x: s.x[2], y: s.y[2] } });
      const up1 = -s.y[1] / c.segLen, up2 = -(s.y[2] - s.y[1]) / c.segLen;
      upSum += (up1 + up2) / 2; n++;
      if (!Number.isFinite(x[0]) || Math.abs(x[0]) > 5000) break;
    }
    return { frames, meanUp: n ? upSum / n : -1 };
  }
  function holdTest(d, pertDeg, seconds) {
    const tr = trajectory(d, pertDeg, seconds);
    let fellAt = null;
    for (let i = 0; i < tr.frames.length; i++) { if (tr.frames[i].n2.y > -40) { fellAt = i * d.config.controlDt; break; } }
    return { meanUp: tr.meanUp, fellAt, frames: tr.frames.length };
  }

  BF.diffsimLqr = { design, controlU, trajectory, holdTest, DEFAULTS };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
