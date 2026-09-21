// BalanceForge — randomized disturbances (push controller).
//
// Same logic shared between training rollouts and the display loop, so the
// user can both train against pushes and *see* the same kind of pushes
// happening live. Each "push" is parameterized by target, peak strength,
// total duration, and a smoothing window (trapezoidal envelope: ramp up →
// hold → ramp down). Duration=0 collapses to the original behavior of an
// instant impulse, matching what we had before.

(function (BF) {
  'use strict';

  // Build a fresh push controller. One per rollout (training) or per display
  // sim instance. Holds the schedule timer + the currently-active push.
  function make(params, rng) {
    return {
      timer: rng.range(params.pushIntervalMin || 1.0, params.pushIntervalMax || 3.0),
      active: null,
    };
  }

  // Pick which node to push, given the user's target preference and the scene.
  // 'tip', 'cart', 'mid-joint' (any non-tip free node), or 'random' (any free node).
  function pickTarget(state, params, rng) {
    const target = params.pushTarget || 'tip';
    if (target === 'cart') return state.cartIdx;
    if (target === 'tip') return state.tipIdx;
    const freeIdxs = [];
    for (let i = 0; i < state.world.nodes.length; i++) {
      const n = state.world.nodes[i];
      if (n.role === 0 /* FREE */) freeIdxs.push(i);
    }
    if (target === 'mid-joint') {
      const mids = freeIdxs.filter(i => i !== state.tipIdx);
      if (mids.length === 0) return state.tipIdx;
      return mids[rng.int(mids.length)];
    }
    if (target === 'random') {
      if (freeIdxs.length === 0) return state.tipIdx;
      return freeIdxs[rng.int(freeIdxs.length)];
    }
    return state.tipIdx;
  }

  // Trapezoidal envelope. For ramp=0 (no smoothing), the push is a flat hold.
  // For ramp≥duration/2, the envelope becomes triangular (no flat portion).
  function envelopeScale(elapsed, total, ramp) {
    if (ramp <= 0 || total <= 0) return 1;
    const r = Math.min(ramp, total / 2);
    if (elapsed < r) return elapsed / r;
    if (elapsed > total - r) return Math.max(0, (total - elapsed) / r);
    return 1;
  }

  // A display event outlives the physical impulse. Wall-clock fading keeps a
  // one-tick nudge visible even when several simulation steps run per frame.
  // No force, RNG call, or simulation clock is changed by this history.
  function recordVisual(state, vis, now) {
    state.activePushVis = vis;
    if (!vis || !state.capturePushVisuals) return;
    const strength = Math.hypot(vis.fx || 0, vis.fy || 0);
    if (!strength) return;
    state.pushAfterglow = {...vis, at: now == null ? performance.now() : now};
  }
  function visualAt(state, now) {
    const vis = state.pushAfterglow;
    if (!vis) return null;
    const age = Math.max(0, (now == null ? performance.now() : now) - vis.at);
    if (age >= 1150) return null;
    return {...vis, alpha: age < 180 ? 1 : Math.pow(1 - (age - 180) / 970, 1.6),
      afterglow: age > 100};
  }

  // Apply force/impulse for one physics tick. Updates state.activePushVis so
  // the renderer can draw the indicator. Mutates `controller` in place.
  function tick(controller, state, dt, params, rng) {
    if (!params || !params.useDisturb) {
      state.activePushVis = null;
      return;
    }

    if (controller.active) {
      const a = controller.active;
      const scale = envelopeScale(a.elapsed, a.duration, a.smoothing);
      const fx = a.peakFx * scale;
      const fy = a.peakFy * scale;
      // Convert sustained force to per-step impulse: dvelocity = F * dt / mass.
      // applyImpulse expects raw impulse (= force × dt), and divides by mass
      // internally — exactly what we want.
      BF.physics.applyImpulse(state.world, a.target, fx * dt, fy * dt);
      recordVisual(state, { target: a.target, fx: fx, fy: fy, scale: scale });
      a.elapsed += dt;
      if (a.elapsed >= a.duration) controller.active = null;
      return;
    }

    state.activePushVis = null;
    controller.timer -= dt;
    if (controller.timer > 0) return;

    // Time for a new push.
    const target = pickTarget(state, params, rng);
    const sign = rng.next() < 0.5 ? -1 : 1;
    const peakFx = sign * (params.pushStrength || 200);
    // pushDirection currently always horizontal — keeps the cart-pole
    // semantics consistent. Vertical pushes could be added per target later.
    const peakFy = 0;
    const duration = Math.max(0, params.pushDuration || 0);
    const smoothing = Math.max(0, Math.min(duration / 2, params.pushSmoothing || 0));

    if (duration <= 1e-6) {
      // Instant impulse — same as legacy behavior. Strength is already in
      // velocity units (it adds directly to velocity via applyImpulse).
      BF.physics.applyImpulse(state.world, target, peakFx, peakFy);
      // Surface a one-frame visual hint so the user can still see the push.
      recordVisual(state, { target: target, fx: peakFx, fy: peakFy, scale: 1, instant: true });
    } else {
      controller.active = {
        target: target,
        peakFx: peakFx, peakFy: peakFy,
        duration: duration,
        elapsed: 0,
        smoothing: smoothing,
      };
    }

    controller.timer = rng.range(
      params.pushIntervalMin || 1.0,
      params.pushIntervalMax || 3.0
    );
  }

  function reset(controller, params, rng) {
    controller.active = null;
    controller.timer = rng.range(
      params.pushIntervalMin || 1.0,
      params.pushIntervalMax || 3.0
    );
  }

  BF.disturb = { make, tick, reset, pickTarget, recordVisual, visualAt };
})(window.BF);
