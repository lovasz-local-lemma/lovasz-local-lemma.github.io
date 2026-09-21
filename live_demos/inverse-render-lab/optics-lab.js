(function initOpticsLab() {
  "use strict";

  const state = {
    active: false,
    worker: null,
    jobId: 0,
    experiment: "focuspair",
    running: false,
    progress: "",
    error: "",
    defocus: null,
    defocusPreview: null,
    focuspair: null,
    waterdrop: null
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    const panel = document.querySelector('[data-view-panel="optics"]');
    if (!panel) return;
    for (const node of panel.querySelectorAll("[id]")) elements[node.id] = node;
    state.active = panel.classList.contains("active");
    bindControls();
    reset();
    document.addEventListener("inverse-view-change", (event) => {
      state.active = event.detail?.view === "optics";
      if (!state.active) return;
      showExperiment();
      if (!experimentReady() && !state.running) run();
      else draw();
    });
    if (state.active) run();
  }

  function bindControls() {
    document.querySelectorAll("[data-optics-experiment]").forEach((button) => {
      button.addEventListener("click", () => {
        state.experiment = button.getAttribute("data-optics-experiment");
        state.error = "";
        if(state.running) {state.running=false;reset();}
        document.querySelectorAll("[data-optics-experiment]").forEach((node) => {
          node.classList.toggle("active", node === button);
          node.setAttribute("aria-pressed",String(node===button));
        });
        showExperiment();
        updateControls();
        if (!experimentReady() && !state.running) run();
        else draw();
      });
    });
    elements.opticsRunButton?.addEventListener("click", run);
    for(const id of ["opticsFocusScene","opticsFocusAperture","opticsFocusNoise","opticsFocusDepth"]) {
      elements[id]?.addEventListener("change",()=>{
        state.focuspair=null;
        if(state.experiment==="focuspair") run();
      });
    }
    elements.opticsFocusDepth?.addEventListener("input",updateFocusDepthLabel);
    for (const id of ["opticsDefocusScene", "opticsDefocusQuality"]) {
      elements[id]?.addEventListener("change", () => {
        state.defocusPreview = null;
        if (state.experiment === "defocus") run();
      });
    }
    updateFocusDepthLabel();
  }

  function showExperiment() {
    document.querySelectorAll("[data-optics-section]").forEach((node) => {
      node.hidden = node.getAttribute("data-optics-section") !== state.experiment;
    });
  }

  function reset() {
    state.running = false;
    state.progress = "";
    state.error = "";
    if (state.worker) {
      state.worker.onmessage = null;
      state.worker.onerror = null;
      state.worker.terminate();
    }
    if (typeof Worker === "undefined") {
      state.error = "Web Workers unavailable; these sweeps would freeze the page.";
      updateControls();
      return;
    }
    state.worker = new Worker("optics-worker.js?v=aperture-photo-5");
    const worker = state.worker;
    state.worker.onmessage = (event) => {
      if (state.worker !== worker) return;
      const data = event.data || {};
      if (data.jobId !== state.jobId) return;
      if (data.type === "progress") state.progress = data.message;
      if (data.type === "defocusPreview") state.defocusPreview = data;
      if (data.type === "error") {
        state.error = data.message;
        state.running = false;
      }
      if (data.type === "defocus" || data.type === "waterdrop" || data.type === "focuspair") {
        state[data.type] = data;
        state.error = "";
        state.running = false;
        state.progress = "";
      }
      updateControls();
      if (data.type === "defocus" || data.type === "defocusPreview" || data.type === "waterdrop" || data.type === "focuspair") draw();
    };
    state.worker.onerror = (event) => {
      if (state.worker !== worker) return;
      state.error = event.message || "optics worker failed";
      state.running = false;
      updateControls();
    };
    updateControls();
  }

  function run() {
    if (!state.worker) return;
    if(state.running) reset();
    state.running = true;
    state.progress = "";
    state.error = "";
    state.jobId += 1;
    if (state.experiment === "defocus") {
      state.defocusPreview = null;
      drawDefocusPhotographs();
    }
    state.worker.postMessage({
      type: state.experiment,
      jobId: state.jobId,
      // 8 trials, matching defocus-core-test.js exactly. The panel quotes specific accuracies
      // in its prose, so it must not run a different sample size from the test those numbers
      // came from -- a table that disagrees with the paragraph beside it is worse than either.
      payload: state.experiment === "focuspair" ? {
        scene:elements.opticsFocusScene?.value||"stilllife",
        aperture:elements.opticsFocusAperture?.value||"circular",
        distance:Number(elements.opticsFocusDepth?.value)||1260,
        noiseSigma:Number(elements.opticsFocusNoise?.value)||.006
      } : state.experiment === "defocus" ? {
        trials: 8,
        scene: elements.opticsDefocusScene?.value || "stilllife",
        previewSize: Number(elements.opticsDefocusQuality?.value) === 512 ? 512 : 256,
        reuseStatistics: Boolean(state.defocus)
      } : { pixelsPerDrop: 96 }
    });
    updateControls();
  }

  function updateControls() {
    if (elements.opticsStatusBadge) {
      elements.opticsStatusBadge.textContent =
        state.error || (state.running ? (state.progress || "solving") : "idle");
    }
    if (elements.opticsRunButton) elements.opticsRunButton.disabled = state.running;
    if(elements.opticsRunButton) elements.opticsRunButton.textContent=
      state.experiment==="focuspair"?"Capture & fit distance":"Re-run comparison";
    renderDefocusTables();
    renderWaterdropTables();
  }

  // ---------------------------------------------------------------------------------------
  // Shared drawing
  // ---------------------------------------------------------------------------------------

  function drawField(canvas, field, size, gamma) {
    if (!canvas || !field) return;
    const context = canvas.getContext("2d");
    const buffer = document.createElement("canvas");
    buffer.width = size;
    buffer.height = size;
    const image = buffer.getContext("2d").createImageData(size, size);
    let peak = 0;
    for (const value of field) peak = Math.max(peak, value);
    const scale = peak > 0 ? 1 / peak : 1;
    const power = gamma || 1;
    for (let i = 0; i < size * size; i += 1) {
      const t = Math.pow(Math.max(0, field[i] * scale), power);
      image.data[i * 4] = Math.round(255 * Math.min(1, t * 1.3));
      image.data[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, t * 1.1 - 0.05)));
      image.data[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, t * 0.85 - 0.1)));
      image.data[i * 4 + 3] = 255;
    }
    buffer.getContext("2d").putImageData(image, 0, 0);
    context.imageSmoothingEnabled = size >= 128;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  function clearCanvas(canvas) {
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    context.fillStyle = "#0c1115";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return context;
  }

  // ---------------------------------------------------------------------------------------
  // Defocus
  // ---------------------------------------------------------------------------------------

  const APERTURE_COLORS = { circular: "#f0ba5d", coded: "#7ad6ff", annulus: "#9be08a" };

  function updateFocusDepthLabel() {
    if(elements.opticsFocusDepthValue) elements.opticsFocusDepthValue.textContent=
      `${(Number(elements.opticsFocusDepth?.value||1260)/1000).toFixed(2)} m`;
  }

  function drawPhotograph(canvas,field,size) {
    if(!canvas||!field) return;
    const buffer=document.createElement("canvas");buffer.width=size;buffer.height=size;
    const context=buffer.getContext("2d"),image=context.createImageData(size,size);
    for(let i=0;i<field.length;i+=1) {
      // One fixed linear-to-display transform for every photograph. In particular, coded
      // capture stays dimmer: per-image normalization would hide its lost-light penalty.
      const v=Math.round(255*Math.pow(Math.max(0,Math.min(1,field[i])),1/2.2));
      image.data[i*4]=v;image.data[i*4+1]=v;image.data[i*4+2]=v;image.data[i*4+3]=255;
    }
    context.putImageData(image,0,0);
    const destination=canvas.getContext("2d");
    destination.imageSmoothingEnabled=true;destination.imageSmoothingQuality="high";
    destination.clearRect(0,0,canvas.width,canvas.height);
    destination.drawImage(buffer,0,0,canvas.width,canvas.height);
  }

  function drawFocusPair() {
    const data=state.focuspair;if(!data) return;
    drawPhotograph(elements.opticsFocusTruthCanvas,data.target,data.size);
    drawPhotograph(elements.opticsFocusNearCanvas,data.observations[0],data.size);
    drawPhotograph(elements.opticsFocusFarCanvas,data.observations[1],data.size);
    drawPhotograph(elements.opticsFocusEstimateCanvas,data.reconstruction,data.size);
    const labels={
      opticsFocusTruthBadge:`reference · ${(data.trueDistance/1000).toFixed(2)} m`,
      opticsFocusNearBadge:`focus ${(data.focusDepths[0]/1000).toFixed(2)} m · blur ${data.blurDiameters[0].toFixed(1)} px`,
      opticsFocusFarBadge:`focus ${(data.focusDepths[1]/1000).toFixed(2)} m · blur ${data.blurDiameters[1].toFixed(1)} px`,
      opticsFocusEstimateBadge:data.ambiguous?"distance unresolved":`fit · ${(data.distance/1000).toFixed(2)} m`
    };
    for(const [id,text] of Object.entries(labels)) if(elements[id]) elements[id].textContent=text;
    if(elements.opticsFocusResult) elements.opticsFocusResult.textContent=data.ambiguous
      ? "These captures do not distinguish the tested distances. A flat target carries no defocus cue."
      : `Recovered ${(data.distance/1000).toFixed(2)} m from two photographs; reference ${(data.trueDistance/1000).toFixed(2)} m. `
        +`Distance error ${Math.abs(data.distance-data.trueDistance).toFixed(0)} mm on a ${data.depthStep} mm search grid. `
        +`Image RMSE ${data.imageRmse.toFixed(3)} in linear intensity.`
        +(data.atBoundary?" The best fit touches the search boundary; a wider interval may be needed.":"");
    if(elements.opticsFocusScope) elements.opticsFocusScope.textContent=
      `Two registered captures at calibrated focus settings, one stationary planar target, ${data.size} × ${data.size} sensor samples. `
      +`${Math.round(data.transmission*100)}% aperture transmission at equal exposure; sensor noise σ = ${data.noiseSigma}. `
      +"The sharp reference is used only for capture and evaluation. The fit sees the two measurement arrays and lens calibration. "
      +"This recovers the distance of a rendered target, not the varying surface depths pictured on it; no 3D depth map is claimed.";
    const canvas=elements.opticsFocusScoreCanvas,ctx=clearCanvas(canvas);if(!ctx) return;
    const left=54,right=canvas.width-24,top=42,bottom=canvas.height-40;
    const minimum=Math.min(...data.scores),range=Math.max(1e-6,Math.log1p(Math.max(...data.scores)-minimum));
    const toX=(distance)=>left+(right-left)*(distance-data.distances[0])/(data.distances[data.distances.length-1]-data.distances[0]);
    const toY=(score)=>bottom-(bottom-top)*Math.log1p(Math.max(0,score-minimum))/range;
    ctx.font="12px Inter, system-ui, sans-serif";ctx.fillStyle="#aebbb7";
    ctx.fillText("Shared-image mismatch · lower is better (log scale above minimum)",left,22);
    ctx.strokeStyle="rgba(170,190,180,.14)";ctx.lineWidth=1;
    for(let distance=900;distance<=1800;distance+=150) {
      const x=toX(distance);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
      ctx.fillText(`${(distance/1000).toFixed(2)} m`,x-18,bottom+24);
    }
    ctx.setLineDash([4,5]);ctx.strokeStyle="#b7c2bd";ctx.beginPath();ctx.moveTo(toX(data.trueDistance),top);ctx.lineTo(toX(data.trueDistance),bottom);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle=APERTURE_COLORS[data.aperture];ctx.lineWidth=2.5;ctx.beginPath();
    data.scores.forEach((score,index)=>{const x=toX(data.distances[index]),y=toY(score);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    ctx.fillStyle=APERTURE_COLORS[data.aperture];ctx.beginPath();ctx.arc(toX(data.distance),toY(data.scores[data.bestIndex]),5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#aebbb7";ctx.fillText("dashed: reference distance · dot: measured minimum",left,canvas.height-7);
  }

  function renderDefocusTables() {
    const data = state.defocus;
    if (elements.opticsScaleTable) {
      elements.opticsScaleTable.innerHTML = data
        ? data.scale.map((row) => `<tr>
            <td>${row.matchPhotons ? "matched photons" : "matched noise"}</td>
            <td>${row.noiseSigma}</td>
            ${data.apertureKeys.map((k) => `<td${k === "circular" ? " class=\"lead-cell\"" : ""}>${row.byAperture[k].toFixed(3)}</td>`).join("")}
          </tr>`).join("")
        : '<tr><td colspan="5">solving</td></tr>';
    }
    if (elements.opticsSignTable) {
      elements.opticsSignTable.innerHTML = data
        ? data.sign.map((cell) => `<tr>
            <td>${cell.sceneKind}</td>
            <td>${cell.scorer}</td>
            ${data.apertureKeys.map((k) => `<td>${cell.byAperture[k].toFixed(3)}</td>`).join("")}
          </tr>`).join("")
        : '<tr><td colspan="5">solving</td></tr>';
    }
    if (elements.opticsTransmissionNote && data) {
      const parts = data.apertureKeys.map((k) =>
        `${data.apertureLabels[k]} ${(100 * data.transmission[k]).toFixed(0)}% open`
        + `${data.symmetric[k] ? ", centrally symmetric" : ", asymmetric"}`);
      elements.opticsTransmissionNote.textContent = parts.join(" · ");
    }
  }

  function drawDefocus() {
    drawDefocusPhotographs();
    const data = state.defocus;
    if (!data) return;
    for (const key of data.apertureKeys) {
      drawField(elements[`opticsMask${cap(key)}Canvas`], data.masks[key], data.maskSize);
      // Gamma-compress the PSF so the mask structure is visible rather than only its peak.
      drawField(elements[`opticsPsf${cap(key)}Canvas`], data.psfs[key], data.psfSize, 0.5);
    }

    const canvas = elements.opticsTransferCanvas;
    const context = clearCanvas(canvas);
    if (!context) return;
    const left = 36;
    const right = canvas.width - 12;
    const top = 16;
    const bottom = canvas.height - 24;
    const floor = 1e-4;
    const toY = (value) => {
      const t = Math.log10(Math.max(floor, value)) / Math.log10(floor);
      return top + (bottom - top) * Math.max(0, Math.min(1, t));
    };
    for (const key of data.apertureKeys) {
      const profile = data.transfer[key];
      context.strokeStyle = APERTURE_COLORS[key] || "#ccc";
      context.lineWidth = 1.6;
      context.beginPath();
      profile.forEach((value, index) => {
        const x = left + (right - left) * index / Math.max(1, profile.length - 1);
        const y = toY(value / Math.max(1e-12, profile[0]));
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.fillStyle = "#9eaaa7";
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText(`modulation transfer at blur ${data.showBlur} px, log`, left + 4, top + 10);
    let legendX = left + 4;
    for (const key of data.apertureKeys) {
      context.fillStyle = APERTURE_COLORS[key];
      context.fillText(key, legendX, bottom + 16);
      legendX += context.measureText(key).width + 12;
    }
  }

  function experimentReady() {
    if (state.experiment !== "defocus") return Boolean(state[state.experiment]);
    return Boolean(state.defocus && state.defocusPreview
      && Object.keys(state.defocusPreview.lanes).length === 3);
  }

  function drawDefocusPhotographs() {
    const data = state.defocusPreview;
    const keys = ["circular", "coded", "annulus"];
    if (!data) {
      clearCanvas(elements.opticsDefocusTruthCanvas);
      for (const key of keys) {
        clearCanvas(elements[`opticsCapture${cap(key)}Canvas`]);
        clearCanvas(elements[`opticsRecovery${cap(key)}Canvas`]);
        const badge = elements[`opticsDefocus${cap(key)}Badge`];
        if (badge) badge.textContent = "waiting for measurements";
      }
      if (elements.opticsDefocusResult) elements.opticsDefocusResult.textContent = "Rendering the scene, then capturing and recovering each aperture…";
      return;
    }
    drawPhotograph(elements.opticsDefocusTruthCanvas, data.target, data.size);
    for (const key of keys) {
      const lane = data.lanes[key];
      if (!lane) continue;
      drawPhotograph(elements[`opticsCapture${cap(key)}Canvas`], lane.capture, data.size);
      drawPhotograph(elements[`opticsRecovery${cap(key)}Canvas`], lane.reconstruction, data.size);
      const badge = elements[`opticsDefocus${cap(key)}Badge`];
      if (badge) badge.textContent = (lane.ambiguous ? "distance unresolved" : `fit ${(lane.distance / 1000).toFixed(2)} m`)
        + ` · ${Math.round(lane.transmission * 100)}% light · image RMSE ${lane.imageRmse.toFixed(3)}`;
    }
    const finished = Object.keys(data.lanes).length;
    if (elements.opticsDefocusResult) elements.opticsDefocusResult.textContent = finished === 3
      ? `One ${data.scene === "botanical" ? "botanical study" : "ceramic still life"}, three apertures. Compare their measured blur, lost light and recovered detail at ${data.size} × ${data.size} sensor samples. Reference distance: ${(data.trueDistance / 1000).toFixed(2)} m.`
      : `${finished} / 3 aperture captures recovered · ${data.size} × ${data.size} simulated sensor samples. The remaining lanes appear as their solves finish.`;
    if (elements.opticsDefocusScope) elements.opticsDefocusScope.textContent =
      `Each recovery uses two registered captures at ${(data.focusDepths[0] / 1000).toFixed(2)} m and ${(data.focusDepths[1] / 1000).toFixed(2)} m focus, with identical exposure and sensor noise σ = ${data.noiseSigma}. The first capture is shown. `
      + `The fit receives only the two measurement arrays and calibrated lens settings; the sharp image is used for simulation and RMSE evaluation. `
      + `The ${data.depthStep} mm search estimates one target-plane distance, not the pictured objects’ individual depths. `
      + "All photographs share one display transform; no per-image normalization or added sharpening hides the coded mask’s light loss. "
      + "The compact aperture/blur tiles are supersampled optical illustrations. The statistical tables below retain their separate 64² synthetic-image benchmark.";
  }

  // ---------------------------------------------------------------------------------------
  // Waterdrop
  // ---------------------------------------------------------------------------------------

  function renderWaterdropTables() {
    const data = state.waterdrop;
    if (elements.opticsLedgerTable) {
      elements.opticsLedgerTable.innerHTML = data
        ? data.ledger.map((row) => `<tr>
            <td>${row.pixelsPerDrop}</td>
            <td>${(100 * row.relativeDepthError).toFixed(1)}%</td>
          </tr>`).join("")
        : '<tr><td colspan="2">solving</td></tr>';
    }
    if (elements.opticsSensitivityTable) {
      elements.opticsSensitivityTable.innerHTML = data
        ? data.sensitivity.map((row) => `<tr>
            <td>${(100 * row.relativeShapeError).toFixed(1)}%</td>
            <td>${(100 * row.relativeDepthError).toFixed(1)}%</td>
            <td><strong>${row.amplification.toFixed(1)}&times;</strong></td>
          </tr>`).join("")
        : '<tr><td colspan="3">solving</td></tr>';
    }
    if (elements.opticsBudgetNote && data && data.budgets.length) {
      const b = data.budgets[0];
      elements.opticsBudgetNote.textContent =
        `One drop maps ${b.worldFieldOfView.toFixed(0)} degrees of world onto the `
        + `${b.sensorFieldOfView.toFixed(2)} degrees of sensor it covers - `
        + `${b.angularCompression.toFixed(0)}x angular compression. `
        + `${b.usableSamples} of ${b.totalSamples} samples survive total internal reflection at the rim. `
        + `That compression is the whole trade: a wide view nobody installed, at `
        + `${b.worldDegreesPerSample.toFixed(2)} degrees of world per sensor sample against the bare `
        + `camera's ${b.directDegreesPerSample.toFixed(4)}.`;
    }
  }

  function drawWaterdrop() {
    const data = state.waterdrop;
    const canvas = elements.opticsDropCanvas;
    const context = clearCanvas(canvas);
    if (!context || !data) return;

    // World millimetres to canvas pixels. The drop is about 3 mm wide and the rays run out
    // hundreds of millimetres, so the view is deliberately anisotropic and says so.
    const spanX = 26;
    const spanY = 18;
    const toX = (x) => canvas.width * 0.28 - (x / spanX) * canvas.width * 0.62;
    const toY = (y) => canvas.height * 0.5 - (y / spanY) * canvas.height * 0.44;

    // The window.
    context.strokeStyle = "rgba(160, 190, 205, 0.55)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(toX(0), 6);
    context.lineTo(toX(0), canvas.height - 6);
    context.stroke();

    // Exit rays.
    const usable = data.rays.filter(Boolean);
    for (const ray of usable) {
      const far = 240;
      context.strokeStyle = "rgba(122, 214, 255, 0.35)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(toX(ray.origin.x), toY(ray.origin.y));
      context.lineTo(toX(ray.origin.x + ray.direction.x * far), toY(ray.origin.y + ray.direction.y * far));
      context.stroke();
    }

    // The drop cap. Sweeping the angle off the apex is exact and needs no clipping: at phi = 0
    // the point is the apex at x = -height, and at phi = acos(centre/radius) it is exactly where
    // the sphere meets the glass.
    const drop = data.drops[0];
    const phiMax = Math.acos(Math.min(1, Math.max(-1, data.capCentreX / data.shape.radius)));
    context.strokeStyle = "#f0ba5d";
    context.lineWidth = 2;
    context.beginPath();
    for (let i = 0; i <= 96; i += 1) {
      const phi = -phiMax + 2 * phiMax * i / 96;
      const px = data.capCentreX - data.shape.radius * Math.cos(phi);
      const py = drop + data.shape.radius * Math.sin(phi);
      const cx = toX(px);
      const cy = toY(py);
      if (i === 0) context.moveTo(cx, cy); else context.lineTo(cx, cy);
    }
    context.stroke();

    context.fillStyle = "#9eaaa7";
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText("window", toX(0) + 6, 18);
    context.fillText("camera side →", toX(0) + 6, canvas.height - 10);
    context.fillStyle = "#f0ba5d";
    context.fillText(`drop, ${data.shape.radius} mm cap`, toX(-2.4), toY(drop + 3.4));
    context.fillStyle = "#7ad6ff";
    context.fillText(`${usable.length} exit rays`, 12, canvas.height - 10);
    context.fillStyle = "#6a7b82";
    context.fillText("axes are not to the same scale", canvas.width - 168, canvas.height - 10);
  }

  function draw() {
    if (!state.active) return;
    if (state.experiment === "focuspair") drawFocusPair();
    else if (state.experiment === "defocus") drawDefocus();
    else drawWaterdrop();
  }

  function cap(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
})();
