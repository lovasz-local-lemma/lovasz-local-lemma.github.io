// BalanceForge -- recurrent (leaky-integrator) policy.
//
// WHY THIS EXISTS. Some tasks are not solvable by a reactive controller
// because the information the controller needs is not in the current
// observation. The shipped example is the single pendulum under OBSERVATION
// DROPOUT (setups.js, single.setObservationMode('blind-dropout')): a fresh
// reading arrives only every K-th control step and every channel is zeroed in
// between. A memoryless policy's input is then LITERALLY IDENTICAL on every
// stale step, so its output is a constant -- it cannot hold a command. This
// policy can, because it carries state across steps.
//
// THE DESIGN. The genome stays an ORDINARY FEED-FORWARD MLP. It just has
// memSize extra INPUTS and memSize extra OUTPUTS, and this wrapper copies the
// extra outputs of step t into the extra inputs of step t+1 through a leaky
// integrator:
//
//     mem[k] <- (1 - leak) * mem[k] + leak * out[numOutputs + k]
//     in     =  [ obs(obsCount) , mem(memSize) ]
//     cmd    =  out[0 .. numOutputs-1]
//
// So CMA-ES / sep-CMA-ES / DE optimise the SAME flat parameter vector they
// always did, with no special-casing anywhere in the optimiser. Only the
// dimension changes (via the trainer's dimOverride seam), exactly like the CNN
// policy types.
//
// PARAMETER LAYOUT is byte-for-byte BF.cmaes.genomeFromParams' layout for an
// (obsCount+memSize) -> hidden -> (numOutputs+memSize) MLP: every hidden
// layer's biases first (front to back), then every weight block source-major
// (input->layer0, layer_{k-1}->layer_k, last->output), then the output biases.
// forward() below is a fast typed-array reimplementation of that decode, and
// smoke-test.js asserts it BIT-EQUAL to BF.neat's genome forward pass -- if it
// ever drifts, the numbers stop describing a policy this app would run.
//
// HIDDEN STATE RESETS PER ROLLOUT BY CONSTRUCTION: `mem` is allocated inside
// policy(), and the trainer calls makePolicy once per rollout. There is no
// module-scoped state here on purpose; smoke-test.js has a leak test with
// power (a deliberately shared state changes the fitness, so the test can
// detect leakage).
//
// SEVER is the foil. config.sever (or policy(..., { sever: true })) forces the
// memory inputs to 0 while leaving every weight untouched. Running a TRAINED
// recurrent champion with sever on is the ablation that shows the memory is
// load-bearing rather than decorative.

(function (BF) {
  'use strict';

  function defaultConfig() {
    // Defaults are the SHIPPED recurrent preset's shape:
    //   inputs  = 6 obs + 8 memory = 14
    //   hidden  = 16 (tanh)
    //   outputs = 1 command + 8 memory = 9
    //   params  = 16 + 14*16 + 16*9 + 9 = 393
    return {
      obsCount:   6,     // observation floats the setup emits (forced by the trainer)
      numOutputs: 1,     // real actions (forced from setup.actionCount)
      memSize:    8,     // H: recurrent channels carried step to step
      hidden:     16,    // int, or an array of layer widths; 0 = linear
      leak:       0.2,   // 1.0 = no integration (pure one-step feedback)
      sever:      false, // ablation: hold the memory inputs at 0
    };
  }

  // Normalise `hidden` (int or array) into an array of positive widths, the
  // same way BF.cmaes._hiddenSizes does -- so paramCount/forward and
  // BF.cmaes.paramCount/genomeFromParams can never disagree about the shape.
  function hiddenSizes(hidden) {
    if (Array.isArray(hidden)) {
      const out = [];
      for (const h of hidden) { const n = h | 0; if (n > 0) out.push(n); }
      return out;
    }
    const n = hidden | 0;
    return n > 0 ? [n] : [];
  }

  // Idempotent; flagged so the hot path can skip the work. Callers outside
  // this file (trainer, network panel, probes) may call it to learn the real
  // shape of a stored config.
  function resolveConfig(config) {
    if (config && config._resolved === true) return config;
    const c = Object.assign({}, defaultConfig(), config || {});
    c.obsCount   = Math.max(1, c.obsCount | 0);
    c.numOutputs = Math.max(1, c.numOutputs | 0);
    c.memSize    = Math.max(0, c.memSize | 0);
    const leak = Number(c.leak);
    c.leak = Number.isFinite(leak) ? Math.max(0, Math.min(1, leak)) : 0.2;
    c.sever = !!c.sever;
    c.sizes = hiddenSizes(c.hidden);
    // The WRAPPED MLP's shape -- what the parameter vector actually encodes.
    c.wrappedInputs  = c.obsCount + c.memSize;
    c.wrappedOutputs = c.numOutputs + c.memSize;
    c._resolved = true;
    return c;
  }

  // How many observation floats this policy consumes. The trainer compares it
  // against setup.observationCount so "genome width == world width" is an
  // assertion, not a hope.
  function inputCount(config) { return resolveConfig(config).obsCount; }

  function paramCount(config) {
    const c = resolveConfig(config);
    return BF.cmaes.paramCount(c.wrappedInputs, c.wrappedOutputs, c.sizes);
  }

  // Decode the flat vector into typed layers ONCE, then run a plain MLP.
  // Returns a function(inputArray) -> Float64Array(wrappedOutputs).
  function makeForward(params, c) {
    const nIn = c.wrappedInputs, nOut = c.wrappedOutputs, sizes = c.sizes;
    let p = 0;
    // 1. every hidden layer's biases, front to back.
    const biases = [];
    for (const h of sizes) {
      const b = new Float64Array(h);
      for (let k = 0; k < h; k++) b[k] = params[p++];
      biases.push(b);
    }
    // 2. weight blocks, source-major: input->layer0, layer_{k-1}->layer_k.
    const W = [];
    let prev = nIn;
    for (let li = 0; li < sizes.length; li++) {
      const h = sizes[li];
      const w = new Float64Array(prev * h);
      for (let i = 0; i < prev * h; i++) w[i] = params[p++];
      W.push(w);
      prev = h;
    }
    // 3. last layer -> outputs (source-major), then 4. output biases.
    const wOut = new Float64Array(prev * nOut);
    for (let i = 0; i < prev * nOut; i++) wOut[i] = params[p++];
    const bOut = new Float64Array(nOut);
    for (let o = 0; o < nOut; o++) bOut[o] = params[p++];
    if (p !== params.length) {
      throw new Error('BF.recurrent: parameter vector is ' + params.length
        + ' long but this config decodes ' + p
        + ' (obs ' + c.obsCount + ' + mem ' + c.memSize + ' -> ' + JSON.stringify(sizes)
        + ' -> out ' + c.numOutputs + ' + mem ' + c.memSize + ')');
    }
    let widest = Math.max(nIn, nOut, 1);
    for (const h of sizes) if (h > widest) widest = h;
    const bufA = new Float64Array(widest);
    const bufB = new Float64Array(widest);
    const out  = new Float64Array(nOut);
    // Last hidden layer's activations, kept so the Network panel can paint the
    // real node values instead of an unlit topology. One 16-float copy per
    // step -- negligible next to the 14x16 + 16x9 matmuls around it, and
    // unconditional on purpose: a traced and an untraced forward pass would be
    // two code paths that could drift.
    const hidBuf = new Float64Array(widest);
    let hidN = 0;
    function forward(inp) {
      let cur = bufA, nxt = bufB, curN = nIn;
      for (let i = 0; i < nIn; i++) cur[i] = inp[i];
      for (let li = 0; li < sizes.length; li++) {
        const h = sizes[li], w = W[li], b = biases[li];
        for (let k = 0; k < h; k++) nxt[k] = b[k];
        for (let i = 0; i < curN; i++) {
          const v = cur[i];
          if (v === 0) continue;
          const base = i * h;
          for (let k = 0; k < h; k++) nxt[k] += v * w[base + k];
        }
        for (let k = 0; k < h; k++) nxt[k] = Math.tanh(nxt[k]);
        const t = cur; cur = nxt; nxt = t; curN = h;
      }
      hidN = sizes.length ? curN : 0;
      for (let k = 0; k < hidN; k++) hidBuf[k] = cur[k];
      for (let o = 0; o < nOut; o++) out[o] = bOut[o];
      for (let i = 0; i < curN; i++) {
        const v = cur[i];
        if (v === 0) continue;
        const base = i * nOut;
        for (let o = 0; o < nOut; o++) out[o] += v * wOut[base + o];
      }
      for (let o = 0; o < nOut; o++) out[o] = Math.tanh(out[o]);
      return out;
    }
    // Read-only view of the last hidden layer (empty for a linear policy).
    forward.hidden = function () { return hidBuf.subarray(0, hidN); };
    return forward;
  }

  // Policy adapter -- trainer-facing interface mirrors BF.neat.policy /
  // BF.cnnGrid.policy: .command(obs) returns output 0, .commandAll(obs, out)
  // writes every real action.
  //
  // opts.sever forces the memory inputs to 0 (config.sever does the same; the
  // opts form lets a caller ablate ONE policy instance -- e.g. the live
  // display -- without touching the trainer's config).
  function policy(params, configOverride, opts) {
    const c = resolveConfig(configOverride);
    const sever = !!((opts && opts.sever) || c.sever);
    const fwd = makeForward(params, c);
    const nIn = c.wrappedInputs, H = c.memSize, A = c.obsCount, NO = c.numOutputs;
    const inp = new Float64Array(nIn);
    // PER-ROLLOUT BY CONSTRUCTION: allocated here, never module-scoped.
    const mem = new Float64Array(H);
    let last = null;
    function run(obs) {
      for (let i = 0; i < A; i++) { const v = obs[i]; inp[i] = v === undefined ? 0 : v; }
      for (let k = 0; k < H; k++) inp[A + k] = sever ? 0 : mem[k];
      const o = fwd(inp);
      // The integrator still updates when severed -- severing cuts the READ,
      // not the write, so the ablation changes exactly one thing.
      for (let k = 0; k < H; k++) mem[k] = (1 - c.leak) * mem[k] + c.leak * o[NO + k];
      last = o;
      return o;
    }
    return {
      config: c,
      severed: sever,
      // Exposed for the network / HUD panels. lastInput is the FULL wrapped
      // input the net actually saw -- obs(A) followed by the memory read
      // (which is all zeros while severed, so the panel shows the ablation
      // rather than hiding it). lastHidden is the last hidden layer.
      get memory()     { return mem; },
      get lastOutput() { return last; },
      get lastInput()  { return inp; },
      get lastHidden() { return fwd.hidden(); },
      command(obs) { return run(obs)[0]; },
      commandAll(obs, out) {
        const o = run(obs);
        if (!out || out.length < NO) out = new Array(NO);
        for (let i = 0; i < NO; i++) out[i] = o[i];
        return out;
      },
      reset() { mem.fill(0); last = null; },
    };
  }

  // Convenience: a small random parameter vector for smoke tests.
  function randomParams(config, rng) {
    const n = paramCount(config);
    const out = new Float64Array(n);
    const r = rng || (() => Math.random());
    for (let i = 0; i < n; i++) out[i] = (r() - 0.5) * 0.5;
    return out;
  }

  BF.recurrent = {
    defaultConfig, resolveConfig, hiddenSizes, inputCount, paramCount,
    makeForward, policy, randomParams,
  };
})(window.BF);
