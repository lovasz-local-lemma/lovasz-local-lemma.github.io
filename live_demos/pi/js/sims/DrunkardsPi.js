import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

const TIME_SCALE = 16.7;   // board-seconds per sim-second (house convention)
const TURBO_RATE = 1000;   // statistics-only walkers per board-second
const WALK_SECONDS = 2;    // a visible walker finishes its n steps in ~2 board-seconds
const MAX_LIVE = 3;        // gold paths walking live
const KEEP_PATHS = 40;     // faint completed paths kept in the fan
const MAX_VERTS = 80;      // stored vertices per path (downsampled)
const NBINS = 24;
const FX0 = -1.10, FX1 = 0.38;    // fan panel: time left -> right
const HX0 = 0.52, HX1 = 1.10;     // |S_n| histogram panel
const HFLOOR = -0.80, HBAR_MAX = 1.42;
const FAN_CLAMP = 0.93;

// Exact E|S_n| = sum_k |2k-n| C(n,k)/2^n, built with the incremental ratio
// C(n,k+1)/C(n,k) = (n-k)/(k+1). Starting from 2^-n keeps every factor in
// double range for n up to ~1000 (2^-400 ~ 4e-121 is still normal).
export function exactMeanAbsDisplacement(n) {
  let p = Math.pow(0.5, n);
  let mean = 0;
  for (let k = 0; k <= n; k++) {
    mean += Math.abs(2 * k - n) * p;
    p *= (n - k) / (k + 1);
  }
  return mean;
}

export class DrunkardsPi extends Simulation {
  static id = 'drunkard-pi';
  static title = 'Drunkard\'s π — mean distance of a random walk';
  static description = 'Many ±1 walkers; the average final distance is √(2n/π) — invert it for π';
  static piMechanism = 'statistical: E|Sₙ| → √(2n/π) ⇒ π ≈ 2n/⟨|Sₙ|⟩²';
  static rigor = 'Statistical';
  static sortOrder = 59;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 900;
  static alternatives = [{ id: 'galton-board-pi', label: 'π from the peak instead of the mean' }];
  static explanation = {
    setup: 'A drunkard leaves the lamppost and takes n steps, each one pace left or right with equal chance. Where do they end up? Anywhere — but how far away ON AVERAGE? Many walkers run at once; each finished walk drops one sample of the final distance |Sₙ| into the histogram.',
    insight: 'The mean final distance obeys E|Sₙ| → √(2n/π). Folding the limiting Gaussian in half turns its 1/√(2πn) normalization constant into a measurable average distance — the same π the Galton board finds in the bell curve, reached through the MEAN instead of the PEAK. Invert it: π ≈ 2n/⟨|Sₙ|⟩².',
    contrast: 'No circle anywhere — π enters through the Gaussian limit of coin flips. The finite-n bias is explicit and shown: the exact binomial E|Sₙ| differs from √(2n/π) at order 1/n, so even infinitely many walkers converge to a value slightly above π. Raise n and watch the bias shrink.',
    formula: 'π ≈ 2n/⟨|Sₙ|⟩²,  ⟨|Sₙ|⟩ = mean final distance  [STATISTICAL]',
    getExpected: (params) => {
      const n = Math.round((params.steps || 100) / 2) * 2;
      const e = exactMeanAbsDisplacement(n);
      const asym = Math.sqrt(2 * n / Math.PI);
      const limit = 2 * n / (e * e);
      const off = (limit - Math.PI) / Math.PI * 100;
      return `For n=${n} steps: exact E|Sₙ| = Σ|2k−n|·C(n,k)/2ⁿ = ${e.toFixed(4)}, while √(2n/π) = ${asym.toFixed(4)}. Even with infinitely many walkers the estimator converges to 2n/E|Sₙ|² = ${limit.toFixed(5)} — ${off >= 0 ? '+' : ''}${off.toFixed(2)}% off π. The bias shrinks like 1/n.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = Math.round((params.steps || 100) / 2) * 2;
    this.walkRate = params.walkRate || 12;
    this.turbo = true;
    this.reset();
  }

  reset() {
    super.reset();
    const n = this.n;
    this.exactMeanAbs = exactMeanAbsDisplacement(n);
    this.piLimit = 2 * n / (this.exactMeanAbs * this.exactMeanAbs);
    this.yScale = 0.88 / (3.2 * Math.sqrt(n));
    this.stride = Math.max(1, Math.ceil(n / (MAX_VERTS - 2)));
    // Bin width must be an even integer: |S_n| shares n's parity, so odd or
    // fractional widths would comb the histogram with empty bins.
    this.binWidth = 2 * Math.max(1, Math.ceil(3.2 * Math.sqrt(n) / (2 * NBINS)));
    this.bins = new Array(NBINS).fill(0);
    // Ideal envelope: exact folded-binomial mass per bin (the honest finite-n
    // half-normal), accumulated from the same incremental pmf loop.
    this.binProb = new Array(NBINS).fill(0);
    let p = Math.pow(0.5, n);
    for (let k = 0; k <= n; k++) {
      const idx = Math.min(NBINS - 1, Math.floor(Math.abs(2 * k - n) / this.binWidth));
      this.binProb[idx] += p;
      p *= (n - k) / (k + 1);
    }
    this.totalWalkers = 0;
    this.sumAbs = 0;
    this.spawnCarry = 0;
    this.turboCarry = 0;
    this.liveWalkers = new Array(MAX_LIVE).fill(null);
    this.livePaths = [];
    this.liveVerts = new Array(MAX_LIVE).fill(0);
    for (let i = 0; i < MAX_LIVE; i++) this.livePaths.push(new Float32Array(MAX_VERTS * 3));
    this.donePaths = [];
    this.doneVerts = new Array(KEEP_PATHS).fill(0);
    for (let i = 0; i < KEEP_PATHS; i++) this.donePaths.push(new Float32Array(MAX_VERTS * 3));
    this.doneHead = 0;
    this.nextMilestone = 1;
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'steps', label: 'Steps per walker n',
        min: 20, max: 400, step: 20, default: this.n, highlight: true,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'walkRate', label: 'Walkers/s',
        min: 1, max: 100, step: 1, default: this.walkRate,
        onChange: (val) => { this.walkRate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log walkers vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 walkers', y: '(π̂ − π)/π' }
      }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let landed = false;

    this.spawnCarry += this.walkRate * t;
    let spawn = Math.floor(this.spawnCarry);
    this.spawnCarry -= spawn;
    for (; spawn > 0; spawn--) {
      const slot = this.liveWalkers.indexOf(null);
      if (slot >= 0) this._startWalker(slot);
      else { this._sampleWalker(); landed = true; }   // visual pool full -> statistics only
    }

    if (this.turbo) {
      this.turboCarry += TURBO_RATE * t;
      let m = Math.floor(this.turboCarry);
      this.turboCarry -= m;
      if (m > 0) landed = true;
      for (; m > 0; m--) this._sampleWalker();
    }

    const stepRate = this.n / WALK_SECONDS;
    for (let i = 0; i < MAX_LIVE; i++) {
      const w = this.liveWalkers[i];
      if (!w) continue;
      w.tSteps += stepRate * t;
      while (w.stepIdx < this.n && w.stepIdx < w.tSteps) {
        w.pos += Math.random() < 0.5 ? -1 : 1;
        w.stepIdx++;
        if (w.stepIdx % this.stride === 0 || w.stepIdx === this.n) this._pushVertex(w);
      }
      if (w.stepIdx >= this.n) {
        this._finishLive(i, w);
        landed = true;
      }
    }

    this.collisionCount = this.totalWalkers;
    if (this.totalWalkers >= this.nextMilestone) {
      // One convergence point per ~2% growth in sample count keeps the trail readable.
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.totalWalkers + 1, Math.ceil(this.totalWalkers * 1.02));
    }
    return landed;
  }

  _startWalker(slot) {
    const w = { slot, pos: 0, stepIdx: 0, tSteps: 0, verts: 0 };
    this.liveWalkers[slot] = w;
    this._pushVertex(w);
  }

  _pushVertex(w) {
    if (w.verts >= MAX_VERTS) return;
    const a = this.livePaths[w.slot];
    const i = w.verts * 3;
    a[i] = FX0 + (w.stepIdx / this.n) * (FX1 - FX0);
    a[i + 1] = Math.max(-FAN_CLAMP, Math.min(FAN_CLAMP, w.pos * this.yScale));
    a[i + 2] = 0.02;
    w.verts++;
    this.liveVerts[w.slot] = w.verts;
  }

  _finishLive(slot, w) {
    this._recordFinish(w.pos);
    this.donePaths[this.doneHead].set(this.livePaths[slot].subarray(0, w.verts * 3));
    this.doneVerts[this.doneHead] = w.verts;
    this.doneHead = (this.doneHead + 1) % KEEP_PATHS;
    this.liveWalkers[slot] = null;
    this.liveVerts[slot] = 0;
  }

  _sampleWalker() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += Math.random() < 0.5 ? -1 : 1;
    this._recordFinish(s);
  }

  _recordFinish(s) {
    const a = Math.abs(s);
    this.sumAbs += a;
    this.totalWalkers++;
    this.bins[Math.min(NBINS - 1, Math.floor(a / this.binWidth))]++;
  }

  getCountLabel() { return 'Walkers'; }

  getPiApproximation() {
    if (!this.totalWalkers) return 0;
    const mean = this.sumAbs / this.totalWalkers;
    if (!(mean > 0)) return 0;
    return 2 * this.n / (mean * mean);
  }

  getPiReadout() {
    const est = this.getPiApproximation();
    return est > 0 ? est.toFixed(6) : 'collecting…';
  }

  getFormulaHTML() {
    const mean = this.totalWalkers ? this.sumAbs / this.totalWalkers : 0;
    const live = mean > 0 ? piDigitsHTML(this.getPiApproximation(), 4) : 'collecting…';
    return `
      <strong>drunkard's walk</strong>:
      <span class="f-angle">E|Sₙ| → √(2n/π)</span><br>
      <span class="f-result">π</span> ≈
      2·<span class="f-count">${this.n}</span> / <span class="f-angle">⟨|Sₙ|⟩²</span>,
      &nbsp;⟨|S|⟩ = <span class="f-count">${mean.toFixed(3)}</span>
      <br><span style="font-size:1.1em">π = ${live}</span>
      <br><span class="f-muted">finite-n bias: exact E|Sₙ| = ${this.exactMeanAbs.toFixed(4)} vs √(2n/π) = ${Math.sqrt(2 * this.n / Math.PI).toFixed(4)}, so even infinite walkers converge to ${this.piLimit.toFixed(5)}, not π. Raise n to shrink the gap.</span>
    `;
  }

  getPhasePoint() {
    const est = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.totalWalkers, 1)) / 6 * 2 - 1));
    const y = Math.min(1, Math.max(-1, (est - Math.PI) / Math.PI * 4));
    return [x, y];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -1.13, x1: 1.13, y0: -0.92, y1: 0.92 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    // Lamppost baseline through the fan + histogram floor.
    const axisMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 });
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(FX0, 0, 0), new THREE.Vector3(FX1, 0, 0)]), axisMat));
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(HX0 - 0.02, HFLOOR, 0), new THREE.Vector3(HX1 + 0.02, HFLOOR, 0)]), axisMat));

    // ±√(2t/π) mean-distance envelope over the fan.
    const envMat = new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.65 });
    for (const sign of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const u = i / 48;
        pts.push(new THREE.Vector3(
          FX0 + u * (FX1 - FX0),
          sign * Math.sqrt(2 * u * this.n / Math.PI) * this.yScale, 0.01));
      }
      this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), envMat));
    }

    // Path pools: faint cyan completed walks + gold live walks (shared arrays).
    const mkLine = (arr, mat) => {
      const geom = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(arr, 3);
      geom.setAttribute('position', attr);
      geom.setDrawRange(0, 0);
      const line = new THREE.Line(geom, mat);
      this.simScene.add(line);
      return { line, attr };
    };
    const doneMat = new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.22 });
    const liveMat = new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95 });
    this.doneLines = this.donePaths.map(a => mkLine(a, doneMat));
    this.liveLines = this.livePaths.map(a => mkLine(a, liveMat));

    // Pooled |S_n| histogram bars + exact folded-binomial envelope + mean tick.
    const bw = (HX1 - HX0) / NBINS;
    const barGeom = new THREE.PlaneGeometry(1, 1);
    const barMat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85 });
    this.barMeshes = [];
    for (let k = 0; k < NBINS; k++) {
      const m = new THREE.Mesh(barGeom, barMat);
      m.position.set(HX0 + (k + 0.5) * bw, HFLOOR, 0);
      m.scale.set(bw * 0.84, 1e-4, 1);
      this.simScene.add(m);
      this.barMeshes.push(m);
    }
    const envPositions = new Float32Array(NBINS * 3);
    for (let k = 0; k < NBINS; k++) {
      envPositions[k * 3] = HX0 + (k + 0.5) * bw;
      envPositions[k * 3 + 1] = HFLOOR;
      envPositions[k * 3 + 2] = 0.012;
    }
    this.histEnvGeom = new THREE.BufferGeometry();
    this.histEnvGeom.setAttribute('position', new THREE.BufferAttribute(envPositions, 3));
    this.simScene.add(new THREE.Line(this.histEnvGeom, envMat));

    this.meanTick = new THREE.Mesh(barGeom,
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95 }));
    this.meanTick.scale.set(0.008, 0.085, 1);
    this.meanTick.position.set(HX0, HFLOOR + 0.0425, 0.02);
    this.meanTick.visible = false;
    this.simScene.add(this.meanTick);
  }

  updateSimScene() {
    if (!this.barMeshes) return;
    for (let i = 0; i < KEEP_PATHS; i++) {
      this.doneLines[i].line.geometry.setDrawRange(0, this.doneVerts[i]);
      this.doneLines[i].attr.needsUpdate = true;
    }
    for (let i = 0; i < MAX_LIVE; i++) {
      this.liveLines[i].line.geometry.setDrawRange(0, this.liveVerts[i]);
      this.liveLines[i].attr.needsUpdate = true;
    }

    let maxBin = 1;
    for (const b of this.bins) if (b > maxBin) maxBin = b;
    for (let k = 0; k < NBINS; k++) {
      const h = Math.max(this.bins[k] / maxBin * HBAR_MAX, 1e-4);
      this.barMeshes[k].scale.y = h;
      this.barMeshes[k].position.y = HFLOOR + h / 2;
    }
    const env = this.histEnvGeom.attributes.position.array;
    for (let k = 0; k < NBINS; k++) {
      const h = Math.min(HBAR_MAX * 1.05, this.totalWalkers * this.binProb[k] / maxBin * HBAR_MAX);
      env[k * 3 + 1] = HFLOOR + h;
    }
    this.histEnvGeom.attributes.position.needsUpdate = true;

    if (this.totalWalkers > 0) {
      const mean = this.sumAbs / this.totalWalkers;
      this.meanTick.position.x = HX0 + Math.min(1, mean / (NBINS * this.binWidth)) * (HX1 - HX0);
      this.meanTick.visible = true;
    } else {
      this.meanTick.visible = false;
    }
  }
}

registerSim(DrunkardsPi);
