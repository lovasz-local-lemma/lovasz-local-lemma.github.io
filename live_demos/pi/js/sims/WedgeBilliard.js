import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class WedgeBilliard extends Simulation {
  static id = 'wedge-billiard';
  static title = 'Raw Look (π/k)';
  static description = 'Comparison demo — the geometry is right, but π is encoded directly in the opening angle';
  static piMechanism = 'legacy demo: choose θ = π/k, count reflections, then multiply back by θ';
  static rigor = 'Legacy Demo';
  static sortOrder = 70;
  static piNature = 'legacy';
  static piLabel = 'θ · (N+1)';
  static previewSteps = 24;   // hub thumbnail: mid-run, ball deep in the wedge
  static alternatives = [{ id: 'optical-wedge', label: 'The honest-angle version' }];
  static explanation = {
    setup: 'This keeps the old wedge parameterization: the opening angle is set directly to θ = π/k, and a ray reflects between the two walls.',
    insight: 'The unfolding geometry is still valid, so the count follows the same mirror-wedge logic. The difference is conceptual: once θ already contains π, the scene is demonstrating the reflection argument rather than computing π from an independent physical parameter.',
    contrast: 'Compare this with Optical Wedge. There, the angle comes from the plain slope 10^-n and the reflections reveal π. Here, π is already hidden in the chosen opening angle.',
    formula: 'With this start/end convention, π = (reflections + 1) × (π/k). Good for visualization, not as an independent π calculator.',
    getExpected: (params) => {
      const k = params.k || 10;
      const theta = Math.PI / k;
      return `For k=${k}: θ = π/${k} = ${theta.toFixed(6)} rad. This setup gives ${k - 1} visible reflections, so (N+1)θ = π by construction.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.k = params.k || 10;
    this.maxTrailLength = 12000;
    this.reset();
  }

  reset() {
    super.reset();
    this.outerRadius = 1.0;
    this.wedgeAngle = Math.PI / this.k;
    this.ballX = 0.95 * this.outerRadius;
    this.ballY = 0.92 * this.ballX * Math.tan(this.wedgeAngle);
    this.ballVx = -1.0;
    this.ballVy = 0.0;
    this.wall2Normal = [-Math.sin(this.wedgeAngle), Math.cos(this.wedgeAngle)];
    this.finished = false;
    this.trail = [];
    this.collisionEffects = [];
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'k', label: 'Angle denominator k',
        min: 3, max: 40, step: 1, default: this.k,
        onChange: (val) => { this.k = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 80, step: 0.1, default: 10 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'pos-angle', label: 'Radius vs velocity angle', dimension: 2, primary: true }
    ];
  }

  step(dt) {
    if (this.finished) return false;

    let remaining = dt;
    let collided = false;
    const theta = this.wedgeAngle;
    const tanTheta = Math.tan(theta);
    const now = performance.now();

    while (remaining > 1e-12) {
      let tLower = Infinity;
      if (this.ballVy < -1e-12) {
        const t = -this.ballY / this.ballVy;
        if (t > -1e-10) tLower = Math.max(0, t);
      }

      let tUpper = Infinity;
      const upperDenom = this.ballVy - this.ballVx * tanTheta;
      if (upperDenom > 1e-12) {
        const t = (this.ballX * tanTheta - this.ballY) / upperDenom;
        const clampedT = Math.max(0, t);
        if (t > -1e-10 && this.ballX + this.ballVx * clampedT > 0) {
          tUpper = clampedT;
        }
      }

      const tNext = Math.min(tLower, tUpper);
      if (!Number.isFinite(tNext)) {
        this.ballX += this.ballVx * remaining;
        this.ballY += this.ballVy * remaining;
        this._pushTrailPoint();
        this.finished = true;
        break;
      }

      if (tNext > remaining) {
        this.ballX += this.ballVx * remaining;
        this.ballY += this.ballVy * remaining;
        this._pushTrailPoint();
        break;
      }

      this.ballX += this.ballVx * tNext;
      this.ballY += this.ballVy * tNext;
      remaining -= tNext;

      if (tLower <= tUpper) {
        this.ballY = 0;
        this.ballVy = -this.ballVy;
        this.collisionEffects.push({ x: this.ballX, y: 0, time: now, type: 'lower' });
      } else {
        const nx = this.wall2Normal[0];
        const ny = this.wall2Normal[1];
        const dot = this.ballVx * nx + this.ballVy * ny;
        this.ballVx -= 2 * dot * nx;
        this.ballVy -= 2 * dot * ny;
        this.ballY = this.ballX * tanTheta;
        this.collisionEffects.push({ x: this.ballX, y: this.ballY, time: now, type: 'upper' });
      }

      this.collisionCount++;
      collided = true;
      this._pushTrailPoint();
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }

    return collided;
  }

  _pushTrailPoint() {
    this.trail.push([this.ballX, this.ballY]);
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }
  }

  getPiApproximation() {
    return (this.collisionCount + 1) * this.wedgeAngle;
  }

  getFormulaHTML() {
    const effectiveCount = this.collisionCount + 1;
    const value = effectiveCount * this.wedgeAngle;
    return `
      <strong>legacy angle demo</strong>:
      <span class="f-warning">θ is set to π/${this.k}</span><br>
      <span class="f-result">π</span> =
      (<span class="f-count">${this.collisionCount}</span> + 1) ·
      <span class="f-angle">${this.wedgeAngle.toFixed(6)}</span> =
      <span class="f-result">${value.toFixed(6)}</span>
      <span class="f-muted">(valid geometry, π already in setup)</span>
    `;
  }

  getPhasePoint() {
    const radius = Math.hypot(this.ballX, this.ballY);
    const velocityAngle = Math.atan2(this.ballVy, this.ballVx);
    return [radius / this.outerRadius, velocityAngle / Math.PI];
  }

  getPhaseExtractor(viewId) {
    return (pt) => pt;
  }

  // Hub thumbnail focus: both walls + the outer arc of the wedge.
  getPreviewBox() {
    const maxY = Math.max(0.05, this.outerRadius * Math.tan(this.wedgeAngle));
    return { x0: -0.05, x1: this.outerRadius * 1.05, y0: -maxY * 0.1, y1: maxY * 1.1 };
  }

  initSimScene() {
    this.simScene.clear();
    const maxY = Math.max(1e-4, this.outerRadius * Math.tan(this.wedgeAngle));
    this.simCamera = new THREE.OrthographicCamera(
      -0.05,
      this.outerRadius * 1.05,
      maxY * 1.1,
      -maxY * 0.08,
      0.1,
      10
    );
    this.simCamera.position.z = 1;

    const angle = this.wedgeAngle;
    const wallMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    const wall1Geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(this.outerRadius, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(wall1Geom, wallMaterial));

    const wall2Geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(this.outerRadius * Math.cos(angle), this.outerRadius * Math.sin(angle), 0)
    ]);
    this.simScene.add(new THREE.Line(wall2Geom, wallMaterial));

    const arcPoints = [];
    const arcSegments = 80;
    for (let i = 0; i <= arcSegments; i++) {
      const t = (i / arcSegments) * angle;
      arcPoints.push(new THREE.Vector3(
        this.outerRadius * Math.cos(t),
        this.outerRadius * Math.sin(t),
        0
      ));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
    this.simScene.add(new THREE.Line(arcGeom, new THREE.LineBasicMaterial({
      color: 0x2a2a4a,
      transparent: true,
      opacity: 0.75
    })));

    const ballGeom = new THREE.CircleGeometry(Math.max(1.5e-5, maxY * 0.09), 24);
    this.ballMesh = new THREE.Mesh(ballGeom, new THREE.MeshBasicMaterial({ color: 0xe94560 }));
    this.simScene.add(this.ballMesh);

    const trailPositions = new Float32Array(this.maxTrailLength * 3);
    this.simTrailGeom = new THREE.BufferGeometry();
    this.simTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.simTrailGeom.setDrawRange(0, 0);
    this.simTrailLine = new THREE.Line(
      this.simTrailGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.4 })
    );
    this.simScene.add(this.simTrailLine);

    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ringGeom = new THREE.RingGeometry(
        Math.max(1.2e-5, maxY * 0.08),
        Math.max(2.0e-5, maxY * 0.12),
        24
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  updateSimScene() {
    if (!this.ballMesh) return;

    this.ballMesh.position.set(this.ballX, this.ballY, 0);

    const positions = this.simTrailGeom.attributes.position.array;
    const count = Math.min(this.trail.length, this.maxTrailLength);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = this.trail[i][0];
      positions[i * 3 + 1] = this.trail[i][1];
      positions[i * 3 + 2] = 0;
    }
    this.simTrailGeom.attributes.position.needsUpdate = true;
    this.simTrailGeom.setDrawRange(0, count);

    const now = performance.now();
    const EFFECT_DURATION = 280;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);

    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        const scale = 1 + progress * 4;
        ring.visible = true;
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.75;
        ring.material.color.setHex(effect.type === 'upper' ? 0x4cc9f0 : 0xffffff);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(WedgeBilliard);
