// Champion records preserve runnable policies, not just the placeholder graph
// used to draw a convolutional network in the population view.
(function (BF) {
  'use strict';
  const configKeys = { cnn: 'cnnConfig', cnn3d: 'cnn3dConfig', 'cnn-grid': 'cnnGridConfig', 'cnn-multiscale': 'cnnMultiscaleConfig', recurrent: 'recurrentConfig' };
  const modules = { cnn: 'cnn', cnn3d: 'cnn3d', 'cnn-grid': 'cnnGrid', 'cnn-multiscale': 'cnnMultiscale', recurrent: 'recurrent' };
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function genomeCopy(g) {
    if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.conns)) throw new Error('Missing champion network.');
    return { numInputs: g.numInputs, numOutputs: g.numOutputs, nodes: copy(g.nodes), conns: copy(g.conns) };
  }
  function finiteTree(value) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Champion contains a non-finite number.');
    if (value && typeof value === 'object') for (const v of Object.values(value)) finiteTree(v);
  }
  function validate(record) {
    if (!record || !['bf-genome-v1', 'bf-policy-v2'].includes(record.kind)) throw new Error('Not a BalanceForge champion file.');
    finiteTree(record);
    const g = record.genome;
    if (!g || !Number.isInteger(g.numInputs) || g.numInputs < 1 || !Number.isInteger(g.numOutputs) || g.numOutputs < 1 || !Array.isArray(g.nodes) || !Array.isArray(g.conns)) throw new Error('Invalid network dimensions.');
    const type = record.policyType || 'mlp';
    if (record.kind === 'bf-policy-v2' && !['mlp', ...Object.keys(configKeys)].includes(type)) throw new Error('Unsupported saved policy type: ' + type);
    if (configKeys[type]) {
      if (!record.config || !Array.isArray(record.params)) throw new Error('This policy needs its architecture and trained weights.');
      const mod = BF[modules[type]];
      if (!mod || typeof mod.paramCount !== 'function') throw new Error('Policy module is unavailable: ' + type);
      for (const [key, value] of Object.entries(record.config)) {
        if (typeof value === 'number' && Math.abs(value) > 100000) throw new Error('Invalid policy configuration: ' + key);
      }
      const count = mod.paramCount(record.config);
      if (!Number.isSafeInteger(count) || count <= 0 || count > 2000000 || record.params.length !== count) throw new Error('Saved weights do not match the policy architecture.');
      if (record.config.numOutputs != null && record.config.numOutputs !== g.numOutputs) throw new Error('Saved policy output count does not match its network.');
      if (record.params.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid trained policy weights.');
    }
    if (record.kind === 'bf-genome-v1' && /cmaes/.test(record.algo || '') && !g.conns.length) throw new Error('This legacy file contains only a placeholder graph. Re-export the original CNN with its weights.');
    return record;
  }
  function capture(trainer, extra, target) {
    const t = target || { genome: trainer.bestEver, params: trainer.bestEverParams, fitness: trainer.bestEverFitness, generation: trainer.generation };
    const inherited = trainer._installedChampionProvenance?.genome === t.genome
      ? copy(trainer._installedChampionProvenance.metadata) : {};
    const type = trainer.params.policyType || 'mlp';
    if (trainer.params.useHybridCnn) throw new Error('Hybrid frozen-CNN archives are not supported yet; use the full in-memory checkpoint.');
    const record = Object.assign({
      kind: 'bf-policy-v2', algo: trainer.params.mode || 'neat', policyType: type,
      setupId: trainer.setupId, fitness: Number.isFinite(t.fitness) ? t.fitness : null,
      generation: t.generation == null ? trainer.generation : t.generation,
      savedAt: new Date().toISOString(), seed: trainer.seed,
      genome: genomeCopy(t.genome), trainerParams: copy(trainer.params),
      config: configKeys[type] ? copy(trainer[configKeys[type]]) : null,
      params: configKeys[type] && t.params ? Array.from(t.params) : null,
    }, inherited, copy(extra || {}));
    return validate(record);
  }
  function install(trainer, record) {
    validate(record);
    const type = record.policyType || 'mlp';
    if (record.setupId && record.setupId !== trainer.setupId) throw new Error('Load the saved scene before installing its policy.');
    const setup = BF.setups.getSetup(trainer.setupId);
    if (setup.observationCount !== record.genome.numInputs || (setup.actionCount || 1) !== record.genome.numOutputs) throw new Error('Saved network dimensions do not match the scene.');
    const genome = genomeCopy(record.genome);
    trainer.params.policyType = type;
    trainer.bestEver = genome;
    // Keep provenance only while exporting this exact installed controller.
    // A new evolved champion must not inherit an old controller's audit.
    trainer._installedChampionProvenance = {genome,metadata:copy({
      trainingMethod:record.trainingMethod,audit:record.audit,name:record.name
    })};
    trainer.bestEverParams = configKeys[type] ? new Float64Array(record.params) : null;
    if (configKeys[type]) {
      trainer.params[configKeys[type]] = copy(record.config);
      trainer[configKeys[type]] = copy(record.config);
    }
    trainer.bestEverFitness = Number.isFinite(record.fitness) ? record.fitness : -Infinity;
    trainer.hallOfFame = [{ genome: genomeCopy(genome), params: trainer.bestEverParams ? new Float64Array(trainer.bestEverParams) : null, fitness: trainer.bestEverFitness, gen: trainer.generation }];
    return trainer;
  }
  function presetOf(record) {
    validate(record);
    const p = copy(record.trainerParams || {});
    const aliases = { populationSize: 'popSize', rolloutsPerAgent: 'rollouts', cmaesHiddenSize: 'cmaesHidden', cmaesHiddenLayers: 'cmaesLayers', startTiltDeg: 'tiltDeg', startTiltSpreadDeg: 'tiltSpreadDeg' };
    for (const [key, alias] of Object.entries(aliases)) if (p[key] != null) p[alias] = p[key];
    if (Number.isFinite(p.startAngleRange)) p.tiltDeg = p.startAngleRange * 180 / Math.PI;
    Object.assign(p, copy(record.uiParams || {}));
    if (record.config) {
      const maps = record.policyType === 'cnn' ? { imageSize: 'cnnImageSize', numFilters: 'cnnFilters', denseHidden: 'cnnDense', historyLen: 'cnnHistory', numChannels: 'cnnChannels' }
        : record.policyType === 'cnn3d' ? { inputMode: 'cnn3dInputMode', depthSize: 'cnn3dDepth', imageSize: 'cnn3dImageSize', numFilters: 'cnn3dFilters', filterDepth: 'cnn3dFilterDepth', denseHidden: 'cnn3dDense' }
        : record.policyType === 'cnn-multiscale' ? { localGridSize: 'cnnMultiscaleSize', numFilters: 'cnnMultiscaleFilters', denseHidden: 'cnnMultiscaleDense' } : {};
      for (const [key, id] of Object.entries(maps)) if (record.config[key] != null) p[id] = record.config[key];
    }
    // A graph's inference format does not identify how its weights were fit.
    // Retain teacher provenance for imitation, but never invent a teacher for
    // a continuation of an already learned NEAT population.
    const method = record.trainingMethod || '';
    const learnedWithNeat = /\bNEAT\b.*\b(?:refinement|continuation|optimization)\b/i.test(method)
      || /^(?:full\s+)?NEAT\b/i.test(method);
    const teacherInitialized = /\b(?:teacher|imitation|distillation|DAgger)\b/i.test(method);
    const freshTraining = /^neat/i.test(record.algo || 'neat')
      ? 'Train starts a fresh NEAT population' : 'Train starts a fresh training run';
    const approach = record.algo === 'ppo' ? {
      kind:'gradient',learns:true,label:'PPO · actor–critic backpropagation',action:'Train fresh PPO',
      detail:'Replay uses the saved deterministic actor. '+(record.audit?.method || '')+
        ' Train starts a fresh actor–critic experiment; this policy export does not resume the optimizer.'
    } : record.trainingMethod ? {
      kind: learnedWithNeat ? 'neat' : teacherInitialized ? 'imitation' : 'neural', learns:true,
      label:record.trainingMethod, action:/^neat/i.test(record.algo || 'neat') ? 'Train fresh NEAT' : 'Train fresh network',
      detail:'Replay uses the saved neural policy. '+(record.audit?.provenance || record.audit?.method || '')+
        (teacherInitialized
          ? ' The teacher is not evaluated during playback. '+freshTraining+'; it does not repeat the offline teacher-fitting pipeline.'
          : ' '+freshTraining+'; it does not resume the saved optimizer or evolutionary state.')
    } : undefined;
    return { label: 'Loaded champion', description: 'Replay a saved trained policy in its recorded scene; training starts with a fresh population.', setupId: record.setupId, mode: record.algo || 'neat', policyType: record.policyType || 'mlp', objectiveId: p.objectiveId || 'balance_up', params: p, approach, curriculum: { enabled: false }, importedPolicyConfig: record.config ? { type: record.policyType, config: copy(record.config) } : null };
  }
  BF.championIO = { capture, validate, install, presetOf, configKeys };
})(window.BF);
