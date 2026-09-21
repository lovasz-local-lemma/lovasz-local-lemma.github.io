// js/sims/NBlocks.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

// Chamber overlay palette. Amber matches .f-mass because these lines are read
// straight off the masses; green matches .f-result for the wedge angle. Both
// stay clear of the cyan the trail and live dot already own.
const MIRROR_COLOR = 0xffd784;
const ARC_COLOR = 0x8fe3ad;
const ARC_SEG = 48;
const ARC_R = 0.22;

export class NBlocks extends Simulation {
  static id = 'n-blocks';
  static title = 'N Blocks';
  static description = 'Generalized extension — a hyperspherical billiard beyond direct π counting';
  static piMechanism = 'extension: N masses → higher-dimensional reflection chamber';
  static rigor = 'Extension';
  static sortOrder = 85;
  static previewSteps = 10;   // hub thumbnail: early, blocks still spread
  static piNature = 'extension';
  static piLabel = 'Status';
  // retired: k dimensions change no mechanism and there is no direct π readout;
  // it is also a near-duplicate of 'three-blocks' (same scheduler, same masses
  // at N = 3, same phase point). Still loadable by id from the hidden shelf,
  // and kept because the mirror-chamber panel below is worth reading.
  static hubHidden = true;
  static alternatives = [
    { id: 'coxeter-chambers', label: 'The chamber geometry, named' },
    { id: 'tetrahedral-room', label: 'Tetrahedral mirror room' },
  ];
  static explanation = {
    setup: 'N blocks in a line with geometrically increasing masses: mᵢ = 100^(n·i). Only the rightmost block starts moving. All collisions are elastic.',
    insight: 'Rescale to qᵢ = √mᵢ·vᵢ and every collision becomes an exact mirror reflection: the wall reflects q in the hyperplane q₁ = 0, and blocks i, i+1 colliding reflects it in the hyperplane with normal (1/√mᵢ, −1/√mᵢ₊₁). Energy makes |q| = 1, so the state hops around the unit sphere, bouncing between mirrors whose normals are closed-form in the masses. The slice panel draws those mirror lines.',
    contrast: 'At N = 2 there are exactly two mirrors and the angle between them is α = arctan(√(m₁/m₂)); the reflection count is ⌊π/α⌋, and that single angle is the whole Galperin trick. Adding blocks adds mirrors but no new mechanism — with more than two walls no single angle counts π, which is why this sim reports a chamber-hit count rather than a π estimate.',
    formula: 'Exploratory only: no single exact π readout is used for N > 2. The mirror normals and the wedge angle are exact, but the digit count is not.',
    getExpected: (params) => {
      const n = params.n || 1;
      const N = params.N || 3;
      const alpha = Math.atan(Math.pow(10, -n));   // = arctan(√(mᵢ/mᵢ₊₁)), no π used
      return `${N} blocks with exponent n=${n}: adjacent mirrors meet at α = ${alpha.toFixed(6)} rad. `
        + (N === 2
          ? 'With two blocks that angle alone counts π: expect ⌊π/α⌋ collisions.'
          : `With ${N} blocks there are ${N} mirrors, so expect richer chamber geometry and no direct π digit count.`);
    }
  };

  constructor(params = {}) {
    super(params);
    this.N = params.N || 3;
    this.n = params.n || 1;
    // Slice axes (0-based indices into the rescaled-momentum vector). The
    // extractors read these live, so changing them re-slices the stored trail
    // immediately. Defaults 0,1,2 reproduce the classic q1-vs-q2 picture.
    const axis = (v, fallback) => {
      const i = Number(v);
      return Number.isInteger(i) && i >= 0 ? Math.min(i, this.N - 1) : fallback;
    };
    this.sliceX = axis(params.sliceX, 0);
    this.sliceY = axis(params.sliceY, Math.min(1, this.N - 1));
    this.sliceZ = axis(params.sliceZ, Math.min(2, this.N - 1));
    // Phase panels are built once at page load (main.js never rebuilds them),
    // so the 3D slice panel and the fixed pair panels key off the initial N.
    this._has3D = this.N >= 3;
    this.reset();
  }

  reset() {
    super.reset();
    const N = this.N;
    // Keep slice axes valid when the block count shrinks.
    this.sliceX = Math.min(this.sliceX ?? 0, N - 1);
    this.sliceY = Math.min(this.sliceY ?? 0, N - 1);
    this.sliceZ = Math.min(this.sliceZ ?? 0, N - 1);
    // Masses: geometric progression m_i = 100^(n*i)
    this.masses = Array.from({ length: N }, (_, i) => Math.pow(100, this.n * i));
    // Positions: evenly spaced
    this.positions = Array.from({ length: N }, (_, i) => 0.1 + i * 0.2);
    // Velocities: only last block moves
    this.velocities = Array.from({ length: N }, () => 0);
    this.velocities[N - 1] = -1;
    // Sizes: slightly increasing
    this.sizes = Array.from({ length: N }, (_, i) => 0.03 + 0.01 * i);
    this.finished = false;
    this.collisionEffects = [];
  }

  getControls() {
    const axisOptions = Array.from({ length: this.N }, (_, i) => ({ value: i, label: `q${i + 1}` }));
    // ControlPanel selects hand back string values and re-apply `default` on
    // every rebuild, so coerce with Number() and echo the live state here.
    const axisSelect = (id, label, get, set) => ({
      type: 'select', id, label, options: axisOptions, default: get(), highlight: true,
      onChange: (val) => { set(Math.min(Math.max(Number(val) || 0, 0), this.N - 1)); }
    });
    const controls = [
      {
        type: 'slider', id: 'N', label: 'Number of blocks',
        min: 2, max: 6, step: 1, default: this.N,
        onChange: (val) => {
          this.N = val;
          this.reset();
          this.initSimScene();
          // Rebuild the selects so their q1..qk option lists match the new N.
          this.notifyControlsChanged();
        }
      },
      {
        type: 'slider', id: 'n', label: 'Mass exponent',
        min: 1, max: 3, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      axisSelect('sliceX', 'Slice axis X', () => this.sliceX, (v) => { this.sliceX = v; }),
      axisSelect('sliceY', 'Slice axis Y', () => this.sliceY, (v) => { this.sliceY = v; }),
    ];
    if (this._has3D) {
      controls.push(axisSelect('sliceZ', 'Slice axis Z (3D)', () => this.sliceZ, (v) => { this.sliceZ = v; }));
    }
    // Echo live speed: rebuilds via notifyControlsChanged re-apply `default`.
    controls.push({ type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: this.speed ?? 1 });
    return controls;
  }

  getPhaseSpaceViews() {
    // Called once at page load — the panel set is fixed, but `label` and
    // `axisLabels` getters are re-read every frame by the axis overlay, so the
    // main view's title/labels track the slice selectors live.
    const self = this;
    const N = this.N;
    // The unit circle/sphere that PhaseSpaceView draws is the |q| = 1 energy
    // shell of the FULL state. A 2-of-N slice of a unit vector obeys
    // q_a² + q_b² ≤ 1 with equality only when every other coordinate vanishes,
    // so for N > 2 the plotted point sits strictly inside and the ring is a
    // projection bound, not a curve the trail should reach. Say so in the
    // title rather than deleting the ring: at N = 2 the slice IS the whole
    // state and the trail really does ride the circle. The primary panel also
    // has to keep its boundary because main.js only forwards overlay trails to
    // 2D views with boundary !== 'none' — that gate is what draws the mirrors.
    const shellNote = () => (self.N === 2
      ? 'circle = energy shell |q| = 1'
      : `circle = projection bound (|q| = 1 in ${self.N}D, so the slice stays inside)`);
    const views = [
      {
        id: 'slice-2d',
        dimension: 2,
        primary: true,
        get label() {
          return `Slice: q${self.sliceX + 1} vs q${self.sliceY + 1} — mirrors in amber; ${shellNote()}`;
        },
        get axisLabels() { return { x: `q${self.sliceX + 1}`, y: `q${self.sliceY + 1}` }; },
      },
    ];

    if (this._has3D) {
      views.push({
        id: 'slice-3d',
        dimension: 3,
        get label() {
          return self.N === 3
            ? 'Slice 3D — sphere = energy shell |q| = 1'
            : `Slice 3D — sphere is a projection bound (|q| = 1 in ${self.N}D)`;
        },
        get axisLabels() {
          return { x: `q${self.sliceX + 1}`, y: `q${self.sliceY + 1}`, z: `q${self.sliceZ + 1}` };
        },
      });
    }

    // Fixed reference panels over consecutive dims for the load-time N. These
    // can't follow the block-count slider (main.js never rebuilds panels), so
    // they stay as built; their extractors clamp if N later shrinks.
    // boundary:'none' here does double duty — it drops the same misleading ring,
    // and it keeps main.js from stamping the primary panel's mirror overlay onto
    // axes it was not computed for (getOverlayTrails() is per-sim, not per-view).
    let pairs = 0;
    for (let i = 0; i + 1 < N && pairs < 3; i += 2, pairs++) {
      views.push({
        id: `pair-${i}-${i + 1}`,
        label: `q${i + 1} vs q${i + 2} (projection — no shell, no mirrors)`,
        dimension: 2,
        boundary: 'none',
        axisLabels: { x: `q${i + 1}`, y: `q${i + 2}` },
      });
    }
    return views;
  }

  step(dt) {
    if (this.finished) return false;
    const N = this.N;
    let remaining = dt;
    let collided = false;
    const MAX = 1000;
    let count = 0;

    while (remaining > 1e-15 && count < MAX) {
      let tMin = remaining;
      let collisionType = -1; // -1=none, 0=wall, 1+=block pair index

      // Wall collision
      if (this.velocities[0] < 0 && this.positions[0] > 0) {
        const t = this.positions[0] / (-this.velocities[0]);
        if (t < tMin) { tMin = t; collisionType = 0; }
      }

      // Adjacent collisions
      for (let i = 0; i < N - 1; i++) {
        const gap = this.positions[i + 1] - this.positions[i] - this.sizes[i];
        const closing = this.velocities[i] - this.velocities[i + 1];
        if (closing > 0 && gap > 0) {
          const t = gap / closing;
          if (t < tMin) { tMin = t; collisionType = i + 1; }
        }
      }

      // Advance all blocks
      for (let i = 0; i < N; i++) this.positions[i] += this.velocities[i] * tMin;
      remaining -= tMin;

      const now = performance.now();
      if (collisionType === 0) {
        this.positions[0] = 0;
        this.velocities[0] = Math.abs(this.velocities[0]);
        this.collisionCount++;
        collided = true;
        this.collisionEffects.push({ x: 0, y: this.sizes[0] / 2, time: now, type: 'wall' });
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        // main.js enables the Raw/Transform buttons whenever getRawPhasePoint
        // exists, so the raw trail has to be fed too or those panels come up empty.
        this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
      } else if (collisionType > 0) {
        const i = collisionType - 1;
        const m1 = this.masses[i], m2 = this.masses[i + 1];
        const v1 = this.velocities[i], v2 = this.velocities[i + 1];
        this.velocities[i] = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
        this.velocities[i + 1] = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
        this.positions[i] = this.positions[i + 1] - this.sizes[i];
        this.collisionCount++;
        collided = true;
        this.collisionEffects.push({ x: this.positions[i + 1], y: Math.max(this.sizes[i], this.sizes[i + 1]) / 2, time: now, type: 'block' });
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
      } else {
        break;
      }
      count++;
    }

    // Done check: all moving right in order (all must be non-negative)
    let done = this.velocities.every(v => v >= 0) && this.velocities[N - 1] > 0;
    for (let i = 0; i < N - 1 && done; i++) {
      done = this.velocities[i + 1] >= this.velocities[i];
    }
    if (done) this.finished = true;

    return collided;
  }

  getPiApproximation() {
    // α = arctan(1/√(100^n)), exact for 2 blocks, approximate for N>2
    const M = Math.pow(100, this.n);
    const alpha = Math.atan(1 / Math.sqrt(M));
    return this.collisionCount * alpha;
  }

  getPiReadout() {
    return 'no direct π';
  }

  getPhasePoint() {
    const R = Math.sqrt(this.masses[this.N - 1]) * 1;
    return this.velocities.map((v, i) => Math.sqrt(this.masses[i]) * v / R);
  }

  getRawPhasePoint() {
    const R = this.masses[this.N - 1] * 1;
    return this.velocities.map((v, i) => this.masses[i] * v / R);
  }

  getPhaseExtractor(viewId) {
    // Clamp per point: the trail is cleared on N changes, but stale slice
    // indices or fixed pair panels may still exceed the current dim count.
    const pick = (pt, i) => pt[Math.min(i, pt.length - 1)];
    if (viewId === 'slice-2d') {
      return (pt) => [pick(pt, this.sliceX), pick(pt, this.sliceY)];
    }
    if (viewId === 'slice-3d') {
      return (pt) => [pick(pt, this.sliceX), pick(pt, this.sliceY), pick(pt, this.sliceZ)];
    }
    const match = viewId.match(/^pair-(\d+)-(\d+)$/);
    if (match) {
      const i = parseInt(match[1]), j = parseInt(match[2]);
      return (pt) => [pick(pt, i), pick(pt, j)];
    }
    return (pt) => pt.slice(0, 2);
  }

  // ---- Reflection chamber ------------------------------------------------
  // Every collision here is exactly a mirror reflection of the rescaled
  // momentum q (verified numerically to ~2e-13 relative):
  //   wall bounce, block 1        → normal e₁                    (hyperplane q₁ = 0)
  //   blocks i, i+1 collide       → normal (1/√mᵢ)eᵢ − (1/√mᵢ₊₁)eᵢ₊₁
  // and |q| is conserved, so the state lives on the unit sphere and the walls
  // are hyperplanes through the origin. Both normals are closed-form in the
  // masses; nothing here needs π.
  //
  // A hyperplane shows up in a 2D slice as a LINE only when its normal is
  // supported inside the two plotted axes. Otherwise its projection fills the
  // whole disc, and drawing any curve for it would be fiction — so we draw
  // nothing and say so in the readout. That absence is the honest lesson about
  // what a slice costs you.
  _mirrors() {
    const a = this.sliceX, b = this.sliceY;
    const key = `${a}|${b}|${this.N}|${this.n}`;
    if (this._mirrorKey === key) return this._mirrorCache;
    const out = { wall: null, pair: null, alpha: 0 };
    if (a !== b && a < this.N && b < this.N) {
      // Wall mirror q₁ = 0 is spanned by whichever plotted axis is not q₁.
      if (a === 0) out.wall = [0, 1];
      else if (b === 0) out.wall = [1, 0];
      // Pair mirror: v_a = v_b  ⇔  q_b = q_a·√(m_b/m_a). Adjacent blocks only.
      if (Math.abs(a - b) === 1) {
        // √(m_b/m_a) = 10^(n·(b−a)) — built from the exponent so the raw masses
        // (up to 100^15) never enter the arithmetic.
        const ratio = Math.pow(10, this.n * (b - a));
        const len = Math.hypot(1, ratio);
        out.pair = [1 / len, ratio / len];
      }
      if (out.wall && out.pair) {
        // Signed small angle between the two mirror LINES. Flip the pair
        // representative to the wall's side first, so atan2 lands in
        // (−π/2, π/2) without needing a π literal to unwrap it.
        const s = (out.wall[0] * out.pair[0] + out.wall[1] * out.pair[1]) < 0 ? -1 : 1;
        const px = out.pair[0] * s, py = out.pair[1] * s;
        out.alpha = Math.atan2(out.wall[0] * py - out.wall[1] * px,
                               out.wall[0] * px + out.wall[1] * py);
      }
    }
    this._mirrorKey = key;
    this._mirrorCache = out;
    return out;
  }

  // Persistent overlay buffers — getOverlayTrails() runs every frame, so the
  // point arrays are written in place and never reallocated.
  _ensureOverlayPool() {
    if (this._ovPool) return;
    const mk = (nPts, color, opacity) => ({
      trail: Array.from({ length: nPts }, () => [0, 0]), color, opacity,
    });
    this._ovPool = {
      wall: mk(2, MIRROR_COLOR, 0.85),
      pair: mk(2, MIRROR_COLOR, 0.85),
      arc: mk(ARC_SEG + 1, ARC_COLOR, 0.9),
    };
    this._ovList = [];
  }

  getOverlayRenderMode() { return 'line'; }

  getOverlayTrails() {
    this._ensureOverlayPool();
    const m = this._mirrors();
    const list = this._ovList;
    list.length = 0;
    // Each mirror is drawn as the full chord of the unit disc along its line.
    if (m.wall) {
      const e = this._ovPool.wall;
      e.trail[0][0] = -m.wall[0]; e.trail[0][1] = -m.wall[1];
      e.trail[1][0] = m.wall[0];  e.trail[1][1] = m.wall[1];
      list.push(e);
    }
    if (m.pair) {
      const e = this._ovPool.pair;
      e.trail[0][0] = -m.pair[0]; e.trail[0][1] = -m.pair[1];
      e.trail[1][0] = m.pair[0];  e.trail[1][1] = m.pair[1];
      list.push(e);
    }
    // Wedge marker: a short arc sweeping the angle between the two mirrors.
    // At n = 3 it collapses to a dot because the wedge really is ~0.001 rad —
    // that thinness is exactly why the collision count runs so high.
    if (m.wall && m.pair) {
      const arc = this._ovPool.arc;
      const t0 = Math.atan2(m.wall[1], m.wall[0]);
      for (let i = 0; i <= ARC_SEG; i++) {
        const t = t0 + m.alpha * (i / ARC_SEG);
        arc.trail[i][0] = ARC_R * Math.cos(t);
        arc.trail[i][1] = ARC_R * Math.sin(t);
      }
      list.push(arc);
    }
    return list;
  }

  getFormulaHTML() {
    const m = this._mirrors();
    const xi = this.sliceX + 1, yi = this.sliceY + 1;
    let body;
    if (this.sliceX === this.sliceY) {
      body = `<span class="f-warning">Degenerate slice</span> — q${xi} is plotted against itself.`;
    } else if (!m.wall && !m.pair) {
      body = `<span class="f-muted">No mirror is axis-aligned with q${xi}, q${yi}, so every chamber wall
        projects onto the whole disc and none can be drawn honestly. The geometry is real but this
        slice hides it — put q1 on an axis, or choose two adjacent qᵢ.</span>`;
    } else {
      const seen = [];
      if (m.wall) seen.push('<span class="f-angle">wall</span> (q1 = 0)');
      if (m.pair) seen.push(`<span class="f-angle">pair ${Math.min(xi, yi)}–${Math.max(xi, yi)}</span> (v equal)`);
      body = `Mirror${seen.length > 1 ? 's' : ''} in view: ${seen.join(' and ')}.`;
      if (m.wall && m.pair) {
        body += `<br>Wedge <span class="f-result">α = ${Math.abs(m.alpha).toFixed(6)}</span> rad
          = arctan(<span class="f-mass">√(m${Math.min(xi, yi)}/m${Math.max(xi, yi)})</span>)`;
        body += this.N === 2
          ? `<br><span class="f-muted">Two blocks, two mirrors: the count is ⌊π/α⌋ and that single angle is the whole trick.</span>`
          : `<br><span class="f-muted">${this.N} blocks ⇒ ${this.N} mirrors. More walls, same mechanism —
             no single angle counts π, so the readout stays a chamber-hit count.</span>`;
      } else {
        body += `<br><span class="f-muted">The other wall's normal reaches outside this slice, so it cannot be drawn here.</span>`;
      }
    }
    // One block-level wrapper: .formula-readout is a flex row, so every
    // top-level node would otherwise become its own column.
    return `<div style="display:block">
      <span class="f-mass">mᵢ = 100<sup>${this.n}·i</sup></span> &nbsp;
      <span class="f-count">${this.collisionCount.toLocaleString()}</span> chamber hits
      <br>${body}
    </div>`;
  }

  // Hub thumbnail focus: wall + all blocks (they're small, so frame tight).
  getPreviewBox() {
    const last = this.positions[this.N - 1] + this.sizes[this.N - 1];
    return { x0: -0.05, x1: Math.max(0.45, last + 0.08), y0: -0.04, y1: 0.16 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.4, 0.4, -0.2, 0.1, 10);
    this.simCamera.position.z = 1;

    // Wall
    const wallGeom = new THREE.PlaneGeometry(0.02, 0.5);
    this.simScene.add(new THREE.Mesh(wallGeom, new THREE.MeshBasicMaterial({ color: 0xffffff })));

    // Floor at y=0 so the blocks rest on it (their bottoms sit at y=0).
    const floorPts = [new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.4, 0, 0)];
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(floorPts),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })
    ));

    // Blocks
    this.blockMeshes = [];
    for (let i = 0; i < this.N; i++) {
      const opacity = 1 - (i / this.N) * 0.5;
      const geom = new THREE.PlaneGeometry(this.sizes[i], this.sizes[i]);
      const mat = new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = this.sizes[i] / 2;
      this.simScene.add(mesh);
      this.blockMeshes.push(mesh);
    }

    // Collision pulse rings (pool) — also what drives the collision sound.
    this.effectMeshes = [];
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.01, 0.015, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  updateSimScene() {
    if (!this.blockMeshes) return;
    for (let i = 0; i < this.N; i++) {
      this.blockMeshes[i].position.x = this.positions[i] + this.sizes[i] / 2;
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
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(NBlocks);
