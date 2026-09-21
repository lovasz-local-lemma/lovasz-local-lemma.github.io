// curve_fourier.js
// FOURIER ("epicycle") DECOMPOSITION of a closed plane curve — the analysis
// engine behind the `epicycle` setup and the "how few arms do I need?" answer.
//
// THE IDEA. Treat the target curve as a complex signal z(s) = x(s) + i·y(s),
// s ∈ [0,1) one loop. Its DFT coefficients c_k are literally a machine:
//
//     z(s) = c₀ + Σ_k c_k · e^{i·2πk·s}
//              └─ base ─┘  └─ arm k: length |c_k|, angle 2πk·s + arg(c_k) ─┘
//
// i.e. an arm of FIXED length |c_k| rotating at a CONSTANT rate of k turns per
// loop, hinged on the tip of the previous arm. Nest them and the last tip draws
// the curve. Negative k = counter-rotating; k = 0 is the centroid (the base
// anchor), which is why N below counts only the ROTATING arms.
//
// WHY SORT BY MAGNITUDE. By Parseval the squared L2 error of dropping a set S
// of terms is exactly Σ_{k∈S} |c_k|², independent of the others. So keeping the
// N largest |c_k| is not a heuristic — it is the PROVABLY optimal N-arm
// truncation in RMS. `terms` is returned pre-sorted, so `reconstruct(m, s, N)`
// is the best possible N-arm drawing of that curve.
//
// DFT vs DCT — MEASURED, and the answer is "DFT, except for open strokes".
//   * A DCT term is cos(kπs) on x and y SEPARATELY: a straight-line oscillator
//     (Scotch yoke), not a rotation. It cannot be an epicycle arm on its own.
//     Two counter-rotating arms of equal radius sum to exactly one linear
//     oscillation, so a DCT term costs 2 ARMS. The DCT is therefore the special
//     case of this same DFT with c_k = c_{−k} — which is precisely what you get
//     by running the DFT on the EVEN ("there-and-back") extension of the path.
//     mode:'even' below does that, so both bases live in one code path.
//   * For CLOSED curves the plain DFT wins outright — the DCT spends 2 arms to
//     say what 1 arm says. MEASURED (mean px, dft/even): circle @N=4 0.0/45.6,
//     triangle @N=8 0.8/7.1, square @N=8 0.7/12.3, autograph @N=8 11.0/27.8.
//   * For OPEN strokes (wave, scriptS, signature, cursive) the raw DFT sees a
//     JUMP where the pen teleports from the stroke's end back to its start.
//     A jump makes |c_k| decay only ~1/k, so the plain DFT is starved and the
//     WORST-case error never improves at all (see the Gibbs note below).
//     mode:'even' draws the stroke there-and-back — no jump, ~1/k² decay.
//     MEASURED (dft/even): wave @N=8 16.9/9.2, @N=16 10.3/1.9, @N=32 6.0/0.5;
//     signature @N=8 16.5/8.3, @N=16 10.0/2.1; scriptS @N=4 22.2/8.4;
//     cursive crosses over later — @N=8 11.8/15.5 (dft still ahead) but
//     @N=16 7.2/2.9 and @N=32 4.2/0.6.
//     Cost: the machine retraces, so one "loop" draws the stroke twice; double
//     the period to keep the pen speed the same.
//
// GIBBS IS THE REAL COST, AND IT IS NOT WHERE YOU EXPECT. The intuition "sharp
// corners need lots of terms" is WRONG here, measured:
//   * A corner is a DERIVATIVE jump ⇒ |c_k| ~ 1/k² (fitted exponent: triangle
//     1.98, square 1.81) AND a regular polygon is harmonic-SPARSE — the
//     triangle's only arms are k = 1, −2, 4, −5, 7… (every third), the square's
//     k = 1, −3, 5, −7… (every fourth). So a triangle is recognizable on TWO
//     arms (6.8 px mean, 3.0 px ink) and pixel-tight on eight (0.8 px).
//   * A pen-lift is a POSITION jump ⇒ |c_k| ~ 1/k (fitted: wave 1.09, scriptS
//     1.00, signature 1.13, cursive 1.19) and the truncation converges to the
//     MIDPOINT of the jump, so the worst-case error is pinned at half the jump
//     FOREVER. MEASURED on `wave` (280 px wrap jump): max error 140 px at N=8,
//     140 at N=16, 141 at N=32, 141 at N=64, 142 at N=128 — it gets slightly
//     WORSE as the Gibbs overshoot sharpens. That is the only thing in this
//     file that more arms cannot fix, and mode:'even' is the fix.
//   * A smooth spline has no jump of either kind (autograph fits 3.19) and
//     converges fastest of all: 0.15 px mean at N=32.
//
// MEASURED reconstruction error (mean px over one loop at traceRadius = 140,
// pointwise at matching parameter s, 4096 dense samples; RECOMMENDED_N below
// carries the per-curve knee, and every number there is verified on the BUILT
// `epicycle` setup, not just on this module):
//     circle 1 arm → 0.00 px (exact)   line / ellipse 2 arms → 0.00 (exact)
//     figure-8 4 arms → 0.00 (exact)   triangle 2 → 6.8    square 2 → 6.3
//     flourish 8 → 6.3                 autograph 8 → 11.0, 24 → 0.6
//     signature(even) 8 → 8.3          cursive(even) 11 → 10.2
//     swash 3 → 6.8                    monogram 7 → 5.3
//     longhand 8 → 4.9                 copperplate 10 → 6.8
//     descender / ascender 5 → 10.0 (shape lands at ink 4.5; the pointwise
//       number is a TIMING lag — the piecewise stroke has a non-uniform ds/dt,
//       which is exactly the case the ink metric exists to separate)
// A frozen machine (all arms dropped) sits at 178–237 px on these curves, so
// the metric separates a real drawing from a dead one by 1–3 orders of magnitude.
//
// API
//   analyze(source, opts)      → model  {mode, M, dc, terms[], acEnergy, …}
//                                source = curve id | fn(s)→{x,y} | [{x,y}, …]
//                                opts   = {samples, mode:'dft'|'even', kMax}
//   reconstruct(model, s, N)   → {x,y}   unit coords, N largest arms (all if null)
//   epicycles(model, s, N)     → {pivots:[{x,y}…], arms:[{r,k,phase,angle}…]}
//   arms(model, N)             → [{r,k,phase}]  the machine spec, largest first
//   truncate(model, N)         → model with only the N largest arms
//   toWorld(model, N, radius, center) → {base:{x,y}, arms:[{r,k,phase}]} in px
//   errorVs(model, N, target, opts)   → {mean, max, rms} px
//   pickN(model, target, opts) → smallest N meeting a px tolerance
//
// COST. analyze() is O(M·(2·kMax+1)) with a precomputed trig table — 1024×257
// ≈ 0.26 M mults, measured 4–9 ms, and it runs ONCE at buildWorld. Evaluating
// the machine is N sin/cos pairs per step: measured 0.10 µs/step at N=8 and
// 0.30 µs at N=32 (node). Nothing here is a per-frame concern.
(function (BF) {
  'use strict';

  const TAU = Math.PI * 2;

  // ---- source resolution ---------------------------------------------------
  // A "source" is anything that can be sampled at s ∈ [0,1): a curve id from
  // BF.chainTraceCurves, a raw fn, or a closed polyline of points.
  function resolveFn(source) {
    if (typeof source === 'function') return source;
    if (typeof source === 'string') {
      const c = BF.chainTraceCurves && BF.chainTraceCurves.resolve(source);
      if (!c) throw new Error('curveFourier: unknown curve id "' + source + '"');
      return c.fn;
    }
    if (Array.isArray(source) && source.length >= 2) {
      const pts = source.map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
      const n = pts.length;
      return function (s) {
        const u = ((s % 1) + 1) % 1;
        const f = u * n, i = Math.floor(f) % n, t = f - Math.floor(f);
        const a = pts[i], b = pts[(i + 1) % n];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      };
    }
    throw new Error('curveFourier: source must be a curve id, fn(s), or point array');
  }

  // Even ("there-and-back") reparametrization — the DCT in disguise. s walks
  // the curve 0→1 over the first half of the loop and 1→0 over the second, so
  // the traversed path is continuous at the wrap even for an open stroke.
  function triWave(s) { const u = ((s % 1) + 1) % 1; return u < 0.5 ? 2 * u : 2 - 2 * u; }

  // The path the MACHINE actually draws for a given model mode. Error metrics
  // must compare against THIS, not the raw curve, or 'even' mode is graded
  // against a path it was never asked to trace.
  function pathFn(source, mode) {
    const fn = resolveFn(source);
    return (mode === 'even') ? (s => fn(triWave(s))) : fn;
  }

  // ---- analysis ------------------------------------------------------------
  function analyze(source, opts) {
    opts = opts || {};
    const M = Math.max(16, (opts.samples != null ? opts.samples : 1024) | 0);
    const mode = (opts.mode === 'even') ? 'even' : 'dft';
    const kMax = Math.max(1, Math.min(opts.kMax != null ? opts.kMax : 128, Math.floor(M / 2)));
    const path = pathFn(source, mode);

    const zx = new Float64Array(M), zy = new Float64Array(M);
    for (let m = 0; m < M; m++) { const p = path(m / M); zx[m] = p.x; zy[m] = p.y; }

    // Trig table indexed by (k·m mod M) — exact and ~4× faster than calling
    // Math.cos/sin inside the double loop.
    const cosT = new Float64Array(M), sinT = new Float64Array(M);
    for (let m = 0; m < M; m++) { cosT[m] = Math.cos(TAU * m / M); sinT[m] = Math.sin(TAU * m / M); }

    const terms = [];
    let dc = { x: 0, y: 0 };
    for (let k = -kMax; k <= kMax; k++) {
      let re = 0, im = 0;
      // e^{-i·2πkm/M}: index by (-k·m) mod M into the +2π table.
      let idx = 0;
      const stride = ((-k) % M + M) % M;
      for (let m = 0; m < M; m++) {
        const ca = cosT[idx], sa = sinT[idx];
        re += zx[m] * ca - zy[m] * sa;
        im += zx[m] * sa + zy[m] * ca;
        idx += stride; if (idx >= M) idx -= M;
      }
      re /= M; im /= M;
      if (k === 0) { dc = { x: re, y: im }; continue; }
      terms.push({ k: k, re: re, im: im, mag: Math.hypot(re, im), phase: Math.atan2(im, re) });
    }
    // Largest arm first — the provably optimal truncation order (see header).
    // Deterministic tie-break so equal-magnitude conjugate pairs never shuffle.
    terms.sort((a, b) => (b.mag - a.mag) || (Math.abs(a.k) - Math.abs(b.k)) || (a.k - b.k));

    // Parseval bookkeeping: total AC energy vs what the retained band captured.
    // A large residual means kMax is too low for this curve — surfaced rather
    // than silently truncated, because it would show up as a mystery error floor.
    let acEnergy = 0;
    for (let m = 0; m < M; m++) {
      const dx = zx[m] - dc.x, dy = zy[m] - dc.y;
      acEnergy += dx * dx + dy * dy;
    }
    acEnergy /= M;
    let captured = 0;
    for (let j = 0; j < terms.length; j++) captured += terms[j].mag * terms[j].mag;

    return {
      mode: mode, M: M, kMax: kMax, dc: dc, terms: terms,
      acEnergy: acEnergy, capturedEnergy: captured,
      residualEnergy: Math.max(0, acEnergy - captured),
      source: (typeof source === 'string') ? source : null,
    };
  }

  // ---- evaluation ----------------------------------------------------------
  function nArms(model, N) {
    return (N == null) ? model.terms.length : Math.max(0, Math.min(N | 0, model.terms.length));
  }

  // Truncated reconstruction in UNIT coords. s ∈ [0,1) is one loop OF THE
  // MACHINE (in 'even' mode that is one there-and-back pass of the stroke).
  function reconstruct(model, s, N) {
    const T = model.terms, n = nArms(model, N);
    let x = model.dc.x, y = model.dc.y;
    for (let j = 0; j < n; j++) {
      const t = T[j], a = TAU * t.k * s + t.phase;
      x += t.mag * Math.cos(a);
      y += t.mag * Math.sin(a);
    }
    return { x: x, y: y };
  }

  // The machine spec: arm j has length r (unit), turns k times per loop, and
  // starts at angle phase. Largest arm first.
  function arms(model, N) {
    const T = model.terms, n = nArms(model, N), out = [];
    for (let j = 0; j < n; j++) out.push({ r: T[j].mag, k: T[j].k, phase: T[j].phase });
    return out;
  }

  // Every pivot of the nested chain at parameter s: pivots[0] = base (the DC
  // centroid), pivots[n] = the drawing tip. This is what the renderer needs.
  function epicycles(model, s, N) {
    const T = model.terms, n = nArms(model, N);
    const pivots = [{ x: model.dc.x, y: model.dc.y }];
    const out = [];
    let x = model.dc.x, y = model.dc.y;
    for (let j = 0; j < n; j++) {
      const t = T[j], a = TAU * t.k * s + t.phase;
      out.push({ r: t.mag, k: t.k, phase: t.phase, angle: a });
      x += t.mag * Math.cos(a);
      y += t.mag * Math.sin(a);
      pivots.push({ x: x, y: y });
    }
    return { pivots: pivots, arms: out };
  }

  function truncate(model, N) {
    const n = nArms(model, N);
    const T = model.terms.slice(0, n);
    let captured = 0;
    for (let j = 0; j < n; j++) captured += T[j].mag * T[j].mag;
    return {
      mode: model.mode, M: model.M, kMax: model.kMax, dc: model.dc, terms: T,
      acEnergy: model.acEnergy, capturedEnergy: captured,
      residualEnergy: Math.max(0, model.acEnergy - captured), source: model.source,
    };
  }

  // Unit model → world px. `center`/`radius` use the SAME mapping the
  // chain-trace setup and the renderer use: world = center + unit·radius.
  function toWorld(model, N, radius, center) {
    const c = center || { x: 0, y: 0 };
    const R = (radius != null) ? radius : 1;
    return {
      base: { x: c.x + model.dc.x * R, y: c.y + model.dc.y * R },
      arms: arms(model, N).map(a => ({ r: a.r * R, k: a.k, phase: a.phase })),
    };
  }

  // ---- honest error metrics ------------------------------------------------
  // Mean / max / RMS |reconstruct(s) − drawnPath(s)| in px, at matching s, on a
  // DENSE grid deliberately different from the analysis grid (so an aliasing
  // bug cannot flatter the numbers by landing on the sample points).
  // `target` defaults to the model's own source; pass it explicitly when the
  // model was built from a point cloud but graded against the true curve.
  function errorVs(model, N, target, opts) {
    opts = opts || {};
    const R = (opts.radius != null) ? opts.radius : 140;
    const S = Math.max(64, (opts.samples != null ? opts.samples : 4096) | 0);
    const path = pathFn(target != null ? target : model.source, model.mode);
    let sum = 0, sumSq = 0, max = 0;
    for (let i = 0; i < S; i++) {
      const s = (i + 0.5) / S;            // offset grid — never hits a DFT sample
      const p = path(s), q = reconstruct(model, s, N);
      const d = Math.hypot(p.x - q.x, p.y - q.y) * R;
      sum += d; sumSq += d * d; if (d > max) max = d;
    }
    return { mean: sum / S, max: max, rms: Math.sqrt(sumSq / S), N: nArms(model, N), radius: R };
  }

  // "Reduce the arm count until it is small enough for the trainer and still
  // looks right" — the user's own loop, in code. Returns the smallest N whose
  // mean error ≤ tol (and max ≤ maxTol when given), or null if none qualifies.
  function pickN(model, target, opts) {
    opts = opts || {};
    const tol = (opts.tol != null) ? opts.tol : 15;      // px, mean
    const maxTol = (opts.maxTol != null) ? opts.maxTol : null;
    const cap = Math.min(opts.cap != null ? opts.cap : 32, model.terms.length);
    for (let n = 1; n <= cap; n++) {
      const e = errorVs(model, n, target, opts);
      if (e.mean <= tol && (maxTol == null || e.max <= maxTol)) return { N: n, err: e };
    }
    return null;
  }

  // ---- MEASURED defaults ---------------------------------------------------
  // Per-curve arm count, chosen by INK error (symmetric nearest-point distance
  // between the drawn polyline and the target polyline) rather than by the
  // pointwise-at-matching-s error. Ink is the right question for "does it still
  // LOOK like the shape": a truncation can have the shape right and the timing
  // slightly off, which pointwise punishes and the eye does not. Both are
  // reported; the recommendation uses ink.
  //   N       — "faithful": smallest N with ink-mean ≤ 5 px AND still ≤ 5 px for
  //             every larger N up to 40 (the stability clause matters — several
  //             curves dip under a threshold at small N and come back out).
  //   N10     — "recognizable": same rule at ≤ 10 px. Use when arms are scarce.
  //   inkPx / meanPx — ink-mean and pointwise-mean at N, traceRadius 140.
  //   mode    — the basis that wins for this curve: 'even' for OPEN strokes
  //             (pen-lift jump ⇒ permanent half-jump Gibbs in the plain DFT).
  // A frozen machine scores 178–237 px on these curves (the null baseline).
  const RECOMMENDED_N = {
    circle:    { N: 1,  N10: 1,  mode: 'dft',  inkPx: 0.0, meanPx: 0.0,  note: 'exact — one arm IS a circle' },
    line:      { N: 2,  N10: 2,  mode: 'dft',  inkPx: 0.0, meanPx: 0.0,  note: 'exact — a counter-rotating pair IS a line' },
    ellipse:   { N: 2,  N10: 2,  mode: 'dft',  inkPx: 0.0, meanPx: 0.0,  note: 'exact — k=−1 (98px) + k=+1 (42px)' },
    figure8:   { N: 4,  N10: 4,  mode: 'dft',  inkPx: 0.0, meanPx: 0.0,  note: 'exact — k=±1 (x) and k=±2 (y)' },
    triangle:  { N: 2,  N10: 2,  mode: 'dft',  inkPx: 3.0, meanPx: 6.8,  note: 'corners are CHEAP: harmonics k=1,−2,4,−5… only' },
    square:    { N: 2,  N10: 2,  mode: 'dft',  inkPx: 3.3, meanPx: 6.3,  note: 'corners are CHEAP: harmonics k=1,−3,5,−7… only' },
    wave:      { N: 8,  N10: 7,  mode: 'even', inkPx: 4.2, meanPx: 9.2,  note: 'open stroke — even basis or the max error never drops below 140px' },
    scriptS:   { N: 4,  N10: 4,  mode: 'even', inkPx: 4.2, meanPx: 8.4,  note: 'open stroke — even basis' },
    signature: { N: 8,  N10: 7,  mode: 'even', inkPx: 4.8, meanPx: 8.3,  note: 'open stroke — even basis' },
    cursive:   { N: 11, N10: 7,  mode: 'even', inkPx: 4.7, meanPx: 10.2, note: 'open + crossing loops — the expensive one' },
    flourish:  { N: 8,  N10: 5,  mode: 'dft',  inkPx: 3.9, meanPx: 6.3,  note: 'closed; a corner at each end of the stroke' },
    autograph: { N: 12, N10: 6,  mode: 'dft',  inkPx: 4.8, meanPx: 7.8,  note: 'closed C¹ spline — fastest decay of the lot (p≈3.2)' },
    // ---- the measured-difficulty signature set (chain_trace_curves.js) ------
    // All CLOSED by construction, so all plain 'dft' — the even basis costs
    // 2 arms per term and buys nothing without a pen-lift jump to smooth
    // (measured here too: swash even needs N=11 for what dft says in N=3).
    // The whole set is cheaper in arms than `autograph` except copperplate,
    // because a Catmull-Rom spline has no derivative jump anywhere.
    swash:      { N: 3,  N10: 2,  mode: 'dft',  inkPx: 4.7, meanPx: 6.8,  note: 'flattest stroke here — 3 arms draw it, 2 still read as a swash' },
    monogram:   { N: 7,  N10: 4,  mode: 'dft',  inkPx: 3.6, meanPx: 5.3,  note: 'the crossing loop is what costs the arms' },
    longhand:   { N: 8,  N10: 6,  mode: 'dft',  inkPx: 2.9, meanPx: 4.9,  note: 'five humps + underline, still cheaper than autograph' },
    balance:    { N: 16, N10: 8, mode: 'dft', inkPx: 4.1, meanPx: 7.7, note: 'Connected English word and underline; approximately constant arc-speed timing' },
    ascender:   { N: 5,  N10: 5,  mode: 'dft',  inkPx: 4.5, meanPx: 10.0, note: 'mirror twin of descender — identical spectrum, |c_k| is blind to the y sign' },
    descender:  { N: 5,  N10: 5,  mode: 'dft',  inkPx: 4.5, meanPx: 10.0, note: 'shape lands at N=5, TIMING lags (pointwise 10.0 vs ink 4.5) — the piecewise stroke has a non-uniform ds/dt' },
    copperplate: { N: 10, N10: 7, mode: 'dft',  inkPx: 4.6, meanPx: 6.8,  note: 'ascender + descender loops: the most expensive of the new set' },
  };
  function recommend(curveId) {
    return RECOMMENDED_N[curveId] ||
      { N: 12, N10: 8, mode: 'dft', inkPx: null, meanPx: null, note: 'no measurement — generic default' };
  }

  BF.curveFourier = {
    analyze, reconstruct, epicycles, arms, truncate, toWorld,
    errorVs, pickN, recommend, pathFn, triWave,
    RECOMMENDED_N,
  };
})(window.BF = window.BF || {});
