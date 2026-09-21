// BalanceForge — Random Search + Cross-Entropy Method (CEM).
//
// Two algorithms in one file because they're conceptual neighbors and share
// nearly all of their plumbing:
//
//   Random Search:  sample λ from N(0, σ²I) every generation. No memory.
//                   Useful as a baseline — "how well do we do with no
//                   algorithm at all?". Fitness should slowly improve only
//                   through luck (best-of-λ statistic), not through learning.
//
//   CEM (Cross-Entropy Method):  sample λ from N(μ, σ²I), take top μₑ
//                   "elite" by fitness, refit μ to their mean and σ to their
//                   isotropic standard deviation. Halfway between Random
//                   Search and CMA-ES — adapts location and scale, but not
//                   shape (no covariance matrix).
//
// Both use isotropic σ (a single scalar) — distinct from CMA-ES's full
// covariance and from PSO's velocity-based dynamics.

(function (BF) {
  'use strict';

  function paramCount(numIn, numOut, hidden) {
    return BF.cmaes.paramCount(numIn, numOut, hidden);
  }
  function genomeFromParams(params, numIn, numOut, hidden) {
    return BF.cmaes.genomeFromParams(params, numIn, numOut, hidden);
  }

  // ------------------------------------------------------------------ Random
  function createRandom(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.5,
      generation: 0,
    };
  }

  function randomReset(state) {
    state.generation = 0;
  }

  function randomSample(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const params = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) params[j] = rng.gauss(0, state.sigma);
      out[i] = { params: params, genome: builder(params), fitness: 0 };
    }
    state.generation++;
    return out;
  }

  // --------------------------------------------------------------------- CEM
  function createCEM(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      sigma: opts.sigma != null ? opts.sigma : 0.5,
      eliteFrac: opts.eliteFrac != null ? opts.eliteFrac : 0.20,
      // sigmaFloor prevents premature convergence — once σ collapses below
      // this, the algorithm can't escape its current optimum.
      sigmaFloor: opts.sigmaFloor != null ? opts.sigmaFloor : 0.01,
      generation: 0,
      // Last-update diagnostics (surfaced via algo internals chart).
      lastEliteCount: 0,
    };
  }

  function cemReset(state) {
    state.mean = new Float64Array(state.n);
    state.sigma = 0.5;
    state.generation = 0;
    state.lastEliteCount = 0;
  }

  function cemSample(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const params = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        params[j] = state.mean[j] + rng.gauss(0, state.sigma);
      }
      out[i] = { params: params, genome: builder(params), fitness: 0 };
    }
    return out;
  }

  // Update μ to the mean of the top-fraction "elite", σ to their per-coord
  // standard deviation (isotropic average). Simple and sample-efficient.
  function cemUpdate(state, evaluatedPop) {
    const popSize = evaluatedPop.length;
    const mu = Math.max(1, Math.floor(popSize * state.eliteFrac));
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const elite = sorted.slice(0, mu);
    state.lastEliteCount = mu;

    const n = state.n;
    const newMean = new Float64Array(n);
    for (const ind of elite) {
      for (let j = 0; j < n; j++) newMean[j] += ind.params[j];
    }
    for (let j = 0; j < n; j++) newMean[j] /= mu;

    // Pooled per-dimension variance, averaged across dims for isotropic σ.
    let varSum = 0;
    let varCount = 0;
    for (const ind of elite) {
      for (let j = 0; j < n; j++) {
        const d = ind.params[j] - newMean[j];
        varSum += d * d;
        varCount += 1;
      }
    }
    const variance = varSum / Math.max(1, varCount);
    state.sigma = Math.max(state.sigmaFloor, Math.sqrt(variance));
    state.mean = newMean;
    state.generation++;
  }

  BF.randomSearch = {
    create: createRandom, reset: randomReset, sample: randomSample,
    paramCount, genomeFromParams,
  };
  BF.cem = {
    create: createCEM, reset: cemReset, sample: cemSample, update: cemUpdate,
    paramCount, genomeFromParams,
  };
})(window.BF);
