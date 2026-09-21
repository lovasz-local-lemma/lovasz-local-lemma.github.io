import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// Two air-hockey pucks on a frictionless rink with one short cushion. The
// large puck is pushed toward the small one, which sits near the cushion.
// Treated as 1D motion along the rink's long axis (top-down view shows the
// pucks but they only move along x). Mathematically identical to Two Blocks.
export class AirHockeyGalperin extends Simulation {
  static id = 'air-hockey-galperin';
  static hubHidden = true;   // retired: the 2D table is decorative (physics is the 1D bounce); still loadable by id
  static previewSteps = 16;   // closest approach
  static title = 'Air Hockey Galperin';
  static description = 'A puck bounces in 2-D against a full-height paddle — Y is irrelevant, X is exactly Two Blocks';
  static piMechanism = 'exact: puck-vs-bar X-collisions ≡ TwoBlocks; the puck\'s Y motion is decoupled';
  static rigor = 'Exact';
  static sortOrder = 35;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static alternatives = [{ id: 'two-blocks', label: 'The original counter' }];
  static explanation = {
    setup: 'A small puck (mass 1) sits near a short rink cushion. A heavy bar (mass 100ⁿ) spanning the full rink height is pushed toward it. The puck slides on frictionless ice, drifting in Y and bouncing off the top/bottom cushions.',
    insight: 'Because the heavy block is a bar across the whole rink, the puck meets it in X at any height — a real collision, not a projection. The puck\'s Y motion is fully decoupled and never touches the count. Project the rink onto the X-axis (the faint shadow puck) and you get exactly Two Blocks: each X-slap is a Galperin reflection in (Q_small, Q_large) space, α = arctan(√(m₁/m₂)), total slaps × α → π.',
    contrast: 'The point: motion in the irrelevant direction doesn\'t change the answer. Turn Y motion on or off and the slap count is identical — π lives entirely in the X-projection.',
    formula: 'π = slaps × arctan(√(m_small / m_large))   [EXACT]',
    getExpected: (params) => {
      const n = params.n || 2;
      const M = Math.pow(100, n);
      const alpha = Math.atan(1 / Math.sqrt(M));
      const expected = Math.floor(Math.PI / alpha);
      return `n=${n}: α = arctan(1/${Math.round(Math.sqrt(M))}) = ${alpha.toFixed(6)} rad. Expect ${expected} slaps (cushion + puck-puck combined).`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.initialVelocity = params.velocity || 1;
    this.ymotion = true;
    this.reset();
  }

  reset() {
    super.reset();
    this.m1 = 1;
    this.m2 = Math.pow(100, this.n);
    this.x1 = 0.32;
    this.x2 = 0.7;
    this.v1 = 0;
    this.v2 = -this.initialVelocity;
    this.r1 = 0.04;
    this.r2 = Math.min(0.10, 0.05 + 0.012 * this.n);
    this.barW = 2 * this.r2;   // heavy block is a full-height bar (paddle)
    // Independent Y motion for the small puck — it drifts and bounces off the
    // top/bottom cushions. The heavy block is a bar spanning the rink, so the
    // puck meets it in X at ANY height: the collision is physical, not a
    // projection trick. Y stays fully decoupled and never affects the count.
    this.yLimit = 0.28;   // match the rink wall (puck edge touches it: y1 = 0.28 − r1)
    this.y1 = 0.10;
    this.vy1 = 0.55;
    this.finished = false;
    this.collisionEffects = [];
  }

  // Advance the decoupled Y motion + cushion bounces. X is untouched.
  _advanceY(dt) {
    if (!this.ymotion) { this.y1 = 0; return; }
    this.y1 += this.vy1 * dt;
    if (this.y1 + this.r1 > this.yLimit) { this.y1 = this.yLimit - this.r1; this.vy1 = -Math.abs(this.vy1); }
    else if (this.y1 - this.r1 < -this.yLimit) { this.y1 = -this.yLimit + this.r1; this.vy1 = Math.abs(this.vy1); }
  }

  getControls() {
    return [
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 5, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Initial velocity', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); } },
      { type: 'toggle', id: 'ymotion', label: 'Y motion', default: this.ymotion },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{
      id: 'q1-q2',
      label: 'rescaled momenta (Q_small, Q_large)',
      dimension: 2,
      primary: true,
      axisLabels: { x: 'Q_small = √m₁ v₁', y: 'Q_large = √m₂ v₂' }
    }];
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();

    this._advanceY(dt);

    while (remaining > 1e-15) {
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > this.r1) {
        tWall = (this.x1 - this.r1) / (-this.v1);
      }
      let tPuck = Infinity;
      const gap = this.x2 - this.x1 - this.r1;   // puck right edge vs bar left face
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) tPuck = gap / closing;

      const tNext = Math.min(tWall, tPuck);
      if (tNext > remaining) {
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        break;
      }
      this.x1 += this.v1 * tNext;
      this.x2 += this.v2 * tNext;
      remaining -= tNext;

      if (tWall <= tPuck) {
        this.x1 = this.r1;
        this.v1 = Math.abs(this.v1);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: 0, time: now, type: 'wall' });
      } else {
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
        this.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        this.x1 = this.x2 - this.r1;
        this.collisionCount++;
        this.collisionEffects.push({ x: this.x2, y: this.y1, time: now, type: 'puck' });
      }
      collided = true;
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }
    if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) this.finished = true;
    return collided;
  }

  getPiApproximation() {
    const alpha = Math.atan(Math.sqrt(this.m1 / this.m2));
    return this.collisionCount * alpha;
  }

  getCountLabel() {
    return 'Slaps';
  }

  getPiReadout() {
    return (this.collisionCount / Math.pow(10, this.n)).toFixed(this.n + 2);
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const alpha = Math.atan(1 / scale);
    return `
      <strong>air-hockey rink</strong>:
      <span class="f-mass">m_small = 1</span>,
      <span class="f-mass">m_large = 100^${this.n}</span><br>
      <span class="f-angle">α = arctan(1/10^${this.n})</span>;
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> · <span class="f-angle">${alpha.toFixed(6)}</span> =
      <span class="f-result">${(count * alpha).toFixed(6)}</span>;
      digit read <span class="f-count">${count}</span>/10^${this.n} =
      <span style="font-size:1.1em">${piDigitsHTML(count / scale, this.n + 2)}</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    return [q1 / R, q2 / R];
  }

  getPhaseExtractor() { return (pt) => pt; }

  // Hub thumbnail focus: cushion + puck + bar (left half of the rink where the action is).
  getPreviewBox() {
    const x1 = Math.max(0.6, this.x2 + this.barW + 0.12);
    return { x0: -0.06, x1, y0: -0.33, y1: 0.33 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.05, 1.3, 0.34, -0.34, 0.1, 10);
    this.simCamera.position.z = 1;

    // Rink (top-down): cushion on left, sides + far end as faint outline
    const rinkPts = [];
    const top = 0.28, bot = -0.28;
    rinkPts.push(new THREE.Vector3(0, top, 0), new THREE.Vector3(1.3, top, 0));
    rinkPts.push(new THREE.Vector3(0, bot, 0), new THREE.Vector3(1.3, bot, 0));
    rinkPts.push(new THREE.Vector3(1.3, top, 0), new THREE.Vector3(1.3, bot, 0));
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(rinkPts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    ));

    // Active cushion on the left (the wall)
    const cushion = new THREE.Mesh(
      new THREE.PlaneGeometry(0.02, top - bot),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    cushion.position.set(-0.01, 0, 0);   // right face at x=0, where the puck edge bounces
    this.simScene.add(cushion);

    // Center spot
    this.simScene.add(new THREE.Mesh(
      new THREE.RingGeometry(0.04, 0.045, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    )).position.set(0.65, 0, 0);

    // Pucks (top-down circles)
    this.puck1 = new THREE.Mesh(
      new THREE.CircleGeometry(this.r1, 32),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.simScene.add(this.puck1);
    // Heavy block: a full-height bar (paddle) spanning the rink. The puck meets
    // it in X at any Y, so the collision is physical — not a projection trick.
    this.bar = new THREE.Mesh(
      new THREE.PlaneGeometry(this.barW, 0.56),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.78 })
    );
    this.simScene.add(this.bar);

    // X-projection shadow of the small puck on the centerline (its X is all that
    // matters for the count — the Two Blocks view).
    this.shadow1 = new THREE.Mesh(
      new THREE.CircleGeometry(this.r1, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })
    );
    this.simScene.add(this.shadow1);

    // Effect rings
    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.012, 0.017, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  updateSimScene() {
    if (!this.puck1) return;
    this.puck1.position.set(this.x1, this.y1, 0.01);
    if (this.bar) this.bar.position.set(this.x2 + this.barW / 2, 0, 0.008);
    if (this.shadow1) { this.shadow1.position.set(this.x1, 0, 0.004); this.shadow1.visible = this.ymotion; }

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
        ring.position.set(effect.x, effect.y, 0.02);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.85;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(AirHockeyGalperin);
