// BalanceForge eval worker — runs policy rollouts off the main thread.
//
// Per-worker lifecycle:
//   1. Worker is constructed by the pool with `new Worker('js/eval_worker.js')`.
//   2. Polyfill `self.window = self` so the existing IIFE modules
//      (which all do `window.BF = ...` to register on the namespace)
//      work unmodified in this context.
//   3. importScripts() loads every module the eval path touches.
//   4. The worker waits for an `init` message containing the setup id,
//      params, and seed. It builds a local trainer instance from them.
//      Building the trainer here (instead of receiving a serialized
//      copy) avoids round-tripping the heavy population each gen.
//   5. On each `evalBatch` message, the worker iterates the (genome,
//      angle) pairs, builds the policy from the genome, runs
//      evaluatePolicy, and posts back the fitnesses.
//
// Module list mirrors the order in smoke-test.js. If you add a new
// dependency that's pulled in by trainer.js / setups.js, add it here.
self.window = self;
// global is set up by some Node-aware modules; harmless to mirror.
self.global = self;

// Version dependencies too: refreshing only the worker URL does not refresh
// separately cached imports, which could silently evaluate an older objective.
importScripts(...[
  'util.js',
  'physics.js',
  'pendulum_initial_state.js',
  // Chain-family build deps — setups.js's chain-reach/chain-trace buildWorld
  // resolves material via BF.chainMaterials, the moving curve via
  // BF.chainTraceCurves, and (when joints are actuated) physics.integrate +
  // applyChainJointCmds use BF.chainJoint. Without these the worker throws on
  // any chain world → the parallel generation's eval never returns (gen stuck).
  'chain_materials.js',
  'chain_trace_curves.js',
  'chain_joint.js',
  // Dodge attack-pattern registry. setups.js makeDodge resolves its bullet
  // pattern via BF.dodgePatterns at buildWorld time. UNLIKE the chain deps it
  // fails SILENTLY when missing (makeDodge guards `BF.dodgePatterns &&` -> the
  // pattern is null -> NO bullets spawn, no throw), so a worker without this
  // evaluated every dodge policy against an EMPTY field: everyone "survived",
  // fitness was flat-high, the champion never learned to dodge, and the display
  // (main thread, which DOES load dodge_patterns.js) showed it dying. That is
  // the parallel-only "flat-high fitness / bad result / curve differs in full
  // power mode" bug. Guarded in smoke-test.js.
  'dodge_patterns.js',
  // Fourier/epicycle decomposition. Same HARD dependency class as the chain
  // deps above: setups.js's `epicycle` buildWorld THROWS without it, so a
  // worker missing this file makes the parallel generation's eval never
  // return (gen stuck), not merely wrong.
  'curve_fourier.js',
  'setups.js',
  'neat.js',
  'objectives.js',
  'ball.js',
  'behaviors.js',
  'adversarial.js',
  'pca.js',
  'cmaes.js',
  'annealing.js',
  'parallel_tempering.js',
  'de.js',
  'pso.js',
  'random_search.js',
  'naive_baselines.js',
  'swarms.js',
  'cnn_policy.js',
  'cnn3d_policy.js',
  'cnn_grid_policy.js',
  'cnn_multiscale_policy.js',
  'cnn_neat_hybrid_policy.js',
  // Recurrent (leaky-integrator memory) policy. trainer.makePolicy dispatches
  // `policyType === 'recurrent'` to BF.recurrent.policy() with no guard, and
  // resolveCnnConfigs (which the skipPopulation path runs) calls
  // BF.recurrent.paramCount for the dimension -- so a worker without this file
  // throws once per batch on the memory presets.
  'recurrent_policy.js',
  // Hand-coded reference controllers. trainer.makePolicy dispatches
  // `policyType === 'fixed-baseline'` straight to BF.baselinePolicy.policy()
  // with NO guard, so a worker without this threw
  //   TypeError: Cannot read properties of undefined (reading 'policy')
  // once per batch for dodge-baseline-still / dodge-baseline-wall-wedge —
  // the two presets that define the floor every dodge number is quoted
  // against. Reproduced by loading exactly this list and calling makePolicy.
  'baseline_policy.js',
  'disturbances.js',
  'trainer.js',
  // DELIBERATELY ABSENT: wasm_loader.js. Every BF.wasm call site is fully
  // guarded (`window.BF.wasm && ...ready && ...`), so workers simply fall
  // back to the JS path. Adding it is not a one-line change — the worker
  // would have to fetch and instantiate the binary itself, and if the WASM
  // and JS forward passes are not bit-identical it would make parallel eval
  // disagree with serial. Left out on purpose; the smoke guard below knows.
].map(source => source + '?v=20260909-control-2'));

const BF = self.BF;

let trainer = null;

function ensureGenomeOrder(g) {
  // Genomes carry a topo-cache (_order) for fast forward eval; the
  // cache is null after structuredClone over postMessage. The
  // policy/forward path lazily rebuilds it on first use, so we just
  // make sure the slot exists.
  if (g && g._order === undefined) g._order = null;
  return g;
}

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.kind === 'init') {
      // Chain ACTION/OBSERVATION SHAPE parity: the chain setups carry
      // actionCount/observationCount on the SETUP INSTANCE (set by app.js's
      // setActionShape/setObservationShape seam), which a fresh worker never
      // sees — so actuated/telescoping chains would silently evaluate with
      // cart-only commands here (same silent-divergence class as the
      // dodge_patterns lesson at the top of this file). Re-apply from params.
      {
        const su = BF.setups.getSetup(msg.setupId);
        if (su && typeof su.setObservationShape === 'function'
            && msg.params && msg.params.numSegments != null) {
          su.setObservationShape({
            numSegments: msg.params.numSegments,
            // Lookahead parity: +4 anticipation inputs on chain-trace. Without
            // re-applying this, a fresh worker keeps the 17-input default and
            // buildObservation truncates the lookahead features for a genome
            // sized 21 — the exact silent-divergence class documented above.
            lookahead: !!msg.params.chainTraceLookahead,
          });
        }
        if (su && typeof su.setActionShape === 'function' && msg.params) {
          su.setActionShape({
            numActuatedJoints: msg.params.numActuatedJoints || 0,
            telescope: !!msg.params.chainTelescope,
          });
        }
        // Epicycle ARM-COUNT parity. Same silent-divergence class as the chain
        // shapes above, and it bites in BOTH directions: the arm count sets the
        // observation width (2 per arm) AND, in 'rate' drive, the action width.
        // A fresh worker defaults to 8 arms, so a 12-arm preset would evaluate
        // every genome against a 21-input/8-output world while the genome is
        // sized 29/12. Note the generic setActionShape call just above would
        // ALSO have clobbered this setup's telescope flag from chainTelescope,
        // which is why this branch re-applies the whole shape, not just numArms.
        if (msg.setupId === 'epicycle' && su && msg.params) {
          const reco = BF.curveFourier
            ? BF.curveFourier.recommend(msg.params.curveId || 'autograph') : { N: 8 };
          const numArms = (msg.params.epiArms != null) ? msg.params.epiArms : reco.N;
          if (typeof su.setObservationShape === 'function') su.setObservationShape({ numArms: numArms });
          if (typeof su.setActionShape === 'function') {
            su.setActionShape({
              numArms: numArms,
              drive: msg.params.epiDrive || 'analytic',
              telescope: !!msg.params.epiTelescope,
            });
          }
        }
        // Dodge OBSERVATION-MODE parity: the dodge setup's observationCount is
        // set on the INSTANCE by setObservationMode (main thread does this in
        // syncSetupObservationCounts). A fresh worker never sees it, so it
        // keeps the default topk count (36) — and buildObservation sizes its
        // Float64Array from this.observationCount, silently TRUNCATING the
        // extra features of topk-danger (45) / grid (260) / multiscale (548) /
        // radar (56) to zero in every worker. Re-apply from params (same
        // silent-divergence class as the chain shapes above + dodge_patterns).
        if (msg.setupId === 'dodge' && su && typeof su.setObservationMode === 'function' && msg.params && msg.params.dodgeObservationMode) {
          su.setObservationMode(msg.params.dodgeObservationMode);
        }
        // Single-pendulum OBSERVATION-MODE parity — the memory task. This one
        // does NOT change the observation WIDTH (6 either way), so nothing
        // downstream would resize and nothing would throw: a worker left in
        // 'full' would simply hand every genome the UNMASKED world, with the
        // velocity channels live and a fresh reading every step. That is the
        // easiest task in the file, so parallel eval would report a solved
        // memory task while the serial path and the live display showed the
        // real one. The trainer ALSO threads singleObservationMode /
        // singleDropoutK into buildWorld (so the state-carried copy is already
        // right); this re-application keeps the SETUP SINGLETON in sync too,
        // which is what observationLabels and the buildWorld fallback read.
        if (msg.setupId === 'single' && su && typeof su.setObservationMode === 'function'
            && msg.params && msg.params.singleObservationMode) {
          su.setObservationMode(msg.params.singleObservationMode,
            { dropoutK: msg.params.singleDropoutK });
        }
        // Double-pendulum observation semantics are part of the saved task.
    if ((msg.setupId === 'double' || msg.setupId === 'triple') && su && typeof su.setObservationMode === 'function') {
          su.setObservationMode((msg.params && msg.params.pendulumObservationMode) || 'legacy');
        }
        // The three terrain encodings are 50 (summary) / 198 (patch) / 242 (both) inputs
        // wide; a fresh worker would keep the 50-wide default and every genome
        // trained on 'patch' or 'both' would be scored against a policy reading
        // the wrong slice of the world. Re-apply from params.
        if (msg.setupId === 'terrain-run' && su && typeof su.setObservationMode === 'function'
            && msg.params && msg.params.terrainObservationMode) {
          su.setObservationMode(msg.params.terrainObservationMode);
        }
      }
      // Build a trainer locally with the SAME seed/setup/params as
      // the main thread. We never run T.step here -- this trainer is
      // just an evaluation context. Population stays empty; we eval
      // genomes the main thread sends us.
      trainer = BF.trainer.makeTrainer({
        setupId: msg.setupId,
        seed: msg.seed,
        params: msg.params,
        mutationParams: msg.mutationParams || {},
        // We only ever call evaluatePolicy here; the gen-0 population
        // makeTrainer would build is never touched. Skipping it saves
        // populationSize genome constructions per worker per spawn
        // (huge for pop=500 presets).
        skipPopulation: true,
      });
      self.postMessage({ kind: 'inited', workerId: msg.workerId });
      return;
    }
    if (msg.kind === 'evalBatch') {
      if (!trainer) {
        self.postMessage({ kind: 'error', id: msg.id, error: 'worker not initialized' });
        return;
      }
      // Two response modes:
      //   - 'fitnessOnly' (default, for the standalone bench): a
      //     transferable Float64Array of fitnesses. Cheap; no behavior
      //     descriptors round-tripped.
      //   - 'fullResults' (training integration): an array of plain
      //     objects { fitness, behavior, setupBehavior }. Required so
      //     the trainer can accumulate behavior descriptors / setup-
      //     specific descriptors the same way the serial path does.
      const fullResults = !!msg.fullResults;
      const fitnesses = fullResults ? null : new Float64Array(msg.tasks.length);
      const results = fullResults ? new Array(msg.tasks.length) : null;
      for (let i = 0; i < msg.tasks.length; i++) {
        const task = msg.tasks[i];
        const genome = ensureGenomeOrder(task.genome);
        const target = task.params
          ? { genome, params: task.params, config: task.config || null }
          : { genome };
        // Per-task overlays (adversarial env, golf hole jitter). The
        // serial trainer mutates these on `trainer` before each call;
        // we do the same here so the eval path is bit-identical.
        trainer._envOverlay = task.envOverlay || null;
        trainer._holeJitter = task.holeJitter || 0;
        // Per-rollout dodge bullet-pattern seed, computed on the main thread
        // (dodgePatternSeedFor) so the worker faces the SAME pattern the serial
        // path would. Only the dodge setup reads it; null for every other setup.
        trainer._dodgeSeed = (task.dodgeSeed != null ? task.dodgeSeed : null);
        // Reseed trainer.rng deterministically per task. The main
        // thread pre-sampled one seed per rollout (same seed across
        // all individuals at the same rollout r), so disturbance
        // patterns are FAIR within a gen regardless of which worker
        // runs each task. Without this each worker's local rng
        // diverged across gens and the same genome scored
        // inconsistently on retry -- selection signal got buried in
        // disturbance noise and convergence slowed visibly.
        if (task.seed != null) trainer.rng.seed(task.seed);
        // Apply the main thread's CURRENT curriculum state. Three
        // channels matter for evaluation:
        //   - level (passed below as levelOverride) drives the spec-
        //     based curriculum overlay (gravity/damping/tilt/...).
        //   - currentGravity / currentDamping are LEGACY ramped values
        //     used by instantiateSetup as a fallback when a param has
        //     no curriculum spec. Workers initialized these to the
        //     start-of-run values and never updated, so without this
        //     the worker's damping was ~3-8x the main thread's at
        //     level 17 and the simulation physics diverged hard.
        if (task.currentGravity != null && trainer.curriculum) {
          trainer.curriculum.currentGravity = task.currentGravity;
        }
        if (task.currentDamping != null && trainer.curriculum) {
          trainer.curriculum.currentDamping = task.currentDamping;
        }
        // task.level pins evaluatePolicy to the main thread's CURRENT
        // curriculum level via the levelOverride argument. Without it
        // the worker's local trainer.curriculum.level stays at 0 and
        // every rollout runs at the EASIEST curriculum level.
        const result = BF.trainer.evaluatePolicy(trainer, target, false, task.angle, task.level);
        trainer._envOverlay = null;
        trainer._holeJitter = 0;
        trainer._dodgeSeed = null;
        if (fullResults) {
          // Behavior arrays are typed; convert to plain arrays so
          // structured-clone doesn't choke on the typed-array buffer
          // ownership semantics. Cheap (small arrays).
          let beh = null;
          if (result && result.behavior) {
            beh = Array.from(result.behavior);
          }
          results[i] = {
            fitness: result ? result.fitness : 0,
            behavior: beh,
            setupBehavior: result && result.setupBehavior ? result.setupBehavior : null,
          };
        } else {
          fitnesses[i] = result ? result.fitness : 0;
        }
      }
      if (fullResults) {
        self.postMessage({ kind: 'evalBatchDone', id: msg.id, results });
      } else {
        // Transfer the typed array so we don't pay a copy on the way back.
        self.postMessage(
          { kind: 'evalBatchDone', id: msg.id, fitnesses: fitnesses },
          [fitnesses.buffer],
        );
      }
      return;
    }
    if (msg.kind === 'terminate') {
      self.close();
      return;
    }
  } catch (err) {
    // 'init' has no request id, so a generic {kind:'error'} would be
    // swallowed by the pool ("error (no pending)") and the pool would
    // hang forever waiting for an 'inited' that never comes. Post a
    // DISTINCT, id-less initError so the pool can deterministically
    // react (degrade to serial) instead of bricking training. evalBatch
    // failures keep the id-carrying 'error' path.
    if (msg && msg.kind === 'init') {
      self.postMessage({
        kind: 'initError',
        workerId: msg.workerId,
        error: String(err && err.stack || err),
      });
    } else {
      self.postMessage({ kind: 'error', id: msg && msg.id, error: String(err && err.stack || err) });
    }
  }
};
