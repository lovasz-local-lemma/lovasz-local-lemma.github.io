import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// SAME COUNT, EXTRA DIMENSIONS.
//
// One 1D Galperin engine, two skins. An elastic collision only exchanges
// momentum along the line of centers — here, the rail axis (x). Any degree of
// freedom orthogonal to that axis is inert: the collision never reads it, so it
// cannot change the count. This sim makes the invariance visible by hosting two
// setups that share the EXACT same collision engine:
//
//   'piston'      1D gas atom compressed by a heavy piston in a sealed tube.
//   'air-hockey'  the same atom, now a puck free to wander a 2D table — it
//                 carries a decorative cross-axis (y) velocity and bounces off
//                 the top/bottom rails. The heavy mass is a full-height bar, so
//                 the along-rail (x) dynamics — hence the COUNT — are identical.
//
// The cross-axis motion is DISPLAY ONLY: step()'s collision engine ignores y
// entirely, so the puck's wandering never touches collisionCount. Switch setups
// and the final count is the same 31 / 314 / 3141 for n = 1 / 2 / 3.
export class PistonGasGalperin extends Simulation {
  static id = 'piston-gas-galperin';
  static previewSteps = 19;   // piston default: closest approach — gas compressed
  static title = 'Piston & Puck: More Motion, Same Count';
  static description = 'A piston compresses, an atom rises and falls, a puck wanders across a table. The scene gains motion in another direction, but the along-rail collision count stays the same.';
  static piMechanism = 'exact: collision only exchanges momentum along the rail; transverse motion never enters the count';
  static rigor = 'Exact Analog';
  static sortOrder = 34;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static alternatives = [
    { id: 'two-blocks', label: 'The 1D original' },
    { id: 'rolling-sliding', label: 'Any rigid body, same count' },
  ];
  static explanation = {
    setup: 'A light mass and heavy piston share the same one-dimensional collision engine as Two Blocks. An alternate air-hockey drawing adds vertical travel, while the heavy bar still spans the full table.',
    insight: 'Horizontal contact normals exchange only horizontal momentum. The extra vertical coordinate is decoupled from that engine, so changing it cannot change the along-rail collision count. Side-wall bounces are not part of this tally.',
    contrast: 'The rolling body changed how motion enters the effective mass. Here we add motion that never feeds back into the count at all: extra coordinates can make a scene look more complex without changing its answer. The piston’s rise and fall is a stylized response to compression, not a resolved gas simulation. Compare Three Blocks, where a third velocity really does enter the collision constraints.',
    formula: 'N × arctan(√(m/M)) ≈ π; the added transverse coordinate is absent from this estimate.',
    getExpected: (params) => {
      const n = params.n || 2;
      const M = Math.pow(100, n);
      const alpha = Math.atan(1 / Math.sqrt(M));
      const expected = Math.floor(Math.PI / alpha);
      return `n=${n}: α = arctan(1/${Math.round(Math.sqrt(M))}) = ${alpha.toFixed(6)} rad. Expect ${expected} collisions — the SAME whether the setup is 1D piston or 2D air-hockey.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.initialVelocity = params.velocity || 1;
    this.setup = params.setup || 'piston';
    this.tubeTop = 0.22;
    this.tubeBottom = -0.22;
    this.tubeRight = 1.6;
    this.reset();
  }

  reset() {
    super.reset();
    // Shared 1D Galperin engine state (identical dynamics for both setups).
    this.m1 = 1;                        // light mass (atom / puck)
    this.m2 = Math.pow(100, this.n);   // heavy mass (piston / bar)
    this.v1 = 0;
    this.v2 = -this.initialVelocity;
    this.finished = false;
    this.collisionEffects = [];

    if (this.setup === 'air-hockey') {
      // 2D table skin. x-dynamics are the engine; y is decorative.
      this.x1 = 0.32;
      this.x2 = 0.70;   // bar left-face position
      this.atomR = 0.04;
      this.r2 = Math.min(0.10, 0.05 + 0.012 * this.n);
      this.barW = 2 * this.r2;         // heavy mass rendered as a full-height bar
      // Cross-axis (transverse) motion — DISPLAY ONLY. The puck drifts in y and
      // bounces off the top/bottom rails. step()'s collision engine never reads
      // y, so this cannot change the count.
      this.yLimit = 0.28;
      this.y1 = 0.10;
      this.vy1 = 0.55;
    } else {
      // 1D piston skin — the atom compresses the gas along x. Its VERTICAL motion
      // is REAL buoyancy: compressing the gas raises its density, which lifts the
      // atom (Archimedes). Genuine physics in the transverse dimension — yet the
      // collision engine never reads y, so the count is still untouched.
      this.x1 = 0.45;
      this.x2 = 0.85;   // piston left-face position
      this.atomR = 0.045;
      this.pistonW = Math.min(0.25, 0.09 + 0.028 * this.n);
      this.gasLen0 = this.x2;                            // initial gas-column length
      this.by = this.tubeBottom + this.atomR + 0.004;   // atom rests on the floor (thin gas)
      this.bvy = 0;
      this.rhoGas = 1;
      this.y1 = this.by;
      this.atomTrail = [];
    }
  }

  getControls() {
    return [
      { type: 'select', id: 'setup', label: 'Setup', highlight: true, default: this.setup,
        options: [
          { value: 'piston', label: 'Piston — 1D gas compression' },
          { value: 'air-hockey', label: 'Air hockey — 2D table (extra dimension)' },
        ],
        onChange: (val) => { this.setup = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 5, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Heavy-mass velocity', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{
      id: 'q1-q2',
      label: 'rescaled momenta (Q_light, Q_heavy)',
      dimension: 2,
      primary: true,
      axisLabels: { x: 'Q_light = √m₁ v₁', y: 'Q_heavy = √m₂ v₂' }
    }];
  }

  // Advance the decoupled cross-axis motion + rail bounces (air-hockey only).
  // The along-rail engine in step() never reads y1/vy1, so this is inert to the
  // count — it exists purely so the extra dimension is visible.
  _advanceY(dt) {
    this.y1 += this.vy1 * dt;
    if (this.y1 + this.atomR > this.yLimit) { this.y1 = this.yLimit - this.atomR; this.vy1 = -Math.abs(this.vy1); }
    else if (this.y1 - this.atomR < -this.yLimit) { this.y1 = -this.yLimit + this.atomR; this.vy1 = Math.abs(this.vy1); }
  }

  // Piston setup: a stylized buoyancy-like response drives VERTICAL motion. Compressing the
  // gas raises its density ρ ∝ 1/volume = gasLen0/x2; a denser gas lifts the atom
  // (net up-accel g·(ρ/ρ_float − 1), Archimedes), damped by the gas it moves
  // through (drag ∝ ρ). So the atom sinks in the thin gas and floats up as the
  // piston squeezes it — a live barometer of the compression. It never touches the
  // count: step()'s collision engine reads only x, so this transverse dimension,
  // though driven by a separate ODE, leaves the tally exactly where it was.
  _advanceBuoyancy(dt) {
    const G = 3.4, RHO_FLOAT = 1.35, DRAG = 2.6, RHO_MAX = 6;
    const rho = Math.min(RHO_MAX, this.gasLen0 / Math.max(0.05, this.x2));
    this.rhoGas = rho;
    const top = this.tubeTop - this.atomR, bot = this.tubeBottom + this.atomR;
    const sub = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const a = G * (rho / RHO_FLOAT - 1) - DRAG * rho * this.bvy;
      this.bvy += a * h;
      this.by += this.bvy * h;
      if (this.by > top) { this.by = top; if (this.bvy > 0) this.bvy = 0; }
      else if (this.by < bot) { this.by = bot; if (this.bvy < 0) this.bvy = 0; }
    }
    this.y1 = this.by;
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();

    // Transverse-axis bookkeeping — never affects the collision math. Air hockey:
    // decorative free wander. Piston: REAL buoyancy driven by the gas density.
    if (this.setup === 'air-hockey') this._advanceY(dt);
    else this._advanceBuoyancy(dt);

    while (remaining > 1e-15) {
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > this.atomR) {
        tWall = (this.x1 - this.atomR) / (-this.v1);
      }
      let tHeavy = Infinity;
      const gap = this.x2 - this.x1 - this.atomR;
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) tHeavy = gap / closing;

      const tNext = Math.min(tWall, tHeavy);
      if (tNext > remaining) {
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        break;
      }
      this.x1 += this.v1 * tNext;
      this.x2 += this.v2 * tNext;
      remaining -= tNext;

      if (tWall <= tHeavy) {
        this.x1 = this.atomR;
        this.v1 = Math.abs(this.v1);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: this.setup === 'air-hockey' ? this.y1 : this.by, time: now, type: 'wall' });
      } else {
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
        this.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        this.x1 = this.x2 - this.atomR;
        this.collisionCount++;
        this.collisionEffects.push({ x: this.x2, y: this.setup === 'air-hockey' ? this.y1 : this.by, time: now, type: 'heavy' });
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
    return this.setup === 'air-hockey' ? 'Slaps' : 'Atom bounces';
  }

  getPiReadout() {
    return (this.collisionCount / Math.pow(10, this.n)).toFixed(this.n + 2);
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const alpha = Math.atan(1 / scale);
    const setupLabel = this.setup === 'air-hockey'
      ? '2D air-hockey table (extra dimension)'
      : '1D gas + piston';
    return `
      <strong>${setupLabel}</strong>:
      <span class="f-mass">m_light = 1</span>,
      <span class="f-mass">m_heavy = 100^${this.n}</span><br>
      <span class="f-angle">α = arctan(1/10^${this.n})</span>;
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> · <span class="f-angle">${alpha.toFixed(6)}</span> =
      <span class="f-result">${(count * alpha).toFixed(6)}</span>;
      digit read <span class="f-count">${count}</span>/10^${this.n} =
      <span style="font-size:1.1em">${piDigitsHTML(count / scale, this.n + 2)}</span><br>
      <span class="f-muted">N unchanged: the transverse dimension is inert — switching setups gives the identical count.</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    return [q1 / R, q2 / R];
  }

  getPhaseExtractor() { return (pt) => pt; }

  // Hub thumbnail focus depends on the active setup.
  getPreviewBox() {
    if (this.setup === 'air-hockey') {
      const x1 = Math.max(0.6, this.x2 + this.barW + 0.12);
      return { x0: -0.06, x1, y0: -0.33, y1: 0.33 };
    }
    const x1 = Math.max(0.7, this.x2 + this.pistonW + 0.12);
    return { x0: -0.12, x1, y0: -0.3, y1: 0.3 };
  }

  initSimScene() {
    this.simScene.clear();
    if (this.setup === 'air-hockey') { this._initAirHockeyScene(); return; }
    this._initPistonScene();
  }

  // --- Piston (1D gas compression) rendering ---
  _initPistonScene() {
    this.simCamera = new THREE.OrthographicCamera(-0.1, this.tubeRight + 0.1, 0.36, -0.36, 0.1, 10);
    this.simCamera.position.z = 1;

    // Thick tube walls
    const wallTop = new THREE.Mesh(
      new THREE.PlaneGeometry(this.tubeRight + 0.05, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xc9d6e8, transparent: true, opacity: 0.95 })
    );
    wallTop.position.set((this.tubeRight - 0.05) / 2, this.tubeTop + 0.02, -0.01);
    this.simScene.add(wallTop);

    const wallBot = new THREE.Mesh(
      new THREE.PlaneGeometry(this.tubeRight + 0.05, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xc9d6e8, transparent: true, opacity: 0.95 })
    );
    wallBot.position.set((this.tubeRight - 0.05) / 2, this.tubeBottom - 0.02, -0.01);
    this.simScene.add(wallBot);

    // Sealed wall on the left (hatched)
    const sealed = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, this.tubeTop - this.tubeBottom + 0.04),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sealed.position.set(-0.02, (this.tubeTop + this.tubeBottom) / 2, 0);
    this.simScene.add(sealed);

    // Hatching diagonals on the sealed wall
    const hatchPts = [];
    for (let h = -0.2; h <= 0.2; h += 0.04) {
      hatchPts.push(new THREE.Vector3(-0.07, h, 0.001));
      hatchPts.push(new THREE.Vector3(-0.005, h + 0.06, 0.001));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(hatchPts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    ));

    // Gas region (shaded interior between sealed wall and piston). Opacity
    // grows with compression so you SEE the gas being compressed.
    this.gasRegion = new THREE.Mesh(
      new THREE.PlaneGeometry(1, this.tubeTop - this.tubeBottom),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.12 })
    );
    this.gasRegion.position.z = -0.005;
    this.simScene.add(this.gasRegion);

    // Atom motion trail — a fading line behind the atom
    this.trailMaxLen = 90;
    this.atomTrailGeom = new THREE.BufferGeometry();
    this.atomTrailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailMaxLen * 3), 3));
    this.atomTrailGeom.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.trailMaxLen * 4), 4));
    this.atomTrailGeom.setDrawRange(0, 0);
    this.atomTrailLine = new THREE.Line(
      this.atomTrailGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true })
    );
    this.simScene.add(this.atomTrailLine);

    // Atom (yellow filled circle with bright outline)
    this.atomMesh = new THREE.Mesh(
      new THREE.CircleGeometry(this.atomR, 28),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.atomMesh);
    this.atomOutline = new THREE.Mesh(
      new THREE.RingGeometry(this.atomR * 0.96, this.atomR * 1.06, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    this.simScene.add(this.atomOutline);

    // Piston (head + rod + handle)
    this.pistonGroup = new THREE.Group();
    const pistonHeight = (this.tubeTop - this.tubeBottom) * 0.92;
    const pistonHead = new THREE.Mesh(
      new THREE.PlaneGeometry(this.pistonW, pistonHeight),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.85 })
    );
    pistonHead.position.set(this.pistonW / 2, 0, 0);
    this.pistonGroup.add(pistonHead);

    // Seal stripes: fill the top & bottom gaps between the piston head and the
    // tube walls so the piston reads as airtight — gas can't slip past it.
    const tubeH = this.tubeTop - this.tubeBottom;
    const sealGap = (tubeH - pistonHeight) / 2;
    for (const sgn of [1, -1]) {
      const seal = new THREE.Mesh(
        new THREE.PlaneGeometry(this.pistonW, sealGap + 0.01),
        new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.85 })
      );
      seal.position.set(this.pistonW / 2, sgn * (pistonHeight / 2 + sealGap / 2), 0);
      this.pistonGroup.add(seal);
    }

    // Piston head front/back outline lines
    const pistonOutline = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -pistonHeight / 2, 0.002), new THREE.Vector3(0, pistonHeight / 2, 0.002),
        new THREE.Vector3(this.pistonW, -pistonHeight / 2, 0.002), new THREE.Vector3(this.pistonW, pistonHeight / 2, 0.002),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
    );
    this.pistonGroup.add(pistonOutline);

    // Rod and handle
    const rod = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x6c7a89 })
    );
    rod.position.set(this.pistonW + 0.25, 0, -0.001);
    this.pistonGroup.add(rod);

    const handle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xc9d6e8 })
    );
    handle.position.set(this.pistonW + 0.5, 0, -0.0005);
    this.pistonGroup.add(handle);

    this.simScene.add(this.pistonGroup);

    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.014, 0.020, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  // --- Air-hockey (2D table) rendering: heavy mass is a full-height bar, the
  // puck also carries a decorative cross-axis velocity and bounces off the
  // top/bottom rails. The along-rail dynamics are the same engine. ---
  _initAirHockeyScene() {
    this.simCamera = new THREE.OrthographicCamera(-0.05, 1.3, 0.34, -0.34, 0.1, 10);
    this.simCamera.position.z = 1;

    // Table (top-down): cushion on left, sides + far end as faint outline
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

    // Puck (top-down circle)
    this.puck1 = new THREE.Mesh(
      new THREE.CircleGeometry(this.atomR, 32),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.puck1);
    this.puck1Outline = new THREE.Mesh(
      new THREE.RingGeometry(this.atomR * 0.96, this.atomR * 1.08, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    this.simScene.add(this.puck1Outline);

    // Heavy mass: a full-height bar (paddle) spanning the table. The puck meets
    // it in X at any Y, so the along-rail collision is physical — not a
    // projection trick. Y stays fully decoupled and never affects the count.
    this.bar = new THREE.Mesh(
      new THREE.PlaneGeometry(this.barW, 0.56),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.78 })
    );
    this.simScene.add(this.bar);

    // X-projection shadow of the puck on the centerline — the along-rail
    // coordinate is all that matters for the count (the Two Blocks view).
    this.shadow1 = new THREE.Mesh(
      new THREE.CircleGeometry(this.atomR, 24),
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
    if (this.setup === 'air-hockey') { this._updateAirHockeyScene(); return; }
    this._updatePistonScene();
  }

  _updatePistonScene() {
    if (!this.atomMesh) return;

    // Vertical position is real buoyancy (see _advanceBuoyancy): the atom floats
    // up as the gas is compressed denser, sinks as it expands.
    const ay = this.by;
    this.atomMesh.position.set(this.x1, ay, 0.012);
    this.atomOutline.position.set(this.x1, ay, 0.013);
    this.pistonGroup.position.set(this.x2, 0, 0);

    // Trail
    this.atomTrail.push([this.x1, ay]);
    if (this.atomTrail.length > this.trailMaxLen) this.atomTrail.shift();
    const tArr = this.atomTrailGeom.attributes.position.array;
    const cArr = this.atomTrailGeom.attributes.color.array;
    const N = this.atomTrail.length;
    for (let i = 0; i < N; i++) {
      tArr[i * 3] = this.atomTrail[i][0];
      tArr[i * 3 + 1] = this.atomTrail[i][1];
      tArr[i * 3 + 2] = 0.005;
      const a = i / Math.max(1, N - 1);
      cArr[i * 4] = 0.969;
      cArr[i * 4 + 1] = 0.788;
      cArr[i * 4 + 2] = 0.282;
      cArr[i * 4 + 3] = a * 0.65;
    }
    this.atomTrailGeom.attributes.position.needsUpdate = true;
    this.atomTrailGeom.attributes.color.needsUpdate = true;
    this.atomTrailGeom.setDrawRange(0, N);

    // Gas region: width and color/opacity respond to compression. Initial
    // gas length is x2_initial = 0.85, so compression ratio = current/initial.
    const gasWidth = Math.max(0.01, this.x2);
    this.gasRegion.scale.set(gasWidth, 1, 1);
    this.gasRegion.position.x = gasWidth / 2;
    const compressionRatio = Math.max(0.05, gasWidth / 0.85);
    this.gasRegion.material.opacity = Math.min(0.48, 0.12 + 0.55 * (1 - compressionRatio));

    this._updateEffectRings(0xffffff, 0xf7c948);
  }

  _updateAirHockeyScene() {
    if (!this.puck1) return;
    this.puck1.position.set(this.x1, this.y1, 0.012);
    this.puck1Outline.position.set(this.x1, this.y1, 0.013);
    if (this.bar) this.bar.position.set(this.x2 + this.barW / 2, 0, 0.008);
    if (this.shadow1) this.shadow1.position.set(this.x1, 0, 0.004);

    this._updateEffectRings(0xffffff, 0x4cc9f0);
  }

  _updateEffectRings(wallColor, heavyColor) {
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
        ring.material.color.setHex(effect.type === 'wall' ? wallColor : heavyColor);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(PistonGasGalperin);
