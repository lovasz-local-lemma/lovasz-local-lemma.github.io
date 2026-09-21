// BalanceForge — parallel simulated annealing.
//
// N independent chains, each maintaining its own state (parameter vector +
// fitness). Each "generation" each chain proposes a perturbation and accepts
// it if the proposal is better, OR with probability exp(Δf / T) if worse.
// Temperature decays geometrically per generation. Chains share a topology
// (same fixed network shape that CMA-ES uses) so the rest of the system can
// treat individuals identically across algorithms.
//
// Compared to CMA-ES this is conceptually simpler — no covariance bookkeeping,
// no path tracking — and the visual story is different: in PCA space you'll
// see N independent points jittering hot, settling cold, instead of a single
// adapting Gaussian cloud.

(function (BF) {
  'use strict';

  // ---- Topology helpers (mirror CMA-ES so the network shape is consistent)
  function paramCount(numInputs, numOutputs, hiddenSize) {
    return BF.cmaes.paramCount(numInputs, numOutputs, hiddenSize);
  }
  function genomeFromParams(params, numInputs, numOutputs, hiddenSize) {
    return BF.cmaes.genomeFromParams(params, numInputs, numOutputs, hiddenSize);
  }

  function create(numInputs, numOutputs, hiddenSize, opts) {
    opts = opts || {};
    const n = paramCount(numInputs, numOutputs, hiddenSize);
    return {
      n: n,
      paramShape: { numInputs: numInputs, numOutputs: numOutputs, hiddenSize: hiddenSize },
      // Initial temperature — chosen so a per-step fitness drop of ~1.0 is
      // accepted ~37% of the time on the first generation.
      T0: opts.T0 != null ? opts.T0 : 1.0,
      // Geometric cooling: T_{g+1} = T_g × coolingRate. After 100 gens at
      // 0.97/gen, T ≈ 0.05 — search is then nearly greedy hill-climbing.
      coolingRate: opts.coolingRate != null ? opts.coolingRate : 0.97,
      // Proposal noise standard deviation, scaled by current temperature.
      proposalSigma: opts.proposalSigma != null ? opts.proposalSigma : 0.3,
      // Floor temperature so cooling doesn't fully freeze (allows late-stage
      // exploration of ties at the cost of small extra noise).
      Tmin: opts.Tmin != null ? opts.Tmin : 0.02,
      currentT: 0,        // set by reset()
      generation: 0,
      // Per-chain accepted count, useful for diagnostics.
      acceptCounts: null,
    };
  }

  function reset(state, opts) {
    opts = opts || {};
    state.currentT = opts.T0 != null ? opts.T0 : state.T0;
    state.generation = 0;
    state.acceptCounts = null;
  }

  // Sample an initial chain state. Random init across [-initSpread, +initSpread].
  function initialParams(state, rng, initSpread) {
    const spread = initSpread != null ? initSpread : 0.5;
    const v = new Float64Array(state.n);
    for (let i = 0; i < state.n; i++) v[i] = rng.gauss(0, spread);
    return v;
  }

  // Generate a proposal by perturbing current params with Gaussian noise of
  // scale (proposalSigma × currentT). Returns a fresh Float64Array.
  function propose(state, current, rng) {
    const sigma = state.proposalSigma * Math.max(state.Tmin, state.currentT);
    const out = new Float64Array(state.n);
    for (let i = 0; i < state.n; i++) {
      out[i] = current[i] + rng.gauss(0, sigma);
    }
    return out;
  }

  // Decide whether to accept a proposed move. Δf is fitness_new − fitness_old.
  // Greedy if better, stochastic if worse: P(accept) = exp(Δf / T).
  function shouldAccept(deltaFitness, T, rng) {
    if (deltaFitness >= 0) return true;
    const T_eff = Math.max(T, 1e-6);
    const p = Math.exp(deltaFitness / T_eff);
    return rng.next() < p;
  }

  // Per-generation update: cooling step. Acceptance is handled by the trainer
  // since it knows about the evaluated population structure.
  function cool(state) {
    state.currentT = Math.max(state.Tmin, state.currentT * state.coolingRate);
    state.generation += 1;
  }

  BF.annealing = {
    create, reset, initialParams, propose, shouldAccept, cool,
    paramCount, genomeFromParams,
  };
})(window.BF);
