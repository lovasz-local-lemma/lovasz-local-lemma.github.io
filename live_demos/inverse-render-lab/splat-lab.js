(function initSplatLab() {
  "use strict";

  const state = {
    active: false,
    running: false,
    worker: null,
    jobId: 0,
    snapshot: null,
    targetRgba: null,
    relight: null,
    showOverlay: true,
    resolution: 96,
    maxSplats: 400,
    error: ""
  };

  const elements = {};
  const elementIds = [
    "splatTargetCanvas", "splatCurrentCanvas", "splatResidualCanvas", "splatHistoryCanvas",
    "splatRelitTruthCanvas", "splatRelitRecoveryCanvas",
    "splatRunButton", "splatStepButton", "splatResetButton", "splatOverlayButton", "splatRelightButton",
    "splatCountBadge", "splatLossBadge", "splatDensifyBadge", "splatStatusBadge", "splatRelightNote"
  ];

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    const panel = document.querySelector('[data-view-panel="splat"]');
    if (!panel) return;
    for (const id of elementIds) elements[id] = document.getElementById(id);
    state.active = panel.classList.contains("active");
    bindControls();
    reset();
    document.addEventListener("inverse-view-change", (event) => {
      state.active = event.detail?.view === "splat";
      // A CPU splat fit is expensive; do not keep it running against a panel nobody is looking
      // at, which is the same discipline the other workspaces use.
      if (!state.active) state.running = false;
      updateControls();
      if (state.active) draw();
    });
  }

  function bindControls() {
    elements.splatRunButton?.addEventListener("click", () => {
      state.running = !state.running;
      updateControls();
      if (state.running) pump();
    });
    elements.splatStepButton?.addEventListener("click", () => step(5));
    elements.splatResetButton?.addEventListener("click", reset);
    elements.splatOverlayButton?.addEventListener("click", () => {
      state.showOverlay = !state.showOverlay;
      updateControls();
      draw();
    });
    elements.splatRelightButton?.addEventListener("click", requestRelight);
    document.querySelectorAll("[data-splat-max]").forEach((button) => {
      button.addEventListener("click", () => {
        state.maxSplats = Number(button.getAttribute("data-splat-max")) || 400;
        reset();
      });
    });
  }

  function reset() {
    state.running = false;
    state.snapshot = null;
    state.relight = null;
    state.error = "";
    if (state.worker) state.worker.terminate();
    if (typeof Worker === "undefined") {
      state.error = "Web Workers unavailable; a CPU splat fit would freeze the page.";
      updateControls();
      return;
    }
    state.worker = new Worker("splat-worker.js?v=splat-1");
    state.worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "error") {
        state.error = data.message;
        state.running = false;
      }
      if (data.type === "init") {
        state.targetRgba = data.targetRgba;
        state.snapshot = data.snapshot;
      }
      if (data.type === "snapshot") {
        state.snapshot = data.snapshot;
        if (state.running) pump();
      }
      if (data.type === "relight") state.relight = data;
      updateControls();
      draw();
    };
    state.worker.onerror = () => {
      state.error = "splat worker failed";
      state.running = false;
      updateControls();
    };
    state.jobId += 1;
    state.worker.postMessage({
      type: "init",
      jobId: state.jobId,
      payload: { resolution: state.resolution, maxSplats: state.maxSplats, initialSplats: 8 }
    });
    updateControls();
  }

  function step(count) {
    if (!state.worker) return;
    state.worker.postMessage({ type: "step", jobId: state.jobId, payload: { count } });
  }

  function pump() {
    if (!state.running || !state.active) return;
    step(2);
  }

  function requestRelight() {
    if (!state.worker) return;
    state.worker.postMessage({ type: "relight", jobId: state.jobId, payload: { lightAngle: -0.7 } });
  }

  function updateControls() {
    if (elements.splatRunButton) elements.splatRunButton.textContent = state.running ? "Pause fit" : "Run fit";
    if (elements.splatOverlayButton) {
      elements.splatOverlayButton.classList.toggle("active", state.showOverlay);
      elements.splatOverlayButton.textContent = state.showOverlay ? "Hide splats" : "Show splats";
    }
    const snapshot = state.snapshot;
    if (elements.splatCountBadge) {
      elements.splatCountBadge.textContent = snapshot ? `${snapshot.count} splats` : "initializing";
    }
    if (elements.splatLossBadge) {
      elements.splatLossBadge.textContent = snapshot
        ? `loss ${snapshot.loss.toExponential(2)} @ iter ${snapshot.iteration}` : "pending";
    }
    if (elements.splatDensifyBadge) {
      const d = snapshot?.lastDensify;
      elements.splatDensifyBadge.textContent = d
        ? `last pass: ${d.cloned} cloned, ${d.split} split, ${d.pruned} pruned (${d.before} to ${d.after})`
        : "no densify pass yet";
    }
    if (elements.splatStatusBadge) {
      elements.splatStatusBadge.textContent = state.error || (state.running ? "fitting" : "idle");
    }
    if (elements.splatRelightNote && state.relight) {
      const ratio = state.relight.relitRmse / Math.max(1e-9, state.relight.trainRmse);
      elements.splatRelightNote.textContent =
        `Fitted-view RMSE ${state.relight.trainRmse.toFixed(4)}, same recovery against a relit truth `
        + `${state.relight.relitRmse.toFixed(4)} - ${ratio.toFixed(1)}x worse. The recovery does not change at `
        + `all, because a splat carries a colour and no notion of a light: whatever shading was present when it `
        + `was fitted is now baked into per-splat colour. This is the limitation SuGaR, 2D Gaussian Splatting `
        + `and GS-IR exist to address; this lane shows the failure rather than fixing it.`;
    }
  }

  function drawRgba(canvas, rgba, width, height, overlaySplats) {
    if (!canvas || !rgba) return;
    const context = canvas.getContext("2d");
    const image = new ImageData(new Uint8ClampedArray(rgba), width, height);
    // Off-screen then scaled up, so the splat overlay is drawn in canvas space rather than
    // being resampled along with the image.
    const buffer = document.createElement("canvas");
    buffer.width = width;
    buffer.height = height;
    buffer.getContext("2d").putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(buffer, 0, 0, canvas.width, canvas.height);

    if (!overlaySplats) return;
    context.save();
    context.strokeStyle = "rgba(122, 214, 255, 0.5)";
    context.lineWidth = 1;
    for (let index = 0; index < overlaySplats.length; index += 6) {
      const x = (overlaySplats[index] * 0.5 + 0.5) * canvas.width;
      const y = (overlaySplats[index + 1] * 0.5 + 0.5) * canvas.height;
      const sx = overlaySplats[index + 2] * 0.5 * canvas.width;
      const sy = overlaySplats[index + 3] * 0.5 * canvas.height;
      const theta = overlaySplats[index + 4];
      const opacity = overlaySplats[index + 5];
      context.globalAlpha = 0.18 + opacity * 0.5;
      context.beginPath();
      context.ellipse(x, y, Math.max(0.6, sx), Math.max(0.6, sy), theta, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  function drawHistory() {
    const canvas = elements.splatHistoryCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = "#0c1115";
    context.fillRect(0, 0, width, height);
    const history = state.snapshot?.history || [];
    if (history.length < 2) return;
    const losses = history.map((entry) => Math.max(1e-8, entry.loss));
    const maxLoss = Math.max(...losses);
    const minLoss = Math.min(...losses);
    const maxCount = Math.max(...history.map((entry) => entry.splats));
    const toX = (index) => 30 + (width - 44) * index / (history.length - 1);
    const toYLoss = (value) => {
      const t = (Math.log(value) - Math.log(minLoss)) / Math.max(1e-9, Math.log(maxLoss) - Math.log(minLoss));
      return height - 20 - (height - 34) * (1 - t);
    };
    const toYCount = (value) => height - 20 - (height - 34) * (value / Math.max(1, maxCount));

    // Splat count first, so the loss curve reads on top of it.
    context.strokeStyle = "#7ad6ff";
    context.lineWidth = 1.4;
    context.beginPath();
    history.forEach((entry, index) => {
      const x = toX(index);
      const y = toYCount(entry.splats);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();

    context.strokeStyle = "#f0ba5d";
    context.lineWidth = 1.8;
    context.beginPath();
    history.forEach((entry, index) => {
      const x = toX(index);
      const y = toYLoss(Math.max(1e-8, entry.loss));
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();

    context.fillStyle = "#9eaaa7";
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText("loss (log)", 32, 14);
    context.fillStyle = "#7ad6ff";
    context.fillText(`splats (max ${maxCount})`, 92, 14);
  }

  function draw() {
    if (!state.active) return;
    const snapshot = state.snapshot;
    if (state.targetRgba && snapshot) {
      drawRgba(elements.splatTargetCanvas, state.targetRgba, snapshot.width, snapshot.height, null);
      drawRgba(elements.splatCurrentCanvas, snapshot.rgba, snapshot.width, snapshot.height,
        state.showOverlay ? snapshot.splats : null);
      drawRgba(elements.splatResidualCanvas, snapshot.residual, snapshot.width, snapshot.height, null);
    }
    if (state.relight) {
      drawRgba(elements.splatRelitTruthCanvas, state.relight.relitTruth, state.relight.width, state.relight.height, null);
      drawRgba(elements.splatRelitRecoveryCanvas, state.relight.recovery, state.relight.width, state.relight.height, null);
    }
    drawHistory();
  }
})();
