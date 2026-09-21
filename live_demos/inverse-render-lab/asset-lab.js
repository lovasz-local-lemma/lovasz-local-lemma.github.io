(function initAssetLab() {
  "use strict";

  const core = window.AssetInverseCore;
  if (!core) return;

  const state = {
    model: "glint",
    shape: "superellipse",
    viewCount: 12,
    scope: "joint",
    workResolution: 14,
    stepsPerDispatch: 2,
    viewAngle: 0.38,
    activeTab: "solve",
    running: false,
    initializing: true,
    stopReason: null,
    worker: null,
    localSolver: null,
    inFlight: false,
    snapshot: null,
    lastRender: 0,
    renderPending: false,
    previewWorker: null,
    previewInFlight: false,
    previewQueued: null,
    previewId: 0,
    previewScene: 0,
    previewHasImage: false
  };

  const elements = {};
  const elementIds = [
    "assetRunButton", "assetStepButton", "assetResetButton", "assetStatusBadge",
    "assetViewAngle", "assetViewAngleValue", "assetTargetCanvas", "assetCurrentCanvas",
    "assetResidualCanvas", "assetLossCanvas", "assetCaptureCanvas", "assetIdentifiabilityCanvas",
    "assetBsdfCanvas", "assetParameterBars", "assetLossMetric", "assetIterationMetric",
    "assetGeometryMetric", "assetMaterialMetric", "assetLightingMetric", "assetMicroMetric",
    "assetEvidenceBadge", "assetBackendBadge", "assetScopeBadge", "assetDisplayBadge",
    "assetModelTitle", "assetModelCopy", "assetClaimBoundary", "assetMapGeometry",
    "assetMapAlbedo", "assetMapNormal", "assetMapDisplacement", "assetMapRoughness",
    "assetMapMicrostructure", "assetMapGeometryBadge", "assetMapAlbedoBadge",
    "assetMapNormalBadge", "assetMapDisplacementBadge", "assetMapRoughnessBadge",
    "assetMapMicrostructureBadge", "assetAblationCanvas", "assetFactorizationBadge", "assetShapeNote"
  ];

  const MODEL_COPY = {
    ggx: {
      title: "Continuous microfacet factorization",
      copy: "A differentiable GGX closure jointly fits shape, UV-space appearance, roughness, metalness, and an unknown environment-light direction.",
      claim: "Controlled soft-raster object and direct environment lighting; no global illumination, cast shadows, or transmission."
    },
    glint: {
      title: "Discrete stochastic microfacets",
      copy: "Tiny deterministic facets create sparse, view-dependent highlights. A smooth GGX lobe cannot explain them, so the inverse model also recovers microfacet occupancy strength.",
      claim: "P-NDF-inspired finite facet hierarchy, not the full Yan et al. 4D Gaussian hierarchy or a production path tracer."
    },
    granular: {
      title: "Grain-to-bulk aggregate transport",
      copy: "The target combines explicit grain variation, retroreflection, and a broad multiple-scattering pedestal while fitting the visible asset factors.",
      claim: "A controlled multiscale aggregate closure. Granular matter is not reduced to a conventional surface BSDF."
    },
    aniso: {
      title: "Brushed anisotropy and a branch no audit can see",
      copy: "An anisotropic GGX lobe stretches the highlight along a tangent direction. Two exact symmetries follow: the tangent enters through its axis, so flipping it by 180 degrees leaves the image untouched, and swapping the two roughnesses while rotating the frame 90 degrees is the same material.",
      claim: "Anisotropic GGX with the lab's isotropic Smith visibility and approximate energy compensation. The stretched distribution is explicit; masking is not a full anisotropic Smith model. Both frame symmetries are exact, so local sensitivity cannot distinguish the equivalent branches."
    }
  };

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    const panel = document.querySelector('[data-view-panel="asset"]');
    if (!panel) return;
    for (const id of elementIds) elements[id] = document.getElementById(id);
    if (typeof Worker !== "undefined") {
      state.previewWorker = new Worker("asset-preview-worker.js?v=asset-11");
      state.previewWorker.onmessage = (event) => {
        const result = event.data;
        state.previewInFlight = false;
        if (result.scene === state.previewScene) {
          presentPreview(result.reference, result.current, result.width, result.height, result.sampleGrid);
          state.previewHasImage = true;
        }
        if (state.previewQueued) {
          const queued = state.previewQueued;
          state.previewQueued = null;
          dispatchPreview(queued);
        } else if (!state.running && result.sampleGrid === 1) {
          scheduleRender(true);
        }
      };
      state.previewWorker.onerror = () => {
        state.previewWorker?.terminate(); state.previewWorker = null;
        state.previewInFlight = false; state.previewQueued = null;
        scheduleRender(true);
      };
    }
    bindControls();
    resetSolver();
    requestAnimationFrame(frame);
  }

  function bindControls() {
    document.querySelectorAll("[data-asset-shape]").forEach((button) => {
      button.addEventListener("click", () => {
        state.shape = button.dataset.assetShape;
        if (core.SHAPE_META[state.shape]?.detailed) state.model = "ggx";
        resetSolver();
      });
    });
    document.querySelectorAll("[data-asset-model]").forEach((button) => {
      button.addEventListener("click", () => {
        state.model = button.dataset.assetModel;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-asset-views]").forEach((button) => {
      button.addEventListener("click", () => {
        state.viewCount = Number(button.dataset.assetViews) || 12;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-asset-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        state.scope = button.dataset.assetScope;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-asset-resolution]").forEach((button) => {
      button.addEventListener("click", () => {
        state.workResolution = Number(button.dataset.assetResolution) || 14;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-asset-tab]").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.assetTab));
    });
    elements.assetRunButton?.addEventListener("click", () => {
      state.running = !state.running;
      updateRunButton();
      if (state.running) state.stopReason = null;
      if (state.running) requestStep();
      else scheduleRender(true);
    });
    elements.assetStepButton?.addEventListener("click", () => {
      state.stopReason = null;
      requestStep();
    });
    elements.assetResetButton?.addEventListener("click", resetSolver);
    elements.assetViewAngle?.addEventListener("input", () => {
      state.viewAngle = Number(elements.assetViewAngle.value) * Math.PI / 180;
      state.previewScene += 1;
      state.previewHasImage = false;
      if (elements.assetViewAngleValue) elements.assetViewAngleValue.textContent = `${Math.round(Number(elements.assetViewAngle.value))} deg`;
      scheduleRender(true);
    });
    document.addEventListener("inverse-view-change", (event) => {
      if (event.detail?.view === "asset") scheduleRender(true);
    });
  }

  function setTab(tab) {
    state.activeTab = ["solve", "maps", "audit"].includes(tab) ? tab : "solve";
    document.querySelectorAll("[data-asset-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.assetTab === state.activeTab);
    });
    document.querySelectorAll("[data-asset-tab-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.assetTabPanel === state.activeTab);
    });
    scheduleRender(true);
  }

  function resetSolver() {
    state.previewScene += 1;
    state.previewHasImage = false;
    state.previewQueued = null;
    state.running = false;
    state.initializing = true;
    state.stopReason = null;
    state.inFlight = false;
    state.snapshot = null;
    if (state.worker) state.worker.terminate();
    state.worker = null;
    state.localSolver = null;
    const options = {
      model: state.model,
      shape: state.shape,
      viewCount: state.viewCount,
      scope: state.scope,
      workResolution: state.workResolution
    };
    if (typeof Worker !== "undefined") {
      state.worker = new Worker("asset-worker.js?v=asset-11");
      state.worker.onmessage = (event) => {
        state.inFlight = false;
        if (event.data?.type === "snapshot") {
          state.snapshot = event.data.snapshot;
          state.initializing = false;
          updateReadouts();
          scheduleRender(false);
          maybeStop();
          updateRunButton();
        }
        if (state.running) requestStep();
      };
      state.worker.onerror = () => {
        state.worker?.terminate();
        state.worker = null;
        state.initializing = false;
        state.localSolver = core.createSolver(options);
        state.snapshot = core.snapshot(state.localSolver);
        state.inFlight = false;
        updateReadouts();
        scheduleRender(true);
      };
      state.worker.postMessage({ type: "init", options });
    } else {
      state.localSolver = core.createSolver(options);
      state.initializing = false;
      state.snapshot = core.snapshot(state.localSolver);
      updateReadouts();
      scheduleRender(true);
    }
    updateControls();
    updateRunButton();
  }

  function requestStep() {
    if (state.inFlight) return;
    state.inFlight = true;
    if (state.worker) {
      state.worker.postMessage({ type: "step", steps: state.stepsPerDispatch });
      return;
    }
    requestAnimationFrame(() => {
      if (!state.localSolver) return;
      state.snapshot = core.stepSolver(state.localSolver, state.stepsPerDispatch);
      state.inFlight = false;
      updateReadouts();
      scheduleRender(false);
      maybeStop();
      updateRunButton();
      if (state.running) requestStep();
    });
  }

  function updateControls() {
    const mappings = [
      ["[data-asset-model]", "assetModel", state.model],
      ["[data-asset-shape]", "assetShape", state.shape],
      ["[data-asset-views]", "assetViews", String(state.viewCount)],
      ["[data-asset-scope]", "assetScope", state.scope],
      ["[data-asset-resolution]", "assetResolution", String(state.workResolution)]
    ];
    for (const [selector, key, value] of mappings) {
      document.querySelectorAll(selector).forEach((button) => button.classList.toggle("active", button.dataset[key] === value));
    }
    const copy = MODEL_COPY[state.model];
    if (elements.assetModelTitle) elements.assetModelTitle.textContent = copy.title;
    if (elements.assetModelCopy) elements.assetModelCopy.textContent = copy.copy;
    if (elements.assetClaimBoundary) elements.assetClaimBoundary.textContent = copy.claim;
    if (elements.assetEvidenceBadge) elements.assetEvidenceBadge.textContent = `${state.viewCount} calibrated RGB + mask + depth views`;
    if (elements.assetBackendBadge) elements.assetBackendBadge.textContent = state.worker ? "worker finite differences + Adam" : "cooperative finite differences + Adam";
    if (elements.assetScopeBadge) elements.assetScopeBadge.textContent = scopeLabel(state.scope);
    if (elements.assetDisplayBadge) elements.assetDisplayBadge.textContent = `refining preview / solve ${state.workResolution}×${state.workResolution}`;
    if (elements.assetShapeNote) elements.assetShapeNote.textContent = core.SHAPE_META[state.shape]?.detailed
      ? `${core.SHAPE_META[state.shape].short}. A procedural depth surface with spatial pigment and roughness; normal detail changes lighting without moving the silhouette. The same surface generates the measurements and the fit. No imported mesh or subsurface transport.`
      : "A compact implicit surface with procedural albedo, displacement and normal detail. Choose a detailed specimen to separate visible surface relief from fine shading normals.";
    if (elements.assetFactorizationBadge) elements.assetFactorizationBadge.textContent = `${core.MODEL_META[state.model].short} / ${scopeLabel(state.scope)}`;
  }

  function scopeLabel(scope) {
    return ({ geometry: "shape-only ablation", pbr: "shape + PBR maps", micro: "+ microstructure, known light", joint: "joint shape + material + light" })[scope] || scope;
  }

  function updateRunButton() {
    if (!elements.assetRunButton) return;
    elements.assetRunButton.textContent = state.running ? "Pause solve" : "Run solve";
    elements.assetRunButton.classList.toggle("active", state.running);
    if (elements.assetStatusBadge) {
      elements.assetStatusBadge.textContent = state.initializing
        ? "initializing worker"
        : state.running
          ? "optimizing factor graph"
          : state.stopReason || (state.snapshot?.iteration ? "paused" : "ready");
      elements.assetStatusBadge.classList.toggle("ready", Boolean(state.snapshot));
      elements.assetStatusBadge.classList.toggle("warn", state.stopReason === "scope plateau");
    }
  }

  function maybeStop() {
    if (!state.running || !state.snapshot) return false;
    const minimumIterations = { ggx: 80, glint: 100, granular: 60 };
    const threshold = state.model === "glint" ? 0.0012 : 0.0008;
    const recent = state.snapshot.history.slice(-12);
    const recentMean = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
    if (state.snapshot.iteration >= minimumIterations[state.model] && recentMean <= threshold) {
      state.stopReason = "converged on validation raster";
    } else if (state.snapshot.iteration >= 360) {
      state.stopReason = "scope plateau";
    }
    if (!state.stopReason) return false;
    state.running = false;
    return true;
  }

  function updateReadouts() {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    if (elements.assetLossMetric) elements.assetLossMetric.textContent = snapshot.loss.toExponential(2);
    if (elements.assetIterationMetric) elements.assetIterationMetric.textContent = String(snapshot.iteration);
    const metricMap = {
      geometry: elements.assetGeometryMetric,
      material: elements.assetMaterialMetric,
      lighting: elements.assetLightingMetric,
      microstructure: elements.assetMicroMetric
    };
    for (const [group, element] of Object.entries(metricMap)) {
      if (element) element.textContent = `${Math.round((1 - Math.min(1, snapshot.errors[group] * 1.6)) * 100)}%`;
    }
    drawParameterBars();
  }

  function scheduleRender(force) {
    if (force) state.lastRender = 0;
    state.renderPending = true;
  }

  function frame(time) {
    if (!document.hidden && state.renderPending && state.snapshot && time - state.lastRender > 100) {
      state.renderPending = false;
      state.lastRender = time;
      drawActiveTab();
    }
    requestAnimationFrame(frame);
  }

  function drawActiveTab() {
    if (!document.querySelector('[data-view-panel="asset"]')?.classList.contains("active")) return;
    if (state.activeTab === "solve") drawSolve();
    if (state.activeTab === "maps") drawMaps();
    if (state.activeTab === "audit") drawAudit();
  }

  function drawSolve() {
    const { params, target, model } = state.snapshot;
    const shape = state.snapshot.shape || state.shape;
    const settled = !state.running && !state.inFlight && state.previewHasImage;
    const width = state.previewWorker ? (settled ? 720 : 420) : 360;
    const height = Math.round(width * 2 / 3);
    const request = { type: "render", id: ++state.previewId, scene: state.previewScene, params, target, model, shape,
      viewAngle: state.viewAngle, width, height, sampleGrid: settled && state.previewWorker ? 2 : 1 };
    if (state.previewWorker) {
      if (state.previewInFlight) state.previewQueued = request;
      else dispatchPreview(request);
    } else {
      presentPreview(core.renderRgba(target, model, width, height, state.viewAngle, shape),
        core.renderRgba(params, model, width, height, state.viewAngle, shape), width, height, 1);
    }
    drawLossChart();
  }

  function dispatchPreview(request) {
    if (document.hidden) { state.renderPending = true; return; }
    state.previewInFlight = true;
    state.previewWorker.postMessage(request);
  }

  function presentPreview(target, current, width, height, grid) {
    putRgba(elements.assetTargetCanvas, target, width, height);
    putRgba(elements.assetCurrentCanvas, current, width, height);
    drawResidual(elements.assetResidualCanvas, target, current, width, height);
    if (elements.assetDisplayBadge) elements.assetDisplayBadge.textContent =
      `${width}×${height}${grid > 1 ? ` · ${grid * grid} samples/pixel` : " · interactive preview"} / solve ${state.workResolution}×${state.workResolution}`;
  }

  function drawMaps() {
    const snapshot = state.snapshot;
    const maps = ["geometry", "albedo", "normal", "displacement", "roughness", "microstructure"];
    for (const map of maps) {
      const canvas = elements[`assetMap${map[0].toUpperCase()}${map.slice(1)}`];
      if (!canvas) continue;
      if (map === "geometry" && !core.SHAPE_META[snapshot.shape]?.detailed) drawGeometryMap(canvas, snapshot.params, snapshot.target);
      else putRgba(canvas, core.renderMapRgba(snapshot.params, snapshot.model, map, 440, 264, snapshot.shape), 440, 264);
    }
    const errorBadges = {
      Geometry: snapshot.errors.geometry,
      Albedo: snapshot.errors.material,
      Normal: Math.abs(snapshot.params[4] - snapshot.target[4]),
      Displacement: Math.abs(snapshot.params[3] - snapshot.target[3]),
      Roughness: Math.abs(snapshot.params[8] - snapshot.target[8]),
      Microstructure: snapshot.errors.microstructure
    };
    for (const [name, error] of Object.entries(errorBadges)) {
      const badge = elements[`assetMap${name}Badge`];
      if (badge) badge.textContent = `eval error ${error.toFixed(3)}`;
    }
    drawAblationChart();
  }

  function drawAudit() {
    drawCaptureOrbit();
    drawIdentifiability();
    drawBsdfAudit();
  }

  function putRgba(canvas, data, width, height) {
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.putImageData(new ImageData(data, width, height), 0, 0);
  }

  function drawResidual(canvas, target, current, width, height) {
    if (!canvas) return;
    const data = new Uint8ClampedArray(target.length);
    for (let index = 0; index < target.length; index += 4) {
      const dr = Math.abs(target[index] - current[index]) / 255;
      const dg = Math.abs(target[index + 1] - current[index + 1]) / 255;
      const db = Math.abs(target[index + 2] - current[index + 2]) / 255;
      const magnitude = Math.min(1, Math.sqrt((dr * dr + dg * dg + db * db) / 3) * 2.2);
      data[index] = Math.round(22 + magnitude * 225);
      data[index + 1] = Math.round(30 + magnitude * 92);
      data[index + 2] = Math.round(42 + (1 - magnitude) * 82);
      data[index + 3] = 255;
    }
    putRgba(canvas, data, width, height);
  }

  function chartBackground(context, width, height) {
    context.fillStyle = "#090b0e";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;
    for (let y = 28; y < height; y += 32) {
      context.beginPath();
      context.moveTo(34, y + 0.5);
      context.lineTo(width - 12, y + 0.5);
      context.stroke();
    }
  }

  function drawLossChart() {
    const canvas = elements.assetLossCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    chartBackground(context, width, height);
    const history = state.snapshot.history;
    if (!history.length) return;
    const logged = history.map((value) => Math.log10(Math.max(1e-7, value)));
    const min = Math.min(...logged, -4);
    const max = Math.max(...logged, -1);
    context.strokeStyle = "#49d0bd";
    context.lineWidth = 2;
    context.beginPath();
    logged.forEach((value, index) => {
      const x = 34 + index / Math.max(1, logged.length - 1) * (width - 50);
      const y = 14 + (max - value) / Math.max(1e-6, max - min) * (height - 38);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.fillStyle = "#aab3b0";
    context.font = "11px Inter, system-ui, sans-serif";
    context.fillText("log photometric + mask + depth objective", 12, height - 8);
  }

  function drawParameterBars() {
    const host = elements.assetParameterBars;
    if (!host || !state.snapshot) return;
    host.textContent = "";
    core.PARAMETER_META.forEach((meta, index) => {
      const row = document.createElement("div");
      row.className = "asset-parameter-row";
      const label = document.createElement("span");
      label.textContent = meta.label;
      const track = document.createElement("div");
      const current = document.createElement("i");
      const target = document.createElement("b");
      current.style.width = `${state.snapshot.params[index] * 100}%`;
      target.style.left = `${state.snapshot.target[index] * 100}%`;
      track.append(current, target);
      const value = document.createElement("strong");
      value.textContent = state.snapshot.params[index].toFixed(2);
      row.append(label, track, value);
      host.append(row);
    });
  }

  function drawGeometryMap(canvas, params, target) {
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    chartBackground(context, width, height);
    const drawOutline = (values, color, dash) => {
      const decoded = core.decodedParameters(values);
      context.strokeStyle = color;
      context.setLineDash(dash);
      context.lineWidth = 2;
      context.beginPath();
      for (let index = 0; index <= 120; index += 1) {
        const angle = Math.PI * 2 * index / 120;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const denom = Math.pow(Math.pow(Math.abs(c), decoded.exponent) + Math.pow(Math.abs(s), decoded.exponent), 1 / decoded.exponent);
        const x = width * 0.5 + c / denom * decoded.width * width * 0.42;
        const y = height * 0.5 + s / denom * decoded.height * height * 0.42;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      context.stroke();
    };
    drawOutline(target, "#f0ba5d", [5, 4]);
    drawOutline(params, "#49d0bd", []);
    context.setLineDash([]);
  }

  const ABLATION_GROUPS = [
    { key: "geometry", label: "shape", color: "#7ba7ff" },
    { key: "material", label: "PBR", color: "#49d0bd" },
    { key: "microstructure", label: "micro", color: "#f0ba5d" },
    { key: "lighting", label: "light", color: "#ed7c91" }
  ];

  // Per-group parameter RMSE read off the live solve. This is an oracle measurement: it is
  // only computable because the target vector is synthetic and known, and it is never part
  // of the objective. A group whose parameters the current scope freezes is drawn hollow --
  // its error is the distance the solve was never allowed to close, not a solver failure.
  function drawAblationChart() {
    const canvas = elements.assetAblationCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    chartBackground(context, width, height);
    context.font = "10px Inter, system-ui, sans-serif";
    if (!state.snapshot) {
      context.fillStyle = "#6d7570";
      context.fillText("no solve yet - press Run", 38, height / 2);
      return;
    }
    const errors = state.snapshot.errors || {};
    const active = new Set(core.activeIndices(state.scope));
    const groupIsSolved = (key) => core.PARAMETER_META
      .some((meta, index) => meta.group === key && active.has(index));
    const peak = Math.max(0.25, ...ABLATION_GROUPS.map((group) => errors[group.key] || 0)) * 1.18;
    const plotHeight = height - 56;
    const slot = (width - 56) / ABLATION_GROUPS.length;
    const barWidth = Math.max(14, slot - 14);
    ABLATION_GROUPS.forEach((group, index) => {
      const error = errors[group.key] || 0;
      const solved = groupIsSolved(group.key);
      const x = 38 + index * slot;
      const barHeight = Math.max(1, (error / peak) * plotHeight);
      const y = height - 30 - barHeight;
      if (solved) {
        context.fillStyle = group.color;
        context.fillRect(x, y, barWidth, barHeight);
      } else {
        context.strokeStyle = group.color;
        context.lineWidth = 1;
        context.setLineDash([3, 3]);
        context.strokeRect(x + 0.5, y + 0.5, barWidth - 1, barHeight - 1);
        context.setLineDash([]);
      }
      context.fillStyle = "#aab3b0";
      context.fillText(group.label, x, height - 11);
      context.fillStyle = solved ? "#e6ece9" : "#6d7570";
      context.fillText(error.toFixed(3), x, Math.max(20, y - 6));
      if (!solved) context.fillText("frozen", x, height - 1);
    });
    context.fillStyle = "#6d7570";
    context.fillText(`parameter RMSE vs truth, peak ${peak.toFixed(2)}`, 38, 14);
  }

  function drawCaptureOrbit() {
    const canvas = elements.assetCaptureCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    chartBackground(context, width, height);
    const centerX = width * 0.34;
    const centerY = height * 0.52;
    const radiusX = width * 0.25;
    const radiusY = height * 0.31;
    context.strokeStyle = "rgba(123,167,255,0.32)";
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.stroke();
    const angles = core.viewAngles(state.viewCount);
    angles.forEach((angle, index) => {
      const x = centerX + Math.sin(angle) * radiusX;
      const y = centerY + Math.cos(angle) * radiusY;
      context.fillStyle = index % Math.max(1, Math.floor(state.viewCount / 8)) === 0 ? "#49d0bd" : "rgba(73,208,189,0.4)";
      context.fillRect(x - 3, y - 3, 6, 6);
      context.strokeStyle = "rgba(73,208,189,0.16)";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(centerX, centerY);
      context.stroke();
    });
    context.fillStyle = "#f0ba5d";
    context.beginPath();
    context.arc(centerX, centerY, 18, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f1f4f1";
    context.font = "12px Inter, system-ui, sans-serif";
    context.fillText(`${state.viewCount} posed views`, width * 0.66, 34);
    context.fillStyle = "#aab3b0";
    context.fillText("RGB + foreground mask", width * 0.66, 56);
    context.fillText("single unknown HDR direction", width * 0.66, 78);
    context.fillText("evaluation truth stays isolated", width * 0.66, 100);
  }

  // The sensitivity sweep costs ~20k renderPixel calls, so recompute it only when the state
  // it depends on actually changes rather than on every animation frame.
  let sensitivityCache = null;

  function currentSensitivity() {
    if (!state.snapshot) return null;
    // Refresh at most every 8 iterations: the sweep is ~25k renderPixel calls and the solver
    // dispatches 2 steps at a time, so keying on the raw iteration would peg the main thread.
    const key = [state.model, state.shape, state.scope, state.viewCount, Math.floor(state.snapshot.iteration / 8)].join("|");
    if (sensitivityCache && sensitivityCache.key === key) return sensitivityCache.value;
    const value = core.sensitivityMatrix(state.snapshot.params, state.model, {
      viewCount: state.viewCount,
      shape: state.shape,
      resolution: 18
    });
    sensitivityCache = { key, value };
    return value;
  }

  function drawIdentifiability() {
    const canvas = elements.assetIdentifiabilityCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    chartBackground(context, width, height);
    context.font = "10px Inter, system-ui, sans-serif";
    const sensitivity = currentSensitivity();
    if (!sensitivity) {
      context.fillStyle = "#6d7570";
      context.fillText("no solve yet - press Run", 92, height / 2);
      return;
    }
    const columns = [
      { key: "rgb", label: "RGB", tint: "73,208,189" },
      { key: "depth", label: "depth", tint: "123,167,255" },
      { key: "boundary", label: "coverage", tint: "237,124,145" }
    ];
    const active = new Set(core.activeIndices(state.scope));
    const left = 96;
    const top = 32;
    const cellW = (width - left - 70) / columns.length;
    const cellH = (height - top - 24) / sensitivity.rows.length;
    columns.forEach((column, index) => {
      context.fillStyle = "#aab3b0";
      context.fillText(column.label, left + index * cellW + 4, 20);
    });
    context.fillStyle = "#6d7570";
    context.fillText("|dRGB|", left + columns.length * cellW + 8, 20);
    sensitivity.rows.forEach((row, index) => {
      const solved = active.has(index);
      context.fillStyle = solved ? "#aab3b0" : "#5c6360";
      context.fillText(row.label, 8, top + index * cellH + cellH * 0.72);
      columns.forEach((column, columnIndex) => {
        const score = clamp(row.normalized[column.key], 0, 1);
        context.fillStyle = `rgba(${column.tint},${0.06 + score * 0.86})`;
        context.fillRect(left + columnIndex * cellW + 2, top + index * cellH + 2, cellW - 5, Math.max(3, cellH - 5));
      });
      context.fillStyle = solved ? "#8f9894" : "#5c6360";
      context.fillText(row.raw.rgb.toFixed(3), left + columns.length * cellW + 8,
        top + index * cellH + cellH * 0.72);
    });
    context.fillStyle = "#6d7570";
    context.fillText(
      `interior finite differences at ${sensitivity.resolution}px; "coverage" is the sample fraction where the silhouette moved and the derivative is undefined`,
      8, height - 6);
  }

  function drawBsdfAudit() {
    const canvas = elements.assetBsdfCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    chartBackground(context, width, height);
    const curves = [
      { label: "target", color: "#f0ba5d", values: core.bsdfSlice(state.snapshot.target, state.model) },
      { label: "recovered", color: "#49d0bd", values: core.bsdfSlice(state.snapshot.params, state.model) },
      { label: "smooth GGX", color: "#7ba7ff", values: core.bsdfSlice(state.snapshot.target, "ggx") }
    ];
    const max = Math.max(0.25, ...curves.flatMap((curve) => curve.values));
    curves.forEach((curve) => {
      context.strokeStyle = curve.color;
      context.lineWidth = 2;
      context.beginPath();
      curve.values.forEach((value, index) => {
        const x = 34 + index / Math.max(1, curve.values.length - 1) * (width - 50);
        const y = height - 26 - Math.min(1, value / max) * (height - 46);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    });
    curves.forEach((curve, index) => {
      context.fillStyle = curve.color;
      context.fillRect(14 + index * 92, 10, 12, 2);
      context.fillStyle = "#aab3b0";
      context.font = "10px Inter, system-ui, sans-serif";
      context.fillText(curve.label, 31 + index * 92, 14);
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
