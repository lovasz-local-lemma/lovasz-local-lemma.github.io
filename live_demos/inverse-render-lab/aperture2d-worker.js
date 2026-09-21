"use strict";

// The 2-D aperture comparison off the main thread. Five Jacobi eigendecompositions of a
// 256x256 Gram matrix run about two seconds together, and five reconstructions add another
// second or so; inline that would lock the page during the part worth watching.
importScripts("aperture2d-core.js?v=image-camera-4");

const core = self.Aperture2dCore;

// The spectra depend only on the geometry, never on the hidden scene, so switching scenes must
// not pay for them again. Keyed by the geometry that actually enters the operator.
const spectrumCache = new Map();

function geometryKey(overrides) {
  const config = core.makeConfig(overrides);
  return [
    config.grid, config.sensor, config.thetaHalf, config.phiHalf,
    config.sensorExtent, config.standoff, config.occluderHalf, config.maskCells, config.maskSeed
  ].join("|");
}

function post(jobId, message) {
  self.postMessage(Object.assign({ jobId }, message));
}

function comparison(jobId, overrides) {
  const key = geometryKey(overrides);
  if (spectrumCache.has(key)) return spectrumCache.get(key);
  const result = {};
  for (let index = 0; index < core.APERTURE_KEYS.length; index += 1) {
    const aperture = core.APERTURE_KEYS[index];
    post(jobId, {
      type: "progress",
      fraction: 0.05 + 0.55 * index / core.APERTURE_KEYS.length,
      message: `conditioning: ${core.APERTURE_LABELS[aperture]}`
    });
    const spectrum = core.operatorSpectrum(core.buildOperator(aperture, overrides));
    // The full singular spectrum is 256 doubles per aperture. Trim to what the chart draws so
    // the message stays small; the scalars above are computed from the whole thing.
    result[aperture] = {
      aperture,
      label: spectrum.label,
      singular: Array.from(spectrum.singular, (value) => value / (spectrum.largest || 1)),
      usableDirections: spectrum.usableDirections,
      numericalRank: spectrum.numericalRank,
      totalDirections: spectrum.totalDirections,
      effectiveRank: spectrum.effectiveRank,
      spectralGapRatio: spectrum.spectralGapRatio,
      condition: spectrum.condition
    };
  }
  spectrumCache.set(key, result);
  return result;
}

function runImageCamera(jobId,payload) {
  const size=[32,64,128].includes(Number(payload.size))?Number(payload.size):64;
  const mask=core.IMAGE_MASKS[payload.mask]?payload.mask:"coded";
  const scene=core.IMAGE_SCENES[payload.scene]?payload.scene:"ceramics";
  const noise=[0,.0002,.001].includes(Number(payload.noise))?Number(payload.noise):.0002;
  post(jobId,{type:"progress",message:`capturing ${size} × ${size} color sensor samples`});
  const camera=core.buildImageCamera({size,mask});
  const truth=core.makeImageScene(scene,size);
  const measurement=core.captureImageCamera(camera,truth,noise,113);
  // Truth stops at capture. The inverse receives only calibration and sensor RGB arrays.
  const recovery=core.reconstructImageCamera(camera,measurement,noise);
  const prediction=core.captureImageCamera(camera,recovery,0,113);
  const residual=Float64Array.from(prediction,(value,index)=>value-measurement[index]);
  post(jobId,{
    type:"image-result",size,mask,scene,noise,
    truth:Array.from(truth),measurement:Array.from(measurement),recovery:Array.from(recovery),residual:Array.from(residual),
    maskImage:Array.from(camera.mask),spectrum:Array.from(camera.magnitudes),
    transmission:camera.transmission,visibleFrequencies:camera.visibleFrequencies,
    rmse:core.rmse(truth,recovery),zncc:core.zncc(truth,recovery),sensorRmse:core.rmse(prediction,measurement)
  });
}

self.addEventListener("message", (event) => {
  const { type, jobId, payload } = event.data || {};
  if(type==="image") {
    try{runImageCamera(jobId,payload||{});}catch(error){post(jobId,{type:"error",message:String(error.message||error)});}
    return;
  }
  if (type !== "run") return;
  try {
    const overrides = {
      grid: payload.grid || 16,
      sensor: payload.sensor || 32,
      lambda: payload.lambda === undefined ? 0.004 : payload.lambda
    };
    const scene = payload.scene || "stackedPair";
    const noise = payload.noise === undefined ? 0.002 : payload.noise;

    post(jobId, { type: "progress", fraction: 0.02, message: "building operators" });
    const spectra = comparison(jobId, overrides);

    const trials = [];
    let truth = null;
    for (let index = 0; index < core.APERTURE_KEYS.length; index += 1) {
      const aperture = core.APERTURE_KEYS[index];
      post(jobId, {
        type: "progress",
        fraction: 0.6 + 0.38 * index / core.APERTURE_KEYS.length,
        message: `inverting: ${core.APERTURE_LABELS[aperture]}`
      });
      const trial = core.runTrial(aperture, scene, overrides, { noise, seed: payload.seed || 991 });
      truth = truth || Array.from(trial.truth);
      trials.push({
        aperture,
        label: trial.label,
        recovery: Array.from(trial.recovery),
        rmse: trial.rmse,
        zncc: trial.zncc,
        recoveryElevationContrast: trial.recoveryElevationContrast,
        truthElevationContrast: trial.truthElevationContrast
      });
    }

    post(jobId, {
      type: "result",
      scene,
      noise,
      grid: overrides.grid,
      sensor: overrides.sensor,
      lambda: overrides.lambda,
      truth,
      trials,
      spectra,
      apertureKeys: core.APERTURE_KEYS.slice()
    });
  } catch (error) {
    post(jobId, { type: "error", message: String(error && error.message ? error.message : error) });
  }
});
