(function initCapturePhysicsLab() {
  "use strict";

  const COLORS = {
    background: "#0c1115",
    panel: "#12191e",
    grid: "rgba(222, 235, 230, 0.10)",
    text: "#9eaaa7",
    strong: "#edf4f0",
    teal: "#70d8c5",
    tealSoft: "rgba(112, 216, 197, 0.22)",
    gold: "#efbb62",
    rose: "#ee7e91",
    blue: "#6f9bf5",
    violet: "#b697ee"
  };

  const state = {
    mode: "photometric",
    preset: "ceramic",
    budgetIndex: 1,
    noise: 0.2,
    calibration: 0,
    experiment: null,
    result: null,
    usedShots: 0,
    running: false,
    timer: 0,
    active: false
  };

  const els = {};
  const ids = [
    "capturePhysicsRunButton", "capturePhysicsStepButton", "capturePhysicsResetButton",
    "capturePhysicsStatus", "captureModeShort", "capturePresetLabel", "captureBudgetUnit",
    "captureNoise", "captureNoiseValue", "captureCalibration", "captureCalibrationValue",
    "captureProgressLabel", "captureShotStrip", "captureRigCanvas",
    "captureMeasurementCanvas", "captureRecoveryCanvas", "captureFisherCanvas",
    "captureRigBadge", "captureMeasurementBadge", "captureRecoveryBadge",
    "captureFisherBadge", "capturePrimaryMetric", "captureSecondaryMetric",
    "captureResidualMetric", "captureRankMetric", "captureConditionMetric",
    "captureEntropyRankMetric", "captureInvariantMetric",
    "captureOutputCanvas", "captureOutputTitle", "captureOutputBadge", "captureOutputCaption",
    "captureAmbiguityMetric", "captureAuxRows", "captureModeObserves", "captureModeBlind"
  ];

  function start() {
    for (const id of ids) els[id] = document.getElementById(id);
    if (!els.capturePhysicsRunButton || !window.CapturePhysicsCore) return;
    state.active = Boolean(document.querySelector('[data-view-panel="capture"].active'));
    bindControls();
    resetExperiment();
  }

  function bindControls() {
    document.querySelectorAll("[data-capture-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.getAttribute("data-capture-mode") || "photometric";
        state.budgetIndex = 1;
        resetExperiment();
      });
    });
    document.querySelectorAll("[data-capture-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        state.preset = button.getAttribute("data-capture-preset") || "ceramic";
        resetExperiment();
      });
    });
    document.querySelectorAll("[data-capture-budget-index]").forEach((button) => {
      button.addEventListener("click", () => {
        state.budgetIndex = Number(button.getAttribute("data-capture-budget-index")) || 0;
        resetExperiment();
      });
    });
    els.captureNoise.addEventListener("input", () => {
      state.noise = Number(els.captureNoise.value);
      resetExperiment();
    });
    els.captureCalibration.addEventListener("input", () => {
      state.calibration = Number(els.captureCalibration.value);
      resetExperiment();
    });
    els.capturePhysicsRunButton.addEventListener("click", toggleRun);
    els.capturePhysicsStepButton.addEventListener("click", () => {
      stopRun();
      acquireNext();
    });
    els.capturePhysicsResetButton.addEventListener("click", () => resetExperiment());
    document.addEventListener("inverse-view-change", (event) => {
      state.active = Boolean(event.detail && event.detail.view === "capture");
      if (!state.active) stopRun();
      else renderAll();
    });
  }

  function resetExperiment(startRunning = false) {
    stopRun();
    const meta = CapturePhysicsCore.MODE_META[state.mode];
    const budget = meta.budgets[Math.min(state.budgetIndex, meta.budgets.length - 1)];
    state.experiment = CapturePhysicsCore.createExperiment({
      mode: state.mode,
      preset: state.preset,
      budget,
      noise: state.noise,
      calibration: state.calibration,
      seed: 0x63a5f19
    });
    state.result = null;
    state.usedShots = 0;
    updateControls();
    renderAll();
    if (startRunning) {
      state.running = true;
      updateRunButton();
      scheduleNext(120);
    }
  }

  function toggleRun() {
    if (state.usedShots >= state.experiment.shots.length) {
      resetExperiment(true);
      return;
    }
    state.running = !state.running;
    updateRunButton();
    if (state.running) scheduleNext(60);
    else window.clearTimeout(state.timer);
  }

  function stopRun() {
    state.running = false;
    window.clearTimeout(state.timer);
    state.timer = 0;
    updateRunButton();
  }

  function scheduleNext(delay) {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      acquireNext();
      if (state.running) scheduleNext(state.mode === "transient" ? 150 : 260);
    }, delay);
  }

  function acquireNext() {
    if (!state.experiment || state.usedShots >= state.experiment.shots.length) {
      stopRun();
      return;
    }
    state.usedShots += 1;
    state.result = CapturePhysicsCore.solveExperiment(state.experiment, state.usedShots);
    renderAll();
    if (state.usedShots >= state.experiment.shots.length) stopRun();
    else updateRunButton();
  }

  function updateControls() {
    const meta = CapturePhysicsCore.MODE_META[state.mode];
    const preset = CapturePhysicsCore.PRESETS[state.preset];
    setText(els.captureModeShort, meta.short);
    setText(els.capturePresetLabel, preset.label);
    setText(els.captureBudgetUnit, meta.budgetUnit);
    setText(els.captureNoiseValue, state.noise.toFixed(2));
    setText(els.captureCalibrationValue,
      CapturePhysicsCore.calibrationDescription(state.mode, state.calibration));
    setText(els.captureModeObserves, meta.observes);
    setText(els.captureModeBlind, meta.blind);

    document.querySelectorAll("[data-capture-mode]").forEach((button) => {
      const active = button.getAttribute("data-capture-mode") === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-capture-preset]").forEach((button) => {
      const active = button.getAttribute("data-capture-preset") === state.preset;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-capture-budget-index]").forEach((button, index) => {
      button.textContent = meta.budgets[index];
      const active = index === state.budgetIndex;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    updateRunButton();
  }

  function updateRunButton() {
    if (!els.capturePhysicsRunButton) return;
    const complete = state.experiment && state.usedShots >= state.experiment.shots.length;
    els.capturePhysicsRunButton.innerHTML = state.running
      ? '<span aria-hidden="true">&#10074;&#10074;</span> Pause capture'
      : complete
        ? '<span aria-hidden="true">&#8634;</span> Replay capture'
        : '<span aria-hidden="true">&#9658;</span> Run capture';
    els.capturePhysicsStepButton.disabled = Boolean(complete);
    const status = state.running ? "acquiring" : complete ? "capture complete" :
      state.usedShots ? "capture paused" : "ready";
    setText(els.capturePhysicsStatus, status);
  }

  function renderAll() {
    if (!state.experiment) return;
    updateShotStrip();
    updateMetrics();
    updateAuxRows();
    drawRig();
    drawMeasurements();
    drawRecovery();
    drawFisher();
    drawVisibleOutput();
  }

  // These are views of the actual compact inverse problem, not a separate reconstruction.
  // Photometric and polarization modes recover one surface sample; ToF recovers one range;
  // the HDR lane recovers the twelve radiance patches supplied to the camera response model.
  function drawVisibleOutput() {
    const canvas = els.captureOutputCanvas;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas);
    const width = canvas.width;
    const height = canvas.height;
    const scale = width / 1040;
    ctx.save();
    ctx.scale(scale, height / 400);
    const result = state.result;
    const truth = state.experiment.truth;
    const shot = state.experiment.shots[Math.max(0, state.usedShots - 1)];
    const gradient = ctx.createRadialGradient(520, 240, 40, 520, 240, 640);
    gradient.addColorStop(0, "#1d302e");
    gradient.addColorStop(1, "#090e13");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1040, 400);
    ctx.strokeStyle = "rgba(150,201,192,.14)";
    ctx.beginPath();
    ctx.moveTo(520, 32); ctx.lineTo(520, 360); ctx.stroke();
    label(ctx, "KNOWN REFERENCE", 34, 33, COLORS.rose, 12);
    label(ctx, "RECOVERED FROM CAPTURE", 554, 33, COLORS.teal, 12);
    if (state.mode === "photometric") {
      const light = shot.trueLight;
      renderNormalSample(ctx, 260, 214, truth.normal, truth.albedo, light, state.experiment.preset, true);
      if (result) renderNormalSample(ctx, 780, 214, result.recovered.normal,
        result.recovered.albedo, light, state.experiment.preset, false);
      setText(els.captureOutputTitle, "A measured normal becomes a visible surface orientation");
      setText(els.captureOutputBadge, result ? `${result.metrics.normalErrorDeg.toFixed(2)}° normal error` : "one surface sample");
      setText(els.captureOutputCaption, "The two circular samples are tilted by the true and fitted normals and shaded under the same active light. The reference includes the preset’s specular response; the fitted sample uses its recovered Lambertian normal and albedo. This is a local surface estimate, not a recovered mesh. Step through lights: one bright measurement cannot determine orientation.");
      label(ctx, `${shot.label} · ${state.usedShots ? "latest acquired light" : "first light preview"}`, 34, 376, COLORS.text, 13);
    } else if (state.mode === "polarization") {
      renderPolarizedSample(ctx, 260, 218, truth, shot.angle);
      if (result) renderPolarizedSample(ctx, 780, 218, result.recovered, shot.angle);
      setText(els.captureOutputTitle, "See the fitted analyzer response");
      setText(els.captureOutputBadge, result ? `DoLP ${result.recovered.dolp.toFixed(3)} · AoP ${(result.recovered.aop * 180 / Math.PI).toFixed(1)}°` : "polarized surface sample");
      setText(els.captureOutputCaption, "Each wedge renders this sample through a different linear-analyzer angle using I(θ) = ½ S₀ [1 + DoLP cos 2(θ − AoP)]. The inner disc shows the current analyzer image. The recovered response comes from measured intensities; an angle of polarization still leaves a normal-branch ambiguity and does not reveal depth.");
      label(ctx, `${shot.label} analyzer · identical exposure`, 34, 376, COLORS.text, 13);
    } else if (state.mode === "transient") {
      renderRangeSample(ctx, 260, truth.depth, truth.returnStrength, false);
      if (result) renderRangeSample(ctx, 780, result.recovered.depth, result.recovered.returnStrength, true);
      setText(els.captureOutputTitle, "A flight-time peak locates a surface along one ray");
      setText(els.captureOutputBadge, result ? `${result.recovered.depth.toFixed(3)} m recovered range` : "one sensor pixel");
      setText(els.captureOutputCaption, "Surface position is driven by the true or fitted range; brightness follows return strength. The wire corridor shows the same 0–5 m distance scale on both sides. The lateral footprint is fixed for display: a single transient histogram does not recover an object’s silhouette or width.");
      label(ctx, "Range and reflected return · fixed lateral footprint", 34, 376, COLORS.text, 13);
    } else {
      renderRadianceWall(ctx, 260, truth.radiances);
      if (result) renderRadianceWall(ctx, 780, result.recovered.radiances);
      setText(els.captureOutputTitle, "Recover a radiance image from clipped exposures");
      setText(els.captureOutputBadge, result ? `fit γ ${result.recovered.gamma.toFixed(3)} · 12 recovered patches` : "12 radiance patches");
      setText(els.captureOutputCaption, "Each illuminated tile is one of the twelve radiances used by the exposure-stack experiment. Both walls use the same Reinhard display transform, L/(1+L), followed by display gamma. The fitted wall uses only recovered radiances, so missing or clipped evidence remains visible; this is a patch image, not an inferred 3D scene.");
      label(ctx, "Identical display exposure · darkest → brightest patches", 34, 376, COLORS.text, 13);
    }
    if (!result) {
      ctx.strokeStyle = "rgba(112,216,197,.18)";
      ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.arc(780, 202, 97, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "Run capture or acquire a step", 673, 201, COLORS.strong, 15);
      label(ctx, "The inverse has no observations yet", 674, 227, COLORS.text, 12);
    }
    ctx.restore();
  }

  function renderNormalSample(ctx, cx, cy, normal, albedo, light, preset, reference) {
    const n = normal;
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const dot3 = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    // Orthonormal tangent frame; screen projection preserves the recovered plane tilt.
    const u = norm([n[2], 0, -n[0]]);
    const v = norm([n[1] * u[2], n[2] * u[0] - n[0] * u[2], -n[1] * u[0]]);
    const half = norm([light[0], light[1], light[2] + 1]);
    const irradiance = albedo * Math.max(0, dot3(n, light))
      + (reference ? preset.specular * Math.pow(Math.max(0, dot3(n, half)), preset.exponent) : 0);
    const encoded = Math.pow(Math.max(0, irradiance) / (0.7 + Math.max(0, irradiance)), 1 / 2.2);
    const color = [0.81, 0.94, 0.88].map((t) => Math.round(255 * encoded * t));
    const outline = (offset, radius) => {
      ctx.beginPath();
      for (let i = 0; i <= 160; i += 1) {
        const a = i / 160 * Math.PI * 2;
        const x = cx + radius * (u[0] * Math.cos(a) + v[0] * Math.sin(a));
        const y = cy - radius * (u[1] * Math.cos(a) + v[1] * Math.sin(a)) + offset;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    ctx.save();
    const shadow = ctx.createRadialGradient(cx, cy + 102, 2, cx, cy + 102, 150);
    shadow.addColorStop(0, "rgba(0,0,0,.7)"); shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow; ctx.fillRect(cx - 160, cy + 40, 320, 125);
    outline(7, 112); ctx.fillStyle = "#26352f"; ctx.fill();
    outline(0, 112); ctx.fillStyle = `rgb(${color.join(",")})`; ctx.fill();
    ctx.strokeStyle = "rgba(239,255,247,.55)"; ctx.lineWidth = 1.4; ctx.stroke();
    arrow(ctx, cx, cy, cx + n[0] * 103, cy - n[1] * 103, reference ? COLORS.rose : COLORS.teal, 3);
    dot(ctx, cx, cy, 4, COLORS.strong);
    label(ctx, `n = (${n.map((x) => x.toFixed(2)).join(", ")})`, cx - 110, 70, COLORS.text, 13);
    label(ctx, `diffuse albedo ${albedo.toFixed(3)}`, cx - 73, 336, COLORS.strong, 14);
    ctx.restore();
  }

  function renderPolarizedSample(ctx, cx, cy, sample, angle) {
    const encode = (value) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, value)), 1 / 2.2));
    for (let i = 0; i < 180; i += 1) {
      const theta = i / 180 * Math.PI;
      const value = encode(0.5 * sample.s0 * (1 + sample.dolp * Math.cos(2 * (theta - sample.aop))));
      ctx.fillStyle = `rgb(${Math.round(value * .78)},${value},${Math.round(value * .94)})`;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 115, i / 180 * Math.PI * 2, (i + 1.1) / 180 * Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }
    const current = encode(0.5 * sample.s0 * (1 + sample.dolp * Math.cos(2 * (angle - sample.aop))));
    ctx.fillStyle = `rgb(${current},${current},${current})`;
    ctx.beginPath(); ctx.arc(cx, cy, 73, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#10231f"; ctx.lineWidth = 9; ctx.stroke();
    const dx = Math.cos(angle) * 58; const dy = Math.sin(angle) * 58;
    ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
    label(ctx, `DoLP ${sample.dolp.toFixed(3)} · AoP ${(sample.aop * 180 / Math.PI).toFixed(1)}°`, cx - 104, 70, COLORS.text, 13);
    label(ctx, "analyzer sweep / current image", cx - 102, 348, COLORS.text, 12);
  }

  function renderRangeSample(ctx, cx, depth, strength, recovered) {
    const near = [[cx - 162, 134], [cx + 98, 87], [cx + 98, 286], [cx - 162, 333]];
    const project = (index, d) => {
      const f = Math.max(0, Math.min(1, d / 5));
      return [near[index][0] + 108 * f, near[index][1] - 62 * f];
    };
    ctx.strokeStyle = "rgba(150,200,195,.18)"; ctx.lineWidth = 1;
    for (let d = 0; d <= 5; d += 1) {
      ctx.beginPath();
      for (let j = 0; j < 5; j += 1) { const p = project(j % 4, d); if (j) ctx.lineTo(...p); else ctx.moveTo(...p); }
      ctx.stroke();
    }
    for (let j = 0; j < 4; j += 1) {
      ctx.beginPath(); ctx.moveTo(...project(j, 0)); ctx.lineTo(...project(j, 5)); ctx.stroke();
    }
    const value = Math.round(255 * Math.sqrt(Math.max(0, strength) / (.08 + Math.max(0, strength))));
    ctx.fillStyle = `rgba(${Math.round(value * .60)},${value},${Math.round(value * .88)},.92)`;
    ctx.beginPath();
    for (let j = 0; j < 5; j += 1) { const p = project(j % 4, depth); if (j) ctx.lineTo(...p); else ctx.moveTo(...p); }
    ctx.fill(); ctx.strokeStyle = recovered ? COLORS.teal : COLORS.rose; ctx.lineWidth = 2; ctx.stroke();
    label(ctx, `${depth.toFixed(3)} m · return ${strength.toFixed(4)}`, cx - 105, 355, COLORS.strong, 13);
    label(ctx, "0 m", cx - 166, 356, COLORS.text, 11);
    label(ctx, "5 m", cx + 175, 285, COLORS.text, 11);
  }

  function renderRadianceWall(ctx, cx, radiances) {
    const columns = 4; const size = 71; const gap = 9;
    const x0 = cx - (columns * (size + gap) - gap) * .5;
    radiances.forEach((radiance, i) => {
      const x = x0 + (i % columns) * (size + gap);
      const y = 83 + Math.floor(i / columns) * (size + gap);
      const level = Math.round(255 * Math.pow(Math.max(0, radiance) / (1 + Math.max(0, radiance)), 1 / 2.2));
      ctx.fillStyle = "#040708"; ctx.fillRect(x - 3, y + 4, size + 6, size + 5);
      ctx.fillStyle = `rgb(${level},${level},${level})`; ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = "rgba(227,241,230,.17)"; ctx.strokeRect(x + .5, y + .5, size - 1, size - 1);
      label(ctx, radiance.toFixed(3), x + 9, y + 56, level > 135 ? "#19231f" : "#d3e7df", 11);
    });
  }

  function updateShotStrip() {
    const fragment = document.createDocumentFragment();
    for (const shot of state.experiment.shots) {
      const item = document.createElement("span");
      item.className = "capture-shot";
      if (shot.index < state.usedShots) item.classList.add("acquired");
      if (shot.index === state.usedShots && state.usedShots < state.experiment.shots.length) {
        item.classList.add("current");
      }
      item.textContent = shot.label;
      item.title = measurementTitle(shot);
      fragment.appendChild(item);
    }
    els.captureShotStrip.replaceChildren(fragment);
    const progress = state.result
      ? CapturePhysicsCore.progressDescription(state.experiment, state.result)
      : state.mode === "transient"
        ? `0k / ${state.experiment.config.budget}k pulses`
        : `0 / ${state.experiment.shots.length} ${CapturePhysicsCore.MODE_META[state.mode].budgetUnit}`;
    setText(els.captureProgressLabel, progress);
  }

  function measurementTitle(shot) {
    if (state.mode === "photometric") return `${shot.label}: one calibrated light direction`;
    if (state.mode === "polarization") return `${shot.label}: analyzer orientation`;
    if (state.mode === "transient") return `${shot.label}: ${Math.round(shot.pulses)} emitted pulses`;
    return `${shot.label}: bracketed camera exposure`;
  }

  function updateMetrics() {
    if (!state.result) {
      setText(els.capturePrimaryMetric, "pending");
      setText(els.captureSecondaryMetric, "pending");
      setText(els.captureResidualMetric, "pending");
      setText(els.captureRankMetric, "0 / 3");
      setText(els.captureConditionMetric, "infinite");
      setText(els.captureAmbiguityMetric, "capture not started");
      setText(els.captureFisherBadge, "rank pending");
      setText(els.captureMeasurementBadge, "waiting for shot 1");
      setText(els.captureRecoveryBadge, "underdetermined");
      setText(els.captureRigBadge, rigBadge());
      return;
    }
    const result = state.result;
    if (state.mode === "photometric") {
      setText(els.capturePrimaryMetric, `${result.metrics.normalErrorDeg.toFixed(2)} deg normal`);
      setText(els.captureSecondaryMetric, `${result.metrics.albedoError.toFixed(4)} albedo`);
    } else if (state.mode === "polarization") {
      setText(els.capturePrimaryMetric, `${result.metrics.aopErrorDeg.toFixed(2)} deg AoP`);
      setText(els.captureSecondaryMetric, `${result.metrics.dolpError.toFixed(4)} DoLP`);
    } else if (state.mode === "transient") {
      setText(els.capturePrimaryMetric, `${(result.metrics.depthError * 100).toFixed(2)} cm depth`);
      setText(els.captureSecondaryMetric, `${result.metrics.returnError.toFixed(4)} return`);
    } else {
      setText(els.capturePrimaryMetric, `${result.metrics.gammaError.toFixed(3)} gamma`);
      setText(els.captureSecondaryMetric, `${result.metrics.hdrLogRmse.toFixed(4)} HDR log RMSE`);
    }
    setText(els.captureResidualMetric, formatCompact(result.metrics.residualRmse));
    setText(els.captureRankMetric, `${result.fisher.rank} / ${result.fisher.labels.length}`);
    setText(els.captureConditionMetric,
      Number.isFinite(result.fisher.condition) ? formatCompact(result.fisher.condition) : "infinite");
    setText(els.captureEntropyRankMetric,
      Number.isFinite(result.fisher.effectiveRank) ? result.fisher.effectiveRank.toFixed(2) : "pending");
    // Naming the null direction is the point of the audit; a rank count alone tells a reader
    // that something is unconstrained without telling them what.
    setText(els.captureInvariantMetric, result.fisher.invariant
      || (Number.isFinite(result.fisher.condition) && result.fisher.condition <= result.fisher.invariantThreshold
        ? `none - all directions constrained (condition ${formatCompact(result.fisher.condition)})`
        : "no single dominant combination"));
    setText(els.captureAmbiguityMetric, ambiguityLabel(result));
    setText(els.captureFisherBadge,
      `rank ${result.fisher.rank} / ${result.fisher.labels.length}`);
    setText(els.captureMeasurementBadge,
      `${result.usedShots} measurement${result.usedShots === 1 ? "" : "s"} fitted`);
    setText(els.captureRecoveryBadge,
      result.fisher.rank < 3 ? "locally underdetermined" : "locally constrained");
    setText(els.captureRigBadge, rigBadge());
  }

  function ambiguityLabel(result) {
    if (result.fisher.rank < 3) {
      if (state.mode === "polarization") return "incomplete Stokes basis";
      if (state.mode === "transient") return "range / flux coupling";
      if (state.mode === "ldr") return "response / radiance scale";
      return "normal / albedo subspace";
    }
    if (state.mode === "polarization") return "90 deg normal branch";
    if (state.mode === "transient") return "lateral position and shape";
    if (state.mode === "ldr") {
      return result.metrics.clippedFraction > 0.4 ? "fully clipped highlights" : "spatial response variation";
    }
    return state.preset === "ceramic" ? "absolute depth" : "unmodeled specular lobe";
  }

  function rigBadge() {
    if (state.mode === "polarization") return "rotating analyzer";
    if (state.mode === "transient") return "coaxial pulsed ToF";
    if (state.mode === "ldr") return "fixed camera, exposure stack";
    return "OLAT hemisphere";
  }

  function updateAuxRows() {
    const rows = [];
    const result = state.result;
    if (state.mode === "photometric") {
      rows.push(["Light directions", `${state.usedShots} calibrated poses`, "design matrix"]);
      rows.push(["Diffuse albedo", result ? result.recovered.albedo.toFixed(4) : "pending", "normal scale"]);
      rows.push(["Gloss residual", state.preset === "ceramic" ? "small" : "model mismatch", "bias source"]);
    } else if (state.mode === "polarization") {
      rows.push(["Stokes S0", result ? result.recovered.s0.toFixed(4) : "pending", "total intensity"]);
      rows.push(["DoLP", result ? result.recovered.dolp.toFixed(4) : "pending", "polarization strength"]);
      rows.push(["Normal branches", result ? "2 candidates" : "pending", "requires prior"]);
    } else if (state.mode === "transient") {
      rows.push(["Accumulated pulses", result ? formatCompact(result.pulses) : "0", "shot noise"]);
      rows.push(["Round-trip ToF", result ? `${result.recovered.tof.toFixed(3)} ns` : "pending", "metric depth"]);
      rows.push(["Ambient return", result ? formatCompact(result.recovered.ambient) : "pending", "background subtraction"]);
    } else {
      const clipped = result ? `${Math.round(result.metrics.clippedFraction * 100)}%` : "pending";
      rows.push(["Response gamma", result ? result.recovered.gamma.toFixed(3) : "pending", "linearization"]);
      rows.push(["Exposure metadata", `${state.experiment.config.budget} brackets`, "radiance scale"]);
      rows.push(["Clipped samples", clipped, "missing highlight data"]);
    }
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement("tr");
      for (const value of row) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      fragment.appendChild(tr);
    }
    els.captureAuxRows.replaceChildren(fragment);
  }

  function drawRig() {
    const ctx = prepareCanvas(els.captureRigCanvas);
    drawGrid(ctx, els.captureRigCanvas.width, els.captureRigCanvas.height, 32);
    if (state.mode === "polarization") drawPolarizationRig(ctx);
    else if (state.mode === "transient") drawTransientRig(ctx);
    else if (state.mode === "ldr") drawLdrRig(ctx);
    else drawPhotometricRig(ctx);
  }

  function drawPhotometricRig(ctx) {
    const cx = 270;
    const cy = 178;
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 186, 112, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const shots = state.experiment.shots;
    for (const shot of shots) {
      const x = cx + shot.trueLight[0] * 178;
      const y = cy - shot.trueLight[1] * 105 - shot.trueLight[2] * 35;
      const acquired = shot.index < state.usedShots;
      const current = shot.index === Math.min(state.usedShots, shots.length - 1);
      ctx.strokeStyle = acquired ? "rgba(112,216,197,0.22)" : "rgba(255,255,255,0.055)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      dot(ctx, x, y, current ? 7 : 4, acquired ? COLORS.teal : "#4b5756");
      if (current) ring(ctx, x, y, 11, COLORS.gold);
    }

    drawShadedDisc(ctx, cx, cy, 58, state.preset);
    label(ctx, "surface sample", cx - 47, cy + 86, COLORS.text, 12);
    arrow(ctx, cx, cy, cx + state.experiment.truth.normal[0] * 72,
      cy - state.experiment.truth.normal[1] * 72, COLORS.rose, 2);
    label(ctx, "true n", cx + 50, cy - 42, COLORS.rose, 11);
    if (state.result) {
      const normal = state.result.recovered.normal;
      arrow(ctx, cx, cy, cx + normal[0] * 72, cy - normal[1] * 72, COLORS.gold, 3);
      label(ctx, "fit n", cx + 52, cy - 24, COLORS.gold, 11);
    }
    cameraGlyph(ctx, 463, 176, -1);
    label(ctx, "fixed camera", 420, 222, COLORS.text, 11);
    label(ctx, "one emitter active per image", 20, 28, COLORS.strong, 13);
  }

  function drawPolarizationRig(ctx) {
    const cx = 244;
    const cy = 174;
    drawShadedDisc(ctx, cx - 105, cy, 48, state.preset);
    arrow(ctx, 190, cy, 218, cy, COLORS.teal, 2);
    label(ctx, "reflected Stokes vector", 74, 252, COLORS.text, 11);

    ctx.save();
    ctx.strokeStyle = "#6d7a78";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const shotIndex = Math.max(0, Math.min(state.usedShots, state.experiment.shots.length) - 1);
    const shot = state.experiment.shots[shotIndex];
    const angle = shot ? shot.assumedAngle : 0;
    const dx = Math.cos(angle) * 47;
    const dy = Math.sin(angle) * 47;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
    label(ctx, shot ? `analyzer ${shot.label}` : "analyzer 0 deg", 187, 254, COLORS.gold, 12);

    arrow(ctx, 307, cy, 350, cy, COLORS.teal, 2);
    cameraGlyph(ctx, 421, cy, -1);
    label(ctx, "intensity camera", 376, 245, COLORS.text, 11);
    ctx.strokeStyle = COLORS.rose;
    ctx.lineWidth = 2;
    const aop = state.experiment.truth.aop;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(aop) * 36, cy - Math.sin(aop) * 36);
    ctx.lineTo(cx + Math.cos(aop) * 36, cy + Math.sin(aop) * 36);
    ctx.stroke();
    label(ctx, "AoP", cx + 48, cy - 48, COLORS.rose, 11);
    label(ctx, "sequential linear-analyzer images", 20, 28, COLORS.strong, 13);
  }

  function drawTransientRig(ctx) {
    const emitter = { x: 74, y: 142 };
    const sensor = { x: 74, y: 220 };
    const target = { x: 422, y: 181 };
    ctx.strokeStyle = "rgba(112,216,197,0.16)";
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(emitter.x, emitter.y);
    ctx.lineTo(target.x, target.y);
    ctx.lineTo(sensor.x, sensor.y);
    ctx.stroke();
    ctx.setLineDash([]);

    emitterGlyph(ctx, emitter.x, emitter.y);
    cameraGlyph(ctx, sensor.x, sensor.y, 1);
    drawShadedDisc(ctx, target.x, target.y, 48, state.preset);
    label(ctx, "pulsed emitter", 25, 101, COLORS.text, 11);
    label(ctx, "time-tagging detector", 20, 270, COLORS.text, 11);
    label(ctx, `target ${state.experiment.truth.depth.toFixed(2)} m`, 372, 255, COLORS.text, 11);

    if (state.usedShots) {
      const phase = state.usedShots / state.experiment.shots.length;
      const outbound = phase < 0.5;
      const local = outbound ? phase * 2 : (phase - 0.5) * 2;
      const from = outbound ? emitter : target;
      const to = outbound ? target : sensor;
      const x = from.x + (to.x - from.x) * local;
      const y = from.y + (to.y - from.y) * local;
      dot(ctx, x, y, 7, COLORS.gold);
      ring(ctx, x, y, 13, "rgba(239,187,98,0.5)");
    }
    label(ctx, "emit -> reflect -> time-tag", 20, 28, COLORS.strong, 13);
    label(ctx, "arrival time, not RGB brightness, carries range", 20, 305, COLORS.teal, 11);
  }

  function drawLdrRig(ctx) {
    const shots = state.experiment.shots;
    const shown = Math.min(5, shots.length);
    const startX = 24;
    const width = 84;
    for (let index = 0; index < shown; index += 1) {
      const shot = shots[index];
      const x = startX + index * 96;
      const acquired = index < state.usedShots;
      ctx.fillStyle = acquired ? "#19282a" : "#151a1e";
      ctx.strokeStyle = acquired ? COLORS.teal : "#34403f";
      ctx.lineWidth = acquired ? 2 : 1;
      ctx.fillRect(x, 76, width, 154);
      ctx.strokeRect(x + 0.5, 76.5, width - 1, 153);
      const values = shot.values;
      for (let patch = 0; patch < 6; patch += 1) {
        const value = Math.round(values[patch * 2] * 255);
        ctx.fillStyle = `rgb(${value},${Math.min(255, value + 8)},${Math.min(255, value + 5)})`;
        ctx.fillRect(x + 12, 94 + patch * 20, 60, 14);
      }
      label(ctx, shot.label, x + 14, 253, acquired ? COLORS.strong : COLORS.text, 11);
    }
    label(ctx, "same camera pose, bracketed shutter", 20, 28, COLORS.strong, 13);
    label(ctx, "dark frames protect highlights; bright frames reveal shadows", 20, 301, COLORS.teal, 11);
  }

  function drawMeasurements() {
    const ctx = prepareCanvas(els.captureMeasurementCanvas);
    drawGrid(ctx, els.captureMeasurementCanvas.width, els.captureMeasurementCanvas.height, 32);
    if (!state.result) {
      drawEmptyState(ctx, "Acquire a measurement", "Raw samples and the forward-model fit appear here.");
      return;
    }
    if (state.mode === "transient") drawTransientMeasurements(ctx);
    else if (state.mode === "ldr") drawLdrMeasurements(ctx);
    else drawAngularMeasurements(ctx);
  }

  function drawAngularMeasurements(ctx) {
    const result = state.result;
    const values = result.values;
    const predicted = result.predicted;
    const yMax = Math.max(0.15, ...values, ...predicted) * 1.14;
    const bounds = { x: 50, y: 48, width: 440, height: 210 };
    drawAxes(ctx, bounds, 0, yMax,
      state.mode === "polarization" ? "analyzer angle" : "light index", "intensity");
    plotLine(ctx, predicted, bounds, 0, yMax, COLORS.gold, 2);
    plotDots(ctx, values, bounds, 0, yMax, COLORS.teal, 5);

    if (state.mode === "polarization" && values.length > 1) {
      for (let index = 0; index < values.length; index += 1) {
        const x = bounds.x + index / Math.max(1, values.length - 1) * bounds.width;
        label(ctx, result.shots[index].label.replace(" deg", ""), x - 8, bounds.y + bounds.height + 18,
          COLORS.text, 9);
      }
    }
    legend(ctx, 334, 26, [[COLORS.teal, "measured"], [COLORS.gold, "forward fit"]]);
    label(ctx, state.mode === "photometric" ? "I_k = rho max(0, n dot l_k)" :
      "I(a) = 0.5 [S0 + S1 cos(2a) + S2 sin(2a)]", 50, 298, COLORS.text, 11);
  }

  function drawTransientMeasurements(ctx) {
    const result = state.result;
    const values = result.values;
    const predicted = result.predicted;
    const yMax = Math.max(1, ...values, ...predicted) * 1.1;
    const bounds = { x: 48, y: 44, width: 442, height: 220 };
    drawAxes(ctx, bounds, 0, yMax, "arrival time (0 to 32 ns)", "photon counts");
    plotLine(ctx, values, bounds, 0, yMax, COLORS.teal, 2);
    plotLine(ctx, predicted, bounds, 0, yMax, COLORS.gold, 2);
    const peakX = bounds.x + result.recovered.peak / (values.length - 1) * bounds.width;
    ctx.strokeStyle = COLORS.rose;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(peakX, bounds.y);
    ctx.lineTo(peakX, bounds.y + bounds.height);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, `${result.recovered.tof.toFixed(2)} ns`, Math.min(peakX + 7, 445), bounds.y + 18,
      COLORS.rose, 11);
    legend(ctx, 323, 24, [[COLORS.teal, "histogram"], [COLORS.gold, "IRF fit"]]);
  }

  function drawLdrMeasurements(ctx) {
    const result = state.result;
    const columns = result.truth.radiances.length;
    const rows = result.shots.length;
    const x0 = 46;
    const y0 = 52;
    const cellW = 350 / columns;
    const cellH = Math.min(30, 126 / Math.max(1, rows));
    label(ctx, "observed LDR stack", x0, 28, COLORS.strong, 12);
    for (let row = 0; row < rows; row += 1) {
      const shot = result.shots[row];
      label(ctx, shot.label, 8, y0 + row * cellH + cellH * 0.72, COLORS.text, 9);
      for (let column = 0; column < columns; column += 1) {
        const value = Math.round(shot.values[column] * 255);
        ctx.fillStyle = `rgb(${value},${Math.min(255, value + 8)},${Math.min(255, value + 5)})`;
        ctx.fillRect(x0 + column * cellW, y0 + row * cellH, cellW - 1, cellH - 1);
      }
    }

    const chart = { x: 46, y: 205, width: 438, height: 78 };
    const truth = result.truth.radiances.map((value) => Math.log1p(value));
    const recovered = result.recovered.radiances.map((value) => Math.log1p(value));
    const maxValue = Math.max(0.1, ...truth, ...recovered);
    drawAxes(ctx, chart, 0, maxValue, "radiance patch, log scale", "HDR");
    plotLine(ctx, truth, chart, 0, maxValue, COLORS.rose, 2);
    plotDots(ctx, recovered, chart, 0, maxValue, COLORS.teal, 4);
    label(ctx, `fit gamma ${result.recovered.gamma.toFixed(3)}`, 392, 178, COLORS.gold, 11);
    legend(ctx, 320, 24, [[COLORS.rose, "truth"], [COLORS.teal, "recovered"]]);
  }

  function drawAxes(ctx, bounds, minimum, maximum, xLabel, yLabel) {
    ctx.strokeStyle = "rgba(225,238,233,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bounds.x, bounds.y);
    ctx.lineTo(bounds.x, bounds.y + bounds.height);
    ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    ctx.stroke();
    for (let index = 0; index <= 4; index += 1) {
      const y = bounds.y + bounds.height * index / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(bounds.x, y);
      ctx.lineTo(bounds.x + bounds.width, y);
      ctx.stroke();
      const value = maximum - (maximum - minimum) * index / 4;
      label(ctx, formatCompact(value), 5, y + 3, COLORS.text, 9);
    }
    label(ctx, xLabel, bounds.x + bounds.width - ctx.measureText(xLabel).width, bounds.y + bounds.height + 28,
      COLORS.text, 10);
    label(ctx, yLabel, bounds.x + 5, bounds.y + 14, COLORS.text, 10);
  }

  function drawRecovery() {
    const ctx = prepareCanvas(els.captureRecoveryCanvas);
    drawGrid(ctx, els.captureRecoveryCanvas.width, els.captureRecoveryCanvas.height, 32);
    if (!state.result) {
      drawEmptyState(ctx, "No inverse estimate yet", "The first sample may still leave a family of valid solutions.");
      return;
    }
    if (state.mode === "polarization") drawPolarizationRecovery(ctx);
    else if (state.mode === "transient") drawTransientRecovery(ctx);
    else if (state.mode === "ldr") drawLdrRecovery(ctx);
    else drawPhotometricRecovery(ctx);
  }

  function drawPhotometricRecovery(ctx) {
    const result = state.result;
    const centers = [160, 366];
    const normals = [result.truth.normal, result.recovered.normal];
    const titles = ["target normal", "recovered normal"];
    for (let index = 0; index < 2; index += 1) {
      const cx = centers[index];
      const cy = 161;
      ctx.fillStyle = "#11191d";
      ctx.strokeStyle = "#33413f";
      ctx.beginPath();
      ctx.arc(cx, cy, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 72, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, 72, 0, 0, Math.PI * 2);
      ctx.stroke();
      const normal = normals[index];
      arrow(ctx, cx, cy, cx + normal[0] * 61, cy - normal[1] * 61,
        index ? COLORS.gold : COLORS.rose, 3);
      dot(ctx, cx + normal[0] * 61, cy - normal[1] * 61, 5,
        index ? COLORS.gold : COLORS.rose);
      label(ctx, titles[index], cx - 47, 264, index ? COLORS.gold : COLORS.rose, 11);
    }
    label(ctx, `${result.metrics.normalErrorDeg.toFixed(2)} deg separation`, 199, 36, COLORS.strong, 13);
    label(ctx, `rho true ${result.truth.albedo.toFixed(3)} / fit ${result.recovered.albedo.toFixed(3)}`,
      161, 298, COLORS.text, 11);
    if (state.preset !== "ceramic") {
      label(ctx, "Lambertian inverse model cannot explain the preset's full gloss lobe",
        72, 318, COLORS.rose, 10);
    }
  }

  function drawPolarizationRecovery(ctx) {
    const result = state.result;
    const cx = 151;
    const cy = 163;
    const radius = 78;
    ctx.strokeStyle = "#42504e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();
    const s1 = result.recovered.s1 / Math.max(1e-8, result.recovered.s0);
    const s2 = result.recovered.s2 / Math.max(1e-8, result.recovered.s0);
    arrow(ctx, cx, cy, cx + s1 * radius, cy - s2 * radius, COLORS.teal, 3);
    label(ctx, "normalized Stokes plane", 86, 278, COLORS.text, 11);

    const bx = 360;
    const by = 162;
    ctx.strokeStyle = "#42504e";
    ctx.beginPath();
    ctx.arc(bx, by, 78, 0, Math.PI * 2);
    ctx.stroke();
    for (let index = 0; index < 2; index += 1) {
      const angle = result.recovered.azimuthBranches[index];
      const color = index ? COLORS.violet : COLORS.gold;
      arrow(ctx, bx, by, bx + Math.cos(angle) * 67, by - Math.sin(angle) * 67, color, 3);
      label(ctx, `branch ${index + 1}`, bx - 31, 278 + index * 17, color, 11);
    }
    label(ctx, `AoP ${angleDegrees(result.recovered.aop).toFixed(1)} deg`, 312, 45, COLORS.strong, 12);
    label(ctx, `DoLP ${result.recovered.dolp.toFixed(3)}`, 312, 63, COLORS.teal, 11);
    label(ctx, "polarization fixes an axis, not an oriented normal", 133, 318, COLORS.rose, 10);
  }

  function drawTransientRecovery(ctx) {
    const result = state.result;
    const left = 62;
    const right = 465;
    const y = 152;
    const maximumDepth = 5;
    ctx.strokeStyle = "#52615e";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    for (let meter = 0; meter <= maximumDepth; meter += 1) {
      const x = left + meter / maximumDepth * (right - left);
      ctx.strokeStyle = "#52615e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
      label(ctx, `${meter} m`, x - 9, y + 27, COLORS.text, 9);
    }
    const trueX = left + result.truth.depth / maximumDepth * (right - left);
    const fitX = left + result.recovered.depth / maximumDepth * (right - left);
    ctx.strokeStyle = COLORS.rose;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(trueX, y - 48);
    ctx.lineTo(trueX, y + 48);
    ctx.stroke();
    dot(ctx, fitX, y, 9, COLORS.gold);
    ring(ctx, fitX, y, 15, COLORS.gold);
    label(ctx, "truth", trueX - 14, y - 58, COLORS.rose, 10);
    label(ctx, "ToF estimate", fitX - 31, y + 64, COLORS.gold, 10);
    label(ctx, `${result.recovered.depth.toFixed(3)} m recovered depth`, 166, 46, COLORS.strong, 14);
    label(ctx, `${Math.round(result.pulses)} pulses accumulated`, 182, 79, COLORS.teal, 11);
    label(ctx, "a single return supplies range, not the target silhouette", 126, 292, COLORS.rose, 10);
  }

  function drawLdrRecovery(ctx) {
    const result = state.result;
    const truth = result.truth.radiances;
    const recovered = result.recovered.radiances;
    const x0 = 42;
    const width = 35;
    label(ctx, "linear HDR radiance", x0, 30, COLORS.strong, 12);
    label(ctx, "truth", 4, 93, COLORS.rose, 10);
    label(ctx, "fit", 12, 137, COLORS.teal, 10);
    for (let index = 0; index < truth.length; index += 1) {
      const truthValue = toneMap(truth[index]);
      const fitValue = toneMap(recovered[index]);
      ctx.fillStyle = grayColor(truthValue);
      ctx.fillRect(x0 + index * width, 66, width - 3, 35);
      ctx.fillStyle = grayColor(fitValue);
      ctx.fillRect(x0 + index * width, 110, width - 3, 35);
    }

    const chart = { x: 58, y: 187, width: 410, height: 91 };
    ctx.strokeStyle = "#52615e";
    ctx.beginPath();
    ctx.moveTo(chart.x, chart.y + chart.height);
    ctx.lineTo(chart.x + chart.width, chart.y + chart.height);
    ctx.lineTo(chart.x + chart.width, chart.y);
    ctx.stroke();
    ctx.strokeStyle = COLORS.rose;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sample = 0; sample <= 80; sample += 1) {
      const x = sample / 80;
      const px = chart.x + x * chart.width;
      const y = Math.pow(x, 1 / result.truth.gamma);
      const py = chart.y + chart.height - y * chart.height;
      if (!sample) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.teal;
    ctx.beginPath();
    for (let sample = 0; sample <= 80; sample += 1) {
      const x = sample / 80;
      const px = chart.x + x * chart.width;
      const y = Math.pow(x, 1 / result.recovered.gamma);
      const py = chart.y + chart.height - y * chart.height;
      if (!sample) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    label(ctx, "linear exposure", 377, 299, COLORS.text, 10);
    label(ctx, "encoded value", 62, 201, COLORS.text, 10);
    legend(ctx, 326, 168, [[COLORS.rose, "true CRF"], [COLORS.teal, "fit CRF"]]);
  }

  function toneMap(value) {
    return Math.pow(Math.max(0, value) / (1 + Math.max(0, value)), 1 / 2.2);
  }

  function grayColor(value) {
    const channel = Math.round(Math.max(0, Math.min(1, value)) * 255);
    return `rgb(${channel},${channel},${Math.min(255, channel + 4)})`;
  }

  function drawFisher() {
    const canvas = els.captureFisherCanvas;
    const ctx = prepareCanvas(canvas);
    drawGrid(ctx, canvas.width, canvas.height, 32);
    if (!state.result) {
      drawEmptyState(ctx, "Fisher information pending",
        "Acquire samples to reveal parameter correlation, rank, and conditioning.");
      return;
    }
    const fisher = state.result.fisher;
    const cell = 54;
    const x0 = 62;
    const y0 = 62;
    label(ctx, "normalized parameter correlation", 24, 25, COLORS.strong, 12);
    for (let row = 0; row < fisher.labels.length; row += 1) {
      for (let column = 0; column < fisher.labels.length; column += 1) {
        const value = Math.max(-1, Math.min(1, fisher.correlation[row][column]));
        ctx.fillStyle = correlationColor(value);
        ctx.fillRect(x0 + column * cell, y0 + row * cell, cell - 3, cell - 3);
        label(ctx, value.toFixed(2), x0 + column * cell + 11, y0 + row * cell + 31,
          Math.abs(value) > 0.55 ? "#07110f" : COLORS.strong, 10);
      }
      label(ctx, shorten(fisher.labels[row], 12), 3, y0 + row * cell + 31, COLORS.text, 9);
      label(ctx, shorten(fisher.labels[row], 9), x0 + row * cell + 2, y0 - 12, COLORS.text, 9);
    }

    const spectrumX = 292;
    const spectrumY = 58;
    const spectrumWidth = 284;
    label(ctx, "eigenvalue spectrum", spectrumX, 25, COLORS.strong, 12);
    const maxEigen = Math.max(1e-12, fisher.eigenvalues[0] || 0);
    for (let index = 0; index < fisher.eigenvalues.length; index += 1) {
      const value = fisher.eigenvalues[index];
      const ratio = value / maxEigen;
      const width = Math.max(2, spectrumWidth * Math.max(0, Math.min(1,
        (Math.log10(Math.max(1e-8, ratio)) + 8) / 8)));
      const y = spectrumY + index * 46;
      ctx.fillStyle = ratio > 1e-5 ? COLORS.teal : COLORS.rose;
      ctx.fillRect(spectrumX, y, width, 16);
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.strokeRect(spectrumX + 0.5, y + 0.5, spectrumWidth - 1, 15);
      label(ctx, `eig ${index + 1}`, spectrumX, y + 34, COLORS.text, 9);
      label(ctx, ratio >= 0.001 ? ratio.toFixed(3) : ratio.toExponential(1),
        spectrumX + spectrumWidth - 52, y + 34, ratio > 1e-5 ? COLORS.teal : COLORS.rose, 9);
    }
    const sigmaY = 216;
    label(ctx, "Cramer-Rao local sigma", spectrumX, sigmaY, COLORS.strong, 10);
    for (let index = 0; index < fisher.sigma.length; index += 1) {
      const value = fisher.sigma[index];
      label(ctx, `${shorten(fisher.labels[index], 9)} ${formatCompact(value)}`,
        spectrumX + (index % 2) * 142, sigmaY + 20 + Math.floor(index / 2) * 18,
        COLORS.text, 9);
    }
    ctx.strokeStyle = COLORS.rose;
    ctx.setLineDash([3, 4]);
    const thresholdX = spectrumX + spectrumWidth * 3 / 8;
    ctx.beginPath();
    ctx.moveTo(thresholdX, spectrumY - 8);
    ctx.lineTo(thresholdX, spectrumY + 124);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "rank threshold 1e-5", thresholdX - 38, 201, COLORS.rose, 9);
  }

  function correlationColor(value) {
    const amount = Math.abs(value);
    if (value >= 0) return `rgba(112,216,197,${0.12 + amount * 0.78})`;
    return `rgba(238,126,145,${0.12 + amount * 0.78})`;
  }

  function shorten(value, length) {
    return value.length > length ? `${value.slice(0, length - 1)}.` : value;
  }

  function prepareCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    return ctx;
  }

  function drawGrid(ctx, width, height, spacing) {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = spacing + 0.5; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = spacing + 0.5; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEmptyState(ctx, title, copy) {
    ctx.fillStyle = "#131b20";
    ctx.strokeStyle = "#34413f";
    ctx.lineWidth = 1;
    ctx.fillRect(65, 93, 390, 132);
    ctx.strokeRect(65.5, 93.5, 389, 131);
    label(ctx, title, 94, 144, COLORS.strong, 16);
    wrapText(ctx, copy, 94, 174, 330, 17, COLORS.text, 11);
  }

  function drawShadedDisc(ctx, x, y, radius, presetKey) {
    const preset = CapturePhysicsCore.PRESETS[presetKey];
    const gradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.42,
      radius * 0.08, x, y, radius);
    if (presetKey === "conductor") {
      gradient.addColorStop(0, "#fff2c1");
      gradient.addColorStop(0.18, "#bba56b");
      gradient.addColorStop(0.62, "#5e655f");
      gradient.addColorStop(1, "#161d1d");
    } else if (presetKey === "glossy") {
      gradient.addColorStop(0, "#eefeff");
      gradient.addColorStop(0.16, "#70cfc7");
      gradient.addColorStop(0.7, "#2e5c5b");
      gradient.addColorStop(1, "#101718");
    } else {
      gradient.addColorStop(0, "#e4fff4");
      gradient.addColorStop(0.42, "#79b9a7");
      gradient.addColorStop(1, "#1a2a29");
    }
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = preset.specular > 0.1 ? COLORS.gold : "#77b4a7";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function arrow(ctx, x0, y0, x1, y1, color, width) {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(angle - 0.5) * 9, y1 - Math.sin(angle - 0.5) * 9);
    ctx.lineTo(x1 - Math.cos(angle + 0.5) * 9, y1 - Math.sin(angle + 0.5) * 9);
    ctx.closePath();
    ctx.fill();
  }

  function dot(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function ring(ctx, x, y, radius, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function label(ctx, value, x, y, color, size) {
    ctx.fillStyle = color;
    ctx.font = `${size}px Inter, Segoe UI, sans-serif`;
    ctx.fillText(value, x, y);
  }

  function cameraGlyph(ctx, x, y, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = "#273330";
    ctx.strokeStyle = "#7d8e89";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-25, -18, 43, 36);
    ctx.strokeRect(-25, -18, 43, 36);
    ctx.beginPath();
    ctx.moveTo(18, -12);
    ctx.lineTo(34, -20);
    ctx.lineTo(34, 20);
    ctx.lineTo(18, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function emitterGlyph(ctx, x, y) {
    ctx.fillStyle = "#252d2c";
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.fillRect(x - 24, y - 17, 39, 34);
    ctx.strokeRect(x - 24, y - 17, 39, 34);
    ctx.beginPath();
    ctx.moveTo(x + 15, y - 11);
    ctx.lineTo(x + 31, y - 7);
    ctx.lineTo(x + 31, y + 7);
    ctx.lineTo(x + 15, y + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let index = 0; index < 3; index += 1) {
      ctx.strokeStyle = `rgba(239,187,98,${0.72 - index * 0.2})`;
      ctx.beginPath();
      ctx.arc(x + 34, y, 10 + index * 8, -0.55, 0.55);
      ctx.stroke();
    }
  }

  function plotLine(ctx, values, bounds, minimum, maximum, color, width) {
    if (!values.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let index = 0; index < values.length; index += 1) {
      const x = bounds.x + index / Math.max(1, values.length - 1) * bounds.width;
      const normalized = (values[index] - minimum) / Math.max(1e-9, maximum - minimum);
      const y = bounds.y + bounds.height - Math.max(0, Math.min(1, normalized)) * bounds.height;
      if (!index) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function plotDots(ctx, values, bounds, minimum, maximum, color, radius) {
    for (let index = 0; index < values.length; index += 1) {
      const x = bounds.x + index / Math.max(1, values.length - 1) * bounds.width;
      const normalized = (values[index] - minimum) / Math.max(1e-9, maximum - minimum);
      const y = bounds.y + bounds.height - Math.max(0, Math.min(1, normalized)) * bounds.height;
      dot(ctx, x, y, radius, color);
      ring(ctx, x, y, radius + 2, "rgba(7,17,15,0.8)");
    }
  }

  function legend(ctx, x, y, entries) {
    let offset = 0;
    for (const entry of entries) {
      ctx.strokeStyle = entry[0];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset + 15, y);
      ctx.stroke();
      label(ctx, entry[1], x + offset + 20, y + 4, COLORS.text, 9);
      offset += 20 + ctx.measureText(entry[1]).width + 15;
    }
  }

  function wrapText(ctx, value, x, y, width, lineHeight, color, size) {
    ctx.fillStyle = color;
    ctx.font = `${size}px Inter, Segoe UI, sans-serif`;
    const words = value.split(" ");
    let line = "";
    let lineY = y;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > width && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = candidate;
      }
    }
    if (line) ctx.fillText(line, x, lineY);
  }

  function angleDegrees(angle) {
    let degrees = angle * 180 / Math.PI;
    while (degrees < 0) degrees += 180;
    while (degrees >= 180) degrees -= 180;
    return degrees;
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function formatCompact(value) {
    if (!Number.isFinite(value)) return "infinite";
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
      return value.toExponential(2);
    }
    return value.toFixed(value >= 10 ? 1 : 4);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
