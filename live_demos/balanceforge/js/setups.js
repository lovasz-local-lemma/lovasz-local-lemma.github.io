// BalanceForge — predefined setups (worlds + observation builders + reward functions)
// Each setup is registered with a unique id. Adding more is just adding entries.

(function (BF) {
  'use strict';
  const P = BF.physics;
  const { clamp } = BF.util;

  // Default world bounds.
  const DEFAULT_RAIL = { minX: -260, maxX: 260, y: 0 };

  function basicCartWorld(opts) {
    const w = P.makeWorld(opts);
    const cartIdx = P.addNode(w, 0, DEFAULT_RAIL.y, { mass: 6, radius: 18, label: 'cart' });
    const requestedRail = opts && opts.pendulumRailHalfWidth;
    const railHalfWidth = Number.isFinite(requestedRail) && requestedRail > 0
      ? Math.max(80, Math.min(1200, requestedRail)) : DEFAULT_RAIL.maxX;
    P.setCart(w, cartIdx, { minX: -railHalfWidth, maxX: railHalfWidth, mass: 6 });
    // Preserve the historical observation scale on the default track.
    w.pendulumRailHalfWidth = railHalfWidth;
    return { world: w, cartIdx: cartIdx };
  }

  // Helper: angle of segment from node a to node b, measured from upright (+/-PI when down).
  // We define "upright" as the bob being above the cart (negative y in screen coords because y points down).
  function segmentAngle(world, aIdx, bIdx) {
    const a = world.nodes[aIdx], b = world.nodes[bIdx];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // angle from upright (=0 means b is directly above a). y increases downward.
    return Math.atan2(dx, -dy);
  }

  function segmentAngularVelocity(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return (-dy * (b.vx-a.vx) + dx * (b.vy-a.vy)) / Math.max(1e-12, dx*dx+dy*dy);
  }

  // Setup-agnostic kinematics snapshot. Used by every objective.
  // chainAvg ∈ [-1, 1] is the mean of cos(angle from up) across every segment.
  // For double/triple pendulums this gives partial credit when only some links
  // are upright — much better selection signal than a tip-only score.
  function kinematics(state) {
    const w = state.world;
    const cart = w.nodes[state.cartIdx];
    const tip = w.nodes[state.tipIdx];
    let cosSum = 0;
    let minSegmentCos = 1;
    let totalLen = 0;
    const n = state.segments.length;
    for (let i = 0; i < n; i++) {
      const [aIdx, bIdx] = state.segments[i];
      const na = w.nodes[aIdx], nb = w.nodes[bIdx];
      const dx = nb.x - na.x;
      const dy = nb.y - na.y;
      const len = Math.hypot(dx, dy);
      const cosine = len > 1e-6 ? -dy / len : -1;
      if (len > 1e-6) cosSum += cosine;
      minSegmentCos = Math.min(minSegmentCos, cosine);
      totalLen += len;
    }
    const chainAvg = n > 0 ? cosSum / n : 0;
    const tipDx = tip.x - cart.x;
    const tipDy = tip.y - cart.y;
    let ball = null;
    if (state.ball && state.ball.spawned) {
      const b = w.nodes[state.ball.idx];
      ball = {
        x: b.x, y: b.y, vx: b.vx, vy: b.vy,
        spawned: state.ball.spawned,
        escaped: state.ball.escaped,
        escapeVx: state.ball.escapeVx,
        maxAbsVx: state.ball.maxAbsVx,
        hits: state.ball.hits,
        // Floor-bounce count, incremented by the setup tick on each real
        // bounce (not settling contact). Read by ball_in_hole's optional
        // bounce-penalty / direct-shot-only shaping.
        floorHits: state.ball.floorHits || 0,
        terminalGiven: state.ball.terminalGiven,
        // Golf-specific: did the ball go through the hole this rollout?
        sunk: state.ball.sunk || false,
        // Distance from ball to hole center (if a hole exists), for
        // proximity-shaping in the ball_in_hole objective.
        holeDistance: state.holeRegion
          ? Math.abs(b.x - (state.holeRegion.minX + state.holeRegion.maxX) / 2)
          : null,
        // Signed x-position of the hole center -- needed when the reward
        // wants direction-to-hole (e.g. the strike-direction bonus
        // computes the ball's outgoing velocity vs the ball-to-hole
        // vector). holeDistance loses the sign because it absolute-
        // values; this preserves it.
        holeCenterX: state.holeRegion
          ? (state.holeRegion.minX + state.holeRegion.maxX) / 2
          : null,
        holeCenterY: state.holeRegion ? state.holeRegion.y : null,
        // Half-width of the hole — used by the near-miss reward to
        // size the "close enough to count as a near miss" zone
        // proportionally to the actual hole geometry. Smaller holes
        // get a tighter near-miss zone.
        holeHalfWidth: state.holeRegion
          ? (state.holeRegion.maxX - state.holeRegion.minX) / 2
          : null,
        // Farthest +x point the ball has reached this rollout (set by
        // golf's tick). Reward shapes prefer this over current x because
        // a ball that rolled past the hole and bounced back should score
        // higher than one that stopped where it landed.
        maxX: state.maxBallX != null && state.maxBallX > -Infinity
                ? state.maxBallX : b.x,
        // Closest distance to hole center across the rollout. For sparse-
        // reward golf scenarios, this is the dense progress signal
        // (most early policies never sink it but still get partial
        // credit for getting close).
        minHoleDist: state.minHoleDistance != null && state.minHoleDistance < Infinity
                       ? state.minHoleDistance : null,
        // Closest the bob has come to the ball during pre-strike.
        // Used by the bob-to-ball closest-approach reward channel —
        // gives policies that haven't figured out how to strike a
        // continuous "get closer to the ball" climbing gradient.
        minBobToBallDist: state.minBobToBallDist != null && state.minBobToBallDist < Infinity
                            ? state.minBobToBallDist : null,
        // True after the cart + bob have been frozen by the one-hit lock.
        // Lets the objective stop crediting time-based shaping after the
        // commitment is made.
        frozen: state.frozen || false,
        // Mutating this from the objective signals "terminal reward awarded"
        // so subsequent steps don't double-count. We expose the live state
        // object so the objective can write back.
        _state: state.ball,
      };
    } else if (state.ball) {
      ball = {
        spawned: false, escaped: false, escapeVx: 0, maxAbsVx: 0, hits: 0,
        sunk: false, holeDistance: null, maxX: null, frozen: state.frozen || false,
        terminalGiven: state.ball.terminalGiven, _state: state.ball,
      };
    }
    return {
      cartX: cart.x,
      cartVx: cart.vx,
      chainAvg: chainAvg,
      minSegmentCos: n > 0 ? minSegmentCos : 0,
      chainSum: cosSum,
      chainHeight: totalLen > 0 ? -tipDy / totalLen : 0,
      tipX: tip.x,
      tipY: tip.y,
      tipAngle: Math.atan2(tipDx, -tipDy),
      tipSpeedSq: tip.vx * tip.vx + tip.vy * tip.vy,
      energy: w.energy || 0,
      numSegments: n,
      ball: ball,
      // Dodge setup tucks a live struct on state.dodge with the
      // alive-time / near-miss / dead counters; expose it here so the
      // dodge_survive objective can read the same state the setup
      // updates each tick.
      dodge: state.dodge || null,
      // Resolved-at-now target for inverse-physics setups. null for
      // setups that don't have one. v1: getTargetAt returns the constant
      // point. v2: getTargetAt returns curve(t); kinematics is the layer
      // that resolves "now" so the objective sees a fresh target every
      // frame WITHOUT having to take t itself. This is the entire v2
      // swap point — keep it routed through getTargetAt.
      chainReach: state.chainReach ? {
        target: getTargetAt(state, state.simTime || 0),
        successRadius: state.chainReach.successRadius,
        distScale: state.chainReach.distScale,
        distScaleFar: state.chainReach.distScaleFar,   // chain-trace only; undefined elsewhere
      } : null,
      // Band-coverage state for the signing "paint" mode; the chain_paint
      // objective reads the per-step coverage delta + outside flag. null for
      // every setup except a chain-trace built with opts.chainPaint.
      paint: state.paint ? {
        newlyThisStep: state.paint.newlyThisStep,
        outsideThisStep: state.paint.outsideThisStep,
        NS: state.paint.NS,
        coverage: state.paint.coveredCount / state.paint.NS,
      } : null,
      // IN-ORDER trace state for the signing "ordered" mode; the
      // chain_trace_ordered objective reads the per-step channels. null for
      // every setup except a chain-trace built with opts.chainOrdered.
      ordered: state.ordered ? {
        advancedThisStep: state.ordered.advancedThisStep,   // increase in the RECORD in-order run this step
        outsideThisStep: state.ordered.outsideThisStep,     // 1 when the tip is off the curve band entirely
        shapeDelta: state.ordered.shapeDelta,               // px of distance CLOSED toward the frontier this step
        shapeRef: state.ordered.shapeRef,                   // px normalizer for shapeDelta (chain extension)
        NW: state.ordered.NW,
        // THE honest headline metric: fraction of the curve traced in ONE
        // unbroken, monotone pass. Not "waypoints touched" — see the tick.
        progress: state.ordered.bestRun / state.ordered.NW,
        // Denominator the REWARD divides by — the curriculum's required arc,
        // which is the whole curve unless orderedRequiredFrac says otherwise.
        // Kept distinct from progress on purpose: the gate scales with the
        // level, the reported metric never does.
        req: state.ordered.reqCount,
        runProgress: state.ordered.doneCount / state.ordered.NW,  // the run in flight right now
        runs: state.ordered.runs,                                 // how fragmented the attempt was
        latched: state.ordered.start >= 0,
        // Mean tip→curve distance in PIXELS so far. Curve-size invariant,
        // unlike fitness — this is the number to compare across configs.
        meanErrPx: state.ordered.errSteps > 0 ? state.ordered.errSum / state.ordered.errSteps : null,
      } : null,
      // STROKE state for the signing "as few strokes as possible" mode. The
      // chain_stroke objective is a TELESCOPING episode score: it needs both
      // the current and the PREVIOUS-step values of every accumulator so it
      // can return (total_now − total_prev) as the per-step reward. Exposing
      // the pair here (rather than having the objective stash state) keeps the
      // objective a pure function of the snapshot, which is what makes the
      // retroactive stroke discount possible at all. null for every setup
      // except a chain-trace built with opts.chainStroke.
      stroke: state.stroke ? {
        NS: state.stroke.NS,
        coverage:     state.stroke.coveredCount / state.stroke.NS,
        strokes:      state.stroke.strokes,
        slopInt:      state.stroke.slopInt,
        nearInt:      state.stroke.nearInt,
        elapsed:      state.stroke.elapsed,
        prevCoverage: state.stroke.prevCoverage,
        prevStrokes:  state.stroke.prevStrokes,
        prevSlopInt:  state.stroke.prevSlopInt,
        prevNearInt:  state.stroke.prevNearInt,
        prevElapsed:  state.stroke.prevElapsed,
        penDown:      state.stroke.penDown,
        dist:         state.stroke.dist,
        outsideSec:   state.stroke.outsideSec,   // diagnostic / HUD only
      } : null,
      // Live commanded cruise velocity (px/s) for the cruise-control setup; the
      // vel_match objective reads it. null for every other setup.
      velTarget: state.velMatch ? state.velMatch.targetVx : null,
      // One-shot flag: the tag-sequence setup sets it true on the step the cart
      // touches the lit post (advancing the cycle). The tag_sequence objective
      // pays a bonus for it. false for every other setup.
      tagJustHappened: state.tagSeq ? !!state.tagSeq.justTagged : false,
      // Obstacle circle {x,y,r} for the arm-obstacle scene; the reach_avoid
      // objective repels the hand from it. null for every other setup.
      obstacle: state.obstacle || null,
      // Array of keep-out circles {x,y,r}[] for the arm-slot scene; the
      // thread_slot objective repels the hand from each. null otherwise.
      obstacles: state.obstacles || null,
      // Ball-in-tray state for the plate-spin scene; plate_spin reads the
      // offset of the ball from the tray center. null for every other setup.
      plate: state.plate ? { offset: state.plate.offset, halfWidth: state.plate.half } : null,
      // Terrain-run progress channels. progressDelta and goalJustReached are
      // ONE-SHOT values the setup's tick recomputes every step (the tick clears
      // both before stepping and freezes the world once the course ends), so
      // terrain_progress stays a pure function of the snapshot and cannot
      // double-pay the goal bonus. goalBonus rides along for the same reason
      // dodge's noDiePenalty rides on state.dodge: evaluatePolicy hands the
      // reward trainer.params.objectiveParams, which does not carry it.
      // null for every other setup.
      terrain: state.terrainRun ? {
        progressDelta: state.terrainRun.progressDelta,
        goalJustReached: state.terrainRun.goalJustReached,
        goalBonus: state.terrainRun.P.goalBonus,
        tiles: (state.terrainRun.maxX - state.terrainRun.startX) / TERRAIN_TILE,
        reachedGoal: state.terrainRun.reachedGoal,
        dead: state.terrainRun.dead,
        deathCause: state.terrainRun.deathCause,
        grounded: state.terrainRun.agent.grounded,
        jumps: state.terrainRun.jumps,
        courseTiles: state.terrainRun.terrain.W,
      } : null,
    };
  }

  // ----- chain-reach (inverse physics, v1) -----------------------------------
  // 5 nodes (cart + 4 chain bodies), 4 mass-spring links. The cart sits
  // on the existing 1D rail (P.setCart) so cart-class policies and the
  // existing observation/action interface work unchanged. The target
  // is an opaque { x, y } stored on state.chainReach so v2 (chain-trace
  // / signing machine) can swap it for a curve-parametrization object
  // without touching the observation builder or the objective.

  const CHAIN_REACH_SEG_LEN = 80;
  // Spring stiffness/damping now come from BF.chainMaterials per the
  // selected material (Track C). These are just the DEFAULT identifiers.
  const CHAIN_REACH_DEFAULT_NUM_SEGMENTS = 4; // 4 segments = 5 nodes incl. cart (v1)
  const CHAIN_REACH_DEFAULT_MATERIAL = 'springy'; // = v1's 400/8 stiffness/damping
  const CHAIN_REACH_TARGET = { x: 120, y: -240 };
  const CHAIN_REACH_SUCCESS_RADIUS = 30;
  const CHAIN_REACH_DIST_SCALE = 200;

  const CHAIN_TRACE_DEFAULT_CURVE = 'circle';
  const CHAIN_TRACE_DEFAULT_PERIOD = 4;   // seconds per loop
  const CHAIN_TRACE_DEFAULT_RADIUS = 60;  // px; small box near rest = linear regime
  // Stroke-mode ARC-LENGTH lookahead offsets, in band samples (NS = 120 over one
  // loop), i.e. 3.3% and 10% of the curve ahead of the guide point. Chosen to
  // match the cursor lookahead's horizon in the shipped signing configs: on a
  // 12s loop, 0.3s ≈ 3 samples and 0.8s ≈ 8 samples; nudged up because the pen
  // sets its own pace and generally runs slower than the cursor.
  const STROKE_LA1 = 4;
  const STROKE_LA2 = 12;

  // Accessor used by the objective AND the observation builder. v1
  // returns a constant point; v2 returns curve(t). Keep both callers
  // going through this so v2 needs to change one function, not three.
  function getTargetAt(state, _t) {
    return state.chainReach.target;
  }

  // Configure k cart-side interior joints as actuators on the built chain.
  // chainIdxs = [cartIdx, node1, …, tipIdx]. Joint j sits at node chainIdxs[j+1]
  // between segments (chainIdxs[j], chainIdxs[j+1]) and (chainIdxs[j+1],
  // chainIdxs[j+2]); needs a next node, so only interior joints 0..numSegs-2.
  // Signed bend angle at joint b between segments a→b and b→c, via
  // atan2(cross, dot): 0 at straight (colinear), no branch cut there. Robust
  // for the servo PD — the difference-of-segmentAngle measure wraps by 2π at the
  // straight config (caught by the B2.1 joint probe). restAngle and the live
  // angle use the SAME definition so the PD error is consistent.
  function chainBendAngle(world, a, b, c) {
    const na = world.nodes[a], nb = world.nodes[b], nc = world.nodes[c];
    const abx = nb.x - na.x, aby = nb.y - na.y;
    const bcx = nc.x - nb.x, bcy = nc.y - nb.y;
    return Math.atan2(abx * bcy - aby * bcx, abx * bcx + aby * bcy);
  }
  function configureChainJoints(world, chainIdxs, numActuatedJoints) {
    const numSegs = chainIdxs.length - 1;
    const k = Math.max(0, Math.min(numActuatedJoints | 0, numSegs - 1));
    const acts = [];
    for (let j = 0; j < k; j++) {
      const a = chainIdxs[j], b = chainIdxs[j + 1], c = chainIdxs[j + 2];
      const restAngle = chainBendAngle(world, a, b, c);
      acts.push({ a: a, b: b, c: c, restAngle: restAngle });
    }
    world.jointActuators = acts;
    world.jointCmds = new Array(acts.length).fill(0);
    return k;
  }

  // Convert the policy's per-joint commands (state.lastCmds[1+j]) to torques on
  // world.jointCmds, per the control mode. Called from each chain setup's tick.
  function applyChainJointCmds(state, mode) {
    const w = state.world, JA = w.jointActuators;
    if (!JA || !JA.length) return;
    const cmds = state.lastCmds || [];
    const CJ = BF.chainJoint.CHAIN_JOINT;
    for (let j = 0; j < JA.length; j++) {
      const u = Math.max(-1, Math.min(1, cmds[1 + j] || 0));
      if (mode === 'servo') {
        const act = JA[j];
        const cur = chainBendAngle(w, act.a, act.b, act.c);
        // joint angular velocity ≈ Δangle/dt is unavailable here; use the
        // outboard-segment ω proxy (same form as buildObservation).
        const nb = w.nodes[act.b], nc = w.nodes[act.c];
        const dx = nc.x - nb.x, dy = nc.y - nb.y, len2 = dx * dx + dy * dy || 1;
        const dvx = nc.vx - nb.vx, dvy = nc.vy - nb.vy;
        const omega = (-dy * dvx + dx * dvy) / len2;
        w.jointCmds[j] = BF.chainJoint.servoTorque(cur, act.restAngle, omega, u);
      } else {
        w.jointCmds[j] = u * CJ.torqueScale;
      }
    }
  }

  // ========== Setup: Single pendulum on cart ==========
  function makeSinglePendulum() {
    const segLen = 140;
    return {
      id: 'single',
      label: 'Single pendulum',
      relevantObjectiveIds: ['balance_up', 'hold_angle', 'hang_down'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        // Place bob slightly off vertical so the controller has to act
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.05;
        const bobX = world.nodes[cartIdx].x + Math.sin(startAngle) * segLen;
        const bobY = world.nodes[cartIdx].y - Math.cos(startAngle) * segLen;
        const bobIdx = P.addNode(world, bobX, bobY, { mass: 1, radius: 12, label: 'bob' });
        P.addRod(world, cartIdx, bobIdx, segLen);
        // Observation mode + dropout period are carried ON THE STATE (opts
        // win, singleton is the fallback) -- the same shape terrain-run uses.
        // The state-carried copy is what makes worker parity structural: the
        // worker's trainer threads the SAME params into buildWorld, so it
        // cannot silently evaluate the un-masked world. The singleton fallback
        // is what the app's UI seam and eval_worker's init re-application set.
        const obsMode = (opts && opts.singleObservationMode === 'blind-dropout')
          ? 'blind-dropout'
          : ((opts && opts.singleObservationMode === 'full')
              ? 'full'
              : (this.observationMode || 'full'));
        const dropK = (opts && opts.singleDropoutK != null)
          ? Math.max(1, opts.singleDropoutK | 0)
          : Math.max(1, this.dropoutK | 0);
        // Tip = bob.
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: bobIdx,
          segments: [[cartIdx, bobIdx]],
          // step counter starts at 0 => step 0 is always a FRESH reading.
          singleDropout: { mode: obsMode, K: dropK, step: 0 },
        };
      },
      // The observation WIDTH is 6 in every mode -- 'blind-dropout' masks
      // channels, it never adds or removes them. (That is deliberate: it keeps
      // the genome dimension identical between the memoryless arm and the
      // recurrent arm so the comparison is parameter-matched at the input.)
      observationCount: 6,
      // ---- OBSERVATION MODES ------------------------------------------------
      // 'full'          the classic 6-channel reactive observation.
      // 'blind-dropout' the MEMORY task. Two things happen at once:
      //   1. VELOCITY-BLIND. BOTH velocity channels are killed. Which ones
      //      those are was established EMPIRICALLY, not by reading the labels:
      //      with positions held byte-identical, nudge each node's velocity in
      //      turn and see which channels move. Per node the answer is
      //      {ch1 cart velocity, ch4 angular velocity}; a UNIFORM nudge finds
      //      only {ch1}, because ch4 is a RELATIVE angular rate. So the obvious
      //      experiment misses half the answer. smoke-test.js re-derives both
      //      results live rather than trusting this comment.
      //   2. DROPOUT. A fresh reading arrives only every K-th control step. On
      //      the stale steps EVERY channel is zero except the bias, and ch1 --
      //      dead anyway, since velocity is blinded -- is reused as a
      //      "this reading is fresh" flag (1 fresh / 0 stale).
      // A memoryless policy therefore sees a LITERALLY IDENTICAL input on every
      // stale step and can only emit a constant; holding a command across the
      // gap requires state. Measured on the shipped path (DE pop 40, 1600 gens,
      // 15 fresh seeds, 8 held-out start angles): a parameter-matched 393-param
      // MLP reaches 0.136 mean / 0.146 best -- the 0.123 do-nothing floor --
      // while a 393-param recurrent policy reaches 0.955 mean, 13 of 15 seeds
      // at or above 0.90. See BF.recurrent.
      //
      // Velocity-blinding ALONE does NOT create a memory requirement here (the
      // engine's dissipation supplies the derivative action) -- that is a
      // measured negative, and it is why the dropout is the load-bearing half.
      // The control that proves it: the SAME memoryless MLP at K=1 (dropout
      // off, still velocity-blind) solves the task 5 of 5 seeds at 1.000.
      observationMode: 'full',
      // Control steps between fresh readings. 1 = no dropout. K=4 is the widest
      // separation between the two arms, RE-MEASURED on the shipped config (DE
      // pop 40, 1600 gens, 3 seeds per cell): recurrent 1.000 / 0.958 / 0.929
      // at K = 2 / 3 / 4 against memoryless 0.334 / 0.179 / 0.137 — a gap of
      // 0.67 / 0.78 / 0.79. This comment used to say the recurrent arm gets
      // WORSE at small K (0.81/0.87); that came from a sep-CMA-ES screening
      // sweep at a different budget and is REFUTED above. What K changes is how
      // much the MEMORYLESS arm can still do, not how well memory works.
      dropoutK: 4,
      observationModes: ['full', 'blind-dropout'],
      // Same seam name/shape as dodge.setObservationMode / terrain-run's, so
      // app.js's syncSetupObservationCounts and eval_worker's init-time parity
      // re-application reach it the same way. Width is unchanged, so nothing
      // downstream needs resizing -- but the MODE still has to reach the
      // worker or serial and parallel score different worlds.
      setObservationMode(mode, opts) {
        this.observationMode = (mode === 'blind-dropout') ? 'blind-dropout' : 'full';
        if (opts && opts.dropoutK != null) {
          this.dropoutK = Math.max(1, opts.dropoutK | 0);
        }
        return this.observationMode;
      },
      get observationLabels() {
        if (this.observationMode !== 'blind-dropout') {
          return [
            'cart x position',
            'cart velocity',
            'sin(angle from up)',
            'cos(angle from up)',
            'angular velocity',
            'bias (constant 1)',
          ];
        }
        const K = Math.max(1, this.dropoutK | 0);
        return [
          'cart x position (0 on stale steps)',
          'fresh-reading flag (1 fresh / 0 stale, every ' + K + 'th step)',
          'sin(angle from up) (0 on stale steps)',
          'cos(angle from up) (0 on stale steps)',
          'blinded velocity channel (always 0)',
          'bias (constant 1)',
        ];
      },
      get observationAbbr() {
        return this.observationMode === 'blind-dropout'
          ? ['cx', 'fresh', 'sθ', 'cθ', 'blind', '1']
          : ['cx', 'vx', 'sθ', 'cθ', 'av', '1'];
      },
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const bob = w.nodes[state.tipIdx];
        const ang = segmentAngle(w, state.cartIdx, state.tipIdx);
        const dx = bob.x - cart.x;
        const dy = bob.y - cart.y;
        const angVel = ((bob.vx - cart.vx) * (-dy) + (bob.vy - cart.vy) * (dx)) / (segLen * segLen);
        const obs = [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(ang),
          Math.cos(ang),
          clamp(angVel * 0.3, -3, 3),
          1.0, // bias
        ];
        const d = state.singleDropout;
        if (!d || d.mode !== 'blind-dropout') return obs;
        // The step index is carried ON THE STATE and advanced here, because
        // buildObservation is called exactly once per control step by both the
        // trainer's eval loop and app.js's display loop. Deriving it from
        // world.time would need the dt, which buildWorld is not told.
        const step = d.step++;
        if (d.K <= 1 || (step % d.K) === 0) {
          obs[1] = 1;   // fresh flag (the dead cart-velocity channel, reused)
          obs[4] = 0;   // angular velocity blinded
          return obs;
        }
        obs[0] = 0; obs[1] = 0; obs[2] = 0; obs[3] = 0; obs[4] = 0;
        obs[5] = 1;     // bias survives; everything else is gone
        return obs;
      },
      isAlive() { return true; },
    };
  }

  // Shared pendulum ASSISTS, applied AFTER P.step in the double/triple ticks.
  // Two physical helpers, both curriculum-able and inert at 0 (the default):
  //   - jointDamping: per-joint hinge/bearing friction — bleeds each link's
  //     tangential (swing) velocity by fraction clamp(jointDamping*dt,0,1) via a
  //     px/py shift (pure velocity damp, no kick, rod sees no violation).
  //   - uprightAssist: a directional torsion spring pulling each link's far node
  //     toward straight-up (target = pivot - segLen in y); shifts x AND px so the
  //     Verlet velocity is preserved (positional nudge, no kick).
  // Extracted from the double's original inline tick (behavior-identical) so the
  // triple can reuse it — a single source for both.
  function applyPendulumAssists(state, dt, segLen) {
    const w = state.world;
    const jd = state.jointDamping || 0;
    if (jd > 0) {
      const ja = jd * dt < 1 ? jd * dt : 1;
      for (let i = 0; i < state.segments.length; i++) {
        const a = w.nodes[state.segments[i][0]];
        const b = w.nodes[state.segments[i][1]];
        if (!a || !b || b.role === 2 /* FIXED */) continue;
        let rx = b.x - a.x, ry = b.y - a.y;
        const rl = Math.hypot(rx, ry);
        if (rl < 1e-6) continue;
        rx /= rl; ry /= rl;
        const vrx = b.vx - a.vx, vry = b.vy - a.vy;
        const vdotr = vrx * rx + vry * ry;
        const vtx = vrx - vdotr * rx;
        const vty = vry - vdotr * ry;
        b.px += ja * vtx * dt; b.py += ja * vty * dt;
      }
    }
    const k = state.uprightAssist || 0;
    if (k <= 0) return;
    const alpha = k < 1 ? k : 1;
    for (let i = 0; i < state.segments.length; i++) {
      const a = w.nodes[state.segments[i][0]];
      const b = w.nodes[state.segments[i][1]];
      if (!a || !b || b.role === 2 /* FIXED */) continue;
      const tx = a.x;
      const ty = a.y - segLen;
      const dx = (tx - b.x) * alpha;
      const dy = (ty - b.y) * alpha;
      b.x += dx; b.y += dy;
      b.px += dx; b.py += dy;
    }
  }

  // ========== Setup: Double pendulum on cart ==========
  function makeDoublePendulum() {
    const segLen = 110;
    return {
      id: 'double',
      label: 'Double pendulum',
      relevantObjectiveIds: ['balance_up', 'pendulum_both_above', 'hold_angle', 'hang_down'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.04;
        const m1x = Math.sin(startAngle) * segLen;
        const m1y = -Math.cos(startAngle) * segLen;
        const mid = P.addNode(world, m1x, m1y, { mass: 1, radius: 11, label: 'mid' });
        const a2 = startAngle * 0.7;
        const tipX = m1x + Math.sin(a2) * segLen;
        const tipY = m1y - Math.cos(a2) * segLen;
        const tip = P.addNode(world, tipX, tipY, { mass: 1, radius: 11, label: 'tip' });
        P.addRod(world, cartIdx, mid, segLen);
        P.addRod(world, mid, tip, segLen);
        const state = {
          world: world,
          cartIdx: cartIdx,
          tipIdx: tip,
          midIdx: mid,
          segments: [[cartIdx, mid], [mid, tip]],
          // Legacy saved policies expect relative horizontal velocities.
          // Angular mode keeps the same width but observes both signed rates,
          // including when a link crosses horizontal (where dx/dt loses them).
          pendulumObservationMode: opts && opts.pendulumObservationMode != null
            ? (opts.pendulumObservationMode === 'angular' ? 'angular' : 'legacy')
            : this.observationMode,
          // Directional-spring helper strength for this rollout. Threaded
          // from trainer.params.uprightAssist via resolved() (curriculum-
          // able). 0 = off (free double pendulum). See tick() below.
          uprightAssist: (opts && opts.uprightAssist != null) ? opts.uprightAssist : 0,
          // Per-joint hinge friction (bearing friction at the pivots).
          // Will be threaded from trainer.params.jointDamping via
          // resolved() (curriculum-able; wired in a later task). 0 = off
          // (frictionless joints). See tick().
          jointDamping: (opts && opts.jointDamping != null) ? opts.jointDamping : 0,
        };
        if (opts && opts.pendulumInitialState) {
          if (!BF.pendulumInitialState) throw new Error('Load pendulum_initial_state.js before using a physical momentum start.');
          const spread = opts.pendulumInitialStateSpread;
          const initial = spread ? BF.pendulumInitialState.sample(
            opts.pendulumInitialState, spread,
            opts.initialStateRng || (opts.initialStateSeed != null ? opts.initialStateSeed : 1),
            startAngle < 0 ? -1 : 1
          ) : opts.pendulumInitialState;
          state.initialConditions = BF.pendulumInitialState.apply(state, initial,
            opts.physicsDt != null ? opts.physicsDt : 1 / 120);
        }
        return state;
      },
      // 10 inputs (was 9). The 10th feature is the dot product of the
      // two segment directions -- equivalent to cos(θ₁ - θ₂), which
      // tells the policy how the two links are oriented relative to
      // EACH OTHER (= 1 when aligned, = -1 when folded back). This
      // is the single observation the reference Pendulum-NEAT project
      // includes and our previous version didn't. The relative-angle
      // feature is hard for a 1-2 hidden-layer MLP to compute from
      // (sin θ₁, cos θ₁, sin θ₂, cos θ₂) -- requires multiplying input
      // pairs -- so feeding it directly gives small networks the
      // information they need to coordinate the two links during
      // swing-up. NEAT could grow a hidden unit that computes it, but
      // pre-computing accelerates training significantly.
      //
      // Bumping observationCount from 9 to 10 means saved double-
      // pendulum genomes (built with 9 inputs) won't load on this
      // setup anymore; they'd need to be retrained. Acceptable for
      // this experimental setup since the 10th feature is highly
      // task-relevant.
      observationCount: 10,
      observationMode: 'legacy',
      setObservationMode(mode) {
        this.observationMode = mode === 'angular' ? 'angular' : 'legacy';
        return this.observationMode;
      },
      get observationLabels() { return [
        'cart x position',
        'cart velocity',
        'sin(angle θ₁)',
        'cos(angle θ₁)',
        'sin(angle θ₂)',
        'cos(angle θ₂)',
        this.observationMode === 'angular' ? 'angular velocity θ₁' : 'mid velocity (rel cart)',
        this.observationMode === 'angular' ? 'angular velocity θ₂' : 'tip velocity (rel mid)',
        'cos(θ₁ − θ₂)',
        'bias',
      ]; },
      get observationAbbr() {
        return ['cx', 'vx', 's1', 'c1', 's2', 'c2',
          this.observationMode === 'angular' ? 'ω1' : 'vm',
          this.observationMode === 'angular' ? 'ω2' : 'vt', 'd12', '1'];
      },
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const mid = w.nodes[state.midIdx];
        const tip = w.nodes[state.tipIdx];
        const a1 = segmentAngle(w, state.cartIdx, state.midIdx);
        const a2 = segmentAngle(w, state.midIdx, state.tipIdx);
        const s1 = Math.sin(a1), c1 = Math.cos(a1);
        const s2 = Math.sin(a2), c2 = Math.cos(a2);
        // dir_1 · dir_2 = cos(θ₁ − θ₂). Critical relative-angle feature
        // (see comment above).
        const dot12 = s1 * s2 + c1 * c2;
        // Cart-velocity normalization scale. Accel/velocity modes keep
        // the historical /600 so genomes trained in those modes see
        // BYTE-IDENTICAL inputs (zero regression). Force mode's cart can
        // far exceed 600 px/s, so /600 would saturate this input and
        // blind the policy to its own speed. cartAccel/cartDrag is a
        // stable, curriculum-INDEPENDENT scale on the order of the
        // emergent terminal velocity (the true v* is a bit lower once
        // the global damping is included, but an exact value isn't
        // needed here -- we just need the right magnitude so cart.vx
        // lands in a usable range; keeping it independent of the damping
        // curriculum also keeps the observation stationary across
        // levels). Other setups inline their own cart-vx scale; they'd
        // want the same treatment if ever run in force mode, but the
        // force-mode presets all use this double-pendulum setup.
        let vScale = 600;
        if (w.cartControlMode === 'force') {
          const cdrag = w.cartDrag > 0 ? w.cartDrag : 1;
          vScale = Math.max(600, w.cartAccel / cdrag);
        }
        const angular = state.pendulumObservationMode === 'angular';
        return [
          clamp(cart.x / (w.pendulumRailHalfWidth && w.pendulumRailHalfWidth !== 260
            ? w.pendulumRailHalfWidth * (240 / 260) : 240), -1.5, 1.5),
          clamp(cart.vx / vScale, -2, 2),
          s1, c1,
          s2, c2,
          angular ? clamp(segmentAngularVelocity(cart, mid) * .3, -3, 3) : clamp((mid.vx - cart.vx) / 800, -2, 2),
          angular ? clamp(segmentAngularVelocity(mid, tip) * .3, -3, 3) : clamp((tip.vx - mid.vx) / 800, -2, 2),
          dot12,
          1.0,
        ];
      },
      isAlive() { return true; },
      // Directional-spring upright assist. Runs AFTER P.step (rods are
      // already solved), so each segment is currently exactly segLen
      // long. For each segment [a,b] we pull the far node b toward the
      // point directly ABOVE its base a, i.e. target = (a.x, a.y-segLen).
      // That target is itself exactly segLen from a, so the pull doesn't
      // fight the rod constraint -- it just rotates the link toward
      // vertical. We move b.px by the same delta as b.x so NO spurious
      // velocity is injected (a critically-damped positional spring: it
      // eases the link upright without ringing). Segments are processed
      // base->tip so segment 2 anchors on the freshly-corrected mid and
      // the whole chain converges to a vertical "stick" above the cart.
      //
      // strength ∈ [0,1] is the fraction of the remaining error removed
      // per step: 1 = snap rigid-vertical every step (the chain behaves
      // like a single stiff rod), small values = a gentle restoring
      // torsion spring. Curriculum ramps it strong -> 0 so the policy is
      // first handed an almost-rigid stick and then has the helper taken
      // away until it must balance the genuine free double pendulum.
      // 0 (the default everywhere else) early-outs: zero cost, zero
      // behavior change for any other setup/preset.
      // Physical helpers (hinge friction + upright torsion spring), both
      // curriculum-able and inert at 0. Shared with the triple pendulum via
      // applyPendulumAssists (see above).
      tick(state, dt) {
        applyPendulumAssists(state, dt, segLen);
      },
    };
  }

  // ========== Setup: Spring-coupled pendulum on cart ==========
  // Cart drives a bob; a side anchor pulls on the bob via a spring,
  // creating non-trivial restoring dynamics.
  function makeSpringPendulum() {
    const segLen = 130;
    return {
      id: 'spring',
      label: 'Spring-assisted pendulum',
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.12;
        const bobX = Math.sin(startAngle) * segLen;
        const bobY = -Math.cos(startAngle) * segLen;
        const bob = P.addNode(world, bobX, bobY, { mass: 1, radius: 12, label: 'bob' });
        const anchor = P.addNode(world, 220, -160, {
          role: P.Role.FIXED, radius: 6, label: 'anchor',
        });
        P.addRod(world, cartIdx, bob, segLen);
        P.addSpring(world, anchor, bob, { stiffness: 35, damping: 3, restLength: 230 });
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: bob,
          anchorIdx: anchor,
          segments: [[cartIdx, bob]],
        };
      },
      observationCount: 8,
      observationLabels: [
        'cart x position',
        'cart velocity',
        'sin(angle from up)',
        'cos(angle from up)',
        'bob velocity x (rel cart)',
        'bob velocity y',
        'spring stretch ratio',
        'bias',
      ],
      observationAbbr: ['cx', 'vx', 'sθ', 'cθ', 'rx', 'ry', 'sp', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const bob = w.nodes[state.tipIdx];
        const anchor = w.nodes[state.anchorIdx];
        const ang = segmentAngle(w, state.cartIdx, state.tipIdx);
        const sdx = bob.x - anchor.x;
        const sdy = bob.y - anchor.y;
        const slen = Math.hypot(sdx, sdy);
        const stretch = (slen - 230) / 230;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(ang),
          Math.cos(ang),
          clamp((bob.vx - cart.vx) / 800, -2, 2),
          clamp((bob.vy) / 800, -2, 2),
          clamp(stretch, -1, 1),
          1.0,
        ];
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Triple pendulum (hard) ==========
  function makeTriplePendulum() {
    const segLen = 80;
    return {
      id: 'triple',
      label: 'Triple pendulum (hard)',
      relevantObjectiveIds: ['balance_up', 'pendulum_both_above', 'hold_angle', 'hang_down'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.03;
        let prev = cartIdx;
        const idxs = [];
        for (let i = 0; i < 3; i++) {
          const angle = startAngle * (1 - i * 0.2);
          const px = world.nodes[prev].x + Math.sin(angle) * segLen;
          const py = world.nodes[prev].y - Math.cos(angle) * segLen;
          const newIdx = P.addNode(world, px, py, { mass: 0.8, radius: 9, label: 'm' + i });
          P.addRod(world, prev, newIdx, segLen);
          idxs.push(newIdx);
          prev = newIdx;
        }
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: idxs[2],
          midIdxs: idxs,
          segments: [
            [cartIdx, idxs[0]],
            [idxs[0], idxs[1]],
            [idxs[1], idxs[2]],
          ],
          pendulumObservationMode: opts && opts.pendulumObservationMode != null
            ? (opts.pendulumObservationMode === 'angular' ? 'angular' : 'legacy')
            : this.observationMode,
          // Physical assists (curriculum-able; 0 = off = free triple pendulum),
          // shared with the double via applyPendulumAssists in the tick below.
          uprightAssist: (opts && opts.uprightAssist != null) ? opts.uprightAssist : 0,
          jointDamping: (opts && opts.jointDamping != null) ? opts.jointDamping : 0,
        };
      },
      // Upright torsion spring + hinge friction, same helpers as the double
      // (inert at 0). Lets an assisted triple-pendulum preset converge.
      tick(state, dt) {
        applyPendulumAssists(state, dt, segLen);
      },
      observationCount: 11,
      observationMode: 'legacy',
      setObservationMode(mode) {
        this.observationMode = mode === 'angular' ? 'angular' : 'legacy';
        this.observationCount = this.observationMode === 'angular' ? 12 : 11;
        return this.observationMode;
      },
      get observationLabels() { return this.observationMode === 'angular' ? [
        'cart x', 'cart velocity',
        'sin θ₁', 'cos θ₁', 'sin θ₂', 'cos θ₂', 'sin θ₃', 'cos θ₃',
        'angular velocity θ₁', 'angular velocity θ₂', 'angular velocity θ₃', 'bias',
      ] : [
        'cart x', 'cart vel',
        'sin θ₁', 'cos θ₁',
        'sin θ₂', 'cos θ₂',
        'sin θ₃', 'cos θ₃',
        'link0 rel vel', 'tip rel vel',
        'bias',
      ]; },
      get observationAbbr() { return this.observationMode === 'angular'
        ? ['cx', 'vx', 's1', 'c1', 's2', 'c2', 's3', 'c3', 'ω1', 'ω2', 'ω3', '1']
        : ['cx', 'vx', 's1', 'c1', 's2', 'c2', 's3', 'c3', 'v0', 'vt', '1']; },
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const a1 = segmentAngle(w, state.cartIdx, state.midIdxs[0]);
        const a2 = segmentAngle(w, state.midIdxs[0], state.midIdxs[1]);
        const a3 = segmentAngle(w, state.midIdxs[1], state.midIdxs[2]);
        const m0 = w.nodes[state.midIdxs[0]];
        const m1 = w.nodes[state.midIdxs[1]];
        const m2 = w.nodes[state.midIdxs[2]];
        if (state.pendulumObservationMode === 'angular') {
          const vScale = w.cartControlMode === 'force'
            ? Math.max(600, w.cartAccel / (w.cartDrag > 0 ? w.cartDrag : 1)) : 600;
          const xScale = w.pendulumRailHalfWidth && w.pendulumRailHalfWidth !== 260
            ? w.pendulumRailHalfWidth * (240 / 260) : 240;
          return [
            clamp(cart.x / xScale, -1.5, 1.5), clamp(cart.vx / vScale, -2, 2),
            Math.sin(a1), Math.cos(a1), Math.sin(a2), Math.cos(a2), Math.sin(a3), Math.cos(a3),
            clamp(segmentAngularVelocity(cart, m0) * .3, -3, 3),
            clamp(segmentAngularVelocity(m0, m1) * .3, -3, 3),
            clamp(segmentAngularVelocity(m1, m2) * .3, -3, 3),
            1.0,
          ];
        }
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(a1), Math.cos(a1),
          Math.sin(a2), Math.cos(a2),
          Math.sin(a3), Math.cos(a3),
          clamp((m0.vx - cart.vx) / 800, -2, 2),
          clamp((m2.vx - m0.vx) / 800, -2, 2),
          1.0,
        ];
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Chain reach (5-node mass-spring chain, inverse physics) ==========
  function makeChainReach() {
    const segLen = CHAIN_REACH_SEG_LEN;
    // Clamp helper shared by buildWorld + setObservationShape so N can
    // never go out of the supported 2..10 range.
    const clampN = (n) => Math.max(2, Math.min(10, n | 0));
    return {
      id: 'chain-reach',
      label: 'Chain reach (inverse physics)',
      relevantObjectiveIds: ['chain_reach'],
      // Current segment count (mutable instance state, default = v1's 4).
      // Mutated by setObservationShape when the UI segment control changes.
      numSegments: CHAIN_REACH_DEFAULT_NUM_SEGMENTS,
      // Observation count scales with N: 2 cart + 3*N segment + 2 tip-target
      // + 1 bias. Mirrors the dodge setup's mutable observationCount.
      observationCount: 2 + 3 * CHAIN_REACH_DEFAULT_NUM_SEGMENTS + 2 + 1,
      // Setup-aware resolver. Changing N changes the input dimension and
      // invalidates every genome, so the app rebuilds the trainer right
      // after calling this — exactly like dodge.setObservationMode.
      setObservationShape(opts) {
        const n = (opts && opts.numSegments != null) ? clampN(opts.numSegments) : this.numSegments;
        this.numSegments = n;
        this.observationCount = 2 + 3 * n + 2 + 1;
      },
      // Action count = 1 cart + k actuated joints. Resolver mirrors
      // setObservationShape; the trainer sizes the genome outputs from
      // actionCount. Default (no opts / numActuatedJoints 0) = 1 (byte-unchanged).
      actionCount: 1,
      // numActuatedJoints is single-source on the instance (like numSegments):
      // setActionShape stores it, buildWorld falls back to it, and it is NOT
      // threaded into the trainer rollout buildWorld — so the rollout's actuator
      // count can never drift from the genome's output dimension (both come from
      // this one setActionShape call the app.js seam makes).
      numActuatedJoints: 0,
      setActionShape(opts) {
        const k = (opts && opts.numActuatedJoints != null) ? Math.max(0, Math.min(opts.numActuatedJoints | 0, this.numSegments - 1)) : 0;
        this.actionCount = 1 + k;
        this.numActuatedJoints = k;
      },
      // Per-OUTPUT names, mirroring observationLabels/observationAbbr on the
      // input side. Consumed by the input→action influence chord so its arcs
      // read "cart / j1 / j2" instead of "action 0/1/2". Derived from the same
      // instance fields the action shape is, so they can never drift.
      get actionLabels() {
        const L = ['cart force'];
        for (let j = 0; j < this.numActuatedJoints; j++) L.push('joint ' + (j + 1) + ' cmd');
        return L;
      },
      get actionAbbr() {
        const A = ['cart'];
        for (let j = 0; j < this.numActuatedJoints; j++) A.push('j' + (j + 1));
        return A;
      },
      buildWorld(opts) {
        const numSegs = (opts && opts.numSegments != null) ? clampN(opts.numSegments) : this.numSegments;
        const materialKey = (opts && opts.material) || CHAIN_REACH_DEFAULT_MATERIAL;
        const mat = BF.chainMaterials.resolve(materialKey);
        const { world, cartIdx } = basicCartWorld(opts);
        // Hang straight down with a tiny perturbation so springs aren't
        // exactly co-linear (numerically nicer).
        const startTilt = (opts && opts.startAngle != null) ? opts.startAngle : 0.02;
        const chainIdxs = [cartIdx];
        let prevX = world.nodes[cartIdx].x;
        let prevY = world.nodes[cartIdx].y;
        for (let s = 0; s < numSegs; s++) {
          const tilt = startTilt * (s + 1);
          const nx = prevX + Math.sin(tilt) * segLen;
          // +cos puts each successive node BELOW its predecessor (y grows
          // downward in screen coords / gravity direction). Chain starts at
          // natural rest below the cart; the task is to SWING IT UP to the
          // target. (Contrast single/double/triple which start ABOVE.)
          const ny = prevY + Math.cos(tilt) * segLen;
          const isTip = (s === numSegs - 1);
          const idx = P.addNode(world, nx, ny, {
            mass: isTip ? 1.2 : 1.0,
            radius: isTip ? 11 : 8,
            label: isTip ? 'tip' : ('chain' + (s + 1)),
          });
          chainIdxs.push(idx);
          P.addSpring(world, chainIdxs[s], idx, {
            // P.addSpring reads `restLength` (NOT `restLen`, which is the
            // diff-sim's key). Stiffness/damping come from the selected
            // material via the shared BF.chainMaterials table.
            restLength: segLen,
            stiffness: mat.stiffness,
            damping: mat.damping,
          });
          prevX = nx;
          prevY = ny;
        }
        const tipIdx = chainIdxs[chainIdxs.length - 1];
        const segments = [];
        for (let s = 0; s < numSegs; s++) segments.push([chainIdxs[s], chainIdxs[s + 1]]);
        // Configure k cart-side interior joints as actuators (sets
        // world.jointActuators/jointCmds). Default 0 → no actuators → tick no-op.
        const reqActuated = (opts && opts.numActuatedJoints != null) ? opts.numActuatedJoints : (this.numActuatedJoints || 0);
        const numActuated = configureChainJoints(world, chainIdxs, reqActuated);
        // targetEase ∈ [0,1] (default 1 = v1 hard target). 0 puts the target
        // AT the chain's hanging-tip rest position (reachable from rest → the
        // reward is achievable, so a curriculum can advance); 1 is the hard
        // target (+120,−240). The curriculum ramps this 0→1 so the policy
        // learns to reach a progressively higher target, escaping the
        // do-nothing local optimum. Observation + reward read the target via
        // getTargetAt(state, t), so they follow it with no other change.
        const ease = (opts && opts.targetEase != null) ? clamp(opts.targetEase, 0, 1) : 1;
        const restTip = world.nodes[tipIdx]; // chain built at rest → tip is at the rest position
        const targetX = restTip.x + (CHAIN_REACH_TARGET.x - restTip.x) * ease;
        const targetY = restTip.y + (CHAIN_REACH_TARGET.y - restTip.y) * ease;
        return {
          world,
          cartIdx,
          tipIdx,
          segments,
          // Opaque target object. v2 variants swap this; observation + reward
          // both read it via getTargetAt(state, t), the single change point.
          chainReach: {
            target: { x: targetX, y: targetY },
            successRadius: CHAIN_REACH_SUCCESS_RADIUS,
            distScale: CHAIN_REACH_DIST_SCALE,
          },
          // Control mode for the joint actuators ('torque' | 'servo'). Read by
          // tick → applyChainJointCmds. Default 'torque'. (No actuators → inert.)
          jointControlMode: (opts && opts.jointControlMode) || 'torque',
        };
      },
      // Per-step joint actuation: convert the policy's per-joint outputs
      // (state.lastCmds[1+j]) to torques on world.jointCmds. No-op when no
      // joints are actuated (numActuatedJoints 0), so base-only chain-reach is
      // byte-unchanged (this is chain-reach's first tick).
      tick(state, dt) {
        applyChainJointCmds(state, state.jointControlMode);
      },
      // Labels/abbrs scale with the current N. Getters (not static arrays)
      // so they always match observationCount after a setObservationShape.
      get observationLabels() {
        const out = ['cart x (norm)', 'cart vx (norm)'];
        for (let s = 0; s < this.numSegments; s++) {
          out.push('sin θ' + (s + 1));
          out.push('cos θ' + (s + 1));
          out.push('θ̇' + (s + 1));
        }
        out.push('Δtip→target x (norm)');
        out.push('Δtip→target y (norm)');
        out.push('bias = 1');
        return out;
      },
      get observationAbbr() {
        const out = ['cx', 'vx'];
        for (let s = 0; s < this.numSegments; s++) {
          out.push('s' + (s + 1));
          out.push('c' + (s + 1));
          out.push('v' + (s + 1));
        }
        out.push('dx');
        out.push('dy');
        out.push('1');
        return out;
      },
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const out = [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
        ];
        // Iterate the ACTUAL built chain (state.segments.length) so the
        // observation always matches whatever N this world was built with.
        for (let s = 0; s < state.segments.length; s++) {
          const [a, b] = state.segments[s];
          const theta = segmentAngle(w, a, b);
          const nb = w.nodes[b];
          const na = w.nodes[a];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const dvx = nb.vx - na.vx;
          const dvy = nb.vy - na.vy;
          // Perpendicular velocity projection ≈ dθ/dt (single/double pend convention).
          const omega = (-dy * dvx + dx * dvy) / (len * len);
          out.push(Math.sin(theta));
          out.push(Math.cos(theta));
          out.push(clamp(omega / 8, -2, 2));
        }
        const tip = w.nodes[state.tipIdx];
        // Route through getTargetAt so v2's moving target needs no change here.
        const tgt = getTargetAt(state, state.simTime || 0);
        out.push(clamp((tip.x - tgt.x) / 240, -2, 2));
        out.push(clamp((tip.y - tgt.y) / 240, -2, 2));
        out.push(1);
        return out;
      },
      isAlive() { return true; },
    };
  }

  // ----- REACH, MEASURED BY SETTLING THE PLANT ------------------------------
  // numSegs·segLen is the chain's SPRING REST LENGTH. It is NOT its reach, and
  // for years the chain-trace placement was written as if it were. The springs
  // sag under gravity and the telescope rescales every rest length, so the only
  // honest answer to "where can this tip actually be HELD" comes from the plant:
  // hold every telescope command at its shortest and at its longest and read the
  // tip y once it has stopped moving. Because the cart slides freely in x, the
  // statically reachable set really is a horizontal BAND in y.
  //
  // MEASURED, shipped signing chain (n=4, segLen 80, rigid, telescope on):
  //   passive hang 326.6, band y ∈ [166.6, 518.6]  =  1.02 L / 0.52 L / 1.62 L.
  // Across 16 rigid+telescope configs those ratios hold to ±1.1 %, but MATERIAL
  // breaks them outright — 'elastic' hangs at 1.41 L, 'rope' 1.17, 'springy'
  // 1.12 — so the arithmetic shortcut (0.5 L / 1.6 L) is wrong by 130–487 px on
  // materials the user can actually select. Hence a settle, not a formula.
  // Segment count and material are what move it; joint count and joint control
  // mode do not (j0/j1/j3 and servo/torque settle to the same y).
  //
  // TELESCOPE OFF collapses the band to a single point at the hang: with no
  // length freedom there is exactly one height the tip can be held at.
  //
  // HOW LONG TO SETTLE — RUN TO CONVERGENCE, DO NOT GUESS A DURATION. A fixed
  // 8 s was shipped first and is right for the config it was measured on and
  // wrong elsewhere. Against a 120 s reference, the tip y a fixed 8 s returns
  // is out by (MEASURED, telescope held, g = 900 unless stated):
  //     rigid   n4  0.0 px        <- the config the 8 s was chosen on
  //     springy n4  0.3 px        rope n4   0.0 px
  //     elastic n4  4.8 px        rigid n10 3.9 px
  //     elastic n6 20.3 px        elastic n8 16.3 px
  //     elastic n10 75.0 px       elastic n10 @ g2000  134.6 px
  // Soft chains ring, and the ringing period grows with the chain, so the one
  // number that works at n=4 rigid is worthless at n=10 elastic — both of
  // which the dropdowns offer. Convergence took up to 22.5 s.
  //
  // So the loop stops on a MEASUREMENT instead: peak-to-peak tip y over the
  // trailing window below must fall under the tolerance. Peak-to-peak (not a
  // velocity or a single-sample delta) because a ringing chain passes through
  // zero velocity twice a cycle; a 2 s window is longer than the slowest mode
  // measured. Checked every 0.25 s, so the cost of the test is ~1 % of the sim.
  // ACROSS 120 configs (4 materials x 5 segment counts x 3 gravities x both
  // telescope ends) this stops at worst 0.029 px from a 120 s reference, in at
  // most 33.4 s of sim (mean 15.9).
  //
  // THE CAP IS SET BY THE DAMPING SLIDER'S MINIMUM, not by the default. Damping
  // is a 0..0.1 slider and at damping 0 the same 120 configs take up to 289.8 s
  // to stop ringing (elastic n10; springy n10 152 s, elastic n8 189 s) — the
  // criterion is still good there (worst 0.028 px) but a 60 s cap silently
  // returned a value 125.6 px out. So the cap is 400 s of SIM, which is ~50 ms
  // of real time on the worst chain and is hit by nothing measured. When it is
  // hit the envelope carries `capped: true` rather than pretending.
  //
  // COST. A cold settle is ~0.7 ms for the shipped 4-segment chain and ~4 ms
  // for an n=10 soft chain at the default damping (~50 ms at damping 0),
  // against a 0.004 ms cache hit — so it is CACHED on the tuple that determines
  // it (segments, segment length, material, telescope, gravity, damping — joint
  // count and joint control mode were measured NOT to move the settled tip, to
  // 0.0 px on all 4 materials at n=4 and n=10, servo and torque alike). One
  // training run touches one key. Do NOT make this uncached: at ~0.7 ms it
  // would be a ~200x tax on a 0.003 ms build.
  //
  // The cache is BOUNDED because gravity and damping are floats and the
  // adversarial-env option multiplies both per rollout, which would otherwise
  // mint a fresh key (and a fresh settle) for every rollout, for ever. Dropping
  // the whole map at the bound is fine: the key set a normal run touches is 1.
  //
  // NO RECURSION, TWICE OVER. The settle calls buildWorld, and buildWorld asks
  // for the envelope. The brace is that the settle passes a POSITIVE explicit
  // traceCenterY, which is the one branch that never consults this function —
  // it has to be positive, because traceCenterY 0 is the AUTO sentinel, not an
  // override (passing 0 here used to make the settle re-enter this function on
  // every cold build, caught only by the flag below; verified by deleting the
  // flag, which then blew the stack). `_settling` is the belt: if the brace is
  // ever broken again, re-entry returns a degenerate band rather than
  // recursing. Guard 7h in smoke-test.js asserts the brace, not just the belt.
  // traceRadius comes in from presets, the slider, curriculum ramps and headless
  // callers. A non-finite value used to flow straight through: NaN and "abc" made
  // BOTH the curve centre and worldExtent.halfH NaN, and Infinity made halfH
  // Infinite — a silently unusable world rather than an error, because the tip
  // coordinates stayed finite so nothing downstream threw. Only null/undefined
  // were ever handled (they fall back to the default). Coerce here instead.
  // 0 and negatives are deliberately LEFT ALONE: they produce finite worlds (a
  // degenerate point curve, and a mirrored one) and the placement sweeps use
  // r = 0 as a real edge case, so rejecting them would change tested behaviour.
  function finiteRadius(v, fallback) {
    const n = (v == null) ? fallback : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  const CHAIN_TRACE_SETTLE_MIN_SECONDS = 2;
  const CHAIN_TRACE_SETTLE_MAX_SECONDS = 400;  // cap; measured worst need 289.8 s (damping 0)
  const CHAIN_TRACE_SETTLE_WINDOW_SECONDS = 2; // longer than the slowest ring measured
  const CHAIN_TRACE_SETTLE_TOL_PX = 0.05;      // peak-to-peak over that window
  const CHAIN_TRACE_SETTLE_CHECK_SECONDS = 0.25;
  const CHAIN_TRACE_SETTLE_DT = 1 / 120;
  const CHAIN_TRACE_ENV_CACHE_MAX = 256;
  const _chainReachEnvCache = new Map();
  let _chainReachSettling = false;
  function chainTraceReachEnvelope(setup, opts, numSegs, segLen, materialKey, telescopeOn) {
    const gravity = (opts && opts.gravity != null) ? opts.gravity : 900;
    const damping = (opts && opts.damping != null) ? opts.damping : 0.005;
    const key = numSegs + '|' + segLen + '|' + materialKey + '|' + (telescopeOn ? 1 : 0)
              + '|' + gravity + '|' + damping;
    const hit = _chainReachEnvCache.get(key);
    if (hit) return hit;
    const nominal = numSegs * segLen;
    if (_chainReachSettling) {
      return { tipYMin: nominal, tipYMax: nominal, degenerate: true, reentered: true };
    }
    _chainReachSettling = true;
    let env;
    let cappedAny = false;
    try {
      // `which` picks the held telescope extreme: null = passive hang. The
      // rest lengths are read off the SHIPPED telescope object rather than
      // recomputed here, so the 0.5/1.6 factors live in exactly one place, and
      // they are set directly (no slew) because we want the endpoint, not the
      // trajectory to it. Joints are left unactuated — measured irrelevant.
      const settleTipY = (which) => {
        const st = setup.buildWorld({
          gravity: gravity, damping: damping,
          numSegments: numSegs, material: materialKey,
          telescope: telescopeOn, numActuatedJoints: 0,
          startAngle: 0,                 // canonical neutral pose, not the run's tilt
          curveId: CHAIN_TRACE_DEFAULT_CURVE, tracePeriod: CHAIN_TRACE_DEFAULT_PERIOD,
          traceRadius: 0,
          // POSITIVE, and that matters: > 0 is what makes this an override and
          // so the one buildWorld branch that does not ask for an envelope.
          traceCenterY: nominal,
        });
        if (st.telescope && which) {
          const rl = (which === 'min') ? st.telescope.min : st.telescope.max;
          for (const sp of st.telescope.springs) sp.restLength = rl;
        }
        // Step until the tip stops moving (see the note above), not for a
        // fixed number of seconds. `ring` holds the trailing window of tip y.
        const maxSteps  = Math.round(CHAIN_TRACE_SETTLE_MAX_SECONDS / CHAIN_TRACE_SETTLE_DT);
        const minSteps  = Math.round(CHAIN_TRACE_SETTLE_MIN_SECONDS / CHAIN_TRACE_SETTLE_DT);
        const winSteps  = Math.round(CHAIN_TRACE_SETTLE_WINDOW_SECONDS / CHAIN_TRACE_SETTLE_DT);
        const everySteps = Math.max(1, Math.round(CHAIN_TRACE_SETTLE_CHECK_SECONDS / CHAIN_TRACE_SETTLE_DT));
        const ring = new Float64Array(winSteps);
        let y = st.world.nodes[st.tipIdx].y;
        let converged = false;
        for (let k = 0; k < maxSteps; k++) {
          P.step(st.world, CHAIN_TRACE_SETTLE_DT, 0);
          y = st.world.nodes[st.tipIdx].y;
          ring[k % winSteps] = y;
          const done = k + 1;
          if (done >= minSteps && done >= winSteps && done % everySteps === 0) {
            let lo = Infinity, hi = -Infinity;
            for (let j = 0; j < winSteps; j++) {
              const v = ring[j];
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
            // NaN propagates into lo/hi and fails this test, so a chain that
            // blows up runs to the cap and lands in the non-finite fallback
            // below rather than "converging" on garbage.
            if (hi - lo < CHAIN_TRACE_SETTLE_TOL_PX) { converged = true; break; }
          }
        }
        if (!converged) cappedAny = true;
        return y;
      };
      if (telescopeOn) {
        const a = settleTipY('min'), b = settleTipY('max');
        env = { tipYMin: Math.min(a, b), tipYMax: Math.max(a, b), degenerate: false };
      } else {
        const y = settleTipY(null);
        env = { tipYMin: y, tipYMax: y, degenerate: true };
      }
    } finally {
      _chainReachSettling = false;
    }
    if (!Number.isFinite(env.tipYMin) || !Number.isFinite(env.tipYMax)) {
      // A material/segment combination that blows up under its own weight would
      // otherwise poison every placement with NaN. Fall back to the nominal
      // length and say so, rather than silently centring on NaN.
      env = { tipYMin: nominal, tipYMax: nominal, degenerate: true, diverged: true };
    }
    if (cappedAny) env.capped = true;   // ran out of settle budget; see the cap note
    // Bounded, because gravity/damping are floats (see the cache note above).
    if (_chainReachEnvCache.size >= CHAIN_TRACE_ENV_CACHE_MAX) _chainReachEnvCache.clear();
    _chainReachEnvCache.set(key, env);
    return env;
  }

  // ----- chain-trace (signing machine, v2) -----------------------------------
  // Same chain build as chain-reach, but the target is a MOVING point
  // curve(traceTime) — a small box centered on the resting tip. tick()
  // advances traceTime and refreshes state.chainReach.target each step;
  // the observation + objective read it through the same getTargetAt seam,
  // so the moving target needs no trainer/objective special-casing.
  function makeChainTrace() {
    const segLen = CHAIN_REACH_SEG_LEN;
    const clampN = (n) => Math.max(2, Math.min(10, n | 0));
    function mapTarget(ct, t) {
      const u = BF.chainTraceCurves.pointAt(ct.curveId, t, ct.period);
      return { x: ct.center.x + u.x * ct.radius, y: ct.center.y + u.y * ct.radius };
    }
    return {
      id: 'chain-trace',
      label: 'Chain trace (signing machine)',
      relevantObjectiveIds: ['chain_trace', 'chain_paint', 'chain_stroke', 'chain_trace_ordered'],
      numSegments: CHAIN_REACH_DEFAULT_NUM_SEGMENTS,
      observationCount: 2 + 3 * CHAIN_REACH_DEFAULT_NUM_SEGMENTS + 2 + 1,
      // ANTICIPATION (lookahead) observation — opt-in, +4 inputs. The base
      // observation gives a memoryless MLP only the INSTANTANEOUS Δtip→cursor,
      // so it can never know where the curve goes next: it chases, always
      // lagging (structural, not a training failure). Lookahead adds the tip's
      // FUTURE error vectors Δtip→cursor(t+0.3s) and Δtip→cursor(t+0.8s).
      // MEASURED (26×150-gen probe sweep): a consistent ~9-10% tip-error cut on
      // BOTH triangle and figure-8, every seed, every checkpoint from gen 60 —
      // while the same information expressed as detached "road ahead" tangents
      // (not anchored to the tip) made things WORSE, and phase clocks/harmonics
      // overfit. Future info only helps in the frame the policy acts in.
      // OFF by default → observation shape is byte-identical to the classic 17.
      lookahead: false,
      setObservationShape(opts) {
        const n = (opts && opts.numSegments != null) ? clampN(opts.numSegments) : this.numSegments;
        if (opts && opts.lookahead != null) this.lookahead = !!opts.lookahead;
        this.numSegments = n;
        this.observationCount = 2 + 3 * n + 2 + (this.lookahead ? 4 : 0) + 1;
      },
      // Action count = 1 cart + k actuated joints + (telescope ? numSegments : 0).
      // Telescoping (#3, "signing machine" mode): each segment's REST LENGTH
      // becomes a policy action — with joint torques this approximates a
      // Fourier-style trace machine (per-segment angle AND amplitude control),
      // while keeping a fixed segment COUNT. Default 1 (both features off).
      actionCount: 1,
      // Single-source on the instance (see the chain-reach setup for the full rationale).
      numActuatedJoints: 0,
      telescope: false,
      setActionShape(opts) {
        const k = (opts && opts.numActuatedJoints != null) ? Math.max(0, Math.min(opts.numActuatedJoints | 0, this.numSegments - 1)) : 0;
        if (opts && opts.telescope != null) this.telescope = !!opts.telescope;
        this.numActuatedJoints = k;
        this.actionCount = 1 + k + (this.telescope ? this.numSegments : 0);
      },
      // Output vocabulary (see chain-reach). Order matches the action vector
      // the rollout consumes: cart, then each actuated joint, then each
      // telescoping segment's rest length.
      get actionLabels() {
        const L = ['cart force'];
        for (let j = 0; j < this.numActuatedJoints; j++) L.push('joint ' + (j + 1) + ' cmd');
        if (this.telescope) for (let s = 0; s < this.numSegments; s++) L.push('segment ' + (s + 1) + ' length');
        return L;
      },
      get actionAbbr() {
        const A = ['cart'];
        for (let j = 0; j < this.numActuatedJoints; j++) A.push('j' + (j + 1));
        if (this.telescope) for (let s = 0; s < this.numSegments; s++) A.push('L' + (s + 1));
        return A;
      },
      buildWorld(opts) {
        const numSegs = (opts && opts.numSegments != null) ? clampN(opts.numSegments) : this.numSegments;
        const materialKey = (opts && opts.material) || CHAIN_REACH_DEFAULT_MATERIAL;
        const mat = BF.chainMaterials.resolve(materialKey);
        const traceRadius = finiteRadius(opts && opts.traceRadius, CHAIN_TRACE_DEFAULT_RADIUS);
        const { world, cartIdx } = basicCartWorld(opts);
        const startTilt = (opts && opts.startAngle != null) ? opts.startAngle : 0.02;
        const chainIdxs = [cartIdx];
        const springStart = world.springs.length;   // capture the chain's springs for telescoping
        let prevX = world.nodes[cartIdx].x;
        let prevY = world.nodes[cartIdx].y;
        for (let s = 0; s < numSegs; s++) {
          const tilt = startTilt * (s + 1);
          const nx = prevX + Math.sin(tilt) * segLen;
          const ny = prevY + Math.cos(tilt) * segLen; // +cos = below cart (see chain-reach)
          const isTip = (s === numSegs - 1);
          const idx = P.addNode(world, nx, ny, {
            mass: isTip ? 1.2 : 1.0,
            radius: isTip ? 11 : 8,
            label: isTip ? 'tip' : ('chain' + (s + 1)),
          });
          chainIdxs.push(idx);
          P.addSpring(world, chainIdxs[s], idx, {
            restLength: segLen, stiffness: mat.stiffness, damping: mat.damping,
          });
          prevX = nx; prevY = ny;
        }
        const tipIdx = chainIdxs[chainIdxs.length - 1];
        const segments = [];
        for (let s = 0; s < numSegs; s++) segments.push([chainIdxs[s], chainIdxs[s + 1]]);
        // Configure k cart-side interior joints as actuators (sets
        // world.jointActuators/jointCmds). Default 0 → no actuators → tick no-op.
        const reqActuated = (opts && opts.numActuatedJoints != null) ? opts.numActuatedJoints : (this.numActuatedJoints || 0);
        const numActuated = configureChainJoints(world, chainIdxs, reqActuated);
        const restTip = world.nodes[tipIdx]; // chain built at rest → tip is at rest pos
        // Telescoping state (#3): the policy drives each segment's spring REST
        // LENGTH (servo-style target from the command, rate-limited so lengths
        // glide instead of teleporting). The Verlet spring solver reads
        // s.restLength every step, so mutating it is the physical "prismatic
        // joint". OFF by default → zero cost, byte-identical chain-trace.
        // Resolved HERE, above the placement, because whether the segments can
        // change length is what decides whether the tip's reachable set is a
        // band or a single height — see chainTraceReachEnvelope.
        const telescopeOn = (opts && opts.telescope != null) ? !!opts.telescope : !!this.telescope;
        // WHERE THE CURVE SITS — this one number dominated every signing result
        // for months, and the old value was wrong.
        //
        // History: the original anchor was the resting tip (y ≈ numSegs·segLen ≈
        // 320) — believed at the time to be the chain's MAXIMUM extension (it is
        // not; that reading is the error this whole block exists to correct, and
        // the settled maximum is 518.6) and below the visible area, so the curve
        // was cropped ("the curve is too low and outside the visible range"). The
        // fix then was to RAISE it to min(restTip.y − 0.5·n·segLen,
        // 230 − traceRadius) = y 130 (r100) / 90 (r140). That solved visibility
        // but overshot: the tip's settled band is y ∈ [166.6, 518.6], so a curve
        // centred at 90-130 lies mostly ABOVE it and is touchable only mid-swing.
        //
        // MEASURED cost of that overshoot (shipped planner, same shape, only the
        // centre moved): triangle r100 39.8px → 13.2px, figure-8 r140 67.3px →
        // 20.9px — a ~3× error reduction that was being thrown away. The signing
        // machine had been drawing with its arm over-extended the whole time.
        //
        // THE RULE, AS MEASURED (2026-08). Two jobs were being done by one
        // number, badly. Split them:
        //
        //   FRAMING — where the curve LOOKS right. `L − 0.45·r` (L = numSegs·
        //   segLen) puts the curve's bottom at L + 0.55·r, just inside the
        //   visible window under the worldExtent below. That is all it ever
        //   did, and it is kept, under an honest name.
        //
        //   REACH — where the tip can actually GO. That is not L (see
        //   chainTraceReachEnvelope: L is the spring rest length; the settled
        //   band for this chain is [166.6, 518.6] with the hang at 326.6), and
        //   the framing height is only WRONG when it pushes part of the curve
        //   out of that band. So reach is enforced as a CLAMP on the framing
        //   height, one bound per end of the curve, using the curve's own
        //   asymmetric extent from the registry.
        //
        // WHY A CLAMP AND NOT A RE-ANCHOR. Re-centring everything on the band's
        // midpoint was measured and rejected: across 32 curve×radius cells it
        // won 2.01 px of planner error to the clamp's 1.61 px, but once the
        // do-nothing floor (which moves with the centre) is divided out the
        // gain on the 26 cells where the curve ALREADY FITS is −0.007, i.e.
        // slightly negative, and a learned CMA-ES check rejected it on 2 of 4
        // cells (swash r140: 28.0 → 31.0 px, 0 of 5 seeds better). Re-anchoring
        // also moves every preset and forces a global ~17 % zoom-out. The
        // clamp moves only what does not fit.
        //
        // WHY NO RADIUS TERM IN THE REACH PART. The feasible interval
        // [tipYMin + top, tipYMax − bot] is symmetric about the band midpoint
        // for every curve, so the curve's size sets the TOLERANCE, not the
        // optimum. The old expression's `− 0.45·r` did the opposite: it made
        // the centre SHALLOWER as the curve grew taller, pushing the growing
        // curve toward the end it could not reach. Measured shallow-side cost
        // (error relative to each curve's own best, 288 cells): 1.12/1.16/
        // 1.36/1.88 at 40/80/120/160 px shallow of the midpoint, against
        // 1.07/1.09/1.28 at the same distances deep. Shallow is the expensive
        // side, and correlation of error with the arc fraction lifted ABOVE
        // tipYMin is r = 0.81 (against 0.07 for the fraction below tipYMax).
        //
        // WHEN THE CURVE IS TALLER THAN THE WHOLE BAND the interval is empty
        // and no placement fits; fall back to the band midpoint. It is NOT the
        // max-margin point (this comment claimed that until 2026-08-24, and the
        // claim is arithmetically false for the 8 of 18 registry curves whose
        // extent is asymmetric): equalising the two unavoidable excursions puts
        // the centre at 0.5*(lo + hi) = midpoint + (top − bot)/2, up to
        // 0.16·r = 32 px away at r = 200 on the ascender/descender pair. That
        // balanced centre IS better on excursion — copperplate r200 8.4 px of
        // overhang → 1.3, ascender/descender r280 48 → 3.2 — and MEASURED NULL
        // on error, which is why the midpoint stays: shipped planner, 3 loops
        // first skipped, tilts ±0.1, copperplate r200 36.83 → 37.38 px,
        // ascender r280 35.66 → 35.24, descender 37.47 → 36.89, do-nothing
        // floors flat. No shipped preset reaches this branch anyway (at the
        // signing config it needs r > 176 for circle, > 198 for copperplate;
        // every preset is r ≤ 140), so the midpoint is kept as the simpler
        // rule with nothing measurable riding on the difference.
        // With the telescope OFF the band is a single point and every curve
        // lands here — which is right: without length freedom there is exactly
        // one height the tip can be held at, and a learned check agrees
        // (figure8 r140, no telescope, centre 257 → 326.6: 70.3 → 60.9 px,
        // 3 of 3 seeds better).
        //
        // THE OLD [0.55L, 0.95L] CLAMP IS GONE, and it was nearly dead code:
        // traceRadius is declared min 20 / max 200 (trainer.js), and
        // L − 0.45r < 0.55L needs r > L (impossible at every segment count)
        // while > 0.95L needs r < 0.111·L (r < 35.6 at n=4). It read as though
        // it were keeping the curve inside reach; it never was. The clamp below
        // is, and it is measured rather than asserted.
        //
        // traceCenterY OVERRIDES ALL OF THIS, and is now reachable from the
        // app: it is a CURRICULUM_KNOB with a generated slider (0 = auto), read
        // by readParams and threaded through the rollout, the display and the
        // ghosts. Passing a POSITIVE one also short-circuits the settle above,
        // which is what keeps chainTraceReachEnvelope from recursing into
        // buildWorld — 0 is the AUTO sentinel and does NOT short-circuit it,
        // which is exactly the bug the settle shipped with.
        const curveKey = (opts && opts.curveId) || CHAIN_TRACE_DEFAULT_CURVE;
        const overrideY = (opts && opts.traceCenterY != null && opts.traceCenterY > 0)
          ? opts.traceCenterY : null;
        const ext = BF.chainTraceCurves.yExtent(curveKey, traceRadius);
        const DEFAULT_FRAMING_Y = numSegs * segLen - 0.45 * traceRadius;
        let centerY;
        if (overrideY != null) {
          centerY = overrideY;
        } else {
          const reach = chainTraceReachEnvelope(this, opts, numSegs, segLen, materialKey, telescopeOn);
          const lo = reach.tipYMin + ext.top;
          const hi = reach.tipYMax - ext.bot;
          centerY = (lo <= hi)
            ? Math.max(lo, Math.min(hi, DEFAULT_FRAMING_Y))
            : 0.5 * (reach.tipYMin + reach.tipYMax);
        }
        // New scenes are anchored to the rail, independent of the arm's starting
        // lean. Frozen policies trained before this convention can explicitly
        // request their original, pose-dependent anchor. A numeric override wins
        // over either mode; zero is a valid horizontal coordinate, not a sentinel.
        const centerMode = opts && opts.traceCenterMode === 'initial-tip' ? 'initial-tip' : 'rail-midpoint';
        const overrideX = opts && typeof opts.traceCenterX === 'number' && Number.isFinite(opts.traceCenterX)
          ? opts.traceCenterX : null;
        const railMidpoint = Number.isFinite(world.cartMinX) && Number.isFinite(world.cartMaxX)
          ? 0.5 * (world.cartMinX + world.cartMaxX) : world.nodes[cartIdx].x;
        const centerX = overrideX != null ? overrideX : centerMode === 'initial-tip' ? restTip.x : railMidpoint;
        const chainTrace = {
          curveId: curveKey,
          period: (opts && opts.tracePeriod) || CHAIN_TRACE_DEFAULT_PERIOD,
          radius: traceRadius,
          center: {
            x: centerX,
            y: centerY,
          },
          traceTime: 0,
          trail: [],
          // Retain one real word trace at 20 Hz. Presentation only: every
          // physical step still contributes to the tracking objective.
          longTrail: curveKey === 'balance',
        };
        const t0 = mapTarget(chainTrace, 0);
        const telescope = telescopeOn ? {
          springs: world.springs.slice(springStart, springStart + numSegs),
          base: segLen,
          min: 0.5 * segLen,
          max: 1.6 * segLen,
          rate: 2.5 * segLen,          // px/s max rest-length slew
          cmdOffset: 1 + numActuated,  // length cmds sit after cart + joint cmds
        } : null;
        return {
          world, cartIdx, tipIdx, segments,
          chainTrace,
          telescope,
          // TALLER VIEW — the other half of the placement fix above, and the
          // reason the old code was stuck. The renderer pins the rail at 55% of
          // the canvas and fits the default extent {halfW:350, halfH:250}, which
          // shows only ~250 world px BELOW the rail. This chain's resting tip is
          // already at y = numSegs·segLen = 320, so with the default extent the
          // machine's own hand hangs off-screen — which is exactly why the curve
          // was originally hoisted up to y≈130 (out of reach) just to be seen.
          // Widening halfH here zooms out enough to show the whole workspace,
          // so the curve can live where the chain can actually REACH it. Scales
          // with the chain so a user-raised segment count stays framed.
          //
          // AND WITH THE CURVE, not just the chain. Placement and framing are
          // one constraint: a centre pushed deeper by the reach clamp above can
          // walk the curve's bottom off the canvas, which is the exact bug the
          // history note describes, in the other direction. So the third term
          // frames the curve that is actually there.
          //   canvas-sim draws at scale = min((w−80)/2halfW, (h−80)/2halfH) and
          //   pins the rail at 0.55·h, so world y is on-screen while
          //   y ≤ 0.45·h/scale, and scale ≤ (h−80)/(2·halfH) gives
          //   0.45·h/scale ≥ 0.9·halfH·h/(h−80) ≥ 0.9·halfH for EVERY h.
          // So halfH ≥ bottom/0.9 keeps the curve's lowest point visible on any
          // canvas shape — 0.9 is the h→∞ worst case (the factor is 1.06 at
          // h=520, 1.02 at h=700, 0.99 at h=900, and only TALL canvases bind).
          // This term is slack for every scene that already fits: it asks 392
          // for the default circle r60 (centre 293) and 382 for figure-8 r140,
          // both under the 400 the chain term gives. It bites in two places.
          // Where the reach clamp moved something down — triangle r140 → 419,
          // copperplate r140 → 461 at the auto-placement. And where the framing
          // was ALREADY short of its own curve, which measurement turned up on
          // the way past: copperplate at the retired centre 257 has its lowest
          // point at 386 and needed 429, and circle at r200 sat at 430 against
          // 406 visible px on a 1390×700 canvas — i.e. the old extent clipped
          // big curves before any of this changed. Per-scene, deliberately: a
          // global raise would shrink every chain-trace preset to pay for two.
          worldExtent: {
            halfW: 350,
            halfH: Math.max(250, 1.25 * numSegs * segLen, (centerY + ext.bot) / 0.9),
            ...(curveKey === 'balance' ? {
              halfW: Math.max(280, Math.abs(centerX) + traceRadius + 45),
              halfH: Math.max(160, (centerY + ext.bot + 60) / 2),
              centerY: (centerY + ext.bot - 40) / 2,
            } : {}),
          },
          // Reuse the point-target plumbing: observation + reward read the
          // target via getTargetAt(state,t) → state.chainReach.target, which
          // tick() keeps current.
          chainReach: {
            target: { x: t0.x, y: t0.y },
            successRadius: CHAIN_REACH_SUCCESS_RADIUS,
            // REF for the chain_trace closeness reward: scale-relative so
            // do-nothing scores ~0 at any radius. Floor 30 avoids 0/0 at tiny r.
            // ACCEPTING RADIUS (traceAcceptRadius) — the reward's closeness
            // tolerance, DECOUPLED from the curve's geometric size (traceRadius).
            // A curriculum can ramp it LARGE→small: early on, being roughly on
            // the curve scores well (easy); later it demands precise tracking.
            // Off (null) → the classic max(traceRadius,30) so nothing changes.
            distScale: (opts && opts.traceAcceptRadius != null && opts.traceAcceptRadius > 0)
              ? Math.max(CHAIN_REACH_SUCCESS_RADIUS, opts.traceAcceptRadius)
              : Math.max(traceRadius, 30),
            // Long-range approach scale (chain-trace only): with the curve
            // raised to mid-reach, the resting tip starts ~100-160px from the
            // target — beyond distScale, where the sharp closeness bowl is
            // flat zero. The objective blends a weak (15%) far term over the
            // chain's full extension so a fresh policy still feels a gradient
            // toward the curve. Setups that don't set this keep the old math.
            distScaleFar: numSegs * segLen,
          },
          // Control mode for the joint actuators ('torque' | 'servo'). Read by
          // tick → applyChainJointCmds. Default 'torque'. (No actuators → inert.)
          jointControlMode: (opts && opts.jointControlMode) || 'torque',
          // PAINT / COVERAGE mode (opts.chainPaint): instead of chasing the
          // moving cursor, the target curve is THICKENED into a band (acceptable
          // range, half-width w) and the tip is graded on how much of the band
          // its swept path COVERS, minus a penalty for time spent OUTSIDE it
          // (the chain_paint objective). No moving cursor at all — tick freezes
          // it and instead steers the observation toward the nearest UNPAINTED
          // band point, so the policy self-directs its sweep. Band = the same
          // curve the renderer draws, sampled at NS points over one loop. Band
          // half-width reuses the accepting-radius knob (traceAcceptRadius),
          // default 40 (measured sweet spot: sweepers strongly negative, a real
          // tracer maxes). null → classic cursor-tracking chain-trace, unchanged.
          paint: (opts && opts.chainPaint) ? (function () {
            const NS = 120;
            const pts = [];
            for (let i = 0; i < NS; i++) {
              const p = mapTarget(chainTrace, (i / NS) * chainTrace.period);
              pts.push({ x: p.x, y: p.y });
            }
            const w = (opts.traceAcceptRadius != null && opts.traceAcceptRadius > 0)
              ? opts.traceAcceptRadius : 40;
            return {
              pts, NS, w,
              covered: new Uint8Array(NS),
              coveredCount: 0,
              newlyThisStep: 0,
              outsideThisStep: 0,
            };
          })() : null,
          // STROKE / "as few strokes as possible" mode (opts.chainStroke).
          // The tip is a PEN over the same thickened band paint mode uses, but
          // credit is no longer continuity-blind: contact with the band is a
          // STROKE EPISODE, and the episode score is coverage DISCOUNTED by how
          // many separate episodes it took. See the chain_stroke objective for
          // the score algebra; this struct only accumulates the raw facts.
          //
          // TWO radii, deliberately (validated — a single radius is gameable):
          //   w      (traceAcceptRadius, default 40) — the PAINT radius and the
          //          pen-DOWN radius. Also defines "outside" for the time term.
          //   wLift  (= w × strokeLiftRatio, default 1.6) — the pen-UP radius.
          // The gap between them is HYSTERESIS. Without it, a tip that merely
          // jitters across the band edge (numerical or otherwise) registers a
          // fresh stroke every few steps and the counter becomes noise rather
          // than a measure of the drawing. With it, a wobbly-but-continuous pen
          // is one stroke — and the sloppiness it buys is charged separately,
          // through the slop integral, which is measured against the INNER
          // radius. Two thresholds, two jobs. MEASURED: honest drawings score
          // the SAME stroke count at every ratio from 1.0 to 2.0 (1 / 5 / 16),
          // while a pen that merely jitters across the band edge counts 43-109
          // strokes at 1.0 and exactly 1 at 1.6 — and a genuine 2.0w departure
          // still lifts (83 strokes). It suppresses noise, not real lifts.
          //
          // A stroke is COUNTED on the first sample it actually paints, not on
          // pen-down: an episode that earns no new coverage is free but also
          // worthless, so "tap in and out to reset the counter" cannot pay. The
          // invariant is that every unit of coverage credit belongs to exactly
          // one counted stroke.
          stroke: (opts && opts.chainStroke) ? (function () {
            const NS = 120;
            const pts = [];
            for (let i = 0; i < NS; i++) {
              const p = mapTarget(chainTrace, (i / NS) * chainTrace.period);
              pts.push({ x: p.x, y: p.y });
            }
            const w = (opts.traceAcceptRadius != null && opts.traceAcceptRadius > 0)
              ? opts.traceAcceptRadius : 40;
            // Clamped, not silently defaulted: a ratio below 1 would make the
            // pen lift BEFORE it stops inking, which is not a looser setting —
            // it is an incoherent one. Clamp to 1 (= no hysteresis) so an
            // out-of-range value degrades to the honest edge case instead of
            // teleporting back to the default the caller was trying to change.
            const liftRatio = (opts.strokeLiftRatio != null)
              ? Math.max(1, opts.strokeLiftRatio) : 1.6;
            return {
              pts, NS, w,
              wLift: w * liftRatio,
              // Range scale for the dense approach term (mirrors distScaleFar):
              // the chain's full extension, so a fresh policy that is nowhere
              // near the band still feels a pull toward the next unpainted spot.
              far: numSegs * segLen,
              covered: new Uint8Array(NS),
              coveredCount: 0,
              strokes: 0,          // episodes that painted at least one sample
              penDown: false,
              strokeCounted: false, // has THIS episode been counted yet?
              outsideSec: 0,        // seconds with dist-to-band > w (DIAGNOSTIC only)
              // SLOPPINESS integral: ∫ min(1, d/w) dt. This — not the binary
              // "outside" flag — is what the objective charges for. Measured
              // reason: with the validated 40px band on a 100px triangle the
              // band is nearly the whole shape's interior, so a fast SCRIBBLE
              // covers 100% of it in two contact episodes and a binary
              // inside/outside penalty scores it ABOVE a careful 20-stroke
              // drawing. Grading the penalty by how far off the centerline the
              // pen is at every instant separates them the way an eye does.
              slopInt: 0,
              nearInt: 0,           // ∫ (1 − min(1, d/far)) dt  — dense approach
              elapsed: 0,           // rollout seconds so far (slopInt is normalized by it)
              dist: Infinity,       // tip → nearest band sample, this step
              lastIdx: -1,
              dir: 1,               // travel direction along the curve (±1)
              guideIdx: 0,
              // Previous-step mirrors: the objective differences against these.
              prevCoverage: 0, prevStrokes: 0, prevSlopInt: 0, prevNearInt: 0, prevElapsed: 0,
            };
          })() : null,
          // ORDERED mode (opts.chainOrdered): "trace the curve IN ORDER".
          // Like paint there is NO cursor dragging the tip along — the policy
          // sets its own pace. Unlike paint, coverage is worthless unless it
          // happens in the curve's own order: the curve is sampled into NW
          // ordered waypoints and only the FRONTIER waypoint (the next
          // unclaimed one) can ever pay. Touching a far-ahead waypoint earns
          // nothing, which is exactly what makes skipping / teleporting cover
          // unscoreable.
          //
          // The start is LATCHED, not pinned at s=0: the first time the tip
          // enters the band, the nearest waypoint becomes #1 of the required
          // sequence and the order wraps from there. Pinning it at s=0 would
          // force the policy to find one specific point (on the triangle, the
          // top vertex — the least reachable spot on the whole curve) before
          // earning anything. Direction is NOT free: only forward along the
          // curve's own parametrization pays, which is what makes "correct
          // shape, traced BACKWARDS" a distinguishable failure instead of a
          // tie with a perfect trace.
          //
          // Band half-width reuses the accepting-radius knob (traceAcceptRadius,
          // default 40) exactly as paint mode does. null → classic
          // cursor-tracking chain-trace, unchanged.
          ordered: (opts && opts.chainOrdered) ? (function () {
            const NW = 120;
            const pts = [];
            for (let i = 0; i < NW; i++) {
              const p = mapTarget(chainTrace, (i / NW) * chainTrace.period);
              pts.push({ x: p.x, y: p.y });
            }
            const w = (opts.traceAcceptRadius != null && opts.traceAcceptRadius > 0)
              ? opts.traceAcceptRadius : 40;
            let perim = 0;
            for (let i = 0; i < NW; i++) {
              const a = pts[i], b = pts[(i + 1) % NW];
              perim += Math.hypot(b.x - a.x, b.y - a.y);
            }
            // Break radius: how far the tip may stray from its own frontier
            // before the RUN counts as abandoned. It is w PLUS a margin, never
            // a bare multiple of w, and that base term is not cosmetic: because
            // a claim only needs the tip within w of a waypoint, the frontier
            // always sits up to a full band-width AHEAD of the tip along the
            // curve. A threshold that does not clear w therefore breaks a
            // PERFECT trace — measured: at w=70 with a bare min(2.5w, 0.15·P)
            // the flawless run shattered into 4 pieces and scored below a
            // scrambled cover. The margin is itself capped by a fraction of the
            // CURVE so that on a small shape "left the frontier" still means
            // something; without that cap, a lenient accepting radius on a
            // triangle whose sides are 173px would put the threshold beyond any
            // possible hop and the objective would collapse into order-blind
            // coverage.
            const ratio = (opts.orderedBreakRatio != null && opts.orderedBreakRatio > 0)
              ? opts.orderedBreakRatio : 1.5;
            const breakR = w + Math.min(w * ratio, perim * 0.12);
            // THE curriculum knob (orderedRequiredFrac): how much of the curve
            // a single unbroken run has to cover to earn the full budget. 0.3 =
            // "trace any 30% arc of it in order", 1.0 = "the whole loop".
            //
            // This, NOT the accepting radius, is the right difficulty axis for
            // an ordered trace, and that is a measured claim. Widening the band
            // does not merely make the task easier — it destroys the property
            // being trained: at w = 120 on this triangle (23% of the perimeter)
            // a raster SWEEP scores 10.46 against a perfect trace's 10.14, so a
            // band-ramping curriculum would spend its early levels selecting FOR
            // the exact behavior the objective exists to reject, and then have
            // to unlearn it. Shrinking the required arc keeps the band — and so
            // the ordering property — fixed at every level.
            const rf = (opts.orderedRequiredFrac != null && opts.orderedRequiredFrac > 0)
              ? Math.min(1, opts.orderedRequiredFrac) : 1;
            const reqCount = Math.max(4, Math.round(NW * rf));
            return {
              pts, NW, w, breakR, perim, reqCount,
              start: -1,            // latched waypoint index where the CURRENT run began
              doneCount: 0,         // waypoints claimed in order in the CURRENT run
              bestRun: 0,           // longest single in-order run this rollout — the SCORE
              runs: 0,              // completed runs (diagnostic: how fragmented the trace was)
              advancedThisStep: 0,  // increase in bestRun this step (only new-record progress pays)
              outsideThisStep: 0,
              brokeThisStep: 0,
              // Potential-based shaping: px of distance CLOSED toward the
              // frontier waypoint this step. It telescopes over the rollout, so
              // it CANNOT be farmed by parking (Δ = 0 while stationary) and it
              // charges backtracking symmetrically to the credit that advancing
              // earns. shapeRef normalizes px → dimensionless by the chain's
              // full extension, matching distScaleFar.
              shapeDelta: 0,
              shapeRef: numSegs * segLen,
              prevDist: null,
              // Honest headline metric, accumulated here so the HUD, the
              // probes and the objective all read the SAME number: mean
              // distance from the tip to the nearest point of the target
              // curve, in PIXELS. Fitness is not comparable across curve
              // sizes; this is.
              errSum: 0, errSteps: 0,
            };
          })() : null,
        };
      },
      // Advances the moving target each rollout/display step. The trainer eval
      // loop (trainer.js:1937) and the display loop both call setup.tick after
      // the physics step and before kinematics+reward, so the objective sees
      // the just-updated target.
      tick(state, dt) {
        // Apply the policy's joint commands first (no-op when no joints are
        // actuated → base-only chain-trace is byte-unchanged), then advance the
        // moving target.
        applyChainJointCmds(state, state.jointControlMode);
        // Telescoping: each length command is a SERVO TARGET (cmd -1..1 maps to
        // min..max rest length via the base), approached at a bounded slew rate.
        const tel = state.telescope;
        if (tel && state.lastCmds) {
          for (let s = 0; s < tel.springs.length; s++) {
            const cmd = Math.max(-1, Math.min(1, state.lastCmds[tel.cmdOffset + s] || 0));
            const target = cmd >= 0
              ? tel.base + cmd * (tel.max - tel.base)
              : tel.base + cmd * (tel.base - tel.min);
            const sp = tel.springs[s];
            const step = Math.max(-tel.rate * dt, Math.min(tel.rate * dt, target - sp.restLength));
            sp.restLength += step;
          }
        }
        const ct = state.chainTrace;
        const tip = state.world.nodes[state.tipIdx];
        // STROKE MODE: no moving cursor either, but coverage is bookkept as
        // pen-down EPISODES. Order inside the step matters and is asserted by
        // the validation harness: (1) measure distance, (2) resolve the pen
        // transition, (3) paint + count the stroke, (4) integrate the time
        // terms, (5) publish the guidance target for the observation.
        const sk = state.stroke;
        if (sk) {
          sk.prevCoverage = sk.coveredCount / sk.NS;
          sk.prevStrokes  = sk.strokes;
          sk.prevSlopInt  = sk.slopInt;
          sk.prevNearInt  = sk.nearInt;
          sk.prevElapsed  = sk.elapsed;
          sk.elapsed += dt;
          const S = sk.pts, w2 = sk.w * sk.w;
          // (1) nearest band sample + distance.
          let bestD2 = Infinity, ni = 0;
          for (let i = 0; i < sk.NS; i++) {
            const dx = tip.x - S[i].x, dy = tip.y - S[i].y, d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; ni = i; }
          }
          const d = Math.sqrt(bestD2);
          sk.dist = d;
          // Travel direction along the curve — only trust SMALL index steps, so
          // a teleport across the curve (or the wrap seam) can't flip it.
          if (sk.lastIdx >= 0 && ni !== sk.lastIdx) {
            let delta = ni - sk.lastIdx;
            if (delta > sk.NS / 2) delta -= sk.NS;
            if (delta < -sk.NS / 2) delta += sk.NS;
            if (Math.abs(delta) <= sk.NS / 8) sk.dir = delta > 0 ? 1 : -1;
          }
          sk.lastIdx = ni;
          // (2) pen transitions. Down at w, up at wLift (hysteresis band).
          if (!sk.penDown && d <= sk.w) { sk.penDown = true; sk.strokeCounted = false; }
          else if (sk.penDown && d > sk.wLift) { sk.penDown = false; }
          // (3) paint only while the pen is down; count the stroke on its first
          // earned sample.
          if (sk.penDown) {
            for (let i = 0; i < sk.NS; i++) {
              if (sk.covered[i]) continue;
              const dx = tip.x - S[i].x, dy = tip.y - S[i].y;
              if (dx * dx + dy * dy <= w2) {
                sk.covered[i] = 1; sk.coveredCount++;
                if (!sk.strokeCounted) { sk.strokes++; sk.strokeCounted = true; }
              }
            }
          }
          // (4) time terms.
          if (d > sk.w) sk.outsideSec += dt;
          sk.slopInt += Math.min(1, d / sk.w) * dt;
          sk.nearInt += (1 - Math.min(1, d / (sk.far > 0 ? sk.far : 320))) * dt;
          // (5) guidance target. Pen DOWN → the next unpainted sample walking
          // ALONG the curve in the direction of travel (continue the stroke);
          // pen UP → the euclidean-nearest unpainted sample (go re-engage).
          // This is the whole reason a stroke policy is learnable: the guide
          // pulls the pen forward through the curve rather than to whichever
          // gap happens to be closest in space.
          let gi = -1;
          if (sk.penDown) {
            for (let k = 1; k <= sk.NS && gi < 0; k++) {
              const j = ((ni + sk.dir * k) % sk.NS + sk.NS) % sk.NS;
              if (!sk.covered[j]) gi = j;
            }
            if (gi < 0) {
              for (let k = 1; k <= sk.NS && gi < 0; k++) {
                const j = ((ni - sk.dir * k) % sk.NS + sk.NS) % sk.NS;
                if (!sk.covered[j]) gi = j;
              }
            }
          } else {
            let bu = Infinity;
            for (let i = 0; i < sk.NS; i++) {
              if (sk.covered[i]) continue;
              const dx = tip.x - S[i].x, dy = tip.y - S[i].y, d2 = dx * dx + dy * dy;
              if (d2 < bu) { bu = d2; gi = i; }
            }
          }
          if (gi < 0) gi = ni;             // everything painted → hold the nearest
          sk.guideIdx = gi;
          state.chainReach.target.x = S[gi].x;
          state.chainReach.target.y = S[gi].y;
          ct.trail.push(tip.x, tip.y);
          if (ct.trail.length > 240) ct.trail.splice(0, ct.trail.length - 240);
          return;
        }
        // ORDERED MODE: no moving cursor. The FRONTIER waypoint (the next
        // unclaimed one in curve order) is the only thing that can pay, and it
        // waits — it never advances on its own, so the policy sets its own pace.
        //
        // The score is the LONGEST UNBROKEN in-order RUN, not the total number
        // of waypoints visited in order. That distinction is the whole
        // objective, and it was found by measurement, not by design: with plain
        // "total claimed in order", a cover that visits 8 arcs of the curve in
        // SCRAMBLED order but traverses each arc forwards claimed 75% of the
        // waypoints and outscored a perfect trace. Every time it re-crossed the
        // waiting frontier it collected another chunk, so scrambling the arcs
        // cost it almost nothing. Requiring the progress to be UNBROKEN drops
        // that same trajectory to its longest single arc.
        //
        // Step order: (1) band membership + nearest sample, (2) break the run if
        // the tip has abandoned the frontier, (3) latch a new run on contact,
        // (4) claim consecutive frontier waypoints, (5) potential-based shaping,
        // (6) publish the frontier as the observation target.
        const od = state.ordered;
        if (od) {
          const S = od.pts, w2 = od.w * od.w;
          // (1) On the band anywhere? Measured against the WHOLE curve, not the
          // frontier: a policy retracing curve it has already claimed is going
          // the wrong way but it is still ON the drawing, and it should not be
          // charged the same as one flailing through open space. That is what
          // separates "traced backwards" from "teleporting cover".
          let onBand = false, bestD2 = Infinity, nearest = 0;
          for (let i = 0; i < od.NW; i++) {
            const dx = tip.x - S[i].x, dy = tip.y - S[i].y, d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; nearest = i; }
            if (d2 <= w2) onBand = true;
          }
          // (2) BREAK: the run is abandoned once the tip is further than breakR
          // from its own frontier. Note what does NOT break a run — STOPPING.
          // A halted tip sits ~one waypoint spacing from the frontier forever,
          // so a policy may pause as long as it likes mid-trace. Only leaving
          // does damage, which is exactly the "self-paced but monotone" contract.
          od.brokeThisStep = 0;
          if (od.start >= 0 && od.doneCount < od.reqCount) {
            const f = (od.start + od.doneCount) % od.NW;
            const bx = tip.x - S[f].x, by = tip.y - S[f].y;
            if (Math.sqrt(bx * bx + by * by) > od.breakR) {
              od.runs++;
              od.brokeThisStep = 1;
              od.start = -1; od.doneCount = 0; od.prevDist = null;
            }
          }
          // (3) Latch a (re)start on band contact. The origin is wherever the
          // tip touched — the policy picks where to begin, but not which way to
          // go from there.
          if (od.start < 0 && onBand) od.start = nearest;
          // (4) Claim: ONLY the frontier pays, and it pays once. The while-loop
          // lets one step claim several CONSECUTIVE waypoints — a fast tip that
          // sweeps past three 4px-apart samples in one 16ms step really did
          // trace them, and blocking that would only punish speed. It can never
          // claim a far-ahead waypoint, because the loop stops at the first one
          // outside the band.
          let claimed = 0;
          if (od.start >= 0) {
            while (od.doneCount < od.reqCount) {
              const f = (od.start + od.doneCount) % od.NW;
              const dx = tip.x - S[f].x, dy = tip.y - S[f].y;
              if (dx * dx + dy * dy > w2) break;
              od.doneCount++; claimed++;
            }
          }
          // Only a NEW RECORD run pays. Re-walking ground already covered by an
          // earlier, longer run earns nothing, so a policy cannot farm the
          // budget by restarting; and because credit is never clawed back, the
          // per-step reward stays non-negative on the progress channel.
          const adv = Math.max(0, od.doneCount - od.bestRun);
          if (adv > 0) od.bestRun = od.doneCount;
          // (5) Frontier + potential-based shaping. Pre-latch the potential is
          // distance to the CURVE (nearest sample) so a fresh policy still feels
          // a pull toward the drawing; post-latch it is distance to the frontier.
          // Both are pure functions of tip position, so the telescoping sum is
          // bounded and parking earns exactly 0.
          let fi;
          if (od.start < 0) fi = nearest;
          else if (od.doneCount >= od.reqCount) fi = (od.start + od.reqCount - 1) % od.NW;  // complete → hold
          else fi = (od.start + od.doneCount) % od.NW;
          const fdx = tip.x - S[fi].x, fdy = tip.y - S[fi].y;
          const d = Math.sqrt(fdx * fdx + fdy * fdy);
          // On a claim step the frontier JUMPS to a new waypoint; charging that
          // discontinuity would tax the policy for succeeding. Zero it and
          // rebase — the claim itself is what pays for that stretch.
          od.shapeDelta = (claimed > 0 || od.prevDist == null) ? 0 : (od.prevDist - d);
          od.prevDist = d;
          od.advancedThisStep = adv;
          od.outsideThisStep = onBand ? 0 : 1;
          od.errSum += Math.sqrt(bestD2); od.errSteps++;
          // (6) Guidance target for the observation (Δtip→curve) — the frontier.
          // This is the "self-paced cursor": same plumbing as the tracking mode,
          // but it only moves when the policy has earned it.
          state.chainReach.target.x = S[fi].x;
          state.chainReach.target.y = S[fi].y;
          ct.trail.push(tip.x, tip.y);
          if (ct.trail.length > 240) ct.trail.splice(0, ct.trail.length - 240);
          return;
        }
        // PAINT MODE: no moving cursor. Grade band coverage; steer the
        // observation toward the nearest UNPAINTED band point (self-directed
        // sweep, so removing the cursor doesn't remove the guidance signal).
        const pn = state.paint;
        if (pn) {
          const S = pn.pts, w2 = pn.w * pn.w;
          let newly = 0, anyNear = false;
          let bestUncovD = Infinity, bestUncov = -1;
          let bestAnyD = Infinity, bestAny = 0;
          for (let i = 0; i < pn.NS; i++) {
            const dx = tip.x - S[i].x, dy = tip.y - S[i].y, d2 = dx * dx + dy * dy;
            if (d2 <= w2) {
              anyNear = true;
              if (!pn.covered[i]) { pn.covered[i] = 1; pn.coveredCount++; newly++; }
            }
            if (d2 < bestAnyD) { bestAnyD = d2; bestAny = i; }
            if (!pn.covered[i] && d2 < bestUncovD) { bestUncovD = d2; bestUncov = i; }
          }
          pn.newlyThisStep = newly;
          pn.outsideThisStep = anyNear ? 0 : 1;
          const gi = (bestUncov >= 0) ? bestUncov : bestAny; // all painted → nearest
          state.chainReach.target.x = S[gi].x;
          state.chainReach.target.y = S[gi].y;
          ct.trail.push(tip.x, tip.y);
          if (ct.trail.length > 240) ct.trail.splice(0, ct.trail.length - 240);
          return;
        }
        ct.traceTime += dt;
        const p = mapTarget(ct, ct.traceTime);
        state.chainReach.target.x = p.x;
        state.chainReach.target.y = p.y;
        // Record actual physical pen positions, never the target. A word needs
        // a whole loop of ink to make missed letter loops visible.
        if (!ct.longTrail || ct.traceTime >= (ct.nextTrailSample || 0)) {
          ct.trail.push(tip.x, tip.y);
          if (ct.longTrail) ct.nextTrailSample = ct.traceTime + 1 / 20;
          const cap = ct.longTrail ? Math.ceil(ct.period * 20) * 2 : 240;
          if (ct.trail.length > cap) ct.trail.splice(0, ct.trail.length - cap);
        }
      },
      get observationLabels() {
        const out = ['cart x (norm)', 'cart vx (norm)'];
        for (let s = 0; s < this.numSegments; s++) { out.push('sin θ' + (s + 1)); out.push('cos θ' + (s + 1)); out.push('θ̇' + (s + 1)); }
        out.push('Δtip→curve x (norm)'); out.push('Δtip→curve y (norm)');
        if (this.lookahead) {
          // Cursor modes read these as time lookahead (t+0.3s / t+0.8s); STROKE
          // mode has no clock and reads them as arc-length lookahead (+4 / +12
          // band samples along the curve). Same slots, same encoding.
          out.push('Δtip→ahead₁ x (t+0.3s | +4 samples)'); out.push('Δtip→ahead₁ y');
          out.push('Δtip→ahead₂ x (t+0.8s | +12 samples)'); out.push('Δtip→ahead₂ y');
        }
        out.push('bias = 1');
        return out;
      },
      get observationAbbr() {
        const out = ['cx', 'vx'];
        for (let s = 0; s < this.numSegments; s++) { out.push('s' + (s + 1)); out.push('c' + (s + 1)); out.push('v' + (s + 1)); }
        out.push('dx'); out.push('dy');
        if (this.lookahead) { out.push('dx₃'); out.push('dy₃'); out.push('dx₈'); out.push('dy₈'); }
        out.push('1');
        return out;
      },
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const out = [clamp(cart.x / 240, -1.5, 1.5), clamp(cart.vx / 600, -2, 2)];
        for (let s = 0; s < state.segments.length; s++) {
          const [a, b] = state.segments[s];
          const theta = segmentAngle(w, a, b);
          const nb = w.nodes[b], na = w.nodes[a];
          const dx = nb.x - na.x, dy = nb.y - na.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const dvx = nb.vx - na.vx, dvy = nb.vy - na.vy;
          const omega = (-dy * dvx + dx * dvy) / (len * len);
          out.push(Math.sin(theta)); out.push(Math.cos(theta)); out.push(clamp(omega / 8, -2, 2));
        }
        const tip = w.nodes[state.tipIdx];
        const tgt = getTargetAt(state, state.simTime || 0);
        out.push(clamp((tip.x - tgt.x) / 240, -2, 2));
        out.push(clamp((tip.y - tgt.y) / 240, -2, 2));
        // Lookahead: the tip's FUTURE error vectors (see the field comment).
        // Encoding matches the MEASURED probe config exactly: (tip − cursor)/240,
        // same sign convention as the base Δtip→curve inputs above. The ±3 clamp
        // (=720px) is a wide safety net only — it cannot saturate over the real
        // range (the putt lesson: a clamped input that saturates over the
        // trained range silently blinds the policy). Gated on the INSTANCE flag
        // (not state) so it can never desync from the genome dimension, which is
        // also sized from the instance. In paint mode traceTime is frozen, so
        // these become static — harmless, but don't combine lookahead with
        // chainPaint in a preset.
        if (this.lookahead) {
          const sk = state.stroke;
          let pA, pB;
          if (sk) {
            // STROKE mode has no cursor and no clock, so "t + 0.3s / t + 0.8s"
            // is meaningless — traceTime is frozen and the classic lookahead
            // would be a pair of CONSTANTS. The honest analogue is ARC-LENGTH
            // lookahead: the band samples STROKE_LA1 / STROKE_LA2 further along
            // the curve than the current guide point, in the pen's direction of
            // travel. Same encoding as the measured cursor version ((tip−p)/240,
            // ±3 clamp) — the reproducibility lesson from the tracker sweep is
            // that "equivalent" re-scalings do not reproduce, so the numbers the
            // policy sees are byte-identical in form.
            const gi = sk.guideIdx | 0, dir = sk.dir >= 0 ? 1 : -1;
            pA = sk.pts[((gi + dir * STROKE_LA1) % sk.NS + sk.NS) % sk.NS];
            pB = sk.pts[((gi + dir * STROKE_LA2) % sk.NS + sk.NS) % sk.NS];
          } else {
            const ct = state.chainTrace;
            pA = mapTarget(ct, ct.traceTime + 0.3);
            pB = mapTarget(ct, ct.traceTime + 0.8);
          }
          out.push(clamp((tip.x - pA.x) / 240, -3, 3));
          out.push(clamp((tip.y - pA.y) / 240, -3, 3));
          out.push(clamp((tip.x - pB.x) / 240, -3, 3));
          out.push(clamp((tip.y - pB.y) / 240, -3, 3));
        }
        out.push(1);
        return out;
      },
      isAlive() { return true; },
    };
  }

  // ----- epicycle (Fourier signing machine) ----------------------------------
  // THE PLANT THE CHAIN COULD NEVER BE. chain-trace's joints are TRIM TABS: a
  // full ±1 servo command deflects a joint by 1–4.5° and the range is capped at
  // ±90° around rest. An epicycle arm must rotate CONTINUOUSLY and at a
  // CONSTANT rate forever, so the chain physically cannot be one — hence a new
  // setup rather than a new mode on the old one.
  //
  // THE MACHINE. js/curve_fourier.js turns the target curve into N nested arms:
  // arm j has FIXED length |c_j| and turns k_j times per loop. Summing them IS
  // the truncated Fourier series, so the tip traces the best possible N-arm
  // approximation of the curve BY CONSTRUCTION (verified 1.6e-13 px vs the
  // analytic reconstruction, headless).
  //
  // TWO DRIVE MODES, and they are NOT the same claim:
  //   'analytic' (default) — arm angles are SET from the closed-form solution
  //     each tick. This is an ENGINEERED/ANALYTIC reference in the same family
  //     as rigid-lqr and the chain-trace planner: zero training, zero policy,
  //     the drawing is exact. Do not report it as learned control.
  //   'rate' — each arm gets a velocity-servo revolute motor: the policy
  //     commands ω_j ∈ [-1,1] × ωmax and the angle INTEGRATES. Unbounded
  //     rotation, which is the one thing the chain joint cannot do. The DFT
  //     answer is the constant command u_j = k_j / kRateMax, so this is a
  //     learnable task with a KNOWN optimum — an optimizer benchmark, not a
  //     mystery. Phases start at zero (not warm-started from the DFT) unless
  //     epiWarmPhase, so the policy must both spin up AND phase-align.
  //
  // WHY THE NODES ARE ROLE.FIXED. The arms are a MINIMAL-COORDINATE mechanism
  // (angles are the state), exactly the rigid_double.js lesson: a Verlet
  // spring/rod chain cannot hold arm length under continuous rotation without
  // stiffness that corrupts everything. P.step therefore does nothing to these
  // nodes and tick() writes both positions and velocities. world.cart stays
  // null, so the renderer draws no rail and no cart arrow.
  const EPI_DEFAULT_CURVE = 'autograph';
  const EPI_DEFAULT_RADIUS = 140;
  const EPI_DEFAULT_PERIOD = 8;    // seconds per loop of the machine
  const EPI_MAX_ARMS = 32;
  const EPI_K_RATE_MAX = 8;        // 'rate' mode: |ω| ceiling in turns-per-loop

  function makeEpicycle() {
    const TAU = Math.PI * 2;
    const clampArms = (n) => Math.max(1, Math.min(EPI_MAX_ARMS, n | 0));
    return {
      id: 'epicycle',
      label: 'Epicycle signer (Fourier arms)',
      relevantObjectiveIds: ['chain_trace'],
      numArms: 8,
      drive: 'analytic',
      telescope: false,
      // 2 per arm (sin/cos of its angle) + Δtip→cursor + phase clock + bias.
      observationCount: 2 * 8 + 5,
      actionCount: 1,
      setObservationShape(opts) {
        if (opts && opts.numArms != null) this.numArms = clampArms(opts.numArms);
        this.observationCount = 2 * this.numArms + 5;
      },
      // Action shape follows the DRIVE mode: 'analytic' ignores the policy
      // entirely (1 inert output so the genome stays trivially small); 'rate'
      // needs one rate per arm, plus one length per arm when telescoping.
      setActionShape(opts) {
        if (opts && opts.numArms != null) this.numArms = clampArms(opts.numArms);
        if (opts && opts.drive != null) this.drive = (opts.drive === 'rate') ? 'rate' : 'analytic';
        if (opts && opts.telescope != null) this.telescope = !!opts.telescope;
        this.actionCount = (this.drive === 'rate')
          ? this.numArms * (this.telescope ? 2 : 1)
          : 1;
        this.observationCount = 2 * this.numArms + 5;
      },
      // Output vocabulary. Order matches tick()'s cmds indexing exactly:
      // rate mode = one angular rate per arm, then (telescope) one length per
      // arm; analytic mode = a single inert output the closed-form drive
      // ignores, which the chord should say out loud rather than pretend is a
      // control channel.
      get actionLabels() {
        if (this.drive !== 'rate') return ['(unused — analytic drive)'];
        const L = [];
        for (let j = 0; j < this.numArms; j++) L.push('arm ' + (j + 1) + ' angular rate');
        if (this.telescope) for (let j = 0; j < this.numArms; j++) L.push('arm ' + (j + 1) + ' length');
        return L;
      },
      get actionAbbr() {
        if (this.drive !== 'rate') return ['—'];
        const A = [];
        for (let j = 0; j < this.numArms; j++) A.push('ω' + (j + 1));
        if (this.telescope) for (let j = 0; j < this.numArms; j++) A.push('r' + (j + 1));
        return A;
      },
      buildWorld(opts) {
        const CF = BF.curveFourier;
        if (!CF) throw new Error('epicycle setup needs js/curve_fourier.js loaded first');
        const curveId = (opts && opts.curveId) || EPI_DEFAULT_CURVE;
        const radius = finiteRadius(opts && opts.traceRadius, EPI_DEFAULT_RADIUS);
        const period = (opts && opts.tracePeriod) || EPI_DEFAULT_PERIOD;
        // Basis: 'auto' takes the MEASURED per-curve recommendation — 'even'
        // (there-and-back, = the DCT) for OPEN strokes whose pen-lift jump
        // would otherwise cost a permanent half-jump Gibbs error, plain 'dft'
        // for closed curves where the even basis just doubles the arm count.
        const reco = CF.recommend(curveId);
        const basisOpt = (opts && opts.epiBasis) || 'auto';
        const basis = (basisOpt === 'auto') ? reco.mode : (basisOpt === 'even' ? 'even' : 'dft');
        const numArms = clampArms(
          (opts && opts.epiArms != null) ? opts.epiArms : (this.numArms || reco.N));
        const drive = ((opts && opts.epiDrive) || this.drive) === 'rate' ? 'rate' : 'analytic';
        const telescope = (opts && opts.epiTelescope != null) ? !!opts.epiTelescope : !!this.telescope;
        const warmPhase = !!(opts && opts.epiWarmPhase);

        // ONE analysis per world build (measured 1–8 ms), never per step.
        const model = CF.analyze(curveId, { samples: 1024, mode: basis, kMax: 128 });
        // Same unit→world MAPPING the chain-trace setup and the renderer use
        // (worldX = center.x + u.x·radius), so the ghost-curve overlay lines up
        // with no renderer special-casing. The CENTRE is this setup's own and
        // deliberately not shared: chainTraceReachEnvelope's settle-and-clamp
        // answers "where can a hanging chain hold its tip", and none of that
        // applies here — this mechanism has a FIXED base, zero gravity and rigid
        // arms, so its reachable set is a disc of the arm sum about the base and
        // every point of the curve is reachable by construction. Placement
        // changes on the chain-trace side must not be propagated here.
        const center = { x: 0, y: 230 - radius };
        const spec = CF.toWorld(model, numArms, radius, center);

        const world = P.makeWorld(opts);
        world.gravity = 0;      // a driven mechanism, not a pendulum
        const baseIdx = P.addNode(world, spec.base.x, spec.base.y,
          { mass: 1, radius: 7, label: 'base', role: P.Role.FIXED });
        const idxs = [baseIdx];
        const segments = [];
        let px = spec.base.x, py = spec.base.y;
        for (let j = 0; j < spec.arms.length; j++) {
          const a = spec.arms[j];
          const th = warmPhase ? a.phase : 0;
          px += a.r * Math.cos(th); py += a.r * Math.sin(th);
          const isTip = (j === spec.arms.length - 1);
          const idx = P.addNode(world, px, py, {
            // Small pivots: at N=32 the outer arms are only a few px long, so
            // the standard skeleton bobs would merge into one blob.
            mass: 1, radius: isTip ? 8 : 3,
            label: isTip ? 'tip' : ('arm' + (j + 1)),
            role: P.Role.FIXED,
          });
          idxs.push(idx);
          segments.push([idxs[j], idx]);
        }
        const tipIdx = idxs[idxs.length - 1];

        // Auto-frame: the arms sum to more than the curve's own radius, so a
        // fixed viewport would clip the outermost ones.
        let reach = 0; for (const a of spec.arms) reach += a.r;
        const chainTrace = {
          curveId: curveId, period: period, radius: radius, center: center,
          traceTime: 0, trail: [],
        };
        const t0 = mapEpiTarget(chainTrace, model, 0);
        return {
          world: world, cartIdx: baseIdx, tipIdx: tipIdx, segments: segments,
          // The renderer's existing chain-trace overlay (ghost curve + fading
          // tip trail + cursor dot) keys off this object — free, no changes.
          chainTrace: chainTrace,
          // Machine state. `theta` is the real state vector; node positions are
          // a rendering of it.
          epi: {
            model: model, basis: basis, drive: drive, telescope: telescope,
            numArms: spec.arms.length, period: period, radius: radius,
            center: center, base: spec.base, idxs: idxs,
            r: spec.arms.map(a => a.r),
            r0: spec.arms.map(a => a.r),
            k: spec.arms.map(a => a.k),
            phase: spec.arms.map(a => a.phase),
            theta: spec.arms.map(a => (warmPhase ? a.phase : 0)),
            // The rate ceiling MUST cover the fastest arm this model needs, or
            // the DFT optimum stops being representable and 'rate' mode is
            // quietly unsolvable for the high harmonics (a silent-ceiling bug
            // of exactly the saturating-observation kind).
            kRateMax: Math.max(EPI_K_RATE_MAX, ...spec.arms.map(a => Math.abs(a.k)), 1),
            time: 0, reach: reach,
            // LIVE ACCURACY GAUGE — accumulated PER PHYSICS STEP by tick(), not
            // per frame, because a renderer-side average would be sampled at
            // whatever loop phase the frame happened to catch (and at whatever
            // frame rate the tab is running). In 'analytic' drive this number
            // IS the N-arm truncation error, live, so the readout can honestly
            // answer "how good is N arms" without a separate probe.
            //   errMean — mean |pen − cursor| over the last COMPLETED loop
            //             (the running mean of the loop in flight until one
            //             completes). errPeak is the matching worst case.
            //   errLast — this step's error, for the instantaneous readout.
            // The err{Sum,Count,RunPeak,Loop} fields are the accumulator;
            // renderers should read only errMean / errPeak / errLast.
            errLast: 0, errMean: 0, errPeak: 0,
            errSum: 0, errCount: 0, errRunPeak: 0, errLoop: 0,
            errMeanLoop: null, errPeakLoop: null,
          },
          chainReach: {
            target: { x: t0.x, y: t0.y },
            successRadius: CHAIN_REACH_SUCCESS_RADIUS,
            distScale: Math.max(radius, 30),
            distScaleFar: Math.max(radius, reach),
          },
          worldExtent: {
            halfW: Math.max(350, reach + Math.abs(center.x) + 60),
            halfH: Math.max(250, reach + Math.abs(center.y) + 60),
          },
        };
      },
      tick(state, dt) {
        const e = state.epi, w = state.world;
        e.time += dt;
        const cmds = state.lastCmds || [];
        if (e.drive === 'rate') {
          // Velocity-servo revolute motors: the command IS the angular rate.
          // Unbounded integration — this is the DOF the chain joint lacks.
          const wmax = TAU * e.kRateMax / e.period;
          for (let j = 0; j < e.numArms; j++) {
            const u = clamp(cmds[j] || 0, -1, 1);
            e.theta[j] += u * wmax * dt;
          }
          if (e.telescope) {
            // Optional prismatic arms: command maps to 0…1.6× the DFT length,
            // rate-limited so lengths glide rather than teleport.
            const off = e.numArms, rate = 1.5 * e.radius;
            for (let j = 0; j < e.numArms; j++) {
              const u = clamp(cmds[off + j] || 0, -1, 1);
              const want = e.r0[j] * (0.8 + 0.8 * u);
              const step = clamp(want - e.r[j], -rate * dt, rate * dt);
              e.r[j] += step;
            }
          }
        } else {
          // ANALYTIC: the closed-form solution, no policy involved. Uses
          // time/period rather than the wrapped s so the angle ACCUMULATES the
          // way the rate-mode integrator does — identical mod 2π, but the two
          // drives are then directly comparable instead of one resetting each
          // loop.
          const u = e.time / e.period;
          for (let j = 0; j < e.numArms; j++) e.theta[j] = e.phase[j] + TAU * e.k[j] * u;
        }
        // Render the angle state into node positions AND velocities (P.step
        // zeroes velocities for FIXED nodes, so tick is the only writer).
        let px = e.base.x, py = e.base.y, vx = 0, vy = 0;
        const n0 = w.nodes[e.idxs[0]];
        n0.x = px; n0.y = py; n0.px = px; n0.py = py; n0.vx = 0; n0.vy = 0;
        for (let j = 0; j < e.numArms; j++) {
          const th = e.theta[j], r = e.r[j];
          const c = Math.cos(th), sn = Math.sin(th);
          // dθ/dt: analytic mode knows it exactly; rate mode replays the command.
          const om = (e.drive === 'rate')
            ? clamp(cmds[j] || 0, -1, 1) * TAU * e.kRateMax / e.period
            : TAU * e.k[j] / e.period;
          px += r * c; py += r * sn;
          vx += -r * sn * om; vy += r * c * om;
          const nd = w.nodes[e.idxs[j + 1]];
          nd.px = nd.x; nd.py = nd.y;
          nd.x = px; nd.y = py; nd.vx = vx; nd.vy = vy;
        }
        // Moving cursor on the TARGET curve — same seam chain-trace uses, so
        // the chain_trace objective and the overlay both work unchanged.
        state.chainTrace.traceTime = e.time;   // kept in sync for any chain-trace reader
        const p = mapEpiTarget(state.chainTrace, e.model, e.time);
        state.chainReach.target.x = p.x;
        state.chainReach.target.y = p.y;
        const tip = w.nodes[state.tipIdx];
        // Truncation-error gauge (see the epi.err* fields). One hypot per step.
        // Bucketed by LOOP index so the reported mean is always over a whole
        // loop — a partial-loop mean is biased by wherever the pen happens to
        // be on the curve (the error is far from uniform along a signature).
        const derr = Math.hypot(tip.x - p.x, tip.y - p.y);
        e.errLast = derr;
        e.errSum += derr; e.errCount++;
        if (derr > e.errRunPeak) e.errRunPeak = derr;
        const loopIdx = Math.floor(e.time / e.period);
        if (loopIdx > e.errLoop) {
          e.errMeanLoop = e.errSum / Math.max(1, e.errCount);
          e.errPeakLoop = e.errRunPeak;
          e.errSum = 0; e.errCount = 0; e.errRunPeak = 0; e.errLoop = loopIdx;
        }
        e.errMean = (e.errMeanLoop != null) ? e.errMeanLoop
                                            : (e.errCount > 0 ? e.errSum / e.errCount : 0);
        e.errPeak = (e.errPeakLoop != null) ? e.errPeakLoop : e.errRunPeak;
        state.chainTrace.trail.push(tip.x, tip.y);
        // One full loop of trail at 120 Hz, so the finished signature stays
        // visible instead of scrolling away mid-stroke.
        const cap = 2 * Math.ceil(e.period * 120) + 4;
        if (state.chainTrace.trail.length > cap) {
          state.chainTrace.trail.splice(0, state.chainTrace.trail.length - cap);
        }
      },
      get observationLabels() {
        const out = [];
        for (let j = 0; j < this.numArms; j++) { out.push('sin θ' + (j + 1)); out.push('cos θ' + (j + 1)); }
        out.push('Δtip→curve x (norm)'); out.push('Δtip→curve y (norm)');
        out.push('sin(loop phase)'); out.push('cos(loop phase)'); out.push('bias = 1');
        return out;
      },
      get observationAbbr() {
        const out = [];
        for (let j = 0; j < this.numArms; j++) { out.push('s' + (j + 1)); out.push('c' + (j + 1)); }
        out.push('dx'); out.push('dy'); out.push('ps'); out.push('pc'); out.push('1');
        return out;
      },
      buildObservation(state) {
        const e = state.epi, w = state.world;
        const out = [];
        for (let j = 0; j < e.numArms; j++) { out.push(Math.sin(e.theta[j])); out.push(Math.cos(e.theta[j])); }
        const tip = w.nodes[state.tipIdx];
        const tgt = getTargetAt(state, state.simTime || 0);
        // Scale by the machine's own reach, not a magic 240: these inputs must
        // not saturate over the trained range (the putt lesson).
        const sc = Math.max(60, e.reach);
        out.push(clamp((tip.x - tgt.x) / sc, -2, 2));
        out.push(clamp((tip.y - tgt.y) / sc, -2, 2));
        const s = (e.time % e.period) / e.period;
        out.push(Math.sin(TAU * s)); out.push(Math.cos(TAU * s));
        out.push(1);
        return out;
      },
      isAlive() { return true; },
    };
  }
  // Cursor on the TARGET curve at absolute time t. In the 'even' basis the
  // machine draws the stroke there-and-back, so the cursor must walk the SAME
  // reparametrized path or the tracking error would be graded against a path
  // the machine was never asked to trace.
  function mapEpiTarget(ct, model, t) {
    const T = ct.period > 0 ? ct.period : 1;
    let s = (((t % T) + T) % T) / T;
    if (model.mode === 'even') s = BF.curveFourier.triWave(s);
    const u = BF.chainTraceCurves.resolve(ct.curveId).fn(s);
    return { x: ct.center.x + u.x * ct.radius, y: ct.center.y + u.y * ct.radius };
  }

  // ========== Setup: Single pendulum + ball (hit-ball objective) ==========
  // Same single-pendulum world as `single`, plus a free ball spawned per the
  // user-selected mode. Observation includes ball position relative to the
  // bob (3 extra channels) so the policy can sense the target. The setup's
  // `tick` hook is called by the trainer after each physics step to advance
  // the ball state machine (spawn / track / detect escape) and resolve any
  // collisions between the bob and the ball.
  function makeBallSingle() {
    const segLen = 140;
    return {
      id: 'ball-single',
      label: 'Ball-hit (single pendulum)',
      relevantObjectiveIds: ['hit_ball_fast', 'hit_ball_back', 'bounce_ball_out'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.05;
        const bobX = world.nodes[cartIdx].x + Math.sin(startAngle) * segLen;
        const bobY = world.nodes[cartIdx].y - Math.cos(startAngle) * segLen;
        const bobIdx = P.addNode(world, bobX, bobY, { mass: 1, radius: 12, label: 'bob' });
        P.addRod(world, cartIdx, bobIdx, segLen);
        const ball = BF.ball.makeState({
          mode:        opts.ballMode,
          spawnX:      opts.ballSpawnX,
          spawnY:      opts.ballSpawnY,
          spawnVx:     opts.ballSpawnVx,
          spawnDelay:  opts.ballSpawnDelay,
          driftSpeed:  opts.ballDriftSpeed,
          mass:        opts.ballMass,
          radius:      opts.ballRadius,
          restitution: opts.ballRestitution,
        });
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: bobIdx,
          segments: [[cartIdx, bobIdx]],
          ball: ball,
          rail: { minX: DEFAULT_RAIL.minX, maxX: DEFAULT_RAIL.maxX },
        };
      },
      observationCount: 12,
      observationLabels: [
        'cart x position', 'cart velocity',
        'sin(angle from up)', 'cos(angle from up)',
        'angular velocity',
        'ball Δx (vs bob)', 'ball Δy (vs bob)', 'ball proximity (1 = touching)',
        'ball vx (normalized)', 'ball vy (normalized)',
        'struck flag (0/1)',
        'bias (constant 1)',
      ],
      observationAbbr: ['cx', 'vx', 'sθ', 'cθ', 'av', 'bΔx', 'bΔy', 'bp', 'bvx', 'bvy', 'sf', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const bob = w.nodes[state.tipIdx];
        const ang = segmentAngle(w, state.cartIdx, state.tipIdx);
        const dx = bob.x - cart.x;
        const dy = bob.y - cart.y;
        const angVel = ((bob.vx - cart.vx) * (-dy) + (bob.vy - cart.vy) * (dx)) / (segLen * segLen);
        let ballDx = 0, ballDy = 0, ballProx = 0;
        let ballVx = 0, ballVy = 0;
        let struckFlag = 0;
        if (state.ball && state.ball.spawned) {
          const ball = w.nodes[state.ball.idx];
          ballDx = clamp((ball.x - bob.x) / 240, -2, 2);
          ballDy = clamp((ball.y - bob.y) / 240, -2, 2);
          // Proximity: 1 when overlapping, 0 when far. Inverse-distance in
          // bob-radius units, capped.
          const dxBb = ball.x - bob.x, dyBb = ball.y - bob.y;
          const dist = Math.hypot(dxBb, dyBb);
          ballProx = clamp(1 - dist / 160, 0, 1);
          // Ball velocity + struck flag — same rationale as golf:
          // post-strike trajectory is invisible without this; the
          // policy can't tell if a hit registered or which way the
          // ball is going.
          ballVx = clamp(ball.vx / 600, -2, 2);
          ballVy = clamp(ball.vy / 600, -2, 2);
          struckFlag = state.ball.hits > 0 ? 1.0 : 0.0;
        }
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(ang),
          Math.cos(ang),
          clamp(angVel * 0.3, -3, 3),
          ballDx,
          ballDy,
          ballProx,
          ballVx,
          ballVy,
          struckFlag,
          1.0,
        ];
      },
      isAlive() { return true; },
      // Setup-level tick — called by trainer.evaluatePolicy after each
      // physics step, before kinematics + reward. Drives the ball state
      // machine and resolves collisions.
      tick(state, dt) {
        if (!state.ball) return;
        BF.ball.tick(state.ball, state.world, state.rail);
        BF.ball.resolveCollisions(state.ball, state.world, state.segments, dt);
      },
    };
  }

  // ========== Setup: Spring flail ==========
  // Cart → rigid stick → spring → tip. The first segment is a fixed-length
  // rod (so the mid joint moves rigidly with the cart's swing), then a
  // spring connects the mid to a free tip. Result: a "flail" with a heavy
  // head that lags behind the rigid handle and oscillates against the
  // spring restoring force — a meaningfully harder balance problem than
  // either pure-rigid double pendulum or pure-spring pendulum.
  function makeSpringFlail() {
    const stickLen = 90;
    const springRest = 80;
    return {
      id: 'spring-flail',
      label: 'Spring flail (rigid + spring)',
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.05;
        const midX = Math.sin(startAngle) * stickLen;
        const midY = -Math.cos(startAngle) * stickLen;
        const mid = P.addNode(world, midX, midY, { mass: 1, radius: 10, label: 'mid' });
        const tipX = midX + Math.sin(startAngle) * springRest;
        const tipY = midY - Math.cos(startAngle) * springRest;
        const tip = P.addNode(world, tipX, tipY, { mass: 1.2, radius: 13, label: 'tip' });
        P.addRod(world, cartIdx, mid, stickLen);
        P.addSpring(world, mid, tip, { stiffness: 90, damping: 5, restLength: springRest });
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: tip,
          midIdx: mid,
          // Only the rigid segment is in `segments` for kinematics
          // (chainAvg). The springy second link contributes to fitness
          // through tip height instead.
          segments: [[cartIdx, mid]],
        };
      },
      observationCount: 8,
      observationLabels: [
        'cart x position', 'cart velocity',
        'sin(stick θ)', 'cos(stick θ)',
        'mid velocity (rel cart)',
        'spring stretch ratio',
        'tip velocity (rel mid)',
        'bias',
      ],
      observationAbbr: ['cx', 'vx', 'sθ', 'cθ', 'vm', 'sp', 'vt', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const mid = w.nodes[state.midIdx];
        const tip = w.nodes[state.tipIdx];
        const ang = segmentAngle(w, state.cartIdx, state.midIdx);
        const sx = tip.x - mid.x, sy = tip.y - mid.y;
        const slen = Math.hypot(sx, sy);
        const stretch = (slen - springRest) / springRest;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(ang),
          Math.cos(ang),
          clamp((mid.vx - cart.vx) / 800, -2, 2),
          clamp(stretch, -1.5, 1.5),
          clamp((tip.vx - mid.vx) / 800, -2, 2),
          1.0,
        ];
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Twin pendulum (rigid + spring side-by-side) ==========
  // The cart hosts TWO pendulums in parallel: a normal rigid one (the
  // "main") and a spring-coupled one (the "interferer"). Both swing
  // independently driven by the same cart motion. Default goal is to
  // keep the rigid one upright while the spring one bounces around
  // chaotically — coupling only goes through the shared cart.
  function makeTwinPendulum() {
    const rigidLen = 130;
    const springLen = 130;
    return {
      id: 'twin',
      label: 'Twin pendulum (rigid + spring)',
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : 0.06;
        // Rigid pendulum, slightly tilted to the LEFT so it visually
        // separates from its spring-coupled sibling.
        const r1x = Math.sin(-startAngle) * rigidLen;
        const r1y = -Math.cos(-startAngle) * rigidLen;
        const rigidBob = P.addNode(world, r1x, r1y, {
          mass: 1, radius: 12, label: 'rigid-bob',
        });
        P.addRod(world, cartIdx, rigidBob, rigidLen);
        // Spring pendulum, tilted to the RIGHT. Spring connects cart to
        // bob directly (no anchor) so the spring acts like a soft rod.
        const s1x = Math.sin(startAngle * 1.2) * springLen;
        const s1y = -Math.cos(startAngle * 1.2) * springLen;
        const springBob = P.addNode(world, s1x, s1y, {
          mass: 1, radius: 11, label: 'spring-bob',
        });
        P.addSpring(world, cartIdx, springBob, {
          stiffness: 70, damping: 4, restLength: springLen,
        });
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: rigidBob,        // rigid is the "primary" tip for kinematics
          springBobIdx: springBob,
          // Only the rigid segment counts for chainAvg — the spring bob
          // contributes through the spring-stretch observation.
          segments: [[cartIdx, rigidBob]],
        };
      },
      observationCount: 9,
      observationLabels: [
        'cart x position', 'cart velocity',
        'sin(rigid θ)', 'cos(rigid θ)',
        'rigid angular vel',
        'sin(spring θ)', 'cos(spring θ)',
        'spring stretch ratio',
        'bias',
      ],
      observationAbbr: ['cx', 'vx', 'sR', 'cR', 'aR', 'sS', 'cS', 'st', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const rigid = w.nodes[state.tipIdx];
        const spring = w.nodes[state.springBobIdx];
        const angR = segmentAngle(w, state.cartIdx, state.tipIdx);
        const angS = segmentAngle(w, state.cartIdx, state.springBobIdx);
        const dxR = rigid.x - cart.x, dyR = rigid.y - cart.y;
        const angVelR = ((rigid.vx - cart.vx) * (-dyR) + (rigid.vy - cart.vy) * dxR) / (rigidLen * rigidLen);
        const ssx = spring.x - cart.x, ssy = spring.y - cart.y;
        const slen = Math.hypot(ssx, ssy);
        const stretch = (slen - springLen) / springLen;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(angR), Math.cos(angR),
          clamp(angVelR * 0.3, -3, 3),
          Math.sin(angS), Math.cos(angS),
          clamp(stretch, -1.5, 1.5),
          1.0,
        ];
      },
      isAlive() { return true; },
      // Tick hook: resolve circle-circle collisions between the rigid and
      // spring bobs each step. Without this, the two pendulums pass through
      // each other and the spring one can't actually interfere with the
      // rigid one — defeating the whole point of the setup.
      tick(state, dt) {
        collideTwoNodes(state.world, state.tipIdx, state.springBobIdx, dt, 0.5);
      },
    };
  }

  // Generic circle-circle collision between two FREE-role world nodes.
  // Symmetric (no role asymmetry), inverse-mass-weighted positional
  // separation + restitution-bounded impulse along the contact normal,
  // applied via Verlet px/py editing. e = restitution coefficient.
  function collideTwoNodes(world, idxA, idxB, dt, e) {
    const a = world.nodes[idxA], b = world.nodes[idxB];
    if (!a || !b || a === b) return;
    if (a.role === 2 || b.role === 2) return;  // FIXED can't move
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist2 = dx * dx + dy * dy;
    const minDist = (a.radius || 8) + (b.radius || 8);
    if (dist2 >= minDist * minDist || dist2 < 1e-9) return;
    const dist = Math.sqrt(dist2);
    const nx = dx / dist, ny = dy / dist;
    const overlap = minDist - dist;
    const invA = 1 / Math.max(0.01, a.mass);
    const invB = 1 / Math.max(0.01, b.mass);
    const totalInv = invA + invB;
    if (totalInv < 1e-6) return;
    // Separate positions: push apart along normal.
    a.x -= nx * overlap * (invA / totalInv);
    a.y -= ny * overlap * (invA / totalInv);
    b.x += nx * overlap * (invB / totalInv);
    b.y += ny * overlap * (invB / totalInv);
    // Relative velocity along normal.
    const relVx = b.vx - a.vx, relVy = b.vy - a.vy;
    const relAlongN = relVx * nx + relVy * ny;
    if (relAlongN > 0) return;  // already separating
    const restit = e != null ? e : 0.5;
    const j = -(1 + restit) * relAlongN / totalInv;
    const jx = j * nx, jy = j * ny;
    const aVx = a.vx - jx * invA, aVy = a.vy - jy * invA;
    const bVx = b.vx + jx * invB, bVy = b.vy + jy * invB;
    a.px = a.x - aVx * dt;  a.py = a.y - aVy * dt;
    b.px = b.x - bVx * dt;  b.py = b.y - bVy * dt;
  }

  // Collide a FREE node against an UNMOVABLE circle (the golf ground lumps).
  // Same math as collideTwoNodes with the static side's inverse mass = 0: the
  // node takes all the separation and the full normal impulse. Normal-only
  // impulse preserves tangential velocity, so a rolling ball genuinely climbs
  // up and over the dome instead of stopping dead.
  function collideNodeWithStaticCircle(node, cx, cy, r, e, dt) {
    if (!node || node.role === 2) return;
    const dx = node.x - cx, dy = node.y - cy;
    const dist2 = dx * dx + dy * dy;
    const minDist = (node.radius || 8) + r;
    if (dist2 >= minDist * minDist || dist2 < 1e-9) return;
    const dist = Math.sqrt(dist2);
    const nx = dx / dist, ny = dy / dist;
    node.x += nx * (minDist - dist);
    node.y += ny * (minDist - dist);
    const relAlongN = node.vx * nx + node.vy * ny;
    if (relAlongN >= 0) {
      // Already separating — keep the velocity, just resync Verlet history
      // to the corrected position.
      node.px = node.x - node.vx * dt;
      node.py = node.y - node.vy * dt;
      return;
    }
    const restit = e != null ? e : 0.5;
    const j = -(1 + restit) * relAlongN;    // static side: invMass 0
    const vX = node.vx + j * nx, vY = node.vy + j * ny;
    node.px = node.x - vX * dt;
    node.py = node.y - vY * dt;
  }

  // Fixed inclined floor, with an outward normal pointing above the surface.
  // Work from Verlet velocities so a preceding floor/ball contact is respected.
  // The impulse reflects only inward normal motion; no launch force is added.
  function collideNodeWithRamp(node, ramp, dt) {
    if (!node || node.role !== P.Role.FREE || !(dt > 0)) return false;
    const ax=ramp.a.x,ay=ramp.a.y,dx=ramp.b.x-ax,dy=ramp.b.y-ay,length=Math.hypot(dx,dy);
    if (!(length > 0)) return false;
    const tx=dx/length,ty=dy/length,nx=ty,ny=-tx;
    const along=(node.x-ax)*tx+(node.y-ay)*ty;
    const radius=node.radius || 8;
    if (along < 0 || along > length) return false;
    const distance=(node.x-ax)*nx+(node.y-ay)*ny;
    if (distance >= radius || distance < -radius) return false;
    let vx=(node.x-node.px)/dt,vy=(node.y-node.py)/dt;
    node.x+=nx*(radius-distance);node.y+=ny*(radius-distance);
    const incoming=vx*nx+vy*ny;
    if (incoming < 0) {
      const restitution=ramp.restitution ?? .35;
      vx-=(1+restitution)*incoming*nx;vy-=(1+restitution)*incoming*ny;
    }
    node.px=node.x-vx*dt;node.py=node.y-vy*dt;node.vx=vx;node.vy=vy;
    return true;
  }

  // Ridge-course contacts use the actual Verlet velocity, including preceding
  // contacts in this tick. Positional depenetration must not create an impulse.
  // The legacy golf/putt collision route is deliberately unchanged.
  function collideGolfNodes(world, idxA, idxB, dt, restitution, dormantBall=false) {
    const a=world.nodes[idxA],b=world.nodes[idxB];
    if(!a||!b||a===b||a.role===P.Role.FIXED||(b.role===P.Role.FIXED&&!dormantBall)||!(dt>0))return false;
    const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,r=(a.radius||8)+(b.radius||8);
    if(d2>=r*r||d2<1e-12)return false;
    const d=Math.sqrt(d2),nx=dx/d,ny=dy/d;
    const ia=a.role===P.Role.CART?0:1/Math.max(.01,a.mass),ib=b.role===P.Role.CART?0:1/Math.max(.01,b.mass),inv=ia+ib;
    if(!(inv>0))return false;
    let avx=(a.x-a.px)/dt,avy=(a.y-a.py)/dt,bvx=(b.x-b.px)/dt,bvy=(b.y-b.py)/dt;
    const incoming=(bvx-avx)*nx+(bvy-avy)*ny;
    const overlap=r-d;
    a.x-=nx*overlap*ia/inv;a.y-=ny*overlap*ia/inv;
    b.x+=nx*overlap*ib/inv;b.y+=ny*overlap*ib/inv;
    if(incoming<0){
      const impulse=-(1+restitution)*incoming/inv;
      avx-=impulse*nx*ia;avy-=impulse*ny*ia;bvx+=impulse*nx*ib;bvy+=impulse*ny*ib;
    }
    a.px=a.x-avx*dt;a.py=a.y-avy*dt;a.vx=avx;a.vy=avy;
    b.px=b.x-bvx*dt;b.py=b.y-bvy*dt;b.vx=bvx;b.vy=bvy;
    return incoming<0;
  }

  function applyGolfFloorCircle(node,floor,dt){
    if(!node||node.role!==P.Role.FREE)return 0;
    const vx=(node.x-node.px)/dt,vy=(node.y-node.py)/dt;
    const result=P.applyFloorCircle(node,floor,dt);
    if(result&&vy<0){
      // Another contact can leave a small penetration while the ball is
      // already departing. Repair position without reflecting it downward.
      node.px=node.x-vx*dt;node.py=node.y-vy*dt;
      return 1;
    }
    return result;
  }

  // ========== Setup: Golf (cart + bat + floor + hole) ==========
  // Bigger world (worldExtent halfW=500, halfH=280). Cart on a wide
  // rail above a horizontal floor; the bob hangs from the cart and
  // serves as the "club head". Strike the ball ONCE then freeze —
  // the trick is committing to a single swing rather than continuously
  // pushing. After the freeze, two free-floating obstacle balls on the
  // floor between cart and hole can deflect the moving ball, so the
  // initial strike has to account for them.
  function makeGolf() {
    // Bob length tuned so the swinging bob CLEARS the floor by a small
    // margin at its lowest point. Geometry: bob reaches y=bobLen at
    // straight-down; with bob radius 13, bob's bottom edge is at
    // y=bobLen+13. floorY is 110. We want bob's bottom < floorY so the
    // bob can swing freely without colliding with the ground every
    // time it tries to pass directly below the cart. 85+13=98 < 110 →
    // 12 px clearance. Bob can still strike the floor-resting ball
    // (ball y=96) because the bob has horizontal reach via swing.
    //
    // Future enhancement: encourage policies that swing UP-AND-OVER
    // (bob above cart) so the strike comes from above the floor and
    // the rod doesn't graze the ground at all. For now, cleanest
    // path is just "make it physically not collide".
    const bobLen = 85;
    const railHalfW = 440;
    const floorY = 110;       // 110 below the rail
    // Default scene tuned so a fresh New Run can score on gen 0:
    // ball spawn (-180) is right under the bob's resting position
    // (cartStartX = -200, bob hangs slightly left at startAngle=-0.1),
    // hole is wide (160) and centered close (140) so a casual nudge
    // sends the ball through. User narrows / pushes the hole farther
    // via curriculum ramps once gen-0 success is reliable.
    const defaultHoleCenter = 140;
    const defaultHoleWidth = 160;
    return {
      id: 'golf',
      label: 'Golf (hit the ball into the hole)',
      relevantObjectiveIds: ['ball_in_hole'],
      buildWorld(opts) {
        const w = P.makeWorld(opts);
        const holeCenter = (opts.holeCenter != null) ? opts.holeCenter : defaultHoleCenter;
        const holeWidth  = (opts.holeWidth  != null) ? opts.holeWidth  : defaultHoleWidth;
        const holeMinX = holeCenter - holeWidth / 2;
        const holeMaxX = holeCenter + holeWidth / 2;
        // Wider rail so the cart has room to chase the ball.
        const cartX = (opts && opts.cartStartX != null) ? opts.cartStartX : -200;
        const cartIdx = P.addNode(w, cartX, 0, { mass: 6, radius: 18, label: 'cart' });
        P.setCart(w, cartIdx, { minX: -railHalfW + 20, maxX: railHalfW - 20, mass: 6 });
        // Bob ('club head'). Slightly tilted left so the cart can swing it
        // forward as it drives right.
        const startAngle = (opts && opts.startAngle != null) ? opts.startAngle : -0.1;
        const bobX = cartX + Math.sin(startAngle) * bobLen;
        const bobY = -Math.cos(startAngle) * bobLen;
        const bobIdx = P.addNode(w, bobX, bobY, { mass: 1.4, radius: 13, label: 'bob' });
        P.addRod(w, cartIdx, bobIdx, bobLen);
        // Ball spawns under the bob's resting position so any cart wiggle
        // produces gen-0 contact (see scene-tuning note above).
        const ballState = BF.ball.makeState({
          mode:        opts.ballMode || 'fixed',
          spawnX:      opts.ballSpawnX != null ? opts.ballSpawnX : -180,
          spawnY:      opts.ballSpawnY != null ? opts.ballSpawnY : (floorY - 14),
          spawnDelay:  opts.ballSpawnDelay,
          driftSpeed:  opts.ballDriftSpeed,
          mass:        opts.ballMass != null ? opts.ballMass : 0.5,
          radius:      opts.ballRadius != null ? opts.ballRadius : 14,
          restitution: opts.ballRestitution != null ? opts.ballRestitution : 0.55,
        });
        // Free-floating obstacle balls between the cart and the hole.
        // They sit on the floor; the moving ball can knock them aside
        // or deflect off them, so the initial strike's aim matters.
        // Count is configurable via opts.numObstacles (default 2);
        // positions are spread evenly between the ball spawn x and the
        // hole's left edge so the obstacle field always lies BETWEEN
        // the strike and the goal regardless of slider settings.
        const obstacles = [];
        const numObstacles = (opts.numObstacles != null && opts.numObstacles >= 0)
          ? Math.max(0, Math.min(8, opts.numObstacles | 0))
          : 2;
        // Obstacle RADIUS (curriculum-rampable, golfObstacleR): default the
        // classic 14px; ramp it up for a "huge sphere in the fairway" endgame.
        // Mass scales with AREA so a big obstacle feels massive instead of a
        // feather-light beach ball the strike just swats aside.
        const obstacleR = (opts.obstacleRadius != null && opts.obstacleRadius > 0)
          ? Math.min(200, opts.obstacleRadius) : 14;
        if (numObstacles > 0) {
          const ballX = (opts.ballSpawnX != null) ? opts.ballSpawnX : -180;
          // Clearances are RADIUS-AWARE: a huge obstacle must not overhang the
          // tee (the spawned ball would start embedded and get ejected on
          // frame 1) or the hole mouth (it would cork the hole).
          const leftEdge  = ballX + 60 + Math.max(0, obstacleR - 14);
          const rightEdge = holeMinX - 20 - Math.max(0, obstacleR - 14);
          const spread = Math.max(40, rightEdge - leftEdge);
          for (let i = 0; i < numObstacles; i++) {
            // Center the obstacles in the available band; one obstacle
            // goes at the midpoint, multiple linspace within the band.
            const t = numObstacles === 1 ? 0.5 : i / (numObstacles - 1);
            const ox = leftEdge + spread * t;
            const idx = P.addNode(w, ox, floorY - obstacleR, {
              mass: 0.6 * Math.pow(obstacleR / 14, 2), radius: obstacleR, label: 'obstacle',
            });
            obstacles.push(idx);
          }
        }
        // GROUND LUMPS (curriculum-rampable, golfLumps/golfLumpR): unmovable
        // half-buried domes on the fairway the ball must roll up and over —
        // the "ground is not just a line" upgrade. Stored as PLAIN STATE, not
        // world nodes: FIXED nodes render as squares and are skipped by every
        // existing collision path, so a dedicated static-circle collision in
        // tick() (see collideNodeWithStaticCircle) is both simpler and
        // correct. Placement is DETERMINISTIC (linspace, no rng) so every
        // rollout in a generation faces identical terrain, and avoid-zones
        // track the (possibly jittered) hole via the local holeMinX/MaxX.
        const groundLumps = [];
        const numLumps = (opts.numLumps != null) ? Math.max(0, Math.min(6, Math.round(opts.numLumps))) : 0;
        if (numLumps > 0) {
          const lumpR = (opts.lumpRadius != null && opts.lumpRadius > 0)
            ? Math.max(8, Math.min(80, opts.lumpRadius)) : 25;
          const ballX = (opts.ballSpawnX != null) ? opts.ballSpawnX : -180;
          const lo = ballX + 40 + lumpR, hi = holeMinX - lumpR - 10;
          if (hi > lo) {
            for (let i = 0; i < numLumps; i++) {
              const t = numLumps === 1 ? 0.5 : i / (numLumps - 1);
              const lx = lo + (hi - lo) * t;
              // Skip lumps that would cork the hole mouth or sit on the tee.
              if (lx + lumpR > holeMinX - 10 && lx - lumpR < holeMaxX + 10) continue;
              if (Math.abs(lx - ballX) < lumpR + 14 + 20) continue;
              groundLumps.push({ x: lx, y: floorY, r: lumpR });
            }
          }
        }
        return {
          world: w,
          cartIdx: cartIdx,
          tipIdx: bobIdx,
          // Pendulum chain only. Obstacle contacts are resolved separately
          // in tick() so they do not count as club strikes or pollute
          // kinematics.chainAvg as a fake "segment".
          segments: [[cartIdx, bobIdx]],
          obstacleIdxs: obstacles,
          groundLumps: groundLumps,
          ball: ballState,
          rail: { minX: -railHalfW, maxX: railHalfW },
          worldExtent: { halfW: 500, halfH: 280 },
          floors: [{
            y: floorY,
            holes: [{ minX: holeMinX, maxX: holeMaxX }],
            restitution: 0.55,
            friction: 0.92,
          }],
          // Hole region for the objective — exposed so ball_in_hole can
          // detect when the ball center crosses through.
          holeRegion: { minX: holeMinX, maxX: holeMaxX, y: floorY },
          // Golf-specific: freeze the cart + bob after the ball is struck
          // once. Forces the policy to commit to ONE swing rather than
          // pushing the ball continuously along the floor. Configurable
          // so the trainer / UI can disable it.
          oneHitOnly: opts.oneHitOnly !== false,
          // Per-rollout maxBallX tracking — reward shapes use farthest
          // point reached rather than final position (a ball that rolled
          // far then bounced back shouldn\'t score lower than one that
          // stopped where it landed).
          maxBallX: -Infinity,
          // Closest the ball ever came to the hole center (post-strike).
          // For sparse-reward scenarios where most policies never sink it,
          // this still gives a "you got CLOSE" gradient signal.
          minHoleDistance: Infinity,
          // Closest the bob has ever come to the ball (during pre-strike).
          // Once frozen, this stops updating. Drives the bob-to-ball
          // closest-approach reward channel — a key signal for policies
          // that haven't figured out how to actually strike the ball
          // yet, giving them a continuous "you got closer to the ball"
          // gradient instead of a flat zero.
          minBobToBallDist: Infinity,
          frozen: false,
        };
      },
      observationCount: 15,
      observationLabels: [
        'cart x position', 'cart velocity',
        'sin(angle from up)', 'cos(angle from up)',
        'angular velocity',
        'ball Δx (vs bob)', 'ball Δy (vs bob)', 'ball proximity (1=touching)',
        'ball Δx (vs hole center)', 'ball Δy (vs hole)',
        'ball vx (normalized)', 'ball vy (normalized)',
        'struck flag (0/1)', 'hole half-width (normalized)',
        'bias',
      ],
      observationAbbr: ['cx', 'vx', 'sθ', 'cθ', 'av', 'bdx', 'bdy', 'bp', 'hdx', 'hdy', 'bvx', 'bvy', 'sf', 'hw', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const bob = w.nodes[state.tipIdx];
        const ang = segmentAngle(w, state.cartIdx, state.tipIdx);
        const dxB = bob.x - cart.x, dyB = bob.y - cart.y;
        const angVel = ((bob.vx - cart.vx) * (-dyB) + (bob.vy - cart.vy) * (dxB)) / (bobLen * bobLen);
        // Ball-relative observations. All zero before the ball spawns.
        let ballDx = 0, ballDy = 0, ballProx = 0;
        let holeDx = 0, holeDy = 0;
        let ballVx = 0, ballVy = 0;
        let struckFlag = 0;
        const holeCenterX = (state.holeRegion.minX + state.holeRegion.maxX) / 2;
        const holeY = state.holeRegion.y;
        const holeHalfW = (state.holeRegion.maxX - state.holeRegion.minX) / 2;
        if (state.ball && state.ball.spawned) {
          const ball = w.nodes[state.ball.idx];
          ballDx = clamp((ball.x - bob.x) / 320, -2, 2);
          ballDy = clamp((ball.y - bob.y) / 320, -2, 2);
          const dist = Math.hypot(ball.x - bob.x, ball.y - bob.y);
          ballProx = clamp(1 - dist / 180, 0, 1);
          holeDx = clamp((holeCenterX - ball.x) / 500, -1, 1);
          holeDy = clamp((holeY - ball.y) / 200, -2, 2);
          // Ball velocity — critical signal that was missing. After a
          // strike the policy needs to see whether the ball is heading
          // toward the hole, rolling backward, or stopped. Pre-strike
          // it's zero, which is itself a useful "ball untouched" cue.
          ballVx = clamp(ball.vx / 600, -2, 2);
          ballVy = clamp(ball.vy / 600, -2, 2);
          // Struck flag — pre-strike the policy needs to position cart
          // + swing bob; post-strike it needs to wait (the cart is
          // frozen anyway). Different sub-tasks; the flag lets the
          // network condition behavior on which phase it's in.
          struckFlag = state.ball.hits > 0 ? 1.0 : 0.0;
        }
        // Hole half-width normalized to [0.1, 1.0] — the policy needs
        // to know how forgiving the target is (curriculum-able knob).
        const holeHalfWN = clamp(holeHalfW / 100, 0.1, 1.0);
        return [
          clamp(cart.x / 440, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(ang),
          Math.cos(ang),
          clamp(angVel * 0.3, -3, 3),
          ballDx,
          ballDy,
          ballProx,
          holeDx,
          holeDy,
          ballVx,
          ballVy,
          struckFlag,
          holeHalfWN,
          1.0,
        ];
      },
      isAlive(state) {
        return !(state.ball && (state.ball.sunk || state.ball.escaped));
      },
      // Rollout-duration extension. The trainer (and display sim)
      // normally cut at evalSeconds. For ball-strike scenarios the
      // ball can still be rolling toward the hole when the timer
      // expires, so the GA never sees the actual outcome — and
      // the sibling that ALMOST sank vs the one that missed wide
      // both score the same. shouldKeepGoing returns true after
      // the strike, while the ball is still moving meaningfully
      // and hasn't sunk/escaped — letting the rollout extend up
      // to tailEvalSeconds past the base timer.
      tailEvalSeconds: 4,
      shouldKeepGoing(state) {
        if (!state.frozen) return false;            // pre-strike — cut at base
        if (!state.ball || !state.ball.spawned) return false;
        if (state.ball.sunk) return false;          // outcome reached
        if (state.ball.escaped) return false;
        const ball = state.world.nodes[state.ball.idx];
        return Math.hypot(ball.vx, ball.vy) > 30;   // still in motion
      },
      tick(state, dt) {
        if (state.ball) {
          BF.ball.tick(state.ball, state.world, state.rail);
          if(state.courseContactVersion===2 && state.ball.spawned && !state.ball.sunk){
            for(const idx of [state.cartIdx,state.tipIdx]){
              if(collideGolfNodes(state.world,idx,state.ball.idx,dt,state.ball.restitution,state.ball.dormant)){
                state.ball.hits++;state.ball.lastHitTime=state.world.time;
                if(state.ball.dormant){state.ball.dormant=false;state.ball.activated=true;state.world.nodes[state.ball.idx].role=P.Role.FREE;}
              }
            }
          }else BF.ball.resolveCollisions(state.ball, state.world, state.segments, dt);
        }
        // Floor collision applies to every FREE node — ball, bob, and
        // the free-floating obstacles all rest on the floor naturally.
        // Ball-specifically: applyFloorCircle returns 2 on a real bounce,
        // 1 on a settle; we increment the bounce counter on 2 only so a
        // ball rolling along the floor doesn't inflate the count.
        if (state.floors && state.floors.length > 0) {
          const ballIdx = state.ball ? state.ball.idx : -1;
          for (const floor of state.floors) {
            for (let i = 0; i < state.world.nodes.length; i++) {
              const result = state.courseContactVersion===2
                ? applyGolfFloorCircle(state.world.nodes[i],floor,dt)
                : BF.physics.applyFloorCircle(state.world.nodes[i], floor, dt);
              if (result === 2 && i === ballIdx && state.ball.spawned) {
                state.ball.floorHits = (state.ball.floorHits || 0) + 1;
              }
            }
          }
        }
        // Obstacle balls are part of the course, not the club. Collide them
        // with the player ball without incrementing state.ball.hits; otherwise
        // repeated obstacle bounces look like new strikes to the reward
        // function and dominate the golf objective.
        if (state.ball && state.ball.spawned && state.obstacleIdxs) {
          for (const obstacleIdx of state.obstacleIdxs) {
            if(state.courseContactVersion===2)collideGolfNodes(state.world,state.ball.idx,obstacleIdx,dt,state.ball.restitution);
            else collideTwoNodes(state.world, state.ball.idx, obstacleIdx, dt, state.ball.restitution);
          }
        }
        // Ground lumps: unmovable domes the ball (and free obstacles — so
        // they can't come to rest half-inside a lump) rolls up and over.
        if (state.groundLumps && state.groundLumps.length > 0) {
          for (const L of state.groundLumps) {
            if (state.ball && state.ball.spawned && !state.ball.sunk) {
              collideNodeWithStaticCircle(state.world.nodes[state.ball.idx], L.x, L.y, L.r, 0.55, dt);
            }
            if (state.obstacleIdxs) {
              for (const oi of state.obstacleIdxs) {
                collideNodeWithStaticCircle(state.world.nodes[oi], L.x, L.y, L.r, 0.4, dt);
              }
            }
          }
        }
        if (state.groundRamps) {
          const nodes=[...(state.obstacleIdxs || [])];
          if(state.ball?.spawned && !state.ball.sunk)nodes.push(state.ball.idx);
          for(const idx of nodes)for(const ramp of state.groundRamps) {
            if(collideNodeWithRamp(state.world.nodes[idx],ramp,dt) && idx===state.ball?.idx){
              state.courseRampContacts=(state.courseRampContacts || 0)+1;
              if(ramp.section==='canopy')state.courseCeilingContacts=(state.courseCeilingContacts||0)+1;
            }
          }
        }
        // One-hit lock: snapshot cart + bob the moment the ball is
        // first struck, freeze them in place for the rest of the
        // rollout. Cart drive is also disabled via cartFrozen flag so
        // the trainer's command has no effect post-hit.
        if (state.oneHitOnly && state.ball && state.ball.hits > 0 && !state.frozen) {
          state.frozen = true;
          state.world.cartFrozen = true;
          for (const idx of [state.cartIdx, state.tipIdx]) {
            const n = state.world.nodes[idx];
            n.role = 2; // FIXED — integrate skips, rod constraint keeps geometry
            n.px = n.x; n.py = n.y;
            n.vx = 0; n.vy = 0;
          }
        }
        // Track farthest +x point the ball has reached (for reward
        // shaping — a ball that rolled far then bounced back
        // shouldn't score lower than one that stopped there).
        //
        // Also track closest-ever distance to the HOLE BOUNDARY (not
        // center): the dense progress signal. Boundary-distance is
        // what the policy actually cares about — "have we reached
        // the hole region yet?" — and stays near zero as soon as
        // the ball enters the hole's horizontal range, regardless
        // of whether it's at center or rim. Center-distance instead
        // penalized rim-arrivals as much as half-misses, which the
        // GA couldn't tell apart.
        if (state.ball && state.ball.spawned) {
          const ball = state.world.nodes[state.ball.idx];
          if (ball.x > state.maxBallX) state.maxBallX = ball.x;
          const h = state.holeRegion;
          if (h) {
            // Distance to the closest point of the hole region.
            // Hole region = the floor-level horizontal slot
            // [minX, maxX] at y = floor.y.
            //  - ball.x in [minX, maxX]: dx=0, dy=floor.y-ball.y
            //                            (ball above floor → positive)
            //  - ball.x < minX:           dx=minX-ball.x
            //  - ball.x > maxX:           dx=ball.x-maxX
            // dy is clamped at 0 if ball is below floor (sunk) so
            // distance reaches 0 cleanly when the ball drops in.
            let dx;
            if (ball.x < h.minX) dx = h.minX - ball.x;
            else if (ball.x > h.maxX) dx = ball.x - h.maxX;
            else dx = 0;
            const dy = Math.max(0, h.y - ball.y);
            const dist = Math.hypot(dx, dy);
            if (dist < state.minHoleDistance) state.minHoleDistance = dist;
          }
          // Pre-strike: track the closest the BOB has come to the ball.
          // Gives the objective a "you got closer to the ball" gradient
          // signal even if the policy never actually lands a strike.
          // Stops updating once frozen (post-strike, bob is locked).
          if (!state.frozen) {
            const bob = state.world.nodes[state.tipIdx];
            const bobBallDist = Math.hypot(ball.x - bob.x, ball.y - bob.y);
            if (bobBallDist < state.minBobToBallDist) state.minBobToBallDist = bobBallDist;
          }
        }
        // Detect hole-sink: if the ball's center is over the hole and
        // its bottom is past floor.y, mark it sunk.
        if (state.ball && state.ball.spawned && !state.ball.sunk) {
          const ball = state.world.nodes[state.ball.idx];
          const h = state.holeRegion;
          if (h && ball.x >= h.minX && ball.x <= h.maxX && ball.y > h.y) {
            state.ball.sunk = true;
            state.ball.sunkAtTime = state.world.time;
            ball.role = P.Role.FIXED;
            ball.px = ball.x; ball.py = ball.y;
            ball.vx = 0; ball.vy = 0;
          }
        }
      },
    };
  }

  // Fixed challenge layout. The original golf course/observation contract is
  // unchanged; this separately identified task adds passive, collidable ramps.
  // Its policy sees ball/club/hole state, not a terrain map. Geometry is fixed.
  function makeGolfChallenge() {
    const golf=makeGolf();
    return {...golf,id:'golf-challenge',label:'Golf challenge · double ridge',
      buildWorld(opts={}) {
        const state=golf.buildWorld({...opts,holeCenter:opts.holeCenter ?? 260,holeWidth:opts.holeWidth ?? 100,
          numObstacles:Math.min(3,opts.numObstacles ?? 1),numLumps:0});
        const ramp=(ax,ay,bx,by,section)=>({a:{x:ax,y:ay},b:{x:bx,y:by},baseY:110,
          restitution:.35,section,color:section==='launch'?'#ffc275':'#6ed6d0'});
        state.groundRamps=[ramp(-90,110,-25,84,'launch'),ramp(-25,84,15,110,'launch'),
          ramp(80,110,125,94,'landing'),ramp(125,94,160,110,'landing'),
          {a:{x:190,y:16},b:{x:-120,y:16},baseY:8,restitution:.35,section:'canopy',color:'#a8b7d5'}];
        state.course={id:'double-ridge',label:'Double ridge',fixedGeometry:true,
          description:'One strike through a low corridor: two passive inclined ridges, a movable bumper, an overhead beam and an observed target slot. No powered launch or hidden moving hazard.'};
        state.courseRampContacts=0;
        state.courseCeilingContacts=0;
        state.courseContactVersion=2;
        for(let i=0;i<state.obstacleIdxs.length;i++) {
          const node=state.world.nodes[state.obstacleIdxs[i]],x=40+i*25;
          node.x=node.px=x;node.y=node.py=110-node.radius;
        }
        return state;
      },
      tick(state,dt) {
        // Original golf retains its historical per-contact friction. This new
        // course interprets the same120Hz coefficient as a time decay, so
        // refining contact steps does not double/quadruple rolling drag.
        for(const floor of state.floors)floor.friction=Math.pow(.92,dt*120);
        golf.tick(state,dt);
        // Contact impulses edit Verlet history; expose the same post-contact
        // velocity to the policy and HUD that integration will use next.
        for(const node of state.world.nodes){
          node.vx=(node.x-node.px)/dt;node.vy=(node.y-node.py)/dt;
        }
      }
    };
  }

  // ========== Setup: Putt (simpler golf — no obstacles, ballistic-only) ==========
  // Same one-hit lock + win flash as full golf, but stripped down: no
  // obstacle balls between cart and hole, smaller world (halfW=380), and
  // shorter ball-to-hole distance. Pure ballistic problem — just hit
  // the ball with the right angle and force to land it in the hole.
  // Good first scene to verify a controller can sink anything before
  // moving on to the obstacle-laden full golf scene.
  function makePutt() {
    // Same bob-length tuning as golf: bob clears the floor at its
    // lowest point so the policy doesn't have to fight floor
    // collisions every time the bob passes directly below the cart.
    // 85 + bob radius 13 = 98 < floorY 110 → 12 px clearance.
    const bobLen = 85;
    const railHalfW = 360;
    const floorY = 110;
    // Default scene tuned so the easiest curriculum level is essentially
    // a freebie. With cartStartX = -150, the bob hangs near (-150 - 8.5,
    // ~85), and a default ballSpawnX of -130 puts the ball almost
    // directly under the bob -- any sideways nudge of the cart will
    // cause first contact in gen 0. The hole is centered close to the
    // ball spawn (140) and defaults wide (160), so an early-gen "bob
    // taps ball" already drops it through the hole in many runs. User
    // ramps both narrower / further via the curriculum once policies
    // can sink the easy version.
    const defaultHoleCenter = 140;
    const defaultHoleWidth = 160;
    return {
      id: 'putt',
      label: 'Putt (no-obstacle golf)',
      relevantObjectiveIds: ['ball_in_hole'],
      buildWorld(opts) {
        const w = P.makeWorld(opts);
        const holeCenter = (opts.holeCenter != null) ? opts.holeCenter : defaultHoleCenter;
        const holeWidth  = (opts.holeWidth  != null) ? opts.holeWidth  : defaultHoleWidth;
        const holeMinX = holeCenter - holeWidth / 2;
        const holeMaxX = holeCenter + holeWidth / 2;
        const cartX = (opts.cartStartX != null) ? opts.cartStartX : -150;
        const cartIdx = P.addNode(w, cartX, 0, { mass: 6, radius: 18, label: 'cart' });
        P.setCart(w, cartIdx, { minX: -railHalfW + 20, maxX: railHalfW - 20, mass: 6 });
        const startAngle = (opts.startAngle != null) ? opts.startAngle : -0.1;
        const bobX = cartX + Math.sin(startAngle) * bobLen;
        const bobY = -Math.cos(startAngle) * bobLen;
        const bobIdx = P.addNode(w, bobX, bobY, { mass: 1.4, radius: 13, label: 'bob' });
        P.addRod(w, cartIdx, bobIdx, bobLen);
        const ballState = BF.ball.makeState({
          mode:        opts.ballMode || 'fixed',
          // Default spawn near the cart's resting position (cartStartX = -150)
          // so the bob's natural hang is essentially touching the ball — any
          // policy that wiggles the cart at all produces gen-0 contact, and
          // the GA has a real strike-energy gradient from the start.
          spawnX:      opts.ballSpawnX != null ? opts.ballSpawnX : -130,
          spawnY:      opts.ballSpawnY != null ? opts.ballSpawnY : (floorY - 14),
          spawnDelay:  opts.ballSpawnDelay,
          driftSpeed:  opts.ballDriftSpeed,
          mass:        opts.ballMass != null ? opts.ballMass : 0.5,
          radius:      opts.ballRadius != null ? opts.ballRadius : 14,
          restitution: opts.ballRestitution != null ? opts.ballRestitution : 0.55,
        });
        return {
          world: w,
          cartIdx: cartIdx,
          tipIdx: bobIdx,
          segments: [[cartIdx, bobIdx]],
          ball: ballState,
          rail: { minX: -railHalfW, maxX: railHalfW },
          worldExtent: { halfW: 420, halfH: 260 },
          floors: [{
            y: floorY,
            holes: [{ minX: holeMinX, maxX: holeMaxX }],
            restitution: 0.55,
            friction: 0.92,
          }],
          holeRegion: { minX: holeMinX, maxX: holeMaxX, y: floorY },
          oneHitOnly: opts.oneHitOnly !== false,
          maxBallX: -Infinity,
          minHoleDistance: Infinity,
          // Closest the bob has ever come to the ball (during pre-strike).
          // Once frozen, this stops updating. Drives the bob-to-ball
          // closest-approach reward channel — a key signal for policies
          // that haven't figured out how to actually strike the ball
          // yet, giving them a continuous "you got closer to the ball"
          // gradient instead of a flat zero.
          minBobToBallDist: Infinity,
          frozen: false,
        };
      },
      observationCount: 15,
      observationLabels: [
        'cart x position', 'cart velocity',
        'sin(angle from up)', 'cos(angle from up)',
        'angular velocity',
        'ball Δx (vs bob)', 'ball Δy (vs bob)', 'ball proximity (1=touching)',
        'ball Δx (vs hole center)', 'ball Δy (vs hole)',
        'ball vx (normalized)', 'ball vy (normalized)',
        'struck flag (0/1)', 'hole half-width (normalized)',
        'bias',
      ],
      observationAbbr: ['cx', 'vx', 'sθ', 'cθ', 'av', 'bdx', 'bdy', 'bp', 'hdx', 'hdy', 'bvx', 'bvy', 'sf', 'hw', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const bob = w.nodes[state.tipIdx];
        const ang = segmentAngle(w, state.cartIdx, state.tipIdx);
        const dxB = bob.x - cart.x, dyB = bob.y - cart.y;
        const angVel = ((bob.vx - cart.vx) * (-dyB) + (bob.vy - cart.vy) * (dxB)) / (bobLen * bobLen);
        // Mirror the golf observation upgrade — same 5 added signals
        // (ball Δy vs hole, ball vx, ball vy, struck flag, hole
        // half-width). Both setups feed the same task family so
        // the network has a uniform input shape.
        let ballDx = 0, ballDy = 0, ballProx = 0;
        let holeDx = 0, holeDy = 0;
        let ballVx = 0, ballVy = 0;
        let struckFlag = 0;
        const holeCenterX = (state.holeRegion.minX + state.holeRegion.maxX) / 2;
        const holeY = state.holeRegion.y;
        const holeHalfW = (state.holeRegion.maxX - state.holeRegion.minX) / 2;
        if (state.ball && state.ball.spawned) {
          const ball = w.nodes[state.ball.idx];
          ballDx = clamp((ball.x - bob.x) / 280, -2, 2);
          ballDy = clamp((ball.y - bob.y) / 280, -2, 2);
          const dist = Math.hypot(ball.x - bob.x, ball.y - bob.y);
          ballProx = clamp(1 - dist / 180, 0, 1);
          // /500 (was /360) — the /360 SATURATED. Ball spawns at x=-130 and the
          // moving-hole curriculum pushes the hole to x=260 (centre 140 + 120
          // jitter), so the raw ratio hits (260+130)/360 = 1.083 and the clamp
          // pins it at 1.0 for every hole beyond x=230 — the top 12.5% of the
          // jitter range. MEASURED consequence: the strike was byte-identical
          // across jitter +90/+100/+110/+120 (the policy literally could not
          // see the difference), and the sink rate in that saturated bucket was
          // 21% vs 67% unsaturated. /500 caps the range at 0.78 with headroom,
          // and matches what the sibling GOLF setup already uses (line ~1631) —
          // putt was the outlier, not golf.
          holeDx = clamp((holeCenterX - ball.x) / 500, -1, 1);
          holeDy = clamp((holeY - ball.y) / 200, -2, 2);
          ballVx = clamp(ball.vx / 600, -2, 2);
          ballVy = clamp(ball.vy / 600, -2, 2);
          struckFlag = state.ball.hits > 0 ? 1.0 : 0.0;
        }
        // /200 (was /100) — at /100 this input was DEAD for the first half of
        // the moving-hole curriculum: half-width 200..115 (levels 0-5, widths
        // 400..230) all clamp to a constant 1.00, so the policy could not tell
        // a barn door from a medium hole. /200 maps the whole 400->60 ramp to a
        // monotone 1.00->0.15. (The golf setup at ~line 1647 has the same latent
        // issue; left alone here because its presets' numbers were verified
        // against the old scaling and changing it would invalidate them.)
        const holeHalfWN = clamp(holeHalfW / 200, 0.1, 1.0);
        return [
          clamp(cart.x / 360, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          Math.sin(ang),
          Math.cos(ang),
          clamp(angVel * 0.3, -3, 3),
          ballDx,
          ballDy,
          ballProx,
          holeDx,
          holeDy,
          ballVx,
          ballVy,
          struckFlag,
          holeHalfWN,
          1.0,
        ];
      },
      isAlive(state) {
        return !(state.ball && (state.ball.sunk || state.ball.escaped));
      },
      // Rollout-duration extension. The trainer (and display sim)
      // normally cut at evalSeconds. For ball-strike scenarios the
      // ball can still be rolling toward the hole when the timer
      // expires, so the GA never sees the actual outcome — and
      // the sibling that ALMOST sank vs the one that missed wide
      // both score the same. shouldKeepGoing returns true after
      // the strike, while the ball is still moving meaningfully
      // and hasn't sunk/escaped — letting the rollout extend up
      // to tailEvalSeconds past the base timer.
      tailEvalSeconds: 4,
      shouldKeepGoing(state) {
        if (!state.frozen) return false;            // pre-strike — cut at base
        if (!state.ball || !state.ball.spawned) return false;
        if (state.ball.sunk) return false;          // outcome reached
        if (state.ball.escaped) return false;
        const ball = state.world.nodes[state.ball.idx];
        return Math.hypot(ball.vx, ball.vy) > 30;   // still in motion
      },
      tick(state, dt) {
        if (state.ball) {
          BF.ball.tick(state.ball, state.world, state.rail);
          BF.ball.resolveCollisions(state.ball, state.world, state.segments, dt);
        }
        if (state.floors && state.floors.length > 0) {
          const ballIdx = state.ball ? state.ball.idx : -1;
          for (const floor of state.floors) {
            for (let i = 0; i < state.world.nodes.length; i++) {
              const result = BF.physics.applyFloorCircle(state.world.nodes[i], floor, dt);
              if (result === 2 && i === ballIdx && state.ball.spawned) {
                state.ball.floorHits = (state.ball.floorHits || 0) + 1;
              }
            }
          }
        }
        if (state.oneHitOnly && state.ball && state.ball.hits > 0 && !state.frozen) {
          state.frozen = true;
          state.world.cartFrozen = true;
          for (const idx of [state.cartIdx, state.tipIdx]) {
            const n = state.world.nodes[idx];
            n.role = 2;
            n.px = n.x; n.py = n.y;
            n.vx = 0; n.vy = 0;
          }
        }
        // Same boundary-distance metric as the golf setup. Tracks
        // the closest the ball has come to the hole REGION (not
        // center), so a ball reaching the rim from any angle gets
        // full credit. See golf for the geometry breakdown.
        if (state.ball && state.ball.spawned) {
          const ball = state.world.nodes[state.ball.idx];
          if (ball.x > state.maxBallX) state.maxBallX = ball.x;
          const h = state.holeRegion;
          if (h) {
            let dx;
            if (ball.x < h.minX) dx = h.minX - ball.x;
            else if (ball.x > h.maxX) dx = ball.x - h.maxX;
            else dx = 0;
            const dy = Math.max(0, h.y - ball.y);
            const dist = Math.hypot(dx, dy);
            if (dist < state.minHoleDistance) state.minHoleDistance = dist;
          }
          // Pre-strike bob-to-ball closest-distance tracker, mirrored
          // from golf. See the golf tick for the rationale.
          if (!state.frozen) {
            const bob = state.world.nodes[state.tipIdx];
            const bobBallDist = Math.hypot(ball.x - bob.x, ball.y - bob.y);
            if (bobBallDist < state.minBobToBallDist) state.minBobToBallDist = bobBallDist;
          }
        }
        if (state.ball && state.ball.spawned && !state.ball.sunk) {
          const ball = state.world.nodes[state.ball.idx];
          const h = state.holeRegion;
          if (h && ball.x >= h.minX && ball.x <= h.maxX && ball.y > h.y) {
            state.ball.sunk = true;
            state.ball.sunkAtTime = state.world.time;
            ball.role = P.Role.FIXED;
            ball.px = ball.x; ball.py = ball.y;
            ball.vx = 0; ball.vy = 0;
          }
        }
      },
    };
  }

  // ========== Setup: Dodge (2D agent, bullets, attack patterns) ==========
  // A free 2D agent (no cart rail) is bombarded with bullets emitted by
  // a pluggable pattern controller (BF.dodgePatterns). Rewarded for
  // surviving and grazing (near-miss). Uses actionCount: 2 (x, y
  // commands) -- the first multi-output setup in BalanceForge. NEAT
  // automatically grows two output nodes; CMA-ES / DE / etc. would need
  // their per-individual MLP shape adjusted, so dodge is NEAT-only for v1.
  function makeDodge() {
    const halfW = 360, halfH = 220;
    const agentRadius = 10;
    // Grid-encoding parameters (experimental). When the user enables
    // 'grid' observation mode, the buildObservation function renders
    // an agent-centered bullet-danger grid + agent state instead of
    // the top-K-nearest list. NEAT can consume the flattened grid
    // directly; the CNN-policy path is queued for a follow-up round.
    const GRID_SIZE = 16;
    const GRID_INPUT_COUNT  = GRID_SIZE * GRID_SIZE + 4; // grid + agent (x,y,vx,vy)
    const TOPK_K            = 8;                        // K nearest bullets reported
    const TOPK_INPUT_COUNT  = 4 + TOPK_K * 4;           // agent + K * (dx, dy, vx, vy)
    // 9 candidate commands for the topk-danger lookahead: stay + 8 compass dirs.
    const DANGER_DIRS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
    // ANGULAR DANGER RADAR (mode 'radar') — the planner-grade encoding. Instead
    // of the top-K raw list (blind to 60-70% of the field at high spawn, half
    // its slots wasted at low spawn) + 9 fixed compass probes that CLAMP into
    // walls with zero danger (the confirmed corner-stuck cause), the radar
    // sweeps N even angular sectors around the agent and, for each, forward-
    // projects a full commit in that direction over the 1.2s horizon against
    // ALL bullets, reporting THREE features: projected closest-approach danger,
    // time-to-threat (temporal urgency), and a WALL-TRAP term (how soon that
    // heading jams into a wall — computed BEFORE the position clamp, the fix
    // the 9-way lacks). Plus 4 globals (field density, cornered-ness, and the
    // toward-center gradient). Fixed size regardless of bullet count. The
    // learned net's job collapses to "steer toward the safest open sector" —
    // the planner's per-direction evaluation, compressed into the observation.
    const RADAR_SECTORS = 16, RADAR_FEATS = 3, RADAR_GLOBALS = 4;
    const RADAR_INPUT_COUNT = 4 + RADAR_SECTORS * RADAR_FEATS + RADAR_GLOBALS; // 56
    const RADAR_DIRS = [];
    for (let s = 0; s < RADAR_SECTORS; s++) {
      const a = (2 * Math.PI * s) / RADAR_SECTORS;
      RADAR_DIRS.push([Math.cos(a), Math.sin(a)]);
    }
    const RADAR_HS = 8, RADAR_DTC = 0.15, RADAR_DNORM = 180, RADAR_EDGECAP = 100;
    // Multi-scale encoding: two 16x16 grids at different scopes.
    //   LOCAL  -- ±80 px window centered on agent (10 px/cell, fine detail).
    //             Tracks bullets that are CLOSE and need immediate dodging.
    //   GLOBAL -- full ±halfW x ±halfH playfield mapped to 16x16 cells.
    //             Tracks the big picture: where the next wave is forming,
    //             where dense clusters are, where empty space exists.
    //
    // Designed for the CNN multi-scale policy: each grid feeds an
    // independent conv branch that pools down to a small feature
    // vector, so the CMA-ES parameter count stays bounded even with
    // these denser grids (the conv kernels are shared across cells).
    // For NEAT or MLP policies, the 516 flat inputs are too many to
    // be useful -- pick Top-K instead.
    const LOCAL_GRID_SIZE  = 16;
    const GLOBAL_GRID_SIZE = 16;
    const LOCAL_GRID_RANGE = 80;  // px window half-width (so 160px total)
    // We ALSO write the top-K nearest bullets after the two grids so the
    // NEAT-CNN hybrid policy can optionally consume them alongside the
    // CNN's pooled features. cnn-multiscale (the pure-CNN policy) reads
    // only the first 516 floats and ignores the trailing top-K block,
    // so adding these is forward-compatible. The slot count matches
    // TOPK_K (=8 by default) × 4 floats per bullet (dx, dy, vx, vy).
    const MULTISCALE_TOPK_TAIL = TOPK_K * 4;
    const MULTISCALE_INPUT_COUNT =
      4 + LOCAL_GRID_SIZE * LOCAL_GRID_SIZE + GLOBAL_GRID_SIZE * GLOBAL_GRID_SIZE
        + MULTISCALE_TOPK_TAIL;
    return {
      id: 'dodge',
      label: 'Dodge (bullet hell)',
      relevantObjectiveIds: ['dodge_survive'],
      // observationCount defaults to the cheaper top-K encoding. The
      // dodge UI's "Grid encoding" toggle mutates this value AND
      // triggers a trainer rebuild, since changing input count
      // invalidates every existing genome.
      observationCount: TOPK_INPUT_COUNT,
      actionCount: 2,
      // Output vocabulary — the two axes tick() reads out of lastCmds. Named
      // by AXIS, not by "action 0/1", so the influence chord can say which
      // inputs drive horizontal vs vertical evasion (the interesting split).
      actionLabels: ['move x (±1)', 'move y (±1)'],
      actionAbbr: ['mx', 'my'],
      // Setup-aware observation-count resolver. Used by the app/trainer
      // when computing genome dimensions, so the trainer can be rebuilt
      // with the right input count when the user toggles grid mode.
      setObservationMode(mode) {
        this.observationMode = mode || 'topk';
        if (mode === 'grid')        this.observationCount = GRID_INPUT_COUNT;
        else if (mode === 'multiscale') this.observationCount = MULTISCALE_INPUT_COUNT;
        else if (mode === 'topk-danger') this.observationCount = TOPK_INPUT_COUNT + 9;
        else if (mode === 'radar')  this.observationCount = RADAR_INPUT_COUNT;
        else                        this.observationCount = TOPK_INPUT_COUNT;
      },
      // Per-input labels, adapted to the current observation mode — so the
      // Network panel + hover tooltip name every input instead of falling
      // back to "input N" (dodge was the one setup with none). Long form for
      // the tooltip; observationAbbr below is the short node glyph. Grid /
      // multiscale render as a pixel panel (no per-node labels), so those
      // only need the leading agent-state entries to be meaningful.
      get observationLabels() {
        const L = ['agent x (norm)', 'agent y (norm)', 'agent vx (norm)', 'agent vy (norm)'];
        const mode = this.observationMode || 'topk';
        const dirName = ['stay', 'right', 'left', 'down', 'up',
                         'down-right', 'down-left', 'up-right', 'up-left'];
        if (mode === 'radar') {
          for (let s = 0; s < RADAR_SECTORS; s++) {
            const deg = Math.round((360 * s) / RADAR_SECTORS);
            L.push('sector ' + deg + '° danger', 'sector ' + deg + '° time-to-threat', 'sector ' + deg + '° wall-trap');
          }
          L.push('field density', 'cornered', 'toward-center x', 'toward-center y');
        } else if (mode === 'topk' || mode === 'topk-danger') {
          for (let k = 0; k < TOPK_K; k++) {
            L.push('bullet ' + k + ' Δx', 'bullet ' + k + ' Δy',
                   'bullet ' + k + ' vx', 'bullet ' + k + ' vy');
          }
          if (mode === 'topk-danger') {
            for (let d = 0; d < 9; d++) L.push('lookahead danger · ' + dirName[d]);
          }
        } else {
          // grid / multiscale: pixel-panel modes — label the tail generically.
          for (let i = L.length; i < this.observationCount; i++) L.push('danger cell ' + (i - 4));
        }
        return L;
      },
      get observationAbbr() {
        const A = ['ax', 'ay', 'avx', 'avy'];
        const mode = this.observationMode || 'topk';
        const dirTag = ['L•', 'L→', 'L←', 'L↓', 'L↑', 'L↘', 'L↙', 'L↗', 'L↖'];
        if (mode === 'radar') {
          for (let s = 0; s < RADAR_SECTORS; s++) A.push('s' + s + 'd', 's' + s + 't', 's' + s + 'w');
          A.push('dens', 'corn', 'cx', 'cy');
        } else if (mode === 'topk' || mode === 'topk-danger') {
          for (let k = 0; k < TOPK_K; k++) A.push('b' + k + 'x', 'b' + k + 'y', 'b' + k + 'u', 'b' + k + 'v');
          if (mode === 'topk-danger') for (let d = 0; d < 9; d++) A.push(dirTag[d]);
        } else {
          for (let i = A.length; i < this.observationCount; i++) A.push('g' + (i - 4));
        }
        return A;
      },
      // Per-pattern controllers can keep ticking past the base eval
      // timer; we just keep going while the agent is alive. tailEvalSeconds
      // is a hard cap.
      tailEvalSeconds: 2,
      shouldKeepGoing(state) { return !state.dead; },
      buildWorld(opts) {
        const w = P.makeWorld(opts);
        // Single free agent node. No setCart -- physics treats it like
        // any other free body. We override vx/vy in tick() from the
        // policy commands.
        const agentIdx = P.addNode(w, 0, 0, {
          mass: 1, radius: agentRadius, label: 'agent',
        });
        const agent = w.nodes[agentIdx];
        agent.externallyIntegrated = true;
        // Disable gravity for the agent so it actually obeys the policy
        // instead of falling. Simplest hack: zero gravityScale per node
        // (physics.js step honors node.gravityScale when present).
        agent.gravityScale = 0;
        // World bounds for pattern spawning + wall reflection. Mirrors
        // a typical bullet-hell playfield.
        const worldExtent = { halfW: halfW, halfH: halfH };
        // Pick the active pattern by id; fall back to 'rain' if the
        // requested id isn't registered.
        const patternId = opts.dodgePattern || 'mixed';
        const patternDef = (BF.dodgePatterns && BF.dodgePatterns.getById(patternId))
          || (BF.dodgePatterns && BF.dodgePatterns.list()[0]);
        // Pattern controller params come from the setup opts so the UI
        // sliders feed in via trainer.params.
        const patternParams = {
          spawnRate:    opts.dodgeSpawnRate    || 1.5,
          speed:        opts.dodgeBulletSpeed  || 220,
          bulletSize:   opts.dodgeBulletRadius || 6,
          leadTime:     opts.dodgeLeadTime     || 0.6,
          predictOrder: opts.dodgePredictOrder || 'linear',
          bulletsPerWave: opts.dodgeBulletsPerWave || 8,
        };
        // Pattern seed: prefer the per-rollout dodgePatternSeed (varies per
        // generation + rollout so the policy must learn to dodge GENERALLY
        // instead of memorizing one fixed bullet sequence). Falls back to the
        // run seed when unset (e.g. the live display), so a still world is
        // still deterministic. Before this, the pattern was seeded from the
        // fixed run seed alone -> every rollout/gen faced the IDENTICAL
        // sequence, so a champion overfit to that one pattern (survived it,
        // died on any other) and the fitness curve was flat-high with no real
        // learning. See dodge-repro-probe.js.
        const patSeed = (opts.dodgePatternSeed != null)
          ? (opts.dodgePatternSeed | 0)
          : (opts.seed | 0);
        const rng = BF.util.makeRng((patSeed ^ 0xD0D6E5E1) >>> 0 || 1);
        const patternCtrl = patternDef && patternDef.makeController
          ? patternDef.makeController(rng, patternParams)
          : null;
        // Agent control limits.
        const controlMode = opts.cartControlMode || 'accel';
        const maxAccel    = opts.cartAccel       || 1600;
        const maxSpeed    = opts.cartMaxSpeed    || 600;
        const dodge = {
          agentIdx: agentIdx,
          bullets: [],   // {x, y, vx, vy, r, alive}
          patternDef: patternDef,
          patternCtrl: patternCtrl,
          patternParams: patternParams,
          patternRng: rng,
          maxBullets: 160,
          aliveTime: 0,
          nearMisses: 0,
          dead: false,
          // No-die mode: when on, a collision registers a per-hit penalty
          // and a brief invulnerability window but the rollout continues.
          // Useful for training a "always trying to dodge" policy that
          // doesn't get cut short by an unlucky first frame.
          noDie:             !!opts.dodgeNoDie,
          invulnSeconds:     opts.dodgeInvulnSeconds != null ? opts.dodgeInvulnSeconds : 0.6,
          // Reward-branch toggles. Stashed on state.dodge so the
          // dodge_survive reward can read them via kin.dodge —
          // evaluatePolicy passes only trainer.params.objectiveParams to
          // the reward fn (NOT trainer.params), and these keys live at
          // trainer.params top-level; the in-state-dodge path is the
          // canonical way to get them to the reward function. Default
          // matches the reward function's own historical fallback so a
          // legacy state.dodge without these keys behaves identically.
          lifespanMode:      !!opts.dodgeLifespanMode,
          noDiePenalty:      opts.dodgeNoDiePenalty != null ? opts.dodgeNoDiePenalty : 3,
          hitsTaken:         0,
          // Reward-relevant counters set by tick():
          _nearMissCredits: 0,
          _hitsToCredit:    0,  // delta of hitsTaken since last reward call
          _invulnLeft:      0,  // seconds of invulnerability remaining
          // Smallest distance (px) from agent center to any alive bullet,
          // observed during the most recent tick. Used by the smoothed
          // dodge_survive reward to hand out a continuous "safety" signal
          // instead of relying on the rare near-miss / death events. Init
          // to +Infinity so the very first step before any bullet is
          // spawned doesn't accidentally read 0.
          minBulletDist: Infinity,
          // Derived "performance gauge" signals — populated by the dodge
          // tick after each minBulletDist update. recentSafety is an
          // exponential moving average over ~1.5 s of the unitless safety
          // scalar (1 = nearest bullet ≥ safeDistPx away or no bullets,
          // 0 = nearest bullet right on top of the agent). UI reads it as
          // a live readout so the user can eyeball whether the policy is
          // actually maneuvering well, without waiting for the curriculum
          // gate or the cumulative reward to settle. rolloutMeanSafety is
          // the lifetime average over the current rollout — survives
          // hot-swaps because we never reset it inside tick.
          safeDistPx: 120,
          recentSafety: 1,
          _safetyAccum: 0,
          _safetySamples: 0,
          rolloutMeanSafety: 1,
          // Safe-streak tracker: seconds since the last hit (or rollout
          // start). Reset to 0 on any hit (terminal collision or no-die
          // clip). Used by the dodge_survive reward to grant a
          // "sustained survival" bonus that DOMINATES near-miss noise
          // at high bullet densities -- near-miss credits become
          // meaningless when bullets are everywhere, but a long streak
          // without getting hit is unambiguously good behavior.
          // longestSafeStreak tracks the high-water mark across the
          // whole rollout so the trainer / HUD can read "this policy's
          // best run was 4.3 seconds untouched".
          safeStreakTime: 0,
          longestSafeStreak: 0,
          // Multi-scale danger grids, populated each buildObservation
          // tick when observationMode === 'multiscale'. The CNN multi-
          // scale policy reads these 2D buffers directly (avoids
          // re-parsing the flat obs vector). Sizes are fixed at setup
          // build time and never re-allocated.
          localGrid:  new Float64Array(LOCAL_GRID_SIZE * LOCAL_GRID_SIZE),
          globalGrid: new Float64Array(GLOBAL_GRID_SIZE * GLOBAL_GRID_SIZE),
          // Geometric metadata for the multi-scale grids; mirrors the
          // module-level constants so the CNN policy / renderer can
          // read them without referencing setup-local constants.
          localGridSize:  LOCAL_GRID_SIZE,
          globalGridSize: GLOBAL_GRID_SIZE,
          localGridRangePx: LOCAL_GRID_RANGE,
          // Closures for the pattern to push new bullets.
          spawn: null, // set below
        };
        dodge.spawn = function spawn(b) {
          if (dodge.bullets.length >= dodge.maxBullets) return;
          dodge.bullets.push({
            x: b.x, y: b.y,
            vx: b.vx, vy: b.vy,
            r: b.r != null ? b.r : 6,
            alive: true,
            // Set to true once the bullet has been close enough that
            // crossing past the agent counts as a near-miss credit.
            _wasClose: false,
            _credited: false,
          });
        };
        return {
          world: w,
          agentIdx: agentIdx,
          // No bob / cart-pole concept; tipIdx + cartIdx kept as the
          // agent so kinematics() doesn't break on chain rendering.
          // Pendulum panels will look degenerate but won't crash.
          cartIdx: agentIdx,
          tipIdx: agentIdx,
          segments: [],
          rail: { minX: -halfW, maxX: halfW },
          worldExtent: worldExtent,
          dodge: dodge,
          dead: false,
          controlMode: controlMode,
          maxAccel: maxAccel,
          maxSpeed: maxSpeed,
          // Observation mode is stamped on the state so the setup's
          // buildObservation can dispatch without reading global trainer
          // params. The mode is fixed for the lifetime of this state;
          // changing the toggle rebuilds the trainer + state.
          observationMode: (opts.dodgeObservationMode === 'grid')
            ? 'grid'
            : (opts.dodgeObservationMode === 'multiscale')
              ? 'multiscale'
              : (opts.dodgeObservationMode === 'topk-danger')
                ? 'topk-danger'
                : (opts.dodgeObservationMode === 'radar')
                  ? 'radar'
                  : 'topk',
          // Multi-action setups read state.lastCmds inside tick.
          // Single-action defaults to [0] elsewhere.
          lastCmds: [0, 0],
        };
      },
      buildObservation(state) {
        const obs = new Float64Array(this.observationCount);
        const agent = state.world.nodes[state.agentIdx];
        if (!agent) return obs;
        // Normalize positions to roughly [-1, 1] using worldExtent.
        const e = state.worldExtent;
        const W = Math.max(1, e.halfW), H = Math.max(1, e.halfH);
        const VMAX = state.maxSpeed || 600;
        obs[0] = agent.x / W;
        obs[1] = agent.y / H;
        obs[2] = (agent.vx || 0) / VMAX;
        obs[3] = (agent.vy || 0) / VMAX;
        // Grid encoding (experimental). Renders bullets into an
        // agent-centered GRID_SIZE x GRID_SIZE grid covering a window
        // of ±GRID_RANGE pixels around the agent. Each cell value
        // encodes "danger": positive bullet presence weighted by how
        // much the bullet's velocity is heading TOWARD the agent. A
        // bullet drifting away gets near-zero weight; one barreling
        // straight at the agent gets the full +1 contribution. The
        // signed dot(v, agent_to_bullet_normalized) keeps the sign
        // information so policies can distinguish "incoming" from
        // "outgoing" bullets in the same cell. The grid is flattened
        // row-major into obs[4 .. 4 + GRID_SIZE*GRID_SIZE]. Existing
        // policies (NEAT) consume the flat vector directly; a CNN
        // policy variant (queued) will reshape this back into a 2D
        // image and apply convolutions.
        if (state.observationMode === 'multiscale') {
          // Multi-scale: two 8x8 grids, one local (±80px tightly around
          // the agent, fine maneuvering detail) + one global (full
          // playfield, big-picture awareness). Same per-cell danger
          // scoring as the legacy grid (base presence + toward-agent
          // velocity weighting) so a single bullet contributes the
          // same total mass to either grid; the difference is spatial
          // resolution. Buffers are reused across ticks via the
          // state.dodge.localGrid / globalGrid Float64Arrays.
          const LG = LOCAL_GRID_SIZE, GG = GLOBAL_GRID_SIZE;
          const lGrid = state.dodge.localGrid;
          const gGrid = state.dodge.globalGrid;
          // Zero out before re-populating.
          for (let i = 0; i < lGrid.length; i++) lGrid[i] = 0;
          for (let i = 0; i < gGrid.length; i++) gGrid[i] = 0;
          const localCellSize  = (2 * LOCAL_GRID_RANGE) / LG;
          const globalCellW    = (2 * e.halfW) / GG;
          const globalCellH    = (2 * e.halfH) / GG;
          const bullets = state.dodge.bullets;
          for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (!b.alive) continue;
            // Toward-agent velocity component (shared by both grids).
            const dxAB = b.x - agent.x;
            const dyAB = b.y - agent.y;
            const m = Math.hypot(dxAB, dyAB) || 1;
            const ux = -dxAB / m, uy = -dyAB / m;
            const towardAgent = ((b.vx || 0) * ux + (b.vy || 0) * uy) / VMAX;
            const danger = 0.2 + 0.8 * Math.max(0, towardAgent);
            // LOCAL grid: agent-centered. Clip to window.
            if (dxAB >= -LOCAL_GRID_RANGE && dxAB < LOCAL_GRID_RANGE
                && dyAB >= -LOCAL_GRID_RANGE && dyAB < LOCAL_GRID_RANGE) {
              const lx = Math.floor((dxAB + LOCAL_GRID_RANGE) / localCellSize);
              const ly = Math.floor((dyAB + LOCAL_GRID_RANGE) / localCellSize);
              const li = ly * LG + lx;
              lGrid[li] = Math.min(1, lGrid[li] + danger);
            }
            // GLOBAL grid: world-anchored (NOT agent-centered). Maps
            // the full playfield into 8x8. A bullet's position alone
            // determines its global cell; the danger value still
            // factors in its heading toward the agent so "lots of
            // bullets converging" reads as hot, regardless of where
            // they are.
            if (b.x >= -e.halfW && b.x < e.halfW
                && b.y >= -e.halfH && b.y < e.halfH) {
              const gx = Math.floor((b.x + e.halfW) / globalCellW);
              const gy = Math.floor((b.y + e.halfH) / globalCellH);
              const gi = gy * GG + gx;
              gGrid[gi] = Math.min(1, gGrid[gi] + danger);
            }
          }
          // Flatten into obs. Layout:
          //   [agent(4)][local(LG²)][global(GG²)][topK(K*4)]
          // The top-K tail is for the NEAT-CNN hybrid policy: it can
          // optionally consume top-K alongside the CNN's pooled
          // features without needing a separate observation mode. The
          // pure cnn-multiscale policy ignores this tail (reads only
          // the first 4 + LG² + GG² floats).
          let off = 4;
          for (let i = 0; i < lGrid.length; i++) obs[off + i] = lGrid[i];
          off += lGrid.length;
          for (let i = 0; i < gGrid.length; i++) obs[off + i] = gGrid[i];
          off += gGrid.length;
          // Top-K nearest bullets, same partial-insertion-sort logic as
          // the topk observation mode. The slots that aren't filled by
          // a real bullet get the same (2, 2, 0, 0) out-of-distribution
          // sentinel topk mode uses -- so the policy reading these
          // values can learn to ignore empty slots.
          {
            const K = TOPK_K;
            const top  = new Array(K);
            const topD = new Array(K);
            for (let j = 0; j < K; j++) { top[j] = null; topD[j] = Infinity; }
            for (let i = 0; i < bullets.length; i++) {
              const b = bullets[i];
              if (!b.alive) continue;
              const dx = b.x - agent.x, dy = b.y - agent.y;
              const d2 = dx * dx + dy * dy;
              for (let j = 0; j < K; j++) {
                if (d2 < topD[j]) {
                  for (let k = K - 1; k > j; k--) {
                    top[k]  = top[k - 1];
                    topD[k] = topD[k - 1];
                  }
                  top[j]  = b;
                  topD[j] = d2;
                  break;
                }
              }
            }
            const BMAX = Math.hypot(W, H);
            for (let k = 0; k < K; k++) {
              const slotOff = off + k * 4;
              const b = top[k];
              if (b) {
                obs[slotOff + 0] = (b.x - agent.x) / BMAX;
                obs[slotOff + 1] = (b.y - agent.y) / BMAX;
                obs[slotOff + 2] = b.vx / VMAX;
                obs[slotOff + 3] = b.vy / VMAX;
              } else {
                obs[slotOff + 0] = 2;
                obs[slotOff + 1] = 2;
                obs[slotOff + 2] = 0;
                obs[slotOff + 3] = 0;
              }
            }
          }
          return obs;
        }
        if (state.observationMode === 'grid') {
          const G = GRID_SIZE;
          const GRID_RANGE = 180;   // ±180 px around the agent (covers most of the playing field)
          const cellSize   = (2 * GRID_RANGE) / G;
          const bullets = state.dodge.bullets;
          for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (!b.alive) continue;
            const dxAB = b.x - agent.x;   // agent -> bullet
            const dyAB = b.y - agent.y;
            // Clip to window; bullets outside the +/- range are
            // ignored (they're too far to matter and would alias to
            // the edge cells).
            if (dxAB < -GRID_RANGE || dxAB >= GRID_RANGE
                || dyAB < -GRID_RANGE || dyAB >= GRID_RANGE) continue;
            const gx = Math.floor((dxAB + GRID_RANGE) / cellSize);
            const gy = Math.floor((dyAB + GRID_RANGE) / cellSize);
            const idx = 4 + gy * G + gx;
            // Heading toward agent? Project bullet velocity onto the
            // bullet->agent direction (negated, since dxAB points away).
            const m = Math.hypot(dxAB, dyAB) || 1;
            const ux = -dxAB / m, uy = -dyAB / m; // unit vector bullet -> agent
            const towardAgent = ((b.vx || 0) * ux + (b.vy || 0) * uy) / VMAX;
            // Cell accumulates: presence is a constant +0.2, scaled
            // toward +1 by the toward-agent component. Multiple bullets
            // in the same cell stack (additive), saturating around 1.
            obs[idx] = Math.min(1, Math.max(0, obs[idx] + 0.2 + 0.8 * Math.max(0, towardAgent)));
          }
          return obs;
        }
        // Top-K nearest bullets: pre-sort by squared distance.
        // O(N*K) without allocation: K is small so a partial insertion
        // sort is faster than building + sorting an array of N.
        const bullets = state.dodge.bullets;
        const K = TOPK_K;
        const top  = new Array(K);
        const topD = new Array(K);
        for (let j = 0; j < K; j++) { top[j] = null; topD[j] = Infinity; }
        for (let i = 0; i < bullets.length; i++) {
          const b = bullets[i];
          if (!b.alive) continue;
          const dx = b.x - agent.x, dy = b.y - agent.y;
          const d2 = dx * dx + dy * dy;
          // Insert into top-K if smaller than worst.
          for (let j = 0; j < K; j++) {
            if (d2 < topD[j]) {
              for (let k = K - 1; k > j; k--) {
                top[k]  = top[k - 1];
                topD[k] = topD[k - 1];
              }
              top[j]  = b;
              topD[j] = d2;
              break;
            }
          }
        }
        const BMAX = Math.hypot(W, H);
        for (let k = 0; k < K; k++) {
          const off = 4 + k * 4;
          const b = top[k];
          if (b) {
            obs[off + 0] = (b.x - agent.x) / BMAX;
            obs[off + 1] = (b.y - agent.y) / BMAX;
            obs[off + 2] = b.vx / VMAX;
            obs[off + 3] = b.vy / VMAX;
          } else {
            // No bullet in this slot -- sentinel "well outside the
            // playfield, zero velocity". dx=2 / dy=2 are clearly
            // OUT-OF-DISTRIBUTION compared to the normal [-1, 1]
            // normalized range, so the policy can learn to ignore
            // these slots rather than be confused by them. (The
            // previous sentinel was 0,0 = "bullet on the agent"
            // which actively SIGNALS max danger to the network --
            // exactly wrong, and explains why Top-K plateaued
            // mysteriously on bullet patterns with sparse moments.)
            obs[off + 0] = 2;
            obs[off + 1] = 2;
            obs[off + 2] = 0;
            obs[off + 3] = 0;
          }
        }
        // topk-danger (#4): 9 LOOKAHEAD danger features — the learnable prior
        // that closes the gap to the receding-horizon planner. For each of 9
        // candidate commands (stay + 8 directions), project the agent forward
        // 1.2s under that constant command (same accel/speed-clamp/wall rules
        // as the tick) with bullets ballistic, and report the closest approach
        // as a danger score in [0,1] (1 = collision course). This hands the
        // policy the same one-step lookahead evaluation the planner computes —
        // it just has to learn to steer toward low danger, instead of having
        // to INFER the future from raw bullet states (the documented ceiling
        // of the reactive obs). Self-contained (no planner dependency), so the
        // eval workers compute identical features from the same state.
        if (state.observationMode === 'topk-danger') {
          const DIRS = DANGER_DIRS;
          const DTC = 0.15, STEPS = 8;                 // 8 x 0.15s = 1.2s horizon
          const accel = state.maxAccel || 1200;
          for (let d = 0; d < 9; d++) {
            let px = agent.x, py = agent.y;
            let vx = agent.vx || 0, vy = agent.vy || 0;
            let minD = Infinity;
            for (let s = 1; s <= STEPS; s++) {
              vx += DIRS[d][0] * accel * DTC;
              vy += DIRS[d][1] * accel * DTC;
              const sp = Math.hypot(vx, vy);
              if (sp > VMAX) { vx *= VMAX / sp; vy *= VMAX / sp; }
              px += vx * DTC; py += vy * DTC;
              if (px < -W) px = -W; else if (px > W) px = W;
              if (py < -H) py = -H; else if (py > H) py = H;
              const t = s * DTC;
              for (let i = 0; i < bullets.length; i++) {
                const b = bullets[i];
                if (!b.alive) continue;
                const bx = b.x + (b.vx || 0) * t, by = b.y + (b.vy || 0) * t;
                const dd = Math.hypot(bx - px, by - py) - (b.r || 6);
                if (dd < minD) minD = dd;
              }
            }
            obs[TOPK_INPUT_COUNT + d] = minD === Infinity
              ? 0 : Math.max(0, Math.min(1, 1 - minD / 180));
          }
        }
        // radar: 16 sectors × [danger, time-to-threat, wall-trap] + 4 globals.
        // Same forward-projection as topk-danger, but swept over N even angular
        // headings and tracking (a) minEdge BEFORE the wall clamp — the wall-
        // trap signal the 9-way lacks, which is what fixes corner-stuck — and
        // (b) the substep TIME of closest approach (temporal urgency). Every
        // sector aggregates over ALL bullets, so there is no top-K blind spot
        // and no wasted slot.
        if (state.observationMode === 'radar') {
          const accel = state.maxAccel || 1200;
          let nAlive = 0;
          for (let i = 0; i < bullets.length; i++) if (bullets[i].alive) nAlive++;
          for (let s = 0; s < RADAR_SECTORS; s++) {
            let px = agent.x, py = agent.y;
            let vx = agent.vx || 0, vy = agent.vy || 0;
            let minD = Infinity, tMinD = RADAR_HS * RADAR_DTC, minEdge = Infinity;
            for (let step = 1; step <= RADAR_HS; step++) {
              vx += RADAR_DIRS[s][0] * accel * RADAR_DTC;
              vy += RADAR_DIRS[s][1] * accel * RADAR_DTC;
              const sp = Math.hypot(vx, vy);
              if (sp > VMAX) { vx *= VMAX / sp; vy *= VMAX / sp; }
              px += vx * RADAR_DTC; py += vy * RADAR_DTC;
              // Wall-trap: the closest this heading brings us to any wall,
              // measured BEFORE the clamp — a heading that would drive us
              // out of bounds reads as trapped (large negative edge margin).
              const edge = Math.min(W - Math.abs(px), H - Math.abs(py));
              if (edge < minEdge) minEdge = edge;
              if (px < -W) px = -W; else if (px > W) px = W;
              if (py < -H) py = -H; else if (py > H) py = H;
              const t = step * RADAR_DTC;
              for (let i = 0; i < bullets.length; i++) {
                const b = bullets[i];
                if (!b.alive) continue;
                const bx = b.x + (b.vx || 0) * t, by = b.y + (b.vy || 0) * t;
                const dd = Math.hypot(bx - px, by - py) - (b.r || 6);
                if (dd < minD) { minD = dd; tMinD = t; }
              }
            }
            const off = 4 + s * RADAR_FEATS;
            obs[off + 0] = minD === Infinity ? 0 : Math.max(0, Math.min(1, 1 - minD / RADAR_DNORM));
            // time-to-threat: 1 = imminent, 0 = far/none (only meaningful if a
            // threat exists — no bullets → danger 0 makes this irrelevant).
            obs[off + 1] = minD === Infinity ? 0 : Math.max(0, Math.min(1, 1 - tMinD / (RADAR_HS * RADAR_DTC)));
            // wall-trap: 1 = this heading jams into/along a wall. minEdge can go
            // negative (out of bounds); map [EDGECAP .. -EDGECAP] → [0 .. 1].
            obs[off + 2] = Math.max(0, Math.min(1, 1 - (minEdge + RADAR_EDGECAP) / (2 * RADAR_EDGECAP)));
          }
          const g = 4 + RADAR_SECTORS * RADAR_FEATS;
          obs[g + 0] = Math.min(1, nAlive / 32);                                   // field density
          obs[g + 1] = Math.max(0, Math.min(1, 1 - Math.min(W - Math.abs(agent.x), H - Math.abs(agent.y)) / RADAR_EDGECAP)); // cornered now
          obs[g + 2] = -agent.x / W;                                               // toward-center x
          obs[g + 3] = -agent.y / H;                                               // toward-center y
        }
        return obs;
      },
      isAlive(state) { return !state.dead; },
      tick(state, dt) {
        if (state.dead) return;
        state.dodge.aliveTime += dt;
        // 1) Apply policy commands to the agent.
        const agent = state.world.nodes[state.agentIdx];
        const cmds = state.lastCmds || [0, 0];
        const cmdX = Math.max(-1, Math.min(1, cmds[0] || 0));
        const cmdY = Math.max(-1, Math.min(1, cmds[1] || 0));
        if (state.controlMode === 'velocity') {
          agent.vx = cmdX * state.maxSpeed;
          agent.vy = cmdY * state.maxSpeed;
        } else {
          // accel: integrate the command into velocity, then clamp to
          // maxSpeed so the agent doesn't accumulate infinite momentum.
          agent.vx = (agent.vx || 0) * (1 - state.world.damping) + cmdX * state.maxAccel * dt;
          agent.vy = (agent.vy || 0) * (1 - state.world.damping) + cmdY * state.maxAccel * dt;
          const sp = Math.hypot(agent.vx, agent.vy);
          if (sp > state.maxSpeed) {
            const k = state.maxSpeed / sp;
            agent.vx *= k; agent.vy *= k;
          }
        }
        // One semi-implicit displacement. P.step skips this explicit agent;
        // older versions drifted once in Verlet and a second time here.
        agent.x += agent.vx * dt;
        agent.y += agent.vy * dt;
        // Sync Verlet history so P.step doesn't re-derive a stale velocity
        // next frame -- agent.px/py are the "previous-step" position used
        // by the integrator. If we don't update them, the next step's
        // implicit-velocity computation contradicts our explicit move.
        agent.px = agent.x - agent.vx * dt;
        agent.py = agent.y - agent.vy * dt;
        // World bounds clamp.
        const e = state.worldExtent;
        if (agent.x < -e.halfW) { agent.x = -e.halfW; agent.vx = 0; }
        if (agent.x >  e.halfW) { agent.x =  e.halfW; agent.vx = 0; }
        if (agent.y < -e.halfH) { agent.y = -e.halfH; agent.vy = 0; }
        if (agent.y >  e.halfH) { agent.y =  e.halfH; agent.vy = 0; }
        // Synchronize AFTER collision response so no stale pre-clamp momentum
        // returns on the next step or in a planner clone.
        agent.px = agent.x - agent.vx * dt;
        agent.py = agent.y - agent.vy * dt;
        // 2) Run the pattern controller (spawn new bullets).
        if (state.dodge.patternDef && state.dodge.patternDef.tick) {
          state.dodge.patternDef.tick(
            state.dodge.patternCtrl, state, dt, state.dodge.patternRng);
        }
        // 3) Integrate existing bullets.
        const bullets = state.dodge.bullets;
        // Reset the per-step "closest bullet" gauge before scanning.
        // The reward objective reads this each tick to grant a smooth
        // safety bonus -- big when no bullet is nearby, fading to 0 as
        // the closest bullet gets within agent-radius range.
        let minDistThisStep = Infinity;
        // Did the agent get hit this step? Tracked locally so we can
        // update safeStreakTime after the bullet loop. "Hit" means a
        // collision that actually registered (i.e. wasn't suppressed
        // by the no-die invulnerability window). For terminal-mode,
        // any collision IS a hit.
        let gotHitThisStep = false;
        for (let i = 0; i < bullets.length; i++) {
          const b = bullets[i];
          if (!b.alive) continue;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          // Despawn off-screen (with a small margin so bullets that
          // re-enter aren't accidentally killed mid-trajectory).
          if (b.x < -e.halfW - 40 || b.x > e.halfW + 40
              || b.y < -e.halfH - 40 || b.y > e.halfH + 40) {
            b.alive = false;
            continue;
          }
          // Collision + near-miss tracking.
          const dx = b.x - agent.x, dy = b.y - agent.y;
          const d  = Math.hypot(dx, dy);
          if (d < minDistThisStep) minDistThisStep = d;
          const collR  = b.r + agentRadius;
          const grazeR = collR * 2.5;
          if (d <= collR) {
            if (state.dodge.noDie) {
              // No-die mode: register the hit but keep going. The
              // invulnerability window prevents a tight cluster from
              // charging the agent on every step while overlapping. The
              // colliding bullet is consumed regardless so it can't
              // double-hit on its way past.
              if (state.dodge._invulnLeft <= 0) {
                state.dodge.hitsTaken += 1;
                state.dodge._hitsToCredit += 1;
                state.dodge._invulnLeft = state.dodge.invulnSeconds;
                gotHitThisStep = true;
              }
              b.alive = false;
            } else {
              state.dead = true;
              state.dodge.dead = true;
              b.alive = false;
              gotHitThisStep = true;
            }
          } else if (d <= grazeR) {
            b._wasClose = true;
          } else if (b._wasClose && !b._credited) {
            // Bullet was close, has moved away again -> near miss.
            state.dodge.nearMisses += 1;
            state.dodge._nearMissCredits += 1;
            b._credited = true;
          }
        }
        // Stash the per-step minimum distance so the reward objective
        // can read it. If no bullets were alive we leave it at Infinity
        // (the reward function treats that as "fully safe").
        state.dodge.minBulletDist = minDistThisStep;
        // Derive the safety scalar (0..1) and update the moving-average
        // performance gauge. We compute it here (not in the objective)
        // so the UI gauge stays accurate even when the user is running
        // an objective other than dodge_survive. SAFE_DIST_PX matches
        // the objective's normalization -- both read it from state.dodge
        // so the two views can't drift apart.
        const SAFE_DIST_PX = state.dodge.safeDistPx || 120;
        const safeNow = !isFinite(minDistThisStep)
          ? 1
          : Math.max(0, Math.min(1, minDistThisStep / SAFE_DIST_PX));
        // Time-constant EMA: α = 1 - exp(-dt/τ) gives a true exponential
        // average over τ seconds regardless of the simulation step size.
        // τ = 1.5 s ≈ "how safe was I over the last second or two" --
        // long enough to filter per-frame noise, short enough that the
        // gauge reacts when the agent steps into a fresh wave.
        const tau = 1.5;
        const alpha = 1 - Math.exp(-dt / tau);
        state.dodge.recentSafety =
          state.dodge.recentSafety * (1 - alpha) + safeNow * alpha;
        // Rollout-lifetime mean. Useful as a per-evaluation summary stat
        // for the trainer / behavior archive; integrated as a simple
        // arithmetic mean so it's directly comparable across rollouts
        // regardless of dt.
        state.dodge._safetyAccum  += safeNow;
        state.dodge._safetySamples += 1;
        state.dodge.rolloutMeanSafety =
          state.dodge._safetyAccum / state.dodge._safetySamples;
        // Safe-streak update. Reset to 0 when hit this step (terminal
        // collision or no-die clip); otherwise extend by dt. Update
        // the rollout high-water mark so the trainer / HUD can show
        // "best streak this run" even after a reset. In terminal-death
        // mode the agent never gets another step after a fatal hit, so
        // the reset is a no-op there -- the streak just caps at the
        // last value before death (which IS the policy's "alive time"
        // up to that point).
        if (gotHitThisStep) {
          state.dodge.safeStreakTime = 0;
        } else {
          state.dodge.safeStreakTime += dt;
          if (state.dodge.safeStreakTime > state.dodge.longestSafeStreak) {
            state.dodge.longestSafeStreak = state.dodge.safeStreakTime;
          }
        }
        // Tick down the invulnerability timer. Only matters in no-die mode.
        if (state.dodge._invulnLeft > 0) {
          state.dodge._invulnLeft = Math.max(0, state.dodge._invulnLeft - dt);
        }
        // Compact dead bullets periodically so the array doesn't grow
        // unboundedly. Cheap: copy survivors into the prefix.
        if (bullets.length > 32) {
          let w2 = 0;
          for (let i = 0; i < bullets.length; i++) {
            if (bullets[i].alive) bullets[w2++] = bullets[i];
          }
          bullets.length = w2;
        }
      },
    };
  }

  // ----- rail-catcher (1-D reactive tracking demo) ---------------------------
  // The bare cart (no pendulum) slides to stay under a slowly-drifting dot.
  // Reuses the chain_trace closeness reward: tipIdx = cartIdx and the target is
  // held at the cart's y, so the 2-D tip→target distance collapses to the 1-D
  // |cart.x − dot.x|. A textbook "trains-fast + immediately-works" reactive
  // position-matching demo (dense reward, gen-0 starts aligned, short horizon).
  function makeRailCatcher() {
    const AMPL = 150;        // dot oscillation amplitude (px); well inside the ±240 rail
    const PERIOD = 5;        // s per oscillation → peak dot speed ~190px/s << cartMaxSpeed 600
    const DIST_SCALE = 250;  // closeness REF: do-nothing-at-center stays positive
    return {
      id: 'rail-catcher',
      label: 'Rail catcher (track a drifting dot)',
      relevantObjectiveIds: ['chain_trace'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: cartIdx,        // the cart itself is the tracker (no chain)
          segments: [],
          railCatch: { center: cart.x, ampl: (opts && opts.railCatchAmpl != null) ? opts.railCatchAmpl : AMPL, period: PERIOD, time: 0, railY: cart.y },
          // Reuse the point-target plumbing: the objective reads the target via
          // getTargetAt → kinematics.chainReach; tick() keeps it current.
          chainReach: {
            target: { x: cart.x, y: cart.y },   // starts directly under the cart (gen-0 aligned)
            successRadius: 20,
            distScale: DIST_SCALE,
          },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δdot→cart x (norm)', 'dot vx (norm)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dx', 'dv', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx];
        const rc = state.railCatch;
        const omega = (2 * Math.PI) / rc.period;
        const dotVx = rc.ampl * omega * Math.cos(omega * rc.time);
        const tgt = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((tgt.x - cart.x) / 240, -2, 2),
          clamp(dotVx / 600, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      // Advance the drifting dot each step (after the physics step, before the
      // objective reads it — the trainer's tick ordering). Held level with the
      // cart's y so the reward is exactly the 1-D horizontal tracking error.
      tick(state, dt) {
        const rc = state.railCatch;
        rc.time += dt;
        const omega = (2 * Math.PI) / rc.period;
        state.chainReach.target.x = rc.center + rc.ampl * Math.sin(omega * rc.time);
        state.chainReach.target.y = rc.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Catch the drop ==========
  // A bare cart (no chain) slides along the rail to stay UNDER a dot that falls
  // from the top, then respawns at a new horizontal position once it lands —
  // catch-the-falling-object. Reuses the chain-reach target plumbing (the
  // falling dot IS the target, so the existing overlay draws it) and the x-only
  // catch_drop closeness reward. Stable + reactive + dense + gen-0 aligned (the
  // first drop falls straight onto the cart's start) — trains fast like
  // rail-catcher, but a distinct archetype (intercept a falling object, with a
  // step-change in target x between drops rather than smooth drift).
  function makeCatchDrop() {
    const SPREAD = 180;      // horizontal range of drop x (px); well inside ±240
    const RISE = 180;        // px the dot falls (spawn height above the cart line)
    const FALL_TIME = 1.5;   // s per drop → peak fall speed 120px/s, easily caught
    const DIST_SCALE = 240;  // x-closeness REF: do-nothing-at-center stays positive
    return {
      id: 'catch-drop',
      label: 'Catch the drop (slide under a falling dot)',
      relevantObjectiveIds: ['catch_drop'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const topY = cart.y - RISE;            // +y is down, so the top is a smaller y
        const railY = cart.y;
        return {
          world: world,
          cartIdx: cartIdx,
          tipIdx: cartIdx,        // the cart itself is the catcher (no chain)
          segments: [],
          catchDrop: { topY: topY, railY: railY, fallSpeed: RISE / FALL_TIME, spread: (opts && opts.catchDropSpread != null) ? opts.catchDropSpread : SPREAD, count: 0 },
          // The falling dot is exposed as the chain-reach target so the existing
          // target overlay draws it; catch_drop reads target.x for x-alignment.
          chainReach: {
            target: { x: 0, y: topY },   // first drop falls straight onto the cart's start (gen-0 aligned)
            successRadius: 24,
            distScale: DIST_SCALE,
          },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δdrop→cart x (norm)', 'drop height (0 top→1 landing)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dx', 'h', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const cd = state.catchDrop;
        const t = state.chainReach.target;
        const heightFrac = clamp((t.y - cd.topY) / (cd.railY - cd.topY), 0, 1);
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          heightFrac,
          1.0,
        ];
      },
      actionCount: 1,
      // Drop the dot each step; on landing, respawn at the top at a new x. The
      // x sequence is deterministic (golden-angle spread) so it varies between
      // drops without per-rollout randomness — the policy can't memorize one x.
      tick(state, dt) {
        const cd = state.catchDrop;
        const t = state.chainReach.target;
        t.y += cd.fallSpeed * dt;
        if (t.y >= cd.railY) {
          cd.count += 1;
          t.y = cd.topY;
          t.x = cd.spread * Math.sin(cd.count * 2.39996323);   // golden-angle-ish spread
        }
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Pick-side ==========
  // A bare cart hops to whichever of two fixed posts (±SEP) is currently lit;
  // the lit post flips on a fixed beat (HOLD seconds). Binary reactive
  // repositioning — distinct from the smooth/continuous targets of the other
  // demos. HOLD is load-bearing: long enough that the cart reaches the lit post
  // and waits, so the task stays REACTIVE (shrink it and it becomes
  // anticipatory). Reuses the catch_drop x-only closeness reward.
  function makePickSide() {
    const SEP = 120;         // two posts at ±120 (well inside the ±240 rail)
    const HOLD = 2.0;        // s per side; >> the ~0.5s traverse+settle at cartAccel 3200, so
                             // the cart spends most of each hold parked ON the post (crisper demo)
    const DIST_SCALE = 240;
    return {
      id: 'pick-side',
      label: 'Pick-side (hop to the lit post on the beat)',
      relevantObjectiveIds: ['catch_drop'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const sep = (opts && opts.pickSideSep != null) ? opts.pickSideSep : SEP;
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          pickSide: { sep: sep, hold: HOLD, time: 0, railY: cart.y },
          // first post (t=0) is the LEFT one; cart starts at 0 → gen-0 within 0.5·REF
          chainReach: { target: { x: -sep, y: cart.y }, successRadius: 24, distScale: DIST_SCALE },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δpost→cart x (norm)', 'lit side (±0.5)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dx', 's', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          (t.x >= 0 ? 0.5 : -0.5),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const ps = state.pickSide;
        ps.time += dt;
        const p = Math.floor(ps.time / ps.hold);
        state.chainReach.target.x = (p % 2 === 0) ? -ps.sep : ps.sep;
        state.chainReach.target.y = ps.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Flee the dot ==========
  // The conceptual INVERSE of rail-catcher: a bare cart maximizes its distance
  // from a dot that actively homes toward it (plus a sway so it can't just be
  // out-run to a wall). Reactive evasion via the new flee_evade reward (the
  // negation of catch_drop's closeness — reward GROWS with the gap, saturating
  // at REF so there's no pull to the rail edge).
  function makeFleeTheDot() {
    const HOME_SPEED = 70;   // px/s the pursuer eases toward the cart's current x
    const SWAY_AMPL = 90; const SWAY_PERIOD = 2.5;
    const DIST_SCALE = 160;  // reward saturates once the cart is 160px clear
    return {
      id: 'flee-the-dot',
      label: 'Flee the dot (reactive evasion)',
      relevantObjectiveIds: ['flee_evade'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          flee: { base: cart.x + 120, homeSpeed: (opts && opts.fleeHomeSpeed != null) ? opts.fleeHomeSpeed : HOME_SPEED, swayAmpl: SWAY_AMPL, swayPeriod: SWAY_PERIOD, time: 0, railY: cart.y },
          // pursuer starts 120px to the cart's right → nonzero gen-0 reward + a clear "flee left" gradient
          chainReach: { target: { x: cart.x + 120, y: cart.y }, successRadius: DIST_SCALE, distScale: DIST_SCALE },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δpursuer→cart x (norm)', 'Δhoming-core→cart x (norm)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dp', 'dh', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const f = state.flee; const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          clamp((f.base - cart.x) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const f = state.flee; const cart = state.world.nodes[state.cartIdx];
        f.time += dt;
        // homing core eases toward the cart at a bounded speed (so it never teleports onto it)
        const dx = cart.x - f.base;
        f.base += Math.max(-f.homeSpeed * dt, Math.min(f.homeSpeed * dt, dx));
        const sway = f.swayAmpl * Math.sin((2 * Math.PI / f.swayPeriod) * f.time);
        state.chainReach.target.x = f.base + sway;
        state.chainReach.target.y = f.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Cruise control ==========
  // VELOCITY-domain tracking (not position): a bare cart drives its own velocity
  // to match a dot gliding at a smoothly-varying cruise speed. The new vel_match
  // reward reads the commanded velocity (kin.velTarget). Gen-0 aligned: the
  // command starts at 0 (matching the cart's rest velocity). The dot itself
  // glides on the rail as a visual cue.
  function makeCruiseControl() {
    const VAMPL = 200;       // px/s peak cruise velocity (<< cartMaxSpeed 600)
    const PERIOD = 6;
    return {
      id: 'cruise-control',
      label: 'Cruise control (match the dot’s speed)',
      relevantObjectiveIds: ['vel_match'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          velMatch: { ampl: (opts && opts.cruiseVAmpl != null) ? opts.cruiseVAmpl : VAMPL, period: PERIOD, time: 0, targetVx: 0, railY: cart.y },
          // the gliding dot is the visual cue; vel_match scores velocity, not this x
          chainReach: { target: { x: cart.x, y: cart.y }, successRadius: 9999, distScale: 400 },
        };
      },
      observationCount: 5,
      observationLabels: ['cart vx (norm)', 'Δvx target−cart (norm)', 'target vx (norm)', 'phase cue', 'bias = 1'],
      observationAbbr: ['vx', 'dv', 'tv', 'ph', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const vm = state.velMatch;
        return [
          clamp(cart.vx / 600, -2, 2),
          clamp((vm.targetVx - cart.vx) / 400, -2, 2),
          clamp(vm.targetVx / 400, -2, 2),
          Math.cos((2 * Math.PI / vm.period) * vm.time),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const vm = state.velMatch;
        vm.time += dt;
        vm.targetVx = vm.ampl * Math.sin((2 * Math.PI / vm.period) * vm.time);
        const t = state.chainReach.target;
        t.x = Math.max(-240, Math.min(240, t.x + vm.targetVx * dt));
        t.y = vm.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Accelerating track ==========
  // A chirp: a bare cart shadows a dot whose oscillation SPEEDS UP over the
  // rollout, deliberately crossing cartMaxSpeed (~t=6.4s) so the trackable head
  // and the un-trackable tail are both visible — a built-in measurement of how
  // far reactive tracking goes without a curriculum. Reuses chain_trace (target
  // pinned to the cart's height → 2-D dist collapses to |x|).
  function makeAcceleratingTrack() {
    const AMPL = 180; const W0 = 0.6; const K = 0.45;   // peak speed A*(W0+K*t) crosses 600px/s at t≈6.4s
    const DIST_SCALE = 240;
    return {
      id: 'accelerating-track',
      label: 'Accelerating track (chirp dot — find the break)',
      relevantObjectiveIds: ['chain_trace'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          chirp: { ampl: AMPL, w0: W0, k: (opts && opts.chirpRate != null) ? opts.chirpRate : K, time: 0, phase: 0, railY: cart.y, targetVx: 0 },
          chainReach: { target: { x: cart.x, y: cart.y }, successRadius: 12, distScale: DIST_SCALE },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δdot→cart x (norm)', 'dot vx (norm)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dx', 'dv', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const ch = state.chirp; const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          clamp(ch.targetVx / 600, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const ch = state.chirp;
        const w = ch.w0 + ch.k * ch.time;       // instantaneous angular rate
        ch.phase += w * dt;
        ch.time += dt;
        const t = state.chainReach.target;
        t.x = ch.ampl * Math.sin(ch.phase);
        ch.targetVx = ch.ampl * Math.cos(ch.phase) * w;
        t.y = ch.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Safe zone ==========
  // A bare cart keeps itself inside a SAFE BAND (a plateau target, not a point)
  // that drifts smoothly along the rail. Reward (zone_keep) is full anywhere
  // inside the band and ramps down outside — so the skill is "stay within the
  // moving zone", a dense generalization of point-tracking. The band's drawn as
  // the chain-reach target dot + its success ring (= the band width), so the
  // existing overlay shows the zone for free. The curriculum narrows the band
  // (safeZoneHalf) so the cart must track the center ever more precisely.
  function makeSafeZone() {
    const HALF = 55;   // band half-width (px) at the shipped-hard difficulty
    const REF = 120;   // px ramp margin outside the band
    return {
      id: 'safe-zone',
      label: 'Safe zone (stay in the drifting band)',
      relevantObjectiveIds: ['zone_keep'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const half = (opts && opts.safeZoneHalf != null) ? opts.safeZoneHalf : HALF;
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          safeZone: { time: 0, railY: cart.y, cdot: 0 },
          // band center on target.x; successRadius = half-width (the overlay ring
          // shows the band); distScale = the outside-band reward ramp (REF).
          chainReach: { target: { x: cart.x, y: cart.y }, successRadius: half, distScale: REF },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δband-center→cart x (norm)', 'band drift vel', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dc', 'cd', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const sz = state.safeZone; const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          clamp(sz.cdot / 300, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const sz = state.safeZone; const t = state.chainReach.target;
        sz.time += dt;
        const w1 = 2 * Math.PI / 7, w2 = 2 * Math.PI / 3.3;   // incommensurate → non-repeating drift
        t.x = 150 * Math.sin(w1 * sz.time) + 60 * Math.sin(w2 * sz.time);
        sz.cdot = 150 * w1 * Math.cos(w1 * sz.time) + 60 * w2 * Math.cos(w2 * sz.time);
        t.y = sz.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Midpoint meet ==========
  // A bare cart holds the MIDPOINT of two independently-drifting dots — the
  // tracked target is not on either dot but the average between them, so the
  // policy must learn the relation x* = (x1+x2)/2 from the two dots in its
  // observation (a derived-target skill the single-dot demos never exercise).
  // The two source dots are drawn by drawMidpointDots; the midpoint is the
  // chain-reach target (reused catch_drop x-only reward, distScale tightened to
  // 130 so the averaging basin is steep). The curriculum scales the whole
  // configuration up from a tight cluster to the full spread (midpointScale).
  function makeMidpointMeet() {
    const A1 = 110, B1 = -60, P1 = 5.0;            // dot1 = -60 + 110·sin(2πt/5)
    const A2 = 90, B2 = 60, P2 = 3.5, PH2 = 1.3;   // dot2 =  60 + 90·sin(2πt/3.5 + 1.3)
    const DIST_SCALE = 130;
    return {
      id: 'midpoint-meet',
      label: 'Midpoint meet (hold the average of two dots)',
      relevantObjectiveIds: ['catch_drop'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const s = (opts && opts.midpointScale != null) ? opts.midpointScale : 1.0;
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          midpoint: { a1: A1 * s, b1: B1 * s, a2: A2 * s, b2: B2 * s, p1: P1, p2: P2, ph2: PH2,
                      time: 0, railY: cart.y, dot1x: B1 * s, dot2x: B2 * s + A2 * s * Math.sin(PH2) },
          chainReach: { target: { x: cart.x, y: cart.y }, successRadius: 18, distScale: DIST_SCALE },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δdot1→cart x (norm)', 'Δdot2→cart x (norm)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'd1', 'd2', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const mp = state.midpoint;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((mp.dot1x - cart.x) / 240, -2, 2),
          clamp((mp.dot2x - cart.x) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const mp = state.midpoint; const t = state.chainReach.target;
        mp.time += dt;
        mp.dot1x = mp.b1 + mp.a1 * Math.sin((2 * Math.PI / mp.p1) * mp.time);
        mp.dot2x = mp.b2 + mp.a2 * Math.sin((2 * Math.PI / mp.p2) * mp.time + mp.ph2);
        t.x = (mp.dot1x + mp.dot2x) / 2;
        t.y = mp.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Tag sequence ==========
  // A SELF-PACED sequence, not a timed one: a bare cart must reach the currently
  // LIT post; touching it lights the NEXT post in a 4-post cycle, so the cart
  // patrols the posts in order at its own pace (reach -> advance -> reach ...).
  // The lit post is the chain-reach target (drawn by the existing overlay);
  // reuses the catch_drop x-closeness reward. More agentic than the simple
  // demos — the policy's own success drives the task forward (a closed loop).
  function makeTagSequence() {
    const POSTS = [55, 160, -55, -160];   // cycle order; the first sits near the cart's start
    const RADIUS = 22;                     // contact radius that advances to the next post
    const DIST_SCALE = 240;
    return {
      id: 'tag-sequence',
      label: 'Tag sequence (touch the lit posts in order)',
      relevantObjectiveIds: ['tag_sequence'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        // tagSpread scales the post positions (curriculum: tight cluster -> full rail).
        const spread = (opts && opts.tagSpread != null) ? opts.tagSpread : 1.0;
        const posts = POSTS.map((p) => p * spread);
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          tagSeq: { posts: posts, active: 0, radius: RADIUS, railY: cart.y, tags: 0 },
          chainReach: { target: { x: posts[0], y: cart.y }, successRadius: RADIUS, distScale: DIST_SCALE },
        };
      },
      observationCount: 5,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δlit-post→cart x (norm)', 'lit post x (norm)', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'dp', 'px', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          clamp(t.x / 240, -1.5, 1.5),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const ts = state.tagSeq; const cart = state.world.nodes[state.cartIdx];
        ts.justTagged = false;
        if (Math.abs(cart.x - ts.posts[ts.active]) < ts.radius) {
          ts.active = (ts.active + 1) % ts.posts.length;
          ts.tags += 1;
          ts.justTagged = true;   // one-shot — the tag_sequence reward pays a bonus this step
        }
        state.chainReach.target.x = ts.posts[ts.active];
        state.chainReach.target.y = ts.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Prioritize nearest ==========
  // A SELECTION task: three dots drift independently and the cart must stay near
  // whichever is currently CLOSEST. The policy sees all three dots and has to
  // learn the argmin (go to the nearest) rather than tracking a single given
  // target. The three dots are drawn by drawExtraDots; the nearest is the teal
  // chain-reach target (reused catch_drop reward). Reactive + dense, but a
  // richer observation→action map than the single-dot demos.
  function makePrioritizeNearest() {
    const DOTS = [
      { amp: 150, period: 7.0, phase: 0.0 },
      { amp: 120, period: 4.5, phase: 2.0 },
      { amp: 90,  period: 9.0, phase: 4.0 },
    ];
    const DIST_SCALE = 240;
    function dotX(d, t) { return d.amp * Math.sin((2 * Math.PI / d.period) * t + d.phase); }
    return {
      id: 'prioritize-nearest',
      label: 'Prioritize nearest (chase the closest of three dots)',
      relevantObjectiveIds: ['catch_drop'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        // prioritizeAmpl scales the dot swing amplitudes (curriculum: nearly-still
        // dots -> full swings, so the nearest switches more often as it ramps).
        const ampl = (opts && opts.prioritizeAmpl != null) ? opts.prioritizeAmpl : 1.0;
        const dots = DOTS.map((d) => ({ amp: d.amp * ampl, period: d.period, phase: d.phase }));
        const xs = dots.map((d) => dotX(d, 0));
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          prioritize: { dots: dots, xs: xs, time: 0, railY: cart.y },
          extraDots: xs.map((x) => ({ x: x, y: cart.y })),
          chainReach: { target: { x: xs[0], y: cart.y }, successRadius: 22, distScale: DIST_SCALE },
        };
      },
      observationCount: 6,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'Δdot1→cart x', 'Δdot2→cart x', 'Δdot3→cart x', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'd1', 'd2', 'd3', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const xs = state.prioritize.xs;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp((xs[0] - cart.x) / 240, -2, 2),
          clamp((xs[1] - cart.x) / 240, -2, 2),
          clamp((xs[2] - cart.x) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const pr = state.prioritize; const cart = state.world.nodes[state.cartIdx];
        pr.time += dt;
        for (let i = 0; i < pr.dots.length; i++) {
          pr.xs[i] = dotX(pr.dots[i], pr.time);
          state.extraDots[i].x = pr.xs[i];
          state.extraDots[i].y = pr.railY;
        }
        // nearest dot is the target
        let best = 0, bestD = Infinity;
        for (let i = 0; i < pr.xs.length; i++) { const d = Math.abs(cart.x - pr.xs[i]); if (d < bestD) { bestD = d; best = i; } }
        state.chainReach.target.x = pr.xs[best];
        state.chainReach.target.y = pr.railY;
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Arm reach ==========
  // A STABLE multi-DOF demo: a cart carries a 2-link arm (rigid links) whose
  // ELBOW is servo-actuated, so the policy has 2 actions (cart force + elbow
  // angle) and must COORDINATE them to put the hand on a target. The target sits
  // down-and-to-the-side in the arm's natural (gravity-assisted) reachable region
  // — NOT up — so it's a stable reach, not a swing-up (the swing-up reacher was a
  // foil). Reuses the chain_joint actuator primitive + the chain_reach distance
  // reward. Shows multi-DOF coordination works fine when the pose is stable.
  function makeArmReach() {
    const L = 90;                            // link length (arm reach ~2L = 180px)
    const TARGET = { x: 120, y: 130 };       // down-right of the cart, well inside reach, no inversion
    const DIST_SCALE = 160; const SUCCESS_R = 25;
    return {
      id: 'arm-reach',
      label: 'Arm reach (cart + elbow → touch a target)',
      relevantObjectiveIds: ['chain_trace'],   // positive-closeness reward (well-calibrated for a stable reach)
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const midIdx = P.addNode(world, cart.x, cart.y + L, { mass: 1, radius: 8, label: 'elbow' });
        const tipIdx = P.addNode(world, cart.x, cart.y + 2 * L, { mass: 1, radius: 10, label: 'hand' });
        P.addRod(world, cartIdx, midIdx, L);
        P.addRod(world, midIdx, tipIdx, L);
        configureChainJoints(world, [cartIdx, midIdx, tipIdx], 1);   // actuate the elbow joint
        // armReachEase (curriculum): 0 = target AT the hand's hanging rest (trivial),
        // 1 = the full hard reach. Lerp between them.
        const ease = (opts && opts.armReachEase != null) ? opts.armReachEase : 1.0;
        const restX = cart.x, restY = cart.y + 2 * L;
        const tx = restX + (TARGET.x - restX) * ease;
        const ty = restY + (TARGET.y - restY) * ease;
        // reachRadius (curriculum): the ACCEPTING radius = both the scoring
        // reference (chain_trace reward = 1 - dist/distScale, so a bigger radius
        // makes scoring more lenient) AND the drawn success circle. Ramp it big ->
        // small for an "easy scoring first, then tighten" curriculum. Default =
        // the honest DIST_SCALE. Floor at SUCCESS_R so the circle stays meaningful.
        const reachRadius = (opts && opts.reachRadius != null)
          ? Math.max(SUCCESS_R, opts.reachRadius) : DIST_SCALE;
        return {
          world: world, cartIdx: cartIdx, tipIdx: tipIdx,
          segments: [[cartIdx, midIdx], [midIdx, tipIdx]],
          armReach: { midIdx: midIdx },
          jointControlMode: 'servo',
          chainReach: { target: { x: tx, y: ty }, successRadius: reachRadius, distScale: reachRadius },
        };
      },
      observationCount: 6,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'elbow bend (norm)', 'Δtip→target x', 'Δtip→target y', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'el', 'ex', 'ey', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx], tip = w.nodes[state.tipIdx];
        const elbow = chainBendAngle(w, state.cartIdx, state.armReach.midIdx, state.tipIdx);
        const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp(elbow / Math.PI, -1.5, 1.5),
          clamp((t.x - tip.x) / 240, -2, 2),
          clamp((t.y - tip.y) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 2,   // cart force + 1 elbow joint (servo)
      actionLabels: ['cart force', 'elbow joint cmd'],
      actionAbbr: ['cart', 'elb'],
      tick(state, dt) {
        applyChainJointCmds(state, state.jointControlMode);
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Arm track ==========
  // arm-reach + a MOVING target: the 2-link arm (cart + servo elbow) must FOLLOW
  // a target that sweeps slowly back and forth in the reachable down-side region
  // — reach-and-track instead of reach-and-hold. Still a stable pose; the sweep
  // is slow enough to track reactively. Reuses chain_trace closeness.
  function makeArmTrack() {
    const L = 90;
    const AMPL = 90, PERIOD = 7, BASE_Y = 140;   // horizontal sweep, y fixed in the reachable region
    const DIST_SCALE = 160; const SUCCESS_R = 25;
    return {
      id: 'arm-track',
      label: 'Arm track (2-link arm follows a moving target)',
      relevantObjectiveIds: ['chain_trace'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const midIdx = P.addNode(world, cart.x, cart.y + L, { mass: 1, radius: 8, label: 'elbow' });
        const tipIdx = P.addNode(world, cart.x, cart.y + 2 * L, { mass: 1, radius: 10, label: 'hand' });
        P.addRod(world, cartIdx, midIdx, L);
        P.addRod(world, midIdx, tipIdx, L);
        configureChainJoints(world, [cartIdx, midIdx, tipIdx], 1);
        return {
          world: world, cartIdx: cartIdx, tipIdx: tipIdx,
          segments: [[cartIdx, midIdx], [midIdx, tipIdx]],
          armReach: { midIdx: midIdx },
          // armTrackAmpl (curriculum): small sweep (near-static target) -> full sweep.
          armTrack: { time: 0, ampl: (opts && opts.armTrackAmpl != null) ? opts.armTrackAmpl : AMPL, period: PERIOD, baseX: cart.x, baseY: cart.y + BASE_Y },
          jointControlMode: 'servo',
          // starts at the sweep center (x=baseX, ~40px below the hand rest) — close to the
          // hand's hanging rest, so gen-0 is aligned.
          chainReach: { target: { x: cart.x, y: cart.y + BASE_Y }, successRadius: SUCCESS_R, distScale: DIST_SCALE },
        };
      },
      observationCount: 7,
      observationLabels: ['cart x (norm)', 'cart vx (norm)', 'elbow bend (norm)', 'Δtip→target x', 'Δtip→target y', 'target vx', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'el', 'ex', 'ey', 'tv', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx], tip = w.nodes[state.tipIdx];
        const elbow = chainBendAngle(w, state.cartIdx, state.armReach.midIdx, state.tipIdx);
        const t = state.chainReach.target; const at = state.armTrack;
        const omega = (2 * Math.PI / at.period);
        const tgtVx = at.ampl * omega * Math.cos(omega * at.time);
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp(elbow / Math.PI, -1.5, 1.5),
          clamp((t.x - tip.x) / 240, -2, 2),
          clamp((t.y - tip.y) / 240, -2, 2),
          clamp(tgtVx / 300, -2, 2),
          1.0,
        ];
      },
      actionCount: 2,
      actionLabels: ['cart force', 'elbow joint cmd'],
      actionAbbr: ['cart', 'elb'],
      tick(state, dt) {
        const at = state.armTrack;
        at.time += dt;
        const omega = (2 * Math.PI / at.period);
        state.chainReach.target.x = at.baseX + at.ampl * Math.sin(omega * at.time);
        state.chainReach.target.y = at.baseY;
        applyChainJointCmds(state, state.jointControlMode);
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Arm obstacle ==========
  // A 3-link arm (cart + TWO servo joints = 3 actions) must reach a down-side
  // target whose straight path is blocked by a fixed OBSTACLE, so the hand has to
  // route AROUND it. The reach_avoid reward = closeness − a soft repulsion from
  // the obstacle (a potential field). Both the target AND the obstacle are in the
  // observation, so the routing is reactive (no planning). The hardest demo: more
  // DOF + a non-convex path. Stable pose throughout (down-side, no swing-up).
  function makeArmObstacle() {
    const L = 70;                              // 3 links → ~210px reach
    const TARGET = { x: 150, y: 150 };         // relative to the cart; down-right
    const OBST = { x: 75, y: 180, r: 35 };     // on the straight path from rest tip to target
    const DIST_SCALE = 200; const SUCCESS_R = 28;
    return {
      id: 'arm-obstacle',
      label: 'Arm obstacle (2-joint arm reaches around an obstacle)',
      relevantObjectiveIds: ['reach_avoid'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const j1 = P.addNode(world, cart.x, cart.y + L, { mass: 1, radius: 7, label: 'j1' });
        const j2 = P.addNode(world, cart.x, cart.y + 2 * L, { mass: 1, radius: 7, label: 'j2' });
        const tip = P.addNode(world, cart.x, cart.y + 3 * L, { mass: 1, radius: 10, label: 'hand' });
        P.addRod(world, cartIdx, j1, L);
        P.addRod(world, j1, j2, L);
        P.addRod(world, j2, tip, L);
        configureChainJoints(world, [cartIdx, j1, j2, tip], 2);   // 2 actuated elbows (j1, j2)
        return {
          world: world, cartIdx: cartIdx, tipIdx: tip,
          segments: [[cartIdx, j1], [j1, j2], [j2, tip]],
          armObstacle: { j1: j1, j2: j2 },
          // armObstacleR (curriculum): tiny obstacle (near-direct reach) -> full size.
          obstacle: { x: cart.x + OBST.x, y: cart.y + OBST.y, r: (opts && opts.armObstacleR != null) ? opts.armObstacleR : OBST.r },
          jointControlMode: 'servo',
          chainReach: { target: { x: cart.x + TARGET.x, y: cart.y + TARGET.y }, successRadius: SUCCESS_R, distScale: DIST_SCALE },
        };
      },
      observationCount: 9,
      observationLabels: ['cart x', 'cart vx', 'joint1 bend', 'joint2 bend', 'Δtip→target x', 'Δtip→target y', 'Δtip→obstacle x', 'Δtip→obstacle y', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'j1', 'j2', 'tx', 'ty', 'ox', 'oy', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx], tip = w.nodes[state.tipIdx];
        const ao = state.armObstacle;
        const b1 = chainBendAngle(w, state.cartIdx, ao.j1, ao.j2);
        const b2 = chainBendAngle(w, ao.j1, ao.j2, state.tipIdx);
        const t = state.chainReach.target, ob = state.obstacle;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp(b1 / Math.PI, -1.5, 1.5),
          clamp(b2 / Math.PI, -1.5, 1.5),
          clamp((t.x - tip.x) / 240, -2, 2),
          clamp((t.y - tip.y) / 240, -2, 2),
          clamp((ob.x - tip.x) / 240, -2, 2),
          clamp((ob.y - tip.y) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 3,   // cart force + 2 elbow joints (servo)
      actionLabels: ['cart force', 'joint 1 cmd', 'joint 2 cmd'],
      actionAbbr: ['cart', 'j1', 'j2'],
      tick(state, dt) {
        applyChainJointCmds(state, state.jointControlMode);
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Arm dodge ==========
  // arm-obstacle with a MOVING obstacle: a 3-link arm (cart + 2 joints, 3 actions)
  // must hold a STATIC target while an obstacle DRIFTS horizontally through the
  // reach region — so the hand is repeatedly pushed off the target and has to
  // dodge, then return. Reuses reach_avoid (the repulsor moves) + drawObstacle
  // (the circle drifts). Reactive dynamic re-routing; still a stable pose.
  function makeArmDodge() {
    const L = 70;
    const TARGET = { x: 120, y: 150 };
    const OB = { baseX: 70, y: 170, r: 35, ampl: 80, period: 6 };   // sweeps x in [-10, 150] past the target
    const DIST_SCALE = 200; const SUCCESS_R = 28;
    return {
      id: 'arm-dodge',
      label: 'Arm dodge (hold a target around a drifting obstacle)',
      relevantObjectiveIds: ['reach_avoid'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const j1 = P.addNode(world, cart.x, cart.y + L, { mass: 1, radius: 7, label: 'j1' });
        const j2 = P.addNode(world, cart.x, cart.y + 2 * L, { mass: 1, radius: 7, label: 'j2' });
        const tip = P.addNode(world, cart.x, cart.y + 3 * L, { mass: 1, radius: 10, label: 'hand' });
        P.addRod(world, cartIdx, j1, L);
        P.addRod(world, j1, j2, L);
        P.addRod(world, j2, tip, L);
        configureChainJoints(world, [cartIdx, j1, j2, tip], 2);
        return {
          world: world, cartIdx: cartIdx, tipIdx: tip,
          segments: [[cartIdx, j1], [j1, j2], [j2, tip]],
          armObstacle: { j1: j1, j2: j2 },
          armDodge: { time: 0, baseX: cart.x + OB.baseX, ampl: OB.ampl, period: OB.period },
          obstacle: { x: cart.x + OB.baseX, y: cart.y + OB.y, r: OB.r },
          jointControlMode: 'servo',
          chainReach: { target: { x: cart.x + TARGET.x, y: cart.y + TARGET.y }, successRadius: SUCCESS_R, distScale: DIST_SCALE },
        };
      },
      observationCount: 9,
      observationLabels: ['cart x', 'cart vx', 'joint1 bend', 'joint2 bend', 'Δtip→target x', 'Δtip→target y', 'Δtip→obstacle x', 'Δtip→obstacle y', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'j1', 'j2', 'tx', 'ty', 'ox', 'oy', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx], tip = w.nodes[state.tipIdx];
        const ao = state.armObstacle;
        const b1 = chainBendAngle(w, state.cartIdx, ao.j1, ao.j2);
        const b2 = chainBendAngle(w, ao.j1, ao.j2, state.tipIdx);
        const t = state.chainReach.target, ob = state.obstacle;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp(b1 / Math.PI, -1.5, 1.5),
          clamp(b2 / Math.PI, -1.5, 1.5),
          clamp((t.x - tip.x) / 240, -2, 2),
          clamp((t.y - tip.y) / 240, -2, 2),
          clamp((ob.x - tip.x) / 240, -2, 2),
          clamp((ob.y - tip.y) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 3,
      actionLabels: ['cart force', 'joint 1 cmd', 'joint 2 cmd'],
      actionAbbr: ['cart', 'j1', 'j2'],
      tick(state, dt) {
        const ad = state.armDodge;
        ad.time += dt;
        state.obstacle.x = ad.baseX + ad.ampl * Math.sin((2 * Math.PI / ad.period) * ad.time);
        applyChainJointCmds(state, state.jointControlMode);
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Arm slot (thread the needle) ==========
  // A 3-link arm (cart + 2 joints, 3 actions) threads its fingertip onto a target
  // that sits in a narrow SLOT between two keep-out walls — surgical precision,
  // the visual opposite of the brute cart demos. The thread_slot reward is a
  // capped potential field (closeness minus a small per-wall barrier that cancels
  // at the slot center), so the funnel pulls the tip IN without the walls pushing
  // it out. The slot half-width (slotGap) is a curriculum knob: wide -> narrow.
  function makeArmSlot() {
    const L = 70;
    const TARGET = { x: 110, y: 150 };
    const WALL_R = 30, SLOT_GAP = 62, WALL_Y = 150;   // walls at target.x ± gap; slot width = 2*(gap-r) = 64px
    const DIST_SCALE = 200; const SUCCESS_R = 22;
    return {
      id: 'arm-slot',
      label: 'Thread the needle (arm reaches into a slot)',
      relevantObjectiveIds: ['thread_slot'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const j1 = P.addNode(world, cart.x, cart.y + L, { mass: 1, radius: 7, label: 'j1' });
        const j2 = P.addNode(world, cart.x, cart.y + 2 * L, { mass: 1, radius: 7, label: 'j2' });
        const tip = P.addNode(world, cart.x, cart.y + 3 * L, { mass: 1, radius: 10, label: 'hand' });
        P.addRod(world, cartIdx, j1, L);
        P.addRod(world, j1, j2, L);
        P.addRod(world, j2, tip, L);
        configureChainJoints(world, [cartIdx, j1, j2, tip], 2);
        // slotGap (curriculum): wide slot -> narrow. Walls flank the target at ±gap.
        const gap = (opts && opts.slotGap != null) ? opts.slotGap : SLOT_GAP;
        const tx = cart.x + TARGET.x, ty = cart.y + TARGET.y, wy = cart.y + WALL_Y;
        return {
          world: world, cartIdx: cartIdx, tipIdx: tip,
          segments: [[cartIdx, j1], [j1, j2], [j2, tip]],
          armObstacle: { j1: j1, j2: j2 },
          armSlot: { gap: gap, wallR: WALL_R, tx: tx, wy: wy },
          obstacles: [{ x: tx - gap, y: wy, r: WALL_R }, { x: tx + gap, y: wy, r: WALL_R }],
          jointControlMode: 'servo',
          chainReach: { target: { x: tx, y: ty }, successRadius: SUCCESS_R, distScale: DIST_SCALE },
        };
      },
      observationCount: 10,
      observationLabels: ['cart x', 'cart vx', 'joint1 bend', 'joint2 bend', 'Δtip→target x', 'Δtip→target y', 'Δtip→Lwall x', 'Δtip→Rwall x', 'Δtip→wall-line y', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'j1', 'j2', 'tx', 'ty', 'lx', 'rx', 'wy', '1'],
      buildObservation(state) {
        const w = state.world;
        const cart = w.nodes[state.cartIdx], tip = w.nodes[state.tipIdx];
        const ao = state.armObstacle, sl = state.armSlot;
        const b1 = chainBendAngle(w, state.cartIdx, ao.j1, ao.j2);
        const b2 = chainBendAngle(w, ao.j1, ao.j2, state.tipIdx);
        const t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp(b1 / Math.PI, -1.5, 1.5),
          clamp(b2 / Math.PI, -1.5, 1.5),
          clamp((t.x - tip.x) / 240, -2, 2),
          clamp((t.y - tip.y) / 240, -2, 2),
          clamp(((sl.tx - sl.gap) - tip.x) / 240, -2, 2),
          clamp(((sl.tx + sl.gap) - tip.x) / 240, -2, 2),
          clamp((sl.wy - tip.y) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 3,   // cart force + 2 elbow joints (servo)
      actionLabels: ['cart force', 'joint 1 cmd', 'joint 2 cmd'],
      actionAbbr: ['cart', 'j1', 'j2'],
      tick(state, dt) {
        applyChainJointCmds(state, state.jointControlMode);
      },
      isAlive() { return true; },
    };
  }

  // ========== Setup: Plate spin ==========
  // The cart carries a free ball in a CONCAVE tray and must scoot to a drifting
  // target WITHOUT spilling the ball. The ball is a 1-D bowl-on-cart dynamics
  // (offset from tray center): a restoring force toward center (the concave bowl,
  // so centered is a STABLE energy minimum — NOT an inverted pole) minus the
  // cart's acceleration (the pseudo-force that sloshes it) minus damping. So a
  // do-nothing cart keeps a centered ball centered (dense, gen-0-positive), and
  // the policy must accelerate SMOOTHLY to both reach the target and not slosh.
  // The bowl stiffness (plateStiff) is a curriculum knob: deep bowl -> flatter.
  function makePlateSpin() {
    const HALF = 70;           // tray half-width — ball lips/spills at ±HALF
    const STIFF = 9;           // bowl restoring stiffness (1/s^2); bigger = deeper bowl = easier
    const DAMP = 1.4;          // ball rolling damping
    const AMPL = 130, PERIOD = 6;   // target drift
    const DIST_SCALE = 240;
    return {
      id: 'plate-spin',
      label: 'Plate spin (carry a ball in a tray to a target)',
      relevantObjectiveIds: ['plate_spin'],
      buildWorld(opts) {
        const { world, cartIdx } = basicCartWorld(opts);
        const cart = world.nodes[cartIdx];
        const stiff = (opts && opts.plateStiff != null) ? opts.plateStiff : STIFF;
        return {
          world: world, cartIdx: cartIdx, tipIdx: cartIdx, segments: [],
          plate: { offset: 0, vel: 0, half: HALF, ballR: 9, stiff: stiff, damp: DAMP, prevVx: 0, trayY: cart.y - 16 },
          plateTarget: { ampl: AMPL, period: PERIOD, time: 0, center: cart.x, railY: cart.y },
          chainReach: { target: { x: cart.x, y: cart.y }, successRadius: 24, distScale: DIST_SCALE },
        };
      },
      observationCount: 6,
      observationLabels: ['cart x', 'cart vx', 'ball offset (norm)', 'ball vel (norm)', 'Δtarget→cart x', 'bias = 1'],
      observationAbbr: ['cx', 'vx', 'bo', 'bv', 'dx', '1'],
      buildObservation(state) {
        const cart = state.world.nodes[state.cartIdx];
        const pl = state.plate, t = state.chainReach.target;
        return [
          clamp(cart.x / 240, -1.5, 1.5),
          clamp(cart.vx / 600, -2, 2),
          clamp(pl.offset / pl.half, -1.5, 1.5),
          clamp(pl.vel / 400, -2, 2),
          clamp((t.x - cart.x) / 240, -2, 2),
          1.0,
        ];
      },
      actionCount: 1,
      tick(state, dt) {
        const cart = state.world.nodes[state.cartIdx];
        const pl = state.plate;
        // cart's actual acceleration this step drives the ball in the cart frame
        const aCart = (cart.vx - pl.prevVx) / dt;
        pl.prevVx = cart.vx;
        // ball-in-concave-bowl: restoring(stable) − pseudo-force(cart accel) − damping
        pl.vel += (-pl.stiff * pl.offset - aCart - pl.damp * pl.vel) * dt;
        pl.offset += pl.vel * dt;
        // EXACT lip collision: the ball is a disc of radius ballR, so its EDGE
        // (not its center) contacts the tray wall — reflect when |offset| reaches
        // half − ballR, and mirror the overshoot back with restitution rather than
        // hard-clamping the center to the lip (which let the ball bury a full
        // radius into the wall / bounce a radius early). REST = 0.3.
        const REST = 0.3;
        const edge = pl.half - pl.ballR;
        if (pl.offset > edge) {
          pl.offset = edge - (pl.offset - edge) * REST;   // reflect the penetration
          pl.vel = -Math.abs(pl.vel) * REST;
        } else if (pl.offset < -edge) {
          pl.offset = -edge - (pl.offset + edge) * REST;
          pl.vel = Math.abs(pl.vel) * REST;
        }
        // drift the target
        const pt = state.plateTarget;
        pt.time += dt;
        state.chainReach.target.x = pt.center + pt.ampl * Math.sin((2 * Math.PI / pt.period) * pt.time);
        state.chainReach.target.y = pt.railY;
      },
      isAlive() { return true; },
    };
  }

  // ===== Setup: Terrain run (randomised tile-platformer traversal) ==========
  //
  // PORTED from the terrain-run probe. Every constant below is a MEASURED
  // value, not a taste call. What the probe established about the TASK (2
  // rounds, ~1300 training runs, 6 independent adversarial verifiers, scored on
  // 128 held-out courses never seen in training):
  //   · the null policy AND the all-zero parameter vector both score exactly
  //     0.000000 — there is no assist floor to farm;
  //   · split-half correlation of per-course completion across disjoint run
  //     sets r = 0.986 — per-course difficulty is a stable, real signal;
  //   · 0 of 128 courses are completed by no run and 0 of 128 by every run —
  //     the held-out set discriminates across the whole range;
  //   · a HINDSIGHT oracle allowed to pick the best of 294 open-loop reflex
  //     configs PER COURSE solves only 103 of 128, so no fixed reflex explains
  //     the learned performance.
  // On the 'hard' geometry (attainable max 100.0): null 0.00, holdRight 11.2,
  // spamJump 18.4, best fixed-timer jumper 19.6-23.3, scripted full-information
  // reflex oracle 88.6 (80% of courses completed), trained policies 95.4-98.5.
  //
  // AIR CONTROL. driveAccel is multiplied by airControl = 0.14 while airborne,
  // so horizontal speed can only be built with feet on the floor and a jump
  // commits to the arc it left the ground with. It is a real param
  // (terrainAirControl) so it can be studied, and every rung leaves it at 0.14.
  //
  // It is NOT, however, what makes "hold right + spam jump" fail — that claim
  // used to sit here and in the preset description, and it does not survive
  // measurement. Ablated on this build over the same 128 held-out courses of
  // 'hard', jump-spam scores:
  //     shipped (airControl 0.14)   18.36 tiles, 0/128 goals (73 falls, 55 hazards)
  //     airControl 1.0              19.40 tiles, 0/128 goals  (+5.7%, still 0)
  //     no spike ceilings           23.41 tiles, 3/128 goals
  //     no ceilings + airControl 1  26.63 tiles, 2/128 goals
  // A 4-seed guard used to report a 1.38x gain from removing air control; at
  // n = 128 that gain is 1.06x and at n = 512 it is 0.95x. What actually sinks
  // jump-spam is that a fixed cadence is not synchronised with the pits (falls
  // dominate every ablation) plus the spike-ceiling 'tunnel' feature.
  //
  // Unlike every other setup in this file, terrain-run does NOT simulate on
  // BF.physics: a tile platformer needs swept AABB-vs-tilemap resolution, not a
  // Verlet particle solver. The authoritative agent lives in
  // state.terrainRun.agent (pixels, +y DOWN, TILE = 20 px) and is MIRRORED onto
  // one gravity-free world node at the end of every tick (px/py resynced from
  // its velocity) so the shared kinematics(), the renderer, the trail and the
  // ghost skeletons keep working unchanged. P.step runs BEFORE setup.tick and
  // therefore can never move the agent: whatever drift it applies to the mirror
  // node is overwritten by the resync before anything reads it.
  const TERRAIN_TILE = 20;
  const T_EMPTY = 0, T_SOLID = 1, T_HAZARD = 2;

  // Physics + geometry defaults. Physics hard limits, all derivable from these:
  //   airtime at level height  = 2·jumpVel/gravity          = 0.489 s
  //   level jump range at maxSpeed                          = 97.8 px = 4.9 tiles
  //   apex                     = jumpVel²/(2·gravity)       = 53.8 px = 2.69 tiles
  // so a g-tile pit needs g·TILE − 14 px of travel: g = 5 is the widest
  // CLEARABLE pit and g = 6 is provably impossible. gapMax must never exceed 5.
  const TERRAIN_DEFAULTS = {
    // --- course geometry ---
    gridW: 84,            // course length in tiles
    gridH: 20,            // world height in tiles
    baseRow: 14,          // starting ground surface row
    startPad: 5,          // tiles of guaranteed flat ground at the start
    // --- difficulty knobs ---
    gapMin: 2, gapMax: 4, // pit width, tiles
    ledgeMax: 2,          // max step-UP height, tiles
    dropMax: 3,           // max step-DOWN height, tiles
    segMin: 3, segMax: 7, // flat run between features, tiles
    wGap: 0.32,           // feature mix (renormalised)
    wStepUp: 0.20,
    wStepDown: 0.14,
    wPlatform: 0.11,
    wSpikeGround: 0.13,
    wTunnel: 0.10,        // spike ceiling with a safe lead-in / lead-out
    // --- physics ---
    gravity: 1800,        // px/s²
    driveAccel: 2400,     // px/s² on the ground
    airControl: 0.14,     // ×driveAccel while airborne — the anti-spam-jump term
    maxSpeed: 200,        // px/s horizontal cap
    groundDrag: 7.0,      // 1/s, applied when no drive command and grounded
    jumpVel: 440,         // px/s upward impulse
    jumpCooldown: 0.10,   // s between jumps
    agentHalfW: 7, agentHalfH: 9,   // px
    // --- episode ---
    evalSeconds: 12,      // the rung's RECOMMENDED rollout length — ADVISORY.
                          // The rollout is timed by trainer.params.evalSeconds;
                          // NOTHING here reads this field, and neither does the
                          // objective's ceiling (which scales with gridW). It
                          // exists so a preset can copy the rung's value out of
                          // terrainGeometry() instead of retyping it, and the
                          // terrainEvalSeconds knob only edits this advisory
                          // copy. Guarded in smoke-test.js ("who owns the
                          // rollout length"). Practical consequence: a
                          // curriculum that ramps the course LONGER without
                          // also raising trainer.params.evalSeconds raises the
                          // ceiling out of reach — ~25 s of pure travel at
                          // maxSpeed is needed for the 250-tile rung.
    dt: 1 / 60,           // the physics step every number above was measured at.
                          // The trainer uses trainer.params.physicsDt; a preset
                          // for this setup must set it to THIS, because the
                          // control rate (controlEvery, below) is expressed in
                          // physics steps.
    controlEvery: 2,      // policy decisions are HELD for this many physics
                          // STEPS, i.e. 30 Hz control at the 1/60 s step the
                          // task was measured at. Being expressed in steps, the
                          // realised rate IS 1/(controlEvery·physicsDt): at the
                          // app-wide default 1/120 it becomes 60 Hz. That is
                          // why a preset for this setup must pin physicsDt —
                          // the probe measured the control rate as a
                          // non-monotonic axis (30 Hz -> 20 Hz cost gauntlet
                          // 93% -> 62% goal, while 15 Hz recovered to 97%), so
                          // it is not a knob to leave to chance.
    goalBonus: 20,        // one-shot on reaching the right edge
    // --- observation geometry (FIXED: these size the genome, so they are NOT
    //     per-rollout params — see the observation-shape note in the setup) ---
    patchBack: 3, patchFwd: 8,      // 12 patch columns
    patchUp: 5, patchDown: 2,       // 8 patch rows
    summaryK: 8,                    // lookahead columns in the hand summary
    headroomCap: 6,                 // tiles; headroom feature saturates here
  };
  // Observation geometry is deliberately not overridable per rollout: it sets
  // observationCount, i.e. the genome's input width. Keeping it out of the
  // per-rollout param path is what makes "world width == genome width" a
  // structural guarantee rather than a threading discipline.
  const TERRAIN_OBS_KEYS = ['patchBack', 'patchFwd', 'patchUp', 'patchDown',
                            'summaryK', 'headroomCap'];

  // The difficulty ladder. Each entry is a partial override of TERRAIN_DEFAULTS.
  //   'hard'     — tuned so the scripted full-information oracle still reaches
  //                the goal on 80% of courses (a rung a perfect-information
  //                hand controller fails is a noise generator, not a
  //                discriminator). Attainable max 100.0.
  //   'crucible' — the NON-SATURATED rung: every pit is the 4-tile one, 2-3
  //                flat tiles between features, ~36 obstacles per course
  //                (counted on this build: mean 36.4, median 36 over the 128
  //                held-out course seeds — the "~38" that used to sit here was
  //                an estimate, not a count).
  //                Attainable max 266.0. Best measured arm (both-mlp-S, 445 p)
  //                231.2 mean / 78% completed.
  //   'brutal'   — DOCUMENTED NOISE GENERATOR (gapMax 5 = an ~12 px takeoff
  //                window, under 2 control ticks). Kept only to show the score
  //                collapse; never read a ranking off it.
  const TERRAIN_DIFFICULTY = {
    easy:   { gapMin: 2, gapMax: 3, ledgeMax: 1, dropMax: 2, segMin: 4, segMax: 8,
              wGap: 0.34, wStepUp: 0.20, wStepDown: 0.16, wPlatform: 0.08,
              wSpikeGround: 0.14, wTunnel: 0.08 },
    medium: {},                                    // == TERRAIN_DEFAULTS
    hard:   { gapMin: 3, gapMax: 4, ledgeMax: 2, dropMax: 3, segMin: 3, segMax: 5,
              wGap: 0.30, wStepUp: 0.18, wStepDown: 0.12, wPlatform: 0.20,
              wSpikeGround: 0.10, wTunnel: 0.10 },
    // hardlong: 'hard' obstacles, more of them. Per-obstacle success compounds,
    // so 97% per obstacle clears 12 obstacles 69% of the time and 20 of them 54%.
    hardlong: { gapMin: 3, gapMax: 4, ledgeMax: 2, dropMax: 3, segMin: 3, segMax: 5,
                wGap: 0.30, wStepUp: 0.18, wStepDown: 0.12, wPlatform: 0.20,
                wSpikeGround: 0.10, wTunnel: 0.10, gridW: 130, evalSeconds: 18 },
    brutal: { gapMin: 3, gapMax: 5, ledgeMax: 2, dropMax: 3, segMin: 2, segMax: 5,
              wGap: 0.30, wStepUp: 0.18, wStepDown: 0.12, wPlatform: 0.20,
              wSpikeGround: 0.10, wTunnel: 0.10 },
    // gauntlet: hardlong's geometry with the mix shifted toward the two
    // genuinely 2-D features (float platform over a pit; spike ceiling where
    // standing is safe and ANY jump is fatal). The hand summary carries a
    // per-column headroom AND overhead-spike feature precisely so those stay
    // expressible in it — this raises obstacle DENSITY, not obstacle class.
    gauntlet: { gapMin: 3, gapMax: 4, ledgeMax: 2, dropMax: 3, segMin: 3, segMax: 5,
                wGap: 0.24, wStepUp: 0.13, wStepDown: 0.08, wPlatform: 0.28,
                wSpikeGround: 0.05, wTunnel: 0.22, gridW: 130, evalSeconds: 18 },
    crucible: { gapMin: 4, gapMax: 4, ledgeMax: 2, dropMax: 3, segMin: 2, segMax: 3,
                wGap: 0.24, wStepUp: 0.13, wStepDown: 0.08, wPlatform: 0.28,
                wSpikeGround: 0.05, wTunnel: 0.22, gridW: 250, evalSeconds: 35 },
    'crucible-S': { gapMin: 4, gapMax: 4, ledgeMax: 2, dropMax: 3, segMin: 2, segMax: 3,
                    wGap: 0.24, wStepUp: 0.13, wStepDown: 0.08, wPlatform: 0.28,
                    wSpikeGround: 0.05, wTunnel: 0.22, gridW: 190, evalSeconds: 26 },
    'crucible-XL': { gapMin: 4, gapMax: 4, ledgeMax: 2, dropMax: 3, segMin: 2, segMax: 3,
                     wGap: 0.24, wStepUp: 0.13, wStepDown: 0.08, wPlatform: 0.28,
                     wSpikeGround: 0.05, wTunnel: 0.22, gridW: 320, evalSeconds: 45 },
  };
  const TERRAIN_DEFAULT_DIFFICULTY = 'hard';

  // trainer.params key -> terrain param key. Everything a preset/slider can
  // set goes through here (resolved() in instantiateSetup feeds it), so a
  // difficulty knob can never be "set" somewhere that the world never reads.
  const TERRAIN_PARAM_KEYS = {
    terrainGridW: 'gridW', terrainGridH: 'gridH', terrainBaseRow: 'baseRow',
    terrainStartPad: 'startPad',
    terrainGapMin: 'gapMin', terrainGapMax: 'gapMax',
    terrainLedgeMax: 'ledgeMax', terrainDropMax: 'dropMax',
    terrainSegMin: 'segMin', terrainSegMax: 'segMax',
    terrainWGap: 'wGap', terrainWStepUp: 'wStepUp', terrainWStepDown: 'wStepDown',
    terrainWPlatform: 'wPlatform', terrainWSpike: 'wSpikeGround', terrainWTunnel: 'wTunnel',
    terrainGravity: 'gravity', terrainDriveAccel: 'driveAccel',
    terrainAirControl: 'airControl', terrainMaxSpeed: 'maxSpeed',
    terrainGroundDrag: 'groundDrag', terrainJumpVel: 'jumpVel',
    terrainJumpCooldown: 'jumpCooldown',
    terrainEvalSeconds: 'evalSeconds', terrainControlEvery: 'controlEvery',
    terrainGoalBonus: 'goalBonus',
  };

  // Resolve a full terrain param block. `src` may be
  //   · a rung NAME ('hard', 'crucible', ...),
  //   · a trainer.params-shaped object (terrainDifficulty + terrain* keys),
  //   · { terrainParams: <a block this function produced> }  (probes/smoke),
  //   · null  (= the default rung).
  // ONLY the terrain* spelling is honoured off a foreign object. That is
  // load-bearing, not fussiness: trainer.params carries its own `gravity` (the
  // pendulum world's 900) and `maxSpeed`, and honouring bare keys would
  // silently halve the platformer's gravity the moment the trainer built a
  // world. Blocks produced HERE carry _terrain and round-trip verbatim.
  // Observation geometry is always re-forced from TERRAIN_DEFAULTS.
  function terrainGeometry(src) {
    if (typeof src === 'string') src = { terrainDifficulty: src };
    src = src || {};
    if (src.terrainParams && typeof src.terrainParams === 'object') {
      return terrainGeometry(Object.assign({}, src.terrainParams, { _terrain: true }));
    }
    let P;
    if (src._terrain === true) {
      P = Object.assign({}, TERRAIN_DEFAULTS, src);      // verbatim round-trip
    } else {
      const name = TERRAIN_DIFFICULTY[src.terrainDifficulty]
        ? src.terrainDifficulty : TERRAIN_DEFAULT_DIFFICULTY;
      P = Object.assign({}, TERRAIN_DEFAULTS, TERRAIN_DIFFICULTY[name]);
      P.difficulty = name;
    }
    for (const optKey in TERRAIN_PARAM_KEYS) {
      if (src[optKey] != null) P[TERRAIN_PARAM_KEYS[optKey]] = src[optKey];
    }
    for (let i = 0; i < TERRAIN_OBS_KEYS.length; i++) {
      P[TERRAIN_OBS_KEYS[i]] = TERRAIN_DEFAULTS[TERRAIN_OBS_KEYS[i]];
    }
    if (P.difficulty == null) P.difficulty = TERRAIN_DEFAULT_DIFFICULTY;
    P._terrain = true;
    return P;
  }

  // ---- terrain generation (fresh per rollout from the course seed) ----------
  function terrainGenerate(P, rng) {
    const W = P.gridW, H = P.gridH;
    const grid = new Uint8Array(W * H);           // grid[row * W + col]
    const surface = new Int32Array(W);            // topmost SOLID row per column
    for (let c = 0; c < W; c++) surface[c] = -1;  // -1 = void column (pit)

    const fillColumn = (c, row) => {
      if (c < 0 || c >= W) return;
      for (let r = row; r < H; r++) grid[r * W + c] = T_SOLID;
      surface[c] = row;
    };

    let h = P.baseRow;
    let col = 0;
    // Guaranteed flat start pad (gen-0 policies must not die instantly).
    for (let i = 0; i < P.startPad; i++) fillColumn(col++, h);

    const feats = [
      ['gap', P.wGap], ['stepUp', P.wStepUp], ['stepDown', P.wStepDown],
      ['platform', P.wPlatform], ['spike', P.wSpikeGround], ['tunnel', P.wTunnel],
    ];
    let wSum = 0;
    for (const f of feats) wSum += f[1];

    while (col < W) {
      // --- flat run ---
      const runLen = P.segMin + rng.int(Math.max(1, P.segMax - P.segMin + 1));
      for (let i = 0; i < runLen && col < W; i++) fillColumn(col++, h);
      if (col >= W) break;

      // --- feature ---
      let pick = rng.next() * wSum, kind = feats[feats.length - 1][0];
      for (const f of feats) { pick -= f[1]; if (pick <= 0) { kind = f[0]; break; } }

      if (kind === 'gap') {
        const g = P.gapMin + rng.int(Math.max(1, P.gapMax - P.gapMin + 1));
        col += g;                                  // columns stay void
      } else if (kind === 'stepUp') {
        const dh = 1 + rng.int(P.ledgeMax);
        h = Math.max(4, h - dh);
      } else if (kind === 'stepDown') {
        const dh = 1 + rng.int(P.dropMax);
        h = Math.min(P.baseRow + 3, h + dh);
      } else if (kind === 'platform') {
        // A pit crossed by hopping onto a floating ledge. Purely 2-D: the ledge
        // is ABOVE the (absent) ground, so "ground height ahead" reads void and
        // the answer is a tile 2 rows UP. prow = h−2 (40 px) is REACHABLE
        // against the 53.8 px apex; h−3 (60 px) is not and made every platform
        // a guaranteed death — measured, fixed.
        const g = 4 + rng.int(2);      // 4-5 wide (6 made the far side marginal)
        const pw = 2 + rng.int(2);
        const prow = h - 2;
        const ps = col + Math.max(1, Math.floor((g - pw) / 2));
        for (let c = ps; c < ps + pw && c < W; c++) {
          if (prow >= 1) { grid[prow * W + c] = T_SOLID; if (surface[c] < 0) surface[c] = prow; }
        }
        col += g;
      } else if (kind === 'tunnel') {
        // SPIKE CEILING, self-contained. 3 flat lead-in columns at the CURRENT
        // height guarantee that an agent arriving airborne has landed before it
        // reaches the spikes, and 3 lead-out columns guarantee it is grounded
        // again before the next feature. Placed 3 rows above the surface:
        // standing is clear, ANY jump hits it. This is the feature no 1-D
        // ground-height summary can express, and it is what makes "hold right +
        // spam jump" fatal rather than merely slow.
        const lead = 3, tail = 3;
        const cw = 2 + rng.int(2);
        for (let i = 0; i < lead && col < W; i++) fillColumn(col++, h);
        for (let i = 0; i < cw && col < W; i++) {
          fillColumn(col, h);
          if (h - 3 >= 1) grid[(h - 3) * W + col] = T_HAZARD;
          col++;
        }
        for (let i = 0; i < tail && col < W; i++) fillColumn(col++, h);
      } else { // 'spike' — hazard tiles laid ON the ground surface
        const sw = 1 + rng.int(2);
        for (let i = 0; i < sw && col < W; i++) {
          fillColumn(col, h);
          grid[h * W + col] = T_HAZARD;
          col++;
        }
      }
    }
    // Landing pad at the far right so "reach the goal" is always achievable.
    for (let c = W - 4; c < W; c++) if (surface[c] < 0) fillColumn(c, h);
    return { grid, surface, W, H };
  }

  // Tilemap query. Out of bounds: left of the course is SOLID (a back wall),
  // everything else is EMPTY (sky above, void below/right).
  function terrainTileAt(T, row, col) {
    if (col < 0) return T_SOLID;
    if (col >= T.W || row < 0 || row >= T.H) return T_EMPTY;
    return T.grid[row * T.W + col];
  }

  // Topmost non-empty row in `col` that is a plausible LANDING surface — at or
  // below (agentRow − 3), so a platform far overhead is not mistaken for the
  // floor. −1 when the column has no reachable floor (a pit).
  function terrainSurfaceNear(T, col, agentRow) {
    if (col < 0 || col >= T.W) return -1;
    const from = Math.max(0, agentRow - 3);
    for (let r = from; r < T.H; r++) {
      const t = T.grid[r * T.W + col];
      if (t !== T_EMPTY) return r;
    }
    return -1;
  }

  // ---- observation geometry -------------------------------------------------
  // PROPRIO is SHARED VERBATIM by all three encodings, so no encoding can win
  // on a feature another one simply lacks (goal distance lived only in the
  // summary at first — a small but real information asymmetry; it is shared).
  const TERRAIN_PROPRIO = 6;   // vx, vy, grounded, fracX, fracY, goalDist
  function terrainPatchDims(P) {
    P = P || TERRAIN_DEFAULTS;
    return { cols: P.patchBack + 1 + P.patchFwd, rows: P.patchUp + 1 + P.patchDown, channels: 2 };
  }
  function terrainSummaryTail(P) { return (P || TERRAIN_DEFAULTS).summaryK * 5 + 4; }
  function terrainObsCountFor(mode, P) {
    P = P || TERRAIN_DEFAULTS;
    const d = terrainPatchDims(P);
    const patch = d.channels * d.cols * d.rows;
    if (mode === 'summary') return TERRAIN_PROPRIO + terrainSummaryTail(P);
    if (mode === 'both') return TERRAIN_PROPRIO + terrainSummaryTail(P) + patch;
    return TERRAIN_PROPRIO + patch;     // 'patch' (and its alias 'flat')
  }
  const TERRAIN_MODES = ['summary', 'patch', 'both'];
  function terrainNormalizeMode(mode) {
    if (mode === 'flat') return 'patch';        // the probe's architecture control
    return TERRAIN_MODES.indexOf(mode) >= 0 ? mode : null;
  }

  function terrainWriteProprio(tr, out) {
    const P = tr.P, a = tr.agent;
    out[0] = clamp(a.vx / P.maxSpeed, -1.5, 1.5);
    out[1] = clamp(a.vy / P.jumpVel, -2, 2);
    out[2] = a.grounded ? 1 : 0;
    out[3] = (a.x / TERRAIN_TILE) - Math.floor(a.x / TERRAIN_TILE);   // sub-tile phase x
    out[4] = (a.y / TERRAIN_TILE) - Math.floor(a.y / TERRAIN_TILE);   // sub-tile phase y
    out[5] = clamp((tr.goalX - a.x) / (tr.terrain.W * TERRAIN_TILE), 0, 1.5);
  }

  // 'patch': agent-centred 2-channel occupancy grid. Channel 0 = solid,
  // channel 1 = hazard, laid out channel-major then row-major (ch, row, col)
  // so a conv policy can stride it directly.
  function terrainFillPatch(tr, out) {
    const P = tr.P, T = tr.terrain, a = tr.agent;
    const d = terrainPatchDims(P);
    terrainWriteProprio(tr, out);
    const ac = Math.floor(a.x / TERRAIN_TILE), ar = Math.floor(a.y / TERRAIN_TILE);
    const base = TERRAIN_PROPRIO;
    const plane = d.cols * d.rows;
    for (let ry = 0; ry < d.rows; ry++) {
      const row = ar - P.patchUp + ry;
      for (let cx = 0; cx < d.cols; cx++) {
        const col = ac - P.patchBack + cx;
        const t = terrainTileAt(T, row, col);
        const i = ry * d.cols + cx;
        out[base + i] = (t === T_SOLID) ? 1 : 0;
        out[base + plane + i] = (t === T_HAZARD) ? 1 : 0;
      }
    }
    return out;
  }

  // 'summary': the honest hand-designed low-D encoding, written to be as strong
  // as it can be. Per lookahead column k = 0..K−1 (k tiles ahead of the agent):
  //   [0] relative surface height (agent row − surface row), clamped
  //   [1] void flag (no reachable floor in that column at all)
  //   [2] headroom above that surface, capped
  //   [3] hazard ON the surface
  //   [4] hazard OVERHEAD within the jump arc
  // plus next-gap distance & width and next-wall distance & height.
  // The probe verified a scripted oracle reading ONLY these 50 numbers is
  // bit-identical to a full-world-state oracle on 128/128 courses, so the
  // summary is KNOWN-SUFFICIENT: it must not be quietly weakened.
  function terrainFillSummary(tr, out) {
    const P = tr.P, T = tr.terrain, a = tr.agent;
    const K = P.summaryK;
    terrainWriteProprio(tr, out);
    const ac = Math.floor(a.x / TERRAIN_TILE), ar = Math.floor(a.y / TERRAIN_TILE);
    let p = TERRAIN_PROPRIO;
    let nextGapDist = -1, nextGapWidth = 0, nextWallDist = -1, nextWallHeight = 0;
    const agentSurface = terrainSurfaceNear(T, ac, ar);

    for (let k = 0; k < K; k++) {
      const col = ac + k;
      const s = terrainSurfaceNear(T, col, ar);
      if (s < 0) {
        out[p++] = 0;                     // height meaningless
        out[p++] = 1;                     // void
        out[p++] = 1;                     // headroom: open sky
        out[p++] = 0;
        if (nextGapDist < 0) {
          nextGapDist = k;
          let w = 0;
          while (terrainSurfaceNear(T, ac + k + w, ar) < 0 && w < 12) w++;
          nextGapWidth = w;
        }
      } else {
        // SCALE FAIRNESS: the patch encoding is 0/1, so a summary feature whose
        // realised range is ±0.2 would be handicapped purely by input scale (a
        // known failure mode in this project). ar − s spans about [−4, +1] over
        // the whole ladder, so /2.5 puts it on the order of the occupancy bits.
        out[p++] = clamp((ar - s) / 2.5, -2, 2);
        out[p++] = 0;
        let hr = 0;
        while (hr < P.headroomCap && terrainTileAt(T, s - 1 - hr, col) === T_EMPTY) hr++;
        out[p++] = hr / P.headroomCap;
        out[p++] = (terrainTileAt(T, s, col) === T_HAZARD) ? 1 : 0;
        if (nextWallDist < 0 && agentSurface >= 0 && (agentSurface - s) >= 1) {
          nextWallDist = k; nextWallHeight = (agentSurface - s) / 2;
        }
      }
      // hazard anywhere in the jump arc above the agent's row for this column
      let ov = 0;
      for (let r = ar - 4; r <= ar; r++) if (terrainTileAt(T, r, col) === T_HAZARD) { ov = 1; break; }
      out[p++] = ov;
    }
    out[p++] = nextGapDist < 0 ? 1 : nextGapDist / K;
    out[p++] = clamp(nextGapWidth / 6, 0, 1.5);
    out[p++] = nextWallDist < 0 ? 1 : nextWallDist / K;
    out[p++] = clamp(nextWallHeight, 0, 1.5);
    return out;
  }

  // 'both' = summary ⧺ patch, laid out [ proprio | summary tail | ch0 | ch1 ] so
  // the grid stays contiguous at a fixed offset and a conv policy can read it
  // with proprio := PROPRIO + summaryTail (the whole hand summary becomes the
  // net's GLOBAL CONTEXT vector). Deliberately implemented by CALLING the other
  // two fillers into scratch buffers and copying rather than by re-deriving
  // anything, so "both contains exactly the summary bytes and exactly the patch
  // bytes" is structural, not a claim. Guarded bytewise in smoke-test.js.
  // MEASURED: 'both' wins by +41.6 (t = 10.63, 24/24 seeds) on the CRUCIBLE
  // geometry only; it is neutral-to-negative on hard and gauntlet.
  function terrainFillBoth(tr, out) {
    const P = tr.P;
    const d = terrainPatchDims(P);
    const nSum = TERRAIN_PROPRIO + terrainSummaryTail(P);
    const nPatch = TERRAIN_PROPRIO + d.channels * d.cols * d.rows;
    if (!tr._sumBuf) tr._sumBuf = new Float64Array(nSum);
    if (!tr._patchBuf) tr._patchBuf = new Float64Array(nPatch);
    const sb = tr._sumBuf, pb = tr._patchBuf;
    terrainFillSummary(tr, sb);
    terrainFillPatch(tr, pb);
    for (let i = 0; i < nSum; i++) out[i] = sb[i];                            // proprio + summary tail
    for (let i = TERRAIN_PROPRIO; i < nPatch; i++) out[nSum + i - TERRAIN_PROPRIO] = pb[i];  // ch0, ch1
    return out;
  }

  // ---- physics: semi-implicit Euler + swept-free AABB-vs-tilemap ------------
  // Per-step motion is < 1 tile at every legal speed, so single-cell resolution
  // is exact. Reads tr.cmd (the HELD control, latched at the control rate).
  function terrainStepPhysics(tr, dt) {
    const P = tr.P, T = tr.terrain, a = tr.agent;
    const hw = P.agentHalfW, hh = P.agentHalfH;
    const drive = clamp(tr.cmd[0] || 0, -1, 1);
    const jumpCmd = tr.cmd[1] || 0;

    // --- jump (grounded only, with a small cooldown) ---
    a.jumpTimer -= dt;
    if (jumpCmd > 0 && a.grounded && a.jumpTimer <= 0) {
      a.vy = -P.jumpVel;
      a.grounded = false;
      a.jumpTimer = P.jumpCooldown;
      tr.jumps++;
    }

    // --- horizontal drive; air control is heavily reduced ---
    const acc = P.driveAccel * (a.grounded ? 1 : P.airControl);
    a.vx += acc * drive * dt;
    if (a.grounded && Math.abs(drive) < 0.05) a.vx -= a.vx * Math.min(1, P.groundDrag * dt);
    if (a.vx > P.maxSpeed) a.vx = P.maxSpeed;
    if (a.vx < -P.maxSpeed) a.vx = -P.maxSpeed;

    // --- gravity ---
    a.vy += P.gravity * dt;
    if (a.vy > 900) a.vy = 900;

    const EPS = 1e-4;
    // ---- X sweep ----
    a.x += a.vx * dt;
    {
      const r0 = Math.floor((a.y - hh) / TERRAIN_TILE);
      const r1 = Math.floor((a.y + hh - EPS) / TERRAIN_TILE);
      if (a.vx > 0) {
        const c = Math.floor((a.x + hw - EPS) / TERRAIN_TILE);
        for (let r = r0; r <= r1; r++) {
          const t = terrainTileAt(T, r, c);
          if (t === T_HAZARD) { tr.dead = true; tr.deathCause = 'hazard'; }
          if (t !== T_EMPTY) { a.x = c * TERRAIN_TILE - hw - EPS; a.vx = 0; break; }
        }
      } else if (a.vx < 0) {
        const c = Math.floor((a.x - hw) / TERRAIN_TILE);
        for (let r = r0; r <= r1; r++) {
          const t = terrainTileAt(T, r, c);
          if (t === T_HAZARD) { tr.dead = true; tr.deathCause = 'hazard'; }
          if (t !== T_EMPTY) { a.x = (c + 1) * TERRAIN_TILE + hw + EPS; a.vx = 0; break; }
        }
      }
    }
    // ---- Y sweep ----
    a.y += a.vy * dt;
    a.grounded = false;
    {
      const c0 = Math.floor((a.x - hw) / TERRAIN_TILE);
      const c1 = Math.floor((a.x + hw - EPS) / TERRAIN_TILE);
      if (a.vy > 0) {
        const r = Math.floor((a.y + hh - EPS) / TERRAIN_TILE);
        for (let c = c0; c <= c1; c++) {
          const t = terrainTileAt(T, r, c);
          if (t === T_HAZARD) { tr.dead = true; tr.deathCause = 'hazard'; }
          if (t !== T_EMPTY) { a.y = r * TERRAIN_TILE - hh - EPS; a.vy = 0; a.grounded = true; break; }
        }
      } else if (a.vy < 0) {
        const r = Math.floor((a.y - hh) / TERRAIN_TILE);
        for (let c = c0; c <= c1; c++) {
          const t = terrainTileAt(T, r, c);
          if (t === T_HAZARD) { tr.dead = true; tr.deathCause = 'hazard'; }
          if (t !== T_EMPTY) { a.y = (r + 1) * TERRAIN_TILE + hh + EPS; a.vy = 0; break; }
        }
      }
    }
    // ---- overlap hazard check (catches the standing-in-spikes case) ----
    if (!tr.dead) {
      const c0 = Math.floor((a.x - hw) / TERRAIN_TILE), c1 = Math.floor((a.x + hw - EPS) / TERRAIN_TILE);
      const r0 = Math.floor((a.y - hh) / TERRAIN_TILE), r1 = Math.floor((a.y + hh - EPS) / TERRAIN_TILE);
      for (let r = r0; r <= r1 && !tr.dead; r++) {
        for (let c = c0; c <= c1; c++) {
          if (terrainTileAt(T, r, c) === T_HAZARD) { tr.dead = true; tr.deathCause = 'hazard'; break; }
        }
      }
    }
    // ---- fall out of the world ----
    if (a.y - hh > T.H * TERRAIN_TILE + 20) { tr.dead = true; tr.deathCause = 'fell'; }
    // ---- left wall ----
    if (a.x < hw) { a.x = hw; if (a.vx < 0) a.vx = 0; }

    // ---- progress potential (the dense reward) ----
    const prev = tr.maxX;
    if (a.x > tr.maxX) tr.maxX = a.x;
    tr.progressDelta = (tr.maxX - prev) / TERRAIN_TILE;
    if (!tr.reachedGoal && a.x >= tr.goalX) { tr.reachedGoal = true; tr.goalJustReached = true; }
    tr.time += dt;
    tr.steps++;
  }

  function makeTerrainRun() {
    return {
      id: 'terrain-run',
      label: 'Terrain run (randomised platformer traversal)',
      relevantObjectiveIds: ['terrain_progress'],

      // ---- observation modes ----------------------------------------------
      // 'summary' 50  = 6 proprio + 8 lookahead columns × 5 + 4 gap/wall scalars
      // 'patch'  198  = 6 proprio + 2 channels × 8 rows × 12 cols occupancy
      // 'both'   242  = summary ⧺ patch
      // The resolver RE-RESOLVES observationCount (the silent-no-op trap: a
      // wrong call would leave the previous mode in place and two "different"
      // encodings would train identically). It returns the new count so a
      // caller can assert on it.
      observationMode: 'summary',
      observationCount: terrainObsCountFor('summary', TERRAIN_DEFAULTS),
      setObservationMode(mode) {
        const m = terrainNormalizeMode(mode) || 'summary';
        this.observationMode = m;
        this.observationCount = terrainObsCountFor(m, TERRAIN_DEFAULTS);
        return this.observationCount;
      },
      // Labels/abbrevs are derived from the SAME geometry the fillers read
      // (TERRAIN_DEFAULTS patch dims + summaryK), so they cannot drift out of
      // step with the vector they name. Every slot is named — no "input N".
      get observationLabels() {
        const P = TERRAIN_DEFAULTS;
        const L = ['vx (norm)', 'vy (norm)', 'grounded', 'sub-tile x', 'sub-tile y', 'goal dist'];
        const M = this.observationMode;
        if (M === 'summary' || M === 'both') {
          for (let k = 0; k < P.summaryK; k++) {
            L.push('+' + k + ' surface Δrow', '+' + k + ' void', '+' + k + ' headroom',
                   '+' + k + ' surface spike', '+' + k + ' overhead spike');
          }
          L.push('next-gap dist', 'next-gap width', 'next-wall dist', 'next-wall height');
        }
        if (M !== 'summary') {
          const d = terrainPatchDims(P);
          for (let ch = 0; ch < d.channels; ch++) {
            for (let r = 0; r < d.rows; r++) {
              for (let c = 0; c < d.cols; c++) {
                L.push((ch ? 'hazard' : 'solid') + ' (' + (c - P.patchBack) + ',' + (r - P.patchUp) + ')');
              }
            }
          }
        }
        return L;
      },
      get observationAbbr() {
        const P = TERRAIN_DEFAULTS;
        const A = ['vx', 'vy', 'gnd', 'fx', 'fy', 'gd'];
        const M = this.observationMode;
        if (M === 'summary' || M === 'both') {
          for (let k = 0; k < P.summaryK; k++) {
            A.push('h' + k, 'v' + k, 'r' + k, 'x' + k, 'o' + k);
          }
          A.push('gpd', 'gpw', 'wld', 'wlh');
        }
        if (M !== 'summary') {
          const d = terrainPatchDims(P);
          for (let ch = 0; ch < d.channels; ch++) {
            for (let r = 0; r < d.rows; r++) {
              for (let c = 0; c < d.cols; c++) {
                A.push((ch ? 'H' : 'S') + (c - P.patchBack) + ',' + (r - P.patchUp));
              }
            }
          }
        }
        return A;
      },

      actionCount: 2,
      actionLabels: ['drive x (±1)', 'jump (>0 fires)'],
      actionAbbr: ['dx', 'jp'],

      // The episode ends the moment the agent dies OR touches the far edge —
      // no tail extension, so a finished course cannot keep earning.
      shouldKeepGoing(state) {
        const tr = state.terrainRun;
        return !!tr && !tr.dead && !tr.reachedGoal;
      },
      isAlive(state) { return !(state.terrainRun && state.terrainRun.dead); },

      buildWorld(opts) {
        opts = opts || {};
        const TP = terrainGeometry(opts);
        // Course seed: prefer the per-rollout terrainSeed (so the policy must
        // learn to traverse GENERALLY instead of memorising one course), fall
        // back to the run seed for the live display.
        const seed = ((opts.terrainSeed != null ? opts.terrainSeed : opts.seed) >>> 0) || 1;
        const rng = BF.util.makeRng(seed);
        const terrain = terrainGenerate(TP, rng);
        const startCol = Math.max(1, Math.floor(TP.startPad / 2));
        const startRow = terrain.surface[startCol];
        const startX = (startCol + 0.5) * TERRAIN_TILE;
        const mode = terrainNormalizeMode(opts.terrainObservationMode) || this.observationMode || 'summary';

        // One gravity-free mirror node so the shared kinematics / renderer /
        // trail keep working. It is NEVER the source of truth — see the note
        // at the top of this section.
        const world = P.makeWorld(opts);
        world.cartWallsEnabled = false;        // let the camera follow the agent
        const agentIdx = P.addNode(world, startX, 0, {
          mass: 1, radius: TP.agentHalfW, label: 'runner',
        });
        world.nodes[agentIdx].gravityScale = 0;

        const tr = {
          P: TP,
          terrain: terrain,
          terrainSeed: seed,
          agent: {
            x: startX,
            y: startRow * TERRAIN_TILE - TP.agentHalfH - 0.001,
            vx: 0, vy: 0,
            grounded: true,
            jumpTimer: 0,
          },
          startX: startX,
          goalX: (terrain.W - 1.5) * TERRAIN_TILE,
          maxX: startX,
          progressDelta: 0,      // tiles gained THIS step (the dense reward)
          reachedGoal: false,
          goalJustReached: false,
          dead: false,
          deathCause: null,
          time: 0,
          steps: 0,
          jumps: 0,
          // Held control. The policy's outputs are latched every
          // P.controlEvery physics STEPS, so the decision rate is
          // 1/(controlEvery·dt) = 30 Hz at the 1/60 s step the geometry was
          // measured at. It follows physicsDt — pinning the rate is the
          // preset's job (physicsDt 1/60), not something this latch can do on
          // its own; see the controlEvery note in TERRAIN_DEFAULTS.
          cmd: [0, 0],
          observationMode: mode,
          obsCount: terrainObsCountFor(mode, TP),
          // Render offset only: the sim works in [0, gridH·TILE] with +y down;
          // the mirror node is centred vertically so the existing camera frames
          // the course without any renderer-side special casing.
          viewOffsetY: (TP.gridH * TERRAIN_TILE) / 2,
          _sumBuf: null, _patchBuf: null,
        };
        const state = {
          world: world,
          cartIdx: agentIdx,
          tipIdx: agentIdx,
          agentIdx: agentIdx,
          segments: [],
          // A window of ~24 × 16 tiles around the runner.
          worldExtent: { halfW: 240, halfH: 160 },
          terrainRun: tr,
          observationMode: mode,
          lastCmds: [0, 0],
          _obs: new Float64Array(tr.obsCount),
        };
        terrainSyncMirror(state, 1 / 60);
        return state;
      },

      // Fills and returns the PREALLOCATED state._obs. Sized from the STATE's
      // own mode (not the setup instance's), so a stale singleton can never
      // truncate the vector the world actually produces.
      buildObservation(state) {
        const tr = state.terrainRun;
        const out = state._obs;
        if (tr.observationMode === 'summary') return terrainFillSummary(tr, out);
        if (tr.observationMode === 'both') return terrainFillBoth(tr, out);
        return terrainFillPatch(tr, out);
      },

      tick(state, dt) {
        const tr = state.terrainRun;
        tr.goalJustReached = false;
        tr.progressDelta = 0;
        // Frozen once the course is finished (dead or goal): the episode is
        // over, so no further progress may be earned even if the trainer keeps
        // stepping to the end of its timer.
        if (tr.dead || tr.reachedGoal) { terrainSyncMirror(state, dt); return; }
        const every = Math.max(1, tr.P.controlEvery | 0);
        if (tr.steps % every === 0) {
          const c = state.lastCmds || [0, 0];
          tr.cmd[0] = c[0] || 0;
          tr.cmd[1] = c[1] || 0;
        }
        terrainStepPhysics(tr, dt);
        terrainSyncMirror(state, dt);
      },

      // ---- introspection for probes / smoke guards / task-2 wiring ---------
      TILE: TERRAIN_TILE,
      PROPRIO: TERRAIN_PROPRIO,
      T_EMPTY: T_EMPTY, T_SOLID: T_SOLID, T_HAZARD: T_HAZARD,
      DEFAULTS: TERRAIN_DEFAULTS,
      DIFFICULTY: TERRAIN_DIFFICULTY,
      observationModes: TERRAIN_MODES.slice(),
      paramKeys: TERRAIN_PARAM_KEYS,
      geometryFor: terrainGeometry,
      obsCountFor: terrainObsCountFor,
      patchDims: terrainPatchDims,
      summaryTailCount: terrainSummaryTail,
      tileAt: terrainTileAt,
      surfaceNear: terrainSurfaceNear,
    };
  }

  // Mirror the authoritative agent onto the render node. px/py are set from the
  // velocity so P.step's Verlet drift + deriveVelocities reproduce the real
  // velocity for the renderer's arrow and kinematics' tipSpeedSq; whatever
  // drift P.step then applies is overwritten here on the next tick, before
  // anything reads the node.
  function terrainSyncMirror(state, dt) {
    const tr = state.terrainRun;
    const n = state.world.nodes[state.agentIdx];
    const a = tr.agent;
    if (!(dt > 0)) dt = 1 / 60;
    n.x = a.x;
    n.y = a.y - tr.viewOffsetY;
    n.vx = a.vx;
    n.vy = a.vy;
    n.px = n.x - a.vx * dt;
    n.py = n.y - a.vy * dt;
  }

  const registry = [
    makeSinglePendulum(),
    makeDoublePendulum(),
    makeSpringPendulum(),
    makeTriplePendulum(),
    makeChainReach(),
    makeChainTrace(),
    makeEpicycle(),
    makeBallSingle(),
    makeSpringFlail(),
    makeTwinPendulum(),
    makePutt(),
    makeGolf(),
    makeGolfChallenge(),
    makeDodge(),
    makeRailCatcher(),
    makeCatchDrop(),
    makePickSide(),
    makeFleeTheDot(),
    makeCruiseControl(),
    makeAcceleratingTrack(),
    makeSafeZone(),
    makeMidpointMeet(),
    makeTagSequence(),
    makePrioritizeNearest(),
    makeArmReach(),
    makeArmTrack(),
    makeArmObstacle(),
    makeArmDodge(),
    makeArmSlot(),
    makePlateSpin(),
    makeTerrainRun(),
  ];

  // Display grouping for the setup dropdown — app.js builds <optgroup>s from
  // this (grouped in registry order of first appearance). Every registered
  // setup must have an entry; smoke guards that none falls through to 'Other'.
  const SETUP_CATEGORY = {
    'single': 'Pendulums & springs', 'double': 'Pendulums & springs',
    'spring': 'Pendulums & springs', 'triple': 'Pendulums & springs',
    'spring-flail': 'Pendulums & springs', 'twin': 'Pendulums & springs',
    'ball-single': 'Balls & golf', 'golf': 'Balls & golf', 'putt': 'Balls & golf', 'golf-challenge':'Balls & golf',
    'chain-reach': 'Chains', 'chain-trace': 'Chains', 'epicycle': 'Chains',
    'dodge': 'Dodge',
    'rail-catcher': 'Fast demos — cart', 'catch-drop': 'Fast demos — cart',
    'pick-side': 'Fast demos — cart', 'flee-the-dot': 'Fast demos — cart',
    'cruise-control': 'Fast demos — cart', 'accelerating-track': 'Fast demos — cart',
    'safe-zone': 'Fast demos — cart', 'midpoint-meet': 'Fast demos — cart',
    'tag-sequence': 'Fast demos — cart', 'prioritize-nearest': 'Fast demos — cart',
    'plate-spin': 'Fast demos — cart',
    'arm-reach': 'Fast demos — arm', 'arm-track': 'Fast demos — arm',
    'arm-obstacle': 'Fast demos — arm', 'arm-dodge': 'Fast demos — arm',
    'arm-slot': 'Fast demos — arm',
    'terrain-run': 'Terrain',
  };
  function listSetups() {
    return registry.map(s => ({ id: s.id, label: s.label, category: SETUP_CATEGORY[s.id] || 'Other' }));
  }
  function getSetup(id) { return registry.find(s => s.id === id) || registry[0]; }

  BF.setups = {
    listSetups, getSetup, kinematics, getTargetAt,
    // Terrain-run geometry resolver. Exposed on the namespace because the
    // terrain_progress objective's expectedMaxFor has to size its ceiling from
    // the COURSE (gridW/startPad/goalBonus) and objectives.js must not carry a
    // second copy of the ladder that could drift from this one.
    terrainGeometry, TERRAIN_TILE,
  };
})(window.BF);
