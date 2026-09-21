import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() call and makes ~speed*10 calls
// per frame; TIME_SCALE (the GaltonBoardPi pattern) makes one board-second
// roughly one wall-clock second at speed 1.
const TIME_SCALE = 16.7;

const NX = 181;              // grid points (179 interior), dx = 1/180
const DX = 1 / (NX - 1);
const C = 1;                 // wave speed -> fundamental period 2L/c = 2 board-s
const DT_SUB = 5e-4;         // CFL r = c*dt/dx = 0.09; viscous limit b*dt/dx^2 <= 0.39
const B_MAX = 0.024;         // Kelvin-Voigt viscosity at damping slider = 1, mode 1
const MEAS_DT = 0.01;        // estimator cadence in board-seconds
const TAU_EST = 2;           // memory of the amplitude-weighted ratio accumulator
const TAU_SLOW = 3;          // slow EMA used to detect a settled readout
const TAU_ENV = 6;           // envelope-peak tracker (display scaling + thresholds)
const AMP_Y = 0.34;          // display half-height of the string
const MAX_MARKERS = 8;
const MAX_SUBSTEPS = 2000;   // per step() call (hub previews pass dt = 0.04)

export class StandingWaveNodePi extends Simulation {
  static id = 'standing-wave-node-pi';
  static title = 'Standing Wave — π from the eigenmode shape';
  static description = 'Pluck a simulated string and let it relax into an eigenmode — π is read from the emergent shape: peak / mean|u| → π/2';
  static piMechanism = 'deterministic eigenmode shape: fixed ends force sin(nπx/L); mean|u| = (2/π)·peak, so π ≈ 2·peak/mean — no wavenumber is ever set';
  static rigor = 'Exact Asymptotic';
  static sortOrder = 79;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 3;   // hub thumbnail: ~one full period in, string near max sway
  static alternatives = [{ id: 'bessel-zero-counter', label: 'Zeros of a different wave' }];
  static explanation = {
    setup: 'A string with fixed ends is simulated as a real wave equation u_tt = c²·u_xx on 179 interior grid points. It starts from a π-free pluck — parabolic arcs x(1−x) copied into n alternating segments — and a mild curvature damping (Kelvin–Voigt term b·u_txx) makes overtones die ~9× faster than the target mode, so the string relaxes into its n-th eigenmode.',
    insight: 'Nothing in the setup contains π: not the pluck, not the integrator, not the readout. The fixed ends force the relaxed shape toward sin(kx) with kL = nπ — π lives in the SHAPE the dynamics select, and the oscillation frequency emerges from the integration rather than being set. For any half-sine lobe the spatial mean of |u| is exactly (2/π) times the peak, so π̂ = 2·Â_peak/mean|u| converges to π as the transients die.',
    contrast: 'The previous version of this card smuggled π: it drew sin(kx) analytically with k = nπ/L and reported kL/n, which is identically π. Now the PDE does the work and the readout inverts a shape ratio. Cousin card: the Bessel zero counter reads π from the zero SPACING of a different wave; here π comes from the peak-to-mean ratio of a plucked string’s eigenmode.',
    readout: 'π̂ = 2·Â_peak/mean|u| accumulated with amplitude weighting over the last couple of periods, so the instants where the whole string passes through zero contribute almost no weight. The peak is parabola-refined between grid points and the mean is Richardson-extrapolated, so the grid itself costs under 10⁻⁶. Secondary check: counted interior zero crossings vs n−1. Modes above 5 are excluded: the readout still works, but the pluck’s 3n-th overtone starts approaching the 180-point grid resolution and the cleanup gets hard to watch.',
    formula: 'π ≈ 2·Â_peak / mean|u(x)|   (half-sine: mean|u| = (2/π)·peak)   [EXACT ASYMPTOTIC]',
    getExpected: (params) => {
      const n = params.mode || 1;
      return `Mode ${n}: the pluck is ${n} parabolic lobe(s) whose peak/mean ratio is exactly 3/2, so the readout starts at 2·(3/2) = 3.000. Curvature damping erases the overtones (3n, 5n, …) and the ratio climbs to π/2: at default damping the estimate is within 10⁻³ of π by ≈12 board-seconds and shows ~10⁻⁶ by t = 30. Interior zero crossings: ${n - 1}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.mode = params.mode || 1;
    this.damping = params.damping ?? 0.5;
    this.reset();
  }

  reset() {
    super.reset();
    this.tBoard = 0;
    this.subCarry = 0;
    this.measCarry = 0;
    this.nextSample = 0.05;
    this.u = new Float64Array(NX);
    this.v = new Float64Array(NX);
    this.acc = new Float64Array(NX);
    this._pluck();
    this.accPeak = 0;
    this.accMean = 0;
    this.piHat = 0;
    this.piSlow = 3;
    this.envPeak = 0;
    this.stabilized = false;
    this._justStabilized = false;
    this.envFade = 0;
    this.nodeXs = [];
    this.collisionCount = 0;
    this.finished = false;
    this._measure();   // seed readout + envelope + node markers from the pluck
  }

  // π-free initial shape: n parabolic lobes 4·f(1−f) with alternating sign.
  // Its sine content is modes n, 3n, 5n, … with amplitudes ∝ 1/m³, so the
  // target mode dominates 27:1 from the start.
  _pluck() {
    const n = this.mode;
    for (let i = 1; i < NX - 1; i++) {
      const s = i * DX * n;
      let seg = Math.floor(s);
      if (seg >= n) seg = n - 1;
      const f = s - seg;
      this.u[i] = (seg % 2 ? -1 : 1) * 4 * f * (1 - f);
      this.v[i] = 0;
    }
    this.u[0] = this.u[NX - 1] = 0;
    this.v[0] = this.v[NX - 1] = 0;
  }

  getControls() {
    return [
      { type: 'slider', id: 'mode', label: 'Mode n', min: 1, max: 5, step: 1, default: this.mode,
        highlight: true,
        onChange: (val) => { this.mode = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'damping', label: 'Harmonic damping', min: 0, max: 1, step: 0.05,
        default: this.damping,
        onChange: (val) => { this.damping = val; } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'convergence', label: 'log time vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log₁₀ board-seconds', y: '(π̂ − π)/π' } }
    ];
  }

  step(dt) {
    const tb = dt * TIME_SCALE;
    this.subCarry += tb;
    let nsub = Math.floor(this.subCarry / DT_SUB);
    this.subCarry -= nsub * DT_SUB;
    if (nsub > MAX_SUBSTEPS) nsub = MAX_SUBSTEPS;

    // Viscosity scaled by 1/n² so every target mode relaxes at the same rate
    // while its overtones (3n, 5n, …) die 9×, 25×, … faster.
    const b = this.damping * B_MAX / (this.mode * this.mode);
    for (let s = 0; s < nsub; s++) this._substep(b);
    const adv = nsub * DT_SUB;
    this.tBoard += adv;
    this.measCarry += adv;

    while (this.measCarry >= MEAS_DT) {
      this.measCarry -= MEAS_DT;
      this._measure();
    }

    if (this.tBoard >= this.nextSample) {
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextSample = Math.max(this.tBoard + MEAS_DT, this.tBoard * 1.02);
    }

    const ping = this._justStabilized;
    this._justStabilized = false;
    return ping;
  }

  // Symplectic Euler on u_tt = c²·u_xx + b·(u_t)_xx, fixed ends. The discrete
  // eigenmodes are exactly sin(nπ·i·dx), so the relaxed shape is the honest
  // discrete sine — no analytic wave is ever drawn.
  _substep(b) {
    const u = this.u, v = this.v, a = this.acc;
    const cu = C * C / (DX * DX);
    const cv = b / (DX * DX);
    for (let i = 1; i < NX - 1; i++) {
      a[i] = cu * (u[i + 1] - 2 * u[i] + u[i - 1])
           + cv * (v[i + 1] - 2 * v[i] + v[i - 1]);
    }
    for (let i = 1; i < NX - 1; i++) {
      v[i] += a[i] * DT_SUB;
      u[i] += v[i] * DT_SUB;
    }
  }

  _measure() {
    const u = this.u;

    // Robust spatial peak: grid max of |u|, refined by a parabola through the
    // three points around it (the antinode need not sit on a grid point).
    let im = 1, best = 0;
    for (let i = 1; i < NX - 1; i++) {
      const m = Math.abs(u[i]);
      if (m > best) { best = m; im = i; }
    }
    let peak = best;
    const ym = u[im - 1], y0 = u[im], yp = u[im + 1];
    const den = ym - 2 * y0 + yp;
    if (Math.abs(den) > 0) {
      const d = (ym - yp) / (2 * den);
      if (Math.abs(d) <= 1) peak = Math.abs(y0 - 0.25 * (ym - yp) * d);
    }

    // Spatial mean of |u|: trapezoid with sign-change intervals split at the
    // interpolated zero (kinks of |u| cost nothing — u'' ≈ 0 at a node), then
    // Richardson-extrapolated against an every-other-point pass to cancel the
    // O(dx²) curvature bias (which grows like n² and would cap mode 5 at ~2e-3).
    let meanF = 0;
    for (let i = 0; i < NX - 1; i++) {
      const a = u[i], c = u[i + 1];
      if (a * c >= 0) meanF += Math.abs(a + c) / 2;
      else meanF += (a * a + c * c) / (2 * (Math.abs(a) + Math.abs(c)));
    }
    meanF *= DX;
    let meanC = 0;
    for (let i = 0; i < NX - 1; i += 2) {
      const a = u[i], c = u[i + 2];
      if (a * c >= 0) meanC += Math.abs(a + c) / 2;
      else meanC += (a * a + c * c) / (2 * (Math.abs(a) + Math.abs(c)));
    }
    meanC *= 2 * DX;
    const mean = (4 * meanF - meanC) / 3;

    // Amplitude-weighted running ratio: both accumulators scale with the
    // instantaneous amplitude, so the moments where the whole string passes
    // through zero contribute ~zero weight instead of noise.
    const decay = Math.exp(-MEAS_DT / TAU_EST);
    this.accPeak = this.accPeak * decay + peak * MEAS_DT;
    this.accMean = this.accMean * decay + mean * MEAS_DT;
    if (this.accMean > 0) this.piHat = 2 * this.accPeak / this.accMean;

    this.envPeak = Math.max(peak, this.envPeak * Math.exp(-MEAS_DT / TAU_ENV));

    // Settled when the fast estimate stops drifting against a slow EMA.
    this.piSlow += (this.piHat - this.piSlow) * (MEAS_DT / TAU_SLOW);
    if (!this.stabilized && this.tBoard > 4 && Math.abs(this.piHat - this.piSlow) < 0.004) {
      this.stabilized = true;
      this._justStabilized = true;
    }

    // Zero-crossing census only while the string is visibly displaced.
    if (peak > 0.3 * this.envPeak) this._detectNodes(0.08 * peak);

    // Very long runs at high damping: rescale before amplitudes go denormal.
    if (this.envPeak > 0 && this.envPeak < 1e-150) {
      for (let i = 0; i < NX; i++) { this.u[i] *= 1e150; this.v[i] *= 1e150; }
      this.accPeak *= 1e150;
      this.accMean *= 1e150;
      this.envPeak *= 1e150;
    }
  }

  // Hysteresis crossing counter: track the sign of samples with |u| above the
  // threshold; each flip brackets one raw zero crossing, interpolated for the
  // node markers. Fixed ends are never "significant", so only interior nodes count.
  _detectNodes(thr) {
    const u = this.u;
    const xs = [];
    let sign = 0, lastIdx = 0;
    for (let i = 1; i < NX - 1; i++) {
      const val = u[i];
      const s = val > thr ? 1 : (val < -thr ? -1 : 0);
      if (s === 0) continue;
      if (sign !== 0 && s !== sign) {
        for (let j = lastIdx; j < i; j++) {
          if (u[j] * u[j + 1] <= 0) {
            const d = u[j] - u[j + 1];
            xs.push((j + (Math.abs(d) > 0 ? u[j] / d : 0.5)) * DX);
            break;
          }
        }
      }
      sign = s;
      lastIdx = i;
    }
    this.nodeXs = xs;
    this.collisionCount = xs.length + 1;   // half-waves = interior nodes + 1
  }

  getCountLabel() {
    return 'Half-waves (nodes + 1)';
  }

  getPiApproximation() {
    return this.piHat;
  }

  getPiReadout() {
    return this.piHat > 0 ? this.piHat.toFixed(6) : 'settling…';
  }

  getFormulaHTML() {
    const n = this.mode;
    const nodes = this.nodeXs.length;
    const ok = nodes === n - 1;
    return `
      <strong>eigenmode shape</strong>:
      a half-sine lobe has <span class="f-angle">mean|u| = (2/π)·peak</span> — invert it:<br>
      <span class="f-result">π</span> ≈ 2·<span class="f-angle">Â_peak</span> / <span class="f-angle">mean|u(x)|</span>
      &nbsp;<span style="font-size:1.1em">π = ${piDigitsHTML(this.piHat, 4)}</span><br>
      <span class="f-count">zero-crossing check: ${nodes} interior node(s) measured — mode ${n} ⇒ expect ${n - 1} ${ok ? '✓' : '(transient)'}</span>
      <br><span class="f-muted">no wavenumber is set anywhere: the string is integrated as u_tt = c²u_xx from a π-free parabolic pluck. The fixed ends force the sine shape, and π is read off that emergent shape.</span>
    `;
  }

  getPhasePoint() {
    const t = Math.max(this.tBoard, 0.05);
    const x = Math.min(1, Math.max(-1, (Math.log10(t) + 1.3) / 4.3 * 2 - 1));
    const y = Math.min(1, Math.max(-1, (this.piHat - Math.PI) / Math.PI * 20));
    return [x, y];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -0.06, x1: 1.06, y0: -0.42, y1: 0.42 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.08, 1.08, 0.55, -0.55, 0.1, 10);
    this.simCamera.position.z = 1;

    // Rest line + end posts.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
    ));
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.42, 0), new THREE.Vector3(0, 0.42, 0),
        new THREE.Vector3(1, -0.42, 0), new THREE.Vector3(1, 0.42, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
    ));

    // Afterimage: a short rolling trail of the string's recent shapes, each a
    // faded cyan ghost, so the oscillation leaves a motion-blur streak. Added
    // before the live string so the bright current shape renders on top.
    this.ghosts = [];
    this._ghostIdx = 0;
    for (let g = 0; g < 12; g++) {
      const gp = new Float32Array(NX * 3);
      for (let i = 0; i < NX; i++) gp[i * 3] = i * DX;
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      const gm = new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0 });
      this.simScene.add(new THREE.Line(gg, gm));
      this.ghosts.push({ geom: gg, mat: gm });
    }

    // The live simulated string.
    const wavePos = new Float32Array(NX * 3);
    for (let i = 0; i < NX; i++) wavePos[i * 3] = i * DX;
    this.waveGeom = new THREE.BufferGeometry();
    this.waveGeom.setAttribute('position', new THREE.BufferAttribute(wavePos, 3));
    this.simScene.add(new THREE.Line(
      this.waveGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0 })
    ));

    // Analytic-mode envelope ghost, DISPLAY ONLY: faded in after the estimate
    // stabilizes so the eye can compare the relaxed string to ±sin(nπx).
    this.envMat = new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0 });
    for (const sgn of [1, -1]) {
      const pts = [];
      for (let i = 0; i < NX; i++) {
        const x = i * DX;
        pts.push(new THREE.Vector3(x, sgn * AMP_Y * Math.sin(this.mode * Math.PI * x), 0));
      }
      this.simScene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts), this.envMat
      ));
    }

    // Pooled node markers at detected zero crossings.
    const markPos = new Float32Array(MAX_MARKERS * 2 * 3);
    for (let k = 0; k < MAX_MARKERS * 2; k++) { markPos[k * 3] = -10; markPos[k * 3 + 2] = 0.01; }
    this.markGeom = new THREE.BufferGeometry();
    this.markGeom.setAttribute('position', new THREE.BufferAttribute(markPos, 3));
    this.simScene.add(new THREE.LineSegments(
      this.markGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.85 })
    ));
  }

  updateSimScene() {
    if (!this.waveGeom) return;
    const yScale = AMP_Y / Math.max(this.envPeak, 1e-300);
    const pos = this.waveGeom.attributes.position.array;
    for (let i = 0; i < NX; i++) pos[i * 3 + 1] = this.u[i] * yScale;
    this.waveGeom.attributes.position.needsUpdate = true;

    // Advance the afterimage: fade every ghost, then stamp the current shape into
    // the next slot at full ghost opacity (a rolling ~10-frame motion-blur trail).
    if (this.ghosts) {
      for (const g of this.ghosts) g.mat.opacity *= 0.82;
      const gpos = this.ghosts[this._ghostIdx].geom.attributes.position.array;
      for (let i = 0; i < NX; i++) gpos[i * 3 + 1] = pos[i * 3 + 1];
      this.ghosts[this._ghostIdx].geom.attributes.position.needsUpdate = true;
      this.ghosts[this._ghostIdx].mat.opacity = 0.4;
      this._ghostIdx = (this._ghostIdx + 1) % this.ghosts.length;
    }

    const mark = this.markGeom.attributes.position.array;
    for (let k = 0; k < MAX_MARKERS; k++) {
      const x = k < this.nodeXs.length ? this.nodeXs[k] : -10;
      mark[k * 6] = x;     mark[k * 6 + 1] = -0.05;
      mark[k * 6 + 3] = x; mark[k * 6 + 4] = 0.05;
    }
    this.markGeom.attributes.position.needsUpdate = true;

    const target = this.stabilized ? 0.4 : 0;
    this.envFade += (target - this.envFade) * 0.04;
    this.envMat.opacity = this.envFade;
  }
}

registerSim(StandingWaveNodePi);
