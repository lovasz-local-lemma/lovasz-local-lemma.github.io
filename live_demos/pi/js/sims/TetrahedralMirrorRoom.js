import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v, scale = 1) {
  const len = length(v) || 1;
  return [v[0] * scale / len, v[1] * scale / len, v[2] * scale / len];
}

export class TetrahedralMirrorRoom extends Simulation {
  static id = 'tetrahedral-room';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Tetrahedral Mirror Room';
  static description = '3D chamber extension — a ray ricochets inside a tetrahedral mirror room';
  static piMechanism = 'extension: face reflections in a 3D simplex chamber';
  static rigor = 'Extension';
  static sortOrder = 98;
  static piNature = 'extension';
  static piLabel = 'Status';
  static explanation = {
    setup: 'A point ray travels inside a tetrahedral mirror room and reflects off its four faces. The room is a 3D simplex chamber rather than a line, circle, or spherical triangle.',
    insight: 'This pushes the reflection idea into full 3D Euclidean space. The natural conserved object is now the direction sphere, while the position explores a polyhedral chamber instead of a single angular sector.',
    contrast: 'This is much farther from the original block billiard. The reflection law is still simple, but the geometry lives in a 3D room, so collision count is no longer tied to one exact π-producing angle.',
    formula: 'Extension only: count face hits and compare the room trajectory with the direction-sphere trajectory.',
    getExpected: () => 'Watch the point trace a 3D mirror path inside the tetrahedron while its velocity direction walks across the sphere.'
  };

  constructor(params = {}) {
    super(params);
    this.maxTrailLength = 10000;
    this.reset();
  }

  reset() {
    super.reset();
    this.motionScale = 10;
    this.position = [0.18, 0.22, 0.26];
    this.velocity = normalize([0.9, 0.65, 0.82], 0.42);
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
      { id: 'direction', label: 'Direction sphere vx × vy × vz', dimension: 3, primary: true, axisLabels: { x: 'direction vx', y: 'direction vy', z: 'direction vz' } },
      { id: 'position', label: 'Position chamber x × y × z', dimension: 3, axisLabels: { x: 'room x', y: 'room y', z: 'room z' } },
      { id: 'vx-vy', label: 'v_x vs v_y', dimension: 2, axisLabels: { x: 'direction vx', y: 'direction vy' } },
      { id: 'x-y', label: 'x vs y', dimension: 2, axisLabels: { x: 'room x', y: 'room y' } },
    ];
  }

  step(dt) {
    let remaining = dt * this.motionScale;
    let collided = false;
    const now = performance.now();

    while (remaining > 1e-8) {
      const hit = this._findNextHit(remaining);
      if (!hit) {
        this.position[0] += this.velocity[0] * remaining;
        this.position[1] += this.velocity[1] * remaining;
        this.position[2] += this.velocity[2] * remaining;
        this._pushTrailPoint();
        break;
      }

      this.position[0] += this.velocity[0] * hit.t;
      this.position[1] += this.velocity[1] * hit.t;
      this.position[2] += this.velocity[2] * hit.t;
      remaining -= hit.t;

      const n = hit.normal;
      const vn = dot(this.velocity, n);
      this.velocity = [
        this.velocity[0] - 2 * vn * n[0],
        this.velocity[1] - 2 * vn * n[1],
        this.velocity[2] - 2 * vn * n[2],
      ];

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
    const hits = [];
    if (this.velocity[0] < -1e-8) hits.push({ t: -this.position[0] / this.velocity[0], normal: [1, 0, 0] });
    if (this.velocity[1] < -1e-8) hits.push({ t: -this.position[1] / this.velocity[1], normal: [0, 1, 0] });
    if (this.velocity[2] < -1e-8) hits.push({ t: -this.position[2] / this.velocity[2], normal: [0, 0, 1] });

    const sum = this.position[0] + this.position[1] + this.position[2];
    const sumV = this.velocity[0] + this.velocity[1] + this.velocity[2];
    if (sumV > 1e-8) {
      hits.push({ t: (1 - sum) / sumV, normal: normalize([1, 1, 1]) });
    }

    let best = null;
    for (const hit of hits) {
      if (hit.t > 1e-8 && hit.t <= maxTime + 1e-8 && (!best || hit.t < best.t)) {
        best = hit;
      }
    }
    return best;
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
    const dir = normalize(this.velocity);
    return [
      dir[0], dir[1], dir[2],
      2 * this.position[0] - 1,
      2 * this.position[1] - 1,
      2 * this.position[2] - 1,
    ];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'position') return (pt) => [pt[3], pt[4], pt[5]];
    if (viewId === 'vx-vy') return (pt) => [pt[0], pt[1]];
    if (viewId === 'x-y') return (pt) => [pt[3], pt[4]];
    return (pt) => [pt[0], pt[1], pt[2]];
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    this.simCamera.position.set(1.9, 1.5, 1.8);
    this.simCamera.lookAt(0.28, 0.25, 0.25);

    const vertices = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];

    const edgePairs = [
      [0, 1], [0, 2], [0, 3],
      [1, 2], [1, 3], [2, 3],
    ];
    edgePairs.forEach(([a, b]) => {
      this.simScene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([vertices[a], vertices[b]]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
      ));
    });

    const faceGeom = new THREE.BufferGeometry();
    const faceVerts = new Float32Array([
      0, 0, 0,  1, 0, 0,  0, 1, 0,
      0, 0, 0,  1, 0, 0,  0, 0, 1,
      0, 0, 0,  0, 1, 0,  0, 0, 1,
      1, 0, 0,  0, 1, 0,  0, 0, 1
    ]);
    faceGeom.setAttribute('position', new THREE.BufferAttribute(faceVerts, 3));
    faceGeom.computeVertexNormals();
    this.simScene.add(new THREE.Mesh(
      faceGeom,
      new THREE.MeshBasicMaterial({
        color: 0x16213e,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
      })
    ));

    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.simScene.add(this.ballMesh);

    const trailPositions = new Float32Array(this.maxTrailLength * 3);
    this.simTrailGeom = new THREE.BufferGeometry();
    this.simTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.simTrailGeom.setDrawRange(0, 0);
    this.simTrailLine = new THREE.Line(
      this.simTrailGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.48 })
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

registerSim(TetrahedralMirrorRoom);
