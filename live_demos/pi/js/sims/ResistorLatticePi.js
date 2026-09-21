import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

// ───────────────────────────────────────────────────────────────────────────
// HONESTY NOTE — read this before touching anything below.
//
// The estimator path is: build an all-INTEGER graph Laplacian (degree on the
// diagonal, −1 per lattice edge), solve L·v = b by conjugate gradient, read the
// node potentials, form R = v(A) − v(B), and divide 2/R. That path contains
// only +, −, × and ÷. There is NO Math.PI, no trig, no exp/log, no atan, no
// transcendental call of any kind anywhere between the lattice and the number
// on the readout. π is not put in; it comes out of a grid of identical
// resistors, which is the whole point.
//
// The displayed estimate and boundary bracket both come from these solves,
// without comparison against a stored value of π.
//
// The transcendental calls that DO appear are all decoration, each commented at
// its site:
//   • Math.log / Math.LN10 in getPhasePoint() and _driftSVG() — log axis scaling
//     for the diagnostic phase views and the drift chart;
//   • Math.pow (three sites) in _shade() and updateSimScene() — the colour ramps
//     that compress the 1/r dipole falloff and the edge currents so the outer
//     lattice is visible at all.
// Math.sqrt appears once, to print the residual; sqrt is algebraic anyway, and
// the CG stopping test compares SQUARED residuals so the inner loop never calls it.
// ───────────────────────────────────────────────────────────────────────────

const TIME_SCALE = 16.7;          // house convention: board-seconds per sim-second

// Preallocation ceiling. Every Float64Array below is sized for MAX_N² once, in
// the constructor, and never reallocated — reset() and rung changes only refill
// the first N² entries.
const MAX_N = 201;
const MAX_NODES = MAX_N * MAX_N;  // 40 401

// Two independent throttles keep this at 60 fps:
//  1. a per-step ceiling on CG iterations, so ONE step() call never blocks —
//     iterations ≤ (node-ops budget) / (nodes × active solvers);
//  2. a wall-clock governor, because main.js calls step() ~speed×10 times per
//     frame and the Speed slider would otherwise let the user spend a whole
//     frame inside the solver. The governor spends at most FRAME_BUDGET_MS of
//     every FRAME_WINDOW_MS on solving; past that, Speed stops buying work.
const MAX_NODE_OPS_PER_STEP = 60000;
const FRAME_BUDGET_MS = 6;
const FRAME_WINDOW_MS = 16;

// CG stopping rule: squared relative residual. Compared squared so the inner
// loop never calls sqrt (sqrt is algebraic, not transcendental, but it is also
// pointless work here). sqrt is used only to *display* the residual.
const RES_TOL2 = 1e-18;           // ‖r‖/‖b‖ < 1e-9
const MAX_IT_FACTOR = 45;         // hard iteration cap = MAX_IT_FACTOR × N

// Refinement ladder. Doubling-ish sizes so a Richardson extrapolation in N has
// clean pairs to work with. Capped at 6 rungs by construction.
const LADDER = [11, 21, 41, 81, 161];
const MAX_RUNGS = 6;

// Zoom window: an odd 9×9 patch of the lattice around the terminal pair.
const ZW = 9;
const ZEDGES = 2 * ZW * (ZW - 1);   // 144 edges inside the patch

// Layout (orthographic, matches the house −1.15…1.15 × −0.95…0.95 frame).
const FX = -0.56, FY = 0.30, FH = 0.44;   // full-lattice panel centre + half-size
const ZX = 0.56, ZY = 0.30, ZH = 0.44;    // zoom panel centre + half-size
const BAR_Y0 = -0.30, BAR_DY = 0.075;     // bracket-ladder bars stack downward
const AXIS_Y = -0.80, AXIS_X0 = -1.02, AXIS_X1 = 1.02;

// Linear vertex colours: a dark neutral, then saturated opposing potentials.
// Keep current gold so voltage sign and current strength are distinct channels.
const C_ZERO = [0.014, 0.022, 0.043];
const C_POS = [0.025, 0.90, 0.59];   // mint — positive potential
const C_NEG = [1.00, 0.045, 0.17];   // rose — negative potential
const COL_GOLD = 0xffd166;
const COL_MINT = 0x48f5cf;
const COL_ROSE = 0xff537c;
const COL_VIOLET = 0xa28bfa;

export class ResistorLatticePi extends Simulation {
  static id = 'resistor-lattice-pi';
  static title = 'Resistor Lattice π — an infinite grid of 1 Ω resistors';
  static description = 'Every node wired to its four neighbours by identical 1 Ω resistors. The resistance between two diagonal neighbours is 2/π Ω — so π = 2/R.';
  static piMechanism = 'discrete potential theory: solve the integer grid Laplacian for a unit current injected at (0,0) and drawn at (1,1); the lattice Green\'s function gives R = 2/π exactly';
  static rigor = 'Exact (deterministic solve)';
  static sortOrder = 57.75;
  static piNature = 'bounded';
  static piLabel = 'π ≈';
  static previewSteps = 14;
  // frameBudgetMs 0 disables the wall-clock governor: the thumbnail renderer
  // runs its steps in one synchronous burst, so there are no frames to protect.
  static previewParams = { N: 41, autoRefine: false, iterRate: 90, frameBudgetMs: 0 };
  static alternatives = [
    { id: 'mandelbrot-pi', label: 'Mandelbrot neck' },
    { id: 'random-matrix-pi', label: 'Wigner surmise' },
    { id: 'gauss-circle-lattice', label: 'Lattice-point count' },
  ];

  static explanation = {
    setup: 'Take the infinite square lattice ℤ² and solder a 1 Ω resistor along every edge — every node joined to its four neighbours, identical parts everywhere, no circle drawn, no angle chosen, no randomness. Now inject 1 A at the node (0,0) and draw 1 A out at the diagonal neighbour (1,1), and ask what resistance the ammeter sees. The answer is exactly 2/π Ω ≈ 0.6366198 Ω, so π = 2/R. This sim builds a finite N×N piece of that lattice with the terminals at its centre, writes down the graph Laplacian L (degree on the diagonal, −1 for every resistor), and solves L·v = b for the node potentials with conjugate gradient. R is then just v(0,0) − v(1,1). Be plain about what you are watching: the animation shows solver iterations rather than a physical electrical transient; the iterations you see are a numerical method grinding a linear system down, and each frame shows the potential field the solver currently believes in.',
    insight: 'Why is there a π in a box of resistors? Because the lattice Green\'s function is a Fourier integral over the torus. Superposing "1 A in at the origin, and out at infinity" with its mirror gives R(x,y) = (1/π²)∫∫ [1 − cos(kₓx + k_yy)] / [2 − cos kₓ − cos k_y] dkₓ dk_y over [−π,π]². For the diagonal (1,1) the integral collapses to 2/π; for a nearest neighbour it collapses to 1/2. That is the same reason π keeps turning up in random walks on ℤ² — the walk\'s return probability, the lattice Green\'s function and this resistance are three faces of one object (R = 2/(π) comes from the two-dimensional walk being exactly, marginally recurrent). But the sim never touches that integral. It touches only integers: the matrix entries are 4, 3, 2 and −1, the right-hand side is +1 and −1, and conjugate gradient does nothing but multiply, add and divide. π falls out of arithmetic on a grid.',
    contrast: 'Every other machine in this collection counts something (collisions, crossings, lattice points), averages something random, or sums a series. This one solves a field. That is a mechanism class the catalog otherwise has nowhere: discrete potential theory. It also brings something none of the statistical cards can — a CERTIFIED interval. Cut every resistor outside the box (a free, Neumann boundary) and Rayleigh\'s cutting law says the resistance can only go UP, so 2/R_free is a rigorous LOWER bound on π. Short the whole boundary ring together instead (which is exactly what pinning the ring to 0 V does — verified numerically to 5·10⁻¹⁶ against an explicitly merged super-node) and Rayleigh\'s shorting law says the resistance can only go DOWN, so 2/R_grounded is a rigorous UPPER bound. The two solves therefore trap π from both sides with no reference value anywhere in the arithmetic. The honest cost is that the trap closes slowly: its half-width falls like 1/N², measured at 5.15·10⁻² (N=11), 1.30·10⁻² (21), 3.30·10⁻³ (41), 8.34·10⁻⁴ (81), 2.10·10⁻⁴ (161), 5.26·10⁻⁵ (321). At the largest interactive size the certificate is worth about four digits — 3.141 — and no more. The midpoint of the interval is far better (about 4·10⁻⁷ relative error at N=161) because the two boundary errors are nearly equal and opposite, but that cancellation is an empirical observation, not a theorem, so the midpoint is labelled an extrapolation and never as certified digits.',
    formula: 'infinite ℤ² lattice of 1 Ω resistors:  R(0,0 → 1,1) = 2/π Ω,  R(0,0 → 1,0) = 1/2 Ω  ⇒  π = 2/R  [DETERMINISTIC — integer Laplacian, CG solve, no transcendental on the estimator path]',
    getExpected: (params) => {
      const N = (params && params.N) || 161;
      // Measured, fully-converged values (relative CG residual < 1e-13).
      const table = {
        11: ['3.095049796', '3.198078178', '3.145720619'],
        21: ['3.129203905', '3.155236366', '3.142166217'],
        41: ['3.138370477', '3.144976363', '3.141669947'],
        81: ['3.140768992', '3.142436917', '3.141602733'],
        161: ['3.141384296', '3.141803616', '3.141593942'],
        201: ['3.141458982', '3.141727662', '3.141593322'],
      };
      let key = 161;
      for (const k of [11, 21, 41, 81, 161, 201]) if (N >= k) key = k;
      const [lo, hi, mid] = table[key];
      return `At N=${key} the two boundary conditions bracket π in [${lo}, ${hi}] — a certificate, not an estimate, so roughly 4 correct digits. The bracket midpoint lands near ${mid} (≈7 digits), but that is an extrapolation resting on the two boundary errors cancelling, so it is reported separately. The adjacent-pair self-check on the same solver returns R → 0.5 Ω with no π in sight: 0.500021109 (free) and 0.499978625 (grounded) at N=161.`;
    }
  };

  constructor(params = {}) {
    super(params);
    // Validate against the allowed sets: an unrecognised value (e.g. from a
    // hand-edited #hash param) would otherwise leave BOTH solvers inactive, so
    // nSolve = 0 makes maxItersPerStep infinite and the sim finishes having run
    // zero iterations — a silently dead card. Fall back to the default instead.
    this.terminals = params.terminals === 'adjacent' ? 'adjacent' : 'diagonal';
    this.boundary = (params.boundary === 'free' || params.boundary === 'grounded')
      ? params.boundary : 'bracket';                   // 'bracket' | 'free' | 'grounded'
    this.targetN = params.N || 161;
    this.autoRefine = params.autoRefine !== undefined ? params.autoRefine : true;
    this.iterRate = params.iterRate || 90;             // CG iterations per board-second

    // ── Preallocation. Everything the solver and the scene ever touch is
    // allocated here, once, at MAX_N size. step()/updateSimScene() allocate
    // nothing.
    this.deg = new Int32Array(MAX_NODES);
    this.solvers = [
      this._makeSolver('free'),
      this._makeSolver('grounded'),
    ];
    // Scratch for the scene, sized for the worst case.
    this._fieldPos = new Float32Array(MAX_NODES * 3);
    this._fieldCol = new Float32Array(MAX_NODES * 3);
    this._zoomCol = new Float32Array(ZW * ZW * 3);
    this._edgeCol = new Float32Array(ZEDGES * 2 * 3);
    this._edgeCur = new Float64Array(ZEDGES);
    this._edgeA = new Int32Array(ZEDGES);    // window-local node index, tail
    this._edgeB = new Int32Array(ZEDGES);    // window-local node index, head
    this._packPos = new Float32Array(ZEDGES * 3);
    this._packCol = new Float32Array(ZEDGES * 3);
    this._packPhase = new Float32Array(ZEDGES);
    for (let k = 0; k < ZEDGES; k++) this._packPhase[k] = (k * 0.6180339887) % 1;
    this._zoomNodePos = new Float32Array(ZW * ZW * 3);
    this._edgePos = new Float32Array(ZEDGES * 2 * 3);

    // Completed-rung records, preallocated (no push/pop churn of objects).
    this.records = [];
    for (let i = 0; i < MAX_RUNGS; i++) {
      this.records.push({ used: false, N: 0, Rfree: 0, Rgnd: 0, iters: 0 });
    }

    // Frame governor state (see FRAME_BUDGET_MS).
    this.frameBudgetMs = params.frameBudgetMs !== undefined ? params.frameBudgetMs : FRAME_BUDGET_MS;
    this._clock = (typeof performance !== 'undefined' && performance.now)
      ? () => performance.now() : () => Date.now();
    this._winT0 = 0;
    this._winUsed = 0;

    this._lastPiLabel = null;
    this.reset();
  }

  // ── one CG workspace, sized for MAX_N² ────────────────────────────────────
  _makeSolver(bc) {
    return {
      bc,                              // 'free' (Neumann) | 'grounded' (Dirichlet)
      active: false,
      converged: false,
      v: new Float64Array(MAX_NODES),
      r: new Float64Array(MAX_NODES),
      p: new Float64Array(MAX_NODES),
      Ap: new Float64Array(MAX_NODES),
      rr: 0, b0sq: 1, iters: 0, R: 0,
    };
  }

  reset() {
    super.reset();
    this.ladder = this._buildLadder();
    this.rung = 0;
    this.cumIters = 0;
    this.iterCarry = 0;
    this.flowT = 0;
    this.finished = false;
    this.collisionCount = 0;
    this.nextMilestone = 1;
    this.domainLo = 0;
    this.domainHi = 0;
    this.domainSet = false;
    this._winT0 = 0;
    this._winUsed = 0;
    for (const rec of this.records) rec.used = false;
    this._startRung(0);
  }

  _buildLadder() {
    const N = this.targetN;
    if (!this.autoRefine) return [N];
    const out = [];
    for (const k of LADDER) if (k < N) out.push(k);
    out.push(N);
    return out.slice(-MAX_RUNGS);
  }

  // ── lattice geometry for the current rung ────────────────────────────────
  _startRung(idx) {
    const N = this.ladder[idx];
    this.rung = idx;
    this.N = N;
    this.n = N * N;
    const c = (N - 1) >> 1;
    this.cx = c;
    this.A = c * N + c;
    // Diagonal neighbour (1,1) carries the π; the adjacent neighbour (1,0) is
    // the self-check and must come back as a clean 1/2 with no π anywhere.
    this.B = this.terminals === 'diagonal' ? (c + 1) * N + (c + 1) : c * N + (c + 1);

    // Integer degrees: 4 in the bulk, 3 on an edge, 2 in a corner.
    for (let y = 0; y < N; y++) {
      const row = y * N;
      for (let x = 0; x < N; x++) {
        let d = 0;
        if (x > 0) d++;
        if (x < N - 1) d++;
        if (y > 0) d++;
        if (y < N - 1) d++;
        this.deg[row + x] = d;
      }
    }

    const wantFree = this.boundary === 'bracket' || this.boundary === 'free';
    const wantGnd = this.boundary === 'bracket' || this.boundary === 'grounded';
    this.solvers[0].active = wantFree;
    this.solvers[1].active = wantGnd;
    const nSolve = (wantFree ? 1 : 0) + (wantGnd ? 1 : 0);
    this.maxItersPerStep = Math.max(1,
      Math.floor(MAX_NODE_OPS_PER_STEP / (this.n * nSolve)));
    this.maxIters = MAX_IT_FACTOR * N;

    for (const s of this.solvers) {
      s.converged = false;
      s.iters = 0;
      s.R = 0;
      s.rr = 0;
      if (!s.active) continue;
      s.v.fill(0, 0, this.n);
      s.r.fill(0, 0, this.n);
      s.p.fill(0, 0, this.n);
      s.Ap.fill(0, 0, this.n);
      // b = +1 A in at A, −1 A out at B. Integers.
      s.r[this.A] = 1;
      s.r[this.B] = -1;
      if (s.bc === 'free') this._project(s.r);
      s.p.set(s.r.subarray(0, this.n), 0);
      let rr = 0;
      for (let k = 0; k < this.n; k++) rr += s.r[k] * s.r[k];
      s.rr = rr;
      s.b0sq = rr > 0 ? rr : 1;
    }

    this._layoutForN();
    this._layoutZoom();
  }

  // ── conjugate gradient on the integer Laplacian ──────────────────────────
  // y = L·x. Grounded BC pins the boundary ring to 0 V by writing 0 into those
  // rows (the ring then behaves as one shorted node — see the explanation).
  _applyL(x, y, grounded) {
    const N = this.N, deg = this.deg;
    for (let j = 0; j < N; j++) {
      const row = j * N;
      const jEdge = (j === 0 || j === N - 1);
      for (let i = 0; i < N; i++) {
        const k = row + i;
        if (grounded && (jEdge || i === 0 || i === N - 1)) { y[k] = 0; continue; }
        let s = deg[k] * x[k];
        if (i > 0) s -= x[k - 1];
        if (i < N - 1) s -= x[k + 1];
        if (j > 0) s -= x[k - N];
        if (j < N - 1) s -= x[k + N];
        y[k] = s;
      }
    }
  }

  // Free BC: L is singular with the constant vector in its null space. Keep
  // every CG vector zero-mean so roundoff never excites it.
  _project(x) {
    const n = this.n;
    let s = 0;
    for (let k = 0; k < n; k++) s += x[k];
    s /= n;
    for (let k = 0; k < n; k++) x[k] -= s;
  }

  _cgIterate(s, count) {
    const n = this.n;
    const grounded = s.bc === 'grounded';
    const v = s.v, r = s.r, p = s.p, Ap = s.Ap;
    for (let it = 0; it < count; it++) {
      this._applyL(p, Ap, grounded);
      if (!grounded) this._project(Ap);
      let pAp = 0;
      for (let k = 0; k < n; k++) pAp += p[k] * Ap[k];
      if (!(pAp > 0)) { s.converged = true; break; }
      const alpha = s.rr / pAp;
      for (let k = 0; k < n; k++) { v[k] += alpha * p[k]; r[k] -= alpha * Ap[k]; }
      let rr2 = 0;
      for (let k = 0; k < n; k++) rr2 += r[k] * r[k];
      const beta = rr2 / s.rr;
      for (let k = 0; k < n; k++) p[k] = r[k] + beta * p[k];
      s.rr = rr2;
      s.iters++;
      this.cumIters++;
      if (rr2 / s.b0sq < RES_TOL2 || s.iters >= this.maxIters) { s.converged = true; break; }
    }
    // THE MEASUREMENT. Two array reads and a subtraction — nothing else.
    s.R = v[this.A] - v[this.B];
  }

  // Wall-clock governor. Returns false when this frame's solver budget is gone.
  // Setting frameBudgetMs to 0 or Infinity disables it (headless test harnesses
  // need that; the browser never does).
  _haveBudget(now) {
    const b = this.frameBudgetMs;
    if (!(b > 0) || !Number.isFinite(b)) return true;
    if (now - this._winT0 >= FRAME_WINDOW_MS) { this._winT0 = now; this._winUsed = 0; }
    return this._winUsed < b;
  }

  step(dt) {
    if (this.finished) return false;
    const t = dt * TIME_SCALE;
    this.flowT += t;
    this.iterCarry += this.iterRate * t;
    let want = Math.floor(this.iterCarry);
    if (want <= 0) return false;
    if (want > this.maxItersPerStep) {
      // Drop the excess rather than banking it, so a burst of Speed cannot
      // queue up thousands of iterations to be paid off later.
      this.iterCarry = 0;
      want = this.maxItersPerStep;
    } else {
      this.iterCarry -= want;
    }

    const clock = this._clock;
    const t0 = clock();
    if (!this._haveBudget(t0)) return false;

    let ran = false;
    let allDone = true;
    for (const s of this.solvers) {
      if (!s.active) continue;
      if (!s.converged) { this._cgIterate(s, want); ran = true; }
      if (!s.converged) allDone = false;
    }
    this._winUsed += clock() - t0;
    this.collisionCount = this.cumIters;

    if (this.cumIters >= this.nextMilestone) {
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.cumIters + 1, Math.ceil(this.cumIters * 1.03));
    }

    if (allDone) {
      this._recordRung();
      if (this.rung + 1 < this.ladder.length) this._startRung(this.rung + 1);
      else this.finished = true;
    }
    return ran;
  }

  _recordRung() {
    const rec = this.records[Math.min(this.rung, MAX_RUNGS - 1)];
    rec.used = true;
    rec.N = this.N;
    rec.Rfree = this.solvers[0].active ? this.solvers[0].R : NaN;
    rec.Rgnd = this.solvers[1].active ? this.solvers[1].R : NaN;
    rec.iters = this.solvers[0].iters + this.solvers[1].iters;
    if (!this.domainSet) {
      const lo = this._boundLo(), hi = this._boundHi();
      const w = Math.max(hi - lo, Math.abs(hi) * 0.04, 1e-6);
      this.domainLo = lo - 0.12 * w;
      this.domainHi = hi + 0.12 * w;
      this.domainSet = true;
    }
  }

  // ── the estimator: divisions only ────────────────────────────────────────
  // diagonal terminals: R = 2/π  ⇒  π = 2/R.
  // adjacent terminals: R = 1/2 exactly, and there is no π to report — the
  // readout shows R itself so the self-check cannot masquerade as a π machine.
  _valueFromR(R) {
    if (!(R > 0)) return NaN;
    return this.terminals === 'diagonal' ? 2 / R : R;
  }

  _boundLo() {
    // Free boundary cuts every outside resistor, so R can only rise: 2/R_free
    // is the LOW end for π. For the adjacent self-check the same ordering makes
    // R_grounded the low end, so pick per mode.
    const f = this.solvers[0].active ? this._valueFromR(this.solvers[0].R) : NaN;
    const g = this.solvers[1].active ? this._valueFromR(this.solvers[1].R) : NaN;
    if (Number.isFinite(f) && Number.isFinite(g)) return Math.min(f, g);
    return Number.isFinite(f) ? f : g;
  }

  _boundHi() {
    const f = this.solvers[0].active ? this._valueFromR(this.solvers[0].R) : NaN;
    const g = this.solvers[1].active ? this._valueFromR(this.solvers[1].R) : NaN;
    if (Number.isFinite(f) && Number.isFinite(g)) return Math.max(f, g);
    return Number.isFinite(f) ? f : g;
  }

  getPiApproximation() {
    const lo = this._boundLo(), hi = this._boundHi();
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return NaN;
    return (lo + hi) / 2;
  }

  getPiReadout() {
    const est = this.getPiApproximation();
    if (!Number.isFinite(est)) return 'solving…';
    return this.terminals === 'diagonal' ? est.toFixed(7) : est.toFixed(9);
  }

  getPiLabel() { return this.terminals === 'diagonal' ? 'π ≈' : 'R (Ω) ≈'; }
  getCountLabel() { return `CG iterations (N = ${this.N})`; }

  _syncPiLabel() {
    const label = this.getPiLabel();
    if (label === this._lastPiLabel) return;
    this._lastPiLabel = label;
    this.notifyControlsChanged();
  }

  // ── controls ─────────────────────────────────────────────────────────────
  getControls() {
    this._lastPiLabel = this.getPiLabel();
    const restart = () => { this.reset(); this.initSimScene(); };
    return [
      {
        type: 'select', id: 'terminals', label: 'Terminal pair', highlight: true,
        default: this.terminals,
        options: [
          { value: 'diagonal', label: 'Diagonal (0,0)–(1,1) — R = 2/π' },
          { value: 'adjacent', label: 'Adjacent (0,0)–(1,0) — self-check, R = 1/2' },
        ],
        onChange: (val) => { this.terminals = val; restart(); this._syncPiLabel(); }
      },
      {
        type: 'select', id: 'boundary', label: 'Boundary', highlight: true,
        default: this.boundary,
        options: [
          { value: 'bracket', label: 'Both — boundary bracket' },
          { value: 'free', label: 'Free (cut) — bounds R from above' },
          { value: 'grounded', label: 'Grounded (short) — bounds R from below' },
        ],
        onChange: (val) => { this.boundary = val; restart(); }
      },
      {
        type: 'slider', id: 'N', label: 'Lattice size N (N×N nodes)',
        min: 21, max: MAX_N, step: 20, default: this.targetN,
        onChange: (val) => { this.targetN = val; restart(); }
      },
      {
        type: 'toggle', id: 'autoRefine', label: 'Auto-refine N (11→21→41→81→…)',
        default: this.autoRefine,
        onChange: (val) => { this.autoRefine = val; restart(); }
      },
      {
        type: 'slider', id: 'iterRate', label: 'CG iterations / s',
        min: 10, max: 400, step: 10, default: this.iterRate,
        onChange: (val) => { this.iterRate = val; }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  // ── phase space ──────────────────────────────────────────────────────────
  // Both views are π-free: one plots the solver's own relative residual, the
  // other the width of the certified interval. Neither needs a reference value.
  getPhaseSpaceViews() {
    return [
      {
        id: 'cg-residual', label: 'CG iterations vs relative residual', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log₁₀ cumulative CG iterations', y: 'log₁₀ ‖r‖/‖b‖' }
      },
      {
        id: 'bracket-width', label: 'certified interval width (needs “Both”)', dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'log₁₀ cumulative CG iterations', y: 'log₁₀ interval half-width' }
      }
    ];
  }

  // DISPLAY-ONLY: the logs here are axis scaling for the diagnostic phase views.
  // Nothing on this path reaches getPiApproximation().
  getPhasePoint() {
    const L10 = Math.LN10;
    const x = Math.min(1, Math.max(-1,
      Math.log(Math.max(1, this.cumIters)) / L10 / 4 * 2 - 1));
    let worst = 0;
    for (const s of this.solvers) {
      if (!s.active) continue;
      const q = s.rr / s.b0sq;
      if (q > worst) worst = q;
    }
    // log10 of the residual, mapped 1 → +1 and 1e-12 → −1.
    const lr = worst > 0 ? Math.log(Math.sqrt(worst)) / L10 : -12;
    const y = Math.min(1, Math.max(-1, (lr + 6) / 6));
    const half = (this._boundHi() - this._boundLo()) / 2;
    const lh = half > 0 ? Math.log(half) / L10 : -8;
    const z = Math.min(1, Math.max(-1, (lh + 4) / 4));
    return [x, y, z];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'bracket-width') return (pt) => [pt[0], pt[2]];
    return (pt) => [pt[0], pt[1]];
  }

  getPreviewBox() { return { x0: -1.15, x1: 1.15, y0: -0.95, y1: 0.95 }; }

  // ── HUD ──────────────────────────────────────────────────────────────────
  getFormulaHTML() {
    const diag = this.terminals === 'diagonal';
    const lo = this._boundLo(), hi = this._boundHi();
    const mid = this.getPiApproximation();
    const both = this.boundary === 'bracket';
    let res = 0;
    for (const s of this.solvers) if (s.active) res = Math.max(res, Math.sqrt(s.rr / s.b0sq));

    const head = diag
      ? `<strong>Infinite ℤ² grid of 1 Ω resistors</strong>:
         <span class="f-angle">R(0,0 → 1,1) = 2/π Ω</span><br>`
      : `<strong>Self-check — adjacent pair</strong>:
         <span class="f-angle">R(0,0 → 1,0) = 1/2 Ω exactly</span> (no π anywhere)<br>`;

    const settled = this.solvers.every(s => !s.active || (s.converged && s.rr / s.b0sq < RES_TOL2));
    const bounds = both && settled && Number.isFinite(lo) && Number.isFinite(hi)
      ? `<span class="f-result">${diag ? 'π' : 'R'}</span> ∈ [
         <span class="f-count">${lo.toFixed(diag ? 6 : 9)}</span>,
         <span class="f-count">${hi.toFixed(diag ? 6 : 9)}</span> ]
         &nbsp;<span class="f-muted">converged boundary bracket · half-width ${(((hi - lo) / 2) || 0).toExponential(2)}</span><br>`
      : `<span class="f-result">${diag ? 'π' : 'R'}</span> ≈
         <span class="f-count">${Number.isFinite(mid) ? mid.toFixed(diag ? 7 : 9) : '—'}</span>
         &nbsp;<span class="f-muted">${settled && !both ? `converged ${this.boundary === 'free' ? 'free/cut' : 'grounded/short'} bound` : 'solver in progress; not yet a boundary bound'}</span><br>`;

    const status = `<span class="f-muted">N = ${this.N} (${this.n.toLocaleString()} nodes) ·
      rung ${this.rung + 1}/${this.ladder.length} ·
      ${this.cumIters.toLocaleString()} CG iterations ·
      ‖r‖/‖b‖ = ${res > 0 ? res.toExponential(2) : '0'}
      ${this.finished ? ' · converged' : ''}</span>`;

    const legend = `<div aria-label="Potential and current colour key" style="display:flex;flex-wrap:wrap;justify-content:flex-start;gap:5px 14px;font-size:.86em;font-weight:600;letter-spacing:.01em">
      <span style="color:#48f5cf">+ Positive voltage</span>
      <span style="color:#ff7898">− Negative voltage</span>
      <span style="color:#ffd166">→ Current</span></div>
      <div style="font-size:.85em;color:#b5c5d5">Left: the voltage field. Right: a 9 × 9 detail; brighter gold carries more current.</div>`;

    return `<div style="width:100%;text-align:left">${head}${bounds}${status}</div>` + legend;
  }

  getDetailedReadoutHTML() {
    return `<p>Completed grid refinements retain the boundary brackets below. They converge with the finite domain; the midpoint and Richardson values are extrapolations. Iteration error and floating-point arithmetic remain separate from the exact network bounds.</p>`
      + this._driftSVG() + this._driftTable();
  }

  _driftTable() {
    let rows = '';
    let used = 0;
    for (const rec of this.records) {
      if (!rec.used) continue;
      used++;
      const lo = Math.min(this._valueFromR(rec.Rfree), this._valueFromR(rec.Rgnd));
      const hi = Math.max(this._valueFromR(rec.Rfree), this._valueFromR(rec.Rgnd));
      const half = (hi - lo) / 2;
      const diag = this.terminals === 'diagonal';
      const one = Number.isFinite(rec.Rfree) ? rec.Rfree : rec.Rgnd;
      rows += `<tr><td style="text-align:left">${rec.N}</td>`
        + `<td style="text-align:right">${one.toFixed(9)}</td>`
        + (Number.isFinite(half)
          ? `<td style="text-align:right">${lo.toFixed(diag ? 6 : 9)}…${hi.toFixed(diag ? 6 : 9)}</td>`
            + `<td style="text-align:right">${half.toExponential(2)}</td>`
          : `<td style="text-align:right">—</td><td style="text-align:right">—</td>`)
        + `</tr>`;
    }
    if (!used) return '';
    const both = this.boundary === 'bracket';
    const rich = this._richardson();
    const dp = this.terminals === 'diagonal' ? 9 : 10;
    let richHTML = '';
    if (rich) {
      const parts = [];
      if (Number.isFinite(rich.free)) parts.push(`free → <span class="f-count">${rich.free.toFixed(dp)}</span>`);
      if (Number.isFinite(rich.gnd)) parts.push(`grounded → <span class="f-count">${rich.gnd.toFixed(dp)}</span>`);
      richHTML = `<div style="opacity:.86;font-size:.85em">Richardson in N from ${rich.na}→${rich.nb}
        (measured 1/N² law, each boundary extrapolated separately): ${parts.join(' · ')}
        — an EXTRAPOLATION. It usually beats the certified interval, and it carries no guarantee.</div>`;
    }
    return `<table style="width:100%;border-collapse:collapse;font-size:.85em">`
      + `<tr style="opacity:.84"><td style="text-align:left">N</td>`
      + `<td style="text-align:right">R ${both ? '(free BC)' : '(Ω)'}</td>`
      + `<td style="text-align:right">${both ? 'certified interval' : 'one-sided bound'}</td>`
      + `<td style="text-align:right">± half</td></tr>${rows}</table>`
      + richHTML;
  }

  // Richardson from the last two completed rungs, error model err ∝ N⁻²
  // (the measured half-width ratios are 3.94, 3.96, 3.98 per doubling, so the
  // exponent is not assumed — it is observed). R∞ = (R₂N₂² − R₁N₁²)/(N₂² − N₁²).
  // Arithmetic only. Each boundary condition is extrapolated on its own,
  // because they converge at different rates and averaging them first would
  // hide that. Returns null until two rungs exist.
  _richardson() {
    const done = [];
    for (const rec of this.records) if (rec.used) done.push(rec);
    if (done.length < 2) return null;
    const a = done[done.length - 2], b = done[done.length - 1];
    if (a.N === b.N) return null;
    const w = b.N * b.N - a.N * a.N;
    const ext = (Ra, Rb) => (Rb * b.N * b.N - Ra * a.N * a.N) / w;
    const out = { na: a.N, nb: b.N, free: NaN, gnd: NaN };
    if (Number.isFinite(a.Rfree) && Number.isFinite(b.Rfree)) out.free = this._valueFromR(ext(a.Rfree, b.Rfree));
    if (Number.isFinite(a.Rgnd) && Number.isFinite(b.Rgnd)) out.gnd = this._valueFromR(ext(a.Rgnd, b.Rgnd));
    return out;
  }

  // log–log plot of the certified half-width against N, with a −2 reference
  // slope. Inline SVG; nothing here is per-frame geometry. DISPLAY-ONLY: the
  // Math.log calls are axis scaling, not estimation.
  _driftSVG() {
    if (this.boundary !== 'bracket') return '';
    const xs = [], ys = [];
    for (const rec of this.records) {
      if (!rec.used) continue;
      const lo = Math.min(this._valueFromR(rec.Rfree), this._valueFromR(rec.Rgnd));
      const hi = Math.max(this._valueFromR(rec.Rfree), this._valueFromR(rec.Rgnd));
      const half = (hi - lo) / 2;
      if (!(half > 0)) continue;
      xs.push(Math.log(rec.N) / Math.LN10);
      ys.push(Math.log(half) / Math.LN10);
    }
    if (xs.length < 2) return '';
    const W = 260, H = 150, ml = 40, mr = 10, mt = 10, mb = 26;
    let xmin = xs[0], xmax = xs[xs.length - 1];
    let ymin = Infinity, ymax = -Infinity;
    for (const y of ys) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    if (xmax - xmin < 1e-9) xmax = xmin + 1;
    if (ymax - ymin < 0.5) { ymax += 0.25; ymin -= 0.25; }
    const px = (x) => ml + (x - xmin) / (xmax - xmin) * (W - ml - mr);
    const py = (y) => H - mb - (y - ymin) / (ymax - ymin) * (H - mt - mb);
    let d = '', dots = '';
    for (let i = 0; i < xs.length; i++) {
      d += (i ? 'L' : 'M') + px(xs[i]).toFixed(1) + ' ' + py(ys[i]).toFixed(1) + ' ';
      dots += `<circle cx="${px(xs[i]).toFixed(1)}" cy="${py(ys[i]).toFixed(1)}" r="3" fill="#ffd166"/>`;
    }
    const ry2 = ymax - 2 * (xmax - xmin);
    const ref = `<line x1="${px(xmin).toFixed(1)}" y1="${py(ymax).toFixed(1)}"
      x2="${px(xmax).toFixed(1)}" y2="${py(ry2).toFixed(1)}"
      stroke="#48f5cf" stroke-dasharray="3 3" opacity="0.65"/>`;
    const axis = `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`
      + `<line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`;
    const cy = ((mt + H - mb) / 2).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:470px;margin-top:2px;overflow:visible;color:inherit">
      ${axis}${ref}<path d="${d}" fill="none" stroke="#ffd166" stroke-width="2"/>${dots}
      <text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">log₁₀ N</text>
      <text x="11" y="${cy}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle" transform="rotate(-90 11 ${cy})">log₁₀ half-width</text>
      <text x="${(W - mr - 4)}" y="${mt + 9}" font-size="8" fill="currentColor" opacity="0.6" text-anchor="end">dashed: slope −2</text>
    </svg>`;
  }

  // ── scene ────────────────────────────────────────────────────────────────
  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    // Full-lattice potential field: one Points cloud, drawRange set per rung.
    this.fieldGeom = new THREE.BufferGeometry();
    this.fieldGeom.setAttribute('position', new THREE.BufferAttribute(this._fieldPos, 3));
    this.fieldGeom.setAttribute('color', new THREE.BufferAttribute(this._fieldCol, 3));
    this.fieldMat = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true });
    this.fieldPoints = new THREE.Points(this.fieldGeom, this.fieldMat);
    this.simScene.add(this.fieldPoints);

    // Panel outlines + the gold marker showing where the zoom patch sits.
    const box = (cx, cy, h, z) => [
      new THREE.Vector3(cx - h, cy - h, z), new THREE.Vector3(cx + h, cy - h, z),
      new THREE.Vector3(cx + h, cy - h, z), new THREE.Vector3(cx + h, cy + h, z),
      new THREE.Vector3(cx + h, cy + h, z), new THREE.Vector3(cx - h, cy + h, z),
      new THREE.Vector3(cx - h, cy + h, z), new THREE.Vector3(cx - h, cy - h, z),
    ];
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([...box(FX, FY, FH, 0), ...box(ZX, ZY, ZH, 0)]),
      new THREE.LineBasicMaterial({ color: 0x88a5bc, transparent: true, opacity: 0.52 })
    ));
    this.zoomWindow = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(box(0, 0, FH, 0)),
      new THREE.LineBasicMaterial({ color: COL_GOLD, transparent: true, opacity: 0.96 })
    );
    this.zoomWindow.position.set(FX, FY, 0.04);
    this.simScene.add(this.zoomWindow);

    // Zoom patch: fixed geometry (ZW and ZEDGES never change), colours live.
    this.zoomGeom = new THREE.BufferGeometry();
    this.zoomGeom.setAttribute('position', new THREE.BufferAttribute(this._zoomNodePos, 3));
    this.zoomGeom.setAttribute('color', new THREE.BufferAttribute(this._zoomCol, 3));
    this.simScene.add(new THREE.Points(this.zoomGeom,
      new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true })));

    this.edgeGeom = new THREE.BufferGeometry();
    this.edgeGeom.setAttribute('position', new THREE.BufferAttribute(this._edgePos, 3));
    this.edgeGeom.setAttribute('color', new THREE.BufferAttribute(this._edgeCol, 3));
    this.simScene.add(new THREE.LineSegments(this.edgeGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 })));

    // Charge packets riding the edges, one per edge, speed ∝ |current|.
    this.packGeom = new THREE.BufferGeometry();
    this.packGeom.setAttribute('position', new THREE.BufferAttribute(this._packPos, 3));
    this.packGeom.setAttribute('color', new THREE.BufferAttribute(this._packCol, 3));
    this.simScene.add(new THREE.Points(this.packGeom,
      new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true })));

    // Terminal rings in the zoom panel (source mint, sink rose).
    const ringGeom = new THREE.RingGeometry(0.031, 0.048, 24);
    this.srcRing = new THREE.Mesh(ringGeom,
      new THREE.MeshBasicMaterial({ color: COL_MINT }));
    this.snkRing = new THREE.Mesh(ringGeom,
      new THREE.MeshBasicMaterial({ color: COL_ROSE }));
    this.srcRing.position.z = 0.05;
    this.snkRing.position.z = 0.05;
    this.simScene.add(this.srcRing, this.snkRing);

    // Bracket ladder: one bar per rung, stacked, over a shared axis line.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(AXIS_X0, AXIS_Y, 0), new THREE.Vector3(AXIS_X1, AXIS_Y, 0)]),
      new THREE.LineBasicMaterial({ color: 0x88a5bc, transparent: true, opacity: 0.52 })
    ));
    const barGeom = new THREE.PlaneGeometry(1, 1);
    this.barMeshes = [];
    for (let i = 0; i < MAX_RUNGS; i++) {
      const m = new THREE.Mesh(barGeom, new THREE.MeshBasicMaterial({
        color: i === 0 ? COL_VIOLET : COL_GOLD, transparent: true, opacity: 0.96
      }));
      m.position.set(0, BAR_Y0 - i * BAR_DY, 0.01);
      m.scale.set(1e-4, 0.031, 1);
      m.visible = false;
      this.simScene.add(m);
      this.barMeshes.push(m);
    }

    this._layoutForN();
    this._layoutZoom();
  }

  // Positions for the full-lattice cloud. Called on reset and on every rung
  // change; writes into the preallocated buffer, never allocates.
  _layoutForN() {
    if (!this.fieldGeom) return;
    const N = this.N, pos = this._fieldPos;
    const s = (N > 1) ? (2 * FH) / (N - 1) : 0;
    for (let j = 0; j < N; j++) {
      const y = FY - FH + j * s;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const k = (row + i) * 3;
        pos[k] = FX - FH + i * s;
        pos[k + 1] = y;
        pos[k + 2] = 0;
      }
    }
    this.fieldGeom.attributes.position.needsUpdate = true;
    this.fieldGeom.setDrawRange(0, this.n);
    this.fieldMat.size = Math.max(1.8, Math.min(7, 360 / N));
    // This outline represents the actual 9×9 detail at every refinement rung.
    // Scale about the field centre, without rebuilding its fixed geometry.
    if (this.zoomWindow) this.zoomWindow.scale.setScalar(N > 1 ? Math.min(ZW - 1, N - 1) / (N - 1) : 0);
  }

  // Zoom patch geometry + the window→lattice index map. Fixed size, so this
  // only re-maps indices when the rung changes.
  _layoutZoom() {
    const N = this.N, c = this.cx;
    const w = Math.min(ZW, N);
    let x0 = c - ((w - 1) >> 1);
    if (x0 < 0) x0 = 0;
    if (x0 + w > N) x0 = Math.max(0, N - w);
    this.zx0 = x0;
    this.zy0 = x0;      // the lattice is square and both terminals sit at the centre
    this.zw = w;

    const s = (this.zw > 1) ? (2 * ZH) / (this.zw - 1) : 0;
    const np = this._zoomNodePos;
    for (let b = 0; b < this.zw; b++) {
      for (let a = 0; a < this.zw; a++) {
        const k = (b * this.zw + a) * 3;
        np[k] = ZX - ZH + a * s;
        np[k + 1] = ZY - ZH + b * s;
        np[k + 2] = 0.03;
      }
    }
    if (this.zoomGeom) {
      this.zoomGeom.attributes.position.needsUpdate = true;
      this.zoomGeom.setDrawRange(0, this.zw * this.zw);
    }

    // Edge list inside the window: horizontals then verticals.
    let e = 0;
    const ep = this._edgePos;
    for (let b = 0; b < this.zw; b++) {
      for (let a = 0; a + 1 < this.zw; a++) {
        this._edgeA[e] = b * this.zw + a;
        this._edgeB[e] = b * this.zw + a + 1;
        e++;
      }
    }
    for (let b = 0; b + 1 < this.zw; b++) {
      for (let a = 0; a < this.zw; a++) {
        this._edgeA[e] = b * this.zw + a;
        this._edgeB[e] = (b + 1) * this.zw + a;
        e++;
      }
    }
    this.nEdges = e;
    if (ep) {
      for (let k = 0; k < e; k++) {
        const ia = this._edgeA[k] * 3, ib = this._edgeB[k] * 3;
        ep[k * 6] = np[ia]; ep[k * 6 + 1] = np[ia + 1]; ep[k * 6 + 2] = 0.02;
        ep[k * 6 + 3] = np[ib]; ep[k * 6 + 4] = np[ib + 1]; ep[k * 6 + 5] = 0.02;
      }
      if (this.edgeGeom) {
        this.edgeGeom.attributes.position.needsUpdate = true;
        this.edgeGeom.setDrawRange(0, e * 2);
      }
    }
    if (this.packGeom) this.packGeom.setDrawRange(0, e);
  }

  // Potential → colour. DISPLAY-ONLY: the Math.pow below compresses the 1/r
  // dipole falloff so the outer lattice is visible at all. Nothing here feeds
  // the estimator.
  _shade(u, out, k) {
    const m = Math.pow(Math.min(1, Math.abs(u)), 0.27);
    const c = u >= 0 ? C_POS : C_NEG;
    out[k] = C_ZERO[0] + m * (c[0] - C_ZERO[0]);
    out[k + 1] = C_ZERO[1] + m * (c[1] - C_ZERO[1]);
    out[k + 2] = C_ZERO[2] + m * (c[2] - C_ZERO[2]);
  }

  updateSimScene() {
    if (!this.fieldGeom) return;
    const s = this.solvers[0].active ? this.solvers[0] : this.solvers[1];
    const v = s.v, N = this.N, n = this.n;
    const vmax = Math.max(Math.abs(v[this.A]), Math.abs(v[this.B]), 1e-12);

    const fc = this._fieldCol;
    for (let k = 0; k < n; k++) this._shade(v[k] / vmax, fc, k * 3);
    this.fieldGeom.attributes.color.needsUpdate = true;

    // Zoom nodes.
    const zc = this._zoomCol, zw = this.zw;
    for (let b = 0; b < zw; b++) {
      for (let a = 0; a < zw; a++) {
        const gi = (this.zy0 + b) * N + (this.zx0 + a);
        this._shade(v[gi] / vmax, zc, (b * zw + a) * 3);
      }
    }
    this.zoomGeom.attributes.color.needsUpdate = true;

    // Edge currents: unit resistors, so I = Δv. Find the largest for scaling.
    const cur = this._edgeCur;
    let imax = 1e-12;
    for (let k = 0; k < this.nEdges; k++) {
      const ai = this._edgeA[k], bi = this._edgeB[k];
      const ga = (this.zy0 + ((ai / zw) | 0)) * N + (this.zx0 + (ai % zw));
      const gb = (this.zy0 + ((bi / zw) | 0)) * N + (this.zx0 + (bi % zw));
      const I = v[ga] - v[gb];
      cur[k] = I;
      const m = I < 0 ? -I : I;
      if (m > imax) imax = m;
    }
    const ec = this._edgeCol;
    for (let k = 0; k < this.nEdges; k++) {
      const m = Math.pow(Math.min(1, Math.abs(cur[k]) / imax), 0.4);   // display-only
      const r = 0.028 + 0.972 * m, g = 0.045 + 0.625 * m, bl = 0.070 + 0.055 * m;
      const j = k * 6;
      ec[j] = r; ec[j + 1] = g; ec[j + 2] = bl;
      ec[j + 3] = r; ec[j + 4] = g; ec[j + 5] = bl;
    }
    this.edgeGeom.attributes.color.needsUpdate = true;

    // Charge packets: one per edge, riding from tail to head at a speed set by
    // the current it carries. Decoration, advanced only while playing.
    const np = this._zoomNodePos, pp = this._packPos, pc = this._packCol;
    const ph = this._packPhase;
    const adv = this.playing ? 0.016 : 0;
    for (let k = 0; k < this.nEdges; k++) {
      const frac = Math.min(1, Math.abs(cur[k]) / imax);
      let t = ph[k] + adv * (0.15 + 2.6 * frac);
      if (t >= 1) t -= Math.floor(t);
      ph[k] = t;
      const forward = cur[k] >= 0;
      const ai = (forward ? this._edgeA[k] : this._edgeB[k]) * 3;
      const bi = (forward ? this._edgeB[k] : this._edgeA[k]) * 3;
      const j = k * 3;
      pp[j] = np[ai] + (np[bi] - np[ai]) * t;
      pp[j + 1] = np[ai + 1] + (np[bi + 1] - np[ai + 1]) * t;
      pp[j + 2] = 0.06;
      const m = Math.pow(frac, 0.5);   // display-only
      pc[j] = 0.025 + 0.975 * m;
      pc[j + 1] = 0.038 + 0.882 * m;
      pc[j + 2] = 0.055 + 0.415 * m;
    }
    this.packGeom.attributes.position.needsUpdate = true;
    this.packGeom.attributes.color.needsUpdate = true;

    // Terminal rings, placed on the zoom patch.
    const ax = this.A % N - this.zx0, ay = ((this.A / N) | 0) - this.zy0;
    const bx = this.B % N - this.zx0, by = ((this.B / N) | 0) - this.zy0;
    const inWin = (x, y) => x >= 0 && y >= 0 && x < zw && y < zw;
    if (inWin(ax, ay)) {
      const k = (ay * zw + ax) * 3;
      this.srcRing.position.set(np[k], np[k + 1], 0.05);
      this.srcRing.visible = true;
    } else this.srcRing.visible = false;
    if (inWin(bx, by)) {
      const k = (by * zw + bx) * 3;
      this.snkRing.position.set(np[k], np[k + 1], 0.05);
      this.snkRing.visible = true;
    } else this.snkRing.visible = false;

    // Bracket ladder. Bar i is rung i's certified interval; the current rung's
    // bar is live and shrinks as the solve converges.
    if (this.domainSet && this.barMeshes) {
      const span = this.domainHi - this.domainLo;
      const toX = (val) => AXIS_X0 + (val - this.domainLo) / span * (AXIS_X1 - AXIS_X0);
      for (let i = 0; i < MAX_RUNGS; i++) {
        const m = this.barMeshes[i];
        const rec = this.records[i];
        let lo, hi;
        if (i === this.rung && !this.finished) { lo = this._boundLo(); hi = this._boundHi(); }
        else if (rec.used) {
          lo = Math.min(this._valueFromR(rec.Rfree), this._valueFromR(rec.Rgnd));
          hi = Math.max(this._valueFromR(rec.Rfree), this._valueFromR(rec.Rgnd));
        } else { m.visible = false; continue; }
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) { m.visible = false; continue; }
        const xl = toX(lo), xr = toX(hi);
        m.visible = true;
        m.position.x = (xl + xr) / 2;
        m.scale.x = Math.max(0.007, xr - xl);
      }
    } else if (this.barMeshes) {
      for (const m of this.barMeshes) m.visible = false;
    }
  }
}

registerSim(ResistorLatticePi);
