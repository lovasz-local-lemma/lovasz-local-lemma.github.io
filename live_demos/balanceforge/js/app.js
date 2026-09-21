// BalanceForge — main app wiring.
// Two loops:
//   Render loop @ 60fps: simulates the displayed best agent and draws all canvases.
//   Training loop: runs generations as fast as possible (yielding to the event loop).

(function (BF) {
  'use strict';
  const N = BF.neat;
  const P = BF.physics;
  const T = BF.trainer;
  const { clamp, fmt } = BF.util;

  const dom = {
    setupSelect: document.getElementById('setupSelect'),
    runPresetSelect: document.getElementById('runPresetSelect'),
    selectedPresetSelect: document.getElementById('selectedPresetSelect'),
    presetTags: document.getElementById('presetTags'),
    presetDesc: document.getElementById('presetDesc'),
    compareWithPresetSelect: document.getElementById('compareWithPresetSelect'),
    compareBadge:            document.getElementById('compareBadge'),
    compareBadgeText:        document.getElementById('compareBadgeText'),
    tiltDirection: document.getElementById('tiltDirection'),
    trainBtn: document.getElementById('trainBtn'),
    testBtn: document.getElementById('testBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    saveBtn: document.getElementById('saveBtn'),
    restoreBtn: document.getElementById('restoreBtn'),
    exportBestBtn: document.getElementById('exportBestBtn'),
    importBestBtn: document.getElementById('importBestBtn'),
    archiveBtn: document.getElementById('archiveBtn'),
    archivePopover: document.getElementById('archivePopover'),
    archiveShowMemHoF: document.getElementById('archiveShowMemHoF'),
    archiveCloseBtn: document.getElementById('archiveCloseBtn'),
    archiveNameInput: document.getElementById('archiveNameInput'),
    archiveSaveBtn: document.getElementById('archiveSaveBtn'),
    archiveList: document.getElementById('archiveList'),
    archiveHint: document.getElementById('archiveHint'),
    archiveExportAllBtn: document.getElementById('archiveExportAllBtn'),
    archiveImportBundleBtn: document.getElementById('archiveImportBundleBtn'),
    archiveImportBundleInput: document.getElementById('archiveImportBundleInput'),
    importBestInput: document.getElementById('importBestInput'),
    seedInput: document.getElementById('seedInput'),
    seedCopyBtn: document.getElementById('seedCopyBtn'),
    resetBtn: document.getElementById('resetBtn'),
    newRunBtn: document.getElementById('newRunBtn'),
    editBtn: document.getElementById('editBtn'),
    curriculumTopbarBtn: document.getElementById('curriculumTopbarBtn'),
    curriculumListBtn: document.getElementById('curriculumListBtn'),
    curriculumListFloating: document.getElementById('curriculumListFloating'),
    curriculumListEmpty: document.getElementById('curriculumListEmpty'),

    // Algorithm mode
    modeSelect: document.getElementById('modeSelect'),
    modeHelpBtn: document.getElementById('modeHelpBtn'),
    algoExplain: document.getElementById('algoExplain'),
    neatInitialHidden: document.getElementById('neatInitialHidden'),
    useHybridCnn:           document.getElementById('useHybridCnn'),
    useHybridCnnRow:        document.getElementById('useHybridCnnRow'),
    hybridIncludeTopK:      document.getElementById('hybridIncludeTopK'),
    hybridIncludeTopKRow:   document.getElementById('hybridIncludeTopKRow'),
    neatInitialHiddenVal: document.getElementById('neatInitialHiddenVal'),
    neatInitialHiddenRow: document.getElementById('neatInitialHiddenRow'),
    neatTopologyPreset: document.getElementById('neatTopologyPreset'),
    neatHiddenActivation: document.getElementById('neatHiddenActivation'),
    showExperimentalActs: document.getElementById('showExperimentalActs'),
    mixtureRegime: document.getElementById('mixtureRegime'),
    actPalette: document.getElementById('actPalette'),
    actMutable: document.getElementById('actMutable'),
    mixtureAxesCard: document.getElementById('mixtureAxesCard'),
    actMutableRow: document.getElementById('actMutableRow'),
    maxFunctionsPerNode: document.getElementById('maxFunctionsPerNode'),
    maxFunctionsPerNodeVal: document.getElementById('maxFunctionsPerNodeVal'),
    mixtureCombine: document.getElementById('mixtureCombine'),
    mixturePenalty: document.getElementById('mixturePenalty'),
    mixturePenaltyVal: document.getElementById('mixturePenaltyVal'),
    neatTopologyRow: document.getElementById('neatTopologyRow'),
    neatTopologyHint: document.getElementById('neatTopologyHint'),
    workerBenchBtn: document.getElementById('workerBenchBtn'),
    workerBenchVal: document.getElementById('workerBenchVal'),
    parallelEvalOn: document.getElementById('parallelEvalOn'),
    parallelEvalStatus: document.getElementById('parallelEvalStatus'),
    cmaesHidden: document.getElementById('cmaesHidden'),
    cmaesHiddenVal: document.getElementById('cmaesHiddenVal'),
    cmaesHiddenRow: document.getElementById('cmaesHiddenRow'),
    cmaesLayers: document.getElementById('cmaesLayers'),
    cmaesLayersVal: document.getElementById('cmaesLayersVal'),
    cmaesLayersRow: document.getElementById('cmaesLayersRow'),
    cmaesSigma: document.getElementById('cmaesSigma'),
    cmaesSigmaVal: document.getElementById('cmaesSigmaVal'),
    cmaesSigmaRow: document.getElementById('cmaesSigmaRow'),
    useCNN: document.getElementById('useCNN'),                  // legacy — replaced by policyTypeSelect, kept null-safe in case absent
    policyTypeSelect: document.getElementById('policyTypeSelect'),
    cnn3dConfigBlock: document.getElementById('cnn3dConfigBlock'),
    cnnMultiscaleConfigBlock: document.getElementById('cnnMultiscaleConfigBlock'),
    cnnMultiscaleSize: document.getElementById('cnnMultiscaleSize'),
    cnnMultiscaleSizeVal: document.getElementById('cnnMultiscaleSizeVal'),
    cnnMultiscaleFilters: document.getElementById('cnnMultiscaleFilters'),
    cnnMultiscaleFiltersVal: document.getElementById('cnnMultiscaleFiltersVal'),
    cnnMultiscaleDense: document.getElementById('cnnMultiscaleDense'),
    cnnMultiscaleDenseVal: document.getElementById('cnnMultiscaleDenseVal'),
    cnnMultiscaleParamsHint: document.getElementById('cnnMultiscaleParamsHint'),
    cnn3dInputMode: document.getElementById('cnn3dInputMode'),
    cnn3dDepth: document.getElementById('cnn3dDepth'),
    cnn3dDepthVal: document.getElementById('cnn3dDepthVal'),
    cnn3dImageSize: document.getElementById('cnn3dImageSize'),
    cnn3dImageSizeVal: document.getElementById('cnn3dImageSizeVal'),
    cnn3dFilters: document.getElementById('cnn3dFilters'),
    cnn3dFiltersVal: document.getElementById('cnn3dFiltersVal'),
    cnn3dFilterDepth: document.getElementById('cnn3dFilterDepth'),
    cnn3dFilterDepthVal: document.getElementById('cnn3dFilterDepthVal'),
    cnn3dDense: document.getElementById('cnn3dDense'),
    cnn3dDenseVal: document.getElementById('cnn3dDenseVal'),
    cnn3dVizMode: document.getElementById('cnn3dVizMode'),
    cnn3dParamsHint: document.getElementById('cnn3dParamsHint'),
    cnn3dInset: document.getElementById('cnn3dInset'),
    cnn3dInsetCanvas: document.getElementById('cnn3dInsetCanvas'),
    cnn3dInsetLabel: document.getElementById('cnn3dInsetLabel'),
    cnnPolicyRow: document.getElementById('cnnPolicyRow'),
    // Recurrent (leaky-integrator memory) policy — see js/recurrent_policy.js.
    recurrentConfigBlock: document.getElementById('recurrentConfigBlock'),
    recurrentMem: document.getElementById('recurrentMem'),
    recurrentMemVal: document.getElementById('recurrentMemVal'),
    recurrentHidden: document.getElementById('recurrentHidden'),
    recurrentHiddenVal: document.getElementById('recurrentHiddenVal'),
    recurrentLeak: document.getElementById('recurrentLeak'),
    recurrentLeakVal: document.getElementById('recurrentLeakVal'),
    recurrentSever: document.getElementById('recurrentSever'),
    recurrentParamsHint: document.getElementById('recurrentParamsHint'),
    // Single-pendulum observation dropout (the memory task) — see setups.js.
    singleObsBlock: document.getElementById('singleObsBlock'),
    singleObservationMode: document.getElementById('singleObservationMode'),
    singleDropoutK: document.getElementById('singleDropoutK'),
    singleDropoutKVal: document.getElementById('singleDropoutKVal'),
    singleDropoutKRow: document.getElementById('singleDropoutKRow'),
    cnnConfigBlock: document.getElementById('cnnConfigBlock'),
    cnnImageSize: document.getElementById('cnnImageSize'),
    cnnImageSizeVal: document.getElementById('cnnImageSizeVal'),
    cnnFilters: document.getElementById('cnnFilters'),
    cnnFiltersVal: document.getElementById('cnnFiltersVal'),
    cnnDense: document.getElementById('cnnDense'),
    cnnDenseVal: document.getElementById('cnnDenseVal'),
    cnnHistory: document.getElementById('cnnHistory'),
    cnnHistoryVal: document.getElementById('cnnHistoryVal'),
    cnnChannels: document.getElementById('cnnChannels'),
    cnnParamsHint: document.getElementById('cnnParamsHint'),
    annealingT0: document.getElementById('annealingT0'),
    annealingT0Val: document.getElementById('annealingT0Val'),
    annealingT0Row: document.getElementById('annealingT0Row'),
    annealingCooling: document.getElementById('annealingCooling'),
    annealingCoolingVal: document.getElementById('annealingCoolingVal'),
    annealingCoolingRow: document.getElementById('annealingCoolingRow'),
    ptTmin: document.getElementById('ptTmin'),
    ptTminVal: document.getElementById('ptTminVal'),
    ptTminRow: document.getElementById('ptTminRow'),
    ptTmax: document.getElementById('ptTmax'),
    ptTmaxVal: document.getElementById('ptTmaxVal'),
    ptTmaxRow: document.getElementById('ptTmaxRow'),
    ptSwapInterval: document.getElementById('ptSwapInterval'),
    ptSwapIntervalVal: document.getElementById('ptSwapIntervalVal'),
    ptSwapRow: document.getElementById('ptSwapRow'),
    deF: document.getElementById('deF'),
    deFVal: document.getElementById('deFVal'),
    deFRow: document.getElementById('deFRow'),
    deCR: document.getElementById('deCR'),
    deCRVal: document.getElementById('deCRVal'),
    deCRRow: document.getElementById('deCRRow'),
    gdEpsilon: document.getElementById('gdEpsilon'),
    gdEpsilonVal: document.getElementById('gdEpsilonVal'),
    gdEpsilonRow: document.getElementById('gdEpsilonRow'),
    gdAlphaInit: document.getElementById('gdAlphaInit'),
    gdAlphaInitVal: document.getElementById('gdAlphaInitVal'),
    gdAlphaInitRow: document.getElementById('gdAlphaInitRow'),
    nesSigma: document.getElementById('nesSigma'),
    nesSigmaVal: document.getElementById('nesSigmaVal'),
    nesSigmaRow: document.getElementById('nesSigmaRow'),
    nesLR: document.getElementById('nesLR'),
    nesLRVal: document.getElementById('nesLRVal'),
    nesLRRow: document.getElementById('nesLRRow'),
    lineSearchPanel: document.getElementById('lineSearchPanel'),
    lineSearchCanvas: document.getElementById('lineSearchCanvas'),
    gradFlowPanel: document.getElementById('gradFlowPanel'),
    gradFlowCanvas: document.getElementById('gradFlowCanvas'),
    plannerVizPanel: document.getElementById('plannerVizPanel'),
    plannerVizCanvas: document.getElementById('plannerVizCanvas'),
    lineSearchHint: document.getElementById('lineSearchHint'),
    annealBadge: document.getElementById('annealBadge'),
    annealBadgeText: document.getElementById('annealBadgeText'),
    staleBadge: document.getElementById('staleBadge'),
    escapeBadge: document.getElementById('escapeBadge'),
    escapeBadgeText: document.getElementById('escapeBadgeText'),
    ballBadge: document.getElementById('ballBadge'),
    ballBadgeText: document.getElementById('ballBadgeText'),
    safetyBadge: document.getElementById('safetyBadge'),
    safetyBadgeText: document.getElementById('safetyBadgeText'),
    dodgeStatsBadge: document.getElementById('dodgeStatsBadge'),
    dodgeStatsBadgeText: document.getElementById('dodgeStatsBadgeText'),
    staleBadgeText: document.getElementById('staleBadgeText'),
    algoInternalsTitle: document.getElementById('algoInternalsTitle'),
    algoInternalsHint: document.getElementById('algoInternalsHint'),

    // Training params
    popSize: document.getElementById('popSize'),
    eliteRatio: document.getElementById('eliteRatio'),
    eliteRatioVal: document.getElementById('eliteRatioVal'),
    tournamentSize: document.getElementById('tournamentSize'),
    tournamentSizeVal: document.getElementById('tournamentSizeVal'),
    evalSeconds: document.getElementById('evalSeconds'),
    evalSecondsVal: document.getElementById('evalSecondsVal'),
    simSpeed: document.getElementById('simSpeed'),
    simSpeedVal: document.getElementById('simSpeedVal'),
    // Test-mode duplicates of the Core panel. Read via the
    // getActive*() helpers below so most code paths don't have to
    // care which mode is active.
    simSpeedTest: document.getElementById('simSpeedTest'),
    simSpeedTestVal: document.getElementById('simSpeedTestVal'),
    fullPowerModeTest: document.getElementById('fullPowerModeTest'),
    useWasmEvalTest: document.getElementById('useWasmEvalTest'),
    useWasmEvalTestRow: document.getElementById('useWasmEvalTestRow'),
    tiltDeg:    document.getElementById('tiltDeg'),
    tiltDegVal: document.getElementById('tiltDegVal'),
    tiltSpreadDeg:    document.getElementById('tiltSpreadDeg'),
    tiltSpreadDegVal: document.getElementById('tiltSpreadDegVal'),
    rollouts: document.getElementById('rollouts'),
    rolloutsVal: document.getElementById('rolloutsVal'),

    // Objective
    objectiveSelect: document.getElementById('objectiveSelect'),
    objectiveShowAll: document.getElementById('objectiveShowAll'),
    targetAngleRow: document.getElementById('targetAngleRow'),
    targetAngle: document.getElementById('targetAngle'),
    targetAngleVal: document.getElementById('targetAngleVal'),
    ballSpeedBonusRow: document.getElementById('ballSpeedBonusRow'),
    ballSpeedBonus: document.getElementById('ballSpeedBonus'),
    ballSpeedBonusVal: document.getElementById('ballSpeedBonusVal'),
    ballInHoleExtrasBlock: document.getElementById('ballInHoleExtrasBlock'),
    rewardCenterBonusOn: document.getElementById('rewardCenterBonusOn'),
    centerBonusWeight: document.getElementById('centerBonusWeight'),
    centerBonusWeightVal: document.getElementById('centerBonusWeightVal'),
    centerBonusWeightRow: document.getElementById('centerBonusWeightRow'),
    bouncePenaltyOn: document.getElementById('bouncePenaltyOn'),
    bouncePenaltyWeight: document.getElementById('bouncePenaltyWeight'),
    bouncePenaltyWeightVal: document.getElementById('bouncePenaltyWeightVal'),
    bouncePenaltyWeightRow: document.getElementById('bouncePenaltyWeightRow'),
    directShotOnly: document.getElementById('directShotOnly'),
    strikeDirectionRewardOn: document.getElementById('strikeDirectionRewardOn'),
    strikeDirectionWeight: document.getElementById('strikeDirectionWeight'),
    strikeDirectionWeightVal: document.getElementById('strikeDirectionWeightVal'),
    strikeDirectionWeightRow: document.getElementById('strikeDirectionWeightRow'),
    objectiveFormula: document.getElementById('objectiveFormula'),
    objectiveDesc: document.getElementById('objectiveDesc'),
    smoothnessOn: document.getElementById('smoothnessOn'),
    smoothnessPenalty: document.getElementById('smoothnessPenalty'),
    smoothnessPenaltyVal: document.getElementById('smoothnessPenaltyVal'),
    adversarialOn: document.getElementById('adversarialOn'),
    adversarialEnvPopSize: document.getElementById('adversarialEnvPopSize'),
    adversarialEnvPopSizeVal: document.getElementById('adversarialEnvPopSizeVal'),
    adversarialEnvPopSizeRow: document.getElementById('adversarialEnvPopSizeRow'),
    adversarialMutationSigma: document.getElementById('adversarialMutationSigma'),
    adversarialMutationSigmaVal: document.getElementById('adversarialMutationSigmaVal'),
    adversarialMutationSigmaRow: document.getElementById('adversarialMutationSigmaRow'),
    adversarialHint: document.getElementById('adversarialHint'),
    ballParamsBlock: document.getElementById('ballParamsBlock'),
    golfParamsBlock: document.getElementById('golfParamsBlock'),
    holeWidth: document.getElementById('holeWidth'),
    holeWidthVal: document.getElementById('holeWidthVal'),
    holeCenter: document.getElementById('holeCenter'),
    holeCenterVal: document.getElementById('holeCenterVal'),
    holeCenterJitterOn: document.getElementById('holeCenterJitterOn'),
    holeCenterJitterMag: document.getElementById('holeCenterJitterMag'),
    holeCenterJitterMagVal: document.getElementById('holeCenterJitterMagVal'),
    holeCenterJitterMagRow: document.getElementById('holeCenterJitterMagRow'),
    golfObstacles: document.getElementById('golfObstacles'),
    golfObstaclesVal: document.getElementById('golfObstaclesVal'),
    golfObstaclesRow: document.getElementById('golfObstaclesRow'),
    dodgeParamsBlock: document.getElementById('dodgeParamsBlock'),
    dodgePattern: document.getElementById('dodgePattern'),
    dodgeSpawnRate: document.getElementById('dodgeSpawnRate'),
    dodgeSpawnRateVal: document.getElementById('dodgeSpawnRateVal'),
    dodgeBulletSpeed: document.getElementById('dodgeBulletSpeed'),
    dodgeBulletSpeedVal: document.getElementById('dodgeBulletSpeedVal'),
    dodgeBulletRadius: document.getElementById('dodgeBulletRadius'),
    dodgeBulletRadiusVal: document.getElementById('dodgeBulletRadiusVal'),
    dodgeLeadTime: document.getElementById('dodgeLeadTime'),
    dodgeLeadTimeVal: document.getElementById('dodgeLeadTimeVal'),
    dodgeLeadTimeRow: document.getElementById('dodgeLeadTimeRow'),
    dodgePredictOrder: document.getElementById('dodgePredictOrder'),
    dodgePredictOrderRow: document.getElementById('dodgePredictOrderRow'),
    dodgeBulletsPerWave: document.getElementById('dodgeBulletsPerWave'),
    dodgeBulletsPerWaveVal: document.getElementById('dodgeBulletsPerWaveVal'),
    dodgeBulletsPerWaveRow: document.getElementById('dodgeBulletsPerWaveRow'),
    dodgeObservationMode: document.getElementById('dodgeObservationMode'),
    chainNumSegments: document.getElementById('chainNumSegments'),
    chainMaterial: document.getElementById('chainMaterial'),
    chainCurve: document.getElementById('chainCurve'),
    chainNumActuated: document.getElementById('chainNumActuated'),
    chainTelescope: document.getElementById('chainTelescope'),
    chainJointMode: document.getElementById('chainJointMode'),
    dodgeNoDie: document.getElementById('dodgeNoDie'),
    dodgeLifespanMode: document.getElementById('dodgeLifespanMode'),
    dodgeNoReset: document.getElementById('dodgeNoReset'),
    dodgeNoDiePenalty: document.getElementById('dodgeNoDiePenalty'),
    dodgeNoDiePenaltyVal: document.getElementById('dodgeNoDiePenaltyVal'),
    dodgeNoDiePenaltyRow: document.getElementById('dodgeNoDiePenaltyRow'),
    dodgeInvulnSeconds: document.getElementById('dodgeInvulnSeconds'),
    dodgeInvulnSecondsVal: document.getElementById('dodgeInvulnSecondsVal'),
    dodgeInvulnSecondsRow: document.getElementById('dodgeInvulnSecondsRow'),
    holePreview: document.getElementById('holePreview'),
    hpText: document.getElementById('hpText'),
    ballMode: document.getElementById('ballMode'),
    ballSpawnX: document.getElementById('ballSpawnX'),
    ballSpawnXVal: document.getElementById('ballSpawnXVal'),
    ballSpawnY: document.getElementById('ballSpawnY'),
    ballSpawnYVal: document.getElementById('ballSpawnYVal'),
    ballSpawnDelay: document.getElementById('ballSpawnDelay'),
    ballSpawnDelayVal: document.getElementById('ballSpawnDelayVal'),
    ballSpawnDelayRow: document.getElementById('ballSpawnDelayRow'),
    ballDriftSpeed: document.getElementById('ballDriftSpeed'),
    ballDriftSpeedVal: document.getElementById('ballDriftSpeedVal'),
    ballDriftSpeedRow: document.getElementById('ballDriftSpeedRow'),
    ballMass: document.getElementById('ballMass'),
    ballMassVal: document.getElementById('ballMassVal'),
    ballRadius: document.getElementById('ballRadius'),
    ballRadiusVal: document.getElementById('ballRadiusVal'),
    ballRestitution: document.getElementById('ballRestitution'),
    ballRestitutionVal: document.getElementById('ballRestitutionVal'),

    // Tooltip
    netTooltip: document.getElementById('netTooltip'),

    // Mutation params
    mutTopology: document.getElementById('mutTopology'),
    weightSigma: document.getElementById('weightSigma'),
    weightSigmaVal: document.getElementById('weightSigmaVal'),
    weightResetProb: document.getElementById('weightResetProb'),
    weightResetProbVal: document.getElementById('weightResetProbVal'),
    addConnProb: document.getElementById('addConnProb'),
    addConnProbVal: document.getElementById('addConnProbVal'),
    addNodeProb: document.getElementById('addNodeProb'),
    addNodeProbVal: document.getElementById('addNodeProbVal'),
    toggleConnProb: document.getElementById('toggleConnProb'),
    toggleConnProbVal: document.getElementById('toggleConnProbVal'),
    actMutProb: document.getElementById('actMutProb'),
    actMutProbVal: document.getElementById('actMutProbVal'),
    complexityPenalty: document.getElementById('complexityPenalty'),
    complexityPenaltyVal: document.getElementById('complexityPenaltyVal'),

    // Physics
    gravity: document.getElementById('gravity'),
    gravityVal: document.getElementById('gravityVal'),
    damping: document.getElementById('damping'),
    dampingVal: document.getElementById('dampingVal'),
    cartAccel: document.getElementById('cartAccel'),
    cartAccelVal: document.getElementById('cartAccelVal'),
    cartAccelHint: document.getElementById('cartAccelHint'),
    cartMaxSpeed: document.getElementById('cartMaxSpeed'),
    cartMaxSpeedVal: document.getElementById('cartMaxSpeedVal'),
    cartDrag: document.getElementById('cartDrag'),
    cartDragVal: document.getElementById('cartDragVal'),
    uprightAssist: document.getElementById('uprightAssist'),
    uprightAssistVal: document.getElementById('uprightAssistVal'),
    jointDamping: document.getElementById('jointDamping'),
    jointDampingVal: document.getElementById('jointDampingVal'),
    cartControlMode: document.getElementById('cartControlMode'),
    wallsOn: document.getElementById('wallsOn'),
    curriculumOn: document.getElementById('curriculumOn'),
    currBadge: document.getElementById('currBadge'),
    currBadgeText: document.getElementById('currBadgeText'),

    // Disturb
    useDisturb: document.getElementById('useDisturb'),
    pushTarget: document.getElementById('pushTarget'),
    pushStrength: document.getElementById('pushStrength'),
    pushStrengthVal: document.getElementById('pushStrengthVal'),
    pushDuration: document.getElementById('pushDuration'),
    pushDurationVal: document.getElementById('pushDurationVal'),
    pushSmoothing: document.getElementById('pushSmoothing'),
    pushSmoothingVal: document.getElementById('pushSmoothingVal'),
    pushIntervalMin: document.getElementById('pushIntervalMin'),
    pushIntervalMinVal: document.getElementById('pushIntervalMinVal'),
    pushIntervalMax: document.getElementById('pushIntervalMax'),
    pushIntervalMaxVal: document.getElementById('pushIntervalMaxVal'),

    // Curriculum
    curriculumStartFrac: document.getElementById('curriculumStartFrac'),
    curriculumStartFracVal: document.getElementById('curriculumStartFracVal'),
    curriculumStartFracRow: document.getElementById('curriculumStartFracRow'),
    curriculumRamp: document.getElementById('curriculumRamp'),
    curriculumRampVal: document.getElementById('curriculumRampVal'),
    curriculumRampRow: document.getElementById('curriculumRampRow'),
    curriculumThreshold: document.getElementById('curriculumThreshold'),
    curriculumThresholdVal: document.getElementById('curriculumThresholdVal'),
    curriculumThresholdRow: document.getElementById('curriculumThresholdRow'),
    curriculumConsec: document.getElementById('curriculumConsec'),
    curriculumConsecVal: document.getElementById('curriculumConsecVal'),
    curriculumConsecRow: document.getElementById('curriculumConsecRow'),
    curriculumMaxLevel: document.getElementById('curriculumMaxLevel'),
    curriculumMaxLevelVal: document.getElementById('curriculumMaxLevelVal'),
    curriculumMaxLevelRow: document.getElementById('curriculumMaxLevelRow'),
    curriculumSpecsBlock: document.getElementById('curriculumSpecsBlock'),
    curriculumSpecsList: document.getElementById('curriculumSpecsList'),
    curriculumLevelHint: document.getElementById('curriculumLevelHint'),

    // Auto-stop
    autoStopOn: document.getElementById('autoStopOn'),
    autoStopGens: document.getElementById('autoStopGens'),
    autoStopGensVal: document.getElementById('autoStopGensVal'),
    autoStopGensRow: document.getElementById('autoStopGensRow'),
    autoStopGood: document.getElementById('autoStopGood'),
    autoStopGoodVal: document.getElementById('autoStopGoodVal'),
    autoStopGoodRow: document.getElementById('autoStopGoodRow'),
    autoStopTol: document.getElementById('autoStopTol'),
    autoStopTolVal: document.getElementById('autoStopTolVal'),
    autoStopTolRow: document.getElementById('autoStopTolRow'),
    hallOfFameSize: document.getElementById('hallOfFameSize'),
    hallOfFameSizeVal: document.getElementById('hallOfFameSizeVal'),
    autoRollbackOn: document.getElementById('autoRollbackOn'),
    autoRollbackThreshold: document.getElementById('autoRollbackThreshold'),
    autoRollbackThresholdVal: document.getElementById('autoRollbackThresholdVal'),
    autoRollbackThresholdRow: document.getElementById('autoRollbackThresholdRow'),
    autoRollbackGens: document.getElementById('autoRollbackGens'),
    autoRollbackGensVal: document.getElementById('autoRollbackGensVal'),
    autoRollbackGensRow: document.getElementById('autoRollbackGensRow'),
    annealMutationOn: document.getElementById('annealMutationOn'),
    annealAfterGens: document.getElementById('annealAfterGens'),
    annealAfterGensVal: document.getElementById('annealAfterGensVal'),
    annealAfterGensRow: document.getElementById('annealAfterGensRow'),
    annealFactor: document.getElementById('annealFactor'),
    annealFactorVal: document.getElementById('annealFactorVal'),
    annealFactorRow: document.getElementById('annealFactorRow'),
    stuckEscapeOn: document.getElementById('stuckEscapeOn'),
    stuckEscapeAfterGens: document.getElementById('stuckEscapeAfterGens'),
    stuckEscapeAfterGensVal: document.getElementById('stuckEscapeAfterGensVal'),
    stuckEscapeAfterGensRow: document.getElementById('stuckEscapeAfterGensRow'),
    stuckEscapeFactor: document.getElementById('stuckEscapeFactor'),
    stuckEscapeFactorVal: document.getElementById('stuckEscapeFactorVal'),
    stuckEscapeFactorRow: document.getElementById('stuckEscapeFactorRow'),

    // Display
    behaviorPanel: document.getElementById('behaviorPanel'),
    behaviorCanvas: document.getElementById('behaviorCanvas'),
    behaviorXSelect: document.getElementById('behaviorXSelect'),
    behaviorYSelect: document.getElementById('behaviorYSelect'),
    behaviorBins: document.getElementById('behaviorBins'),
    behaviorBinsVal: document.getElementById('behaviorBinsVal'),
    behaviorResetBtn: document.getElementById('behaviorResetBtn'),
    behaviorHint: document.getElementById('behaviorHint'),
    qdParentEnabled: document.getElementById('qdParentEnabled'),
    qdEscapeBoostEnabled: document.getElementById('qdEscapeBoostEnabled'),
    qdEscapeBoost:        document.getElementById('qdEscapeBoost'),
    qdEscapeBoostVal:     document.getElementById('qdEscapeBoostVal'),
    qdEscapeBoostRow:     document.getElementById('qdEscapeBoostRow'),
    paretoSelectionEnabled: document.getElementById('paretoSelectionEnabled'),
    paretoNoveltyK:          document.getElementById('paretoNoveltyK'),
    paretoNoveltyKVal:       document.getElementById('paretoNoveltyKVal'),
    paretoNoveltyKRow:       document.getElementById('paretoNoveltyKRow'),
    paretoHoFEnabled:        document.getElementById('paretoHoFEnabled'),
    paretoHoFEnabledRow:     document.getElementById('paretoHoFEnabledRow'),
    paretoHoFSize:           document.getElementById('paretoHoFSize'),
    paretoHoFSizeVal:        document.getElementById('paretoHoFSizeVal'),
    paretoHoFSizeRow:        document.getElementById('paretoHoFSizeRow'),
    paretoHoFMinDist:        document.getElementById('paretoHoFMinDist'),
    paretoHoFMinDistVal:     document.getElementById('paretoHoFMinDistVal'),
    paretoHoFMinDistRow:     document.getElementById('paretoHoFMinDistRow'),
    paretoHoFBadge:          document.getElementById('paretoHoFBadge'),
    paretoHoFBadgeText:      document.getElementById('paretoHoFBadgeText'),
    paretoUseConsistency:    document.getElementById('paretoUseConsistency'),
    paretoUseConsistencyRow: document.getElementById('paretoUseConsistencyRow'),
    retroEvalEnabled:           document.getElementById('retroEvalEnabled'),
    retroEvalEveryGens:         document.getElementById('retroEvalEveryGens'),
    retroEvalEveryGensVal:      document.getElementById('retroEvalEveryGensVal'),
    retroEvalEveryGensRow:      document.getElementById('retroEvalEveryGensRow'),
    retroEvalTopN:              document.getElementById('retroEvalTopN'),
    retroEvalTopNVal:           document.getElementById('retroEvalTopNVal'),
    retroEvalTopNRow:           document.getElementById('retroEvalTopNRow'),
    retroEvalSelectionWeight:    document.getElementById('retroEvalSelectionWeight'),
    retroEvalSelectionWeightVal: document.getElementById('retroEvalSelectionWeightVal'),
    retroEvalSelectionWeightRow: document.getElementById('retroEvalSelectionWeightRow'),
    retroBadge:     document.getElementById('retroBadge'),
    retroBadgeText: document.getElementById('retroBadgeText'),
    levelHoFEnabled:        document.getElementById('levelHoFEnabled'),
    levelHoFSize:           document.getElementById('levelHoFSize'),
    levelHoFSizeVal:        document.getElementById('levelHoFSizeVal'),
    levelHoFSizeRow:        document.getElementById('levelHoFSizeRow'),
    levelTransplantOn:      document.getElementById('levelTransplantOn'),
    levelTransplantOnRow:   document.getElementById('levelTransplantOnRow'),
    levelTransplantCount:   document.getElementById('levelTransplantCount'),
    levelTransplantCountVal:document.getElementById('levelTransplantCountVal'),
    levelTransplantCountRow:document.getElementById('levelTransplantCountRow'),
    qdSampleFraction: document.getElementById('qdSampleFraction'),
    qdSampleFractionVal: document.getElementById('qdSampleFractionVal'),
    qdSampleFractionRow: document.getElementById('qdSampleFractionRow'),
    showGhosts: document.getElementById('showGhosts'),
    ghostCount: document.getElementById('ghostCount'),
    ghostCountVal: document.getElementById('ghostCountVal'),
    ghostCountRow: document.getElementById('ghostCountRow'),
    showTrail: document.getElementById('showTrail'),
    showHelpers: document.getElementById('showHelpers'),
    showActivations: document.getElementById('showActivations'),
    simplifiedNetRender: document.getElementById('simplifiedNetRender'),
    useWasmEval:    document.getElementById('useWasmEval'),
    useWasmEvalRow: document.getElementById('useWasmEvalRow'),
    coreRegion:     document.getElementById('coreRegion'),
    fullPowerMode:     document.getElementById('fullPowerMode'),
    autoPeek:          document.getElementById('autoPeek'),
    autoPeekRow:       document.getElementById('autoPeekRow'),
    autoPeekInterval:  document.getElementById('autoPeekInterval'),
    autoPeekIntervalVal: document.getElementById('autoPeekIntervalVal'),
    autoPeekIntervalRow: document.getElementById('autoPeekIntervalRow'),
    peekProgressFill:   document.getElementById('peekProgressFill'),
    peekProgressLabel:  document.getElementById('peekProgressLabel'),
    wasmHelpBtn:    document.getElementById('wasmHelpBtn'),
    wasmExplain:    document.getElementById('wasmExplain'),
    showGenomeSpace: document.getElementById('showGenomeSpace'),
    showStabilityHUD: document.getElementById('showStabilityHUD'),
    stabilityHUD: document.getElementById('stabilityHUD'),
    hudHallOfFame: document.getElementById('hudHallOfFame'),
    hudRollback: document.getElementById('hudRollback'),
    hudAnneal: document.getElementById('hudAnneal'),
    hudEscape: document.getElementById('hudEscape'),
    projectionMode: document.getElementById('projectionMode'),
    rerollRandomRow: document.getElementById('rerollRandomRow'),
    rerollRandomBtn: document.getElementById('rerollRandomBtn'),
    showDensity: document.getElementById('showDensity'),
    showSpreadEllipse: document.getElementById('showSpreadEllipse'),
    genomePanel: document.getElementById('genomePanel'),

    // Canvases
    simCanvas: document.getElementById('simCanvas'),
    simCanvasB: document.getElementById('simCanvasB'),
    netCanvas: document.getElementById('netCanvas'),
    fitCanvas: document.getElementById('fitCanvas'),
    topoCanvas: document.getElementById('topoCanvas'),
    popCanvas: document.getElementById('popCanvas'),
    genomeCanvas: document.getElementById('genomeCanvas'),
    cnnInset: document.getElementById('cnnInset'),
    cnnInsetCanvas: document.getElementById('cnnInsetCanvas'),
    lineagePanel: document.getElementById('lineagePanel'),
    lineageCanvas: document.getElementById('lineageCanvas'),
    lineageShowExtendedTags: document.getElementById('lineageShowExtendedTags'),
    curriculumChartShowRetro: document.getElementById('curriculumChartShowRetro'),
    behaviorShowParetoRank: document.getElementById('behaviorShowParetoRank'),
    // Right-bar sections that carry no mode-conditional logic of their own —
    // referenced only so the tab machinery can skip drawing into them while
    // their tab is hidden.
    netPanel: document.getElementById('netPanel'),
    popPanel: document.getElementById('popPanel'),
    fitPanel: document.getElementById('fitPanel'),
    topoPanel: document.getElementById('topoPanel'),
    // Input -> action influence chord (Network tab, next to the topology).
    chordPanel: document.getElementById('chordPanel'),
    chordCanvas: document.getElementById('chordCanvas'),
    chordHint: document.getElementById('chordHint'),
    // Right-bar visualisation tab strip.
    vizTabs: document.getElementById('vizTabs'),

    // Badges
    simTitle: document.getElementById('simTitle'),
    genBadge: document.getElementById('genBadge'),
    bestBadge: document.getElementById('bestBadge'),
    avgBadge: document.getElementById('avgBadge'),
    nodesBadge: document.getElementById('nodesBadge'),
    connsBadge: document.getElementById('connsBadge'),
    speciesBadge: document.getElementById('speciesBadge'),
    testBadge: document.getElementById('testBadge'),
    testBadgeText: document.getElementById('testBadgeText'),
    statusText: document.getElementById('statusText'),
    statusBig: document.getElementById('statusBig'),
    statusDetail: document.getElementById('statusDetail'),
    eventLog: document.getElementById('eventLog'),
    cartTel: document.getElementById('cartTel'),
    tipTel: document.getElementById('tipTel'),
    evalTel: document.getElementById('evalTel'),
    rateTel: document.getElementById('rateTel'),
    paceTel: document.getElementById('paceTel'),
  };

  // Populate setup select, grouped into <optgroup>s by setup category (from
  // BF.setups.listSetups().category). Fixed group order: the fast demo suites
  // first (the headline), then the classic scenes.
  {
    const CAT_ORDER = ['Fast demos — cart', 'Fast demos — arm', 'Pendulums & springs', 'Balls & golf', 'Chains', 'Dodge', 'Other'];
    const setupsByCat = new Map();
    for (const s of BF.setups.listSetups()) {
      const cat = s.category || 'Other';
      if (!setupsByCat.has(cat)) setupsByCat.set(cat, []);
      setupsByCat.get(cat).push(s);
    }
    const cats = CAT_ORDER.filter(c => setupsByCat.has(c))
      .concat([...setupsByCat.keys()].filter(c => CAT_ORDER.indexOf(c) === -1));
    for (const cat of cats) {
      const og = document.createElement('optgroup');
      og.label = cat;
      for (const s of setupsByCat.get(cat)) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.label;
        og.appendChild(opt);
      }
      dom.setupSelect.appendChild(og);
    }
  }
  // Run-preset dropdown is populated AFTER RUN_PRESETS is declared
  // (see populateRunPresetSelect call further down). Doing it here would
  // hit a temporal-dead-zone error since RUN_PRESETS is `const`-declared
  // later in this IIFE.
  // Hide (never remove) objective <option>s that aren't relevant to the
  // current setup, per BF.objectiveFilter.shouldShow. Removing options
  // would break loadRunPreset's objectiveSelect.value assignment, so we
  // toggle option.hidden instead and always keep the selected option
  // visible. If the current selection becomes irrelevant (and show-all is
  // off), fall to the setup's default objective.
  // autoDefault (default true): when the current objective is irrelevant to
  // the setup and we're filtering, switch to the setup's default so a
  // relevant option ends selected. Pass FALSE from loadRunPreset's tail so an
  // explicitly-set preset objective outside the relevant list is preserved
  // (resolveSelection keeps it; shouldShow keeps its option visible).
  function refreshObjectiveOptions(autoDefault) {
    if (autoDefault === undefined) autoDefault = true;
    if (!dom.objectiveSelect) return;
    const setupId = (dom.setupSelect && dom.setupSelect.value) || '';
    const setup = BF.setups.getSetup(setupId);
    const relevantList = (setup && setup.relevantObjectiveIds) || null;
    const showAll = !!(dom.objectiveShowAll && dom.objectiveShowAll.checked);
    const current = BF.objectiveFilter.resolveSelection({
      current: dom.objectiveSelect.value,
      relevantList: relevantList,
      showAll: showAll,
      autoDefault: autoDefault,
    });
    if (current !== dom.objectiveSelect.value) dom.objectiveSelect.value = current;
    const ctx = { showAll: showAll, relevantList: relevantList, currentValue: current };
    for (const opt of dom.objectiveSelect.options) {
      opt.hidden = !BF.objectiveFilter.shouldShow(opt.value, ctx);
    }
  }
  // Populate objective select
  for (const o of BF.objectives.listObjectives()) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.label;
    dom.objectiveSelect.appendChild(opt);
  }
  refreshObjectiveOptions();
  if (dom.neatTopologyPreset && BF.trainer && BF.trainer.TOPOLOGY_PRESETS) {
    for (const id of Object.keys(BF.trainer.TOPOLOGY_PRESETS)) {
      const preset = BF.trainer.TOPOLOGY_PRESETS[id];
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = preset.label;
      if (id === 'minimal') opt.selected = true;
      dom.neatTopologyPreset.appendChild(opt);
    }
  }

  // Behavior-space axis dropdowns. Setup-aware: re-populated whenever the
  // active setup changes so the available descriptors match. Defaults
  // come from BF.behaviors.defaultAxes(setupId).
  function populateBehaviorAxes() {
    if (!dom.behaviorXSelect || !dom.behaviorYSelect) return;
    const setupId = (app && app.trainer && app.trainer.setupId) || dom.setupSelect.value;
    const descriptors = (BF.behaviors && BF.behaviors.getDescriptors(setupId)) || [];
    function fill(sel, currentKey) {
      sel.innerHTML = '';
      for (const d of descriptors) {
        const opt = document.createElement('option');
        opt.value = d.key;
        opt.textContent = d.label;
        sel.appendChild(opt);
      }
      if (currentKey && descriptors.some(d => d.key === currentKey)) {
        sel.value = currentKey;
      }
    }
    const archive = app && app.trainer && app.trainer.behaviorArchive;
    fill(dom.behaviorXSelect, archive && archive.xKey);
    fill(dom.behaviorYSelect, archive && archive.yKey);
    const def = (BF.behaviors && BF.behaviors.defaultAxes(setupId)) || null;
    if (def) {
      if (!descriptors.some(d => d.key === dom.behaviorXSelect.value)) {
        dom.behaviorXSelect.value = def[0];
      }
      if (!descriptors.some(d => d.key === dom.behaviorYSelect.value)) {
        dom.behaviorYSelect.value = def[1];
      }
    }
    if (dom.behaviorPanel) {
      dom.behaviorPanel.style.display = descriptors.length > 0 ? '' : 'none';
    }
  }

  // ---- App state ----
  const app = {
    trainer: null,
    showState: null,           // live-running display state (independent of training)
    showPolicy: null,          // policy currently being displayed
    showPolicyParams: null,    // flat param vector showPolicy was decoded from
    showAccumulator: 0,
    paused: false,
    training: false,
    testing: false,
    // Compare mode: when set, a SECOND trainer runs alongside the
    // primary, advancing one gen per primary gen. Its history is
    // overlaid on the fitness chart (dashed lines, amber palette) and
    // its summary appears in the status text. The displayed sim
    // viewer continues to show the primary's best agent -- compare
    // is a training-curve comparison, not a side-by-side replay.
    trainerB: null,
    trainerBPresetId: null,
    trainerBStartedAt: 0,    // wall-time ms; used to compute B's gens/sec
    // Side-by-side display state for compare mode. Mirrors showState +
    // showPolicy but for trainerB. drawAll renders simRendererB into
    // the simCanvasB when compare-on; tickDisplay advances showStateB
    // alongside showState. Null when compare mode is off.
    showStateB: null,
    showPolicyB: null,
    showAccumulatorB: 0,
    trainerStartedAt: 0,     // same for primary (for fairness in compare)
    // Non-DOM preset overrides. loadRunPreset stashes things here that
    // can't be applied via a slider/checkbox (e.g. CNN-multiscale
    // dimensions for the WASM high-res preset). readParams pulls
    // them into the trainer params at sync time. Null = no override
    // (use BF.cnnMultiscale.defaultConfig() in the trainer).
    cnnMultiscaleConfigOverride: null,
    // Grid-CNN dimensions (BF.cnnGrid). Same stash pattern: the dodge grid
    // needs no override (the module's square defaults ARE the dodge grid),
    // but terrain-run's 'patch' encoding is a 2 x 8 x 12 non-square patch
    // behind a 6-float proprio prefix, which only a config can express.
    cnnGridConfigOverride: null,
    // Explicit per-layer MLP widths for the fixed-topology algorithms.
    // The cmaesHidden/cmaesLayers sliders can only describe UNIFORM stacks
    // (N layers of the same width), so a measured shape like 198->1->50->2
    // is simply not expressible through them. An array here wins over the
    // sliders in trainer.fixedHiddenSizes; [] means an explicitly LINEAR
    // policy. Null = use the sliders (every pre-existing preset).
    cmaesHiddenSizesOverride: null,
    // Physics timestep. readParams hard-coded 1/120 for every run, which is
    // wrong for a setup whose constants were measured at another step:
    // terrain-run's jump arc AND its 30 Hz control latch (controlEvery = 2
    // physics steps) are both expressed at 1/60, so at 1/120 the same preset
    // would silently train a different world at double the control rate.
    physicsDtOverride: null,
    // Display-only experiment. Never enters readParams, saved records or workers.
    playbackPhysicsHz: null,
    // terrain-run knobs (difficulty rung, observation encoding, and every
    // per-knob terrain* geometry/physics override). No DOM controls exist for
    // these, so loadRunPreset harvests them by PREFIX -- a rule rather than a
    // list, so a terrain param added later cannot go stale here.
    terrainOverride: null,
    // Setup id the four stashes above were harvested for. They are all
    // setup-scoped (a measured timestep, two genome/observation shapes, and
    // one setup's world knobs), and a hand-picked setup change does NOT run
    // loadRunPreset -- so readParams applies them only while this matches the
    // live setup. See presetOverridesApply().
    presetOverrideSetupId: null,
    // Preset-sourced flag: true when the active preset sets
    // curriculumNoForceAdvance. Has no DOM element, so it is stashed
    // here by loadRunPreset and surfaced by readParams (same pattern as
    // cnnMultiscaleConfigOverride). Resets to false on every preset load.
    curriculumNoForceAdvanceOverride: false,
    // Generalized curriculum specs maintained by the editor. Each:
    // { paramKey, from, to, mode }. readParams clones this into the
    // trainer params each rebuild.
    curriculumSpecs: [],
    // Edit mode: when on, the sim is forced-paused and the canvas accepts
    // drag input on the ball spawn marker (and other future handles).
    // Stores the previous training/paused state so toggling off can resume.
    editMode: false,
    editPrevState: null,
    // Active drag — which handle is being dragged + offset from cursor to
    // handle origin (so dragging doesn't snap to cursor).
    editDrag: null,
    testStats: { trials: 0, successes: 0, totalUpTime: 0, lastUpTime: 0, totalSeconds: 0, trialStartedAt: 0 },
    checkpoint: null,    // single-slot rollback target
    checkpointGen: null, // gen at which the saved checkpoint was taken
    generation: 0,
    ghosts: [],                // array of { state, policy }
    lastFrameMs: 0,
    statusText: 'idle',
    evalsPerSec: 0,
    simRenderer: BF.simRenderer.make(dom.simCanvas),
    simRendererB: dom.simCanvasB ? BF.simRenderer.make(dom.simCanvasB) : null,
    netRenderer: BF.netRenderer.make(dom.netCanvas),
    popRenderer: BF.popRenderer.make(dom.popCanvas),
    genomeRenderer: BF.genomeSpaceRenderer.make(dom.genomeCanvas),
    lineageRenderer: BF.lineageRenderer.make(dom.lineageCanvas),
    behaviorRenderer: (BF.behaviorRenderer && dom.behaviorCanvas)
      ? BF.behaviorRenderer.make(dom.behaviorCanvas)
      : null,
    lineSearchRenderer: dom.lineSearchCanvas ? BF.lineSearchRenderer.make(dom.lineSearchCanvas) : null,
    chordRenderer: (BF.chordRenderer && dom.chordCanvas)
      ? BF.chordRenderer.make(dom.chordCanvas) : null,
    cnn3dInsetRenderer: (dom.cnn3dInsetCanvas && BF.cnn3dInsetRenderer)
                          ? BF.cnn3dInsetRenderer.make(dom.cnn3dInsetCanvas) : null,
    fitChart: BF.chart.make(dom.fitCanvas, [
      // best  = top scorer this gen (noisy; one lucky weight roll spikes it)
      // median= 50th-percentile fitness (most stable signal of "is the
      //         whole population learning, or only the leader?")
      // avg   = arithmetic mean (sensitive to outliers — diverges from
      //         median when the population is bimodal, e.g. mid-strategy-
      //         shift on a curriculum advance)
      // worst = bottom-of-pack scorer (proxy for floor — useful to watch
      //         after a curriculum level-up to see if the population is
      //         struggling or just losing the leader)
      { key: 'best',   color: '#6ce28a', get: p => p.best },
      { key: 'median', color: '#f5b769', get: p => p.median },
      { key: 'avg',    color: '#6aa9ff', get: p => p.avg },
      { key: 'worst',  color: '#ff6680', get: p => p.worst },
      // retro = top-N robustness at a sampled prior curriculum level.
      // Sparse: only set on retro gens (every retroEvalEveryGens gens).
      // The chart's NaN/null skipping turns it into a dotted "stitched"
      // line connecting retro samples. When retro lags far below best,
      // catastrophic forgetting is happening.
      { key: 'retro',  color: '#c5a8ff', get: p => p.retroBest != null ? p.retroBest : NaN },
    ]),
    topoChart: BF.chart.make(dom.topoCanvas, []),
  };

  // Mode-specific lines on the "Algorithm internals" chart. Each mode shows
  // metrics that mean something for that algorithm; lines for inactive modes
  // would just be flat so we hide them.
  const ALGO_INTERNALS_SERIES = {
    neat: {
      // Combined view: how many mutations of each kind happened (per gen) +
      // how the topology is growing on average. Six lines is dense but each
      // tells a different story — early gens see add-conn/add-node spikes;
      // weight Δ stays high throughout; avg nodes/conns/species track shape.
      hint: 'mutation events + topology',
      series: [
        { key: 'weight Δ',  color: '#6aa9ff', get: p => p.mutWeight },
        { key: 'add-conn',  color: '#f5b769', get: p => p.mutAddConn },
        { key: 'add-node',  color: '#a481ff', get: p => p.mutAddNode },
        { key: 'avg nodes', color: '#4ee0c0', get: p => p.avgNodes },
        { key: 'avg conns', color: '#ff6680', get: p => p.avgConns },
        { key: 'species',   color: '#9aa3bb', get: p => p.species },
      ],
    },
    cmaes: {
      hint: 'σ (step size) · avg conns',
      series: [
        { key: 'σ',         color: '#a481ff', get: p => p.cmaesSigma },
        { key: 'avg conns', color: '#f5b769', get: p => p.avgConns },
      ],
    },
    annealing: {
      hint: 'temperature · accept rate',
      series: [
        { key: 'T',           color: '#f5b769', get: p => p.saT },
        { key: 'accept rate', color: '#4ee0c0', get: p => p.saAcceptRate },
      ],
    },
    pt: {
      hint: 'swap-acceptance rate',
      series: [
        { key: 'swap rate', color: '#4ee0c0', get: p => p.ptSwapRate },
      ],
    },
    de: {
      hint: 'trial-acceptance rate',
      series: [
        { key: 'accept rate', color: '#4ee0c0', get: p => p.deAcceptRate },
      ],
    },
    pso: {
      hint: 'mean swarm velocity (drops as it converges)',
      series: [
        { key: 'mean |v|', color: '#f5b769', get: p => p.psoMeanVel },
      ],
    },
    cem: {
      hint: 'isotropic σ (fitted from elite spread each gen)',
      series: [
        { key: 'σ', color: '#a481ff', get: p => p.cemSigma },
      ],
    },
    random: {
      // Random search has no internal state to plot — fall back to "best of
      // population" so the panel isn't empty. Useful as a reminder that
      // there *is* no learning happening.
      hint: 'no internal state · random sampling each gen',
      series: [
        { key: 'best (this gen)', color: '#6ce28a', get: p => p.best },
      ],
    },
    // Diffsim (exact-gradient) modes — grad-only internals: the TRUE gradient
    // norm through the simulator + the rollout loss. These fields are stamped
    // on the history rows by stepDiffsimGeneration.
    'diffsim-adam': {
      hint: '‖∇‖ through the simulator (true gradient) · rollout loss',
      series: [
        { key: '‖∇‖',  color: '#bd87ff', get: p => p.gradNorm },
        { key: 'loss', color: '#f5b769', get: p => p.dsLoss },
      ],
    },
    'diffsim-memetic': {
      hint: 'champion ‖∇‖ · loss · mutation σ (widens when the population is stuck)',
      series: [
        { key: '‖∇‖',   color: '#bd87ff', get: p => p.gradNorm },
        { key: 'loss',  color: '#f5b769', get: p => p.dsLoss },
        { key: 'mut σ', color: '#4ee0c0', get: p => p.mutScale },
      ],
    },
    'diffsim-lqr': {
      hint: 'analytic — solved at gen 0, no iterative internals (plots hold quality)',
      series: [
        { key: 'meanUp', color: '#6ce28a', get: p => p.best },
      ],
    },
    'rigid-lqr': {
      hint: 'Rigid-model LQR — local upright feedback (plots measured hold quality)',
      series: [
        { key: 'meanUp', color: '#6ce28a', get: p => p.best },
      ],
    },
    'rigid-swingup': {
      hint: 'RIGID-model exact-gradient swing-up — plots catchability (worse link up at hand-off)',
      series: [
        { key: 'catchability', color: '#6ce28a', get: p => p.best },
      ],
    },
    'rigid-triple-lqr': {
      hint: 'RIGID-model TRIPLE analytic LQR — holds all three links (plots hold quality)',
      series: [
        { key: 'meanUp', color: '#6ce28a', get: p => p.best },
      ],
    },
    'rigid-triple-swingup': {
      hint: 'RIGID-model TRIPLE exact-gradient swing-up — capped at 0.5 until a catch is VERIFIED',
      series: [
        { key: 'catchability', color: '#6ce28a', get: p => p.best },
      ],
    },
    fdgd: {
      hint: '‖∇‖ · α (line search size) — see line-search panel',
      series: [
        { key: '‖∇‖', color: '#a481ff', get: p => p.gdGradNorm },
        { key: 'α',   color: '#f5b769', get: p => p.gdAlpha },
      ],
    },
    spsa: {
      hint: '‖∇‖ · α — same as FD-GD, gradient is noisier',
      series: [
        { key: '‖∇‖', color: '#a481ff', get: p => p.gdGradNorm },
        { key: 'α',   color: '#f5b769', get: p => p.gdAlpha },
      ],
    },
    nes: {
      hint: '‖∇‖ on μ (REINFORCE estimate)',
      series: [
        { key: '‖∇‖', color: '#a481ff', get: p => p.gdGradNorm },
      ],
    },
    adam: {
      hint: '‖∇‖ on μ + step size (per-dim adaptive — varies inversely with √v̂)',
      series: [
        { key: '‖∇‖', color: '#a481ff', get: p => p.gdGradNorm },
        { key: 'α',   color: '#f5b769', get: p => p.gdAlpha },
      ],
    },
    lbfgs: {
      hint: '‖∇‖ · α (line-search step) — direction is H⁻¹·∇ via two-loop recursion',
      series: [
        { key: '‖∇‖', color: '#a481ff', get: p => p.gdGradNorm },
        { key: 'α',   color: '#f5b769', get: p => p.gdAlpha },
      ],
    },
    xnes: {
      hint: '‖∇μ‖ (utility-weighted natural gradient) — σ adapts multiplicatively',
      series: [
        { key: '‖∇μ‖', color: '#a481ff', get: p => p.gdGradNorm },
      ],
    },
    'sep-cmaes': {
      hint: 'σ (step size) · pop conn count avg — same shape as full CMA-ES',
      series: [
        { key: 'σ',          color: '#a481ff', get: p => p.cmaesSigma },
        { key: 'avgConns',   color: '#f5b769', get: p => p.avgConns  },
      ],
    },
    cuckoo: {
      hint: 'max Lévy jump · # nests replaced (discovery)',
      series: [
        { key: 'max jump', color: '#a481ff', get: p => p.cuckooMaxJump },
        { key: 'replaced', color: '#f5b769', get: p => p.cuckooReplaced },
      ],
    },
    whale: {
      hint: 'spiral · encircle · explore counts (mixture shifts as a→0)',
      series: [
        { key: 'spiral',   color: '#a481ff', get: p => p.whaleSpiral },
        { key: 'encircle', color: '#4ee0c0', get: p => p.whaleEncircle },
        { key: 'explore',  color: '#ff6680', get: p => p.whaleExplore },
      ],
    },
    fish: {
      hint: 'behavior counts: prey/swarm/follow/random per gen',
      series: [
        { key: 'prey',   color: '#6aa9ff', get: p => p.fishPrey },
        { key: 'swarm',  color: '#4ee0c0', get: p => p.fishSwarmCnt },
        { key: 'follow', color: '#a481ff', get: p => p.fishFollow },
        { key: 'random', color: '#ff6680', get: p => p.fishRandomCnt },
      ],
    },
    greywolf: {
      hint: 'α-fitness — population fitness panel highlights α/β/δ',
      series: [
        { key: 'α fit', color: '#f5b769', get: p => p.gwoAlphaFitness },
      ],
    },
    aco: {
      hint: 'archive size (caps at archiveSize)',
      series: [
        { key: 'archive', color: '#a481ff', get: p => p.acoArchiveSize },
      ],
    },
    firefly: {
      hint: 'max pairwise attraction (drops as fireflies cluster)',
      series: [
        { key: 'max β', color: '#f5b769', get: p => p.fireflyMaxAttr },
      ],
    },
    bat: {
      hint: 'mean loudness (decays) · mean pulse rate (grows)',
      series: [
        { key: 'A',       color: '#f5b769', get: p => p.batMeanLoudness },
        { key: 'r-pulse', color: '#4ee0c0', get: p => p.batMeanPulse },
      ],
    },
  };
  // Adversarial-env diagnostics overlay — when adversarial mode is on,
  // this gets MERGED with whichever algorithm's series above so the user
  // sees both controller-algo internals AND env-pop dynamics on one chart.
  const ADVERSARIAL_OVERLAY = {
    hint: '· adversarial: hardest-env fit + env-pop diversity',
    series: [
      { key: 'env hardest', color: '#ff6680', get: p => p.advHardestFit },
      { key: 'env div',     color: '#a481ff', get: p => p.advDiversity != null ? p.advDiversity * 100 : null },
    ],
  };

  // Active-mode getters for the duplicated Core panel. Each Core knob
  // (sim speed, full power, WASM) has a training-mode control and a
  // testing-mode control; these helpers pick the right one based on
  // `app.testing`. Code paths that consume these values just call the
  // getter and don't have to track which mode is active.
  function getActiveSimSpeed() {
    const el = app.testing && dom.simSpeedTest ? dom.simSpeedTest : dom.simSpeed;
    return el ? parseFloat(el.value) : 1;
  }
  function getActiveFullPower() {
    const el = app.testing && dom.fullPowerModeTest
      ? dom.fullPowerModeTest : dom.fullPowerMode;
    return !!(el && el.checked);
  }
  function getActiveWasm() {
    const el = app.testing && dom.useWasmEvalTest
      ? dom.useWasmEvalTest : dom.useWasmEval;
    return !!(el && el.checked);
  }

  // Difficulty (radian half-range) and a label for UI.
  // These values were tuned empirically (see investigate.js): with the default
  // cart actuation (accel=1600, maxSpeed=600), a 1-layer tanh controller
  // reliably achieves near-max fitness up to ~±20°; ±40° hits a physics ceiling
  // around fitness 5 regardless of GA hyperparams. Pick wider ranges only if
  // you've also bumped cart accel.
  // Initial-tilt magnitude in degrees, read straight off the slider.
  // The old DIFFICULTY/easy/medium/hard/extreme dropdown was replaced
  // with a continuous degrees slider so the curriculum can ramp it
  // (typical reverse-curriculum: start 5°, ramp to 180°). The four
  // preset chips next to the slider snap to the legacy values for
  // convenience but are not a separate property.
  function currentTiltDeg() {
    const v = dom.tiltDeg ? parseFloat(dom.tiltDeg.value) : 20;
    return isFinite(v) ? v : 20;
  }
  function currentTiltRad() {
    return currentTiltDeg() * Math.PI / 180;
  }

  // Setup-specific control presets. The setup builders have sensible defaults
  // for where the ball and hole belong, but the UI sliders always pass values
  // through readParams(); without these presets, golf/putt inherit the generic
  // ball-single spawn (220, 40) instead of their intended course layouts.
  const SETUP_PARAM_PRESETS = {
    'ball-single': {
      ballMode: 'fixed',
      ballSpawnX: 220,
      ballSpawnY: 40,
      ballMass: 0.4,
      ballRadius: 14,
      ballRestitution: 0.7,
    },
    golf: {
      ballMode: 'fixed',
      ballSpawnX: -100,
      ballSpawnY: 96,
      ballMass: 0.5,
      ballRadius: 14,
      ballRestitution: 0.55,
      holeCenter: 305,
      holeWidth: 50,
    },
    putt: {
      ballMode: 'fixed',
      ballSpawnX: -60,
      ballSpawnY: 96,
      ballMass: 0.5,
      ballRadius: 14,
      ballRestitution: 0.55,
      holeCenter: 200,
      holeWidth: 60,
    },
  };
  ALGO_INTERNALS_SERIES['neat-full'] = {
    hint: 'compatibility species + crossover + mutations',
    series: ALGO_INTERNALS_SERIES.neat.series,
  };

  // ----- Run presets -------------------------------------------------------
  // One-click pipeline configurations. Each preset is a declarative snapshot
  // of every dimension that affects a run: setup, algorithm, policy type,
  // observation encoding, objective, slider params, and curriculum specs.
  // loadRunPreset() walks the snapshot and applies each piece in dependency
  // order. The point is to remove the "I have to remember which six things
  // to change" friction when switching between problem flavors.
  //
  // To add a new preset:
  //   1. Add an entry here keyed by a short id.
  //   2. Add a matching <option> -- handled automatically at populate-time
  //      below; no HTML edit needed.
  //   3. (Optional) Test by selecting it from the topbar dropdown.

  // ---- terrain-run shape helpers ---------------------------------------
  // The terrain presets DERIVE their rollout length and their conv-input
  // dimensions from the setup instead of retyping them. Two things that must
  // never disagree are covered by this: (1) evalSeconds vs the rung the world
  // is generated at, and (2) the conv net's gridW/gridH/channels vs the patch
  // the observation actually emits — a mismatch there is silent (the trailing
  // floats are simply never read) and would train a policy on a slice of the
  // world while the description claimed otherwise.
  function terrainRungSeconds(rung) {
    return BF.setups.terrainGeometry(rung).evalSeconds;
  }
  // Observation-side shape of the 'patch' encoding, straight off the setup.
  const TERRAIN_PATCH_SHAPE = (function () {
    const s = BF.setups.getSetup('terrain-run');
    const d = s.patchDims(s.DEFAULTS);
    return { gridW: d.cols, gridH: d.rows, channels: d.channels, agentStateSize: s.PROPRIO };
  })();

  const RUN_PRESETS = {
    'rigid-double-live-reference': {
      label:'Double pendulum · swing-up → LQR · analytical reference',
      description:'Both links start fully down. A calibrated nonlinear trajectory with time-varying feedback raises them; local LQR holds the catch. Every frame integrates live rigid driven-pivot dynamics, including disturbances. Gravity700, acceleration cap6000, rail±260 in this model’s units. This plant is distinct from the learned PBD examples. Random calibrated pulses begin after stable catch. No trained weights.',
      setupId:'double',mode:'rigid-reference',policyType:'mlp',objectiveId:'balance_up',
      params:{evalSeconds:60,gravity:700,cartAccel:6000,tiltDeg:180,tiltSpreadDeg:0,tiltDirection:'both',uprightAssist:0,jointDamping:0,useDisturb:false},
      curriculum:{enabled:false}
    },
    'rigid-triple-live-reference': {
      label:'Triple pendulum · swing-up → LQR · analytical reference',
      description:'Three fully hanging links, a six-second nonlinear trajectory and time-varying feedback, then local LQR hold. The live driven-pivot equations receive every physical disturbance; the nominal trajectory never replaces the state. Gravity700, acceleration cap6000, rail±260 in model units. This is a model-based reference on separate rigid dynamics, not a learned policy.',
      setupId:'triple',mode:'rigid-triple-reference',policyType:'mlp',objectiveId:'balance_up',
      params:{evalSeconds:60,gravity:700,cartAccel:6000,tiltDeg:180,tiltSpreadDeg:0,tiltDirection:'both',uprightAssist:0,jointDamping:0,useDisturb:false},
      curriculum:{enabled:false}
    },
    'single-energy-lqr-showcase': {
      label:'Single swing-up · energy shaping → LQR',
      description:'Pump energy into the pendulum, then switch to local LQR feedback near upright. The gains come from the actual discrete plant; no network is trained. At the fixed settings below, 96/100 fresh perturbed starts recovered and held in 45s without hitting the rail. Starts at ±90°, ±150° and hanging recover; ±60° are known limit-cycle failures. Default 150° start takes about 11s to catch. This is a scoped nonlinear controller, not global stabilization by LQR alone.',
      setupId:'single',mode:'single-energy-lqr',policyType:'mlp',objectiveId:'balance_up',
      params:{evalSeconds:45,physicsDt:1/120,gravity:1000,damping:.0005,cartControlMode:'force',
        cartAccel:7000,cartDrag:1,tiltDeg:150,tiltDirection:'both',tiltSpreadDeg:0,
        uprightAssist:0,jointDamping:0,useDisturb:false,wallsOn:true},curriculum:{enabled:false}
    },
    'single-neat-curriculum-90': {
      label: 'Single swing-up · NEAT · gravity then angle',
      description: 'Evolve topology and weights with gravity 100 → 1000, then widen starts from 5° to 90°. A frozen generation-120 policy from the eight-second version of this curriculum recovered 37/40 unseen starts near ±90° and 40/40 near hanging in 60-second tests. The bounded velocity servo has acceleration authority 40000 and speed cap 800; there are no upright helpers. This preset uses sixteen-second training episodes to allow more recovery time before judging the hold. New populations can converge differently; use Pretrained networks for the measured checkpoint.',
      setupId: 'single', mode: 'neat-full', policyType: 'mlp', objectiveId: 'balance_up',
      params: {popSize:120,rollouts:2,evalSeconds:16,physicsDt:1/120,gravity:1000,damping:.005,
        cartControlMode:'accel',cartAccel:40000,cartMaxSpeed:800,cartDrag:28,
        tiltDeg:90,tiltDirection:'both',tiltSpreadDeg:0,neatInitialHidden:4,
        uprightAssist:0,jointDamping:0,useDisturb:false,curriculumNoForceAdvance:true},
      curriculum: {enabled:true,consecRequired:2,maxLevel:60,thresholdFrac:.7,specs:[
        {paramKey:'gravity',from:100,to:1000,steps:20,mode:'additive',phase:0},
        {paramKey:'startTiltDeg',from:5,to:90,steps:40,mode:'additive',phase:1}]}
    },
    'double-neat-curriculum-90': {
      label: 'Double swing-up · NEAT · gravity then angle',
      description: 'The two-link continuation: learn near upright as gravity rises to 1000, then widen the initial pose toward (90°, 63°). The second link starts at 0.7 times the angle slider. A bounded velocity servo supplies acceleration authority 40000 and speed cap 800; upright helpers and joint friction are disabled. Longer episodes leave room for swing-up and a sustained catch. This is a harder training experiment; inspect the achieved gravity and angle instead of treating a high early-stage score as a solved final task.',
      setupId:'double',mode:'neat',policyType:'mlp',objectiveId:'balance_up',tags:['experimental'],
      params:{popSize:120,rollouts:2,evalSeconds:16,physicsDt:1/120,gravity:1000,damping:.005,
        cartControlMode:'accel',cartAccel:40000,cartMaxSpeed:800,cartDrag:28,
        tiltDeg:90,tiltDirection:'left',tiltSpreadDeg:0,neatInitialHidden:4,neatHiddenActivation:'relu',
        uprightAssist:0,jointDamping:0,useDisturb:false,curriculumNoForceAdvance:true},
      curriculum:{enabled:true,consecRequired:2,maxLevel:60,thresholdFrac:.7,specs:[
        {paramKey:'gravity',from:100,to:1000,steps:20,mode:'additive',phase:0},
        {paramKey:'startTiltDeg',from:5,to:90,steps:40,mode:'additive',phase:1}]}
    },
    'double-neat-physical-140': {
      label:'Double pendulum · NEAT · slow physical curriculum to 140°',
      description:'Train full NEAT with actual ReLU hidden units, direct acceleration and no upright helpers. First raise gravity 100 → 850 and acceleration authority 4000 → 34000 near upright; then widen the linked release from 5° to 140° (50° below horizontal). Six two-sided rollouts include interior angles and real ±2° jitter. Thirty-second episodes and ten qualifying generations slow advancement; there is no forced advance. Both rods must stay above horizontal, with motion allowed. The bounded rail is explicitly wider: ±600px. This is a fresh-population experiment, not a claim that the final target is solved. Independently replay the champion for 90s before accepting a stage.',
      setupId:'double',mode:'neat-full',policyType:'mlp',objectiveId:'pendulum_both_above',tags:['experimental'],
      params:{popSize:120,rollouts:6,evalSeconds:30,physicsDt:1/120,gravity:850,damping:.005,
        cartControlMode:'force',cartAccel:34000,cartDrag:8,pendulumRailHalfWidth:600,pendulumObservationMode:'angular',
        tiltDeg:140,tiltDirection:'both',tiltSpreadDeg:2,neatInitialHidden:4,neatHiddenActivation:'relu',
        uprightAssist:0,jointDamping:0,useDisturb:false,curriculumNoForceAdvance:true},
      curriculum:{enabled:true,consecRequired:10,maxLevel:75,thresholdFrac:.78,specs:[
        {paramKey:'gravity',from:100,to:850,steps:30,mode:'additive',phase:0},
        {paramKey:'cartAccel',from:4000,to:34000,steps:30,mode:'additive',phase:0},
        {paramKey:'startTiltDeg',from:5,to:140,steps:45,mode:'additive',phase:1}]}
    },
    'double-neat-angle-first-140': {
      label:'Double pendulum · NEAT · angle first, then gravity',
      description:'Compare the order of the curriculum: widen the linked release at gravity 100 before increasing gravity toward 850. Direct acceleration only, actual ReLU units, ±600px bounded rail, six two-sided rollouts with ±2° jitter, and no geometric assistance. Training targets above-horizontal holds rather than perfect stillness. The final 140° / g 8.5 target remains open; rail-assisted swing-up seen at low gravity is sensitive to timestep and starting state. This starts a fresh population; the audit checkpoint and its complete evolutionary state are recorded separately.',
      setupId:'double',mode:'neat-full',policyType:'mlp',objectiveId:'pendulum_both_above',tags:['experimental'],
      params:{popSize:120,rollouts:6,evalSeconds:30,physicsDt:1/120,gravity:850,damping:.005,
        cartControlMode:'force',cartAccel:34000,cartDrag:8,pendulumRailHalfWidth:600,pendulumObservationMode:'angular',
        tiltDeg:140,tiltDirection:'both',tiltSpreadDeg:2,neatInitialHidden:4,neatHiddenActivation:'relu',
        uprightAssist:0,jointDamping:0,useDisturb:false,curriculumNoForceAdvance:true},
      curriculum:{enabled:true,consecRequired:10,maxLevel:75,thresholdFrac:.78,specs:[
        {paramKey:'startTiltDeg',from:5,to:140,steps:45,mode:'additive',phase:0},
        {paramKey:'gravity',from:100,to:850,steps:30,mode:'additive',phase:1},
        {paramKey:'cartAccel',from:4000,to:34000,steps:30,mode:'additive',phase:1}]}
    },
    // ============================ PENDULUM TIER ============================
    // Three presets share the SAME gravity curriculum (100 → 900 over 30
    // additive steps) so the three algorithms are directly comparable on
    // identical task difficulty. Differences in convergence speed +
    // final fitness are then attributable to the algorithm choice, not
    // to scenario differences.
    'pendulum-swingup-60': {
      label: 'Pendulum swing-up — NEAT-full',
      description: 'Single pendulum, 60° start tilt. Curriculum ramps gravity 100 → 900 over 30 additive steps so the policy learns small swings first. NEAT-full + MLP. The full-NEAT shape (clean local-optimum → escape → climb) shows up well on this task.',
      setupId: 'single',
      mode: 'neat-full',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 60,
        cartAccel: 3200,
        popSize: 120,
        rollouts: 2,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 30,
        specs: [
          { paramKey: 'gravity', from: 100, to: 900, steps: 30, mode: 'additive' },
        ],
      },
    },
    'pendulum-swingup-60-cmaes': {
      label: 'Pendulum swing-up — CMA-ES',
      description: 'Same task as the NEAT-full preset (60° tilt + same gravity curriculum), but solved by CMA-ES with a small MLP (6 hidden units). Smoother fitness trajectory than NEAT-full -- CMA-ES adapts a full covariance matrix so it doesn\'t need to discover topology, just tune weights.',
      setupId: 'single',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 60,
        cartAccel: 3200,
        popSize: 60,
        rollouts: 2,
        cmaesHidden: 6,
        cmaesSigma: 0.5,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 30,
        specs: [
          { paramKey: 'gravity', from: 100, to: 900, steps: 30, mode: 'additive' },
        ],
      },
    },
    'pendulum-swingup-60-cmaes-cnn': {
      label: 'Pendulum swing-up — CMA-ES + phase-space CNN',
      description: 'Same gravity curriculum as the NEAT and CMA-ES MLP presets above, but the policy is a 2D CNN over a rendered phase-space image of recent state (sin θ on x, angular velocity on y, recent points brighter). CMA-ES learns the conv kernels + dense head. Useful for seeing whether CNN structural prior helps on a low-dim task like pendulum (often: not really — but the comparison is the point).',
      setupId: 'single',
      mode: 'cmaes',
      policyType: 'cnn',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 60,
        cartAccel: 3200,
        popSize: 40,
        rollouts: 2,
        cmaesSigma: 0.5,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 30,
        specs: [
          { paramKey: 'gravity', from: 100, to: 900, steps: 30, mode: 'additive' },
        ],
      },
    },
    // ========================= MEMORY TIER (dropout) =========================
    // Four presets on ONE task: single pendulum, balance upright, observation
    // 'blind-dropout' (velocity channels zeroed AND a fresh reading only every
    // 4th control step, everything zero but the bias in between, with the dead
    // cart-velocity channel reused as a 1/0 "this reading is fresh" flag).
    //
    // They differ in exactly one thing each, so the comparison is clean:
    //   memory            recurrent policy, memory intact          <- it works
    //   severed           same architecture, memory inputs cut     <- the foil
    //   memoryless        parameter-matched plain MLP (393 params) <- the arm
    //   control (K=1)     the same MLP with the dropout removed    <- not hard
    // Everything else -- optimiser (DE, pop 40, 4 rollouts), physics, start
    // angles and parameter count (393) -- is IDENTICAL across all four, and
    // every number quoted was measured at the SAME budget of 1600 generations.
    //
    // WHY DROPOUT AND NOT JUST VELOCITY-BLINDING: hiding velocity alone does
    // NOT create a memory requirement on this plant. A parameter-matched
    // memoryless MLP solves the velocity-blind pendulum outright; the engine's
    // dissipation supplies the derivative action. That is a measured negative,
    // and it is why the dropout is the load-bearing half of the encoding.
    'single-dropout-memory': {
      label: 'Memory — pendulum under observation dropout (recurrent)',
      description: 'Single pendulum, balance upright — but the OBSERVATION IS TAKEN AWAY between readings. Both velocity channels are zeroed and a fresh reading arrives only every 4th control step; on the three stale steps in between every channel is 0 except the bias, and the dead cart-velocity channel carries a 1/0 "this reading is fresh" flag. A memoryless policy\'s input is then LITERALLY IDENTICAL on every stale step, so it can only emit a constant — the requirement is "remember what you were doing", NOT "infer velocity". This policy is still an ordinary feed-forward MLP (14 → 16 → 9, 393 parameters); a wrapper copies its 8 extra outputs into its 8 extra inputs each step through a leaky integrator (leak 0.2), so every optimizer works on it unchanged. MEASURED — DE pop 40, 4 rollouts, 1600 generations, scored on 8 HELD-OUT start angles, over TWO INDEPENDENT BLOCKS of 15 fresh seeds each. The second block was run afterwards as an adversarial replication, and the counts here are POOLED over all 30 seeds because the two blocks disagree about the tail: mean 0.942 of the rollout spent upright, 24 of 30 seeds ≥ 0.90 and 28 of 30 ≥ 0.80, against a do-nothing floor of 0.123 — which is also exactly what the all-zero parameter vector scores. Block by block that reads 0.955 mean / median 1.000 / 13 of 15 ≥ 0.90 and 0.929 / median 0.996 / 11 of 15, so the honest claim is "about four seeds in five reach 0.90", NOT either block\'s count. HONEST CAVEAT: seeds do stall. 2 of 30 land below 0.80 and the worst measured is 0.432 — the first block\'s worst was 0.632, and quoting that alone understated the tail. It generalises, but that is the least stable half: 0.958 in-distribution in BOTH blocks, while the ±11° starts — which lie OUTSIDE the ±9° training range — read 0.946 in the first block and 0.843 in the second — and in that block the loss is ONE-SIDED: −11° holds at 0.938 (12 of 15 seeds perfect) while +11° drops to 0.748 (9 of 15). Test the side you care about. The parameter-matched memoryless MLP (6 → 49 → 1, also 393 parameters, same optimizer and budget) reaches 0.136 on 15 of 15 seeds — the floor. Tick "Cut memory" to run THIS champion with its recurrent inputs held at 0: it falls to 0.087 (0.081 in the replication block), at or below the do-nothing floor on 30 of 30 seeds. THE ENGINEERED CEILING, so the green tag is not read as a victory lap: this task has a hand-written solution and it beats the learned one. A scripted controller that computes cmd = 2·sin(angle) on a fresh reading and simply HOLDS that command through the stale steps — one gain, one bit of state, NO learning — scores 1.000 on these same 8 held-out angles at K = 1, 2, 3, 4, 6 AND 8. The 393-parameter learned policy sits BELOW that ceiling, not at it. Replace the held command with a fixed constant between readings — which is all a memoryless net can express here, since its stale input is byte-identical every time — and the best of a 720-point gain grid reaches only 0.175 at K=4, BELOW what DE finds for the memoryless arm. So the memoryless failure is the hypothesis class, not a weak search; and the thing that is scarce here is one bit of state, not 393 parameters of it.',
      tags: ['solved'],
      setupId: 'single',
      mode: 'de',
      policyType: 'recurrent',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 9,
        tiltDirection: 'both',
        cartAccel: 1600,
        cartMaxSpeed: 600,
        cartControlMode: 'accel',
        evalSeconds: 6,
        rollouts: 4,
        popSize: 40,
        deF: 0.5,
        deCR: 0.9,
        singleObservationMode: 'blind-dropout',
        singleDropoutK: 4,
        recurrentMem: 8,
        recurrentHidden: 16,
        recurrentLeak: 0.2,
        recurrentSever: false,
      },
    },
    'single-dropout-severed': {
      label: 'Memory foil — same policy, memory cut',
      description: 'THE FOIL, and the exhibit that makes the memory claim falsifiable. Identical architecture, identical 393 parameters, identical optimizer and budget as the working memory preset — the ONE difference is that the recurrent inputs are held at 0, so the policy still computes its 8 memory outputs each step and can never read them back. MEASURED over 15 fresh seeds: mean 0.138, median 0.138, best 0.143, 0 of 15 above 0.80 — statistically indistinguishable from the memoryless MLP (0.136) and sitting on the 0.123 do-nothing floor. "Indistinguishable" is a test, not a turn of phrase: re-run on 8 fresh seeds and PAIRED by training seed against the memoryless arm, the severed arm is 0.0022 ahead, sd 0.0040, t = 1.54, n = 8 — nowhere near significance, while the same pairing puts the working recurrent arm 0.773 ahead at t = 11.1. So 393 parameters of recurrent architecture buy exactly NOTHING once the feedback is cut. The sharper version of the same test is post-hoc: sever the TRAINED champion\'s feedback, identical weights, and it collapses from 0.955 to 0.087 — at or below the floor on 15 of 15 seeds (per-seed 1.000 → 0.101, 1.000 → 0.051, 0.998 → 0.063, 1.000 → 0.038 …). An obs-blind control (recurrence intact, never a fresh reading) also sits at the floor — re-measured at 0.117 mean over 3 seeds at the same budget — so it is not running an open-loop internal clock: it needs the readings AND it needs to remember them. REPLICATED: a second, independent block of 15 fresh seeds reproduced the post-hoc ablation at 0.929 → 0.081, at or below the floor on 15 of 15 there too.',
      tags: ['foil'],
      setupId: 'single',
      mode: 'de',
      policyType: 'recurrent',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 9,
        tiltDirection: 'both',
        cartAccel: 1600,
        cartMaxSpeed: 600,
        cartControlMode: 'accel',
        evalSeconds: 6,
        rollouts: 4,
        popSize: 40,
        deF: 0.5,
        deCR: 0.9,
        singleObservationMode: 'blind-dropout',
        singleDropoutK: 4,
        recurrentMem: 8,
        recurrentHidden: 16,
        recurrentLeak: 0.2,
        recurrentSever: true,
      },
    },
    'single-dropout-memoryless': {
      label: 'Memory foil — parameter-matched memoryless MLP',
      description: 'The honest comparison arm. Same task, same optimizer (DE, pop 40, 4 rollouts, 1600 generations) and the same 393 parameters as the recurrent preset — 6 → 49 → 1 instead of 14 → 16 → 9 — with NO memory. Capacity is matched at the PARAMETER, not at the hidden width, because an apparent architecture win at unequal capacity is the most common false positive in this repo and has already produced one wrong conclusion on this exact question. MEASURED over 15 fresh seeds: mean 0.136, best 0.146, worst 0.099, 0 of 15 above 0.80 — pinned at the 0.123 do-nothing floor, which the all-zero parameter vector scores exactly. Paired by TRAINING SEED against the recurrent arm (never by evaluation episode, which inflates t 3.7-4.3× in this repo): mean difference 0.819, sd 0.100, t = 31.7, n = 15. On the replication block the SIZE of that difference holds but the t does not — mean difference 0.773, sd 0.197, t = 11.1, n = 8, because one recurrent seed stalls there and widens the spread. Read the effect, not the t. This is NOT a weak network: load the K=1 control and the SAME 393-parameter MLP solves the task outright. And it is NOT a weak search either — that is checked with NO learning at all. A hand-written controller of exactly the shape a memoryless net can express here (cmd = kp·sin(angle) + kx·cartX on a fresh reading, one FIXED constant on every stale step, because the stale input is byte-identical every time) tops out at 0.175 at K=4 over a 720-point gain grid — BELOW what DE finds. Give that same law one bit of state so it HOLDS the command between readings instead, and it scores 1.000 at K = 1 through 8. The binding constraint is the hypothesis class.',
      tags: ['foil'],
      setupId: 'single',
      mode: 'de',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 9,
        tiltDirection: 'both',
        cartAccel: 1600,
        cartMaxSpeed: 600,
        cartControlMode: 'accel',
        evalSeconds: 6,
        rollouts: 4,
        popSize: 40,
        deF: 0.5,
        deCR: 0.9,
        singleObservationMode: 'blind-dropout',
        singleDropoutK: 4,
        // 6 -> 49 -> 1 = 393 params, the SAME count as the recurrent policy's
        // 14 -> 16 -> 9. Capacity is matched at the parameter, not at the
        // hidden width -- an apparent architecture win at unequal capacity is
        // the single most common false positive in this repo.
        cmaesHiddenSizes: [49],
      },
    },
    'single-dropout-control-k1': {
      label: 'Memory control — same MLP, no dropout (K=1)',
      description: 'The control that makes the whole comparison mean something, and the reason the claim is about MEMORY rather than about difficulty. Identical to the memoryless foil in every respect but ONE: the dropout is off — a fresh reading every control step. The observation is still velocity-blind (both velocity channels dead, the fresh flag pinned at 1), so the only thing that changes is whether the policy has to hold a command across a gap. MEASURED with the same 393-parameter 6 → 49 → 1 MLP and the same DE budget: 5 of 5 seeds at 1.000 — perfect, in-distribution AND on the ±11° extrapolation starts — against the same 0.123 do-nothing floor. It does not even need the budget: re-run on 3 FRESH seeds at 60 generations instead of 1600, it is still 3 of 3 at 1.000 on all eight angles. Set that against the memoryless arm at K=4, which is flat on the floor after 1600. So the memoryless arm\'s failure at K = 4 is caused by the DROPOUT, not by the task, not by the velocity-blinding, not by the metric and not by the optimizer. It is also the measured reason this task exists at all: hiding velocity ALONE does not require memory here, because the engine\'s dissipation supplies the derivative action.',
      tags: ['solved'],
      setupId: 'single',
      mode: 'de',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 9,
        tiltDirection: 'both',
        cartAccel: 1600,
        cartMaxSpeed: 600,
        cartControlMode: 'accel',
        evalSeconds: 6,
        rollouts: 4,
        popSize: 40,
        deF: 0.5,
        deCR: 0.9,
        // Still VELOCITY-BLIND (ch1/ch4 dead, ch1 pinned to the fresh flag) --
        // only the dropout is removed. That isolates the dropout as the cause
        // of the memoryless arm's failure, holding the blinding fixed.
        singleObservationMode: 'blind-dropout',
        singleDropoutK: 1,
        cmaesHiddenSizes: [49],
      },
    },
    // ============================== PUTT TIER ==============================
    // Three presets share the SAME hole-shrink curriculum (160 → 40 px
    // over 20 additive steps) on the PUTT setup (no-obstacle golf),
    // so the difficulty knob is purely "how precise must the strike
    // be?". We use putt rather than the full `golf` setup because the
    // obstacle version isn't validated yet; the putt scenario is the
    // working baseline. No gravity ramp here -- gravity isn't the
    // right difficulty axis for a flat-ground putt task.
    'putt-hole-curriculum': {
      label: 'Putt — NEAT-full',
      description: 'Putt scene (no-obstacle golf). Ball spawns near the cart\'s resting position AND the hole starts at 500 px wide -- essentially any rightward strike sinks it on gen 0. Curriculum shrinks the hole from 500 → 40 px over 30 steps so the difficulty ramps gradually as the policy improves. NEAT-full + MLP. Pure topology-evolution baseline.',
      setupId: 'putt',
      mode: 'neat-full',
      policyType: 'mlp',
      objectiveId: 'ball_in_hole',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 5,
        cartAccel: 2400,
        popSize: 120,
        rollouts: 2,
        // Ball position matches the putt setup's defaults (-130, floor).
        // The bob's natural hang lands essentially on the ball so gen-0
        // policies that wiggle the cart at all produce contact.
        ballSpawnX: -130,
        ballSpawnY: 96,
        ballMass: 0.5,
        ballRadius: 14,
        ballRestitution: 0.55,
        holeCenter: 140,
        holeWidth: 500,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 30,
        specs: [
          { paramKey: 'holeWidth', from: 500, to: 40, steps: 30, mode: 'additive' },
        ],
      },
    },
    'putt-hole-curriculum-cmaes': {
      label: 'Putt — CMA-ES',
      description: 'Same putt task as the NEAT preset (no-obstacle scene, hole shrinks 500 → 40 px), solved by CMA-ES with a 6-hidden MLP. Direct comparison against the NEAT preset: same difficulty trajectory, different optimizer.',
      setupId: 'putt',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'ball_in_hole',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 5,
        cartAccel: 2400,
        popSize: 60,
        rollouts: 2,
        cmaesHidden: 6,
        cmaesSigma: 0.5,
        ballSpawnX: -130,
        ballSpawnY: 96,
        ballMass: 0.5,
        ballRadius: 14,
        ballRestitution: 0.55,
        holeCenter: 140,
        holeWidth: 500,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 30,
        specs: [
          { paramKey: 'holeWidth', from: 500, to: 40, steps: 30, mode: 'additive' },
        ],
      },
    },
    'putt-hole-curriculum-cmaes-cnn': {
      label: 'Putt — CMA-ES + phase-space CNN',
      description: 'Same putt task + hole curriculum as the other putt presets. Policy is a 2D CNN over a rendered phase-space image of recent state (ball + cart positions + velocities). CMA-ES learns conv kernels + dense head. Tests whether the CNN structural prior helps a state-pair task like putt, where the relevant "phase space" includes both cart and ball trajectories.',
      setupId: 'putt',
      mode: 'cmaes',
      policyType: 'cnn',
      objectiveId: 'ball_in_hole',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 5,
        cartAccel: 2400,
        popSize: 40,
        rollouts: 2,
        cmaesSigma: 0.5,
        ballSpawnX: -130,
        ballSpawnY: 96,
        ballMass: 0.5,
        ballRadius: 14,
        ballRestitution: 0.55,
        holeCenter: 140,
        holeWidth: 500,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 30,
        specs: [
          { paramKey: 'holeWidth', from: 500, to: 40, steps: 30, mode: 'additive' },
        ],
      },
    },
    'golf-gauntlet': {
      label: 'Golf GAUNTLET — obstacle grows HUGE · ground turns bumpy (frontier)',
      description: 'Golf made genuinely hard, per the "golf = the complex case" direction: a parallel curriculum GROWS the fairway obstacle from the classic 14px pebble toward a 110px BOULDER (mass scales with area — the strike can\'t just swat it aside) while the flat ground sprouts up to four unmovable LUMPS the ball must roll up and over. HONEST STATUS (measured, 2 seeds × 60 gens): the curriculum climbs cleanly to level 8/10 — a ~90px boulder + 3 lumps — then stalls with fitness ~21-29: the policy still gets CLOSE but stops sinking reliably once the boulder dominates the fairway. That\'s the frontier by design; the last two levels are open. All three knobs (obstacle radius, lump count, lump radius) are curriculum-rampable for your own experiments.',
      setupId: 'golf',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'ball_in_hole',
      tags: ['experimental'],
      params: {
        gravity: 900, damping: 0.005, tiltDeg: 5, cartAccel: 2400,
        popSize: 60, rollouts: 3, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
        ballSpawnX: -180, ballSpawnY: 96, ballMass: 0.5, ballRadius: 14, ballRestitution: 0.55,
        holeCenter: 140, holeWidth: 160, golfObstacles: 1,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 10, thresholdFrac: 0.40,
        specs: [
          { paramKey: 'golfObstacleR', from: 14, to: 110, steps: 10, mode: 'additive' },
          { paramKey: 'golfLumps',     from: 0,  to: 4,   steps: 10, mode: 'additive' },
        ],
      },
    },
    'golf-hole-curriculum': {
      label: 'Golf — CMA-ES (obstacle + shrinking hole)',
      description: 'Golf: like putt but with an OBSTACLE between the ball and the hole, so the strike has to route around it. The hole starts wide (460px — nearly any good strike sinks) and shrinks to 45px over 26 gated levels while the policy learns the angle. CMA-ES + MLP, same shrinking-hole recipe as the putt preset. Golf is genuinely harder than putt (the obstacle blocks the direct line), so expect a slower climb.',
      setupId: 'golf',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'ball_in_hole',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 5,
        cartAccel: 2400,
        popSize: 60,
        rollouts: 2,
        cmaesHidden: 6,
        cmaesSigma: 0.5,
        ballSpawnX: -130,
        ballSpawnY: 96,
        ballMass: 0.5,
        ballRadius: 14,
        ballRestitution: 0.55,
        holeCenter: 140,
        holeWidth: 460,
        golfObstacles: 1,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 26,
        specs: [
          { paramKey: 'holeWidth', from: 460, to: 45, steps: 26, mode: 'additive' },
        ],
      },
    },
    // ============================== DODGE TIER =============================
    // Four presets share the SAME dodgeSpawnRate curriculum (0.5 → 4 /s
    // over 30 additive steps) so all dodge variants race on identical
    // difficulty. Population sizes differ per-policy because their
    // per-gen costs differ wildly (CMA-ES + CNN has Jacobi cost
    // proportional to param count; NEAT has eval cost proportional to
    // pop × eval steps).
    'dodge-cmaes': {
      label: 'Dodge — CMA-ES (MLP, Top-K)',
      description: 'Bullet-hell trained by CMA-ES on a 6-hidden MLP, using the Top-K nearest-bullets observation (~36 inputs with K=8). No CNN -- the simplest CMA-ES baseline on dodge. Compare against the multi-scale CNN preset to see how much the spatial prior helps.',
      setupId: 'dodge',
      mode: 'cmaes',
      policyType: 'mlp',
      dodgeObservationMode: 'topk',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 60,
        rollouts: 2,
        cmaesHidden: 6,
        cmaesSigma: 0.5,
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    'dodge-planner-showcase': {
      label: "Mixed bullet dodge · receding-horizon planner",
      description: "Plan over 81 two-part acceleration sequences, predict known ballistic bullets, and keep clearance from both bullets and spawn edges. The September correction removed a second unintended displacement from each tick and synchronized wall response. The corrected planner completed all ten held-out 20-second episodes across two spawn rates (1.5 and 3). This is an engineered controller with access to the full current bullet field; future spawns remain unknown. It is a comparison baseline, not a learned neural result.",
      setupId: 'dodge',
      mode: 'dodge-planner',
      policyType: 'mlp',
      dodgeObservationMode: 'topk',
      objectiveId: 'dodge_survive',
      tags: ['solved'],
      params: {
        dodgeSpawnRate: 3.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
        dodgeNoReset: true,
      },
      curriculum: { enabled: false },
    },
    'cnn-upright-showcase': {
      label: 'Single pendulum · CNN proof of concept',
      description: 'Load showcase opens a real saved convolutional policy: 229 weights, trained with CMA-ES for 35 generations. On eight held-out start angles from ±3 to ±16 degrees, the measured mean angle error was 1.44 degrees over 20-second tests, after a 2-second transient. The input is a phase-space history image, not camera pixels. This is local balance, not swing-up. Train starts a fresh experiment; use Load showcase to inspect the frozen model.',
      setupId: 'single', mode: 'cmaes', policyType: 'cnn', objectiveId: 'balance_up',
      tags: ['solved'],
      params: { gravity: 900, damping: 0.005, cartAccel: 3200, cartMaxSpeed: 600,
        tiltDeg: 10, tiltDirection: 'both', popSize: 30, rollouts: 2,
        evalSeconds: 8, cmaesSigma: 0.5 },
      importedPolicyConfig: { type: 'cnn', config: { imageSize: 10, numFilters: 2,
        filterSize: 3, poolSize: 2, denseHidden: 4, numOutputs: 1,
        historyLen: 30, numChannels: 1, xDim: 2, yDim: 4,
        xRange: [-1, 1], yRange: [-5, 5] } },
      curriculum: { enabled: false },
    },
    'putt-trained-showcase': {
      label: 'Moving-hole putt · trained MLP checkpoint',
      description: 'Load showcase opens a genuine neural putting policy trained on varying hole positions. The fixed seed-0 checkpoint sank 22/25 held-out grid positions, then 94/100 new continuously sampled positions with the hole center uniform from 20 to 260 and width 60, from a −5-degree start. These are empirical results within this scene, not guaranteed play or arbitrary-course golf. The saved model contains the actual weights and setup; Train starts a new experiment.',
      setupId: 'putt', mode: 'cmaes', policyType: 'mlp', objectiveId: 'ball_in_hole',
      tags: ['experimental'],
      params: { gravity: 900, damping: 0.005, cartAccel: 2400, cartMaxSpeed: 600,
        holeCenter: 140, holeWidth: 60, holeCenterJitterOn: true, holeCenterJitterMag: 120, tiltDeg: 5,
        ballSpawnX: -130, ballSpawnY: 96, ballMass: 0.5, ballRadius: 14, ballRestitution: 0.55,
        tiltDirection: 'left', popSize: 60, rollouts: 8, evalSeconds: 8 },
      curriculum: { enabled: false },
    },
    'dodge-distill-showcase': {
      label: "Mixed bullet dodge · learned imitation (experimental)",
      description: "A real 48-hidden-unit network learns nine actions from planner demonstrations: behavioral cloning first, then DAgger on student trajectories. Training and evaluation now use the selected live dynamics and attack settings, and New Run clears the old weights. On the corrected agent model, the bounded 12-generation top-K experiment completed 0/5 held-out 20-second episodes. This is an unsuccessful checkpoint, not evidence of theoretical impossibility; classification accuracy and long closed-loop survival measure different things. No planner fallback runs in the student.",
      setupId: 'dodge',
      mode: 'dodge-distill',
      policyType: 'mlp',
      dodgeObservationMode: 'topk',
      objectiveId: 'dodge_survive',
      tags: ['experimental'],
      params: {
        dodgeSpawnRate: 3.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
        dodgeNoDie: false, dodgeNoReset: false,
      },
      curriculum: { enabled: false },
    },
    'dodge-cnn-multiscale': {
      label: 'Dodge — CMA-ES + multi-scale CNN',
      description: 'Bullet-hell trained by CMA-ES on a multi-scale CNN policy (LOCAL ±80px + GLOBAL whole-field, both 16×16, 2 filters per branch, pool 8×8). Population capped at 30 so each gen fits in ~2s.',
      setupId: 'dodge',
      mode: 'cmaes',
      policyType: 'cnn-multiscale',
      dodgeObservationMode: 'multiscale',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 30,
        rollouts: 1,
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    'dodge-cnn-multiscale-bigcap-wasm': {
      label: 'Dodge — sep-CMA-ES + high-capacity multi-scale CNN (WASM)',
      description: 'High-capacity version of the multi-scale CNN preset, made tractable by the WASM port. Same 16×16 input grids as the standard preset, but: pool=4 (was 8, gives 4×4 pooled per branch -- 4× the post-pool spatial cells), 4 filters per branch (was 2), denseHidden=12 (was 8). Total ~1700 params -- well past the JS Jacobi-CMA-ES ceiling (~300), so we use sep-CMA-ES (diagonal covariance, O(n) per gen). The WASM CNN forward keeps per-rollout cost tractable; with WASM off, expect this preset to crawl. Lifespan-focused reward is on by default so fitness rewards raw survival.',
      setupId: 'dodge',
      mode: 'sep-cmaes',
      policyType: 'cnn-multiscale',
      dodgeObservationMode: 'multiscale',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 40,
        rollouts: 1,
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
        dodgeNoDie: true,
        dodgeLifespanMode: true,
        // Non-DOM override; loadRunPreset stashes this on
        // app.cnnMultiscaleConfigOverride which readParams then
        // surfaces into the trainer params. Grid sizes match the
        // setup's hard-coded 16×16 output; pool/filters/denseHidden
        // are where capacity actually grows.
        cnnMultiscaleConfig: {
          localGridSize:  16,
          globalGridSize: 16,
          agentStateSize:  4,
          numFilters:      4,
          filterSize:      3,
          poolSize:        4,   // 16/4 = 4, so 4×4 pooled per branch per filter
          denseHidden:    12,
          numOutputs:      2,
        },
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    'dodge-neat-topk': {
      label: 'Dodge — NEAT-full + Top-K',
      description: 'Bullet-hell trained by NEAT-full on the Top-K-nearest-bullets observation (~36 inputs). No spatial prior; NEAT discovers structure via add-conn / add-node mutations.',
      setupId: 'dodge',
      mode: 'neat-full',
      policyType: 'mlp',
      dodgeObservationMode: 'topk',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 120,
        rollouts: 2,
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    'dodge-neat-multiscale-dense': {
      label: 'Dodge — NEAT-full on 2-D danger grids (near + far, no convolution)',
      description: 'Full NEAT consumes 548 values: four agent-state channels, local and global 16×16 engineered danger maps, and eight nearest bullets with relative position and velocity. The grid cells connect directly to the learned graph; no convolution or pooling runs here. The map encoding already supplies task structure. Compare the actual CNN and the physical-forecast scorer as separate approaches, and use observed collision counts rather than visual complexity to assess this controller. The ready-to-play spatial circuit uses its separately measured moderate-density scene.',
      setupId: 'dodge',
      mode: 'neat-full',
      policyType: 'mlp',
      dodgeObservationMode: 'multiscale',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 60,
        rollouts: 2,
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    // ============================ DODGE BASELINES ===========================
    // Hand-coded, parameter-free policies used as experimental controls.
    // No optimizer work happens (mode='fixed' makes step() a no-op); the
    // policy comes from BF.baselinePolicy.policy(baselineKind). Same
    // observation pipeline / reward / setup / curriculum / rollout path
    // as the trained presets, so the sweep harness's metrics are
    // directly comparable between baselines and learned policies.
    //
    // Why they exist: every learned-policy investigation should have
    // a hand-coded yardstick. Without one, we'd only know that learned
    // policies sit in the corner 70-85% of the time -- not whether
    // that's a good number, a bad number, or what the alternatives
    // actually look like.
    'dodge-baseline-still': {
      label: 'Dodge — Baseline: stay still at center (no training)',
      description: 'Hand-coded baseline: policy outputs [0, 0] every step. Agent starts at (0, 0) per the dodge buildWorld and never moves. The "heavily punish moving fast" control: tests whether stillness AT THE CENTER survives the bullet rain comparably to the trained corner-sitter, or whether the wall-corner is meaningfully more protective than the open center. mode=\'fixed\' so the optimizer is a no-op -- step() just increments the gen counter; ~free wall-time per gen. Uses the smaller dodge-cnn-multiscale preset\'s spawn/bullet params (10/s, 220px/s, 6px radius) so reward shape matches the trained CNN variants.',
      setupId: 'dodge',
      mode: 'fixed',
      policyType: 'fixed-baseline',
      dodgeObservationMode: 'topk',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 1,
        rollouts: 1,
        baselineKind: 'still',
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    'dodge-baseline-wall-wedge': {
      label: 'Dodge — Baseline: wall-wedge corner (no training)',
      description: 'Hand-coded baseline: policy outputs [+1, +1] every step. The agent accelerates into the bottom-right corner; the wall-clamp at setups.js:1859-1862 zeros velocity on impact and the agent stays wedged there with zero active control logic. Direct A/B reference for the corner-sitting attractor that trained policies fall into the hard way -- if a trained sep-CMA + bigcap CNN at 400 gens produces the same metrics as this 0-gen hand-coded controller, the trained policy is doing nothing the wall isn\'t already doing for free. mode=\'fixed\' (no training).',
      setupId: 'dodge',
      mode: 'fixed',
      policyType: 'fixed-baseline',
      dodgeObservationMode: 'topk',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 1,
        rollouts: 1,
        baselineKind: 'wall-wedge',
        dodgeSpawnRate: 10.0,
        dodgeBulletSpeed: 220,
        dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8,
        dodgePattern: 'mixed',
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 200,
        specs: [
          { paramKey: 'dodgeSpawnRate', from: 1.0, to: 10.0, steps: 200, mode: 'additive' },
        ],
      },
    },
    // ============================ CHAIN-REACH ==============================
    // Inverse-physics scene: a 5-node mass-spring chain hanging from a
    // cart-on-rail, fixed target at (+120, -240). CMA-ES adapts a small
    // MLP (17 → 6 → 1) to swing the tip toward the target. Gradient-based
    // alternatives live in chain-reach-adam-{openloop,closedloop}.js as
    // standalone Node probes (spec §4 paths B and C); this preset is
    // path A — apples-to-apples evolutionary baseline for that comparison.
    'chain-reach-cmaes': {
      label: 'Chain reach — CMA-ES (MLP)',
      setupId: 'chain-reach',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_reach',
      params: {
        popSize: 30,
        rollouts: 2,
        cmaesHidden: 6,
        cmaesSigma: 0.5,
        evalSeconds: 8,
        numSegments: 4,
        material: 'springy',
        // Single fixed target; no per-rollout randomization in v1.
      },
      // No curriculum on the first version (spec §4 path A).
    },
    'chain-trace-cmaes': {
      label: 'Chain trace — CMA-ES (MLP)',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'Signing machine: the tip traces a moving curve, driven by ' +
        'the cart, scored by squared tracking error. CMA-ES on a small MLP. ' +
        'Underactuated tracking is hard (see the policy-class finding) — the ' +
        'open-loop gradient probe chain-trace-adam-openloop.js is the reliable ' +
        'tracer; this preset is the evolutionary baseline. THE SCENE MOVED IN ' +
        '2026-08, and the honest summary is that it did not help. This chain ' +
        'has no telescope, so its tip has exactly ONE height it can be held at ' +
        '— the passive hang, settled at y 358 for a springy 4-segment chain — ' +
        'and the setup now centres the curve there instead of on the old ' +
        'rest-length framing height of 293 (the view zooms out ~14% to keep the ' +
        'deeper curve on screen). MEASURED on this preset, 10 paired seeds × 60 ' +
        'generations at the ±0.1 rad start pose: 89.9 → 79.8 px mean tip→cursor, ' +
        '7 of 10 seeds better, t = −1.67 — not significant. And the do-nothing ' +
        'floor moves with the scene (112.3 → 91.1 px), so measured AGAINST that ' +
        'floor the ratio goes 0.80 → 0.88, i.e. slightly worse. Read it as a ' +
        'null. The placement changed because the plant says the hang is the only ' +
        'reachable height, not because this baseline learns better there. ' +
        'chain-trace-neat and chain-trace-actuated share the scene and inherit ' +
        'the move; only this one was re-measured.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'springy',
        curveId: 'circle', tracePeriod: 4, traceRadius: 60,
      },
    },
    'chain-trace-neat': {
      label: 'Chain trace — NEAT (topology)',
      setupId: 'chain-trace',
      mode: 'neat-full',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'Signing machine solved by full NEAT (evolving topology + ' +
        'weights). Topology freedom the fixed-MLP CMA-ES preset lacks — the ' +
        'natural fit for underactuated control. Base-only; joints come in B2. ' +
        'Shares chain-trace-cmaes\'s scene, including the 2026-08 placement ' +
        'move to the measured passive hang (y 293 → 358) — see that preset for ' +
        'the paired measurement, which came out NULL.',
      params: {
        // NEAT-specific keys mirror the canonical neat-full presets (popSize,
        // rollouts); neatInitialHidden 4 seeds some hidden capacity from gen 0
        // (trainer default is 0 = pure-linear start) — sensible for this
        // underactuated 17→1 tracking task.
        popSize: 60,
        rollouts: 2,
        neatInitialHidden: 4,
        evalSeconds: 8,
        numSegments: 4,
        material: 'springy',
        curveId: 'circle',
        tracePeriod: 4,
        traceRadius: 60,
      },
    },
    'chain-reach-neat': {
      label: 'Chain reach — NEAT (topology)',
      setupId: 'chain-reach',
      mode: 'neat-full',
      policyType: 'mlp',
      objectiveId: 'chain_reach',
      description: 'Chain-reach solved by full NEAT — a topology-evolving ' +
        'alternative to the chain-reach-cmaes MLP baseline.',
      params: {
        popSize: 60,
        rollouts: 2,
        neatInitialHidden: 4,
        evalSeconds: 8,
        numSegments: 4,
        material: 'springy',
      },
    },
    'chain-reach-actuated': {
      label: 'Chain reach — actuated (CMA-ES, servo)',
      setupId: 'chain-reach',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_reach',
      description: 'Assisted reach: the cart PLUS 2 servo-driven joints. Joint ' +
        'actuation turns the underactuated whip into a controllable arm — more ' +
        'authority makes the reach easier. Apples-to-apples with chain-reach-cmaes ' +
        '(same policy/optimizer, joints off) for the B2.2c authority comparison.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
        numSegments: 4, material: 'springy',
        numActuatedJoints: 2, jointControlMode: 'servo',
      },
    },
    'chain-trace-actuated': {
      label: 'Chain trace — actuated (CMA-ES, servo)',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'Assisted signing arm: the tip traces the curve with the cart ' +
        'PLUS 2 servo-driven joints. The actuated counterpart to chain-trace-cmaes ' +
        '(joints off) — added authority should tighten tracking. Same scene as ' +
        'that preset, including the 2026-08 placement move to the measured ' +
        'passive hang (y 293 → 358); joint count does not change the settled ' +
        'reach, so the two stay a controlled pair.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
        numSegments: 4, material: 'springy',
        curveId: 'circle', tracePeriod: 4, traceRadius: 60,
        numActuatedJoints: 2, jointControlMode: 'servo',
      },
    },
    'rail-catcher-cmaes': {
      label: 'Rail catcher — CMA-ES (MLP)',
      setupId: 'rail-catcher',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'A bare cart learns to slide under a slowly-drifting dot -- pure ' +
        '1-D reactive position tracking. Trains in ~5 gens (bestEverFit converges ' +
        '~7.8/8) and tracks the dot to ~7px (vs ~92px do-nothing). A clean ' +
        '"trains-fast + immediately-works" demo.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'catch-drop-cmaes': {
      label: 'Catch the drop — CMA-ES (MLP)',
      setupId: 'catch-drop',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'A bare cart learns to slide under a dot that falls and respawns ' +
        'at a new spot -- catch-the-falling-object. Converges in ~15 gens to catch ' +
        '100% of drops (landing within ~10px). Reactive interception -- a distinct ' +
        'archetype from balance/putt/dodge, with a step-change target (vs ' +
        'rail-catcher\'s smooth drift). Needs a strong cart (cartAccel 3200) to ' +
        'reposition between drops.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
    },
    'pick-side-cmaes': {
      label: 'Pick-side — CMA-ES (MLP)',
      setupId: 'pick-side',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'A bare cart hops to whichever of two posts is lit; the lit post ' +
        'flips on a fixed 2.0s beat. Binary reactive repositioning -- converges in ' +
        '~15 gens to sit on the lit post ~60% of the time (the rest is the dash after ' +
        'each flip). Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
    },
    'flee-the-dot-cmaes': {
      label: 'Flee the dot — CMA-ES (MLP)',
      setupId: 'flee-the-dot',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'flee_evade',
      description: 'Reactive evasion -- the inverse of rail-catcher: a bare cart ' +
        'maximizes its distance from a dot that homes toward it (plus a sway so it ' +
        'can\'t be out-run to a wall). Converges in ~15 gens to hold ~240px clearance ' +
        '(vs ~68px parked). A distinct archetype: flee, not chase.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'cruise-control-cmaes': {
      label: 'Cruise control — CMA-ES (MLP)',
      setupId: 'cruise-control',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'vel_match',
      description: 'Velocity-domain tracking (not position): a bare cart drives its ' +
        'own speed to match a dot gliding at a smoothly-varying cruise velocity. ' +
        'Converges in ~15 gens to match within ~24px/s (vs ~131 parked). A different ' +
        'control problem from every position-tracking demo.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'accelerating-track-cmaes': {
      label: 'Accelerating track — CMA-ES (MLP)',
      setupId: 'accelerating-track',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'A chirp: the cart shadows a dot whose oscillation speeds up over ' +
        'the rollout, crossing the cart\'s max speed (~t=6.4s) -- the trackable head ' +
        'and the un-trackable tail are both visible. Tracks the head to ~9px by ~15 ' +
        'gens, then visibly falls behind: a built-in measure of how far reactive ' +
        'tracking goes without a curriculum. Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
    },
    // ---- Curriculum variants: start trivially easy, ramp the difficulty over
    // 10 levels as the policy masters each, so you WATCH the level climb 0→10
    // (~20 gens) up to the full task instead of it being nailed from gen 0.
    // Each ramps a single difficulty axis from easy → the shipped-hard default.
    'rail-catcher-curriculum': {
      label: 'Rail catcher — curriculum (watch it learn)',
      setupId: 'rail-catcher',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'The rail-catcher task, but it STARTS easy and ramps up: the dot\'s ' +
        'drift amplitude grows from 30px to the full 150px over 15 curriculum levels' +
        'as the policy masters each. Watch the level climb 0→15 over ~35 gens -- the ' +
        'AI learns to shadow a tiny slow wiggle first, then progressively wider sweeps.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.92,
        specs: [{ paramKey: 'railCatchAmpl', from: 30, to: 150, steps: 15, mode: 'additive' }],
      },
    },
    'catch-drop-curriculum': {
      label: 'Catch the drop — curriculum (watch it learn)',
      setupId: 'catch-drop',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'Catch-the-drop, ramped: the drops spread from a narrow 30px band to ' +
        'the full 180px over 15 levels. The cart first learns to catch near-center drops, ' +
        'then progressively wider ones. Level climbs 0→15 over ~35 gens. Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.78,
        specs: [{ paramKey: 'catchDropSpread', from: 30, to: 180, steps: 15, mode: 'additive' }],
      },
    },
    'pick-side-curriculum': {
      label: 'Pick-side — curriculum (watch it learn)',
      setupId: 'pick-side',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'Pick-side, ramped: the two posts start close together (±25px) and ' +
        'spread to the full ±120px over 15 levels. Short hops first, then full-rail ' +
        'dashes. Level climbs 0→15 over ~35 gens. Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.78,
        specs: [{ paramKey: 'pickSideSep', from: 25, to: 120, steps: 15, mode: 'additive' }],
      },
    },
    'flee-the-dot-curriculum': {
      label: 'Flee the dot — curriculum (watch it learn)',
      setupId: 'flee-the-dot',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'flee_evade',
      description: 'Flee-the-dot, ramped: the pursuer starts lazy (homing at 15px/s) and ' +
        'gets progressively more aggressive (up to 70px/s) over 15 levels. The cart learns ' +
        'easy evasion first, then to dodge a fast chaser. Level climbs 0→15 over ~35 gens.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        // thresholdFrac 0.82 (was 0.90): at high pursuer speeds the achievable
        // cap dips close to 0.90, which made the top levels FLAKY (stalled at
        // 6/15 on some runs). 0.82 keeps mastery pressure but clears reliably.
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.82,
        specs: [{ paramKey: 'fleeHomeSpeed', from: 15, to: 70, steps: 15, mode: 'additive' }],
      },
    },
    'cruise-control-curriculum': {
      label: 'Cruise control — curriculum (watch it learn)',
      setupId: 'cruise-control',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'vel_match',
      description: 'Cruise-control, ramped: the dot\'s cruise-speed swings start gentle ' +
        '(±40px/s) and grow to the full ±200px/s over 15 levels. The cart learns to match ' +
        'slow speed changes first, then fast ones. Level climbs 0→15 over ~35 gens.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.90,
        specs: [{ paramKey: 'cruiseVAmpl', from: 40, to: 200, steps: 15, mode: 'additive' }],
      },
    },
    'accelerating-track-curriculum': {
      label: 'Accelerating track — curriculum (watch it learn)',
      setupId: 'accelerating-track',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'Accelerating-track, ramped: the chirp rate grows from a gentle 0.1 ' +
        '(always trackable) to the full 0.45 (which outruns the cart ~t=6.4s) over 15 ' +
        'levels. The cart masters easy chirps first, then meets the speed wall. Level ' +
        'climbs 0→15 over ~35 gens. Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.90,
        specs: [{ paramKey: 'chirpRate', from: 0.1, to: 0.45, steps: 15, mode: 'additive' }],
      },
    },
    'safe-zone-cmaes': {
      label: 'Safe zone — CMA-ES (MLP)',
      setupId: 'safe-zone',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'zone_keep',
      description: 'A bare cart keeps itself inside a 55px-half-width safe band that ' +
        'drifts smoothly along the rail (a plateau target -- full reward anywhere ' +
        'inside). Converges in ~10 gens to stay in-band ~100% of the time, tracking ' +
        'the drifting band center to ~15px.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'midpoint-meet-cmaes': {
      label: 'Midpoint meet — CMA-ES (MLP)',
      setupId: 'midpoint-meet',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'A bare cart holds the MIDPOINT of two independently-drifting dots ' +
        '-- it must learn the average x*=(x1+x2)/2 from the two dots in its ' +
        'observation, not copy a single one. Converges in ~15 gens to hold the average ' +
        'to ~7px. A derived-target skill the single-dot demos never exercise.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'safe-zone-curriculum': {
      label: 'Safe zone — curriculum (watch it learn)',
      setupId: 'safe-zone',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'zone_keep',
      description: 'Safe-zone, ramped: the band starts wide (±120px -- easy to stay ' +
        'inside) and narrows to the full ±55px over 15 levels, so the cart must track ' +
        'the drifting center ever more precisely. Watch the band shrink and the level ' +
        'climb 0→15 over ~30 gens.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.92,
        specs: [{ paramKey: 'safeZoneHalf', from: 120, to: 55, steps: 15, mode: 'additive' }],
      },
    },
    'midpoint-meet-curriculum': {
      label: 'Midpoint meet — curriculum (watch it learn)',
      setupId: 'midpoint-meet',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'Midpoint-meet, ramped: the two dots start as a tight cluster near ' +
        'center (scale 0.3 -- the midpoint barely moves) and grow to the full spread ' +
        'over 15 levels. The cart learns the averaging relation on an easy near-static ' +
        'target first, then on the full swings. Level climbs 0→15 over ~30 gens.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.85,
        specs: [{ paramKey: 'midpointScale', from: 0.3, to: 1.0, steps: 15, mode: 'additive' }],
      },
    },
    // ---- "Less trivial" demos: a notch up from pure tracking (a self-paced
    // sequence, and a selection/argmin) -- still stable cart control, dense, and
    // gen-0-able, so they still train fast.
    'tag-sequence-cmaes': {
      label: 'Tag sequence — CMA-ES (MLP)',
      setupId: 'tag-sequence',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'tag_sequence',
      description: 'A SELF-PACED sequence: the cart must touch the currently-lit post; ' +
        'touching it lights the next post in a 4-post cycle, so the cart patrols the ' +
        'posts in order at its own pace. The policy\'s own success drives the task forward ' +
        '(a closed loop). A tag bonus rewards advancing (without it, touching the post -- ' +
        'which relocates the target -- would lose reward, so it would hover forever). ' +
        'Trains in ~30 gens to tag ~16 posts in 8s. Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
    },
    'prioritize-nearest-cmaes': {
      label: 'Prioritize nearest — CMA-ES (MLP)',
      setupId: 'prioritize-nearest',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'A SELECTION task: three dots drift independently and the cart must ' +
        'stay near whichever is currently CLOSEST. The policy sees all three dots and has ' +
        'to learn the argmin (go to the nearest) rather than tracking a single given ' +
        'target -- a richer observation→action map. Trains in ~30 gens to hold the ' +
        'nearest dot to ~11px (vs ~42px do-nothing).',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'tag-sequence-curriculum': {
      label: 'Tag sequence — curriculum (watch it learn)',
      setupId: 'tag-sequence',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'tag_sequence',
      description: 'Tag-sequence, ramped: the 4 posts start clustered near center (short ' +
        'hops) and spread to the full rail over 15 levels. Watch the patrol widen and the ' +
        'level climb 0→15 over ~35 gens. Needs cartAccel 3200.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8, cartAccel: 3200,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.70,
        specs: [{ paramKey: 'tagSpread', from: 0.4, to: 1.0, steps: 15, mode: 'additive' }],
      },
    },
    'prioritize-nearest-curriculum': {
      label: 'Prioritize nearest — curriculum (watch it learn)',
      setupId: 'prioritize-nearest',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'catch_drop',
      description: 'Prioritize-nearest, ramped: the three dots start with tiny swings (the ' +
        'nearest barely changes) and grow to full swings over 15 levels, so the argmin ' +
        'switches more often as it ramps. Level climbs 0→15 over ~30 gens.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 6, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.85,
        specs: [{ paramKey: 'prioritizeAmpl', from: 0.3, to: 1.0, steps: 15, mode: 'additive' }],
      },
    },
    // ---- Stable MULTI-DOF: a 2-link arm (cart + servo elbow, 2 actions). Proves
    // multi-DOF coordination trains fine when the pose is stable (the up-target
    // swing-up reacher was a foil; this down-side reach is not).
    'arm-reach-cmaes': {
      label: 'Arm reach — CMA-ES (MLP)',
      setupId: 'arm-reach',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'STABLE multi-DOF: a cart carries a 2-link arm with a servo elbow ' +
        '(2 actions) and must coordinate cart + elbow to put the hand on a down-side ' +
        'target -- a reachable, gravity-stable pose (NOT a swing-up). Trains in ~40 gens ' +
        'to ~35px. Shows multi-DOF coordination works fine when the pose is stable.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'arm-reach-curriculum': {
      label: 'Arm reach — curriculum (watch it learn)',
      setupId: 'arm-reach',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'Arm-reach, ramped: the target starts AT the hand\'s hanging rest ' +
        '(trivial) and eases out to the full down-side reach over 15 levels ' +
        '(armReachEase 0→1). A genuine multi-DOF grind -- the level climbs fast at first, ' +
        'then the harder reaches take real gens (0→15 over ~60 gens).',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.70,
        specs: [{ paramKey: 'armReachEase', from: 0.0, to: 1.0, steps: 15, mode: 'additive' }],
      },
    },
    'arm-reach-radius-curriculum': {
      label: 'Arm reach — accepting-radius curriculum (circle shrinks)',
      description: 'The target sits at the FULL hard reach the whole time, but the ACCEPTING RADIUS — the scoring circle drawn around the target — starts LARGE (220px: easy scoring, generous closeness credit) and SHRINKS to a TIGHT 40px over 12 gated levels. The policy first learns to get roughly there for easy reward, then is pushed to land precisely as the circle tightens; you can watch the drawn circle shrink each level. HONEST at 40px: the last couple of levels are a genuine grind (measured ~10-11/12 in 70 gens on 2 seeds — the arm CAN hit 40px, it just takes the precision search longer), so expect the final levels to be slow rather than instant. NOTE the fitness chart SAWTOOTHS DOWN on each level-up: a smaller radius pays less for the same distance, so a drop in fitness right after an advance is the curriculum working, not the policy regressing (the level readout is the progress signal). Verified to complete all 10 levels on 2 seeds within ~60 gens. (An earlier 180→40 @ 0.70-threshold version hovered at the latch and stalled around level 3-4 — the bar sat exactly at the policy\'s ceiling.)',
      setupId: 'arm-reach',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['solved'],
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 12, thresholdFrac: 0.50,
        specs: [{ paramKey: 'reachRadius', from: 220, to: 40, steps: 12, mode: 'additive' }],
      },
    },
    'arm-track-cmaes': {
      label: 'Arm track — CMA-ES (MLP)',
      setupId: 'arm-track',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'arm-reach + a MOVING target: the 2-link arm (cart + servo elbow) must ' +
        'FOLLOW a target that sweeps slowly across the reachable down-side region -- ' +
        'reach-and-track, not reach-and-hold. Trains in ~40 gens to follow within ~27px. ' +
        'Multi-DOF coordination on a moving goal, still a stable pose.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'arm-obstacle-cmaes': {
      label: 'Arm obstacle — CMA-ES (MLP)',
      setupId: 'arm-obstacle',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'reach_avoid',
      description: 'The hardest demo: a 3-link arm (cart + 2 servo joints, 3 actions) ' +
        'reaches a down-side target whose straight path is blocked by an obstacle, so ' +
        'the hand must route AROUND it. reach_avoid reward = closeness − a soft ' +
        'repulsion (a potential field); both target + obstacle are in the observation, ' +
        'so the routing is reactive (no planning). Trains in ~40 gens to reach ~28px ' +
        'while never touching the obstacle. Multi-DOF + a non-convex path, still stable.',
      params: {
        popSize: 36, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'arm-track-curriculum': {
      label: 'Arm track — curriculum (watch it learn)',
      setupId: 'arm-track',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      description: 'Arm-track, ramped: the target\'s sweep starts tiny (a near-static reach) ' +
        'and widens to the full sweep over 15 levels (armTrackAmpl 15→90). Watch the sweep ' +
        'grow and the arm keep following as the level climbs 0→15 over ~30 gens.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.62,
        specs: [{ paramKey: 'armTrackAmpl', from: 15, to: 90, steps: 15, mode: 'additive' }],
      },
    },
    'arm-obstacle-curriculum': {
      label: 'Arm obstacle — curriculum (watch it learn)',
      setupId: 'arm-obstacle',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'reach_avoid',
      description: 'Arm-obstacle, ramped: the obstacle starts tiny (a near-direct reach) and ' +
        'GROWS to its full size over 15 levels (armObstacleR 3→35), so the detour gets harder. ' +
        'Watch the obstacle swell and the arm route ever further around it (0→15 over ~30 gens).',
      params: {
        popSize: 36, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.50,
        specs: [{ paramKey: 'armObstacleR', from: 3, to: 35, steps: 15, mode: 'additive' }],
      },
    },
    'arm-dodge-cmaes': {
      label: 'Arm dodge — CMA-ES (MLP)',
      setupId: 'arm-dodge',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'reach_avoid',
      description: 'A MOVING obstacle: the 3-link arm (cart + 2 joints, 3 actions) must hold ' +
        'a static target while an obstacle DRIFTS through the reach region -- so the hand is ' +
        'repeatedly pushed off the target and has to dodge, then return. Trains in ~40 gens to ' +
        'hold the target to ~59px while spending 0% inside the drifting obstacle. Reactive ' +
        'dynamic re-routing -- the repulsor moves, the potential-field controller follows.',
      params: {
        popSize: 36, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'arm-slot-cmaes': {
      label: 'Thread the needle — CMA-ES (MLP)',
      setupId: 'arm-slot',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'thread_slot',
      description: 'Surgical precision: a 3-link arm (cart + 2 joints, 3 actions) threads its ' +
        'fingertip onto a target sitting in a NARROW SLOT between two keep-out walls. ' +
        'thread_slot is a capped potential field (closeness minus a small per-wall barrier ' +
        'that cancels at the slot center, so the funnel pulls the tip IN without the walls ' +
        'pushing it out). MEASURED (2 seeds, deterministic replays): reaches ~0.76 of the ' +
        'fitness ceiling by gen 60-80, the tip settling ~19-22px from the target, inside the ' +
        '64px slot 50-67% of the rollout, grazing the wall keep-out zones under 15% of steps. ' +
        'Honest context: a wide-open slot (walls effectively removed) only reaches ~0.82 — the ' +
        'needle itself costs just ~0.05 of ceiling; the rest is travel transient. It genuinely ' +
        'threads.',
      params: {
        popSize: 36, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'arm-slot-curriculum': {
      label: 'Thread the needle — curriculum (watch it learn)',
      setupId: 'arm-slot',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'thread_slot',
      description: 'Thread-the-needle, ramped: the slot starts wide (gap 100 -- an easy open ' +
        'reach) and NARROWS to the full slot (gap 62) over 15 levels. Watch the walls close in ' +
        'as the level climbs 0→15 over ~40-50 gens. HONEST NOTE (measured): the curriculum is ' +
        'a SHOWPIECE, not a necessity — plain CMA-ES solves the full-difficulty slot just as ' +
        'well without it (this task\'s dense potential-field reward is gen-0-positive, so ' +
        'there\'s no cliff for the ramp to bridge). Load it to watch the walls close in; load ' +
        'the plain preset for the same final skill.',
      params: {
        popSize: 36, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.65,
        specs: [{ paramKey: 'slotGap', from: 100, to: 62, steps: 15, mode: 'additive' }],
      },
    },
    'plate-spin-cmaes': {
      label: 'Plate spin — CMA-ES (MLP)',
      setupId: 'plate-spin',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'plate_spin',
      description: 'A cart carries a free ball in a CONCAVE tray and must scoot to a drifting ' +
        'target WITHOUT spilling -- a two-objective juggle (go where told AND keep the ball ' +
        'centered). The concave bowl makes centered a STABLE energy minimum (not an inverted ' +
        'pole), so the trick is accelerating SMOOTHLY. Trains in ~40 gens to reach the target ' +
        '(~19px) while keeping the ball within ~16px of center (lip at 70px). Spinning-plate ' +
        'tension, no tipping.',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
    },
    'plate-spin-curriculum': {
      label: 'Plate spin — curriculum (watch it learn)',
      setupId: 'plate-spin',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'plate_spin',
      description: 'Plate-spin, ramped: the tray starts as a DEEP bowl (stiff 20 -- the ball ' +
        'self-centers fast, easy) and FLATTENS toward the full demo (stiff 9) over 15 levels, ' +
        'so the ball sloshes more and the cart must steer ever more gently. Level climbs 0→15 ' +
        'over ~30 gens. (Stays concave throughout -- a flat tray would be the inverted-pendulum foil.)',
      params: {
        popSize: 30, rollouts: 2, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 15, thresholdFrac: 0.80,
        specs: [{ paramKey: 'plateStiff', from: 20, to: 9, steps: 15, mode: 'additive' }],
      },
    },
    // ========================== 2-PHASE PENDULUM ===========================
    // Sequential curriculum: master gravity first (phase 0), then widen
    // the start angle from upright to full swing-up (phase 1). The phase
    // separator means an agent can't try to handle both at once -- by
    // the time angle starts widening, the policy already has a working
    // swing-up at full gravity. Four variants: single vs double pendulum,
    // NEAT-full vs sep-CMA-ES. Double pendulum uses a longer angle ramp
    // because the second link makes the policy class harder to fit.
    'single-pendulum-2phase-neat': {
      label: 'Single pendulum · 2-phase curriculum · NEAT-full',
      description: 'Sequential curriculum: phase 1 ramps gravity 100 → 900 over 50 steps at near-upright tilt, phase 2 widens the start angle 0° → 180° over 200 steps at full gravity. The agent never faces both rising-difficulty axes at once. NEAT-full + MLP; topology can grow to handle the antisymmetric branch swing-up requires. ACTUATION, STATED HONESTLY (measured, and it is NOT the strongest claim): this preset uses the DEFAULT `accel` mode, which is a RATE-LIMITED VELOCITY SERVO, not an applied acceleration. The action sets a TARGET speed (action × cartMaxSpeed) that the cart slews to at rate cartAccel. Measured: a constant 0.5 command settles the cart at exactly 300 px/s (= 0.5 × 600) in ~0.2s and stays there — i.e. the policy DOES set the cart\'s speed, it just cannot do so instantly. That is meaningfully more physical than the `velocity` foil (which jumps to the same 300 px/s in ONE step, so the cart teleports), but it is NOT the fully physical model. The genuinely physical mode is `force`: the action is an applied acceleration and a linear drag makes terminal velocity EMERGE (measured: the same 0.5 command settles at 93 px/s — no artificial cap anywhere). Use the `double-pendulum-neat-style` force/accel/velocity A/B siblings to isolate the control scheme as the single variable, and prefer the `force` sibling if you want the honest-physics claim.',
      setupId: 'single',
      mode: 'neat-full',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 180,
        cartAccel: 3200,
        popSize: 120,
        rollouts: 1,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 250,
        specs: [
          { paramKey: 'gravity',      from: 100, to: 900, steps:  50, mode: 'additive', phase: 0 },
          { paramKey: 'startTiltDeg', from:   0, to: 180, steps: 200, mode: 'additive', phase: 1 },
        ],
      },
    },
    'single-pendulum-2phase-sep-cmaes': {
      label: 'Single pendulum · 2-phase curriculum · sep-CMA-ES',
      description: 'Same 2-phase curriculum as the NEAT variant (gravity 100 → 900 over 50, then angle 0° → 180° over 200). Solved by sep-CMA-ES with a 2-layer 8-unit MLP -- diagonal covariance scales further than full CMA-ES, and the extra hidden layer gives the policy class the depth to encode antisymmetric swing-up. Direct comparison to the NEAT preset on identical task difficulty.',
      setupId: 'single',
      mode: 'sep-cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 180,
        cartAccel: 3200,
        popSize: 60,
        rollouts: 1,
        cmaesHidden: 8,
        cmaesLayers: 2,
        cmaesSigma: 0.5,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 250,
        specs: [
          { paramKey: 'gravity',      from: 100, to: 900, steps:  50, mode: 'additive', phase: 0 },
          { paramKey: 'startTiltDeg', from:   0, to: 180, steps: 200, mode: 'additive', phase: 1 },
        ],
      },
    },
    'double-pendulum-2phase-neat': {
      label: 'Double pendulum · 2-phase curriculum · NEAT-full',
      description: 'Double pendulum, same 2-phase curriculum shape as the single-pendulum preset but with a longer angle ramp (400 steps instead of 200) because the second link makes swing-up much harder. Phase 1 ramps gravity 100 → 900 over 50 steps near upright; phase 2 widens the start angle 0° → 180° over 400 steps at full gravity. NEAT-full + MLP — topology growth helps on this task class. This is the HONEST LEARNED attempt at the 180° double swing-up: the chaotic second link\'s momentum must be pumped up over multiple swings, from nothing but the survival/upright reward. (Actuation note, measured: the default `accel` mode is a RATE-LIMITED VELOCITY SERVO — the action sets a target speed reached in ~0.2s — not an applied acceleration; the genuinely physical mode is `force`. See the A/B siblings.) Amber-hard, and MEASURED so: 3 seeds × 1000 gens reach curriculum level 67–122 of 450 (start tilt still under ~32°) and hold 0.00–0.04 from a full hang-down start. It does NOT get there in a browser budget — that is the point of the comparison below. Compare this with `rigid-swingup-showcase`, a separate classical trajectory-search experiment. Its rail dynamics were corrected in September, so earlier success claims no longer apply and a verified catch is not guaranteed. This learned preset remains an unsuccessful historical training study. Actuation differs between demos. DeepMind Control Suite includes force-driven two- and three-pole swing-up tasks, so velocity control is not a general explanation for online success. Compare actuator limits, rail width, damping, observations, episode length and per-link success criteria before comparing results.',
      setupId: 'double',
      mode: 'neat-full',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 180,
        cartAccel: 3200,
        popSize: 120,
        rollouts: 1,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 450,
        specs: [
          { paramKey: 'gravity',      from: 100, to: 900, steps:  50, mode: 'additive', phase: 0 },
          { paramKey: 'startTiltDeg', from:   0, to: 180, steps: 400, mode: 'additive', phase: 1 },
        ],
      },
    },
    // Double-pendulum BALANCE (hold upright), NOT swing-up. This is the
    // tractable half of the task -- but note the honest state of the art:
    // in-browser gradient-FREE evolution (CMA-ES/NEAT) PLATEAUS at ~13% hold
    // no matter the budget (see double-balance-probe.js), because the double's
    // stabilizing basin is a tiny target in a chaotic, high-dim search.
    //
    // CORRECTION (investigated 2026-07): an older comment here claimed a
    // stiff-SPRING "exact-gradient solver" fully SOLVES this (100% hold). That
    // was WRONG. Probes show a memoryless policy trained by backprop through the
    // stiff-spring diff-sim does NOT hold past its training horizon -- the
    // k=8000 penalty springs give an ill-conditioned (omega~90 rad/s)
    // backprop-through-time Jacobian, so the "exact" gradients are numerically
    // corrupt. The FIX is a rigid minimal-coordinate model (cart x + joint
    // angles, Euler-Lagrange): on RIGID dynamics an analytic LQR holds up=1.00
    // for 20s+ robustly at EVERY gravity 150..1200 (see rigid_double.js /
    // rigid-lqr-probe.js). This CMA-ES preset already runs the clean rigid
    // physics.js pendulum -- that is why it "kind of works" (first link up,
    // second wobbling) where the spring diffsim modes do not.
    'double-pendulum-balance': {
      label: 'Double pendulum · BALANCE · CMA-ES (grad-free baseline)',
      description: 'The double-pendulum HOLD-UPRIGHT task solved by CMA-ES — a GRADIENT-FREE population method (NOT the exact-gradient solver, despite what an older label claimed). It runs on the RIGID-ROD physics.js double pendulum with a gravity-ramp bootstrap (200->900) + upright-assist helpers, from a ~20deg start. This is the honest in-browser evolutionary baseline: it "kind of works" (gets the first link up, the second wobbling) precisely because it solves the clean rigid pendulum. The exact-gradient diffsim modes solve a stiff-SPRING approximation whose ill-conditioned backprop gradients are the reason they underperform — that formulation gap is the real story (a rigid-model exact-gradient path is the fix).',
      setupId: 'double',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['balance'],
      params: {
        gravity: 900,
        damping: 0.005,
        cartAccel: 3200,
        tiltDeg: 20,             // ~20 deg displaced start (the catch-gradient regime)
        cmaesHidden: 6,
        popSize: 60,
        rollouts: 3,
        // Honest gate: NO force-advance. The default 0.70 threshold is
        // UNREACHABLE for the double (it plateaus ~48% of ceiling), so with
        // force-advance ON the curriculum would silently march through every
        // level via the 200-gen stuck fallback -- "to advance" would read as
        // met when it wasn't. Off + an achievable threshold = the level only
        // advances when it genuinely clears the bar.
        curriculumNoForceAdvance: true,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 60,
        // 0.42 sits just below the double's ~48%-of-ceiling plateau, so
        // clearing it is a real (if modest) competence signal at each level,
        // not the unreachable 0.70 default.
        thresholdFrac: 0.42,
        specs: [
          { paramKey: 'gravity', from: 200, to: 900, steps: 60, mode: 'additive', phase: 0 },
        ],
      },
    },
    // The differentiable-physics answer to the double: an exact-gradient neural
    // balancer driven by a TWO-parameter curriculum on the 0-1 upright scale.
    // Directly encodes the user's "angle 10->180, g min->980" request: the start
    // tilt ramps 10deg -> 180deg (balance -> full swing-up) and gravity ramps
    // 100 -> 980 as the policy masters each level. Both take effect live (the
    // diff-sim rebuilds its world per rollout from engine.config).
    'diffsim-swingup-curriculum': {
      label: 'Double pendulum · GRAD-EXACT + curriculum (angle 10→180°, g→980)',
      description: 'Exact-gradient neural balancer (backprop through the differentiable simulator), driven by a two-knob curriculum on the 0-1 mean-upright scale. The START ANGLE ramps 10° → 180° (upright balance → full swing-up) and GRAVITY ramps 100 → 980 as the policy clears each level. Advance gate: mean-upright ≥ 0.80 for 2 consecutive gens; on advance the best-tracker resets so the harder level is re-earned (the fitness curve sawtooths — that\'s the difficulty stepping up). Unlike the population presets, this backprops the true dLoss/dWeight through the physics, so it learns fast within a level; whether the curriculum can bootstrap all the way to a 180° swing-up under Earth gravity is the open question this preset poses. Watch the curriculum HUD ramp both knobs live.',
      setupId: 'double',
      mode: 'diffsim-adam',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['differentiable', 'experimental'],
      params: {
        gravity: 980,
        cartAccel: 3200,
        tiltDeg: 180,            // hardest level = full inversion (swing-up)
        cmaesHidden: 8,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 20,
        // On the 0-1 meanUp scale, 0.80 = "held upright most of the horizon".
        thresholdFrac: 0.80,
        specs: [
          { paramKey: 'startTiltDeg', from: 10, to: 180, steps: 20, mode: 'additive', phase: 0 },
          { paramKey: 'gravity',      from: 100, to: 980, steps: 20, mode: 'additive', phase: 0 },
        ],
      },
    },
    // Two VERIFIED-to-complete showcases for the exact-gradient modes: targets
    // sit inside the measured frontier (joint tilt/gravity wall at ~tilt 34 @
    // g300 for rail 150 + accel 3200), thresholds at the achievable 0.80 (the
    // end-window gate ceiling near the frontier is ~0.85 — 0.85+ never latches).
    // Tuned + verified headlessly on 3 seeds under app-parity options.
    'diffsim-balance-showcase': {
      label: 'Double pendulum · GRAD-EXACT showcase (completes ~gen 42)',
      description: 'A curriculum the exact-gradient solver VERIFIABLY COMPLETES: start tilt ramps 8° → 34° while gravity ramps 150 → 300 over 14 gated levels (advance = end-window uprightness ≥ 0.80 for 3 consecutive gens). Verified on 3 seeds: completes at generation 42 on each, zero pacing retreats — a clean 3-gens-per-level staircase. Watch the sawtooth: each level-up drops the gate (harder task, re-earned), the curriculum HUD ramps both knobs, and "at max level" glows at the end. The target deliberately sits inside the measured physics frontier (~tilt 34° at gravity 300 on the ±150 rail) so this preset shows the gradient method WORKING, not grinding a wall.',
      setupId: 'double',
      mode: 'diffsim-adam',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['differentiable', 'solved'],
      params: {
        gravity: 150,
        cartAccel: 3200,
        tiltDeg: 34,
        cmaesHidden: 8,
      },
      curriculum: {
        enabled: true,
        consecRequired: 3,
        maxLevel: 14,
        thresholdFrac: 0.8,
        specs: [
          { paramKey: 'startTiltDeg', from: 8, to: 34, steps: 14, mode: 'additive' },
          { paramKey: 'gravity', from: 150, to: 300, steps: 14, mode: 'additive' },
        ],
      },
    },
    'diffsim-memetic-showcase': {
      label: 'Double pendulum · MEMETIC showcase (pop 8 — completes ~gen 24)',
      description: 'Gradient-assisted evolution VERIFIABLY completing a curriculum: a population of 8 exact-gradient policies (each refined by Adam steps per gen, elites cloned-with-noise) climbs start tilt 8° → 32° with gravity 150 → 320 over 12 gated levels. Verified on 3 seeds: completes at gen 24-25 on each. The fitness chart shows a REAL population spread (typical mid-run best/avg/worst ≈ 0.94/0.75/0.51 — worst=0 spikes are fresh mutated clones falling, that\'s the exploration working), the population panel fills with 8 individuals, and mutation σ widens in the internals chart if the population ever stalls. Roughly twice as fast in generations as the single-gradient showcase — the population parallelism at work.',
      setupId: 'double',
      mode: 'diffsim-memetic',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['differentiable', 'solved'],
      params: {
        gravity: 150,
        cartAccel: 3200,
        tiltDeg: 32,
        cmaesHidden: 8,
        popSize: 8,
        eliteRatio: 0.3,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 12,
        thresholdFrac: 0.8,
        specs: [
          { paramKey: 'startTiltDeg', from: 8, to: 32, steps: 12, mode: 'additive' },
          { paramKey: 'gravity', from: 150, to: 320, steps: 12, mode: 'additive' },
        ],
      },
    },
    'diffsim-lqr-showcase': {
      label: 'Double pendulum · LQR (analytic — holds forever)',
      description: 'The model-based classical answer: finite-difference the differentiable simulator at the true upright fixed point, solve the discrete Riccati equation for the optimal feedback gain K, and drive u = -Kx. No learning — solved at generation 0, and it holds the double pendulum upright INDEFINITELY (the fitness line is flat at ~1.0 by design). This is the honest yardstick the learned policies are chasing: press Test to watch it hold the full rollout while the neural policies topple after ~2s. The green "solved" tag = it genuinely works.',
      setupId: 'double',
      mode: 'diffsim-lqr',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: { gravity: 700, cartAccel: 3200 },
      curriculum: { enabled: false },
    },
    'diffsim-trajopt-showcase': {
      label: 'Double pendulum · SWING-UP trajopt + catch (experimental)',
      description: 'The real-showcase recipe for swing-up: optimize the open-loop control sequence directly through the differentiable simulator, from hanging straight down, then hand over to LQR at the top. Energy shaping teaches the pumping; each generation is a chunk of Adam on the control sequence, and the display replays the current best swing-up attempt — the chart plots catchability climbing. HONEST STATUS (amber = experimental): the optimizer reliably reaches upright but arrives with the cart flying, and the LQR catch on the real spring world is not yet solved, so it does not sustain a hold. It is here to watch the swing-up itself emerge and to show the backprop-through-the-sequence gradient in the BPTT panel. The neural-catcher handoff is the outstanding piece.',
      setupId: 'double',
      mode: 'diffsim-trajopt',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['differentiable', 'experimental'],
      params: { gravity: 700, cartAccel: 5000 },
      curriculum: { enabled: false },
    },
    // ---- RIGID-MODEL modes: the fix for the stiff-spring diffsim's corrupt
    // gradients. Both are PROVEN (rigid-lqr-probe.js) and get the green tag.
    'rigid-swingup-showcase': {
      label: "Double pendulum · trajectory search + LQR (experimental)",
      description: "Optimize a bounded cart-acceleration sequence from hanging down, then attempt a local LQR catch. This is classical trajectory optimization, not a neural network. The September audit corrected rail acceleration in both simulation and autodiff; earlier 20/20 claims describe the old model and no longer apply. At the shipped 1500 acceleration cap, seed 7 did not produce a verified catch in 2400 iterations. Watch the attempt and its verified-catch indicator; use the LQR preset for a reliable near-upright demonstration.",
      setupId: 'double',
      mode: 'rigid-swingup',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['experimental'],
      // cartAccel = the swing-up force cap. 1500 (was 6000): a lower ceiling
      // forces a smooth pump instead of jerky corrections — natural-looking AND
      // still 20/20 robust (measured). The double has plenty of authority at 1500.
      params: { gravity: 700, cartAccel: 1500, tiltDeg: 180 },
      curriculum: { enabled: false },
    },
    'rigid-lqr-showcase': {
      label: "Double pendulum · local LQR balance (classical)",
      description: "A six-state rigid model is linearized near upright, a discrete Riccati equation supplies the feedback gain, and acceleration is saturated before the plant applies its rail response. The corrected model holds for 20 seconds at each tested gravity 300/700/1000 and initial tilt 3/6 degrees. This is a local classical stabilizer, not a swing-up policy or a trained network. Press Test to inspect the complete hold.",
      setupId: 'double',
      mode: 'rigid-lqr',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: { gravity: 150, cartAccel: 6000 },
      curriculum: { enabled: false },
    },
    'rigid-triple-lqr-showcase': {
      label: "Triple pendulum · local LQR balance (classical)",
      description: "The same control question with a coupled three-link mass matrix and eight states. On the corrected model, all six tested combinations of gravity 300/700/1000 and tilt 3/6 degrees hold for 20 seconds. Passive-energy error decreases when the timestep is halved. Equal point masses and an acceleration-controlled pivot keep the model explicit; this is an educational implementation, not the hardware or boundary-value solver of the Glueck et al. paper. No neural training occurs.",
      setupId: 'triple',
      mode: 'rigid-triple-lqr',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: { gravity: 700, cartAccel: 6000 },
      curriculum: { enabled: false },
    },
    'rigid-triple-swingup-showcase': {
      label: "Triple pendulum · trajectory search + LQR (experimental)",
      description: "A difficult three-link control experiment: direct shooting with autodiff optimizes an open-loop acceleration sequence, then LQR attempts the catch. It uses simplified equal point masses and a driven pivot. It is inspired by classical triple-pendulum control, not a reproduction of the Glueck et al. paper or a learned neural policy. Rail coupling was corrected in September; historical success rates are invalidated. A high proxy score is insufficient: only a completed catch replay earns the VERIFIED indicator.",
      setupId: 'triple',
      mode: 'rigid-triple-swingup',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['experimental'],
      // cartAccel 6000 (the triple needs the authority) + ctrlRateW 20: a
      // control-rate smoothness penalty that halves the jerk without lowering
      // the cap (measured), keeping 20/20 robustness.
      params: { gravity: 700, cartAccel: 6000, ctrlRateW: 20 },
      curriculum: { enabled: false },
    },
    // Port of the reference Pendulum-NEAT project's working approach
    // for double-pendulum swing-up. The reference project is in
    // proj/Pendulum-NEAT and reliably solves this task; this preset
    // mirrors its key choices in our codebase. Differences from our
    // other double-pendulum presets:
    //   - Algorithm: 'neat' (mutation-only, no speciation/crossover).
    //     pendulum-NEAT uses simple roulette + elite + mutation.
    //   - Objective: pendulum_neat_score (tip-gated, smoothness-decay,
    //     center bonus). The gate produces a sparse signal but
    //     selection focuses ONLY on policies that achieve near-upright.
    //   - Velocity control: cart velocity is direct from network output
    //     (no accel integrator), max 800. Easier dynamics to learn.
    //   - Cart max-speed bumped to 800, accel to 10000 (their values).
    //   - Curriculum: gravity 50 → 1000 multiplicative over 200 steps
    //     (each step 1.016x), threshold relaxed so it advances quickly
    //     when the agent finds the upright basin. Matches their 1%
    //     per-advance behavior conceptually.
    //   - Pop 500, rollouts 1, eval 30s (compromises between our usual
    //     120/2/8s and their 1000/?/60s).
    //   - High elite ratio (0.35) -- much higher than typical NEAT.
    //     Theirs is 0.35; we approximate.
    //   - Larger initial topology so NEAT has room to grow.
    'double-pendulum-neat-style': {
      label: 'Double pendulum · Pendulum-NEAT-style (force, honest)',
      description: 'Honest unaided HARD target. Force cart control (applied accel + drag, cartDrag 28 -> physical ~1400 px/s top speed, no hard cap). Two-PHASE curriculum: phase 0 ramps gravity 1 -> 1000 with all physical helpers held strong (trivial bootstrap); phase 1 pins gravity at 1000 and progressively REMOVES every helper (friction 0.02 -> 0.005, upright spring 0.3 -> 0, joint friction 12 -> 0) across 150 gated levels -- so the genuine free double pendulum must be mastered, not skated past. Force-advance is DISABLED (curriculumNoForceAdvance): the curriculum only advances when a sustained hold is genuinely earned (0.60 gate, 3 consec gens). Reward adds an honest continuous-up-streak multiplier (staying up >> briefly touching up). Best-of-level is broadcast to the population on advance. NO reward hacks -- only physical entities help. Expect this to be a long (many-hour) run, and to plateau at the hardest gravity/least-help the policy class can hold -- that plateau is the honest answer. A/B vs the velocity and accel siblings (identical except cart control) and the assisted sibling (keeps a permanent physical helper).',
      setupId: 'double',
      mode: 'neat',
      policyType: 'mlp',
      objectiveId: 'pendulum_neat_score',
      params: {
        gravity: 1000,
        damping: 0.005,
        tiltDeg: 180,                // start fully hanging down (swing-up)
        // Applied-FORCE scale: in force mode the network output (-1..1)
        // is multiplied by this to get the cart's acceleration. 40000 is
        // 4x the reference's max_accel (10000) -- huge authority so the
        // cart can make near-instant fast-twitch reversals (the "more
        // sudden changes" the user wanted for the "balance ~1s then
        // fall" plateau). Slider/knob max was raised to 200000 to allow
        // it.
        cartAccel: 40000,
        // FORCE mode has NO hard speed cap: the cart's top speed emerges
        // physically from drag. Steady state v* ≈ cartAccel / cartDrag
        // (the global `damping` knob adds a small second-order effect):
        // ≈ 40000/28 ≈ 1400 px/s at the final damping, ≈ 1316 px/s at
        // the curriculum's early damping 0.02. Modest and physical-
        // looking -- deliberately far below the unphysical ~4650 px/s an
        // under-damped cart produced. Coasts to rest when released.
        cartDrag: 28,
        // Reseed most of the population with the level's best at each
        // level-up (mirrors the reference's broadcast-on-advance). Slider
        // maxes are raised in Task 9 so these values aren't clamped.
        levelHoFEnabled: true,
        levelHoFSize: 40,
        levelTransplantOn: true,
        levelTransplantCount: 40,
        curriculumNoForceAdvance: true,
        // Unused by force mode (drag sets the speed); kept only so that
        // switching this preset to accel/velocity in the UI still has a
        // sane value rather than falling back to the 600 default.
        cartMaxSpeed: 800,
        cartControlMode: 'force',    // applied force + real drag -> emergent terminal velocity, NO artificial cap
        popSize: 500,
        rollouts: 2,                 // 1 is too noisy on this task; 2 averages out single-rollout luck without tripling per-gen wall time. With workers, 2 rollouts is ~1.6x the cost of 1.
        evalSeconds: 30,
        eliteRatio: 0.35,            // their elite_ratio
        smoothnessPenalty: 0,        // objective handles smoothness internally
        neatInitialHidden: 4,        // give NEAT some hidden capacity from gen 0
        weightSigma: 0.5,            // wider initial-weight spread so gen-0 networks produce non-trivial outputs (their `weight_range = 1.0` uniform vs our default Gaussian σ=0.15)
        addConnProb: 0.8,            // match the reference's new_conn_proba exactly (was 0.6, our base default 0.30)
        // TOPOLOGY GROWTH is the bottleneck. The reference's solved
        // network is 30 hidden nodes; the user's run sat at 15 total
        // nodes / 59 connections for 1500+ gens -- the network never
        // expanded, so it never gained the capacity a double-pendulum
        // swing-up policy needs. Root cause: the base addNodeProb 0.03
        // (an "avoid bloat on simple tasks" default) is far too low
        // to grow a 30-hidden network in any reasonable gen count.
        // The reference uses new_node_proba 0.05 and runs 24000+ gens;
        // we bump higher (0.10) to grow comparable depth faster, since
        // selection + the chaotic task will still prune genuinely
        // useless nodes.
        addNodeProb: 0.10,
        // Match the reference Pendulum-NEAT project: new hidden nodes
        // use ReLU activation instead of our default tanh. ReLU is
        // unbounded above (tanh saturates at ±1), giving the network
        // more dynamic range. Crucially: when addNode mutation splits
        // a connection A→B (weight W) into A→New→B (weights 1, W),
        // ReLU passes positive signals exactly through (W=1 + ReLU = identity)
        // and zeros negatives -- so the split is biased toward
        // one-sided contributions, which mirror the way swing-up
        // policies need to push hard in specific directions.
        neatHiddenActivation: 'relu',
        // BOTH adaptive mutation mechanics OFF -- match the reference,
        // which uses constant mutation rates and no adaptive
        // damping/boosting at all (it just mutates + selects + runs
        // for 24000 generations).
        //
        // - annealMutationOn was tried first: it damped mutations to
        //   0.3x when stale, freezing the run at fitness ~11.9 for
        //   950 gens with no way out.
        // - stuckEscapeOn was tried next: it ran at ESCAPE-HIGH (mut
        //   ×4.0) for 1171 stale gens and STILL didn't help, because
        //   it boosts WEIGHT mutation -- jittering a too-small
        //   network's weights harder can't add the topology capacity
        //   it's actually missing (the run stayed at 15 nodes / 59
        //   conns the whole time). Wrong tool for "network too small".
        //
        // The real lever for "network won't expand" is addNodeProb
        // (raised above), not an adaptive weight-mutation mechanic.
        // Constant rates + a high addNodeProb + many generations is
        // exactly the reference's recipe.
        annealMutationOn: false,
        stuckEscapeOn: false,
      },
      curriculum: {
        enabled: true,
        // Earned, sustained mastery before advancing. 3 consec gens at
        // the (recalibrated) 0.60 gate; combined with
        // curriculumNoForceAdvance the level NEVER advances on a timer
        // -- it waits until the policy genuinely holds.
        consecRequired: 3,
        // Gate is owned by the pendulum_neat_score objective
        // (thresholdFrac 0.60); a curriculum.thresholdFrac here would
        // be ignored for this objective, so it is intentionally omitted.
        // 200 (gravity, phase 0) + 150 (helper-removal, phase 1) = 350.
        maxLevel: 350,
        specs: [
          // PHASE 0 -- ramp gravity 1 -> 1000 while ALL helpers stay at
          // their strong `from` (phase-1 specs sit at `from` until
          // phase 1 begins). Trivial early, full gravity by phase end.
          { paramKey: 'gravity', from: 1, to: 1000, steps: 200, mode: 'multiplicative', phase: 0 },
          // PHASE 1 -- gravity now pinned at 1000 (phase-0 spec sits at
          // `to`); progressively REMOVE every physical helper until the
          // policy is balancing the genuine free double pendulum. This
          // is the consolidation phase that was missing -- the hard
          // unaided task now exists across 150 gated levels, not just
          // the final one.
          { paramKey: 'damping',       from: 0.02, to: 0.005, steps: 150, mode: 'multiplicative', phase: 1 },
          { paramKey: 'uprightAssist', from: 0.30, to: 0,     steps: 150, mode: 'linear',         phase: 1 },
          { paramKey: 'jointDamping',  from: 12,   to: 0,     steps: 150, mode: 'linear',         phase: 1 },
        ],
      },
    },
    // Velocity-control sibling of the preset above. This is the
    // configuration CLOSEST to the reference Pendulum-NEAT project --
    // their working solution uses direct velocity control (network
    // output = cart velocity, no accel integrator). We avoided it
    // originally because (a) the non-physical jitter exploit and
    // (b) velocity bootstrapped poorly with our weight init. (b) is
    // now obsolete: the soft height gate + gravity-starts-at-1
    // curriculum bootstrap a feeble gen-0 policy fine regardless of
    // control mode. (a) is accepted DELIBERATELY: velocity control
    // is non-physical by nature and we are NOT papering over that
    // with a cosmetic smoothness reward -- the objective stays pure
    // "time above horizontal × center", identical to the force
    // preset. The jitter ("cart barely moves while the chain is
    // balanced") is allowed; the only thing that matters is the
    // chain staying up. If the task needs to be made fairer, the
    // honest levers are lower max gravity or physical helpers
    // (directional springs) -- a reward hack to fake physicality is
    // not on the table. A/B this against the force sibling: same
    // everything, the ONLY difference is cartControlMode, so any
    // performance gap is attributable purely to the control scheme.
    'double-pendulum-neat-style-velocity': {
      label: 'Double pendulum · DIRECT VELOCITY control (the foil — easier, uglier)',
      description: 'KINEMATIC COMPARATOR: a deliberately different actuator contract. The network output IS the cart velocity — no force, no integrator, the cart\'s momentum simply doesn\'t exist as a constraint. This removes cart momentum management from the control problem — and it shows: watch the cart snap and teleport-jerk in ways no motor could produce. Kinematic control is non-physical by nature; demos built on it typically bolt on extra smoothing/penalty terms to LOOK more natural (we deliberately don\'t paper over it — see it raw). IDENTICAL to the honest force preset in every other way — same two-phase curriculum, same gates, same rewards — the ONLY difference is cartControlMode: velocity, so the A/B isolates the control scheme as the single variable. This preset exists to make the project\'s "honest physics" claim visible: compare against the force/accel siblings and the organic, weight-shifting motion the physical presets learn.',
      setupId: 'double',
      mode: 'neat',
      policyType: 'mlp',
      objectiveId: 'pendulum_neat_score',
      params: {
        gravity: 1000,
        damping: 0.005,
        tiltDeg: 180,
        cartAccel: 40000,            // unused in velocity mode (parity with the force sibling)
        cartMaxSpeed: 800,           // network output × this = cart velocity (reference max_speed)
        cartControlMode: 'velocity', // <-- the ONLY difference from the force/accel siblings
        levelHoFEnabled: true,
        levelHoFSize: 40,
        levelTransplantOn: true,
        levelTransplantCount: 40,
        curriculumNoForceAdvance: true,
        popSize: 500,
        rollouts: 2,
        evalSeconds: 30,
        eliteRatio: 0.35,
        smoothnessPenalty: 0,        // explicitly zero -- no smoothness, by design
        neatInitialHidden: 4,
        weightSigma: 0.5,
        addConnProb: 0.8,
        addNodeProb: 0.10,
        neatHiddenActivation: 'relu',
        annealMutationOn: false,
        stuckEscapeOn: false,
      },
      curriculum: {
        enabled: true,
        consecRequired: 3,
        // Gate is owned by the pendulum_neat_score objective
        // (thresholdFrac 0.60); a curriculum.thresholdFrac here would
        // be ignored for this objective, so it is intentionally omitted.
        maxLevel: 350,
        specs: [
          { paramKey: 'gravity', from: 1, to: 1000, steps: 200, mode: 'multiplicative', phase: 0 },
          { paramKey: 'damping',       from: 0.02, to: 0.005, steps: 150, mode: 'multiplicative', phase: 1 },
          { paramKey: 'uprightAssist', from: 0.30, to: 0,     steps: 150, mode: 'linear',         phase: 1 },
          { paramKey: 'jointDamping',  from: 12,   to: 0,     steps: 150, mode: 'linear',         phase: 1 },
        ],
      },
    },
    // Bounded-accel sibling: the physical-LOOKING baseline (cart cannot
    // exceed a sane speed). Identical curriculum/reward/helpers->0 as
    // the force preset; ONLY cart control differs (accel, capped).
    'double-pendulum-neat-style-accel': {
      label: 'Double pendulum · Pendulum-NEAT-style (accel, bounded)',
      description: 'Bounded-accel sibling -- the physical-looking baseline you can watch without the cart whipping unrealistically. cartControlMode accel: output is a target velocity reached at a bounded rate then hard-capped at cartMaxSpeed=1000. IDENTICAL two-phase honest curriculum, disabled force-advance, 0.60 sustained gate, up-streak reward, and broadcast-on-advance as the force preset -- the ONLY difference is cart control. A/B vs the force and velocity siblings.',
      setupId: 'double',
      mode: 'neat',
      policyType: 'mlp',
      objectiveId: 'pendulum_neat_score',
      params: {
        gravity: 1000,
        damping: 0.005,
        tiltDeg: 180,
        cartAccel: 12000,
        cartMaxSpeed: 1000,
        cartControlMode: 'accel',
        popSize: 500,
        rollouts: 2,
        evalSeconds: 30,
        eliteRatio: 0.35,
        smoothnessPenalty: 0,
        neatInitialHidden: 4,
        weightSigma: 0.5,
        addConnProb: 0.8,
        addNodeProb: 0.10,
        neatHiddenActivation: 'relu',
        annealMutationOn: false,
        stuckEscapeOn: false,
        levelHoFEnabled: true,
        levelHoFSize: 40,
        levelTransplantOn: true,
        levelTransplantCount: 40,
        curriculumNoForceAdvance: true,
      },
      curriculum: {
        enabled: true,
        consecRequired: 3,
        // Gate is owned by the pendulum_neat_score objective
        // (thresholdFrac 0.60); a curriculum.thresholdFrac here would
        // be ignored for this objective, so it is intentionally omitted.
        maxLevel: 350,
        specs: [
          { paramKey: 'gravity', from: 1, to: 1000, steps: 200, mode: 'multiplicative', phase: 0 },
          { paramKey: 'damping',       from: 0.02, to: 0.005, steps: 150, mode: 'multiplicative', phase: 1 },
          { paramKey: 'uprightAssist', from: 0.30, to: 0,     steps: 150, mode: 'linear',         phase: 1 },
          { paramKey: 'jointDamping',  from: 12,   to: 0,     steps: 150, mode: 'linear',         phase: 1 },
        ],
      },
    },
    // Permanently-physically-helped sibling. Same honest curriculum,
    // but phase 1 ramps the helpers down to a small PHYSICAL FLOOR
    // (a real weak torsion spring + light bearing friction kept on
    // forever) instead of to zero. A legitimate physical system that
    // should actually converge and visibly STAY balanced -- the
    // tractable counterpart to the unaided hard preset.
    'double-pendulum-neat-style-assisted': {
      label: "Double pendulum · NEAT with geometric assistance",
      description: "A force-controlled cart trains under a two-phase curriculum with a permanent upright nudge of 0.05, joint damping 2 and world damping 0.008. The upright helper changes link positions directly; it is not a physical torsion spring. This is an assisted learning experiment, not a demonstrated unaided swing-up or a guarantee of convergence. Compare the learned policy with zero input before attributing its upright time to learning.",
      setupId: 'double',
      mode: 'neat',
      policyType: 'mlp',
      objectiveId: 'pendulum_neat_score',
      params: {
        gravity: 1000,
        damping: 0.008,
        tiltDeg: 180,
        cartAccel: 40000,
        cartMaxSpeed: 800,
        cartDrag: 28,
        cartControlMode: 'force',
        popSize: 500,
        rollouts: 2,
        evalSeconds: 30,
        eliteRatio: 0.35,
        smoothnessPenalty: 0,
        neatInitialHidden: 4,
        weightSigma: 0.5,
        addConnProb: 0.8,
        addNodeProb: 0.10,
        neatHiddenActivation: 'relu',
        annealMutationOn: false,
        stuckEscapeOn: false,
        levelHoFEnabled: true,
        levelHoFSize: 40,
        levelTransplantOn: true,
        levelTransplantCount: 40,
        curriculumNoForceAdvance: true,
      },
      curriculum: {
        enabled: true,
        consecRequired: 3,
        // Gate is owned by the pendulum_neat_score objective
        // (thresholdFrac 0.60); a curriculum.thresholdFrac here would
        // be ignored for this objective, so it is intentionally omitted.
        maxLevel: 350,
        specs: [
          { paramKey: 'gravity', from: 1, to: 1000, steps: 200, mode: 'multiplicative', phase: 0 },
          // Phase 1 ramps to a PHYSICAL FLOOR, not zero -- the helper
          // is permanent but real (weak torsion spring + bearing
          // friction). This is the tractable, still-physical target.
          { paramKey: 'damping',       from: 0.02, to: 0.008, steps: 150, mode: 'multiplicative', phase: 1 },
          { paramKey: 'uprightAssist', from: 0.30, to: 0.05,  steps: 150, mode: 'linear',         phase: 1 },
          { paramKey: 'jointDamping',  from: 12,   to: 2,     steps: 150, mode: 'linear',         phase: 1 },
        ],
      },
    },
    'double-pendulum-2phase-sep-cmaes': {
      label: 'Double pendulum · 2-phase curriculum · sep-CMA-ES',
      description: 'Double pendulum, same 2-phase curriculum as the NEAT variant (gravity 100 → 900 over 50, then angle 0° → 180° over 400). Solved by sep-CMA-ES with a 3-layer 12-unit MLP -- the deeper net helps the policy class fit the second-link dynamics, and diagonal covariance lets sep-CMA-ES scale to the larger parameter count.',
      setupId: 'double',
      mode: 'sep-cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      params: {
        gravity: 900,
        damping: 0.005,
        tiltDeg: 180,
        cartAccel: 3200,
        popSize: 80,
        rollouts: 1,
        cmaesHidden: 12,
        cmaesLayers: 3,
        cmaesSigma: 0.4,
      },
      curriculum: {
        enabled: true,
        consecRequired: 2,
        maxLevel: 450,
        specs: [
          { paramKey: 'gravity',      from: 100, to: 900, steps:  50, mode: 'additive', phase: 0 },
          { paramKey: 'startTiltDeg', from:   0, to: 180, steps: 400, mode: 'additive', phase: 1 },
        ],
      },
    },
    // SUBTLE-ASSIST SWING-UP (#5, reworked): a SMALL upright torsion spring
    // (uprightAssist) + light hinge friction (jointDamping) — real physical
    // forces, deliberately weak so the effect is subtle (almost like a bit of
    // extra damping), so the result is an almost-legit 180° swing-up with just a
    // touch of help. A start-tilt curriculum (10°→180°) bootstraps the full
    // hang-down swing-up. Verified headlessly: CMA-ES climbs the curriculum to the
    // full 180° start and holds upright (~79% of the balance_up ceiling). Green.
    'double-pendulum-assisted-fast': {
      label: 'Double pendulum · SUBTLE-ASSIST swing-up (curriculum → 180°)',
      description: 'An assisted double-pendulum learning experiment. A per-step geometric upright nudge (uprightAssist 0.05) plus light hinge friction (jointDamping 2), and a start-tilt curriculum ramping 10° → 180° over 30 gated levels, so the policy learns to balance near upright first and works its way down to the full hang-down swing-up. MEASURED at this preset\'s own settings (5 seeds): holds upright 79.4% of the rollout from a FULL hang-down start, worst seed 78.0% — 5/5. HONEST CAVEAT: with NO POLICY AT ALL (cart frozen, command ≡ 0) the chain still reaches upright 47.2% of the time, so the network is worth about +32 points of upright-time, not the whole 79.4 — the assist is doing a large minority of the work. That is more policy-credit than the triple version earns (+20), and this is the most honest of the assisted pair. Two things NOT to believe: dialing uprightAssist to 0 does NOT give a "fully unaided" version (measured: 0/20 zero-assist configs across every gravity × friction ever leave curriculum level 0), and the assist is not a true torsion spring — it is a per-step positional nudge toward vertical. The RIGID swing-up presets use no upright helper, but remain experimental after the September rail-dynamics correction; inspect whether their catch is actually verified.',
      setupId: 'double',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: {
        gravity: 700, tiltDeg: 180, cartAccel: 4000, damping: 0.01,
        uprightAssist: 0.05, jointDamping: 2,
        cmaesHidden: 8, popSize: 40, rollouts: 2, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 30, thresholdFrac: 0.6,
        specs: [{ paramKey: 'startTiltDeg', from: 10, to: 180, steps: 30, mode: 'additive' }],
      },
    },
    'triple-pendulum-assisted-fast': {
      label: 'Triple pendulum · SUBTLE-ASSIST swing-up (curriculum → 180°)',
      description: 'An assisted triple-pendulum learning experiment: a per-step geometric upright nudge (uprightAssist 0.07) + light hinge friction (jointDamping 2), plus a start-tilt curriculum ramping 10° → 180° over 30 levels, produce an assisted three-link task: the policy learns near-upright balance first, then works down to the full hang-down swing-up. MEASURED at this preset\'s own settings (5 seeds): completes the curriculum and holds upright 78.7% of the rollout from a FULL hang-down start, worst seed 77.9% — 5/5, tight. BUT READ THIS, it is the honest part: run it with NO POLICY AT ALL (cart frozen, command ≡ 0) and the chain still reaches upright 58.8% of the time — the assist alone does most of the lifting. So the network is worth +19.9 points of upright-time here, not the whole 78.7. That is the real lesson of the assisted presets: an "assist" small enough to look subtle can still be doing the majority of the task. The RIGID swing-up presets use classical trajectory optimization and LQR with zero assists. They remain experimental after the September rail-dynamics correction; earlier success rates are invalidated.',
      setupId: 'triple',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: {
        gravity: 700, tiltDeg: 180, cartAccel: 4000, damping: 0.01,
        uprightAssist: 0.07, jointDamping: 2,
        cmaesHidden: 8, popSize: 40, rollouts: 2, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 30, thresholdFrac: 0.6,
        specs: [{ paramKey: 'startTiltDeg', from: 10, to: 180, steps: 30, mode: 'additive' }],
      },
    },
    // GENERALIZATION / ROBUSTNESS class (A): tasks that force the policy to
    // GENERALIZE rather than memorize one scenario — random disturbances, and a
    // target that moves between rollouts. The observation carries the state the
    // policy needs (tilt/velocity, or the hole position), so a robust policy
    // handles the whole distribution.
    'single-pendulum-nudged': {
      label: 'Single pendulum · nudges curriculum (shoves ramp 40 → 220)',
      description: 'A single pendulum balancer that must survive RANDOM SHOVES, with a curriculum on the shove STRENGTH: pushes start gentle (40 units) and ramp to violent (220) over 12 gated levels, firing at random intervals (~1-3s) throughout every rollout. The policy can\'t find one static equilibrium — it must actively REJECT disturbances like a real controller, against harder and harder hits. No assists — the honest free pendulum. Verified: completes all 12 levels and holds ~94% of the balance_up ceiling under the strongest shoves.',
      setupId: 'single',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: {
        gravity: 700, damping: 0.02, tiltDeg: 20, cartAccel: 3200,
        useDisturb: true, pushStrength: 220, pushIntervalMin: 1.0, pushIntervalMax: 3.0,
        cmaesHidden: 8, popSize: 40, rollouts: 3, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 12, thresholdFrac: 0.70,
        specs: [{ paramKey: 'pushStrength', from: 40, to: 220, steps: 12, mode: 'additive' }],
      },
    },
    'double-pendulum-nudged': {
      label: 'Double pendulum · nudges curriculum (unaided — frontier)',
      description: 'The UNAIDED double pendulum under random shoves, with the same shove-strength curriculum (20 → 120 over 10 levels). No angular assists of any kind — per the honest-physics principle — which makes this genuinely FRONTIER: the free double pendulum only reaches ~20-25% of the balance_up ceiling even before shoves are added (its stabilizing basin is a tiny target for reactive evolution), so expect the curriculum to grind in the low levels rather than complete. Shipped amber (experimental) as the honest robustness stress-test; the single-pendulum sibling is the one that completes.',
      setupId: 'double',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'balance_up',
      tags: ['experimental'],
      params: {
        gravity: 700, damping: 0.01, tiltDeg: 15, cartAccel: 3600,
        useDisturb: true, pushStrength: 120, pushIntervalMin: 1.2, pushIntervalMax: 3.0,
        cmaesHidden: 8, popSize: 40, rollouts: 3, evalSeconds: 8,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 10, thresholdFrac: 0.20,
        specs: [{ paramKey: 'pushStrength', from: 20, to: 120, steps: 10, mode: 'additive' }],
      },
    },
    'putt-moving-hole': {
      label: 'Putt · MOVING hole curriculum (hole shrinks 400→60 · jitter grows 0→±120)',
      description: 'Putt with a DOUBLE curriculum, ramped in parallel: the hole SHRINKS from a barn door (400px) down to 60px — just 2.1× the ball\'s diameter — while its position starts fixed and grows to ±120px of jitter, so the policy must simultaneously learn precision AND to READ the hole position from its observation instead of memorizing one strike. IT GENUINELY READS THE HOLE — proven by ablation: freeze the two hole inputs and all 13 test shots become byte-identical (same 464 px/s strike no matter where the hole is), while unfrozen the landing point TRACKS the hole (slope 0.7-1.9). HONEST DIFFICULTY, MEASURED (40 trials swept across the full ±120px jitter range, 3 seeds): the champion sinks about 44% of the time. That is a genuinely hard generalization task, not a solved one — the earlier claim here that it "sinks reliably" was wrong. Three bugs were fixed in 2026-08 after a user noticed it advancing too fast and still failing: the hole-position input SATURATED past +90px of jitter (so the top 12.5% of holes looked identical — sink rate there was 21% vs 67% elsewhere), the hole-WIDTH input was pinned at a constant for the first half of the ramp, and the curriculum advance gate sat BELOW the score of a complete miss. Fixing them lifted the sink rate from 29% to 44%. KNOWN REMAINING ISSUE: the curriculum still reaches level 10 in ~20 gens, because the gate reads the BEST of 60 individuals on a 3-rollout sample — with the hole jittering ±120px that is a lottery some individual wins by luck, not a competence test. Raise "rollouts per agent" if you want the advance to mean more.',
      setupId: 'putt',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'ball_in_hole',
      tags: ['experimental'],
      params: {
        gravity: 900, damping: 0.005, tiltDeg: 5, cartAccel: 2400,
        popSize: 60, rollouts: 3, cmaesHidden: 6, cmaesSigma: 0.5,
        ballSpawnX: -130, ballSpawnY: 96, ballMass: 0.5, ballRadius: 14, ballRestitution: 0.55,
        // Base holeWidth = the ramp DESTINATION so the post-curriculum world
        // (and the display after completion) matches the hardest trained level.
        holeCenter: 140, holeWidth: 60,
        holeCenterJitterOn: true, holeCenterJitterMag: 120,
      },
      // thresholdFrac note: ball_in_hole carries its own thresholdFrac (0.40,
      // objectives.js) which overrides the preset value in the advance gate —
      // kept identical here so the HUD mirrors reality.
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 10, thresholdFrac: 0.40,
        specs: [
          { paramKey: 'holeWidth',           from: 400, to: 60,  steps: 10, mode: 'additive' },
          { paramKey: 'holeCenterJitterMag', from: 0,   to: 120, steps: 10, mode: 'additive' },
        ],
      },
    },
    // The clean CNN showcase (#7): phase-space CNN on the single pendulum, where
    // the convolutional prior is genuinely competitive (verified 99% of ceiling
    // vs the MLP's 100% in the same 30-gen budget) — and the CNN inset panel
    // shows real activation maps while it balances.
    'single-pendulum-cnn': {
      label: 'Single pendulum · CNN phase-space (the CNN showcase)',
      description: 'The convolutional showcase that actually works: the CNN policy consumes the pendulum\'s recent PHASE-SPACE trace as an image and balances the single pendulum to ~99% of the fitness ceiling — matching the MLP within a rounding error in the same budget (verified head-to-head). Watch the CNN inset panel: the activation maps light up as the pendulum swings, a real look at what the filters respond to. This is the honest "CNN done right" example — a task whose observation is genuinely spatial. (Contrast dodge, where the top-K vector beats CNNs.)',
      setupId: 'single',
      mode: 'cmaes',
      policyType: 'cnn',
      objectiveId: 'balance_up',
      tags: ['solved'],
      params: {
        gravity: 700, damping: 0.02, tiltDeg: 30, cartAccel: 3200,
        popSize: 40, rollouts: 2, evalSeconds: 8,
      },
      curriculum: { enabled: false },
    },
    // Signing machine with TELESCOPING segments (#3): per-segment length control
    // + servo joints ≈ a Fourier-style trace machine (angle AND amplitude per
    // segment) with a fixed segment count.
    'signing-telescope-cmaes': {
      label: 'Signing machine · BIG slow figure-8 + telescoping (best measured)',
      description: 'The signing config that actually TRACES, found by a 17-run sweep: a BIG figure-8 (radius 140 — the user\'s hunch was right, small curves were the problem) drawn SLOWLY (10s period), by a 4-segment chain with cart + THREE joint servos + telescoping segment lengths (8 actions — per-segment angle AND amplitude, the Fourier-machine control set). MEASURED: small fast curves barely track (radius 60 / period 6 = 0.25 of the strict perfect-tracking ceiling); this config reaches 0.47 in 60 gens and 0.53 in 150 — a clearly recognizable figure-8, not pixel-perfect (the ceiling demands the tip be EXACTLY on the moving point every instant). THE "TELESCOPING VINDICATION" IS RETRACTED (2026-08-24, measured). This description used to claim the telescope beat fixed-length by +25% at radius 140 (0.47 vs 0.38) "because the big curve exceeds the fixed chain\'s comfortable envelope". That comparison is no longer a comparison: since the 2026-08-24 reach clamp the setup stages a curve inside the tip\'s SETTLED band, and a chain with no telescope has exactly ONE holdable height — its passive hang, y 326.6 — so turning the telescope OFF now also moves this figure-8 69.6 px deeper, from y 257 to y 326.6. The two arms are no longer at the same height, and the deeper one is the better-placed one. Re-measured PAIRED, 5 seeds × 60 generations, mean tip→cursor px over 3 loops with the first skipped, both start tilts at ±0.1 rad: telescope ON at its y 257 → 81.2 ± 6.6 px; telescope OFF at its own y 326.6 → 65.0 ± 2.8 px, BETTER on 5 of 5 seeds; telescope OFF forced back to y 257 → 77.6 ± 4.5 px. So fixed-length wins by 16 px at the placements the app now uses, and by only 3.5 px at a matched height — i.e. most of the old story was placement, not amplitude control. (The retired 0.47/0.38 pair was a closeness score on the app\'s own start-pose defaults, taken at the y=90 placement two fixes ago; it is not comparable to the px above and is not re-derived here.) Let it run 100+ gens and watch the trail settle onto the curve — and if you toggle the telescope, watch the curve move too.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'figure8', tracePeriod: 10, traceRadius: 140,
      },
      curriculum: { enabled: false },
    },
    'signing-accept-curriculum': {
      label: 'Signing machine · TRIANGLE (tightest measured) + accept curriculum',
      description: 'The accessible signing machine, rebuilt from a measured sweep. The big finding: the curve\'s SHAPE and PLACEMENT dominate — not leniency. On the honest metric (mean tip→curve distance in px, which — unlike fitness/ceiling — doesn\'t rescale with curve size), a TRIANGLE at radius 100 traces to ~50px, and a horizontal "line" to ~58px, roughly DOUBLE the closeness of the old big figure-8 (~97px). Why: circle/figure-8 have a tall y-extent that sweeps the tip up near the cart against gravity (circle is actually the WORST shape, ~92px); a triangle/line/ellipse stays in the chain\'s comfortable low-mid workspace. So this preset uses a triangle (recognizable + tightest). The ACCEPTING-RADIUS curriculum you can watch: the scoring tolerance starts lenient (200px) and shrinks toward the policy\'s achievable ~55px over 10 gated levels — the level visibly advances and the drawn circle tightens. HONEST: the curriculum is a "watch precision improve" UX, not a ceiling boost — measured it TIES a well-placed fixed scale (chain_trace already has a 15% far-term that bootstraps early learning, so there\'s no cold-start gap for it to bridge; the floor stops at ~55 because shrinking below the achievable error just starves the gradient). Try the Curve dropdown — line/triangle/ellipse are the easy, tight shapes; circle/figure-8/signature are the hard, showy ones.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'triangle', tracePeriod: 12, traceRadius: 100, traceAcceptRadius: 200,
      },
      curriculum: {
        enabled: true, consecRequired: 2, maxLevel: 10, thresholdFrac: 0.50,
        // Floor at ~55px (the measured achievable error) — shrinking below it
        // starves the refinement gradient and scores WORSE (measured).
        specs: [{ paramKey: 'traceAcceptRadius', from: 200, to: 55, steps: 10, mode: 'additive' }],
      },
    },
    // A DIFFERENT kind of signing: instead of chasing a moving cursor, thicken
    // the curve into an ACCEPTABLE-RANGE band and grade the tip on how much of
    // the band it PAINTS (covers), minus a penalty for straying outside. No
    // cursor to track — the tip self-directs its sweep toward the nearest
    // still-unpainted band point. See objectiveId chain_paint.
    'signing-paint-cmaes': {
      label: 'Signing machine · PAINT the band (coverage, no cursor)',
      description: 'A different way to "sign": there is NO moving cursor to chase. The target curve is thickened into a BAND (an acceptable range, half-width 40px), and the tip is graded purely on how much of the band its swept path PAINTS — minus a penalty for every second it spends OUTSIDE the band (overlap counted, so thrashing to cover space costs more, not less). This is the honest answer to "don\'t force it to hug a point": the tip is free to move at its own pace and cut its own path, as long as it covers the band and stays on it. Crucially, "just sweep everywhere" LOSES — a validated sweep-everything policy covers ~70% of the band but scores strongly NEGATIVE because it bleeds the outside penalty; only a policy that paints the band and stays on it wins (measured: a precise tracer ~+8, a do-nothing ~+1.3, a sweeper ~−8). This is a HARDER exploration task than cursor-tracking — the reward only pays out as NEW band is covered — so give it time: MEASURED on the triangle band with CMA-ES + the rigid chain, coverage climbs to ~75% by ~80 generations and ~95% by ~150 (spending ~15-20% of the time just outside the band as it works). Try the Curve dropdown — triangle/ellipse/line paint tightest; circle/figure-8 are the showy, harder ones. Watch the band fill GREEN as it paints; the cyan dot marks the nearest unpainted spot it\'s heading for. Amber because it needs patience (100+ gens) to fill the band.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_paint',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'triangle', tracePeriod: 12, traceRadius: 100,
        // Band half-width (reuses the accepting-radius knob): 40px is the
        // measured sweet spot — sweepers strongly negative, a real tracer maxes.
        traceAcceptRadius: 40,
        chainPaint: true,
      },
      curriculum: { enabled: false },
    },
    // STROKES (#actual signing): paint's coverage idea, but continuity now
    // costs. The tip is a pen; leaving the band ENDS the stroke and the next
    // contact starts a new one. See objectiveId chain_stroke for the score
    // algebra and the foil-by-foil justification of every constant in it.
    'signing-strokes-cmaes': {
      label: 'Signing machine · STROKES (draw it in as few strokes as possible)',
      description: 'The signing machine finally treats the tip as a PEN. Paint mode graded coverage and ignored continuity — the same band filled by one clean pass and by fifty disconnected dabs scored identically. Here, while the tip is inside the band the pen is DOWN and drawing; the instant it strays outside, the stroke BREAKS, and the next contact starts a NEW stroke. You never lose the ink already laid down, but the whole drawing is discounted by how many strokes it took, so a signature is worth most when it is one continuous line. WHAT YOU WATCH: the band brightens while the pen is down and dims when it lifts, and the readout carries the number the optimizer is actually fighting — "drawn 93% · 2 strokes · pen DOWN". MEASURED (CMA-ES, 150 gens, 2 seeds, honest metrics over both start tilts): on this figure-8, 91% of the band drawn in 1.25 STROKES at 20px mean tip→curve — a genuinely continuous signature, which is the whole point. On the triangle the same setup draws tighter, 95% at 12px, but the count floors at 2. Against a do-nothing policy at 0% drawn / 146px, and a RANDOM gen-0 policy that covers 38-45% of the band and still scores BELOW do-nothing, because at ~200px off the line the precision discount takes back everything its flailing collected. The triangle\'s 12px is the number worth staring at: it is three to four times tighter than the 42-45px ceiling every cursor-chasing preset in this app runs into on that same shape. Nothing about the chain changed — an untimed pen simply never has to be somewhere at a particular instant, so it can wait for the swing instead of lagging behind a clock. DOES THE STROKE PENALTY ACTUALLY DO ANYTHING? An ablation answers it — identical world, identical inputs, only the discount changes. On this figure-8, turning it off costs you continuity: 2.75 strokes without it versus 1.25 with, two seeds each, no overlap. And it pays for that continuity in coverage (91% drawn with the penalty, 100% without), which is exactly the trade the objective exists to price. HONEST CAVEATS, both measured. (1) Run the same ablation on the TRIANGLE and it does NOTHING — 2.00 strokes either way, because there the count is pinned by the plant rather than the reward. Instrumenting where the pen lifts says why, and it is the limitation that caps every signing preset in this app: the break always happens on the CLIMB toward the apex — pen down along the bottom edge, up about a third of the way up the side (measured at y≈105-116 of a 30-180 band), back down at or just below the apex. The chain hangs below its workspace and cannot crawl up; it has to fling the tip, and it leaves the band mid-fling. A stroke count on a curve with a fling-only corner is measuring the arm, not the controller — which is exactly why this preset ships the figure-8. (2) The lookahead observation, which cuts cursor-tracking error by 8-17%, buys nothing at the finish here (11.1px vs 11.6px on the triangle, seeds overlapping) — it only gets there faster (15.0px vs 21.2px at generation 30). Both results are what you would expect once the clock is gone, and both are the reason this preset is amber. The design work is in the SCORE, and every constant in it was forced by a foil that beat the honest drawing without it — including the one that nearly sank the whole thing: a pen that parks motionless on the line, scores a perfect precision term forever, and never draws anything.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_stroke',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        // 14s, not paint's 8s: the pen sets its own pace and has to get the tip
        // from its resting hang (~140px below the band) all the way around the
        // curve. At 8s the best policies were still mid-signature.
        evalSeconds: 14, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        // FIGURE-8, not paint's triangle, and the choice was measured. On the
        // triangle the pen draws TIGHTER (12px vs 20px mean) but the count
        // floors at 2 because the apex can only be reached by flinging the tip,
        // which necessarily leaves the band. The figure-8 has no such
        // unreachable corner, so the pen actually achieves the thing the
        // objective is named after: 1.0-1.5 strokes, i.e. a genuinely
        // continuous signature. Switch curveId to 'triangle' if you would
        // rather watch the tightest line this chain can draw.
        curveId: 'figure8', tracePeriod: 10, traceRadius: 140,
        // Band half-width = ink radius = pen-DOWN radius. 40px is inherited
        // from the paint sweep and is right for stroke mode too: a trained pen
        // holds ~20px mean distance here (12px on the triangle), so 40px is a
        // tube it can stay inside from early training on — and it CANNOT be
        // made much tighter to punish scribbles, because a 14s scribble passes
        // within 10px of ~100% of the band no matter how narrow the ink radius
        // is. Sloppiness is charged by the score's precision term instead.
        traceAcceptRadius: 40,
        // Pen-UP radius = 1.6 × the band. MEASURED: honest drawings score the
        // SAME stroke count at every ratio from 1.0 to 2.0 (1 / 5 / 16), while
        // a pen that merely jitters across the band edge counts 43-109 strokes
        // at ratio 1.0 and exactly 1 at 1.6 — and a genuine 2.0w departure
        // still lifts. The hysteresis suppresses noise, not real lifts.
        strokeLiftRatio: 1.6,
        chainStroke: true,
      },
      curriculum: { enabled: false },
    },
    // Third signing objective: cover the curve, but ONLY in the curve's own
    // order, at whatever pace the policy likes. See objectiveId
    // chain_trace_ordered.
    'signing-ordered-cmaes': {
      label: 'Signing machine · IN ORDER (self-paced, monotone along the curve)',
      description: 'The third way to sign, and the one that finally asks for the FLOW of the curve rather than its footprint. There is no cursor: the curve is cut into 120 ordered waypoints and only the FRONTIER — the next unclaimed one — can ever pay. Touch a waypoint 60 steps ahead and you earn nothing, so "cover the shape in any order" has no route to the reward at all. And the frontier never moves on its own: the tip may take the whole rollout, sprint the lap in 3 seconds, or stop dead halfway and resume — MEASURED, all three score within 0.6 of each other. The score is the LONGEST UNBROKEN run, which is what stops the clever cheat: a cover that visits six arcs of the shape in scrambled order, each traversed forwards, was claiming 75% of the waypoints and OUTSCORING a perfect trace until continuity was required — it now scores 3.9 against a perfect trace\'s 11.4. WHY THIS IS NOT chain_paint: paint scores a reversed trace and a six-arc jumble at 7.03, EXACTLY what it gives a flawless one — it cannot see order at all. This objective separates those same three by more than 11 points. WHAT TO WATCH: waypoints turn green behind the frontier ring; when a run breaks, the green vanishes and it starts over — that collapse IS the objective. MEASURED (CMA-ES, 2 seeds × 150 gens on this exact preset): the best run reaches 77% and 87% of the curve in ONE unbroken pass, at 31-55px mean tip→curve error, against a do-nothing baseline of 0% and 166px. Two honest caveats. It does NOT reliably close the loop — the last stretch of a triangle is the high vertex, which this plant can only reach in a transient swing. And the checkpoint-to-checkpoint number bounces (seed 2 read 87% at gen 100 and 64% at gen 150) because the champion is picked on randomized starts and re-measured on fixed ones; watch the trend, not one generation. Amber for exactly that variance. PLACEMENT, PINNED AND MEASURED (2026-08): this preset fixes the curve\'s centre height at y 257. The setup\'s auto-placement now clamps a curve into the chain\'s settled reach band, y ∈ [166.6, 518.6], and this triangle\'s apex sits at y 117 — 49.6px above that ceiling, which IS the "high vertex only reachable in a transient swing" caveat above — so unpinned the app would stage it 49.6px deeper, at 306.6. Both were run head to head on the harness protocol (±0.1 rad, both sides, 8s rollouts), 3 seeds × 150 generations, scored on this objective\'s own metric — the longest unbroken in-order run: BOTH placements reach 100% of the curve on all 3 seeds, at 23.0px mean tip→curve pinned against 24.4px auto-placed (1 of 3 seeds better). At the 60-generation budget, 5 paired seeds: best-ever ordered fitness 8.52 pinned against 8.00 auto-placed, 2 of 5 better. A null in both directions, so the placement stays where the numbers above were taken. What DOES change is the do-nothing floor, and it is worth knowing why the quoted 0% baseline is protocol-specific: at y 257 the resting tip hangs at 326.6 and the triangle\'s baseline sits at 327, so a frozen chain is already sitting on the drawing and claims 27% of the waypoints from a ±0.1 rad start; auto-placed at 306.6 that coincidence is gone and it claims 35% while sitting 19px off the curve. The 0%/166px figure above is from the app\'s own 20°/one-sided default start, where the cart begins 227px along the rail and the tip is nowhere near the shape.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace_ordered',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        // r140, NOT the r100 the other signing presets use. The ordered
        // objective is only discriminative while the accepting radius is small
        // relative to the CURVE: measured across 48 (shape, size, band) combos,
        // a perfect trace beats every impostor comfortably at band/perimeter
        // <= 8%, thins out by 10%, and INVERTS past ~12% (at band 120 on a
        // 521px triangle a raster sweep scores 10.46 to a perfect trace's
        // 10.14). Band 60 on this 729px triangle is 8.2% — and 60px is also
        // wide enough for the plant. (That last clause used to read "whose
        // tracking floor is ~42px" — a stale number this file's own planner
        // description already retracts. 42.7px was triangle at the PRE-2026-08-10
        // placement, y=90, with the curve mostly above the chain's reachable band;
        // it was a placement limit, not a plant limit. This preset pins the y=257
        // placement, where the engineered planner measures 16.5px on this same
        // triangle at r140. The conclusion is unchanged and now has more margin,
        // not less — 60px clears a 16.5px floor comfortably.)
        curveId: 'triangle', tracePeriod: 12, traceRadius: 140,
        traceAcceptRadius: 60,
        chainOrdered: true,
        // PLACEMENT PINNED to the height every figure in the description was
        // measured at. The setup's auto-placement now clamps a curve into the
        // tip's settled reach band and would stage this triangle at y 306.6
        // instead of 257 — the apex sits 49.6 px above the band's ceiling here,
        // which is exactly the "high vertex the plant can only reach in a
        // transient swing" the description names. Moving it was measured and
        // came out NULL both ways (see the description), so the caveat is kept
        // honest rather than quietly re-staged.
        traceCenterY: 257,
      },
      // Curriculum OFF, and that is a MEASURED choice, not an omission.
      //
      // The right knob exists and is calibrated: orderedRequiredFrac 0.3 -> 1.0
      // with thresholdFrac 0.55. Note it is NOT a traceAcceptRadius ramp — a
      // band ramp would spend its easy levels rewarding the very sweep this
      // objective exists to reject (at band 120 a raster sweep outscores a
      // perfect trace). And 0.55 of the 10-point ceiling is a real gate rather
      // than a decorative one: it sits ABOVE every cover-in-any-order impostor
      // in the validation table (best 5.01) and BELOW a genuine half-curve
      // trace (6.56).
      //
      // It just does not WIN. Head to head, 2 seeds × 150 gens, best fraction
      // of the curve traced in one pass: fixed 77% / 87%, ramped 54% / 90%.
      // That is a tie inside seed noise, not an improvement — the same verdict
      // the accepting-radius curriculum earned on the tracking preset. It is
      // off here because a knob that does not pay for itself should not be the
      // default a user inherits.
      //
      // One real hazard if you do turn it on, visible in the ramped seed that
      // finished at 30%: the levels advance quickly (level 8 by gen 30) and
      // fitness is NOT comparable across them, so a level-4 champion scoring
      // 7.94 against a 30%-arc target outranks every later genome that traces
      // far more of the curve against the full one — and bestEver never lets
      // go of it. Ramp the arc only with level-aware champion selection.
      curriculum: { enabled: false },
    },
    'signing-planner-showcase': {
      label: "Signing machine · model-based trace tracking",
      description: "A receding-horizon controller searches cart motions while joint servos and telescoping links follow the target curve. On this figure-eight, the rail-centered measurement is 18.1 pixels mean error, versus 127.5 with zero control (radius 140 pixels, three 10-second loops, first loop discarded, two initial tilts). The curve is placed inside the measured reach of the chain. This is approximate physical tracking, not a pixel-perfect pen plotter or a trained network. The Fourier machine provides a separate analytic reconstruction comparison.",
      setupId: 'chain-trace',
      mode: 'signing-planner',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['solved'],
      params: {
        numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'figure8', tracePeriod: 10, traceRadius: 140,
        evalSeconds: 8, popSize: 8, rollouts: 1,
      },
      curriculum: { enabled: false },
    },
    // ANTICIPATION signing (#lookahead): the reactive signing machine's tracker,
    // upgraded with the probe-validated lookahead observation. See the
    // chainTraceLookahead threading (stash → readParams → setObservationShape
    // seam → eval_worker parity) and the setups.js field comment for the data.
    'signing-lookahead-cmaes': {
      label: "Signing machine · learned anticipatory tracking",
      description: "A reactive MLP receives the current tracking error plus target offsets 0.3 and 0.8 seconds ahead. That supplies direction information a single target position cannot identify. Earlier measured figure-eight runs improved from 53.2 to 40.1 pixels, while the historical initial-tip planner benchmark reached 17.9 pixels on its longer steady-state protocol. These numbers use different protocols and are not a fresh paired comparison. This remains approximate learned tracing, not a proven hardware ceiling.",
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'figure8', tracePeriod: 10, traceRadius: 140,
        chainTraceLookahead: true,
      },
      curriculum: { enabled: false },
    },
    // ---- THE ACCEPTING-RADIUS LADDER ---------------------------------------
    // Four presets, ONE knob (traceAcceptRadius — the reward's closeness
    // tolerance, deliberately decoupled from the curve's geometric size), three
    // of the signature strokes. They exist because the same knob at the same
    // value does three different things depending on the curve, and which one
    // you get is predicted by the error that curve can actually reach:
    //
    //   swash       (arc 4.13, span 0.49)  reaches 30 px  -> 80 px is FREE
    //   longhand    (arc 7.45, span 1.12)  reaches 64 px  -> the knob is a NO-OP
    //   copperplate (arc 9.56, span 1.77)  reaches 66 px  -> 80 px already COSTS,
    //                                                        55 px goes blind
    //
    // Every number in the four descriptions below was measured with ONE harness
    // and ONE protocol: the shipped signing config (CMA-ES MLP, 4 rigid
    // segments, 3 servo joints, telescope ON, pop 40 x 2 rollouts, 8 s eval),
    // scored as mean |tip - cursor| px over a full loop from BOTH start tilts
    // (+/-0.1) with the first second skipped — the same protocol
    // stepSigningPlannerGeneration uses on screen, so the HUD number and the
    // quoted number are the same measurement. Tip error in PIXELS is the only
    // metric comparable across tolerances: fitness is not, because distScale IS
    // traceAcceptRadius, so a tight preset's fitness lives on a different scale.
    //
    // WHY THE KNOB BREAKS, mechanically: the closeness term is 1 - dist/distScale
    // with distScale = max(30, traceAcceptRadius) — note the floor, so "25" and
    // "30" are the same setting. Once the accepting radius drops below the error
    // a fresh population can reach, that term is zero for nearly every genome
    // and selection runs on the weak 15% far term over distScaleFar = 320 alone.
    // The search does not get harder; it goes BLIND.
    //
    // WHY ALL FOUR PIN tiltDeg AND tiltDirection — found by live verification,
    // and it is the difference between these presets reproducing their numbers
    // and not. The measuring harness used the TRAINER defaults for the start
    // pose (startAngleRange 0.1 rad, tiltDirection unset = 'both'). The APP does
    // not: readParams feeds startAngleRange from the tiltDeg SLIDER, whose
    // default is 20° (0.349 rad — 3.5x the protocol), and loadRunPreset defaults
    // tiltDirection to 'left' for any preset that does not set it. A preset that
    // stays silent therefore trains on a DIFFERENT start-pose distribution than
    // the one every px figure below was measured on, and it is not a small
    // difference — the chain-trace setup anchors the curve at the RESTING TIP
    // (chainTrace.center.x = restTip.x), so a 20° start tilt also slides the
    // whole curve 227 px sideways, off the end of a rail that stops at ±260.
    //
    // MEASURED on signing-swash-tight, same harness, same eval protocol, 3
    // matched seeds x 100 generations (tip err px at gen 100, and the fraction
    // of the loop inside the preset's own 80 px tolerance):
    //     6°  / both  (what is shipped)  28.6 / 32.0 / 27.8   99 / 99 / 99 %
    //     0.1 / both  (harness default)  31.4 / 31.7 / 55.4   99 / 100 / 78 %
    //     0.1 / left  (direction alone)  48.9 / 54.5 / 46.0   86 / 74 / 86 %
    //     20° / both  (magnitude alone)  39.3 / 66.2 / 64.2   93 / 74 / 74 %
    //     20° / left  (the app default)  51.7 / 72.6 / 50.1   83 / 69 / 81 %
    // Both halves cost real error and neither alone explains it. 6° is used
    // rather than 5.73° (=0.1 rad) only because the slider's step is 1°; the
    // resulting 0.10472 rad reproduces the protocol (row 1 vs row 2 above).
    //
    // WHY ALL FOUR ALSO PIN traceCenterY — the same argument, one axis over,
    // and new in 2026-08. The chain-trace setup's auto-placement stopped
    // anchoring on numSegs*segLen (the SPRING REST LENGTH, not the reach) and
    // now clamps the curve into the tip's settled reach band, y in [166.6,
    // 518.6] for this chain. At r140 that moves `copperplate` from y 257 to
    // 285.7 — 29 px of it was above the band's ceiling — while `swash` and
    // `longhand` already fitted and do not move at all. A family whose whole
    // claim is "the SAME knob on three curves" cannot have one of its curves
    // silently re-staged, and every px figure in these four descriptions was
    // taken at 257, so all four pin 257 and the comparison stays controlled.
    //
    // AND MOVING IT WAS MEASURED, not assumed: signing-copperplate-blind at
    // the auto-placement instead of the pin, 10 paired seeds x 60 generations
    // on the harness protocol, is 105.4 -> 107.7 px (5 of 10 seeds better,
    // t = +0.39) and 0.82 -> 0.87 against its own do-nothing floor (which the
    // move lowers, 129.2 -> 124.1 px). That is a NULL. The hand-written planner
    // does prefer the deeper placement on this curve — 27.3 -> 25.7 px — but
    // 1.6 px of planner error is not worth re-running a 36-run tolerance ladder
    // and re-writing every number below. Set the "Trace centre y" slider to 0
    // to see the auto-placement instead; the registry's 25.7 px is quoted there.
    'signing-swash-tight': {
      label: 'Signing machine · SWASH at a TIGHT tolerance (the one it solves)',
      description: 'The first chain-trace preset in this app that a learned policy genuinely SOLVES, and the accepting-radius knob is the reason it can say so. traceAcceptRadius is the reward\'s closeness tolerance — the radius inside which the tip counts as "on the curve" — and it is decoupled from the curve\'s geometric size, so it can be tightened on its own. This ships it at 80px on a 140px curve. MEASURED (6 seeds × 100 generations, mean tip→cursor px over a full loop from both start tilts, first second skipped): the trained policy ends at 32.3 ± 1.6px and spends 99% of the loop INSIDE that 80px radius — three seeds measured at 99/99/99%, already 98-100% by generation 70. THAT SAMPLE WAS TOO SMALL, and re-measuring says so — read the next three sentences before you trust the ± above. Those six seeds ran at the trainer\'s 0.1 rad start pose, not the 6° = 0.10472 rad this preset now pins, so 20 seeds were re-run at the exact shipped config: 31.9 ± 4.4px on 19 of them (range 25.7-43.8px, inside the 80px tolerance for 93-99% of the loop) and ONE seed in 20 that FAILS outright — 96.0px at 58% in-tolerance, barely clear of the do-nothing floor. Counting it, the 20-seed sample is 35.1 ± 14.6px with a median of 30.7. So the typical run reproduces, the ±1.6px spread does NOT, "99/99/99%" should be read as 93-99%, and about one training run in twenty simply never leaves the floor — press Reset and train again if you draw it. Calibrate that against BOTH ends, because one of them alone would flatter it. The do-nothing floor — cart and joints frozen, same scene — is 130.6px. The app\'s hand-written PLANNER, no network, solved at generation 0, reaches 10.9px steady-state (12.8px on the shorter one-loop protocol). So learning closes 82% of the floor→planner gap and the ENGINEERED controller is still 3.0× better: this is a preset that works, not one that wins. For scale against the rest of the family, the best learned trace previously measured on this plant at the same radius, period and budget was 44.8px (wide loop) and 58.1px (figure-8). WHY 80 AND NOT TIGHTER — the whole point of the ladder. Identical config, only traceAcceptRadius moves: OFF (i.e. 140) 29.7 ± 1.3px, 120 → 32.7 ± 2.9, 80 → 32.3 ± 1.6, 55 → 38.5 ± 7.2, 40 → 40.4 ± 8.6, 25 → 47.5 ± 15.6. (That last row is really 30 — the knob floors at the chain\'s success radius, so 25 and 30 are the same setting.) Read the SPREAD, not the mean: tightening past 80 does not collapse the average, it destroys RELIABILITY. The worst single seed goes 35.5 → 49.7 → 56.2 → 68.5px as the tolerance shrinks. (Each of those is the worst of 3-6 seeds at the 0.1 rad pose; the 20-seed re-run at the shipped pose found a worse tolerance-80 seed still, 43.8px, plus the 96.0px failure — so the row is a trend, not a ceiling.) The reason is that once the accepting radius falls below the error a fresh population can actually reach, the sharp closeness term is STARVED and selection leans on the weak 15% far term. MEASURED where the claim lives, on the real generation-0 population of 40 genomes: the share of total reward carried by the sharp term falls 65% (tolerance OFF) → 39% (80) → 10% (25) on this curve, and the share of a rollout\'s steps that pay it at all falls 31% → 11% → 1.8%. It is graded starvation, NOT an on/off blindness — even at 25px, 21-22 of the 40 genomes still collect something — and the generation-0 signal alone does not sort the outcomes, because swash at its shipped 80px starts with a WEAKER sharp share (39%) than copperplate does at 200px (76%) and swash is the one that solves. What decides it is whether the tolerance sits above the error that curve can eventually reach. 80px is the tightest setting measured to cost nothing here. Green on a re-measured criterion — 19 seeds in 20 end at 25.7-43.8px inside their own 80px tolerance for 93-99% of the loop, against a 130.6px floor — NOT because the trace is pixel-perfect and NOT because every seed works. Swash is also the easiest signature-like shape in the registry by both measured predictors: second-shortest arc (4.13) and second-flattest span (0.49), beaten on each only by the degenerate `line`, which is not a signature. ONE MORE SETTING IS LOAD-BEARING, and it is not a style choice: this preset pins the training START POSE to 6° on BOTH sides, because that is the protocol every number above was measured at — strictly, 0.1 rad, and 6° is the nearest the slider\'s 1° step can get, 0.10472 rad — and it is NOT what the app would otherwise use. The tilt slider defaults to 20°, and a preset that names no direction is given a one-sided tilt — on this exact config, three matched seeds × 100 generations: 51.7/72.6/50.1px at 83/69/81% in-tolerance on those defaults, against 28.6/32.0/27.8px at 99/99/99% with the pose pinned. Both halves cost real error on their own (one-sided alone 48.9/54.5/46.0px, 20° alone 39.3/66.2/64.2px). And 20° is not merely a harder start: this scene anchors the curve at the chain\'s RESTING TIP, so a 20° tilt also slides the whole 140px curve 227px along a rail that stops at ±260, putting part of the drawing where the machine cannot reach it. SO IS THE PLACEMENT, for the same reason: all four presets pin the curve\'s centre height (traceCenterY 257), which is what every px figure here was measured at. `swash` fits at 257 with or without the pin — the setup\'s 2026-08 reach clamp leaves it exactly where it was — but `copperplate` does not, and a family whose claim is "the same knob on three curves" has to keep the three curves on one stage.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['solved'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'swash', tracePeriod: 10, traceRadius: 140,
        // 80px = the tightest measured-free setting. See the ladder in the
        // description: 120 and 80 tie the no-tolerance baseline; 55 and below
        // lose reliability seed by seed.
        traceAcceptRadius: 80,
        // The start pose every px figure was measured at. NOT decoration — see
        // the block comment above the family: the app's defaults (20°, 'left')
        // cost this preset ~20px and 16 points of in-tolerance time.
        tiltDeg: 6, tiltDirection: 'both',
        // The PLACEMENT every px figure was measured at (block comment above).
        // swash fits at 257 either way, so this pin is a no-op today — it is
        // here so the four presets stay on one height if the plant ever moves.
        traceCenterY: 257,
      },
      curriculum: { enabled: false },
    },
    'signing-longhand-tight': {
      label: 'Signing machine · LONGHAND (flagship stroke — the knob does nothing here)',
      description: 'The flagship signing scene on the flagship shape: `longhand`, a five-hump name closed by an underline swash, built deliberately alongside the old `autograph` scrawl in arc length (7.45 vs 7.50 in unit terms) and vertical span (1.12 vs 1.25) so the two are comparable — and measured tighter than it on the engineered controller (19.6px vs 21.2). It ships the accepting radius at 55px, and the HONEST headline is that on this curve the setting barely matters. MEASURED (same config and same protocol as every number in this family): tolerance 55 → 65.0 ± 7.3px over 6 seeds × 100 generations, tolerance 200 → 68.7 ± 8.9 over 3 seeds, a 200→55 curriculum ramp → 65.6 ± 0.6, a 200→40 ramp → 65.9 ± 0.6. Four settings spanning a 5× range of the knob, one number — this curve\'s difficulty is set by its SHAPE, NOT by the reward\'s tolerance, and a preset that quietly shipped the ramp here would be selling a curriculum that measurably does nothing. The tip is inside its own 55px radius for 38-57% of the loop (the original three seeds 45/47/57%; five more at the shipped start pose 56/50/45/50/38%), so the reward is paying part-time rather than going blind — the middle rung between the swash preset\'s 93-99% and the copperplate foil\'s 30-43%. Those five re-runs also put the tip error at 58.2-79.2px against the 65.0 ± 7.3 above, so treat 65px as the centre of a ~20px-wide band, not as a repeatable figure. Against the 122.7px do-nothing floor and the hand-written planner\'s 19.6px steady-state (28.6px on the shorter one-loop protocol), 65.0px closes 56% of the gap and leaves the engineered controller 3.3× ahead — a wider gap than the swash preset\'s 3.0×, on a curve with 1.8× the arc length and 2.3× the vertical span. Amber because that is a recognizable signature, NOT a tight one. Like the rest of the family this preset pins the training start pose (6°, both sides) to the protocol its numbers were measured at — left on the app\'s 20°/one-sided slider defaults the identical config measures 72.1/79.9px at 30-32% in-tolerance instead of 58.2/68.0px at 50-56%, so the "the knob does nothing here" finding would read as a much worse curve than it is. It pins the PLACEMENT the same way (traceCenterY 257): longhand fits at that height with or without the pin, but the family only stays a controlled comparison while all four curves share one stage, and copperplate does not fit there. Load `signing-swash-tight` to see the same knob be free, and the copperplate pair to see it bite.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'longhand', tracePeriod: 10, traceRadius: 140,
        // 55 is shipped because it is the TIGHTEST of four settings that all
        // measure the same (65.0-68.7 px) — not because it helps.
        traceAcceptRadius: 55,
        // Same measured start pose as the rest of the family (block comment above).
        tiltDeg: 6, tiltDirection: 'both',
        // Same measured placement (block comment above). longhand also fits at
        // 257 unaided; pinned so the family shares one height.
        traceCenterY: 257,
      },
      curriculum: { enabled: false },
    },
    'signing-copperplate-accept-ramp': {
      label: 'Signing machine · COPPERPLATE + accepting-radius RAMP (rescues a fatal tolerance)',
      description: 'The one place in this family where the accepting-radius CURRICULUM earns its keep, measured against the flat setting it replaces. `copperplate` is the hardest of the SIX signature strokes shipped with it — the longest arc (9.56) and the tallest span (1.77) of that set together. (Registry-wide it is not the extreme of anything: `cursive` has a longer arc, 10.34, and measures worse, 28.9px against copperplate\'s 27.3, and `circle` and `square` carry taller spans at 2.00 and 1.80.) At a flat 55px accepting radius the learner goes blind: 94 ± 13px over 6 seeds, and in the same-process head-to-head 99.8 ± 5.5px with 0 of 3 seeds still improving at generation 100. Ramp the SAME endpoint instead — 200px shrinking to 55 over 10 gated levels — and the identical config reaches 73.8 ± 5.3px over 6 seeds, with 3 of 3 seeds in the same-process head-to-head still improving at generation 100. Three FRESH seeds run against the flat arm at the shipped start pose reproduce it PAIRED and with no overlap — ramp 81.5/63.1/81.8px against flat 94.1/106.1/97.3 on the same three seeds. Read that as a paired result, NOT as two separated distributions: pooling every seed measured, the ramp spans 63.1-82.6px over 9 seeds and the flat arm 72.8-106.8 over 9, so the two ranges DO overlap. It is inside the 55px the spec names for 38-67% of the loop over those 9 seeds (the original trio: 50/50/51%), against the flat arm\'s 30-43%. That is a ~21px rescue across all seeds and ~24px paired and it is the mechanism the ramp exists for: start the tolerance ABOVE the error the population can reach, so the sharp closeness term actually pays, then tighten it as the policy earns it. TWO CAVEATS, both measured, both the reason this is amber and NOT green. (1) The ramp does NOT beat simply leaving the tolerance loose: flat 200 measures 65.5 ± 2.4px and no tolerance at all measures 66.5 ± 2.1 on this same curve, so the honest ranking is loose > ramped > tight. A curriculum that rescues a self-inflicted wound is still worth watching, but it is NOT a ceiling boost. (2) It works partly by NOT ARRIVING: at generation 100 the levels read 5-7 of 10, i.e. an effective accepting radius of roughly 98-128px rather than the 55 the spec names. Watch the level counter and you are watching that caveat happen. Calibration for the number itself: the do-nothing floor on this scene is 129.8px and the hand-written planner reaches 27.3px steady-state (30.2px on the shorter one-loop protocol), so 73.8px closes 55% of the gap and the engineered controller stays 2.7× ahead. The training start pose is pinned to the measured protocol (6°, both sides) like the rest of the family, and on this preset the pinning is what makes the level counter mean anything: on the app\'s 20°/one-sided slider defaults the same ramp crawls to level 4 of 10 and 129.9/91.5px, against level 7 and 66.2/68.4px pinned. THE PLACEMENT IS PINNED TOO (traceCenterY 257), and unlike the start pose that pin actually changes the scene: since 2026-08 the setup clamps a curve into the tip\'s measured reach band, and copperplate at r140 hangs 29px above its ceiling, so left to itself the app would stage this curve at y 285.7 instead — where the planner reads 25.7px and the do-nothing floor 124.1px rather than the 27.3 and 129.8 quoted above. Moving it was MEASURED on the foil this preset is paired with, 10 paired seeds × 60 generations: 105.4 → 107.7px, 5 of 10 seeds better, t = +0.39, and 0.82 → 0.87 against each scene\'s own floor. A null. So the pin costs nothing measurable and keeps every figure here reproducible; set the "Trace centre y" slider to 0 if you want the auto-placement.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['experimental'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'copperplate', tracePeriod: 10, traceRadius: 140,
        traceAcceptRadius: 200,
        // Same measured start pose as the rest of the family (block comment above).
        tiltDeg: 6, tiltDirection: 'both',
        // Same measured placement (block comment above). Unlike swash and
        // longhand, copperplate DOES move without this — the auto-placement
        // puts it at 285.7 — so on this preset and its foil the pin is what
        // keeps every number in the description reproducible.
        traceCenterY: 257,
      },
      curriculum: {
        // Same shape as signing-accept-curriculum's ramp (200 -> 55 over 10
        // additive steps, gate at half the level's ceiling, 2 consecutive
        // clears). What differs is the CURVE: on the triangle that ramp ties a
        // well-placed fixed scale, and on `longhand` it ties every flat setting
        // from 200 to 40. Here the flat endpoint is fatal (99.8 px, 0/3 seeds
        // improving) and the ramp is not (74.9 px, 3/3 improving), which is the
        // only measured case in this app where the ramp is the reason the run
        // works at all.
        enabled: true, consecRequired: 2, maxLevel: 10, thresholdFrac: 0.50,
        specs: [{ paramKey: 'traceAcceptRadius', from: 200, to: 55, steps: 10, mode: 'additive' }],
      },
    },
    'signing-copperplate-blind': {
      label: 'Signing machine · COPPERPLATE at a flat 55px — the tolerance that goes BLIND (foil)',
      description: 'The deliberate FOIL of the accepting-radius ladder, shipped rather than quietly dropped because the failure is the finding. Same curve, same plant, same budget as the ramped copperplate preset — the ONLY difference is that the 55px accepting radius is applied from generation 0 instead of ramped into. MEASURED, 6 seeds × 100 generations: 94 ± 13px, against a 129.8px do-nothing floor and the hand-written planner\'s 27.3px — it closes 35% of that gap where the same curve with the tolerance switched OFF closes 62% (66.5 ± 2.1px). The diagnostic that says WHY, rather than just that it is worse: the tip is inside its own 55px accepting radius for only 30-43% of the loop (the original three seeds 43/32/43%, three fresh ones at the shipped start pose 36/30/32%), so the sharp closeness term is starved and selection leans on the weak 15% far term. That mechanism is stated where it was MEASURED, on the real generation-0 population of 40 genomes: at this 55px setting only 3.8-4.2% of a rollout\'s steps pay the sharp term at all and it carries just 19-20% of total reward, against 42% of steps and 76% of reward at the ramped preset\'s 200px start. But it is starvation, NOT a switch: 30-31 of those 40 genomes still collect SOME sharp reward, so "goes blind" describes the signal-to-noise, and any claim that the term pays nothing for most of the population would be false. Watch the fitness curve flatten by about generation 40 and then wander — 0 of 3 seeds in the head-to-head trio were still improving at generation 100, against 3 of 3 for the ramped arm. The full tightening curve on this curve, same config throughout: tolerance OFF 66.5 ± 2.1px, 80 → 83.5 ± 9.5, 55 → 94 ± 13, 40 → 95.6 ± 10.1. Compare the swash preset, where the SAME 80px setting is completely free. That contrast is the point of the family: the tolerance that is safe is NOT a fraction of the curve\'s size, it is whatever sits comfortably above the error that curve can actually reach. One measurement caveat that applies to every learned number in this family: re-running an identical seed in a different process order moved this config by ~10px (102.3 → 93.2), so per-cell differences below roughly 10-15px are NOT real. The training start pose is pinned to the measured protocol (6°, both sides), exactly as on the ramped preset this is the control for — on the app\'s 20°/one-sided slider defaults the foil measures 104.2/130.1px at 16-28% in-tolerance instead of 104.5/94.8px at 32-33%, i.e. it would look blinder than the tolerance alone makes it, and the pair would stop being a controlled comparison. The curve\'s PLACEMENT is pinned for the same reason (traceCenterY 257) — and this preset is where that pin was measured. Since 2026-08 the setup clamps a curve into the chain\'s settled reach band and copperplate at r140 sits 29px above its ceiling, so unpinned the app stages it at y 285.7. Run head to head, 10 paired seeds × 60 generations: pinned 105.4px, auto-placed 107.7px, 5 of 10 seeds better either way, t = +0.39 — and 0.82 vs 0.87 against each scene\'s own do-nothing floor (129.2 vs 124.1px). The placement is a NULL for the learner here even though the hand-written planner prefers the deeper stage (27.3 → 25.7px), which is why the pin is kept rather than the ladder re-run.',
      setupId: 'chain-trace',
      mode: 'cmaes',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['experimental', 'foil'],
      params: {
        popSize: 40, rollouts: 2, cmaesHidden: 10, cmaesSigma: 0.5,
        evalSeconds: 8, numSegments: 4, material: 'rigid',
        numActuatedJoints: 3, jointControlMode: 'servo', chainTelescope: true,
        curveId: 'copperplate', tracePeriod: 10, traceRadius: 140,
        traceAcceptRadius: 55,
        // Same measured start pose as the rest of the family (block comment
        // above). The ramp/flat pair only stays a controlled comparison if BOTH
        // halves pin it, so these three lines must match the ramp preset exactly.
        tiltDeg: 6, tiltDirection: 'both',
        traceCenterY: 257,
      },
      curriculum: { enabled: false },
    },
    // ---- Epicycle signer (Fourier arms) -------------------------------------
    // A DIFFERENT MACHINE, not a different controller. Everything above fights
    // the chain's trim-tab joints; this replaces the plant with the one the
    // maths actually asks for: N nested arms turning at constant harmonic rates.
    'epicycle-learned-rate': {
      label: 'Fourier arms · learn angular velocity control',
      description: 'Use the analytic Fourier motion as ground truth, then train a neural controller to reproduce it by choosing four arm speeds. The dashed lavender mechanism is the analytic teacher; the amber trail belongs to the learner. Arm lengths come from Fourier coefficients, but phases start at zero and the policy receives no analytic rate commands. One 160-generation CMA-ES checkpoint reduced mean error from 151 px at initialization to 22.5 px in frozen replays; the analytic four-arm reference is exact for this figure-eight. This is learned velocity control of a designed mechanism, with geometry held fixed.',
      setupId: 'epicycle', mode: 'cmaes', policyType: 'mlp', objectiveId: 'chain_trace', tags: ['experimental'],
      params: {popSize: 40, rollouts: 1, cmaesHidden: 6, cmaesSigma: 0.35, evalSeconds: 16, physicsDt: 1/60,
        curveId: 'figure8', traceRadius: 140, tracePeriod: 8, epiArms: 4, epiBasis: 'dft', epiDrive: 'rate', epiWarmPhase: false, epiTelescope: false},
      curriculum: {enabled: false}
    },
    'epicycle-analytic-signature': {
      label: "Fourier arms · analytic curve approximation",
      description: "Represent a sampled curve as a complex signal and turn its Fourier coefficients into rotating arms. Keeping the largest coefficients gives the least-squares truncation of that sampled signal. At radius 140, the current autograph measures 7.8 px mean pen error with 12 arms and 0.6 px with 24. Simple finite-harmonic curves can be represented exactly; general curves are approximated. The automatic basis uses an even extension for open strokes to avoid a jump at the loop boundary. This is analytic reconstruction, not neural learning or physical chain tracking.",
      setupId: 'epicycle',
      // The real mode, not a facade CMA-ES run: nothing is trained here, so the
      // mode must be the one that early-returns before the worker pool ever
      // sees a genome. (This preset previously declared mode 'cmaes', which made
      // the app go through the motions of evolving a policy that the analytic
      // drive ignores — a flat chart for the wrong reason.)
      mode: 'epicycle-analytic',
      policyType: 'mlp',
      objectiveId: 'chain_trace',
      tags: ['solved'],
      params: {
        popSize: 8, rollouts: 1, evalSeconds: 8,
        // autograph at its RECOMMENDED N. Picked off the measured curve: it is
        // the only shape in the table whose error is still visibly falling at
        // the arm counts a viewer can count on screen (38.5 → 19.2 → 11.0 → 7.8
        // → 0.6), so turning the dial SHOWS you the truncation working. circle
        // and figure8 are exact at 1 and 4 arms — a better headline, a worse
        // demo, because there is nothing left to watch improve.
        curveId: 'autograph', tracePeriod: 8, traceRadius: 140,
        // 12 = the measured "faithful" default for this curve (ink error 4.8px
        // mean, pointwise 7.8px). 6 is still recognizable (8.6px ink); drop to 4
        // or 2 to watch it degrade gracefully, raise to 24 for a pixel-exact
        // trace at 0.6px.
        epiArms: 12, epiBasis: 'auto', epiDrive: 'analytic',
      },
      curriculum: { enabled: false },
    },
    // Dodge with a PLANNER-GRADE learnable prior (#4): the obs carries 9
    // lookahead danger scores (one per candidate command), the same one-step
    // evaluation the receding-horizon planner computes — closing the documented
    // "the ceiling is lookahead, not learning" gap without full planning.
    'dodge-lookahead-cmaes': {
      label: 'Dodge — sep-CMA-ES + 9-way lookahead danger (planner-grade prior)',
      description: 'The answer to "can a LEARNED dodger approach the planner?": give the network the planner\'s own evaluation as INPUT. The topk-danger observation adds 9 lookahead features — for each candidate command (stay + 8 directions), the agent is projected forward 1.2s under that command with bullets ballistic, and the closest approach becomes a danger score. That is precisely the quantity the receding-horizon planner computes when it picks a move; here the policy just learns to steer toward low danger instead of having to INFER the future from raw bullet positions (the documented ceiling of reactive observations). Not blind — but not cheating either: every feature is computable from the visible bullet states. MEASURED (30-gen budget, 2 seeds): never worse than the reactive top-K baseline, +35% survival on one seed (13.6s vs 10.1s at spawn 3) — promising, amber until longer runs prove it compounds toward the planner\'s ceiling.',
      tags: ['experimental'],
      setupId: 'dodge',
      // sep-CMA-ES: the 45-input MLP is ~380 params — past full CMA-ES's ~300
      // Jacobi ceiling, where its per-gen eigendecomp degrades. Diagonal
      // covariance scales cleanly (measured: full CMA-ES flatlined here).
      mode: 'sep-cmaes',
      policyType: 'mlp',
      dodgeObservationMode: 'topk-danger',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 40, rollouts: 3, cmaesHidden: 8, cmaesSigma: 0.5, evalSeconds: 12,
        dodgeSpawnRate: 3.0, dodgeBulletSpeed: 220, dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8, dodgePattern: 'mixed',
      },
      curriculum: { enabled: false },
    },
    'dodge-radar-cmaes': {
      label: 'Dodge — sep-CMA-ES + ANGULAR DANGER RADAR (the planner-grade encoding)',
      description: 'The upgrade past the 9-way lookahead — an encoding built to match the reference PLANNER. Three confirmed weaknesses of top-K + 9-way danger are fixed at once: (1) the raw top-K list is blind to 60-70% of the field at high spawn (spawn 12 = ~21 bullets alive vs K=8) and wastes half its slots when sparse; (2) the 9 fixed compass probes CLAMP into walls with ZERO danger cost, so hugging a wall reads "safe" — the confirmed CORNER-STUCK cause (all 9 danger features read 0 next to a wall with no bullets); (3) no notion of urgency. The radar sweeps 16 angular SECTORS around the agent; each forward-projects a full commit in that direction over 1.2s against ALL bullets and reports [projected danger, time-to-threat, WALL-TRAP (how soon that heading jams a wall — measured before the clamp)], plus 4 globals (field density, cornered-ness, toward-center gradient) — 56 inputs, fixed size regardless of bullet count. The net just steers toward the safest open sector: the planner\'s per-direction evaluation, compressed into the observation. MEASURED at spawn 10 (the regime where top-K breaks): radar beats the 9-way lookahead by a clear margin in a 30-gen budget; a hand-coded controller on this encoding more than DOUBLES corner survival at the highest spawn (the exact reported failure). SETTLED BY A BUDGET SWEEP — and the headline is that this preset NEEDS PATIENCE. A matched-environment probe (spawn 10, identical bullet patterns for every contender, 24 evaluation rollouts, 2 seeds, scoring HITS TAKEN because no-die mode makes "survival" always the full rollout) tracked the LEARNING CURVE instead of one endpoint. Mean hits, lower is better: at 30 gens radar is the WORST of the three (10.3, vs top-K 8.7 and 9-way lookahead 8.7) — a short run actively misleads you. By 60 gens it has more than halved (4.9), then 3.9 at 100, 3.3 at 150 and 2.8 at 200 — and it is STILL falling when the sweep ends, with its best rollouts taking ZERO hits. Raw top-K meanwhile PLATEAUS at 7-8 across the entire 200-generation sweep and never improves no matter how long you run it. So the radar encoding ends up about 2.7× better than top-K, and the 9-way lookahead lands in between (5.3 at 200, also still improving). THE LESSON: the ceiling here is the REPRESENTATION, not the optimizer — raw bullet coordinates plateau early and stay there, while planner-grade features keep paying off, but only after the bigger net (56 inputs vs 36) has had time to train. Give this preset 100+ generations before judging it. Reference points from the same probe family: the zero-training hand-coded corner-wedge takes 16.3 hits, and the model-based planner is never hit at all.',
      tags: ['experimental'],
      setupId: 'dodge',
      // sep-CMA-ES: the 56-input MLP is past full CMA-ES's ~300 Jacobi ceiling
      // once hidden; diagonal covariance scales cleanly.
      mode: 'sep-cmaes',
      policyType: 'mlp',
      dodgeObservationMode: 'radar',
      objectiveId: 'dodge_survive',
      params: {
        popSize: 40, rollouts: 3, cmaesHidden: 10, cmaesSigma: 0.5, evalSeconds: 12,
        dodgeSpawnRate: 6.0, dodgeBulletSpeed: 220, dodgeBulletRadius: 6,
        dodgeBulletsPerWave: 8, dodgePattern: 'mixed',
      },
      curriculum: { enabled: false },
    },
    // ============================ TERRAIN TIER =============================
    // The app's first task with a DIFFERENT WORLD EVERY ROLLOUT and a held-out
    // test set. Every number in these three descriptions comes from the same
    // measurement campaign (2 rounds, ~1300 training runs, 6 independent
    // adversarial verifiers, scored on 128 held-out courses never seen in
    // training, sep-CMA-ES λ 24 / σ0 0.5 / 4 rollouts per evaluation). The
    // three are deliberately a SET: what works, the architecture that scores
    // better and still isn't worth it, and the geometry that is still open.
    'terrain-run': {
      label: "Terrain traversal · learned policy on a local grid",
      description: "A 401-parameter MLP reads a local solid/hazard grid plus agent state and chooses horizontal drive and jumping. A new course is generated each rollout; evaluation uses separate course seeds. This is a longer training study, not an instant saved-model demonstration. Historical 400-generation browser runs on seeds 1–4 scored 78.2–97.3 over the same 64 held-out courses, completing 40–62 of them. Those training budgets were not rerun in the September mechanics audit. Compare with the convolutional variant to examine the cost of a different architecture.",
      setupId: 'terrain-run',
      // sep-CMA-ES: 401 parameters is past full CMA-ES's ~300 Jacobi ceiling.
      mode: 'sep-cmaes',
      policyType: 'mlp',
      objectiveId: 'terrain_progress',
      tags: ['solved'],
      params: {
        popSize: 24,
        rollouts: 4,
        cmaesSigma: 0.5,
        // 198 -> 1 -> 50 -> 2 = 401 parameters. UNEQUAL layers, so this cannot
        // come from the cmaesHidden/cmaesLayers sliders.
        cmaesHiddenSizes: [1, 50],
        // The rung's physics constants and its 30 Hz control latch
        // (controlEvery = 2 steps) are both stated at a 1/60 s step.
        physicsDt: 1 / 60,
        evalSeconds: terrainRungSeconds('hard'),
        terrainDifficulty: 'hard',
        terrainObservationMode: 'patch',
      },
      curriculum: { enabled: false },
    },
    'terrain-run-cnn': {
      label: 'Terrain run — the CONV foil (better per parameter, decisively worse per second)',
      description: 'THE HONEST FOIL. Same task, same 198-input patch, same optimizer and the same budget as the dense preset above — only the policy class changes. A small conv net reads the patch as the 2 × 8 × 12 image it already is (4 filters, 5×5 kernels, 2×2 max-pool, 2 dense units): 416 parameters against the dense net\'s 401, so this is a MATCHED-PARAMETER comparison, not a bigger model. MEASURED: 98.5 mean / 98.7 median of 100.0, 0 of 24 runs below 90 — genuinely the better score — but it takes 1080 s where the dense MLP takes 94 s. Both halves of that are the result. Per PARAMETER convolution is slightly ahead: pooled over 7 matched conv-vs-dense pairs on a course set used for no selection, +2.21% of attainable max (t = 4.87, n = 24, CI [1.27, 3.14]), positive at generation 400 on all four rungs measured. Per SECOND it is decisively behind: 7-17× the wall-clock per generation, BEHIND every dense MLP at generations 25 and 50, and it loses to cheap restarts at every wall-clock budget on every rung — best-of-4 restarts of a 398-parameter LINEAR policy cost a quarter of ONE conv run and reach 0% failure. Do NOT read this as "convolution reads terrain better": the MECHANISM was NOT resolved. Weight sharing, locality and learned filters were each tested as their own control at n = 8, and every confidence interval contained the whole effect. ONE CAVEAT ON THE CLOCK, so the app does not appear to contradict its own numbers: the 1080 s / 94 s pair is from the measurement harness, where the dense policy runs as a flat matrix. This app decodes its dense MLP through the NEAT genome path instead, which slows the DENSE arm down and narrows the gap — measured here over 50-generation runs on 2 seeds, about 31 s dense against about 68 s conv, roughly 2.2×. The ordering is the same either way; only the size of the penalty changes. Amber because a real +2% that costs an order of magnitude of wall-clock does not pay for itself — NOT because it fails.',
      setupId: 'terrain-run',
      mode: 'sep-cmaes',
      policyType: 'cnn-grid',
      objectiveId: 'terrain_progress',
      tags: ['experimental'],
      params: {
        popSize: 24,
        rollouts: 4,
        cmaesSigma: 0.5,
        physicsDt: 1 / 60,
        evalSeconds: terrainRungSeconds('hard'),
        terrainDifficulty: 'hard',
        terrainObservationMode: 'patch',
        // Grid/channel/proprio dimensions come from the SETUP (see
        // TERRAIN_PATCH_SHAPE); only the conv hyper-parameters are stated
        // here. F4 / k5 / pool 2×2 / dense 2 => 416 parameters.
        cnnGridConfig: Object.assign({}, TERRAIN_PATCH_SHAPE, {
          numFilters: 4,
          filterSize: 5,
          poolSize: 2,
          denseHidden: 2,
          numOutputs: 2,
        }),
      },
      curriculum: { enabled: false },
    },
    'terrain-run-crucible': {
      label: 'Terrain run — CRUCIBLE geometry + the combined encoding (frontier)',
      description: 'The frontier geometry, and the one place the COMBINED encoding earns its keep. crucible makes every pit the 4-tile one, leaves 2-3 flat tiles between features and runs 250 tiles over 35 s — 36 obstacles per course (counted on this build: mean 36.4, median 36 over the 128 held-out seeds), attainable max 266.0. The policy reads the hand summary AND the raw patch concatenated (242 inputs: 6 proprio + 44 summary + 192 occupancy) through a dense MLP 242→2→140→2, 1188 parameters, sep-CMA-ES λ 24 / σ0 0.5 / 4 rollouts per evaluation. MEASURED: 228.3 mean / 226.6 median, 72% of held-out courses completed, 0% of runs failing, 442 s. THE ADVANTAGE IS SPECIFIC TO THIS GEOMETRY, and that is the interesting part: the combined encoding wins by +41.6 here (t = 10.63, 24 of 24 seeds) and is neutral-to-negative on the easier hard geometry and on gauntlet — so "concatenate everything" is NOT a general improvement, it is a fix for one regime, and quoting it as a general result would be wrong. Reference points on this same geometry: the null policy scores 0.000000; a patch-only LINEAR policy reaches 190.9 mean and completes 46%; the conv arms 186.7 (43%) and 191.0 (45%); and a HINDSIGHT reflex oracle allowed to pick the best of 294 open-loop configs PER COURSE manages only 76.6 and finishes 2% of courses. One more honest note: a 445-parameter version of the same combined encoding measured 231.2 mean / 78% completed, but on only 12 seeds, so this preset ships the arm with the larger seed count. Amber, plainly: 28% of courses are still unfinished.',
      setupId: 'terrain-run',
      mode: 'sep-cmaes',
      policyType: 'mlp',
      objectiveId: 'terrain_progress',
      tags: ['experimental'],
      params: {
        popSize: 24,
        rollouts: 4,
        cmaesSigma: 0.5,
        // 242 -> 2 -> 140 -> 2 = 1188 parameters.
        cmaesHiddenSizes: [2, 140],
        physicsDt: 1 / 60,
        evalSeconds: terrainRungSeconds('crucible'),
        terrainDifficulty: 'crucible',
        terrainObservationMode: 'both',
      },
      curriculum: { enabled: false },
    },
  };

  // Apply a preset. Sets each UI element + curriculum spec in dependency
  // order, dispatches the events that the per-element listeners need to
  // hear (setup change cascades into per-setup defaults; policy change
  // auto-flips obs mode; etc.) and does ONE final trainer rebuild at the
  // end. The intermediate event-triggered rebuilds are tolerated (a few
  // per preset load is fine for a one-shot user action).
  RUN_PRESETS['double-neat-angular-90'] = {
    ...RUN_PRESETS['double-neat-curriculum-90'],
    label:'Double swing-up · signed angular-rate inputs',
    description:'A controlled observation experiment: replace the two horizontal-velocity channels with signed angular rates. Horizontal velocity loses rotation direction when a link reaches 90°; angular rate preserves it. This fixes the missing information while keeping ten inputs and the same plant. Four-minute NEAT and CMA-ES runs have not yet produced a reliable full-gravity 90° checkpoint. Compare learning behavior with the legacy encoding; a richer observation alone does not guarantee convergence.',
    params:{...RUN_PRESETS['double-neat-curriculum-90'].params,pendulumObservationMode:'angular'}
  };

  // Historical signing studies retain their measured placement. The current
  // planner and newly packaged training routes center the drawing on the rail.
  for (const preset of Object.values(RUN_PRESETS)) if (preset.setupId === 'chain-trace' && preset.mode !== 'signing-planner') {
    preset.params = {traceCenterMode:'initial-tip', ...preset.params};
  }

  // Frozen policies also have a catalog entry, so method, scene and scope stay
  // visible after loading. Their training controls always start a fresh run.
  function dodgeScorerPreset(record) {
    BF.dodgeTemporal.validate(record);
    return {label:'Dodge · learned scoring over physical lookahead',description:record.summary || 'Frozen CMA-ES scoring over nine physical forecasts.',
      setupId:'dodge',mode:'dodge-scorer',policyType:'mlp',dodgeObservationMode:'topk',objectiveId:'dodge_survive',scorerRecord:record,
      params:{popSize:8,rollouts:1,evalSeconds:20,dodgeNoDie:true,dodgeNoReset:true,...record.worldParams,physicsDt:1/120},curriculum:{enabled:false}};
  }
  for (const model of (BF.showcaseModels || [])) {
    if (!model.presetId || RUN_PRESETS[model.presetId]) continue;
    RUN_PRESETS[model.presetId] = {
      ...(model.record?.kind==='bf-dodge-lookahead-v1' ? dodgeScorerPreset(model.record) : BF.championIO.presetOf(model.record)),
      label: model.label, description: model.summary,
      tags: model.group === 'proof-of-concept' || model.experimental ? ['experimental'] : []
    };
    for (const training of (model.trainingPresets || [])) {
      const base = BF.championIO.presetOf(model.record);
      RUN_PRESETS[training.id] = {...base, ...training, params:{...base.params,...training.params},
        curriculum:training.curriculum || {enabled:false}};
    }
  }

  RUN_PRESETS['single-ppo-learn'] = {
    label:'Single pendulum · PPO · actor–critic backpropagation',setupId:'single',mode:'ppo',policyType:'mlp',objectiveId:'pendulum_both_above',
    description:'A fresh model-free PPO experiment on the actual direct-acceleration plant. A tanh actor and value network learn through backpropagation and Adam. Eight independent environments supply experience; no teacher or simulator derivatives are required. Start with local recovery and inspect policy loss, value loss, exploration and rail failures. A training experiment, not a pretrained success claim.',
    params:{gravity:850,cartAccel:8000,cartDrag:8,cartControlMode:'force',damping:.005,uprightAssist:0,jointDamping:0,
      tiltDeg:10,tiltSpreadDeg:5,tiltDirection:'both',singleObservationMode:'full',popSize:16,evalSeconds:12,useDisturb:false},curriculum:{enabled:false}
  };
  BF.presetNavigation.trainingGroups[0].ids.push('single-ppo-learn');

  // Build #neatHiddenActivation's <option>s from BF.neat.ACT_META.
  // Lists the standard tier always; the experimental tier only when
  // #showExperimentalActs is checked; PLUS the currently-selected value
  // even if experimental (so a preset/programmatic experimental
  // selection is never silently dropped). Preserves the selection.
  function populateActivationDropdown() {
    const sel = dom.neatHiddenActivation;
    if (!sel || !BF.neat || !BF.neat.ACT_META) return;
    const showExp = !!(dom.showExperimentalActs && dom.showExperimentalActs.checked);
    const want = String(sel.value || 'tanh').toLowerCase();
    const opts = BF.neat.ACT_META.filter(m =>
      m.tier === 'standard' || showExp || m.name === want);
    sel.innerHTML = '';
    for (const m of opts) {
      const o = document.createElement('option');
      o.value = m.name;
      o.textContent = m.name + (m.tier === 'experimental' ? ' (exp)' : '');
      sel.appendChild(o);
    }
    sel.value = opts.some(m => m.name === want) ? want
      : (opts.some(m => m.name === 'tanh') ? 'tanh'
      : (opts[0] ? opts[0].name : ''));
  }

  // ---- Hermetic preset loads ----
  // Presets must land on a CLEAN baseline no matter what was loaded before.
  // Historically loadRunPreset only wrote the DOM controls a preset's params
  // explicitly listed, so anything a PREVIOUS preset toggled leaked forward
  // (holeCenterJitterOn stayed checked after putt-moving-hole → every later
  // golf/putt preset silently trained against a ±120px jittering hole and
  // "stopped working"; chainTelescope/dodge flags leak the same way). The
  // fix: before applying a preset, reset every control ANY preset can set
  // back to its HTML default. Defaults are read from the DOM's *default*
  // properties (defaultChecked/defaultValue/defaultSelected), which reflect
  // the HTML source regardless of later mutations — immune to boot order,
  // saved-run restores, and user fiddling.
  function resetPresetParamsToDefaults() {
    app.playbackPhysicsHz = null;
    app.importedPolicyConfig = null;
    if (!app._presetParamDefaults) {
      // Union of every params key across all presets that maps to a DOM
      // control, plus the chain-prefixed controls (their preset keys differ
      // from their DOM ids) and the dodge observation-mode select (a preset
      // top-level field applied outside the params loop).
      const keys = new Set();
      for (const pid in RUN_PRESETS) {
        const pp = RUN_PRESETS[pid].params || {};
        for (const k in pp) if (dom[k]) keys.add(k);
      }
      for (const extra of ['dodgeObservationMode', 'chainNumSegments', 'chainMaterial',
                           'chainCurve', 'chainNumActuated', 'chainJointMode', 'chainTelescope']) {
        if (dom[extra] || document.getElementById(extra)) keys.add(extra);
      }
      // Every GENERATED curriculum-knob slider, whether or not any preset
      // currently names it. The union above only reaches keys some preset
      // mentions, so a knob nobody presets — traceCenterY, the chain-trace
      // placement override, is one — survived a preset load and silently
      // re-placed the next preset's curve. Sourcing the list from
      // _curriculumKnobKeys means a knob added to CURRICULUM_KNOBS later is
      // hermetic on arrival instead of one preset-switch bug later.
      for (const k of (app._curriculumKnobKeys || [])) if (dom[k]) keys.add(k);
      app._presetParamDefaults = [];
      for (const k of keys) {
        const el = dom[k] || document.getElementById(k);
        if (!el || typeof el.type !== 'string' && el.tagName !== 'SELECT') continue;
        if (el.type === 'checkbox') {
          app._presetParamDefaults.push({ el, kind: 'checkbox', value: el.defaultChecked });
        } else if (el.tagName === 'SELECT') {
          let dv = null;
          for (const o of el.options) if (o.defaultSelected) { dv = o.value; break; }
          if (dv == null && el.options.length) dv = el.options[0].value;
          app._presetParamDefaults.push({ el, kind: 'select', value: dv });
        } else {
          app._presetParamDefaults.push({ el, kind: 'value', value: el.defaultValue });
        }
      }
    }
    for (const d of app._presetParamDefaults) {
      if (d.kind === 'checkbox') d.el.checked = d.value;
      else d.el.value = d.value;
      if (d.el._fmt && d.el._valueEl) d.el._valueEl.textContent = d.el._fmt(d.el.value);
    }
    // Row-visibility handlers hang off 'change'; re-fire the ones with
    // dependent rows so hidden/shown state matches the reset values.
    if (dom.holeCenterJitterOn && dom.holeCenterJitterMagRow) {
      dom.holeCenterJitterMagRow.style.display = dom.holeCenterJitterOn.checked ? '' : 'none';
    }
    // NON-DOM preset params get the same clean baseline. The loop above only
    // reaches params that map to a control; anything stashed on `app` would
    // otherwise survive a preset switch (exactly the leak this function
    // exists to kill, one level up). loadRunPreset re-stashes immediately
    // after calling us, so clearing here is always safe.
    app.cnnGridConfigOverride = null;
    app.cmaesHiddenSizesOverride = null;
    app.physicsDtOverride = null;
    app.pendulumInitialStateOverride = null;
    app.pendulumInitialStateSpreadOverride = null;
    app.terrainOverride = null;
    app.pendulumObservationMode = 'legacy';
    app.presetOverrideSetupId = null;
  }

  // The four stashes above are SETUP-SCOPED: physicsDt is "the step this
  // setup's constants were measured at", cmaesHiddenSizes and cnnGridConfig
  // are genome/observation SHAPES sized by one setup's observationCount, and
  // terrain* is read by one setup only. They are cleared on preset LOAD, but
  // changing the setup dropdown by hand never loads a preset — so without this
  // gate they survived onto whatever setup the user switched to next. Measured
  // before it: load 'terrain-run', pick "Single pendulum" in the setup
  // dropdown, and the pendulum trainer came up with physicsDt 1/60 (every
  // pendulum/dodge/chain constant in this app is tuned at 1/120) and
  // cmaesHiddenSizes [1, 50], which silently overrides the hidden-layer
  // sliders for the rest of the session; load 'terrain-run-cnn' and pick
  // "Dodge" and it came up as a cnn-grid policy reading dodge's 260-float
  // observation through terrain's 12x8x2 patch config.
  //
  // Gating at READ time rather than clearing on setup-change keeps a
  // round trip lossless (switch away and back and the preset's shape is
  // intact) and cannot be tripped by loadRunPreset's own setup-change
  // dispatch, which fires between the stash and the first rebuild.
  function presetOverridesApply() {
    if (!app.presetOverrideSetupId) return false;
    const cur = dom.setupSelect ? dom.setupSelect.value : null;
    return cur === app.presetOverrideSetupId;
  }

  // Harvest a preset's non-DOM terrain knobs. Matching by PREFIX rather than
  // by an enumerated list means a terrain* param added to the setup later is
  // covered here automatically — the enumerated-list version of this is
  // precisely the kind of thing that goes stale and silently drops a knob.
  function terrainOverrideFromPreset(params) {
    if (!params) return null;
    let out = null;
    for (const k in params) {
      if (/^terrain[A-Z]/.test(k) && params[k] != null) {
        if (!out) out = {};
        out[k] = params[k];
      }
    }
    return out;
  }

  function loadRunPreset(presetId) {
    const p = RUN_PRESETS[presetId];
    if (!p) return;
    app.loadingPreset = true;
    try {
    app.pendulumReplayContext = null;
    app.loadedShowcaseModelId = null;
    app.dodgeScorerRecord = p.scorerRecord || null;
    if (p.mode === 'dodge-scorer') stopCompareTrainer();
    app.loadedPolicyGenome = null;
    app.replayCriteria = p.params && p.params.replayHoldSeconds > 0
      ? {replayHoldSeconds:p.params.replayHoldSeconds,replayAngleDeg:p.params.replayAngleDeg || 15,
          replayRequireNoRail:p.params.replayRequireNoRail !== false} : null;
    // Land on a clean baseline first — see resetPresetParamsToDefaults.
    resetPresetParamsToDefaults();
    app.explicitPresetParamKeys = new Set(Object.keys(p.params || {}));
    app.pendulumRailHalfWidthOverride = p.params?.pendulumRailHalfWidth;
    app.pendulumInitialStateOverride = p.params?.pendulumInitialState || null;
    app.pendulumInitialStateSpreadOverride = p.params?.pendulumInitialStateSpread || null;
    app.importedPolicyConfig = p.importedPolicyConfig
      ? { ...p.importedPolicyConfig, setupId: p.setupId } : null;
    // Preset params with no DOM element are dropped by the apply loop
    // below (it does `if (!dom[key]) continue`). curriculumNoForceAdvance
    // has no slider/checkbox, so stash it on app (same pattern as
    // cnnMultiscaleConfigOverride) and surface it in readParams().
    // Recomputed every preset load: true for presets that set it, false
    // otherwise -- so switching presets correctly resets it.
    app.curriculumNoForceAdvanceOverride = !!(p.params && p.params.curriculumNoForceAdvance === true);
    // tracePeriod/traceRadius have NO DOM controls, and readParams used to
    // HARDCODE 4/60 — so every chain-trace preset silently trained AND
    // displayed at radius 60 / period 4 no matter what it declared (the
    // "curve is too small" mystery: the r=140 sweep winner never actually
    // reached the app). Stash the preset's values (recomputed every load so
    // switching presets resets them — same pattern as the CNN config stash).
    app.chainTraceParamsOverride = p.params
      ? { tracePeriod: p.params.tracePeriod, traceRadius: p.params.traceRadius,
          traceCenterX: p.params.traceCenterX, traceCenterMode:p.params.traceCenterMode || 'rail-midpoint' }
      : null;
    // Rigid swing-up control-rate smoothness weight (no DOM control): stashed
    // from the preset so diffsimOptsFromUI can hand it to the trajopt. The
    // triple sets it (keeps its force authority + smooths); recomputed each
    // load so switching away resets to 0.
    app.diffsimCtrlRateW = (p.params && p.params.ctrlRateW != null) ? p.params.ctrlRateW : 0;
    // Signing PAINT/COVERAGE mode toggle (no DOM control): a chain-trace built
    // with chainPaint=true freezes the moving cursor and grades band coverage
    // (chain_paint objective). Recomputed every load so switching presets
    // resets it — same stash pattern as curriculumNoForceAdvanceOverride.
    app.chainPaintOverride = !!(p.params && p.params.chainPaint === true);
    // Signing STROKE mode toggle (no DOM control): a chain-trace built with
    // chainStroke=true freezes the cursor like paint mode, but bookkeeps
    // coverage as pen-down EPISODES and grades with the chain_stroke objective
    // ("draw it in as few strokes as possible"). Same stash pattern; recomputed
    // every load so switching presets resets it. strokeLiftRatio is the
    // hysteresis knob (pen-UP radius ÷ band half-width).
    app.chainStrokeOverride = !!(p.params && p.params.chainStroke === true);
    app.strokeLiftRatioOverride = (p.params && p.params.strokeLiftRatio != null)
      ? p.params.strokeLiftRatio : null;
    // Signing IN-ORDER mode toggle (no DOM control): a chain-trace built with
    // chainOrdered=true freezes the cursor like paint/stroke, but grades the
    // LONGEST UNBROKEN in-order run along the curve (chain_trace_ordered).
    // Same stash pattern; recomputed every load so switching presets resets it.
    app.chainOrderedOverride = !!(p.params && p.params.chainOrdered === true);
    app.orderedRequiredFracOverride = (p.params && p.params.orderedRequiredFrac != null)
      ? p.params.orderedRequiredFrac : null;
    // Signing LOOKAHEAD observation toggle (no DOM control): +4 anticipation
    // inputs (Δtip→cursor at t+0.3s and t+0.8s) — measured ~10% tip-error cut
    // on both shapes. This is an OBSERVATION-SHAPE param (genome dimension!):
    // it must reach the setObservationShape seam below AND eval_worker's
    // parity re-application, or workers silently truncate the extra inputs.
    app.chainTraceLookaheadOverride = !!(p.params && p.params.chainTraceLookahead === true);
    app.pendulumObservationMode = p.params && p.params.pendulumObservationMode === 'angular' ? 'angular' : 'legacy';
    // Epicycle signer knobs (no DOM controls). epiArms is an OBSERVATION- AND
    // ACTION-dimension param, so like chainTraceLookahead it must reach the
    // shape seam (syncSetupObservationCounts) before the trainer is built.
    // Recomputed every load so switching presets resets it.
    app.epicycleOverride = (p.params && (p.params.epiArms != null || p.params.epiBasis != null
        || p.params.epiDrive != null || p.params.epiTelescope != null || p.params.epiWarmPhase != null))
      ? {
          epiArms: p.params.epiArms, epiBasis: p.params.epiBasis,
          epiDrive: p.params.epiDrive, epiTelescope: !!p.params.epiTelescope,
          epiWarmPhase: !!p.params.epiWarmPhase,
        }
      : null;
    // terrain-run knobs (no DOM controls). terrainObservationMode is an
    // OBSERVATION-WIDTH param — 50 / 198 / 242 inputs — so, exactly like
    // chainTraceLookahead and epiArms above, it must be stashed BEFORE the
    // setup/mode/policy dispatches below, because those rebuild the trainer
    // and the trainer sizes its genomes from setup.observationCount, which
    // syncSetupObservationCounts sets from this stash.
    app.terrainOverride = terrainOverrideFromPreset(p.params);
    // Which setup these non-DOM stashes belong to (see presetOverridesApply).
    // Set BEFORE the dispatch cascade for the same reason the stashes are.
    app.presetOverrideSetupId = p.setupId
      || (dom.setupSelect ? dom.setupSelect.value : null);
    // Physics timestep + explicit MLP layer widths + grid-CNN dimensions.
    // Same stash pattern, same recompute-every-load reset semantics; each is
    // a GENOME- or WORLD-shaping value, so all three must also be final
    // before the rebuild cascade starts.
    app.physicsDtOverride = (p.params && p.params.physicsDt > 0) ? p.params.physicsDt : null;
    app.cmaesHiddenSizesOverride = (p.params && Array.isArray(p.params.cmaesHiddenSizes))
      ? p.params.cmaesHiddenSizes.slice() : null;
    app.cnnGridConfigOverride = (p.params && p.params.cnnGridConfig) || null;
    // 1. Setup -- triggers the existing setup-change cascade (applies
    //    per-setup ball/golf defaults, picks default objective, rebuilds
    //    trainer). Fired UNCONDITIONALLY (even when the setup id is
    //    unchanged) so same-setup preset switches also re-land on the
    //    per-setup defaults — part of the hermetic-load guarantee.
    if (dom.setupSelect && p.setupId) {
      dom.setupSelect.value = p.setupId;
      dom.setupSelect.dispatchEvent(new Event('change'));
    }
    // 2. Algorithm mode.
    if (dom.modeSelect && p.mode && dom.modeSelect.value !== p.mode) {
      dom.modeSelect.value = p.mode;
      dom.modeSelect.dispatchEvent(new Event('change'));
    }
    // 3. Policy type. The policy-type listener auto-flips dodgeObservationMode
    //    when picking cnn-grid / cnn-multiscale -- which is what we want
    //    here, so no special handling.
    if (dom.policyTypeSelect && p.policyType && dom.policyTypeSelect.value !== p.policyType) {
      dom.policyTypeSelect.value = p.policyType;
      dom.policyTypeSelect.dispatchEvent(new Event('change'));
    }
    // 4. Dodge observation mode (explicit, after policy in case the
    //    policy didn't auto-flip it).
    if (dom.dodgeObservationMode && p.dodgeObservationMode
        && dom.dodgeObservationMode.value !== p.dodgeObservationMode) {
      dom.dodgeObservationMode.value = p.dodgeObservationMode;
      dom.dodgeObservationMode.dispatchEvent(new Event('change'));
    }
    // 5. Objective (override any default the setup change picked).
    if (dom.objectiveSelect && p.objectiveId && dom.objectiveSelect.value !== p.objectiveId) {
      dom.objectiveSelect.value = p.objectiveId;
      dom.objectiveSelect.dispatchEvent(new Event('change'));
    }
    // Keep the preset's objective visible AND selected even if it's outside
    // the new setup's relevant list (e.g. the double-pendulum presets that
    // use pendulum_neat_score). autoDefault=false → resolveSelection must NOT
    // clobber the just-set preset objective to the setup default.
    refreshObjectiveOptions(false);
    // 6. Slider params. Set the value + update the value-label directly
    //    (no event dispatch -- avoids triggering N extra rebuilds).
    //
    // Two flavors of preset param:
    //   - Most params map to a slider/checkbox DOM element by name and
    //     are applied via the `el.value = String(value)` loop below.
    //   - A handful of params have no DOM (e.g. cnnMultiscaleConfig is
    //     an object describing CNN dimensions for the WASM-enabled
    //     high-res preset). Those are stashed on app for syncTrainerParams
    //     / readParams to pick up and propagate to the trainer.
    if (p.params) {
      // Stash non-DOM params before the loop (the loop skips them via
      // `if (!el) continue`). Clearing first ensures switching back to
      // a low-res preset reverts to the default cnn-multiscale config.
      app.cnnMultiscaleConfigOverride = p.params.cnnMultiscaleConfig || null;
      // Default presets to one-sided tilt (left) unless they explicitly
      // pick another direction. Two-sided training is much harder for
      // fixed-topology algos (the policy class must satisfy mirror
      // antisymmetry constraints); starting all presets one-sided
      // gives every algorithm a fair shot at solving the task. Presets
      // that genuinely want both sides can set tiltDirection: 'both'.
      if (dom.tiltDirection && p.params.tiltDirection == null) {
        dom.tiltDirection.value = 'left';
      }
      for (const [key, value] of Object.entries(p.params)) {
        const el = dom[key];
        if (!el) continue;
        // Checkboxes use .checked, not .value. The bool branch lets
        // presets toggle things like dodgeNoDie / dodgeLifespanMode
        // without each preset having to know about it.
        if (el.type === 'checkbox' && typeof value === 'boolean') {
          el.checked = value;
          continue;
        }
        el.value = String(value);
        if (el._fmt && el._valueEl) {
          el._valueEl.textContent = el._fmt(el.value);
        }
      }
      // Tilt slider special-case: refreshTiltUI highlights the matching
      // preset chip (5°/20°/60°/180°) and writes the value label with a
      // "°" suffix. Just-setting the .value doesn't trigger that path
      // because it's hooked off 'input' not just a bindRange formatter.
      if (p.params.tiltDeg != null && typeof refreshTiltUI === 'function') {
        refreshTiltUI(parseFloat(dom.tiltDeg.value));
      }
      // Chain params use prefixed dom ids (chainNumSegments / chainMaterial /
      // chainCurve / chainNumActuated / chainJointMode) whose names don't match
      // their trainer-param keys (numSegments / material / curveId /
      // numActuatedJoints / jointControlMode), so the generic dom[key] loop above
      // skips them (if (!el) continue). Push them explicitly so the UI controls
      // AND the setObservationShape/setActionShape seam (which read these
      // controls) reflect the preset. Order matters: set the segment count first,
      // re-derive the actuated-joints max, THEN set the actuated value so it
      // isn't clamped away. Step 8's rebuildTrainerFromUI then runs the seam.
      if (dom.chainNumSegments && p.params.numSegments != null) dom.chainNumSegments.value = String(p.params.numSegments);
      if (dom.chainMaterial && p.params.material != null) dom.chainMaterial.value = String(p.params.material);
      if (dom.chainCurve && p.params.curveId != null) dom.chainCurve.value = String(p.params.curveId);
      if (typeof syncChainActuatedMax === 'function') syncChainActuatedMax();
      if (dom.chainNumActuated && p.params.numActuatedJoints != null) dom.chainNumActuated.value = String(p.params.numActuatedJoints);
      if (dom.chainTelescope && p.params.chainTelescope != null) dom.chainTelescope.checked = !!p.params.chainTelescope;
      if (dom.chainJointMode && p.params.jointControlMode != null) dom.chainJointMode.value = String(p.params.jointControlMode);
    }
    refreshDodgeNoDieUI();
    // Setup-conditional row visibility depends on values the param loop just
    // wrote (it sets .value without dispatching 'change', so nothing re-ran).
    // The setup-change cascade in step 1 fired BEFORE those writes, so without
    // this the dropout-period row is shown/hidden per the PREVIOUS preset's
    // observation mode.
    if (typeof refreshBallUI === 'function') refreshBallUI();
    // 7. Curriculum. Toggle + scalars + specs replacement. ALWAYS reset first:
    // switching to a preset WITHOUT a curriculum must CLEAR the previous one's
    // toggle + specs. Otherwise the stale curriculum persists and breaks the new
    // mode — it ramps a paramKey the new setup/mode may not even have (the bug
    // the user hit switching between presets).
    {
      const cur = p.curriculum || null;
      const wantOn = !!(cur && cur.enabled);
      if (dom.curriculumOn && dom.curriculumOn.checked !== wantOn) {
        dom.curriculumOn.checked = wantOn;
        dom.curriculumOn.dispatchEvent(new Event('change'));
      }
      if (cur) {
        if (dom.curriculumConsec && cur.consecRequired != null) {
          dom.curriculumConsec.value = String(cur.consecRequired);
          if (dom.curriculumConsec._fmt && dom.curriculumConsec._valueEl) {
            dom.curriculumConsec._valueEl.textContent = dom.curriculumConsec._fmt(dom.curriculumConsec.value);
          }
        }
        if (dom.curriculumMaxLevel && cur.maxLevel != null) {
          dom.curriculumMaxLevel.value = String(cur.maxLevel);
          if (dom.curriculumMaxLevel._fmt && dom.curriculumMaxLevel._valueEl) {
            dom.curriculumMaxLevel._valueEl.textContent = dom.curriculumMaxLevel._fmt(dom.curriculumMaxLevel.value);
          }
        }
        // thresholdFrac: preset value seeds the slider; the user can then override
        // it live (the slider drives curriculumThresholdFrac via readParams).
        if (dom.curriculumThreshold && cur.thresholdFrac != null) {
          dom.curriculumThreshold.value = String(cur.thresholdFrac);
          if (dom.curriculumThreshold._fmt && dom.curriculumThreshold._valueEl) {
            dom.curriculumThreshold._valueEl.textContent = dom.curriculumThreshold._fmt(dom.curriculumThreshold.value);
          }
        }
      }
      // ALWAYS replace the spec list (empty when the new preset has none) so a
      // previous preset's ramp specs can't linger.
      if (!app.curriculumSpecs) app.curriculumSpecs = [];
      app.curriculumSpecs.length = 0;
      if (cur && Array.isArray(cur.specs)) {
        for (const spec of cur.specs) app.curriculumSpecs.push(Object.assign({}, spec));
      }
      if (typeof renderCurriculumSpecs === 'function') renderCurriculumSpecs();
      if (typeof refreshAllSliderOverlays === 'function') refreshAllSliderOverlays();
      // Resetting preset controls can already have changed the checkbox, so
      // its change listener is not guaranteed to run for a disabled preset.
      refreshCurriculumUI();
      refreshCurriculumTopbarBtn();
    }
    // 8. Final sync + trainer rebuild.
    syncTrainerParams();
    // The preset's param->dom apply loop set neatHiddenActivation.value;
    // rebuild the <option> list so that value (incl. an experimental
    // one chosen by a preset) is materialized + selected BEFORE the
    // trainer is built from the DOM -- otherwise an experimental preset
    // value would be silently dropped to the fallback.
    populateActivationDropdown();
    if (typeof rebuildTrainerFromUI === 'function') rebuildTrainerFromUI();
    // Reflect the loaded preset in the dropdown's selected value.
    if (dom.runPresetSelect) dom.runPresetSelect.value = presetId;
    syncShowcaseSelector(presetId);
    renderPresetTags(presetId);
    // Refresh the cart-accel feasibility hint. The hint is normally
    // recomputed by the slider's `input` event handler, but preset
    // application sets .value directly (no events fire on purpose --
    // see markPresetCustom triggers above) so the hint goes stale.
    // Without this call the user sees the previous setup's
    // recommendation even though the actual accel value has just
    // moved to the preset's choice.
    updateCartAccelHint();
    // Diffsim: the run was created at the mode-change (step 2) with the
    // PRE-preset DOM state; the param/spec applies above set .value without
    // dispatching events, so nothing rebuilt the run. Recreate it now from the
    // final DOM + curriculum specs so the preset's gravity/tilt/curriculum
    // actually drive the engine.
    app.loadingPreset = false;
    if (typeof isDiffsimMode === 'function' && isDiffsimMode()
        && typeof refreshDiffsimRunIfActive === 'function') {
      refreshDiffsimRunIfActive();
    }
    // Dodge planner: same ordering issue — rebuild so the display world picks
    // up the preset's spawn rate / pattern and the planner policy reinstalls.
    if (typeof isDodgePlannerMode === 'function' && isDodgePlannerMode()) {
      rebuildTrainerFromUI();
    }
    // Rebuild the live planner against the final scene. Measuring a full pair
    // of headless episodes here blocked interaction despite doing no learning.
    if (typeof isSigningPlannerMode === 'function' && isSigningPlannerMode()) {
      rebuildTrainerFromUI();
    }
    // Epicycle analytic: the SAME ordering issue, and here it is the ARM COUNT
    // that arrives late. Step 2 dispatched the modeSelect 'change' →
    // enterEpicycleAnalyticMode() ran before app.epicycleOverride was consumed
    // by readParams, so it built (and measured) the fallback arm count from
    // curve_fourier's per-curve recommendation instead of the preset's epiArms.
    // Rebuilding here re-runs syncSetupObservationCounts with the final epiArms,
    // which is what actually re-sizes the setup singleton — so this is the arm
    // -count control path, not just a cosmetic re-measure.
    if (typeof isEpicycleAnalyticMode === 'function' && isEpicycleAnalyticMode()) {
      rebuildTrainerFromUI();
      stepEpicycleAnalyticGeneration();
    }
    } finally { app.loadingPreset = false; }
  }

  // Build the trainer-params object that a given preset would produce.
  // Mirrors loadRunPreset's logic but writes to a plain object instead
  // of mutating UI -- used to construct app.trainerB without touching
  // the user's primary-trainer UI state.
  function buildPresetParams(preset) {
    // Snapshot the user's CURRENT primary-trainer params as a baseline
    // (so all the per-knob defaults the user has on screen carry into
    // B's config). Then overlay the preset's explicit fields.
    const baseParams = readParams().train;
    const p = preset;
    // Setup + policy + obs + objective come from the preset directly.
    if (p.setupId)       baseParams.setupId = p.setupId;
    if (p.mode)          baseParams.mode = p.mode;
    if (p.policyType)    baseParams.policyType = p.policyType;
    if (p.dodgeObservationMode) baseParams.dodgeObservationMode = p.dodgeObservationMode;
    if (p.objectiveId)   baseParams.objectiveId = p.objectiveId;
    // Per-knob slider overrides.
    if (p.params) {
      for (const [key, value] of Object.entries(p.params)) {
        // popSize / rollouts / etc. live under specific names in trainer
        // params. The bindRange formatter writes them via syncTrainerParams,
        // but we're bypassing that path; map the few common ones here.
        const mapped = (key === 'popSize')   ? 'populationSize' :
                       (key === 'rollouts')  ? 'rolloutsPerAgent' :
                       (key === 'tiltDeg')   ? 'startTiltDeg' :
                       key;
        baseParams[mapped] = value;
      }
    }
    // Curriculum.
    if (p.curriculum) {
      baseParams.curriculumEnabled = !!p.curriculum.enabled;
      if (p.curriculum.consecRequired != null) baseParams.curriculumConsecRequired = p.curriculum.consecRequired;
      if (p.curriculum.maxLevel != null)       baseParams.curriculumMaxLevel = p.curriculum.maxLevel;
      if (p.curriculum.thresholdFrac != null)  baseParams.curriculumThresholdFrac = p.curriculum.thresholdFrac;
      baseParams.curriculumSpecs = (p.curriculum.specs || []).map(s => Object.assign({}, s));
    }
    return baseParams;
  }

  // Start a comparison trainer with the named preset. Tears down any
  // existing trainerB first. The primary trainer is untouched -- B is
  // fully independent, with its own population / history / curriculum
  // / bestEver. Wall-clock start times are captured for both trainers
  // so the status display can report gens/sec for each.
  function startCompareTrainer(presetId) {
    const preset = RUN_PRESETS[presetId];
    if (!preset || preset.mode === 'dodge-scorer' || isDodgeScorerMode()) {
      stopCompareTrainer();
      return;
    }
    const paramsB = buildPresetParams(preset);
    const setupB  = paramsB.setupId || preset.setupId || (app.trainer && app.trainer.setupId);
    // The setup's observationCount needs to be configured for B's obs
    // mode BEFORE makeTrainer reads it. Setup objects are singletons
    // (one per id) and the observationCount mutates per setObservationMode
    // call. Compare mode REQUIRES the same setup for A and B (different
    // setups would mean different observation counts + different sim
    // viewer needs -- not supported in v1). We don't enforce that here
    // (the user picked the preset, we trust them) but if they pick a
    // cross-setup compare the displayed sim still shows A and the
    // fitness chart still works.
    // Per-setup encoding (see SETUP_OBS_MODE_PARAM). This used to hard-code
    // dodge's key with a 'topk' fallback, so starting a compare against a
    // terrain preset sized B's genome from whatever mode the singleton
    // happened to hold.
    const setup = BF.setups.getSetup(setupB);
    applySetupObsMode(setup, setupB, paramsB);
    app.trainerB = T.makeTrainer({
      setupId: setupB,
      seed: ((resolveSeed() | 0) ^ 0x9E37_79B9) >>> 0 || 1,  // distinct seed from A
      params: paramsB,
      mutationParams: readParams().mut,
    });
    app.trainerBPresetId = presetId;
    app.trainerBStartedAt = BF.util.nowMs();
    app.trainerStartedAt = BF.util.nowMs();
    // IMPORTANT: restore the setup's observationMode back to A's so the
    // next time A rebuilds (slider change, New Run, etc.) it sees A's
    // own obs mode, not B's. The setup is a singleton -- without this,
    // A could accidentally inherit B's observationCount.
    if (app.trainer) {
      const setupA = BF.setups.getSetup(app.trainer.setupId);
      applySetupObsMode(setupA, app.trainer.setupId, app.trainer.params);
    }
    // Flip the layout into side-by-side mode. body.compare-on reveals
    // simCanvasB (initially hidden via CSS); the wrapper goes 50/50.
    document.body.classList.add('compare-on');
    rebuildDisplayStateB();
  }
  function stopCompareTrainer() {
    app.trainerB = null;
    app.trainerBPresetId = null;
    app.trainerBStartedAt = 0;
    app.showStateB = null;
    app.showPolicyB = null;
    app.showAccumulatorB = 0;
    document.body.classList.remove('compare-on');
    if (dom.compareWithPresetSelect) dom.compareWithPresetSelect.value = '';
  }

  // Populate the preset dropdown + wire its change handler. Called at
  // module init AFTER RUN_PRESETS is declared (temporal-dead-zone:
  // const declarations aren't accessible before their declaration line).
  // Which optgroup a preset belongs to. Explicit preset.category wins;
  // otherwise: curriculum variants of the demo suite, then the fast demo
  // suites (by setupId), then everything else under "Classic & research".
  const DEMO_CART_SETUPS = ['rail-catcher', 'catch-drop', 'pick-side', 'flee-the-dot',
    'cruise-control', 'accelerating-track', 'safe-zone', 'midpoint-meet',
    'tag-sequence', 'prioritize-nearest', 'plate-spin'];
  const DEMO_ARM_SETUPS = ['arm-reach', 'arm-track', 'arm-obstacle', 'arm-dodge', 'arm-slot'];
  function presetCategory(id, preset) {
    if (preset.category) return preset.category;
    const sid = preset.setupId || '';
    const isDemo = DEMO_CART_SETUPS.indexOf(sid) !== -1 || DEMO_ARM_SETUPS.indexOf(sid) !== -1;
    if (isDemo && /-curriculum$/.test(id)) return 'Demos — watch it learn';
    if (DEMO_ARM_SETUPS.indexOf(sid) !== -1) return 'Demos — arm (fast)';
    if (DEMO_CART_SETUPS.indexOf(sid) !== -1) return 'Demos — cart (fast)';
    return 'Classic & research';
  }
  const PRESET_CAT_ORDER = ['Demos — cart (fast)', 'Demos — arm (fast)', 'Demos — watch it learn', 'Classic & research'];

  // ---- Preset tags: at-a-glance technical facets ------------------------
  // Most tags are DERIVED from the preset's own fields (optimizer, policy,
  // gradient class, curriculum) so they can't drift. Editorial tags (status
  // like solved/experimental, or 'differentiable') come from an explicit
  // preset.tags array. Returns [{ text, cls }] for rendering as pills.
  const OPT_LABEL = {
    'cmaes': 'CMA-ES', 'sep-cmaes': 'sep-CMA-ES', 'neat': 'NEAT', 'neat-full': 'NEAT-full',
    'de': 'DE', 'pso': 'PSO', 'adam': 'Adam', 'annealing': 'SA', 'pt': 'PT', 'cem': 'CEM',
    'fdgd': 'FD-GD', 'spsa': 'SPSA', 'nes': 'NES', 'xnes': 'xNES', 'lbfgs': 'L-BFGS',
    'random': 'Random', 'fixed': 'Baseline',
  };
  // Optimizers that estimate a gradient (probe/finite-diff) vs pure zeroth-order.
  const GRAD_EST_MODES = { adam: 1, fdgd: 1, spsa: 1, nes: 1, xnes: 1, lbfgs: 1 };
  // Editorial tag -> pill color class (structural tags default to neutral).
  const TAG_CLS = {
    'solved': 'ptag-good', 'demo': 'ptag-good',
    'experimental': 'ptag-exp', 'frontier': 'ptag-exp', 'foil': 'ptag-exp',
    'differentiable': 'ptag-special', 'exact-grad': 'ptag-special',
  };
  // withNew: include the NEW badge. Only the tag-pill row passes true — the
  // dropdown COLOUR path must not, or "new" would override the does-it-work
  // colour that the option colours are for (a new preset still needs to read
  // green/amber at a glance).
  function presetTags(id, preset, withNew) {
    const tags = [];
    if (withNew && PRESET_NEW[id]) {
      const k = NEW_KIND[PRESET_NEW[id].kind || 'new'] || NEW_KIND.new;
      tags.push({ text: k.badge, cls: k.cls });
    }
    const mode = preset.mode || '';
    const approach = BF.presetNavigation.approach(preset);
    if (!approach.learns) {
      tags.push({ text: approach.label, cls: 'ptag-special' });
      for (const t of (preset.tags || [])) tags.push({ text: t, cls: TAG_CLS[t] || 'ptag-neutral' });
      return tags;
    }
    if (OPT_LABEL[mode]) tags.push({ text: OPT_LABEL[mode], cls: 'ptag-opt' });
    else if (mode) tags.push({ text: mode, cls: 'ptag-opt' });
    // Gradient class (skip when the preset carries an explicit differentiable/
    // exact-grad editorial tag, which supersedes the in-browser optimizer's class).
    const editorial = Array.isArray(preset.tags) ? preset.tags : [];
    if (!editorial.some((t) => t === 'differentiable' || t === 'exact-grad')) {
      tags.push({ text: GRAD_EST_MODES[mode] ? 'grad-est' : 'grad-free', cls: 'ptag-method' });
    }
    const pt = preset.policyType || 'mlp';
    if (/^cnn/.test(pt)) tags.push({ text: /neat/.test(pt) ? 'CNN+NEAT' : 'CNN', cls: 'ptag-policy' });
    // The recurrent policy's genome IS an ordinary MLP, but calling the pill
    // 'MLP' would hide the one thing that distinguishes it from its own foil.
    else if (pt === 'recurrent') tags.push({ text: 'RNN', cls: 'ptag-policy' });
    else tags.push({ text: 'MLP', cls: 'ptag-policy' });
    if (preset.curriculum && preset.curriculum.enabled) tags.push({ text: 'curriculum', cls: 'ptag-cur' });
    // Auto status (editorial tags override): the fast-demo suites are the
    // verified-solved ones (see robustness-probe); the unstable/chaotic setups
    // (double/triple pendulum, chain swing-up, pong) are the frontier ones.
    const cat = presetCategory(id, preset);
    const solvedCat = cat === 'Demos — cart (fast)' || cat === 'Demos — arm (fast)' || cat === 'Demos — watch it learn';
    const FRONTIER_SETUPS = { 'double': 1, 'triple': 1, 'spring-flail': 1, 'chain-reach': 1, 'ball-single': 1 };
    const hasStatus = editorial.some((t) => t === 'solved' || t === 'experimental' || t === 'frontier' || t === 'foil');
    if (!hasStatus) {
      if (solvedCat) tags.push({ text: 'solved', cls: 'ptag-good' });
      else if (FRONTIER_SETUPS[preset.setupId]) tags.push({ text: 'experimental', cls: 'ptag-exp' });
    }
    for (const t of editorial) tags.push({ text: t, cls: TAG_CLS[t] || 'ptag-neutral' });
    return tags;
  }
  // ---- "What's new" registry -------------------------------------------
  // Explicit per-preset note: WHEN it landed and WHAT it actually is, so a
  // recently-added preset announces itself instead of hiding in a 90-entry
  // dropdown. Dates are the preset's FIRST commit (git log -S on its id), not a
  // guess. Keep the newest batch at the top. Removing an entry just removes the
  // badge — nothing else depends on this map.
  const PRESET_NEW = {
    // --- newest batch ---
    'single-dropout-memory':      { date: '2026-08-24', what: 'Take the observation away between readings (fresh reading every 4th control step, everything zero but the bias in between) and a memoryless policy sees a LITERALLY IDENTICAL input on every stale step, so its output is a constant. MEASURED at the shipped budget: a 393-parameter recurrent policy reaches 0.942 pooled over 30 fresh seeds in two independent blocks; the parameter-matched 393-parameter memoryless MLP reaches 0.136 — the 0.123 do-nothing floor — on 15 of 15. RETRACTED here on 2026-08-24: this note used to say the task is one a reactive policy "cannot solve at any budget — not slower, incapable". The constant-output argument says why it should be hard, but what was actually measured is a BUDGET ENVELOPE, NOT an impossibility proof, so the stronger claim is withdrawn. 2 of those 30 seeds stall below 0.80 and the worst is 0.432 — the description says so. Added at the same time: the ENGINEERED CEILING the family was missing. A one-gain scripted controller that HOLDS its command between readings scores 1.000 at every K from 1 to 8, so the learned policy is below the ceiling, not at it; and the memoryless version of that same scripted law reaches only 0.175 over a 720-point gain grid, which is what makes "hypothesis class, not weak search" a measurement rather than an assertion. The genome is still an ordinary feed-forward MLP: recurrence is a wrapper that feeds 8 extra outputs back into 8 extra inputs, so CMA-ES / sep-CMA-ES / DE all optimise it unchanged.' },
    'single-dropout-severed':     { date: '2026-08-24', what: 'The FOIL that makes the memory claim falsifiable, shipped next to the claim. Same architecture, same 393 parameters, same budget — memory inputs held at 0. It lands on 0.138, indistinguishable from the memoryless MLP (0.136) and on the do-nothing floor (0.123). The sharper version is post-hoc: severing the TRAINED champion, identical weights, collapses it 0.955 → 0.087, at or below the floor on 15 of 15 seeds — and a second, independent block of 15 fresh seeds reproduced that at 0.929 → 0.081, 15 of 15. Also available live: the "Cut memory" checkbox re-wraps the current champion so you can watch it fall.' },
    'single-dropout-memoryless':  { date: '2026-08-24', what: 'The parameter-matched arm, at 393 parameters like the recurrent one (6→49→1 vs 14→16→9) — matched at the PARAMETER, not the hidden width, because an apparent architecture win at unequal capacity is this repo\'s most common false positive and already produced one wrong conclusion on this exact question. Paired by TRAINING SEED: mean difference 0.819, sd 0.100, t = 31.7, n = 15.' },
    'single-dropout-control-k1':  { date: '2026-08-24', what: 'The control, and the reason the claim is about memory rather than difficulty: the SAME 393-parameter memoryless MLP with the dropout switched off (still velocity-blind) solves the task 5 of 5 seeds at 1.000, extrapolation included. Hiding velocity ALONE turns out NOT to require memory on this plant — the engine\'s dissipation supplies the derivative action — which is exactly why the dropout is the load-bearing half of the encoding.' },
    'signing-swash-tight':            { date: '2026-08-11', what: 'The first chain-trace preset a LEARNED policy actually solves: 31.9 ± 4.4px over 19 of 20 seeds on the flattest signature stroke, inside its own 80px accepting radius for 93-99% of the loop. Against a 130.6px do-nothing floor and the hand-written planner\'s 10.9px — 82% of the gap closed, and the engineer still 3.0× ahead. The 80px is not a round number: it is the tightest setting measured to cost nothing. The 20th seed FAILS at 96.0px — the description says so. UPDATED 2026-08-24: pins the PLACEMENT too (traceCenterY 257), alongside the start pose it already pinned. swash fits at that height either way; the pin exists so all four accepting-radius presets stay on ONE stage now that the setup auto-places each curve by its own measured reach.' },
    'signing-longhand-tight':         { date: '2026-08-11', what: 'The flagship signing stroke, and the CONTROL for the whole accepting-radius family: four tolerance settings spanning a 5× range (55 / 200 / two ramps) all land at 65-69px. On this curve the knob does NOTHING — shape sets the difficulty, not leniency. UPDATED 2026-08-24: pins the PLACEMENT (traceCenterY 257) with the rest of the family. longhand does not move on its own, but copperplate does, and the ladder is only a ladder while the three curves share a stage.' },
    'signing-copperplate-accept-ramp': { date: '2026-08-11', what: 'The only measured case in this app where an accepting-radius RAMP is the reason a run works: the flat 55px endpoint goes blind (99.8px, 0/3 seeds improving), the 200→55 ramp reaches 73.8 ± 5.3px with 3/3 improving. Two honest caveats shipped with it — it still loses to leaving the tolerance loose (65.5px), and by generation 100 it has only climbed to level 5-7 of 10. UPDATED 2026-08-24: PLACEMENT PINNED (traceCenterY 257). The setup now clamps each curve into the chain\'s measured reach and would stage copperplate 29px deeper; moving it measured a null on the foil (105.4 → 107.7px over 10 paired seeds), so the pin keeps every figure above reproducible.' },
    'signing-copperplate-blind':      { date: '2026-08-11', what: 'The FOIL, shipped rather than dropped: the same 55px tolerance applied from generation 0 instead of ramped into. 94 ± 13px, the tip inside its own radius only 32-43% of the loop, fitness flat from about generation 40. The same 80px that is free on `swash` already costs 17px here — the safe tolerance is NOT a fraction of the curve, it is whatever sits above the error that curve can reach. UPDATED 2026-08-24: PLACEMENT PINNED (traceCenterY 257), and this preset is where that pin was measured — auto-placed at 285.7 it reads 107.7px against the pin\'s 105.4 over 10 paired seeds, t = +0.39. A null, so the ladder is not re-run.' },
    'terrain-run':                    { kind: 'updated', date: '2026-09-08', what: "Longer learned-control study on randomized courses. The current description distinguishes historical training results from the September correctness checks." },
    'terrain-run-cnn':                { date: '2026-08-11', what: 'The architecture question, answered honestly and in both directions. At MATCHED parameters (416 vs 401) convolution scores better — 98.5 vs 98.2, and +2.21% of attainable max pooled over 7 matched pairs — and costs 1080 s against 94 s. It is behind every dense MLP at generations 25 and 50, and best-of-4 restarts of a LINEAR policy beat it per second. The mechanism was NOT resolved, so no "conv sees terrain better" claim is made.' },
    'terrain-run-crucible':           { date: '2026-08-11', what: 'The non-saturated rung (every pit 4 tiles, 2-3 flat tiles between features, 250 tiles, attainable max 266.0) and the one geometry where concatenating the hand summary onto the raw patch actually pays: +41.6, 24 of 24 seeds. On the easier geometry the same encoding is neutral-to-negative — which is why it ships as a geometry-specific finding rather than a general one. 72% of courses completed; the remaining 28% are the open part.' },
    'epicycle-analytic-signature':    { kind: 'updated', date: '2026-09-08', what: "Analytic Fourier approximation with an arm-count quality control. The current description distinguishes finite-harmonic exact cases from general curve approximation." },
    'signing-paint-cmaes':            { date: '2026-07-16', what: 'Brand-new OBJECTIVE, not just a config: the curve is thickened into a band and the tip is graded on how much of it it PAINTS, minus time spent outside. No moving cursor to chase — and a "sweep everywhere" policy scores NEGATIVE by construction.' },
    'signing-strokes-cmaes':          { date: '2026-08-10', what: 'ACTUAL signing: the tip is a PEN. Leave the band and the stroke BREAKS — the next contact is a new stroke — and the score is the drawing discounted by how many strokes it took. Every constant in it was set by a foil that beat the honest drawing without it, including the one that nearly sank the design: parking motionless on the line.' },
    'signing-ordered-cmaes':          { date: '2026-08-10', what: 'Trace the curve IN ORDER — the flow, not the footprint. No cursor drags the tip along; only the next unclaimed waypoint pays, so covering the shape out of order earns nothing. paint scores a REVERSED trace identically to a perfect one (7.03 vs 7.03); this separates them by 11 points. UPDATED 2026-08-24: the placement is now PINNED (traceCenterY 257). The setup\'s new reach clamp would stage this triangle 49.6px deeper — its apex really does sit above the chain\'s measured reach, which IS the "high vertex" caveat below. Measured both ways and it is a null (at 150 gens both placements trace 100% of the curve on 3 of 3 seeds, 23.0 vs 24.4px), so the numbers stay where they were taken.' },
    'dodge-radar-cmaes':              { date: '2026-07-16', what: 'The planner-grade observation: an ANGULAR DANGER RADAR replaces raw bullet coordinates. The measured lesson of the dodge family is that the gap was never the optimizer, it was the representation.' },
    'rigid-triple-lqr-showcase':      { kind: 'updated', date: '2026-09-08', what: 'Audited mechanics, replay timing and claim scope. See the current description and the audit report.' },
    'signing-accept-curriculum':      { date: '2026-07-16', what: 'Signing machine with an accepting-radius curriculum you can watch tighten. Shape/placement — not leniency — turned out to dominate tracing quality.' },
    'golf-gauntlet':                  { date: '2026-07-16', what: 'Frontier golf: the obstacle grows into a boulder and the ground turns bumpy as the curriculum advances.' },
    'signing-telescope-cmaes':        { date: '2026-07-16', what: 'Signing machine with TELESCOPING segment lengths — per-segment angle AND amplitude, a Fourier-style trace machine. UPDATED 2026-08-24: the "+25% over fixed-length" headline is RETRACTED. The reach clamp stages a telescope-less chain at its passive hang (y 326.6) and a telescoping one at y 257, so toggling the telescope now moves the curve as well as the action set — re-measured paired, fixed-length is 16px BETTER at the placements the app uses (65.0 vs 81.2px, 5/5 seeds) and 3.5px better at a matched height.' },
    'single-pendulum-cnn':            { date: '2026-07-16', what: 'The CNN that actually works: a convolutional policy reading phase space, ~99% of ceiling.' },
    'dodge-lookahead-cmaes':          { date: '2026-07-16', what: 'Gives the network the planner\'s own 9-way forward projection as input features.' },
    'signing-planner-showcase':       { kind: 'updated', date: '2026-09-08', what: 'Audited mechanics, replay timing and claim scope. See the current description and the audit report.' },
    'signing-lookahead-cmaes':        { kind: 'updated', date: '2026-09-08', what: 'Audited mechanics, replay timing and claim scope. See the current description and the audit report.' },
    // --- previous batch ---
    'double-pendulum-assisted-fast':  { date: '2026-07-15', what: 'LEARNED 180° double swing-up with a small upright assist + hinge friction. Now carries its NULL-POLICY baseline: with the cart frozen the chain still reaches upright 47% of the time, so the network earns +32 points, not the whole 79.' },
    'triple-pendulum-assisted-fast':  { date: '2026-07-15', what: 'The 3-link version of the same assisted swing-up. Null-policy baseline 59% — the assist does most of the lifting here, which is the honest lesson of this pair.' },
    'arm-reach-radius-curriculum':    { date: '2026-07-15', what: 'Multi-DOF arm reach where the accepting circle visibly shrinks as the curriculum advances.' },
    'putt-moving-hole':               { date: '2026-07-15', what: 'Generalization test: the hole MOVES between rollouts, so the policy must read its position instead of memorizing one shot.' },
    'double-pendulum-nudged':         { date: '2026-07-15', what: 'Unaided double pendulum under random shoves — an honest frontier preset, expected to be hard.' },
    'single-pendulum-nudged':         { date: '2026-07-15', what: 'Shove-strength curriculum ramping 40 → 220; completes with no assists.' },
    // --- CHANGED, not added: presets that already existed but whose behaviour or
    //     honesty changed recently. kind:'updated' renders an amber CHANGED badge
    //     instead of the pink NEW one, so "new to the app" and "different from
    //     last time you looked" are never confused.
    'rigid-swingup-showcase':         { kind: 'updated', date: '2026-09-08', what: 'Audited mechanics, replay timing and claim scope. See the current description and the audit report.' },
    // (This preset had TWO entries until 2026-08-24 — one NEW, one CHANGED —
    //  and the object literal silently kept only the second, so its "what it
    //  is" note had been invisible since it was written. Merged.)
    'rigid-triple-swingup-showcase':  { kind: 'updated', date: '2026-09-08', what: 'Audited mechanics, replay timing and claim scope. See the current description and the audit report.' },
    'single-pendulum-2phase-neat':    { kind: 'updated', date: '2026-07-16', what: 'CORRECTED CLAIM: this preset used to say the network "commands cart ACCELERATION" and "cannot set the cart\'s speed". Measured, that is false — the default accel mode is a RATE-LIMITED VELOCITY SERVO (a constant 0.5 command settles the cart at exactly 300 px/s in ~0.2s). The description now states this honestly and points at the `force` mode for the genuinely physical model.' },
    'double-pendulum-2phase-neat':    { kind: 'updated', date: '2026-07-16', what: 'CORRECTED CLAIM (same actuation fix as the single-pendulum version) and added the measured floor: 3 seeds × 1000 gens reach only curriculum level 67–122 of 450 and hold 0.00–0.04 from a full hang-down start. It is an honest frontier preset, not a demo.' },
    'chain-trace-cmaes':              { kind: 'updated', date: '2026-08-24', what: 'CHANGED SCENE: the curve now sits at the chain\'s MEASURED passive hang (y 358) instead of a height derived from the spring rest length (293). This chain has no telescope, so the hang is the only height its tip can be held at. Re-measured on this preset, 10 paired seeds × 60 gens: 89.9 → 79.8px, 7 of 10 seeds better but t = −1.67, and slightly WORSE against each scene\'s own do-nothing floor (0.80 → 0.88). A NULL — the placement changed for a plant reason, not a performance one.' },
    'chain-trace-neat':               { kind: 'updated', date: '2026-08-24', what: 'CHANGED SCENE: shares chain-trace-cmaes\'s move to the measured passive hang (y 293 → 358). Not separately re-measured; the paired measurement on the CMA-ES twin came out null.' },
    'chain-trace-actuated':           { kind: 'updated', date: '2026-08-24', what: 'CHANGED SCENE: shares chain-trace-cmaes\'s move to the measured passive hang (y 293 → 358). Joint count does not change the settled reach, so this stays a controlled pair with the joints-off preset.' },
  };
  const NEW_KIND = {
    new:     { badge: 'NEW',     cls: 'ptag-new',     word: 'added' },
    updated: { badge: 'CHANGED', cls: 'ptag-updated', word: 'updated' },
  };
  // Highlight vocabulary, applied automatically to EVERY description (including
  // ones written long before this panel existed — no per-preset markup needed).
  // Order matters: the alternation is tried left to right, so multi-word method
  // names must precede the single words they contain.
  const DESC_HL_RE = new RegExp([
    // 1) measured values — only "interesting" numerals (a decimal, a ratio, a
    //    percentage, or a number with a unit), so ordinary prose digits stay plain.
    '(\\b\\d+\\s*/\\s*\\d+\\b|~?\\d+(?:\\.\\d+)?\\s*(?:%|px/s|px|°|s\\b)|\\b\\d+\\.\\d+\\b|~?\\d+\\s*(?:gens?|generations?|seeds?|levels?|steps?|links?)\\b)',
    // 2) verified / it-works words
    '(\\bMEASURED\\b|\\bVERIFIED\\b|\\bPROVEN\\b|\\bCONFIRMED\\b|\\bSOLVED\\b|\\bGROUND TRUTH\\b|\\bprobe-proven\\b|\\bcatch-VERIFIED\\b)',
    // 3) caveat / honest-limit words
    '(\\bHONEST(?:LY)?\\b|\\bCAVEAT\\b|\\bBUT READ THIS\\b|\\bdoes NOT\\b|\\bNOT\\b|\\bNEVER\\b|\\bFAILS?\\b|\\bfrontier\\b|\\bAmber-hard\\b|\\bNULL-POLICY\\b|\\bnull-policy\\b)',
    // 4) method + concept terms
    '(\\btrajectory optimization\\b|\\bexact-gradient\\b|\\bsep-CMA-ES\\b|\\bCMA-ES\\b|\\bNEAT-full\\b|\\bNEAT\\b|\\bLQR\\b|\\bRiccati\\b|\\bautodiff\\b|\\btrajopt\\b|\\bcurriculum\\b|\\bmulti-start\\b|\\buprightAssist\\b|\\bjointDamping\\b|\\bMLP\\b|\\bCNN\\b|\\bAdam\\b|\\bVerlet\\b)',
  ].join('|'), 'g');
  const DESC_HL_CLS = ['d-num', 'd-good', 'd-warn', 'd-kw'];
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function highlightDescription(text) {
    return escHtml(text).replace(DESC_HL_RE, function (m) {
      // arguments[1..4] are the capture groups; find which one matched.
      for (let g = 1; g <= DESC_HL_CLS.length; g++) {
        if (arguments[g] != null) return '<span class="' + DESC_HL_CLS[g - 1] + '">' + m + '</span>';
      }
      return m;
    });
  }
  function renderPresetDesc(presetId) {
    if (!dom.presetDesc) return;
    const p = presetId && RUN_PRESETS[presetId];
    if (!p || !p.description) { dom.presetDesc.classList.add('hidden'); dom.presetDesc.textContent = ''; return; }
    const n = PRESET_NEW[presetId];
    const k = n && (NEW_KIND[n.kind || 'new'] || NEW_KIND.new);
    const notes =
      (n ? '<span class="pd-new' + (n.kind === 'updated' ? ' pd-upd' : '') + '"><b>' + k.badge + '</b>' +
           ' <span class="pd-date">· ' + k.word + ' ' + escHtml(n.date) + '</span><br>' +
           highlightDescription(n.what) + '</span>' : '') +
      highlightDescription(p.description);
    const summary = BF.presetNavigation.summaries[presetId];
    dom.presetDesc.innerHTML = summary
      ? highlightDescription(summary) + '<details class="preset-technical-notes"><summary>Experiment notes &amp; measured limits</summary>' + notes + '</details>'
      : notes;
    dom.presetDesc.classList.remove('hidden');
  }

  function refreshApproachUI(presetId) {
    const chosen = presetId != null ? RUN_PRESETS[presetId] : RUN_PRESETS[dom.runPresetSelect && dom.runPresetSelect.value];
    const current = presetId != null && chosen ? {...chosen} : {
      ...(chosen?.mode === dom.modeSelect.value ? chosen : {}), mode: dom.modeSelect.value, policyType: dom.policyTypeSelect.value
    };
    if(dom.modeSelect.value==='ppo' && app.ppoRun && app.ppoSignature===JSON.stringify(ppoSceneFromUI())){
      current.approach={kind:'gradient',learns:true,label:'PPO · actor–critic backpropagation',action:'Continue PPO',
        detail:'Continue the current actor, critic and Adam optimizer. Save preserves training state; Restore restarts physical episodes. Test freezes the deterministic actor.'};
    }
    const approach = BF.presetNavigation.approach(current);
    const panel = document.getElementById('approachSummary');
    const markup = `<strong>${escHtml(approach.label)}</strong><span>${escHtml(approach.detail)}</span>`;
    if (panel && panel.innerHTML !== markup) panel.innerHTML = markup;
    if (panel) panel.dataset.approach = approach.kind;
    if (dom.trainBtn.textContent !== approach.action) dom.trainBtn.textContent = approach.action;
    dom.trainBtn.title = approach.learns
      ? 'Run the current training population. A training preset creates a fresh experiment; loading a network is a separate action.'
      : approach.detail;
    dom.testBtn.title = approach.learns
      ? 'Replay the best trained or loaded network. Test does not train.'
      : 'Replay the current controller or analytic motion; this does not create trained network weights.';
    document.body.classList.toggle('learning-mode', approach.learns && !app.testing);
    document.body.classList.toggle('reference-mode', !approach.learns);
    const controllerBadge = document.getElementById('controllerKindBadge');
    if (controllerBadge) {
      const tech = BF.presetNavigation.technique(current, !approach.learns);
      const caption = !approach.learns
        ? (approach.kind === 'planner' ? 'Model-based reference · not trained' : 'Analytical reference · not trained')
        : (dom.modeSelect.value === 'ppo' ? 'PPO' : tech.label) + (app.testing ? ' · frozen network' : app.training ? ' · learning' : ' · network preview');
      controllerBadge.hidden = false;
      controllerBadge.dataset.kind = !approach.learns ? 'reference' : approach.kind === 'gradient' || approach.kind === 'imitation' ? 'gradient' : /cnn/.test(current.policyType || '') ? 'cnn' : approach.kind;
      controllerBadge.title = approach.detail;
      if(controllerBadge.textContent !== caption) controllerBadge.textContent = caption;
    }
    const identity = document.getElementById('activeControllerName');
    if(identity) {
      const loaded=app.testing && app.loadedShowcaseModelId && readyToPlayEntries().find(m=>m.id===app.loadedShowcaseModelId && m.presetId===dom.runPresetSelect.value);
      const caption=loaded?.label || chosen?.label || BF.setups.getSetup(dom.setupSelect.value)?.label || 'Custom controller';
      if(identity.textContent!==caption) identity.textContent=caption;
      identity.title=loaded?.summary || approach.detail;
    }
    const ppoPanel = document.getElementById('ppoTrainingStatus');
    if (ppoPanel) ppoPanel.classList.toggle('hidden', dom.modeSelect.value !== 'ppo');
    const isPPO = dom.modeSelect.value === 'ppo';
    if (dom.curriculumOn) { dom.curriculumOn.disabled=isPPO; if(isPPO) dom.curriculumOn.checked=false; }
    if (dom.curriculumTopbarBtn) dom.curriculumTopbarBtn.disabled=isPPO;
    if (dom.compareWithPresetSelect) dom.compareWithPresetSelect.disabled=isPPO;
    const throughput = document.getElementById('trainingThroughput');
    if (throughput) {
      throughput.dataset.active = String(approach.learns && !app.testing);
      throughput.dataset.playback = String(!!app.testing);
      const label=throughput.querySelector('.throughput-title small');
      if(label) label.textContent=app.testing?'playback':'training';
    }
    const fourier = document.getElementById('fourierExplanation');
    if (fourier) fourier.classList.toggle('hidden', dom.setupSelect.value !== 'epicycle');
    const nudges = document.getElementById('liveNudgeControls');
    if (nudges) nudges.hidden = !app.testing || !['single','double','triple'].includes(dom.setupSelect.value)
      || (isDiffsimMode() && !app.diffsimRun?.liveReference);
    refreshPendulumReplayUI();
    refreshControllerTime();
    refreshPhysicsRateUI();
    const initial=app.trainer?.params?.pendulumInitialState;
    const initialNote=document.getElementById('momentumStartNote');
    if(initialNote) {
      initialNote.hidden=!initial;
      if(initial) {
        const moving=(initial.angularVelocities||[]).some(v=>Math.abs(v)>1e-10)||Math.abs(initial.cartVelocity||0)>1e-10;
        initialNote.querySelector('strong').textContent=moving?'Initial energy is supplied':'Released from rest';
        initialNote.querySelector('span').textContent=moving
          ? 'Both rods start below horizontal, already rotating inward. PPO controls only cart acceleration after release; there is no further state correction.'
          : 'Both rod angles are set explicitly, with zero initial velocity. The frozen network then controls cart acceleration; rail contacts are part of this experiment.';
        const values=document.getElementById('momentumStartValues');
        const line=`Recorded start: ${initial.anglesDeg.join('°, ')}° from upright · angular rates ${initial.angularVelocities.join(', ')} rad/s, mirrored between trials.`;
        if(values.textContent!==line)values.textContent=line;
      }
    }
    if(isDodgeScorerMode()) {
      controllerBadge.textContent='CMA-ES · learned scorer + model';
      dom.trainBtn.title=approach.detail;dom.compareWithPresetSelect.disabled=true;
    }
    const dodgeNote=document.getElementById('dodgeMethodNote');
    if(dodgeNote)dodgeNote.hidden=!isDodgeScorerMode();
    const golfNote=document.getElementById('golfCourseNote');
    if(golfNote)golfNote.hidden=dom.setupSelect.value!=='golf-challenge';
    const signingNote=document.getElementById('signingMethodNote');
    if(signingNote)signingNote.hidden=app.loadedShowcaseModelId!=='balance-word-trained';
    const hint = document.getElementById('trainingSpeedHint');
    if (hint) hint.textContent = dom.modeSelect.value === 'ppo'
      ? 'PPO uses eight local rollout environments and backpropagation, with the visible scene and disturbance settings. This browser path uses a fixed task; the saved 25° actor used an offline angle curriculum. Population workers and the population benchmark do not accelerate PPO. Full power reduces display work.'
      : approach.learns
      ? 'Inspect slowly when needed. Full power and parallel evaluation are in the top row for faster training.'
      : approach.kind === 'planner'
        ? 'This planner simulates futures during live playback. Population workers do not speed up its decisions; lower Sim speed to inspect them.'
        : 'These throughput controls serve population training. The current comparator uses its own controller computation.';
    return approach;
  }

  function renderPresetTags(presetId) {
    refreshApproachUI(presetId);
    if (!dom.presetTags) return;
    dom.presetTags.textContent = '';
    const p = presetId && RUN_PRESETS[presetId];
    renderPresetDesc(presetId);   // description panel tracks the tag row
    if (!p) { dom.presetTags.classList.add('hidden'); return; }
    dom.presetTags.classList.remove('hidden');
    for (const t of presetTags(presetId, p, true)) {
      const el = document.createElement('span');
      el.className = 'ptag ' + t.cls;
      el.textContent = t.text;
      dom.presetTags.appendChild(el);
    }
  }

  // The single most salient facet of a preset, as a colour for the dropdown
  // option — chosen so the colour answers "does it work?" at a glance:
  //   amber  = experimental / partial (doesn't fully work yet)  [checked FIRST]
  //   purple = differentiable / exact-gradient method that works
  //   teal   = CNN policy
  //   green  = solved (works — analytic, model-based, or a completing curriculum)
  // Experimental is checked before differentiable so a hard, not-yet-working
  // gradient preset (e.g. the swing-up trajopt) reads amber, not "done" purple.
  function presetPrimaryColor(id, preset) {
    const tags = presetTags(id, preset).map((t) => t.text);
    if (tags.indexOf('experimental') !== -1 || tags.indexOf('frontier') !== -1 || tags.indexOf('foil') !== -1) return '#f5b769';
    if (tags.indexOf('differentiable') !== -1 || tags.indexOf('exact-grad') !== -1) return '#bd87ff';
    if (tags.indexOf('CNN') !== -1 || tags.indexOf('CNN+NEAT') !== -1) return '#4ee0c0';
    if (tags.indexOf('solved') !== -1) return '#6ce28a';
    return '';   // default (inherit)
  }

  // Fill a <select> with the presets grouped into <optgroup>s.
  // Curated "Selected presets" — the benchmark-verified flagships that reliably
  // work well, one per category. The full "Preset (all)" dropdown still lists
  // EVERYTHING (variants + experimental); this is the surfaced showcase. Order
  // here IS the display order. Guarded in smoke-test.js so a rename can't silently
  // drop an entry.
  // Grouped by THEME, each category colour-coded (the optgroup label takes the
  // category colour). Order here IS the display order. Guarded in smoke-test.js.
  // THE SHOWCASE IS AN ARGUMENT, IN SIX ACTS — read top to bottom.
  //
  // Thesis: LEARNING is what you reach for when nobody has the equations, and
  // every preset here measures the bill for that freedom. On the tasks that DO
  // have equations, a page of classical control beats a thousand generations of
  // evolution; the only thing that ever narrows the gap is handing the learner
  // what the engineer already knew.
  //
  // Each act's colour is its VERDICT, not its topic: green = learning wins,
  // amber = learning struggles (honestly), pink = it "works" but audit the
  // credit, violet = classical control, teal = the gap closing, blue = open.
  // The weak/failing presets are deliberately INCLUDED — an argument with no
  // counter-evidence is marketing. Every number quoted in an act's presets was
  // measured, not asserted.
  const SHOWCASE_CATEGORIES = [
    { name: 'I · Learning wins — where nobody has the equations', color: '#6ce28a', ids: [
      'rail-catcher-cmaes',            // tracking — trains <15 gens, rock-solid
      'pick-side-curriculum',          // watch-it-learn — visible curriculum climb
      'arm-reach-radius-curriculum',   // multi-DOF reach + accepting-radius curriculum
      'arm-obstacle-cmaes',            // constrained routing (hard-but-solvable)
      'arm-slot-cmaes',                // thread the needle — measured 0.76 of ceiling
      'plate-spin-cmaes',              // carries a tray-ball to a target
      'putt-hole-curriculum-cmaes',    // sinks the ball; hole shrinks 500->40
      'signing-accept-curriculum',     // signing machine — shape/placement dominate
      // The signing machine's first outright WIN, and the only chain-trace
      // preset in the collection tagged solved on a learned policy: 32.3 px
      // over 6 seeds with the tip inside its own 80 px accepting radius for
      // 99% of the loop (floor 130.6, planner 10.9). It belongs in this act
      // and its three siblings do not — the same knob is a no-op on
      // `longhand` and fatal on `copperplate`, which is why those live in
      // act VI. Read the four together and the lesson is that a tolerance is
      // safe when it sits above the error the CURVE can reach, not when it is
      // a small fraction of the curve.
      'signing-swash-tight',           // tight tolerance that costs nothing — 82% of the gap closed
      'single-pendulum-cnn',           // phase-space CNN, ~99% of ceiling
      'single-pendulum-nudged',        // completes under shoves, no assists
      // The strongest form of this act's claim, and the only preset in the
      // collection where the world is REGENERATED every rollout and the score
      // is read off courses no training run ever saw. It is not "learning does
      // well on the task it was tuned for": the learned policy (98.2 of 100)
      // beats a scripted oracle that is allowed to read the true tilemap
      // (88.6), and a hindsight oracle picking the best of 294 open-loop
      // reflexes PER COURSE still solves only 103 of 128.
      'terrain-run',                   // randomised courses, held-out test set
    ] },
    { name: 'II · Then the task turns unstable — and the bill arrives', color: '#f5b769', ids: [
      'single-pendulum-2phase-neat',   // GENUINE unaided 180° swing-up — but ~1000-1600 gens
      'double-pendulum-2phase-neat',   // measured floor: level 67-122/450, holds 0.00-0.04
    ] },
    { name: 'III · You can buy success with help — now audit the credit', color: '#f78fb3', ids: [
      'double-pendulum-assisted-fast', // 0.794 trained BUT 0.472 with a DEAD policy (+0.32 earned)
      'triple-pendulum-assisted-fast', // 0.787 trained BUT 0.588 with a DEAD policy (+0.20 earned)
    ] },
    { name: 'IV · A page of classical control just does it', color: '#bd87ff', ids: [
      'rigid-swingup-showcase',        // 180° down->up->hold, zero assists; verify the current search result
      'rigid-triple-swingup-showcase', // TRIPLE down->up->hold — the Glück-2013 Automatica problem
      'rigid-lqr-showcase',            // holds at ANY gravity — solved at gen 0
      'rigid-triple-lqr-showcase',     // all THREE links held — solved at gen 0
    ] },
    // Act V is the sharpest MEASURED sequence in the collection — read it as a
    // ladder, bottom to top. Matched-environment budget sweep (spawn 10, identical
    // bullet patterns, 24 eval rollouts, 2 seeds, metric = HITS TAKEN because
    // dodgeNoDie defaults on so "survival" is always the full rollout), tracking
    // the LEARNING CURVE rather than one endpoint. Mean hits, lower = better:
    //   hand-coded corner-wedge, 0 training .......... 16.3   (the floor)
    //   raw top-K, 30 -> 200 gens .................... 8.7 -> 7.5   PLATEAUS
    //   + planner's 9-way lookahead, 30 -> 200 ....... 8.7 -> 5.3   still improving
    //   + planner-grade angular radar, 30 -> 200 ..... 10.3 -> 2.8  best by 2.7x
    //   the planner itself ........................... never hit
    // Two lessons, both counterintuitive: (1) the ceiling is the REPRESENTATION,
    // not the optimizer — raw bullet coordinates plateau early and more budget
    // never rescues them; (2) a SHORT run actively inverts the ranking, because
    // radar is the WORST of the three at 30 gens (bigger net, slower to train) and
    // the best by a wide margin at 150. An earlier 30-gen probe of mine concluded
    // "the encodings buy nothing" — this sweep is what corrected it.
    { name: 'V · The gap was the representation, not the optimizer', color: '#4ee0c0', ids: [
      'dodge-baseline-wall-wedge',     // THE FLOOR: 0 training, hand-coded (16.3 hits). Read the rest against it.
      'dodge-neat-multiscale-dense',   // purely REACTIVE learner — clearly beats the floor
      'dodge-cnn-multiscale',          // same task, convolutional view — honest comparison point
      'dodge-lookahead-cmaes',         // + the planner's 9-way forward projection (5.3 by 200 gens)
      'dodge-radar-cmaes',             // + planner-grade angular radar (2.8 by 200, still falling — needs 100+ gens)
      'dodge-planner-showcase',        // the planner itself — never hit, solved by construction
      // The signing counterpart. It used to carry the opposite moral — the
      // learned tracker (66.7px) looked LEVEL with the planner (67.3px), read as
      // "learning matches the engineer". The 2026-08 placement fix killed that
      // reading: the curve had been centred outside the chain's reachable band,
      // so both controllers were bottoming out on a task neither could execute.
      // Placed properly, the planner is 21.2px and the learner 40.1px — the
      // engineer is ~1.9x ahead. The honest moral is now about MEASUREMENT:
      // an apparent tie can be two controllers failing at the same wall, and
      // fixing the task can WIDEN the gap rather than close it.
      'signing-lookahead-cmaes',       // learned + anticipation — at the ceiling
      'signing-planner-showcase',      // the engineered ceiling itself (flat line = correct)
      // And the escape hatch from that whole argument: when neither a better
      // representation nor a better optimizer moves the number, the thing to
      // change is the PLANT. The epicycle is the same drawing task on a machine
      // the maths can actually solve — 7.8px at 12 arms where the chain's
      // engineered ceiling is 21.2px, and exact (0.00px) on a figure-8.
      'epicycle-analytic-signature',   // change the machine, not the controller
      // The counterweight this act needs. Everything above says the winning
      // move was changing what the policy READS. This is the control: hold the
      // observation fixed and change the policy's ARCHITECTURE instead, at
      // matched parameters. Convolution does win — by +2.21% of attainable max
      // — and costs 7-17x the wall-clock, losing to cheap restarts of a linear
      // policy at every budget. Changing the representation moved dodge 2.7x;
      // changing the architecture moved this 2%.
      'terrain-run-cnn',               // architecture, not representation — and the bill
      // ...and the case where architecture is not a 2% tweak but the whole
      // game. Take the observation away between readings and a reactive policy
      // is not slow, it is INCAPABLE: on a stale step its input is literally
      // identical every time, so its output is a constant. Four presets, one
      // task, one parameter count (393), one optimiser and one budget — the
      // only thing that changes is whether the policy can carry state, and
      // whether the dropout is switched on at all.
      'single-dropout-control-k1',     // the SAME MLP with the dropout off — solves it
      'single-dropout-memoryless',     // dropout on: pinned at the do-nothing floor
      'single-dropout-memory',         // + 8 recurrent channels: solved
      'single-dropout-severed',        // the foil: same architecture, memory cut
    ] },
    { name: 'VI · The honest frontier — still open', color: '#7ec8f7', ids: [
      'double-pendulum-nudged',        // unaided double under shoves
      'golf-gauntlet',                 // obstacle grows into a boulder + bumpy ground
      'putt-moving-hole',              // must READ the moving hole, not memorize a shot
      'signing-paint-cmaes',           // coverage objective — sweeping everywhere scores NEGATIVE
      'signing-strokes-cmaes',         // + continuity: the pen lifts, and every lift costs
      'signing-ordered-cmaes',         // + ORDER: the flow of the curve, at the policy's own pace
      // The other end of the accepting-radius ladder that act I opens. Same
      // knob, hardest stroke in the registry: applied flat the 55 px tolerance
      // goes BLIND (94 px, tip inside its own radius 32-43% of the loop,
      // fitness flat from ~gen 40); ramped into over 10 levels it reaches
      // 73.8 px. Shipped as a PAIR so the rescue is a controlled comparison
      // rather than a claim — and with both caveats stated, since the ramp
      // still loses to leaving the tolerance loose (65.5 px) and only climbs
      // to level 5-7 of 10 in 100 generations.
      'signing-copperplate-accept-ramp', // the ramp that IS the reason the run works
      'signing-copperplate-blind',       // the same endpoint applied flat — the foil
      'double-pendulum-neat-style-velocity', // THE FOIL: cheat the physics and it gets easy (and ugly)
      // Randomised worlds again, but on the geometry that is NOT saturated:
      // 28% of held-out courses go unfinished by the best measured arm. It is
      // also the one place where concatenating the hand summary onto the raw
      // patch pays (+41.6, 24/24 seeds) while being neutral-to-negative on the
      // easier geometry — an encoding result that refuses to generalise.
      'terrain-run-crucible',          // 72% completed; the other 28% is the frontier
    ] },
  ];
  // Flattened membership list (for syncPresetDropdowns).
  // A short visitor route. The longer study sequences above remain documented,
  // and every preset stays reachable through Preset (all).
  const QUICKSTART_CATEGORIES = BF.presetNavigation.trainingGroups;
  const SHOWCASE_PRESET_IDS = QUICKSTART_CATEGORIES.reduce((a, c) => a.concat(c.ids), []);
  // Fill the curated dropdown with colour-coded optgroups (one per theme); each
  // option is coloured by its own "does it work" facet. Leaves the caller's
  // existing placeholder option in place.
  function fillShowcaseSelect(sel) {
    for (const cat of QUICKSTART_CATEGORIES) {
      const og = document.createElement('optgroup');
      og.label = cat.name;
      og.style.color = '#dce3ef';
      og.style.backgroundColor = '#171d2a';
      let any = false;
      for (const id of cat.ids) {
        const preset = RUN_PRESETS[id];
        if (!preset) continue;   // defensive: a renamed/removed preset just drops out
        const opt = document.createElement('option');
        opt.value = id;
        // Prefix recent presets with a star so they are findable by SCANNING the
        // list, not only after selecting one (the badge + description panel show
        // the rest). Keeps the option's status colour intact.
        opt.textContent = preset.label;
        if (preset.description) opt.title = preset.description;
        const tech = BF.presetNavigation.technique(preset);
        opt.style.color = tech.color;
        opt.style.backgroundColor = tech.background;
        og.appendChild(opt);
        any = true;
      }
      if (any) sel.appendChild(og);
    }
  }

  function fillPresetSelect(sel) {
    const byCat = new Map();
    for (const id of Object.keys(RUN_PRESETS)) {
      if (sel === dom.compareWithPresetSelect && RUN_PRESETS[id].mode === 'dodge-scorer') continue;
      const cat = presetCategory(id, RUN_PRESETS[id]);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(id);
    }
    const cats = PRESET_CAT_ORDER.filter(c => byCat.has(c))
      .concat([...byCat.keys()].filter(c => PRESET_CAT_ORDER.indexOf(c) === -1));
    for (const cat of cats) {
      const og = document.createElement('optgroup');
      og.label = cat;
      for (const id of byCat.get(cat)) {
        const preset = RUN_PRESETS[id];
        const opt = document.createElement('option');
        opt.value = id;
        // Prefix recent presets with a star so they are findable by SCANNING the
        // list, not only after selecting one (the badge + description panel show
        // the rest). Keeps the option's status colour intact.
        opt.textContent = (PRESET_NEW[id]
          ? (PRESET_NEW[id].kind === 'updated' ? '● CHANGED · ' : '★ NEW · ') : '') + preset.label;
        if (preset.description) opt.title = preset.description;
        const col = presetPrimaryColor(id, preset);
        if (col) opt.style.color = col;   // color-code the option by its primary facet
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
  }
  // Reflect a loaded preset id in BOTH dropdowns: the full list shows it; the
  // curated list shows it only if it's a showcase preset (else its placeholder).
  function syncPresetDropdowns(id) {
    if (dom.runPresetSelect) dom.runPresetSelect.value = id || '';
    if (dom.selectedPresetSelect) {
      dom.selectedPresetSelect.value = (id && SHOWCASE_PRESET_IDS.indexOf(id) !== -1) ? id : '';
    }
  }

  function populateRunPresetSelect() {
    const ready = document.getElementById('pretrainedStart');
    const training = document.querySelector('.training-start');
    if (ready && training) training.before(ready);
    const throughput = document.getElementById('trainingThroughput');
    if (throughput) {
      const details = document.getElementById('trainingRuntimeDetails');
      for (const id of ['trainingSimSpeedRow', 'fullPowerRow', 'parallelEvalRow', 'useWasmEvalRow', 'workerBenchRow']) {
        const row = document.getElementById(id);
        if (row) {row.dataset.coreMode='training';throughput.insertBefore(row, details);}
      }
      for(const id of ['simSpeedTest','fullPowerModeTest','useWasmEvalTest']){
        const row=document.getElementById(id)?.closest('.control-row');
        if(row){row.dataset.coreMode='test';throughput.insertBefore(row,details);}
      }
      const testHeading=document.getElementById('coreTestRegion');if(testHeading)testHeading.hidden=true;
      const detailBody = details.querySelector('.runtime-details-body');
      for (const id of ['trainingSpeedHint', 'autoPeekRow', 'autoPeekIntervalRow', 'wasmExplain']) {
        const row = document.getElementById(id);
        if (row) detailBody.appendChild(row);
      }
      if (dom.coreRegion) dom.coreRegion.hidden = true;
    }
    const advanced = document.getElementById('advancedPresets');
    if (advanced) {
      for (const el of [document.querySelector('.compare-row'), document.getElementById('presetLegend'), document.getElementById('diffsimLabBtn')]) {
        if (el) advanced.appendChild(el);
      }
    }
    if (!dom.runPresetSelect) return;
    fillPresetSelect(dom.runPresetSelect);
    dom.runPresetSelect.addEventListener('change', () => {
      const id = dom.runPresetSelect.value;
      if (id) { loadRunPreset(id); syncPresetDropdowns(id); }
      else { renderPresetTags(''); syncPresetDropdowns(''); }
    });
    // Curated "Selected presets" dropdown: same loader, filtered to the
    // benchmark-verified flagships. Picking one also selects it in the full list.
    if (dom.selectedPresetSelect) {
      fillShowcaseSelect(dom.selectedPresetSelect);
      dom.selectedPresetSelect.addEventListener('change', () => {
        const id = dom.selectedPresetSelect.value;
        if (id) { loadRunPreset(id); syncPresetDropdowns(id); }
        else { renderPresetTags(''); syncPresetDropdowns(''); }
      });
    }
    // Compare-with select: same preset set + "(off)" sentinel. Picking
    // a preset spins up app.trainerB; picking "(off)" tears it down.
    if (dom.compareWithPresetSelect) {
      fillPresetSelect(dom.compareWithPresetSelect);
      dom.compareWithPresetSelect.addEventListener('change', () => {
        const id = dom.compareWithPresetSelect.value;
        if (id) startCompareTrainer(id);
        else    stopCompareTrainer();
      });
    }
    // Drift detection: any time a control that's part of a preset's
    // declarative state changes by the user (setup, mode, policy, obs,
    // objective, curriculum toggle), reset the preset dropdown back to
    // "(custom)" so the displayed selection accurately reflects what's
    // in effect. We listen to 'change' events because preset loading
    // sets values directly without dispatching 'change', so this only
    // fires on genuine user-initiated edits.
    const driftTriggers = [
      dom.setupSelect, dom.modeSelect, dom.policyTypeSelect,
      dom.dodgeObservationMode, dom.objectiveSelect,
      dom.curriculumOn,
    ];
    for (const el of driftTriggers) {
      if (el) el.addEventListener('change', markPresetCustom);
    }
    const sliderDriftTriggers = [
      dom.gravity, dom.damping, dom.tiltDeg, dom.cartAccel,
      dom.popSize, dom.rollouts,
      dom.dodgeSpawnRate, dom.dodgeBulletSpeed, dom.dodgeBulletRadius,
      dom.dodgeBulletsPerWave,
      dom.holeCenter, dom.holeWidth,
      dom.ballSpawnX, dom.ballSpawnY, dom.ballMass, dom.ballRadius,
      dom.ballRestitution,
      dom.curriculumConsec, dom.curriculumMaxLevel,
    ];
    for (const el of sliderDriftTriggers) {
      if (el) el.addEventListener('change', markPresetCustom);
    }
  }
  function markPresetCustom() {
    let changed = false;
    if (dom.runPresetSelect && dom.runPresetSelect.value !== '') { dom.runPresetSelect.value = ''; changed = true; }
    if (dom.selectedPresetSelect && dom.selectedPresetSelect.value !== '') { dom.selectedPresetSelect.value = ''; changed = true; }
    if (changed) renderPresetTags('');
  }
  populateRunPresetSelect();

  function setRangePreset(input, label, value, format) {
    if (!input || value == null) return;
    input.value = String(value);
    if (label) label.textContent = format ? format(value) : String(value);
  }

  function applySetupParamPreset(setupId) {
    const p = SETUP_PARAM_PRESETS[setupId];
    if (!p) return;
    if (dom.ballMode && p.ballMode != null) dom.ballMode.value = p.ballMode;
    setRangePreset(dom.ballSpawnX, dom.ballSpawnXVal, p.ballSpawnX, v => String(parseInt(v, 10)));
    setRangePreset(dom.ballSpawnY, dom.ballSpawnYVal, p.ballSpawnY, v => String(parseInt(v, 10)));
    setRangePreset(dom.ballMass, dom.ballMassVal, p.ballMass, v => parseFloat(v).toFixed(2));
    setRangePreset(dom.ballRadius, dom.ballRadiusVal, p.ballRadius, v => String(parseInt(v, 10)));
    setRangePreset(dom.ballRestitution, dom.ballRestitutionVal, p.ballRestitution, v => parseFloat(v).toFixed(2));
    setRangePreset(dom.holeCenter, dom.holeCenterVal, p.holeCenter, v => parseInt(v, 10) + ' px');
    setRangePreset(dom.holeWidth, dom.holeWidthVal, p.holeWidth, v => parseInt(v, 10) + ' px');
  }

  // Live physics feasibility check for the cart-accel slider. The minimum
  // acceleration that can HOLD a pendulum at angle θ is g·tan(θ); active
  // recovery (bringing it back to vertical, not just stopping the fall) needs
  // roughly 2× that. Swing-up (angles past ~80°) is a different regime — the
  // cart pumps energy rather than statically resisting gravity.
  // Hide rows that don't apply to the current setup. Reduces visual
  // noise for the user (e.g. tilt sliders are meaningless in dodge
  // mode where the agent moves freely on the playfield, not as a
  // cart-pole). Called from the setup-change handler. Keeps the rest
  // of the UI dynamic: if a row becomes relevant again (e.g. switching
  // back to pendulum from dodge), it reappears.
  function updateSetupVisibility(setupId) {
    const isDodge = setupId === 'dodge';
    // Chain controls (segments + material) apply to any chain setup; the curve
    // row is chain-trace-only.
    const isChain = (setupId === 'chain-reach' || setupId === 'chain-trace');
    const chainBlock = document.getElementById('chainParamsBlock');
    if (chainBlock) chainBlock.style.display = isChain ? '' : 'none';
    const chainCurveRow = document.getElementById('chainCurveRow');
    if (chainCurveRow) chainCurveRow.style.display = (setupId === 'chain-trace' || setupId === 'epicycle') ? '' : 'none';
    // Pendulum-family: tilt + tilt spread + tilt presets + tilt direction.
    // Dodge: none of these apply (agent moves freely; no pendulum
    // angle to start from).
    const tiltRows = [];
    if (dom.tiltDeg) tiltRows.push(dom.tiltDeg.closest('.control-row'));
    if (dom.tiltSpreadDeg) tiltRows.push(dom.tiltSpreadDeg.closest('.control-row'));
    if (dom.tiltDirection) tiltRows.push(dom.tiltDirection.closest('.control-row'));
    // The preset chip row has its own class.
    const tiltPresets = document.querySelector('.tilt-presets-row');
    if (tiltPresets) tiltRows.push(tiltPresets);
    for (const row of tiltRows) {
      if (row) row.style.display = isDodge ? 'none' : '';
    }
  }

  // Number of pendulum links for the current setup. The g·tan(θ) feasibility
  // estimate below is the SINGLE point-mass result; multi-link pendulums need
  // more cart authority (coupled inertia + faster unstable modes), so the
  // estimate is scaled by this count.
  function pendulumLinkCount(setupId) {
    if (setupId === 'chain-reach' || setupId === 'chain-trace') {
      return (dom.chainNumSegments && parseInt(dom.chainNumSegments.value, 10)) || 4;
    }
    return ({ single: 1, spring: 1, twin: 2, double: 2, triple: 3, 'spring-flail': 3 })[setupId] || 1;
  }

  function updateCartAccelHint() {
    if (!dom.cartAccelHint) return;
    const mode = (dom.cartControlMode && dom.cartControlMode.value) || 'accel';
    // Velocity mode bypasses the accel limit entirely — gray out the slider
    // and tell the user the limit doesn't apply.
    if (mode === 'velocity') {
      dom.cartAccel.classList.add('disabled-soft');
      dom.cartAccelHint.innerHTML =
        `<span class="info">⚡ direct velocity mode — accel limit is bypassed; problem is artificially easier</span>`;
      return;
    }
    dom.cartAccel.classList.remove('disabled-soft');
    // Force mode: cartAccel IS the applied-force scale (meaningful), and
    // there is no speed cap — a terminal velocity emerges from drag.
    // NOTE the cart also feels the global `damping` knob (it always did
    // in this engine), so the true steady-state speed is
    //   v* = cartAccel·dt / (damping + cartDrag·dt),  dt = physicsDt
    // not the naive cartAccel/cartDrag. Report the accurate figure.
    if (mode === 'force') {
      const accelF = parseFloat(dom.cartAccel.value);
      const dragF = parseFloat(dom.cartDrag && dom.cartDrag.value) || 0;
      if (dragF <= 0) {
        dom.cartAccelHint.innerHTML =
          `<span class="warn">⚙ force mode, cartDrag = 0 — speed limited only by the global damping knob + a far-off numerical safety guard. Set a drag &gt; 0 for a snappy physical speed limit.</span>`;
      } else {
        const dtP = 1 / 120; // physicsDt (fixed in defaultParams)
        const dampF = parseFloat(dom.damping && dom.damping.value) || 0;
        const vt = Math.round((accelF * dtP) / (dampF + dragF * dtP));
        const tau = (1 / (dragF + dampF / dtP)).toFixed(3);
        dom.cartAccelHint.innerHTML =
          `<span class="ok">⚙ force mode — emergent terminal velocity ≈ <strong>${vt}</strong> px/s (no hard cap; set by drag + the damping knob), response time constant ≈ ${tau}s</span>`;
      }
      return;
    }
    const accel = parseFloat(dom.cartAccel.value);
    const gravity = parseFloat(dom.gravity.value);
    const range = currentTiltRad();
    const angleDeg = Math.round(range * 180 / Math.PI);
    // Setup-aware branch: for ball-strike / golf-family setups the cart's
    // role is to whip the bob into the ball, not to resist gravity at the
    // tilt set by the difficulty slider. Hold/recover thresholds don't
    // apply — what matters is whether the cart can develop enough swing
    // kinetic energy to launch the ball, and whether it'll saturate
    // cartMaxSpeed before the rollout window closes.
    const setupId = (dom.setupSelect && dom.setupSelect.value) || '';
    const isBallStrike = setupId === 'ball-single' || setupId === 'golf' || setupId === 'golf-challenge' || setupId === 'putt';
    if (isBallStrike) {
      // Rough physics: for a half-swing, peak bob tip speed ≈ √(2·a·L) where
      // L is the rod length (~85 px for golf/putt). Want a comparable to
      // gravity so the cart can pump useful kinetic energy across one swing
      // arc. Tilt at start is initial-condition variation here, NOT a
      // difficulty setpoint, so we explicitly call that out.
      const swingMin = gravity * 1.0;
      const swingComfortable = gravity * 2.0;
      const maxSpeed = parseFloat(dom.cartMaxSpeed && dom.cartMaxSpeed.value) || 600;
      // Saturation accel scales with the speed cap: a higher cartMaxSpeed
      // means the cart can keep accelerating usefully for longer before
      // it tops out, so the "diminishing returns" knee moves up with it.
      const speedSatAccel = gravity * 4.5 * (maxSpeed / 600);
      if (accel < swingMin) {
        dom.cartAccelHint.innerHTML =
          `<span class="bad">⛔ ${accel} too low for ball-strike — bob can't swing fast enough to launch the ball. Needs ≥ ${Math.ceil(swingMin/100)*100} for any useful tip speed.</span>`;
      } else if (accel < swingComfortable) {
        dom.cartAccelHint.innerHTML =
          `<span class="warn">⚠ ${accel} is marginal for ball-strike — the bob will contact the ball but launch speed will be limited. ≥ ${Math.ceil(swingComfortable/100)*100} recommended for distance shots. <em>Initial tilt here is start-condition variety, not a difficulty knob.</em></span>`;
      } else if (accel >= speedSatAccel) {
        dom.cartAccelHint.innerHTML =
          `<span class="info">${accel} has plenty of headroom — past ~${Math.ceil(speedSatAccel/100)*100} the cart hits cartMaxSpeed=${maxSpeed} quickly, so further accel buys diminishing returns.</span>`;
      } else {
        dom.cartAccelHint.innerHTML =
          `<span class="ok">✓ ${accel} has headroom for ball-strike. Initial tilt here is start-condition variety, not a difficulty knob.</span>`;
      }
      return;
    }

    // Multi-link scaling. The g·tan(θ) baseline is the SINGLE point-mass
    // result; a double/triple pendulum needs more cart authority (coupled
    // inertia + faster unstable modes). Scale the thresholds by link count and,
    // for the unstable regimes, flag the velocity-control approximation: a very
    // high accel + drag makes the cart snap to its terminal speed near-instantly
    // (fast reversals), mimicking direct velocity control -- which is why the
    // multi-link swing-up presets run accel up to 40000.
    const nLinks = pendulumLinkCount(setupId);
    const multiNote = nLinks > 1
      ? ` <em>(${nLinks}-link: the single-link g·tanθ figure is a LOWER bound — coupled inertia needs more, and unstable multi-link control benefits from much higher accel, where fast reversals approximate direct velocity control. The multi-link swing-up presets use up to 40000.)</em>`
      : '';

    // Treat anything past ~80° as a swing-up regime — tan blows up and the
    // controller's challenge changes from "resist gravity" to "build energy".
    // Swing-up genuinely needs more force than just g-equivalent: the cart has
    // to pump energy *into* the system across multiple swings, AND the GA has
    // to find a non-trivial open-loop-ish control sequence (not just a
    // feedback law), so convergence is slow regardless of accel.
    if (range > 1.4) {
      const swingMin = gravity * 1.2 * nLinks;        // below this, can't even pump
      const swingComfortable = gravity * 2.5 * nLinks; // above this, has real headroom (a lower bound for N>1)
      if (accel < swingMin) {
        dom.cartAccelHint.innerHTML =
          `<span class="bad">⛔ swing-up needs accel ≳ ${Math.ceil(swingMin/100)*100} just to pump energy; ${accel} can't escape the hanging well.${multiNote}</span>`;
      } else if (accel < swingComfortable) {
        dom.cartAccelHint.innerHTML =
          `<span class="warn">⚠ ${accel} is marginal for swing-up; ≳ ${Math.ceil(swingComfortable/100)*100} recommended. Either way, expect many hundreds of generations.${multiNote}</span>`;
      } else {
        dom.cartAccelHint.innerHTML =
          `<span class="ok">✓ ${accel} has headroom for swing-up — still expect slow convergence.${multiNote}</span>`;
      }
      return;
    }

    const hold = gravity * Math.tan(range) * nLinks;
    const recover = hold * 2;
    if (accel < hold) {
      dom.cartAccelHint.innerHTML =
        `<span class="bad">⛔ ${accel} cannot even HOLD ±${angleDeg}° — the pendulum will fall regardless of policy. Needs ≥ ${Math.ceil(hold/100)*100}.${multiNote}</span>`;
    } else if (accel < recover) {
      dom.cartAccelHint.innerHTML =
        `<span class="warn">⚠ ${accel} can hold ±${angleDeg}° but recovery is borderline. ≥ ${Math.ceil(recover/100)*100} recommended.${multiNote}</span>`;
    } else {
      dom.cartAccelHint.innerHTML =
        `<span class="ok">✓ ${accel} px/s² has headroom for ±${angleDeg}° recovery.${multiNote}</span>`;
    }
  }

  // Resolve the seed for a new trainer construction. The seed is
  // ALWAYS auto-generated (read-only display); the user copies it
  // via the adjacent copy button if they want to record what
  // produced the current trajectory. Generated in [1, 2^31) — we
  // avoid 0 because the display placeholder "seed" reads visually
  // as "unset" and 0 would render the same.
  function resolveSeed() {
    const s = (Math.floor(Math.random() * 0x7FFFFFFE) + 1) | 0;
    if (dom.seedInput) dom.seedInput.value = String(s);
    return s;
  }

  // Derive a display RNG from the trainer seed. Display animations
  // (test-mode start angles, push schedules visible in the live sim)
  // should be reproducible alongside training, but must NOT share an
  // RNG sequence with training — otherwise calling them an extra
  // time would shift the training trajectory. We XOR with a constant
  // mask per use-case to give each display source its own seeded
  // sub-stream.
  function makeDisplayRng(mask) {
    const base = (app.trainer && Number.isFinite(app.trainer.seed)) ? app.trainer.seed : 0;
    return BF.util.makeRng((base ^ mask) >>> 0);
  }

  // ---- Per-setup observation MODE -------------------------------------
  // A setup whose observation WIDTH is selected by a named mode owns one
  // trainer-param key naming that mode. This map is the single place the app
  // has to look to answer "which param carries this setup's encoding?", so
  // the four call sites that flip the shared setup singleton (the pre-build
  // sync, compare-mode start, and both sides of the compare step loop) cannot
  // drift apart -- the failure they used to risk is silent: an unrecognised
  // mode leaves the PREVIOUS mode in place and two "different" encodings then
  // train identically.
  const SETUP_OBS_MODE_PARAM = {
    'dodge':       'dodgeObservationMode',
    'terrain-run': 'terrainObservationMode',
    'double':     'pendulumObservationMode',
    'triple':     'pendulumObservationMode',
  };
  // Apply `params`' observation mode to `setup` and return the RE-RESOLVED
  // observationCount (null when the setup has no mode / the params carry
  // none). Callers that care about genome width assert on the return value.
  function applySetupObsMode(setup, setupId, params) {
    const key = SETUP_OBS_MODE_PARAM[setupId];
    if (!key || !setup || typeof setup.setObservationMode !== 'function') return null;
    const mode = params && params[key];
    if (!mode) return null;
    setup.setObservationMode(mode);
    return setup.observationCount;
  }

  // Sync any setup-mutable observation count from the UI BEFORE the
  // trainer is constructed/rebuilt. dodge reads its own dropdown; terrain-run
  // has no DOM control, so its encoding comes from the preset stash. Setups
  // with neither are no-ops.
  function syncSetupObservationCounts() {
    if (dom.dodgeObservationMode) {
      const setup = BF.setups.getSetup('dodge');
      if (setup && setup.setObservationMode) {
        setup.setObservationMode(dom.dodgeObservationMode.value);
      }
    }
    // terrain-run: 50 (summary) / 198 (patch) / 242 (both) inputs. This is the
    // seam that makes "world width == genome width" true for this setup; the
    // trainer is built from setup.observationCount immediately after.
    // Applied UNCONDITIONALLY: with no preset override we pass null, which the
    // setup's own resolver normalises back to its default encoding. Doing it
    // only when an override exists would leave the singleton stuck on the last
    // preset's 198-wide 'patch' after the user switches away.
    {
      const terr = BF.setups.getSetup('terrain-run');
      if (terr && typeof terr.setObservationMode === 'function') {
        terr.setObservationMode(
          (presetOverridesApply() && app.terrainOverride
            && app.terrainOverride.terrainObservationMode) || null);
      }
    }
    // Signed angular rates are opt-in; archived policies retain their old width.
    for (const id of ['double', 'triple']) {
      const dp = BF.setups.getSetup(id);
      if (dp && dp.setObservationMode) dp.setObservationMode(
        presetOverridesApply() ? app.pendulumObservationMode : 'legacy');
    }
    // Single pendulum: 'full' vs 'blind-dropout'. The WIDTH is 6 either way,
    // so this is not a genome-sizing seam — but the setup singleton is what
    // observationLabels/observationAbbr read (so the Network panel names the
    // fresh-flag channel correctly) and what buildWorld falls back to when an
    // opts override is absent. Applied UNCONDITIONALLY, like terrain-run's:
    // doing it only when the mode is 'blind-dropout' would leave the singleton
    // stuck in dropout after the user switches back to 'full'.
    {
      const sp = BF.setups.getSetup('single');
      if (sp && typeof sp.setObservationMode === 'function') {
        sp.setObservationMode(
          dom.singleObservationMode ? dom.singleObservationMode.value : 'full',
          { dropoutK: dom.singleDropoutK ? (parseInt(dom.singleDropoutK.value, 10) || 1) : 4 });
      }
    }
    const chainSeg = document.getElementById('chainNumSegments');
    const curSetupId = dom.setupSelect ? dom.setupSelect.value : '';
    if (chainSeg && (curSetupId === 'chain-reach' || curSetupId === 'chain-trace')) {
      const chainSetup = BF.setups.getSetup(curSetupId);
      if (chainSetup && chainSetup.setObservationShape) {
        chainSetup.setObservationShape({
          numSegments: parseInt(chainSeg.value, 10),
          // Lookahead is an OBSERVATION-SHAPE flag (+4 inputs → genome
          // dimension). Sourced from the preset stash; passing it here keeps
          // the genome sized right on every rebuild. chain-reach ignores it.
          lookahead: !!app.chainTraceLookaheadOverride,
        });
      }
      // Action shape: numActuatedJoints → actionCount = 1 + clamp(k, 0, N-1).
      // MUST run AFTER setObservationShape (which sets the numSegments that
      // setActionShape clamps against) and BEFORE the trainer is built (genome
      // sizing reads setup.actionCount). This is the load-bearing wire that
      // makes closed-loop neural under joint actuation train end-to-end; it also
      // sets this.numActuatedJoints, which the rollout buildWorld falls back to.
      const chainAct = document.getElementById('chainNumActuated');
      const chainTel = document.getElementById('chainTelescope');
      if (chainSetup && chainSetup.setActionShape) {
        chainSetup.setActionShape({
          numActuatedJoints: chainAct ? (parseInt(chainAct.value, 10) || 0) : 0,
          // Telescoping (chain-trace only; other chain setups ignore the flag):
          // adds numSegments length actions on top of cart + joints.
          telescope: chainTel ? !!chainTel.checked : false,
        });
      }
    }
    // Epicycle signer: the ARM COUNT sizes both the observation (2 per arm)
    // and, in 'rate' drive, the action vector — so it must reach the same
    // setObservationShape/setActionShape seam BEFORE the trainer is built, or
    // the genome and the world disagree about how many arms exist. The value
    // comes from the trainer params (preset / epiArms), falling back to the
    // measured per-curve recommendation in curve_fourier.js.
    if (curSetupId === 'epicycle') {
      const epi = BF.setups.getSetup('epicycle');
      const tp = (app.trainer && app.trainer.params) || {};
      // Source of truth = app.epicycleOverride, the SAME stash readParams reads,
      // with the previous trainer's params only as a fallback. Reading
      // app.trainer.params alone was an ordering trap: syncSetupObservationCounts
      // runs BEFORE makeTrainer in buildAll, so on the first rebuild after a
      // preset load the trainer still holds the PREVIOUS preset's arm count —
      // the setup singleton would be sized for the old machine while the world
      // gets built for the new one, and the arm count would only settle on a
      // second rebuild. This is the arm-count control path; it has to be right
      // the first time.
      const ov = app.epicycleOverride || {};
      const curveId = (dom.chainCurve && dom.chainCurve.value) || tp.curveId || 'autograph';
      const reco = BF.curveFourier ? BF.curveFourier.recommend(curveId) : { N: 8 };
      const numArms = (ov.epiArms != null) ? ov.epiArms
                    : (tp.epiArms != null) ? tp.epiArms
                    : reco.N;
      const drive = ov.epiDrive || tp.epiDrive || 'analytic';
      const telescope = (ov.epiTelescope != null) ? !!ov.epiTelescope : !!tp.epiTelescope;
      if (epi && epi.setObservationShape) epi.setObservationShape({ numArms: numArms });
      if (epi && epi.setActionShape) {
        epi.setActionShape({ numArms: numArms, drive: drive, telescope: telescope });
      }
    }
  }
  // ---- Build trainer + display state for the current setup ----
  function buildAll() {
    const setupId = dom.setupSelect.value;
    syncSetupObservationCounts();
    if (!app.trainer || app.trainer.setupId !== setupId) {
      const params = readParams();
      app.trainer = T.makeTrainer({
        setupId: setupId,
        seed: resolveSeed(),
        params: params.train,
        mutationParams: params.mut,
      });
    }
    rebuildDisplayState();
    syncTrainerParams();
  }

  // Return the value of a curriculum-able param that the trainer would
  // ACTUALLY use right now — accounts for the curriculum overlay, so
  // when a `holeWidth` spec is active and the level is at 3/10, this
  // returns the value at fraction 0.3 instead of the user's slider
  // value. Falls back to trainer.params[key] when no spec applies.
  // Used by rebuildDisplayState (so the visible canvas matches the
  // physics rollouts) AND by updateHolePreview (so the panel preview
  // shows what's really in use). Without this, the slider's static
  // value gets shown three different ways: as the slider's `.value`,
  // as the rendered floor, and as the trainer's actual rollout
  // hole — and they could all disagree if curriculum was on.
  // Mirrors trainer.effectiveMaxLevel — the level cap extends to the
  // largest spec.steps so a spec with steps=20 inside a maxLevel=10
  // trainer can still reach its destination.
  function curriculumEffectiveMax(tp) {
    const userMax = (tp.curriculumMaxLevel | 0) || 10;
    // Phase-aware: total ramp = sum of phase max-steps. Each phase's
    // count is max(spec.steps) within that phase (specs run in
    // parallel within a phase); phases run sequentially. Mirrors
    // trainer.js's effectiveMaxLevel so the HUD's denominator matches
    // the trainer's actual ramp length. Before this, the HUD said
    // "level 4/4" the moment Phase 1 finished, even though Phase 2
    // (or 3 or 4) still had its own steps to go.
    if (BF.trainer && BF.trainer.computeCurriculumPhases) {
      const { phaseMaxSteps } = BF.trainer.computeCurriculumPhases(
        tp.curriculumSpecs || [], userMax,
      );
      let specMax = 0;
      for (const n of phaseMaxSteps) specMax += n;
      return Math.max(1, Math.max(userMax, specMax));
    }
    // Fallback (trainer module not loaded yet): parallel-ramping max.
    let specMax = 0;
    for (const s of (tp.curriculumSpecs || [])) {
      if (s && s.steps != null) {
        const n = s.steps | 0;
        if (n > specMax) specMax = n;
      }
    }
    return Math.max(1, Math.max(userMax, specMax));
  }

  // Copy the terrain-run knobs from the trainer params onto a buildWorld opts
  // object, so the DISPLAYED course is the one training is actually running.
  //
  // The key list is read from the setup's own paramKeys map (the same table
  // trainer.js's instantiateSetup resolves through), never retyped here: a
  // terrain knob added to setups.js reaches the live view with no edit in this
  // file. Values go through A() so a curriculum spec that ramps a terrain knob
  // ramps the preview too, exactly like gravity / reachRadius above.
  //
  // terrainSeed is deliberately NOT set: the display falls back to the run
  // seed, which keeps the shown course stable while training re-seeds it per
  // rollout (see the terrainSeed note in trainer.js).
  function applyTerrainDisplayOpts(opts, setup, tp, A) {
    if (!setup || setup.id !== 'terrain-run') return opts;
    opts.terrainDifficulty = tp.terrainDifficulty;
    opts.terrainObservationMode = tp.terrainObservationMode;
    const keys = setup.paramKeys;
    if (keys) {
      for (const k in keys) {
        const v = A(k);
        if (v != null) opts[k] = v;
      }
    }
    return opts;
  }

  function appliedCurriculumParam(tp, key) {
    // Spec lookup FIRST — mirroring the trainer's resolved(), which checks
    // the curriculum overlay before falling back to trainer.params[key].
    // The old order early-returned when tp[key] was null, so a spec-covered
    // knob with NO base param (reachRadius has no slider → readParams never
    // sets it) rendered at the setup default while training ramped it:
    // "curriculum level says 10 but the circle never shrank".
    const spec = (tp.curriculumEnabled && tp.curriculumSpecs)
      ? tp.curriculumSpecs.find(s => s && s.paramKey === key)
      : null;
    if (!spec) return tp[key];
    // In diffsim mode the FACADE trainer's curriculum never advances (its
    // T.step doesn't run), so its level is stuck at 0 and the spec editor would
    // show the initial value forever even as the diffsim curriculum ramps. Read
    // the diffsim run's actual level instead so the left "CURRICULUM RAMPS"
    // panel matches the right GA-STATE panel.
    const lvl = (typeof isDiffsimMode === 'function' && isDiffsimMode()
                 && app.diffsimRun && app.diffsimRun.cur)
      ? app.diffsimRun.cur.level
      : ((app.trainer && app.trainer.curriculum && app.trainer.curriculum.level) || 0);
    // Phase-aware: mirror trainer.js's computeCurriculumOverlay so the
    // preview's "current applied value" matches what the trainer is
    // actually grading against. Earlier phases ramp first; later
    // phases stay at `from` until their phase starts. Without this,
    // the trainer correctly phased the ramps but the UI showed all
    // params changing in parallel -- the user saw "all params still
    // change at the same time" even though training behavior was
    // correct.
    if (BF.trainer && BF.trainer.computeCurriculumPhases) {
      // Match trainer.js's defaultSteps so the preview's phase
      // boundaries line up exactly with what the trainer is using.
      const defaultSteps = (tp.curriculumMaxLevel | 0) || 10;
      const { phases, cumStart, phaseMaxSteps } =
        BF.trainer.computeCurriculumPhases(tp.curriculumSpecs, defaultSteps);
      for (let p = 0; p < phases.length; p++) {
        if (phases[p].indexOf(spec) === -1) continue;
        const phaseStart = cumStart[p];
        const phaseEnd   = phaseStart + phaseMaxSteps[p];
        let frac;
        if (lvl <= phaseStart) frac = 0;
        else if (lvl >= phaseEnd) frac = 1;
        else {
          const specSteps = Math.max(1, (spec.steps | 0) || phaseMaxSteps[p]);
          frac = Math.min(1, (lvl - phaseStart) / specSteps);
        }
        return BF.trainer.curriculumApply(spec, frac);
      }
    }
    // Fallback: pre-phase parallel ramping (no phases set, or the
    // phases helper isn't available for some reason).
    const fallbackMax = curriculumEffectiveMax(tp);
    const specSteps = Math.max(1, (spec.steps | 0) || fallbackMax);
    const frac = Math.min(1, lvl / specSteps);
    return BF.trainer.curriculumApply(spec, frac);
  }
  // Random hole-center offset for the DISPLAY, so Test/preview shows the moving
  // hole. Recomputed each rollout (each rebuildDisplayState call advances the RNG)
  // -> the hole lands somewhere new each attempt, matching the per-rollout jitter
  // training uses. 0 (no shift) when the toggle is off or the magnitude is 0.
  function displayHoleJitter(tp) {
    if (!tp || !tp.holeCenterJitterOn) return 0;
    const mag = Math.max(0, appliedCurriculumParam(tp, 'holeCenterJitterMag') || 0);
    if (mag <= 0) return 0;
    if (!app._holeDisplayRng) app._holeDisplayRng = makeDisplayRng(0x3F2A11C7 | 0);
    // .next() — makeRng returns an RNG OBJECT. Calling it as a function was
    // the putt-moving-hole killer: a TypeError from every rebuildDisplayState
    // once the jitter toggle was on, which took down BOTH the training loop
    // (unhandled rejection with app.training stuck true → Train inert) and
    // the rAF loop (frame never re-armed → frozen canvas, "hangs after one
    // test"), and — via the leaked checkbox — every preset loaded afterwards.
    return (app._holeDisplayRng.next() * 2 - 1) * mag;
  }

  function rebuildDisplayState(angleOverride) {
    const setup = BF.setups.getSetup(app.trainer.setupId);
    // Capture the peak live-preview fitness from the rollout we're
    // about to discard — so the user can see "this rollout scored X"
    // alongside the GA's "best ever scored Y". When the two diverge
    // (preview says 45 sunk-ball, best-ever says 14.6) it tells the
    // user the agent IS capable of solving but the trainer isn't
    // catching it. Without this readout the user has no way to
    // square the visual GOAL! flash with the stuck fitness number.
    //
    // Peak is PER-AGENT, not session-wide. Without this guard, a long-
    // dead lineage that scored 64 once would keep showing as the
    // "peak" even after mutation churned through dozens of generations
    // of weaker successors — misleading the user about the CURRENT
    // best agent's actual capability. We track which genome the peak
    // was earned by and reset when the trainer's current-best genome
    // changes.
    const currentGenome = app.trainer
      ? (app.testing ? app.trainer.bestEver : app.trainer.currentBest)
      : null;
    const sameAgent = (app._peakOwnerGenome === currentGenome);
    if (sameAgent && app.showState && app.showState.liveFitness != null) {
      const finalFit = app.showState.liveFitness;
      if (app.peakLivePreviewFitness == null || finalFit > app.peakLivePreviewFitness) {
        app.peakLivePreviewFitness = finalFit;
        app.peakLivePreviewAngle = app.showState.startAngle;
        app.peakLivePreviewSunk = !!(app.showState.ball && app.showState.ball.sunk);
      }
    } else if (!sameAgent) {
      // New agent (or first rollout) — reset peak so it reflects only
      // the current agent's rollouts, not a since-replaced lineage.
      app.peakLivePreviewFitness = null;
      app.peakLivePreviewAngle = null;
      app.peakLivePreviewSunk = false;
      app._peakOwnerGenome = currentGenome;
      // Restart the preview's angle-cycle so the new agent's first
      // rollout lands on index 0 (after the +1 wrap below).
      app._previewAngleIdx = -1;
    }
    // Reset cached display RNGs only when the run seed changes. Re-seeding on
    // every display rebuild made test-mode trials reuse the same first random
    // angle/push schedule over and over, so "randomized" test appeared frozen.
    const displaySeed = (app.trainer && Number.isFinite(app.trainer.seed)) ? app.trainer.seed : 0;
    if (app._displayRngSeed !== displaySeed) {
      app._displayRngSeed = displaySeed;
      app._testAngleRng = null;
      app._displayAngleRng = null;
      app._pushDisplayRng = null;
      app._pushTickRng = null;
      app._holeDisplayRng = null;   // hole-jitter display stream re-seeds with the run too
    }
    let startAngle;
    if (angleOverride != null) {
      startAngle = angleOverride;
    } else if (app.testing) {
      // Test mode picks a random start angle from the CURRENT tilt
      // range. "Current" honors the curriculum: if a startTiltDeg /
      // startAngleRange spec is mid-ramp, use its applied value; if
      // the spec has finished, applied = `to` = the user's slider, so
      // the test naturally lands on the final destination tilt. Without
      // this, stopping training mid-curriculum and pressing Test would
      // jump straight to the destination tilt and grade the agent
      // against conditions it was never actually trained on.
      // Direction filter biases the sample to one side of vertical.
      const tpTest = app.trainer.params;
      let testRange = (tpTest.startAngleRange != null) ? tpTest.startAngleRange : currentTiltRad();
      if (tpTest.curriculumEnabled && tpTest.curriculumSpecs) {
        const hasRangeSpec   = tpTest.curriculumSpecs.some(s => s && s.paramKey === 'startAngleRange');
        const hasTiltDegSpec = tpTest.curriculumSpecs.some(s => s && s.paramKey === 'startTiltDeg');
        if (hasRangeSpec) {
          const v = appliedCurriculumParam(tpTest, 'startAngleRange');
          if (v != null) testRange = v;
        }
        if (hasTiltDegSpec) {
          const v = appliedCurriculumParam(tpTest, 'startTiltDeg');
          if (v != null) testRange = v * Math.PI / 180;
        }
      }
      // Pin to the boundary (mirroring training preview's rolls=1
      // case) so the slider value IS the start angle. The old code
      // sampled uniformly in [-range, +range], which means at
      // range=180 the rollouts spanned the whole circle -- mostly NOT
      // "pointing down" as the slider description ("180° = full swing-
      // up start") implies. Direction=both alternates sign randomly so
      // -180/+180 both render as pointing-down (same physical pose),
      // but smaller ranges get an honest left/right mix.
      // Spread jitter: deterministic ±range becomes ±range + uniform(
      // -spread, +spread) when the user (or curriculum) sets a non-
      // zero startTiltSpreadDeg. spread=0 keeps the old "single
      // starting pose" behavior.
      let testSpread = (tpTest.startTiltSpreadDeg != null
        ? tpTest.startTiltSpreadDeg : 0) * Math.PI / 180;
      if (tpTest.curriculumEnabled && tpTest.curriculumSpecs
          && tpTest.curriculumSpecs.some(s => s && s.paramKey === 'startTiltSpreadDeg')) {
        const v = appliedCurriculumParam(tpTest, 'startTiltSpreadDeg');
        if (v != null) testSpread = v * Math.PI / 180;
      }
      if (!app._testAngleRng) app._testAngleRng = makeDisplayRng(0xA8C61E07);
      const testJitter = testSpread > 0
        ? (app._testAngleRng.next() * 2 - 1) * testSpread : 0;
      const dir = dom.tiltDirection ? dom.tiltDirection.value : 'both';
      if (dir === 'left')       startAngle = -testRange + testJitter;
      else if (dir === 'right') startAngle =  testRange + testJitter;
      else {
        const sign = app._testAngleRng.next() < 0.5 ? -1 : 1;
        startAngle = sign * testRange + testJitter;
      }
    } else {
      // Match training conditions exactly: cycle through the SAME fixed
      // angle set the trainer uses per gen (deterministic linspace from
      // -mag to +mag, or random side × mag for rollouts=1). What the
      // user sees in preview IS what the trainer is grading the agent
      // on — no determinism gap, no cherry-picked angle.
      //
      // Critical: apply curriculum ramping to the angle MAGNITUDE here
      // exactly the way trainer.js's getAnglesForGen + instantiateSetup
      // do. Without this the preview always renders at the user's
      // TARGET tilt while the trainer is grading at the much smaller
      // ramped tilt -- the "ghosts have wrong starting angle"
      // inconsistency. Priority order matches the trainer:
      //   tp.startAngleRange -> curriculum.startAngleRange (rad)
      //                       -> curriculum.startTiltDeg (deg)
      const tp = app.trainer.params;
      let range = (tp.startAngleRange != null) ? tp.startAngleRange : 0.1;
      if (tp.curriculumEnabled && tp.curriculumSpecs) {
        const hasRangeSpec   = tp.curriculumSpecs.some(s => s && s.paramKey === 'startAngleRange');
        const hasTiltDegSpec = tp.curriculumSpecs.some(s => s && s.paramKey === 'startTiltDeg');
        if (hasRangeSpec) {
          const v = appliedCurriculumParam(tp, 'startAngleRange');
          if (v != null) range = v;
        }
        if (hasTiltDegSpec) {
          const v = appliedCurriculumParam(tp, 'startTiltDeg');
          if (v != null) range = v * Math.PI / 180;
        }
      }
      const dir = tp.tiltDirection || 'both';
      const rolls = Math.max(1, tp.rolloutsPerAgent | 0);
      // One-sided directions never sample the upright (0) start: span
      // from full-magnitude on the chosen side to range/rolls on the
      // same side. Mirrors the trainer's per-gen angle generator so the
      // preview shows exactly what the agent is being graded on.
      const lo = dir === 'right' ? range / Math.max(1, rolls)
               : dir === 'left'  ? -range
               :                   -range;
      const hi = dir === 'left'  ? -range / Math.max(1, rolls)
               : dir === 'right' ?  range
               :                    range;
      // Build the same fixed angle set the trainer uses.
      const presetAngles = [];
      if (rolls === 1) {
        if (dir === 'left')       presetAngles.push(-range);
        else if (dir === 'right') presetAngles.push(range);
        else {
          // 'both' — random sign each preview rollout, mirroring trainer
          if (!app._displayAngleRng) app._displayAngleRng = makeDisplayRng(0x12C9_E347 | 0);
          const sign = app._displayAngleRng.next() < 0.5 ? -1 : 1;
          presetAngles.push(sign * range);
        }
      } else if (rolls === 2) {
        presetAngles.push(lo, hi);
      } else {
        for (let r = 0; r < rolls; r++) {
          const t = r / (rolls - 1);
          presetAngles.push(lo + (hi - lo) * t);
        }
      }
      // Cycle through the angles across successive preview rollouts so
      // the user actually SEES the full evaluation profile (not just one
      // sweet spot). Index resets when the agent changes.
      app._previewAngleIdx = ((app._previewAngleIdx | 0) + 1) % presetAngles.length;
      startAngle = presetAngles[app._previewAngleIdx];
      // Add curriculum-aware spread jitter so preview matches the
      // trainer's center+spread sampling. When spread=0, jitter=0 and
      // startAngle stays on the deterministic preset.
      let pSpread = (tp.startTiltSpreadDeg != null
        ? tp.startTiltSpreadDeg : 0) * Math.PI / 180;
      if (tp.curriculumEnabled && tp.curriculumSpecs
          && tp.curriculumSpecs.some(s => s && s.paramKey === 'startTiltSpreadDeg')) {
        const v = appliedCurriculumParam(tp, 'startTiltSpreadDeg');
        if (v != null) pSpread = v * Math.PI / 180;
      }
      if (pSpread > 0) {
        if (!app._displayAngleRng) app._displayAngleRng = makeDisplayRng(0x12C9_E347 | 0);
        startAngle += (app._displayAngleRng.next() * 2 - 1) * pSpread;
      }
    }
    if (angleOverride == null) startAngle = BF.util.clampStartAngle(startAngle, dom.tiltDirection?.value);
    const tp = app.trainer.params;
    // Use the curriculum-aware applied value for every curriculum-able
    // knob so the visible canvas EXACTLY MATCHES what the trainer's
    // rollouts use (instantiateSetup also calls resolved() for these).
    // Without this, the display rendered the user's slider value while
    // the trainer ramped a different value, and the user saw a hole
    // that didn't match what training was actually solving against.
    const A = (k) => appliedCurriculumParam(tp, k);
    const worldOpts = {
      gravity: A('gravity'),
      physicsDt: tp.physicsDt,
      pendulumInitialState: tp.pendulumInitialState,
      pendulumInitialStateSpread: tp.pendulumInitialStateSpread,
      initialStateRng: app._testAngleRng || app._displayAngleRng,
      pendulumRailHalfWidth: tp.pendulumRailHalfWidth,
      // Chain-reach target-ease: same curriculum-applied accessor as gravity so
      // the live preview's target follows the ramp during training. Other
      // setups ignore it; chain-reach buildWorld defaults it to 1 (hard) when
      // absent (e.g. tp.targetEase unset → A returns undefined → hard target).
      targetEase: A('targetEase'),
      damping: A('damping'),
      cartAccel: A('cartAccel'),
      cartControlMode: tp.cartControlMode || 'accel',
      cartWallsEnabled: tp.cartWallsEnabled !== false,
      cartMaxSpeed: A('cartMaxSpeed'),
      cartDrag: A('cartDrag'),
      uprightAssist: A('uprightAssist'),
      jointDamping: A('jointDamping'),
      startAngle: startAngle,
      // Chain-reach setup reads these. Ignored for non-chain setups.
      numSegments: tp.numSegments,
      material: tp.material,
      // Joint control mode (torque|servo) so the on-canvas chain actuates the
      // same way training does (numActuatedJoints comes via the setup-instance
      // single-source fallback). Without this the display defaults to 'torque'
      // even when servo is picked — a display/training divergence (Track-C).
      jointControlMode: tp.jointControlMode,
      // Chain-trace setup reads these. Ignored for non-chain-trace setups.
      curveId: tp.curveId,
      tracePeriod: tp.tracePeriod,
      traceRadius: A('traceRadius'),
      traceAcceptRadius: A('traceAcceptRadius'),   // signing accepting-radius curriculum (display parity)
      traceCenterY: A('traceCenterY'),             // manual placement override (0 = auto); display parity
      traceCenterX: tp.traceCenterX, traceCenterMode: tp.traceCenterMode,
      chainPaint: tp.chainPaint,                   // signing paint/coverage mode (display parity)
      chainStroke: tp.chainStroke,                 // signing stroke mode (display parity)
      strokeLiftRatio: tp.strokeLiftRatio,         // stroke-mode hysteresis (display parity)
      chainOrdered: tp.chainOrdered,               // signing in-order mode (display parity)
      orderedRequiredFrac: A('orderedRequiredFrac'), // ordered required-arc curriculum (display parity)
      // Per-setup task knobs the curriculum can ramp — same curriculum-applied
      // accessor as gravity so the LIVE VIEW tracks the ramp. These were
      // threaded on the TRAINER side (instantiateSetup resolved()) but missing
      // here, so e.g. the arm-reach accepting-radius curriculum trained
      // against a shrinking circle while the canvas drew the setup-default
      // circle at every level — "level says 10 but the circle never shrank".
      // A(key) returns tp[key] when no spec covers it (undefined for setups
      // that don't use the knob → buildWorld default), so non-curriculum runs
      // are unchanged.
      armReachEase:   A('armReachEase'),
      reachRadius:    A('reachRadius'),
      armTrackAmpl:   A('armTrackAmpl'),
      armObstacleR:   A('armObstacleR'),
      slotGap:        A('slotGap'),
      plateStiff:     A('plateStiff'),
      safeZoneHalf:   A('safeZoneHalf'),
      midpointScale:  A('midpointScale'),
      tagSpread:      A('tagSpread'),
      prioritizeAmpl: A('prioritizeAmpl'),
      cruiseVAmpl:    A('cruiseVAmpl'),
      chirpRate:      A('chirpRate'),
      // Ball-hit setup reads these. Ignored for non-ball setups.
      ballMode:        tp.ballMode,
      ballSpawnX:      A('ballSpawnX'),
      ballSpawnY:      A('ballSpawnY'),
      ballSpawnVx:     tp.ballSpawnVx,
      ballSpawnDelay:  A('ballSpawnDelay'),
      ballDriftSpeed:  A('ballDriftSpeed'),
      ballMass:        A('ballMass'),
      ballRadius:      A('ballRadius'),
      ballRestitution: A('ballRestitution'),
      // Golf-only setup knobs. When holeCenterJitterOn, offset the DISPLAYED hole
      // by a random ±holeCenterJitterMag PER rollout (recomputed each
      // rebuildDisplayState) so Test/preview shows the hole MOVING like training —
      // otherwise it sat at the base position (a test/train mismatch the user hit).
      holeCenter:      A('holeCenter') + displayHoleJitter(tp),
      holeWidth:       A('holeWidth'),
      numObstacles:    A('golfObstacles'),
      obstacleRadius:  A('golfObstacleR'),
      numLumps:        A('golfLumps'),
      lumpRadius:      A('golfLumpR'),
      // Single-pendulum OBSERVATION DROPOUT. The live view MUST be masked the
      // same way training is, or the user watches a policy fed a richer world
      // than it was graded on — the same display/training divergence class as
      // the terrain rung and the arm-reach radius above. Ignored by every
      // other setup.
      singleObservationMode: tp.singleObservationMode,
      pendulumObservationMode: tp.pendulumObservationMode || 'legacy',
      singleDropoutK:        A('singleDropoutK'),
      // Dodge-only setup knobs. Ignored by every other setup. Seed
      // borrows the trainer's seed so the live preview produces the
      // same pattern sequence as the training rollouts for that seed.
      dodgePattern:        tp.dodgePattern,
      dodgeSpawnRate:      A('dodgeSpawnRate'),
      dodgeBulletSpeed:    A('dodgeBulletSpeed'),
      dodgeBulletRadius:   A('dodgeBulletRadius'),
      dodgeLeadTime:       A('dodgeLeadTime'),
      dodgePredictOrder:   tp.dodgePredictOrder,
      dodgeBulletsPerWave: A('dodgeBulletsPerWave'),
      dodgeObservationMode: tp.dodgeObservationMode,
      dodgeNoDie:           !!tp.dodgeNoDie,
      dodgeInvulnSeconds:   tp.dodgeInvulnSeconds,
      dodgeLifespanMode:    !!tp.dodgeLifespanMode,
      seed: app.trainer ? app.trainer.seed : 0,
    };
    // terrain-run: the difficulty rung + every terrain* knob. Without this the
    // LIVE VIEW built the platformer from the setup's own defaults while the
    // trainer ran the preset's rung — terrain-run-crucible showed an 84-tile
    // 'hard' course (HUD and all) while training a 250-tile 'crucible' one.
    // Same class of display/training divergence as the arm-reach radius above.
    applyTerrainDisplayOpts(worldOpts, setup, tp, A);
    if (app.testing && setup.id === 'terrain-run') {
      worldOpts.terrainSeed = BF.replayMetrics.terrainSeed(worldOpts.seed, app.testStats ? app.testStats.trials : 0);
    }
    const built = setup.buildWorld(worldOpts);
    app.showState = built;
    app.showState.setup = setup;
    app.showState.simTime = 0;
    app.showState.startAngle = startAngle;
    app.showState.upTimeAccum = 0;
    // Reset the per-rollout live fitness counter — accumulated step-by-step
    // in tickDisplay so the HUD can show "this preview rollout has earned X"
    // in real time. Resets each time a rollout ends and a new one begins.
    app.showState.liveFitness = 0;
    // Objectives keep rollout-local streaks and command variation here, just
    // as evaluatePolicy does. A rebuilt scene starts a fresh reward history.
    app.showState.objectiveScratch = { outSum: 0, lastCmd: 0, steps: 0 };
    // Per-display push controller — same logic as training, so the user can
    // see disturbances landing on the visible best agent. Seeded from
    // the trainer's seed so the visible disturbance schedule is
    // reproducible across same-seed runs (was previously
    // Date.now()-seeded → unrepeatable).
    if (!app._pushDisplayRng) app._pushDisplayRng = makeDisplayRng(0x7E51_9D15 | 0);
    app.showState.capturePushVisuals = true;
    app.showState.pushCtrl = BF.disturb.make(app.trainer.params, app._pushDisplayRng);
    // Test mode runs the best-ever policy (the actual trained model). Otherwise
    // we follow the current best, which the trainer refreshes each generation.
    // For CNN/CNN3D/CNN-grid/CNN-multiscale policy modes we need params
    // alongside the genome -- the placeholder genome alone has no real
    // weights, so falling back to N.policy on it would produce zero
    // output AND the CNN forward pass never runs (which leaves the
    // network panel's activation maps blank). Wrap target into the
    // {genome, params, config} shape BF.trainer.makePolicy expects.
    const policyType = app.trainer.params.policyType;
    const isCNN     = policyType === 'cnn';
    const isCNN3D   = policyType === 'cnn3d';
    const isCNNGrid = policyType === 'cnn-grid';
    const isCNNMulti = policyType === 'cnn-multiscale';
    // The recurrent policy is a flat-vector ("placeholder genome") policy too:
    // its weights live in .params, so the display MUST carry params + config
    // or it falls back to N.policy on an EMPTY placeholder genome and shows a
    // dead agent while training reports a solved task.
    const isRecurrent = policyType === 'recurrent';
    const isCNNLike = isCNN || isCNN3D || isCNNGrid || isCNNMulti || isRecurrent;
    const cnnLikeConfig =
      isCNN3D   ? app.trainer.cnn3dConfig          :
      isCNNGrid ? app.trainer.cnnGridConfig        :
      isCNNMulti? app.trainer.cnnMultiscaleConfig  :
      isRecurrent ? app.trainer.recurrentConfig    :
                  app.trainer.cnnConfig;
    let policyTarget;
    if (app.testing && app.trainer.bestEver) {
      policyTarget = (isCNNLike && app.trainer.bestEverParams)
        ? { genome: app.trainer.bestEver, params: app.trainer.bestEverParams, config: cnnLikeConfig }
        : app.trainer.bestEver;
    } else if (app.trainer.currentBest) {
      // currentBest is a genome reference; for CNN-family modes we need
      // to also pass params from the population's top individual.
      if (isCNNLike && app.trainer.population[0] && app.trainer.population[0].params) {
        policyTarget = {
          genome: app.trainer.currentBest,
          params: app.trainer.population[0].params,
          config: cnnLikeConfig,
        };
      } else {
        policyTarget = app.trainer.currentBest;
      }
    } else {
      policyTarget = app.trainer.population[0];
    }
    app.showPolicy = BF.trainer.makePolicy(app.trainer, policyTarget);
    if (isSingleSwingupMode()) {
      app.showPolicy = BF.singleSwingup.makePolicy(() => app.showState, {
        ...tp, ...app.showState.world, physicsDt:tp.physicsDt
      });
    }
    // Stash the EXACT parameter vector the displayed policy was built from.
    // The Network panel decodes it back into a drawable topology for the
    // recurrent policy, and reading it from anywhere else risks painting a
    // different genome from the one the sim is running.
    app.showPolicyParams = (policyTarget && policyTarget.params) || null;
    // Dodge planner mode: the display runs the NORMAL dodge world, but the
    // policy is the model-based planner (plans from the live bullet state,
    // ignores the observation vector — like LQR reading full state).
    if (isDodgePlannerMode()) {
      app.showPolicy = BF.dodgePlanner.makePolicy(() => app.showState);
    }
    // Signing planner: same idea on the chain-trace scene — the display runs the
    // NORMAL chain world and only the policy is swapped. commandAll fills EVERY
    // action (cart + k joints + telescope lengths); tickDisplay sizes the buffer
    // from setup.actionCount and zero-fills nothing for us.
    if (isSigningPlannerMode()) {
      app.showPolicy = BF.chainTracePlanner.makePolicy(() => app.showState);
    }
    // Epicycle ANALYTIC: the machine drives itself from the closed form inside
    // setup.tick, so the honest display policy is a ZERO policy. Installing the
    // facade population's genome here would be a lie — it would look like the
    // network is drawing the signature when it has no influence at all — and it
    // would also make the live view jitter as the facade "evolves" noise.
    if (isEpicycleAnalyticMode()) {
      app.showPolicy = {
        command: () => 0,
        commandAll: (obs, out) => { for (let i = 0; i < out.length; i++) out[i] = 0; },
      };
    }
    // Distill mode: the display runs the dodge world with the DISTILLED network
    // as the policy (reactive — reads the topk observation, no lookahead), so
    // the user watches the student's actual dodging, improving each generation.
    if (isDodgeDistillMode() && app.dodgeDistill) {
      const dd = app.dodgeDistill.dd;
      app.showPolicy = BF.dodgeDistill.makePolicy(app.testing && dd.bestPolicy ? dd.bestPolicy : dd);
    }
    if (isDodgeScorerMode()) {
      app.showPolicy=BF.dodgeTemporal.createPolicy(app.dodgeScorerRecord,()=>app.showState);
      app.dodgeFrameHistory=BF.dodgeTemporal.createFrameHistory({frames:4,interval:.1});
    }
    app.simRenderer.setSetup(setup.id);
    rebuildGhosts();
  }

  // Mirror of rebuildDisplayState for the compare-mode trainerB.
  // Builds an INDEPENDENT showStateB / showPolicyB so the user sees
  // trainerB's best agent dodging / balancing / putting in the second
  // sim canvas alongside trainer A. Shares the start angle with A so
  // both agents face the same problem each rollout -- the whole point
  // of compare mode is "same scenario, different algorithm." If B's
  // setup differs from A's, we still build an independent world for B
  // (using B's setup), but the angle is taken from A's showState so
  // the comparison stays as apples-to-apples as the differing setups
  // allow.
  function rebuildDisplayStateB() {
    if (!app.trainerB || !app.simRendererB) return;
    const setup = BF.setups.getSetup(app.trainerB.setupId);
    if (!setup) return;
    // Capture A's current start angle (per-rollout) so B faces the
    // same initial condition. Fall back to a small tilt if A hasn't
    // built yet.
    const sharedAngle = (app.showState && app.showState.startAngle != null)
      ? app.showState.startAngle : 0.05;
    const tp = app.trainerB.params;
    // appliedCurriculumParam uses A's curriculum level; for B we want
    // B's own curriculum, so wrap it manually here. Mirror the phase-
    // aware logic from appliedCurriculumParam / trainer's
    // computeCurriculumOverlay so B's compare-mode display matches its
    // own trainer behavior. Without this, even when B's trainer correctly
    // phases the ramps, the compare-mode canvas would render parallel
    // ramping.
    const Bcur = app.trainerB.curriculum || {};
    const A = (k) => {
      if (tp[k] == null) return tp[k];
      if (!tp.curriculumEnabled || !tp.curriculumSpecs) return tp[k];
      const spec = tp.curriculumSpecs.find(s => s && s.paramKey === k);
      if (!spec) return tp[k];
      const lvl = Bcur.level || 0;
      if (BF.trainer && BF.trainer.computeCurriculumPhases) {
        const defaultSteps = (tp.curriculumMaxLevel | 0) || 30;
        const { phases, cumStart, phaseMaxSteps } =
          BF.trainer.computeCurriculumPhases(tp.curriculumSpecs, defaultSteps);
        for (let p = 0; p < phases.length; p++) {
          if (phases[p].indexOf(spec) === -1) continue;
          const phaseStart = cumStart[p];
          const phaseEnd   = phaseStart + phaseMaxSteps[p];
          let frac;
          if (lvl <= phaseStart) frac = 0;
          else if (lvl >= phaseEnd) frac = 1;
          else {
            const specSteps = Math.max(1, (spec.steps | 0) || phaseMaxSteps[p]);
            frac = Math.min(1, (lvl - phaseStart) / specSteps);
          }
          return BF.trainer.curriculumApply(spec, frac);
        }
      }
      // Fallback: pre-phase parallel ramping
      const specSteps = Math.max(1, (spec.steps | 0) || (tp.curriculumMaxLevel | 0) || 30);
      const frac = Math.min(1, lvl / specSteps);
      return BF.trainer.curriculumApply(spec, frac);
    };
    const sameMomentumProfile=tp.pendulumInitialState && app.trainer?.params?.pendulumInitialState
      && JSON.stringify(tp.pendulumInitialState)===JSON.stringify(app.trainer.params.pendulumInitialState)
      && setup.id===app.showState?.setup?.id;
    const built = setup.buildWorld({
      gravity: A('gravity'),
      physicsDt:tp.physicsDt,
      pendulumInitialState:sameMomentumProfile ? app.showState.initialConditions : tp.pendulumInitialState,
      pendulumInitialStateSpread:sameMomentumProfile ? null : tp.pendulumInitialStateSpread,
      initialStateRng:app.trainerB.rng,
      pendulumRailHalfWidth: tp.pendulumRailHalfWidth,
      // Chain-reach target-ease: same curriculum-applied accessor as gravity so
      // the live preview's target follows the ramp during training. Other
      // setups ignore it; chain-reach buildWorld defaults it to 1 (hard) when
      // absent (e.g. tp.targetEase unset → A returns undefined → hard target).
      targetEase: A('targetEase'),
      damping: A('damping'),
      cartAccel: A('cartAccel'),
      cartControlMode: tp.cartControlMode || 'accel',
      cartWallsEnabled: tp.cartWallsEnabled !== false,
      cartMaxSpeed: A('cartMaxSpeed'),
      cartDrag: A('cartDrag'),
      uprightAssist: A('uprightAssist'),
      jointDamping: A('jointDamping'),
      startAngle: sharedAngle,
      numSegments: tp.numSegments,
      material: tp.material,
      jointControlMode: tp.jointControlMode,  // display/training joint-mode parity (see primary buildWorld)
      curveId: tp.curveId,
      tracePeriod: tp.tracePeriod,
      traceRadius: tp.traceRadius,
      traceCenterY: tp.traceCenterY,   // placement override — or the shared world sits somewhere else
      traceCenterX: tp.traceCenterX, traceCenterMode: tp.traceCenterMode,
      ballMode:        tp.ballMode,
      ballSpawnX:      A('ballSpawnX'),
      ballSpawnY:      A('ballSpawnY'),
      ballSpawnDelay:  A('ballSpawnDelay'),
      ballDriftSpeed:  A('ballDriftSpeed'),
      ballMass:        A('ballMass'),
      ballRadius:      A('ballRadius'),
      ballRestitution: A('ballRestitution'),
      holeCenter:      A('holeCenter'),
      holeWidth:       A('holeWidth'),
      numObstacles:    A('golfObstacles'),
      obstacleRadius:  A('golfObstacleR'),
      numLumps:        A('golfLumps'),
      lumpRadius:      A('golfLumpR'),
      dodgePattern:        tp.dodgePattern,
      dodgeSpawnRate:      A('dodgeSpawnRate'),
      dodgeBulletSpeed:    A('dodgeBulletSpeed'),
      dodgeBulletRadius:   A('dodgeBulletRadius'),
      dodgeLeadTime:       A('dodgeLeadTime'),
      dodgePredictOrder:   tp.dodgePredictOrder,
      dodgeBulletsPerWave: A('dodgeBulletsPerWave'),
      dodgeObservationMode: tp.dodgeObservationMode,
      dodgeNoDie:           !!tp.dodgeNoDie,
      dodgeInvulnSeconds:   tp.dodgeInvulnSeconds,
      dodgeLifespanMode:    !!tp.dodgeLifespanMode,
      seed: app.trainerB.seed,
    });
    app.showStateB = built;
    app.showStateB.setup = setup;
    app.showStateB.simTime = 0;
    app.showStateB.startAngle = sharedAngle;
    app.showStateB.upTimeAccum = 0;
    app.showStateB.liveFitness = 0;
    // Pick B's policy target. Same logic as A's: best-ever in test
    // mode, current best during training.
    const tr = app.trainerB;
    const policyType = tr.params.policyType;
    const isCNN     = policyType === 'cnn';
    const isCNN3D   = policyType === 'cnn3d';
    const isCNNGrid = policyType === 'cnn-grid';
    const isCNNMulti = policyType === 'cnn-multiscale';
    const isRecurrent = policyType === 'recurrent';
    const isCNNLike = isCNN || isCNN3D || isCNNGrid || isCNNMulti || isRecurrent;
    const cnnLikeConfig =
      isCNN3D   ? tr.cnn3dConfig         :
      isCNNGrid ? tr.cnnGridConfig       :
      isCNNMulti? tr.cnnMultiscaleConfig :
      isRecurrent ? tr.recurrentConfig   :
                  tr.cnnConfig;
    let policyTarget;
    if (app.testing && tr.bestEver) {
      policyTarget = (isCNNLike && tr.bestEverParams)
        ? { genome: tr.bestEver, params: tr.bestEverParams, config: cnnLikeConfig }
        : tr.bestEver;
    } else if (tr.currentBest) {
      if (isCNNLike && tr.population[0] && tr.population[0].params) {
        policyTarget = {
          genome: tr.currentBest, params: tr.population[0].params, config: cnnLikeConfig,
        };
      } else {
        policyTarget = tr.currentBest;
      }
    } else if (tr.population && tr.population[0]) {
      policyTarget = tr.population[0];
    } else {
      app.showPolicyB = null;
      return;
    }
    app.showPolicyB = BF.trainer.makePolicy(tr, policyTarget);
    app.simRendererB.setSetup(setup.id);
  }

  function rebuildGhosts() {
    if(isDodgeScorerMode()){app.ghosts=[];return;}
    app.ghosts.length = 0;
    if (!dom.showGhosts.checked) return;
    if (!app.trainer) return;
    const setup = BF.setups.getSetup(app.trainer.setupId);
    const tp = app.trainer.params;
    // Match the primary's start angle so each ghost is shown under
    // identical initial conditions — the whole point of "show top-N
    // siblings" is to compare alternate policies on the SAME problem.
    // Hardcoding 0.05 here meant the ghosts and the primary started
    // their pendulums at different angles, so even a policy that
    // would behave identically to the primary's looked divergent
    // because its bob fell in a different direction from t=0. Falls
    // back to 0.05 only if app.showState isn't ready yet (very first
    // call before rebuildDisplayState has finished).
    const ghostStartAngle = (app.showState && app.showState.startAngle != null)
      ? app.showState.startAngle
      : 0.05;
    // Pick the source of "top-N siblings". Subtle but important: by the
    // time rebuildGhosts runs (between trainer.step() calls), CMA-ES
    // (and similar fresh-resample modes) have ALREADY replaced
    // trainer.population with the next gen's UNEVALUATED samples in
    // CMA-ES sampling order. Reading population[1..5] there shows
    // arbitrary-rank samples, not the actual second-through-sixth-best
    // policies — the user sees ghost behaviors that don't match what
    // the population panel claims is the ranking, because they're
    // literally not the ranked agents.
    //
    // trainer.evaluatedSnapshot is taken at the END of step(), AFTER
    // sorting by fitness but BEFORE the population is overwritten — so
    // it's the correct sorted view of "what was just evaluated".
    // Each entry has {genome, params, fitness, rank, ...} and slots
    // straight into makePolicy.
    //
    // NEAT preserves elites unmutated at the front of the new
    // population, so for NEAT both sources happen to give the same
    // top-K. The snapshot is the safer default either way.
    const source = (app.trainer.evaluatedSnapshot && app.trainer.evaluatedSnapshot.length > 0)
      ? app.trainer.evaluatedSnapshot
      : app.trainer.population;
    if (!source || source.length < 2) return;
    // Skip index 0 (already shown as primary). Iterate the full individuals
    // so CNN-policy ghosts get params alongside the placeholder genome.
    // ghostCount slider drives how many runners-up to render; cap by the
    // source population size so we never index past the end.
    const desiredGhosts = (dom.ghostCount && parseInt(dom.ghostCount.value, 10)) || 5;
    const ghostCount = Math.max(1, Math.min(desiredGhosts, source.length - 1));
    const upTo = 1 + ghostCount;
    for (let i = 1; i < upTo; i++) {
      const ind = source[i];
      const A = (k) => appliedCurriculumParam(tp, k);
      const built = setup.buildWorld({
        gravity: A('gravity'),
        physicsDt:tp.physicsDt,
        pendulumInitialState:tp.pendulumInitialState ? app.showState.initialConditions : null,
        pendulumRailHalfWidth: tp.pendulumRailHalfWidth,
        // Chain-reach target-ease ghost preview: mirror gravity's accessor.
        targetEase: A('targetEase'),
        damping: A('damping'),
        cartAccel: A('cartAccel'),
        cartControlMode: tp.cartControlMode || 'accel',
        cartWallsEnabled: tp.cartWallsEnabled !== false,
        cartMaxSpeed: A('cartMaxSpeed'),
        cartDrag: A('cartDrag'),
        uprightAssist: A('uprightAssist'),
        jointDamping: A('jointDamping'),
        startAngle: ghostStartAngle,
        numSegments: tp.numSegments,
        material: tp.material,
        jointControlMode: tp.jointControlMode,  // display/training joint-mode parity (see primary buildWorld)
        curveId: tp.curveId,
        tracePeriod: tp.tracePeriod,
        traceRadius: tp.traceRadius,
        traceCenterY: tp.traceCenterY,   // placement override — or ghosts trace a differently-placed curve
        traceCenterX: tp.traceCenterX, traceCenterMode: tp.traceCenterMode,
        // Ball params — without these, ghosts fall back to setup defaults
        // and show a different scene than what the user configured.
        ballMode:        tp.ballMode,
        ballSpawnX:      A('ballSpawnX'),
        ballSpawnY:      A('ballSpawnY'),
        ballSpawnVx:     tp.ballSpawnVx,
        ballSpawnDelay:  A('ballSpawnDelay'),
        ballDriftSpeed:  A('ballDriftSpeed'),
        ballMass:        A('ballMass'),
        ballRadius:      A('ballRadius'),
        ballRestitution: A('ballRestitution'),
        // Golf-only — same reason as in rebuildDisplayState above.
        holeCenter:      A('holeCenter'),
        holeWidth:       A('holeWidth'),
      });
      built.setup = setup;
      app.ghosts.push({ state: built, policy: BF.trainer.makePolicy(app.trainer, ind) });
    }
  }

  // ---- Read controls into params ----
  function readParams() {
    const _p = {
      train: {
        populationSize: clamp(parseInt(dom.popSize.value, 10) || 120, 8, 2000),
        eliteRatio: parseFloat(dom.eliteRatio.value),
        tournamentSize: parseInt(dom.tournamentSize.value, 10),
        evalSeconds: parseFloat(dom.evalSeconds.value),
        // 1/120 is the step every pendulum/chain/dodge constant in this app was
        // tuned at, and it stays the default. A preset may override it (stashed
        // by loadRunPreset) when its setup's numbers were MEASURED at another
        // step — terrain-run is the first: its jump arc and its control latch
        // (controlEvery = 2 physics steps => 30 Hz) are both stated at 1/60.
        physicsDt: (presetOverridesApply() && app.physicsDtOverride > 0)
                     ? app.physicsDtOverride : 1 / 120,
        useDisturb: dom.useDisturb.checked,
        pushTarget: dom.pushTarget.value,
        pushStrength: parseFloat(dom.pushStrength.value),
        pushDuration: parseFloat(dom.pushDuration.value),
        pushSmoothing: parseFloat(dom.pushSmoothing.value),
        pushIntervalMin: parseFloat(dom.pushIntervalMin.value),
        pushIntervalMax: parseFloat(dom.pushIntervalMax.value),
        curriculumStartFrac: parseFloat(dom.curriculumStartFrac.value),
        curriculumRampFactor: parseFloat(dom.curriculumRamp.value),
        curriculumThresholdFrac: parseFloat(dom.curriculumThreshold.value),
        curriculumConsecRequired: parseInt(dom.curriculumConsec.value, 10),
        curriculumMaxLevel: parseInt(dom.curriculumMaxLevel.value, 10),
        // Generalized curriculum specs — read from app.curriculumSpecs
        // (built/updated by the in-place spec editor below). We DEEP
        // CLONE so the trainer can\'t accidentally mutate the live
        // editor state (the trainer sometimes augments specs with
        // _appliedValue diagnostics).
        curriculumSpecs: (app.curriculumSpecs || []).map(s => ({
          paramKey: s.paramKey, from: s.from, to: s.to, mode: s.mode,
          // Per-spec step count — number of curriculum levels before
          // this ramp reaches `to`. Falls back to the global maxLevel
          // if not set (handled in trainer's overlay path).
          steps: s.steps != null ? (s.steps | 0) : null,
          // Phase number — drives the sequential phase ordering in the
          // trainer's computeCurriculumPhases. Without this, every spec
          // collapses to phase 0 and the UI's "Phase 2" chips ramp in
          // parallel with Phase 1, which is the EXACT bug the user just
          // reported: "still both change at the same time although I
          // put them in 2 phases". Preserve the field literally so the
          // trainer sees the same phase structure the UI renders.
          phase: s.phase != null ? (s.phase | 0) : 0,
        })),
        autoStopGoodFraction: parseFloat(dom.autoStopGood.value),
        autoStopTolerance: parseFloat(dom.autoStopTol.value),
        hallOfFameSize: parseInt(dom.hallOfFameSize.value, 10),
        autoRollbackOn: dom.autoRollbackOn.checked,
        autoRollbackThreshold: parseFloat(dom.autoRollbackThreshold.value),
        autoRollbackGens: parseInt(dom.autoRollbackGens.value, 10),
        annealMutationOn: dom.annealMutationOn.checked,
        annealAfterGens: parseInt(dom.annealAfterGens.value, 10),
        annealFactor: parseFloat(dom.annealFactor.value),
        stuckEscapeOn: dom.stuckEscapeOn.checked,
        stuckEscapeAfterGens: parseInt(dom.stuckEscapeAfterGens.value, 10),
        stuckEscapeFactor: parseFloat(dom.stuckEscapeFactor.value),
        gravity: parseFloat(dom.gravity.value),
        pendulumRailHalfWidth: presetOverridesApply() ? app.pendulumRailHalfWidthOverride : undefined,
        pendulumInitialState: presetOverridesApply() ? app.pendulumInitialStateOverride : null,
        pendulumInitialStateSpread: presetOverridesApply() ? app.pendulumInitialStateSpreadOverride : null,
        damping: parseFloat(dom.damping.value),
        cartAccel: parseFloat(dom.cartAccel.value),
        cartMaxSpeed: parseFloat(dom.cartMaxSpeed.value),
        cartDrag: parseFloat(dom.cartDrag.value),
        uprightAssist: parseFloat(dom.uprightAssist.value),
        jointDamping: parseFloat(dom.jointDamping.value),
        // Golf-only knobs. Only meaningful when the active setup is
        // golf or putt; setups.js falls back to its own default if the
        // setup doesn't read these. Curriculum specs override these
        // values per rollout via the curriculumOverlay path.
        holeWidth:  parseFloat(dom.holeWidth.value),
        holeCenter: parseFloat(dom.holeCenter.value),
        holeCenterJitterOn:  dom.holeCenterJitterOn ? dom.holeCenterJitterOn.checked : false,
        holeCenterJitterMag: dom.holeCenterJitterMag ? parseFloat(dom.holeCenterJitterMag.value) : 0,
        // Chain action-shape info for the WORKER pool: the setup instance's
        // actionCount doesn't cross the worker boundary, so eval_worker
        // re-applies these via setActionShape at init (parity — without it,
        // actuated/telescoping chains silently evaluate cart-only in workers).
        numActuatedJoints: dom.chainNumActuated ? (parseInt(dom.chainNumActuated.value, 10) || 0) : 0,
        chainTelescope: dom.chainTelescope ? !!dom.chainTelescope.checked : false,
        golfObstacles:       dom.golfObstacles ? parseInt(dom.golfObstacles.value, 10) : 2,
        // Dodge-mode params. Read every gen so curriculum / live tweaks
        // propagate without restarting the run.
        dodgePattern:        dom.dodgePattern ? dom.dodgePattern.value : 'mixed',
        dodgePredictOrder:   dom.dodgePredictOrder ? dom.dodgePredictOrder.value : 'linear',
        dodgeSpawnRate:      dom.dodgeSpawnRate ? parseFloat(dom.dodgeSpawnRate.value) : 1.5,
        dodgeBulletSpeed:    dom.dodgeBulletSpeed ? parseFloat(dom.dodgeBulletSpeed.value) : 220,
        dodgeBulletRadius:   dom.dodgeBulletRadius ? parseFloat(dom.dodgeBulletRadius.value) : 6,
        dodgeLeadTime:       dom.dodgeLeadTime ? parseFloat(dom.dodgeLeadTime.value) : 0.6,
        dodgeBulletsPerWave: dom.dodgeBulletsPerWave ? parseInt(dom.dodgeBulletsPerWave.value, 10) : 8,
        dodgeObservationMode: dom.dodgeObservationMode ? dom.dodgeObservationMode.value : 'topk',
        numSegments: dom.chainNumSegments ? parseInt(dom.chainNumSegments.value, 10) : 4,
        material: dom.chainMaterial ? dom.chainMaterial.value : 'springy',
        // Joint control mode (torque|servo). Threaded into the trainer rollout
        // buildWorld via resolved('jointControlMode'). numActuatedJoints is NOT
        // read here — it flows through the setup instance via the setActionShape
        // seam (single-source, like numSegments).
        jointControlMode: dom.chainJointMode ? dom.chainJointMode.value : 'torque',
        // Chain-trace (signing machine): which curve + its timing/size. No
        // dom.chainCurve control in B1, so curveId defaults to 'circle'; the
        // preset supplies the real value into trainer.params. A dropdown is a
        // B-follow-on.
        curveId: dom.chainCurve ? dom.chainCurve.value : 'circle',
        // No DOM controls — sourced from the preset via the stash loadRunPreset
        // recomputes each load (see chainTraceParamsOverride). The old
        // hardcoded 4/60 silently overrode every preset's declared values.
        tracePeriod: (app.chainTraceParamsOverride && app.chainTraceParamsOverride.tracePeriod != null)
          ? app.chainTraceParamsOverride.tracePeriod : 4,
        traceRadius: (app.chainTraceParamsOverride && app.chainTraceParamsOverride.traceRadius != null)
          ? app.chainTraceParamsOverride.traceRadius : 60,
        traceCenterX: app.chainTraceParamsOverride?.traceCenterX,
        traceCenterMode: app.chainTraceParamsOverride?.traceCenterMode || 'rail-midpoint',
        // Signing paint/coverage mode — no DOM control; sourced from the preset
        // via app.chainPaintOverride (loadRunPreset recomputes it each load).
        chainPaint: !!app.chainPaintOverride,
        // Signing STROKE mode — no DOM control; preset-stashed the same way.
        chainStroke: !!app.chainStrokeOverride,
        strokeLiftRatio: app.strokeLiftRatioOverride,
        // Signing IN-ORDER mode — no DOM control; preset-stashed the same way.
        chainOrdered: !!app.chainOrderedOverride,
        orderedRequiredFrac: app.orderedRequiredFracOverride,
        // Signing lookahead observation — no DOM control; preset-stashed. Must
        // ride trainer.params so eval_worker can re-apply the obs shape.
        chainTraceLookahead: !!app.chainTraceLookaheadOverride,
        // Epicycle signer — preset-stashed, no DOM controls. null epiArms lets
        // the setup fall back to curve_fourier's measured per-curve default.
        epiArms:      app.epicycleOverride ? app.epicycleOverride.epiArms : null,
        epiBasis:     app.epicycleOverride ? app.epicycleOverride.epiBasis : 'auto',
        epiDrive:     app.epicycleOverride ? app.epicycleOverride.epiDrive : 'analytic',
        epiTelescope: !!(app.epicycleOverride && app.epicycleOverride.epiTelescope),
        epiWarmPhase: !!(app.epicycleOverride && app.epicycleOverride.epiWarmPhase),
        dodgeNoDie:           dom.dodgeNoDie ? dom.dodgeNoDie.checked : true,
        dodgeNoReset:         dom.dodgeNoReset ? dom.dodgeNoReset.checked : false,
        dodgeNoDiePenalty:    dom.dodgeNoDiePenalty ? parseFloat(dom.dodgeNoDiePenalty.value) : 3,
        dodgeInvulnSeconds:   dom.dodgeInvulnSeconds ? parseFloat(dom.dodgeInvulnSeconds.value) : 0.6,
        dodgeLifespanMode:    dom.dodgeLifespanMode ? dom.dodgeLifespanMode.checked : false,
        cartControlMode: (dom.cartControlMode && dom.cartControlMode.value) || 'accel',
        cartWallsEnabled: dom.wallsOn.checked,
        curriculumEnabled: dom.modeSelect.value !== 'ppo' && dom.curriculumOn.checked,
        // No DOM element — sourced from app.curriculumNoForceAdvanceOverride,
        // which loadRunPreset stashes from the preset's params block.
        curriculumNoForceAdvance: !!app.curriculumNoForceAdvanceOverride,
        qdParentEnabled: dom.qdParentEnabled ? dom.qdParentEnabled.checked : false,
        qdSampleFraction: dom.qdSampleFraction ? parseFloat(dom.qdSampleFraction.value) : 0.5,
        qdEscapeBoostEnabled: dom.qdEscapeBoostEnabled ? dom.qdEscapeBoostEnabled.checked : true,
        qdEscapeBoost:        dom.qdEscapeBoost        ? parseFloat(dom.qdEscapeBoost.value)   : 0.5,
        paretoSelectionEnabled: dom.paretoSelectionEnabled ? dom.paretoSelectionEnabled.checked     : false,
        paretoNoveltyK:         dom.paretoNoveltyK         ? parseInt(dom.paretoNoveltyK.value, 10) : 15,
        paretoHoFEnabled:        dom.paretoHoFEnabled      ? dom.paretoHoFEnabled.checked                : false,
        paretoHoFSize:           dom.paretoHoFSize         ? parseInt(dom.paretoHoFSize.value, 10)        : 8,
        paretoHoFMinBehaviorDist:dom.paretoHoFMinDist      ? parseFloat(dom.paretoHoFMinDist.value)       : 0.5,
        paretoUseConsistency:    dom.paretoUseConsistency  ? dom.paretoUseConsistency.checked             : false,
        retroEvalEnabled:         dom.retroEvalEnabled         ? dom.retroEvalEnabled.checked       : false,
        retroEvalEveryGens:       dom.retroEvalEveryGens       ? parseInt(dom.retroEvalEveryGens.value, 10) : 5,
        retroEvalTopN:            dom.retroEvalTopN            ? parseInt(dom.retroEvalTopN.value, 10)      : 5,
        retroEvalSelectionWeight: dom.retroEvalSelectionWeight ? parseFloat(dom.retroEvalSelectionWeight.value) : 0.3,
        levelHoFEnabled:      dom.levelHoFEnabled      ? dom.levelHoFEnabled.checked     : false,
        levelHoFSize:         dom.levelHoFSize         ? parseInt(dom.levelHoFSize.value, 10)         : 2,
        levelTransplantOn:    dom.levelTransplantOn    ? dom.levelTransplantOn.checked   : true,
        levelTransplantCount: dom.levelTransplantCount ? parseInt(dom.levelTransplantCount.value, 10) : 2,
        // Diffsim + planner modes are driven by their own engines alongside a
        // FACADE population trainer (so the chart/HUD/display scaffolding stays
        // valid). makeTrainer/initPopulation don't know
        // 'diffsim-*'/'dodge-planner'/'signing-planner'/'epicycle-analytic', so
        // map them to a real population mode here. For every other value this is
        // a no-op -> byte-identical. LOAD-BEARING: without the remap makeTrainer
        // gets an unknown mode, no facade population is built,
        // rebuildDisplayState never sets app.showState/showPolicy, and the
        // canvas goes dead.
        mode: ((BF.diffsimMode && BF.diffsimMode.isActive(dom.modeSelect.value))
               || dom.modeSelect.value === 'dodge-planner'
               || dom.modeSelect.value === 'signing-planner'
               || dom.modeSelect.value === 'epicycle-analytic'
               || dom.modeSelect.value === 'dodge-distill'
               || dom.modeSelect.value === 'dodge-scorer')
          ? 'cmaes'
          : dom.modeSelect.value,
        neatInitialHidden: parseInt(dom.neatInitialHidden.value, 10),
        neatTopologyPreset: dom.neatTopologyPreset
          ? dom.neatTopologyPreset.value
          : 'minimal',
        // NEAT-CNN hybrid: frozen-random CNN feature extractor + NEAT
        // topology evolution over those features. Active only in NEAT
        // modes on the dodge setup; the UI toggles below remain in
        // sync via the change handlers but the trainer only honors
        // useHybridCnn when isNeatMode + dodge.
        useHybridCnn:       dom.useHybridCnn       ? dom.useHybridCnn.checked       : false,
        hybridIncludeTopK:  dom.hybridIncludeTopK  ? dom.hybridIncludeTopK.checked  : false,
        // CNN policy is only meaningful for fixed-topology algorithms that can
        // optimize an arbitrary flat vector — the CMA family, via dimOverride.
        // sep-CMA-ES belongs here too: the trainer's initSepCmaesPopulation has
        // always had the same isCNN*/dimOverride branches as full CMA-ES, and
        // the policy-dropdown VISIBILITY gate (isCMA) already counted it. This
        // read did not, so every sep-CMA-ES + CNN preset was silently demoted
        // to an MLP — the run looked fine and simply was not the arm claimed.
        // DE joins the CMA family here: js/de.js now takes the same
        // dimOverride option, and initDEPopulation builds the placeholder
        // genome for flat-vector policy types, so DE can carry a CNN or a
        // recurrent policy. (The shipped recurrent preset uses DE — measured
        // worst-seed 0.86 vs 0.31 for sep-CMA-ES at equal budget.)
        policyType: ((dom.modeSelect.value === 'cmaes' || dom.modeSelect.value === 'sep-cmaes'
                      || dom.modeSelect.value === 'de')
                     && dom.policyTypeSelect)
                      ? dom.policyTypeSelect.value
                      : 'mlp',
        // Recurrent policy shape. memSize/hidden change the parameter-vector
        // dimension; leak is the integrator time-constant. obsCount/numOutputs
        // are NOT read here — the trainer forces them from the setup so the
        // genome can never read a different width than the world emits.
        recurrentConfig: savedPolicyConfig('recurrent', {
          memSize: dom.recurrentMem ? (parseInt(dom.recurrentMem.value, 10) || 0) : 8,
          hidden:  dom.recurrentHidden ? (parseInt(dom.recurrentHidden.value, 10) || 0) : 16,
          leak:    dom.recurrentLeak ? (parseFloat(dom.recurrentLeak.value) || 0.2) : 0.2,
        }),
        // THE ABLATION SWITCH: hold the recurrent policy's memory inputs at 0
        // while leaving every weight untouched.
        recurrentSever: dom.recurrentSever ? !!dom.recurrentSever.checked : false,
        // Single-pendulum observation dropout (the memory task). Read
        // unconditionally: every other setup ignores both keys, and the
        // trainer threads them into buildWorld so the eval workers see the
        // same masked world the main thread does.
        singleObservationMode: dom.singleObservationMode ? dom.singleObservationMode.value : 'full',
        pendulumObservationMode: presetOverridesApply() ? (app.pendulumObservationMode || 'legacy') : 'legacy',
        singleDropoutK: dom.singleDropoutK ? (parseInt(dom.singleDropoutK.value, 10) || 1) : 4,
        cnnConfig: savedPolicyConfig('cnn', {
          imageSize: parseInt(dom.cnnImageSize.value, 10),
          numFilters: parseInt(dom.cnnFilters.value, 10),
          denseHidden: parseInt(dom.cnnDense.value, 10),
          historyLen: parseInt(dom.cnnHistory.value, 10),
          numChannels: dom.cnnChannels ? parseInt(dom.cnnChannels.value, 10) : 1,
        }),
        // Multi-scale CNN config override. Most presets leave this null
        // and trainer.js uses BF.cnnMultiscale.defaultConfig(); the WASM-
        // enabled high-res preset stashes a custom object on app via
        // loadRunPreset. Null when no preset is active or the active
        // preset doesn't override the defaults.
        cnnMultiscaleConfig: savedPolicyConfig('cnn-multiscale', app.cnnMultiscaleConfigOverride || null),
        // Grid-CNN config override. Null for the dodge presets (the module's
        // 16x16 single-channel defaults ARE the dodge grid); terrain-run's
        // conv arm needs the non-square multi-channel shape spelled out.
        cnnGridConfig: savedPolicyConfig('cnn-grid', (presetOverridesApply() && app.cnnGridConfigOverride) || null),
        cnn3dConfig: savedPolicyConfig('cnn3d', {
          inputMode:   dom.cnn3dInputMode ? dom.cnn3dInputMode.value : 'temporal',
          depthSize:   dom.cnn3dDepth      ? parseInt(dom.cnn3dDepth.value, 10) : 6,
          imageSize:   dom.cnn3dImageSize  ? parseInt(dom.cnn3dImageSize.value, 10) : 10,
          numFilters:  dom.cnn3dFilters    ? parseInt(dom.cnn3dFilters.value, 10) : 2,
          filterDepth: dom.cnn3dFilterDepth? parseInt(dom.cnn3dFilterDepth.value, 10) : 2,
          denseHidden: dom.cnn3dDense      ? parseInt(dom.cnn3dDense.value, 10) : 4,
        }),
        cmaesHiddenSize: parseInt(dom.cmaesHidden.value, 10),
        cmaesHiddenLayers: dom.cmaesLayers ? parseInt(dom.cmaesLayers.value, 10) : 1,
        // Explicit per-layer widths (preset-only, no DOM). The two sliders
        // above can only say "L layers of width N", so a measured shape with
        // UNEQUAL layers (198->1->50->2, 242->2->140->2) cannot be expressed
        // by them at all. Non-null wins in trainer.fixedHiddenSizes.
        cmaesHiddenSizes: (presetOverridesApply() && app.cmaesHiddenSizesOverride) || null,
        cmaesSigma: parseFloat(dom.cmaesSigma.value),
        annealingT0: parseFloat(dom.annealingT0.value),
        annealingCooling: parseFloat(dom.annealingCooling.value),
        ptTmin: parseFloat(dom.ptTmin.value),
        ptTmax: parseFloat(dom.ptTmax.value),
        ptSwapInterval: parseInt(dom.ptSwapInterval.value, 10),
        deF: parseFloat(dom.deF.value),
        deCR: parseFloat(dom.deCR.value),
        gdEpsilon: parseFloat(dom.gdEpsilon.value),
        gdAlphaInit: parseFloat(dom.gdAlphaInit.value),
        nesSigma: parseFloat(dom.nesSigma.value),
        nesLR: parseFloat(dom.nesLR.value),
        // Initial-tilt magnitude. The slider is the source of truth (in
        // degrees); the trainer reads `startAngleRange` (radians) for
        // physics and `startTiltDeg` for curriculum ramping. We write
        // both so legacy code paths + the new curriculum knob stay in
        // sync regardless of which one's queried.
        startTiltDeg:    currentTiltDeg(),
        startAngleRange: currentTiltRad(),
        startTiltSpreadDeg: dom.tiltSpreadDeg ? parseFloat(dom.tiltSpreadDeg.value) : 0,
        tiltDirection: dom.tiltDirection ? dom.tiltDirection.value : 'both',
        rolloutsPerAgent: parseInt(dom.rollouts.value, 10),
        objectiveId: dom.objectiveSelect.value,
        objectiveParams: {
          targetAngleDeg: parseFloat(dom.targetAngle.value),
          ballSpeedBonus: parseFloat(dom.ballSpeedBonus.value),
        },
        complexityPenalty: parseFloat(dom.complexityPenalty.value),
        mixturePenalty: dom.mixturePenalty ? parseFloat(dom.mixturePenalty.value) : 0,
        smoothnessPenalty: dom.smoothnessOn.checked ? parseFloat(dom.smoothnessPenalty.value) : 0,
        // Ball-hit setup params (only consumed by the ball-single setup,
        // ignored otherwise). Read every gen so live slider tweaks take
        // effect on the next rollout.
        adversarialOn: dom.adversarialOn.checked,
        adversarialEnvPopSize: parseInt(dom.adversarialEnvPopSize.value, 10),
        adversarialMutationSigma: parseFloat(dom.adversarialMutationSigma.value),
        ballMode: dom.ballMode.value,
        ballSpawnX: parseFloat(dom.ballSpawnX.value),
        ballSpawnY: parseFloat(dom.ballSpawnY.value),
        ballSpawnDelay: parseFloat(dom.ballSpawnDelay.value),
        ballDriftSpeed: parseFloat(dom.ballDriftSpeed.value),
        ballMass: parseFloat(dom.ballMass.value),
        ballRadius: parseFloat(dom.ballRadius.value),
        ballRestitution: parseFloat(dom.ballRestitution.value),
      },
      objective: dom.objectiveSelect.value,
      objectiveParams: {
        targetAngleDeg: parseFloat(dom.targetAngle.value),
        ballSpeedBonus: parseFloat(dom.ballSpeedBonus.value),
        rewardCenterBonusOn: dom.rewardCenterBonusOn ? dom.rewardCenterBonusOn.checked : false,
        centerBonusWeight: dom.centerBonusWeight ? parseFloat(dom.centerBonusWeight.value) : 8,
        bouncePenaltyOn: dom.bouncePenaltyOn ? dom.bouncePenaltyOn.checked : false,
        bouncePenaltyWeight: dom.bouncePenaltyWeight ? parseFloat(dom.bouncePenaltyWeight.value) : 1,
        directShotOnly: dom.directShotOnly ? dom.directShotOnly.checked : false,
        strikeDirectionRewardOn: dom.strikeDirectionRewardOn ? dom.strikeDirectionRewardOn.checked : false,
        strikeDirectionWeight: dom.strikeDirectionWeight ? parseFloat(dom.strikeDirectionWeight.value) : 8,
        // Dodge no-die per-hit penalty -- read by the dodge_survive
        // objective. The toggle itself (dodgeNoDie) is a setup-level
        // flag living on trainer.params, not objectiveParams; the
        // weight goes here so the reward function sees it.
        dodgeNoDiePenalty: dom.dodgeNoDiePenalty ? parseFloat(dom.dodgeNoDiePenalty.value) : 3,
        // Lifespan-focused reward toggle -- the dodge_survive reward
        // function branches on this. Setup-level dodgeNoDie still
        // lives on trainer.params (the setup consumes it for the
        // invulnerability window), but the reward shape itself is an
        // objective concern, so the flag is duplicated here for the
        // reward function to read without rummaging through state.
        dodgeNoDie:        dom.dodgeNoDie ? dom.dodgeNoDie.checked : true,
        dodgeLifespanMode: dom.dodgeLifespanMode ? dom.dodgeLifespanMode.checked : false,
      },
      mut: {
        mutTopology: dom.mutTopology.checked,
        weightSigma: parseFloat(dom.weightSigma.value),
        weightResetProb: parseFloat(dom.weightResetProb.value),
        addConnProb: parseFloat(dom.addConnProb.value),
        addNodeProb: parseFloat(dom.addNodeProb.value),
        toggleConnProb: parseFloat(dom.toggleConnProb.value),
        actMutProb: parseFloat(dom.actMutProb.value),
        // Topology growth ceilings -- safety caps, not tuning knobs.
        // The reference Pendulum-NEAT project's SOLVED double-pendulum
        // network is 39 nodes / 321 connections; our old 240-conn cap
        // was BELOW that, so addConn mutations were blocked before the
        // network could reach a working capacity. Raised to exceed the
        // reference with headroom. (readParams().mut overrides the
        // defaults in neat.js, so this is the value that actually
        // takes effect during training -- keep the two in sync.)
        maxNodes: 120,
        maxConns: 700,
        // hiddenAct: ACT.* constant for new hidden nodes. Sourced from
        // the UI dropdown, whose options are driven by BF.neat.ACT_META
        // (standard tier always shown; experimental tier behind the
        // "show experimental activations" toggle). Presets that want to
        // pick a default still can -- their value writes to the same
        // <select id="neatHiddenActivation">, just like any other slider
        // setting. Falls back to TANH for back-compat if the element
        // is missing or the value is unknown.
        hiddenAct: (function () {
          const el = dom.neatHiddenActivation;
          const s = String((el && el.value) || 'tanh').toLowerCase();
          const meta = (BF.neat.ACT_META || []).find(m => m.name === s);
          return meta ? meta.kind : BF.neat.ACT.TANH;
        })(),
        mixtureRegime: (dom.mixtureRegime && dom.mixtureRegime.value) || 'pure',
        actPalette: (dom.actPalette && dom.actPalette.value) || 'legacy',
        // checkbox "Existing nodes can change": checked/absent => 'can'
        // (== legacy default, byte/RNG-identical); only an explicit
        // uncheck => 'cant'.
        actMutable: (dom.actMutable && dom.actMutable.checked === false) ? 'cant' : 'can',
        maxFunctionsPerNode: dom.maxFunctionsPerNode ? parseInt(dom.maxFunctionsPerNode.value, 10) : 3,
        mixtureCombine: (dom.mixtureCombine && dom.mixtureCombine.value) || 'raw',
        mixtureAllowExperimental: dom.showExperimentalActs ? dom.showExperimentalActs.checked : false,
      },
    };
    // Fold in the GENERATED curriculum-knob sliders (buildCurriculumKnobSliders)
    // so manual slider changes reach trainer.params as the BASE value; a
    // curriculum spec on the same key overrides it via resolved() while ramping.
    // ONLY fold a slider that's been MOVED off its default: leaving it at the
    // default must defer to the SETUP's own default (which may be smarter /
    // derived — e.g. traceAcceptRadius=default means "use max(traceRadius,30)",
    // and folding the raw 160 would wrongly override every chain-trace scene's
    // closeness scale and let a do-nothing policy score high). A moved slider,
    // or a curriculum spec on the key, is the explicit opt-in.
    // EXCEPT where the default is itself a meaningful value the setup
    // interprets, which the knob declares with foldAtDefault. traceCenterY is
    // the case: 0 is not "unset", it is the AUTO sentinel. Skipping it at the
    // default meant the key vanished from _p.train, syncTrainerParams'
    // Object.assign left the PREVIOUS number on trainer.params, and dragging
    // the slider back to 0 could never restore the auto-placement — which is
    // exactly what the slider's own label and three preset descriptions tell
    // the user to do.
    if (app._curriculumKnobKeys) {
      const knobs = (BF.trainer && BF.trainer.CURRICULUM_KNOBS) || [];
      for (const key of app._curriculumKnobKeys) {
        const el = dom[key];
        if (!el) continue;
        const moved = parseFloat(el.value) !== parseFloat(el.defaultValue);
        const kb = knobs.find(k => k.key === key);
        const explicitlySet = presetOverridesApply() && app.explicitPresetParamKeys && app.explicitPresetParamKeys.has(key);
        if (moved || explicitlySet || (kb && kb.foldAtDefault)) {
          _p.train[key] = parseFloat(el.value);
        }
      }
    }
    // terrain-run knobs (terrainDifficulty / terrainObservationMode / every
    // terrain* geometry + physics override). Folded in wholesale from the
    // preset stash: the setup's own terrainGeometry() is what interprets them,
    // and it only honours the terrain* spelling, so nothing here can leak into
    // another setup's world. Absent stash => no keys => the setup's defaults.
    if (app.terrainOverride && presetOverridesApply()) {
      Object.assign(_p.train, app.terrainOverride);
    }
    if (app.replayCriteria && presetOverridesApply()) Object.assign(_p.train, app.replayCriteria);
    return _p;
  }

  function syncTrainerParams() {
    if (!app.trainer) return;
    const p = readParams();
    Object.assign(app.trainer.params, p.train);
    Object.assign(app.trainer.mutationParams, p.mut);
    if (app.trainer.population.length !== p.train.populationSize) {
      // Fixed-topology algorithms keep per-individual parameter vectors and
      // optimizer state (CMA covariance, DE targets, PSO velocities, ...).
      // Padding them with plain NEAT genomes would create entries with no
      // params and break the next update. Rebuild those modes instead.
      if (!T.isNeatMode(p.train.mode)) {
        rebuildTrainerFromUI();
        return;
      }
      // Pop size changed → trim or refill.
      if (app.trainer.population.length > p.train.populationSize) {
        app.trainer.population.length = p.train.populationSize;
      } else {
        const setup = BF.setups.getSetup(app.trainer.setupId);
        const numIn = setup.observationCount;
        while (app.trainer.population.length < p.train.populationSize) {
          const g = N.makeGenome(numIn, 1);
          app.trainer.population.push({ genome: g, fitness: 0 });
        }
      }
    }
    // Hot-apply physics tweaks to the currently visible sim too.
    if (app.showState) {
      app.showState.world.gravity = p.train.gravity;
      app.showState.world.damping = p.train.damping;
      app.showState.world.cartAccel = p.train.cartAccel;
      app.showState.world.cartMaxSpeed = p.train.cartMaxSpeed;
      app.showState.world.cartDrag = p.train.cartDrag;
      app.showState.world.cartControlMode = p.train.cartControlMode;
      // Terrain has its own collision grid; the cart is only a drawing mirror.
      // Inherited pendulum wall settings must not pin its follow camera when
      // an unrelated control (including demo playback speed) hot-applies.
      app.showState.world.cartWallsEnabled = app.showState.terrainRun ? false : p.train.cartWallsEnabled;
    }
  }

  // ---- Diffsim mode (exact-gradient backends as a selectable "mode") ----
  // True when the algorithm dropdown is on one of the differentiable-physics
  // backends. Every diffsim hook below is gated on this, so the population
  // path stays byte-identical for all other modes.
  function isDodgeScorerMode() {
    return dom.modeSelect?.value==='dodge-scorer' && dom.setupSelect?.value==='dodge' && !!app.dodgeScorerRecord;
  }
  function isDiffsimMode() {
    return !!(BF.diffsimMode && dom.modeSelect
              && BF.diffsimMode.isActive(dom.modeSelect.value));
  }
  // Dodge planner mode: model-based receding-horizon planning on the dodge
  // setup (BF.dodgePlanner). Uses the same facade-trainer pattern as the
  // diffsim modes, but the DISPLAY runs the normal physics path — the planner
  // is installed as app.showPolicy (it ignores obs and plans from the live
  // bullet state, model-based like LQR).
  function isSingleSwingupMode() {
    return dom.modeSelect.value === 'single-energy-lqr';
  }

  function isDodgePlannerMode() {
    return !!(BF.dodgePlanner && dom.modeSelect && dom.modeSelect.value === 'dodge-planner');
  }
  // Signing planner: model-based receding-horizon planning on the chain-trace
  // setup (BF.chainTracePlanner). Same facade shape as the dodge planner — a
  // population trainer holds the chart/HUD scaffolding while the DISPLAY runs
  // the normal chain physics with the planner installed as app.showPolicy. The
  // planner ignores the observation vector entirely and plans from the live
  // world state (model-based, like LQR), so the setup's lookahead observation
  // flag is irrelevant to it.
  function isSigningPlannerMode() {
    return !!(BF.chainTracePlanner && dom.modeSelect
              && dom.modeSelect.value === 'signing-planner');
  }
  // Epicycle signer, ANALYTIC drive: the third engineered mode, and the most
  // extreme of them — there is not even a search. The arm lengths/rates ARE the
  // curve's DFT coefficients and the angles are set from the closed form each
  // tick, so the drawing is the provably optimal N-arm approximation BY
  // CONSTRUCTION. Nothing to train, nothing to plan. Same facade shape as the
  // two planners: a population trainer holds the chart/HUD scaffolding, the
  // display runs the normal epicycle world, and the policy is INERT (the setup's
  // analytic tick ignores commands entirely — see makeEpicycle.tick).
  function isEpicycleAnalyticMode() {
    return !!(BF.curveFourier && dom.modeSelect
              && dom.modeSelect.value === 'epicycle-analytic');
  }
  // Distill mode: behavioral-cloning + DAgger of the planner into a network.
  // Unlike the planner, the distilled net DOES train — you watch its survival
  // climb toward the planner ceiling generation by generation.
  function isDodgeDistillMode() {
    return !!(BF.dodgeDistill && dom.modeSelect && dom.modeSelect.value === 'dodge-distill');
  }
  // One distill "generation": gen 0 collects expert demos (behavioral cloning);
  // later gens collect on the STUDENT's own trajectory (DAgger — the fix for
  // BC's compounding drift), then train a few epochs. Plots the student's
  // survival (evaluated every gen) as the fitness curve.
  async function stepDodgeDistillGeneration() {
    const t = app.trainer;
    if (!t) return;
    if (!app.dodgeDistill) {
      app.dodgeDistill = { dd: BF.dodgeDistill.create({ hidden: 48, labelReplan: 2,
                             maxSamples: 20000, spawnRate: distillSpawnRate(),
                             seed: resolveSeed(), worldOpts: Object.assign({}, t.params) }), lastSurv: 0 };
      // Install the distilled net as the live display policy. makePolicy closes
      // over dd, whose weights train in place -> the live view tracks the
      // student improving without re-installing each gen.
      app.showPolicy = BF.dodgeDistill.makePolicy(app.dodgeDistill.dd);
    }
    const D = app.dodgeDistill.dd;
    const gen = t.generation + 1;
    const baseSeed = ((resolveSeed() + gen * 4099) >>> 0) || 1;
    // Light per-gen budget (~1-2s) — DAgger AGGREGATES across generations, so
    // small chunks are fine and the survival curve climbs gen by gen.
    if (gen === 1) {
      for (let i = 0; i < 3; i++) BF.dodgeDistill.collect(D, 'expert', 1000, (baseSeed + i * 131) >>> 0);
      for (let e = 0; e < 16; e++) BF.dodgeDistill.trainEpoch(D);
    } else {
      const student = (obs) => BF.dodgeDistill.forward(D, obs);
      for (let i = 0; i < 2; i++) BF.dodgeDistill.collect(D, student, 1000, (baseSeed + i * 131) >>> 0);
      for (let e = 0; e < 10; e++) BF.dodgeDistill.trainEpoch(D);
    }
    const surv = BF.dodgeDistill.evalSurvival(D, { seeds: [101, 202, 303],
                                                   capSeconds: 12, spawnRate: distillSpawnRate() });
    app.dodgeDistill.lastSurv = surv;
    BF.dodgeDistill.retainValidationBest(D, surv);
    t.history.push({ gen: gen, best: surv, avg: surv, median: surv, worst: surv,
                     avgNodes: 0, avgConns: 0, species: 1, dsLoss: D.lastLoss, samples: D.samples });
    t.generation = gen;
    t.lastStats = { gen: gen, best: surv, avg: surv, median: surv, worst: surv,
                    ms: 0, evalsPerSec: 0, avgNodes: 0, avgConns: 0, species: 1 };
    const prev = isFinite(t.bestEverFitness) ? t.bestEverFitness : -Infinity;
    if (surv > prev) t.bestEverFitness = surv;
    app.evalsPerSec = 0;
    await new Promise(r => setTimeout(r, 0));
  }
  function distillSpawnRate() {
    const el = dom.dodgeSpawnRate; const v = el ? parseFloat(el.value) : NaN;
    return isFinite(v) ? v : 3;
  }
  // Options handed to the engine. The diffsim backends carry their own
  // DEFAULTS, but the main UI's controls MUST take effect (gravity, cart accel,
  // hidden units, tilt, curriculum) or the mode feels broken ("ignores what I
  // set"). We read the relevant DOM controls here and clamp to safe ranges.
  // Controls that don't map (population size, mutation, speciation) are omitted.
  function diffsimOptsFromUI() {
    const num = (el, d) => { const v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : d; };
    const cartAccel = clamp(num(dom.cartAccel, 1600), 200, 12000);
    // Tilt up to 180° (full inversion / swing-up) — the tiltDeg slider goes to
    // 180 and the curriculum ramps startTiltDeg there. Clamping at 60 would
    // silently cap the swing-up preset.
    const tilt = clamp(currentTiltDeg(), 1, 180);
    return {
      itersPerGen: 6,
      gravity: clamp(num(dom.gravity, 700), 100, 2000),
      cartAccel: cartAccel,
      hidden: clamp(Math.round(num(dom.cmaesHidden, 8)), 2, 32),
      pertDeg: tilt,                                   // fixed-tilt (no-curriculum) start
      referencePhase: app.pendulumReplayContext?.mode === 'hold' ? 'hold' : 'swingup',
      seed: (typeof resolveSeed === 'function') ? resolveSeed() : 20260712,
      // Swing-up control-rate smoothness weight (rigid modes) — stashed from the
      // preset in loadRunPreset. 0 = original behavior; the triple sets 20.
      ctrlRateW: (app.diffsimCtrlRateW != null) ? app.diffsimCtrlRateW : 0,
      // Bound the cart to a rail (differentiable soft wall) so the policy solves
      // the SAME bounded-track task the display shows, instead of "balancing" by
      // sliding the cart off to infinity. ~150 diffsim units maps to ~206 display
      // px; a firm wallK leaves room for the soft-wall overshoot to stay inside
      // the +/-260 rail via the ~1.375 display scale.
      railHalf: 150, wallK: 500,
      // Memetic mode (diffsim-memetic) params. Reuse the EXISTING population
      // controls -- this is the "fits the GA UI" win: popSize + elite ratio now
      // actually drive a real population of exact-gradient policies. localIters =
      // gradient refinement steps per individual per gen; mutationScale = clone
      // noise. Ignored by the single-policy diffsim modes. Capped at 16: each
      // individual is localIters x 4 autodiff rollouts PER GEN, so the slider's
      // population-scale values (120+) would mean minutes between chart points.
      popSize: clamp(Math.round(num(dom.popSize, 10)), 3, 16),
      eliteFrac: clamp(num(dom.eliteRatio, 0.3), 0.05, 0.9),
      localIters: 2,
      mutationScale: 0.12,
      // Swing-up/unstick machinery (see diffsim_trainer/diffsim_mode): energy
      // shaping only matters at 90°+ tilts (A/B probe: no effect at 44°, kept
      // for the swing-up regime); the basin-hop escape is a LAST resort behind
      // the curriculum's adaptive pacing (probe: aggressive escapes wreck the
      // policy instead of hopping basins).
      energyShapeW: 1.0,
      escapeAfter: 24,
      escapeScale: 0.15,
      // LQR uses maxAccel for its control clamp; give it at least its tuned
      // authority, more if the user cranked cart accel.
      maxAccel: Math.max(6000, cartAccel * 2),
      // Native perturbation curriculum on the 0-1 meanUp scale (see
      // js/diffsim_mode.js). Reads the same curriculum controls as the
      // population path, reinterpreted for the differentiable rollout.
      curriculum: {
        enabled: dom.curriculumOn ? dom.curriculumOn.checked : false,
        maxLevel: clamp(Math.round(num(dom.curriculumMaxLevel, 6)), 1, 40),
        thresholdFrac: clamp(num(dom.curriculumThreshold, 0.9), 0.1, 0.999),
        consecReq: clamp(Math.round(num(dom.curriculumConsec, 2)), 1, 20),
        startFrac: clamp(num(dom.curriculumStartFrac, 0.25), 0.02, 1),
        maxPertDeg: tilt,                              // hardest level = the tilt slider
        // The SAME curriculum specs the population path uses. The diffsim engine
        // ramps the ones it can (startTiltDeg -> perturbation, gravity/damping/
        // stiffness -> config); others are shown N/A. This is what makes
        // "angle:10->180; g:min->980" actually take effect in grad mode.
        specs: (app.curriculumSpecs || []).map(s => ({
          paramKey: s.paramKey, from: s.from, to: s.to, mode: s.mode,
          steps: s.steps != null ? (s.steps | 0) : null,
        })),
      },
    };
  }
  // Re-create the diffsim run from the current UI when a wired control changes,
  // and reset the facade chart so the new settings start a clean curve. No-op
  // outside diffsim mode. Bound to the wired controls' `change` events below.
  function refreshDiffsimRunIfActive() {
    if (!isDiffsimMode() || !app.trainer || !BF.diffsimMode) return;
    try { app.diffsimRun = BF.diffsimMode.create(dom.modeSelect.value, diffsimOptsFromUI()); }
    catch(error){app.diffsimRun=null;app.training=false;app.paused=true;document.getElementById('liveNudgeStatus').textContent=error.message;return;}
    app.trainer.history.length = 0;
    app.trainer.generation = 0;
    app.trainer.lastStats = null;
    app.trainer.bestEverFitness = -Infinity;
    computeDiffsimDisplayScale();
    // Same auto-step as enterDiffsimMode: a recreated run (slider change)
    // should immediately show the controller working, not a dead scene.
    if (app.diffsimRun) stepDiffsimGeneration();
  }
  // Display scale = double-setup segment length / diffsim segment length, so
  // the (cart at y=0, up=-y) diffsim frame drops straight into the double
  // showState nodes at the right size. Computed once from the fresh world.
  function computeDiffsimDisplayScale() {
    const st = app.showState, run = app.diffsimRun;
    const seg = (run && run.config && run.config.segLen) ? run.config.segLen : 80;
    // First-link node: double keeps it in midIdx; triple exposes midIdxs[0].
    const firstIdx = st && (st.midIdx != null ? st.midIdx
      : (Array.isArray(st.midIdxs) ? st.midIdxs[0] : null));
    if (st && run && st.cartIdx != null && firstIdx != null
        && st.world && st.world.nodes) {
      const c = st.world.nodes[st.cartIdx], m = st.world.nodes[firstIdx];
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      app._diffsimDispScale = (d > 1 ? d : 110) / seg;
    } else {
      app._diffsimDispScale = 110 / seg;
    }
  }
  // Advance one diffsim "generation" and mirror the result into the facade
  // trainer's history/lastStats/bestEver so the existing fitness chart + HUD
  // render the evolution exactly like any population mode.
  async function stepDiffsimGeneration() {
    if (!app.diffsimRun) {
      app.diffsimRun = BF.diffsimMode.create(dom.modeSelect.value, diffsimOptsFromUI());
      if (!app.diffsimRun) { app.training = false; return; }
      computeDiffsimDisplayScale();
    }
    const stats = BF.diffsimMode.stepGen(app.diffsimRun);
    const t = app.trainer;
    const run = app.diffsimRun;
    if (t && stats) {
      // Grad-only extras (gradNorm/dsLoss/mutScale) feed the diffsim entries in
      // ALGO_INTERNALS_SERIES — the "algorithm internals" chart plots them.
      t.history.push({ gen: stats.gen, best: stats.best, avg: stats.avg,
                       median: stats.median != null ? stats.median : stats.best,
                       worst: stats.worst, avgNodes: 0, avgConns: 0,
                       species: stats.species != null ? stats.species : 1,
                       gradNorm: (run.gradTrace && isFinite(run.gradTrace.gradNorm))
                         ? run.gradTrace.gradNorm : null,
                       dsLoss: isFinite(run.lastLoss) ? run.lastLoss : null,
                       mutScale: run.kind === 'memetic' ? run.mutationScale : null });
      t.generation = stats.gen;
      t.lastStats = stats;
      const prev = isFinite(t.bestEverFitness) ? t.bestEverFitness : -Infinity;
      if (stats.best > prev) t.bestEverFitness = stats.best;
      // Memetic has a REAL population -> feed the population-fitness panel (and
      // the genome-space PCA, via the flat weight vectors) like any GA mode.
      if (run.kind === 'memetic' && run.pop) {
        const nElite = Math.max(1, Math.round(run.pop.length * run.eliteFrac));
        t.evaluatedSnapshot = run.pop.map((e, i) => ({
          rank: i, fitness: Math.max(0, e._fit || 0), genome: null,
          params: BF.diffsimTrainer.snapshotWeights(e),
          targetParams: null, velocity: null,
          nodes: e.config.hidden, conns: e.flat.length, elite: i < nElite,
          saAccepted: null, ptTIndex: null, swarmRank: null,
          fishBehavior: null, whaleAction: null, levyJump: null, behavior: null,
        }));
      }
    }
    app.evalsPerSec = 0;
    // Yield so the browser paints the climbing chart + the balancing display.
    await new Promise(r => setTimeout(r, 0));
  }

  // One dodge-planner "generation" = one full headless ground-truth episode at
  // a fresh seed (real physics + tick). The chart plots survival seconds
  // (capped) per seed — a solved-from-gen-0 flat line at the cap is the point,
  // and any dip below it is a real, reproducible failure seed.
  async function stepDodgePlannerGeneration() {
    const t = app.trainer;
    if (!t) return;
    const gen = t.generation + 1;
    const num = (el, d) => { const v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : d; };
    const res = BF.dodgePlanner.runEpisode({
      spawnRate: num(dom.dodgeSpawnRate, 3),
      pattern: (dom.dodgePattern && dom.dodgePattern.value) || 'mixed',
      seed: ((resolveSeed() + gen * 7919) >>> 0) || 1,
      capSeconds: 30,
    });
    const f = res.survivedS;
    t.history.push({ gen: gen, best: f, avg: f, median: f, worst: f,
                     avgNodes: 0, avgConns: 0, species: 1 });
    t.generation = gen;
    t.lastStats = { gen: gen, best: f, avg: f, median: f, worst: f,
                    ms: 0, evalsPerSec: 0, avgNodes: 0, avgConns: 0, species: 1 };
    const prev = isFinite(t.bestEverFitness) ? t.bestEverFitness : -Infinity;
    if (f > prev) t.bestEverFitness = f;
    app.evalsPerSec = 0;
    await new Promise(r => setTimeout(r, 0));
  }

  // One signing-planner "generation" = one ground-truth trace, measured on the
  // HONEST metric: mean |tip - cursor| in PIXELS over a FULL loop, first second
  // skipped (settling), averaged over start tilts +0.1 and -0.1. There is
  // nothing to train — the FLAT LINE IS THE RESULT, and any spike is a real,
  // reproducible failure seed rather than a learning wobble.
  //
  // The chart plots 0..1 closeness (higher-is-better) so the existing badge /
  // bestEver bookkeeping stays meaningful — the same choice the rigid modes make
  // with meanUp. The PIXEL number is the headline and lives in the HUD, never in
  // the chart. BF.chainTracePlanner exposes create/command (no runEpisode), so
  // the rollout loop lives here.
  async function stepSigningPlannerGeneration() {
    const t = app.trainer;
    if (!t) return;
    const gen = t.generation + 1;
    const setup = BF.setups.getSetup('chain-trace');
    const tp = t.params;
    // Shape comes from the SINGLETON (syncSetupObservationCounts already set it
    // from the DOM). Do NOT re-shape here: it is shared with the display and the
    // facade population, and re-shaping mid-run trips the INPUT MISMATCH HUD.
    const DT = 1 / 120;
    const period = tp.tracePeriod || 12;
    const steps = Math.round((period + 1) / DT);   // one full loop past the skip
    const skip = Math.round(1 / DT);
    const worldOpts = {
      gravity: tp.gravity, damping: tp.damping, cartAccel: tp.cartAccel,
      cartMaxSpeed: tp.cartMaxSpeed, cartDrag: tp.cartDrag,
      material: tp.material, jointControlMode: tp.jointControlMode,
      curveId: tp.curveId, tracePeriod: tp.tracePeriod, traceRadius: tp.traceRadius,
      traceCenterY: tp.traceCenterY,   // planner probe must grade the SAME placement training uses
      traceCenterX: tp.traceCenterX, traceCenterMode: tp.traceCenterMode,
      numSegments: tp.numSegments,
    };
    let sum = 0, n = 0, worst = 0;
    for (const tilt of [0.1, -0.1]) {
      const st = setup.buildWorld(Object.assign({}, worldOpts, { startAngle: tilt }));
      const pl = BF.chainTracePlanner.create({ kind: tp.signingPlannerKind || 'planner' });
      for (let k = 0; k < steps; k++) {
        const cmd = BF.chainTracePlanner.command(pl, st);
        st.lastCmd = cmd[0]; st.lastCmds = cmd;
        BF.physics.step(st.world, DT, cmd[0]);
        if (setup.tick) setup.tick(st, DT);
        if (k >= skip) {
          const tip = st.world.nodes[st.tipIdx], tg = st.chainReach.target;
          const e = Math.hypot(tip.x - tg.x, tip.y - tg.y);
          sum += e; n++; if (e > worst) worst = e;
        }
      }
    }
    const tipErrPx = n ? sum / n : 0;
    // Same closeness scale the chain_trace objective uses, so the chart reads
    // like every other run: 1 = on the curve, 0 = a full distScale away.
    const ref = Math.max(tp.traceRadius || 100, 30);
    const f = Math.max(0, 1 - tipErrPx / ref);
    app.signingPlanner = { tipErrPx: tipErrPx, worstPx: worst, closeness01: f, gen: gen };
    t.history.push({ gen: gen, best: f, avg: f, median: f, worst: f,
                     avgNodes: 0, avgConns: 0, species: 1 });
    t.generation = gen;
    t.lastStats = { gen: gen, best: f, avg: f, median: f, worst: f,
                    ms: 0, evalsPerSec: 0, avgNodes: 0, avgConns: 0, species: 1 };
    const prev = isFinite(t.bestEverFitness) ? t.bestEverFitness : -Infinity;
    if (f > prev) t.bestEverFitness = f;
    app.evalsPerSec = 0;
    await new Promise(r => setTimeout(r, 0));
  }

  // One epicycle-analytic "generation" = one ground-truth trace of the machine,
  // measured on the HONEST metric: mean |tip - cursor| in PIXELS over a FULL
  // loop. Deliberately NOT read off curve_fourier's own errorVs() — that would
  // grade the maths against itself. This builds the REAL setup world, steps the
  // REAL 120 Hz loop with a zero command, and measures the actual pen node
  // against the actual moving cursor, so a wiring bug (wrong arm count, wrong
  // basis, a tick that stops advancing) shows up as a bad number instead of
  // hiding behind the analysis module. It reproduces errorVs to 0.01 px, which
  // is the point: the agreement is a RESULT, not an assumption.
  //
  // No start-tilt sweep and no settling skip is needed the way the chain planner
  // needs them (this plant has no gravity, no springs and no transient), but the
  // 1s skip is kept anyway so the measured window is one clean loop at an offset
  // phase — verified protocol-invariant: 60 Hz, no-skip and 3-loop variants all
  // return the same number to 0.01 px.
  //
  // The chart plots 0..1 closeness (higher-is-better) so the shared badge /
  // bestEver bookkeeping stays meaningful — the same choice the rigid modes and
  // the signing planner make. The PIXEL number is the headline and lives in the
  // HUD, never in the chart.
  async function stepEpicycleAnalyticGeneration() {
    const t = app.trainer;
    if (!t) return;
    const gen = t.generation + 1;
    const setup = BF.setups.getSetup('epicycle');
    if (!setup) return;
    const tp = t.params;
    // Shape comes from the SINGLETON (syncSetupObservationCounts already set it
    // from the preset's epiArms / the measured per-curve default). Do NOT
    // re-shape here: it is shared with the display and the facade population,
    // and re-shaping mid-run trips the INPUT MISMATCH HUD.
    const DT = 1 / 120;
    const period = tp.tracePeriod || 8;
    const steps = Math.round((period + 1) / DT);   // one full loop past the skip
    const skip = Math.round(1 / DT);
    const worldOpts = {
      curveId: tp.curveId, tracePeriod: tp.tracePeriod, traceRadius: tp.traceRadius,
      epiArms: tp.epiArms, epiBasis: tp.epiBasis,
      epiDrive: 'analytic',           // this MODE is the analytic drive, by definition
      epiTelescope: !!tp.epiTelescope, epiWarmPhase: !!tp.epiWarmPhase,
    };
    const st = setup.buildWorld(worldOpts);
    const zero = new Array(Math.max(1, setup.actionCount | 0)).fill(0);
    let sum = 0, n = 0, worst = 0;
    for (let k = 0; k < steps; k++) {
      st.lastCmd = 0; st.lastCmds = zero;
      BF.physics.step(st.world, DT, 0);
      if (setup.tick) setup.tick(st, DT);
      if (k >= skip) {
        const tip = st.world.nodes[st.tipIdx], tg = st.chainReach.target;
        const e = Math.hypot(tip.x - tg.x, tip.y - tg.y);
        sum += e; n++; if (e > worst) worst = e;
      }
    }
    const tipErrPx = n ? sum / n : 0;
    // Same closeness scale the chain_trace objective uses, so the chart reads
    // like every other run: 1 = on the curve, 0 = a full distScale away.
    const ref = Math.max(tp.traceRadius || 140, 30);
    const f = Math.max(0, 1 - tipErrPx / ref);
    app.epicycleAnalytic = {
      tipErrPx: tipErrPx, worstPx: worst, closeness01: f, gen: gen,
      arms: st.epi.numArms, basis: st.epi.basis, curveId: st.chainTrace.curveId,
    };
    t.history.push({ gen: gen, best: f, avg: f, median: f, worst: f,
                     avgNodes: 0, avgConns: 0, species: 1 });
    t.generation = gen;
    t.lastStats = { gen: gen, best: f, avg: f, median: f, worst: f,
                    ms: 0, evalsPerSec: 0, avgNodes: 0, avgConns: 0, species: 1 };
    const prev = isFinite(t.bestEverFitness) ? t.bestEverFitness : -Infinity;
    if (f > prev) t.bestEverFitness = f;
    app.evalsPerSec = 0;
    await new Promise(r => setTimeout(r, 0));
  }

  // ---- Training loop ----
  function ppoSceneFromUI() {
    const params=readParams().train;
    return {setupId:app.trainer.setupId,gravity:params.gravity,cartAccel:params.cartAccel,cartDrag:params.cartDrag,cartMaxSpeed:params.cartMaxSpeed,
      damping:params.damping,physicsDt:params.physicsDt,pendulumRailHalfWidth:params.pendulumRailHalfWidth || 260,
      pendulumInitialState:params.pendulumInitialState,pendulumInitialStateSpread:params.pendulumInitialStateSpread,
      cartControlMode:'force',uprightAssist:0,jointDamping:0,startAngleDeg:params.startTiltDeg,
      startAngleSpreadDeg:params.startTiltSpreadDeg,episodeSeconds:params.evalSeconds,
      useDisturb:params.useDisturb,pushTarget:params.pushTarget,pushStrength:params.pushStrength,
      pushDuration:params.pushDuration,pushSmoothing:params.pushSmoothing,
      pushIntervalMin:params.pushIntervalMin,pushIntervalMax:params.pushIntervalMax};
  }
  async function stepPPOUpdate() {
    if (!BF.ppoTrainer || !['single','double','triple'].includes(app.trainer.setupId)) throw new Error('PPO currently supports the single, double and triple point-mass pendulums.');
    app.pendulumObservationMode='angular';
    if(dom.singleObservationMode)dom.singleObservationMode.value='full';
    syncSetupObservationCounts();
    const params = readParams().train;
    dom.curriculumOn.checked=false;
    Object.assign(app.trainer.params,{pendulumObservationMode:'angular',singleObservationMode:'full',curriculumEnabled:false});
    if (params.cartControlMode !== 'force' || params.uprightAssist || params.jointDamping || params.policyType !== 'mlp')
      throw new Error('Choose the PPO training preset: direct acceleration, no upright helpers, MLP actor.');
    const scene=ppoSceneFromUI();
    const signature=JSON.stringify(scene);
    if (!app.ppoRun || app.ppoSignature !== signature) {
      app.ppoRun=BF.ppoTrainer.create({...scene,seed:resolveSeed(),hiddenSizes:[32,32],numEnvs:8,rolloutSteps:128,epochs:4,minibatchSize:128,
        termination:scene.startAngleDeg>=90?'none':'fall',rewardMode:scene.startAngleDeg>=90?'swingup':'balance'});
      app.ppoSignature=signature;app.trainer.history.length=0;
    }
    const owner=app.trainer,engine=app.ppoRun,started=performance.now(),token=app.ppoRunToken||0;
    const stats=await engine.stepUpdateAsync({cancelled:()=>app.trainer!==owner||app.ppoRun!==engine||(app.ppoRunToken||0)!==token});
    if (!stats || stats.cancelled || app.trainer!==owner || app.ppoRun!==engine||(app.ppoRunToken||0)!==token) return;
    const record=engine.exportRecord();
    BF.championIO.install(app.trainer,record);
    app.trainer.currentBest=app.trainer.bestEver;
    app.trainer.generation=stats.update;
    // This is rollout occupancy, not an independently measured success rate.
    app.trainer.bestEverFitness=stats.aboveFraction;
    app.trainer.history.push({gen:stats.update,best:stats.aboveFraction,avg:stats.aboveFraction,worst:stats.aboveFraction,
      median:stats.aboveFraction,avgNodes:record.genome.nodes.length,avgConns:record.genome.conns.length,species:0,
      gradNorm:stats.gradientNorm,policyLoss:stats.policyLoss,valueLoss:stats.valueLoss});
    app.trainer.lastStats={...stats,gen:stats.update,best:stats.aboveFraction,avg:stats.aboveFraction,worst:stats.aboveFraction,
      avgNodes:record.genome.nodes.length,avgConns:record.genome.conns.length,species:0,ms:performance.now()-started};
    app.evalsPerSec=0;
    const panel=document.getElementById('ppoTrainingStatus');
    if(panel)panel.textContent=`PPO update ${stats.update} · ${stats.totalSteps.toLocaleString()} physics steps · policy loss ${stats.policyLoss.toFixed(4)} · value loss ${stats.valueLoss.toFixed(4)} · gradient norm ${stats.gradientNorm.toFixed(3)} · KL ${stats.approxKL.toFixed(4)} · clipped ${(stats.clipFraction*100).toFixed(1)}% · Gaussian entropy ${stats.entropy.toFixed(3)} · above horizontal ${(stats.aboveFraction*100).toFixed(1)}% of exploration steps · rail ${(stats.railFraction*100).toFixed(2)}%. Playback shows the deterministic actor; these training metrics are not a held-out success rate.`;
    rebuildDisplayState();app.genomeRenderer.invalidate();
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  async function runOneGeneration() {
    if (!app.trainer || isDodgeScorerMode()) return;
    if (dom.modeSelect.value === 'ppo') {
      const pending=stepPPOUpdate();app.ppoPendingUpdate=pending;
      try{await pending;}finally{if(app.ppoPendingUpdate===pending)app.ppoPendingUpdate=null;}
      return;
    }
    if (isDiffsimMode()) { await stepDiffsimGeneration(); return; }
    if (isDodgePlannerMode()) { await stepDodgePlannerGeneration(); return; }
    // Early return keeps BF.trainer.step — and therefore the worker pool's
    // population eval — from ever touching a genome for a mode that has none.
    if (isSigningPlannerMode()) { await stepSigningPlannerGeneration(); return; }
    // Same guarantee for the epicycle: the facade population exists ONLY to hold
    // the chart/HUD scaffolding, so the worker pool must never be handed a
    // genome for a mode whose drawing does not depend on one.
    if (isEpicycleAnalyticMode()) { await stepEpicycleAnalyticGeneration(); return; }
    if (isDodgeDistillMode()) { await stepDodgeDistillGeneration(); return; }
    syncTrainerParams();
    // Yield within the eval loop every 8ms so the browser can paint frames —
    // otherwise a 200–500ms generation freezes the network/sim animation.
    //
    // Full-power mode (Core checkbox) flips this to 0 = never yield
    // mid-gen, so the JIT runs the whole eval loop end-to-end with no
    // event-loop tax. The inter-gen `await new Promise(setTimeout)`
    // in trainContinuously still gives the browser a tick between
    // generations, so the tab stays minimally responsive even when
    // a single gen is many seconds long.
    const fullPower = getActiveFullPower();
    const yieldMs = fullPower ? 0 : 8;
    const generationTrainer = app.trainer;
    const stats = await T.step(generationTrainer, yieldMs);
    // A saved controller can be loaded while population evaluation is awaiting
    // a worker. The old result must never replace its policy or displayed state.
    if (app.trainer !== generationTrainer || isDodgeScorerMode()) return;
    app.evalsPerSec = stats.evalsPerSec;
    // Compare mode: step the secondary trainer in lockstep. One gen of A,
    // then one gen of B. Their per-gen evals are interleaved so total
    // wall time roughly doubles, but the comparison is fair (both see
    // the same elapsed time per gen-pair). If B's setup needs a
    // different observationCount than A's, setObservationMode is called
    // here to flip it before B steps -- they share the setup singleton
    // which gets re-mutated each direction.
    if (app.trainerB) {
      const tB = app.trainerB;
      const setupB = BF.setups.getSetup(tB.setupId);
      applySetupObsMode(setupB, tB.setupId, tB.params);
      await T.step(tB, yieldMs);
      if (app.trainer !== generationTrainer || app.trainerB !== tB || isDodgeScorerMode()) return;
      // Restore setup's obs mode back to A's so the display reads the
      // primary's observation each frame (the sim viewer continues to
      // show A's best agent in compare mode v1).
      const setupA = BF.setups.getSetup(app.trainer.setupId);
      applySetupObsMode(setupA, app.trainer.setupId, app.trainer.params);
    }
    // In no-reset mode, don't rebuild the world at gen end -- swap the
    // displayed policy in place so the user sees the new best dodging
    // the SAME ongoing bullet stream. Lets the user watch evolution
    // unfold continuously without scene resets.
    const noResetActive = !!(app.trainer.params && app.trainer.params.dodgeNoReset
                              && app.showState && app.showState.dodge);
    if (noResetActive) {
      // Hot-swap the policy on the existing showState. The world keeps
      // running with whatever bullets are currently in flight; only the
      // controller changes. Pull best-ever / currentBest the same way
      // rebuildDisplayState picks its policy target.
      const tr = app.trainer;
      const policyType = tr.params.policyType;
      const isCNN     = policyType === 'cnn';
      const isCNN3D   = policyType === 'cnn3d';
      const isCNNGrid = policyType === 'cnn-grid';
      const isCNNMulti = policyType === 'cnn-multiscale';
      const isRecurrent = policyType === 'recurrent';
      const isCNNLike = isCNN || isCNN3D || isCNNGrid || isCNNMulti || isRecurrent;
      const cnnLikeConfig =
        isCNN3D    ? tr.cnn3dConfig          :
        isCNNGrid  ? tr.cnnGridConfig        :
        isCNNMulti ? tr.cnnMultiscaleConfig  :
        isRecurrent ? tr.recurrentConfig     :
                     tr.cnnConfig;
      let policyTarget;
      if (app.testing && tr.bestEver) {
        policyTarget = (isCNNLike && tr.bestEverParams)
          ? { genome: tr.bestEver, params: tr.bestEverParams, config: cnnLikeConfig }
          : tr.bestEver;
      } else if (tr.currentBest) {
        if (isCNNLike && tr.population[0] && tr.population[0].params) {
          policyTarget = { genome: tr.currentBest, params: tr.population[0].params, config: cnnLikeConfig };
        } else {
          policyTarget = tr.currentBest;
        }
      } else {
        policyTarget = tr.population[0];
      }
      app.showPolicy = BF.trainer.makePolicy(tr, policyTarget);
      // Re-apply curriculum overlay to the displayed dodge pattern
      // controller. Pattern controllers (rain / sweep / aimed / spiral
      // / mixed) cache their config -- spawnRate, speed, bulletSize,
      // leadTime, bulletsPerWave -- at makeController time and never
      // re-read it. Without this rebuild, curriculum ramps on
      // dodgeSpawnRate / dodgeBulletSpeed / etc. would never take
      // effect on the live preview (trainer side still ramps correctly
      // because it builds a fresh world per rollout). We rebuild the
      // controller in place; bullets already in flight on state.dodge
      // .bullets stay, so the "continuous sim" feel is preserved --
      // only the spawn schedule + future-bullet params change. Carries
      // the previous controller's `nextSpawn` / `nextWave` / `elapsed`
      // / `phase` counters across so the schedule doesn't reset to 0
      // every gen (which would cause a small burst of bullets at every
      // level-up). Field set per-pattern, missing fields are silently
      // skipped.
      const dst = app.showState && app.showState.dodge;
      if (dst && dst.patternDef && dst.patternDef.makeController) {
        const tp = tr.params;
        const A = (k) => appliedCurriculumParam(tp, k);
        const newPatternParams = {
          spawnRate:      A('dodgeSpawnRate'),
          speed:          A('dodgeBulletSpeed'),
          bulletSize:     A('dodgeBulletRadius'),
          leadTime:       A('dodgeLeadTime'),
          predictOrder:   tp.dodgePredictOrder,
          bulletsPerWave: A('dodgeBulletsPerWave'),
        };
        const oldCtrl = dst.patternCtrl || {};
        const freshCtrl = dst.patternDef.makeController(dst.patternRng, newPatternParams);
        // Preserve schedule-relevant counters from the old controller
        // so the bullet cadence stays continuous across the swap.
        for (const k of ['nextSpawn', 'nextWave', 'elapsed', 'phase', 'history']) {
          if (oldCtrl[k] !== undefined) freshCtrl[k] = oldCtrl[k];
        }
        dst.patternCtrl = freshCtrl;
        dst.patternParams = newPatternParams;
      }
    } else {
      // Default: full rebuild so the new best gets a fresh attempt.
      // Without this, the user sees policies trying to "recover" from
      // worlds that are already dead.
      rebuildDisplayState();
      app.simRenderer.clearTrail();
    }
  }

  async function trainContinuously() {
    const owner = app.trainer;
    const token = app.trainingLoopToken = (app.trainingLoopToken || 0) + 1;
    const ownsSession = () => app.trainer === owner && app.trainingLoopToken === token;
    try {
    // Resume waits for an in-flight generation to finish; two loops must never
    // mutate the same trainer concurrently after a fast Pause → Train action.
    if (app.trainingGeneration) await app.trainingGeneration.catch(() => {});
    if (!ownsSession()) return;
    while (app.training && ownsSession()) {
      const pending = runOneGeneration();
      app.trainingGeneration = pending;
      try { await pending; }
      finally { if (app.trainingGeneration === pending) app.trainingGeneration = null; }
      if (!ownsSession()) return;
      // Adaptive auto-stop: the trainer tracks a recent-fitness window and
      // marks the run as "converged" when it's BOTH stable (variance below
      // a small threshold) AND good enough (within reach of theoretical
      // max). Stops once that's been true for the user-configured count.
      if (dom.autoStopOn.checked && app.trainer) {
        const limit = parseInt(dom.autoStopGens.value, 10) || 20;
        const conv = app.trainer.lastConvergence;
        if (conv && conv.gensConverged >= limit) {
          app.training = false;
          app.autoStopReason = `converged (stable + good enough for ${limit} gens)`;
          // Surface in the event log too so the user has a chronicle.
          if (app.trainer.eventLog) {
            app.trainer.eventLog.push({
              gen: app.trainer.generation,
              kind: 'stop',
              text: `auto-stopped: ${app.autoStopReason}`,
            });
          }
          break;
        }
      }
      await new Promise(r => setTimeout(r, 0));
    }
    } catch (err) {
      if (!ownsSession()) return;
      // A generation (or its post-gen display rebuild) threw. Without this
      // catch the loop died as an unhandled rejection with app.training
      // stuck true — the Train button's `if (app.training) return;` guard
      // then made training permanently inert ("it never proceeds"). Surface
      // the error and return the app to a startable state instead.
      console.error('[train] generation error — training stopped:', err);
      app.autoStopReason = 'error: ' + (err && err.message ? err.message : String(err));
      if (app.trainer && app.trainer.eventLog) {
        app.trainer.eventLog.push({
          gen: app.trainer.generation,
          kind: 'stop',
          text: 'training stopped by error: ' + (err && err.message ? err.message : String(err)),
        });
      }
      app.training = false;
      if (dom.trainBtn) dom.trainBtn.classList.remove('active');
    }
  }

  // Kinematically drive the double-pendulum showState from the diffsim run's
  // precomputed frames (no P.step — we replay the differentiable rollout).
  // Node coords: cart at (cx,0), up=-y — same convention as the double setup,
  // so only a size scale is needed. Setting px/py = x/y zeroes Verlet velocity.
  function tickDiffsimDisplay(dtMs) {
    const run = app.diffsimRun, st = app.showState;
    if (!run || !st || !st.world || !st.world.nodes) return;
    // Triple frames drive midIdxs[0..2]; double frames drive midIdx+tipIdx.
    const isTriple = !!(run.isTriple && Array.isArray(st.midIdxs) && st.midIdxs.length >= 3);
    if (st.cartIdx == null) return;
    if (!isTriple && (st.midIdx == null || st.tipIdx == null)) return;
    const speed = getActiveSimSpeed();
    const cdt = (run.config && run.config.controlDt) ? run.config.controlDt : (1 / 60);
    const n = BF.util.fixedStepCount(run._displayClock || (run._displayClock = {}),
      (dtMs / 1000) * speed, cdt, 64);
    let fr = null;
    for (let i = 0; i < n; i++) {
      const live=run.liveReference,context=app.pendulumReplayContext;
      if(live && app.testing && context){
        if(!live._replayNudgeRng){live._replayNudgeRng=makeDisplayRng(0x6d03219);live._nudgeTimer=3+2*live._replayNudgeRng.next();}
        // Initial acquisition gates the schedule; later recovery does not.
        if(context.randomNudges && (live.acquiredAt!=null || context.mode==='hold')){
          live._nudgeTimer-=cdt;
          if(live._nudgeTimer<=0){
            const acceleration=(live._replayNudgeRng.next()<.5?-1:1)*(live.validatedPulseStrength||3000);
            BF.rigidReference.nudge(live,{acceleration,duration:.25});
            live._nudgeTimer=3+2*live._replayNudgeRng.next();
          }
        }
      }
      const integration=app.testing && app.playbackPhysicsHz && live
        ? {...live.config,physDt:1/app.playbackPhysicsHz,substeps:Math.round(live.controlDt*app.playbackPhysicsHz)} : undefined;
      fr = BF.diffsimMode.displayFrame(run,{integration});
      if(live && fr?.disturbance)BF.disturb.recordVisual(st,{target:st.cartIdx,fx:fr.disturbance*live.config.maxAccel,fy:0,scale:1,acceleration:true});
    }
    if (!fr) return;
    if (run.liveReference && !run.liveReference.finite) {
      app.paused = true;
      document.getElementById('liveNudgeStatus').textContent = 'Controller diverged · Reset to retry';
      return; // Keep the last finite image; never write NaNs into the renderer.
    }
    const s = app._diffsimDispScale || (110 / 80);
    if (run.liveReference) {
      st.world.damping = 0;
      st.world.cartMinX=-run.liveReference.config.railHalf*s;
      st.world.cartMaxX=run.liveReference.config.railHalf*s;
    }
    const put = (idx, x, y) => {
      const node = st.world.nodes[idx];
      if (!node) return;
      node.x = x; node.y = y; node.px = x; node.py = y; node.vx = 0; node.vy = 0;
    };
    put(st.cartIdx, fr.cx * s, 0);
    if (isTriple && fr.n3) {
      put(st.midIdxs[0], fr.n1.x * s, fr.n1.y * s);
      put(st.midIdxs[1], fr.n2.x * s, fr.n2.y * s);
      put(st.midIdxs[2], fr.n3.x * s, fr.n3.y * s);
    } else {
      put(st.midIdx, fr.n1.x * s, fr.n1.y * s);
      put(st.tipIdx, fr.n2.x * s, fr.n2.y * s);
    }
    // Separate commanded acceleration, rail response, and the applied nudge.
    // The existing push indicator can visualize the pulse at the pivot without
    // modifying the physical state or pretending it was a force on a bob.
    if (fr.a != null) {
      const bobs = (isTriple && fr.n3)
        ? [st.midIdxs[0], st.midIdxs[1], st.midIdxs[2]]
        : [st.midIdx, st.tipIdx];
      st.diffsimForce = { cartAccel: fr.a, wall: fr.wall || 0, disturbance: fr.disturbance || 0,
        cartIdx: st.cartIdx, bobs: bobs };
      if (run.liveReference) {
        const acceleration = (fr.disturbance || 0) * (run.liveReference.config.maxAccel || 1);
        BF.disturb.recordVisual(st, acceleration ? {target:st.cartIdx,fx:acceleration,fy:0,scale:1,
          acceleration:true} : null);
      }
    }
  }

  // TEST mode for diffsim: the training display loops the short (horizonS ~1.5s)
  // trajectory, so "Test" looked like it reset every second — unlike the other
  // modes' full evalSeconds rollouts. Regenerate a proper evalSeconds
  // closed-loop rollout of the CHAMPION so Test shows sustained performance
  // (which, for the memoryless neural policies, honestly includes the
  // finite-basin fall the short clip was hiding; LQR holds the whole time).
  function resetLiveReferenceFromScene() {
    const run = app.diffsimRun;
    if (!run?.liveReference) return;
    const failed = !run.liveReference.finite;
    const angle = Number.isFinite(app.showState?.startAngle)
      ? app.showState.startAngle * 180 / Math.PI : run.reqTiltDeg;
    if(run.liveReference.isReference){
      BF.pendulumReference.reset(run.liveReference);
      delete run.liveReference._replayNudgeRng;
    }else run.liveReference = BF.rigidReference.create({...run.rdOpts, links:run.isTriple ? 3 : 2,
      gravity:run.g, tiltDeg:angle});
    run.K = run.liveReference.K;
    run.lastTiltDeg = angle;
    run._displayClock = {};
    document.getElementById('liveNudgeStatus').textContent = '';
    if (failed) { app.paused = false; dom.pauseBtn.classList.remove('active'); }
  }
  function regenDiffsimTestTrajectory() {
    const run = app.diffsimRun;
    if (!run) return;
    const evalT = (app.trainer && app.trainer.params && app.trainer.params.evalSeconds) || 8;
    const sec = Math.max(3, evalT);
    const pert = (run.cur && run.cur.pertDeg) ? run.cur.pertDeg
               : ((run.config && run.config.pertDeg) || 6);
    try {
      let frames = null;
      if (run.kind === 'lqr' && BF.diffsimLqr) {
        frames = BF.diffsimLqr.trajectory(run.lqrD, pert, sec).frames;
      } else if (run.kind === 'trajopt' && BF.diffsimTrajopt) {
        frames = BF.diffsimTrajopt.replay(run.to, { lqr: run.lqrD, holdS: sec }).frames;
      } else if (run.kind === 'rigidLqr' && run.RD) {
        resetLiveReferenceFromScene();
      } else if (run.kind === 'rigidSwingup' && run.RD && run.su) {
        // Test = the full down->up->hold with a LONG hold: the VERIFIED catch
        // sequence when one exists, else the best current attempt (honestly
        // shown failing). Was a silent no-op like rigidLqr.
        const su = run.su;
        const accels = (su.bestVerified && su.bestVerified.accels) || su.bestAccels;
        if (accels) {
          frames = run.RD.swingUpFrames(accels, run.K, run.g, run.rdOpts,
                                        Math.max(5, sec - accels.length / 60)).frames;
        }
      } else if (run.engine && BF.diffsimTrainer) {   // neural or memetic
        frames = BF.diffsimTrainer.trajectory(run.engine, pert, sec, run.kind === 'memetic').frames;
      }
      // IMMEDIATE swap (the user just pressed Test) — also clears any stale
      // pending training clip, which would otherwise replace the test rollout
      // the moment the first playback loops.
      if (frames) BF.diffsimMode.setFrames(run, frames, true);
    } catch (e) { /* keep the existing frames on failure */ }
  }

  // Curriculum HUD for diffsim mode. The population curriculum reads its ceiling
  // from the objective's fitness units (tens of points); the diffsim fitness is
  // meanUp in [0,1], so that panel shows an unreachable threshold. This renders
  // the NATIVE perturbation curriculum instead, on the right scale. LQR has no
  // training, so it says so.
  function renderDiffsimCurriculumHud() {
    if (!dom._hudCur) {
      dom._hudCur = document.createElement('div');
      dom._hudCur.className = 'hud-section';
      dom.hudEscape.parentNode.insertBefore(dom._hudCur, dom.hudEscape);
    }
    const run = app.diffsimRun;
    const mode = dom.modeSelect ? dom.modeSelect.value : '';
    let html = '';
    if (mode === 'signing-planner') {
      // Planner HUD: the honest PIXEL number is the headline (the chart's 0..1
      // closeness is only there so the shared badge/bestEver plumbing works).
      const m = app.showState && app.showState._replayMetrics;
      html = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
             `<span class="hud-off">N/A — explicit planner, no training</span></div>`;
      if (m && m.errorSeconds > 0) {
        html += `<div class="hud-row"><span class="hud-key">tip→curve</span>` +
                `<span class="hud-good">${(m.errorIntegral / m.errorSeconds).toFixed(1)} px mean · ${m.errorSeconds.toFixed(1)}s observed</span></div>`;
      }
      html += `<div class="hud-row"><span class="hud-key">curve period</span><span>${app.trainer.params.tracePeriod || 10}s per loop</span></div>`;
      // Render + return: this function ends by assigning `html` to the HUD, so a
      // bare `return html` here would silently show nothing.
      dom._hudCur.innerHTML = html;
      return;
    }
    if (mode === 'epicycle-analytic') {
      // Epicycle HUD: the honest PIXEL number plus the ARM COUNT, because the
      // arm count is the whole quality dial here — the pixel error is
      // meaningless without saying how many arms bought it.
      const ep = app.epicycleAnalytic;
      html = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
             `<span class="hud-off">N/A — analytic, solved at gen 0</span></div>`;
      if (ep) {
        html += `<div class="hud-row"><span class="hud-key">pen→curve</span>` +
                `<span class="hud-good hud-glow">${ep.tipErrPx.toFixed(1)} px mean` +
                ` · worst ${ep.worstPx.toFixed(0)}</span></div>`;
        html += `<div class="hud-row"><span class="hud-key">arms</span>` +
                `<span class="hud-good">${ep.arms} · ${ep.basis === 'even' ? 'DCT (even — open stroke)' : 'DFT'}` +
                ` · ${ep.curveId}</span></div>`;
        html += `<div class="hud-row"><span class="hud-key">note</span>` +
                `<span class="hud-off">flat line = correct; no learning happens</span></div>`;
      }
      dom._hudCur.innerHTML = html;
      return;
    }
    if (mode === 'diffsim-lqr' || mode === 'rigid-lqr' || mode === 'rigid-triple-lqr') {
      html = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
             `<span class="hud-off">Gains computed from dynamics · local feedback</span></div>`;
      // The live rigid reference uses the actual sampled release. The older
      // spring-model trajectory reference can still reduce its requested tilt.
      if (run && run.lastTiltDeg != null) {
        const used = Math.abs(run.lastTiltDeg).toFixed(0);
        html += `<div class="hud-row"><span class="hud-key">start tilt</span>` +
                (run.liveReference
                  ? `<span class="hud-good">${run.lastTiltDeg < 0 ? '−' : run.lastTiltDeg > 0 ? '+' : ''}${used}° (sampled release)</span>`
                  : run.reqTiltCapped
                  ? `<span class="hud-warn">±${used}° (capped — LQR can't catch more; use swing-up for big angles)</span>`
                  : `<span class="hud-good">±${used}° (from the tilt slider)</span>`) +
                `</div>`;
      }
    } else if (mode === 'diffsim-trajopt') {
      // Trajectory optimization: no per-level curriculum — one open-loop
      // sequence is optimized; the interesting state is "has a catch happened".
      html = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
             `<span class="hud-off">N/A — optimizing one swing-up trajectory</span></div>`;
      if (run && run.catchAtS != null) {
        html += `<div class="hud-row"><span class="hud-key">catch</span>` +
                `<span class="hud-good hud-glow">caught at ${run.catchAtS.toFixed(2)}s · hold ${(run.holdMeanUp || 0).toFixed(3)}</span></div>`;
      } else {
        html += `<div class="hud-row"><span class="hud-key">catch</span>` +
                `<span class="hud-warn">not caught yet — optimizing</span></div>`;
      }
    } else if (mode === 'rigid-swingup' || mode === 'rigid-triple-swingup') {
      // The rigid ground-truth swing-up: report the VERIFIED catch state (a
      // real LQR-catch replay, not the optimizer's proxy score) + restarts.
      // Before this row existed the mode fell through to the generic branch
      // and showed a misleading "Curriculum off — fixed 0° tilt".
      html = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
             `<span class="hud-off">N/A — optimizing one swing-up trajectory</span></div>`;
      const suSt = run && run.su;
      if (suSt && suSt.bestVerified) {
        const bv = suSt.bestVerified;
        html += `<div class="hud-row"><span class="hud-key">catch</span>` +
                `<span class="hud-good hud-glow">VERIFIED — caught at ${(bv.caughtAtS != null ? bv.caughtAtS.toFixed(2) : '?')}s · hold ${bv.holdMeanUp.toFixed(3)}</span></div>`;
      } else {
        html += `<div class="hud-row"><span class="hud-key">catch</span>` +
                `<span class="hud-warn">not verified yet — optimizing (proxy ${(suSt ? Math.max(0, suSt.bestScore) : 0).toFixed(2)})</span></div>`;
      }
      if (suSt && suSt.restarts > 0) {
        html += `<div class="hud-row"><span class="hud-key">restarts</span>` +
                `<span>${suSt.restarts} (multi-start — a basin failed to hand off to the LQR)</span></div>`;
      }
    } else if (run && run.cur && run.cur.enabled) {
      const c = run.cur;
      const atMax = c.level >= c.maxLevel;
      const lvlCls = atMax ? 'hud-good hud-glow' : '';
      // Adaptive pacing makes the level fractional near a difficulty wall.
      const lvlTxt = Number.isInteger(c.level) ? String(c.level) : c.level.toFixed(2);
      html += `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
              `<span class="${lvlCls}">level <b>${lvlTxt}/${c.maxLevel}</b></span></div>`;
      // Pacing row: only interesting once the ramp has had to back off. A step
      // at the 1/8 floor = "this is the wall for this policy/physics".
      if (c.stepSize < 0.999) {
        const wallCls = c.stepSize <= (c.minStep || 0.125) ? 'hud-warn' : '';
        html += `<div class="hud-row"><span class="hud-key">pace</span>` +
                `<span class="${wallCls}">step ×${c.stepSize.toFixed(3)} · ${c.paces || 0} retreats` +
                (c.stepSize <= (c.minStep || 0.125) ? ' <span class="hud-off">(at the wall)</span>' : '') +
                `</span></div>`;
      }
      const fmtV = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
      // One row per RAMPING spec (current -> target), so the user sees exactly
      // what the curriculum is ramping (e.g. "tilt 42 → 180", "gravity 280 → 980").
      const applied = Array.isArray(c.applied) ? c.applied : [];
      if (applied.length) {
        for (const a of applied) {
          const unit = a.unit || '';
          const naTag = a.na ? ` <span class="hud-off">(N/A in grad)</span>` : '';
          html += `<div class="hud-row"><span class="hud-key">${a.label}</span>` +
                  `<span>${fmtV(a.value)}${unit} <span class="hud-off">→ ${fmtV(a.to)}${unit}</span>${naTag}</span></div>`;
        }
      } else {
        // Legacy scalar ramp: just the tilt.
        html += `<div class="hud-row"><span class="hud-key">tilt now</span>` +
                `<span>${(c.pertDeg || 0).toFixed(1)}° → ${(c.maxPertDeg || 0).toFixed(0)}°</span></div>`;
      }
      const mu = c.meanUp || 0, thr = c.threshold || c.thresholdFrac || 0;
      const okCls = mu >= thr ? 'hud-good' : 'hud-warn';
      html += `<div class="hud-row"><span class="hud-key">upright(end)</span>` +
              `<span class="${okCls}">${mu.toFixed(3)} / ${thr.toFixed(2)} <span class="hud-off">(max 1.0)</span></span></div>`;
      if (!atMax) {
        const consecCls = (c.consec >= c.consecReq - 1 && c.consecReq > 1) ? 'hud-good hud-glow' : '';
        html += `<div class="hud-row"><span class="hud-key">to advance</span>` +
                `<span class="${consecCls}">${c.consec}/${c.consecReq} gens ≥ ${thr.toFixed(2)}</span></div>`;
      } else {
        html += `<div class="hud-row"><span class="hud-key">status</span>` +
                `<span class="hud-good hud-glow">at max level</span></div>`;
      }
    } else {
      const pd = (run && run.config) ? (run.config.pertDeg || 0) : 0;
      html = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
             `<span class="hud-off">off — fixed ${pd.toFixed(0)}° tilt</span></div>`;
    }
    dom._hudCur.innerHTML = html;
  }

  // Backprop-through-time panel (grad-exact modes only): bar strip of the
  // champion's adjoint — dLoss/dAction at each control step of the rollout.
  // Big bars early / tiny late is the signature exact-gradient view: the loss
  // blames the EARLY control moments most (their effects compound), and the
  // signal literally flows backward through the simulator. LQR has no gradient,
  // so the panel hides for it (and for every population mode).
  function drawGradFlow() {
    const panel = dom.gradFlowPanel, cv = dom.gradFlowCanvas;
    if (!panel || !cv) return;
    const run = app.diffsimRun;
    const gt = run && run.gradTrace;
    const show = isDiffsimMode() && gt && Array.isArray(gt.adjoint) && gt.adjoint.length > 0;
    // The display write happens unconditionally: the tab strip DERIVES this
    // panel's availability from it, so skipping it while the Internals tab
    // is hidden would freeze the tab in whatever state it had last frame.
    panel.style.display = show ? '' : 'none';
    if (!show || !vizShown(panel)) return;
    const dpr = window.devicePixelRatio || 1;
    const wCss = cv.clientWidth || 300, hCss = cv.clientHeight || 90;
    if (cv.width !== Math.round(wCss * dpr)) cv.width = Math.round(wCss * dpr);
    if (cv.height !== Math.round(hCss * dpr)) cv.height = Math.round(hCss * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    const adj = gt.adjoint;
    let maxA = 1e-12;
    for (const a of adj) { const m = Math.abs(a); if (m > maxA) maxA = m; }
    const bw = wCss / adj.length, mid = hCss / 2;
    for (let i = 0; i < adj.length; i++) {
      const a = adj[i] / maxA;
      ctx.fillStyle = a >= 0 ? 'rgba(106,169,255,0.9)' : 'rgba(255,102,128,0.9)';
      const bh = Math.max(1, Math.abs(a) * (mid - 12));
      ctx.fillRect(i * bw, a >= 0 ? mid - bh : mid, Math.max(1, bw - 1), bh);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(wCss, mid); ctx.stroke();
    ctx.fillStyle = 'rgba(154,163,187,0.85)';
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
    ctx.fillText('t=0 (release)', 4, 10);
    const cdt = (run.config && run.config.controlDt) ? run.config.controlDt : 1 / 60;
    const endTxt = 't=' + (adj.length * cdt).toFixed(1) + 's';
    ctx.fillText(endTxt, wCss - ctx.measureText(endTxt).width - 4, 10);
    const normTxt = 'max |∂L/∂a| ' + maxA.toExponential(1) + ' · ‖∇w‖ ' +
      (isFinite(gt.gradNorm) ? gt.gradNorm.toFixed(2) : '—');
    ctx.fillText(normTxt, 4, hCss - 4);
  }

  // Planner lookahead panel (dodge-planner mode only): a top-down of the field
  // showing what the planner "sees" each step — every bullet's predicted
  // straight-line future (it knows exactly where they're going) and the escape
  // route it chose. This is the model-based counterpart of the grad panel: no
  // training curve to show, so we show the PLAN.
  function drawPlannerLookahead() {
    const panel = dom.plannerVizPanel, cv = dom.plannerVizCanvas;
    if (!panel || !cv) return;
    const viz = (isDodgePlannerMode() && app.showPolicy && app.showPolicy.planner)
      ? app.showPolicy.planner.lastViz : null;
    const show = !!(viz && viz.HW);
    // As in drawGradFlow: always write the display (the tab strip reads it),
    // only skip the painting.
    panel.style.display = show ? '' : 'none';
    if (!show || !vizShown(panel)) return;
    const dpr = window.devicePixelRatio || 1;
    const wCss = cv.clientWidth || 300, hCss = cv.clientHeight || 120;
    if (cv.width !== Math.round(wCss * dpr)) cv.width = Math.round(wCss * dpr);
    if (cv.height !== Math.round(hCss * dpr)) cv.height = Math.round(hCss * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    // World -> canvas transform (aspect-fit the ±HW × ±HH field with a margin).
    const pad = 6;
    const sx = (wCss - 2 * pad) / (2 * viz.HW), sy = (hCss - 2 * pad) / (2 * viz.HH);
    const sc = Math.min(sx, sy);
    const cxp = wCss / 2, cyp = hCss / 2;
    const X = (wx) => cxp + wx * sc, Y = (wy) => cyp + wy * sc;
    // Field border.
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(X(-viz.HW), Y(-viz.HH), 2 * viz.HW * sc, 2 * viz.HH * sc);
    // Predicted bullet futures (faint red line) + current bullet (solid dot).
    ctx.lineWidth = 1;
    for (const f of viz.futures) {
      ctx.strokeStyle = 'rgba(255,102,128,0.35)';
      ctx.beginPath(); ctx.moveTo(X(f.x0), Y(f.y0)); ctx.lineTo(X(f.x1), Y(f.y1)); ctx.stroke();
      ctx.fillStyle = 'rgba(255,102,128,0.95)';
      ctx.beginPath(); ctx.arc(X(f.x0), Y(f.y0), Math.max(1.5, f.r * sc), 0, 2 * Math.PI); ctx.fill();
    }
    // Chosen escape route (bright green).
    if (viz.path && viz.path.length) {
      ctx.strokeStyle = 'rgba(108,226,138,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(viz.agent.x), Y(viz.agent.y));
      for (const p of viz.path) ctx.lineTo(X(p.x), Y(p.y));
      ctx.stroke();
    }
    // Agent now.
    ctx.fillStyle = 'rgba(106,169,255,0.95)';
    ctx.beginPath(); ctx.arc(X(viz.agent.x), Y(viz.agent.y), Math.max(2, viz.agentR * sc), 0, 2 * Math.PI); ctx.fill();
    // Label: horizon survival (H = fully safe).
    ctx.fillStyle = 'rgba(154,163,187,0.9)';
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
    const safe = viz.bestSurv >= viz.horizonSteps;
    ctx.fillText(safe ? 'chosen route: clear for the full 1.2s lookahead'
                      : ('chosen route survives ' + (viz.bestSurv / 120).toFixed(2) + 's of 1.2s'), 4, 11);
  }

  // Observe the real preview, without invoking the policy a second time (which
  // would advance recurrent memory). Metrics see every physics step, including
  // brief failures at high playback speeds; painting follows display frames.
  let controlDiagnostics = null;
  let controlDiagnosticsState = null;
  let controlDiagnosticsTrainer = null;
  let controlDiagnosticsEpisode = 0;
  let controlNeuralSample = null;
  function syncControlDiagnostics() {
    const host = document.getElementById('controlDiagnostics');
    if (!host || !BF.controlDiagnostics) return;
    if (!controlDiagnostics) controlDiagnostics = BF.controlDiagnostics.create(host);
    if (controlDiagnosticsTrainer !== app.trainer) {
      controlDiagnosticsTrainer = app.trainer;
      controlDiagnostics.reset();
    }
    if (controlDiagnosticsState !== app.showState) {
      controlDiagnosticsState = app.showState;
      controlDiagnosticsEpisode++;
    }
    const trainer = app.trainer, p = trainer ? trainer.params : {};
    const supported = !!(!isDiffsimMode() && app.showState &&
      ['single', 'double', 'triple'].includes(app.showState.setup.id));
    const method = BF.presetNavigation.approach(app.testing
      ? (RUN_PRESETS[dom.runPresetSelect.value] || {mode:p.mode,policyType:p.policyType})
      : {mode:p.mode,policyType:p.policyType});
    controlDiagnostics.context({
      visible: vizTabState.active === 'control' && !document.hidden,
      episodeKey:controlDiagnosticsEpisode,
      supported,
      label: supported ? (app.showState.setup.label || app.showState.setup.id) : 'Choose a point-mass pendulum',
      controller: method.label,
      mode: app.testing ? 'Frozen-policy replay' : app.training ? 'Training champion preview' : 'Live preview',
      objective: supported ? 'Every physical link above horizontal; motion is allowed.' :
        'These diagnostics currently instrument the point-mass pendulums. Rigid references use a separate dynamics model.',
      training: app.training ? {generation:trainer.generation, stage:trainer.curriculum?.level || 0,
        gravity:app.showState?.world?.gravity, angle:currentTiltDeg(),
        bestFitness:trainer.currentBestFitness, holdSource:'This preview only; not population or held-out success.'} : null
    });
    controlDiagnostics.render();
  }
  function sampleControlDiagnostics(observation) {
    if (!controlDiagnostics || vizTabState.active !== 'control' || document.hidden ||
        !['single','double','triple'].includes(app.showState.setup.id)) return;
    const s = app.showState, p = app.trainer.params;
    const g = app.showPolicy.genome;
    // Neural activity is a display-frame sample. Geometry/hold failures below
    // still use EVERY physics step, including high-speed playback.
    if (!controlNeuralSample) {
      const hidden = g ? g.nodes.filter(n => n.kind === 'hidden') : [];
      const trace = app.showPolicy.lastTrace;
      controlNeuralSample = {
        nodeActivations:trace?.activations ? hidden.map(n => trace.activations.get(n.id) ?? 0) : null,
        hiddenNodeCount:g ? hidden.length : null,
        edgeCount:g ? g.conns.filter(c => c.enabled).length : null
      };
    }
    const snapshot = BF.controlAnalysis.snapshot(s, p, {
      time:s.simTime,command:s.lastCmd,observationValues:Array.from(observation),
      observationLabels:s.setup.observationAbbr || s.setup.observationLabels,
      ...controlNeuralSample
    });
    if (snapshot) controlDiagnostics.sample(snapshot);
  }

  // ---- Display loop ----
  function playbackRateInfo() {
    const run=isDiffsimMode()?app.diffsimRun:null,live=run?.liveReference;
    const baseDt=app.trainer?.params?.physicsDt||1/120;
    const recordedDt=live?.config?.physDt || (run ? run.rdOpts?.physDt||run.config?.physDt||run.RD?.defaults?.().physDt||run.config?.dt||baseDt : baseDt);
    const controlDt=live?.controlDt || (run ? run.config?.controlDt || 1/60 : baseDt);
    let cadence=`Controller ${Math.round(1/controlDt)} Hz`;
    if(app.showState?.terrainRun)cadence=`Network ${Math.round(1/baseDt)} Hz · actions ${Math.round(1/(baseDt*app.showState.terrainRun.P.controlEvery))} Hz`;
    else if(isDodgeScorerMode())cadence=`Network calls ${Math.round(1/baseDt)} Hz · scoring 20 Hz · forecast model 120 Hz`;
    else if(dom.modeSelect.value==='dodge-planner')cadence='Planner updates 40 Hz · forecast model unchanged';
    else if(dom.modeSelect.value==='signing-planner')cadence='Planner updates 20 Hz · forecast model unchanged';
    return {recordedDt,controlDt,cadence,live:!run||!!live,reference:!!live};
  }
  function refreshPhysicsRateUI() {
    const select=document.getElementById('physicsRateSelect'),wrap=document.getElementById('physicsRateControl'),note=document.getElementById('physicsRateNote');
    if(!select||!BF.playbackPhysics)return;
    const info=playbackRateInfo(),recordedHz=1/info.recordedDt;
    if(!app.testing||!info.live)app.playbackPhysicsHz=null;
    const choices=BF.playbackPhysics.choices(info.recordedDt,info.controlDt);
    if(app.playbackPhysicsHz && !choices.includes(app.playbackPhysicsHz))app.playbackPhysicsHz=null;
    const signature=[recordedHz,info.controlDt,info.live,...choices].join('|');
    if(select.dataset.rates!==signature){
      select.replaceChildren();
      const saved=document.createElement('option');saved.value='recorded';saved.textContent=`Physics · ${Math.round(recordedHz)} Hz (recorded)`;select.appendChild(saved);
      for(const hz of choices)if(Math.abs(hz-recordedHz)>1e-7){
        const option=document.createElement('option');option.value=String(hz);option.textContent=`Physics · ${Math.round(hz)} Hz (temporary)`;select.appendChild(option);
      }
      select.dataset.rates=signature;
    }
    select.disabled=!app.testing||!info.live;
    select.value=app.playbackPhysicsHz?String(app.playbackPhysicsHz):'recorded';
    wrap.dataset.override=String(!!app.playbackPhysicsHz);
    const text=app.playbackPhysicsHz?`Override · recorded ${Math.round(recordedHz)} Hz`:!info.live?'Recorded frames':!app.testing?'Training rate':'';
    if(note.textContent!==text)note.textContent=text;
    wrap.title=info.cadence+'. Rates are per simulation second, independent of rendering FPS or playback speed. '+
      (!info.live?'These are precomputed trajectories; changing their playback speed cannot change the generating physics.':!app.testing?'Load a controller in Test mode to try a temporary integration rate.':
      'Changing rate starts a fresh trial with the original controller cadence and weights. Overrides are outside the recorded test settings, are not saved, and reset on another preset or training run. Physics cannot run slower than the unchanged controller sampling interval.');
  }
  document.getElementById('physicsRateSelect').addEventListener('change',event=>{
    const info=playbackRateInfo();
    if(!app.testing||!info.live)return refreshPhysicsRateUI();
    const hz=event.target.value==='recorded'?null:Number(event.target.value);
    if(hz!==null&&!BF.playbackPhysics.choices(info.recordedDt,info.controlDt).includes(hz))return refreshPhysicsRateUI();
    app.playbackPhysicsHz=hz;
    app.paused=false;dom.pauseBtn.classList.remove('active');
    // Never combine a partly completed run at one rate with results at another.
    app.testStats=BF.replayMetrics.createStats(BF.util.nowMs());
    const live=isDiffsimMode()?app.diffsimRun?.liveReference:null;
    if(live){
      (live.isReference?BF.pendulumReference:BF.rigidReference).reset(live);
      delete live._replayNudgeRng;
      delete live._nudgeTimer;
      document.getElementById('liveNudgeStatus').textContent='';
      app.diffsimRun._displayClock={};
    }else{
      rebuildDisplayState();
      if(app.trainerB&&app.showStateB)rebuildDisplayStateB();
    }
    // Rebuilding the same genome records its previous rollout; that peak was
    // measured under a different integrator and must not carry into this trial.
    app.peakLivePreviewFitness=null;
    app.peakLivePreviewAngle=null;
    app.peakLivePreviewSunk=false;
    app.simRenderer?.clearTrail();
    refreshPhysicsRateUI();refreshControllerTime();
  });
  function tickDisplay(dtMs) {
    controlNeuralSample = null;
    if (isDiffsimMode()) {
      if (app.paused || !app.showState) return;
      tickDiffsimDisplay(dtMs);
      return;
    }
    if (app.paused || !app.showState || !app.showPolicy) return;
    const speed = getActiveSimSpeed();
    // The DISPLAY must step at the same rate TRAINING does, or the live view
    // is a different simulation from the one being scored. Everything in this
    // app trains at 1/120 and this was hard-coded to match; terrain-run is the
    // first setup measured at 1/60, and at 1/120 its jump arc and its control
    // latch (held for controlEvery physics steps) would both differ on screen.
    const tdt = app.trainer && app.trainer.params && app.trainer.params.physicsDt;
    const fixedDt = (tdt > 0) ? tdt : 1 / 120;
    const stepCount = BF.util.fixedStepCount(
      app.showState._displayClock || (app.showState._displayClock = {}),
      (dtMs / 1000) * speed, fixedDt, 64);
    let steps = 0;
    // Multi-action support for the live preview: setups with actionCount
    // > 1 (e.g. dodge) read every output node via commandAll, mirroring
    // the trainer's eval loop so what the user sees matches what the GA
    // is being graded on. Single-action setups stay on the legacy path.
    const showSetup = app.showState.setup;
    const numActions = Math.max(1, (showSetup && showSetup.actionCount) | 0) || 1;
    if (!app._showCmdBuf || app._showCmdBuf.length !== numActions) {
      app._showCmdBuf = new Array(numActions);
    }
    const showCmdBuf = app._showCmdBuf;
    // Per-frame step cap. Bumped from 12 -> 64 so the simSpeed slider's
    // higher end (now max 32x) can actually produce that many simulated
    // seconds per second of wall time. At 60fps + fixedDt=1/120, 64
    // steps = ~0.53 sec sim per frame = ~32x speedup. Cap exists to
    // bound worst-case frame time when the user moves the slider while
    // training is also occupying the CPU.
    while (steps < stepCount) {
      const obs = app.showState.setup.buildObservation(app.showState);
      let cmd;
      if (numActions === 1) {
        cmd = clamp(app.showPolicy.command(obs), -1, 1);
        showCmdBuf[0] = cmd;
      } else if (app.showPolicy.commandAll) {
        app.showPolicy.commandAll(obs, showCmdBuf);
        for (let i = 0; i < numActions; i++) showCmdBuf[i] = clamp(showCmdBuf[i], -1, 1);
        cmd = showCmdBuf[0];
      } else {
        // Fallback: policy doesn't expose commandAll (e.g. CNN policy).
        cmd = clamp(app.showPolicy.command(obs), -1, 1);
        showCmdBuf[0] = cmd;
        for (let i = 1; i < numActions; i++) showCmdBuf[i] = 0;
      }
      app.showState.lastCmd = cmd;
      app.showState.lastCmds = showCmdBuf;
      // Borrow the observation used for this actual decision. The read-only
      // circuit painter never calls buildObservation or command to refresh it.
      app._perceptionObservation=obs;
      app._perceptionPolicy=app.showPolicy;
      app._perceptionState=app.showState;
      let measuredCommand=false;
      BF.playbackPhysics.advance(app.showState,cmd,fixedDt,app.testing?app.playbackPhysicsHz:null,stepDt=>{
      // Setup-level tick — runs setup-specific post-physics work like ball
      // spawn / collision for the ball-hit setup. Without this the displayed
      // simulation diverges from what the trainer actually evaluates.
      tickPendulumReplay(stepDt);
      // Compute the same per-step reward training uses, so the live preview
      // can show "this rollout has earned X". Critical for diagnosing the
      // "GOAL! visual but fitness stuck" symptom: now the user can see
      // whether the displayed rollout actually earned the +30 sunk reward
      // or whether it scored low despite the visual flash. Skipped if the
      // trainer/objective isn't ready.
      if (app.trainer) {
        const tp = app.trainer.params;
        const obj = BF.objectives.getObjective(tp.objectiveId);
        if (obj && typeof obj.reward === 'function') {
          const kin = BF.setups.kinematics(app.showState);
          const scratch = app.showState.objectiveScratch ||
            (app.showState.objectiveScratch = { outSum: 0, lastCmd: 0, steps: 0 });
          if(!measuredCommand){scratch.outSum += Math.abs(cmd - scratch.lastCmd);scratch.lastCmd=cmd;scratch.steps++;measuredCommand=true;}
          const reward = obj.reward(kin, stepDt, tp.objectiveParams || {}, scratch);
          app.showState.liveFitness = (app.showState.liveFitness || 0) + reward;
        }
      }
      BF.replayMetrics.accumulate(app.showState,app.trainer.params,stepDt);
      });
      // Apply disturbances against the same params training uses, so what the
      // user sees matches what the GA is being graded on.
      if (app.showState.pushCtrl) {
        if (!app._pushTickRng) app._pushTickRng = makeDisplayRng(0x9D15_7E51 | 0);
        const basePushParams=app.trainer ? app.trainer.params : {};
        const replay=app.pendulumReplayContext,stage=app.showState.pendulumReplay;
        const pushParams=app.testing && replay
          ? {...basePushParams,useDisturb:replay.randomNudges && !!stage?.armed} : basePushParams;
        BF.disturb.tick(app.showState.pushCtrl, app.showState, fixedDt,
                        pushParams,
                        app._pushTickRng);
      }
      // Step ghosts in lockstep. Multi-action setups (dodge) need the
      // FULL output vector stamped on the ghost's state.lastCmds so the
      // setup tick can drive the 2D agent; the legacy 1-action path
      // still uses command() so we don't pay the array allocation on
      // every ghost-step for cart-pole-class setups.
      const ghostNumActions = numActions;
      for (const ghost of app.ghosts) {
        const gObs = ghost.state.setup.buildObservation(ghost.state);
        let gCmd;
        if (ghostNumActions === 1) {
          gCmd = clamp(ghost.policy.command(gObs), -1, 1);
        } else {
          if (!ghost._cmdBuf || ghost._cmdBuf.length !== ghostNumActions) {
            ghost._cmdBuf = new Array(ghostNumActions);
          }
          if (ghost.policy.commandAll) {
            ghost.policy.commandAll(gObs, ghost._cmdBuf);
          } else {
            // Policy doesn't expose commandAll (e.g. CNN). Best-effort:
            // use the single-output value for axis 0 and zero the rest.
            ghost._cmdBuf[0] = ghost.policy.command(gObs);
            for (let i = 1; i < ghostNumActions; i++) ghost._cmdBuf[i] = 0;
          }
          for (let i = 0; i < ghostNumActions; i++) {
            ghost._cmdBuf[i] = clamp(ghost._cmdBuf[i], -1, 1);
          }
          ghost.state.lastCmds = ghost._cmdBuf;
          gCmd = ghost._cmdBuf[0];
        }
        BF.playbackPhysics.advance(ghost.state,gCmd,fixedDt,app.testing?app.playbackPhysicsHz:null);
      }
      // Accumulate task metrics only over the configured Test horizon.
      app.showState.upTimeAccum = app.showState._replayMetrics.uprightSeconds;
      app.showState.simTime += fixedDt;
      sampleControlDiagnostics(obs);
      // Compare-mode: advance trainerB's display state in lockstep so
      // both sim panes step at the same simulated time. We skip the
      // ghost / disturbance / liveFitness bookkeeping here to keep the
      // hot path light -- B is for visual comparison, not training
      // feedback. Identical numActions assumed (compare mode shares
      // setup IDs in practice; cross-setup compare is unsupported).
      if (app.showStateB && app.showPolicyB) {
        const sB = app.showStateB;
        const setupB = sB.setup;
        const numActionsB = Math.max(1, (setupB && setupB.actionCount) | 0) || 1;
        if (!app._showCmdBufB || app._showCmdBufB.length !== numActionsB) {
          app._showCmdBufB = new Array(numActionsB);
        }
        const cmdBufB = app._showCmdBufB;
        const obsB = setupB.buildObservation(sB);
        let cmdB;
        if (numActionsB === 1) {
          cmdB = clamp(app.showPolicyB.command(obsB), -1, 1);
          cmdBufB[0] = cmdB;
        } else if (app.showPolicyB.commandAll) {
          app.showPolicyB.commandAll(obsB, cmdBufB);
          for (let i = 0; i < numActionsB; i++) cmdBufB[i] = clamp(cmdBufB[i], -1, 1);
          cmdB = cmdBufB[0];
        } else {
          cmdB = clamp(app.showPolicyB.command(obsB), -1, 1);
          cmdBufB[0] = cmdB;
          for (let i = 1; i < numActionsB; i++) cmdBufB[i] = 0;
        }
        sB.lastCmd = cmdB;
        sB.lastCmds = cmdBufB;
        BF.playbackPhysics.advance(sB,cmdB,fixedDt,app.testing?app.playbackPhysicsHz:null);
        sB.simTime += fixedDt;
      }
      steps++;
    }
    // Auto-reset the display simulation so the user can see successive attempts
    // rather than watching a single failed run forever. When a ball was sunk
    // in this rollout (golf scene), extend the linger so the user actually
    // sees the win flash before the world resets. Plus: setups can declare
    // a `shouldKeepGoing(state)` callback (golf, putt) to extend the
    // simulation past the base timer while the ball is still rolling — so
    // the user actually sees the outcome instead of the world snapping
    // back mid-flight. Capped by the same tailEvalSeconds budget used by
    // the trainer.
    const setup = app.showState.setup;
    const evalT = app.trainer ? app.trainer.params.evalSeconds : 8;
    const ballSunk = app.showState.ball && app.showState.ball.sunk;
    const tailSec = (setup && setup.tailEvalSeconds) || 0;
    const stillRolling = setup && typeof setup.shouldKeepGoing === 'function'
                          && setup.shouldKeepGoing(app.showState);
    // Linger budget: 1.0s on a sink (was 2.5s -- the GOAL flash now
    // also fades out in canvas-sim.js, so the slot doesn't need to
    // stay open as long), tailEvalSeconds while ball is still rolling,
    // otherwise the standard 1s.
    const lingerSec = ballSunk ? 1.0 : (stillRolling ? tailSec : 1);
    // No-reset mode (currently dodge-only): suppress the trial-timeout
    // rebuild so the user can watch one continuous rollout indefinitely.
    // Training keeps happening in the background, but the display sim
    // doesn't reset at evalSeconds. Combine with no-die for a continuous
    // bullet-hell stress test where the agent never dies AND never
    // returns to a fresh scene.
    const noResetActive = !!(app.trainer && app.trainer.params && app.trainer.params.dodgeNoReset
                              && app.showState && app.showState.dodge);
    if (!noResetActive && app.showState.simTime > evalT + lingerSec) {
      // Rebuild B's display alongside A's so both panes restart their
      // rollouts together. Without this, B would keep running its
      // (already-completed) rollout while A starts fresh.
      if (app.trainerB && app.showStateB) {
        rebuildDisplayStateB();
      }
      if (app.testing) {
        BF.replayMetrics.record(app.testStats, BF.replayMetrics.result(app.showState, app.trainer.params));
        // Wall-clock timing per trial — useful when sim speed != 1 because
        // the displayed seconds and the simulated seconds differ.
        const now = BF.util.nowMs();
        if (app.testStats.trialStartedAt > 0) {
          app.testStats.totalSeconds += (now - app.testStats.trialStartedAt) / 1000;
        }
        app.testStats.trialStartedAt = now;
        // Mid-test slider changes should propagate to the next trial
        // too. Training has its own per-gen sync; test has nothing
        // running between trials, so without this the trainer.params
        // can lag behind whatever the user just adjusted.
        syncTrainerParams();
      }
      rebuildDisplayState();
      app.simRenderer.clearTrail();
    }
  }

  // Render the CNN's phase-space image (or the dodge danger grid) into
  // the small floating inset on the sim panel. Fires in three cases:
  //   1. policyType === 'cnn'      (pendulum 2D CNN — read policy.lastImage)
  //   2. policyType === 'cnn-grid' (dodge CNN — read policy.lastImage)
  //   3. dodge setup + grid obs mode + ANY policy (read by rebuilding
  //      obs on demand). Case 3 means a NEAT-on-grid run still gets the
  //      visualization, so the user can see what the policy is reading
  //      even when the network panel falls back to the NEAT genome.
  function drawCNNInset() {
    if (!app.trainer || !app.showState) {
      dom.cnnInset.classList.add('hidden');
      return;
    }
    const tp = app.trainer.params;
    const isCNN     = tp.policyType === 'cnn';
    const isCNNGrid = tp.policyType === 'cnn-grid';
    const isDodgeGridMode = app.trainer.setupId === 'dodge'
                         && app.showState.dodge
                         && app.showState.observationMode === 'grid';
    let imgSource = null;
    let imgW = null, imgH = null;
    let label = null;
    if (isCNN) {
      if (!app.showPolicy || !app.showPolicy.lastImage) {
        dom.cnnInset.classList.add('hidden');
        return;
      }
      imgSource = app.showPolicy.lastImage;
      imgW = imgH = (app.trainer.cnnConfig || BF.cnn.defaultConfig()).imageSize;
      label = 'CNN input · phase space';
    } else if (isCNNGrid) {
      if (!app.showPolicy || !app.showPolicy.lastImage) {
        dom.cnnInset.classList.add('hidden');
        return;
      }
      imgSource = app.showPolicy.lastImage;
      // The grid CNN's input is no longer necessarily square or single-plane:
      // terrain-run feeds it 2 x 8 x 12. Read the RESOLVED shape and render
      // plane 0 (occupancy/danger in both setups) rather than assuming a
      // gridSize x gridSize buffer — the square read would have walked off the
      // end of row 8 straight into the hazard plane.
      const gcfg = BF.cnnGrid.resolveConfig(app.trainer.cnnGridConfig || null);
      imgW = gcfg.gridW; imgH = gcfg.gridH;
      label = gcfg.channels > 1
        ? 'CNN input · occupancy patch (ch0)'
        : 'CNN input · danger grid';
    } else if (isDodgeGridMode) {
      // NEAT-on-grid (or any non-CNN policy on the dodge grid). Rebuild
      // the observation just to slice out the grid for display -- cheap
      // (linear in bullet count) and keeps the inset informative without
      // tying it to whichever policy is running.
      const setup = BF.setups.getSetup('dodge');
      const obs = setup.buildObservation(app.showState);
      const G = 16; // matches dodge GRID_SIZE
      imgSource = new Float64Array(G * G);
      for (let i = 0; i < G * G; i++) imgSource[i] = obs[4 + i] || 0;
      imgW = imgH = G;
      label = 'Danger grid · agent view';
    } else {
      dom.cnnInset.classList.add('hidden');
      return;
    }
    dom.cnnInset.classList.remove('hidden');
    // Update the inset label so the user knows which view they're seeing.
    const labelEl = dom.cnnInset.querySelector('.cnn-inset-label');
    if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
    const W = imgW, H = imgH;
    const canvas = dom.cnnInsetCanvas;
    // Use a larger backing buffer so each grid cell renders as a chunky
    // block with visible gridlines between cells. Without this, a 16x16
    // ImageData scaled by CSS to 96px gives 6px-per-cell with no cell
    // separation, and a row of bright cells reads as a horizontal stripe.
    // The CSS-displayed dimensions stay 96x96; the canvas backing is
    // larger so gridlines are crisp.
    const CELL = 6;            // pixels per grid cell in the backing buffer
    const GAP  = 1;            // separator between cells
    const backingW = W * (CELL + GAP) + GAP;
    const backingH = H * (CELL + GAP) + GAP;
    if (canvas.width !== backingW) canvas.width = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    const ctx = canvas.getContext('2d');
    // Backdrop.
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(0, 0, backingW, backingH);
    const img = imgSource;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = Math.max(0, Math.min(1, img[y * W + x] || 0));
        const cx = GAP + x * (CELL + GAP);
        const cy = GAP + y * (CELL + GAP);
        if (v < 0.02) {
          // Dim cell so empty regions still read as a 2D grid, not a
          // blank box.
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        } else {
          // Lerp accent → accent-2 by intensity (teal trajectory style).
          const t = v;
          const r = Math.round(106 * (1 - t) + 78  * t);
          const g = Math.round(169 * (1 - t) + 224 * t);
          const b = Math.round(255 * (1 - t) + 192 * t);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }
        ctx.fillRect(cx, cy, CELL, CELL);
      }
    }
    // Agent crosshair at the center cell so the user can SEE the grid is
    // agent-centered (and not just a window of the world). Drawn last so
    // it overlays the cells. Only shown for the dodge cases (not the
    // pendulum phase-space, which is a single-frame trajectory render
    // and doesn't have an "agent at center" concept). NOT drawn for a
    // non-square patch either: terrain-run's window is deliberately
    // ASYMMETRIC (3 tiles behind / 8 ahead, 5 up / 2 down), so a crosshair
    // at the geometric centre would point at the wrong tile — better no
    // marker than a confidently misplaced one.
    if (label && label.indexOf('phase space') < 0 && W === H) {
      const center = W / 2;
      const cc = GAP + center * (CELL + GAP) - GAP / 2;
      ctx.strokeStyle = 'rgba(245, 183, 105, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cc - 6, cc);
      ctx.lineTo(cc + 6, cc);
      ctx.moveTo(cc, cc - 6);
      ctx.lineTo(cc, cc + 6);
      ctx.stroke();
    }
  }

  // 3D CNN inset — flipbook / slices / filter / volumetric modes. Uses the
  // dedicated BF.cnn3dInsetRenderer which knows about the volume's 3-axis
  // layout. Paint alongside the main viewport; acquisition retains its own
  // actual sampling rate and does not generate extra simulation steps.
  function drawCNN3DInset() {
    if (!app.trainer || app.trainer.params.policyType !== 'cnn3d') {
      if (dom.cnn3dInset) dom.cnn3dInset.classList.add('hidden');
      return;
    }
    if (!app.showPolicy || !app.showPolicy.lastVolume) {
      if (dom.cnn3dInset) dom.cnn3dInset.classList.add('hidden');
      return;
    }
    if (!app.cnn3dInsetRenderer) return;
    if (dom.cnn3dInset) dom.cnn3dInset.classList.remove('hidden');
    const vizMode = dom.cnn3dVizMode ? dom.cnn3dVizMode.value : 'flipbook';
    // Pull the controller params off the displayed individual so the
    // most-active-filter mode can render kernel weights.
    const params = (app.trainer.bestEver && app.trainer.bestEverParams)
                     ? app.trainer.bestEverParams
                     : (app.trainer.population && app.trainer.population[0]
                          ? app.trainer.population[0].params
                          : null);
    app.cnn3dInsetRenderer.draw(app.showPolicy, params, vizMode);
  }

  // Swap the network-panel header between "Network topology" and "Analytic
  // controller" depending on what's actually being shown. Cached lookups;
  // only writes on change so the per-frame cost is a string compare.
  function setNetPanelTitle(override) {
    if (!app._netTitleEl) {
      // Resolve by the section's own id. This used to grab the FIRST
      // .panel-title inside .panel-right, which only worked while the
      // topology panel happened to be the first thing in the column —
      // the tab strip made that assumption a trap.
      app._netTitleEl = document.querySelector('#netPanel .panel-title')
        || document.querySelector('.panel-right .panel-title');
      app._netHintEl = document.getElementById('netHint');
      app._netTitleDefault = app._netTitleEl ? app._netTitleEl.textContent : '';
      app._netHintDefault = app._netHintEl ? app._netHintEl.textContent : '';
    }
    const title = override ? override.title : app._netTitleDefault;
    const hint = override ? override.hint : app._netHintDefault;
    if (app._netTitleEl && app._netTitleEl.textContent !== title) app._netTitleEl.textContent = title;
    if (app._netHintEl && app._netHintEl.textContent !== hint) app._netHintEl.textContent = hint;
  }

  // The rigid modes' replacement for the network panel: draw what the
  // controller actually IS. LQR = the gain row u = -K·x (symlog bars — gains
  // span 0.02..1e5). Swing-up = the optimized open-loop accel plan (the
  // feedforward "tape" the trajopt descends) + verification status + the
  // catch LQR's gains in miniature.
  function drawEnergyControllerPanel(controller) {
    const canvas=dom.netCanvas,fit=BF.util.fitCanvas(canvas),ctx=canvas.getContext('2d');
    const w=fit.cssW,h=fit.cssH;
    ctx.save();ctx.scale(fit.dpr,fit.dpr);ctx.clearRect(0,0,w,h);
    ctx.font='600 15px system-ui';ctx.fillStyle=controller.holding?'#6ce28a':'#f5b769';
    ctx.fillText(controller.holding?'02 / LQR catch and balance':'01 / Energy shaping',18,32);
    ctx.font='12px system-ui';ctx.fillStyle='#b8c6d9';
    ctx.fillText('Pump the swing → enter the catch basin → hold',18,57);
    ctx.fillText('Classical feedback · no neural weights',18,78);
    const labels=['cart x','cart v','angle θ','angular ω'],K=controller.lqr.K;
    const scale=Math.max(...K.map(k=>Math.log1p(Math.abs(k))))||1;
    const row=Math.max(18,Math.min(36,(h-110)/4));
    ctx.font='11px system-ui';
    for(let i=0;i<4;i++){
      const y=96+i*row,width=Math.max(1,(w-180)*Math.log1p(Math.abs(K[i]))/scale);
      ctx.textAlign='left';ctx.fillStyle='#a8b5cf';ctx.fillText(labels[i],18,y+8);
      ctx.fillStyle='#91adff';ctx.fillRect(96,y-2,width,9);
      ctx.textAlign='right';ctx.fillStyle='#dde6ff';ctx.fillText(K[i].toFixed(4),w-14,y+8);
    }
    ctx.textAlign='left';ctx.fillStyle='#a8b5cf';ctx.fillText('u = −K · [x, v, θ, ω] near upright',18,h-8);
    ctx.restore();
  }

  function drawAnalyticControllerPanel(run) {
    const canvas = dom.netCanvas;
    if (!canvas) return;
    const fit = BF.util.fitCanvas(canvas);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(fit.dpr, fit.dpr);
    const w = fit.cssW, h = fit.cssH;
    ctx.clearRect(0, 0, w, h);
    const GOOD = '#6ce28a', WARN = '#f5b769', DIM = 'rgba(230,235,245,0.55)', DIMMER = 'rgba(230,235,245,0.25)';
    const font = (px, bold) => (bold ? '600 ' : '') + px + 'px "Segoe UI", system-ui, sans-serif';
    const isTriple = !!run.isTriple;
    // K bars: symlog height, sign = direction. Dev-coordinate labels follow
    // each model's ORDER (double interleaves d/w per link; triple groups).
    const drawKBars = (K, x0, y0, bw, bh, mini, labelOverride) => {
      if (!Array.isArray(K) || !K.length) return;
      const labels = labelOverride || (isTriple
        ? ['cx', 'ẋ', 'θ₁', 'θ₂', 'θ₃', 'ω₁', 'ω₂', 'ω₃']
        : ['cx', 'ẋ', 'θ₁', 'ω₁', 'θ₂', 'ω₂']);
      const maxLog = Math.max(...K.map((v) => Math.log10(1 + Math.abs(v)))) || 1;
      const slot = bw / K.length;
      const mid = y0 + bh / 2;
      ctx.strokeStyle = DIMMER;
      ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + bw, mid); ctx.stroke();
      for (let i = 0; i < K.length; i++) {
        const v = K[i];
        const frac = Math.log10(1 + Math.abs(v)) / maxLog;
        const bhh = frac * (bh / 2 - (mini ? 2 : 10));
        const bx = x0 + i * slot + slot * 0.18, bwid = slot * 0.64;
        ctx.fillStyle = v >= 0 ? GOOD : WARN;
        if (v >= 0) ctx.fillRect(bx, mid - bhh, bwid, Math.max(1, bhh));
        else ctx.fillRect(bx, mid, bwid, Math.max(1, bhh));
        if (!mini) {
          ctx.fillStyle = DIM;
          ctx.font = font(10);
          ctx.textAlign = 'center';
          ctx.fillText(labels[i] || ('x' + i), bx + bwid / 2, y0 + bh + 2);
          ctx.fillStyle = DIMMER;
          ctx.font = font(9);
          const mag = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(Math.abs(v) < 10 ? 2 : 0);
          ctx.fillText(mag, bx + bwid / 2, (v >= 0 ? mid - bhh - 10 : mid + bhh + 3));
        }
      }
      ctx.textAlign = 'left';
    };
    ctx.textBaseline = 'top';
    if(run.liveReference?.isReference){
      const live=run.liveReference,r=live.trajectory,index=Math.min(r.controls.length-1,Math.floor(live.time/live.controlDt));
      const swinging=live.referenceMode==='swingup' && live.time<r.controls.length*live.controlDt;
      ctx.fillStyle=swinging?WARN:GOOD;ctx.font=font(12,true);
      ctx.fillText(swinging?'u = u₀(t) + K(t) · (state − plan)':'u = −K · deviation from upright',10,8);
      ctx.fillStyle=DIM;ctx.font=font(10);ctx.fillText('Live feedback · acceleration command, not state playback',10,27);
      const cy=65,amplitude=22,width=Math.max(1,w-24);
      ctx.strokeStyle=DIMMER;ctx.beginPath();ctx.moveTo(12,cy);ctx.lineTo(w-12,cy);ctx.stroke();
      ctx.strokeStyle=WARN;ctx.lineWidth=1.3;ctx.beginPath();
      r.controls.forEach((u,i)=>{const x=12+width*i/(r.controls.length-1),y=cy-amplitude*u;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
      const marker=12+width*Math.min(1,live.time/(r.controls.length*live.controlDt));
      ctx.strokeStyle=GOOD;ctx.beginPath();ctx.moveTo(marker,cy-amplitude-4);ctx.lineTo(marker,cy+amplitude+4);ctx.stroke();
      ctx.fillStyle=DIM;ctx.fillText('Nominal '+(r.controls.length*live.controlDt).toFixed(0)+' s swing · cursor = elapsed time',10,95);
      // The shipped trajectories catch with the native physical-state LQR.
      // An optional normalized terminal gain has a different coordinate order.
      const normalizedHold=live.referenceMode==='swingup'&&Array.isArray(r.holdFeedback);
      const actualK=swinging?r.feedback[index]:normalizedHold?r.holdFeedback:live.K;
      const labels=swinging||normalizedHold?['cx','ẋ',...Array.from({length:live.links},(_,i)=>['θ'+(i+1),'ω'+(i+1)]).flat()]:null;
      drawKBars(actualK,18,118,w-36,Math.max(40,h-154),false,labels);
      ctx.fillStyle=GOOD;ctx.font=font(11,true);
      ctx.fillText('Actual u '+live.lastCommand.toFixed(0)+' · largest tilt '+Math.max(...live.angleDeg).toFixed(1)+'°',10,h-17);
    } else if (run.kind === 'rigidLqr') {
      ctx.fillStyle = DIM;
      ctx.font = font(13, true);
      ctx.fillText('u = −K · x   (discrete LQR, ' + (isTriple ? 'annealed ' : '') + 'Riccati)', 10, 8);
      ctx.font = font(11);
      ctx.fillStyle = DIMMER;
      ctx.fillText('x = deviation from upright (angles wrapped) · designed once from the model — no learning', 10, 26);
      drawKBars(run.K, 24, 48, w - 48, h - 100, false);
      ctx.fillStyle = GOOD;
      ctx.font = font(12, true);
      const holdTxt = (run.meanUp > 0.9)
        ? 'holding ±' + (run.lastTiltDeg != null ? Math.abs(run.lastTiltDeg).toFixed(1) : '?') + '° · hold quality ' + run.meanUp.toFixed(3) + ' · g=' + run.g
        : 'designing… (replays regenerate each gen)';
      ctx.fillText(holdTxt, 10, h - 20);
    } else {                                   // rigidSwingup
      const su = run.su || {};
      const verified = su.bestVerified;
      const accels = (verified && verified.accels) || su.bestAccels;
      ctx.fillStyle = DIM;
      ctx.font = font(13, true);
      ctx.fillText('Feedforward plan — open-loop cart accel (exact-gradient trajopt)', 10, 8);
      const plotY = 30, plotH = Math.max(50, h - 130);
      if (accels && accels.length) {
        const maxA = (run.rdOpts && run.rdOpts.maxAccel) || 6000;
        const midY = plotY + plotH / 2;
        ctx.strokeStyle = DIMMER;
        ctx.beginPath(); ctx.moveTo(10, midY); ctx.lineTo(w - 10, midY); ctx.stroke();
        ctx.strokeStyle = verified ? GOOD : WARN;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < accels.length; i++) {
          const px = 10 + (i / (accels.length - 1)) * (w - 20);
          const py = midY - (accels[i] / maxA) * (plotH / 2 - 4);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = DIMMER;
        ctx.font = font(10);
        ctx.fillText('0s', 10, midY + 4);
        ctx.textAlign = 'right';
        ctx.fillText((accels.length / 60).toFixed(1) + 's', w - 10, midY + 4);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = DIMMER;
        ctx.font = font(12);
        ctx.fillText('no plan yet — press Train to run the optimizer', 10, plotY + 20);
      }
      // Mini catch-LQR strip.
      ctx.fillStyle = DIMMER;
      ctx.font = font(10);
      ctx.fillText('→ then the LQR catches:  u = −K·x', 10, plotY + plotH + 8);
      drawKBars(run.K, 180, plotY + plotH + 4, Math.min(220, w - 200), 22, true);
      // Status line.
      ctx.font = font(12, true);
      if (verified) {
        ctx.fillStyle = GOOD;
        ctx.fillText('VERIFIED — caught at ' + (verified.caughtAtS != null ? verified.caughtAtS.toFixed(2) : '?')
          + 's · hold ' + verified.holdMeanUp.toFixed(3)
          + (su.restarts ? ' · ' + su.restarts + ' restart' + (su.restarts > 1 ? 's' : '') : ''), 10, h - 20);
      } else {
        ctx.fillStyle = WARN;
        ctx.fillText('optimizing — proxy ' + Math.max(0, su.bestScore || 0).toFixed(2)
          + ' · iter ' + (su.iter || 0)
          + (su.restarts ? ' · ' + su.restarts + ' restarts' : '')
          + (app.training ? '' : '  (press Train to continue)'), 10, h - 20);
      }
    }
    ctx.restore();
  }

  // ---------------- Right-bar visualisation tabs ----------------
  // The right column outgrew a single vertical stack, so its panels are
  // grouped into four tabs (Network / Population / Progress / Internals).
  // Two invariants make this safe to bolt onto the existing panels:
  //
  //  1. Every canvas stays MOUNTED. Each renderer captured its canvas and 2D
  //     context once at boot, so destroying or recreating a panel would leave
  //     a live renderer painting into a detached node. Tabs therefore toggle
  //     the WRAPPER (.viz-tabpanel[hidden]) and never touch the sections.
  //  2. The mode-conditional show/hide logic already in this file — line
  //     search (gradient modes), backprop-through-time (grad-exact modes),
  //     planner lookahead (dodge-planner), lineage (NEAT), behavior space
  //     (setup has descriptors), solution space (checkbox) — keeps writing
  //     each SECTION's own inline display and is not modified. Tab
  //     availability is DERIVED from those writes: a tab whose sections are
  //     all inline-hidden disables itself, and if that happens to be the
  //     active tab the view falls back to the first available one while
  //     REMEMBERING the user's pick, so it snaps back when the mode returns.
  const VIZ_TAB_KEY = 'bf.vizTab.v1';
  const vizTabState = {
    buttons: [],
    panels: [],                  // [{ id, panelEl, btn, sections: [el] }]
    sectionTab: new Map(),       // .panel-section element -> tab id
    active: null,
    preferred: null,             // last tab the USER chose (survives fallback)
    ready: false,
    lastAvail: '',               // memo so the per-frame refresh writes nothing
  };

  // A section is "shown" iff its own inline display isn't none. Inline style
  // is the one channel every mode-conditional toggle above uses, and unlike
  // getComputedStyle it stays readable while an ancestor tab wrapper is
  // hidden — which is exactly the situation we need to answer for.
  function vizSectionShown(el) {
    return !!el && el.style.display !== 'none';
  }

  // True when `el` (a .panel-section) belongs to the ACTIVE tab and is not
  // itself hidden. Fail-open: an element the tab machinery doesn't know about
  // (or a boot that never ran setup) draws as before, so a wiring mistake can
  // never blank a panel.
  function vizShown(el) {
    if (!vizTabState.ready || !el) return true;
    const tab = vizTabState.sectionTab.get(el);
    if (!tab) return true;
    const panel = vizTabState.panels.find(p => p.id === tab);
    return tab === vizTabState.active && !panel?.explanation && vizSectionShown(el);
  }

  // Visual-only switch (no persistence) — used by the availability fallback.
  function applyVizTab(id) {
    if (!vizTabState.ready) return;
    vizTabState.active = id;
    for (const p of vizTabState.panels) {
      const on = p.id === id;
      if (on) p.panelEl.removeAttribute('hidden');
      else p.panelEl.setAttribute('hidden', '');
      p.btn.setAttribute('aria-selected', on ? 'true' : 'false');
      p.btn.tabIndex = on ? 0 : -1;
    }
  }

  // User-driven switch: records the preference (so a temporary fallback can
  // be undone later), persists it, and repaints immediately rather than
  // waiting for the next rAF — full-power mode skips render frames entirely.
  function chooseVizTab(id, opts) {
    const entry = vizTabState.panels.find(p => p.id === id);
    if (!entry) return;
    vizTabState.preferred = id;
    try { localStorage.setItem(VIZ_TAB_KEY, id); } catch (e) { /* private mode */ }
    applyVizTab(id);
    if (opts && opts.focus) entry.btn.focus();
    try { drawAll(); } catch (e) { /* next frame will retry */ }
  }

  // Cheap per-frame reconciliation: disable empty tabs, fall back off an
  // emptied active tab, and snap back to the user's pick once it refills.
  function refreshVizTabAvailability() {
    if (!vizTabState.ready) return;
    let sig = '';
    const avail = [];
    const method = BF.presetNavigation.approach({mode:dom.modeSelect.value, policyType:dom.policyTypeSelect.value});
    const context = {testing:app.testing, learns:method.learns,
      populationBased:!['fdgd','spsa','adam','lbfgs','diffsim-adam','dodge-distill','ppo'].includes(dom.modeSelect.value)};
    for (const p of vizTabState.panels) {
      const explanation = BF.presetNavigation.tabExplanation(p.id, context);
      if (p.explanation !== explanation) {
        p.explanation = explanation;
        p.panelEl.classList.toggle('has-explanation', !!explanation);
        p.emptyEl.hidden = !explanation;
        p.emptyEl.textContent = explanation;
      }
      let ok = !!explanation;
      for (const s of p.sections) { if (vizSectionShown(s)) { ok = true; break; } }
      avail.push(ok);
      sig += ok ? '1' : '0';
    }
    const want = vizTabState.preferred;
    const wantIdx = vizTabState.panels.findIndex(p => p.id === want);
    const activeIdx = vizTabState.panels.findIndex(p => p.id === vizTabState.active);
    const needSwitch =
      (wantIdx >= 0 && avail[wantIdx] && vizTabState.active !== want) ||
      (activeIdx >= 0 && !avail[activeIdx]);
    if (sig === vizTabState.lastAvail && !needSwitch) return;
    vizTabState.lastAvail = sig;
    for (let i = 0; i < vizTabState.panels.length; i++) {
      const btn = vizTabState.panels[i].btn;
      if (btn.disabled !== !avail[i]) btn.disabled = !avail[i];
    }
    if (wantIdx >= 0 && avail[wantIdx]) {
      if (vizTabState.active !== want) applyVizTab(want);
      return;
    }
    if (activeIdx >= 0 && !avail[activeIdx]) {
      const firstOk = avail.indexOf(true);
      if (firstOk >= 0) applyVizTab(vizTabState.panels[firstOk].id);
    }
  }

  function setupVizTabs() {
    const bar = dom.vizTabs;
    if (!bar) return;
    const btns = Array.prototype.slice.call(bar.querySelectorAll('.viz-tab'));
    if (btns.length === 0) return;
    for (const btn of btns) {
      const id = btn.getAttribute('data-viz-tab');
      const panelEl = document.getElementById('vizTabPanel-' + id);
      if (!panelEl) continue;
      const sections = Array.prototype.slice.call(panelEl.querySelectorAll(':scope > .panel-section'));
      for (const s of sections) vizTabState.sectionTab.set(s, id);
      const emptyEl = document.createElement('p');
      emptyEl.className = 'viz-explanation'; emptyEl.hidden = true;
      panelEl.prepend(emptyEl);
      vizTabState.panels.push({ id, panelEl, btn, sections, emptyEl, explanation:'' });
      vizTabState.buttons.push(btn);
      btn.addEventListener('click', () => chooseVizTab(id));
    }
    if (vizTabState.panels.length === 0) return;
    // Roving-tabindex keyboard model: ←/→ move between ENABLED tabs (an
    // empty tab is skipped, not focused-then-dead-ended), Home/End jump to
    // the ends. Space/Enter come free from <button>.
    bar.addEventListener('keydown', (e) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (keys.indexOf(e.key) === -1) return;
      const enabled = vizTabState.panels.filter(p => !p.btn.disabled);
      if (enabled.length === 0) return;
      const cur = enabled.findIndex(p => p.id === vizTabState.active);
      let next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = enabled.length - 1;
      else {
        const d = e.key === 'ArrowRight' ? 1 : -1;
        next = ((cur < 0 ? 0 : cur) + d + enabled.length) % enabled.length;
      }
      e.preventDefault();
      chooseVizTab(enabled[next].id, { focus: true });
    });
    vizTabState.ready = true;
    let saved = null;
    try { saved = localStorage.getItem(VIZ_TAB_KEY); } catch (e) { /* private mode */ }
    const initial = vizTabState.panels.some(p => p.id === saved)
      ? saved : vizTabState.panels[0].id;
    vizTabState.preferred = initial;
    applyVizTab(initial);
    refreshVizTabAvailability();
  }

  // ---- Recurrent policy: a REAL drawable network, not the placeholder ----
  // The recurrent policy's population genome is an empty placeholder (its
  // weights live in a flat params vector), so drawing THAT gave a 6-input stub
  // with no edges — and a chord with nothing to analyse. But the parameter
  // layout IS BF.cmaes.genomeFromParams' layout for the WRAPPED MLP
  // (obs+mem -> hidden -> actions+mem); recurrent_policy.js says so and
  // smoke-test.js asserts the two forward passes BIT-EQUAL. So we decode the
  // real 14 -> 16 -> 9 topology and name every node, memory channels included.
  //
  // Cached, because this runs once per DRAWN FRAME and the decode allocates
  // ~370 connection objects — each one burning a global innovation number.
  // The cache key CANNOT be the label arrays' identity: setup.observationAbbr
  // and .observationLabels are GETTERS that mint a fresh array on every read
  // (they depend on the observation mode), so an identity key never hits and
  // the "cache" would rebuild the genome 60 times a second. Key on the params
  // + config identity, plus a content signature of the labels.
  let _recurrentView = null;
  function recurrentNetworkView(trainer, setup) {
    if (!trainer || trainer.params.policyType !== 'recurrent') return null;
    if (!BF.recurrent || !BF.cmaes) return null;
    const cfg = trainer.recurrentConfig;
    const params = app.showPolicyParams;
    if (!cfg || !params || params.length !== BF.recurrent.paramCount(cfg)) return null;
    const abbrSrc = setup.observationAbbr || [];
    const fullSrc = setup.observationLabels || [];
    const sig = abbrSrc.join('') + '' + fullSrc.join('')
      + '' + ((setup.actionAbbr || []).join(''))
      + '' + ((setup.actionLabels || []).join(''));
    if (_recurrentView && _recurrentView.params === params && _recurrentView.cfg === cfg
        && _recurrentView.sig === sig) {
      return _recurrentView;
    }
    const A = cfg.obsCount, H = cfg.memSize, NO = cfg.numOutputs;
    const sev = !!cfg.sever;
    const abbrIn = [], fullIn = [];
    for (let i = 0; i < A; i++) {
      abbrIn.push(abbrSrc[i] != null ? String(abbrSrc[i]) : ('i' + i));
      fullIn.push(fullSrc[i] != null ? String(fullSrc[i]) : ('obs ' + i + ' (unlabeled)'));
    }
    for (let k = 0; k < H; k++) {
      abbrIn.push((sev ? '✂m' : 'm') + k);
      fullIn.push('memory read ' + k + (sev
        ? ' — HELD AT 0 (memory cut)'
        : ' — last step’s memory write ' + k + ', leaky-integrated (leak '
          + cfg.leak + ')'));
    }
    const actAbbrSrc = setup.actionAbbr || null;
    const actFullSrc = setup.actionLabels || null;
    const abbrOut = [], fullOut = [];
    for (let o = 0; o < NO; o++) {
      abbrOut.push(actAbbrSrc && actAbbrSrc[o] != null ? String(actAbbrSrc[o])
        : (NO === 1 ? 'cart' : 'a' + o));
      fullOut.push(actFullSrc && actFullSrc[o] != null ? String(actFullSrc[o])
        : (NO === 1 ? 'cart command' : 'action ' + o));
    }
    for (let k = 0; k < H; k++) {
      abbrOut.push('m' + k + '′');
      fullOut.push('memory write ' + k + ' — fed back into memory read ' + k
        + ' on the NEXT step' + (sev ? ' (severed: never read back)' : ''));
    }
    // A setup-shaped label shim. canvas-chord reads exactly these four arrays,
    // so the chord names the memory channels without knowing they exist.
    const labelSetup = {
      observationAbbr: abbrIn, observationLabels: fullIn,
      actionAbbr: abbrOut, actionLabels: fullOut,
    };
    // Re-decoding is only needed when the WEIGHTS changed; a label-only change
    // (observation mode, sever) keeps the same topology.
    const genome = (_recurrentView && _recurrentView.params === params && _recurrentView.cfg === cfg)
      ? _recurrentView.genome
      : BF.cmaes.genomeFromParams(params, cfg.wrappedInputs, cfg.wrappedOutputs, cfg.sizes);
    _recurrentView = {
      params: params, cfg: cfg, sig: sig, genome: genome,
      abbrIn: abbrIn, abbrOut: abbrOut, labelSetup: labelSetup,
    };
    return _recurrentView;
  }

  // Live activations for the recurrent view, keyed by the decoded genome's
  // node ids (inputs 0..nIn-1, outputs nIn..nIn+nOut-1, hidden after that).
  // Returns null when the policy has not run a step yet.
  function recurrentActivations(view) {
    const p = app.showPolicy;
    if (!view || !p || !p.lastOutput) return null;
    const cfg = view.cfg, nIn = cfg.wrappedInputs, nOut = cfg.wrappedOutputs;
    const inp = p.lastInput, hid = p.lastHidden, out = p.lastOutput;
    if (!inp || !out) return null;
    const m = new Map();
    for (let i = 0; i < nIn; i++) m.set(i, inp[i]);
    for (let o = 0; o < nOut; o++) m.set(nIn + o, out[o]);
    if (hid) for (let k = 0; k < hid.length; k++) m.set(nIn + nOut + k, hid[k]);
    return m;
  }

  // Input -> action influence chord for the champion genome. Recomputed from
  // scratch each draw, but ONLY while its panel is the visible tab — the DP
  // is O(edges x actions), which is trivial for a 6-input pendulum and worth
  // skipping on a 548-input dodge genome when nobody is looking at it.
  function drawChord(networkGenome, setup, opts) {
    if (!app.chordRenderer || !dom.chordPanel) return;
    if (!vizShown(dom.chordPanel)) return;
    // The rigid/LQR modes run a FACADE trainer whose scaffold genome is not
    // the controller — the network panel already refuses to draw it as
    // "topology" for exactly that reason, and a chord over those weights
    // would be a confident picture of nothing. Same for the CNN policies:
    // their genome is an empty placeholder and the real parameters live in a
    // params vector with no per-input path structure.
    if (opts && opts.analytic) {
      app.chordRenderer.placeholder('Analytic controller — no learned weights',
        'the gains come from the model, not from input→action paths');
      return;
    }
    if (opts && opts.cnn) {
      app.chordRenderer.placeholder('CNN policy — no per-input weight paths',
        'the network panel shows its conv → pool → dense architecture instead');
      return;
    }
    app.chordRenderer.draw(networkGenome, { setup: setup });
  }

  function drawAll(frameTime) {
    if (!app.showState) return;
    const vizNow=Number.isFinite(frameTime)?frameTime:performance.now();
    if(app._vizPolicy!==app.showPolicy||app._vizState!==app.showState){
      app._vizPolicy=app.showPolicy;app._vizState=app.showState;app._vizIdentity={};
    }
    const visualOptions={now:vizNow,smoothing:!!app.vizSmoothing&&!app.netReducedMotion&&!app.paused,
      identity:app._vizIdentity,reducedMotion:app.netReducedMotion||app.paused};
    if(!isDodgeScorerMode() && app._dodgeCanvasHeight){dom.netCanvas.style.height='';app._dodgeCanvasHeight=false;}
    if(isDodgeScorerMode())app.dodgeFrameHistory?.sample(app.showState);
    syncControlDiagnostics();
    const ghostStates = app.ghosts.map(g => g.state);
    app.simRenderer.draw(app.showState, {
      showTrail: dom.showTrail.checked,
      showHelpers: dom.showHelpers.checked,
      ghosts: dom.showGhosts.checked ? ghostStates : [],
      editMode: app.editMode,
    });
    // Compare-mode: paint B's sim onto its sibling canvas. No ghosts
    // here -- the second pane is purely "what does B's best agent
    // look like right now," and ghosts cluttering it would defeat
    // the side-by-side clarity.
    if (app.trainerB && app.simRendererB && app.showStateB) {
      app.simRendererB.draw(app.showStateB, {
        showTrail: dom.showTrail.checked,
        showHelpers: dom.showHelpers.checked,
        ghosts: [],
        editMode: false,
      });
    }
    const trace = app.showPolicy && app.showPolicy.lastTrace;
    // Test mode shows the best-ever genome; training mode shows current-best.
    const networkGenome = app.trainer
      ? (app.testing && app.trainer.bestEver
          ? app.trainer.bestEver
          : (app.trainer.currentBest || app.trainer.population[0].genome))
      : null;
    const setup = BF.setups.getSetup(app.trainer ? app.trainer.setupId : 'single');
    const policyType = app.trainer ? app.trainer.params.policyType : 'mlp';
    // Recurrent: swap the empty placeholder genome for the decoded wrapped MLP
    // and its label shim, so the panel + chord + tooltip all name the memory
    // channels instead of drawing an unlabelled 6-input stub.
    const recView = recurrentNetworkView(app.trainer, setup);
    const netGenome = recView ? recView.genome : networkGenome;
    const netSetup = recView ? recView.labelSetup : setup;
    // The tooltip resolves names off this, so hovering a memory node names it.
    app._netLabelSetup = netSetup;
    const isCNN = policyType === 'cnn';
    const isCNN3D = policyType === 'cnn3d';
    const isCNNGrid = policyType === 'cnn-grid';
    const isCNNMulti = policyType === 'cnn-multiscale';
    // For CNN mode, the displayed policy maintains intermediate activations
    // (lastImage / lastConv / lastPool / lastHidden / lastOutput) which the
    // network renderer paints into the per-layer blocks. Cheap — just shape-
    // sized typed arrays already produced by the forward pass.
    const cnnState = (isCNN && app.showPolicy) ? {
      image:  app.showPolicy.lastImage,
      conv:   app.showPolicy.lastConv,
      pool:   app.showPolicy.lastPool,
      hidden: app.showPolicy.lastHidden,
      lastOutput: app.showPolicy.lastOutput || 0,
    } : null;
    // Dodge grid CNN: same intermediate-state pattern as the 2D CNN, but
    // lastOutput is the FULL action vector (length numOutputs) so the
    // network panel can render one bar per action axis.
    const cnnGridState = (isCNNGrid && app.showPolicy) ? {
      image:  app.showPolicy.lastImage,
      conv:   app.showPolicy.lastConv,
      pool:   app.showPolicy.lastPool,
      hidden: app.showPolicy.lastHidden,
      lastOutput: app.showPolicy.lastOutput,
    } : null;
    // Multi-scale CNN: two parallel branches, so we expose two sets
    // of image/conv/pool intermediates. The renderer draws them side
    // by side under the policy panel.
    const cnnMultiState = (isCNNMulti && app.showPolicy) ? {
      localImage:  app.showPolicy.lastLocalImage,
      globalImage: app.showPolicy.lastGlobalImage,
      localConv:   app.showPolicy.lastLocalConv,
      globalConv:  app.showPolicy.lastGlobalConv,
      localPool:   app.showPolicy.lastLocalPool,
      globalPool:  app.showPolicy.lastGlobalPool,
      hidden:      app.showPolicy.lastHidden,
      lastOutput:  app.showPolicy.lastOutput,
    } : null;
    // 3D CNN exposes lastVolume + 3D conv/pool maps. The renderer reduces
    // them to 2D thumbnails (max-projection along the depth axis) so the
    // panel can show a meaningful preview without expensive volumetric
    // rendering.
    const cnn3dState = (isCNN3D && app.showPolicy) ? {
      volume: app.showPolicy.lastVolume,
      conv:   app.showPolicy.lastConv,
      pool:   app.showPolicy.lastPool,
      hidden: app.showPolicy.lastHidden,
      filterActivations: app.showPolicy.lastFilterActivations,
      lastOutput: app.showPolicy.lastOutput || 0,
    } : null;
    // Input-layout hint: when the active setup feeds the policy a 2D
    // structured observation (currently dodge + grid OR dodge +
    // multiscale), tell the network renderer to lay out the input
    // nodes in a 2D arrangement matching that structure instead of a
    // single tall column. Makes the 132/260-input NEAT genome readable
    // as "agent state + grid(s)" instead of a wall of unlabeled dots.
    //
    // Only set when the policy is the flat-genome kind (NEAT / MLP /
    // CMA-ES MLP) -- the dedicated CNN policies (cnn-grid,
    // cnn-multiscale) render their own architectural diagrams via the
    // cnnGridMode / cnnMultiscaleMode opts and don't go through the
    // computeLayout path at all.
    const dodgeObsMode = app.showState && app.showState.observationMode;
    const isDodge = app.trainer && app.trainer.setupId === 'dodge';
    let inputLayout = null;
    if (isDodge && !isCNNGrid && !isCNNMulti) {
      if (dodgeObsMode === 'grid') {
        inputLayout = { kind: 'dodge-grid', gridSize: 16, agentInputs: 4 };
      } else if (dodgeObsMode === 'multiscale') {
        // Two 16×16 grids (local + global) stacked under the agent
        // state row. The renderer reads localGridSize + globalGridSize
        // off the hint to size each panel; agentInputs counts ONLY
        // the pre-grid state floats.
        //
        // topKTail captures the 8-nearest-bullets info the multiscale
        // observation appends AFTER the two grids (TOPK_K * 4 floats:
        // dx, dy, vx, vy per bullet). Without listing it here, the
        // renderer's length-equality check fails (548 actual vs 516
        // expected) and falls through to the linear layout -- which
        // is the regression the user just hit. The renderer also uses
        // this number to place the tail inputs in a visible mini-block
        // alongside the two grid panels.
        inputLayout = {
          kind: 'dodge-multiscale',
          localGridSize: 16,
          globalGridSize: 16,
          agentInputs: 4,
          topKTail: 32,
        };
      }
    }
    // Model-based rigid modes have no network. Show the LQR gain row and/or
    // optimized open-loop feedforward plan instead of the facade trainer's
    // dummy genome.
    const rigidPanelRun = (isDiffsimMode() && app.diffsimRun
      && (app.diffsimRun.kind === 'rigidLqr' || app.diffsimRun.kind === 'rigidSwingup'))
      ? app.diffsimRun : null;
    const energyController = isSingleSwingupMode() && app.showPolicy && app.showPolicy.controller;
    const densityToggle=document.getElementById('networkDensityToggle');
    if(densityToggle)densityToggle.hidden=!!rigidPanelRun||!!energyController||isDodgeScorerMode();
    setNetPanelTitle(isDodgeScorerMode()
      ? {title:'Learned action scoring',hint:'physical forecast → shared learned score'} : energyController
      ? {title:'Energy shaping → LQR',hint:'live classical feedback · no network'}
      : rigidPanelRun
      ? { title: 'Analytic controller', hint: 'model-based — no network' }
      : isCNNGrid ? {title:'Convolution + dense control',hint:'sensor → features + body → actions'}
      : null);
    // Both network-panel painters are skipped while the Network tab is
    // hidden. The title/hint above still updates so the header is correct the
    // instant the tab is shown again.
    if (!vizShown(dom.netPanel)) {
      // nothing to paint into a hidden canvas
    } else if (isDodgeScorerMode()) {
      BF.dodgeScorerView?.draw(dom.netCanvas,app.showPolicy,app.showState,app.dodgeFrameHistory,visualOptions);
      app._dodgeCanvasHeight=true;
    } else if (energyController) {
      drawEnergyControllerPanel(energyController);
    } else if (rigidPanelRun) {
      drawAnalyticControllerPanel(rigidPanelRun);
    } else {
      app.netRenderer.draw(netGenome, {
      time:vizNow,smoothing:visualOptions.smoothing,smoothingIdentity:app._vizIdentity,
      layoutDensity:app.networkDensity||'loose',
      reducedMotion:app.netReducedMotion,
      activations: dom.showActivations.checked
        ? (recView ? recurrentActivations(recView) : (trace ? trace.activations : null))
        : null,
      observationAbbr: netSetup.observationAbbr,
      actionAbbr: netSetup.actionAbbr,
      cnnMode: isCNN,
      cnnConfig: isCNN ? app.trainer.cnnConfig : null,
      cnnState: cnnState,
      cnn3dMode: isCNN3D,
      cnn3dConfig: isCNN3D ? app.trainer.cnn3dConfig : null,
      cnn3dState: cnn3dState,
      cnnGridMode: isCNNGrid,
      cnnGridConfig: isCNNGrid ? app.trainer.cnnGridConfig : null,
      cnnGridState: cnnGridState,
      cnnGridActionLabels:app.trainer?.setupId==='terrain-run'?['drive','jump']:netSetup.actionAbbr,
      cnnMultiscaleMode: isCNNMulti,
      cnnMultiscaleConfig: isCNNMulti ? app.trainer.cnnMultiscaleConfig : null,
      cnnMultiscaleState: cnnMultiState,
      inputLayout: inputLayout,
      // Pass the simplified-rendering toggle through. When ON, the
      // network renderer swaps beziers for straight lines and uses
      // a uniform grey stroke instead of per-connection weight
      // coloring -- a big speedup on huge-input genomes (dodge +
      // 16x16 grid in particular).
      simplifiedRender: dom.simplifiedNetRender ? dom.simplifiedNetRender.checked : false,
      });
    }
    const perceptionPanel=document.getElementById('perceptionPanel');
    if(perceptionPanel && BF.perceptionCircuit){
      const hasFrame=app._perceptionPolicy===app.showPolicy && app._perceptionState===app.showState;
      const eligible=hasFrame && !isDodgeScorerMode() && BF.perceptionCircuit.supports(app.trainer,app.showPolicy,app._perceptionObservation);
      perceptionPanel.hidden=!eligible;
      if(eligible && perceptionPanel.open && vizShown(perceptionPanel)){
        const view=BF.perceptionCircuit.snapshot(app.trainer,app.showPolicy,app._perceptionObservation,app.showState);
        perceptionPanel.hidden=!view;
        if(view && perceptionPanel.open && vizShown(perceptionPanel)){
          const desc=document.getElementById('perceptionDescription');
          if(desc.textContent!==view.description)desc.textContent=view.description;
          BF.perceptionCircuit.draw(document.getElementById('perceptionCanvas'),view,visualOptions);
        }
      }
    }
    // Input -> action influence chord. Shares the Network tab with the
    // topology: same genome, different question ("what does it look at?"
    // rather than "what shape is it?").
    if(isDodgeScorerMode()) {
      if(vizShown(dom.chordPanel))app.chordRenderer?.placeholder('Eight forecast features → one learned score','The same learned scorer evaluates each heading; the panel above shows actual scores.');
    } else drawChord(netGenome, netSetup, {
      analytic: !!rigidPanelRun || !!energyController,
      cnn: isCNN || isCNN3D || isCNNGrid || isCNNMulti,
    });
    // Pass the curriculum's recorded level-up gens to the chart as
    // marker lines. They give the user an at-a-glance map of "which
    // chunk of this curve corresponds to which curriculum level," so
    // a fitness drop at the same x as a marker is clearly a level-up
    // discontinuity rather than mysterious noise.
    const _markerGens = (app.trainer && app.trainer.curriculum && app.trainer.curriculum.levelUpGens)
      ? app.trainer.curriculum.levelUpGens
      : null;
    const _overlayHistory = (app.trainerB && app.trainerB.history && app.trainerB.history.length > 0)
      ? app.trainerB.history : null;
    const _chartOpts = (_markerGens || _overlayHistory)
      ? { markerGens: _markerGens, overlayHistory: _overlayHistory }
      : undefined;
    if (vizShown(dom.fitPanel)) {
      app.fitChart.draw(
        app.trainer ? app.trainer.history : [],
        undefined,
        _chartOpts
      );
    }
    // Mode-specific algorithm-internals chart: pick the series for the
    // currently-active algorithm. Falls back to NEAT lines if mode unknown.
    // Diffsim modes: the facade trainer's params.mode is 'cmaes' (a scaffold),
    // so read the REAL mode from the dropdown -> the grad-only series
    // (gradient norm / loss / mutation sigma) plot instead of empty CMA lines.
    const mode = isDiffsimMode()
      ? dom.modeSelect.value
      : (app.trainer ? app.trainer.params.mode : 'neat');
    const algo = ALGO_INTERNALS_SERIES[mode] || ALGO_INTERNALS_SERIES.neat;
    // Merge adversarial overlay into the algorithm series when active —
    // user sees both algo internals and env-pop dynamics on the same chart.
    const advOn = app.trainer && app.trainer.params.adversarialOn;
    const series = advOn ? algo.series.concat(ADVERSARIAL_OVERLAY.series) : algo.series;
    const hint = advOn ? algo.hint + ' ' + ADVERSARIAL_OVERLAY.hint : algo.hint;
    if (dom.algoInternalsHint.textContent !== hint) {
      dom.algoInternalsHint.textContent = hint;
    }
    if (vizShown(dom.topoPanel)) {
      app.topoChart.draw(app.trainer ? app.trainer.history : [], series);
    }
    if (vizShown(dom.popPanel)) {
      app.popRenderer.draw(app.trainer ? app.trainer.evaluatedSnapshot : null, {});
    }
    // Lineage panel: only relevant in NEAT mode (no parent-child concept in
    // SA/PT/CMA-ES/DE/PSO — those replace the population wholesale each gen).
    const showLineage = app.trainer && T.isNeatMode(app.trainer.params.mode);
    if (dom.lineagePanel) {
      dom.lineagePanel.style.display = showLineage ? '' : 'none';
    }
    // Renderer options: pass through the extended-tags toggle so origin
    // pills (best-ever / qd-archive / transplant) can be collapsed on
    // demand. Default true matches the renderer's own default.
    const lineageOpts = {
      showExtendedTags: dom.lineageShowExtendedTags ? dom.lineageShowExtendedTags.checked : true,
    };
    if (!vizShown(dom.lineagePanel)) {
      // hidden by mode or by tab — nothing to paint
    } else if (showLineage && app.trainer.lastLineage && app.trainer.evaluatedSnapshot) {
      app.lineageRenderer.draw(app.trainer.lastLineage, app.trainer.evaluatedSnapshot, lineageOpts);
    } else if (showLineage) {
      app.lineageRenderer.draw([], [], lineageOpts); // placeholder
    }
    // Genome-space scatter. We render the JUST-EVALUATED population (snapshot)
    // rather than the next generation, so fitness colors are meaningful. The
    // bestEverHistory drives the trail polyline. Skip the work entirely if
    // the panel is hidden — even with caching, this is a non-trivial draw.
    if (dom.showGenomeSpace.checked && vizShown(dom.genomePanel)) {
      if (app.trainer && app.trainer.evaluatedSnapshot && app.trainer.evaluatedSnapshot.length > 0) {
        app.genomeRenderer.draw(app.trainer.evaluatedSnapshot, {
          eliteRatio: app.trainer.params.eliteRatio,
          generation: app.trainer.generation,
          bestEverHistory: app.trainer.bestEverHistory,
          mode: app.trainer.params.mode,
          projectionMode: dom.projectionMode ? dom.projectionMode.value : 'pca',
          showDensity:    dom.showDensity ? dom.showDensity.checked : true,
          showSpreadEllipse: dom.showSpreadEllipse ? dom.showSpreadEllipse.checked : true,
          // ACO archive: pass the algorithm's pheromone-weighted memory so the
          // genome-space renderer can draw it as a faint dot field.
          acoArchive: (app.trainer.aco && app.trainer.aco.archive) || null,
        });
      } else {
        app.genomeRenderer.draw([], { generation: -1 });
      }
    }
    // Behavior-space heatmap. Reads trainer.behaviorArchive (lifetime
    // exploration map) + trainer.lastSetupBehaviors (current gen scatter).
    // No-op when no descriptors are registered for the active setup.
    if (app.behaviorRenderer && app.trainer && vizShown(dom.behaviorPanel)) {
      const archive = app.trainer.behaviorArchive;
      const setupId = app.trainer.setupId;
      let xLabel = archive && archive.xKey, xRange = [0, 1];
      let yLabel = archive && archive.yKey, yRange = [0, 1];
      if (BF.behaviors && archive) {
        const xd = BF.behaviors.findDescriptor(setupId, archive.xKey);
        const yd = BF.behaviors.findDescriptor(setupId, archive.yKey);
        if (xd) { xLabel = xd.label; xRange = xd.range; }
        if (yd) { yLabel = yd.label; yRange = yd.range; }
      }
      // Pareto-rank overlay: when the toggle is on AND Pareto selection
      // is active, the dot color reflects each individual's NSGA-II
      // rank. Reads ind.paretoRank from the live population via
      // currentBehaviors[i].individualIndex. The renderer falls back to
      // the white-dot default if no rank data is available.
      const paretoOverlayOn =
        (dom.behaviorShowParetoRank ? dom.behaviorShowParetoRank.checked : true)
        && !!(app.trainer.params && app.trainer.params.paretoSelectionEnabled);
      app.behaviorRenderer.draw({
        archive: archive,
        setupId: setupId,
        currentBehaviors: app.trainer.lastSetupBehaviors || [],
        // Pass the population (read-only) so the renderer can look up
        // paretoRank per individualIndex. Kept as a separate arg from
        // currentBehaviors because lastSetupBehaviors is keyed on the
        // descriptor dict, not the genome -- and we don't want to
        // bloat each behavior record with rank metadata that's only
        // valid for one gen.
        population: app.trainer.population || null,
        showParetoOverlay: paretoOverlayOn,
        xLabel: xLabel, yLabel: yLabel,
        xRange: xRange, yRange: yRange,
        empty: (BF.behaviors && BF.behaviors.getDescriptors(setupId).length === 0)
          ? `No behavior descriptors registered for "${setupId}"`
          : 'No exploration data yet — start training',
      });
    }
    drawCNNInset();
    drawCNN3DInset();
    // Line-search panel — only meaningful for FD-GD / SPSA. Pulls last gen's
    // probe results directly off the algorithm state.
    if (app.lineSearchRenderer && dom.lineSearchPanel
        && dom.lineSearchPanel.style.display !== 'none'
        && vizShown(dom.lineSearchPanel)) {
      const gd = app.trainer && (app.trainer.fdgd || app.trainer.spsa);
      if (gd) {
        app.lineSearchRenderer.draw(gd.lineSearchProbes, gd.anchorFitness);
      } else {
        app.lineSearchRenderer.draw([], null);
      }
    }
    drawGradFlow();
    drawPlannerLookahead();
    // Runs AFTER every panel has written its own inline display for this
    // frame, so tab availability reflects the current mode immediately.
    refreshVizTabAvailability();
    updateBadges();
    updateStatus();
    updateStabilityHUD();
    updateAdversarialHint();
    if (typeof updateCurriculumHint === 'function') updateCurriculumHint();
    if (typeof updateCurriculumSpecCurValues === 'function') updateCurriculumSpecCurValues();
    // Per-slider curriculum overlay: cheap (~10 sliders × a few DOM
    // writes), redrawn each frame so the current-applied dot tracks
    // the level counter as the trainer levels up.
    if (typeof refreshAllSliderOverlays === 'function') refreshAllSliderOverlays();
    // Hole preview: tracks the live applied holeWidth/ballRadius (so
    // the visual stays accurate as curriculum ramps the hole during
    // training). Cheap — ~5 DOM writes — and idempotent if values
    // haven't changed (textContent + width assignments are no-ops
    // when the value is the same).
    if (typeof updateHolePreview === 'function') updateHolePreview();
  }

  // Live summary of the hardest env this gen — surfaces what extreme of
  // the difficulty distribution the controllers are being tested against.
  // Hidden when adversarial mode is off.
  function updateAdversarialHint() {
    if (!dom.adversarialHint) return;
    if (!dom.adversarialOn.checked || !app.trainer || !app.trainer.envPop) {
      return;
    }
    const hardest = BF.adversarial.hardestEnv(app.trainer.envPop);
    if (!hardest) {
      dom.adversarialHint.textContent = 'evolving env pop · awaiting first gen';
      return;
    }
    const div = app.trainer.envPop.lastDiversity || 0;
    dom.adversarialHint.innerHTML =
      `hardest env: g×${hardest.gravityMul.toFixed(2)} · d×${hardest.dampingMul.toFixed(2)} · ` +
      `accel×${hardest.cartAccelMul.toFixed(2)} · ang×${hardest.startAngleScale.toFixed(2)} · ` +
      `push×${hardest.pushStrengthMul.toFixed(2)}<br>` +
      `<span class="info">env-pop diversity ${div.toFixed(3)} (per-knob σ)</span>`;
  }

  // Live diagnostics for the three anti-regression toggles. Reads only
  // public trainer state (no peeking into internal closures), updated per
  // frame so countdowns tick smoothly even between trainer steps.
  function updateStabilityHUD() {
    if (!dom.showStabilityHUD || !dom.stabilityHUD) return;
    const on = dom.showStabilityHUD.checked;
    if (!on || isSingleSwingupMode() || (app.testing && app.loadedPolicyGenome === app.trainer.bestEver)) {
      dom.stabilityHUD.classList.add('hidden');
      return;
    }
    // Detect when bestEverFitness just jumped. Without this, the HUD
    // is silent on the most exciting event during training -- "we
    // beat our previous best by N". We compare against a frame-
    // remembered value and stash the generation of the change so the
    // glow can linger for a few gens (the eye needs time to find the
    // pulsing row before it stops pulsing).
    if (app.trainer) {
      const tNow = app.trainer;
      const prev = (app._hudPrevBestEver != null) ? app._hudPrevBestEver : -Infinity;
      if (isFinite(tNow.bestEverFitness) && tNow.bestEverFitness > prev + 1e-6) {
        app._hudLastBestImproveGen = tNow.generation;
      }
      app._hudPrevBestEver = tNow.bestEverFitness;
    }
    dom.stabilityHUD.classList.remove('hidden');
    const t = app.trainer;
    if (!t) {
      dom.hudHallOfFame.innerHTML = '<div class="hud-row"><span class="hud-key">no trainer</span></div>';
      dom.hudRollback.innerHTML = '';
      dom.hudAnneal.innerHTML = '';
      if (dom.hudEscape) dom.hudEscape.innerHTML = '';
      return;
    }
    const p = t.params;

    // ---- Input-count mismatch warning
    // The setup's observationCount is the number of inputs the
    // current scene provides. The population's genomes have their
    // numInputs baked at population-init time. If we've upgraded
    // the observation since then (e.g. golf/putt 10 → 15 on a
    // recent commit), the existing genomes silently DROP the new
    // observations — they can't see ball velocity, struck flag,
    // etc. Catastrophic for training quality, completely silent
    // failure mode otherwise.
    if (!dom._hudMismatch) {
      dom._hudMismatch = document.createElement('div');
      dom._hudMismatch.className = 'hud-section';
      dom.stabilityHUD.insertBefore(dom._hudMismatch, dom.stabilityHUD.firstChild.nextSibling);
    }
    const setup = BF.setups.getSetup(t.setupId);
    const expectedIn = setup ? setup.observationCount : null;
    const actualIn = (t.population && t.population[0] && t.population[0].genome)
                       ? t.population[0].genome.numInputs : null;
    if (expectedIn != null && actualIn != null && expectedIn !== actualIn) {
      // Input mismatch is catastrophic — pulse it red so the user
      // actually notices instead of training a broken pop for an hour.
      dom._hudMismatch.innerHTML =
        `<div class="hud-row"><span class="hud-key hud-fire hud-glow-fire">⚠ INPUT MISMATCH</span></div>` +
        `<div class="hud-row"><span class="hud-key">setup wants</span><span class="hud-fire">${expectedIn}</span></div>` +
        `<div class="hud-row"><span class="hud-key">pop has</span><span class="hud-fire">${actualIn}</span></div>` +
        `<div class="hud-row"><span class="hud-key" style="font-size:10px;">click <b>New run</b> to fix</span></div>`;
    } else {
      dom._hudMismatch.innerHTML = '';
    }

    // ---- Scene state — what the trainer is ACTUALLY using
    // Verifies that scene-edit drag and curriculum overlay
    // propagated correctly. If user dragged the ball to (40, 80)
    // they should see ballSpawn=(40, 80) here next frame. If not,
    // there's a propagation bug to chase.
    if (!dom._hudScene) {
      dom._hudScene = document.createElement('div');
      dom._hudScene.className = 'hud-section';
      dom.hudEscape.parentNode.insertBefore(dom._hudScene, dom.hudEscape);
    }
    const A = (k) => {
      // Mirror appliedCurriculumParam logic so the HUD shows the
      // value the next rollout will actually use.
      if (typeof appliedCurriculumParam === 'function') {
        return appliedCurriculumParam(p, k);
      }
      return p[k];
    };
    const isBallish = setup && (t.setupId === 'ball-single' || t.setupId === 'golf' || t.setupId === 'golf-challenge' || t.setupId === 'putt');
    const isGolfish = setup && (t.setupId === 'golf' || t.setupId === 'golf-challenge' || t.setupId === 'putt');
    const fmt = (v) => v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
    // In diffsim mode the "scene" the trainer ACTUALLY uses is the differentiable
    // engine's world, NOT the facade population trainer's params. Reading the
    // facade here showed a stale gravity (e.g. Scene 100 while the curriculum had
    // ramped the engine to 408) — the "working on scenario A while showing B"
    // confusion. Read the engine's live config instead.
    if (isDiffsimMode() && app.diffsimRun && app.diffsimRun.config) {
      const ec = app.diffsimRun.config;
      const cur = app.diffsimRun.cur;
      let scHtml = `<div class="hud-row"><span class="hud-key">Scene</span><span>diffsim (bounded rail)</span></div>`;
      scHtml += `<div class="hud-row"><span class="hud-key">gravity</span><span>${fmt(ec.gravity)}</span></div>`;
      if (cur && cur.pertDeg) {
        scHtml += `<div class="hud-row"><span class="hud-key">start tilt</span><span>${fmt(cur.pertDeg)}°</span></div>`;
      }
      dom._hudScene.innerHTML = scHtml;
    } else {
    let scHtml = `<div class="hud-row"><span class="hud-key">Scene</span><span>${t.setupId}</span></div>`;
    scHtml += `<div class="hud-row"><span class="hud-key">gravity</span><span>${fmt(A('gravity'))}</span></div>`;
    if (isBallish) {
      scHtml += `<div class="hud-row"><span class="hud-key">ball spawn</span><span>(${fmt(A('ballSpawnX'))}, ${fmt(A('ballSpawnY'))})</span></div>`;
    }
    if (isGolfish) {
      const hole = BF.replayMetrics.holeGeometry(app.showState, A('holeCenter'), A('holeWidth'));
      scHtml += `<div class="hud-row"><span class="hud-key">hole · this trial</span><span>w=${fmt(hole.width)} cx=${fmt(hole.center)}</span></div>`;
    }
    dom._hudScene.innerHTML = scHtml;
    }

    // ---- Curriculum: level + advance threshold + applied values
    // Surfaces "are we stuck on the same level forever?" — a visible
    // answer to the user's "why won't curriculum advance?" question.
    // In a diffsim mode the population curriculum's fitness units don't apply
    // (its fitness is meanUp in [0,1]); render the native perturbation
    // curriculum instead, on the right scale.
    // The signing PLANNER and the EPICYCLE borrow this renderer too (despite the
    // diffsim name): like the diffsim/rigid modes they are solved at gen 0, so
    // the population curriculum's fitness units are meaningless for them and
    // they need their own "N/A — solved at gen 0" + honest-pixel readout
    // instead. FORGETTING THIS GATE IS THE BUG: renderDiffsimCurriculumHud can
    // have a perfect branch for a mode and still never run, so the mode ships
    // with an invisible HUD. It happened to signing-planner; do not repeat it.
    if (isDiffsimMode() || isSigningPlannerMode() || isEpicycleAnalyticMode()) {
      renderDiffsimCurriculumHud();
    } else if (p.curriculumEnabled && t.curriculum) {
      const lvl = t.curriculum.level || 0;
      const maxLvl = curriculumEffectiveMax(p);   // phase-aware sum
      const consec = t.curriculum.consecHits || 0;
      const consecReq = p.curriculumConsecRequired || 2;
      // Phase breakdown: which phase is currently advancing, and how
      // far through the phase's own ramp are we? Without this, the
      // HUD said "level 4/4" the moment Phase 1 finished, but Phase 2
      // was still ramping its own specs. Now we surface both the
      // global level and the per-phase position, so the user can see
      // exactly which slice of the curriculum is active right now.
      let phaseHtml = '';
      let phaseDoneInfo = null;  // { phaseIdx, phaseSize } for celebration glow
      if (BF.trainer && BF.trainer.computeCurriculumPhases) {
        const defaultSteps = (p.curriculumMaxLevel | 0) || 10;
        const { phases, cumStart, phaseMaxSteps } =
          BF.trainer.computeCurriculumPhases(p.curriculumSpecs || [], defaultSteps);
        if (phases.length > 1) {
          let activeIdx = -1;
          for (let i = 0; i < phaseMaxSteps.length; i++) {
            const phStart = cumStart[i];
            const phEnd   = phStart + phaseMaxSteps[i];
            if (lvl < phEnd && lvl >= phStart) { activeIdx = i; break; }
            if (lvl < phStart) { activeIdx = i - 1; break; }
            activeIdx = i;
          }
          const phNum = (activeIdx < 0) ? 0 : activeIdx;
          const phStart = cumStart[phNum] || 0;
          const phSize  = phaseMaxSteps[phNum] || 0;
          const phPos   = Math.max(0, Math.min(phSize, lvl - phStart));
          const allDone = activeIdx === phaseMaxSteps.length - 1 && phPos >= phSize;
          const phaseCls = allDone ? 'hud-good hud-glow' : 'hud-good';
          phaseHtml = `<div class="hud-row"><span class="hud-key">phase</span>` +
            `<span class="${phaseCls}"><b>${phNum + 1}/${phases.length}</b> ` +
            `(${phPos}/${phSize})</span></div>`;
          if (allDone) phaseDoneInfo = { phaseIdx: phNum, phaseSize: phSize };
        }
      }
      const obj = BF.objectives.getObjective(p.objectiveId);
      let ceiling;
      // params is the second argument — see the note at the trainer's gate:
      // terrain_progress's ceiling comes from the COURSE, not the clock, so
      // omitting it showed 'crucible' (266.5) against 'hard''s 100.5.
      if (obj && typeof obj.expectedMaxFor === 'function') ceiling = obj.expectedMaxFor(p.evalSeconds, p);
      else if (obj && obj.expectedMax != null) ceiling = obj.expectedMax;
      else if (obj && obj.maxPerSec != null) ceiling = obj.maxPerSec * p.evalSeconds;
      else                                    ceiling = 1.5 * p.evalSeconds;
      // Per-objective thresholdFrac override (matches trainer's gate
      // logic) so the displayed threshold = the actual gate.
      const thresholdFrac = (obj && obj.thresholdFrac != null) ? obj.thresholdFrac
                          : (p.curriculumThresholdFrac != null ? p.curriculumThresholdFrac : 0.70);
      const threshold = ceiling * thresholdFrac;
      const bestEver = isFinite(t.bestEverFitness) ? t.bestEverFitness : 0;
      const phaseBest = (t.curriculum && isFinite(t.curriculum.phaseBestFitness))
        ? t.curriculum.phaseBestFitness : null;
      const phaseBestForGate = phaseBest != null ? phaseBest : 0;
      const phaseBestGen = t.curriculum ? t.curriculum.phaseBestGen : null;
      const progressCls = phaseBestForGate >= threshold ? 'hud-good' : 'hud-warn';
      const ceilingFrac = bestEver / Math.max(1, ceiling);
      // Glow the level row when the curriculum just finished (all
      // phases done) -- this is the celebratory "you completed the
      // whole ramp" signal. Pre-glow phaseHtml already handles the
      // phase-row-specific glow when the last phase wraps.
      const allRampsDone = (lvl >= maxLvl);
      const levelCls = allRampsDone ? 'hud-good hud-glow' : '';
      let curHtml = `<div class="hud-row"><span class="hud-key">Curriculum</span>` +
        `<span class="${levelCls}">level <b>${lvl}/${maxLvl}</b></span></div>`;
      // Phase row (only renders when >1 phase defined).
      curHtml += phaseHtml;
      // Theoretical ceiling row — answers "how good IS the current
      // best, in absolute terms?". Distinct from the threshold (which
      // is just the level-up gate, typically 40-70% of ceiling). Glow
      // the "global X" badge for ~6 gens after bestEver improves so
      // the user can spot improvement moments at a glance.
      const gensSinceImproveCu = (app._hudLastBestImproveGen != null)
        ? (t.generation - app._hudLastBestImproveGen) : 999;
      const globalCls = gensSinceImproveCu < 6 ? 'hud-good hud-glow' : '';
      curHtml += `<div class="hud-row"><span class="hud-key">max ≈</span>` +
        `<span>${ceiling.toFixed(1)} (<span class="${globalCls}">global ${bestEver.toFixed(1)}</span>, ${(ceilingFrac*100).toFixed(0)}%)</span></div>`;
      if (phaseBest != null) {
        const phasePct = phaseBest / Math.max(1, ceiling);
        const phaseGen = phaseBestGen != null ? ` · gen ${phaseBestGen}` : '';
        curHtml += `<div class="hud-row"><span class="hud-key">phase best</span><span>${phaseBest.toFixed(1)} (${(phasePct*100).toFixed(0)}%)${phaseGen}</span></div>`;
      } else {
        curHtml += `<div class="hud-row"><span class="hud-key">phase best</span><span class="hud-off">awaiting eval</span></div>`;
      }
      if (lvl < maxLvl) {
        // Ready-to-advance: phase best already cleared the threshold,
        // we're just waiting for consec hits to confirm. Glow so the
        // user knows "next gen we level up" without having to read
        // the percentage every time.
        const readyCls = phaseBestForGate >= threshold ? `${progressCls} hud-glow` : progressCls;
        curHtml += `<div class="hud-row"><span class="hud-key">to advance</span>` +
          `<span class="${readyCls}">${threshold.toFixed(1)} ` +
          `(${(phaseBestForGate/Math.max(1,threshold)*100).toFixed(0)}%)</span></div>`;
        // One-step-away: consec only needs one more hit. Glow makes
        // the "about to level up" moment visible.
        const consecCls = (consec >= consecReq - 1 && consecReq > 1) ? 'hud-good hud-glow' : '';
        curHtml += `<div class="hud-row"><span class="hud-key">consec</span>` +
          `<span class="${consecCls}">${consec}/${consecReq}</span></div>`;
        // Stuck-advance transparency. The level ALSO force-advances after
        // curriculumStuckMaxGens gens even BELOW threshold (unless disabled) --
        // this is why a level can proceed at, say, 60% of the "to advance" mark.
        // Surface the countdown so "to advance" isn't read as the only path.
        const stuckMaxG = (p.curriculumStuckMaxGens != null ? p.curriculumStuckMaxGens : 200);
        const noForceAdv = p.curriculumNoForceAdvance === true;
        const gensAtLvl = (t.curriculum.lastLevelChangeGen != null)
          ? (t.generation - t.curriculum.lastLevelChangeGen) : 0;
        if (noForceAdv) {
          curHtml += `<div class="hud-row"><span class="hud-key">force-adv</span>` +
            `<span class="hud-off">off — threshold only</span></div>`;
        } else if (stuckMaxG > 0 && phaseBestForGate < threshold) {
          const remain = Math.max(0, stuckMaxG - gensAtLvl);
          curHtml += `<div class="hud-row"><span class="hud-key">or force-adv</span>` +
            `<span class="hud-warn">in ${remain}g if stuck (below threshold)</span></div>`;
        }
      } else {
        curHtml += `<div class="hud-row"><span class="hud-key">status</span><span class="hud-good hud-glow">at max level</span></div>`;
      }
      // Show the dom node if it doesn't exist yet — added inline.
      if (!dom._hudCur) {
        dom._hudCur = document.createElement('div');
        dom._hudCur.className = 'hud-section';
        dom.hudEscape.parentNode.insertBefore(dom._hudCur, dom.hudEscape);
      }
      dom._hudCur.innerHTML = curHtml;
    } else if (dom._hudCur) {
      dom._hudCur.innerHTML = '';
    }

    // ---- Live preview fitness — what is the on-screen rollout actually
    // scoring right now? Closes the loop between "I see GOAL!" and
    // "best fitness is 14.6". When the displayed rollout's running
    // total matches the trainer's bestEver, the math is consistent.
    // When it diverges (e.g. preview=45 because ball sunk, bestEver=14
    // because the trainer's random angles never landed near this
    // configuration), the divergence itself is the diagnostic.
    //
    // The "agent peak" row resets when currentBest changes — it's THIS
    // agent's best preview rollout, not a session-wide max. So if peak
    // says 64 but bestEver says 12, the same genome IS earning 64 in
    // preview at certain angles but training never tested it there.
    // The fix is to bump rolloutsPerAgent so each agent gets evaluated
    // at multiple angles per generation.
    if (app.showState && app.showState.liveFitness != null) {
      const liveFit = app.showState.liveFitness;
      const hasPeak = (app.peakLivePreviewFitness != null);
      const peakFit = hasPeak ? app.peakLivePreviewFitness : 0;
      const peakAng = app.peakLivePreviewAngle != null ? app.peakLivePreviewAngle : 0;
      const peakSunk = !!app.peakLivePreviewSunk;
      const angle = app.showState.startAngle || 0;
      const ballSunk = !!(app.showState.ball && app.showState.ball.sunk);
      const rollouts = Math.max(1, p.rolloutsPerAgent | 0);
      // Highlight the rollouts row in red when set to 1 on a sparse-reward
      // (golf-ish) objective — that's the "single-rollout-per-gen with
      // random angles" pitfall: fitness is dominated by angle luck and
      // the GA can't differentiate skilled-but-unlucky from lucky-but-
      // brittle agents. Color-code so the user notices.
      const lpObj = BF.objectives.getObjective(p.objectiveId);
      const isSparse = !!(lpObj && lpObj.thresholdFrac != null && lpObj.thresholdFrac < 0.6);
      const rollCls = (rollouts === 1 && isSparse) ? 'hud-warn' : '';
      // SUNK / GOAL! is the most exciting per-rollout event -- glow
      // it so the user notices even when looking at the canvas. The
      // text-shadow pulse doesn't move the layout so the row beside
      // it stays put.
      const sunkBadge = ballSunk ? ' <b class="hud-good hud-glow">SUNK</b>' : '';
      let lpHtml = `<div class="hud-row"><span class="hud-key">Live preview</span><span>${liveFit.toFixed(2)}${sunkBadge}</span></div>`;
      lpHtml += `<div class="hud-row"><span class="hud-key">angle</span><span>${(angle * 180 / Math.PI).toFixed(1)}°</span></div>`;
      if (hasPeak) {
        // Glow the peak when the current rollout has already matched
        // it -- the user is watching "this agent's best run live".
        const matchedPeak = liveFit >= peakFit - 1e-6 && liveFit > 0;
        const peakCls = matchedPeak ? 'hud-good hud-glow' : '';
        lpHtml += `<div class="hud-row"><span class="hud-key">agent peak</span>` +
          `<span class="${peakCls}">${peakFit.toFixed(2)}${peakSunk ? ' <span class="hud-good">(sunk)</span>' : ''} @ ${(peakAng * 180 / Math.PI).toFixed(1)}°</span></div>`;
      }
      lpHtml += `<div class="hud-row"><span class="hud-key">rollouts/gen</span><span class="${rollCls}">${rollouts}${rollCls ? ' (sparse — try 3+)' : ''}</span></div>`;
      if (!dom._hudLive) {
        dom._hudLive = document.createElement('div');
        dom._hudLive.className = 'hud-section';
        // Insert just before stuck-escape so it sits below curriculum.
        dom.hudEscape.parentNode.insertBefore(dom._hudLive, dom.hudEscape);
      }
      dom._hudLive.innerHTML = lpHtml;
    } else if (dom._hudLive) {
      dom._hudLive.innerHTML = '';
    }

    // ---- Stuck-escape (mutation reheat + diversity inject)
    // Showcase what mode the GA thinks it's in, the live mutation
    // multiplier, and how close we are to the next escalation tier.
    // This is the panel-level answer to "are we stuck?".
    if (dom.hudEscape) {
      let esHtml = '';
      if (p.annealMutationOn) {
        esHtml = '<div class="hud-row"><span class="hud-key">Stuck-escape</span><span class="hud-off">off (anneal on)</span></div>';
      } else if (p.stuckEscapeOn === false) {
        esHtml = '<div class="hud-row"><span class="hud-key">Stuck-escape</span><span class="hud-off">off</span></div>';
      } else {
        const stale = t.gensSinceImprovement || 0;
        const after = Math.max(2, p.stuckEscapeAfterGens | 0 || 25);
        const mode = t._mutMode || 'normal';
        const scale = t._mutScale != null ? t._mutScale : 1.0;
        const inj = t.lastInjectCount || 0;
        const popN = (t.population && t.population.length) || (p.populationSize | 0) || 0;
        // Status line: color-coded by escape tier. The high tier also
        // gets a pulsing glow because by then the GA has been
        // unproductively churning for long enough that the user
        // probably wants to intervene (different objective, restart,
        // etc.) rather than burn more compute.
        let statusCls, statusTxt;
        if (mode === 'escape-high')      { statusCls = 'hud-fire hud-glow-fire'; statusTxt = 'ESCAPE-HIGH'; }
        else if (mode === 'escape-mid')  { statusCls = 'hud-warn'; statusTxt = 'escape-mid'; }
        else if (mode === 'escape-low')  { statusCls = 'hud-warn'; statusTxt = 'escape-low'; }
        else                             { statusCls = 'hud-good'; statusTxt = 'standby'; }
        esHtml += `<div class="hud-row"><span class="hud-key">Stuck-escape</span><span class="${statusCls}">${statusTxt}</span></div>`;
        // Mutation scale (×N).
        const scaleCls = scale > 1 ? 'hud-warn' : '';
        esHtml += `<div class="hud-row"><span class="hud-key">mut ×</span><span class="${scaleCls}">${scale.toFixed(1)}×</span></div>`;
        // Stale counter, plus tier thresholds. Show the next tier so the
        // user can see "in N more gens this gets worse".
        const tier1 = after, tier2 = after * 2, tier4 = after * 4;
        const tier8 = after * 8, tier16 = after * 16;
        let nextTier = null;
        if (stale < tier1)       nextTier = `low @ ${tier1}`;
        else if (stale < tier2)  nextTier = `mid @ ${tier2}`;
        else if (stale < tier4)  nextTier = `high @ ${tier4}`;
        else if (stale < tier8)  nextTier = `inject 45% @ ${tier8}`;
        else if (stale < tier16) nextTier = `inject 60% @ ${tier16}`;
        else                     nextTier = '(max tier)';
        const staleCls = stale >= tier4 ? 'hud-fire' : (stale >= tier1 ? 'hud-warn' : '');
        esHtml += `<div class="hud-row"><span class="hud-key">stale</span><span class="${staleCls}">${stale} gens</span></div>`;
        esHtml += `<div class="hud-row"><span class="hud-key">next</span><span class="hud-key">${nextTier}</span></div>`;
        // Diversity inject breakdown from last gen — clones (heavy-
        // perturbed copies of bestEver) vs pure random. Clones
        // preserve learned structure; random explores entirely new
        // strategy directions.
        if (inj > 0) {
          const clonesN = t.lastInjectCloneCount || 0;
          const randN   = t.lastInjectRandomCount || 0;
          const breakdown = (clonesN > 0 || randN > 0)
            ? ` (${clonesN} clone, ${randN} rand)`
            : '';
          esHtml += `<div class="hud-row"><span class="hud-key">last inject</span><span class="hud-fire">${inj}/${popN}${breakdown}</span></div>`;
        }
      }
      dom.hudEscape.innerHTML = esHtml;
    }

    // ---- Hall of Fame
    const hofSize = Math.max(1, p.hallOfFameSize | 0);
    const hofLen = (t.hallOfFame || []).length;
    let hofHtml = `<div class="hud-row"><span class="hud-key">HoF</span><span>${hofLen}/${hofSize}</span></div>`;
    if (hofLen > 0) {
      const top = t.hallOfFame[0];
      const bestLast = top.lastFitness != null ? top.lastFitness : top.fitness;
      // Glow "best last" for ~6 gens after bestEver jumps so the user
      // can spot the moment of improvement without watching every
      // number on the screen.
      const gensSinceImprove = (app._hudLastBestImproveGen != null)
        ? (t.generation - app._hudLastBestImproveGen) : 999;
      const bestCls = gensSinceImprove < 6 ? 'hud-good hud-glow' : '';
      hofHtml += `<div class="hud-row"><span class="hud-key">best last</span>` +
        `<span class="${bestCls}">${formatFitness(bestLast, 2)}</span></div>`;
      let oldestGen = Infinity;
      for (const e of t.hallOfFame) if (e.gen != null && e.gen < oldestGen) oldestGen = e.gen;
      if (isFinite(oldestGen)) {
        const age = t.generation - oldestGen;
        // Warn-glow when the HoF's oldest entry hasn't been
        // displaced in a long time -- that's "stuck-at-this-best for
        // hundreds of gens", the user-actionable diagnostic.
        const ageCls = age >= 200 ? 'hud-fire hud-glow-fire'
                     : age >= 80  ? 'hud-warn' : '';
        hofHtml += `<div class="hud-row"><span class="hud-key">oldest</span>` +
          `<span>gen ${oldestGen} <span class="${ageCls || 'hud-key'}">(${age} ago)</span></span></div>`;
      }
    }
    dom.hudHallOfFame.innerHTML = hofHtml;

    // ---- Auto-rollback
    let rbHtml = '';
    if (!p.autoRollbackOn) {
      rbHtml = '<div class="hud-row"><span class="hud-key">Auto-rollback</span><span class="hud-off">off</span></div>';
    } else if (!t.autoCheckpoint) {
      rbHtml = '<div class="hud-row"><span class="hud-key">Auto-rollback</span><span class="hud-warn">awaiting first improvement</span></div>';
    } else {
      const requiredGens = Math.max(2, p.autoRollbackGens | 0 || 15);
      const threshold = p.autoRollbackThreshold || 0.5;
      const runLen = t.regressionRunLen || 0;
      const remaining = Math.max(0, requiredGens - runLen);
      const ratio = (t.lastStats && t.bestEverFitness > 0)
        ? (t.lastStats.best / t.bestEverFitness) : null;
      rbHtml = `<div class="hud-row"><span class="hud-key">Auto-rollback</span><span class="hud-good">on</span></div>`;
      if (ratio != null) {
        const ratioCls = ratio < threshold ? 'hud-warn' : 'hud-good';
        rbHtml += `<div class="hud-row"><span class="hud-key">ratio</span><span class="${ratioCls}">${ratio.toFixed(2)} / ${threshold.toFixed(2)}</span></div>`;
      }
      // Imminent (≤ 2 gens left) -> glow so the user sees "the
      // rollback is about to fire" before it happens. They might want
      // to stop training and inspect, or let it ride.
      const countdownCls = remaining <= 2 ? 'hud-fire hud-glow-fire'
                         : runLen > 0     ? 'hud-warn' : '';
      rbHtml += `<div class="hud-row"><span class="hud-key">to rollback</span><span class="${countdownCls}">${remaining}/${requiredGens} gens</span></div>`;
      const lastFire = (t.eventLog || []).slice().reverse().find(e => e.kind === 'auto-rollback');
      if (lastFire) {
        // Glow for ~10 gens after a rollback fires.
        const fireAge = t.generation - lastFire.gen;
        const fireCls = fireAge < 10 ? 'hud-fire hud-glow-fire' : 'hud-fire';
        rbHtml += `<div class="hud-row"><span class="hud-key">last fire</span>` +
          `<span class="${fireCls}">gen ${lastFire.gen}</span></div>`;
      }
      rbHtml += `<div class="hud-row"><span class="hud-key">ckpt at</span><span>gen ${t.autoCheckpoint.generation}</span></div>`;
    }
    dom.hudRollback.innerHTML = rbHtml;

    // ---- Anneal mutation
    let anHtml = '';
    if (!p.annealMutationOn) {
      anHtml = '<div class="hud-row"><span class="hud-key">Anneal</span><span class="hud-off">off</span></div>';
    } else {
      const after = p.annealAfterGens || 30;
      const stale = t.gensSinceImprovement || 0;
      const factor = p.annealFactor || 0.5;
      const active = stale >= after;
      if (active) {
        // Anneal ACTIVE = mutation rates are being pulled down to
        // exploit the local basin. Glow so the user notices the
        // regime change.
        anHtml = `<div class="hud-row"><span class="hud-key">Anneal</span><span class="hud-warn hud-glow">ACTIVE</span></div>`;
        anHtml += `<div class="hud-row"><span class="hud-key">factor</span><span>${factor.toFixed(2)}×</span></div>`;
        anHtml += `<div class="hud-row"><span class="hud-key">stale</span><span>${stale}/${after} gens</span></div>`;
      } else {
        anHtml = `<div class="hud-row"><span class="hud-key">Anneal</span><span class="hud-good">standby</span></div>`;
        anHtml += `<div class="hud-row"><span class="hud-key">stale</span><span>${stale}/${after} gens</span></div>`;
        anHtml += `<div class="hud-row"><span class="hud-key">in</span><span>${after - stale} gens</span></div>`;
      }
    }
    dom.hudAnneal.innerHTML = anHtml;
  }

  function updateBadges() {
    if (!app.trainer) return;
    const stats = app.trainer.lastStats;
    dom.genBadge.textContent = String(app.trainer.generation);
    if (app.testing && app.loadedPolicyGenome === app.trainer.bestEver && Number.isInteger(app.loadedPolicyGeneration)) {
      dom.genBadge.textContent = String(app.loadedPolicyGeneration);
    }
    if (stats) {
      dom.bestBadge.textContent = formatFitness(stats.best, 3);
      dom.avgBadge.textContent = formatFitness(stats.avg, 3);
      dom.speciesBadge.textContent = String(stats.species);
    } else {
      // A saved champion can have a known score without a population eval.
      // Missing fitness stays unknown; do not retain the previous run's badges.
      dom.bestBadge.textContent = formatFitness(app.trainer.bestEverFitness, 3);
      dom.avgBadge.textContent = '—';
      dom.speciesBadge.textContent = '—';
    }
    // Compare-mode badge: shows trainer B's current gen + best fitness.
    // Hidden when compare is off. Tooltip mirrors the chart legend
    // (dashed = B) so the user can correlate badge + curve.
    if (dom.compareBadge && dom.compareBadgeText) {
      if (app.trainerB) {
        const sB = app.trainerB.lastStats;
        const bestB = (sB && isFinite(sB.best)) ? fmt(sB.best, 3) : '—';
        dom.compareBadge.classList.remove('hidden');
        dom.compareBadgeText.textContent = `g${app.trainerB.generation} ${bestB}`;
      } else {
        dom.compareBadge.classList.add('hidden');
      }
    }
    // In test mode, show stats for the best-ever genome.
    const shownGenome = (app.testing && app.trainer.bestEver)
      ? app.trainer.bestEver
      : app.trainer.currentBest;
    const gridMeta=app.trainer.params.policyType==='cnn-grid'&&app.trainer.cnnGridConfig;
    const nodeKey=document.getElementById('nodesBadgeKey'),connKey=document.getElementById('connsBadgeKey');
    if(nodeKey && nodeKey.textContent!==(gridMeta?'params':'nodes'))nodeKey.textContent=gridMeta?'params':'nodes';
    if(connKey && connKey.textContent!==(gridMeta?'filters':'conns'))connKey.textContent=gridMeta?'filters':'conns';
    if(gridMeta){
      dom.nodesBadge.textContent=String(BF.cnnGrid.paramCount(gridMeta));
      dom.connsBadge.textContent=String(gridMeta.numFilters);
    } else if (shownGenome) {
      const s = N.stats(shownGenome);
      dom.nodesBadge.textContent = String(s.nodes);
      dom.connsBadge.textContent = `${s.enabledConns}/${s.conns}`;
    }
    if (isSingleSwingupMode()) {
      dom.genBadge.textContent='—';dom.nodesBadge.textContent='—';dom.connsBadge.textContent='—';
      dom.bestBadge.textContent='—';dom.avgBadge.textContent='—';dom.speciesBadge.textContent='—';
    }
    if (isDodgeScorerMode()) {
      const h=app.dodgeScorerRecord.config.hidden;
      dom.genBadge.textContent=String(app.dodgeScorerRecord.generation);
      dom.nodesBadge.textContent=String(8+h+1);
      dom.connsBadge.textContent=String(h ? 9*h : 8);
      dom.bestBadge.textContent='—';dom.avgBadge.textContent='—';dom.speciesBadge.textContent='—';
    }
    // Test badge.
    if (app.testing) {
      dom.testBadge.classList.remove('hidden');
      const t = app.testStats;
      const rate = t.trials > 0 ? Math.round(100 * t.successes / t.trials) : 0;
      dom.testBadgeText.textContent = BF.replayMetrics.summary(t, app.showState, app.trainer.params);
      if (isDiffsimMode()) {
        const live = app.diffsimRun?.liveReference;
        dom.testBadgeText.textContent = live
          ? `${live.aboveSeconds.toFixed(1)}s above horizon · ${live.nudgeCount} pushes`
          : 'trajectory replay';
      }
    } else {
      dom.testBadge.classList.add('hidden');
    }
    // Ball badge — only meaningful in ball-single setup. Shows the live
    // displayed ball's |vx| / hits while the ball's in scene, the escape
    // velocity once it's left, and "pending" before spawn (for timed mode).
    const ballLive = app.showState && app.showState.ball;
    if (ballLive) {
      dom.ballBadge.classList.remove('hidden');
      if (ballLive.escaped) {
        const sign = ballLive.escapeVx >= 0 ? '→' : '←';
        dom.ballBadgeText.textContent = `exit ${sign} ${Math.abs(ballLive.escapeVx).toFixed(0)} · peak ${ballLive.maxAbsVx.toFixed(0)}`;
      } else if (ballLive.spawned && app.showState.world && ballLive.idx != null) {
        const node = app.showState.world.nodes[ballLive.idx];
        if (node) {
          dom.ballBadgeText.textContent = `vx ${node.vx.toFixed(0)} · hits ${ballLive.hits} · peak ${ballLive.maxAbsVx.toFixed(0)}`;
        } else {
          dom.ballBadgeText.textContent = '—';
        }
      } else {
        dom.ballBadgeText.textContent = 'pending';
      }
    } else {
      dom.ballBadge.classList.add('hidden');
    }
    const courseBadge=document.getElementById('courseRuleBadge');
    if(courseBadge){
      courseBadge.hidden=dom.setupSelect.value!=='golf-challenge';
      const contacts=app.showState?.courseCeilingContacts || 0;
      const caption=contacts ? 'Beam touched · rebound allowed' : 'Beam rebounds allowed';
      if(courseBadge.textContent!==caption)courseBadge.textContent=caption;
    }
    // Dodge safety gauge — "performance gauge" badge that's only useful
    // when the active setup is dodge. Shows the 1.5 s EMA of distance-
    // to-nearest-bullet (normalized to safeDistPx, 1 = clear) plus the
    // rollout-mean in parentheses for a per-rollout summary view. Color
    // shifts as the value drops so the user can spot at a glance whether
    // the displayed policy is dodging or getting cornered, instead of
    // having to wait for the cumulative-reward / curriculum gate to
    // resolve. We read straight off app.showState.dodge (populated by
    // the setup's kinematics builder).
    // Retro badge — shows the most recent retro-eval probe alongside
    // the current-level best so the user can see at a glance whether
    // elites are still robust on prior levels or have specialized into
    // narrow forgetfulness. Hidden until retro-eval has fired at least
    // once this run; once visible, color shifts to red ("lvl-low") when
    // retro falls more than 30% below current best.
    if (dom.retroBadge && dom.retroBadgeText) {
      const lastRetroStat = (function () {
        const h = app.trainer && app.trainer.history;
        if (!h || h.length === 0) return null;
        for (let i = h.length - 1; i >= 0; i--) {
          if (h[i].retroBest != null) return h[i];
        }
        return null;
      })();
      if (lastRetroStat) {
        dom.retroBadge.classList.remove('hidden');
        const curBest = app.trainer.lastStats ? app.trainer.lastStats.best : null;
        const rb = lastRetroStat.retroBest;
        const rl = lastRetroStat.retroLevel;
        const ratio = (curBest && curBest > 0) ? (rb / curBest) : 1;
        dom.retroBadge.classList.toggle('lvl-low', ratio < 0.7);
        dom.retroBadgeText.textContent = `${rb.toFixed(2)}@L${rl}`;
      } else {
        dom.retroBadge.classList.add('hidden');
        dom.retroBadge.classList.remove('lvl-low');
      }
    }
    // Pareto-HoF badge -- visible only when the feature's enabled AND
    // the HoF has at least one entry. Shows "N/cap" so the user can see
    // both the live size and the configured ceiling at a glance.
    if (dom.paretoHoFBadge && dom.paretoHoFBadgeText) {
      const phof = app.trainer && app.trainer.paretoHoF;
      const phofOn = !!(app.trainer && app.trainer.params
        && app.trainer.params.paretoSelectionEnabled
        && app.trainer.params.paretoHoFEnabled);
      if (phofOn && phof && phof.length > 0) {
        const cap = (app.trainer.params.paretoHoFSize | 0) || 8;
        dom.paretoHoFBadge.classList.remove('hidden');
        dom.paretoHoFBadgeText.textContent = `${phof.length}/${cap}`;
      } else {
        dom.paretoHoFBadge.classList.add('hidden');
      }
    }
    const dodgeLive = app.showState && app.showState.dodge;
    if (dom.safetyBadge) {
      if (dodgeLive) {
        const ema = (dodgeLive.recentSafety != null) ? dodgeLive.recentSafety : 1;
        const mean = (dodgeLive.rolloutMeanSafety != null) ? dodgeLive.rolloutMeanSafety : 1;
        dom.safetyBadge.classList.remove('hidden');
        dom.safetyBadgeText.textContent =
          `${ema.toFixed(2)} (μ ${mean.toFixed(2)})`;
        // Three-tier color: ≥0.6 safe (default), ≥0.3 mid (warn), <0.3 low.
        // Thresholds picked so a corner-camping policy with a single
        // bullet drifting in still reads as "safe", whereas a policy
        // about to die reads as "low" before the death event fires.
        dom.safetyBadge.classList.toggle('lvl-mid', ema < 0.6 && ema >= 0.3);
        dom.safetyBadge.classList.toggle('lvl-low', ema < 0.3);
      } else {
        dom.safetyBadge.classList.add('hidden');
        dom.safetyBadge.classList.remove('lvl-mid', 'lvl-low');
      }
    }
    // Dodge survival stats: the displayed policy's current survival time, the
    // best (longest) survival seen since this run started, and hits taken. The
    // best-tracker is keyed to the trainer instance so it resets on new run /
    // setup change / preset load (each rebuilds app.trainer) without having to
    // hook every reset site.
    if (dom.dodgeStatsBadge) {
      if (dodgeLive) {
        if (app._dodgeBestTrainerRef !== app.trainer) {
          app._dodgeBestTrainerRef = app.trainer;
          app._dodgeBestSurvival = 0;
        }
        const alive = dodgeLive.aliveTime || 0;
        if (alive > (app._dodgeBestSurvival || 0)) app._dodgeBestSurvival = alive;
        const hits = dodgeLive.hitsTaken || 0;
        dom.dodgeStatsBadge.classList.remove('hidden');
        dom.dodgeStatsBadgeText.textContent =
          alive.toFixed(1) + 's elapsed · streak ' + (dodgeLive.safeStreakTime || 0).toFixed(1) +
          's · best ' + (dodgeLive.longestSafeStreak || 0).toFixed(1) + 's' +
          (hits > 0 ? ' · ' + hits + (hits === 1 ? ' hit' : ' hits') : '');
      } else {
        dom.dodgeStatsBadge.classList.add('hidden');
      }
    }
    // Curriculum badge — only when curriculum is on. Shows the *current*
    // (gradually-ramped) gravity/damping the trainer is working with.
    //
    // The legacy "auto-controlled" decoration on the gravity/damping
    // sliders (cyan striped track + "X → Y" value text) has been
    // retired — the per-slider curriculum overlay (band + dots + now
    // orb + value-column mirror in refreshOneSliderOverlay) now
    // visualizes ramping for ALL curriculum-able params uniformly. The
    // legacy decoration would otherwise double-paint over (or fight
    // with) the new overlay on the gravity/damping sliders specifically.
    const curriculumLive = app.trainer && app.trainer.params.curriculumEnabled && app.trainer.curriculum;
    if (curriculumLive) {
      dom.currBadge.classList.remove('hidden');
      const g = Math.round(app.trainer.curriculum.currentGravity);
      const d = app.trainer.curriculum.currentDamping;
      dom.currBadgeText.textContent = `g=${g} d=${d.toFixed(3)}`;
    } else {
      dom.currBadge.classList.add('hidden');
    }
    // Always strip the legacy auto-controlled class — the new overlay
    // is the single source of visual truth for curriculum ramping.
    dom.gravity.classList.remove('auto-controlled');
    dom.damping.classList.remove('auto-controlled');
    // Convergence badge — adaptive. Reads from trainer.lastConvergence which
    // tracks both "stable" (low variance over recent gens) and "good enough"
    // (best ≥ X% of theoretical max). Shows how many gens both conditions
    // have held simultaneously, so the user can see auto-stop approaching.
    const conv = app.trainer ? app.trainer.lastConvergence : null;
    const autoStopOn = dom.autoStopOn && dom.autoStopOn.checked;
    const limit = autoStopOn ? parseInt(dom.autoStopGens.value, 10) || 20 : 0;
    if (app.trainer && conv && (conv.gensConverged > 0 || autoStopOn)) {
      dom.staleBadge.classList.remove('hidden');
      const gc = conv.gensConverged || 0;
      const labelKey = (conv.stable && conv.goodEnough) ? 'converging' : 'unstable';
      dom.staleBadge.querySelector('.badge-key').textContent = labelKey;
      if (autoStopOn) {
        dom.staleBadgeText.textContent = `${gc}/${limit}`;
        dom.staleBadge.classList.toggle('warn', gc / Math.max(1, limit) > 0.7);
      } else {
        dom.staleBadgeText.textContent = String(gc);
        dom.staleBadge.classList.remove('warn');
      }
    } else {
      dom.staleBadge.classList.add('hidden');
    }
    // Stuck-escape badge — visible only when the GA's auto-reheat is
    // active (mutScale > 1). Tells the user "the GA is exploring
    // harder because nothing's been improving" + an at-a-glance level
    // (low/mid/high). Hidden in normal mode AND when annealing
    // (mut-scaling-down) is in effect, since those are mutually
    // exclusive paths in the trainer.
    if (dom.escapeBadge) {
      const mutScale = app.trainer && app.trainer._mutScale != null ? app.trainer._mutScale : 1.0;
      const mutMode  = app.trainer && app.trainer._mutMode || 'normal';
      const inj      = app.trainer && app.trainer.lastInjectCount || 0;
      const escaping = mutMode && mutMode.indexOf('escape-') === 0;
      if (escaping) {
        dom.escapeBadge.classList.remove('hidden');
        // Tier classes for visual escalation.
        dom.escapeBadge.classList.toggle('lvl-low',  mutMode === 'escape-low');
        dom.escapeBadge.classList.toggle('lvl-mid',  mutMode === 'escape-mid');
        dom.escapeBadge.classList.toggle('lvl-high', mutMode === 'escape-high');
        const injStr = inj > 0 ? ` +${inj}` : '';
        // Append "+QD" when the quality-diversity escape boost is also
        // firing, so the user can see at-a-glance that archive draws are
        // being mixed in. Only meaningful while escape-* is active --
        // boost has no effect outside escape mode.
        const qdActive = !!(app.trainer
          && app.trainer.params
          && app.trainer.params.qdEscapeBoostEnabled);
        const qdStr = qdActive ? ' +QD' : '';
        const escapeText = document.getElementById('escapeBadgeText');
        if (escapeText) escapeText.textContent = `×${mutScale.toFixed(1)}${injStr}${qdStr}`;
      } else {
        dom.escapeBadge.classList.add('hidden');
        dom.escapeBadge.classList.remove('lvl-low', 'lvl-mid', 'lvl-high');
      }
    }
    // Annealing temperature badge — shows current T and last-gen acceptance.
    if (app.trainer && app.trainer.annealing && app.trainer.params.mode === 'annealing') {
      dom.annealBadge.classList.remove('hidden');
      const T = app.trainer.annealing.currentT;
      const acc = app.trainer.annealing.acceptCounts;
      const accStr = acc ? `${acc.acceptedThisGen}/${acc.total}` : '—/—';
      dom.annealBadgeText.textContent = `${T.toFixed(3)} · ${accStr} acc`;
    } else {
      dom.annealBadge.classList.add('hidden');
    }
    // Sim panel title reflects mode.
    if (app.diffsimRun?.liveReference && isDiffsimMode()) {
      dom.simTitle.textContent = app.diffsimRun.liveReference.isReference
        ? app.diffsimRun.liveReference.referenceMode==='hold' ? 'Hold + nudges · live reference' : 'Swing-up → hold · live reference'
        : 'Live LQR feedback';
    } else if (isSingleSwingupMode()) {
      dom.simTitle.textContent = 'Classical swing-up — live feedback';
    } else if (!BF.presetNavigation.approach({mode:dom.modeSelect.value}).learns) {
      dom.simTitle.textContent = 'Reference controller';
    } else if (app.testing) {
      dom.simTitle.textContent = isDodgeScorerMode() ? 'Learned scoring · physical lookahead · frozen replay' : 'Test mode — frozen learned controller';
    } else {
      dom.simTitle.textContent = 'Live simulation — best agent';
    }
  }

  // Last rendered event log signature, used to skip DOM rewrites when nothing
  // changed (the status updater fires every frame).
  let _lastEventLogSig = null;
  function renderEventLog() {
    if (!dom.eventLog) return;
    if (!app.trainer || !app.trainer.eventLog || app.trainer.eventLog.length === 0) {
      if (_lastEventLogSig !== '') {
        dom.eventLog.innerHTML = '';
        _lastEventLogSig = '';
      }
      return;
    }
    const log = app.trainer.eventLog;
    const last = log[log.length - 1];
    const sig = log.length + ':' + last.gen + ':' + last.text;
    if (sig === _lastEventLogSig) return;
    _lastEventLogSig = sig;
    // Newest first, render up to ~30 entries — log itself is capped at 60.
    const html = [];
    for (let i = log.length - 1; i >= Math.max(0, log.length - 30); i--) {
      const e = log[i];
      const cls = 'ev-' + (e.kind || 'other');
      html.push(
        `<div class="event-row ${cls}">`,
          `<span class="ev-gen">gen ${e.gen}</span>`,
          `<span class="ev-dot"></span>`,
          `<span class="ev-text">${escapeHtml(e.text)}</span>`,
        `</div>`
      );
    }
    dom.eventLog.innerHTML = html.join('');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function updateStatus() {
    const approach = refreshApproachUI();
    dom.statusText.classList.remove('training', 'paused', 'testing');
    // ---- Big banner ---------------------------------------------------
    // The big TRAINING/TEST text dominates the topbar so the user can see
    // at a glance whether anything is happening, especially during long
    // synchronous operations (CMA-ES Jacobi at high CNN resolution) where
    // the rest of the UI freezes.
    const big = dom.statusBig;
    big.classList.remove('training', 'testing', 'paused', 'stopped');
    let bigLabel = 'IDLE';
    let detail = app.trainer ? '' : 'no run started';
    if (app.training) {
      bigLabel = approach.learns ? 'TRAINING' : approach.kind === 'planner' ? 'PLANNING' : 'RUNNING';
      big.classList.add('training');
      const stage = app.trainer ? app.trainer.currentStage : '';
      const prog = app.trainer && app.trainer.evalProgress > 0
        ? ` · ${Math.round(app.trainer.evalProgress * 100)}%`
        : '';
      // Live gens/sec. Helpful as the only direct signal of training
      // throughput -- the user can flip the WASM toggle and watch this
      // number change to see the speedup (or lack thereof) on the
      // current config. We use trainerStartedAt set on New Run; if a
      // run is fresh and the divisor would be tiny, hide the readout
      // until enough generations have accumulated to give a stable
      // estimate.
      let rate = '';
      if (app.trainer && app.trainer.generation > 0 && app.trainerStartedAt > 0) {
        const elapsedSec = (BF.util.nowMs() - app.trainerStartedAt) / 1000;
        if (elapsedSec > 0.5 && app.trainer.generation >= 2) {
          const gps = app.trainer.generation / elapsedSec;
          rate = ` · ${gps >= 10 ? gps.toFixed(0) : gps.toFixed(1)} gens/sec`;
        }
      }
      detail = `gen ${app.trainer ? app.trainer.generation : 0} · ${stage}${prog}${rate}`;
    } else if (app.testing) {
      bigLabel = 'TEST';
      big.classList.add('testing');
      const t = app.testStats;
      const rate = t.trials > 0 ? Math.round(100 * t.successes / t.trials) : 0;
      // Trial timing: wall-clock seconds in current trial + average per
      // completed trial (so the user can see how long a trial is taking
      // and roughly how long the next one will run).
      const elapsed = t.trialStartedAt > 0 ? (BF.util.nowMs() - t.trialStartedAt) / 1000 : 0;
      const avg = t.trials > 0 ? (t.totalSeconds / t.trials) : 0;
      detail = `${approach.learns ? 'frozen controller replay' : 'controller replay'} · ${BF.replayMetrics.summary(t, app.showState, app.trainer.params)} · ` +
               `${elapsed.toFixed(1)}s in trial · avg ${avg.toFixed(1)}s/trial`;
      if (isDiffsimMode()) detail = app.diffsimRun?.liveReference
        ? (app.diffsimRun.liveReference.isReference&&app.diffsimRun.liveReference.referenceMode!=='hold'?'nonlinear swing-up + feedback':'live LQR feedback')+' · prescribed pivot acceleration'
        : 'replaying the current trajectory · inspect the controller hold/catch metric';
    } else if (app.paused) {
      bigLabel = 'PAUSED';
      big.classList.add('paused');
      detail = 'training halted';
    } else if (app.autoStopReason) {
      bigLabel = 'STOPPED';
      big.classList.add('stopped');
      detail = app.autoStopReason;
    } else if (app.trainer) {
      detail = 'idle — preview only';
    }
    if(app.arcadePreview?.snapshot().active){
      bigLabel='DEMO';
      detail='Auto preview · click, scroll or press a key to take control';
    }
    if (big.textContent !== bigLabel) big.textContent = bigLabel;
    if (dom.statusDetail.textContent !== detail) dom.statusDetail.textContent = detail;

    // ---- Old single-line bottom status (kept for backward continuity) ----
    if (app.training) {
      dom.statusText.textContent = `training — gen ${app.trainer.generation}`;
      dom.statusText.classList.add('training');
    } else if (app.testing) {
      const t = app.testStats;
      const rate = t.trials > 0 ? Math.round(100 * t.successes / t.trials) : 0;
      dom.statusText.textContent = `testing — ${BF.replayMetrics.summary(t, app.showState, app.trainer.params)}`;
      if (isDiffsimMode()) dom.statusText.textContent = app.diffsimRun?.liveReference
        ? 'testing — live classical feedback' : 'testing — full trajectory replay';
      dom.statusText.classList.add('testing');
    } else if (app.paused) {
      dom.statusText.textContent = 'paused';
      dom.statusText.classList.add('paused');
    } else if (app.autoStopReason) {
      dom.statusText.textContent = `auto-stopped — ${app.autoStopReason}`;
      dom.statusText.classList.add('paused');
    } else {
      dom.statusText.textContent = app.trainer ? 'idle — preview only' : 'starting…';
    }
    // ---- Event log -----------------------------------------------------
    renderEventLog();
    if (app.showState) {
      const cart = app.showState.world.nodes[app.showState.cartIdx];
      const tip = app.showState.world.nodes[app.showState.tipIdx];
      dom.cartTel.textContent = `cart x=${fmt(cart.x, 1)} v=${fmt(cart.vx, 1)}`;
      dom.tipTel.textContent = `tip y=${fmt(tip.y, 1)} v=${fmt(Math.hypot(tip.vx, tip.vy), 1)}`;
    }
    dom.evalTel.textContent = `eval ${fmt((app.trainer ? app.trainer.params.evalSeconds : 0), 1)}s`;
    dom.rateTel.textContent = `${Math.round(app.evalsPerSec)} evals/s`;
    if (dom.paceTel) {
      const tp = app.trainer && app.trainer.params;
      const ev = app.evalsPerSec || 0;
      if (!tp || ev <= 0) {
        dom.paceTel.textContent = '- gens/min';
      } else {
        const evalsPerGen = Math.max(1, (tp.populationSize | 0) * Math.max(1, (tp.rolloutsPerAgent | 0)));
        const secPerGen = evalsPerGen / ev;
        const gensPerMin = 60 / secPerGen;
        const minutesTo100 = (100 * secPerGen) / 60;
        const gpm = gensPerMin >= 100
          ? String(Math.round(gensPerMin))
          : (gensPerMin >= 10 ? gensPerMin.toFixed(0) : gensPerMin.toFixed(1));
        const horizon = minutesTo100 < 1
          ? `${Math.round(minutesTo100 * 60)}s`
          : (minutesTo100 < 60 ? `${minutesTo100.toFixed(1)}m` : `${(minutesTo100 / 60).toFixed(1)}h`);
        dom.paceTel.textContent = `${gpm} gens/min · ~${horizon}/100 gens`;
      }
    }
  }

  // ---- UI bindings ----
  function bindRange(input, valueEl, fn) {
    const pretty = fn || (v => parseFloat(v).toFixed(2));
    // Stash the formatter + value element on the input so curriculum
    // overlay code (which doesn't have direct access to the formatter
    // closure) can render the live applied value into the same column
    // using the slider's native unit format.
    input._fmt = pretty;
    input._valueEl = valueEl;
    const update = () => {
      valueEl.textContent = pretty(input.value);
      syncTrainerParams();
      // Re-check physics feasibility whenever any slider in the chain that
      // affects it changes. Cheap to call unconditionally.
      updateCartAccelHint();
    };
    input.addEventListener('input', update);
    update();
  }

  bindRange(dom.eliteRatio, dom.eliteRatioVal);
  bindRange(dom.tournamentSize, dom.tournamentSizeVal, v => String(parseInt(v, 10)));
  bindRange(dom.evalSeconds, dom.evalSecondsVal, v => parseInt(v, 10) + 's');
  bindRange(dom.simSpeed, dom.simSpeedVal, v => parseFloat(v).toFixed(2) + 'x');
  if (dom.simSpeedTest && dom.simSpeedTestVal) {
    bindRange(dom.simSpeedTest, dom.simSpeedTestVal, v => parseFloat(v).toFixed(2) + 'x');
  }
  bindRange(dom.rollouts, dom.rolloutsVal, v => String(parseInt(v, 10)));
  bindRange(dom.targetAngle, dom.targetAngleVal, v => parseInt(v, 10) + '°');
  bindRange(dom.ballSpeedBonus, dom.ballSpeedBonusVal, v => parseFloat(v).toFixed(1));
  bindRange(dom.smoothnessPenalty, dom.smoothnessPenaltyVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.ballSpawnX, dom.ballSpawnXVal, v => String(parseInt(v, 10)));
  bindRange(dom.ballSpawnY, dom.ballSpawnYVal, v => String(parseInt(v, 10)));
  bindRange(dom.ballSpawnDelay, dom.ballSpawnDelayVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.ballDriftSpeed, dom.ballDriftSpeedVal, v => String(parseInt(v, 10)));
  bindRange(dom.ballMass, dom.ballMassVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.ballRadius, dom.ballRadiusVal, v => String(parseInt(v, 10)));
  bindRange(dom.ballRestitution, dom.ballRestitutionVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.holeWidth, dom.holeWidthVal, v => parseInt(v, 10) + ' px');
  bindRange(dom.holeCenter, dom.holeCenterVal, v => parseInt(v, 10) + ' px');

  // Hole-width preview: a floor stripe with a gap of the actual hole
  // width plus a ball circle at matching scale. Lets the user SEE the
  // hole/ball size relationship as they drag the holeWidth slider —
  // confirms visually that the slider is doing something even when
  // curriculum is on (the on-canvas hole also redraws live, but the
  // panel-side preview makes the relationship explicit).
  const HOLE_PREVIEW_FLOOR_W = 160; // px, total floor stripe width
  const HOLE_PREVIEW_SCALE   = 0.6; // scale: world_px → preview_px
  function updateHolePreview() {
    if (!dom.holePreview) return;
    // Resolve the LIVE applied values — when curriculum is on with a
    // holeWidth (or ballRadius) spec, show the value the trainer is
    // actually using right now, not the user's slider value. Without
    // this, the preview said "50 px hole" while the trainer was
    // running 200 px holes (or vice versa) — three different
    // numbers for the same thing.
    let w = parseFloat(dom.holeWidth.value) || 50;
    let ballR = parseFloat(dom.ballRadius.value) || 14;
    if (app.trainer && app.trainer.params) {
      const tp = app.trainer.params;
      w = appliedCurriculumParam(tp, 'holeWidth');
      ballR = appliedCurriculumParam(tp, 'ballRadius');
      if (w == null || !isFinite(w))     w = parseFloat(dom.holeWidth.value) || 50;
      if (ballR == null || !isFinite(ballR)) ballR = parseFloat(dom.ballRadius.value) || 14;
    }
    const gapPx = Math.min(HOLE_PREVIEW_FLOOR_W, w * HOLE_PREVIEW_SCALE);
    const sidePx = Math.max(0, (HOLE_PREVIEW_FLOOR_W - gapPx) / 2);
    const gapEl   = dom.holePreview.querySelector('.hp-gap');
    const leftEl  = dom.holePreview.querySelector('.hp-left');
    const rightEl = dom.holePreview.querySelector('.hp-right');
    const ballEl  = dom.holePreview.querySelector('.hp-ball');
    if (gapEl)   gapEl.style.width   = gapPx + 'px';
    if (leftEl)  leftEl.style.width  = sidePx + 'px';
    if (rightEl) rightEl.style.width = sidePx + 'px';
    const ballPx = Math.max(4, 2 * ballR * HOLE_PREVIEW_SCALE);
    if (ballEl) {
      ballEl.style.width  = ballPx + 'px';
      ballEl.style.height = ballPx + 'px';
    }
    if (dom.hpText) {
      const wInt = Math.round(w);
      const ballDiam = Math.round(2 * ballR);
      const fits = w > 2 * ballR ? '✓ ball fits' : '✗ ball wider than hole';
      dom.hpText.textContent = `${wInt} px hole · ${ballDiam} px ball · ${fits}`;
    }
  }
  // Hook to slider input (live update as user drags) for both holeWidth
  // and ballRadius (the latter changes the comparator size on the right).
  dom.holeWidth.addEventListener('input', updateHolePreview);
  if (dom.ballRadius) dom.ballRadius.addEventListener('input', updateHolePreview);
  updateHolePreview();
  bindRange(dom.adversarialEnvPopSize, dom.adversarialEnvPopSizeVal, v => String(parseInt(v, 10)));
  bindRange(dom.adversarialMutationSigma, dom.adversarialMutationSigmaVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.cmaesHidden, dom.cmaesHiddenVal, v => String(parseInt(v, 10)));
  if (dom.cmaesLayers) {
    bindRange(dom.cmaesLayers, dom.cmaesLayersVal, v => String(parseInt(v, 10)));
  }
  bindRange(dom.neatInitialHidden, dom.neatInitialHiddenVal, v => String(parseInt(v, 10)));
  bindRange(dom.cmaesSigma, dom.cmaesSigmaVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.annealingT0, dom.annealingT0Val, v => parseFloat(v).toFixed(2));
  bindRange(dom.annealingCooling, dom.annealingCoolingVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.ptTmin, dom.ptTminVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.ptTmax, dom.ptTmaxVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.ptSwapInterval, dom.ptSwapIntervalVal, v => String(parseInt(v, 10)));
  bindRange(dom.deF, dom.deFVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.deCR, dom.deCRVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.gdEpsilon, dom.gdEpsilonVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.gdAlphaInit, dom.gdAlphaInitVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.nesSigma, dom.nesSigmaVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.nesLR, dom.nesLRVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.cnnImageSize, dom.cnnImageSizeVal, v => `${parseInt(v, 10)}×${parseInt(v, 10)}`);
  bindRange(dom.cnnFilters, dom.cnnFiltersVal, v => String(parseInt(v, 10)));
  bindRange(dom.cnnDense, dom.cnnDenseVal, v => String(parseInt(v, 10)));
  bindRange(dom.cnnHistory, dom.cnnHistoryVal, v => String(parseInt(v, 10)));
  // Multiscale CNN sliders. A single Resolution slider scales BOTH
  // the local and global branches together; users wanting independent
  // sizes still have the saved-preset override path.
  if (dom.cnnMultiscaleSize) {
    bindRange(dom.cnnMultiscaleSize, dom.cnnMultiscaleSizeVal,
              v => `${parseInt(v, 10)}×${parseInt(v, 10)}`);
  }
  if (dom.cnnMultiscaleFilters) {
    bindRange(dom.cnnMultiscaleFilters, dom.cnnMultiscaleFiltersVal,
              v => String(parseInt(v, 10)));
  }
  if (dom.cnnMultiscaleDense) {
    bindRange(dom.cnnMultiscaleDense, dom.cnnMultiscaleDenseVal,
              v => String(parseInt(v, 10)));
  }
  function applyMultiscaleConfig() {
    if (!dom.cnnMultiscaleSize) return;
    const size = parseInt(dom.cnnMultiscaleSize.value, 10) || 16;
    const filters = dom.cnnMultiscaleFilters
      ? (parseInt(dom.cnnMultiscaleFilters.value, 10) || 2) : 2;
    const dense = dom.cnnMultiscaleDense
      ? (parseInt(dom.cnnMultiscaleDense.value, 10) || 8) : 8;
    const base = (BF.cnnMultiscale && BF.cnnMultiscale.defaultConfig)
      ? BF.cnnMultiscale.defaultConfig() : {};
    app.cnnMultiscaleConfigOverride = Object.assign({}, base, {
      localGridSize:  size,
      globalGridSize: size,
      numFilters:     filters,
      denseHidden:    dense,
    });
    // Update param-count hint so the user can see "warning, you're
    // pushing CMA-ES's Jacobi ceiling".
    if (dom.cnnMultiscaleParamsHint && BF.cnnMultiscale && BF.cnnMultiscale.paramCount) {
      const n = BF.cnnMultiscale.paramCount(app.cnnMultiscaleConfigOverride);
      let cls = 'ok';
      let msg = `~${n} params · CMA-ES tractable`;
      if (n > 1500) { cls = 'bad'; msg = `~${n} params · too high — switch to sep-CMA-ES`; }
      else if (n > 700) { cls = 'warn'; msg = `~${n} params · borderline; expect slower gens`; }
      dom.cnnMultiscaleParamsHint.innerHTML = `<span class="${cls}">${msg}</span>`;
    }
  }
  // ---- Recurrent policy sliders -------------------------------------------
  // These are GENOME-SHAPE knobs (memSize/hidden change the parameter-vector
  // dimension), so — exactly like the CNN sliders below — 'input' updates the
  // label + hint live and 'change' (fires on release) rebuilds the trainer.
  if (dom.recurrentMem) {
    bindRange(dom.recurrentMem, dom.recurrentMemVal, v => String(parseInt(v, 10)));
  }
  if (dom.recurrentHidden) {
    bindRange(dom.recurrentHidden, dom.recurrentHiddenVal, v => String(parseInt(v, 10)));
  }
  if (dom.recurrentLeak) {
    bindRange(dom.recurrentLeak, dom.recurrentLeakVal, v => parseFloat(v).toFixed(2));
  }
  function recurrentConfigFromUI() {
    return {
      memSize: dom.recurrentMem ? (parseInt(dom.recurrentMem.value, 10) || 0) : 8,
      hidden:  dom.recurrentHidden ? (parseInt(dom.recurrentHidden.value, 10) || 0) : 16,
      leak:    dom.recurrentLeak ? (parseFloat(dom.recurrentLeak.value) || 0.2) : 0.2,
    };
  }
  function refreshRecurrentHint() {
    if (!dom.recurrentParamsHint || !BF.recurrent) return;
    const setupId = dom.setupSelect ? dom.setupSelect.value : 'single';
    const su = BF.setups.getSetup(setupId);
    const obsN = su ? su.observationCount : 6;
    const outN = su ? (Math.max(1, su.actionCount | 0) || 1) : 1;
    const cfg = BF.recurrent.resolveConfig(Object.assign(recurrentConfigFromUI(),
      { obsCount: obsN, numOutputs: outN }));
    const n = BF.recurrent.paramCount(cfg);
    // The parameter-MATCHED memoryless MLP is the honest comparison, so show
    // the hidden width that lands on the same count: obs*h + h + h*out + out.
    // That width is a ROUNDED solve and only lands exactly for some shapes
    // (at the shipped 8/16 it is exact: 6→49→1 = 393 = 14→16→9). Calling a
    // near miss "matched" would undersell the one thing this preset family is
    // built on, so the label says "nearest" and prints the real count whenever
    // the rounding does not land — measured, 689 of the 833 reachable slider
    // shapes do not land.
    const denom = obsN + 1 + outN;
    const matched = Math.round((n - outN) / denom);
    const matchedN = BF.cmaes.paramCount(obsN, outN, matched > 0 ? [matched] : []);
    const exact = matchedN === n;
    const severed = dom.recurrentSever && dom.recurrentSever.checked;
    dom.recurrentParamsHint.innerHTML = '<span class="' + (severed ? 'warn' : 'ok') + '">'
      + cfg.wrappedInputs + ' in → ' + (cfg.sizes.length ? cfg.sizes.join('→') : 'linear')
      + ' → ' + cfg.wrappedOutputs + ' out · ' + n + ' params'
      + ' · ' + (exact ? 'matched' : 'nearest') + ' memoryless MLP = '
      + obsN + '→' + matched + '→' + outN + (exact ? '' : ' (' + matchedN + ' params)')
      + (severed ? ' · MEMORY CUT (ablation)' : '') + '</span>';
  }
  [dom.recurrentMem, dom.recurrentHidden, dom.recurrentLeak]
    .forEach(el => { if (el) el.addEventListener('input', refreshRecurrentHint); });
  [dom.recurrentMem, dom.recurrentHidden, dom.recurrentLeak]
    .forEach(el => { if (el) el.addEventListener('change', rebuildTrainerFromUI); });
  if (dom.recurrentSever) {
    // Severing does NOT change the parameter vector, so this must NOT rebuild
    // the population — the whole point of the exhibit is that the SAME trained
    // weights collapse when the memory is cut. syncTrainerParams pushes the
    // flag onto the live trainer and rebuildDisplayState re-wraps the current
    // champion with the memory inputs held at 0.
    dom.recurrentSever.addEventListener('change', () => {
      syncTrainerParams();
      if (app.trainer) {
        BF.trainer.resolveConfigsFromParams(app.trainer);
      }
      refreshRecurrentHint();
      if (typeof rebuildDisplayState === 'function') rebuildDisplayState();
    });
  }
  // Single-pendulum observation-dropout controls. Both are WORLD knobs, not
  // genome knobs (width is 6 either way), but the mode has to reach the setup
  // singleton before the trainer/display are rebuilt — see
  // syncSetupObservationCounts.
  if (dom.singleDropoutK) {
    bindRange(dom.singleDropoutK, dom.singleDropoutKVal,
              v => parseInt(v, 10) === 1 ? 'every step' : parseInt(v, 10) + ' steps');
  }
  if (dom.singleObservationMode) {
    dom.singleObservationMode.addEventListener('change', () => {
      if (dom.singleDropoutKRow) {
        dom.singleDropoutKRow.style.display =
          dom.singleObservationMode.value === 'blind-dropout' ? '' : 'none';
      }
      rebuildTrainerFromUI();
    });
  }
  if (dom.singleDropoutK) {
    dom.singleDropoutK.addEventListener('change', rebuildTrainerFromUI);
  }
  [dom.cnnMultiscaleSize, dom.cnnMultiscaleFilters, dom.cnnMultiscaleDense]
    .forEach(el => { if (el) el.addEventListener('input', applyMultiscaleConfig); });
  // Same change-vs-input split as the 2D CNN block: 'change' fires on
  // release so dragging doesn't rebuild on every tick.
  [dom.cnnMultiscaleSize, dom.cnnMultiscaleFilters, dom.cnnMultiscaleDense]
    .forEach(el => { if (el) el.addEventListener('change', rebuildTrainerFromUI); });
  // Initial pass so the param hint shows up even before the user
  // touches anything.
  applyMultiscaleConfig();
  // CNN sliders change the network's PARAM SHAPE, which is baked into
  // `trainer.cnnConfig` at construction time. syncTrainerParams (the
  // bindRange `input` path) writes the new value to `trainer.params.cnnConfig`
  // but does NOT update the live snapshot, so without an explicit rebuild
  // the slider edit appears to do nothing -- the next rollout still reads
  // the stale shape. We hook the 'change' event (fires on release, not
  // during drag) so dragging the slider doesn't trigger a population
  // rebuild on every tick.
  [dom.cnnImageSize, dom.cnnFilters, dom.cnnDense, dom.cnnHistory, dom.cnnChannels]
    .forEach(el => { if (el) el.addEventListener('change', rebuildTrainerFromUI); });

  // Live CNN params estimate. Recomputes whenever any CNN slider moves.
  function updateCNNParamsHint() {
    if (!dom.cnnParamsHint) return;
    const c = {
      imageSize: parseInt(dom.cnnImageSize.value, 10),
      numFilters: parseInt(dom.cnnFilters.value, 10),
      filterSize: 3,
      poolSize: 2,
      denseHidden: parseInt(dom.cnnDense.value, 10),
      numOutputs: 1,
      numChannels: dom.cnnChannels ? parseInt(dom.cnnChannels.value, 10) : 1,
    };
    const n = BF.cnn.paramCount(c);
    let cls = 'ok';
    let msg = `~${n} params · CMA-ES tractable`;
    if (n > 1500) {
      cls = 'bad';
      msg = `~${n} params · too high — CMA-ES Jacobi will stall (try lower resolution or fewer hidden)`;
    } else if (n > 700) {
      cls = 'warn';
      msg = `~${n} params · borderline; expect slower generations`;
    }
    dom.cnnParamsHint.innerHTML = `<span class="${cls}">${msg}</span>`;
  }
  [dom.cnnImageSize, dom.cnnFilters, dom.cnnDense].forEach(el => {
    el.addEventListener('input', updateCNNParamsHint);
  });
  // Rebuild trainer when any structural param actually changes (on release).
  // History len changes don't strictly require rebuild but it keeps things
  // simple — easier than mutating live policy state mid-run.
  // numChannels also rebuilds because it changes the kernel parameter
  // count (numChannels × filterSize² weights per filter instead of 1×).
  [dom.cnnImageSize, dom.cnnFilters, dom.cnnDense, dom.cnnHistory, dom.cnnChannels].forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
      updateCNNParamsHint();
      if (dom.policyTypeSelect && dom.policyTypeSelect.value === 'cnn'
          && dom.modeSelect.value === 'cmaes') {
        rebuildTrainerFromUI();
      }
    });
  });
  updateCNNParamsHint();
  // Bind 3D CNN sliders + live param-count hint.
  function updateCNN3DParamsHint() {
    if (!dom.cnn3dParamsHint) return;
    const c = {
      inputMode:   dom.cnn3dInputMode.value,
      depthSize:   parseInt(dom.cnn3dDepth.value, 10),
      imageSize:   parseInt(dom.cnn3dImageSize.value, 10),
      numFilters:  parseInt(dom.cnn3dFilters.value, 10),
      filterSize:  3,
      filterDepth: parseInt(dom.cnn3dFilterDepth.value, 10),
      poolSize:    2,
      denseHidden: parseInt(dom.cnn3dDense.value, 10),
      numOutputs:  1,
    };
    const n = BF.cnn3d.paramCount(c);
    let cls = 'ok';
    let msg = `~${n} params · CMA-ES tractable`;
    if (n > 1800) {
      cls = 'bad';
      msg = `~${n} params · too high — CMA-ES Jacobi will stall (try smaller depth/resolution/filters)`;
    } else if (n > 900) {
      cls = 'warn';
      msg = `~${n} params · borderline; expect slower generations`;
    }
    dom.cnn3dParamsHint.innerHTML = `<span class="${cls}">${msg}</span>`;
  }
  if (dom.cnn3dInputMode) {
    [dom.cnn3dDepth, dom.cnn3dImageSize, dom.cnn3dFilters, dom.cnn3dFilterDepth, dom.cnn3dDense].forEach(el => {
      el.addEventListener('input', updateCNN3DParamsHint);
      el.addEventListener('change', () => {
        if (dom.policyTypeSelect && dom.policyTypeSelect.value === 'cnn3d'
            && dom.modeSelect.value === 'cmaes') {
          rebuildTrainerFromUI();
        }
      });
    });
    dom.cnn3dInputMode.addEventListener('change', () => {
      if (dom.policyTypeSelect && dom.policyTypeSelect.value === 'cnn3d'
          && dom.modeSelect.value === 'cmaes') {
        rebuildTrainerFromUI();
      }
    });
    updateCNN3DParamsHint();
  }
  bindRange(dom.cnn3dDepth, dom.cnn3dDepthVal, v => String(parseInt(v, 10)));
  bindRange(dom.cnn3dImageSize, dom.cnn3dImageSizeVal, v => `${parseInt(v, 10)}×${parseInt(v, 10)}`);
  bindRange(dom.cnn3dFilters, dom.cnn3dFiltersVal, v => String(parseInt(v, 10)));
  bindRange(dom.cnn3dFilterDepth, dom.cnn3dFilterDepthVal, v => String(parseInt(v, 10)));
  bindRange(dom.cnn3dDense, dom.cnn3dDenseVal, v => String(parseInt(v, 10)));
  // Same snapshot-vs-live story as the 2D CNN sliders above. Rebuild
  // on commit (change) so dragging doesn't thrash the population.
  [dom.cnn3dDepth, dom.cnn3dImageSize, dom.cnn3dFilters,
   dom.cnn3dFilterDepth, dom.cnn3dDense, dom.cnn3dInputMode]
    .forEach(el => { if (el) el.addEventListener('change', rebuildTrainerFromUI); });

  // Algorithm mode wiring. Switching mode rebuilds the trainer because the
  // population structure and update rule are completely different. Hidden-size
  // and σ changes also force a rebuild for the same reason — they're topology
  // and step-size *initialization*, not live parameters.
  function updateTopologyHint() {
    if (!dom.neatTopologyHint || !dom.neatTopologyPreset) return;
    const presetId = dom.neatTopologyPreset.value || 'minimal';
    const presets = (BF.trainer && BF.trainer.TOPOLOGY_PRESETS) || {};
    const p = presets[presetId];
    if (!p) {
      dom.neatTopologyHint.innerHTML = '';
      return;
    }
    let numIn = 5;
    try {
      const setup = BF.setups.getSetup(dom.setupSelect.value);
      if (setup) numIn = setup.observationCount;
    } catch (_) {}
    let hidden = p.hidden || [];
    if ((!hidden || hidden.length === 0) && dom.neatInitialHidden) {
      const n = Math.max(0, parseInt(dom.neatInitialHidden.value, 10) || 0);
      hidden = n > 0 ? [n] : [];
    }
    const layers = [numIn, ...hidden, 1];
    let conns = 0;
    for (let i = 0; i < layers.length - 1; i++) conns += layers[i] * layers[i + 1];
    const shape = hidden.length === 0 ? 'minimal' : hidden.join('x');
    const presetNote = (p.hidden && p.hidden.length > 0)
      ? 'preset MLP seed'
      : 'uses slider above';
    dom.neatTopologyHint.innerHTML =
      `<span class="info">layers ${layers.join(' -> ')} · hidden ${shape} · ~${conns} initial connections · ${presetNote}</span>`;
  }

  // Per-algorithm long-form descriptions surfaced by the "?" button next to
  // the algorithm select. Keep these grounded in what the implementation
  // actually does — what's good vs bad about each mode for THIS app's tasks
  // (pendulum, golf, ball-strike), not a generic textbook tour. Each entry is
  // an HTML string so the renderer can use <strong>/<span class="pros|cons">.
  const ALGO_EXPLAIN = {
    'diffsim-adam':
      '<strong>Exact-gradient neural (diffsim)</strong> — instead of estimating ' +
      'the gradient by perturbing (SPSA/NES) or guessing structure (NEAT), this ' +
      'backpropagates through a <em>differentiable</em> double-pendulum simulator: ' +
      'the whole rollout is one autodiff graph, so Adam gets the true ' +
      'dLoss/dWeight and the policy learns to catch a falling double pendulum in ' +
      'a handful of iterations. ' +
      '<span class="pros">Pros:</span> converges where gradient-free plateaus — ' +
      'holds the balance over the training horizon; also unlocks grad-only ' +
      'visualizations (per-step adjoint / backprop sensitivity). ' +
      '<span class="cons">Cons:</span> needs a differentiable model of the ' +
      'physics (you can\'t backprop through a black-box env), and a memoryless ' +
      'policy holds only ~1.5–2 s before the finite trained basin runs out. ' +
      'Double-pendulum only.',
    'diffsim-memetic':
      '<strong>Memetic (diffsim)</strong> — gradient-assisted evolution: a real ' +
      '<em>population</em> of exact-gradient policies. Each generation every ' +
      'individual is first refined by a few Adam steps through the differentiable ' +
      'simulator (the local "meme"), then scored and evolved — elites survive, the ' +
      'rest are cloned-with-noise from elites (Lamarckian: the refined weights are ' +
      'inherited). Reuses the population + elite-ratio controls. ' +
      '<span class="pros">Pros:</span> combines gradient exploitation (fast within ' +
      'a basin) with population exploration (escapes local optima) — the classic ' +
      'recipe for hard-exploration problems like swing-up, where a single gradient ' +
      'run gets stuck because a balance loss can\'t <em>discover</em> the ' +
      'energy-pumping motion. The fitness chart now shows a genuine best/avg/worst ' +
      'spread. ' +
      '<span class="cons">Cons:</span> ~popSize× the cost of one gradient run per ' +
      'gen (single-threaded), and no free lunch — it can still plateau. ' +
      'Double-pendulum only.',
    'diffsim-trajopt':
      '<strong>Trajectory optimization + LQR catch (diffsim)</strong> — the ' +
      'architecture the real double/triple-pendulum showcases use. Instead of ' +
      'training a feedback policy, gradient-descend the <em>open-loop control ' +
      'sequence itself</em> (one accel value per timestep) through the ' +
      'differentiable simulator, from hanging straight down: energy shaping ' +
      'teaches the pumping, a terminal window demands "upright, slow, centered". ' +
      'An LQR watches the replay and catches the moment the state enters its ' +
      'basin — then holds indefinitely. ' +
      '<span class="pros">Pros:</span> the pumping motion is an explicit ' +
      'decision variable per timestep, not something policy weights must ' +
      'discover; you watch each generation\'s swing-up attempt improve until ' +
      'one is caught. This is offline trajectory optimization + online ' +
      'stabilization — the honest real-world recipe. ' +
      '<span class="cons">Cons:</span> open-loop (no disturbance robustness ' +
      'until the LQR takes over) and single-shooting gradients through chaotic ' +
      'dynamics are rugged — the optimizer can need many restarts. ' +
      'Double-pendulum only.',
    'dodge-planner':
      "<strong>Receding-horizon dodge planner</strong>: searches 81 two-part acceleration sequences against known ballistic bullets and wall clearance. The corrected single-displacement model completed ten held-out 20-second episodes at two spawn rates. Future spawns remain unknown; this is an engineered baseline, not a neural policy.",
    'dodge-distill':
      "<strong>Learned planner imitation</strong>: a genuine nine-action MLP trained with cross-entropy and DAgger. A low imitation loss does not guarantee stable closed-loop control. Current bounded top-K and radar trials remain unsuccessful; more data, a better observation or a loss that treats equally safe actions alike are hypotheses to test. Test replays the best validation checkpoint; training previews current weights. No planner fallback runs in the student.",
    'diffsim-lqr':
      "<strong>Spring-model local LQR</strong>: linearize the differentiable spring model near upright and solve for feedback. Its result depends on the model, timestep and starting state; inspect the measured hold. The rigid LQR presets provide the independently audited point-mass comparison. No neural training occurs.",
    'rigid-lqr':
      "<strong>Rigid double local LQR</strong>: linearize the point-mass model near upright and solve a discrete Riccati equation for feedback. The corrected model held for 20 seconds at each tested gravity 300/700/1000 and tilt 3/6 degrees. Angle errors are wrapped. This is a local stabilizer with known dynamics, not a global guarantee or a swing-up policy.",
    'rigid-swingup':
      "<strong>Rigid double swing-up experiment</strong>: autodiff optimizes a bounded open-loop acceleration sequence and a local LQR attempts the catch. This is classical direct shooting, not neural training. Rail acceleration now acts consistently through the pivot. Old success rates belonged to a different model; a finite search may fail. Only an independently replayed catch is marked VERIFIED.",
    'rigid-triple-lqr':
      "<strong>Rigid triple local LQR</strong>: finite-difference linearization and a discrete Riccati solve stabilize the simplified equal-point-mass model near upright. All six audited gravity/tilt combinations held for 20 seconds. It is a local controller, not a swing-up method or a reproduction of the Glueck et al. hardware.",
    'rigid-triple-swingup':
      "<strong>Rigid triple swing-up experiment</strong>: the same direct-shooting and LQR combination with three links. This is classical control; no neural weights are trained. The 2013 paper uses a boundary-value feedforward design and feedback on a real apparatus, while this demo uses simplified point masses and acceleration control. Rail dynamics changed in September, invalidating the old 20/20 result. Search can fail; the verified catch metric is the success criterion.",
    'signing-planner':
      "<strong>Model-based physical tracing</strong>: receding-horizon search drives the cart while joint and telescope feedback follow the curve. Steady-state mean error is 18.1 pixels on the centered figure-eight preset (radius 140). That is useful approximate tracking, not a proof of an optimal controller or a hardware ceiling. No neural learning occurs.",
    'epicycle-analytic':
      "<strong>Fourier curve reconstruction</strong>: rotating arms represent retained coefficients of a sampled curve. More arms reduce truncation error; retaining the largest coefficients minimizes squared error for the sampled signal at that term count. General curves are approximated, while some finite-harmonic curves are exact. Open strokes use an even extension in automatic mode. This is analytic reconstruction, not physical chain tracking or neural learning.",
    'neat-full':
      '<strong>Full NEAT</strong> — canonical Stanley & Miikkulainen NEAT: ' +
      'compatibility-distance speciation (excess + disjoint + weight diff), ' +
      'fitness sharing within species, per-species champion preservation, and ' +
      'NEAT-style crossover that aligns matching genes by historical innovation. ' +
      '<span class="pros">Pros:</span> protects new structural mutations from being ' +
      'killed before their weights catch up — the right tool for sparse-reward / ' +
      'deceptive tasks (golf, ball-strike). Crossover combines complementary ' +
      'sub-structures discovered in different lineages. ' +
      '<span class="cons">Cons:</span> more knobs to tune (compat threshold, ' +
      'target species count, crossover rate). Per-gen speciation pass costs O(N²) ' +
      'genome comparisons, so it\'s slightly slower per gen than mutation-only.',
    'neat':
      '<strong>NEAT-simplified</strong> — mutation-only GA over the same NEAT ' +
      'genome. No speciation, no crossover. Tournament selection from the whole ' +
      'population; new structures compete against everyone immediately, so an ' +
      'add-node mutation that briefly hurts fitness is usually killed before its ' +
      'weights can be tuned. ' +
      '<span class="cons">Cons:</span> tends to need babysitting on hard tasks — ' +
      'the experimental "Adaptive recovery" toggles (Hall of Fame, stuck-escape, ' +
      'diversity injection) exist to approximate what speciation does for free. ' +
      '<span class="pros">Pros:</span> cheaper per gen (no speciation pass), and ' +
      'enough for dense-reward control (single pendulum balance). Useful as a ' +
      'baseline when you want to see what NEAT looks like WITHOUT the species ' +
      'machinery.',
    'cmaes':
      '<strong>CMA-ES</strong> — Covariance-Matrix Adaptation Evolution Strategy. ' +
      'Fixed network topology (the <em>Hidden units</em> slider sets the MLP shape); ' +
      'CMA-ES learns the full weight vector by sampling from a multivariate Gaussian ' +
      'whose mean and covariance adapt each generation. ' +
      '<span class="pros">Pros:</span> very strong on smooth continuous-control ' +
      'problems — converges fast on a good linear/MLP policy when the topology is ' +
      'sufficient. The covariance adaptation gives it implicit step-size and ' +
      'directionality control no other method here matches. ' +
      '<span class="cons">Cons:</span> can\'t grow the network — if the chosen ' +
      'hidden size is too small, you\'re stuck. The Jacobi eigendecomposition is ' +
      'O(d³) so it slows past ~1000 weights (relevant when using CNN policies).',
    'de':
      '<strong>Differential Evolution</strong> — population-based: each child is ' +
      'parent + F·(rand1 − rand2), then crossover with the parent at rate CR. ' +
      'Self-adapts step size to the population\'s spread, so it doesn\'t need a ' +
      'σ slider. <span class="pros">Pros:</span> robust, parameter-light, decent ' +
      'on rugged landscapes. <span class="cons">Cons:</span> slower convergence ' +
      'than CMA-ES on smooth problems; no covariance, so it can\'t preferentially ' +
      'search along productive directions.',
    'pso':
      '<strong>Particle Swarm</strong> — each individual remembers its own best ' +
      'position and follows a mix of personal-best + global-best with inertia. ' +
      '<span class="pros">Pros:</span> dead simple, good for multimodal landscapes ' +
      'when the swarm splits across basins. <span class="cons">Cons:</span> tends ' +
      'to collapse onto the global best too fast on smooth problems; weaker than ' +
      'CMA-ES or DE here.',
    'cem':
      '<strong>Cross-Entropy Method</strong> — sample from N(μ, σ²I), refit μ and ' +
      'σ to the top-elite each gen. Like CMA-ES with isotropic σ (no covariance). ' +
      '<span class="pros">Pros:</span> simple, surprisingly strong baseline. ' +
      '<span class="cons">Cons:</span> no directional adaptation; CMA-ES dominates ' +
      'it on the same problems for slightly more compute.',
    'annealing':
      '<strong>Simulated annealing (N parallel chains)</strong> — each chain ' +
      'proposes a small Gaussian perturbation; accept improvements always, accept ' +
      'worse moves with probability exp(Δfitness/T). Temperature cools each gen. ' +
      'Educational baseline that shows what naive local search looks like next to ' +
      'population-based methods.',
    'pt':
      '<strong>Parallel tempering</strong> — N annealing chains at different ' +
      'temperatures, with periodic Metropolis swap proposals between adjacent ' +
      'chains. Hot chains explore; cold chains exploit. Educational — neat to ' +
      'watch but rarely the best choice for this app\'s tasks.',
    'random':
      '<strong>Random search</strong> — sample a fresh population from N(0, σ²I) ' +
      'every generation. No learning at all; baseline that answers "is the ' +
      'algorithm even helping?" If your method beats this on the same wall-clock ' +
      'budget, the search is doing real work.',
    'fdgd':
      '<strong>FD-GD</strong> — finite-difference gradient + line search. Probes ' +
      '±ε along each parameter axis to estimate ∇fitness, then takes a step with ' +
      'an auto-adapted α. <span class="cons">Cons:</span> 2d evaluations per ' +
      'gradient estimate scales badly with parameter count; very vulnerable to ' +
      'noise from rollout variance.',
    'spsa':
      '<strong>SPSA</strong> — simultaneous perturbation: estimate the gradient ' +
      'using ONE random ±ε direction (vs FD-GD\'s 2d probes). 2 evaluations per ' +
      'gradient regardless of dimension. Noisy gradients, but cheap and surprising ' +
      'enough to be educational.',
    'nes':
      '<strong>NES / OpenAI-ES</strong> — REINFORCE-style score-function gradient: ' +
      'sample N perturbations of μ, weight by fitness, update μ. The "ES" half of ' +
      'the modern ES-vs-RL story. <span class="cons">Cons:</span> isotropic σ, no ' +
      'covariance — CMA-ES strictly dominates on the same problem class.',
    'cuckoo':
      '<strong>Cuckoo Search</strong> — Lévy-flight global search + occasional ' +
      'nest-replacement. The Lévy-flight steps make it more aggressive about ' +
      'escaping local optima than Gaussian-step methods.',
    'whale':
      '<strong>Whale Optimization</strong> — bubble-net spiral hunting metaphor. ' +
      'Mostly here as a "do exotic-name swarm methods actually beat plain PSO?" ' +
      'experiment. Usually no.',
    'fish':
      '<strong>Fish Swarm / AFSA</strong> — crowding-aware swarm: fish move ' +
      'toward food (better fitness) but avoid over-crowded cells. Helps a little ' +
      'with diversity vs vanilla PSO.',
    'greywolf':
      '<strong>Grey Wolf Optimizer</strong> — α/β/δ leadership hierarchy: the top ' +
      '3 individuals each generation define a search-direction frame the rest move ' +
      'within. Behaves a lot like a 3-leader PSO.',
    'aco':
      '<strong>ACO_R</strong> — continuous Ant Colony with a pheromone-archive of ' +
      'past good solutions. Each new ant samples around an archive entry, weighted ' +
      'by rank. Niche but interesting because the search distribution is multi-modal.',
    'firefly':
      '<strong>Firefly Algorithm</strong> — pairwise attraction: every firefly ' +
      'moves toward every brighter firefly, attenuated by distance. O(N²) ' +
      'per-gen; mostly here for comparison.',
    'bat':
      '<strong>Bat Algorithm</strong> — frequency-based velocity update with a ' +
      'random walk component that decays as the run improves. Educational; PSO ' +
      'usually wins.',
  };

  function refreshAlgoExplain() {
    if (!dom.algoExplain) return;
    const mode = dom.modeSelect.value;
    dom.algoExplain.innerHTML = ALGO_EXPLAIN[mode]
      || `<em>No description for "${mode}" yet.</em>`;
  }
  function toggleAlgoExplain(force) {
    if (!dom.algoExplain || !dom.modeHelpBtn) return;
    const next = (typeof force === 'boolean')
      ? force
      : dom.algoExplain.classList.contains('hidden');
    dom.algoExplain.classList.toggle('hidden', !next);
    dom.modeHelpBtn.classList.toggle('active', next);
    if (next) refreshAlgoExplain();
  }
  if (dom.modeHelpBtn) {
    dom.modeHelpBtn.addEventListener('click', () => toggleAlgoExplain());
  }

  function refreshAlgoUI() {
    const mode = dom.modeSelect.value;
    const isNeat = T.isNeatMode(mode);
    // WASM applicability (#2): the WASM path's dominant, worth-it win is the CNN
    // forward pass (especially the high-capacity multi-scale CNN). For a small MLP
    // net the JS path is already fast, so gold-glow the "Use WASM" row when a CNN
    // policy is selected and dim it otherwise — a clear signal of when it helps.
    {
      const pt = dom.policyTypeSelect ? dom.policyTypeSelect.value : 'mlp';
      const wasmHelps = /^cnn/.test(pt);
      for (const row of [dom.useWasmEvalRow, dom.useWasmEvalTestRow]) {
        if (!row) continue;
        row.classList.toggle('wasm-applicable', wasmHelps);
        row.classList.toggle('wasm-dimmed', !wasmHelps);
      }
    }
    // CNN policies are available under EITHER full CMA-ES or sep-CMA-ES.
    // The two algorithms share the (mean, sigma, C) state shape so the
    // trainer's policy-target builder, dimOverride plumbing, and the
    // initCNN config blocks all work the same way; only the per-gen
    // covariance update differs. Treat them as a single "CMA-family"
    // gate for the policy dropdown's visibility.
    const isCMA = (mode === 'cmaes' || mode === 'sep-cmaes');
    const isSA = mode === 'annealing';
    const isPT = mode === 'pt';
    const isDE = mode === 'de';
    const isPSO = mode === 'pso';
    const isRandom = mode === 'random';
    const isCEM = mode === 'cem';
    const isFDGD = mode === 'fdgd';
    const isSPSA = mode === 'spsa';
    const isNES  = mode === 'nes';
    const isAdam = mode === 'adam';
    const isLBFGS = mode === 'lbfgs';
    const isXNES  = mode === 'xnes';
    // GD-family: any algorithm that uses the perturbation-epsilon slider
    // (FD-GD, SPSA, Adam, L-BFGS all probe ±ε pairs to estimate gradients).
    const isGD   = isFDGD || isSPSA || isAdam || isLBFGS;
    const isSwarm = mode === 'cuckoo' || mode === 'whale' || mode === 'fish'
                 || mode === 'greywolf' || mode === 'aco' || mode === 'firefly'
                 || mode === 'bat';
    const fixedTopology = isCMA || isSA || isPT || isDE || isPSO || isRandom || isCEM ||
                          isFDGD || isSPSA || isAdam || isLBFGS || isNES || isXNES || isSwarm;
    dom.cmaesHiddenRow.style.display = fixedTopology ? '' : 'none';
    if (dom.cmaesLayersRow) {
      dom.cmaesLayersRow.style.display = fixedTopology ? '' : 'none';
    }
    dom.cmaesSigmaRow.style.display = isCMA ? '' : 'none';
    // NEAT initial-hidden slider — only meaningful in NEAT mode (other
    // algorithms have their own topology / hidden-size controls).
    if (dom.neatInitialHiddenRow) {
      dom.neatInitialHiddenRow.style.display = isNeat ? '' : 'none';
    }
    // NEAT-CNN hybrid: a NEAT-on-dodge addon. The hybrid swaps the
    // raw-grid input space (~516 floats) for a frozen-CNN-pooled
    // projection (~20-36 floats) that NEAT can actually search
    // effectively. Toggle only relevant when both conditions hold.
    const activeSetupId = dom.setupSelect ? dom.setupSelect.value : '';
    const showHybridUI = isNeat && activeSetupId === 'dodge';
    if (dom.useHybridCnnRow) {
      dom.useHybridCnnRow.style.display = showHybridUI ? '' : 'none';
    }
    // The includeTopK sub-toggle only matters when the master is on.
    const hybridActive = showHybridUI && dom.useHybridCnn && dom.useHybridCnn.checked;
    if (dom.hybridIncludeTopKRow) {
      dom.hybridIncludeTopKRow.style.display = hybridActive ? '' : 'none';
    }
    if (dom.neatTopologyRow) dom.neatTopologyRow.style.display = isNeat ? '' : 'none';
    if (dom.neatTopologyHint) dom.neatTopologyHint.style.display = isNeat ? '' : 'none';
    updateTopologyHint();
    // Flat-vector policies (CNN family, recurrent) need an optimiser with a
    // dimOverride seam. That is the CMA family and — since js/de.js gained the
    // same option — DE. Hide the row for everything else to avoid implying a
    // choice that readParams would silently demote to 'mlp'.
    dom.cnnPolicyRow.style.display = (isCMA || isDE) ? '' : 'none';
    // Per-option visibility: 'cnn' / 'cnn3d' show for pendulum-family
    // setups (which produce phase-space images). 'cnn-grid' shows only
    // for the dodge setup since it expects the dodge grid encoding in
    // the observation. We toggle each <option>'s hidden attribute so the
    // dropdown stays compact for the active setup.
    const activeSetup = dom.setupSelect ? dom.setupSelect.value : '';
    const isDodgeSetup = activeSetup === 'dodge';
    // Setups that emit a conv-ready occupancy grid inside their observation.
    // 'cnn-grid' reads that grid directly, so it is offered exactly here:
    // dodge (16x16 danger grid) and terrain-run ('patch', a 2x8x12 patch).
    // 'cnn-multiscale' stays dodge-only — it wants two grids.
    const isGridSetup = isDodgeSetup || activeSetup === 'terrain-run';
    if (dom.policyTypeSelect) {
      for (const opt of dom.policyTypeSelect.options) {
        if (opt.value === 'cnn' || opt.value === 'cnn3d') opt.hidden = isGridSetup;
        else if (opt.value === 'cnn-grid') opt.hidden = !isGridSetup;
        else if (opt.value === 'cnn-multiscale') opt.hidden = !isDodgeSetup;
        // The recurrent policy is general (any setup could use it) but the
        // only task shipped with a MEASURED memory requirement is the single
        // pendulum under observation dropout, so it is offered there.
        else if (opt.value === 'recurrent') opt.hidden = (activeSetup !== 'single');
      }
      // If the currently-selected option is now hidden (e.g. user just
      // switched from pendulum -> dodge while on 'cnn'), fall back to
      // MLP so CMA-ES doesn't try to evaluate a phase-space CNN on a
      // dodge observation.
      const sel = dom.policyTypeSelect.selectedOptions[0];
      if (sel && sel.hidden) dom.policyTypeSelect.value = 'mlp';
    }
    // Config block appears only when both CMA-ES is selected AND CNN is on.
    const policyType = dom.policyTypeSelect ? dom.policyTypeSelect.value : 'mlp';
    const cnnVisible = isCMA && policyType === 'cnn';
    const cnn3dVisible = isCMA && policyType === 'cnn3d';
    const cnnMultiVisible = isCMA && policyType === 'cnn-multiscale';
    const recurrentVisible = (isCMA || isDE) && policyType === 'recurrent';
    dom.cnnConfigBlock.style.display = cnnVisible ? '' : 'none';
    if (dom.cnn3dConfigBlock) dom.cnn3dConfigBlock.style.display = cnn3dVisible ? '' : 'none';
    if (dom.cnnMultiscaleConfigBlock) dom.cnnMultiscaleConfigBlock.style.display = cnnMultiVisible ? '' : 'none';
    if (dom.recurrentConfigBlock) {
      dom.recurrentConfigBlock.style.display = recurrentVisible ? '' : 'none';
      if (recurrentVisible && typeof refreshRecurrentHint === 'function') refreshRecurrentHint();
    }
    dom.annealingT0Row.style.display = isSA ? '' : 'none';
    dom.annealingCoolingRow.style.display = isSA ? '' : 'none';
    dom.ptTminRow.style.display = isPT ? '' : 'none';
    dom.ptTmaxRow.style.display = isPT ? '' : 'none';
    dom.ptSwapRow.style.display = isPT ? '' : 'none';
    dom.deFRow.style.display = isDE ? '' : 'none';
    dom.deCRRow.style.display = isDE ? '' : 'none';
    if (dom.gdEpsilonRow)   dom.gdEpsilonRow.style.display   = isGD ? '' : 'none';
    if (dom.gdAlphaInitRow) dom.gdAlphaInitRow.style.display = isGD ? '' : 'none';
    if (dom.nesSigmaRow)    dom.nesSigmaRow.style.display    = isNES ? '' : 'none';
    if (dom.nesLRRow)       dom.nesLRRow.style.display       = isNES ? '' : 'none';
    if (dom.lineSearchPanel) dom.lineSearchPanel.style.display = isGD ? '' : 'none';
    // NEAT-only mutation controls: gray them when a fixed-topology algorithm
    // is active. They keep their values so toggling back doesn't lose state.
    const neatOnlyIds = ['mutTopology', 'weightSigma', 'weightResetProb',
                         'addConnProb', 'addNodeProb', 'toggleConnProb',
                         'actMutProb', 'tournamentSize', 'eliteRatio'];
    for (const id of neatOnlyIds) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('disabled-soft', fixedTopology);
    }
  }
  // Reset every app-level cache that's coupled to a specific trainer.
  // Called whenever we throw the trainer away and build a new one
  // (setup change, algorithm change, reset, preset load). Without this
  // the new trainer's HUD inherits "recent improvement" glows from the
  // old trainer (the gen-N improvement marker still points at the old
  // trainer's gen numbers, and the new trainer's gen 0 looks "younger"
  // than the stale marker, so the glow fires inappropriately). Same
  // shape of bug for peak-live-preview and the preview angle cycler.
  function resetTrainerSessionState() {
    app.playbackPhysicsHz = null;
    app.pendulumReplayContext = null;
    app.loadedShowcaseModelId = null;
    app.ppoRunToken = (app.ppoRunToken || 0) + 1;
    app.ppoRun = null;
    app.ppoSignature = null;
    app.dodgeDistill = null; // New run means new weights AND demonstration data.
    // HUD "recent improvement" detection (used by HoF "best last" and
    // the curriculum "global N" glow). _hudPrevBestEver feeds the
    // diff; _hudLastBestImproveGen stamps the gen of the last jump.
    app._hudPrevBestEver = -Infinity;
    app._hudLastBestImproveGen = null;
    // Live-preview "agent peak" tracker -- belongs to the previous
    // trainer's currentBest genome, so a fresh trainer should start
    // with no peak claim.
    app.peakLivePreviewFitness = null;
    app.peakLivePreviewAngle   = null;
    app.peakLivePreviewSunk    = false;
    app._peakOwnerGenome       = null;
    // Preview angle cycler -- the new trainer may have different
    // rolloutsPerAgent / dir settings, so resetting the index keeps
    // the next preview start angle deterministic from index 0.
    app._previewAngleIdx = -1;
  }

  function rebuildTrainerFromUI() {
    if (!app.trainer) return;
    app.training = false;
    app.testing = false;
    resetTrainerSessionState();
    dom.testBtn.classList.remove('active');
    syncSetupObservationCounts();
    const params = readParams();
    app.trainer = T.makeTrainer({
      setupId: app.trainer.setupId,
      seed: resolveSeed(),
      params: params.train,
      mutationParams: params.mut,
    });
    rebuildDisplayState();
    app.simRenderer.clearTrail();
    app.genomeRenderer.invalidate();
  }
  // Enter/leave a diffsim mode. Entering forces the double setup (its display
  // world has the cart/mid/tip nodes the diffsim frames drive) and builds a
  // fresh engine run alongside the facade population trainer. Leaving just
  // drops the run + the CSS class; the following rebuildTrainerFromUI() then
  // rebuilds a normal population trainer.
  function enterDiffsimMode() {
    document.body.classList.add('diffsim-mode');
    // Pin the display/facade to the matching pendulum without cascading a
    // setup-change event (we set the value + the trainer's setupId directly).
    // The rigid-triple modes drive the TRIPLE scene (frames carry n3).
    const wantSetup = /rigid-triple/.test(dom.modeSelect ? dom.modeSelect.value : '')
      ? 'triple' : 'double';
    if (dom.setupSelect) dom.setupSelect.value = wantSetup;
    if (app.trainer) app.trainer.setupId = wantSetup;
    rebuildTrainerFromUI();               // builds cmaes+double facade + showState
    // Preset loading applies scene values after its mode-change event. Defer
    // calibrated controller construction until that full scene is available.
    if(app.loadingPreset){app.diffsimRun=null;return;}
    try { app.diffsimRun = BF.diffsimMode
      ? BF.diffsimMode.create(dom.modeSelect.value, diffsimOptsFromUI()) : null; }
    catch(error){app.diffsimRun=null;app.training=false;app.paused=true;document.getElementById('liveNudgeStatus').textContent=error.message;return;}
    computeDiffsimDisplayScale();
    // Model-based modes are SOLVED (or at least defined) at gen 0 — run one
    // generation immediately so the canvas shows the controller doing its job
    // the moment the mode is entered, instead of a dead scene + 0.000 badges
    // until the user discovers they must press Train ("double LQR is not
    // working" was exactly this). For the swing-up kinds this also runs the
    // first optimizer chunk so the first attempt clip appears; Train continues
    // the optimization.
    if (app.diffsimRun) stepDiffsimGeneration();
  }
  function exitDiffsimMode() {
    document.body.classList.remove('diffsim-mode');
    app.diffsimRun = null;
  }
  // Dodge planner: pin the dodge setup and rebuild — the facade trainer gives
  // the chart/HUD scaffolding; rebuildDisplayState installs the planner as the
  // display policy (gated override at its end).
  function enterDodgePlannerMode() {
    if (dom.setupSelect) dom.setupSelect.value = 'dodge';
    if (app.trainer) app.trainer.setupId = 'dodge';
    rebuildTrainerFromUI();
  }
  // Signing planner: pin chain-trace and rebuild. Two deliberate differences
  // from the dodge path:
  //  1. updateSetupVisibility() is called explicitly. We must NOT dispatch a
  //     'change' on setupSelect (that cascades a full setup change and would
  //     clobber the objective), but chain-trace owns a whole chain params block
  //     + curve row that stay hidden without it — dodge has no such block, which
  //     is why the dodge path gets away with skipping it.
  //  2. The HUD measures the live replay. No synchronous headless benchmark is
  //     needed to start an already-defined controller.
  function enterSigningPlannerMode() {
    if (dom.setupSelect) dom.setupSelect.value = 'chain-trace';
    if (app.trainer) app.trainer.setupId = 'chain-trace';
    if (typeof updateSetupVisibility === 'function') updateSetupVisibility('chain-trace');
    // The live-fitness readout grades against the selected objective; leaving a
    // pendulum/dodge objective selected would make it read garbage.
    if (dom.objectiveSelect && !/^chain_/.test(dom.objectiveSelect.value)) {
      dom.objectiveSelect.value = 'chain_trace';
      if (typeof refreshObjectiveOptions === 'function') refreshObjectiveOptions(false);
    }
    rebuildTrainerFromUI();
  }
  // Epicycle analytic: pin the `epicycle` setup and rebuild. Same two deliberate
  // choices as the signing planner — updateSetupVisibility() is called
  // explicitly (the epicycle shares chain-trace's curve row, which stays hidden
  // otherwise; see the chainCurveRow gate) rather than dispatching a
  // setupSelect 'change' that would clobber the objective, and ONE generation
  // runs immediately because the mode is solved at gen 0 and a user who has to
  // press Train to see any number reads that as "the mode is broken".
  function enterEpicycleAnalyticMode() {
    if (dom.setupSelect) dom.setupSelect.value = 'epicycle';
    if (app.trainer) app.trainer.setupId = 'epicycle';
    if (typeof updateSetupVisibility === 'function') updateSetupVisibility('epicycle');
    // The live-fitness readout grades against the selected objective; leaving a
    // pendulum/dodge objective selected would make it read garbage.
    if (dom.objectiveSelect && !/^chain_/.test(dom.objectiveSelect.value)) {
      dom.objectiveSelect.value = 'chain_trace';
      if (typeof refreshObjectiveOptions === 'function') refreshObjectiveOptions(false);
    }
    rebuildTrainerFromUI();
    if (isEpicycleAnalyticMode()) stepEpicycleAnalyticGeneration();
  }
  dom.modeSelect.addEventListener('change', () => {
    app.pendulumReplayContext=null;
    if(!app.loadingPreset){syncPresetDropdowns('');renderPresetTags('');}
    if(dom.modeSelect.value==='ppo'){
      dom.curriculumOn.checked=false;
      stopCompareTrainer();
    }
    refreshAlgoUI();
    refreshAlgoExplain();
    // Mode-switch hygiene for the SHARED tilt slider. The rigid/spring LQR HOLD
    // controllers can only catch small start tilts (they cap at ~40° — beyond
    // that it's a swing-up, not a hold). Swing-up modes leave the slider parked
    // at 180 (they start from hanging straight down and IGNORE the slider), so
    // switching the Algorithm dropdown swing-up → LQR used to carry 180 straight
    // in: the LQR then capped it and flagged "capped", reading as "LQR complains
    // about the start angle". Loading an LQR *preset* doesn't hit this because
    // resetPresetParamsToDefaults already normalizes the slider — the dropdown
    // switch just never did. Normalize it here so the switch sets up a sane
    // start angle. Only REDUCE an out-of-LQR-range value (never introduce a big
    // tilt), so an intentional in-range LQR tilt (e.g. 30°) is preserved.
    const _newMode = dom.modeSelect.value;
    if (_newMode === 'single-energy-lqr') {
      dom.setupSelect.value = 'single'; dom.cartControlMode.value = 'force';
      if (app.trainer) app.trainer.setupId = 'single';
      updateSetupVisibility('single');
      dom.objectiveSelect.value = 'balance_up';
      refreshObjectiveOptions(false);
    }
    const _lqrHold = _newMode === 'rigid-lqr' || _newMode === 'rigid-triple-lqr' || _newMode === 'diffsim-lqr';
    if (_lqrHold && dom.tiltDeg && parseFloat(dom.tiltDeg.value) > 40) {
      dom.tiltDeg.value = dom.tiltDeg.defaultValue || '20';
      if (typeof refreshTiltUI === 'function') refreshTiltUI(parseFloat(dom.tiltDeg.value));
    }
    if (isDiffsimMode()) { enterDiffsimMode(); return; }
    // If we were in a diffsim mode, tear it down before the normal rebuild.
    if (app.diffsimRun || document.body.classList.contains('diffsim-mode')) {
      exitDiffsimMode();
    }
    if (isDodgePlannerMode()) { enterDodgePlannerMode(); return; }
    if (isSigningPlannerMode()) { enterSigningPlannerMode(); return; }
    if (isEpicycleAnalyticMode()) { enterEpicycleAnalyticMode(); return; }
    if (isDodgeDistillMode()) { enterDodgePlannerMode(); return; }  // same: pin dodge + rebuild
    rebuildTrainerFromUI();
  });
  // Controls that DO map onto the diffsim engine: applying them to the run when
  // the user changes them (on release, not while dragging) is what makes the
  // mode respect the UI. Outside diffsim mode these fire but no-op. This is
  // additive — the population path's own handlers on these elements still run.
  ['gravity', 'cartAccel', 'cmaesHidden', 'tiltDeg', 'curriculumOn',
   'curriculumThreshold', 'curriculumConsec', 'curriculumMaxLevel',
   'curriculumStartFrac'].forEach((id) => {
    const el = dom[id];
    if (el) el.addEventListener('change', () => { if (isDiffsimMode()) refreshDiffsimRunIfActive(); });
  });
  // Color-code the Algorithm dropdown options by their family, so the technique
  // categories are scannable at a glance — the same idea (and palette) as the
  // preset dropdown's presetPrimaryColor: purple = differentiable/exact-gradient,
  // blue = gradient-based (finite-difference), green = strong population methods,
  // amber = educational, teal = swarm, muted = naive. Driven by the optgroup
  // labels so newly-added options inherit their group's colour automatically.
  function colorModeSelectOptions() {
    if (!dom.modeSelect) return;
    const GROUP_COLOR = [
      { re: /differentiable/i, color: '#bd87ff' },
      { re: /model-based/i,    color: '#6ce28a' },
      { re: /gradient-based/i, color: '#6aa9ff' },
      { re: /strong/i,         color: '#6ce28a' },
      { re: /educational/i,    color: '#f5b769' },
      { re: /naive/i,          color: '#8a94ad' },
      { re: /swarm/i,          color: '#4ee0c0' },
    ];
    dom.modeSelect.querySelectorAll('optgroup').forEach((og) => {
      const m = GROUP_COLOR.find((g) => g.re.test(og.label || ''));
      if (m) og.querySelectorAll('option').forEach((o) => { o.style.color = m.color; });
    });
  }
  colorModeSelectOptions();
  // Pre-populate the explainer text so the first toggle of "?" shows the
  // currently-selected algorithm immediately, without waiting for a change.
  refreshAlgoExplain();
  if (dom.neatTopologyPreset) {
    dom.neatTopologyPreset.addEventListener('change', () => {
      updateTopologyHint();
      rebuildTrainerFromUI();
    });
  }
  if (dom.neatInitialHidden) {
    dom.neatInitialHidden.addEventListener('change', () => {
      updateTopologyHint();
      rebuildTrainerFromUI();
    });
  }
  if (dom.neatHiddenActivation) {
    // Changing the activation only affects FUTURE node creations
    // (initial seed for the new trainer's pop + addNode mutations
    // from there on). Existing genomes keep their original
    // activations -- rebuilding the trainer here makes the new
    // activation take effect on the fresh population.
    dom.neatHiddenActivation.addEventListener('change', rebuildTrainerFromUI);
  }
  populateActivationDropdown();
  if (dom.showExperimentalActs) {
    dom.showExperimentalActs.addEventListener('change', populateActivationDropdown);
  }
  // NEAT-CNN hybrid toggles. Turning the master ON auto-flips the dodge
  // observation mode to 'multiscale' (the CNN front-end needs the
  // multi-scale grid as input). Turning it OFF leaves the obs mode
  // where it is -- if the user explicitly set multiscale, they can keep
  // it; if they had topk before turning hybrid on, this means they
  // need to flip back manually. Conservative: don't second-guess
  // explicit prior choices.
  if (dom.useHybridCnn) {
    dom.useHybridCnn.addEventListener('change', () => {
      if (dom.useHybridCnn.checked
          && dom.dodgeObservationMode
          && dom.dodgeObservationMode.value !== 'multiscale') {
        dom.dodgeObservationMode.value = 'multiscale';
        const dodgeSetup = BF.setups.getSetup('dodge');
        if (dodgeSetup && dodgeSetup.setObservationMode) {
          dodgeSetup.setObservationMode('multiscale');
        }
      }
      refreshAlgoUI();
      rebuildTrainerFromUI();
    });
  }
  if (dom.hybridIncludeTopK) {
    dom.hybridIncludeTopK.addEventListener('change', rebuildTrainerFromUI);
  }
  dom.cmaesHidden.addEventListener('change', rebuildTrainerFromUI);
  if (dom.cmaesLayers) {
    dom.cmaesLayers.addEventListener('change', rebuildTrainerFromUI);
  }
  dom.cmaesSigma.addEventListener('change', rebuildTrainerFromUI);
  // Segment count changes the observation dimension → full trainer rebuild
  // (syncSetupObservationCounts inside rebuildTrainerFromUI calls
  // setObservationShape). Material does NOT change obs count, so we keep the
  // population: push the new key into the live trainer params (next rollout's
  // buildWorld picks it up) and refresh just the displayed world.
  // Keep #chainNumActuated's max in lockstep with the segment count (a chain
  // with N segments has N-1 interior joints) and clamp its value down if it now
  // exceeds the max. Called from the segment + actuated handlers and on init.
  function syncChainActuatedMax() {
    if (!dom.chainNumActuated || !dom.chainNumSegments) return;
    const n = parseInt(dom.chainNumSegments.value, 10) || 4;
    const maxK = Math.max(0, n - 1);
    dom.chainNumActuated.max = String(maxK);
    if ((parseInt(dom.chainNumActuated.value, 10) || 0) > maxK) {
      dom.chainNumActuated.value = String(maxK);
    }
  }
  if (dom.chainNumSegments) {
    dom.chainNumSegments.addEventListener('change', () => {
      syncChainActuatedMax();      // keep actuated-joints max ≤ N-1
      rebuildTrainerFromUI();
    });
  }
  if (dom.chainMaterial) {
    dom.chainMaterial.addEventListener('change', () => {
      // Material changes spring stiffness/damping only — observation count
      // is unchanged, so genomes stay valid and we must NOT reset the
      // population. Push the new key into the live trainer params; the next
      // rollout's buildWorld picks it up via resolved('material') in
      // trainer.js (no rebuild). Then refresh just the displayed world.
      // Both statements are guarded together: rebuildDisplayState() reads
      // app.trainer.setupId, so it must not run without a trainer.
      if (!app.trainer || !app.trainer.params) return;
      app.trainer.params.material = dom.chainMaterial.value;
      rebuildDisplayState();
    });
  }
  if (dom.chainCurve) {
    dom.chainCurve.addEventListener('change', () => {
      // Curve change doesn't alter observation count → keep the population;
      // push into live trainer params (next rollout's buildWorld picks it up)
      // and refresh the displayed world.
      if (!app.trainer || !app.trainer.params) return;
      app.trainer.params.curveId = dom.chainCurve.value;
      // ...EXCEPT on the epicycle, where it can. With no explicit epiArms the
      // arm count falls back to curve_fourier's MEASURED per-curve
      // recommendation (circle 1, figure-8 4, signature 8, autograph 12), and
      // the arm count sizes the observation (2 per arm) — so a curve switch
      // there is a genome-dimension change and needs the full rebuild path that
      // re-runs setObservationShape. It also changes the BASIS (open strokes get
      // the even/DCT extension), so the number has to be re-measured.
      if (app.trainer.setupId === 'epicycle') {
        rebuildTrainerFromUI();
        if (isEpicycleAnalyticMode()) stepEpicycleAnalyticGeneration();
        return;
      }
      rebuildDisplayState();
    });
  }
  if (dom.chainNumActuated) {
    // Actuated-joint count changes the policy OUTPUT dimension (actionCount =
    // 1 + k) → genome size changes → full trainer rebuild, exactly like the
    // segment count. (syncSetupObservationCounts inside rebuildTrainerFromUI
    // calls setActionShape, which reads this control.)
    dom.chainNumActuated.addEventListener('change', () => {
      syncChainActuatedMax();
      rebuildTrainerFromUI();
    });
  }
  if (dom.chainTelescope) {
    // Telescoping toggles numSegments extra length actions → genome size
    // changes → full rebuild (same path as the actuated-joint count).
    dom.chainTelescope.addEventListener('change', () => {
      rebuildTrainerFromUI();
    });
  }
  if (dom.chainJointMode) {
    // Torque vs servo only reinterprets the SAME-size joint output → no genome
    // change, so keep the population: push into live trainer params (the next
    // rollout's buildWorld picks up jointControlMode via resolved()) and refresh
    // just the displayed world. Mirrors the chainMaterial handler.
    dom.chainJointMode.addEventListener('change', () => {
      if (!app.trainer || !app.trainer.params) return;
      app.trainer.params.jointControlMode = dom.chainJointMode.value;
      rebuildDisplayState();
    });
  }
  syncChainActuatedMax();  // initialize #chainNumActuated.max from the default segment count
  if (dom.policyTypeSelect) dom.policyTypeSelect.addEventListener('change', () => {
    // Picking a dodge-specific CNN is only meaningful with the matching
    // observation encoding -- the CNN expects exactly the grid layout
    // the setup produces. Auto-flip the dodge observation mode + the
    // setup's observationCount so the trainer rebuild below produces
    // correctly-sized genomes.
    // Gate on the ACTIVE setup: terrain-run also offers 'cnn-grid', and its
    // encoding is carried by the preset stash, not this dropdown — flipping
    // dodge's control from a terrain run would leave dodge on 'grid' the next
    // time the user switches to it.
    const onDodge = dom.setupSelect && dom.setupSelect.value === 'dodge';
    if (onDodge
        && dom.policyTypeSelect.value === 'cnn-grid'
        && dom.dodgeObservationMode
        && dom.dodgeObservationMode.value !== 'grid') {
      dom.dodgeObservationMode.value = 'grid';
      const dodgeSetup = BF.setups.getSetup('dodge');
      if (dodgeSetup && dodgeSetup.setObservationMode) {
        dodgeSetup.setObservationMode('grid');
      }
    } else if (dom.policyTypeSelect.value === 'cnn-multiscale'
        && dom.dodgeObservationMode
        && dom.dodgeObservationMode.value !== 'multiscale') {
      dom.dodgeObservationMode.value = 'multiscale';
      const dodgeSetup = BF.setups.getSetup('dodge');
      if (dodgeSetup && dodgeSetup.setObservationMode) {
        dodgeSetup.setObservationMode('multiscale');
      }
    }
    refreshAlgoUI();
    rebuildTrainerFromUI();
  });
  if (dom.cnn3dVizMode) dom.cnn3dVizMode.addEventListener('change', () => {
    if (dom.cnn3dInsetLabel) {
      dom.cnn3dInsetLabel.textContent = '3D CNN · ' + dom.cnn3dVizMode.value;
    }
  });
  // Legacy: dom.useCNN was the old checkbox; now removed from HTML, so the
  // listener below only attaches if it still exists. Kept for backward
  // compatibility; new flow uses policyTypeSelect.
  if (dom.useCNN) dom.useCNN.addEventListener('change', () => {
    refreshAlgoUI();
    rebuildTrainerFromUI();
  });
  dom.annealingT0.addEventListener('change', rebuildTrainerFromUI);
  dom.annealingCooling.addEventListener('change', rebuildTrainerFromUI);
  dom.ptTmin.addEventListener('change', rebuildTrainerFromUI);
  dom.ptTmax.addEventListener('change', rebuildTrainerFromUI);
  dom.ptSwapInterval.addEventListener('change', rebuildTrainerFromUI);
  // DE F and CR are *live* — no rebuild needed; trainer reads each step.
  dom.deF.addEventListener('change', () => {
    if (app.trainer && app.trainer.de) app.trainer.de.F = parseFloat(dom.deF.value);
  });
  dom.deCR.addEventListener('change', () => {
    if (app.trainer && app.trainer.de) app.trainer.de.CR = parseFloat(dom.deCR.value);
  });
  // Gradient-descent params: ε is *live* (read from state.epsilon each gen);
  // α-init only applies on rebuild because it seeds state.alpha. Same for NES
  // σ (since it's the search distribution scale). NES α (learning rate) is
  // live.
  dom.gdEpsilon.addEventListener('change', () => {
    const eps = parseFloat(dom.gdEpsilon.value);
    if (app.trainer && app.trainer.fdgd) app.trainer.fdgd.epsilon = eps;
    if (app.trainer && app.trainer.spsa) app.trainer.spsa.epsilon = eps;
  });
  dom.gdAlphaInit.addEventListener('change', rebuildTrainerFromUI);
  dom.nesSigma.addEventListener('change', rebuildTrainerFromUI);
  dom.nesLR.addEventListener('change', () => {
    if (app.trainer && app.trainer.nes) app.trainer.nes.learningRate = parseFloat(dom.nesLR.value);
  });
  refreshAlgoUI();
  // Initial per-setup visibility pass so the page comes up with
  // irrelevant rows already hidden (e.g. dodge default doesn't show
  // tilt sliders) rather than waiting for the user to change setups.
  if (dom.setupSelect) {
    updateSetupVisibility(dom.setupSelect.value);
  }

  // Objective select wiring + explain block
  function refreshObjectiveExplain() {
    const obj = BF.objectives.getObjective(dom.objectiveSelect.value);
    const params = {
      targetAngleDeg: parseFloat(dom.targetAngle.value),
      ballSpeedBonus: parseFloat(dom.ballSpeedBonus.value),
      // Surface the dodge reward-shape toggles so describe() can show
      // the right variant text -- noDie branch vs default, lifespan
      // branch vs mixed. Cheap; harmless for objectives that ignore
      // these fields.
      dodgeNoDie:        dom.dodgeNoDie ? dom.dodgeNoDie.checked : true,
      dodgeLifespanMode: dom.dodgeLifespanMode ? dom.dodgeLifespanMode.checked : false,
      dodgeNoDiePenalty: dom.dodgeNoDiePenalty ? parseFloat(dom.dodgeNoDiePenalty.value) : 3,
    };
    dom.objectiveFormula.textContent = obj.formula || '';
    dom.objectiveDesc.textContent = obj.describe ? obj.describe(params) : '';
    dom.targetAngleRow.style.display =
      (obj.requiresParam === 'targetAngleDeg') ? '' : 'none';
    // Ball-speed bonus only applies to ball_in_hole — hide elsewhere to
    // avoid confusion. Other ball objectives (bounce_ball_out, hit_ball_*)
    // already have continuous speed-based reward terms so the bonus
    // would be redundant there.
    if (dom.ballSpeedBonusRow) {
      dom.ballSpeedBonusRow.style.display =
        (obj.id === 'ball_in_hole') ? '' : 'none';
    }
    // Ball-in-hole reward extras (center bonus, bounce penalty, direct
    // shot). Same visibility gate as ballSpeedBonusRow — only meaningful
    // for ball_in_hole, hidden for every other objective.
    if (dom.ballInHoleExtrasBlock) {
      dom.ballInHoleExtrasBlock.style.display =
        (obj.id === 'ball_in_hole') ? '' : 'none';
    }
  }
  dom.objectiveSelect.addEventListener('change', () => {
    refreshObjectiveExplain();
    syncTrainerParams();
  });
  if (dom.objectiveShowAll) {
    dom.objectiveShowAll.addEventListener('change', refreshObjectiveOptions);
  }
  dom.targetAngle.addEventListener('input', refreshObjectiveExplain);
  dom.ballSpeedBonus.addEventListener('input', refreshObjectiveExplain);
  // Wire the new reward-extras toggles. Each toggle reveals its weight
  // slider and re-renders the objective explainer so the formula text
  // reflects the new state.
  if (dom.rewardCenterBonusOn) {
    dom.rewardCenterBonusOn.addEventListener('change', () => {
      if (dom.centerBonusWeightRow) {
        dom.centerBonusWeightRow.style.display = dom.rewardCenterBonusOn.checked ? '' : 'none';
      }
      refreshObjectiveExplain();
      syncTrainerParams();
    });
  }
  if (dom.bouncePenaltyOn) {
    dom.bouncePenaltyOn.addEventListener('change', () => {
      if (dom.bouncePenaltyWeightRow) {
        dom.bouncePenaltyWeightRow.style.display = dom.bouncePenaltyOn.checked ? '' : 'none';
      }
      refreshObjectiveExplain();
      syncTrainerParams();
    });
  }
  if (dom.directShotOnly) {
    dom.directShotOnly.addEventListener('change', () => {
      refreshObjectiveExplain();
      syncTrainerParams();
    });
  }
  if (dom.strikeDirectionRewardOn) {
    dom.strikeDirectionRewardOn.addEventListener('change', () => {
      if (dom.strikeDirectionWeightRow) {
        dom.strikeDirectionWeightRow.style.display = dom.strikeDirectionRewardOn.checked ? '' : 'none';
      }
      refreshObjectiveExplain();
      syncTrainerParams();
    });
  }
  if (dom.centerBonusWeight && dom.centerBonusWeightVal) {
    bindRange(dom.centerBonusWeight, dom.centerBonusWeightVal, v => parseFloat(v).toFixed(1));
  }
  if (dom.bouncePenaltyWeight && dom.bouncePenaltyWeightVal) {
    bindRange(dom.bouncePenaltyWeight, dom.bouncePenaltyWeightVal, v => parseFloat(v).toFixed(2));
  }
  if (dom.strikeDirectionWeight && dom.strikeDirectionWeightVal) {
    bindRange(dom.strikeDirectionWeight, dom.strikeDirectionWeightVal, v => parseFloat(v).toFixed(1));
  }
  refreshObjectiveExplain();
  bindRange(dom.weightSigma, dom.weightSigmaVal);
  bindRange(dom.weightResetProb, dom.weightResetProbVal);
  bindRange(dom.addConnProb, dom.addConnProbVal);
  bindRange(dom.addNodeProb, dom.addNodeProbVal);
  bindRange(dom.toggleConnProb, dom.toggleConnProbVal);
  bindRange(dom.actMutProb, dom.actMutProbVal);
  bindRange(dom.complexityPenalty, dom.complexityPenaltyVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.maxFunctionsPerNode, dom.maxFunctionsPerNodeVal, v => String(parseInt(v, 10)));
  bindRange(dom.mixturePenalty, dom.mixturePenaltyVal, v => parseFloat(v).toFixed(3));
  function refreshMixtureAxisUI() {
    if (!dom.mixtureRegime) return;
    const regime = dom.mixtureRegime.value;
    const palette = dom.actPalette ? dom.actPalette.value : 'legacy';
    // pure+mixed = full-freedom corner: mutability not applicable.
    if (dom.actMutableRow) {
      dom.actMutableRow.style.display = (regime === 'pure+mixed') ? 'none' : '';
    }
    // pure+single: nothing to mutate to -> disable mutability.
    if (dom.actMutable) {
      dom.actMutable.disabled = (regime === 'pure' && palette === 'single');
    }
  }
  if (dom.mixtureRegime) dom.mixtureRegime.addEventListener('change', refreshMixtureAxisUI);
  if (dom.actPalette) dom.actPalette.addEventListener('change', refreshMixtureAxisUI);
  refreshMixtureAxisUI();
  bindRange(dom.gravity, dom.gravityVal, v => parseInt(v, 10) + ' px/s²');
  bindRange(dom.damping, dom.dampingVal, v => parseFloat(v).toFixed(4));
  bindRange(dom.cartAccel, dom.cartAccelVal, v => parseInt(v, 10));
  bindRange(dom.cartMaxSpeed, dom.cartMaxSpeedVal, v => parseInt(v, 10));
  bindRange(dom.cartDrag, dom.cartDragVal, v => parseFloat(v).toFixed(1));
  bindRange(dom.uprightAssist, dom.uprightAssistVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.jointDamping, dom.jointDampingVal, v => parseFloat(v).toFixed(1));
  bindRange(dom.pushStrength, dom.pushStrengthVal, v => parseInt(v, 10));
  bindRange(dom.pushDuration, dom.pushDurationVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.pushSmoothing, dom.pushSmoothingVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.pushIntervalMin, dom.pushIntervalMinVal, v => parseFloat(v).toFixed(1));
  bindRange(dom.pushIntervalMax, dom.pushIntervalMaxVal, v => parseFloat(v).toFixed(1));
  bindRange(dom.curriculumStartFrac, dom.curriculumStartFracVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.curriculumRamp, dom.curriculumRampVal, v => parseFloat(v).toFixed(3));
  bindRange(dom.curriculumThreshold, dom.curriculumThresholdVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.curriculumConsec, dom.curriculumConsecVal, v => String(parseInt(v, 10)));
  bindRange(dom.curriculumMaxLevel, dom.curriculumMaxLevelVal, v => String(parseInt(v, 10)));
  bindRange(dom.autoStopGens, dom.autoStopGensVal, v => String(parseInt(v, 10)));
  bindRange(dom.autoStopGood, dom.autoStopGoodVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.autoStopTol, dom.autoStopTolVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.hallOfFameSize, dom.hallOfFameSizeVal, v => String(parseInt(v, 10)));
  bindRange(dom.autoRollbackThreshold, dom.autoRollbackThresholdVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.autoRollbackGens, dom.autoRollbackGensVal, v => String(parseInt(v, 10)));
  bindRange(dom.annealAfterGens, dom.annealAfterGensVal, v => String(parseInt(v, 10)));
  bindRange(dom.annealFactor, dom.annealFactorVal, v => parseFloat(v).toFixed(2));
  bindRange(dom.stuckEscapeAfterGens, dom.stuckEscapeAfterGensVal, v => String(parseInt(v, 10)));
  bindRange(dom.stuckEscapeFactor, dom.stuckEscapeFactorVal, v => parseFloat(v).toFixed(1));

  dom.popSize.addEventListener('change', syncTrainerParams);
  dom.mutTopology.addEventListener('change', syncTrainerParams);
  dom.useDisturb.addEventListener('change', syncTrainerParams);
  // Curriculum knobs are LIVE-adjustable: moving the level-up threshold / consec /
  // max-level mid-run pushes into the running trainer (the advance gate re-reads
  // trainer.params.curriculum* each gen), and recreates the diffsim run so its
  // native curriculum picks up the new value too. This applies slider changes
  // immediately without rebuilding or reloading the selected preset.
  // markPresetCustom already fires first via the drift listeners.
  [dom.curriculumThreshold, dom.curriculumConsec, dom.curriculumMaxLevel,
   dom.curriculumStartFrac, dom.curriculumRamp].forEach((el) => {
    if (!el) return;
    el.addEventListener('change', () => {
      syncTrainerParams();
      if (typeof refreshDiffsimRunIfActive === 'function') refreshDiffsimRunIfActive();
    });
  });
  dom.cartControlMode.addEventListener('change', () => {
    if (isSingleSwingupMode()) dom.cartControlMode.value='force';
    syncTrainerParams();
    updateCartAccelHint();
  });
  dom.wallsOn.addEventListener('change', () => {
    syncTrainerParams();
    rebuildDisplayState();
  });
  [dom.gravity,dom.damping,dom.cartAccel,dom.cartDrag].forEach(el=>{
    if(el) el.addEventListener('change',()=>{if(isSingleSwingupMode())rebuildDisplayState();});
  });
  dom.smoothnessOn.addEventListener('change', () => {
    syncTrainerParams();
    dom.smoothnessPenalty.classList.toggle('disabled-soft', !dom.smoothnessOn.checked);
  });
  dom.smoothnessPenalty.classList.toggle('disabled-soft', !dom.smoothnessOn.checked);

  // Adversarial-env toggle. Show/hide the sub-controls; rebuild trainer
  // when toggling so the env pop is created (or discarded) correctly.
  function refreshAdversarialUI() {
    const on = dom.adversarialOn.checked;
    dom.adversarialEnvPopSizeRow.style.display = on ? '' : 'none';
    dom.adversarialMutationSigmaRow.style.display = on ? '' : 'none';
    dom.adversarialHint.style.display = on ? '' : 'none';
  }
  refreshAdversarialUI();
  dom.adversarialOn.addEventListener('change', () => {
    refreshAdversarialUI();
    if (app.trainer) {
      app.trainer.params.adversarialOn = dom.adversarialOn.checked;
      // Toggling off: drop the env pop so it rebuilds fresh on next toggle-on.
      if (!dom.adversarialOn.checked) app.trainer.envPop = null;
    }
  });
  // Pop-size and mutation σ are live-applied to the existing env pop on
  // change (no full rebuild — keep the in-flight evolved population).
  dom.adversarialEnvPopSize.addEventListener('change', () => {
    if (app.trainer) app.trainer.params.adversarialEnvPopSize = parseInt(dom.adversarialEnvPopSize.value, 10);
    // Don't try to live-resize the pop; the user can toggle off/on to rebuild.
  });
  dom.adversarialMutationSigma.addEventListener('change', () => {
    const s = parseFloat(dom.adversarialMutationSigma.value);
    if (app.trainer) {
      app.trainer.params.adversarialMutationSigma = s;
      if (app.trainer.envPop) app.trainer.envPop.mutationSigma = s;
    }
  });
  // Track which setups we've auto-scaffolded curriculum for so the
  // golf-specific ramp seeding doesn't fire repeatedly when the user
  // toggles curriculum off and on again, or switches between setups.
  // Distinct from app._curriculumEverEnabled (a single bit) because
  // golf scaffolding is per-setup-id: scaffolding for putt should
  // NOT prevent scaffolding for golf when the user switches setups.
  if (!app._curriculumScaffoldedSetups) app._curriculumScaffoldedSetups = new Set();

  // Auto-seed golf-family curriculum ramps the FIRST time curriculum is
  // active for a given golf-family setup. Tough starts are pathologically
  // bad on sparse-reward tasks (golf, putt), so when the user enables
  // curriculum we want them in "easy → hard" mode without manual setup.
  // Adds at most:
  //   holeWidth: 500 (huge) → user's slider value (their hard target)
  //   ballSpawnX: cart start x (under bob) → user's slider value
  // Skips either ramp if the user already has a manual spec for it,
  // or if their slider target isn't actually harder than the easy
  // baseline. Idempotent: scaffolds once per setup-id per session.
  function maybeScaffoldGolfCurriculum() {
    if (!dom.curriculumOn.checked) return;
    if (!app.trainer) return;
    const setupId = app.trainer.setupId;
    const isGolf = setupId === 'golf' || setupId === 'golf-challenge' || setupId === 'putt';
    if (!isGolf) return;
    if (app._curriculumScaffoldedSetups.has(setupId)) return;
    app._curriculumScaffoldedSetups.add(setupId);

    const hasHoleWidthSpec = app.curriculumSpecs.some(s => s.paramKey === 'holeWidth');
    const hasBallSpawnSpec = app.curriculumSpecs.some(s => s.paramKey === 'ballSpawnX');
    const cartStartX = setupId === 'putt' ? -150 : -200;
    const userHoleWidth = parseFloat(dom.holeWidth.value);
    const userBallSpawnX = parseFloat(dom.ballSpawnX.value);
    const defaultSteps = parseInt((dom.curriculumMaxLevel && dom.curriculumMaxLevel.value) || '10', 10);

    let added = false;
    // holeWidth: only add when target is meaningfully tighter than the easy
    // 500 (otherwise the ramp is a no-op and just clutters the list).
    if (!hasHoleWidthSpec && userHoleWidth < 400) {
      app.curriculumSpecs.push({
        paramKey: 'holeWidth',
        from: 500,
        to: userHoleWidth,
        mode: 'multiplicative',
        steps: defaultSteps,
      });
      added = true;
    }
    // ballSpawnX: only add when target is meaningfully far from bob's
    // resting position. 50px is the rough threshold below which the bob
    // already touches the ball at rest, so curriculum on it is pointless.
    if (!hasBallSpawnSpec && Math.abs(userBallSpawnX - cartStartX) > 50) {
      app.curriculumSpecs.push({
        paramKey: 'ballSpawnX',
        from: cartStartX,
        to: userBallSpawnX,
        mode: 'additive',
        steps: defaultSteps,
      });
      added = true;
    }
    if (added) {
      renderCurriculumSpecs();
      syncTrainerParams();
    }
  }

  dom.curriculumOn.addEventListener('change', () => {
    // Auto-seed a default gravity spec the FIRST time the user turns
    // curriculum on. Replaces the legacy hard-coded gravity ramp; the
    // user can delete it like any other spec, or modify its from/to.
    // Subsequent toggles don't re-seed (so disabling and re-enabling
    // doesn't blow away user-customized specs).
    if (dom.curriculumOn.checked && !app._curriculumEverEnabled) {
      app._curriculumEverEnabled = true;
      if (app.curriculumSpecs.length === 0) {
        const gravTarget = parseFloat(dom.gravity.value);
        const defaultSteps = parseInt((dom.curriculumMaxLevel && dom.curriculumMaxLevel.value) || '10', 10);
        app.curriculumSpecs.push({
          paramKey: 'gravity',
          from: Math.max(20, gravTarget * 0.18),
          to:   gravTarget,
          mode: 'multiplicative',
          steps: defaultSteps,
        });
        renderCurriculumSpecs();
      }
    }
    // Golf-family auto-scaffolding fires whenever curriculum is on AND
    // the active setup hasn't been scaffolded yet. Independent from the
    // gravity-seeding above (they target different setup classes).
    maybeScaffoldGolfCurriculum();
    syncTrainerParams();
    if (app.trainer) BF.trainer.curriculumReset(app.trainer);
    refreshCurriculumUI();
    refreshAllSliderOverlays();
    refreshCurriculumTopbarBtn();
  });
  // Topbar curriculum button: mirrors the (now-hidden) curriculumOn
  // checkbox so users can flip the master toggle without having to dig
  // into the controls panel.
  //
  // Adjacent "List" button toggles the floating ramp list anchored to
  // the sim viewer. The list button only appears while curriculum is
  // ON (it's meaningless otherwise — there's nothing to list). The
  // user's preferred visibility is remembered in app._curriculumListVisible
  // so toggling curriculum off/on doesn't drop their setting; default
  // is "on" so first-time curriculum users see the list immediately.
  if (typeof app._curriculumListVisible === 'undefined') {
    app._curriculumListVisible = true;
  }
  function refreshCurriculumTopbarBtn() {
    if (!dom.curriculumTopbarBtn) return;
    const on = dom.curriculumOn.checked;
    dom.curriculumTopbarBtn.textContent = dom.modeSelect.value==='ppo' ? 'PPO: fixed task' : on ? 'Curriculum: on' : 'Curriculum: off';
    dom.curriculumTopbarBtn.classList.toggle('curriculum-active', on);
    // List button: visible only when curriculum is on; pressed-state
    // mirrors the floating list's actual visibility.
    if (dom.curriculumListBtn) {
      dom.curriculumListBtn.classList.toggle('hidden', !on);
      const listOn = on && !!app._curriculumListVisible;
      dom.curriculumListBtn.classList.toggle('curriculum-active', listOn);
      dom.curriculumListBtn.textContent = listOn ? 'List: shown' : 'List: hidden';
    }
    // Floating overlay visibility = curriculum-on AND user toggle on.
    if (dom.curriculumListFloating) {
      const showFloat = on && !!app._curriculumListVisible;
      dom.curriculumListFloating.classList.toggle('hidden', !showFloat);
    }
  }
  refreshCurriculumTopbarBtn();
  if (dom.curriculumTopbarBtn) {
    dom.curriculumTopbarBtn.addEventListener('click', () => {
      dom.curriculumOn.checked = !dom.curriculumOn.checked;
      dom.curriculumOn.dispatchEvent(new Event('change'));
    });
  }
  if (dom.curriculumListBtn) {
    dom.curriculumListBtn.addEventListener('click', () => {
      app._curriculumListVisible = !app._curriculumListVisible;
      refreshCurriculumTopbarBtn();
    });
  }
  dom.curriculumStartFrac.addEventListener('change', () => {
    if (app.trainer) BF.trainer.curriculumReset(app.trainer);
  });
  dom.pushTarget.addEventListener('change', syncTrainerParams);
  dom.autoStopOn.addEventListener('change', () => {
    syncTrainerParams();
    const on = dom.autoStopOn.checked;
    dom.autoStopGensRow.style.display = on ? '' : 'none';
    dom.autoStopGoodRow.style.display = on ? '' : 'none';
    dom.autoStopTolRow.style.display = on ? '' : 'none';
  });
  dom.autoRollbackOn.addEventListener('change', () => {
    syncTrainerParams();
    const on = dom.autoRollbackOn.checked;
    dom.autoRollbackThresholdRow.style.display = on ? '' : 'none';
    dom.autoRollbackGensRow.style.display = on ? '' : 'none';
  });
  dom.annealMutationOn.addEventListener('change', () => {
    syncTrainerParams();
    const on = dom.annealMutationOn.checked;
    dom.annealAfterGensRow.style.display = on ? '' : 'none';
    dom.annealFactorRow.style.display = on ? '' : 'none';
  });
  dom.stuckEscapeOn.addEventListener('change', () => {
    syncTrainerParams();
    const on = dom.stuckEscapeOn.checked;
    dom.stuckEscapeAfterGensRow.style.display = on ? '' : 'none';
    dom.stuckEscapeFactorRow.style.display = on ? '' : 'none';
  });
  dom.stuckEscapeAfterGens.addEventListener('change', syncTrainerParams);
  dom.stuckEscapeFactor.addEventListener('change', syncTrainerParams);
  // Hall of Fame size is a live value — picked up next gen via syncTrainerParams.
  dom.hallOfFameSize.addEventListener('change', syncTrainerParams);
  // ---------- Per-slider curriculum overlay ----------
  // Mapping from param key to the slider's element id. Sliders not listed
  // here can still be ramped via the spec list editor (e.g. holeWidth /
  // holeCenter, which don't have direct sliders).
  const CURRICULUM_SLIDER_BINDINGS = {
    gravity:         'gravity',
    damping:         'damping',
    cartAccel:       'cartAccel',
    cartMaxSpeed:    'cartMaxSpeed',
    cartDrag:        'cartDrag',
    uprightAssist:   'uprightAssist',
    jointDamping:    'jointDamping',
    pushStrength:    'pushStrength',
    // Initial-tilt magnitude (degrees). Reverse-curriculum example:
    //   from=5, to=180  -- start near-balance, ramp to full swing-up.
    // Forward-curriculum is also valid (e.g. anneal the start range
    // down to 0 to lock in a polished upright balance policy).
    startTiltDeg:    'tiltDeg',
    // Tilt spread (deg). Default 0 = single-pose training. Curriculum
    // can ramp 0 -> 30 to open the fan gradually after the policy
    // masters the central pose.
    startTiltSpreadDeg: 'tiltSpreadDeg',
    ballSpawnX:      'ballSpawnX',
    ballSpawnY:      'ballSpawnY',
    ballSpawnDelay:  'ballSpawnDelay',
    ballDriftSpeed:  'ballDriftSpeed',
    ballMass:        'ballMass',
    ballRadius:      'ballRadius',
    ballRestitution: 'ballRestitution',
    // Golf-only knobs — sliders only visible on golf/putt setups but
    // still curriculum-able. Lets the user ramp hole size (start
    // forgiving, shrink over training) or hole center (moving target).
    holeWidth:       'holeWidth',
    holeCenter:      'holeCenter',
    // Reward-shaping weights (ball_in_hole). Each slider lives inside
    // the ballInHoleExtrasBlock; the per-slider "+" attaches like any
    // other curriculum-able knob. Useful patterns:
    //   strikeDirectionWeight 20 -> 0 (start with strong direction
    //     shaping, taper as the policy learns to aim)
    //   bouncePenaltyWeight   0  -> 2 (start tolerant, harden as the
    //     policy gets to direct shots)
    //   centerBonusWeight     0  -> 12 (turn up center-precision as
    //     the hole narrows)
    centerBonusWeight:     'centerBonusWeight',
    bouncePenaltyWeight:   'bouncePenaltyWeight',
    strikeDirectionWeight: 'strikeDirectionWeight',
    ballSpeedBonus:        'ballSpeedBonus',
    // Dodge bullet-hell knobs -- the "+" button on each slider lets
    // the user ramp difficulty over the curriculum (start with slow
    // sparse bullets, escalate to fast dense waves). All five are
    // already registered in CURRICULUM_KNOBS on the trainer side.
    dodgeSpawnRate:        'dodgeSpawnRate',
    dodgeBulletSpeed:      'dodgeBulletSpeed',
    dodgeBulletRadius:     'dodgeBulletRadius',
    dodgeLeadTime:         'dodgeLeadTime',
    dodgeBulletsPerWave:   'dodgeBulletsPerWave',
    // Moving-hole generalization: ramp the ±jitter of the hole position (start
    // with a fixed hole, widen it as the policy learns to read the target).
    holeCenterJitterMag:   'holeCenterJitterMag',
  };

  // For each curriculum-able slider, wrap it in a positioned span and
  // inject overlay decorations + a toggle button. Done once at boot.
  function attachAllCurriculumOverlays() {
    if (app._currOverlays) return;
    app._currOverlays = {};
    for (const paramKey in CURRICULUM_SLIDER_BINDINGS) {
      const sid = CURRICULUM_SLIDER_BINDINGS[paramKey];
      const slider = document.getElementById(sid);
      if (!slider) continue;
      const row = slider.closest('.control-row');
      if (!row) continue;
      // Wrap.
      const wrap = document.createElement('span');
      wrap.className = 'curr-slider-wrap';
      slider.parentNode.insertBefore(wrap, slider);
      wrap.appendChild(slider);
      // Overlay children. Three position markers (from / to / now) plus a
      // gradient band between from and to and a direction arrow above the
      // band's `to` end. All hidden until a curriculum spec is active for
      // this slider.
      const band = document.createElement('div'); band.className = 'curr-band';
      const fromDot = document.createElement('div'); fromDot.className = 'curr-from';
      const toDot   = document.createElement('div'); toDot.className   = 'curr-to';
      const nowDot  = document.createElement('div'); nowDot.className  = 'curr-now';
      const arrow = document.createElement('div'); arrow.className = 'curr-arrowhead right';
      band.style.display = 'none';
      fromDot.style.display = 'none';
      toDot.style.display = 'none';
      nowDot.style.display = 'none';
      arrow.style.display = 'none';
      wrap.appendChild(band);
      wrap.appendChild(arrow);
      wrap.appendChild(fromDot);
      wrap.appendChild(toDot);
      wrap.appendChild(nowDot);
      // Toggle button injected at the END of the row (after the value span).
      const btn = document.createElement('button');
      btn.className = 'curr-toggle';
      btn.dataset.paramKey = paramKey;
      btn.type = 'button';
      btn.textContent = '+';
      btn.title = 'Add curriculum ramp for this parameter';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onCurriculumToggleClicked(paramKey, btn, slider);
      });
      row.appendChild(btn);
      app._currOverlays[paramKey] = {
        row, slider, wrap, band, fromDot, toDot, nowDot, arrow, btn,
      };
      // Drag handlers for from/to. mousedown captures which handle the
      // user grabbed; document-level mousemove updates the spec value
      // until mouseup releases. The handle's value updates live (so
      // band, arrow, and slider value column all track the cursor).
      attachDragHandle(fromDot, paramKey, 'from');
      attachDragHandle(toDot,   paramKey, 'to');
      // Live orb tracking: when the user drags the (hidden-thumb)
      // native slider with no spec active, the orb is the only
      // visible position indicator. Hook the input event so the
      // orb follows in real time during the drag.
      slider.addEventListener('input', () => {
        refreshOneSliderOverlay(paramKey);
      });
    }
    // ResizeObserver across all curriculum-able sliders: when the
    // panel resizes (e.g. window resize, layout change), invalidate
    // each overlay's cached width so the next refresh recomputes the
    // orb's pixel position. Using a single shared observer means we
    // only allocate one ResizeObserver instance regardless of how
    // many sliders we have. Falls back gracefully on browsers without
    // ResizeObserver — they get a window-resize listener instead.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        for (const k in app._currOverlays) {
          const ov = app._currOverlays[k];
          ov.cachedSliderW = 0;
          ov._cacheDirty = true;
        }
      });
      for (const k in app._currOverlays) ro.observe(app._currOverlays[k].slider);
    } else {
      window.addEventListener('resize', () => {
        for (const k in app._currOverlays) {
          const ov = app._currOverlays[k];
          ov.cachedSliderW = 0;
          ov._cacheDirty = true;
        }
      });
    }
  }
  // Attach a drag handler to a from / to marker on a curriculum slider.
  // Computes the slider's bounding box on each move so a window resize
  // mid-drag can't desync the cursor from the value.
  function attachDragHandle(dot, paramKey, edge) {
    let active = false;
    dot.addEventListener('mousedown', (e) => {
      const o = app._currOverlays[paramKey];
      if (!o) return;
      const spec = (app.curriculumSpecs || []).find(s => s.paramKey === paramKey);
      if (!spec) return;
      active = true;
      dot.classList.add('dragging');
      e.preventDefault();
      e.stopPropagation();
      const onMove = (ev) => {
        if (!active) return;
        const rect = o.slider.getBoundingClientRect();
        const min = parseFloat(o.slider.min);
        const max = parseFloat(o.slider.max);
        const step = parseFloat(o.slider.step) || 0;
        const range = max - min;
        if (!isFinite(range) || range <= 0 || rect.width <= 0) return;
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        let value = min + pct * range;
        if (step > 0) value = Math.round(value / step) * step;
        if (edge === 'from') spec.from = value;
        else                 spec.to   = value;
        renderCurriculumSpecs();
        refreshAllSliderOverlays();
        syncTrainerParams();
      };
      const onUp = () => {
        active = false;
        dot.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Recompute the overlay state for every attached slider. Cheap (~10
  // sliders × a few DOM property writes each); called per render frame
  // for live current-value-dot animation, and on any spec change.
  function refreshAllSliderOverlays() {
    if (!app._currOverlays) return;
    for (const paramKey in app._currOverlays) refreshOneSliderOverlay(paramKey);
  }
  // Pixel-precise position for the purple orb so it visually lines up
  // with where the (now-hidden) native thumb would render. Browsers
  // inset the thumb by half its width on each side, so the thumb's
  // CENTER travels in the range [thumbW/2, sliderW - thumbW/2] as the
  // value goes from min to max — not [0, sliderW].
  //
  // Performance: reading o.slider.offsetWidth forces a synchronous
  // layout flush. Doing that on 11 sliders × 60Hz triggers 660 layout
  // reflows per second and visibly hitches the rest of the UI. We
  // cache the width on `o.cachedSliderW` and invalidate via a
  // ResizeObserver per wrap (set up at attach time) — so the
  // expensive read happens only when the panel actually resizes.
  const ORB_THUMB_INSET = 6; // half of the 12px thumb width
  function setOrbPixelLeft(o, value) {
    const min = parseFloat(o.slider.min);
    const max = parseFloat(o.slider.max);
    const range = max - min;
    if (!isFinite(range) || range <= 0) return;
    const pct = Math.max(0, Math.min(1, (value - min) / range));
    if (!o.cachedSliderW || o.cachedSliderW <= 0) {
      o.cachedSliderW = o.slider.offsetWidth;
    }
    const W = o.cachedSliderW;
    if (W <= 0) return;
    const usable = Math.max(0, W - 2 * ORB_THUMB_INSET);
    const x = ORB_THUMB_INSET + pct * usable;
    o.nowDot.style.left = x + 'px';
  }

  function refreshOneSliderOverlay(paramKey) {
    const o = app._currOverlays[paramKey];
    if (!o) return;
    const onCurr = dom.curriculumOn.checked;
    const spec = (app.curriculumSpecs || []).find(s => s.paramKey === paramKey);
    // Performance: bail out early if nothing relevant has changed
    // since the last refresh. refreshAllSliderOverlays is called from
    // the per-frame render hook (60Hz × 11 overlays = 660 calls/sec)
    // — without this guard, we'd re-write the same DOM properties to
    // the same values every frame, plus layout-flush via offsetWidth
    // reads, and the panel ends up visibly hitching.
    //
    // Signature covers everything that affects what we render:
    // curriculum on/off, spec from/to/mode/steps, the live applied
    // value (which drives orb position), training mode (drives
    // training-mode class), and a cache-bust flag set by ResizeObserver
    // when the panel resizes (we need to recompute pixel positions).
    let appliedValue;
    if (onCurr && spec) {
      // Use appliedCurriculumParam so this overlay matches the
      // trainer's phase-aware logic exactly: in phase 1 (gravity
      // still ramping) the startTiltDeg spec sits at `from`, not at
      // `lvl / specSteps * to`. Previously this fell through the old
      // pre-phase formula and the slider's "now" indicator always
      // showed the destination value during phase 1 -- user reported
      // "now it's just the final value always".
      const tp = app.trainer ? app.trainer.params : null;
      if (tp) {
        appliedValue = appliedCurriculumParam(tp, paramKey);
        if (appliedValue == null) appliedValue = parseFloat(o.slider.value);
      } else {
        appliedValue = parseFloat(o.slider.value);
      }
    } else {
      appliedValue = parseFloat(o.slider.value);
    }
    const sig = onCurr + '|' +
                (spec ? `${spec.from},${spec.to},${spec.mode},${spec.steps || 0}` : '-') + '|' +
                appliedValue + '|' +
                (app.training ? '1' : '0');
    if (o._lastSig === sig && !o._cacheDirty) return;
    o._lastSig = sig;
    o._cacheDirty = false;
    // Helper: clear the value-column override + reset the toggle btn
    // back to the inactive "+" state. Used by both off-paths below.
    function resetTogglesAndValueCol() {
      if (o.wrap.classList.contains('has-spec') &&
          o.slider._valueEl && typeof o.slider._fmt === 'function') {
        o.slider._valueEl.textContent = o.slider._fmt(o.slider.value);
      }
      o.wrap.classList.remove('has-spec');
      o.wrap.classList.remove('training-mode');
      o.btn.classList.remove('active');
      o.btn.textContent = '+';
      o.btn.title = 'Add curriculum ramp for this parameter';
    }
    // CASE 1 — curriculum master is OFF. The orb still shows as the
    // visible thumb (the native thumb is unconditionally hidden on
    // .curr-slider-wrap via CSS), positioned at the slider's current
    // value. No band / from / to / arrow overlays. The .curr-on class
    // is removed so the + curriculum toggle button hides (it's only
    // useful when curriculum is on) and the row lays out identically
    // to a non-curriculum row.
    if (!onCurr) {
      o.band.style.display = 'none';
      o.fromDot.style.display = 'none';
      o.toDot.style.display = 'none';
      o.arrow.style.display = 'none';
      o.nowDot.style.display = '';
      setOrbPixelLeft(o, appliedValue);  // = slider.value when no spec
      o.wrap.classList.remove('curr-on');
      resetTogglesAndValueCol();
      return;
    }
    // From here on, curriculum is ON. The .curr-on class is the
    // semantic flag the rest of the system reads: it controls + button
    // visibility (CSS rule hides the toggle when .curr-on is absent
    // on the wrap) and is the user's "curriculum is in edit mode" cue.
    // The native thumb is hidden regardless of .curr-on — that's a
    // permanent property of curriculum-able sliders so the orb is
    // always the visible thumb.
    o.wrap.classList.add('curr-on');
    // CASE 2 — curriculum on, but this slider has no spec yet. The
    // orb stands in for the native thumb, positioned at the slider's
    // current value. Drag still works because pointer-events:none on
    // the orb passes clicks through to the slider track. This is the
    // case the user reported as "shifted down" — the native thumb
    // (visually offset against the label baseline) is now replaced
    // by the centered orb.
    if (!spec) {
      o.band.style.display = 'none';
      o.fromDot.style.display = 'none';
      o.toDot.style.display = 'none';
      o.arrow.style.display = 'none';
      o.nowDot.style.display = '';
      setOrbPixelLeft(o, appliedValue);  // = slider.value when no spec
      resetTogglesAndValueCol();
      return;
    }
    // Spec is active for this slider: hide the native blue thumb and
    // disable interaction (the from/to dots carry the visual meaning).
    o.wrap.classList.add('has-spec');
    const min = parseFloat(o.slider.min);
    const max = parseFloat(o.slider.max);
    const range = max - min;
    if (!isFinite(range) || range <= 0) return;
    const fromPct = Math.max(0, Math.min(100, ((spec.from - min) / range) * 100));
    const toPct   = Math.max(0, Math.min(100, ((spec.to   - min) / range) * 100));
    const left = Math.min(fromPct, toPct);
    const right = Math.max(fromPct, toPct);
    // Band gradient: ALWAYS blue (left, smaller value) → red (right,
    // larger value) in pixel space. Color is by VALUE MAGNITUDE, not by
    // from/to identity, so reversing the ramp doesn't flip the colors.
    // The arrow direction (below) still follows from→to so the user
    // sees the easy→hard travel direction.
    o.band.style.display = '';
    o.band.style.left = left + '%';
    o.band.style.width = Math.max(2, right - left) + '%';
    // Determine which end of the range each dot represents (by
    // magnitude). The dot at the smaller value gets .is-low (blue),
    // the dot at the larger value gets .is-high (red). Equal values
    // (degenerate single-point ramp) → both blue (arbitrary).
    const fromIsLow = spec.from <= spec.to;
    o.fromDot.style.display = '';
    o.fromDot.style.left = fromPct + '%';
    o.fromDot.classList.toggle('is-low',  fromIsLow);
    o.fromDot.classList.toggle('is-high', !fromIsLow);
    o.toDot.style.display = '';
    o.toDot.style.left = toPct + '%';
    o.toDot.classList.toggle('is-low',  !fromIsLow);
    o.toDot.classList.toggle('is-high', fromIsLow);
    // Arrowhead — anchored at the to-end of the band, pointing in the
    // direction of from→to travel. Color matches the destination dot
    // (right → red, left → blue) so the arrow visually "lands" on
    // the same color it points to.
    const isForward = fromPct <= toPct;
    o.arrow.style.display = '';
    o.arrow.style.left = toPct + '%';
    o.arrow.classList.toggle('right', isForward);
    o.arrow.classList.toggle('left', !isForward);
    // Toggle button shows mode + active state.
    o.btn.classList.add('active');
    o.btn.textContent = spec.mode === 'multiplicative' ? '×' : '+';
    o.btn.title = `${paramKey}: ${spec.from.toFixed(2)} → ${spec.to.toFixed(2)} ` +
                  `(${spec.mode}). Click to edit.`;
    // Current applied dot (purple) — always visible while a spec is
    // active. Position is the level-applied value (which equals `from`
    // at level=0). The applied value was already computed at the top
    // of the function for the early-bail signature; reuse it here.
    o.nowDot.style.display = '';
    setOrbPixelLeft(o, appliedValue);
    // Mirror the curriculum range (from → to) into the slider's value
    // column when a spec is active, so the user sees "this slider is a
    // ramp from X to Y" at a glance — distinct from a plain slider
    // showing a single current value. The orb on the slider track
    // shows the live applied position; the text shows the planned
    // range. We dedupe trailing unit suffixes (e.g. " px/s²") shared
    // between from and to so the column reads "162 → 900 px/s²"
    // rather than the more verbose "162 px/s² → 900 px/s²".
    if (o.slider._valueEl && typeof o.slider._fmt === 'function') {
      // While training is active, show only the LIVE applied value
      // (e.g. "162 px/s²"), not the from→to range. The user wants to
      // know "what is the trainer using right now". The from/to range
      // is meaningful in edit mode (paused / idle) when the user is
      // configuring the spec; once training is running, it's noise —
      // the orb position on the slider already communicates the live
      // location within the range.
      if (app.training) {
        o.slider._valueEl.textContent = o.slider._fmt(appliedValue);
      } else {
        o.slider._valueEl.textContent = formatRangeText(o.slider._fmt, spec.from, spec.to);
      }
    }
    // Training mode: shrink from/to + grow `now` so the moving purple
    // dot is the focal point during a run. Idle / paused (edit) mode
    // expands from/to back to drag-handle size for easy range setting,
    // and shrinks `now` so it doesn't dominate.
    o.wrap.classList.toggle('training-mode', !!app.training);
  }

  // Toggle handler: if no spec exists for this param, add one with a
  // sensible default range. If a spec exists, open the floating popup
  // for editing or deletion. Auto-enables curriculum master if needed.
  function onCurriculumToggleClicked(paramKey, anchor, slider) {
    if (!dom.curriculumOn.checked) {
      dom.curriculumOn.checked = true;
      app._curriculumEverEnabled = true;
      refreshCurriculumUI();
    }
    const idx = app.curriculumSpecs.findIndex(s => s.paramKey === paramKey);
    if (idx >= 0) {
      showSpecPopup(paramKey, anchor);
      return;
    }
    // No spec yet — seed a sensible default. For positive scales, default
    // to multiplicative half→current. For 0-anchored or signed scales,
    // default to additive min→current.
    const cur = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    let from, mode;
    if (min < 0 || cur < 0.01) {
      from = min + (cur - min) * 0.3;
      mode = 'additive';
    } else {
      from = Math.max(min, cur * 0.5);
      mode = 'multiplicative';
    }
    const defaultSteps = parseInt((dom.curriculumMaxLevel && dom.curriculumMaxLevel.value) || '10', 10);
    app.curriculumSpecs.push({ paramKey, from, to: cur, mode, steps: defaultSteps });
    renderCurriculumSpecs();
    refreshAllSliderOverlays();
    syncTrainerParams();
  }

  // Floating popup anchored next to the slider's toggle button. Lets
  // the user precisely set from/to, switch mode, or delete the spec.
  let _currOpenPopupCleanup = null;
  function closeAnyCurrPopup() {
    if (_currOpenPopupCleanup) { _currOpenPopupCleanup(); _currOpenPopupCleanup = null; }
  }
  function showSpecPopup(paramKey, anchor) {
    closeAnyCurrPopup();
    const spec = app.curriculumSpecs.find(s => s.paramKey === paramKey);
    if (!spec) return;
    const knob = (BF.trainer.CURRICULUM_KNOBS || []).find(k => k.key === paramKey);
    const label = knob ? knob.label : paramKey;
    // Pull min / max / step off the underlying slider element so the
    // popup ranges match the slider's accepted range exactly. Falls back
    // to knob registry values for params that don't have direct sliders.
    const sliderId = (typeof CURRICULUM_SLIDER_BINDINGS !== 'undefined') ? CURRICULUM_SLIDER_BINDINGS[paramKey] : null;
    const sliderEl = sliderId ? document.getElementById(sliderId) : null;
    const min = sliderEl ? parseFloat(sliderEl.min) : (knob ? knob.min : 0);
    const max = sliderEl ? parseFloat(sliderEl.max) : (knob ? knob.max : 1);
    const step = sliderEl ? parseFloat(sliderEl.step) || ((max - min) / 100) : ((max - min) / 100);
    // Default the spec's step count to the current global maxLevel if
    // it doesn't have one yet. The user can override per-spec from
    // here to make some ramps reach destination faster than others.
    const globalMaxLvl = parseInt((dom.curriculumMaxLevel && dom.curriculumMaxLevel.value) || '10', 10);
    if (spec.steps == null) spec.steps = globalMaxLvl;
    const popup = document.createElement('div');
    popup.className = 'curr-popup';
    popup.innerHTML = `
      <div class="curr-popup-title">${label} ramp</div>
      <div class="curr-popup-row curr-popup-slider-row">
        <label>from</label>
        <input type="range" class="curr-popup-from" min="${min}" max="${max}" step="${step}" value="${spec.from}" />
        <span class="curr-popup-num curr-popup-from-val">${formatNum(spec.from)}</span>
      </div>
      <div class="curr-popup-row curr-popup-slider-row">
        <label>to</label>
        <input type="range" class="curr-popup-to" min="${min}" max="${max}" step="${step}" value="${spec.to}" />
        <span class="curr-popup-num curr-popup-to-val">${formatNum(spec.to)}</span>
      </div>
      <div class="curr-popup-row curr-popup-slider-row">
        <label title="Number of level-ups this spec uses to walk from its start value to its end value. Cap raised to 200 because hard ramps (e.g. tilt 5° → 180°) often need many tiny steps to keep each level-up's fitness drop survivable. Reverse holds too: a low steps value (3-5) makes a big jump that forces strategy rediscovery, which sometimes works better than tiny refinement when the optimal policy fundamentally changes at the next difficulty.">steps</label>
        <input type="range" class="curr-popup-steps" min="2" max="200" step="1" value="${spec.steps}" />
        <span class="curr-popup-num curr-popup-steps-val">${spec.steps}</span>
      </div>
      <div class="curr-popup-row">
        <label>mode</label>
        <span class="curr-popup-mode">
          <button data-mode="multiplicative" class="${spec.mode === 'multiplicative' ? 'active' : ''}">×</button>
          <button data-mode="additive" class="${spec.mode === 'additive' ? 'active' : ''}">+</button>
        </span>
      </div>
      <div class="curr-popup-actions">
        <button class="btn curr-popup-delete">Remove curriculum</button>
        <button class="btn curr-popup-close">Done</button>
      </div>
    `;
    document.body.appendChild(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.left = Math.max(12, rect.right - 240) + 'px';
    popup.style.top = (rect.bottom + 6) + 'px';
    // Wire slider handlers — input fires continuously, so the band /
    // dot / live-applied value all update in real time as the user
    // drags. change fires on release; both push to trainer params.
    const fromIn = popup.querySelector('.curr-popup-from');
    const fromVal = popup.querySelector('.curr-popup-from-val');
    const toIn = popup.querySelector('.curr-popup-to');
    const toVal = popup.querySelector('.curr-popup-to-val');
    function applyFrom() {
      spec.from = parseFloat(fromIn.value);
      fromVal.textContent = formatNum(spec.from);
      renderCurriculumSpecs();
      refreshAllSliderOverlays();
      syncTrainerParams();
    }
    function applyTo() {
      spec.to = parseFloat(toIn.value);
      toVal.textContent = formatNum(spec.to);
      renderCurriculumSpecs();
      refreshAllSliderOverlays();
      syncTrainerParams();
    }
    fromIn.addEventListener('input', applyFrom);
    toIn.addEventListener('input', applyTo);
    const stepsIn = popup.querySelector('.curr-popup-steps');
    const stepsVal = popup.querySelector('.curr-popup-steps-val');
    function applySteps() {
      spec.steps = Math.max(1, parseInt(stepsIn.value, 10) || 10);
      stepsVal.textContent = String(spec.steps);
      renderCurriculumSpecs();
      refreshAllSliderOverlays();
      syncTrainerParams();
    }
    stepsIn.addEventListener('input', applySteps);
    popup.querySelectorAll('.curr-popup-mode button').forEach(b => {
      b.addEventListener('click', () => {
        spec.mode = b.dataset.mode;
        popup.querySelectorAll('.curr-popup-mode button').forEach(x => x.classList.toggle('active', x === b));
        renderCurriculumSpecs();
        refreshAllSliderOverlays();
        syncTrainerParams();
      });
    });
    popup.querySelector('.curr-popup-delete').addEventListener('click', () => {
      const i = app.curriculumSpecs.findIndex(s => s.paramKey === paramKey);
      if (i >= 0) app.curriculumSpecs.splice(i, 1);
      renderCurriculumSpecs();
      refreshAllSliderOverlays();
      syncTrainerParams();
      closeAnyCurrPopup();
    });
    popup.querySelector('.curr-popup-close').addEventListener('click', closeAnyCurrPopup);
    function onDocMouseDown(e) {
      if (popup.contains(e.target) || anchor.contains(e.target)) return;
      closeAnyCurrPopup();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    _currOpenPopupCleanup = () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      popup.remove();
    };
  }
  // Helper: format a curriculum value for display. Use 2 decimals for
  // small magnitudes, integer for large.
  function formatNum(v) {
    if (Math.abs(v) >= 100) return Math.round(v).toString();
    if (Math.abs(v) >= 10)  return v.toFixed(1);
    return v.toFixed(2);
  }
  // Format a "from → to" range using the slider's native unit
  // formatter. If both endpoints share the same trailing unit suffix
  // (e.g. "px/s²", "s", "%"), we strip it from `from` and keep `to`
  // verbatim — so the unit appears once at the end with whatever
  // spacing the original formatter intended: "162 → 900 px/s²"
  // (formatter has a leading space in the unit) or "5 → 10s"
  // (formatter has no space). Falls back to the verbose
  // "fromStr → toStr" form if no shared non-empty unit is detected.
  function formatRangeText(fmt, from, to) {
    const fromStr = String(fmt(from));
    const toStr   = String(fmt(to));
    if (fromStr === toStr) return fromStr; // degenerate (0-width) range
    // Capture: leading numeric prefix (group 1) + everything after (group 2).
    const re = /^(\s*-?\d+(?:\.\d+)?)(.*)$/;
    const m1 = fromStr.match(re);
    const m2 = toStr.match(re);
    const suffix1 = m1 ? m1[2] : '';
    const suffix2 = m2 ? m2[2] : '';
    if (m1 && m2 && suffix1.trim() === suffix2.trim() && suffix1.trim().length > 0) {
      // Shared non-empty unit suffix → strip it from `from`, keep `to` as-is.
      return `${m1[1]} → ${toStr}`;
    }
    return `${fromStr} → ${toStr}`;
  }

  function refreshCurriculumUI() {
    const on = dom.curriculumOn.checked;
    // The legacy "Start fraction" + "Ramp factor" controls are gone from
    // the active flow — they\'re now baked into the auto-seeded gravity
    // spec\'s from/to and mode. Stay hidden unconditionally.
    dom.curriculumStartFracRow.style.display = 'none';
    dom.curriculumRampRow.style.display = 'none';
    dom.curriculumThresholdRow.style.display = on ? '' : 'none';
    dom.curriculumConsecRow.style.display = on ? '' : 'none';
    dom.curriculumMaxLevelRow.style.display = on ? '' : 'none';
    dom.curriculumSpecsBlock.style.display = on ? '' : 'none';
  }
  refreshCurriculumUI();

  // ---------- Generalized curriculum spec list (view-only) ----------
  // Renders app.curriculumSpecs as a read-only summary. The user edits
  // ramps directly on the per-slider overlay (drag from/to dots) or via
  // the popup (click the slider's + button). Clicking a list entry
  // scrolls to the relevant slider and briefly flashes it so the user
  // can find the control. Delete is the only mutation kept on the list
  // since "remove this ramp entirely" doesn't have a natural place on
  // the slider overlay itself.
  // Build a single spec entry (one chip inside a phase row). Factored
  // out of renderCurriculumSpecs so the phase grouping below stays
  // readable.
  //
  // Drag system: bespoke mouse-based, NOT HTML5 DnD. HTML5 DnD turned
  // out to be unreliable in our use case -- dragover / dragleave /
  // drop events fired inconsistently when drop zones changed size on
  // hover (which ours do for visual feedback), leaving users with the
  // "shows ready to drop but releasing does nothing" symptom. Manual
  // mousedown -> mousemove -> mouseup gives us full control:
  //   - Only the .curr-spec-grab handle starts a drag (not the whole
  //     chip), so clicks on the chip body still trigger flashSlider.
  //   - We pick the drop target each move via document.elementFromPoint,
  //     so there's never an ambiguity about which element "received"
  //     the cursor.
  //   - On mouseup we apply the drop deterministically based on the
  //     last tracked target. No event-routing surprises.
  function buildCurriculumSpecChip(spec) {
    const knob = (BF.trainer.curriculumKnobByKey
      ? BF.trainer.curriculumKnobByKey(spec.paramKey)
      : null);
    const label = knob ? knob.label : spec.paramKey;
    const row = document.createElement('div');
    row.className = 'curr-spec-row';
    row.dataset.paramKey = spec.paramKey;
    row.title = 'Click body to flash the matching slider · drag ⋮⋮ to reorder';
    // Drag handle glyph. ONLY this element initiates a drag -- clicks
    // anywhere else on the chip stay clicks (flash slider). The handle
    // glows amber on hover so the user knows what's draggable.
    const grab = document.createElement('span');
    grab.className = 'curr-spec-grab';
    grab.textContent = '⋮⋮';
    grab.title = 'Drag to move this ramp into another phase';
    grab.draggable = true;  // ONLY the handle initiates HTML5 DnD
    // Clicks on the handle shouldn't bubble to the chip's flashSlider.
    grab.addEventListener('click', (ev) => { ev.stopPropagation(); });
    // HTML5 DnD: we use it for the BROWSER-NATIVE drag preview (a
    // translucent ghost of the dragged element follows the cursor).
    // Drop logic itself is bulletproofed against any DnD weirdness by
    // the dragend-fallback that uses our JS-tracked target.
    grab.addEventListener('dragstart', (ev) => {
      ev.stopPropagation();
      app._curriculumDragSpec = spec;
      app._curriculumDropTarget = null;
      app._curriculumDragSourceRow = row;
      row.classList.add('dragging');
      document.body.classList.add('curriculum-dragging');
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', spec.paramKey);
        // Use the chip ROW as the drag image so the user sees the
        // whole chip preview (not just the tiny grab handle). Offset
        // chosen so the preview anchors near the cursor.
        try { ev.dataTransfer.setDragImage(row, 12, 12); } catch (_) {}
      }
      // Mark every no-op drop target with .drop-disabled so the user
      // only sees meaningful options highlighted. No-op cases for
      // dragging `spec`:
      //   - source chip itself (already self-guarded, but we mark
      //     it for the visual)
      //   - any other chip in the SAME phase as spec (drop would
      //     assign to the same phase = no change)
      //   - the source phase row itself
      //   - if spec is ALONE in its phase, the two dividers
      //     surrounding that phase (insert-here would just recreate
      //     the same one-chip phase elsewhere = no visible change
      //     after normalize)
      const srcPhase = (spec.phase | 0) || 0;
      const phaseMembers = app.curriculumSpecs.filter(s =>
        s && ((s.phase | 0) || 0) === srcPhase);
      const isAlone = phaseMembers.length === 1;
      document.querySelectorAll('.curr-spec-row').forEach(el => {
        const otherKey = el.dataset.paramKey;
        if (!otherKey) return;
        const other = app.curriculumSpecs.find(s => s && s.paramKey === otherKey);
        if (!other) return;
        if (((other.phase | 0) || 0) === srcPhase) {
          el.classList.add('drop-disabled');
        }
      });
      const srcPhaseRow = document.querySelector(`.curr-phase-row[data-phase="${srcPhase}"]`);
      if (srcPhaseRow) srcPhaseRow.classList.add('drop-disabled');
      if (isAlone) {
        const before = document.querySelector(`.curr-phase-divider[data-target-phase="${srcPhase}"]`);
        const after  = document.querySelector(`.curr-phase-divider[data-target-phase="${srcPhase + 1}"]`);
        if (before) before.classList.add('drop-disabled');
        if (after)  after.classList.add('drop-disabled');
      }
    });
    grab.addEventListener('dragend', () => {
      // Fallback: if the browser dropped the `drop` event on the
      // floor (e.g. cursor was momentarily off a target at release
      // time), use our tracked target to apply the drop anyway.
      if (app._curriculumDragSpec && app._curriculumDropTarget) {
        const tgt = app._curriculumDropTarget;
        let didApply = false;
        if (tgt.kind === 'divider' && typeof tgt.phaseInt === 'number') {
          app._curriculumDragSpec.phase = tgt.phaseInt - 0.5;
          didApply = true;
        } else if (tgt.kind === 'phase' && typeof tgt.phaseNum === 'number') {
          app._curriculumDragSpec.phase = tgt.phaseNum;
          didApply = true;
        } else if (tgt.kind === 'chip' && tgt.spec && tgt.spec !== app._curriculumDragSpec) {
          app._curriculumDragSpec.phase = (tgt.spec.phase | 0) || 0;
          didApply = true;
        }
        if (didApply) {
          renderCurriculumSpecs();
          syncTrainerParams();
        }
      }
      document.querySelectorAll(
        '.curr-phase-divider.drag-over, .curr-phase-row.drag-over, .curr-spec-row.drag-over'
      ).forEach(el => el.classList.remove('drag-over'));
      // Lift the no-op markers that dragstart added.
      document.querySelectorAll('.drop-disabled').forEach(el => el.classList.remove('drop-disabled'));
      row.classList.remove('dragging');
      document.body.classList.remove('curriculum-dragging');
      app._curriculumDragSpec = null;
      app._curriculumDropTarget = null;
      app._curriculumDragSourceRow = null;
    });
    const labelEl = document.createElement('span');
    labelEl.className = 'curr-spec-label';
    labelEl.textContent = label;
    const fromVal = document.createElement('span');
    fromVal.className = 'curr-spec-val';
    fromVal.textContent = formatNum(spec.from);
    const toVal = document.createElement('span');
    toVal.className = 'curr-spec-val';
    toVal.textContent = formatNum(spec.to);
    const fromIsLow = spec.from <= spec.to;
    fromVal.classList.toggle('is-low',  fromIsLow);
    fromVal.classList.toggle('is-high', !fromIsLow);
    toVal.classList.toggle('is-low',  !fromIsLow);
    toVal.classList.toggle('is-high', fromIsLow);
    const arrow = document.createElement('span');
    arrow.className = 'curr-spec-arrow';
    arrow.textContent = '→';
    const sep = document.createElement('span');
    sep.className = 'curr-spec-sep';
    sep.textContent = ':';
    const curVal = document.createElement('span');
    curVal.className = 'curr-spec-cur';
    curVal.dataset.specCurFor = spec.paramKey;
    const tp = app.trainer ? app.trainer.params : null;
    const curApplied = (tp && tp.curriculumEnabled)
      ? appliedCurriculumParam(tp, spec.paramKey)
      : null;
    if (curApplied != null) curVal.textContent = formatNum(curApplied);
    const modeTag = document.createElement('span');
    modeTag.className = 'curr-spec-mode-tag';
    modeTag.textContent = spec.mode === 'multiplicative' ? '×' : '+';
    modeTag.title = spec.mode === 'multiplicative'
      ? 'Multiplicative (geometric ramp)'
      : 'Additive (linear ramp)';
    const del = document.createElement('button');
    del.className = 'curr-spec-delete';
    del.textContent = '×';
    del.title = 'Remove this curriculum ramp';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const idx = app.curriculumSpecs.indexOf(spec);
      if (idx >= 0) app.curriculumSpecs.splice(idx, 1);
      renderCurriculumSpecs();
      syncTrainerParams();
    });
    // Clicking the chip body (not the grab handle) flashes the
    // matching slider so users can find the control quickly. The
    // grab handle has its own click handler that stops propagation
    // so clicks-on-handle don't bubble here.
    row.addEventListener('click', () => { flashSlider(spec.paramKey); });

    // HTML5 DnD: chip itself is a drop target. Dropping a chip on
    // another chip assigns the dragged spec to the target chip's
    // phase (puts them in the same phase). Reject the drop if it
    // would be a no-op (dragging onto self, or onto a chip already
    // in the dragged spec's phase). Rejection is via "don't
    // preventDefault" -- the browser then refuses to fire drop here.
    row.addEventListener('dragover', (ev) => {
      const dragged = app._curriculumDragSpec;
      if (!dragged) return;
      if (dragged === spec) return;
      // Same-phase: drop would assign dragged.phase = spec.phase,
      // which is already the case. No-op.
      if (((dragged.phase | 0) || 0) === ((spec.phase | 0) || 0)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
      app._curriculumDropTarget = { kind: 'chip', spec: spec };
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      row.classList.remove('drag-over');
      const dragged = app._curriculumDragSpec;
      if (!dragged || dragged === spec) return;
      dragged.phase = (spec.phase | 0) || 0;
      app._curriculumDropTarget = null;
      renderCurriculumSpecs();
      syncTrainerParams();
    });

    row.appendChild(grab);
    row.appendChild(labelEl);
    row.appendChild(fromVal);
    row.appendChild(arrow);
    row.appendChild(toVal);
    if (curApplied != null) {
      row.appendChild(sep);
      row.appendChild(curVal);
    }
    row.appendChild(modeTag);
    row.appendChild(del);
    return row;
  }

  function renderCurriculumSpecs() {
    if (!dom.curriculumSpecsList) return;
    dom.curriculumSpecsList.innerHTML = '';
    const knobs = (BF.trainer && BF.trainer.CURRICULUM_KNOBS) || [];
    if (knobs.length === 0) return;
    if (dom.curriculumListEmpty) {
      dom.curriculumListEmpty.style.display =
        app.curriculumSpecs.length === 0 ? '' : 'none';
    }
    // CRITICAL: normalize FIRST, before any bucketing. The drop
    // handlers assign half-integer phase numbers (e.g. 0.5 to
    // "insert between phase 0 and 1"), and the bucket key below uses
    // `spec.phase | 0` which silently coerces 0.5 -> 0 -- causing
    // the dropped chip to render in the SAME bucket as the original,
    // even though normalize would have separated them cleanly. The
    // user saw "I dropped to create a new phase, but it came back to
    // phase 1." Normalize first guarantees every phase number is a
    // clean consecutive integer before bucketing reads it.
    normalizeCurriculumPhases();
    // Group by phase using the trainer's helper so the JS-side
    // bucketing matches what the trainer uses at eval time. Phase
    // numbers are normalized -- we display them as 1-indexed
    // "Phase 1" / "Phase 2" / ... since "Phase 0" reads as "no
    // phase" to users unfamiliar with the data model.
    const buckets = new Map();
    for (const spec of app.curriculumSpecs) {
      const ph = (spec.phase | 0) || 0;
      if (!buckets.has(ph)) buckets.set(ph, []);
      buckets.get(ph).push(spec);
    }
    const phaseNums = Array.from(buckets.keys()).sort((a, b) => a - b);

    // Active-phase computation. The trainer's curriculum level moves
    // monotonically; figure out which phase is currently advancing so
    // the renderer can glow it bluish-green.
    let activePhaseIndex = -1;
    if (app.trainer && app.trainer.params && app.trainer.params.curriculumEnabled
        && BF.trainer.computeCurriculumPhases) {
      const defaultSteps = (app.trainer.params.curriculumMaxLevel | 0) || 10;
      const phases = BF.trainer.computeCurriculumPhases(app.curriculumSpecs, defaultSteps);
      const lvl = (app.trainer.curriculum && app.trainer.curriculum.level) || 0;
      for (let p = 0; p < phases.phaseMaxSteps.length; p++) {
        const start = phases.cumStart[p];
        const end   = start + phases.phaseMaxSteps[p];
        if (lvl < end && lvl >= start) { activePhaseIndex = p; break; }
        if (lvl < start) { activePhaseIndex = p - 1; break; }
        activePhaseIndex = p;  // default to last completed phase
      }
    }

    // Drop-zone before phase 0 (lets the user split a single chip into
    // its own phase BEFORE everything else by dragging it up here).
    dom.curriculumSpecsList.appendChild(makePhaseDivider(/*insertAtPhase=*/0));

    for (let pi = 0; pi < phaseNums.length; pi++) {
      const ph = phaseNums[pi];
      const phaseRow = document.createElement('div');
      phaseRow.className = 'curr-phase-row';
      phaseRow.dataset.phase = String(ph);
      if (pi === activePhaseIndex) phaseRow.classList.add('is-active');
      const tag = document.createElement('span');
      tag.className = 'curr-phase-tag';
      tag.textContent = 'Phase ' + (pi + 1);
      tag.title = pi === activePhaseIndex
        ? 'Currently advancing'
        : (pi < activePhaseIndex ? 'Completed' : 'Pending');
      phaseRow.appendChild(tag);

      // Append all chips for this phase. Each chip is independently
      // draggable; dropping a chip on this phaseRow puts it in this
      // phase.
      for (const spec of buckets.get(ph)) {
        phaseRow.appendChild(buildCurriculumSpecChip(spec));
      }

      // Drop handlers for the whole phase row. Drop a chip in here
      // -> assign its phase to this phase's number.
      // HTML5 DnD drop target for the phase row. Dropping a chip on
      // a phase row assigns the dragged spec to that phase number.
      // Reject if dragged spec is already in this phase (no-op).
      phaseRow.addEventListener('dragover', (ev) => {
        const dragged = app._curriculumDragSpec;
        if (!dragged) return;
        if (((dragged.phase | 0) || 0) === ph) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        phaseRow.classList.add('drag-over');
        app._curriculumDropTarget = { kind: 'phase', phaseNum: ph };
      });
      phaseRow.addEventListener('dragleave', () => {
        phaseRow.classList.remove('drag-over');
      });
      phaseRow.addEventListener('drop', (ev) => {
        ev.preventDefault();
        phaseRow.classList.remove('drag-over');
        const dragged = app._curriculumDragSpec;
        if (!dragged) return;
        dragged.phase = ph;
        app._curriculumDropTarget = null;
        renderCurriculumSpecs();
        syncTrainerParams();
      });

      dom.curriculumSpecsList.appendChild(phaseRow);
      // After each phase, a divider that lets the user create a NEW
      // phase between this one and the next (or after the last).
      dom.curriculumSpecsList.appendChild(makePhaseDivider(ph + 1));
    }

    refreshAllSliderOverlays();
  }


  // Drop zone between phases. Dropping a chip on a divider creates
  // a NEW phase between the surrounding phases (or at the very
  // top / bottom of the list).
  function makePhaseDivider(targetPhaseInt) {
    const div = document.createElement('div');
    div.className = 'curr-phase-divider';
    div.dataset.targetPhase = String(targetPhaseInt);
    div.addEventListener('dragover', (ev) => {
      const dragged = app._curriculumDragSpec;
      if (!dragged) return;
      // Reject if creating a new phase here would be a no-op. That
      // happens when the dragged spec is ALONE in its current phase
      // AND this divider would just put it in a new phase at the
      // same logical position (i.e. adjacent to its own phase).
      const draggedPhase = (dragged.phase | 0) || 0;
      const phaseMembers = (app.curriculumSpecs || []).filter(s =>
        s && ((s.phase | 0) || 0) === draggedPhase);
      if (phaseMembers.length === 1) {
        // Spec is alone. Both adjacent dividers are no-ops.
        if (targetPhaseInt === draggedPhase || targetPhaseInt === draggedPhase + 1) {
          return;
        }
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
      app._curriculumDropTarget = { kind: 'divider', phaseInt: targetPhaseInt };
    });
    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over');
    });
    div.addEventListener('drop', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      div.classList.remove('drag-over');
      const dragged = app._curriculumDragSpec;
      if (!dragged) return;
      // Half-integer phase to sort BEFORE the target's phase; the
      // normalize pass cleans it up to a clean integer.
      dragged.phase = targetPhaseInt - 0.5;
      app._curriculumDropTarget = null;
      renderCurriculumSpecs();
      syncTrainerParams();
    });
    return div;
  }

  // Renumber phase indices to consecutive integers 0..N-1. The
  // drag-drop logic above assigns half-integers when inserting a
  // new phase between two existing ones; this pass cleans up so the
  // stored data model only ever has integer phase numbers.
  function normalizeCurriculumPhases() {
    if (!app.curriculumSpecs || app.curriculumSpecs.length === 0) return;
    const used = new Set();
    for (const s of app.curriculumSpecs) used.add(s.phase || 0);
    const sorted = Array.from(used).sort((a, b) => a - b);
    const remap = new Map();
    sorted.forEach((p, i) => remap.set(p, i));
    let changed = false;
    for (const s of app.curriculumSpecs) {
      const newP = remap.get(s.phase || 0);
      if (newP !== (s.phase || 0)) { s.phase = newP; changed = true; }
      else if (s.phase == null) { s.phase = newP; changed = true; }
    }
    // If anything changed we DON'T re-render here (caller handles it)
    // but we do return whether normalization touched anything so the
    // caller can sync trainer params if needed. Today both call sites
    // already sync after renormalization so we keep it simple.
    return changed;
  }

  function updateCurriculumSpecCurValues() {
    if (!dom.curriculumSpecsList) return;
    const tp = app.trainer ? app.trainer.params : null;
    if (!tp || !tp.curriculumEnabled) return;
    const spans = dom.curriculumSpecsList.querySelectorAll('.curr-spec-cur');
    for (const span of spans) {
      const key = span.dataset.specCurFor;
      if (!key) continue;
      const v = appliedCurriculumParam(tp, key);
      if (v != null) span.textContent = formatNum(v);
    }
    // Active-phase highlight. The `.is-active` class is set ONCE during
    // renderCurriculumSpecs, so without this re-sync the bluish-green
    // glow stays on Phase 1 forever even when the trainer's level has
    // moved past Phase 1's end. Compute the current active phase the
    // same way renderCurriculumSpecs does, then toggle the class on
    // each .curr-phase-row by its data-phase attribute. The phase rows
    // are sorted ascending in the DOM so we can pair them up by index
    // with the computeCurriculumPhases output (which is also ascending).
    if (BF.trainer && BF.trainer.computeCurriculumPhases) {
      const defaultSteps = (tp.curriculumMaxLevel | 0) || 10;
      const { phaseMaxSteps, cumStart } =
        BF.trainer.computeCurriculumPhases(tp.curriculumSpecs, defaultSteps);
      const lvl = (app.trainer.curriculum && app.trainer.curriculum.level) || 0;
      let activeIdx = -1;
      for (let p = 0; p < phaseMaxSteps.length; p++) {
        const start = cumStart[p];
        const end   = start + phaseMaxSteps[p];
        if (lvl < end && lvl >= start) { activeIdx = p; break; }
        if (lvl < start) { activeIdx = p - 1; break; }
        activeIdx = p;  // past this phase; default to last completed
      }
      const phaseRows = dom.curriculumSpecsList.querySelectorAll('.curr-phase-row');
      phaseRows.forEach((row, i) => {
        row.classList.toggle('is-active', i === activeIdx);
      });
    }
  }

  // Scroll the matching slider's wrap into view and pulse it briefly so
  // the user can locate the control after clicking a list entry. The
  // wrap re-receives the .flashing class on each click; we strip it
  // first so a re-click restarts the animation rather than no-op'ing.
  function flashSlider(paramKey) {
    const o = app._currOverlays && app._currOverlays[paramKey];
    if (!o) return;
    try {
      o.wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
      // older browsers without smooth-scroll options
      o.wrap.scrollIntoView();
    }
    o.wrap.classList.remove('flashing');
    // Force a reflow so removing+re-adding the class restarts the CSS
    // animation. Without this, re-clicking the same row in <1s would
    // not re-trigger the flash.
    void o.wrap.offsetWidth;
    o.wrap.classList.add('flashing');
    setTimeout(() => { o.wrap.classList.remove('flashing'); }, 1100);
  }
  // Generate a slider for every curriculum-able parameter that lacks a
  // dedicated control, so EVERY curriculum param is manually adjustable and its
  // "+"-ramp / current-value readout / click-to-scroll all work (they key off
  // the slider element existing — a spec-only param showed a chip that couldn't
  // scroll anywhere and had no cur-val). Generated from the CURRICULUM_KNOBS
  // registry so it can't drift; folded into readParams via _curriculumKnobKeys.
  function buildCurriculumKnobSliders() {
    const host = document.getElementById('curriculumKnobSliders');
    const knobs = (BF.trainer && BF.trainer.CURRICULUM_KNOBS) || [];
    if (!host || !knobs.length) return;
    app._curriculumKnobKeys = [];
    // Some knobs live in objectiveParams, not top-level params — those already
    // have sliders inside the reward block, so the `dom[key]` guard skips them.
    for (const kb of knobs) {
      const key = kb.key;
      // Already has a dedicated control anywhere in the DOM? leave it alone —
      // either directly (id === key) or via a binding to a differently-named
      // slider (e.g. startTiltDeg → the 'tiltDeg' slider). Only generate a
      // slider for params that have NO control at all.
      if (document.getElementById(key)) continue;
      const boundId = CURRICULUM_SLIDER_BINDINGS[key];
      if (boundId && document.getElementById(boundId)) continue;
      const step = (kb.max - kb.min) <= 3 ? 0.01 : ((kb.max - kb.min) <= 20 ? 0.1 : 1);
      const row = document.createElement('div');
      row.className = 'control-row';
      row.id = key + 'Row';
      const label = document.createElement('label');
      label.className = 'control-label';
      label.title = 'Curriculum-able "' + kb.label + '" (paramKey: ' + key + '). Manual base value; a curriculum ramp on this param overrides it while training. Click its entry in the curriculum-ramp panel to jump here.';
      label.textContent = kb.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = key;
      input.min = String(kb.min); input.max = String(kb.max); input.step = key === 'traceCenterY' ? 'any' : String(step);
      input.value = String(kb.def);
      input.defaultValue = String(kb.def);   // hermetic-reset friendly
      const val = document.createElement('span');
      val.className = 'control-value';
      val.id = key + 'Val';
      val.textContent = String(kb.def);
      row.appendChild(label); row.appendChild(input); row.appendChild(val);
      host.appendChild(row);
      dom[key] = input;
      // Self-bind so "+", cur-val + click-to-scroll all resolve.
      CURRICULUM_SLIDER_BINDINGS[key] = key;
      bindRange(input, val, (v) => {
        const n = parseFloat(v);
        return (kb.max - kb.min) <= 3 ? n.toFixed(2) : (Number.isInteger(n) ? String(n) : n.toFixed(1));
      });
      app._curriculumKnobKeys.push(key);
    }
  }
  buildCurriculumKnobSliders();

  // Boot: wrap curriculum-able sliders + inject toggle buttons. Done
  // exactly once after DOM is built; subsequent state changes only
  // update overlay positions + visibility.
  attachAllCurriculumOverlays();
  renderCurriculumSpecs();
  refreshAllSliderOverlays();
  // (The standalone "Add ramp" button has been retired — users add
  // ramps via the per-slider + toggle next to each curriculum-able
  // parameter, which already auto-seeds a sensible default range.)
  // Live level readout updater — called from the render loop in updateAdversarialHint
  // adjacent code (folded into the per-frame update path).
  function updateCurriculumHint() {
    if (!dom.curriculumLevelHint) return;
    // Diffsim modes have their own native curriculum readout (the HUD's
    // renderDiffsimCurriculumHud, on the 0-1 meanUp scale). This population
    // hint compares the facade's [0,1] fitness against the objective's
    // tens-of-points ceiling, so it would render a permanent, wrong-units
    // "need 38.5" in red that contradicts the native panel. Suppress it.
    if (isDiffsimMode()) { dom.curriculumLevelHint.style.display = 'none'; return; }
    const on = dom.curriculumOn.checked;
    if (!on) {
      dom.curriculumLevelHint.style.display = 'none';
      return;
    }
    dom.curriculumLevelHint.style.display = '';
    const t = app.trainer;
    if (!t || !t.curriculum) {
      dom.curriculumLevelHint.innerHTML = '<span class="info">curriculum on; awaiting first gen</span>';
      return;
    }
    const lvl = t.curriculum.level || 0;
    const maxLvl = curriculumEffectiveMax(t.params);  // honors max(spec.steps)
    const consec = t.curriculum.consecHits || 0;
    const consecReq = t.params.curriculumConsecRequired || 2;
    const numSpecs = (t.params.curriculumSpecs || []).length;
    // Applied-values readout. For each active spec, show:
    //   "<label> 2.50 → 8.00 (30%)"
    // — current applied value, target, and progress fraction within
    // the spec's own steps. The "→ target" arrow + the percentage are
    // the diagnostic that answers "is the curriculum actually
    // ramping?" -- without them the user only sees the current value
    // and can't tell if a number is mid-ramp or already settled.
    // Shows ALL specs (no `(+N more)` truncation) and includes lvl=0
    // (just shows from=current=value, %=0%) so the user can confirm
    // the spec is armed even before the first level-up. Caps each
    // spec at one comma-separated entry so the line stays parseable.
    let appliedNote = '';
    if (numSpecs > 0) {
      const samples = (t.params.curriculumSpecs || []).map(s => {
        const specSteps = Math.max(1, (s.steps | 0) || maxLvl);
        const frac = Math.min(1, lvl / specSteps);
        const v = BF.trainer.curriculumApply(s, frac);
        const knob = BF.trainer.curriculumKnobByKey(s.paramKey);
        const lbl = knob ? knob.label : s.paramKey;
        const pct = Math.round(frac * 100);
        // Compact format: only show "→ to" when ramp is in progress
        // (lvl > 0); at lvl=0 the value IS `from` so the arrow is
        // redundant. Always include the percent so the user can see
        // 0% / mid / 100% at a glance.
        const arrow = (lvl > 0 && Math.abs(v - s.to) > 1e-6)
          ? ` → ${formatNum(s.to)}`
          : '';
        return `${lbl} ${formatNum(v)}${arrow} (${pct}%)`;
      });
      appliedNote = ' · ' + samples.join(', ');
    }
    // Compute the level-up threshold the same way the trainer does
    // (per-objective ceiling × thresholdFrac). Surface this so the
    // user can see "best=12.91 / need 38.5 to advance" — answers
    // the obvious "why isn't curriculum advancing?" question without
    // having to read the source.
    const obj = BF.objectives.getObjective(t.params.objectiveId);
    let ceiling;
    if (obj && typeof obj.expectedMaxFor === 'function') ceiling = obj.expectedMaxFor(t.params.evalSeconds, t.params);
    else if (obj && obj.expectedMax != null)             ceiling = obj.expectedMax;
    else if (obj && obj.maxPerSec != null)               ceiling = obj.maxPerSec * t.params.evalSeconds;
    else                                                  ceiling = 1.5 * t.params.evalSeconds;
    const thresholdFrac = (obj && obj.thresholdFrac != null)
                            ? obj.thresholdFrac
                            : (t.params.curriculumThresholdFrac != null
                                ? t.params.curriculumThresholdFrac : 0.70);
    const threshold = ceiling * thresholdFrac;
    const bestEver = isFinite(t.bestEverFitness) ? t.bestEverFitness : 0;
    const phaseBest = (t.curriculum && isFinite(t.curriculum.phaseBestFitness))
      ? t.curriculum.phaseBestFitness : null;
    const progressBest = phaseBest != null ? phaseBest : bestEver;
    const advanceCls = progressBest >= threshold ? 'ok' : 'warn';
    const advanceNote = (lvl < maxLvl)
      ? ` · <span class="${advanceCls}">phase ${progressBest.toFixed(1)} / need ${threshold.toFixed(1)}</span>`
      : ' · <span class="ok">at max level</span>';
    dom.curriculumLevelHint.innerHTML =
      `<span class="info">level <b>${lvl}/${maxLvl}</b> · consec ${consec}/${consecReq}${advanceNote}${appliedNote}</span>`;
    // Per-level mini-chart: one vertical bar per level summarizing the
    // best fitness reached during that level, with a small dot marking
    // the level's max-median (population-as-a-whole signal). The chart
    // sits right under the hint text; CSS reserves a 64-px-high canvas.
    drawCurriculumLevelChart(t);
  }

  // Per-level summary chart -- bars for max(best) per level + dots for
  // max(median). Read live off trainer.curriculum.perLevelStats. We
  // only render when there's >= 1 completed level OR the current level
  // has at least 2 gens of data; otherwise it'd just be a single sliver
  // that adds noise instead of insight.
  function drawCurriculumLevelChart(trainer) {
    const canvas = document.getElementById('curriculumLevelChart');
    if (!canvas) return;
    const buckets = (trainer && trainer.curriculum && trainer.curriculum.perLevelStats) || [];
    // Hide entirely until there's enough data to be informative. We
    // toggle visibility (not display) so the layout doesn't reflow
    // when the first level-up happens mid-run.
    const enough = buckets.length >= 2
      || (buckets.length === 1 && (buckets[0].gens || []).length >= 2);
    if (!enough) {
      canvas.style.visibility = 'hidden';
      return;
    }
    canvas.style.visibility = 'visible';
    const fit = BF.util.fitCanvas(canvas);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(fit.dpr, fit.dpr);
    const w = fit.cssW, h = fit.cssH;
    ctx.clearRect(0, 0, w, h);
    const padL = 22, padR = 6, padT = 4, padB = 14;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    // Retro overlay is on when (a) the user hasn't disabled the chart-
    // level toggle AND (b) retro-eval itself is enabled (otherwise the
    // dots would always be empty and the legend would be misleading).
    // The chart-toggle defaults true so users with retro on get the
    // overlay for free.
    const showRetroOverlay =
      (dom.curriculumChartShowRetro ? dom.curriculumChartShowRetro.checked : true)
      && !!(trainer.params && trainer.params.retroEvalEnabled);
    // Y scale across all buckets' (maxBest, minBest, maxMedian) — gives
    // an honest "how high did we ever get vs. how low did we fall" view.
    // Include maxRetro in the span when the overlay is on so a high
    // retro value doesn't fall off the top of the chart.
    let yMin = Infinity, yMax = -Infinity;
    for (const b of buckets) {
      if (isFinite(b.maxBest)   && b.maxBest   > yMax) yMax = b.maxBest;
      if (isFinite(b.maxMedian) && b.maxMedian > yMax) yMax = b.maxMedian;
      if (showRetroOverlay && isFinite(b.maxRetro) && b.maxRetro > yMax) yMax = b.maxRetro;
      if (isFinite(b.minBest)   && b.minBest   < yMin) yMin = b.minBest;
      if (showRetroOverlay && b.retroCount > 0) {
        const meanR = b.retroSum / b.retroCount;
        if (isFinite(meanR) && meanR < yMin) yMin = meanR;
      }
    }
    if (!isFinite(yMin) || !isFinite(yMax) || yMin === yMax) {
      yMin = 0; yMax = 1;
    }
    const ySpan = yMax - yMin || 1;
    const yAt = (v) => padT + innerH - ((v - yMin) / ySpan) * innerH;
    // Light grid + axis labels.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(154,163,187,0.7)';
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
    for (let i = 0; i <= 2; i++) {
      const v = yMin + (ySpan * i) / 2;
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y + 0.5);
      ctx.lineTo(w - padR, y + 0.5);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(formatTickValue(v), padL - 2, y + 3);
    }
    // Bars + median dots.
    const n = buckets.length;
    const slot = innerW / n;
    const barW = Math.max(2, Math.min(18, slot - 2));
    for (let i = 0; i < n; i++) {
      const b = buckets[i];
      const cx = padL + slot * i + slot / 2;
      // Bar from minBest to maxBest. Color = green if level made
      // progress (maxBest > prev maxBest), red if it regressed.
      const prev = i > 0 ? buckets[i - 1] : null;
      const regressed = prev && isFinite(prev.maxBest) && b.maxBest < prev.maxBest;
      ctx.fillStyle = regressed ? 'rgba(255, 102, 128, 0.55)' : 'rgba(108, 226, 138, 0.55)';
      const yMaxB = yAt(isFinite(b.maxBest) ? b.maxBest : yMin);
      const yMinB = yAt(isFinite(b.minBest) ? b.minBest : yMin);
      ctx.fillRect(cx - barW / 2, yMaxB, barW, Math.max(1, yMinB - yMaxB));
      // Dot at max-median (population-wide best, not just leader).
      if (isFinite(b.maxMedian)) {
        ctx.fillStyle = '#f5b769';
        ctx.beginPath();
        ctx.arc(cx, yAt(b.maxMedian), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Retro overlay: lavender dot at max(retro) + a thin lavender
      // tick at mean(retro). Only drawn when this level recorded at
      // least one retro probe AND the user has retro overlay enabled.
      // A retro dot sitting far below the green/red bar means policies
      // at this level were specialists -- they crushed the level's
      // task but couldn't do anything else. Conversely, a retro dot
      // close to the bar's top means the policies were robust across
      // prior levels too. The most informative diagnostic when feature
      // A is on.
      if (showRetroOverlay && b.retroCount > 0 && isFinite(b.maxRetro)) {
        ctx.fillStyle = '#c5a8ff';
        ctx.beginPath();
        ctx.arc(cx, yAt(b.maxRetro), 2.4, 0, Math.PI * 2);
        ctx.fill();
        // Mean retro as a thin horizontal tick across the bar width.
        const meanR = b.retroSum / b.retroCount;
        if (isFinite(meanR)) {
          ctx.strokeStyle = 'rgba(197, 168, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const yMean = yAt(meanR);
          ctx.moveTo(cx - barW / 2, yMean + 0.5);
          ctx.lineTo(cx + barW / 2, yMean + 0.5);
          ctx.stroke();
        }
      }
      // Level number label (only every Nth when bars are dense).
      if (n <= 12 || i % Math.ceil(n / 10) === 0 || i === n - 1) {
        ctx.fillStyle = 'rgba(154,163,187,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(`L${b.level}`, cx, h - 2);
      }
    }
    ctx.restore();
  }
  function formatTickValue(v) {
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10)  return v.toFixed(1);
    return v.toFixed(2);
  }
  // Tilt-angle slider + preset chips. The slider is the source of truth;
  // chips just snap it. We listen on `input` (not `change`) so the live
  // preview rebuild fires while the user drags, matching the feel of
  // gravity / damping. Updating the value label is a tiny piece on top
  // of the syncTrainerParams + rebuildDisplayState pair.
  function refreshTiltUI(deg) {
    if (dom.tiltDegVal) dom.tiltDegVal.textContent = `${Math.round(deg)}°`;
    // Highlight the matching preset chip (if any). Snap tolerance is
    // 0.5° so an exact-equal click highlights but a drag past doesn't.
    document.querySelectorAll('.tilt-preset').forEach(btn => {
      const target = parseFloat(btn.getAttribute('data-deg'));
      btn.classList.toggle('active', Math.abs(deg - target) < 0.5);
    });
  }
  if (dom.tiltDeg) {
    dom.tiltDeg.addEventListener('input', () => {
      refreshTiltUI(parseFloat(dom.tiltDeg.value));
      syncTrainerParams();
      updateCartAccelHint();
      if (app.trainer) rebuildDisplayState();
    });
    refreshTiltUI(parseFloat(dom.tiltDeg.value));
  }
  // Tilt spread slider: adds a uniform fan of width 2*spread around the
  // central tilt. Default 0 = single starting pose (much easier for the
  // policy to learn -- it doesn't have to also generalize across a
  // range of initial conditions).
  if (dom.tiltSpreadDeg) {
    dom.tiltSpreadDeg.addEventListener('input', () => {
      if (dom.tiltSpreadDegVal) {
        dom.tiltSpreadDegVal.textContent = `${Math.round(parseFloat(dom.tiltSpreadDeg.value))}°`;
      }
      syncTrainerParams();
      if (app.trainer) rebuildDisplayState();
    });
    if (dom.tiltSpreadDegVal) {
      dom.tiltSpreadDegVal.textContent = `${Math.round(parseFloat(dom.tiltSpreadDeg.value))}°`;
    }
  }
  document.querySelectorAll('.tilt-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!dom.tiltDeg) return;
      const deg = parseFloat(btn.getAttribute('data-deg'));
      if (!isFinite(deg)) return;
      dom.tiltDeg.value = String(deg);
      // Synthesize an 'input' event so the slider's handler runs once
      // and we don't duplicate the syncTrainerParams call here.
      dom.tiltDeg.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  if (dom.tiltDirection) {
    dom.tiltDirection.addEventListener('change', () => {
      syncTrainerParams();
      // Force-reset the preview/test RNGs and the angle-cycle index
      // so the next rollout immediately reflects the new direction.
      // Without these resets the cached RNG and index can keep the
      // user on the previous direction's next-in-sequence angle for
      // several rollouts, which looks exactly like "the dropdown has
      // no effect." Cheap to wipe; the next rollout reseeds lazily.
      app._testAngleRng = null;
      app._displayAngleRng = null;
      app._previewAngleIdx = -1;
      if (app.trainer) rebuildDisplayState();
    });
  }
  dom.showGhosts.addEventListener('change', () => {
    if (dom.ghostCountRow) {
      dom.ghostCountRow.style.display = dom.showGhosts.checked ? '' : 'none';
    }
    rebuildGhosts();
  });
  if (dom.showGhosts.checked && dom.ghostCountRow) dom.ghostCountRow.style.display = '';
  if (dom.ghostCount) {
    bindRange(dom.ghostCount, dom.ghostCountVal, v => String(parseInt(v, 10)));
    dom.ghostCount.addEventListener('input', rebuildGhosts);
  }
  dom.showGenomeSpace.addEventListener('change', () => {
    dom.genomePanel.style.display = dom.showGenomeSpace.checked ? '' : 'none';
  });
  // Projection mode: PCA vs Random vs Distance matrix. Switching flushes the
  // cache so the next frame recomputes; reroll-random button reseeds the
  // random basis (only meaningful in 'random' mode).
  if (dom.projectionMode) {
    dom.projectionMode.addEventListener('change', () => {
      const mode = dom.projectionMode.value;
      dom.rerollRandomRow.style.display = mode === 'random' ? '' : 'none';
      if (app.genomeRenderer) app.genomeRenderer.invalidate();
    });
  }
  if (dom.rerollRandomBtn) {
    dom.rerollRandomBtn.addEventListener('click', () => {
      if (app.genomeRenderer && app.genomeRenderer.rerollRandomBasis) {
        app.genomeRenderer.rerollRandomBasis();
      }
    });
  }

  // Show / hide the ball params block based on the active setup. Also auto-
  // select the matching objective when switching INTO a ball setup so the
  // user doesn't have to remember to do it manually.
  function refreshBallUI() {
    // Ball params block is relevant for any setup that exposes a ball
    // (currently ball-single + golf; future ball-on-pole will also use it).
    const sid = dom.setupSelect.value;
    const isBallish = sid === 'ball-single' || sid === 'golf' || sid === 'golf-challenge' || sid === 'putt';
    if (dom.ballParamsBlock) dom.ballParamsBlock.style.display = isBallish ? '' : 'none';
    if (isBallish) {
      const mode = dom.ballMode.value;
      dom.ballSpawnDelayRow.style.display = mode === 'timed' ? '' : 'none';
      // Drift speed is reused for pitched mode (= incoming pitch speed).
      dom.ballDriftSpeedRow.style.display = (mode === 'drift' || mode === 'pitched') ? '' : 'none';
    }
    // Golf params block — visible only on golf-family setups (currently
    // 'golf' + 'putt'). The hole-width slider is the headline curriculum
    // knob (start wide, shrink over training); hole-center is curriculum-
    // able for moving-target practice.
    const isGolf = sid === 'golf' || sid === 'golf-challenge' || sid === 'putt';
    if (dom.golfParamsBlock) dom.golfParamsBlock.style.display = isGolf ? '' : 'none';
    // Obstacle count is golf-only (not putt — putt is the no-obstacle
    // variant by design). Hide the row on putt to avoid the false
    // implication that the slider does something there.
    if (dom.golfObstaclesRow) dom.golfObstaclesRow.style.display = (['golf','golf-challenge'].includes(sid)) ? '' : 'none';
    // Single-pendulum observation encoding (the dropout memory task). Only the
    // 'single' setup implements setObservationMode('blind-dropout').
    if (dom.singleObsBlock) {
      dom.singleObsBlock.style.display = (sid === 'single') ? '' : 'none';
    }
    if (dom.singleDropoutKRow && dom.singleObservationMode) {
      dom.singleDropoutKRow.style.display =
        dom.singleObservationMode.value === 'blind-dropout' ? '' : 'none';
    }
    // Dodge-only block.
    const isDodge = sid === 'dodge';
    if (dom.dodgeParamsBlock) dom.dodgeParamsBlock.style.display = isDodge ? '' : 'none';
    // Sub-row visibility within the dodge block depends on the chosen
    // pattern: leadTime + predictOrder for predict_and_aimed; bullets-
    // per-wave for sweep. Other patterns hide them to reduce clutter.
    refreshDodgePatternRows();
  }
  function refreshDodgePatternRows() {
    if (!dom.dodgePattern) return;
    const pat = dom.dodgePattern.value;
    const isPredict = (pat === 'predict_and_aimed');
    const isSweep   = (pat === 'sweep');
    if (dom.dodgeLeadTimeRow)       dom.dodgeLeadTimeRow.style.display       = isPredict ? '' : 'none';
    if (dom.dodgePredictOrderRow)   dom.dodgePredictOrderRow.style.display   = isPredict ? '' : 'none';
    if (dom.dodgeBulletsPerWaveRow) dom.dodgeBulletsPerWaveRow.style.display = isSweep ? '' : 'none';
  }
  refreshBallUI();
  // Auto-pick the right objective when the ball mode changes — pitched
  // mode wants hit_ball_back; the others default to hit_ball_fast. Also
  // sync trainer params + rebuild display so the new mode is in effect
  // immediately (otherwise the in-flight ball state keeps the old mode).
  dom.ballMode.addEventListener('change', () => {
    refreshBallUI();
    // Only the ball-single setup has the auto-pick-pitched-objective rule;
    // golf always uses ball_in_hole regardless of ball mode.
    if (dom.setupSelect.value === 'ball-single') {
      const mode = dom.ballMode.value;
      const hasBack = Array.from(dom.objectiveSelect.options).some(o => o.value === 'hit_ball_back');
      if (mode === 'pitched' && hasBack) dom.objectiveSelect.value = 'hit_ball_back';
      else if (dom.objectiveSelect.value === 'hit_ball_back') {
        dom.objectiveSelect.value = 'hit_ball_fast';
      }
    }
    syncTrainerParams();
    if (app.trainer) rebuildDisplayState();
  });
  // Per-slider live updates: every ball param needs to push into
  // trainer.params and rebuild the display so the visible scene reflects
  // the new value. Without this the slider just shows a label change but
  // the world stays stuck on the old config.
  function applyBallParamChange() {
    syncTrainerParams();
    if (app.trainer) rebuildDisplayState();
  }
  [dom.ballSpawnX, dom.ballSpawnY, dom.ballSpawnDelay, dom.ballDriftSpeed,
   dom.ballMass, dom.ballRadius, dom.ballRestitution,
   // Golf hole sliders — same flow: syncTrainerParams + rebuild display
   // so the visible hole resizes immediately as the user drags.
   dom.holeWidth, dom.holeCenter,
   // Golf-only knobs added in this round: jitter magnitude + obstacle
   // count. Same flow so changes are immediately visible in the sim.
   dom.holeCenterJitterMag, dom.golfObstacles].forEach(el => {
    if (el) el.addEventListener('change', applyBallParamChange);
  });
  // Hole jitter toggle: reveals the magnitude slider and propagates to
  // trainer params for the next gen's per-rollout pre-sample.
  if (dom.holeCenterJitterOn) {
    dom.holeCenterJitterOn.addEventListener('change', () => {
      if (dom.holeCenterJitterMagRow) {
        dom.holeCenterJitterMagRow.style.display = dom.holeCenterJitterOn.checked ? '' : 'none';
      }
      syncTrainerParams();
    });
  }
  if (dom.holeCenterJitterMag && dom.holeCenterJitterMagVal) {
    bindRange(dom.holeCenterJitterMag, dom.holeCenterJitterMagVal, v => parseInt(v, 10) + ' px');
  }
  if (dom.golfObstacles && dom.golfObstaclesVal) {
    bindRange(dom.golfObstacles, dom.golfObstaclesVal, v => String(parseInt(v, 10)));
  }
  // Dodge-mode bindings. The pattern dropdown also flips visibility
  // of the pattern-specific sub-rows so the user only sees the knobs
  // relevant to the active pattern.
  if (dom.dodgePattern) {
    dom.dodgePattern.addEventListener('change', () => {
      refreshDodgePatternRows();
      applyBallParamChange();
    });
  }
  if (dom.dodgePredictOrder) {
    dom.dodgePredictOrder.addEventListener('change', applyBallParamChange);
  }
  // Observation-mode change rebuilds the trainer because the input
  // count differs between top-K (20) and grid (260). Mutate the setup's
  // observationCount BEFORE rebuilding so genomes are sized correctly.
  if (dom.dodgeObservationMode) {
    dom.dodgeObservationMode.addEventListener('change', () => {
      const mode = dom.dodgeObservationMode.value;
      const setup = BF.setups.getSetup('dodge');
      if (setup && setup.setObservationMode) setup.setObservationMode(mode);
      // (Previously this handler also auto-capped popSize / rollouts when
      // switching to grid or multiscale obs, on the theory that those
      // modes were too compute-heavy at default pop=120. That cap was a
      // band-aid for the CMA-ES Jacobi freeze at n=550 params (cnn-
      // multiscale's old default config) -- root-caused and fixed by
      // shrinking the config to ~226 params instead. With the underlying
      // cause gone, the auto-cap only created a confusing regression:
      // pop dropped to 30 when the user picked multiscale, then never
      // restored when switching to a different setup or back to topk,
      // leaving pendulum runs unexpectedly running at pop=30. Cap
      // removed; presets cover the "appropriate sizing for this
      // pipeline" job and the CMA-ES n>300 warning catches the
      // remaining genuine-freeze risk.)
      syncTrainerParams();
      // Only rebuild if we're actually on the dodge setup; otherwise the
      // mode change just affects the next time the user switches to it.
      if (app.trainer && app.trainer.setupId === 'dodge') {
        rebuildTrainerFromUI();
      }
    });
  }
  if (dom.dodgeSpawnRate && dom.dodgeSpawnRateVal) {
    bindRange(dom.dodgeSpawnRate, dom.dodgeSpawnRateVal, v => parseFloat(v).toFixed(2));
  }
  if (dom.dodgeBulletSpeed && dom.dodgeBulletSpeedVal) {
    bindRange(dom.dodgeBulletSpeed, dom.dodgeBulletSpeedVal, v => parseInt(v, 10) + ' px/s');
  }
  if (dom.dodgeBulletRadius && dom.dodgeBulletRadiusVal) {
    bindRange(dom.dodgeBulletRadius, dom.dodgeBulletRadiusVal, v => String(parseInt(v, 10)));
  }
  if (dom.dodgeLeadTime && dom.dodgeLeadTimeVal) {
    bindRange(dom.dodgeLeadTime, dom.dodgeLeadTimeVal, v => parseFloat(v).toFixed(2));
  }
  if (dom.dodgeBulletsPerWave && dom.dodgeBulletsPerWaveVal) {
    bindRange(dom.dodgeBulletsPerWave, dom.dodgeBulletsPerWaveVal, v => String(parseInt(v, 10)));
  }
  // Live-rebuild the display when any dodge slider changes so the user
  // sees the new bullet speed / spawn rate immediately without
  // restarting training.
  [dom.dodgeSpawnRate, dom.dodgeBulletSpeed, dom.dodgeBulletRadius,
   dom.dodgeLeadTime, dom.dodgeBulletsPerWave,
   dom.dodgeNoDiePenalty, dom.dodgeInvulnSeconds].forEach(el => {
    if (el) el.addEventListener('change', applyBallParamChange);
  });
  // Shared with preset loads, which set .checked without dispatching changes.
  function refreshDodgeNoDieUI() {
    const on = !!(dom.dodgeNoDie && dom.dodgeNoDie.checked);
    if (dom.dodgeNoDiePenaltyRow) dom.dodgeNoDiePenaltyRow.style.display = on ? '' : 'none';
    if (dom.dodgeInvulnSecondsRow) dom.dodgeInvulnSecondsRow.style.display = on ? '' : 'none';
  }
  // No-die toggle reveals the penalty + invuln sliders.
  if (dom.dodgeNoDie) {
    dom.dodgeNoDie.addEventListener('change', () => {
      refreshDodgeNoDieUI();
      applyBallParamChange();
    });
  }
  // No-reset toggle: pure trainer-params flag, no UI sub-controls. Just
  // sync params so the display tick / runOneGeneration paths see the new
  // value on their next iteration.
  if (dom.dodgeNoReset) {
    dom.dodgeNoReset.addEventListener('change', () => {
      syncTrainerParams();
    });
  }
  // Lifespan-mode toggle. Pure objective-shape flag, no sub-controls.
  // Also refresh the objective-explainer text so the user sees the
  // updated reward-shape description immediately.
  if (dom.dodgeLifespanMode) {
    dom.dodgeLifespanMode.addEventListener('change', () => {
      syncTrainerParams();
      if (typeof refreshObjectiveExplain === 'function') refreshObjectiveExplain();
    });
  }
  if (dom.dodgeNoDiePenalty && dom.dodgeNoDiePenaltyVal) {
    bindRange(dom.dodgeNoDiePenalty, dom.dodgeNoDiePenaltyVal, v => parseFloat(v).toFixed(1));
  }
  if (dom.dodgeInvulnSeconds && dom.dodgeInvulnSecondsVal) {
    bindRange(dom.dodgeInvulnSeconds, dom.dodgeInvulnSecondsVal, v => parseFloat(v).toFixed(2));
  }

  dom.setupSelect.addEventListener('change', () => {
    app.pendulumReplayContext=null;
    const setupId = dom.setupSelect.value;
    if(dom.modeSelect.value==='dodge-scorer' && setupId!=='dodge')dom.modeSelect.value='neat-full';
    if (isSingleSwingupMode() && setupId !== 'single') dom.modeSelect.value='neat-full';
    app.training = false;
    app.testing = false;
    dom.testBtn.classList.remove('active');
    applySetupParamPreset(setupId);
    // Filter the objective dropdown to the new setup's relevant objectives
    // and, when filtering, default to its primary objective. Generalizes
    // the old ball/golf/dodge auto-selects and adds chain-reach.
    refreshObjectiveOptions();
    syncSetupObservationCounts();
    if (!app.trainer || app.trainer.setupId !== setupId) {
      // Reset BEFORE building the new trainer so the new trainer's
      // first gen doesn't inherit any HUD/peak state from the old one.
      resetTrainerSessionState();
      app.trainer = T.makeTrainer({
        setupId: setupId,
        seed: resolveSeed(),
        params: readParams().train,
        mutationParams: readParams().mut,
      });
    }
    refreshBallUI();
    updateTopologyHint();
    updateCartAccelHint();
    updateHolePreview();
    updateSetupVisibility(setupId);
    populateBehaviorAxes();
    syncBehaviorArchiveFromUI();
    // Re-evaluate per-option visibility on the policy dropdown. Each
    // setup gates a different subset of CNN policies (pendulum-family
    // sees cnn/cnn3d; dodge sees cnn-grid/cnn-multiscale). Without
    // this call the dropdown stays stuck in the previous setup's
    // visibility state -- e.g. switching FROM pendulum TO dodge would
    // leave the user staring at "CNN -- phase-space" and wondering
    // where the multi-scale option went.
    refreshAlgoUI();
    // Switching INTO a golf-family setup while curriculum is already on
    // should scaffold the easy→hard ramps for that setup, so the user
    // doesn't have to remember to re-enable them per setup.
    if (typeof maybeScaffoldGolfCurriculum === 'function') maybeScaffoldGolfCurriculum();
    rebuildDisplayState();
    app.genomeRenderer.invalidate();
  });

  dom.trainBtn.addEventListener('click', async () => {
    if(isDodgeScorerMode()) {
      app.training=false;app._resumeTrainAfterTest=false;if(!app.testing)dom.testBtn.click();
      app.paused=false;dom.pauseBtn.classList.remove('active');return;
    }
    // Nonlearning approaches run the visible controller. Do not repeatedly
    // benchmark a planner under a button that used to say "Train".
    if (!refreshApproachUI().learns) {
      app.training = false;
      app._resumeTrainAfterTest = false;
      if (!app.testing) dom.testBtn.click();
      app.paused = false;
      if (dom.pauseBtn) dom.pauseBtn.classList.remove('active');
      return;
    }
    if (app.training) return;
    app.testing = false;
    dom.testBtn.classList.remove('active');
    dom.trainBtn.classList.add('active');
    if (dom.pauseBtn) dom.pauseBtn.classList.remove('active');
    // Make sure the worker pool is attached + initialized for the
    // current trainer BEFORE the training loop starts. Pool init is
    // async (workers ack their init); without awaiting, the first gen
    // would race with worker startup and might silently fall back to
    // serial. ensurePoolAttached returns a Promise so this is cheap
    // when the pool's already inited for the current signature.
    const startingTrainer = app.trainer;
    if (app._relinkPool) {
      await app._relinkPool();
    }
    if (app.trainer !== startingTrainer || isDodgeScorerMode()) return;
    app.training = true;
    app.paused = false;
    app.autoStopReason = null;
    // Stamp wall-time start so the gens/sec readout has a stable
    // anchor. Resets every Train click (not every pause/resume) so
    // the reported rate is over the full run, not the most recent
    // unpaused window.
    if (app.trainerStartedAt === 0 || (app.trainer && app.trainer.generation === 0)) {
      app.trainerStartedAt = BF.util.nowMs();
    }
    trainContinuously();
  });

  dom.testBtn.addEventListener('click', () => {
    // Freeze the displayed actor immediately; an unfinished optimizer update
    // must not replace it after the user has entered deterministic playback.
    app.ppoRunToken=(app.ppoRunToken||0)+1;
    // Toggle test mode.
    app.testing = !app.testing;
    // The active Core settings (sim speed, full power, WASM) just
    // switched. Sim speed is read every tick (getActiveSimSpeed), so
    // it picks itself up. Full power + WASM have side effects (body
    // class, BF.wasm.useFor* flags) -- re-apply both so the body
    // class / WASM dispatch matches the now-active checkbox.
    if (typeof app._applyFullPower === 'function') app._applyFullPower();
    if (typeof app._applyWasmToggle === 'function') app._applyWasmToggle();
    if (app.testing) {
      // Remember whether training was running so leaving Test can resume it
      // — without this, Test permanently parked the run ("it never
      // proceeds") until the user figured out they had to press Train again.
      app._resumeTrainAfterTest = app.training;
      app.training = false; // stop training
      app.paused = false;
      dom.testBtn.classList.add('active');
      // Test mode owns the active highlight; Train and Pause give it
      // up so the topbar always shows exactly one current mode.
      if (dom.trainBtn) dom.trainBtn.classList.remove('active');
      if (dom.pauseBtn) dom.pauseBtn.classList.remove('active');
      // Pull every slider/select into trainer.params NOW so the first
      // test rollout uses the live UI state (gravity, damping, ball
      // spawn, hole geometry, …), not whatever the trainer was last
      // synced to mid-training. The startAngle path already reads the
      // difficulty slider directly, but the other physics/scene
      // params live on trainer.params and could otherwise lag.
      syncTrainerParams();
      // New test sessions should replay from the run seed, not continue any
      // old preview disturbance or randomized-start streams.
      app._testAngleRng = null;
      app._pushDisplayRng = null;
      app._pushTickRng = null;
      app._holeDisplayRng = null;
      app.testStats = BF.replayMetrics.createStats(BF.util.nowMs());
      rebuildDisplayState(); // fresh randomized scenario
      app.simRenderer.clearTrail();
      // Diffsim modes: swap the short training clip for a full evalSeconds
      // champion rollout so Test shows sustained behavior, not a ~1.5s loop.
      if (isDiffsimMode()) regenDiffsimTestTrajectory();
    } else {
      dom.testBtn.classList.remove('active');
      // Leaving test: resume training if it was running when Test was
      // pressed (the Train handler re-attaches the worker pool itself).
      if (app._resumeTrainAfterTest) {
        app._resumeTrainAfterTest = false;
        if (dom.trainBtn) dom.trainBtn.click();
      }
    }
  });

  // ----- Edit mode -----
  // Toggling edit mode: pauses the sim (and remembers training state so
  // we can resume on exit), enables drag handles on the canvas, swaps
  // cursor styling. Only currently supports ball spawn dragging — design
  // is generic enough to extend to other handles in Phase 2.
  function setEditMode(on) {
    if (on === app.editMode) return;
    app.editMode = on;
    if (on) {
      app.editPrevState = {
        training: app.training,
        testing: app.testing,
        paused: app.paused,
      };
      app.training = false;
      app.testing = false;
      app.paused = true;
      dom.editBtn.classList.add('edit-active');
      dom.editBtn.textContent = 'Done';
      dom.simCanvas.classList.add('edit-mode');
    } else {
      // Cancel any in-flight drag.
      app.editDrag = null;
      dom.simCanvas.classList.remove('edit-mode', 'edit-hover', 'edit-dragging');
      dom.editBtn.classList.remove('edit-active');
      dom.editBtn.textContent = 'Edit';
      // Restore previous run state (don't auto-resume training; keep the
      // user's intent — they wanted to edit, then look at the result).
      if (app.editPrevState) {
        app.paused = app.editPrevState.paused;
        app.editPrevState = null;
      }
      // Rebuild display state so the new spawn position is reflected.
      if (app.trainer) rebuildDisplayState();
    }
  }
  dom.editBtn.addEventListener('click', () => setEditMode(!app.editMode));

  // Hit-test: which draggable handle (if any) is the cursor currently over?
  // Returns one of:
  //   { kind: 'ball-spawn' }    if hovering the ball spawn marker
  //   null                       otherwise
  // Hit radius scales with the rendered handle radius so it works on any
  // canvas size.
  function hitTestEditHandle(canvasX, canvasY) {
    if (!app.showState || !app.showState.ball) return null;
    const ball = app.showState.ball;
    const screen = app.simRenderer.worldToScreen(ball.spawnX, ball.spawnY);
    if (!screen) return null;
    const dx = canvasX - screen.x, dy = canvasY - screen.y;
    const hitR = (ball.radius || 14) + 8;
    if (dx * dx + dy * dy <= hitR * hitR) return { kind: 'ball-spawn' };
    return null;
  }

  dom.simCanvas.addEventListener('mousemove', (e) => {
    if (!app.editMode) return;
    const rect = dom.simCanvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    if (app.editDrag) {
      // Active drag — convert mouse to world coords, snap to slider step.
      const w = app.simRenderer.worldFromScreen(cx, cy);
      if (!w) return;
      if (app.editDrag.kind === 'ball-spawn') {
        // Clamp to the slider ranges so we never set out-of-range values.
        const sxMin = parseFloat(dom.ballSpawnX.min);
        const sxMax = parseFloat(dom.ballSpawnX.max);
        const syMin = parseFloat(dom.ballSpawnY.min);
        const syMax = parseFloat(dom.ballSpawnY.max);
        const stepX = parseFloat(dom.ballSpawnX.step) || 1;
        const stepY = parseFloat(dom.ballSpawnY.step) || 1;
        const newX = clamp(Math.round(w.x / stepX) * stepX, sxMin, sxMax);
        const newY = clamp(Math.round(w.y / stepY) * stepY, syMin, syMax);
        // Update slider DOM + visible value labels (so the user sees the
        // numbers update live), then push to the trainer + showState so
        // the marker on canvas redraws at the new position next frame.
        dom.ballSpawnX.value = String(newX);
        dom.ballSpawnY.value = String(newY);
        dom.ballSpawnXVal.textContent = String(newX);
        dom.ballSpawnYVal.textContent = String(newY);
        if (app.trainer) {
          app.trainer.params.ballSpawnX = newX;
          app.trainer.params.ballSpawnY = newY;
        }
        // Mutate the in-flight ball state so the marker tracks the cursor
        // immediately. The next rebuildDisplayState picks up the new values
        // properly; this is just for visual feedback during the drag.
        app.showState.ball.spawnX = newX;
        app.showState.ball.spawnY = newY;
      }
    } else {
      // Hover — change cursor over draggable handles.
      const hit = hitTestEditHandle(cx, cy);
      if (hit) dom.simCanvas.classList.add('edit-hover');
      else dom.simCanvas.classList.remove('edit-hover');
    }
  });
  dom.simCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;   // MMB is the camera pan, not an edit drag
    if (!app.editMode) return;
    const rect = dom.simCanvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const hit = hitTestEditHandle(cx, cy);
    if (hit) {
      app.editDrag = hit;
      dom.simCanvas.classList.add('edit-dragging');
      dom.simCanvas.classList.remove('edit-hover');
      e.preventDefault();
    }
  });
  function endDrag() {
    if (!app.editDrag) return;
    app.editDrag = null;
    dom.simCanvas.classList.remove('edit-dragging');
    // Rebuild display state with the new params so the ball respawns at
    // the dragged position when the sim resumes.
    if (app.trainer) rebuildDisplayState();
  }
  dom.simCanvas.addEventListener('mouseup', endDrag);
  dom.simCanvas.addEventListener('mouseleave', endDrag);

  // ---- Viewport camera: wheel zoom (cursor-anchored) + MMB pan ----
  // All world->screen mapping funnels through the renderer's W/H closures,
  // and every input handler already inverse-transforms via worldFromScreen —
  // so the camera composes in canvas-sim.js and the handlers here only
  // forward DOM events. Double-click (any button) resets the framing; so
  // does switching setups (renderer.setSetup).
  dom.simCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();   // needs passive:false or the page scrolls too
    const rect = dom.simCanvas.getBoundingClientRect();
    app.simRenderer.zoomAt(e.clientX - rect.left, e.clientY - rect.top,
                           Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  dom.simCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 1) return;   // middle button only
    e.preventDefault();           // suppresses Windows middle-click autoscroll
    app._camPan = { id: e.pointerId, x: e.clientX, y: e.clientY };
    dom.simCanvas.setPointerCapture(e.pointerId);
    dom.simCanvas.style.cursor = 'grabbing';
  });
  dom.simCanvas.addEventListener('pointermove', (e) => {
    if (!app._camPan || e.pointerId !== app._camPan.id) return;
    app.simRenderer.panBy(e.clientX - app._camPan.x, e.clientY - app._camPan.y);
    app._camPan.x = e.clientX; app._camPan.y = e.clientY;
  });
  const endCamPan = (e) => {
    if (!app._camPan || (e.pointerId != null && e.pointerId !== app._camPan.id)) return;
    app._camPan = null;
    dom.simCanvas.style.cursor = '';
  };
  dom.simCanvas.addEventListener('pointerup', endCamPan);
  dom.simCanvas.addEventListener('pointercancel', endCamPan);
  dom.simCanvas.addEventListener('dblclick', () => app.simRenderer.resetCamera());
  // Belt-and-braces: some browsers fire auxclick's default on MMB release.
  dom.simCanvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

  dom.pauseBtn.addEventListener('click', () => {
    app.paused = !app.paused;
    if (app.training && app.paused) {
      app.training = false;
    }
    // Mode-button highlight tracks the paused/active state so the
    // user can see at a glance "I'm paused" vs "I'm training/testing".
    if (app.paused) {
      dom.pauseBtn.classList.add('active');
      if (dom.trainBtn) dom.trainBtn.classList.remove('active');
      if (dom.testBtn)  dom.testBtn.classList.remove('active');
    } else {
      dom.pauseBtn.classList.remove('active');
      // Resuming returns highlight to whichever mode is live.
      if (app.training) {
        if (dom.trainBtn) dom.trainBtn.classList.add('active');
      } else if (app.testing) {
        if (dom.testBtn) dom.testBtn.classList.add('active');
      }
    }
  });

  dom.resetBtn.addEventListener('click', () => {
    rebuildDisplayState();
    app.simRenderer.clearTrail();
    if (app.testing) app.testStats = BF.replayMetrics.createStats(BF.util.nowMs());
    // showState was rebuilt -> re-derive the diffsim frame->display scale.
    if (isDiffsimMode()) {
      if (app.diffsimRun?.liveReference) resetLiveReferenceFromScene();
      computeDiffsimDisplayScale();
    }
  });

  function nudgeLiveController(sign) {
    if (!app.testing || !app.showState) return;
    const status = document.getElementById('liveNudgeStatus');
    const live = app.diffsimRun?.liveReference;
    if (isDiffsimMode() && live) {
      const acceleration = sign * (live.validatedPulseStrength || 3000);
      if (!BF.rigidReference.nudge(live, {acceleration, duration:.25})) {
        status.textContent = live.finite ? 'Pulse not applied' : 'Controller diverged · Reset to retry';
        return;
      }
      status.textContent = `${app.paused ? 'Queued pivot pulse' : 'Pivot pulse'} ${acceleration} × 0.25s`;
      BF.disturb.recordVisual(app.showState, {target:app.showState.cartIdx,fx:acceleration,fy:0,scale:1,acceleration:true});
      app.showState.manualPushCount = (app.showState.manualPushCount || 0) + 1;
    } else if (!isDiffsimMode()) {
      const state = app.showState, strength = parseFloat(dom.pushStrength.value) || 200;
      // Keep manual target selection separate from automatic disturbance RNGs.
      // Reuse the production selector so triple mid-joints and random free nodes
      // have exactly the same meaning as in the training disturbance controls.
      if (!state.manualPushRng) state.manualPushRng = makeDisplayRng(0x62C3_BA19);
      const target = BF.disturb.pickTarget(state, {pushTarget:dom.pushTarget.value}, state.manualPushRng);
      BF.physics.applyImpulse(state.world, target, sign * strength, 0);
      BF.disturb.recordVisual(state, {target,fx:sign*strength,fy:0,scale:1,instant:true});
      state.manualPushCount = (state.manualPushCount || 0) + 1;
      status.textContent = `Impulse ${sign * strength} · ${state.world.nodes[target].label || dom.pushTarget.value}`;
    }
  }
  document.getElementById('nudgeLeftBtn').addEventListener('click', () => nudgeLiveController(-1));
  document.getElementById('nudgeRightBtn').addEventListener('click', () => nudgeLiveController(1));

  dom.newRunBtn.addEventListener('click', () => {
    app.training = false;
    app.testing = false;
    dom.testBtn.classList.remove('active');
    // New run = new trainer state, so clear every app-level cache
    // coupled to the previous trainer (HUD glow trackers, live-preview
    // peak, preview-angle cycler). Otherwise the next-gen HUD inherits
    // the previous run's "recent improvement" glow on gen 0.
    resetTrainerSessionState();
    if (app.trainer) {
      T.newRun(app.trainer);
      rebuildDisplayState();
      app.simRenderer.clearTrail();
      app.genomeRenderer.invalidate();
      // Diffsim mode: a new run means a fresh engine (re-init weights /
      // re-design the controller), then re-scale the display to the rebuilt
      // world. The facade trainer was just reset above -> clean chart.
      if (isDiffsimMode() && BF.diffsimMode) {
        app.diffsimRun = BF.diffsimMode.create(dom.modeSelect.value, diffsimOptsFromUI());
        computeDiffsimDisplayScale();
      }
    }
    // Reset the gens/sec start anchor. The clock starts the moment
    // the user clicks Train next (handled in the trainBtn handler).
    app.trainerStartedAt = 0;
    // Clear checkpoint — it belonged to a different run.
    app.checkpoint = null;
    app.checkpointGen = null;
    refreshCheckpointUI();
  });

  function refreshCheckpointUI() {
    if (app.checkpoint) {
      dom.restoreBtn.disabled = false;
      dom.restoreBtn.textContent = `Restore · ${app.checkpoint.kind==='bf-ppo-ui-checkpoint-v1'?'update':'gen'} ${app.checkpointGen}`;
    } else {
      dom.restoreBtn.disabled = true;
      dom.restoreBtn.textContent = 'Restore';
    }
  }

  dom.saveBtn.addEventListener('click', async () => {
    if (!app.trainer) return;
    if(isDodgeScorerMode()) {
      app.checkpoint={kind:'bf-dodge-ui-checkpoint-v1',record:captureChampionRecord()};app.checkpointGen=app.dodgeScorerRecord.generation;
      refreshCheckpointUI();return;
    }
    if(dom.modeSelect.value==='ppo'){
      app.training=false;app.paused=true;
      const owner=app.trainer;
      if(app.ppoPendingUpdate)await app.ppoPendingUpdate;
      if(app.trainer!==owner||!app.ppoRun)return;
      app.checkpoint={kind:'bf-ppo-ui-checkpoint-v1',engine:app.ppoRun.snapshot(),
        record:app.ppoRun.exportRecord(),history:app.trainer.history.slice()};
      app.checkpointGen=app.trainer.generation;
      document.getElementById('ppoTrainingStatus').textContent='PPO checkpoint saved: actor, critic, Adam optimizer, random streams and history. Restore restarts the physical episodes.';
      refreshCheckpointUI();return;
    }
    app.checkpoint = T.saveCheckpoint(app.trainer);
    app.checkpointGen = app.trainer.generation;
    refreshCheckpointUI();
  });

  dom.restoreBtn.addEventListener('click', () => {
    if (!app.checkpoint || !app.trainer) return;
    // Stop training/testing first so we don't race the loops.
    app.training = false;
    app.testing = false;
    dom.testBtn.classList.remove('active');
    if(app.checkpoint.kind==='bf-ppo-ui-checkpoint-v1'){
      const saved=app.checkpoint,seconds=saved.engine.config.episodeSeconds;
      installChampionRecord({...saved.record,
        trainerParams:{...saved.record.trainerParams,evalSeconds:seconds},
        uiParams:{...saved.record.uiParams,evalSeconds:seconds}},'checkpoint');
      app.testing=false;app.paused=true;app._resumeTrainAfterTest=false;
      dom.testBtn.classList.remove('active');dom.pauseBtn.classList.add('active');
      app.ppoRun=BF.ppoTrainer.restoreCheckpoint(saved.engine);
      app.ppoSignature=JSON.stringify(ppoSceneFromUI());
      app.trainer.generation=saved.engine.update;app.trainer.history=saved.history.slice();
      app.trainer.currentBest=app.trainer.bestEver;
      document.getElementById('ppoTrainingStatus').textContent='PPO restored: learned actor, critic, Adam state, random streams and history retained; physical episodes restarted. Press Train to continue.';
      rebuildDisplayState();app.genomeRenderer.invalidate();return;
    }
    if(app.checkpoint.kind==='bf-dodge-ui-checkpoint-v1') { installDodgeScorer(app.checkpoint.record);return; }
    T.restoreCheckpoint(app.trainer, app.checkpoint);
    rebuildDisplayState();
    app.simRenderer.clearTrail();
    app.genomeRenderer.invalidate();
  });

  // Saved architecture includes values without sliders (phase-space ranges,
  // kernels, pooling). Keep it until the user edits a relevant control.
  function savedPolicyConfig(type, fallback) {
    const saved = app.importedPolicyConfig;
    return saved && saved.type === type && saved.setupId === dom.setupSelect.value ? saved.config : fallback;
  }
  const policyConfigControls = ['cnnImageSize', 'cnnFilters', 'cnnDense', 'cnnHistory', 'cnnChannels',
    'cnn3dInputMode', 'cnn3dDepth', 'cnn3dImageSize', 'cnn3dFilters', 'cnn3dFilterDepth', 'cnn3dDense',
    'cnnMultiscaleSize', 'cnnMultiscaleFilters', 'cnnMultiscaleDense', 'recurrentMem', 'recurrentHidden', 'recurrentLeak'];
  for (const key of policyConfigControls) if (dom[key]) {
    for (const event of ['input', 'change']) dom[key].addEventListener(event, () => { app.importedPolicyConfig = null; }, true);
  }
  function captureChampionRecord(extra, target) {
    if(isDodgeScorerMode())return {...JSON.parse(JSON.stringify(app.dodgeScorerRecord)),...extra,
      worldParams:JSON.parse(JSON.stringify(app.trainer.params)),seed:app.trainer.seed,savedAt:new Date().toISOString(),algo:'cmaes',setupId:'dodge',policyType:'shared-scorer'};
    if (!app.trainer || !app.trainer.bestEver) throw new Error('Train or load a champion first.');
    const uiParams = {};
    for (const [key, el] of Object.entries(dom)) {
      if (!el || !['INPUT', 'SELECT'].includes(el.tagName) || el.type === 'file') continue;
      uiParams[key] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return BF.championIO.capture(app.trainer, { uiParams, ...extra }, target);
  }
  dom.exportBestBtn.addEventListener('click', () => {
    try {
      const record = captureChampionRecord();
      const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url;
      a.download = `bf-champion-${record.algo}-${record.policyType}-${record.setupId}-gen${record.generation}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { alert('Could not export: ' + e.message); }
  });

  // v2 restores scene/UI and the runnable policy together. Legacy v1 records
  // remain valid MLP/NEAT graphs; a weightless CNN placeholder is rejected.
  function formatFitness(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
  }

  function installDodgeScorer(data,presetId) {
    BF.dodgeTemporal.validate(data);
    const id=presetId || 'loaded-dodge-scorer';
    RUN_PRESETS[id]=dodgeScorerPreset(JSON.parse(JSON.stringify(data)));
    if(!Array.from(dom.runPresetSelect.options).some(o=>o.value===id))dom.runPresetSelect.add(new Option('Loaded learned dodge scorer',id));
    app.training=false;app.testing=false;app._resumeTrainAfterTest=false;loadRunPreset(id);syncPresetDropdowns(id);
    if(Number.isInteger(data.seed)){app.trainer.seed=data.seed;app.trainer.rng=BF.util.makeRng(data.seed);dom.seedInput.value=String(data.seed);}
    app.trainer.generation=data.generation || 0;
    if(!app.testing)dom.testBtn.click();app.paused=false;dom.pauseBtn.classList.remove('active');
    chooseVizTab('network');return true;
  }
  function installChampionRecord(data, sourceLabel, showcasePresetId) {
    if(data?.kind==='bf-dodge-lookahead-v1')return installDodgeScorer(data,showcasePresetId);
    BF.championIO.validate(data);
    app.training = false;
    app.testing = false;
    app._resumeTrainAfterTest = false;
    dom.testBtn.classList.remove('active');
    if (data.kind === 'bf-policy-v2') {
      const id = 'loaded-champion';
      RUN_PRESETS[id] = BF.championIO.presetOf(data);
      if (dom.runPresetSelect && !Array.from(dom.runPresetSelect.options).some(o => o.value === id)) {
        dom.runPresetSelect.add(new Option('Loaded champion', id));
      }
      loadRunPreset(id);
    } else {
      if (!app.trainer) throw new Error('Start a compatible scene before importing this legacy network.');
      if (data.setupId && data.setupId !== app.trainer.setupId) throw new Error('Legacy champion: first select its scene (' + data.setupId + ').');
      if (app.trainer.params.policyType !== 'mlp') {
        dom.policyTypeSelect.value = 'mlp';
        dom.policyTypeSelect.dispatchEvent(new Event('change'));
      }
    }
    BF.championIO.install(app.trainer, data);
    app.loadedPolicyGenome = app.trainer.bestEver;
    app.loadedPolicyGeneration = data.generation;
    // Rebuilds above create a new population seed. Restore the saved run seed
    // afterwards so the recorded controller sees a reproducible preview world.
    // Use the canonical factory: makeRng(0) preserves the valid zero seed.
    if (Number.isInteger(data.seed)) {
      app.trainer.seed = data.seed;
      app.trainer.rng = BF.util.makeRng(data.seed);
      if (dom.seedInput) dom.seedInput.value = String(data.seed);
      app._displayRngSeed = null;
    }
    // Load the recorded scene/config above, then identify a bundled showcase
    // with its curated copy. Arbitrary file imports keep their generic identity.
    const visiblePresetId = sourceLabel === 'showcase' && RUN_PRESETS[showcasePresetId]
      ? showcasePresetId : (data.kind === 'bf-policy-v2' ? 'loaded-champion' : '');
    syncPresetDropdowns(visiblePresetId);
    renderPresetTags(visiblePresetId);
    rebuildDisplayState();
    if (app.simRenderer) app.simRenderer.clearTrail();
    if (app.genomeRenderer) app.genomeRenderer.invalidate();
    // Every saved-policy entry point (bundle, JSON, archive) should show the
    // installed bestEver weights, not the freshly rebuilt random population.
    dom.testBtn.click();
    return true;
  }

  function readyToPlayEntries() {
    return (BF.showcaseModels || []).map(BF.presetNavigation.modelMetadata)
      .filter(model=>model.ready!==false)
      .concat((BF.presetNavigation.references || []).filter(entry=>RUN_PRESETS[entry.presetId]));
  }
  function playReadyEntry(model, requestedMode) {
    const reference=model.kind==='reference';
    const isPendulum=['single','double','triple'].includes(RUN_PRESETS[model.presetId]?.setupId);
    const mode=requestedMode || model.defaultReplay || (reference && /rigid/.test(model.presetId)?'hold':'release');
    if(reference){
      loadRunPreset(model.presetId);syncPresetDropdowns(model.presetId);
      if(mode==='hold'){
        dom.tiltDeg.value='5';refreshTiltUI(5);
        Object.assign(app.trainer.params,{startTiltDeg:5,startAngleRange:5*Math.PI/180});
      }
      if(!app.testing)dom.testBtn.click();
      if(mode==='hold' && isSingleSwingupMode()) rebuildDisplayState(5*Math.PI/180);
      if(isSingleSwingupMode()){
        const push={useDisturb:true,pushTarget:'tip',pushStrength:400,pushDuration:0,pushSmoothing:0,pushIntervalMin:3,pushIntervalMax:5};
        Object.assign(app.trainer.params,push);
        for(const [key,value]of Object.entries(push))if(dom[key]){if(dom[key].type==='checkbox')dom[key].checked=value;else dom[key].value=String(value);}
        app.showState.pushCtrl=BF.disturb.make(app.trainer.params,app._pushDisplayRng);
      }
    }else{
      const params=mode==='hold' && model.holdParams ? {...model.holdParams,pendulumInitialState:null,pendulumInitialStateSpread:null} : {};
      const push=Object.fromEntries(Object.entries(model.holdParams||{}).filter(([key])=>key.startsWith('push')));
      const record={...model.record,uiParams:{...model.record.uiParams,...push,...params}};
      installChampionRecord(record,'showcase',model.presetId);
    }
    app.loadedShowcaseModelId=model.id;
    if(isPendulum && (reference || model.holdParams || model.holdOnly)){
      app.pendulumReplayContext={modelId:model.id,mode,randomNudges:model.defaultRandomNudges ?? (mode==='hold'||reference||!!model.record?.uiParams?.useDisturb)};
      if(app.showState)app.showState.pendulumReplay=BF.pendulumPlayback.create(mode);
      const run=app.diffsimRun;
      if(run?.liveReference?.isReference){
        run.liveReference=BF.pendulumReference.create({links:run.isTriple?3:2,phase:mode==='hold'?'hold':'swingup',tiltDeg:mode==='hold'?5:180});
        run.K=run.liveReference.K;run.reqTiltDeg=run.lastTiltDeg=mode==='hold'?5:180;run._displayClock={};
        computeDiffsimDisplayScale();
      }
    }
    refreshPendulumReplayUI();
  }
  function tickPendulumReplay(dt) {
    const context=app.pendulumReplayContext,st=app.showState;
    if(!app.testing||!context||!st)return;
    const stage=st.pendulumReplay||(st.pendulumReplay=BF.pendulumPlayback.create(context.mode));
    const cosines=(st.segments||[]).map(([a,b])=>{
      const p=st.world.nodes[a],q=st.world.nodes[b];return(p.y-q.y)/Math.hypot(q.x-p.x,q.y-p.y);
    });
    BF.pendulumPlayback.tick(stage,dt,cosines,isSingleSwingupMode()?!!app.showPolicy?.controller?.holding&&cosines.every(c=>c>Math.cos(Math.PI/12)):null);
  }
  function refreshPendulumReplayUI() {
    const panel=document.getElementById('pendulumReplayControls'),badge=document.getElementById('pendulumPhaseBadge');
    const context=app.testing&&app.pendulumReplayContext;
    if(panel)panel.hidden=!context;
    if(badge)badge.hidden=!context;
    if(!context)return;
    const model=readyToPlayEntries().find(m=>m.id===context.modelId);
    if(!model)return;
    const rigid=app.diffsimRun?.liveReference;
    const phase=rigid?.phase || app.showState?.pendulumReplay?.phase || (context.mode==='hold'?'holding':'acquiring');
    badge.dataset.phase=phase;badge.textContent=BF.pendulumPlayback.labels[phase]||phase;
    const release=document.getElementById('pendulumReleaseBtn'),hold=document.getElementById('pendulumHoldBtn');
    release.hidden=!!model.holdOnly || (model.kind==='reference' && /rigid/.test(model.presetId) && !BF.pendulumReference);
    release.classList.toggle('active',context.mode==='release');hold.classList.toggle('active',context.mode==='hold');
    release.textContent=model.kind==='reference'?'Swing-up → hold':'Recorded release';
    document.getElementById('pendulumRandomNudges').checked=context.randomNudges;
    const note=context.mode==='hold' ? (model.holdNote || 'Local upright start. Random physical disturbances are enabled; turn them off to inspect undisturbed feedback.')
      : (model.releaseNote || 'The recorded starting pose is preserved. When enabled, random nudges begin after a two-second catch; the phase badge follows the live state.');
    const noteEl=document.getElementById('pendulumReplayNote');if(noteEl.textContent!==note)noteEl.textContent=note;
  }
  function refreshControllerTime() {
    const badge=document.getElementById('controllerTimeBadge');if(!badge)return;
    const context=app.testing&&app.pendulumReplayContext;
    const model=app.testing&&readyToPlayEntries().find(m=>m.id===(context?.modelId || app.loadedShowcaseModelId) && m.presetId===dom.runPresetSelect.value);
    badge.hidden=!model;if(!model)return;
    if(app.playbackPhysicsHz){badge.textContent='Timing outside recorded test';badge.title='A temporary physics-rate override is active. The recorded catch-time estimate does not apply.';return;}
    if(model.watchTime){
      const remaining=model.watchTime.warmupSeconds-(app.showState?.chainTrace?.traceTime || 0);
      const caption=remaining>0 ? `Warm-up · ${Math.ceil(remaining)} sim s` : model.watchTime.label;
      if(badge.textContent!==caption)badge.textContent=caption;
      if(badge.title!==model.watchTime.detail)badge.title=model.watchTime.detail;
      return;
    }
    if(!context){badge.hidden=true;return;}
    const estimate=model.settling;
    const phase=app.diffsimRun?.liveReference?.phase || app.showState?.pendulumReplay?.phase;
    let caption,title;
    if(context.mode==='hold') {
      caption='Upright start · recovery test';title='Starts near upright. The subsequent response depends on each physical disturbance; no fixed recovery time is promised.';
    } else if(estimate) {
      caption=phase==='holding'?'Catch observed':phase==='recovering'?'Recovery time · unmeasured':app.showState?.manualPushCount?'Timing changed · manual push':`Catch ≈ ${estimate.low}–${estimate.high} sim s`;
      title=`${estimate.definition} ${estimate.note} Simulation seconds at the recorded settings, without extra manual pushes. This is an empirical range, not a countdown or a guarantee.`;
    } else {
      caption=phase==='holding'?'Catch observed':'Catch time · not measured';
      title='No calibrated time range is available for this controller. Watch the phase indicator; a catch is not a claim of motionless balance.';
    }
    if(badge.textContent!==caption)badge.textContent=caption;if(badge.title!==title)badge.title=title;
  }
  for(const [id,mode] of [['pendulumReleaseBtn','release'],['pendulumHoldBtn','hold']]) document.getElementById(id).addEventListener('click',()=>{
    const context=app.pendulumReplayContext,model=context&&readyToPlayEntries().find(m=>m.id===context.modelId);
    if(model)playReadyEntry(model,mode);
  });
  document.getElementById('pendulumRandomNudges').addEventListener('change',event=>{
    if(app.pendulumReplayContext)app.pendulumReplayContext.randomNudges=event.target.checked;
  });
  const syncLauncherVisibility = () => document.documentElement.classList.toggle('page-hidden', document.hidden);
  document.addEventListener('visibilitychange', syncLauncherVisibility);
  syncLauncherVisibility();
  function styleReadySelection(entry) {
    const isReference = entry && entry.kind === 'reference';
    const region = document.getElementById('pretrainedStart');
    const button = document.getElementById('loadShowcaseBtn');
    if (region) region.dataset.kind = isReference ? 'reference' : 'trained';
    if (button) button.textContent = isReference ? '▶ Play reference' : '▶ Load & play';
  }
  function syncShowcaseSelector(presetId) {
    const select = document.getElementById('showcaseModelSelect');
    const model = readyToPlayEntries().find(m => m.presetId === presetId);
    if (select) select.value = model ? model.id : '';
    const button = document.getElementById('loadShowcaseBtn');
    if (button) button.disabled = !model;
    styleReadySelection(model);
    const status = document.getElementById('showcaseModelStatus');
    if (status) status.textContent = model
      ? model.kind === 'reference' ? 'Reference selected. Play its explicit controller; no trained model is loaded.'
        : 'Configuration selected. Load & play restores its recorded weights and starts replay.'
      : 'Choose a trained network or an explicitly labelled reference controller.';
  }

  function launchReadyEntry(model) {
    playReadyEntry(model);
    if(model.kind!=='reference')chooseVizTab('network');
    app.loadedShowcaseModelId=model.id;
    const select=document.getElementById('showcaseModelSelect');
    select.value=model.id;
    document.getElementById('loadShowcaseBtn').disabled=false;
    styleReadySelection(model);
    document.getElementById('pretrainedStart')?.classList.add('has-played');
    document.getElementById('showcaseModelStatus').textContent=
      `${model.kind==='reference'?'Reference playing · no learned weights.':'Loaded and replaying.'} ${model.summary}`;
  }

  // Local embedded records work offline and require no initial training.
  if (BF.showcaseModels && BF.showcaseModels.length) {
    const select = document.getElementById('showcaseModelSelect');
    const button = document.getElementById('loadShowcaseBtn');
    const status = document.getElementById('showcaseModelStatus');
    const models = readyToPlayEntries();
    for (const category of BF.presetNavigation.readyGroups(models, RUN_PRESETS)) {
      const group = document.createElement('optgroup');
      group.label = category.name;
      group.style.color = '#dce3ef'; group.style.backgroundColor = '#171d2a';
      select.appendChild(group);
      for (const model of category.entries) {
        const tech = BF.presetNavigation.technique(RUN_PRESETS[model.presetId], model.kind === 'reference');
        const option = new Option(model.label, model.id);
        option.style.color = tech.color; option.style.backgroundColor = tech.background;
        group.appendChild(option);
      }
    }
    button.title = 'Play a saved neural policy or a labelled reference controller in its recorded scene.';
    select.addEventListener('change', () => {
      const model = models.find(m => m.id === select.value);
      button.disabled = !model;
      styleReadySelection(model);
      status.textContent = model ? `${model.kind==='reference'?'Reference controller · no learned weights.':'Trained network.'} ${model.summary}` : 'Choose an example, then Load & play.';
    });
    button.addEventListener('click', () => {
      try {
        const model = models.find(m => m.id === select.value);
        if (!model) return;
        launchReadyEntry(model);
      } catch (e) { status.textContent = 'Could not load: ' + e.message; }
    });
  }

  dom.importBestBtn.addEventListener('click', () => dom.importBestInput.click());
  dom.importBestInput.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        installChampionRecord(data, 'import');
      } catch (e) {
        alert('Could not load champion: ' + (e && e.message ? e.message : e));
      }
      // Reset the input so re-selecting the same file fires `change`.
      ev.target.value = '';
    };
    reader.onerror = () => alert('Failed to read file.');
    reader.readAsText(file);
  });

  // ---------------- Model archive (localStorage) ----------------
  //
  // Multiple named saves persisted across sessions. Each slot is a
  // bf-genome-v1 record (same schema the Export-best download produces,
  // so saves and downloaded JSON are interchangeable). The full trainer
  // population is intentionally NOT saved — that would blow the ~5MB
  // localStorage quota fast — only the bestEver genome + minimal context
  // (algo, setupId, generation, fitness, savedAt). Loading a slot
  // re-installs it as the active trainer's bestEver via the same
  // installChampionRecord() path the file importer uses.
  const ARCHIVE_KEY = 'balanceforge:saves:v1';

  function archiveLoadAll() {
    try {
      const raw = localStorage.getItem(ARCHIVE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  function archiveStoreAll(map) {
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      // Quota exceeded most likely. Surface a friendly message.
      alert('Could not save: ' + (e && e.message ? e.message : 'localStorage write failed') +
            '\n\nDelete some saves and try again, or use Export best to write a JSON file ' +
            'outside the browser.');
      return false;
    }
  }
  function archiveBuildRecord(name) {
    return captureChampionRecord({ name });
  }
  function archiveSave(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Give the save a name first.');
    const all = archiveLoadAll();
    if (all[trimmed] && !confirm(`Overwrite existing save "${trimmed}"?`)) return false;
    const rec = archiveBuildRecord(trimmed);
    all[trimmed] = rec;
    return archiveStoreAll(all);
  }
  function archiveDelete(name) {
    const all = archiveLoadAll();
    if (!(name in all)) return false;
    delete all[name];
    return archiveStoreAll(all);
  }
  function fmtArchiveDetail(rec) {
    // Compact "setup · gen X · fit Y · M ago" line shown under the name.
    const fit = `<span class="badge-fit">fit ${formatFitness(rec.fitness, 2)}</span>`;
    const gen = (rec.generation != null) ? ` · gen ${rec.generation}` : '';
    const algo = rec.algo ? ` · ${rec.algo}` : '';
    let when = '';
    if (rec.savedAt) {
      const d = new Date(rec.savedAt);
      if (!isNaN(d.getTime())) {
        const ageMs = Date.now() - d.getTime();
        const ageMin = Math.floor(ageMs / 60000);
        if (ageMin < 1) when = ' · just now';
        else if (ageMin < 60) when = ` · ${ageMin}m ago`;
        else if (ageMin < 24 * 60) when = ` · ${Math.floor(ageMin / 60)}h ago`;
        else when = ` · ${d.toISOString().slice(0, 10)}`;
      }
    }
    const setup = rec.setupId || 'unknown';
    return `${setup}${algo}${gen} · ${fit}${when}`;
  }
  function renderArchiveList() {
    if (!dom.archiveList) return;
    const all = archiveLoadAll();
    const names = Object.keys(all).sort((a, b) => {
      // Newest first by savedAt; fall back to name.
      const ta = (all[a] && all[a].savedAt) ? Date.parse(all[a].savedAt) : 0;
      const tb = (all[b] && all[b].savedAt) ? Date.parse(all[b].savedAt) : 0;
      if (ta !== tb) return tb - ta;
      return a.localeCompare(b);
    });
    dom.archiveList.innerHTML = '';
    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'archive-empty';
      empty.textContent = 'No saves yet. Train, then click "Save current".';
      dom.archiveList.appendChild(empty);
      return;
    }
    for (const name of names) {
      const rec = all[name];
      const row = document.createElement('div');
      row.className = 'archive-item';
      const meta = document.createElement('div');
      meta.className = 'archive-item-meta';
      const nameEl = document.createElement('div');
      nameEl.className = 'archive-item-name';
      nameEl.textContent = name;
      const detail = document.createElement('div');
      detail.className = 'archive-item-detail';
      detail.innerHTML = fmtArchiveDetail(rec);
      meta.appendChild(nameEl);
      meta.appendChild(detail);
      const loadBtn = document.createElement('button');
      loadBtn.className = 'archive-item-load';
      loadBtn.textContent = 'Load';
      loadBtn.title = 'Install as the current best-ever genome';
      loadBtn.addEventListener('click', () => {
        try {
          if (installChampionRecord(rec, 'load')) {
            dom.archiveHint.textContent = `Loaded "${name}".`;
          }
        } catch (e) {
          alert('Could not load: ' + (e && e.message ? e.message : e));
        }
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'archive-item-delete';
      delBtn.textContent = '×';
      delBtn.title = 'Delete this save';
      delBtn.addEventListener('click', () => {
        if (!confirm(`Delete "${name}"?`)) return;
        if (archiveDelete(name)) {
          renderArchiveList();
          dom.archiveHint.textContent = `Deleted "${name}".`;
        }
      });
      row.appendChild(meta);
      row.appendChild(loadBtn);
      row.appendChild(delBtn);
      dom.archiveList.appendChild(row);
    }
    // In-memory HoFs (feature C per-level + feature D Pareto). When
    // the toggle is on AND a trainer exists, render each HoF entry as
    // an archive-list row tagged with [HoF]. Loadable like persistent
    // saves; not deletable (the trainer owns the lifecycle).
    const showMem = dom.archiveShowMemHoF ? dom.archiveShowMemHoF.checked : true;
    if (!showMem || !app.trainer) return;
    // Per-level HoF: iterate levels in ascending order so the user
    // sees the curriculum history top-to-bottom.
    const perLevel = app.trainer.curriculum && app.trainer.curriculum.perLevelHoF;
    if (perLevel) {
      const levels = Object.keys(perLevel).map(k => parseInt(k, 10))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);
      let anyEntry = false;
      for (const lvl of levels) if ((perLevel[lvl] || []).length > 0) { anyEntry = true; break; }
      if (anyEntry) {
        const header = document.createElement('div');
        header.className = 'archive-section-header';
        header.textContent = 'Per-level HoF (in-memory)';
        dom.archiveList.appendChild(header);
        for (const lvl of levels) {
          const bucket = perLevel[lvl] || [];
          for (let i = 0; i < bucket.length; i++) {
            const e = bucket[i];
            if (!e || !e.genome) continue;
            const row = makeInMemHoFRow({
              tag: 'level',
              label: `Level ${lvl}${bucket.length > 1 ? ` · #${i + 1}` : ''}`,
              fitness: e.fitness,
              gen: e.gen,
              source: `Per-level HoF L${lvl}`,
              genome: e.genome,
              params: e.params,
            });
            dom.archiveList.appendChild(row);
          }
        }
      }
    }
    // Pareto HoF: flat list (no per-bin structure), sorted by fitness
    // desc so the strongest entries are at the top.
    const paretoHoF = app.trainer.paretoHoF;
    if (paretoHoF && paretoHoF.length > 0) {
      const header = document.createElement('div');
      header.className = 'archive-section-header';
      header.textContent = 'Pareto HoF (in-memory)';
      dom.archiveList.appendChild(header);
      const sorted = paretoHoF.slice().sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
      for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i];
        if (!e || !e.genome) continue;
        const row = makeInMemHoFRow({
          tag: 'pareto',
          label: `Rank-1 #${i + 1}`,
          fitness: e.fitness,
          gen: e.gen,
          source: 'Pareto HoF',
          genome: e.genome,
          params: e.params,
        });
        dom.archiveList.appendChild(row);
      }
    }
  }

  // Build one in-memory-HoF archive row. opts: {tag, label, fitness,
  // gen, source, genome, params}. Tag controls the [HoF]-pill color
  // ("level" = amber, "pareto" = mint). Clicking Load builds a
  // synthetic bf-genome-v1 record from the in-memory entry and
  // installs it via the existing installChampionRecord path.
  function makeInMemHoFRow(opts) {
    const row = document.createElement('div');
    row.className = 'archive-item';
    const meta = document.createElement('div');
    meta.className = 'archive-item-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'archive-item-name';
    const tagEl = document.createElement('span');
    tagEl.className = 'archive-item-hoftag' + (opts.tag === 'level' ? ' per-level' : '');
    tagEl.textContent = opts.tag === 'level' ? 'L-HoF' : 'P-HoF';
    nameEl.appendChild(tagEl);
    nameEl.appendChild(document.createTextNode(opts.label));
    const detail = document.createElement('div');
    detail.className = 'archive-item-detail';
    const fitStr = (typeof opts.fitness === 'number' && isFinite(opts.fitness))
      ? `fit ${opts.fitness.toFixed(2)}` : '—';
    const genStr = opts.gen != null ? ` · gen ${opts.gen}` : '';
    detail.textContent = `${opts.source} · ${fitStr}${genStr}`;
    meta.appendChild(nameEl);
    meta.appendChild(detail);
    const loadBtn = document.createElement('button');
    loadBtn.className = 'archive-item-load';
    loadBtn.textContent = 'Load';
    loadBtn.title = 'Install this in-memory HoF entry as the current best-ever genome';
    loadBtn.addEventListener('click', () => {
      try {
        const rec = captureChampionRecord({ name: opts.source + ' · ' + opts.label }, {
          genome: opts.genome, params: opts.params, fitness: opts.fitness, generation: opts.gen,
        });
        if (installChampionRecord(rec, 'load HoF')) {
          dom.archiveHint.textContent = `Loaded ${opts.source}.`;
        }
      } catch (e) {
        alert('Could not load HoF entry: ' + (e && e.message ? e.message : e));
      }
    });
    row.appendChild(meta);
    row.appendChild(loadBtn);
    return row;
  }
  function showArchive(show) {
    if (!dom.archivePopover) return;
    if (show) {
      renderArchiveList();
      dom.archivePopover.classList.remove('hidden');
      // Suggest a default name based on the active setup + algorithm +
      // gen, so the user has a reasonable starting point and can edit
      // if they want. Algorithm matters when the user has runs of the
      // same setup with different optimizers and needs to tell them
      // apart in the archive list.
      if (dom.archiveNameInput && app.trainer) {
        const setup = app.trainer.setupId || 'run';
        const algo  = app.trainer.params.mode || 'neat';
        const gen   = app.trainer.generation || 0;
        dom.archiveNameInput.value = `${setup} · ${algo} · gen ${gen}`;
        dom.archiveNameInput.focus();
        dom.archiveNameInput.select();
      }
      dom.archiveHint.textContent = '—';
    } else {
      dom.archivePopover.classList.add('hidden');
    }
  }
  if (dom.archiveBtn) {
    dom.archiveBtn.addEventListener('click', () => {
      const open = dom.archivePopover.classList.contains('hidden');
      showArchive(open);
    });
  }
  if (dom.archiveCloseBtn) {
    dom.archiveCloseBtn.addEventListener('click', () => showArchive(false));
  }
  // Re-render the list immediately when the in-memory-HoF toggle
  // flips so the user sees the effect without re-opening the popover.
  if (dom.archiveShowMemHoF) {
    dom.archiveShowMemHoF.addEventListener('change', () => {
      renderArchiveList();
    });
  }
  if (dom.archiveSaveBtn) {
    dom.archiveSaveBtn.addEventListener('click', () => {
      try {
        const name = dom.archiveNameInput.value;
        if (archiveSave(name)) {
          renderArchiveList();
          dom.archiveHint.textContent = `Saved "${name.trim()}".`;
        }
      } catch (e) {
        dom.archiveHint.textContent = e && e.message ? e.message : String(e);
      }
    });
  }
  if (dom.archiveNameInput) {
    dom.archiveNameInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        dom.archiveSaveBtn.click();
      } else if (ev.key === 'Escape') {
        showArchive(false);
      }
    });
  }
  // Export every save in the archive as one JSON bundle. Schema is
  // bf-saves-bundle-v1; each entry is the same bf-genome-v1 record the
  // single-save export writes, so individual entries can also be
  // imported via the existing single-record import flow.
  if (dom.archiveExportAllBtn) {
    dom.archiveExportAllBtn.addEventListener('click', () => {
      const all = archiveLoadAll();
      const names = Object.keys(all);
      if (names.length === 0) {
        dom.archiveHint.textContent = 'No saves to export.';
        return;
      }
      const bundle = {
        kind: 'bf-saves-bundle-v1',
        exportedAt: new Date().toISOString(),
        count: names.length,
        saves: all,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `bf-saves-bundle-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      dom.archiveHint.textContent = `Exported ${names.length} save${names.length === 1 ? '' : 's'}.`;
    });
  }
  if (dom.archiveImportBundleBtn && dom.archiveImportBundleInput) {
    dom.archiveImportBundleBtn.addEventListener('click',
      () => dom.archiveImportBundleInput.click());
    dom.archiveImportBundleInput.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          // Accept three formats:
          //   bf-saves-bundle-v1 (multi-save, this writer)
          //   bf-genome-v1 (single-save, same schema as Export-best)
          //   plain {name: record} object (best-effort tolerance)
          let saves = null;
          if (data && data.kind === 'bf-saves-bundle-v1' && data.saves) {
            saves = data.saves;
          } else if (data && ((['bf-genome-v1', 'bf-policy-v2'].includes(data.kind) && data.genome) || data.kind==='bf-dodge-lookahead-v1')) {
            const k = data.name || `imported · ${new Date().toISOString().slice(0, 19)}`;
            saves = { [k]: data };
          } else if (data && typeof data === 'object') {
            saves = data;
          }
          if (!saves) throw new Error('File does not look like a BalanceForge saves bundle.');
          const all = archiveLoadAll();
          let added = 0, overwrote = 0;
          for (const k of Object.keys(saves)) {
            if(saves[k]?.kind==='bf-dodge-lookahead-v1')BF.dodgeTemporal.validate(saves[k]);
            else BF.championIO.validate(saves[k]);
          }
          for (const k of Object.keys(saves)) {
            if (all[k]) overwrote++; else added++;
            all[k] = saves[k];
          }
          if (archiveStoreAll(all)) {
            renderArchiveList();
            dom.archiveHint.textContent = `Imported ${added + overwrote} save${added + overwrote === 1 ? '' : 's'} (${added} new, ${overwrote} overwrote).`;
          }
        } catch (e) {
          alert('Could not import bundle: ' + (e && e.message ? e.message : e));
        }
        ev.target.value = '';
      };
      reader.onerror = () => alert('Failed to read file.');
      reader.readAsText(file);
    });
  }
  // Click outside the popover closes it. Skip when the click was on the
  // toggle button itself (its own handler will toggle).
  document.addEventListener('click', (ev) => {
    if (!dom.archivePopover || dom.archivePopover.classList.contains('hidden')) return;
    if (dom.archivePopover.contains(ev.target)) return;
    if (dom.archiveBtn && dom.archiveBtn.contains(ev.target)) return;
    showArchive(false);
  });

  // Seed copy: writes the current trainer seed to the clipboard so
  // the user can record / share what produced the current trajectory.
  // Briefly flashes the button green to confirm. Falls back to a
  // textarea+execCommand path on browsers without async clipboard.
  dom.seedCopyBtn.addEventListener('click', async () => {
    const text = dom.seedInput.value || '';
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      dom.seedCopyBtn.classList.add('flash-ok');
      const orig = dom.seedCopyBtn.textContent;
      dom.seedCopyBtn.textContent = '✓';
      setTimeout(() => {
        dom.seedCopyBtn.classList.remove('flash-ok');
        dom.seedCopyBtn.textContent = orig;
      }, 900);
    } catch (e) {
      dom.seedCopyBtn.title = 'Copy failed: ' + (e && e.message ? e.message : e);
    }
  });

  // A2: draw y=act(x) (simple) or the composed mixture + faint
  // per-component curves into a small tooltip canvas. Hover-only, one
  // node, ~64 samples -> zero training-loop cost.
  function drawActivationPlot(cv, fullNode, genome) {
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const X0 = -4, X1 = 4, NS = 64;
    const mode = (genome && genome.mixMode) || 'raw';
    const mix = fullNode && fullNode.mix && fullNode.mix.length ? fullNode.mix : null;
    const act = fullNode ? fullNode.act : BF.neat.ACT.TANH;
    const xs = [], comp = mix ? mix.map(() => []) : null, comb = [];
    let normW = null;
    if (mix && mode === 'normalized') {
      let mx = -Infinity;
      for (const m of mix) if (m.w > mx) mx = m.w;
      let Z = 0;
      const ex = mix.map(m => { const e = Math.exp(m.w - mx); Z += e; return e; });
      normW = ex.map(e => e / Z);
    }
    for (let i = 0; i < NS; i++) {
      const x = X0 + (X1 - X0) * i / (NS - 1);
      xs.push(x);
      if (mix) {
        comb.push(BF.neat.combineMix(mix, x, mode));
        for (let j = 0; j < mix.length; j++) {
          const cw = normW ? normW[j] : mix[j].w;
          comp[j].push(cw * BF.neat.applyAct(mix[j].act, x));
        }
      } else {
        comb.push(BF.neat.applyAct(act, x));
      }
    }
    let ymin = Infinity, ymax = -Infinity;
    const consider = v => { if (isFinite(v)) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; } };
    comb.forEach(consider);
    if (comp) comp.forEach(s => s.forEach(consider));
    if (!isFinite(ymin) || !isFinite(ymax) || ymin === ymax) { ymin = -1; ymax = 1; }
    const pad = (ymax - ymin) * 0.08 || 0.1; ymin -= pad; ymax += pad;
    const px = x => (x - X0) / (X1 - X0) * (W - 2) + 1;
    const py = y => H - 1 - (y - ymin) / (ymax - ymin) * (H - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(0), 0); ctx.lineTo(px(0), H); ctx.stroke();
    if (ymin < 0 && ymax > 0) { ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(W, py(0)); ctx.stroke(); }
    if (comp) {
      // Each faint component curve in its activation's palette color
      // (matches the node ring + the recolored mixture legend row),
      // semi-transparent so the composed result dominates. comp[j]
      // aligns 1:1 with mix[j] (comp = mix.map(() => [])).
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let j = 0; j < comp.length; j++) {
        ctx.strokeStyle = BF.neat.actColor(mix[j].act);
        const s = comp[j];
        ctx.beginPath();
        for (let i = 0; i < NS; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(xs[i]), py(s[i]));
        ctx.stroke();
      }
      ctx.restore();
    }
    // Composed/result curve, drawn last (on top). A MIXED node gets a
    // bright white result so the colored components read as
    // ingredients; a pure node keeps its original single green curve.
    ctx.strokeStyle = mix ? '#f5f7ff' : '#6ce28a';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    for (let i = 0; i < NS; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(xs[i]), py(comb[i]));
    ctx.stroke();
  }

  // ---- Network node tooltip ----
  dom.netCanvas.addEventListener('mousemove', (e) => {
    const rect = dom.netCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    app.netRenderer.setPointer(x,y);
    const node = app.netRenderer.hitTest(x, y);
    if (!node) {
      dom.netTooltip.classList.add('hidden');
      return;
    }
    // app._netLabelSetup is whatever vocabulary the panel was DRAWN with —
    // normally the setup itself, but the recurrent policy substitutes a shim
    // that also names its memory reads/writes. Reading the raw setup here
    // would label eight of the fourteen inputs "obs N (unlabeled)".
    const setup = app._netLabelSetup
      || BF.setups.getSetup(app.trainer ? app.trainer.setupId : 'single');
    const genome = app.netRenderer.lastGenome();
    const recView = (app.trainer && app.trainer.params.policyType === 'recurrent')
      ? recurrentNetworkView(app.trainer, BF.setups.getSetup(app.trainer.setupId)) : null;
    const recAct = recView ? recurrentActivations(recView) : null;
    const trace = app.showPolicy && app.showPolicy.lastTrace;
    const act = recAct ? (recAct.has(node.id) ? recAct.get(node.id) : null)
                       : (trace ? trace.activations.get(node.id) : null);
    let title = '';
    let rows = [];
    const fullNode = genome ? genome.nodes.find(n => n.id === node.id) : null;
    if (node.kind === 'input') {
      const label = (setup.observationLabels && setup.observationLabels[node.id]) || ('obs ' + node.id + ' (unlabeled)');
      title = `Input · ${label}`;
      rows.push(['abbr', (setup.observationAbbr && setup.observationAbbr[node.id]) || ('i' + node.id)]);
      if (act != null) rows.push(['value', BF.util.fmt(act, 3)]);
    } else if (node.kind === 'output') {
      const oi = node.id - ((genome && genome.numInputs != null) ? genome.numInputs | 0 : 0);
      const oLabel = (setup.actionLabels && setup.actionLabels[oi]) || 'cart command';
      title = `Output · ${oLabel}`;
      if (setup.actionAbbr && setup.actionAbbr[oi] != null) {
        rows.push(['abbr', String(setup.actionAbbr[oi])]);
      }
      rows.push(['activation', BF.neat.ACT_NAMES[fullNode ? fullNode.act : 1]]);
      if (fullNode) rows.push(['bias', BF.util.fmt(fullNode.bias, 3)]);
      if (act != null) rows.push(['cmd (out)', BF.util.fmt(act, 3)]);
    } else {
      title = `Hidden · ${BF.neat.ACT_NAMES[fullNode ? fullNode.act : 1]}`;
      rows.push(['id', String(node.id)]);
      if (fullNode) rows.push(['bias', BF.util.fmt(fullNode.bias, 3)]);
      if (act != null) rows.push(['activation', BF.util.fmt(act, 3)]);
      if (fullNode && fullNode.mix && fullNode.mix.length) {
        const mode = (genome && genome.mixMode) || 'raw';
        // Color each component term to match its plot curve + node
        // ring -> this existing row IS the legend (zero extra space).
        // The tt-row markup raw-interpolates ${v}, so spans render.
        const parts = fullNode.mix.map(m => {
          const label = (mode === 'normalized' ? '' : (m.w >= 0 ? '+' : '') + m.w.toFixed(2) + '·')
                      + BF.neat.ACT_NAMES[m.act];
          return `<span style="color:${BF.neat.actColor(m.act)}">${label}</span>`;
        });
        rows.push(['mixture', (mode === 'normalized' ? 'softmax ' : '') + parts.join(' ')]);
      }
    }
    let html = `<div class="tt-title">${title}</div>`;
    for (const [k, v] of rows) {
      html += `<div class="tt-row">${k} <b>${v}</b></div>`;
    }
    const _wantPlot = node.kind !== 'input';
    dom.netTooltip.innerHTML = html + (_wantPlot ? '<canvas class="tt-actplot" width="150" height="64" style="display:block;margin-top:6px;border-radius:4px;background:rgba(255,255,255,0.03)"></canvas>' : '');
    if (_wantPlot) {
      const _plot = dom.netTooltip.querySelector('.tt-actplot');
      if (_plot) drawActivationPlot(_plot, fullNode, genome);
    }
    dom.netTooltip.classList.remove('hidden');
    // Position. Prefer right-of-cursor unless near right edge.
    const ttX = e.clientX + 14;
    const ttY = e.clientY + 14;
    dom.netTooltip.style.left = ttX + 'px';
    dom.netTooltip.style.top = ttY + 'px';
    // Flip if going off-screen.
    requestAnimationFrame(() => {
      const ttRect = dom.netTooltip.getBoundingClientRect();
      if (ttRect.right > window.innerWidth - 8) {
        dom.netTooltip.style.left = (e.clientX - ttRect.width - 14) + 'px';
      }
      if (ttRect.bottom > window.innerHeight - 8) {
        dom.netTooltip.style.top = (e.clientY - ttRect.height - 14) + 'px';
      }
    });
  });
  dom.netCanvas.addEventListener('mouseleave', () => {
    app.netRenderer.setPointer(null);
    dom.netTooltip.classList.add('hidden');
  });

  const densityButton=document.getElementById('networkDensityToggle');
  const netMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  app.netReducedMotion=netMotion.matches;
  netMotion.addEventListener('change',event=>{app.netReducedMotion=event.matches;applyVisualSmoothing();});
  const smoothingButton=document.getElementById('vizSmoothingToggle');
  app.vizSmoothing=false;
  try{app.vizSmoothing=localStorage.getItem('bf-viz-smoothing')==='on';}catch(_){}
  function applyVisualSmoothing(){
    if(!smoothingButton)return;
    const active=app.vizSmoothing&&!app.netReducedMotion;
    smoothingButton.textContent=`◈ Smoothing: ${active?'On':'Off'}`;
    smoothingButton.setAttribute('aria-pressed',String(active));
    smoothingButton.disabled=app.netReducedMotion;
    smoothingButton.title=app.netReducedMotion?'Display easing is disabled by your reduced-motion preference.':'Ease colors, maps and bar lengths. Exact score numbers, decisions, historical samples and physics stay unchanged.';
  }
  applyVisualSmoothing();
  smoothingButton?.addEventListener('click',()=>{
    app.vizSmoothing=!app.vizSmoothing;
    try{localStorage.setItem('bf-viz-smoothing',app.vizSmoothing?'on':'off');}catch(_){}
    applyVisualSmoothing();
  });
  app.networkDensity='loose';
  try{if(localStorage.getItem('bf-network-density')==='concise')app.networkDensity='concise';}catch(_){}
  function applyNetworkDensity(){
    const concise=app.networkDensity==='concise';
    dom.netPanel.dataset.density=app.networkDensity;
    densityButton.textContent=`Spacing: ${concise?'Concise':'Loose'}`;
    densityButton.setAttribute('aria-pressed',String(concise));
    densityButton.title=concise?'Spread nodes into a taller viewport':'Use a shorter, more compact topology viewport';
    app.netRenderer.invalidate();
  }
  if(densityButton){
    applyNetworkDensity();
    densityButton.addEventListener('click',()=>{
      app.networkDensity=app.networkDensity==='concise'?'loose':'concise';
      try{localStorage.setItem('bf-network-density',app.networkDensity);}catch(_){}
      applyNetworkDensity();
    });
  }

  // ---- Boot ----
  buildAll();
  loadRunPreset('single-neat-curriculum-90');
  syncPresetDropdowns('single-neat-curriculum-90');
  // Offer a concrete first click while leaving the training population idle.
  const initialExample = document.getElementById('showcaseModelSelect');
  if (initialExample) {
    initialExample.value = 'neat-single-swingup';
    initialExample.dispatchEvent(new Event('change'));
  }
  // Right-bar tabs. After buildAll() so the mode-conditional panels have
  // already written their inline display once — the first availability pass
  // then sees the true picture instead of disabling everything.
  setupVizTabs();
  updateCartAccelHint();
  // Populate behavior-space axes from the active setup's descriptor list.
  // Has to happen after buildAll() so app.trainer.setupId is set; the
  // function falls back to dom.setupSelect.value if trainer is null.
  populateBehaviorAxes();
  // Sync axis selections + bin slider into the trainer's archive config.
  // Wired here (after populateBehaviorAxes ran once at boot) so the live
  // archive reflects whatever defaults the dropdowns landed on.
  function syncBehaviorArchiveFromUI() {
    if (!app.trainer || !T.configureBehaviorArchive) return;
    const x = dom.behaviorXSelect && dom.behaviorXSelect.value;
    const y = dom.behaviorYSelect && dom.behaviorYSelect.value;
    const bins = dom.behaviorBins ? parseInt(dom.behaviorBins.value, 10) : 16;
    if (!x || !y) return;
    T.configureBehaviorArchive(app.trainer, { xKey: x, yKey: y, bins: bins });
  }
  syncBehaviorArchiveFromUI();
  if (dom.behaviorXSelect) {
    dom.behaviorXSelect.addEventListener('change', syncBehaviorArchiveFromUI);
  }
  if (dom.behaviorYSelect) {
    dom.behaviorYSelect.addEventListener('change', syncBehaviorArchiveFromUI);
  }
  if (dom.behaviorBins && dom.behaviorBinsVal) {
    bindRange(dom.behaviorBins, dom.behaviorBinsVal, v => String(parseInt(v, 10)));
    dom.behaviorBins.addEventListener('input', syncBehaviorArchiveFromUI);
  }
  if (dom.behaviorResetBtn) {
    dom.behaviorResetBtn.addEventListener('click', () => {
      if (app.trainer && T.resetBehaviorArchive) T.resetBehaviorArchive(app.trainer);
    });
  }
  if (dom.qdParentEnabled) {
    dom.qdParentEnabled.addEventListener('change', () => {
      if (dom.qdSampleFractionRow) {
        dom.qdSampleFractionRow.style.display = dom.qdParentEnabled.checked ? '' : 'none';
      }
      syncTrainerParams();
    });
  }
  if (dom.qdSampleFraction && dom.qdSampleFractionVal) {
    bindRange(dom.qdSampleFraction, dom.qdSampleFractionVal, v => parseFloat(v).toFixed(2));
  }
  // QD escape-boost wiring. The toggle just adjusts trainer params; the
  // slider row stays visible while the toggle is on so the user can see
  // / adjust the boost value, and collapses when the feature is off.
  if (dom.qdEscapeBoostEnabled) {
    const refreshQdEscapeRow = () => {
      if (dom.qdEscapeBoostRow) {
        dom.qdEscapeBoostRow.style.display = dom.qdEscapeBoostEnabled.checked ? '' : 'none';
      }
    };
    dom.qdEscapeBoostEnabled.addEventListener('change', () => {
      refreshQdEscapeRow();
      syncTrainerParams();
    });
    refreshQdEscapeRow();
  }
  if (dom.qdEscapeBoost && dom.qdEscapeBoostVal) {
    bindRange(dom.qdEscapeBoost, dom.qdEscapeBoostVal, v => parseFloat(v).toFixed(2));
  }
  // Pareto / NSGA-II selection toggle. The k-NN slider AND the
  // Pareto-aware HoF subsection are both gated by the master toggle.
  // The HoF size/min-dist sliders are further gated by the HoF
  // sub-toggle to match the conceptual hierarchy (HoF is meaningful
  // only when Pareto is on; size/dist are meaningful only when HoF
  // is on).
  function refreshParetoRows() {
    const masterOn = dom.paretoSelectionEnabled && dom.paretoSelectionEnabled.checked;
    if (dom.paretoNoveltyKRow)        dom.paretoNoveltyKRow.style.display        = masterOn ? '' : 'none';
    if (dom.paretoHoFEnabledRow)      dom.paretoHoFEnabledRow.style.display      = masterOn ? '' : 'none';
    if (dom.paretoUseConsistencyRow)  dom.paretoUseConsistencyRow.style.display  = masterOn ? '' : 'none';
    const hofOn = masterOn && dom.paretoHoFEnabled && dom.paretoHoFEnabled.checked;
    if (dom.paretoHoFSizeRow)    dom.paretoHoFSizeRow.style.display    = hofOn ? '' : 'none';
    if (dom.paretoHoFMinDistRow) dom.paretoHoFMinDistRow.style.display = hofOn ? '' : 'none';
  }
  if (dom.paretoSelectionEnabled) {
    dom.paretoSelectionEnabled.addEventListener('change', () => {
      refreshParetoRows();
      syncTrainerParams();
    });
  }
  if (dom.paretoHoFEnabled) {
    dom.paretoHoFEnabled.addEventListener('change', () => {
      refreshParetoRows();
      syncTrainerParams();
    });
  }
  if (dom.paretoUseConsistency) {
    dom.paretoUseConsistency.addEventListener('change', () => {
      syncTrainerParams();
    });
  }
  refreshParetoRows();
  if (dom.paretoNoveltyK && dom.paretoNoveltyKVal) {
    bindRange(dom.paretoNoveltyK, dom.paretoNoveltyKVal, v => String(parseInt(v, 10)));
  }
  if (dom.paretoHoFSize && dom.paretoHoFSizeVal) {
    bindRange(dom.paretoHoFSize, dom.paretoHoFSizeVal, v => String(parseInt(v, 10)));
  }
  if (dom.paretoHoFMinDist && dom.paretoHoFMinDistVal) {
    bindRange(dom.paretoHoFMinDist, dom.paretoHoFMinDistVal, v => parseFloat(v).toFixed(2));
  }
  // Retro-eval wiring. Three sub-controls (cadence, top-N, blend weight)
  // collapse / expand with the master toggle. Same pattern as the QD
  // boost above — the value sliders stay visible while feature is on so
  // the user can tune mid-run without unticking the master.
  if (dom.retroEvalEnabled) {
    const refreshRetroRows = () => {
      const on = dom.retroEvalEnabled.checked;
      if (dom.retroEvalEveryGensRow)        dom.retroEvalEveryGensRow.style.display       = on ? '' : 'none';
      if (dom.retroEvalTopNRow)             dom.retroEvalTopNRow.style.display            = on ? '' : 'none';
      if (dom.retroEvalSelectionWeightRow)  dom.retroEvalSelectionWeightRow.style.display = on ? '' : 'none';
    };
    dom.retroEvalEnabled.addEventListener('change', () => {
      refreshRetroRows();
      syncTrainerParams();
    });
    refreshRetroRows();
  }
  if (dom.retroEvalEveryGens && dom.retroEvalEveryGensVal) {
    bindRange(dom.retroEvalEveryGens, dom.retroEvalEveryGensVal, v => String(parseInt(v, 10)));
  }
  if (dom.retroEvalTopN && dom.retroEvalTopNVal) {
    bindRange(dom.retroEvalTopN, dom.retroEvalTopNVal, v => String(parseInt(v, 10)));
  }
  if (dom.retroEvalSelectionWeight && dom.retroEvalSelectionWeightVal) {
    bindRange(dom.retroEvalSelectionWeight, dom.retroEvalSelectionWeightVal, v => parseFloat(v).toFixed(2));
  }
  // Per-level HoF + transplant. Master toggle reveals the size + the
  // transplant-on toggle; transplant-on toggle reveals the count slider.
  // Two-level visibility matches the conceptual hierarchy: HoF is the
  // bookkeeping, transplant is what the bookkeeping enables.
  if (dom.levelHoFEnabled) {
    const refreshLevelHoFRows = () => {
      const on = dom.levelHoFEnabled.checked;
      if (dom.levelHoFSizeRow)         dom.levelHoFSizeRow.style.display         = on ? '' : 'none';
      if (dom.levelTransplantOnRow)    dom.levelTransplantOnRow.style.display    = on ? '' : 'none';
      // Transplant-count visibility is gated by both toggles.
      const transplantOn = on && dom.levelTransplantOn && dom.levelTransplantOn.checked;
      if (dom.levelTransplantCountRow) dom.levelTransplantCountRow.style.display = transplantOn ? '' : 'none';
    };
    dom.levelHoFEnabled.addEventListener('change', () => {
      refreshLevelHoFRows();
      syncTrainerParams();
    });
    if (dom.levelTransplantOn) {
      dom.levelTransplantOn.addEventListener('change', () => {
        refreshLevelHoFRows();
        syncTrainerParams();
      });
    }
    refreshLevelHoFRows();
  }
  if (dom.levelHoFSize && dom.levelHoFSizeVal) {
    bindRange(dom.levelHoFSize, dom.levelHoFSizeVal, v => String(parseInt(v, 10)));
  }
  if (dom.levelTransplantCount && dom.levelTransplantCountVal) {
    bindRange(dom.levelTransplantCount, dom.levelTransplantCountVal, v => String(parseInt(v, 10)));
  }
  // -----------------------------------------------------------------
  // WASM toggle wiring.
  //
  // The row is hidden until BF.wasm.ready flips true (the lazy import
  // in js/wasm_loader.js succeeded). We start hidden so the option
  // does not flash in for users who haven't built the WASM bundle.
  //
  // Once the checkbox changes we set BF.wasm.useForNeat -- this flag
  // is read inside forwardDispatch() in js/neat.js on every evaluate
  // call. We avoid wiring the dispatch any deeper than that so a
  // single toggle is enough to swap evaluation paths mid-run.
  // -----------------------------------------------------------------
  if (dom.useWasmEval && dom.useWasmEvalRow) {
    dom.useWasmEvalRow.style.display = 'none';
    dom.useWasmEval.checked = false;
    if (dom.useWasmEvalTest) dom.useWasmEvalTest.checked = false;
    const applyWasmToggle = () => {
      // Read the active mode's WASM checkbox so training/testing can
      // diverge if the user wants. In practice both usually agree --
      // the testing checkbox is dim by default and the user only
      // touches it when they explicitly want different behavior.
      const on = getActiveWasm();
      // Master toggle flips every per-feature flag in BF.wasm. Each
      // hot-path dispatch reads its own flag, so adding a future
      // C++ port (physics step, etc.) is just `useForFoo = on` and
      // a check on the JS dispatch side. UI stays a single switch.
      if (window.BF && window.BF.wasm) {
        window.BF.wasm.useForNeat          = on;
        window.BF.wasm.useForCnnMultiscale = on;
        window.BF.wasm.useForJacobi        = on;
      }
      // body.wasm-on lights up the amber glow on the "Forge" brand
      // word + reveals the inline "C++ · WASM" badge. See
      // css/styles.css `.wasm-on` rules. Cheap to flip; the rest of
      // the page is unaffected.
      document.body.classList.toggle('wasm-on', on);
    };
    dom.useWasmEval.addEventListener('change', applyWasmToggle);
    if (dom.useWasmEvalTest) {
      // Only re-apply when the change is on the ACTIVE control -- a
      // user toggling test-mode WASM while still training shouldn't
      // immediately disable WASM mid-gen.
      dom.useWasmEvalTest.addEventListener('change', () => {
        if (app.testing) applyWasmToggle();
      });
    }
    // Stash so the testBtn handler can re-apply when the active mode
    // flips (so toggling test mode also flips WASM if the two checkboxes
    // disagree).
    app._applyWasmToggle = applyWasmToggle;
  }
  // Full-power toggle: flip a body class so the user can SEE that the
  // viz is intentionally frozen (CSS dims the sim viewer + sets a
  // "full power" tag overlay). Without a visible indicator the user
  // might think the app crashed when they see the sim stop animating.
  // Also reveal the auto-peek sub-controls when full-power is on, so
  // the user can opt into periodic display refreshes.
  if (dom.fullPowerMode) {
    const applyFullPower = () => {
      // Read the active mode's full-power checkbox. Mode flip in
      // testBtn handler also calls this so the body class +
      // auto-peek rows track the now-active checkbox.
      const on = getActiveFullPower();
      document.body.classList.toggle('full-power', on);
      if (dom.autoPeekRow)         dom.autoPeekRow.style.display         = on ? '' : 'none';
      if (dom.autoPeekIntervalRow) dom.autoPeekIntervalRow.style.display = on ? '' : 'none';
    };
    dom.fullPowerMode.addEventListener('change', applyFullPower);
    if (dom.fullPowerModeTest) {
      dom.fullPowerModeTest.addEventListener('change', () => {
        if (app.testing) applyFullPower();
      });
    }
    app._applyFullPower = applyFullPower;
  }
  // Auto-peek interval slider readout. Standard bindRange pattern --
  // updates the visible value label as the user drags, no other
  // side effects needed (the frame() loop reads .value directly).
  if (dom.autoPeekInterval && dom.autoPeekIntervalVal) {
    bindRange(dom.autoPeekInterval, dom.autoPeekIntervalVal,
              v => parseInt(v, 10) + 's');
  }
  // ----- WASM "?" explainer (mirrors modeHelpBtn / algoExplain) -----
  // Long-form description of where WASM actually wins (and where it
  // doesn't) + a tiny in-app benchmark you can run to see the pattern
  // on your own machine. Lives inline so the user doesn't have to
  // navigate away. Content is populated lazily on first open.
  function buildWasmExplainHTML() {
    return (
      '<strong>Where the C++/WASM port actually wins.</strong> ' +
      'Three hot paths are ported (NEAT forward, multi-scale CNN forward, ' +
      'Jacobi eigendecomp). The visible speedup depends on which one each ' +
      'preset actually leans on.<br><br>' +
      '<span class="pros">Wins ≥2×:</span> Dodge — CMA-ES + multi-scale ' +
      'CNN. ~10K MACs per forward call on contiguous Float64Arrays, ' +
      'plus Jacobi at n≈226 each generation. SIMD packing helps both.<br>' +
      '<span class="pros">Modest 1.1–2×:</span> any CMA-ES + MLP preset ' +
      '(pendulum, golf, dodge MLP). Jacobi at n≈60–100 per gen is where ' +
      'libm trig beats V8\'s Math.*, but per-step forward is small so ' +
      'the average win is moderate.<br>' +
      '<span class="cons">Often slower:</span> NEAT-full on small ' +
      'genomes (4–20 nodes). V8 already JITs typed-array math close to ' +
      'native, and the per-call WASM marshal (a few hundred ns) is a ' +
      'significant fraction of a ≲20-multiply-add forward pass. The ' +
      'genome-pack cache helps but doesn\'t fully close the gap.<br>' +
      '<span class="cons">No effect:</span> the <em>phase-space CNN</em> ' +
      'presets — that\'s the single-scale <code>cnn</code> policy which ' +
      'isn\'t ported to WASM yet. Forward pass stays in JS; only the ' +
      'CMA-ES Jacobi gets the WASM path.<br><br>' +
      '<div id="wasmBenchPanel">' +
      '<button type="button" id="wasmBenchRunBtn" class="btn btn-warn" ' +
      'style="padding:4px 12px; font-size:11px;">Run live benchmark</button> ' +
      '<span id="wasmBenchStatus" style="margin-left:8px; color: var(--muted); font-size:11px;">' +
      '4 tests, ~3–5 seconds.</span>' +
      '<div id="wasmBenchResults" style="margin-top:8px;"></div>' +
      '<div style="margin-top:8px; font-size:11px; color: var(--muted);">' +
      'For the full per-preset table, open ' +
      '<a href="wasm/bench.html" target="_blank" rel="noopener" ' +
      'style="color: var(--accent);">wasm/bench.html →</a>' +
      '</div>' +
      '</div>'
    );
  }
  // The bench takes 3–5 seconds; we run it on demand only.
  function runWasmBench(statusEl, resultsEl) {
    if (!window.BF || !window.BF.wasm || !window.BF.wasm.ready) {
      statusEl.textContent = 'WASM not loaded yet.';
      return;
    }
    statusEl.textContent = 'Running...';
    resultsEl.innerHTML = '';
    // Tiny inline JS Jacobi reference -- the cmaes.js one is private.
    function jsJacobi(symmetric, n) {
      const A = new Float64Array(symmetric);
      const V = new Float64Array(n * n);
      for (let i = 0; i < n; i++) V[i * n + i] = 1;
      for (let sweep = 0; sweep < 60; sweep++) {
        let off = 0;
        for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) off += Math.abs(A[i*n+j]);
        if (off < 1e-12) break;
        for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
          const apq = A[p*n+q]; if (Math.abs(apq) < 1e-14) continue;
          const app = A[p*n+p], aqq = A[q*n+q];
          const th = (Math.abs(app - aqq) < 1e-14) ? Math.PI/4 : 0.5 * Math.atan2(-2*apq, app-aqq);
          const c = Math.cos(th), s = Math.sin(th);
          for (let r = 0; r < n; r++) {
            if (r === p || r === q) continue;
            const arp = A[r*n+p], arq = A[r*n+q];
            A[r*n+p] = c*arp - s*arq; A[p*n+r] = A[r*n+p];
            A[r*n+q] = s*arp + c*arq; A[q*n+r] = A[r*n+q];
          }
          A[p*n+p] = c*c*app - 2*c*s*apq + s*s*aqq;
          A[q*n+q] = s*s*app + 2*c*s*apq + c*c*aqq;
          A[p*n+q] = 0; A[q*n+p] = 0;
          for (let r = 0; r < n; r++) {
            const vrp = V[r*n+p], vrq = V[r*n+q];
            V[r*n+p] = c*vrp - s*vrq;
            V[r*n+q] = s*vrp + c*vrq;
          }
        }
      }
      return V;
    }
    function buildSmallNeat() {
      const numIn = 4, numHid = 6;
      const nodes = [];
      for (let i = 0; i < numIn; ++i) nodes.push({ id: i, kind: 'input', act: 0, bias: 0 });
      nodes.push({ id: numIn, kind: 'output', act: 1, bias: 0 });
      for (let i = 0; i < numHid; ++i) nodes.push({ id: numIn + 1 + i, kind: 'hidden', act: 1, bias: 0.1 });
      const conns = []; let inv = 1;
      for (let i = 0; i < numIn; ++i) for (let h = 0; h < numHid; ++h)
        conns.push({ from: i, to: numIn + 1 + h, weight: 0.3, enabled: true, innov: inv++ });
      for (let h = 0; h < numHid; ++h)
        conns.push({ from: numIn + 1 + h, to: numIn, weight: 0.5, enabled: true, innov: inv++ });
      return { numInputs: numIn, numOutputs: 1, nodes, conns };
    }
    function makeRandomSym(n) {
      const A = new Float64Array(n * n);
      for (let i = 0; i < n * n; ++i) A[i] = Math.random() * 2 - 1;
      const M = new Float64Array(n * n);
      for (let i = 0; i < n; ++i) for (let j = 0; j < n; ++j) {
        let s = 0;
        for (let k = 0; k < n; ++k) s += A[k*n+i] * A[k*n+j];
        M[i*n+j] = s;
      }
      return M;
    }
    function median(arr) {
      arr = arr.slice().sort((a, b) => a - b);
      return arr[Math.floor(arr.length / 2)];
    }
    function bench(fn, iters, repeats) {
      fn();  // JIT warm-up
      const samples = [];
      for (let r = 0; r < repeats; ++r) {
        const t0 = performance.now();
        for (let i = 0; i < iters; ++i) fn();
        const t1 = performance.now();
        samples.push((t1 - t0) * 1000 / iters);  // μs/call
      }
      return median(samples);
    }
    // Set up tests.
    const cfg = BF.cnnMultiscale.defaultConfig();
    const cnnN = BF.cnnMultiscale.paramCount(cfg);
    const cnnParams = new Float64Array(cnnN);
    for (let i = 0; i < cnnN; ++i) cnnParams[i] = (Math.random() - 0.5) * 0.5;
    const cnnObsLen = cfg.agentStateSize + cfg.localGridSize * cfg.localGridSize
                                         + cfg.globalGridSize * cfg.globalGridSize;
    const cnnObs = new Float64Array(cnnObsLen);
    for (let i = 0; i < cnnObsLen; ++i) cnnObs[i] = Math.random();
    const g = buildSmallNeat();
    const inputs = [0.1, 0.2, -0.1, 0.05];
    const sym60  = makeRandomSym(60);
    const sym226 = makeRandomSym(226);
    const TESTS = [
      { name: 'NEAT — small (4/6/1)',
        iters: 4000,
        js:   () => BF.neat.evaluateGenome(g, inputs),
        wasm: () => BF.wasm.neat.evaluate(g, inputs) },
      { name: 'CNN multiscale (226 params)',
        iters: 600,
        js:   () => BF.cnnMultiscale.forward(cnnParams, cnnObs, cfg),
        wasm: () => BF.wasm.cnnMultiscale.forward(cnnParams, cnnObs, cfg) },
      { name: 'Jacobi n=60',
        iters: 80,
        js:   () => jsJacobi(sym60, 60),
        wasm: () => BF.wasm.jacobi.eigen(sym60, 60) },
      { name: 'Jacobi n=226',
        iters: 5,
        js:   () => jsJacobi(sym226, 226),
        wasm: () => BF.wasm.jacobi.eigen(sym226, 226) },
    ];
    // Drive the tests in a microtask chain so the UI can repaint
    // between each (each test takes hundreds of ms).
    let html = '<table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:4px;">' +
               '<thead><tr style="color:var(--muted);">' +
               '<th style="text-align:left;padding:2px 4px;">Test</th>' +
               '<th style="text-align:right;padding:2px 4px;">JS</th>' +
               '<th style="text-align:right;padding:2px 4px;">WASM</th>' +
               '<th style="text-align:right;padding:2px 4px;">Speedup</th>' +
               '</tr></thead><tbody>';
    let idx = 0;
    function step() {
      if (idx >= TESTS.length) {
        html += '</tbody></table>';
        resultsEl.innerHTML = html;
        statusEl.textContent = 'Done.';
        return;
      }
      const t = TESTS[idx++];
      statusEl.textContent = `Running ${idx}/${TESTS.length}: ${t.name}`;
      // Yield to the browser so the status text actually paints.
      setTimeout(() => {
        const jsT   = bench(t.js,   t.iters, 5);
        const wasmT = bench(t.wasm, t.iters, 5);
        const ratio = jsT / wasmT;
        const cls = ratio >= 2.0 ? 'pros'
                  : ratio >= 1.1 ? 'pros'
                  : ratio >= 0.9 ? ''
                  : 'cons';
        html += `<tr>` +
                `<td style="padding:2px 4px;">${t.name}</td>` +
                `<td style="text-align:right;padding:2px 4px;">${jsT.toFixed(2)} μs</td>` +
                `<td style="text-align:right;padding:2px 4px;">${wasmT.toFixed(2)} μs</td>` +
                `<td style="text-align:right;padding:2px 4px;" class="${cls}">${ratio.toFixed(2)}×</td>` +
                `</tr>`;
        // Render-so-far so the user sees progress.
        resultsEl.innerHTML = html + '</tbody></table>';
        step();
      }, 10);
    }
    step();
  }
  let _wasmExplainPopulated = false;
  function toggleWasmExplain(force) {
    if (!dom.wasmExplain || !dom.wasmHelpBtn) return;
    const next = (typeof force === 'boolean')
      ? force
      : dom.wasmExplain.classList.contains('hidden');
    dom.wasmExplain.classList.toggle('hidden', !next);
    dom.wasmHelpBtn.classList.toggle('active', next);
    if (next && !_wasmExplainPopulated) {
      dom.wasmExplain.innerHTML = buildWasmExplainHTML();
      _wasmExplainPopulated = true;
      // Wire the Run button now that its DOM exists.
      const runBtn = document.getElementById('wasmBenchRunBtn');
      const statusEl = document.getElementById('wasmBenchStatus');
      const resultsEl = document.getElementById('wasmBenchResults');
      if (runBtn) {
        runBtn.addEventListener('click', () => runWasmBench(statusEl, resultsEl));
      }
    }
  }
  if (dom.wasmHelpBtn) {
    dom.wasmHelpBtn.addEventListener('click', () => {
      document.getElementById('trainingRuntimeDetails').open = true;
      toggleWasmExplain();
    });
  }

  // Parallel-eval toggle. When on, attach a worker pool to the
  // trainer; the trainer's step() detects the pool and uses the
  // parallel fast path for population eval. When off, destroy any
  // existing pool so single-threaded behavior is restored.
  //
  // Pool lifecycle is tied to the toggle, not the trainer object,
  // because the pool is expensive to spin up (workers + JIT warmup).
  // Re-attaching a fresh pool on every trainer rebuild would pay that
  // cost over and over -- we keep the pool alive across trainer
  // rebuilds and re-init it with the new params instead.
  let activePool = null;
  let poolInitedFor = null;  // signature of trainer params the pool was inited for
  async function ensurePoolAttached() {
    if (!app.trainer) return;
    if (!dom.parallelEvalOn || !dom.parallelEvalOn.checked) return;
    if (!BF.evalPool) return;
    const trainP = readParams().train;
    const mutP   = readParams().mut;
    // Signature must be STABLE: the pool only needs re-init when
    // something a worker's eval depends on changes (setupId, physics/
    // curriculum/objective params, mutation params). It must NOT
    // include a random seed -- workers re-seed their rng per task
    // (task.seed from the main thread's pre-sampled rolloutSeeds),
    // so the worker's init seed is irrelevant to eval results.
    //
    // The OLD code put resolveSeed() in the signature, so the
    // signature changed every call -> the pool was destroyed and all
    // 31 workers respawned (re-fetch worker script + importScripts +
    // makeTrainer building 500 genomes each) on EVERY Train click,
    // even when nothing relevant changed. That's the "speedup feels
    // much worse" regression. With a stable signature the pool is
    // reused across Train clicks as long as the config is unchanged.
    const signature = JSON.stringify({
      setupId: app.trainer.setupId,
      train: trainP,
      mut: mutP,
    });
    if (activePool && poolInitedFor === signature) {
      app.trainer.pool = activePool;
      const status0 = dom.parallelEvalStatus;
      if (status0 && !activePool.isSerialFallback()) {
        status0.textContent = `${activePool.workerCount} workers (reused)`;
      }
      return;
    }
    if (activePool) {
      activePool.destroy();
      activePool = null;
      poolInitedFor = null;
    }
    const status = dom.parallelEvalStatus;
    if (status) status.textContent = 'spawning workers…';
    activePool = BF.evalPool.create({});
    try {
      await activePool.init({
        setupId: app.trainer.setupId,
        // Fixed worker seed: irrelevant to eval (workers reseed per
        // task) and keeps the pool signature stable. Was resolveSeed()
        // which also had the nasty side effect of overwriting the UI
        // seed input on every Train click.
        seed: 0x9E3779B9 | 0,
        params: trainP,
        mutationParams: mutP,
      });
      if (activePool.isSerialFallback()) {
        if (status) status.textContent = 'workers unavailable (file://?)';
        // Leave pool attached in serial-fallback mode so the trainer
        // still uses the parallel-path codepath (which falls back to
        // serial via serialFallbackFn). The main thread does all the
        // work but the codepath stays exercised for testing.
      } else {
        if (status) status.textContent = `${activePool.workerCount} workers active`;
      }
      poolInitedFor = signature;
      app.trainer.pool = activePool;
    } catch (err) {
      if (status) status.textContent = 'pool init failed: ' + (err && err.message || err);
      activePool.destroy();
      activePool = null;
      poolInitedFor = null;
    }
  }
  function detachPool() {
    if (app.trainer) app.trainer.pool = null;
    if (activePool) {
      activePool.destroy();
      activePool = null;
      poolInitedFor = null;
    }
    if (dom.parallelEvalStatus) dom.parallelEvalStatus.textContent = '—';
  }
  if (dom.parallelEvalOn) {
    dom.parallelEvalOn.addEventListener('change', () => {
      if (dom.parallelEvalOn.checked) {
        ensurePoolAttached();
      } else {
        detachPool();
      }
    });
  }
  // Re-attach the pool after a trainer rebuild (setup/algo/preset
  // change). Called from the train button just before kicking off the
  // run so the pool is always inited against the current trainer.
  // Stashed on app so the trainBtn handler can call it.
  app._relinkPool = function () {
    if (!dom.parallelEvalOn || !dom.parallelEvalOn.checked) return Promise.resolve();
    // Do NOT force-null poolInitedFor here. ensurePoolAttached's
    // signature already captures everything a worker depends on
    // (setupId + train params + mut params), so it re-inits exactly
    // when needed and reuses the pool otherwise. The old forced
    // re-init meant every Train click respawned all workers even when
    // the config was identical -- the regression we're fixing.
    return ensurePoolAttached();
  };

  // Multi-core benchmark button. Spawns a worker pool, evaluates the
  // current best genome N times on the main thread, then N times via
  // workers, reports the speedup. Lets the user confirm Web Workers
  // are enabled in their browser before we wire the pool into the
  // training loop. Gracefully handles file:// failures (pool falls
  // back to serial and reports that here).
  if (dom.workerBenchBtn) {
    dom.workerBenchBtn.addEventListener('click', async () => {
      const btn = dom.workerBenchBtn;
      const out = dom.workerBenchVal;
      if (!app.trainer || !app.trainer.currentBest) {
        out.textContent = 'train at least one gen first';
        return;
      }
      btn.disabled = true;
      // Pause training during the bench so the main thread isn't
      // competing with the worker pool for CPU. Without this, with
      // full-power mode on (yieldEveryMs=0) the trainer keeps eating
      // a core flat-out while the workers try to spin up, and the
      // measured parallel speedup looks worse than serial -- the
      // exact "0.8x when full power is on" symptom. We restore the
      // original training state in the finally block.
      const wasTraining = !!app.training;
      app.training = false;
      // Give the trainer's async loop one tick to actually park
      // before we start the serial measurement. The trainer awaits
      // setTimeout(r, 0) between gens; flipping app.training=false
      // means the next iteration of the while-loop in
      // trainContinuously will exit.
      await new Promise(r => setTimeout(r, 16));
      out.textContent = 'spawning workers…';
      const params = readParams().train;
      const seed = resolveSeed();
      const pool = BF.evalPool.create({});
      try {
        await pool.init({
          setupId: app.trainer.setupId,
          seed: seed,
          params: params,
          mutationParams: readParams().mut,
        });
        if (pool.isSerialFallback()) {
          out.textContent = 'workers unavailable (file://?) — serial fallback only';
          pool.destroy();
          return;
        }
        // Benchmark methodology:
        //   1. Build a task list large enough that EACH worker sees
        //      ~8 tasks. With workerCount tasks total each worker only
        //      runs once and the result is dominated by JIT warmup +
        //      per-task postMessage overhead (this is exactly the
        //      "1.2x on 32 cores" symptom -- 32 workers each doing 1
        //      tiny task with a 50ms genome-clone overhead beats out
        //      the speedup).
        //   2. Run a discarded WARMUP pass through the pool so V8 has
        //      JIT-compiled the rollout path on every worker. Without
        //      this, the first real measurement includes compile time.
        //   3. Then time the real pass.
        //   4. Report per-task ms in both modes so the user can see
        //      whether the bottleneck is overhead (parallel ms/task
        //      similar to serial) or genuine compute (parallel ms/task
        //      much less than serial).
        const N = Math.max(64, pool.workerCount * 8);
        const angle = (parseFloat(dom.tiltDeg.value) || 20) * Math.PI / 180;
        const bestGenome = app.trainer.bestEver || app.trainer.currentBest;
        // FLAT-VECTOR POLICIES (CNN family, recurrent) keep their weights in
        // .params, not in the genome — the genome is an empty placeholder. The
        // bench used to send the genome ALONE, so for every one of those
        // presets BOTH sides fell through to N.policy() on that placeholder,
        // scored the same constant, and the parity check reported "parity ✓"
        // while comparing two dead policies. A guard that passes because both
        // sides are constant is worse than none, so carry params + config the
        // same way trainer.step's parallel branch does.
        const benchFlat = BF.trainer.usesFlatParamPolicy(app.trainer.params.policyType);
        const benchParams = benchFlat
          ? (app.trainer.bestEverParams
             || (app.trainer.population[0] && app.trainer.population[0].params) || null)
          : null;
        if (benchFlat && !benchParams) {
          out.textContent = 'train at least one gen first (this policy keeps its weights in params)';
          return;
        }
        // Build tasks the SAME shape the trainer.step parallel branch
        // does -- including level, currentGravity, currentDamping --
        // so the bench truly tests fitness parity for the current
        // curriculum state, not just "level 0 eval is fast".
        const curLevel = (app.trainer.curriculum && app.trainer.curriculum.level) || 0;
        const curGrav  = app.trainer.curriculum ? app.trainer.curriculum.currentGravity : app.trainer.params.gravity;
        const curDamp  = app.trainer.curriculum ? app.trainer.curriculum.currentDamping : app.trainer.params.damping;
        const tasks = [];
        for (let i = 0; i < N; i++) {
          tasks.push({
            genome: bestGenome,
            params: benchParams,
            angle: angle,
            level: curLevel,
            currentGravity: curGrav,
            currentDamping: curDamp,
            // Bench uses no per-rollout disturbance reseed -- we want
            // raw eval determinism. With useDisturb off (default) this
            // is irrelevant; with useDisturb on it'd mean each task
            // sees its own rng state, same as serial.
          });
        }
        out.textContent = 'warming up…';
        const warmup = [];
        for (let i = 0; i < pool.workerCount; i++) {
          warmup.push({ genome: bestGenome, params: benchParams, angle, level: curLevel, currentGravity: curGrav, currentDamping: curDamp });
        }
        await pool.evalBatch(warmup);
        const benchTarget = benchParams
          ? { genome: bestGenome, params: benchParams, config: null }
          : { genome: bestGenome };
        for (let i = 0; i < pool.workerCount; i++) {
          BF.trainer.evaluatePolicy(app.trainer, benchTarget, false, angle);
        }
        out.textContent = 'measuring…';
        // Serial measurement -- AND collect fitnesses so we can compare
        // them to the parallel ones. Serial runs the same evaluatePolicy
        // path the training code uses, so if parallel disagrees, the
        // bug is on the worker side.
        const serialFits = new Float64Array(N);
        const t0 = performance.now();
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const r = BF.trainer.evaluatePolicy(
            app.trainer,
            task.params ? { genome: task.genome, params: task.params, config: null } : { genome: task.genome },
            false, task.angle, task.level);
          serialFits[i] = r ? r.fitness : 0;
        }
        const tSerial = performance.now() - t0;
        // Parallel measurement -- request fullResults so we get
        // fitness numbers back, not just timing.
        const t1 = performance.now();
        const parallelResults = await pool.evalBatch(tasks, { fullResults: true });
        const tParallel = performance.now() - t1;
        const speedup = tSerial / Math.max(0.001, tParallel);
        const msPerSerial   = tSerial   / N;
        const msPerParallel = tParallel / N;
        // Fitness parity check. If serial fitness ≠ parallel fitness
        // for the SAME task, there's state in the trainer that workers
        // aren't seeing. Print max diff + worst-case index so the user
        // can see at a glance whether parallel is correct.
        let maxDiff = 0;
        let serialMean = 0, parallelMean = 0;
        for (let i = 0; i < N; i++) {
          const pf = parallelResults[i] ? parallelResults[i].fitness : 0;
          const d = Math.abs(serialFits[i] - pf);
          if (d > maxDiff) maxDiff = d;
          serialMean   += serialFits[i];
          parallelMean += pf;
        }
        serialMean /= N;
        parallelMean /= N;
        const parityLabel = maxDiff < 1e-6
          ? `parity ✓`
          : `parity DRIFT (max Δ=${maxDiff.toFixed(3)})`;
        out.textContent =
          `${N} evals · serial ${tSerial.toFixed(0)}ms (${msPerSerial.toFixed(2)}/task) · ` +
          `parallel ${tParallel.toFixed(0)}ms (${msPerParallel.toFixed(2)}/task) · ` +
          `${pool.workerCount}w → ${speedup.toFixed(2)}× · ${parityLabel} · ` +
          `means s=${serialMean.toFixed(3)} p=${parallelMean.toFixed(3)}`;
        if (maxDiff > 1e-6) {
          console.warn('[BF.bench] parity drift detected. Serial vs parallel fitness differ.',
                       { serialFits: Array.from(serialFits), parallelResults });
        }
      } catch (err) {
        out.textContent = 'benchmark failed: ' + (err && err.message || err);
        console.error(err);
      } finally {
        pool.destroy();
        btn.disabled = false;
        // Restore the training state we paused at the top so a user
        // who was training before clicking Bench keeps training after.
        if (wasTraining) {
          app.training = true;
          if (dom.trainBtn) dom.trainBtn.classList.add('active');
          trainContinuously();
        }
      }
    });
  }
  // Poll BF.wasm.ready: the import is async, so we don't know up-front
  // when (or if) the module will load. We flip the row's visibility
  // exactly once on the first frame where ready is true, then stop
  // doing per-frame DOM writes.
  let wasmRowShown = false;
  function maybeRevealWasmRow() {
    if (wasmRowShown) return;
    if (!dom.useWasmEvalRow) { wasmRowShown = true; return; }
    if (window.BF && window.BF.wasm && window.BF.wasm.ready) {
      dom.useWasmEvalRow.style.display = '';
      // Mirror visibility on the test-mode duplicate so both Core
      // panels show the WASM toggle once the bundle is loaded.
      if (dom.useWasmEvalTestRow) {
        dom.useWasmEvalTestRow.style.display = '';
      }
      // Core region banner stays visible regardless (it always hosts
      // Sim speed); only the WASM row inside is gated on the bundle
      // being loaded.
      wasmRowShown = true;
    }
  }
  let last = performance.now();
  let lastPeekAt = 0;
  function frame(now) {
    const dt = now - last;
    last = now;
    app.arcadePreview?.tick(now);
    if(document.hidden && app.arcadePreview?.snapshot().active){
      requestAnimationFrame(frame);
      return;
    }
    maybeRevealWasmRow();
    // Full-power mode: skip the per-frame display tick + canvas paint
    // entirely. The simulation viewer "freezes" (intentionally; the
    // user is opting in via the Core toggle) and the sim/network/
    // chart panels stop redrawing.
    //
    // Auto-peek: when full-power is on AND auto-peek is checked, do
    // a single tickDisplay + drawAll burst every `interval` seconds
    // so the user can glance at the current best agent without
    // sacrificing most of the throughput. One rAF frame's worth of
    // work per peek; at the default 5s interval that's ~0.3% of
    // wall time spent rendering -- effectively full-power with a
    // periodic snapshot.
    const fullPower = getActiveFullPower();
    const peekOn = fullPower && dom.autoPeek && dom.autoPeek.checked;
    let render = !fullPower;
    // Display dt: normally one frame (~16ms). On a PEEK the display has been
    // frozen for the whole interval, so advancing it by only one frame makes
    // a continuous (dodge no-reset) sim look stuck — the "one slow sim while
    // the curve races ahead" report. Advance it by the real elapsed gap
    // instead (tickDisplay caps at 64 fixedDt steps ≈ 0.53s at speed 1), so
    // each peek shows a visible slice of the CURRENT champion actually moving.
    let renderDtMs = dt;
    if (peekOn) {
      const intervalSec = (dom.autoPeekInterval ? parseFloat(dom.autoPeekInterval.value) : 5) || 5;
      const elapsed = now - lastPeekAt;
      if (elapsed >= intervalSec * 1000) {
        render = true;
        renderDtMs = elapsed;
        lastPeekAt = now;
        // Briefly flash the body class off so the user sees the
        // sim viewer un-dim during the peek frame (CSS animates the
        // brightness back smoothly when the class returns next
        // frame). Cheap visual cue that the peek actually happened.
        document.body.classList.add('peek-flash');
        setTimeout(() => document.body.classList.remove('peek-flash'), 220);
      }
      // Drive the glowing progress bar at the bottom of the viewport.
      // The bar fills 0%->100% over the current interval; resets on
      // each peek when lastPeekAt jumps to `now` and elapsed wraps
      // back to 0. The label countdown gives a precise "next peek
      // in 4.2s" readout for the impatient.
      const frac = Math.min(1, elapsed / (intervalSec * 1000));
      if (dom.peekProgressFill) {
        dom.peekProgressFill.style.width = (frac * 100).toFixed(1) + '%';
      }
      if (dom.peekProgressLabel) {
        const remaining = Math.max(0, intervalSec - elapsed / 1000);
        // Name the GENERATION the shown policy is — under dodge no-reset the
        // display hot-swaps to the latest champion each gen, so the crawling
        // sim IS the current gen's brain; without this the user can't tell the
        // slow sim corresponds to the fast-climbing curve.
        const gen = app.trainer ? app.trainer.generation : 0;
        dom.peekProgressLabel.textContent = 'showing gen ' + gen + ' champion · next peek in ' + remaining.toFixed(1) + 's';
      }
    } else if (fullPower && dom.peekProgressLabel) {
      // Full power WITHOUT auto-peek: the sim is fully frozen. Say so + name
      // the gen, and peg the bar full, so a frozen viewer reads as intentional
      // rather than "stuck".
      const gen = app.trainer ? app.trainer.generation : 0;
      dom.peekProgressLabel.textContent = 'full power — display frozen at gen ' + gen + ' · enable auto-peek to watch';
      if (dom.peekProgressFill) dom.peekProgressFill.style.width = '100%';
    }
    // body.peek-active gates the CSS visibility of the progress bar. Show it
    // whenever full power is on (peek countdown, or the frozen-display note)
    // so the user always knows the viewer state.
    document.body.classList.toggle('peek-active', fullPower);
    if (render) {
      // One display exception must not kill the whole app: the rAF re-arm
      // below only runs if this frame body returns, so an uncaught throw
      // here used to freeze the canvas + HUD permanently (the amplifier
      // behind "after one test, it just hangs there"). Log throttled and
      // keep the loop alive.
      try {
        tickDisplay(renderDtMs);
        drawAll(now);
      } catch (err) {
        const now = performance.now();
        if (!app._lastFrameErrAt || now - app._lastFrameErrAt > 5000) {
          app._lastFrameErrAt = now;
          console.error('[frame] display frame error (loop kept alive):', err);
        }
      }
    } else {
      // Full-power skips the canvas + heavy HUD updates, but a few
      // text-only updates are cheap enough to keep running every
      // frame so the user can see training progress reflected on
      // the curriculum chips (cur value + active-phase glow). Without
      // this the chips freeze at whatever they showed during the last
      // peek, which the user reported as "the numbers next to the
      // curriculum-able params should also update live and glow".
      if (typeof updateCurriculumSpecCurValues === 'function') {
        updateCurriculumSpecCurValues();
      }
    }
    requestAnimationFrame(frame);
  }
  // An idle exhibition uses the same saved-record launch path as the user.
  // Only trusted input ends it: loading a reference internally clicks Test.
  const arcadeButton=document.getElementById('arcadeToggle');
  const arcadeNotice=document.getElementById('arcadeNotice');
  if(BF.arcadePreview && arcadeButton){
    const ids=new Set(['double-ppo-momentum','neat-single-swingup','reference-double-lqr',
      'reference-triple-lqr','triple-neat-hold','obstacle-golf-trained','moving-hole-putt',
      'dodge-lookahead-trained','terrain-cnn-hard-trained','terrain-easy-trained','learned-fourier-rate',
      'reference-fourier','reference-energy-lqr','double-neat-wall-swingup',
      'golf-ridge-challenge','balance-word-trained']);
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastSecond=-1;
    app.arcadePreview=BF.arcadePreview.create({
      entries:()=>readyToPlayEntries().filter(m=>ids.has(m.id)),
      duration:model=>model.id==='balance-word-trained'||model.id==='reference-energy-lqr'||model.id.startsWith('terrain-')?12000:8000,
      play:model=>{
        stopCompareTrainer();
        if(app.editMode)setEditMode(false);
        launchReadyEntry(model);
        if(dom.simSpeedTest){dom.simSpeedTest.value='1';dom.simSpeedTest.dispatchEvent(new Event('input'));}
        if(dom.fullPowerModeTest){dom.fullPowerModeTest.checked=false;dom.fullPowerModeTest.dispatchEvent(new Event('change'));}
        if(!reducedMotion.matches){
          document.querySelector('.panel-sim')?.animate([{opacity:.25},{opacity:1}],{duration:450,easing:'ease-out'});
        }
      },
      onChange:state=>{
        arcadeButton.setAttribute('aria-pressed',String(state.active));
        if(arcadeNotice)arcadeNotice.hidden=!state.active;
        const second=state.active?Math.ceil(state.remaining/1000):-1;
        if(second!==lastSecond){
          arcadeButton.textContent=state.active?`Ⅱ Demo mode · next in ${second}s`:'▶ Demo mode';
          lastSecond=second;
        }
        arcadeButton.style.setProperty('--progress',state.active?String(state.remaining/state.duration):'0');
        arcadeButton.title=state.error?`Preview stopped: ${state.error}`:'Rotate saved controllers. Any click, key or scroll takes control. Training never starts automatically.';
      }
    });
    const takeControl=event=>{
      const activatesButton=event.target.closest?.('#arcadeToggle') &&
        (event.type==='pointerdown' || event.type==='click' || event.type==='keydown' && ['Enter',' '].includes(event.key));
      if(event.isTrusted && !activatesButton)app.arcadePreview.stop();
    };
    for(const type of ['pointerdown','click','keydown','wheel'])document.addEventListener(type,takeControl,{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{
      const now=performance.now();
      last=now;
      app.arcadePreview.visibility(!document.hidden,now);
    });
    arcadeButton.addEventListener('click',()=>{
      if(app.arcadePreview.snapshot().active)app.arcadePreview.stop();
      else app.arcadePreview.start(performance.now());
      updateStatus();
    });
    reducedMotion.addEventListener('change',event=>{if(event.matches)app.arcadePreview.stop();});
    app.arcadePreview.visibility(!document.hidden,performance.now());
    if(!reducedMotion.matches && !document.hidden)app.arcadePreview.start(performance.now());
  }
  requestAnimationFrame(frame);
})(window.BF);
