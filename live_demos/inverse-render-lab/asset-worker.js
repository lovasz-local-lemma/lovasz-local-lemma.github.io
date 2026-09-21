"use strict";

importScripts("asset-core.js?v=asset-11");

let solver = null;

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    solver = self.AssetInverseCore.createSolver(message.options || {});
    self.postMessage({ type: "snapshot", snapshot: self.AssetInverseCore.snapshot(solver) });
    return;
  }
  if (message.type === "step" && solver) {
    const steps = Math.max(1, Math.min(8, Number(message.steps) || 1));
    self.postMessage({ type: "snapshot", snapshot: self.AssetInverseCore.stepSolver(solver, steps) });
  }
};
