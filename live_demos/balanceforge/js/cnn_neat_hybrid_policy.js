// BalanceForge -- NEAT-on-top-of-frozen-CNN hybrid policy.
//
// The CNN front-end is the cnn-multiscale architecture with RANDOM,
// FROZEN weights -- never updated during training. It exists purely
// as a structured feature projector: high-dim spatial input
// (multi-scale grids) is convolved + pooled down to a small fixed
// feature vector. NEAT then evolves topology over those features +
// agent state (+ optionally top-K nearest bullets).
//
// Why this works (random conv features):
//   * Conv weights are SHARED across cells, so a random kernel
//     produces a stable, structured projection regardless of where
//     bullets are -- spatial invariance for free.
//   * Random projections preserve enough information for downstream
//     learnable layers to recover the signal (Johnson-Lindenstrauss
//     intuition; Extreme Learning Machine / Random Kitchen Sinks
//     literature).
//   * NEAT then learns "which CNN features matter for the action" --
//     a 16-feature input space is MASSIVELY easier for NEAT's local
//     mutation operators than the raw 516-input multi-scale obs.
//
// The full forward pass of cnn-multiscale IS used (conv -> pool), but
// the dense head is discarded -- we don't need its output, only the
// pooled features. NEAT replaces the dense head entirely.

(function (BF) {
  'use strict';

  const N = BF.neat;
  const CNN = BF.cnnMultiscale;

  // Compute the post-CNN input count NEAT will see. Used by the
  // trainer at population init time to size genomes correctly.
  //   features = agentStateSize + 2 * pooled_per_branch + topkSlots
  function projectedInputCount(cnnConfig, includeTopK) {
    const c = cnnConfig;
    const pooledW = Math.max(1, Math.floor(c.localGridSize / c.poolSize));
    const pooledPerBranch = pooledW * pooledW * c.numFilters;
    const topK = includeTopK ? 16 : 0;  // 4 bullets × 4 floats (legacy compat -- use 8 for new default? see note below)
    return c.agentStateSize + 2 * pooledPerBranch + topK;
  }

  // NOTE on TOPK size: setups.js writes TOPK_K (default 8) bullets at
  // the tail of the multiscale obs. The slot count is dynamic via the
  // setup's MULTISCALE_TOPK_TAIL constant. We accept it as a parameter
  // so the hybrid policy doesn't need to know the setup's K value
  // statically.
  function projectedInputCountWithTopK(cnnConfig, topKSlots) {
    const c = cnnConfig;
    const pooledW = Math.max(1, Math.floor(c.localGridSize / c.poolSize));
    const pooledPerBranch = pooledW * pooledW * c.numFilters;
    return c.agentStateSize + 2 * pooledPerBranch + (topKSlots | 0);
  }

  // Generate the RANDOM frozen parameters for the CNN front-end. Same
  // shape as cnnMultiscale.randomParams but uses the trainer's RNG so
  // the projection is deterministic per seed.
  function makeFrozenParams(cnnConfig, rng) {
    const n = CNN.paramCount(cnnConfig);
    const params = new Float64Array(n);
    // Same scale as cnnMultiscale.randomParams: small Gaussian-like
    // values centered around 0. Random conv kernels work best when
    // their variance roughly matches "He initialization" for ReLU
    // (sqrt(2/fan_in)), but for a fixed random projection that's not
    // going to be trained, a flat ±0.25 distribution works fine.
    for (let i = 0; i < n; i++) {
      // rng is the trainer's util Rng with .gauss(); fallback if absent.
      params[i] = (rng && rng.gauss) ? rng.gauss(0, 0.5) : (Math.random() - 0.5);
    }
    return params;
  }

  // Project a raw multi-scale obs into NEAT's input space:
  //   [agent state(4)] + [local pool] + [global pool] + [top-K (optional)]
  //
  // obs layout (from setups.js multiscale buildObservation):
  //   [agent(4)] [local(LG²)] [global(GG²)] [topK(K*4)]
  //
  // cnnResult is the full forward pass output; we just slice out
  // localPool and globalPool (already computed inside the forward).
  function projectForNeat(obs, cnnResult, cnnConfig, includeTopK, topKSlots) {
    const A = cnnConfig.agentStateSize;
    const LG = cnnConfig.localGridSize;
    const GG = cnnConfig.globalGridSize;
    const localPool  = cnnResult.localPool;
    const globalPool = cnnResult.globalPool;
    const topKOffset = A + LG * LG + GG * GG;
    const topKK      = includeTopK ? (topKSlots | 0) * 4 : 0;
    const total = A + localPool.length + globalPool.length + topKK;
    const projected = new Float64Array(total);
    let off = 0;
    for (let i = 0; i < A; i++) projected[off + i] = obs[i] || 0;
    off += A;
    for (let i = 0; i < localPool.length; i++)  projected[off + i] = localPool[i];
    off += localPool.length;
    for (let i = 0; i < globalPool.length; i++) projected[off + i] = globalPool[i];
    off += globalPool.length;
    if (includeTopK) {
      for (let i = 0; i < topKK; i++) {
        projected[off + i] = (obs[topKOffset + i] != null) ? obs[topKOffset + i] : 0;
      }
    }
    return projected;
  }

  // Policy adapter: a single object that LOOKS like a NEAT policy but
  // runs the frozen CNN first to compute the projected NEAT input.
  // Trainer-facing API mirrors BF.neat.policy().
  function policy(genome, frozenCnnParams, cnnConfig, opts) {
    opts = opts || {};
    const includeTopK = !!opts.includeTopK;
    const topKSlots = opts.topKSlots != null ? opts.topKSlots : 8;
    let lastTrace = null;
    let lastCnnResult = null;
    let lastProjected = null;
    function runForward(obs) {
      lastCnnResult = CNN.forward(frozenCnnParams, obs, cnnConfig);
      lastProjected = projectForNeat(obs, lastCnnResult, cnnConfig, includeTopK, topKSlots);
      lastTrace = N.evaluateGenome(genome, lastProjected);
    }
    return {
      genome: genome,
      // Frozen CNN intermediates -- exposed so the network panel can
      // render the CNN side of the hybrid (same architectural view as
      // pure cnn-multiscale).
      get lastTrace()       { return lastTrace; },
      get lastCnnResult()   { return lastCnnResult; },
      get lastProjected()   { return lastProjected; },
      get lastLocalImage()  { return lastCnnResult ? lastCnnResult.localImage  : null; },
      get lastGlobalImage() { return lastCnnResult ? lastCnnResult.globalImage : null; },
      get lastLocalConv()   { return lastCnnResult ? lastCnnResult.localConv   : null; },
      get lastGlobalConv()  { return lastCnnResult ? lastCnnResult.globalConv  : null; },
      get lastLocalPool()   { return lastCnnResult ? lastCnnResult.localPool   : null; },
      get lastGlobalPool()  { return lastCnnResult ? lastCnnResult.globalPool  : null; },
      command(obs) {
        runForward(obs);
        return lastTrace.outputs[0];
      },
      commandAll(obs, out) {
        runForward(obs);
        const n = lastTrace.outputs.length;
        if (!out || out.length < n) out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = lastTrace.outputs[i];
        return out;
      },
    };
  }

  BF.cnnNeatHybrid = {
    policy,
    makeFrozenParams,
    projectForNeat,
    projectedInputCount,           // 4-bullet legacy variant
    projectedInputCountWithTopK,   // dynamic K variant (preferred)
  };
})(window.BF);
