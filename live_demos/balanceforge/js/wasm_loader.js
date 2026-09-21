// BalanceForge WASM loader + JS-facing adapters.
//
// Loads the Emscripten-compiled WASM module (built from ../wasm/)
// asynchronously at app startup. Exposes per-port wrappers that mirror
// the JS signatures in the rest of the codebase, so app.js can do
//
//   const useWasm = dom.useWasmEval && dom.useWasmEval.checked && BF.wasm.ready;
//   const evalFn = useWasm ? BF.wasm.neat.evaluate : N.evaluateGenome;
//
// without caring about WASM ABI details.
//
// Design choices:
// * BF.wasm.ready is FALSE until the WASM module finishes loading. The
//   app boots in JS-only mode and atomically flips to WASM-available
//   once the module reports back. Failure to load (404, build missing,
//   ABI mismatch) leaves BF.wasm.ready = false permanently with a
//   console warning -- the app still works, just without WASM.
// * Scratch buffers are LONG-LIVED. We allocate once per-genome-shape
//   in the WASM heap and reuse across calls. Avoids per-call malloc/
//   free churn, which dominates the cost for small/fast genomes.
// * Buffer growth strategy: when a genome's node/conn count exceeds
//   current scratch, we re-allocate to next-power-of-2. Genomes
//   tend to stabilize in size, so growth is a few-times-per-run
//   event.

(function (BF) {
  'use strict';

  // Public surface, populated below as the module loads.
  //
  // `useForNeat` is the runtime dispatch switch: js/neat.js consults
  // it on every forward pass and routes to the WASM path iff this is
  // true AND `ready` is true. We expose it eagerly (default false) so
  // the UI toggle in app.js can flip it before the module even loads
  // without crashing -- forwardDispatch's `&& ready` guard makes the
  // pre-ready state safe.
  BF.wasm = {
    ready: false,
    useForNeat: false,
    useForCnnMultiscale: false,
    useForJacobi: false,
    error: null,
    moduleHandle: null,
    abiVersion: null,
    neat: {
      // evaluate(genome, inputs) -> { outputs, activations, sums }
      // Same return shape as BF.neat.evaluateGenome so the rest of the
      // code doesn't care which path produced the result.
      evaluate: null,
    },
    cnnMultiscale: {
      // forward(params, obs, config) -> { output: Float64Array, ... }
      // Matches BF.cnnMultiscale.forward's signature; intermediates
      // (localConv, globalConv, etc.) are omitted from the WASM path
      // because the visualization always runs the JS path on the
      // displayed policy.
      forward: null,
    },
    jacobi: {
      // eigen(symmetric, n) -> { eigvals: Float64Array, eigvecs: Float64Array }
      // eigvecs is column-major: column k = the k-th eigenvector.
      eigen: null,
    },
  };

  // -------------------------------------------------------------------
  // Lazy loader. Called once at module-script-load time. Resolves
  // when the WASM is ready OR fails silently if the bundle isn't
  // present (user hasn't built it yet -- app stays JS-only).
  //
  // We deliberately AVOID dynamic `import()` here. The app is meant
  // to run from a `file://` URL (open index.html directly, no server)
  // and Chrome blocks dynamic ES module imports on file:// for
  // security reasons. A plain <script> tag is allowed everywhere, so
  // we inject one pointing at the Emscripten UMD bundle. The bundle
  // sets `window.BalanceForgeWasm` to a factory function, which we
  // then call to instantiate the Module.
  // -------------------------------------------------------------------
  function load() {
    // Default URL is relative to the page (index.html lives at the
    // BalanceForge root, so 'wasm/dist/...' is the natural location).
    // For pages outside the root (like wasm/smoke.html), set
    // `window.BF_WASM_URL` before this script runs to override.
    const url = (typeof window !== 'undefined' && window.BF_WASM_URL)
      ? window.BF_WASM_URL
      : 'wasm/dist/balanceforge_wasm.js';
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      const factory = window.BalanceForgeWasm;
      if (typeof factory !== 'function') {
        BF.wasm.error = new Error('BalanceForgeWasm factory not found on window');
        console.warn('[BF.wasm] script loaded but factory missing.');
        return;
      }
      factory().then((Module) => {
        wireModule(Module);
      }).catch((err) => {
        BF.wasm.error = err;
        console.warn('[BF.wasm] module factory failed:', err);
      });
    };
    script.onerror = (err) => {
      BF.wasm.error = err;
      // Quiet info-level message -- this is the EXPECTED state when
      // the user hasn't built the WASM bundle yet. The app continues
      // fine in JS-only mode.
      console.info('[BF.wasm] bundle not loaded (' + url + ' missing or 404). JS-only mode. Run `cd wasm && python build.py` to enable WASM.');
    };
    document.head.appendChild(script);
  }

  // -------------------------------------------------------------------
  // Module wiring: wrap each exported C function in a JS-friendly
  // adapter that marshals typed-array arguments through the WASM heap.
  // -------------------------------------------------------------------
  function wireModule(Module) {
    BF.wasm.moduleHandle = Module;
    // Sanity-check ABI version.
    const abiFn = Module.cwrap('bf_abi_version', 'number', []);
    BF.wasm.abiVersion = abiFn();
    // ABI version expectations track the bindings.cpp `bf_abi_version`.
    //   v1: bf_neat_evaluate, bf_abi_version
    //   v2: + bf_cnn_multiscale_forward, bf_jacobi_eigen
    //   v3: bf_neat_evaluate gained an `activationsOut` trailing arg
    //       (needed so the network-viz can show live halos).
    // We accept v3 strictly -- older binaries are missing the
    // activations pointer in the call signature and the loader would
    // produce garbage / OOB writes.
    const EXPECTED_ABI = 3;
    if (BF.wasm.abiVersion !== EXPECTED_ABI) {
      console.warn('[BF.wasm] ABI version mismatch:', BF.wasm.abiVersion,
                   'expected', EXPECTED_ABI + '. WASM disabled.');
      return;
    }
    // ---- NEAT evaluate ----
    // C signature:
    //   bf_neat_evaluate(numInputs, numOutputs, numNodes,
    //                    nodeId*, nodeKind*, nodeAct*, nodeBias*,
    //                    numConns,
    //                    connFrom*, connTo*, connWeight*, connEnabled*,
    //                    inputs*, outputs*, activationsOut*) -> int
    // The trailing activationsOut* is OPTIONAL (pass 0 = nullptr to
    // skip). When non-null, the C++ writes per-node activations into
    // it (length numNodes, indexed by node ARRAY index). We always
    // pass it -- the cost is negligible and the network-viz renderer
    // needs the activations map to draw live halos. Without this,
    // toggling WASM on freezes the per-node animation.
    const evalRaw = Module.cwrap('bf_neat_evaluate', 'number', [
      'number', 'number', 'number',           // shape
      'number', 'number', 'number', 'number', // node arrays
      'number',                               // numConns
      'number', 'number', 'number', 'number', // conn arrays
      'number', 'number', 'number'            // inputs, outputs, activationsOut
    ]);
    // Per-genome scratch caches: we malloc once per shape-class and
    // reuse. Keyed by a stable shape signature.
    const scratch = {
      // {nodeId, nodeKind, nodeAct, nodeBias, connFrom, connTo,
      //  connWeight, connEnabled, inputs, outputs, activations} -> ptr int
      buffers: null,
      capNodes: 0,
      capConns: 0,
      capInputs: 0,
      capOutputs: 0,
      // Generation counter -- bumped every time we reallocate. The
      // genome-pack cache stores the generation at pack time and
      // invalidates if it doesn't match. Without this, a realloc
      // would silently invalidate the cached pack while
      // _lastPackedGenome still pointed at the same genome ref.
      generation: 0,
    };
    function ensureScratch(numNodes, numConns, numInputs, numOutputs) {
      // Grow each scratch buffer to next-power-of-2 of the requested
      // size when the existing allocation is too small. Powers-of-2
      // keep allocations stable across modest genome growth.
      const nextPow2 = (n) => {
        let p = 1;
        while (p < n) p <<= 1;
        return Math.max(8, p);
      };
      const needNodes  = nextPow2(numNodes);
      const needConns  = nextPow2(Math.max(1, numConns));
      const needIn     = nextPow2(numInputs);
      const needOut    = nextPow2(numOutputs);
      if (!scratch.buffers
          || needNodes > scratch.capNodes
          || needConns > scratch.capConns
          || needIn    > scratch.capInputs
          || needOut   > scratch.capOutputs) {
        if (scratch.buffers) {
          // Free previous allocations. Emscripten _free is provided
          // by the runtime; it operates on the wasm linear-memory
          // allocator (dlmalloc-ish).
          for (const ptr of Object.values(scratch.buffers)) Module._free(ptr);
        }
        scratch.buffers = {
          nodeId:      Module._malloc(needNodes * 4),
          nodeKind:    Module._malloc(needNodes * 4),
          nodeAct:     Module._malloc(needNodes * 4),
          nodeBias:    Module._malloc(needNodes * 8),
          connFrom:    Module._malloc(needConns * 4),
          connTo:      Module._malloc(needConns * 4),
          connWeight:  Module._malloc(needConns * 8),
          connEnabled: Module._malloc(needConns * 4),
          inputs:      Module._malloc(needIn    * 8),
          outputs:     Module._malloc(needOut   * 8),
          // Per-node activations: filled by the C++ on every call,
          // length numNodes. Drives the network-viz live halos.
          activations: Module._malloc(needNodes * 8),
        };
        scratch.capNodes  = needNodes;
        scratch.capConns  = needConns;
        scratch.capInputs = needIn;
        scratch.capOutputs = needOut;
        // Invalidate any caller-held pack caches.
        scratch.generation++;
      }
    }
    // ACT-name -> integer mapping. Must match the enum in neat_eval.h.
    const ACT_LOOKUP = { LIN: 0, TANH: 1, RELU: 2, SIGM: 3, SIN: 4, GAUSS: 5 };
    function actToInt(act) {
      // js/neat.js uses numeric constants directly; tolerate both.
      if (typeof act === 'number') return act;
      if (typeof act === 'string') return ACT_LOOKUP[act.toUpperCase()] || 1 /* TANH */;
      return 1;
    }
    // Kind-string -> integer mapping. 0=input, 1=output, 2=hidden.
    const KIND_LOOKUP = { input: 0, output: 1, hidden: 2 };
    // Genome-pack cache. Within a single rollout (~hundreds to
    // thousands of forward passes) the genome reference doesn't
    // change -- we only need to re-pack node/conn arrays when the
    // trainer hands us a different genome OBJECT. This is the single
    // biggest WASM speedup for small genomes, where the marshal
    // dominates the actual compute. Inputs change every call so
    // they're re-packed unconditionally.
    //
    // Correctness assumption: the trainer never mutates a genome
    // in-place WHILE evaluating it. NEAT mutations (mutateWeight /
    // mutateBias / add-conn / add-node) all run BEFORE the offspring
    // is evaluated, and each offspring carries a freshly cloned
    // genome from crossover (g.nodes.map / g.conns.map produce new
    // objects). If any future code path mutates a live genome
    // mid-eval, that code must also invalidate this cache via
    // `BF.wasm.invalidateNeatCache()`.
    let _lastPackedGenome = null;
    let _lastPackedGeneration = -1;
    BF.wasm.neat.evaluate = function (genome, inputs) {
      const numInputs  = genome.numInputs;
      const numOutputs = genome.numOutputs;
      const numNodes   = genome.nodes.length;
      const numConns   = genome.conns.length;
      ensureScratch(numNodes, numConns, numInputs, numOutputs);
      const buf = scratch.buffers;
      const H32 = Module.HEAP32;
      const HF  = Module.HEAPF64;
      // Skip re-pack when same genome AND scratch hasn't been
      // reallocated since we last packed it. Inputs always change,
      // so they're handled below regardless.
      const samePacked = (_lastPackedGenome === genome)
                       && (_lastPackedGeneration === scratch.generation);
      if (!samePacked) {
        for (let i = 0; i < numNodes; ++i) {
          const n = genome.nodes[i];
          H32[(buf.nodeId   >> 2) + i] = n.id;
          H32[(buf.nodeKind >> 2) + i] = KIND_LOOKUP[n.kind] != null ? KIND_LOOKUP[n.kind] : 2;
          H32[(buf.nodeAct  >> 2) + i] = actToInt(n.act);
          HF [(buf.nodeBias >> 3) + i] = n.bias || 0;
        }
        for (let i = 0; i < numConns; ++i) {
          const c = genome.conns[i];
          H32[(buf.connFrom    >> 2) + i] = c.from;
          H32[(buf.connTo      >> 2) + i] = c.to;
          HF [(buf.connWeight  >> 3) + i] = c.weight;
          H32[(buf.connEnabled >> 2) + i] = c.enabled ? 1 : 0;
        }
        _lastPackedGenome = genome;
        _lastPackedGeneration = scratch.generation;
      }
      // Inputs always change -- pack every call.
      for (let i = 0; i < numInputs; ++i) {
        HF[(buf.inputs >> 3) + i] = (inputs[i] != null) ? inputs[i] : 0;
      }
      // Call. We always pass the activations buffer -- cost is one
      // extra Float64 marshal per call, which is invisibly cheap, and
      // the network-viz renderer reads it for per-node halos. Without
      // this, toggling WASM on freezes the live activation flashes.
      evalRaw(
        numInputs, numOutputs, numNodes,
        buf.nodeId, buf.nodeKind, buf.nodeAct, buf.nodeBias,
        numConns,
        buf.connFrom, buf.connTo, buf.connWeight, buf.connEnabled,
        buf.inputs, buf.outputs, buf.activations
      );
      // Unpack outputs.
      const outArr = new Array(numOutputs);
      for (let i = 0; i < numOutputs; ++i) {
        outArr[i] = HF[(buf.outputs >> 3) + i];
      }
      // Build the activations Map keyed by node ID (the renderer
      // calls `activations.get(node.id)`). The C++ writes activations
      // indexed by node ARRAY index, so we map back through the
      // genome.nodes[i].id sequence here.
      const activations = new Map();
      const actBase = buf.activations >> 3;
      for (let i = 0; i < numNodes; ++i) {
        activations.set(genome.nodes[i].id, HF[actBase + i]);
      }
      // `sums` (pre-activation values) has no consumer in the rest of
      // the codebase, so we leave it null -- saves a second marshal.
      return {
        outputs: outArr,
        activations: activations,
        sums: null,
      };
    };
    // Cache-invalidation hook for any future code path that mutates
    // a genome in-place mid-evaluation. Bumping `generation` is what
    // ensureScratch does on reallocation, so we just bump it here too.
    BF.wasm.invalidateNeatCache = function () {
      _lastPackedGenome = null;
      _lastPackedGeneration = -1;
    };

    // ---- CNN multiscale forward ----
    // C signature:
    //   bf_cnn_multiscale_forward(
    //     localGridSize, globalGridSize, agentStateSize,
    //     numFilters, filterSize, poolSize,
    //     denseHidden, numOutputs,
    //     params*, numParams,
    //     obs*, numObs,
    //     output*) -> int
    const cnnRaw = Module.cwrap('bf_cnn_multiscale_forward', 'number', [
      'number','number','number',  // local/global grid sizes, agent state
      'number','number','number',  // numFilters, filterSize, poolSize
      'number','number',           // denseHidden, numOutputs
      'number','number',           // params*, numParams
      'number','number',           // obs*, numObs
      'number',                    // output*
    ]);
    // Scratch buffers for the CNN forward pass. Same strategy as NEAT:
    // pre-allocate sized for the current config and reuse. The CNN
    // path runs millions of times in a CMA-ES run -- per-call malloc
    // would be catastrophic. Keyed on a tuple of (numParams, numObs,
    // numOutputs); reallocated when any grows.
    const cnnScratch = {
      paramsPtr: 0, paramsCap: 0,
      obsPtr:    0, obsCap:    0,
      outPtr:    0, outCap:    0,
    };
    function ensureCnnScratch(numParams, numObs, numOutputs) {
      const nextPow2 = (n) => {
        let p = 1; while (p < n) p <<= 1; return Math.max(16, p);
      };
      const np = nextPow2(numParams);
      const no = nextPow2(numObs);
      const nout = nextPow2(numOutputs);
      if (np > cnnScratch.paramsCap) {
        if (cnnScratch.paramsPtr) Module._free(cnnScratch.paramsPtr);
        cnnScratch.paramsPtr = Module._malloc(np * 8);
        cnnScratch.paramsCap = np;
      }
      if (no > cnnScratch.obsCap) {
        if (cnnScratch.obsPtr) Module._free(cnnScratch.obsPtr);
        cnnScratch.obsPtr = Module._malloc(no * 8);
        cnnScratch.obsCap = no;
      }
      if (nout > cnnScratch.outCap) {
        if (cnnScratch.outPtr) Module._free(cnnScratch.outPtr);
        cnnScratch.outPtr = Module._malloc(nout * 8);
        cnnScratch.outCap = nout;
      }
    }
    BF.wasm.cnnMultiscale.forward = function (params, obs, config) {
      const c = config;
      const numParams = params.length;
      const numObs = obs.length;
      const numOutputs = c.numOutputs;
      ensureCnnScratch(numParams, numObs, numOutputs);
      const HF = Module.HEAPF64;
      // Pack params + obs into the WASM heap.
      for (let i = 0; i < numParams; ++i) {
        HF[(cnnScratch.paramsPtr >> 3) + i] = params[i];
      }
      for (let i = 0; i < numObs; ++i) {
        HF[(cnnScratch.obsPtr >> 3) + i] = obs[i] || 0;
      }
      cnnRaw(
        c.localGridSize, c.globalGridSize, c.agentStateSize,
        c.numFilters, c.filterSize, c.poolSize,
        c.denseHidden, c.numOutputs,
        cnnScratch.paramsPtr, numParams,
        cnnScratch.obsPtr, numObs,
        cnnScratch.outPtr
      );
      // Unpack output. Return a Float64Array (matches JS return).
      const out = new Float64Array(numOutputs);
      for (let i = 0; i < numOutputs; ++i) {
        out[i] = HF[(cnnScratch.outPtr >> 3) + i];
      }
      // Intermediates (localConv, globalConv, etc.) are NOT returned
      // by the WASM path -- the visualization always runs JS on the
      // displayed policy. Callers that don't need viz get the win.
      return {
        output: out,
        hidden: null,
        localImage: null, globalImage: null,
        localConv:  null, globalConv:  null,
        localPool:  null, globalPool:  null,
        localPoolW: null, globalPoolW: null,
      };
    };

    // ---- Jacobi eigendecomposition ----
    // C signature:
    //   bf_jacobi_eigen(n, symmetric*, eigvals*, eigvecs*) -> int
    const jacobiRaw = Module.cwrap('bf_jacobi_eigen', 'number', [
      'number', 'number', 'number', 'number',
    ]);
    // Scratch: one shared n*n input + one n*n output + n eigvals.
    // Realloc on dimension growth (n is the CMA-ES dimension which
    // changes ONLY when the user picks a different setup/algo).
    const jacobiScratch = {
      symPtr: 0, vecPtr: 0, valPtr: 0,
      cap: 0,
    };
    function ensureJacobiScratch(n) {
      if (n <= jacobiScratch.cap) return;
      if (jacobiScratch.symPtr) Module._free(jacobiScratch.symPtr);
      if (jacobiScratch.vecPtr) Module._free(jacobiScratch.vecPtr);
      if (jacobiScratch.valPtr) Module._free(jacobiScratch.valPtr);
      // Round up to next power-of-2 -- amortizes when dim creeps up.
      let cap = 16; while (cap < n) cap <<= 1;
      jacobiScratch.symPtr = Module._malloc(cap * cap * 8);
      jacobiScratch.vecPtr = Module._malloc(cap * cap * 8);
      jacobiScratch.valPtr = Module._malloc(cap * 8);
      jacobiScratch.cap = cap;
    }
    BF.wasm.jacobi.eigen = function (symmetric, n) {
      ensureJacobiScratch(n);
      const HF = Module.HEAPF64;
      // Pack symmetric matrix. Accept either Float64Array or plain
      // array; both index normally.
      for (let i = 0; i < n * n; ++i) {
        HF[(jacobiScratch.symPtr >> 3) + i] = symmetric[i];
      }
      jacobiRaw(n, jacobiScratch.symPtr, jacobiScratch.valPtr, jacobiScratch.vecPtr);
      const eigvals = new Float64Array(n);
      const eigvecs = new Float64Array(n * n);
      for (let i = 0; i < n; ++i) {
        eigvals[i] = HF[(jacobiScratch.valPtr >> 3) + i];
      }
      for (let i = 0; i < n * n; ++i) {
        eigvecs[i] = HF[(jacobiScratch.vecPtr >> 3) + i];
      }
      return { eigvals, eigvecs };
    };

    BF.wasm.ready = true;
    console.info('[BF.wasm] module ready, ABI v' + BF.wasm.abiVersion);
  }

  // Kick off the lazy load. Safe to call before BF.neat / BF.cnn etc.
  // are defined -- we only wire into them once the module is ready,
  // and the app dispatches based on BF.wasm.ready at call time.
  load();
})(window.BF || (window.BF = {}));
