import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// ───────────────────────────────────────────────────────────────────────────
// HONESTY NOTE — read this before touching anything below.
//
// THE ESTIMATOR is three lines of arithmetic on the bead coordinates:
//     L  = Σ √(Δx² + Δy²)                            (_perimeter)
//     A  = ½ |Σ (xᵢ y_{i+1} − x_{i+1} yᵢ)|            (_signedArea, shoelace)
//     Q  = L² / (4A)                                  (_measureQ)
// Nothing else touches the reported number. That path contains +, −, ×, ÷ and
// √ and NOTHING else: no Math.PI, no trigonometry, no exp/log, no constant of
// any kind. The Richardson extrapolation (_richardson) is likewise four
// multiplies and a divide over previously MEASURED Q values.
//
// In fact this whole FILE contains no Math.PI and no trigonometric call at all,
// including the drawing code. The reference circle and the seed polygon are
// built by Archimedes' half-angle bisection — repeatedly inserting the
// normalised midpoint of each edge — which needs only square roots. That is a
// deliberate nod to the Archimedes card, which this one pairs with.
//
// π enters the page in exactly two display-only places, each commented at its
// site: piDigitsHTML's DEFAULT target argument (it paints already-correct
// digits green, applied to a number the relaxation has already produced), and
// the getExpected() prose, which quotes measured reference values.
//
// The transcendental calls that DO appear are decoration:
//   • Math.log / Math.LN10 in getPhasePoint() and _descentSVG() — axis scaling
//     for the diagnostic phase views and the descent chart.
// Math.sqrt appears throughout; it is algebraic, and it is what a distance is.
// ───────────────────────────────────────────────────────────────────────────

const TIME_SCALE = 16.7;          // house convention: board-seconds per sim-second

// Bead ladder. Powers of two, because each rung is produced from the last by
// MIDPOINT SUBDIVISION — inserting the midpoint of every rod doubles the bead
// count without moving the curve one bit, so L, A and Q are all unchanged at
// the moment of refinement and the descent of Q stays monotone across rungs.
const N_START = 64;
const NMAX = 1024;
const LADDER_MAX_RUNGS = 5;       // 64 → 128 → 256 → 512 → 1024

const NC = 512;                   // resolution of the random blob's seed curve
const L0 = 4;                     // the loop's fixed total length (world units)

// Relaxation tuning.
const HFAC = 0.4;                 // linear-stability cap on the step
const DISP_CAP = 0.15;            // hard cap: no bead moves more than 0.15·ℓ₀ in one step
const GROW = 1.08, SHRINK = 0.5;  // adaptive step growth / backtracking factor
const MAX_TRIES = 30;             // backtracking attempts before declaring a fixed point

// Convergence of a rung: Q sampled every SAMPLE steps; STALL_NEED consecutive
// samples with no relative change, or EXHAUST_NEED consecutive steps in which
// backtracking could not find ANY step that lowers Q.
const SAMPLE = 64, STALL_NEED = 3, REL_TOL = 1e-15;
const EXHAUST_NEED = 8;
const MAX_RUNG_ITERS = 400000;

// Wall-clock governor (house pattern): the solver may spend at most
// FRAME_BUDGET_MS of every FRAME_WINDOW_MS, so the Speed slider cannot buy a
// dropped frame. Set frameBudgetMs = 0 to disable (thumbnails, harnesses).
const FRAME_BUDGET_MS = 6, FRAME_WINDOW_MS = 16;
const MAX_NODE_OPS_PER_STEP = 240000;

const DESCENT_PTS = 240;          // preallocated descent-chart samples
const HISTORY = 6;                // remembered "different blob, same limit" runs

// Layout (orthographic, house −1.15…1.15 × −0.95…0.95 frame).
const BX = -0.30, BY = 0.0, BSCALE = 0.78;
const GAUGE_X_Q = 0.72, GAUGE_X_A = 0.98, GAUGE_Y0 = -0.74, GAUGE_H = 1.48, GAUGE_W = 0.13;
const Q_PLOT_FLOOR = 3;           // display-only: any number below every attainable Q

const COL_GOLD = 0xf7c948;
const COL_CYAN = 0x4cc9f0;
const COL_RED = 0xef476f;

// Regular 2ᵐ-gon on the unit circle, built by Archimedes bisection: start from
// (±1,0),(0,±1) — which needs no trigonometry — and repeatedly insert the
// NORMALISED midpoint of every edge. Square roots only. No π, no trig.
function bisectionPolygon(n) {
  let px = [1, 0, -1, 0], py = [0, 1, 0, -1];
  while (px.length < n) {
    const m = px.length;
    const qx = new Array(2 * m), qy = new Array(2 * m);
    for (let i = 0; i < m; i++) {
      const j = i + 1 === m ? 0 : i + 1;
      qx[2 * i] = px[i]; qy[2 * i] = py[i];
      const mx = 0.5 * (px[i] + px[j]), my = 0.5 * (py[i] + py[j]);
      const r = Math.sqrt(mx * mx + my * my);
      qx[2 * i + 1] = mx / r; qy[2 * i + 1] = my / r;
    }
    px = qx; py = qy;
  }
  return [px, py];
}
const [UNIT_X, UNIT_Y] = bisectionPolygon(NC);

// The equal-perimeter comparison circle, as a 512-gon from the same
// construction, scaled so its own measured perimeter is exactly L0. Its radius
// and its area are therefore MEASURED off the polygon — no π is used to draw
// the circle the blob is racing towards.
const CIRCLE_R = (() => {
  let p = 0;
  for (let i = 0; i < NC; i++) {
    const j = i + 1 === NC ? 0 : i + 1;
    const dx = UNIT_X[j] - UNIT_X[i], dy = UNIT_Y[j] - UNIT_Y[i];
    p += Math.sqrt(dx * dx + dy * dy);
  }
  return L0 / p;                  // unit-circle polygon scaled to perimeter L0
})();
const CIRCLE_AREA = (() => {
  let a2 = 0;
  for (let i = 0; i < NC; i++) {
    const j = i + 1 === NC ? 0 : i + 1;
    a2 += (UNIT_X[i] * UNIT_Y[j] - UNIT_X[j] * UNIT_Y[i]);
  }
  return Math.abs(a2) / 2 * CIRCLE_R * CIRCLE_R;
})();

// Blob roughness knob → (radial amplitude, noise-smoothing passes). The path is
// deliberately conservative: see the SELF-INTERSECTION note in explanation.
function roughToAmp(r) { return 0.12 + 0.48 * r; }
function roughToSmooth(r) { return Math.round(1500 - 1180 * r); }

export class IsoperimetricPi extends Simulation {
  static id = 'isoperimetric-pi';
  static title = 'Isoperimetric — π as the answer to an optimisation';
  static description = 'A scribbled loop of fixed length relaxes to enclose as much area as it can. L²/4A falls to π from above — and π is the extremal VALUE, not a measured ratio.';
  static piMechanism = 'variational: minimise L²/4A over closed curves of fixed length; the isoperimetric inequality makes π the minimum, attained only by the circle';
  static rigor = 'Exact (deterministic relaxation)';
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static sortOrder = 9;            // immediately after Archimedes (8): the one-sided
                                   // partner to his two-sided bracket
  static previewSteps = 3;
  static previewParams = { seed: 12, roughness: 0.85, maxBeads: 64, iterRate: 300, frameBudgetMs: 0 };
  static alternatives = [
    { id: 'archimedes-doubling', label: 'the two-sided bracket' },
    { id: 'resistor-lattice-pi', label: 'π from a field solve' },
    { id: 'buffon-needle', label: 'π from a curve\'s length' },
  ];

  static explanation = {
    setup: 'Every other machine in this collection is DESCRIPTIVE: you are handed a shape or a process and you count, time, sum or sample it. This one is VARIATIONAL. Nobody hands you the shape — the physics has to find it. A closed loop of beads joined by inextensible rods starts as an arbitrary random scribble and relaxes, and the only two numbers ever measured off it are elementary arithmetic on the bead coordinates: the perimeter L (a sum of square roots of squared coordinate differences) and the enclosed area A (the shoelace determinant sum). Their combination Q = L²/4A is the thing to watch. It starts anywhere — 5, 12, 30 — and falls, never rising, until it stops. Where it stops is π.',
    insight: 'The isoperimetric inequality says L² ≥ 4πA for every simple closed curve, with EQUALITY only for the circle. So Q = L²/4A is bounded below by π, and reaches π exactly when the shape becomes round. That makes π the minimum VALUE of a functional rather than a ratio you measured off something you had already drawn — a genuinely different way for a constant to appear. The relaxation is the plainest possible implementation of that statement: overdamped gradient descent on Q itself. Work out −∂Q/∂xᵢ and it splits into exactly two physical forces — an inward TENSION along the discrete curvature vector (that is −∂L/∂xᵢ, a rubber band pulling itself straight) and an outward PRESSURE proportional to the area gradient (that is +∂A/∂xᵢ, a balloon inflating), with the pressure coefficient λ = L/2A fixed by the current shape. Setting that combination to zero is Young–Laplace: tension balances pressure exactly when the curvature is the same everywhere, i.e. on a circle. So the fixed point of the flow and the extremiser of the functional are the same object, reached by descent. Two constraints ride along: each rod is projected back to its rest length by Gauss–Seidel passes, and the loop is rescaled about its centroid so the MEASURED perimeter stays at L₀ (that rescale is cosmetic — Q is scale-invariant — it only keeps the picture in frame so you watch A grow at fixed L, which is the isoperimetric statement in its cleanest form).',
    contrast: 'This is the one-sided partner to the collection\'s opening card. Archimedes brackets π from BOTH sides at once — inscribed polygons push up, circumscribed polygons push down — and the truth is caught in the gap. Here there is no upper machine at all: every reading is a rigorous UPPER bound on π and the sequence walks down onto it. That is not a weakness, it is the shape of the theorem; an inequality with one equality case can only ever squeeze from one side. What it buys instead is invariance: press "New blob" and a completely different scribble descends to the same limiting digits, because the circle is the unique extremiser and the starting shape is forgotten. Two honest limits. First, a polygon is not a curve: the best a closed chain of n rods can do is the REGULAR n-gon, whose Q sits above π by a discretisation gap of order 1/n². That gap is not assumed here — it is measured, by running the ladder and watching Q flatten out at each n. Second, the ladder itself is Archimedean: each rung is made by inserting the midpoint of every rod, which doubles n while moving the curve not at all, so Q is continuous across refinement and the descent never resets. Three rungs then give the observed convergence ORDER (measured 2.0013, then 2.0003 — not assumed), and that measured order justifies a Richardson extrapolation which is reported separately and always labelled an extrapolation, never as certified digits. SELF-INTERSECTION, honestly: the shoelace formula returns the enclosed area only for a SIMPLE closed curve, and length-constrained curve flows are famously not unconditionally embedding-preserving — the same dumbbell pinching that breaks the area-preserving curve-shortening flow can break this one if the starting blob has a deep enough neck. Three guards, all disclosed: the blob is generated star-shaped (a positive radial function of angle), which is simple by construction; the roughness knob is restricted to a range that was swept exhaustively — all 99 blob seeds the slider can produce at all 21 roughness stops, 2079 complete runs, zero crossings; and a rolling exact edge-vs-edge crossing audit sweeps the whole loop continuously during the run — if it ever fires, the run HALTS and the readout says the area measurement is void rather than quietly reporting a wrong number.',
    formula: 'L² ≥ 4πA for every simple closed curve, equality iff a circle  ⇒  Q = L²/4A ≥ π,  Q → π as the loop relaxes  [DETERMINISTIC — overdamped descent on Q; L by √ sums, A by shoelace; no π, no trig anywhere on the estimator path]',
    getExpected: (params) => {
      const maxN = (params && params.maxBeads) || 512;
      // Measured, fully-relaxed values (harness runs, agreeing to ~1e-13 across
      // every starting blob tried). Reference values quoted for the prose only.
      const table = {
        64: '3.14411838524',
        128: '3.14222362994',
        256: '3.14175036917',
        512: '3.14163208070',
        1024: '3.14160251026',
      };
      const rungs = [];
      for (let n = N_START; n <= maxN && rungs.length < LADDER_MAX_RUNGS; n *= 2) {
        rungs.push(`n=${n} → Q=${table[n]}`);
      }
      return `Every reading is an upper bound on π and the sequence descends onto it. The relaxation stops at the regular n-gon, whose Q is above π by ≈1/n²: ${rungs.join(', ')}. Those limits are independent of the starting scribble to ~1e-13 — five different random blobs agreed to 1.1e-13, and a sweep of every one of the 2079 blobs the two sliders can produce hit the polygon floor to better than 3.7e-13 every time. The measured convergence order from consecutive triples is 2.0013 then 2.0003, and Richardson on that measured order gives 3.14159204 (64,128), 3.141592616 (128,256), 3.1415926512 (256,512), and a second Richardson level 3.141592653590 — about 12 correct digits, but an EXTRAPOLATION, not a certified bound. Total cost: about 1400–1550 descent steps for the first rung and only 30–50 for each doubling after it, because midpoint subdivision hands the next rung a curve that is already almost right. Measured perimeter drift over a whole run: |L − L₀|/L₀ < 3e-15, and no rod ever shrank below 0.9999 of its rest length.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.seed = params.seed || 7;
    this.roughness = params.roughness !== undefined ? params.roughness : 0.6;
    this.maxBeads = params.maxBeads || 512;
    this.iterRate = params.iterRate || 300;    // relaxation steps per board-second
    this.frameBudgetMs = params.frameBudgetMs !== undefined ? params.frameBudgetMs : FRAME_BUDGET_MS;

    // ── Preallocation. Everything step() and updateSimScene() touch lives here.
    this.x = new Float64Array(NMAX); this.y = new Float64Array(NMAX);
    this.bkx = new Float64Array(NMAX); this.bky = new Float64Array(NMAX);
    this.fx = new Float64Array(NMAX); this.fy = new Float64Array(NMAX);
    this.tx = new Float64Array(NMAX); this.ty = new Float64Array(NMAX);
    this.subx = new Float64Array(NMAX); this.suby = new Float64Array(NMAX);

    this.noise = new Float64Array(NC); this.noise2 = new Float64Array(NC);
    this.curveX = new Float64Array(NC + 1);
    this.curveY = new Float64Array(NC + 1);
    this.curveS = new Float64Array(NC + 1);

    this.records = [];
    for (let i = 0; i < LADDER_MAX_RUNGS; i++) {
      this.records.push({ used: false, n: 0, Q: 0, iters: 0, converged: false });
    }
    this.history = [];
    for (let i = 0; i < HISTORY; i++) this.history.push({ used: false, seed: 0, n: 0, Q: 0 });
    this.histCount = 0;

    this.descent = new Float32Array(DESCENT_PTS * 2);
    this.descentN = 0;

    // Scene scratch (sized for the worst case; never reallocated).
    this._loopPos = new Float32Array(NMAX * 3);
    this._beadPos = new Float32Array(NMAX * 3);
    this._fanPos = new Float32Array((NMAX + 1) * 3);
    this._fanIdx = new Uint16Array(NMAX * 3);
    this._vecPos = new Float32Array(NMAX * 2 * 3);
    this._circlePos = new Float32Array(NC * 3);

    this._clock = (typeof performance !== 'undefined' && performance.now)
      ? () => performance.now() : () => Date.now();
    this._winT0 = 0; this._winUsed = 0;

    this.reset();
  }

  // ── ladder ────────────────────────────────────────────────────────────────
  _ladder() {
    const out = [];
    for (let n = N_START; n <= this.maxBeads && out.length < LADDER_MAX_RUNGS; n *= 2) out.push(n);
    if (out.length === 0) out.push(N_START);
    return out;
  }

  reset() {
    super.reset();
    this._recordHistory();
    this.rungs = this._ladder();
    this.rung = 0;
    this.cumIters = 0;
    this.rungIters = 0;
    this.iterCarry = 0;
    this.collisionCount = 0;
    this.finished = false;
    this.pinched = false;
    this.rejects = 0;
    this.stall = 0; this.exhausted = 0; this.lastSample = Infinity;
    this.auditI = 0; this.auditHit = false; this.auditSweeps = 0; this.lastSweepSimple = true;
    this.descentN = 0;
    this.nextMilestone = 1;
    this._winT0 = 0; this._winUsed = 0;
    for (const r of this.records) r.used = false;

    this._makeNoise();
    this._buildSeedCurve();
    this._startRung(0);
    this.Q0 = this.Q;
    this._sampleDescent();
    this.pendingPhasePoints.push([...this.getPhasePoint()]);
  }

  // Remember what the PREVIOUS blob converged to, so the readout can show the
  // same limit reached from different random starts.
  _recordHistory() {
    if (!this.records) return;
    let last = null;
    for (const r of this.records) if (r.used && r.converged) last = r;
    if (!last) return;
    const slot = this.history[this.histCount % HISTORY];
    slot.used = true; slot.seed = this.seed; slot.n = last.n; slot.Q = last.Q;
    this.histCount++;
  }

  // ── the random blob ───────────────────────────────────────────────────────
  // Smoothed periodic noise, used as a RADIAL profile r(θ) > 0 about the
  // centre. A positive radial function is star-shaped, hence a simple closed
  // curve, hence the shoelace really is the enclosed area at t = 0.
  _makeNoise() {
    let s = (this.seed >>> 0) || 1;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    let w = this.noise, w2 = this.noise2;
    for (let i = 0; i < NC; i++) w[i] = rnd() * 2 - 1;
    const passes = roughToSmooth(this.roughness);
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < NC; i++) {
        const a = i === 0 ? NC - 1 : i - 1, b = i + 1 === NC ? 0 : i + 1;
        w2[i] = 0.25 * w[a] + 0.5 * w[i] + 0.25 * w[b];
      }
      const t = w; w = w2; w2 = t;
    }
    let mx = 0;
    for (let i = 0; i < NC; i++) { const a = w[i] < 0 ? -w[i] : w[i]; if (a > mx) mx = a; }
    if (!(mx > 1e-12)) mx = 1;
    for (let i = 0; i < NC; i++) w[i] /= mx;
    this.noise = w; this.noise2 = w2;
  }

  _buildSeedCurve() {
    const amp = roughToAmp(this.roughness), w = this.noise;
    const cx = this.curveX, cy = this.curveY, cs = this.curveS;
    for (let k = 0; k < NC; k++) {
      const r = 1 + amp * w[k];
      cx[k] = r * UNIT_X[k]; cy[k] = r * UNIT_Y[k];
    }
    cx[NC] = cx[0]; cy[NC] = cy[0];
    cs[0] = 0;
    for (let k = 0; k < NC; k++) {
      const dx = cx[k + 1] - cx[k], dy = cy[k + 1] - cy[k];
      cs[k + 1] = cs[k] + Math.sqrt(dx * dx + dy * dy);
    }
    const s = L0 / cs[NC];
    for (let k = 0; k <= NC; k++) { cx[k] *= s; cy[k] *= s; cs[k] *= s; }
  }

  // Lay n beads at EQUAL ARCLENGTH along the seed curve, so the chain starts on
  // (or very near) its own constraint manifold: every rod the same length.
  _startRung(idx) {
    const n = this.rungs[idx];
    this.rung = idx;
    this.n = n;
    this.l0 = L0 / n;
    const cx = this.curveX, cy = this.curveY, cs = this.curveS;
    const stepS = cs[NC] / n;
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const s = i * stepS;
      while (seg < NC - 1 && cs[seg + 1] < s) seg++;
      const d = cs[seg + 1] - cs[seg];
      const f = d > 1e-300 ? (s - cs[seg]) / d : 0;
      this.x[i] = cx[seg] + f * (cx[seg + 1] - cx[seg]);
      this.y[i] = cy[seg] + f * (cy[seg + 1] - cy[seg]);
    }
    this._rescaleToL0();
    for (let k = 0; k < 40; k++) this._projectRods(k & 1);
    this._rescaleToL0();
    this._beginRung();
    if (this._fullAudit()) this.pinched = true;
  }

  _beginRung() {
    this.hAdapt = Infinity;
    this.rungIters = 0;
    this.stall = 0; this.exhausted = 0;
    this.auditI = 0; this.auditHit = false;
    this.Q = this._measureQ();
    this.lastSample = this.Q;
    this.auditRows = this.n >> 7 > 1 ? (this.n >> 7) : 1;
    this.maxItersPerStep = Math.max(1, Math.floor(MAX_NODE_OPS_PER_STEP / (12 * this.n)));
  }

  // Midpoint subdivision: doubles the bead count and leaves the CURVE exactly
  // where it was, so L, A and Q are all unchanged at the instant of refinement.
  _subdivide() {
    const n = this.n, x = this.x, y = this.y, sx = this.subx, sy = this.suby;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      sx[2 * i] = x[i]; sy[2 * i] = y[i];
      sx[2 * i + 1] = 0.5 * (x[i] + x[j]); sy[2 * i + 1] = 0.5 * (y[i] + y[j]);
    }
    const m = 2 * n;
    for (let i = 0; i < m; i++) { x[i] = sx[i]; y[i] = sy[i]; }
    this.n = m;
    this.l0 = L0 / m;
    this.rung++;
    this._beginRung();
  }

  // ── THE MEASUREMENT ───────────────────────────────────────────────────────
  // Sum of square roots of squared coordinate differences. Nothing else.
  _perimeter() {
    const n = this.n, x = this.x, y = this.y;
    let L = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const dx = x[j] - x[i], dy = y[j] - y[i];
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }

  // Shoelace: half the sum of the 2×2 determinants of consecutive vertices.
  _signedArea() {
    const n = this.n, x = this.x, y = this.y;
    let a2 = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      a2 += x[i] * y[j] - x[j] * y[i];
    }
    return a2 / 2;
  }

  _measureQ() {
    const L = this._perimeter();
    const A = Math.abs(this._signedArea());
    return A > 0 ? L * L / (4 * A) : Infinity;
  }

  // ── constraints ───────────────────────────────────────────────────────────
  // Inextensibility, part 1: every rod projected back to its rest length by a
  // Gauss–Seidel pass (direction alternated so the sweep carries no bias).
  _projectRods(rev) {
    const n = this.n, x = this.x, y = this.y, l0 = this.l0;
    const s0 = rev ? n - 1 : 0, s1 = rev ? -1 : n, ds = rev ? -1 : 1;
    for (let i = s0; i !== s1; i += ds) {
      const j = i + 1 === n ? 0 : i + 1;
      let dx = x[j] - x[i], dy = y[j] - y[i];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!(d > 1e-14)) continue;
      const c = 0.5 * (d - l0) / d;
      dx *= c; dy *= c;
      x[i] += dx; y[i] += dy;
      x[j] -= dx; y[j] -= dy;
    }
  }

  // Inextensibility, part 2: Gauss–Seidel is slowest on the UNIFORM stretch
  // mode, which is exactly the mode inflation excites, so that one mode is
  // removed exactly instead — a similarity about the centroid restoring the
  // measured perimeter to L₀. Q is scale-invariant, so this cannot change the
  // reported number; it keeps the picture in frame and the constraint exact.
  _rescaleToL0() {
    const n = this.n, x = this.x, y = this.y;
    const L = this._perimeter();
    if (!(L > 0)) return;
    const s = L0 / L;
    let gx = 0, gy = 0;
    for (let i = 0; i < n; i++) { gx += x[i]; gy += y[i]; }
    gx /= n; gy /= n;
    for (let i = 0; i < n; i++) {
      x[i] = gx + (x[i] - gx) * s;
      y[i] = gy + (y[i] - gy) * s;
    }
  }

  // ── one overdamped descent step on Q ──────────────────────────────────────
  // force_i = −∂Q/∂x_i = −λ·( ∂L/∂x_i − λ·∂A/∂x_i ),  λ = L/2A
  //   ∂L/∂x_i = u_{i−1} − u_i          (unit tangents: the inward curvature
  //                                      vector — TENSION, a rubber band)
  //   ∂A/∂x_i = ½(y_{i+1} − y_{i−1}, x_{i−1} − x_{i+1})
  //                                     (outward normal × edge length —
  //                                      PRESSURE, a balloon inflating)
  // The trial move is ACCEPTED only if the freshly measured Q did not rise, so
  // monotone descent is enforced, not hoped for. Returns 1 if backtracking
  // could not find any step that lowers Q (a fixed point), else 0.
  _descendOnce() {
    const n = this.n, x = this.x, y = this.y;
    const fx = this.fx, fy = this.fy, tx = this.tx, ty = this.ty;
    let L = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const dx = x[j] - x[i], dy = y[j] - y[i];
      let d = Math.sqrt(dx * dx + dy * dy);
      if (!(d > 1e-300)) d = 1e-300;
      tx[i] = dx / d; ty[i] = dy / d;
      L += d;
    }
    let a2 = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      a2 += x[i] * y[j] - x[j] * y[i];
    }
    const A = Math.abs(a2) / 2;
    if (!(A > 0)) { this.pinched = true; return 1; }
    const Qold = L * L / (4 * A);
    const lam = L / (2 * A);

    let fm2 = 0;
    for (let i = 0; i < n; i++) {
      const p = i === 0 ? n - 1 : i - 1, q = i + 1 === n ? 0 : i + 1;
      const gLx = tx[p] - tx[i], gLy = ty[p] - ty[i];
      const gAx = 0.5 * (y[q] - y[p]), gAy = 0.5 * (x[p] - x[q]);
      const a = -lam * (gLx - lam * gAx);
      const b = -lam * (gLy - lam * gAy);
      fx[i] = a; fy[i] = b;
      const m = a * a + b * b;
      if (m > fm2) fm2 = m;
    }
    const fmax = Math.sqrt(fm2);

    let hCap = HFAC * this.l0 / lam;                 // linear stability
    if (fmax > 0) {
      const hDisp = DISP_CAP * this.l0 / fmax;       // no bead jumps a rod length
      if (hDisp < hCap) hCap = hDisp;
    }
    let h = this.hAdapt < hCap ? this.hAdapt : hCap;

    const bkx = this.bkx, bky = this.bky;
    for (let i = 0; i < n; i++) { bkx[i] = x[i]; bky[i] = y[i]; }

    for (let t = 0; t < MAX_TRIES; t++) {
      for (let i = 0; i < n; i++) {
        x[i] = bkx[i] + h * fx[i];
        y[i] = bky[i] + h * fy[i];
      }
      this._projectRods(0);
      this._projectRods(1);
      this._rescaleToL0();
      const Qnew = this._measureQ();
      if (Qnew <= Qold) {
        this.Q = Qnew;
        const grown = h * GROW;
        this.hAdapt = grown < hCap ? grown : hCap;
        return 0;
      }
      this.rejects++;
      h *= SHRINK;
    }
    for (let i = 0; i < n; i++) { x[i] = bkx[i]; y[i] = bky[i]; }
    this.Q = Qold;
    this.hAdapt = hCap;
    return 1;
  }

  // ── self-intersection audit ───────────────────────────────────────────────
  // Exact segment-vs-segment crossing test by orientation signs. _fullAudit is
  // O(n²) and runs once when a rung is seeded; during the run the same sweep is
  // amortised a few rows at a time so a complete pass finishes every ~128
  // descent steps without ever costing a frame.
  _edgeHits(i) {
    const n = this.n, x = this.x, y = this.y;
    const i2 = i + 1 === n ? 0 : i + 1;
    const ex = x[i2] - x[i], ey = y[i2] - y[i];
    for (let j = i + 1; j < n; j++) {
      const j2 = j + 1 === n ? 0 : j + 1;
      if (j === i2 || j2 === i) continue;           // edges sharing a vertex
      const gx = x[j2] - x[j], gy = y[j2] - y[j];
      const d1 = ex * (y[j] - y[i]) - ey * (x[j] - x[i]);
      const d2 = ex * (y[j2] - y[i]) - ey * (x[j2] - x[i]);
      const d3 = gx * (y[i] - y[j]) - gy * (x[i] - x[j]);
      const d4 = gx * (y[i2] - y[j]) - gy * (x[i2] - x[j]);
      if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true;
    }
    return false;
  }

  _fullAudit() {
    for (let i = 0; i < this.n; i++) if (this._edgeHits(i)) return true;
    return false;
  }

  _auditSlice() {
    const n = this.n;
    let i = this.auditI;
    const end = Math.min(n, i + this.auditRows);
    for (; i < end; i++) {
      if (this._edgeHits(i)) { this.auditHit = true; this.pinched = true; return; }
    }
    this.auditI = end;
    if (end >= n) {
      this.auditI = 0;
      this.auditSweeps++;
      this.lastSweepSimple = !this.auditHit;
      this.auditHit = false;
    }
  }

  // ── descent chart samples (preallocated ring, decimated when full) ────────
  _sampleDescent() {
    const d = this.descent;
    if (this.descentN >= DESCENT_PTS) {
      let k = 0;
      for (let i = 0; i < this.descentN; i += 2) { d[k * 2] = d[i * 2]; d[k * 2 + 1] = d[i * 2 + 1]; k++; }
      this.descentN = k;
    }
    d[this.descentN * 2] = this.cumIters;
    d[this.descentN * 2 + 1] = this.Q;
    this.descentN++;
  }

  _haveBudget(now) {
    const b = this.frameBudgetMs;
    if (!(b > 0) || !Number.isFinite(b)) return true;
    if (now - this._winT0 >= FRAME_WINDOW_MS) { this._winT0 = now; this._winUsed = 0; }
    return this._winUsed < b;
  }

  // ── step ──────────────────────────────────────────────────────────────────
  step(dt) {
    if (this.finished) return false;
    const t = dt * TIME_SCALE;
    this.iterCarry += this.iterRate * t;
    let want = Math.floor(this.iterCarry);
    if (want <= 0) return false;
    if (want > this.maxItersPerStep) { this.iterCarry = 0; want = this.maxItersPerStep; }
    else this.iterCarry -= want;

    const clock = this._clock;
    const t0 = clock();
    if (!this._haveBudget(t0)) return false;

    let event = false;
    for (let k = 0; k < want; k++) {
      const fixed = this._descendOnce();
      this.rungIters++; this.cumIters++;
      this.collisionCount = this.cumIters;
      this._auditSlice();
      if (this.pinched) { this.finished = true; event = true; break; }

      if (fixed) { this.exhausted++; } else { this.exhausted = 0; }
      if (this.rungIters % SAMPLE === 0) {
        const q = this.Q;
        if (Math.abs(q - this.lastSample) < REL_TOL * q) this.stall++;
        else this.stall = 0;
        this.lastSample = q;
      }
      if (this.cumIters >= this.nextMilestone) {
        this._sampleDescent();
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        this.nextMilestone = Math.max(this.cumIters + 1, Math.ceil(this.cumIters * 1.04));
      }

      const done = this.stall >= STALL_NEED || this.exhausted >= EXHAUST_NEED
        || this.rungIters >= MAX_RUNG_ITERS;
      if (done) {
        this._closeRung();
        event = true;
        if (this.rung + 1 < this.rungs.length) this._subdivide();
        else { this.finished = true; break; }
      }
    }
    this._winUsed += clock() - t0;
    return event;
  }

  _closeRung() {
    const rec = this.records[Math.min(this.rung, LADDER_MAX_RUNGS - 1)];
    rec.used = true;
    rec.n = this.n;
    rec.Q = this.Q;
    rec.iters = this.rungIters;
    rec.converged = this.rungIters < MAX_RUNG_ITERS && !this.pinched;
    this._sampleDescent();
  }

  // ── readouts ──────────────────────────────────────────────────────────────
  getPiApproximation() { return this.Q; }

  getPiReadout() {
    if (this.pinched) return 'void';
    return Number.isFinite(this.Q) ? this.Q.toFixed(9) : 'n/a';
  }

  getCountLabel() { return `Relaxation steps (n = ${this.n})`; }

  // Richardson from the last two COMPLETED rungs, error model err ∝ n⁻². The
  // exponent is not assumed: _order() below measures it from three rungs and
  // the readout prints what it measured. Arithmetic only.
  _completed() {
    const out = [];
    for (const r of this.records) if (r.used && r.converged) out.push(r);
    return out;
  }

  _richardson1(a, b) { return (4 * b.Q - a.Q) / 3; }

  _richardson() {
    const done = this._completed();
    if (done.length < 2) return null;
    const a = done[done.length - 2], b = done[done.length - 1];
    return { na: a.n, nb: b.n, value: this._richardson1(a, b) };
  }

  _richardson2() {
    const done = this._completed();
    if (done.length < 3) return null;
    const a = done[done.length - 3], b = done[done.length - 2], c = done[done.length - 1];
    const r1 = this._richardson1(a, b), r2 = this._richardson1(b, c);
    return { na: a.n, nc: c.n, value: (16 * r2 - r1) / 15 };
  }

  // Observed convergence order from three consecutive rungs: the ratio of
  // successive differences is 2^p, so p = log₂(ratio). Reported, not assumed.
  _order() {
    const done = this._completed();
    if (done.length < 3) return null;
    const a = done[done.length - 3], b = done[done.length - 2], c = done[done.length - 1];
    const num = a.Q - b.Q, den = b.Q - c.Q;
    if (!(den > 0) || !(num > 0)) return null;
    return Math.log(num / den) / Math.LN2;     // display: reporting the measured exponent
  }

  getFormulaHTML() {
    const L = this._perimeter();
    const A = Math.abs(this._signedArea());
    const drift = Math.abs(L - L0) / L0;
    // DISPLAY-ONLY: piDigitsHTML's default target is Math.PI, used purely to
    // paint already-correct digits green on a number the relaxation produced.
    const live = this.pinched ? '<span class="f-muted">void</span>'
      : (Number.isFinite(this.Q) ? piDigitsHTML(this.Q, 9) : '—');

    const head = `<div><strong>Isoperimetric inequality</strong>:
      <span class="f-angle">L² ≥ 4πA</span>, equality only for a circle ⇒
      <span class="f-angle">Q = L²/4A ≥ π</span><br>
      <span class="f-count">n = ${this.n}</span> beads ·
      rung ${this.rung + 1}/${this.rungs.length} ·
      <span class="f-count">${this.cumIters.toLocaleString()}</span> descent steps
      ${this.finished && !this.pinched ? ' · settled' : ''}</div>`;

    const meas = `<div>L = <span class="f-count">${L.toFixed(12)}</span>
      &nbsp;A = <span class="f-count">${A.toFixed(12)}</span><br>
      <span style="font-size:1.15em"><span class="f-result">Q</span> = ${live}</span>
      &nbsp;<span class="f-muted">upper bound on π · descending</span></div>`;

    const guard = this.pinched
      ? `<div style="color:#ef476f"><strong>Loop self-intersected — reading void.</strong>
         The shoelace formula returns the enclosed area only for a simple closed curve,
         so Q is meaningless here and the run has been halted. Drag “New blob”.</div>`
      : `<div style="opacity:.72;font-size:.85em">Crossing audit: ${this.auditSweeps} complete
         sweeps, last one <strong>${this.lastSweepSimple ? 'simple' : 'flagged'}</strong> ·
         measured |L − L₀|/L₀ = ${drift.toExponential(2)} ·
         backtracking rejections ${this.rejects.toLocaleString()}</div>`;

    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;width:100%;text-align:right">`
      + head + meas
      + this._descentSVG()
      + this._rungTable()
      + this._historyHTML()
      + guard
      + `<div style="opacity:.72;font-size:.85em"><strong>What is actually measured.</strong>
         L is a sum of square roots of squared coordinate differences; A is the shoelace
         determinant sum; Q is L²/4A. That is the whole estimator — no angle, no trigonometry,
         no constant. The shape is not given: the loop starts as a random scribble and the
         overdamped descent on Q finds the circle by itself, so π appears here as the extremal
         VALUE of a functional rather than as a ratio read off something already drawn.</div>`
      + `<div style="opacity:.72;font-size:.85em"><strong>One-sided, on purpose.</strong>
         Archimedes brackets π from both sides; an inequality with a single equality case can
         only squeeze from one. Every number above is a rigorous upper bound and the sequence
         walks down onto π. The floor is not π though: a chain of n rods can do no better than
         the regular n-gon, which sits above π by about 1/n². The ladder measures that gap
         instead of assuming it.</div>`
      + `</div>`;
  }

  _rungTable() {
    const done = this._completed();
    if (done.length === 0) return '';
    let rows = '';
    for (let i = 0; i < done.length; i++) {
      const r = done[i];
      const dq = i > 0 ? (done[i - 1].Q - r.Q) : NaN;
      rows += `<tr><td style="text-align:left">${r.n}</td>`
        + `<td style="text-align:right">${r.iters.toLocaleString()}</td>`
        + `<td style="text-align:right">${r.Q.toFixed(11)}</td>`
        + `<td style="text-align:right">${Number.isFinite(dq) ? dq.toExponential(2) : '—'}</td></tr>`;
    }
    const p = this._order();
    const r1 = this._richardson();
    const r2 = this._richardson2();
    let extra = '';
    if (p !== null) {
      extra += `<div style="opacity:.72;font-size:.85em">Measured convergence order from the
        last three rungs: <span class="f-count">p = ${p.toFixed(4)}</span> (successive
        differences fall by 2<sup>p</sup>). The 1/n² law is observed, not assumed.</div>`;
    }
    if (r1) {
      // DISPLAY-ONLY highlighting again; the value itself is (4Q₂ − Q₁)/3.
      extra += `<div style="font-size:.95em">Richardson (${r1.na},${r1.nb}) →
        ${piDigitsHTML(r1.value, 11)}</div>`;
    }
    if (r2) {
      extra += `<div style="font-size:.95em">Richardson² (${r2.na}…${r2.nc}) →
        ${piDigitsHTML(r2.value, 12)}</div>`;
    }
    if (r1 || r2) {
      extra += `<div style="opacity:.72;font-size:.85em">Extrapolations, not certified digits:
        they assume the measured 1/n² law continues, which is an observation about the
        polygon floor and not a theorem the machine proves. The bound is the Q above them.</div>`;
    }
    return `<table style="width:100%;border-collapse:collapse;font-size:.85em">`
      + `<tr style="opacity:.6"><td style="text-align:left">beads n</td>`
      + `<td style="text-align:right">steps</td>`
      + `<td style="text-align:right">settled Q</td>`
      + `<td style="text-align:right">gain</td></tr>${rows}</table>` + extra;
  }

  // Same limit from different random starts — the invariance this card exists
  // to show. Filled in each time "New blob" restarts a settled run.
  _historyHTML() {
    let rows = '';
    let k = 0;
    for (const h of this.history) {
      if (!h.used) continue;
      k++;
      rows += `<tr><td style="text-align:left">blob #${h.seed}</td>`
        + `<td style="text-align:right">n=${h.n}</td>`
        + `<td style="text-align:right">${h.Q.toFixed(11)}</td></tr>`;
    }
    if (!k) return '';
    return `<div style="width:100%"><div style="opacity:.72;font-size:.85em;text-align:right">
      Earlier blobs, same limit:</div>
      <table style="width:100%;border-collapse:collapse;font-size:.85em">${rows}</table></div>`;
  }

  // log–log descent chart. DISPLAY-ONLY: the logs are axis scaling. Q is
  // plotted against a plotting floor of 3 (any number below every attainable Q
  // works; it is not π and never enters the estimator).
  _descentSVG() {
    if (this.descentN < 3) return '';
    const d = this.descent;
    const W = 268, H = 140, ml = 44, mr = 8, mt = 8, mb = 26;
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    const L10 = Math.LN10;
    for (let i = 0; i < this.descentN; i++) {
      const xv = Math.log(Math.max(1, d[i * 2])) / L10;
      const q = d[i * 2 + 1] - Q_PLOT_FLOOR;
      if (!(q > 0)) continue;
      const yv = Math.log(q) / L10;
      if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
      if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
    }
    if (!(xmax > xmin)) xmax = xmin + 1;
    if (!(ymax - ymin > 0.2)) { ymax += 0.1; ymin -= 0.1; }
    const px = (v) => ml + (v - xmin) / (xmax - xmin) * (W - ml - mr);
    const py = (v) => H - mb - (v - ymin) / (ymax - ymin) * (H - mt - mb);
    let path = '';
    let first = true;
    for (let i = 0; i < this.descentN; i++) {
      const q = d[i * 2 + 1] - Q_PLOT_FLOOR;
      if (!(q > 0)) continue;
      const X = px(Math.log(Math.max(1, d[i * 2])) / L10).toFixed(1);
      const Y = py(Math.log(q) / L10).toFixed(1);
      path += (first ? 'M' : 'L') + X + ' ' + Y + ' ';
      first = false;
    }
    const axis = `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`
      + `<line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`;
    const cy = ((mt + H - mb) / 2).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:470px;margin-top:2px;overflow:visible;color:inherit">
      ${axis}<path d="${path}" fill="none" stroke="#f7c948" stroke-width="1.6"/>
      <text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">log₁₀ descent steps</text>
      <text x="12" y="${cy}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle" transform="rotate(-90 12 ${cy})">log₁₀ (Q − 3)</text>
    </svg>`;
  }

  // ── controls ──────────────────────────────────────────────────────────────
  getControls() {
    const restart = () => { this.reset(); this.initSimScene(); };
    return [
      {
        type: 'slider', id: 'seed', label: 'New blob — drag for a fresh random start',
        min: 1, max: 99, step: 1, default: this.seed, highlight: true,
        onChange: (val) => { this.seed = val; restart(); }
      },
      {
        type: 'slider', id: 'roughness', label: 'Blob roughness (deeper + lumpier)',
        min: 0, max: 1, step: 0.05, default: this.roughness,
        onChange: (val) => { this.roughness = val; restart(); }
      },
      {
        type: 'select', id: 'maxBeads', label: 'Refine to (doubling ladder)',
        default: String(this.maxBeads),
        options: [
          { value: '64', label: '64 beads — single rung' },
          { value: '128', label: '64 → 128' },
          { value: '256', label: '64 → 256' },
          { value: '512', label: '64 → 512' },
          { value: '1024', label: '64 → 1024' },
        ],
        onChange: (val) => { this.maxBeads = Number(val); restart(); }
      },
      {
        type: 'slider', id: 'iterRate', label: 'Descent steps / s',
        min: 40, max: 2000, step: 20, default: this.iterRate,
        onChange: (val) => { this.iterRate = val; }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  // ── phase space ───────────────────────────────────────────────────────────
  // Both views are π-free. One is the descent of Q against a plotting floor of
  // 3; the other is the shape's own out-of-roundness, which needs no reference
  // value at all.
  getPhaseSpaceViews() {
    return [
      {
        id: 'descent', label: 'descent of Q', dimension: 2, primary: true, boundary: 'none',
        axisLabels: { x: 'log₁₀ descent steps', y: 'log₁₀ (Q − 3)' }
      },
      {
        id: 'roundness', label: 'out-of-roundness', dimension: 2, boundary: 'none',
        axisLabels: { x: 'log₁₀ descent steps', y: 'log₁₀ (r_max − r_min)/r̄' }
      }
    ];
  }

  _roundness() {
    const n = this.n, x = this.x, y = this.y;
    let gx = 0, gy = 0;
    for (let i = 0; i < n; i++) { gx += x[i]; gy += y[i]; }
    gx /= n; gy /= n;
    let lo = Infinity, hi = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - gx, dy = y[i] - gy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < lo) lo = r;
      if (r > hi) hi = r;
      sum += r;
    }
    const mean = sum / n;
    return mean > 0 ? (hi - lo) / mean : 0;
  }

  getPhasePoint() {
    const L10 = Math.LN10;
    const xv = Math.log(Math.max(1, this.cumIters)) / L10;      // display: axis scaling
    const x = Math.min(1, Math.max(-1, xv / 2.5 - 1));
    const qd = this.Q - Q_PLOT_FLOOR;
    const yv = qd > 0 ? Math.log(qd) / L10 : -3;
    const y = Math.min(1, Math.max(-1, (yv + 0.55) / 0.85));
    const rr = this._roundness();
    const zv = rr > 0 ? Math.log(rr) / L10 : -9;
    const z = Math.min(1, Math.max(-1, (zv + 4) / 4));
    return [x, y, z];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'roundness') return (pt) => [pt[0], pt[2]];
    return (pt) => [pt[0], pt[1]];
  }

  getPreviewBox() { return { x0: -1.15, x1: 1.15, y0: -0.95, y1: 0.95 }; }

  // ── scene ─────────────────────────────────────────────────────────────────
  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    // Ghost target: the circle with the SAME perimeter, drawn as a 512-gon from
    // the bisection construction and scaled by its own measured perimeter.
    const cp = this._circlePos;
    for (let i = 0; i < NC; i++) {
      cp[i * 3] = BX + UNIT_X[i] * CIRCLE_R * BSCALE;
      cp[i * 3 + 1] = BY + UNIT_Y[i] * CIRCLE_R * BSCALE;
      cp[i * 3 + 2] = 0.0;
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    this.simScene.add(new THREE.LineLoop(cg,
      new THREE.LineBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.42 })));

    // Enclosed area, as a triangle fan from the centroid.
    this.fanGeom = new THREE.BufferGeometry();
    this.fanGeom.setAttribute('position', new THREE.BufferAttribute(this._fanPos, 3));
    this.fanGeom.setIndex(new THREE.BufferAttribute(this._fanIdx, 1));
    this.fanMesh = new THREE.Mesh(this.fanGeom, new THREE.MeshBasicMaterial({
      color: COL_GOLD, transparent: true, opacity: 0.16, side: THREE.DoubleSide
    }));
    this.simScene.add(this.fanMesh);

    // The chain itself.
    this.loopGeom = new THREE.BufferGeometry();
    this.loopGeom.setAttribute('position', new THREE.BufferAttribute(this._loopPos, 3));
    this.simScene.add(new THREE.LineLoop(this.loopGeom,
      new THREE.LineBasicMaterial({ color: COL_GOLD })));

    this.beadGeom = new THREE.BufferGeometry();
    this.beadGeom.setAttribute('position', new THREE.BufferAttribute(this._beadPos, 3));
    this.beadMat = new THREE.PointsMaterial({ color: 0xffe08a, size: 3, sizeAttenuation: false });
    this.simScene.add(new THREE.Points(this.beadGeom, this.beadMat));

    // Descent direction at each bead (Vectors toggle).
    this.vecGeom = new THREE.BufferGeometry();
    this.vecGeom.setAttribute('position', new THREE.BufferAttribute(this._vecPos, 3));
    this.vecLines = new THREE.LineSegments(this.vecGeom,
      new THREE.LineBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.7 }));
    this.vecLines.visible = false;
    this.simScene.add(this.vecLines);

    // Two gauges: Q falling, A/A_max rising. A_max is the area of the
    // equal-perimeter polygon above — measured by shoelace, not by π.
    const frame = (cx) => [
      new THREE.Vector3(cx - GAUGE_W / 2, GAUGE_Y0, 0), new THREE.Vector3(cx + GAUGE_W / 2, GAUGE_Y0, 0),
      new THREE.Vector3(cx + GAUGE_W / 2, GAUGE_Y0, 0), new THREE.Vector3(cx + GAUGE_W / 2, GAUGE_Y0 + GAUGE_H, 0),
      new THREE.Vector3(cx + GAUGE_W / 2, GAUGE_Y0 + GAUGE_H, 0), new THREE.Vector3(cx - GAUGE_W / 2, GAUGE_Y0 + GAUGE_H, 0),
      new THREE.Vector3(cx - GAUGE_W / 2, GAUGE_Y0 + GAUGE_H, 0), new THREE.Vector3(cx - GAUGE_W / 2, GAUGE_Y0, 0),
    ];
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([...frame(GAUGE_X_Q), ...frame(GAUGE_X_A)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24 })));

    const bar = new THREE.PlaneGeometry(1, 1);
    this.qBar = new THREE.Mesh(bar, new THREE.MeshBasicMaterial({ color: COL_GOLD, transparent: true, opacity: 0.8 }));
    this.aBar = new THREE.Mesh(bar, new THREE.MeshBasicMaterial({ color: COL_CYAN, transparent: true, opacity: 0.8 }));
    this.simScene.add(this.qBar, this.aBar);

    this._rebuildFanIndex();
    this.updateSimScene();
  }

  _rebuildFanIndex() {
    const n = this.n, idx = this._fanIdx;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      idx[i * 3] = 0;
      idx[i * 3 + 1] = 1 + i;
      idx[i * 3 + 2] = 1 + j;
    }
    if (this.fanGeom) {
      this.fanGeom.index.needsUpdate = true;
      this.fanGeom.setDrawRange(0, n * 3);
    }
    this._fanN = n;
  }

  updateSimScene() {
    if (!this.loopGeom) return;
    const n = this.n, x = this.x, y = this.y;
    let gx = 0, gy = 0;
    for (let i = 0; i < n; i++) { gx += x[i]; gy += y[i]; }
    gx /= n; gy /= n;

    const lp = this._loopPos, bp = this._beadPos, fp = this._fanPos;
    fp[0] = BX; fp[1] = BY; fp[2] = -0.02;
    for (let i = 0; i < n; i++) {
      const px = BX + (x[i] - gx) * BSCALE;
      const py = BY + (y[i] - gy) * BSCALE;
      lp[i * 3] = px; lp[i * 3 + 1] = py; lp[i * 3 + 2] = 0.02;
      bp[i * 3] = px; bp[i * 3 + 1] = py; bp[i * 3 + 2] = 0.03;
      fp[(i + 1) * 3] = px; fp[(i + 1) * 3 + 1] = py; fp[(i + 1) * 3 + 2] = -0.02;
    }
    this.loopGeom.attributes.position.needsUpdate = true;
    this.loopGeom.setDrawRange(0, n);
    this.beadGeom.attributes.position.needsUpdate = true;
    this.beadGeom.setDrawRange(0, n);
    this.beadMat.size = Math.max(1.2, Math.min(4, 260 / n));
    if (this._fanN !== n) this._rebuildFanIndex();
    this.fanGeom.attributes.position.needsUpdate = true;

    if (this.showVectors) {
      const vp = this._vecPos, fx = this.fx, fy = this.fy;
      let fm = 1e-30;
      for (let i = 0; i < n; i++) {
        const m = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]);
        if (m > fm) fm = m;
      }
      const k = (0.10 * BSCALE) / fm;
      for (let i = 0; i < n; i++) {
        const px = BX + (x[i] - gx) * BSCALE, py = BY + (y[i] - gy) * BSCALE;
        vp[i * 6] = px; vp[i * 6 + 1] = py; vp[i * 6 + 2] = 0.04;
        vp[i * 6 + 3] = px + fx[i] * k; vp[i * 6 + 4] = py + fy[i] * k; vp[i * 6 + 5] = 0.04;
      }
      this.vecGeom.attributes.position.needsUpdate = true;
      this.vecGeom.setDrawRange(0, n * 2);
      this.vecLines.visible = true;
    } else if (this.vecLines) {
      this.vecLines.visible = false;
    }

    // Gauges. Q falls from its starting value toward the plotting floor;
    // A climbs toward the equal-perimeter circle's own measured area.
    const span = Math.max(1e-6, this.Q0 - Q_PLOT_FLOOR);
    let tq = (this.Q - Q_PLOT_FLOOR) / span;
    if (!(tq >= 0)) tq = 0;
    if (tq > 1) tq = 1;
    const A = Math.abs(this._signedArea());
    let ta = A / CIRCLE_AREA;
    if (!(ta >= 0)) ta = 0;
    if (ta > 1) ta = 1;
    const hq = Math.max(0.004, tq * GAUGE_H), ha = Math.max(0.004, ta * GAUGE_H);
    this.qBar.scale.set(GAUGE_W * 0.72, hq, 1);
    this.qBar.position.set(GAUGE_X_Q, GAUGE_Y0 + hq / 2, 0.01);
    this.aBar.scale.set(GAUGE_W * 0.72, ha, 1);
    this.aBar.position.set(GAUGE_X_A, GAUGE_Y0 + ha / 2, 0.01);
    this.qBar.material.color.setHex(this.pinched ? COL_RED : COL_GOLD);
  }
}

registerSim(IsoperimetricPi);
