import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

const TAU = Math.PI * 2;
const REULEAUX_INERTIA_FACTOR = 0.11;

export class ReuleauxRailPi extends Simulation {
  static id = 'reuleaux-rail-pi';
  static title = 'Reuleaux Odometer π';
  static description = 'Constant-width roller — rail tick counting via support-radius rolling';
  static piMechanism = 'counting: one no-slip turn crosses perimeter / width rail ticks';
  static rigor = 'Statistical / Geometric';
  static sortOrder = 118;
  static hubHidden = true;
  static piNature = 'statistical';
  static piLabel = 'π count';
  static alternatives = [
    { id: 'reuleaux-collision-lab', label: 'Collision lab' },
    { id: 'rolling-shape-odometer', label: 'Rolling shape odometer' },
    { id: 'slipping-disc-odometer', label: 'Slipping disc odometer' },
  ];
  static explanation = {
    setup: 'A Reuleaux triangle of width w rolls without slipping between two parallel rails. A mark on the body counts full turns; the lower rail counts ticks spaced w / 10^n apart.',
    insight: 'The clean Reuleaux way to get π is not collision count. It is odometry: for a convex constant-width body, one no-slip revolution advances by its perimeter, and Barbier’s theorem gives perimeter = πw. The app now uses the current support radius r_support(θ), so unwrapped roll speed and angular speed separate through u = r_support(θ)ω instead of pretending the shape is a circle.',
    contrast: 'A circular roller has constant r_support, so its phase-space speed relation is a straight line. The Reuleaux roller keeps constant width, but its support radius changes with orientation; the π readout comes from counted rail distance after completed turns.',
    readout: 'The main counter is ticks-at-completed-turns / completed-turns. The π readout divides that integer tick count by 10^n and by the number of turns.',
    formula: 'π ≈ rail ticks / (10^n × turns), with no-slip u = r_support(θ)ω',
    getExpected: (params) => {
      const width = params.width || 1;
      const tickPower = params.tickPower ?? 2;
      return `Width w=${width.toFixed(2)} and tick scale 10^${tickPower}. One full turn should cross about π × 10^${tickPower} ticks; the instantaneous u/ω ratio will wobble with orientation.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.width = params.width || 1;
    this.tickPower = params.tickPower ?? 2;
    this.drive = params.drive || 'angular';
    this.angularRate = 2.2;
    this.linearRate = 1.1;
    this.reset();
  }

  reset() {
    super.reset();
    this.reuleauxBasePoints = this.makeReuleauxPoints(this.width, 72);
    this.profilePerimeter = this.measurePolylineLength(this.reuleauxBasePoints, true);
    this.meanEffectiveMass = this.getMeanEffectiveMass();
    this.theta = 0;
    this.distance = 0;
    this.fullTurns = 0;
    this.tickCount = 0;
    this.ticksAtFullTurn = 0;
    this.prevFullTurns = 0;
    this.collisionCount = 0;
    this.linearSpeed = 0;
    this.angularSpeed = 0;
    this.currentSupportRadius = this.width / 2;
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'width', label: 'Width',
        min: 0.5, max: 1.5, step: 0.05, default: this.width,
        onChange: (val) => { this.width = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'tickPower', label: 'Tick scale 10^n',
        min: 0, max: 4, step: 1, default: this.tickPower,
        onChange: (val) => { this.tickPower = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'select', id: 'drive', label: 'Drive',
        default: this.drive,
        options: [
          { value: 'angular', label: 'Angular motor' },
          { value: 'linear', label: 'Roll-speed conveyor' },
        ],
        onChange: (val) => { this.drive = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 80, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'turn-distance',
        label: 'turns vs distance / width',
        dimension: 2,
        primary: true,
        axisLabels: { x: 'turn count', y: 'rail distance / width' }
      },
      {
        id: 'linear-angular',
        label: 'roll speed diagnostic u vs angular speed',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'u / (wω0)', y: 'ω / ω0' }
      },
      {
        id: 'sqrt-q-polar',
        label: 'sqrt-weighted roll Q by phase',
        dimension: 2,
        axisLabels: { x: 'Q cos phase', y: 'Q sin phase' }
      },
      {
        id: 'phase-circle',
        label: 'roll phase circle',
        dimension: 2,
        axisLabels: { x: 'cos turn phase', y: 'sin turn phase' }
      },
      {
        id: 'support-phase',
        label: 'roll phase vs support radius',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'turn phase', y: 'r_support / w' }
      },
      {
        id: 'support-polar',
        label: 'support radius polar plot',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: '(2r/w) cos phase', y: '(2r/w) sin phase' }
      },
      {
        id: 'radius-speed',
        label: 'support radius vs roll speed',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: '2r_support / w - 1', y: 'u / (wω0)' }
      },
      {
        id: 'sqrt-q-radius',
        label: 'support radius vs sqrt-weighted Q',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: '2r_support / w - 1', y: 'Q / Q_circle - 1' }
      },
      {
        id: 'odometer-error',
        label: 'turn phase vs odometer error',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'turn phase', y: 'tanh(distance - πw turns)' }
      },
    ];
  }

  getTickScale() {
    return 10 ** Math.round(this.tickPower);
  }

  getTickSpacing() {
    return this.width / this.getTickScale();
  }

  getSupportOffset(rotation) {
    const pts = this.reuleauxBasePoints || [];
    if (pts.length === 0) return { minY: -this.width / 2, maxY: this.width / 2 };
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of pts) {
      const y = pt.x * s + pt.y * c;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { minY, maxY };
  }

  getRollingRadius(rotation = -this.theta) {
    const support = this.getSupportOffset(rotation);
    return Math.max(this.width * 0.08, -support.minY);
  }

  getEffectiveMassForRadius(radius) {
    return 1 + REULEAUX_INERTIA_FACTOR * this.width * this.width / (radius * radius);
  }

  getMeanEffectiveMass() {
    const samples = 96;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const rotation = -(i / samples) * TAU;
      sum += this.getEffectiveMassForRadius(this.getRollingRadius(rotation));
    }
    return sum / samples;
  }

  updateNoSlipSpeeds() {
    this.currentSupportRadius = this.getRollingRadius(-this.theta);
    if (this.drive === 'linear') {
      this.linearSpeed = this.linearRate;
      this.angularSpeed = this.linearSpeed / this.currentSupportRadius;
    } else {
      this.angularSpeed = this.angularRate;
      this.linearSpeed = this.currentSupportRadius * this.angularSpeed;
    }
  }

  step(dt) {
    let remaining = dt;
    let changed = false;

    while (remaining > 1e-12) {
      const h = Math.min(remaining, 0.0005);
      remaining -= h;

      const oldTheta = this.theta;
      const oldDistance = this.distance;
      const oldTickCount = this.tickCount;

      this.updateNoSlipSpeeds();
      this.theta += this.angularSpeed * h;
      this.distance += this.linearSpeed * h;
      this.tickCount = Math.floor(this.distance / this.getTickSpacing());
      if (this.tickCount !== oldTickCount) changed = true;

      const nextFullTurns = Math.floor(this.theta / TAU);
      if (nextFullTurns > this.prevFullTurns) {
        for (let turn = this.prevFullTurns + 1; turn <= nextFullTurns; turn++) {
          const turnTheta = turn * TAU;
          const crossingT = this.theta !== oldTheta
            ? Math.max(0, Math.min(1, (turnTheta - oldTheta) / (this.theta - oldTheta)))
            : 1;
          const distanceAtTurn = oldDistance + (this.distance - oldDistance) * crossingT;
          this.fullTurns = turn;
          this.ticksAtFullTurn = Math.floor(distanceAtTurn / this.getTickSpacing());
          this.collisionCount = this.ticksAtFullTurn;
          this.pendingPhasePoints.push([...this.getPhasePoint()]);
        }
        this.prevFullTurns = nextFullTurns;
        changed = true;
      }
    }

    return changed;
  }

  getCountLabel() {
    return 'Rail ticks / turns';
  }

  getCollisionCount() {
    return this.fullTurns > 0
      ? `${this.ticksAtFullTurn}/${this.fullTurns}`
      : `${this.tickCount}/-`;
  }

  getPiApproximation() {
    return this.fullTurns > 0
      ? this.ticksAtFullTurn / (this.getTickScale() * this.fullTurns)
      : 0;
  }

  getPiReadout() {
    return this.fullTurns > 0 ? this.getPiApproximation().toFixed(8) : 'need 1 turn';
  }

  getFormulaHTML() {
    this.updateNoSlipSpeeds();
    const turns = Math.max(1, this.fullTurns);
    const tickScale = this.getTickScale();
    const value = this.fullTurns > 0 ? this.getPiApproximation().toFixed(6) : 'n/a';
    const driveLabel = this.drive === 'linear' ? 'roll-speed conveyor' : 'angular motor';
    const profilePi = this.profilePerimeter / this.width;
    return `
      <strong>support-radius odometer (${driveLabel})</strong>:
      <span class="f-angle">u=r_supportω</span>;
      <span class="f-angle">r/w=${(this.currentSupportRadius / this.width).toFixed(3)}</span>;
      <span class="f-angle">u=${this.linearSpeed.toFixed(2)}</span>;
      <span class="f-angle">ω=${this.angularSpeed.toFixed(2)}</span><br>
      <span class="f-muted">perim/w≈${profilePi.toFixed(5)}</span>;
      <span class="f-result">π</span>≈<span class="f-count">${this.ticksAtFullTurn}</span>/
      (<span class="f-angle">${tickScale}</span>·<span class="f-count">${turns}</span>)
      =<span class="f-result">${value}</span>
    `;
  }

  getPhasePoint() {
    this.updateNoSlipSpeeds();
    const tickScale = this.getTickScale();
    const turnWindow = 6;
    const turnValue = (this.theta / TAU) % turnWindow;
    const distanceValue = (this.distance / this.width) % turnWindow;
    const phase = ((this.theta / TAU) % 1 + 1) % 1;
    const phaseAngle = phase * TAU;
    const omega0 = this.angularRate || 1;
    const supportRatio = this.currentSupportRadius / this.width;
    const supportCentered = Math.max(-1, Math.min(1, supportRatio * 2 - 1));
    const normalizedRollSpeed = Math.max(-1, Math.min(1, this.linearSpeed / (this.width * omega0)));
    const effectiveMass = this.getEffectiveMassForRadius(this.currentSupportRadius);
    const qCircleRef = Math.sqrt(1 + REULEAUX_INERTIA_FACTOR * 4) * this.width * omega0 / 2;
    const qNorm = qCircleRef > 0 ? Math.sqrt(effectiveMass) * this.linearSpeed / qCircleRef : 0;
    const qPolarRadius = Math.max(-1.2, Math.min(1.2, qNorm));
    const qCentered = Math.max(-1, Math.min(1, qNorm - 1));
    const continuousTurns = Math.max(this.theta / TAU, 1e-9);
    const idealDistance = Math.PI * this.width * continuousTurns;
    const odometerError = Math.tanh((this.distance - idealDistance) / this.width * 4);
    return [
      Math.max(-1, Math.min(1, turnValue / turnWindow * 2 - 1)),
      Math.max(-1, Math.min(1, distanceValue / turnWindow * 2 - 1)),
      normalizedRollSpeed,
      Math.max(-1, Math.min(1, this.angularSpeed / omega0)),
      phase * 2 - 1,
      supportCentered,
      this.fullTurns > 0 ? this.ticksAtFullTurn / tickScale : 0,
      Math.cos(phaseAngle),
      Math.sin(phaseAngle),
      Math.max(-1.2, Math.min(1.2, 2 * supportRatio * Math.cos(phaseAngle))),
      Math.max(-1.2, Math.min(1.2, 2 * supportRatio * Math.sin(phaseAngle))),
      odometerError,
      qPolarRadius * Math.cos(phaseAngle),
      qPolarRadius * Math.sin(phaseAngle),
      qCentered,
    ];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'linear-angular') return (pt) => [pt[2], pt[3]];
    if (viewId === 'sqrt-q-polar') return (pt) => [pt[12], pt[13]];
    if (viewId === 'phase-circle') return (pt) => [pt[7], pt[8]];
    if (viewId === 'support-phase') return (pt) => [pt[4], pt[5]];
    if (viewId === 'support-polar') return (pt) => [pt[9], pt[10]];
    if (viewId === 'radius-speed') return (pt) => [pt[5], pt[2]];
    if (viewId === 'sqrt-q-radius') return (pt) => [pt[5], pt[14]];
    if (viewId === 'odometer-error') return (pt) => [pt[4], pt[11]];
    return (pt) => [pt[0], pt[1]];
  }

  measurePolylineLength(points, closed = false) {
    if (!points || points.length < 2) return 0;
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += points[i].distanceTo(points[i - 1]);
    }
    if (closed) length += points[0].distanceTo(points[points.length - 1]);
    return length;
  }

  makeReuleauxPoints(width, segmentsPerArc = 32) {
    const h = Math.sqrt(3) * width / 2;
    const vertices = [
      new THREE.Vector2(0, 2 * h / 3),
      new THREE.Vector2(-width / 2, -h / 3),
      new THREE.Vector2(width / 2, -h / 3),
    ];
    const points = [];
    const arcs = [
      { center: vertices[0], from: vertices[1], to: vertices[2] },
      { center: vertices[1], from: vertices[2], to: vertices[0] },
      { center: vertices[2], from: vertices[0], to: vertices[1] },
    ];
    for (const arc of arcs) {
      let a0 = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x);
      let a1 = Math.atan2(arc.to.y - arc.center.y, arc.to.x - arc.center.x);
      while (a1 < a0) a1 += TAU;
      if (a1 - a0 > Math.PI) a0 += TAU;
      for (let i = 0; i <= segmentsPerArc; i++) {
        const t = i / segmentsPerArc;
        const a = a0 + (a1 - a0) * t;
        points.push(new THREE.Vector3(
          arc.center.x + width * Math.cos(a),
          arc.center.y + width * Math.sin(a),
          0
        ));
      }
    }
    return points;
  }

  initSimScene() {
    this.simScene.clear();
    // Frame scales with the body width so the roller always fills the view,
    // instead of being a small shape on a long rail.
    const w = this.width;
    const railRight = 2.8 * w;
    this.simCamera = new THREE.OrthographicCamera(-0.2 * w, 2.7 * w, 1.4 * w, -0.26 * w, 0.1, 10);
    this.simCamera.position.z = 1;

    const railMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });
    for (const y of [0, this.width]) {
      this.simScene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.15 * w, y, 0),
          new THREE.Vector3(railRight, y, 0)
        ]),
        railMat
      ));
    }
    const upperPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(railRight + 0.3, 0.055),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
    );
    upperPlate.position.set(railRight / 2, this.width + 0.04, -0.01);
    this.simScene.add(upperPlate);

    const majorTickPts = [];
    for (let x = 0; x <= railRight; x += this.width) {
      majorTickPts.push(new THREE.Vector3(x, -0.04, 0), new THREE.Vector3(x, 0.04, 0));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(majorTickPts),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.8 })
    ));

    const minorTickPts = [];
    const tickSpacing = this.getTickSpacing();
    const drawnTickSpacing = tickSpacing < this.width / 50 ? this.width / 50 : tickSpacing;
    for (let x = 0; x <= railRight; x += drawnTickSpacing) {
      minorTickPts.push(new THREE.Vector3(x, -0.018, 0), new THREE.Vector3(x, 0.018, 0));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(minorTickPts),
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.28 })
    ));

    const pts = this.reuleauxBasePoints;
    this.bodyGeom = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    this.body = new THREE.Line(
      this.bodyGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.body);

    this.centerDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 16),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 })
    );
    this.simScene.add(this.centerDot);

    this.linearArrow = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.9 })
    );
    this.simScene.add(this.linearArrow);

    this.linearArrowHead = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 3),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 })
    );
    this.simScene.add(this.linearArrowHead);

    this.angularArrow = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.9 })
    );
    this.simScene.add(this.angularArrow);

    this.angularArrowHead = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 3),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.simScene.add(this.angularArrowHead);
  }

  updateSimScene() {
    if (!this.body) return;
    this.updateNoSlipSpeeds();
    const x = 0.5 * this.width + (this.distance % (1.6 * this.width));
    const rotation = -this.theta;
    const support = this.getSupportOffset(rotation);
    const y = -support.minY;
    this.body.position.set(x, y, 0);
    this.body.rotation.z = rotation;
    this.centerDot.position.set(x, y, 0.02);

    if (this.linearArrow) {
      const length = 0.22 + Math.min(0.5, this.linearSpeed * 0.16);
      const yArrow = y + this.width * 0.62;
      this.linearArrow.geometry.setFromPoints([
        new THREE.Vector3(x - length * 0.45, yArrow, 0.04),
        new THREE.Vector3(x + length * 0.55, yArrow, 0.04)
      ]);
      this.linearArrowHead.position.set(x + length * 0.55, yArrow, 0.05);
      this.linearArrowHead.rotation.z = -Math.PI / 2;
    }

    if (this.angularArrow) {
      const radius = Math.max(0.18, this.width * 0.34);
      const start = -this.theta + 0.35;
      const arc = Math.PI * 1.35;
      const points = [];
      for (let i = 0; i <= 28; i++) {
        const a = start - arc * (i / 28);
        points.push(new THREE.Vector3(
          x + radius * Math.cos(a),
          y + radius * Math.sin(a),
          0.04
        ));
      }
      this.angularArrow.geometry.setFromPoints(points);
      const end = points[points.length - 1];
      this.angularArrowHead.position.copy(end);
      this.angularArrowHead.rotation.z = start - arc - Math.PI;
    }
  }
}

registerSim(ReuleauxRailPi);
