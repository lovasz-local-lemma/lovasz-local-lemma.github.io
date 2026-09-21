(function initVolumeInverseLab() {
  "use strict";

  const core = window.VolumeInverseCore;
  if (!core) return;

  const state = {
    regime: "dense",
    scattering: "single",
    size: 24,
    priorStrength: 0.55,
    inspectAngle: 0.62,
    steps: 1,
    activeTab: "solve",
    running: false,
    initializing: true,
    stopReason: null,
    worker: null,
    localSolver: null,
    inFlight: false,
    snapshot: null,
    renderPending: false,
    lastRender: 0
  };

  const elements = {};
  const ids = [
    "volumeinvRunButton", "volumeinvStepButton", "volumeinvResetButton", "volumeinvStatusBadge",
    "volumeinvPrior", "volumeinvPriorValue", "volumeinvInspectAngle", "volumeinvInspectAngleValue",
    "volumeinvTargetCanvas", "volumeinvCurrentCanvas", "volumeinvResidualCanvas", "volumeinvLossCanvas",
    "volumeinvOrbitCanvas", "volumeinvCaptureCanvas", "volumeinvSliceCanvas", "volumeinvTrackerCanvas",
    "volumeinvPosterior0", "volumeinvPosterior1", "volumeinvPosterior2", "volumeinvPosterior3",
    "volumeinvUncertaintyCanvas", "volumeinvLossMetric", "volumeinvIterationMetric", "volumeinvViewMetric",
    "volumeinvIouMetric", "volumeinvRmseMetric", "volumeinvSpreadMetric", "volumeinvBackendBadge",
    "volumeinvEvidenceBadge", "volumeinvRegimeTitle", "volumeinvRegimeCopy", "volumeinvClaimBoundary",
    "volumeinvTrackerBadge", "volumeinvTransmittanceMetric", "volumeinvGradientMetric", "volumeinvPosteriorBadge"
  ];

  const REGIME_COPY = {
    dense: {
      title: "Calibrated multi-view optical tomography",
      copy: "Twenty-four radiance views are converted to optical-depth evidence. SIRT-style analytic backprojection updates the 3D density field while the ratio-tracking panel audits a stochastic transmittance gradient.",
      claim: "The density solve is a real discrete emission-absorption tomography problem. Multiple scattering is a two-order display surrogate, not a full radiative-transfer inverse."
    },
    sparse: {
      title: "Sparse stereo with a cloud-shape prior",
      copy: "Four angular projections leave a large null space. Smooth 3D regularization suppresses streaks, but unsupported depth structure remains visible in side-view inspection.",
      claim: "No trained 3D CNN is bundled here; the prior is an explicit smoothness baseline so data and prior contributions remain inspectable."
    },
    single: {
      title: "Single-view diffusion-posterior analogue",
      copy: "Four conditional depth hypotheses are optimized against the same front image. They agree in measurement space and disagree from the side, exposing the posterior rather than hiding ambiguity in one answer.",
      claim: "The hypotheses are procedural conditional priors, not samples from the CVPR 2025 diffusion model. One image does not uniquely recover a physical cloud."
    }
  };

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    if (!document.querySelector('[data-view-panel="volumeinv"]')) return;
    ids.forEach((id) => { elements[id] = document.getElementById(id); });
    bindControls();
    resetSolver();
    requestAnimationFrame(frame);
  }

  function bindControls() {
    document.querySelectorAll("[data-volumeinv-regime]").forEach((button) => {
      button.addEventListener("click", () => {
        state.regime = button.dataset.volumeinvRegime;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-volumeinv-scattering]").forEach((button) => {
      button.addEventListener("click", () => {
        state.scattering = button.dataset.volumeinvScattering;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-volumeinv-size]").forEach((button) => {
      button.addEventListener("click", () => {
        state.size = Number(button.dataset.volumeinvSize) || 24;
        resetSolver();
      });
    });
    document.querySelectorAll("[data-volumeinv-tab]").forEach((button) => {
      button.addEventListener("click", () => setTab(button.dataset.volumeinvTab));
    });
    elements.volumeinvRunButton?.addEventListener("click", () => {
      state.running = !state.running;
      updateRunButton();
      if (state.running) state.stopReason = null;
      if (state.running) requestStep();
    });
    elements.volumeinvStepButton?.addEventListener("click", () => {
      state.stopReason = null;
      requestStep();
    });
    elements.volumeinvResetButton?.addEventListener("click", resetSolver);
    elements.volumeinvPrior?.addEventListener("input", () => {
      state.priorStrength = Number(elements.volumeinvPrior.value);
      if (elements.volumeinvPriorValue) elements.volumeinvPriorValue.textContent = state.priorStrength.toFixed(2);
      resetSolver();
    });
    elements.volumeinvInspectAngle?.addEventListener("input", () => {
      state.inspectAngle = Number(elements.volumeinvInspectAngle.value) * Math.PI / 180;
      if (elements.volumeinvInspectAngleValue) elements.volumeinvInspectAngleValue.textContent = `${Math.round(Number(elements.volumeinvInspectAngle.value))} deg`;
      resetSolver();
    });
    document.addEventListener("inverse-view-change", (event) => {
      if (event.detail?.view === "volumeinv") scheduleRender(true);
    });
  }

  function setTab(tab) {
    state.activeTab = ["solve", "evidence", "posterior"].includes(tab) ? tab : "solve";
    document.querySelectorAll("[data-volumeinv-tab]").forEach((button) => button.classList.toggle("active", button.dataset.volumeinvTab === state.activeTab));
    document.querySelectorAll("[data-volumeinv-tab-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.volumeinvTabPanel === state.activeTab));
    scheduleRender(true);
  }

  function solverOptions() {
    return {
      regime: state.regime,
      scattering: state.scattering,
      size: state.size,
      priorStrength: state.priorStrength,
      inspectAngle: state.inspectAngle
    };
  }

  function resetSolver() {
    state.running = false;
    state.initializing = true;
    state.stopReason = null;
    state.inFlight = false;
    state.snapshot = null;
    state.worker?.terminate();
    state.worker = null;
    state.localSolver = null;
    const options = solverOptions();
    if (typeof Worker !== "undefined") {
      state.worker = new Worker("volume-inverse-worker.js?v=volume-inverse-2");
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
      state.worker.postMessage({ type: "step", steps: state.steps });
      return;
    }
    requestAnimationFrame(() => {
      if (!state.localSolver) return;
      state.snapshot = core.stepSolver(state.localSolver, state.steps);
      state.inFlight = false;
      updateReadouts();
      scheduleRender(false);
      maybeStop();
      updateRunButton();
      if (state.running) requestStep();
    });
  }

  function updateControls() {
    const controlSets = [
      ["[data-volumeinv-regime]", "volumeinvRegime", state.regime],
      ["[data-volumeinv-scattering]", "volumeinvScattering", state.scattering],
      ["[data-volumeinv-size]", "volumeinvSize", String(state.size)]
    ];
    controlSets.forEach(([selector, key, value]) => {
      document.querySelectorAll(selector).forEach((button) => button.classList.toggle("active", button.dataset[key] === value));
    });
    const copy = REGIME_COPY[state.regime];
    if (elements.volumeinvRegimeTitle) elements.volumeinvRegimeTitle.textContent = copy.title;
    if (elements.volumeinvRegimeCopy) elements.volumeinvRegimeCopy.textContent = copy.copy;
    if (elements.volumeinvClaimBoundary) elements.volumeinvClaimBoundary.textContent = copy.claim;
    const views = core.REGIMES[state.regime].angles.length;
    if (elements.volumeinvEvidenceBadge) elements.volumeinvEvidenceBadge.textContent = `${views} calibrated view${views === 1 ? "" : "s"} / ${state.size}^3 voxels`;
    if (elements.volumeinvViewMetric) elements.volumeinvViewMetric.textContent = `${views} view${views === 1 ? "" : "s"}`;
    if (elements.volumeinvBackendBadge) elements.volumeinvBackendBadge.textContent = state.worker ? "worker SIRT kernel" : "cooperative SIRT kernel";
    if (elements.volumeinvPosteriorBadge) elements.volumeinvPosteriorBadge.textContent = state.regime === "single" ? "4 equally data-consistent hypotheses" : "posterior collapses with angular evidence";
  }

  function updateRunButton() {
    if (!elements.volumeinvRunButton) return;
    elements.volumeinvRunButton.textContent = state.running ? "Pause inversion" : "Run inversion";
    if (elements.volumeinvStatusBadge) {
      elements.volumeinvStatusBadge.textContent = state.initializing
        ? "initializing worker"
        : state.running
          ? "backprojecting optical residuals"
          : state.stopReason || (state.snapshot?.iteration ? "paused" : "ready");
      elements.volumeinvStatusBadge.classList.toggle("ready", Boolean(state.snapshot));
      elements.volumeinvStatusBadge.classList.toggle("warn", state.stopReason === "regularized plateau");
    }
  }

  function maybeStop() {
    if (!state.running || !state.snapshot || state.snapshot.iteration < 20) return false;
    const thresholds = { dense: 0.0001, sparse: 0.0015, single: 0.00001 };
    const limits = { dense: 260, sparse: 320, single: 220 };
    if (state.snapshot.loss <= thresholds[state.regime]) state.stopReason = "converged in measurement space";
    else if (state.snapshot.iteration >= limits[state.regime]) state.stopReason = "regularized plateau";
    if (!state.stopReason) return false;
    state.running = false;
    return true;
  }

  function updateReadouts() {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    if (elements.volumeinvLossMetric) elements.volumeinvLossMetric.textContent = snapshot.loss.toExponential(2);
    if (elements.volumeinvIterationMetric) elements.volumeinvIterationMetric.textContent = String(snapshot.iteration);
    if (elements.volumeinvViewMetric) elements.volumeinvViewMetric.textContent = `${snapshot.angles.length} view${snapshot.angles.length === 1 ? "" : "s"}`;
    if (elements.volumeinvIouMetric) elements.volumeinvIouMetric.textContent = snapshot.metrics.iou.toFixed(3);
    if (elements.volumeinvRmseMetric) elements.volumeinvRmseMetric.textContent = snapshot.metrics.rmse.toFixed(3);
    const maxSpread = Math.max(...snapshot.uncertainty);
    if (elements.volumeinvSpreadMetric) elements.volumeinvSpreadMetric.textContent = maxSpread.toFixed(3);
    if (elements.volumeinvTransmittanceMetric) elements.volumeinvTransmittanceMetric.textContent = `${snapshot.tracker.estimates.at(-1).toFixed(3)} / exact ${snapshot.tracker.exactTransmittance.toFixed(3)}`;
    if (elements.volumeinvGradientMetric) elements.volumeinvGradientMetric.textContent = `${snapshot.tracker.gradients.at(-1).toFixed(3)} / exact ${snapshot.tracker.exactGradient.toFixed(3)}`;
    if (elements.volumeinvTrackerBadge) elements.volumeinvTrackerBadge.textContent = `${snapshot.tracker.estimates.length} ratio-tracking paths`;
  }

  function scheduleRender(force) {
    if (force) state.lastRender = 0;
    state.renderPending = true;
  }

  function frame(time) {
    if (state.renderPending && state.snapshot && time - state.lastRender > 55) {
      state.renderPending = false;
      state.lastRender = time;
      drawActiveTab();
    }
    requestAnimationFrame(frame);
  }

  function drawActiveTab() {
    if (!document.querySelector('[data-view-panel="volumeinv"]')?.classList.contains("active")) return;
    if (state.activeTab === "solve") drawSolve();
    if (state.activeTab === "evidence") drawEvidence();
    if (state.activeTab === "posterior") drawPosterior();
  }

  function drawSolve() {
    const snapshot = state.snapshot;
    drawUpscaledRgba(elements.volumeinvTargetCanvas, snapshot.targetRgba, snapshot.size);
    drawUpscaledRgba(elements.volumeinvCurrentCanvas, snapshot.currentRgba, snapshot.size);
    drawScalar(elements.volumeinvResidualCanvas, snapshot.residual, snapshot.size, "residual");
    drawLossChart();
  }

  function drawEvidence() {
    drawOrbit();
    drawCaptureStrip();
    drawSlices();
    drawTracker();
  }

  function drawPosterior() {
    const snapshot = state.snapshot;
    for (let index = 0; index < 4; index += 1) {
      const projection = snapshot.posteriorProjections[index] || snapshot.posteriorProjections[0];
      drawScalar(elements[`volumeinvPosterior${index}`], projection, snapshot.size, "density");
    }
    drawScalar(elements.volumeinvUncertaintyCanvas, snapshot.uncertainty, snapshot.size, "uncertainty");
  }

  function drawUpscaledRgba(canvas, data, size) {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const temporary = document.createElement("canvas");
    temporary.width = size;
    temporary.height = size;
    temporary.getContext("2d").putImageData(new ImageData(data, size, size), 0, 0);
    context.fillStyle = "#090b0e";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const extent = Math.min(canvas.width, canvas.height);
    const x = (canvas.width - extent) * 0.5;
    const y = (canvas.height - extent) * 0.5;
    context.drawImage(temporary, x, y, extent, extent);
  }

  function scalarColor(value, mode) {
    const t = Math.max(0, Math.min(1, value));
    if (mode === "residual") return [34 + 221 * t, 38 + 96 * t, 68 + 38 * (1 - t)];
    if (mode === "uncertainty") return [44 + 211 * t, 56 + 128 * t, 88 + 75 * (1 - t)];
    return [26 + 175 * t, 34 + 198 * t, 47 + 206 * t];
  }

  function drawScalar(canvas, values, size, mode) {
    if (!canvas || !values) return;
    const max = Math.max(0.08, ...values);
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let index = 0; index < values.length; index += 1) {
      const color = scalarColor(values[index] / max, mode);
      rgba[index * 4] = color[0];
      rgba[index * 4 + 1] = color[1];
      rgba[index * 4 + 2] = color[2];
      rgba[index * 4 + 3] = 255;
    }
    drawUpscaledRgba(canvas, rgba, size);
  }

  function chartBackground(context, width, height) {
    context.fillStyle = "#090b0e";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,0.08)";
    for (let y = 24; y < height; y += 30) {
      context.beginPath();
      context.moveTo(32, y + 0.5);
      context.lineTo(width - 12, y + 0.5);
      context.stroke();
    }
  }

  function drawLossChart() {
    const canvas = elements.volumeinvLossCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    chartBackground(context, canvas.width, canvas.height);
    const history = state.snapshot.history;
    if (!history.length) return;
    const values = history.map((value) => Math.log10(Math.max(1e-7, value)));
    const min = Math.min(...values, -4.5);
    const max = Math.max(...values, -0.6);
    context.strokeStyle = "#49d0bd";
    context.lineWidth = 2;
    context.beginPath();
    values.forEach((value, index) => {
      const x = 34 + index / Math.max(1, values.length - 1) * (canvas.width - 50);
      const y = 12 + (max - value) / Math.max(1e-6, max - min) * (canvas.height - 36);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.fillStyle = "#aab3b0";
    context.font = "11px Inter, system-ui, sans-serif";
    context.fillText("log optical-depth evidence loss", 12, canvas.height - 8);
  }

  function drawOrbit() {
    const canvas = elements.volumeinvOrbitCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    chartBackground(context, canvas.width, canvas.height);
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.54;
    const rx = canvas.width * 0.37;
    const ry = canvas.height * 0.28;
    context.strokeStyle = "rgba(123,167,255,0.32)";
    context.beginPath();
    context.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
    state.snapshot.angles.forEach((angle) => {
      const x = centerX + Math.sin(angle) * rx;
      const y = centerY + Math.cos(angle) * ry;
      context.fillStyle = "#49d0bd";
      context.fillRect(x - 3, y - 3, 6, 6);
      context.strokeStyle = "rgba(73,208,189,0.18)";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(centerX, centerY);
      context.stroke();
    });
    context.fillStyle = "rgba(240,186,93,0.72)";
    for (let index = 0; index < 22; index += 1) {
      const angle = index * 2.399;
      const radius = 7 + (index % 5) * 3;
      context.beginPath();
      context.arc(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius * 0.55, 2 + index % 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCaptureStrip() {
    const canvas = elements.volumeinvCaptureCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    chartBackground(context, canvas.width, canvas.height);
    const previews = state.snapshot.capturePreviews;
    const shown = previews.length <= 8 ? previews : Array.from({ length: 8 }, (_, index) => previews[Math.floor(index * previews.length / 8)]);
    const gap = 7;
    const tileWidth = (canvas.width - gap * (shown.length + 1)) / shown.length;
    const tileHeight = Math.min(canvas.height - 42, tileWidth);
    shown.forEach((preview, index) => {
      const temporary = document.createElement("canvas");
      temporary.width = state.snapshot.size;
      temporary.height = state.snapshot.size;
      temporary.getContext("2d").putImageData(new ImageData(preview, state.snapshot.size, state.snapshot.size), 0, 0);
      context.drawImage(temporary, gap + index * (tileWidth + gap), 14, tileWidth, tileHeight);
    });
    context.fillStyle = "#aab3b0";
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText(`${previews.length} radiance images -> calibrated optical depths`, 10, canvas.height - 10);
  }

  function drawSlices() {
    const canvas = elements.volumeinvSliceCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    chartBackground(context, canvas.width, canvas.height);
    const half = Math.floor(canvas.width / 2);
    drawScalarInto(context, state.snapshot.targetSlice, state.snapshot.size, 8, 22, half - 14, canvas.height - 44);
    drawScalarInto(context, state.snapshot.currentSlice, state.snapshot.size, half + 6, 22, half - 14, canvas.height - 44);
    context.fillStyle = "#aab3b0";
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText("target density slice", 10, 14);
    context.fillText("current density slice", half + 8, 14);
  }

  function drawScalarInto(context, values, size, x, y, width, height) {
    const max = Math.max(0.08, ...values);
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let index = 0; index < values.length; index += 1) {
      const color = scalarColor(values[index] / max, "density");
      rgba[index * 4] = color[0];
      rgba[index * 4 + 1] = color[1];
      rgba[index * 4 + 2] = color[2];
      rgba[index * 4 + 3] = 255;
    }
    const temporary = document.createElement("canvas");
    temporary.width = size;
    temporary.height = size;
    temporary.getContext("2d").putImageData(new ImageData(rgba, size, size), 0, 0);
    context.drawImage(temporary, x, y, width, height);
  }

  function drawTracker() {
    const canvas = elements.volumeinvTrackerCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    chartBackground(context, canvas.width, canvas.height);
    const tracker = state.snapshot.tracker;
    const split = canvas.height * 0.52;
    context.strokeStyle = "rgba(255,255,255,0.16)";
    context.beginPath();
    context.moveTo(26, split);
    context.lineTo(canvas.width - 12, split);
    context.stroke();
    tracker.events.forEach((event) => {
      const x = 30 + (event.t + 1) * 0.5 * (canvas.width - 48);
      const height = 10 + event.density * 34;
      context.strokeStyle = event.ratio > 0.42 ? "#f0ba5d" : "#7ba7ff";
      context.beginPath();
      context.moveTo(x, split - 5);
      context.lineTo(x, split - 5 - height);
      context.stroke();
    });
    const curves = [
      { values: tracker.estimates, exact: tracker.exactTransmittance, color: "#49d0bd" },
      { values: tracker.gradients, exact: tracker.exactGradient, color: "#ed7c91" }
    ];
    curves.forEach((curve, curveIndex) => {
      const values = curve.values;
      const min = Math.min(...values, curve.exact);
      const max = Math.max(...values, curve.exact);
      const y0 = split + 10 + curveIndex * (canvas.height - split - 18) / 2;
      const laneHeight = (canvas.height - split - 24) / 2;
      context.strokeStyle = curve.color;
      context.beginPath();
      values.forEach((value, index) => {
        const x = 30 + index / Math.max(1, values.length - 1) * (canvas.width - 48);
        const y = y0 + (max - value) / Math.max(1e-6, max - min) * laneHeight;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      const exactY = y0 + (max - curve.exact) / Math.max(1e-6, max - min) * laneHeight;
      context.strokeStyle = "rgba(255,255,255,0.4)";
      context.setLineDash([4, 3]);
      context.beginPath();
      context.moveTo(30, exactY);
      context.lineTo(canvas.width - 18, exactY);
      context.stroke();
      context.setLineDash([]);
    });
  }
})();
