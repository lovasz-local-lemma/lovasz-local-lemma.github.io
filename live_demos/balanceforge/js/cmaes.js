// BalanceForge — CMA-ES (Covariance Matrix Adaptation Evolution Strategy).
// Hansen & Ostermeier 2001, with the standard rank-1 + rank-µ updates and
// step-size control via the conjugate evolution path. Operates on a flat
// parameter vector; we provide helpers to convert to/from a fixed-topology
// NEAT genome so the rest of the system (evaluation, network viz) is reused.

(function (BF) {
  'use strict';
  const { clamp } = BF.util;

  // ---- Topology helpers --------------------------------------------------
  // Fixed topology: numInputs → hiddenSize hidden (tanh) → numOutputs (tanh).
  // hiddenSize = 0 collapses to a direct linear policy.
  // Normalize the `hidden` argument into an array of layer sizes. The
  // legacy callers pass a single int = a single hidden layer of that
  // width (or 0 = linear). The new callers pass an array of widths =
  // a multi-layer MLP. Both paths go through the same param-layout so
  // saved CMA-ES checkpoints with one hidden layer still round-trip.
  // Zero-width entries are filtered (a layer of width 0 makes no
  // sense and would create an unreachable bridge segment).
  function _hiddenSizes(hidden) {
    if (Array.isArray(hidden)) {
      const out = [];
      for (const h of hidden) {
        const n = h | 0;
        if (n > 0) out.push(n);
      }
      return out;
    }
    const n = hidden | 0;
    return n > 0 ? [n] : [];
  }

  function paramCount(numInputs, numOutputs, hidden) {
    const sizes = _hiddenSizes(hidden);
    if (sizes.length === 0) {
      // Linear: every input -> every output.
      return numInputs * numOutputs + numOutputs;
    }
    let count = 0;
    // Each layer contributes (prev * this) weights + this biases.
    let prev = numInputs;
    for (const h of sizes) {
      count += prev * h + h;
      prev = h;
    }
    // Final hidden -> output weights, + output biases.
    count += prev * numOutputs + numOutputs;
    return count;
  }

  // Build a NEAT-format genome from a flat parameter vector. The
  // ordering is: for each hidden layer (front-to-back) write the
  // layer's biases, then prev->this weights; then output biases (the
  // final output->prev weight block lives inline at the end of the
  // hidden chain). Documented so the smoke test can build & decode
  // reliably.
  function genomeFromParams(params, numInputs, numOutputs, hidden) {
    const sizes = _hiddenSizes(hidden);
    const g = BF.neat.makeGenome(numInputs, numOutputs);
    let p = 0;
    if (sizes.length === 0) {
      // Linear: every input → every output, then tanh on output.
      for (let i = 0; i < numInputs; i++) {
        for (let o = 0; o < numOutputs; o++) {
          g.conns.push({
            innov: BF.neat.nextInnovation(),
            from: i, to: numInputs + o,
            weight: params[p++], enabled: true,
          });
        }
      }
    } else {
      // Multi-layer MLP. Allocate per-layer hidden node ids on top of
      // (numInputs + numOutputs). Each layer's nodes get tanh + a bias
      // pulled from `params`. Connections are layer[k-1] -> layer[k].
      const layerIds = [];
      let nodeBase = numInputs + numOutputs;
      for (let li = 0; li < sizes.length; li++) {
        const h = sizes[li];
        const ids = [];
        for (let k = 0; k < h; k++) {
          const id = nodeBase++;
          g.nodes.push({
            id: id, kind: 'hidden', act: BF.neat.ACT.TANH, bias: params[p++],
          });
          ids.push(id);
        }
        layerIds.push(ids);
      }
      // Wire input -> layer[0], then layer[k-1] -> layer[k], with the
      // weight block laid out source-major to match the legacy single-
      // layer ordering.
      let prevIds = null;
      let prevW = numInputs;
      for (let li = 0; li < sizes.length; li++) {
        const ids = layerIds[li];
        if (li === 0) {
          // input (id range 0..numInputs-1) -> first hidden layer.
          for (let i = 0; i < numInputs; i++) {
            for (let k = 0; k < ids.length; k++) {
              g.conns.push({
                innov: BF.neat.nextInnovation(),
                from: i, to: ids[k],
                weight: params[p++], enabled: true,
              });
            }
          }
        } else {
          for (let i = 0; i < prevW; i++) {
            for (let k = 0; k < ids.length; k++) {
              g.conns.push({
                innov: BF.neat.nextInnovation(),
                from: prevIds[i], to: ids[k],
                weight: params[p++], enabled: true,
              });
            }
          }
        }
        prevIds = ids;
        prevW   = ids.length;
      }
      // Last hidden -> output weights.
      for (let i = 0; i < prevW; i++) {
        for (let o = 0; o < numOutputs; o++) {
          g.conns.push({
            innov: BF.neat.nextInnovation(),
            from: prevIds[i], to: numInputs + o,
            weight: params[p++], enabled: true,
          });
        }
      }
    }
    // Output biases.
    for (let o = 0; o < numOutputs; o++) {
      g.nodes[numInputs + o].bias = params[p++];
    }
    g._order = null;
    return g;
  }

  // ---- Linear algebra helpers --------------------------------------------
  function identityMatrix(n) {
    const m = new Float64Array(n * n);
    for (let i = 0; i < n; i++) m[i * n + i] = 1;
    return m;
  }

  function matVec(M, v, n) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += M[i * n + j] * v[j];
      out[i] = s;
    }
    return out;
  }

  // Jacobi eigendecomposition for symmetric matrices. Returns
  //   { eigvals: Float64Array(n), eigvecs: Float64Array(n*n) }
  // where eigvecs is stored such that column k = the k-th eigenvector
  // (memory layout is row-major; eigvecs[i*n + k] is the i-th
  // component of the k-th eigenvector). For our CMA-ES we need this
  // to compute B*D where D = diag(sqrt(eigvals)). We don't need
  // eigvals sorted -- just a consistent orientation between samples
  // and updates.
  //
  // Convention: J(p,q,θ) has J[p,p]=c, J[p,q]=s, J[q,p]=-s, J[q,q]=c.
  // Under this convention, the rotation that zeros (J^T A J)[p,q]
  // satisfies tan(2θ) = -2*A[p,q] / (A[p,p] - A[q,q]) -- note the
  // MINUS sign in the numerator. A previous version of this function
  // used `atan2(2*apq, app-aqq)` (positive numerator), which mixes
  // the rotation convention against the diagonal-update formulas
  // below and produces an "eigendecomposition" that doesn't actually
  // satisfy A v = λ v. CMA-ES tolerates the resulting wrong
  // proposals (sampling still gives non-pathological directions),
  // but the function is now mathematically correct.
  function jacobiEigen(symmetric, n) {
    const A = new Float64Array(symmetric);
    const V = identityMatrix(n);
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) off += Math.abs(A[i * n + j]);
      }
      if (off < 1e-12) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p * n + q];
          if (Math.abs(apq) < 1e-14) continue;
          const app = A[p * n + p];
          const aqq = A[q * n + q];
          let theta;
          if (Math.abs(app - aqq) < 1e-14) {
            theta = Math.PI / 4;
          } else {
            // Note the MINUS sign on the numerator: this matches the
            // J[p,q]=s convention used by the diagonal updates below.
            theta = 0.5 * Math.atan2(-2 * apq, app - aqq);
          }
          const c = Math.cos(theta);
          const s = Math.sin(theta);
          // Rotate rows/columns p and q.
          for (let r = 0; r < n; r++) {
            if (r === p || r === q) continue;
            const arp = A[r * n + p];
            const arq = A[r * n + q];
            const newArp = c * arp - s * arq;
            const newArq = s * arp + c * arq;
            A[r * n + p] = newArp; A[p * n + r] = newArp;
            A[r * n + q] = newArq; A[q * n + r] = newArq;
          }
          A[p * n + p] = c * c * app - 2 * c * s * apq + s * s * aqq;
          A[q * n + q] = s * s * app + 2 * c * s * apq + c * c * aqq;
          A[p * n + q] = 0; A[q * n + p] = 0;
          // Accumulate eigenvectors.
          for (let r = 0; r < n; r++) {
            const vrp = V[r * n + p];
            const vrq = V[r * n + q];
            V[r * n + p] = c * vrp - s * vrq;
            V[r * n + q] = s * vrp + c * vrq;
          }
        }
      }
    }
    const eigvals = new Float64Array(n);
    for (let i = 0; i < n; i++) eigvals[i] = A[i * n + i];
    return { eigvals: eigvals, eigvecs: V };
  }

  // ---- CMA-ES state ------------------------------------------------------
  function create(numInputs, numOutputs, hiddenSize, opts) {
    opts = opts || {};
    // Allow callers (CNN policy mode) to override the dimension so CMA-ES can
    // optimize over arbitrary flat parameter spaces, not just our standard
    // MLP genome.
    const n = (opts.dimOverride != null && opts.dimOverride > 0)
      ? opts.dimOverride
      : paramCount(numInputs, numOutputs, hiddenSize);
    if (n === 0) throw new Error('CMA-ES dimension is 0');
    // Practical ceiling for our Jacobi eigendecomp: O(60 * n^3) per gen.
    // At n=300 that's ~1.6B ops (~5s in JS). At n=500 it's ~7.5B ops
    // (~30s -- a hard browser freeze with no event-loop yield possible
    // inside the rotation loop). Surface a console warning so users
    // who hit this know what's happening without having to read the
    // source. Threshold is conservative because GC + cache effects
    // make real-world cost higher than the raw flop count suggests.
    if (n > 300 && typeof console !== 'undefined' && console.warn) {
      console.warn('[BF.cmaes] dimension n=' + n + ' exceeds the practical Jacobi ceiling'
        + ' (~300). Per-gen eigendecomp will block the UI thread for several seconds'
        + ' or longer. Consider reducing the policy config (smaller numFilters /'
        + ' denseHidden) or switching to a lower-dim policy.');
    }
    const sigma = opts.sigma != null ? opts.sigma : 0.5;
    // λ default from Hansen's rule of thumb. Caller can override.
    const lambda = Math.max(4, opts.lambda || (4 + Math.floor(3 * Math.log(n))));
    const mu = Math.max(1, Math.floor(lambda / 2));
    // Positive selection weights ∝ ln(μ + 0.5) − ln(i+1), normalized to sum=1.
    const rawW = new Float64Array(mu);
    for (let i = 0; i < mu; i++) rawW[i] = Math.log(mu + 0.5) - Math.log(i + 1);
    let sumW = 0;
    for (let i = 0; i < mu; i++) sumW += rawW[i];
    const weights = new Float64Array(mu);
    for (let i = 0; i < mu; i++) weights[i] = rawW[i] / sumW;
    let sumW2 = 0;
    for (let i = 0; i < mu; i++) sumW2 += weights[i] * weights[i];
    const muEff = 1 / sumW2;
    // Strategy parameters per Hansen tutorial defaults.
    const cSigma = (muEff + 2) / (n + muEff + 5);
    const dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cSigma;
    const cC = (4 + muEff / n) / (n + 4 + 2 * muEff / n);
    const c1 = 2 / (Math.pow(n + 1.3, 2) + muEff);
    let cMu = 2 * (muEff - 2 + 1 / muEff) / (Math.pow(n + 2, 2) + muEff);
    if (cMu > 1 - c1) cMu = 1 - c1;
    const ENormal = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));

    const initialMean = opts.mean ? new Float64Array(opts.mean) : new Float64Array(n);
    return {
      n: n, lambda: lambda, mu: mu, weights: weights, muEff: muEff,
      cSigma: cSigma, dSigma: dSigma, cC: cC, c1: c1, cMu: cMu, ENormal: ENormal,
      mean: initialMean,
      sigma: sigma,
      C: identityMatrix(n),
      pSigma: new Float64Array(n),
      pC: new Float64Array(n),
      B: identityMatrix(n),
      D: (function () { const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = 1; return d; })(),
      generation: 0,
      paramShape: { numInputs: numInputs, numOutputs: numOutputs, hiddenSize: hiddenSize },
    };
  }

  // Sample one parameter vector from the current N(mean, sigma² C).
  // x = mean + sigma * B * D * z,  z_i ~ N(0,1)
  function sampleParams(state, rng) {
    const n = state.n;
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = rng.gauss(0, 1);
    const Dz = new Float64Array(n);
    for (let i = 0; i < n; i++) Dz[i] = state.D[i] * z[i];
    const BDz = matVec(state.B, Dz, n);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = state.mean[i] + state.sigma * BDz[i];
    return x;
  }

  // C^(-1/2) v  =  B * diag(1/D) * B^T * v.  Pre-multiplies the path-σ update.
  function CinvSqrtTimes(state, v) {
    const n = state.n;
    // tmp = B^T v
    const tmp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += state.B[j * n + i] * v[j];
      tmp[i] = s;
    }
    for (let i = 0; i < n; i++) {
      const d = state.D[i];
      tmp[i] = d > 1e-12 ? tmp[i] / d : 0;
    }
    return matVec(state.B, tmp, n);
  }

  // Eigendecomposition dispatch. Same selection rule as the NEAT /
  // CNN-multiscale paths: route to the WASM port when the user has
  // turned it on and the module is ready, else use the JS reference.
  //
  // Jacobi numerics: the C++ port is a line-for-line translation, so
  // outputs match the JS implementation up to libm-vs-V8 rounding.
  // CMA-ES is robust to ULP-scale eigenvalue noise (the sampling
  // step recovers any tiny mis-rotation), so the swap is safe.
  function jacobiDispatch(sym, n) {
    if (typeof window !== 'undefined'
        && window.BF
        && window.BF.wasm
        && window.BF.wasm.useForJacobi
        && window.BF.wasm.ready
        && window.BF.wasm.jacobi
        && window.BF.wasm.jacobi.eigen) {
      return window.BF.wasm.jacobi.eigen(sym, n);
    }
    return jacobiEigen(sym, n);
  }

  // Re-eigendecompose C → B, D. Run once per generation; cheap for n < 100.
  function decomposeC(state) {
    const n = state.n;
    // Symmetrize defensively (numerical drift).
    const sym = new Float64Array(state.C);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const avg = 0.5 * (sym[i * n + j] + sym[j * n + i]);
        sym[i * n + j] = avg; sym[j * n + i] = avg;
      }
    }
    const dec = jacobiDispatch(sym, n);
    state.B = dec.eigvecs;
    for (let i = 0; i < n; i++) {
      const ev = Math.max(0, dec.eigvals[i]);
      state.D[i] = Math.sqrt(ev);
    }
  }

  // Update CMA-ES from an evaluated population.
  // evaluatedPop: array of { params: Float64Array(n), fitness: number }
  function update(state, evaluatedPop) {
    const n = state.n;
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const elite = sorted.slice(0, state.mu);

    // Weighted mean of elite.
    const newMean = new Float64Array(n);
    for (let k = 0; k < state.mu; k++) {
      const x = elite[k].params;
      const w = state.weights[k];
      for (let i = 0; i < n; i++) newMean[i] += w * x[i];
    }

    // Path σ.
    const meanDiffOverSigma = new Float64Array(n);
    for (let i = 0; i < n; i++) meanDiffOverSigma[i] = (newMean[i] - state.mean[i]) / state.sigma;
    const CinvSqrtDiff = CinvSqrtTimes(state, meanDiffOverSigma);
    const cs = state.cSigma;
    const csF = Math.sqrt(cs * (2 - cs) * state.muEff);
    for (let i = 0; i < n; i++) {
      state.pSigma[i] = (1 - cs) * state.pSigma[i] + csF * CinvSqrtDiff[i];
    }
    let normPS = 0;
    for (let i = 0; i < n; i++) normPS += state.pSigma[i] * state.pSigma[i];
    normPS = Math.sqrt(normPS);

    // Heaviside: dampen rank-1 update right after big σ jumps.
    const denom = Math.sqrt(1 - Math.pow(1 - cs, 2 * (state.generation + 1)));
    const hSigma = (normPS / Math.max(1e-12, denom)) < (1.4 + 2 / (n + 1)) * state.ENormal ? 1 : 0;

    // Path c.
    const cc = state.cC;
    const ccF = Math.sqrt(cc * (2 - cc) * state.muEff);
    for (let i = 0; i < n; i++) {
      state.pC[i] = (1 - cc) * state.pC[i] + hSigma * ccF * meanDiffOverSigma[i];
    }

    // Update C: rank-1 (path) + rank-µ (elite).
    const c1 = state.c1, cMu = state.cMu;
    const oneMinus = 1 - c1 - cMu;
    const decay = c1 * (1 - hSigma) * cc * (2 - cc);
    const newC = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let v = oneMinus * state.C[i * n + j]
              + c1 * state.pC[i] * state.pC[j]
              + decay * state.C[i * n + j];
        for (let k = 0; k < state.mu; k++) {
          const z_ki = (elite[k].params[i] - state.mean[i]) / state.sigma;
          const z_kj = (elite[k].params[j] - state.mean[j]) / state.sigma;
          v += cMu * state.weights[k] * z_ki * z_kj;
        }
        newC[i * n + j] = v;
      }
    }
    state.C = newC;

    // Step size.
    const ds = state.dSigma;
    state.sigma *= Math.exp((cs / ds) * (normPS / state.ENormal - 1));
    // Guard against runaway. Common values stay in [1e-3, 1e3].
    if (state.sigma > 1e3) state.sigma = 1e3;
    if (state.sigma < 1e-6) state.sigma = 1e-6;

    state.mean = newMean;
    state.generation += 1;
    decomposeC(state);
  }

  // Reset everything except topology shape and Hansen-derived constants.
  function reset(state, opts) {
    opts = opts || {};
    const n = state.n;
    state.mean = opts.mean ? new Float64Array(opts.mean) : new Float64Array(n);
    state.sigma = opts.sigma != null ? opts.sigma : 0.5;
    state.C = identityMatrix(n);
    state.pSigma = new Float64Array(n);
    state.pC = new Float64Array(n);
    state.B = identityMatrix(n);
    state.D = new Float64Array(n);
    for (let i = 0; i < n; i++) state.D[i] = 1;
    state.generation = 0;
  }

  BF.cmaes = {
    create, sampleParams, update, reset,
    paramCount, genomeFromParams,
  };

  // ====================================================== sep-CMA-ES =======
  // Separable CMA-ES (Ros & Hansen 2008): drops the FULL covariance
  // matrix in favor of a DIAGONAL approximation. Each dimension gets
  // its own variance; cross-dim correlations are NOT modeled. Trade-
  // offs:
  //   + O(n) per generation instead of O(n^3) -- no Jacobi eigendecomp.
  //     The freeze we hit at n=550 (cnn-multiscale's old default) is
  //     simply not a thing here. Unlocks cnn-multiscale at much bigger
  //     configs (numFilters=8, denseHidden=32, etc).
  //   + Memory O(n) instead of O(n^2).
  //   - On problems with strongly-correlated dimensions, slightly
  //     slower convergence than full CMA-ES. In practice the diagonal
  //     approximation works very well for NN-shaped parameter spaces
  //     where cross-weight correlation is weak.
  //
  // State layout is intentionally similar to full CMA-ES (same field
  // names where the math is the same) so the trainer's diagnostics
  // (algorithm-internals chart, etc.) can read sigma + generation
  // without per-variant special casing. The only structural diff is
  // C: a Float64Array(n) of per-dim variances instead of an n*n
  // matrix. D[j] = sqrt(C[j]) -- no eigendecomp needed.

  function sepCreate(numInputs, numOutputs, hiddenSize, opts) {
    opts = opts || {};
    const n = (opts.dimOverride != null && opts.dimOverride > 0)
      ? opts.dimOverride
      : paramCount(numInputs, numOutputs, hiddenSize);
    if (n === 0) throw new Error('sep-CMA-ES dimension is 0');
    const sigma = opts.sigma != null ? opts.sigma : 0.5;
    const lambda = Math.max(4, opts.lambda || (4 + Math.floor(3 * Math.log(n))));
    const mu = Math.max(1, Math.floor(lambda / 2));
    // Positive log-weights ∝ ln(μ + 0.5) − ln(i+1), normalized to sum 1.
    const rawW = new Float64Array(mu);
    for (let i = 0; i < mu; i++) rawW[i] = Math.log(mu + 0.5) - Math.log(i + 1);
    let sumW = 0;
    for (let i = 0; i < mu; i++) sumW += rawW[i];
    const weights = new Float64Array(mu);
    for (let i = 0; i < mu; i++) weights[i] = rawW[i] / sumW;
    let sumW2 = 0;
    for (let i = 0; i < mu; i++) sumW2 += weights[i] * weights[i];
    const muEff = 1 / sumW2;
    // Strategy parameters: sep-CMA uses Hansen's standard CMA constants
    // but scaled for the diagonal-only update. Specifically c1 and cMu
    // get multiplied by (n+2)/3 -- the original sep-CMA paper's
    // adjustment that compensates for the loss of off-diagonal info.
    const cSigma = (muEff + 2) / (n + muEff + 5);
    const dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cSigma;
    const cC = (4 + muEff / n) / (n + 4 + 2 * muEff / n);
    const c1Full = 2 / (Math.pow(n + 1.3, 2) + muEff);
    let cMuFull = 2 * (muEff - 2 + 1 / muEff) / (Math.pow(n + 2, 2) + muEff);
    if (cMuFull > 1 - c1Full) cMuFull = 1 - c1Full;
    // sep-CMA's diagonal-update scaling.
    const sepScale = (n + 2) / 3;
    const c1 = c1Full * sepScale;
    let cMu = cMuFull * sepScale;
    if (cMu > 1 - c1) cMu = 1 - c1;
    const ENormal = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    const initialMean = opts.mean ? new Float64Array(opts.mean) : new Float64Array(n);
    // C and D are diagonal-only -- each is a Float64Array(n).
    const C = new Float64Array(n);
    const D = new Float64Array(n);
    for (let i = 0; i < n; i++) { C[i] = 1; D[i] = 1; }
    return {
      n: n, lambda: lambda, mu: mu, weights: weights, muEff: muEff,
      cSigma: cSigma, dSigma: dSigma, cC: cC, c1: c1, cMu: cMu, ENormal: ENormal,
      mean: initialMean,
      sigma: sigma,
      C: C, D: D,
      pSigma: new Float64Array(n),
      pC: new Float64Array(n),
      generation: 0,
      paramShape: { numInputs: numInputs, numOutputs: numOutputs, hiddenSize: hiddenSize },
    };
  }

  // Sample one parameter vector: x_j = mean_j + sigma * D_j * z_j.
  function sepSampleParams(state, rng) {
    const n = state.n;
    const x = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const z = rng.gauss(0, 1);
      x[j] = state.mean[j] + state.sigma * state.D[j] * z;
    }
    return x;
  }

  function sepUpdate(state, evaluatedPop) {
    const n = state.n;
    const sorted = evaluatedPop.slice().sort((a, b) => b.fitness - a.fitness);
    const elite = sorted.slice(0, state.mu);
    // New mean: weighted recombination of elite.
    const newMean = new Float64Array(n);
    for (let k = 0; k < state.mu; k++) {
      const x = elite[k].params;
      const w = state.weights[k];
      for (let j = 0; j < n; j++) newMean[j] += w * x[j];
    }
    // Path σ: ((newMean - mean) / sigma) / D, elementwise (since C is diagonal).
    const cs = state.cSigma;
    const csF = Math.sqrt(cs * (2 - cs) * state.muEff);
    for (let j = 0; j < n; j++) {
      const meanDiff = (newMean[j] - state.mean[j]) / state.sigma;
      const dj = state.D[j] || 1;
      state.pSigma[j] = (1 - cs) * state.pSigma[j] + csF * (meanDiff / dj);
    }
    let normPS = 0;
    for (let j = 0; j < n; j++) normPS += state.pSigma[j] * state.pSigma[j];
    normPS = Math.sqrt(normPS);
    // Heaviside flag (same logic as full CMA).
    const denom = Math.sqrt(1 - Math.pow(1 - cs, 2 * (state.generation + 1)));
    const hSigma = (normPS / Math.max(1e-12, denom)) < (1.4 + 2 / (n + 1)) * state.ENormal ? 1 : 0;
    // Path c (covariance evolution path).
    const cc = state.cC;
    const ccF = Math.sqrt(cc * (2 - cc) * state.muEff);
    for (let j = 0; j < n; j++) {
      const meanDiff = (newMean[j] - state.mean[j]) / state.sigma;
      state.pC[j] = (1 - cc) * state.pC[j] + hSigma * ccF * meanDiff;
    }
    // Update C diagonally: rank-1 (pC^2) + rank-µ (weighted elite (x-mean)^2).
    const c1 = state.c1, cMu = state.cMu;
    const oneMinus = 1 - c1 - cMu;
    const decay = c1 * (1 - hSigma) * cc * (2 - cc);
    for (let j = 0; j < n; j++) {
      let v = oneMinus * state.C[j]
            + c1 * state.pC[j] * state.pC[j]
            + decay * state.C[j];
      for (let k = 0; k < state.mu; k++) {
        const z = (elite[k].params[j] - state.mean[j]) / state.sigma;
        v += cMu * state.weights[k] * z * z;
      }
      state.C[j] = v;
    }
    // Step size σ.
    const ds = state.dSigma;
    state.sigma *= Math.exp((cs / ds) * (normPS / state.ENormal - 1));
    if (state.sigma > 1e3) state.sigma = 1e3;
    if (state.sigma < 1e-6) state.sigma = 1e-6;
    // Decompose: D = sqrt(C) elementwise. No Jacobi! THIS is where the
    // O(n^3) -> O(n) win lives.
    for (let j = 0; j < n; j++) {
      const cj = state.C[j];
      state.D[j] = Math.sqrt(cj > 0 ? cj : 1e-12);
    }
    state.mean = newMean;
    state.generation += 1;
  }

  function sepReset(state, opts) {
    opts = opts || {};
    const n = state.n;
    state.mean = opts.mean ? new Float64Array(opts.mean) : new Float64Array(n);
    state.sigma = opts.sigma != null ? opts.sigma : 0.5;
    for (let j = 0; j < n; j++) { state.C[j] = 1; state.D[j] = 1; }
    for (let j = 0; j < n; j++) { state.pSigma[j] = 0; state.pC[j] = 0; }
    state.generation = 0;
  }

  BF.sepCmaes = {
    create: sepCreate,
    sampleParams: sepSampleParams,
    update: sepUpdate,
    reset: sepReset,
    paramCount, genomeFromParams,
  };
})(window.BF);
