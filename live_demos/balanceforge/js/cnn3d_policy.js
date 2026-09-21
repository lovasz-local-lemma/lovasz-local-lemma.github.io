// BalanceForge — 3D CNN-as-policy.
//
// Generalizes the 2D phase-space CNN to a 3D spatio-temporal volume. Two
// input modes determine what the third dimension represents:
//
//   'temporal'  (default) — T frames stacked along the depth axis. Each
//                slice is a phase-space image of one timestep's state
//                (sin θ × ang_vel). The conv learns spatio-TEMPORAL
//                patterns: e.g. "swinging-then-decelerating at this
//                angular velocity". Most natural 3D-CNN extension of
//                the 2D version — the kernel can reason about HOW state
//                evolves, not just where it currently is.
//
//   'spatial'   — A single 3D occupancy volume where the third axis is
//                another state dimension (cart_x by default). Each
//                recent observation contributes ONE voxel at
//                (sin θ_bin, ang_vel_bin, cart_x_bin), recency-weighted.
//                The conv learns 3D-state-space patterns. Less obvious
//                payoff than temporal mode, but distinct visual
//                signature — you can see the system traversing a 3D
//                manifold.
//
// Architecture (configurable):
//   volume:    depthSize × imageSize × imageSize, each voxel a recency-
//              weighted intensity.
//   conv:     numFilters of (filterDepth × filterSize × filterSize)
//              kernels, ReLU, "valid" temporal padding + "same" spatial.
//   pool:     poolSize × poolSize spatial max-pool, no depth pool by default.
//   dense1:   flat → denseHidden, tanh.
//   dense2:   denseHidden → 1, tanh   (cart command).
//
// Same parameter-vector encoding as the 2D version so CMA-ES / DE / etc.
// can drive it identically — paramCount(config) gives the dimension.
//
// Visualization-friendly outputs: the policy exposes lastVolume,
// lastConv, lastPool so the canvas inset can render flipbook /
// 3-axis slices / most-active filter highlights.

(function (BF) {
  'use strict';

  function defaultConfig() {
    return {
      inputMode:    'temporal',  // 'temporal' or 'spatial'
      // Defaults tuned MORE AGGRESSIVELY than the original sizing so the
      // 3D CNN is at least usable as a comparison baseline. The original
      // defaults (depth 4, image 6, filterDepth 2, denseHidden 3) produced
      // ~207 params; the CMA-ES Jacobi eigendecomp on those (~80ms) plus
      // the per-step 3D conv cost made gens drag at 3-4s each on the
      // default popSize. The new defaults (depth 3, image 5, filterDepth
      // 1, denseHidden 2) produce ~70 params -- eigendecomp drops to a
      // few ms, gens become comparable to the 2D CNN, and the user can
      // crank values back up if they want richer kernels.
      // Honestly: for cart-pole, the 2D CNN with numChannels=2 (frame
      // difference, BF.cnn) gets you most of the temporal expressivity
      // 3D was supposed to provide, for far less compute. 3D CNN here
      // is mostly an educational "what does a 3D conv cost?" baseline.
      depthSize:    3,           // T (temporal) or D (spatial — cart_x bins)
      imageSize:    5,           // spatial H = W
      numFilters:   2,
      filterSize:   3,           // spatial kernel
      filterDepth:  1,           // depth-axis kernel; 1 = degenerate to 2D
      poolSize:     2,           // spatial pool
      denseHidden:  2,
      numOutputs:   1,
      historyLen:   30,          // observations remembered
      // Image axes (phase-space defaults — same as 2D CNN).
      xDim:    2,
      yDim:    4,
      xRange:  [-1, 1],
      yRange:  [-3, 3],
      // For spatial mode: which obs dim becomes the depth axis. Default 0
      // (cart_x). Range is configurable.
      zDim:    0,
      zRange:  [-1.5, 1.5],
    };
  }

  // Total flat parameter count for a given config.
  function paramCount(config) {
    const c = config;
    const kernelVol = c.filterDepth * c.filterSize * c.filterSize;
    const convParams = c.numFilters * (kernelVol + 1);  // weights + bias per filter
    // Conv "valid" depth: outputDepth = depthSize - filterDepth + 1.
    const outDepth = Math.max(1, c.depthSize - c.filterDepth + 1);
    const pooledW = Math.max(1, Math.floor(c.imageSize / c.poolSize));
    const flatSize = outDepth * pooledW * pooledW * c.numFilters;
    const dense1 = flatSize * c.denseHidden + c.denseHidden;
    const dense2 = c.denseHidden * c.numOutputs + c.numOutputs;
    return convParams + dense1 + dense2;
  }

  // ----------------- INPUT VOLUME CONSTRUCTION ------------------------------

  // Render the input volume from a state history. Returns a Float64Array of
  // length depthSize × imageSize × imageSize.
  //
  // Temporal mode: the T most recent observations each become a 2D phase-
  // space slice. Older slices get fainter intensity (recency weighting),
  // and slices stack along the depth axis with most-recent first.
  //
  // Spatial mode: ALL history points binned into one 3D occupancy map at
  // (cart_x_bin, sin_θ_bin, ang_vel_bin), max-blended with recency weight.
  function renderVolume(history, config) {
    const c = config;
    const D = c.depthSize, H = c.imageSize, W = c.imageSize;
    const volume = new Float64Array(D * H * W);
    const len = history.length;
    if (len === 0) return volume;

    if (c.inputMode === 'spatial') {
      for (let i = 0; i < len; i++) {
        const obs = history[i];
        const xv = obs[c.xDim] != null ? obs[c.xDim] : 0;
        const yv = obs[c.yDim] != null ? obs[c.yDim] : 0;
        const zv = obs[c.zDim] != null ? obs[c.zDim] : 0;
        const fx = (xv - c.xRange[0]) / (c.xRange[1] - c.xRange[0]);
        const fy = (yv - c.yRange[0]) / (c.yRange[1] - c.yRange[0]);
        const fz = (zv - c.zRange[0]) / (c.zRange[1] - c.zRange[0]);
        const px = Math.floor(fx * W);
        const py = Math.floor(fy * H);
        const pz = Math.floor(fz * D);
        if (px < 0 || px >= W || py < 0 || py >= H || pz < 0 || pz >= D) continue;
        const intensity = (i + 1) / len;
        const idx = pz * H * W + py * W + px;
        if (intensity > volume[idx]) volume[idx] = intensity;
      }
      return volume;
    }

    // Temporal mode. Each of the LAST D slices is a phase-space image of one
    // timestep — slice 0 = oldest in the window, slice D-1 = most recent.
    // We bin a fixed window of the history (most recent D entries) one
    // observation per slice for simplicity.
    const start = Math.max(0, len - D);
    for (let s = start; s < len; s++) {
      const sliceIdx = s - start;  // 0 .. D-1
      const obs = history[s];
      const xv = obs[c.xDim] != null ? obs[c.xDim] : 0;
      const yv = obs[c.yDim] != null ? obs[c.yDim] : 0;
      const fx = (xv - c.xRange[0]) / (c.xRange[1] - c.xRange[0]);
      const fy = (yv - c.yRange[0]) / (c.yRange[1] - c.yRange[0]);
      const px = Math.floor(fx * W);
      const py = Math.floor(fy * H);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      // Single bright voxel per timestep slice — value 1.0 since each slice
      // has its own depth coordinate carrying the temporal info.
      const idx = sliceIdx * H * W + py * W + px;
      volume[idx] = 1.0;
    }
    return volume;
  }

  // ----------------- 3D CONV + POOL FORWARD --------------------------------

  // Forward pass. Returns intermediates for visualization.
  // Parameter layout:
  //   per filter: (filterDepth × filterSize × filterSize) weights + 1 bias
  //   dense1: bias-then-weights per neuron, size (denseHidden × (1 + flatSize))
  //   dense2: bias-then-weights per output, size (numOutputs × (1 + denseHidden))
  function forward(params, volume, config) {
    const c = config;
    const D = c.depthSize, H = c.imageSize, W = c.imageSize;
    const fD = c.filterDepth, fS = c.filterSize;
    const halfS = Math.floor(fS / 2);
    const outD = Math.max(1, D - fD + 1);
    let p = 0;

    // 3D convolution: VALID padding along depth, SAME along spatial.
    const convOut = new Float64Array(outD * H * W * c.numFilters);
    for (let f = 0; f < c.numFilters; f++) {
      const kStart = p;
      p += fD * fS * fS;
      const bias = params[p++];
      for (let oz = 0; oz < outD; oz++) {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            let sum = bias;
            for (let kz = 0; kz < fD; kz++) {
              const iz = oz + kz;
              if (iz < 0 || iz >= D) continue;
              for (let ky = 0; ky < fS; ky++) {
                const iy = y + ky - halfS;
                if (iy < 0 || iy >= H) continue;
                for (let kx = 0; kx < fS; kx++) {
                  const ix = x + kx - halfS;
                  if (ix < 0 || ix >= W) continue;
                  const vIdx = iz * H * W + iy * W + ix;
                  const kIdx = kStart + kz * fS * fS + ky * fS + kx;
                  sum += volume[vIdx] * params[kIdx];
                }
              }
            }
            convOut[((oz * H + y) * W + x) * c.numFilters + f] = sum > 0 ? sum : 0;
          }
        }
      }
    }

    // Max-pool spatially (no depth pool — preserves temporal/depth structure).
    const pooledW = Math.floor(W / c.poolSize);
    const pooledH = Math.floor(H / c.poolSize);
    const pooled = new Float64Array(outD * pooledH * pooledW * c.numFilters);
    for (let z = 0; z < outD; z++) {
      for (let y = 0; y < pooledH; y++) {
        for (let x = 0; x < pooledW; x++) {
          for (let f = 0; f < c.numFilters; f++) {
            let mx = -Infinity;
            for (let py = 0; py < c.poolSize; py++) {
              for (let px = 0; px < c.poolSize; px++) {
                const iy = y * c.poolSize + py;
                const ix = x * c.poolSize + px;
                const v = convOut[((z * H + iy) * W + ix) * c.numFilters + f];
                if (v > mx) mx = v;
              }
            }
            pooled[((z * pooledH + y) * pooledW + x) * c.numFilters + f] = mx;
          }
        }
      }
    }

    // Dense 1: flat → denseHidden, tanh.
    const flatSize = outD * pooledH * pooledW * c.numFilters;
    const hidden = new Float64Array(c.denseHidden);
    for (let h = 0; h < c.denseHidden; h++) {
      let sum = params[p++];
      for (let i = 0; i < flatSize; i++) sum += pooled[i] * params[p++];
      hidden[h] = Math.tanh(sum);
    }

    // Dense 2: denseHidden → numOutputs, tanh.
    const out = new Float64Array(c.numOutputs);
    for (let o = 0; o < c.numOutputs; o++) {
      let sum = params[p++];
      for (let h = 0; h < c.denseHidden; h++) sum += hidden[h] * params[p++];
      out[o] = Math.tanh(sum);
    }

    return {
      output: out,
      conv: convOut,        // outD × H × W × F
      pool: pooled,         // outD × pooledH × pooledW × F
      hidden: hidden,
      // Per-filter activation total — used by the most-active-filter viz to
      // pick which filter to render.
      filterActivations: filterActivationSums(convOut, outD, H, W, c.numFilters),
    };
  }

  function filterActivationSums(conv, D, H, W, F) {
    const sums = new Float64Array(F);
    const cells = D * H * W;
    for (let i = 0; i < cells; i++) {
      const base = i * F;
      for (let f = 0; f < F; f++) sums[f] += conv[base + f];
    }
    return sums;
  }

  // Stateful policy adapter — builds the volume from a rolling history each
  // step, then runs the forward pass. Same .command(obs) interface as the
  // 2D CNN policy and as NEAT, so the trainer treats it uniformly.
  function policy(params, configOverride) {
    const cfg = Object.assign({}, defaultConfig(), configOverride || {});
    const history = [];
    return {
      config: cfg,
      history: history,
      lastVolume: null,
      lastConv: null,
      lastPool: null,
      lastHidden: null,
      lastOutput: 0,
      lastFilterActivations: null,
      command(obs) {
        history.push(obs.slice ? obs.slice() : Array.prototype.slice.call(obs));
        if (history.length > cfg.historyLen) history.shift();
        const vol = renderVolume(history, cfg);
        this.lastVolume = vol;
        const result = forward(params, vol, cfg);
        this.lastConv = result.conv;
        this.lastPool = result.pool;
        this.lastHidden = result.hidden;
        this.lastOutput = result.output[0];
        this.lastFilterActivations = result.filterActivations;
        return result.output[0];
      },
      reset() {
        history.length = 0;
        this.lastVolume = null;
        this.lastConv = null;
        this.lastPool = null;
        this.lastHidden = null;
        this.lastOutput = 0;
        this.lastFilterActivations = null;
      },
    };
  }

  // Random init (CMA-ES uses its own sampling; this is for tests).
  function randomParams(config, rng) {
    const n = paramCount(config);
    const out = new Float64Array(n);
    const r = rng || (() => Math.random());
    for (let i = 0; i < n; i++) out[i] = (r() - 0.5) * 0.5;
    return out;
  }

  // Extract a single (D-axis) slice of the volume — utility used by the
  // canvas inset to render flipbook frames or fixed-depth slices.
  // Returns a Float64Array of length H*W.
  function extractSlice(volume, config, depthIdx) {
    const c = config;
    const H = c.imageSize, W = c.imageSize;
    const out = new Float64Array(H * W);
    const offset = depthIdx * H * W;
    for (let i = 0; i < H * W; i++) out[i] = volume[offset + i];
    return out;
  }

  // Extract the spatial weight map of one filter at a chosen depth-kernel
  // slice. Used to render "most-active filter" mini-grids.
  function extractFilterKernel(params, config, filterIdx, kernelDepth) {
    const c = config;
    const fS = c.filterSize, fD = c.filterDepth;
    const stride = fD * fS * fS + 1;
    const filterStart = filterIdx * stride;
    const out = new Float64Array(fS * fS);
    const base = filterStart + kernelDepth * fS * fS;
    for (let i = 0; i < fS * fS; i++) out[i] = params[base + i];
    return out;
  }

  BF.cnn3d = {
    defaultConfig, paramCount, renderVolume, forward, policy, randomParams,
    extractSlice, extractFilterKernel,
  };
})(window.BF);
