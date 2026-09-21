"use strict";

importScripts("polygon-mesh.js?v=polygon-1");

self.onmessage = (event) => {
  const payload = event.data || {};
  const started = performance.now();
  try {
    const common = {
      from: payload.from,
      to: payload.to,
      resolution: payload.resolution
    };
    const current = PolygonMesh.extractIsoSurface({ ...common, params: payload.params });
    const target = payload.needTarget
      ? PolygonMesh.extractIsoSurface({ ...common, params: payload.targetParams })
      : null;
    const transfer = [current.positions.buffer, current.normals.buffer];
    if (target) transfer.push(target.positions.buffer, target.normals.buffer);
    self.postMessage({
      requestId: payload.requestId,
      iteration: payload.iteration,
      targetKey: payload.targetKey,
      elapsedMs: performance.now() - started,
      current,
      target
    }, transfer);
  } catch (error) {
    self.postMessage({
      requestId: payload.requestId,
      error: String(error && error.message ? error.message : error)
    });
  }
};
