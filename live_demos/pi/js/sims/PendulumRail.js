// js/sims/PendulumRail.js
import * as THREE from 'three';
import { BiasedPiCounter } from '../core/BiasedPiCounter.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// A cart on a rail bounces between a wall and a heavy block (mass 100ⁿ) — the
// Galperin π counter. But the cart carries a freely swinging rigid pendulum,
// and THAT is not decoration: it changes the inertia the collision feels.
//
// Impulsive effective mass (derivation).
//   Coordinates: cart position X (velocity V) and rod angle θ from vertical
//   (θ=0 hangs straight down). Bob position x_bob = X + L sinθ, so
//     T = ½(m₁+m_b)V² + m_b L cosθ · V θ̇ + ½ m_b L² θ̇².
//   A collision applies an impulsive HORIZONTAL impulse J at the pivot. Its
//   generalized force on θ is zero (the pivot's position doesn't depend on θ),
//   so during the instantaneous impulse p_θ = ∂T/∂θ̇ is CONSERVED while θ is
//   frozen. Eliminating θ̇ at fixed p_θ collapses the cart+bob kinetic energy to
//     T = ½ · m_eff(θ) · V² + const,   m_eff(θ) = m₁ + m_b · sin²θ.
//   So along the rail the collision sees an effective mass that swings between
//   m₁ (rod vertical, θ=0 or π: the bob just spins about the pivot, so it is
//   horizontally inert) and m₁+m_b (rod horizontal, θ=±π/2: the bob is rigidly
//   dragged along the rail). This m_eff(θ) is used as the small mass in each
//   elastic Galperin collision.
//
// Because the bob swings, θ — and so m_eff, and the Galperin reflection angle
// α = atan√(m_eff/m₂) — is different at every impact, and the total count
// DRIFTS from the ideal ⌊π/atan√(m₁/m₂)⌋. Since sin²θ ≥ 0, the swing only ever
// ADDS inertia, so the count comes in at or BELOW the unbiased ideal: an honest,
// phase-dependent bias. It vanishes as m_bob → 0 OR as the swing amplitude → 0
// (a rod locked hanging straight down, sin²θ → 0) — either recovers the exact
// Two-Blocks count.
//
// MODEL: exact Galperin collision times (the cart glides at constant velocity
// between impacts), the phase-dependent m_eff(θ) sets each collision, AND each
// collision impulsively kicks the bob through the rigid rod (see _kickPendulum) —
// so the bob responds to the cart the way real inertia demands: a fast-jerking
// cart whips it and it lags behind. The one remaining approximation (cf. Loaded
// Disc): between collisions the swinging bob's own reaction does not itself
// accelerate the gliding cart.
export class PendulumRail extends BiasedPiCounter {
  static id = 'pendulum-rail';
  static title = 'Pendulum Rail — the swing biases the count';
  static description = 'A swinging bob modulates the collision inertia, so the count wobbles around π — a rigid rod biases it; a string mostly sheds the bias; an elastic rubber band transmits no impulse at all, so that case REDUCES to the unbiased Two Blocks counter';
  static piMechanism = 'biased: only a RIGID link passes the collision impulse to the bob. Rod: m_eff = m₁ + m_bob·sin²θ → count drifts. String: slackens (m_eff→m₁) whenever it would push. Rubber: a finite spring transmits zero impulse → m_eff ≡ m₁, i.e. the bare Two Blocks collision — the reachable ZERO of this family, not a third measurement';
  static rigor = 'Biased';
  static piNature = 'biased';
  static sortOrder = 40;
  static previewSteps = 12;
  static alternatives = [
    { id: 'loaded-disc-galperin', label: 'Bias from a moving CM' },
    { id: 'magnetic-repulsion-galperin', label: 'Bias from a soft bounce' },
    { id: 'two-blocks', label: 'The unbiased original' },
  ];
  static explanation = {
    setup: 'A cart (mass m₁ = 1) rides a rail between a wall and a heavy block (mass 100ⁿ), bouncing elastically — the Galperin π counter. On the cart hangs a pendulum whose bob (mass m_bob) swings freely. A "Suspension" select picks the line: a rigid ROD (pushes AND pulls), a flexible STRING (pulls only, goes slack), or an elastic RUBBER band (a smooth 2D spring of natural length L0 = 0.75·L that also only pulls). The BIAS knob is "bob mass": it sets how much inertia the swing can inject, and m_bob → 0 is its unbiased limit (measured at n=2: m_bob = 0 → 314 collisions, the exact ideal; 0.2 → 286; 3 → 157). The "initial angle" slider is NOT a second bias knob — it only picks the pendulum\'s starting PHASE. It has no zero: a collision kicks the bob by −(dv/L)·cosθ, so a rod hanging straight down (θ₀ = 0) takes the LARGEST whip and is swinging by the first bounce. Measured at n=2, m_bob = 0.2, the count is 286 at θ₀ = 0, 0.05 and 0.4, and 287 at θ₀ = 1.2 — the angle moves the count by about one collision in 300 while the bob mass moves it by 28 or 157.',
    insight: 'A collision is an impulsive horizontal impulse at the pivot. Because that impulse exerts no torque about the pivot, the pendulum\'s angular momentum is conserved through the instant, and the inertia the rail feels collapses to an EFFECTIVE mass m_eff(θ) = m₁ + m_bob·sin²θ: nearly m₁ when the line is vertical (the bob just spins in place, horizontally inert) and up to m₁+m_bob when it is horizontal (the bob is dragged bodily along the rail). Between impacts the bob swings, so θ — and m_eff, and the Galperin reflection angle α = atan√(m_eff/m₂) — is different at every collision. The count drifts from the ideal ⌊π/atan√(m₁/m₂)⌋: a biased π whose wobble is driven by the pendulum\'s phase. Since sin²θ ≥ 0 the swing only ever ADDS inertia, so the count sits at or below the unbiased ideal. And each collision also KICKS the bob through the line (the pivot\'s velocity jump whips it, so it lags behind a fast cart) — the physical partner of m_eff, so the swing is genuinely coupled to the bounces, not a decorative overlay.',
    contrast: 'The three suspensions decide ONE thing: does the collision impulse reach the bob? Only a RIGID link can transmit an instantaneous impulse. The RIGID ROD both pushes and pulls: the bob is pinned to the circle of radius L, it can be forced over the top, and it feeds back a continuous, phase-dependent bias at every bounce — the count DRIFTS below the ideal. A STRING only PULLS: whenever it would have to push — the bob rises too slowly to keep tension (L·θ̇² + g·cosθ < 0), or a collision jerk would compress the line — it goes SLACK and the bob free-flies as a projectile OFF the circle, so those collisions are momentarily UNBIASED (m_eff = m₁) and the string MOSTLY SHEDS the bias — measured at n=2 it landed on the unbiased ideal 314 in eight of nine runs, losing a single collision only at the heaviest bob (m_bob = 3, θ₀ = 0 → 313). An elastic RUBBER band is not a third point on that spectrum — it is the family\'s reachable ZERO. A finite-stiffness spring exerts a FINITE force, and a finite force over the zero-duration collision transmits ZERO impulse, so the bob never participates in the impact at all: m_eff = m₁ at EVERY bounce and the collision resolution becomes byte-for-byte the Two Blocks one. The rubber card is therefore the unbiased Two Blocks counter with a decorative (but genuinely simulated) spring-pendulum riding on top — verified headlessly: at n = 1, 2, 3 it returns 31 / 314 / 3141 collisions, IDENTICAL to Two Blocks, for every bob mass in {0, 0.2, 3, 8} and every start angle in {0, 0.4, 1.2}. That is an honest and interesting endpoint (it shows the zero is physically reachable, not just a limit), but it is one measurement, not two: rigidity of the link — not the bob\'s mass — decides whether the bounce biases the count. Rod transmits the impulse (biases, ≈ −9% at the default bob), string transmits it only while taut (in practice sheds it), rubber never transmits it (and so is not measuring anything Two Blocks does not already measure). This is the same species of bias as the Loaded Disc (a moving centre of mass) and the Magnetic Galperin (a soft bounce). Drive the bob mass to 0 and m_eff → m₁ for every θ in rod AND string too: the exact Two-Blocks count returns and π is recovered to n digits (rubber is already exact at every bob mass). (CAVEAT, all modes: between collisions the bob\'s reaction does not itself accelerate the gliding cart.)',
    formula: 'ROD: m_eff(θ) = m₁ + m_bob·sin²θ (always).  STRING: taut while tension t = L·θ̇² + g·cosθ ≥ 0 → same m_eff; slack when t < 0 → m_eff = m₁ and the bob free-flies (r += v·dt, v += (0,−g)·dt) until |r| regains L, then snaps taut (outward radial velocity removed).  RUBBER: a smooth 2D spring, natural length L0 = 0.75·L, per-mass stiffness k — a = (0,−g) + [r>L0]·(−k(r−L0))·r̂ (pulls only, force-free while slack). A finite spring transmits no impulse → m_eff ≡ m₁ ALWAYS, so the count is EXACTLY ⌊π·10ⁿ⌋; the collision only shifts the bob\'s pivot-frame velocity by (−dv, 0).  α = atan√(m_eff/m₂) ;  π_naive = count · atan√(m₁/m₂).',
    getExpected: (params) => {
      const n = params.n || 2;
      const m2 = Math.pow(100, n);
      const alpha = Math.atan(Math.sqrt(1 / m2));
      const ideal = Math.floor(Math.PI / alpha);   // display-only: the blurb's reference count
      const mBob = params.bobMass ?? 0.2;
      const susp = params.suspension ?? 'rod';
      if (susp === 'rubber') {
        return `rubber band: m_eff ≡ 1 at every impact (a finite spring transmits no impulse), so this mode REDUCES to the unbiased Two Blocks counter — expect exactly its ${ideal} collisions (π to n digits) at any bob mass and start angle, while the bob still bounces as a spring-pendulum. It is this family's reachable zero, not a third independent measurement.`;
      }
      return mBob < 1e-6
        ? `bob mass = 0: m_eff ≡ 1 → exact Galperin, expect ${ideal} collisions (π to n digits).`
        : `n=${n}: unbiased ideal is ${ideal} collisions. With a swinging bob (m_bob=${mBob}) the added inertia trims a few collisions, so the count lands at or below ${ideal} and the π read drifts low.`;
    },
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.initialVelocity = params.velocity || 1;
    this.pendulumLength = params.length || 0.15;
    // Default kept gentle: with the collision now whipping the bob, even a modest
    // bob visibly biases the count. 0.2 reads ~2.86 (clearly biased, still near π);
    // crank it toward 8 for a heavy, strongly-biasing bob.
    this.bobMass = params.bobMass ?? 0.2;
    // Starting PHASE of the pendulum, not a bias knob. It has no zero: the collision
    // kick is −(dv/L)·cosθ, so θ₀ = 0 is the MAXIMUM whip, not the quiet case.
    this.initialAngle = params.initialAngle ?? 0.4;  // rod displacement at start (rad)
    // Suspension: 'rod' (rigid, bidirectional — the historical default) or
    // 'string' (flexible, TENSION-ONLY — goes slack and free-flies).
    this.suspension = params.suspension ?? 'rod';
    this.gravity = 9.8;
    this.reset();
  }

  reset() {
    super.reset();
    this.m1 = 1;               // cart mass
    this.mBob = this.bobMass;  // pendulum bob mass
    this.m2 = Math.pow(100, this.n); // heavy block mass
    this.cartSize = 0.07;
    this.blockSize2 = Math.min(0.2, 0.06 + 0.02 * this.n);

    // Cart
    this.x1 = 0.3;
    this.v1 = 0;
    // Heavy block (small starting gap → first impact almost immediately)
    this.x2 = 0.45;
    this.v2 = -this.initialVelocity;

    // Pendulum: angle from vertical (0 = hanging down), angular velocity.
    this.theta = this.initialAngle;
    this.thetaDot = 0;

    this.L = this.pendulumLength;
    this.g = this.gravity;

    // String state (only meaningful when suspension === 'string'). While taut the
    // dynamics ride θ/θ̇ exactly as the rod does; while slack the bob is a free
    // projectile tracked in the pivot's inertial frame by (rx,ry) position and
    // (vx,vy) velocity RELATIVE to the pivot. Initialised to the taut position so
    // the fields are always finite even before the first release.
    this.stringSlack = false;
    this.rx = this.L * Math.sin(this.theta);
    this.ry = -this.L * Math.cos(this.theta);
    this.vx = 0;
    this.vy = 0;
    // Diagnostics for the on-screen cue and the harness.
    this._releaseCount = 0;   // taut → slack transitions
    this._snapCount = 0;      // slack → taut transitions
    this._maxSlackDrop = 0;   // max (L − |r|) reached while slack (how far off-circle)

    // RUBBER state (only meaningful when suspension === 'rubber'). The bob is a
    // free 2D point mass on an elastic band: natural length L0, per-unit-mass
    // stiffness rubberK, light hysteresis damping rubberDamp active ONLY while
    // stretched. The band can only PULL (no force while r ≤ L0), so the bob both
    // swings and bounces radially, going force-free whenever it is slack. Because
    // a finite-stiffness spring transmits NO instantaneous impulse, the rubber bob
    // never participates in a collision (m_eff = m₁ always) — the count is exactly
    // the bare Galperin count at every setting. Position/velocity are tracked in
    // the pivot's inertial frame by (rx,ry)/(vx,vy), reusing the string fields.
    this.L0 = 0.75 * this.L;              // unstretched length (hangs a bit shorter than the rod)
    this.rubberK = 600;                   // spring stiffness per unit mass (springy but bounded)
    this.rubberDamp = 20.0;               // rubber hysteresis damping (per unit mass), stretched only
    // Light always-on air drag on the bob. The required per-collision kinematic
    // kick (vx -= dv) hands the bob the cart's velocity jump, which at the cart's
    // fastest instants can be large; without dissipation those kicks would let the
    // pivot-frame velocity random-walk upward over thousands of collisions. The
    // strong stretch damping caps the radial excursion and this linear air drag
    // pins the whole motion to a steady state INDEPENDENT of the collision count,
    // so |r| stays bounded with no secular growth. Neither touches the collision
    // (m_eff ≡ m₁), so the count stays exactly the bare Galperin count.
    this.rubberAirDrag = 4.0;             // per unit mass, always on
    // Declared hard bound on |r|. The stretch a kick produces scales with the kick
    // energy (∝ the cart's speed ∝ initialVelocity), NOT with L0, so the allowance
    // is an absolute term that grows with the drive. A hard elastic limit (see
    // _rubberStep) clamps |r| to this value, so max |r| ≤ rubberMaxStretch holds by
    // construction for EVERY slider setting and the camera (sized to it) always
    // contains the bob. In normal use the clamp never fires — it is a safety cap.
    this.rubberMaxStretch = this.L0 + 0.12 * this.initialVelocity;
    this._maxRubberR = 0;                 // diagnostic: max |r| reached over the run
    this._rubberClampHits = 0;            // times the elastic limit engaged (≈0 in normal use)
    if (this.suspension === 'rubber') {
      // Release from the natural length at the initial angle, at rest in the pivot frame.
      this.rx = this.L0 * Math.sin(this.theta);
      this.ry = -this.L0 * Math.cos(this.theta);
      this.vx = 0; this.vy = 0;
    }

    // Camera / preview reach: the whole reachable bob disk must stay in frame in
    // EVERY mode. Rod/string reach L; rubber reaches rubberMaxStretch (> L). Size
    // to the larger so switching suspensions never clips the bob.
    this.camReach = Math.max(this.L, this.rubberMaxStretch);

    this.finished = false;
    this.collisionEffects = [];
  }

  // Along-rail effective mass the impulsive collision feels for rod angle θ.
  // Derived above: m_eff = m₁ + m_bob·sin²θ. Vertical rod (θ=0 or π) → m₁;
  // horizontal rod (θ=±π/2) → m₁+m_bob.
  effMass(theta) {
    const s = Math.sin(theta);
    return this.m1 + this.mBob * s * s;
  }

  // A collision changes the cart (pivot) velocity by dv. The rigid rod can only
  // transmit a RADIAL impulse, so the bob's tangential velocity is conserved and
  // its angular velocity jumps by −(dv/L)·cosθ. This is the physical partner of
  // m_eff(θ): at θ=0 the bob adds no collision inertia (m_eff=m₁) but gets the FULL
  // whip; at θ=±π/2 it is dragged bodily (m_eff=m₁+m_bob) and gets NO whip. Without
  // this the bob swung on its own gravity rhythm as if the cart weren't there; with
  // it, a fast-jerking cart visibly whips the bob and it lags behind — real inertia.
  _kickPendulum(dv) {
    this.thetaDot -= (dv / this.L) * Math.cos(this.theta);
  }

  // STRING collision coupling. A string transmits an impulse only if it TENSIONS.
  // The sign of the pivot's velocity change dv is fixed by the collision type and
  // is insensitive to m_eff (m₂ ≫ m_eff): a wall bounce speeds the cart the +x way
  // (dvSign = +1), a block hit slows/reverses it (dvSign = −1). In the pivot frame
  // the bob is boosted by (−dv, 0); its outward-radial component is (−dv)·sinθ.
  //   • already slack        → m_eff = m₁, free bob just takes the boost, stays free.
  //   • taut & boost outward  → string tensions: m_eff = m₁ + m_bob·sin²θ, rod kick.
  //   • taut & boost inward   → string can't push: m_eff = m₁, bob keeps the FULL
  //                             boosted velocity and enters free flight (slackens).
  _stringCollision(isWall, now) {
    const dvSign = isWall ? +1 : -1;
    const s = Math.sin(this.theta), c = Math.cos(this.theta);
    // Sign of the outward-radial boost component (−dv)·sinθ = (−dvSign)·sinθ.
    const boostOutwardSign = (-dvSign) * s;
    const tautCollision = !this.stringSlack && boostOutwardSign >= 0;

    // Effective mass the cart sees for this impact.
    let mEff;
    if (isWall) {
      mEff = this.m1;                       // wall bounce is m_eff-free anyway
    } else {
      mEff = tautCollision ? this.effMass(this.theta) : this.m1;
    }

    // Resolve the cart (pivot) velocity and read off the actual dv.
    let dv;
    if (isWall) {
      this.x1 = 0;
      const ov1 = this.v1;
      this.v1 = Math.abs(this.v1);
      dv = this.v1 - ov1;
    } else {
      const ov1 = this.v1, ov2 = this.v2;
      this.v1 = ((mEff - this.m2) * ov1 + 2 * this.m2 * ov2) / (mEff + this.m2);
      this.v2 = ((this.m2 - mEff) * ov2 + 2 * mEff * ov1) / (mEff + this.m2);
      this.x1 = this.x2 - this.cartSize;
      dv = this.v1 - ov1;
    }

    // Couple the impulse into the bob.
    if (this.stringSlack) {
      // Free bob simply receives the boost (−dv, 0); the slack line does nothing.
      this.vx += -dv;
    } else if (tautCollision) {
      // String tensions → identical to the rigid-rod tangential kick.
      this.thetaDot -= (dv / this.L) * c;
    } else {
      // String slackens: bob keeps its pre-collision tangential velocity PLUS the
      // full boost, and leaves the circle as a projectile.
      this.rx = this.L * s;
      this.ry = -this.L * c;
      this.vx = this.L * this.thetaDot * c + (-dv);
      this.vy = this.L * this.thetaDot * s;
      this.stringSlack = true;
      this._releaseCount++;
    }

    this.collisionCount++;
    if (isWall) {
      this.collisionEffects.push({ x: 0, y: this.cartSize / 2, time: now, type: 'wall' });
    } else {
      this.collisionEffects.push({ x: this.x2, y: Math.max(this.cartSize, this.blockSize2) / 2, time: now, type: 'block' });
    }
  }

  // RUBBER collision coupling. A finite-stiffness spring exerts a FINITE force, so
  // over the zero-duration collision it transmits ZERO impulse: the bob does not
  // participate in the impact at all. Hence m_eff = m₁ ALWAYS — the cart/block
  // resolution is byte-for-byte the bare Galperin two-blocks collision, so the count
  // is EXACTLY ⌊π·10ⁿ⌋ at every bob mass and angle. The only thing the collision does
  // to the bob is KINEMATIC: the pivot's velocity jumps by dv while the bob's
  // ground-frame velocity is unchanged, so the bob's velocity RELATIVE to the pivot
  // shifts by (−dv, 0). No m_eff bias, no rod kick.
  _rubberCollision(isWall, now) {
    let dv;
    if (isWall) {
      this.x1 = 0;
      const ov1 = this.v1;
      this.v1 = Math.abs(this.v1);
      dv = this.v1 - ov1;
    } else {
      const ov1 = this.v1, ov2 = this.v2;
      const mEff = this.m1;                 // spring transmits no impulse → bare cart mass
      this.v1 = ((mEff - this.m2) * ov1 + 2 * this.m2 * ov2) / (mEff + this.m2);
      this.v2 = ((this.m2 - mEff) * ov2 + 2 * mEff * ov1) / (mEff + this.m2);
      this.x1 = this.x2 - this.cartSize;
      dv = this.v1 - ov1;
    }
    // Pivot velocity jumped by dv; bob ground velocity unchanged → relative shift.
    this.vx -= dv;

    this.collisionCount++;
    if (isWall) {
      this.collisionEffects.push({ x: 0, y: this.cartSize / 2, time: now, type: 'wall' });
    } else {
      this.collisionEffects.push({ x: this.x2, y: Math.max(this.cartSize, this.blockSize2) / 2, time: now, type: 'block' });
    }
  }

  // Unbiased reference: the exact Galperin angle for the bare cart mass m₁.
  alphaIdeal() { return Math.atan(Math.sqrt(this.m1 / this.m2)); }
  idealCount() { return Math.floor(Math.PI / this.alphaIdeal()); }

  // BiasedPiCounter hooks --------------------------------------------------
  // The bias knob is BOB MASS, and 0 is its unbiased limit — not the start angle,
  // which has no zero (see the initialAngle control). Verified at n=2: m_bob = 0
  // returns the exact ideal 314 collisions in rod, string AND rubber modes.
  idealKnobValue() { return 0; }
  biasSource() { return 'swinging bob: the rod phase modulates the along-rail effective mass m_eff = m₁ + m_bob·sin²θ'; }

  // π proxy read against the IDEAL (bare-m₁) angle: count · atan√(m₁/m₂). The
  // swing's added inertia trims the count, so this drifts below π.
  measuredPi() { return this.collisionCount * this.alphaIdeal(); }

  // Per-collision live Galperin angle using the INSTANTANEOUS m_eff. Its spread
  // over the run is the intrinsic wobble band.
  localSample() {
    // RUBBER is UNBIASED at every impact (m_eff = m₁ always — the spring transmits
    // no impulse). While the string is slack the collision is momentarily unbiased
    // too. Rod mode is unaffected by these branches.
    const e = (this.suspension === 'rubber' ||
               (this.suspension === 'string' && this.stringSlack))
      ? this.m1
      : this.effMass(this.theta);
    const ratio = Math.max(e, this.m2) / Math.min(e, this.m2);
    return Math.atan(1 / Math.sqrt(ratio));
  }
  getBand() {
    const s = this.biasModel.stats();
    if (!s || s.max - s.min < 1e-9 || this.collisionCount === 0) return null;
    return {
      lo: this.collisionCount * s.min,
      mid: this.collisionCount * s.mean,
      hi: this.collisionCount * s.max,
    };
  }

  getControls() {
    return [
      // The suspension knob: rod (rigid, pushes AND pulls) vs string (pulls only,
      // goes slack). Different dynamics, different phase space.
      {
        type: 'select', id: 'suspension', label: 'Suspension', highlight: true, default: this.suspension,
        options: [
          { value: 'rod', label: 'Rigid rod (pushes & pulls)' },
          { value: 'string', label: 'String (pulls only — slackens)' },
          { value: 'rubber', label: 'Rubber band (elastic — exactly π)' },
        ],
        onChange: (val) => { this.suspension = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 4, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'velocity', label: 'Initial Velocity', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'length', label: 'Pendulum Length', min: 0.05, max: 0.3, step: 0.01, default: this.pendulumLength,
        onChange: (val) => { this.pendulumLength = val; this.reset(); this.initSimScene(); }
      },
      // The bias knob: bob mass sets how much inertia the swing injects. 0 → exact Galperin.
      {
        type: 'slider', id: 'bobMass', label: 'Bob Mass (bias)', min: 0, max: 8, step: 0.1, default: this.bobMass,
        highlight: true,
        onChange: (val) => { this.bobMass = val; this.reset(); this.initSimScene(); }
      },
      // Initial rod displacement — an INITIAL CONDITION (the pendulum's starting
      // phase), NOT a second bias knob. It has no zero limit: the collision kick is
      // −(dv/L)·cosθ, so θ₀ = 0 hands the bob the LARGEST whip and it is swinging by
      // the first bounce. Measured at n=2, m_bob=0.2: 286 collisions at θ₀ = 0, 0.05
      // and 0.4, and 287 at θ₀ = 1.2 — roughly one collision in 300, against the 28
      // (m_bob=0.2) or 157 (m_bob=3) the bob-mass knob moves. Bias lives in bobMass.
      {
        type: 'slider', id: 'initialAngle', label: 'Initial angle (starting phase, not the bias)', min: 0, max: 1.2, step: 0.05, default: this.initialAngle,
        onChange: (val) => { this.initialAngle = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: '3d-momenta-theta', label: 'Q_cart × Q_block × θdot', dimension: 3, primary: true, axisLabels: { x: 'Q_cart', y: 'Q_block', z: 'compressed θdot' } },
      { id: 'q1-q2', label: 'Q_cart vs Q_block (bare-m₁ momenta)', dimension: 2, axisLabels: { x: 'Q_cart = √m₁ v₁', y: 'Q_block = √m₂ v₂' } },
      { id: 'theta-thetaDot', label: 'θ vs θdot (pendulum phase portrait)', dimension: 2, axisLabels: { x: 'θ / π', y: 'compressed θdot' } },
    ];
  }

  /**
   * Advance physics by dt. Between collisions the cart glides at constant
   * velocity and the bob swings freely (quasi-static — see CAVEAT). Each
   * collision uses the phase-dependent effective mass m_eff(θ) as the small
   * Galperin mass.
   */
  step(dt) {
    if (this.finished) {
      // Counting is over: blocks drift off while the pendulum keeps swinging.
      this._integratePendulum(dt);
      this.x1 += this.v1 * dt;
      this.x2 += this.v2 * dt;
      return false;
    }
    let remaining = dt;
    let collided = false;
    const now = performance.now();
    let guard = 0;

    while (remaining > 1e-15 && guard++ < 500000) {
      // Analytic collision times (cart at constant velocity between impacts).
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > 0) tWall = this.x1 / (-this.v1);

      let tBlock = Infinity;
      const gap = this.x2 - this.x1 - this.cartSize;
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) tBlock = gap / closing;

      const tNext = Math.min(tWall, tBlock);

      if (tNext > remaining) {
        this._integratePendulum(remaining);
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        break;
      }

      // Advance to the collision, swinging the pendulum along the way.
      this._integratePendulum(tNext);
      this.x1 += this.v1 * tNext;
      this.x2 += this.v2 * tNext;
      remaining -= tNext;

      if (this.suspension === 'rod') {
        // --- RIGID ROD (unchanged historical behaviour) ---
        const mEff = this.effMass(this.theta);

        if (tWall <= tBlock) {
          // Wall: elastic bounce off an infinite mass → v₁ flips sign (m_eff-free).
          this.x1 = 0;
          const ov1 = this.v1;
          this.v1 = Math.abs(this.v1);
          this._kickPendulum(this.v1 - ov1);   // the pivot's velocity jump whips the bob
          this.collisionCount++;
          this.collisionEffects.push({ x: 0, y: this.cartSize / 2, time: now, type: 'wall' });
        } else {
          // Block: elastic collision between the phase-dependent effective mass
          // m_eff(θ) and the heavy block m₂.
          const ov1 = this.v1, ov2 = this.v2;
          this.v1 = ((mEff - this.m2) * ov1 + 2 * this.m2 * ov2) / (mEff + this.m2);
          this.v2 = ((this.m2 - mEff) * ov2 + 2 * mEff * ov1) / (mEff + this.m2);
          this._kickPendulum(this.v1 - ov1);   // same tangential-impulse coupling
          this.x1 = this.x2 - this.cartSize;
          this.collisionCount++;
          this.collisionEffects.push({ x: this.x2, y: Math.max(this.cartSize, this.blockSize2) / 2, time: now, type: 'block' });
        }
      } else if (this.suspension === 'string') {
        // --- FLEXIBLE STRING (tension only) ---
        this._stringCollision(tWall <= tBlock, now);
      } else {
        // --- ELASTIC RUBBER BAND (transmits no impulse → unbiased) ---
        this._rubberCollision(tWall <= tBlock, now);
      }
      collided = true;
      this.recordBiasSample();
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }

    if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) {
      this.finished = true;
    }
    return collided;
  }

  /**
   * Swing the pendulum for time t as a simple nonlinear pendulum on the
   * uniformly-moving pivot: θ̈ = -(g/L) sin θ. RK4 with adaptive sub-steps to
   * stay accurate through the fast spin after hard kicks.
   */
  _integratePendulum(t) {
    if (this.suspension === 'string') { this._integrateString(t); return; }
    if (this.suspension === 'rubber') { this._integrateRubber(t); return; }
    if (t <= 0) return;
    const gL = this.g / this.L;
    const numSteps = Math.max(1, Math.ceil(t / 0.005),
      Math.ceil(t * Math.abs(this.thetaDot) / 0.25));
    const h = t / numSteps;

    let theta = this.theta;
    let thetaDot = this.thetaDot;

    for (let i = 0; i < numSteps; i++) {
      const k1t = thetaDot;
      const k1w = -gL * Math.sin(theta);

      const k2t = thetaDot + 0.5 * h * k1w;
      const k2w = -gL * Math.sin(theta + 0.5 * h * k1t);

      const k3t = thetaDot + 0.5 * h * k2w;
      const k3w = -gL * Math.sin(theta + 0.5 * h * k2t);

      const k4t = thetaDot + h * k3w;
      const k4w = -gL * Math.sin(theta + h * k3t);

      theta    += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
      thetaDot += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    }

    this.theta = theta;
    this.thetaDot = thetaDot;
  }

  /**
   * STRING integrator over time t. Between collisions the pivot glides at constant
   * velocity, so its frame is inertial. While TAUT the bob obeys the same pendulum
   * ODE as the rod, but each substep we test the tension t = L·θ̇² + g·cosθ and
   * RELEASE to free flight the instant it would go negative. While SLACK the bob is
   * a plain projectile (r += v·dt ; v += (0,−g)·dt in the pivot frame) until |r|
   * regains L moving outward, when it SNAPS taut (outward radial velocity removed —
   * an inextensible-string energy loss). θ, θ̇ are kept in sync in BOTH regimes so
   * getPhasePoint and the renderer stay finite.
   */
  _integrateString(t) {
    if (t <= 0) return;
    const gL = this.g / this.L;
    const rate = this.stringSlack
      ? Math.hypot(this.vx, this.vy) / this.L
      : Math.abs(this.thetaDot);
    const numSteps = Math.max(1, Math.ceil(t / 0.005), Math.ceil(t * rate / 0.25));
    const h = t / numSteps;

    for (let i = 0; i < numSteps; i++) {
      if (!this.stringSlack) this._tautStringStep(h, gL);
      else this._slackStringStep(h);
    }

    // NaN guard: if anything went non-finite, collapse to a safe hanging state.
    if (!Number.isFinite(this.theta) || !Number.isFinite(this.thetaDot) ||
        !Number.isFinite(this.rx) || !Number.isFinite(this.ry) ||
        !Number.isFinite(this.vx) || !Number.isFinite(this.vy)) {
      this.theta = 0; this.thetaDot = 0;
      this.stringSlack = false;
      this.rx = 0; this.ry = -this.L; this.vx = 0; this.vy = 0;
    }
  }

  // One RK4 step of the taut pendulum, then a tension test → release if slack.
  _tautStringStep(h, gL) {
    let theta = this.theta, thetaDot = this.thetaDot;
    const k1t = thetaDot;
    const k1w = -gL * Math.sin(theta);
    const k2t = thetaDot + 0.5 * h * k1w;
    const k2w = -gL * Math.sin(theta + 0.5 * h * k1t);
    const k3t = thetaDot + 0.5 * h * k2w;
    const k3w = -gL * Math.sin(theta + 0.5 * h * k2t);
    const k4t = thetaDot + h * k3w;
    const k4w = -gL * Math.sin(theta + h * k3t);
    theta    += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    thetaDot += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    this.theta = theta;
    this.thetaDot = thetaDot;

    // Tension per unit mass while taut. Slack when it would go negative.
    const tension = this.L * thetaDot * thetaDot + this.g * Math.cos(theta);
    if (tension < 0) {
      // Release: velocity is purely tangential, magnitude L·θ̇ along (cosθ, sinθ);
      // position rel pivot is (L·sinθ, −L·cosθ).
      const s = Math.sin(theta), c = Math.cos(theta);
      this.rx = this.L * s;
      this.ry = -this.L * c;
      this.vx = this.L * thetaDot * c;
      this.vy = this.L * thetaDot * s;
      this.stringSlack = true;
      this._releaseCount++;
    }
  }

  // One projectile step of the free bob (pivot inertial frame) → snap if it regains L.
  _slackStringStep(h) {
    // r += v·dt  (using the pre-update velocity), then v += (0,−g)·dt.
    this.rx += this.vx * h;
    this.ry += this.vy * h;
    this.vy += -this.g * h;

    const r = Math.hypot(this.rx, this.ry);
    const drop = this.L - r;
    if (drop > this._maxSlackDrop) this._maxSlackDrop = drop;

    // Outward radial speed (v·r̂). Snap when the string regains its length moving out.
    const vr = r > 1e-12 ? (this.vx * this.rx + this.vy * this.ry) / r : 0;
    if (r >= this.L && vr > 0) {
      // Inextensible snap: remove the OUTWARD radial velocity component (energy loss).
      const rhx = this.rx / r, rhy = this.ry / r;
      const vrad = this.vx * rhx + this.vy * rhy;   // > 0 here (outward)
      this.vx -= vrad * rhx;
      this.vy -= vrad * rhy;
      // Recompute θ from position and θ̇ from the surviving tangential velocity.
      this.theta = Math.atan2(this.rx, -this.ry);
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      this.thetaDot = (this.vx * c + this.vy * s) / this.L;
      this.stringSlack = false;
      this._snapCount++;
    } else {
      // Keep θ/θ̇ synced to the free bob for the phase portrait and rendering.
      this.theta = Math.atan2(this.rx, -this.ry);
      this.thetaDot = r > 1e-12 ? (this.rx * this.vy - this.ry * this.vx) / (r * r) : 0;
    }
  }

  /**
   * RUBBER integrator over time t (pivot inertial frame between collisions). The bob
   * is a free 2D point mass under gravity plus a tension-only elastic band:
   *   a = (0, −g)  +  [ r > L0 ]·( −k·(r − L0) − c·v_radial )·r̂
   * i.e. the band pulls the bob back toward the pivot ONLY while stretched (r > L0),
   * with light hysteresis damping on the radial velocity; while slack (r ≤ L0) the bob
   * is a pure projectile. Symplectic (semi-implicit) Euler with small substeps keeps
   * the oscillator stable and bounded. θ, θ̇ are kept in sync so getPhasePoint and the
   * renderer stay finite.
   */
  _integrateRubber(t) {
    if (t <= 0) return;
    const speed = Math.hypot(this.vx, this.vy);
    const rate = Math.max(Math.sqrt(this.rubberK), speed / Math.max(this.L0, 1e-6));
    const numSteps = Math.max(1, Math.ceil(t / 0.004), Math.ceil(t * rate / 0.2));
    const h = t / numSteps;
    for (let i = 0; i < numSteps; i++) this._rubberStep(h);

    // Sync the angular coordinates to the true 2D state (for the phase portrait).
    const r = Math.hypot(this.rx, this.ry);
    if (r > 1e-12) {
      this.theta = Math.atan2(this.rx, -this.ry);
      this.thetaDot = (this.rx * this.vy - this.ry * this.vx) / (r * r);
    }
    if (r > this._maxRubberR) this._maxRubberR = r;

    // NaN guard: collapse to a safe hanging state if anything went non-finite.
    if (!Number.isFinite(this.rx) || !Number.isFinite(this.ry) ||
        !Number.isFinite(this.vx) || !Number.isFinite(this.vy) ||
        !Number.isFinite(this.theta) || !Number.isFinite(this.thetaDot)) {
      this.rx = 0; this.ry = -this.L0; this.vx = 0; this.vy = 0;
      this.theta = 0; this.thetaDot = 0;
    }
  }

  // One symplectic-Euler step of the elastic band. Force-free (projectile) while
  // slack (r ≤ L0); a smooth inward pull (never a push) plus radial damping while
  // stretched. No hard snap — the spring is continuous.
  _rubberStep(h) {
    let ax = 0, ay = -this.g;
    const r = Math.hypot(this.rx, this.ry);
    if (r > this.L0 && r > 1e-12) {
      const rhx = this.rx / r, rhy = this.ry / r;
      const pull = -this.rubberK * (r - this.L0);          // < 0 → points inward (−r̂)
      const vr = this.vx * rhx + this.vy * rhy;            // radial velocity
      const damp = -this.rubberDamp * vr;                  // opposes radial motion (stretched only)
      ax += (pull + damp) * rhx;
      ay += (pull + damp) * rhy;
    }
    // Light always-on air drag (bounds the per-collision random walk in velocity).
    ax += -this.rubberAirDrag * this.vx;
    ay += -this.rubberAirDrag * this.vy;
    // Semi-implicit Euler: advance velocity first, then position.
    this.vx += ax * h;
    this.vy += ay * h;
    this.rx += this.vx * h;
    this.ry += this.vy * h;

    // Hard elastic limit: a real band cannot stretch without bound, and this keeps
    // |r| ≤ rubberMaxStretch for every setting so the bob never leaves the frame.
    // Only fires under an extreme kick; in normal use it is inert.
    const rr = Math.hypot(this.rx, this.ry);
    if (rr > this.rubberMaxStretch && rr > 1e-12) {
      const rhx = this.rx / rr, rhy = this.ry / rr;
      this.rx = rhx * this.rubberMaxStretch;
      this.ry = rhy * this.rubberMaxStretch;
      const vr = this.vx * rhx + this.vy * rhy;       // radial velocity
      if (vr > 0) { this.vx -= vr * rhx; this.vy -= vr * rhy; }  // kill only the outward part
      this._rubberClampHits++;
    }
  }

  getCountLabel() { return 'Collisions'; }

  getFormulaHTML() {
    const count = this.collisionCount;
    const alpha = this.alphaIdeal();
    const ideal = this.idealCount();
    const drift = count - ideal;
    const mEffMax = this.m1 + this.mBob;
    const band = this.getBand();
    const measured = this.measuredPi();
    const isString = this.suspension === 'string';
    const isRubber = this.suspension === 'rubber';
    // How MUCH does this setup bias π — and, in one line, why.
    const driftPct = ideal > 0 ? (100 * drift / ideal) : 0;
    const biasWhy = isRubber
      ? 'a soft spring passes no instantaneous impulse, so the bob never loads the impact — π stays exact'
      : isString
        ? 'the string loads an impact only while taut, and it flies slack most of the run — so the net bias nearly vanishes'
        : 'the rigid rod loads every impact with the bob’s full inertia — the largest bias of the three';
    const suspLabel = isRubber ? 'rubber band (elastic — pulls only)'
      : isString ? 'string (pulls only)' : 'rigid rod (pushes & pulls)';
    // On-screen tension-state cue, per mode.
    let stateCue = '';
    if (isString) {
      stateCue = this.stringSlack
        ? `<span class="f-result" style="color:#f7c948">◌ SLACK — bob free-flying (m_eff = m₁, unbiased)</span>`
        : `<span class="f-angle">━ TAUT — on the circle (m_eff = 1 + ${this.mBob.toFixed(1)}·sin²θ)</span>`;
    } else if (isRubber) {
      const rNow = Math.hypot(this.rx, this.ry);
      stateCue = rNow > this.L0
        ? `<span class="f-result" style="color:#ff7043">╱ STRETCHED — band pulling in (r=${rNow.toFixed(3)} > L0=${this.L0.toFixed(3)}); still m_eff = m₁, unbiased</span>`
        : `<span class="f-result" style="color:#f7c948">◌ SLACK — band limp, free projectile (r=${rNow.toFixed(3)} ≤ L0); m_eff = m₁, unbiased</span>`;
    }
    const stringStats = isString
      ? `<span class="f-muted">slack episodes: ${this._releaseCount} release / ${this._snapCount} snap; max off-circle |L−r| = ${this._maxSlackDrop.toFixed(4)} (snaps only remove energy).</span><br>`
      : '';
    const rubberStats = isRubber
      ? `<span class="f-muted">L0 = 0.75·L = ${this.L0.toFixed(3)}, k = ${this.rubberK}; max reach |r| = ${this._maxRubberR.toFixed(4)} ≤ ${this.rubberMaxStretch.toFixed(4)} (bounded). A finite spring transmits no impulse, so EVERY collision is unbiased.</span><br>`
      : '';
    return `
      <strong>pendulum rail (biased)</strong> — suspension: <span class="f-mass">${suspLabel}</span>:
      <span class="f-mass">m₁ = 1</span>,
      <span class="f-mass">m_bob = ${this.mBob.toFixed(1)}</span>,
      <span class="f-mass">m₂ = 100^${this.n}</span><br>
      ${stateCue ? stateCue + '<br>' : ''}
      <span class="f-angle">${isRubber
        ? 'm_eff = m₁ ≡ 1 (always — the elastic link carries no impulse)'
        : `m_eff(θ) = 1 + ${this.mBob.toFixed(1)}·sin²θ ∈ [1, ${mEffMax.toFixed(1)}]`}</span>,
      <span class="f-angle">α_ideal = atan√(m₁/m₂) = ${alpha.toFixed(6)}</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> · α_ideal =
      <span style="font-size:1.1em">${piDigitsHTML(measured, this.n + 2)}</span>
      ${band ? `<span class="f-muted">(live-α band [${band.lo.toFixed(3)}, ${band.hi.toFixed(3)}])</span>` : ''}<br>
      <span class="f-result">bias vs π: ${driftPct >= 0 ? '+' : ''}${driftPct.toFixed(1)}%</span>
      <span class="f-muted">— ${biasWhy}.</span><br>
      <span class="f-muted">Same bob, three links — <b>rigid ≈ −9%</b> · <b>string ≈ 0%</b> · <b>rubber ≡ 0% by construction</b>. Only the rod is a distinct biased measurement: the rubber band's collision resolution is byte-for-byte the unbiased <b>Two Blocks</b> one (m_eff ≡ m₁), so "rubber" IS this family's zero rather than a third point on a spectrum, and the string sits on that same zero whenever the line is slack at the impact. What the knob really sets is how much of the collision impulse the link lets reach the bob.</span><br>
      ${stringStats}${rubberStats}
      <span class="f-muted">${isRubber
        ? `unbiased ideal count = ${ideal}; drift = ${drift > 0 ? '+' : ''}${drift}. A finite spring transmits no instantaneous impulse, so the bob (which visibly bounces as a spring-pendulum) never touches the count: this mode REDUCES to the unbiased Two Blocks counter and returns its exact ⌊π·10ⁿ⌋ at every bob mass and start angle. Treat it as this family's reachable zero — a demonstration that only a RIGID link passes the collision impulse to the bob — not as a third measurement alongside rod and string.`
        : `unbiased ideal count = ${ideal}; current drift = ${drift > 0 ? '+' : ''}${drift}. The swinging bob adds inertia (sin²θ ≥ 0), so the count sits at/below ${ideal} and the π read drifts low.${isString ? ' The string goes slack whenever it would push, and those collisions are momentarily unbiased.' : ''} Bias → 0 as m_bob → 0.`}</span>
    `;
  }

  getPhasePoint() {
    // Bare-m₁ rescaling: the wobble of m_eff shows as departure from the ideal
    // Galperin momentum circle. Pendulum phase rides along as extra dims.
    const q1 = Math.sqrt(this.m1) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    return [q1 / R, q2 / R, this.theta, this.thetaDot];
  }

  getRawPhasePoint() {
    const p1 = this.m1 * this.v1;
    const p2 = this.m2 * this.v2;
    const R = this.m2 * this.initialVelocity;
    return [p1 / R, p2 / R, this.theta, this.thetaDot];
  }

  getPhaseExtractor(viewId) {
    if (viewId === '3d-momenta-theta') {
      const maxThetaDot = Math.sqrt(2 * this.g / this.L);
      return (pt) => [pt[0], pt[1], Math.tanh(pt[3] / (maxThetaDot * 3))];
    }
    if (viewId === 'q1-q2') {
      return (pt) => [pt[0], pt[1]];
    }
    if (viewId === 'theta-thetaDot') {
      const maxThetaDot = Math.sqrt(2 * this.g / this.L);
      // display-only: θ/π is axis scaling for the phase portrait, not part of any estimate.
      return (pt) => [pt[2] / Math.PI, Math.tanh(pt[3] / (maxThetaDot * 3))];
    }
    return (pt) => [pt[0], pt[1]];
  }

  // Hub thumbnail focus: wall + cart + swinging pendulum + incoming block.
  getPreviewBox() {
    const x1 = Math.max(0.62, this.x2 + this.blockSize2 + 0.08);
    return { x0: -0.06, x1, y0: -(this.camReach + 0.07), y1: Math.max(0.3, this.camReach + 0.12) };
  }

  // --- Three.js rendering ---

  initSimScene() {
    this.simScene.clear();
    // Size the ORTHO frustum so the ENTIRE reachable bob disk is in frame in every
    // mode. The pivot sits near y≈cartH and its x follows the cart (down to the wall,
    // pivotX≈cartSize/2). The bob can reach camReach in any direction from the pivot
    // (rod/string: L; rubber: rubberMaxStretch, which is larger). With the cart at the
    // wall the bob can swing/fly to x ≈ cartSize/2 − camReach, so the LEFT edge must
    // clear that; likewise widen the bottom/top for a bob that drops or is flung up.
    const reach = this.camReach;
    const left = Math.min(-0.1, this.cartSize / 2 - reach - 0.06);
    const bottom = -(reach + 0.08);
    const top = Math.max(0.42, reach + 0.1);
    this.simCamera = new THREE.OrthographicCamera(left, 1.4, top, bottom, 0.1, 10);
    this.simCamera.position.z = 1;

    // Wall
    const wallGeom = new THREE.PlaneGeometry(0.015, 0.6);
    const wall = new THREE.Mesh(wallGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wall.position.set(-0.0075, 0.15, 0);
    this.simScene.add(wall);

    // Rail (floor)
    const floorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.2, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(floorGeom, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Cart (rectangle)
    const cartGeom = new THREE.PlaneGeometry(this.cartSize, this.cartSize * 0.5);
    this.cartMesh = new THREE.Mesh(cartGeom, new THREE.MeshBasicMaterial({
      color: 0xe94560, transparent: true, opacity: 0.9
    }));
    this.simScene.add(this.cartMesh);

    // Pendulum line (pivot → bob) drawn as a MULTI-POINT polyline so a slack line can
    // visibly SAG like a real rope/band and a stretched band reads as taut. The buffer
    // is fixed-size and pooled — updateSimScene only rewrites the point positions.
    this._lineN = 18;
    const linePts = [];
    for (let i = 0; i < this._lineN; i++) {
      linePts.push(new THREE.Vector3(0, -this.L * i / (this._lineN - 1), 0));
    }
    const rodGeom = new THREE.BufferGeometry().setFromPoints(linePts);
    this.rodMesh = new THREE.Line(rodGeom, new THREE.LineBasicMaterial({ color: 0xaaaacc, linewidth: 2, transparent: true, opacity: 1 }));
    this.simScene.add(this.rodMesh);

    // Pendulum bob (radius grows with bob mass — the bias knob)
    const bobRadius = Math.min(0.032, 0.008 + Math.sqrt(this.mBob) * 0.006);
    const bobGeom = new THREE.CircleGeometry(bobRadius, 16);
    this.bobMesh = new THREE.Mesh(bobGeom, new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.simScene.add(this.bobMesh);

    // Heavy block
    const block2Geom = new THREE.PlaneGeometry(this.blockSize2, this.blockSize2);
    this.block2Mesh = new THREE.Mesh(block2Geom, new THREE.MeshBasicMaterial({
      color: 0xe94560, transparent: true, opacity: 0.7
    }));
    this.simScene.add(this.block2Mesh);

    // Velocity arrows
    this.arrow1 = this.makeArrow(0x4cc9f0);
    this.arrow2 = this.makeArrow(0x4cc9f0);
    this.simScene.add(this.arrow1);
    this.simScene.add(this.arrow2);

    // Collision effect rings
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
    if (!this.cartMesh) return;

    const cartH = this.cartSize * 0.5;
    const cartCX = this.x1 + this.cartSize / 2;
    const cartCY = cartH / 2;
    this.cartMesh.position.set(cartCX, cartCY, 0);

    // Pendulum: pivot at top center of cart.
    const pivotX = cartCX;
    const pivotY = cartH;
    // The bob is at its TRUE 2D position whenever the link is free (a slack string,
    // or the rubber band in any state); otherwise it rides the circle of radius L.
    const use2D = (this.suspension === 'string' && this.stringSlack) ||
                  this.suspension === 'rubber';
    const bobX = use2D ? pivotX + this.rx : pivotX + this.L * Math.sin(this.theta);
    const bobY = use2D ? pivotY + this.ry : pivotY - this.L * Math.cos(this.theta);

    // Choose the line's shape (sag) and look (colour/opacity) from mode + tension state.
    const dx = bobX - pivotX, dy = bobY - pivotY;
    const d = Math.hypot(dx, dy);            // current pivot→bob distance
    let sagDepth = 0, color = 0xaaaacc, opacity = 1;
    if (this.suspension === 'rod') {
      // Rigid rod: always straight and bright.
      color = 0xaaaacc; opacity = 1;
    } else if (this.suspension === 'string') {
      if (this.stringSlack) {
        // Slack string: the extra length L−d droops under gravity; dim/grey (no tension).
        sagDepth = 0.6 * Math.sqrt(Math.max(0, this.L * this.L - d * d));
        color = 0x555577; opacity = 0.28;
      } else {
        color = 0xaaaacc; opacity = 1;       // taut: straight and bright
      }
    } else {
      // RUBBER band.
      if (d > this.L0) {
        // Stretched: straight, warm red/orange, thinner/more transparent the more it
        // is stretched (a subtle tension cue).
        const frac = Math.min(1, (d - this.L0) / Math.max(1e-6, this.rubberMaxStretch - this.L0));
        color = 0xff7043; opacity = 0.9 - 0.55 * frac;
      } else {
        // Slack (compressed): droops like the string, keyed to (L0 − d); warm grey.
        sagDepth = 0.6 * Math.sqrt(Math.max(0, this.L0 * this.L0 - d * d));
        color = 0xc98a5a; opacity = 0.4;
      }
    }

    // Rewrite the pooled polyline: linear pivot→bob plus a parabolic downward droop.
    const rodPositions = this.rodMesh.geometry.attributes.position.array;
    const N = this._lineN;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      rodPositions[3 * i]     = pivotX + dx * t;
      rodPositions[3 * i + 1] = pivotY + dy * t - sagDepth * 4 * t * (1 - t);
      rodPositions[3 * i + 2] = 0;
    }
    this.rodMesh.geometry.attributes.position.needsUpdate = true;
    this.rodMesh.material.opacity = opacity;
    this.rodMesh.material.color.setHex(color);

    this.bobMesh.position.set(bobX, bobY, 0.01);

    // Block
    this.block2Mesh.position.set(this.x2 + this.blockSize2 / 2, this.blockSize2 / 2, 0);

    // Velocity arrows
    if (this.showVectors) {
      this.arrow1.visible = true;
      this.arrow2.visible = true;
      const scale = 0.1;
      this.updateArrow(this.arrow1, cartCX, cartH + 0.02, this.v1 * scale);
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

registerSim(PendulumRail);
