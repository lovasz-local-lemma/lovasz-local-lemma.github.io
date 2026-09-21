// Live local LQR references for the minimal-coordinate double/triple models.
// No learned weights, precomputed playback, coordinate corrections or automatic
// reduction of the requested starting angle. The pivot acceleration is prescribed;
// these parameterized point-mass dynamics are distinct from the PBD plant.
(function () {
  'use strict';
  const BF = (window.BF = window.BF || {});
  const DEG = Math.PI / 180;
  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function create(options) {
    const o = options || {}, links = o.links === 3 ? 3 : 2;
    const model = links === 3 ? BF.rigidTriple : BF.rigidDouble;
    if (!model) throw new Error('Load the rigid double/triple dynamics before rigid_reference.js.');
    const config = Object.assign(model.defaults(), {
      segLen: Math.max(1, finite(o.segLen, 80)),
      maxAccel: Math.max(0, finite(o.maxAccel, 6000)),
      railHalf: o.railHalf === null ? null : Math.max(1, finite(o.railHalf, 150)),
      wallK: Math.max(0, finite(o.wallK, 500)),
    });
    const gravity = Math.max(0, finite(o.gravity, 700));
    const design = model.designLQR(gravity, config);
    if (!design.K.every(Number.isFinite)) throw new Error('The local LQR design did not produce finite gains.');
    const tilt = finite(o.tiltDeg, 12) * DEG;
    const initialState = [finite(o.cartX, 0), finite(o.cartVelocity, 0),
      ...Array.from({ length: links }, (_, j) => Math.PI - tilt * Math.pow(0.6, j)),
      ...Array(links).fill(0)];
    const run = {
      links, model, config, gravity, K: design.K.slice(), initialState,
      controlDt: config.physDt * config.substeps,
      controllerEnabled: o.controllerEnabled !== false,
    };
    return reset(run);
  }
  function reset(run) {
    run.state = run.initialState.slice();
    run.time = 0; run.accumulator = 0; run.pulses = [];
    run.lastCommand = 0; run.lastDisturbance = 0;
    run.finite = true; run.firstBelowHorizontal = null;
    run.aboveSeconds = 0; run.maxAngleDeg = 0; run.maxCartX = Math.abs(run.state[0]);
    run.softWallSeconds = 0; run.nudgeCount = 0;
    updateMetrics(run, 0);
    return run;
  }
  // A pulse enters the very same acceleration used by the coupled equations.
  // Units are world-distance/s², not force or a direct angular-state kick.
  // Overlapping pulses add; a fractional final tick preserves their total impulse.
  function nudge(run, options) {
    const o = options || {}, acceleration = finite(o.acceleration, 0);
    const duration = Math.max(0, finite(o.duration, 0.25));
    if (!acceleration || !duration || !run.finite) return false;
    run.pulses.push({ acceleration, remaining: duration });
    run.nudgeCount++;
    return true;
  }
  function updateMetrics(run, dt) {
    run.finite = run.state.every(Number.isFinite);
    const angles = run.state.slice(2, 2 + run.links).map(angle =>
      Math.abs(Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI))) / DEG);
    run.angleDeg = angles;
    run.allAboveHorizontal = run.finite && angles.every(angle => angle < 90);
    if (run.allAboveHorizontal) run.aboveSeconds += dt;
    else {
      if (run.firstBelowHorizontal === null) run.firstBelowHorizontal = run.time;
      run.aboveSeconds = 0;
    }
    if (run.finite) {
      run.maxAngleDeg = Math.max(run.maxAngleDeg, ...angles);
      run.maxCartX = Math.max(run.maxCartX, Math.abs(run.state[0]));
      if (run.config.railHalf !== null && Math.abs(run.state[0]) > run.config.railHalf) run.softWallSeconds += dt;
    }
  }
  // Seconds are accumulated into the model's native fixed control interval.
  // Calling without seconds performs exactly one control step. No trajectory is
  // cached: feedback is recomputed from the actual perturbed state every tick.
  // A display-only integration experiment may refine or coarsen the numerical
  // substeps, but cannot change the recorded plant or feedback sampling period.
  // Keep this separate from run.config: the saved gains and trajectory remain
  // calibrated to that original configuration, even during an override.
  function integrationConfig(run, override) {
    if (override == null) return run.config;
    if (typeof override !== 'object' || Array.isArray(override))
      throw new TypeError('Integration override must be a configuration object.');
    for (const key of Object.keys(override)) {
      if (key !== 'physDt' && key !== 'substeps' &&
          (!Object.prototype.hasOwnProperty.call(run.config, key) || !Object.is(override[key], run.config[key])))
        throw new RangeError('Integration override cannot change the recorded plant field: ' + key);
    }
    const config = { ...run.config, ...override };
    if (!Number.isFinite(config.physDt) || !(config.physDt > 0) ||
        !Number.isSafeInteger(config.substeps) || config.substeps < 1)
      throw new RangeError('Integration override requires positive physDt and integer substeps.');
    const period = config.physDt * config.substeps;
    if (!Number.isFinite(period) || Math.abs(period - run.controlDt) > run.controlDt * 1e-9)
      throw new RangeError('Integration substeps must preserve the recorded control period.');
    return config;
  }
  function step(run, seconds, integratorConfig) {
    const dt = seconds === undefined ? run.controlDt : seconds;
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Elapsed seconds must be finite and nonnegative.');
    const integration = integrationConfig(run, integratorConfig);
    if (!run.finite) return run;
    run.accumulator += dt;
    while (run.accumulator + 1e-12 >= run.controlDt && run.finite) {
      let extra = 0;
      for (const pulse of run.pulses) {
        const active = Math.min(run.controlDt, pulse.remaining);
        extra += pulse.acceleration * active / run.controlDt;
        pulse.remaining = Math.max(0, pulse.remaining - active);
      }
      run.pulses = run.pulses.filter(pulse => pulse.remaining > 1e-12);
      run.lastCommand = run.controllerEnabled ? run.model.lqrAccel(run.state, run.K, run.config) : 0;
      run.lastDisturbance = extra;
      run.state = run.model.stepPhys(run.state, run.lastCommand + extra, run.gravity, integration);
      run.time += run.controlDt;
      run.accumulator = Math.max(0, run.accumulator - run.controlDt);
      updateMetrics(run, run.controlDt);
    }
    return run;
  }
  function frame(run) {
    const result = run.model.frameOf(run.state, run.config.segLen);
    const over = run.config.railHalf === null ? 0 :
      Math.max(0, -run.state[0] - run.config.railHalf) - Math.max(0, run.state[0] - run.config.railHalf);
    const scale = run.config.maxAccel || 1;
    return Object.assign(result, {
      a: run.lastCommand / scale, wall: run.config.wallK * over / scale,
      disturbance: run.lastDisturbance / scale, time: run.time,
      allAboveHorizontal: run.allAboveHorizontal, finite: run.finite,
    });
  }
  BF.rigidReference = { create, step, nudge, frame, reset };
})();
