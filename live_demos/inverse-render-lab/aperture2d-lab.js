(function initAperture2dLab() {
  "use strict";

  const state = {
    active: false,
    worker: null,
    jobId: 0,
    running: false,
    scene: "stackedPair",
    noise: 0.002,
    workspace: "image",
    imageResult: null,
    result: null,
    progress: "",
    error: ""
  };

  const APERTURES = ["none", "edge", "twoEdge", "occluder", "mask"];

  const SCENE_NOTES = {
    stilllife:
      "A shaded sphere and ceramic vase, represented as 16 × 16 angular radiance samples. "
      + "The display interpolates those samples; the solve does not acquire extra detail or metric distance. "
      + "Compare which apertures retain the vase silhouette, then use Focus-pair distance in Optics to recover a calibrated target distance.",
    stackedPair:
      "Two blobs at the same azimuth, different elevation. Built to expose the single edge: it "
      + "cannot separate them with any number of photons, because elevation differences sit "
      + "exactly in its null space.",
    columns:
      "Vertical stripes, uniform in elevation. This is the edge's own subspace, and it does "
      + "about as well as the best aperture here. The claim is that it is blind along one axis, "
      + "not that it is a poor operator.",
    bar:
      "A narrow horizontal stripe. Counterintuitively this is the edge's WORST scene: its range "
      + "is the full-height cos(phi) profile, so its only possible answer is a floor-to-ceiling "
      + "smear, and a narrow stripe is close to orthogonal to that. Being constant along the "
      + "blind axis is not the same as being concentrated on it.",
    diagonalPair:
      "Two blobs separated along both axes at once, so azimuth alone gets part of the way."
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", start);

  function start() {
    const panel = document.querySelector('[data-view-panel="aperture2d"]');
    if (!panel) return;
    for (const node of panel.querySelectorAll("[id]")) elements[node.id] = node;
    state.active = panel.classList.contains("active");
    bindControls();
    reset();
    document.addEventListener("inverse-view-change", (event) => {
      state.active = event.detail?.view === "aperture2d";
      if (state.active && state.workspace !== "depth") {
        // The comparison is a one-shot solve rather than a running loop, so the first visit
        // should arrive at a finished panel rather than an empty one.
        if (!(state.workspace==="image"?state.imageResult:state.result) && !state.running) run();
        else draw();
      }
    });
    if (state.active) run();
  }

  function bindControls() {
    elements.apertureRayShift?.addEventListener("input", drawMaskMechanism);
    elements.aperture2dRunButton?.addEventListener("click", run);
    elements.apertureImageRunButton?.addEventListener("click",run);
    for(const id of ["apertureImageScene","apertureImageMask","apertureImageResolution","apertureImageNoise"]) {
      elements[id]?.addEventListener("change",()=>{state.imageResult=null;run();});
    }
    document.querySelectorAll("[data-aperture2d-workspace]").forEach((button)=>{
      button.addEventListener("click",()=>{
        state.workspace=button.getAttribute("data-aperture2d-workspace");
        document.querySelectorAll("[data-aperture2d-workspace]").forEach((node)=>{
          node.classList.toggle("active",node===button);node.setAttribute("aria-pressed",String(node===button));
        });
        document.querySelectorAll("[data-aperture2d-section]").forEach((section)=>{section.hidden=section.dataset.aperture2dSection!==state.workspace;});
        if(state.running){reset();state.running=false;}
        document.dispatchEvent(new CustomEvent("inverse-aperture-workspace", {detail:{workspace:state.workspace}}));
        if(state.workspace === "depth") return;
        if(state.workspace==="image"?state.imageResult:state.result){updateControls();draw();}else run();
      });
    });
    document.querySelectorAll("[data-aperture2d-scene]").forEach((button) => {
      button.addEventListener("click", () => {
        state.scene = button.getAttribute("data-aperture2d-scene");
        markActive("[data-aperture2d-scene]", button);
        run();
      });
    });
    document.querySelectorAll("[data-aperture2d-noise]").forEach((button) => {
      button.addEventListener("click", () => {
        state.noise = Number(button.getAttribute("data-aperture2d-noise"));
        markActive("[data-aperture2d-noise]", button);
        run();
      });
    });
  }

  function markActive(selector, active) {
    document.querySelectorAll(selector).forEach((node) => {
      node.classList.toggle("active", node === active);
    });
  }

  function reset() {
    if (state.worker) state.worker.terminate();
    if (typeof Worker === "undefined") {
      state.error = "Web Workers unavailable; five eigendecompositions inline would freeze the page.";
      updateControls();
      return;
    }
    state.worker = new Worker("aperture2d-worker.js?v=image-camera-4");
    state.worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.jobId !== state.jobId) return;
      if (data.type === "progress") state.progress = data.message;
      if (data.type === "error") {
        state.error = data.message;
        state.running = false;
      }
      if (data.type === "result") {
        state.result = data;
        state.running = false;
        state.progress = "";
      }
      if(data.type==="image-result") {state.imageResult=data;state.running=false;state.progress="";}
      updateControls();
      if (data.type === "result"||data.type==="image-result") draw();
    };
    state.worker.onerror = () => {
      state.error = "aperture worker failed";
      state.running = false;
      updateControls();
    };
  }

  function run() {
    if (state.workspace === "depth" || !state.worker) return;
    if(state.running)reset();
    state.running = true;
    state.error = "";
    state.jobId += 1;
    state.worker.postMessage({
      type: state.workspace==="image"?"image":"run",
      jobId: state.jobId,
      payload: state.workspace==="image"?{
        scene:elements.apertureImageScene?.value||"ceramics",mask:elements.apertureImageMask?.value||"coded",
        size:Number(elements.apertureImageResolution?.value)||64,
        noise:elements.apertureImageNoise?Number(elements.apertureImageNoise.value):.0002
      }:{ scene: state.scene, noise: state.noise, grid: 16, sensor: 32 }
    });
    updateControls();
  }

  function updateControls() {
    if(elements.apertureImageStatus)elements.apertureImageStatus.textContent=state.error||(state.running?(state.progress||"capturing and solving"):state.imageResult?"image recovered":"ready");
    if(elements.apertureImageRunButton)elements.apertureImageRunButton.disabled=state.running;
    if (elements.aperture2dStatusBadge && state.workspace !== "depth") {
      elements.aperture2dStatusBadge.textContent =
        state.error || (state.running ? (state.progress || "solving") : "idle");
    }
    if (elements.aperture2dSceneNote) {
      elements.aperture2dSceneNote.textContent = SCENE_NOTES[state.scene] || "";
    }
    if (elements.aperture2dRunButton) {
      elements.aperture2dRunButton.disabled = state.running;
    }
    renderTable();
  }

  function renderTable() {
    const body = elements.aperture2dTableBody;
    if (!body) return;
    const result = state.result;
    if (!result) {
      body.innerHTML = '<tr><td colspan="5">solving</td></tr>';
      return;
    }
    const trials = Object.fromEntries(result.trials.map((row) => [row.aperture, row]));
    const rows = APERTURES.map((key) => {
      const spectrum = result.spectra[key];
      const trial = trials[key];
      const total = spectrum.totalDirections;
      return `<tr>
        <td>${spectrum.label}</td>
        <td><strong>${spectrum.usableDirections}</strong> / ${total}</td>
        <td>${spectrum.numericalRank}</td>
        <td>${spectrum.effectiveRank.toFixed(1)}</td>
        <td>${trial ? trial.zncc.toFixed(3) : "-"}</td>
      </tr>`;
    });
    body.innerHTML = rows.join("");
  }

  function drawCameraRgb(canvas,field,size,mode) {
    if(!canvas||!field)return 1;
    const buffer=document.createElement("canvas");buffer.width=size;buffer.height=size;
    const context=buffer.getContext("2d"),pixels=context.createImageData(size,size),means=[0,0,0];
    const cells=size*size;
    if(mode==="sensor")for(let i=0;i<cells;i+=1)for(let k=0;k<3;k+=1)means[k]+=field[i*3+k]/cells;
    let scale=1;
    if(mode==="sensor"||mode==="residual") {
      let peak=0;
      for(let i=0;i<field.length;i+=1)peak=Math.max(peak,Math.abs(field[i]-means[i%3]));
      scale=peak>1e-12?.34/peak:1;
    }
    for(let i=0;i<cells;i+=1) {
      for(let k=0;k<3;k+=1) {
        let value=field[i*3+k];
        if(mode==="sensor")value=.22+(value-means[k])*scale;
        if(mode==="residual")value=Math.abs(value)*scale;
        pixels.data[i*4+k]=Math.round(255*Math.pow(Math.max(0,Math.min(1,value)),1/2.2));
      }
      pixels.data[i*4+3]=255;
    }
    context.putImageData(pixels,0,0);
    const destination=canvas.getContext("2d");destination.imageSmoothingEnabled=true;destination.imageSmoothingQuality="high";
    destination.clearRect(0,0,canvas.width,canvas.height);destination.drawImage(buffer,0,0,canvas.width,canvas.height);
    return scale;
  }

  function drawCameraScalar(canvas,field,size,spectrum) {
    if(!canvas)return;
    const buffer=document.createElement("canvas");buffer.width=size;buffer.height=size;
    const context=buffer.getContext("2d"),pixels=context.createImageData(size,size),peak=Math.max(...field);
    for(let y=0;y<size;y+=1)for(let x=0;x<size;x+=1) {
      const source=spectrum?((y+size/2)%size)*size+(x+size/2)%size:y*size+x;
      const t=spectrum?Math.log1p(field[source])/Math.log1p(peak||1):field[source];
      const color=spectrum?[35+220*t,52+172*t,105+67*t]:[230*t,240*t,234*t];
      const i=(y*size+x)*4;
      for(let k=0;k<3;k+=1)pixels.data[i+k]=Math.round(color[k]);pixels.data[i+3]=255;
    }
    context.putImageData(pixels,0,0);
    const destination=canvas.getContext("2d");destination.imageSmoothingEnabled=false;
    destination.drawImage(buffer,0,0,canvas.width,canvas.height);
  }

  function drawMaskMechanism() {
    const data=state.imageResult, canvas=elements.apertureMechanismCanvas;
    if(!data||!canvas)return;
    const n=data.size,shift=Number(elements.apertureRayShift?.value||0);
    if(elements.apertureRayShiftLabel)elements.apertureRayShiftLabel.textContent=`${shift>=0?"+":""}${shift} mask cells`;
    const c=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
    c.clearRect(0,0,w,h);c.fillStyle="#0d1218";c.fillRect(0,0,w,h);
    function arrow(x0,x1,y,color) {
      c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;
      c.beginPath();c.moveTo(x0,y);c.lineTo(x1,y);c.stroke();
      c.beginPath();c.moveTo(x1,y);c.lineTo(x1-10,y-5);c.lineTo(x1-10,y+5);c.closePath();c.fill();
    }
    c.fillStyle="#e8cd87";c.beginPath();c.arc(70,125,10,0,Math.PI*2);c.fill();
    c.font="18px system-ui";c.textAlign="center";c.fillText("One direction",80,206);
    arrow(101,207,125,"#e8cd87");
    const tile=document.createElement("canvas");tile.width=n;tile.height=n;
    const t=tile.getContext("2d"),im=t.createImageData(n,n);
    function paint(x,y,offset) {
      for(let v=0;v<n;v++)for(let u=0;u<n;u++){
        const value=data.maskImage[v*n+((u-offset)%n+n)%n],i=(v*n+u)*4;
        im.data[i]=value*202;im.data[i+1]=value*230;im.data[i+2]=value*218;im.data[i+3]=255;
      }
      t.putImageData(im,0,0);c.imageSmoothingEnabled=false;c.drawImage(tile,x,y,150,150);
      c.strokeStyle="#658b88";c.lineWidth=1;c.strokeRect(x,y,150,150);
    }
    paint(220,42,0);paint(470,42,shift);
    c.fillStyle="#bccac6";c.fillText("Selected mask",295,218);c.fillText("Shifted sensor pattern",545,218);
    arrow(385,455,117,"#64d6c4");arrow(638,722,117,"#64d6c4");
    c.fillStyle="#e8cd87";c.font="34px system-ui";c.fillText("Σ",789,120);
    c.fillStyle="#bccac6";c.font="18px system-ui";c.fillText("Sum all directions",805,158);
    c.fillText("= coded exposure",805,184);
  }

  function drawImageCamera() {
    const data=state.imageResult;if(!data)return;
    drawCameraRgb(elements.apertureImageTruthCanvas,data.truth,data.size);
    const sensorGain=drawCameraRgb(elements.apertureImageSensorCanvas,data.measurement,data.size,"sensor");
    drawCameraRgb(elements.apertureImageEstimateCanvas,data.recovery,data.size);
    const residualGain=drawCameraRgb(elements.apertureImageResidualCanvas,data.residual,data.size,"residual");
    drawCameraScalar(elements.apertureImageMaskCanvas,data.maskImage,data.size,false);
    drawMaskMechanism();
    drawCameraScalar(elements.apertureImageSpectrumCanvas,data.spectrum,data.size,true);
    const labels={
      apertureImageTruthBadge:`${data.size} × ${data.size} angular RGB target`,
      apertureImageSensorBadge:`contrast ×${sensorGain.toFixed(0)} · channel means removed`,
      apertureImageEstimateBadge:`${data.size*data.size*3} fitted color values`,
      apertureImageResidualBadge:`sensor residual ×${residualGain.toFixed(0)}`,
      apertureImageMaskBadge:`${Math.round(data.transmission*100)}% transmission · tiled calibration`
    };
    for(const[id,text]of Object.entries(labels))if(elements[id])elements[id].textContent=text;
    if(elements.apertureImageResult)elements.apertureImageResult.textContent=
      `${window.Aperture2dCore.IMAGE_SCENES[data.scene]} · ${data.size} × ${data.size} recovered angular pixels from one RGB exposure. `
      +`Image agreement ${data.zncc.toFixed(3)} ZNCC; RGB RMSE ${data.rmse.toFixed(3)}. `
      +`Sensor mismatch ${data.sensorRmse.toExponential(2)}.`;
    if(elements.apertureImageScope)elements.apertureImageScope.textContent=
      `Known periodic binary mask, ${data.size*data.size} detector positions per color channel, noise σ = ${data.noise}. `
      +`${data.visibleFrequencies} of ${data.size*data.size} mask Fourier modes exceed 1% of DC; this is the current camera's frequency diagnostic, not the small example's SVD. `
      +"The inverse sees only sensor arrays and mask calibration. It recovers angular radiance, not metric distance or geometry. "
      +"Reference and reconstruction share a fixed exposure; the sensor and residual use the displayed contrast gains. "
      +"Removing the mask's vertical variation removes elevation information even when the sensor grid is enlarged.";
  }

  // Grey ramp with a warm top end, matching the other reconstruction panels.
  function colorize(value) {
    const t = Math.max(0, Math.min(1, value));
    return [
      Math.round(255 * Math.min(1, t * 1.35)),
      Math.round(255 * Math.min(1, Math.max(0, t * 1.12 - 0.06))),
      Math.round(255 * Math.min(1, Math.max(0, t * 0.85 - 0.12)))
    ];
  }

  function drawField(canvas, field, grid) {
    if (!canvas || !field) return;
    const context = canvas.getContext("2d");
    const buffer = document.createElement("canvas");
    buffer.width = grid;
    buffer.height = grid;
    const image = buffer.getContext("2d").createImageData(grid, grid);
    let peak = 0;
    for (const value of field) peak = Math.max(peak, value);
    const photographic=state.result?.scene==="stilllife";
    const scale = photographic ? 1 : peak > 0 ? 1 / peak : 1;
    for (let j = 0; j < grid; j += 1) {
      for (let i = 0; i < grid; i += 1) {
        // Row 0 is the lowest elevation, so flip vertically to put the sky at the top.
        const source = (grid - 1 - j) * grid + i;
        const t=Math.round(255*Math.pow(Math.max(0,Math.min(1,field[source]*scale)),1/2.2));
        const [r, g, b] = photographic ? [t,t,t] : colorize(field[source] * scale);
        const target = (j * grid + i) * 4;
        image.data[target] = r;
        image.data[target + 1] = g;
        image.data[target + 2] = b;
        image.data[target + 3] = 255;
      }
    }
    buffer.getContext("2d").putImageData(image, 0, 0);
    context.imageSmoothingEnabled = photographic;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(buffer, 0, 0, canvas.width, canvas.height);
  }

  function drawSpectrum() {
    const canvas = elements.aperture2dSpectrumCanvas;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    context.fillStyle = "#0c1115";
    context.fillRect(0, 0, width, height);
    const result = state.result;
    if (!result) return;

    const colors = {
      none: "#6a7b82",
      edge: "#f0ba5d",
      twoEdge: "#7ad6ff",
      occluder: "#9be08a",
      mask: "#ff9ad2"
    };
    const floor = 1e-9;
    const left = 34;
    const right = width - 10;
    const top = 16;
    const bottom = height - 24;
    const toX = (index, count) => left + (right - left) * index / Math.max(1, count - 1);
    const toY = (value) => {
      const t = Math.log10(Math.max(floor, value)) / Math.log10(floor);
      return top + (bottom - top) * Math.max(0, Math.min(1, t));
    };

    // The 1% usable-directions threshold, drawn so the table's counts are readable off the plot.
    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(left, toY(0.01));
    context.lineTo(right, toY(0.01));
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#8f9a9e";
    context.font = "10px Inter, system-ui, sans-serif";
    context.fillText("1% of the largest", left + 4, toY(0.01) - 4);

    for (const key of APERTURES) {
      const spectrum = result.spectra[key];
      if (!spectrum) continue;
      context.strokeStyle = colors[key] || "#ccc";
      context.lineWidth = key === "edge" ? 2 : 1.4;
      context.beginPath();
      spectrum.singular.forEach((value, index) => {
        const x = toX(index, spectrum.singular.length);
        const y = toY(value);
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    }

    context.fillStyle = "#9eaaa7";
    context.fillText("singular value / largest, log", left + 4, top + 10);
    context.fillText("direction index", right - 82, bottom + 16);
    let legendX = left + 4;
    for (const key of APERTURES) {
      context.fillStyle = colors[key];
      context.fillText(key, legendX, bottom + 16);
      legendX += context.measureText(key).width + 12;
    }
  }

  function draw() {
    if(state.active&&state.workspace==="image"){drawImageCamera();return;}
    if (!state.active || state.workspace === "depth" || !state.result) return;
    const result = state.result;
    drawField(elements.aperture2dTruthCanvas, result.truth, result.grid);
    for (const trial of result.trials) {
      drawField(elements[`aperture2d${capitalize(trial.aperture)}Canvas`], trial.recovery, result.grid);
    }
    drawSpectrum();
    if (elements.aperture2dFlipNote && result.spectra.edge && result.spectra.occluder) {
      const ratio = result.spectra.occluder.usableDirections
        / Math.max(1, result.spectra.edge.usableDirections);
      elements.aperture2dFlipNote.textContent =
        `Measured here: the single edge reaches ${result.spectra.edge.usableDirections} usable `
        + `directions of ${result.spectra.edge.totalDirections}, the finite occluder `
        + `${result.spectra.occluder.usableDirections} - the occluder now wins by `
        + `${ratio.toFixed(1)}x. On the 1D lane next door the same two apertures came out 25 to `
        + `23 the other way. Nothing changed but the dimensionality of the unknown.`;
    }
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
})();
