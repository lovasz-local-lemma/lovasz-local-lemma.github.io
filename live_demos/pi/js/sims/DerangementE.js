import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// Same rescale as GaltonBoardPi/UniformSumE: main.js advances 1e-4 sim-seconds
// per step(), so one board-second is ~one wall second at speed 1 / 60 fps.
const TIME_SCALE = 16.7;
const TURBO_RATE = 1000;        // invisible statistical shuffles per board-second

const NMIN = 4, NMAX = 20;
const MAX_CARDS = NMAX;

// --- card row layout (ortho scene units) ---
const CARD_Y = 0.56;
const CARD_H = 0.17;
const CARD_SPAN = 1.7;          // total width the row of slots occupies
const ROW_LINE_Y = CARD_Y - CARD_H / 2 - 0.03;

// --- fixed-point histogram ---
const HIST_MAX = 6;             // show fixed-point counts 0..6 (Poisson(1) tail is tiny)
const HIST_DX = 0.2;
const HIST_X0 = -(HIST_MAX * HIST_DX) / 2;
const HIST_FLOOR = -0.72;
const BAR_MAX_H = 1.0;

const C_DISPLACED = 0x6ee7b7;   // green: card not in its home slot
const C_FIXED = 0xe94560;       // red: card landed on its own index (kills the derangement)

export class DerangementE extends Simulation {
  static id = 'derangement-e';
  static title = 'Derangement e — shuffles that fix nothing';
  static description = 'Shuffle n cards; the fraction with NO card in its home spot is !n/n! → 1/e';
  static piMechanism = 'statistical: P(no fixed point) = !n/n! → 1/e ⇒ e ≈ shuffles/derangements';
  static rigor = 'Statistical';
  static sortOrder = 205;
  static piNature = 'statistical';
  static piLabel = 'e ≈';
  static previewSteps = 40;
  static alternatives = [{ id: 'uniform-sum-e', label: 'e from random pours' }];
  static explanation = {
    setup: 'Shuffle n cards laid out in slots 1…n. A card is a fixed point when it lands back on its own index (drawn red); otherwise it is displaced (green). A shuffle with zero fixed points — every card moved — is a derangement.',
    insight: 'The number of derangements of n items is !n, and !n/n! = Σ (−1)^k/k! → 1/e. So the probability a random shuffle fixes nothing tends to 1/e, and e ≈ (total shuffles)/(derangements). The full count of fixed points is Poisson(1) in the limit, with P(0 fixed) = P(1 fixed) = 1/e.',
    contrast: 'No circle, no π — the same Monte-Carlo idea aimed at e, a sibling of the random-pours machine. Here the alternating series 1 − 1 + 1/2! − 1/3! + … (inclusion–exclusion over which cards stay put) is what builds 1/e.',
    formula: 'e ≈ total shuffles / derangements,   P(no fixed point) = !n/n! = Σ (−1)^k/k!',
    getExpected: (params) => {
      const n = params.n || 12;
      // exact derangement probability !n/n! = Σ_{k=0}^{n} (-1)^k/k!
      let term = 1, s = 1;
      for (let k = 1; k <= n; k++) { term /= -k; s += term; }
      const inv = 1 / Math.E;
      return `For n=${n}: exact P(derangement) = !${n}/${n}! = ${s.toFixed(7)}, versus 1/e = ${inv.toFixed(7)} — a bias of only ${(s - inv).toExponential(1)} (about 1/${n}!). The estimator e ≈ shuffles/derangements is therefore essentially unbiased by n=12; the enemy is Monte-Carlo noise shrinking like 1/√N.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = Math.min(NMAX, Math.max(NMIN, params.n || 12));
    this.shuffleRate = params.shuffleRate || 12;
    this.turbo = true;
    // Poisson(1) reference mass for the fixed-point histogram: p[k] = e^{-1}/k!.
    this.poisProb = new Array(HIST_MAX + 1);
    let f = 1;
    for (let k = 0; k <= HIST_MAX; k++) { if (k > 0) f *= k; this.poisProb[k] = Math.exp(-1) / f; }
    // Reusable scratch permutation for invisible shuffles (no per-shuffle alloc).
    this._scratch = new Int16Array(NMAX);
    this.reset();
  }

  reset() {
    super.reset();
    this.totalShuffles = 0;
    this.derangements = 0;
    this.fixedHist = new Array(HIST_MAX + 1).fill(0);
    this.shuffleCarry = 0;
    this.turboCarry = 0;
    this.nextMilestone = 1;
    this.collisionCount = 0;
    // Current displayed shuffle.
    this.perm = new Int16Array(NMAX);
    for (let i = 0; i < this.n; i++) this.perm[i] = i;
    this.fixedCount = this.n;    // identity to start (all fixed) until first shuffle
    this._demoSet = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'n', label: 'Cards n',
        min: NMIN, max: NMAX, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'shuffleRate', label: 'Shuffles/s (visible)',
        min: 1, max: 60, step: 1, default: this.shuffleRate,
        onChange: (val) => { this.shuffleRate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log shuffles vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 shuffles', y: '(ê − e)/e' }
      }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let recorded = false;

    // Coarse dt (hub thumbnail drives step(0.04)) -> freeze a pretty demo row and
    // just pour invisible shuffles into the histogram.
    if (dt >= 0.02) { this._setupDemo(); }
    else {
      this.shuffleCarry += this.shuffleRate * t;
      let v = Math.floor(this.shuffleCarry); this.shuffleCarry -= v;
      for (; v > 0; v--) { this._visibleShuffle(); recorded = true; }
    }

    if (this.turbo) {
      this.turboCarry += TURBO_RATE * t;
      let m = Math.floor(this.turboCarry); this.turboCarry -= m;
      if (m > 0) recorded = true;
      for (; m > 0; m--) this._invisibleShuffle();
    }

    this.collisionCount = this.totalShuffles;
    if (this.totalShuffles >= this.nextMilestone) {
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.totalShuffles + 1, Math.ceil(this.totalShuffles * 1.02));
    }
    return recorded;
  }

  // Fisher-Yates on arr[0..n-1], return the number of fixed points.
  _shuffleInto(arr) {
    const n = this.n;
    for (let i = 0; i < n; i++) arr[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    let f = 0;
    for (let i = 0; i < n; i++) if (arr[i] === i) f++;
    return f;
  }

  _record(fixed) {
    this.totalShuffles++;
    this.fixedHist[Math.min(fixed, HIST_MAX)]++;
    if (fixed === 0) this.derangements++;
  }

  _visibleShuffle() {
    this.fixedCount = this._shuffleInto(this.perm);
    this._record(this.fixedCount);
  }

  _invisibleShuffle() {
    this._record(this._shuffleInto(this._scratch));
  }

  // Frozen pretty row for the hub thumbnail: a derangement with a single red
  // fixed card so both colours read at a glance.
  _setupDemo() {
    if (this._demoSet) return;
    this._demoSet = true;
    const n = this.n;
    // rotate-by-one derangement, then plant one fixed point in the middle.
    for (let i = 0; i < n; i++) this.perm[i] = (i + 1) % n;
    const mid = Math.floor(n / 2);
    this.perm[mid] = mid;
    let f = 0; for (let i = 0; i < n; i++) if (this.perm[i] === i) f++;
    this.fixedCount = f;
  }

  getCountLabel() { return 'Shuffles'; }

  getPiApproximation() {
    return this.derangements > 0 ? this.totalShuffles / this.derangements : 0;
  }

  getPiReadout() {
    return this.derangements > 0 ? this.getPiApproximation().toFixed(6) : 'collecting…';
  }

  getFormulaHTML() {
    const live = this.derangements > 0
      ? piDigitsHTML(this.getPiApproximation(), 4, Math.E) : 'collecting…';
    const frac = this.totalShuffles > 0 ? this.derangements / this.totalShuffles : 0;
    return `
      <strong>shuffles that fix nothing</strong>:
      <span class="f-angle">P(no fixed point) = !n/n! = Σ (−1)ᵏ/k! → 1/e</span><br>
      <span class="f-muted">fixed-point count → Poisson(1): P(0) = P(1) = 1/e</span><br>
      <span class="f-result">e</span> ≈
      <span class="f-count">${this.totalShuffles}</span> shuffles /
      <span class="f-count">${this.derangements}</span> derangements
      &nbsp;(<span class="f-angle">${frac.toFixed(4)}</span> ≈ 1/e = ${(1 / Math.E).toFixed(4)})
      <br><span style="font-size:1.1em">e = ${live}</span>
      <br><span class="f-muted">n=${this.n}; finite-n bias ~1/n! is negligible — noise ~ 1/√N.</span>
    `;
  }

  getPhasePoint() {
    const eHat = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.totalShuffles, 1)) / 6 * 2 - 1));
    const y = Math.min(1, Math.max(-1, (eHat - Math.E) / Math.E * 8));
    return [x, y];
  }

  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() {
    return { x0: -0.95, x1: 0.95, y0: -0.82, y1: 0.72 };
  }

  _slotX(i) {
    const spacing = CARD_SPAN / this.n;
    return -CARD_SPAN / 2 + (i + 0.5) * spacing;
  }

  _label(text, cx, cy, sx = 0.22, sy = 0.042) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = '#c9d1ff';
    g.font = '34px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, depthTest: false }));
    sp.position.set(cx, cy, 0.1);
    sp.scale.set(sx, sy, 1);
    this.simScene.add(sp);
    return sp;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.1, 1.1, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    // Baseline under the card row.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-CARD_SPAN / 2 - 0.02, ROW_LINE_Y, 0),
        new THREE.Vector3(CARD_SPAN / 2 + 0.02, ROW_LINE_Y, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
    ));

    // Pooled card faces + outlines (one per slot; only first n shown).
    const cardGeom = new THREE.PlaneGeometry(1, 1);
    this.cardMeshes = [];
    this.cardOutlines = [];
    for (let i = 0; i < MAX_CARDS; i++) {
      const m = new THREE.Mesh(cardGeom, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }));
      m.position.z = 0.02; m.visible = false;
      this.simScene.add(m);
      this.cardMeshes.push(m);
      const o = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
          new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0),
        ]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
      );
      o.position.z = 0.03; o.visible = false;
      this.simScene.add(o);
      this.cardOutlines.push(o);
    }

    // Histogram baseline.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(HIST_X0 - HIST_DX * 0.6, HIST_FLOOR, 0),
        new THREE.Vector3(HIST_X0 + (HIST_MAX + 0.6) * HIST_DX, HIST_FLOOR, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
    ));

    // Pooled fixed-point-count bars; bin 0 (derangements) gold, rest cyan.
    const barGeom = new THREE.PlaneGeometry(1, 1);
    const barGold = new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95 });
    const barCyan = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85 });
    this.barMeshes = [];
    for (let k = 0; k <= HIST_MAX; k++) {
      const m = new THREE.Mesh(barGeom, k === 0 ? barGold : barCyan);
      m.position.set(HIST_X0 + k * HIST_DX, HIST_FLOOR, 0);
      m.scale.set(HIST_DX * 0.8, 1e-4, 1);
      this.simScene.add(m);
      this.barMeshes.push(m);
    }

    // Poisson(1) envelope, rescaled to the live total each frame.
    const envPositions = new Float32Array((HIST_MAX + 1) * 3);
    for (let k = 0; k <= HIST_MAX; k++) {
      envPositions[k * 3] = HIST_X0 + k * HIST_DX;
      envPositions[k * 3 + 1] = HIST_FLOOR;
      envPositions[k * 3 + 2] = 0.01;
    }
    this.envGeom = new THREE.BufferGeometry();
    this.envGeom.setAttribute('position', new THREE.BufferAttribute(envPositions, 3));
    this.simScene.add(new THREE.Line(this.envGeom,
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.65 })));

    // Dashed 1/e reference level spanning bins 0 and 1 (both equal 1/e).
    this.refGeom = new THREE.BufferGeometry();
    this.refGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    this.simScene.add(new THREE.Line(this.refGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.7 })));

    // Static labels (created once; never regenerated).
    this._label('shuffle: red = fixed, green = displaced', 0, CARD_Y + CARD_H / 2 + 0.12, 0.58, 0.045);
    this._label('number of fixed points →', 0, HIST_FLOOR - 0.1, 0.38, 0.038);
    this._label('1/e', HIST_X0 + 0.5 * HIST_DX, HIST_FLOOR + 0.04 + BAR_MAX_H * 0.42, 0.092, 0.04);
  }

  updateSimScene() {
    if (!this.cardMeshes) return;
    const n = this.n;
    const spacing = CARD_SPAN / n;
    const cw = spacing * 0.82;

    // Card row: colour by fixed vs displaced.
    for (let i = 0; i < MAX_CARDS; i++) {
      const show = i < n;
      const m = this.cardMeshes[i], o = this.cardOutlines[i];
      m.visible = show; o.visible = show;
      if (!show) continue;
      const x = this._slotX(i);
      m.position.set(x, CARD_Y, 0.02);
      m.scale.set(cw, CARD_H, 1);
      m.material.color.set(this.perm[i] === i ? C_FIXED : C_DISPLACED);
      o.position.set(x, CARD_Y, 0.03);
      o.scale.set(cw, CARD_H, 1);
    }

    // Histogram of fixed-point counts.
    let maxC = 1;
    for (let k = 0; k <= HIST_MAX; k++) if (this.fixedHist[k] > maxC) maxC = this.fixedHist[k];
    for (let k = 0; k <= HIST_MAX; k++) {
      const h = Math.max(this.fixedHist[k] / maxC * BAR_MAX_H, 1e-4);
      const m = this.barMeshes[k];
      m.scale.y = h;
      m.position.y = HIST_FLOOR + h / 2;
    }

    const env = this.envGeom.attributes.position.array;
    for (let k = 0; k <= HIST_MAX; k++) {
      const h = this.totalShuffles > 0 ? this.totalShuffles * this.poisProb[k] / maxC * BAR_MAX_H : 0;
      env[k * 3 + 1] = HIST_FLOOR + h;
    }
    this.envGeom.attributes.position.needsUpdate = true;

    // 1/e reference line at the Poisson P=1/e height (= bins 0 and 1).
    const refH = this.totalShuffles > 0 ? this.totalShuffles * this.poisProb[0] / maxC * BAR_MAX_H : 0;
    const ref = this.refGeom.attributes.position.array;
    ref[0] = HIST_X0 - HIST_DX * 0.5; ref[1] = HIST_FLOOR + refH; ref[2] = 0.015;
    ref[3] = HIST_X0 + 1.5 * HIST_DX; ref[4] = HIST_FLOOR + refH; ref[5] = 0.015;
    this.refGeom.attributes.position.needsUpdate = true;
  }
}

registerSim(DerangementE);
