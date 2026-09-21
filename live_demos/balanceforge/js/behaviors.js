// BalanceForge -- per-setup behavior descriptors.
//
// A descriptor is a scalar function of one rollout's trajectory that
// answers "what did this policy do?" -- e.g. "max ball x reached",
// "first-strike time", "mean cart x". Two descriptors picked as
// (X, Y) axes give a 2D behavior space the user can use to see
// which regions of behavior the search has explored vs which are
// undersampled. This is the data the behavior-space heatmap reads.
//
// Keep descriptors cheap -- onStep runs every physics tick. Anything
// that needs an O(N) sweep over node positions or a setup-specific
// dependency that isn't on `state` already should be reconsidered.

(function (BF) {
  'use strict';

  // setupId -> descriptor[]
  const registry = {};

  // Each descriptor:
  //   key:   unique within a setup (used in archive bin keys + UI dropdowns)
  //   label: shown in axis-pick dropdowns
  //   range: [lo, hi] for normalization to [0, 1] when binning. Pick
  //          ranges that bracket realistic-but-not-pathological values
  //          for the setup's physics; values outside clamp to the edge.
  //   makeAccumulator(): initial accumulator state
  //   onStep(acc, state, kin, dt): mutate acc each physics tick
  //   finalize(acc): -> scalar value for this rollout
  function register(setupId, descriptors) {
    if (!registry[setupId]) registry[setupId] = [];
    for (const d of descriptors) registry[setupId].push(d);
  }
  function getDescriptors(setupId) {
    return registry[setupId] || [];
  }
  function findDescriptor(setupId, key) {
    const list = registry[setupId] || [];
    for (const d of list) if (d.key === key) return d;
    return null;
  }

  function makeAccumulators(setupId) {
    const list = registry[setupId] || [];
    const accs = {};
    for (const d of list) {
      accs[d.key] = d.makeAccumulator ? d.makeAccumulator() : { value: 0 };
    }
    return accs;
  }
  function step(accs, setupId, state, kin, dt) {
    const list = registry[setupId] || [];
    for (const d of list) {
      const acc = accs[d.key];
      if (acc && d.onStep) d.onStep(acc, state, kin, dt);
    }
  }
  function finalize(accs, setupId) {
    const list = registry[setupId] || [];
    const out = {};
    for (const d of list) {
      const acc = accs[d.key];
      out[d.key] = d.finalize ? d.finalize(acc) : (acc ? acc.value : 0);
    }
    return out;
  }
  function normalize(setupId, key, val) {
    const d = findDescriptor(setupId, key);
    if (!d) return 0;
    const lo = d.range[0], hi = d.range[1];
    if (hi <= lo) return 0;
    const t = (val - lo) / (hi - lo);
    return Math.max(0, Math.min(0.9999, t));
  }
  function denormalize(setupId, key, t) {
    const d = findDescriptor(setupId, key);
    if (!d) return 0;
    const lo = d.range[0], hi = d.range[1];
    return lo + (hi - lo) * t;
  }

  // ---------- Shared accumulator helpers ----------
  // Keep these tiny; descriptors compose them via closures.
  function meanAcc() { return { sum: 0, n: 0 }; }
  function meanStep(acc, v) { acc.sum += v; acc.n += 1; }
  function meanFinal(acc) { return acc.n > 0 ? acc.sum / acc.n : 0; }

  function maxAcc(initial) { return { value: (initial != null ? initial : -Infinity) }; }
  function maxStep(acc, v) { if (v > acc.value) acc.value = v; }
  function maxFinal(acc, fallback) { return isFinite(acc.value) ? acc.value : (fallback != null ? fallback : 0); }

  function minAcc(initial) { return { value: (initial != null ? initial : Infinity) }; }
  function minStep(acc, v) { if (v < acc.value) acc.value = v; }
  function minFinal(acc, fallback) { return isFinite(acc.value) ? acc.value : (fallback != null ? fallback : 0); }

  // ---------- Common descriptors used across setups ----------
  // Stamped onto pendulum-family setups (single/double/triple/spring) and
  // ball-family setups (ball-single/golf/putt). The accumulator stores enough
  // state so finalize() can compute the desired summary.
  const commonPendulum = [
    {
      key: 'mean_cart_x', label: 'Mean cart x',
      range: [-360, 360],
      makeAccumulator: meanAcc,
      onStep(acc, state, kin) { meanStep(acc, kin.cartX || 0); },
      finalize: meanFinal,
    },
    {
      key: 'cart_displacement', label: 'Max |cart x|',
      range: [0, 360],
      makeAccumulator: () => maxAcc(0),
      onStep(acc, state, kin) { maxStep(acc, Math.abs(kin.cartX || 0)); },
      finalize: a => maxFinal(a, 0),
    },
    {
      key: 'mean_tip_height', label: 'Mean tip cos(theta)',
      range: [-1, 1],
      makeAccumulator: meanAcc,
      onStep(acc, state, kin) { meanStep(acc, kin.chainHeight || 0); },
      finalize: meanFinal,
    },
    {
      key: 'up_time_frac', label: 'Up-time fraction',
      range: [0, 1],
      makeAccumulator: () => ({ up: 0, total: 0 }),
      onStep(acc, state, kin, dt) {
        acc.total += dt;
        if ((kin.chainHeight || 0) > 0.86) acc.up += dt;
      },
      finalize: acc => (acc.total > 0 ? acc.up / acc.total : 0),
    },
    {
      key: 'mean_ctrl_abs', label: 'Mean |ctrl|',
      range: [0, 1],
      makeAccumulator: meanAcc,
      // Twitchy controllers will have higher mean |ctrl|. Reads the
      // last-applied command we stamp onto state.lastCmd in evaluatePolicy.
      onStep(acc, state) { meanStep(acc, Math.abs(state.lastCmd || 0)); },
      finalize: meanFinal,
    },
  ];

  // Ball-aware descriptors. Used for ball-single + golf + putt; the
  // bob-to-ball distance reads the bob (tip) node and the ball state.
  const commonBall = [
    {
      key: 'first_strike_time', label: 'First-strike time (s)',
      range: [0, 8],
      // -1 sentinel = never struck. Finalize returns evalSeconds in that
      // case so it bins toward the "no strike" extreme without breaking
      // normalization.
      makeAccumulator: () => ({ t: -1, simT: 0, prevHits: 0 }),
      onStep(acc, state, kin, dt) {
        acc.simT += dt;
        const ball = state.ball;
        if (!ball) return;
        const hits = ball.hits || 0;
        if (acc.t < 0 && hits > acc.prevHits) acc.t = acc.simT;
        acc.prevHits = hits;
      },
      finalize: acc => acc.t < 0 ? 8 : acc.t,
    },
    {
      key: 'peak_ball_speed', label: 'Peak ball speed',
      range: [0, 800],
      makeAccumulator: () => maxAcc(0),
      onStep(acc, state) {
        const ball = state.ball;
        if (!ball || !ball.spawned) return;
        const v = Math.hypot(ball.vx || 0, ball.vy || 0);
        maxStep(acc, v);
      },
      finalize: a => maxFinal(a, 0),
    },
    {
      key: 'ball_max_x', label: 'Ball max x',
      range: [-450, 450],
      makeAccumulator: () => ({ value: -450, anySeen: false }),
      onStep(acc, state) {
        const ball = state.ball;
        if (!ball || !ball.spawned) return;
        if (!acc.anySeen || ball.x > acc.value) {
          acc.value = ball.x;
          acc.anySeen = true;
        }
      },
      finalize: acc => acc.anySeen ? acc.value : -450,
    },
    {
      key: 'bob_to_ball_min_dist', label: 'Closest bob-to-ball',
      range: [0, 200],
      makeAccumulator: () => minAcc(200),
      onStep(acc, state) {
        const ball = state.ball;
        if (!ball || !ball.spawned) return;
        const tip = state.world.nodes[state.tipIdx];
        if (!tip) return;
        const d = Math.hypot(tip.x - ball.x, tip.y - ball.y);
        minStep(acc, d);
      },
      finalize: a => minFinal(a, 200),
    },
  ];

  // Per-setup specifics.
  // golf/putt also expose hole-distance descriptors that reference the
  // setup's hole region. Both have state.holeRegion = { minX, maxX, y }.
  const golfSpecific = [
    {
      key: 'min_hole_dist', label: 'Min ball-to-hole distance',
      range: [0, 800],
      makeAccumulator: () => minAcc(800),
      onStep(acc, state) {
        const ball = state.ball;
        if (!ball || !ball.spawned) return;
        const h = state.holeRegion;
        if (!h) return;
        const cx = (h.minX + h.maxX) / 2;
        const cy = h.y;
        const d = Math.hypot(ball.x - cx, ball.y - cy);
        minStep(acc, d);
      },
      finalize: a => minFinal(a, 800),
    },
    {
      key: 'sunk', label: 'Ball sunk (1 / 0)',
      range: [0, 1],
      makeAccumulator: () => ({ value: 0 }),
      onStep(acc, state) {
        if (state.ball && state.ball.sunk) acc.value = 1;
      },
      finalize: acc => acc.value,
    },
  ];

  // ---- Wire registrations ----
  // The setup ids must match BF.setups.listSetups() entries. We register
  // here rather than inside setups.js so descriptor logic stays in one
  // place; if a setup id is missing here, getDescriptors returns [] and
  // the UI gracefully falls back to "no descriptors available".
  register('single',      commonPendulum);
  register('double',      commonPendulum);
  register('triple',      commonPendulum);
  register('spring',      commonPendulum);
  register('spring-flail',commonPendulum);
  register('twin',        commonPendulum);
  register('ball-single', [...commonPendulum, ...commonBall]);
  register('golf',        [...commonPendulum, ...commonBall, ...golfSpecific]);
  register('putt',        [...commonPendulum, ...commonBall, ...golfSpecific]);
  register('cart-ball',   [...commonPendulum, ...commonBall]);
  // Dodge-mode descriptors: alive-time, near-miss count, and motion
  // spread on each axis. The pendulum-family descriptors don't apply
  // because there's no bob / cart-rail; we register a dedicated set.
  register('dodge', [
    {
      key: 'alive_time', label: 'Alive time (s)',
      range: [0, 12],
      makeAccumulator: () => ({ value: 0 }),
      onStep(acc, state) {
        if (state.dodge && !state.dodge.dead) acc.value = state.dodge.aliveTime;
      },
      finalize: a => a.value,
    },
    {
      key: 'near_miss_count', label: 'Near-miss count',
      range: [0, 40],
      makeAccumulator: () => ({ value: 0 }),
      onStep(acc, state) {
        if (state.dodge) acc.value = state.dodge.nearMisses;
      },
      finalize: a => a.value,
    },
    {
      key: 'agent_mean_x', label: 'Mean agent x',
      range: [-360, 360],
      makeAccumulator: meanAcc,
      onStep(acc, state) {
        const a = state.world && state.agentIdx != null && state.world.nodes[state.agentIdx];
        if (a) meanStep(acc, a.x);
      },
      finalize: meanFinal,
    },
    {
      key: 'agent_mean_y', label: 'Mean agent y',
      range: [-220, 220],
      makeAccumulator: meanAcc,
      onStep(acc, state) {
        const a = state.world && state.agentIdx != null && state.world.nodes[state.agentIdx];
        if (a) meanStep(acc, a.y);
      },
      finalize: meanFinal,
    },
    {
      key: 'agent_mean_speed', label: 'Mean agent speed',
      range: [0, 600],
      makeAccumulator: meanAcc,
      onStep(acc, state) {
        const a = state.world && state.agentIdx != null && state.world.nodes[state.agentIdx];
        if (a) meanStep(acc, Math.hypot(a.vx || 0, a.vy || 0));
      },
      finalize: meanFinal,
    },
  ]);

  // Default axis pair per setup. The UI consults this when the user hasn't
  // picked axes yet (and falls back to the first two descriptors otherwise).
  const defaults = {
    'single':      ['mean_cart_x', 'mean_tip_height'],
    'double':      ['mean_cart_x', 'mean_tip_height'],
    'triple':      ['mean_cart_x', 'mean_tip_height'],
    'spring':      ['mean_cart_x', 'mean_tip_height'],
    'spring-flail':['mean_cart_x', 'mean_tip_height'],
    'twin':        ['mean_cart_x', 'mean_tip_height'],
    'ball-single': ['ball_max_x', 'peak_ball_speed'],
    'golf':        ['ball_max_x', 'min_hole_dist'],
    'putt':        ['ball_max_x', 'min_hole_dist'],
    'cart-ball':   ['ball_max_x', 'peak_ball_speed'],
    'dodge':       ['alive_time', 'near_miss_count'],
  };
  function defaultAxes(setupId) {
    return defaults[setupId] || null;
  }

  BF.behaviors = {
    register, getDescriptors, findDescriptor,
    makeAccumulators, step, finalize, normalize, denormalize,
    defaultAxes,
  };
})(window.BF);
