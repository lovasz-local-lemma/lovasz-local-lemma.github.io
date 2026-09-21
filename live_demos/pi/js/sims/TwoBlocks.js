// js/sims/TwoBlocks.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

export class TwoBlocks extends Simulation {
  static id = 'two-blocks';
  static title = 'Two Blocks';
  static description = 'The original — elastic collisions compute π';
  static piMechanism = 'exact: mass ratio 100ⁿ → count collisions → digits of π';
  static rigor = 'Exact';
  static sortOrder = 10;
  static previewSteps = 16;   // hub thumbnail: closest approach — blocks pinned at the wall
  static alternatives = [
    { id: 'rolling-sliding', label: 'Any rigid body, same count' },
    { id: 'archimedes-doubling', label: 'π by squeezing instead' },
  ];
  static explanation = {
    setup: 'A small block (mass 1) sits between a wall and a large block (mass 100ⁿ). The large block slides toward the wall. All collisions are perfectly elastic.',
    insight: 'In rescaled momentum space (q₁ = √m₁·v₁, q₂ = √m₂·v₂), energy conservation means the trajectory lies on a circle. Each collision reflects the point off a line. The number of reflections inside a circle equals the inscribed angle divided into π — giving us digits of π! That is why the "initial velocity" slider is an INVARIANCE demo rather than a tuning knob: v₀ only sets the radius R = √m₂·v₀ of that circle, and the count depends on the reflection angle α = arctan√(m₁/m₂) — which is fixed by the mass ratio alone — so R divides straight out. Drag it and the blocks visibly speed up or slow down while the count, and every digit, hold absolutely still (measured: 314 collisions at n=2 for v₀ = 0.1, 0.3, 1, 1.7, 2.5 and 3 alike).',
    contrast: 'This is the canonical two-mode system. The exact analogs elsewhere in the app all reduce back to this same picture: a conserved circle plus a single reflection angle α.',
    formula: 'π ≈ collisions × arctan(√(m₁/m₂)); the finite angular sweep approximates π, while the selected mass ratios give its digit count.',
    getExpected: (params) => {
      const n = params.n || 2;
      const M = Math.pow(100, n);
      const alpha = Math.atan(1 / Math.sqrt(M));
      const expectedCount = Math.floor(Math.PI / alpha);  // display-only: explanatory blurb, not the estimator
      return `For n=${n}: α = arctan(1/${Math.round(Math.sqrt(M))}) = ${alpha.toFixed(6)} rad. Expect ${expectedCount} collisions × ${alpha.toFixed(6)} = ${(expectedCount * alpha).toFixed(6)}`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.initialVelocity = params.velocity || 1;
    this.reset();
  }

  reset() {
    super.reset();
    this.m1 = 1;
    this.m2 = Math.pow(100, this.n);
    this.x1 = 0.3;
    this.x2 = 0.7;
    this.v1 = 0;
    this.v2 = -this.initialVelocity;
    this.blockSize1 = 0.06;
    this.blockSize2 = Math.min(0.2, 0.06 + 0.02 * this.n);
    this.finished = false;
    this.collisionEffects = [];
  }

  getControls() {
    return [
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 6, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); } },
      // NOT a tuning knob — the cheapest invariance demo in the family, so the label
      // says so. v₀ enters only as the radius R = √m₂·v₀ of the rescaled-momentum
      // circle, and it divides out of the estimator (the count depends on the
      // reflection angle α = atan√(m₁/m₂), which is a mass ratio alone). Verified
      // headlessly: n=1/2/3 give 31/314/3141 collisions for EVERY v₀ in
      // {0.1, 0.3, 1, 1.7, 2.5, 3}, and the recorded rescaled phase points agree to
      // ≤6.3e-15. So the blocks visibly change speed while the digits do not move.
      { type: 'slider', id: 'velocity', label: 'Initial velocity (the count does not care)', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{
      id: 'p1-p2',
      label: 'Q_small vs Q_large (rescaled momenta)',
      dimension: 2,
      primary: true,
      axisLabels: { x: 'Q_small = sqrt(m1) v1', y: 'Q_large = sqrt(m2) v2' }
    }];
  }

  /**
   * Advance physics by dt, handling ALL collisions within dt.
   * Uses exact analytical collision times — no missed collisions.
   * Returns true if any collision occurred.
   */
  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();

    while (remaining > 1e-15) {
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > 0) {
        tWall = this.x1 / (-this.v1);
      }

      let tBlock = Infinity;
      const gap = this.x2 - this.x1 - this.blockSize1;
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) {
        tBlock = gap / closing;
      }

      const tNext = Math.min(tWall, tBlock);

      if (tNext > remaining) {
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        break;
      }

      this.x1 += this.v1 * tNext;
      this.x2 += this.v2 * tNext;
      remaining -= tNext;

      if (tWall <= tBlock) {
        this.x1 = 0;
        this.v1 = Math.abs(this.v1);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: this.blockSize1 / 2, time: now, type: 'wall' });
      } else {
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
        this.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        this.x1 = this.x2 - this.blockSize1;
        this.collisionCount++;
        this.collisionEffects.push({ x: this.x2, y: Math.max(this.blockSize1, this.blockSize2) / 2, time: now, type: 'block' });
      }
      collided = true;
      // Record phase point at exact collision moment for sharp reflections
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      if (this.getRawPhasePoint) {
        this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
      }
    }

    if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) {
      this.finished = true;
    }
    return collided;
  }

  getPiApproximation() {
    // EXACT formula: π = count × arctan(√(m₁/m₂))
    // The trajectory reflects inside a sector of angle α = arctan(√(m₁/m₂))
    // and count = floor(π/α), so count × α → π as mass ratio → ∞
    const alpha = Math.atan(Math.sqrt(this.m1 / this.m2));
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
      <strong>count-only setup</strong>:
      <span class="f-mass">m₁ = 1</span>,
      <span class="f-mass">m₂ = 100^${this.n}</span><br>
      <span class="f-angle">α = atan(1/10^${this.n})</span>;
      <span class="f-result">π digits</span> ≈
      <span class="f-count">${count}</span> /
      <span class="f-angle">10^${this.n}</span> =
      <span style="font-size:1.1em">${piDigitsHTML(digitRead, this.n + 2)}</span>
      <span class="f-muted">(Nα = ${angleRead.toFixed(6)})</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    return [q1 / R, q2 / R];
  }

  getRawPhasePoint() {
    const p1 = this.m1 * this.v1;
    const p2 = this.m2 * this.v2;
    // Normalize by max momentum for display
    const R = this.m2 * this.initialVelocity;
    return [p1 / R, p2 / R];
  }

  getPhaseExtractor(viewId) { return (pt) => pt; }

  // Hub thumbnail focus: the wall plus both blocks (not the long empty floor).
  getPreviewBox() {
    const x1 = Math.max(0.55, this.x2 + this.blockSize2 + 0.1);
    return { x0: -0.07, x1, y0: -0.05, y1: 0.34 };
  }

  getRawExpectedShape(viewId) {
    if (viewId === 'p1-p2') {
      // Raw phase coords: x = m1*v1/R, y = m2*v2/R  where R = m2*v0
      // Energy constraint: (m2/m1)*x^2 + y^2 = 1
      // => ellipse with semiAxisX = sqrt(m1/m2), semiAxisY = 1.0
      return { type: 'ellipse', params: { semiAxisX: Math.sqrt(this.m1 / this.m2), semiAxisY: 1.0 } };
    }
    return null;
  }

  // --- Three.js rendering ---

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.2, 0.5, -0.3, 0.1, 10);
    this.simCamera.position.z = 1;

    // Wall
    const wallGeom = new THREE.PlaneGeometry(0.02, 0.6);
    const wall = new THREE.Mesh(wallGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wall.position.set(-0.01, 0.1, 0);
    this.simScene.add(wall);

    // Floor
    const floorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.2, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(floorGeom, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Small block
    const block1Geom = new THREE.PlaneGeometry(this.blockSize1, this.blockSize1);
    this.block1Mesh = new THREE.Mesh(block1Geom, new THREE.MeshBasicMaterial({ color: 0xe94560 }));
    this.block1Mesh.position.y = this.blockSize1 / 2;
    this.simScene.add(this.block1Mesh);

    // Large block
    const block2Geom = new THREE.PlaneGeometry(this.blockSize2, this.blockSize2);
    this.block2Mesh = new THREE.Mesh(block2Geom, new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.7 }));
    this.block2Mesh.position.y = this.blockSize2 / 2;
    this.simScene.add(this.block2Mesh);

    // Velocity arrows
    this.arrow1 = this.makeArrow(0x4cc9f0);
    this.arrow2 = this.makeArrow(0x4cc9f0);
    this.simScene.add(this.arrow1);
    this.simScene.add(this.arrow2);

    // Collision effect rings (pool of 5)
    this.effectMeshes = [];
    for (let i = 0; i < 5; i++) {
      const ringGeom = new THREE.RingGeometry(0.01, 0.015, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  makeArrow(color) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)
    ]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
    line.visible = false;
    return line;
  }

  updateSimScene() {
    if (!this.block1Mesh) return;

    this.block1Mesh.position.x = this.x1 + this.blockSize1 / 2;
    this.block2Mesh.position.x = this.x2 + this.blockSize2 / 2;

    // Velocity arrows
    if (this.showVectors) {
      this.arrow1.visible = true;
      this.arrow2.visible = true;
      const scale = 0.1;
      this.updateArrow(this.arrow1, this.x1 + this.blockSize1 / 2, this.blockSize1 + 0.02, this.v1 * scale);
      this.updateArrow(this.arrow2, this.x2 + this.blockSize2 / 2, this.blockSize2 + 0.02, this.v2 * scale);
    } else {
      this.arrow1.visible = false;
      this.arrow2.visible = false;
    }

    // Collision pulse effects
    const now = performance.now();
    const EFFECT_DURATION = 300;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);

    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        const scale = 1 + progress * 5;
        ring.visible = true;
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }

  updateArrow(arrow, x, y, length) {
    const positions = arrow.geometry.attributes.position.array;
    positions[0] = x; positions[1] = y; positions[2] = 0;
    positions[3] = x + length; positions[4] = y; positions[5] = 0;
    arrow.geometry.attributes.position.needsUpdate = true;
  }
}

registerSim(TwoBlocks);
