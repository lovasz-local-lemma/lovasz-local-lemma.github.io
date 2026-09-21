import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

const FLYWHEEL_PROFILES = {
  'solid-disk': { label: 'Solid disk flywheel', inertiaFactor: 0.5, note: 'I = 1/2 mr²' },
  hoop: { label: 'Hoop flywheel', inertiaFactor: 1.0, note: 'I = mr²' },
  'solid-sphere': { label: 'Solid sphere rotor', inertiaFactor: 0.4, note: 'I = 2/5 mr²' },
  'hollow-sphere': { label: 'Hollow sphere rotor', inertiaFactor: 2 / 3, note: 'I = 2/3 mr²' },
};

export class GearRackCounter extends Simulation {
  static id = 'gear-rack-counter';
  static hubHidden = true;   // folded into 'rolling-sliding' (gear realization); still loadable by id
  static previewSteps = 15;   // closest approach
  static title = 'Gear Rack Counter';
  static description = 'Rack-and-flywheel analog — an unwrapped tooth coordinate reproduces the exact two-mode circle';
  static piMechanism = 'exact analog: rack mass vs flywheel contact inertia → π';
  static rigor = 'Exact Analog';
  static sortOrder = 36;
  static alternatives = [
    { id: 'rolling-sliding', label: 'Rolling body analog' },
    { id: 'reuleaux-collision-lab', label: 'Reuleaux collision lab' }
  ];
  static explanation = {
    setup: 'A light rack sits between a wall and a heavy flywheel. The flywheel is modeled through its unwrapped tooth-contact coordinate q_tooth = rθ, so the rack edge and a flywheel tooth meet like two collision coordinates on a line.',
    insight: 'Once tooth motion is unwrapped, the flywheel contributes an effective linear mass I/r² and a tooth speed v_tooth = rω. Choosing I/r² = 100ⁿ makes the collision angle α = arctan(10⁻ⁿ), so the collision count can be read by placing the decimal point n places from the right. The flywheel profile changes the physical mass needed to realize that inertia, not the calibrated count.',
    contrast: 'Rolling & Sliding hides rotation inside the rolling disc’s effective mass. Gear Rack is different: the rotational coordinate is not hidden, it is unwrapped into a straight tooth coordinate. The rack never needs to “hit the visual wheel body”; it hits the wheel’s contact coordinate.',
    formula: 'count digits directly: π ≈ collisions / 10ⁿ, with exact angle α = arctan(√(m_rack / (I/r²)))',
    getExpected: (params) => {
      const n = params.n || 2;
      const profile = FLYWHEEL_PROFILES[params.profile] || FLYWHEEL_PROFILES['solid-disk'];
      const effective = Math.pow(100, n);
      const alpha = Math.atan(1 / Math.sqrt(effective));
      const expected = Math.floor(Math.PI / alpha);
      return `For n=${n}, ${profile.label}: effective flywheel mass I/r² = 100^${n} = ${effective.toLocaleString()}. Expect ${expected} rack-tooth collisions.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.profileKey = params.profile || 'solid-disk';
    this.initialVelocity = params.velocity || 1;
    this.reset();
  }

  reset() {
    super.reset();
    this.mRack = 1;
    this.r = 0.08;
    this.profile = FLYWHEEL_PROFILES[this.profileKey] || FLYWHEEL_PROFILES['solid-disk'];
    this.mFlywheel = Math.pow(100, this.n);
    this.physicalWheelMass = this.mFlywheel / this.profile.inertiaFactor;
    this.I = this.physicalWheelMass * this.profile.inertiaFactor * this.r * this.r;
    this.xRack = 0.28;
    this.qWheel = 0.68;
    this.vRack = 0;
    this.vWheel = -this.initialVelocity;
    this.rackSize = 0.08;
    this.finished = false;
    this.collisionEffects = [];
  }

  getControls() {
    return [
      {
        type: 'select',
        id: 'profile',
        label: 'Flywheel profile',
        default: this.profileKey,
        options: Object.entries(FLYWHEEL_PROFILES).map(([value, profile]) => ({
          value,
          label: profile.label
        })),
        onChange: (val) => { this.profileKey = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'n', label: 'Inertia exponent (100ⁿ)',
        min: 1, max: 6, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'velocity', label: 'Initial Contact Speed',
        min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'Q-rack-tooth',
        label: 'Q_rack vs Q_tooth (rescaled momenta)',
        dimension: 2,
        primary: true,
        axisLabels: {
          x: 'Q_rack = sqrt(m) v_rack',
          y: 'Q_tooth = sqrt(I/r²) v_tooth'
        }
      },
      {
        id: 'v-rack-tooth',
        label: 'v_rack vs v_tooth',
        dimension: 2,
        axisLabels: {
          x: 'v_rack / v0',
          y: 'v_tooth / v0 = rω / v0'
        }
      }
    ];
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();

    while (remaining > 1e-15) {
      let tWall = Infinity;
      if (this.vRack < 0 && this.xRack > 0) {
        tWall = this.xRack / (-this.vRack);
      }

      let tContact = Infinity;
      const gap = this.qWheel - this.xRack - this.rackSize;
      const closing = this.vRack - this.vWheel;
      if (closing > 0 && gap > 0) {
        tContact = gap / closing;
      }

      const tNext = Math.min(tWall, tContact);
      if (tNext > remaining) {
        this.xRack += this.vRack * remaining;
        this.qWheel += this.vWheel * remaining;
        break;
      }

      this.xRack += this.vRack * tNext;
      this.qWheel += this.vWheel * tNext;
      remaining -= tNext;

      if (tWall <= tContact) {
        this.xRack = 0;
        this.vRack = Math.abs(this.vRack);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0.0, y: 0.07, time: now, type: 'wall' });
      } else {
        const ov1 = this.vRack;
        const ov2 = this.vWheel;
        this.vRack = ((this.mRack - this.mFlywheel) * ov1 + 2 * this.mFlywheel * ov2) / (this.mRack + this.mFlywheel);
        this.vWheel = ((this.mFlywheel - this.mRack) * ov2 + 2 * this.mRack * ov1) / (this.mRack + this.mFlywheel);
        this.xRack = this.qWheel - this.rackSize;
        this.collisionCount++;
        this.collisionEffects.push({ x: this.qWheel, y: 0.09, time: now, type: 'block' });
      }

      collided = true;
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      if (this.getRawPhasePoint) this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
    }

    if (this.vRack >= 0 && this.vWheel > 0 && this.vWheel >= this.vRack) {
      this.finished = true;
    }

    return collided;
  }

  getPiApproximation() {
    const alpha = Math.atan(Math.sqrt(this.mRack / this.mFlywheel));
    return this.collisionCount * alpha;
  }

  getPiReadout() {
    return (this.collisionCount / Math.pow(10, this.n)).toFixed(this.n + 2);
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const alpha = Math.atan(1 / scale);
    const digitRead = count / scale;
    const angleRead = count * alpha;
    return `
      <strong>rack-to-tooth coordinate</strong>:
      <span class="f-mass">${this.profile.label}</span>,
      <span class="f-mass">${this.profile.note}</span><br>
      <span class="f-mass">I/r² = 100^${this.n}</span>,
      <span class="f-mass">wheel mass = ${this.physicalWheelMass.toExponential(2)}</span><br>
      <span class="f-angle">α = atan(1/10^${this.n})</span>;
      <span class="f-result">π digits</span> ≈
      <span class="f-count">${count}</span> /
      <span class="f-angle">10^${this.n}</span> =
      <span style="font-size:1.1em">${piDigitsHTML(digitRead, this.n + 2)}</span>
      <span class="f-muted">(Nα = ${angleRead.toFixed(6)})</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.mRack) * this.vRack;
    const q2 = Math.sqrt(this.mFlywheel) * this.vWheel;
    const R = Math.sqrt(this.mFlywheel) * this.initialVelocity;
    const vScale = this.initialVelocity || 1;
    return [
      q1 / R,
      q2 / R,
      this.vRack / vScale,
      this.vWheel / vScale,
    ];
  }

  getRawPhasePoint() {
    const p1 = this.mRack * this.vRack;
    const p2 = this.mFlywheel * this.vWheel;
    const R = this.mFlywheel * this.initialVelocity;
    return [p1 / R, p2 / R];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'v-rack-tooth') return (pt) => [pt[2], pt[3]];
    return (pt) => [pt[0], pt[1]];
  }

  // Hub thumbnail focus: wall + rack + flywheel.
  getPreviewBox() {
    const x1 = Math.max(0.6, this.qWheel + 0.09 + 0.14);
    return { x0: -0.06, x1, y0: -0.06, y1: 0.34 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.1, 0.55, -0.12, 0.1, 10);
    this.simCamera.position.z = 1;

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(0.018, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    wall.position.set(-0.009, 0.14, 0);
    this.simScene.add(wall);

    const track = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.05, 0, 0),
        new THREE.Vector3(1.05, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })
    );
    this.simScene.add(track);

    this.rackHeight = 0.09;
    this.rackMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.rackSize, this.rackHeight),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.9 })
    );
    this.simScene.add(this.rackMesh);

    this.flywheel = new THREE.Group();
    const wheel = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.09, 48),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    this.flywheel.add(wheel);
    const spokes = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spoke = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.085 * Math.cos(a), 0.085 * Math.sin(a), 0)
        ]),
        new THREE.LineBasicMaterial({ color: 0xffffff })
      );
      spokes.push(spoke);
      this.flywheel.add(spoke);
    }
    this.flywheel.position.set(this.qWheel + 0.09, 0.09, 0);
    this.simScene.add(this.flywheel);

    this.contactMarker = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 16),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.9 })
    );
    this.simScene.add(this.contactMarker);

    this.gapLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    this.gapLine = new THREE.Line(
      this.gapLineGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.42 })
    );
    this.simScene.add(this.gapLine);
  }

  updateSimScene() {
    if (!this.rackMesh || !this.flywheel) return;

    this.rackMesh.position.set(this.xRack + this.rackSize / 2, this.rackHeight / 2, 0);
    this.flywheel.position.set(this.qWheel + 0.09, 0.09, 0);
    this.flywheel.rotation.z = -(this.qWheel - 0.68) / this.r;
    this.contactMarker.position.set(this.qWheel, 0.09, 0.04);

    const rightEdge = this.xRack + this.rackSize;
    const pos = this.gapLineGeom.attributes.position.array;
    pos[0] = rightEdge; pos[1] = 0.09; pos[2] = 0.02;
    pos[3] = this.qWheel; pos[4] = 0.09; pos[5] = 0.02;
    this.gapLineGeom.attributes.position.needsUpdate = true;
  }
}

registerSim(GearRackCounter);
