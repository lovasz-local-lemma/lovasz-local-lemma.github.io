(function initCodedDepthLab() {
  "use strict";

  const elements = {};
  const state = { active: false, worker: null, jobId: 0, selectionId: 0, running: false,
    result: null, resultKey: "", selected: 0, optics: null, fields: new Map() };
  const CONTROL_IDS = ["codedDepthMode", "codedDepthScene", "codedDepthTexture",
    "codedDepthResolution", "codedDepthAperture", "codedDepthNoise"];
  const PHOTOS = ["codedDepthSharpCanvas", "codedDepthCaptureCanvas", "codedDepthCaptureBCanvas",
    "codedDepthReconstructionCanvas"];
  const MAPS = ["codedDepthTruthCanvas", "codedDepthEstimateCanvas", "codedDepthConfidenceCanvas"];
  const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
  const apertureName = (key) => ({ coded: "coded", circular: "round", annulus: "annular" }[key] || key);

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    const panel = document.querySelector('[data-view-panel="aperture2d"]');
    const section = panel?.querySelector('[data-aperture2d-section="depth"]');
    if (!section) return;
    elements.panel = panel;
    elements.section = section;
    elements.statusBadge = panel.querySelector("#aperture2dStatusBadge");
    for (const node of section.querySelectorAll("[id]")) elements[node.id] = node;
    CONTROL_IDS.forEach((id) => elements[id]?.addEventListener("change", () => {
      cancel();
      state.result = null;
      state.resultKey = "";
      state.fields.clear();
      updateMode();
      clearOutputs("New capture settings");
      if (state.active) run();
    }));
    elements.codedDepthRunButton?.addEventListener("click", run);
    elements.codedDepthEstimateCanvas?.addEventListener("click", selectAtPointer);
    elements.codedDepthEstimateCanvas?.addEventListener("keydown", selectWithKeyboard);
    document.addEventListener("inverse-view-change", syncActivity);
    document.addEventListener("inverse-aperture-workspace", syncActivity);
    document.addEventListener("visibilitychange", syncActivity);
    updateMode();
    clearOutputs("Open this investigation to capture the target");
    syncActivity();
  }

  function settings() {
    return {
      mode: elements.codedDepthMode?.value || "single",
      scene: elements.codedDepthScene?.value || "terrace",
      texture: elements.codedDepthTexture?.value || "natural",
      size: Number(elements.codedDepthResolution?.value) || 256,
      aperture: elements.codedDepthAperture?.value || "coded",
      noiseSigma: Number(elements.codedDepthNoise?.value || .001)
    };
  }

  function syncActivity() {
    const active = elements.panel.classList.contains("active") && !elements.section.hidden && !document.hidden;
    state.active = active;
    if (!active) {
      if (state.running) status("Paused. Return to this investigation to run the capture.");
      cancel();
      return;
    }
    if (state.result && state.resultKey === JSON.stringify(settings())) {
      updateBusy();
      draw();
      if (!state.optics) requestSelection();
    } else if (!state.running) run();
  }

  function cancel() {
    state.worker?.terminate();
    state.worker = null;
    state.jobId += 1;
    state.selectionId += 1;
    state.running = false;
    updateBusy();
  }

  function worker() {
    if (state.worker) return state.worker;
    const instance = new Worker("coded-depth-worker.js?v=depth-1");
    state.worker = instance;
    instance.onmessage = (event) => {
      const message = event.data;
      if (instance !== state.worker || message.jobId !== state.jobId) return;
      if (message.type === "progress") status(message.message);
      if (message.type === "result") {
        state.running = false;
        state.result = message.result;
        state.resultKey = JSON.stringify(settings());
        state.selected = Math.min(5, message.result.patches.length - 1);
        state.optics = null;
        state.fields.clear();
        updateBusy();
        updateSummary();
        draw();
        requestSelection();
      }
      if (message.type === "selection" && message.selectionId === state.selectionId) {
        state.optics = message.optics;
        drawPsf();
      }
      if (message.type === "error") {
        if (message.selectionId != null && message.selectionId !== state.selectionId) return;
        state.running = false;
        updateBusy();
        status(`Could not finish: ${message.message}. You can retry the capture.`);
      }
    };
    instance.onerror = (event) => {
      if (instance !== state.worker) return;
      cancel();
      status(`Could not start the depth worker: ${event.message || "worker error"}. You can retry the capture.`);
    };
    return instance;
  }

  function run() {
    if (!state.active) return;
    cancel();
    state.running = true;
    state.result = null;
    state.optics = null;
    state.fields.clear();
    updateMode();
    updateBusy();
    clearOutputs("Capturing and testing distance hypotheses…");
    status("Preparing calibrated captures…");
    try { worker().postMessage({ type: "run", jobId: state.jobId, payload: settings() }); }
    catch (error) { cancel(); status(`Could not start the capture: ${error.message}`); }
  }

  function updateBusy() {
    elements.section?.setAttribute("aria-busy", String(state.running));
    if (state.active && elements.statusBadge) {
      elements.statusBadge.textContent = state.running ? "fitting depth" : state.result ? "depth recovered" : "depth camera";
    }
    if (elements.codedDepthRunButton) {
      elements.codedDepthRunButton.disabled = state.running;
      elements.codedDepthRunButton.textContent = state.running ? "Testing distances…" : "Capture & reconstruct depth";
    }
  }

  function status(text) { if (elements.codedDepthStatus) elements.codedDepthStatus.textContent = text; }
  function copy(id, text) { if (elements[id]) elements[id].textContent = text; }

  function updateMode() {
    const config = settings();
    elements.section.querySelectorAll("[data-coded-depth-pair]").forEach((figure) => { figure.hidden = config.mode !== "pair"; });
    caption("codedDepthCaptureCanvas", `Photograph A · ${apertureName(config.aperture)} aperture · focus 0.80 m`);
    caption("codedDepthCaptureBCanvas", "Photograph B · focus 1.45 m");
    copy("codedDepthPrior", config.mode === "pair"
      ? "Two focus settings observe the same unknown texture. Each candidate distance must explain both photographs; a weak image prior stabilizes the recovered sharp texture. Known focal length, focus settings, aperture and pixel pitch convert blur to distance."
      : "One photograph mixes unknown texture with unknown blur. This solver compares distances using a stationary 1/f² image-spectrum prior and estimates its strength from the observation. The target is known to lie beyond the first focus plane; the prior cannot itself resolve the near/far ambiguity. A flat or unfamiliar texture may not identify its distance.");
  }

  function caption(id, text) {
    const canvas = elements[id];
    const node = canvas?.closest("figure")?.querySelector("figcaption span");
    if (node) node.textContent = text;
    canvas?.setAttribute("aria-label", text);
  }

  function updateSummary() {
    const result = state.result;
    const { config, metrics } = result;
    const count = result.patches.length;
    const mae = Number.isFinite(metrics.depthMae) ? `${metrics.depthMae.toFixed(0)} mm mean absolute error on those cells` : "no distance error reported";
    copy("codedDepthResult", `${metrics.resolved} / ${count} cells have a reported distance · ${mae}. `
      + `${config.mode === "pair" ? "Two focus settings" : "Single-photo image prior"}; ${Math.round(result.transmission * 100)}% of the round aperture's light at the same exposure.`);
    copy("codedDepthScope", `Controlled calibration target: ${config.grid} × ${config.grid} independent planar cells, `
      + `${config.size / config.grid} × ${config.size / config.grid} sensor samples per cell. Blur wraps within each cell; it does not cross cell boundaries. `
      + `Each cell has one unknown distance between ${(result.depthMin / 1000).toFixed(2)} and ${(result.depthMax / 1000).toFixed(2)} m, tested every ${config.depthStep} mm. `
      + "This is a spatial map of 16 distances, not a dense reconstruction of curved surfaces. The flat control cell should stay unresolved. "
      + (config.texture === "structured" ? "Structured shading deliberately tests the limits of the image prior. " : "Broadband texture is a favorable case for the declared spectrum prior. ")
      + "Confidence measures score separation within this model, not a calibrated probability of correctness. Reference images and distances are used only for evaluation after fitting.");
    status(`${config.size} × ${config.size} capture complete. Click a depth cell to inspect the evidence.`);
    caption("codedDepthPsfCanvas", "Selected cell · fitted blur footprints");
  }

  function clearOutputs(message) {
    for (const id of [...PHOTOS, ...MAPS, "codedDepthMaskCanvas", "codedDepthPsfCanvas", "codedDepthLikelihoodCanvas"]) {
      placeholder(elements[id], message);
    }
    copy("codedDepthResult", "");
    copy("codedDepthSelection", "Choose a cell in the recovered distance map to inspect its score and blur footprint.");
  }

  function placeholder(canvas, text) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1115"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#9bb0b8"; ctx.font = `${Math.max(11, Math.min(17, canvas.width / 30))}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const line = canvas.width < 300 ? "Awaiting capture" : text;
    ctx.fillText(line, canvas.width / 2, canvas.height / 2, canvas.width - 28);
  }

  function colorDepth(value, min, max) {
    if (!Number.isFinite(value)) return [51, 60, 68];
    const t = clamp((value - min) / (max - min));
    const colors = [[239, 187, 117], [120, 215, 189], [105, 138, 228]];
    const index = t < .5 ? 0 : 1;
    const u = index === 0 ? t * 2 : t * 2 - 1;
    return colors[index].map((c, i) => Math.round(c * (1 - u) + colors[index + 1][i] * u));
  }

  function field(key, values, size, kind = "photo") {
    if (state.fields.has(key)) return state.fields.get(key);
    const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < values.length; i += 1) {
      let rgb;
      if (kind === "depth") rgb = colorDepth(values[i], state.result.depthMin, state.result.depthMax);
      else if (kind === "confidence") {
        const t = clamp(Number.isFinite(values[i]) ? values[i] : 0);
        rgb = [Math.round(36 + 91 * t), Math.round(47 + 172 * t), Math.round(57 + 141 * t)];
      } else {
        const linear = clamp(values[i]);
        const value = Math.round(255 * (kind === "mask" ? linear : linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055));
        rgb = [value, value, value];
      }
      const offset = i * 4;
      image.data[offset] = rgb[0]; image.data[offset + 1] = rgb[1]; image.data[offset + 2] = rgb[2]; image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    state.fields.set(key, canvas);
    return canvas;
  }

  function drawField(id, values, kind = "photo") {
    const canvas = elements[id]; if (!canvas || !values) return;
    const result = state.result;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = kind === "photo";
    ctx.drawImage(field(id, values, result.size, kind), 0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / result.size, scaleY = canvas.height / result.size;
    ctx.lineWidth = Math.max(1, canvas.width / 512);
    ctx.strokeStyle = "rgba(8,17,22,.7)";
    for (const patch of result.patches) {
      ctx.strokeRect(patch.x * scaleX, patch.y * scaleY, patch.width * scaleX, patch.height * scaleY);
      if (kind === "depth") {
        const value = id === "codedDepthTruthCanvas" ? patch.truthDepth : patch.depth;
        const text = Number.isFinite(value) ? `${(value / 1000).toFixed(2)} m` : "unresolved";
        ctx.font = `600 ${Math.max(11, canvas.width / 34)}px system-ui`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = canvas.width / 120;
        ctx.strokeStyle = "rgba(10,19,25,.88)";
        const x = (patch.x + patch.width / 2) * scaleX, y = (patch.y + patch.height / 2) * scaleY;
        ctx.strokeText(text, x, y); ctx.fillStyle = "#f6fbff"; ctx.fillText(text, x, y);
        ctx.lineWidth = Math.max(1, canvas.width / 512); ctx.strokeStyle = "rgba(8,17,22,.7)";
      }
    }
    const patch = result.patches[state.selected];
    if (patch) {
      ctx.lineWidth = canvas.width / 120; ctx.strokeStyle = "#fff3c6";
      ctx.strokeRect(patch.x * scaleX + 3, patch.y * scaleY + 3, patch.width * scaleX - 6, patch.height * scaleY - 6);
    }
  }

  function draw() {
    if (!state.result) return;
    const result = state.result;
    drawField(PHOTOS[0], result.sharp);
    drawField(PHOTOS[1], result.captures[0]);
    drawField(PHOTOS[2], result.captures[1]);
    drawField(PHOTOS[3], result.reconstruction);
    drawField(MAPS[0], result.truthDepth, "depth");
    drawField(MAPS[1], result.depth, "depth");
    drawField(MAPS[2], result.confidence, "confidence");
    const maskCanvas = elements.codedDepthMaskCanvas;
    if (maskCanvas) maskCanvas.getContext("2d").drawImage(field("mask", result.mask.values, result.mask.size, "mask"), 0, 0, maskCanvas.width, maskCanvas.height);
    updateSelectionCopy();
    drawScores();
    drawPsf();
  }

  function selectAtPointer(event) {
    if (!state.result) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - box.left) / box.width) * state.result.size;
    const y = clamp((event.clientY - box.top) / box.height) * state.result.size;
    const index = state.result.patches.findIndex((p) => x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height);
    if (index >= 0) select(index);
  }

  function selectWithKeyboard(event) {
    if (!state.result) return;
    const grid = state.result.config.grid;
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -grid, ArrowDown: grid };
    if (!(event.key in offsets) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if ((event.key === "ArrowLeft" && state.selected % grid === 0)
      || (event.key === "ArrowRight" && state.selected % grid === grid - 1)) return;
    const candidate = event.key === "Home" ? 0 : event.key === "End" ? state.result.patches.length - 1 : state.selected + offsets[event.key];
    if (candidate >= 0 && candidate < state.result.patches.length) select(candidate);
  }

  function select(index) {
    state.selected = index;
    state.optics = null;
    draw();
    requestSelection();
  }

  function requestSelection() {
    if (!state.result || !state.active) return;
    const patch = state.result.patches[state.selected];
    const depth = Number.isFinite(patch.depth) ? patch.depth : patch.bestDepth;
    state.selectionId += 1;
    try { worker().postMessage({ type: "selection", jobId: state.jobId, selectionId: state.selectionId,
      payload: { config: state.result.config, depth: patch.texturePoor ? NaN : depth } }); }
    catch (error) { placeholder(elements.codedDepthPsfCanvas, "Blur footprint unavailable"); }
  }

  function updateSelectionCopy() {
    const patch = state.result.patches[state.selected];
    const row = Math.floor(patch.y / patch.height) + 1, column = Math.floor(patch.x / patch.width) + 1;
    const reported = Number.isFinite(patch.depth) ? `${(patch.depth / 1000).toFixed(3)} m recovered` : "distance unresolved";
    const reason = patch.texturePoor ? "The flat cell contains too little texture to identify blur."
      : patch.atBoundary ? "The best hypothesis reaches the search boundary; treat it as limited by the search range."
      : patch.ambiguous ? "Competing distances fit nearly as well; no definite distance is reported."
      : "The best score is separated from distant competing hypotheses under the selected model.";
    copy("codedDepthSelection", `Cell ${row}, ${column} · ${reported} · reference ${(patch.truthDepth / 1000).toFixed(3)} m (evaluation only). ${reason}`);
  }

  function drawScores() {
    const canvas = elements.codedDepthLikelihoodCanvas;
    const patch = state.result?.patches[state.selected];
    if (!canvas || !patch) return;
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.fillStyle = "#0b1115"; ctx.fillRect(0, 0, w, h);
    const finite = Array.from(patch.scores).filter(Number.isFinite);
    if (!finite.length) { placeholder(canvas, "No finite score for this cell"); return; }
    const min = Math.min(...finite), max = Math.max(...finite);
    const x0 = 65, x1 = w - 28, y0 = 48, y1 = h - 48;
    const minDepth = patch.depths[0], maxDepth = patch.depths[patch.depths.length - 1];
    const px = (d) => x0 + (d - minDepth) / (maxDepth - minDepth) * (x1 - x0);
    const py = (score) => y1 - (score - min) / Math.max(max - min, 1e-14) * (y1 - y0);
    ctx.font = "15px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#bfccd2";
    ctx.fillText(state.result.config.mode === "pair" ? "Two-focus consistency score · minimum subtracted" : "Prior-conditioned score · minimum subtracted", x0, 25);
    ctx.strokeStyle = "#344149"; ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i += 1) {
      const y = y1 - i / 2 * (y1 - y0);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      const value = (max - min) * i / 2;
      ctx.fillStyle = "#8ea3af"; ctx.textAlign = "right"; ctx.fillText(value === 0 ? "0" : value.toExponential(1), x0 - 10, y + 5);
    }
    ctx.textAlign = "center";
    for (let i = 0; i <= 3; i += 1) {
      const d = minDepth + (maxDepth - minDepth) * i / 3;
      ctx.fillText(`${(d / 1000).toFixed(2)} m`, px(d), h - 17);
    }
    ctx.strokeStyle = "#78d7bd"; ctx.lineWidth = 3;
    ctx.beginPath();
    let pen = false;
    patch.scores.forEach((score, i) => {
      if (!Number.isFinite(score)) { pen = false; return; }
      if (pen) ctx.lineTo(px(patch.depths[i]), py(score)); else ctx.moveTo(px(patch.depths[i]), py(score));
      pen = true;
    });
    ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = "#e7b477";
    ctx.beginPath(); ctx.moveTo(px(patch.truthDepth), y0); ctx.lineTo(px(patch.truthDepth), y1); ctx.stroke();
    ctx.setLineDash([]);
    const bestIndex = Number.isInteger(patch.bestIndex) ? patch.bestIndex : Array.from(patch.scores).indexOf(min);
    ctx.fillStyle = "#f9edc6"; ctx.beginPath(); ctx.arc(px(patch.depths[bestIndex]), py(patch.scores[bestIndex]), 5, 0, 2 * Math.PI); ctx.fill();
    ctx.textAlign = "right"; ctx.fillStyle = "#e7b477"; ctx.fillText("dashed: reference", x1, 25);
  }

  function drawPsf() {
    const canvas = elements.codedDepthPsfCanvas;
    if (!canvas || !state.result) return;
    if (!state.optics) { placeholder(canvas, "Evaluating selected blur footprints…"); return; }
    if (!state.optics.psfs.length) { placeholder(canvas, "No identifiable blur for this flat cell"); return; }
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    ctx.fillStyle = "#0b1115"; ctx.fillRect(0, 0, w, h);
    const psfs = state.optics.psfs, span = w / psfs.length;
    const extent = Math.min(h - 44, span - 20);
    for (let i = 0; i < psfs.length; i += 1) {
      const psf = psfs[i];
      let max = 0;
      for (const value of psf.values) max = Math.max(max, value);
      const normalized = new Float32Array(psf.values.length);
      for (let p = 0; p < normalized.length; p += 1) normalized[p] = max ? psf.values[p] / max : 0;
      const key = `psf-${state.selectionId}-${i}`;
      // Retain only the current small PSF views; candidate browsing must not grow a cache.
      for (const old of state.fields.keys()) if (old.startsWith("psf-") && !old.startsWith(`psf-${state.selectionId}-`)) state.fields.delete(old);
      ctx.drawImage(field(key, normalized, psf.size, "mask"), i * span + (span - extent) / 2, 6, extent, extent);
      ctx.font = "12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#bacbd3";
      ctx.fillText(`Focus ${(psf.focusDepth / 1000).toFixed(2)} m · |blur| ${Math.abs(psf.blurPixels).toFixed(1)} px`, (i + .5) * span, h - 20);
    }
    ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#879ba7";
    const patch = state.result.patches[state.selected];
    ctx.fillText(`${Number.isFinite(patch.depth) ? "Fitted" : "Tentative best"} depth ${(state.optics.depth / 1000).toFixed(3)} m · ${state.optics.fieldOfView.toFixed(0)} px window · display intensity normalized`, w / 2, h - 5);
  }
})();
