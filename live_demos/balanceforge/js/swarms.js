// BalanceForge — Swarm / nature-inspired metaheuristics.
//
// Seven algorithms in one file because they're conceptual neighbors and share
// nearly all of their plumbing (CMA-ES param encoding, PSO-style population
// of individuals each carrying their own params + extra state). Listed in
// rough order of "how visually distinct from PSO":
//
//   Cuckoo Search:   Lévy-flight random walks. Most steps are small, but
//                    occasional heavy-tailed jumps cover dramatic ground.
//                    Visible in PCA as punctuated long-range jumps.
//   Whale Opt. (WOA):Bubble-net hunting — spiral approach to the best whale,
//                    plus encirclement and exploration phases.
//   Fish Swarm (AFSA):Each fish picks one of {prey, swarm, follow, random}
//                    each step based on local density (crowding factor).
//                    Per-individual behavior tag stays as a render hint.
//   Grey Wolf (GWO): Three "leader" wolves α/β/δ; every other wolf updates
//                    toward their weighted mean. Hierarchy visible in viz.
//   ACO_R (continuous ACO): Maintain a pheromone-weighted archive; sample
//                    new solutions by picking a guide and perturbing.
//   Firefly:         Each firefly attracted toward every brighter firefly,
//                    attraction decaying exponentially with distance.
//   Bat:             Frequency-driven velocity + random local walk modulated
//                    by per-bat loudness and pulse rate.
//
// All seven share the same param encoding as CMA-ES (delegated to
// BF.cmaes.paramCount / genomeFromParams). All seven follow the
//   create() / reset() / initialPopulation() / stepSwarm()
// pattern — analogous to BF.pso.* in pso.js.
//
// CRITIQUE NOTE: there's a vocal critique of the post-2000 nature-inspired
// metaheuristic zoo (Sörensen 2015 "Metaheuristics — the metaphor exposed")
// arguing that most of these algorithms are mechanistically very similar to
// PSO, with the metaphor doing more work than the math. The implementations
// here aim to expose the genuinely-distinct mechanics where they exist
// (Lévy flights, spirals, leader hierarchy, density / crowding) and not to
// obscure the similarity where it doesn't. Treat this as a comparative
// exhibit of metaheuristic mechanics, not a benchmark suite.

(function (BF) {
  'use strict';

  function paramCount(numIn, numOut, hidden) {
    return BF.cmaes.paramCount(numIn, numOut, hidden);
  }
  function genomeFromParams(params, numIn, numOut, hidden) {
    return BF.cmaes.genomeFromParams(params, numIn, numOut, hidden);
  }

  // Sample a Lévy-distributed step using Mantegna's algorithm. β=1.5 is the
  // canonical choice — heavy-tailed enough to produce the occasional big
  // jump, light-tailed enough that most steps stay local.
  function levyStep(rng, beta) {
    beta = beta != null ? beta : 1.5;
    // Pre-computed σ_u for β=1.5 from Γ identities.
    // sigma_u = (Γ(1+β)·sin(πβ/2) / (Γ((1+β)/2)·β·2^((β-1)/2)))^(1/β)
    // For β=1.5 this evaluates to ≈ 0.6966.
    const sigmaU = beta === 1.5
      ? 0.6966
      : Math.pow(
          (gamma(1 + beta) * Math.sin(Math.PI * beta / 2)) /
          (gamma((1 + beta) / 2) * beta * Math.pow(2, (beta - 1) / 2)),
          1 / beta);
    const u = rng.gauss(0, sigmaU);
    const v = rng.gauss(0, 1);
    return u / Math.pow(Math.abs(v) + 1e-12, 1 / beta);
  }

  // Stirling approximation good enough for the only callers (β-derived constants).
  // Only used when beta != 1.5 (otherwise we hit the precomputed branch above).
  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7;
    const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
               771.32342877765313, -176.61502916214059, 12.507343278686905,
               -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = p[0];
    for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  // ============================================================ Cuckoo ====
  function createCuckoo(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      stepScale: opts.stepScale != null ? opts.stepScale : 0.05,
      pa: opts.pa != null ? opts.pa : 0.25,        // discovery probability
      beta: opts.beta != null ? opts.beta : 1.5,
      generation: 0,
      // Diagnostics:
      lastMaxJump: 0,    // largest single Lévy step magnitude this gen
      lastReplacements: 0,
    };
  }
  function cuckooReset(state) {
    state.generation = 0; state.lastMaxJump = 0; state.lastReplacements = 0;
  }
  function cuckooInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = { params: p, genome: builder(p), fitness: 0, levyJump: 0 };
    }
    return out;
  }
  function cuckooStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const best = sorted[0].params;
    let maxJump = 0;
    let replaced = 0;

    // Step 1: each cuckoo flies via Lévy flight relative to best.
    const next = new Array(N);
    for (let i = 0; i < N; i++) {
      const cur = evaluatedPop[i].params;
      const pNew = new Float64Array(state.n);
      let jump2 = 0;
      for (let j = 0; j < state.n; j++) {
        // Lévy step toward best, scaled by stepScale and distance to best.
        const step = state.stepScale * levyStep(rng, state.beta) * (cur[j] - best[j]);
        pNew[j] = cur[j] + step;
        jump2 += step * step;
      }
      const jump = Math.sqrt(jump2);
      if (jump > maxJump) maxJump = jump;
      next[i] = { params: pNew, genome: builder(pNew), fitness: 0, levyJump: jump };
    }

    // Step 2: discovery — fraction p_a of nests get replaced by random walks
    // between two random nests.
    for (let i = 0; i < N; i++) {
      if (rng.next() >= state.pa) continue;
      replaced++;
      const a = evaluatedPop[Math.floor(rng.next() * N)].params;
      const b = evaluatedPop[Math.floor(rng.next() * N)].params;
      const r = rng.next();
      const pNew = next[i].params;  // mutate in place
      for (let j = 0; j < state.n; j++) {
        pNew[j] = pNew[j] + r * (a[j] - b[j]);
      }
      next[i].genome = builder(pNew);
    }

    state.lastMaxJump = maxJump;
    state.lastReplacements = replaced;
    state.generation++;
    return next;
  }

  // ============================================================= Whale ====
  function createWhale(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      maxGen: opts.maxGen != null ? opts.maxGen : 200,  // a-coefficient timeline
      bSpiral: opts.bSpiral != null ? opts.bSpiral : 1.0,
      generation: 0,
      lastSpiralCount: 0,
      lastEncircleCount: 0,
      lastExploreCount: 0,
    };
  }
  function whaleReset(state) {
    state.generation = 0;
    state.lastSpiralCount = 0;
    state.lastEncircleCount = 0;
    state.lastExploreCount = 0;
  }
  function whaleInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = { params: p, genome: builder(p), fitness: 0, whaleAction: 'init' };
    }
    return out;
  }
  function whaleStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const best = sorted[0].params;

    // 'a' decreases linearly from 2 to 0 over the run — controls whether
    // |A| > 1 (explore) vs ≤ 1 (encircle).
    const a = 2 * (1 - Math.min(1, state.generation / state.maxGen));
    let spiralCount = 0, encircleCount = 0, exploreCount = 0;
    const next = new Array(N);

    for (let i = 0; i < N; i++) {
      const cur = evaluatedPop[i].params;
      const pNew = new Float64Array(state.n);
      const r1 = rng.next();
      const r2 = rng.next();
      const A = 2 * a * r1 - a;        // [-a, a]
      const C = 2 * r2;                // [0, 2]
      const useSpiral = rng.next() < 0.5;
      let action;

      if (useSpiral) {
        // Spiral around best. l ∈ [-1, 1], shape via b·l exponent.
        const l = 2 * rng.next() - 1;
        const bSpiral = state.bSpiral;
        const factor = Math.exp(bSpiral * l) * Math.cos(2 * Math.PI * l);
        for (let j = 0; j < state.n; j++) {
          const D = Math.abs(best[j] - cur[j]);
          pNew[j] = D * factor + best[j];
        }
        action = 'spiral'; spiralCount++;
      } else if (Math.abs(A) < 1) {
        // Encircle the best.
        for (let j = 0; j < state.n; j++) {
          const D = Math.abs(C * best[j] - cur[j]);
          pNew[j] = best[j] - A * D;
        }
        action = 'encircle'; encircleCount++;
      } else {
        // Explore: pick a random whale and move relative to it.
        const rnd = evaluatedPop[Math.floor(rng.next() * N)].params;
        for (let j = 0; j < state.n; j++) {
          const D = Math.abs(C * rnd[j] - cur[j]);
          pNew[j] = rnd[j] - A * D;
        }
        action = 'explore'; exploreCount++;
      }

      next[i] = { params: pNew, genome: builder(pNew), fitness: 0, whaleAction: action };
    }

    state.lastSpiralCount   = spiralCount;
    state.lastEncircleCount = encircleCount;
    state.lastExploreCount  = exploreCount;
    state.generation++;
    return next;
  }

  // ============================================================= Fish =====
  function createFish(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      visual: opts.visual != null ? opts.visual : 0.5,    // perception radius
      step: opts.step != null ? opts.step : 0.15,         // movement scale
      crowding: opts.crowding != null ? opts.crowding : 0.5, // δ — crowd thresh
      generation: 0,
      // Per-behavior counts (algo internals chart).
      lastPrey: 0, lastSwarm: 0, lastFollow: 0, lastRandom: 0,
    };
  }
  function fishReset(state) {
    state.generation = 0;
    state.lastPrey = 0; state.lastSwarm = 0;
    state.lastFollow = 0; state.lastRandom = 0;
  }
  function fishInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = { params: p, genome: builder(p), fitness: 0, fishBehavior: 'init' };
    }
    return out;
  }
  function fishDist(a, b) {
    let s = 0;
    for (let j = 0; j < a.length; j++) { const d = a[j] - b[j]; s += d * d; }
    return Math.sqrt(s);
  }
  function fishStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];
    const next = new Array(N);
    let cP = 0, cS = 0, cF = 0, cR = 0;

    // Precompute neighbor lists once.
    const neighbors = new Array(N);
    for (let i = 0; i < N; i++) {
      const list = [];
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        if (fishDist(evaluatedPop[i].params, evaluatedPop[j].params) < state.visual) {
          list.push(j);
        }
      }
      neighbors[i] = list;
    }

    for (let i = 0; i < N; i++) {
      const cur = evaluatedPop[i].params;
      const curF = evaluatedPop[i].fitness;
      const nb = neighbors[i];
      let pNew = null;
      let action = 'random';

      // 1. Try SWARM: move toward center if not crowded AND center has better fitness.
      if (nb.length > 0) {
        const center = new Float64Array(state.n);
        let avgF = 0;
        for (const k of nb) {
          avgF += evaluatedPop[k].fitness;
          for (let j = 0; j < state.n; j++) center[j] += evaluatedPop[k].params[j];
        }
        for (let j = 0; j < state.n; j++) center[j] /= nb.length;
        avgF /= nb.length;

        // Not crowded: nb.length / N < δ.
        const notCrowded = nb.length / N < state.crowding;
        if (notCrowded && avgF > curF) {
          pNew = stepToward(cur, center, state.step, rng, state.n);
          action = 'swarm'; cS++;
        }
      }

      // 2. Try FOLLOW: move toward best neighbor if not crowded.
      if (!pNew && nb.length > 0) {
        let bestK = -1, bestF = curF;
        for (const k of nb) {
          if (evaluatedPop[k].fitness > bestF) { bestF = evaluatedPop[k].fitness; bestK = k; }
        }
        if (bestK >= 0) {
          const notCrowded = nb.length / N < state.crowding;
          if (notCrowded) {
            pNew = stepToward(cur, evaluatedPop[bestK].params, state.step, rng, state.n);
            action = 'follow'; cF++;
          }
        }
      }

      // 3. PREY: random direction, accept if improves (we don't know fitness ahead
      // of time, so we just try a random small step — equivalent to "move and
      // hope" since fitness eval happens next gen anyway).
      if (!pNew) {
        // 50/50: prey (small bias toward random direction) vs random walk.
        if (rng.next() < 0.5) {
          pNew = new Float64Array(state.n);
          for (let j = 0; j < state.n; j++) pNew[j] = cur[j] + rng.gauss(0, state.step * 0.7);
          action = 'prey'; cP++;
        } else {
          pNew = new Float64Array(state.n);
          for (let j = 0; j < state.n; j++) pNew[j] = cur[j] + rng.gauss(0, state.step);
          action = 'random'; cR++;
        }
      }

      next[i] = { params: pNew, genome: builder(pNew), fitness: 0, fishBehavior: action };
    }

    state.lastPrey = cP; state.lastSwarm = cS;
    state.lastFollow = cF; state.lastRandom = cR;
    state.generation++;
    return next;
  }
  function stepToward(cur, target, scale, rng, n) {
    const out = new Float64Array(n);
    let dist = 0;
    for (let j = 0; j < n; j++) { const d = target[j] - cur[j]; dist += d * d; }
    dist = Math.sqrt(dist) || 1;
    for (let j = 0; j < n; j++) {
      const dir = (target[j] - cur[j]) / dist;
      out[j] = cur[j] + scale * dir + rng.gauss(0, scale * 0.2);  // add noise
    }
    return out;
  }

  // ============================================================ GreyWolf ==
  function createGreyWolf(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      maxGen: opts.maxGen != null ? opts.maxGen : 200,
      generation: 0,
      // Last-known leaders for diagnostics.
      lastAlphaFitness: -Infinity,
    };
  }
  function gwoReset(state) {
    state.generation = 0;
    state.lastAlphaFitness = -Infinity;
  }
  function gwoInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = { params: p, genome: builder(p), fitness: 0, swarmRank: null };
    }
    return out;
  }
  function gwoStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const alpha = sorted[0].params;
    const beta  = sorted[Math.min(1, N - 1)].params;
    const delta = sorted[Math.min(2, N - 1)].params;
    state.lastAlphaFitness = sorted[0].fitness;
    const aCoef = 2 * (1 - Math.min(1, state.generation / state.maxGen));
    const next = new Array(N);

    // For tagging, find which evaluatedPop indices are α/β/δ.
    const findIdx = (params) => evaluatedPop.findIndex(p => p.params === params);
    const alphaIdx = findIdx(alpha);
    const betaIdx  = findIdx(beta);
    const deltaIdx = findIdx(delta);

    for (let i = 0; i < N; i++) {
      const cur = evaluatedPop[i].params;
      const pNew = new Float64Array(state.n);
      // For each leader, compute the weighted target X_L.
      for (let j = 0; j < state.n; j++) {
        let sum = 0;
        for (const L of [alpha, beta, delta]) {
          const r1 = rng.next(), r2 = rng.next();
          const A = 2 * aCoef * r1 - aCoef;
          const C = 2 * r2;
          const D = Math.abs(C * L[j] - cur[j]);
          sum += L[j] - A * D;
        }
        pNew[j] = sum / 3;
      }
      let rank = null;
      if (i === alphaIdx) rank = 'alpha';
      else if (i === betaIdx) rank = 'beta';
      else if (i === deltaIdx) rank = 'delta';
      next[i] = { params: pNew, genome: builder(pNew), fitness: 0, swarmRank: rank };
    }
    state.generation++;
    return next;
  }

  // ================================================================ ACO_R ==
  // Continuous ACO (Socha & Dorigo 2008). Maintain an archive of the K
  // best-ever-seen solutions. Each gen: (1) sample N new solutions by
  // picking a guide from the archive (rank-weighted) and Gaussian-perturbing
  // each dim with σ proportional to the archive's spread on that dim;
  // (2) merge new + archive, keep top K.
  function createACO(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      archiveSize: opts.archiveSize != null ? opts.archiveSize : 16,
      q: opts.q != null ? opts.q : 0.1,           // selection pressure
      xi: opts.xi != null ? opts.xi : 0.85,       // pheromone evaporation rate
      generation: 0,
      archive: null,           // [{params, fitness}]
      _weights: null,          // cached rank weights
    };
  }
  function acoReset(state) {
    state.generation = 0;
    state.archive = null;
    state._weights = null;
  }
  function acoInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = { params: p, genome: builder(p), fitness: 0 };
    }
    return out;
  }
  function acoComputeWeights(K, q) {
    const w = new Float64Array(K);
    let sum = 0;
    for (let r = 0; r < K; r++) {
      // w_r = (1/(q·K·√(2π))) · exp(−(r²)/(2·q²·K²))
      const v = Math.exp(-(r * r) / (2 * q * q * K * K)) / (q * K * Math.sqrt(2 * Math.PI));
      w[r] = v;
      sum += v;
    }
    for (let r = 0; r < K; r++) w[r] /= sum;
    return w;
  }
  function acoStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];

    // Merge evaluated pop into archive, keep top K.
    const all = (state.archive ? state.archive.slice() : []).concat(
      evaluatedPop.map(p => ({ params: new Float64Array(p.params), fitness: p.fitness })));
    all.sort((a, b) => b.fitness - a.fitness);
    state.archive = all.slice(0, state.archiveSize);
    const K = state.archive.length;
    if (!state._weights || state._weights.length !== K) {
      state._weights = acoComputeWeights(K, state.q);
    }
    const w = state._weights;

    // Sample N new solutions from the archive.
    const next = new Array(N);
    for (let i = 0; i < N; i++) {
      // Pick guide r weighted by w[r].
      let r = rng.next(), pick = 0;
      for (let kk = 0; kk < K; kk++) {
        r -= w[kk];
        if (r < 0) { pick = kk; break; }
        pick = kk;
      }
      const guide = state.archive[pick].params;
      const pNew = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) {
        // σ_j = ξ · mean over archive of |archive[k].params[j] − guide[j]|.
        let s = 0;
        for (let kk = 0; kk < K; kk++) s += Math.abs(state.archive[kk].params[j] - guide[j]);
        const sigmaJ = (s / Math.max(1, K - 1)) * state.xi + 1e-6;
        pNew[j] = guide[j] + rng.gauss(0, sigmaJ);
      }
      next[i] = { params: pNew, genome: builder(pNew), fitness: 0 };
    }
    state.generation++;
    return next;
  }

  // ============================================================ Firefly ===
  function createFirefly(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      beta0: opts.beta0 != null ? opts.beta0 : 1.0,    // base attractiveness
      gamma: opts.gamma != null ? opts.gamma : 1.0,    // light absorption
      alphaNoise: opts.alphaNoise != null ? opts.alphaNoise : 0.2,
      generation: 0,
      lastMaxAttraction: 0,
    };
  }
  function fireflyReset(state) {
    state.generation = 0;
    state.lastMaxAttraction = 0;
  }
  function fireflyInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = { params: p, genome: builder(p), fitness: 0 };
    }
    return out;
  }
  function fireflyStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];
    // We update each firefly toward each brighter firefly. To keep it O(N²)
    // but consistent, snapshot positions first, then apply all updates.
    const snapshot = evaluatedPop.map(p => new Float64Array(p.params));
    const fitness = evaluatedPop.map(p => p.fitness);
    const next = new Array(N);
    let maxAttr = 0;

    for (let i = 0; i < N; i++) {
      const newPos = new Float64Array(snapshot[i]);
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        if (fitness[j] <= fitness[i]) continue;
        // r² in param space.
        let r2 = 0;
        for (let d = 0; d < state.n; d++) {
          const diff = snapshot[j][d] - snapshot[i][d];
          r2 += diff * diff;
        }
        const beta = state.beta0 * Math.exp(-state.gamma * r2);
        if (beta > maxAttr) maxAttr = beta;
        for (let d = 0; d < state.n; d++) {
          newPos[d] += beta * (snapshot[j][d] - snapshot[i][d]);
        }
      }
      // Add Gaussian noise (random walk component).
      for (let d = 0; d < state.n; d++) {
        newPos[d] += rng.gauss(0, state.alphaNoise);
      }
      next[i] = { params: newPos, genome: builder(newPos), fitness: 0 };
    }
    state.lastMaxAttraction = maxAttr;
    state.generation++;
    return next;
  }

  // ============================================================== Bat =====
  function createBat(numIn, numOut, hidden, opts) {
    opts = opts || {};
    return {
      n: paramCount(numIn, numOut, hidden),
      paramShape: { numInputs: numIn, numOutputs: numOut, hiddenSize: hidden },
      sigma: opts.sigma != null ? opts.sigma : 0.3,
      fmin: opts.fmin != null ? opts.fmin : 0.0,
      fmax: opts.fmax != null ? opts.fmax : 2.0,
      A0: opts.A0 != null ? opts.A0 : 1.0,         // initial loudness
      r0: opts.r0 != null ? opts.r0 : 0.5,         // initial pulse rate
      alphaA: opts.alphaA != null ? opts.alphaA : 0.95,
      gammaR: opts.gammaR != null ? opts.gammaR : 0.05,
      epsilon: opts.epsilon != null ? opts.epsilon : 0.05,  // local-walk scale
      generation: 0,
      lastMeanLoudness: 0,
      lastMeanPulse: 0,
    };
  }
  function batReset(state) {
    state.generation = 0;
    state.lastMeanLoudness = 0;
    state.lastMeanPulse = 0;
  }
  function batInitial(state, popSize, rng, builder) {
    const out = new Array(popSize);
    for (let i = 0; i < popSize; i++) {
      const p = new Float64Array(state.n);
      const v = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) p[j] = rng.gauss(0, state.sigma);
      out[i] = {
        params: p, genome: builder(p), fitness: 0,
        velocity: v,
        loudness: state.A0,
        pulseRate: state.r0,
      };
    }
    return out;
  }
  function batStep(state, evaluatedPop, rng, builder) {
    const N = evaluatedPop.length;
    if (N === 0) return [];
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const best = sorted[0].params;

    const next = new Array(N);
    let sumA = 0, sumR = 0;
    const tNorm = state.generation;  // t for pulse-rate growth term

    for (let i = 0; i < N; i++) {
      const ind = evaluatedPop[i];
      const cur = ind.params;
      const v = ind.velocity || new Float64Array(state.n);
      const A = ind.loudness != null ? ind.loudness : state.A0;
      const r = ind.pulseRate != null ? ind.pulseRate : state.r0;

      // Frequency-driven velocity.
      const f = state.fmin + (state.fmax - state.fmin) * rng.next();
      const newV = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) newV[j] = v[j] + (cur[j] - best[j]) * f;
      const newP = new Float64Array(state.n);
      for (let j = 0; j < state.n; j++) newP[j] = cur[j] + newV[j];

      // Local random walk: with prob (1 − r), step around best with σ ≈ ε·meanA.
      if (rng.next() > r) {
        for (let j = 0; j < state.n; j++) {
          newP[j] = best[j] + rng.gauss(0, state.epsilon);
        }
      }

      // Acceptance: standard bat algorithm reads "if (rand < A) AND (f_new < f)
      // accept". We don't have the new fitness yet, so just propose and let the
      // next-gen evaluation sort it out. Update loudness/pulse over time
      // as if accepting (matches the typical decay schedule and avoids freezing).
      const newA = state.alphaA * A;
      const newR = state.r0 * (1 - Math.exp(-state.gammaR * tNorm));
      sumA += newA; sumR += newR;

      next[i] = {
        params: newP, genome: builder(newP), fitness: 0,
        velocity: newV, loudness: newA, pulseRate: newR,
      };
    }

    state.lastMeanLoudness = sumA / N;
    state.lastMeanPulse = sumR / N;
    state.generation++;
    return next;
  }

  // ----- Public API ---------------------------------------------------------
  BF.cuckoo = {
    create: createCuckoo, reset: cuckooReset,
    initialPopulation: cuckooInitial, stepSwarm: cuckooStep,
    paramCount, genomeFromParams,
  };
  BF.whale = {
    create: createWhale, reset: whaleReset,
    initialPopulation: whaleInitial, stepSwarm: whaleStep,
    paramCount, genomeFromParams,
  };
  BF.fish = {
    create: createFish, reset: fishReset,
    initialPopulation: fishInitial, stepSwarm: fishStep,
    paramCount, genomeFromParams,
  };
  BF.greywolf = {
    create: createGreyWolf, reset: gwoReset,
    initialPopulation: gwoInitial, stepSwarm: gwoStep,
    paramCount, genomeFromParams,
  };
  BF.aco = {
    create: createACO, reset: acoReset,
    initialPopulation: acoInitial, stepSwarm: acoStep,
    paramCount, genomeFromParams,
  };
  BF.firefly = {
    create: createFirefly, reset: fireflyReset,
    initialPopulation: fireflyInitial, stepSwarm: fireflyStep,
    paramCount, genomeFromParams,
  };
  BF.bat = {
    create: createBat, reset: batReset,
    initialPopulation: batInitial, stepSwarm: batStep,
    paramCount, genomeFromParams,
  };
})(window.BF);
