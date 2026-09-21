// js/sims/ThreeBodyPi.js — Galperin's three-body theorem: drop the wall,
// make the outer blocks heavy (M = 2·100ⁿ each, light block of mass 1 between
// them), and the total collision count reads out digits of π. Momentum
// conservation replaces the wall: it cuts the 3D energy sphere down to a
// circle, restoring the exact two-block wedge picture.
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross3 = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];

export class ThreeBodyPi extends Simulation {
  static id = 'three-body-pi';
  static title = 'Three-Body π — heavy·light·heavy';
  static description = 'No wall, three free blocks — the right mass ratio makes the collision count read π';
  static piMechanism = 'exact: wedge angle arccos√(m₁m₃/((m₁+m₂)(m₂+m₃))) ≈ 10⁻ⁿ → ⌊π·10ⁿ⌋ collisions';
  static rigor = 'Exact';
  static sortOrder = 78;
  static piNature = 'exact';
  static previewSteps = 16;   // hub thumbnail: mid-rattle, light block trapped between the heavies
  static alternatives = [{ id: 'three-blocks', label: 'The with-wall spherical cousin' }];
  static explanation = {
    setup: 'Three free blocks on a frictionless line — no wall anywhere. The outer blocks are heavy (mass M = 2·100ⁿ each), the middle one is light (mass 1). The right heavy block drifts in and every collision is perfectly elastic. The trio has net leftward momentum, so the view rides along with the center of mass (marked by the tick on the floor).',
    insight: 'In rescaled coordinates qᵢ = √mᵢ·vᵢ, energy conservation pins the state to a sphere and momentum conservation pins it to a plane — so the motion lives on their intersection: a circle. Both collision conditions are mirror lines through that circle, meeting at angle α = arccos(M/(M+1)) ≈ 10⁻ⁿ. The trajectory is a billiard between two mirrors α apart, so it bounces exactly ⌊π/α⌋ times: the two-block π counter, recovered from three free bodies.',
    contrast: 'The wall-plus-three-blocks setup (the "Three Blocks" sim) scatters on a sphere — three mirror planes, no single angle, no π. Remove the wall and momentum conservation flattens the problem back onto a circle: Galperin\'s three-body theorem says heavy·light·heavy DOES compute π.',
    formula: 'π = N × arccos(M/(M+1))  [EXACT],  M = 2·100ⁿ',
    getExpected: (params) => {
      const n = params.n || 2;
      const M = 2 * Math.pow(100, n);
      const alpha = Math.acos(M / (M + 1));
      const N = Math.floor(Math.PI / alpha);
      return `For n=${n}: M = 2·100^${n}; α = arccos(M/(M+1)) = ${alpha.toExponential(5)} rad ≈ 10^-${n}. Expect ${N} collisions; N·α = ${(N * alpha).toFixed(6)}.`;
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
    const M = 2 * Math.pow(100, this.n);
    this.masses = [M, 1, M];
    this.sqrtm = this.masses.map(Math.sqrt);
    this.positions = [0.2, 0.5, 0.8];   // left edges
    this.velocities = [0, 0, -this.initialVelocity];
    this.sizes = [0.07, 0.045, 0.07];
    this.alpha = Math.acos(M / (M + 1));
    this.finished = false;
    this.collisionEffects = [];

    // Reduced-plane basis: u = unit momentum direction in q-space; both
    // collision normals are ⊥ u, so the motion stays on the circle
    // (sphere ∩ plane ⊥ u). a spans the 1-2 collision normal, b completes.
    const s = this.sqrtm;
    const su = Math.hypot(s[0], s[1], s[2]);
    this.u = [s[0] / su, s[1] / su, s[2] / su];
    const n12 = [1 / s[0], -1 / s[1], 0];
    const ln = Math.hypot(n12[0], n12[1], n12[2]);
    this.a = [n12[0] / ln, n12[1] / ln, 0];
    this.b = cross3(this.u, this.a);
    this.R = s[2] * this.initialVelocity;   // |q| at t=0 (only block 3 moves)
    this.W0 = Math.hypot(...this._reduced()); // circle radius in the plane
  }

  getControls() {
    return [
      { type: 'slider', id: 'n', label: 'Digits (M = 2·100ⁿ)', min: 1, max: 3, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Initial Velocity', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'wedge-plane', label: 'reduced plane — the circle hidden in 3 bodies', dimension: 2, primary: true,
        axisLabels: { x: 'reduced axis a (⊥ momentum)', y: 'reduced axis b' } },
      { id: 'q3d', label: 'q₁ × q₂ × q₃ (rescaled velocities)', dimension: 3,
        axisLabels: { x: 'q₁', y: 'q₂', z: 'q₃' } },
      { id: 'q1-q2', label: 'q₁ vs q₂', dimension: 2,
        axisLabels: { x: 'q₁ = √M·v₁ (left heavy)', y: 'q₂ = v₂ (light)' } },
    ];
  }

  /** Event-driven: handle every pair collision within dt at its exact time. */
  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const MAX = 20000;   // > total collisions even at n=3, so nothing is lost
    let guard = 0;

    while (remaining > 1e-15 && guard < MAX) {
      let tMin = remaining;
      let pair = -1;   // -1 = free flight, 0 = blocks 1-2, 1 = blocks 2-3
      for (let i = 0; i < 2; i++) {
        const gap = this.positions[i + 1] - this.positions[i] - this.sizes[i];
        const closing = this.velocities[i] - this.velocities[i + 1];
        if (closing > 0 && gap > 0) {
          const t = gap / closing;
          if (t < tMin) { tMin = t; pair = i; }
        }
      }

      for (let i = 0; i < 3; i++) this.positions[i] += this.velocities[i] * tMin;
      remaining -= tMin;
      if (pair < 0) break;

      const m1 = this.masses[pair], m2 = this.masses[pair + 1];
      const v1 = this.velocities[pair], v2 = this.velocities[pair + 1];
      this.velocities[pair] = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
      this.velocities[pair + 1] = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
      this.positions[pair] = this.positions[pair + 1] - this.sizes[pair];
      this.collisionCount++;
      this.collisionEffects.push({
        x: this.positions[pair + 1],
        y: Math.max(this.sizes[pair], this.sizes[pair + 1]) / 2,
        time: performance.now(), type: pair === 0 ? 'left' : 'right',
      });
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      collided = true;
      guard++;
    }

    const v = this.velocities;
    if (v[0] <= v[1] && v[1] <= v[2]) this.finished = true;   // diverging — done
    return collided;
  }

  getPiApproximation() {
    return this.collisionCount * this.alpha;   // EXACT: N·α → π
  }

  getFormulaHTML() {
    const N = this.collisionCount;
    const scale = Math.pow(10, this.n);
    return `
      <strong>no wall</strong>:
      <span class="f-mass">m₁ = m₃ = 2·100^${this.n}</span>,
      <span class="f-mass">m₂ = 1</span><br>
      <span class="f-angle">α = arccos(M/(M+1)) = ${this.alpha.toExponential(4)}</span><br>
      <span class="f-result">π</span> =
      <span class="f-count">${N}</span> × α =
      <span class="f-result">${(N * this.alpha).toFixed(6)}</span>
      <span class="f-muted">(exact)</span>;
      digit read <span class="f-count">${N}</span>/10^${this.n} =
      ${piDigitsHTML(N / scale, this.n + 2)}
      <span class="f-muted">(α only ≈ 10⁻ⁿ)</span>
    `;
  }

  _qVec() { return this.velocities.map((v, i) => this.sqrtm[i] * v); }

  _reduced() {
    const q = this._qVec();
    const qu = dot3(q, this.u);
    const qp = [q[0] - qu * this.u[0], q[1] - qu * this.u[1], q[2] - qu * this.u[2]];
    return [dot3(qp, this.a), dot3(qp, this.b)];
  }

  getPhasePoint() {
    const q = this._qVec();
    const [wx, wy] = this._reduced();
    return [wx / this.W0, wy / this.W0, q[0] / this.R, q[1] / this.R, q[2] / this.R];
  }

  getPhaseExtractor(viewId) {
    switch (viewId) {
      case 'wedge-plane': return (pt) => [pt[0], pt[1]];
      case 'q3d': return (pt) => [pt[2], pt[3], pt[4]];
      case 'q1-q2': return (pt) => [pt[2], pt[3]];
      default: return (pt) => pt;
    }
  }

  // Display rides along with the (leftward-drifting) center of mass.
  _comShift() {
    let c = 0, mt = 0;
    for (let i = 0; i < 3; i++) {
      c += this.masses[i] * (this.positions[i] + this.sizes[i] / 2);
      mt += this.masses[i];
    }
    return 0.5 - c / mt;
  }

  // Hub thumbnail focus: the three blocks, in display (COM-frame) coords.
  getPreviewBox() {
    const shift = this._comShift();
    return {
      x0: this.positions[0] + shift - 0.08,
      x1: this.positions[2] + this.sizes[2] + shift + 0.08,
      y0: -0.05, y1: 0.32,
    };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.1, 0.45, -0.25, 0.1, 10);
    this.simCamera.position.z = 1;

    // Floor — no wall in this one.
    const floorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(1.1, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(floorGeom, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Center-of-mass tick: stationary in this co-moving frame.
    const tickGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.5, -0.025, 0), new THREE.Vector3(0.5, 0.025, 0)
    ]);
    this.simScene.add(new THREE.Line(tickGeom,
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.6 })));

    // Blocks: heavy, light (smaller & brighter), heavy.
    this.blockMeshes = [];
    const colors = [0xe94560, 0xff7b94, 0xe94560];
    const opacities = [0.72, 1, 0.72];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.PlaneGeometry(this.sizes[i], this.sizes[i]);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i], transparent: true, opacity: opacities[i]
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = this.sizes[i] / 2;
      this.simScene.add(mesh);
      this.blockMeshes.push(mesh);
    }

    // Collision effect rings (pool of 6).
    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
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

  updateSimScene() {
    if (!this.blockMeshes) return;
    const shift = this._comShift();
    for (let i = 0; i < 3; i++) {
      this.blockMeshes[i].position.x = this.positions[i] + this.sizes[i] / 2 + shift;
    }

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
        ring.position.set(effect.x + shift, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'left' ? 0xf7c948 : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(ThreeBodyPi);
