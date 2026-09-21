import * as THREE from 'three';
import { BiasedPiCounter } from '../core/BiasedPiCounter.js';
import { registerSim } from '../core/registry.js';

const TAU = Math.PI * 2;

// A wheel that rolls with SLIP. Perfect rolling lays down exactly pi*d of road
// per rotation, so distance / (d * rotations) = pi. With slip the wheel spins
// more than it advances, so the same distance costs more rotations and the
// odometer reads pi_measured = slip * pi — a biased pi, and the slip is the bias.
export class SlippingDiscOdometer extends BiasedPiCounter {
  static id = 'slipping-disc-odometer';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Slipping Disc Odometer';
  static description = 'A wheel that slips reads a biased π — perfect rolling is exact';
  static piMechanism = 'biased: slip makes the wheel spin more than it rolls → π_measured = slip × π';
  static rigor = 'Biased';
  static piNature = 'biased';
  static sortOrder = 41;
  static explanation = {
    setup: 'A wheel of diameter d rolls along a road. A slip factor s sets how far it advances per spin: at s = 1 it rolls without slipping; below 1 it spins faster than it moves (like a wheel on ice).',
    insight: 'Perfect rolling lays down exactly πd of road per rotation, so distance / (d × rotations) = π. With slip the wheel spins extra, so the same distance takes more rotations and the odometer reads π_measured = s·π — a biased π, with the slip as the bias.',
    formula: 'π_measured = distance / (d × rotations) = slip × π   (π-free)',
    getExpected: (params) => {
      const s = params.slip ?? 0.85;
      return `slip s = ${s.toFixed(2)} → π_measured ≈ ${s.toFixed(2)} × π = ${(s * Math.PI).toFixed(3)}. At s = 1 it is exact.`;
    },
  };

  constructor(params = {}) {
    super(params);
    this.slip = params.slip ?? 0.85;
    this.diameter = 1;
    this.spinRate = 32;
    this.reset();
  }

  reset() {
    super.reset();
    this.theta = 0;        // wheel rotation angle
    this.distance = 0;     // road distance advanced
    this.turns = 0;
    this.collisionCount = 0;
    this.finished = false;
  }

  idealKnobValue() { return 1; }
  biasSource() { return 'slip: the wheel spins more than it advances'; }

  getControls() {
    return [
      { type: 'slider', id: 'slip', label: 'Slip (1 = no slip)', min: 0.4, max: 1, step: 0.01, default: this.slip,
        onChange: (v) => { this.slip = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 40, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{ id: 'pi-vs-turns', label: 'π reading vs turns', dimension: 2, primary: true, boundary: 'none',
      axisLabels: { x: 'turns', y: 'π reading − π' } }];
  }

  step(dt) {
    const dtheta = this.spinRate * dt;
    this.theta += dtheta;
    this.distance += this.slip * (this.diameter / 2) * dtheta;   // L = s·r·θ
    this.turns = this.theta / TAU;
    this.collisionCount = Math.floor(this.turns);
    return true;
  }

  getCountLabel() { return 'Rotations'; }
  getCollisionCount() { return Math.floor(this.turns); }

  measuredPi() {
    return this.turns > 1e-6 ? this.distance / (this.diameter * this.turns) : NaN;  // = slip·π, π-free
  }
  getBand() { return null; }   // constant slip → no spread; the bias is the honest Δ

  getPhasePoint() {
    const m = this.measuredPi();
    const x = Math.max(-1, Math.min(1, (this.turns % 6) / 6 * 2 - 1));
    const y = Math.max(-1, Math.min(1, Number.isFinite(m) ? (m - Math.PI) / 1.5 : 0));
    return [x, y];
  }

  // --- rendering ---
  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.2, 4.0, 1.7, -0.35, 0.1, 10);
    this.simCamera.position.z = 1;

    // road
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(4.0, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));

    // tick rail (one diameter apart) + minor ticks
    const major = [];
    for (let x = 0; x <= 4.0; x += this.diameter) major.push(new THREE.Vector3(x, -0.05, 0), new THREE.Vector3(x, 0.05, 0));
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(major),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.7 })));
    const minor = [];
    for (let x = 0; x <= 4.0; x += this.diameter / 10) minor.push(new THREE.Vector3(x, -0.025, 0), new THREE.Vector3(x, 0.025, 0));
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(minor),
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.3 })));

    // ghost wheel: where a NO-SLIP wheel would be (ahead of the slipping one)
    this.ghost = new THREE.Mesh(
      new THREE.RingGeometry(this.diameter / 2 * 0.97, this.diameter / 2, 48),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    this.simScene.add(this.ghost);

    // wheel body + radius mark (rotates at theta)
    this.wheel = new THREE.Group();
    this.wheel.add(new THREE.Mesh(
      new THREE.CircleGeometry(this.diameter / 2, 48),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.16 })));
    this.wheel.add(new THREE.Mesh(
      new THREE.RingGeometry(this.diameter / 2 * 0.94, this.diameter / 2, 48),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide })));
    this.wheel.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(this.diameter / 2, 0, 0.02)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })));
    this.simScene.add(this.wheel);

    this._place();
  }

  _place() {
    if (!this.wheel) return;
    const r = this.diameter / 2;
    const win = 3.0;
    const dispX = 0.6 + (this.distance % win);
    this.wheel.position.set(dispX, r, 0);
    this.wheel.rotation.z = -this.theta;
    if (this.ghost) {
      // no-slip wheel: would have advanced r*theta instead of slip*r*theta
      const noSlip = (this.theta * r);
      const ghostX = 0.6 + (noSlip % win);
      this.ghost.position.set(ghostX, r, -0.01);
    }
  }

  updateSimScene() { this._place(); }
}

registerSim(SlippingDiscOdometer);
