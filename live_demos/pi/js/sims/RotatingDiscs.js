// js/sims/RotatingDiscs.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class RotatingDiscs extends Simulation {
  static id = 'rotating-discs';
  static hubHidden = true;   // folded into 'rolling-sliding' (spin realization); still loadable by id
  static title = 'Rotating Discs';
  static description = 'Angular-momentum analog — the same circle, with spin instead of translation';
  static piMechanism = 'exact analog: inertia ratio 100ⁿ → angular collisions → π';
  static rigor = 'Exact Analog';
  static sortOrder = 20;
  static previewSteps = 30;   // hub thumbnail: mid-rattle, discs and spin arrows live
  static alternatives = [{ id: 'two-blocks', label: 'Block version' }];
  static explanation = {
    setup: 'Two coaxial discs with moments of inertia I₁ = 1 and I₂ = 100ⁿ. A fixed peg acts as the angular "wall." The large disc starts spinning toward the small disc.',
    insight: 'This is the exact angular analog of two blocks. Replace mass with moment of inertia, velocity with angular velocity, position with angle, and wall with peg. The phase space (L₁ vs L₂) traces the same circle!',
    contrast: 'Nothing genuinely new happens geometrically here. It makes more sense than the multi-block variants because it is still a two-mode reflection problem, just written in angular momentum instead of linear momentum.',
    formula: 'π = collisions × arctan(√(I₁/I₂))  [EXACT]',
    getExpected: (params) => {
      const n = params.n || 2;
      const I2 = Math.pow(100, n);
      const alpha = Math.atan(1 / Math.sqrt(I2));
      const expected = Math.floor(Math.PI / alpha);
      return `For n=${n}: α = arctan(1/${Math.round(Math.sqrt(I2))}) = ${alpha.toFixed(6)} rad. Expect ${expected} angular collisions.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.initialOmega = params.omega || 1;
    this.reset();
  }

  reset() {
    super.reset();
    this.I1 = 1;
    this.I2 = Math.pow(100, this.n);
    // Analog to blocks: peg at theta=0 (wall), disc1 at theta=0.5, disc2 at theta=1.2
    this.theta1 = 0.5;          // small disc angle (from peg)
    this.theta2 = 1.2;          // large disc angle
    this.omega1 = 0;             // small disc stationary
    this.omega2 = -this.initialOmega; // large disc spinning clockwise (toward peg)
    this.finished = false;
    this.collisionEffects = [];
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'n', label: 'Inertia exponent (100ⁿ)',
        min: 1, max: 6, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'L1-L2',
        label: 'Q_inner vs Q_outer (angular momenta)',
        dimension: 2,
        primary: true,
        axisLabels: { x: 'Q_inner = sqrt(I1) omega1', y: 'Q_outer = sqrt(I2) omega2' }
      }
    ];
  }

  /**
   * Event-based collision detection — exact analog of TwoBlocks.
   * Peg at theta=0 acts as the wall. Disc-disc collision when theta1 meets theta2.
   * Uses analytical collision times, handles all collisions within dt.
   */
  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();

    while (remaining > 1e-15) {
      // Peg collision: disc1 approaches theta=0 while spinning clockwise (omega1 < 0)
      let tPeg = Infinity;
      if (this.omega1 < 0 && this.theta1 > 0) {
        tPeg = this.theta1 / (-this.omega1);
      }

      // Disc-disc collision: gap = theta2 - theta1 closing
      let tDisc = Infinity;
      const gap = this.theta2 - this.theta1;
      const closing = this.omega1 - this.omega2; // positive when disc1 approaches disc2
      if (closing > 0 && gap > 0) {
        tDisc = gap / closing;
      }

      const tNext = Math.min(tPeg, tDisc);

      if (tNext > remaining) {
        this.theta1 += this.omega1 * remaining;
        this.theta2 += this.omega2 * remaining;
        break;
      }

      this.theta1 += this.omega1 * tNext;
      this.theta2 += this.omega2 * tNext;
      remaining -= tNext;

      if (tPeg <= tDisc) {
        // Peg collision — angular "wall bounce"
        this.theta1 = 0;
        this.omega1 = Math.abs(this.omega1);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0.3, y: 0, time: now, type: 'wall' });
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        if (this.getRawPhasePoint) this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
      } else {
        // Disc-disc elastic angular collision (I replaces m)
        const I1 = this.I1, I2 = this.I2;
        const w1 = this.omega1, w2 = this.omega2;
        this.omega1 = ((I1 - I2) * w1 + 2 * I2 * w2) / (I1 + I2);
        this.omega2 = ((I2 - I1) * w2 + 2 * I1 * w1) / (I1 + I2);
        this.theta1 = this.theta2; // at contact
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: 0, time: now, type: 'block' });
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        if (this.getRawPhasePoint) this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
      }
      collided = true;
    }

    // Done: both discs spinning counterclockwise, large faster
    if (this.omega1 >= 0 && this.omega2 > 0 && this.omega2 >= this.omega1) {
      this.finished = true;
    }
    return collided;
  }

  getPiApproximation() {
    // Same exact formula as TwoBlocks: π = count × arctan(√(I₁/I₂))
    const alpha = Math.atan(Math.sqrt(this.I1 / this.I2));
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
      <strong>angular block analog</strong>:
      <span class="f-mass">I₁ = 1</span>,
      <span class="f-mass">I₂ = 100^${this.n}</span><br>
      <span class="f-angle">α = atan(1/10^${this.n})</span>;
      <span class="f-result">π digits</span> ≈
      <span class="f-count">${count}</span> /
      <span class="f-angle">10^${this.n}</span> =
      <span class="f-result">${digitRead.toFixed(this.n + 2)}</span>
      <span class="f-muted">(Nα = ${angleRead.toFixed(6)})</span>
    `;
  }

  getPhasePoint() {
    const R = Math.sqrt(this.I2) * this.initialOmega;
    return [Math.sqrt(this.I1) * this.omega1 / R, Math.sqrt(this.I2) * this.omega2 / R];
  }

  getRawPhasePoint() {
    const L1 = this.I1 * this.omega1;
    const L2 = this.I2 * this.omega2;
    const R = this.I2 * this.initialOmega;
    return [L1 / R, L2 / R];
  }

  getPhaseExtractor(viewId) { return (pt) => pt; }

  getRawExpectedShape(viewId) {
    if (viewId === 'L1-L2') {
      // Raw phase coords: x = I1*omega1/R, y = I2*omega2/R  where R = I2*omega0
      // Energy constraint: (I2/I1)*x^2 + y^2 = 1
      // => ellipse with semiAxisX = sqrt(I1/I2), semiAxisY = 1.0
      return { type: 'ellipse', params: { semiAxisX: Math.sqrt(this.I1 / this.I2), semiAxisY: 1.0 } };
    }
    return null;
  }

  // Hub thumbnail focus: both discs + peg + spin arrows (trim the empty margin).
  getPreviewBox() {
    return { x0: -0.9, x1: 0.9, y0: -0.9, y1: 0.9 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
    this.simCamera.position.z = 1;

    // Disc 1 (inner, smaller)
    const disc1Geom = new THREE.RingGeometry(0.25, 0.35, 64);
    const disc1Mat = new THREE.MeshBasicMaterial({
      color: 0xe94560, side: THREE.DoubleSide, transparent: true, opacity: 0.8
    });
    this.disc1Mesh = new THREE.Mesh(disc1Geom, disc1Mat);
    this.simScene.add(this.disc1Mesh);

    // Tick mark on disc 1
    const tick1Geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.25, 0, 0), new THREE.Vector3(0.35, 0, 0)
    ]);
    this.tick1 = new THREE.Line(tick1Geom, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
    this.disc1Mesh.add(this.tick1);

    // Disc 2 (outer, larger)
    const disc2Geom = new THREE.RingGeometry(0.5, 0.7, 64);
    const disc2Mat = new THREE.MeshBasicMaterial({
      color: 0xe94560, side: THREE.DoubleSide, transparent: true, opacity: 0.4
    });
    this.disc2Mesh = new THREE.Mesh(disc2Geom, disc2Mat);
    this.simScene.add(this.disc2Mesh);

    // Tick mark on disc 2
    const tick2Geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0.7, 0, 0)
    ]);
    this.tick2 = new THREE.Line(tick2Geom, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
    this.disc2Mesh.add(this.tick2);

    // Peg (fixed point at angle=0, radius=0.3)
    const pegGeom = new THREE.CircleGeometry(0.03, 16);
    const peg = new THREE.Mesh(pegGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    peg.position.set(0.3, 0, 0);
    this.simScene.add(peg);

    // Center axle
    const axleGeom = new THREE.CircleGeometry(0.04, 16);
    this.simScene.add(new THREE.Mesh(axleGeom, new THREE.MeshBasicMaterial({ color: 0x2a2a4a })));

    this.spinArrow1 = this.makeSpinArrow(0x4cc9f0);
    this.spinArrow2 = this.makeSpinArrow(0xf7c948);
    this.simScene.add(this.spinArrow1, this.spinArrow2);

    // Collision effect rings
    this.effectMeshes = [];
    for (let i = 0; i < 5; i++) {
      const ringGeom = new THREE.RingGeometry(0.02, 0.03, 32);
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
    if (!this.disc1Mesh) return;
    this.disc1Mesh.rotation.z = this.theta1;
    this.disc2Mesh.rotation.z = this.theta2;
    this.updateSpinArrow(this.spinArrow1, 0.42, this.omega1, -0.45);
    this.updateSpinArrow(this.spinArrow2, 0.78, this.omega2, 0.55);

    // Collision effects
    const now = performance.now();
    const EFFECT_DURATION = 300;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);
    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        ring.visible = true;
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(1 + progress * 5, 1 + progress * 5, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }

  makeSpinArrow(color) {
    const group = new THREE.Group();
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)
    ]);
    const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.85
    }));
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.045);
    shape.lineTo(-0.028, -0.024);
    shape.lineTo(0.028, -0.024);
    shape.lineTo(0, 0.045);
    const head = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    group.add(line, head);
    group.userData.line = line;
    group.userData.head = head;
    return group;
  }

  updateSpinArrow(group, radius, omega, centerAngle = 0) {
    if (!group) return;
    const speed = Math.abs(omega);
    group.visible = speed > 0.002;
    if (!group.visible) return;

    const dir = omega >= 0 ? 1 : -1;
    const sweep = Math.min(1.45, Math.max(0.32, speed * 0.18));
    const start = centerAngle - dir * sweep / 2;
    const segments = 36;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const a = start + dir * sweep * (i / segments);
      points.push(new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), 0.03));
    }
    group.userData.line.geometry.dispose();
    group.userData.line.geometry = new THREE.BufferGeometry().setFromPoints(points);

    const end = start + dir * sweep;
    const tangent = end + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const head = group.userData.head;
    head.position.set(radius * Math.cos(end), radius * Math.sin(end), 0.04);
    head.rotation.z = tangent - Math.PI / 2;
    const scale = Math.min(1.45, Math.max(0.72, speed * 0.22));
    head.scale.set(scale, scale, 1);
  }
}

registerSim(RotatingDiscs);
