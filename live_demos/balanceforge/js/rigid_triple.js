// Rigid TRIPLE pendulum on a driven cart — minimal coordinates, exact dynamics.
// A simplified triple-pendulum control benchmark, motivated by Glück et al.
// (Automatica 49(3), 2013), not a reproduction of their apparatus or solver.
// In this codebase's driven-pivot convention the cart is a
// kinematically driven pivot (control = cart ACCELERATION, no cart force/mass
// row), so the joint-space solve is a symmetric 3x3, not 4x4.
//
// State s = [cx, cvx, p1, p2, p3, w1, w2, w3], angles measured from the DOWN
// vertical (p = PI is upright), equal unit point masses at the link ends,
// equal link lengths L = segLen. Mirrors js/rigid_double.js exactly — same
// ops-injection pattern (ONE EoM implementation shared by the numeric path
// and the autodiff tape), same LQR recipe (FD linearization + DARE value
// iteration + wrapped deviation coords), same verified-catch + multi-start
// trajopt — so BF.rigidTriple is a drop-in RD for the diffsim facade.
//
// EoM (per unit mass; n_j = masses at-or-beyond link j = [3,2,1]):
//   sum_k n_max(j,k) L cos(p_j - p_k) * a_k
//     = - sum_k n_max(j,k) L sin(p_j - p_k) * w_k^2  - n_j (g sin p_j + a cos p_j)
// Dividing by L gives the M~ a = b~ system solved below. The double's
// hand-derived rigidAccel is the 2-link specialization of the same formula
// (verified term-by-term); the triple is additionally validated by the
// energy-conservation + Verlet cross-check probe (rigid-triple-probe.js).
(function () {
  const BF = (window.BF = window.BF || {});
  const PI = Math.PI;

  function defaults() {
    return { segLen: 80, physDt: 1 / 240, substeps: 4, railHalf: 150, wallK: 500, maxAccel: 6000 };
  }

  // Plain-number ops table mirroring BF.diffSim's Var ops — the shared EoM is
  // written against `o`, so numeric and autodiff paths use identical math.
  const P = {
    add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b,
    div: (a, b) => a / b, neg: (a) => -a, sin: Math.sin, cos: Math.cos,
    sqr: (a) => a * a, v: (a) => a,
  };

  // Joint angular accelerations [a1,a2,a3] via the symmetric-3x3 adjugate
  // solve (closed form keeps the autodiff tape small, like the double's
  // pre-inverted 2x2).
  function tripleAccel(o, p1, p2, p3, w1, w2, w3, a, g, L) {
    const { add, sub, mul, div, neg, sin, cos, sqr, v } = o;
    const d12 = sub(p1, p2), d13 = sub(p1, p3), d23 = sub(p2, p3);
    const c12 = cos(d12), c13 = cos(d13), c23 = cos(d23);
    const s12 = sin(d12), s13 = sin(d13), s23 = sin(d23);
    // M~ (divided by L): [[3, 2c12, c13], [2c12, 2, c23], [c13, c23, 1]]
    const m11 = v(3), m12 = mul(v(2), c12), m13 = c13;
    const m22 = v(2), m23 = c23, m33 = v(1);
    // b~ = b / L. NB: `a` may be a live autodiff Var (the control) — pass it
    // through raw; only true constants get wrapped in v().
    const gL = div(v(g), v(L)), aL = div(a, v(L));
    const f1 = add(mul(gL, sin(p1)), mul(aL, cos(p1)));   // (g sin + a cos)/L per link
    const f2 = add(mul(gL, sin(p2)), mul(aL, cos(p2)));
    const f3 = add(mul(gL, sin(p3)), mul(aL, cos(p3)));
    const b1 = sub(neg(add(mul(mul(v(2), s12), sqr(w2)), mul(s13, sqr(w3)))), mul(v(3), f1));
    const b2 = sub(sub(mul(mul(v(2), s12), sqr(w1)), mul(s23, sqr(w3))), mul(v(2), f2));
    const b3 = sub(add(mul(s13, sqr(w1)), mul(s23, sqr(w2))), f3);
    // Symmetric adjugate + determinant.
    const A11 = sub(mul(m22, m33), sqr(m23));
    const A12 = sub(mul(m13, m23), mul(m12, m33));
    const A13 = sub(mul(m12, m23), mul(m13, m22));
    const A22 = sub(mul(m11, m33), sqr(m13));
    const A23 = sub(mul(m12, m13), mul(m11, m23));
    const A33 = sub(mul(m11, m22), sqr(m12));
    const det = add(add(mul(m11, A11), mul(m12, A12)), mul(m13, A13));
    return {
      a1: div(add(add(mul(A11, b1), mul(A12, b2)), mul(A13, b3)), det),
      a2: div(add(add(mul(A12, b1), mul(A22, b2)), mul(A23, b3)), det),
      a3: div(add(add(mul(A13, b1), mul(A23, b2)), mul(A33, b3)), det),
    };
  }

  // One CONTROL step = `substeps` semi-implicit Euler substeps at physDt.
  // The rail response contributes to the pivot acceleration seen by all links.
  function stepPhys(s, accel, g, opts) {
    const c = Object.assign(defaults(), opts || {});
    const L = c.segLen, dt = c.physDt;
    let [cx, cvx, p1, p2, p3, w1, w2, w3] = s;
    for (let k = 0; k < c.substeps; k++) {
      let aeff = accel;
      if (c.railHalf != null) {
        const overR = Math.max(0, cx - c.railHalf), overL = Math.max(0, -cx - c.railHalf);
        aeff = accel + c.wallK * (overL - overR);
      }
      const { a1, a2, a3 } = tripleAccel(P, p1, p2, p3, w1, w2, w3, aeff, g, L);
      w1 += a1 * dt; w2 += a2 * dt; w3 += a3 * dt;
      p1 += w1 * dt; p2 += w2 * dt; p3 += w3 * dt;
      cvx += aeff * dt; cx += cvx * dt;
    }
    return [cx, cvx, p1, p2, p3, w1, w2, w3];
  }

  // Total mechanical energy of the passive system (per unit mass) — used by
  // the validation probe (dE/dt ~ 0 with accel 0 and the wall off).
  function energy(s, g, opts) {
    const c = Object.assign(defaults(), opts || {});
    const L = c.segLen;
    const [cx, cvx, p1, p2, p3, w1, w2, w3] = s;
    const ps = [p1, p2, p3], ws = [w1, w2, w3];
    let T = 0, V = 0;
    for (let j = 0; j < 3; j++) {
      let vx = cvx, vy = 0, y = 0;
      for (let k = 0; k <= j; k++) {
        vx += L * Math.cos(ps[k]) * ws[k];
        vy += -L * Math.sin(ps[k]) * ws[k];
        y += L * Math.cos(ps[k]);          // +y DOWN
      }
      T += 0.5 * (vx * vx + vy * vy);
      V += -g * y;                          // gravity pulls +y
    }
    return T + V;
  }

  // ---- LQR about the upright fixed point (all three links up) ----
  const wrap = (a) => a - 2 * PI * Math.round(a / (2 * PI));
  const toDev = (s) => [s[0], s[1], wrap(s[2] - PI), wrap(s[3] - PI), wrap(s[4] - PI), s[5], s[6], s[7]];
  const toState = (d) => [d[0], d[1], d[2] + PI, d[3] + PI, d[4] + PI, d[5], d[6], d[7]];

  const N = 8;
  function zeros(r, cN) { const M = []; for (let i = 0; i < r; i++) M.push(new Array(cN).fill(0)); return M; }
  function Tr(M) { const R = zeros(M[0].length, M.length); for (let i = 0; i < M.length; i++) for (let j = 0; j < M[0].length; j++) R[j][i] = M[i][j]; return R; }
  function mm(A, B) {
    const R = zeros(A.length, B[0].length);
    for (let i = 0; i < A.length; i++) for (let k = 0; k < B.length; k++) {
      const a = A[i][k]; if (a === 0) continue;
      for (let j = 0; j < B[0].length; j++) R[i][j] += a * B[k][j];
    }
    return R;
  }

  // Central finite differences of the DISCRETE one-control-step map (wall off).
  function linearize(g, opts) {
    const c = Object.assign(defaults(), opts || {}, { railHalf: null });
    const eps = [1, 1, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3];
    const x0 = toState(new Array(N).fill(0));
    const A = zeros(N, N), B = zeros(N, 1);
    for (let j = 0; j < N; j++) {
      const xp = x0.slice(), xm = x0.slice();
      xp[j] += eps[j]; xm[j] -= eps[j];
      const fp = toDev(stepPhys(xp, 0, g, c)), fm = toDev(stepPhys(xm, 0, g, c));
      for (let i = 0; i < N; i++) A[i][j] = (fp[i] - fm[i]) / (2 * eps[j]);
    }
    const eu = 50;
    const fp = toDev(stepPhys(x0, eu, g, c)), fm = toDev(stepPhys(x0, -eu, g, c));
    for (let i = 0; i < N; i++) B[i][0] = (fp[i] - fm[i]) / (2 * eu);
    return { A, B };
  }

  // Discrete-time Riccati via ANNEALED-DISCOUNT value iteration. Plain value
  // iteration (the double's routine) DIVERGES to NaN here: the triple's
  // one-control-step map is expansive enough (open-loop spectral radius
  // ~1.13) that P blows up astronomically before the recursion turns the
  // corner. Solving with sqrt(gamma)*A for gamma stepping 0.7 -> 1.0 keeps
  // each stage contractive and warm-starts the next; at gamma=1 the fixed
  // point is the true DARE solution. Verified: closed-loop rho 0.97, 20s
  // nonlinear holds at meanUp 1.000 (the naive version's K had ~zero cart
  // gains and rho 1.08 — it fell over from a 3-degree tilt).
  function solveDARE(A, B, Qdiag, R, iters) {
    let Pm = zeros(N, N);
    for (let i = 0; i < N; i++) Pm[i][i] = Qdiag[i];
    const stages = [0.7, 0.85, 0.95, 0.99, 0.999, 1.0];
    for (const gam of stages) {
      const sg = Math.sqrt(gam);
      const Ag = A.map((row) => row.map((val) => val * sg));
      const At = Tr(Ag), Bt = Tr(B);
      for (let it = 0; it < (iters || 20000); it++) {
        const AtP = mm(At, Pm), AtPA = mm(AtP, Ag), AtPB = mm(AtP, B), BtP = mm(Bt, Pm);
        const BtPB = mm(BtP, B)[0][0] + R, BtPA = mm(BtP, Ag);
        const Pn = zeros(N, N);
        let d = 0;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          let val = AtPA[i][j] - AtPB[i][0] * (1 / BtPB) * BtPA[0][j];
          if (i === j) val += Qdiag[i];
          d += Math.abs(val - Pm[i][j]);
          Pn[i][j] = val;
        }
        Pm = Pn;
        if (!isFinite(d)) break;                       // stage blew: keep last finite P
        if (d < 1e-9 * (1 + Math.abs(Pm[0][0]))) break;
      }
    }
    const Bt = Tr(B), BtP = mm(Bt, Pm);
    const BtPB = mm(BtP, B)[0][0] + R, BtPA = mm(BtP, A);
    return BtPA[0].map((val) => val / BtPB);           // gain row K (length 8)
  }

  // Cart weights LIGHT (a moving catch must not be destabilized) — same
  // rationale as the double. Angle/velocity weights per link.
  const DEFAULT_Q = [0.3, 0.02, 20, 20, 20, 2, 2, 2];
  const DEFAULT_R = 0.0004;

  function designLQR(g, opts) {
    const { A, B } = linearize(g, opts);
    const K = solveDARE(A, B, (opts && opts.Q) || DEFAULT_Q, (opts && opts.R) || DEFAULT_R, 3000);
    return { K, A, B };
  }

  function lqrAccel(s, K, opts) {
    const c = Object.assign(defaults(), opts || {});
    const d = toDev(s);
    let u = 0; for (let i = 0; i < N; i++) u -= K[i] * d[i];
    if (u > c.maxAccel) u = c.maxAccel; else if (u < -c.maxAccel) u = -c.maxAccel;
    // The plant, not the controller, owns the rail response.
    return u;
  }

  const uprightness = (s) => ((-Math.cos(s[2])) + (-Math.cos(s[3])) + (-Math.cos(s[4]))) / 3;

  // LQR region-of-attraction gate. The triple's basin is smaller than the
  // double's — tighter default angle tolerance.
  function inBasin(s, opts) {
    const angTol = (opts && opts.angTol) || 0.35;
    const velTol = (opts && opts.velTol) || 5.0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(wrap(s[2 + i] - PI)) >= angTol) return false;
      if (Math.abs(s[5 + i]) >= velTol) return false;
    }
    return true;
  }

  // Frameless ground-truth catch check (open-loop accels + LQR hold) — same
  // role as rigidDouble.simulateCatch.
  function simulateCatch(accels, K, g, opts, holdS) {
    const dt = 1 / 60;
    let s = [0, 0, 0, 0, 0, 0, 0, 0];
    let peakUp = -1, caughtAtS = null;
    for (let h = 0; h < accels.length; h++) {
      s = stepPhys(s, accels[h], g, opts);
      peakUp = Math.max(peakUp, uprightness(s));
      if (caughtAtS == null && inBasin(s, {})) caughtAtS = h * dt;
    }
    let holdUp = 0, hn = 0, blew = false;
    const hsteps = Math.round((holdS || 3) * 60);
    for (let h = 0; h < hsteps; h++) {
      s = stepPhys(s, lqrAccel(s, K, opts), g, opts);
      if (!isFinite(s[2]) || !isFinite(s[0])) { blew = true; break; }
      if (caughtAtS == null && inBasin(s, {})) caughtAtS = (accels.length + h) * dt;
      const uu = uprightness(s); if (h > hsteps / 2) { holdUp += uu; hn++; }
    }
    const holdMeanUp = hn ? holdUp / hn : 0;
    return { peakUp, caughtAtS, holdMeanUp, blew, caught: !blew && holdMeanUp > 0.9 };
  }

  // ---- exact-gradient swing-up trajopt (autodiff) with verified-catch +
  // multi-start — the double's machinery generalized to three links. ----
  function createSwingUp(g, opts) {
    const D = BF.diffSim; if (!D) throw new Error('rigidTriple.createSwingUp needs BF.diffSim');
    const c = Object.assign(defaults(), opts || {});
    const { add, sub, mul, div, neg, sin, cos, sqr, v } = D;
    const O = { add, sub, mul, div, neg, sin, cos, sqr, v };
    const st = {
      D, O, g, c, L: c.segLen, dt: c.physDt, sub_: c.substeps, ACCEL: c.maxAccel,
      H: (opts && opts.horizon) || 280,     // ~4.7s of pumping — the triple needs more swings
      lr: (opts && opts.lr) || 0.02,
      vTermW: (opts && opts.vTermW != null) ? opts.vTermW : 14.0,
      upTermW: (opts && opts.upTermW != null) ? opts.upTermW : 90,
      cxTermW: (opts && opts.cxTermW != null) ? opts.cxTermW : 0.12,
      cvxTermW: (opts && opts.cvxTermW != null) ? opts.cvxTermW : 0.18,
      // Control-rate smoothness penalty (see rigid_double) — the triple keeps
      // its full force authority (it NEEDS it to pump 3 links up) while this
      // discourages jerky bang-bang corrections. 0 = byte-identical default.
      ctrlRateW: (opts && opts.ctrlRateW != null) ? opts.ctrlRateW : 0,
      raw: null, mM: null, vM: null, iter: 0, adamT: 0,
      bestAccels: null, bestScore: -1e9, lastRes: null,
      K: (opts && opts.K) || null,
      bestVerified: null, lastImproveIter: 0, restarts: 0,
    };
    let seed = (opts && opts.seed) || 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000 * 2 - 1; };
    st._rnd = rnd;
    st.raw = []; for (let t = 0; t < st.H; t++) st.raw.push(v(rnd() * 0.1));
    st.mM = new Array(st.H).fill(0); st.vM = new Array(st.H).fill(0);
    return st;
  }

  function iterateSwingUp(st, n) {
    const D = st.D, O = st.O, { add, sub, mul, div, neg, sin, cos, sqr, v } = D;
    const L = st.L, dt = st.dt, sub_ = st.sub_, ACCEL = st.ACCEL, H = st.H, g = st.g, c = st.c;
    for (let k = 0; k < (n || 1); k++) {
      D.zeroGrad(st.raw);
      const res = D.withTape(() => {
        let p1 = v(0), p2 = v(0), p3 = v(0), w1 = v(0), w2 = v(0), w3 = v(0), cx = v(0), cvx = v(0);
        let cost = v(0);
        let prevRaw = null;
        for (let t = 0; t < H; t++) {
          const tanhRaw = D.tanh(st.raw[t]);
          const a = mul(tanhRaw, v(ACCEL));
          if (prevRaw !== null && st.ctrlRateW) {
            cost = add(cost, mul(v(st.ctrlRateW), sqr(sub(tanhRaw, prevRaw))));
          }
          prevRaw = tanhRaw;
          for (let sIdx = 0; sIdx < sub_; sIdx++) {
            const aeff = c.railHalf == null ? a : add(a, mul(v(c.wallK),
              sub(D.relu(sub(neg(cx), v(c.railHalf))), D.relu(sub(cx, v(c.railHalf))))));
            const { a1, a2, a3 } = tripleAccel(O, p1, p2, p3, w1, w2, w3, aeff, g, L);
            w1 = add(w1, mul(a1, v(dt))); w2 = add(w2, mul(a2, v(dt))); w3 = add(w3, mul(a3, v(dt)));
            p1 = add(p1, mul(w1, v(dt))); p2 = add(p2, mul(w2, v(dt))); p3 = add(p3, mul(w3, v(dt)));
            cvx = add(cvx, mul(aeff, v(dt))); cx = add(cx, mul(cvx, v(dt)));
          }
          const u1 = neg(cos(p1)), u2 = neg(cos(p2)), u3 = neg(cos(p3));
          const wgt = 0.2 + 0.8 * (t / H);
          cost = add(cost, mul(v(wgt), add(add(sub(v(1), u1), sub(v(1), u2)), sub(v(1), u3))));
        }
        const u1 = neg(cos(p1)), u2 = neg(cos(p2)), u3 = neg(cos(p3));
        cost = add(cost, mul(v(st.upTermW), add(add(sub(v(1), u1), sub(v(1), u2)), sub(v(1), u3))));
        cost = add(cost, mul(v(st.upTermW), add(sqr(sub(sin(p1), sin(p2))), sqr(sub(sin(p2), sin(p3))))));
        cost = add(cost, mul(v(st.vTermW), add(add(sqr(w1), sqr(w2)), sqr(w3))));
        cost = add(cost, mul(v(st.cxTermW), sqr(div(cx, v(80)))));
        cost = add(cost, mul(v(st.cvxTermW), sqr(div(cvx, v(200)))));
        D.backward(cost);
        return { cost: cost.val, u1: u1.val, u2: u2.val, u3: u3.val,
                 w1: w1.val, w2: w2.val, w3: w3.val, cx: cx.val, cvx: cvx.val,
                 up: (u1.val + u2.val + u3.val) / 3 };
      });
      const score = Math.min(res.u1, res.u2, res.u3)
        - 0.03 * (Math.abs(res.w1) + Math.abs(res.w2) + Math.abs(res.w3))
        - 0.0004 * Math.abs(res.cvx) - 0.0006 * Math.abs(res.cx);
      if (score > st.bestScore) {
        st.bestScore = score;
        st.bestAccels = st.raw.map((r) => st.ACCEL * Math.tanh(r.val));
        st.lastImproveIter = st.iter;
        if (st.K && score > 0.5) {
          const chk = simulateCatch(st.bestAccels, st.K, st.g, st.c, 3);
          if (chk.caught && (!st.bestVerified || chk.holdMeanUp > st.bestVerified.holdMeanUp)) {
            st.bestVerified = {
              accels: st.bestAccels.slice(), holdMeanUp: chk.holdMeanUp,
              caughtAtS: chk.caughtAtS, peakUp: chk.peakUp, atIter: st.iter,
            };
          }
        }
      }
      st.iter++; st.adamT++;
      const it = st.adamT;
      for (let t = 0; t < H; t++) {
        let gr = st.raw[t].grad; if (!isFinite(gr)) gr = 0; if (gr > 1e3) gr = 1e3; else if (gr < -1e3) gr = -1e3;
        st.mM[t] = 0.9 * st.mM[t] + 0.1 * gr; st.vM[t] = 0.999 * st.vM[t] + 0.001 * gr * gr;
        st.raw[t].val -= st.lr * (st.mM[t] / (1 - Math.pow(0.9, it))) / (Math.sqrt(st.vM[t] / (1 - Math.pow(0.999, it))) + 1e-8);
      }
      st.lastRes = res;
      if (!st.bestVerified && st.K && st.iter - st.lastImproveIter >= 200) {
        const v_ = st.D.v;
        st.raw = []; for (let t = 0; t < H; t++) st.raw.push(v_(st._rnd() * 0.3));
        st.mM = new Array(H).fill(0); st.vM = new Array(H).fill(0);
        st.adamT = 0;
        st.bestScore = -1e9; st.bestAccels = null;
        st.lastImproveIter = st.iter;
        st.restarts++;
      }
    }
    return { accels: st.bestAccels ? Float64Array.from(st.bestAccels) : null, bestScore: st.bestScore, res: st.lastRes };
  }

  function swingUpTrajopt(g, opts) {
    const st = createSwingUp(g, opts);
    const iters = (opts && opts.iters) || 1500, logEvery = (opts && opts.logEvery) || 100;
    for (let k = 0; k < iters; k += logEvery) {
      iterateSwingUp(st, Math.min(logEvery, iters - k));
      if (opts && opts.onIter) opts.onIter(st.iter, st.lastRes);
      if (st.bestVerified) break;   // done — no need to burn the full budget
    }
    return {
      accels: st.bestAccels ? Float64Array.from(st.bestAccels) : null,
      finalScore: st.bestScore, iters: st.iter,
      bestVerified: st.bestVerified, restarts: st.restarts,
    };
  }

  // Display frame {cx, n1, n2, n3} — diff-sim convention (pivot (cx,0), +y DOWN).
  function frameOf(s, L) {
    const x1 = s[0] + L * Math.sin(s[2]), y1 = L * Math.cos(s[2]);
    const x2 = x1 + L * Math.sin(s[3]), y2 = y1 + L * Math.cos(s[3]);
    return { cx: s[0], n1: { x: x1, y: y1 }, n2: { x: x2, y: y2 },
             n3: { x: x2 + L * Math.sin(s[4]), y: y2 + L * Math.cos(s[4]) } };
  }

  // Attach the actuation to a display frame (see rigid_double.withForce): the
  // normalized commanded cart accel + rail-reaction, so the viewer can draw
  // force arrows and make the driven-pivot model transparent.
  function withForce(fr, a, s, c) {
    const norm = (c.maxAccel || 6000);
    fr.a = a / norm;
    if (c.railHalf != null) {
      const overR = Math.max(0, s[0] - c.railHalf), overL = Math.max(0, -s[0] - c.railHalf);
      fr.wall = (c.wallK * (overL - overR)) / norm;
    } else fr.wall = 0;
    return fr;
  }

  function lqrHoldFrames(K, g, opts, tiltDeg, seconds) {
    const c = Object.assign(defaults(), opts || {}), L = c.segLen, dt = 1 / 60;
    const t = tiltDeg * PI / 180;
    let s = [0, 0, PI - t, PI - t * 0.6, PI - t * 0.36, 0, 0, 0];
    const frames = []; let up = 0, n = 0, blew = false;
    const steps = Math.round((seconds || 8) / dt);
    for (let h = 0; h < steps; h++) {
      const a = lqrAccel(s, K, opts);
      s = stepPhys(s, a, g, opts);
      if (!isFinite(s[2]) || !isFinite(s[0])) { blew = true; break; }
      frames.push(withForce(frameOf(s, L), a, s, c)); up += uprightness(s); n++;
    }
    return { frames, meanUp: n ? up / n : 0, blew };
  }

  function swingUpFrames(accels, K, g, opts, holdS) {
    const c = Object.assign(defaults(), opts || {}), L = c.segLen, dt = 1 / 60;
    let s = [0, 0, 0, 0, 0, 0, 0, 0];
    const frames = []; let peakUp = -1, caughtAtS = null;
    for (let h = 0; h < accels.length; h++) {
      const a = accels[h];
      s = stepPhys(s, a, g, opts);
      frames.push(withForce(frameOf(s, L), a, s, c)); peakUp = Math.max(peakUp, uprightness(s));
      if (caughtAtS == null && inBasin(s, {})) caughtAtS = h * dt;
    }
    let holdUp = 0, hn = 0, blew = false;
    const hsteps = Math.round((holdS || 6) / dt);
    for (let h = 0; h < hsteps; h++) {
      const a = lqrAccel(s, K, opts);
      s = stepPhys(s, a, g, opts);
      if (!isFinite(s[2]) || !isFinite(s[0])) { blew = true; break; }
      frames.push(withForce(frameOf(s, L), a, s, c));
      if (caughtAtS == null && inBasin(s, {})) caughtAtS = (accels.length + h) * dt;
      const uu = uprightness(s); if (h > hsteps / 2) { holdUp += uu; hn++; }
    }
    return { frames, peakUp, caughtAtS, holdMeanUp: hn ? holdUp / hn : 0, blew };
  }

  BF.rigidTriple = {
    PI, defaults, tripleAccel, stepPhys, energy, toDev, toState,
    linearize, solveDARE, designLQR, lqrAccel, uprightness, inBasin,
    createSwingUp, iterateSwingUp, swingUpTrajopt, simulateCatch,
    frameOf, lqrHoldFrames, swingUpFrames,
    DEFAULT_Q, DEFAULT_R,
  };
})();
