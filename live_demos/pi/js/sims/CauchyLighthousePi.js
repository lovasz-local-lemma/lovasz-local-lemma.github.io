import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so rescale to make the beam-rate slider read in beams per wall-clock second at
// speed 1 / 60 fps (the GaltonBoardPi / BuffonNeedle convention).
const TIME_SCALE = 16.7;

// ---------------------------------------------------------------------------
// THE LIGHTHOUSE
//
// A point source sits ONE unit from an infinite straight wall and fires in a
// uniform-random direction.  Put the lamp at the origin and the wall on the line
// y = 1.  A unit direction (c, s) that points at the wall (s > 0) reaches it at
// the parameter t = 1/s, so it lands at the coordinate
//
//        x  =  c / s          (a ratio of the two coordinates of a uniform
//                              direction — the standard Cauchy variate)
//
// The uniform direction is drawn by REJECTION ON THE UNIT DISK: take u, v
// uniform in [-1,1], reject if u²+v² ≥ 1, then normalise.  That calls NO
// trigonometry at all, so no value of π can leak in through a cos/sin/atan.
//
// THE ESTIMATOR (pure counting).  Writing the direction as an angle φ measured
// from the wall-normal, φ is uniform on (−π/2, π/2) and x = tan φ, hence
//
//        P(|x| ≤ h) = 2·arctan(h) / π          ⇒     π = 2·arctan(h) / P
//                                              ⇒     π ≈ 2h / P   (small h)
//
// The code only ever COUNTS how many landings fall in the window ±h:
//
//        π̂ = 2h / P̂ = 2·h·N / (hits in window)
//
// No arctangent is evaluated anywhere on that path.  The arctangent lives only
// in the derivation above — and in two clearly-marked DISPLAY-ONLY reference
// curves drawn beside the measurement.
//
// LESSON 1 — BIAS vs VARIANCE, with a real knob.
//   plim π̂ = 2h / (2·arctan(h)/π) = π · h / arctan(h)
//           = π · (1 + h²/3 − 4h⁴/45 + …)
//   so the bias VANISHES like h²/3 as h → 0, while
//   Var(π̂) ≈ (2h)²·P(1−P)/(N·P⁴) ≈ π³ / (2·h·N)  blows up like 1/(hN).
//   Balancing (π h²/3)² against π³/(2hN) gives h* = (9π/(8N))^(1/5) ∝ N^(−1/5)
//   and therefore an RMSE ∝ N^(−2/5) — slower than the usual N^(−1/2).
//   (Every one of those constants was re-derived and checked numerically; the
//   sim shows the whole h-ladder at once so the trade-off is visible, not told.)
//
// LESSON 2 — THE LAW OF LARGE NUMBERS FAILS.
//   The Cauchy distribution has NO mean: E|x| = ∞.  The running average of the
//   landing coordinates is itself standard Cauchy for EVERY N, so it never
//   settles — it keeps taking huge jumps forever, driven by the rare
//   near-parallel rays that land absurdly far down the wall.  Averaging fails;
//   counting still works.  Both are on screen at once, side by side.
// ---------------------------------------------------------------------------

const S = 0.38;                 // screen units per world unit (uniform, honest)
const LIGHT_Y = -0.38;          // lamp screen y
const WALL_Y = LIGHT_Y + S;     // = 0.0 — the wall is exactly one world unit up
const VIEW_X = 1.05;            // camera half-width
const XVIS = VIEW_X / S;        // widest landing coordinate still on screen (≈2.76)

const MAX_BEAMS = 84;           // recent beams drawn (ring buffer)
const MAX_DOTS = 900;           // recent landing marks on the wall (ring buffer)
const HIST_BINS = 61;           // wall histogram bins over [−XVIS, XVIS]
const HIST_BASE = 0.05;         // histogram baseline (screen y, just above wall)
const HIST_H = 0.86;            // histogram max bar height
const TRACE_N = 200;            // running-mean tape samples
const TRACE_TOP = -0.60;        // tape: oldest sample
const TRACE_BOT = -1.00;        // tape: newest sample
const REC_CAP = 260;            // time-series records kept

// The bias–variance ladder: nine window half-widths, geometrically spaced over
// two decades.  EVERY landing is tested against all nine, so the nine estimators
// share one sample stream and differ ONLY in h — the cleanest possible way to
// see bias (large h) and variance (small h) at the same instant.
const LADDER = [0.03, 0.0533, 0.0949, 0.1687, 0.30, 0.5335, 0.9487, 1.687, 3.0];

export class CauchyLighthousePi extends Simulation {
  static id = 'cauchy-lighthouse-pi';
  static title = 'The Lighthouse — π from a distribution with no mean';
  static description = 'A beam fired in a uniform-random direction lands Cauchy-distributed on the wall: counting the near hits gives π, while the running average never settles';
  static piMechanism = 'statistical: P(|x| ≤ h) = 2·arctan(h)/π for a Cauchy landing ⇒ π ≈ 2h/P̂';
  static rigor = 'Statistical';
  // Slots between buffon-needle (62) and circle-coverage (64) — the other
  // geometric-probability cards (sphere-volume-mc is 77, buffon-cross-grid 76).
  static sortOrder = 63;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 26;
  // Thumbnail uses a deliberately WIDE window (h ≈ 0.45) so the gold ±h band on
  // the wall reads at card size; the live default below is narrower and far less
  // biased.
  static previewParams = { hExp: -0.35, rate: 55, turbo: false };
  static alternatives = [
    { id: 'buffon-needle', label: 'Buffon — π from crossings instead of landings' },
    { id: 'sphere-volume-mc', label: 'Monte-Carlo volume — a well-behaved estimator' }
  ];
  static explanation = {
    setup: 'A lighthouse sits one unit from an infinite straight wall and fires a beam in a uniform-random direction. The direction is drawn by rejection on the unit disk — pick (u,v) uniform in the square, throw it away unless it lands inside the circle, then normalise — so not one line of trigonometry is involved. Where the beam meets the wall, the coordinate x is standard Cauchy distributed: mostly near the foot of the lighthouse, but with a tail so heavy that the distribution has no mean at all.',
    insight: 'Write the beam direction as an angle φ from the wall-normal. φ is uniform, and the landing coordinate is x = tan φ, so P(|x| ≤ h) = 2·arctan(h)/π. Count the fraction P̂ of landings inside a window of half-width h around the foot and invert: π ≈ 2h/P̂ (exactly π·h/arctan(h) in the limit). The code never evaluates an arctangent — it only counts hits. Two lessons ride on the one knob h: the bias π·(1 + h²/3 − …) vanishes as h shrinks, while the variance π³/(2hN) explodes, so the best window shrinks like N^(−1/5) and the error falls only like N^(−2/5).',
    contrast: 'Beside the estimate runs the sample MEAN of the same landings. It never converges. The Cauchy distribution has no mean, so the average of N samples is itself Cauchy for every N — it jumps as violently after a million beams as after ten, every time a near-parallel ray lands far down the wall. The law of large numbers simply does not apply. Averaging fails; counting still works. That contrast is the whole point of this machine.',
    formula: 'π ≈ 2h/P̂,  P̂ = (landings with |x| ≤ h)/N   —   exact limit π·h/arctan(h)   [STATISTICAL, biased at finite h]',
    getExpected: (params) => {
      // PROSE ONLY. This helper writes the description text on the page; it is
      // not on the estimator path, so the exact arctangent/π are allowed here
      // purely to state what the measurement should be converging to.
      const hExp = params.hExp != null ? params.hExp : -1;
      const h = Math.pow(10, hExp);
      const limit = Math.PI * h / Math.atan(h);              // display-only truth
      const rel = (limit - Math.PI) / Math.PI;
      return `Window h = ${h.toFixed(4)}. Even with infinitely many beams this estimator converges to π·h/arctan(h) = ${limit.toFixed(6)} — high by ${(rel * 100).toFixed(3)}% (≈ h²/3 = ${(h * h / 3 * 100).toFixed(3)}%). Shrink h and that bias dies like h², but the noise grows like 1/√(hN): at h = ${h.toFixed(4)} you need about ${Math.max(1, Math.round(Math.PI * Math.PI * Math.PI / (2 * h) / Math.pow(0.01 * Math.PI, 2))).toLocaleString()} beams for a 1% standard error. Meanwhile the running sample MEAN of the landings converges to nothing at all.`;
    }
  };

  constructor(params = {}) {
    super(params);
    // h is exposed on a log slider: h = 10^hExp, so one knob spans 0.01 … 5.
    // Default h = 0.1: the finite-h ceiling is π·h/arctan(h) = 3.15204, only
    // 0.33% (= h²/3) above π — close enough that the digits read as π, wide
    // enough that ~6.4% of beams land in the window. Both lessons stay visible.
    this.hExp = params.hExp != null ? params.hExp : -1;
    this.rate = params.rate || 45;
    this.turbo = params.turbo || false;

    // ---- preallocated pools (nothing in step()/update() allocates) ----------
    this.beamX0 = new Float32Array(MAX_BEAMS);
    this.beamY0 = new Float32Array(MAX_BEAMS);
    this.beamX1 = new Float32Array(MAX_BEAMS);
    this.beamY1 = new Float32Array(MAX_BEAMS);
    this.beamKind = new Uint8Array(MAX_BEAMS);      // 0 in-window, 1 outside, 2 escaped
    this.dotX = new Float32Array(MAX_DOTS);
    this.dotKind = new Uint8Array(MAX_DOTS);
    this.hist = new Float64Array(HIST_BINS);
    this.ladderBucket = new Float64Array(LADDER.length + 1);  // last cell = beyond h_max
    this.ladderCount = new Float64Array(LADDER.length);       // suffix sums, render-time
    this.trace = new Float32Array(TRACE_N);         // running-mean tape (ring)

    this.reset();
  }

  // h changes only via the slider, whose onChange calls reset() — so cache it
  // once per reset instead of paying a Math.pow on every sampled beam.
  get h() { return this.hVal; }

  reset() {
    super.reset();
    this.hVal = Math.pow(10, this.hExp);
    this.beams = 0;               // N — total beams fired
    this.hits = 0;                // landings with |x| ≤ h  (the ONLY estimator input)
    this.escapes = 0;             // landings off the visible wall (still counted in N)
    this.sumX = 0;                // Σ x — for the running mean that never settles
    this.mean = 0;
    this.maxAbsMean = 0;          // biggest excursion of the running mean
    this.maxAbsMeanAt = 0;
    this.maxJump = 0;             // biggest single-sample jump of the running mean
    this.maxJumpAt = 0;
    // The same two, but ignoring the first 1000 beams. A skeptic will object that
    // a wild early average is just small-sample noise; these say the wildness
    // NEVER stops, which is the actual claim.
    this.lateMaxAbsMean = 0;
    this.lateMaxAbsMeanAt = 0;
    this.lateMaxJump = 0;
    this.lateMaxJumpAt = 0;
    this.maxAbsX = 0;             // furthest landing seen (the near-parallel ray)
    this.maxAbsXAt = 0;
    this.hist.fill(0);
    this.ladderBucket.fill(0);
    this.trace.fill(0);
    this.traceHead = 0;
    this.traceCount = 0;
    this.beamHead = 0;
    this.beamCount = 0;
    this.dotHead = 0;
    this.dotCount = 0;
    this.beamCarry = 0;
    this.turboCarry = 0;
    this.traceCarry = 0;
    this.collisionCount = 0;
    this.finished = false;
    this.lastC = 0; this.lastS = 1; this.lastX = 0;

    // time-series records at geometric N (bounded under turbo's millions)
    this.rec = { n: [], mean: [], pi: [] };
    this.nextSample = 8;
    this.recVersion = 0;
    this._chartCache = null;
    this._chartVersion = -1;
    this._chartFrame = 0;

    // Decorative beacon: a unit vector advanced by a FIXED rotation each frame
    // (no trigonometry per frame, no π anywhere).
    this.beaconC = 1; this.beaconS = 0;
  }

  // ---- the sampler: uniform direction, zero trigonometry ---------------------
  // Rejection on the unit disk. (u,v) uniform in the square, kept only when it
  // falls inside the circle, then normalised — the classic π-free way to get a
  // uniform direction. Directions pointing away from the wall are point-reflected
  // through the lamp (θ → θ+π), a bijection of the away-half onto the toward-half
  // that leaves the surviving direction uniform on the half-circle.
  //
  // v === 0 exactly (a ray dead parallel to the wall, landing at infinity) is a
  // measure-zero event that only arises from Math.random() returning exactly 0.5;
  // it is rejected so the running sum can never become Infinity.
  _fireBeam() {
    let ux, uy, r2;
    do {
      ux = 2 * Math.random() - 1;
      uy = 2 * Math.random() - 1;
      r2 = ux * ux + uy * uy;
    } while (r2 > 1 || r2 === 0 || uy === 0);
    const inv = 1 / Math.sqrt(r2);
    let c = ux * inv, s = uy * inv;
    if (s < 0) { c = -c; s = -s; }        // fold onto the half that reaches the wall
    this.lastC = c; this.lastS = s;
    return c / s;                          // = tan(angle from the normal) — Cauchy
  }

  // Fold one landing into every statistic. PURE COUNTING for the estimator:
  // the only thing π̂ ever sees is `hits` and `beams`.
  _record(x, visible) {
    const ax = x < 0 ? -x : x;
    this.beams++;
    if (ax <= this.h) this.hits++;

    // Bias–variance ladder: bucket by the SMALLEST window that contains this
    // landing; suffix sums at render time give the count for every h at once.
    let k = 0;
    while (k < LADDER.length && ax > LADDER[k]) k++;
    this.ladderBucket[k]++;

    // The running mean — the estimator that never converges.
    const prev = this.mean;
    this.sumX += x;
    this.mean = this.sumX / this.beams;
    const jump = Math.abs(this.mean - prev);
    if (jump > this.maxJump) { this.maxJump = jump; this.maxJumpAt = this.beams; }
    const am = Math.abs(this.mean);
    if (am > this.maxAbsMean) { this.maxAbsMean = am; this.maxAbsMeanAt = this.beams; }
    if (this.beams > 1000) {
      if (jump > this.lateMaxJump) { this.lateMaxJump = jump; this.lateMaxJumpAt = this.beams; }
      if (am > this.lateMaxAbsMean) { this.lateMaxAbsMean = am; this.lateMaxAbsMeanAt = this.beams; }
    }
    if (ax > this.maxAbsX) { this.maxAbsX = ax; this.maxAbsXAt = this.beams; }

    // Wall histogram (visible span only; the rest is counted as an escape).
    if (ax < XVIS) {
      let b = Math.floor(((x + XVIS) / (2 * XVIS)) * HIST_BINS);
      if (b < 0) b = 0; else if (b >= HIST_BINS) b = HIST_BINS - 1;
      this.hist[b]++;
    } else {
      this.escapes++;
    }

    this.collisionCount = this.hits;
    this.lastX = x;

    if (visible) this._pushBeam(x, ax <= this.h);

    if (this.beams >= this.nextSample) {
      this._pushRecord();
      this.nextSample = Math.ceil(this.nextSample * 1.28);
    }
  }

  _pushRecord() {
    const r = this.rec;
    r.n.push(this.beams);
    r.mean.push(this.mean);
    r.pi.push(this.hits > 0 ? (2 * this.h * this.beams) / this.hits : NaN);
    if (r.n.length > REC_CAP) { r.n.shift(); r.mean.shift(); r.pi.shift(); }
    this.recVersion++;
  }

  // Ring-buffer a drawable beam: lamp → landing, clipped to the frame edge when
  // the landing is off screen (those are drawn in the "escaped" colour).
  _pushBeam(x, inWindow) {
    const sx = x * S;
    let ex = sx, ey = WALL_Y, kind = inWindow ? 0 : 1;
    if (sx > VIEW_X || sx < -VIEW_X) {
      const t = VIEW_X / (sx < 0 ? -sx : sx);
      ex = sx < 0 ? -VIEW_X : VIEW_X;
      ey = LIGHT_Y + t * (WALL_Y - LIGHT_Y);
      kind = 2;
    }
    const i = this.beamHead;
    this.beamX0[i] = 0; this.beamY0[i] = LIGHT_Y;
    this.beamX1[i] = ex; this.beamY1[i] = ey;
    this.beamKind[i] = kind;
    this.beamHead = (i + 1) % MAX_BEAMS;
    if (this.beamCount < MAX_BEAMS) this.beamCount++;

    if (kind !== 2) {
      const d = this.dotHead;
      this.dotX[d] = sx;
      this.dotKind[d] = kind;
      this.dotHead = (d + 1) % MAX_DOTS;
      if (this.dotCount < MAX_DOTS) this.dotCount++;
    }
  }

  _pushTrace() {
    this.trace[this.traceHead] = this.mean;
    this.traceHead = (this.traceHead + 1) % TRACE_N;
    if (this.traceCount < TRACE_N) this.traceCount++;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'hExp', label: 'Window  log₁₀ h   (h = 10ˣ)', highlight: true,
        min: -2, max: 0.7, step: 0.05, default: this.hExp,
        onChange: (val) => { this.hExp = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'rate', label: 'Beams/s',
        min: 1, max: 200, step: 1, default: this.rate,
        onChange: (val) => { this.rate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: this.speed ?? 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'ray-disc', dimension: 2, primary: true,
        label: 'The input is boringly uniform — beam directions on the unit circle',
        axisLabels: { x: 'direction · x̂', y: 'direction · ŷ  (toward the wall)' }
      },
      {
        id: 'tan-map', dimension: 2, boundary: 'none',
        label: 'Uniform in, heavy-tailed out — landing (squashed) vs direction',
        axisLabels: { x: 'direction · x̂  (∝ angle)', y: 'landing x/(1+|x|)' }
      }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let fired = false;

    // Decorative beacon sweep: rotate the stored unit vector by a fixed small
    // angle. Constants, not trigonometry-per-frame, and π-free.
    const wc = 0.99987663, ws = 0.01570732;         // cos/sin of ~0.9° per step
    const nb = this.beaconC * wc - this.beaconS * ws;
    this.beaconS = this.beaconC * ws + this.beaconS * wc;
    this.beaconC = nb;

    this.beamCarry += this.rate * t;
    let n = Math.floor(this.beamCarry);
    this.beamCarry -= n;
    for (; n > 0; n--) {
      this._record(this._fireBeam(), true);
      this.pendingPhasePoints.push(this.getPhasePoint());
      fired = true;
    }

    if (this.turbo) {
      this.turboCarry += this.rate * 999 * t;
      let m = Math.floor(this.turboCarry);
      this.turboCarry -= m;
      if (m > 0) fired = true;
      for (; m > 0; m--) this._record(this._fireBeam(), false);
    }

    // Keep the running-mean tape scrolling at a steady visual rate whatever the
    // sampling rate is, so the jumps are legible rather than a blur.
    if (fired) {
      this.traceCarry += 26 * t;
      let q = Math.floor(this.traceCarry);
      this.traceCarry -= q;
      if (q > 3) q = 3;
      for (; q > 0; q--) this._pushTrace();
    }

    return fired;
  }

  // ---- the estimator: 2h/P̂, and nothing else ---------------------------------
  // Inputs: the window half-width h (a slider), the number of beams N, and the
  // number that landed inside the window. No π literal, no cos/sin/atan.
  getPiApproximation() {
    if (this.hits === 0) return 0;
    return (2 * this.h * this.beams) / this.hits;
  }

  getPiReadout() {
    return this.hits > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getCollisionCount() { return `${this.hits}/${this.beams}`; }
  getCountLabel() { return 'In-window landings / beams'; }

  // Suffix-sum the ladder buckets into per-h counts (render time only).
  _ladderCounts() {
    let acc = 0;
    for (let k = 0; k < LADDER.length; k++) {
      acc += this.ladderBucket[k];
      this.ladderCount[k] = acc;
    }
    return this.ladderCount;
  }

  getPhasePoint() {
    // [direction x, direction y, squashed landing] — getPhaseExtractor picks the
    // pair each view wants. The squash is display-only compression of a variate
    // with unbounded range.
    const x = this.lastX;
    return [this.lastC, this.lastS, x / (1 + (x < 0 ? -x : x))];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'tan-map') return (pt) => [pt[0], pt[2]];
    return (pt) => [pt[0], pt[1]];
  }

  // =========================================================================
  // READOUT
  // =========================================================================
  getFormulaHTML() {
    const h = this.h;
    const N = this.beams;
    const P = N > 0 ? this.hits / N : 0;
    const pi = this.getPiApproximation();
    const live = this.hits > 0 ? piDigitsHTML(pi, 5) : 'collecting…';
    // Standard error of π̂ from the MEASURED counts alone: π̂ = 2h/P̂ so
    // sd(π̂) = 2h·sd(P̂)/P̂² with sd(P̂) = √(P̂(1−P̂)/N). π-free.
    const se = (N > 0 && this.hits > 0)
      ? (2 * h) * Math.sqrt(P * (1 - P) / N) / (P * P) : NaN;

    // Regenerate the inline charts at most every 10th frame (getFormulaHTML is
    // re-rendered every frame via innerHTML, so the SVG strings are cached).
    this._chartFrame++;
    if (!this._chartCache || this._chartVersion !== this.recVersion || this._chartFrame % 10 === 0) {
      this._chartCache = this._ladderSVG() + this._contrastSVG();
      this._chartVersion = this.recVersion;
    }

    const meanTxt = N > 0 ? this._fmt(this.mean) : '—';
    const escPct = N > 0 ? (100 * this.escapes / N) : 0;

    // ONE top-level block wrapper: `.formula-readout` is itself a flex ROW capped
    // at 520px, so every top-level node returned here would become a sibling flex
    // ITEM and the charts would sit BESIDE the text. (BuffonNeedle._raceHTML sets
    // the same house pattern.)
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;width:100%;text-align:right">`
      + `<div><strong>The Lighthouse</strong> — landing x = c/s for a uniform direction (c,s)<br>`
      + `<span class="f-angle">P(|x| ≤ h) = 2·arctan(h)/π</span> ⇒ `
      + `<span class="f-result">π</span> ≈ 2h/P̂</div>`
      + `<div>h = <span class="f-angle">${h.toFixed(4)}</span> · `
      + `P̂ = <span class="f-count">${this.hits}</span>/<span class="f-count">${N.toLocaleString()}</span>`
      + ` = ${P.toFixed(6)}<br>`
      + `<span class="f-result">π</span> ≈ 2·${h.toFixed(4)}/${P.toFixed(6)} `
      + `<span style="font-size:1.1em">= ${live}</span>`
      + `${isFinite(se) ? `<br><span style="opacity:.7;font-size:.85em">measured ±1 s.e. = ${se.toFixed(5)} (from the counts alone)</span>` : ''}</div>`
      + this._chartCache
      + `<div style="opacity:.8;font-size:.85em"><strong>Lesson 1 — bias vs variance, one knob.</strong> `
      + `The estimator is BIASED at finite h: with infinitely many beams 2h/P̂ → π·h/arctan(h) = π·(1 + h²/3 − 4h⁴/45 + …). `
      + `At h = ${h.toFixed(4)} that ceiling sits ${(100 * h * h / 3).toFixed(3)}% above π (the h²/3 term) — a floor no amount of data removes. `
      + `Shrink h and the bias dies like h², but the variance ≈ π³/(2hN) explodes: only a fraction ≈ 2h/π of beams land in the window at all. `
      + `The best window shrinks like N<sup>−1/5</sup>, so the error falls only like N<sup>−2/5</sup> — worse than the usual Monte-Carlo N<sup>−1/2</sup>. `
      + `Drag the window slider and watch the ladder above: the right-hand points ride systematically HIGH on the theory curve, the left-hand points scatter wildly.</div>`
      + `<div style="opacity:.8;font-size:.85em"><strong>Lesson 2 — the law of large numbers FAILS.</strong> `
      + `Running sample mean of the landings: <span class="f-count">${meanTxt}</span> after ${N.toLocaleString()} beams. `
      + `It is not converging and never will: a Cauchy variate has no mean (E|x| = ∞), and the average of N of them is <em>itself standard Cauchy for every N</em> — `
      + `as jumpy after a million beams as after ten. Largest excursion so far <strong>${this._fmt(this.maxAbsMean)}</strong> (at N = ${this.maxAbsMeanAt.toLocaleString()}), `
      + `biggest single-beam jump <strong>${this._fmt(this.maxJump)}</strong> (at N = ${this.maxJumpAt.toLocaleString()}). `
      + `Discounting the first thousand beams — so this cannot be dismissed as small-sample noise — the record excursion is still `
      + `<strong>${N > 1000 ? this._fmt(this.lateMaxAbsMean) : '—'}</strong> (at N = ${this.lateMaxAbsMeanAt.toLocaleString()}) and the record jump `
      + `<strong>${N > 1000 ? this._fmt(this.lateMaxJump) : '—'}</strong> (at N = ${this.lateMaxJumpAt.toLocaleString()}). `
      + `Furthest landing <strong>${this._fmt(this.maxAbsX)}</strong> wall-units from the foot (at N = ${this.maxAbsXAt.toLocaleString()}). `
      + `Those spikes are the near-parallel rays. ${escPct.toFixed(1)}% of beams land clean off the visible wall. `
      + `<strong>Averaging fails; counting still works</strong> — the π̂ panel below the mean panel uses the very same landings.</div>`
      + `<div style="opacity:.62;font-size:.8em">Honesty: the estimator path is pure counting — h, N and the in-window tally, nothing else. The direction is sampled by rejection on the unit disk, so no cos/sin/atan is ever called on the way to π̂. The arctangent appears only in the derivation and in the dashed DISPLAY-ONLY reference curves (theory ceiling π·h/arctan h, and the π line), which are drawn beside the measurement, never fed into it. The slow rotating beacon is decoration: each sample is an independent uniform-random direction, not a point on that sweep.</div>`
      + `</div>`;
  }

  _fmt(v) {
    if (!isFinite(v)) return '∞';
    const a = Math.abs(v);
    if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(2);
    return v.toFixed(a >= 100 ? 1 : 4);
  }

  // ---- CHART 1: the bias–variance ladder -------------------------------------
  // π̂ measured at nine window widths from ONE sample stream, with ±1 s.e. bars
  // computed from the measured counts, against the DISPLAY-ONLY theory ceiling
  // π·h/arctan(h) and the DISPLAY-ONLY π line.
  _ladderSVG() {
    const N = this.beams;
    if (N < 20) return '';
    const counts = this._ladderCounts();
    const W = 300, H = 176, ml = 44, mr = 10, mt = 22, mb = 30;
    const L10 = Math.log(10);
    const lx = LADDER.map((v) => Math.log(v) / L10);
    const xmin = lx[0] - 0.12, xmax = lx[lx.length - 1] + 0.12;

    // DISPLAY-ONLY reference curve: the exact finite-h limit π·h/arctan(h).
    // Never enters any estimate — it is the line the measurement is compared TO.
    const theory = (hh) => Math.PI * hh / Math.atan(hh);

    const pts = [];
    let ymin = Math.PI, ymax = Math.PI;
    for (let k = 0; k < LADDER.length; k++) {
      const c = counts[k];
      if (c < 3) { pts.push(null); continue; }
      const p = c / N;
      const est = (2 * LADDER[k]) / p;
      const sd = (2 * LADDER[k]) * Math.sqrt(p * (1 - p) / N) / (p * p);
      pts.push({ x: lx[k], y: est, sd });
      const lo = est - sd, hi = est + sd;
      if (lo < ymin) ymin = lo;
      if (hi > ymax) ymax = hi;
    }
    // Always show the theory ceiling across the whole ladder.
    for (const hh of LADDER) { const tv = theory(hh); if (tv > ymax) ymax = tv; }
    // Clip an absurd small-h excursion so the rest of the ladder stays readable.
    if (ymin < 1.2) ymin = 1.2;
    if (ymax > 7.5) ymax = 7.5;
    if (ymax - ymin < 0.8) { ymax += 0.4; ymin -= 0.4; }

    const px = (v) => ml + (v - xmin) / (xmax - xmin) * (W - ml - mr);
    const py = (v) => H - mb - (Math.min(ymax, Math.max(ymin, v)) - ymin) / (ymax - ymin) * (H - mt - mb);

    let curve = '';
    for (let i = 0; i <= 40; i++) {
      const lv = xmin + (i / 40) * (xmax - xmin);
      const hh = Math.pow(10, lv);
      curve += (i ? 'L' : 'M') + px(lv).toFixed(1) + ' ' + py(theory(hh)).toFixed(1) + ' ';
    }
    const piLine = `<line x1="${ml}" y1="${py(Math.PI).toFixed(1)}" x2="${W - mr}" y2="${py(Math.PI).toFixed(1)}" stroke="#7CFC8A" stroke-dasharray="4 3" opacity="0.75"/>`;

    let marks = '';
    for (const p of pts) {
      if (!p) continue;
      const X = px(p.x).toFixed(1);
      marks += `<line x1="${X}" y1="${py(p.y - p.sd).toFixed(1)}" x2="${X}" y2="${py(p.y + p.sd).toFixed(1)}" stroke="#5bd0ff" stroke-width="1.2" opacity="0.85"/>`;
      marks += `<circle cx="${X}" cy="${py(p.y).toFixed(1)}" r="2.7" fill="#f5c542"/>`;
    }
    // Marker for the live slider value (clamped: the slider reaches h = 5, past
    // the ladder's widest rung, and the SVG has overflow:visible).
    const liveX = Math.max(ml, Math.min(W - mr, px(Math.log(this.h) / L10))).toFixed(1);
    const liveMark = `<line x1="${liveX}" y1="${mt - 6}" x2="${liveX}" y2="${H - mb}" stroke="#ff7f6b" stroke-width="1" opacity="0.55"/>`;

    const axis = `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`
      + `<line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`;
    let ticks = '';
    for (const v of [-2, -1, 0]) {
      if (v < xmin || v > xmax) continue;
      ticks += `<text x="${px(v).toFixed(1)}" y="${H - mb + 10}" font-size="8" fill="currentColor" opacity="0.6" text-anchor="middle">10${v === 0 ? '⁰' : v === -1 ? '⁻¹' : '⁻²'}</text>`;
    }
    for (const v of [2, 3, Math.PI, 4, 5, 6, 7]) {
      if (v < ymin || v > ymax) continue;
      const isPi = Math.abs(v - Math.PI) < 1e-9;
      ticks += `<text x="${ml - 5}" y="${(py(v) + 3).toFixed(1)}" font-size="8" fill="${isPi ? '#7CFC8A' : 'currentColor'}" opacity="${isPi ? 0.95 : 0.6}" text-anchor="end">${isPi ? 'π' : v}</text>`;
    }
    const cy = ((mt + H - mb) / 2).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:470px;margin-top:2px;overflow:visible;color:inherit">
      ${axis}${ticks}${piLine}
      <path d="${curve}" fill="none" stroke="#ff7f6b" stroke-width="1.4" stroke-dasharray="5 3" opacity="0.9"/>
      ${liveMark}${marks}
      <text x="${ml}" y="${mt - 10}" font-size="8.5" fill="currentColor" opacity="0.8">bias–variance: π̂ at 9 windows, same ${N.toLocaleString()} beams</text>
      <rect x="${W - mr - 128}" y="${mt - 18}" width="8" height="2" fill="#ff7f6b"/><text x="${W - mr - 117}" y="${mt - 14}" font-size="7.5" fill="currentColor" opacity="0.75">theory π·h/arctan h</text>
      <text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">window half-width h (log scale)</text>
      <text x="12" y="${cy}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle" transform="rotate(-90 12 ${cy})">π̂ = 2h/P̂</text>
    </svg>`;
  }

  // ---- CHART 2: averaging fails / counting works -----------------------------
  // Two stacked panels sharing the log₁₀ N axis, fed by the SAME landings.
  // Top: the running sample mean (symlog) — never settles.
  // Bottom: π̂ = 2h/P̂ — settles onto the finite-h ceiling.
  _contrastSVG() {
    const r = this.rec;
    if (r.n.length < 3) return '';
    const W = 300, H = 200, ml = 44, mr = 10, mt = 20, mb = 28, gap = 20;
    const L10 = Math.log(10);
    const xs = r.n.map((n) => Math.log(Math.max(1, n)) / L10);
    let xmin = xs[0], xmax = xs[xs.length - 1];
    if (xmax - xmin < 1e-9) xmax = xmin + 1;
    const px = (v) => ml + (v - xmin) / (xmax - xmin) * (W - ml - mr);

    const panelH = (H - mt - mb - gap) / 2;
    const topY0 = mt, topY1 = mt + panelH;
    const botY0 = topY1 + gap, botY1 = botY0 + panelH;

    // --- top panel: running mean under a symmetric log squash ---------------
    const sym = (v) => (v < 0 ? -1 : 1) * Math.log(1 + Math.abs(v)) / L10;
    let mmax = 0.3;
    for (const m of r.mean) { const a = Math.abs(sym(m)); if (a > mmax) mmax = a; }
    const pyTop = (v) => topY1 - (sym(v) + mmax) / (2 * mmax) * panelH;
    let meanPath = '';
    for (let i = 0; i < xs.length; i++) {
      meanPath += (i ? 'L' : 'M') + px(xs[i]).toFixed(1) + ' ' + pyTop(r.mean[i]).toFixed(1) + ' ';
    }
    const zeroLine = `<line x1="${ml}" y1="${pyTop(0).toFixed(1)}" x2="${W - mr}" y2="${pyTop(0).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity="0.4"/>`;

    // --- bottom panel: π̂ ----------------------------------------------------
    // DISPLAY-ONLY references: the π line (what an unbiased estimator would hit)
    // and the finite-h ceiling π·h/arctan(h) this estimator actually converges to.
    const PI_TRUTH = Math.PI;
    const ceiling = PI_TRUTH * this.h / Math.atan(this.h);
    let plo = Math.min(PI_TRUTH, ceiling), phi = Math.max(PI_TRUTH, ceiling);
    for (const p of r.pi) { if (isFinite(p)) { if (p < plo) plo = p; if (p > phi) phi = p; } }
    if (plo < 1.0) plo = 1.0;
    if (phi > 8.0) phi = 8.0;
    if (phi - plo < 0.6) { phi += 0.3; plo -= 0.3; }
    const pyBot = (v) => botY1 - (Math.min(phi, Math.max(plo, v)) - plo) / (phi - plo) * panelH;
    let piPath = '', started = false;
    for (let i = 0; i < xs.length; i++) {
      const p = r.pi[i];
      if (!isFinite(p)) { started = false; continue; }
      piPath += (started ? 'L' : 'M') + px(xs[i]).toFixed(1) + ' ' + pyBot(p).toFixed(1) + ' ';
      started = true;
    }
    const piRef = `<line x1="${ml}" y1="${pyBot(PI_TRUTH).toFixed(1)}" x2="${W - mr}" y2="${pyBot(PI_TRUTH).toFixed(1)}" stroke="#7CFC8A" stroke-dasharray="4 3" opacity="0.8"/>`;
    const ceilRef = Math.abs(ceiling - PI_TRUTH) / PI_TRUTH > 0.004
      ? `<line x1="${ml}" y1="${pyBot(ceiling).toFixed(1)}" x2="${W - mr}" y2="${pyBot(ceiling).toFixed(1)}" stroke="#ff7f6b" stroke-dasharray="4 3" opacity="0.7"/>`
      : '';

    const axes = `<line x1="${ml}" y1="${topY0}" x2="${ml}" y2="${topY1}" stroke="currentColor" opacity="0.4"/>`
      + `<line x1="${ml}" y1="${botY0}" x2="${ml}" y2="${botY1}" stroke="currentColor" opacity="0.4"/>`
      + `<line x1="${ml}" y1="${botY1}" x2="${W - mr}" y2="${botY1}" stroke="currentColor" opacity="0.4"/>`;

    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:470px;margin-top:6px;overflow:visible;color:inherit">
      ${axes}${zeroLine}
      <path d="${meanPath}" fill="none" stroke="#5bd0ff" stroke-width="1.5"/>
      <text x="${ml + 4}" y="${topY0 - 5}" font-size="8.5" fill="#5bd0ff" opacity="0.95">AVERAGING FAILS — running mean of x (no mean exists)</text>
      <text x="${ml - 5}" y="${(pyTop(0) + 3).toFixed(1)}" font-size="8" fill="currentColor" opacity="0.6" text-anchor="end">0</text>
      ${piRef}${ceilRef}
      <path d="${piPath}" fill="none" stroke="#f5c542" stroke-width="1.5"/>
      <text x="${ml + 4}" y="${botY0 - 5}" font-size="8.5" fill="#f5c542" opacity="0.95">COUNTING WORKS — π̂ = 2h/P̂ from the same landings</text>
      <text x="${ml - 5}" y="${(pyBot(PI_TRUTH) + 3).toFixed(1)}" font-size="8" fill="#7CFC8A" opacity="0.9" text-anchor="end">π</text>
      <text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">log₁₀ N (beams)</text>
    </svg>`;
  }

  // =========================================================================
  // SCENE
  // =========================================================================
  getPreviewBox() {
    return { x0: -VIEW_X, x1: VIEW_X, y0: -1.05, y1: 0.98 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-VIEW_X, VIEW_X, 0.98, -1.05, 0.1, 10);
    this.simCamera.position.z = 1;

    // The wall.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-VIEW_X, WALL_Y, 0), new THREE.Vector3(VIEW_X, WALL_Y, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    ));

    // Foot of the lighthouse + the unit-distance tick.
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, WALL_Y - 0.03, 0), new THREE.Vector3(0, WALL_Y + 0.03, 0),
        new THREE.Vector3(-0.012, LIGHT_Y, 0), new THREE.Vector3(-0.012, WALL_Y, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x9aa7c7, transparent: true, opacity: 0.5 })
    ));

    // The ±h window: a bright segment of the wall plus two end ticks. Rebuilt in
    // updateSimScene each frame from a 6-vertex pooled buffer (h can move).
    const winPos = new Float32Array(6 * 3);
    this.winGeom = new THREE.BufferGeometry();
    this.winGeom.setAttribute('position', new THREE.BufferAttribute(winPos, 3));
    this.simScene.add(new THREE.LineSegments(
      this.winGeom,
      new THREE.LineBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.95 })
    ));

    // Lighthouse tower.
    const tw = 0.052, tt = 0.024, th = 0.17;
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-tw, LIGHT_Y - th, 0), new THREE.Vector3(-tt, LIGHT_Y, 0),
        new THREE.Vector3(tw, LIGHT_Y - th, 0), new THREE.Vector3(tt, LIGHT_Y, 0),
        new THREE.Vector3(-tw, LIGHT_Y - th, 0), new THREE.Vector3(tw, LIGHT_Y - th, 0),
        new THREE.Vector3(-tt, LIGHT_Y, 0), new THREE.Vector3(tt, LIGHT_Y, 0),
        new THREE.Vector3(-tt * 1.5, LIGHT_Y + 0.03, 0), new THREE.Vector3(tt * 1.5, LIGHT_Y + 0.03, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xd8dcf0, transparent: true, opacity: 0.85 })
    ));
    this.simScene.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, LIGHT_Y + 0.012, 0.02)]),
      new THREE.PointsMaterial({ color: 0xfff3b0, size: 7, sizeAttenuation: false })
    ));

    // Decorative rotating beacon (see the honesty note in the readout).
    const beaconPos = new Float32Array(2 * 3);
    this.beaconGeom = new THREE.BufferGeometry();
    this.beaconGeom.setAttribute('position', new THREE.BufferAttribute(beaconPos, 3));
    this.simScene.add(new THREE.Line(
      this.beaconGeom,
      new THREE.LineBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.22 })
    ));

    // Pooled beams (vertex-coloured: in-window gold, outside blue, escaped coral).
    const bp = new Float32Array(MAX_BEAMS * 2 * 3);
    const bc = new Float32Array(MAX_BEAMS * 2 * 3);
    this.beamGeom = new THREE.BufferGeometry();
    this.beamGeom.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    this.beamGeom.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    this.beamGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.LineSegments(
      this.beamGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 })
    ));

    // Pooled landing marks on the wall.
    const dp = new Float32Array(MAX_DOTS * 3);
    const dc = new Float32Array(MAX_DOTS * 3);
    this.dotGeom = new THREE.BufferGeometry();
    this.dotGeom.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dotGeom.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    this.dotGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Points(
      this.dotGeom,
      new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 })
    ));

    // Wall histogram: one pooled bar mesh per bin (materials swapped, never made).
    const barGeom = new THREE.PlaneGeometry(1, 1);
    this.goldMat = new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.95 });
    this.blueMat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.8 });
    this.barW = (2 * VIEW_X) / HIST_BINS;
    this.bars = [];
    for (let i = 0; i < HIST_BINS; i++) {
      const m = new THREE.Mesh(barGeom, this.blueMat);
      m.position.set(-VIEW_X + (i + 0.5) * this.barW, HIST_BASE, 0);
      m.scale.set(this.barW * 0.82, 1e-4, 1);
      this.simScene.add(m);
      this.bars.push(m);
    }

    // Theoretical Cauchy SHAPE ∝ 1/(1+x²), normalised to the live in-frame count.
    // No π is needed to draw it: the normaliser is the measured total divided by
    // the sum of the un-normalised shape over the same bins.
    const envPos = new Float32Array(HIST_BINS * 3);
    for (let i = 0; i < HIST_BINS; i++) {
      envPos[i * 3] = -VIEW_X + (i + 0.5) * this.barW;
      envPos[i * 3 + 1] = HIST_BASE;
      envPos[i * 3 + 2] = 0.01;
    }
    this.envGeom = new THREE.BufferGeometry();
    this.envGeom.setAttribute('position', new THREE.BufferAttribute(envPos, 3));
    this.simScene.add(new THREE.Line(
      this.envGeom,
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.75 })
    ));

    // Running-mean tape: a scrolling trace, newest at the bottom. Its horizontal
    // position is the squashed running mean m/(1+|m|) — display-only compression
    // of a quantity with unbounded range.
    const tPos = new Float32Array(TRACE_N * 3);
    this.traceGeom = new THREE.BufferGeometry();
    this.traceGeom.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    this.traceGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(
      this.traceGeom,
      new THREE.LineBasicMaterial({ color: 0x5bd0ff, transparent: true, opacity: 0.9 })
    ));
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, TRACE_TOP, 0), new THREE.Vector3(0, TRACE_BOT, 0),
        new THREE.Vector3(-VIEW_X, TRACE_BOT - 0.02, 0), new THREE.Vector3(VIEW_X, TRACE_BOT - 0.02, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x9aa7c7, transparent: true, opacity: 0.35 })
    ));
    this.meanMarkGeom = new THREE.BufferGeometry();
    this.meanMarkGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.simScene.add(new THREE.Points(
      this.meanMarkGeom,
      new THREE.PointsMaterial({ color: 0xff7f6b, size: 8, sizeAttenuation: false })
    ));
  }

  updateSimScene() {
    if (!this.beamGeom) return;
    const h = this.h;
    const hs = Math.min(VIEW_X, h * S);

    // ±h window on the wall.
    const wp = this.winGeom.attributes.position.array;
    wp[0] = -hs; wp[1] = WALL_Y; wp[2] = 0.005;
    wp[3] = hs; wp[4] = WALL_Y; wp[5] = 0.005;
    wp[6] = -hs; wp[7] = WALL_Y - 0.045; wp[8] = 0.005;
    wp[9] = -hs; wp[10] = WALL_Y + 0.045; wp[11] = 0.005;
    wp[12] = hs; wp[13] = WALL_Y - 0.045; wp[14] = 0.005;
    wp[15] = hs; wp[16] = WALL_Y + 0.045; wp[17] = 0.005;
    this.winGeom.attributes.position.needsUpdate = true;

    // Beacon sweep (decorative).
    const bpz = this.beaconGeom.attributes.position.array;
    bpz[0] = 0; bpz[1] = LIGHT_Y; bpz[2] = 0;
    bpz[3] = this.beaconC * 0.34; bpz[4] = LIGHT_Y + this.beaconS * 0.34; bpz[5] = 0;
    this.beaconGeom.attributes.position.needsUpdate = true;

    // Beams, oldest first so the newest are brightest.
    const bp = this.beamGeom.attributes.position.array;
    const bc = this.beamGeom.attributes.color.array;
    const nb = this.beamCount;
    let v = 0;
    for (let i = 0; i < nb; i++) {
      const idx = (this.beamHead - nb + i + MAX_BEAMS * 2) % MAX_BEAMS;
      const fade = 0.18 + 0.82 * ((i + 1) / nb);
      const k = this.beamKind[idx];
      const r = (k === 0 ? 0.96 : k === 1 ? 0.30 : 1.0) * fade;
      const g = (k === 0 ? 0.77 : k === 1 ? 0.78 : 0.45) * fade;
      const b = (k === 0 ? 0.26 : k === 1 ? 0.94 : 0.40) * fade;
      bp[v * 3] = this.beamX0[idx]; bp[v * 3 + 1] = this.beamY0[idx]; bp[v * 3 + 2] = 0;
      bc[v * 3] = r; bc[v * 3 + 1] = g; bc[v * 3 + 2] = b; v++;
      bp[v * 3] = this.beamX1[idx]; bp[v * 3 + 1] = this.beamY1[idx]; bp[v * 3 + 2] = 0;
      bc[v * 3] = r; bc[v * 3 + 1] = g; bc[v * 3 + 2] = b; v++;
    }
    this.beamGeom.attributes.position.needsUpdate = true;
    this.beamGeom.attributes.color.needsUpdate = true;
    this.beamGeom.setDrawRange(0, v);

    // Landing marks.
    const dp = this.dotGeom.attributes.position.array;
    const dc = this.dotGeom.attributes.color.array;
    const nd = this.dotCount;
    for (let i = 0; i < nd; i++) {
      const idx = (this.dotHead - nd + i + MAX_DOTS * 2) % MAX_DOTS;
      const fade = 0.3 + 0.7 * ((i + 1) / nd);
      const k = this.dotKind[idx];
      dp[i * 3] = this.dotX[idx]; dp[i * 3 + 1] = WALL_Y + 0.014; dp[i * 3 + 2] = 0.02;
      dc[i * 3] = (k === 0 ? 1.0 : 0.32) * fade;
      dc[i * 3 + 1] = (k === 0 ? 0.72 : 0.80) * fade;
      dc[i * 3 + 2] = (k === 0 ? 0.22 : 0.96) * fade;
    }
    this.dotGeom.attributes.position.needsUpdate = true;
    this.dotGeom.attributes.color.needsUpdate = true;
    this.dotGeom.setDrawRange(0, nd);

    // Histogram + the 1/(1+x²) envelope.
    let hmax = 1;
    for (let i = 0; i < HIST_BINS; i++) if (this.hist[i] > hmax) hmax = this.hist[i];
    const binW = (2 * XVIS) / HIST_BINS;
    let shapeSum = 0;
    for (let i = 0; i < HIST_BINS; i++) {
      const xc = -XVIS + (i + 0.5) * binW;
      shapeSum += 1 / (1 + xc * xc);
    }
    const inFrame = this.beams - this.escapes;
    const envScale = shapeSum > 0 ? inFrame / shapeSum : 0;
    const env = this.envGeom.attributes.position.array;
    for (let i = 0; i < HIST_BINS; i++) {
      const bh = Math.max((this.hist[i] / hmax) * HIST_H, 1e-4);
      const m = this.bars[i];
      m.scale.y = bh;
      m.position.y = HIST_BASE + bh / 2;
      const xc = -XVIS + (i + 0.5) * binW;
      m.material = (Math.abs(xc) <= h) ? this.goldMat : this.blueMat;
      const eh = (envScale / (1 + xc * xc)) / hmax * HIST_H;
      env[i * 3 + 1] = HIST_BASE + Math.min(HIST_H * 1.15, eh);
    }
    this.envGeom.attributes.position.needsUpdate = true;

    // Running-mean tape (newest at the bottom) + its marker.
    const tp = this.traceGeom.attributes.position.array;
    const nt = this.traceCount;
    for (let i = 0; i < nt; i++) {
      const idx = (this.traceHead - nt + i + TRACE_N * 2) % TRACE_N;
      const m = this.trace[idx];
      const sq = m / (1 + (m < 0 ? -m : m));           // display-only squash
      tp[i * 3] = sq * VIEW_X * 0.97;
      tp[i * 3 + 1] = TRACE_TOP + (TRACE_BOT - TRACE_TOP) * (i / Math.max(1, nt - 1));
      tp[i * 3 + 2] = 0;
    }
    this.traceGeom.attributes.position.needsUpdate = true;
    this.traceGeom.setDrawRange(0, nt);

    const mm = this.meanMarkGeom.attributes.position.array;
    const sqm = this.mean / (1 + Math.abs(this.mean));
    mm[0] = sqm * VIEW_X * 0.97; mm[1] = TRACE_BOT; mm[2] = 0.03;
    this.meanMarkGeom.attributes.position.needsUpdate = true;
  }
}

registerSim(CauchyLighthousePi);
