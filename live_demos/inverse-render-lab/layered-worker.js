"use strict";

// The stochastic reference and the fits behind the layered exhibits are far too slow for the
// main thread -- a coat-roughness sweep runs a full pattern search per row. Keeping them here
// means the UI stays responsive while the reference is being computed.
importScripts("layered-core.js?v=layered-1");

self.addEventListener("message", (event) => {
  const { type, jobId, payload = {} } = event.data || {};
  if (type !== "audit") return;
  try {
    const core = self.LayeredCore;
    // A microfacet base rather than a Lambertian one, so every reported parameter is live: with
    // a diffuse base the roughness column is inert and reads as "both models agree" when in
    // fact neither was constrained.
    const stack = core.makeStack({ baseIsDiffuse: false, ...(payload.stack || {}) });

    // Angular slice for the three operators over one identical stack.
    const random = core.mulberry32(payload.seed || 0x51a7ed);
    const slice = [];
    const count = payload.sliceCount || 48;
    for (let index = 0; index < count; index += 1) {
      const thetaO = -1.15 + 2.3 * (index + 0.5) / count;
      const thetaI = payload.thetaI ?? 0.45;
      slice.push({
        thetaO,
        naive: core.evalNaive(stack, thetaI, thetaO, 0),
        belcour: core.evalBelcour(stack, thetaI, thetaO, 0),
        guo: core.evalGuo(stack, thetaI, thetaO, 0, payload.referenceSamples || 512, random)
      });
    }
    self.postMessage({ type: "slice", jobId, slice });

    const sweep = core.coatRoughnessSweep({
      count: payload.sweepCount || 48,
      iterations: payload.iterations || 200,
      baseRoughness: stack.baseRoughness
    });
    self.postMessage({ type: "sweep", jobId, sweep });

    const audit = core.relightAudit(stack, {
      count: payload.auditCount || 72,
      samples: payload.auditSamples || 64,
      iterations: payload.iterations || 200
    });
    // Per-channel series gain, measured with the achromatic coat lobe subtracted so the base's
    // colour response can be read at all.
    const saturated = core.makeStack({ ...stack, albedo: [0.8, 0.4, 0.2] });
    const coatOnly = core.makeStack({ ...saturated, albedo: [0, 0, 0] });
    const channels = [0, 1, 2].map((channel) =>
      core.evalBelcour(saturated, 0.55, -0.15, channel) - core.evalBelcour(coatOnly, 0.55, -0.15, channel));

    self.postMessage({
      type: "result",
      jobId,
      audit: {
        lanes: {
          naive: {
            trainRmse: audit.lanes.naive.trainRmse,
            heldOutRmse: audit.lanes.naive.heldOutRmse,
            gap: audit.lanes.naive.gap,
            recovered: {
              albedo: audit.lanes.naive.fit.stack.albedo,
              baseRoughness: audit.lanes.naive.fit.stack.baseRoughness,
              coatRoughness: audit.lanes.naive.fit.stack.coatRoughness
            }
          },
          belcour: {
            trainRmse: audit.lanes.belcour.trainRmse,
            heldOutRmse: audit.lanes.belcour.heldOutRmse,
            gap: audit.lanes.belcour.gap,
            recovered: {
              albedo: audit.lanes.belcour.fit.stack.albedo,
              baseRoughness: audit.lanes.belcour.fit.stack.baseRoughness,
              coatRoughness: audit.lanes.belcour.fit.stack.coatRoughness
            }
          }
        },
        trainCount: audit.trainCount,
        heldCount: audit.heldCount
      },
      series: {
        albedoRatio: 0.8 / 0.2,
        responseRatio: channels[0] / Math.max(1e-9, channels[2])
      },
      truth: { albedo: stack.albedo, baseRoughness: stack.baseRoughness, coatRoughness: stack.coatRoughness }
    });
  } catch (error) {
    self.postMessage({ type: "error", jobId, message: error instanceof Error ? error.message : String(error) });
  }
});
