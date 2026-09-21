// BalanceForge -- multi-scale CNN policy for dodge.
//
// Two parallel conv branches read TWO grids (local + global) that the
// dodge setup produces in 'multiscale' observation mode. The two
// branches' pooled features are concatenated with the agent state and
// densed to N action outputs.
//
//   observation layout: [ agent(4), local 8x8 (64), global 8x8 (64) ] = 132
//
//   LOCAL branch  -- agent-centered window (±80 px), 8x8 cells.
//                    Captures close-quarters threats that need
//                    immediate maneuvering.
//   GLOBAL branch -- world-anchored, 8x8 cells covering the full
//                    playfield. Captures big-picture structure --
//                    where dense clusters are, where empty space is,
//                    where the next wave is forming.
//
// Branches don't share weights (the two grids represent different
// information; sharing would conflate). They DO share the dense head
// after concatenation -- that's where the policy learns "if local
// is hot AND global has an opening at +x, move +x".
//
// Designed for CMA-ES weight optimization (fixed topology). The
// param layout is:
//   [ local_conv_kernels + biases ]
//   [ global_conv_kernels + biases ]
//   [ dense1 weights + biases ]
//   [ dense2 weights + biases ]
//
// Default config produces ~600-700 params -- well within CMA-ES
// Jacobi eigendecomp's practical limit.

(function (BF) {
  'use strict';

  function defaultConfig() {
    // Default config: 16x16 grids per branch, conv 2 filters of 3x3,
    // pool 8x8 down to 2x2, dense 8 hidden. ~226 params total -- well
    // under the practical CMA-ES Jacobi ceiling (n=300 in JS).
    //
    // Why 16x16 inputs with such aggressive pooling: a CNN's WHOLE
    // POINT is that high spatial resolution at input is cheap. The
    // shared kernel scans every cell with the same weights, so going
    // from 8x8 to 16x16 only quadruples the conv MAC count -- but
    // gives the kernel 4x more locations to detect features. The
    // pool-8 step then shrinks back to 2x2 BEFORE the dense head, so
    // the dense layer (which IS where param count blows up) stays
    // small. This is exactly the design choice that makes CNNs
    // scalable in image domains.
    //
    // Param breakdown:
    //   localConv  = 2 * (3*3 + 1)             =  20
    //   globalConv = 2 * (3*3 + 1)             =  20
    //   flat after pool = 2*2*2 + 2*2*2 + 4    =  20
    //   dense1     = 20 * 8 + 8                = 168
    //   dense2     = 8 * 2 + 2                 =  18
    //   total                                  ~ 226
    //
    // Users wanting more capacity can override via
    // params.cnnMultiscaleConfig, but they'll see the BF.cmaes "n>300"
    // warning once param count climbs past that threshold.
    return {
      localGridSize:  16,
      globalGridSize: 16,
      agentStateSize: 4,
      // Per-branch conv config. Each branch has its own independent
      // filters -- they look at different inputs so weight sharing
      // would harm the policy.
      numFilters:  2,
      filterSize:  3,
      poolSize:    8,    // 16x16 -> 2x2 after pool (per branch, per filter)
      denseHidden: 8,
      numOutputs:  2,
    };
  }

  // Compute total parameter count for a given config. Used by the
  // trainer to size the CMA-ES population.
  function paramCount(config) {
    const c = config;
    const convParamsPerBranch = c.numFilters * (c.filterSize * c.filterSize + 1);
    const totalConv = 2 * convParamsPerBranch;
    const localPooledW  = Math.max(1, Math.floor(c.localGridSize  / c.poolSize));
    const globalPooledW = Math.max(1, Math.floor(c.globalGridSize / c.poolSize));
    const localFeatures  = localPooledW  * localPooledW  * c.numFilters;
    const globalFeatures = globalPooledW * globalPooledW * c.numFilters;
    const flatSize = localFeatures + globalFeatures + c.agentStateSize;
    const dense1 = flatSize * c.denseHidden + c.denseHidden;
    const dense2 = c.denseHidden * c.numOutputs + c.numOutputs;
    return totalConv + dense1 + dense2;
  }

  // Run a single conv + max-pool pass over one branch's grid. Same
  // semantics as the BF.cnnGrid forward pass, factored out so we can
  // apply it independently to each branch's input.
  // Returns { conv, pooled, pooledW }.
  function convPoolBranch(params, startOffset, image, gridSize, c) {
    const W = gridSize;
    let p = startOffset;
    const convOut = new Float64Array(W * W * c.numFilters);
    const halfK = Math.floor(c.filterSize / 2);
    for (let f = 0; f < c.numFilters; f++) {
      const kernelStart = p;
      p += c.filterSize * c.filterSize;
      const bias = params[p++];
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          let sum = bias;
          for (let ky = 0; ky < c.filterSize; ky++) {
            for (let kx = 0; kx < c.filterSize; kx++) {
              const ix = x + kx - halfK;
              const iy = y + ky - halfK;
              if (ix < 0 || ix >= W || iy < 0 || iy >= W) continue;
              sum += image[iy * W + ix] * params[kernelStart + ky * c.filterSize + kx];
            }
          }
          // ReLU activation: same as BF.cnnGrid for consistency.
          convOut[(y * W + x) * c.numFilters + f] = sum > 0 ? sum : 0;
        }
      }
    }
    // Max-pool.
    const pooledW = Math.max(1, Math.floor(W / c.poolSize));
    const pooled = new Float64Array(pooledW * pooledW * c.numFilters);
    for (let y = 0; y < pooledW; y++) {
      for (let x = 0; x < pooledW; x++) {
        for (let f = 0; f < c.numFilters; f++) {
          let mx = -Infinity;
          for (let py = 0; py < c.poolSize; py++) {
            for (let px = 0; px < c.poolSize; px++) {
              const iy = y * c.poolSize + py;
              const ix = x * c.poolSize + px;
              const v = convOut[(iy * W + ix) * c.numFilters + f];
              if (v > mx) mx = v;
            }
          }
          pooled[(y * pooledW + x) * c.numFilters + f] = mx;
        }
      }
    }
    return { conv: convOut, pooled: pooled, pooledW: pooledW, paramOffset: p };
  }

  // Forward pass through both branches + dense head.
  function forward(params, obs, config) {
    const c = config;
    const LG = c.localGridSize;
    const GG = c.globalGridSize;
    const A = c.agentStateSize;
    // Slice observation. Layout: [agent(A), local(LG*LG), global(GG*GG)].
    const agent = new Float64Array(A);
    for (let i = 0; i < A; i++) agent[i] = obs[i] || 0;
    const localImg = new Float64Array(LG * LG);
    for (let i = 0; i < LG * LG; i++) localImg[i] = obs[A + i] || 0;
    const globalImg = new Float64Array(GG * GG);
    for (let i = 0; i < GG * GG; i++) globalImg[i] = obs[A + LG * LG + i] || 0;
    let p = 0;
    // Local branch.
    const localRes = convPoolBranch(params, p, localImg, LG, c);
    p = localRes.paramOffset;
    // Global branch.
    const globalRes = convPoolBranch(params, p, globalImg, GG, c);
    p = globalRes.paramOffset;
    // Concat: local pooled features + global pooled features + agent state.
    const flatSize = localRes.pooled.length + globalRes.pooled.length + A;
    const flat = new Float64Array(flatSize);
    let off = 0;
    for (let i = 0; i < localRes.pooled.length; i++)  flat[off + i] = localRes.pooled[i];
    off += localRes.pooled.length;
    for (let i = 0; i < globalRes.pooled.length; i++) flat[off + i] = globalRes.pooled[i];
    off += globalRes.pooled.length;
    for (let i = 0; i < A; i++) flat[off + i] = agent[i];
    // Dense 1: flat -> denseHidden, tanh.
    const hidden = new Float64Array(c.denseHidden);
    for (let h = 0; h < c.denseHidden; h++) {
      let sum = params[p++];
      for (let i = 0; i < flatSize; i++) sum += flat[i] * params[p++];
      hidden[h] = Math.tanh(sum);
    }
    // Dense 2: denseHidden -> numOutputs, tanh.
    const out = new Float64Array(c.numOutputs);
    for (let o = 0; o < c.numOutputs; o++) {
      let sum = params[p++];
      for (let h = 0; h < c.denseHidden; h++) sum += hidden[h] * params[p++];
      out[o] = Math.tanh(sum);
    }
    return {
      output: out,
      hidden: hidden,
      // Intermediates per branch -- the network/CNN inset renderer
      // uses these to visualize both branches side by side.
      localImage:  localImg,
      globalImage: globalImg,
      localConv:   localRes.conv,
      globalConv:  globalRes.conv,
      localPool:   localRes.pooled,
      globalPool:  globalRes.pooled,
      localPoolW:  localRes.pooledW,
      globalPoolW: globalRes.pooledW,
    };
  }

  // Forward-pass dispatch. Routes to the WASM port when BF.wasm
  // is ready AND the toggle is on; otherwise falls back to the JS
  // reference. The WASM path returns the same output Float64Array
  // but skips the intermediate buffers (localConv, globalConv, etc.),
  // which the visualization needs. We therefore only dispatch through
  // WASM when intermediates are NOT being requested -- the trainer's
  // headless rollouts don't need them, but the displayed policy does.
  //
  // Pragmatically: the trainer evaluates ~hundreds of policies per
  // generation. Each policy runs ~1000s of forward passes per eval.
  // The displayed policy renders at 60fps. So skipping WASM for the
  // one displayed policy costs us nothing -- WASM still handles
  // 99.9%+ of forward passes.
  function forwardDispatch(params, obs, config, wantIntermediates) {
    if (!wantIntermediates
        && typeof window !== 'undefined'
        && window.BF
        && window.BF.wasm
        && window.BF.wasm.useForCnnMultiscale
        && window.BF.wasm.ready
        && window.BF.wasm.cnnMultiscale
        && window.BF.wasm.cnnMultiscale.forward) {
      return window.BF.wasm.cnnMultiscale.forward(params, obs, config);
    }
    return forward(params, obs, config);
  }

  // Policy adapter -- same shape as BF.neat.policy / BF.cnnGrid.policy
  // so the trainer's eval loop can dispatch uniformly.
  function policy(params, configOverride) {
    const cfg = Object.assign({}, defaultConfig(), configOverride || {});
    let lastResult = null;
    // wantIntermediates flag: when something reads lastLocalImage et
    // al. we lazily set this true so the next forward dispatch runs
    // the JS path. The displayed-policy renderer hits these getters
    // every frame, headless trainers don't. Self-tuning, no caller
    // changes needed.
    let needsIntermediates = false;
    return {
      config: cfg,
      get lastLocalImage()  { needsIntermediates = true; return lastResult ? lastResult.localImage  : null; },
      get lastGlobalImage() { needsIntermediates = true; return lastResult ? lastResult.globalImage : null; },
      get lastLocalConv()   { needsIntermediates = true; return lastResult ? lastResult.localConv   : null; },
      get lastGlobalConv()  { needsIntermediates = true; return lastResult ? lastResult.globalConv  : null; },
      get lastLocalPool()   { needsIntermediates = true; return lastResult ? lastResult.localPool   : null; },
      get lastGlobalPool()  { needsIntermediates = true; return lastResult ? lastResult.globalPool  : null; },
      get lastHidden()      { needsIntermediates = true; return lastResult ? lastResult.hidden      : null; },
      get lastOutput()      { return lastResult ? lastResult.output      : null; },
      command(obs) {
        lastResult = forwardDispatch(params, obs, cfg, needsIntermediates);
        return lastResult.output[0];
      },
      commandAll(obs, out) {
        lastResult = forwardDispatch(params, obs, cfg, needsIntermediates);
        const n = lastResult.output.length;
        if (!out || out.length < n) out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = lastResult.output[i];
        return out;
      },
      reset() { lastResult = null; },
    };
  }

  function randomParams(config, rng) {
    const n = paramCount(config);
    const out = new Float64Array(n);
    const r = rng || (() => Math.random() * 2 - 1);
    for (let i = 0; i < n; i++) out[i] = (r() - 0.5) * 0.5;
    return out;
  }

  BF.cnnMultiscale = {
    defaultConfig, paramCount, forward, policy, randomParams,
  };
})(window.BF);
