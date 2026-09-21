import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class CoupledOscillatorWinding extends Simulation {
  static id = 'coupled-oscillator-winding';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Coupled Oscillator Winding';
  static description = 'Phase-winding intuition — useful, but not count-only π';
  static piMechanism = 'calibrated phase demo: windings become π only with a radian scale';
  static rigor = 'Extension';
  static sortOrder = 119;
  static piNature = 'extension';
  static piLabel = 'Status';
  static explanation = {
    setup: 'Two coupled oscillators are viewed through one normal-mode phase portrait. The point winds around an ellipse while the two masses trade displacement and velocity.',
    insight: 'Counting windings gives cycles, not π by itself. To say one cycle is 2π radians, the apparatus already needs a radian phase calibration. That makes this a phase intuition demo rather than an independent π counter.',
    contrast: 'Unlike the block or Reuleaux odometer demos, there is no integer event whose count directly encodes π digits. The count is topological; the π value comes from the chosen angular unit.',
    readout: 'The counter reports phase-space windings. The status field deliberately avoids a numeric π because the missing ingredient is an external radian calibration.',
    formula: 'with external radian calibration only: π = measured phase / (2 × windings)',
    getExpected: () => 'Use this to see why phase portraits involve 2π per loop. It is not a count-only way to discover π.'
  };

  constructor(params = {}) {
    super(params);
    this.coupling = params.coupling || 0.35;
    this.reset();
  }

  reset() {
    super.reset();
    this.time = 0;
    this.omega = Math.sqrt(1 + 2 * this.coupling);
    this.prevPhase = 0;
    this.unwrappedPhase = 0;
    this.windings = 0;
    this.collisionCount = 0;
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'coupling', label: 'Coupling',
        min: 0.05, max: 1.2, step: 0.05, default: this.coupling,
        onChange: (val) => { this.coupling = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 8 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'phase',
        label: 'normal coordinate q vs p',
        dimension: 2,
        primary: true,
        axisLabels: { x: 'q normal mode', y: 'p / ω' }
      }
    ];
  }

  step(dt) {
    this.time += dt;
    const phase = this.omega * this.time;
    this.unwrappedPhase = phase;
    const turns = Math.floor(phase / (Math.PI * 2));
    const collided = turns > this.windings;
    this.windings = turns;
    this.collisionCount = turns;
    if (collided) this.pendingPhasePoints.push([...this.getPhasePoint()]);
    return collided;
  }

  getCountLabel() {
    return 'Windings';
  }

  getPiApproximation() {
    return this.windings > 0 ? this.unwrappedPhase / (2 * this.windings) : 0;
  }

  getPiReadout() {
    return this.windings > 0 ? 'radian-calibrated' : 'counting loops';
  }

  getFormulaHTML() {
    return `
      <strong>phase winding</strong>:
      <span class="f-count">${this.windings}</span> loop(s) counted<br>
      <span class="f-warning">not count-only</span>:
      π needs the external convention
      <span class="f-angle">1 loop = 2π radians</span>
    `;
  }

  getPhasePoint() {
    const phase = this.omega * this.time;
    return [Math.cos(phase), -Math.sin(phase)];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.25, 1.25, 0.65, -0.35, 0.1, 10);
    this.simCamera.position.z = 1;

    this.massA = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.massB = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.massA, this.massB);

    this.springGeom = new THREE.BufferGeometry();
    this.springLine = new THREE.Line(
      this.springGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.75 })
    );
    this.simScene.add(this.springLine);
  }

  updateSimScene() {
    if (!this.massA) return;
    const phase = this.omega * this.time;
    const anti = 0.28 * Math.cos(phase);
    const common = 0.08 * Math.cos(this.time);
    const xA = -0.42 + common + anti;
    const xB = 0.42 + common - anti;
    this.massA.position.set(xA, 0.1, 0);
    this.massB.position.set(xB, 0.1, 0);

    const pts = [];
    const coils = 12;
    for (let i = 0; i <= coils; i++) {
      const t = i / coils;
      pts.push(new THREE.Vector3(
        xA + (xB - xA) * t,
        0.1 + (i % 2 === 0 ? -0.035 : 0.035),
        0.02
      ));
    }
    this.springGeom.setFromPoints(pts);
  }
}

registerSim(CoupledOscillatorWinding);
