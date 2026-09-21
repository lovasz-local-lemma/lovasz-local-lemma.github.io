import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

export class HelicalCylinder extends Simulation {
  static id = 'helical-cylinder';
  static hubHidden = true;   // folded into 'cone-kaleidoscope' (cylinder surface); still loadable by id
  static title = 'Helical Cylinder';
  static description = 'Cylinder-surface variant — a ring and a helix unfold to the same exact wedge';
  static piMechanism = 'exact geometric: meridian-ring / helix angle θ = arctan(10^-n) → reflections → π';
  static rigor = 'Exact Geometric';
  static sortOrder = 56;
  // Hub thumbnail: perspective scene (no getPreviewBox — that's ortho-only).
  // At dt=0.04/step the ball spirals deep by ≈ step 60 (bounce burst ≈ 60–90)
  // and exits the cover strip ≈ step 143, so 60 is mid-spiral action.
  static previewSteps = 60;
  static alternatives = [
    { id: 'cone-kaleidoscope', label: 'The merged card — all three surfaces, one stepper' },
    { id: 'optical-wedge', label: 'The flat mirror wedge' },
  ];
  static explanation = {
    setup: 'A geodesic ray travels on a cylinder between a horizontal ring and a helical mirror. On the cylinder’s infinite covering sheet, that pair of boundaries becomes the exact same flat wedge used by the optical version.',
    insight: 'Because the cylinder unwraps isometrically to a plane, the reflection count is still exact: π ≈ Nθ with θ = arctan(10^-n). The helical barrier makes the geometry feel much farther from the original blocks even though the developed dynamics are identical.',
    contrast: 'Unlike the legacy π/k wedge, the helix pitch sets θ through an ordinary slope. The count reveals π from the covering-sheet geometry; it is not reading π back out of a pre-chosen angle. Honest picture warning: the cylinder’s AXIAL scale is exaggerated in the render so narrow helices stay visible — by ≈20× at n=2 and ≈1989× at n=4 (the live factor is printed in the readout), so the picture is not the isometry the mathematics describes. The merged card (all three surfaces, one stepper) exposes that factor as a control you can set to 1×.',
    formula: 'π = reflections × θ, with θ = arctan(10^-n)  [EXACT GEOMETRIC COUNTER]',
    getExpected: (params) => {
      const n = params.n || 2;
      const theta = Math.atan(Math.pow(10, -n));
      const expected = Math.floor(Math.PI / theta);
      return `For n=${n}: helix angle θ = arctan(10^-${n}) = ${theta.toFixed(6)} rad. Expect ${expected} reflections, so Nθ ≈ ${(expected * theta).toFixed(6)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.maxTrailLength = 12000;
    this.developT = 0;   // 0 = wrapped 3D cylinder, 1 = unrolled flat development
    this.reset();
  }

  reset() {
    super.reset();
    this.radius = 0.12;
    this.turns = 4;
    this.coverLength = this.turns * 2 * Math.PI * this.radius;
    this.wedgeAngle = Math.atan(Math.pow(10, -this.n));
    this.u = 0.95 * this.coverLength;
    this.z = 0.92 * this.u * Math.tan(this.wedgeAngle);
    this.u0 = this.u;
    this.z0 = this.z;
    this.vu = -1.0;
    this.vz = 0.0;
    this.unfoldS = 0;
    this.unfoldN = Math.floor(Math.PI / this.wedgeAngle);
    this.heightMax = this.coverLength * Math.tan(this.wedgeAngle);
    this.displayHeight = Math.max(this.heightMax, 0.6);
    this.heightScale = this.displayHeight / Math.max(this.heightMax, 1e-6);
    this.trail = [];
    this.collisionEffects = [];
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'n', label: 'Helix exponent n',
        min: 1, max: 4, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'developT', label: 'Develop — unroll to flat', min: 0, max: 1, step: 0.01, default: this.developT, highlight: true,
        onChange: (v) => { this.developT = v; if (this.ballMesh) this.updateSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 80, step: 0.1, default: 10 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'cover-angle', label: 'Cover coordinate vs velocity angle', dimension: 2, primary: true }
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
      if (this.vz < -1e-12) {
        const t = -this.z / this.vz;
        if (t > -1e-10) tLower = Math.max(0, t);
      }

      let tUpper = Infinity;
      const denom = this.vz - this.vu * tanTheta;
      if (denom > 1e-12) {
        const t = (this.u * tanTheta - this.z) / denom;
        const clampedT = Math.max(0, t);
        if (t > -1e-10 && this.u + this.vu * clampedT > 0) {
          tUpper = clampedT;
        }
      }

      const tNext = Math.min(tLower, tUpper);
      if (!Number.isFinite(tNext)) {
        this.u += this.vu * remaining;
        this.z += this.vz * remaining;
        this.unfoldS += remaining;
        this._pushTrailPoint();
        this.finished = true;
        break;
      }

      if (tNext > remaining) {
        this.u += this.vu * remaining;
        this.z += this.vz * remaining;
        this.unfoldS += remaining;
        this._pushTrailPoint();
        break;
      }

      this.u += this.vu * tNext;
      this.z += this.vz * tNext;
      this.unfoldS += tNext;
      remaining -= tNext;

      if (tLower <= tUpper) {
        this.z = 0;
        this.vz = -this.vz;
        this.collisionEffects.push({ u: this.u, z: this.z, time: now, type: 'ring' });
      } else {
        const nx = -Math.sin(theta);
        const ny = Math.cos(theta);
        const dot = this.vu * nx + this.vz * ny;
        this.vu -= 2 * dot * nx;
        this.vz -= 2 * dot * ny;
        this.z = this.u * tanTheta;
        this.collisionEffects.push({ u: this.u, z: this.z, time: now, type: 'helix' });
      }

      this.collisionCount++;
      collided = true;
      this._pushTrailPoint();
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }

    return collided;
  }

  _pushTrailPoint() {
    this.trail.push([this.u, this.z]);
    if (this.trail.length > this.maxTrailLength) this.trail.shift();
  }

  getPiApproximation() {
    return this.collisionCount * this.wedgeAngle;
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const value = count * this.wedgeAngle;
    return `
      <strong>unwrapped cylinder sheet</strong>:
      <span class="f-angle">θ = atan(10^-${this.n})</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> ·
      <span class="f-angle">${this.wedgeAngle.toFixed(6)}</span> =
      <span class="f-result">${value.toFixed(6)}</span>
      <span class="f-muted">(helix unwraps to the sloped mirror)</span>
      <br><span style="font-size:1.1em">π = ${piDigitsHTML(count / Math.pow(10, this.n), this.n + 2)}</span>
      <br><span class="f-muted">axial scale stretched <span class="f-warning">×${this.heightScale.toFixed(0)}</span> in the render (picture only — the count never sees it)</span>
      <br><span class="f-muted">drag <em>Develop</em> to unroll the cylinder flat — the helix straightens into the sloped wedge mirror and the geodesic into a straight bounce.</span>
    `;
  }

  getPhasePoint() {
    const velocityAngle = Math.atan2(this.vz, this.vu);
    return [2 * (this.u / this.coverLength) - 1, velocityAngle / Math.PI];
  }

  getPhaseExtractor(viewId) {
    return (pt) => pt;
  }

  mapToCylinder(u, z) {
    const phi = -u / this.radius;
    return [
      this.radius * Math.cos(phi),
      z * this.heightScale - this.displayHeight / 2,
      this.radius * Math.sin(phi),
    ];
  }

  // Embed a development coordinate (u = arc length around the cylinder, z = height
  // coordinate) into 3D, blending between the wrapped cylinder (t=0) and the flat
  // unrolled sheet (t=1). Height (y) is shared; only the circumference unwraps.
  embed(u, z, t) {
    const phi = -u / this.radius;
    const y = z * this.heightScale - this.displayHeight / 2;
    const cx = this.radius * Math.cos(phi), cz = this.radius * Math.sin(phi);
    // Unrolled strip x, clamped: the ball can run past the covering interval
    // (especially as it exits after the last bounce), so pin it at the strip
    // edge in the developed view instead of letting it leave the frame.
    const fx = Math.max(-1.04, Math.min(1.04, (u / this.coverLength - 0.5) * 2.0));
    return [cx * (1 - t) + fx * t, y, cz * (1 - t)];
  }

  _lineFromUZ(uz, material) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(uz.length * 3), 3));
    const line = new THREE.Line(geom, material);
    line.userData.uz = uz;
    return line;
  }

  _morphLine(line, t) {
    const arr = line.geometry.attributes.position.array;
    const uz = line.userData.uz;
    for (let i = 0; i < uz.length; i++) {
      const [x, y, z] = this.embed(uz[i][0], uz[i][1], t);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    line.geometry.attributes.position.needsUpdate = true;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    this.simCamera.position.set(1.15, 0.4, 1.55);
    this.simCamera.lookAt(0, 0, 0);

    const cl = this.coverLength, tanT = Math.tan(this.wedgeAngle);
    this.devLines = [];

    // Bottom ring (z = 0) — the lower mirror.
    const ringUZ = []; for (let i = 0; i <= 160; i++) ringUZ.push([(i / 160) * cl, 0]);
    this.devLines.push(this._lineFromUZ(ringUZ, new THREE.LineBasicMaterial({ color: 0xffffff })));

    // Helix (z = u·tanθ) — the sloped mirror.
    const helixUZ = []; for (let i = 0; i <= 240; i++) { const u = (i / 240) * cl; helixUZ.push([u, u * tanT]); }
    this.devLines.push(this._lineFromUZ(helixUZ, new THREE.LineBasicMaterial({ color: 0xffffff })));

    // Intermediate level lines inside the wedge, for surface texture.
    for (const frac of [0.34, 0.67]) {
      const lvUZ = []; for (let i = 0; i <= 160; i++) { const u = (i / 160) * cl; lvUZ.push([u, frac * u * tanT]); }
      this.devLines.push(this._lineFromUZ(lvUZ, new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.45 })));
    }

    // Meridian ribs from ring to helix at sampled u.
    const RIBS = 16;
    for (let j = 1; j < RIBS; j++) {
      const u = (j / RIBS) * cl;
      this.devLines.push(this._lineFromUZ([[u, 0], [u, u * tanT]], new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.4 })));
    }

    for (const ln of this.devLines) this.simScene.add(ln);

    // Ball.
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 18, 18), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.simScene.add(this.ballMesh);

    // Trail.
    const trailPositions = new Float32Array(this.maxTrailLength * 3);
    this.simTrailGeom = new THREE.BufferGeometry();
    this.simTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.simTrailGeom.setDrawRange(0, 0);
    this.simTrailLine = new THREE.Line(this.simTrailGeom, new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 }));
    this.simScene.add(this.simTrailLine);

    this.updateSimScene();
  }

  updateSimScene() {
    if (!this.ballMesh) return;
    const t = this.developT;

    for (const ln of this.devLines) this._morphLine(ln, t);

    const [bx, by, bz] = this.embed(this.u, this.z, t);
    this.ballMesh.position.set(bx, by, bz);

    const positions = this.simTrailGeom.attributes.position.array;
    const count = Math.min(this.trail.length, this.maxTrailLength);
    for (let i = 0; i < count; i++) {
      const [tx, ty, tz] = this.embed(this.trail[i][0], this.trail[i][1], t);
      positions[i * 3] = tx; positions[i * 3 + 1] = ty; positions[i * 3 + 2] = tz;
    }
    this.simTrailGeom.attributes.position.needsUpdate = true;
    this.simTrailGeom.setDrawRange(0, count);

    // Swing the camera from the 3D view to face-on as the sheet unrolls.
    this.simCamera.position.set(1.15 * (1 - t), 0.4 * (1 - t), 1.55 * (1 - t) + 3.0 * t);
    this.simCamera.lookAt(0, 0, 0);
  }
}

registerSim(HelicalCylinder);
