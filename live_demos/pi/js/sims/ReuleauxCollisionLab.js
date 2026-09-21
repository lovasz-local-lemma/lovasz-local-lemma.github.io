import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

const TAU = Math.PI * 2;

const SHAPES = {
  block: {
    label: 'sliding block',
    color: 0xe94560,
    inertiaFactor: 0
  },
  circle: {
    label: 'circle roller',
    color: 0x4cc9f0,
    // Solid disk with diameter w: I = 1/2 m(w/2)^2 = 1/8 mw^2.
    inertiaFactor: 1 / 8
  },
  reuleaux: {
    label: 'Reuleaux roller',
    color: 0xf7c948,
    // Approximate lamina factor, used only to make the phase-space contrast visible.
    inertiaFactor: 0.11
  }
};

const VARIANTS = {
  'block-reuleaux': {
    label: 'Block + Reuleaux',
    left: 'reuleaux',
    right: 'block',
    note: 'wall | Reuleaux roller | sliding block'
  },
  'circle-reuleaux': {
    label: 'Circle + Reuleaux',
    left: 'circle',
    right: 'reuleaux',
    note: 'wall | circle roller | Reuleaux roller'
  },
  'reuleaux-reuleaux': {
    label: 'Reuleaux + Reuleaux',
    left: 'reuleaux',
    right: 'reuleaux',
    note: 'wall | Reuleaux roller | Reuleaux roller'
  }
};

export class ReuleauxCollisionLab extends Simulation {
  static id = 'reuleaux-collision-lab';
  static title = 'Reuleaux Collision Lab';
  static description = 'Experimental contact lab — Reuleaux collisions break the fixed-angle count';
  static piMechanism = 'experimental: variable support radius makes collision count drift';
  static rigor = 'Experimental';
  static sortOrder = 119;
  static piNature = 'experimental';
  static piLabel = 'π proxy';
  static alternatives = [
    { id: 'reuleaux-rail-pi', label: 'Odometer version' },
    { id: 'loaded-disc-galperin', label: 'Mass-made bias' },
  ];
  static previewSteps = 14;   // hub thumbnail: closest approach of the pair
  static explanation = {
    setup: 'Choose one of three pairings: block+Reuleaux, circle+Reuleaux, or Reuleaux+Reuleaux. The left body sits between a wall and the right body, and the right body starts moving left.',
    insight: 'A circular roller folds spin into a constant effective mass. A Reuleaux roller does not: its support radius changes with orientation, so the unwrapped roll speed u = r_support(θ)ω and the impulse sees a phase-dependent effective mass. That destroys the single fixed reflection angle required by the Galperin count.',
    contrast: 'Block+Reuleaux looks closest because the right contact is a flat vertical block face. Circle+Reuleaux and Reuleaux+Reuleaux expose more of the changing support-radius geometry, so the phase portrait stops looking like a perfect circle.',
    readout: 'The primary phase plot uses unwrapped roll/contact speed inside Q. Diagnostic views separate roll speed u, angular speed ω, support radius r, and the no-slip relation u = r_support(θ)ω.',
    formula: 'proxy only: count / 10^n; m_eff(θ) = m + I/r_support(θ)^2',
    getExpected: (params) => {
      const variant = VARIANTS[params.variant] || VARIANTS['block-reuleaux'];
      const n = params.n || 2;
      return `${variant.label}, n=${n}: the mean effective-mass ratio is calibrated near 100^${n}, but the live ratio changes as Reuleaux orientation changes.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.variantKey = params.variant || 'reuleaux-reuleaux';
    this.n = params.n || 2;
    this.width = params.width || 0.12;
    this.initialVelocity = params.velocity || 1;
    this.maxTrailLength = 8000;
    this.showBarbier = false;
    this.reset();
  }

  reset() {
    super.reset();
    this.variant = VARIANTS[this.variantKey] || VARIANTS['block-reuleaux'];
    this.reuleauxBasePoints = this.makeReuleauxPoints(this.width, 48);
    this.left = this.makeBody(this.variant.left, 0.26, 0.18);
    this.right = this.makeBody(this.variant.right, 0.72, 1.05);
    this.calibrateMasses();
    this.meanLeftEff = this.getMeanEffectiveMass(this.left);
    this.meanRightEff = this.getMeanEffectiveMass(this.right);
    this.left.v = 0;
    this.right.v = -this.initialVelocity;
    this.updateRollingState(this.left);
    this.updateRollingState(this.right);
    this.initialRightEff = this.getEffectiveMass(this.right);
    this.initialLeftEff = this.getEffectiveMass(this.left);
    this.targetRatio = Math.pow(100, this.n);
    this.lastContact = 'none yet';
    this.lastBodyContact = 'none yet';
    this.finished = false;
    this.collisionEffects = [];
    this._roseUnit = null;
    // Track the live Galperin angle α(θ) = arctan(√(m_lighter/m_heavier))
    // as the Reuleaux roller rotates. The π estimate range is naturally
    // [count × α_min, count × α_max] across observed orientations.
    this.alphaMin = Infinity;
    this.alphaMax = -Infinity;
    this.alphaSum = 0;
    this.alphaSamples = 0;
    this._sampleAlpha();
  }

  // Hub thumbnail focus: just the two bodies, big — not the rail, dial, or readouts.
  getPreviewBox() {
    const lo = Math.min(this.left.x, 0) - this.width * 1.4;
    const hi = Math.max(this.right.x + this.width * 1.6, lo + 0.5);
    return { x0: lo, x1: hi, y0: -0.04, y1: this.width * 1.9 };
  }

  getControls() {
    return [
      {
        type: 'select', id: 'variant', label: 'Pairing',
        default: this.variantKey,
        options: Object.entries(VARIANTS).map(([value, variant]) => ({
          value,
          label: variant.label
        })),
        onChange: (val) => { this.variantKey = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'n', label: 'Target ratio 100^n',
        min: 1, max: 4, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'width', label: 'Roller width',
        min: 0.08, max: 0.18, step: 0.005, default: this.width,
        onChange: (val) => { this.width = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'velocity', label: 'Initial speed',
        min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); }
      },
      { type: 'toggle', id: 'showBarbier', label: 'Barbier board (width vs support r)', default: this.showBarbier },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'instant-q',
        label: 'instant Q_left vs Q_right (+ orange support-radius rose)',
        dimension: 2,
        primary: true,
        axisLabels: {
          x: 'Q_left = sqrt(m_eff(theta)) u_left',
          y: 'Q_right = sqrt(m_eff(theta)) u_right'
        }
      },
      {
        id: 'q-left-right',
        label: 'mean linear Q_left vs Q_right',
        dimension: 2,
        axisLabels: {
          x: 'Q_left = sqrt(mean m_eff) u_left',
          y: 'Q_right = sqrt(mean m_eff) u_right'
        }
      },
      {
        id: 'linear-speeds',
        label: 'roll speed diagnostic u_left vs u_right',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'tanh(u_left / u0)', y: 'tanh(u_right / u0)' }
      },
      {
        id: 'angular-speeds',
        label: 'angular speed diagnostic ω_left vs ω_right',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'tanh(ω_left / ω0)', y: 'tanh(ω_right / ω0)' }
      },
      {
        id: 'support-radii',
        label: 'support radius r_left vs r_right',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: '2r_left / w - 1', y: '2r_right / w - 1' }
      },
      {
        id: 'left-slip',
        label: 'left no-slip u vs ω',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'tanh(u_left / u0)', y: 'tanh(ω_left / ω0)' }
      },
      {
        id: 'right-slip',
        label: 'right no-slip u vs ω',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'tanh(u_right / u0)', y: 'tanh(ω_right / ω0)' }
      },
      {
        id: 'ratio-phase',
        label: 'Reuleaux phase vs ratio drift',
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: 'active Reuleaux phase', y: 'tanh log(live / target ratio)' }
      },
    ];
  }

  makeBody(kind, x, theta) {
    return {
      kind,
      shape: SHAPES[kind],
      x,
      v: 0,
      theta,
      omega: 0,
      mass: 1,
      supportRadius: this.width / 2,
    };
  }

  calibrateMasses() {
    this.left.mass = 1;
    const leftUnitEff = this.getUnitMeanEffectiveMass(this.left.kind);
    const rightUnitEff = this.getUnitMeanEffectiveMass(this.right.kind);
    this.right.mass = leftUnitEff * Math.pow(100, this.n) / rightUnitEff;
  }

  getUnitMeanEffectiveMass(kind) {
    if (kind === 'block') return 1;
    if (kind === 'circle') return 1 + SHAPES.circle.inertiaFactor * this.width * this.width / ((this.width / 2) ** 2);

    let sum = 0;
    const samples = 96;
    for (let i = 0; i < samples; i++) {
      const body = {
        kind: 'reuleaux',
        theta: (i / samples) * TAU,
        mass: 1,
        shape: SHAPES.reuleaux,
      };
      const r = this.getRollingRadius(body);
      sum += 1 + SHAPES.reuleaux.inertiaFactor * this.width * this.width / (r * r);
    }
    return sum / samples;
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;

    while (remaining > 1e-12) {
      const h = Math.min(remaining, 0.00025);
      remaining -= h;

      this.advanceBody(this.left, h);
      this.advanceBody(this.right, h);
      this._sampleAlpha();

      const now = performance.now();
      if (this.resolveWallCollision(now)) collided = true;
      if (this.resolveBodyCollision(now)) collided = true;
    }

    const gap = this.getGap();
    if (this.left.v >= 0 && this.right.v > 0 && this.right.v >= this.left.v && gap > this.width * 0.2) {
      this.finished = true;
    }

    return collided;
  }

  advanceBody(body, dt) {
    this.updateRollingState(body);
    body.x += body.v * dt;
    if (body.kind !== 'block') {
      body.theta += body.omega * dt;
    }
  }

  updateRollingState(body) {
    if (body.kind === 'block') {
      body.omega = 0;
      body.supportRadius = 0;
      return;
    }
    body.supportRadius = this.getRollingRadius(body);
    body.omega = body.supportRadius > 0 ? body.v / body.supportRadius : 0;
  }

  resolveWallCollision(now) {
    const support = this.getBodySupport(this.left);
    const leftEdge = this.left.x + support.minX;
    if (leftEdge > 0 || this.left.v >= 0) return false;

    this.left.x = -support.minX;
    this.left.v = Math.abs(this.left.v);
    this.updateRollingState(this.left);
    this.lastContact = `${this.describeContactSurface(this.left, 'left')} -> wall`;
    this.collisionCount++;
    this.collisionEffects.push({ x: 0, y: this.getBodyVisualY(this.left), time: now, type: 'wall' });
    this.recordCollisionPhase();
    return true;
  }

  resolveBodyCollision(now) {
    const gap = this.getGap();
    if (gap > 0) return false;

    const closing = this.left.v - this.right.v;
    if (closing <= 0) return false;

    const m1 = this.getEffectiveMass(this.left);
    const m2 = this.getEffectiveMass(this.right);
    const v1 = this.left.v;
    const v2 = this.right.v;
    this.left.v = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
    this.right.v = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
    this.updateRollingState(this.left);
    this.updateRollingState(this.right);
    this.lastContact = `${this.describeContactSurface(this.left, 'right')} -> ${this.describeContactSurface(this.right, 'left')}`;
    this.lastBodyContact = this.lastContact;

    const leftSupport = this.getBodySupport(this.left);
    const rightSupport = this.getBodySupport(this.right);
    this.left.x = this.right.x + rightSupport.minX - leftSupport.maxX - 1e-5;

    this.collisionCount++;
    this.collisionEffects.push({
      x: this.right.x + rightSupport.minX,
      y: Math.max(this.getBodyVisualY(this.left), this.getBodyVisualY(this.right)),
      time: now,
      type: 'block'
    });
    this.recordCollisionPhase();
    return true;
  }

  recordCollisionPhase() {
    this.pendingPhasePoints.push([...this.getPhasePoint()]);
    if (this.getRawPhasePoint) this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
  }

  getGap() {
    const leftSupport = this.getBodySupport(this.left);
    const rightSupport = this.getBodySupport(this.right);
    return (this.right.x + rightSupport.minX) - (this.left.x + leftSupport.maxX);
  }

  getBodySupport(body) {
    if (body.kind === 'block') {
      const w = this.getBlockWidth();
      return { minX: -w / 2, maxX: w / 2, minY: -this.getBlockHeight() / 2, maxY: this.getBlockHeight() / 2 };
    }
    if (body.kind === 'circle') {
      const r = this.width / 2;
      return { minX: -r, maxX: r, minY: -r, maxY: r };
    }

    const rotation = -body.theta;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of this.reuleauxBasePoints) {
      const x = pt.x * c - pt.y * s;
      const y = pt.x * s + pt.y * c;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { minX, maxX, minY, maxY };
  }

  getRollingRadius(body) {
    if (body.kind === 'circle') return this.width / 2;
    if (body.kind === 'block') return 0;
    const support = this.getBodySupport(body);
    return Math.max(this.width * 0.08, -support.minY);
  }

  getEffectiveMass(body) {
    if (body.kind === 'block') return body.mass;
    const r = this.getRollingRadius(body);
    const rotational = body.shape.inertiaFactor * this.width * this.width / (r * r);
    return body.mass * (1 + rotational);
  }

  getMeanEffectiveMass(body) {
    return body.mass * this.getUnitMeanEffectiveMass(body.kind);
  }

  describeContactSurface(body, side) {
    const sideLabel = side === 'left' ? 'left' : 'right';
    if (body.kind === 'block') return `${body.shape.label} ${sideLabel} flat face`;
    if (body.kind === 'circle') return `${body.shape.label} ${sideLabel} rim`;
    return `${body.shape.label} ${sideLabel} support side`;
  }

  getCountLabel() {
    return 'Contacts';
  }

  getPiApproximation() {
    return this.collisionCount / Math.pow(10, this.n);
  }

  // Sample the live Galperin angle α from the current effective masses.
  _sampleAlpha() {
    const eL = this.getEffectiveMass(this.left);
    const eR = this.getEffectiveMass(this.right);
    if (!Number.isFinite(eL) || !Number.isFinite(eR) || eL <= 0 || eR <= 0) return;
    const ratio = Math.max(eL, eR) / Math.min(eL, eR);
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    const alpha = Math.atan(1 / Math.sqrt(ratio));
    if (alpha < this.alphaMin) this.alphaMin = alpha;
    if (alpha > this.alphaMax) this.alphaMax = alpha;
    this.alphaSum += alpha;
    this.alphaSamples += 1;
  }

  // π band: α varies as the Reuleaux roller rotates, so the natural error
  // band is [count × α_min, count × α_max] over observed orientations. The
  // central estimate uses the running mean of α.
  getPiBand() {
    if (this.alphaSamples === 0 || this.collisionCount === 0) {
      return { low: 0, mid: 0, high: 0, err: 0, alphaMid: 0, alphaMin: 0, alphaMax: 0 };
    }
    const alphaMid = this.alphaSum / this.alphaSamples;
    const piMid = this.collisionCount * alphaMid;
    const piLow = this.collisionCount * this.alphaMin;
    const piHigh = this.collisionCount * this.alphaMax;
    const err = (piHigh - piLow) / 2;
    return { low: piLow, mid: piMid, high: piHigh, err, alphaMid, alphaMin: this.alphaMin, alphaMax: this.alphaMax };
  }

  getPiReadout() {
    if (this.collisionCount === 0) return 'n/a';
    const band = this.getPiBand();
    return `${band.mid.toFixed(4)} ± ${band.err.toFixed(4)}`;
  }

  getFormulaHTML() {
    const band = this.getPiBand();
    return `
      <strong>${this.variant.label}</strong> ·
      <span class="f-angle">support r(θ) swings 0.42–0.58w</span> →
      <span class="f-angle">α∈[${band.alphaMin.toFixed(4)}, ${band.alphaMax.toFixed(4)}]</span><br>
      <span class="f-result">π</span> ≈ <span class="f-count">${this.collisionCount}</span> · ${band.alphaMid.toFixed(5)} =
      <span class="f-result">${band.mid.toFixed(3)}</span> ± <span class="f-warning">${band.err.toFixed(3)}</span>
      <span class="f-muted">[${band.low.toFixed(2)}–${band.high.toFixed(2)}]</span>
      <br><span class="f-muted">Top-right dial: <span style="color:#ff9f43">●</span> support-radius rose r(θ) vs <span style="color:#4cc9f0">○</span> circle roller; <span style="color:#ffd166">●</span> = current.</span>
      ${this.showBarbier ? `<br><span class="f-muted">Barbier: constant width → rolls exact π; wobbling support r → collides biased.</span>` : ''}
    `;
  }

  formatBodyTelemetry(body, effectiveMass) {
    const massText = `m_eff=${effectiveMass.toExponential(2)}`;
    if (body.kind === 'block') {
      return `${body.shape.label}: u=${body.v.toFixed(2)}, ω=n/a, r=n/a, ${massText}`;
    }
    const r = this.getRollingRadius(body);
    return `${body.shape.label}: u=${body.v.toFixed(2)}, ω=${body.omega.toFixed(2)}, r/w=${(r / this.width).toFixed(3)}, ${massText}`;
  }

  getPhasePoint() {
    const eL = this.getEffectiveMass(this.left);
    const eR = this.getEffectiveMass(this.right);
    const meanL = this.meanLeftEff || this.getMeanEffectiveMass(this.left);
    const meanR = this.meanRightEff || this.getMeanEffectiveMass(this.right);
    const meanNorm = Math.sqrt(meanR) * (this.initialVelocity || 1);
    const instantNorm = Math.sqrt(this.initialRightEff || eR) * (this.initialVelocity || 1);
    const vScale = this.initialVelocity || 1;
    const omegaScale = (this.initialVelocity || 1) / (this.width || 1);
    const ratioDrift = Math.tanh(Math.log((eR / eL) / (this.targetRatio || 1)));
    const leftPhase = ((this.left.theta / TAU) % 1 + 1) % 1;
    const rightPhase = ((this.right.theta / TAU) % 1 + 1) % 1;
    const activePhase = this.left.kind === 'reuleaux' ? leftPhase : rightPhase;
    const leftR = this.left.kind === 'block' ? 0 : this.getRollingRadius(this.left) / this.width;
    const rightR = this.right.kind === 'block' ? 0 : this.getRollingRadius(this.right) / this.width;
    return [
      Math.sqrt(meanL) * this.left.v / meanNorm,
      Math.sqrt(meanR) * this.right.v / meanNorm,
      Math.sqrt(eL) * this.left.v / instantNorm,
      Math.sqrt(eR) * this.right.v / instantNorm,
      Math.tanh(this.left.v / vScale),
      Math.tanh(this.right.v / vScale),
      Math.tanh(this.left.omega / omegaScale),
      Math.tanh(this.right.omega / omegaScale),
      Math.max(-1, Math.min(1, 2 * leftR - 1)),
      Math.max(-1, Math.min(1, 2 * rightR - 1)),
      leftPhase * 2 - 1,
      rightPhase * 2 - 1,
      activePhase * 2 - 1,
      ratioDrift,
    ];
  }

  getRawPhasePoint() {
    const R = this.right.mass * (this.initialVelocity || 1);
    return [
      this.left.mass * this.left.v / R,
      this.right.mass * this.right.v / R,
    ];
  }

  getPhaseUncertainty() {
    if (this.collisionCount === 0) return 0;
    const band = this.getPiBand();
    return Math.min(0.30, band.err / Math.PI);
  }

  // Static support-radius rose, overlaid (orange) on the circular phase views:
  // 2r(θ)/w plotted at angle θ. For a Reuleaux it's a 3-lobed curve bulging
  // 0.85..1.15 around the unit circle (= a constant-radius circle roller); the
  // bias, drawn over the Galperin collision portrait. Scale-invariant in width,
  // so it's cached once.
  // Unit-normalized support-radius rose 2r(θ)/w over a full turn (cached;
  // scale-invariant in width). Drawn as a small DIAL in the scene's top-right
  // corner — not on the phase plot, where its coordinates aren't momenta.
  _supportRoseUnit() {
    if (!this._roseUnit) {
      const probe = { kind: 'reuleaux', theta: 0, shape: SHAPES.reuleaux };
      const pts = [];
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        probe.theta = th;
        const rr = this.getRollingRadius(probe) / (this.width / 2);
        pts.push([rr * Math.cos(th), rr * Math.sin(th)]);
      }
      this._roseUnit = pts;
    }
    return this._roseUnit;
  }

  _bodyRosePoint(body) {
    const rr = this.getRollingRadius(body) / (this.width / 2);
    return [rr * Math.cos(body.theta), rr * Math.sin(body.theta)];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'instant-q') return (pt) => [pt[2], pt[3]];
    if (viewId === 'linear-speeds') return (pt) => [pt[4], pt[5]];
    if (viewId === 'angular-speeds') return (pt) => [pt[6], pt[7]];
    if (viewId === 'support-radii') return (pt) => [pt[8], pt[9]];
    if (viewId === 'left-slip') return (pt) => [pt[4], pt[6]];
    if (viewId === 'right-slip') return (pt) => [pt[5], pt[7]];
    if (viewId === 'ratio-phase') return (pt) => [pt[12], pt[13]];
    return (pt) => [pt[0], pt[1]];
  }

  getBlockWidth() {
    return this.width * 0.92;
  }

  getBlockHeight() {
    return this.width * 0.74;
  }

  getBodyVisualY(body) {
    const support = this.getBodySupport(body);
    return -support.minY;
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
    this.simCamera = new THREE.OrthographicCamera(-0.08, 1.12, 0.34, -0.08, 0.1, 10);
    this.simCamera.position.z = 1;

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(0.016, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    wall.position.set(-0.008, 0.12, 0);
    this.simScene.add(wall);

    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.04, 0, 0),
        new THREE.Vector3(1.08, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })
    ));

    this.leftMesh = this.createBodyMesh(this.left);
    this.rightMesh = this.createBodyMesh(this.right);
    this.simScene.add(this.leftMesh, this.rightMesh);

    this.arrowLeft = this.makeArrow(0x4cc9f0);
    this.arrowRight = this.makeArrow(0xf7c948);
    this.simScene.add(this.arrowLeft, this.arrowRight);

    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.009, 0.014, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide
        })
      );
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }

    // --- Barbier duality overlay (toggle showBarbier) ---
    // A level "board" at height = width: because the Reuleaux has CONSTANT WIDTH,
    // its top stays at y=w for every orientation, so the board never tilts —
    // the odometer-exact face. The support spokes below wobble — the biased face.
    const w = this.width;
    this.barbierBoard = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.06, w, 0.04), new THREE.Vector3(1.10, w, 0.04)]),
      new THREE.LineDashedMaterial({ color: 0x4cc9f0, dashSize: 0.022, gapSize: 0.016, transparent: true, opacity: 0.8 })
    );
    this.barbierBoard.computeLineDistances();
    this.barbierBoard.visible = false;
    this.simScene.add(this.barbierBoard);

    this.barbierCaliper = new THREE.Group();
    const calX = -0.058;
    const calMat = new THREE.LineBasicMaterial({ color: 0x4cc9f0 });
    this.barbierCaliper.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(calX, 0, 0.04), new THREE.Vector3(calX, w, 0.04)]), calMat));
    for (const yy of [0, w]) {
      this.barbierCaliper.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(calX - 0.013, yy, 0.04), new THREE.Vector3(calX + 0.013, yy, 0.04)]), calMat));
    }
    this.barbierCaliper.visible = false;
    this.simScene.add(this.barbierCaliper);

    this.spokeLeft = this.makeSpoke(0xff9f43);
    this.spokeRight = this.makeSpoke(0xff9f43);
    this.simScene.add(this.spokeLeft, this.spokeRight);

    // --- support-radius dial: a small inset in the top-right of the scene ---
    // cyan ref circle = a constant-radius circle roller; orange rose = the
    // Reuleaux support-radius locus 2r(θ)/w; gold spoke(s) = each roller's
    // current support radius (always visible, even before the first collision).
    const dc = { x: 0.96, y: 0.23 }; this.dialCenter = dc; const dr = 0.075; this.dialR = dr;
    const bg = new THREE.Mesh(new THREE.CircleGeometry(dr * 1.3, 36),
      new THREE.MeshBasicMaterial({ color: 0x0a0a1a, transparent: true, opacity: 0.6 }));
    bg.position.set(dc.x, dc.y, 0.05);
    this.simScene.add(bg);
    const refPts = [];
    for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; refPts.push(new THREE.Vector3(dc.x + dr * Math.cos(a), dc.y + dr * Math.sin(a), 0.07)); }
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(refPts),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 })));
    const rosePts = this._supportRoseUnit().map(([x, y]) => new THREE.Vector3(dc.x + dr * x, dc.y + dr * y, 0.071));
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rosePts),
      new THREE.LineBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.9 })));
    this.dialSpokes = [this._makeDialSpoke(), this._makeDialSpoke()];
    for (const s of this.dialSpokes) this.simScene.add(s);
  }

  createBodyMesh(body) {
    const group = new THREE.Group();
    if (body.kind === 'block') {
      group.add(new THREE.Mesh(
        new THREE.PlaneGeometry(this.getBlockWidth(), this.getBlockHeight()),
        new THREE.MeshBasicMaterial({ color: body.shape.color, transparent: true, opacity: 0.85 })
      ));
      return group;
    }

    if (body.kind === 'circle') {
      const r = this.width / 2;
      group.add(new THREE.Mesh(
        new THREE.RingGeometry(r * 0.82, r, 48),
        new THREE.MeshBasicMaterial({ color: body.shape.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      ));
      group.add(new THREE.Mesh(
        new THREE.CircleGeometry(r * 0.78, 48),
        new THREE.MeshBasicMaterial({ color: body.shape.color, transparent: true, opacity: 0.18 })
      ));
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(r, 0, 0.02)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
      ));
      return group;
    }

    const shape = new THREE.Shape();
    const pts = this.reuleauxBasePoints;
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
    shape.closePath();
    group.add(new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: body.shape.color, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    ));
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]),
      new THREE.LineBasicMaterial({ color: body.shape.color })
    ));
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.03),
        new THREE.Vector3(this.width * 0.32, 0, 0.03)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    ));
    return group;
  }

  makeArrow(color) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    line.visible = false;
    return line;
  }

  makeSpoke(color) {
    const g = new THREE.Group();
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.007, 14), new THREE.MeshBasicMaterial({ color }));
    g.add(line);
    g.add(dot);
    g.userData = { line, dot };
    g.visible = false;
    return g;
  }

  // Support-radius spoke: centroid down to the ground contact. Its length is the
  // support radius, which wobbles 0.42w..0.58w as the Reuleaux rotates — the bias.
  _updateSpoke(spoke, body, show) {
    if (!spoke) return;
    const on = show && body.kind !== 'block';
    spoke.visible = on;
    if (!on) return;
    const support = this.getBodySupport(body);
    const centroidY = -support.minY;
    spoke.userData.line.geometry.setFromPoints([
      new THREE.Vector3(body.x, 0, 0.05),
      new THREE.Vector3(body.x, centroidY, 0.05),
    ]);
    spoke.userData.dot.position.set(body.x, centroidY, 0.052);
  }

  _makeDialSpoke() {
    const g = new THREE.Group();
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 })
    );
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    g.add(line); g.add(dot);
    g.userData = { line, dot };
    return g;
  }

  // Point each dial spoke from the dial center to the roller's current support
  // radius on the rose. A non-Reuleaux body (block/circle) hides its spoke.
  _updateDial() {
    if (!this.dialSpokes) return;
    const dc = this.dialCenter, dr = this.dialR;
    const bodies = [this.left, this.right];
    for (let i = 0; i < this.dialSpokes.length; i++) {
      const spoke = this.dialSpokes[i];
      const body = bodies[i];
      if (!body || body.kind !== 'reuleaux') { spoke.visible = false; continue; }
      spoke.visible = true;
      const [rx, ry] = this._bodyRosePoint(body);
      spoke.userData.line.geometry.setFromPoints([
        new THREE.Vector3(dc.x, dc.y, 0.072),
        new THREE.Vector3(dc.x + dr * rx, dc.y + dr * ry, 0.072),
      ]);
      spoke.userData.dot.position.set(dc.x + dr * rx, dc.y + dr * ry, 0.073);
    }
  }

  updateSimScene() {
    if (!this.leftMesh || !this.rightMesh) return;
    this.updateBodyMesh(this.left, this.leftMesh);
    this.updateBodyMesh(this.right, this.rightMesh);

    // Barbier duality overlay: level board (constant width) + wobbling support spokes
    const showB = !!this.showBarbier;
    if (this.barbierBoard) this.barbierBoard.visible = showB;
    if (this.barbierCaliper) this.barbierCaliper.visible = showB;
    this._updateSpoke(this.spokeLeft, this.left, showB);
    this._updateSpoke(this.spokeRight, this.right, showB);
    this._updateDial();

    if (this.showVectors) {
      this.arrowLeft.visible = true;
      this.arrowRight.visible = true;
      this.updateArrow(this.arrowLeft, this.left, 0.09);
      this.updateArrow(this.arrowRight, this.right, 0.12);
    } else {
      this.arrowLeft.visible = false;
      this.arrowRight.visible = false;
    }

    const now = performance.now();
    const duration = 300;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < duration);
    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / duration;
        ring.visible = true;
        ring.position.set(effect.x, effect.y, 0.03);
        ring.scale.set(1 + progress * 4.5, 1 + progress * 4.5, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }

  updateBodyMesh(body, mesh) {
    const support = this.getBodySupport(body);
    mesh.position.set(body.x, -support.minY, 0);
    mesh.rotation.z = body.kind === 'block' ? 0 : -body.theta;
  }

  updateArrow(arrow, body, yOffset) {
    const support = this.getBodySupport(body);
    const y = -support.minY + yOffset;
    const length = body.v * 0.075;
    arrow.geometry.setFromPoints([
      new THREE.Vector3(body.x, y, 0.05),
      new THREE.Vector3(body.x + length, y, 0.05),
    ]);
  }
}

registerSim(ReuleauxCollisionLab);
