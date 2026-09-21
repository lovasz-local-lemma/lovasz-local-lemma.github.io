// BalanceForge — CNN-as-policy (concept showcase).
//
// Cart-pole's observation is a flat float vector (~6–11 dims) with no native
// 2D structure, so a CNN doesn't naturally fit. The trick: render the *recent
// state history* into a small 2D image (e.g. a 16×16 phase-space plot of θ
// vs angular velocity over the last K timesteps) and let the CNN read that.
//
// This will perform *worse* than an MLP — we're making the problem artificially
// harder by forcing the input through a manufactured 2D representation. The
// point is the visualization: you can see the trajectory image being built up
// each frame, and watch the CNN respond to it.
//
// Architecture (all configurable):
//   image:    imageSize × imageSize grayscale, rendered each step from history
//   conv:     numFilters of filterSize×filterSize kernels, ReLU, "same" padding
//   pool:     poolSize × poolSize max-pool
//   dense1:   flatSize → denseHidden, tanh
//   dense2:   denseHidden → 1, tanh   (cart command)
//
// Phase 1 of A2: standalone module, smoke-test only. Trainer integration and
// trajectory-image visualization come in follow-up turns.

(function (BF) {
  'use strict';

  function defaultConfig() {
    // Default sized so the parameter count (~150) is small enough that full
    // CMA-ES (with Jacobi eigendecomp on the covariance matrix) remains
    // tractable. The whole architecture is intentionally modest — this is a
    // concept showcase, not a production policy.
    return {
      imageSize: 10,
      numFilters: 2,
      filterSize: 3,
      poolSize: 2,
      denseHidden: 4,
      numOutputs: 1,
      historyLen: 30,    // how many recent states the image renders
      // Number of input channels. 1 = single phase-space image (legacy).
      // 2 = current image + frame-difference (current − previous), which
      // surfaces motion without the cost of 3D conv. The 2-channel mode
      // is a much cheaper way to give the CNN temporal awareness than
      // stacking T frames into a 3D conv.
      numChannels: 1,
      // Which observation dims to use as image coordinates. Defaults pick
      // sin(θ) on the x-axis and angular velocity on the y-axis — i.e., the
      // phase-space plot of the pendulum's tip joint.
      //
      // Fundamental limitations of this representation (worth knowing
      // before training):
      //
      // (1) sin(θ) is degenerate past 90°: sin(60°) = sin(120°) = 0.866,
      //     so the policy literally cannot tell those two states apart
      //     from the x-coordinate alone. Increasing imageSize does NOT
      //     help with this; it only sharpens position quantization.
      //     For tilt magnitudes ≤ 90° the policy can recover via the
      //     angular-velocity y-axis; past 90° an MLP or NEAT policy
      //     (which sees cos(θ) directly) will outperform this CNN.
      //
      // (2) yRange clamps angular velocity. Anything outside the range
      //     is dropped (not saturated) from the rendered image. At
      //     ~60° tilt with default gravity the natural recovery swing
      //     produces dθ/dt up to ~3.5 rad/s, which would JUST exceed
      //     the previous yRange = [-3, 3]. We widened the default to
      //     [-8, 8] which covers tilts up to ~120°. Beyond that, bump
      //     yRange via cnnConfig override or expect velocity info to
      //     be lost from the image.
      xDim: 2,
      yDim: 4,
      xRange: [-1, 1],
      yRange: [-8, 8],
    };
  }

  // Total number of flat parameters needed for the given config. The
  // numChannels factor only affects the conv layer (one set of kernel
  // weights per channel per filter, plus one bias per filter).
  function paramCount(config) {
    const c = config;
    const channels = Math.max(1, c.numChannels | 0) || 1;
    const convParams = c.numFilters * (channels * c.filterSize * c.filterSize + 1);
    const pooledW = Math.max(1, Math.floor(c.imageSize / c.poolSize));
    const flatSize = pooledW * pooledW * c.numFilters;
    const dense1 = flatSize * c.denseHidden + c.denseHidden;
    const dense2 = c.denseHidden * c.numOutputs + c.numOutputs;
    return convParams + dense1 + dense2;
  }

  // Render a phase-space trajectory image from a state history. Each entry in
  // `history` should be the same shape (same length); we read coords from
  // config.xDim and config.yDim. Recent points are brighter so the image
  // encodes direction implicitly.
  function renderPhaseSpace(history, config) {
    const c = config;
    const W = c.imageSize;
    const image = new Float64Array(W * W);
    const len = history.length;
    if (len === 0) return image;
    for (let i = 0; i < len; i++) {
      const obs = history[i];
      const xv = obs[c.xDim] != null ? obs[c.xDim] : 0;
      const yv = obs[c.yDim] != null ? obs[c.yDim] : 0;
      const fx = (xv - c.xRange[0]) / (c.xRange[1] - c.xRange[0]);
      const fy = (yv - c.yRange[0]) / (c.yRange[1] - c.yRange[0]);
      const px = Math.floor(fx * W);
      const py = Math.floor(fy * W);
      if (px < 0 || px >= W || py < 0 || py >= W) continue;
      // Recency-weighted brightness, max-blended into the bin.
      const intensity = (i + 1) / len;
      const idx = py * W + px;
      if (intensity > image[idx]) image[idx] = intensity;
    }
    return image;
  }

  // Forward pass. Returns
  //   { output, conv, pool, hidden }
  // where `output` is the command (Float64Array(numOutputs)) and the other
  // fields are the activation maps from each intermediate layer. Surfacing
  // intermediates lets the network panel render what each layer looks like
  // in real time.
  //
  // Parameter layout in `params`:
  //   conv kernels (one per filter, each filterSize²+1 floats)
  //   dense1 (flat → denseHidden), interleaved bias-then-weights per neuron
  //   dense2 (denseHidden → numOutputs), same convention
  function forward(params, image, config) {
    const c = config;
    const W = c.imageSize;
    const C = Math.max(1, c.numChannels | 0) || 1;
    let p = 0;

    // Convolution layer (same padding, stride 1, ReLU).
    // Image layout when C > 1 is interleaved [(y, x, ch)] to match
    // convOut's [(y, x, f)] layout. When C === 1 the layout collapses
    // to [(y, x)] -- identical to the legacy single-channel image. So
    // 1-channel callers don't need to change anything.
    // Kernel layout per filter: filterSize*filterSize*C weights laid
    // out as [(ky, kx, ch)], then 1 bias. For C === 1 this is the same
    // pre-extension layout, so saved 1-channel param vectors stay
    // forward-compatible.
    const convOut = new Float64Array(W * W * c.numFilters);
    const halfK = Math.floor(c.filterSize / 2);
    for (let f = 0; f < c.numFilters; f++) {
      const kernelStart = p;
      p += c.filterSize * c.filterSize * C;
      const bias = params[p++];
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          let sum = bias;
          for (let ky = 0; ky < c.filterSize; ky++) {
            for (let kx = 0; kx < c.filterSize; kx++) {
              const ix = x + kx - halfK;
              const iy = y + ky - halfK;
              if (ix < 0 || ix >= W || iy < 0 || iy >= W) continue;
              for (let ch = 0; ch < C; ch++) {
                const imgIdx  = (iy * W + ix) * C + ch;
                const kernIdx = kernelStart + (ky * c.filterSize + kx) * C + ch;
                sum += image[imgIdx] * params[kernIdx];
              }
            }
          }
          convOut[(y * W + x) * c.numFilters + f] = sum > 0 ? sum : 0;
        }
      }
    }

    // Max-pool. If imageSize doesn't divide evenly by poolSize the remainder
    // is silently dropped, which is fine for our standard 16/2 case.
    const pooledW = Math.floor(W / c.poolSize);
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

    // Dense 1: flat → denseHidden, tanh.
    const flatSize = pooledW * pooledW * c.numFilters;
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
    return { output: out, conv: convOut, pool: pooled, hidden: hidden };
  }

  // Stateful policy adapter: looks like a NEAT/CMA-ES policy from the trainer's
  // perspective (has .command(obs)), but internally maintains rolling state
  // history and renders a fresh image each step before invoking the CNN.
  function policy(params, configOverride) {
    const cfg = Object.assign({}, defaultConfig(), configOverride || {});
    const channels = Math.max(1, cfg.numChannels | 0) || 1;
    const history = [];
    // Previous frame's phase-space image, used as channel 2's reference
    // for the frame-difference encoding. null on the first step (we
    // emit zeros for the diff channel until we have a baseline).
    let previousImage = null;
    return {
      config: cfg,
      history: history,
      lastImage: null,
      lastConv: null,
      lastPool: null,
      lastHidden: null,
      lastOutput: 0,
      command(obs) {
        // Keep our own snapshot so the trainer can't mutate it under us.
        history.push(obs.slice ? obs.slice() : Array.prototype.slice.call(obs));
        if (history.length > cfg.historyLen) history.shift();
        const W = cfg.imageSize;
        const currentImage = renderPhaseSpace(history, cfg);
        // Build the conv input. 1-channel: pass the phase-space image
        // straight through (interleaved layout collapses to flat).
        // 2-channel: stack the current image AND the frame-difference
        // (current − previous) into the channel axis, so the CNN sees
        // both "where is the trajectory now" and "how is it moving"
        // without the cost of a 3D conv.
        let convInput;
        if (channels === 1) {
          convInput = currentImage;
        } else {
          convInput = new Float64Array(W * W * channels);
          for (let i = 0; i < W * W; i++) {
            convInput[i * channels + 0] = currentImage[i];
            convInput[i * channels + 1] = previousImage ? (currentImage[i] - previousImage[i]) : 0;
            // Extra channels (if a config picks numChannels > 2) get
            // zeros for now -- the architecture only meaningfully uses
            // 1 or 2 channels today.
            for (let ch = 2; ch < channels; ch++) convInput[i * channels + ch] = 0;
          }
          // Persist the current image as the baseline for next step's diff.
          previousImage = currentImage;
        }
        // lastImage stays the SINGLE-channel phase-space image so the
        // existing CNN inset renderer (which assumes W*W) doesn't need
        // to know about channels.
        this.lastImage = currentImage;
        const result = forward(params, convInput, cfg);
        this.lastConv = result.conv;
        this.lastPool = result.pool;
        this.lastHidden = result.hidden;
        this.lastOutput = result.output[0];
        return result.output[0];
      },
      reset() {
        history.length = 0;
        previousImage = null;
        this.lastImage = null;
        this.lastConv = null;
        this.lastPool = null;
        this.lastHidden = null;
        this.lastOutput = 0;
      },
    };
  }

  // Build a flat random parameter vector for testing — equivalent to "random
  // init" for the CNN policy. CMA-ES/DE will eventually own this; for now it's
  // useful for the smoke test.
  function randomParams(config, rng) {
    const n = paramCount(config);
    const out = new Float64Array(n);
    const r = rng || (() => Math.random() * 2 - 1);
    for (let i = 0; i < n; i++) out[i] = (r() - 0.5) * 0.5;
    return out;
  }

  BF.cnn = {
    defaultConfig, paramCount, renderPhaseSpace, forward, policy, randomParams,
  };
})(window.BF);
