(function () {
  "use strict";

  const COLORS = {
    grid: "rgba(255,255,255,0.075)",
    text: "#9ca8a5",
    strong: "#e8efec",
    target: "#f4f7f2",
    residual: "#ed7c91",
    edge: "#f0ba5d",
    teal: "#49d0bd"
  };

  const els = {};
  let worker = null;
  let localLab = null;
  let requestId = 0;
  let pending = new Map();
  let latest = null;
  let running = false;
  let stepInFlight = false;
  let selectedBackend = "pathspace";
  let activeScene = "visibility";
  let sampleBudget = 256;
  let animationFrame = 0;

  const BACKEND_DETAILS = {
    finite: {
      support: "All parameters through symmetric loss probes",
      unbiased: "Numerical O(eps^2) bias; deterministic here",
      memory: "Constant, but four complete primal renders",
      best: "Gradient checks and low-dimensional references"
    },
    prb: {
      support: "Smooth BRDF, light, throughput, and replayable path vertices",
      unbiased: "Unbiased attached-path estimate; biased when visibility moves",
      memory: "Constant in path depth; linear replay time",
      best: "Large material fields and long smooth transport paths"
    },
    pathspace: {
      support: "Attached paths plus explicit differential boundary paths",
      unbiased: "Unbiased for this filtered path integral",
      memory: "Path samples plus edge-sampling acceleration",
      best: "Geometry, silhouettes, shadows, and changing visibility"
    },
    warped: {
      support: "Interior derivative plus divergence-form boundary area",
      unbiased: "Unbiased area estimator without explicit edge sampling",
      memory: "Traditional paths plus local warp evaluations",
      best: "Visibility derivatives when boundary data structures are awkward"
    },
    photon: {
      support: "Generalized photon-path positions and density-kernel weights",
      unbiased: "Unbiased for the smooth KDE; primal retains bandwidth bias",
      memory: "Photon map plus camera queries",
      best: "Caustics and specular-diffuse-specular transport"
    }
  };

  function init() {
    const ids = [
      "diffRunButton",
      "diffStepButton",
      "diffResetButton",
      "diffStatusBadge",
      "diffSceneCopy",
      "diffSignalCanvas",
      "diffPathCanvas",
      "diffGradientCanvas",
      "diffRaceCanvas",
      "diffBackendCards",
      "diffSelectedName",
      "diffSelectedClass",
      "diffSupport",
      "diffUnbiased",
      "diffMemory",
      "diffBestUse",
      "diffAuditBias",
      "diffAuditVariance",
      "diffAuditCosine",
      "diffAuditWork",
      "diffTargetParams",
      "diffCurrentParams",
      "diffRaceAxis"
    ];
    for (const id of ids) els[id] = document.getElementById(id);
    if (!els.diffRunButton || !window.DifferentialCore) return;

    document.querySelectorAll("[data-diff-scene]").forEach((button) => {
      button.addEventListener("click", () => {
        activeScene = button.getAttribute("data-diff-scene") || "visibility";
        resetLab();
      });
    });
    document.querySelectorAll("[data-diff-budget]").forEach((button) => {
      button.addEventListener("click", () => {
        sampleBudget = Number(button.getAttribute("data-diff-budget")) || 256;
        resetLab();
      });
    });
    els.diffRunButton.addEventListener("click", toggleRun);
    els.diffStepButton.addEventListener("click", () => {
      running = false;
      updateRunState();
      requestStep(1);
    });
    els.diffResetButton.addEventListener("click", resetLab);

    try {
      worker = new Worker("differential-worker.js?v=transport-1");
      worker.onmessage = handleWorkerMessage;
      worker.onerror = () => useLocalFallback();
    } catch (_) {
      useLocalFallback();
    }
    resetLab();
  }

  function useLocalFallback() {
    if (worker) worker.terminate();
    worker = null;
    pending.clear();
    localLab = DifferentialCore.createLab({ scene: activeScene, budget: sampleBudget });
  }

  function requestWorker(action, payload = {}) {
    if (!worker) {
      if (action === "reset") {
        localLab = DifferentialCore.createLab(payload);
        return Promise.resolve(DifferentialCore.snapshot(localLab));
      }
      if (action === "step") return Promise.resolve(DifferentialCore.stepLab(localLab, payload.count || 1));
      return Promise.resolve(DifferentialCore.snapshot(localLab));
    }
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, action, payload });
    });
  }

  function handleWorkerMessage(event) {
    const message = event.data || {};
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.snapshot);
  }

  function resetLab(startAfterReset = false) {
    running = false;
    stepInFlight = false;
    cancelAnimationFrame(animationFrame);
    updateControlState();
    if (els.diffStatusBadge) els.diffStatusBadge.textContent = "auditing estimators";
    requestWorker("reset", {
      scene: activeScene,
      budget: sampleBudget,
      seed: 0x5eeda11
    }).then((snapshot) => {
      latest = snapshot;
      running = startAfterReset;
      drawAll();
      updateRunState();
      if (running) schedule();
    }).catch(handleFailure);
  }

  function toggleRun() {
    if (latest && latest.lanes.every((lane) => lane.settled)) {
      resetLab(true);
      return;
    }
    running = !running;
    updateRunState();
    if (running) schedule();
  }

  function schedule() {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(tick);
  }

  function tick() {
    if (!running) return;
    if (!stepInFlight) {
      const burst = sampleBudget === 64 ? 4 : sampleBudget === 256 ? 3 : 1;
      requestStep(burst);
    }
    schedule();
  }

  function requestStep(count) {
    if (stepInFlight || !latest) return;
    stepInFlight = true;
    requestWorker("step", { count }).then((snapshot) => {
      latest = snapshot;
      stepInFlight = false;
      drawAll();
      if (latest.lanes.every((lane) => lane.settled)) {
        running = false;
        updateRunState();
      }
    }).catch(handleFailure);
  }

  function handleFailure(error) {
    running = false;
    stepInFlight = false;
    if (els.diffStatusBadge) els.diffStatusBadge.textContent = "estimator worker unavailable";
    console.error(error);
    if (worker) {
      useLocalFallback();
      resetLab();
    }
  }

  function updateControlState() {
    document.querySelectorAll("[data-diff-scene]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-diff-scene") === activeScene);
    });
    document.querySelectorAll("[data-diff-budget]").forEach((button) => {
      button.classList.toggle("active", Number(button.getAttribute("data-diff-budget")) === sampleBudget);
    });
  }

  function updateRunState() {
    if (!els.diffRunButton) return;
    const complete = latest && latest.lanes.every((lane) => lane.settled);
    els.diffRunButton.textContent = complete ? "Restart race" : running ? "Pause race" : "Run all backends";
    if (els.diffStatusBadge) {
      const iteration = latest ? Math.max(...latest.lanes.map((lane) => lane.iteration)) : 0;
      els.diffStatusBadge.textContent = complete
        ? `${iteration} steps, fixed budget complete`
        : running ? `running ${sampleBudget} samples / backend` : `ready at ${sampleBudget} samples`;
    }
  }

  function drawAll() {
    if (!latest) return;
    updateControlState();
    updateRunState();
    if (els.diffSceneCopy) els.diffSceneCopy.textContent = latest.sceneCopy;
    const lane = latest.lanes.find((item) => item.key === selectedBackend) || latest.lanes[0];
    drawSignal(lane);
    drawDerivative(lane);
    drawTransport(lane);
    drawRace();
    drawBackendCards();
    updateDetails(lane);
  }

  function prepareCanvas(canvas, fill = "#11151a") {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function drawGrid(ctx, width, height, left, top, right, bottom) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = top + (height - top - bottom) * i / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 8; i += 1) {
      const x = left + (width - left - right) * i / 8;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, height - bottom);
      ctx.stroke();
    }
  }

  function plotSeries(ctx, values, bounds, color, width = 2) {
    const { left, top, chartWidth, chartHeight, min, max } = bounds;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = left + chartWidth * index / Math.max(1, values.length - 1);
      const y = top + chartHeight * (max - value) / Math.max(1e-9, max - min);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawSignal(lane) {
    const canvas = els.diffSignalCanvas;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas);
    const left = 42;
    const right = 18;
    const top = 24;
    const bottom = 32;
    drawGrid(ctx, canvas.width, canvas.height, left, top, right, bottom);
    const values = latest.target.concat(lane.image);
    const max = Math.max(0.15, ...values) * 1.08;
    const bounds = {
      left,
      top,
      chartWidth: canvas.width - left - right,
      chartHeight: canvas.height - top - bottom,
      min: 0,
      max
    };
    ctx.fillStyle = "rgba(73,208,189,0.08)";
    ctx.beginPath();
    lane.image.forEach((value, index) => {
      const x = left + bounds.chartWidth * index / (lane.image.length - 1);
      const y = top + bounds.chartHeight * (max - value) / max;
      if (index === 0) ctx.moveTo(x, top + bounds.chartHeight);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(left + bounds.chartWidth, top + bounds.chartHeight);
    ctx.closePath();
    ctx.fill();
    plotSeries(ctx, latest.target, bounds, COLORS.target, 2.4);
    const backend = latest.backends.find((item) => item.key === lane.key);
    plotSeries(ctx, lane.image, bounds, backend.color, 2.2);
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(max.toFixed(2), 7, top + 4);
    ctx.fillText("receiver position", canvas.width - 118, canvas.height - 9);
    ctx.fillStyle = COLORS.target;
    ctx.fillText("target", left, 16);
    ctx.fillStyle = backend.color;
    ctx.fillText("current", left + 52, 16);
  }

  function drawDerivative(lane) {
    const canvas = els.diffGradientCanvas;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas);
    const left = 42;
    const right = 18;
    const top = 24;
    const bottom = 32;
    drawGrid(ctx, canvas.width, canvas.height, left, top, right, bottom);
    const magnitude = Math.max(
      1e-4,
      ...lane.exactDerivativeField.map(Math.abs),
      ...lane.derivativeField.map(Math.abs)
    );
    const bounds = {
      left,
      top,
      chartWidth: canvas.width - left - right,
      chartHeight: canvas.height - top - bottom,
      min: -magnitude,
      max: magnitude
    };
    const zeroY = top + bounds.chartHeight * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(canvas.width - right, zeroY);
    ctx.stroke();
    plotSeries(ctx, lane.exactDerivativeField, bounds, COLORS.target, 2.2);
    const backend = latest.backends.find((item) => item.key === lane.key);
    plotSeries(ctx, lane.derivativeField, bounds, backend.color, 2.1);
    ctx.fillStyle = COLORS.target;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("full dI/d shape", left, 16);
    ctx.fillStyle = backend.color;
    ctx.fillText("backend support", left + 112, 16);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("visibility impulse + smooth transport", canvas.width - 233, canvas.height - 9);
  }

  function drawTransport(lane) {
    const canvas = els.diffPathCanvas;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, "#0d1115");
    const width = canvas.width;
    const height = canvas.height;
    const light = { x: 70, y: 78 };
    const camera = { x: width - 64, y: 82 };
    const receiverY = height - 40;
    const edgeX = 170 + lane.last.edge * (width - 330);

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(44, receiverY);
    ctx.lineTo(width - 44, receiverY);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("diffuse receiver / image coordinate", 44, receiverY + 22);

    ctx.fillStyle = "#f0ba5d";
    ctx.beginPath();
    ctx.arc(light.x, light.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.fillText("area light", light.x - 24, light.y - 16);

    ctx.fillStyle = "#dbe6e2";
    ctx.fillRect(camera.x - 8, camera.y - 6, 16, 12);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("camera", camera.x - 22, camera.y - 16);

    ctx.fillStyle = "rgba(237,124,145,0.72)";
    ctx.fillRect(edgeX - 5, 120, 10, 82);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("moving blocker", edgeX - 42, 112);

    const backend = latest.backends.find((item) => item.key === lane.key);
    ctx.strokeStyle = backend.color + "88";
    ctx.lineWidth = 1;

    if (lane.key === "photon") {
      const lensX = 168;
      ctx.strokeStyle = "rgba(123,167,255,0.55)";
      ctx.beginPath();
      ctx.arc(lensX, 146, 25, -Math.PI * 0.48, Math.PI * 0.48);
      ctx.stroke();
      for (let i = 0; i < lane.last.photons.length; i += 1) {
        const position = lane.last.photons[i];
        const x = 44 + clamp01(position) * (width - 88);
        const lensY = 132 + (i % 7) * 4;
        ctx.strokeStyle = "rgba(237,124,145,0.16)";
        ctx.beginPath();
        ctx.moveTo(light.x, light.y);
        ctx.lineTo(lensX, lensY);
        ctx.lineTo(x, receiverY);
        ctx.stroke();
        ctx.fillStyle = "rgba(237,124,145,0.58)";
        ctx.fillRect(x - 1, receiverY - 2, 2, 4);
      }
    } else {
      for (let i = 0; i < lane.last.pathXs.length; i += 1) {
        const position = lane.last.pathXs[i];
        const x = 44 + position * (width - 88);
        const bounceY = receiverY;
        ctx.strokeStyle = backend.color + "24";
        ctx.beginPath();
        ctx.moveTo(camera.x, camera.y);
        ctx.lineTo(x, bounceY);
        ctx.lineTo(light.x, light.y);
        ctx.stroke();
      }
    }

    if (lane.key === "pathspace") {
      ctx.strokeStyle = "#49d0bd";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(camera.x, camera.y);
      ctx.lineTo(edgeX, 142);
      ctx.lineTo(light.x, light.y);
      ctx.stroke();
      ctx.fillStyle = "#49d0bd";
      ctx.beginPath();
      ctx.arc(edgeX, 142, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (lane.key === "warped") {
      for (const area of lane.last.areaXs) {
        const x = edgeX + area * Math.max(1, width - 44 - edgeX);
        ctx.fillStyle = "rgba(240,186,93,0.52)";
        ctx.fillRect(x - 1, 195 + Math.sin(area * Math.PI * 6) * 12, 2, 2);
      }
      ctx.strokeStyle = "rgba(240,186,93,0.7)";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(edgeX, 190);
      ctx.bezierCurveTo(edgeX + 70, 164, width - 140, 226, width - 45, 184);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = backend.color;
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.fillText(backend.label, 18, 24);
    ctx.fillStyle = COLORS.text;
    const pathCopy = lane.key === "photon"
      ? `${lane.last.photons.length} displayed photon merges; ${sampleBudget} differentiated photons`
      : lane.key === "pathspace"
        ? "attached camera paths + explicit silhouette path"
        : lane.key === "warped"
          ? "boundary converted to stratified area samples"
          : lane.key === "prb"
            ? "replayed attached paths; blocker edge intentionally detached"
            : "plus/minus primal scenes share the same deterministic signal";
    ctx.fillText(pathCopy, 18, 44);
  }

  function drawRace() {
    const canvas = els.diffRaceCanvas;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas);
    const left = 58;
    const right = 24;
    const top = 24;
    const bottom = 34;
    drawGrid(ctx, canvas.width, canvas.height, left, top, right, bottom);
    const allHistory = latest.lanes.flatMap((lane) => lane.history);
    const maxWork = Math.max(1, ...allHistory.map((sample) => sample.work));
    const maxLoss = Math.max(1e-5, ...allHistory.map((sample) => sample.loss));
    const minLoss = Math.max(1e-8, Math.min(...allHistory.map((sample) => sample.loss), maxLoss * 1e-4));
    const maxLog = Math.log10(maxLoss);
    const minLog = Math.log10(minLoss);
    for (const lane of latest.lanes) {
      const backend = latest.backends.find((item) => item.key === lane.key);
      ctx.strokeStyle = backend.color;
      ctx.lineWidth = lane.key === selectedBackend ? 3 : 1.8;
      ctx.beginPath();
      lane.history.forEach((sample, index) => {
        const x = left + (canvas.width - left - right) * sample.work / maxWork;
        const valueLog = Math.log10(Math.max(minLoss, sample.loss));
        const y = top + (canvas.height - top - bottom) * (maxLog - valueLog) / Math.max(1e-9, maxLog - minLog);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(maxLoss.toExponential(1), 7, top + 4);
    ctx.fillText(minLoss.toExponential(1), 7, canvas.height - bottom + 4);
    ctx.fillText("0", left, canvas.height - 10);
    const workLabel = formatWork(maxWork);
    ctx.fillText(workLabel, canvas.width - right - ctx.measureText(workLabel).width, canvas.height - 10);
    if (els.diffRaceAxis) els.diffRaceAxis.textContent = `photometric loss vs path-equivalent work, max ${formatWork(maxWork)}`;
  }

  function drawBackendCards() {
    const host = els.diffBackendCards;
    if (!host) return;
    host.innerHTML = "";
    for (const lane of latest.lanes) {
      const backend = latest.backends.find((item) => item.key === lane.key);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "diff-backend-card" + (lane.key === selectedBackend ? " active" : "");
      button.style.setProperty("--backend-color", backend.color);
      button.setAttribute("aria-pressed", lane.key === selectedBackend ? "true" : "false");
      button.innerHTML = `
        <span>${backend.short}</span>
        <strong>${lane.loss.toExponential(2)}</strong>
        <small>bias ${formatPercent(lane.audit.relativeBias)} / noise ${lane.audit.normalizedStdDev.toFixed(2)}x</small>
        <i>${lane.params[0].toFixed(3)} shape / ${lane.params[1].toFixed(3)} albedo</i>
      `;
      button.addEventListener("click", () => {
        selectedBackend = lane.key;
        drawAll();
      });
      host.appendChild(button);
    }
  }

  function updateDetails(lane) {
    const backend = latest.backends.find((item) => item.key === lane.key);
    const detail = BACKEND_DETAILS[lane.key];
    if (els.diffSelectedName) els.diffSelectedName.textContent = backend.label;
    if (els.diffSelectedClass) els.diffSelectedClass.textContent = backend.className;
    if (els.diffSupport) els.diffSupport.textContent = detail.support;
    if (els.diffUnbiased) els.diffUnbiased.textContent = detail.unbiased;
    if (els.diffMemory) els.diffMemory.textContent = detail.memory;
    if (els.diffBestUse) els.diffBestUse.textContent = detail.best;
    if (els.diffAuditBias) els.diffAuditBias.textContent = formatPercent(lane.audit.relativeBias);
    if (els.diffAuditVariance) els.diffAuditVariance.textContent = `${lane.audit.normalizedStdDev.toFixed(2)}x | ${lane.audit.repetitions} repeats`;
    if (els.diffAuditCosine) els.diffAuditCosine.textContent = lane.last.cosine.toFixed(3);
    if (els.diffAuditWork) els.diffAuditWork.textContent = formatWork(lane.work);
    if (els.diffTargetParams) {
      els.diffTargetParams.textContent = `shape ${latest.targetParams[0].toFixed(3)} | albedo ${latest.targetParams[1].toFixed(3)}`;
    }
    if (els.diffCurrentParams) {
      els.diffCurrentParams.textContent = `shape ${lane.params[0].toFixed(3)} | albedo ${lane.params[1].toFixed(3)}`;
    }
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "n/a";
    return `${Math.min(999, value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
  }

  function formatWork(value) {
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return String(Math.round(value));
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
