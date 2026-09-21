import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so rescale (GaltonBoardPi pattern) so the slabs/s slider is wall-clock-ish
// at speed 1 / 60 fps.
const TIME_SCALE = 16.7;
const TURBO_RATE = 400;     // slabs per second in turbo mode (~x130 the default)
const WINDOW = 240;         // recent slabs shown in the convergence chart
const EDGES = 64;           // recent slab boundaries ticked on the strip

// Convergence chart (top) and log-gap slab strip (bottom) layout.
const CHART_X0 = -0.92, CHART_X1 = 0.92;
const CHART_MID = 0.22;     // y of the pi line
const CHART_HALF = 0.66;    // half-height of the chart
const STRIP_Y = -0.80;      // slab-strip y
const GAP_DECADES = 6;      // strip right edge = remaining gap shrunk by 10^6

const GOLD = 0xf7c948, GREEN = 0x7cfc8a, CYAN = 0x4cc9f0, RED = 0xe94560, PURPLE = 0x7c83fd;
const TARGET = Math.PI * Math.PI / 6;

export class BaselSumWalker extends Simulation {
  static id = 'basel-sum-walker';
  static title = 'Basel Sum Walker';
  static description = 'Stack 1/n² slabs — the tail bound 1/(N+1) < π²/6 − S_N < 1/N pins π between two curves; an Euler–Maclaurin correction reads 7 digits from 100 slabs';
  static piMechanism = 'series partial sum: ∑ 1/n² = π²/6, with the true tail bracket 1/(N+1) < π²/6 − S_N < 1/N and an Euler–Maclaurin tail estimate';
  static rigor = 'Exact';
  static sortOrder = 74;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 75;
  static alternatives = [
    { id: 'square-free-sieve', label: 'Same constant as a density' },
    { id: 'leibniz-walk', label: 'The other slow series' }
  ];
  static explanation = {
    setup: 'At step n = 1, 2, 3, …, a slab of height 1/n² is laid onto the strip below. The strip is log-scaled on the REMAINING gap π²/6 − S_N: each equal stride rightward means another factor of 10 closer to the limit, so the fill front keeps moving instead of smearing into an unreadable pile. The chart above tracks the π estimates against a fixed π line.',
    insight: 'The tail of the series is genuinely bracketed: comparing ∑_{n>N} 1/n² with the telescoping sums ∑ 1/(n(n+1)) = 1/(N+1) and ∑ 1/(n(n−1)) = 1/N gives 1/(N+1) < π²/6 − S_N < 1/N. So π is PINNED between √(6(S_N + 1/(N+1))) and √(6(S_N + 1/N)) — the two purple curves, squeezing onto π like 1/N². Meanwhile the raw gold estimate √(6·S_N) creeps up from below, lagging π by ≈ 3/(πN). The chart auto-zooms to that 1/N gap, so the picture barely changes at any scale — the constancy IS the slowness.',
    contrast: 'Despite the folklore, this series is NOT faster than Leibniz: both partial sums miss π by Θ(1/N) — Leibniz oscillates around it, Basel creeps up from under it. But the bracket suggests the fix: estimate the tail instead of ignoring it. The Euler–Maclaurin tail estimate 1/N − 1/(2N²) turns 1/N error into ~1/N³ — about 7 digits of π from just 100 slabs (green curve). And ζ(2) has another face on this site: in the square-free sieve, the very same constant appears as the density 6/π² of square-free integers.',
    formula: 'π²/6 = ∑_{n=1}^{∞} 1/n²,  1/(N+1) < π²/6 − S_N < 1/N,  π ≈ √(6(S_N + 1/N − 1/(2N²)))',
    getExpected: () => 'Raw: ~3 digits after 1 000 slabs (error ≈ 3/(πN) — same Θ(1/N) pace as Leibniz). The purple bracket pins π to ~1/N². Euler–Maclaurin corrected: ~7 digits by 100 slabs, ~10 by 1 000. Same series, smarter reading.'
  };

  constructor(params = {}) {
    super(params);
    this.slabRate = params.slabRate || 3;
    this.turbo = false;
    this.euler = true;
    this.reset();
  }

  reset() {
    super.reset();
    this.n = 0;
    this.sum = 0;
    this.prevSum = 0;
    this.collisionCount = 0;
    this.slabCarry = 0;
    this.nextPhaseN = 1;
    this.rawPi = NaN;
    this.loPi = NaN;
    this.hiPi = NaN;
    this.accPi = NaN;
    this.accSum = NaN;
    if (!this.winRaw) {
      this.winRaw = new Float64Array(WINDOW);
      this.winLo = new Float64Array(WINDOW);
      this.winHi = new Float64Array(WINDOW);
      this.winAcc = new Float64Array(WINDOW);
      this.edgeRing = new Float64Array(EDGES);
    }
    this.winHead = 0;
    this.winCount = 0;
    this.edgeHead = 0;
    this.edgeCount = 0;
    this.collisionEffects = [];
    this.lastPhasePoint = [-1, 0.78];
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'slabRate', label: 'Slabs / second', min: 0.5, max: 12, step: 0.5, default: this.slabRate, highlight: true,
        onChange: (val) => { this.slabRate = val; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×~130 (statistics speed)', default: this.turbo },
      { type: 'toggle', id: 'euler', label: 'Euler–Maclaurin correction (tail estimate)', default: this.euler },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'logn-vs-relerr', label: 'log₁₀ N vs log₁₀ relative error (slope −1 line)', dimension: 2, primary: true,
        axisLabels: { x: 'log₁₀ N (0 → 5)', y: 'log₁₀ (π−π̂)/π (0 → −6)' } }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    this.slabCarry += (this.turbo ? TURBO_RATE : this.slabRate) * t;
    let m = Math.min(Math.floor(this.slabCarry), 256);
    this.slabCarry -= m;
    const changed = m > 0;
    for (; m > 0; m--) this._addSlab();
    return changed;
  }

  _addSlab() {
    this.prevSum = this.sum;
    this.n++;
    const n = this.n;
    this.sum += 1 / (n * n);
    this.collisionCount = n;
    const s = this.sum;

    // Raw estimate, the TRUE tail bracket, and the Euler–Maclaurin correction.
    this.rawPi = Math.sqrt(6 * s);
    this.loPi = Math.sqrt(6 * (s + 1 / (n + 1)));
    this.hiPi = Math.sqrt(6 * (s + 1 / n));
    this.accSum = s + 1 / n - 1 / (2 * n * n);
    this.accPi = Math.sqrt(6 * this.accSum);

    this.winRaw[this.winHead] = this.rawPi;
    this.winLo[this.winHead] = this.loPi;
    this.winHi[this.winHead] = this.hiPi;
    this.winAcc[this.winHead] = this.accPi;
    this.winHead = (this.winHead + 1) % WINDOW;
    if (this.winCount < WINDOW) this.winCount++;

    this.edgeRing[this.edgeHead] = s;
    this.edgeHead = (this.edgeHead + 1) % EDGES;
    if (this.edgeCount < EDGES) this.edgeCount++;

    // One phase point per ~2% growth in N keeps the log-log trail readable in
    // turbo. Raw error decays like 1/N, so log-log gives a clean slope −1 line.
    if (n >= this.nextPhaseN) {
      const rel = Math.max((Math.PI - this.rawPi) / Math.PI, 1e-12);
      this.lastPhasePoint = [
        Math.min(1, Math.log10(n) / 5) * 2 - 1,
        Math.max(-1, Math.min(1, ((Math.log10(rel) + GAP_DECADES) / GAP_DECADES) * 2 - 1))
      ];
      this.pendingPhasePoints.push([...this.lastPhasePoint]);
      this.nextPhaseN = Math.max(n + 1, Math.ceil(n * 1.02));
    }

    // Audible tick per visible slab (turbo floods >3 per frame, muted by main.js).
    if (!this.turbo && this.collisionEffects.length < 24) {
      this.collisionEffects.push({ x: this._stripX(s), y: STRIP_Y, time: performance.now(), type: 'wall' });
    }
  }

  getCountLabel() {
    return 'Slabs placed';
  }

  getPiApproximation() {
    if (this.n === 0) return 0;
    return this.euler ? this.accPi : this.rawPi;
  }

  getPiReadout() {
    return this.n > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const n = this.n;
    if (n === 0) {
      return `<strong>Basel sum</strong>: <span class="f-angle">π²/6 = Σ 1/n²</span>`;
    }
    const raw = piDigitsHTML(this.rawPi, 6);
    const acc = piDigitsHTML(this.accPi, 10);
    return `
      <strong>Basel sum</strong>:
      <span class="f-angle">π²/6 = Σ 1/n², tail bracket 1/(N+1) < π²/6 − S_N < 1/N</span><br>
      raw √(6·S_N) after <span class="f-count">${n}</span> slab(s):
      <span style="font-size:1.05em">${raw}</span>
      <span class="f-muted">(π pinned in a bracket of width ≈ ${(this.hiPi - this.loPi).toExponential(1)})</span><br>
      ${this.euler
        ? `Euler–Maclaurin corrected (tail ≈ 1/N − 1/2N²): <span style="font-size:1.05em">${acc}</span><br>`
        : ''}
      <span class="f-muted">same series, smarter reading: estimate the tail instead of ignoring it.</span>
    `;
  }

  getPhasePoint() { return [...this.lastPhasePoint]; }
  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() {
    return { x0: -1.0, x1: 1.0, y0: -0.98, y1: 0.96 };
  }

  // Strip x for a partial sum: log scale on the remaining gap to pi^2/6, so
  // each equal stride rightward is another decade of accuracy (fixes the
  // old linear stack saturating against the target line).
  _stripX(s) {
    const gap = Math.max(TARGET - s, TARGET * Math.pow(10, -GAP_DECADES));
    const u = Math.min(1, Math.log10(TARGET / gap) / GAP_DECADES);
    return CHART_X0 + u * (CHART_X1 - CHART_X0);
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

    // Trails, preallocated: bracket curves (purple), raw (gold), corrected (green)
    const mkTrail = (color, opacity) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WINDOW * 3), 3));
      geom.setDrawRange(0, 0);
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      this.simScene.add(line);
      return { geom, line };
    };
    this.envUpper = mkTrail(PURPLE, 0.6);
    this.envLower = mkTrail(PURPLE, 0.6);
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

    // --- slab strip (bottom): the stack, laid along a log-gap ruler ---
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(CHART_X0 - 0.02, STRIP_Y, 0), new THREE.Vector3(CHART_X1 + 0.02, STRIP_Y, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    ));
    // Decade ticks: gap = pi^2/6 x 10^-k at u = k/GAP_DECADES
    const tickPts = [];
    for (let k = 0; k <= GAP_DECADES; k++) {
      const x = CHART_X0 + (k / GAP_DECADES) * (CHART_X1 - CHART_X0);
      tickPts.push(new THREE.Vector3(x, STRIP_Y - 0.045, 0), new THREE.Vector3(x, STRIP_Y + 0.045, 0));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPts),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })
    ));
    // pi^2/6 sits off-scale right (gap -> 0): cyan chevron past the edge
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(CHART_X1 + 0.045, STRIP_Y + 0.05, 0),
        new THREE.Vector3(CHART_X1 + 0.095, STRIP_Y, 0),
        new THREE.Vector3(CHART_X1 + 0.045, STRIP_Y - 0.05, 0)
      ]),
      new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85 })
    ));

    // Filled portion of the strip
    this.fillGeom = new THREE.BufferGeometry();
    this.fillGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.fillGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(
      this.fillGeom,
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 })
    ));

    // Recent slab boundaries (individual slabs stay visible near the front)
    this.edgeGeom = new THREE.BufferGeometry();
    this.edgeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EDGES * 6), 3));
    this.edgeGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.LineSegments(
      this.edgeGeom,
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 })
    ));

    // Last slab, raised above the axis (prevSum -> sum)
    this.lastSlabGeom = new THREE.BufferGeometry();
    this.lastSlabGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.lastSlabGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(
      this.lastSlabGeom,
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 })
    ));

    // Fill front + corrected-estimate tick under the axis
    this.frontDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 24),
      new THREE.MeshBasicMaterial({ color: RED })
    );
    this.frontDot.position.set(CHART_X0, STRIP_Y, 0.02);
    this.simScene.add(this.frontDot);

    this.accTickGeom = new THREE.BufferGeometry();
    this.accTickGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.accTickGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(
      this.accTickGeom,
      new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0.95 })
    ));
  }

  updateSimScene() {
    if (!this.rawTrail) return;
    const n = this.winCount;
    const width = CHART_X1 - CHART_X0;

    // Auto-zoom: fit the raw estimate's ~3/(piN) gap at the oldest visible
    // slab, so the creep toward pi stays visible at every scale. The purple
    // bracket (~1/N^2) pinches onto the pi line inside that window.
    let halfRange = Math.PI - Math.sqrt(6);
    if (n > 0) {
      const oldestIdx = (this.winHead - n + WINDOW) % WINDOW;
      halfRange = Math.max((Math.PI - this.winRaw[oldestIdx]) * 1.15, 1e-12);
    }
    const yOf = (v) => {
      const off = Math.max(-1, Math.min(1, (v - Math.PI) / halfRange));
      return CHART_MID + off * CHART_HALF;
    };

    const rawArr = this.rawTrail.geom.attributes.position.array;
    const upArr = this.envUpper.geom.attributes.position.array;
    const loArr = this.envLower.geom.attributes.position.array;
    const accArr = this.accTrail.geom.attributes.position.array;

    for (let i = 0; i < n; i++) {
      const idx = (this.winHead - n + i + WINDOW) % WINDOW;
      const x = CHART_X0 + (i / (WINDOW - 1)) * width;
      rawArr[i * 3] = x; rawArr[i * 3 + 1] = yOf(this.winRaw[idx]); rawArr[i * 3 + 2] = 0.01;
      upArr[i * 3] = x; upArr[i * 3 + 1] = yOf(this.winHi[idx]); upArr[i * 3 + 2] = 0;
      loArr[i * 3] = x; loArr[i * 3 + 1] = yOf(this.winLo[idx]); loArr[i * 3 + 2] = 0;
      accArr[i * 3] = x; accArr[i * 3 + 1] = yOf(this.winAcc[idx]); accArr[i * 3 + 2] = 0.02;
    }
    for (const t of [this.rawTrail, this.envUpper, this.envLower]) {
      t.geom.attributes.position.needsUpdate = true;
      t.geom.setDrawRange(0, n);
    }
    this.accTrail.geom.attributes.position.needsUpdate = true;
    this.accTrail.geom.setDrawRange(0, this.euler ? n : 0);
    this.accTrail.line.visible = this.euler && n >= 2;

    const xNew = CHART_X0 + (Math.max(0, n - 1) / (WINDOW - 1)) * width;
    this.rawDot.visible = n > 0;
    if (n > 0) this.rawDot.position.set(xNew, yOf(this.rawPi), 0.03);
    const accOK = this.euler && n > 0;
    this.accDot.visible = accOK;
    if (accOK) this.accDot.position.set(xNew, yOf(this.accPi), 0.04);

    // Strip: fill, recent slab edges, last slab, front dot, corrected tick
    const xFront = this._stripX(this.sum);
    const fArr = this.fillGeom.attributes.position.array;
    fArr[0] = CHART_X0; fArr[1] = STRIP_Y; fArr[2] = 0.01;
    fArr[3] = xFront; fArr[4] = STRIP_Y; fArr[5] = 0.01;
    this.fillGeom.attributes.position.needsUpdate = true;
    this.fillGeom.setDrawRange(0, this.n > 0 ? 2 : 0);

    const eArr = this.edgeGeom.attributes.position.array;
    for (let j = 0; j < this.edgeCount; j++) {
      const idx = (this.edgeHead - this.edgeCount + j + EDGES) % EDGES;
      const x = this._stripX(this.edgeRing[idx]);
      eArr[j * 6] = x; eArr[j * 6 + 1] = STRIP_Y - 0.03; eArr[j * 6 + 2] = 0.005;
      eArr[j * 6 + 3] = x; eArr[j * 6 + 4] = STRIP_Y + 0.03; eArr[j * 6 + 5] = 0.005;
    }
    this.edgeGeom.attributes.position.needsUpdate = true;
    this.edgeGeom.setDrawRange(0, this.edgeCount * 2);

    const sArr = this.lastSlabGeom.attributes.position.array;
    sArr[0] = this._stripX(this.prevSum); sArr[1] = STRIP_Y + 0.055; sArr[2] = 0.01;
    sArr[3] = xFront; sArr[4] = STRIP_Y + 0.055; sArr[5] = 0.01;
    this.lastSlabGeom.attributes.position.needsUpdate = true;
    this.lastSlabGeom.setDrawRange(0, this.n > 0 ? 2 : 0);

    this.frontDot.position.set(xFront, STRIP_Y, 0.02);

    // The corrected sum S_N + 1/N - 1/(2N^2) sprints toward the right edge
    // (~1/(6N^3) gap) while the raw front crawls — acceleration made visible.
    const aArr = this.accTickGeom.attributes.position.array;
    if (accOK) {
      const ax = this._stripX(this.accSum);
      aArr[0] = ax; aArr[1] = STRIP_Y - 0.035; aArr[2] = 0.01;
      aArr[3] = ax; aArr[4] = STRIP_Y - 0.11; aArr[5] = 0.01;
      this.accTickGeom.attributes.position.needsUpdate = true;
    }
    this.accTickGeom.setDrawRange(0, accOK ? 2 : 0);

    // Drop stale sound-tick effects
    if (this.collisionEffects.length > 0) {
      const now = performance.now();
      this.collisionEffects = this.collisionEffects.filter(e => now - e.time < 200);
    }
  }
}

registerSim(BaselSumWalker);
