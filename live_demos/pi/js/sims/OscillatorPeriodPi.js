import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// ─────────────────────────────────────────────────────────────────────────────
// NONLINEAR PENDULUM → π, REPAIRED BY THE ARITHMETIC–GEOMETRIC MEAN
//
// The linear oscillator x″ = −ω²x is isochronous BY CONSTRUCTION, so "the period
// does not depend on amplitude" is a vacuous demo there — it proves nothing
// about π and nothing about the physics. This card therefore keeps the linear
// spring only as a REFERENCE CASE (π̂ = ω⟨T⟩/2 works, exactly) and puts the real
// content in the genuine nonlinear pendulum
//
//        θ″ = −ω²·sin θ ,        ω² = g/L      (NO linearisation anywhere)
//
// whose period is NOT 2π/ω. Time it and the naive small-angle estimate
// π̂ = ω⟨T⟩/2 visibly drifts high as the release angle grows — an honest,
// watchable failure of an assumption.
//
// THE REPAIR (pure arithmetic). The exact period is T = 4·K(k)/ω with elliptic
// modulus k = sin(θ₀/2), and Gauss's identity gives K(k) = π / (2·AGM(1, k′)),
// k′ = √(1−k²). Eliminating K:
//
//        π = (ω·T/2) · AGM(1, k′)          EXACTLY, at every amplitude.
//
// AGM(a,b) is iterated (a,b) → ((a+b)/2, √(ab)): arithmetic means, geometric
// means and square roots, nothing else. It doubles its correct digits per step
// (QUADRATIC convergence) — a striking contrast with every 1/√N card here.
//
// HONESTY / no-π-smuggling. The estimator reads exactly TWO numbers, and both
// are MEASURED from the integrator's own trajectory:
//   • T  — the time between successive upward zero crossings of θ;
//   • k  — obtained from the peak angular speed at the bottom of the swing.
//          Energy: ½θ̇² + ω²(1−cos θ) = ω²(1−cos θ₀), so at θ = 0
//          θ̇_max = 2ω·sin(θ₀/2) = 2ω·k  ⇒  k = θ̇_max / (2ω).
// So k′ = √(1 − k²) involves NO trigonometry at all, and the estimator never
// reads the θ₀ slider. RAD_PER_DEG below (the only Math.PI in the file outside
// clearly-marked display code) converts the slider to the integrator's initial
// condition; it is setup, not estimation — replace it by any other constant and
// π̂ is unchanged, because θ₀ then simply means a different physical angle and
// both T and k track it together. (Verified numerically.)
// ─────────────────────────────────────────────────────────────────────────────

// main.js advances 1e-4 sim-seconds per step() call and makes ~speed*10 calls
// per frame; TIME_SCALE (the GaltonBoardPi carry-accumulator pattern) makes one
// board-second roughly one wall-clock second at speed 1.
const TIME_SCALE = 16.7;

const DT_SUB = 2e-4;         // integrator step (board-seconds); ω·dt = 5e-4
const MAX_SUBSTEPS = 4000;   // per step() call (hub previews pass dt = 0.04)
const TRACE_DT = 0.02;       // θ(t) trace sample cadence (board-seconds)
const TRACE_EVERY = Math.max(1, Math.round(TRACE_DT / DT_SUB));
const TRACE_N = 760;         // ring-buffer window ≈ 15.2 board-seconds
const MAX_TICKS = 48;        // pooled zero-crossing markers on the trace

// Yoshida / Forest–Ruth 4th-order symplectic composition of leapfrog. The
// period error is O((ω·dt)⁴) instead of velocity-Verlet's O((ω·dt)²), which is
// what buys the digits this card displays. Kicks/drifts are the merged KDK form
// of VV(w1·h)·VV(w0·h)·VV(w1·h) — four force evaluations per step.
const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2), W0 = 1 - 2 * W1;
const KICK0 = W1 / 2, KICK1 = (W1 + W0) / 2, KICK2 = KICK1, KICK3 = W1 / 2;
const DRIFT0 = W1, DRIFT1 = W0, DRIFT2 = W1;

// g = 9.8 m/s², L = 1.568 m ⇒ ω² = g/L = 6.25 s⁻²  (spring twin: k/m = 6.25/1).
// A plain rate-squared. No π anywhere in the equation of motion.
const OMEGA2 = 6.25;

const DEG_MIN = 2, DEG_MAX = 170;
// SETUP/DISPLAY ONLY — converts the slider to the integrator's initial angle and
// prints measured k back as degrees. Never touched by the estimator (see header).
const RAD_PER_DEG = Math.PI / 180;

// Amplitude ladder: independent nonlinear pendulums at fixed release angles,
// integrated alongside the visible one, each timing its own period. They paint
// the naive-vs-AGM curve across the whole amplitude range without the user
// having to drag anything. Each rung stops after LAD_CYCLES periods (the motion
// is deterministic, so nothing more is learned by running longer).
const LAD_N = 14, LAD_LO = 6, LAD_HI = 170, LAD_CYCLES = 3;

const OSC_CX = -0.72;        // centre of the moving-oscillator drawing (left half)
const TRACE_X0 = 0.02;       // trace left edge (screen units)
const TRACE_X1 = 1.16;       // trace right edge
const TRACE_H = 0.40;        // trace half-height at |θ| = θ₀
const PEND_L = 0.62;         // drawn rod length
const ARC_SEG = 56;          // amplitude-arc vertices
const SPRING_SEG = 44;       // spring zigzag vertices
// Digits the integrator actually earns. Measured worst case over EVERY reachable
// slider position (2°…170°, 1 period timed) is |π̂ − π| = 8.4e-13, and 3e-13
// after 6 periods; a 400-period run at 170° stays at 7e-14. Ten decimals resolve
// 1e-10, so the last shown digit has ~100× of margin. Do not raise this.
const PI_DEC = 10;

// ── Arithmetic–geometric mean ────────────────────────────────────────────────
// (a,b) → ((a+b)/2, √(ab)). Arithmetic mean, geometric mean, square root. No
// series, no lookup table, no transcendental function. Converges quadratically:
// |a−b| squares each step, so double precision is exhausted in ~5 iterations.
function agm(a, b) {
  for (let i = 0; i < 64; i++) {
    if (a === b) break;
    const an = 0.5 * (a + b);
    const bn = Math.sqrt(a * b);
    if (an === a && bn === b) break;
    a = an; b = bn;
  }
  return 0.5 * (a + b);
}

// Same iteration, but recording each step into preallocated arrays so the HUD
// can show the quadratic collapse of |aₙ − bₙ|. Returns the number of rows.
function agmTrace(a, b, outA, outB, cap) {
  let n = 0;
  outA[n] = a; outB[n] = b; n++;
  while (n < cap) {
    if (a === b) break;
    const an = 0.5 * (a + b);
    const bn = Math.sqrt(a * b);
    if (an === a && bn === b) break;
    a = an; b = bn;
    outA[n] = a; outB[n] = b; n++;
  }
  return n;
}

// Cubic-Hermite root of θ(t) on one substep, refined by Newton. Using the
// velocities at both ends makes the crossing time O(h⁴)-accurate, matching the
// integrator, instead of the O(h²) a straight linear interpolation would give.
function crossFrac(x0, v0, x1, v1, h) {
  let s = (x1 !== x0) ? -x0 / (x1 - x0) : 0.5;
  if (!(s >= 0 && s <= 1)) s = 0.5;
  for (let i = 0; i < 4; i++) {
    const s2 = s * s, s3 = s2 * s;
    const p = (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * h * v0
            + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * h * v1;
    const dp = (6 * s2 - 6 * s) * x0 + (3 * s2 - 4 * s + 1) * h * v0
             + (-6 * s2 + 6 * s) * x1 + (3 * s2 - 2 * s) * h * v1;
    if (dp === 0) break;
    const sn = s - p / dp;
    if (!Number.isFinite(sn)) break;
    s = sn < 0 ? 0 : (sn > 1 ? 1 : sn);
  }
  return s;
}

// Cubic-Hermite value of θ̇ at the crossing (its derivative is the acceleration,
// which the integrator already evaluated at both ends of the substep).
function hermiteV(s, v0, a0, v1, a1, h) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * a0
       + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * a1;
}

// Drawing helper only (a literal circle needs a literal turn).
function ringPts(r, seg) {
  const p = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;   // display-only
    p.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return p;
}

export class OscillatorPeriodPi extends Simulation {
  static id = 'oscillator-period-pi';
  static title = 'Nonlinear Pendulum — π rescued by the arithmetic–geometric mean';
  static description = 'Integrate the real pendulum θ″ = −ω²·sin θ (no small-angle fudge) and time it. The naive π̂ = ω·T/2 drifts high as the swing grows — then AGM(1, √(1−k²)), pure means and square roots, pins it back on 3.14159 at every amplitude.';
  static piMechanism = 'exact period of the nonlinear pendulum: T = 4·K(k)/ω with k = sin(θ₀/2), and Gauss’s K(k) = π/(2·AGM(1,√(1−k²))). Eliminating K gives π = (ω·T/2)·AGM(1,√(1−k²)) — the measured period times an arithmetic–geometric mean. Both inputs (T and k) are read off the integrator’s own trajectory; the AGM is means and square roots only, and it doubles its correct digits every iteration.';
  static rigor = 'Exact Asymptotic';
  static sortOrder = 66;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 22;   // hub thumbnail: ~15 board-seconds of swinging
  static previewParams = { mode: 'pendulum', theta0: 120, ladder: false };
  static alternatives = [
    { id: 'leibniz-walk', label: '1/√N and 1/N, the slow way' },
    { id: 'ramanujan-pi', label: 'other fast-converging π machinery' },
    { id: 'standing-wave-node-pi', label: 'π from a wave eigenmode' },
    { id: 'two-pendulums', label: 'pendulums used a different way' },
  ];
  static explanation = {
    setup: 'One pendulum, integrated honestly: θ″ = −ω²·sin θ with ω² = g/L = 6.25 s⁻², released from rest at an angle θ₀ you choose, all the way out to 170°. No small-angle replacement of sin θ by θ anywhere. A 4th-order symplectic (Yoshida/Forest–Ruth) stepper at ω·dt = 5×10⁻⁴ advances it, and the period is timed between successive upward zero crossings, located by cubic-Hermite interpolation inside the substep. A faint white twin — the LINEARISED oscillator x″ = −ω²x from the same initial condition — swings alongside so you can watch the real pendulum fall behind.',
    insight: 'For the linear twin the period really is T = 2π/ω, so π̂ = ω⟨T⟩/2 is exact — but that is an empty demonstration of amplitude-independence, because a linear ODE is isochronous by construction. The true pendulum is not: its period is T = 4·K(k)/ω with elliptic modulus k = sin(θ₀/2), so π̂ = ω⟨T⟩/2 = 2·K(k) drifts upward as the swing grows — measured here as 3.143089 at 5°, 3.196284 at 30°, 3.371501 at 60°, 3.708149 at 90°, 4.313031 at 120° and 7.663484 at 170°. That drift IS the small-angle assumption breaking, in the open. The repair is Gauss’s: K(k) = π / (2·AGM(1, k′)) with k′ = √(1−k²), so π = (ω·T/2)·AGM(1, k′) exactly, at every amplitude. AGM(a,b) iterates (a,b) → ((a+b)/2, √(ab)) — arithmetic mean, geometric mean, square root — and |aₙ−bₙ| SQUARES each step, so four iterations exhaust double precision.',
    contrast: 'Two things separate this from the rest of the catalogue. First, the invariance is real rather than vacuous: π̂ holding still while the period itself changes by a factor of 2.4 across the amplitude range is a genuine statement about elliptic integrals, not a restatement of linearity. Second, the convergence is QUADRATIC — the AGM roughly doubles its correct digits per iteration, so five means and five square roots exhaust double precision. Compare leibniz-walk, where 1/√N sampling error buys one extra digit per hundredfold increase in work. Nothing here is statistical: run it twice and you get the same number.',
    readout: 'Two estimates side by side. NAIVE π̂ = ω·⟨T⟩/2 assumes T = 2π/ω and drifts high with amplitude. AGM π̂ = ω·⟨T⟩·AGM(1, k′)/2 corrects it, and stays on 3.14159265 for every θ₀. Both feed on the same measured ⟨T⟩; the only extra ingredient is k, which is read from the trajectory’s own peak angular speed at the bottom of the swing (k = θ̇_max/2ω, from energy conservation) — no trigonometry and no slider value enter the estimator. The amplitude ladder plots both curves against θ₀ live, and the AGM table shows |aₙ−bₙ| collapsing quadratically (5×10⁻¹ → 4×10⁻² → 3×10⁻⁴ → 2×10⁻⁸ → 10⁻¹⁶). At ω·dt = 5×10⁻⁴ the 4th-order symplectic stepper reproduces the period to ~4×10⁻¹⁵ relative below 120° and 8×10⁻¹³ at 170°, and k to ~3×10⁻¹⁴; the clock is an integer substep count rather than a running sum, so nothing creeps over a long run. Worst |π̂ − π| over every reachable release angle is 8×10⁻¹³, which licenses the ten decimals shown and nothing more. The AGM table stalls around 14 correct digits: that floor is the measured ⟨T⟩, not the AGM, which converged two rows earlier.',
    formula: 'π = (ω·T/2) · AGM(1, √(1−k²)),   T measured between zero crossings,   k = θ̇_max/(2ω) measured at the bottom of the swing   (naive: π̂ = ω·T/2, valid only as θ₀ → 0)   [EXACT ASYMPTOTIC]',
    getExpected: (params) => {
      const mode = params.mode === 'spring' ? 'spring' : 'pendulum';
      const deg = Math.min(DEG_MAX, Math.max(DEG_MIN, params.theta0 ?? 120));
      const omega = Math.sqrt(OMEGA2);
      if (mode === 'spring') {
        // Math.PI here is DISPLAY-ONLY: this string describes what to expect.
        return `Linear baseline x″ = −ω²x with ω = ${omega.toFixed(4)} s⁻¹. The period is exactly T = 2π/ω = ${(2 * Math.PI / omega).toFixed(6)} board-seconds at EVERY amplitude, so π̂ = ω⟨T⟩/2 lands on 3.14159265 within a cycle or two and never moves. Be clear about what that does and does not show: a linear ODE is isochronous by construction, so amplitude-independence here is a tautology, not evidence. Switch to the nonlinear pendulum to see an amplitude invariance that actually costs something.`;
      }
      const k = Math.sin(deg * RAD_PER_DEG / 2);
      const f = agm(1, Math.sqrt(1 - k * k));
      // Math.PI below is DISPLAY-ONLY (it turns the exact factor 1/AGM into the
      // number the viewer will see drift). The sim's estimator uses neither.
      const naive = Math.PI / f, T = 2 * Math.PI / (omega * f);
      return `Nonlinear pendulum, ω = ${omega.toFixed(4)} s⁻¹, released at θ₀ = ${deg}°. Elliptic modulus k = sin(θ₀/2) = ${k.toFixed(6)}, so the true period is T = 4K(k)/ω = ${T.toFixed(6)} board-seconds — ${(f > 0 ? (1 / f) : 0).toFixed(4)}× the small-angle value. The NAIVE reading π̂ = ω⟨T⟩/2 therefore settles on ${naive.toFixed(6)}, not π: at 170° it reaches 7.66. Multiply by AGM(1, √(1−k²)) = ${f.toFixed(9)} and it snaps back to 3.14159265, and stays there for every θ₀ from 2° to 170° — measured spread across the 14-rung ladder is about 5×10⁻¹³. The AGM itself is done in four iterations: |aₙ−bₙ| goes 5×10⁻¹ → 4×10⁻² → 3×10⁻⁴ → 2×10⁻⁸ → 10⁻¹⁶.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.mode = params.mode === 'spring' ? 'spring' : 'pendulum';
    this.theta0Deg = Math.min(DEG_MAX, Math.max(DEG_MIN, params.theta0 ?? 120));
    this.ladderOn = params.ladder !== undefined ? !!params.ladder : true;

    // ── preallocated scratch / pools (nothing below is allocated per frame) ──
    this._sc = new Float64Array(4);            // [xEnd, vEnd, a(x0), a(x1)]
    this.trace = new Float32Array(TRACE_N);
    this.traceRef = new Float32Array(TRACE_N);
    this._ups = new Float32Array(64);
    this._upsRef = new Float32Array(64);
    this._agmA = new Float64Array(12);
    this._agmB = new Float64Array(12);
    this.ldDeg = new Float64Array(LAD_N);
    this.ldX = new Float64Array(LAD_N);
    this.ldV = new Float64Array(LAD_N);
    this.ldUp = new Float64Array(LAD_N);
    this.ldHasUp = new Uint8Array(LAD_N);
    this.ldSumT = new Float64Array(LAD_N);
    this.ldSumV = new Float64Array(LAD_N);
    this.ldN = new Int32Array(LAD_N);
    for (let i = 0; i < LAD_N; i++) {
      this.ldDeg[i] = LAD_LO + (LAD_HI - LAD_LO) * (LAD_N === 1 ? 0 : i / (LAD_N - 1));
    }
    this.reset();
  }

  reset() {
    super.reset();
    this.nonlinear = (this.mode === 'pendulum');
    this.omega2 = OMEGA2;
    this.omega = Math.sqrt(OMEGA2);
    this.theta0 = this.theta0Deg * RAD_PER_DEG;   // setup only (see header)

    // Visible oscillator: released from rest at θ₀. The clock is kept as an
    // integer substep count and multiplied up on demand: accumulating
    // `t += dt` over the tens of millions of substeps a long run takes would
    // otherwise leak ~10⁻⁹ of round-off into ⟨T⟩ and eat the last displayed digit.
    this.x = this.theta0; this.v = 0; this.tSteps = 0; this.t = 0;
    this.lastUp = 0; this.hasUp = false;
    this.lastT = 0; this.sumT = 0; this.nT = 0; this.avgT = 0;
    this.sumVpk = 0; this.avgVpk = 0;

    // Linearised twin (same ω, same release) — the small-angle prediction, drawn
    // faintly so the real pendulum can be seen falling behind it.
    this.rx = this.theta0; this.rv = 0;
    this.rLastUp = 0; this.rHasUp = false;
    this.rLastT = 0; this.rSumT = 0; this.rN = 0; this.rAvgT = 0;

    for (let i = 0; i < LAD_N; i++) {
      this.ldX[i] = this.ldDeg[i] * RAD_PER_DEG;
      this.ldV[i] = 0;
      this.ldUp[i] = 0; this.ldHasUp[i] = 0;
      this.ldSumT[i] = 0; this.ldSumV[i] = 0; this.ldN[i] = 0;
    }

    this.trace.fill(this.x);
    this.traceRef.fill(this.rx);
    this.traceHead = 0; this.traceCount = 1;
    this.trace[0] = this.x; this.traceRef[0] = this.rx;
    this.traceHead = 1;
    this.subCarry = 0; this.subCount = 0;

    this.collisionCount = 0;
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'select', id: 'mode', label: 'Equation of motion', highlight: true,
        options: [
          { value: 'pendulum', label: 'Nonlinear pendulum  θ″ = −ω²·sin θ' },
          { value: 'spring', label: 'Linear baseline  x″ = −ω²·x' },
        ],
        default: this.mode,
        onChange: (val) => {
          this.mode = (val === 'spring') ? 'spring' : 'pendulum';
          this.reset(); this._applyMode();
        } },
      { type: 'slider', id: 'theta0', label: 'Release angle θ₀ (deg)',
        min: DEG_MIN, max: DEG_MAX, step: 1, default: this.theta0Deg,
        onChange: (val) => { this.theta0Deg = val; this.reset(); } },
      { type: 'toggle', id: 'ladder', label: 'Amplitude ladder', default: this.ladderOn,
        onChange: (val) => {
          this.ladderOn = val;
          // Rungs share the main clock, so a paused rung would otherwise fold the
          // paused interval into its next period. Drop the in-flight crossing
          // anchor; already-completed periods stay valid.
          if (val) for (let i = 0; i < LAD_N; i++) this.ldHasUp[i] = 0;
        } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1,
        default: this.speed || 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'drift', label: 'small-angle drift vs release angle', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'release angle θ₀  (0° → 180°)', y: 'naive π̂ / AGM π̂ − 1' } }
    ];
  }

  // ── integrator ─────────────────────────────────────────────────────────────
  // One 4th-order symplectic step of x″ = −ω²·sin x (or −ω²·x). Symplectic, so
  // the energy — and therefore the measured peak speed that supplies k — stays
  // bounded rather than drifting. π never appears; the period is emergent.
  _yoshida(x, v, nonlinear, out) {
    const w2 = this.omega2, h = DT_SUB;
    let a = nonlinear ? -w2 * Math.sin(x) : -w2 * x;
    const a0 = a;
    v += KICK0 * h * a;  x += DRIFT0 * h * v;
    a = nonlinear ? -w2 * Math.sin(x) : -w2 * x;
    v += KICK1 * h * a;  x += DRIFT1 * h * v;
    a = nonlinear ? -w2 * Math.sin(x) : -w2 * x;
    v += KICK2 * h * a;  x += DRIFT2 * h * v;
    a = nonlinear ? -w2 * Math.sin(x) : -w2 * x;
    v += KICK3 * h * a;
    out[0] = x; out[1] = v; out[2] = a0; out[3] = a;
  }

  step(dt) {
    const tb = dt * TIME_SCALE;
    this.subCarry += tb;
    let nsub = Math.floor(this.subCarry / DT_SUB);
    this.subCarry -= nsub * DT_SUB;
    if (nsub > MAX_SUBSTEPS) nsub = MAX_SUBSTEPS;

    let ping = false;
    for (let s = 0; s < nsub; s++) {
      if (this._substep()) ping = true;
      if (++this.subCount >= TRACE_EVERY) {
        this.subCount = 0;
        this.trace[this.traceHead] = this.x;
        this.traceRef[this.traceHead] = this.rx;
        this.traceHead = (this.traceHead + 1) % TRACE_N;
        if (this.traceCount < TRACE_N) this.traceCount++;
      }
    }
    return ping;
  }

  _substep() {
    const sc = this._sc, nl = this.nonlinear, h = DT_SUB;
    let ping = false;
    const tPrev = this.t;
    this.tSteps++;
    this.t = this.tSteps * h;      // exact-by-construction clock, no accumulation

    // ── visible oscillator ──────────────────────────────────────────────────
    const x0 = this.x, v0 = this.v;
    this._yoshida(x0, v0, nl, sc);
    const x1 = sc[0], v1 = sc[1], a0 = sc[2], a1 = sc[3];
    this.x = x1; this.v = v1;
    if (x0 < 0 && x1 >= 0) {                       // upward crossing: one per period
      const s = crossFrac(x0, v0, x1, v1, h);
      const tc = tPrev + s * h;
      const vc = Math.abs(hermiteV(s, v0, a0, v1, a1, h));
      if (this.hasUp) {
        this.lastT = tc - this.lastUp;
        this.sumT += this.lastT; this.nT++;
        this.avgT = this.sumT / this.nT;
        this.sumVpk += vc; this.avgVpk = this.sumVpk / this.nT;
        this.collisionCount = this.nT;
        this.pendingPhasePoints.push(this._phasePoint(this.theta0Deg, this._factor()));
        ping = true;
      }
      this.lastUp = tc; this.hasUp = true;
    }

    // ── linearised twin (the small-angle prediction), same release ──────────
    if (nl) {
      const rx0 = this.rx, rv0 = this.rv;
      this._yoshida(rx0, rv0, false, sc);
      const rx1 = sc[0], rv1 = sc[1];
      this.rx = rx1; this.rv = rv1;
      if (rx0 < 0 && rx1 >= 0) {
        const s = crossFrac(rx0, rv0, rx1, rv1, h);
        const tc = tPrev + s * h;
        if (this.rHasUp) {
          this.rLastT = tc - this.rLastUp;
          this.rSumT += this.rLastT; this.rN++;
          this.rAvgT = this.rSumT / this.rN;
        }
        this.rLastUp = tc; this.rHasUp = true;
      }
    } else {
      this.rx = this.x; this.rv = this.v;
    }

    // ── amplitude ladder ────────────────────────────────────────────────────
    if (this.ladderOn) {
      for (let i = 0; i < LAD_N; i++) {
        if (this.ldN[i] >= LAD_CYCLES) continue;
        const lx0 = this.ldX[i], lv0 = this.ldV[i];
        this._yoshida(lx0, lv0, nl, sc);
        const lx1 = sc[0], lv1 = sc[1], la0 = sc[2], la1 = sc[3];
        this.ldX[i] = lx1; this.ldV[i] = lv1;
        if (lx0 < 0 && lx1 >= 0) {
          const s = crossFrac(lx0, lv0, lx1, lv1, h);
          const tc = tPrev + s * h;   // rungs advance in lockstep with the main clock
          const vc = Math.abs(hermiteV(s, lv0, la0, lv1, la1, h));
          if (this.ldHasUp[i]) {
            this.ldSumT[i] += tc - this.ldUp[i];
            this.ldSumV[i] += vc;
            this.ldN[i]++;
            this.pendingPhasePoints.push(
              this._phasePoint(this.ldDeg[i], this._ladFactor(i)));
          }
          this.ldUp[i] = tc; this.ldHasUp[i] = 1;
        }
      }
    }
    return ping;
  }

  // ── estimators (measured inputs only) ──────────────────────────────────────
  // k = θ̇_max / (2ω): from ½θ̇² + ω²(1−cos θ) = const, the speed at the bottom
  // is 2ω·sin(θ₀/2) = 2ω·k. Read straight off the trajectory — no trig, no π.
  _kMeasured() {
    if (!this.nonlinear || this.nT === 0) return 0;
    const k = this.avgVpk / (2 * this.omega);
    return k >= 1 ? 0.999999999 : (k < 0 ? 0 : k);
  }

  // AGM(1, k′) with k′ = √(1−k²). Pure means and square roots.
  _factor() {
    if (!this.nonlinear) return 1;               // linear twin needs no correction
    const k = this._kMeasured();
    return agm(1, Math.sqrt(1 - k * k));
  }

  _ladFactor(i) {
    if (!this.nonlinear || this.ldN[i] === 0) return 1;
    let k = (this.ldSumV[i] / this.ldN[i]) / (2 * this.omega);
    if (k >= 1) k = 0.999999999; else if (k < 0) k = 0;
    return agm(1, Math.sqrt(1 - k * k));
  }

  _ladNaive(i) {
    return this.ldN[i] > 0 ? this.omega * (this.ldSumT[i] / this.ldN[i]) / 2 : 0;
  }

  _piNaive() { return this.nT > 0 ? this.omega * this.avgT / 2 : 0; }
  _piAGM() { return this.nT > 0 ? this._piNaive() * this._factor() : 0; }

  getCountLabel() { return 'Periods timed'; }
  getPiApproximation() { return this._piAGM(); }
  getPiReadout() {
    const p = this._piAGM();
    return p > 0 ? p.toFixed(PI_DEC) : 'timing first swing…';
  }

  // ── phase view: measured drift of the naive estimate vs release angle ──────
  // y is (naive/AGM − 1) = 1/AGM(1,k′) − 1 — built entirely from measurements,
  // with no π reference anywhere.
  _phasePoint(deg, factor) {
    const x = Math.min(1, Math.max(-1, deg / 90 - 1));
    const drift = factor > 0 ? (1 / factor - 1) : 0;
    const y = Math.min(1, Math.max(-1, drift / 0.75 - 1));
    return [x, y];
  }

  getPhasePoint() {
    if (this.nT === 0) return [];
    return this._phasePoint(this.theta0Deg, this._factor());
  }

  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() { return { x0: -1.22, x1: 1.2, y0: -0.62, y1: 0.62 }; }

  // ── HUD ────────────────────────────────────────────────────────────────────
  getFormulaHTML() {
    if (!this.nonlinear) return this._linearHTML();

    const naive = this._piNaive(), corrected = this._piAGM();
    const k = this._kMeasured(), f = this._factor();
    // DISPLAY-ONLY: turn the measured k back into an angle for the viewer.
    const degMeas = 2 * Math.asin(Math.min(1, k)) / RAD_PER_DEG;
    const tStr = this.nT > 0 ? this.avgT.toFixed(6) : '—';
    const tRef = this.rN > 0 ? this.rAvgT.toFixed(6) : '—';
    const ratio = (this.nT > 0 && this.rN > 0) ? (this.avgT / this.rAvgT).toFixed(5) : '—';

    // ONE top-level block wrapper: `.formula-readout` is itself a flex ROW capped
    // at 520px, so any second top-level node would land BESIDE the text instead
    // of below it (house pattern — see BuffonNeedle._raceHTML).
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;width:100%;text-align:right">`
      + `<div><strong>real pendulum</strong>: θ″ = −<span class="f-angle">ω²</span>·sin θ &nbsp;(no linearisation)<br>`
      + `<span class="f-count">ω = ${this.omega.toFixed(4)} s⁻¹ · θ₀ = ${this.theta0Deg}° · ${this.nT} period(s) timed</span><br>`
      + `<span class="f-count">⟨T⟩ = ${tStr} &nbsp;vs&nbsp; linear twin ⟨T<sub>lin</sub>⟩ = ${tRef} &nbsp;→&nbsp; ${ratio}× longer</span></div>`
      + `<div style="width:100%;display:flex;justify-content:flex-end;gap:14px;flex-wrap:wrap">`
      +   `<div style="text-align:right"><span style="color:#f7c948">naive</span> ω⟨T⟩/2<br>`
      +     `<span style="font-size:1.05em">${this.nT > 0 ? piDigitsHTML(naive, 6) : '…'}</span></div>`
      +   `<div style="text-align:right"><span style="color:#4cc9f0">AGM</span> ω⟨T⟩·AGM(1,k′)/2<br>`
      +     `<span style="font-size:1.05em">${this.nT > 0 ? piDigitsHTML(corrected, PI_DEC) : '…'}</span></div>`
      + `</div>`
      + `<div><span class="f-count">measured k = θ̇<sub>max</sub>/(2ω) = ${k.toFixed(9)}`
      +   ` &nbsp;(θ₀ ⇒ ${degMeas.toFixed(4)}°) &nbsp;·&nbsp; k′ = √(1−k²) = ${Math.sqrt(1 - k * k).toFixed(9)}`
      +   ` &nbsp;·&nbsp; AGM(1,k′) = ${f.toFixed(9)}</span></div>`
      + this._ladderSVG()
      + this._agmTableHTML(naive)
      + `<div style="opacity:.72;font-size:.85em"><strong>What is honest here.</strong> The estimator eats exactly two measured numbers: ⟨T⟩, timed between upward zero crossings of the integrator's own θ, and k, taken from the peak angular speed at the bottom of the swing (energy gives θ̇<sub>max</sub> = 2ω·sin(θ₀/2) = 2ω·k). It never reads the θ₀ slider, so the degrees→radians constant cannot leak into π̂. AGM(a,b) is (a+b)/2 and √(ab), repeated — no series, no lookup, no transcendental. The only trig in the whole path is <em>inside the equation of motion</em> (sin θ, the physics) and in the display line above.</div>`
      + `<div style="opacity:.72;font-size:.85em"><strong>Why the naive number drifts.</strong> T = 2π/ω holds only in the θ₀ → 0 limit. The exact period is T = 4K(k)/ω, so ω⟨T⟩/2 = 2K(k) — that is what the gold curve is: an elliptic integral, plotted, growing without bound as θ₀ → 180°. The blue curve is the same measurement multiplied by AGM(1,k′), which is exactly π/(2K(k)). The product is π at every amplitude, which is a real invariance: the period itself changes by a factor of ${this.rN > 0 && this.nT > 0 ? (this.avgT / this.rAvgT).toFixed(2) : '…'} here, and π̂ does not move.</div>`
      + `</div>`;
  }

  _linearHTML() {
    const naive = this._piNaive();
    const tStr = this.nT > 0 ? this.avgT.toFixed(6) : '—';
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;width:100%;text-align:right">`
      + `<div><strong>linear baseline</strong> (reference case): x″ = −<span class="f-angle">ω²</span>·x,`
      +   ` period <span class="f-angle">T = 2π/ω</span> — invert it:<br>`
      +   `<span class="f-result">π</span> ≈ <span class="f-angle">ω</span>·<span class="f-angle">⟨T⟩</span>/2`
      +   ` &nbsp;<span style="font-size:1.1em">${this.nT > 0 ? piDigitsHTML(naive, PI_DEC) : 'timing first cycle…'}</span><br>`
      +   `<span class="f-count">ω = ${this.omega.toFixed(4)} s⁻¹ (ω² = k/m = 6.25 s⁻², π-free) · ⟨T⟩ = ${tStr} · ${this.nT} cycle(s)</span></div>`
      + this._ladderSVG()
      + `<div style="opacity:.72;font-size:.85em">This works, exactly — and it is the boring half of the card. The amplitude ladder above is flat, but that is a <strong>tautology</strong>: a linear ODE is isochronous by construction, so "the period does not depend on amplitude" restates the equation rather than testing anything. Switch to the nonlinear pendulum for an amplitude invariance that has to be earned.</div>`
      + `</div>`;
  }

  // Naive vs AGM-corrected π̂ across the whole amplitude range, live.
  _ladderSVG() {
    if (!this.ladderOn) return '';
    let ready = 0, naiveMax = 0;
    for (let i = 0; i < LAD_N; i++) {
      if (this.ldN[i] > 0) { ready++; const p = this._ladNaive(i); if (p > naiveMax) naiveMax = p; }
    }
    if (ready < 2) return '';

    const W = 300, H = 190, ml = 42, mr = 8, mt = 10, mb = 26;
    const y0 = 3.0, y1 = Math.max(4, naiveMax * 1.04);
    const px = (deg) => ml + (deg / 180) * (W - ml - mr);
    const py = (v) => H - mb - (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0) * (H - mt - mb);

    let dN = '', dA = '', dots = '', startedN = false, startedA = false;
    let agmMin = Infinity, agmMax = -Infinity, agmSum = 0, agmCnt = 0;
    for (let i = 0; i < LAD_N; i++) {
      if (this.ldN[i] === 0) { startedN = false; startedA = false; continue; }
      const nv = this._ladNaive(i), av = nv * this._ladFactor(i);
      if (av < agmMin) agmMin = av;
      if (av > agmMax) agmMax = av;
      agmSum += av; agmCnt++;
      const X = px(this.ldDeg[i]).toFixed(1);
      dN += (startedN ? 'L' : 'M') + X + ' ' + py(nv).toFixed(1) + ' '; startedN = true;
      dA += (startedA ? 'L' : 'M') + X + ' ' + py(av).toFixed(1) + ' '; startedA = true;
      dots += `<circle cx="${X}" cy="${py(nv).toFixed(1)}" r="2" fill="#f7c948"/>`
            + `<circle cx="${X}" cy="${py(av).toFixed(1)}" r="2" fill="#4cc9f0"/>`;
    }
    // Reference rule at the MEAN of the measured AGM estimates — data, not π.
    const mean = agmCnt > 0 ? agmSum / agmCnt : 0;
    const rule = agmCnt > 0
      ? `<line x1="${ml}" y1="${py(mean).toFixed(1)}" x2="${W - mr}" y2="${py(mean).toFixed(1)}" stroke="#4cc9f0" stroke-dasharray="3 3" opacity="0.45"/>`
      : '';
    // Live marker for the pendulum on screen.
    const live = this.nT > 0
      ? `<line x1="${px(this.theta0Deg).toFixed(1)}" y1="${mt}" x2="${px(this.theta0Deg).toFixed(1)}" y2="${H - mb}" stroke="currentColor" opacity="0.22"/>`
      : '';
    const axis = `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`
      + `<line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`;
    let ticks = '';
    for (let g = 0; g <= 4; g++) {
      const v = y0 + (y1 - y0) * g / 4, Y = py(v).toFixed(1);
      ticks += `<line x1="${ml - 3}" y1="${Y}" x2="${ml}" y2="${Y}" stroke="currentColor" opacity="0.4"/>`
        + `<text x="${ml - 5}" y="${(+Y + 3).toFixed(1)}" font-size="8" fill="currentColor" opacity="0.7" text-anchor="end">${v.toFixed(2)}</text>`;
    }
    for (const d of [0, 45, 90, 135, 180]) {
      ticks += `<text x="${px(d).toFixed(1)}" y="${H - mb + 11}" font-size="8" fill="currentColor" opacity="0.7" text-anchor="middle">${d}°</text>`;
    }
    // In the linear baseline the two series coincide (AGM factor ≡ 1), so say so
    // rather than pretending there is a correction being applied.
    const legend = this.nonlinear
      ? `<rect x="${ml + 6}" y="${mt + 2}" width="8" height="8" fill="#f7c948"/>`
        + `<text x="${ml + 18}" y="${mt + 9}" font-size="8" fill="currentColor" opacity="0.85">naive ω⟨T⟩/2 = 2K(k)</text>`
        + `<rect x="${ml + 6}" y="${mt + 14}" width="8" height="8" fill="#4cc9f0"/>`
        + `<text x="${ml + 18}" y="${mt + 21}" font-size="8" fill="currentColor" opacity="0.85">AGM-corrected</text>`
      : `<rect x="${ml + 6}" y="${mt + 2}" width="8" height="8" fill="#4cc9f0"/>`
        + `<text x="${ml + 18}" y="${mt + 9}" font-size="8" fill="currentColor" opacity="0.85">ω⟨T⟩/2 — flat by construction (AGM factor ≡ 1)</text>`;
    const cy = ((mt + H - mb) / 2).toFixed(1);
    const spread = (agmCnt > 1 && isFinite(agmMax - agmMin)) ? (agmMax - agmMin) : NaN;

    // display:block + own row so the plot uses the readout's full width.
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:470px;margin-top:2px;overflow:visible;color:inherit">`
      + `${axis}${ticks}${rule}${live}`
      + `<path d="${dN}" fill="none" stroke="#f7c948" stroke-width="1.6"/>`
      + `<path d="${dA}" fill="none" stroke="#4cc9f0" stroke-width="1.6"/>`
      + `${dots}${legend}`
      + `<text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 4}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">release angle θ₀</text>`
      + `<text x="11" y="${cy}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle" transform="rotate(-90 11 ${cy})">π̂</text>`
      + `</svg>`
      + `<div style="opacity:.8;font-size:.85em">${ready}/${LAD_N} ladder amplitudes timed`
      + (agmCnt > 1
          ? ` · AGM π̂ ∈ [${agmMin.toFixed(PI_DEC)}, ${agmMax.toFixed(PI_DEC)}], spread ${isFinite(spread) ? spread.toExponential(1) : '—'}`
          : '')
      + `</div>`;
  }

  // The AGM iteration itself: |aₙ − bₙ| squares every step (quadratic), so five
  // means and five square roots exhaust double precision.
  _agmTableHTML(naive) {
    if (this.nT === 0) return '';
    const k = this._kMeasured();
    const n = agmTrace(1, Math.sqrt(1 - k * k), this._agmA, this._agmB, 12);
    let rows = '';
    for (let i = 0; i < n; i++) {
      const a = this._agmA[i], b = this._agmB[i];
      const gap = Math.abs(a - b);
      const est = naive * 0.5 * (a + b);
      rows += `<tr><td style="text-align:left;opacity:.7">${i}</td>`
        + `<td style="text-align:right">${a.toFixed(12)}</td>`
        + `<td style="text-align:right">${b.toFixed(12)}</td>`
        + `<td style="text-align:right">${gap > 0 ? gap.toExponential(1) : '0'}</td>`
        + `<td style="text-align:right">${piDigitsHTML(est, PI_DEC)}</td></tr>`;
    }
    return `<table style="width:100%;border-collapse:collapse;font-size:.78em">`
      + `<tr style="opacity:.6"><td style="text-align:left">n</td><td style="text-align:right">aₙ</td>`
      + `<td style="text-align:right">bₙ</td><td style="text-align:right">|aₙ−bₙ|</td>`
      + `<td style="text-align:right">ω⟨T⟩·(aₙ+bₙ)/4</td></tr>${rows}</table>`
      + `<div style="opacity:.72;font-size:.85em">Each row is one arithmetic mean and one geometric mean. The gap column squares itself every step — <strong>quadratic convergence</strong>, digits doubling per iteration, done in ${n - 1} steps. The last column stops improving around 10⁻¹⁴ not because the AGM ran out but because the measured ⟨T⟩ did. Every other π card in this catalogue that averages anything is stuck at 1/√N.</div>`;
  }

  // ── scene ──────────────────────────────────────────────────────────────────
  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.25, 1.25, 0.66, -0.66, 0.1, 10);
    this.simCamera.position.z = 1;

    const white = (o) => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: o });
    const accent = () => new THREE.LineBasicMaterial({ color: 0xf7c948 });
    const body = () => new THREE.LineBasicMaterial({ color: 0x4cc9f0 });

    // Trace baseline (zero axis).
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(TRACE_X0, 0, 0), new THREE.Vector3(TRACE_X1, 0, 0)
      ]), white(0.16)
    ));

    // The linearised twin's θ(t), faint white, drawn UNDER the real trace.
    this.refTraceGeom = new THREE.BufferGeometry();
    this.refTraceGeom.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(TRACE_N * 3), 3));
    this.refTraceLine = new THREE.Line(this.refTraceGeom, white(0.34));
    this.simScene.add(this.refTraceLine);

    // The live nonlinear θ(t) trace.
    this.traceGeom = new THREE.BufferGeometry();
    this.traceGeom.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(TRACE_N * 3), 3));
    this.simScene.add(new THREE.Line(this.traceGeom, body()));

    // Pooled zero-crossing tick markers.
    const tickArr = new Float32Array(MAX_TICKS * 2 * 3);
    for (let k = 0; k < MAX_TICKS * 2; k++) tickArr[k * 3] = -10;
    this.tickGeom = new THREE.BufferGeometry();
    this.tickGeom.setAttribute('position', new THREE.BufferAttribute(tickArr, 3));
    this.simScene.add(new THREE.LineSegments(this.tickGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.75 })));

    // Period bracket for the nonlinear pendulum (cyan, lower).
    this.brackGeom = new THREE.BufferGeometry();
    this.brackGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
    this.simScene.add(new THREE.LineSegments(this.brackGeom, body()));

    // Period bracket for the linear twin (white, just above it).
    this.brackRefGeom = new THREE.BufferGeometry();
    this.brackRefGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
    this.brackRefObj = new THREE.LineSegments(this.brackRefGeom, white(0.45));
    this.simScene.add(this.brackRefObj);

    // Moving head marker on the trace.
    this.headObj = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts(0.018, 16)), body());
    this.simScene.add(this.headObj);

    // ── pendulum group ──
    this.gPend = new THREE.Group();
    this.pivot = new THREE.Vector3(OSC_CX, 0.42, 0);
    this.gPend.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts(0.02, 12).map((p) => p.add(this.pivot))),
      white(0.4)));
    this.gPend.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        this.pivot.clone(), new THREE.Vector3(OSC_CX, this.pivot.y - PEND_L - 0.04, 0)
      ]), white(0.14)));
    this.arcGeom = new THREE.BufferGeometry();
    this.arcGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_SEG + 1) * 3), 3));
    this.gPend.add(new THREE.Line(this.arcGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.35 })));
    this.refRodGeom = new THREE.BufferGeometry();
    this.refRodGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    this.gPend.add(new THREE.Line(this.refRodGeom, white(0.3)));
    this.refBobObj = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts(0.05, 20)), white(0.35));
    this.gPend.add(this.refBobObj);
    this.rodGeom = new THREE.BufferGeometry();
    this.rodGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    this.gPend.add(new THREE.Line(this.rodGeom, body()));
    this.bobObj = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts(0.07, 24)), accent());
    this.gPend.add(this.bobObj);
    this.simScene.add(this.gPend);

    // ── spring group ──
    this.gSpring = new THREE.Group();
    const wallX = OSC_CX - 0.46;
    this.gSpring.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wallX, -0.34, 0), new THREE.Vector3(wallX, 0.34, 0)
      ]), white(0.4)));
    this.springGeom = new THREE.BufferGeometry();
    this.springGeom.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array((SPRING_SEG + 1) * 3), 3));
    this.gSpring.add(new THREE.Line(this.springGeom, body()));
    this.massObj = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.09, -0.11, 0), new THREE.Vector3(0.09, -0.11, 0),
        new THREE.Vector3(0.09, 0.11, 0), new THREE.Vector3(-0.09, 0.11, 0),
      ]), accent());
    this.gSpring.add(this.massObj);
    this.simScene.add(this.gSpring);

    this._applyMode();
  }

  _applyMode() {
    if (!this.gPend) return;
    this.gPend.visible = this.nonlinear;
    this.gSpring.visible = !this.nonlinear;
    if (this.refTraceLine) this.refTraceLine.visible = this.nonlinear;
    if (this.brackRefObj) this.brackRefObj.visible = this.nonlinear;
  }

  updateSimScene() {
    if (!this.traceGeom) return;
    const L = TRACE_N, n = this.traceCount;
    const scale = TRACE_H / Math.max(1e-6, this.theta0);
    const arr = this.traceGeom.attributes.position.array;
    const rarr = this.refTraceGeom.attributes.position.array;
    const oldest = (this.traceHead - n + TRACE_N * 2) % TRACE_N;
    let headY = 0;
    for (let i = 0; i < L; i++) {
      const j = i - (L - n);
      const idx = (oldest + (j < 0 ? 0 : j)) % TRACE_N;
      const x = TRACE_X0 + (TRACE_X1 - TRACE_X0) * (i / (L - 1));
      let y = this.trace[idx] * scale;
      y = y > 0.52 ? 0.52 : (y < -0.52 ? -0.52 : y);
      let ry = this.traceRef[idx] * scale;
      ry = ry > 0.52 ? 0.52 : (ry < -0.52 ? -0.52 : ry);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = 0.02;
      rarr[i * 3] = x; rarr[i * 3 + 1] = ry; rarr[i * 3 + 2] = 0.012;
      if (i === L - 1) headY = y;
    }
    this.traceGeom.attributes.position.needsUpdate = true;
    this.refTraceGeom.attributes.position.needsUpdate = true;
    if (this.headObj) this.headObj.position.set(TRACE_X1, headY, 0.03);

    // Zero-crossing ticks + the two period brackets, read off the trace samples.
    const screenX = (jf) => TRACE_X0 + (TRACE_X1 - TRACE_X0) * ((jf + (L - n)) / (L - 1));
    const ticks = this.tickGeom.attributes.position.array;
    let tk = 0, nu = 0, nur = 0;
    for (let j = 1; j < n; j++) {
      const ia = (oldest + j - 1) % TRACE_N, ib = (oldest + j) % TRACE_N;
      const a = this.trace[ia], b = this.trace[ib];
      if (a !== b && ((a < 0 && b >= 0) || (a > 0 && b <= 0))) {
        const sx = screenX(j - 1 + (-a / (b - a)));
        if (tk < MAX_TICKS) {
          ticks[tk * 6] = sx; ticks[tk * 6 + 1] = -0.045; ticks[tk * 6 + 2] = 0.015;
          ticks[tk * 6 + 3] = sx; ticks[tk * 6 + 4] = 0.045; ticks[tk * 6 + 5] = 0.015;
          tk++;
        }
        if (a < 0 && b >= 0 && nu < 64) this._ups[nu++] = sx;
      }
      if (this.nonlinear) {
        const ra = this.traceRef[ia], rb = this.traceRef[ib];
        if (ra !== rb && ra < 0 && rb >= 0 && nur < 64) {
          this._upsRef[nur++] = screenX(j - 1 + (-ra / (rb - ra)));
        }
      }
    }
    for (let k = tk; k < MAX_TICKS; k++) { ticks[k * 6] = -10; ticks[k * 6 + 3] = -10; }
    this.tickGeom.attributes.position.needsUpdate = true;

    this._bracket(this.brackGeom, this._ups, nu, -0.58, 0.06);
    if (this.nonlinear) this._bracket(this.brackRefGeom, this._upsRef, nur, -0.50, 0.045);

    this._updateOscillator();
  }

  _bracket(geom, ups, count, yb, tick) {
    const br = geom.attributes.position.array;
    if (count >= 2) {
      const x1 = ups[count - 2], x2 = ups[count - 1];
      br[0] = x1; br[1] = yb; br[2] = 0.015; br[3] = x2; br[4] = yb; br[5] = 0.015;
      br[6] = x1; br[7] = yb; br[8] = 0.015; br[9] = x1; br[10] = yb + tick; br[11] = 0.015;
      br[12] = x2; br[13] = yb; br[14] = 0.015; br[15] = x2; br[16] = yb + tick; br[17] = 0.015;
    } else {
      for (let k = 0; k < 6; k++) br[k * 3] = -10;
    }
    geom.attributes.position.needsUpdate = true;
  }

  _updateOscillator() {
    if (this.nonlinear) {
      if (!this.rodGeom) return;
      // amplitude arc from −θ₀ to +θ₀ (the release envelope)
      const aArr = this.arcGeom.attributes.position.array, R = PEND_L * 0.9;
      for (let i = 0; i <= ARC_SEG; i++) {
        const th = -this.theta0 + (2 * this.theta0) * (i / ARC_SEG);
        aArr[i * 3] = this.pivot.x + R * Math.sin(th);
        aArr[i * 3 + 1] = this.pivot.y - R * Math.cos(th);
        aArr[i * 3 + 2] = 0;
      }
      this.arcGeom.attributes.position.needsUpdate = true;

      const bx = this.pivot.x + PEND_L * Math.sin(this.x);
      const by = this.pivot.y - PEND_L * Math.cos(this.x);
      const rArr = this.rodGeom.attributes.position.array;
      rArr[0] = this.pivot.x; rArr[1] = this.pivot.y; rArr[2] = 0.005;
      rArr[3] = bx; rArr[4] = by; rArr[5] = 0.005;
      this.rodGeom.attributes.position.needsUpdate = true;
      this.bobObj.position.set(bx, by, 0.01);

      // the linearised twin, drawn at the same rod length so its lead is visible
      const rbx = this.pivot.x + PEND_L * Math.sin(this.rx);
      const rby = this.pivot.y - PEND_L * Math.cos(this.rx);
      const gArr = this.refRodGeom.attributes.position.array;
      gArr[0] = this.pivot.x; gArr[1] = this.pivot.y; gArr[2] = 0;
      gArr[3] = rbx; gArr[4] = rby; gArr[5] = 0;
      this.refRodGeom.attributes.position.needsUpdate = true;
      this.refBobObj.position.set(rbx, rby, 0.008);

    } else {
      if (!this.springGeom) return;
      const xn = Math.max(-1.1, Math.min(1.1, this.x / Math.max(1e-6, this.theta0)));
      const massX = OSC_CX + 0.30 * xn;
      const x0 = OSC_CX - 0.46, x1 = massX - 0.09;
      const sArr = this.springGeom.attributes.position.array;
      for (let k = 0; k <= SPRING_SEG; k++) {
        const t = k / SPRING_SEG;
        sArr[k * 3] = x0 + (x1 - x0) * t;
        // display-only: a zigzag drawn with a sine
        sArr[k * 3 + 1] = (k === 0 || k === SPRING_SEG) ? 0 : 0.055 * Math.sin(t * Math.PI * 16);
        sArr[k * 3 + 2] = 0;
      }
      this.springGeom.attributes.position.needsUpdate = true;
      this.massObj.position.set(massX, 0, 0.01);
    }
  }
}

registerSim(OscillatorPeriodPi);
