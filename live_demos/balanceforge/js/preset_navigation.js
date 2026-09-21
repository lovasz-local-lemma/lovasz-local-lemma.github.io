// Presentation metadata only: no training, controller, or physics changes.
(function (BF) {
  'use strict';
  function approach(preset) {
    const p = preset || {}, mode = p.mode || 'neat-full';
    if (p.approach && typeof p.approach === 'object') return p.approach;
    if (mode === 'dodge-scorer') return {kind:'neural',learns:true,label:'CMA-ES · learned scoring + physical lookahead',action:'Replay scorer',
      detail:'CMA-ES learned a shared scoring function over nine headings. The input builder supplies physical lookahead of every visible bullet; no future spawns are known. This replays frozen weights. Training is in the reproducible offline audit, not this button.'};
    if (mode === 'signing-planner' || mode === 'dodge-planner') return {
      kind: 'planner', learns: false, label: 'Planner · explicit forward model', action: 'Run planner',
      detail: mode === 'signing-planner'
        ? 'Tests candidate actions in cloned physics states, then replans. No network is trained. Each decision simulates several futures; high playback speed increases this work.'
        : 'Forecasts bullet motion and selects an escape action. No network is trained.'
    };
    if (mode === 'epicycle-analytic') return {kind: 'analytic', learns: false,
      label: 'Analytic · Fourier coefficients', action: 'Play comparator',
      detail: 'Closed-form Fourier motion provides a representation comparator. No optimization or learned network drives it.'};
    if (/lqr$|^rigid.*(?:swingup|reference)$|trajopt$/.test(mode)) return {kind: 'classical', learns: false,
      label: 'Classical control · explicit dynamics', action: 'Run controller',
      detail: mode === 'single-energy-lqr' ? 'Energy feedback pumps the swing, then locally computed LQR gains catch and balance it. No network is trained.'
        : mode === 'rigid-reference' || mode === 'rigid-triple-reference' ? 'A model-based trajectory and time-varying feedback raise the pendulum, then local LQR holds it. Every frame integrates the perturbed physical state. This is controller computation, not network training.'
        : /swingup|trajopt/.test(mode) ? 'Searches for a control sequence and tests a handoff to local LQR. The viewport replays the computed rollout; inspect the measured catch result because a successful swing-up is not guaranteed. No network is trained.'
        : 'Computes feedback gains from the stated dynamics model. This is a classical controller, not a trained neural network.'};
    if (mode === 'fixed' || p.policyType === 'fixed-baseline') return {kind: 'analytic', learns: false,
      label: 'Scripted · fixed policy', action: 'Run baseline', detail: 'A fixed action rule provides a reference for the learned policies.'};
    if (mode === 'dodge-distill') return {kind: 'imitation', learns: true,
      label: 'Imitation learning · neural policy', action: 'Train network',
      detail: 'Fits a network to planner actions. The learned policy and its teacher are separate mechanisms.'};
    if (mode === 'ppo') return {kind:'gradient',learns:true,label:'PPO · actor–critic backpropagation',action:'Train PPO',
      detail:'Collects physical trajectories, estimates advantages and backpropagates a clipped policy objective and value loss. Adam updates the networks; the simulator supplies experience, not derivatives. Replay uses the deterministic actor.'};
    if (/^neat/.test(mode)) return {kind: 'neat', learns: true,
      label: 'NEAT · topology + weights', action: 'Train',
      detail: 'Evolves network connections and weights. Watch species, new structure, and behavior change across generations.'};
    if (/cmaes/.test(mode)) return {kind: 'neural', learns: true,
      label: `${mode === 'sep-cmaes' ? 'sep-CMA-ES' : 'CMA-ES'} · neural weights`, action: 'Train',
      detail: 'Optimizes weights in a fixed network architecture. The population learns from simulated rollout scores.'};
    if (['adam','fdgd','spsa','lbfgs','nes','xnes'].includes(mode)) return {kind:'gradient-estimate',learns:true,
      label:'Perturbation-based optimization',action:'Train',detail:'Estimates update directions from perturbed rollout scores. This is distinct from backpropagating through an actor–critic network or a differentiable simulator.'};
    if (/memetic|diffsim/.test(mode)) return {kind: 'gradient', learns: true,
      label: 'Gradient training · neural policy', action: 'Train',
      detail: 'Uses gradients through the stated simulation model. Inspect the model and its approximation limits in the supporting study.'};
    return {kind: 'neural', learns: true, label: 'Population search · neural weights', action: 'Train',
      detail: 'Optimizes a neural policy using simulated rollout scores. The algorithm and architecture are shown below.'};
  }
  function modelMetadata(model) {
    const legacy = {
      'cnn-upright': {presetId: 'cnn-upright-showcase', group: 'proof-of-concept', label: 'CNN small-angle balance · proof of concept'},
      'moving-hole-putt': {presetId: 'putt-trained-showcase', group: 'trained', label: 'Moving-hole putt · trained MLP'}
    }[model.id] || {};
    return {kind: 'trained', group: 'trained', ...legacy, ...model, label: model.displayLabel || legacy.label || model.label,
      ...(pendulumProfiles[model.id] || {})};
  }
  const hold = (strength,extra) => ({tiltDeg:5.5,tiltSpreadDeg:2.5,tiltDirection:'both',useDisturb:true,
    pushTarget:'tip',pushStrength:strength,pushDuration:0,pushSmoothing:0,pushIntervalMin:3,pushIntervalMax:5,
    evalSeconds:60,replayHoldSeconds:60,replayAngleDeg:90,replayRequireNoRail:true,...extra});
  const pendulumProfiles = {
    'double-ppo-hold':{ready:false},
    'single-neat-pushes':{ready:false},'double-cma-pushes':{ready:false},
    'double-physical-trained':{ready:false},'double-relu-trained':{ready:false},'triple-teacher-hold':{ready:false},
    'neat-single-swingup':{holdParams:hold(400,{evalSeconds:40,replayHoldSeconds:40,replayRequireNoRail:false}),
      holdNote:'Random tip impulses 400, every 3–5 s. 64/64 tested streams stayed above horizontal for 40 s; three contacted the rail. Velocity-servo plant.'},
    'double-neat-wall-swingup':{holdParams:hold(40),holdNote:'Random tip impulses 40, every 3–5 s. Local linked releases 3–8°. Direct acceleration at g 8.5; wider±600px rail.40/40 fresh90s streams pass at each of three physics resolutions.'},
    'double-relu-g850':{holdParams:hold(100),holdNote:'Random tip impulses 100, every 3–5 s. Local linked releases 3–8°. Direct acceleration at g 8.5; ±600 px rail.'},
    'cnn-upright':{defaultReplay:'hold',holdParams:hold(20),holdNote:'CNN proof of concept: modest tip impulses 20, every 3–5 s. Stronger impulses can defeat this network; it is not a swing-up model.'},
    'triple-neat-hold':{defaultReplay:'hold',holdOnly:true,holdNote:'NEAT-refined neural holder: tip impulses 16, every 3–5 s, g 10. All 40 one-minute trials passed at each of three physics resolutions. Stronger20 is outside its reliable envelope.'}
  };
  const categoryOrder = ['Pendulums', 'Putt & golf', 'Dodge & terrain traversal', 'Drawing & articulated arms', 'Other mechanisms'];
  function category(preset) {
    const setup = (preset || {}).setupId || '';
    if (/single|double|triple|pendulum/.test(setup)) return categoryOrder[0];
    if (/putt|golf/.test(setup)) return categoryOrder[1];
    if (/dodge|terrain/.test(setup)) return categoryOrder[2];
    if (/chain|epicycle|arm/.test(setup)) return categoryOrder[3];
    return categoryOrder[4];
  }
  // Task determines the group; color names the technique, never its quality.
  function technique(preset, reference) {
    const a = approach(preset), p = preset || {};
    if (reference || !a.learns) return {label:'Reference', color:'#f4cf93', background:'#352a23'};
    if (a.kind === 'imitation') return {label:'Imitation', color:'#cca5ff', background:'#231d33'};
    if (/^neat/.test(p.mode || 'neat-full')) return {label:'NEAT', color:'#80e7a0', background:'#14251f'};
    if (/cnn/.test(p.policyType || '')) return {label:'CNN', color:'#62e1d5', background:'#11282b'};
    if (a.kind === 'gradient' || a.kind === 'imitation') return {label:'Gradient / imitation', color:'#cca5ff', background:'#231d33'};
    return {label:/cmaes/.test(p.mode || '') ? 'CMA-ES' : 'Neural search', color:'#91bcff', background:'#192438'};
  }
  function readyGroups(entries, presets) {
    return categoryOrder.map(name => ({name, entries:entries.filter(entry => category(presets[entry.presetId]) === name)
      .sort((a,b) => Number(b.kind === 'reference') - Number(a.kind === 'reference') ||
        (name==='Pendulums' ? ['single','double','triple'].indexOf(presets[a.presetId]?.setupId)-['single','double','triple'].indexOf(presets[b.presetId]?.setupId) : 0) ||
        (a.priority ?? (a.id === 'neat-single-swingup' ? -1 : 0)) - (b.priority ?? (b.id === 'neat-single-swingup' ? -1 : 0)))}))
      .filter(group => group.entries.length);
  }
  function tabExplanation(tab, context) {
    if (tab !== 'population' && tab !== 'progress') return '';
    if (tab === 'progress' && (context.testing || !context.learns))
      return 'Progress is available in training mode. This replay does not update weights or create new training generations. Choose a training preset and press Train to watch learning unfold.';
    if (tab === 'population' && !context.learns)
      return 'No training population. This reference computes its actions from an explicit controller or model; it does not evolve a population of neural policies.';
    if (tab === 'population' && context.testing)
      return 'One frozen controller is playing. There is no active training population in replay mode. Choose a training preset to compare candidate networks and watch their search.';
    if (tab === 'population' && !context.populationBased)
      return 'No search population. This method updates a network directly rather than evaluating a population of candidate networks. Its learning history appears under Progress.';
    return '';
  }
  // Ready-to-play reference controllers share the launcher, never the model
  // archive. They have a preset but no invented weights or training record.
  const references = [
    {id:'reference-fourier',presetId:'epicycle-analytic-signature',label:'Analytic · Fourier decomposition',
      summary:'Fixed coefficient lengths, initial phases and constant harmonic speeds reconstruct the curve directly. Compare this exact motion with the learned arm-speed controller.'},
    {id:'reference-energy-lqr',presetId:'single-energy-lqr-showcase',label:'Classical · energy swing-up → LQR',
      settling:{low:10.5,high:27.9,definition:'The controller reaches LQR holding with its rod within15°for2 continuous seconds.',note:'Central80% of20 fresh149–151° trials;20/20 reached catch,19/20 met the final30s hold/no-contact test within60s.'},
      summary:'Energy feedback raises the pendulum; locally computed LQR gains catch it. No learned weights. The fixed configuration recovered 96/100 perturbed starts in its 45s audit.'},
    {id:'reference-double-lqr',presetId:'rigid-double-live-reference',label:'Double pendulum · swing-up → LQR · reference',defaultReplay:'release',
      settling:{low:5.1,high:5.2,definition:'The live rigid-reference phase reaches holding.',note:'12/12 near-hanging starts on its own calibrated rigid driven-pivot model, with no additional pushes.'},
      summary:'Both rods start hanging. An optimized trajectory and time-varying feedback perform the swing, then LQR holds. Live driven-pivot rigid dynamics, g700; random acceleration pulses begin after catch. Toggle Hold to start upright.'},
    {id:'reference-triple-lqr',presetId:'rigid-triple-live-reference',label:'Triple pendulum · swing-up → LQR · reference',defaultReplay:'release',
      settling:{low:7.5,high:7.6,definition:'The live rigid-reference phase reaches holding.',note:'12/12 near-hanging starts on its own calibrated rigid driven-pivot model, with no additional pushes.'},
      summary:'Three hanging rods swing up under nonlinear trajectory feedback, then hold with local LQR and calibrated disturbances. A separate rigid driven-pivot model at g700. No trained network or animation playback.'},
    {id:'reference-dodge',presetId:'dodge-planner-showcase',label:'Planner · mixed-bullet avoidance',
      summary:'Receding-horizon planning predicts visible bullet motion and compares escape actions. An engineered controller; no neural training or knowledge of future spawns.'},
    {id:'reference-signing',presetId:'signing-planner-showcase',label:'Planner · physical signing chain',
      summary:'The planner simulates candidate actions through the chain dynamics and replans as the target moves. Approximate physical tracking; no learned network.'}
  ].map(entry=>({kind:'reference',group:'Analytic & classical · no learned weights',...entry}));
  const trainingGroups = [
    {name: 'Pendulums', ids: ['single-neat-curriculum-90', 'double-neat-high-gravity-learn', 'pendulum-swingup-60-cmaes', 'double-physical-learn']},
    {name: 'Putt & golf', ids: ['golf-ridge-challenge-learn', 'putt-hole-curriculum', 'putt-hole-curriculum-cmaes', 'obstacle-golf-learn']},
    {name: 'Dodge & terrain traversal', ids: ['terrain-cnn-hard-learn', 'spatial-grid-neat-learn', 'dodge-cmaes', 'dodge-cnn-multiscale', 'terrain-easy-learn', 'terrain-run']},
    {name: 'Drawing & articulated arms', ids: ['balance-word-learn', 'epicycle-learned-rate', 'signing-large-curriculum', 'signing-large-learn', 'signing-swash-tight', 'signing-strokes-cmaes', 'arm-track-curriculum']},
    {name: 'Other mechanisms', ids: ['catch-drop-curriculum']}
  ];
  const summaries = {
    'pendulum-swingup-60': 'Evolve both topology and weights on a single pendulum. A 60° start and gravity curriculum create a visible progression in difficulty; inspect species, mutations, and whether improved fitness survives later levels.',
    'putt-hole-curriculum': 'Evolve a putting controller while the hole narrows from 500 to 40 pixels. The generous first stage makes contact easy; later stages test precision. This fixed-position curriculum is distinct from the pretrained moving-hole network.',
    'pendulum-swingup-60-cmaes': 'Tune a fixed MLP on the same 60° start and gravity curriculum as the NEAT experiment. Compare the behavior and population trajectory when architecture stays fixed and the search adapts the weights.',
    'putt-hole-curriculum-cmaes': 'Learn a putting policy with a fixed MLP while the hole shrinks from 500 to 40 pixels. Compare against NEAT on the matching curriculum; loading the saved moving-hole model is a separate replay experiment.',
    'signing-swash-tight': 'Train an actuated, telescoping chain to follow a broad signature stroke. Historical runs reached 31.9 ± 4.4 px mean tracking error across 19 of 20 seeds; the remaining seed failed. This is approximate learned tracking, with the explicit planner available as a comparator.',
    'terrain-run': 'Train a controller on changing terrain and inspect what transfers to new courses. This is a longer population experiment; watch the behavior alongside the fitness trace and compare observations in the advanced catalog.'
  };
  BF.presetNavigation = {approach, modelMetadata, trainingGroups, summaries, references, category, technique, readyGroups, tabExplanation};
})(window.BF);
