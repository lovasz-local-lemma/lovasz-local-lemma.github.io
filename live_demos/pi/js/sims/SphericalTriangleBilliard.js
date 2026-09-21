import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

const EPS = 1e-8;

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v, length = 1) {
  const n = norm(v) || 1;
  return [v[0] * length / n, v[1] * length / n, v[2] * length / n];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function tangentProjection(v, x, length = norm(v)) {
  const dx = dot(v, x);
  const projected = [
    v[0] - dx * x[0],
    v[1] - dx * x[1],
    v[2] - dx * x[2],
  ];
  return normalize(projected, length);
}

export class SphericalTriangleBilliard extends Simulation {
  static id = 'spherical-triangle';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Spherical Triangle Billiard';
  static description = 'Spherical-chamber extension — reflections happen on great circles instead of lines';
  static piMechanism = 'extension: great-circle mirrors carve out a spherical triangle chamber';
  static rigor = 'Extension';
  static sortOrder = 88;
  static piNature = 'extension';
  static piLabel = 'Status';
  static explanation = {
    setup: 'A point moves along great circles on a sphere and reflects off three great-circle mirrors. The mirrors carve the sphere into a spherical triangle chamber.',
    insight: 'This is the geometric descendant of the three-block picture. Energy still constrains the motion to a sphere, but now the boundaries are spherical rather than planar, so the dynamics are governed by chamber geometry instead of one fixed counting angle.',
    contrast: 'This is exactly the kind of “farther away” extension that keeps the reflection idea while giving up direct π counting. The interesting invariants here are spherical area, chamber angles, and reflection words.',
    formula: 'Extension only: count chamber hits, trace the spherical triangle, and study its geometry.',
    getExpected: () => 'Watch the trajectory ricochet on the sphere and compare its path with the flat wedge cases. The count is still meaningful, but not as a direct π digit readout.'
  };

  constructor(params = {}) {
    super(params);
    this.maxTrailLength = 10000;
    this.reset();
  }

  reset() {
    super.reset();
    this.motionScale = 18;
    this.boundaryNormals = [
      normalize([1, 0, 0]),
      normalize([0, 1, 0]),
      normalize([1, 1, 1]),
    ];
    this.position = normalize([0.42, 0.34, 0.84]);
    const rawVelocity = tangentProjection([0.9, -0.35, 0.2], this.position, 1.35);
    this.velocity = rawVelocity;
    this.trail = [];
    this.collisionEffects = [];
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 40, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'sphere', label: 'Sphere point x × y × z', dimension: 3, primary: true, axisLabels: { x: 'sphere x', y: 'sphere y', z: 'sphere z' } },
      { id: 'xy', label: 'x vs y', dimension: 2, axisLabels: { x: 'sphere x', y: 'sphere y' } },
      { id: 'xz', label: 'x vs z', dimension: 2, axisLabels: { x: 'sphere x', y: 'sphere z' } },
      { id: 'yz', label: 'y vs z', dimension: 2, axisLabels: { x: 'sphere y', y: 'sphere z' } },
    ];
  }

  step(dt) {
    let remaining = dt * this.motionScale;
    let collided = false;
    const now = performance.now();

    while (remaining > 1e-6) {
      const hit = this._findNextHit(remaining);
      if (!hit) {
        this._advanceAlongGreatCircle(remaining);
        this._pushTrailPoint();
        break;
      }

      this._advanceAlongGreatCircle(hit.t);
      remaining -= hit.t;
      const n = hit.normal;
      const vn = dot(this.velocity, n);
      this.velocity = tangentProjection([
        this.velocity[0] - 2 * vn * n[0],
        this.velocity[1] - 2 * vn * n[1],
        this.velocity[2] - 2 * vn * n[2],
      ], this.position, norm(this.velocity));
      this.collisionCount++;
      this.collisionEffects.push({
        x: this.position[0],
        y: this.position[1],
        z: this.position[2],
        time: now,
        type: 'block'
      });
      this._pushTrailPoint();
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      collided = true;
    }

    return collided;
  }

  _findNextHit(maxTime) {
    let best = null;
    for (const normal of this.boundaryNormals) {
      const t = this._timeToBoundary(normal, maxTime);
      if (Number.isFinite(t) && (!best || t < best.t)) {
        best = { t, normal };
      }
    }
    return best;
  }

  _timeToBoundary(normal, maxTime) {
    const speed = norm(this.velocity);
    if (speed < EPS) return Infinity;
    const A = dot(normal, this.position);
    const B = dot(normal, this.velocity) / speed;
    if (A <= EPS && dot(normal, this.velocity) >= -EPS) return Infinity;

    let angle = Math.atan2(B, A) + Math.PI / 2;
    while (angle <= EPS) angle += Math.PI;

    for (let i = 0; i < 3; i++, angle += Math.PI) {
      const t = angle / speed;
      if (t <= EPS || t > maxTime + EPS) continue;
      const deriv = -A * speed * Math.sin(speed * t) + B * speed * Math.cos(speed * t);
      if (deriv < -1e-5) return t;
    }
    return Infinity;
  }

  _advanceAlongGreatCircle(t) {
    const speed = norm(this.velocity);
    if (speed < EPS || t <= 0) return;
    const c = Math.cos(speed * t);
    const s = Math.sin(speed * t);
    const dir = [
      this.velocity[0] / speed,
      this.velocity[1] / speed,
      this.velocity[2] / speed,
    ];

    const oldPosition = this.position;
    const oldVelocity = this.velocity;
    this.position = normalize([
      c * oldPosition[0] + s * dir[0],
      c * oldPosition[1] + s * dir[1],
      c * oldPosition[2] + s * dir[2],
    ]);
    this.velocity = tangentProjection([
      -speed * s * oldPosition[0] + c * oldVelocity[0],
      -speed * s * oldPosition[1] + c * oldVelocity[1],
      -speed * s * oldPosition[2] + c * oldVelocity[2],
    ], this.position, speed);
  }

  _pushTrailPoint() {
    this.trail.push([...this.position]);
    if (this.trail.length > this.maxTrailLength) this.trail.shift();
  }

  getPiApproximation() {
    return this.collisionCount;
  }

  getPiReadout() {
    return 'no direct π';
  }

  getPhasePoint() {
    return [...this.position];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'xy') return (pt) => [pt[0], pt[1]];
    if (viewId === 'xz') return (pt) => [pt[0], pt[2]];
    if (viewId === 'yz') return (pt) => [pt[1], pt[2]];
    return (pt) => pt;
  }

  _makeGreatCircle(normal, color = 0xffffff) {
    let basis = cross(normal, [0, 0, 1]);
    if (norm(basis) < EPS) basis = cross(normal, [0, 1, 0]);
    basis = normalize(basis);
    const basis2 = normalize(cross(normal, basis));

    const points = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(
        basis[0] * Math.cos(a) + basis2[0] * Math.sin(a),
        basis[1] * Math.cos(a) + basis2[1] * Math.sin(a),
        basis[2] * Math.cos(a) + basis2[2] * Math.sin(a),
      ));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 })
    );
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    this.simCamera.position.set(2.1, 1.35, 2.0);
    this.simCamera.lookAt(0, 0, 0);

    this.simScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 36, 36),
      new THREE.MeshBasicMaterial({
        color: 0x16213e,
        wireframe: true,
        transparent: true,
        opacity: 0.22
      })
    ));

    const colors = [0xffffff, 0xffffff, 0xf7c948];
    this.boundaryNormals.forEach((normal, i) => {
      this.simScene.add(this._makeGreatCircle(normal, colors[i]));
    });

    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.simScene.add(this.ballMesh);

    const trailPositions = new Float32Array(this.maxTrailLength * 3);
    this.simTrailGeom = new THREE.BufferGeometry();
    this.simTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.simTrailGeom.setDrawRange(0, 0);
    this.simTrailLine = new THREE.Line(
      this.simTrailGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 })
    );
    this.simScene.add(this.simTrailLine);
  }

  updateSimScene() {
    if (!this.ballMesh) return;

    this.ballMesh.position.set(this.position[0], this.position[1], this.position[2]);

    const positions = this.simTrailGeom.attributes.position.array;
    const count = Math.min(this.trail.length, this.maxTrailLength);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = this.trail[i][0];
      positions[i * 3 + 1] = this.trail[i][1];
      positions[i * 3 + 2] = this.trail[i][2];
    }
    this.simTrailGeom.attributes.position.needsUpdate = true;
    this.simTrailGeom.setDrawRange(0, count);
  }
}

registerSim(SphericalTriangleBilliard);
