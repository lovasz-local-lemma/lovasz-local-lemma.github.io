import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() call and makes ~speed*10 calls
// per frame; TIME_SCALE (the GaltonBoardPi carry-accumulator pattern) makes one
// board-second roughly one wall-clock second at speed 1.
const TIME_SCALE = 16.7;

const DT_SUB = 2e-3;         // RK4 step (board-seconds). k·dt ≤ 4e-3 here.
const MAX_SUBSTEPS = 2000;   // per step() call (hub previews pass dt = 0.04)
const NRUN = 4;              // time-constants per drain before the tank refills
const NSAMP = 200;           // decay-curve sample slots (pooled)
const NDROPS = 32;           // cosmetic outflow particles, independent of the ODE
const SURFACE_SAMPLES = 28;
const DRY = 1e-12;           // integrator floor: below this the depth is set to 0
// A sub-linear tank (p < 1) reaches depth EXACTLY zero in finite time, but RK4
// leaves a crumb of order 1e-8·h₀ at the τ-mark where the exact solution is
// already dry, which would print a meaningless factor of ~1e7. Anything below
// this fraction of the start depth is therefore reported as dry. The smallest
// depth a genuinely live τ-mark can have on these sliders is e⁻⁴ ≈ 0.018·h₀
// (the last of NRUN = 4 windows at p = 1) — three orders above the cut.
const DRY_REL = 1e-5;

// --- scene layout (ortho units) ---
const LX = -0.72;            // centre of the physical drawing (left half)
const TW = 0.34;             // tank width
const YB = -0.50;            // baseline: zero level (empty)
const HH = 0.92;             // scene height of level 1.0

const TRACE_X0 = 0.05;       // decay-curve left edge
const TRACE_X1 = 1.14;       // decay-curve right edge
const TRACE_W = TRACE_X1 - TRACE_X0;
const TRACE_SPAN = 0.98;     // scene height of level 1.0 on the curve (top at YB+SPAN)

const CYAN = 0x77dfbd;       // p = 1: the exponential
const AMBER = 0xe5bf78;      // p ≠ 1: a different decay law
const SPOUT_X = LX + TW / 2 + 0.12;
const CATCH_Y = YB - 0.27;

// The tank drains under  h′ = −k·h^p.  k is a plain physical constant (a leak
// conductance) and contains NO e; p is a pure exponent and contains no e either.
// The whole point of the sim is that the ratio h(t)/h(t+τ) is e ONLY at p = 1 —
// e is a property of the DYNAMICS, found by the integrator, never fed in.
//
// Closed form of the same ODE (used for the readout's cross-check and for the
// "Expected" prose — it is written in k, p and h₀ only, and contains no e):
//     h(t) = [ h₀^(1−p) − (1−p)·k·t ]^(1/(1−p))
// so the factor across one time-constant τ = 1/k is
//     R(p, h₀) = [ h₀^(1−p) / (h₀^(1−p) − (1−p)) ]^(1/(1−p)),
// which at h₀ = 1 collapses to R = p^(1/(p−1)); putting p = 1 + 1/n makes that
// literally (1 + 1/n)^n — the compound-interest sequence whose limit is e.
function predictedRatio(p, x0) {
  const u = 1 - p;
  if (Math.abs(u) < 1e-12) return NaN;   // singular at p = 1; the limit there IS e
  const a = Math.pow(x0, u);
  const d = a - u;
  if (d <= 0) return Infinity;           // tank runs dry inside one time-constant
  return Math.pow(a / d, 1 / u);
}

// If p = 1 ± 1/n for a whole number n, name that n so the readout can show the
// estimator as the compound-interest term (1 ± 1/n)^(±n). Returns 0 if not.
function reciprocalIndex(p) {
  const d = p - 1;
  if (Math.abs(d) < 1e-12) return 0;
  const n = 1 / d;
  const r = Math.round(n);
  return (Math.abs(n - r) < 1e-6 && Math.abs(r) >= 2) ? r : 0;
}

function ringPts(r, seg) {
  const p = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    p.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return p;
}

export class DrainingVesselE extends Simulation {
  static id = 'draining-vessel-e';
  static title = 'Draining Vessel — e from an exponential decay';
  static description = 'Watch a tank empty. When outflow follows the water depth, each equal time interval leaves 1/e as much water. Change the leak law and the measured factor changes.';
  static piMechanism = 'exponential relaxation: h′ = −k·h^p carries only a physical rate k and a bare exponent p. At p = 1 the solution falls by a constant factor per unit time, and over τ = 1/k that factor is exactly e, read straight off the simulated decay. At p ≠ 1 the solution is a power law and the same measurement returns p^(1/(p−1)) instead — e is measured, never inserted.';
  static rigor = 'Exact';
  static sortOrder = 207;
  static piNature = 'exact';
  static piLabel = 'e ≈';
  static previewSteps = 3;    // hub thumbnail: a partly full tank and a visible decay
  static alternatives = [
    { id: 'oscillator-period-pi', label: 'π from a period, e from a decay' },
    { id: 'uniform-sum-e', label: 'e from random pours' },
    { id: 'derangement-e', label: 'e from shuffles' },
  ];
  static explanation = {
    setup: 'Start with a full tank and a leak whose flow follows h′ = −k·h^p. With p = 1, twice the depth means twice the outflow: the tank slows as it empties. Every τ = 1/k seconds, measure the old depth divided by the new depth. The falling drops illustrate the outflow; the water height and curve come from the numerical integration. An ordinary hole follows p = 1/2 instead, which you can also try.',
    insight: 'At p = 1, each equal time interval removes the same fraction of the water. After one time-constant τ = 1/k, the depth is h₀/e, so dividing the starting depth by the measured depth gives e. The simulator finds that depth by integrating the leak law; it does not insert e into the dynamics. The gold guide lines are reference levels for comparison only.',
    contrast: 'Move p away from 1: the four measured decay factors stop agreeing. From a full tank the first factor is p^(1/(p−1)); at p = 1 + 1/n, this is the familiar (1 + 1/n)^n. Change the start depth too: the factor stays the same only at p = 1. With p < 1 the tank can run completely dry in finite time. The grey curve shows a second integration with p = 1 for comparison.',
    readout: 'The estimate averages h₀/h(τ), the first-window factor from each drain. The four window factors describe the current drain; a dry window has no finite factor to measure. The displayed Δ is the estimate minus the reference e. RK4 steps are split at each τ boundary, so depth is integrated to the measurement time. Remaining numerical error depends on the rate, exponent and step size; additional identical drains do not create new numerical accuracy.',
    formula: 'At p = 1: e ≈ h₀/h(τ), where τ = 1/k. For a full tank with p ≠ 1: h₀/h(τ) = p^(1/(p−1)).',
    getExpected: (params) => {
      const k = params.k ?? 0.7;
      const p = params.p ?? 1;
      const x0 = params.amp ?? 1;
      const tau = 1 / k;
      if (Math.abs(p - 1) < 1e-12) {
        return `p = 1 (linear leak), k = ${k.toFixed(3)} s⁻¹ — a plain leak conductance with no e in it. The depth is h₀·e^(−k·t), so the factor across one τ = 1/k = ${tau.toFixed(3)} board-seconds is e = 2.71828… exactly, for any k and any start level h₀. Expect ê on e to six figures after the very first window, and the four per-window factors identical. Then move the exponent: the answer leaves e and does not come back until p = 1.`;
      }
      const r = predictedRatio(p, x0);
      const n = reciprocalIndex(p);
      const compound = (Math.abs(x0 - 1) < 1e-9 && n !== 0)
        ? (n > 0 ? ` — that is exactly (1 + 1/${n})^${n}` : ` — that is exactly (1 − 1/${-n})^(−${-n})`)
        : '';
      const dry = (p < 1) ? ` Being sub-linear, this tank runs dry in finite time: at ${(Math.pow(x0, 1 - p) / (1 - p)).toFixed(3)}τ the depth reaches exactly zero, after which the later windows have no factor to report.` : '';
      return `p = ${p.toFixed(2)} ≠ 1, so the tank is NOT exponential — it follows the power law h = [h₀^(1−p) − (1−p)·k·t]^(1/(1−p)). From h₀ = ${x0.toFixed(2)} the measured factor across τ = ${tau.toFixed(3)} board-seconds should be ${Number.isFinite(r) ? r.toFixed(6) : '∞'}, not 2.718282${compound}. That is the bias, and it is reachable: slide p back to 1 and ê returns to e exactly.${dry} Note also that at p ≠ 1 the start level changes the answer — amplitude independence is itself a signature of the exponential.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.k = params.k ?? 0.7;
    this.p = params.p ?? 1;            // nonlinearity exponent: e is exact ONLY at p = 1
    this.amp = params.amp ?? 1;        // start depth h₀ (fraction of the full tank)
    this.traceLevels = new Float32Array(NSAMP);
    this.traceRef = new Float32Array(NSAMP);
    this.ratios = new Float64Array(NRUN);   // per-window factors of the current drain
    this.dropAge = new Float32Array(NDROPS);
    this.dropSide = new Float32Array(NDROPS);
    this._liquidMatrix = new THREE.Matrix4();
    this.reset();
  }

  reset() {
    super.reset();
    this.x0 = this.amp;
    this.x = this.x0;
    this.xRef = this.x0;                // parallel p = 1 track (visual reference only)
    this._linear = Math.abs(this.p - 1) < 1e-12;
    this.tau = 1 / this.k;
    this.TMAX = NRUN * this.tau;

    this.localT = 0;
    this.liquidClock = 0;
    this.dropCarry = 0;
    this.dropCursor = 0;
    this.dropAge.fill(-1);
    this.splashAge = 10;
    this.splashX = SPOUT_X;
    this.subCarry = 0;
    this.nb = 1;                        // next time-constant boundary index (1..NRUN)
    this.lastBoundaryLevel = this.x0;   // depth at the previous τ-mark (start = h₀)

    this.sumE = 0;
    this.nE = 0;                        // first-window factors folded into ê
    this.windows = 0;                   // τ-marks crossed (all windows)
    this.eHat = 0;                      // running ⟨first-window factor⟩ — the estimate
    this.lastRatio = 0;
    this.runs = 0;
    this.dryEarly = false;              // emptied before the first τ-mark

    this.traceLevels.fill(0);
    this.traceRef.fill(0);
    this.ratios.fill(NaN);
    this.traceCount = 0;

    this.collisionCount = 0;
  }

  getControls() {
    return [
      { type: 'slider', id: 'p', label: 'Leak exponent p', min: 0.5, max: 1.5, step: 0.05,
        default: this.p, highlight: true,
        onChange: (val) => { this.p = val; this.reset(); } },
      { type: 'slider', id: 'k', label: 'Leak rate k (s⁻¹)', min: 0.2, max: 2, step: 0.05,
        default: this.k,
        onChange: (val) => { this.k = val; this.reset(); } },
      { type: 'slider', id: 'amp', label: 'Start depth h₀', min: 0.4, max: 1, step: 0.05,
        default: this.amp,
        onChange: (val) => { this.amp = val; this.reset(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'convergence', label: 'drain progress vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'drains completed', y: 'signed √|ê − e|/e' } }
    ];
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
    }
    return ping;
  }

  // Right-hand side of h′ = −k·h^p. Contains a rate and an exponent, nothing
  // else — no e anywhere. Depth is clamped at zero: for p < 1 the solution
  // genuinely reaches zero in finite time, and h^p of a negative depth is not a
  // number, so the guard is physics, not a fudge.
  _deriv(v) {
    if (v <= 0) return 0;
    return this._linear ? -this.k * v : -this.k * Math.pow(v, this.p);
  }

  _rk4(x, h) {
    const a1 = this._deriv(x);
    const a2 = this._deriv(x + 0.5 * h * a1);
    const a3 = this._deriv(x + 0.5 * h * a2);
    const a4 = this._deriv(x + h * a3);
    const xn = x + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    return xn > DRY ? xn : 0;
  }

  // The p = 1 reference track: the SAME tank run with a linear leak, integrated
  // alongside so the drawing can show the departure. Display only — it never
  // touches the estimator.
  _rk4Lin(x, h) {
    const k = this.k;
    const a1 = -k * x;
    const a2 = -k * (x + 0.5 * h * a1);
    const a3 = -k * (x + 0.5 * h * a2);
    const a4 = -k * (x + h * a3);
    const xn = x + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    return xn > DRY ? xn : 0;
  }

  // One RK4 step, split exactly at a τ-mark when one falls inside it so the
  // boundary depth is integrated to, not interpolated. Each crossing yields the
  // window's decay factor; the FIRST window of every drain (h₀ → h(τ)) is the
  // estimator, ê = ratio^(1/(k·Δ)) with the window Δ = τ, i.e. the raw ratio.
  _substep() {
    const dt = DT_SUB;
    const tPrev = this.localT;
    const tNext = tPrev + dt;
    let ping = false;

    const bnd = (this.nb <= NRUN) ? this.nb * this.tau : Infinity;
    if (tNext >= bnd) {
      const dtA = bnd - tPrev;
      if (dtA > 0) { this.x = this._rk4(this.x, dtA); this.xRef = this._rk4Lin(this.xRef, dtA); }
      ping = this._recordBoundary(this.x);
      const dtB = tNext - bnd;
      if (dtB > 0) { this.x = this._rk4(this.x, dtB); this.xRef = this._rk4Lin(this.xRef, dtB); }
    } else {
      this.x = this._rk4(this.x, dt);
      this.xRef = this._rk4Lin(this.xRef, dt);
    }
    this.localT = tNext;
    this._advanceLiquid(dt);

    // Fill the pooled decay-curve samples up to the current fraction of the run.
    const curFrac = Math.min(1, this.localT / this.TMAX);
    const slot = Math.min(NSAMP - 1, Math.floor(curFrac * NSAMP));
    const lvl = this.x0 > 0 ? this.x / this.x0 : 0;
    const lvlRef = this.x0 > 0 ? this.xRef / this.x0 : 0;
    while (this.traceCount <= slot) {
      this.traceLevels[this.traceCount] = lvl;
      this.traceRef[this.traceCount] = lvlRef;
      this.traceCount++;
    }

    // End of the drain: refill to h₀ and start a fresh decay.
    if (this.localT >= this.TMAX) {
      this.localT = 0;
      this.x = this.x0;
      this.xRef = this.x0;
      this.nb = 1;
      this.lastBoundaryLevel = this.x0;
      this.traceCount = 0;
      this.ratios.fill(NaN);
      this.runs++;
    }
    return ping;
  }

  // Pooled illustration of the integrated outflow. These values never enter
  // the depth integration, boundary ratios, or convergence estimate.
  _advanceLiquid(dt) {
    this.liquidClock += dt;
    this.splashAge += dt;
    for (let i = 0; i < NDROPS; i++) {
      if (this.dropAge[i] < 0) continue;
      const age = this.dropAge[i] + dt;
      const y = YB - 0.02 - 0.22 * age - 1.8 * age * age;
      if (y <= CATCH_Y) {
        this.dropAge[i] = -1;
        this.splashAge = 0;
        this.splashX = SPOUT_X + this.dropSide[i] * age;
      } else this.dropAge[i] = age;
    }
    this.dropCarry += Math.min(38, -this._deriv(this.x) * 50) * dt;
    while (this.dropCarry >= 1) {
      this.dropCarry--;
      const i = this.dropCursor++ % NDROPS;
      this.dropAge[i] = 0;
      this.dropSide[i] = Math.sin(this.dropCursor * 2.4) * 0.035;
    }
  }

  _recordBoundary(rawLevel) {
    const idx = this.nb - 1;
    const levelB = rawLevel > DRY_REL * this.x0 ? rawLevel : 0;
    const prev = this.lastBoundaryLevel;
    const ratio = (levelB > 0 && prev > 0) ? prev / levelB : NaN;
    this.ratios[idx] = ratio;
    this.windows++;
    this.collisionCount = this.windows;

    if (idx === 0) {
      if (Number.isFinite(ratio) && ratio > 0) {
        // Window Δ = τ ⇒ k·Δ = 1 ⇒ ê = ratio^(1/(k·Δ)) = ratio, exactly.
        this.sumE += ratio;
        this.nE++;
        this.eHat = this.sumE / this.nE;
        this.lastRatio = ratio;
        this.dryEarly = false;
      } else {
        this.dryEarly = true;   // emptied inside one τ: no factor to measure
      }
    }
    this.pendingPhasePoints.push([...this.getPhasePoint()]);
    this.lastBoundaryLevel = levelB;
    this.nb++;
    return true;
  }

  getCountLabel() {
    return 'τ-windows observed';
  }

  getPiApproximation() {
    return this.eHat;
  }

  getPiReadout() {
    if (!(this.eHat > 0)) return this.dryEarly ? 'tank dry inside one τ' : 'measuring first τ…';
    // Δ against the true e is a DISPLAY-ONLY error metric; it is never read back
    // into sumE / eHat.
    return `${this.eHat.toFixed(6)} · Δ=${this._deltaStr()}`;
  }

  // Signed distance from the reference e. DISPLAY ONLY — scientific notation
  // preserves a small numerical residual instead of rounding it to zero.
  _deltaStr() {
    if (!(this.eHat > 0)) return '—';
    const d = this.eHat - Math.E;
    const s = d >= 0 ? '+' : '−';
    const a = Math.abs(d);
    return s + (a < 1e-4 ? a.toExponential(2) : a.toFixed(6));
  }

  getFormulaHTML() {
    const live = this.eHat > 0 ? piDigitsHTML(this.eHat, 4, Math.E) : 'measuring…';
    const predicted = predictedRatio(this.p, this.x0);
    const expected = this._linear ? 'the same factor in every window'
      : Number.isFinite(predicted) ? `first-window prediction: ${predicted.toFixed(6)}` : 'dry inside one time-constant';
    let factors = '';
    for (let i = 0; i < NRUN; i++) {
      const ratio = this.ratios[i];
      const value = Number.isFinite(ratio)
        ? (ratio >= 1e4 ? ratio.toExponential(1) : ratio.toFixed(4))
        : (this.nb > i + 1 ? 'dry' : '—');
      factors += (i ? ' · ' : '') + value;
    }
    return `<div style="width:100%;text-align:left">`
      + `<strong>${this._linear ? 'Same time. Same fraction.' : 'A different leak changes the factor.'}</strong><br>`
      + `<span class="f-result">ê</span> = h₀ / h(τ) = <span style="font-size:1.1em">${live}</span><br>`
      + `<span class="f-count">τ = ${this.tau.toFixed(3)} s · ${this.nE} drain(s) · Δ from e = ${this._deltaStr()}</span><br>`
      + `<span class="f-muted">Factor per τ: ${factors} — ${expected}.</span>`
      + `</div>`;
  }
  getPhasePoint() {
    const prog = this.TMAX > 0 ? (this.runs + this.localT / this.TMAX) : 0;
    const x = Math.min(1, Math.max(-1, (prog / 8) * 2 - 1));
    // Math.E here is a DISPLAY-ONLY truth reference for the error axis; it never
    // feeds back into the estimator.
    const err = this.eHat > 0 ? (this.eHat - Math.E) / Math.E : 0;
    const s = Math.sign(err) * Math.sqrt(Math.abs(err)) * 1.2;
    const y = Math.min(1, Math.max(-1, s));
    return [x, y];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -1.22, x1: 1.23, y0: -0.85, y1: 0.66 };
  }

  _label(text, cx, cy, sx = 0.14, sy = 0.05, color = '#d8e3d8') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = color;
    g.font = '34px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 36, 248);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthTest: false }));
    sp.position.set(cx, cy, 0.1);
    sp.scale.set(sx, sy * 1.25, 1);
    this.simScene.add(sp);
    return sp;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.25, 1.25, 0.70, -0.86, 0.1, 10);
    this.simCamera.position.z = 1;

    const faint = 0.16, mid = 0.4;
    const white = (o) => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: o });

    // --- decay-curve frame: baseline (empty) + left axis + top (h₀) line ---
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(TRACE_X0, YB, 0), new THREE.Vector3(TRACE_X1, YB, 0)
      ]), white(mid)));
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(TRACE_X0, YB, 0), new THREE.Vector3(TRACE_X0, YB + TRACE_SPAN, 0)
      ]), white(faint)));
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(TRACE_X0, YB + TRACE_SPAN, 0), new THREE.Vector3(TRACE_X1, YB + TRACE_SPAN, 0)
      ]), white(faint)));

    // --- horizontal gridlines at x₀/e, x₀/e², x₀/e³ and vertical ticks at τ, 2τ,
    // 3τ. DISPLAY ONLY: these are where a p = 1 tank would land, drawn as a
    // target for the eye. Nothing read off them enters the estimator.
    const levels = [1 / Math.E, 1 / (Math.E * Math.E), 1 / (Math.E * Math.E * Math.E)];
    const gridPts = [];
    const tickPts = [];
    for (let m = 1; m <= 3; m++) {
      const lvl = levels[m - 1];
      const gy = YB + lvl * TRACE_SPAN;
      gridPts.push(new THREE.Vector3(TRACE_X0, gy, 0.005), new THREE.Vector3(TRACE_X1, gy, 0.005));
      const gx = TRACE_X0 + (m / NRUN) * TRACE_W;
      tickPts.push(new THREE.Vector3(gx, YB, 0.005), new THREE.Vector3(gx, gy, 0.005));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(gridPts),
      new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.4 })));
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPts),
      new THREE.LineBasicMaterial({ color: 0x91b2a4, transparent: true, opacity: 0.55 })));

    // --- the p = 1 reference track (a second integration of the same tank) ---
    const refArr = new Float32Array(NSAMP * 3);
    this.refGeom = new THREE.BufferGeometry();
    this.refGeom.setAttribute('position', new THREE.BufferAttribute(refArr, 3));
    this.simScene.add(new THREE.Line(
      this.refGeom,
      new THREE.LineBasicMaterial({ color: 0xa9b6af, transparent: true, opacity: 0.5 })));

    // --- the live decay curve (pooled polyline, rewritten each frame) ---
    const traceArr = new Float32Array(NSAMP * 3);
    this.traceGeom = new THREE.BufferGeometry();
    this.traceGeom.setAttribute('position', new THREE.BufferAttribute(traceArr, 3));
    this.traceMat = new THREE.LineBasicMaterial({ color: CYAN });
    this.simScene.add(new THREE.Line(this.traceGeom, this.traceMat));

    // moving marker on the curve (current depth)
    this.headMat = new THREE.LineBasicMaterial({ color: CYAN });
    this.headObj = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPts(0.018, 16)), this.headMat);
    this.simScene.add(this.headObj);

    // --- labels ---
    this._label('h₀/e', TRACE_X1 + 0.045, YB + levels[0] * TRACE_SPAN, 0.11, 0.05, '#e5bf78');
    this._label('h₀/e²', TRACE_X1 + 0.045, YB + levels[1] * TRACE_SPAN, 0.12, 0.05, '#e5bf78');
    this._label('h₀/e³', TRACE_X1 + 0.045, YB + levels[2] * TRACE_SPAN, 0.12, 0.05, '#e5bf78');
    for (let m = 1; m <= 3; m++) {
      const gx = TRACE_X0 + (m / NRUN) * TRACE_W;
      this._label(m === 1 ? 'τ' : m + 'τ', gx, YB - 0.06, 0.07, 0.045, '#a9b6af');
    }
    // Label texts are kept short on purpose: _label draws into a fixed 256×64
    // canvas at 34px, so a long string would run off the texture.
    this._label('each τ  ×1/e', (TRACE_X0 + TRACE_X1) / 2, YB + TRACE_SPAN + 0.07, 0.34, 0.05, '#d8e3d8');
    this._label('only if p = 1', (TRACE_X0 + TRACE_X1) / 2, YB + TRACE_SPAN + 0.125, 0.30, 0.045, '#a9b6af');
    this._label('grey: p = 1', TRACE_X1 - 0.14, YB + TRACE_SPAN - 0.07, 0.26, 0.045, '#a9b6af');

    this._buildScene();
  }

  _buildScene() {
    const white = (o) => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: o });
    const accent = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(TW, HH),
      new THREE.MeshBasicMaterial({ color: 0xb3ddd0, transparent: true, opacity: 0.045, depthWrite: false }));
    glass.position.set(LX, YB + HH / 2, -0.02);
    this.simScene.add(glass);
    const marks = [];
    for (let i = 1; i <= 4; i++) {
      const y = YB + i * HH / 4;
      marks.push(new THREE.Vector3(LX - TW / 2 - 0.035, y, 0.03),
        new THREE.Vector3(LX - TW / 2 - 0.01, y, 0.03));
    }
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(marks),
      new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.45 })));
    for (const side of [-1, 1]) {
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.008, HH - 0.09),
        new THREE.MeshBasicMaterial({ color: 0xdbf2e8, transparent: true, opacity: side < 0 ? 0.3 : 0.13 }));
      glint.position.set(LX + side * (TW / 2 - 0.006), YB + HH / 2, 0.035);
      this.simScene.add(glint);
    }

    // Water body and a shallow curved surface, with shared pooled geometry.
    this.fillMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.48 }));
    this.fillMesh.position.z = 0.01;
    this.simScene.add(this.fillMesh);
    this.surfaceGeom = new THREE.BufferGeometry();
    this.surfaceGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SURFACE_SAMPLES * 3), 3));
    this.fillTop = new THREE.Line(this.surfaceGeom,
      new THREE.LineBasicMaterial({ color: 0xe4f8ed, transparent: true, opacity: 0.86 }));
    this.fillTop.position.z = 0.03;
    this.simScene.add(this.fillTop);
    this.meniscusGeom = new THREE.BufferGeometry();
    this.meniscusGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SURFACE_SAMPLES * 6), 3));
    const surfaceIndices = [];
    for (let i = 0; i < SURFACE_SAMPLES - 1; i++) {
      const a = i * 2;
      surfaceIndices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    this.meniscusGeom.setIndex(surfaceIndices);
    this.meniscus = new THREE.Mesh(this.meniscusGeom,
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.7, depthWrite: false }));
    this.simScene.add(this.meniscus);
    this.waterReflection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xe7fff1, transparent: true, opacity: 0.12, depthWrite: false }));
    this.simScene.add(this.waterReflection);
    this._fillHex = CYAN;

    // U-shaped tank (open top) + a drain spout at the bottom-right.
    const hw = TW / 2;
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(LX - hw, YB + HH, 0), new THREE.Vector3(LX - hw, YB, 0),
        new THREE.Vector3(LX + hw, YB, 0), new THREE.Vector3(LX + hw, YB + HH, 0),
      ]), accent));
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(LX + hw, YB + 0.05, 0), new THREE.Vector3(LX + hw + 0.12, YB + 0.05, 0),
        new THREE.Vector3(LX + hw + 0.12, YB - 0.02, 0),
      ]), white(0.4)));

    this._label('draining tank', LX, YB + HH + 0.09, 0.34, 0.05, '#d8e3d8');
    this._label('h′ = −k·h^p', LX, YB + HH + 0.155, 0.30, 0.045, '#a9b6af');

    // The outlet and catch surface make the decreasing flow visible. All drops
    // share geometry; only instance matrices change while rendering.
    this.outlet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.8 }));
    this.outlet.position.set(LX + hw + 0.058, YB + 0.045, 0.025);
    this.simScene.add(this.outlet);
    this.outflowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.012, 14),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.88 }), NDROPS);
    this.outflowHi = new THREE.InstancedMesh(new THREE.CircleGeometry(0.0035, 10),
      new THREE.MeshBasicMaterial({ color: 0xeafff3, transparent: true, opacity: 0.7 }), NDROPS);
    this.outflowMesh.frustumCulled = this.outflowHi.frustumCulled = false;
    this.simScene.add(this.outflowMesh, this.outflowHi);
    this.catchRipple = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false }));
    this.catchRipple.visible = false;
    this.simScene.add(this.catchRipple);
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(SPOUT_X - 0.18, CATCH_Y + 0.025, 0),
      new THREE.Vector3(SPOUT_X - 0.15, CATCH_Y - 0.018, 0),
      new THREE.Vector3(SPOUT_X + 0.15, CATCH_Y - 0.018, 0),
      new THREE.Vector3(SPOUT_X + 0.18, CATCH_Y + 0.025, 0),
    ]), white(0.3)));
    this._label('less depth → less flow', LX - 0.08, CATCH_Y + 0.10, 0.48, 0.043, '#a9b6af');
  }

  updateSimScene() {
    if (!this.traceGeom) return;

    // p = 1 keeps the honest cyan; any other exponent goes amber, the house
    // colour for a deliberately biased estimator.
    const want = this._linear ? CYAN : AMBER;
    if (this._fillHex !== want) {
      this._fillHex = want;
      if (this.fillMesh) this.fillMesh.material.color.setHex(want);
      if (this.traceMat) this.traceMat.color.setHex(want);
      if (this.headMat) this.headMat.color.setHex(want);
      this.meniscus.material.color.setHex(want);
      this.outlet.material.color.setHex(want);
      this.outflowMesh.material.color.setHex(want);
      this.catchRipple.material.color.setHex(want);
    }

    // --- decay curve + p = 1 reference track ---
    const arr = this.traceGeom.attributes.position.array;
    const ref = this.refGeom.attributes.position.array;
    const n = Math.max(1, this.traceCount);
    let hx = TRACE_X0, hy = YB + TRACE_SPAN;
    for (let i = 0; i < NSAMP; i++) {
      const src = i < this.traceCount ? i : (this.traceCount > 0 ? this.traceCount - 1 : 0);
      const has = this.traceCount > 0;
      const lvl = i < this.traceCount ? this.traceLevels[src] : (has ? this.traceLevels[this.traceCount - 1] : 1);
      const lvlR = i < this.traceCount ? this.traceRef[src] : (has ? this.traceRef[this.traceCount - 1] : 1);
      const x = TRACE_X0 + (src / NSAMP) * TRACE_W;
      const y = YB + Math.max(0, Math.min(1.02, lvl)) * TRACE_SPAN;
      const yR = YB + Math.max(0, Math.min(1.02, lvlR)) * TRACE_SPAN;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = 0.02;
      ref[i * 3] = x; ref[i * 3 + 1] = yR; ref[i * 3 + 2] = 0.015;
      if (i === n - 1 || (i >= this.traceCount && this.traceCount > 0)) { hx = x; hy = y; }
    }
    this.traceGeom.attributes.position.needsUpdate = true;
    this.refGeom.attributes.position.needsUpdate = true;
    if (this.headObj) this.headObj.position.set(hx, hy, 0.03);

    // --- physical water column (absolute depth, so start-level changes show) ---
    if (this.fillMesh) {
      const h = Math.max(1e-4, Math.min(1.02, this.x) * HH);
      const w = TW - 0.05;
      this.fillMesh.scale.set(w, h, 1);
      this.fillMesh.position.set(LX, YB + h / 2, 0.01);
      const visible = this.x > DRY;
      this.fillMesh.visible = this.fillTop.visible = this.meniscus.visible = this.waterReflection.visible = visible;
      const waveAmp = Math.min(0.009, h * 0.05);
      const surface = this.surfaceGeom.attributes.position.array;
      const meniscus = this.meniscusGeom.attributes.position.array;
      for (let i = 0; i < SURFACE_SAMPLES; i++) {
        const u = i / (SURFACE_SAMPLES - 1);
        const x = LX + (u - 0.5) * w;
        const wave = Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 3 + this.liquidClock * 4) * waveAmp;
        const edge = Math.pow(Math.abs(2 * u - 1), 6) * Math.min(0.013, h * 0.1);
        const y = YB + h + wave + edge;
        surface[i * 3] = x; surface[i * 3 + 1] = y; surface[i * 3 + 2] = 0;
        meniscus[i * 6] = x; meniscus[i * 6 + 1] = y; meniscus[i * 6 + 2] = 0.025;
        meniscus[i * 6 + 3] = x; meniscus[i * 6 + 4] = YB + h - Math.min(h, 0.025); meniscus[i * 6 + 5] = 0.025;
      }
      this.surfaceGeom.attributes.position.needsUpdate = true;
      this.meniscusGeom.attributes.position.needsUpdate = true;
      this.waterReflection.scale.set(w * 0.09, h * 0.89, 1);
      this.waterReflection.position.set(LX - w * 0.33, YB + h * 0.5, 0.034);
    }

    const flow = Math.min(1, -this._deriv(this.x));
    this.outlet.visible = flow > 0.002;
    this.outlet.scale.set(0.115, 0.006 + flow * 0.013, 1);
    for (let i = 0; i < NDROPS; i++) {
      const age = this.dropAge[i];
      if (age < 0) this._liquidMatrix.makeScale(0, 0, 0);
      else {
        const stretch = 1.05 + age * 2.8;
        const x = SPOUT_X + this.dropSide[i] * age;
        const y = YB - 0.02 - 0.22 * age - 1.8 * age * age;
        this._liquidMatrix.makeScale(1 / Math.sqrt(stretch), stretch, 1);
        this._liquidMatrix.setPosition(x, y, 0.04);
      }
      this.outflowMesh.setMatrixAt(i, this._liquidMatrix);
      if (age >= 0) this._liquidMatrix.elements[12] -= 0.003;
      this.outflowHi.setMatrixAt(i, this._liquidMatrix);
    }
    this.outflowMesh.instanceMatrix.needsUpdate = this.outflowHi.instanceMatrix.needsUpdate = true;
    this.catchRipple.visible = this.splashAge < 0.3;
    if (this.catchRipple.visible) {
      const p = this.splashAge / 0.3;
      this.catchRipple.position.set(this.splashX, CATCH_Y, 0.04);
      this.catchRipple.scale.set(0.025 + p * 0.11, 0.006 + p * 0.022, 1);
      this.catchRipple.material.opacity = (1 - p) * 0.7;
    }
  }
}

registerSim(DrainingVesselE);
