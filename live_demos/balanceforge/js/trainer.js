// BalanceForge — population, evaluation, selection, evolution.
// Each generation: build a fresh world per agent, run the policy for a fixed time,
// accumulate reward, then select + mutate to form the next generation.

(function (BF) {
  'use strict';
  const N = BF.neat;
  const P = BF.physics;
  const { clamp } = BF.util;

  function makeTrainer(opts) {
    // Resolve the trainer seed. opts.seed=0 is a valid seed (the
    // earlier `|| 42` fallback would have silently replaced it with
    // 42), so we explicitly check `!= null`. The seed is captured on
    // the trainer for queries (e.g. the UI's "share this run" path
    // reads `trainer.seed` to populate the seed input on the next
    // session).
    const seed = (opts && opts.seed != null) ? (opts.seed | 0) : 42;
    const rng = BF.util.makeRng(seed);
    const trainer = {
      rng: rng,
      seed: seed,
      setupId: opts && opts.setupId || 'single',
      population: [],
      generation: 0,
      bestEver: null,
      bestEverFitness: -Infinity,
      currentBest: null,
      currentBestFitness: -Infinity,
      lastStats: null,
      history: [],          // { gen, best, avg, worst, avgNodes, avgConns, species }
      params: {
        populationSize: 120,
        eliteRatio: 0.20,
        tournamentSize: 3,
        evalSeconds: 8,
        physicsDt: 1 / 120,
        useDisturb: false,
        pushStrength: 200,
        gravity: 900,
        damping: 0.005,
        cartAccel: 1600,
        // Cart top-speed cap (px/s). Previously this was hard-coded to
        // 600 at every buildWorld call site, so presets asking for a
        // different value (e.g. the Pendulum-NEAT presets' 800) were
        // silently dropped. Now it's a real param threaded via
        // resolved('cartMaxSpeed') so it's user-settable AND curriculum-
        // able. 600 keeps the historical default for everything that
        // doesn't set it.
        cartMaxSpeed: 600,
        // Linear viscous drag on the cart -- only used by
        // cartControlMode 'force', where terminal velocity =
        // cartAccel / cartDrag emerges instead of a hard speed cap.
        // Ignored by 'accel'/'velocity' so this default is inert for
        // every existing model/preset that doesn't opt into force mode.
        cartDrag: 8,
        // Per-joint hinge friction (double pendulum only). Used by the
        // setup tick; 0 = off so it's inert for every other setup/model.
        jointDamping: 0,
        // When true, the curriculum NEVER force-advances on being stuck
        // (the isStuckLong path is disabled). It then only advances when
        // the sustained-score gate is genuinely met -- like the
        // reference project. Default false = legacy behavior preserved
        // for every other preset.
        curriculumNoForceAdvance: false,
        // Directional-spring "upright assist" (double pendulum only).
        // 0 = off (free double pendulum -- the real task). >0 = each
        // segment is nudged toward vertical-above-its-base every step
        // by this fraction of its angular error. 1 ≈ a rigid vertical
        // stick; small values are a gentle restoring torsion spring.
        // Designed to be curriculum-ramped strong -> 0: start with the
        // chain almost glued upright (trivial), progressively remove the
        // helper until the policy must balance the genuine free chain.
        // A real physical helper, NOT a reward hack. Default 0 so no
        // other setup/preset is affected.
        uprightAssist: 0,
        startAngleRange: 0.1,
        // Central start tilt (deg) -- the deterministic part of the
        // start pose. Trainer samples ±startTiltDeg (sign chosen by
        // tiltDirection), then optionally jitters by startTiltSpreadDeg.
        startTiltDeg: 5.7,
        // Spread (deg) added uniformly around ±startTiltDeg. 0 means
        // every rollout starts at exactly ±startTiltDeg.
        startTiltSpreadDeg: 0,
        rolloutsPerAgent: 1,
        // Active objective and its parameters (e.g. targetAngleDeg for hold_angle).
        objectiveId: 'balance_up',
        objectiveParams: {},
        // Algorithm: 'neat-full' — compatibility speciation + crossover (default;
        //                          canonical NEAT, protects new structures naturally).
        //            'neat'      — mutation-only GA, kept for comparison and likely
        //                          worse on sparse-reward tasks; see ALGO_EXPLAIN.
        //            'cmaes'     — fixed topology, weights from CMA-ES.
        //            'annealing' — fixed topology, parallel SA chains.
        mode: 'neat-full',
        // Full-NEAT reproduction defaults. These mirror the classic NEAT
        // compatibility equation δ = c1E/N + c2D/N + c3W, with conservative
        // crossover inside species. They are intentionally params-only for now
        // so the UI can expose them later without changing trainer internals.
        neatCompatThreshold: 3.0,
        neatCompatC1: 1.0,
        neatCompatC2: 1.0,
        neatCompatC3: 0.4,
        neatTargetSpecies: 8,
        neatCompatAdaptRate: 0.15,
        neatCrossoverRate: 0.75,
        neatInterspeciesMateRate: 0.01,
        neatTopologyPreset: 'minimal',
        // Behavior-space archive resolution (bins per axis). The grid is
        // square; total cells = bins². 16 is a reasonable default that
        // reads visually on the small panel canvas without aliasing the
        // dot scatter on top.
        behaviorArchiveBins: 16,
        // Currently-selected (xKey, yKey) descriptor keys for the archive.
        // null = use the setup's default pair from BF.behaviors.defaultAxes.
        behaviorArchiveX: null,
        behaviorArchiveY: null,
        // MAP-Elites parent selection. When on, a fraction of parents are
        // drawn from the behavior archive (instead of pure tournament), so
        // niches that nobody has visited recently still contribute to the
        // next generation. The fraction trades off quality (low) vs
        // diversity (high); 0.5 is the canonical QD recipe. Off by
        // default — opt in once the archive has populated.
        qdParentEnabled: false,
        qdSampleFraction: 0.5,
        // Quality-diversity escape boost. When the stuck-escape system
        // fires (mutMode goes escape-low / -mid / -high), automatically
        // raise the effective QD parent-sample fraction to qdEscapeBoost
        // for the duration of the escape. The behavior archive is exactly
        // the diversity reservoir a converged population needs, so this
        // couples the two existing mechanisms instead of asking the user
        // to manually flip qdParentEnabled on whenever they see the
        // escape badge. Independent of qdParentEnabled — works even when
        // normal QD parenting is off, since the medicine is most useful
        // precisely when the user hasn't opted into QD.
        qdEscapeBoostEnabled: true,
        qdEscapeBoost:        0.5,
        // Retro-eval: every N gens, re-evaluate the current top-K policies
        // against a randomly-sampled prior curriculum level. Surfaces
        // catastrophic forgetting -- policies that mastered level 3 but
        // can no longer balance from level 0 score poorly on retro and
        // (optionally) get demoted in selection. Off by default because
        // it adds eval cost and changes selection pressure; opt in via
        // the UI checkbox once curriculum + a few levels exist.
        retroEvalEnabled:        false,
        // Cadence: re-eval every N main gens. 5 means ~20% extra cost
        // amortized over training (5 retros × 2 rollouts vs 120 main).
        retroEvalEveryGens:      5,
        // How many top policies to retro-eval. 5 keeps cost bounded; the
        // signal is per-elite so we don't need the whole population.
        retroEvalTopN:           5,
        // Selection blend weight. 0 = display-only (retro shown but not
        // used for selection). 1 = full retro-fitness (selection sorts
        // by retro alone, ignoring current-level performance). 0.3 is a
        // sane mix: most of the signal is current performance, but a
        // policy that forgets old levels takes a noticeable hit.
        retroEvalSelectionWeight: 0.3,
        // Per-level Hall of Fame + boundary transplant. The standard HoF
        // is global ("best ever") -- it discards the fact that the best
        // genome for level 0 (small tilt = wiggle reflex) and the best
        // for level 10 (large tilt = swing-up) are completely different.
        // levelHoFEnabled keeps a small HoF bucket per curriculum level;
        // levelTransplantOn copies that level's top entries into the
        // next-gen population whenever the curriculum advances, so the
        // level-up doesn't erase the lineage that mastered the prior
        // level. Defaults: off (opt-in, requires curriculum + at least
        // a couple level transitions to be useful).
        // Pareto (NSGA-II-style) selection. When on, tournamentSelect
        // replaces fitness-only comparison with non-dominated-sort rank
        // + crowding distance over (fitness, novelty). Novelty is the
        // average distance to k nearest neighbors in the 6-D behavior
        // space (normalized per-dim). Pushes selection sideways into
        // unexplored behavior regions even when fitness alone would
        // converge -- complementary to feature B's escape-mode boost
        // (which only fires when stuck). Pareto is always on; B is
        // reactive.
        paretoSelectionEnabled: false,
        // Novelty k-NN window. 15 is the canonical Lehman & Stanley
        // default; smaller = sharper local novelty (each individual
        // measures against its immediate behavior neighborhood);
        // larger = smoother global novelty.
        paretoNoveltyK:         15,
        // Pareto-aware Hall of Fame: a cumulative reservoir of rank-1
        // individuals across generations, with a behavior-diversity
        // insertion criterion so the HoF doesn't fill up with near-
        // duplicates. Decouples "best ever" from a single scalar
        // fitness -- two genomes with different (fitness, novelty)
        // profiles can both live in the HoF if they cover distinct
        // behavior regions. Requires paretoSelectionEnabled (otherwise
        // rank-1 has no meaning).
        paretoHoFEnabled:        false,
        paretoHoFSize:           8,
        // Minimum L2 distance in normalized behavior space below which
        // an incoming rank-1 entry is considered "too similar" to an
        // existing HoF member. When too similar, the newcomer replaces
        // the existing entry IFF it has higher fitness; otherwise it's
        // dropped. Larger value = more diversity required = fewer but
        // more distinct HoF members. 0.5 is a moderate default given
        // the behavior dims are normalized by population std-dev.
        paretoHoFMinBehaviorDist: 0.5,
        // Third Pareto objective: rollout consistency (negative
        // std-dev of per-rollout fitness). When on, the non-dominated
        // sort + crowding distance both treat (fitness, novelty,
        // consistency) as three maximization axes. A genome with high
        // mean fitness but very noisy per-rollout fitness now sits on
        // a different Pareto front than one with the same mean and
        // tight variance. Useful for the dodge / bullet-hell setups
        // where a "lucky" policy can score well on one angle and tank
        // on another. Requires rollouts >= 2 (otherwise consistency
        // is identically 0 and adding it as an axis is a no-op).
        paretoUseConsistency:    false,
        levelHoFEnabled:      false,
        // How many champions to retain per level. 2 keeps memory + save
        // size bounded; on a 60-level curriculum that's 120 stored
        // genomes vs the population's 120 per-gen.
        levelHoFSize:         2,
        // Whether the transplant queue actually runs at level-up. With
        // levelHoFEnabled on but levelTransplantOn off, the per-level
        // HoF is recorded for inspection / future restore but doesn't
        // drive selection -- useful when the user wants to A/B the
        // transplant pressure separately from the bookkeeping.
        levelTransplantOn:    true,
        // How many of the prior level's HoF entries to inject at each
        // level-up. Bounded by levelHoFSize; the actual count is
        // min(this, fromLevelHoF.length). Default 2 mirrors HoF size
        // so a non-full bucket still transplants everything it has.
        levelTransplantCount: 2,
        // Golf-only knobs.
        // Hole-center jitter: when on, the hole's x is offset by a fresh
        // sample from [-mag, +mag] each rollout. All agents in a gen see
        // the same jitter sequence so selection is still apples-to-
        // apples. Makes the policy position-robust instead of memorizing
        // one shot trajectory.
        holeCenterJitterOn: false,
        holeCenterJitterMag: 50,
        // Number of obstacle balls between cart and hole in the golf
        // setup. Defaults to 2 (existing behavior); 0 disables them
        // entirely. Higher counts force the policy to find a clean lane.
        golfObstacles: 2,
        // Dodge-mode knobs. Pattern is the qualitative knob (rain /
        // sweep / aimed / predict_and_aimed); the rest are the
        // quantitative difficulty levers that curriculum can ramp.
        dodgePattern:        'mixed',
        dodgePredictOrder:   'linear',
        dodgeSpawnRate:      1.5,
        dodgeBulletSpeed:    220,
        dodgeBulletRadius:   6,
        dodgeLeadTime:       0.6,
        dodgeBulletsPerWave: 8,
        // Observation encoding (experimental). 'topk' uses the cheap
        // 20-input top-4-nearest-bullets vector. 'grid' uses a 16x16
        // agent-centered danger grid + agent state (260 inputs).
        // Grid handles huge-bullet-count scenes where top-K starts
        // missing important clusters; NEAT-full can consume the flat
        // grid directly, CNN-policy variant is queued for follow-up.
        dodgeObservationMode: 'topk',
        // No-die mode: when on, collisions register a per-hit penalty
        // and brief invulnerability but the rollout continues. The
        // reward function reads dodgeNoDiePenalty for the per-hit cost.
        // Default true: bullets cluster at the emitter at spawn time
        // and need to fan out, so early-rollout deaths are noise
        // rather than signal.
        dodgeNoDie: true,
        dodgeNoDiePenalty: 3,
        dodgeInvulnSeconds: 0.6,
        // Lifespan-focused reward: when on, dodge_survive reshapes
        // rewards to make aliveTime the dominant signal (+1.0/s alive,
        // tiny shaping bonuses). Default off: the mixed reward (safety
        // + streak + near-miss + alive) gives the optimizer more
        // gradient hints. Toggle on when you want clean survival
        // selection that can't be gamed by sitting in an empty corner.
        dodgeLifespanMode: false,
        // No-reset mode: when on, the display rollout never auto-rebuilds
        // and the policy is hot-swapped in place at gen end. Lets the
        // user watch a continuous stream of evolution.
        dodgeNoReset: false,
        // NEAT initial hidden nodes. Default 0 = canonical NEAT behavior
        // (start linear, complexify on demand). For sparse-reward /
        // deceptive landscapes (golf, ball-strike) where the linear
        // policy is at a fitness plateau and any single add-node
        // mutation looks worse than the linear elite, seeding the pop
        // with a fully-connected hidden layer gives the GA architectural
        // breathing room. Each genome gets `numInputs × N` extra weights
        // to tune from gen 0 — sometimes one of those random
        // initializations is closer to a useful nonlinear policy than
        // anything mutation could discover within the elitism+selection
        // pressure of a pure-linear-locked population.
        neatInitialHidden: 0,
        cmaesHiddenSize: 6,
        // Number of hidden layers for fixed-topology algos (CMA-ES,
        // sep-CMA-ES, CEM, SA, PT, DE, PSO, FDGD, SPSA, Adam, L-BFGS,
        // NES/xNES, random-search, swarm metaheuristics). 1 = legacy
        // single hidden layer. >1 = stack `cmaesHiddenSize` units per
        // layer. Useful for tasks where a single hidden layer's
        // policy class is plateauing (e.g. single-pendulum swing-up
        // with CMA-ES underperforming the same task in NEAT).
        cmaesHiddenLayers: 1,
        cmaesSigma: 0.5,
        annealingT0: 1.0,
        annealingCooling: 0.97,
        ptTmin: 0.05,
        ptTmax: 2.0,
        ptProposalSigma: 0.2,
        ptSwapInterval: 4,
        deF: 0.5,
        deCR: 0.9,
        psoInertia: 0.7,
        psoCognitive: 1.5,
        psoSocial: 1.5,
        randomSigma: 0.5,
        cemSigma: 0.5,
        cemEliteFrac: 0.20,
        // Gradient-descent family (FD-GD, SPSA): finite-difference epsilon
        // and the initial line-search step size. Both are auto-adapted as
        // the run progresses — these are just starting points.
        gdEpsilon: 0.05,
        gdAlphaInit: 0.05,
        // NES (vanilla / OpenAI-ES): isotropic σ for the search distribution
        // and the learning rate on μ.
        nesSigma: 0.3,
        nesLR: 0.1,
        // Swarm-family algorithm parameters. Most have sensible defaults
        // straight from each algorithm's original paper. Each mode reads
        // only the keys it cares about.
        cuckooStep: 0.05, cuckooPa: 0.25,
        whaleSpiral: 1.0,
        fishVisual: 0.5, fishStep: 0.15, fishCrowd: 0.5,
        acoArchive: 16, acoQ: 0.1, acoXi: 0.85,
        fireflyBeta: 1.0, fireflyGamma: 1.0, fireflyNoise: 0.2,
        batLoudness: 1.0, batPulse: 0.5,
        // Setup-specific knobs that the trainer needs to expose so the
        // generalized curriculum can override them per-rollout. null
        // means "use the setup\'s own default" — instantiateSetup only
        // forwards non-null values to buildWorld.
        holeCenter: null,
        holeWidth: null,
        // Recipe-clean demo difficulty knobs (null = use the setup's own
        // default = shipped difficulty). Ramped easy→default by curriculum specs.
        railCatchAmpl: null,
        catchDropSpread: null,
        pickSideSep: null,
        fleeHomeSpeed: null,
        cruiseVAmpl: null,
        chirpRate: null,
        safeZoneHalf: null,
        midpointScale: null,
        tagSpread: null,
        prioritizeAmpl: null,
        armReachEase: null,
        armTrackAmpl: null,
        armObstacleR: null,
        slotGap: null,
        plateStiff: null,
        golfObstacleR: null,   // null = setup default (14px); rampable to a huge sphere
        golfLumps: null,       // null = flat fairway; ramp for bumpy ground
        golfLumpR: null,
        // Generalized curriculum: optional list of additional ramps
        // applied alongside the legacy gravity ramp. Each spec describes
        // a parameter that ramps from `from` to `to` as the curriculum
        // levels up; `mode` is 'multiplicative' or 'additive'.
        //   { paramKey: 'holeWidth', from: 120, to: 50, mode: 'additive' }
        // Empty by default — old behavior (gravity-only ramp) is fully
        // preserved. Specs are evaluated against trainer.curriculum.level
        // (0..maxLevel), so existing legacy controls (start frac, ramp
        // factor) drive the cadence; specs just track that cadence for
        // additional knobs. Total levels-to-target is bounded by
        // curriculumMaxLevel for spec-only ramps.
        curriculumSpecs: [],
        curriculumMaxLevel: 10,
        // Stuck-advance fallback: if the curriculum stays at the same
        // level for this many gens without best-fitness clearing the
        // threshold, force-advance anyway. Sparse-reward tasks
        // (golf, hit-ball-back, etc.) can plateau in a "competent
        // but never optimal" regime that never quite reaches the
        // gate's required fraction; force-advancing exposes them to
        // harder scenarios that may give them more reward signal to
        // climb on (or at the very least makes the "stuck" state
        // visible to the user via the level number changing). 0
        // disables the fallback entirely.
        curriculumStuckMaxGens: 200,
        // Adversarial environment co-evolution. When on, the trainer
        // maintains a small population of envs (gravity / damping / cart-
        // accel / start-angle / push-strength multipliers) and overlays a
        // randomly-sampled one onto each rollout. Envs that defeat
        // controllers more get higher env-fitness; the env pop evolves
        // alongside the controller pop. Result: controllers learn to be
        // robust across an evolving difficulty distribution.
        adversarialOn: false,
        adversarialEnvPopSize: 8,
        adversarialMutationSigma: 0.10,
        // Stability / regression-recovery options. Defaults preserve the
        // current behavior (HoF size 1, no auto-rollback, no annealing) so
        // existing runs are unaffected unless the user opts in.
        //
        // hallOfFameSize: how many top-K best-ever genomes to keep + re-eval
        //   + inject as unmutated rescue clones each gen. K=1 = the original
        //   single-best-ever rescue. K>1 = robust against fluky champions
        //   (one good gen on lucky angles can't dominate). Costs K extra
        //   evaluations per generation.
        hallOfFameSize: 1,
        // Auto-rollback: silent autoCheckpoint on best-ever improvement,
        // automatic restore if best-of-gen drops below threshold·best-ever
        // for autoRollbackGens consecutive generations. NEAT's late-game
        // regression failure mode (topology bloat + constant mutation σ
        // wrecking convergent genomes) is what this guards against.
        autoRollbackOn: false,
        autoRollbackThreshold: 0.5,   // best-of-gen < 50% of best-ever → "regressed"
        autoRollbackGens: 15,          // for this many consecutive gens
        // Anneal mutation rates as fitness plateaus. After N stale gens
        // (no best-ever improvement), scale the search-radius knobs by F.
        // Resets on the next improvement. Late-game refinement aid.
        // NOTE: This makes the GA mutate LESS when stuck — useful only if
        // you're confident the population has converged on a real
        // optimum and just needs to settle. If you might be stuck in a
        // local optimum, you want the OPPOSITE (stuckEscape, below).
        annealMutationOn: false,
        annealAfterGens: 30,
        annealFactor: 0.5,
        // Stuck-state escape: when the population stagnates (no
        // best-ever improvement for N gens), AUTOMATICALLY heat up
        // mutation rates so the GA explores harder. This is the
        // "if nothing works, mutate harder" reflex — the GA should
        // own its own escape from local optima.
        // Escalates with prolonged stagnation:
        //   - >= stuckEscapeAfterGens stale → ×stuckEscapeFactor
        //   - >= 2× threshold              → ×(factor × 1.5)
        //   - >= 4× threshold              → ×(factor × 2.0) + diversity inject
        // Disabled automatically when annealMutationOn is on (the two
        // are antithetical; user explicitly asked for cooling). Default
        // OFF: useful for experiments, but too blunt for many sparse-reward
        // golf runs where "no improvement for a while" is normal.
        stuckEscapeOn: false,
        stuckEscapeAfterGens: 25,
        stuckEscapeFactor: 2.0,
        // Diversity injection: at deep stagnation, replace the bottom
        // fraction of the population with random new genomes (preserves
        // the elite portion, breaks the rest out of converged weight
        // space). Triggers at >= 4× stuckEscapeAfterGens stale gens.
        stuckInjectFraction: 0.30,
        // CNN policy mode (concept showcase): when 'cnn', fixed-topology
        // algorithms (CMA-ES, DE) optimize the parameters of a tiny CNN that
        // reads a phase-space rendering of recent state history.
        policyType: 'mlp',
        cnnConfig: null, // populated from BF.cnn.defaultConfig() on init
      },
      mutationParams: N.defaultMutationParams(),
    };
    Object.assign(trainer.params, opts && opts.params || {});
    Object.assign(trainer.mutationParams, opts && opts.mutationParams || {});
    trainer.neatCompatThresholdCurrent = trainer.params.neatCompatThreshold;
    // History of best-ever updates so we can render a trajectory through the
    // genome-space PCA plot — each entry is when the run found something new.
    trainer.bestEverHistory = [];
    trainer.gensSinceImprovement = 0;
    trainer.gensConverged = 0;
    trainer.bestFitnessWindow = [];
    // Hall of Fame: top-K best-ever genomes (sorted desc by registered
    // fitness). hallOfFame[0] is always synced to trainer.bestEver. With
    // hallOfFameSize=1 this is just one entry — same as the legacy
    // single-best-ever rescue. With K>1, additional runner-up champions
    // are kept and rescued each gen.
    trainer.hallOfFame = [];
    // Pareto-aware HoF. Cumulative reservoir of rank-1 individuals
    // across gens; populated by maybeUpdateParetoHoF when both Pareto
    // selection and paretoHoFEnabled are on. Entries: { genome, params,
    // fitness, behavior (Float64Array clone), gen }.
    trainer.paretoHoF = [];
    // Silent checkpoint taken whenever best-ever meaningfully improves.
    // Auto-rollback restores from this slot when the current population
    // regresses below the configured threshold for the configured window.
    trainer.autoCheckpoint = null;
    // Window of "current-gen-best as fraction of best-ever" — used as the
    // regression detector. When this stays below autoRollbackThreshold for
    // autoRollbackGens consecutive entries, auto-rollback fires.
    trainer.regressionRunLen = 0;
    // Coarse-grained "what is the trainer doing right now" string surfaced to
    // the UI so the user can tell whether a long pause is the eval loop, the
    // CMA-ES eigendecomposition, or genuine idle.
    trainer.currentStage = 'idle';
    trainer.evalProgress = 0; // [0, 1] within current evaluation pass
    // Mode-agnostic event log: significant happenings (best-ever updates,
    // curriculum level-ups, topology changes, σ contractions...). Each event:
    //   { gen, kind: 'best'|'topo'|'curriculum'|... , text }
    trainer.eventLog = [];
    // Curriculum-learning state: the GA trains on an "easy" version of the
    // problem first (low gravity, high damping). When best fitness exceeds a
    // threshold for a few consecutive generations, difficulty ramps toward
    // the user-set targets. Inspired by Pendulum-NEAT's increaseDifficulty().
    trainer.curriculum = {
      currentGravity: 0, currentDamping: 0, consecHits: 0, level: 0,
      // Per-level fitness rollup, used by the curriculum HUD mini-chart so the
      // user can see "what happened at each level" -- specifically whether a
      // fitness drop was a single bad gen vs. the whole level being a slog.
      // perLevelStats[i] = { level, startGen, endGen|null, maxBest, maxMedian,
      //   minBest, minMedian, gens: [{gen, best, avg, median, worst}, ...] }
      // The `gens` array is capped per-level (250 entries) so we don't bloat
      // memory on runs that sit at one level for thousands of gens.
      perLevelStats: [],
      // Generations where the curriculum advanced. Plotted as vertical
      // marker lines on the main fitness chart so per-level deltas in
      // best/median/worst are visually obvious.
      levelUpGens:   [],
      // Per-level Hall of Fame: { [level]: [{ genome, params, fitness,
      // gen }, ...] }, sorted by fitness desc, capped at levelHoFSize.
      // Updated each gen by maybeRecordLevelHoF; drained on level-up
      // into _transplantQueue when levelTransplantOn is true.
      perLevelHoF:     {},
      _transplantQueue: [],
    };
    // Behavior-space archive — built lazily so descriptors registered after
    // makeTrainer (e.g. by a setup-id-specific BF.behaviors.register call
    // that hasn't happened yet) are still picked up. configureBehaviorArchive
    // is idempotent and safe to call again from app.js once the user picks
    // axes / changes resolution.
    trainer.behaviorArchive = null;
    trainer.lastSetupBehaviors = null;
    configureBehaviorArchive(trainer, { bins: trainer.params.behaviorArchiveBins });
    curriculumReset(trainer);
    // Eval-worker trainers pass opts.skipPopulation: they only ever
    // call evaluatePolicy on genomes shipped per-task and never run
    // step()/select()/mutate(), so the gen-0 population is dead weight.
    // For pop=500 presets that's 500 genome constructions per worker
    // per pool spawn (× ~31 workers), a multi-hundred-ms hiccup on
    // every Train click for zero benefit. Skip it in that context.
    if (!(opts && opts.skipPopulation)) {
      initPopulation(trainer);
    } else {
      // ...but the population initialisers are ALSO where trainer.cnn*Config
      // gets resolved from params.cnn*Config, and makePolicy silently falls
      // back to the module DEFAULT architecture when that field is null. So a
      // worker skipping init rebuilt every CNN policy against the wrong shape
      // — terrain-run-cnn's 2x8x12x2ch patch read as the square 16x16x1 dodge
      // grid — producing fitness that disagreed with the serial path with no
      // error anywhere. Resolve the configs on their own here; this is cheap
      // (no genome construction) and leaves exactly the state a full init
      // would have left for the CNN policy types.
      const su = BF.setups.getSetup(trainer.setupId);
      if (su) {
        resolveCnnConfigs(trainer, su.observationCount,
          Math.max(1, su.actionCount | 0) || 1);
        // Same reason, for the hybrid front-end: without this a worker
        // evaluates every genome to an identical constant (see
        // resolveHybridCnn) and parallel training silently stops evolving.
        resolveHybridCnn(trainer, Math.max(1, su.actionCount | 0) || 1);
      }
    }
    return trainer;
  }

  // Registry of parameters that the generalized curriculum can ramp.
  // Each entry: { key, label, min, max, type } — type is informational,
  // for grouping in the UI. The data model is opaque to the trainer
  // beyond reading the named field off trainer.params. Setup-specific
  // knobs (holeWidth, holeCenter) are listed here too because the
  // trainer.params surface is what curriculum specs key on; the
  // setup's buildWorld picks them up via opts.
  const CURRICULUM_KNOBS = [
    // Physics / world
    { key: 'gravity',         label: 'Gravity',          min: 0,    max: 2000, def: 900,   type: 'physics' },
    { key: 'damping',         label: 'Damping',          min: 0,    max: 0.1,  def: 0.005, type: 'physics' },
    // Cart accel max raised 8000 -> 200000. The old 8000 cap silently
    // clamped the swing-up presets' requested 10000 and blocked the
    // user's "give max force even greater range" experiment entirely.
    // A huge accel lets the cart reverse near-instantly (fast-twitch)
    // while staying bounded/physical -- the honest analogue of velocity
    // control the user asked to try.
    { key: 'cartAccel',       label: 'Cart accel',       min: 200,  max: 200000, def: 1600, type: 'physics' },
    // Cart top-speed cap. Curriculum-able like the rest. Now actually
    // threaded (was hard-coded to 600). In velocity mode this is the
    // command-to-velocity scale; in accel mode it bounds top speed.
    { key: 'cartMaxSpeed',    label: 'Cart max speed',   min: 100,  max: 4000, def: 600,   type: 'physics' },
    // Cart linear drag (FORCE mode only). Terminal velocity =
    // cartAccel / cartDrag. Curriculum-able like every other knob:
    // e.g. ramp it high -> low to start the cart sluggish (easy) and
    // free it up over training. Inert in accel/velocity modes.
    { key: 'cartDrag',        label: 'Cart drag',        min: 0,    max: 100,  def: 8,     type: 'physics' },
    // Per-joint hinge friction (double pendulum). Curriculum ramps it
    // strong -> 0 (hard presets) or strong -> small floor (assisted).
    { key: 'jointDamping',    label: 'Joint friction',   min: 0,    max: 30,   def: 0,     type: 'physics' },
    // Directional-spring upright assist (double pendulum). Curriculum
    // ramps it strong -> 0: chain starts ~rigid-vertical (trivial), the
    // helper is progressively removed until the policy balances the
    // genuine free chain. 0 = off everywhere else.
    { key: 'uprightAssist',   label: 'Upright assist',   min: 0,    max: 1,    def: 0,     type: 'physics' },
    // Initial tilt magnitude in degrees -- the slider in the UI is the
    // source of truth. The trainer also keeps `startAngleRange` (radians)
    // in trainer.params for legacy reads (adversarial.js, smoke-test.js,
    // older saved models). When a curriculum spec ramps `startTiltDeg`,
    // instantiateSetup converts the overlay value back to radians so the
    // physics path doesn't need to know about the new key. Range 0..180
    // covers everything from "always upright" to "full swing-up start".
    // The reverse-curriculum trick: ramp 5 -> 180 so early gens learn
    // simple balance, late gens learn full swing-up, instead of trying
    // (and failing) to swing up from 180 deg on gen 0.
    { key: 'startTiltDeg',    label: 'Initial tilt (°)', min: 0,    max: 180,     def: 20,   type: 'physics' },
    // Spread (jitter) around the central start angle. 0 = deterministic
    // (every rollout starts at exactly ±startTiltDeg). >0 = uniform fan
    // of width 2*spread around the central angle, useful for forcing
    // the policy to handle a small range rather than a single fixed
    // pose. The curriculum can ramp spread 0 -> N so early training is
    // a single starting pose (much easier to learn) and later gens
    // generalize across a fan.
    { key: 'startTiltSpreadDeg', label: 'Tilt spread (°)', min: 0,  max: 90,      def: 0,    type: 'physics' },
    { key: 'pushStrength',    label: 'Push strength',    min: 0,    max: 800,  def: 200,   type: 'physics' },
    // Ball-aware setups
    { key: 'ballSpawnX',      label: 'Ball spawn x',     min: -450, max: 450,  def: 220,   type: 'ball' },
    { key: 'ballSpawnY',      label: 'Ball spawn y',     min: -350, max: 350,  def: 40,    type: 'ball' },
    { key: 'ballSpawnDelay',  label: 'Ball spawn delay', min: 0,    max: 6,    def: 1,     type: 'ball' },
    { key: 'ballDriftSpeed',  label: 'Ball drift/pitch', min: 20,   max: 800,  def: 60,    type: 'ball' },
    { key: 'ballMass',        label: 'Ball mass',        min: 0.1,  max: 2,    def: 0.4,   type: 'ball' },
    { key: 'ballRadius',      label: 'Ball radius',      min: 6,    max: 24,   def: 14,    type: 'ball' },
    { key: 'ballRestitution', label: 'Ball restitution', min: 0,    max: 1,    def: 0.7,   type: 'ball' },
    // Golf / putt
    { key: 'holeWidth',       label: 'Hole width',       min: 20,   max: 500,  def: 80,    type: 'golf' },
    { key: 'holeCenter',      label: 'Hole center x',    min: -300, max: 350,  def: 305,   type: 'golf' },
    { key: 'holeCenterJitterMag', label: 'Hole jitter (px)', min: 0, max: 300, def: 50,   type: 'golf' },
    { key: 'golfObstacles',   label: 'Obstacle count',   min: 0,    max: 6,    def: 2,     type: 'golf' },
    { key: 'golfObstacleR',   label: 'Obstacle radius',  min: 6,    max: 160,  def: 14,    type: 'golf' },
    { key: 'golfLumps',       label: 'Ground lumps',     min: 0,    max: 6,    def: 0,     type: 'golf' },
    { key: 'golfLumpR',       label: 'Lump radius',      min: 10,   max: 80,   def: 25,    type: 'golf' },
    // Objective-shaping weights (ball_in_hole). These live in
    // trainer.params.objectiveParams.*; the curriculum overlay merges
    // them into the effective objectiveParams at eval time.
    { key: 'centerBonusWeight',    label: 'Center bonus weight',    min: 0, max: 20, def: 8, type: 'reward' },
    { key: 'bouncePenaltyWeight',  label: 'Bounce penalty weight',  min: 0, max: 5,  def: 1, type: 'reward' },
    { key: 'strikeDirectionWeight',label: 'Strike-direction weight',min: 0, max: 20, def: 8, type: 'reward' },
    { key: 'ballSpeedBonus',       label: 'Ball-speed bonus',       min: 0, max: 10, def: 0, type: 'reward' },
    // Dodge-mode difficulty knobs. dodgePattern (qualitative) is NOT
    // listed -- curriculum specs only ramp numeric values.
    { key: 'dodgeSpawnRate',      label: 'Bullet spawn rate',  min: 0.1, max: 10,  def: 1.5, type: 'dodge' },
    { key: 'dodgeBulletSpeed',    label: 'Bullet speed',       min: 50,  max: 600, def: 220, type: 'dodge' },
    { key: 'dodgeBulletRadius',   label: 'Bullet radius',      min: 2,   max: 14,  def: 6,   type: 'dodge' },
    { key: 'dodgeLeadTime',       label: 'Predict lead time',  min: 0,   max: 2,   def: 0.6, type: 'dodge' },
    { key: 'dodgeBulletsPerWave', label: 'Bullets per wave',   min: 3,   max: 20,  def: 8,   type: 'dodge' },
    // Demo-task difficulty knobs (cart + arm). Listed so their curriculum chips
    // show a friendly LABEL + tracked value instead of the raw paramKey (the same
    // fix as reachRadius). These are per-rollout resolved via resolved() and
    // ramped by the demo -curriculum presets; they have no dedicated slider, so
    // they show as labelled chips but aren't "+"-addable.
    { key: 'armReachEase',   label: 'Arm reach ease',      min: 0,   max: 1,    def: 1,   type: 'demo' },
    { key: 'reachRadius',    label: 'Accepting radius (px)', min: 30, max: 260,  def: 160, type: 'demo' },
    { key: 'traceRadius',    label: 'Trace radius (px)',   min: 20,  max: 200,  def: 60,  type: 'demo' },
    { key: 'traceAcceptRadius', label: 'Trace accepting radius (px)', min: 15, max: 260, def: 160, type: 'demo' },
    // WHERE the curve sits, in world y. Default 0 = "auto", i.e. defer to the
    // chain-trace setup's own placement (framing height clamped into the
    // MEASURED reach band — see setups.js). Anything above 0 is a manual
    // override and the setup uses it verbatim, reach be damned; that is the
    // point, it is the knob that makes the placement inspectable and A/B-able
    // from the UI instead of only from a headless probe. 0 is the sentinel
    // rather than a real height because y=0 is the rail, where no chain-trace
    // curve belongs.
    //
    // RANGE, AND WHAT IT DOES NOT COVER — measured, because the first version
    // of this note asserted the opposite. 900 is NOT "past the settled reach of
    // an 8-segment chain": settling the real chain puts the telescope-out end
    // of the band at y 916 (n=7), 1049 (n=8) and 1323 (n=10) on `rigid`, and
    // 2123 at n=10 on `elastic`. So the slider addresses the WHOLE band only up
    // to 6 segments. What it does cover is every placement the AUTO rule can
    // actually produce on a rigid chain (deepest 710, at n=10 with a full-height
    // curve at r200) — the framing height L − 0.45r is itself capped at 791, and
    // the clamp only ever pushes it toward tipYMin. The one gap is a big SOFT
    // chain with the telescope off, where the auto centre IS the passive hang:
    // 1568 for `elastic` at n=10. There the slider cannot express the setup's
    // own default, and the only way back to it is the 0 sentinel. Raise the max
    // if that corner ever matters; do not re-assert that 900 covers everything.
    //
    // foldAtDefault: THE DEFAULT IS ITSELF A VALUE, so readParams must fold it
    // even when the slider has not been moved. The generated-knob fold in
    // app.js normally skips a slider sitting on its default, so that a knob
    // nobody touched defers to the setup's own (often smarter, derived)
    // default — traceAcceptRadius's default means "use max(traceRadius, 30)",
    // and folding the raw slider number would override every scene's closeness
    // scale. traceCenterY is the opposite case: 0 is not "unset", it is the
    // AUTO SENTINEL that the setup already interprets. Without this flag,
    // dragging the slider back to 0 dropped the key from readParams and
    // Object.assign left the PREVIOUS value on trainer.params — so a preset
    // pinned at 257, or a manual 340, could never be returned to auto from the
    // UI, while the label and three preset descriptions all tell the user to
    // "set the slider to 0" to get the auto-placement. Measured live before
    // the fix: pin 257 → drag to 0 → the curve stayed at 257.
    { key: 'traceCenterY',  label: 'Trace centre y (0 = auto)', min: 0, max: 900, def: 0, type: 'demo',
      foldAtDefault: true },
    // chain_trace_ordered's difficulty axis: what fraction of the curve one
    // unbroken in-order run must cover to earn the full budget. Ramp it
    // 0.3 -> 1.0. Do NOT ramp traceAcceptRadius for the ordered objective —
    // a wide band makes a sweep outscore a trace (measured), so a band ramp
    // trains the wrong behavior at its easy levels.
    { key: 'orderedRequiredFrac', label: 'Ordered: required arc (frac)', min: 0.1, max: 1, def: 1, type: 'demo' },
    { key: 'railCatchAmpl',  label: 'Rail-catch amplitude', min: 0,  max: 200,  def: 90,  type: 'demo' },
    { key: 'catchDropSpread',label: 'Catch-drop spread',   min: 0,   max: 250,  def: 100, type: 'demo' },
    { key: 'pickSideSep',    label: 'Pick-side separation', min: 0,  max: 180,  def: 70,  type: 'demo' },
    { key: 'fleeHomeSpeed',  label: 'Flee home speed',     min: 0,   max: 120,  def: 40,  type: 'demo' },
    { key: 'cruiseVAmpl',    label: 'Cruise vel. amplitude', min: 0, max: 300,  def: 120, type: 'demo' },
    { key: 'chirpRate',      label: 'Chirp rate',          min: 0,   max: 1,    def: 0.25,type: 'demo' },
    { key: 'safeZoneHalf',   label: 'Safe-zone half-width', min: 20, max: 200,  def: 90,  type: 'demo' },
    { key: 'midpointScale',  label: 'Midpoint scale',      min: 0,   max: 1.5,  def: 0.6, type: 'demo' },
    { key: 'tagSpread',      label: 'Tag spread',          min: 0,   max: 1.5,  def: 0.7, type: 'demo' },
    { key: 'prioritizeAmpl', label: 'Prioritize amplitude', min: 0,  max: 1.5,  def: 0.6, type: 'demo' },
    { key: 'armTrackAmpl',   label: 'Arm-track amplitude', min: 0,   max: 150,  def: 50,  type: 'demo' },
    { key: 'armObstacleR',   label: 'Obstacle radius',     min: 0,   max: 60,   def: 20,  type: 'demo' },
    { key: 'slotGap',        label: 'Slot gap (px)',       min: 30,  max: 150,  def: 80,  type: 'demo' },
    { key: 'plateStiff',     label: 'Tray stiffness',      min: 3,   max: 30,   def: 12,  type: 'demo' },
  ];
  function curriculumKnobByKey(key) {
    for (const k of CURRICULUM_KNOBS) if (k.key === key) return k;
    return null;
  }

  // Compute the applied value for a single curriculum spec at the given
  // level fraction (0..1). 0 means start-of-ramp (`from`); 1 means
  // end-of-ramp (`to`). Multiplicative interpolation is used when both
  // endpoints are positive (gravity-style geometric ramp); otherwise we
  // fall back to additive linear.
  function curriculumApply(spec, levelFrac) {
    const f = Math.max(0, Math.min(1, levelFrac));
    if (spec.mode === 'multiplicative' && spec.from > 0 && spec.to > 0) {
      return spec.from * Math.pow(spec.to / spec.from, f);
    }
    return spec.from + (spec.to - spec.from) * f;
  }

  // Curriculum: starting easy values and per-level scaling factors. These were
  // picked to mirror Pendulum-NEAT's pacing — gravity multiplies by ~1.05 each
  // step, damping decays by ~0.93. Threshold = 70% of theoretical max reward.
  const CURRICULUM = {
    startGravityFraction: 0.18,    // start at 18% of target gravity
    startDampingFactor: 8,         // start at 8x target damping
    gravityRampFactor: 1.05,
    dampingRampFactor: 0.93,
    levelUpThresholdFrac: 0.70,    // best > 0.70 × theoretical max → progress
    consecRequired: 2,             // need 2 gens in a row above threshold
  };

  // Append a chronicled event to the trainer's event log. Capped at 60
  // entries so the panel doesn't grow unboundedly. Latest event is at the
  // end; UI typically renders newest-first.
  function emitEvent(trainer, kind, text) {
    if (!trainer.eventLog) trainer.eventLog = [];
    trainer.eventLog.push({ gen: trainer.generation, kind: kind, text: text });
    while (trainer.eventLog.length > 60) trainer.eventLog.shift();
  }

  function curriculumReset(trainer) {
    if (!trainer.curriculum) return;
    if (trainer.params.curriculumEnabled) {
      const startFrac = trainer.params.curriculumStartFrac != null
        ? trainer.params.curriculumStartFrac
        : CURRICULUM.startGravityFraction;
      trainer.curriculum.currentGravity = trainer.params.gravity * startFrac;
      trainer.curriculum.currentDamping = Math.min(0.1, trainer.params.damping * CURRICULUM.startDampingFactor);
    } else {
      trainer.curriculum.currentGravity = trainer.params.gravity;
      trainer.curriculum.currentDamping = trainer.params.damping;
    }
    trainer.curriculum.consecHits = 0;
    trainer.curriculum.level = 0;
    trainer.curriculum.lastLevelChangeGen = trainer.generation || 0;
    // Reset the per-level bookkeeping too — otherwise a "new run" on the
    // same trainer would render an old-run's level history under the new
    // run's gen counter, which is confusing.
    trainer.curriculum.perLevelStats = [];
    trainer.curriculum.levelUpGens = [];
    trainer.curriculum.perLevelHoF = {};
    trainer.curriculum._transplantQueue = [];
    resetCurriculumPhaseBest(trainer);
  }

  function resetCurriculumPhaseBest(trainer) {
    if (!trainer.curriculum) return;
    trainer.curriculum.phaseBestFitness = -Infinity;
    trainer.curriculum.phaseBestGen = null;
    trainer.curriculum.phaseBestSource = null;
    trainer.curriculum.phaseStartGen = trainer.generation || 0;
  }

  function registerCurriculumPhaseBest(trainer, fitness, source) {
    if (!trainer.curriculum || !isFinite(fitness)) return;
    if (!isFinite(trainer.curriculum.phaseBestFitness)
        || fitness > trainer.curriculum.phaseBestFitness) {
      trainer.curriculum.phaseBestFitness = fitness;
      trainer.curriculum.phaseBestGen = trainer.generation;
      trainer.curriculum.phaseBestSource = source || 'population';
    }
  }

  function isNeatMode(mode) {
    return mode === 'neat' || mode === 'neat-full';
  }

  // ---------- Behavior-space archive ----------
  // 2D grid binned on a user-picked (xKey, yKey) descriptor pair.
  // Each cell records the best fitness seen in that bin and how many
  // times the bin was visited. The heatmap renders best-fitness as
  // color; visit count + lastSeen drive opacity / freshness cues.
  // Archive lives on trainer.behaviorArchive — reset on setup change /
  // axis change / resolution change. Cells use a packed integer key
  // (xb * bins + yb) so iteration is dense.
  function makeBehaviorArchive(setupId, xKey, yKey, bins) {
    return {
      setupId: setupId,
      xKey: xKey,
      yKey: yKey,
      bins: Math.max(2, Math.min(64, bins | 0)),
      cells: new Map(),
      bestEverFitness: -Infinity,
      bestEverBin: -1,
      genUpdated: 0,
    };
  }
  function updateBehaviorArchive(archive, xv, yv, fitness, gen, individual) {
    if (!archive || !archive.xKey || !archive.yKey) return;
    if (!BF.behaviors) return;
    const xn = BF.behaviors.normalize(archive.setupId, archive.xKey, xv);
    const yn = BF.behaviors.normalize(archive.setupId, archive.yKey, yv);
    if (!isFinite(xn) || !isFinite(yn)) return;
    const xb = Math.min(archive.bins - 1, Math.max(0, Math.floor(xn * archive.bins)));
    const yb = Math.min(archive.bins - 1, Math.max(0, Math.floor(yn * archive.bins)));
    const key = xb * archive.bins + yb;
    let cell = archive.cells.get(key);
    if (!cell) {
      cell = { xb, yb, count: 0, bestFitness: -Infinity, lastSeen: gen, genome: null };
      archive.cells.set(key, cell);
    }
    cell.count += 1;
    cell.lastSeen = gen;
    if (fitness > cell.bestFitness) {
      cell.bestFitness = fitness;
      // Stash a clone of the cell's champion genome so MAP-Elites parent
      // selection can mutate from it without affecting the live population
      // entry. CMA-ES / DE / PSO modes use placeholder genomes so this is
      // a no-op for them; tournament selection in those modes still
      // works against the real population.
      if (individual && individual.genome) {
        cell.genome = N.cloneGenome(individual.genome);
      }
    }
    if (fitness > archive.bestEverFitness) {
      archive.bestEverFitness = fitness;
      archive.bestEverBin = key;
    }
    archive.genUpdated = gen;
  }

  // MAP-Elites parent selection. Returns a parent {genome, fitness} drawn
  // from the behavior archive, or null when the archive is empty / QD is
  // disabled / the random toss falls into the fallback path. Mixes two
  // sampling modes:
  //   - exploit (70%): rank-based pick from the top half of cells by best
  //     fitness. Keeps the search anchored on quality.
  //   - explore (30%): pick from cells with low visit count. Pushes the
  //     search into under-sampled behavior regions.
  // The 70/30 split is the canonical QD recipe -- see Mouret & Clune 2015.
  // The actual gate "should we use QD at all this draw?" is controlled by
  // qdSampleFraction; this function only fires when caller decides to use
  // it. Returning null means "fall back to normal tournament".
  function mapElitesSelect(trainer) {
    const arch = trainer.behaviorArchive;
    if (!arch || arch.cells.size === 0) return null;
    const cells = Array.from(arch.cells.values()).filter(c => c.genome);
    if (cells.length === 0) return null;
    const exploit = trainer.rng.proba(0.7);
    let cell = null;
    if (exploit) {
      // Sort by bestFitness desc, then pick uniformly from the top half.
      // Top-half rank-weighting avoids needing positive fitnesses (which
      // we don't have on golf early-gen) while still preferring quality.
      const sorted = cells.slice().sort((a, b) => b.bestFitness - a.bestFitness);
      const cap = Math.max(1, Math.floor(sorted.length / 2));
      cell = sorted[trainer.rng.int(cap)];
    } else {
      // Inverse-count: weight cell w_i = 1 / (1 + count_i). Cells with
      // count 1 get weight 0.5, count 9 gets weight 0.1, count 99 gets
      // weight 0.01. Concentrates on under-sampled cells without ever
      // giving a heavily-visited cell zero probability.
      let total = 0;
      const weights = cells.map(c => 1 / (1 + (c.count || 0)));
      for (const w of weights) total += w;
      let r = trainer.rng.next() * total;
      for (let i = 0; i < cells.length; i++) {
        r -= weights[i];
        if (r <= 0) { cell = cells[i]; break; }
      }
      if (!cell) cell = cells[cells.length - 1];
    }
    if (!cell || !cell.genome) return null;
    return { genome: cell.genome, fitness: cell.bestFitness };
  }
  // Caller-side helper: with the effective QD sample fraction return a
  // MAP-Elites parent, otherwise return null and let the caller fall
  // back to its normal tournament path.
  //
  // The effective fraction is the max of:
  //   - qdSampleFraction (when qdParentEnabled is on; the normal mode)
  //   - qdEscapeBoost   (when qdEscapeBoostEnabled is on AND the
  //                      stuck-escape system is currently firing)
  // This lets the escape-boost work even when the user hasn't opted
  // into normal MAP-Elites parenting -- escape mode signals that the
  // population is converged on a strategy that can't be reached by
  // small mutations, which is exactly when archive diversity helps.
  function maybeQdParent(trainer) {
    let frac = 0;
    if (trainer.params.qdParentEnabled) {
      const f = trainer.params.qdSampleFraction;
      if (f > 0) frac = f;
    }
    // Boost during escape mode. trainer._mutMode is set by the
    // selectAndMutate stuck-escape code path; values are 'escape-low',
    // 'escape-mid', 'escape-high' while the reheat is active.
    if (trainer.params.qdEscapeBoostEnabled
        && trainer._mutMode
        && trainer._mutMode.indexOf('escape-') === 0) {
      const boost = trainer.params.qdEscapeBoost != null
        ? trainer.params.qdEscapeBoost : 0.5;
      if (boost > frac) frac = boost;
    }
    if (!(frac > 0)) return null;
    if (!trainer.rng.proba(frac)) return null;
    return mapElitesSelect(trainer);
  }
  function resetBehaviorArchive(trainer) {
    if (!trainer.behaviorArchive) return;
    trainer.behaviorArchive.cells.clear();
    trainer.behaviorArchive.bestEverFitness = -Infinity;
    trainer.behaviorArchive.bestEverBin = -1;
    trainer.behaviorArchive.genUpdated = 0;
  }
  // Configure (or reconfigure) the archive. Safe to call before init —
  // initPopulation also calls this with the setup default axes.
  function configureBehaviorArchive(trainer, opts) {
    opts = opts || {};
    const setupId = trainer.setupId;
    let xKey = opts.xKey;
    let yKey = opts.yKey;
    if (!xKey || !yKey) {
      const def = (BF.behaviors && BF.behaviors.defaultAxes && BF.behaviors.defaultAxes(setupId)) || null;
      if (def) { xKey = xKey || def[0]; yKey = yKey || def[1]; }
    }
    const bins = Math.max(2, Math.min(64, (opts.bins != null ? opts.bins : 16) | 0));
    if (!trainer.behaviorArchive
        || trainer.behaviorArchive.setupId !== setupId
        || trainer.behaviorArchive.xKey !== xKey
        || trainer.behaviorArchive.yKey !== yKey
        || trainer.behaviorArchive.bins !== bins) {
      trainer.behaviorArchive = makeBehaviorArchive(setupId, xKey, yKey, bins);
    }
  }

  const TOPOLOGY_PRESETS = {
    minimal: {
      label: 'Minimal / custom 1-layer',
      hidden: null,
    },
    'wide-4': {
      label: 'Wide x4 (1 layer)',
      hidden: [4],
    },
    'wide-8': {
      label: 'Wide x8 (1 layer)',
      hidden: [8],
    },
    'wide-16': {
      label: 'Wide x16 (1 layer, golf-friendly)',
      hidden: [16],
    },
    'deep-8-4': {
      label: 'Deep 8 -> 4 (2 layers)',
      hidden: [8, 4],
    },
    'deep-12-6': {
      label: 'Deep 12 -> 6 (2 layers, golf-friendly)',
      hidden: [12, 6],
    },
  };

  function initPopulation(trainer) {
    trainer.population.length = 0;
    const setup = BF.setups.getSetup(trainer.setupId);
    const numInputs = setup.observationCount;
    // Setups can declare more than one action by setting actionCount.
    // Defaults to 1 (cart-rail-only setups). Dodge uses 2 (x + y motion).
    // Non-NEAT modes assume 1 today; the trainer falls back so 2D-action
    // setups + non-NEAT pairings still construct without crashing, even
    // if the resulting policy is degenerate.
    const numOutputs = Math.max(1, setup.actionCount | 0) || 1;
    if (trainer.params.mode === 'cmaes') {
      initCMAESPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'annealing') {
      initAnnealingPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'pt') {
      initPTPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'de') {
      initDEPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'pso') {
      initPSOPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'random') {
      initRandomPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'cem') {
      initCEMPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'fdgd') {
      initFDGDPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'spsa') {
      initSPSAPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'nes') {
      initNESPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'adam') {
      initAdamPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'lbfgs') {
      initLbfgsPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'xnes') {
      initXnesPopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (trainer.params.mode === 'sep-cmaes') {
      initSepCmaesPopulation(trainer, numInputs, numOutputs);
      return;
    }
    // Hand-coded baselines (mode='fixed'): no parameters to optimize.
    // Population is a single placeholder genome -- makePolicy short-
    // circuits to BF.baselinePolicy.policy(baselineKind) regardless of
    // the genome. Step is a no-op (see step() below). Lets baselines
    // flow through the harness uniformly without special-casing.
    if (trainer.params.mode === 'fixed') {
      initFixedBaselinePopulation(trainer, numInputs, numOutputs);
      return;
    }
    if (SWARM_MODES[trainer.params.mode]) {
      initSwarmPopulation(trainer, numInputs, numOutputs, trainer.params.mode);
      return;
    }
    // NEAT-CNN hybrid: NEAT genomes are built with a SMALLER input
    // count (post-CNN feature space) than the setup reports. The CNN
    // front-end has random frozen weights stored on the trainer; each
    // policy adapter wraps the genome to do CNN-forward-then-NEAT-
    // forward at command-time. Same NEAT mutation / selection / Phase B
    // path otherwise -- it really is NEAT, just operating on a richer
    // input projection.
    if (isNeatMode(trainer.params.mode) && trainer.params.useHybridCnn) {
      initNeatCnnHybridPopulation(trainer, numInputs, numOutputs);
      return;
    }
    const preset = TOPOLOGY_PRESETS[trainer.params.neatTopologyPreset || 'minimal']
      || TOPOLOGY_PRESETS.minimal;
    const hiddenLayers = (preset.hidden && preset.hidden.length > 0)
      ? preset.hidden
      : null;
    const initHidden = hiddenLayers ? 0 : Math.max(0, trainer.params.neatInitialHidden | 0);
    for (let i = 0; i < trainer.params.populationSize; i++) {
      const g = hiddenLayers
        ? N.makeSeededGenome(numInputs, numOutputs, hiddenLayers, trainer.rng, null /* actKind: keep TANH default */, trainer.mutationParams)
        : N.makeGenome(numInputs, numOutputs);
      if (!hiddenLayers) {
        // Standard NEAT initialization: connect every input to every output with
        // small random weights. Topology can still grow via add-node mutations.
        for (let from = 0; from < numInputs; from++) {
          for (let out = 0; out < numOutputs; out++) {
            const toId = numInputs + out;
            g.conns.push({
              innov: N.innovationForConnection(from, toId),
              from: from,
              to: toId,
              weight: trainer.rng.gauss(0, 0.6),
              enabled: true,
            });
          }
        }
      }
      // Optional: seed with an initial hidden layer for tasks where the
      // pure-linear policy class is insufficient. See the param comment
      // in default params for the theoretical motivation.
      if (initHidden > 0) {
        N.addHiddenLayer(g, initHidden, trainer.rng, null, (trainer.mutationParams && trainer.mutationParams.hiddenAct) || null, trainer.mutationParams);
      }
      trainer.population.push({ genome: g, fitness: 0 });
    }
  }

  // Build the hidden-layer shape for fixed-topology algorithms from
  // trainer.params. Returns an array of layer widths (empty = linear,
  // length 1 = single hidden layer for legacy compat, length N>1 =
  // multi-layer MLP). All fixed-topology call sites below use this so
  // the topology stays in sync regardless of which algorithm the user
  // picks. paramCount + genomeFromParams in cmaes.js accept either an
  // int or this array.
  //
  // Two sources, in priority order. The cmaesHidden/cmaesLayers SLIDERS can
  // only describe a UNIFORM stack ("L layers of width N"), which cannot express
  // a measured shape whose layers differ — 198->1->50->2, 242->2->140->2.
  // params.cmaesHiddenSizes is the explicit escape hatch: an array of per-layer
  // widths (preset-supplied; no DOM control) that WINS over the sliders. An
  // EMPTY array is meaningful and is honoured — it asks for a genuinely linear
  // policy, which is not the same request as "use the sliders".
  function fixedHiddenSizes(trainer) {
    const explicit = trainer.params.cmaesHiddenSizes;
    if (Array.isArray(explicit)) {
      const out = [];
      for (const h of explicit) {
        const n = h | 0;
        if (n > 0) out.push(n);
      }
      return out;
    }
    const size   = Math.max(0, trainer.params.cmaesHiddenSize | 0);
    const layers = Math.max(1, trainer.params.cmaesHiddenLayers | 0 || 1);
    if (size === 0) return [];
    if (layers === 1) return size;  // keep legacy int form for back-compat
    return Array(layers).fill(size);
  }

  // Grid-CNN shape check. The CONFIG decides how many observation floats the
  // conv stack consumes (agentStateSize + channels*gridW*gridH); the SETUP
  // decides how many it emits. A mismatch is silent — trailing floats are
  // simply never read, missing ones read as 0 — and yields a policy that
  // trains perfectly happily on the wrong slice of the world. Warn rather than
  // throw: the run is still runnable, it just isn't the arm anyone claimed.
  function checkCnnGridInputs(trainer, cfg, numInputs) {
    if (!BF.cnnGrid || !BF.cnnGrid.inputCount) return;
    const want = BF.cnnGrid.inputCount(cfg);
    if (want !== numInputs && typeof console !== 'undefined' && console.warn) {
      console.warn('[BF.trainer] cnn-grid config reads ' + want + ' observation floats but setup "'
        + trainer.setupId + '" emits ' + numInputs
        + ' — check cnnGridConfig gridW/gridH/channels/agentStateSize');
    }
  }

  // Random Search: each generation samples a fresh population from N(0, σ²I)
  // — no memory, no learning. Educational baseline.
  function initRandomPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.randomSearch = BF.randomSearch.create(numInputs, numOutputs, hidden, {
      sigma: trainer.params.randomSigma,
    });
    BF.randomSearch.reset(trainer.randomSearch);
    const builder = (p) => BF.randomSearch.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.randomSearch.sample(
      trainer.randomSearch, trainer.params.populationSize, trainer.rng, builder);
  }

  // CEM: like CMA-ES with isotropic σ — sample N(μ, σ²I), refit μ and σ to
  // the top-fraction elite each generation.
  function initCEMPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.cem = BF.cem.create(numInputs, numOutputs, hidden, {
      sigma: trainer.params.cemSigma,
      eliteFrac: trainer.params.cemEliteFrac,
    });
    BF.cem.reset(trainer.cem);
    const builder = (p) => BF.cem.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.cem.sample(
      trainer.cem, trainer.params.populationSize, trainer.rng, builder);
  }

  // FD-GD: forward-difference gradient descent with parallel backtracking.
  // Honest baseline — for an N-param net, takes N+1 evals per gradient step.
  // Slow on big nets but conceptually clean.
  function initFDGDPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.fdgd = BF.fdgd.create(numInputs, numOutputs, hidden, {
      epsilon:   trainer.params.gdEpsilon,
      alphaInit: trainer.params.gdAlphaInit,
    });
    BF.fdgd.reset(trainer.fdgd);
    // Tiny non-zero μ so probes see distinguishable fitness from gen 1.
    for (let j = 0; j < trainer.fdgd.n; j++) {
      trainer.fdgd.mean[j] = trainer.rng.gauss(0, 0.1);
    }
    const builder = (p) => BF.fdgd.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.fdgd.sample(
      trainer.fdgd, trainer.params.populationSize, trainer.rng, builder);
  }

  // SPSA: Simultaneous Perturbation Stochastic Approximation. Estimates the
  // full N-dim gradient with just 2 evals per pair (use multiple pairs to cut
  // variance). Same line-search machinery as FD-GD.
  function initSPSAPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.spsa = BF.spsa.create(numInputs, numOutputs, hidden, {
      epsilon:   trainer.params.gdEpsilon,
      alphaInit: trainer.params.gdAlphaInit,
    });
    BF.spsa.reset(trainer.spsa);
    for (let j = 0; j < trainer.spsa.n; j++) {
      trainer.spsa.mean[j] = trainer.rng.gauss(0, 0.1);
    }
    const builder = (p) => BF.spsa.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.spsa.sample(
      trainer.spsa, trainer.params.populationSize, trainer.rng, builder);
  }

  // NES (vanilla / OpenAI-ES): population-based gradient estimator using the
  // REINFORCE trick. μ moves along standardized-fitness × perturbation.
  function initNESPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.nes = BF.nes.create(numInputs, numOutputs, hidden, {
      sigma:        trainer.params.nesSigma,
      learningRate: trainer.params.nesLR,
    });
    BF.nes.reset(trainer.nes);
    for (let j = 0; j < trainer.nes.n; j++) {
      trainer.nes.mean[j] = trainer.rng.gauss(0, 0.1);
    }
    const builder = (p) => BF.nes.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.nes.sample(
      trainer.nes, trainer.params.populationSize, trainer.rng, builder);
  }

  // Adam: SPSA-style gradient estimate + Adam's per-dim adaptive update.
  // Bridges the FD-GD/SPSA family (gradient-based with shared probe budget)
  // with the modern ML training norm (Adam is the most-cited optimizer in
  // deep learning). Each parameter dimension gets its own first- and
  // second-moment accumulators (m, v); steps scale inversely with the
  // running squared gradient, so noisy dimensions get smaller updates.
  function initAdamPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    // Adam re-uses the same gd-family hyperparameter sliders as FD-GD /
    // SPSA: gdEpsilon is the SPSA probe size, gdAlphaInit is the
    // learning rate (Adam doesn't have a separate concept of "initial
    // alpha" because there's no line search -- the moments handle
    // adaptation per dim).
    trainer.adam = BF.adam.create(numInputs, numOutputs, hidden, {
      epsilon:      trainer.params.gdEpsilon,
      learningRate: trainer.params.adamLR != null
        ? trainer.params.adamLR
        : trainer.params.gdAlphaInit,
      beta1:        trainer.params.adamBeta1,
      beta2:        trainer.params.adamBeta2,
    });
    BF.adam.reset(trainer.adam);
    for (let j = 0; j < trainer.adam.n; j++) {
      trainer.adam.mean[j] = trainer.rng.gauss(0, 0.1);
    }
    const builder = (p) => BF.adam.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.adam.sample(
      trainer.adam, trainer.params.populationSize, trainer.rng, builder);
  }

  // NEAT-CNN hybrid: NEAT topology evolves OVER the pooled-feature output
  // of a frozen, random-initialized cnn-multiscale front-end. The setup's
  // observationCount (multi-scale grid + topK tail) stays as-is so the
  // hybrid policy can read the grids directly; NEAT genomes are sized to
  // the post-CNN projected input (agent + pooled features + optional
  // topK = ~20-36 floats vs raw 4 + 256 + 256 + 32 = 548 floats).
  //
  // The CNN params are generated ONCE at trainer init and never updated.
  // Each individual's policy adapter (built by makePolicy) references
  // the same trainer.frozenHybridCnnParams via closure -- no per-eval
  // copy, no per-eval re-init.
  // The hybrid front-end (frozen CNN featurizer + the projected NEAT input
  // count) used to be resolved ONLY inside the population initialiser. Eval
  // workers build with skipPopulation: true, so they never ran it —
  // trainer.frozenHybridCnnParams / hybridCnnConfig stayed null and
  // makePolicy fell through to plain NEAT. That is worse than it sounds: the
  // genome is sized to the PROJECTED input count (~20-36 floats), so feeding
  // it the raw 548-float multiscale observation made every genome score the
  // SAME constant (measured: 2.5 for all of them, against 0.60/0.78/0.83/0.95
  // on the serial path). Fitness carried no signal at all, so under parallel
  // eval a hybrid run could not evolve — silently, with no error anywhere.
  // Same silent-divergence class as the cnn*Config bug fixed alongside it.
  //
  // Resolving it on its own lets BOTH paths reach the same state. The frozen
  // params are the FIRST consumer of trainer.rng, so a worker re-mints them
  // bit-identically from its own fresh trainer with no payload to ship
  // (verified: identical to the main thread's 226 floats). Call order inside
  // the initialiser is unchanged, so full-init runs keep their exact RNG
  // stream and existing seeded results do not move.
  function resolveHybridCnn(trainer, numOutputs) {
    if (!(trainer.params.useHybridCnn && BF.cnnNeatHybrid && BF.cnnMultiscale)) {
      trainer.hybridCnnConfig = null;
      trainer.frozenHybridCnnParams = null;
      return null;
    }
    const cnnConfig = Object.assign(BF.cnnMultiscale.defaultConfig(),
      { numOutputs: numOutputs },
      trainer.params.cnnMultiscaleConfig || {});
    trainer.hybridCnnConfig = cnnConfig;
    trainer.frozenHybridCnnParams = BF.cnnNeatHybrid.makeFrozenParams(cnnConfig, trainer.rng);
    const topKSlots = trainer.params.hybridTopKSlots != null
      ? (trainer.params.hybridTopKSlots | 0)
      : 8;   // matches setups.js TOPK_K default
    trainer.hybridTopKSlots = topKSlots;
    trainer.hybridIncludeTopK = !!trainer.params.hybridIncludeTopK;
    trainer.hybridNeatInputCount = BF.cnnNeatHybrid.projectedInputCountWithTopK(
      cnnConfig,
      trainer.hybridIncludeTopK ? topKSlots * 4 : 0
    );
    return cnnConfig;
  }

  function initNeatCnnHybridPopulation(trainer, setupNumInputs, numOutputs) {
    const cnnConfig = resolveHybridCnn(trainer, numOutputs);
    const neatNumInputs = trainer.hybridNeatInputCount;
    // Build the NEAT population at the projected input count. Same
    // initial-topology rules as vanilla NEAT (presets, initialHidden).
    const preset = TOPOLOGY_PRESETS[trainer.params.neatTopologyPreset || 'minimal']
      || TOPOLOGY_PRESETS.minimal;
    const hiddenLayers = (preset.hidden && preset.hidden.length > 0) ? preset.hidden : null;
    const initHidden = hiddenLayers ? 0 : Math.max(0, trainer.params.neatInitialHidden | 0);
    for (let i = 0; i < trainer.params.populationSize; i++) {
      const g = hiddenLayers
        ? N.makeSeededGenome(neatNumInputs, numOutputs, hiddenLayers, trainer.rng, null /* actKind: keep TANH default */, trainer.mutationParams)
        : N.makeGenome(neatNumInputs, numOutputs);
      if (!hiddenLayers) {
        for (let from = 0; from < neatNumInputs; from++) {
          for (let out = 0; out < numOutputs; out++) {
            const toId = neatNumInputs + out;
            g.conns.push({
              innov: N.innovationForConnection(from, toId),
              from: from, to: toId,
              weight: trainer.rng.gauss(0, 0.6),
              enabled: true,
            });
          }
        }
      }
      if (initHidden > 0) N.addHiddenLayer(g, initHidden, trainer.rng, null, (trainer.mutationParams && trainer.mutationParams.hiddenAct) || null, trainer.mutationParams);
      trainer.population.push({ genome: g, fitness: 0 });
    }
  }

  // L-BFGS: limited-memory quasi-Newton with SPSA-style gradient probes.
  // Same probe budget + line-search layout as FD-GD / SPSA, but the
  // direction is +H^(-1) g (gradient ascent, two-loop recursion over the
  // history of (s, y) pairs) instead of just +g. Strong baseline for
  // smooth objectives; the classical competitor to CMA-ES.
  function initLbfgsPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.lbfgs = BF.lbfgs.create(numInputs, numOutputs, hidden, {
      epsilon:   trainer.params.gdEpsilon,
      alphaInit: trainer.params.gdAlphaInit,
      m:         trainer.params.lbfgsMemory,
    });
    BF.lbfgs.reset(trainer.lbfgs);
    for (let j = 0; j < trainer.lbfgs.n; j++) {
      trainer.lbfgs.mean[j] = trainer.rng.gauss(0, 0.1);
    }
    const builder = (p) => BF.lbfgs.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.lbfgs.sample(
      trainer.lbfgs, trainer.params.populationSize, trainer.rng, builder);
  }

  // xNES: exponential NES with DIAGONAL scale. Multiplicative exp()
  // update on σ keeps it positive by construction; per-dim variance
  // adapts the way CMA-ES does but via REINFORCE-style gradient on
  // utility-weighted samples (no eigendecomp, O(λn) per gen). Sister
  // algorithm to NES with the per-dim scaling that NES lacks.
  function initXnesPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.xnes = BF.xnes.create(numInputs, numOutputs, hidden, {
      sigma:    trainer.params.xnesSigma != null ? trainer.params.xnesSigma : trainer.params.nesSigma,
      etaMu:    trainer.params.xnesEtaMu,
      etaSigma: trainer.params.xnesEtaSigma,
    });
    BF.xnes.reset(trainer.xnes);
    for (let j = 0; j < trainer.xnes.n; j++) {
      trainer.xnes.mean[j] = trainer.rng.gauss(0, 0.1);
    }
    const builder = (p) => BF.xnes.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.xnes.sample(
      trainer.xnes, trainer.params.populationSize, trainer.rng, builder);
  }

  // sep-CMA-ES: diagonal-covariance CMA-ES (Ros & Hansen 2008). Same
  // algorithm family as full CMA-ES but tracks only per-dim variances
  // instead of the full n*n covariance matrix. No Jacobi eigendecomp
  // -- per-gen cost drops from O(n^3) to O(n), unlocking much larger
  // policy configs (the freeze at n=550 we hit with full CMA-ES is
  // a non-issue here). Slightly slower convergence on problems with
  // strongly-correlated dimensions; equivalent or better on NN-shaped
  // parameter spaces where cross-weight correlation is weak.
  // Auto-scale the phase-space CNN's yRange (dθ/dt axis) to the tilt
  // magnitude. The renderer DROPS points outside yRange (it doesn't
  // saturate them), so a too-narrow yRange means high-velocity states
  // simply disappear from the rendered image -- the policy then has
  // no velocity information to recover from. At tilt θ the natural
  // recovery speed is ~sqrt(2g(1-cos θ)/L); we set yRange ~2× that
  // for headroom. Only applied when the caller hasn't pinned yRange
  // explicitly via params.cnnConfig.yRange.
  function autoScaleCnnYRange(trainer) {
    const tiltDeg = trainer.params.startTiltDeg
      || (trainer.params.startAngleRange ? trainer.params.startAngleRange * 180 / Math.PI : 20);
    const tiltRad = Math.max(0, Math.min(Math.PI, tiltDeg * Math.PI / 180));
    const g = trainer.params.gravity || 900;
    const L = 80;  // BalanceForge's default bobLen (see setups.js).
    const naturalDth = Math.sqrt(2 * g * (1 - Math.cos(tiltRad)) / L);
    const yMax = Math.max(5, Math.ceil(2 * naturalDth));
    if (!(trainer.params.cnnConfig && trainer.params.cnnConfig.yRange)) {
      trainer.cnnConfig.yRange = [-yMax, yMax];
    }
  }

  // Resolve trainer.cnn*Config from params.cnn*Config for whichever CNN policy
  // type is selected; every other *Config is nulled so "which config to read"
  // has one unambiguous answer.
  //
  // This is factored out of the two population initialisers because makePolicy
  // falls back to the MODULE DEFAULT when trainer.cnn*Config is null, and the
  // eval workers build their trainer with skipPopulation — so they never ran an
  // initialiser and every CNN policy was silently rebuilt against the default
  // architecture. For terrain-run-cnn that meant the worker read the 198-float
  // patch as the square 16x16x1 dodge grid: no throw, just a different policy
  // and a fitness that disagreed with the serial path. Same silent-divergence
  // class as the dodge_patterns / observation-mode notes in eval_worker.js.
  // makeTrainer calls this on the skipPopulation path so workers match.
  //
  // Each branch also guards on its module being present: callers reach this
  // through whatever policyType a preset chose, but the harnesses load
  // different module subsets. Leaving the *Config null there is exactly the
  // pre-existing behaviour for an absent policy module — better than throwing
  // out of makeTrainer. Mirrors checkCnnGridInputs's guard.
  function resolveCnnConfigs(trainer, numInputs, numOutputs) {
    const policyType = trainer.params.policyType || 'mlp';
    trainer.cnnConfig = null;
    trainer.cnn3dConfig = null;
    trainer.cnnGridConfig = null;
    trainer.cnnMultiscaleConfig = null;
    trainer.recurrentConfig = null;
    if (policyType === 'recurrent' && BF.recurrent) {
      // Recurrent (leaky-integrator) policy. obsCount / numOutputs are FORCED
      // from the setup -- a preset may tune memSize / hidden / leak but must
      // never be able to make the genome read a different width than the world
      // emits. sever is the ablation switch (the severed-memory foil preset).
      trainer.recurrentConfig = BF.recurrent.resolveConfig(Object.assign(
        BF.recurrent.defaultConfig(),
        trainer.params.recurrentConfig || {},
        { obsCount: numInputs, numOutputs: numOutputs,
          sever: !!trainer.params.recurrentSever }));
      return trainer;
    }
    if (policyType === 'cnn' && BF.cnn) {
      trainer.cnnConfig = Object.assign(BF.cnn.defaultConfig(),
        trainer.params.cnnConfig || {});
      autoScaleCnnYRange(trainer);
    } else if (policyType === 'cnn3d' && BF.cnn3d) {
      trainer.cnn3dConfig = Object.assign(BF.cnn3d.defaultConfig(),
        trainer.params.cnn3dConfig || {});
    } else if (policyType === 'cnn-grid' && BF.cnnGrid) {
      // Grid CNN. numOutputs comes from the setup's actionCount, so the CNN's
      // dense2 layer sizes itself to match. The module's square 16x16
      // single-channel defaults ARE the dodge grid; a setup with another grid
      // shape (terrain-run's 2x8x12 'patch') supplies gridW/gridH/channels via
      // params.cnnGridConfig.
      trainer.cnnGridConfig = Object.assign(BF.cnnGrid.defaultConfig(),
        { numOutputs: numOutputs },
        trainer.params.cnnGridConfig || {});
      checkCnnGridInputs(trainer, trainer.cnnGridConfig, numInputs);
    } else if (policyType === 'cnn-multiscale' && BF.cnnMultiscale) {
      // Multi-scale CNN — two conv branches over the dodge setup's local +
      // global grids. Grid sizes are fixed at 8x8 each in the setup.
      trainer.cnnMultiscaleConfig = Object.assign(BF.cnnMultiscale.defaultConfig(),
        { numOutputs: numOutputs },
        trainer.params.cnnMultiscaleConfig || {});
    }
    return trainer;
  }

  // Re-resolve every policy config from trainer.params using the LIVE setup's
  // shape. Exported so the UI can flip a policy-config flag that does NOT
  // change the parameter-vector dimension (the recurrent sever ablation) and
  // have the running trainer + display pick it up without rebuilding the
  // population — rebuilding would throw away the trained champion the ablation
  // is supposed to be demonstrated on.
  function resolveConfigsFromParams(trainer) {
    const su = BF.setups.getSetup(trainer.setupId);
    if (!su) return trainer;
    return resolveCnnConfigs(trainer, su.observationCount,
      Math.max(1, su.actionCount | 0) || 1);
  }

  // Policy types whose genome is a PLACEHOLDER: the runnable policy is built
  // from the flat parameter vector (+ the trainer's resolved config), not from
  // the NEAT genome. Every one of these needs (a) dimOverride so the optimiser
  // searches the right dimension, (b) a placeholder genome so the snapshot /
  // network panel still have .nodes/.conns, and (c) params carried alongside
  // the genome everywhere a target is rebuilt. Kept as ONE derived predicate
  // so adding a policy type cannot half-register: the old code repeated the
  // list in five places and a new type silently fell through to plain NEAT in
  // whichever one you forgot.
  const FLAT_PARAM_POLICIES = ['cnn', 'cnn3d', 'cnn-grid', 'cnn-multiscale', 'recurrent'];
  function usesFlatParamPolicy(policyType) {
    return FLAT_PARAM_POLICIES.indexOf(policyType || 'mlp') !== -1;
  }

  // Parameter-vector dimension implied by the resolved policy config, or null
  // for a plain MLP (which sizes itself from numInputs/hidden/numOutputs
  // instead). Keyed off the RESOLVED config rather than the policy type, so a
  // policy type whose module is absent (config left null above) falls back to
  // the MLP dimension instead of throwing.
  function cnnDimOverride(trainer) {
    if (trainer.recurrentConfig)     return BF.recurrent.paramCount(trainer.recurrentConfig);
    if (trainer.cnnConfig)           return BF.cnn.paramCount(trainer.cnnConfig);
    if (trainer.cnn3dConfig)         return BF.cnn3d.paramCount(trainer.cnn3dConfig);
    if (trainer.cnnGridConfig)       return BF.cnnGrid.paramCount(trainer.cnnGridConfig);
    if (trainer.cnnMultiscaleConfig) return BF.cnnMultiscale.paramCount(trainer.cnnMultiscaleConfig);
    return null;
  }

  // The RESOLVED architecture config makePolicy would read for this trainer's
  // policy type, or null for a plain MLP / NEAT genome. Same keying as
  // cnnDimOverride (off the resolved config, not the policy-type string) so a
  // policy type whose module is absent falls through instead of throwing.
  //
  // WHY THIS EXISTS — a measured worker-parity divergence. The parallel path
  // used to send `config: ind.config || null`, and no population initialiser
  // ever puts a config on an individual, so every task went out with config
  // null and each WORKER fell back to the config IT resolved from the params
  // it was inited with. That is only right while the main thread's config
  // cannot change without a pool re-init — and the recurrent policy has a seam
  // that does exactly that: the "Cut memory" checkbox calls syncTrainerParams +
  // resolveConfigsFromParams deliberately WITHOUT rebuilding the trainer (the
  // whole exhibit is that the SAME trained weights collapse), and nothing
  // re-inits the pool, which is keyed on a signature only recomputed on the
  // Train click. Measured live, 12 real workers, 32 tasks: after ticking the
  // box mid-run every task disagreed with the main thread, max |diff| 3.267 —
  // the trainer, the display and the HUD all said MEMORY CUT while the workers
  // kept training the un-severed policy. Carrying the main thread's resolved
  // config ON THE TASK makes it structural instead of dependent on pool
  // lifetime; with it the same 32 tasks are bit-identical. The object is
  // shared by reference across the whole task list, so structured clone
  // serialises it once per postMessage rather than once per task.
  function resolvedPolicyConfig(trainer) {
    return trainer.recurrentConfig
        || trainer.cnnConfig
        || trainer.cnn3dConfig
        || trainer.cnnGridConfig
        || trainer.cnnMultiscaleConfig
        || null;
  }

  function initSepCmaesPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    const isPlaceholder = usesFlatParamPolicy(trainer.params.policyType);
    resolveCnnConfigs(trainer, numInputs, numOutputs);
    const dimOverride = cnnDimOverride(trainer);
    trainer.sepCmaes = BF.sepCmaes.create(numInputs, numOutputs, hidden, {
      sigma: trainer.params.cmaesSigma || 0.5,
      dimOverride: dimOverride,
      lambda: trainer.params.populationSize,
    });
    const lambda = trainer.params.populationSize;
    for (let i = 0; i < lambda; i++) {
      const params = BF.sepCmaes.sampleParams(trainer.sepCmaes, trainer.rng);
      const genome = isPlaceholder
        ? N.makeGenome(numInputs, numOutputs)
        : BF.sepCmaes.genomeFromParams(params, numInputs, numOutputs, hidden);
      trainer.population.push({ genome: genome, params: params, fitness: 0 });
    }
  }

  // Swarm-family algorithms share an init/Phase A/Phase B shape: each lives
  // under BF[modeName] with create / reset / initialPopulation / stepSwarm.
  // SWARM_MODES maps mode-string → BF module + per-mode option extractor.
  const SWARM_MODES = {
    cuckoo:   { lib: () => BF.cuckoo,   slotKey: 'cuckoo',
                opts: (p) => ({ stepScale: p.cuckooStep, pa: p.cuckooPa }) },
    whale:    { lib: () => BF.whale,    slotKey: 'whale',
                opts: (p) => ({ bSpiral: p.whaleSpiral }) },
    fish:     { lib: () => BF.fish,     slotKey: 'fish',
                opts: (p) => ({ visual: p.fishVisual, step: p.fishStep, crowding: p.fishCrowd }) },
    greywolf: { lib: () => BF.greywolf, slotKey: 'greywolf',
                opts: (p) => ({}) },
    aco:      { lib: () => BF.aco,      slotKey: 'aco',
                opts: (p) => ({ archiveSize: p.acoArchive, q: p.acoQ, xi: p.acoXi }) },
    firefly:  { lib: () => BF.firefly,  slotKey: 'firefly',
                opts: (p) => ({ beta0: p.fireflyBeta, gamma: p.fireflyGamma, alphaNoise: p.fireflyNoise }) },
    bat:      { lib: () => BF.bat,      slotKey: 'bat',
                opts: (p) => ({ A0: p.batLoudness, r0: p.batPulse }) },
  };
  function initSwarmPopulation(trainer, numInputs, numOutputs, mode) {
    const m = SWARM_MODES[mode];
    const lib = m.lib();
    const hidden = fixedHiddenSizes(trainer);
    const opts = Object.assign({ sigma: 0.3 }, m.opts(trainer.params));
    const state = lib.create(numInputs, numOutputs, hidden, opts);
    lib.reset(state);
    trainer[m.slotKey] = state;
    const builder = (p) => lib.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = lib.initialPopulation(
      state, trainer.params.populationSize, trainer.rng, builder);
  }

  // PSO: a swarm of particles with position + velocity + personal-best,
  // attracted to the swarm-wide global best.
  function initPSOPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.pso = BF.pso.create(numInputs, numOutputs, hidden, {
      inertia:   trainer.params.psoInertia,
      cognitive: trainer.params.psoCognitive,
      social:    trainer.params.psoSocial,
    });
    BF.pso.reset(trainer.pso);
    const builder = (p) => BF.pso.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.pso.initialPopulation(
      trainer.pso, trainer.params.populationSize, trainer.rng, builder);
  }

  // Differential Evolution: classic DE/rand/1/bin. Each individual carries
  // its own "target" state and competes only with its own trial each gen.
  function initDEPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    // DE searches a flat vector, so it supports the placeholder-genome policy
    // types (CNN family, recurrent) through the SAME dimOverride seam CMA-ES
    // uses. Without this DE silently sized its vectors to the plain-MLP param
    // count and genomeFromParams decoded a vector of the wrong length.
    const isPlaceholder = usesFlatParamPolicy(trainer.params.policyType);
    resolveCnnConfigs(trainer, numInputs, numOutputs);
    const dimOverride = cnnDimOverride(trainer);
    trainer.de = BF.de.create(numInputs, numOutputs, hidden, {
      F: trainer.params.deF != null ? trainer.params.deF : 0.5,
      CR: trainer.params.deCR != null ? trainer.params.deCR : 0.9,
      dimOverride: dimOverride,
    });
    BF.de.reset(trainer.de);
    const builder = isPlaceholder
      ? () => N.makeGenome(numInputs, numOutputs)
      : (p) => BF.de.genomeFromParams(p, numInputs, numOutputs, hidden);
    trainer.population = BF.de.initialPopulation(
      trainer.de, trainer.params.populationSize, trainer.rng, builder);
  }

  // Parallel tempering: N chains on a geometric T ladder. Each "individual"
  // is a chain that knows which ladder slot it currently occupies. Population
  // size is forced to PT's nChains for layout consistency.
  function initPTPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    const nChains = trainer.params.populationSize;
    trainer.pt = BF.pt.create(numInputs, numOutputs, hidden, {
      Tmin: trainer.params.ptTmin != null ? trainer.params.ptTmin : 0.05,
      Tmax: trainer.params.ptTmax != null ? trainer.params.ptTmax : 2.0,
      nChains: nChains,
      proposalSigma: trainer.params.ptProposalSigma != null ? trainer.params.ptProposalSigma : 0.2,
      swapInterval: trainer.params.ptSwapInterval != null ? trainer.params.ptSwapInterval : 4,
    });
    BF.pt.reset(trainer.pt);
    const builder = (params) =>
      BF.pt.genomeFromParams(params, numInputs, numOutputs, hidden);
    trainer.population = BF.pt.initialPopulation(trainer.pt, trainer.rng, builder, 0.5);
  }

  // Parallel simulated annealing: each individual is a chain. Initial chain
  // states are random samples from a small Gaussian; the chains then proposed-
  // and-accepted independently each step.
  function initAnnealingPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    trainer.annealing = BF.annealing.create(numInputs, numOutputs, hidden, {
      T0: trainer.params.annealingT0 != null ? trainer.params.annealingT0 : 1.0,
      coolingRate: trainer.params.annealingCooling != null ? trainer.params.annealingCooling : 0.97,
    });
    BF.annealing.reset(trainer.annealing);
    const lambda = trainer.params.populationSize;
    for (let i = 0; i < lambda; i++) {
      const params = BF.annealing.initialParams(trainer.annealing, trainer.rng, 0.5);
      const genome = BF.annealing.genomeFromParams(params, numInputs, numOutputs, hidden);
      // Each chain remembers its own current best fitness so we can apply the
      // SA acceptance rule next gen. Initial fitness will be filled by the
      // first evaluation pass.
      trainer.population.push({
        genome: genome, params: params, fitness: 0,
        chainBest: -Infinity, chainBestParams: new Float64Array(params),
      });
    }
  }

  // Fixed-baseline mode: pop=1, placeholder genome that's never read
  // by anything (makePolicy short-circuits on policyType='fixed-baseline'
  // and step() is a no-op for mode='fixed'). The placeholder still has
  // to be a valid genome shape because downstream code (e.g.
  // trainer.bestEver export, network renderer for the live UI) expects
  // .nodes / .conns to exist. We seed it with a minimal NEAT genome
  // sized to the setup's actual numInputs / numOutputs.
  function initFixedBaselinePopulation(trainer, numInputs, numOutputs) {
    const placeholder = N.makeGenome(numInputs, numOutputs);
    trainer.population = [{ genome: placeholder, fitness: 0 }];
    trainer.bestEver = placeholder;
    trainer.bestEverParams = null;
    // bestEverFitness stays at the trainer's init -Infinity until the
    // first rollout records one (or stays unset if the user only ever
    // peeks at metrics via dodge-sweep.rolloutConfig which re-evaluates
    // from scratch).
  }

  // CMA-ES initialization. Supports default MLP policies, the 2D CNN policy
  // on pendulum phase-space (params.policyType === 'cnn'), the 3D CNN
  // policy (cnn3d), and the dodge-grid CNN (cnn-grid). They differ only
  // in parameter-vector dimension and how params turn into a runnable
  // policy at eval time.
  function initCMAESPopulation(trainer, numInputs, numOutputs) {
    const hidden = fixedHiddenSizes(trainer);
    const isPlaceholder = usesFlatParamPolicy(trainer.params.policyType);
    // Each CNN variant gets its own *Config field; the others stay
    // null so downstream "which CNN config to read" checks have an
    // unambiguous answer.
    resolveCnnConfigs(trainer, numInputs, numOutputs);
    const dimOverride = cnnDimOverride(trainer);
    trainer.cmaes = BF.cmaes.create(numInputs, numOutputs, hidden, {
      sigma: trainer.params.cmaesSigma || 0.5,
      dimOverride: dimOverride,
      // Match CMA-ES population (λ) to trainer's chosen size — otherwise
      // Hansen's default formula picks a different λ for high-dim problems
      // (e.g., CNN's 2k params would suggest λ≈26, but trainer might create 8).
      lambda: trainer.params.populationSize,
    });
    const lambda = trainer.params.populationSize;
    for (let i = 0; i < lambda; i++) {
      const params = BF.cmaes.sampleParams(trainer.cmaes, trainer.rng);
      // For CNN modes the genome is just a placeholder so downstream
      // code (snapshot, network panel) doesn't choke. The actual policy
      // is built from `params` via BF.cnn.policy / BF.cnn3d.policy /
      // BF.cnnGrid.policy / BF.recurrent.policy at eval time.
      const genome = isPlaceholder
        ? N.makeGenome(numInputs, numOutputs)
        : BF.cmaes.genomeFromParams(params, numInputs, numOutputs, hidden);
      trainer.population.push({ genome: genome, params: params, fitness: 0 });
    }
  }

  // Build the curriculum overlay (paramKey -> applied value at the
  // current level). Used by instantiateSetup for physics/scene knobs
  // AND by evaluatePolicy for objective-shaping weights, so adding a
  // ramp on e.g. centerBonusWeight Just Works through the same code
  // path as the existing physics ramps. Returns an empty object when
  // curriculum is off or no specs exist.
  // levelOverride: optional integer to pin the overlay at a specific
  // curriculum level instead of the live trainer.curriculum.level.
  // Used by retro-eval to re-evaluate a current-population policy at
  // a prior level's difficulty, catching catastrophic forgetting
  // without perturbing the main training-loop level counter.
  // Group curriculum specs by their `phase` field (default 0 when
  // unset, which preserves the pre-phase parallel behavior). Returns
  //   { phases: [[spec, spec, ...], [spec, ...], ...],
  //     phaseMaxSteps: [maxStepsForPhase0, ...],
  //     cumStart: [startLevelForPhase0, ...] }
  // The cumStart array is the level at which each phase BEGINS;
  // phase p's specs start ramping from `from` at level cumStart[p]
  // and reach `to` at level cumStart[p] + phaseMaxSteps[p].
  // defaultSteps: per-spec step count to use when a spec doesn't carry
  // an explicit `steps` field. Legacy single-phase configs passed specs
  // without steps and relied on the trainer's global curriculumMaxLevel
  // as the ramp length -- so callers that have a trainer in hand should
  // pass `trainer.params.curriculumMaxLevel || 10` here. Defaults to 1
  // for callers that don't know the global max yet (e.g. early UI hooks
  // before a trainer exists); they'll get the conservative "one level
  // per phase" behavior, which is still consistent across the rest of
  // the system.
  function computeCurriculumPhases(specs, defaultSteps) {
    if (!specs || specs.length === 0) {
      return { phases: [], phaseMaxSteps: [], cumStart: [] };
    }
    const dflt = Math.max(1, (defaultSteps | 0) || 1);
    // Bucket specs by phase. Track the distinct phase numbers and sort
    // them ASCENDING so phase 0 is first, phase 1 second, etc.
    const buckets = new Map();
    for (const spec of specs) {
      if (!spec || !spec.paramKey) continue;
      const ph = (spec.phase | 0) || 0;
      if (!buckets.has(ph)) buckets.set(ph, []);
      buckets.get(ph).push(spec);
    }
    const phaseNums = Array.from(buckets.keys()).sort((a, b) => a - b);
    const phases = [];
    const phaseMaxSteps = [];
    const cumStart = [];
    let cum = 0;
    for (const ph of phaseNums) {
      const bucket = buckets.get(ph);
      phases.push(bucket);
      let maxSteps = 0;
      for (const s of bucket) {
        // Specs without an explicit `steps` field fall back to the
        // caller-supplied default (typically curriculumMaxLevel). The
        // old code treated missing `steps` as 1, which collapsed the
        // phase boundary onto the very next level and made
        // `lvl >= phaseEnd` true after a single level-up -- the ramp
        // snapped straight to `to`. Tests caught this with a single
        // gravity spec + maxLevel=4 expecting 1/4-of-the-way ramping
        // at level=1.
        const n = (s.steps | 0) || dflt;
        if (n > maxSteps) maxSteps = n;
      }
      if (maxSteps < 1) maxSteps = 1;
      phaseMaxSteps.push(maxSteps);
      cumStart.push(cum);
      cum += maxSteps;
    }
    return { phases, phaseMaxSteps, cumStart };
  }

  function computeCurriculumOverlay(trainer, levelOverride) {
    const overlay = {};
    if (!trainer.params.curriculumEnabled) return overlay;
    if (!trainer.params.curriculumSpecs || trainer.params.curriculumSpecs.length === 0) return overlay;
    const lvl = (levelOverride != null)
      ? Math.max(0, levelOverride | 0)
      : (trainer.curriculum ? (trainer.curriculum.level || 0) : 0);
    // Phase-aware ramp: specs in earlier phases ramp first, then
    // later phases. Within a phase, specs ramp in parallel using
    // their own `steps` count. Backward-compat: specs with no phase
    // (or phase=0) all share phase 0 -> single-phase parallel = old
    // behavior.
    const defaultSteps = trainer.params.curriculumMaxLevel | 0 || 10;
    const { phases, cumStart, phaseMaxSteps } = computeCurriculumPhases(
      trainer.params.curriculumSpecs, defaultSteps,
    );
    for (let p = 0; p < phases.length; p++) {
      const phaseStart = cumStart[p];
      const phaseEnd   = phaseStart + phaseMaxSteps[p];
      for (const spec of phases[p]) {
        let frac;
        if (lvl <= phaseStart) {
          frac = 0;  // phase hasn't started yet
        } else if (lvl >= phaseEnd) {
          frac = 1;  // phase done; spec sits at `to`
        } else {
          const specSteps = Math.max(1, (spec.steps | 0) || phaseMaxSteps[p]);
          frac = Math.min(1, (lvl - phaseStart) / specSteps);
        }
        overlay[spec.paramKey] = curriculumApply(spec, frac);
      }
    }
    return overlay;
  }
  // Keys of trainer.params.objectiveParams that the curriculum is
  // allowed to override via spec.paramKey. Anything not listed here
  // stays as set by the UI -- so an accidental `gravity` spec doesn't
  // bleed into the objective params dict.
  const OBJECTIVE_RAMPABLE_KEYS = [
    'centerBonusWeight',
    'bouncePenaltyWeight',
    'strikeDirectionWeight',
    'ballSpeedBonus',
  ];

  // Build a world for the chosen setup using current physics params.
  // angleOverride lets callers force a specific startAngle (used by the test loop).
  // levelOverride pins the curriculum overlay to a specific level (used
  // by retro-eval to test against a prior level's difficulty).
  // Deterministic per-rollout seed for the dodge bullet pattern. A pure hash
  // of (run seed, generation, rollout index): identical for every individual
  // at the same (gen, rollout) -> fair within-gen comparison; different across
  // rollouts + generations -> the policy faces varied patterns and must learn
  // to dodge generally instead of memorizing one fixed sequence. Computed on
  // the MAIN thread and broadcast to workers (task.dodgeSeed) so the parallel
  // and serial paths produce the identical pattern. splitmix-style mixing.
  function dodgePatternSeedFor(baseSeed, gen, r) {
    let h = ((baseSeed | 0) ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ (((gen | 0) + 0x7F4A7C15) >>> 0), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (((r | 0) + 0x165667B1) >>> 0), 0xC2B2AE35) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) || 1;
  }

  function instantiateSetup(trainer, randomize, angleOverride, levelOverride) {
    const setup = BF.setups.getSetup(trainer.setupId);
    let startAngle;
    if (angleOverride != null) {
      startAngle = angleOverride;
    }
    // Build the curriculum overlay (spec.paramKey -> applied value at the
    // current level) up front so it can ramp the start-angle range too,
    // not just gravity/damping/cartAccel below. Shared with evaluatePolicy
    // so objective-shaping weights (centerBonusWeight, bouncePenaltyWeight,
    // ...) can also be curriculum-ramped without a separate code path.
    // Passes the level override through so retro-eval can target prior
    // levels without mutating trainer.curriculum.level mid-step.
    const curriculumOverlay = computeCurriculumOverlay(trainer, levelOverride);
    if (angleOverride == null && randomize) {
      // Resolve the start-angle magnitude (radians). Priority order:
      //   1. curriculum overlay `startTiltDeg`   (new, deg)  -> deg2rad
      //   2. curriculum overlay `startAngleRange` (legacy, rad)
      //   3. adversarial _envOverlay              (rad)
      //   4. trainer.params.startAngleRange       (rad, default)
      // The deg path is what the slider + the new curriculum knob use;
      // the rad path stays so saved models and the adversarial trainer
      // (which writes startAngleRange directly) keep working.
      let range = trainer.params.startAngleRange != null
        ? trainer.params.startAngleRange
        : 0.1;
      if (trainer._envOverlay && trainer._envOverlay.startAngleRange != null) {
        range = trainer._envOverlay.startAngleRange;
      }
      if (curriculumOverlay.startAngleRange != null) {
        range = curriculumOverlay.startAngleRange;
      }
      if (curriculumOverlay.startTiltDeg != null) {
        range = curriculumOverlay.startTiltDeg * Math.PI / 180;
      }
      // Tilt direction filter — bias the sampled start angle to one side
      // of vertical, or both (default).
      //
      // New center+spread model: `range` is the CENTRAL magnitude
      // (deterministic part of the pose). `spread` is a uniform jitter
      // half-width added on top. spread=0 means every rollout starts
      // at exactly ±range (much easier to learn -- the policy doesn't
      // also have to generalize across initial conditions). spread>0
      // gives a fan; the curriculum can ramp spread up gradually so
      // the policy starts on a single fixed pose and grows into a
      // variance later. Both spread sources (curriculum overlay + the
      // raw param) feed in here.
      let spread = (trainer.params.startTiltSpreadDeg != null
        ? trainer.params.startTiltSpreadDeg : 0) * Math.PI / 180;
      if (curriculumOverlay.startTiltSpreadDeg != null) {
        spread = curriculumOverlay.startTiltSpreadDeg * Math.PI / 180;
      }
      const jitter = spread > 0 ? trainer.rng.range(-spread, spread) : 0;
      const dir = trainer.params.tiltDirection || 'both';
      if (dir === 'left')        startAngle = -range + jitter;
      else if (dir === 'right')  startAngle =  range + jitter;
      else {
        // 'both' -- alternate sign per rollout. trainer.rng.next() is
        // [0,1); >=0.5 -> +range, else -range. The jitter is applied
        // after the sign choice so the fan stays centered on the
        // chosen pose.
        const sign = trainer.rng.next() < 0.5 ? -1 : 1;
        startAngle = sign * range + jitter;
      }
    } else if (angleOverride == null) {
      startAngle = 0.05;
    }
    if (angleOverride == null) startAngle = BF.util.clampStartAngle(startAngle, trainer.params.tiltDirection);
    // LEGACY gravity/damping ramp: when the curriculum is on WITHOUT any
    // spec-driven params, use the *current* (gradually ramped) values instead
    // of the user's target values — the user's slider becomes the destination
    // the curriculum climbs toward. When SPECS exist, the specs are the whole
    // curriculum: the legacy ramp must NOT hijack gravity/damping for params
    // the specs never mention. (That hijack was the "ball_in_hole +
    // curriculum" bug: a holeWidth-only curriculum silently rebuilt the world
    // at 18% gravity / 8x damping — currentGravity = gravity*startFrac(0.18),
    // currentDamping = min(0.1, damping*8) — so the club swung feebly, sink
    // fitness collapsed from ~64 to ~13-35, and every golf/putt curriculum
    // preset stalled at level 0 while "looking like it was progressing".)
    const legacyRampActive = trainer.params.curriculumEnabled
      && (!trainer.params.curriculumSpecs || trainer.params.curriculumSpecs.length === 0);
    let grav = legacyRampActive
      ? trainer.curriculum.currentGravity
      : trainer.params.gravity;
    let damp = legacyRampActive
      ? trainer.curriculum.currentDamping
      : trainer.params.damping;
    let cartAccel = trainer.params.cartAccel;
    if (curriculumOverlay.gravity != null) grav = curriculumOverlay.gravity;
    if (curriculumOverlay.damping != null) damp = curriculumOverlay.damping;
    if (curriculumOverlay.cartAccel != null) cartAccel = curriculumOverlay.cartAccel;
    // Adversarial-env overlay: when active, the trainer pre-set
    // trainer._envOverlay before calling evaluatePolicy. The overlay
    // multiplies physics knobs for THIS rollout only — not persisted to
    // trainer.params. After this rollout the overlay is cleared.
    if (trainer._envOverlay) {
      const o = trainer._envOverlay;
      if (o.gravity   != null) grav      = o.gravity;
      if (o.damping   != null) damp      = o.damping;
      if (o.cartAccel != null) cartAccel = o.cartAccel;
    }
    // Resolve a single setup-knob value: curriculum overlay wins over
    // user-set param wins over null (= setup default). null is used for
    // setup-specific knobs the user hasn't explicitly set, so the setup's
    // own default is preserved.
    function resolved(key) {
      if (curriculumOverlay[key] != null) return curriculumOverlay[key];
      return trainer.params[key];
    }
    const state = setup.buildWorld({
      gravity: grav,
      physicsDt: trainer.params.physicsDt,
      pendulumInitialState: trainer.params.pendulumInitialState,
      pendulumInitialStateSpread: trainer.params.pendulumInitialStateSpread,
      initialStateRng: trainer.rng,
      damping: damp,
      cartAccel: cartAccel,
      cartControlMode: trainer.params.cartControlMode || 'accel',
      cartWallsEnabled: trainer.params.cartWallsEnabled !== false,
      pendulumRailHalfWidth: resolved('pendulumRailHalfWidth'),
      cartMaxSpeed: resolved('cartMaxSpeed'),
      cartDrag: resolved('cartDrag'),
      jointDamping: resolved('jointDamping'),
      uprightAssist: resolved('uprightAssist'),
      startAngle: startAngle,
      // Pass-through ball params so ball-hit setup picks up its overlay too.
      ballMode:        trainer.params.ballMode,
      ballSpawnX:      resolved('ballSpawnX'),
      ballSpawnY:      resolved('ballSpawnY'),
      ballSpawnDelay:  resolved('ballSpawnDelay'),
      ballDriftSpeed:  resolved('ballDriftSpeed'),
      ballMass:        resolved('ballMass'),
      ballRadius:      resolved('ballRadius'),
      ballRestitution: resolved('ballRestitution'),
      // Per-setup knobs the curriculum can ramp. holeCenter additionally
      // takes a per-rollout jitter offset from trainer._holeJitter when
      // the trainer's pre-sampled per-rollout jitters are active (see
      // step()). The jitter is 0 when the holeCenterJitter toggle is off.
      holeCenter:      resolved('holeCenter') + (trainer._holeJitter || 0),
      holeWidth:       resolved('holeWidth'),
      // Golf-only: how many obstacle balls to place between cart + hole.
      // The golf setup falls back to its built-in default (2) when this
      // is null/undefined so existing non-golf setups don't care.
      numObstacles:    resolved('golfObstacles'),
      obstacleRadius:  resolved('golfObstacleR'),   // golf: rampable to a huge fairway sphere
      numLumps:        resolved('golfLumps'),       // golf: unmovable ground domes
      lumpRadius:      resolved('golfLumpR'),
      // Chain-reach (Track C): spring material. MUST be threaded into the
      // ROLLOUT buildWorld (here), not just the app.js display sites, or
      // training silently always uses the default 'springy' while the UI
      // preview shows the user's choice — a display/training divergence.
      // The material hot-swap listener mutates trainer.params.material, so
      // the next rollout picks it up via resolved('material') with no
      // rebuild. numSegments is deliberately NOT threaded here: the chain
      // setup falls back to this.numSegments, which is the SAME value that
      // sized the genome (via setObservationShape), so the rollout world's
      // segment count can never drift from the policy's input dimension.
      // Other setups ignore this key.
      material:        resolved('material'),
      // Chain-trace (signing machine): which curve + its timing/size. Other
      // setups ignore these; chain-trace buildWorld defaults them. Must be
      // threaded here (not just the app.js display sites) or training traces
      // the default curve regardless of the preset — the Track C lesson.
      curveId:    resolved('curveId'),
      tracePeriod: resolved('tracePeriod'),
      traceRadius: resolved('traceRadius'),
      traceAcceptRadius: resolved('traceAcceptRadius'),  // signing accepting-radius curriculum (big→small)
      traceCenterY: resolved('traceCenterY'),            // manual placement override; 0 = the setup's measured auto-centre
      traceCenterX: resolved('traceCenterX'),
      traceCenterMode: resolved('traceCenterMode'),
      chainPaint: resolved('chainPaint'),                // signing paint/coverage mode (freezes cursor, grades band coverage)
      chainStroke: resolved('chainStroke'),              // signing STROKE mode (pen-down episodes; chain_stroke objective)
      strokeLiftRatio: resolved('strokeLiftRatio'),      // stroke mode: pen-UP radius as a multiple of the band half-width
      chainOrdered: resolved('chainOrdered'),            // signing IN-ORDER mode (frontier waypoint; chain_trace_ordered objective)
      orderedRequiredFrac: resolved('orderedRequiredFrac'), // ordered mode: arc a single run must cover for full credit (THE curriculum knob)
      orderedBreakRatio: resolved('orderedBreakRatio'),  // ordered mode: run-abandon margin as a multiple of the band half-width
      // Chain joint actuation (B2.2a): jointControlMode (torque|servo) is a
      // behavior swap with no dimension change, so it's threaded like material —
      // the live-swap handler mutates trainer.params.jointControlMode and the
      // next rollout picks it up here. numActuatedJoints is deliberately NOT
      // threaded: it's an OUTPUT-dimension param, so (like numSegments) the chain
      // setup falls back to this.numActuatedJoints — the same value setActionShape
      // used to size the genome outputs. resolved() returns undefined for an
      // unset key → buildWorld defaults to 'torque' → other/non-actuated setups
      // are byte-unchanged.
      jointControlMode: resolved('jointControlMode'),
      // Chain-reach target-ease curriculum: 0→1 interpolation from the resting
      // tip to the hard target. resolved() picks up the curriculum overlay so
      // the ramp reaches rollouts. Other setups ignore it; chain-reach
      // buildWorld defaults it to 1 (hard) when absent.
      targetEase:      resolved('targetEase'),
      // Recipe-clean demo difficulty knobs, ramped by their curriculum specs
      // (start easy → end at the setup's own hardcoded default = the shipped
      // difficulty). resolved() returns undefined when unset, so each cart-only
      // setup falls back to its default and the non-curriculum presets are
      // byte-unchanged. Every other setup ignores these keys.
      railCatchAmpl:   resolved('railCatchAmpl'),
      catchDropSpread: resolved('catchDropSpread'),
      pickSideSep:     resolved('pickSideSep'),
      fleeHomeSpeed:   resolved('fleeHomeSpeed'),
      cruiseVAmpl:     resolved('cruiseVAmpl'),
      chirpRate:       resolved('chirpRate'),
      safeZoneHalf:    resolved('safeZoneHalf'),
      midpointScale:   resolved('midpointScale'),
      tagSpread:       resolved('tagSpread'),
      prioritizeAmpl:  resolved('prioritizeAmpl'),
      armReachEase:    resolved('armReachEase'),
      reachRadius:     resolved('reachRadius'),   // arm-reach accepting-radius curriculum (big→small)
      // Epicycle (Fourier signing machine). epiArms is deliberately threaded
      // even though it is an OBSERVATION-dimension knob: unlike the chain's
      // numSegments it also picks WHICH arms exist, and the setup clamps it —
      // but the app must still call setObservationShape/setActionShape with the
      // same value before building the trainer, or the genome and the world
      // disagree. epiBasis 'auto' = the measured per-curve recommendation.
      epiArms:      resolved('epiArms'),
      epiBasis:     resolved('epiBasis'),
      epiDrive:     trainer.params.epiDrive,
      epiTelescope: trainer.params.epiTelescope,
      epiWarmPhase: trainer.params.epiWarmPhase,
      armTrackAmpl:    resolved('armTrackAmpl'),
      armObstacleR:    resolved('armObstacleR'),
      slotGap:         resolved('slotGap'),
      plateStiff:      resolved('plateStiff'),
      // Single-pendulum OBSERVATION DROPOUT (the memory task). Threaded here
      // rather than left to the setup singleton so the eval WORKERS -- which
      // build their own trainer from these same params -- cannot silently
      // evaluate the un-masked world. dropoutK goes through resolved() so a
      // curriculum spec could ramp it (measured: ramping it is WORSE than a
      // fixed K=4, but the knob costs nothing and the ramp is studiable).
      // Every other setup ignores both keys.
      singleObservationMode: trainer.params.singleObservationMode,
      pendulumObservationMode: trainer.params.pendulumObservationMode || 'legacy',
      singleDropoutK:        resolved('singleDropoutK'),
      // Dodge-only knobs (ignored by every other setup).
      dodgePattern:        trainer.params.dodgePattern,
      dodgeSpawnRate:      resolved('dodgeSpawnRate'),
      dodgeBulletSpeed:    resolved('dodgeBulletSpeed'),
      dodgeBulletRadius:   resolved('dodgeBulletRadius'),
      dodgeLeadTime:       resolved('dodgeLeadTime'),
      dodgePredictOrder:   trainer.params.dodgePredictOrder,
      dodgeBulletsPerWave: resolved('dodgeBulletsPerWave'),
      dodgeObservationMode: trainer.params.dodgeObservationMode,
      dodgeNoDie:           !!trainer.params.dodgeNoDie,
      dodgeInvulnSeconds:   trainer.params.dodgeInvulnSeconds,
      dodgeLifespanMode:    !!trainer.params.dodgeLifespanMode,
      // Plumbed through to setup → state.dodge.noDiePenalty so the
      // dodge_survive reward can read it. evaluatePolicy passes
      // trainer.params.objectiveParams (NOT trainer.params) to the
      // reward function, and dodgeNoDiePenalty doesn't live there;
      // the in-state-dodge path is the canonical way to get
      // dodge-specific reward params to the reward function.
      dodgeNoDiePenalty:    trainer.params.dodgeNoDiePenalty,
      // Terrain-run knobs (ignored by every other setup). ALL of the course
      // geometry goes through resolved(), so a curriculum spec can ramp
      // difficulty directly (gap width, segment length, course length, feature
      // mix) instead of needing a separate ladder. terrainDifficulty picks the
      // measured rung ('hard', 'crucible', ...) that the individual knobs then
      // override. The observation-geometry knobs are deliberately NOT here:
      // they size the genome, so they live on the setup instance behind
      // setObservationMode (see the note in setups.js).
      terrainDifficulty:   trainer.params.terrainDifficulty,
      terrainObservationMode: trainer.params.terrainObservationMode,
      terrainGridW:        resolved('terrainGridW'),
      terrainGridH:        resolved('terrainGridH'),
      terrainStartPad:     resolved('terrainStartPad'),
      terrainBaseRow:      resolved('terrainBaseRow'),
      terrainGapMin:       resolved('terrainGapMin'),
      terrainGapMax:       resolved('terrainGapMax'),
      terrainLedgeMax:     resolved('terrainLedgeMax'),
      terrainDropMax:      resolved('terrainDropMax'),
      terrainSegMin:       resolved('terrainSegMin'),
      terrainSegMax:       resolved('terrainSegMax'),
      terrainWGap:         resolved('terrainWGap'),
      terrainWStepUp:      resolved('terrainWStepUp'),
      terrainWStepDown:    resolved('terrainWStepDown'),
      terrainWPlatform:    resolved('terrainWPlatform'),
      terrainWSpike:       resolved('terrainWSpike'),
      terrainWTunnel:      resolved('terrainWTunnel'),
      terrainGravity:      resolved('terrainGravity'),
      terrainDriveAccel:   resolved('terrainDriveAccel'),
      // AIR CONTROL is the anti-"spam jump" mechanism (measured: jump-spam
      // scores 18.4 of an attainable 100 WITH it). Threaded like any other
      // knob so it can be studied, never defaulted away: the setup's own
      // default is 0.14 and every rung inherits it.
      terrainAirControl:   resolved('terrainAirControl'),
      terrainMaxSpeed:     resolved('terrainMaxSpeed'),
      terrainGroundDrag:   resolved('terrainGroundDrag'),
      terrainJumpVel:      resolved('terrainJumpVel'),
      terrainJumpCooldown: resolved('terrainJumpCooldown'),
      terrainControlEvery: resolved('terrainControlEvery'),
      terrainGoalBonus:    resolved('terrainGoalBonus'),
      terrainEvalSeconds:  resolved('terrainEvalSeconds'),
      // Per-rollout COURSE seed. Reuses the per-rollout hash the dodge pattern
      // already uses (dodgePatternSeedFor -> trainer._dodgeSeed): it is
      // computed once on the main thread per (run seed, generation, rollout)
      // and broadcast to the workers, so the serial and parallel paths face the
      // IDENTICAL course, every individual in a generation is scored on the
      // same courses (fair within-gen comparison), and the courses change
      // across rollouts + generations so a policy has to traverse GENERALLY
      // instead of memorising one map. null on the display path -> the terrain
      // setup falls back to `seed`, so the shown course is stable.
      terrainSeed:         (trainer._dodgeSeed != null ? trainer._dodgeSeed : null),
      seed:                trainer.seed,
      // Per-rollout dodge bullet-pattern seed (see dodgePatternSeedFor). Set
      // on trainer._dodgeSeed by the eval loops before each evaluatePolicy;
      // null on the display path -> the dodge setup falls back to `seed`. Only
      // the dodge setup reads this; every other setup ignores it.
      dodgePatternSeed:    (trainer._dodgeSeed != null ? trainer._dodgeSeed : null),
    });
    state.startAngle = startAngle;
    return { setup, state };
  }

  // Build a policy object from either a NEAT genome OR a CNN-policy spec
  // ({ params, config }). Lets the trainer treat both uniformly downstream.
  // opts (optional): { sever: true } forces a recurrent policy's memory inputs
  // to 0 for THIS instance only, leaving trainer.recurrentConfig untouched.
  // That is how the ABLATION is measured on an already-trained champion —
  // identical weights, memory cut — without disturbing the run it came from.
  // (The UI's "Cut memory" checkbox takes the other route: it sets
  // params.recurrentSever, which re-resolves the config for training AND
  // display, so the user can watch the current champion collapse live.)
  // Every training call site omits opts.
  function makePolicy(trainer, target, opts) {
    // Hand-coded baselines short-circuit before the trained-policy
    // branches: target is ignored (the placeholder genome doesn't drive
    // command output for these). baselineKind selects the specific
    // controller; see BF.baselinePolicy.policy() for the catalog.
    if (trainer.params.policyType === 'fixed-baseline') {
      return BF.baselinePolicy.policy(trainer.params.baselineKind || 'still');
    }
    if (trainer.params.policyType === 'recurrent' && target && target.params) {
      const cfg = (target.config || trainer.recurrentConfig || BF.recurrent.defaultConfig());
      return BF.recurrent.policy(target.params, cfg, opts);
    }
    if (trainer.params.policyType === 'cnn' && target && target.params) {
      const cfg = (target.config || trainer.cnnConfig || BF.cnn.defaultConfig());
      return BF.cnn.policy(target.params, cfg);
    }
    if (trainer.params.policyType === 'cnn-grid' && target && target.params) {
      const cfg = (target.config || trainer.cnnGridConfig || BF.cnnGrid.defaultConfig());
      return BF.cnnGrid.policy(target.params, cfg);
    }
    if (trainer.params.policyType === 'cnn-multiscale' && target && target.params) {
      const cfg = (target.config || trainer.cnnMultiscaleConfig || BF.cnnMultiscale.defaultConfig());
      return BF.cnnMultiscale.policy(target.params, cfg);
    }
    if (trainer.params.policyType === 'cnn3d' && target && target.params) {
      const cfg = (target.config || trainer.cnn3dConfig || BF.cnn3d.defaultConfig());
      return BF.cnn3d.policy(target.params, cfg);
    }
    // NEAT-CNN hybrid: wrap the NEAT genome with the trainer-shared
    // frozen CNN feature extractor. Activates only when useHybridCnn
    // is set + we have a NEAT genome target + the CNN params are
    // ready (initNeatCnnHybridPopulation ran).
    if (trainer.params.useHybridCnn && trainer.frozenHybridCnnParams && trainer.hybridCnnConfig) {
      const genome = (target && target.genome) ? target.genome : target;
      return BF.cnnNeatHybrid.policy(genome, trainer.frozenHybridCnnParams, trainer.hybridCnnConfig, {
        includeTopK: !!trainer.hybridIncludeTopK,
        topKSlots:   trainer.hybridTopKSlots,
      });
    }
    // target may be either a genome directly or an individual carrying .genome
    const genome = (target && target.genome) ? target.genome : target;
    return N.policy(genome);
  }

  // Run one rollout and return fitness + final state + summary metrics.
  function evaluatePolicy(trainer, target, randomize, angleOverride, levelOverride) {
    const _evalDbg = (typeof window !== 'undefined' && window.BF_DEBUG_EVAL);
    if (_evalDbg) console.log('[BF.eval] instantiateSetup start');
    const { setup, state } = instantiateSetup(trainer, randomize, angleOverride, levelOverride);
    if (_evalDbg) console.log('[BF.eval] instantiateSetup done, obsMode=' + state.observationMode);
    const dt = trainer.params.physicsDt;
    const baseSteps = Math.round(trainer.params.evalSeconds / dt);
    // Setups can declare a `tailEvalSeconds` budget that the rollout
    // is allowed to extend into past the base eval timer, so long as
    // setup.shouldKeepGoing(state) returns true. Lets ball-strike
    // scenes wait for the projectile to actually settle (sink,
    // escape, or stop) instead of cutting off mid-flight — which
    // before this would make a near-sink and a wide miss score the
    // same (both = "ball still in motion when timer expired").
    const tailSec  = (setup && setup.tailEvalSeconds) || 0;
    const tailSteps = Math.round(tailSec / dt);
    const totalSteps = baseSteps + tailSteps;
    const canExtend = !!(setup && typeof setup.shouldKeepGoing === 'function');
    const pol = makePolicy(trainer, target);
    const objective = BF.objectives.getObjective(trainer.params.objectiveId);
    // Merge the curriculum overlay into the effective objective-params
    // dict. Only the whitelisted reward-shaping weights are overlaid;
    // other keys (targetAngleDeg, toggle flags, etc.) stay as set by
    // the UI. Allows the user to ramp e.g. strikeDirectionWeight
    // 20 -> 0 over the curriculum so early-gen policies get strong
    // directional shaping and late-gen policies are evaluated against
    // a leaner reward that doesn't double-credit the sunk anchor.
    const objParams = Object.assign({}, trainer.params.objectiveParams || {});
    const objOverlay = computeCurriculumOverlay(trainer, levelOverride);
    for (const k of OBJECTIVE_RAMPABLE_KEYS) {
      if (objOverlay[k] != null) objParams[k] = objOverlay[k];
    }
    // Pendulum-NEAT-style smoothness penalty: charge the controller for every
    // step where it changes its command. Without this, direct-velocity-mode
    // policies degenerate into bang-bang twitching because rapid reversals
    // happen to keep the bob upright on average.
    const smoothPen = trainer.params.smoothnessPenalty || 0;
    let lastCmd = 0;
    let fitness = 0;
    let upTimeAccum = 0; // total seconds the tip was within ~30° of upright
    // Per-rollout scratch object passed to objective.reward (4th arg).
    // Stateful objectives (e.g. pendulum_neat_score) accumulate cross-
    // step quantities here -- chiefly outSum = Σ|Δcmd| over the rollout,
    // which feeds the smoothness-decay term in their reward formula.
    // Plain objectives ignore the scratch arg. Reset every rollout
    // because evaluatePolicy is called fresh per rollout from step().
    const objScratch = { outSum: 0, lastCmd: 0, steps: 0 };
    // Behavior-space features collected during the rollout. These describe
    // WHAT the policy does (where it parks the cart, how twitchy its
    // control is, how upright it keeps the bob) — independent of WHICH
    // weights it uses to do it. Two policies with very different params but
    // similar behavior should end up nearby in this 6D space.
    let cartXSum = 0, cartXSqSum = 0;
    let ctrlSum = 0, ctrlSqSum = 0;
    let tipHeightSum = 0;
    let stepsRun = 0;
    // Shared push-controller logic — supports targeting, sustained pushes,
    // and smoothed envelopes via params.pushTarget/pushDuration/pushSmoothing.
    // When the adversarial env overlay overrides pushStrength, apply that
    // here so disturbances scale with the env's hostility.
    let pushParams = trainer.params;
    if (trainer._envOverlay && trainer._envOverlay.pushStrength != null) {
      pushParams = Object.assign({}, trainer.params, {
        pushStrength: trainer._envOverlay.pushStrength,
      });
    }
    const pushCtrl = BF.disturb.make(pushParams, trainer.rng);
    // Setup-specific behavior descriptors (registered in BF.behaviors).
    // Their per-step onStep is called inside the eval loop alongside the
    // generic 6-feature behavior vector. The finalized values feed the
    // behavior-space archive so the heatmap can show "where in behavior
    // space have we explored". Empty list = no setup descriptors registered.
    const setupBehaviorAccs = (BF.behaviors && BF.behaviors.makeAccumulators)
      ? BF.behaviors.makeAccumulators(setup.id)
      : null;
    // Multi-action support: setups with actionCount > 1 (e.g. dodge,
    // which controls a 2D agent) read every output node from the policy
    // via commandAll. Pre-allocate the buffer once per rollout.
    const numActions = Math.max(1, setup.actionCount | 0) || 1;
    const cmdBuf = new Array(numActions);
    for (let step = 0; step < totalSteps; step++) {
      if (_evalDbg && (step === 0 || step === 1 || step === 50 || step === 200)) {
        console.log('[BF.eval] step ' + step + ' begin');
      }
      const obs = setup.buildObservation(state);
      if (_evalDbg && step === 0) console.log('[BF.eval] buildObservation done, obs.length=' + obs.length);
      let cmd;
      if (numActions === 1) {
        cmd = clamp(pol.command(obs), -1, 1);
        cmdBuf[0] = cmd;
      } else {
        if (_evalDbg && step === 0) console.log('[BF.eval] step 0: about to call pol.commandAll');
        pol.commandAll(obs, cmdBuf);
        if (_evalDbg && step === 0) console.log('[BF.eval] step 0: commandAll returned, cmdBuf[0]=' + cmdBuf[0]);
        for (let i = 0; i < numActions; i++) cmdBuf[i] = clamp(cmdBuf[i], -1, 1);
        // Legacy single-cmd interface still needs SOMETHING for the
        // smoothness penalty / behavior-descriptor mean-|ctrl|. Use
        // index 0 as a proxy when actionCount > 1.
        cmd = cmdBuf[0];
      }
      // Stamp lastCmd onto state so behavior descriptors that need the
      // current control value (e.g. mean_ctrl_abs) can read it. Setups
      // that need ALL commands can read state.lastCmds (the full array).
      state.lastCmd = cmd;
      state.lastCmds = cmdBuf;
      P.step(state.world, dt, cmd);
      // Setup-level tick (e.g. ball physics + collision) runs after the
      // standard physics step so node positions are committed first. Called
      // before kinematics so the snapshot reflects the post-collision state.
      // Multi-action setups read state.lastCmds inside their tick to drive
      // the agent (the 1D P.step cmd above is a no-op for them since they
      // don't setCart).
      if (setup.tick) setup.tick(state, dt);
      const kin = BF.setups.kinematics(state);
      // Update per-rollout scratch BEFORE reward so the objective sees
      // the just-updated cumulative jerk. Use cmdBuf[0] (single-action
      // setups) or cmd (multi-action proxy) as the canonical output.
      objScratch.outSum += Math.abs(cmd - objScratch.lastCmd);
      objScratch.lastCmd = cmd;
      objScratch.steps++;
      fitness += objective.reward(kin, dt, objParams, objScratch);
      if (smoothPen > 0 && step > 0) {
        fitness -= smoothPen * Math.abs(cmd - lastCmd);
      }
      lastCmd = cmd;
      if (kin.chainHeight > 0.86) upTimeAccum += dt;
      // Behavior tracking — cheap, every step. Read cart-x from kinematics
      // (not state.world.cart, which doesn't exist; the cart node lives at
      // state.world.nodes[state.cartIdx] and kin already exposes its x).
      const cx = kin.cartX || 0;
      cartXSum += cx; cartXSqSum += cx * cx;
      ctrlSum += cmd; ctrlSqSum += cmd * cmd;
      tipHeightSum += kin.chainHeight;
      stepsRun++;
      if (setupBehaviorAccs && BF.behaviors.step) {
        BF.behaviors.step(setupBehaviorAccs, setup.id, state, kin, dt);
      }
      BF.disturb.tick(pushCtrl, state, dt, trainer.params, trainer.rng);
      if (!setup.isAlive(state)) break;
      // Past the base eval timer: only continue if the setup
      // explicitly opts in via shouldKeepGoing (ball-aware setups
      // typically return true while the projectile is still in
      // motion). Without this, golf/putt rollouts cut off
      // mid-flight and fitness becomes ambiguous.
      if (step + 1 >= baseSteps && canExtend) {
        if (!setup.shouldKeepGoing(state)) break;
      }
    }
    // Normalize — guards against zero-step rollouts (immediate failure).
    const denom = Math.max(1, stepsRun);
    const meanCartX = cartXSum / denom;
    const meanCtrl  = ctrlSum / denom;
    const stdCartX  = Math.sqrt(Math.max(0, cartXSqSum / denom - meanCartX * meanCartX));
    const stdCtrl   = Math.sqrt(Math.max(0, ctrlSqSum / denom - meanCtrl * meanCtrl));
    const meanTipH  = tipHeightSum / denom;
    const survivedFrac = stepsRun / Math.max(1, totalSteps);
    const upTimeFrac   = upTimeAccum / Math.max(1e-6, trainer.params.evalSeconds);
    const behavior = [meanCartX, stdCartX, meanCtrl, stdCtrl, meanTipH, upTimeFrac];
    // Length labels — kept here so the renderer / UI can introspect.
    behavior.labels = ['cart-x̄', 'cart-σx', 'ctrl-x̄', 'ctrl-σ', 'tip-h̄', 'upTime'];
    behavior.survivedFrac = survivedFrac;
    // Setup-specific descriptors finalized to a per-key dict. The
    // behavior-space archive bins on this — every rollout pushes one
    // (xKey, yKey) pair into the archive's grid.
    const setupBehavior = (setupBehaviorAccs && BF.behaviors.finalize)
      ? BF.behaviors.finalize(setupBehaviorAccs, setup.id)
      : null;
    return { fitness, state, upTime: upTimeAccum, behavior, setupBehavior };
  }

  // Run a single generation: evaluate everyone, sort, select + mutate.
  // When yieldEveryMs > 0, the eval loop awaits a setTimeout(0) every ~Nms so
  // the UI thread can render. Tests pass it as 0 (or omit it) to stay sync.
  async function step(trainer, yieldEveryMs) {
    // Fixed-baseline short-circuit. The policy is parameter-free and
    // deterministic, so there's nothing to evaluate or update -- the
    // policy a caller will pull via makePolicy is the same every gen.
    // Just bump the generation counter so the harness's loop terminates
    // on schedule. dodge-sweep.rolloutConfig re-runs the rollout from
    // scratch K times to gather metrics, so we never need to populate
    // bestEverFitness here; it stays at trainer init (-Infinity), which
    // dodge-sweep already renders as the string "-Infinity" via its
    // isFinite guard.
    if (trainer.params.mode === 'fixed') {
      trainer.generation = (trainer.generation || 0) + 1;
      trainer.currentStage = 'idle (fixed baseline)';
      return;
    }
    const t0 = BF.util.nowMs();
    let evals = 0;
    trainer.currentStage = 'preparing generation';
    const rollouts = Math.max(1, trainer.params.rolloutsPerAgent | 0);
    // Pre-sample one set of starting angles for THIS generation. All agents
    // in the gen evaluate against the SAME `angles` array, so selection
    // compares apples-to-apples within the gen.
    //
    // Angle policy: deterministic magnitudes, optional random side. The
    // tilt slider's value is THE magnitude — not a range to randomize
    // within. The previous "stratified centers + ±0.4·stratum jitter"
    // turned the per-gen evaluation into a moving target: agent A scored
    // 64 in gen 50 because its angles happened to fall on the lucky
    // band, then scored 12 in gen 51 because the jitter rolled
    // unfavorably. Selection pressure was tracking angle luck, not
    // skill — exactly the "stuck-at-12 with peak preview 64" symptom.
    //
    //   rollouts=1, dir='left':  always [-mag]
    //   rollouts=1, dir='right': always [+mag]
    //   rollouts=1, dir='both':  random sign per gen × mag (the only
    //                            randomness left, and even this could be
    //                            removed if the user wants)
    //   rollouts=N>1, dir='both':  linspace(-mag, +mag, N) — extremes
    //                              + interior, deterministic
    //   rollouts=N>1, dir='left':  linspace(-mag, 0, N)
    //   rollouts=N>1, dir='right': linspace(0, +mag, N)
    //
    // Net effect: the same agent gets the same angle profile every gen.
    // Fitness fluctuations now reflect mutation outcomes, not roll of
    // the angle dice. For sparse-reward tasks (golf), set rollouts=2
    // with dir='both' to get a clean two-sided test every gen.
    // Resolve the per-gen tilt magnitude the same way instantiateSetup
    // does so the pre-sampled angle array tracks any active curriculum
    // ramp on startTiltDeg / startAngleRange. Order: deg overlay first
    // (preferred new path), then legacy rad overlay, then raw param.
    const _curriculumOverlay = computeCurriculumOverlay(trainer);
    let range = trainer.params.startAngleRange != null
      ? trainer.params.startAngleRange
      : 0.1;
    if (_curriculumOverlay.startAngleRange != null) {
      range = _curriculumOverlay.startAngleRange;
    }
    if (_curriculumOverlay.startTiltDeg != null) {
      range = _curriculumOverlay.startTiltDeg * Math.PI / 180;
    }
    const tiltDir = trainer.params.tiltDirection || 'both';
    // For one-sided tilt directions ('left' / 'right'), the multi-rollout
    // span stays STRICTLY on the chosen side -- it does not include 0.
    // Previously dir='left' rolls=2 produced [-range, 0], which mixed a
    // full-left start with an upright start; the upright sample then
    // visually swings to the right under gravity, making it look like
    // "left only" was producing right-side starts. Now the span on a
    // one-sided direction is from -range to -range/rolls (or +range/rolls
    // to +range), so every rollout starts on the requested side with
    // varying magnitude.
    const lo = tiltDir === 'right' ? range / Math.max(1, rollouts)
             : tiltDir === 'left'  ? -range
             :                       -range;
    const hi = tiltDir === 'left'  ? -range / Math.max(1, rollouts)
             : tiltDir === 'right' ?  range
             :                        range;
    const angles = [];
    if (rollouts === 1) {
      if (tiltDir === 'left') {
        angles.push(-range);
      } else if (tiltDir === 'right') {
        angles.push(range);
      } else {
        // 'both' — random sign × magnitude, only the SIDE varies. Keeps
        // the agent seeing both sides over generations without making
        // the magnitude itself a moving target.
        const sign = trainer.rng.next() < 0.5 ? -1 : 1;
        angles.push(sign * range);
      }
    } else {
      // Multi-rollout: linspace from lo to hi, deterministic. For one-
      // sided dirs the span never crosses 0; for 'both' it covers
      // [-range, +range] so the policy sees both extremes.
      if (rollouts === 2) {
        angles.push(lo, hi);
      } else {
        for (let r = 0; r < rollouts; r++) {
          const t = r / (rollouts - 1);
          angles.push(lo + (hi - lo) * t);
        }
      }
    }
    // Explicit rollout angles bypass instantiateSetup's random-start branch.
    // Apply the requested spread here, once per rollout, so all candidates,
    // Hall-of-Fame rescoring and parallel workers see the SAME perturbed starts.
    // With zero spread the deterministic historical angle/RNG sequence is intact.
    const tiltSpread = Math.max(0, _curriculumOverlay.startTiltSpreadDeg != null
      ? _curriculumOverlay.startTiltSpreadDeg : (trainer.params.startTiltSpreadDeg || 0)) * Math.PI / 180;
    if (tiltSpread > 0) for (let r = 0; r < angles.length; r++) {
      angles[r] = BF.util.clampStartAngle(angles[r] + trainer.rng.range(-tiltSpread, tiltSpread), tiltDir);
    }
    // Pre-sample one set of hole-center jitters for THIS generation,
    // applied per-rollout if holeCenterJitterOn. All agents in the gen
    // see the SAME jitter sequence so selection compares apples-to-
    // apples within the gen. When off, jitters are all zero (no-op).
    const holeJitters = [];
    {
      // Resolve the jitter MAGNITUDE through the curriculum overlay so a
      // holeCenterJitterMag ramp actually takes effect (start with a fixed hole,
      // widen the ±position range as the policy generalizes). Falls back to the
      // raw param when it isn't ramped.
      const _ovl = computeCurriculumOverlay(trainer);
      const jitterOn = !!trainer.params.holeCenterJitterOn;
      const rawMag = (_ovl.holeCenterJitterMag != null) ? _ovl.holeCenterJitterMag : trainer.params.holeCenterJitterMag;
      const mag = Math.max(0, rawMag || 0);
      for (let r = 0; r < rollouts; r++) {
        holeJitters.push(jitterOn && mag > 0 ? trainer.rng.range(-mag, mag) : 0);
      }
    }
    // A small per-hidden-node cost lets users explicitly prefer simpler graphs.
    // Default 0 = no behavior change; set >0 to break ties in favor of fewer
    // hidden nodes. This is what NEAT-style algorithms usually call a
    // "complexity regularizer".
    const cxPenalty = trainer.params.complexityPenalty || 0;
    const mixPenalty = trainer.params.mixturePenalty || 0;
    const yieldEvery = yieldEveryMs || 0;
    let lastYield = BF.util.nowMs();
    trainer.currentStage = `evaluating population (gen ${trainer.generation})`;
    const popSize = trainer.population.length;
    // Resolve the active setup once per gen — used inside the per-individual
    // loop for the behavior-archive update (which needs setup.id to look
    // up descriptors). Cached because BF.setups.getSetup is a Map lookup
    // but we still avoid calling it per-individual.
    const setupForGen = BF.setups.getSetup(trainer.setupId);
    // Adversarial-env mode: lazily build the env pop the first time the
    // toggle is on, then sample one env per rollout for an overlay on the
    // physics knobs. Each env's average controller fitness is accumulated
    // here and converted to env fitness in evolveEnvPop after the gen.
    const adversarialOn = !!trainer.params.adversarialOn;
    if (adversarialOn && !trainer.envPop) {
      trainer.envPop = BF.adversarial.create({
        popSize:       trainer.params.adversarialEnvPopSize,
        mutationSigma: trainer.params.adversarialMutationSigma,
        rng:           trainer.rng,
      });
    }

    // Behavior-space archive: a 2D grid binned on user-picked descriptor
    // axes. Entries are kept across generations so the heatmap shows
    // historical exploration coverage, not just the current gen. Archive
    // is reset on setup change / new run.
    const archive = trainer.behaviorArchive;
    // Per-individual setup-behavior accumulators (one entry per rollout
    // gets averaged). Used for both archive update and the
    // current-generation scatter overlay.
    const lastSetupBehaviors = [];
    // Diagnostic logging: enabled by setting window.BF_DEBUG_EVAL=true
    // in DevTools BEFORE clicking Train. Logs each individual's start
    // + completion so a hard freeze can be pinpointed -- the last log
    // before the freeze tells us which individual / step blocked the
    // event loop. Costs essentially zero when the flag is off (one
    // boolean check per individual).
    const _debugEval = (typeof window !== 'undefined' && window.BF_DEBUG_EVAL);
    if (_debugEval) {
      console.log('[BF.step] start gen=' + trainer.generation
        + ' pop=' + popSize + ' rollouts=' + rollouts
        + ' obsCount=' + setupForGen.observationCount
        + ' policy=' + trainer.params.policyType);
    }
    // Parallel eval fast path. Used when:
    //   - trainer.pool is attached (app.js created it on toggle)
    //   - no adversarial co-evolution (the parallel path doesn't yet
    //     thread sample/record back through trainer.envPop -- it'd
    //     need per-task overlay + sampledEnvIdx round-tripping)
    // Behavior + setup-behavior accumulation matches the serial loop
    // exactly; ind.fitness / fitnessStd / consistency are derived
    // from per-rollout fitness the same way.
    const useParallel = !!(trainer.pool && !adversarialOn);
    if (useParallel) {
      // Pre-sample one disturbance RNG seed per ROLLOUT for this gen.
      // Every individual at rollout r gets the SAME seed -- so all
      // genomes compete on the identical disturbance pattern,
      // independent of which worker happens to run them. Without this,
      // each worker's local rng diverged across gens and the same
      // genome could score very differently on retry, making the
      // selection signal noisier than the serial path and slowing
      // convergence (user reported "more iterations to land on the
      // same state as before" + "lot more straight lines in the
      // generational fitness graph"). The main-thread trainer.rng
      // advances by `rollouts` ints per gen, keeping the gen-to-gen
      // seed sequence deterministic for reproducibility.
      const rolloutSeeds = new Array(rollouts);
      for (let r = 0; r < rollouts; r++) {
        // 31-bit positive int. Mulberry32 takes any uint32; we use
        // unsigned-friendly values so seed(0) etc. don't degenerate.
        rolloutSeeds[r] = (trainer.rng.int(0x7fffffff) | 0) || 1;
      }
      // CRITICAL: capture the main thread's CURRENT curriculum state
      // and pass it to every worker task. Workers' trainers were
      // makeTrainer'd at toggle-on time with level=0 + start-of-curriculum
      // currentGravity/currentDamping, and the main thread never
      // broadcast level advancements -- so before this fix workers
      // evaluated at the WRONG physics regardless of how far training
      // had progressed. Two channels matter:
      //
      //   level: drives computeCurriculumOverlay() (gravity/damping/...
      //     specs in trainer.params.curriculumSpecs).
      //   currentGravity / currentDamping: the LEGACY ramped values
      //     used by instantiateSetup as a FALLBACK when the user has
      //     no curriculum spec for that param. Without these the
      //     worker simulates with ~3x the main thread's damping at
      //     level 17 (the legacy ramp halves damping each level),
      //     which is enough physics difference to make worker fitness
      //     systematically wrong and selection target the easier task.
      const curLevel = (trainer.curriculum && trainer.curriculum.level) || 0;
      const curGravity = trainer.curriculum ? trainer.curriculum.currentGravity : trainer.params.gravity;
      const curDamping = trainer.curriculum ? trainer.curriculum.currentDamping : trainer.params.damping;
      // Build the full (popSize × rollouts) task list. Each task
      // carries the genome (NEAT) or genome+params+config (CNN) plus
      // the angle and per-rollout overlays the serial loop would
      // mutate onto `trainer` before evaluatePolicy.
      const tasks = new Array(popSize * rollouts);
      const taskIndOf = new Array(tasks.length);
      const taskRollOf = new Array(tasks.length);
      let taskIdx = 0;
      // The MAIN THREAD's resolved policy architecture, carried on every task.
      // See resolvedPolicyConfig: without it a worker falls back to whatever it
      // resolved at pool-init time, and the recurrent sever ablation (which
      // changes the config with no trainer rebuild and no pool re-init) made
      // parallel eval silently score the un-severed policy.
      const taskPolicyConfig = resolvedPolicyConfig(trainer);
      for (let pi = 0; pi < popSize; pi++) {
        const ind = trainer.population[pi];
        if (!ind._rolloutFits || ind._rolloutFits.length !== rollouts) {
          ind._rolloutFits = new Float64Array(rollouts);
        }
        for (let r = 0; r < rollouts; r++) {
          tasks[taskIdx] = {
            genome: ind.genome,
            params: ind.params || null,
            config: ind.config || taskPolicyConfig,
            angle: angles[r],
            holeJitter: holeJitters[r] || 0,
            envOverlay: null,
            // Worker reseeds its trainer.rng with this before the
            // evaluatePolicy call. Same seed across all individuals
            // at the same rollout r -> identical disturbance pattern
            // -> fair within-gen comparison.
            seed: rolloutSeeds[r],
            // Per-rollout dodge bullet-pattern seed. Computed on the main
            // thread from (run seed, gen, rollout) and applied on the worker
            // to trainer._dodgeSeed so the parallel + serial paths face the
            // IDENTICAL pattern. Only the dodge setup consumes it. The
            // dodgeFixedPatternSeed debug knob pins it to one constant seed to
            // reproduce the pre-fix "one fixed pattern all run" behavior.
            dodgeSeed: (trainer.params.dodgeFixedPatternSeed != null)
              ? (trainer.params.dodgeFixedPatternSeed | 0)
              : dodgePatternSeedFor(trainer.seed, trainer.generation, r),
            // Tells the worker which curriculum level to evaluate at,
            // and supplies the LEGACY ramped values for params that
            // have no curriculum spec (damping in particular). Without
            // these, workers were running with stale start-of-run
            // values forever and the simulation physics diverged from
            // the main thread.
            level: curLevel,
            currentGravity: curGravity,
            currentDamping: curDamping,
          };
          taskIndOf[taskIdx]  = pi;
          taskRollOf[taskIdx] = r;
          taskIdx++;
        }
      }
      // Dispatch + await. fullResults: true so behavior + setup-
      // behavior come back per task. The serial fallback hits the
      // same evaluatePolicy path on the main thread (used when the
      // pool reverts to serial mode, e.g. file:// blocked Workers).
      const results = await trainer.pool.evalBatch(tasks, {
        fullResults: true,
        serialFallbackFn: (task) => {
          // Serial fallback runs on the main thread, so trainer.curriculum
          // already has the right level/currentGravity/currentDamping --
          // no need to override. Just consume the per-task seed +
          // overlays so disturbance patterns match the parallel path.
          trainer._envOverlay = task.envOverlay || null;
          trainer._holeJitter = task.holeJitter || 0;
          trainer._dodgeSeed = (task.dodgeSeed != null ? task.dodgeSeed : null);
          if (task.seed != null) trainer.rng.seed(task.seed);
          const target = task.params
            ? { genome: task.genome, params: task.params, config: task.config || null }
            : { genome: task.genome };
          const res = evaluatePolicy(trainer, target, false, task.angle, task.level);
          trainer._envOverlay = null;
          trainer._holeJitter = 0;
          trainer._dodgeSeed = null;
          return res || { fitness: 0 };
        },
      });
      evals += tasks.length;
      // Distribute results back onto each individual. Mirror the
      // serial loop's accumulation: per-rollout fitness, behavior
      // averaging, setup-behavior averaging, archive updates.
      const perIndState = new Array(popSize);
      for (let pi = 0; pi < popSize; pi++) {
        perIndState[pi] = {
          total: 0,
          behaviorSum: null,
          setupBehaviorSum: null,
          setupBehaviorKeys: null,
        };
      }
      for (let k = 0; k < results.length; k++) {
        const res = results[k];
        const pi = taskIndOf[k];
        const r  = taskRollOf[k];
        const ind = trainer.population[pi];
        const st  = perIndState[pi];
        const f   = res && isFinite(res.fitness) ? res.fitness : 0;
        st.total += f;
        ind._rolloutFits[r] = f;
        if (res && res.behavior) {
          if (!st.behaviorSum) {
            st.behaviorSum = new Float64Array(res.behavior.length);
          }
          for (let j = 0; j < st.behaviorSum.length; j++) {
            st.behaviorSum[j] += res.behavior[j];
          }
        }
        if (res && res.setupBehavior) {
          if (!st.setupBehaviorKeys) st.setupBehaviorKeys = Object.keys(res.setupBehavior);
          if (!st.setupBehaviorSum) {
            st.setupBehaviorSum = {};
            for (const kk of st.setupBehaviorKeys) st.setupBehaviorSum[kk] = 0;
          }
          for (const kk of st.setupBehaviorKeys) {
            st.setupBehaviorSum[kk] += res.setupBehavior[kk] || 0;
          }
        }
      }
      // Finalize each individual (fitness, std/consistency, behavior
      // averaging, archive update) -- same logic as the serial branch
      // below.
      for (let pi = 0; pi < popSize; pi++) {
        const ind = trainer.population[pi];
        const st  = perIndState[pi];
        let fit = st.total / rollouts;
        if (cxPenalty > 0) {
          const hidden = ind.genome.nodes.filter(n => n.kind === 'hidden').length;
          fit -= cxPenalty * hidden;
        }
        if (mixPenalty > 0) {
          fit -= mixPenalty * BF.neat.mixtureExtraCount(ind.genome);
        }
        ind.fitness = fit;
        if (rollouts >= 2) {
          let sum = 0;
          for (let r = 0; r < rollouts; r++) sum += ind._rolloutFits[r];
          const mean = sum / rollouts;
          let varSum = 0;
          for (let r = 0; r < rollouts; r++) {
            const d = ind._rolloutFits[r] - mean;
            varSum += d * d;
          }
          ind.fitnessStd = Math.sqrt(varSum / rollouts);
          ind.consistency = -ind.fitnessStd;
        } else {
          ind.fitnessStd = 0;
          ind.consistency = 0;
        }
        if (st.behaviorSum) {
          for (let j = 0; j < st.behaviorSum.length; j++) st.behaviorSum[j] /= rollouts;
          ind.behavior = st.behaviorSum;
        }
        if (st.setupBehaviorSum) {
          const avg = {};
          for (const kk of st.setupBehaviorKeys) avg[kk] = st.setupBehaviorSum[kk] / rollouts;
          ind.setupBehavior = avg;
          lastSetupBehaviors.push({ values: avg, fitness: fit, individualIndex: pi });
          if (archive && archive.xKey && archive.yKey
              && archive.setupId === setupForGen.id
              && BF.behaviors) {
            const xv = avg[archive.xKey];
            const yv = avg[archive.yKey];
            if (xv != null && yv != null) {
              updateBehaviorArchive(archive, xv, yv, fit, trainer.generation, ind);
            }
          }
        }
        trainer.evalProgress = (pi + 1) / popSize;
      }
    }
    // Serial path: runs when parallel is unavailable / disabled, OR
    // when a feature the parallel path doesn't support (adversarial)
    // is active. The two paths produce identical bookkeeping on each
    // individual so downstream sort / selection / retro-eval don't
    // care which ran.
    for (let pi = 0; pi < popSize && !useParallel; pi++) {
      const ind = trainer.population[pi];
      let total = 0;
      let behaviorSum = null;
      let setupBehaviorSum = null;
      let setupBehaviorKeys = null;
      if (_debugEval) {
        const conns = ind.genome ? (ind.genome.conns ? ind.genome.conns.length : '?') : '-';
        const nodes = ind.genome ? (ind.genome.nodes ? ind.genome.nodes.length : '?') : '-';
        console.log('[BF.step] ind ' + pi + ' start (nodes=' + nodes + ' conns=' + conns + ')');
      }
      const _indStart = BF.util.nowMs();
      // Per-rollout fitness samples for this individual. Used by the
      // optional Pareto consistency objective (rollout-stability =
      // lower std-dev across rollouts). Allocated once per pop entry,
      // overwritten each gen so memory stays bounded.
      if (!ind._rolloutFits || ind._rolloutFits.length !== rollouts) {
        ind._rolloutFits = new Float64Array(rollouts);
      }
      for (let r = 0; r < rollouts; r++) {
        // Adversarial: sample one env, install its overlay for this rollout
        // only. trainer._envOverlay is consulted by instantiateSetup +
        // evaluatePolicy and cleared before the next call.
        let sampledEnvIdx = null;
        if (adversarialOn && trainer.envPop) {
          const sample = BF.adversarial.sampleEnv(trainer.envPop, trainer.rng);
          sampledEnvIdx = sample.idx;
          trainer._envOverlay = BF.adversarial.envOverlay(sample.env, trainer.params);
        }
        // Per-rollout hole jitter (if enabled). Consumed by
        // instantiateSetup when computing the world's holeCenter,
        // cleared after so subsequent rollouts get their own value.
        trainer._holeJitter = holeJitters[r] || 0;
        // Per-rollout dodge bullet-pattern seed (same derivation the parallel
        // path broadcasts) so serial + parallel face the identical pattern and
        // the policy trains against varied patterns, not one fixed sequence.
        // dodgeFixedPatternSeed pins it to reproduce the pre-fix behavior.
        trainer._dodgeSeed = (trainer.params.dodgeFixedPatternSeed != null)
          ? (trainer.params.dodgeFixedPatternSeed | 0)
          : dodgePatternSeedFor(trainer.seed, trainer.generation, r);
        // Pass the whole individual so makePolicy can dispatch on policyType
        // (CNN reads ind.params; NEAT reads ind.genome).
        const result = evaluatePolicy(trainer, ind, false, angles[r]);
        // Clear overlay; next rollout (if any) re-samples.
        trainer._envOverlay = null;
        trainer._holeJitter = 0;
        trainer._dodgeSeed = null;
        if (adversarialOn && sampledEnvIdx != null) {
          BF.adversarial.recordResult(trainer.envPop, sampledEnvIdx, result.fitness);
        }
        total += result.fitness;
        ind._rolloutFits[r] = result.fitness;
        if (result.behavior) {
          if (!behaviorSum) {
            behaviorSum = new Float64Array(result.behavior.length);
          }
          for (let j = 0; j < behaviorSum.length; j++) behaviorSum[j] += result.behavior[j];
        }
        // Setup-specific descriptors: accumulate across rollouts so the
        // archive bins on the average policy behavior, not a single noisy
        // rollout. Keys are set the first time we see a result.
        if (result.setupBehavior) {
          if (!setupBehaviorKeys) setupBehaviorKeys = Object.keys(result.setupBehavior);
          if (!setupBehaviorSum) {
            setupBehaviorSum = {};
            for (const k of setupBehaviorKeys) setupBehaviorSum[k] = 0;
          }
          for (const k of setupBehaviorKeys) {
            setupBehaviorSum[k] += result.setupBehavior[k] || 0;
          }
        }
        evals++;
      }
      let fit = total / rollouts;
      if (cxPenalty > 0) {
        const hidden = ind.genome.nodes.filter(n => n.kind === 'hidden').length;
        fit -= cxPenalty * hidden;
      }
      if (mixPenalty > 0) {
        fit -= mixPenalty * BF.neat.mixtureExtraCount(ind.genome);
      }
      ind.fitness = fit;
      // Rollout consistency: negative std-dev of per-rollout fitness.
      // Negative so higher = more consistent, matching the "maximize"
      // semantics of fitness / novelty in Pareto sort. With rollouts<2
      // the metric collapses to 0 (no variance to measure); the Pareto
      // sort then treats consistency as a tie everywhere -- no behavior
      // change. We always compute it (cheap, ~6 floats) so the trainer
      // exposes it for diagnostics even when Pareto's not using it.
      if (rollouts >= 2) {
        let sum = 0;
        for (let r = 0; r < rollouts; r++) sum += ind._rolloutFits[r];
        const mean = sum / rollouts;
        let varSum = 0;
        for (let r = 0; r < rollouts; r++) {
          const d = ind._rolloutFits[r] - mean;
          varSum += d * d;
        }
        ind.fitnessStd = Math.sqrt(varSum / rollouts);
        ind.consistency = -ind.fitnessStd;
      } else {
        ind.fitnessStd = 0;
        ind.consistency = 0;
      }
      // Average behavior features across rollouts. Stored as a plain array
      // so PCA can read it like any other feature vector.
      if (behaviorSum) {
        for (let j = 0; j < behaviorSum.length; j++) behaviorSum[j] /= rollouts;
        ind.behavior = behaviorSum;
      }
      if (setupBehaviorSum) {
        const avg = {};
        for (const k of setupBehaviorKeys) avg[k] = setupBehaviorSum[k] / rollouts;
        ind.setupBehavior = avg;
        lastSetupBehaviors.push({ values: avg, fitness: fit, individualIndex: pi });
        // Live archive update — bins on whichever (xKey, yKey) the user
        // currently has selected. Empty/null archive skips silently.
        if (archive && archive.xKey && archive.yKey
            && archive.setupId === setupForGen.id
            && BF.behaviors) {
          const xv = avg[archive.xKey];
          const yv = avg[archive.yKey];
          if (xv != null && yv != null) {
            updateBehaviorArchive(archive, xv, yv, fit, trainer.generation, ind);
          }
        }
      }
      trainer.evalProgress = (pi + 1) / popSize;
      if (_debugEval) {
        const ms = (BF.util.nowMs() - _indStart).toFixed(1);
        console.log('[BF.step] ind ' + pi + ' done in ' + ms + 'ms, fitness=' + ind.fitness.toFixed(3));
      }
      // Cooperative scheduling: yield to the event loop periodically so the
      // browser can render frames. Without this, a long generation freezes
      // the UI for hundreds of milliseconds at a time.
      if (yieldEvery > 0 && BF.util.nowMs() - lastYield > yieldEvery) {
        await new Promise(r => setTimeout(r, 0));
        lastYield = BF.util.nowMs();
      }
    }
    // Expose this gen's setup-specific behaviors so the renderer can
    // overlay current-gen scatter on the archive heatmap. Replaced
    // wholesale each gen — old gens are not retained on the trainer
    // (the archive carries history; this is the live snapshot only).
    trainer.lastSetupBehaviors = lastSetupBehaviors;
    trainer.currentStage = 'selecting + computing stats';
    trainer.population.sort((a, b) => b.fitness - a.fitness);
    // Snapshot raw (current-level) fitness on each entry BEFORE any
    // retro-eval blending so downstream code / display can always read
    // the unblended number. `fitness` becomes the (possibly blended)
    // value used for selection.
    for (const ind of trainer.population) {
      ind.fitnessRaw = ind.fitness;
      ind.retroFitness = null;
      ind.retroLevel = null;
    }
    // Retro-eval pass. Only meaningful when:
    //   - feature toggle is on
    //   - curriculum is on AND we're at level >= 1 (i.e. there's a
    //     prior level to retro against)
    //   - this gen falls on the cadence (generation % everyGens == 0)
    // We pick a uniformly-random previous level (0..currentLevel-1) and
    // re-evaluate the top-N policies at that level. The selected level
    // is recorded so the user can see "tested at L2" alongside the
    // retro fitness in the chart/badge.
    const retroOn = !!trainer.params.retroEvalEnabled;
    const curLevel = trainer.curriculum ? (trainer.curriculum.level || 0) : 0;
    const retroEveryGens = Math.max(1, (trainer.params.retroEvalEveryGens | 0) || 5);
    const retroDueThisGen = retroOn
      && trainer.params.curriculumEnabled
      && curLevel >= 1
      && (trainer.generation % retroEveryGens === 0);
    let retroBestThisGen = null;
    let retroAvgThisGen  = null;
    let retroLevelThisGen = null;
    if (retroDueThisGen) {
      trainer.currentStage = 'retro-eval (catastrophic forgetting check)';
      const topN = Math.min(
        Math.max(1, (trainer.params.retroEvalTopN | 0) || 5),
        trainer.population.length
      );
      // Pick the retro level. Uniform across [0, curLevel - 1] gives
      // every prior level equal coverage over many retro-gens, which is
      // what we want for "is the policy robust across the curriculum
      // history?" rather than "robust to the level immediately prior".
      const retroLevel = trainer.rng.int(curLevel);
      retroLevelThisGen = retroLevel;
      let retroSum = 0, retroCnt = 0;
      let retroMaxV = -Infinity;
      // Match the main eval's per-policy rollout count so retro scores
      // are directly comparable to current-level fitness numbers (same
      // averaging, same noise floor). Uses the SAME pre-sampled angle
      // sequence we'd use this gen, so comparability is also angle-
      // controlled: any score delta reflects difficulty, not luck.
      const rollouts = Math.max(1, trainer.params.rolloutsPerAgent | 0);
      for (let i = 0; i < topN; i++) {
        const ind = trainer.population[i];
        let sum = 0;
        for (let r = 0; r < rollouts; r++) {
          // randomize=true so the start angle is sampled from the RETRO
          // level's overlay (e.g. a 5°-tilt prior level samples from
          // [-5°, +5°] regardless of how wide the current level is).
          // Carrying the current-level angles forward would start a
          // tilted policy at 90° on a level whose range is 5° -- the
          // policy would "fail" not from forgetting but from being
          // placed in an out-of-distribution state. Re-randomizing is
          // the cost of semantic correctness; the per-policy variance
          // is averaged out across `rollouts` and the top-N. Retro
          // evals don't add to the behavior archive or env-pop -- they
          // are a probe, not a training signal.
          const res = evaluatePolicy(trainer, ind, true, null, retroLevel);
          sum += res.fitness;
        }
        const rf = sum / rollouts;
        ind.retroFitness = rf;
        ind.retroLevel   = retroLevel;
        retroSum += rf;
        retroCnt += 1;
        if (rf > retroMaxV) retroMaxV = rf;
      }
      retroBestThisGen = retroMaxV;
      retroAvgThisGen  = retroCnt > 0 ? retroSum / retroCnt : null;
      // Blend retro into fitness for selection. Only top-N got retro'd;
      // the rest keep their raw fitness as their selection score. This
      // is honest: we don't have a retro measurement for them, so we
      // can't penalize them for catastrophic forgetting we haven't
      // probed for. The selection-pressure effect is concentrated on
      // the elites, which is also where it matters most (they shape
      // mutation lineage).
      const w = Math.max(0, Math.min(1, trainer.params.retroEvalSelectionWeight != null
        ? trainer.params.retroEvalSelectionWeight : 0.3));
      if (w > 0) {
        for (const ind of trainer.population) {
          if (ind.retroFitness != null) {
            ind.fitness = (1 - w) * ind.fitnessRaw + w * ind.retroFitness;
          }
        }
        // Re-sort: blending can demote a current-level leader that's
        // forgotten old levels, which is exactly the medicine retro is
        // supposed to deliver. Sort uses the new blended value.
        trainer.population.sort((a, b) => b.fitness - a.fitness);
      }
    }
    // Adversarial: evolve the env pop now that all controllers have been
    // evaluated against their sampled envs. Has to happen *after* the
    // controller eval loop but before the snapshot/stats so the new env
    // pop is the one stats reflect.
    if (adversarialOn && trainer.envPop) {
      BF.adversarial.evolveEnvPop(trainer.envPop, trainer.rng);
    }
    // Pareto-rank + crowding-distance pre-compute, used by the
    // selectAndMutate tournament when paretoSelectionEnabled. Done
    // here (post-retro, post-sort) so the ranks reflect the same
    // fitness values selection will read. The helper returns false
    // when behavior vectors aren't populated yet (very early gens);
    // selectAndMutate falls back to fitness tournament in that case.
    trainer._paretoReady = false;
    if (trainer.params.paretoSelectionEnabled) {
      trainer._paretoReady = paretoCompute(trainer);
      // Pareto-aware HoF: if also enabled, harvest rank-1 individuals
      // into the cumulative HoF reservoir. Sits AFTER paretoCompute
      // so paretoRank is set, but BEFORE selectAndMutate so the
      // current gen's insertions are already in place for any
      // downstream HoF consumer (display, future parent-source).
      if (trainer._paretoReady && trainer.params.paretoHoFEnabled) {
        maybeUpdateParetoHoF(trainer);
      }
    }
    const best = trainer.population[0];
    const worst = trainer.population[trainer.population.length - 1];
    const avg = trainer.population.reduce((s, p) => s + p.fitness, 0) / trainer.population.length;
    // Median is more robust to a single lucky outlier than `best`, which
    // is what makes it useful as a "is the whole population learning, or
    // is it just one weight roll" signal. Cheap because the population
    // is already sorted by fitness descending.
    const _midIdx = Math.floor(trainer.population.length / 2);
    const median = trainer.population.length > 0
      ? trainer.population[_midIdx].fitness
      : 0;

    let totalNodes = 0, totalConns = 0;
    const sigSet = new Set();
    for (const ind of trainer.population) {
      const s = N.stats(ind.genome);
      totalNodes += s.nodes;
      totalConns += s.enabledConns;
      sigSet.add(N.topologySignature(ind.genome));
    }
    trainer.lastFullNeatSpecies = trainer.params.mode === 'neat-full'
      ? speciatePopulation(trainer)
      : null;
    const speciesCount = trainer.lastFullNeatSpecies
      ? trainer.lastFullNeatSpecies.length
      : sigSet.size;
    if (trainer.params.mode === 'neat-full') {
      updateFullNeatCompatThreshold(trainer, speciesCount);
    }

    trainer.currentBest = best.genome;
    trainer.currentBestFitness = best.fitness;
    // Re-evaluate every Hall of Fame entry on this generation's scenes. With
    // hallOfFameSize=1 this is just the single best-ever — original behavior.
    // With K>1, runner-up champions also get re-evaluated; the highest of
    // them is what we compare current-gen best against. This kills the
    // "lucky linear genome locks in early" failure mode AND the more
    // insidious "fluky high-roll champion can't be reproduced" mode.
    function reevalGenomeFitness(target) {
      let total = 0;
      const savedHoleJitter = trainer._holeJitter;
      const savedDodgeSeed = trainer._dodgeSeed;
      try {
        for (let r = 0; r < rollouts; r++) {
          // Population evaluation clears these temporary values afterward.
          // Reinstall the SAME rollout: otherwise champions see the central
          // hole and one run-seeded terrain/bullet pattern while challengers
          // are scored on this generation's changing scenes.
          trainer._holeJitter = holeJitters[r] || 0;
          trainer._dodgeSeed = (trainer.params.dodgeFixedPatternSeed != null)
            ? (trainer.params.dodgeFixedPatternSeed | 0)
            : dodgePatternSeedFor(trainer.seed, trainer.generation, r);
          total += evaluatePolicy(trainer, target, false, angles[r]).fitness;
          evals++;
        }
      } finally {
        trainer._holeJitter = savedHoleJitter;
        trainer._dodgeSeed = savedDodgeSeed;
      }
      return total / rollouts;
    }
    let bestEverFresh = -Infinity;
    let bestHoFEntry = null;
    for (const entry of trainer.hallOfFame) {
      let target;
      if (trainer.params.policyType === 'cnn' && entry.params) {
        target = { genome: entry.genome, params: entry.params, config: trainer.cnnConfig };
      } else if (trainer.params.policyType === 'cnn3d' && entry.params) {
        target = { genome: entry.genome, params: entry.params, config: trainer.cnn3dConfig };
      } else if (trainer.params.policyType === 'cnn-grid' && entry.params) {
        target = { genome: entry.genome, params: entry.params, config: trainer.cnnGridConfig };
      } else if (trainer.params.policyType === 'cnn-multiscale' && entry.params) {
        target = { genome: entry.genome, params: entry.params, config: trainer.cnnMultiscaleConfig };
      } else if (trainer.params.policyType === 'recurrent' && entry.params) {
        target = { genome: entry.genome, params: entry.params, config: trainer.recurrentConfig };
      } else {
        target = entry.genome;
      }
      entry.lastFitness = reevalGenomeFitness(target);
      if (entry.lastFitness > bestEverFresh) {
        bestEverFresh = entry.lastFitness;
        bestHoFEntry = entry;
      }
    }
    if (trainer.params.curriculumEnabled && trainer.curriculum) {
      registerCurriculumPhaseBest(trainer, best.fitness, 'population');
      if (bestHoFEntry && isFinite(bestHoFEntry.lastFitness)) {
        registerCurriculumPhaseBest(trainer, bestHoFEntry.lastFitness, 'hall-of-fame');
      }
    }
    if (best.fitness > bestEverFresh) {
      const prevBest = trainer.bestEverFitness;
      trainer.bestEverFitness = best.fitness;
      trainer.bestEver = N.cloneGenome(best.genome);
      // Track params alongside genome so CNN policies can be re-evaluated /
      // played back even though their genome is just a placeholder.
      trainer.bestEverParams = best.params ? new Float64Array(best.params) : null;
      trainer.bestEverHistory.push({
        gen: trainer.generation,
        genome: N.cloneGenome(best.genome),
        params: best.params ? new Float64Array(best.params) : null,
        fitness: best.fitness,
      });
      // Insert into Hall of Fame (always at front; capped at size).
      const hofSize = Math.max(1, trainer.params.hallOfFameSize | 0);
      trainer.hallOfFame.unshift({
        genome: N.cloneGenome(best.genome),
        params: best.params ? new Float64Array(best.params) : null,
        fitness: best.fitness,
        lastFitness: best.fitness,
        gen: trainer.generation,
      });
      while (trainer.hallOfFame.length > hofSize) trainer.hallOfFame.pop();
      const isFirstUpdate = !isFinite(prevBest);
      // gensSinceImprovement gates stuck-escape (mutation reheat +
      // diversity inject when the GA stagnates). Reset it ONLY on
      // MEANINGFUL improvements -- otherwise micro-creep
      // (best 7.91 -> 7.94) would zero the counter every gen and
      // stuck-escape would never fire even when the GA is
      // practically stuck. Threshold: 5% relative OR 1.0 absolute,
      // whichever is larger; plus zero-crossing (going from
      // negative to positive) always counts.
      const meaningfulMargin = Math.max(1.0, Math.abs(prevBest) * 0.05);
      const crossedZero = prevBest <= 0 && best.fitness > 0;
      const significantImprovement = isFirstUpdate || crossedZero
                                     || best.fitness > prevBest + meaningfulMargin;
      if (significantImprovement) {
        trainer.gensSinceImprovement = 0;
      } else {
        // Tiny micro-improvement -- bestEver IS updated (we kept the
        // strongest genome above) but the stuck counter keeps
        // climbing so escape modes can detect "barely moving" as
        // distinct from "actively improving".
        trainer.gensSinceImprovement = (trainer.gensSinceImprovement || 0) + 1;
      }
      // Auto-checkpoint: silent save when best-ever improves by >1% (the
      // restore target for auto-rollback). First update always saves.
      const meaningfulJump = isFirstUpdate || best.fitness > prevBest * 1.01;
      if (meaningfulJump) {
        trainer.autoCheckpoint = saveCheckpoint(trainer);
      }
      // Chronicle improvements that exceed the previous bar by a
      // meaningful amount (5%) -- otherwise the log fills with
      // rounding wins.
      if (isFirstUpdate || best.fitness > prevBest * 1.05) {
        emitEvent(trainer, 'best',
          `new best-ever: ${best.fitness.toFixed(2)} (gen ${trainer.generation})`);
      }
    } else {
      // Keep the saved best-ever's reported fitness fresh so badges don't lie.
      // Also resync Hall of Fame ordering by lastFitness so the strongest
      // re-evaluated champion floats to position 0.
      trainer.bestEverFitness = bestEverFresh;
      trainer.gensSinceImprovement = (trainer.gensSinceImprovement || 0) + 1;
      if (bestHoFEntry && trainer.hallOfFame.length > 1) {
        trainer.hallOfFame.sort((a, b) => (b.lastFitness || -Infinity) - (a.lastFitness || -Infinity));
        // Resync canonical bestEver pointer to whichever HoF entry is
        // strongest THIS gen (with these angles).
        trainer.bestEver = N.cloneGenome(trainer.hallOfFame[0].genome);
        trainer.bestEverParams = trainer.hallOfFame[0].params
          ? new Float64Array(trainer.hallOfFame[0].params) : null;
      }
    }

    // Auto-rollback: monitor regression of current-gen best against best-ever.
    // When best-of-gen falls below threshold·best-ever for autoRollbackGens
    // consecutive generations, restore from the silent autoCheckpoint. Skips
    // until best-ever has been set at least once (no point rolling back to
    // nothing). Resets the run-counter after a restore so the next cascade
    // doesn't fire instantly.
    const rollbackCkptLevel = trainer.autoCheckpoint && trainer.autoCheckpoint.curriculum
      ? (trainer.autoCheckpoint.curriculum.level || 0)
      : null;
    const rollbackCurLevel = trainer.curriculum ? (trainer.curriculum.level || 0) : null;
    const rollbackSameCurriculumPhase = !trainer.params.curriculumEnabled
      || rollbackCkptLevel == null
      || rollbackCkptLevel === rollbackCurLevel;
    if (trainer.params.autoRollbackOn && trainer.autoCheckpoint && isFinite(trainer.bestEverFitness)
        && trainer.bestEverFitness > 0 && rollbackSameCurriculumPhase) {
      const thresh = trainer.params.autoRollbackThreshold != null
        ? trainer.params.autoRollbackThreshold : 0.5;
      const requiredGens = Math.max(2, trainer.params.autoRollbackGens | 0 || 15);
      const ratio = best.fitness / trainer.bestEverFitness;
      if (ratio < thresh) {
        trainer.regressionRunLen = (trainer.regressionRunLen || 0) + 1;
      } else {
        trainer.regressionRunLen = 0;
      }
      if (trainer.regressionRunLen >= requiredGens) {
        emitEvent(trainer, 'auto-rollback',
          `auto-rollback: best-of-gen ${best.fitness.toFixed(2)} < ${(thresh * 100).toFixed(0)}% of best-ever ${trainer.bestEverFitness.toFixed(2)} for ${requiredGens} gens — restoring`);
        restoreCheckpoint(trainer, trainer.autoCheckpoint);
        trainer.regressionRunLen = 0;
        trainer.gensSinceImprovement = 0;
      }
    } else if (!rollbackSameCurriculumPhase) {
      trainer.regressionRunLen = 0;
    }

    // ---- Convergence detector ------------------------------------------
    // Two-criterion adaptive auto-stop: training is "done" when the best
    // fitness has been (a) good enough — within reach of the theoretical
    // maximum — and (b) stable — small variance across a recent window —
    // for several consecutive generations. This catches plateaus that the
    // strict "no improvement" counter misses (because tiny improvements keep
    // resetting it) while still requiring real quality.
    if (!trainer.bestFitnessWindow) trainer.bestFitnessWindow = [];
    trainer.bestFitnessWindow.push(best.fitness);
    if (trainer.bestFitnessWindow.length > 12) trainer.bestFitnessWindow.shift();
    // Theoretical max — same heuristic the curriculum uses (~1.5 reward/sec).
    const theoMax = 1.5 * trainer.params.evalSeconds;
    const windowReady = trainer.bestFitnessWindow.length >= 8;
    let isStable = false, isGoodEnough = false;
    if (windowReady) {
      let mn = Infinity, mx = -Infinity;
      for (const v of trainer.bestFitnessWindow) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const range = mx - mn;
      // GA-aware stability: every NEAT generation has bad-mutant siblings,
      // and rollout-angle randomization makes even best-ever's re-eval jitter
      // by a few percent. A 2% range tolerance is below the natural noise
      // floor — convergence never triggers. Default to a more permissive
      // 10% range (user-tunable via autoStopTolerance) and let the user
      // tighten it for stricter detection.
      const tolerance = trainer.params.autoStopTolerance != null
        ? trainer.params.autoStopTolerance
        : 0.10;
      isStable = range < tolerance * Math.max(1, Math.abs(mx));
      isGoodEnough = best.fitness >= (trainer.params.autoStopGoodFraction || 0.6) * theoMax;
    }
    if (isStable && isGoodEnough) {
      trainer.gensConverged = (trainer.gensConverged || 0) + 1;
    } else {
      trainer.gensConverged = 0;
    }
    trainer.lastConvergence = {
      stable: isStable,
      goodEnough: isGoodEnough,
      windowReady: windowReady,
      gensConverged: trainer.gensConverged || 0,
    };

    // ---- Phase A: mode-specific bookkeeping (before snapshot) -----------
    // For SA: decide accept/reject per chain so the snapshot can color bars
    //         by acceptance; also lets the algorithm-internals chart pick up
    //         this gen's acceptance rate.
    // For CMA-ES: do the rank-1/rank-µ update now so saved σ in stats is the
    //             post-update value.
    // For PT: same as SA but per-chain T also gets used here.
    let saAccepts = null;
    if (trainer.params.mode === 'annealing' && trainer.annealing) {
      const T = trainer.annealing.currentT;
      saAccepts = new Array(trainer.population.length);
      let acceptedCount = 0;
      for (let i = 0; i < trainer.population.length; i++) {
        const ind = trainer.population[i];
        const delta = ind.fitness - ind.chainBest;
        const acc = ind.chainBest === -Infinity ||
                    BF.annealing.shouldAccept(delta, T, trainer.rng);
        saAccepts[i] = acc;
        if (acc) {
          ind.chainBest = ind.fitness;
          ind.chainBestParams = new Float64Array(ind.params);
          acceptedCount++;
        }
      }
      trainer.annealing.acceptCounts = {
        acceptedThisGen: acceptedCount,
        total: trainer.population.length,
      };
    }
    let ptAccepts = null;
    let ptSwapInfo = null;
    if (trainer.params.mode === 'pt' && trainer.pt) {
      const out = BF.pt.acceptAndSwap(trainer.pt, trainer.population, trainer.rng);
      ptAccepts = out.accepts;
      ptSwapInfo = out.swap;
    }
    if (trainer.params.mode === 'cmaes' && trainer.cmaes) {
      // The Jacobi eigendecomposition inside cmaes.update is O(n³) — at large
      // n (CNN policy with high resolution) this can take several seconds and
      // freezes the UI. Surface that in the stage so users know what's
      // happening rather than thinking the page hung.
      trainer.currentStage = `CMA-ES update (n=${trainer.cmaes.n}; eigendecomp may take a moment for large n)`;
      const evaluated = trainer.population.map(p => ({ params: p.params, fitness: p.fitness }));
      BF.cmaes.update(trainer.cmaes, evaluated);
    }
    if (trainer.params.mode === 'de' && trainer.de) {
      trainer.currentStage = 'DE: selecting trials';
      BF.de.selectTrials(trainer.de, trainer.population);
    }
    if (trainer.params.mode === 'pso' && trainer.pso) {
      trainer.currentStage = 'PSO: updating personal/global bests';
      BF.pso.updateBests(trainer.pso, trainer.population);
    }
    if (trainer.params.mode === 'cem' && trainer.cem) {
      trainer.currentStage = 'CEM: refitting Gaussian to elite';
      BF.cem.update(trainer.cem, trainer.population);
    }
    if (trainer.params.mode === 'fdgd' && trainer.fdgd) {
      trainer.currentStage = 'FD-GD: ∇ from probes + line search';
      BF.fdgd.update(trainer.fdgd, trainer.population);
    }
    if (trainer.params.mode === 'spsa' && trainer.spsa) {
      trainer.currentStage = 'SPSA: ∇ from perturbation pairs + line search';
      BF.spsa.update(trainer.spsa, trainer.population);
    }
    if (trainer.params.mode === 'nes' && trainer.nes) {
      trainer.currentStage = 'NES: REINFORCE update on μ';
      BF.nes.update(trainer.nes, trainer.population);
    }
    if (trainer.params.mode === 'adam' && trainer.adam) {
      trainer.currentStage = 'Adam: ∇ from SPSA pairs + per-dim adaptive step';
      BF.adam.update(trainer.adam, trainer.population);
    }
    if (trainer.params.mode === 'lbfgs' && trainer.lbfgs) {
      trainer.currentStage = 'L-BFGS: H⁻¹·∇ via two-loop recursion + line search';
      BF.lbfgs.update(trainer.lbfgs, trainer.population);
    }
    if (trainer.params.mode === 'xnes' && trainer.xnes) {
      trainer.currentStage = 'xNES: utility-weighted natural gradient (diag exp)';
      BF.xnes.update(trainer.xnes, trainer.population);
    }
    if (trainer.params.mode === 'sep-cmaes' && trainer.sepCmaes) {
      trainer.currentStage = 'sep-CMA-ES: diagonal covariance update';
      BF.sepCmaes.update(trainer.sepCmaes, trainer.population);
    }
    // Grey Wolf — tag the top 3 of the evaluated population so the snapshot
    // can render alpha/beta/delta with distinct outlines. Cuckoo / Whale /
    // Fish carry per-action tags directly off the population entries (set
    // when stepSwarm produced them last gen) so they don't need re-tagging.
    if (trainer.params.mode === 'greywolf' && trainer.greywolf) {
      const sorted = trainer.population.slice().sort((a, b) => b.fitness - a.fitness);
      for (const ind of trainer.population) ind.swarmRank = null;
      if (sorted[0]) sorted[0].swarmRank = 'alpha';
      if (sorted[1]) sorted[1].swarmRank = 'beta';
      if (sorted[2]) sorted[2].swarmRank = 'delta';
    }
    // Random Search has nothing to do in Phase A — no state to update.

    // Stats are computed AFTER Phase A so that mode-specific fields (CMA-ES σ
    // post-update, SA acceptance rate this gen, PT swap rate this gen) are
    // current. The chart and history pick these up immediately.
    const stats = {
      gen: trainer.generation,
      best: best.fitness,
      avg: avg,
      median: median,
      worst: worst.fitness,
      // Retro-eval signals. Non-null only on retro gens. retroBest /
      // retroAvg = top-N robustness at the sampled retro level; chart
      // renders them as sparse markers/lines alongside the dense
      // best/median curves. retroLevel surfaces which prior level the
      // probe used this gen.
      retroBest:  retroBestThisGen,
      retroAvg:   retroAvgThisGen,
      retroLevel: retroLevelThisGen,
      avgNodes: totalNodes / trainer.population.length,
      avgConns: totalConns / trainer.population.length,
      species: speciesCount,
      ms: BF.util.nowMs() - t0,
      evalsPerSec: evals / Math.max(0.001, (BF.util.nowMs() - t0) / 1000),
      // Stuck-escape diagnostics filled in AFTER selectAndMutate
      // (see end of step()). Initialized to safe defaults here so
      // early-exit code paths still produce a usable shape.
      mutScale:    1.0,
      mutMode:     'normal',
      injectCount: 0,
      gensSinceImprovement: trainer.gensSinceImprovement || 0,
      cmaesSigma: trainer.cmaes ? trainer.cmaes.sigma
                : trainer.sepCmaes ? trainer.sepCmaes.sigma : null,
      saT: trainer.annealing ? trainer.annealing.currentT : null,
      saAcceptRate: (trainer.annealing && trainer.annealing.acceptCounts)
        ? trainer.annealing.acceptCounts.acceptedThisGen / trainer.annealing.acceptCounts.total
        : null,
      ptSwapRate: (trainer.pt && trainer.pt.lastSwapAttempts > 0)
        ? trainer.pt.lastSwapAccepts / trainer.pt.lastSwapAttempts
        : null,
      deAcceptRate: (trainer.de && trainer.de.lastTotal > 0)
        ? trainer.de.lastAcceptCount / trainer.de.lastTotal
        : null,
      // PSO mean velocity magnitude — captures swarm "energy". Drops as the
      // swarm converges around the global best.
      cemSigma: trainer.cem ? trainer.cem.sigma : null,
      // Gradient-descent-family diagnostics. Same shape across FD-GD /
      // SPSA / NES / Adam so the algo-internals chart can pick whichever
      // is active. cmaesSigma is also populated for sep-CMA-ES (which
      // shares the σ concept).
      gdGradNorm:
        (trainer.fdgd  && trainer.fdgd.lastGradNorm  != null) ? trainer.fdgd.lastGradNorm  :
        (trainer.spsa  && trainer.spsa.lastGradNorm  != null) ? trainer.spsa.lastGradNorm  :
        (trainer.adam  && trainer.adam.lastGradNorm  != null) ? trainer.adam.lastGradNorm  :
        (trainer.lbfgs && trainer.lbfgs.lastGradNorm != null) ? trainer.lbfgs.lastGradNorm :
        (trainer.xnes  && trainer.xnes.lastGradNorm  != null) ? trainer.xnes.lastGradNorm  :
        (trainer.nes   && trainer.nes.lastGradNorm   != null) ? trainer.nes.lastGradNorm   : null,
      gdAlpha:
        (trainer.fdgd)  ? trainer.fdgd.alpha :
        (trainer.spsa)  ? trainer.spsa.alpha :
        (trainer.adam)  ? trainer.adam.learningRate :
        (trainer.lbfgs) ? trainer.lbfgs.alpha : null,
      gdAccepted:
        (trainer.fdgd)  ? (trainer.fdgd.lastAccepted ? 1 : 0) :
        (trainer.spsa)  ? (trainer.spsa.lastAccepted ? 1 : 0) :
        (trainer.lbfgs) ? (trainer.lbfgs.lastAccepted ? 1 : 0) : null,
      nesSigma: trainer.nes ? trainer.nes.sigma : null,
      neatCompatThreshold: trainer.neatCompatThresholdCurrent != null
        ? trainer.neatCompatThresholdCurrent : null,
      // Swarm-family per-mode diagnostics. Each only meaningful for one mode;
      // the algo-internals chart picks whichever the active mode reads.
      cuckooMaxJump:    trainer.cuckoo   ? trainer.cuckoo.lastMaxJump        : null,
      cuckooReplaced:   trainer.cuckoo   ? trainer.cuckoo.lastReplacements   : null,
      whaleSpiral:      trainer.whale    ? trainer.whale.lastSpiralCount     : null,
      whaleEncircle:    trainer.whale    ? trainer.whale.lastEncircleCount   : null,
      whaleExplore:     trainer.whale    ? trainer.whale.lastExploreCount    : null,
      fishPrey:         trainer.fish     ? trainer.fish.lastPrey             : null,
      fishSwarmCnt:     trainer.fish     ? trainer.fish.lastSwarm            : null,
      fishFollow:       trainer.fish     ? trainer.fish.lastFollow           : null,
      fishRandomCnt:    trainer.fish     ? trainer.fish.lastRandom           : null,
      gwoAlphaFitness:  trainer.greywolf ? trainer.greywolf.lastAlphaFitness : null,
      acoArchiveSize:   trainer.aco      ? (trainer.aco.archive ? trainer.aco.archive.length : 0) : null,
      fireflyMaxAttr:   trainer.firefly  ? trainer.firefly.lastMaxAttraction : null,
      batMeanLoudness:  trainer.bat      ? trainer.bat.lastMeanLoudness      : null,
      batMeanPulse:     trainer.bat      ? trainer.bat.lastMeanPulse         : null,
      // Adversarial diagnostics — only meaningful when adversarialOn.
      advHardestFit:    trainer.envPop ? trainer.envPop.lastHardestFitness : null,
      advSoftestFit:    trainer.envPop ? trainer.envPop.lastSoftestFitness : null,
      advDiversity:     trainer.envPop ? trainer.envPop.lastDiversity      : null,
      // Generalized curriculum: current level + max so the badge / HUD
      // can show "level 3/10" while training.
      curriculumLevel:    trainer.curriculum ? (trainer.curriculum.level || 0) : null,
      curriculumMaxLevel: trainer.params.curriculumMaxLevel || 10,
      curriculumPhaseBest: (trainer.curriculum && isFinite(trainer.curriculum.phaseBestFitness))
        ? trainer.curriculum.phaseBestFitness : null,
      curriculumPhaseBestGen: trainer.curriculum ? trainer.curriculum.phaseBestGen : null,
      psoMeanVel: (trainer.pso && trainer.population && trainer.population[0] && trainer.population[0].velocity)
        ? (function () {
            let s = 0;
            for (const p of trainer.population) {
              let n = 0;
              for (let j = 0; j < p.velocity.length; j++) n += p.velocity[j] * p.velocity[j];
              s += Math.sqrt(n);
            }
            return s / trainer.population.length;
          })()
        : null,
      // Mutation event counts for the *previous* gen's NEAT mutation pass.
      // (Current gen's pass happens later in Phase B; we'll record those as
      //  lastMutationEvents and pick them up next iteration.)
      mutWeight: trainer.lastMutationEvents ? trainer.lastMutationEvents.weight : null,
      mutBias: trainer.lastMutationEvents ? trainer.lastMutationEvents.bias : null,
      mutAddConn: trainer.lastMutationEvents ? trainer.lastMutationEvents.addConn : null,
      mutAddNode: trainer.lastMutationEvents ? trainer.lastMutationEvents.addNode : null,
      mutToggle: trainer.lastMutationEvents ? trainer.lastMutationEvents.toggle : null,
      mutAct: trainer.lastMutationEvents ? trainer.lastMutationEvents.act : null,
    };
    trainer.lastStats = stats;
    trainer.history.push(stats);
    if (trainer.history.length > 600) trainer.history.shift();
    // Per-level rollup. We unconditionally maintain the bucket -- even
    // when curriculum is off there's always a level-0 bucket, which
    // makes the HUD chart trivially renderable in both modes.
    if (trainer.curriculum) {
      const c = trainer.curriculum;
      if (!c.perLevelStats) c.perLevelStats = [];
      let bucket = c.perLevelStats[c.perLevelStats.length - 1];
      if (!bucket || bucket.level !== (c.level || 0)) {
        bucket = {
          level: c.level || 0,
          startGen: trainer.generation,
          endGen: null,
          maxBest:   -Infinity, minBest:   Infinity,
          maxMedian: -Infinity, minMedian: Infinity,
          // Retro-eval aggregates for this level. Tracks the
          // distribution of retro-probe results recorded while the
          // curriculum was at this level. maxRetro is the best retro
          // score we ever saw here; meanRetro answers "average
          // robustness on prior levels while at this one". Used by
          // the per-level mini-chart to overlay retro dots on the
          // best-fitness bars -- a level whose retro is far below
          // its max best is one where the policy got specialized
          // and forgot earlier levels.
          maxRetro:   -Infinity,
          retroSum:    0,
          retroCount:  0,
          gens: [],
        };
        c.perLevelStats.push(bucket);
      }
      const point = {
        gen: trainer.generation,
        best: best.fitness, avg, median, worst: worst.fitness,
        // retroBestThisGen / retroLevelThisGen are non-null only on
        // retro gens; null on other gens. Captured in the per-gen
        // point so the renderer can later sparkline retro across the
        // bucket if needed.
        retroBest:  retroBestThisGen,
        retroLevel: retroLevelThisGen,
      };
      bucket.gens.push(point);
      // Hard cap on per-level retained gens. Stuck-long levels with
      // curriculumStuckMaxGens=200 will hit this; the cap protects us
      // when the user disables auto-advance entirely.
      if (bucket.gens.length > 250) bucket.gens.shift();
      if (best.fitness > bucket.maxBest)   bucket.maxBest   = best.fitness;
      if (best.fitness < bucket.minBest)   bucket.minBest   = best.fitness;
      if (median       > bucket.maxMedian) bucket.maxMedian = median;
      if (median       < bucket.minMedian) bucket.minMedian = median;
      // Retro aggregates -- bucket-level rollup of the per-gen retro
      // probes. Only updated when this gen produced a retro sample.
      if (retroBestThisGen != null && isFinite(retroBestThisGen)) {
        if (retroBestThisGen > bucket.maxRetro) bucket.maxRetro = retroBestThisGen;
        bucket.retroSum   += retroBestThisGen;
        bucket.retroCount += 1;
      }
    }
    // Per-level Hall of Fame maintenance. Records up to levelHoFSize
    // champions per curriculum level so the boundary transplant can
    // restore them at the next level-up. We use entry.fitnessRaw when
    // retro-eval is on so the HoF reflects current-level mastery, not
    // a retro-blended view of robustness; the transplant probe ALSO
    // re-evaluates the genome on the new level next gen, so blended
    // selection still gets a say.
    if (trainer.params.levelHoFEnabled && trainer.curriculum) {
      maybeRecordLevelHoF(trainer);
    }

    // Curriculum check (uses current best fitness). Each parameter is now
    // user-tunable via trainer.params; CURRICULUM stays as the fallback.
    if (trainer.params.curriculumEnabled && trainer.curriculum) {
      // Reward-shape ceiling: per-objective if declared, else fall
      // back to balance_up's 1.5/sec calibration. This used to be a
      // hardcoded `1.5 × evalSeconds`, which made the curriculum gate
      // advance way too easily on objectives with larger absolute
      // rewards (ball_in_hole tops out around +50; the legacy ceiling
      // was 12 at evalSeconds=8 → curriculum advanced after a single
      // strike pulse + a bit of motion, long before the policy was
      // actually competent at the level).
      const obj = BF.objectives.getObjective(trainer.params.objectiveId);
      let ceiling;
      // PARAMS ARE THE SECOND ARGUMENT, and they are load-bearing: an objective
      // whose ceiling is set by the WORLD rather than by the clock reads them.
      // terrain_progress sizes its ceiling from the course geometry
      // (gridW/startPad/goalBonus), so without this the gate used the DEFAULT
      // 'hard' rung's 100.5 on every rung — 70.35 to advance on 'crucible',
      // whose real ceiling is 266.5. Every other objective's expectedMaxFor
      // takes one argument and ignores this.
      if (obj && typeof obj.expectedMaxFor === 'function') ceiling = obj.expectedMaxFor(trainer.params.evalSeconds, trainer.params);
      else if (obj && obj.expectedMax != null)             ceiling = obj.expectedMax;
      else if (obj && obj.maxPerSec != null)               ceiling = obj.maxPerSec * trainer.params.evalSeconds;
      else                                                  ceiling = 1.5 * trainer.params.evalSeconds;
      // Per-objective thresholdFrac override — sparse-reward
      // (terminal-heavy) tasks like ball_in_hole need a lower bar to
      // advance, because the policy will be "competent at the
      // current level" long before it reliably hits the terminal
      // jackpot. Without per-objective tuning, golf curriculum
      // would wait for sinks (which only emerge LATE in training)
      // and the GA gets stuck unable to demonstrate "competence".
      const thresholdFrac = (obj && obj.thresholdFrac != null)
        ? obj.thresholdFrac
        : (trainer.params.curriculumThresholdFrac != null
            ? trainer.params.curriculumThresholdFrac
            : CURRICULUM.levelUpThresholdFrac);
      const consecRequired = trainer.params.curriculumConsecRequired != null
        ? trainer.params.curriculumConsecRequired : CURRICULUM.consecRequired;
      const rampFactor = trainer.params.curriculumRampFactor != null
        ? trainer.params.curriculumRampFactor : CURRICULUM.gravityRampFactor;
      // Symmetric damping ramp — falls just as fast as gravity rises.
      const dampingRamp = 1 - (rampFactor - 1) * 1.4;
      const threshold = ceiling * thresholdFrac;
      // Track how long we've been stuck at the current curriculum
      // level. If we exceed `stuckAdvanceMaxGens` (default 200), we
      // force-advance even without meeting the threshold — the
      // theory is that exposure to the next level's harder scenarios
      // might give the GA more reward signal to climb on, OR at
      // least confirms the user that "yes, the curriculum tried,
      // it really is stuck". Without this, sparse-reward tasks
      // could sit at level 0 indefinitely.
      const stuckMaxGens = trainer.params.curriculumStuckMaxGens != null
        ? trainer.params.curriculumStuckMaxGens : 200;
      if (trainer.curriculum.lastLevelChangeGen == null) {
        trainer.curriculum.lastLevelChangeGen = trainer.generation;
      }
      const gensAtLevel = trainer.generation - trainer.curriculum.lastLevelChangeGen;
      const maxLvl = effectiveMaxLevel(trainer);
      const meetsThreshold = best.fitness > threshold;
      const noForceAdvance = trainer.params.curriculumNoForceAdvance === true;
      const isStuckLong = !noForceAdvance && !meetsThreshold && stuckMaxGens > 0
                         && gensAtLevel >= stuckMaxGens
                         && trainer.curriculum.level < maxLvl;
      if (meetsThreshold) {
        trainer.curriculum.consecHits += 1;
        if (trainer.curriculum.consecHits >= consecRequired) {
          advanceCurriculumLevel(trainer, rampFactor, dampingRamp, maxLvl, /*forced=*/false);
        }
      } else if (isStuckLong) {
        advanceCurriculumLevel(trainer, rampFactor, dampingRamp, maxLvl, /*forced=*/true);
      } else {
        trainer.curriculum.consecHits = 0;
      }
    }

    // ---- Snapshot the evaluated population (for fitness bars + PCA) -----
    const eliteCountForSnap = Math.max(1, Math.floor(trainer.params.eliteRatio * trainer.population.length));
    trainer.evaluatedSnapshot = trainer.population.map((p, i) => {
      const s = N.stats(p.genome);
      return {
        rank: i,
        fitness: p.fitness,
        genome: p.genome,
        // Per-individual vectors used by per-algorithm PCA visualizations
        // (chain trails, DE difference arrows, PSO velocity arrows). All
        // optional — null when the algorithm doesn't track that field.
        params:       p.params       || null,
        targetParams: p.targetParams || null,
        velocity:     p.velocity     || null,
        nodes: s.nodes,
        conns: s.enabledConns,
        elite: isNeatMode(trainer.params.mode) && (i < eliteCountForSnap),
        saAccepted: saAccepts ? saAccepts[i] : null,
        ptTIndex: (p.tIndex != null) ? p.tIndex : null,
        // Swarm-family per-individual tags; null in modes that don't set them.
        swarmRank:    p.swarmRank    || null,   // grey wolf: 'alpha'/'beta'/'delta'
        fishBehavior: p.fishBehavior || null,   // fish: 'prey'/'swarm'/'follow'/'random'
        whaleAction:  p.whaleAction  || null,   // whale: 'spiral'/'encircle'/'explore'
        levyJump:     p.levyJump != null ? p.levyJump : null, // cuckoo: jump magnitude
        // Behavior-space features collected during evaluation. 6-D vector
        // describing what the policy DOES; the genome-space renderer uses
        // these for the 'behavior' projection mode.
        behavior:     p.behavior || null,
      };
    });

    // ---- Phase B: build next generation -------------------------------
    trainer.currentStage = 'building next generation';
    if (trainer.params.mode === 'cmaes' && trainer.cmaes) {
      // CMA-ES update already happened in Phase A; just sample a fresh λ.
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = Math.max(1, setup.actionCount | 0) || 1;
      const hidden = trainer.cmaes.paramShape.hiddenSize;
      const isPlaceholder = usesFlatParamPolicy(trainer.params.policyType);
      const next = [];
      for (let i = 0; i < trainer.params.populationSize; i++) {
        const params = BF.cmaes.sampleParams(trainer.cmaes, trainer.rng);
        const genome = isPlaceholder
          ? N.makeGenome(numIn, numOut)
          : BF.cmaes.genomeFromParams(params, numIn, numOut, hidden);
        next.push({ genome: genome, params: params, fitness: 0 });
      }
      trainer.population = next;
    } else if (trainer.params.mode === 'annealing' && trainer.annealing) {
      // SA: cooled in Phase A; just propose new params from each chain's
      // anchor (chainBest{,Params}, possibly updated by accept logic above).
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.annealing.paramShape.hiddenSize;
      BF.annealing.cool(trainer.annealing);
      const next = [];
      for (const ind of trainer.population) {
        const proposal = BF.annealing.propose(trainer.annealing, ind.chainBestParams, trainer.rng);
        const genome = BF.annealing.genomeFromParams(proposal, numIn, numOut, hidden);
        next.push({
          genome: genome,
          params: proposal,
          fitness: 0,
          chainBest: ind.chainBest,
          chainBestParams: new Float64Array(ind.chainBestParams),
        });
      }
      trainer.population = next;
    } else if (trainer.params.mode === 'pt' && trainer.pt) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.pt.paramShape.hiddenSize;
      trainer.population = BF.pt.proposeNextPopulation(trainer.pt, trainer.population, trainer.rng,
        (params) => BF.cmaes.genomeFromParams(params, numIn, numOut, hidden));
    } else if (trainer.params.mode === 'de' && trainer.de) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.de.paramShape.hiddenSize;
      // Placeholder-genome policy types (CNN family, recurrent) decode their
      // params themselves; genomeFromParams would read a vector of the wrong
      // length. Mirrors the CMA-ES/sep-CMA-ES next-population branches above.
      const builder = usesFlatParamPolicy(trainer.params.policyType)
        ? () => N.makeGenome(numIn, Math.max(1, setup.actionCount | 0) || 1)
        : (p) => BF.de.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.de.generateTrials(trainer.de, trainer.population, trainer.rng, builder);
    } else if (trainer.params.mode === 'pso' && trainer.pso) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.pso.paramShape.hiddenSize;
      const builder = (p) => BF.pso.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.pso.stepSwarm(trainer.pso, trainer.population, trainer.rng, builder);
    } else if (trainer.params.mode === 'random' && trainer.randomSearch) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.randomSearch.paramShape.hiddenSize;
      const builder = (p) => BF.randomSearch.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.randomSearch.sample(
        trainer.randomSearch, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'cem' && trainer.cem) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.cem.paramShape.hiddenSize;
      const builder = (p) => BF.cem.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.cem.sample(
        trainer.cem, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'fdgd' && trainer.fdgd) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.fdgd.paramShape.hiddenSize;
      const builder = (p) => BF.fdgd.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.fdgd.sample(
        trainer.fdgd, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'spsa' && trainer.spsa) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.spsa.paramShape.hiddenSize;
      const builder = (p) => BF.spsa.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.spsa.sample(
        trainer.spsa, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'nes' && trainer.nes) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = 1;
      const hidden = trainer.nes.paramShape.hiddenSize;
      const builder = (p) => BF.nes.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.nes.sample(
        trainer.nes, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'adam' && trainer.adam) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = Math.max(1, setup.actionCount | 0) || 1;
      const hidden = trainer.adam.paramShape.hiddenSize;
      const builder = (p) => BF.adam.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.adam.sample(
        trainer.adam, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'lbfgs' && trainer.lbfgs) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = Math.max(1, setup.actionCount | 0) || 1;
      const hidden = trainer.lbfgs.paramShape.hiddenSize;
      const builder = (p) => BF.lbfgs.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.lbfgs.sample(
        trainer.lbfgs, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'xnes' && trainer.xnes) {
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = Math.max(1, setup.actionCount | 0) || 1;
      const hidden = trainer.xnes.paramShape.hiddenSize;
      const builder = (p) => BF.xnes.genomeFromParams(p, numIn, numOut, hidden);
      trainer.population = BF.xnes.sample(
        trainer.xnes, trainer.params.populationSize, trainer.rng, builder);
    } else if (trainer.params.mode === 'sep-cmaes' && trainer.sepCmaes) {
      // sep-CMA-ES resamples like full CMA-ES: each individual is a
      // fresh draw from N(mean, sigma^2 * diag(C)). Placeholder genome
      // for CNN-family policies (no real connections); BF.sepCmaes.
      // genomeFromParams shapes the MLP fallback.
      const setup = BF.setups.getSetup(trainer.setupId);
      const numIn = setup.observationCount;
      const numOut = Math.max(1, setup.actionCount | 0) || 1;
      const hidden = trainer.sepCmaes.paramShape.hiddenSize;
      const isPlaceholder = usesFlatParamPolicy(trainer.params.policyType);
      const next = [];
      for (let i = 0; i < trainer.params.populationSize; i++) {
        const params = BF.sepCmaes.sampleParams(trainer.sepCmaes, trainer.rng);
        const genome = isPlaceholder
          ? N.makeGenome(numIn, numOut)
          : BF.sepCmaes.genomeFromParams(params, numIn, numOut, hidden);
        next.push({ genome: genome, params: params, fitness: 0 });
      }
      trainer.population = next;
    } else if (SWARM_MODES[trainer.params.mode]) {
      const m = SWARM_MODES[trainer.params.mode];
      const lib = m.lib();
      const state = trainer[m.slotKey];
      if (state) {
        const setup = BF.setups.getSetup(trainer.setupId);
        const numIn = setup.observationCount;
        const numOut = 1;
        const hidden = state.paramShape.hiddenSize;
        const builder = (p) => lib.genomeFromParams(p, numIn, numOut, hidden);
        trainer.population = lib.stepSwarm(state, trainer.population, trainer.rng, builder);
      }
    } else if (trainer.params.mode === 'neat-full') {
      reproduceFullNeat(trainer, eliteCountForSnap);
    } else {
      const eliteCount = eliteCountForSnap;
      const next = [];
      // Lineage chronicle for the lineage panel: per-child entry recording
      // who its parent was and what mutations were applied. parentIdx values:
      //   0..popSize-1 → index in the just-evaluated population (this gen)
      //   -1           → best-ever rescue (a clone "from outside" the gen)
      // Entries are appended in insertion order, so lineage[i].childIdx is i.
      const lineage = [];
      for (let i = 0; i < eliteCount; i++) {
        next.push({ genome: N.cloneGenome(trainer.population[i].genome), fitness: 0 });
        lineage.push({
          childIdx: next.length - 1,
          parentIdx: i,
          mutEvents: null,           // null → unmutated (elite copy)
          parentFitness: trainer.population[i].fitness,
          kind: 'elite',
        });
      }
      // Hall of Fame rescue: inject an unmutated clone of EVERY HoF entry.
      // With hallOfFameSize=1 this is just best-ever (legacy behavior).
      // With K>1 we keep K runner-ups too — protects against fluky champions
      // that can't be reproduced after a single bad re-eval. Each rescue
      // still has to earn its rank via fresh evaluation each gen.
      const rescueEntries = trainer.hallOfFame.length > 0
        ? trainer.hallOfFame
        : (trainer.bestEver
            ? [{ genome: trainer.bestEver, fitness: trainer.bestEverFitness }]
            : []);
      for (const entry of rescueEntries) {
        next.push({ genome: N.cloneGenome(entry.genome), fitness: 0 });
        lineage.push({
          childIdx: next.length - 1,
          parentIdx: -1,
          mutEvents: null,
          parentFitness: entry.fitness,
          kind: 'rescue',
        });
      }
      // Effective mutation params — adaptive: cooled down when
      // annealMutationOn (settle-late-game), or reheated when stuck-
      // escape kicks in (default behavior, mutate harder when the
      // GA hasn't improved in a while). See computeAdaptiveMutParams.
      const effectiveMut = computeAdaptiveMutParams(trainer);
      // Diversity injection: at DEEP stagnation, replace the bottom
      // fraction of the next generation with FRESH random genomes
      // (independent of any current parent). Breaks out of converged
      // weight space when even reheated mutation can't escape — the
      // population has fully clustered around a local optimum and
      // needs entirely new directions to break free. Only fires when
      // stuckEscape is on AND we're past the deepest threshold.
      const stale = trainer.gensSinceImprovement || 0;
      const escapeOn = trainer.params.stuckEscapeOn !== false && !trainer.params.annealMutationOn;
      const escapeAfter = Math.max(2, trainer.params.stuckEscapeAfterGens | 0 || 25);
      // Inject fraction escalates with stagnation depth — the longer
      // the GA has been stuck, the more aggressively we shake the
      // population. Clamped at 70% (always preserve at least the elite
      // + a tournament-selected core; pure-random would lose all
      // accumulated structure). Tiers (assuming default
      // stuckEscapeAfterGens=25):
      //   stale ≥ 100 (4×):  user fraction (default 30%)
      //   stale ≥ 200 (8×):  1.5× user fraction (default 45%)
      //   stale ≥ 400 (16×): 2× user fraction, hard-capped 70%
      let injectFraction = 0;
      if (escapeOn) {
        const baseFrac = trainer.params.stuckInjectFraction != null
                           ? trainer.params.stuckInjectFraction
                           : 0.30;
        if (stale >= escapeAfter * 16)      injectFraction = baseFrac * 2.0;
        else if (stale >= escapeAfter * 8)  injectFraction = baseFrac * 1.5;
        else if (stale >= escapeAfter * 4)  injectFraction = baseFrac;
        injectFraction = Math.max(0, Math.min(0.70, injectFraction));
      }
      const injectCount = Math.floor(injectFraction * trainer.params.populationSize);
      // Phase 0: drain the per-level transplant queue. The queue was
      // populated by advanceCurriculumLevel when the curriculum just
      // advanced; each entry is a cloned genome (+ params) from the
      // prior level's HoF. We push them into `next` first so the
      // tournament phase below fills the REMAINING slots, keeping the
      // total population size invariant.
      const transplantQueue = (trainer.curriculum && trainer.curriculum._transplantQueue)
        ? trainer.curriculum._transplantQueue
        : null;
      const transplantCount = transplantQueue ? transplantQueue.length : 0;
      // Reserve transplant slots before computing the tournament target
      // so the population doesn't grow above populationSize.
      const tournamentTarget = Math.max(0,
        trainer.params.populationSize - injectCount - transplantCount);
      // Accumulate per-event-type mutation counts across all children — this
      // is the data the NEAT mode of the algorithm-internals chart shows.
      const mutEvents = { weight: 0, bias: 0, addConn: 0, addNode: 0, toggle: 0, act: 0 };
      if (transplantQueue && transplantQueue.length > 0) {
        for (const t of transplantQueue) {
          next.push({
            genome: t.genome,
            params: t.params,
            fitness: 0,
          });
          lineage.push({
            childIdx: next.length - 1,
            parentIdx: -3, // -3 marks a transplant origin (HoF from prior level)
            mutEvents: null,
            parentFitness: t.fromFitness || 0,
            kind: 'transplant',
          });
        }
        // Clear the queue so subsequent gens (no level-up) don't
        // double-inject. The bookkeeping happens here, not in
        // advanceCurriculumLevel, so a missed selectAndMutate (e.g.
        // during a yielding pause) doesn't lose the transplants.
        trainer.curriculum._transplantQueue = [];
      }
      // Phase 1: tournament-selected (or QD-archive-sampled) mutated
      // offspring. With qdParentEnabled, a fraction of parents come from
      // the behavior archive instead — niches the population isn't
      // currently representing still contribute lineage. Falls back to
      // tournament when the archive is empty / first gens.
      // Choose the tournament implementation once per gen based on the
      // paretoSelectionEnabled toggle. _paretoReady is set by step()
      // after a successful paretoCompute pass; if pareto is on but the
      // population doesn't have behavior vectors yet (very first gens),
      // we transparently fall back to fitness tournament so selection
      // still works -- pareto will kick in next gen.
      const useParetoTournament = trainer.params.paretoSelectionEnabled
        && trainer._paretoReady;
      while (next.length < tournamentTarget) {
        let kind = 'tournament';
        let parentEntry = maybeQdParent(trainer);
        if (parentEntry) {
          kind = 'qd-archive';
        } else {
          const t = useParetoTournament
            ? paretoTournamentSelect(trainer)
            : tournamentSelect(trainer);
          parentEntry = { genome: t.genome, fitness: t.fitness, _popRef: t };
          if (useParetoTournament) kind = 'pareto-tournament';
        }
        const parentIdx = parentEntry._popRef
          ? trainer.population.indexOf(parentEntry._popRef)
          : -2; // -2 marks an archive parent (no live-pop counterpart)
        const child = N.cloneGenome(parentEntry.genome);
        const ev = N.mutate(child, trainer.rng, effectiveMut);
        if (ev) for (const k in ev) mutEvents[k] += ev[k];
        next.push({ genome: child, fitness: 0 });
        lineage.push({
          childIdx: next.length - 1,
          parentIdx: parentIdx,
          mutEvents: ev,
          parentFitness: parentEntry.fitness,
          kind: kind,
        });
      }
      // Phase 2: diversity injection — TWO flavors mixed 50/50:
      //
      // (A) HEAVY-PERTURBED CLONES of the best-ever genome. Keep the
      //     hard-won structural foundation (which inputs matter,
      //     basic connection topology) but shake the weights wildly
      //     so the policy explores meaningfully different parameter
      //     directions. Without this, deep stagnation injects
      //     pure-random genomes that score WORST in the population
      //     (they haven't even learned positioning) and lose every
      //     tournament -- effectively wasted slots.
      //
      // (B) PURE-RANDOM genomes (the original behavior) for genuine
      //     "explore an entirely different strategy" coverage.
      //
      // Tagged kind:'inject-clone' / 'inject-random' so the lineage
      // viewer can distinguish the two interventions.
      if (injectCount > 0) {
        const setup = BF.setups.getSetup(trainer.setupId);
        const numIn = setup.observationCount;
        const numOut = 1;
        const cloneCount = trainer.bestEver
          ? Math.floor(injectCount * 0.5)
          : 0;  // no bestEver yet → all-random
        const randomCount = injectCount - cloneCount;
        // Heavy-perturb mutation params for clone injection — push
        // sigma + reset prob much higher than the normal mutation
        // clamps. This is "shake the elite hard" in a controlled way:
        // its topology survives but most weights are scrambled.
        const heavyMut = Object.assign({}, effectiveMut, {
          weightSigma:     Math.min(4.0, (effectiveMut.weightSigma     || 0.15) * 3.0),
          weightResetProb: Math.min(0.95, (effectiveMut.weightResetProb || 0.05) * 3.0),
          addConnProb:     Math.min(0.95, (effectiveMut.addConnProb     || 0.30) * 1.5),
          addNodeProb:     Math.min(0.6,  (effectiveMut.addNodeProb     || 0.03) * 2.0),
          actMutProb:      Math.min(0.6,  (effectiveMut.actMutProb      || 0.03) * 2.0),
        });
        // (A) heavy-perturbed clones of bestEver
        for (let i = 0; i < cloneCount; i++) {
          const g = N.cloneGenome(trainer.bestEver);
          g._order = null;
          for (let m = 0; m < 6; m++) N.mutate(g, trainer.rng, heavyMut);
          next.push({ genome: g, fitness: 0 });
          lineage.push({
            childIdx: next.length - 1,
            parentIdx: -1, mutEvents: null,
            parentFitness: trainer.bestEverFitness || 0,
            kind: 'inject-clone',
          });
        }
        // (B) pure-random genomes
        for (let i = 0; i < randomCount; i++) {
          const g = N.makeGenome(numIn, numOut);
          for (let m = 0; m < 4; m++) N.mutate(g, trainer.rng, effectiveMut);
          next.push({ genome: g, fitness: 0 });
          lineage.push({
            childIdx: next.length - 1,
            parentIdx: -1, mutEvents: null,
            parentFitness: 0,
            kind: 'inject-random',
          });
        }
        trainer.lastInjectCount = injectCount;
        trainer.lastInjectCloneCount = cloneCount;
        trainer.lastInjectRandomCount = randomCount;
      } else {
        trainer.lastInjectCount = 0;
        trainer.lastInjectCloneCount = 0;
        trainer.lastInjectRandomCount = 0;
      }
      trainer.lastMutationEvents = mutEvents;
      trainer.lastLineage = lineage;
      trainer.population = next;
    }
    trainer.generation++;
    trainer.currentStage = 'idle';
    trainer.evalProgress = 0;
    // Patch stuck-escape diagnostics — these reflect the choices made
    // by computeAdaptiveMutParams and the injection block during
    // selectAndMutate. Done HERE (after selectAndMutate) because
    // those fields exist on `trainer` only after that call has run.
    stats.mutScale    = trainer._mutScale != null ? trainer._mutScale : 1.0;
    stats.mutMode     = trainer._mutMode  || 'normal';
    stats.injectCount = trainer.lastInjectCount || 0;
    stats.gensSinceImprovement = trainer.gensSinceImprovement || 0;
    return stats;
  }

  // Scale the user's mutation params down once the run has been stale long
  // enough (no best-ever improvement). Reduces late-game search radius so
  // good genomes are less likely to be wrecked by aggressive mutation. Reset
  // happens implicitly on the next improvement (gensSinceImprovement → 0).
  // Adaptive mutation rate scaling. Two opposing modes — only one
  // active at a time:
  //
  //   1. ANNEAL (annealMutationOn) — user opts in, expecting the
  //      population to have converged. Cool mutation rates so the
  //      late-game settles. Scales by `annealFactor` (typically 0.5).
  //
  //   2. STUCK ESCAPE (stuckEscapeOn) - opt-in. Escalates
  //      mutation rates when stagnant, so the GA breaks out of
  //      local optima. The right reflex when "nothing's working":
  //      mutate harder, not softer.
  //        stale >= N      → factor × 1
  //        stale >= 2N     → factor × 1.5
  //        stale >= 4N     → factor × 2.0 (plus diversity injection,
  //                          handled separately in selectAndMutate)
  //
  // Both modes leave structural toggles alone — only the per-knob
  // search radii get scaled. The returned scale factor is also
  // stashed on trainer._mutScale so the UI can surface it as a
  // diagnostic (e.g. "exploring HARDER · 2.5×").
  function computeAdaptiveMutParams(trainer) {
    const base = trainer.mutationParams;
    const p = trainer.params;
    const stale = trainer.gensSinceImprovement || 0;
    let factor = 1.0;
    let mode = 'normal';
    if (p.annealMutationOn) {
      const after = p.annealAfterGens != null ? p.annealAfterGens : 30;
      if (stale >= after) {
        factor = Math.max(0.05, p.annealFactor != null ? p.annealFactor : 0.5);
        mode = 'cooling';
      }
    } else if (p.stuckEscapeOn !== false) {
      const after = Math.max(2, p.stuckEscapeAfterGens | 0 || 25);
      const baseFactor = Math.max(1.05, p.stuckEscapeFactor || 2.0);
      if (stale >= after * 4)      { factor = baseFactor * 2.0; mode = 'escape-high'; }
      else if (stale >= after * 2) { factor = baseFactor * 1.5; mode = 'escape-mid'; }
      else if (stale >= after)     { factor = baseFactor;       mode = 'escape-low'; }
    }
    trainer._mutScale = factor;
    trainer._mutMode  = mode;
    if (factor === 1.0) return base;
    // Cap the scaled rates so absurd reheats don't push us into pure
    // chaos. The clamp tightens when we're cooling (annealing) and
    // loosens when we're escaping (reheating). At deep escape-high
    // tier the reset prob bumps to 0.85 — enough that ~85% of weights
    // get scrambled per gen, which is ALMOST a fresh genome but
    // preserves the topology. Combined with diversity injection at
    // the same tier, this gives the GA a real chance of finding a
    // different basin of attraction.
    const isEscapeHigh = mode === 'escape-high';
    const clamp = (v, hi) => Math.min(hi, v);
    return Object.assign({}, base, {
      weightSigma:     clamp(base.weightSigma     * factor, isEscapeHigh ? 3.0 : 2.5),
      weightResetProb: clamp(base.weightResetProb * factor, isEscapeHigh ? 0.85 : 0.6),
      addConnProb:     clamp(base.addConnProb     * factor, 0.9),
      addNodeProb:     clamp(base.addNodeProb     * factor, isEscapeHigh ? 0.5 : 0.4),
      actMutProb:      clamp(base.actMutProb      * factor, isEscapeHigh ? 0.5 : 0.4),
    });
  }
  // Back-compat alias. Some call sites + smoke tests reference the
  // old name.
  const computeAnnealedMutParams = computeAdaptiveMutParams;

  // Bump the curriculum level + legacy gravity/damping ramp. Shared
  // by both the meets-threshold path and the stuck-too-long
  // Effective max curriculum level: the user's curriculumMaxLevel
  // slider is the BASELINE, but if any spec declares a `steps` value
  // higher than that, extend the cap so the slowest spec can still
  // reach its `to` value. Without this, a spec with steps=20 inside
  // a curriculumMaxLevel=10 trainer caps the level counter at 10,
  // and the spec's applied value never finishes its ramp (frac stays
  // at 0.5, applied = halfway between from and to). The user's
  // intuition is "the bigger of {global maxLevel, max spec steps}".
  function effectiveMaxLevel(trainer) {
    const userMax = trainer.params.curriculumMaxLevel | 0 || 10;
    const specs = trainer.params.curriculumSpecs || [];
    // Phase-aware: total ramp length is the SUM of each phase's max-
    // step count, not the max across all specs (which was correct
    // when all specs ran in parallel). For single-phase configs the
    // sum collapses to the original max(spec.steps) value, so legacy
    // presets keep working. Specs without an explicit `steps` fall
    // back to `userMax` (the global curriculumMaxLevel) so the legacy
    // "one spec, no explicit steps, ramp over maxLevel" case stays
    // intact.
    const { phaseMaxSteps } = computeCurriculumPhases(specs, userMax);
    let specMax = 0;
    for (const n of phaseMaxSteps) specMax += n;
    return Math.max(1, Math.max(userMax, specMax));
  }

  // Update the per-level Hall of Fame for the current level. Called
  // once per gen after evaluation when levelHoFEnabled is on. Inserts
  // the top genome (sorted by fitnessRaw if retro-eval is active, else
  // .fitness) into the bucket if it's better than the bucket's worst
  // or the bucket isn't full. Clones genome + params so subsequent
  // mutations don't corrupt the HoF snapshot.
  function maybeRecordLevelHoF(trainer) {
    const c = trainer.curriculum;
    if (!c) return;
    const lvl = c.level || 0;
    if (!c.perLevelHoF) c.perLevelHoF = {};
    if (!c.perLevelHoF[lvl]) c.perLevelHoF[lvl] = [];
    const bucket = c.perLevelHoF[lvl];
    const cap = Math.max(1, (trainer.params.levelHoFSize | 0) || 2);
    if (!trainer.population || trainer.population.length === 0) return;
    const top = trainer.population[0];
    // Use unblended fitness as the level-mastery score. The retro blend
    // is a generalization signal; the per-level HoF is specifically
    // about "who was best AT this level".
    const score = top.fitnessRaw != null ? top.fitnessRaw : top.fitness;
    if (!isFinite(score)) return;
    // Skip the insert if it's not better than the bucket's current
    // worst (when the bucket is full). Cheap stable insertion path.
    if (bucket.length >= cap && score <= bucket[bucket.length - 1].fitness) {
      return;
    }
    const entry = {
      genome: top.genome ? N.cloneGenome(top.genome) : null,
      params: top.params ? new Float64Array(top.params) : null,
      fitness: score,
      gen: trainer.generation,
    };
    bucket.push(entry);
    bucket.sort((a, b) => b.fitness - a.fitness);
    if (bucket.length > cap) bucket.length = cap;
  }

  // force-advance path so the bookkeeping (level counter, applied
  // gravity, last-change-gen, event log) stays in one place.
  function advanceCurriculumLevel(trainer, rampFactor, dampingRamp, maxLvl, forced) {
    // Legacy gravity / damping ramp.
    const target = trainer.params.gravity;
    const nextG = Math.min(target, trainer.curriculum.currentGravity * rampFactor);
    const targetD = trainer.params.damping;
    const nextD = Math.max(targetD, trainer.curriculum.currentDamping * dampingRamp);
    if (nextG > trainer.curriculum.currentGravity + 0.5) {
      emitEvent(trainer, 'curriculum',
        `gravity ramp ${trainer.curriculum.currentGravity.toFixed(0)} → ${nextG.toFixed(0)}`);
    }
    trainer.curriculum.currentGravity = nextG;
    trainer.curriculum.currentDamping = nextD;
    trainer.curriculum.consecHits = 0;
    // Generalized curriculum level counter.
    if (trainer.curriculum.level < maxLvl) {
      // Close out the previous level's per-level bucket before bumping
      // the level counter. The next stats push will see a level mismatch
      // and open a fresh bucket. Also record the gen of the level-up so
      // the main fitness chart can drop a marker line there.
      const prevBucket = trainer.curriculum.perLevelStats
        ? trainer.curriculum.perLevelStats[trainer.curriculum.perLevelStats.length - 1]
        : null;
      if (prevBucket && prevBucket.endGen == null) {
        prevBucket.endGen = trainer.generation;
      }
      if (!trainer.curriculum.levelUpGens) trainer.curriculum.levelUpGens = [];
      trainer.curriculum.levelUpGens.push(trainer.generation);
      // Boundary transplant: copy the FROM level's top HoF entries into
      // a pending injection queue. selectAndMutate drains the queue
      // when building the next-gen population, so they survive the
      // level boundary and get re-evaluated at the new level. Direct
      // medicine for the "drop 100 -> 0 at level-up" failure mode:
      // instead of losing the genomes that worked on the prior level,
      // they continue to participate in the search (and may seed the
      // strategy for the new level, or stay as a reservoir if the new
      // level needs something fundamentally different).
      if (trainer.params.levelHoFEnabled
          && trainer.params.levelTransplantOn !== false) {
        const transplantN = Math.max(0,
          (trainer.params.levelTransplantCount | 0) || 2);
        const fromLevel = trainer.curriculum.level;  // about to be incremented
        const fromHoF = trainer.curriculum.perLevelHoF
          ? trainer.curriculum.perLevelHoF[fromLevel]
          : null;
        if (fromHoF && fromHoF.length > 0 && transplantN > 0) {
          if (!trainer.curriculum._transplantQueue) {
            trainer.curriculum._transplantQueue = [];
          }
          const n = Math.min(transplantN, fromHoF.length);
          for (let i = 0; i < n; i++) {
            // Clone genome + params (Float64Array) so the queued copy
            // never aliases the HoF snapshot. selectAndMutate will
            // mutate these clones into population entries.
            const e = fromHoF[i];
            trainer.curriculum._transplantQueue.push({
              genome: e.genome ? N.cloneGenome(e.genome) : null,
              params: e.params ? new Float64Array(e.params) : null,
              fromLevel: fromLevel,
              fromFitness: e.fitness,
              fromGen: e.gen,
            });
          }
          emitEvent(trainer, 'curriculum',
            `transplant ${n} HoF entr${n > 1 ? 'ies' : 'y'} from L${fromLevel}`);
        }
      }
      // Cap to prevent unbounded growth on very long sessions.
      if (trainer.curriculum.levelUpGens.length > 300) {
        trainer.curriculum.levelUpGens.shift();
      }
      trainer.curriculum.level += 1;
      trainer.curriculum.lastLevelChangeGen = trainer.generation;
      resetCurriculumPhaseBest(trainer);
      const numSpecs = (trainer.params.curriculumSpecs || []).length;
      const tag = forced ? ' (force-advanced after long stall)' : '';
      if (numSpecs > 0) {
        emitEvent(trainer, 'curriculum',
          `level ${trainer.curriculum.level}/${maxLvl} (${numSpecs} spec${numSpecs > 1 ? 's' : ''})${tag}`);
      } else if (forced) {
        emitEvent(trainer, 'curriculum',
          `level ${trainer.curriculum.level}/${maxLvl}${tag}`);
      }
    }
  }

  function neatCompatOptions(trainer) {
    const p = trainer.params;
    return {
      c1: p.neatCompatC1 != null ? p.neatCompatC1 : 1.0,
      c2: p.neatCompatC2 != null ? p.neatCompatC2 : 1.0,
      c3: p.neatCompatC3 != null ? p.neatCompatC3 : 0.4,
    };
  }

  function speciatePopulation(trainer) {
    if (trainer.neatCompatThresholdCurrent == null) {
      trainer.neatCompatThresholdCurrent = trainer.params.neatCompatThreshold != null
        ? trainer.params.neatCompatThreshold
        : 3.0;
    }
    const threshold = trainer.neatCompatThresholdCurrent;
    const opts = neatCompatOptions(trainer);
    const species = [];
    for (const ind of trainer.population) {
      let bucket = null;
      for (const s of species) {
        const d = N.compatibilityDistance(ind.genome, s.representative.genome, opts);
        if (d <= threshold) {
          bucket = s;
          break;
        }
      }
      if (!bucket) {
        bucket = {
          representative: ind,
          members: [],
          bestFitness: -Infinity,
          adjustedSum: 0,
          quota: 0,
        };
        species.push(bucket);
      }
      bucket.members.push(ind);
      if (ind.fitness > bucket.bestFitness) bucket.bestFitness = ind.fitness;
    }
    for (const s of species) {
      s.members.sort((a, b) => b.fitness - a.fitness);
      s.representative = s.members[0];
    }
    return species;
  }

  function updateFullNeatCompatThreshold(trainer, speciesCount) {
    if (!isFinite(speciesCount) || speciesCount <= 0) return;
    if (trainer.neatCompatThresholdCurrent == null) {
      trainer.neatCompatThresholdCurrent = trainer.params.neatCompatThreshold != null
        ? trainer.params.neatCompatThreshold
        : 3.0;
    }
    const target = Math.max(2, trainer.params.neatTargetSpecies | 0 || 8);
    const rate = Math.max(0.01, Math.min(0.5,
      trainer.params.neatCompatAdaptRate != null ? trainer.params.neatCompatAdaptRate : 0.15));
    if (speciesCount < target * 0.75) {
      trainer.neatCompatThresholdCurrent *= (1 - rate);
    } else if (speciesCount > target * 1.5) {
      trainer.neatCompatThresholdCurrent *= (1 + rate);
    }
    trainer.neatCompatThresholdCurrent = Math.max(0.25, Math.min(10, trainer.neatCompatThresholdCurrent));
  }

  function assignFullNeatQuotas(trainer, species, targetSize) {
    if (!species || species.length === 0) return;
    let minFit = Infinity;
    for (const ind of trainer.population) if (ind.fitness < minFit) minFit = ind.fitness;
    const offset = minFit <= 0 ? -minFit + 1e-6 : 0;
    let totalAdjusted = 0;
    for (const s of species) {
      let sum = 0;
      const denom = Math.max(1, s.members.length);
      for (const ind of s.members) sum += Math.max(0, ind.fitness + offset) / denom;
      s.adjustedSum = sum;
      totalAdjusted += sum;
    }
    const raw = species.map((s, i) => {
      const q = totalAdjusted > 0
        ? targetSize * (s.adjustedSum / totalAdjusted)
        : targetSize / species.length;
      return { i, q, rem: q - Math.floor(q) };
    });
    let sumQuota = 0;
    for (const r of raw) {
      const s = species[r.i];
      s.quota = Math.floor(r.q);
      if (s.quota === 0 && species.length <= targetSize) s.quota = 1;
      sumQuota += s.quota;
    }
    if (sumQuota < targetSize) {
      raw.sort((a, b) => b.rem - a.rem);
      let at = 0;
      while (sumQuota < targetSize) {
        species[raw[at % raw.length].i].quota++;
        sumQuota++;
        at++;
      }
    } else if (sumQuota > targetSize) {
      raw.sort((a, b) => a.rem - b.rem);
      let at = 0, guard = 0;
      while (sumQuota > targetSize && guard++ < targetSize * 4) {
        const s = species[raw[at % raw.length].i];
        if (s.quota > 1) {
          s.quota--;
          sumQuota--;
        }
        at++;
      }
    }
  }

  function selectSpeciesParent(species, rng, tournamentSize) {
    const members = species.members;
    if (members.length === 0) return null;
    const k = Math.max(2, Math.min(tournamentSize | 0 || 3, members.length));
    let best = null;
    for (let i = 0; i < k; i++) {
      const cand = members[rng.int(members.length)];
      if (!best || cand.fitness > best.fitness) best = cand;
    }
    return best;
  }

  function chooseSpeciesByQuota(species, rng) {
    let total = 0;
    for (const s of species) total += Math.max(0, s.quota || 0);
    if (total <= 0) return rng.pick(species);
    let r = rng.next() * total;
    for (const s of species) {
      r -= Math.max(0, s.quota || 0);
      if (r <= 0) return s;
    }
    return species[species.length - 1];
  }

  function addMutEvents(dst, ev) {
    if (!ev) return;
    for (const k in ev) {
      if (dst[k] == null) dst[k] = 0;
      dst[k] += ev[k];
    }
  }

  function reproduceFullNeat(trainer, eliteCountForSnap) {
    const targetSize = trainer.params.populationSize;
    const species = trainer.lastFullNeatSpecies && trainer.lastFullNeatSpecies.length
      ? trainer.lastFullNeatSpecies
      : speciatePopulation(trainer);
    assignFullNeatQuotas(trainer, species, targetSize);

    const next = [];
    const lineage = [];
    const mutEvents = { weight: 0, bias: 0, addConn: 0, addNode: 0, toggle: 0, act: 0 };
    const effectiveMut = computeAdaptiveMutParams(trainer);
    const tournamentSize = Math.max(2, trainer.params.tournamentSize | 0 || 3);

    // Preserve each reproducing species champion. This is the core NEAT
    // protection mechanism: new structures get at least one unmutated chance
    // to survive while their surrounding weights catch up.
    for (const s of species) {
      if ((s.quota || 0) <= 0 || next.length >= targetSize) continue;
      const champion = s.members[0];
      const parentIdx = trainer.population.indexOf(champion);
      next.push({ genome: N.cloneGenome(champion.genome), fitness: 0 });
      lineage.push({
        childIdx: next.length - 1,
        parentIdx: parentIdx,
        mutEvents: null,
        parentFitness: champion.fitness,
        kind: 'species-elite',
      });
      s.quota--;
    }

    const crossoverRate = trainer.params.neatCrossoverRate != null
      ? trainer.params.neatCrossoverRate
      : 0.75;
    const interspeciesRate = trainer.params.neatInterspeciesMateRate != null
      ? trainer.params.neatInterspeciesMateRate
      : 0.01;

    let guard = 0;
    while (next.length < targetSize && guard++ < targetSize * 20) {
      const s = chooseSpeciesByQuota(species, trainer.rng);
      if (!s) break;
      // QD parent injection: with prob qdSampleFraction, replace the
      // species-tournament pick with a behavior-archive draw. Crossover
      // is skipped for QD parents because the archive entry has no
      // species-mate-with semantics; it gets cloned + mutated. The
      // species's quota still decrements so QD parents don't blow up
      // the per-species headcount budget.
      const qd = maybeQdParent(trainer);
      if (qd) {
        const child = N.cloneGenome(qd.genome);
        const ev = N.mutate(child, trainer.rng, effectiveMut);
        addMutEvents(mutEvents, ev);
        next.push({ genome: child, fitness: 0 });
        lineage.push({
          childIdx: next.length - 1,
          parentIdx: -2,         // -2 == archive parent (no live-pop counterpart)
          parent2Idx: null,
          mutEvents: ev,
          parentFitness: qd.fitness,
          kind: 'qd-archive',
        });
        if (s.quota > 0) s.quota--;
        continue;
      }
      const p1 = selectSpeciesParent(s, trainer.rng, tournamentSize);
      if (!p1) continue;
      let child;
      let kind = 'species-mutate';
      let p2 = null;
      if (trainer.rng.proba(crossoverRate) && trainer.population.length > 1) {
        const mateSpecies = trainer.rng.proba(interspeciesRate)
          ? trainer.rng.pick(species)
          : s;
        p2 = selectSpeciesParent(mateSpecies, trainer.rng, tournamentSize);
      }
      if (p2 && p2 !== p1) {
        let fitter = p1, other = p2, includeOtherDisjoint = false;
        if (p2.fitness > p1.fitness) {
          fitter = p2; other = p1;
        } else if (p2.fitness === p1.fitness) {
          includeOtherDisjoint = true;
          if (trainer.rng.proba(0.5)) { fitter = p2; other = p1; }
        }
        child = N.crossover(fitter.genome, other.genome, trainer.rng, {
          includeOtherDisjoint: includeOtherDisjoint,
        });
        kind = 'crossover';
      } else {
        child = N.cloneGenome(p1.genome);
      }
      const ev = N.mutate(child, trainer.rng, effectiveMut);
      addMutEvents(mutEvents, ev);
      next.push({ genome: child, fitness: 0 });
      lineage.push({
        childIdx: next.length - 1,
        parentIdx: trainer.population.indexOf(p1),
        parent2Idx: p2 ? trainer.population.indexOf(p2) : null,
        mutEvents: ev,
        parentFitness: p1.fitness,
        kind: kind,
      });
      if (s.quota > 0) s.quota--;
    }

    while (next.length < targetSize) {
      const parent = tournamentSelect(trainer);
      const child = N.cloneGenome(parent.genome);
      const ev = N.mutate(child, trainer.rng, effectiveMut);
      addMutEvents(mutEvents, ev);
      next.push({ genome: child, fitness: 0 });
      lineage.push({
        childIdx: next.length - 1,
        parentIdx: trainer.population.indexOf(parent),
        mutEvents: ev,
        parentFitness: parent.fitness,
        kind: 'fallback-mutate',
      });
    }

    trainer.lastMutationEvents = mutEvents;
    trainer.lastLineage = lineage;
    trainer.lastInjectCount = 0;
    trainer.lastInjectCloneCount = 0;
    trainer.lastInjectRandomCount = 0;
    trainer.population = next;
  }

  function tournamentSelect(trainer) {
    const k = Math.max(2, trainer.params.tournamentSize | 0);
    let best = null;
    for (let i = 0; i < k; i++) {
      const idx = trainer.rng.int(trainer.population.length);
      const cand = trainer.population[idx];
      if (best == null || cand.fitness > best.fitness) best = cand;
    }
    return best;
  }

  // ---------------------------------------------------------------
  // Pareto / NSGA-II-style selection over (fitness, novelty).
  //
  // Pipeline (called once per gen from step() before selectAndMutate
  // when params.paretoSelectionEnabled):
  //
  //   1. computeNovelty: per individual, average L2 distance to k
  //      nearest neighbors in the 6-D `ind.behavior` space, with
  //      each dim normalized by its population std-dev.
  //
  //   2. nonDominatedSort: Pareto rank using (fitness, novelty) as
  //      the two maximization objectives. ind.paretoRank = 1 means
  //      the individual sits on the Pareto front (no other member is
  //      strictly better on BOTH axes).
  //
  //   3. crowdingDistance: per rank, sum of normalized per-objective
  //      neighbor-gap distances. Boundary individuals on each axis
  //      get +Infinity so the front's extremes are always preferred.
  //      Used as a tie-breaker in tournament selection within a rank.
  //
  //   4. paretoTournamentSelect: K random picks; winner has lowest
  //      rank, ties broken by higher crowding. Drop-in replacement
  //      for tournamentSelect.
  //
  // The whole pipeline is a no-op if behavior vectors aren't populated
  // yet (e.g. first gen before any individual has been evaluated). The
  // caller falls back to fitness-only tournament in that case.
  // ---------------------------------------------------------------
  function paretoCompute(trainer) {
    const pop = trainer.population;
    if (!pop || pop.length === 0) return false;
    // Ensure every individual has a behavior vector (set by the eval
    // loop). If even one is missing, abort the whole pipeline and let
    // the caller fall back to plain tournament -- partial Pareto over
    // a mix of measured and unmeasured behaviors is misleading.
    for (const ind of pop) {
      if (!ind.behavior || ind.behavior.length === 0) return false;
    }
    const N = pop.length;
    const dim = pop[0].behavior.length;
    // Per-dim std-dev for normalization. Cheap; we already need to
    // walk the population once for the mean.
    const mean = new Float64Array(dim);
    for (const ind of pop) for (let j = 0; j < dim; j++) mean[j] += ind.behavior[j];
    for (let j = 0; j < dim; j++) mean[j] /= N;
    const std = new Float64Array(dim);
    for (const ind of pop) {
      for (let j = 0; j < dim; j++) {
        const d = ind.behavior[j] - mean[j];
        std[j] += d * d;
      }
    }
    for (let j = 0; j < dim; j++) std[j] = Math.sqrt(std[j] / N) || 1;  // guard /0
    // Novelty: average L2 to k nearest neighbors in normalized space.
    const k = Math.max(1, Math.min(N - 1, (trainer.params.paretoNoveltyK | 0) || 15));
    const dists = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const bi = pop[i].behavior;
      // Compute distances to all others (only j > i; reuse via symmetry
      // is cheap given small N, but a flat loop is clearer here).
      const ds = new Float64Array(N - 1);
      let widx = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        let sum = 0;
        const bj = pop[j].behavior;
        for (let d = 0; d < dim; d++) {
          const delta = (bi[d] - bj[d]) / std[d];
          sum += delta * delta;
        }
        ds[widx++] = Math.sqrt(sum);
      }
      // Partial sort: only need the k smallest. A full sort is O(N log N)
      // but N is ~120 so the constant factor savings of partial sort
      // aren't worth the code complexity.
      Array.prototype.sort.call(ds, (a, b) => a - b);
      let s = 0;
      for (let r = 0; r < k && r < ds.length; r++) s += ds[r];
      pop[i].novelty = s / k;
    }
    // Non-dominated sort. Standard NSGA-II construction:
    //   dominationCount[i] = # of individuals that dominate i
    //   dominatedSet[i]   = list of individuals that i dominates
    //   front 1 = those with dominationCount == 0; remove, propagate.
    // Maximize fitness + novelty (always), and optionally consistency
    // (when paretoUseConsistency is on AND rollouts >= 2; otherwise
    // consistency is 0 for everyone and the third axis is a tie).
    // "i dominates j" iff i is >= j on all active axes and strictly
    // greater on at least one.
    const useC = !!trainer.params.paretoUseConsistency;
    const dominationCount = new Int32Array(N);
    const dominatedSet = new Array(N);
    for (let i = 0; i < N; i++) dominatedSet[i] = [];
    for (let i = 0; i < N; i++) {
      const fi = pop[i].fitness, ni = pop[i].novelty;
      const ci = useC ? (pop[i].consistency || 0) : 0;
      for (let j = i + 1; j < N; j++) {
        const fj = pop[j].fitness, nj = pop[j].novelty;
        const cj = useC ? (pop[j].consistency || 0) : 0;
        const iBetterF = fi > fj, jBetterF = fj > fi;
        const iBetterN = ni > nj, jBetterN = nj > ni;
        const iBetterC = ci > cj, jBetterC = cj > ci;
        const iWeakDom = (fi >= fj && ni >= nj && ci >= cj);
        const jWeakDom = (fj >= fi && nj >= ni && cj >= ci);
        const iDomJ = iWeakDom && (iBetterF || iBetterN || iBetterC);
        const jDomI = jWeakDom && (jBetterF || jBetterN || jBetterC);
        if (iDomJ) {
          dominatedSet[i].push(j);
          dominationCount[j]++;
        } else if (jDomI) {
          dominatedSet[j].push(i);
          dominationCount[i]++;
        }
      }
    }
    const fronts = [];
    let current = [];
    for (let i = 0; i < N; i++) {
      if (dominationCount[i] === 0) { pop[i].paretoRank = 1; current.push(i); }
    }
    fronts.push(current.slice());
    let rank = 1;
    while (current.length > 0) {
      const next = [];
      for (const i of current) {
        for (const j of dominatedSet[i]) {
          dominationCount[j]--;
          if (dominationCount[j] === 0) {
            pop[j].paretoRank = rank + 1;
            next.push(j);
          }
        }
      }
      rank++;
      current = next;
      if (current.length > 0) fronts.push(current.slice());
    }
    // Crowding distance per front. Initialize all to 0, then for each
    // objective sort the front and sum normalized neighbor-gap deltas.
    // Boundary individuals on each axis get +Infinity (always preferred).
    for (const ind of pop) ind.crowdingDistance = 0;
    for (const front of fronts) {
      if (front.length === 0) continue;
      if (front.length <= 2) {
        for (const idx of front) pop[idx].crowdingDistance = Infinity;
        continue;
      }
      // Objective 1: fitness.
      front.sort((a, b) => pop[a].fitness - pop[b].fitness);
      const fMin = pop[front[0]].fitness;
      const fMax = pop[front[front.length - 1]].fitness;
      const fSpan = (fMax - fMin) || 1;
      pop[front[0]].crowdingDistance = Infinity;
      pop[front[front.length - 1]].crowdingDistance = Infinity;
      for (let i = 1; i < front.length - 1; i++) {
        const cur = pop[front[i]];
        if (cur.crowdingDistance === Infinity) continue;
        cur.crowdingDistance += (pop[front[i + 1]].fitness - pop[front[i - 1]].fitness) / fSpan;
      }
      // Objective 2: novelty. Re-sort the front.
      front.sort((a, b) => pop[a].novelty - pop[b].novelty);
      const nMin = pop[front[0]].novelty;
      const nMax = pop[front[front.length - 1]].novelty;
      const nSpan = (nMax - nMin) || 1;
      pop[front[0]].crowdingDistance = Infinity;
      pop[front[front.length - 1]].crowdingDistance = Infinity;
      for (let i = 1; i < front.length - 1; i++) {
        const cur = pop[front[i]];
        if (cur.crowdingDistance === Infinity) continue;
        cur.crowdingDistance += (pop[front[i + 1]].novelty - pop[front[i - 1]].novelty) / nSpan;
      }
      // Objective 3: consistency (only when feature toggle is on).
      // Same boundary-Infinity treatment so axis extremes are
      // always preferred within their rank.
      if (useC) {
        front.sort((a, b) => (pop[a].consistency || 0) - (pop[b].consistency || 0));
        const cMin = pop[front[0]].consistency || 0;
        const cMax = pop[front[front.length - 1]].consistency || 0;
        const cSpan = (cMax - cMin) || 1;
        pop[front[0]].crowdingDistance = Infinity;
        pop[front[front.length - 1]].crowdingDistance = Infinity;
        for (let i = 1; i < front.length - 1; i++) {
          const cur = pop[front[i]];
          if (cur.crowdingDistance === Infinity) continue;
          cur.crowdingDistance += ((pop[front[i + 1]].consistency || 0) - (pop[front[i - 1]].consistency || 0)) / cSpan;
        }
      }
    }
    trainer._paretoFrontCount = fronts.length;
    trainer._paretoFront1Size = fronts[0] ? fronts[0].length : 0;
    return true;
  }

  // Pareto-aware HoF maintenance. Called once per gen AFTER
  // paretoCompute has tagged each individual with paretoRank. Walks
  // the current population's rank-1 members and tries to insert each
  // into trainer.paretoHoF, applying a behavior-diversity gate so the
  // HoF doesn't fill with near-duplicates.
  //
  // Insertion rules (per rank-1 candidate):
  //   1. If no existing HoF entry is within paretoHoFMinBehaviorDist
  //      in normalized 6-D behavior space: INSERT (clone genome + params
  //      + behavior). If HoF is over capacity, evict the lowest-fitness
  //      entry.
  //   2. If a nearby entry exists and the candidate has higher fitness:
  //      REPLACE the nearby entry.
  //   3. Otherwise: DROP. The candidate doesn't add value.
  //
  // Distance metric: same normalization as paretoCompute (divide each
  // dim by population std-dev so axes with bigger raw scales don't
  // dominate). We re-compute the std vector here rather than caching
  // it on the trainer because the population changes every gen
  // anyway.
  function maybeUpdateParetoHoF(trainer) {
    const pop = trainer.population;
    if (!pop || pop.length === 0) return;
    if (!trainer.paretoHoF) trainer.paretoHoF = [];
    const cap = Math.max(1, (trainer.params.paretoHoFSize | 0) || 8);
    const minDist = trainer.params.paretoHoFMinBehaviorDist != null
      ? trainer.params.paretoHoFMinBehaviorDist : 0.5;
    // Recompute per-dim std for normalization. Cheap, same path as
    // paretoCompute, deduped only by keeping both functions readable
    // in isolation.
    const dim = pop[0] && pop[0].behavior ? pop[0].behavior.length : 0;
    if (dim === 0) return;
    const mean = new Float64Array(dim);
    let count = 0;
    for (const ind of pop) {
      if (!ind.behavior) continue;
      for (let j = 0; j < dim; j++) mean[j] += ind.behavior[j];
      count++;
    }
    if (count === 0) return;
    for (let j = 0; j < dim; j++) mean[j] /= count;
    const std = new Float64Array(dim);
    for (const ind of pop) {
      if (!ind.behavior) continue;
      for (let j = 0; j < dim; j++) {
        const d = ind.behavior[j] - mean[j];
        std[j] += d * d;
      }
    }
    for (let j = 0; j < dim; j++) std[j] = Math.sqrt(std[j] / count) || 1;
    function behaviorDist(a, b) {
      let s = 0;
      for (let j = 0; j < dim; j++) {
        const d = (a[j] - b[j]) / std[j];
        s += d * d;
      }
      return Math.sqrt(s);
    }
    // Walk current rank-1 individuals (sorted by fitness desc for stable
    // greedy insertion order -- highest-fitness candidate considered
    // first, so it gets priority on rare cell occupancy).
    const rank1 = pop.filter(ind => ind.paretoRank === 1 && ind.behavior)
                      .sort((a, b) => b.fitness - a.fitness);
    for (const cand of rank1) {
      // Find the closest existing HoF entry by behavior distance.
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < trainer.paretoHoF.length; i++) {
        const d = behaviorDist(cand.behavior, trainer.paretoHoF[i].behavior);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      if (nearestIdx >= 0 && nearestDist < minDist) {
        // Too similar to an existing entry. Replace IFF higher fitness.
        if (cand.fitness > trainer.paretoHoF[nearestIdx].fitness) {
          trainer.paretoHoF[nearestIdx] = {
            genome: cand.genome ? N.cloneGenome(cand.genome) : null,
            params: cand.params ? new Float64Array(cand.params) : null,
            fitness: cand.fitness,
            behavior: new Float64Array(cand.behavior),
            gen: trainer.generation,
          };
        }
      } else {
        // Diverse enough -- insert.
        trainer.paretoHoF.push({
          genome: cand.genome ? N.cloneGenome(cand.genome) : null,
          params: cand.params ? new Float64Array(cand.params) : null,
          fitness: cand.fitness,
          behavior: new Float64Array(cand.behavior),
          gen: trainer.generation,
        });
        if (trainer.paretoHoF.length > cap) {
          // Evict the lowest-fitness entry. O(N) per insert is fine
          // because cap is small (default 8).
          let worstI = 0;
          for (let i = 1; i < trainer.paretoHoF.length; i++) {
            if (trainer.paretoHoF[i].fitness < trainer.paretoHoF[worstI].fitness) worstI = i;
          }
          trainer.paretoHoF.splice(worstI, 1);
        }
      }
    }
  }

  function paretoTournamentSelect(trainer) {
    const k = Math.max(2, trainer.params.tournamentSize | 0);
    let best = null;
    for (let i = 0; i < k; i++) {
      const idx = trainer.rng.int(trainer.population.length);
      const cand = trainer.population[idx];
      if (best == null) { best = cand; continue; }
      // Lower paretoRank wins. Tie => higher crowdingDistance wins.
      // Fall back to fitness if a pareto field is missing (defensive,
      // shouldn't happen since paretoCompute ran this gen).
      const br = best.paretoRank, cr = cand.paretoRank;
      if (br == null && cr == null) {
        if (cand.fitness > best.fitness) best = cand;
      } else if (cr != null && (br == null || cr < br)) {
        best = cand;
      } else if (cr === br) {
        const bc = best.crowdingDistance, cc = cand.crowdingDistance;
        if (cc != null && (bc == null || cc > bc)) best = cand;
      }
    }
    return best;
  }

  function setSetupId(trainer, id) {
    if (trainer.setupId === id) return;
    trainer.setupId = id;
    trainer.generation = 0;
    trainer.history.length = 0;
    trainer.bestEverHistory.length = 0;
    trainer.gensSinceImprovement = 0;
    trainer.gensConverged = 0;
    if (trainer.bestFitnessWindow) trainer.bestFitnessWindow.length = 0;
    trainer.lastMutationEvents = null;
    trainer.lastLineage = null;
    trainer.lastFullNeatSpecies = null;
    trainer.neatCompatThresholdCurrent = trainer.params.neatCompatThreshold;
    trainer.bestEver = null;
    trainer.bestEverParams = null;
    trainer.bestEverFitness = -Infinity;
    trainer.currentBest = null;
    trainer.currentBestFitness = -Infinity;
    trainer.evaluatedSnapshot = null;
    trainer.hallOfFame = [];
    trainer.paretoHoF = [];
    trainer.autoCheckpoint = null;
    trainer.regressionRunLen = 0;
    // Setup change = different behavior space; rebuild archive with the new
    // setup's default axes. User-picked axes are reset by design — different
    // descriptors are available across setups.
    trainer.behaviorArchive = null;
    trainer.lastSetupBehaviors = null;
    configureBehaviorArchive(trainer, { bins: trainer.params.behaviorArchiveBins });
    curriculumReset(trainer);
    initPopulation(trainer);
  }

  function newRun(trainer) {
    trainer.generation = 0;
    trainer.history.length = 0;
    trainer.bestEverHistory.length = 0;
    trainer.gensSinceImprovement = 0;
    trainer.gensConverged = 0;
    if (trainer.bestFitnessWindow) trainer.bestFitnessWindow.length = 0;
    trainer.lastMutationEvents = null;
    trainer.lastLineage = null;
    trainer.lastFullNeatSpecies = null;
    trainer.neatCompatThresholdCurrent = trainer.params.neatCompatThreshold;
    trainer.bestEver = null;
    trainer.bestEverParams = null;
    trainer.bestEverFitness = -Infinity;
    trainer.currentBest = null;
    trainer.currentBestFitness = -Infinity;
    trainer.evaluatedSnapshot = null;
    trainer.hallOfFame = [];
    trainer.paretoHoF = [];
    trainer.autoCheckpoint = null;
    trainer.regressionRunLen = 0;
    // New run on the same setup keeps the archive's axes + bins but clears
    // its accumulated cells. The user's "where have we explored?" question
    // is per-run, not lifetime-of-the-page.
    if (trainer.behaviorArchive) resetBehaviorArchive(trainer);
    trainer.lastSetupBehaviors = null;
    curriculumReset(trainer);
    initPopulation(trainer);
    // Snapshot the gen-0 (untrained, random) genome so a Before/After "split
    // replay" can run the random policy against the trained champion on a
    // matched seed. Nothing else retains gen-0 once evolution overwrites the
    // population. (CNN-like policies also keep their params.)
    if (trainer.population && trainer.population[0]) {
      trainer.gen0Genome = N.cloneGenome(trainer.population[0].genome);
      trainer.gen0Params = trainer.population[0].params ? new Float64Array(trainer.population[0].params) : null;
    } else {
      trainer.gen0Genome = null;
      trainer.gen0Params = null;
    }
  }

  // Pick the top N genomes (deduped) for ghost rendering.
  function topGenomes(trainer, n) {
    return trainer.population.slice(0, Math.min(n, trainer.population.length))
      .map(p => p.genome);
  }

  // Test-mode helper: run one rollout of the chosen genome with a specific
  // (or randomized hard) starting angle, return summary metrics.
  function runTrial(trainer, genome, angleOverride) {
    return evaluatePolicy(trainer, genome, angleOverride == null, angleOverride);
  }

  // ---- Checkpoint/restore ("time travel") -------------------------------
  // Captures everything that matters for resuming a run from this point: the
  // entire population, best-ever, history, curriculum state, and CMA-ES inner
  // state if applicable. Cheap enough to stash in memory; not persisted to
  // disk in this prototype.
  function saveCheckpoint(trainer) {
    const ckpt = {
      generation: trainer.generation,
      population: trainer.population.map(p => ({
        genome: N.cloneGenome(p.genome),
        params: p.params ? new Float64Array(p.params) : null,
        fitness: p.fitness,
        chainBest: p.chainBest != null ? p.chainBest : undefined,
        chainBestParams: p.chainBestParams ? new Float64Array(p.chainBestParams) : undefined,
        tIndex: p.tIndex != null ? p.tIndex : undefined,
        targetParams: p.targetParams ? new Float64Array(p.targetParams) : undefined,
        targetFitness: p.targetFitness != null ? p.targetFitness : undefined,
      })),
      bestEver: trainer.bestEver ? N.cloneGenome(trainer.bestEver) : null,
      bestEverParams: trainer.bestEverParams ? new Float64Array(trainer.bestEverParams) : null,
      bestEverFitness: trainer.bestEverFitness,
      bestEverHistory: trainer.bestEverHistory.map(e => ({
        gen: e.gen,
        genome: N.cloneGenome(e.genome),
        fitness: e.fitness,
      })),
      // Hall of Fame entries (top-K best-ever runners-up). Cloned so the
      // checkpoint is self-contained and a later restore doesn't share
      // references with the live trainer state.
      hallOfFame: trainer.hallOfFame.map(e => ({
        genome: N.cloneGenome(e.genome),
        params: e.params ? new Float64Array(e.params) : null,
        fitness: e.fitness,
        lastFitness: e.lastFitness,
        gen: e.gen,
      })),
      // Pareto-aware HoF: same clone discipline as the scalar HoF;
      // behavior vector is also typed-array-copied. Older checkpoints
      // without this field gracefully fall back to [] on restore.
      paretoHoF: (trainer.paretoHoF || []).map(e => ({
        genome: e.genome ? N.cloneGenome(e.genome) : null,
        params: e.params ? new Float64Array(e.params) : null,
        fitness: e.fitness,
        behavior: e.behavior ? new Float64Array(e.behavior) : null,
        gen: e.gen,
      })),
      history: trainer.history.slice(),
      neatCompatThresholdCurrent: trainer.neatCompatThresholdCurrent,
    };
    if (trainer.curriculum) {
      ckpt.curriculum = {
        currentGravity: trainer.curriculum.currentGravity,
        currentDamping: trainer.curriculum.currentDamping,
        consecHits: trainer.curriculum.consecHits,
        level: trainer.curriculum.level || 0,
        lastLevelChangeGen: trainer.curriculum.lastLevelChangeGen,
        phaseBestFitness: trainer.curriculum.phaseBestFitness,
        phaseBestGen: trainer.curriculum.phaseBestGen,
        phaseBestSource: trainer.curriculum.phaseBestSource,
        phaseStartGen: trainer.curriculum.phaseStartGen,
        // Preserve the per-level fitness rollup + level-up gen list so
        // a checkpoint rollback restores the HUD chart instead of
        // flashing it back to "no data yet".
        perLevelStats: (trainer.curriculum.perLevelStats || []).map(b => ({
          level: b.level, startGen: b.startGen, endGen: b.endGen,
          maxBest: b.maxBest, minBest: b.minBest,
          maxMedian: b.maxMedian, minMedian: b.minMedian,
          maxRetro: b.maxRetro != null ? b.maxRetro : -Infinity,
          retroSum: b.retroSum || 0,
          retroCount: b.retroCount || 0,
          gens: (b.gens || []).slice(),
        })),
        levelUpGens: (trainer.curriculum.levelUpGens || []).slice(),
        // Per-level Hall of Fame. Genomes are deep-cloned + params are
        // typed-array-copied so the checkpoint is fully decoupled from
        // the live state. Transplant queue is intentionally NOT saved:
        // it's a transient state between advanceCurriculumLevel and
        // the next selectAndMutate, and restoring it across save/load
        // could double-inject genomes at the wrong moment.
        perLevelHoF: (function () {
          const out = {};
          const src = trainer.curriculum.perLevelHoF || {};
          for (const lvl in src) {
            out[lvl] = (src[lvl] || []).map(e => ({
              genome: e.genome ? N.cloneGenome(e.genome) : null,
              params: e.params ? new Float64Array(e.params) : null,
              fitness: e.fitness,
              gen: e.gen,
            }));
          }
          return out;
        })(),
      };
    }
    if (trainer.cmaes) {
      ckpt.cmaes = {
        mean: new Float64Array(trainer.cmaes.mean),
        sigma: trainer.cmaes.sigma,
        C: new Float64Array(trainer.cmaes.C),
        pSigma: new Float64Array(trainer.cmaes.pSigma),
        pC: new Float64Array(trainer.cmaes.pC),
        B: new Float64Array(trainer.cmaes.B),
        D: new Float64Array(trainer.cmaes.D),
        generation: trainer.cmaes.generation,
      };
    }
    if (trainer.annealing) {
      ckpt.annealing = {
        currentT: trainer.annealing.currentT,
        generation: trainer.annealing.generation,
      };
    }
    if (trainer.pt) {
      ckpt.pt = {
        generation: trainer.pt.generation,
        cumulativeSwapAccepts: trainer.pt.cumulativeSwapAccepts,
      };
    }
    if (trainer.de) {
      ckpt.de = { generation: trainer.de.generation };
      // Each individual's targetParams + targetFitness already saved on the
      // population entries above, so DE state restores via population restore.
    }
    return ckpt;
  }

  function restoreCheckpoint(trainer, ckpt) {
    if (!ckpt) return false;
    trainer.generation = ckpt.generation;
    trainer.population = ckpt.population.map(p => {
      const item = {
        genome: N.cloneGenome(p.genome),
        params: p.params ? new Float64Array(p.params) : null,
        fitness: p.fitness,
      };
      if (p.chainBest !== undefined) item.chainBest = p.chainBest;
      if (p.chainBestParams) item.chainBestParams = new Float64Array(p.chainBestParams);
      if (p.tIndex !== undefined) item.tIndex = p.tIndex;
      if (p.targetParams) item.targetParams = new Float64Array(p.targetParams);
      if (p.targetFitness !== undefined) item.targetFitness = p.targetFitness;
      return item;
    });
    trainer.bestEver = ckpt.bestEver ? N.cloneGenome(ckpt.bestEver) : null;
    trainer.bestEverParams = ckpt.bestEverParams ? new Float64Array(ckpt.bestEverParams) : null;
    trainer.bestEverFitness = ckpt.bestEverFitness;
    trainer.bestEverHistory = ckpt.bestEverHistory.map(e => ({
      gen: e.gen,
      genome: N.cloneGenome(e.genome),
      fitness: e.fitness,
    }));
    // Restore Hall of Fame. Older checkpoints (without HoF) get an empty
    // array — the next gen rebuilds it from current best-ever as needed.
    trainer.paretoHoF = (ckpt.paretoHoF || []).map(e => ({
      genome: e.genome ? N.cloneGenome(e.genome) : null,
      params: e.params ? new Float64Array(e.params) : null,
      fitness: e.fitness,
      behavior: e.behavior ? new Float64Array(e.behavior) : null,
      gen: e.gen,
    }));
    trainer.hallOfFame = (ckpt.hallOfFame || []).map(e => ({
      genome: N.cloneGenome(e.genome),
      params: e.params ? new Float64Array(e.params) : null,
      fitness: e.fitness,
      lastFitness: e.lastFitness,
      gen: e.gen,
    }));
    trainer.history = ckpt.history.slice();
    trainer.neatCompatThresholdCurrent = ckpt.neatCompatThresholdCurrent != null
      ? ckpt.neatCompatThresholdCurrent
      : trainer.params.neatCompatThreshold;
    if (trainer.curriculum && ckpt.curriculum) {
      trainer.curriculum.currentGravity = ckpt.curriculum.currentGravity;
      trainer.curriculum.currentDamping = ckpt.curriculum.currentDamping;
      trainer.curriculum.consecHits = ckpt.curriculum.consecHits;
      trainer.curriculum.level = ckpt.curriculum.level || 0;
      trainer.curriculum.lastLevelChangeGen = ckpt.curriculum.lastLevelChangeGen;
      trainer.curriculum.phaseBestFitness = ckpt.curriculum.phaseBestFitness != null
        ? ckpt.curriculum.phaseBestFitness : -Infinity;
      trainer.curriculum.phaseBestGen = ckpt.curriculum.phaseBestGen != null
        ? ckpt.curriculum.phaseBestGen : null;
      trainer.curriculum.phaseBestSource = ckpt.curriculum.phaseBestSource || null;
      trainer.curriculum.phaseStartGen = ckpt.curriculum.phaseStartGen != null
        ? ckpt.curriculum.phaseStartGen : trainer.generation;
      // Restore per-level rollup + level-up gen list (older checkpoints
      // pre-dating these fields fall back to empty arrays; the HUD just
      // hides itself until enough new data accumulates).
      trainer.curriculum.perLevelStats = (ckpt.curriculum.perLevelStats || []).map(b => ({
        level: b.level, startGen: b.startGen, endGen: b.endGen,
        maxBest: b.maxBest, minBest: b.minBest,
        maxMedian: b.maxMedian, minMedian: b.minMedian,
        gens: (b.gens || []).slice(),
      }));
      trainer.curriculum.levelUpGens = (ckpt.curriculum.levelUpGens || []).slice();
      // Restore per-level HoF. Older checkpoints get an empty object and
      // the bucket fills back up from new gens organically.
      trainer.curriculum.perLevelHoF = (function () {
        const out = {};
        const src = ckpt.curriculum.perLevelHoF || {};
        for (const lvl in src) {
          out[lvl] = (src[lvl] || []).map(e => ({
            genome: e.genome ? N.cloneGenome(e.genome) : null,
            params: e.params ? new Float64Array(e.params) : null,
            fitness: e.fitness,
            gen: e.gen,
          }));
        }
        return out;
      })();
      // Transient state isn't checkpointed, but make sure the queue
      // exists on the restored object so later code can push into it.
      trainer.curriculum._transplantQueue = [];
    }
    if (trainer.cmaes && ckpt.cmaes) {
      trainer.cmaes.mean = new Float64Array(ckpt.cmaes.mean);
      trainer.cmaes.sigma = ckpt.cmaes.sigma;
      trainer.cmaes.C = new Float64Array(ckpt.cmaes.C);
      trainer.cmaes.pSigma = new Float64Array(ckpt.cmaes.pSigma);
      trainer.cmaes.pC = new Float64Array(ckpt.cmaes.pC);
      trainer.cmaes.B = new Float64Array(ckpt.cmaes.B);
      trainer.cmaes.D = new Float64Array(ckpt.cmaes.D);
      trainer.cmaes.generation = ckpt.cmaes.generation;
    }
    if (trainer.annealing && ckpt.annealing) {
      trainer.annealing.currentT = ckpt.annealing.currentT;
      trainer.annealing.generation = ckpt.annealing.generation;
    }
    if (trainer.pt && ckpt.pt) {
      trainer.pt.generation = ckpt.pt.generation;
      trainer.pt.cumulativeSwapAccepts = ckpt.pt.cumulativeSwapAccepts;
    }
    if (trainer.de && ckpt.de) {
      trainer.de.generation = ckpt.de.generation;
    }
    // Force the snapshot to repopulate on next step so the UI reflects the
    // restored state. We could rebuild it from population, but stats are
    // approximate without re-evaluation; let the next step refresh it.
    trainer.evaluatedSnapshot = null;
    trainer.lastStats = null;
    return true;
  }

  BF.trainer = {
    makeTrainer, step, instantiateSetup, evaluatePolicy, runTrial, makePolicy,
    resolveConfigsFromParams, usesFlatParamPolicy, resolvedPolicyConfig,
    setSetupId, newRun, topGenomes, curriculumReset,
    saveCheckpoint, restoreCheckpoint,
    // Curriculum metadata exposed for the UI: registry of ramp-able
    // params and a helper to evaluate a single spec at a given level
    // fraction. Keeps the UI from re-defining the same data.
    CURRICULUM_KNOBS, curriculumKnobByKey, curriculumApply,
    computeCurriculumPhases,
    // Behavior-space archive helpers — exposed so the UI can reconfigure
    // axes / bin resolution without poking trainer internals directly.
    configureBehaviorArchive, resetBehaviorArchive,
    // Exposed for tests + UI introspection. Pure function over the
    // trainer's params + gensSinceImprovement; safe to call between
    // steps to peek at what the next mutation scale will be.
    computeAdaptiveMutParams, speciatePopulation, isNeatMode, TOPOLOGY_PRESETS,
  };
})(window.BF);
