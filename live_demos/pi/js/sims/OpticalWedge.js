import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { initUnfold, updateUnfold, piDigitsHTML } from './wedgeUnfold.js';

export class OpticalWedge extends Simulation {
  static id = 'optical-wedge';
  static title = 'Optical Wedge';
  static description = 'Mirror-wedge variant — the angle comes from a slope, not from π itself';
  static piMechanism = 'exact geometric: θ = arctan(10^-n) → reflections → π';
  static rigor = 'Exact Geometric';
  static sortOrder = 40;
  static previewSteps = 24;   // hub thumbnail: mid-sweep of the unfolded ray
  static previewParams = { view: 'semi' };   // thumbnail renders the unfold half-disc
  static alternatives = [
    { id: 'cone-kaleidoscope', label: 'Cone-surface cousin' },
    { id: 'helical-cylinder', label: 'Cylinder-surface cousin' },
    { id: 'coxeter-chambers', label: 'The reflection-group chamber' },
    { id: 'wedge-billiard', label: 'The legacy π/k demo' },
  ];
  static explanation = {
    setup: 'A light ray starts inside a mirror wedge of opening angle θ = arctan(10^-n). The ray reflects elastically between the mirrors, just like a billiard path.',
    insight: 'Unfold the reflections by mirroring the wedge instead of the ray. The zig-zag path becomes one straight line crossing a fan of wedges, so the number of wall hits is the number of wedge boundaries crossed before the direction has swept through π radians.',
    contrast: 'This makes more sense than specifying θ = π/k: the input is the plain slope 10^-n, so π is not preloaded — the count produces it. This card is about ONE ray\'s trajectory; its cone and cylinder cousins roll the same flat sector onto curved surfaces (bending without stretching keeps the count). Coxeter Chambers is the deeper relative: it studies the whole reflection GROUP, and in rank 3 a spherical triangle computes π a completely different way — from its angle surplus (Gauss–Bonnet), which no flat wedge can do.',
    formula: 'Nθ ≈ π, with θ = arctan(10^-n); the finite angular step leaves a remainder',
    getExpected: (params) => {
      const n = params.n || 2;
      const theta = Math.atan(Math.pow(10, -n));
      const expected = Math.floor(Math.PI / theta);
      return `For n=${n}: θ = arctan(10^-${n}) = ${theta.toFixed(6)} rad. Expect ${expected} reflections, so Nθ ≈ ${(expected * theta).toFixed(6)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.maxTrailLength = 12000;
    // Default first view = the full-circle kaleidoscope; previews pass
    // view: 'semi' to open straight in the unfold half-disc.
    this.showUnfold = params.view === 'semi';
    this.reset();
  }

  reset() {
    super.reset();
    this.outerRadius = 1.0;
    this.wedgeAngle = Math.atan(Math.pow(10, -this.n));
    this.ballX = 0.95 * this.outerRadius;
    this.ballY = 0.92 * this.ballX * Math.tan(this.wedgeAngle);
    this.ballX0 = this.ballX;     // unfolded ray start
    this.ballY0 = this.ballY;     // unfolded ray height (stays constant)
    this.ballVx = -1.0;
    this.ballVy = 0.0;
    this.wall2Normal = [-Math.sin(this.wedgeAngle), Math.cos(this.wedgeAngle)];
    this.unfoldS = 0;             // distance traveled along the straight unfolded ray
    this.unfoldN = Math.floor(Math.PI / this.wedgeAngle);
    this.foldDispN = 12;          // exaggerated kaleidoscope sectors per half-turn (display only)
    this.finished = false;
    this.trail = [];
    this.collisionEffects = [];
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'n', label: 'Slope exponent n',
        min: 1, max: 4, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      { type: 'select', id: 'wedgeView', label: 'View',
        options: [
          { value: 'full', label: 'Expand to full circle (kaleidoscope)' },
          { value: 'semi', label: 'Semicircle (unfold to a straight line)' },
        ],
        default: this.showUnfold ? 'semi' : 'full',
        onChange: (v) => { this.showUnfold = (v === 'semi'); this.initSimScene(); } },
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
        this.unfoldS += remaining;
        this._pushTrailPoint();
        this.finished = true;
        break;
      }

      if (tNext > remaining) {
        this.ballX += this.ballVx * remaining;
        this.ballY += this.ballVy * remaining;
        this.unfoldS += remaining;
        this._pushTrailPoint();
        break;
      }

      this.ballX += this.ballVx * tNext;
      this.ballY += this.ballVy * tNext;
      this.unfoldS += tNext;
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
    return this.collisionCount * this.wedgeAngle;
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const value = count * this.wedgeAngle;
    return `
      <strong>slope-made mirror angle</strong>:
      <span class="f-angle">θ = atan(10^-${this.n})</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> ·
      <span class="f-angle">${this.wedgeAngle.toFixed(6)}</span> =
      <span class="f-result">${value.toFixed(6)}</span>
      <br><span style="font-size:1.1em">π = ${piDigitsHTML(count / scale, this.n + 2)}</span>
      ${!this.showUnfold ? `<br><span class="f-muted">kaleidoscope view — wedge exaggerated to ${this.foldDispN} sectors per half-turn for visibility (true θ = ${this.wedgeAngle.toFixed(5)} rad → ${this.unfoldN} per half-turn). Every mirror image rides one circle at the ball's distance from the apex; the green ball is the same ball <em>unfolded</em> — it never bounces, just advances straight through the mirror copies.</span>` : `<br><span class="f-muted">semicircle unfold — the bouncing path straightens into one ray that sweeps π; the inset (top-left) shows the same ball still bouncing in the real wedge.</span>`}
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

  // Hub thumbnail focus: the unfold half-disc (matches initUnfold's camera —
  // x ±1.12R, y −0.16R…1.06R). The kaleidoscope view frames itself.
  getPreviewBox() {
    if (!this.showUnfold) return null;
    const R = this.outerRadius;
    return { x0: -1.15 * R, x1: 1.15 * R, y0: -0.2 * R, y1: 1.1 * R };
  }

  // --- Unfold view (shared with the cone & helix variants): see wedgeUnfold.js.
  _initUnfoldScene() {
    initUnfold(this, { R: this.outerRadius, wedgeAngle: this.wedgeAngle, unfoldN: this.unfoldN, x0: this.ballX0, y0: this.ballY0 });
  }

  _updateUnfoldScene() {
    updateUnfold(this, { bx: this.ballX0 - this.unfoldS, by: this.ballY0 });
  }

  // Map a true wedge point into the exaggerated DISPLAY wedge (same radius, the
  // tiny opening angle stretched to a visible one) so the folded view is watchable.
  _mapWedge(x, y) {
    const r = Math.hypot(x, y);
    const phi = Math.atan2(Math.max(0, y), x);
    const disp = Math.max(this.wedgeAngle, Math.PI / this.foldDispN);
    const phiDisp = this.wedgeAngle > 1e-9 ? (phi / this.wedgeAngle) * disp : phi;
    return [r * Math.cos(phiDisp), r * Math.sin(phiDisp)];
  }

  initSimScene() {
    if (this.showUnfold) { this._initUnfoldScene(); return; }
    this.simScene.clear();
    // The true angle is a razor sliver, so the folded view is drawn at an
    // exaggerated opening angle (foldDispN sectors per half-turn) and shown as a
    // full kaleidoscope: the ball plus its mirror images across the wedge walls,
    // which all ride one circle at the ball's distance from the apex.
    const R = this.outerRadius;
    const N = this.foldDispN;
    const thetaDisp = Math.PI / N;
    this.simCamera = new THREE.OrthographicCamera(-R * 1.14, R * 1.14, R * 1.14, -R * 1.14, 0.1, 10);
    this.simCamera.position.z = 1;

    // Real wedge sector [0, thetaDisp] — the actual wedge; the others are images.
    const secPts = [new THREE.Vector3(0, 0, 0)];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * thetaDisp; secPts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
    const secGeom = new THREE.BufferGeometry().setFromPoints(secPts);
    const secIdx = []; for (let i = 1; i < secPts.length - 1; i++) secIdx.push(0, i, i + 1);
    secGeom.setIndex(secIdx);
    const sector = new THREE.Mesh(secGeom, new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
    sector.position.z = -0.01;
    this.simScene.add(sector);

    // Kaleidoscope mirror rays: 2N rays (= N mirror lines). Real walls bright.
    for (let k = 0; k < 2 * N; k++) {
      const a = k * thetaDisp;
      const wall = (k === 0 || k === 1);
      this.simScene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)]),
        new THREE.LineBasicMaterial({ color: wall ? 0xffffff : 0x3a3a5c, transparent: true, opacity: wall ? 1 : 0.5 })));
    }

    // Outer rim (full circle).
    const rimPts = []; for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2; rimPts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Breathing circle through all images (radius = ball's distance from apex): a
    // unit circle scaled live. This is the "all images on one circle" fact.
    const cPts = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; cPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0.005)); }
    this.kaleidoCircle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cPts),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.3 }));
    this.kaleidoCircle.scale.set(1e-3, 1e-3, 1);
    this.simScene.add(this.kaleidoCircle);

    // Real-ball trail (in its sector).
    const trailPositions = new Float32Array(this.maxTrailLength * 3);
    this.simTrailGeom = new THREE.BufferGeometry();
    this.simTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.simTrailGeom.setDrawRange(0, 0);
    this.simTrailLine = new THREE.Line(this.simTrailGeom, new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 }));
    this.simScene.add(this.simTrailLine);

    // Mirror-image ghosts (2N-1).
    this.imageMeshes = [];
    for (let i = 0; i < 2 * N - 1; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(R * 0.019, 16), new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.4 }));
      m.position.z = 0.015; this.simScene.add(m); this.imageMeshes.push(m);
    }

    // Real ball.
    this.ballMesh = new THREE.Mesh(new THREE.CircleGeometry(R * 0.024, 24), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.ballMesh.position.z = 0.02;
    this.simScene.add(this.ballMesh);

    // The "unfolded" straight ball: the same ball that, instead of bouncing,
    // continues straight through each mirror copy. It advances one sector per
    // bounce and never reverses — the unfolded ray, drawn across the kaleidoscope.
    this.ghostTrail = [];
    this._lastGhostCount = 0;
    this.straightGhost = new THREE.Mesh(new THREE.CircleGeometry(R * 0.027, 24), new THREE.MeshBasicMaterial({ color: 0x7CFC8A }));
    this.straightGhost.position.z = 0.026;
    this.simScene.add(this.straightGhost);
    this.straightGhostLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7CFC8A, transparent: true, opacity: 0.65 }));
    this.simScene.add(this.straightGhostLine);

    // Collision rings.
    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.022, R * 0.034, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.visible = false; ring.position.z = 0.03; this.simScene.add(ring); this.effectMeshes.push(ring);
    }
  }

  updateSimScene() {
    if (this.showUnfold) { this._updateUnfoldScene(); return; }
    if (!this.ballMesh) return;
    const R = this.outerRadius, N = this.foldDispN, thetaDisp = Math.PI / N;
    // The ball has no outer wall, so near the end it escapes far past the rim.
    // Clamp the display radius to R (like the unfold view) so the kaleidoscope
    // rides out to the rim and pins there instead of flying off-screen.
    const clamp = (x, y) => { const d = Math.hypot(x, y); return d > R ? [x * R / d, y * R / d] : [x, y]; };
    const [bx0, by0] = this._mapWedge(this.ballX, this.ballY);
    const r = Math.min(Math.hypot(bx0, by0), R);
    const phi = Math.atan2(Math.max(0, by0), bx0);   // [0, thetaDisp]
    const [bxc, byc] = clamp(bx0, by0);
    this.ballMesh.position.set(bxc, byc, 0.02);

    // Mirror images: angles 2k·thetaDisp ± phi, all at radius r. (k=0,+phi = real.)
    let idx = 0;
    for (let k = 0; k < N; k++) {
      for (const sgn of [1, -1]) {
        if (k === 0 && sgn === 1) continue;
        const a = 2 * k * thetaDisp + sgn * phi;
        const m = this.imageMeshes[idx++];
        if (m) m.position.set(r * Math.cos(a), r * Math.sin(a), 0.015);
      }
    }

    // Breathing circle through all the images.
    this.kaleidoCircle.scale.set(Math.max(1e-3, r), Math.max(1e-3, r), 1);

    // Unfolded straight ball: the real ball's image in the sector it would have
    // reached by going straight (one sector per bounce). It meets the bouncing ball
    // on the wall at every hit, so it advances smoothly and never reverses.
    if (this.collisionCount < this._lastGhostCount) this.ghostTrail.length = 0;
    this._lastGhostCount = this.collisionCount;
    const m = ((this.collisionCount % (2 * N)) + 2 * N) % (2 * N);
    const gAng = (m % 2 === 0) ? m * thetaDisp + phi : (m + 1) * thetaDisp - phi;
    const gx = r * Math.cos(gAng), gy = r * Math.sin(gAng);
    this.straightGhost.position.set(gx, gy, 0.026);
    this.ghostTrail.push(gx, gy);
    if (this.ghostTrail.length > 100) this.ghostTrail.splice(0, this.ghostTrail.length - 100);
    const gpts = [];
    for (let i = 0; i < this.ghostTrail.length; i += 2) gpts.push(new THREE.Vector3(this.ghostTrail[i], this.ghostTrail[i + 1], 0.024));
    this.straightGhostLine.geometry.setFromPoints(gpts);

    // Real-ball trail (clamped to the rim too).
    const positions = this.simTrailGeom.attributes.position.array;
    const count = Math.min(this.trail.length, this.maxTrailLength);
    for (let i = 0; i < count; i++) {
      const [tx, ty] = clamp(...this._mapWedge(this.trail[i][0], this.trail[i][1]));
      positions[i * 3] = tx;
      positions[i * 3 + 1] = ty;
      positions[i * 3 + 2] = 0;
    }
    this.simTrailGeom.attributes.position.needsUpdate = true;
    this.simTrailGeom.setDrawRange(0, count);

    // Collision rings at the real ball's wall hits.
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
        const [ex, ey] = clamp(...this._mapWedge(effect.x, effect.y));
        ring.position.set(ex, ey, 0.03);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.75;
        ring.material.color.setHex(effect.type === 'upper' ? 0x4cc9f0 : 0xffffff);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(OpticalWedge);
