import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// ---------------------------------------------------------------------------
// Compute budget. Diagonalising an N×N matrix is O(N³) and is NOT free, so the
// work is amortised across step() calls: each step performs a fixed number of
// Jacobi *element-updates* (one plane rotation touches ~N of them) and stops
// mid-sweep wherever the budget runs out. Deliberately NOT scaled by dt — this
// sim's cost is compute-bound rather than physics-time-bound, and main.js calls
// step() ~speed·10 times per frame, so the Speed slider already is the
// throughput dial. Measured on node 22 / V8: ≈1 ms per frame at speed 1 without
// turbo and ≈10 ms with it. The worst case is N = 128, not N = 200: a
// power-of-two row stride makes the column accesses A[k·N+p] alias onto a
// handful of L1 sets, roughly halving throughput — the budget is sized for it.
const WORK_PER_STEP = 30000;
const TURBO_MULT = 8;          // honest multiplier: real Jacobi work, not free counting
const NMAX = 200;              // matrix-buffer capacity (Float64 200² = 320 kB)
const MAX_SWEEPS = 30;         // cyclic Jacobi needs ~9 at N=200; this is a backstop

// Spacing histogram. Raw unfolded gaps D are binned on a fine grid whose span is
// fixed from the FIRST spectrum's own mean gap (so no constant has to be assumed
// and the grid works both unfolded and raw), then rebinned at display time into
// s = D/⟨D⟩ over [0, SDISP].
const MICRO = 600, D_GRID_SPAN = 12;
const NBINS = 48, SDISP = 4, DENS_MAX = 1.15;
const CURVE_PTS = 128;

// Scene layout (ortho box x ∈ [−1.15, 1.15], y ∈ [−0.95, 0.95]).
const HEAT_CX = -0.78, HEAT_CY = 0.52, HEAT_S = 0.62, HEAT_PX = 128, HEAT_SCALE = 3;
const BAR_X0 = -1.09, BAR_X1 = -0.47, BAR_Y = 0.11, BAR_H = 0.032;
const HX0 = -0.30, HX1 = 1.10, HY0 = 0.16, HIST_H = 0.68;
const SX0 = -1.10, SX1 = 1.10, SY0 = -0.72, SC_H = 0.30, TICK_H = 0.055;

// Entry laws. Every draw has mean 0 and variance 1 and is built from Math.random,
// √ and ln only — no π anywhere (in particular no Box–Muller cos(2πu)).
const MATRIX_LAWS = ['gauss', 'uniform', 'rademacher', 'laplace'];
const LAW_INFO = {
  gauss:      { label: 'Gaussian', color: 0x4cc9f0, css: '#4cc9f0' },
  uniform:    { label: 'Uniform',  color: 0x8fe3ad, css: '#8fe3ad' },
  rademacher: { label: '±1',       color: 0xf7c948, css: '#f7c948' },
  laplace:    { label: 'Laplace',  color: 0xc792ea, css: '#c792ea' },
  poisson:    { label: 'Poisson',  color: 0xef476f, css: '#ef476f' },
};
const SQRT3 = Math.sqrt(3);

export class RandomMatrixPi extends Simulation {
  static id = 'random-matrix-pi';
  static title = 'Random Matrix π — level repulsion & universality';
  static description = 'Diagonalise N×N random symmetric matrices, unfold the spectrum against the semicircle law, and read π off the level-spacing distribution — the same curve for Gaussian, uniform, ±1 or Laplace entries, while uncorrelated levels visibly fail';
  static piMechanism = 'level-spacing statistics: cyclic Jacobi diagonalisation → semicircle unfolding → π̂ = 4⟨s⟩²/⟨s²⟩ from the Wigner surmise ⟨s²⟩ = 4/π. Universal across entry distributions; settles ≈1% under π because the surmise is exact only at N = 2';
  static rigor = 'Experimental';
  static sortOrder = 57.5;
  static piNature = 'experimental';
  static piLabel = 'π̂ (surmise) ≈';
  static previewSteps = 220;
  static previewParams = { matN: 32, turbo: false };
  static explanation = {
    setup: 'Wigner could not compute the energy levels of a heavy nucleus, so he replaced the Hamiltonian by a random real symmetric matrix and asked only what the levels look like statistically. This card does that literally: it samples N×N symmetric matrices (off-diagonal entries variance 1, diagonal variance 2 — the GOE normalisation), diagonalises each one with the cyclic Jacobi algorithm (plane rotations, pure arithmetic and square roots on the measured entries), and sorts the eigenvalues. Raw gaps are then useless on their own, because the level density follows the semicircle law and the mean gap therefore changes across the spectrum. The gaps must first be UNFOLDED — divided by the local mean spacing — and only then do they have a distribution worth talking about. Unfolding is where a naive implementation quietly goes wrong, so the panel prints the check: the mean unfolded spacing must be 1, and it must be 1 in every quarter of the window, not merely on average. To see what it buys you, turn the unfolding switch off and push the bulk fraction to 100% — those four numbers split to roughly 1.17 / 0.83 / 0.83 / 1.18 and π̂ collapses to about 2.84.',
    insight: 'Two things then appear that the old 2×2 version of this card could not show. First, LEVEL REPULSION: P(s) → 0 linearly as s → 0. Eigenvalues of a random symmetric matrix actively avoid each other. The Poisson control makes that concrete — the same number of levels drawn INDEPENDENTLY from the same semicircle density, pushed through the identical unfolding — and its histogram walks straight into a nonzero value at the origin while its moment ratio goes to 2, because exponential spacings have ⟨s²⟩ = 2⟨s⟩². Second, UNIVERSALITY: switch the entries from Gaussian to uniform, to ±1 coin flips, to Laplace, and the spacing curve does not move. That invariance is the actual content of random matrix theory and the reason Wigner\'s statistics describe real nuclei, whose matrix elements are certainly not Gaussian. π enters through the Wigner surmise P(s) = (πs/2)·e^(−πs²/4), whose second moment is ⟨s²⟩ = 4/π once the mean is 1 — so π̂ = 4⟨s⟩²/⟨s²⟩, a ratio of two measured sample moments and nothing else.',
    contrast: 'Honesty, in two parts. (1) Nothing is smuggled in. The unfolding wants the semicircle counting function, which carries a factor 1/(4π) — so the code never evaluates it. It works with the π-free difference D = g(λᵢ₊₁) − g(λᵢ), where g(λ) = λ√(R²−λ²) + R²·asin(λ/R) is an arcsine of a MEASURED ratio and R is measured from the spectrum\'s own second moment; the overall scale is then fixed by the data itself, ŝ = D/⟨D⟩. That is what makes ⟨s⟩ = 1 hold by construction and keeps every π off the estimator path. The Math.PI occurrences in this file are display-only — the reference curve, the 4/π and 4π targets printed as text, and the relative-error axis — each marked as such. (2) The answer lands about 1% low, and that is the lesson rather than a bug. The Wigner surmise is EXACT only for 2×2 matrices; the true large-N GOE spacing law (Gaudin–Mehta) has ⟨s²⟩ ≈ 1.286, measured here as 1.2857, instead of 4/π = 1.27324 — so π̂ converges to ≈ 3.111 and more samples will not move it. The residual is model error, not noise. Small N is worse rather than better, because the semicircle unfolding is itself crude when there are few levels: the measured π̂ runs 3.086 at N = 16, 3.099 at N = 32, and only settles onto the surmise-limited plateau of ≈ 3.111 by N ≈ 100. This card therefore measures the surmise\'s own accuracy as much as it measures π, which is why it is filed as a π proxy and not a π counter. A second, independent, π-free estimate does live in the same numbers and does converge on π: ⟨D⟩ → 4π, the semicircle\'s normalisation measured by counting levels. It is shown alongside, and it closes as a textbook O(1/N) — measured 2.5% high at N = 32, 1.3% at N = 64, 0.8% at N = 100 and 0.4% at N = 200.',
    formula: 'π̂ = 4⟨D⟩²/⟨D²⟩,  D = g(λᵢ₊₁) − g(λᵢ),  g(λ) = λ√(R²−λ²) + R²·asin(λ/R)  [PROXY — surmise-limited, → ≈3.111]',
    getExpected: (p) => {
      const n = p && p.matN ? p.matN : 64;
      return `N = ${n}. Statistical noise on π̂ falls as 1/√(spacings) — roughly 1% at 10⁴ spacings and 0.3% at 10⁵ — but it settles on ≈ 3.111, about 1% under π, because the Wigner surmise is exact only at N = 2 (and on ≈ 3.086 at N = 16, where the unfolding itself is coarse). The Poisson control settles on 2, and the secondary reading ⟨D⟩/4 drifts up towards π as O(1/N). Expect the two histograms to separate within a couple of seconds of turbo.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.matN = Math.max(16, Math.min(NMAX, Math.round(params.matN || 64)));
    this.entryLaw = params.entryLaw || 'cycle';
    this.poissonCtl = params.poissonCtl !== undefined ? params.poissonCtl : true;
    this.unfoldOn = params.unfoldOn !== undefined ? params.unfoldOn : true;
    this.bulkFrac = params.bulkFrac || 0.5;
    this.turbo = params.turbo !== undefined ? params.turbo : true;

    // Preallocated once at NMAX — nothing in step()/updateSimScene() allocates.
    this.A = new Float64Array(NMAX * NMAX);
    this.eig = new Float64Array(NMAX);
    this.dBuf = new Float64Array(NMAX);
    this.showEig = new Float64Array(NMAX);
    this.microMat = new Float64Array(MICRO);
    this.microPoi = new Float64Array(MICRO);
    this.binMat = new Float64Array(NBINS);
    this.binPoi = new Float64Array(NBINS);
    this.bandSum = new Float64Array(4);
    this.bandN = new Float64Array(4);
    this.stats = {};
    for (const k of Object.keys(LAW_INFO)) this.stats[k] = { n: 0, sumD: 0, sumD2: 0, mats: 0 };
    this._eigView = this.eig.subarray(0, this.matN);
    this._spare = null;

    this.reset();
  }

  reset() {
    super.reset();
    for (const k of Object.keys(this.stats)) {
      const s = this.stats[k]; s.n = 0; s.sumD = 0; s.sumD2 = 0; s.mats = 0;
    }
    this.microMat.fill(0); this.microPoi.fill(0);
    this.bandSum.fill(0); this.bandN.fill(0);
    this.matSpac = 0; this.matSumD = 0; this.matSumD2 = 0;   // pooled matrix ensemble
    this.poiSpac = 0; this.poiSumD = 0; this.poiSumD2 = 0;   // Poisson control
    this.matsDone = 0;
    this.cycleIdx = 0;
    this.dGridMax = 0;          // set lazily from the first spectrum's own mean gap
    this.showN = 0; this.showR = 1; this.showI0 = 0; this.showI1 = 0;
    this.nextMilestone = 32;
    this._spare = null;
    this._startMatrix();
  }

  // Changing N / the bulk width / the unfolding switch changes what a "spacing"
  // MEANS, so the accumulated moments are discarded rather than silently mixed.
  _resetStats() {
    const wasPlaying = this.playing;
    this.reset();
    this.playing = wasPlaying;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'matN', label: 'Matrix size N',
        min: 16, max: NMAX, step: 4, default: this.matN, highlight: true,
        onChange: (val) => {
          this.matN = Math.max(16, Math.min(NMAX, Math.round(val)));
          this._resetStats();
        }
      },
      {
        type: 'select', id: 'entryLaw', label: 'Entry distribution', default: this.entryLaw,
        options: [
          { value: 'cycle', label: 'Cycle all four (universality)' },
          { value: 'gauss', label: 'Gaussian' },
          { value: 'uniform', label: 'Uniform' },
          { value: 'rademacher', label: 'Rademacher ±1' },
          { value: 'laplace', label: 'Laplace' },
        ],
        // Deliberately does NOT reset the statistics: the whole point is to pool
        // several entry laws and watch them land on the very same curve.
        onChange: (val) => { this.entryLaw = val; }
      },
      {
        type: 'toggle', id: 'poissonCtl', label: 'Poisson control (no repulsion)',
        default: this.poissonCtl
      },
      {
        type: 'toggle', id: 'unfoldOn', label: 'Unfold spectrum (semicircle)',
        default: this.unfoldOn,
        onChange: () => { this._resetStats(); }
      },
      {
        type: 'slider', id: 'bulkFrac', label: 'Bulk fraction of spectrum',
        min: 0.15, max: 1, step: 0.05, default: this.bulkFrac,
        onChange: (val) => { this.bulkFrac = val; this._resetStats(); }
      },
      { type: 'toggle', id: 'turbo', label: `Turbo ×${TURBO_MULT} (Jacobi work — not free)`, default: this.turbo },
      // Capped at 4 rather than the usual 20: at speed s this sim performs
      // s·10·budget element-updates per frame, and 20 would stall the frame.
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 4, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log spacings vs π̂ error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 spacings', y: '(π̂ − π)/π  (×20)' }
      }
    ];
  }

  // ---------------- π-free random draws (mean 0, variance 1) ----------------

  // Marsaglia polar: rejection inside a square, then only √ and ln. Never
  // touches π (Box–Muller's cos(2πu) would).
  _gauss() {
    if (this._spare !== null) { const g = this._spare; this._spare = null; return g; }
    let u, v, w;
    do {
      u = Math.random() * 2 - 1;
      v = Math.random() * 2 - 1;
      w = u * u + v * v;
    } while (w >= 1 || w === 0);
    const f = Math.sqrt(-2 * Math.log(w) / w);
    this._spare = v * f;
    return u * f;
  }

  _draw(law) {
    switch (law) {
      case 'uniform':    return (Math.random() * 2 - 1) * SQRT3;      // variance 1
      case 'rademacher': return Math.random() < 0.5 ? -1 : 1;         // variance 1
      // A difference of two Exp(1) is Laplace(0,1) with variance 2; /√2 → 1.
      case 'laplace':    return (Math.log(1 - Math.random()) - Math.log(1 - Math.random())) * Math.SQRT1_2;
      default:           return this._gauss();
    }
  }

  // ---------------- matrix construction + amortised Jacobi ----------------

  _startMatrix() {
    const N = this.matN;
    const law = this.entryLaw === 'cycle'
      ? MATRIX_LAWS[this.cycleIdx % MATRIX_LAWS.length] : this.entryLaw;
    // 'poisson' is a control, never an entry law — guard against a stale hash.
    this.curLaw = MATRIX_LAWS.indexOf(law) >= 0 ? law : 'gauss';
    const A = this.A;
    // GOE normalisation: H_ij (i<j) has variance 1, H_ii has variance 2 —
    // equivalently H = (G + Gᵀ)/√2 with G holding i.i.d. variance-1 entries.
    let fro2 = 0;
    for (let i = 0; i < N; i++) {
      const d = this._draw(this.curLaw) * Math.SQRT2;
      A[i * N + i] = d;
      fro2 += d * d;
      for (let j = i + 1; j < N; j++) {
        const v = this._draw(this.curLaw);
        A[i * N + j] = v; A[j * N + i] = v;
        fro2 += 2 * v * v;
      }
    }
    this.jFro2 = fro2 > 0 ? fro2 : 1;
    this.jSweep = 0;
    this.jP = 0; this.jQ = 1;
    this.jTresh = 0;
    this.jOff = fro2;
    this.jNeedScan = true;
    this.jDone = false;
    this.jN = N;
  }

  // One resumable chunk of cyclic Jacobi; returns the element-updates consumed
  // and sets this.jDone when the matrix is diagonal (or the sweep cap is hit).
  // Rutishauser rotation: with cot(2φ) = θ = (a_qq − a_pp)/(2·a_pq),
  // t = tan φ = sign(θ)/(|θ| + √(θ²+1)); then a_pp → a_pp − t·a_pq,
  // a_qq → a_qq + t·a_pq, a_pq → 0, and rows/cols p,q mix through (c, s).
  // All arithmetic on measured entries; no transcendental constant enters.
  _jacobiChunk(budget) {
    const N = this.jN, A = this.A;
    let work = 0;

    while (work < budget && !this.jDone) {
      if (this.jNeedScan) {
        // A single pass yields both the convergence measure and the threshold.
        let sm = 0, off = 0;
        for (let p = 0; p < N - 1; p++) {
          const rp = p * N;
          for (let q = p + 1; q < N; q++) {
            const a = A[rp + q];
            sm += a < 0 ? -a : a;
            off += a * a;
          }
        }
        work += (N * N) >> 1;
        this.jOff = off;
        if (sm === 0 || off < 1e-26 * this.jFro2 || this.jSweep >= MAX_SWEEPS) {
          this.jDone = true;
          break;
        }
        // Early sweeps skip already-tiny entries (Numerical-Recipes threshold);
        // max|a_pq| ≥ 2·sm/(N²−N) > tresh always, so a sweep can never stall.
        this.jTresh = this.jSweep < 4 ? 0.2 * sm / (N * N) : 0;
        this.jNeedScan = false;
        this.jP = 0; this.jQ = 1;
      }

      let p = this.jP, q = this.jQ;
      while (p < N - 1) {
        const apq = A[p * N + q];
        const aabs = apq < 0 ? -apq : apq;
        if (apq !== 0 && aabs > this.jTresh) {
          const app = A[p * N + p], aqq = A[q * N + q];
          const theta = (aqq - app) / (2 * apq);
          let t;
          if (theta > 1e10 || theta < -1e10) t = 1 / (2 * theta);   // avoid θ² overflow
          else {
            const at = theta < 0 ? -theta : theta;
            t = 1 / (at + Math.sqrt(theta * theta + 1));
            if (theta < 0) t = -t;
          }
          const c = 1 / Math.sqrt(1 + t * t), s = t * c;
          A[p * N + p] = app - t * apq;
          A[q * N + q] = aqq + t * apq;
          A[p * N + q] = 0; A[q * N + p] = 0;
          const rp = p * N, rq = q * N;
          for (let k = 0; k < N; k++) {
            if (k === p || k === q) continue;
            const akp = A[k * N + p], akq = A[k * N + q];
            const np = c * akp - s * akq;
            const nq = s * akp + c * akq;
            A[k * N + p] = np; A[rp + k] = np;
            A[k * N + q] = nq; A[rq + k] = nq;
          }
          work += N;
        }
        q++;
        if (q >= N) { p++; q = p + 1; }
        if (work >= budget) break;
      }
      this.jP = p; this.jQ = q;
      if (p >= N - 1) { this.jSweep++; this.jNeedScan = true; }
    }
    return work;
  }

  // ---------------- unfolding ----------------
  //
  // The semicircle counting function is  Ñ(λ) = g(λ)/(4π) + const, with
  //   g(λ) = λ√(R²−λ²) + R²·asin(λ/R)   and   g′(λ) = 2√(R²−λ²).
  // A true unfolded spacing is s = Ñ(λᵢ₊₁) − Ñ(λᵢ) = D/(4π) where
  // D = g(λᵢ₊₁) − g(λᵢ). The 1/(4π) is NEVER evaluated: the estimator uses the
  // raw D's and takes the scale from the data (ŝ = D/⟨D⟩, so ⟨ŝ⟩ ≡ 1). All that
  // reaches the arithmetic is asin and √ of the MEASURED ratio λ/R, and R itself
  // is measured from the spectrum's own second moment (semicircle: ⟨λ²⟩ = R²/4).
  // Consequence worth knowing: ⟨D⟩ → 4π, so ⟨D⟩/4 is a second, independent,
  // π-free estimate of π — reported separately in getFormulaHTML().
  _gOf(lam, R) {
    let x = lam / R;
    if (x > 1) x = 1; else if (x < -1) x = -1;    // edge eigenvalues can exceed R
    return R * R * (x * Math.sqrt(1 - x * x) + Math.asin(x));
  }

  _sortEig(N) {
    if (!this._eigView || this._eigView.length !== N) this._eigView = this.eig.subarray(0, N);
    this._eigView.sort();
  }

  // Accumulate the bulk spacings of one sorted spectrum held in eig[0..N).
  _accumulate(eig, N, key, isMatrix) {
    let m2 = 0;
    for (let i = 0; i < N; i++) m2 += eig[i] * eig[i];
    const R = 2 * Math.sqrt(m2 / N);
    if (!(R > 0)) return;

    const i0 = Math.floor(N * (1 - this.bulkFrac) / 2);
    const i1 = N - i0;
    const span = i1 - i0 - 1;
    if (span < 3) return;

    const dBuf = this.dBuf;
    let sum = 0;
    let prev = this.unfoldOn ? this._gOf(eig[i0], R) : eig[i0];
    for (let j = 0; j < span; j++) {
      const gi = this.unfoldOn ? this._gOf(eig[i0 + 1 + j], R) : eig[i0 + 1 + j];
      let D = gi - prev;
      prev = gi;
      if (!(D >= 0)) D = 0;      // also NaN-safe
      dBuf[j] = D;
      sum += D;
    }
    if (!(sum > 0)) return;
    // The histogram grid span is fixed once, from the first spectrum's own mean
    // gap — no assumed constant, and it adapts to the unfolded/raw switch.
    if (!(this.dGridMax > 0)) this.dGridMax = (sum / span) * D_GRID_SPAN;
    const gridK = MICRO / this.dGridMax;

    const st = this.stats[key];
    const micro = isMatrix ? this.microMat : this.microPoi;
    for (let j = 0; j < span; j++) {
      const D = dBuf[j];
      st.n++; st.sumD += D; st.sumD2 += D * D;
      if (isMatrix) {
        this.matSpac++; this.matSumD += D; this.matSumD2 += D * D;
        // Quarter-of-the-window diagnostic: after a correct unfolding every band
        // must show the same mean spacing, not just the pooled average.
        let b = (j * 4 / span) | 0;
        if (b > 3) b = 3;
        this.bandSum[b] += D; this.bandN[b]++;
      } else {
        this.poiSpac++; this.poiSumD += D; this.poiSumD2 += D * D;
      }
      const k = (D * gridK) | 0;      // display grid only; the moments use every D
      if (k >= 0 && k < MICRO) micro[k]++;
    }
    if (isMatrix) {
      this.showN = N; this.showR = R; this.showI0 = i0; this.showI1 = i1;
      for (let i = 0; i < N; i++) this.showEig[i] = eig[i];
    }
    st.mats++;
  }

  // Poisson control: N levels drawn INDEPENDENTLY from the same semicircle
  // density (rejection sampling — π-free) and pushed through the identical
  // unfolding. Same density, same code path, no correlations, so P(s) → e^(−s),
  // which does NOT vanish at s = 0, and 4⟨D⟩²/⟨D²⟩ → 2 instead of π.
  _poissonSpectrum(N) {
    const R = 2 * Math.sqrt(N);
    const eig = this.eig;
    for (let i = 0; i < N; i++) {
      let lam;
      for (;;) {
        lam = (Math.random() * 2 - 1) * R;
        const x = lam / R;
        if (Math.random() <= Math.sqrt(1 - x * x)) break;
      }
      eig[i] = lam;
    }
    this._sortEig(N);
    this._accumulate(eig, N, 'poisson', false);
  }

  _finishMatrix() {
    const N = this.jN;
    const A = this.A, eig = this.eig;
    for (let i = 0; i < N; i++) eig[i] = A[i * N + i];
    this._sortEig(N);
    this._accumulate(eig, N, this.curLaw, true);
    this.matsDone++;
    if (this.entryLaw === 'cycle') this.cycleIdx++;
    // One control spectrum per matrix keeps the two histograms at IDENTICAL
    // sample sizes, so the comparison is fair rather than flattering.
    if (this.poissonCtl) this._poissonSpectrum(N);
  }

  step(dt) {
    const budget = WORK_PER_STEP * (this.turbo ? TURBO_MULT : 1);
    let work = 0, notable = false, guard = 0;
    while (work < budget && guard++ < 8192) {
      work += this._jacobiChunk(budget - work);
      if (this.jDone) {
        this._finishMatrix();
        this._startMatrix();
        notable = true;
      }
    }

    this.collisionCount = this.matSpac;
    if (this.matSpac >= this.nextMilestone) {
      // One convergence point per ~3% growth in the spacing count keeps the
      // trail readable over six decades.
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.matSpac + 1, Math.ceil(this.matSpac * 1.03));
    }
    return notable;
  }

  getCountLabel() { return 'Spacings'; }

  // π̂ = 4⟨D⟩²/⟨D²⟩ over the pooled matrix ensemble. The unfolding scale cancels
  // identically (D → αD leaves the ratio fixed), which is precisely why no π is
  // needed to normalise: ⟨s⟩ = 1 is imposed by the data, not by a constant.
  getPiApproximation() {
    if (this.matSpac < 24 || this.matSumD2 <= 0) return NaN;
    return 4 * this.matSumD * this.matSumD / (this.matSpac * this.matSumD2);
  }

  _piOf(st) {
    if (!st || st.n < 24 || st.sumD2 <= 0) return NaN;
    return 4 * st.sumD * st.sumD / (st.n * st.sumD2);
  }

  _s2Of(st) {
    if (!st || st.n < 24 || st.sumD <= 0) return NaN;
    return st.sumD2 * st.n / (st.sumD * st.sumD);
  }

  getPiReadout() {
    const est = this.getPiApproximation();
    return Number.isFinite(est) ? est.toFixed(6) : 'diagonalising…';
  }

  getPhasePoint() {
    const est = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.matSpac, 1)) / 6 * 2 - 1));
    // DISPLAY-ONLY: Math.PI is the truth reference of the relative-error axis and
    // never reaches getPiApproximation(). ×20 so the ≈1% surmise systematic reads
    // as a clear offset from zero instead of a flat line on the axis.
    const y = Number.isFinite(est)
      ? Math.min(1, Math.max(-1, (est - Math.PI) / Math.PI * 20)) : 0;
    return [x, y];
  }

  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() { return { x0: -1.15, x1: 1.15, y0: -0.95, y1: 0.95 }; }

  // ---------------- readout ----------------

  getFormulaHTML() {
    const n = this.matSpac;
    const meanD = n > 0 ? this.matSumD / n : 0;
    const s2 = n > 0 && meanD > 0 ? (this.matSumD2 / n) / (meanD * meanD) : 0;
    const est = this.getPiApproximation();
    const live = Number.isFinite(est) ? piDigitsHTML(est, 4) : 'diagonalising…';

    // Band flatness — the unfolding check. Each quarter of the bulk window must
    // report the same mean spacing; ≈1.00 across the row means the semicircle
    // normalisation really did remove the density.
    let bands = '';
    for (let b = 0; b < 4; b++) {
      const v = this.bandN[b] > 0 && meanD > 0 ? this.bandSum[b] / this.bandN[b] / meanD : 0;
      const bad = Math.abs(v - 1) > 0.03;
      bands += `<span style="color:${bad ? '#ef476f' : '#8fe3ad'}">${v.toFixed(3)}</span>${b < 3 ? ' ' : ''}`;
    }

    let rows = '';
    const keys = this.poissonCtl ? MATRIX_LAWS.concat('poisson') : MATRIX_LAWS;
    for (const law of keys) {
      const st = this.stats[law];
      const p = this._piOf(st), q = this._s2Of(st);
      const inf = LAW_INFO[law];
      rows += `<tr><td style="text-align:left"><span style="color:${inf.css}">■</span> ${inf.label}</td>`
        + `<td style="text-align:right">${st.n}</td>`
        + `<td style="text-align:right">${Number.isFinite(q) ? q.toFixed(4) : '—'}</td>`
        + `<td style="text-align:right">${Number.isFinite(p) ? p.toFixed(4) : '—'}</td></tr>`;
    }

    // DISPLAY-ONLY π below: the 4/π and 4π targets printed as text and the
    // relative-deviation figure. None of them feed getPiApproximation().
    const dev = Number.isFinite(est) ? (est / Math.PI - 1) * 100 : NaN;
    const piDens = this.unfoldOn && meanD > 0 ? meanD / 4 : NaN;

    const unfoldNote = this.unfoldOn
      ? `⟨D⟩ = <span class="f-count">${meanD.toFixed(3)}</span> → 4π = 12.566 (semicircle check; ŝ = D/⟨D⟩, so ⟨s⟩ ≡ 1 by construction)`
      : `<span style="color:#ef476f">unfolding OFF</span> — raw λ gaps, ⟨D⟩ = ${meanD.toFixed(3)}; the semicircle density is still inside them`;

    return `<div style="display:flex;flex-direction:column;gap:3px;width:100%">
      <div><strong>Wigner surmise</strong>
        <span class="f-angle">P(s) = (πs/2)·e^(−πs²/4)</span> ⇒ ⟨s²⟩ = 4/π</div>
      <div><span class="f-result">π̂</span> = 4⟨D⟩²/⟨D²⟩ &nbsp;·&nbsp;
        measured ⟨s²⟩ = <span class="f-count">${s2.toFixed(4)}</span> &nbsp;(4/π = 1.2732)</div>
      <div style="font-size:1.1em">π̂ = ${live}${Number.isFinite(dev)
        ? `<span style="opacity:.75;font-size:.8em">&nbsp;(${dev >= 0 ? '+' : ''}${dev.toFixed(2)}% vs π)</span>` : ''}</div>
      <div style="font-size:.85em;opacity:.9">N = ${this.matN}, bulk ${Math.round(this.bulkFrac * 100)}%,
        ${this.matsDone} matrices diagonalised · ${unfoldNote}</div>
      <div style="font-size:.85em;opacity:.9">mean spacing per quarter of the window: ${bands}${Number.isFinite(piDens)
        ? ` &nbsp;· ⟨D⟩/4 = <span class="f-count">${piDens.toFixed(4)}</span> → π (semicircle area, O(1/N))` : ''}</div>
      <table style="width:100%;font-size:.8em;border-collapse:collapse;opacity:.95">
        <tr style="opacity:.65"><td style="text-align:left">entry law</td><td style="text-align:right">spacings</td>
          <td style="text-align:right">⟨s²⟩</td><td style="text-align:right">π̂</td></tr>
        ${rows}
      </table>
      <div style="font-size:.8em;opacity:.72">Universality: the four entry laws must agree — they are the same curve.
        The Poisson control has the same density and no repulsion, so its ⟨s²⟩ → 2 and its π̂ → 2.
        <strong>π̂ settles near 3.111, ≈1% under π</strong>: the Wigner surmise is exact only at N = 2, while the true
        GOE law has ⟨s²⟩ ≈ 1.286. That gap is model error and will not shrink with more samples. Spacings from one
        matrix are also mildly correlated (spectral rigidity), so the effective sample size sits below the raw count.
        No π is on the estimator path — the 1/(4π) of the semicircle counting function is never evaluated; the scale
        comes from ⟨D⟩ itself.</div>
    </div>`;
  }

  // ---------------- scene ----------------

  _label(text, x, y, h, css) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    if (!canvas) return null;
    const fontPx = 34;
    let ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return null;
    ctx.font = `${fontPx}px Georgia, serif`;
    const measured = ctx.measureText ? ctx.measureText(text) : null;
    const w = Math.max(8, Math.ceil((measured && measured.width) || text.length * fontPx * 0.5));
    canvas.width = w + 10; canvas.height = Math.ceil(fontPx * 1.5);
    ctx = canvas.getContext('2d');
    ctx.font = `${fontPx}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = css;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
    }));
    sp.position.set(x, y, 0.2);
    sp.scale.set(h * (canvas.width / canvas.height), h, 1);
    this.simScene.add(sp);
    return sp;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    // --- matrix heat map: one canvas + CanvasTexture, repainted in place ---
    this.heat = null;
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      if (ctx && ctx.createImageData) {
        canvas.width = HEAT_PX; canvas.height = HEAT_PX;
        const img = ctx.createImageData(HEAT_PX, HEAT_PX);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.NearestFilter;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(HEAT_S, HEAT_S),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        mesh.position.set(HEAT_CX, HEAT_CY, 0);
        this.simScene.add(mesh);
        this.heat = { canvas, ctx, img, tex };
      }
    }
    const hh = HEAT_S / 2;
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(HEAT_CX - hh, HEAT_CY - hh, 0.05), new THREE.Vector3(HEAT_CX + hh, HEAT_CY - hh, 0.05),
        new THREE.Vector3(HEAT_CX + hh, HEAT_CY - hh, 0.05), new THREE.Vector3(HEAT_CX + hh, HEAT_CY + hh, 0.05),
        new THREE.Vector3(HEAT_CX + hh, HEAT_CY + hh, 0.05), new THREE.Vector3(HEAT_CX - hh, HEAT_CY + hh, 0.05),
        new THREE.Vector3(HEAT_CX - hh, HEAT_CY + hh, 0.05), new THREE.Vector3(HEAT_CX - hh, HEAT_CY - hh, 0.05),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 })
    ));

    // --- Jacobi progress bar: the off-diagonal norm draining away ---
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(BAR_X1 - BAR_X0, BAR_H),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09 })
    );
    barBg.position.set((BAR_X0 + BAR_X1) / 2, BAR_Y, 0.01);
    this.simScene.add(barBg);
    this.progMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, BAR_H * 0.8),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ad, transparent: true, opacity: 0.8 })
    );
    this.progMesh.position.set(BAR_X0, BAR_Y, 0.02);
    this.progMesh.scale.set(1e-4, 1, 1);
    this.simScene.add(this.progMesh);

    // --- spacing histogram: axis, bars, control staircase, theory curves ---
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(HX0, HY0, 0), new THREE.Vector3(HX1, HY0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
    ));
    const bw = (HX1 - HX0) / NBINS;
    const barGeom = new THREE.PlaneGeometry(1, 1);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.6 });
    this.barMeshes = [];
    for (let j = 0; j < NBINS; j++) {
      const m = new THREE.Mesh(barGeom, barMat);
      m.position.set(HX0 + (j + 0.5) * bw, HY0, 0.01);
      m.scale.set(bw * 0.92, 1e-4, 1);
      this.simScene.add(m);
      this.barMeshes.push(m);
    }
    // The Poisson control is a staircase so it stays legible ON TOP of the bars:
    // vertices 2j and 2j+1 share x = HX0 + j·bw and carry the previous / current
    // bin height, which draws the risers and treads in one polyline.
    const stair = new Float32Array((2 * NBINS + 2) * 3);
    for (let j = 0; j <= NBINS; j++) {
      const x = HX0 + j * bw;
      stair[(2 * j) * 3] = x; stair[(2 * j) * 3 + 1] = HY0; stair[(2 * j) * 3 + 2] = 0.04;
      stair[(2 * j + 1) * 3] = x; stair[(2 * j + 1) * 3 + 1] = HY0; stair[(2 * j + 1) * 3 + 2] = 0.04;
    }
    this.stairGeom = new THREE.BufferGeometry();
    this.stairGeom.setAttribute('position', new THREE.BufferAttribute(stair, 3));
    this.stairLine = new THREE.Line(this.stairGeom,
      new THREE.LineBasicMaterial({ color: 0xef476f, transparent: true, opacity: 0.95 }));
    this.stairLine.visible = false;
    this.simScene.add(this.stairLine);

    // Both theory curves are STATIC: the x-axis is the unit-mean s, so the
    // Wigner surmise and the Poisson e^(−s) are fixed references drawn once.
    // DISPLAY-ONLY: the Math.PI here draws the reference curve; the estimator in
    // getPiApproximation() never sees it.
    const wig = new Float32Array(CURVE_PTS * 3), poi = new Float32Array(CURVE_PTS * 3);
    for (let i = 0; i < CURVE_PTS; i++) {
      const s = SDISP * i / (CURVE_PTS - 1);
      const x = HX0 + (HX1 - HX0) * i / (CURVE_PTS - 1);
      const dw = (Math.PI * s / 2) * Math.exp(-Math.PI * s * s / 4);
      const dp = Math.exp(-s);
      wig[i * 3] = x; wig[i * 3 + 1] = HY0 + Math.min(1, dw / DENS_MAX) * HIST_H; wig[i * 3 + 2] = 0.06;
      poi[i * 3] = x; poi[i * 3 + 1] = HY0 + Math.min(1, dp / DENS_MAX) * HIST_H; poi[i * 3 + 2] = 0.05;
    }
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(wig, 3)),
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.95 })));
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(poi, 3)),
      new THREE.LineBasicMaterial({ color: 0xef476f, transparent: true, opacity: 0.38 })));

    // --- spectrum strip: axis, semicircle envelope, bulk shading, level ticks ---
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(SX0, SY0, 0), new THREE.Vector3(SX1, SY0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
    ));
    const scPts = [];
    for (let i = 0; i < CURVE_PTS; i++) {
      const u = -1 + 2 * i / (CURVE_PTS - 1);
      scPts.push(new THREE.Vector3(
        (SX0 + SX1) / 2 + u * (SX1 - SX0) / 2,
        SY0 + Math.sqrt(Math.max(0, 1 - u * u)) * SC_H, 0.01));
    }
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(scPts),
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.6 })));
    this.bulkMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, SC_H + 2 * TICK_H),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.08 })
    );
    this.bulkMesh.position.set(0, SY0 + SC_H / 2, -0.02);
    this.bulkMesh.scale.set(1e-4, 1, 1);
    this.simScene.add(this.bulkMesh);
    this.tickGeom = new THREE.BufferGeometry();
    this.tickGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NMAX * 2 * 3), 3));
    this.tickGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.LineSegments(this.tickGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.85 })));

    // --- labels ---
    // Everything stays inside the ortho box (|y| ≤ 0.95); the legend sits at
    // s ≈ 3.4, where both distributions are already flat against the axis.
    this._label('H  →  Jacobi rotations  →  diagonal', HEAT_CX, HEAT_CY + HEAT_S / 2 + 0.075, 0.05, '#cfd6ff');
    this._label('P(s)   unfolded level spacings', (HX0 + HX1) / 2, HY0 + HIST_H + 0.075, 0.056, '#cfd6ff');
    this._label('s = 0', HX0 + 0.04, HY0 - 0.055, 0.042, '#9aa7c7');
    this._label('s = 4', HX1 - 0.04, HY0 - 0.055, 0.042, '#9aa7c7');
    this._label('matrix ensembles', HX1 - 0.22, HY0 + HIST_H - 0.03, 0.044, '#4cc9f0');
    this._label('Wigner surmise', HX1 - 0.22, HY0 + HIST_H - 0.09, 0.044, '#7c83fd');
    this._label('Poisson control', HX1 - 0.22, HY0 + HIST_H - 0.15, 0.044, '#ef476f');
    this._label('eigenvalues + semicircle law   (shaded: bulk window used)',
      (SX0 + SX1) / 2, SY0 + SC_H + 0.075, 0.048, '#9aa7c7');
  }

  _paintHeat() {
    const h = this.heat;
    if (!h) return;
    const N = this.jN || this.matN, A = this.A, d = h.img.data;
    const scale = N / HEAT_PX;
    for (let py = 0; py < HEAT_PX; py++) {
      const row = ((py * scale) | 0) * N;
      let o = py * HEAT_PX * 4;
      for (let px = 0; px < HEAT_PX; px++, o += 4) {
        const v = A[row + ((px * scale) | 0)];
        let u = (v < 0 ? -v : v) / HEAT_SCALE;
        if (u > 1) u = 1;
        if (v >= 0) {          // positive entries → cyan
          d[o] = 12 + 64 * u; d[o + 1] = 14 + 187 * u; d[o + 2] = 30 + 210 * u;
        } else {               // negative entries → coral
          d[o] = 12 + 227 * u; d[o + 1] = 14 + 57 * u; d[o + 2] = 30 + 81 * u;
        }
        d[o + 3] = 255;
      }
    }
    h.ctx.putImageData(h.img, 0, 0);
    h.tex.needsUpdate = true;
  }

  // Rebin the fixed micro grid (in raw D) into the display window (in s = D/⟨D⟩),
  // splitting straddling micro bins by overlap — the width ratio is non-integer
  // and drifts while ⟨D⟩ settles, so plain index mapping would alias.
  _rebin(micro, meanD, out) {
    out.fill(0);
    if (!(meanD > 0) || !(this.dGridMax > 0)) return;
    const ds = SDISP / NBINS;
    const f = (this.dGridMax / MICRO) / meanD / ds;   // micro-bin width in display bins
    for (let k = 0; k < MICRO; k++) {
      const c = micro[k];
      if (!c) continue;
      const lo = k * f, hi = (k + 1) * f;
      const j0 = lo | 0, j1 = hi | 0;
      if (j0 >= NBINS) break;
      if (j0 === j1) { out[j0] += c; continue; }
      const split = (j0 + 1 - lo) / (hi - lo);
      out[j0] += c * split;
      if (j1 < NBINS) out[j1] += c * (1 - split);
    }
  }

  updateSimScene() {
    if (!this.barMeshes) return;
    this._paintHeat();

    // Jacobi progress: log of the off-diagonal norm relative to ‖H‖²_F, which is
    // exactly the quantity the algorithm drives to zero.
    if (this.progMesh) {
      const r = this.jOff > 0 && this.jFro2 > 0 ? this.jOff / this.jFro2 : 1e-30;
      let frac = Math.log10(Math.max(r, 1e-30)) / -26;
      if (frac < 0) frac = 0; else if (frac > 1) frac = 1;
      const w = Math.max((BAR_X1 - BAR_X0) * frac, 1e-4);
      this.progMesh.scale.x = w;
      this.progMesh.position.x = BAR_X0 + w / 2;
    }

    // Spectrum strip for the most recently completed matrix.
    if (this.showN > 1 && this.showR > 0) {
      const N = this.showN, R = this.showR;
      const cx = (SX0 + SX1) / 2, halfW = (SX1 - SX0) / 2;
      const pos = this.tickGeom.attributes.position.array;
      for (let i = 0; i < N; i++) {
        let u = this.showEig[i] / R;
        if (u > 1) u = 1; else if (u < -1) u = -1;
        const x = cx + u * halfW;
        pos[i * 6] = x; pos[i * 6 + 1] = SY0 - TICK_H; pos[i * 6 + 2] = 0.03;
        pos[i * 6 + 3] = x; pos[i * 6 + 4] = SY0 + TICK_H; pos[i * 6 + 5] = 0.03;
      }
      this.tickGeom.setDrawRange(0, 2 * N);
      this.tickGeom.attributes.position.needsUpdate = true;
      if (this.bulkMesh && this.showI1 > this.showI0) {
        let ua = this.showEig[this.showI0] / R, ub = this.showEig[this.showI1 - 1] / R;
        if (ua < -1) ua = -1;
        if (ub > 1) ub = 1;
        const xa = cx + ua * halfW, xb = cx + ub * halfW;
        this.bulkMesh.scale.x = Math.max(xb - xa, 1e-4);
        this.bulkMesh.position.x = (xa + xb) / 2;
      }
    }

    // Histograms as DENSITIES (count / (total · Δs)) so both series and both
    // theory curves share one vertical scale.
    const ds = SDISP / NBINS;
    const meanM = this.matSpac > 0 ? this.matSumD / this.matSpac : 0;
    this._rebin(this.microMat, meanM, this.binMat);
    for (let j = 0; j < NBINS; j++) {
      const dens = this.matSpac > 0 ? this.binMat[j] / (this.matSpac * ds) : 0;
      const h = Math.max(Math.min(dens / DENS_MAX, 1) * HIST_H, 1e-4);
      const m = this.barMeshes[j];
      m.scale.y = h;
      m.position.y = HY0 + h / 2;
    }

    const showPoi = this.poissonCtl && this.poiSpac > 24;
    this.stairLine.visible = showPoi;
    if (showPoi) {
      this._rebin(this.microPoi, this.poiSumD / this.poiSpac, this.binPoi);
      const sp = this.stairGeom.attributes.position.array;
      let prevY = HY0;
      for (let j = 0; j < NBINS; j++) {
        const dens = this.binPoi[j] / (this.poiSpac * ds);
        const y = HY0 + Math.min(dens / DENS_MAX, 1) * HIST_H;
        sp[(2 * j) * 3 + 1] = prevY;        // tread arriving from the previous bin
        sp[(2 * j + 1) * 3 + 1] = y;        // riser to this bin's height
        prevY = y;
      }
      sp[(2 * NBINS) * 3 + 1] = prevY;
      sp[(2 * NBINS + 1) * 3 + 1] = HY0;
      this.stairGeom.attributes.position.needsUpdate = true;
    }
  }
}

registerSim(RandomMatrixPi);
