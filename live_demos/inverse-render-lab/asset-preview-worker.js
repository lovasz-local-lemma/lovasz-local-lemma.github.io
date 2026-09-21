"use strict";

importScripts("asset-core.js?v=asset-11");

// Independent from the optimizer: larger presentation rasters never increase its loss grid
// or delay UI input. Keep only one reference image; the controller coalesces pending requests.
let referenceCache = null;
self.onmessage = (event) => {
  const message = event.data;
  if (message?.type !== "render") return;
  const { id, scene, params, target, model, shape, viewAngle, width, height, sampleGrid } = message;
  const key = [model, shape, viewAngle, width, height, sampleGrid, ...target].join("|");
  if (referenceCache?.key !== key) {
    referenceCache = { key, data: self.AssetInverseCore.renderRgba(target, model, width, height, viewAngle, shape, sampleGrid) };
  }
  const reference = referenceCache.data.slice();
  const current = self.AssetInverseCore.renderRgba(params, model, width, height, viewAngle, shape, sampleGrid);
  self.postMessage({ type: "rendered", id, scene, reference, current, width, height, sampleGrid }, [reference.buffer, current.buffer]);
};
