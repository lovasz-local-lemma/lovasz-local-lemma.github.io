import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame.
// TIME_SCALE makes one board-second ≈ one wall-clock second at speed 1 / 60 fps.
const TIME_SCALE = 16.7;
const TURBO_PAIRS = 2000;   // factor pairs per board-second in turbo mode

const RECT_CX = -0.55;      // centre of the sculpted rectangle
const RECT_S = 1.1;         // sqrt(displayed area) — the rectangle is drawn at constant area
const GHOST_RING = 14;      // pooled fading outlines of recent sculpt states
const TARGET = Math.PI / 2; // target aspect ratio

const PANEL_X0 = 0.42, PANEL_X1 = 1.36;   // convergence gauge bounds
const PANEL_Y0 = -0.78, PANEL_Y1 = 0.82;
const EST_LO = 2.55, EST_HI = 3.35;       // gauge value range for π estimates
const ENV_N = 96;                          // vertices per envelope curve
const HIST_CAP = 700;                      // milestone-thinned estimate samples

function smooth(t) { return t * t * (3 - 2 * t); }

function estY(v) {
  const f = Math.max(0, Math.min(1, (v - EST_LO) / (EST_HI - EST_LO)));
  return PANEL_Y0 + f * (PANEL_Y1 - PANEL_Y0);
}

export class WallisRectangle extends Simulation {
  static id = 'wallis-rectangle';
  static title = 'Wallis Rectangle';
  static description = 'A square sculpted by the Wallis product converges to the π/2 aspect — the 1655 formula a hydrogen-atom calculation rediscovered in 2015';
  static piMechanism = 'series partial product: ∏ (2k/(2k−1))·(2k/(2k+1)) = π/2';
  static rigor = 'Exact';
  static sortOrder = 75;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 6;
  static explanation = {
    setup: 'A unit square is sculpted by the Wallis factors, one at a time: factor 2k/(2k−1) stretches the width past the target, then factor 2k/(2k+1) stretches the height to pull it back. The rectangle is drawn at constant area so it stays in frame — its aspect ratio carries the running product, and it settles onto the dashed outline of aspect π/2.',
    insight: 'Wallis (1655): π/2 = (2/1)(2/3) · (4/3)(4/5) · (6/5)(6/7) ⋯ = ∏ (2k/(2k−1))·(2k/(2k+1)). Every odd-numbered factor overshoots π/2 and every even one undershoots, with the swing shrinking like 1/k. After k pairs the estimate 2·∏ sits at π(1 − 1/(4k) + …) — the purple O(1/k) corridor drawn in the gauge, which the measured curve rides exactly.',
    contrast: 'In 2015, 360 years after Wallis, Friedmann & Hagen found this formula hiding in quantum mechanics: a variational calculation of hydrogen-atom energy levels (Gaussian trial wavefunctions, orbital angular momentum ℓ → ∞) produced exactly the Wallis product — the first derivation of it from physics. The sim computes the honest classical product; the hydrogen story is the same arithmetic showing up in nature. No randomness anywhere: every factor is exact rational arithmetic.',
    formula: 'π/2 = ∏_{k=1}^{∞} (2k/(2k−1)) · (2k/(2k+1))   [exact; error after k pairs ≈ π/(4k)]',
    getExpected: () => 'Error after k pairs ≈ π/(4k): 100 pairs → ≈ 3.1337 (2 digits), 10 000 pairs → ≈ 3.14151 (4 digits). Convergence is O(1/k) — as slow as the Leibniz series — but each step is exact; only patience is required.'
  };

  constructor(params = {}) {
    super(params);
    this.rate = params.rate || 2.5;   // factors applied per board-second
    this.turbo = false;
    this.reset();
  }

  reset() {
    super.reset();
    this.m = 0;             // individual factors fully applied
    this.kPairs = 0;        // completed factor pairs
    this.logP = 0;          // log of product over all applied factors
    this.logPairProd = 0;   // log of product over completed pairs only
    this.phase = 0;         // lerp progress of the factor being applied
    this.turboCarry = 0;
    this.collisionCount = 0;
    this.history = [];      // [kPairs, πest] milestone samples for the gauge
    this.nextSample = 1;
    this.ghostAspects = []; // recently committed aspect ratios, oldest first
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'rate', label: 'Factors / s', min: 0.5, max: 20, step: 0.5, default: this.rate,
        highlight: true, onChange: (val) => { this.rate = val; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×2000 pairs/s (skip animation)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'convergence', label: 'log k vs relative error (line = π)', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 k (pairs)', y: '(π̂ − π)/π' } }
    ];
  }

  _pushGhost(aspect) {
    this.ghostAspects.push(aspect);
    if (this.ghostAspects.length > GHOST_RING) this.ghostAspects.shift();
  }

  _sample() {
    if (this.kPairs < this.nextSample) return;
    const est = 2 * Math.exp(this.logPairProd);
    this.history.push([this.kPairs, est]);
    if (this.history.length > HIST_CAP) this.history.shift();
    this.nextSample = Math.max(this.kPairs + 1, Math.ceil(this.kPairs * 1.03));
    this.pendingPhasePoints.push(this.getPhasePoint());
  }

  _commitFactor() {
    const m = this.m;
    const k = (m >> 1) + 1;
    const f = m % 2 === 0 ? (2 * k) / (2 * k - 1) : (2 * k) / (2 * k + 1);
    this.logP += Math.log(f);
    this.m++;
    this._pushGhost(Math.exp(this.logP));
    if (this.m % 2 === 0) {
      this.kPairs++;
      this.logPairProd = this.logP;
      this._sample();
    }
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let tick = false;

    if (this.turbo) {
      if (this.m % 2 === 1) { this._commitFactor(); tick = true; }
      this.phase = 0;
      this.ghostAspects.length = 0;   // animation skipped — no sculpt trail
      this.turboCarry += TURBO_PAIRS * t;
      let n = Math.floor(this.turboCarry);
      this.turboCarry -= n;
      if (n > 0) tick = true;
      for (; n > 0; n--) {
        const k = this.kPairs + 1;
        this.logP += Math.log((2 * k) / (2 * k - 1)) + Math.log((2 * k) / (2 * k + 1));
        this.m += 2;
        this.kPairs = k;
        this.logPairProd = this.logP;
        this._sample();
      }
    } else {
      this.phase += this.rate * t;
      while (this.phase >= 1) {
        this.phase -= 1;
        this._commitFactor();
        tick = true;
      }
    }

    this.collisionCount = this.kPairs;
    return tick;
  }

  getCountLabel() {
    return 'Factor pairs k';
  }

  getPiApproximation() {
    return 2 * Math.exp(this.logPairProd);
  }

  getPiReadout() {
    return this.kPairs > 0 ? this.getPiApproximation().toFixed(8) : 'sculpting…';
  }

  getFormulaHTML() {
    const k = this.kPairs;
    const prod = Math.exp(this.logPairProd);
    const live = k > 0 ? piDigitsHTML(2 * prod, 6) : 'sculpting…';
    return `
      <strong>Wallis product (1655)</strong>:
      <span class="f-angle">π/2 = ∏ (2k/(2k−1))·(2k/(2k+1))</span><br>
      k = <span class="f-count">${k}</span> pair${k === 1 ? '' : 's'},
      running product = <span class="f-count">${prod.toFixed(6)}</span><br>
      <span class="f-result">π</span> ≈ 2 · ∏ =
      <span style="font-size:1.1em">${live}</span>
      <br><span class="f-muted">error ≈ π/(4k) — O(1/k), Leibniz-slow: each extra digit costs ×10 more factors. In 2015 this same product fell out of a hydrogen-atom energy calculation (Friedmann–Hagen).</span>
    `;
  }

  getPhasePoint() {
    const k = Math.max(1, this.kPairs);
    const est = 2 * Math.exp(this.logPairProd);
    const x = Math.min(1, Math.log10(1 + k) / 6) * 2 - 1;
    const y = Math.max(-1, Math.min(1, (est - Math.PI) / Math.PI * 8));
    return [x, y];
  }

  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() {
    return { x0: -1.45, x1: 1.4, y0: -0.85, y1: 0.85 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.5, 1.5, 1.05, -1.05, 0.1, 10);
    this.simCamera.position.z = 1;

    const unitLoopGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0),
    ]);

    // Target ghost: dashed outline at aspect π/2 (same area as the live rectangle).
    const gw = RECT_S * Math.sqrt(TARGET), gh = RECT_S / Math.sqrt(TARGET);
    const ghost = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(RECT_CX - gw / 2, -gh / 2, 0.03), new THREE.Vector3(RECT_CX + gw / 2, -gh / 2, 0.03),
        new THREE.Vector3(RECT_CX + gw / 2, gh / 2, 0.03), new THREE.Vector3(RECT_CX - gw / 2, gh / 2, 0.03),
      ]),
      new THREE.LineDashedMaterial({ color: 0x4cc9f0, dashSize: 0.045, gapSize: 0.032, transparent: true, opacity: 0.9 })
    );
    ghost.computeLineDistances();
    this.simScene.add(ghost);

    // Pooled fading outlines of recent sculpt states.
    this.ghostLoops = [];
    for (let i = 0; i < GHOST_RING; i++) {
      const loop = new THREE.LineLoop(unitLoopGeom,
        new THREE.LineBasicMaterial({ color: 0x8d93c8, transparent: true, opacity: 0 }));
      loop.position.set(RECT_CX, 0, 0.004);
      loop.visible = false;
      this.simScene.add(loop);
      this.ghostLoops.push(loop);
    }

    // The sculpted rectangle: gold fill + outline, scaled each frame.
    this.rectMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.3 })
    );
    this.rectMesh.position.set(RECT_CX, 0, 0.01);
    this.simScene.add(this.rectMesh);

    this.rectOutline = new THREE.LineLoop(unitLoopGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95 }));
    this.rectOutline.position.set(RECT_CX, 0, 0.02);
    this.simScene.add(this.rectOutline);

    // Edge flashes: a width factor lights the vertical edges, a height factor the horizontals.
    this.flashWMat = new THREE.LineBasicMaterial({ color: 0xffe18d, transparent: true, opacity: 0 });
    this.flashW = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(-0.5, 0.5, 0),
        new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 0),
      ]), this.flashWMat);
    this.flashW.position.set(RECT_CX, 0, 0.025);
    this.simScene.add(this.flashW);

    this.flashHMat = new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0 });
    this.flashH = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
        new THREE.Vector3(-0.5, 0.5, 0), new THREE.Vector3(0.5, 0.5, 0),
      ]), this.flashHMat);
    this.flashH.position.set(RECT_CX, 0, 0.025);
    this.simScene.add(this.flashH);

    // ---- Convergence gauge panel ----
    this.simScene.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(PANEL_X0, PANEL_Y0, 0), new THREE.Vector3(PANEL_X1, PANEL_Y0, 0),
        new THREE.Vector3(PANEL_X1, PANEL_Y1, 0), new THREE.Vector3(PANEL_X0, PANEL_Y1, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
    ));

    const yPi = estY(Math.PI);
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(PANEL_X0, yPi, 0.002), new THREE.Vector3(PANEL_X1, yPi, 0.002),
      ]),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85 })
    ));

    // O(1/k) error band: π(1 − 1/(2k)) up to π, as a translucent strip.
    const bandIdx = [];
    for (let i = 0; i < ENV_N - 1; i++) {
      const a = i * 2;
      bandIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.bandGeom = new THREE.BufferGeometry();
    this.bandGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ENV_N * 2 * 3), 3));
    this.bandGeom.setIndex(bandIdx);
    this.simScene.add(new THREE.Mesh(this.bandGeom,
      new THREE.MeshBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })));

    // Predicted approach curve π(1 − 1/(4k)).
    this.predGeom = new THREE.BufferGeometry();
    this.predGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ENV_N * 3), 3));
    this.simScene.add(new THREE.Line(this.predGeom,
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.55 })));

    // Measured estimates 2·∏ over k (milestone-thinned).
    this.histGeom = new THREE.BufferGeometry();
    this.histGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HIST_CAP * 3), 3));
    this.histGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(this.histGeom,
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.95 })));

    this.marker = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 16),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.marker.visible = false;
    this.simScene.add(this.marker);
  }

  _panelX(k, L) {
    return PANEL_X0 + (Math.log10(1 + k) / L) * (PANEL_X1 - PANEL_X0);
  }

  updateSimScene() {
    if (!this.rectMesh) return;

    // Aspect with the in-flight factor lerped in log space.
    let aspect = Math.exp(this.logP);
    let flashW = 0, flashH = 0;
    if (!this.turbo && this.phase > 0) {
      const m = this.m, k = (m >> 1) + 1;
      const f = m % 2 === 0 ? (2 * k) / (2 * k - 1) : (2 * k) / (2 * k + 1);
      const p = Math.min(1, this.phase);
      aspect *= Math.exp(smooth(p) * Math.log(f));
      const pulse = Math.sin(Math.PI * p);
      if (m % 2 === 0) flashW = pulse; else flashH = pulse;
    }
    const w = RECT_S * Math.sqrt(aspect), h = RECT_S / Math.sqrt(aspect);
    this.rectMesh.scale.set(w, h, 1);
    this.rectOutline.scale.set(w, h, 1);
    this.flashW.scale.set(w, h, 1);
    this.flashH.scale.set(w, h, 1);
    this.flashWMat.opacity = flashW * 0.9;
    this.flashHMat.opacity = flashH * 0.9;

    // Fading sculpt trail, newest first.
    const g = this.ghostAspects;
    for (let i = 0; i < this.ghostLoops.length; i++) {
      const loop = this.ghostLoops[i];
      if (i < g.length) {
        const a = g[g.length - 1 - i];
        loop.scale.set(RECT_S * Math.sqrt(a), RECT_S / Math.sqrt(a), 1);
        loop.material.opacity = 0.34 * Math.pow(0.76, i);
        loop.visible = true;
      } else {
        loop.visible = false;
      }
    }

    // ---- Gauge: rescale x to log10(1+k) of the current max pair count ----
    const kMax = Math.max(50, this.kPairs);
    const L = Math.log10(1 + kMax);

    const band = this.bandGeom.attributes.position.array;
    const pred = this.predGeom.attributes.position.array;
    for (let i = 0; i < ENV_N; i++) {
      const frac = i / (ENV_N - 1);
      const x = PANEL_X0 + frac * (PANEL_X1 - PANEL_X0);
      const k = Math.max(0.3, Math.pow(10, frac * L) - 1);
      band[i * 6] = x;
      band[i * 6 + 1] = estY(Math.PI * (1 - 1 / (2 * k)));
      band[i * 6 + 2] = 0;
      band[i * 6 + 3] = x;
      band[i * 6 + 4] = estY(Math.PI);
      band[i * 6 + 5] = 0;
      pred[i * 3] = x;
      pred[i * 3 + 1] = estY(Math.PI * (1 - 1 / (4 * k)));
      pred[i * 3 + 2] = 0.005;
    }
    this.bandGeom.attributes.position.needsUpdate = true;
    this.predGeom.attributes.position.needsUpdate = true;

    const hist = this.histGeom.attributes.position.array;
    const n = this.history.length;
    for (let i = 0; i < n; i++) {
      hist[i * 3] = this._panelX(this.history[i][0], L);
      hist[i * 3 + 1] = estY(this.history[i][1]);
      hist[i * 3 + 2] = 0.01;
    }
    this.histGeom.attributes.position.needsUpdate = true;
    this.histGeom.setDrawRange(0, n);

    if (this.kPairs > 0) {
      this.marker.position.set(this._panelX(this.kPairs, L), estY(this.getPiApproximation()), 0.03);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }
  }
}

registerSim(WallisRectangle);
