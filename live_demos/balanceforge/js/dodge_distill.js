// dodge_distill.js — distill the model-based dodge PLANNER into a reactive
// NETWORK by behavioral cloning. The planner (js/dodge_planner.js) is the
// expert; it plans from full bullet state. We collect
// (observation -> planner action) demonstrations and train a small MLP by
// gradient descent to imitate them. The distilled network then dodges using
// only the normal topk observation (8 nearest bullets) — no lookahead, no
// model. The survival GAP between planner and distilled net measures how much
// of the skill survives the observation bottleneck + the reactive-vs-planning
// gap. DAgger (collect on the STUDENT's own trajectory, label with the expert)
// closes the compounding-error gap that plain behavioral cloning leaves.
//
//   create(opts)                 -> dd (MLP weights + Adam + dataset buffer)
//   collect(dd, drive, steps, seed) -> add demos; drive = 'expert' (BC) or the
//                                   student policy fn (DAgger). Planner always
//                                   labels. Returns samples added.
//   trainEpoch(dd)               -> shuffled-minibatch Adam, cross-entropy loss
//   forward(dd, obs, hbuf)       -> [cx, cy]
//   makePolicy(dd)               -> {command, commandAll} adapter for the app
//   evalSurvival(dd, o)          -> mean survival seconds of the student
//
// Requires BF.dodgePlanner + BF.setups + BF.physics.

(function (BF) {
  'use strict';
  if (!BF) return;
  const DT = 1 / 120;
  // 9 discrete moves, MATCHING the planner's candidate directions
  // (for dx in [-1,0,1] for dy in [-1,0,1]). The student CLASSIFIES which move
  // the planner would pick — crisper than regressing a continuous (cx,cy), which
  // blurs between diagonal and axial moves and compounds into drift.
  const DIRS = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) DIRS.push([dx, dy]);
  const dirIndex = (cx, cy) => (Math.round(cx) + 1) * 3 + (Math.round(cy) + 1);

  const DEFAULTS = {
    inDim: 36,          // dodge topk observation (4 + 8*4)
    observationMode: 'topk', // 'radar' is an explicitly model-informed comparison
    hidden: 48,
    lr: 2e-3, beta1: 0.9, beta2: 0.999, eps: 1e-8,
    batch: 64,
    maxSamples: 80000,  // ring-buffer cap on the demo set
    spawnRate: 3,
    worldOpts: null,    // exact selected live dynamics and bullet parameters
    safeOnly: true,     // DAgger: only keep states where the expert found a
                        // fully-safe plan (label a correct move, not a death throe)
    seed: 20260714,
  };

  function rngOf(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0x100000000); };
  }

  function create(opts) {
    const c = Object.assign({}, DEFAULTS, opts || {});
    if (c.observationMode !== 'topk') {
      const setup = BF.setups.getSetup('dodge');
      setup.setObservationMode(c.observationMode);
      c.inDim = setup.observationCount;
    }
    const rand = rngOf(c.seed);
    const nrm = () => (rand() * 2 - 1);
    const H = c.hidden, I = c.inDim, O = 9;   // 9-way classification head
    const s1 = Math.sqrt(1 / I), s2 = Math.sqrt(1 / H);
    const W1 = new Float64Array(H * I); for (let i = 0; i < W1.length; i++) W1[i] = nrm() * s1;
    const b1 = new Float64Array(H);
    const W2 = new Float64Array(O * H); for (let i = 0; i < W2.length; i++) W2[i] = nrm() * s2;
    const b2 = new Float64Array(O);
    const mk = (n) => new Float64Array(n);
    return {
      config: c, H, I, O,
      W1, b1, W2, b2,
      mW1: mk(H * I), vW1: mk(H * I), mb1: mk(H), vb1: mk(H),
      mW2: mk(O * H), vW2: mk(O * H), mb2: mk(O), vb2: mk(O),
      iter: 0,
      dataset: [],           // {obs: Float32Array(I), y: dirIndex}
      lastLoss: NaN, epochs: 0, samples: 0,
      _hbuf: new Float64Array(H), _logit: new Float64Array(O),
      _rng: rngOf((c.seed ^ 0x9e3779b9) >>> 0),
    };
  }

  // Logits over the 9 moves for one observation. Fills hbuf + logitBuf.
  function forwardLogits(dd, obs, hbuf, logitBuf) {
    const H = dd.H, I = dd.I, O = dd.O, W1 = dd.W1, b1 = dd.b1, W2 = dd.W2, b2 = dd.b2;
    const h = hbuf || dd._hbuf, lg = logitBuf || dd._logit;
    for (let j = 0; j < H; j++) {
      let s = b1[j], base = j * I;
      for (let i = 0; i < I; i++) s += W1[base + i] * obs[i];
      h[j] = Math.tanh(s);
    }
    for (let o = 0; o < O; o++) {
      let s = b2[o], base = o * H;
      for (let j = 0; j < H; j++) s += W2[base + j] * h[j];
      lg[o] = s;
    }
    return lg;
  }

  // Student action: argmax move -> [cx, cy].
  function forward(dd, obs, hbuf) {
    const lg = forwardLogits(dd, obs, hbuf, dd._logit);
    let best = 0, bv = lg[0];
    for (let o = 1; o < dd.O; o++) if (lg[o] > bv) { bv = lg[o]; best = o; }
    return DIRS[best];
  }

  // Build a fresh dodge world (topk obs). Shared by collect + eval.
  function makeWorld(seed, spawnRate, worldOpts, observationMode) {
    const setup = BF.setups.getSetup('dodge');
    if (setup.setObservationMode) setup.setObservationMode(observationMode || 'topk');
    const st = setup.buildWorld(Object.assign({
      dodgePattern: 'mixed', dodgeSpawnRate: spawnRate,
    }, worldOpts || {}, {
      seed: seed, dodgePatternSeed: seed, dodgeNoDie: false,
    }));
    st.observationMode = observationMode || 'topk';
    return { setup, st };
  }

  // Collect demos. drive='expert' -> behavioral cloning (states the planner
  // visits). drive=fn(obs)->[cx,cy] -> DAgger (states the STUDENT visits). The
  // planner (replan every step, for clean labels) always provides the target.
  function collect(dd, drive, steps, seed) {
    const c = dd.config;
    let w = makeWorld(seed, c.spawnRate, c.worldOpts, c.observationMode);
    const P = BF.physics;
    // viz on so we can read bestSurv (safe-state filter). replanSteps controls
    // label freshness vs cost (1 = cleanest/slowest; the app uses ~2 to keep a
    // generation ~1-2s).
    const labeler = BF.dodgePlanner.create({ replanSteps: c.labelReplan || 1, viz: true });
    let resetSeed = seed, added = 0;
    for (let s = 0; s < steps; s++) {
      const obs = w.setup.buildObservation(w.st);
      const tgt = BF.dodgePlanner.command(labeler, w.st);   // expert label
      const lv = labeler.lastViz;
      const safe = !lv || lv.bestSurv >= lv.horizonSteps;   // planner found a clear route
      // BC (expert-driven) keeps everything; DAgger (student-driven) keeps only
      // recoverable states so the net learns real recoveries, not death throes.
      if (drive === 'expert' || !c.safeOnly || safe) {
        dd.dataset.push({ obs: Float32Array.from(obs), y: dirIndex(tgt[0], tgt[1]) });
        added++;
      }
      let cmd;
      if (drive === 'expert') cmd = tgt;
      else cmd = drive(obs);
      w.st.lastCmds = [cmd[0], cmd[1]]; w.st.lastCmd = cmd[0];
      P.step(w.st.world, DT, cmd[0]);
      w.setup.tick(w.st, DT);
      if (w.st.dead) { resetSeed = (resetSeed + 101) >>> 0; w = makeWorld(resetSeed, c.spawnRate, c.worldOpts, c.observationMode);
                       labeler.plan = [[0, 0], [0, 0]]; labeler.since = Infinity; }
    }
    if (dd.dataset.length > c.maxSamples) dd.dataset.splice(0, dd.dataset.length - c.maxSamples);
    dd.samples = dd.dataset.length;
    return added;
  }

  // One epoch: shuffled minibatch Adam, softmax cross-entropy vs the planner's
  // chosen move. Returns mean cross-entropy loss.
  function trainEpoch(dd) {
    const c = dd.config, N = dd.dataset.length;
    if (N === 0) return NaN;
    const H = dd.H, I = dd.I, O = dd.O;
    const idx = dd._idx && dd._idx.length === N ? dd._idx : (dd._idx = new Int32Array(N).map((_, i) => i));
    for (let i = N - 1; i > 0; i--) { const j = (dd._rng() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const gW1 = new Float64Array(H * I), gb1 = new Float64Array(H);
    const gW2 = new Float64Array(O * H), gb2 = new Float64Array(O);
    const h = new Float64Array(H), lg = new Float64Array(O), pr = new Float64Array(O);
    let lossSum = 0, seen = 0;
    for (let start = 0; start < N; start += c.batch) {
      const end = Math.min(N, start + c.batch);
      gW1.fill(0); gb1.fill(0); gW2.fill(0); gb2.fill(0);
      for (let s = start; s < end; s++) {
        const smp = dd.dataset[idx[s]], obs = smp.obs, y = smp.y;
        forwardLogits(dd, obs, h, lg);
        // softmax
        let mx = lg[0]; for (let o = 1; o < O; o++) if (lg[o] > mx) mx = lg[o];
        let sum = 0; for (let o = 0; o < O; o++) { pr[o] = Math.exp(lg[o] - mx); sum += pr[o]; }
        const inv = 1 / sum; for (let o = 0; o < O; o++) pr[o] *= inv;
        lossSum += -Math.log(Math.max(1e-9, pr[y])); seen++;
        // dLogit = softmax - onehot
        for (let o = 0; o < O; o++) {
          const dl = pr[o] - (o === y ? 1 : 0);
          gb2[o] += dl;
          const base = o * H;
          for (let j = 0; j < H; j++) gW2[base + j] += dl * h[j];
        }
        // hidden grad
        for (let j = 0; j < H; j++) {
          let dh = 0;
          for (let o = 0; o < O; o++) dh += (pr[o] - (o === y ? 1 : 0)) * dd.W2[o * H + j];
          dh *= (1 - h[j] * h[j]);
          gb1[j] += dh;
          const base = j * I;
          for (let i = 0; i < I; i++) gW1[base + i] += dh * obs[i];
        }
      }
      const bs = end - start;
      dd.iter++;
      adam(dd, dd.W1, gW1, dd.mW1, dd.vW1, bs);
      adam(dd, dd.b1, gb1, dd.mb1, dd.vb1, bs);
      adam(dd, dd.W2, gW2, dd.mW2, dd.vW2, bs);
      adam(dd, dd.b2, gb2, dd.mb2, dd.vb2, bs);
    }
    dd.epochs++;
    dd.lastLoss = seen ? lossSum / seen : NaN;
    return dd.lastLoss;
  }

  function adam(dd, w, g, m, v, bs) {
    const c = dd.config, t = dd.iter;
    const bc1 = 1 - Math.pow(c.beta1, t), bc2 = 1 - Math.pow(c.beta2, t);
    for (let i = 0; i < w.length; i++) {
      const gi = g[i] / bs;
      m[i] = c.beta1 * m[i] + (1 - c.beta1) * gi;
      v[i] = c.beta2 * v[i] + (1 - c.beta2) * gi * gi;
      w[i] -= c.lr * (m[i] / bc1) / (Math.sqrt(v[i] / bc2) + c.eps);
    }
  }

  // App display adapter — the distilled network as a dodge policy.
  // Copy inference weights only: training continues in place without changing
  // the validation-selected policy that Test will replay.
  function snapshot(dd) {
    return { H: dd.H, I: dd.I, O: dd.O, config: Object.assign({}, dd.config),
      W1: dd.W1.slice(), b1: dd.b1.slice(), W2: dd.W2.slice(), b2: dd.b2.slice(),
      _hbuf: new Float64Array(dd.H), _logit: new Float64Array(dd.O) };
  }

  function retainValidationBest(dd, score) {
    if (!Number.isFinite(score)) return false;
    if (dd.bestPolicy && score <= dd.bestValidationScore) return false;
    dd.bestPolicy = snapshot(dd);
    dd.bestValidationScore = score;
    dd.bestValidationEpoch = dd.epochs;
    return true;
  }

  function makePolicy(dd) {
    const h = new Float64Array(dd.H);
    return {
      isDistilled: true,
      command(obs) { return forward(dd, obs, h)[0]; },
      commandAll(obs, buf) {
        const o = forward(dd, obs, h);
        buf[0] = o[0]; buf[1] = o[1];
        for (let i = 2; i < buf.length; i++) buf[i] = 0;
        return buf;
      },
    };
  }

  // Ground-truth survival of the student network (mean over seeds).
  function evalSurvival(dd, o) {
    o = o || {};
    const c = dd.config;
    const seeds = o.seeds || [101, 202, 303];
    const cap = o.capSeconds != null ? o.capSeconds : 12;
    const h = new Float64Array(dd.H);
    const P = BF.physics;
    let sum = 0;
    for (const seed of seeds) {
      const w = makeWorld(seed, o.spawnRate != null ? o.spawnRate : c.spawnRate,
        Object.assign({}, c.worldOpts, o.worldOpts), c.observationMode);
      const maxSteps = Math.round(cap / DT);
      let s = 0;
      for (; s < maxSteps; s++) {
        const out = forward(dd, w.setup.buildObservation(w.st), h);
        w.st.lastCmds = [out[0], out[1]]; w.st.lastCmd = out[0];
        P.step(w.st.world, DT, out[0]);
        w.setup.tick(w.st, DT);
        if (w.st.dead) break;
      }
      sum += s * DT;
    }
    return sum / seeds.length;
  }

  BF.dodgeDistill = { create, collect, trainEpoch, forward, makePolicy, evalSurvival,
    snapshot, retainValidationBest, DEFAULTS };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
