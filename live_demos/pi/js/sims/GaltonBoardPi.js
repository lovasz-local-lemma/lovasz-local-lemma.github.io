import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so raw sim time runs at ~0.06 s per wall second at speed 1. Rescale so one
// board-second is roughly one wall-clock second at speed 1 / 60 fps.
const TIME_SCALE = 16.7;
const ROW_RATE = 6;        // peg rows a visual ball falls per board-second
const TURBO_RATE = 1000;   // invisible statistical balls per board-second
const MAX_VISUAL = 150;
const PEG_TOP = 0.8;
const PEG_SPAN = 1.1;
const FUNNEL_TIP = 0.92;
const BIN_FLOOR = -1.02;
const BAR_MAX_H = 0.56;

// C(n, n/2) / 2^n without factorial overflow: each factor is (n/2+i)/(4i),
// so the product is C(n,n/2)/4^(n/2) = C(n,n/2)/2^n directly.
function centerBinProbability(n) {
  let p = 1;
  for (let i = 1; i <= n / 2; i++) p *= (n / 2 + i) / i / 4;
  return p;
}

export class GaltonBoardPi extends Simulation {
  static id = 'galton-board-pi';
  static title = 'Galton Board — π from the bell curve';
  static description = 'Independent fair left/right choices build a binomial bell; the central probability reveals π';
  static piMechanism = 'statistical: center-bin probability C(n,n/2)/2ⁿ ~ √(2/(πn)) → π ~ 2/(n P₀²)';
  static rigor = 'Statistical';
  static sortOrder = 58;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 900;
  static alternatives = [{ id: 'drunkard-pi', label: 'π from the mean instead of the peak' }];
  static explanation = {
    setup: 'Each ball makes n independent choices, left or right with probability 1/2, and finishes in one of n+1 bins. The pegs animate an ideal Bernoulli process: no contact forces or collision physics are solved here. Pipeline’s Galton board instead computes motion and contacts, with randomized virtual peg offsets: a separate hybrid physical model rather than this prescribed coin-flip process.',
    insight: 'The center bin collects the fraction P0 = C(n, n/2)/2^n of all balls. De Moivre–Laplace gives P0 ≈ √(2/(πn)): π sets exactly how unlikely a perfectly balanced left/right count is. Invert it and π ≈ 2/(n·P0²).',
    contrast: 'π enters through Stirling\'s asymptotics for factorials, the same constant that normalizes the Gaussian. At finite n the infinite-sample result is 2/(n·P0²), with leading behavior π(1 + 1/(2n) + O(n⁻²)). The Stirling toggle multiplies by (1 − 1/(4n))² to cancel the leading bias; a smaller finite-row error remains.',
    formula: 'π ≈ 2/(n·P̂0²),  P̂0 = (center-bin balls)/(total balls)  [STATISTICAL]',
    getExpected: (params) => {
      const n = params.rows || 20;
      const p0 = centerBinProbability(n);
      const raw = 2 / (n * p0 * p0);
      const corrected = raw * Math.pow(1 - 1 / (4 * n), 2);
      return `For n=${n} rows: exact P0 = C(${n},${n / 2})/2^${n} = ${p0.toFixed(5)}. Even with infinite balls the raw estimator gives ${raw.toFixed(5)} — biased high by ~1/(2n). The Stirling correction ×(1−1/(4n))² lands at ${corrected.toFixed(5)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = Math.round((params.rows || 40) / 2) * 2;
    this.dropRate = params.dropRate || 40;
    // Default preset converges visibly: many rows + turbo statistics + the
    // Stirling correction so the readout homes in on pi instead of pi(1+1/2n).
    this.turbo = true;
    this.stirling = true;
    this.reset();
  }

  reset() {
    super.reset();
    const n = this.n;
    this.spacing = 2 / (n + 2);
    this.rowDy = PEG_SPAN / Math.max(n - 1, 1);
    this.spawnRow = -(FUNNEL_TIP - PEG_TOP) / this.rowDy;
    this.bins = new Array(n + 1).fill(0);
    // Ideal binomial mass per bin: p[k+1] = p[k]*(n-k)/(k+1), p[0] = 2^-n.
    this.binProb = new Array(n + 1);
    this.binProb[0] = Math.pow(0.5, n);
    for (let k = 0; k < n; k++) this.binProb[k + 1] = this.binProb[k] * (n - k) / (k + 1);
    this.totalBalls = 0;
    this.balls = [];
    this.spawnCarry = 0;
    this.turboCarry = 0;
    this.nextMilestone = 1;
    this.collisionCount = 0;
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'rows', label: 'Peg rows n',
        min: 8, max: 60, step: 2, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'dropRate', label: 'Drop rate (balls/s)',
        min: 1, max: 200, step: 1, default: this.dropRate,
        onChange: (val) => { this.dropRate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'toggle', id: 'stirling', label: 'Finite-row correction (Stirling)', default: this.stirling },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log balls vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 balls', y: '(π̂ − π)/π' }
      }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let landed = false;

    this.spawnCarry += this.dropRate * t;
    let spawn = Math.floor(this.spawnCarry);
    this.spawnCarry -= spawn;
    for (; spawn > 0; spawn--) {
      if (this.balls.length < MAX_VISUAL) {
        this.balls.push({ row: this.spawnRow, offset: 0, from: 0, to: 0, decided: 0 });
      } else {
        this._sampleInvisibleBall();   // visual pool full -> statistics only
        landed = true;
      }
    }

    if (this.turbo) {
      this.turboCarry += TURBO_RATE * t;
      const m = Math.floor(this.turboCarry);
      this.turboCarry -= m;
      if (m > 0) landed = true;
      for (let i = 0; i < m; i++) this._sampleInvisibleBall();
    }

    const drop = ROW_RATE * t;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.row += drop;
      while (b.decided < this.n && Math.floor(b.row) >= b.decided) {
        b.from = b.offset;
        b.offset += Math.random() < 0.5 ? -1 : 1;
        b.to = b.offset;
        b.decided++;
      }
      if (b.row >= this.n) {
        this._land(b.offset);
        this.balls[i] = this.balls[this.balls.length - 1];
        this.balls.pop();
        landed = true;
      }
    }

    this.collisionCount = this.totalBalls;
    if (this.totalBalls >= this.nextMilestone) {
      // One convergence point per ~2% growth in sample count keeps the trail readable.
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.totalBalls + 1, Math.ceil(this.totalBalls * 1.02));
    }
    return landed;
  }

  _land(offset) {
    this.bins[(offset + this.n) / 2]++;
    this.totalBalls++;
  }

  _sampleInvisibleBall() {
    let off = 0;
    for (let i = 0; i < this.n; i++) off += Math.random() < 0.5 ? -1 : 1;
    this._land(off);
  }

  getCountLabel() {
    return 'Balls landed';
  }

  getPiApproximation() {
    const c = this.bins[this.n / 2];
    if (!c || !this.totalBalls) return 0;
    const p0 = c / this.totalBalls;
    let est = 2 / (this.n * p0 * p0);
    if (this.stirling) est *= Math.pow(1 - 1 / (4 * this.n), 2);
    return est;
  }

  getPiReadout() {
    return this.bins[this.n / 2] > 0 ? this.getPiApproximation().toFixed(6) : 'collecting…';
  }

  getFormulaHTML() {
    const n = this.n;
    const c = this.bins[n / 2] || 0;
    const p0 = this.totalBalls > 0 ? c / this.totalBalls : 0;
    const live = c > 0 ? piDigitsHTML(this.getPiApproximation(), 4) : 'collecting…';
    const biasedLimit = 2 / (n * centerBinProbability(n) ** 2);
    return `
      <strong>center-bin deficit</strong>:
      <span class="f-angle">P₀ = C(n, n/2)/2ⁿ ≈ √(2/(πn))</span><br>
      <span class="f-result">π</span> ≈
      2 / (<span class="f-count">${n}</span> · <span class="f-angle">P̂₀²</span>),
      &nbsp;P̂₀ = <span class="f-count">${p0.toFixed(4)}</span>
      <br><span style="font-size:1.1em">π ≈ ${live}</span>
      <br><span class="f-muted">finite-row bias: with infinite balls the raw estimator tends to 2/(n·P₀²) = ${biasedLimit.toFixed(4)}. Its leading approximation is π(1 + 1/(2n)). The Stirling toggle multiplies by (1 − 1/(4n))² to cancel the leading bias; a smaller error remains${this.stirling ? ' (correction ON)' : ''}.</span>
    `;
  }

  getPhasePoint() {
    const est = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.totalBalls, 1)) / 6 * 2 - 1));
    const y = Math.min(1, Math.max(-1, (est - Math.PI) / Math.PI * 4));
    return [x, y];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -1.08, x1: 1.08, y0: -1.12, y1: 1.1 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.08, 1.08, 1.1, -1.12, 0.1, 10);
    this.simCamera.position.z = 1;
    const n = this.n;
    const s = this.spacing;

    // Funnel mouth above the top peg row.
    const funnelPts = [
      new THREE.Vector3(-0.16, 1.04, 0), new THREE.Vector3(-0.018, FUNNEL_TIP, 0),
      new THREE.Vector3(0.16, 1.04, 0), new THREE.Vector3(0.018, FUNNEL_TIP, 0),
    ];
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(funnelPts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    ));

    // Peg triangle: row r has r+1 pegs at offsets of parity r.
    const pegPts = [];
    for (let r = 0; r < n; r++) {
      const y = PEG_TOP - r * this.rowDy;
      for (let i = 0; i <= r; i++) pegPts.push(new THREE.Vector3((i - r / 2) * s, y, 0));
    }
    this.simScene.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(pegPts),
      new THREE.PointsMaterial({ color: 0x8d93c8, size: 3.5, sizeAttenuation: false, transparent: true, opacity: 0.9 })
    ));

    // Bin floor.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-(n / 2 + 0.7) * s, BIN_FLOOR, 0),
        new THREE.Vector3((n / 2 + 0.7) * s, BIN_FLOOR, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
    ));

    // Pooled histogram bars, one per bin; center bin gold.
    const barGeom = new THREE.PlaneGeometry(1, 1);
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95 });
    const cyanMat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85 });
    this.barMeshes = [];
    for (let k = 0; k <= n; k++) {
      const m = new THREE.Mesh(barGeom, k === n / 2 ? goldMat : cyanMat);
      m.position.set((k - n / 2) * s, BIN_FLOOR, 0);
      m.scale.set(s * 0.84, 1e-4, 1);
      this.simScene.add(m);
      this.barMeshes.push(m);
    }

    // Ideal binomial envelope, rescaled to the live total each frame.
    const envPositions = new Float32Array((n + 1) * 3);
    for (let k = 0; k <= n; k++) {
      envPositions[k * 3] = (k - n / 2) * s;
      envPositions[k * 3 + 1] = BIN_FLOOR;
      envPositions[k * 3 + 2] = 0.01;
    }
    this.envGeom = new THREE.BufferGeometry();
    this.envGeom.setAttribute('position', new THREE.BufferAttribute(envPositions, 3));
    this.envLine = new THREE.Line(this.envGeom,
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.6 }));
    this.simScene.add(this.envLine);

    // Pooled visual balls.
    const ballGeom = new THREE.CircleGeometry(0.013, 12);
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf7c948 });
    this.ballMeshes = [];
    for (let i = 0; i < MAX_VISUAL; i++) {
      const m = new THREE.Mesh(ballGeom, i % 3 === 0 ? yellowMat : whiteMat);
      m.visible = false;
      m.position.z = 0.02;
      this.simScene.add(m);
      this.ballMeshes.push(m);
    }
  }

  updateSimScene() {
    if (!this.barMeshes) return;
    const n = this.n;
    const s = this.spacing;

    let maxBin = 1;
    for (const b of this.bins) if (b > maxBin) maxBin = b;

    for (let k = 0; k <= n; k++) {
      const h = Math.max(this.bins[k] / maxBin * BAR_MAX_H, 1e-4);
      const m = this.barMeshes[k];
      m.scale.y = h;
      m.position.y = BIN_FLOOR + h / 2;
    }

    const env = this.envGeom.attributes.position.array;
    for (let k = 0; k <= n; k++) {
      const h = this.totalBalls > 0 ? this.totalBalls * this.binProb[k] / maxBin * BAR_MAX_H : 0;
      env[k * 3 + 1] = BIN_FLOOR + h;
    }
    this.envGeom.attributes.position.needsUpdate = true;

    for (let i = 0; i < this.ballMeshes.length; i++) {
      const mesh = this.ballMeshes[i];
      const b = this.balls[i];
      if (!b) { mesh.visible = false; continue; }
      const frac = b.decided > 0 ? Math.min(1, Math.max(0, b.row - (b.decided - 1))) : 0;
      mesh.position.set(
        (b.from + (b.to - b.from) * frac) * s / 2,
        PEG_TOP - b.row * this.rowDy,
        0.02
      );
      mesh.visible = true;
    }
  }
}

registerSim(GaltonBoardPi);
