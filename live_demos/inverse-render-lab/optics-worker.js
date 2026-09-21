"use strict";

// Both experimental optics lanes off the main thread. The waterdrop tracing is cheap, but the
// defocus lane runs a few hundred FFT-based hypothesis tests per request and would visibly
// stall the page.
importScripts("defocus-core.js?v=focus-3", "waterdrop-core.js?v=optics-2");

const defocus = self.DefocusCore;
const waterdrop = self.WaterdropCore;
let defocusStatistics = null;
let defocusStatisticsKey = "";

function post(jobId, message) {
  self.postMessage(Object.assign({ jobId }, message));
}

function runFocusPair(jobId, payload) {
  const scene=payload.scene==="botanical"?"botanical":"stilllife";
  const distance=Math.max(900,Math.min(1800,Number(payload.distance)||1260));
  const config=Object.assign({},defocus.FOCUS_PAIR_DEFAULTS,{
    aperture:defocus.APERTURE_KEYS.includes(payload.aperture)?payload.aperture:"circular",
    noiseSigma:[.001,.006,.018].includes(Number(payload.noiseSigma))?Number(payload.noiseSigma):.006
  });
  post(jobId,{type:"progress",message:"capturing two calibrated focus settings"});
  const target=defocus.makeRenderedTarget(scene,config.size);
  const observations=defocus.captureFocusPair(target,distance,config);
  post(jobId,{type:"progress",message:"fitting distance from the two photographs"});
  // Explicit measurement boundary: target pixels, scene name and true distance stop here.
  const fit=defocus.fitFocusPair(observations,config);
  let error=0;
  for(let i=0;i<target.length;i+=1) error+=(target[i]-fit.reconstruction[i])**2;
  post(jobId,{
    type:"focuspair",scene,aperture:config.aperture,size:config.size,
    target:Array.from(target),observations:observations.map((field)=>Array.from(field)),
    reconstruction:Array.from(fit.reconstruction),trueDistance:distance,distance:fit.distance,
    distances:fit.distances,scores:fit.scores,bestIndex:fit.bestIndex,
    ambiguous:fit.ambiguous,atBoundary:fit.atBoundary,depthStep:config.depthStep,
    focusDepths:config.focusDepths,noiseSigma:config.noiseSigma,
    transmission:defocus.transmission(config.aperture,128),
    blurDiameters:config.focusDepths.map((focusDepth)=>Math.abs(defocus.signedBlurDiameterPixels(distance,Object.assign({},config,{focusDepth})))),
    imageRmse:Math.sqrt(error/target.length)
  });
}

function runDefocus(jobId, payload) {
  const trials = payload.trials || 6;
  const noiseLevels = payload.noiseLevels || [0.6, 1.0];
  const statisticsKey = JSON.stringify([trials, noiseLevels]);
  runAperturePhotographs(jobId, payload);
  if (payload.reuseStatistics && defocusStatistics && defocusStatisticsKey === statisticsKey) {
    post(jobId, defocusStatistics);
    return;
  }
  const size = defocus.DEFAULTS.size;

  post(jobId, { type: "progress", fraction: 0.05, message: "rendering apertures" });

  // Display geometry is independently supersampled. The benchmark itself keeps DEFAULTS.size
  // and its original 9-sensor-pixel blur; enlarging its 24-pixel crop would only enlarge texels.
  const masks = {};
  const psfDisplaySize = 256;
  const psfFieldOfView = 24;
  const psfs = {};
  const transfer = {};
  const showBlur = 9;
  const maskSize = 256;
  for (const key of defocus.APERTURE_KEYS) {
    const mask = new Float64Array(maskSize * maskSize);
    for (let j = 0; j < maskSize; j += 1) {
      for (let i = 0; i < maskSize; i += 1) {
        let open = 0;
        for (let sy = 0; sy < 2; sy += 1) for (let sx = 0; sx < 2; sx += 1) {
          const u = -1 + 2 * (i + (sx + .5) / 2) / maskSize;
          const v = -1 + 2 * (j + (sy + .5) / 2) / maskSize;
          open += defocus.apertureOpen(key, u, v);
        }
        mask[j * maskSize + i] = open * .25;
      }
    }
    masks[key] = Array.from(mask);
    // Re-evaluate the same continuous geometric PSF over a magnified 24-sensor-pixel window.
    // This optical illustration is not substituted into the measured statistical operators.
    const wrapped = defocus.pointSpreadFunction(key, showBlur * psfDisplaySize / psfFieldOfView,
      psfDisplaySize, 1);
    const centered = new Float64Array(psfDisplaySize * psfDisplaySize);
    for (let y = 0; y < psfDisplaySize; y += 1) {
      for (let x = 0; x < psfDisplaySize; x += 1) {
        const sy = (y + psfDisplaySize / 2) % psfDisplaySize;
        const sx = (x + psfDisplaySize / 2) % psfDisplaySize;
        centered[y * psfDisplaySize + x] = wrapped[sy * psfDisplaySize + sx];
      }
    }
    psfs[key] = Array.from(centered);
    transfer[key] = Array.from(defocus.radialTransfer(key, showBlur));
  }

  post(jobId, { type: "progress", fraction: 0.2, message: "scale discrimination" });
  const scale = [];
  let step = 0;
  const totalSteps = 2 * noiseLevels.length;
  for (const matchPhotons of [false, true]) {
    for (const noiseSigma of noiseLevels) {
      const row = { matchPhotons, noiseSigma, byAperture: {} };
      for (const key of defocus.APERTURE_KEYS) {
        row.byAperture[key] = defocus.depthTrial(key, { noiseSigma }, { trials, matchPhotons }).accuracy;
      }
      scale.push(row);
      step += 1;
      post(jobId, {
        type: "progress",
        fraction: 0.2 + 0.5 * step / totalSteps,
        message: `scale discrimination ${step}/${totalSteps}`
      });
    }
  }

  post(jobId, { type: "progress", fraction: 0.72, message: "near/far sign" });
  const sign = [];
  for (const sceneKind of ["gaussian", "piecewise"]) {
    for (const scorer of ["gaussian", "sparse"]) {
      const cell = { sceneKind, scorer, byAperture: {} };
      for (const key of defocus.APERTURE_KEYS) {
        cell.byAperture[key] = defocus.signTrial(
          key, { noiseSigma: 0.1 },
          { trials: Math.max(3, Math.round(trials * 0.75)), scorer, sceneKind, matchPhotons: true }
        ).accuracy;
      }
      sign.push(cell);
    }
  }

  const transmissionByAperture = {};
  const symmetryByAperture = {};
  for (const key of defocus.APERTURE_KEYS) {
    transmissionByAperture[key] = defocus.transmission(key);
    symmetryByAperture[key] = defocus.centrallySymmetric(key);
  }

  defocusStatistics = {
    type: "defocus",
    apertureKeys: defocus.APERTURE_KEYS.slice(),
    apertureLabels: defocus.APERTURE_LABELS,
    masks,
    maskSize,
    psfs,
    psfSize: psfDisplaySize,
    psfFieldOfView,
    benchmarkSize: size,
    transfer,
    showBlur,
    scale,
    sign,
    transmission: transmissionByAperture,
    symmetric: symmetryByAperture,
    ladderDepths: defocus.ladderDepths().map((d) => Math.round(d)),
    blurLadder: defocus.DEFAULTS.blurLadder.slice()
  };
  defocusStatisticsKey = statisticsKey;
  post(jobId, defocusStatistics);
}

function runAperturePhotographs(jobId, payload) {
  const size = Number(payload.previewSize) === 512 ? 512 : 256;
  const scene = payload.scene === "botanical" ? "botanical" : "stilllife";
  const trueDistance = 1260;
  // Keep the physical sensor width fixed as sampling increases. Merely increasing N while
  // retaining pixel pitch would change the field of view and shrink the relative blur.
  const config = Object.assign({}, defocus.FOCUS_PAIR_DEFAULTS, {
    size, pixelPitch: defocus.FOCUS_PAIR_DEFAULTS.pixelPitch * defocus.FOCUS_PAIR_DEFAULTS.size / size
  });
  post(jobId, { type: "progress", message: `rendering ${size} × ${size} scene measurements` });
  const target = defocus.makeRenderedTarget(scene, size);
  const preview = { type: "defocusPreview", scene, size, trueDistance,
    target: Float32Array.from(target), focusDepths: config.focusDepths, pixelPitch: config.pixelPitch,
    noiseSigma: config.noiseSigma, depthStep: config.depthStep, lanes: {} };
  post(jobId, preview);
  for (const aperture of defocus.APERTURE_KEYS) {
    post(jobId, { type: "progress", message: `capturing and recovering ${aperture} aperture · ${size}²` });
    const optics = Object.assign({}, config, { aperture });
    const observations = defocus.captureFocusPair(target, trueDistance, optics);
    // The inverse receives measurement arrays and calibration only, exactly like Focus Pair.
    const fit = defocus.fitFocusPair(observations, optics);
    let squaredError = 0;
    for (let i = 0; i < target.length; i += 1) squaredError += (target[i] - fit.reconstruction[i]) ** 2;
    preview.lanes[aperture] = {
      capture: Float32Array.from(observations[0]), reconstruction: Float32Array.from(fit.reconstruction),
      distance: fit.distance, ambiguous: fit.ambiguous, atBoundary: fit.atBoundary,
      transmission: defocus.transmission(aperture, 128), imageRmse: Math.sqrt(squaredError / target.length),
      blurDiameters: config.focusDepths.map(focusDepth => Math.abs(defocus.signedBlurDiameterPixels(
        trueDistance, Object.assign({}, optics, { focusDepth }))))
    };
    post(jobId, preview);
  }
}

function runWaterdrop(jobId, payload) {
  const overrides = { pixelsPerDrop: payload.pixelsPerDrop || 96 };
  const target = payload.target || { x: -1000, y: 120 };
  const config = Object.assign({}, waterdrop.DEFAULTS, overrides);
  const shape = waterdrop.trueShape(overrides);

  // A sparse fan of exit rays for the diagram, taken from the same tracer the measurements use
  // so the picture cannot drift away from the numbers.
  const diagramDrop = config.drops[0];
  const entries = waterdrop.sampleEntries(diagramDrop, shape, { pixelsPerDrop: 41 });
  const rays = [];
  for (const entryY of entries) {
    const ray = waterdrop.traceRay(entryY, diagramDrop, shape, overrides);
    if (!ray) { rays.push(null); continue; }
    rays.push({
      entryY,
      origin: ray.origin,
      direction: ray.direction,
      angle: Math.atan2(ray.direction.y, -ray.direction.x) * 180 / Math.PI
    });
  }

  const budgets = config.drops.map((y) => waterdrop.opticalBudget(y, overrides));

  const ledger = [];
  for (const pixelsPerDrop of [96, 384, 1536]) {
    const result = waterdrop.triangulate(target, config.drops[0], config.drops[config.drops.length - 1],
      { pixelsPerDrop });
    if (!result) continue;
    ledger.push({
      pixelsPerDrop,
      relativeDepthError: result.depthError / Math.abs(target.x),
      recovered: result.point
    });
  }

  const baseline = waterdrop.baselineSweep({ x: -1500, y: 200 }, { pixelsPerDrop: 768 })
    .map((row) => ({
      baseline: row.baseline,
      relativeDepthError: row.depthError / 1500,
      conditioning: row.conditioning
    }));

  const sensitivity = waterdrop.shapeSensitivity(target, config.drops[0],
    config.drops[config.drops.length - 1], { pixelsPerDrop: 1536 });

  post(jobId, {
    type: "waterdrop",
    target,
    drops: config.drops.slice(),
    shape,
    cameraX: config.cameraX,
    cameraY: config.cameraY,
    contactHalfWidth: waterdrop.contactHalfWidth(shape),
    capCentreX: waterdrop.capCentreX(shape),
    rays,
    budgets,
    ledger,
    baseline,
    sensitivity: sensitivity.rows.map((row) => ({
      relativeShapeError: row.relativeShapeError,
      relativeDepthError: row.relativeDepthError,
      amplification: row.amplification
    }))
  });
}

self.addEventListener("message", (event) => {
  const { type, jobId, payload } = event.data || {};
  try {
    if (type === "focuspair") runFocusPair(jobId, payload || {});
    else if (type === "defocus") runDefocus(jobId, payload || {});
    else if (type === "waterdrop") runWaterdrop(jobId, payload || {});
  } catch (error) {
    post(jobId, { type: "error", message: String(error && error.message ? error.message : error) });
  }
});
