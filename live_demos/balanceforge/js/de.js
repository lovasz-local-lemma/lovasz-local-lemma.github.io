// BalanceForge — Differential Evolution (DE/rand/1/bin).
//
// Storey & Price's classic gradient-free optimizer for continuous spaces.
// Each individual is a "target" parameter vector; per generation we build a
// "trial" by combining three other randomly-picked targets:
//
//     trial = c + F * (a - b)   then crossover with target at rate CR
//
// where (a, b, c) are distinct individuals other than the target. The trial
// replaces the target if its fitness is higher, otherwise the target stays.
//
// Visually distinct from CMA-ES: there's no central mean to converge around.
// Each individual carries its own state and the population spreads out across
// the fitness landscape. Distinct from GA: no selection pressure, no
// elitism — the only "selection" is per-individual greedy replacement.
//
// We piggyback on cmaes.js for param-vector ↔ NEAT-genome conversion so all
// fixed-topology algorithms share the network shape.

(function (BF) {
  'use strict';

  function paramCount(numIn, numOut, hidden) {
    return BF.cmaes.paramCount(numIn, numOut, hidden);
  }
  function genomeFromParams(params, numIn, numOut, hidden) {
    return BF.cmaes.genomeFromParams(params, numIn, numOut, hidden);
  }

  // opts.dimOverride: search a vector of THIS length instead of the plain-MLP
  // param count. Same seam CMA-ES/sep-CMA-ES expose, so the placeholder-genome
  // policy types (CNN family, BF.recurrent) work under DE too. Absent/0 =
  // unchanged legacy behaviour.
  function create(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = (opts.dimOverride != null && opts.dimOverride > 0)
      ? (opts.dimOverride | 0)
      : paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      F: opts.F != null ? opts.F : 0.5,    // mutation factor (0.4–1.0 typical)
      CR: opts.CR != null ? opts.CR : 0.9, // crossover rate (0.7–1.0 typical)
      initSpread: opts.initSpread != null ? opts.initSpread : 0.5,
      generation: 0,
      lastAcceptCount: 0,
      lastTotal: 0,
    };
  }

  function reset(state) {
    state.generation = 0;
    state.lastAcceptCount = 0;
    state.lastTotal = 0;
  }

  function initialPopulation(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const params = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) params[j] = rng.gauss(0, state.initSpread);
      out[i] = {
        params: params,
        targetParams: new Float64Array(params),
        targetFitness: -Infinity,
        fitness: 0,
        genome: builder(params),
      };
    }
    return out;
  }

  // Phase A (post-evaluation): for each individual, accept the trial if it
  // beats the previous target fitness. This is the only form of "selection"
  // DE has — it's per-individual and greedy.
  function selectTrials(state, population) {
    let accepted = 0;
    for (const ind of population) {
      if (ind.targetFitness === -Infinity || ind.fitness > ind.targetFitness) {
        ind.targetParams = new Float64Array(ind.params);
        ind.targetFitness = ind.fitness;
        accepted++;
      }
    }
    state.lastAcceptCount = accepted;
    state.lastTotal = population.length;
    return accepted;
  }

  // Phase B (build next pop): synthesize trials via DE/rand/1/bin.
  function generateTrials(state, population, rng, builder) {
    const popSize = population.length;
    const n = state.n;
    if (popSize < 4) {
      // DE/rand/1 needs (target, a, b, c) all distinct → minimum 4. Fall back
      // to small random walk so the algorithm still progresses on tiny pops.
      const out = new Array(popSize);
      for (let i = 0; i < popSize; i++) {
        const trial = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          trial[j] = population[i].targetParams[j] + rng.gauss(0, 0.1);
        }
        out[i] = {
          params: trial,
          targetParams: new Float64Array(population[i].targetParams),
          targetFitness: population[i].targetFitness,
          fitness: 0,
          genome: builder(trial),
        };
      }
      state.generation++;
      return out;
    }
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      // Pick three distinct random indices, all different from i.
      let a, b, c;
      do { a = rng.int(popSize); } while (a === i);
      do { b = rng.int(popSize); } while (b === i || b === a);
      do { c = rng.int(popSize); } while (c === i || c === a || c === b);

      const target = population[i].targetParams;
      const tA = population[a].targetParams;
      const tB = population[b].targetParams;
      const tC = population[c].targetParams;
      const trial = new Float64Array(n);
      // Bin crossover: each coordinate either takes the donor (mutant) value
      // or the target's value. One random index is forced to take the donor
      // so trial ≠ target with probability 1.
      const jRand = rng.int(n);
      for (let j = 0; j < n; j++) {
        if (j === jRand || rng.next() < state.CR) {
          trial[j] = tC[j] + state.F * (tA[j] - tB[j]);
        } else {
          trial[j] = target[j];
        }
      }
      out[i] = {
        params: trial,
        targetParams: new Float64Array(target),
        targetFitness: population[i].targetFitness,
        fitness: 0,
        genome: builder(trial),
      };
    }
    state.generation++;
    return out;
  }

  BF.de = {
    create, reset, initialPopulation, selectTrials, generateTrials,
    paramCount, genomeFromParams,
  };
})(window.BF);
