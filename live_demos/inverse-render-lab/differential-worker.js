"use strict";

importScripts("differential-core.js?v=transport-1");

let lab = DifferentialCore.createLab({ scene: "visibility", budget: 256 });

self.onmessage = (event) => {
  const { id, action, payload = {} } = event.data || {};
  try {
    if (action === "reset") {
      lab = DifferentialCore.createLab({
        scene: payload.scene,
        budget: payload.budget,
        seed: payload.seed
      });
      self.postMessage({ id, snapshot: DifferentialCore.snapshot(lab) });
      return;
    }
    if (action === "step") {
      const count = Math.max(1, Math.min(12, Number(payload.count) || 1));
      self.postMessage({ id, snapshot: DifferentialCore.stepLab(lab, count) });
      return;
    }
    if (action === "snapshot") {
      self.postMessage({ id, snapshot: DifferentialCore.snapshot(lab) });
    }
  } catch (error) {
    self.postMessage({
      id,
      error: String(error && error.message ? error.message : error)
    });
  }
};
