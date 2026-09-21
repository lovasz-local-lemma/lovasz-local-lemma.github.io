import * as THREE from 'three';
import { BiasedPiCounter } from '../core/BiasedPiCounter.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// Galperin's two-block π counter, but on a TILTED table. A constant
// gravitational pull g·sin(φ) acts ALONG the collision axis, pointing DOWN the
// ramp (away from the wall, which sits at the top). Between collisions BOTH
// blocks accelerate at the same rate, so:
//   • block↔block collisions are UNCHANGED (equal accel cancels in the relative
//     frame — the gap closes at a constant rate exactly as on the flat table),
//   • but every WALL bounce reflects a velocity that gravity has meanwhile
//     boosted, and reflection flips the sign of that boost.
// So kinetic energy is no longer conserved between hits: in rescaled-momentum
// space the state no longer rides a fixed circle — the circle BREATHES — and the
// collision count drifts from the ideal ⌊π/atan(10⁻ⁿ)⌋. At φ=0 the ramp is flat,
// gravity vanishes, and the exact Two-Blocks count is recovered. Tilting more
// makes the drift grow. Because gravity points away from the wall, the blocks
// always eventually slide off downhill and the run terminates cleanly.
const G_BASE = 2;   // base gravity; the along-axis accel is G_BASE·sin(φ)

export class GravityRampGalperin extends BiasedPiCounter {
  static id = 'gravity-ramp-galperin';
  static title = 'Gravity Ramp Galperin';
  static description = 'Tilt the table — gravity bends the collision count off π';
  static piMechanism = 'biased: gravity accelerates the blocks between hits, so the momentum circle breathes';
  static rigor = 'Biased';
  static piNature = 'biased';
  static piLabel = 'π ≈';
  static sortOrder = 92;
  static previewSteps = 16;   // hub thumbnail: mid-run, blocks near the wall on the ramp
  static alternatives = [
    { id: 'two-blocks', label: 'The flat, exact original' },
    { id: 'loaded-disc-galperin', label: 'A different bias' },
  ];
  static explanation = {
    setup: 'Two blocks (mass 1 and 100ⁿ) collide elastically between a wall and each other, but the whole table is tilted by an angle φ. The wall sits at the TOP of the ramp, so gravity supplies a constant acceleration g·sin(φ) pointing DOWN the ramp, along the collision axis. The big block is launched uphill toward the wall; every collision is still perfectly elastic.',
    insight: 'On the flat table (φ=0) energy is conserved between collisions, so in rescaled-momentum space (q₁=√m₁·v₁, q₂=√m₂·v₂) the state rides a fixed circle and the reflections tile a sector of angle α — giving ⌊π/α⌋ = ⌊π·10ⁿ⌋ collisions, the exact Galperin count. Tilt the table and gravity accelerates BOTH blocks equally between hits. Block↔block collisions are untouched (the equal pull cancels in the relative frame), but each WALL bounce reflects a velocity that gravity has just boosted — so energy is no longer conserved and the momentum circle BREATHES. The reflection sector no longer closes at π, and the count drifts away from the exact value. The bigger the tilt, the bigger the drift.',
    contrast: 'This is Two Blocks with one honest defect: gravity along the axis. Set φ=0 and it becomes the exact counter again; every extra degree of tilt trades accuracy for lean. It sits beside the other bias demos — off-center mass (Loaded Disc), finite-reach magnets — as the "field-tilt" way to spoil an exact π.',
    formula: 'π ≈ count / 10ⁿ  (π-free digit read); exact only at φ=0, where count = ⌊π/atan(10⁻ⁿ)⌋',
    getExpected: (params) => {
      const n = params.n || 2;
      const phi = (params.angleDeg ?? 8) * Math.PI / 180;
      const ideal = Math.floor(Math.PI / Math.atan(Math.pow(10, -n)));
      return phi < 1e-6
        ? `φ=0: flat table → exact Galperin. Expect ${ideal} collisions (π digits from n=${n}).`
        : `φ=${(params.angleDeg ?? 8)}°: gravity along the axis is ${(G_BASE * Math.sin(phi)).toFixed(3)}. The count drifts below the flat ideal ${ideal}; the drift grows with φ.`;
    },
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.angleDeg = params.angleDeg ?? 8;   // ramp tilt in degrees (0 = flat = exact)
    this.initialVelocity = params.velocity || 1;
    this.reset();
  }

  reset() {
    super.reset();
    this.phi = this.angleDeg * Math.PI / 180;
    this.gAxis = G_BASE * Math.sin(this.phi);   // constant accel down the ramp (+x)
    this.m1 = 1;
    this.m2 = Math.pow(100, this.n);
    this.x1 = 0.3;               // left edge of small block, in ramp coordinate
    this.x2 = 0.7;              // left edge of large block
    this.v1 = 0;
    this.v2 = -this.initialVelocity;   // big block launched uphill, toward the wall
    this.blockSize1 = 0.04;
    this.blockSize2 = Math.min(0.2, 0.06 + 0.02 * this.n);
    this.collisionCount = 0;
    this.finished = false;
    this.capped = false;
    this.collisionEffects = [];
  }

  idealCount() { return Math.floor(Math.PI / Math.atan(Math.pow(10, -this.n))); }
  idealKnobValue() { return 0; }     // φ = 0 is the exact configuration
  biasSource() { return 'gravity along the collision axis boosts each approach, so the momentum circle breathes'; }

  getControls() {
    return [
      { type: 'slider', id: 'angleDeg', label: 'Ramp angle φ (deg)', min: 0, max: 25, step: 1,
        default: this.angleDeg, highlight: true,
        onChange: (v) => { this.angleDeg = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 4, step: 1, default: this.n,
        onChange: (v) => { this.n = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Launch speed', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (v) => { this.initialVelocity = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{
      id: 'q1-q2',
      label: 'Q_small vs Q_large (rescaled momenta — the breathing circle)',
      dimension: 2,
      primary: true,
      axisLabels: { x: 'Q_small = √m₁ v₁', y: 'Q_large = √m₂ v₂' },
    }];
  }

  // Earliest t>0 with x1 + v1·t + ½·a·t² = 0 (wall at ramp-coord 0), a = gAxis ≥ 0.
  _wallTime() {
    const a = this.gAxis, x = this.x1, v = this.v1;
    if (a < 1e-12) return v < 0 ? x / (-v) : Infinity;
    const disc = v * v - 2 * a * x;
    if (disc < 0) return Infinity;         // gravity turns the block around before the wall
    const s = Math.sqrt(disc);
    const t1 = (-v - s) / a, t2 = (-v + s) / a, EPS = 1e-12;
    let t = Infinity;
    if (t1 > EPS && t1 < t) t = t1;
    if (t2 > EPS && t2 < t) t = t2;
    return t;
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();
    const a = this.gAxis;
    let guard = 0;
    while (remaining > 1e-15 && guard++ < 200000) {
      const tWall = this._wallTime();
      const gap = this.x2 - this.x1 - this.blockSize1;
      const closing = this.v1 - this.v2;           // equal gravity cancels here → linear
      const tBlock = (closing > 0 && gap > 0) ? gap / closing : Infinity;
      const tNext = Math.min(tWall, tBlock);

      if (!Number.isFinite(tNext)) {
        // Nothing more can collide; blocks coast off downhill. Advance and stop.
        this.x1 += this.v1 * remaining + 0.5 * a * remaining * remaining;
        this.x2 += this.v2 * remaining + 0.5 * a * remaining * remaining;
        this.v1 += a * remaining;
        this.v2 += a * remaining;
        this.finished = true;
        break;
      }

      if (tNext > remaining) {
        this.x1 += this.v1 * remaining + 0.5 * a * remaining * remaining;
        this.x2 += this.v2 * remaining + 0.5 * a * remaining * remaining;
        this.v1 += a * remaining;
        this.v2 += a * remaining;
        break;
      }

      // Advance to the collision event.
      this.x1 += this.v1 * tNext + 0.5 * a * tNext * tNext;
      this.x2 += this.v2 * tNext + 0.5 * a * tNext * tNext;
      this.v1 += a * tNext;
      this.v2 += a * tNext;
      remaining -= tNext;

      if (tWall <= tBlock) {
        this.x1 = 0;
        this.v1 = -this.v1;                          // elastic wall reflection
        this.collisionCount++;
        this.collisionEffects.push({ xr: 0, h: this.blockSize1 / 2, time: now, type: 'wall' });
      } else {
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
        this.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        this.x1 = this.x2 - this.blockSize1;
        this.collisionCount++;
        this.collisionEffects.push({ xr: this.x2, h: Math.max(this.blockSize1, this.blockSize2) / 2, time: now, type: 'block' });
      }
      collided = true;
      this.pendingPhasePoints.push([...this.getPhasePoint()]);

      // Both blocks moving away from the wall, big one not being caught: done.
      if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) { this.finished = true; break; }
    }
    if (guard >= 200000) { this.capped = true; this.finished = true; }
    return collided;
  }

  getCountLabel() { return 'Collisions'; }
  getCollisionCount() { return this.collisionCount; }

  measuredPi() { return this.collisionCount / Math.pow(10, this.n); }   // π-free digit read
  getBand() { return null; }   // deterministic bias — a digit read vs the ideal π, not a stochastic band

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const ideal = this.idealCount();
    const drift = count - ideal;
    const exact = this.angleDeg === 0;
    return `
      <strong>gravity ramp</strong>:
      <span class="f-mass">m₁ = 1</span>,
      <span class="f-mass">m₂ = 100^${this.n}</span>,
      <span class="f-angle">φ = ${this.angleDeg}°</span>
      <span class="f-mass">(g·sinφ = ${this.gAxis.toFixed(3)} along the axis)</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> /
      <span class="f-angle">10^${this.n}</span> =
      <span style="font-size:1.1em">${piDigitsHTML(count / scale, this.n + 2)}</span><br>
      <span class="f-muted">flat ideal ⌊π·10^${this.n}⌋ = ${ideal}; drift = ${drift > 0 ? '+' : ''}${drift}${this.capped ? ' (run capped)' : ''}.
      ${exact
        ? 'φ = 0: gravity vanishes, the count is the exact Galperin value.'
        : 'gravity accelerates the blocks between hits, so the momentum circle breathes and the count drifts. Flatten the ramp to recover Two Blocks.'}</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    return [q1 / R, q2 / R];
  }

  getPhaseExtractor() { return (pt) => pt; }

  // --- rendering: a tilted ramp with wall (uphill) + two sliding blocks ---

  // Map a ramp coordinate (xr along the ramp from the wall, h perpendicular
  // above the surface) into world (x, y). Rotates the ramp clockwise by φ so it
  // slopes down to the right, with gravity's along-axis component pointing +xr.
  _w(xr, h) {
    const c = Math.cos(this.phi), s = Math.sin(this.phi);
    return [xr * c + h * s, -xr * s + h * c];
  }

  initSimScene() {
    this.simScene.clear();
    const c = Math.cos(this.phi), s = Math.sin(this.phi);
    const Xmax = 1.25;
    this.simCamera = new THREE.OrthographicCamera(
      -0.12, Xmax * c + 0.14, 0.5 * c + 0.12, -Xmax * s - 0.12, 0.1, 10);
    this.simCamera.position.z = 1;

    // Ramp surface line
    const [fx0, fy0] = this._w(-0.05, 0), [fx1, fy1] = this._w(Xmax, 0);
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(fx0, fy0, 0), new THREE.Vector3(fx1, fy1, 0)]),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Wall at the top of the ramp (perpendicular to the surface)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const [wx, wy] = this._w(-0.01, 0.25);
    wall.position.set(wx, wy, 0);
    wall.rotation.z = -this.phi;
    this.simScene.add(wall);

    // Gravity indicator: a short arrow down the ramp near the wall
    const [gx0, gy0] = this._w(0.14, 0.34), [gx1, gy1] = this._w(0.30, 0.34);
    this.gArrow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(gx0, gy0, 0), new THREE.Vector3(gx1, gy1, 0)]),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.7 }));
    this.gArrow.visible = this.gAxis > 1e-9;
    this.simScene.add(this.gArrow);

    // Small block
    this.block1Mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.blockSize1, this.blockSize1),
      new THREE.MeshBasicMaterial({ color: 0xe94560 }));
    this.block1Mesh.rotation.z = -this.phi;
    this.simScene.add(this.block1Mesh);

    // Large block
    this.block2Mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.blockSize2, this.blockSize2),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.7 }));
    this.block2Mesh.rotation.z = -this.phi;
    this.simScene.add(this.block2Mesh);

    // Velocity arrows (along the ramp)
    this.arrow1 = this._makeArrow(0x4cc9f0);
    this.arrow2 = this._makeArrow(0x4cc9f0);
    this.simScene.add(this.arrow1);
    this.simScene.add(this.arrow2);

    // Collision effect rings
    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.015, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }

    this._place();
  }

  _makeArrow(color) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ color }));
    line.visible = false;
    return line;
  }

  _place() {
    if (!this.block1Mesh) return;
    const [b1x, b1y] = this._w(this.x1 + this.blockSize1 / 2, this.blockSize1 / 2);
    this.block1Mesh.position.set(b1x, b1y, 0);
    const [b2x, b2y] = this._w(this.x2 + this.blockSize2 / 2, this.blockSize2 / 2);
    this.block2Mesh.position.set(b2x, b2y, 0);
  }

  updateSimScene() {
    if (!this.block1Mesh) return;
    this._place();

    // Velocity arrows along the ramp direction.
    if (this.showVectors) {
      const dir = [Math.cos(this.phi), -Math.sin(this.phi)];
      const scale = 0.1;
      const set = (arrow, xr, h, v) => {
        arrow.visible = true;
        const [ox, oy] = this._w(xr, h);
        const pos = arrow.geometry.attributes.position.array;
        pos[0] = ox; pos[1] = oy; pos[2] = 0.01;
        pos[3] = ox + dir[0] * v * scale; pos[4] = oy + dir[1] * v * scale; pos[5] = 0.01;
        arrow.geometry.attributes.position.needsUpdate = true;
      };
      set(this.arrow1, this.x1 + this.blockSize1 / 2, this.blockSize1 + 0.02, this.v1);
      set(this.arrow2, this.x2 + this.blockSize2 / 2, this.blockSize2 + 0.02, this.v2);
    } else {
      this.arrow1.visible = false;
      this.arrow2.visible = false;
    }

    // Collision pulse effects.
    const now = performance.now();
    const EFFECT_DURATION = 320;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);
    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const e = this.collisionEffects[i];
        const progress = (now - e.time) / EFFECT_DURATION;
        const sc = 1 + progress * 5;
        const [ex, ey] = this._w(e.xr, e.h);
        ring.visible = true;
        ring.position.set(ex, ey, 0.02);
        ring.scale.set(sc, sc, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(e.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }

  // Hub thumbnail focus: wall + both blocks on the tilted ramp (world AABB).
  getPreviewBox() {
    const pts = [
      this._w(-0.03, 0), this._w(-0.03, 0.5),
      this._w(this.x1 + this.blockSize1, this.blockSize1),
      this._w(this.x2 + this.blockSize2 + 0.06, 0),
      this._w(this.x2 + this.blockSize2 + 0.06, this.blockSize2),
    ];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of pts) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    const pad = 0.04;
    return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
  }
}

registerSim(GravityRampGalperin);
