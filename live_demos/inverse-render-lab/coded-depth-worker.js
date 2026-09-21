"use strict";

importScripts("defocus-core.js?v=focus-3", "coded-depth-core.js?v=depth-1");

const depthCore = self.CodedDepthCore;
const optics = self.DefocusCore;

function configuration(payload) {
  const size = Number(payload.size) === 512 ? 512 : 256;
  return Object.assign({}, depthCore.DEFAULTS, {
    size, grid: 4, pixelPitch: .006 * 256 / size,
    mode: payload.mode === "pair" ? "pair" : "single",
    scene: ["terrace", "slope", "wave"].includes(payload.scene) ? payload.scene : "terrace",
    texture: payload.texture === "structured" ? "structured" : "natural",
    aperture: ["circular", "coded", "annulus"].includes(payload.aperture) ? payload.aperture : "coded",
    noiseSigma: [.001, .006, .018].includes(Number(payload.noiseSigma)) ? Number(payload.noiseSigma) : .001
  });
}

function calibration(config) {
  // This is the complete inverse input contract. Scene identity, texture selection, seed and
  // ground-truth distances belong to the forward generator, never to the estimator.
  const keys = ["size", "grid", "focalLength", "apertureDiameter", "pixelPitch", "focusDepths",
    "depthMin", "depthMax", "depthStep", "noiseSigma", "aperture", "mode"];
  return Object.fromEntries(keys.map((key) => [key, config[key]]));
}

function post(jobId, content) { self.postMessage(Object.assign({ jobId }, content)); }

function apertureDisplay(aperture) {
  const size = 256;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    let value = 0;
    for (let sy = 0; sy < 2; sy += 1) for (let sx = 0; sx < 2; sx += 1) {
      value += optics.apertureOpen(aperture, 2 * (x + (sx + .5) / 2) / size - 1,
        2 * (y + (sy + .5) / 2) / size - 1);
    }
    values[y * size + x] = value / 4;
  }
  return { size, values };
}

function selectionOptics(config, depth) {
  if (!Number.isFinite(depth)) return { psfs: [], depth: null };
  const focusDepths = config.focusDepths.slice(0, config.mode === "pair" ? 2 : 1);
  const blurs = focusDepths.map((focusDepth) => optics.signedBlurDiameterPixels(depth,
    Object.assign({}, config, { focusDepth })));
  const size = 256;
  const fieldOfView = Math.max(24 * config.size / 256, ...blurs.map((blur) => Math.abs(blur) * 1.35));
  const psfs = focusDepths.map((focusDepth, index) => {
    // Re-evaluate optical geometry over a magnified sensor window. These display samples do
    // not replace the native-resolution kernel used by the forward/inverse operators.
    const wrapped = optics.pointSpreadFunction(config.aperture, blurs[index] * size / fieldOfView, size, 1);
    const values = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      values[y * size + x] = wrapped[((y + size / 2) % size) * size + (x + size / 2) % size];
    }
    return { values, size, focusDepth, blurPixels: blurs[index] };
  });
  return { psfs, depth, fieldOfView };
}

function run(jobId, payload) {
  const config = configuration(payload);
  post(jobId, { type: "progress", message: "Rendering 16 independently calibrated target cells…" });
  const scene = depthCore.makeScene(config.scene, config);
  const captures = depthCore.captureScene(scene, config);
  post(jobId, { type: "progress", message: config.mode === "pair"
    ? "Testing which distance explains both focus settings in each cell…"
    : "Comparing blur hypotheses under the declared image prior…" });
  const fit = depthCore.fitDepth(captures, calibration(config));
  // Ground truth re-enters only after fitting, for the displayed evaluation.
  let error = 0, resolved = 0, ambiguous = 0;
  for (const patch of fit.patches) {
    const cx = Math.floor(patch.x + patch.width / 2);
    const cy = Math.floor(patch.y + patch.height / 2);
    patch.truthDepth = scene.truthDepth[cy * config.size + cx];
    if (Number.isFinite(patch.depth)) { error += Math.abs(patch.depth - patch.truthDepth); resolved += 1; }
    if (patch.ambiguous) ambiguous += 1;
  }
  let imageError = 0;
  for (let i = 0; i < scene.sharp.length; i += 1) imageError += (scene.sharp[i] - fit.reconstruction[i]) ** 2;
  post(jobId, { type: "result", result: {
    ...fit, config, sharp: scene.sharp, truthDepth: scene.truthDepth, captures,
    mask: apertureDisplay(config.aperture), transmission: optics.transmission(config.aperture, 128),
    metrics: { resolved, ambiguous, depthMae: resolved ? error / resolved : null,
      imageRmse: Math.sqrt(imageError / scene.sharp.length) }
  } });
}

self.onmessage = (event) => {
  const { type, jobId, selectionId, payload = {} } = event.data || {};
  try {
    if (type === "run") run(jobId, payload);
    if (type === "selection") {
      post(jobId, { type: "selection", selectionId,
        optics: selectionOptics(configuration(payload.config || {}), Number.isFinite(payload.depth) ? payload.depth : NaN) });
    }
  } catch (error) {
    post(jobId, { type: "error", selectionId, message: error?.message || String(error) });
  }
};
