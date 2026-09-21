// BalanceForge — adversarial environment co-evolution.
//
// Maintains a small population of "environments" that ride alongside the
// controller population. Each env is a vector of multipliers on the
// fundamental physics knobs (gravity, damping, cart accel, start-angle
// range, push strength). Each rollout, ONE env is sampled from the pop and
// applied as an overlay on top of the user's nominal params, so the
// controller sees a slightly different physics at each evaluation.
//
// After the controllers are evaluated, each env gets a fitness equal to
// MINUS the average controller fitness it produced. Higher env fitness =
// "this env defeats controllers more". The env population then evolves —
// mutation + tournament — toward harder configurations, capped by the
// per-knob clamp ranges so the envs can't drift to physical impossibility.
//
// Effect: controllers learn to be ROBUST, not just adapted to the user's
// nominal physics. The Red Queen / arms race in miniature.
//
// This module is independent of the controller's algorithm — works the
// same with NEAT, CMA-ES, swarms, gradient descent, etc.

(function (BF) {
  'use strict';

  // Env knobs — all multipliers on the user-set base value, except
  // startAngleScale which multiplies the difficulty's startAngleRange.
  // [min, max, init] for each.
  const KNOBS = [
    { key: 'gravityMul',     min: 0.5, max: 2.0, init: 1.0 },
    { key: 'dampingMul',     min: 0.3, max: 3.0, init: 1.0 },
    { key: 'cartAccelMul',   min: 0.4, max: 1.4, init: 1.0 },
    { key: 'startAngleScale',min: 0.5, max: 1.6, init: 1.0 },
    { key: 'pushStrengthMul',min: 0.0, max: 2.0, init: 1.0 },
  ];
  const KNOB_DIM = KNOBS.length;

  // Build the initial env population. Each env starts at the "nominal"
  // (no-overlay) point — multipliers all 1.0 — with small Gaussian
  // perturbation so the pop has variety from gen 0.
  function create(opts) {
    opts = opts || {};
    const popSize = Math.max(2, Math.min(64, opts.popSize | 0 || 8));
    const initSigma = opts.initSigma != null ? opts.initSigma : 0.15;
    const pop = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      pop[i] = makeEnvIndividual(initSigma, opts.rng || Math);
    }
    return {
      pop: pop,
      generation: 0,
      mutationSigma: opts.mutationSigma != null ? opts.mutationSigma : 0.10,
      eliteFrac: opts.eliteFrac != null ? opts.eliteFrac : 0.5,
      // Diagnostics from the most recent gen:
      lastHardestFitness: -Infinity,
      lastSoftestFitness: Infinity,
      lastDiversity: 0,
    };
  }

  function makeEnvIndividual(initSigma, rng) {
    const params = new Float64Array(KNOB_DIM);
    for (let j = 0; j < KNOB_DIM; j++) {
      const knob = KNOBS[j];
      // Box-Muller via the trainer's RNG if available; otherwise Math.random
      // approximation good enough for initial scatter.
      const z = (rng.gauss != null) ? rng.gauss(0, initSigma) : ((rng.random ? rng.random() : Math.random()) - 0.5) * 2 * initSigma;
      params[j] = clamp(knob.init + z, knob.min, knob.max);
    }
    return {
      params: params,
      fitness: 0,
      // Per-gen accumulators reset each evolveEnvPop call.
      _fitSum: 0,
      _evalCount: 0,
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Sample one env at random for a rollout. Uniform across the population —
  // every env should get evaluated multiple times per gen so we have signal
  // on which is hardest.
  function sampleEnv(state, rng) {
    const idx = Math.floor((rng.next ? rng.next() : Math.random()) * state.pop.length);
    return { idx: idx, env: state.pop[idx] };
  }

  // Apply an env's multipliers to the trainer params for one rollout. The
  // returned object can be merged with trainer.params just for that rollout
  // — caller is responsible for not mutating trainer.params permanently.
  function envOverlay(env, baseParams) {
    const m = env.params;
    return {
      gravity:      baseParams.gravity      * m[0],
      damping:      baseParams.damping      * m[1],
      cartAccel:    baseParams.cartAccel    * m[2],
      startAngleRange: (baseParams.startAngleRange != null ? baseParams.startAngleRange : 0.1) * m[3],
      pushStrength: (baseParams.pushStrength || 0) * m[4],
    };
  }

  // Record one rollout's controller fitness against the env that was
  // overlaid. Called from the trainer after each rollout.
  function recordResult(state, envIdx, controllerFitness) {
    const env = state.pop[envIdx];
    if (!env) return;
    env._fitSum += controllerFitness;
    env._evalCount += 1;
  }

  // After all controllers are evaluated this gen: assign each env its
  // fitness (= -avg controller fitness on it; envs that cause more
  // controller failure rank higher), then run a tournament + mutation
  // step to produce next gen's env pop.
  function evolveEnvPop(state, rng) {
    // 1. Finalize per-env fitness from accumulators. Envs that weren't
    // sampled this gen keep their previous fitness (could happen with
    // tiny controller pops + large env pops; rare in practice).
    let hardest = -Infinity, softest = Infinity;
    for (const env of state.pop) {
      if (env._evalCount > 0) {
        env.fitness = -(env._fitSum / env._evalCount);
      }
      if (env.fitness > hardest) hardest = env.fitness;
      if (env.fitness < softest) softest = env.fitness;
      env._fitSum = 0;
      env._evalCount = 0;
    }
    state.lastHardestFitness = hardest;
    state.lastSoftestFitness = softest;

    // 2. Diversity = mean per-knob standard deviation across the pop.
    let divSum = 0;
    for (let j = 0; j < KNOB_DIM; j++) {
      let m = 0;
      for (const e of state.pop) m += e.params[j];
      m /= state.pop.length;
      let v = 0;
      for (const e of state.pop) { const d = e.params[j] - m; v += d * d; }
      divSum += Math.sqrt(v / Math.max(1, state.pop.length - 1));
    }
    state.lastDiversity = divSum / KNOB_DIM;

    // 3. Tournament select + mutate. Sort by fitness, keep top eliteFrac
    // unmutated, fill the rest with mutated children of the top half.
    const sorted = state.pop.slice().sort((a, b) => b.fitness - a.fitness);
    const eliteCount = Math.max(1, Math.floor(state.pop.length * state.eliteFrac));
    const next = [];
    for (let i = 0; i < eliteCount; i++) {
      const e = sorted[i];
      next.push({
        params: new Float64Array(e.params),
        fitness: e.fitness,
        _fitSum: 0, _evalCount: 0,
      });
    }
    while (next.length < state.pop.length) {
      const parent = sorted[Math.floor((rng.next ? rng.next() : Math.random()) * eliteCount)];
      const child = mutate(parent, state.mutationSigma, rng);
      next.push(child);
    }
    state.pop = next;
    state.generation += 1;
  }

  function mutate(parent, sigma, rng) {
    const params = new Float64Array(parent.params);
    for (let j = 0; j < KNOB_DIM; j++) {
      const knob = KNOBS[j];
      const z = rng.gauss ? rng.gauss(0, sigma) : ((rng.random ? rng.random() : Math.random()) - 0.5) * 2 * sigma;
      params[j] = clamp(params[j] + z, knob.min, knob.max);
    }
    return { params: params, fitness: 0, _fitSum: 0, _evalCount: 0 };
  }

  // Diagnostic: which env knob values does the hardest individual have?
  function hardestEnv(state) {
    let best = null;
    for (const e of state.pop) {
      if (best === null || e.fitness > best.fitness) best = e;
    }
    if (!best) return null;
    const out = {};
    for (let j = 0; j < KNOB_DIM; j++) out[KNOBS[j].key] = best.params[j];
    out.fitness = best.fitness;
    return out;
  }

  BF.adversarial = {
    create, sampleEnv, envOverlay, recordResult, evolveEnvPop,
    hardestEnv, KNOBS, KNOB_DIM,
  };
})(window.BF);
