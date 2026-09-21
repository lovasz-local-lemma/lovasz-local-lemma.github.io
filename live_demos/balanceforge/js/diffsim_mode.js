// diffsim_mode.js — glue that makes the differentiable backends behave like a
// selectable trainer MODE in the main app, so they show their evolution in the
// same fitness chart + live display as the population models.
//
// The app keeps a normal (double-pendulum) population trainer as a FACADE (for
// the chart/HUD/display scaffolding) but, when a diffsim mode is active, drives
// this instead: stepGen() advances the engine and returns a stats row shaped
// like the trainer's history entries (so the fitness chart plots the meanUp
// climbing); displayFrame() yields node positions to write into the double
// showState (so the live canvas shows it balancing). ALL app.js hooks are gated
// on isActive(mode) -> the non-diffsim path stays byte-identical.
//
// Two things this file owns beyond raw glue:
//   1. It passes the caller's opts (gravity, cartAccel, hidden units, tilt,
//      seed) straight through to the engines, so the main UI's controls
//      actually change the diffsim run instead of being ignored.
//   2. It runs a NATIVE curriculum on the 0-1 meanUp scale (the population
//      curriculum's fitness units don't apply to a differentiable rollout):
//      a reverse/perturbation curriculum that starts near-upright and ramps the
//      training tilt harder as the policy masters each level. The gate is
//      meanUp >= thresholdFrac for consecReq gens; on advance the engine's
//      best-tracker resets so the harder level has to be re-earned (this is
//      what makes the fitness curve sawtooth as difficulty steps up).
//
// Requires BF.diffsimTrainer + BF.diffsimLqr (which require BF.diffSim).

(function (BF) {
  'use strict';
  if (!BF) return;
  // Rotating display perturbations for LQR / non-curriculum neural (both signs
  // + magnitudes so the live view isn't a single canned tilt).
  const PERTS = [3, -3, 5, -5, 4, -4, 6, -2];
  const clamp01 = (x) => x < 0 ? 0 : (x > 1 ? 1 : x);

  function isActive(mode) {
    if (mode === 'rigid-reference' || mode === 'rigid-triple-reference') return true;
    return mode === 'diffsim-adam' || mode === 'diffsim-lqr'
        || mode === 'diffsim-memetic' || mode === 'diffsim-trajopt'
        || mode === 'rigid-lqr' || mode === 'rigid-swingup'
        || mode === 'rigid-triple-lqr' || mode === 'rigid-triple-swingup';
  }
  // Deterministic per-run RNG (LCG) for the memetic GA operators, so a run is
  // reproducible from its seed.
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  }
  // Compute the current curriculum level's difficulty ONCE: fills cur.applied
  // (for the HUD), returns the training tilt + a {knobKey: value} map of the
  // config knobs (gravity/damping/stiffness) to push onto each engine. Shared by
  // the neural (single) + memetic (population) paths.
  function computeLevel(cur) {
    cur.applied = [];
    let tilt = null; const knobVals = {};
    const specs = cur.specs || [];
    if (specs.length) {
      for (const sp of specs) {
        const steps = (sp.steps && sp.steps > 0) ? sp.steps : cur.maxLevel;
        const frac = steps > 0 ? Math.min(1, cur.level / steps) : 1;
        const val = applySpec(sp, frac);
        if (sp.paramKey === 'startTiltDeg') {
          tilt = val;
          cur.applied.push({ key: 'startTiltDeg', label: 'tilt', value: val, to: sp.to, unit: '°' });
        } else if (SPEC_KNOBS[sp.paramKey]) {
          knobVals[sp.paramKey] = val;
          cur.applied.push({ key: sp.paramKey, label: sp.paramKey, value: val, to: sp.to });
        } else {
          cur.applied.push({ key: sp.paramKey, label: sp.paramKey, value: val, to: sp.to, na: true });
        }
      }
      if (tilt == null) tilt = cur.maxPertDeg;
    } else {
      tilt = levelPertDeg(cur, cur.level);
    }
    cur.pertDeg = tilt;
    cur.threshold = cur.thresholdFrac;
    return { tilt: tilt, knobVals: knobVals };
  }
  function applyLevelToEngine(engine, tilt, knobVals) {
    for (const k in knobVals) if (SPEC_KNOBS[k]) SPEC_KNOBS[k](engine.config, knobVals[k]);
    engine.config.trainPerts = [tilt, -tilt, tilt * 0.5, -tilt * 0.5];
  }
  // Curriculum advance gate on the 0-1 meanUp scale, with ADAPTIVE PACING.
  // Returns 'advanced', 'retreated', or null.
  //
  // Pacing: when the gate passes, the level advances by cur.stepSize (which
  // recovers toward 1 on success). When the level is STUCK for paceAfter gens,
  // the ramp retreats by half a step and halves stepSize (min 1/8) -- it backs
  // off from the difficulty wall and re-approaches in smaller increments.
  // Warm-starting across a SMALL difficulty step is where gradient refinement
  // shines; a fixed integer step can cross a difficulty cliff no optimizer
  // survives (probe: five optimizer variants all parked at the same 0.76
  // plateau on the level-3->4 jump). If even the minimum step can't cross,
  // stepSize sits at the floor -- the honest "this is the wall" signal.
  function advanceIfReady(cur, gen, meanUp) {
    if (!cur || !cur.enabled) return null;
    cur.meanUp = meanUp;
    if (cur.level >= cur.maxLevel) return null;
    if (meanUp >= cur.threshold) cur.consec++; else cur.consec = 0;
    if (cur.consec >= cur.consecReq) {
      cur.level = Math.min(cur.maxLevel, cur.level + cur.stepSize);
      cur.stepSize = Math.min(1, cur.stepSize * 1.3);
      cur.consec = 0; cur._stuck = 0; cur.levelStartGen = gen + 1;
      return 'advanced';
    }
    if (++cur._stuck >= cur.paceAfter && cur.level > 0) {
      cur.stepSize = Math.max(cur.minStep, cur.stepSize / 2);
      cur.level = Math.max(0, cur.level - cur.stepSize);
      cur._stuck = 0; cur.consec = 0; cur.levelStartGen = gen + 1;
      cur.paces = (cur.paces || 0) + 1;
      return 'retreated';
    }
    return null;
  }

  // Curriculum knobs the differentiable engine can actually ramp per level.
  // buildWorld() reads these fresh each rollout, so mutating engine.config
  // between gens takes effect. `startTiltDeg` is handled specially (it drives
  // the training perturbation set, not a config field). Knobs baked into the
  // hoisted Var constants at create() time (cartAccel, cartMaxSpeed) can't be
  // ramped in place and are reported as N/A in the HUD.
  const SPEC_KNOBS = {
    gravity:   (c, v) => { c.gravity = v; },
    damping:   (c, v) => { c.damping = v; },
    stiffness: (c, v) => { c.stiffness = v; },
  };
  // Applied value for one curriculum spec at level fraction f in [0,1].
  // Multiplicative (geometric) when both endpoints are positive AND the spec
  // asks for it; otherwise additive/linear. Mirrors BF.trainer.curriculumApply.
  function applySpec(spec, f) {
    f = f < 0 ? 0 : (f > 1 ? 1 : f);
    if (spec.mode === 'multiplicative' && spec.from > 0 && spec.to > 0) {
      return spec.from * Math.pow(spec.to / spec.from, f);
    }
    return spec.from + (spec.to - spec.from) * f;
  }

  // Perturbation (deg) for a curriculum level: reverse curriculum from
  // startFrac*maxPertDeg (easy, near-upright) at level 0 up to maxPertDeg (hard)
  // at the final level.
  function levelPertDeg(cur, level) {
    const frac = cur.maxLevel > 0
      ? (cur.startFrac + (1 - cur.startFrac) * (level / cur.maxLevel))
      : 1;
    return cur.maxPertDeg * frac;
  }

  // Build a run for the given mode. Returns null if the engines aren't loaded.
  function create(mode, opts) {
    const o = opts || {};
    if (mode === 'diffsim-lqr') {
      if (!BF.diffsimLqr) return null;
      const d = BF.diffsimLqr.design(o);   // honors o.gravity / o.maxAccel / o.damping
      return { kind: 'lqr', lqrD: d, gen: 0, meanUp: 0, frames: [], frameIdx: 0,
               reqTiltDeg: (o.pertDeg != null ? o.pertDeg : 6),   // UI start tilt (capped by the hold guard)
               config: d.config, gradTrace: null, cur: null };
    }
    if (mode === 'diffsim-trajopt') {
      // Swing-up showcase: optimize ONE open-loop trajectory from hang-down to
      // upright (direct shooting through the diff-sim), LQR catches at the top.
      // No curriculum — the whole trajectory IS the problem; each "generation"
      // is a chunk of Adam iterations on the control sequence.
      if (!BF.diffsimTrajopt || !BF.diffsimLqr) return null;
      const to = BF.diffsimTrajopt.create(o);       // honors gravity/cartAccel/seed
      const lqrD = BF.diffsimLqr.design({ gravity: to.config.gravity, damping: to.config.damping });
      return { kind: 'trajopt', to: to, lqrD: lqrD, gen: 0, meanUp: 0,
               frames: [], frameIdx: 0, config: to.config, gradTrace: null, cur: null,
               itersPerGen: Math.max(1, (o.itersPerGen | 0) || 15),
               catchAtS: null, holdMeanUp: -1 };
    }
    // RIGID minimal-coordinate models (js/rigid_double.js / js/rigid_triple.js)
    // — the fix for the stiff-spring diffsim's corrupt gradients. The triple
    // exports the SAME API as the double (frames additionally carry n3), so
    // both share the rigidLqr/rigidSwingup kinds and step functions verbatim.
    if (mode === 'rigid-reference' || mode === 'rigid-triple-reference') {
      const isTriple=mode==='rigid-triple-reference',RD=isTriple?BF.rigidTriple:BF.rigidDouble;
      const live=BF.pendulumReference.create({links:isTriple?3:2,gravity:o.gravity??700,maxAccel:o.cartAccel??6000,
        phase:o.referencePhase||'swingup',tiltDeg:o.referencePhase==='hold'?5:180});
      return {kind:'rigidLqr',RD,rdOpts:live.config,g:live.gravity,K:live.K,isTriple,liveReference:live,
        reqTiltDeg:o.referencePhase==='hold'?5:180,lastTiltDeg:o.referencePhase==='hold'?5:180,reqTiltCapped:false,gen:0,meanUp:RD.uprightness(live.state),frames:[],frameIdx:0,
        config:{...live.config,gravity:live.gravity,segLen:live.config.segLen,cartAccel:live.config.maxAccel},gradTrace:null,cur:null};
    }
    if (mode === 'rigid-lqr' || mode === 'rigid-swingup'
        || mode === 'rigid-triple-lqr' || mode === 'rigid-triple-swingup') {
      const isTriple = mode.indexOf('triple') >= 0;
      if (isTriple ? !BF.rigidTriple : !BF.rigidDouble) return null;
      const RD = isTriple ? BF.rigidTriple : BF.rigidDouble;
      const rdOpts = { segLen: 80, railHalf: 150, wallK: 500, maxAccel: (o.cartAccel | 0) || 6000 };
      const g = (o.gravity != null ? o.gravity : 700);
      const cfg = { gravity: g, horizonS: 8, segLen: rdOpts.segLen, cartAccel: rdOpts.maxAccel, damping: 0 };
      if (mode === 'rigid-lqr' || mode === 'rigid-triple-lqr') {
        if (!BF.rigidReference) return null;
        // Local feedback is evaluated on the current physical state, including
        // any nudge. The requested tilt is never reduced to conceal a failed hold.
        const tilt = o.pertDeg != null ? o.pertDeg : 12;
        const live = BF.rigidReference.create(Object.assign({}, rdOpts, {
          links: isTriple ? 3 : 2, gravity: g, tiltDeg: tilt,
        }));
        return { kind: 'rigidLqr', RD: RD, rdOpts: rdOpts, g: g, K: live.K, isTriple: isTriple,
                 liveReference: live, reqTiltDeg: tilt, lastTiltDeg: tilt, reqTiltCapped: false,
                 gen: 0, meanUp: RD.uprightness(live.state), frames: [], frameIdx: 0,
                 config: cfg, gradTrace: null, cur: null };
      }
      const K = RD.designLQR(g, rdOpts).K;
      // Full down->up->hold: exact-gradient trajopt swings up, LQR catches. Each gen
      // is a chunk of Adam iterations on the open-loop control sequence. Passing K
      // arms VERIFIED-catch tracking + multi-start (rigid_double.js createSwingUp):
      // every proxy improvement is checked with a real LQR-catch replay, and the
      // optimizer restarts from a fresh init if a basin's optimum never hands off —
      // This improves search coverage; a finite restart budget cannot guarantee
      // a catch, and only a verified replay is presented as a successful swing-up.
      const su = RD.createSwingUp(g, Object.assign({ seed: (o.seed | 0) || 7, K: K, ctrlRateW: o.ctrlRateW || 0 }, rdOpts));
      return { kind: 'rigidSwingup', RD: RD, rdOpts: rdOpts, g: g, K: K, su: su, isTriple: isTriple,
               gen: 0, meanUp: 0, frames: [], frameIdx: 0, config: cfg, gradTrace: null, cur: null,
               // Adam chunk per gen for the open-loop trajopt. 24 keeps each
               // synchronous gen light (~50-150ms) while halving the wall-clock
               // to the first VERIFIED catch; the user still watches the
               // swing-up attempt improve gen by gen.
               itersPerGen: 24,
               peakUp: 0, catchAtS: null, holdMeanUp: -1 };
    }
    if (!BF.diffsimTrainer) return null;
    const e = BF.diffsimTrainer.create(o);  // honors o.gravity/cartAccel/hidden/pertDeg/seed
    const cc = o.curriculum || {};
    const specs = Array.isArray(cc.specs) ? cc.specs.filter(s => s && s.paramKey) : [];
    const tiltSpec = specs.find(s => s.paramKey === 'startTiltDeg');
    // The hardest tilt: the tilt spec's target if ramping tilt, else the base.
    const maxPertDeg = (tiltSpec != null ? tiltSpec.to
                       : (cc.maxPertDeg != null ? cc.maxPertDeg
                       : (o.pertDeg != null ? o.pertDeg : e.config.pertDeg))) || 6;
    const cur = {
      enabled: !!cc.enabled,
      level: 0,
      maxLevel: Math.max(1, (cc.maxLevel | 0) || 6),
      thresholdFrac: (cc.thresholdFrac != null ? clamp01(cc.thresholdFrac) : 0.9),
      consecReq: Math.max(1, (cc.consecReq | 0) || 2),
      startFrac: (cc.startFrac != null ? clamp01(cc.startFrac) : 0.25),
      specs: specs,          // [{paramKey, from, to, steps, mode}] — the real ramp
      applied: [],           // per-gen readout for the HUD
      consec: 0,
      levelStartGen: 0,
      // Adaptive pacing state (see advanceIfReady).
      stepSize: 1, minStep: 0.125,
      paceAfter: Math.max(4, (cc.paceAfter | 0) || 14),
      _stuck: 0, paces: 0,
      maxPertDeg: maxPertDeg,
      pertDeg: 0,        // current level tilt (filled each step)
      meanUp: 0,         // current level's best upright fraction
      threshold: 0,      // = thresholdFrac (ceiling is 1.0 on the meanUp scale)
    };
    // Curriculum OFF: TRAIN on the user's fixed tilt (mirror the level
    // perturbation set) so the policy learns the SAME release angle the live
    // view is tested from. Without this, trainPerts stays the engine default
    // (±3,±6) and the tilt slider would only move the display -> the chart
    // climbs to ~1.0 (mastered ±6°) while the pendulum released from ±tilt
    // falls over. When ON, stepGen overwrites trainPerts per level each gen.
    const seedTrainPerts = (eng) => {
      const pd = (o.pertDeg != null ? o.pertDeg : eng.config.pertDeg) || 6;
      eng.config.trainPerts = [pd, -pd, pd * 0.5, -pd * 0.5];
    };
    if (!cur.enabled) seedTrainPerts(e);

    if (mode === 'diffsim-memetic') {
      // A population of exact-gradient policies. e is individual 0; the rest get
      // distinct seeds so the initial weights differ (the exploration diversity).
      // Hard cap 16: each individual costs localIters x 4 autodiff rollouts per
      // gen, so pop 40 (from the population slider's default 120) means ~1 min
      // between chart points -- which reads as "training isn't plotting at all".
      const popSize = Math.max(3, Math.min(16, (o.popSize | 0) || 10));
      const baseSeed = (o.seed != null ? o.seed : 20260712) >>> 0;
      const pop = [e];
      for (let i = 1; i < popSize; i++) {
        const ei = BF.diffsimTrainer.create(Object.assign({}, o, { seed: (baseSeed + i * 0x9E3779B1) >>> 0 }));
        if (!cur.enabled) seedTrainPerts(ei);
        pop.push(ei);
      }
      const mutBase = (o.mutationScale != null ? o.mutationScale : 0.12);
      return { kind: 'memetic', pop: pop, engine: e, gen: 0, meanUp: 0, frames: [], frameIdx: 0,
               config: e.config, gradTrace: null, cur: cur,
               localIters: Math.max(1, (o.localIters | 0) || 2),
               eliteFrac: (o.eliteFrac != null ? Math.max(0.05, Math.min(0.9, o.eliteFrac)) : 0.3),
               mutationScale: mutBase, mutBase: mutBase, _lastBest: null, _noImp: 0,
               rng: makeRng((baseSeed ^ 0x5BD1E995) >>> 0) };
    }
    return { kind: 'neural', engine: e, gen: 0, meanUp: 0, frames: [], frameIdx: 0,
             config: e.config, itersPerGen: (o.itersPerGen || 6), gradTrace: null, cur: cur,
             // Basin-hopping stuck-escape: after `escapeAfter` gens with no gate
             // improvement, restart Adam from the level's best weights + noise
             // (escalating scale). A single gradient run has no other way out of
             // a converged local optimum (probe: 0.758->0.763 over 40 gens).
             // Last resort under adaptive pacing (pacing retreats at ~14 stuck
             // gens and resets this counter via the gate improving again, so
             // escapes only fire once pacing is exhausted at the wall).
             escapeAfter: Math.max(3, (o.escapeAfter | 0) || 24),
             escapeScale: (o.escapeScale != null ? o.escapeScale : 0.15),
             rng: makeRng((((o.seed != null ? o.seed : 20260712) >>> 0) ^ 0x2545F491) >>> 0),
             _lastGate: 0, _noImp: 0, _escCount: 0 };
  }

  // Advance one "generation" (a chunk of Adam iters for neural; a re-hold for
  // LQR). Refreshes the display trajectory + (neural) the grad trace, drives the
  // curriculum, and returns a history-shaped stats row.
  function stepGen(run) {
    if (!run) return null;
    let stats;
    if (run.kind === 'neural') stats = stepNeural(run);
    else if (run.kind === 'memetic') stats = stepMemetic(run);
    else if (run.kind === 'trajopt') stats = stepTrajopt(run);
    else if (run.kind === 'rigidLqr') stats = stepRigidLqr(run);
    else if (run.kind === 'rigidSwingup') stats = stepRigidSwingup(run);
    else stats = stepLqr(run);
    run.gen++;
    const f = Math.max(0, run.meanUp);
    // Shaped like a trainer history row so the existing chart/HUD render it.
    // Memetic supplies a real population spread; single-policy modes are flat.
    run.lastStats = { gen: run.gen,
                      best: f,
                      avg: stats && stats.avg != null ? Math.max(0, stats.avg) : f,
                      median: stats && stats.median != null ? Math.max(0, stats.median) : f,
                      worst: stats && stats.worst != null ? Math.max(0, stats.worst) : f,
                      ms: 0, evalsPerSec: 0, avgNodes: 0, avgConns: 0,
                      species: stats && stats.species != null ? stats.species : 1 };
    return run.lastStats;
  }

  // --- Single exact-gradient policy (diffsim-adam) ---
  function stepNeural(run) {
    const cur = run.cur;
    let pd;
    if (cur && cur.enabled) {
      const lv = computeLevel(cur);
      pd = lv.tilt;
      applyLevelToEngine(run.engine, lv.tilt, lv.knobVals);
    } else {
      pd = run.config.pertDeg || 6;
    }
    BF.diffsimTrainer.trainIters(run.engine, run.itersPerGen);
    // Gate + headline metric = best END-window uprightness (excludes the fall
    // transient, so its ceiling doesn't decay with tilt — a real catch scores
    // ~0.95 at any level, a failed one ~0.4). Reset on each level advance, so
    // the fitness curve sawtooths as the ramp steps up.
    const mu = Math.max(0, run.engine.bestEndUp);
    run.meanUp = mu;
    run.lastLoss = run.engine.lastLoss;
    const dispPert = (run.gen % 2 ? -1 : 1) * pd;
    setFrames(run, BF.diffsimTrainer.trajectory(run.engine, dispPert, run.config.horizonS).frames);
    try { run.gradTrace = BF.diffsimTrainer.gradTrace(run.engine); } catch (e) { run.gradTrace = null; }
    if (advanceIfReady(cur, run.gen, mu)) {
      run.engine.bestMeanUp = -Infinity;
      run.engine.bestEndUp = -Infinity;
      run._lastGate = 0; run._noImp = 0; run._escCount = 0;
      return null;
    }
    // Stuck-escape (basin hopping). Gate improvement resets the counter; a
    // plateau of `escapeAfter` gens reloads the level's BEST weights + noise and
    // clears the Adam moments -- a fresh basin to descend. Escalates the noise
    // each consecutive escape at the same level. The gate metric dips right
    // after (bestMeanUp resets) and re-earns -- visible as a dip in the chart.
    // Improvement must be MEANINGFUL (0.01 on the 0-1 scale): the converged
    // optimizer still creeps ~0.001 every few gens, which must not count
    // (probe: a 1e-4 epsilon let the creep reset the counter forever -> the
    // escape never fired).
    if (mu > run._lastGate + 0.01) { run._lastGate = mu; run._noImp = 0; }
    else if (++run._noImp >= run.escapeAfter) {
      const w = run.engine.bestFlat.slice();
      // Gentle escalation, low cap: probe showed noise >= 0.6 on ~0.3-scale
      // weights just wrecks the policy instead of hopping basins.
      const s = Math.min(0.5, run.escapeScale * Math.pow(1.5, run._escCount));
      for (let i = 0; i < w.length; i++) w[i] += (run.rng() * 2 - 1) * s;
      BF.diffsimTrainer.loadWeights(run.engine, w, true);
      run._escCount++; run._noImp = 0; run._lastGate = 0;
      run.lastEscape = { gen: run.gen, scale: s };
    }
    return null;
  }

  // --- Memetic / gradient-assisted evolution (diffsim-memetic) ---
  // A real POPULATION of exact-gradient policies. Each gen: (1) refine every
  // individual with a few Adam steps (the exact-gradient "meme"); (2) score them
  // at the current curriculum level; (3) GA select + mutate — elites survive,
  // the rest are cloned-with-noise from elites (Lamarckian: the refined weights
  // are inherited). Combines gradient exploitation with population exploration,
  // which is the classic recipe for hard-exploration tasks like swing-up.
  function stepMemetic(run) {
    const cur = run.cur, pop = run.pop;
    let tilt;
    if (cur && cur.enabled) {
      const lv = computeLevel(cur);
      tilt = lv.tilt;
      for (const e of pop) applyLevelToEngine(e, tilt, lv.knobVals);
    } else {
      tilt = run.config.pertDeg || 6;
      for (const e of pop) e.config.trainPerts = [tilt, -tilt, tilt * 0.5, -tilt * 0.5];
    }
    // (1) local refinement + (2) score each individual at this level, on the
    // same end-window metric the curriculum gates on.
    for (const e of pop) {
      const r = BF.diffsimTrainer.trainIters(e, run.localIters);
      e._fit = r.endUp;   // current-level fitness (last iter's end-window uprightness)
    }
    pop.sort((a, b) => b._fit - a._fit);
    const fits = pop.map(e => e._fit);
    const best = fits[0], worst = fits[fits.length - 1];
    const avg = fits.reduce((s, x) => s + x, 0) / fits.length;
    const median = fits[fits.length >> 1];
    // Adaptive exploration: when the population's best plateaus, widen the
    // mutation noise (up to a cap) so clones search FARTHER from the elites;
    // any improvement snaps it back to the base scale. Without this the
    // population converges onto the same local optimum as a single run.
    if (best > (run._lastBest != null ? run._lastBest : -Infinity) + 1e-4) {
      run._lastBest = best; run._noImp = 0; run.mutationScale = run.mutBase;
    } else if (++run._noImp >= 6) {
      run.mutationScale = Math.min(0.6, run.mutationScale * 1.5);
      run._noImp = 0;
    }
    // (3) GA: keep elites, refill the rest from mutated elite clones.
    const nElite = Math.max(1, Math.round(pop.length * run.eliteFrac));
    for (let i = nElite; i < pop.length; i++) {
      const parent = pop[Math.min(nElite - 1, (run.rng() * nElite) | 0)];
      const w = BF.diffsimTrainer.snapshotWeights(parent);
      for (let j = 0; j < w.length; j++) w[j] += (run.rng() * 2 - 1) * run.mutationScale;
      BF.diffsimTrainer.loadWeights(pop[i], w, true);   // reset Adam moments
    }
    const champ = pop[0];
    run.engine = champ;              // downstream reads (grad trace, config) track the champion
    run.lastLoss = champ.lastLoss;
    run.meanUp = Math.max(0, best);
    // Display the CHAMPION'S live policy (useCurrent) at the current tilt.
    const dispPert = (run.gen % 2 ? -1 : 1) * tilt;
    setFrames(run, BF.diffsimTrainer.trajectory(champ, dispPert, champ.config.horizonS, true).frames);
    try { run.gradTrace = BF.diffsimTrainer.gradTrace(champ); } catch (e) { run.gradTrace = null; }
    advanceIfReady(cur, run.gen, run.meanUp);
    return { avg: avg, median: median, worst: worst, species: pop.length };
  }

  // --- Analytic LQR (diffsim-lqr) ---
  // Safe-perturbation guard: the LQR's Q/R gains are tuned around g=700 —
  // there it holds ±6° with |cart| <= 42, but at low gravity (e.g. 150, where
  // the balance-showcase preset leaves the slider) perturbations >= 4° FAIL
  // outright (meanUp 0.05, cart flying ~1900 units off the rail). Halve the
  // perturbation until the trajectory genuinely holds on the rail, so the demo
  // shows the controller at a perturbation it can honestly handle.
  function stepLqr(run) {
    // Start from the UI-requested tilt (capped at 40deg; beyond that is swing-up,
    // which LQR can't do), alternating sign for variety, then halve until it holds
    // ON the rail — so the tiltDeg slider actually drives the LQR start instead of
    // being ignored, while still only showing perturbations it can honestly handle.
    const reqMag = Math.min(Math.abs(run.reqTiltDeg || 6), 40);
    let pert = ((run.gen % 2) ? -1 : 1) * reqMag;
    let tr = null;
    for (let tries = 0; tries < 5; tries++) {
      tr = BF.diffsimLqr.trajectory(run.lqrD, pert, 8);
      let maxCx = 0;
      for (const f of tr.frames) { const a = Math.abs(f.cx); if (a > maxCx) maxCx = a; }
      if (tr.meanUp > 0.9 && maxCx <= 185) break;
      pert *= 0.5;
    }
    run.meanUp = tr.meanUp;
    run.lastLqrPert = pert;
    run.reqTiltCapped = Math.abs(pert) < reqMag - 0.01;
    setFrames(run, tr.frames);
    return null;
  }

  // --- Swing-up trajectory optimization (diffsim-trajopt) ---
  // Each gen: a chunk of Adam iterations on the open-loop control sequence.
  // The chart plots CATCHABILITY in [0,1] (the best exp(-distance-to-LQR-basin)
  // pass in the rollout). The display replays the best sequence; once the LQR
  // watcher catches, the replay continues holding — the user literally watches
  // swing-up attempts improve until one is caught and held.
  function stepTrajopt(run) {
    const r = BF.diffsimTrajopt.iterate(run.to, run.itersPerGen);
    const mu = Math.max(0, Math.min(1, r.best));
    run.meanUp = mu;
    run.lastLoss = r.loss;
    const rep = BF.diffsimTrajopt.replay(run.to, {
      lqr: run.lqrD, holdS: mu > 0.5 ? 5 : 0 });
    setFrames(run, rep.frames);
    run.catchAtS = rep.catchAtS; run.holdMeanUp = rep.holdMeanUp;
    run.gradTrace = BF.diffsimTrajopt.gradTrace(run.to);
    return null;
  }

  // --- Live RIGID LQR stabilizer (rigid-lqr) ---
  // Sampling its current uprightness is not a training generation or a proof of
  // future stability. displayFrame advances the actual model at its native dt.
  function stepRigidLqr(run) {
    const live = run.liveReference;
    run.meanUp = live && live.finite ? run.RD.uprightness(live.state) : 0;
    return null;
  }

  // --- RIGID exact-gradient swing-up + LQR catch (rigid-swingup) ---
  // The full down->up->hold showcase on the correct model. Each gen runs a chunk of
  // Adam iterations on the open-loop control sequence (EXACT gradients through the
  // rigid dynamics), then replays swing-up-from-hang -> LQR catch -> hold. The chart
  // plots CATCHABILITY in [0,1] (the worse link's uprightness at hand-off). The user
  // literally watches swing-up attempts improve until one is caught and held.
  function stepRigidSwingup(run) {
    const r = run.RD.iterateSwingUp(run.su, run.itersPerGen);
    const su = run.su;
    const verified = su.bestVerified;
    // HONEST chart: before a verified catch the proxy plots capped at 0.5 (an
    // "optimizing" band); a VERIFIED catch jumps the line to >=0.9. The old
    // chart plotted the raw proxy, which read 0.87-0.96 on runs whose LQR
    // catch failed forever — "solved-looking" lines over a falling pendulum.
    run.meanUp = verified
      ? Math.max(0.9, verified.holdMeanUp)
      : Math.min(0.5, Math.max(0, su.bestScore));
    run.rigidVerified = !!verified;
    run.rigidRestarts = su.restarts | 0;
    // Replay the VERIFIED sequence once one exists (the thing that actually
    // catches); until then, show the best current attempt honestly failing.
    const accels = verified ? verified.accels : (r.accels || su.bestAccels);
    if (accels) {
      const rep = run.RD.swingUpFrames(accels, run.K, run.g, run.rdOpts,
                                       (verified || su.bestScore > 0.6) ? 5 : 0);
      run.peakUp = rep.peakUp; run.catchAtS = rep.caughtAtS; run.holdMeanUp = rep.holdMeanUp;
      setFrames(run, rep.frames);
    }
    return null;
  }

  // Hand a freshly generated trajectory to the display. NOT immediate by
  // default: the current playback finishes first, then the newest pending
  // trajectory swaps in. Without this, every stepGen restarted the display at
  // frame 0 — generations complete every 4-200ms, so the viewer only ever saw
  // the first ~0.2s (the tilted release) of alternating-perturbation rollouts:
  // LQR "swung like crazy" and neural policies "never held", while the actual
  // trajectories hold fine past the transient the restarts kept replaying.
  function setFrames(run, frames, immediate) {
    if (immediate || !run.frames || run.frames.length === 0) {
      run.frames = frames; run.frameIdx = 0; run.pendingFrames = null;
      run._displayClock = {};
    } else {
      run.pendingFrames = frames;   // only the newest pending is kept
    }
  }

  // Bound on how much of a clip plays before a newer one is allowed to swap in
  // (frames, 60fps). ~4.5s: long enough to show the release→recovery→hold (and
  // the swing-up catch, which lands ~3.3s in), so no strobe; short enough that a
  // fast-training mode (LQR trains ~80 gen/s but its hold clip is 8s) doesn't
  // update the animation only once every 8s — which reads as "training frozen".
  const MAX_VIEW_FRAMES = 270;

  // Next display frame {cx, n1:{x,y}, n2:{x,y}} (world units, +y down). Plays the
  // current trajectory to completion — OR, once a newer trajectory is staged and
  // we've shown at least MAX_VIEW_FRAMES of the current one, swaps early so long
  // (8s) hold clips can't stall the animation while generations fly by.
  function displayFrame(run, options) {
    if (!run) return null;
    if (run.liveReference) {
      const api=run.liveReference.isReference?BF.pendulumReference:BF.rigidReference;
      api.step(run.liveReference, undefined, options && options.integration);
      run.meanUp = run.liveReference.finite ? run.RD.uprightness(run.liveReference.state) : 0;
      return api.frame(run.liveReference);
    }
    if ((!run.frames || run.frames.length === 0) && run.pendingFrames) {
      run.frames = run.pendingFrames; run.pendingFrames = null; run.frameIdx = 0;
    }
    if (!run.frames || run.frames.length === 0) return null;
    // Early swap: enough of this clip shown AND a fresher one is waiting.
    if (run.pendingFrames && run.frameIdx >= MAX_VIEW_FRAMES) {
      run.frames = run.pendingFrames; run.pendingFrames = null; run.frameIdx = 0;
    }
    if (run.frameIdx >= run.frames.length) {
      if (run.pendingFrames) { run.frames = run.pendingFrames; run.pendingFrames = null; }
      run.frameIdx = 0;
    }
    return run.frames[run.frameIdx++];
  }

  BF.diffsimMode = { isActive, create, stepGen, displayFrame, setFrames, levelPertDeg };
})(typeof window !== 'undefined' ? (window.BF = window.BF || {}) : (globalThis.BF = globalThis.BF || {}));
