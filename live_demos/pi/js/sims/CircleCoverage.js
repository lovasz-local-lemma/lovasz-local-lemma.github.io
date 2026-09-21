import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

export class CircleCoverage extends Simulation {
  static id = 'circle-coverage';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Circle Coverage';
  static description = 'Area-coverage counter — random dots measure a circle inside a square';
  static piMechanism = 'statistical: π = 4 · inside / total';
  static rigor = 'Statistical';
  static sortOrder = 64;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static alternatives = [
    { id: 'sphere-volume-mc', label: 'Back: Monte Carlo geometry' },
    { id: 'gauss-circle-lattice', label: 'Gauss circle lattice' },
  ];
  static explanation = {
    setup: 'Throw random points into a square that just contains a unit circle. Count how many points land inside the circle.',
    insight: 'The area ratio between the unit circle and its bounding square is π / 4. So the running count gives π ≈ 4 · inside / total.',
    contrast: 'This is the honest version of the space-coverage idea for chaotic systems: once collision count stops meaning π, estimate a geometric measure instead.',
    formula: 'π ≈ 4 · inside / total',
    getExpected: () => 'The estimate jitters early and settles slowly. It is valid statistically, not digit-by-digit.'
  };

  constructor(params = {}) {
    super(params);
    this.batch = params.batch || 5;
    this.maxPoints = 2500;
    this.maxTrailLength = 5000;
    this.reset();
  }

  reset() {
    super.reset();
    this.samples = 0;
    this.inside = 0;
    this.collisionCount = 0;
    this.points = [];
    this.lastPhasePoint = [0, 0];
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'batch', label: 'Dots / tick',
        min: 1, max: 40, step: 1, default: this.batch,
        onChange: (val) => { this.batch = val; }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'x-y', label: 'Sample x vs y', dimension: 2, primary: true }
    ];
  }

  step() {
    const count = Math.max(1, Math.round(this.batch));
    for (let i = 0; i < count; i++) {
      this._samplePoint();
      this.pendingPhasePoints.push([...this.lastPhasePoint]);
    }
    return true;
  }

  _samplePoint() {
    const x = -1 + Math.random() * 2;
    const y = -1 + Math.random() * 2;
    const isInside = x * x + y * y <= 1;

    this.samples++;
    if (isInside) this.inside++;
    this.collisionCount = this.inside;
    this.lastPhasePoint = [x, y];

    this.points.push({ x, y, isInside });
    if (this.points.length > this.maxPoints) this.points.shift();
  }

  getCollisionCount() {
    return `${this.inside}/${this.samples}`;
  }

  getCountLabel() {
    return 'Inside / total';
  }

  getPiApproximation() {
    return this.samples > 0 ? 4 * this.inside / this.samples : 0;
  }

  getPiReadout() {
    return this.samples > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const live = this.samples > 0
      ? piDigitsHTML(this.getPiApproximation(), 4)
      : 'collecting…';
    return `
      <strong>area ratio</strong>:
      <span class="f-angle">circle / square = π / 4</span><br>
      <span class="f-result">π</span> ≈
      4 · <span class="f-count">${this.inside}</span> /
      <span class="f-count">${this.samples}</span>
      <br><span style="font-size:1.1em">π = ${live}</span>
    `;
  }

  getPhasePoint() {
    return [...this.lastPhasePoint];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, 0.1, 10);
    this.simCamera.position.z = 1;

    const squarePts = [
      new THREE.Vector3(-1, -1, 0),
      new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(-1, 1, 0),
      new THREE.Vector3(-1, -1, 0),
    ];
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(squarePts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
    ));

    const circle = new THREE.Mesh(
      new THREE.RingGeometry(0.995, 1.0, 128),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    this.simScene.add(circle);

    this.insideGeom = new THREE.BufferGeometry();
    this.insideGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 3), 3));
    this.insideGeom.setDrawRange(0, 0);
    this.insidePoints = new THREE.Points(
      this.insideGeom,
      new THREE.PointsMaterial({ color: 0x4cc9f0, size: 0.018, transparent: true, opacity: 0.9 })
    );
    this.simScene.add(this.insidePoints);

    this.outsideGeom = new THREE.BufferGeometry();
    this.outsideGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 3), 3));
    this.outsideGeom.setDrawRange(0, 0);
    this.outsidePoints = new THREE.Points(
      this.outsideGeom,
      new THREE.PointsMaterial({ color: 0xe94560, size: 0.018, transparent: true, opacity: 0.65 })
    );
    this.simScene.add(this.outsidePoints);
  }

  updateSimScene() {
    if (!this.insideGeom || !this.outsideGeom) return;

    const insidePos = this.insideGeom.attributes.position.array;
    const outsidePos = this.outsideGeom.attributes.position.array;
    let insideIndex = 0;
    let outsideIndex = 0;

    for (const point of this.points) {
      const target = point.isInside ? insidePos : outsidePos;
      const i = point.isInside ? insideIndex : outsideIndex;
      target[i * 3] = point.x;
      target[i * 3 + 1] = point.y;
      target[i * 3 + 2] = 0;
      if (point.isInside) insideIndex++;
      else outsideIndex++;
    }

    this.insideGeom.attributes.position.needsUpdate = true;
    this.outsideGeom.attributes.position.needsUpdate = true;
    this.insideGeom.setDrawRange(0, insideIndex);
    this.outsideGeom.setDrawRange(0, outsideIndex);
  }
}

registerSim(CircleCoverage);
