import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class BuffonCrossGrid extends Simulation {
  static id = 'buffon-cross-grid';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Buffon Cross Grid';
  static description = 'Buffon needles on a perpendicular grid — counts both H and V crossings';
  static piMechanism = 'statistical: expected total crossings per drop = 4L / (πd)';
  static rigor = 'Statistical';
  static sortOrder = 76;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static explanation = {
    setup: 'Drop equal-length needles onto a square grid of perpendicular lines (spacing d both ways). Each needle can cross 0, 1, or 2 lines.',
    insight: 'For a needle of length L < d, the expected number of horizontal crossings per drop is 2L/(πd) and the same for vertical. Linearity of expectation gives total expected crossings 4L/(πd) per drop, so π ≈ 4 L N / (d C), where C is the running total crossings count.',
    contrast: 'Compared to ordinary Buffon (parallel lines), counting crossings on a perpendicular grid roughly doubles the data per drop. Same Monte Carlo rate, but each drop carries twice the information.',
    formula: 'π ≈ 4 L N_drops / (d · N_crossings)',
    getExpected: (params) => {
      const ratio = params.lengthRatio || 0.7;
      return `Needle length is ${ratio.toFixed(2)} d. Each drop is expected to give ${(4 * ratio / Math.PI).toFixed(3)} crossings on average.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.lengthRatio = params.lengthRatio || 0.7;
    this.batch = params.batch || 4;
    this.maxNeedles = 360;
    this.reset();
  }

  reset() {
    super.reset();
    this.spacing = 0.32;
    this.needleLength = this.lengthRatio * this.spacing;
    this.tosses = 0;
    this.crossingsH = 0;
    this.crossingsV = 0;
    this.collisionCount = 0;
    this.needles = [];
    this.lastPhasePoint = [0, 0];
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'lengthRatio', label: 'Needle / spacing',
        min: 0.1, max: 1, step: 0.05, default: this.lengthRatio,
        onChange: (val) => { this.lengthRatio = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'batch', label: 'Drops / tick', min: 1, max: 30, step: 1, default: this.batch,
        onChange: (val) => { this.batch = val; } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'a-d', label: 'angle vs nearest-line distance', dimension: 2, primary: true,
        axisLabels: { x: 'cos θ of the needle', y: 'distance to nearer line' } }
    ];
  }

  step() {
    const k = Math.max(1, Math.round(this.batch));
    for (let i = 0; i < k; i++) {
      this._dropNeedle();
      this.pendingPhasePoints.push([...this.lastPhasePoint]);
    }
    return true;
  }

  _dropNeedle() {
    // Both axes must span an EXACT number of grid periods (6 × 0.32 = 1.92): a
    // fractional window skews the distance-to-line distributions and biases π̂.
    const x = -0.96 + Math.random() * 1.92;
    const y = -0.96 + Math.random() * 1.92;
    // π-FREE ORIENTATION. Drawing `Math.random() * Math.PI` and taking cos/sin
    // would put the literal π INSIDE the estimator: the crossing tests below are
    // decided by (dx, dy), and π̂ = 4·L·N/(d·C) reads that crossing count, so the
    // constant — not the geometry — would be what makes the answer land on π.
    // Instead sample a uniform direction by rejection on the unit disk (the same
    // sampler BuffonNeedle uses), which calls no trigonometry at all. Flipping to
    // the upper half-plane is free: a needle and its reverse cross identically.
    let ux, uy, r2;
    do { ux = 2 * Math.random() - 1; uy = 2 * Math.random() - 1; r2 = ux * ux + uy * uy; }
    while (r2 > 1 || r2 === 0);
    const inv = 1 / Math.sqrt(r2);
    let c = ux * inv, s = uy * inv;
    if (s < 0) { c = -c; s = -s; }
    const half = this.needleLength / 2;
    const dx = half * c;
    const dy = half * s;

    const nearestY = Math.round(y / this.spacing) * this.spacing;
    const dyToLine = y - nearestY;
    const crossesH = Math.abs(dyToLine) <= Math.abs(dy);

    const nearestX = Math.round(x / this.spacing) * this.spacing;
    const dxToLine = x - nearestX;
    const crossesV = Math.abs(dxToLine) <= Math.abs(dx);

    this.tosses++;
    if (crossesH) this.crossingsH++;
    if (crossesV) this.crossingsV++;
    this.collisionCount = this.crossingsH + this.crossingsV;

    this.needles.push({
      x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy,
      crossesH, crossesV
    });
    if (this.needles.length > this.maxNeedles) this.needles.shift();

    // Abscissa is cos θ of the sampled direction — already in [−1, 1], so the
    // plot needs no π to normalise it either.
    this.lastPhasePoint = [
      c,
      Math.max(-1, Math.min(1, dyToLine / this.spacing))
    ];
  }

  getCollisionCount() {
    return `${this.collisionCount}/${this.tosses}`;
  }

  getCountLabel() {
    return 'Crossings (H+V) / drops';
  }

  getPiApproximation() {
    if (this.collisionCount === 0) return 0;
    return (4 * this.needleLength * this.tosses) / (this.spacing * this.collisionCount);
  }

  getPiReadout() {
    return this.collisionCount > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const value = this.collisionCount > 0 ? this.getPiApproximation().toFixed(6) : 'n/a';
    return `
      <strong>cross-grid Buffon</strong>:
      <span class="f-angle">E[crossings] = 4L / (πd) per drop</span><br>
      <span class="f-result">π</span> ≈
      4 · <span class="f-angle">${this.lengthRatio.toFixed(2)}d</span> ·
      <span class="f-count">${this.tosses}</span> /
      (<span class="f-angle">d</span> ·
      <span class="f-count">${this.collisionCount}</span>) =
      <span class="f-result">${value}</span>
    `;
  }

  getPhasePoint() {
    return [...this.lastPhasePoint];
  }

  getPhaseExtractor() { return (pt) => pt; }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 10);
    this.simCamera.position.z = 1;

    const linePts = [];
    for (let v = -1; v <= 1.001; v += this.spacing) {
      linePts.push(new THREE.Vector3(-1, v, 0), new THREE.Vector3(1, v, 0));
      linePts.push(new THREE.Vector3(v, -1, 0), new THREE.Vector3(v, 1, 0));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(linePts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 })
    ));

    this.bothGeom = new THREE.BufferGeometry();
    this.bothGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxNeedles * 6), 3));
    this.bothGeom.setDrawRange(0, 0);
    this.bothLines = new THREE.LineSegments(
      this.bothGeom,
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.95 })
    );
    this.simScene.add(this.bothLines);

    this.oneGeom = new THREE.BufferGeometry();
    this.oneGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxNeedles * 6), 3));
    this.oneGeom.setDrawRange(0, 0);
    this.oneLines = new THREE.LineSegments(
      this.oneGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.85 })
    );
    this.simScene.add(this.oneLines);

    this.missGeom = new THREE.BufferGeometry();
    this.missGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxNeedles * 6), 3));
    this.missGeom.setDrawRange(0, 0);
    this.missLines = new THREE.LineSegments(
      this.missGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.55 })
    );
    this.simScene.add(this.missLines);
  }

  updateSimScene() {
    if (!this.bothGeom) return;
    const both = this.bothGeom.attributes.position.array;
    const one = this.oneGeom.attributes.position.array;
    const miss = this.missGeom.attributes.position.array;
    let bi = 0, oi = 0, mi = 0;
    for (const n of this.needles) {
      const cross = (n.crossesH ? 1 : 0) + (n.crossesV ? 1 : 0);
      let arr; let idx;
      if (cross === 2) { arr = both; idx = bi++; }
      else if (cross === 1) { arr = one; idx = oi++; }
      else { arr = miss; idx = mi++; }
      arr[idx * 6] = n.x1; arr[idx * 6 + 1] = n.y1; arr[idx * 6 + 2] = 0;
      arr[idx * 6 + 3] = n.x2; arr[idx * 6 + 4] = n.y2; arr[idx * 6 + 5] = 0;
    }
    this.bothGeom.attributes.position.needsUpdate = true;
    this.oneGeom.attributes.position.needsUpdate = true;
    this.missGeom.attributes.position.needsUpdate = true;
    this.bothGeom.setDrawRange(0, bi * 2);
    this.oneGeom.setDrawRange(0, oi * 2);
    this.missGeom.setDrawRange(0, mi * 2);
  }
}

registerSim(BuffonCrossGrid);
