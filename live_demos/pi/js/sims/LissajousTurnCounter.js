import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class LissajousTurnCounter extends Simulation {
  static id = 'lissajous-turn-counter';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Lissajous Turn Counter';
  static description = 'Winding-number drawing — pretty phase counting, not standalone π';
  static piMechanism = 'calibrated phase demo: polar turns need a radian angle scale';
  static rigor = 'Extension';
  static sortOrder = 120;
  static piNature = 'extension';
  static piLabel = 'Status';
  static explanation = {
    setup: 'Two perpendicular sinusoidal drives draw a Lissajous curve. The polar angle of the moving point is unwrapped and counted.',
    insight: 'The count tells us winding number. Turning that winding number into π requires measuring polar angle in radians, which already encodes π. For tangled ratios, the curve can also self-intersect or pass near the origin.',
    contrast: 'This is useful as a visual bridge from rotations to winding number, but it is not in the same class as collision, tick, crossing, or area counters.',
    readout: 'The counter reports polar winding number. A numeric π value would require an angle meter already calibrated in radians, so the main readout stays qualitative.',
    formula: 'with external radian angle only: π = unwrapped angle / (2 × turns)',
    getExpected: (params) => {
      const a = params.a || 1;
      const b = params.b || 2;
      return `Drive ratio ${a}:${b}. Count the winding, but treat any π readout as radian-calibrated rather than discovered by the count.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.a = params.a || 1;
    this.b = params.b || 2;
    this.phaseOffset = params.phase || 0.35;
    this.maxTrailLength = 2400;
    this.reset();
  }

  reset() {
    super.reset();
    this.time = 0;
    this.trail = [];
    const p = this.getPointAt(0);
    this.prevAngle = Math.atan2(p[1], p[0]);
    this.unwrapped = this.prevAngle;
    this.turns = 0;
    this.collisionCount = 0;
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'a', label: 'X frequency', min: 1, max: 5, step: 1, default: this.a,
        onChange: (val) => { this.a = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'b', label: 'Y frequency', min: 1, max: 7, step: 1, default: this.b,
        onChange: (val) => { this.b = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'phase', label: 'Phase offset', min: 0.05, max: 1.5, step: 0.05, default: this.phaseOffset,
        onChange: (val) => { this.phaseOffset = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 80, step: 0.1, default: 8 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'xy', label: 'x drive vs y drive', dimension: 2, primary: true, axisLabels: { x: 'x = sin(at)', y: 'y = sin(bt + φ)' } }
    ];
  }

  getPointAt(t) {
    return [
      Math.sin(this.a * t),
      Math.sin(this.b * t + this.phaseOffset)
    ];
  }

  step(dt) {
    this.time += dt;
    const p = this.getPointAt(this.time);
    this.trail.push(p);
    if (this.trail.length > this.maxTrailLength) this.trail.shift();

    const angle = Math.atan2(p[1], p[0]);
    let delta = angle - this.prevAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.unwrapped += delta;
    this.prevAngle = angle;
    const turns = Math.floor(Math.abs(this.unwrapped) / (Math.PI * 2));
    const changed = turns > this.turns;
    this.turns = turns;
    this.collisionCount = turns;
    if (changed) this.pendingPhasePoints.push([...this.getPhasePoint()]);
    return changed;
  }

  getCountLabel() {
    return 'Polar turns';
  }

  getPiApproximation() {
    return this.turns > 0 ? Math.abs(this.unwrapped) / (2 * this.turns) : 0;
  }

  getPiReadout() {
    return this.turns > 0 ? 'radian-calibrated' : 'counting turns';
  }

  getFormulaHTML() {
    return `
      <strong>Lissajous winding</strong>:
      <span class="f-count">${this.turns}</span> polar turn(s) counted<br>
      <span class="f-warning">not count-only</span>:
      unwrap(atan2(y,x)) is already an
      <span class="f-angle">angle-in-radians</span> measurement
    `;
  }

  getPhasePoint() {
    return this.getPointAt(this.time);
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 10);
    this.simCamera.position.z = 1;

    this.curveGeom = new THREE.BufferGeometry();
    this.curveGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxTrailLength * 3), 3));
    this.curveGeom.setDrawRange(0, 0);
    this.curveLine = new THREE.Line(
      this.curveGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.55 })
    );
    this.simScene.add(this.curveLine);
    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 16),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.dot);
  }

  updateSimScene() {
    if (!this.curveGeom) return;
    const pos = this.curveGeom.attributes.position.array;
    for (let i = 0; i < this.trail.length; i++) {
      pos[i * 3] = this.trail[i][0];
      pos[i * 3 + 1] = this.trail[i][1];
      pos[i * 3 + 2] = 0;
    }
    this.curveGeom.attributes.position.needsUpdate = true;
    this.curveGeom.setDrawRange(0, this.trail.length);
    const p = this.getPointAt(this.time);
    this.dot.position.set(p[0], p[1], 0.02);
  }
}

registerSim(LissajousTurnCounter);
