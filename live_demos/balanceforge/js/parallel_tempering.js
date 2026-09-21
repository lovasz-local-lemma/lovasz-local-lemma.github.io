// BalanceForge — parallel tempering (replica-exchange MCMC).
//
// N chains run Metropolis-Hastings simultaneously, each at a different
// temperature on a geometric ladder T_min … T_max. Hot chains explore (high
// acceptance of worse moves), cold chains exploit (almost greedy hill-climb).
// Periodically we attempt swaps between chains at adjacent temperatures: if a
// hot chain has stumbled onto something better than a colder chain has, the
// good state migrates downward. This is genuinely different from SA — both
// exploration *and* exploitation happen simultaneously, and good discoveries
// from hot chains can crystallize at the cold end.
//
// We piggyback on cmaes.js for the param-vector ↔ NEAT-genome conversion so
// every fixed-topology algorithm uses the same network shape.

(function (BF) {
  'use strict';

  function paramCount(numInputs, numOutputs, hiddenSize) {
    return BF.cmaes.paramCount(numInputs, numOutputs, hiddenSize);
  }
  function genomeFromParams(params, numInputs, numOutputs, hiddenSize) {
    return BF.cmaes.genomeFromParams(params, numInputs, numOutputs, hiddenSize);
  }

  function create(numInputs, numOutputs, hiddenSize, opts) {
    opts = opts || {};
    const n = paramCount(numInputs, numOutputs, hiddenSize);
    const Tmin = opts.Tmin != null ? opts.Tmin : 0.05;
    const Tmax = opts.Tmax != null ? opts.Tmax : 2.0;
    const nChains = Math.max(2, opts.nChains | 0 || 16);
    // Geometric ladder: T_i = Tmin * (Tmax/Tmin)^(i/(N-1))
    const ratio = Math.pow(Tmax / Tmin, 1 / (nChains - 1));
    const Ts = new Float64Array(nChains);
    for (let i = 0; i < nChains; i++) Ts[i] = Tmin * Math.pow(ratio, i);
    return {
      n: n,
      paramShape: { numInputs: numInputs, numOutputs: numOutputs, hiddenSize: hiddenSize },
      Ts: Ts,
      nChains: nChains,
      Tmin: Tmin, Tmax: Tmax,
      proposalSigma: opts.proposalSigma != null ? opts.proposalSigma : 0.2,
      swapInterval: Math.max(1, opts.swapInterval | 0 || 4),
      generation: 0,
      lastSwapAttempts: 0,
      lastSwapAccepts: 0,
      cumulativeSwapAccepts: 0,
    };
  }

  // Build the initial population (one chain per ladder step). Each chain is
  // assigned a random starting parameter vector and remembers its temperature
  // index. The trainer treats each chain as an "individual" for evaluation.
  function initialPopulation(state, rng, builder, initSpread) {
    const spread = initSpread != null ? initSpread : 0.5;
    const out = new Array(state.nChains);
    for (let i = 0; i < state.nChains; i++) {
      const params = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) params[j] = rng.gauss(0, spread);
      out[i] = {
        genome: builder(params),
        params: params,
        fitness: 0,
        chainBest: -Infinity,
        chainBestParams: new Float64Array(params),
        tIndex: i, // which temperature on the ladder this chain currently holds
      };
    }
    return out;
  }

  // Phase A: MH accept/reject per chain, then attempt one swap pass between
  // adjacent ladder slots if it's a swap-interval generation. Returns
  //   { accepts: bool[], swap: { attempts, accepts, swappedPairs } }.
  function acceptAndSwap(state, population, rng) {
    const accepts = new Array(population.length);
    // 1) Per-chain MH accept/reject.
    for (let i = 0; i < population.length; i++) {
      const ind = population[i];
      const T = state.Ts[ind.tIndex];
      const delta = ind.fitness - ind.chainBest;
      const acc = ind.chainBest === -Infinity ||
                  delta >= 0 ||
                  rng.next() < Math.exp(delta / Math.max(1e-6, T));
      accepts[i] = acc;
      if (acc) {
        ind.chainBest = ind.fitness;
        ind.chainBestParams = new Float64Array(ind.params);
      }
    }

    // 2) Swap pass: attempt swaps between chains at adjacent T-indices.
    let swapAttempts = 0, swapAccepts = 0;
    const swappedPairs = [];
    if (state.generation > 0 && state.generation % state.swapInterval === 0) {
      // Index population by tIndex to find adjacent neighbors.
      const byT = new Array(state.nChains);
      for (const ind of population) byT[ind.tIndex] = ind;
      // Alternate even/odd swap waves to avoid biasing one direction.
      const startEven = state.generation % 2 === 0;
      for (let tStart = startEven ? 0 : 1; tStart < state.nChains - 1; tStart += 2) {
        const lower = byT[tStart];
        const upper = byT[tStart + 1];
        if (!lower || !upper) continue;
        const Tlow = state.Ts[lower.tIndex];
        const Thigh = state.Ts[upper.tIndex];
        // Acceptance: exp((f_lower - f_upper) * (1/Thigh - 1/Tlow))
        // i.e. exchange is favored if upper (hot) chain has higher fitness
        // than lower (cold) chain — that means the cold one is less good and
        // should accept the swap.
        const dF = lower.chainBest - upper.chainBest;
        const dBeta = (1 / Thigh) - (1 / Tlow); // negative (Thigh > Tlow → β smaller)
        const logProb = dF * dBeta;
        const accept = logProb >= 0 || rng.next() < Math.exp(logProb);
        swapAttempts++;
        if (accept) {
          // Swap their tIndex assignment. The chains' params + state stay put;
          // only their "label" (which T-slot they occupy) flips. This is the
          // standard formulation of replica exchange.
          const tmp = lower.tIndex;
          lower.tIndex = upper.tIndex;
          upper.tIndex = tmp;
          swapAccepts++;
          swappedPairs.push([lower.tIndex, upper.tIndex]);
        }
      }
      state.lastSwapAttempts = swapAttempts;
      state.lastSwapAccepts = swapAccepts;
      state.cumulativeSwapAccepts += swapAccepts;
    } else {
      state.lastSwapAttempts = 0;
      state.lastSwapAccepts = 0;
    }

    state.generation++;
    return { accepts: accepts, swap: { attempts: swapAttempts, accepts: swapAccepts, swappedPairs: swappedPairs } };
  }

  // Phase B: build the next population by proposing a fresh perturbation per
  // chain at its current ladder temperature. genomeBuilder converts params →
  // genome (so the trainer can evaluate via the shared network code path).
  function proposeNextPopulation(state, population, rng, genomeBuilder) {
    const out = new Array(population.length);
    for (let i = 0; i < population.length; i++) {
      const ind = population[i];
      const T = state.Ts[ind.tIndex];
      // Proposal scale grows with T — hot chains take wide steps, cold chains
      // take fine steps.
      const sigma = state.proposalSigma * Math.sqrt(Math.max(state.Tmin, T));
      const proposal = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        proposal[j] = ind.chainBestParams[j] + rng.gauss(0, sigma);
      }
      out[i] = {
        genome: genomeBuilder(proposal),
        params: proposal,
        fitness: 0,
        chainBest: ind.chainBest,
        chainBestParams: new Float64Array(ind.chainBestParams),
        tIndex: ind.tIndex,
      };
    }
    return out;
  }

  function reset(state) {
    state.generation = 0;
    state.lastSwapAttempts = 0;
    state.lastSwapAccepts = 0;
    state.cumulativeSwapAccepts = 0;
  }

  BF.pt = {
    create, initialPopulation, acceptAndSwap, proposeNextPopulation, reset,
    paramCount, genomeFromParams,
  };
})(window.BF);
