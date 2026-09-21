// js/sims/MandelbrotPi.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// Same wall-clock rescale as GaltonBoardPi: main.js advances 1e-4 sim-seconds
// per step(), ~speed*10 steps/frame, so rate iterations/board-second reads as
// roughly rate iterations/wall-second at speed 1.
const TIME_SCALE = 16.7;
const HARD_CAP = 5e6;        // per-step iteration bound — no pathological hangs
const TRAIL_CAP = 600;
// Backdrop view rectangle (complex plane).
const RE0 = -2.1, RE1 = 0.9, IM0 = -1.25, IM1 = 1.25;

export class MandelbrotPi extends Simulation {
  static id = 'mandelbrot-pi';
  static title = 'Mandelbrot π — the neck at −3/4';
  static description = 'Iterate z²+c just off the Mandelbrot neck: the escape count reads off π';
  static piMechanism = 'exact asymptotic: c = −3/4 + iε → escape iterations × ε → π';
  static rigor = 'Exact Asymptotic';
  static sortOrder = 57;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 200;
  static alternatives = [{ id: 'logistic-chaos-pi', label: 'Its real-axis cousin' }];
  static explanation = {
    setup: 'The Mandelbrot set pinches to a single point at c = −3/4, where the main cardioid touches the period-2 bulb. Step just off that neck to c = −3/4 + iε and iterate z ← z² + c from z = 0: the orbit is no longer trapped, but it takes a long time to leave.',
    insight: 'The orbit gets squeezed through the neck corridor, bouncing between the two lobes near z ≈ −1/2 while precessing by a tiny angle each pass — a damped-pendulum crawl past a saddle point. The total turning to get through is π, so the passage time is N ≈ π/ε. This is the same π that governs passage times at every period-doubling pinch.',
    contrast: 'A completely different domain from collisions, wedges, and statistics: pure deterministic complex dynamics, no randomness and no geometry of circles in sight. Honest caveat: at finite ε the count N overshoots π/ε slightly, so N·ε is biased high by O(ε) — the bias vanishes as ε → 0.',
    formula: 'π ≈ N(ε) · ε,  c = −3/4 + iε  [EXACT ASYMPTOTIC]',
    getExpected: (params) => {
      const n = Math.min(params.n || 2, 4);   // keep the preview computation instant
      const eps = Math.pow(10, -n);
      let zr = 0, zi = 0, N = 0;
      while (zr * zr + zi * zi <= 4 && N < 1e6) {
        const nr = zr * zr - zi * zi - 0.75;
        zi = 2 * zr * zi + eps;
        zr = nr;
        N++;
      }
      return `For ε = 10^−${n}: the orbit escapes after N = ${N} iterations, so N·ε = ${(N * eps).toFixed(6)} — above π by ${(N * eps - Math.PI).toExponential(2)}, the expected O(ε) overshoot.`;
    }
  };

  constructor(params = {}) {
    super(params);
    // Default preset converges to 4 digits (n=4 -> 31417 iterations -> 3.1417)
    // in a couple of seconds at the default rate; drop n/rate to watch the
    // orbit crawl through the neck iteration by iteration.
    this.n = params.n || 4;
    this.rate = params.rate || 20000;
    this.trailRe = new Float32Array(TRAIL_CAP);
    this.trailIm = new Float32Array(TRAIL_CAP);
    this.reset();
  }

  reset() {
    super.reset();
    this.eps = Math.pow(10, -this.n);
    this.cr = -0.75;
    this.ci = this.eps;
    this.zr = 0;
    this.zi = 0;
    this.iterations = 0;
    this.collisionCount = 0;
    this.iterCarry = 0;
    this.finished = false;
    // ~314 phase points per full run regardless of n.
    this.phaseEvery = Math.max(1, Math.round(Math.pow(10, this.n) / 100));
    this.trailLen = 0;
    this.trailHead = 0;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'n', label: 'Offset ε = 10⁻ⁿ', min: 1, max: 5, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'rate', label: 'Iterations/s', min: 10, max: 100000, step: 10, default: this.rate,
        onChange: (val) => { this.rate = val; }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{
      id: 'orbit', label: 'Orbit in the z-plane', dimension: 2,
      primary: true, boundary: 'none',
      axisLabels: { x: 'Re z', y: 'Im z' }
    }];
  }

  step(dt) {
    if (this.finished) return false;
    this.iterCarry += this.rate * dt * TIME_SCALE;
    let K = Math.min(Math.floor(this.iterCarry), HARD_CAP);
    this.iterCarry -= K;
    if (this.iterCarry > HARD_CAP) this.iterCarry = HARD_CAP;

    let event = false;
    while (K-- > 0) {
      const zr = this.zr, zi = this.zi;
      const nr = zr * zr - zi * zi + this.cr;
      this.zi = 2 * zr * zi + this.ci;
      this.zr = nr;
      this.iterations++;
      this.trailRe[this.trailHead] = this.zr;
      this.trailIm[this.trailHead] = this.zi;
      this.trailHead = (this.trailHead + 1) % TRAIL_CAP;
      if (this.trailLen < TRAIL_CAP) this.trailLen++;
      const escaped = this.zr * this.zr + this.zi * this.zi > 4;
      if (escaped || this.iterations % this.phaseEvery === 0) {
        this.pendingPhasePoints.push([this.zr / 2, this.zi / 2]);
        event = true;
      }
      if (escaped) { this.finished = true; break; }
    }
    this.collisionCount = this.iterations;
    return event;
  }

  getCountLabel() { return 'Iterations'; }

  getPiApproximation() { return this.iterations * this.eps; }

  getPiReadout() { return (this.iterations * this.eps).toFixed(6); }

  getFormulaHTML() {
    const N = this.iterations;
    const prod = N * this.eps;
    const live = this.finished
      ? piDigitsHTML(prod, 4)
      : `${prod.toFixed(4)} <span class="f-muted">iterating…</span>`;
    return `
      <strong>neck passage</strong>:
      <span class="f-mass">c = −3/4 + iε</span>,
      <span class="f-angle">ε = 10^−${this.n}</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">N</span> · <span class="f-angle">ε</span>,
      &nbsp;N = <span class="f-count">${N}</span>${this.finished ? ' (escaped)' : ''}
      <br><span style="font-size:1.1em">N·ε = ${live}</span>
      <br><span class="f-muted">finite-ε bias: the count overshoots π by O(ε) — one extra digit of ε buys roughly one more digit of π.</span>
    `;
  }

  getPhasePoint() { return [this.zr / 2, this.zi / 2]; }

  getPhaseExtractor(viewId) { return (pt) => pt; }

  getPreviewBox() { return { x0: RE0, x1: RE1, y0: IM0, y1: IM1 }; }

  // --- Three.js rendering ---

  _backdropPoints() {
    if (this._backdrop) return this._backdrop;
    // ~220x180 grid, <=24 iterations each: non-escapers trace the bug silhouette.
    const pts = [];
    const NX = 220, NY = 180;
    for (let i = 0; i < NX; i++) {
      const cr = RE0 + (i + 0.5) / NX * (RE1 - RE0);
      for (let j = 0; j < NY; j++) {
        const ci = IM0 + (j + 0.5) / NY * (IM1 - IM0);
        let zr = 0, zi = 0, k = 0;
        while (k < 24 && zr * zr + zi * zi <= 4) {
          const nr = zr * zr - zi * zi + cr;
          zi = 2 * zr * zi + ci;
          zr = nr;
          k++;
        }
        if (k === 24) pts.push(new THREE.Vector3(cr, ci, -0.02));
      }
    }
    this._backdrop = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.PointsMaterial({ color: 0x2a2a4a, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8 })
    );
    return this._backdrop;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(RE0, RE1, IM1, IM0, 0.1, 10);
    this.simCamera.position.z = 1;

    this.simScene.add(this._backdropPoints());

    // |z| = 2 escape circle.
    const circPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * 2 * Math.PI;
      circPts.push(new THREE.Vector3(2 * Math.cos(a), 2 * Math.sin(a), -0.01));
    }
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(circPts),
      new THREE.LineBasicMaterial({ color: 0x3a3a5c, transparent: true, opacity: 0.5 })));

    // Gold marker at c (in the neck, eps above the axis) with a pulsing ring.
    this.cMarker = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.cMarker.position.set(this.cr, this.ci, 0.03);
    this.simScene.add(this.cMarker);
    this.cRing = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.045, 32),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    this.cRing.position.set(this.cr, this.ci, 0.03);
    this.simScene.add(this.cRing);

    // Orbit trail: preallocated line buffer, vertex colors fade old -> new.
    this.trailGeom = new THREE.BufferGeometry();
    this.trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_CAP * 3), 3));
    this.trailGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_CAP * 3), 3));
    this.trailGeom.setDrawRange(0, 0);
    this.trailLine = new THREE.Line(this.trailGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.trailLine.position.z = 0.01;
    this.simScene.add(this.trailLine);

    // Current z.
    this.zDot = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }));
    this.zDot.position.z = 0.04;
    this.simScene.add(this.zDot);
  }

  updateSimScene() {
    if (!this.zDot) return;
    this.zDot.position.set(this.zr, this.zi, 0.04);

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
    const s = 1 + 0.5 * pulse;
    this.cRing.scale.set(s, s, 1);
    this.cRing.material.opacity = 0.25 + 0.45 * (1 - pulse);

    const pos = this.trailGeom.attributes.position.array;
    const col = this.trailGeom.attributes.color.array;
    const len = this.trailLen;
    const start = (this.trailHead - len + TRAIL_CAP) % TRAIL_CAP;
    for (let i = 0; i < len; i++) {
      const k = (start + i) % TRAIL_CAP;
      pos[i * 3] = this.trailRe[k];
      pos[i * 3 + 1] = this.trailIm[k];
      pos[i * 3 + 2] = 0;
      const t = len > 1 ? i / (len - 1) : 1;       // 0 oldest -> 1 newest
      const b = 0.06 + 0.94 * t;
      col[i * 3] = 0.298 * b;                       // fades cyan 0x4cc9f0
      col[i * 3 + 1] = 0.788 * b;
      col[i * 3 + 2] = 0.941 * b;
    }
    this.trailGeom.setDrawRange(0, this.showTrail ? len : 0);
    this.trailGeom.attributes.position.needsUpdate = true;
    this.trailGeom.attributes.color.needsUpdate = true;
  }
}

registerSim(MandelbrotPi);
