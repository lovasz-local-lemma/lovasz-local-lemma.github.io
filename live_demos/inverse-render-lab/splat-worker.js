"use strict";

// Splat fitting off the main thread. A 96x96 fit with a few hundred splats is a few hundred
// milliseconds per step on CPU, so running it inline would freeze the page during exactly the
// part a visitor wants to watch.
importScripts("splat-core.js?v=splat-1");

let solver = null;
let target = null;
let width = 96;
let height = 96;

function snapshot(core) {
  const image = core.renderImage(solver.population, width, height, solver.background);
  const rgba = core.toRgba(image, width, height);
  const residual = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    let worst = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      worst = Math.max(worst, Math.abs(image[index * 3 + channel] - target[index * 3 + channel]));
    }
    const value = Math.min(255, Math.round(Math.pow(worst, 1 / 2.2) * 255));
    residual[index * 4] = value;
    residual[index * 4 + 1] = Math.round(value * 0.55);
    residual[index * 4 + 2] = Math.round(value * 0.35);
    residual[index * 4 + 3] = 255;
  }
  // Ellipse parameters for the overlay: the visitor should be able to see the actual
  // primitives, not only the composite they produce.
  const O = core.OFFSET;
  const splats = new Float32Array(solver.population.count * 6);
  for (let index = 0; index < solver.population.count; index += 1) {
    const base = index * core.FLOATS_PER_SPLAT;
    const out = index * 6;
    splats[out] = solver.population.data[base + O.x];
    splats[out + 1] = solver.population.data[base + O.y];
    splats[out + 2] = Math.exp(solver.population.data[base + O.logSx]);
    splats[out + 3] = Math.exp(solver.population.data[base + O.logSy]);
    splats[out + 4] = solver.population.data[base + O.theta];
    splats[out + 5] = 1 / (1 + Math.exp(-solver.population.data[base + O.logitOpacity]));
  }
  return {
    rgba,
    residual,
    splats,
    width,
    height,
    iteration: solver.iteration,
    loss: solver.loss,
    count: solver.population.count,
    lastDensify: solver.lastDensify
      ? {
        cloned: solver.lastDensify.cloned,
        split: solver.lastDensify.split,
        pruned: solver.lastDensify.pruned,
        before: solver.lastDensify.before,
        after: solver.lastDensify.after
      }
      : null,
    history: solver.history.slice(-320)
  };
}

self.addEventListener("message", (event) => {
  const core = self.SplatCore;
  const { type, jobId, payload = {} } = event.data || {};
  try {
    if (type === "init") {
      width = payload.resolution || 96;
      height = width;
      target = payload.targetRgba
        ? core.targetFromRgba(payload.targetRgba, width, height)
        : core.makeShadedTarget(width, height, { lightAngle: payload.lightAngle ?? 0.9 });
      solver = core.createSolver({
        width,
        height,
        target,
        seed: payload.seed || 0x5b1a7,
        initialSplats: payload.initialSplats || 8,
        densifyInterval: payload.densifyInterval || 25,
        maxSplats: payload.maxSplats || 400,
        learningRate: payload.learningRate || 0.035
      });
      solver.loss = core.lossAndGradient(solver.population, target, width, height, solver.background).loss;
      const targetRgba = core.toRgba(target, width, height);
      self.postMessage({ type: "init", jobId, snapshot: snapshot(core), targetRgba });
      return;
    }
    if (type === "step") {
      if (!solver) return;
      core.stepSolver(solver, Math.max(1, payload.count || 1));
      self.postMessage({ type: "snapshot", jobId, snapshot: snapshot(core) });
      return;
    }
    if (type === "relight") {
      // The failure exhibit. Per-splat colour absorbed whatever lighting was present when it
      // was fitted, so re-rendering under a different light is impossible -- the splats have no
      // notion of a light. What CAN be shown is the gap: truth relit, beside the recovery,
      // which simply does not change.
      if (!solver) return;
      const relitTarget = core.makeShadedTarget(width, height, { lightAngle: payload.lightAngle ?? -0.7 });
      const recovered = core.renderImage(solver.population, width, height, solver.background);
      self.postMessage({
        type: "relight",
        jobId,
        relitTruth: core.toRgba(relitTarget, width, height),
        recovery: core.toRgba(recovered, width, height),
        trainRmse: core.imageRmse(recovered, target),
        relitRmse: core.imageRmse(recovered, relitTarget),
        width,
        height
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", jobId, message: error instanceof Error ? error.message : String(error) });
  }
});
