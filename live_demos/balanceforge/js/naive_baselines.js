// BalanceForge — Naive-but-reasonable baselines.
//
// Three "fundamentals of ML" baselines that share the same big idea —
//   estimate gradient → take a step → repeat —
// but estimate the gradient three different ways:
//
//   FD-GD:  Forward-difference gradient. Honest and slow — for an N-dim
//           problem, takes N+1 evaluations per gradient step. Each "probe"
//           is exactly +ε on one coord. Visually clean: you can see every
//           dimension being individually probed.
//   SPSA:   Simultaneous Perturbation Stochastic Approximation. 2 evals per
//           gradient estimate regardless of N (k pairs to reduce variance).
//           Random ±1 vector Δ; (f(μ+εΔ) − f(μ−εΔ)) / (2ε) gives a directional
//           derivative, which we use as a (noisy) full-gradient estimate.
//   NES:    Vanilla Natural Evolution Strategies / OpenAI-ES. Sample
//           population around μ with isotropic σ; standardize fitness;
//           gradient-of-mean update via REINFORCE-like trick. Closest to a
//           population algorithm of the three — but still a "single point that
//           moves" rather than competing candidates.
//
// FD-GD and SPSA both use *parallel backtracking line search* — given the
// estimated gradient, evaluate K candidate step sizes (α·1.4, α, α/2, α/4 …)
// in parallel and accept the largest that improves on the anchor. This is the
// visual hook: you can literally watch the line search reject too-large steps
// each generation, and watch α grow when you're on a smooth slope and shrink
// when you're near a plateau.
//
// All three share the same param-vector encoding as CMA-ES (delegated to
// BF.cmaes.paramCount / genomeFromParams).

(function (BF) {
  'use strict';

  function paramCount(numIn, numOut, hidden) {
    return BF.cmaes.paramCount(numIn, numOut, hidden);
  }
  function genomeFromParams(params, numIn, numOut, hidden) {
    return BF.cmaes.genomeFromParams(params, numIn, numOut, hidden);
  }

  // ============================================================ FD-GD =====
  // Population layout per gen:
  //   [0]                              anchor at μ (re-eval — tracks noise)
  //   [1 .. 1+gradSlots-1]             gradient probes: μ + ε·e_i
  //   [1+gradSlots .. 1+gradSlots+K-1] line-search candidates from previous gradient
  //
  // gradSlots = min(n, popSize − 1 − K). If gradSlots < n we do "stochastic
  // coordinate gradient" (random subset of dims each gen).

  function createFDGD(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      epsilon: opts.epsilon != null ? opts.epsilon : 0.05,
      alpha: opts.alphaInit != null ? opts.alphaInit : 0.05,
      alphaInit: opts.alphaInit != null ? opts.alphaInit : 0.05,
      alphaMin: opts.alphaMin != null ? opts.alphaMin : 1e-4,
      alphaMax: opts.alphaMax != null ? opts.alphaMax : 2.0,
      // Diagnostics used by the algo-internals chart and the line-search
      // panel:
      lastFitness:        null,    // f(μ) most recently observed
      lastGradient:       null,    // Float64Array — the estimated ∇f
      lastGradNorm:       null,    // ‖∇f‖ — line for algo-internals chart
      lastStepAlpha:      0,       // α we ultimately accepted (0 if none)
      lastAccepted:       false,
      lineSearchProbes:   [],      // [{alpha, fitness, accepted}] for last gen
      anchorFitness:      null,    // f(μ) before the step (line-search baseline)
      // Internal book-keeping for matching pop layout to update step:
      _dimsToProbe: null,
      _lineAlphas:  null,
      generation:   0,
    };
  }

  function fdgdReset(state) {
    state.mean = new Float64Array(state.n);
    state.alpha = state.alphaInit;
    state.lastFitness = null;
    state.lastGradient = null;
    state.lastGradNorm = null;
    state.lastStepAlpha = 0;
    state.lastAccepted = false;
    state.lineSearchProbes = [];
    state.anchorFitness = null;
    state._dimsToProbe = null;
    state._lineAlphas = null;
    state.generation = 0;
  }

  function fdgdSample(state, popSize, rng, builder) {
    const out = new Array(popSize);

    // Slot accounting: anchor + (line-search if we have a gradient) + gradient probes.
    const lineSlots = state.lastGradient && popSize >= 4
      ? Math.min(4, Math.max(1, popSize - 2)) : 0;
    let gradSlots = popSize - 1 - lineSlots;
    gradSlots = Math.max(1, Math.min(gradSlots, state.n));

    // Dims to probe — full coverage when budget allows, random subset otherwise.
    const dims = [];
    if (gradSlots >= state.n) {
      for (let i = 0; i < state.n; i++) dims.push(i);
    } else {
      const pool = [];
      for (let i = 0; i < state.n; i++) pool.push(i);
      for (let k = 0; k < gradSlots; k++) {
        const idx = k + Math.floor(rng.next() * (pool.length - k));
        const t = pool[k]; pool[k] = pool[idx]; pool[idx] = t;
        dims.push(pool[k]);
      }
    }
    state._dimsToProbe = dims;

    // [0] anchor.
    const anchor = new Float64Array(state.mean);
    out[0] = { params: anchor, genome: builder(anchor), fitness: 0 };

    // [1..gradSlots] forward-difference probes.
    for (let k = 0; k < dims.length; k++) {
      const probe = new Float64Array(state.mean);
      probe[dims[k]] += state.epsilon;
      out[1 + k] = { params: probe, genome: builder(probe), fitness: 0 };
    }

    // Line-search candidates (only when we have a gradient from last gen).
    state._lineAlphas = [];
    if (state.lastGradient && lineSlots > 0) {
      // α·1.4 first (try to grow on smooth slope), then halving sequence.
      const schedule = [state.alpha * 1.4];
      let a = state.alpha;
      while (schedule.length < lineSlots) { schedule.push(a); a /= 2; }
      schedule.length = lineSlots;
      for (let k = 0; k < lineSlots; k++) {
        const a_k = schedule[k];
        const cand = new Float64Array(state.n);
        for (let j = 0; j < state.n; j++) cand[j] = state.mean[j] + a_k * state.lastGradient[j];
        out[1 + dims.length + k] = { params: cand, genome: builder(cand), fitness: 0 };
        state._lineAlphas.push(a_k);
      }
    }

    // Pad any leftover slots with anchor clones.
    for (let k = 1 + dims.length + state._lineAlphas.length; k < popSize; k++) {
      const fill = new Float64Array(state.mean);
      out[k] = { params: fill, genome: builder(fill), fitness: 0 };
    }
    return out;
  }

  function fdgdUpdate(state, evaluatedPop) {
    const anchorF = evaluatedPop[0].fitness;
    state.anchorFitness = anchorF;
    state.lastFitness = anchorF;

    const dims = state._dimsToProbe || [];
    const gradient = new Float64Array(state.n);
    for (let k = 0; k < dims.length; k++) {
      const idx = 1 + k;
      if (idx >= evaluatedPop.length) break;
      const f = evaluatedPop[idx].fitness;
      gradient[dims[k]] = (f - anchorF) / state.epsilon;
    }
    state.lastGradient = gradient;

    let g2 = 0;
    for (let j = 0; j < state.n; j++) g2 += gradient[j] * gradient[j];
    state.lastGradNorm = Math.sqrt(g2);

    // Line-search probes.
    const alphas = state._lineAlphas || [];
    state.lineSearchProbes = [];
    let bestK = -1;
    let bestF = anchorF;
    for (let k = 0; k < alphas.length; k++) {
      const idx = 1 + dims.length + k;
      if (idx >= evaluatedPop.length) break;
      const f = evaluatedPop[idx].fitness;
      state.lineSearchProbes.push({ alpha: alphas[k], fitness: f, accepted: false });
      if (f > bestF) { bestF = f; bestK = k; }
    }

    if (bestK >= 0) {
      const a = alphas[bestK];
      for (let j = 0; j < state.n; j++) state.mean[j] += a * gradient[j];
      state.alpha = Math.min(state.alphaMax, a * 1.1);  // grow slowly
      state.lastStepAlpha = a;
      state.lastAccepted = true;
      state.lineSearchProbes[bestK].accepted = true;
      state.lastFitness = bestF;
    } else if (alphas.length > 0) {
      state.alpha = Math.max(state.alphaMin, state.alpha / 2);
      state.lastStepAlpha = 0;
      state.lastAccepted = false;
    } else {
      // First gen — no line search yet. Take a default step in ∇ direction
      // so we make some progress now (otherwise we burn a whole gen on the
      // anchor + probes with no μ movement).
      const a = state.alpha;
      for (let j = 0; j < state.n; j++) state.mean[j] += a * gradient[j];
      state.lastStepAlpha = a;
      state.lastAccepted = true;
    }
    state.generation++;
  }

  // ============================================================= SPSA =====
  // Population layout per gen:
  //   [0]                              anchor at μ
  //   [1 .. 2K]                        K perturbation pairs: (μ+εΔ_i, μ−εΔ_i)
  //   [1+2K .. popSize-1]              line-search candidates

  function createSPSA(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      epsilon: opts.epsilon != null ? opts.epsilon : 0.05,
      alpha: opts.alphaInit != null ? opts.alphaInit : 0.05,
      alphaInit: opts.alphaInit != null ? opts.alphaInit : 0.05,
      alphaMin: opts.alphaMin != null ? opts.alphaMin : 1e-4,
      alphaMax: opts.alphaMax != null ? opts.alphaMax : 2.0,
      lastFitness:      null,
      lastGradient:     null,
      lastGradNorm:     null,
      lastStepAlpha:    0,
      lastAccepted:     false,
      lineSearchProbes: [],
      anchorFitness:    null,
      _perturbations: null,
      _lineAlphas:    null,
      generation:     0,
    };
  }

  function spsaReset(state) {
    state.mean = new Float64Array(state.n);
    state.alpha = state.alphaInit;
    state.lastFitness = null;
    state.lastGradient = null;
    state.lastGradNorm = null;
    state.lastStepAlpha = 0;
    state.lastAccepted = false;
    state.lineSearchProbes = [];
    state.anchorFitness = null;
    state._perturbations = null;
    state._lineAlphas = null;
    state.generation = 0;
  }

  function spsaSample(state, popSize, rng, builder) {
    const out = new Array(popSize);

    const lineSlots = state.lastGradient && popSize >= 4
      ? Math.min(4, Math.max(0, popSize - 3)) : 0;
    const probeBudget = popSize - 1 - lineSlots;
    const numPairs = Math.max(1, Math.floor(probeBudget / 2));

    const anchor = new Float64Array(state.mean);
    out[0] = { params: anchor, genome: builder(anchor), fitness: 0 };

    state._perturbations = [];
    let outIdx = 1;
    for (let k = 0; k < numPairs && outIdx + 1 < popSize; k++) {
      const delta = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) delta[j] = rng.next() < 0.5 ? -1 : 1;
      state._perturbations.push(delta);
      const plus  = new Float64Array(state.n);
      const minus = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        plus[j]  = state.mean[j] + state.epsilon * delta[j];
        minus[j] = state.mean[j] - state.epsilon * delta[j];
      }
      out[outIdx++] = { params: plus,  genome: builder(plus),  fitness: 0 };
      out[outIdx++] = { params: minus, genome: builder(minus), fitness: 0 };
    }

    state._lineAlphas = [];
    if (state.lastGradient && lineSlots > 0) {
      const schedule = [state.alpha * 1.4];
      let a = state.alpha;
      while (schedule.length < lineSlots) { schedule.push(a); a /= 2; }
      schedule.length = lineSlots;
      for (let k = 0; k < lineSlots && outIdx < popSize; k++) {
        const a_k = schedule[k];
        const cand = new Float64Array(state.n);
        for (let j = 0; j < state.n; j++) cand[j] = state.mean[j] + a_k * state.lastGradient[j];
        out[outIdx++] = { params: cand, genome: builder(cand), fitness: 0 };
        state._lineAlphas.push(a_k);
      }
    }

    while (outIdx < popSize) {
      const fill = new Float64Array(state.mean);
      out[outIdx++] = { params: fill, genome: builder(fill), fitness: 0 };
    }
    return out;
  }

  function spsaUpdate(state, evaluatedPop) {
    const anchorF = evaluatedPop[0].fitness;
    state.anchorFitness = anchorF;
    state.lastFitness = anchorF;

    const pairs = state._perturbations || [];
    const gradient = new Float64Array(state.n);
    let usedPairs = 0;
    for (let k = 0; k < pairs.length; k++) {
      const idxPlus  = 1 + 2 * k;
      const idxMinus = idxPlus + 1;
      if (idxMinus >= evaluatedPop.length) break;
      const fPlus  = evaluatedPop[idxPlus].fitness;
      const fMinus = evaluatedPop[idxMinus].fitness;
      const factor = (fPlus - fMinus) / (2 * state.epsilon);
      const delta = pairs[k];
      // Δ_j ∈ {±1} so 1/Δ_j == Δ_j. SPSA gradient component is factor * Δ_j.
      for (let j = 0; j < state.n; j++) gradient[j] += factor * delta[j];
      usedPairs++;
    }
    if (usedPairs > 0) for (let j = 0; j < state.n; j++) gradient[j] /= usedPairs;
    state.lastGradient = gradient;

    let g2 = 0;
    for (let j = 0; j < state.n; j++) g2 += gradient[j] * gradient[j];
    state.lastGradNorm = Math.sqrt(g2);

    const alphas = state._lineAlphas || [];
    state.lineSearchProbes = [];
    let bestK = -1;
    let bestF = anchorF;
    const lineStart = 1 + 2 * usedPairs;
    for (let k = 0; k < alphas.length; k++) {
      const idx = lineStart + k;
      if (idx >= evaluatedPop.length) break;
      const f = evaluatedPop[idx].fitness;
      state.lineSearchProbes.push({ alpha: alphas[k], fitness: f, accepted: false });
      if (f > bestF) { bestF = f; bestK = k; }
    }

    if (bestK >= 0) {
      const a = alphas[bestK];
      for (let j = 0; j < state.n; j++) state.mean[j] += a * gradient[j];
      state.alpha = Math.min(state.alphaMax, a * 1.1);
      state.lastStepAlpha = a;
      state.lastAccepted = true;
      state.lineSearchProbes[bestK].accepted = true;
      state.lastFitness = bestF;
    } else if (alphas.length > 0) {
      state.alpha = Math.max(state.alphaMin, state.alpha / 2);
      state.lastStepAlpha = 0;
      state.lastAccepted = false;
    } else if (usedPairs > 0) {
      // First gen: no line search. Take a default α step.
      const a = state.alpha;
      for (let j = 0; j < state.n; j++) state.mean[j] += a * gradient[j];
      state.lastStepAlpha = a;
      state.lastAccepted = true;
    }
    state.generation++;
  }

  // =============================================================== NES ====
  // Vanilla NES / OpenAI-ES: sample population around μ with isotropic σ,
  // standardize fitness, REINFORCE update on μ.

  function createNES(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      sigmaInit: opts.sigma != null ? opts.sigma : 0.3,
      learningRate: opts.learningRate != null ? opts.learningRate : 0.1,
      lastFitness:  null,
      lastGradient: null,
      lastGradNorm: null,
      _perturbations: null,
      generation: 0,
    };
  }

  function nesReset(state) {
    state.mean = new Float64Array(state.n);
    state.sigma = state.sigmaInit;
    state.lastFitness = null;
    state.lastGradient = null;
    state.lastGradNorm = null;
    state._perturbations = null;
    state.generation = 0;
  }

  function nesSample(state, popSize, rng, builder) {
    const out = new Array(popSize);
    state._perturbations = [];
    for (let i = 0; i < popSize; i++) {
      const z = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) z[j] = rng.gauss(0, 1);
      state._perturbations.push(z);
      const params = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) params[j] = state.mean[j] + state.sigma * z[j];
      out[i] = { params: params, genome: builder(params), fitness: 0 };
    }
    return out;
  }

  function nesUpdate(state, evaluatedPop) {
    const N = evaluatedPop.length;
    if (N === 0) return;

    let m = 0;
    for (const ind of evaluatedPop) m += ind.fitness;
    m /= N;
    let ss = 0;
    for (const ind of evaluatedPop) ss += (ind.fitness - m) * (ind.fitness - m);
    const std = Math.sqrt(ss / Math.max(1, N - 1)) || 1;

    const gradient = new Float64Array(state.n);
    for (let k = 0; k < N; k++) {
      const F = (evaluatedPop[k].fitness - m) / std;  // standardized advantage
      const z = state._perturbations[k];
      for (let j = 0; j < state.n; j++) gradient[j] += F * z[j];
    }
    // Natural gradient estimate is (1 / Nσ) Σ F_i z_i (for isotropic σ).
    for (let j = 0; j < state.n; j++) gradient[j] /= (N * state.sigma);

    let g2 = 0;
    for (let j = 0; j < state.n; j++) g2 += gradient[j] * gradient[j];
    state.lastGradNorm = Math.sqrt(g2);

    // Update — α · σ · gradient (the σ factor matches OpenAI-ES update form).
    for (let j = 0; j < state.n; j++) {
      state.mean[j] += state.learningRate * state.sigma * gradient[j];
    }

    state.lastFitness = m;
    state.lastGradient = gradient;
    state.generation++;
  }

  // ============================================================== Adam ====
  // Adam = SPSA-style gradient estimate + the canonical Adam update
  // (Kingma & Ba 2014). The gradient is estimated the same way SPSA does
  // -- N Bernoulli ±1 perturbation pairs averaged -- but the parameter
  // update uses Adam's per-dim adaptive step instead of a global line
  // search. Each parameter has its own momentum-style first-moment
  // (m) and squared-grad second-moment (v) accumulators, then the
  // bias-corrected ratio (m_hat / sqrt(v_hat)) drives the step size
  // per dimension. The result: stronger steps along consistently
  // signed gradient directions, smaller steps where the gradient
  // estimate is noisy. Pairs nicely with our high-variance SPSA
  // gradient because Adam's v_hat scaling implicitly down-weights
  // dimensions where the gradient estimate is unreliable.

  function createAdam(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      // Adam moments (lazy-zero-init Float64Arrays).
      m: new Float64Array(n),
      v: new Float64Array(n),
      t: 0,            // step counter (for bias correction)
      // Hyperparameters. Defaults track the original Kingma-Ba paper
      // (α=0.001 there; we use 0.05 because our per-step gradient has
      // much larger magnitude than typical NN training).
      learningRate: opts.learningRate != null ? opts.learningRate : 0.05,
      beta1:        opts.beta1        != null ? opts.beta1        : 0.9,
      beta2:        opts.beta2        != null ? opts.beta2        : 0.999,
      eps:          opts.eps          != null ? opts.eps          : 1e-8,
      // SPSA-style gradient probe perturbation size.
      epsilon:      opts.epsilon      != null ? opts.epsilon      : 0.05,
      lastFitness:  null,
      lastGradient: null,
      lastGradNorm: null,
      _perturbations: null,
      generation: 0,
    };
  }

  function adamReset(state) {
    state.mean = new Float64Array(state.n);
    state.m = new Float64Array(state.n);
    state.v = new Float64Array(state.n);
    state.t = 0;
    state.lastFitness = null;
    state.lastGradient = null;
    state.lastGradNorm = null;
    state._perturbations = null;
    state.generation = 0;
  }

  function adamSample(state, popSize, rng, builder) {
    const out = new Array(popSize);
    // Slot 0 is the anchor (no perturbation), then 2 per gradient pair.
    // Adam doesn't need line-search probes -- the adaptive step is
    // entirely from the m / v moments -- so the whole budget after
    // the anchor goes to ± perturbation pairs for a better gradient
    // estimate.
    const probeBudget = popSize - 1;
    const numPairs = Math.max(1, Math.floor(probeBudget / 2));

    const anchor = new Float64Array(state.mean);
    out[0] = { params: anchor, genome: builder(anchor), fitness: 0 };

    state._perturbations = [];
    let outIdx = 1;
    for (let k = 0; k < numPairs && outIdx + 1 < popSize; k++) {
      const delta = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) delta[j] = rng.next() < 0.5 ? -1 : 1;
      state._perturbations.push(delta);
      const plus  = new Float64Array(state.n);
      const minus = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        plus[j]  = state.mean[j] + state.epsilon * delta[j];
        minus[j] = state.mean[j] - state.epsilon * delta[j];
      }
      out[outIdx++] = { params: plus,  genome: builder(plus),  fitness: 0 };
      out[outIdx++] = { params: minus, genome: builder(minus), fitness: 0 };
    }
    while (outIdx < popSize) {
      const fill = new Float64Array(state.mean);
      out[outIdx++] = { params: fill, genome: builder(fill), fitness: 0 };
    }
    return out;
  }

  function adamUpdate(state, evaluatedPop) {
    const anchorF = evaluatedPop[0].fitness;
    state.lastFitness = anchorF;
    const pairs = state._perturbations || [];
    const gradient = new Float64Array(state.n);
    let usedPairs = 0;
    for (let k = 0; k < pairs.length; k++) {
      const idxPlus  = 1 + 2 * k;
      const idxMinus = idxPlus + 1;
      if (idxMinus >= evaluatedPop.length) break;
      const fPlus  = evaluatedPop[idxPlus].fitness;
      const fMinus = evaluatedPop[idxMinus].fitness;
      const factor = (fPlus - fMinus) / (2 * state.epsilon);
      const delta = pairs[k];
      for (let j = 0; j < state.n; j++) gradient[j] += factor * delta[j];
      usedPairs++;
    }
    if (usedPairs > 0) for (let j = 0; j < state.n; j++) gradient[j] /= usedPairs;
    state.lastGradient = gradient;
    let g2 = 0;
    for (let j = 0; j < state.n; j++) g2 += gradient[j] * gradient[j];
    state.lastGradNorm = Math.sqrt(g2);
    // Adam update (gradient ascent on fitness, so + not -).
    state.t += 1;
    const b1 = state.beta1, b2 = state.beta2;
    const b1t = 1 - Math.pow(b1, state.t);
    const b2t = 1 - Math.pow(b2, state.t);
    for (let j = 0; j < state.n; j++) {
      const g = gradient[j];
      state.m[j] = b1 * state.m[j] + (1 - b1) * g;
      state.v[j] = b2 * state.v[j] + (1 - b2) * g * g;
      const mHat = state.m[j] / b1t;
      const vHat = state.v[j] / b2t;
      state.mean[j] += state.learningRate * mHat / (Math.sqrt(vHat) + state.eps);
    }
    state.generation++;
  }

  // ============================================================== L-BFGS ===
  // Limited-memory BFGS quasi-Newton method (Nocedal 1980). Same SPSA-
  // style gradient estimate as Adam / SPSA / NES, but the search
  // direction is H^(-1) g where H is an implicit approximation of the
  // Hessian. The "limited memory" trick: instead of storing the full
  // n x n Hessian, keep the last m pairs of (s_k, y_k) where
  //   s_k = x_{k+1} - x_k  (param step)
  //   y_k = g_{k+1} - g_k  (gradient change)
  // and compute H^(-1) g via Nocedal's two-loop recursion -- O(mn) per
  // step instead of O(n^2). The classical strong baseline for smooth
  // optimization; bridges the gap between gradient-only (FD-GD, SPSA,
  // Adam) and second-order methods.
  //
  // For maximization (gradient ASCENT), the search direction is +H^(-1)g
  // (not -H^(-1)g as in classical L-BFGS minimization). Curvature
  // check: y_k . s_k > 0 must hold; we skip the history update when it
  // doesn't (common when the SPSA gradient estimate is too noisy).

  function createLBFGS(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      epsilon: opts.epsilon != null ? opts.epsilon : 0.05,
      alpha: opts.alphaInit != null ? opts.alphaInit : 0.05,
      alphaInit: opts.alphaInit != null ? opts.alphaInit : 0.05,
      alphaMin: opts.alphaMin != null ? opts.alphaMin : 1e-4,
      alphaMax: opts.alphaMax != null ? opts.alphaMax : 2.0,
      m: opts.m != null ? opts.m : 10,    // history size (typical 5-20)
      sHistory: [],     // s_k = x_{k+1} - x_k entries
      yHistory: [],     // y_k = g_{k+1} - g_k entries
      rhoHistory: [],   // ρ_k = 1 / (y_k · s_k)
      _prevGradient: null,    // g_k from last gen (for y_k computation)
      _prevMean:     null,    // x_k from last gen (for s_k computation)
      lastGradient: null,
      lastGradNorm: null,
      lastStepAlpha: 0,
      lastAccepted: false,
      _perturbations: null,
      _lineAlphas:    null,
      _searchDir:     null,   // cached direction so sampleParams can probe along it
      lineSearchProbes: [],
      anchorFitness:    null,
      generation: 0,
    };
  }

  function lbfgsReset(state) {
    state.mean = new Float64Array(state.n);
    state.alpha = state.alphaInit;
    state.sHistory = [];
    state.yHistory = [];
    state.rhoHistory = [];
    state._prevGradient = null;
    state._prevMean = null;
    state.lastGradient = null;
    state.lastGradNorm = null;
    state.lastStepAlpha = 0;
    state.lastAccepted = false;
    state._perturbations = null;
    state._lineAlphas = null;
    state._searchDir = null;
    state.lineSearchProbes = [];
    state.anchorFitness = null;
    state.generation = 0;
  }

  // Two-loop recursion to compute r = H^(-1) g where H is the implicit
  // L-BFGS Hessian approximation built from the (s, y) history. See
  // Nocedal & Wright "Numerical Optimization", Algorithm 7.4.
  function lbfgsDirection(state, g) {
    const n = state.n;
    const m = state.sHistory.length;
    const q = new Float64Array(n);
    for (let j = 0; j < n; j++) q[j] = g[j];
    const alphaArr = new Float64Array(m);
    // First loop (backward).
    for (let i = m - 1; i >= 0; i--) {
      const s = state.sHistory[i], y = state.yHistory[i], rho = state.rhoHistory[i];
      let sq = 0;
      for (let j = 0; j < n; j++) sq += s[j] * q[j];
      const a = rho * sq;
      alphaArr[i] = a;
      for (let j = 0; j < n; j++) q[j] -= a * y[j];
    }
    // Initial Hessian scaling: H_0 = γ * I where γ = (s_{m-1} · y_{m-1}) / (y · y).
    let gamma = 1;
    if (m > 0) {
      const sLast = state.sHistory[m - 1], yLast = state.yHistory[m - 1];
      let sy = 0, yy = 0;
      for (let j = 0; j < n; j++) { sy += sLast[j] * yLast[j]; yy += yLast[j] * yLast[j]; }
      if (yy > 1e-12) gamma = sy / yy;
    }
    const r = new Float64Array(n);
    for (let j = 0; j < n; j++) r[j] = gamma * q[j];
    // Second loop (forward).
    for (let i = 0; i < m; i++) {
      const s = state.sHistory[i], y = state.yHistory[i], rho = state.rhoHistory[i];
      let yr = 0;
      for (let j = 0; j < n; j++) yr += y[j] * r[j];
      const b = rho * yr;
      const delta = alphaArr[i] - b;
      for (let j = 0; j < n; j++) r[j] += s[j] * delta;
    }
    return r;
  }

  function lbfgsSample(state, popSize, rng, builder) {
    const out = new Array(popSize);
    // Same population layout as SPSA: anchor + ± perturbation pairs +
    // line-search probes along the L-BFGS direction (when available).
    const lineSlots = state._searchDir && popSize >= 4
      ? Math.min(4, Math.max(0, popSize - 3)) : 0;
    const probeBudget = popSize - 1 - lineSlots;
    const numPairs = Math.max(1, Math.floor(probeBudget / 2));

    const anchor = new Float64Array(state.mean);
    out[0] = { params: anchor, genome: builder(anchor), fitness: 0 };

    state._perturbations = [];
    let outIdx = 1;
    for (let k = 0; k < numPairs && outIdx + 1 < popSize; k++) {
      const delta = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) delta[j] = rng.next() < 0.5 ? -1 : 1;
      state._perturbations.push(delta);
      const plus  = new Float64Array(state.n);
      const minus = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        plus[j]  = state.mean[j] + state.epsilon * delta[j];
        minus[j] = state.mean[j] - state.epsilon * delta[j];
      }
      out[outIdx++] = { params: plus,  genome: builder(plus),  fitness: 0 };
      out[outIdx++] = { params: minus, genome: builder(minus), fitness: 0 };
    }

    state._lineAlphas = [];
    if (state._searchDir && lineSlots > 0) {
      const dir = state._searchDir;
      const schedule = [state.alpha * 1.4];
      let a = state.alpha;
      while (schedule.length < lineSlots) { schedule.push(a); a /= 2; }
      schedule.length = lineSlots;
      for (let k = 0; k < lineSlots && outIdx < popSize; k++) {
        const a_k = schedule[k];
        const cand = new Float64Array(state.n);
        for (let j = 0; j < state.n; j++) cand[j] = state.mean[j] + a_k * dir[j];
        out[outIdx++] = { params: cand, genome: builder(cand), fitness: 0 };
        state._lineAlphas.push(a_k);
      }
    }
    while (outIdx < popSize) {
      const fill = new Float64Array(state.mean);
      out[outIdx++] = { params: fill, genome: builder(fill), fitness: 0 };
    }
    return out;
  }

  function lbfgsUpdate(state, evaluatedPop) {
    const n = state.n;
    const anchorF = evaluatedPop[0].fitness;
    state.anchorFitness = anchorF;
    // ----- Gradient estimate (averaged SPSA pairs) -----
    const pairs = state._perturbations || [];
    const gradient = new Float64Array(n);
    let usedPairs = 0;
    for (let k = 0; k < pairs.length; k++) {
      const idxPlus  = 1 + 2 * k;
      const idxMinus = idxPlus + 1;
      if (idxMinus >= evaluatedPop.length) break;
      const fPlus  = evaluatedPop[idxPlus].fitness;
      const fMinus = evaluatedPop[idxMinus].fitness;
      const factor = (fPlus - fMinus) / (2 * state.epsilon);
      const delta = pairs[k];
      for (let j = 0; j < n; j++) gradient[j] += factor * delta[j];
      usedPairs++;
    }
    if (usedPairs > 0) for (let j = 0; j < n; j++) gradient[j] /= usedPairs;
    state.lastGradient = gradient;
    let g2 = 0;
    for (let j = 0; j < n; j++) g2 += gradient[j] * gradient[j];
    state.lastGradNorm = Math.sqrt(g2);
    // ----- Lazy history update (using previous step's data) -----
    // L-BFGS needs y_k = g_{k+1} - g_k AND s_k = x_{k+1} - x_k. We have
    // g_{k+1} now (current gradient); g_k and x_k were stashed last gen.
    if (state._prevGradient && state._prevMean) {
      const sk = new Float64Array(n), yk = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        sk[j] = state.mean[j] - state._prevMean[j];
        yk[j] = gradient[j] - state._prevGradient[j];
      }
      // Curvature check: y . s > eps. Required for positive-definite H
      // approximation. Skip when SPSA noise inverts curvature.
      let sy = 0;
      for (let j = 0; j < n; j++) sy += sk[j] * yk[j];
      if (sy > 1e-10) {
        state.sHistory.push(sk);
        state.yHistory.push(yk);
        state.rhoHistory.push(1 / sy);
        while (state.sHistory.length > state.m) {
          state.sHistory.shift(); state.yHistory.shift(); state.rhoHistory.shift();
        }
      }
    }
    // ----- Compute search direction: r = H^(-1) g -----
    const direction = lbfgsDirection(state, gradient);
    state._searchDir = direction;
    // ----- Line-search accept/reject (probes were sampled along the
    // PREVIOUS gen's direction; on this update we score them.) -----
    const alphas = state._lineAlphas || [];
    state.lineSearchProbes = [];
    let bestK = -1, bestF = anchorF;
    const lineStart = 1 + 2 * usedPairs;
    for (let k = 0; k < alphas.length; k++) {
      const idx = lineStart + k;
      if (idx >= evaluatedPop.length) break;
      const f = evaluatedPop[idx].fitness;
      state.lineSearchProbes.push({ alpha: alphas[k], fitness: f, accepted: false });
      if (f > bestF) { bestF = f; bestK = k; }
    }
    // ----- Step. Use the best line-search alpha if any improved; else
    // take a default α step along the new direction. -----
    state._prevMean = new Float64Array(state.mean);
    state._prevGradient = new Float64Array(gradient);
    if (bestK >= 0) {
      // The accepted probe was sampled with the PREVIOUS direction. The
      // new direction was just computed; the trainer will use it for
      // next gen's line-search probes via state._searchDir.
      // For the parameter update itself, we accept the probe's params
      // directly (it already represents mean + alpha * prev_direction).
      const a = alphas[bestK];
      // The probe was at mean + a*prev_dir, which we don't track
      // explicitly; reconstruct from the eval pop's params.
      const probeIdx = lineStart + bestK;
      const probeParams = evaluatedPop[probeIdx].params;
      state.mean = new Float64Array(probeParams);
      state.alpha = Math.min(state.alphaMax, a * 1.1);
      state.lastStepAlpha = a;
      state.lastAccepted = true;
      state.lineSearchProbes[bestK].accepted = true;
    } else if (alphas.length > 0) {
      // Line search failed; shrink alpha and step along the NEW direction
      // by a fraction of the shrunken alpha.
      state.alpha = Math.max(state.alphaMin, state.alpha / 2);
      const a = state.alpha;
      for (let j = 0; j < n; j++) state.mean[j] += a * direction[j];
      state.lastStepAlpha = a;
      state.lastAccepted = false;
    } else if (usedPairs > 0) {
      // First gen: take a default α step along the freshly computed direction.
      const a = state.alpha;
      for (let j = 0; j < n; j++) state.mean[j] += a * direction[j];
      state.lastStepAlpha = a;
      state.lastAccepted = true;
    }
    state.generation++;
  }

  // ============================================================== xNES =====
  // Exponential Natural Evolution Strategy (Glasmachers et al. 2010)
  // with DIAGONAL scale. Sister algorithm to NES / OpenAI-ES but uses
  // a *multiplicative* update on σ via exp() of the second-moment
  // utility gradient, keeping σ positive by construction. Closer to
  // CMA-ES in convergence behavior (adapts per-dim variance) but
  // gradient-driven instead of covariance-driven, so the math is
  // simpler and there's no eigendecomp.
  //
  // Key knobs (Glasmachers paper defaults):
  //   η_μ = 1
  //   η_σ = (3 + ln n) / (5 sqrt(n))   -- scales down with dim
  //   utility weights: rank-based shaped, sum-zero (centered)

  function createXNES(numIn, numOut, hidden, opts) {
    opts = opts || {};
    const n = paramCount(numIn, numOut, hidden);
    const sigmaInit = opts.sigma != null ? opts.sigma : 0.3;
    const sigma = new Float64Array(n);
    for (let j = 0; j < n; j++) sigma[j] = sigmaInit;
    return {
      n: n,
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      mean: new Float64Array(n),
      // Per-dim scale (diagonal of covariance sqrt). Multiplicative
      // exp() updates keep these strictly positive.
      sigma: sigma,
      sigmaInit: sigmaInit,
      // Glasmachers defaults.
      etaMu:    opts.etaMu    != null ? opts.etaMu    : 1.0,
      etaSigma: opts.etaSigma != null ? opts.etaSigma : (3 + Math.log(n)) / (5 * Math.sqrt(n)),
      _perturbations: null,
      lastFitness:  null,
      lastGradient: null,
      lastGradNorm: null,
      generation: 0,
    };
  }

  function xnesReset(state) {
    state.mean = new Float64Array(state.n);
    for (let j = 0; j < state.n; j++) state.sigma[j] = state.sigmaInit;
    state._perturbations = null;
    state.lastFitness = null;
    state.lastGradient = null;
    state.lastGradNorm = null;
    state.generation = 0;
  }

  function xnesSample(state, popSize, rng, builder) {
    const out = new Array(popSize);
    state._perturbations = [];
    for (let i = 0; i < popSize; i++) {
      const z = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) z[j] = rng.gauss(0, 1);
      state._perturbations.push(z);
      const params = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) params[j] = state.mean[j] + state.sigma[j] * z[j];
      out[i] = { params: params, genome: builder(params), fitness: 0 };
    }
    return out;
  }

  function xnesUpdate(state, evaluatedPop) {
    const N = evaluatedPop.length;
    if (N === 0) return;
    // Rank-based utility weights (Glasmachers eq 5): u_i = max(0,
    // log(λ/2 + 1) - log(i+1)) / sum_max, then SHIFTED to sum zero.
    const ranked = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const halfLam = N / 2 + 1;
    const raw = new Float64Array(N);
    let sumRaw = 0;
    for (let i = 0; i < N; i++) {
      const r = Math.max(0, Math.log(halfLam) - Math.log(i + 1));
      raw[i] = r;
      sumRaw += r;
    }
    const utilities = new Float64Array(N);
    if (sumRaw > 0) {
      for (let i = 0; i < N; i++) utilities[i] = raw[i] / sumRaw - 1 / N;
    }
    // Map ranked indices back to original perturbation indices.
    const indexOf = new Map();
    for (let i = 0; i < N; i++) indexOf.set(evaluatedPop[i], i);
    // Gradient estimates.
    const n = state.n;
    const gMu = new Float64Array(n);
    const gSigma = new Float64Array(n);
    for (let r = 0; r < N; r++) {
      const u = utilities[r];
      const zIdx = indexOf.get(ranked[r]);
      const z = state._perturbations[zIdx];
      for (let j = 0; j < n; j++) {
        gMu[j]    += u * z[j];
        gSigma[j] += u * (z[j] * z[j] - 1);
      }
    }
    // Updates: μ moves linearly, σ moves multiplicatively (exp()).
    // The multiplicative form is what makes xNES robust at very small σ:
    // a multiplicative scale never collapses to zero by accident.
    const etaMu = state.etaMu, etaSig = state.etaSigma;
    for (let j = 0; j < n; j++) {
      state.mean[j] += etaMu * state.sigma[j] * gMu[j];
      state.sigma[j] *= Math.exp(0.5 * etaSig * gSigma[j]);
      // Guard against runaway.
      if (state.sigma[j] > 1e3) state.sigma[j] = 1e3;
      if (state.sigma[j] < 1e-6) state.sigma[j] = 1e-6;
    }
    // Diagnostics: ‖gradient‖ = ‖gMu‖.
    let g2 = 0;
    for (let j = 0; j < n; j++) g2 += gMu[j] * gMu[j];
    state.lastGradient = gMu;
    state.lastGradNorm = Math.sqrt(g2);
    let m = 0;
    for (const ind of evaluatedPop) m += ind.fitness;
    state.lastFitness = m / N;
    state.generation++;
  }

  // ----- Public API ---------------------------------------------------------
  BF.fdgd = {
    create: createFDGD, reset: fdgdReset, sample: fdgdSample, update: fdgdUpdate,
    paramCount, genomeFromParams,
  };
  BF.spsa = {
    create: createSPSA, reset: spsaReset, sample: spsaSample, update: spsaUpdate,
    paramCount, genomeFromParams,
  };
  BF.nes = {
    create: createNES, reset: nesReset, sample: nesSample, update: nesUpdate,
    paramCount, genomeFromParams,
  };
  BF.adam = {
    create: createAdam, reset: adamReset, sample: adamSample, update: adamUpdate,
    paramCount, genomeFromParams,
  };
  BF.lbfgs = {
    create: createLBFGS, reset: lbfgsReset, sample: lbfgsSample, update: lbfgsUpdate,
    paramCount, genomeFromParams,
  };
  BF.xnes = {
    create: createXNES, reset: xnesReset, sample: xnesSample, update: xnesUpdate,
    paramCount, genomeFromParams,
  };
})(window.BF);
