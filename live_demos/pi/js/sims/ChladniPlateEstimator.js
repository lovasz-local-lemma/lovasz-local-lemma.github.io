import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class ChladniPlateEstimator extends Simulation {
  static id = 'chladni-plate-estimator';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Chladni Plate Estimator';
  static description = 'Pattern-area estimator — vibration nodes become a geometric Monte Carlo mask';
  static piMechanism = 'experimental statistical: sample area inside a nodal ring';
  static rigor = 'Experimental';
  static sortOrder = 122;
  static piNature = 'statistical';
  static piLabel = 'π est';
  static explanation = {
    setup: 'A stylized vibrating plate shows a circular nodal ring. Random grains land on the plate, and the estimator counts how many fall inside that ring.',
    insight: 'The nodal ring acts like a physical mask. The area ratio inside the ring gives πr² / (2r)² = π/4, so π ≈ 4 × inside / total.',
    contrast: 'A real Chladni plate has much richer mode shapes. This version keeps the plate language but uses a circular nodal region so the estimator has a clear π target.',
    formula: 'π ≈ 4 × inside / total',
    getExpected: () => 'This is statistical: it starts noisy and converges slowly like any area-sampling Monte Carlo estimate.'
  };

  constructor(params = {}) {
    super(params);
    this.batch = params.batch || 12;
    this.maxPoints = 2200;
    this.reset();
  }

  reset() {
    super.reset();
    this.samples = 0;
    this.inside = 0;
    this.points = [];
    this.lastPhasePoint = [0, 0];
    this.collisionCount = 0;
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'batch', label: 'Grains / tick', min: 1, max: 60, step: 1, default: this.batch,
        onChange: (val) => { this.batch = val; } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'grain-x-y', label: 'grain x vs y', dimension: 2, primary: true, axisLabels: { x: 'grain x', y: 'grain y' } }
    ];
  }

  step() {
    for (let i = 0; i < Math.max(1, Math.round(this.batch)); i++) {
      const x = -1 + Math.random() * 2;
      const y = -1 + Math.random() * 2;
      const isInside = x * x + y * y <= 1;
      this.samples++;
      if (isInside) this.inside++;
      this.collisionCount = this.inside;
      this.lastPhasePoint = [x, y];
      this.points.push({ x, y, isInside });
      if (this.points.length > this.maxPoints) this.points.shift();
      this.pendingPhasePoints.push([x, y]);
    }
    return true;
  }

  getCountLabel() {
    return 'Inside / grains';
  }

  getCollisionCount() {
    return `${this.inside}/${this.samples}`;
  }

  getPiApproximation() {
    return this.samples > 0 ? 4 * this.inside / this.samples : 0;
  }

  getPiReadout() {
    return this.samples > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const value = this.samples > 0 ? this.getPiApproximation().toFixed(6) : 'n/a';
    return `
      <strong>nodal-ring area</strong>:
      <span class="f-angle">inside / plate = π / 4</span><br>
      <span class="f-result">π</span> ≈
      4 · <span class="f-count">${this.inside}</span> /
      <span class="f-count">${this.samples}</span> =
      <span class="f-result">${value}</span>
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
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    ));
    this.simScene.add(new THREE.Mesh(
      new THREE.RingGeometry(0.995, 1.005, 160),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    ));

    this.insideGeom = new THREE.BufferGeometry();
    this.insideGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 3), 3));
    this.outsideGeom = new THREE.BufferGeometry();
    this.outsideGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 3), 3));
    this.insidePoints = new THREE.Points(
      this.insideGeom,
      new THREE.PointsMaterial({ color: 0x4cc9f0, size: 0.018, transparent: true, opacity: 0.9 })
    );
    this.outsidePoints = new THREE.Points(
      this.outsideGeom,
      new THREE.PointsMaterial({ color: 0xe94560, size: 0.018, transparent: true, opacity: 0.62 })
    );
    this.simScene.add(this.insidePoints, this.outsidePoints);
  }

  updateSimScene() {
    if (!this.insideGeom) return;
    const inside = this.insideGeom.attributes.position.array;
    const outside = this.outsideGeom.attributes.position.array;
    let ii = 0;
    let oi = 0;
    for (const point of this.points) {
      const arr = point.isInside ? inside : outside;
      const idx = point.isInside ? ii++ : oi++;
      arr[idx * 3] = point.x;
      arr[idx * 3 + 1] = point.y;
      arr[idx * 3 + 2] = 0;
    }
    this.insideGeom.attributes.position.needsUpdate = true;
    this.outsideGeom.attributes.position.needsUpdate = true;
    this.insideGeom.setDrawRange(0, ii);
    this.outsideGeom.setDrawRange(0, oi);
  }
}

registerSim(ChladniPlateEstimator);
