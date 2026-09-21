import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so rescale (GaltonBoardPi pattern) so the terms/s slider is wall-clock-ish
// at speed 1 / 60 fps.
const TIME_SCALE = 16.7;
const TURBO_RATE = 400;     // terms per second in turbo mode (~x130 the default)
const WINDOW = 240;         // recent partial sums shown in the convergence chart

// Convergence chart (top) and number line (bottom) layout.
const CHART_X0 = -0.92, CHART_X1 = 0.92;
const CHART_MID = 0.22;     // y of the pi line
const CHART_HALF = 0.66;    // half-height of the chart
const LINE_Y = -0.80;       // number-line y
const LINE_V0 = 0, LINE_V1 = 4.3;

const GOLD = 0xf7c948, GREEN = 0x7cfc8a, CYAN = 0x4cc9f0, RED = 0xe94560;

export class LeibnizWalk extends Simulation {
  static id = 'leibniz-walk';
  static title = 'Leibniz Walk';
  static description = 'Particle stepping ±4/(2k+1) — partial sums oscillate inside a shrinking envelope around π; Euler averaging reads them faster';
  static piMechanism = 'series partial sum: 4 (1 - 1/3 + 1/5 - ...) = π; Euler averaging accelerates the same series';
  static rigor = 'Exact';
  static sortOrder = 73;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 70;
  static alternatives = [{ id: 'ramanujan-pi', label: 'The 8-digits-per-term engine' }];
  static explanation = {
    setup: 'A particle starts at 0 on the number line below. At step k = 0, 1, 2, …, it takes a signed step of size 4/(2k+1), alternating sign. The chart above plots the recent positions — the partial sums 4·S_k — against a fixed π line.',
    insight: 'An alternating series with shrinking terms BRACKETS its limit: each partial sum overshoots π, the next undershoots it, and the truncation error is smaller than the first omitted term. That bound, π ± 4/(2k+3), is drawn as the two envelope curves — the gold zigzag is trapped between them, and they pinch onto π only at rate ~1/k. The chart auto-zooms to the envelope so you can watch this at any scale: the picture never changes, which IS the slowness.',
    contrast: 'Slow is not the same as wrong. Averaging two consecutive partial sums, (S_k + S_{k+1})/2, cancels the leading oscillation; averaging the averages cancels the next error term, and so on. Four levels of pairwise averaging (weights 1,4,6,4,1 over the last five sums — the Euler transform) turn ~1/k convergence into ~1/k⁵: about 40 terms of the very same series already give π to 7+ digits, while the raw sum is still wrong in the second decimal.',
    formula: 'π = 4 ∑_{k=0}^{∞} (-1)^k/(2k+1),  |π − 4·S_k| < 4/(2k+3),  A_{j+1,k} = (A_{j,k} + A_{j,k+1})/2',
    getExpected: () => 'Raw: ~2 digits after 100 terms, ~4 digits after 10 000 — the envelope width 4/(2k+3) is the whole story. Euler-averaged (4 levels): ~6 digits by 20 terms, ~7–8 digits by 40 terms. Same series, smarter reading.'
  };

  constructor(params = {}) {
    super(params);
    this.termRate = params.termRate || 3;
    this.turbo = false;
    this.euler = true;
    this.reset();
  }

  reset() {
    super.reset();
    this.k = 0;
    this.position = 0;
    this.prevPosition = 0;
    this.collisionCount = 0;
    this.termCarry = 0;
    this.nextPhaseK = 1;
    this.accelValue = NaN;
    this.last5Count = 0;
    if (!this.last5) {
      this.last5 = new Float64Array(5);
      this.winRaw = new Float64Array(WINDOW);
      this.winAccel = new Float64Array(WINDOW);
    }
    this.winHead = 0;
    this.winCount = 0;
    this.lastPhasePoint = [-1, -1];
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'termRate', label: 'Terms / second', min: 0.5, max: 12, step: 0.5, default: this.termRate, highlight: true,
        onChange: (val) => { this.termRate = val; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×~130 (statistics only)', default: this.turbo },
      { type: 'toggle', id: 'euler', label: 'Euler acceleration (averaged overlay)', default: this.euler },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'k-vs-pos', label: 'step k vs partial sum (line = π)', dimension: 2, primary: true,
        axisLabels: { x: 'log(1 + k)', y: 'partial sum' } }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    this.termCarry += (this.turbo ? TURBO_RATE : this.termRate) * t;
    let m = Math.min(Math.floor(this.termCarry), 256);
    this.termCarry -= m;
    const changed = m > 0;
    for (; m > 0; m--) this._addTerm();
    return changed;
  }

  _addTerm() {
    this.prevPosition = this.position;
    this.position += 4 * ((this.k % 2 === 0) ? 1 : -1) / (2 * this.k + 1);
    this.k++;
    this.collisionCount = this.k;

    // Euler acceleration: 4 levels of pairwise averaging over the last five
    // partial sums collapse to binomial weights (1,4,6,4,1)/16.
    const l5 = this.last5;
    l5[0] = l5[1]; l5[1] = l5[2]; l5[2] = l5[3]; l5[3] = l5[4]; l5[4] = this.position;
    if (this.last5Count < 5) this.last5Count++;
    this.accelValue = this.last5Count >= 5
      ? (l5[0] + 4 * l5[1] + 6 * l5[2] + 4 * l5[3] + l5[4]) / 16
      : NaN;

    this.winRaw[this.winHead] = this.position;
    this.winAccel[this.winHead] = this.accelValue;
    this.winHead = (this.winHead + 1) % WINDOW;
    if (this.winCount < WINDOW) this.winCount++;

    // One phase point per ~1% growth in k keeps the log-x trail readable in turbo.
    if (this.k >= this.nextPhaseK) {
      this.lastPhasePoint = [
        Math.min(1, Math.log(1 + this.k) / Math.log(1 + 5000)) * 2 - 1,
        Math.max(-1, Math.min(1, (this.position - 3) * 0.8))
      ];
      this.pendingPhasePoints.push([...this.lastPhasePoint]);
      this.nextPhaseK = Math.max(this.k + 1, Math.ceil(this.k * 1.01));
    }
  }

  getCountLabel() {
    return 'Series terms';
  }

  getPiApproximation() {
    if (this.euler && this.last5Count >= 5) return this.accelValue;
    return this.position;
  }

  getPiReadout() {
    return this.k > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const k = this.k;
    const env = k > 0 ? 4 / (2 * k + 1) : 4;
    const raw = k > 0 ? piDigitsHTML(this.position, 6) : '—';
    const acc = this.last5Count >= 5 ? piDigitsHTML(this.accelValue, 10) : 'needs 5 terms…';
    return `
      <strong>Leibniz partial sum</strong>:
      <span class="f-angle">π = 4 (1 − 1/3 + 1/5 − …)</span><br>
      raw, after <span class="f-count">${k}</span> term(s):
      <span style="font-size:1.05em">${raw}</span>
      <span class="f-muted">(envelope = ±next term 4/${2 * k + 1} ≈ ±${env.toFixed(6)})</span><br>
      ${this.euler
        ? `Euler-averaged ×4 levels: <span style="font-size:1.05em">${acc}</span><br>`
        : ''}
      <span class="f-muted">same series, smarter reading: Leibniz is slow, not wrong.</span>
    `;
  }

  getPhasePoint() { return [...this.lastPhasePoint]; }
  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() {
    return { x0: -1.05, x1: 1.05, y0: -1.06, y1: 1.06 };
  }

  _lineX(v) {
    const c = Math.max(LINE_V0, Math.min(LINE_V1, v));
    return CHART_X0 + (c - LINE_V0) / (LINE_V1 - LINE_V0) * (CHART_X1 - CHART_X0);
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.05, 1.05, 1.06, -1.06, 0.1, 10);
    this.simCamera.position.z = 1;

    // --- convergence chart (top) ---
    // Frame
    const fx0 = CHART_X0 - 0.02, fx1 = CHART_X1 + 0.02;
    const fy0 = CHART_MID - CHART_HALF - 0.04, fy1 = CHART_MID + CHART_HALF + 0.04;
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(fx0, fy0, 0), new THREE.Vector3(fx1, fy0, 0),
        new THREE.Vector3(fx1, fy1, 0), new THREE.Vector3(fx0, fy1, 0),
        new THREE.Vector3(fx0, fy0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })
    ));

    // pi line
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(CHART_X0, CHART_MID, 0), new THREE.Vector3(CHART_X1, CHART_MID, 0)
      ]),
      new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85 })
    ));

    // Envelope curves pi ± 4/(2k+3), preallocated
    const mkTrail = (color, opacity) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WINDOW * 3), 3));
      geom.setDrawRange(0, 0);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      this.simScene.add(line);
      return { geom, line };
    };
    this.envUpper = mkTrail(0x7c83fd, 0.6);
    this.envLower = mkTrail(0x7c83fd, 0.6);
    this.rawTrail = mkTrail(GOLD, 0.9);
    this.accTrail = mkTrail(GREEN, 0.95);

    // Current markers
    this.rawDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 20),
      new THREE.MeshBasicMaterial({ color: RED })
    );
    this.rawDot.visible = false;
    this.simScene.add(this.rawDot);
    this.accDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 20),
      new THREE.MeshBasicMaterial({ color: GREEN })
    );
    this.accDot.visible = false;
    this.simScene.add(this.accDot);

    // --- number line (bottom): the original walk ---
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(CHART_X0 - 0.02, LINE_Y, 0), new THREE.Vector3(CHART_X1 + 0.02, LINE_Y, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    ));
    const tickPts = [];
    for (let i = 0; i <= 4; i++) {
      const x = this._lineX(i);
      tickPts.push(new THREE.Vector3(x, LINE_Y - 0.04, 0), new THREE.Vector3(x, LINE_Y + 0.04, 0));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPts),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })
    ));
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(this._lineX(Math.PI), LINE_Y - 0.09, 0),
        new THREE.Vector3(this._lineX(Math.PI), LINE_Y + 0.09, 0)
      ]),
      new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85 })
    ));

    // Last-step segment (prev -> current), preallocated 2-point line
    this.stepGeom = new THREE.BufferGeometry();
    this.stepGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.stepGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(
      this.stepGeom,
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 })
    ));

    // Walker dot + accelerated-estimate tick under the axis
    this.walker = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 24),
      new THREE.MeshBasicMaterial({ color: RED })
    );
    this.walker.position.set(this._lineX(0), LINE_Y, 0.02);
    this.simScene.add(this.walker);

    this.accTickGeom = new THREE.BufferGeometry();
    this.accTickGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.accTickGeom.setDrawRange(0, 0);
    this.accTick = new THREE.Line(
      this.accTickGeom,
      new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 })
    );
    this.simScene.add(this.accTick);
  }

  updateSimScene() {
    if (!this.rawTrail) return;
    const n = this.winCount;
    const width = CHART_X1 - CHART_X0;
    const oldestN = this.k - n + 1;

    // Auto-zoom: fit the envelope at the oldest visible term, so the
    // bracketing oscillation stays visible at every scale.
    const halfRange = Math.max(4 / (2 * Math.max(1, oldestN) + 1) * 1.2, 1e-12);
    const yOf = (v) => {
      const off = Math.max(-1, Math.min(1, (v - Math.PI) / halfRange));
      return CHART_MID + off * CHART_HALF;
    };

    const rawArr = this.rawTrail.geom.attributes.position.array;
    const upArr = this.envUpper.geom.attributes.position.array;
    const loArr = this.envLower.geom.attributes.position.array;
    const accArr = this.accTrail.geom.attributes.position.array;
    const iAccStart = Math.max(0, 5 - oldestN);   // accel defined from term 5 on
    let accCount = 0;

    for (let i = 0; i < n; i++) {
      const idx = (this.winHead - n + i + WINDOW) % WINDOW;
      const termN = oldestN + i;
      const x = CHART_X0 + (i / (WINDOW - 1)) * width;
      const env = 4 / (2 * termN + 1);

      rawArr[i * 3] = x; rawArr[i * 3 + 1] = yOf(this.winRaw[idx]); rawArr[i * 3 + 2] = 0.01;
      upArr[i * 3] = x; upArr[i * 3 + 1] = yOf(Math.PI + env); upArr[i * 3 + 2] = 0;
      loArr[i * 3] = x; loArr[i * 3 + 1] = yOf(Math.PI - env); loArr[i * 3 + 2] = 0;

      if (this.euler && i >= iAccStart) {
        accArr[accCount * 3] = x;
        accArr[accCount * 3 + 1] = yOf(this.winAccel[idx]);
        accArr[accCount * 3 + 2] = 0.02;
        accCount++;
      }
    }
    for (const t of [this.rawTrail, this.envUpper, this.envLower]) {
      t.geom.attributes.position.needsUpdate = true;
      t.geom.setDrawRange(0, n);
    }
    this.accTrail.geom.attributes.position.needsUpdate = true;
    this.accTrail.geom.setDrawRange(0, accCount);
    this.accTrail.line.visible = this.euler && accCount >= 2;

    const xNew = CHART_X0 + (Math.max(0, n - 1) / (WINDOW - 1)) * width;
    this.rawDot.visible = n > 0;
    if (n > 0) this.rawDot.position.set(xNew, yOf(this.position), 0.03);
    const accOK = this.euler && this.last5Count >= 5;
    this.accDot.visible = accOK;
    if (accOK) this.accDot.position.set(xNew, yOf(this.accelValue), 0.04);

    // Number line: walker, last step, accelerated tick
    this.walker.position.set(this._lineX(this.position), LINE_Y, 0.02);
    const sArr = this.stepGeom.attributes.position.array;
    sArr[0] = this._lineX(this.prevPosition); sArr[1] = LINE_Y + 0.055; sArr[2] = 0.01;
    sArr[3] = this._lineX(this.position); sArr[4] = LINE_Y + 0.055; sArr[5] = 0.01;
    this.stepGeom.attributes.position.needsUpdate = true;
    this.stepGeom.setDrawRange(0, this.k > 0 ? 2 : 0);

    const aArr = this.accTickGeom.attributes.position.array;
    if (accOK) {
      const ax = this._lineX(this.accelValue);
      aArr[0] = ax; aArr[1] = LINE_Y - 0.035; aArr[2] = 0.01;
      aArr[3] = ax; aArr[4] = LINE_Y - 0.11; aArr[5] = 0.01;
      this.accTickGeom.attributes.position.needsUpdate = true;
    }
    this.accTickGeom.setDrawRange(0, accOK ? 2 : 0);
  }
}

registerSim(LeibnizWalk);
