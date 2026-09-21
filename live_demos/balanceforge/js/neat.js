// BalanceForge — NEAT-style genome with topology mutation.
// A genome is a directed acyclic graph of nodes (input/hidden/output) and weighted connections.
// Each connection has its own activation toggle so the topology can grow over generations.

(function (BF) {
  'use strict';
  const { clamp } = BF.util;

  // Activation kinds — APPEND-ONLY (ids are serialized into genomes;
  // never reorder). 0..5 unchanged; 6..12 are the A1 additions.
  const ACT = Object.freeze({
    LIN: 0,
    TANH: 1,
    RELU: 2,
    SIGM: 3,
    SIN: 4,
    GAUSS: 5,
    SWISH: 6,
    MISH: 7,
    SOFTPLUS: 8,
    ABS: 9,
    SQUARE: 10,
    CAUCHY: 11,
    SNAKE: 12,
  });
  const ACT_NAMES = ['lin', 'tanh', 'relu', 'sigm', 'sin', 'gauss',
    'swish', 'mish', 'softplus', 'abs', 'square', 'cauchy', 'snake'];
  // act-mutation alphabet — UNCHANGED (dropdown-only; the new kinds are
  // a node-default choice, never randomly mutated in — keeps every
  // existing run's RNG draws identical).
  const HIDDEN_ACTS = [ACT.TANH, ACT.RELU, ACT.SIGM, ACT.SIN, ACT.GAUSS];
  // Single source of truth for the hidden-activation dropdown + the
  // app.js name->kind resolver (excludes LIN — input-only). tier drives
  // the experimental-disclosure toggle.
  const ACT_META = [
    { kind: ACT.TANH,     name: 'tanh',     tier: 'standard',     color: '#4ee0c0' },
    { kind: ACT.RELU,     name: 'relu',     tier: 'standard',     color: '#f5b769' },
    { kind: ACT.SIGM,     name: 'sigm',     tier: 'standard',     color: '#a481ff' },
    { kind: ACT.SIN,      name: 'sin',      tier: 'standard',     color: '#ff8fb8' },
    { kind: ACT.GAUSS,    name: 'gauss',    tier: 'standard',     color: '#7ad7ff' },
    { kind: ACT.SWISH,    name: 'swish',    tier: 'standard',     color: '#ffd166' },
    { kind: ACT.MISH,     name: 'mish',     tier: 'standard',     color: '#f6a6c1' },
    { kind: ACT.SOFTPLUS, name: 'softplus', tier: 'experimental', color: '#c3f584' },
    { kind: ACT.ABS,      name: 'abs',      tier: 'experimental', color: '#8be9fd' },
    { kind: ACT.SQUARE,   name: 'square',   tier: 'experimental', color: '#ff9f6e' },
    { kind: ACT.CAUCHY,   name: 'cauchy',   tier: 'experimental', color: '#b39dff' },
    { kind: ACT.SNAKE,    name: 'snake',    tier: 'experimental', color: '#7ee787' },
  ];
  // Shared activation->color accessor: the single source of truth for
  // the node-ring palette, the hover activation plot, and the mixture
  // legend, so they can never drift. LIN (input-only, not in ACT_META)
  // and any unknown kind resolve to the neutral fallback, which equals
  // the pre-refactor canvas-network actRingColor `default:` value so
  // node-ring colors stay byte-identical.
  function actColor(act) {
    for (let i = 0; i < ACT_META.length; i++) {
      if (ACT_META[i].kind === act) return ACT_META[i].color;
    }
    return '#6ce28a';
  }

  function applyAct(kind, x) {
    switch (kind) {
      case ACT.LIN: return x;
      case ACT.TANH: return Math.tanh(x);
      case ACT.RELU: return x > 0 ? x : 0;
      case ACT.SIGM: return 1 / (1 + Math.exp(-x));
      case ACT.SIN: return Math.sin(x);
      case ACT.GAUSS: return Math.exp(-x * x);
      case ACT.SWISH: return x / (1 + Math.exp(-x));
      case ACT.MISH: {
        const sp = Math.max(x, 0) + Math.log1p(Math.exp(-Math.abs(x)));
        return x * Math.tanh(sp);
      }
      case ACT.SOFTPLUS: return Math.max(x, 0) + Math.log1p(Math.exp(-Math.abs(x)));
      case ACT.ABS: return Math.abs(x);
      case ACT.SQUARE: return x * x;
      case ACT.CAUCHY: return 1 / (1 + x * x);
      case ACT.SNAKE: return x + Math.sin(x) * Math.sin(x);
      default: return x;
    }
  }

  // A2: combine a per-node activation mixture. `mix` is
  // [{act:int, w:number}, …] (length 1…maxFunctionsPerNode). `mode`:
  //   'raw'        -> Σ wᵢ·applyAct(actᵢ, s)
  //   'normalized' -> Σ softmax(w)ᵢ·applyAct(actᵢ, s)  (max-shifted)
  // Any other/absent mode falls back to 'raw'. A raw, length-1, w=1
  // mixture equals applyAct(act, s) for every value arising in normal
  // network evaluation (the k=1 invariant; differs only for an IEEE-754
  // signed-zero preactivation, which network arithmetic never produces).
  function combineMix(mix, s, mode) {
    const k = mix.length;
    if (mode === 'normalized') {
      let mx = -Infinity;
      for (let i = 0; i < k; i++) if (mix[i].w > mx) mx = mix[i].w;
      let Z = 0;
      for (let i = 0; i < k; i++) Z += Math.exp(mix[i].w - mx);
      let acc = 0;
      for (let i = 0; i < k; i++) {
        acc += (Math.exp(mix[i].w - mx) / Z) * applyAct(mix[i].act, s);
      }
      return acc;
    }
    let acc = 0;
    for (let i = 0; i < k; i++) acc += mix[i].w * applyAct(mix[i].act, s);
    return acc;
  }

  // A2: parsimony measure — Σ over nodes of max(0, mix.length - 1).
  // A plain node or a k=1 mixture costs 0; each extra basis component
  // costs 1. Used by the trainer's mixturePenalty (kept here so the
  // trainer and tests share one definition — DRY).
  function mixtureExtraCount(g) {
    let extra = 0;
    const ns = g.nodes;
    for (let i = 0; i < ns.length; i++) {
      const m = ns[i].mix;
      if (m && m.length > 1) extra += m.length - 1;
    }
    return extra;
  }

  // Globally monotonic innovation counter so equal historical edges line up
  // across genomes. Full NEAT needs stable historical markings: the same
  // structural edge discovered in different genomes should carry the same
  // innovation id so crossover can align homologous genes instead of treating
  // every edge as disjoint.
  let globalInnovation = 0;
  function nextInnovation() { return ++globalInnovation; }
  const innovationByEdge = new Map();
  const splitByInnov = new Map();
  let globalHiddenNodeId = 1000;

  function innovationForConnection(from, to) {
    const key = from + '->' + to;
    let innov = innovationByEdge.get(key);
    if (innov == null) {
      innov = nextInnovation();
      innovationByEdge.set(key, innov);
    }
    return innov;
  }

  function splitInnovation(conn) {
    let info = splitByInnov.get(conn.innov);
    if (!info) {
      const nodeId = globalHiddenNodeId++;
      info = {
        nodeId: nodeId,
        inInnov: innovationForConnection(conn.from, nodeId),
        outInnov: innovationForConnection(nodeId, conn.to),
      };
      splitByInnov.set(conn.innov, info);
    }
    return info;
  }

  // Reset all module-level innovation / node-id state. Used by sweep
  // harnesses (e.g. dodge-sweep.js) between configs so adjacent runs
  // don't cross-pollute via the historical-marking globals -- a NEAT-
  // after-NEAT pair is otherwise non-deterministic relative to either
  // run in isolation because the starting globalInnovation counter
  // depends on how many edges the prior run discovered. No-op for the
  // live browser app, which only ever runs one trainer's lifetime per
  // page load.
  function resetInnovation() {
    globalInnovation = 0;
    innovationByEdge.clear();
    splitByInnov.clear();
    globalHiddenNodeId = 1000;
  }

  // ---------- Genome creation ----------
  function makeGenome(numInputs, numOutputs) {
    const g = {
      numInputs: numInputs,
      numOutputs: numOutputs,
      nodes: [],
      conns: [],
      // Computed lazily and cached.
      _order: null,
    };
    // Inputs (linear, never mutated)
    for (let i = 0; i < numInputs; i++) {
      g.nodes.push({ id: i, kind: 'input', act: ACT.LIN, bias: 0 });
    }
    // Outputs (tanh by default)
    for (let i = 0; i < numOutputs; i++) {
      g.nodes.push({
        id: numInputs + i, kind: 'output', act: ACT.TANH, bias: 0,
      });
    }
    return g;
  }

  // Augment an existing genome with a fully-connected hidden layer of
  // `numHidden` tanh nodes. ALL inputs connect to all hidden nodes,
  // and all hidden nodes connect to all outputs, with weights drawn
  // from N(0, sigma²). EXISTING input→output connections are
  // preserved (so the policy starts as input→output PLUS the hidden
  // pathway); both pathways carry signal in parallel and selection
  // can favor whichever produces better behavior.
  //
  // Why this exists: NEAT's canonical "start minimal, complexify on
  // demand" behavior fails on sparse-reward / deceptive landscapes
  // where the linear policy is at a fitness plateau and any single
  // add-node mutation disrupts that plateau without yet enabling
  // the better solution. Seeding the population with hidden capacity
  // gives the GA architectural breathing room to express
  // conditional/piecewise behaviors from gen 0, instead of having
  // to discover the architecture and tune its weights simultaneously.
  //
  // Use sparingly — for tasks where the linear policy class is
  // demonstrably insufficient (golf, sequential decision tasks).
  // For dense-reward control (pendulum), this is unnecessary and
  // adds bloat.
  function addHiddenLayer(genome, numHidden, rng, weightSigma, hiddenAct, mutParams) {
    if (numHidden <= 0) return;
    const sigma = (weightSigma != null) ? weightSigma : 0.6;
    const numInputs = genome.numInputs;
    const numOutputs = genome.numOutputs;
    // hiddenAct: ACT.* constant for new hidden nodes. Defaults to TANH
    // (legacy behavior); the reference Pendulum-NEAT uses ACT.RELU,
    // which can be requested via this argument.
    const act = (hiddenAct != null) ? hiddenAct : ACT.TANH;
    // Allocate fresh hidden node ids past whatever's currently in the
    // genome — handles repeated calls safely.
    let nextId = 0;
    for (const n of genome.nodes) if (n.id >= nextId) nextId = n.id + 1;
    const hiddenIds = [];
    for (let i = 0; i < numHidden; i++) {
      const id = nextId + i;
      const node = { id: id, kind: 'hidden', act: act, bias: 0 };
      // A2 v2: in the 'mixed' regime, seed every hidden node as a k=1
      // mixture (raw w=1 == plain, inert until evolved) — mirrors
      // addNode's birth so pre-seeded hidden nodes are mixtures too.
      // Pure string check, no rng: non-'mixed' regimes (incl. the
      // default 'pure') draw zero extra rng, byte/RNG-identical.
      if (mutParams && mutParams.mixtureRegime === 'mixed') {
        node.mix = [{ act: act, w: 1 }];
      }
      genome.nodes.push(node);
      hiddenIds.push(id);
    }
    // input → hidden (fully connected)
    for (let i = 0; i < numInputs; i++) {
      for (const h of hiddenIds) {
        genome.conns.push({
          innov: innovationForConnection(i, h),
          from: i,
          to: h,
          weight: rng.gauss(0, sigma),
          enabled: true,
        });
      }
    }
    // hidden → output (fully connected)
    for (const h of hiddenIds) {
      for (let o = 0; o < numOutputs; o++) {
        genome.conns.push({
          innov: innovationForConnection(h, numInputs + o),
          from: h,
          to: numInputs + o,
          weight: rng.gauss(0, sigma),
          enabled: true,
        });
      }
    }
    genome._order = null;
  }

  // Build a genome with one or more pre-seeded hidden layers, fully
  // connected feed-forward (input -> L1 -> L2 -> ... -> output) with small
  // Gaussian initial weights. This is the richer-start option for tasks where
  // canonical NEAT's architecture-discovery tax dominates early training.
  function makeSeededGenome(numInputs, numOutputs, hiddenLayers, rng, actKind, mutParams) {
    const g = makeGenome(numInputs, numOutputs);
    if (!hiddenLayers || hiddenLayers.length === 0) return g;
    const act = (actKind != null) ? actKind : ACT.TANH;
    let nextId = numInputs + numOutputs;
    const layers = [];
    layers.push(Array.from({ length: numInputs }, (_, i) => i));
    for (const size of hiddenLayers) {
      const layer = [];
      for (let i = 0; i < size; i++) {
        const id = nextId++;
        const node = { id: id, kind: 'hidden', act: act, bias: 0 };
        // A2 v2: see addHiddenLayer — in the 'mixed' regime seed each
        // hidden node as a k=1 mixture. Pure string check, no rng:
        // non-'mixed' regimes draw zero extra rng, byte/RNG-identical.
        if (mutParams && mutParams.mixtureRegime === 'mixed') {
          node.mix = [{ act: act, w: 1 }];
        }
        g.nodes.push(node);
        layer.push(id);
      }
      layers.push(layer);
    }
    const outputLayer = [];
    for (let i = 0; i < numOutputs; i++) outputLayer.push(numInputs + i);
    layers.push(outputLayer);
    for (let li = 0; li < layers.length - 1; li++) {
      for (const fromId of layers[li]) {
        for (const toId of layers[li + 1]) {
          g.conns.push({
            innov: innovationForConnection(fromId, toId),
            from: fromId,
            to: toId,
            weight: rng && rng.gauss ? rng.gauss(0, 0.6) : 0,
            enabled: true,
          });
        }
      }
    }
    g._order = null;
    return g;
  }

  function cloneGenome(g) {
    const out = {
      numInputs: g.numInputs,
      numOutputs: g.numOutputs,
      nodes: g.nodes.map(n => {
        const c = { id: n.id, kind: n.kind, act: n.act, bias: n.bias };
        if (n.mix && n.mix.length > 0) c.mix = n.mix.map(m => ({ act: m.act, w: m.w }));
        return c;
      }),
      conns: g.conns.map(c => ({
        innov: c.innov, from: c.from, to: c.to, weight: c.weight, enabled: c.enabled,
      })),
      _order: null,
    };
    if (g.mixMode !== undefined) out.mixMode = g.mixMode;
    return out;
  }

  // ---------- Topology helpers ----------
  function nodeById(g, id) { return g.nodes.find(n => n.id === id); }

  function isInput(g, id) {
    const n = nodeById(g, id);
    return n && n.kind === 'input';
  }
  function isOutput(g, id) {
    const n = nodeById(g, id);
    return n && n.kind === 'output';
  }

  function topoSort(g) {
    if (g._order) return g._order;
    const incoming = new Map();
    const outgoing = new Map();
    for (const n of g.nodes) {
      incoming.set(n.id, []);
      outgoing.set(n.id, []);
    }
    for (const c of g.conns) {
      if (!c.enabled) continue;
      outgoing.get(c.from).push(c);
      incoming.get(c.to).push(c);
    }
    const order = [];
    const visited = new Set();
    const onPath = new Set();
    function visit(id) {
      if (visited.has(id)) return;
      if (onPath.has(id)) return; // ignore cycles defensively
      onPath.add(id);
      const conns = outgoing.get(id) || [];
      for (const c of conns) visit(c.to);
      onPath.delete(id);
      visited.add(id);
      order.push(id);
    }
    for (const n of g.nodes) visit(n.id);
    order.reverse();
    // Cache an id -> node reference Map so evaluateGenome can do O(1)
    // node lookups instead of the previous O(N) nodeById scan. This is
    // the surgical version of the optimization -- conservative enough
    // to be safe but still kills the O(N^2) forward-pass cost on big
    // genomes (dodge + grid / multi-scale, 200+ nodes). The full
    // Float64Array eval plan was previously attempted and reverted
    // due to a freeze under training load; keeping just this lookup
    // map preserves the algorithmic win without the risk.
    const nodeByIdMap = new Map();
    for (const n of g.nodes) nodeByIdMap.set(n.id, n);
    g._order = { order, incoming, outgoing, nodeByIdMap };
    return g._order;
  }

  // Returns true iff adding edge `from -> to` would NOT create a cycle.
  function canConnect(g, from, to) {
    if (from === to) return false;
    if (isOutput(g, from)) return false;
    if (isInput(g, to)) return false;
    // Already exists?
    for (const c of g.conns) {
      if (c.from === from && c.to === to) return false;
    }
    // BFS: from `to`, can we reach `from`? If yes, this edge would create a cycle.
    const adj = new Map();
    for (const n of g.nodes) adj.set(n.id, []);
    for (const c of g.conns) {
      if (!c.enabled) continue;
      adj.get(c.from).push(c.to);
    }
    const queue = [to];
    const seen = new Set([to]);
    while (queue.length) {
      const cur = queue.shift();
      if (cur === from) return false;
      for (const nxt of adj.get(cur) || []) {
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        queue.push(nxt);
      }
    }
    return true;
  }

  // Returns true iff a currently-disabled edge can be enabled without
  // creating a cycle. Toggling a connection back on used to skip this check;
  // after later topology mutations, an old disabled edge can become a
  // back-edge and make topoSort silently ignore part of the graph.
  function canEnableConnection(g, conn) {
    if (!conn) return false;
    if (conn.enabled) return true;
    const from = conn.from, to = conn.to;
    if (from === to) return false;
    if (isOutput(g, from)) return false;
    if (isInput(g, to)) return false;
    const adj = new Map();
    for (const n of g.nodes) adj.set(n.id, []);
    for (const c of g.conns) {
      if (!c.enabled) continue;
      adj.get(c.from).push(c.to);
    }
    const queue = [to];
    const seen = new Set([to]);
    while (queue.length) {
      const cur = queue.shift();
      if (cur === from) return false;
      for (const nxt of adj.get(cur) || []) {
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        queue.push(nxt);
      }
    }
    return true;
  }

  // ---------- Forward pass ----------
  // Returns { outputs, activations: Map<id, value>, sums: Map<id, preActivation>}
  //
  // This is the original Map-based path with one targeted improvement:
  // the per-node lookup uses topoSort's cached `nodeByIdMap` (O(1))
  // instead of the previous `nodeById(g, id)` which was `g.nodes.find()`
  // (O(N) per call, making the whole forward pass O(N^2)). That single
  // change reclaims the algorithmic win on big-input genomes without
  // any change to the Map-based data shape that downstream callers
  // (renderer halos, etc.) expect.
  function evaluateGenome(g, inputs) {
    const o = topoSort(g);
    const order = o.order;
    const incoming = o.incoming;
    const nodeByIdMap = o.nodeByIdMap;
    const values = new Map();
    const sums = new Map();
    // Inputs first.
    for (let i = 0; i < g.numInputs; i++) {
      values.set(i, inputs[i] != null ? inputs[i] : 0);
      sums.set(i, inputs[i] != null ? inputs[i] : 0);
    }
    for (const id of order) {
      const node = nodeByIdMap.get(id);
      if (!node || node.kind === 'input') continue;
      let s = node.bias;
      const inc = incoming.get(id) || [];
      for (const c of inc) {
        if (!c.enabled) continue;
        const v = values.get(c.from);
        if (v != null) s += v * c.weight;
      }
      sums.set(id, s);
      // A non-empty node.mix means "this node is a mixture"; absent or [] => legacy single-act path.
      if (node.mix && node.mix.length > 0) {
        values.set(id, combineMix(node.mix, s, g.mixMode || 'raw'));
      } else {
        values.set(id, applyAct(node.act, s));
      }
    }
    const outputs = [];
    for (let i = 0; i < g.numOutputs; i++) {
      const id = g.numInputs + i;
      outputs.push(values.get(id) || 0);
    }
    return { outputs, activations: values, sums };
  }

  function policy(g) {
    return {
      genome: g,
      lastTrace: null,
      // Single-output convenience: returns outputs[0] for legacy 1D
      // setups (every cart-pole / golf / ball-strike scene). Setups with
      // actionCount > 1 should call commandAll() instead to read every
      // output node.
      command(inputs) {
        const trace = forwardDispatch(g, inputs);
        this.lastTrace = trace;
        return trace.outputs[0];
      },
      // Multi-output: writes every output node into `out` and returns
      // it. Caller passes a pre-allocated array of length numOutputs
      // (no allocation in the eval hot loop). For 1-output genomes
      // this is the same data command() returns -- safe to use
      // uniformly when the caller doesn't know in advance.
      commandAll(inputs, out) {
        const trace = forwardDispatch(g, inputs);
        this.lastTrace = trace;
        const n = trace.outputs.length;
        if (!out || out.length < n) out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = trace.outputs[i];
        return out;
      },
    };
  }

  // Forward-pass dispatch. By default routes to the JS reference
  // (evaluateGenome above). When BF.wasm.useForNeat is on AND
  // BF.wasm.ready is true, dispatches to the C++/WASM port instead.
  // Same return shape either way so callers (policy.command,
  // policy.commandAll, the hybrid wrapper) are oblivious to which
  // path ran.
  //
  // The WASM path returns activations: null because the C++ port
  // doesn't currently materialize the per-node activation map (the
  // network-panel halos that consume it only ever run on the
  // DISPLAYED policy, which the app can route through the JS path
  // separately via showWasmDispatch=false if needed).
  const NEW_ACT_MIN = ACT.SWISH;
  // True when the genome uses anything the prebuilt .wasm can't
  // evaluate: an appended activation kind (>=SWISH) OR an A2 mixture
  // node. Such genomes MUST take the JS path. Kept as the LAST &&
  // clause in forwardDispatch so it is only scanned when WASM is
  // on+ready (default WASM-off path adds ZERO work).
  function genomeUsesNewAct(g) {
    const ns = g.nodes;
    for (let i = 0; i < ns.length; i++) {
      if (ns[i].act >= NEW_ACT_MIN) return true;
      const m = ns[i].mix;
      if (m && m.length > 0) return true;
    }
    return false;
  }
  function forwardDispatch(g, inputs) {
    // genomeUsesNewAct is the LAST && clause on purpose: short-circuit
    // means it is only scanned when WASM is on AND ready, so the
    // default (WASM-off) path adds ZERO work. When WASM is on, the
    // O(nodes) scan is negligible vs. the eval it gates.
    if (typeof window !== 'undefined'
        && window.BF
        && window.BF.wasm
        && window.BF.wasm.useForNeat
        && window.BF.wasm.ready
        && window.BF.wasm.neat
        && window.BF.wasm.neat.evaluate
        && !genomeUsesNewAct(g)) {
      return window.BF.wasm.neat.evaluate(g, inputs);
    }
    return evaluateGenome(g, inputs);
  }

  // ---------- Mutation ----------
  function defaultMutationParams() {
    return {
      mutTopology: true,
      weightSigma: 0.15,
      weightResetProb: 0.05,
      addConnProb: 0.30,
      // 0.03 is the rate the original NEAT paper uses; higher rates cause
      // bloat that selection can't keep up with on simple tasks like single
      // pendulum, where 0-hidden networks are already sufficient.
      addNodeProb: 0.03,
      toggleConnProb: 0.02,
      actMutProb: 0.03,
      // Topology growth ceilings. These are SAFETY caps against
      // runaway bloat, not tuning knobs -- selection prunes useless
      // structure on simple tasks long before they're hit. They were
      // 60 / 240, but the reference Pendulum-NEAT project's SOLVED
      // double-pendulum network has 39 nodes and 321 connections --
      // i.e. our 240-conn cap was BELOW the capacity a working
      // solution needs, so addConn mutations got blocked and the
      // network could never reach the required representational
      // power. Raised to comfortably exceed the reference (with
      // headroom for the harder full-gravity end of the curriculum).
      maxNodes: 120,
      maxConns: 700,
      // ACT.* constant for new hidden nodes created by addNode mutations
      // (and addHiddenLayer when threaded through). Default TANH preserves
      // historical behavior; presets can override to ACT.RELU to match
      // the reference Pendulum-NEAT project.
      hiddenAct: ACT.TANH,
      // ---- A2 v2: activation regime axes (default == legacy) ----
      // Axis 1: 'pure' | 'mixed' | 'pure+mixed'. 'pure' (default) =
      // no mixtures (pre-A2 behavior).
      mixtureRegime: 'pure',
      // Axis 2: 'legacy' (default = the HIDDEN_ACTS 5) | 'single'
      // (just hiddenAct) | 'all' (eligibleMixActs, experimental-aware).
      actPalette: 'legacy',
      // Axis 3: 'can' (default == legacy: existing nodes DO act-mutate
      // at actMutProb) | 'cant' (existing-node type frozen).
      actMutable: 'can',
      // Per-node basis cap (k). Birth is k=1; grow adds up to this.
      maxFunctionsPerNode: 3,
      // Combine mode stamped onto the genome: 'raw' | 'normalized'.
      mixtureCombine: 'raw',
      // Experimental-tier acts eligible (set by readParams from
      // #showExperimentalActs); feeds palette 'all'.
      mixtureAllowExperimental: false,
      // Per-op probabilities (only consulted in mixed/pure+mixed).
      mixtureGrowProb: 0.06,
      mixtureShrinkProb: 0.03,
      mixtureWeightProb: 0.5,
      mixtureInitWeightSigma: 0.3,
      mixtureConvertProb: 0.03,  // pure+mixed only
      mixtureSwapProb: 0.04,
      mixtureDemoteProb: 0.03,   // pure+mixed only (mixture -> pure)
    };
  }

  function mutate(g, rng, params) {
    params = params || defaultMutationParams();
    g._order = null;
    if ((params.mixtureRegime || 'pure') !== 'pure') {
      g.mixMode = params.mixtureCombine || g.mixMode || 'raw';
    }
    const events = { weight: 0, bias: 0, addConn: 0, addNode: 0, toggle: 0, act: 0 };
    // Always perturb at least a couple of weights / biases per call.
    const weightCount = g.conns.length;
    const passes = Math.max(1, Math.round(weightCount * 0.3));
    for (let i = 0; i < passes; i++) {
      if (rng.proba(0.5)) { mutateWeight(g, rng, params); events.weight++; }
      if (rng.proba(0.5)) { mutateBias(g, rng, params); events.bias++; }
    }
    if (rng.proba(0.4)) { mutateBias(g, rng, params); events.bias++; }

    if (params.mutTopology) {
      if (rng.proba(params.toggleConnProb) && g.conns.length > 0) {
        if (toggleConnection(g, rng)) events.toggle++;
      }
      if (rng.proba(params.addConnProb) && g.conns.length < params.maxConns) {
        const before = g.conns.length;
        addConnection(g, rng, params);
        if (g.conns.length > before) events.addConn++;
      }
      if (rng.proba(params.addNodeProb) && g.conns.length > 0 && g.nodes.length < params.maxNodes) {
        const before = g.nodes.length;
        addNode(g, rng, params);
        if (g.nodes.length > before) events.addNode++;
      }
      const _amRegime = params.mixtureRegime || 'pure';
      const _amOK = (_amRegime === 'pure' || _amRegime === 'pure+mixed')
                    && params.actMutable !== 'cant';
      if (_amOK && rng.proba(params.actMutProb)) {
        const candidates = g.nodes.filter(n => n.kind === 'hidden');
        if (candidates.length > 0) { mutateActivation(g, rng, params); events.act++; }
      }
      if (_amRegime !== 'pure') {
        mutateMixture(g, rng, params);
      }
    }
    return events;
  }

  function mutateWeight(g, rng, params) {
    if (g.conns.length === 0) return;
    const c = rng.pick(g.conns);
    if (rng.proba(params.weightResetProb)) {
      c.weight = rng.gauss(0, 1);
    } else {
      c.weight += rng.gauss(0, params.weightSigma);
      c.weight = clamp(c.weight, -8, 8);
    }
  }
  function mutateBias(g, rng, params) {
    const candidates = g.nodes.filter(n => n.kind !== 'input');
    if (candidates.length === 0) return;
    const n = rng.pick(candidates);
    if (rng.proba(params.weightResetProb)) {
      n.bias = rng.gauss(0, 0.5);
    } else {
      n.bias += rng.gauss(0, params.weightSigma * 0.5);
      n.bias = clamp(n.bias, -4, 4);
    }
  }

  function toggleConnection(g, rng) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const c = rng.pick(g.conns);
      if (c.enabled) {
        c.enabled = false;
        return true;
      }
      if (canEnableConnection(g, c)) {
        c.enabled = true;
        return true;
      }
    }
    return false;
  }

  function addConnection(g, rng, params) {
    // Pick a random potential pair and try a few times.
    const fromCandidates = g.nodes.filter(n => n.kind !== 'output');
    const toCandidates = g.nodes.filter(n => n.kind !== 'input');
    if (fromCandidates.length === 0 || toCandidates.length === 0) return;
    for (let attempt = 0; attempt < 15; attempt++) {
      const from = rng.pick(fromCandidates).id;
      const to = rng.pick(toCandidates).id;
      if (canConnect(g, from, to)) {
        g.conns.push({
          innov: innovationForConnection(from, to),
          from, to,
          weight: rng.gauss(0, 0.5),
          enabled: true,
        });
        g._order = null;
        return;
      }
    }
  }

  function addNode(g, rng, params) {
    const enabledConns = g.conns.filter(c => c.enabled);
    if (enabledConns.length === 0) return;
    const c = rng.pick(enabledConns);
    c.enabled = false;
    const split = splitInnovation(c);
    let newId = split.nodeId;
    if (nodeById(g, newId)) {
      // Defensive fallback for legacy/imported genomes that may already use a
      // high id. Fresh BalanceForge genomes should never hit this path.
      newId = nextNodeId(g);
    }
    // Use the configured activation for new hidden nodes. Default is
    // TANH -- smooth, bounded, partially signal-preserving: A→B (weight W)
    // becomes A→New→B with weights (1, W) and tanh activation, so small
    // inputs pass through approximately unchanged while large inputs
    // saturate. Reference Pendulum-NEAT uses ReLU here, which is
    // exactly identity for positive inputs (W=1 + ReLU = pass-through)
    // and zero for negative, biasing new splits toward one-sided
    // contributions. params.hiddenAct selects between them; falls back
    // to TANH for legacy.
    const hiddenAct = (params && params.hiddenAct != null) ? params.hiddenAct : ACT.TANH;
    const newNode = { id: newId, kind: 'hidden', act: hiddenAct, bias: 0 };
    if (params && params.mixtureRegime === 'mixed') {
      newNode.mix = [{ act: hiddenAct, w: 1 }];   // mixed = every node is a (k=1==plain) mixture
    }
    g.nodes.push(newNode);
    g.conns.push({
      innov: split.inInnov,
      from: c.from, to: newId, weight: 1, enabled: true,
    });
    g.conns.push({
      innov: split.outInnov,
      from: newId, to: c.to, weight: c.weight, enabled: true,
    });
    g._order = null;
  }

  // A2: activations eligible as mixture components. ACT_META already
  // excludes LIN; experimental-tier kinds are included only when
  // allowExperimental is set. NOTE this is the broader standard tier
  // (7 kinds incl. swish/mish), intentionally distinct from the
  // narrower HIDDEN_ACTS (5) used by mutateActivation. Returns int kinds.
  function eligibleMixActs(allowExperimental) {
    const out = [];
    for (let i = 0; i < ACT_META.length; i++) {
      const m = ACT_META[i];
      if (m.tier === 'standard' || allowExperimental) out.push(m.kind);
    }
    return out;
  }

  // A2 v2: candidate activation set for the Axis-2 palette. 'legacy'
  // (default & unknown) = the exact HIDDEN_ACTS array (so the default
  // act-mutation path is byte-identical). 'single' = [hiddenAct].
  // 'all' = eligibleMixActs (experimental-aware). Used by
  // mutateActivation AND mixture grow/swap so the palette is honored
  // consistently.
  function paletteActs(params) {
    const p = params && params.actPalette;
    if (p === 'single') {
      const a = (params && params.hiddenAct != null) ? params.hiddenAct : ACT.TANH;
      return [a];
    }
    if (p === 'all') return eligibleMixActs(params && params.mixtureAllowExperimental);
    return HIDDEN_ACTS;
  }

  function mutateActivation(g, rng, params) {
    const candidates = g.nodes.filter(n => n.kind === 'hidden');
    if (candidates.length === 0) return;
    const n = rng.pick(candidates);
    const acts = paletteActs(params);
    n.act = acts[rng.int(acts.length)];
  }

  // A2 v2: per-generation mixture operators. Only called when the
  // regime is not 'pure' (the caller gates it via _amRegime), so the
  // 'pure' default path draws zero rng.
  // Plain nodes (no .mix) pass through without drawing rng — every
  // operator short-circuits on the n.mix guard, so the ON path's rng
  // sequence is unaffected by the presence of plain nodes.
  function mutateMixture(g, rng, params) {
    const regime = params.mixtureRegime || 'pure';
    // distribution evolves in pure+mixed always, and in mixed unless
    // the existing-node mutability axis is 'cant' (frozen at k=1).
    const distEvolve = regime === 'pure+mixed'
      || (regime === 'mixed' && params.actMutable !== 'cant');
    const cap = params.maxFunctionsPerNode > 0 ? params.maxFunctionsPerNode : 1;
    const acts = paletteActs(params);
    const hidden = g.nodes.filter(n => n.kind === 'hidden');
    for (let i = 0; i < hidden.length; i++) {
      const n = hidden[i];
      if (distEvolve) {
        if (n.mix && n.mix.length < cap && rng.proba(params.mixtureGrowProb)) {
          n.mix.push({ act: acts[rng.int(acts.length)], w: rng.gauss(0, params.mixtureInitWeightSigma) });
        }
        if (n.mix && n.mix.length > 1 && rng.proba(params.mixtureShrinkProb)) {
          n.mix.splice(rng.int(n.mix.length), 1);
        }
        if (n.mix && n.mix.length > 0 && rng.proba(params.mixtureWeightProb)) {
          const c = n.mix[rng.int(n.mix.length)];
          c.w = clamp(c.w + rng.gauss(0, params.weightSigma), -8, 8);
        }
        if (n.mix && n.mix.length > 0 && rng.proba(params.mixtureSwapProb)) {
          n.mix[rng.int(n.mix.length)].act = acts[rng.int(acts.length)];
        }
      }
      if (regime === 'pure+mixed') {
        // Demote: any mixture -> pure, collapsing to the dominant
        // component (raw: max |w|; normalized: max w == max softmax).
        if (n.mix && n.mix.length > 0 && rng.proba(params.mixtureDemoteProb)) {
          const norm = (g.mixMode || 'raw') === 'normalized';
          let bi = 0, bv = -Infinity;
          for (let j = 0; j < n.mix.length; j++) {
            const sc = norm ? n.mix[j].w : Math.abs(n.mix[j].w);
            if (sc > bv) { bv = sc; bi = j; }
          }
          n.act = n.mix[bi].act;
          delete n.mix;
        }
        // Convert: plain -> k=1 mixture of own act; k=1 -> plain.
        if (!n.mix && rng.proba(params.mixtureConvertProb)) {
          n.mix = [{ act: n.act, w: 1 }];
        } else if (n.mix && n.mix.length === 1 && rng.proba(params.mixtureConvertProb)) {
          n.act = n.mix[0].act;
          delete n.mix;
        }
      }
    }
  }

  function nextNodeId(g) {
    let m = -1;
    for (const n of g.nodes) if (n.id > m) m = n.id;
    return m + 1;
  }

  // ---------- Full NEAT helpers ----------
  function connectionMap(g) {
    const m = new Map();
    for (const c of g.conns) m.set(c.innov, c);
    return m;
  }

  function compatibilityDistance(a, b, opts) {
    opts = opts || {};
    const c1 = opts.c1 != null ? opts.c1 : 1.0;
    const c2 = opts.c2 != null ? opts.c2 : 1.0;
    const c3 = opts.c3 != null ? opts.c3 : 0.4;
    const ma = connectionMap(a);
    const mb = connectionMap(b);
    let maxA = 0, maxB = 0;
    for (const k of ma.keys()) if (k > maxA) maxA = k;
    for (const k of mb.keys()) if (k > maxB) maxB = k;
    const keys = new Set([...ma.keys(), ...mb.keys()]);
    let excess = 0, disjoint = 0, matching = 0, wDiff = 0;
    for (const k of keys) {
      const ca = ma.get(k);
      const cb = mb.get(k);
      if (ca && cb) {
        matching++;
        wDiff += Math.abs(ca.weight - cb.weight);
      } else if ((ca && k > maxB) || (cb && k > maxA)) {
        excess++;
      } else {
        disjoint++;
      }
    }
    const nGenes = Math.max(a.conns.length, b.conns.length);
    const norm = nGenes < 20 ? 1 : nGenes;
    const avgW = matching > 0 ? wDiff / matching : 0;
    return (c1 * excess) / norm + (c2 * disjoint) / norm + c3 * avgW;
  }

  function cloneNodeFromParents(id, a, b, rng) {
    const na = nodeById(a, id);
    const nb = nodeById(b, id);
    const n = (na && nb && rng && rng.proba(0.5)) ? nb : (na || nb);
    if (!n) return null;
    const cn = { id: n.id, kind: n.kind, act: n.act, bias: n.bias };
    if (n.mix && n.mix.length > 0) cn.mix = n.mix.map(m => ({ act: m.act, w: m.w }));
    return cn;
  }

  // NEAT crossover. `fitter` should be the more fit parent; disjoint/excess
  // genes are inherited only from that parent. Matching genes are randomly
  // chosen from either parent. The resulting DAG is cycle-checked because this
  // demo's evaluator is feed-forward only.
  function crossover(fitter, other, rng, opts) {
    opts = opts || {};
    const disabledProb = opts.disabledGeneProb != null ? opts.disabledGeneProb : 0.75;
    const ma = connectionMap(fitter);
    const mb = connectionMap(other);
    const child = makeGenome(fitter.numInputs, fitter.numOutputs);
    child.nodes = [];
    const selected = [];
    const allInnovs = Array.from(new Set([...ma.keys(), ...mb.keys()])).sort((x, y) => x - y);
    for (const innov of allInnovs) {
      const ca = ma.get(innov);
      const cb = mb.get(innov);
      let src = null;
      if (ca && cb) {
        src = rng.proba(0.5) ? ca : cb;
      } else if (ca) {
        src = ca;
      } else if (opts.includeOtherDisjoint) {
        src = cb;
      }
      if (!src) continue;
      const enabled = (ca && cb && (!ca.enabled || !cb.enabled))
        ? !rng.proba(disabledProb)
        : src.enabled;
      selected.push({
        innov: src.innov,
        from: src.from,
        to: src.to,
        weight: src.weight,
        enabled: enabled,
      });
    }

    const nodeIds = new Set();
    for (let i = 0; i < fitter.numInputs + fitter.numOutputs; i++) nodeIds.add(i);
    for (const c of selected) {
      nodeIds.add(c.from);
      nodeIds.add(c.to);
    }
    const sortedIds = Array.from(nodeIds).sort((x, y) => x - y);
    for (const id of sortedIds) {
      const n = cloneNodeFromParents(id, fitter, other, rng);
      if (n) child.nodes.push(n);
    }

    for (const c of selected) {
      const cc = {
        innov: c.innov,
        from: c.from,
        to: c.to,
        weight: c.weight,
        enabled: false,
      };
      child.conns.push(cc);
      if (c.enabled && canEnableConnection(child, cc)) cc.enabled = true;
    }
    child._order = null;
    // A2: combine mode rides on the genome; inherit from the fitter parent.
    if (fitter && fitter.mixMode !== undefined) child.mixMode = fitter.mixMode;
    return child;
  }

  // ---------- Topology hash (for crude species count) ----------
  function topologySignature(g) {
    const conns = g.conns
      .filter(c => c.enabled)
      .map(c => c.from + '->' + c.to)
      .sort()
      .join(',');
    return g.nodes.length + '|' + conns;
  }

  function stats(g) {
    const enabled = g.conns.filter(c => c.enabled).length;
    return {
      nodes: g.nodes.length,
      hidden: g.nodes.filter(n => n.kind === 'hidden').length,
      conns: g.conns.length,
      enabledConns: enabled,
    };
  }

  BF.neat = {
    ACT, ACT_NAMES, ACT_META, actColor, applyAct, combineMix, mixtureExtraCount,
    makeGenome, addHiddenLayer, makeSeededGenome, cloneGenome, mutate, evaluateGenome, policy,
    canConnect, canEnableConnection, topoSort, topologySignature, stats,
    compatibilityDistance, crossover,
    defaultMutationParams, nextInnovation, innovationForConnection, resetInnovation,
  };
})(window.BF);
