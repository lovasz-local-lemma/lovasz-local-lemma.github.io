"use strict";

importScripts("volume-inverse-core.js?v=volume-inverse-2");

let solver = null;

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    solver = self.VolumeInverseCore.createSolver(message.options || {});
    self.postMessage({ type: "snapshot", snapshot: self.VolumeInverseCore.snapshot(solver) });
    return;
  }
  if (message.type === "step" && solver) {
    const steps = Math.max(1, Math.min(8, Number(message.steps) || 1));
    self.postMessage({ type: "snapshot", snapshot: self.VolumeInverseCore.stepSolver(solver, steps) });
  }
};
