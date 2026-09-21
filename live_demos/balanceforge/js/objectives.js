// BalanceForge — objectives (reward functions).
// An objective consumes a kinematics snapshot and returns a per-step reward.
// Each setup provides kinematics; objectives are setup-agnostic.

(function (BF) {
  'use strict';

  // Kinematics is documented in setups.js: { cartX, cartVx, chainAvg, chainSum,
  //   chainHeight, tipX, tipY, tipAngle, tipSpeedSq, energy, numSegments }

  function center(kin) {
    return 1 - Math.min(1, Math.abs(kin.cartX) / 240);
  }
  function calm(kin, k) {
    return 1 / (1 + (k || 0.0005) * kin.tipSpeedSq);
  }
  function wrap(a) {
    // O(1) + Infinity-safe (see util.js wrapAngle): the old while-loop form
    // hung the main thread forever if a diverged sim handed it Infinity.
    return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  }

  // chain_stroke tuning constants. Overridable per-run via objectiveParams
  // (strokeCoverTotal / strokeCostK / strokeOutsideRate / strokeApproach) so the
  // validation harness can sweep them without editing this file. The shipped
  // values are the ones that reproduce the required ordering — see the
  // chain_stroke comment block.
  const DEF_STROKE_COVER    = 10;    // total credit for a complete, clean, one-stroke drawing
  const DEF_STROKE_K        = 0.08;  // stroke-count discount: eff = 1/(1+K·(n−1))
  const DEF_STROKE_QUALPOW  = 2;     // precision discount exponent: qual = (1 − meanOffLine)^P
  const DEF_STROKE_COVPOW   = 2;     // coverage exponent: finishing > polishing a fragment
  const DEF_STROKE_APPROACH = 0.1;   // per second, ×(1 − d/far): dense cold-start bootstrap

  // chain_trace_ordered tuning constants. Same override convention as
  // chain_stroke (orderedAdvanceTotal / orderedOutsideRate / orderedShapeRate
  // in objectiveParams) so the validation harness can sweep them without
  // editing this file. The shipped values are the ones that reproduce the
  // required ordering — see the chain_trace_ordered comment block.
  const DEF_ORD_ADVANCE = 10;   // total credit for claiming the whole curve IN ORDER
  const DEF_ORD_OUTSIDE = 1.0;  // per second the tip spends off the curve band entirely
  const DEF_ORD_SHAPE   = 1.0;  // ×(px closed toward the frontier)/shapeRef — potential-based

  const OBJECTIVES = {
    balance_up: {
      id: 'balance_up',
      label: 'Balance upright',
      formula: 'mean(cos θᵢ) + 0.3·center + 0.2·calm   per second',
      describe(params) {
        return 'Reward = average of cos(angle from up) across every joint, plus a center-on-rail bonus and a low-velocity bonus. ' +
               'Maximum is roughly 1.5 per second. A motionless hanging chain scores about 0 per second.';
      },
      reward(kin, dt) {
        return (kin.chainAvg + 0.3 * center(kin) + 0.2 * calm(kin)) * dt;
      },
      requiresParam: null,
      // Reward shape ceiling — used by the curriculum gate to decide
      // when fitness is "good enough" at the current level. For
      // continuous rewards, this is per-second; the trainer multiplies
      // by evalSeconds. (See objectiveCeiling helper in trainer.)
      maxPerSec: 1.5,
    },

    pendulum_both_above: {
      id: 'pendulum_both_above',
      label: 'Pendulum · all links above horizontal',
      formula: '0.5·min(cos θ₁, cos θ₂) + 0.5·both_above + 0.5·min(streak / 4, 1) + 0.02·center',
      describe() {
        return 'For the two-link pendulum: reward the weaker link, then uninterrupted time with BOTH links above horizontal. The hold bonus ramps over four seconds. No stillness penalty; active corrections are welcome. Acquisition can begin below horizontal. Final replay success is measured separately from this shaped training score.';
      },
      reward(kin, dt, params, scratch) {
        // tipAngle is cart-to-tip, not the last link's angle. Read the
        // minimum measured over the actual rods, including folded poses.
        const minimum = kin.minSegmentCos, above = minimum > 0;
        if (scratch) scratch.aboveStreak = above ? (scratch.aboveStreak || 0) + dt : 0;
        const streak = scratch ? scratch.aboveStreak : 0;
        return (.5 * minimum + (above ? .5 : 0) + .5 * Math.min(1, streak / 4)
          + .02 * Math.max(0, 1 - Math.abs(kin.cartX) / 240)) * dt;
      },
      requiresParam: null,
      maxPerSec: 1.52,
    },

    hang_down: {
      id: 'hang_down',
      label: 'Stable hang',
      formula: '−mean(cos θᵢ) + 0.3·center + 0.5·calm   per second',
      describe(params) {
        return 'Reward = chain pointed DOWN, plus center-on-rail bonus and a strong low-velocity bonus. ' +
               'Wins by bringing the pendulum down and damping out residual motion as fast as possible.';
      },
      reward(kin, dt) {
        return ((-kin.chainAvg) + 0.3 * center(kin) + 0.5 * calm(kin)) * dt;
      },
      requiresParam: null,
      maxPerSec: 1.8, // -chainAvg can hit ~1, plus ~0.3 + ~0.5 bonus
    },

    hold_angle: {
      id: 'hold_angle',
      label: 'Hold target angle',
      formula: 'cos(tip_angle − target) + 0.3·center + 0.2·calm   per second',
      describe(params) {
        const tgt = params && params.targetAngleDeg != null ? params.targetAngleDeg : 0;
        return `Reward = cosine similarity between the last segment's angle and a target of ${tgt}° from vertical, plus center+calm bonuses. ` +
               'Non-zero target angles are NOT equilibria — the controller must actively cancel gravity at every step.';
      },
      reward(kin, dt, params) {
        const tgt = ((params && params.targetAngleDeg != null) ? params.targetAngleDeg : 0) * Math.PI / 180;
        const err = wrap(kin.tipAngle - tgt);
        const cosErr = Math.cos(err);
        return (cosErr + 0.3 * center(kin) + 0.2 * calm(kin)) * dt;
      },
      requiresParam: 'targetAngleDeg',
      maxPerSec: 1.5,
    },

    chain_reach: {
      id: 'chain_reach',
      label: 'Chain reach (tip → target)',
      formula: '-dist(tip,target)/200·dt + 1·dt within success radius',
      describe(_params) {
        return 'Inverse-physics reward for the chain-reach scene:\n' +
               '· DENSE: -distance(tip, target) / 200 per second. Smooth\n' +
               '  gradient that pulls the tip toward the target. The /200\n' +
               '  scale makes typical distances integrate to roughly ±1/s.\n' +
               '· SPARSE: +1.0 per second whenever the tip is inside the\n' +
               '  success radius (30 px). Concentrates reward on actually\n' +
               '  reaching the goal rather than just getting close.\n' +
               '· Target is read through BF.setups.getTargetAt(state, t),\n' +
               '  so v2 (moving target / curve trace) reuses this reward.';
      },
      reward(kin, dt, _params) {
        const cr = kin.chainReach;
        // Setups without chainReach (e.g. someone selected this objective
        // against a regular pendulum) get 0 reward — non-crashing no-op.
        if (!cr) return 0;
        const dx = kin.tipX - cr.target.x;
        const dy = kin.tipY - cr.target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dense = -dist / cr.distScale;
        const sparse = (dist <= cr.successRadius) ? 1 : 0;
        return (dense + sparse) * dt;
      },
      requiresParam: null,
      // Dense term hits 0 at the target; sparse term contributes +1/s.
      // Plus headroom for trajectories where the tip lingers near 0
      // distance early. The expectedMax is mostly an HUD bar-scale anchor.
      maxPerSec: 1.0,
    },

    chain_trace: {
      id: 'chain_trace',
      label: 'Chain trace (tip → curve)',
      formula: '(1 - clamp(|tip - curve(t)| / REF, 0, 1))  per second',
      describe(_params) {
        return 'Signing-machine tracking reward (positive closeness):\n' +
               '· +1/s when the tip is exactly on the moving target curve(t),\n' +
               '  ramping to 0 once it is REF px away. REF = the scene\'s\n' +
               '  distScale = max(traceRadius, 30), so a do-nothing policy\n' +
               '  must actively track to score well. For chain-trace scenes\n' +
               '  (which set distScaleFar) 15% of the reward is a long-range\n' +
               '  approach term over the chain\'s full extension — the curve\n' +
               '  sits at mid-reach, so a fresh policy needs a gradient toward\n' +
               '  it before the sharp closeness bowl kicks in. Positive so a\n' +
               '  size-growth curriculum can cross its advance threshold.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const dx = kin.tipX - cr.target.x;
        const dy = kin.tipY - cr.target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ref = cr.distScale > 0 ? cr.distScale : 120;
        const near = 1 - Math.min(1, dist / ref);
        // Long-range approach term — ONLY for scenes that opt in via
        // distScaleFar (chain-trace); every other setup keeps the old math
        // byte-identical (rail-catcher / arm-reach / etc. also grade with
        // this objective).
        if (cr.distScaleFar > 0) {
          const far = 1 - Math.min(1, dist / cr.distScaleFar);
          return (0.85 * near + 0.15 * far) * dt;
        }
        return near * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      // Perfect tracking integrates to evalSeconds; the curriculum gate scales
      // its threshold by this (mirrors pendulum_neat_score.expectedMaxFor).
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    // Signing "paint the band" reward (#coverage): the target curve is
    // thickened into an ACCEPTABLE RANGE (a band), and the tip is graded on how
    // much of the band its swept path covers — NOT on chasing a moving cursor.
    // Validated (hand-driven + real CMA-ES): with COVER_TOTAL 8 / OUTSIDE_RATE 2
    // / band half-width 40, a precise tracer scores ~8, a do-nothing ~1.3, and a
    // "sweep everywhere" policy goes NEGATIVE (~−8) — it covers the band but
    // bleeds the outside penalty, so it can't win. Trained policies reach full
    // coverage with <3% time outside on the triangle band.
    chain_paint: {
      id: 'chain_paint',
      label: 'Chain paint (cover the band, not outside)',
      formula: '8·(fraction of band covered) − 2·(seconds the tip spends outside the band)',
      describe(_params) {
        return 'Coverage "signing" reward — no moving cursor to chase:\n' +
               '· the target curve is THICKENED into a band (acceptable range);\n' +
               '· +8 total, paid out as the tip first sweeps within the band\n' +
               '  half-width of each of the 120 band samples (full band = +8);\n' +
               '· −2 per second whenever the tip is OUTSIDE the band, counting\n' +
               '  overlap — so wandering off, or thrashing to cover space,\n' +
               '  is penalized in proportion to time spent astray. A policy\n' +
               '  that just sweeps everywhere covers the band but bleeds the\n' +
               '  outside penalty to a NEGATIVE score; only one that paints the\n' +
               '  band and stays on it wins. The band half-width is the\n' +
               '  accepting-radius knob (default 40).';
      },
      reward(kin, dt) {
        const p = kin.paint;
        if (!p) return 0;
        const COVER_TOTAL = 8, OUTSIDE_RATE = 2;
        // coverage term: dimensionless increment (already area-like, NOT ×dt);
        // outside term: a per-second time penalty (×dt). See the validation.
        return COVER_TOTAL * (p.newlyThisStep / p.NS)
             - (p.outsideThisStep ? OUTSIDE_RATE * dt : 0);
      },
      requiresParam: null,
      maxPerSec: 1,
      // Coverage is a one-time budget: the ceiling is COVER_TOTAL (=8) no matter
      // how long the eval runs (you can only paint the band once). The
      // curriculum advance gate scales its threshold by this.
      expectedMaxFor(_evalSeconds) { return 8; },
    },

    // Signing "as few STROKES as possible" reward (#strokes). The third and
    // strictest member of the signing family:
    //   chain_trace  — chase a moving cursor; continuity is implicit in the clock.
    //   chain_paint  — cover a band; continuity is IGNORED (credit accumulates
    //                  no matter how many disconnected dabs produced it).
    //   chain_stroke — cover the band, but every break in contact costs. The tip
    //                  is a PEN: while it is inside the band it is drawing, and
    //                  the instant it strays outside the stroke ENDS. The next
    //                  contact is a NEW stroke. A perfect signature is ONE
    //                  continuous stroke.
    //
    // The score is an EPISODE score, not a per-step rate — one drawing, judged
    // on three multiplicative modifiers of the same thing (how much of the
    // signature is on the page):
    //
    //   total(t) = COVER · coverage(t)^GAMMA · eff(strokes) · qual(meanSlop)
    //              + APPROACH · ∫ (1 − d/far) dt
    //     eff(n)  = 1 / (1 + K·(n − 1))            — the stroke-count discount
    //     qual(m) = (1 − m)^P,  m = ∫min(1,d/w)dt / elapsed   — the precision discount
    //
    // and reward(step) = total(t) − total(t − dt). The sum over the rollout
    // telescopes to exactly total(T), so fitness IS the episode score — while
    // still being a well-behaved per-step reward the trainer can accumulate.
    //
    // EVERY ONE of these four shape constants exists because a specific foil
    // beat the honest drawing without it. They were not chosen by taste:
    //
    // · eff MULTIPLICATIVE, not a flat per-stroke fee. A fee (COVER·cov − c·n)
    //   cannot satisfy the required ordering: make c big enough that 20 strokes
    //   is clearly bad, and a fully drawn 20-stroke signature scores BELOW a
    //   policy that never touched the band — absurd, it drew the whole thing.
    //   1/(1+K(n−1)) can devalue a finished drawing but never invert it.
    //
    // · qual, and P > 1. The sloppiness measure has to be TIME-INTEGRATED
    //   distance: the obvious alternative — requiring the pen to pass close to
    //   a point before it inks — was measured and does not discriminate at all
    //   (a 14s scribble passes within 10px of 98-100% of the band at every ink
    //   radius from 40px down to 10px). But P = 1 is not enough either: a
    //   scribble covers the whole band in ~2 contact episodes, so its stroke
    //   discount is 2× gentler than a 20-stroke drawing's and a linear quality
    //   term (ratio 1.73) cannot overcome that gap (2.04). P = 2 gives 3.0 and
    //   restores the ordering an eye would give.
    //
    // · qual DIVIDES BY ELAPSED TIME rather than being subtracted as an
    //   absolute penalty. An absolute −SLOP·∫min(1,d/w)dt term big enough to
    //   sink the scribble (SLOP > 1.26, measured) also makes PARKING MOTIONLESS
    //   ON THE LINE beat drawing: a parked pen has zero sloppiness forever,
    //   while any real traversal accumulates error the whole way. Normalizing
    //   makes precision a rate, so drawing more never costs more just for
    //   taking longer. (Pleasant side effect: drawing the whole thing quickly
    //   and then resting on the line dilutes the mean — the reward prefers an
    //   efficient signature, which is what a signature is.)
    //
    // · GAMMA > 1 on coverage. With the modifiers multiplicative, a pen that
    //   creeps along 33% of the curve PERFECTLY in one stroke outscores a
    //   complete 20-stroke drawing — measured 3.24 vs 3.13 on the triangle even
    //   at GAMMA = 1.5, and far worse at GAMMA = 1. "As few strokes as
    //   possible" presumes you actually did it; GAMMA = 2 puts the fragment
    //   back where it belongs (2.44 vs 3.13) and changes nothing for any
    //   trajectory that finishes, since cov = 1 raised to any power is 1.
    //
    // · APPROACH is the only additive term, and it is deliberately weak. A
    //   fresh policy hangs ~140px below the band and never touches it, so
    //   without a dense range term every genome in generation 0 scores exactly
    //   0 and there is nothing to select on.
    //
    // Note the retroactive sting that falls out of the telescoping form: when a
    // stroke breaks, the coverage ALREADY earned is re-discounted, so the step
    // reward goes momentarily negative in proportion to how much had been drawn.
    // Breaking early is cheap; breaking after a long, good stroke is expensive.
    // That is the correct incentive and it is not an accident of the encoding.
    chain_stroke: {
      id: 'chain_stroke',
      label: 'Chain stroke (draw it in as few strokes as possible)',
      formula: 'Δ[ 10·cov² · 1/(1+K·(strokes−1)) · (1 − meanOffLine)² + 0.1·∫(1−d/far)dt ]',
      describe(params) {
        const K = (params && params.strokeCostK != null) ? params.strokeCostK : DEF_STROKE_K;
        return 'Signing reward that counts STROKES — the tip is a pen:\n' +
               '· the curve is thickened into a band (half-width = the accepting\n' +
               '  radius, default 40px); inside it the pen is DOWN and drawing.\n' +
               '· stray outside and the stroke BREAKS; the next contact starts a\n' +
               '  NEW stroke. Coverage still accumulates — you never lose the ink —\n' +
               '  but the whole drawing is DISCOUNTED by 1/(1+' + K + '·(strokes−1)),\n' +
               '  so the same signature drawn in one continuous pass is worth far\n' +
               '  more than the same signature stitched from 20 dabs.\n' +
               '· the drawing is discounted AGAIN by how far off the line the pen\n' +
               '  sat on average, (1 − mean(min(1, distance/band)))² — few strokes\n' +
               '  is no excuse for not being on the curve, and because it is a\n' +
               '  MEAN and not a running bill, drawing more of the signature never\n' +
               '  costs more merely for taking longer.\n' +
               '· coverage enters SQUARED, so finishing the signature beats\n' +
               '  polishing a third of it, and a weak +0.1/s approach term gives a\n' +
               '  fresh policy a gradient before it has ever touched the curve.\n' +
               'A stroke is only counted once it actually paints something, so\n' +
               '"tap in and out" cannot reset the counter for free: every unit of\n' +
               'credit belongs to exactly one counted stroke. Pen-down and pen-up\n' +
               'use DIFFERENT radii (hysteresis) so a wobbly-but-continuous pen\n' +
               'stays one stroke instead of shredding into hundreds.';
      },
      reward(kin, dt, params) {
        const s = kin.stroke;
        if (!s) return 0;
        const COVER    = (params && params.strokeCoverTotal != null) ? params.strokeCoverTotal : DEF_STROKE_COVER;
        const K        = (params && params.strokeCostK      != null) ? params.strokeCostK      : DEF_STROKE_K;
        const P        = (params && params.strokeQualPow    != null) ? params.strokeQualPow    : DEF_STROKE_QUALPOW;
        const GAMMA    = (params && params.strokeCovPow     != null) ? params.strokeCovPow     : DEF_STROKE_COVPOW;
        const APPROACH = (params && params.strokeApproach   != null) ? params.strokeApproach   : DEF_STROKE_APPROACH;
        function total(cov, strokes, slopInt, nearInt, elapsed) {
          if (!(elapsed > 0)) return 0;    // t = 0: nothing has happened yet
          const eff  = 1 / (1 + K * Math.max(0, strokes - 1));
          const qual = Math.pow(Math.max(0, 1 - Math.min(1, slopInt / elapsed)), P);
          return COVER * Math.pow(Math.max(0, cov), GAMMA) * eff * qual + APPROACH * nearInt;
        }
        return total(s.coverage, s.strokes, s.slopInt, s.nearInt, s.elapsed)
             - total(s.prevCoverage, s.prevStrokes, s.prevSlopInt, s.prevNearInt, s.prevElapsed);
      },
      requiresParam: null,
      maxPerSec: 1,
      // WHERE THE NUMBERS LAND (CMA-ES, rigid 4-segment chain + 3 servo joints
      // + telescope, 40px band, 14s, 150 gens, 2 seeds each):
      //   trained, triangle r100   95% drawn, 2.00 strokes, 12px, score 6.5
      //   trained, figure-8 r140   91% drawn, 1.25 strokes, 20px, score 3.9
      //   dead / "still"            0% drawn, 0 strokes,   146px, score 0.76
      //   random gen-0             38% drawn, 1.9 strokes, 207px, score 0.54
      // Two things worth reading twice. First, the trained pen holds ~12px —
      // three to four times tighter than the 42-45px CEILING for cursor-chasing
      // on this same shape, because an untimed pen sets its own pace and never
      // has to be somewhere at a particular instant. Second, the random policy
      // scores BELOW the dead one despite covering 38% of the band: flailing
      // through the band collects ink, but at 207px off the line the precision
      // discount takes it all back. That is the metric behaving.
      //
      // DOES THE STROKE TERM ACTUALLY STEER? An ablation answers it directly —
      // identical world, identical observations, only K changes (2 seeds each,
      // 150 gens, final checkpoint):
      //   figure-8 r140   K = 0.08 → 1.25 strokes (1.0, 1.5), 91% drawn, 20px
      //                   K = 0    → 2.75 strokes (2.5, 3.0), 100% drawn, 23px
      //   triangle r100   K = 0.08 → 2.00 strokes;  K = 0 → 2.00 strokes
      // On the figure-8 it steers, cleanly: the arms do not overlap on a single
      // seed, and the penalty buys continuity by SPENDING coverage (91% vs
      // 100%) — precisely the trade the objective is supposed to price.
      // On the TRIANGLE it does nothing, because the count is pinned by the
      // plant. Instrumenting the pen-up events shows why: the break is always
      // on the CLIMB toward the apex (up at y≈105-116 of a 30-180 band, back
      // down at or below the apex). The chain hangs below its workspace, cannot
      // crawl up the side, and has to fling the tip, leaving the band on the
      // way. Two strokes there is hardware, not sloppiness. Choose the shape
      // accordingly: a stroke count on a curve with a fling-only region is
      // measuring the arm, not the controller.
      // The ordering itself is validated by hand-driven pen programs rather
      // than by training (1 stroke → 11.0, 5 → 7.4, 20 → 3.1, scribble → 2.5,
      // park-on-line → 1.7, dead → 0.8).
      // Like chain_paint, coverage is a one-time budget: the ceiling does not
      // grow with eval length. The approach term adds a little on top, but the
      // gate should key off the drawing, not the loitering.
      expectedMaxFor(_evalSeconds) { return DEF_STROKE_COVER; },
    },

    // ------------------------------------------------------------------
    // Third member of the signing family. What separates the three:
    //   chain_trace   — a cursor moves at a FIXED pace and the tip is graded on
    //                   how close it stays. Order is guaranteed, but only
    //                   because the cursor drags the policy along; the policy
    //                   never chooses anything about the traversal.
    //   chain_paint   — cover a band. Order is IGNORED entirely: painting the
    //                   figure-8's right lobe, then its left, then the middle,
    //                   scores exactly the same as drawing it in one pass.
    //   chain_trace_ordered — cover the band, but ONLY in the curve's own
    //                   order, at whatever pace the policy likes. There is no
    //                   cursor. The frontier waypoint waits indefinitely.
    //
    // The anti-skip property is structural, not a penalty: credit exists only
    // for the frontier waypoint. Touching waypoint 90 while the frontier is 12
    // pays nothing — not "pays less", nothing — so a cover-in-any-order policy
    // has no route to the budget at all. It is the same reason chain_paint's
    // sweeper cannot win, moved from the penalty side to the credit side.
    //
    // The other two terms only exist to make that credit reachable:
    //   · the outside-time penalty keeps the tip on the drawing (it is what
    //     separates a wrong-direction trace, which stays on the curve, from a
    //     teleporting cover, which crosses open space);
    //   · the potential-based shaping term (px CLOSED toward the frontier,
    //     normalized by chain extension) is the cold-start gradient. It is a
    //     telescoping sum of a pure function of tip position, so it cannot be
    //     farmed by parking next to the frontier — the trap that a naive
    //     "+k·(1−d/REF) per second" term would walk straight into, since the
    //     frontier, unlike a cursor, never moves away on its own.
    chain_trace_ordered: {
      id: 'chain_trace_ordered',
      label: 'Chain trace IN ORDER (self-paced, monotone along the curve)',
      formula: '10·(longest UNBROKEN in-order run / required arc) + 1.0·(px closed toward the frontier)/reach − 1.0·(seconds off the band)',
      describe(_params) {
        return 'Ordered-progress "signing" reward — no cursor, but order is enforced:\n' +
               '· the curve is sampled into 120 ORDERED waypoints and thickened\n' +
               '  into a band (half-width = the accepting radius);\n' +
               '· +10 total, paid out only as the tip reaches the FRONTIER\n' +
               '  waypoint — the next unclaimed one in the curve\'s own order.\n' +
               '  Reaching a far-ahead waypoint pays NOTHING, so "cover the shape\n' +
               '  in any order" has no route to the budget at all;\n' +
               '· credit is for the LONGEST UNBROKEN run, not the total claimed.\n' +
               '  Stray more than breakR from your own frontier and the run is\n' +
               '  abandoned; you may start a new one, but it has to beat the old\n' +
               '  one to earn anything. Without this, a cover that visits the\n' +
               '  curve\'s arcs in scrambled order — each traversed forwards —\n' +
               '  measured 75% of the waypoints and BEAT a perfect trace;\n' +
               '· the frontier NEVER advances on its own, so unlike the tracking\n' +
               '  objective there is no cursor dragging the tip along. The policy\n' +
               '  picks its own pace: sprinting the lap, taking the full rollout,\n' +
               '  and stopping dead halfway then resuming all score within 0.6;\n' +
               '· −1.0 per second the tip spends off the band entirely, so time\n' +
               '  spent flailing through open space is charged;\n' +
               '· plus a weak potential-based approach term — credit for distance\n' +
               '  CLOSED toward the frontier, debit for distance opened. It sums\n' +
               '  telescopically, so parking earns zero and backtracking costs.\n' +
               'The start point is latched on first contact (trace from wherever\n' +
               'you reach the curve), but the DIRECTION is the curve\'s own — so a\n' +
               'REVERSED trace, which chain_paint cannot distinguish from a perfect\n' +
               'one at all, lands near the bottom of the table here (measured −0.3\n' +
               'against a perfect trace\'s 11.4). It ranks BELOW an out-of-order\n' +
               'cover, not above it: on the order axis a reversal is the maximally\n' +
               'wrong answer, while a scrambled cover at least gets short stretches\n' +
               'right. Use chain_paint if you want the footprint graded instead.';
      },
      reward(kin, dt, params) {
        const o = kin.ordered;
        if (!o) return 0;
        const ADVANCE = (params && params.orderedAdvanceTotal != null) ? params.orderedAdvanceTotal : DEF_ORD_ADVANCE;
        const OUTSIDE = (params && params.orderedOutsideRate  != null) ? params.orderedOutsideRate  : DEF_ORD_OUTSIDE;
        const SHAPE   = (params && params.orderedShapeRate    != null) ? params.orderedShapeRate    : DEF_ORD_SHAPE;
        const ref = o.shapeRef > 0 ? o.shapeRef : 320;
        // advance term: dimensionless increment (a one-time budget, NOT ×dt);
        // shape term: already a per-step delta (NOT ×dt);
        // outside term: a per-second time penalty (×dt). See the validation.
        return ADVANCE * (o.advancedThisStep / (o.req > 0 ? o.req : o.NW))
             + SHAPE * (o.shapeDelta / ref)
             - (o.outsideThisStep ? OUTSIDE * dt : 0);
      },
      requiresParam: null,
      maxPerSec: 1,
      // Ordered progress is a one-time budget exactly like chain_paint's
      // coverage: you can only claim the curve once, so the ceiling does not
      // grow with eval length. A perfect run lands slightly ABOVE this (the
      // shaping term adds ~2 for a full lap on the shipped triangle) — the
      // anchor is deliberately the drawing, not the loitering.
      expectedMaxFor(_evalSeconds) { return DEF_ORD_ADVANCE; },
    },

    catch_drop: {
      id: 'catch_drop',
      label: 'Catch the drop (be under the falling dot)',
      formula: '(1 - clamp(|cart.x - dropX| / REF, 0, 1))  per second',
      describe(_params) {
        return 'Slide-under tracking reward for the catch-drop scene:\n' +
               '· +1/s when the cart is directly under the falling dot\n' +
               '  (cart.x == dropX), ramping to 0 once REF px (the scene\'s\n' +
               '  distScale) away HORIZONTALLY. The dot\'s vertical fall is\n' +
               '  ignored — only x-alignment matters — so the cart learns to\n' +
               '  be under each drop before it lands. Reuses the chain-reach\n' +
               '  target plumbing (the falling dot IS the target). Setups\n' +
               '  without a target get 0 — a non-crashing no-op.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const dx = Math.abs(kin.cartX - cr.target.x);
        const ref = cr.distScale > 0 ? cr.distScale : 120;
        return (1 - Math.min(1, dx / ref)) * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    flee_evade: {
      id: 'flee_evade',
      label: 'Flee the dot (maximize the gap)',
      formula: 'min(1, |cart.x - pursuer.x| / REF)  per second',
      describe(_params) {
        return 'Reactive-evasion reward — the NEGATION of catch_drop closeness:\n' +
               '· +1/s once the cart is at least REF px (the scene\'s distScale)\n' +
               '  clear of the pursuing dot horizontally, ramping down to 0 as\n' +
               '  the pursuer closes in. Saturates at REF so there is no pull\n' +
               '  toward the rail edge. Reuses the chain-reach target as the\n' +
               '  pursuer. Setups without a target get 0 — a non-crashing no-op.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const gap = Math.abs(kin.cartX - cr.target.x);
        const ref = cr.distScale > 0 ? cr.distScale : 160;
        return Math.min(1, gap / ref) * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    vel_match: {
      id: 'vel_match',
      label: 'Cruise control (match commanded speed)',
      formula: '(1 - clamp(|cart.vx - target.vx| / REF, 0, 1))  per second',
      describe(_params) {
        return 'Velocity-domain tracking (not position):\n' +
               '· +1/s when the cart\'s velocity equals the dot\'s commanded\n' +
               '  cruise velocity (read from kin.velTarget, px/s), ramping to 0\n' +
               '  once REF = 400 px/s apart. The cart must drive its own speed\n' +
               '  to match the dot\'s, not chase its position. Setups without a\n' +
               '  commanded velocity (velTarget == null) get 0 — a no-op.';
      },
      reward(kin, dt) {
        if (kin.velTarget == null) return 0;
        const REF = 400;
        return (1 - Math.min(1, Math.abs(kin.cartVx - kin.velTarget) / REF)) * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    zone_keep: {
      id: 'zone_keep',
      label: 'Safe zone (stay inside the drifting band)',
      formula: '(1 - clamp(max(0, |cart.x - center| - half) / REF, 0, 1))  per second',
      describe(_params) {
        return 'Zone-keeping reward — a flat-topped plateau, not a point:\n' +
               '· +1/s anywhere INSIDE the band (|cart.x - center| <= half),\n' +
               '  ramping down to 0 once the cart is REF px (distScale) beyond\n' +
               '  the band edge. center = chainReach.target.x (drifts); half =\n' +
               '  chainReach.successRadius (the band half-width). The skill is\n' +
               '  staying within the moving zone. Setups without a target get 0.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const half = cr.successRadius != null ? cr.successRadius : 55;
        const e = Math.max(0, Math.abs(kin.cartX - cr.target.x) - half);
        const ref = cr.distScale > 0 ? cr.distScale : 120;
        return (1 - Math.min(1, e / ref)) * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    tag_sequence: {
      id: 'tag_sequence',
      label: 'Tag sequence (touch the lit posts in order)',
      formula: '(1 - clamp(|cart.x - lit| / REF, 0, 1))·dt  +  1 per post tagged',
      describe(_params) {
        return 'Self-paced waypoint reward:\n' +
               '· DENSE guide: +1/s closeness to the currently-lit post\n' +
               '  (chainReach.target), ramping to 0 at REF px (distScale).\n' +
               '· TAG BONUS: +1 the step the cart touches the lit post and the\n' +
               '  cycle advances (kin.tagJustHappened). The bonus is what makes\n' +
               '  ADVANCING worth it — without it, touching the post (which jumps\n' +
               '  the target away) loses closeness reward, so a greedy policy\n' +
               '  would hover just outside the radius forever. Setups without a\n' +
               '  target get 0.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const dx = Math.abs(kin.cartX - cr.target.x);
        const ref = cr.distScale > 0 ? cr.distScale : 240;
        let r = (1 - Math.min(1, dx / ref)) * dt;
        if (kin.tagJustHappened) r += 1.0;
        return r;
      },
      requiresParam: null,
      maxPerSec: 3,   // closeness ~1/s + a few tags/s
    },

    reach_avoid: {
      id: 'reach_avoid',
      label: 'Reach around an obstacle',
      formula: 'closeness(tip,target) − soft repulsion from the obstacle   per second',
      describe(_params) {
        return 'Reach-while-avoiding reward (arm-obstacle scene):\n' +
               '· +1/s closeness as the hand nears the target (chainReach.target),\n' +
               '  ramping to 0 at distScale.\n' +
               '· SOFT REPULSION: subtracts up to ~1.2/s as the hand enters the\n' +
               '  obstacle danger zone (kin.obstacle {x,y,r} + a margin), strongest\n' +
               '  at the center — a potential field that pushes the hand AROUND the\n' +
               '  obstacle on its way to the target. Setups without a target get 0.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const dist = Math.hypot(kin.tipX - cr.target.x, kin.tipY - cr.target.y);
        let r = 1 - Math.min(1, dist / cr.distScale);
        const ob = kin.obstacle;
        if (ob) {
          const od = Math.hypot(kin.tipX - ob.x, kin.tipY - ob.y);
          const zone = ob.r + 45;
          if (od < zone) r -= 1.2 * (1 - od / zone);
        }
        return r * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    thread_slot: {
      id: 'thread_slot',
      label: 'Thread the needle (reach into a slot between walls)',
      formula: 'closeness(tip,target) − Σ CAPPED soft repulsion from each slot wall   per second',
      describe(_params) {
        return 'Thread-the-needle reward:\n' +
               '· +1/s closeness to the target inside the slot (chainReach.target),\n' +
               '  ramping to 0 at distScale.\n' +
               '· CAPPED REPULSION from EACH wall in kin.obstacles ({x,y,r}[]): a\n' +
               '  small per-wall barrier (coefficient kept well below the closeness\n' +
               '  gradient) so the two walls cancel at the slot center and the net\n' +
               '  field is a single monotone FUNNEL into the gap — the walls never\n' +
               '  push the tip back out. Setups without a target get 0.';
      },
      reward(kin, dt) {
        const cr = kin.chainReach;
        if (!cr) return 0;
        const dist = Math.hypot(kin.tipX - cr.target.x, kin.tipY - cr.target.y);
        let r = 1 - Math.min(1, dist / cr.distScale);
        const walls = kin.obstacles;
        if (walls) {
          for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            const od = Math.hypot(kin.tipX - w.x, kin.tipY - w.y);
            const zone = w.r + 25;   // tight: no repulsion at the target (which sits outside this), firm only near a wall
            if (od < zone) r -= 0.55 * (1 - od / zone);   // capped per-wall barrier (kept below the attraction)
          }
        }
        return r * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    plate_spin: {
      id: 'plate_spin',
      label: 'Plate spin (keep the ball centered + reach the target)',
      formula: '0.5·(1 - |ball offset| / halfWidth) + 0.5·(1 - |cart - target| / REF)   per second',
      describe(_params) {
        return 'Two-objective juggle for the plate-spin scene:\n' +
               '· 0.5/s for keeping the ball CENTERED in the concave tray\n' +
               '  (1 - |ball offset| / tray half-width) — jerky moves slosh the\n' +
               '  ball toward the lip and cost reward.\n' +
               '· 0.5/s for parking the cart on the drifting target\n' +
               '  (1 - |cart.x - target.x| / REF). The cart must reach the\n' +
               '  target WITHOUT spilling — accelerate smoothly. Setups without\n' +
               '  a tray + target get 0.';
      },
      reward(kin, dt) {
        const pl = kin.plate, cr = kin.chainReach;
        if (!pl || !cr) return 0;
        const ball = 1 - Math.min(1, Math.abs(pl.offset) / pl.halfWidth);
        const ref = cr.distScale > 0 ? cr.distScale : 240;
        const cart = 1 - Math.min(1, Math.abs(kin.cartX - cr.target.x) / ref);
        return (0.5 * ball + 0.5 * cart) * dt;
      },
      requiresParam: null,
      maxPerSec: 1,
      expectedMaxFor(evalSeconds) { return evalSeconds > 0 ? evalSeconds : 1; },
    },

    ball_in_hole: {
      id: 'ball_in_hole',
      label: 'Hit ball into the hole (golf)',
      formula: 'pre-hit: −0.005·tipDist + bob-approach +up to 8; on-hit: +5; opt strike-direction: +w·max(0, v·hole/400) one-shot; closest-approach: +up to 18; near-miss: +5; sunk: +30 (opt gated by directShotOnly); post-strike speed: 0.5·min(1, |v|/400)·dt + opt ballSpeedBonus; opt: −w·(bounces−1) for floor bounces past first; opt: +w·(1−|x_off|/halfW)² centered-sink bonus',
      describe(params) {
        const bsb = (params && params.ballSpeedBonus) || 0;
        let extra = '';
        if (bsb > 0) {
          extra = `\n· BALL-SPEED BONUS (currently ${bsb.toFixed(2)}): per-step continuous reward\n` +
                  `  proportional to ball speed: r += ${bsb.toFixed(2)} × |ball.v| / 400 · dt.\n` +
                  '  Adds a smooth gradient between "barely-struck ball" and "well-struck ball"\n' +
                  '  that doesn\'t depend on aim — useful when the GA is stuck on a "spin in\n' +
                  '  place" local optimum and needs to discover stronger strikes before learning\n' +
                  '  to aim them.';
        }
        const center  = (params && params.rewardCenterBonusOn);
        const bounces = (params && params.bouncePenaltyOn);
        const direct  = (params && params.directShotOnly);
        const strikeDir = (params && params.strikeDirectionRewardOn);
        let optExtras = '';
        if (center) {
          const w = (params && params.centerBonusWeight != null) ? params.centerBonusWeight : 8;
          optExtras += `\n· CENTER-SINK BONUS (on): +${w.toFixed(1)} × (1 − |x_off| / halfWidth)² when sunk.\n` +
                       '  Squared falloff prefers dead-center over rim entries; pays zero at rim.';
        }
        if (bounces) {
          const w = (params && params.bouncePenaltyWeight != null) ? params.bouncePenaltyWeight : 1;
          optExtras += `\n· BOUNCE PENALTY (on): −${w.toFixed(2)} per floor bounce past the first.\n` +
                       '  Discourages noisy multi-bounce rolls; first bounce is always free.';
        }
        if (direct) {
          optExtras += '\n· DIRECT SHOT ONLY (on): the +30 sunk anchor is gated on zero floor bounces.\n' +
                       '  All other reward channels still apply — only the terminal anchor is suppressed.';
        }
        if (strikeDir) {
          const w = (params && params.strikeDirectionWeight != null) ? params.strikeDirectionWeight : 8;
          optExtras += `\n· STRIKE-DIRECTION BONUS (on): +up to ${w.toFixed(1)} one-shot at first strike,\n` +
                       '  scaled by how well the ball\'s post-strike velocity points toward the hole.\n' +
                       '  Strikes that send the ball the wrong way pay 0 (no penalty); strikes that\n' +
                       '  point directly at the hole at 400+ px/s pay the full weight.';
        }
        return 'Reward shape for the golf scene with one-hit-lock:\n' +
               '· BEFORE the strike: small NEGATIVE shaping that rewards the bob being near the ball, PLUS\n' +
               '  a POSITIVE closest-bob-approach credit (up to +8) — each time the bob comes\n' +
               '  closer to the ball than ever before, credit a delta proportional to fraction of\n' +
               '  starting distance closed. Gives the policy a clear "you got closer to the ball"\n' +
               '  climbing signal even when it never actually lands a strike.\n' +
               '· ON the strike: +5 pulse to register commitment to a swing.\n' +
               '· AFTER the strike: continuous credit for each new closest-approach of the BALL\n' +
               '  toward the hole — reward = (1 − dist/initialDist) × 18. A ball that almost\n' +
               '  makes it gets a meaningful chunk of the +18 ceiling; a ball that ends up right\n' +
               '  at the hole rim earns nearly the full +18.\n' +
               '· STRIKE-ENERGY FLOOR: small always-on per-step reward 0.5 · min(1, |v|/400) · dt\n' +
               '  while the ball is in motion — gives a smooth gradient between "tap the ball"\n' +
               '  and "strike it hard" without requiring the user to enable ballSpeedBonus.\n' +
               '· NEAR-MISS pulse: +5 one-shot when the ball passes within hole-radius × 1.6 of\n' +
               '  the hole center (close enough to almost go in).\n' +
               '· TERMINAL: +30 the moment the ball sinks. Total ceiling around 65 for a perfect hole.' +
               optExtras + extra;
      },
      reward(kin, dt, params) {
        if (!kin.ball) return 0;
        const b = kin.ball;
        if (!b.spawned) return 0;
        let r = 0;
        // Pre-strike: shape on bob-to-ball distance so the policy learns
        // to position the club near the ball before swinging.
        if (!b.frozen) {
          const dx = kin.tipX - b.x;
          const dy = kin.tipY - b.y;
          const dist = Math.hypot(dx, dy);
          r -= 0.005 * Math.min(400, dist) * dt;
        }
        // Pre-strike CLOSEST-bob-to-ball reward: each new minimum
        // bob-to-ball distance credits a fraction of +8, normalized
        // by the starting distance so partial-progress always
        // credits proportionally. Mirrors the post-strike
        // closest-approach (ball→hole) reward but for the
        // pre-strike (bob→ball) phase. Without this, the policy
        // had only the negative "stay close" pressure and no
        // positive "you got closer" signal — getting close once
        // and drifting away kept the policy hovering at fixed
        // distance instead of trying for the strike.
        if (!b.frozen && b._state && b.minBobToBallDist != null) {
          if (b._state._initialBobBallDist == null) {
            b._state._initialBobBallDist = b.minBobToBallDist;
            b._state._creditedMinBobBallDist = b.minBobToBallDist;
          }
          if (b.minBobToBallDist < b._state._creditedMinBobBallDist) {
            const delta = b._state._creditedMinBobBallDist - b.minBobToBallDist;
            const journey = Math.max(40, b._state._initialBobBallDist);
            r += 8 * (delta / journey);
            b._state._creditedMinBobBallDist = b.minBobToBallDist;
          }
        }
        // On-strike pulse. Boosted from +1 to +5: the policy was
        // getting stuck at a "hover near ball" local optimum that
        // earned ~+8 from the bob-to-ball closest-approach reward.
        // Striking the ball was barely better (+1 strike + small
        // closest-approach delta if the ball moved a bit), so
        // mutation that found a strike pattern wasn't strongly
        // preferred. With +5 per strike, hitting the ball is a
        // clear gain over hovering even if the ball doesn't move
        // much afterward.
        if (b._state) {
          if (b._state._lastSeenHits == null) b._state._lastSeenHits = 0;
          if (b.hits > b._state._lastSeenHits) {
            r += 5.0 * (b.hits - b._state._lastSeenHits);
            b._state._lastSeenHits = b.hits;
          }
        }
        // Optional: strike-direction reward (opt-in). One-shot at first
        // strike, scaled by how well the ball's POST-strike velocity
        // points toward the hole. Pays full weight when the ball flies
        // directly at the hole at 400+ px/s; pays 0 if it goes the
        // opposite way. The bob is one-hit-locked so the first strike's
        // direction usually determines the outcome -- this surfaces
        // direction as an immediate signal rather than waiting for
        // closest-approach to register (or not).
        if (params && params.strikeDirectionRewardOn && b._state && b.hits > 0
            && !b._state._strikeDirRewarded
            && b.holeCenterX != null) {
          const w = (params.strikeDirectionWeight != null) ? params.strikeDirectionWeight : 8;
          const dx = b.holeCenterX - b.x;
          const dy = (b.holeCenterY != null ? b.holeCenterY : b.y) - b.y;
          const mag = Math.hypot(dx, dy);
          if (mag > 1e-3) {
            const ux = dx / mag, uy = dy / mag;
            const vAlong = (b.vx || 0) * ux + (b.vy || 0) * uy;
            // Pay only the positive component: wrong-direction strikes
            // earn 0, not a penalty. (Penalty would risk discouraging
            // strikes altogether; the existing pre-strike negative
            // shaping handles "don't just hover".)
            const aligned = Math.max(0, vAlong);
            r += w * Math.min(1, aligned / 400);
          }
          b._state._strikeDirRewarded = true;
        }
        // Closest-approach reward: each time the ball gets closer to
        // the hole boundary than ever before, credit a delta
        // proportional to fraction-of-journey-completed (NOT a fixed
        // 300 px range). The previous flat MAX_RANGE design had a
        // cliff: improvement only credited once distance dropped
        // below 300 px, but with a typical initial ball→hole
        // distance ~400 px, a policy that struck the ball + made it
        // travel 50 px (a clear improvement!) earned ZERO closest-
        // approach credit because the ball never dropped below
        // 300 px. Fitness gradient went flat exactly where early
        // policies were making their first gains.
        //
        // Now: capture the initial distance once, then scale credit
        // by initial-distance. Any improvement from the starting
        // position credits proportionally; full journey from start
        // to hole-region earns the full +18 cap.
        if (b._state && b.minHoleDist != null && b.hits > 0) {
          if (b._state._initialHoleDist == null) {
            // Anchor on the FIRST closest-distance after the strike
            // — that's the actual journey the ball is about to make.
            // Pre-strike the ball is just sitting there.
            b._state._initialHoleDist = b.minHoleDist;
            b._state._creditedMinDist = b.minHoleDist;
          }
          if (b.minHoleDist < b._state._creditedMinDist) {
            const delta = b._state._creditedMinDist - b.minHoleDist;
            // Scale by initial distance so partial-progress always
            // credits proportionally. Floor of 50 px so very-close
            // starts don't make a single bounce trivially earn the
            // full reward.
            const journey = Math.max(50, b._state._initialHoleDist);
            r += 18 * (delta / journey);
            b._state._creditedMinDist = b.minHoleDist;
          }
        }
        // NEAR-MISS pulse: one-shot +5 when the ball's HORIZONTAL
        // distance from the hole center drops within hole-radius × 1.6
        // (i.e. ball passes "near" the hole, even if it didn't fall
        // through). Uses x-only distance because the ball's y is
        // pinned to the floor — Euclidean distance has a constant y
        // component that would make small-hole zones impossible to
        // satisfy. Threshold scales with the actual hole width so
        // small holes get a tighter near-miss zone.
        if (b._state && b.holeDistance != null && b.holeHalfWidth != null
            && b.hits > 0 && !b._state._nearMissRewarded) {
          if (b.holeDistance <= b.holeHalfWidth * 1.6) {
            r += 5;
            b._state._nearMissRewarded = true;
          }
        }
        // Optional: per-bounce penalty. The first floor bounce is free
        // (chip shots can't always avoid it); every additional bounce
        // costs `bouncePenaltyWeight`. Paid step-by-step against a
        // credited counter so the GA gets immediate signal as bounces
        // happen, not as one lump at rollout end.
        if (params && params.bouncePenaltyOn && b._state && b.floorHits != null) {
          const credited = b._state._creditedFloorHits || 0;
          if (b.floorHits > credited) {
            const w = (params.bouncePenaltyWeight != null) ? params.bouncePenaltyWeight : 1;
            // First bounce free, every subsequent bounce penalized.
            // owed = (current bounces past the freebie) − (already-credited past the freebie)
            const owedTotal = Math.max(0, b.floorHits - 1);
            const alreadyPaid = Math.max(0, credited - 1);
            const owed = owedTotal - alreadyPaid;
            if (owed > 0) r -= w * owed;
            b._state._creditedFloorHits = b.floorHits;
          }
        }
        // Terminal: ball sunk. The +30 is gated by the optional
        // "direct shot only" flag — when on, a sink that involved any
        // floor bounces doesn't count toward the terminal anchor (every
        // other reward channel still applies, so the policy still gets
        // credit for getting the ball there, just not the 30-point
        // anchor). Forces an in-air trajectory once the policy can
        // reliably hit.
        if (b.sunk && b._state && !b._state.sunkRewarded) {
          const directOnly = !!(params && params.directShotOnly);
          const bounced = (b.floorHits || 0) > 0;
          if (!directOnly || !bounced) {
            r += 30;
            // Optional: scale a center-of-hole accuracy bonus on top of
            // the sunk reward. Squared falloff so dead-center pays the
            // full weight and rim entries pay near-zero. Only fires when
            // the directOnly gate didn't suppress the sunk reward (no
            // double-incentive to find a wonky bouncy trajectory that
            // accidentally drops in the middle).
            if (params && params.rewardCenterBonusOn && b.holeHalfWidth) {
              const w = (params.centerBonusWeight != null) ? params.centerBonusWeight : 8;
              const halfW = b.holeHalfWidth;
              const offset = b.holeDistance != null ? b.holeDistance : halfW;
              const centerScore = Math.max(0, 1 - offset / Math.max(1, halfW));
              r += w * centerScore * centerScore;
            }
          }
          b._state.sunkRewarded = true;
        }
        // Strike-energy floor — small, ALWAYS-ON gradient between "barely
        // struck" and "struck hard". The previous behavior only rewarded
        // ball speed if the user explicitly bumped ballSpeedBonus, which
        // meant out-of-the-box golf runs got stuck on "tap the ball
        // gently" because a 50 px/s drift earned nearly the same closest-
        // approach reward as a 400 px/s strike. With this baseline the
        // GA always sees "harder strike → better fitness" alongside the
        // aim-driven shaping, which is the cheapest way to break the
        // sparse-reward plateau without relying on the user finding the
        // ballSpeedBonus knob. ballSpeedBonus is still honored on top
        // for users who want stronger strike pressure.
        if (b.hits > 0) {
          const speed = Math.hypot(b.vx || 0, b.vy || 0);
          r += 0.5 * Math.min(1, speed / 400) * dt;
          const speedBonus = (params && params.ballSpeedBonus) || 0;
          if (speedBonus > 0) {
            r += speedBonus * speed / 400 * dt;
          }
        }
        return r;
      },
      requiresParam: null,
      // Reward shape ceiling — used by the curriculum gate. Total
      // possible: closest-approach +18 + bob-to-ball +8 + near-miss
      // +5 + strike-pulse +5 + strike-energy floor (~3 over a typical
      // post-strike window) + sink +30 = ~69. The pre-strike negative
      // is small (single-digit). Set to 66 as the practical upper bound.
      // (Was 60, an UNDER-estimate: measured sink rollouts score 61.8-64.2, so
      // the HUD read "global 64.1, 107%" — and because the advance gate is a
      // FRACTION of this number, under-stating it also made the gate looser
      // than intended.)
      expectedMax: 66,
      // Per-objective override of the curriculum-advance threshold
      // FRACTION. Default global is 0.7 (advance when fitness is 70%
      // of expectedMax). For ball_in_hole that means 38.5 — which
      // requires the policy to actually SINK the ball reliably. But
      // golf is a sparse-reward task: even a competent "strike + ball
      // rolls toward hole" policy scores only ~25-30 (8 bob + 5 strike
      // + ~12 closest-approach + maybe +5 near-miss). Demanding 38.5
      // means the curriculum waits for SINKS, but sinks are the LAST
      // thing the policy learns — the GA gets stuck because it can't
      // demonstrate competence at the current level.
      //
      // Using 0.4 instead → threshold ~22, which fires when the
      // policy strikes + makes meaningful progress, without requiring
      // sinks. Far better calibration for sparse-reward learning.
      //
      // 2026-08 CORRECTION — 0.40 was TOO loose and broke the curriculum's
      // meaning. MEASURED on putt-moving-hole: a complete MISS scores 11.0-34.3
      // (mean 25.2) while the 0.40 gate sat at 24, so 59% of outright misses
      // CLEARED IT. Consequence: all 4 seeds reached level 10/10 at exactly
      // generation 20 — the arithmetic minimum (10 levels × consecRequired 2) —
      // i.e. the gate never once delayed an advance, the curriculum sprinted to
      // maximum difficulty on "struck it vaguely hole-ward", and the policy
      // arrived there having never been required to sink anything. That is the
      // "it advances too fast and still fails at the end" the user reported.
      // 0.62 × 66 ≈ 41 sits ABOVE the best measured miss (34.3) and well below a
      // sink (61.8-64.2), so a level-up now requires actually holing the ball.
      // The original stalling worry is handled by (a) the curriculum starting on
      // a 400px barn door where sinking is easy, and (b) the existing
      // curriculumStuckMaxGens force-advance as a backstop.
      thresholdFrac: 0.62,
    },

    bounce_ball_out: {
      id: 'bounce_ball_out',
      label: 'Bounce ball out left or right (no drop!)',
      formula: '+0.4·alive·dt + cart-hits + terminal: +12 left/right · −6 down',
      describe(params) {
        return 'Reward shape for the "deflect, do not drop" scenario: continuous reward while the ball is still in scene, ' +
               'a per-step bonus when the ball is above the rail (so falling toward the cart costs nothing but staying low ' +
               'pays less), and a one-shot terminal: +12 + 4·|exitVx| if the ball escapes to the LEFT or RIGHT (a successful ' +
               'deflection), but −6 if it drops out the BOTTOM. Up exits get a small +4 (less ideal than horizontal but better ' +
               'than dropping). Each cart-ball impact gives a tiny +0.5 bonus to encourage active bouncing rather than passive ' +
               'positioning.';
      },
      reward(kin, dt, params) {
        if (!kin.ball) return 0;
        const b = kin.ball;
        if (!b.spawned) {
          // Tiny baseline before spawn so the policy doesn\'t get culled
          // for "doing nothing" before the ball appears.
          return 0.05 * (kin.chainAvg + 1) * dt;
        }
        let r = 0;
        // Continuous: alive bonus while ball is in scene.
        r += 0.4 * dt;
        // Per-step "above rail" bonus — reward keeping the ball ABOVE
        // the cart line. Cheap signal: positive y is below rail.
        if (b.y < 0) r += 0.3 * dt;
        // Cart-hit pulse: each new hit registers a small bonus. We track
        // last-known hit count on the ball state to detect new ones.
        if (b._state) {
          if (b._state._lastSeenHits == null) b._state._lastSeenHits = 0;
          if (b.hits > b._state._lastSeenHits) {
            r += 0.5 * (b.hits - b._state._lastSeenHits);
            b._state._lastSeenHits = b.hits;
          }
        }
        // Terminal payoff based on which way the ball exited.
        if (b.escaped && !b.terminalGiven) {
          const reason = b._state ? b._state.escapeReason : null;
          if (reason === 'left' || reason === 'right') {
            r += 12 + 4 * Math.abs(b.escapeVx) / 400;
          } else if (reason === 'up') {
            r += 4;
          } else if (reason === 'down') {
            r -= 6;
          }
          if (b._state) b._state.terminalGiven = true;
        }
        return r;
      },
      requiresParam: null,
      // Mostly continuous (alive bonus 0.4/s + above-rail 0.3/s) plus
      // terminal +12 for a horizontal escape. Per evalSeconds=8:
      //   8 × 0.7 = 5.6 (continuous) + 12 (terminal) ≈ 18 max.
      expectedMax: 16,
      // Mixed reward shape — terminal +12 dominates. Loosen the
      // threshold to 0.5 so curriculum advances when policy is
      // reliably keeping the ball alive even without bouncing it
      // out cleanly.
      thresholdFrac: 0.50,
    },

    hit_ball_back: {
      id: 'hit_ball_back',
      label: 'Hit ball back (success > speed)',
      formula: '0.3·near + 1·max(0, ball.vx)·dt + terminal: 8 if exitVx>0 else 0, +3·exitVx',
      describe(params) {
        return 'Reward shape for the "pitched" scenario: small near-bat bonus, ' +
               'continuous reward only for POSITIVE ball.vx (i.e. having sent it back rightward), ' +
               'and a one-shot terminal payoff of 8 the moment the ball exits to the right of the rail ' +
               '(plus 3× the exit speed). Successfully reversing the ball matters more than hitting it ' +
               'hard. Fitness is 0 if the ball passes through to the left.';
      },
      reward(kin, dt, params) {
        let r = 0;
        if (!kin.ball) return 0;
        const b = kin.ball;
        if (!b.spawned) return 0;
        // Tiny "stay alive" baseline so policies don't get culled before
        // the ball reaches them. Smaller than hit_ball_fast because here
        // pure stationary policies don't help — they need to actively swing.
        r += 0.02 * (kin.chainAvg + 1) * dt;
        // Proximity bonus: reward bob being close to the ball so the
        // gradient signal toward "swing toward it" emerges before the
        // policy actually connects.
        const dxBb = kin.tipX - b.x;
        const dyBb = kin.tipY - b.y;
        const dist = Math.hypot(dxBb, dyBb);
        const proximity = Math.max(0, 1 - dist / 200);
        r += 0.3 * proximity * dt;
        // Continuous: reward ONLY positive vx (heading right = "hit back").
        // Ball moving leftward (i.e. still incoming) gets zero reward.
        if (b.vx > 0) r += b.vx / 400 * dt;
        // Terminal payoff. Successfully reversing the ball is the primary
        // signal — fixed bonus of 8 just for getting it out to the right.
        // Speed adds on top but isn't the headline.
        if (b.escaped && !b.terminalGiven) {
          if (b.escapeVx > 0) {
            r += 8 + 3 * Math.abs(b.escapeVx) / 400;
          }
          // No payoff for escaping leftward (ball passed through unhit).
          if (b._state) b._state.terminalGiven = true;
        }
        return r;
      },
      requiresParam: null,
      // Continuous: 0.02/s alive + ~0.3 max proximity + ~1·dt for fast
      // ball.vx — call it ~10 for the rollout. Terminal +8 + speed bonus
      // ~3-5 = ~13 max. Total ~22.
      expectedMax: 18,
      // Sparse-ish reward (terminal-dominated). Loosen threshold so
      // policy advances on "actively striking" not "perfect terminal".
      thresholdFrac: 0.50,
    },

    hit_ball_fast: {
      id: 'hit_ball_fast',
      label: 'Hit ball, max exit speed',
      formula: '0.5·tip-near-ball + |ball.vx|·dt + terminal: 5·|escapeVx|',
      describe(params) {
        return 'Reward shape: small bonus for keeping the bob NEAR the ball (encourages contact attempts), ' +
               'continuous reward proportional to ball horizontal speed once the ball is moving, plus a one-shot ' +
               'terminal payoff = 5 × |escape velocity| when the ball leaves the scene. ' +
               'Theoretical max depends on the eval window and how fast the ball can be propelled. ' +
               'Sparse early in training — many initial policies get 0 because they never touch the ball.';
      },
      reward(kin, dt, params) {
        let r = 0;
        // Standard "stay alive on the rail" tiny baseline so policies don't
        // get culled for being dumb before they discover the ball.
        r += 0.05 * (kin.chainAvg + 1) * dt;  // 0..0.1 per second
        if (!kin.ball) return r;
        const b = kin.ball;
        if (!b.spawned) return r;
        // Proximity bonus: small reward for having the bob near the ball,
        // shaping the optimization so swing-towards-ball gradient emerges
        // even before the policy actually makes contact.
        const dxBb = kin.tipX - b.x;
        const dyBb = kin.tipY - b.y;
        const dist = Math.hypot(dxBb, dyBb);
        const proximity = Math.max(0, 1 - dist / 200);
        r += 0.5 * proximity * dt;
        // Continuous reward proportional to ball horizontal speed — encourages
        // hitting the ball as hard as possible while it's in the scene.
        r += Math.abs(b.vx) / 400 * dt;
        // Terminal payoff once the ball escapes — large one-shot reward
        // proportional to its exit horizontal velocity. Awarded exactly once
        // (terminalGiven flag on the ball state).
        if (b.escaped && !b.terminalGiven) {
          r += 5 * Math.abs(b.escapeVx) / 400;
          if (b._state) b._state.terminalGiven = true;
        }
        return r;
      },
      requiresParam: null,
      // Continuous: ~0.5/s alive+proximity + ~|vx|/400·dt up to ~1·dt.
      // Per 8s: ~12. Terminal: 5·|escapeVx|/400 ≈ ~5. Total ~17.
      expectedMax: 15,
      // Sparse-ish — let policy advance when it's actively striking
      // and producing ball motion, not just at perfect terminal speed.
      thresholdFrac: 0.50,
    },
    // ---------- Dodge survive ----------
    // Per-step alive bonus + grazing credit + death penalty. Reads
    // state.dodge.{aliveTime, nearMisses, _nearMissCredits, dead}
    // produced by the dodge setup. The reward function is given kin
    // (which doesn't know about dodge) so we cache the state ref onto
    // kin via the setup's kinematics builder -- but dodge doesn't go
    // through that path. Instead the objective peeks at the live
    // dodge struct off kin.dodge (populated below).
    dodge_survive: {
      id: 'dodge_survive',
      label: 'Survive the bullet hell (dodge)',
      formula: '+0.1·dt alive + 0.4·dt·safety + 0.5·dt·streak(2s) + 0.2/near-miss − 5 on death',
      describe(params) {
        const noDie = !!(params && params.dodgeNoDie);
        const lifespan = !!(params && params.dodgeLifespanMode);
        const hitPen = (params && params.dodgeNoDiePenalty != null) ? params.dodgeNoDiePenalty : 3;
        if (lifespan) {
          return 'Lifespan-focused reward shape (toggled by ' +
                 '"Lifespan-focused reward" in the Bullet hell panel):\n' +
                 '· ALIVE: +1.0 per second of survival. The DOMINANT signal -- ' +
                 'fitness ≈ how long the agent stayed alive.\n' +
                 '· SAFETY shaping: +0.05·dt × safe_factor. Tiny gradient hint ' +
                 'pre-first-death so the policy can move toward emptier space ' +
                 'before any survival data exists.\n' +
                 (noDie
                   ? '· HIT: −0.5 per collision in no-die mode (much smaller than ' +
                     'the default mixed-reward -3 penalty, because the foregone ' +
                     'alive bonus IS the dominant disincentive).\n'
                   : '· DEATH: −0.5 one-shot on terminal collision. Small cliff; ' +
                     'the missing alive seconds are the real penalty.\n') +
                 '· STREAK / NEAR-MISS: disabled in lifespan mode. They can be ' +
                 'gamed by sitting in an empty corner racking up "almost hit" ' +
                 'credits without actually surviving longer.';
        }
        return 'Reward shape for the dodge scene (smoothed for NEAT):\n' +
               '· ALIVE: +0.1 per second of survival. Capped at evalSeconds.\n' +
               '· SAFETY: +0.4·dt × clamp(minBulletDist / 120, 0, 1). Continuous\n' +
               '  per-step bonus tied to the distance to the nearest bullet. Gives\n' +
               '  the policy a smooth gradient ("more space = more reward") even\n' +
               '  when no near-miss happens. Caps at +0.4/s when the closest\n' +
               '  bullet is ≥120 px away (or none exist).\n' +
               '· STREAK: +0.5·dt × min(1, safeStreakTime / 2). Ramps up over\n' +
               '  the 2 s after a hit (or rollout start), saturating at +0.5/s.\n' +
               '  THE survival signal in dense-bullet regimes -- near-miss credits\n' +
               '  and proximity bonuses both lose discrimination when bullets are\n' +
               '  everywhere, but a long uninterrupted streak is unambiguously good.\n' +
               '· NEAR-MISS: +0.2 each time a bullet that came within 2.5×collision-\n' +
               '  radius passes the agent without hitting it. Down-weighted from\n' +
               '  +0.5 so dense-bullet near-miss noise doesn\'t swamp the streak\n' +
               '  signal above; still pays out as an "active dodging" reward at\n' +
               '  low-to-moderate density.\n' +
               (noDie
                 ? `· HIT: −${hitPen.toFixed(1)} per collision in NO-DIE mode. The rollout\n` +
                   '  continues; a brief invulnerability window prevents one cluster from\n' +
                   '  charging the agent repeatedly on overlapping frames. Each hit also\n' +
                   '  resets the streak counter, so the bigger penalty is the LOSS of\n' +
                   '  future streak bonus, not the per-hit subtraction.'
                 : '· DEATH: −5 one-shot when a bullet collides with the agent. Smaller\n' +
                   '  cliff than before so the smooth alive + safety + streak gradient\n' +
                   '  still dominates early-training selection.');
      },
      reward(kin, dt, params) {
        const d = kin.dodge;
        if (!d) return 0;
        // -- Lifespan-focused branch --
        //
        // When dodgeLifespanMode is on we reshape the reward so that
        // aliveTime is the dominant signal. Default mixed-reward gives
        // the optimizer more gradient hints (safety + streak + near-miss)
        // but those bonuses can be gamed -- a policy can sit in an
        // empty corner and rack up "almost hit" credits without
        // actually surviving longer. Lifespan mode is the cleaner
        // selection pressure for the "stay alive as long as possible"
        // task: fitness ≈ how many seconds you survived, full stop.
        // Branch toggle now reads from state.dodge (stashed at setup
        // build time) because evaluatePolicy only passes
        // trainer.params.objectiveParams to this reward — and
        // dodgeLifespanMode lives at trainer.params top-level. Reading
        // from d (= kin.dodge = state.dodge) is the canonical path.
        if (d.lifespanMode) {
          let r = 0;
          if (!d.dead) {
            r += 1.0 * dt;  // 10x the default alive coefficient
            // Tiny safety shaping. Pre-first-death gradient hint so the
            // policy has SOMETHING to move toward before any survival
            // data exists. Coefficient is small enough that it can't
            // dominate aliveTime selection.
            const SAFE_DIST_PX = d.safeDistPx || 120;
            const md = d.minBulletDist;
            const safe = (md == null || !isFinite(md))
              ? 1 : Math.max(0, Math.min(1, md / SAFE_DIST_PX));
            r += 0.05 * safe * dt;
          }
          // Hit penalty: small, because the dominant disincentive for
          // dying is the foregone +1.0/s alive bonus on subsequent
          // seconds. Both no-die and terminal modes use the same -0.5.
          if (d._hitsToCredit > 0) {
            r -= 0.5 * d._hitsToCredit;
            d._hitsToCredit = 0;
          }
          if (d.dead && !d._deathPenaltyPaid) {
            r -= 0.5;
            d._deathPenaltyPaid = true;
          }
          // Drain near-miss credits silently -- ignore them under
          // lifespan mode (they're game-able).
          if (d._nearMissCredits > 0) d._nearMissCredits = 0;
          return r;
        }
        // -- Default mixed-reward branch (unchanged) --
        let r = 0;
        if (!d.dead) {
          // Flat alive bonus.
          r += 0.1 * dt;
          // Smooth "safety" bonus: continuous per-step reward proportional
          // to the closest bullet's distance, normalized so distances
          // ≥ SAFE_DIST_PX get the full bonus and a bullet right on top
          // gets nothing. minBulletDist === +Infinity (no live bullets)
          // also yields the full bonus -- the clamp pins it to 1.
          // Why this fixes the "stuck at level 1" problem: pre-smoothing,
          // every short-lived policy scored ≈ −10 (death). The reward
          // surface was flat outside of the rare near-miss + the terminal
          // collision, so NEAT couldn't tell "drifted away from the wave"
          // from "stood there and got hit". Now every step the policy is
          // far from bullets is a tiny win, and the gradient points the
          // right way before a single near-miss ever happens.
          // SAFE_DIST_PX is also kept on state.dodge so the UI "safe"
          // gauge can use the exact same normalization without a magic
          // constant drift.
          const SAFE_DIST_PX = d.safeDistPx || 120;
          const md = d.minBulletDist;
          const safe = (md == null || !isFinite(md))
            ? 1
            : Math.max(0, Math.min(1, md / SAFE_DIST_PX));
          r += 0.4 * safe * dt;
          // Sustained-survival bonus. Rewards being alive WITHOUT having
          // been hit recently. Crucial for the no-die regime + high bullet
          // density: at saturation, near-miss credits and spacing bonuses
          // both lose their signal (every bullet "almost hits", nothing
          // is "far"), so we need a metric that scales with consecutive
          // safe seconds. Grows linearly until streak=2s, then caps so
          // a long streak doesn't snowball into an unbounded reward
          // (max +0.5/s after 2s of no-hits). Per-step bonus is
          // exactly the sustained-streak factor × dt × peak rate.
          const streak = d.safeStreakTime || 0;
          const streakFactor = Math.min(1, streak / 2.0);
          r += 0.5 * streakFactor * dt;
        }
        // Near-miss credits are accumulated by the setup's tick(). We
        // drain them here as a per-step delta so the per-step reward
        // stays small + smooth instead of one big lump. Down-weighted
        // from the original 0.5/credit to 0.2/credit because at high
        // bullet densities near-misses fire constantly and would otherwise
        // swamp the sustained-streak signal added above. Still useful as
        // an "active dodging" signal at low-to-moderate density.
        if (d._nearMissCredits > 0) {
          r += 0.2 * d._nearMissCredits;
          d._nearMissCredits = 0;
        }
        // No-die mode: each hit charges a smaller per-hit penalty (drained
        // from _hitsToCredit, set by the setup tick). Smaller than the
        // terminal death penalty because the agent has many more chances
        // over the rollout. Configurable via params.dodgeNoDiePenalty.
        if (d._hitsToCredit > 0) {
          // noDiePenalty also lives on state.dodge for the same reason
          // as lifespanMode above. Default 3 matches the historical
          // fallback when the param wasn't provided.
          const w = (d.noDiePenalty != null) ? d.noDiePenalty : 3;
          r -= w * d._hitsToCredit;
          d._hitsToCredit = 0;
        }
        // One-shot death penalty (terminate-on-hit mode only).
        // _deathPenaltyPaid guards against double-charging on the step
        // the bullet collides. Reduced from −10 → −5 so the smooth alive
        // + safety bonuses still dominate the early-training gradient
        // instead of being washed out by the terminal cliff.
        if (d.dead && !d._deathPenaltyPaid) {
          r -= 5;
          d._deathPenaltyPaid = true;
        }
        return r;
      },
      requiresParam: null,
      // Per 8s rollout, plausible scores:
      // · just survives 8s, mediocre spacing: 0.8 alive + ~2 safety ≈ 2.8
      // · survives 8s with good spacing + a few grazes: ~5-6
      // · dies at 4s with no grazing: 0.4 + ~1 safety − 5 ≈ −3.6
      // expectedMax 12 leaves headroom; thresholdFrac 0.30 → advance at
      // ~3.6, which is achievable by "stays alive + keeps some distance"
      // without already needing grazing tactics. That unblocks the
      // "stuck at curriculum level 1" failure mode.
      expectedMax: 12,
      thresholdFrac: 0.30,
    },

    // Port of the reward function from the reference Pendulum-NEAT
    // project (proj/Pendulum-NEAT, src/user/training/stadium.hpp,
    // ~line 41). Three distinguishing features vs balance_up:
    //   1. Tip-height GATE: no reward at all unless the tip is in the
    //      upper region (≥ 85% of the way to fully upright). Removes
    //      the dense "almost down is slightly better than fully down"
    //      gradient that lets bad policies score above zero and
    //      muddies selection. The agent only earns reward when it
    //      ACTUALLY has the chain near upright.
    //   2. Smoothness via 1/(1 + 0.5·outSum): outSum is cumulative
    //      |Δoutput| over the rollout. Reward decays multiplicatively
    //      as the agent jerks more -- much stronger pressure for
    //      stable control than balance_up's per-step linear penalty.
    //   3. Center bonus: |1 - |x|/halfW| scales reward to 0 when the
    //      cart is at the rail end. Encourages staying near center
    //      rather than parking against a wall.
    // Requires trainer.evaluatePolicy to pass `scratch` (4th arg) so
    // outSum + lastCmd persist across steps of the rollout.
    pendulum_neat_score: {
      id: 'pendulum_neat_score',
      label: 'Pendulum-NEAT compatible (time above horizontal)',
      formula: 'dt · max(0, chainHeight) · (0.5 + 0.5·center)',
      describe(params) {
        return 'Success criterion: the chain stays ABOVE HORIZONTAL (chainHeight > 0) for as long as possible. Wobble and jerky control are explicitly fine -- the only thing that matters is not letting the chain fall back past horizontal. Per step: max(0, chainHeight) (linear -- zero once the chain falls to/below horizontal, more credit the higher it is, so the GA is nudged to keep it well clear of horizontal which is more robust than hovering at the edge) × a gentle centering factor in [0.5, 1] (discourages the degenerate "pin the cart to the rail wall and drag the chain" exploit without ever being able to zero out an otherwise-good policy). No smoothness term -- the previous versions penalized exactly the wobble that is fine here.';
      },
      reward(kin, dt, params, scratch) {
        // The user's actual success criterion, stated plainly:
        // "always up" = the chain never falls back below horizontal
        // (chainHeight > 0). Wobble is fine. Smoothness is irrelevant.
        // Near-vertical is NOT required. So the reward is simply how
        // far above horizontal the tip is, per step:
        //   chainHeight ≤ 0  -> 0   (chain has fallen -- no credit)
        //   chainHeight > 0  -> chainHeight  (linear: higher = more,
        //                        gently pushing the GA to keep the
        //                        chain well clear of horizontal, which
        //                        is far more robust than hovering at
        //                        exactly 0 where any perturbation drops
        //                        it -- but ANY above-horizontal time is
        //                        rewarded, the agent doesn't have to
        //                        get near vertical).
        // No chainHeight² (perma-penalized the chaotic wobble), no
        // smoothness factor (penalized the wobble the user said is
        // fine), no saturating cap (linear gives a cleaner climb).
        if (!kin || kin.chainHeight == null) {
          if (scratch) scratch.upStreakSec = 0;
          return 0;
        }
        const ch = kin.chainHeight;
        if (ch <= 0) {
          // Fell back to/below horizontal: no credit AND the
          // continuous-hold streak resets (a brief touch is worth far
          // less than an unbroken hold).
          if (scratch) scratch.upStreakSec = 0;
          return 0;
        }
        const heightFactor = ch > 1 ? 1 : ch;
        // Honest sustained-hold term: reward grows with how long the
        // chain has been CONTINUOUSLY above horizontal this rollout.
        // This is not a cosmetic hack -- it directly measures the goal
        // (stay up), so "hold 15s straight" >> "fifteen 1s touches".
        // K ~ 0.08 /s: a full continuous 30s hold integrates to
        // ~30 + 0.08*30^2/2 ~= 66 (drives the expectedMax below).
        const STREAK_K = 0.08;
        if (scratch) {
          scratch.upStreakSec = (scratch.upStreakSec || 0) + dt;
        }
        const streakSec = scratch ? scratch.upStreakSec : 0;
        const streakMul = 1 + STREAK_K * streakSec;
        // Gentle centering. Without ANY cart-position term the GA finds
        // the degenerate "drive the cart to the rail wall, the chain
        // happens to flop up against the stop" exploit. Range [0.5, 1]
        // so at worst it halves reward (discouraging the exploit)
        // without ever zeroing a policy that's genuinely holding the
        // chain up off-center.
        const halfW = 240;
        const cx = kin.cartX || 0;
        const center = 0.5 + 0.5 * Math.max(0, 1 - Math.abs(cx) / halfW);
        return dt * heightFactor * center * streakMul;
      },
      requiresParam: null,
      // Eval-scaled curriculum-gate ceiling. The streak multiplier
      // (1 + 0.08·t) makes a perfect continuous hold integrate to
      //   ∫₀ᵀ (1 + 0.08 t) dt = T + 0.04·T²   (T = evalSeconds)
      // The static expectedMax below is just the T=30 value (66); the
      // trainer/HUD prefer THIS so the gate stays "thresholdFrac of a
      // perfect hold at the ACTUAL eval length" at any eval length (a
      // hardcoded 66 made the 0.60 gate unreachable at shorter evals).
      expectedMaxFor(evalSeconds) {
        const T = evalSeconds > 0 ? evalSeconds : 1;
        return T + 0.04 * T * T;
      },
      // Static T=30 fallback (= expectedMaxFor(30)) for any reader that
      // doesn't have an evalSeconds in hand. The LIVE curriculum gate
      // uses expectedMaxFor() above, so the ceiling auto-scales with
      // eval length and needs NO manual per-eval tuning.
      expectedMax: 66,
      // 0.60 of the eval-scaled ceiling. Clearing it requires a single
      // continuous hold of ~70%+ of the rollout -- the streak
      // multiplier severely penalizes brief-hold-then-fall, so this
      // gate cannot be skated past on mediocrity. With
      // curriculumNoForceAdvance, each level is genuinely mastered
      // (sustained) before the curriculum advances.
      thresholdFrac: 0.60,
    },

    // ----- terrain-run: dense potential-based traversal progress -------------
    // Ported verbatim from the terrain-run probe. Per step the agent is paid
    // the number of TILES by which it extended its FURTHEST-RIGHT position, so
    // any forward progress is rewarded immediately and backtracking costs
    // nothing (but earns nothing — a potential, not a velocity bonus). One shot
    // of +goalBonus for touching the far edge. Falling into a pit or touching a
    // spike ends the episode, which forfeits all remaining progress: that is
    // the only death penalty the task needs.
    //
    // WHY DENSE. The probe ran the sparse ablation (goal bonus only, no
    // progress shaping) through the identical train/eval path: an ES optimiser
    // never gets off the floor on it. The dense term is load-bearing, and it is
    // measured, not assumed.
    //
    // The scale is TILES, not seconds — a rollout's score is bounded by the
    // course length, not by its duration, so expectedMaxFor sizes the ceiling
    // from the COURSE geometry (see below) and NOT from evalSeconds.
    terrain_progress: {
      id: 'terrain_progress',
      label: 'Terrain progress (tiles advanced + goal bonus)',
      formula: '+Δ(furthest x)/TILE per step  ·  +goalBonus once at the far edge',
      describe(_params) {
        return 'Dense potential-based reward for the terrain-run platformer:\n' +
               '· DENSE: every step pays the number of TILES by which the agent\n' +
               '  extended its furthest-right position. Forward progress is paid\n' +
               '  immediately; backtracking costs nothing and earns nothing.\n' +
               '· TERMINAL: one shot of +goalBonus (default 20) for touching the\n' +
               '  far edge of the course.\n' +
               '· DEATH: falling into a pit or touching a spike ends the episode,\n' +
               '  which forfeits every remaining tile — no explicit penalty term.\n' +
               'On the measured "hard" geometry the attainable max is 100.0: the\n' +
               'null policy and the all-zero parameter vector both score exactly\n' +
               '0.000000, hold-right 11.2, jump-spam 18.4, a scripted full-\n' +
               'information reflex oracle 88.6, trained policies 95.4-98.5.';
      },
      reward(kin, dt, params) {
        const t = kin.terrain;
        // Setups without a terrain course (someone picked this objective
        // against a pendulum) get 0 — non-crashing no-op.
        if (!t) return 0;
        let r = t.progressDelta;
        if (t.goalJustReached) {
          r += (params && params.goalBonus != null) ? params.goalBonus
             : (t.goalBonus != null ? t.goalBonus : 20);
        }
        return r;
      },
      requiresParam: null,
      // Course-scaled curriculum-gate ceiling. A perfect run collects every
      // tile between the start column and the goal, plus the bonus:
      //   (gridW − max(1, ⌊startPad/2⌋) − 1.5) + goalBonus
      // = 100.5 on 'hard' (gridW 84) and 266.5 on 'crucible' (gridW 250),
      // which are the two numbers the probe reports its scores against (the
      // ATTAINABLE max is 0.5 lower — the last half tile is inside the goal
      // trigger). evalSeconds is accepted and ignored: this reward is bounded
      // by course length, not by rollout duration. `params` is the trainer
      // params (terrainDifficulty / terrainGridW / ...) or a resolved terrain
      // block; the ladder itself lives in setups.js and is read through
      // BF.setups.terrainGeometry so there is only ever one copy of it.
      expectedMaxFor(_evalSeconds, params) {
        const g = (BF.setups && BF.setups.terrainGeometry)
          ? BF.setups.terrainGeometry(params || null) : null;
        if (!g) return 100.5;
        return (g.gridW - Math.max(1, Math.floor(g.startPad / 2)) - 1.5) + g.goalBonus;
      },
      // Static fallback for any reader without params in hand: the DEFAULT
      // ('hard') geometry. The live gate uses expectedMaxFor above, so the
      // ceiling tracks whatever course the run is actually training on.
      expectedMax: 100.5,
      // 0.7 of the ceiling = the probe's "solved" gate (gate70): the agent has
      // to cover ~70% of the course, which on 'hard' means clearing roughly a
      // dozen consecutive obstacles. Jump-spam (18.4 of 100) is nowhere near.
      thresholdFrac: 0.7,
    },
  };

  function listObjectives() { return Object.keys(OBJECTIVES).map(k => OBJECTIVES[k]); }
  function getObjective(id) { return OBJECTIVES[id] || OBJECTIVES.balance_up; }

  BF.objectives = { listObjectives, getObjective };
})(window.BF);
