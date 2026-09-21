// BalanceForge — Particle Swarm Optimization (PSO).
//
// A swarm of N particles each carrying:
//   - position x (in parameter space)
//   - velocity v (parameter-space velocity)
//   - personal best  p_best  (best position this particle has ever occupied)
//   - personal best fitness f_best
// Plus a global best g_best across the entire swarm.
//
// Per generation each particle updates as:
//   v ← ω · v + c1 · r1 · (p_best − x) + c2 · r2 · (g_best − x)
//   x ← x + v
// where r1, r2 ∈ [0, 1] are independent per-coordinate random numbers and
// (ω, c1, c2) are the inertia / cognitive / social weights.
//
// Conceptually distinct from CMA-ES (no covariance learning), DE (no
// difference-vector arithmetic between strangers) and SA (no temperature or
// stochastic acceptance) — particles steer between *their own* best and *the
// swarm's* best, with momentum carrying them forward. Visually the population
// flows in coherent clouds toward emerging attractors.

(function (BF) {
  'use strict';

  function paramCount(numIn, numOut, hidden) {
    return BF.cmaes.paramCount(numIn, numOut, hidden);
  }
  function genomeFromParams(params, numIn, numOut, hidden) {
    return BF.cmaes.genomeFromParams(params, numIn, numOut, hidden);
  }

  function create(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      // Inertia weight ω. Standard "Clerc constriction" schedule decays ω
      // from 0.9 → 0.4 over training, but for simplicity we keep it fixed at
      // 0.7 — a well-known robust default.
      inertia:   opts.inertia   != null ? opts.inertia   : 0.7,
      cognitive: opts.cognitive != null ? opts.cognitive : 1.5,
      social:    opts.social    != null ? opts.social    : 1.5,
      // Velocity is clipped to ±vMax * spread so particles don't fly off into
      // weight-space oblivion. Empirical default: 0.5 of the init spread.
      vMax:      opts.vMax      != null ? opts.vMax      : 0.5,
      initSpread: opts.initSpread != null ? opts.initSpread : 0.5,
      generation: 0,
      gBestParams: null,
      gBestFitness: -Infinity,
    };
  }

  function reset(state) {
    state.generation = 0;
    state.gBestParams = null;
    state.gBestFitness = -Infinity;
  }

  function initialPopulation(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const params = new Float64Array(state.n);
      const velocity = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        params[j] = rng.gauss(0, state.initSpread);
        // Small random initial velocity so particles immediately have direction.
        velocity[j] = rng.gauss(0, state.initSpread * 0.2);
      }
      out[i] = {
        params: params,
        velocity: velocity,
        pBestParams: new Float64Array(params),
        pBestFitness: -Infinity,
        fitness: 0,
        genome: builder(params),
      };
    }
    return out;
  }

  // Phase A (post-evaluation): update personal-bests, find global-best.
  function updateBests(state, population) {
    let updated = 0;
    for (const p of population) {
      if (p.fitness > p.pBestFitness) {
        p.pBestFitness = p.fitness;
        p.pBestParams = new Float64Array(p.params);
        updated++;
      }
      if (p.fitness > state.gBestFitness) {
        state.gBestFitness = p.fitness;
        state.gBestParams = new Float64Array(p.params);
      }
    }
    return updated;
  }

  // Phase B: each particle takes a step. Returns a new population (the same
  // shape as initialPopulation produces) so the trainer can drop it in.
  function stepSwarm(state, population, rng, builder) {
    const out = new Array(population.length);
    const w = state.inertia, c1 = state.cognitive, c2 = state.social;
    const gBest = state.gBestParams;
    const vClip = state.vMax * state.initSpread; // velocity-magnitude cap (per-coord)
    for (let i = 0; i < population.length; i++) {
      const p = population[i];
      const newVel = new Float64Array(state.n);
      const newPos = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        const r1 = rng.next(), r2 = rng.next();
        let v = w * p.velocity[j]
              + c1 * r1 * (p.pBestParams[j] - p.params[j])
              + (gBest ? c2 * r2 * (gBest[j] - p.params[j]) : 0);
        // Per-coordinate velocity clipping to keep the swarm stable.
        if (v >  vClip) v =  vClip;
        if (v < -vClip) v = -vClip;
        newVel[j] = v;
        newPos[j] = p.params[j] + v;
      }
      out[i] = {
        params: newPos,
        velocity: newVel,
        // Personal best carries over unchanged — Phase A of next gen will
        // refresh after the new position is evaluated.
        pBestParams: new Float64Array(p.pBestParams),
        pBestFitness: p.pBestFitness,
        fitness: 0,
        genome: builder(newPos),
      };
    }
    state.generation++;
    return out;
  }

  BF.pso = {
    create, reset, initialPopulation, updateBests, stepSwarm,
    paramCount, genomeFromParams,
  };
})(window.BF);
