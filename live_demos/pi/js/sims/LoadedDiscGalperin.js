import * as THREE from 'three';
import { BiasedPiCounter } from '../core/BiasedPiCounter.js';
import { registerSim } from '../core/registry.js';

// A uniform disc rolls between a wall and a heavy block — the Galperin
// effective-mass counter (like Rolling & Sliding). But here the disc's mass is
// OFF-CENTRE by e, and load = e/r is the ONE knob.
//
// Rolling without slipping, the disc answers a horizontal impulse like a
// particle of mass m_eff = I_contact / r². With the CM off-centre by e = load·r,
// the CM sits a distance d(φ) from the contact patch:
//     d(φ)² = r²(1 + load² − 2·load·sinφ)
// so, with I_cm = ½mr² for a uniform disc,
//     m_eff(φ) = m(1.5 + load² − 2·load·sinφ)
// The inertia the block collides with wobbles as the disc rotates, so the
// Galperin reflection angle α = arctan√(m_eff/M) wobbles too and the collision
// count drifts off ⌊π·10ⁿ⌋ — a biased π out of a perfect circle.
//
// load = 0 is a reachable slider position (min 0, step 0.02): the CM returns to
// the centre, m_eff ≡ 1.5m is constant, and the counter is the exact circle
// Galperin counter again. The drift goes to zero with the knob, monotonically.
//
// CAVEAT (quasi-static): only the mass's POSITION feeds m_eff. Its own momentum
// and reaction as the disc turns are not simulated — which is also why the
// momentum plot's unit circle grows as the load grows: with m_eff changing under
// a rolling disc this model does not conserve the mean-mass energy. The unit
// circle is the centred ideal, and the load is what bursts it.
//
// MEASURED, velocity 1, block calibrated to ⟨m_eff⟩·100ⁿ:
//   load : 0.00  0.02  0.06  0.10  0.20  0.30  0.40  0.60  0.90
//   n=2  :  314   318   327   336   363   394   430   513   633   (ideal 314)
//   n=3  : 3141  3182  3269  3362  3626  3934  4286  5092  6257   (ideal 3141)
//   |Q|max: 1.00        —    1.07  1.16    —   1.37    —   2.02
// The relative drift is ≈ 0.64·load near the zero and |drift| is strictly
// increasing in the load at both n — halve the load, halve the bias.
const LOAD_LADDER = '314, 318, 336, 363, 430, 633 at load 0.00, 0.02, 0.10, 0.20, 0.40, 0.90';

// MEASURED relative drift (count − ideal)/ideal vs load, from the table above.
// It comes out essentially the same at n=2 and n=3 (e.g. load 0.40: 0.369 vs
// 0.365), so one curve serves every digit setting. DISPLAY ONLY — this feeds
// the "what to expect" blurb, never the estimator.
const DRIFT_TABLE = [
  [0, 0], [0.02, 0.013], [0.06, 0.041], [0.10, 0.070], [0.20, 0.156], [0.30, 0.255],
  [0.40, 0.369], [0.50, 0.497], [0.60, 0.634], [0.75, 0.838], [0.90, 1.016],
];
function expectedRelDrift(load) {
  for (let i = 1; i < DRIFT_TABLE.length; i++) {
    const [x0, y0] = DRIFT_TABLE[i - 1], [x1, y1] = DRIFT_TABLE[i];
    if (load <= x1) return y0 + ((load - x0) / (x1 - x0)) * (y1 - y0);
  }
  return DRIFT_TABLE[DRIFT_TABLE.length - 1][1];
}

export class LoadedDiscGalperin extends BiasedPiCounter {
  static id = 'loaded-disc-galperin';
  static title = 'Loaded Disc Galperin';
  static description = 'Off-centre mass makes even a circle a biased π counter — slide the load to 0 for the exact one';
  static piMechanism = 'biased: off-centre mass → effective inertia wobbles with rotation';
  static rigor = 'Biased';
  static piNature = 'biased';
  static sortOrder = 43;
  static alternatives = [
    { id: 'reuleaux-collision-lab', label: 'Shape-made bias' },
    { id: 'magnetic-repulsion-galperin', label: 'Field-made bias' },
  ];
  static explanation = {
    setup: 'A disc (mass 1, radius r) rolls between a wall and a heavy block whose mass is calibrated so the MEAN effective-mass ratio is exactly 100ⁿ. One slider — the LOAD — moves the disc\'s centre of mass off-centre by e = load·r. Load 0 puts it back at the centre.',
    insight: 'Rolling, the disc answers a horizontal impulse like a particle of effective mass m_eff = I_contact/r². Centred, that is a constant 1.5m and the collision count is Galperin\'s exact ⌊π·10ⁿ⌋. Move the mass off-centre and the CM\'s distance to the contact patch — and so m_eff, and so the reflection angle α = arctan√(m_eff/M) — wobbles as the disc turns, by ±2·load around the mean. The count drifts, and that drift IS the bias: at n = 2 it runs ' + LOAD_LADDER + '. Near the zero the relative drift is about 0.64·load, so halving the load halves the bias, and at load = 0 it is not small but exactly zero. CAVEAT: this is a quasi-static model — only the mass\'s POSITION feeds m_eff; its own momentum and reaction as the disc turns are not simulated, which is also why the momentum circle swells past 1 as the load grows.',
    contrast: 'Same bias story as Reuleaux Collision Lab (the SHAPE is the knob) and Magnetic Repulsion Galperin (the field\'s REACH is the knob), but here the shape is a perfect circle and the contact is a hard collision — only the mass distribution is off. At load = 0 this sim IS the exact circle Galperin counter, which is why the zero is on the slider rather than in a promise.',
    formula: 'π_measured = count / 10ⁿ (π-free); m_eff(φ) = m(1.5 + load² − 2·load·sinφ), ⟨m_eff⟩ = m(1.5 + load²)',
    getExpected: (params) => {
      const load = params.load ?? 0.1;
      return load < 1e-6
        ? 'load = 0: centred disc → m_eff ≡ 1.5 constant → the exact Galperin count, ⌊π·10ⁿ⌋.'
        : `load = ${load.toFixed(2)}: m_eff swings ±${(2 * load).toFixed(2)} around ⟨m_eff⟩ = ${(1.5 + load * load).toFixed(3)}, so α wobbles and the count overshoots ⌊π·10ⁿ⌋ by about ${(100 * expectedRelDrift(load)).toFixed(1)}% (measured). Drag the load to 0 to close it.`;
    },
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    // e / r — the ONE bias knob, and its zero is on the slider. Default 0.10:
    // a plainly visible bias (314 -> 336 at n=2) that still reads as π, matching
    // the dramatisation level of the sibling knobs rather than blowing past 4.
    this.load = params.load ?? 0.1;
    this.initialVelocity = params.velocity || 1;
    this.r = 0.05;
    this.reset();
  }

  reset() {
    super.reset();
    this.m1 = 1;
    this.meanEff = this._meanEffective();          // ⟨m_eff⟩ over a full turn
    this.m2 = this.meanEff * Math.pow(100, this.n);
    this.x1 = 0.3; this.x2 = 0.7;
    this.v1 = 0; this.v2 = -this.initialVelocity;
    this.phi = 0;                                  // disc orientation (signed)
    this.blockSize2 = Math.min(0.2, 0.06 + 0.02 * this.n);
    this.collisionCount = 0;
    this.finished = false;
    this.collisionEffects = [];
  }

  // Effective mass seen by a horizontal impulse on a rolling disc whose CM is a
  // fixed distance e = load·r off the geometric centre:
  //   m_eff(φ) = I_contact/r² = I_cm/r² + m·d(φ)²/r²
  //            = m(0.5 + 1 + load² − 2·load·sinφ)
  // Minimum is 0.5 + (1 − load)² > 0 for every reachable load, so the collision
  // law never sees a non-positive mass.
  effMass(phi) {
    const L = this.load;
    return 1.5 + L * L - 2 * L * Math.sin(phi);
  }

  // ⟨m_eff⟩ over one full turn. Closed form: ⟨sinφ⟩ = 0 over a turn, so the
  // wobble term averages away exactly and only the offset survives.
  _meanEffective() { return 1.5 + this.load * this.load; }

  // Peak relative wobble of m_eff about its mean — the bias amplitude. Zero
  // exactly when the load is zero.
  wobbleAmplitude() { return (2 * this.load) / this.meanEff; }

  idealKnobValue() { return 0; }   // load = 0 → centred disc → constant m_eff → exact count
  biasSource() { return 'off-centre mass: inertia about the contact point wobbles with rotation'; }

  getControls() {
    return [
      { type: 'slider', id: 'load', label: 'Load — CM offset e/r (0 = centred)', min: 0, max: 0.9, step: 0.02, default: this.load,
        onChange: (v) => { this.load = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 4, step: 1, default: this.n,
        onChange: (v) => { this.n = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Initial velocity', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (v) => { this.initialVelocity = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 0.5 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'q1-q2', label: 'Q_disc vs Q_block (unit circle = the centred ideal; the load bursts it)', dimension: 2, primary: true,
        axisLabels: { x: 'Q_disc = √⟨m_eff⟩ v_disc', y: 'Q_block = √M v_block' } },
      { id: 'meff-wobble', label: 'm_eff wobble (ellipse height = the bias; a flat line at load 0)', dimension: 2, boundary: 'none',
        axisLabels: { x: 'cos φ (disc orientation)', y: 'm_eff / ⟨m_eff⟩ − 1' } },
    ];
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();
    let guard = 0;
    while (remaining > 1e-15 && guard++ < 500000) {
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > this.r) tWall = (this.x1 - this.r) / (-this.v1);
      let tBlock = Infinity;
      const gap = this.x2 - (this.x1 + this.r);
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) tBlock = gap / closing;

      const tNext = Math.min(tWall, tBlock);
      if (tNext > remaining) {
        this.phi += (this.v1 * remaining) / this.r;
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        break;
      }
      this.phi += (this.v1 * tNext) / this.r;
      this.x1 += this.v1 * tNext;
      this.x2 += this.v2 * tNext;
      remaining -= tNext;

      const mEff = this.effMass(this.phi);
      if (tWall <= tBlock) {
        this.x1 = this.r;
        this.v1 = Math.abs(this.v1);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: this.r, time: now, type: 'wall' });
      } else {
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((mEff - this.m2) * ov1 + 2 * this.m2 * ov2) / (mEff + this.m2);
        this.v2 = ((this.m2 - mEff) * ov2 + 2 * mEff * ov1) / (mEff + this.m2);
        this.x1 = this.x2 - this.r;
        this.collisionCount++;
        this.collisionEffects.push({ x: this.x2, y: this.r, time: now, type: 'block' });
      }
      collided = true;
      this.recordBiasSample();
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }
    if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) this.finished = true;
    return collided;
  }

  getCountLabel() { return 'Collisions'; }
  getCollisionCount() { return this.collisionCount; }

  measuredPi() { return this.collisionCount / Math.pow(10, this.n); }   // digit read, π-free
  // live Galperin angle α = arctan(√(m_lighter/m_heavier)); wobbles with φ.
  localSample() {
    const e = this.effMass(this.phi);
    const ratio = Math.max(e, this.m2) / Math.min(e, this.m2);
    return Math.atan(1 / Math.sqrt(ratio));
  }
  getBand() {
    const s = this.biasModel.stats();
    if (!s || s.max - s.min < 1e-9 || this.collisionCount === 0) return null;
    return { lo: this.collisionCount * s.min, mid: this.collisionCount * s.mean, hi: this.collisionCount * s.max };
  }

  // DISPLAY-ONLY reference (never feeds measuredPi(), effMass(), or step()):
  // the collision count a CENTRED disc would give, ⌊π/α〈 with the mean-mass α.
  // It exists so the HUD can print the drift the load is responsible for. The
  // estimator itself stays π-free — it is just count / 10ⁿ.
  _idealCountReference() {
    const alpha = Math.atan(1 / Math.sqrt(Math.pow(100, this.n)));
    return Math.floor(Math.PI / alpha);   // display-only use of Math.PI
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const band = this.getBand();
    const ideal = this._idealCountReference();          // display-only
    const drift = count - ideal;                        // display-only
    const wob = this.wobbleAmplitude();
    return `
      <strong>loaded disc</strong>:
      <span class="f-mass">load e/r = ${this.load.toFixed(2)}</span>,
      <span class="f-mass">⟨m_eff⟩ = ${this.meanEff.toFixed(3)}</span>,
      <span class="f-mass">wobble ±${(100 * wob).toFixed(1)}%</span>,
      <span class="f-mass">M = ⟨m_eff⟩·100^${this.n}</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> /
      <span class="f-angle">10^${this.n}</span> =
      <span class="f-result">${(count / scale).toFixed(this.n + 2)}</span>
      ${band ? `<span class="f-muted">(live-α band [${band.lo.toFixed(3)}, ${band.hi.toFixed(3)}])</span>` : ''}<br>
      <span class="f-muted">drift ${drift >= 0 ? '+' : ''}${drift} vs the centred-disc count ${ideal} (reference only) —
      the off-centre mass makes m_eff, and so α, wobble with rotation. Exactly zero at load = 0.</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.meanEff) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    // wobble view: orientation on x, the relative m_eff excursion on y. The
    // points trace an ellipse whose height IS the bias amplitude 2·load/⟨m_eff⟩,
    // collapsing to a flat line when the load is zero.
    const c = Math.cos(this.phi);
    const w = this.effMass(this.phi) / this.meanEff - 1;
    return [q1 / R, q2 / R, c, w];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'meff-wobble') return (pt) => [pt[2], pt[3]];
    return (pt) => [pt[0], pt[1]];
  }

  // --- rendering: a disc with an off-centre mass dot, a heavy block, wall, road ---
  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.2, 0.4, -0.15, 0.1, 10);
    this.simCamera.position.z = 1;

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wall.position.set(-0.0075, 0.1, 0);
    this.simScene.add(wall);
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.2, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // disc group: rim + fill + centre mark + the load arm and its off-centre CM dot
    this.discGroup = new THREE.Group();
    this.discGroup.add(new THREE.Mesh(new THREE.CircleGeometry(this.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.16 })));
    this.discGroup.add(new THREE.Mesh(new THREE.RingGeometry(this.r * 0.93, this.r, 40),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide })));
    this.discGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(this.r, 0, 0.02)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));
    // the load: an arm from the geometric centre out to the CM, plus the ring of
    // radius e the CM is carried around as the disc rolls. Both collapse to the
    // centre when load = 0 — the knob's zero, drawn.
    const e = this.load * this.r;
    if (e > 1e-6) {
      this.discGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.025), new THREE.Vector3(e, 0, 0.025)]),
        new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.8 })));
      this.discGroup.add(new THREE.Mesh(new THREE.RingGeometry(e * 0.97, e, 32),
        new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.35, side: THREE.DoubleSide })));
    }
    this.cmDot = new THREE.Mesh(new THREE.CircleGeometry(this.r * 0.22, 16), new THREE.MeshBasicMaterial({ color: 0xe94560 }));
    this.cmDot.position.set(e, 0, 0.03);   // fixed in the disc; the group's spin carries it
    this.discGroup.add(this.cmDot);
    this.simScene.add(this.discGroup);

    this.block2Mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.blockSize2, this.blockSize2),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.7 }));
    this.simScene.add(this.block2Mesh);

    this._place();
  }

  _place() {
    if (!this.discGroup) return;
    this.discGroup.position.set(this.x1, this.r, 0);
    this.discGroup.rotation.z = -this.phi;
    this.block2Mesh.position.set(this.x2 + this.blockSize2 / 2, this.blockSize2 / 2, 0);
  }

  updateSimScene() { this._place(); }
}

registerSim(LoadedDiscGalperin);
