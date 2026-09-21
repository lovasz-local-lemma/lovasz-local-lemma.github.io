// BalanceForge -- 2D CNN policy for grid observations.
//
// Unlike BF.cnn (which manufactures an image from pendulum state history),
// this CNN reads a grid that the SETUP already produced as part of the
// observation. Two setups feed it today:
//   dodge, grid mode        [ agent_state (4 floats), 16x16 grid (256) ]
//   terrain-run, patch mode [ proprio (6 floats), 2 x 8 x 12 patch (192) ]
// We slice the grid back into a (channels x gridH x gridW) image, run
// conv + pool, concatenate the pooled features with the agent state, and
// dense down to N actions.
//
// SHAPE FIELDS. gridSize is the legacy SQUARE, single-channel shorthand
// (what the dodge grid is). gridW / gridH / channels generalise it to a
// non-square, multi-channel patch; poolW / poolH do the same for the pool
// window. Each of those falls back to its square/1-channel counterpart when
// left at 0, so every pre-existing config keeps its exact behaviour:
// with channels = 1 and gridW = gridH = gridSize the forward pass reduces
// term-for-term to the original one (same parameter layout, same traversal
// order, same reads) -- verified bit-for-bit against the pre-change module
// in smoke-test.js.
//
// The grid slice is expected CHANNEL-MAJOR, i.e. obs[A + ch*gridW*gridH +
// row*gridW + col]. That is the order terrain-run's 'patch' encoding writes
// (solid plane, then hazard plane) and it is trivially the order a
// single-channel grid writes.
//
// Designed for CMA-ES / sep-CMA-ES weight optimization (fixed topology).
// Multi-output is first-class: numOutputs is read from config and the
// policy exposes commandAll(obs, out) so the trainer's multi-action eval
// loop works uniformly with NEAT or with this CNN.

(function (BF) {
  'use strict';

  function defaultConfig() {
    // Default sized so total param count stays in the few-hundreds range,
    // keeping CMA-ES Jacobi eigendecomp tractable. With these defaults:
    //   conv  =  2 * (1*3*3 + 1)      =  20
    //   dense1= (32 + 4) * 8 + 8      = 296
    //   dense2= 8 * 2 + 2             =  18
    //   total ~334
    // The grid CNN sees a 16x16 input pooled 4x4 down to a 4x4x2 feature
    // grid; that's enough spatial resolution for the agent's immediate
    // neighborhood at this scale.
    return {
      gridSize:    16,   // square shorthand; gridW/gridH default from it
      gridW:        0,   // 0 => gridSize
      gridH:        0,   // 0 => gridSize
      channels:     1,   // input planes stacked channel-major in the obs
      agentStateSize: 4,
      numFilters:  2,
      filterSize:  3,
      poolSize:    4,    // square shorthand; poolW/poolH default from it
      poolW:        0,   // 0 => poolSize
      poolH:        0,   // 0 => poolSize
      denseHidden: 8,
      numOutputs:  2,
    };
  }

  // Normalise a (possibly partial, possibly square-shorthand) config into one
  // with concrete gridW/gridH/channels/poolW/poolH plus the derived pooled
  // dimensions. Idempotent, and flagged so the hot path can skip the work:
  // policy() resolves once at construction and forward() then only reads a
  // property. Callers outside this file (renderers, param-count probes) can
  // call it directly to learn the real shape of a stored config.
  function resolveConfig(config) {
    if (config && config._resolved === true) return config;
    const c = Object.assign({}, defaultConfig(), config || {});
    const g = (c.gridSize | 0) > 0 ? (c.gridSize | 0) : 16;
    c.gridSize = g;
    c.gridW = (c.gridW | 0) > 0 ? (c.gridW | 0) : g;
    c.gridH = (c.gridH | 0) > 0 ? (c.gridH | 0) : g;
    c.channels = (c.channels | 0) > 0 ? (c.channels | 0) : 1;
    const p = (c.poolSize | 0) > 0 ? (c.poolSize | 0) : 1;
    c.poolSize = p;
    c.poolW = (c.poolW | 0) > 0 ? (c.poolW | 0) : p;
    c.poolH = (c.poolH | 0) > 0 ? (c.poolH | 0) : p;
    c.pooledW = Math.max(1, Math.floor(c.gridW / c.poolW));
    c.pooledH = Math.max(1, Math.floor(c.gridH / c.poolH));
    c.agentStateSize = Math.max(0, c.agentStateSize | 0);
    c._resolved = true;
    return c;
  }

  // How many observation floats this config consumes: the agent-state prefix
  // plus every channel plane. Lets a caller assert "the genome I am about to
  // evolve reads exactly the vector this setup emits" instead of discovering
  // a mismatch as silently-zero inputs.
  function inputCount(config) {
    const c = resolveConfig(config);
    return c.agentStateSize + c.channels * c.gridW * c.gridH;
  }

  function paramCount(config) {
    const c = resolveConfig(config);
    // One kernel per filter spans EVERY input channel, plus one bias.
    const convParams = c.numFilters * (c.channels * c.filterSize * c.filterSize + 1);
    const flatSize = c.pooledW * c.pooledH * c.numFilters + c.agentStateSize;
    const dense1 = flatSize * c.denseHidden + c.denseHidden;
    const dense2 = c.denseHidden * c.numOutputs + c.numOutputs;
    return convParams + dense1 + dense2;
  }

  // Forward pass. Slices the observation into (gridImage, agentState),
  // runs conv + pool over the grid, concats the pooled features with
  // the agent state, and dense-projects to numOutputs actions (tanh).
  //
  // Returns intermediates so the optional UI inset can render them.
  function forward(params, obs, config) {
    const c = resolveConfig(config);
    const W = c.gridW, H = c.gridH, CH = c.channels;
    const A = c.agentStateSize;
    const plane = W * H;
    // Slice the observation. First A floats = agent state; the rest = the
    // channel planes, channel-major.
    const agent = new Float64Array(A);
    for (let i = 0; i < A; i++) agent[i] = obs[i] || 0;
    const image = new Float64Array(CH * plane);
    for (let i = 0; i < CH * plane; i++) image[i] = obs[A + i] || 0;

    let p = 0;
    // Convolution layer (same padding, stride 1, ReLU). Each filter's kernel
    // is channels x filterSize x filterSize, laid out channel-major, followed
    // by that filter's single bias -- the single-channel case is exactly the
    // original filterSize^2 + bias layout, so old parameter vectors still
    // decode identically.
    const convOut = new Float64Array(plane * c.numFilters);
    const halfK = Math.floor(c.filterSize / 2);
    const KS = c.filterSize;
    for (let f = 0; f < c.numFilters; f++) {
      const kernelStart = p;
      p += CH * KS * KS;
      const bias = params[p++];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let sum = bias;
          for (let ch = 0; ch < CH; ch++) {
            const chOff = ch * plane;
            const kOff = kernelStart + ch * KS * KS;
            for (let ky = 0; ky < KS; ky++) {
              const iy = y + ky - halfK;
              if (iy < 0 || iy >= H) continue;
              const rowOff = chOff + iy * W;
              const kRow = kOff + ky * KS;
              for (let kx = 0; kx < KS; kx++) {
                const ix = x + kx - halfK;
                if (ix < 0 || ix >= W) continue;
                sum += image[rowOff + ix] * params[kRow + kx];
              }
            }
          }
          convOut[(y * W + x) * c.numFilters + f] = sum > 0 ? sum : 0;
        }
      }
    }

    // Max-pool. Drops the remainder when the grid doesn't divide evenly.
    const pooledW = c.pooledW, pooledH = c.pooledH;
    const pooled = new Float64Array(pooledW * pooledH * c.numFilters);
    for (let y = 0; y < pooledH; y++) {
      for (let x = 0; x < pooledW; x++) {
        for (let f = 0; f < c.numFilters; f++) {
          let mx = -Infinity;
          for (let py = 0; py < c.poolH; py++) {
            for (let px = 0; px < c.poolW; px++) {
              const iy = y * c.poolH + py;
              const ix = x * c.poolW + px;
              const v = convOut[(iy * W + ix) * c.numFilters + f];
              if (v > mx) mx = v;
            }
          }
          pooled[(y * pooledW + x) * c.numFilters + f] = mx;
        }
      }
    }

    // Concat pooled grid features with the agent state vector. Putting
    // the agent state AFTER the pooled features keeps the param layout
    // simple (no per-feature interleave); the dense layer treats both
    // sources symmetrically through learned weights.
    const flatSize = pooledW * pooledH * c.numFilters + A;
    const flat = new Float64Array(flatSize);
    for (let i = 0; i < pooled.length; i++) flat[i] = pooled[i];
    for (let i = 0; i < A; i++) flat[pooled.length + i] = agent[i];

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
    return { output: out, conv: convOut, pool: pooled, hidden: hidden, image: image };
  }

  // Policy adapter — trainer-facing interface mirrors BF.neat.policy:
  // .command(obs) returns outputs[0] (1D-compat), .commandAll(obs, out)
  // writes every output and returns the array. The trainer's eval loop
  // dispatches to commandAll when setup.actionCount > 1, so multi-output
  // policies (dodge, terrain-run) and 1-output policies (cart-pole) share
  // the same call site.
  function policy(params, configOverride) {
    const cfg = resolveConfig(configOverride);
    let lastResult = null;
    return {
      config: cfg,
      // Exposed for the network/CNN inset renderer to read on demand.
      get lastImage()  { return lastResult ? lastResult.image  : null; },
      get lastConv()   { return lastResult ? lastResult.conv   : null; },
      get lastPool()   { return lastResult ? lastResult.pool   : null; },
      get lastHidden() { return lastResult ? lastResult.hidden : null; },
      // Full output vector (length numOutputs) so the multi-output
      // network panel can render a bar per action axis.
      get lastOutput() { return lastResult ? lastResult.output : null; },
      command(obs) {
        lastResult = forward(params, obs, cfg);
        return lastResult.output[0];
      },
      commandAll(obs, out) {
        lastResult = forward(params, obs, cfg);
        const n = lastResult.output.length;
        if (!out || out.length < n) out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = lastResult.output[i];
        return out;
      },
      reset() { lastResult = null; },
    };
  }

  // Convenience: build a small random parameter vector for smoke tests.
  function randomParams(config, rng) {
    const n = paramCount(config);
    const out = new Float64Array(n);
    const r = rng || (() => Math.random() * 2 - 1);
    for (let i = 0; i < n; i++) out[i] = (r() - 0.5) * 0.5;
    return out;
  }

  BF.cnnGrid = {
    defaultConfig, resolveConfig, inputCount, paramCount, forward, policy, randomParams,
  };
})(window.BF);
