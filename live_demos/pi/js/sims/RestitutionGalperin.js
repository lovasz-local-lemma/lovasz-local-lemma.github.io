import * as THREE from 'three';
import { BiasedPiCounter } from '../core/BiasedPiCounter.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// Galperin's Two Blocks with ONE extra knob: a coefficient of restitution ε ≤ 1.
// ε scales the post-collision RELATIVE velocity at whichever contact you choose
// (block↔block, the wall, or both). The estimator is untouched — still the raw
// digit read count/10ⁿ, exactly as in Two Blocks — and at ε = 1 the block↔block
// update literally branches back to the Two Blocks expression, so the ideal is
// bit-identical rather than merely algebraically equal.
//
// WHAT ε DOES IN RESCALED-MOMENTUM SPACE (q₁ = √m₁v₁, q₂ = √m₂v₂):
// Both collisions are reflections about a fixed line — the wall about the q₂
// axis, the block↔block contact about the line through (√m₁, √m₂) — and the
// angle between those lines is α = arctan√(m₁/m₂). ε leaves BOTH lines exactly
// where they were; it multiplies the component PERPENDICULAR to the mirror by ε
// instead of leaving it alone. So each bounce is a reflection composed with a
// squash toward its mirror. Two consequences: the radius |Q| = √(2E) decays
// monotonically (the circle becomes an inward SPIRAL), and squashing toward the
// mirror RETARDS the turn, so two successive bounces advance the state by less
// than the ideal 2α.
//
// THE OBVIOUS PREDICTION IS WRONG, AND THAT IS THE LESSON:
// The natural guess is that a dying radius ends the run EARLY, so the count
// falls SHORT. It does not. The escape condition (both blocks receding, the
// small one unable to catch the big one) is a SECTOR in the q-plane, and a
// sector does not care about radius. The trajectory must still sweep the same
// ≈ π of angle before it can leave; ε only makes each bounce turn LESS. So the
// count runs LONG, and it is ANGULAR RETARDATION, not energy loss as such, that
// biases π. This sim measures the swept angle directly (π-free, see
// _recordTurn) and prints it next to the count, so the claim is checkable on
// screen rather than asserted:
//   n=2, block contact:  ε=1.000 → 314 collisions, swept 3.129896
//                        ε=0.990 → 324 collisions, swept 3.125819
//                        ε=0.980 → 364 collisions, swept 3.131634
// The swept angle sits on π throughout; only the number of steps needed to get
// there inflates. Mean advance per bounce over those three: 0.0099678,
// 0.0096476, 0.0086034, against α = 0.0099997.
//
// THE KNOB THAT ORGANISES EVERYTHING — κ, the loss measured in wedge angles:
//   κ = (1 − ε)/α × (2 if both contacts are lossy, else 1)
// π-free (α comes from the measured mass ratio). MEASURED relative drift
// (count − ideal)/10ⁿ, which is a function of κ alone to about 5% across
// n = 2, 3 and across all three contact choices:
//   κ      0.25   0.5    1.0    1.5    2.0    2.5    3.0    3.5    3.8
//   drift  0.006  0.022  0.101  0.249  0.494  0.898  1.66   3.5    8.3
// Restitution on the WALL only lands within ±1 collision of the block-only
// numbers at every ε tested — at a 100ⁿ mass ratio the small block carries
// nearly all the relative speed at BOTH contacts, so it barely matters which
// surface you spoil. Restitution on both simply doubles the loss per cycle:
// ε = 0.995 on both gives exactly the 324 collisions that ε = 0.990 on one does.
//
// Raw counts (contact = block↔block, v₀ = 1), ideal 314 (n=2) / 3141 (n=3):
//   ε      1.000  0.999  0.998  0.997  0.995  0.990  0.985  0.980  0.970  0.950
//   n=2     314    314    314    315    316    324    339    364    484   COLLAPSE
//   n=3    3141   3244   3628   4758  COLLAPSE …
// Drift is 0 exactly at ε = 1 and strictly non-increasing as ε rises, verified
// at every 0.001 notch from 0.966 to 1.000 at n = 2.
//
// THE COLLAPSE — where the counter does not merely lean, it dies:
// Push ε far enough and the sequence never terminates: the small block is
// squeezed between the wall and the still-advancing big block and bounces
// infinitely often in finite time (classic inelastic collapse / Zeno). Bisected
// numerically, the threshold in κ is a single number:
//   one lossy contact: κ* = 3.299 (n=1), 3.897 (n=2), 3.967 (n=3)
//   both contacts:     κ* = 3.611 (n=1), 3.935 (n=2), 3.970 (n=3)
// i.e. κ* → 4. Since α ≈ 10⁻ⁿ, the counter survives only while 1 − ε ≲ 4·10⁻ⁿ:
// EVERY EXTRA DIGIT OF π YOU ASK FOR MAKES THE MACHINE TEN TIMES MORE FRAGILE.
// n = 1 tolerates ε ≈ 0.67; n = 3 needs ε > 0.996. That is also why the digit
// slider stops at 3 — at n = 4 no reachable slider notch survives. A collapsed
// run reports NO π at all (measuredPi() returns NaN): the count where we stopped
// it is an artifact of the cap, not an answer. The measured swept angle makes
// the failure legible — in a collapse it STALLS (0.185 at n=2, ε=0.90; 0.204 at
// n=3, ε=0.99) instead of reaching π, because the advance per bounce dies faster
// than it can accumulate and the state spirals into the corner.
//
// HONESTY: this is NOT a new reason π appears. It is a new way to BREAK the
// counter — and it is the defect every viewer names first ("real collisions
// aren't perfectly elastic"), which is exactly why the bias family should own
// it. It also differs in KIND from its neighbours: they all perturb the
// reflection ANGLE (m_eff wobble, a soft potential, a breathing circle). This
// one leaves α perfectly intact and removes ENERGY at the bounce instead, and
// it is the only one that can destroy termination outright.
const MAX_COLLISIONS = 40000;     // hard stop; past this a non-terminating run is called what it is
const PER_CALL_GUARD = 20000;     // events per step() call, so one frame can never hang
const ENERGY_FLOOR_FRAC = 1e-14;  // E/E₀ below this ⇒ the run has died, stop early
const KAPPA_CRIT = 4;             // measured collapse threshold in κ (see header)

// MEASURED relative drift (count − ideal)/10ⁿ vs κ, from the table in the
// header. DISPLAY ONLY — feeds the "what to expect" blurb, never the estimator.
const DRIFT_TABLE = [
  [0, 0], [0.25, 0.006], [0.5, 0.022], [1.0, 0.101], [1.5, 0.249],
  [2.0, 0.494], [2.5, 0.898], [3.0, 1.66], [3.5, 3.5], [3.8, 8.3],
];
function expectedRelDrift(kappa) {
  for (let i = 1; i < DRIFT_TABLE.length; i++) {
    const [x0, y0] = DRIFT_TABLE[i - 1], [x1, y1] = DRIFT_TABLE[i];
    if (kappa <= x1) return y0 + ((kappa - x0) / (x1 - x0)) * (y1 - y0);
  }
  return DRIFT_TABLE[DRIFT_TABLE.length - 1][1];
}

export class RestitutionGalperin extends BiasedPiCounter {
  static id = 'restitution-galperin';
  static title = 'Restitution Galperin';
  static description = 'The bounce that is not quite elastic — ε < 1 does not blunt the count, it inflates it, then kills it';
  static piMechanism = 'biased: ε < 1 squashes each reflection toward its mirror, so every bounce turns less than α and the count runs long';
  static rigor = 'Biased';
  static piNature = 'biased';
  static piLabel = 'π ≈';
  static sortOrder = 44;          // bias family: 36 magnetic, 40 pendulum-rail, 43 loaded-disc, 44 here
  static previewSteps = 16;       // hub thumbnail: mid-run, blocks near the wall
  static alternatives = [
    { id: 'two-blocks', label: 'The exact original (ε = 1)' },
    { id: 'gravity-ramp-galperin', label: 'A different way to break it' },
  ];
  static explanation = {
    setup: 'Two Blocks, unchanged: mass 1 and mass 100ⁿ, a wall, and the Galperin collision count. One knob is added — a coefficient of restitution ε ≤ 1, applied at the block↔block contact, at the wall, or at both. ε multiplies the post-collision RELATIVE velocity, so ε = 1 is the perfectly elastic original and ε < 1 removes energy at every bounce. Nothing else moves: same masses, same geometry, same estimator (count / 10ⁿ). This is not a new reason π shows up — it is the defect everyone names first, given a knob.',
    insight: 'In rescaled-momentum space (q₁ = √m₁v₁, q₂ = √m₂v₂) each collision is a reflection about a fixed line, and the angle between the wall line and the contact line is α = arctan√(m₁/m₂). Restitution leaves BOTH lines exactly where they were — the wedge angle α is untouched — but multiplies the component perpendicular to the mirror by ε. A bounce becomes a reflection composed with a squash toward its mirror, so the circle turns into an inward SPIRAL. Now the surprise, and it is worth stating because the obvious guess is wrong: a dying radius does NOT end the run early, and the count does NOT fall short. The escape condition is a SECTOR in the q-plane, and a sector does not care about radius — the trajectory still has to sweep the same ≈ π of angle to get out. Squashing toward the mirror only makes each bounce turn LESS than α. So the count runs LONG. The HUD measures the swept angle directly (π-free: signed turns read off the momentum vector) and prints it beside the count, so you can watch it sit on π while the count inflates: at n = 2 the run sweeps 3.1299, 3.1258, 3.1316 for ε = 1.000, 0.990, 0.980 while the count goes 314, 324, 364. The wedge is right; the steps got smaller. Past the collapse threshold that same number tells you the machine is dead rather than merely biased: the swept angle stalls (0.185 at ε = 0.90) and never reaches π at all.',
    contrast: 'This differs in KIND from its neighbours in the bias family. Loaded Disc wobbles m_eff, Magnetic Repulsion rounds the bounce with a finite-range potential, Pendulum Rail throttles how much impulse reaches the bob, Gravity Ramp breathes the momentum circle — all of them perturb the reflection ANGLE. Restitution leaves α exactly right and takes ENERGY instead. It is also the only one that can destroy the machine outright: push ε past the threshold and the small block is squeezed against an advancing wall and bounces infinitely often in finite time (inelastic collapse), so there is no count at all and this sim reports none. The threshold is a clean π-free law in κ = (1 − ε)/α, the per-bounce speed loss in units of the wedge angle: measured κ* = 3.90 (n=2) and 3.97 (n=3), i.e. κ* → 4. Since α ≈ 10⁻ⁿ, the counter survives only while 1 − ε ≲ 4·10⁻ⁿ — every extra digit of π you demand makes it ten times more fragile. n = 1 shrugs off ε = 0.9; n = 3 needs ε > 0.996.',
    formula: 'π ≈ count / 10ⁿ (π-free digit read, identical to Two Blocks); exact only at ε = 1. Survives while κ = (1 − ε)/α × (both contacts ? 2 : 1) ≲ 4.',
    getExpected: (params) => {
      const n = params.n || 2;
      const eps = params.epsilon ?? 0.99;
      const contact = params.contact || 'block';
      const alpha = Math.atan(Math.pow(10, -n));
      const kappa = ((1 - eps) / alpha) * (contact === 'both' ? 2 : 1);
      const ideal = Math.floor(Math.PI / alpha);   // display-only: the blurb's reference, not the estimator
      if (eps >= 1) return `ε = 1: perfectly elastic → this IS Two Blocks. Expect its exact count, ${ideal} collisions at n = ${n}, and a phase trail that stays on the unit circle.`;
      if (kappa > KAPPA_CRIT) {
        return `ε = ${eps} at n = ${n} gives κ = ${kappa.toFixed(2)}, past the measured collapse threshold κ* ≈ ${KAPPA_CRIT}. Expect INELASTIC COLLAPSE: the run never terminates and there is no π to read. Raise ε above ${(1 - KAPPA_CRIT * alpha / (contact === 'both' ? 2 : 1)).toFixed(4)} at this n to get a counter back.`;
      }
      const rel = expectedRelDrift(kappa);
      return `ε = ${eps} at n = ${n} gives κ = ${kappa.toFixed(2)}. Expect the count to run LONG of the elastic ideal ${ideal} — by about ${Math.round(rel * Math.pow(10, n))} collisions (measured relative drift ${rel.toFixed(3)} in π units) — while the swept angle stays on π. Collapse sets in near κ ≈ ${KAPPA_CRIT}.`;
    },
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    // The ONE bias knob, and its ideal is ON the slider: ε = 1.000 exactly.
    // Default 0.99 at n = 2 → 324 collisions vs the ideal 314: a plainly visible
    // bias that still reads as π, with a spiral that visibly closes in.
    this.epsilon = params.epsilon ?? 0.99;
    this.contact = params.contact || 'block';
    this.initialVelocity = params.velocity || 1;
    this._pp = [0, 0, 0, 0];      // preallocated phase point — no per-frame alloc
    this.reset();
  }

  reset() {
    super.reset();
    // Which surface the restitution applies to; ε = 1 on the other one.
    this.eB = (this.contact === 'wall') ? 1 : this.epsilon;
    this.eW = (this.contact === 'block') ? 1 : this.epsilon;
    this.m1 = 1;
    this.m2 = Math.pow(100, this.n);
    this.x1 = 0.3;
    this.x2 = 0.7;
    this.v1 = 0;
    this.v2 = -this.initialVelocity;
    this.blockSize1 = 0.06;
    this.blockSize2 = Math.min(0.2, 0.06 + 0.02 * this.n);
    this.finished = false;
    this.outcome = 'running';     // 'escaped' | 'collapse' | 'running'
    this.R = Math.sqrt(this.m2) * this.initialVelocity;   // rescaled radius at launch
    this.E0 = 0.5 * this.m2 * this.initialVelocity * this.initialVelocity;
    this.radiusFrac = 1;
    this.sweptAngle = 0;          // π-free: measured turn of the momentum vector
    this._lastAdvance = NaN;
    // Two-collision-lagged momentum vector, for the turn measurement below.
    this._aQ1 = 0; this._aQ2 = -this.R;   // Q at collision k−2 (launch state for k = 2)
    this._bQ1 = 0; this._bQ2 = 0;         // Q at collision k−1
    this._haveB = false;
    this._phaseStride = 1;
    // Pooled collision effects — mutated in place, never reallocated, so a
    // collapsing run cannot allocate its way through a frame.
    if (!this.collisionEffects) {
      this.collisionEffects = [];
      for (let i = 0; i < 6; i++) this.collisionEffects.push({ x: 0, y: 0, time: -1e9, type: 'wall' });
    } else {
      for (let i = 0; i < this.collisionEffects.length; i++) this.collisionEffects[i].time = -1e9;
    }
    this._fxCursor = 0;
  }

  // The Galperin wedge angle, from the MEASURED mass ratio. No π anywhere.
  alpha() { return Math.atan(Math.sqrt(this.m1 / this.m2)); }
  // Per-bounce speed loss in units of the wedge angle, counting both contacts
  // when both are lossy. π-free, and it is the number that decides whether the
  // counter survives at all.
  kappa() { return ((1 - this.epsilon) / this.alpha()) * (this.contact === 'both' ? 2 : 1); }
  // ε at which this n/contact combination reaches the measured collapse threshold.
  criticalEpsilon() { return 1 - KAPPA_CRIT * this.alpha() / (this.contact === 'both' ? 2 : 1); }

  idealKnobValue() { return 1; }   // ε = 1 → perfectly elastic → the exact Two Blocks count
  biasSource() { return 'restitution ε < 1 squashes each reflection toward its mirror line, so the momentum circle spirals in and every bounce turns less than α'; }

  getControls() {
    return [
      // The ideal is a reachable slider position, not a promise: ε = 1.000.
      { type: 'slider', id: 'epsilon', label: 'Restitution ε (1 = perfectly elastic)', min: 0.9, max: 1, step: 0.001,
        default: this.epsilon, highlight: true,
        onChange: (v) => { this.epsilon = v; this.reset(); this.initSimScene(); } },
      { type: 'select', id: 'contact', label: 'Where the bounce is lossy', highlight: true, default: this.contact,
        options: [
          { value: 'block', label: 'Block ↔ block only' },
          { value: 'wall', label: 'Wall only (within ±1 collision of block-only)' },
          { value: 'both', label: 'Both (twice the loss per cycle)' },
        ],
        onChange: (v) => { this.contact = v; this.reset(); this.initSimScene(); } },
      // Capped at 3 on purpose: tolerance for ε scales like α ≈ 10⁻ⁿ, so at
      // n = 4 every reachable slider notch collapses. See the header.
      { type: 'slider', id: 'n', label: 'Digits (100ⁿ) — each digit is 10× more fragile', min: 1, max: 3, step: 1, default: this.n,
        onChange: (v) => { this.n = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'velocity', label: 'Launch speed (the count does not care)', min: 0.1, max: 3, step: 0.1,
        default: this.initialVelocity,
        onChange: (v) => { this.initialVelocity = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'q1-q2', label: 'Q_small vs Q_large — the circle becomes an inward spiral', dimension: 2, primary: true,
        axisLabels: { x: 'Q_small = √m₁ v₁', y: 'Q_large = √m₂ v₂' } },
      { id: 'radius-decay', label: 'Radius |Q|/R vs bounce number (a flat line at ε = 1)', dimension: 2, boundary: 'none',
        axisLabels: { x: 'bounce number', y: '2·|Q|/R − 1' } },
    ];
  }

  _pushEffect(x, y, type, now) {
    const e = this.collisionEffects[this._fxCursor];
    e.x = x; e.y = y; e.type = type; e.time = now;
    this._fxCursor = (this._fxCursor + 1) % this.collisionEffects.length;
  }

  // How far the rescaled-momentum state actually turned, measured.
  //
  // A single reflection throws the state right across its mirror, so the jump
  // from one collision to the next is a big angle that tells you nothing. What
  // advances monotonically around the wedge is the composition of TWO
  // reflections: elastically that is a rotation by exactly 2α. So compare the
  // state at collision k with the state at collision k−2 and halve it, giving
  // the advance PER BOUNCE. Summed over the run this is the total swept angle,
  // which stays ≈ π however badly ε inflates the count.
  //
  // π-FREE: atan2 of the cross and dot products of two MEASURED momentum
  // vectors. No wrap-around constant is needed — two bounces can never turn the
  // state by half a revolution — so no π enters here or anywhere downstream.
  _recordTurn() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    if (!this._haveB) {
      this._bQ1 = q1; this._bQ2 = q2; this._haveB = true;   // k = 1: nothing to compare yet
    } else {
      const cross = this._aQ1 * q2 - this._aQ2 * q1;
      const dot = this._aQ1 * q1 + this._aQ2 * q2;
      if (cross !== 0 || dot !== 0) {
        const adv = Math.abs(Math.atan2(cross, dot)) / 2;
        this.sweptAngle += adv;
        this._lastAdvance = adv;
        this.biasModel.record(adv);
      }
      this._aQ1 = this._bQ1; this._aQ2 = this._bQ2;
      this._bQ1 = q1; this._bQ2 = q2;
    }
    this.radiusFrac = Math.sqrt(q1 * q1 + q2 * q2) / this.R;
  }

  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();
    let guard = 0;

    while (remaining > 1e-15 && guard++ < PER_CALL_GUARD) {
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > 0) tWall = this.x1 / (-this.v1);

      let tBlock = Infinity;
      const gap = this.x2 - this.x1 - this.blockSize1;
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) tBlock = gap / closing;

      const tNext = Math.min(tWall, tBlock);

      if (!Number.isFinite(tNext)) {
        // Nothing can collide again — coast out and stop.
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        this.finished = true;
        this.outcome = 'escaped';
        break;
      }

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
        // At the wall the "relative" velocity is just v₁, so ε scales the
        // rebound. At ε = 1 this is Math.abs(v₁) times exactly 1.0 —
        // bit-identical to Two Blocks.
        this.v1 = this.eW * Math.abs(this.v1);
        this.collisionCount++;
        this._pushEffect(0, this.blockSize1 / 2, 'wall', now);
      } else {
        const ov1 = this.v1, ov2 = this.v2;
        if (this.eB === 1) {
          // Literally the Two Blocks update, so ε = 1 reproduces the exact
          // counter bit for bit rather than merely algebraically.
          this.v1 = ((this.m1 - this.m2) * ov1 + 2 * this.m2 * ov2) / (this.m1 + this.m2);
          this.v2 = ((this.m2 - this.m1) * ov2 + 2 * this.m1 * ov1) / (this.m1 + this.m2);
        } else {
          // Momentum conserved, relative velocity reversed and scaled by ε:
          //   m₁v₁' + m₂v₂' = P,   v₂' − v₁' = −ε (v₂ − v₁)
          const P = this.m1 * ov1 + this.m2 * ov2;
          const M = this.m1 + this.m2;
          this.v1 = (P + this.m2 * this.eB * (ov2 - ov1)) / M;
          this.v2 = (P + this.m1 * this.eB * (ov1 - ov2)) / M;
        }
        this.x1 = this.x2 - this.blockSize1;
        this.collisionCount++;
        this._pushEffect(this.x2, Math.max(this.blockSize1, this.blockSize2) / 2, 'block', now);
      }
      collided = true;
      this._recordTurn();

      // Trail throttling: a collapsing run can fire tens of thousands of events
      // in a single frame, so past the first few thousand we keep every 16th
      // point. No effect on the count or on any number reported.
      if (this.collisionCount > 4000) this._phaseStride = 16;
      if (this.collisionCount % this._phaseStride === 0) {
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
      }

      // Clean Galperin termination: both receding, small one cannot catch big one.
      if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) {
        this.finished = true;
        this.outcome = 'escaped';
        break;
      }
      // The run died without escaping: inelastic collapse.
      const E = 0.5 * this.m1 * this.v1 * this.v1 + 0.5 * this.m2 * this.v2 * this.v2;
      if (E < ENERGY_FLOOR_FRAC * this.E0) {
        this.finished = true;
        this.outcome = 'collapse';
        break;
      }
      if (this.collisionCount >= MAX_COLLISIONS) {
        this.finished = true;
        this.outcome = 'collapse';
        break;
      }
    }
    return collided;
  }

  getCountLabel() { return 'Collisions'; }
  getCollisionCount() { return this.collisionCount; }

  // π-free digit read, exactly Two Blocks' estimator, untouched by ε. A
  // collapsed run has NO π to report: the count we stopped at is an artifact of
  // the cap, not an answer, so say nothing rather than something false.
  measuredPi() {
    if (this.outcome === 'collapse') return NaN;
    return this.collisionCount / Math.pow(10, this.n);
  }

  // Deterministic bias, not a stochastic spread — no band. The honest companion
  // number is the measured swept angle, printed in the readout below.
  getBand() { return null; }

  // DISPLAY-ONLY reference (never feeds measuredPi(), step(), alpha(), kappa()
  // or the turn measurement): the count a perfectly elastic run gives, so the
  // HUD can print the drift ε is responsible for.
  _idealCountReference() {
    return Math.floor(Math.PI / this.alpha());   // display-only use of Math.PI
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const ideal = this._idealCountReference();     // display-only
    const drift = count - ideal;                   // display-only
    const a = this.alpha();
    const k = this.kappa();
    const s = this.biasModel.stats();
    const mean = s ? s.mean : a;
    const collapsed = this.outcome === 'collapse';
    const where = this.contact === 'both' ? 'block + wall' : (this.contact === 'wall' ? 'wall' : 'block↔block');
    return `
      <strong>restitution</strong>:
      <span class="f-angle">ε = ${this.epsilon.toFixed(3)}</span>
      <span class="f-mass">at ${where}</span>,
      <span class="f-mass">m₂/m₁ = 100^${this.n}</span>,
      <span class="f-angle">α = ${a.toFixed(6)}</span>,
      <span class="f-mass">κ = ${k.toFixed(2)}</span>
      <span class="f-muted">(collapse past κ* ≈ ${KAPPA_CRIT}, i.e. ε &lt; ${this.criticalEpsilon().toFixed(4)} here)</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> /
      <span class="f-angle">10^${this.n}</span> =
      ${collapsed
        ? '<span class="f-result">— no answer —</span>'
        : `<span style="font-size:1.1em">${piDigitsHTML(count / scale, this.n + 2)}</span>`}<br>
      <span class="f-muted">radius |Q|/R = ${this.radiusFrac.toFixed(4)}
      (energy ${(100 * this.radiusFrac * this.radiusFrac).toFixed(2)}% of launch) ·
      swept angle measured = ${this.sweptAngle.toFixed(4)} ·
      advance per bounce ${mean.toFixed(6)} vs α = ${a.toFixed(6)}</span><br>
      <span class="f-muted">${collapsed
        ? `<strong>INELASTIC COLLAPSE</strong> — the run never terminated: the small block is trapped against an advancing wall and bounces infinitely often in finite time. Look at the swept angle above — it stalled at ${this.sweptAngle.toFixed(4)}, nowhere near π: the advance per bounce died faster than it could accumulate, so the state spirals into the corner instead of getting round the wedge. The ${count} above is where we stopped it, not an answer, so no π is reported. Raise ε above ${this.criticalEpsilon().toFixed(4)} at this n.`
        : (this.epsilon >= 1
          ? 'ε = 1: perfectly elastic — this IS Two Blocks, and the count is its exact value. Drift 0, radius flat at 1.'
          : `drift ${drift >= 0 ? '+' : ''}${drift} vs the elastic count ${ideal} (reference only). ε leaves the wedge angle α exactly right and shrinks the radius instead — but the escape condition is a SECTOR, so the run still has to sweep ≈ π. Each bounce simply turns less than α, so the count runs LONG. Push ε to 1 and the drift closes to exactly zero.`)}</span>
    `;
  }

  // One point serves both views: [q₁/R, q₂/R] for the spiral, then the
  // bounce-number / radius pair for the decay plot.
  getPhasePoint() {
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const r = Math.sqrt(q1 * q1 + q2 * q2) / this.R;
    // Bounce number mapped into [−1, 1] over a generous 4·10ⁿ collisions.
    const span = 4 * Math.pow(10, this.n);
    this._pp[0] = q1 / this.R;
    this._pp[1] = q2 / this.R;
    this._pp[2] = Math.min(1, this.collisionCount / span) * 2 - 1;
    this._pp[3] = Math.min(1, r) * 2 - 1;
    return this._pp;
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'radius-decay') return (pt) => [pt[2], pt[3]];
    return (pt) => [pt[0], pt[1]];
  }

  getRawExpectedShape(viewId) {
    // The elastic reference: the unit circle the state would ride at ε = 1.
    if (viewId === 'q1-q2') return { type: 'ellipse', params: { semiAxisX: 1, semiAxisY: 1 } };
    return null;
  }

  // --- rendering: Two Blocks' picture plus a gauge for the dying radius ---

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.2, 0.5, -0.3, 0.1, 10);
    this.simCamera.position.z = 1;

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wall.position.set(-0.01, 0.1, 0);
    this.simScene.add(wall);

    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.2, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    this.block1Mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.blockSize1, this.blockSize1),
      new THREE.MeshBasicMaterial({ color: 0xe94560 }));
    this.block1Mesh.position.y = this.blockSize1 / 2;
    this.simScene.add(this.block1Mesh);

    this.block2Mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.blockSize2, this.blockSize2),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.7 }));
    this.block2Mesh.position.y = this.blockSize2 / 2;
    this.simScene.add(this.block2Mesh);

    // Radius gauge: the full-width track is |Q|/R = 1 (the elastic circle); the
    // filled bar is what restitution has left. Full and frozen at ε = 1.
    const BAR_W = 0.9, BAR_X = 0.06, BAR_Y = 0.42;
    const track = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, 0.008).translate(BAR_W / 2, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0x2a2a4a }));
    track.position.set(BAR_X, BAR_Y, 0);
    this.simScene.add(track);
    this.radiusBar = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, 0.014).translate(BAR_W / 2, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }));
    this.radiusBar.position.set(BAR_X, BAR_Y, 0.01);
    this.simScene.add(this.radiusBar);

    this.arrow1 = this._makeArrow(0x4cc9f0);
    this.arrow2 = this._makeArrow(0x4cc9f0);
    this.simScene.add(this.arrow1);
    this.simScene.add(this.arrow2);

    this.effectMeshes = [];
    for (let i = 0; i < this.collisionEffects.length; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.015, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  _makeArrow(color) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ color }));
    line.visible = false;
    return line;
  }

  _setArrow(arrow, x, y, length) {
    const p = arrow.geometry.attributes.position.array;
    p[0] = x; p[1] = y; p[2] = 0.01;
    p[3] = x + length; p[4] = y; p[5] = 0.01;
    arrow.geometry.attributes.position.needsUpdate = true;
  }

  updateSimScene() {
    if (!this.block1Mesh) return;
    this.block1Mesh.position.x = this.x1 + this.blockSize1 / 2;
    this.block2Mesh.position.x = this.x2 + this.blockSize2 / 2;

    const r = Math.max(1e-4, Math.min(1, this.radiusFrac));
    this.radiusBar.scale.x = r;
    // Cyan while healthy, red once the bounce has eaten most of the launch energy.
    this.radiusBar.material.color.setHex(r > 0.35 ? 0x4cc9f0 : 0xe94560);

    if (this.showVectors) {
      this.arrow1.visible = true;
      this.arrow2.visible = true;
      const s = 0.1;
      this._setArrow(this.arrow1, this.x1 + this.blockSize1 / 2, this.blockSize1 + 0.02, this.v1 * s);
      this._setArrow(this.arrow2, this.x2 + this.blockSize2 / 2, this.blockSize2 + 0.02, this.v2 * s);
    } else {
      this.arrow1.visible = false;
      this.arrow2.visible = false;
    }

    const now = performance.now();
    const EFFECT_DURATION = 300;
    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      const e = this.collisionEffects[i];
      const age = now - e.time;
      if (age < EFFECT_DURATION) {
        const progress = age / EFFECT_DURATION;
        const sc = 1 + progress * 5;
        ring.visible = true;
        ring.position.set(e.x, e.y, 0.02);
        ring.scale.set(sc, sc, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(e.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }

  // Hub thumbnail focus: wall plus both blocks, Two Blocks' framing widened to
  // include the radius gauge.
  getPreviewBox() {
    const x1 = Math.max(0.55, this.x2 + this.blockSize2 + 0.1);
    return { x0: -0.07, x1, y0: -0.05, y1: 0.47 };
  }
}

registerSim(RestitutionGalperin);
