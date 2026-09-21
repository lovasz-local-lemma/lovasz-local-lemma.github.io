// rigid_double.js — RIGID minimal-coordinate driven double pendulum.
//
// WHY THIS EXISTS. The diffsim modes (adam/memetic/lqr/trajopt) approximate the
// rigid rods with stiff penalty springs (k=8000). That is a textbook anti-pattern:
// the spring stiffness makes the ODE stiff (omega ~ sqrt(k/m) ~ 90 rad/s), so the
// backprop-through-time Jacobian is ill-conditioned and the "exact" gradients are
// numerically corrupt. Probes confirm a memoryless policy trained on that model
// does not hold past its training horizon, and the spring LQR fails at low gravity.
//
// The fix real swing-up/balance demos use (Åström-Furuta energy pumping, direct
// collocation + (TV)LQR, Glück/Eder/Kugi triple-pendulum) is RIGID minimal
// coordinates: cart x plus joint angles, exact Euler-Lagrange dynamics, no penalty
// springs. This module provides that model plus the two controllers real demos use:
//   - LQR stabilizer  : holds up=1.00 for 20s+ at EVERY gravity 150..1200 (proven).
//   - trajopt swing-up : exact-gradient (autodiff) open-loop accel sequence from the
//                        hanging-down state, handing off to the LQR near the top.
//
// State convention. Angles measured from the DOWN vertical, so phi = pi is UPRIGHT.
// s = [cx, cvx, phi1, phi2, w1, w2]  (cart pos/vel, two link angles, two ang. vels).
// Control a = cart acceleration. m1=m2=1, l1=l2=segLen.
(function () {
  const BF = (window.BF = window.BF || {});
  const PI = Math.PI;

  // Plain-number ops that mirror BF.diffSim's Var ops, so the ONE equation of
  // motion below is shared verbatim between the numeric path (LQR, simulation)
  // and the autodiff path (trajopt). Single source of truth — the spring/rigid
  // divergence that bit us before cannot recur here.
  const P = {
    add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b,
    div: (a, b) => a / b, neg: (a) => -a, sin: Math.sin, cos: Math.cos,
    sqr: (a) => a * a, v: (a) => a,
  };

  // Shared rigid equation of motion. Returns angular accelerations {a1,a2} for the
  // driven-pivot double pendulum. D = phi1 - phi2; det = l^2 (2 - cos^2 D).
  //   b1 = -2 g sin phi1 - l w2^2 sin D - 2 a cos phi1
  //   b2 =   -g sin phi2 + l w1^2 sin D -   a cos phi2
  //   a1 = (b1 - cosD b2) / (l (2 - cos^2 D));  a2 = (2 b2 - cosD b1) / (l (2 - cos^2 D))
  function rigidAccel(o, p1, p2, w1, w2, a, g, L) {
    const D = o.sub(p1, p2), cD = o.cos(D), sD = o.sin(D);
    const den = o.mul(o.v(L), o.sub(o.v(2), o.sqr(cD)));
    const b1 = o.sub(o.sub(o.mul(o.v(-2 * g), o.sin(p1)), o.mul(o.mul(o.v(L), o.sqr(w2)), sD)),
                     o.mul(o.mul(o.v(2), a), o.cos(p1)));
    const b2 = o.sub(o.add(o.mul(o.v(-g), o.sin(p2)), o.mul(o.mul(o.v(L), o.sqr(w1)), sD)),
                     o.mul(a, o.cos(p2)));
    const a1 = o.div(o.sub(b1, o.mul(b2, cD)), den);
    const a2 = o.div(o.sub(o.mul(o.v(2), b2), o.mul(cD, b1)), den);
    return { a1, a2 };
  }

  const defaults = () => ({ segLen: 80, physDt: 1 / 240, substeps: 4, railHalf: 150, wallK: 500, maxAccel: 6000 });

  // One CONTROL step (numeric), sub-stepped at physDt. Semi-implicit Euler.
  // railHalf null => rail wall off (used when building the linear model).
  function stepPhys(s, accel, g, opts) {
    const c = Object.assign(defaults(), opts || {});
    const L = c.segLen, dt = c.physDt;
    let [cx, cvx, p1, p2, w1, w2] = s;
    for (let k = 0; k < c.substeps; k++) {
      let aeff = accel;
      if (c.railHalf != null) {
        const overR = Math.max(0, cx - c.railHalf), overL = Math.max(0, -cx - c.railHalf);
        aeff += c.wallK * (overL - overR);
      }
      // The links are attached to the accelerating pivot, including its rail
      // response. Feeding only the command here creates a moving-pivot mismatch.
      const { a1, a2 } = rigidAccel(P, p1, p2, w1, w2, aeff, g, L);
      w1 += a1 * dt; w2 += a2 * dt; p1 += w1 * dt; p2 += w2 * dt;
      cvx += aeff * dt; cx += cvx * dt;
    }
    return [cx, cvx, p1, p2, w1, w2];
  }

  // deviation coords for LQR: x = [cx, cvx, d1, w1, d2, w2], d = phi - pi.
  // The angle error MUST be wrapped to (-pi, pi]: a swing-up winds the link up to
  // pi (+/- 2*pi*k); cos() reads 1.0 either way, but the LQR uses the angle
  // LINEARLY, so an unwrapped 2*pi offset looks like a huge deviation and the
  // controller commands enormous accel and diverges. Wrapping is a no-op near the
  // fixed point (tiny values), so linearization is unaffected.
  const wrap = (a) => { let r = (a + PI) % (2 * PI); if (r < 0) r += 2 * PI; return r - PI; };
  const toDev = (s) => [s[0], s[1], wrap(s[2] - PI), s[4], wrap(s[3] - PI), s[5]];
  const toState = (x) => [x[0], x[1], PI + x[2], PI + x[4], x[3], x[5]];

  // ---- small dense linear algebra (N=6) ----
  const N = 6;
  const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
  const Tr = (A) => { const m = zeros(A[0].length, A.length); for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) m[j][i] = A[i][j]; return m; };
  const mm = (A, B) => { const r = A.length, k = B.length, c = B[0].length, m = zeros(r, c); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = 0; for (let t = 0; t < k; t++) s += A[i][t] * B[t][j]; m[i][j] = s; } return m; };
  const addM = (A, B) => { const m = zeros(A.length, A[0].length); for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) m[i][j] = A[i][j] + B[i][j]; return m; };
  const subM = (A, B) => { const m = zeros(A.length, A[0].length); for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) m[i][j] = A[i][j] - B[i][j]; return m; };

  // Finite-difference linearization about the upright fixed point (wall OFF).
  function linearize(g, opts) {
    const o = Object.assign({}, opts || {}, { railHalf: null });
    const A = zeros(N, N), B = zeros(N, 1);
    const eps = [1, 1, 1e-3, 1e-3, 1e-3, 1e-3], x0 = [0, 0, 0, 0, 0, 0];
    for (let j = 0; j < N; j++) {
      const xp = x0.slice(); xp[j] += eps[j]; const xm = x0.slice(); xm[j] -= eps[j];
      const fp = toDev(stepPhys(toState(xp), 0, g, o)), fm = toDev(stepPhys(toState(xm), 0, g, o));
      for (let i = 0; i < N; i++) A[i][j] = (fp[i] - fm[i]) / (2 * eps[j]);
    }
    const eu = 50;
    const fp = toDev(stepPhys(toState(x0), eu, g, o)), fm = toDev(stepPhys(toState(x0), -eu, g, o));
    for (let i = 0; i < N; i++) B[i][0] = (fp[i] - fm[i]) / (2 * eu);
    return { A, B };
  }

  // Discrete-time LQR via value iteration on the Riccati recursion.
  function solveDARE(A, B, Qdiag, R, iters) {
    const Q = zeros(N, N); for (let i = 0; i < N; i++) Q[i][i] = Qdiag[i];
    const At = Tr(A), Bt = Tr(B); let Pm = Q.map((r) => r.slice());
    for (let it = 0; it < (iters || 3000); it++) {
      const AtP = mm(At, Pm), AtPA = mm(AtP, A), AtPB = mm(AtP, B), BtP = mm(Bt, Pm);
      const BtPB = mm(BtP, B)[0][0] + R, BtPA = mm(BtP, A);
      const corr = zeros(N, N);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) corr[i][j] = AtPB[i][0] * (1 / BtPB) * BtPA[0][j];
      const Pn = addM(subM(AtPA, corr), Q);
      let d = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) d += Math.abs(Pn[i][j] - Pm[i][j]);
      Pm = Pn; if (d < 1e-6) break;
    }
    const BtP = mm(Bt, Pm), BtPB = mm(BtP, B)[0][0] + R, BtPA = mm(BtP, A);
    return BtPA[0].map((val) => val / BtPB); // gain row K (length 6)
  }

  // Default cost weights on x=[cx,cvx,d1,w1,d2,w2]: penalize link angles hard, cart
  // position/velocity lightly. Light cart weights keep the stabilizer robust to
  // ANGULAR velocity at hand-off (heavier cart gains couple into the links and
  // destabilize a moving catch); the swing-up is responsible for arriving with a
  // slow, roughly-centered cart.
  const DEFAULT_Q = [0.3, 0.02, 20, 2, 20, 2], DEFAULT_R = 0.0004;

  // Design an LQR gain for a given gravity. Returns { K, A, B }.
  function designLQR(g, opts) {
    const { A, B } = linearize(g, opts);
    const Q = (opts && opts.Q) || DEFAULT_Q, R = (opts && opts.R != null) ? opts.R : DEFAULT_R;
    const K = solveDARE(A, B, Q, R, (opts && opts.dareIters) || 3000);
    return { K, A, B };
  }

  // Commanded acceleration only. The plant applies the rail response once.
  function lqrAccel(s, K, opts) {
    const c = Object.assign(defaults(), opts || {});
    const x = toDev(s); let u = 0; for (let i = 0; i < N; i++) u -= K[i] * x[i];
    u = Math.max(-c.maxAccel, Math.min(c.maxAccel, u));
    return u;
  }

  const uprightness = (s) => ((-Math.cos(s[2])) + (-Math.cos(s[3]))) / 2; // 1 = both links up

  // Is the state inside the LQR region of attraction? Cheap ellipsoid gate on the
  // deviation coords — used to decide when swing-up hands off to the stabilizer.
  function inBasin(s, opts) {
    const angTol = (opts && opts.angTol) || 0.45;      // ~26 deg per link
    const velTol = (opts && opts.velTol) || 6.0;
    const d1 = Math.abs(wrap(s[2] - PI));
    const d2 = Math.abs(wrap(s[3] - PI));
    return d1 < angTol && d2 < angTol && Math.abs(s[4]) < velTol && Math.abs(s[5]) < velTol;
  }

  // Frameless catch verification: play the open-loop accels from hang-down,
  // then hand to the LQR for holdS seconds. Returns whether the catch actually
  // WORKED — the ground truth the optimizer's proxy score cannot see. Cost:
  // (accels.length + holdS*60) numeric steps ≈ a fraction of one autodiff
  // iteration, so it's cheap enough to run on every proxy improvement.
  function simulateCatch(accels, K, g, opts, holdS) {
    const c = Object.assign(defaults(), opts || {}), dt = 1 / 60;
    let s = [0, 0, 0, 0, 0, 0];
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
      // basin entry often happens DURING the LQR phase (the open-loop part
      // delivers "close enough", the LQR reels it in) — keep tracking here
      // so caughtAtS isn't null on perfectly good catches.
      if (caughtAtS == null && inBasin(s, {})) caughtAtS = (accels.length + h) * dt;
      const uu = uprightness(s); if (h > hsteps / 2) { holdUp += uu; hn++; }
    }
    const holdMeanUp = hn ? holdUp / hn : 0;
    return { peakUp, caughtAtS, holdMeanUp, blew, caught: !blew && holdMeanUp > 0.9 };
  }

  // ---- exact-gradient trajectory-optimization swing-up (autodiff) ----
  // Optimizes an open-loop cart-accel sequence u[0..H-1] (via a tanh-bounded raw
  // parameter) to bring the pendulum from hanging-down to upright with low terminal
  // velocity, using EXACT gradients through the RIGID dynamics. This is the same
  // "exact-gradient" idea the spring diffsim modes attempt, but on the correct
  // (well-conditioned) model. Returns { accels:Float64Array(H), finalUp, iters }.
  // Requires BF.diffSim. Designed to run headlessly (probe) or be precomputed once.
  // createSwingUp(g, opts): build a STATEFUL optimizer so callers can run it a chunk
  // at a time (watch the swing-up improve live) instead of all iters at once.
  function createSwingUp(g, opts) {
    const D = BF.diffSim; if (!D) throw new Error('rigidDouble.createSwingUp needs BF.diffSim');
    const c = Object.assign(defaults(), opts || {});
    const { add, sub, mul, div, neg, sin, cos, sqr, v } = D;
    const O = { add, sub, mul, div, neg, sin, cos, sqr, v }; // autodiff ops for the shared EoM
    // Defaults below are the values PROVEN by rigid-lqr-probe.js to produce a clean
    // hand-off: swing up to peakUp~1.0 arriving slow + aligned + roughly centered,
    // so the LQR catches and holds 10s+. Callers can override any of them.
    const st = {
      D, O, g, c, L: c.segLen, dt: c.physDt, sub_: c.substeps, ACCEL: c.maxAccel,
      H: (opts && opts.horizon) || 200,
      lr: (opts && opts.lr) || 0.02,
      startP1: (opts && opts.startP1 != null) ? opts.startP1 : 0.0,
      startP2: (opts && opts.startP2 != null) ? opts.startP2 : 0.0,
      vTermW: (opts && opts.vTermW != null) ? opts.vTermW : 14.0,
      upTermW: (opts && opts.upTermW != null) ? opts.upTermW : 90,
      cxTermW: (opts && opts.cxTermW != null) ? opts.cxTermW : 0.12,
      cvxTermW: (opts && opts.cvxTermW != null) ? opts.cvxTermW : 0.18,
      // Control-RATE penalty (smoothness): penalizes the normalized
      // step-to-step change in commanded accel, so the optimizer prefers a
      // smooth pump over jerky bang-bang corrections — the "high-frequency
      // forces" that make the swing-up look non-physical. 0 (default) is
      // byte-identical to the original verified behavior; the presets dial it
      // up. Normalized by ACCEL so the weight is O(1) regardless of the cap.
      ctrlRateW: (opts && opts.ctrlRateW != null) ? opts.ctrlRateW : 0,
      raw: null, mM: null, vM: null, iter: 0, adamT: 0,
      bestAccels: null, bestScore: -1e9, lastRes: null,
      // VERIFIED-catch tracking (the live-mode fix): the proxy score above the
      // Adam loop is a heuristic — on ~27% of random seeds it plateaus at
      // 0.87-0.96 while the actual LQR catch FAILS forever (the chart said
      // "solved", the display showed swing-up-then-fall). When opts.K is
      // provided, every proxy improvement is verified with a real
      // simulateCatch replay; bestVerified holds the best sequence that
      // GENUINELY caught. If no verified catch appears and the proxy stalls,
      // the optimizer RESTARTS from a fresh random init (multi-start) —
      // expanding coverage without guaranteeing a catch in a finite budget.
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

  // iterateSwingUp(st, n): run n Adam iterations. Returns {accels, bestScore, res}.
  function iterateSwingUp(st, n) {
    const D = st.D, O = st.O, { add, sub, mul, div, neg, sin, cos, sqr, v } = D;
    const L = st.L, dt = st.dt, sub_ = st.sub_, ACCEL = st.ACCEL, H = st.H, g = st.g, c = st.c;
    for (let k = 0; k < (n || 1); k++) {
      D.zeroGrad(st.raw);
      const res = D.withTape(() => {
        let p1 = v(st.startP1), p2 = v(st.startP2), w1 = v(0), w2 = v(0), cx = v(0), cvx = v(0);
        let cost = v(0);
        let prevRaw = null;
        for (let t = 0; t < H; t++) {
          const tanhRaw = D.tanh(st.raw[t]);
          const a = mul(tanhRaw, v(ACCEL));
          // Smoothness: penalize the normalized control rate (tanh diff). When
          // ctrlRateW is 0 nothing is added → gradient-identical to baseline.
          if (prevRaw !== null && st.ctrlRateW) {
            cost = add(cost, mul(v(st.ctrlRateW), sqr(sub(tanhRaw, prevRaw))));
          }
          prevRaw = tanhRaw;
          for (let sIdx = 0; sIdx < sub_; sIdx++) {
            const aeff = c.railHalf == null ? a : add(a, mul(v(c.wallK),
              sub(D.relu(sub(neg(cx), v(c.railHalf))), D.relu(sub(cx, v(c.railHalf))))));
            const { a1, a2 } = rigidAccel(O, p1, p2, w1, w2, aeff, g, L);
            w1 = add(w1, mul(a1, v(dt))); w2 = add(w2, mul(a2, v(dt)));
            p1 = add(p1, mul(w1, v(dt))); p2 = add(p2, mul(w2, v(dt)));
            cvx = add(cvx, mul(aeff, v(dt))); cx = add(cx, mul(cvx, v(dt)));
          }
          // running uprightness reward, weighted toward the end
          const u1 = neg(cos(p1)), u2 = neg(cos(p2));
          const wgt = 0.2 + 0.8 * (t / H);
          cost = add(cost, mul(v(wgt), add(sub(v(1), u1), sub(v(1), u2))));
        }
        // terminal: strong uprightness + alignment + LOW velocity + slow centered cart
        const u1 = neg(cos(p1)), u2 = neg(cos(p2));
        cost = add(cost, mul(v(st.upTermW), add(sub(v(1), u1), sub(v(1), u2))));
        cost = add(cost, mul(v(st.upTermW), sqr(sub(sin(p1), sin(p2)))));  // anti-fold
        cost = add(cost, mul(v(st.vTermW), add(sqr(w1), sqr(w2))));
        cost = add(cost, mul(v(st.cxTermW), sqr(div(cx, v(80)))));
        cost = add(cost, mul(v(st.cvxTermW), sqr(div(cvx, v(200)))));
        D.backward(cost);
        return { cost: cost.val, up: (u1.val + u2.val) / 2, u1: u1.val, u2: u2.val, w1: w1.val, w2: w2.val, cx: cx.val, cvx: cvx.val };
      });
      // Score THIS rollout and snapshot the SAME raw BEFORE the Adam step (else the
      // saved sequence is one gradient step out of sync with its score). Catchability
      // rewards the WORSE link being up minus terminal velocity penalties.
      const score = Math.min(res.u1, res.u2)
        - 0.03 * (Math.abs(res.w1) + Math.abs(res.w2))
        - 0.0004 * Math.abs(res.cvx) - 0.0006 * Math.abs(res.cx);
      if (score > st.bestScore) {
        st.bestScore = score;
        st.bestAccels = st.raw.map((r) => ACCEL * Math.tanh(r.val));
        st.lastImproveIter = st.iter;
        // VERIFY the actual catch (see createSwingUp). Only bother once the
        // proxy says "roughly upright" — verifying garbage wastes steps.
        if (st.K && score > 0.5) {
          const chk = simulateCatch(st.bestAccels, st.K, st.g, st.c, 3);
          if (chk.caught && (!st.bestVerified || chk.holdMeanUp > st.bestVerified.holdMeanUp)) {
            st.bestVerified = {
              accels: st.bestAccels.slice(),
              holdMeanUp: chk.holdMeanUp,
              caughtAtS: chk.caughtAtS,
              peakUp: chk.peakUp,
              atIter: st.iter,
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
      // MULTI-START escape: no genuine catch yet and the proxy has stalled for
      // 150 iterations -> this basin's optimum doesn't hand off to the LQR.
      // Restart from a fresh (wider) random init; keep bestVerified (monotone).
      if (!st.bestVerified && st.K && st.iter - st.lastImproveIter >= 150) {
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

  // One-shot convenience (used by the acceptance probe): create + iterate.
  function swingUpTrajopt(g, opts) {
    const st = createSwingUp(g, opts);
    const iters = (opts && opts.iters) || 900, logEvery = (opts && opts.logEvery) || 50;
    for (let k = 0; k < iters; k += logEvery) {
      iterateSwingUp(st, Math.min(logEvery, iters - k));
      if (opts && opts.onIter) opts.onIter(st.iter, st.lastRes);
    }
    return { accels: Float64Array.from(st.bestAccels), finalScore: st.bestScore, iters: st.iter };
  }

  // Map a rigid state s=[cx,cvx,p1,p2,w1,w2] to a display frame {cx, n1, n2} in the
  // diff-sim's convention (pivot at (cx,0), +y DOWN, so upright => negative y).
  function frameOf(s, L) {
    const x1 = s[0] + L * Math.sin(s[2]), y1 = L * Math.cos(s[2]);
    return { cx: s[0], n1: { x: x1, y: y1 }, n2: { x: x1 + L * Math.sin(s[3]), y: y1 + L * Math.cos(s[3]) } };
  }

  // Attach the actuation to a display frame so the viewer can draw force arrows:
  //   fr.a    = commanded cart acceleration, normalized to [-1,1] by maxAccel —
  //             the ONLY external actuation (the links feel only this via the
  //             pivot, plus gravity: a driven-pivot model, no direct link force).
  //   fr.wall = soft rail-reaction, same normalization, nonzero only when the
  //             cart is past the rail. It decelerates the cart; the pendulum
  //             briefly sees the mismatch — the "external force sometimes" at
  //             the rails. Drawn so that artifact is visible, not mysterious.
  function withForce(fr, a, s, c) {
    const norm = (c.maxAccel || 6000);
    fr.a = a / norm;
    if (c.railHalf != null) {
      const overR = Math.max(0, s[0] - c.railHalf), overL = Math.max(0, -s[0] - c.railHalf);
      fr.wall = (c.wallK * (overL - overR)) / norm;
    } else fr.wall = 0;
    return fr;
  }

  // Build display frames for an LQR hold from a tilt (both links tilted the same way).
  function lqrHoldFrames(K, g, opts, tiltDeg, seconds) {
    const c = Object.assign(defaults(), opts || {}), L = c.segLen, dt = 1 / 60;
    let s = [0, 0, PI - tiltDeg * PI / 180, PI - tiltDeg * PI / 180 * 0.6, 0, 0];
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

  // Build display frames for the FULL swing-up: play the open-loop accels from
  // hanging-down, then hand off to the LQR and hold for holdS seconds. Returns the
  // frames plus peakUp / caughtAtS / holdMeanUp for the HUD.
  function swingUpFrames(accels, K, g, opts, holdS) {
    const c = Object.assign(defaults(), opts || {}), L = c.segLen, dt = 1 / 60;
    let s = [0, 0, 0, 0, 0, 0];      // hanging straight down
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
      // basin entry often happens DURING the LQR phase — see simulateCatch.
      if (caughtAtS == null && inBasin(s, {})) caughtAtS = (accels.length + h) * dt;
      const uu = uprightness(s); if (h > hsteps / 2) { holdUp += uu; hn++; }
    }
    return { frames, peakUp, caughtAtS, holdMeanUp: hn ? holdUp / hn : 0, blew };
  }

  BF.rigidDouble = {
    PI, defaults, rigidAccel, stepPhys, toDev, toState,
    linearize, solveDARE, designLQR, lqrAccel, uprightness, inBasin,
    createSwingUp, iterateSwingUp, swingUpTrajopt, simulateCatch,
    frameOf, lqrHoldFrames, swingUpFrames,
    DEFAULT_Q, DEFAULT_R,
  };
})();
