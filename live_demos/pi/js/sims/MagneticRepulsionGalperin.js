import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

// Two repelling magnets that never touch each other or the wall. The wall
// and each pairwise contact are smooth one-sided potentials of the form
// U(c) = ½ k₂ c² + ¼ k₄ c⁴, where c is the compression past the equilibrium
// distance r_eq = REACH. The quartic term stiffens the potential at high
// compression so blocks never penetrate even at the peak Galperin
// velocities.
//
// This is a BIASED counter, not an exact one. A Galperin collision is
// instantaneous and pointlike; a magnetic bounce has a finite REACH, so it is
// spread over time and space and the two wells (wall, block-block) overlap.
// The sign-flip count then stops matching ⌊π/α⌋: at n=2 the overlap buys extra
// flips and the count over-shoots, at n=1 the soft well merges bounces and it
// under-shoots. Either way the drift shrinks as the reach shrinks, and reach = 0
// is the ideal limit — reachable from the slider (see REACH_FLOOR below).
//
// NUMERICAL FLOOR: two hard backstops keep the integrator safe at the peak
// Galperin velocities (v₁ can reach v·√m₂ ≈ 100). Below those distances the
// bounce is resolved as a textbook elastic collision instead of by the spring.
// So for reach ≤ REACH_FLOOR the wells are narrower than the contact floor,
// never enter play, and every bounce IS a hard collision — which is exactly
// the reach → 0 limit, and the count lands on ⌊π/α⌋ exactly.
const WALL_BACKSTOP = 0.03;   // block 1 never gets closer than this to the wall
const BLOCK_MIN_GAP = 0.05;   // the two blocks never get closer than this
const REACH_FLOOR = BLOCK_MIN_GAP;   // at or below this reach the bounce is a hard collision
const GATE_EPS = 1e-9;        // lets a sign-flip AT a backstop register as a bounce

export class MagneticRepulsionGalperin extends Simulation {
  static id = 'magnetic-repulsion-galperin';
  static title = 'Magnetic Repulsion Galperin';
  static description = 'Repelling magnets — the field\'s reach is the bias; drag it to 0 for the exact count';
  static piMechanism = 'biased: finite-range soft bounce; the count drifts from the Galperin ideal';
  static rigor = 'Biased';
  static sortOrder = 36;
  static piNature = 'biased';
  static piLabel = 'π ≈';
  static previewSteps = 30;   // hub thumbnail: mid-run, blocks close and fields lit
  static alternatives = [{ id: 'loaded-disc-galperin', label: 'Mass-made bias' }];
  static explanation = {
    setup: 'Two blocks (mass 1 and 100ⁿ) carry like-sign magnets, with a magnetic wall on the left. Every contact is a smooth one-sided spring, and its REACH — the distance rEq at which the magnets start to push — is the one bias knob. The same reach sets BOTH wells, the wall well and the block-block well, so the slider widens the wall tint and the block halos together. A long reach lets the blocks feel each other from far away; reach 0 is an ordinary hard collision.',
    insight: 'This is a BIASED counter, and the reach is the bias. A Galperin collision is instantaneous and pointlike; give the magnetic bounce a finite reach and it is smeared over time and space, so while the light block is still being turned by one magnet it already feels the other. The two wells overlap and the sign-flip count stops agreeing with the ideal collision count. The drift grows with the reach — at n=2 and the default speed the count runs 314 (the ideal), 320, 340, 368, 412 as the reach goes 0.00, 0.15, 0.20, 0.25, 0.30 — and its SIGN depends on the regime: overlapping wells add flips (over-count, n=2), while a soft well can also merge two bounces into one (under-count, seen at n=1). Drag the reach down and the drift goes with it. The exact Galperin count is the reach → 0 limit, and here that limit is a slider position, not a promise: at reach 0 the count sits on ⌊π/α⌋ exactly.',
    contrast: 'Compared to TwoBlocks (instant hard contact) and Spring-Wall (hard block-block + soft wall), here BOTH interactions are smooth and contact-free — and both are biased by the same knob. TwoBlocks is what this sim becomes when the reach reaches zero. NUMERICAL HONESTY: block 1 is held 0.03 off the wall and the blocks 0.05 apart by hard backstops that keep the integrator stable at the peak Galperin speeds (v₁ ≈ v·√m₂). Once the reach drops below those distances the springs never engage and the bounce is literally a hard elastic collision — the correct zero-reach physics, computed the cheap way rather than the soft way.',
    readout: 'COUNTING RULE: a "wall bounce" fires when v₁ flips from negative to positive while block 1 is interacting with the wall — inside the well, or at the hard contact floor when the reach is smaller than that floor. A "block-block bounce" fires the same way when v₂−v₁ flips sign. Each sign-flip event = +1 to the count. count × arctan(√(m₁/m₂)) equals π only in the reach → 0 limit; at any finite reach it is a biased estimate, and the readout shows the drift from the ideal count alongside it.',
    formula: 'π_measured = bounces × arctan(√(m₁/m₂))   — biased at finite reach, exact only as reach → 0',
    getExpected: (params) => {
      const n = Number(params.n) || 1;
      const reach = Number(params.reach ?? 0.2);
      const M = Math.pow(100, n);
      const alpha = Math.atan(1 / Math.sqrt(M));
      const ideal = Math.floor(Math.PI / alpha);   // display-only reference for the ideal count
      const head = `n=${n}: α = arctan(1/${Math.round(Math.sqrt(M))}) = ${alpha.toFixed(6)} rad, so the reach → 0 ideal is ${ideal} bounces.`;
      return reach <= REACH_FLOOR
        ? `${head} At reach ${reach.toFixed(2)} the wells sit inside the hard contact floor, so every bounce is an ordinary elastic collision and the count is exactly ${ideal}.`
        : `${head} At reach ${reach.toFixed(2)} the wells overlap, so expect the count to MISS ${ideal} — that miss is the bias. Drag the reach to 0 to watch it close.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.initialVelocity = params.velocity || 1;
    // Spring parameters: harmonic at low compression (visible deceleration),
    // very stiff quartic at high compression (prevents penetration even at
    // peak Galperin velocities for n=1, 2).
    this.k2 = 1000;
    this.k4 = 1_000_000;     // FIXED stiffness; the bias comes from REACH, not stiffness.
    // The bias knob is the magnet's REACH (the well radius rEq) — ONE number
    // that sets BOTH wells. Long reach => each block feels the other from far
    // away, successive bounce events overlap in time, and the count stops
    // matching ⌊π/α⌋ (at n=2 it over-shoots). Shrink the reach and the drift
    // shrinks with it; at reach ≤ REACH_FLOOR the wells are inside the hard
    // contact floor, every bounce is a plain elastic collision, and the count is
    // exactly Galperin's. Measured at n=2, velocity 1 (ideal count 314):
    //   0.00 -> 314 (0)    0.05 -> 314 (0)    0.10 -> 312 (−2)   0.12 -> 314 (0)
    //   0.15 -> 320 (+6)   0.20 -> 340 (+26)  0.25 -> 368 (+54)  0.30 -> 412 (+98)
    // |drift| grows monotonically with reach above ~0.12; below that it wobbles
    // inside ±2 counts (a wide well can merge two bounces as easily as split
    // one), and it is exactly 0 at reach ≤ 0.07. The SIGN is regime-dependent:
    // n=1 under-counts at long reach (31 -> 26 at reach 0.30) where the soft
    // well is strong enough to merge bounces instead of adding them.
    this.reach = params.reach ?? 0.2;    // default: a clearly visible bias, not the ideal
    this.rEqWall = this.reach;
    this.rEqBlock = this.reach;
    this.dtSub = 5e-5;
    this.maxSub = 8000;
    this.multiMode = params.mode === 'multi';
    // Multi-mode "racing horses": every row runs the SAME masses & stiffness but
    // a different reach, from zero (green, the hard-collision ideal) to long
    // (red, drifts high). The top lane IS the reach → 0 limit, so the viewer can
    // read the bias off directly as the gap between each lane and that one.
    // Measured counts at n=2 (ideal 314): 314, 320, 340, 368, 412.
    this.reachConfigs = [
      { reach: 0.00, color: 0x00ff7f },  // green  — zero reach = hard collision = ideal
      { reach: 0.15, color: 0x4cc9f0 },  // cyan   — slight drift
      { reach: 0.20, color: 0xf7c948 },  // gold   — visible drift
      { reach: 0.25, color: 0xff9f43 },  // orange — strong drift
      { reach: 0.30, color: 0xe94560 },  // red    — long reach, biased high
    ];
    this.reset();
  }

  reset() {
    super.reset();
    this.m1 = 1;
    this.m2 = Math.pow(100, this.n);
    this.x1 = 0.45;
    this.x2 = 0.95;
    this.v1 = 0;
    this.v2 = -this.initialVelocity;
    this.blockSize1 = 0.07;
    this.blockSize2 = Math.min(0.18, 0.08 + 0.018 * this.n);
    this.prevV1 = this.v1;
    this.prevVRel = this.v2 - this.v1;
    this.lastBounceTime = -1e9;
    this.lastBounceType = null;
    this.finished = false;
    this.collisionEffects = [];

    // Sub-states for multi-mode. Each runs independent Verlet with its own k₄.
    if (this.multiMode) {
      this.subStates = this.reachConfigs.map(cfg => ({
        reach: cfg.reach,
        rEqWall: cfg.reach,
        rEqBlock: cfg.reach,
        color: cfg.color,
        label: cfg.reach <= REACH_FLOOR ? `reach ${cfg.reach.toFixed(2)} (hard)` : `reach ${cfg.reach.toFixed(2)}`,
        x1: this.x1, x2: this.x2,
        v1: this.v1, v2: this.v2,
        prevV1: 0,
        prevVRel: this.v2 - this.v1,
        count: 0,
        trail: [],
        finished: false,
      }));
    } else {
      this.subStates = null;
    }
  }

  getControls() {
    return [
      // Mode: single field strength vs multi-overlay across all strengths.
      {
        type: 'select', id: 'mode', label: 'Mode',
        default: this.multiMode ? 'multi' : 'single',
        options: [
          { value: 'single', label: 'Single — one field strength' },
          { value: 'multi',  label: 'Multi — overlay all field strengths' },
        ],
        onChange: (val) => {
          this.multiMode = (val === 'multi');
          // Multi runs 5 sub-states; beyond n=2 it's slow and the soft-integration
          // drift makes the overlay noisy. Single mode handles n=3.
          if (this.multiMode && this.n > 2) this.n = 2;
          this.reset();
          this.initSimScene();
          this.notifyControlsChanged();
        }
      },
      // n is capped at 1 in multi mode (Verlet integration drift across the
      // 5 sub-states accumulates too quickly at n≥2 to produce a clean
      // convergence visual). Single mode allows up to n=3.
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1,
        max: 2, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Initial velocity', min: 0.1, max: 2, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); } },
      // Magnet REACH slider — the bias knob (single mode only), and it goes all
      // the way to 0: long reach -> overlapping wells -> biased high; reach 0 ->
      // hard collision -> the exact Galperin count. Anything at or below
      // REACH_FLOOR is numerically the same hard collision.
      ...(this.multiMode ? [] : [
        {
          type: 'slider', id: 'reach', label: 'Magnet reach (rEq); 0 = hard collision',
          min: 0, max: 0.30, step: 0.01, default: this.reach,
          onChange: (val) => {
            this.reach = val; this.rEqWall = val; this.rEqBlock = val;
            this.reset(); this.initSimScene();
          }
        },
      ]),
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 30, step: 0.1, default: 1 },
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

  // Force on each block from the spring potentials.
  _accel() {
    let a1 = 0;
    let a2 = 0;
    // Wall vs block 1
    if (this.x1 < this.rEqWall) {
      const c = this.rEqWall - this.x1;
      const F = this.k2 * c + this.k4 * c * c * c;
      a1 += F / this.m1;
    }
    // Block-block
    const r12 = this.x2 - this.x1 - this.blockSize1;
    if (r12 < this.rEqBlock) {
      const c = this.rEqBlock - r12;
      const F = this.k2 * c + this.k4 * c * c * c;
      a1 -= F / this.m1;
      a2 += F / this.m2;
    }
    return [a1, a2];
  }

  step(dt) {
    if (this.multiMode) return this._stepMulti(dt);
    return this._stepSingle(dt);
  }

  _stepSingle(dt) {
    if (this.finished) return false;
    const dtSub = this.dtSub;
    let elapsed = 0;
    let collided = false;
    const now = performance.now();
    let safety = this.maxSub;
    const initialE = 0.5 * this.m2 * this.initialVelocity * this.initialVelocity;
    // A bounce counts when the velocity flips sign while the pair is INTERACTING.
    // At a long reach that means "inside the well"; at a reach smaller than the
    // hard contact floor the interaction IS the backstop, so the gate widens to
    // the floor. Without this the sign-flips at the floor go uncounted and the
    // reach → 0 limit reads as π = 0 instead of the exact Galperin count.
    const wallGate = Math.max(this.rEqWall, WALL_BACKSTOP + GATE_EPS);
    const blockGate = Math.max(this.rEqBlock, BLOCK_MIN_GAP + GATE_EPS);

    while (elapsed < dt && safety-- > 0) {
      const stepDt = Math.min(dtSub, dt - elapsed);
      const [a1Old, a2Old] = this._accel();
      this.x1 += this.v1 * stepDt + 0.5 * a1Old * stepDt * stepDt;
      this.x2 += this.v2 * stepDt + 0.5 * a2Old * stepDt * stepDt;
      const [a1New, a2New] = this._accel();
      this.v1 += 0.5 * (a1Old + a1New) * stepDt;
      this.v2 += 0.5 * (a2Old + a2New) * stepDt;

      // Hard wall backstop (safety net at very high velocities; the ONLY bounce
      // mechanism once the reach drops below it).
      if (this.x1 < WALL_BACKSTOP) {
        this.x1 = WALL_BACKSTOP;
        if (this.v1 < 0) this.v1 = -this.v1;
      }
      // Hard block-block backstop: if blocks would overlap, do an elastic
      // collision and snap them to a small visible gap.
      const gap = this.x2 - this.x1 - this.blockSize1;
      if (gap < BLOCK_MIN_GAP && (this.v1 - this.v2) > 0) {
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
        this.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        this.x1 = this.x2 - this.blockSize1 - BLOCK_MIN_GAP;
      }

      // Wall bounce: v_1 reverses sign while interacting with the wall.
      if (this.prevV1 < 0 && this.v1 >= 0 && this.x1 < wallGate) {
        this.collisionCount++;
        this.lastBounceTime = now;
        this.lastBounceType = 'wall';
        this.collisionEffects.push({ x: this.x1, y: this.blockSize1 / 2, time: now, type: 'wall' });
        collided = true;
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
      }
      // Block-block bounce: relative velocity reverses sign while interacting.
      const vRel = this.v2 - this.v1;
      const r12 = this.x2 - this.x1 - this.blockSize1;
      if (this.prevVRel < 0 && vRel >= 0 && r12 < blockGate) {
        this.collisionCount++;
        this.lastBounceTime = now;
        this.lastBounceType = 'block';
        this.collisionEffects.push({
          x: (this.x1 + this.blockSize1 + this.x2) / 2,
          y: Math.max(this.blockSize1, this.blockSize2) / 2,
          time: now, type: 'block'
        });
        collided = true;
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
      }
      this.prevV1 = this.v1;
      this.prevVRel = vRel;

      // Energy clamp (single mode) — same logic as multi-mode sub-states.
      const KE = 0.5 * this.m1 * this.v1 * this.v1 + 0.5 * this.m2 * this.v2 * this.v2;
      let PE = 0;
      if (this.x1 < this.rEqWall) {
        const c = this.rEqWall - this.x1;
        PE += 0.5 * this.k2 * c * c + 0.25 * this.k4 * c * c * c * c;
      }
      const r12curr = this.x2 - this.x1 - this.blockSize1;
      if (r12curr < this.rEqBlock) {
        const c = this.rEqBlock - r12curr;
        PE += 0.5 * this.k2 * c * c + 0.25 * this.k4 * c * c * c * c;
      }
      const totalE = KE + PE;
      if (totalE > initialE * 1.02 && KE > 0) {
        const targetKE = Math.max(0, initialE - PE);
        const scale = Math.sqrt(targetKE / KE);
        this.v1 *= scale;
        this.v2 *= scale;
      }
      elapsed += stepDt;
    }

    if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1 && (this.x2 - this.x1) > this.rEqBlock + 0.1) {
      this.finished = true;
    }
    return collided;
  }

  // Multi-mode: advance every sub-state in parallel and mirror one of them
  // (the medium k₄) to the main visual blocks. The phase trails are exposed
  // via getOverlayTrails() and rendered as colored overlays on the phase view.
  _stepMulti(dt) {
    if (this.finished) return false;
    let collided = false;
    const now = performance.now();
    for (const sub of this.subStates) {
      if (this._stepSubState(sub, dt, now)) collided = true;
    }
    // Mirror one sub-state to the headline readout: the zero-reach lane, i.e. the
    // unbiased hard-collision limit every other lane is being compared against.
    const mainSub = this.subStates[0];
    this.x1 = mainSub.x1;
    this.x2 = mainSub.x2;
    this.v1 = mainSub.v1;
    this.v2 = mainSub.v2;
    this.collisionCount = mainSub.count;
    if (this.subStates.every(s => s.finished)) this.finished = true;
    return collided;
  }

  _stepSubState(sub, dt, nowTs) {
    if (sub.finished) return false;
    // Adaptive sub-step: stiffer k₄ requires finer integration to avoid
    // Verlet's accumulated energy drift.
    const dtSub = this.dtSub;     // fixed stiffness now, so one sub-step size suffices
    let elapsed = 0;
    let collided = false;
    let safety = this.maxSub;
    const initialE = 0.5 * this.m2 * this.initialVelocity * this.initialVelocity;
    // Hard velocity caps based on total-energy bound (each block alone can't
    // exceed √(2 E_init / m)). Final safety net against Verlet run-away.
    const v1Cap = Math.sqrt(2 * initialE / this.m1);
    const v2Cap = Math.sqrt(2 * initialE / this.m2);
    const Rn = Math.sqrt(this.m2) * this.initialVelocity;   // phase normalizer
    // Same widened counting gate as single mode (see _stepSingle): the zero-reach
    // lane bounces off the hard backstops, and those sign-flips must count.
    const wallGate = Math.max(sub.rEqWall, WALL_BACKSTOP + GATE_EPS);
    const blockGate = Math.max(sub.rEqBlock, BLOCK_MIN_GAP + GATE_EPS);

    const subAccel = (s) => {
      let a1 = 0, a2 = 0;
      if (s.x1 < s.rEqWall) {
        const c = s.rEqWall - s.x1;
        a1 += (this.k2 * c + this.k4 * c * c * c) / this.m1;
      }
      const r12 = s.x2 - s.x1 - this.blockSize1;
      if (r12 < s.rEqBlock) {
        const c = s.rEqBlock - r12;
        const F = this.k2 * c + this.k4 * c * c * c;
        a1 -= F / this.m1;
        a2 += F / this.m2;
      }
      return [a1, a2];
    };

    while (elapsed < dt && safety-- > 0) {
      const stepDt = Math.min(dtSub, dt - elapsed);
      const [a1Old, a2Old] = subAccel(sub);
      sub.x1 += sub.v1 * stepDt + 0.5 * a1Old * stepDt * stepDt;
      sub.x2 += sub.v2 * stepDt + 0.5 * a2Old * stepDt * stepDt;
      const [a1New, a2New] = subAccel(sub);
      sub.v1 += 0.5 * (a1Old + a1New) * stepDt;
      sub.v2 += 0.5 * (a2Old + a2New) * stepDt;

      if (sub.x1 < WALL_BACKSTOP) {
        sub.x1 = WALL_BACKSTOP;
        if (sub.v1 < 0) sub.v1 = -sub.v1;
      }
      const gap = sub.x2 - sub.x1 - this.blockSize1;
      if (gap < BLOCK_MIN_GAP && (sub.v1 - sub.v2) > 0) {
        const ov1 = sub.v1, ov2 = sub.v2;
        sub.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
        sub.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        sub.x1 = sub.x2 - this.blockSize1 - BLOCK_MIN_GAP;
      }

      if (sub.prevV1 < 0 && sub.v1 >= 0 && sub.x1 < wallGate) {
        sub.count++;
        collided = true;
        sub.trail.push([Math.sqrt(this.m1) * sub.v1 / Rn, Math.sqrt(this.m2) * sub.v2 / Rn]);
        if (sub.trail.length > 8000) sub.trail.shift();
      }
      const vRel = sub.v2 - sub.v1;
      const r12 = sub.x2 - sub.x1 - this.blockSize1;
      if (sub.prevVRel < 0 && vRel >= 0 && r12 < blockGate) {
        sub.count++;
        collided = true;
        sub.trail.push([Math.sqrt(this.m1) * sub.v1 / Rn, Math.sqrt(this.m2) * sub.v2 / Rn]);
        if (sub.trail.length > 8000) sub.trail.shift();
      }
      sub.prevV1 = sub.v1;
      sub.prevVRel = vRel;

      // Energy clamp: at very stiff k₄ Verlet drifts upward and trails escape
      // the unit circle. We cap total energy at the initial value (KE_initial)
      // by scaling velocities when needed. Both v_1 and v_2 are scaled by the
      // same factor so their ratio is preserved.
      const KE = 0.5 * this.m1 * sub.v1 * sub.v1 + 0.5 * this.m2 * sub.v2 * sub.v2;
      let PE = 0;
      if (sub.x1 < sub.rEqWall) {
        const c = sub.rEqWall - sub.x1;
        PE += 0.5 * this.k2 * c * c + 0.25 * this.k4 * c * c * c * c;
      }
      if (r12 < sub.rEqBlock) {
        const c = sub.rEqBlock - r12;
        PE += 0.5 * this.k2 * c * c + 0.25 * this.k4 * c * c * c * c;
      }
      const totalE = KE + PE;
      if (totalE > initialE * 1.02 && KE > 0) {
        const targetKE = Math.max(0, initialE - PE);
        const scale = Math.sqrt(targetKE / KE);
        sub.v1 *= scale;
        sub.v2 *= scale;
      }
      // Final hard velocity caps. Even if energy clamp couldn't recover (PE
      // already higher than E_init due to deep Verlet penetration), we at
      // least prevent unphysical run-away velocities that would push the
      // trail far outside the unit circle.
      if (Math.abs(sub.v1) > v1Cap * 1.05) sub.v1 = Math.sign(sub.v1) * v1Cap;
      if (Math.abs(sub.v2) > v2Cap * 1.05) sub.v2 = Math.sign(sub.v2) * v2Cap;
      elapsed += stepDt;
    }

    // Trail points are recorded at well-exit inside the loop (clean on-circle
    // vertices) — no per-step continuous sampling, so no broken lines.

    if (sub.v1 >= 0 && sub.v2 > 0 && sub.v2 >= sub.v1 && (sub.x2 - sub.x1) > sub.rEqBlock + 0.1) {
      sub.finished = true;
    }
    return collided;
  }

  // In multi-mode, the framework's main trail is suppressed in favor of the
  // colored overlays. Each sub-state maintains its own trail.
  recordPhasePoint() {
    if (this.multiMode) {
      if (!this.subStates) return;
      // Sample each sub-state once per FRAME (this is called once per frame by
      // the main loop) — sparse, like single mode. Dense per-sub-step sampling
      // is what captured every mid-bounce dip and clamp/backstop jump as a
      // broken segment; sparse sampling traces the smooth path cleanly.
      const R = Math.sqrt(this.m2) * this.initialVelocity;
      for (const sub of this.subStates) {
        sub.trail.push([Math.sqrt(this.m1) * sub.v1 / R, Math.sqrt(this.m2) * sub.v2 / R]);
        if (sub.trail.length > 8000) sub.trail.shift();
      }
      return;
    }
    super.recordPhasePoint();
  }

  getOverlayTrails() {
    if (!this.multiMode || !this.subStates) return [];
    return this.subStates.map(sub => ({
      trail: sub.trail,
      color: sub.color,
      label: sub.label,
      count: sub.count,
      reach: sub.reach,
      opacity: 0.7,
    }));
  }

  // Both modes use line-based overlay rendering. Pixel accumulation is
  // implemented in PhaseSpaceView for future use but isn't the default —
  // it didn't fix the underlying simulation issues at extreme k₄ values,
  // and with the conservative k₄ range we now keep, line rendering is fine.
  getOverlayRenderMode() {
    return 'line';
  }

  getPiApproximation() {
    const alpha = Math.atan(Math.sqrt(this.m1 / this.m2));
    return this.collisionCount * alpha;
  }

  getCountLabel() {
    return 'Magnetic bounces';
  }

  // The knob value at which the bias vanishes (house convention, cf.
  // BiasedPiCounter): reach 0, i.e. an ordinary instantaneous collision.
  idealKnobValue() { return 0; }
  biasSource() { return 'finite magnet reach: each bounce is spread over time and space, so the wells overlap'; }

  // Estimate the π band [low, mid, high] given the current count. The drift
  // is computed by comparing the smooth count to the ideal Galperin count
  // floor(π/α) — Math.PI here is used only as a diagnostic reference for the
  // error band, not for the π estimate itself (which is count × α).
  getPiBand() {
    const alpha = Math.atan(Math.sqrt(this.m1 / this.m2));
    const piMid = this.collisionCount * alpha;
    const idealCount = Math.floor(Math.PI / alpha);
    const drift = Math.abs(this.collisionCount - idealCount);
    // Add a baseline of 1 to the drift: the count is an integer read off a
    // floor, so ±1 bounce of quantization uncertainty survives even when the
    // count lands on the ideal.
    const errCount = drift + 1;
    const err = errCount * alpha;
    return {
      low: Math.max(0, piMid - err),
      mid: piMid,
      high: piMid + err,
      err,
      drift,                                     // magnitude (feeds the band width)
      signedDrift: this.collisionCount - idealCount,   // direction of the bias
      idealCount,
      alpha
    };
  }

  getPiReadout() {
    const band = this.getPiBand();
    if (this.collisionCount === 0) return 'n/a';
    return `${band.mid.toFixed(4)} ± ${band.err.toFixed(4)}`;
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const band = this.getPiBand();
    if (this.multiMode && this.subStates) {
      const ideal = band.idealCount;
      const alpha = band.alpha;
      const rows = this.subStates.map(sub => {
        const piEst = sub.count * alpha;
        const drift = sub.count - ideal;    // SIGNED: lanes can under-count too
        const colorHex = '#' + sub.color.toString(16).padStart(6, '0');
        return `<tr>
          <td style="padding: 1px 6px; color: ${colorHex}; font-weight: bold;">●</td>
          <td style="padding: 1px 6px;">${sub.label}</td>
          <td style="padding: 1px 6px; text-align: right;">${sub.count}</td>
          <td style="padding: 1px 6px; text-align: right;">${piEst.toFixed(4)}</td>
          <td style="padding: 1px 6px; text-align: right;">${drift > 0 ? '+' : ''}${drift}</td>
        </tr>`;
      }).join('');
      return `
        <strong>magnetic repulsion (multi-overlay)</strong>:
        <span class="f-mass">m₁=1, m₂=100^${this.n}</span>;
        ideal (reach→0) Galperin count = <span class="f-count">${ideal}</span>;
        each row runs an independent integration with its own magnet reach.<br>
        <table style="font-size: 0.85em; border-collapse: collapse; margin-top: 4px;">
          <tr style="border-bottom: 1px solid #444;">
            <th></th><th style="padding: 1px 6px; text-align: left;">reach</th>
            <th style="padding: 1px 6px; text-align: right;">count</th>
            <th style="padding: 1px 6px; text-align: right;">π est</th>
            <th style="padding: 1px 6px; text-align: right;">Δ</th>
          </tr>
          ${rows}
        </table>
        <span class="f-muted">Why the rows differ: the reach sets how wide BOTH wells are. The top lane has ZERO reach — its wells never engage, every bounce is a plain elastic collision, so it hits ${ideal} and is the unbiased reference the others are measured against. Longer reach (down to red) = wide, overlapping wells → the count stops matching it: at n=2 the overlap adds sign-flips and π drifts high, at n=1 the wide well merges bounces instead and π drifts low. Δ is each lane's bias, and it shrinks to 0 with the reach.</span>
      `;
    }
    return `
      <strong>magnetic repulsion</strong>:
      <span class="f-mass">m₁ = 1</span>,
      <span class="f-mass">m₂ = 100^${this.n}</span><br>
      <span class="f-angle">reach rEq=${this.reach.toFixed(2)}</span> (sets both the wall well and the block well);
      ${this.reach <= REACH_FLOOR
        ? 'at or below the hard contact floor the wells never engage — every bounce is a plain elastic collision, the reach→0 limit, so the count is exactly Galperin\'s.'
        : 'a longer reach makes the two wells overlap, adding extra sign-flips, so the count drifts off Galperin\'s exact value. Drag the reach to 0 to remove the bias.'}<br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> · <span class="f-angle">${band.alpha.toFixed(6)}</span> =
      <span class="f-result">${band.mid.toFixed(4)}</span>
      ± <span class="f-warning">${band.err.toFixed(4)}</span><br>
      <span class="f-muted">range [${band.low.toFixed(3)}, ${band.high.toFixed(3)}]; reach→0 ideal count for n=${this.n} is ${band.idealCount}; current drift = ${band.signedDrift > 0 ? '+' : ''}${band.signedDrift}</span>
    `;
  }

  getPhasePoint() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    return [q1 / R, q2 / R];
  }

  getPhaseExtractor() { return (pt) => pt; }

  // Hub thumbnail focus: wall + both blocks + their field discs (single mode;
  // the multi-lane view frames itself via the scene bounding box).
  getPreviewBox() {
    if (this.multiMode) return null;
    const aura = this.blockSize2 / 2 + this.rEqBlock * 0.6;
    const x1 = Math.max(0.8, this.x2 + this.blockSize2 / 2 + aura + 0.04);
    return { x0: -0.06, x1, y0: -0.18, y1: 0.42 };
  }

  // Normalized band thickness for the phase-space uncertainty ring. Math.PI is
  // display-only here — it just scales the ring, it never feeds the estimate.
  getPhaseUncertainty() {
    if (this.collisionCount === 0) return 0;
    const band = this.getPiBand();
    return Math.min(0.30, band.err / Math.PI);
  }

  // Multi-mode "racing horses": one horizontal lane per reach, stacked vertically,
  // each running its own sub-state. Color-coded green (zero reach, the unbiased
  // hard-collision limit) to red (long reach, biased high). You watch all five
  // Galperin sequences race at once.
  _laneHeight() { return 0.22; }

  _initMultiScene() {
    this.simScene.clear();
    this.lanes = [];
    const laneH = this._laneHeight();
    const n = this.reachConfigs.length;
    this.simCamera = new THREE.OrthographicCamera(-0.06, 1.2, n * laneH + 0.08, -0.06, 0.1, 10);
    this.simCamera.position.z = 1;

    for (let i = 0; i < n; i++) {
      const cfg = this.reachConfigs[i];
      const y0 = i * laneH;
      const col = cfg.color;

      // reach-well tint — strip from the wall out to x = reach (wider = longer
      // reach). The zero-reach lane has no well at all, so it gets no tint.
      if (cfg.reach > 0) {
        const tint = new THREE.Mesh(
          new THREE.PlaneGeometry(cfg.reach, laneH * 0.82),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.10 })
        );
        tint.position.set(cfg.reach / 2, y0 + laneH * 0.42, -0.01);
        this.simScene.add(tint);
      }

      // baseline
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.004),
        new THREE.MeshBasicMaterial({ color: 0x2a2a4a })
      );
      base.position.set(0.59, y0 + 0.002, -0.005);
      this.simScene.add(base);

      // wall (left)
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(0.02, laneH * 0.85),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
      );
      wall.position.set(-0.01, y0 + laneH * 0.42, 0);
      this.simScene.add(wall);

      // reach boundary line at x = reach (nothing to draw at zero reach)
      if (cfg.reach > 0) {
        const bnd = new THREE.Mesh(
          new THREE.PlaneGeometry(0.0025, laneH * 0.72),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 })
        );
        bnd.position.set(cfg.reach, y0 + laneH * 0.42, -0.002);
        this.simScene.add(bnd);
      }

      // blocks (small + big), color-coded for this lane
      const b1 = new THREE.Mesh(
        new THREE.PlaneGeometry(this.blockSize1, this.blockSize1),
        new THREE.MeshBasicMaterial({ color: col, transparent: true })
      );
      const b2 = new THREE.Mesh(
        new THREE.PlaneGeometry(this.blockSize2, this.blockSize2),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75 })
      );
      this.simScene.add(b1);
      this.simScene.add(b2);

      this.lanes.push({ y0, b1, b2 });
    }
  }

  _updateMultiScene() {
    if (!this.lanes || !this.subStates) return;
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i];
      const sub = this.subStates[i];
      if (!sub) continue;
      lane.b1.position.set(sub.x1 + this.blockSize1 / 2, lane.y0 + this.blockSize1 / 2, 0);
      lane.b2.position.set(sub.x2 + this.blockSize2 / 2, lane.y0 + this.blockSize2 / 2, 0);
      // dim a lane once it finishes its Galperin sequence (it "crossed the line")
      lane.b1.material.opacity = sub.finished ? 0.35 : 1.0;
      lane.b2.material.opacity = sub.finished ? 0.30 : 0.75;
    }
  }

  // Layered filled discs from the field reach inward, drawn largest-first so the
  // overlap near the block stacks into a brighter, denser glow that thins toward
  // the boundary. Denser layers near the block (t² spacing) ≈ a field-strength map.
  _makeFieldRings(blockHalf, ext, color) {
    const group = new THREE.Group();
    const N = 6;
    for (let i = N; i >= 1; i--) {
      const t = i / N;
      const r = blockHalf + ext * t * t;          // dense near the block
      const base = 0.16;                          // low per-layer; overlap builds the glow
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: base, depthWrite: false, side: THREE.DoubleSide })
      );
      disc.renderOrder = -20 + (N - i);           // behind the blocks, pulses & wall tint; layered among themselves
      disc.userData.base = base;
      group.add(disc);
    }
    return group;
  }
  _placeRings(group, x, y, prox) {
    if (!group) return;
    group.position.set(x, y, -0.01);   // behind the blocks (depth-occluded by them)
    const pulse = 0.7 + 0.6 * prox;
    for (const ring of group.children) ring.material.opacity = Math.min(0.6, ring.userData.base * pulse);
  }

  initSimScene() {
    if (this.multiMode) { this._initMultiScene(); return; }
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.05, 1.2, 0.5, -0.3, 0.1, 10);
    this.simCamera.position.z = 1;

    // Magnetic wall
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(0.025, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    wall.position.set(-0.0125, 0.1, 0);
    this.simScene.add(wall);

    // Hard contact floor: block 1 can never come closer than WALL_BACKSTOP, so
    // any reach at or under it is numerically an ordinary hard collision. Drawn
    // always, dim, so the viewer can see where the soft well stops mattering.
    const floorLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.002, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.35 })
    );
    floorLine.position.set(WALL_BACKSTOP, 0.06, -0.003);
    this.simScene.add(floorLine);

    // Wall well boundary + field tint. At reach 0 there is no well: both are
    // skipped rather than drawn as degenerate zero-width geometry.
    if (this.rEqWall > 0) {
      const wallBoundary = new THREE.Mesh(
        new THREE.PlaneGeometry(0.003, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.4 })
      );
      wallBoundary.position.set(this.rEqWall, 0.1, -0.001);
      this.simScene.add(wallBoundary);

      // Wall magnetic field tint (a faint cyan strip from x=0 to x=rEqWall)
      this.wallField = new THREE.Mesh(
        new THREE.PlaneGeometry(this.rEqWall, 0.4),
        new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.10 })
      );
      this.wallField.position.set(this.rEqWall / 2, this.blockSize1 / 2 + 0.05, -0.005);
      this.simScene.add(this.wallField);
    } else {
      this.wallField = null;
    }

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.008),
      new THREE.MeshBasicMaterial({ color: 0x2a2a4a })
    );
    floor.position.set(0.575, -0.004, 0);   // top at y=0 where the block bottoms rest
    this.simScene.add(floor);

    // Blocks
    this.block1Mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.blockSize1, this.blockSize1),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.block1Mesh.position.y = this.blockSize1 / 2;
    this.simScene.add(this.block1Mesh);

    this.block2Mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.blockSize2, this.blockSize2),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.8 })
    );
    this.block2Mesh.position.y = this.blockSize2 / 2;
    this.simScene.add(this.block2Mesh);

    // Magnetic field rings around each block — concentric contours from the block
    // out to the field reach (rEqBlock), denser & brighter near the block where
    // the repulsion is strong, fading at the boundary. The whole set widens with
    // the reach, so the block fields visibly grow alongside the wall well — and
    // at reach 0 there is no field, so there are no halos to draw.
    const fieldExt = this.rEqBlock * 0.6;
    if (fieldExt > 0) {
      this.aura1 = this._makeFieldRings(this.blockSize1 / 2, fieldExt, 0x4cc9f0);
      this.simScene.add(this.aura1);
      this.aura2 = this._makeFieldRings(this.blockSize2 / 2, fieldExt, 0x4cc9f0);
      this.simScene.add(this.aura2);
    } else {
      this.aura1 = null;
      this.aura2 = null;
    }

    // "Magnetic field bridge" between block 1 and the wall — visible only when in well
    this.wallBridge = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 })
    );
    this.simScene.add(this.wallBridge);
    // Bridge between blocks
    this.blockBridge = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 })
    );
    this.simScene.add(this.blockBridge);

    // Effect rings
    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.014, 0.022, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  updateSimScene() {
    if (this.multiMode) { this._updateMultiScene(); return; }
    if (!this.block1Mesh) return;
    const c1x = this.x1 + this.blockSize1 / 2;
    const c2x = this.x2 + this.blockSize2 / 2;
    this.block1Mesh.position.x = c1x;
    this.block2Mesh.position.x = c2x;

    // Field rings follow the blocks and brighten with proximity.
    const r1w = this.x1; // distance from wall
    const r12 = this.x2 - this.x1 - this.blockSize1; // distance between blocks
    // (guarded: at reach 0 there is no well, so proximity is identically 0 and
    // the ratio must not be evaluated)
    const wallProx = this.rEqWall > 0 ? Math.max(0, Math.min(1, (this.rEqWall - r1w) / this.rEqWall)) : 0;
    const blockProx = this.rEqBlock > 0 ? Math.max(0, Math.min(1, (this.rEqBlock - r12) / this.rEqBlock)) : 0;
    this._placeRings(this.aura1, c1x, this.blockSize1 / 2, Math.max(wallProx, blockProx));
    this._placeRings(this.aura2, c2x, this.blockSize2 / 2, blockProx);

    // Wall bridge: visible only when block 1 is in the wall well
    if (r1w < this.rEqWall) {
      const compress = wallProx; // 0..1
      const length = Math.max(0.005, r1w);
      this.wallBridge.visible = true;
      this.wallBridge.position.set(length / 2, this.blockSize1 / 2, -0.002);
      this.wallBridge.scale.set(length, 0.025 * (0.5 + compress), 1);
      this.wallBridge.material.opacity = 0.25 + 0.55 * compress;
    } else {
      this.wallBridge.visible = false;
    }

    // Block bridge: visible only when blocks are in the block-block well
    if (r12 < this.rEqBlock) {
      const compress = blockProx;
      const length = Math.max(0.005, r12);
      const cx = (this.x1 + this.blockSize1 + this.x2) / 2;
      const cy = (this.blockSize1 / 2 + this.blockSize2 / 2) / 2;
      this.blockBridge.visible = true;
      this.blockBridge.position.set(cx, cy, -0.002);
      this.blockBridge.scale.set(length, 0.025 * (0.5 + compress), 1);
      this.blockBridge.material.opacity = 0.25 + 0.55 * compress;
    } else {
      this.blockBridge.visible = false;
    }

    // Effect rings
    const now = performance.now();
    const EFFECT_DURATION = 380;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);
    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        const scale = 1 + progress * 6;
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

registerSim(MagneticRepulsionGalperin);
