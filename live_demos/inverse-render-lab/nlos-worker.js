"use strict";

let currentJobId = 0;
const lctKernelCache = new Map();
const fftPlanCache = new Map();

self.addEventListener("message", async (event) => {
  const { type, jobId, payload } = event.data || {};
  if (type !== "reconstruct") return;
  currentJobId = jobId;

  try {
    const startedAt = performance.now();
    postProgress(jobId, 0.06, "assembling forward operator");
    const result = payload.mode === "structured"
      ? await runStructured(payload, jobId)
      : payload.mode === "passive"
        ? await runPassive(payload, jobId)
        : await runActive(payload, jobId);
    if (!result || currentJobId !== jobId) return;
    result.elapsedMs = performance.now() - startedAt;
    const transfer = collectTransferBuffers(result, [
      "positions",
      "weights",
      "measurement",
      "aux",
      "frontProjection",
      "truthProjection",
      "scanOrder",
      "positiveExposure",
      "negativeExposure",
      "background"
    ]);
    self.postMessage({ type: "result", jobId, result }, transfer);
  } catch (error) {
    self.postMessage({
      type: "error",
      jobId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Three inverses over one acquisition. Each states what it is and, more importantly, what its
// visible failure mode is -- the halo, the tie, and the hand-set regularizer are all things
// the panel should say out loud rather than let the user discover as a surprise.
const ACTIVE_INVERSES = {
  lct: {
    label: "Wiener light-cone transform",
    progressLabel: "Wiener LCT",
    inverse: "released O'Toole et al. Wiener LCT pipeline",
    scope: "Radiometric z^k compensation, time-to-squared-depth resample, 3D FFT Wiener deconvolution against the measured light cone, inverse resample, nonnegative clamp. The regularizer is a hand-set constant derived from the target class and the noise slider, not estimated from the data -- compare against f-k migration, which has no such parameter."
  },
  fbp: {
    label: "filtered backprojection",
    progressLabel: "filtered backprojection",
    inverse: "adjoint A^T y with a heuristic depth Laplacian (Velten et al. lineage)",
    scope: "Adjoint, not an inverse: each time bin is smeared over its confocal sphere and summed, then sharpened by a second derivative along depth. There is no ramp filter and no deconvolution, so the low-frequency halo is the operator itself rather than an artifact of the data. Band-limited twice over by the light-cone PSF; expect it to score below the regularized inverse on a diffuse target."
  },
  fk: {
    label: "f-k migration",
    progressLabel: "f-k Stolt migration",
    inverse: "exploding-reflector wave migration (Lindell et al. 2019)",
    scope: "Treats the transient as a scalar wavefield and applies the Stolt change of variables. Phase is discarded (Psi <- sqrt(tau)). Assumes a planar wall, confocal sampling, one wave speed, and no occlusion inside the hidden scene. It is an exact solution to a scalar wave equation, not to optical NLOS -- surface scattering happens at sub-micron scales and these measurements at centimetre scales. It has zero tunable parameters, and on this diffuse forward model it does not beat the LCT."
  }
};

async function runActive(payload, jobId) {
  const samples = unpackSamples(payload.samples);
  const scanSide = Math.round(Math.sqrt(payload.budget));
  if (scanSide * scanSide !== payload.budget) {
    throw new Error("Confocal LCT requires a square relay-wall raster");
  }

  const bins = 64;
  const maxDepth = 4;
  const range = maxDepth * 2;
  const width = (payload.geometry.relayBounds[1] - payload.geometry.relayBounds[0]) * 0.5;
  const scanPoints = makeConfocalScanGrid(scanSide, payload.geometry);
  const scanOrder = makeSerpentineOrder(scanSide);
  // Material is an acquisition property, not a solved unknown. It matters here because the
  // LCT bakes a Lambertian assumption into its inverse through the z^k radiometric scaling,
  // while f-k migration does not -- so without a non-Lambertian target the two can only ever
  // be shown to tie.
  const material = payload.material === "specular" || payload.material === "retro" || payload.material === "diffuse"
    ? payload.material
    : (payload.target !== "calibration" ? "diffuse" : "retro");
  const isDiffuse = material === "diffuse";
  const radiometricPower = isDiffuse ? 4 : 2;
  const snr = (isDiffuse ? 0.08 : 0.8) / (1 + payload.noise * 4);
  const forwardResult = simulateConfocalTransient(
    samples,
    scanPoints,
    bins,
    range,
    payload,
    isDiffuse,
    material
  );
  const measurement = forwardResult.measurement;
  const specularCoverage = forwardResult.coverage;

  postEvidence(jobId, {
    measurement,
    measurementWidth: bins,
    measurementHeight: scanSide * scanSide,
    scanSide,
    scanOrder
  }, ["measurement", "scanOrder"]);
  postProgress(jobId, 0.22, "rectified confocal transient tensor complete");

  const rowStages = progressiveRowStages(scanSide);
  let finalReconstruction = null;
  // The inverse algorithm is an axis independent of the acquisition. All three reconstructors
  // below see the identical measurement tensor -- simulateConfocalTransient's RNG is seeded on
  // (target, budget) only -- so any difference between them is a property of the estimator and
  // not of the data. That fairness guarantee is asserted in nlos-modes-test.js.
  const inverseKey = payload.inverse === "fbp" || payload.inverse === "fk" ? payload.inverse : "lct";
  const backprojectFilterMode = payload.backprojectFilter === "none" ? "none" : "laplacian";
  const inverseOptions = {
    scanSide, bins, width, range, maxDepth, scanOrder, geometry: payload.geometry
  };
  const backprojectAccumulator = inverseKey === "fbp" ? new Float64Array(bins * scanSide * scanSide) : null;
  let accumulatedScans = 0;
  let stoltZeroedFraction = 0;

  for (let stage = 0; stage < rowStages.length; stage += 1) {
    const acquiredScans = rowStages[stage] * scanSide;
    let volume;
    if (inverseKey === "fbp") {
      // Additive over wall points: each stage only integrates the scans acquired since the
      // last one, so the eight-stage progressive total costs one full pass. The LCT and f-k
      // lanes must re-run their entire padded FFT per stage.
      backprojectAccumulate(measurement, inverseOptions, backprojectAccumulator, accumulatedScans, acquiredScans);
      accumulatedScans = acquiredScans;
      volume = backprojectFilter(backprojectAccumulator, inverseOptions, backprojectFilterMode);
    } else if (inverseKey === "fk") {
      const migrated = fkMigrate(measurement, { ...inverseOptions, acquiredScans });
      volume = migrated.volume;
      stoltZeroedFraction = migrated.zeroedFraction;
    } else {
      volume = lightConeReconstruct(measurement, {
        scanSide,
        bins,
        width,
        range,
        acquiredScans,
        scanOrder,
        radiometricPower,
        snr
      });
    }
    const reconstruction = extractLctResult(volume, {
      scanSide,
      bins,
      width,
      maxDepth,
      geometry: payload.geometry
    });
    finalReconstruction = reconstruction;
    postSnapshot(jobId, {
      positions: reconstruction.positions,
      weights: reconstruction.weights,
      frontProjection: reconstruction.frontProjection,
      projectionWidth: scanSide,
      projectionHeight: scanSide,
      acquiredScans,
      totalScans: payload.budget,
      acquiredRows: rowStages[stage],
      totalRows: scanSide
    });
    postProgress(
      jobId,
      0.24 + 0.7 * (stage + 1) / rowStages.length,
      `${ACTIVE_INVERSES[inverseKey].progressLabel} from ${rowStages[stage]}/${scanSide} scanned rows`
    );
    await yieldToWorker();
    if (currentJobId !== jobId) return null;
  }

  const evaluation = evaluateLctResult(
    finalReconstruction,
    samples,
    { scanSide, width, maxDepth, geometry: payload.geometry }
  );
  postProgress(jobId, 0.97, "nonnegative hidden volume complete");
  return {
    positions: finalReconstruction.positions,
    weights: finalReconstruction.weights,
    frontProjection: finalReconstruction.frontProjection,
    truthProjection: evaluation.truthProjection,
    projectionWidth: scanSide,
    projectionHeight: scanSide,
    measurement,
    measurementWidth: bins,
    measurementHeight: payload.budget,
    scanOrder,
    scanSide,
    resultKind: "volume",
    resultLabel: `${ACTIVE_INVERSES[inverseKey].label} volume`,
    forward: "confocal transient A x (co-located laser + SPAD)",
    inverseKey,
    inverseLabel: ACTIVE_INVERSES[inverseKey].label,
    inverse: ACTIVE_INVERSES[inverseKey].inverse,
    limits: resolutionLimits({
      bins,
      range,
      pulseSigma: 0.72,
      width,
      standoff: Math.abs(payload.geometry.hiddenOrigin[2] - payload.geometry.wallZ),
      scanSide,
      maxDepth
    }),
    stoltZeroedFraction: inverseKey === "fk" ? stoltZeroedFraction : null,
    material,
    specularCoverage,
    scope: `Scaled synthetic ${scanSide}x${scanSide}x${bins}; ideal calibration, no pile-up or higher-order interreflection. `
      + (material === "specular"
        ? `Ideal mirror BRDF, 3-bounce only: just ${(specularCoverage * 100).toFixed(1)}% of surface samples have a normal that reaches the scanned raster, so the rest of the object is unobserved rather than absent. The LCT's z^k radiometric scaling assumes a Lambertian target and is inapplicable here -- that mismatch is what this branch exists to expose. `
        : "")
      + ACTIVE_INVERSES[inverseKey].scope,
    measurementLabel: `${scanSide}x${scanSide} wall raster x ${bins} time bins`,
    metricLabel: "front-view fidelity",
    metricValue: `${Math.round(evaluation.correlation * 100)}% ZNCC / ${Math.round(evaluation.depthError * 100)} cm median depth error`,
    resultScore: evaluation.correlation,
    materialLabel: isDiffuse ? "matte diffuse target; z^4 compensation" : "high-albedo retroreflective target; z^2 compensation"
  };
}

function simulateConfocalTransient(samples, scanPoints, bins, range, payload, isDiffuse, material = "diffuse") {
  const measurement = new Float64Array(payload.budget * bins);
  const origin = payload.geometry.hiddenOrigin;
  const pulseSigma = 0.72;

  if (material === "specular") {
    const coverage = simulateSpecularConfocal(measurement, samples, scanPoints, bins, range, payload, pulseSigma);
    return { measurement: finalizePhotonCounts(measurement, payload), coverage };
  }

  for (let scan = 0; scan < payload.budget; scan += 1) {
    const sx = scanPoints[scan * 3];
    const sy = scanPoints[scan * 3 + 1];
    const sz = scanPoints[scan * 3 + 2];
    for (let sample = 0; sample < samples.count; sample += 1) {
      const px = samples.positions[sample * 3] + origin[0];
      const py = samples.positions[sample * 3 + 1] + origin[1];
      const pz = samples.positions[sample * 3 + 2] + origin[2];
      const dx = px - sx;
      const dy = py - sy;
      const dz = pz - sz;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const center = distance * 2 / range * (bins - 1);
      if (center < 2 || center >= bins - 2) continue;
      const invDistance = 1 / Math.max(1e-5, distance);
      const nx = samples.normals[sample * 3];
      const ny = samples.normals[sample * 3 + 1];
      const nz = samples.normals[sample * 3 + 2];
      const facing = Math.max(0, (nx * -dx + ny * -dy + nz * -dz) * invDistance);
      if (facing <= 0.001) continue;
      const falloff = isDiffuse
        ? facing * facing / Math.max(1e-5, distance ** 4)
        : (0.2 + 0.8 * facing) / Math.max(1e-5, distance ** 2);
      const firstBin = Math.floor(center - 2.5 * pulseSigma);
      const lastBin = Math.ceil(center + 2.5 * pulseSigma);
      let kernelSum = 0;
      for (let bin = firstBin; bin <= lastBin; bin += 1) {
        if (bin < 0 || bin >= bins) continue;
        const offset = (bin - center) / pulseSigma;
        kernelSum += Math.exp(-0.5 * offset * offset);
      }
      for (let bin = firstBin; bin <= lastBin; bin += 1) {
        if (bin < 0 || bin >= bins) continue;
        const offset = (bin - center) / pulseSigma;
        const pulse = Math.exp(-0.5 * offset * offset) / Math.max(1e-8, kernelSum);
        measurement[scan * bins + bin] += falloff * pulse;
      }
    }
  }

  return { measurement: finalizePhotonCounts(measurement, payload), coverage: 1 };
}

// Ideal mirror BRDF. Under confocal acquisition the laser and detector share a wall point, so
// the ONLY path that returns is emission along the surface normal -- a measure-zero event for
// an ordinary path tracer, which is why the released implementation ships a custom sampler
// rather than sampling the BRDF.
//
// The consequence is the point of the branch: only surface points whose normal happens to
// intersect the scanned raster contribute at all. The rest of the object is unobserved, not
// absent, and the reconstruction is legitimately sparse. The returned coverage fraction is
// what the UI needs in order to say that honestly.
function simulateSpecularConfocal(measurement, samples, scanPoints, bins, range, payload, pulseSigma) {
  const origin = payload.geometry.hiddenOrigin;
  const relay = payload.geometry.relayBounds;
  const wallPlaneZ = payload.geometry.wallZ + 0.1;
  const scanSide = Math.round(Math.sqrt(payload.budget));
  const lastBin = bins - 1;
  let contributing = 0;

  for (let sample = 0; sample < samples.count; sample += 1) {
    const px = samples.positions[sample * 3] + origin[0];
    const py = samples.positions[sample * 3 + 1] + origin[1];
    const pz = samples.positions[sample * 3 + 2] + origin[2];
    const nx = samples.normals[sample * 3];
    const ny = samples.normals[sample * 3 + 1];
    const nz = samples.normals[sample * 3 + 2];
    // The wall sits at lower z than the hidden volume, so a normal that can reach it points
    // in -z. Anything else reflects away and is never measured.
    if (nz >= -1e-4) continue;
    const t = (wallPlaneZ - pz) / nz;
    if (t <= 0) continue;
    const wx = px + nx * t;
    const wy = py + ny * t;
    if (wx < relay[0] || wx > relay[1] || wy < relay[2] || wy > relay[3]) continue;

    // Snap to the nearest scanned cell; a wall point between raster positions is not measured.
    const gridX = Math.round((wx - relay[0]) / Math.max(1e-9, relay[1] - relay[0]) * (scanSide - 1));
    const gridY = Math.round((wy - relay[2]) / Math.max(1e-9, relay[3] - relay[2]) * (scanSide - 1));
    if (gridX < 0 || gridX >= scanSide || gridY < 0 || gridY >= scanSide) continue;
    const scan = gridY * scanSide + gridX;
    contributing += 1;

    const center = t * 2 / range * lastBin;
    if (center < 2 || center >= bins - 2) continue;
    const falloff = 1 / Math.max(1e-5, t * t);
    const firstBin = Math.floor(center - 2.5 * pulseSigma);
    const finalBin = Math.ceil(center + 2.5 * pulseSigma);
    let kernelSum = 0;
    for (let bin = firstBin; bin <= finalBin; bin += 1) {
      if (bin < 0 || bin >= bins) continue;
      const offset = (bin - center) / pulseSigma;
      kernelSum += Math.exp(-0.5 * offset * offset);
    }
    for (let bin = firstBin; bin <= finalBin; bin += 1) {
      if (bin < 0 || bin >= bins) continue;
      const offset = (bin - center) / pulseSigma;
      const pulse = Math.exp(-0.5 * offset * offset) / Math.max(1e-8, kernelSum);
      measurement[scan * bins + bin] += falloff * pulse;
    }
  }
  return samples.count > 0 ? contributing / samples.count : 0;
}

function finalizePhotonCounts(measurement, payload) {
  normalizeArray(measurement);
  const rng = mulberry32(hashSeed(payload.target, payload.budget, 101));
  const peakPhotons = 90 + 1550 * Math.exp(-5.2 * payload.noise);
  const background = 0.15 + payload.noise * 4.5;
  const output = new Float32Array(measurement.length);
  for (let index = 0; index < measurement.length; index += 1) {
    const expected = measurement[index] * peakPhotons + background;
    output[index] = Math.max(0, poissonSample(expected, rng) - background) / peakPhotons;
  }
  return output;
}

function lightConeReconstruct(measurement, options) {
  const { scanSide: n, bins: m, width, range, acquiredScans, scanOrder, radiometricPower, snr } = options;
  const kernel = getLctKernel(n, m, width, range);
  const pz = m * 2;
  const py = n * 2;
  const px = n * 2;
  const real = new Float64Array(pz * py * px);
  const imag = new Float64Array(real.length);
  const acquired = new Uint8Array(n * n);
  for (let index = 0; index < acquiredScans; index += 1) acquired[scanOrder[index]] = 1;

  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const scan = y * n + x;
      if (!acquired[scan]) continue;
      for (let warpedZ = 0; warpedZ < m; warpedZ += 1) {
        let value = 0;
        const entries = kernel.forwardRows[warpedZ];
        for (let entry = 0; entry < entries.length; entry += 2) {
          const sourceZ = entries[entry];
          const weight = entries[entry + 1];
          const depthScale = sourceZ / Math.max(1, m - 1);
          value += weight * measurement[scan * m + sourceZ] * depthScale ** radiometricPower;
        }
        real[(warpedZ * py + y) * px + x] = value;
      }
    }
  }

  fft3d(real, imag, pz, py, px, false);
  const lambda = 1 / Math.max(1e-4, snr);
  for (let index = 0; index < real.length; index += 1) {
    const dataReal = real[index];
    const dataImag = imag[index];
    const psfReal = kernel.psfReal[index];
    const psfImag = kernel.psfImag[index];
    const denominator = psfReal * psfReal + psfImag * psfImag + lambda;
    real[index] = (dataReal * psfReal + dataImag * psfImag) / denominator;
    imag[index] = (dataImag * psfReal - dataReal * psfImag) / denominator;
  }
  fft3d(real, imag, pz, py, px, true);

  const volume = new Float32Array(m * n * n);
  for (let z = 0; z < m; z += 1) {
    const entries = kernel.inverseRows[z];
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let value = 0;
        for (let entry = 0; entry < entries.length; entry += 2) {
          const warpedZ = entries[entry];
          const weight = entries[entry + 1];
          value += weight * real[(warpedZ * py + y) * px + x];
        }
        volume[(z * n + y) * n + x] = Math.max(0, value);
      }
    }
  }
  return volume;
}

// ---------------------------------------------------------------------------
// Filtered backprojection (Velten et al. 2012 lineage).
//
// This is the adjoint A^T y, not an inverse. Because the acquisition is confocal the
// laser and detector share a wall point, so the ellipsoid of constant path length
// degenerates to a sphere of radius ct/2 centred on that point. Backprojection smears each
// time bin over its sphere and sums.
//
// The bin mapping below must stay identical to simulateConfocalTransient's, or the spheres
// land at the wrong radius and the result is a plausible-looking blur of nothing.
//
// Unlike the LCT and f-k lanes this is additive over wall points, so progressive acquisition
// is an incremental update instead of a full recomputation per stage.
function backprojectAccumulate(measurement, options, accumulator, fromIndex, toIndex) {
  const { scanSide: n, bins: m, range, maxDepth, scanOrder, geometry } = options;
  const scanPoints = makeConfocalScanGrid(n, geometry);
  const relay = geometry.relayBounds;
  const lastBin = m - 1;
  for (let voxelZ = 0; voxelZ < m; voxelZ += 1) {
    const depth = voxelZ / lastBin * maxDepth;
    const worldZ = geometry.wallZ + depth;
    for (let voxelY = 0; voxelY < n; voxelY += 1) {
      const worldY = lerp(relay[2], relay[3], voxelY / Math.max(1, n - 1));
      for (let voxelX = 0; voxelX < n; voxelX += 1) {
        const worldX = lerp(relay[0], relay[1], voxelX / Math.max(1, n - 1));
        let sum = 0;
        for (let index = fromIndex; index < toIndex; index += 1) {
          const scan = scanOrder[index];
          const dx = worldX - scanPoints[scan * 3];
          const dy = worldY - scanPoints[scan * 3 + 1];
          const dz = worldZ - scanPoints[scan * 3 + 2];
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const center = distance * 2 / range * lastBin;
          const bin = Math.floor(center);
          if (bin < 0 || bin + 1 > lastBin) continue;
          const frac = center - bin;
          sum += measurement[scan * m + bin] * (1 - frac) + measurement[scan * m + bin + 1] * frac;
        }
        accumulator[(voxelZ * n + voxelY) * n + voxelX] += sum;
      }
    }
  }
}

// Velten's heuristic sharpening: a second derivative along depth. This is NOT the ramp filter
// of a Radon inverse -- it is a high-pass chosen because the backprojection halo is
// low-frequency. Selecting "none" shows the raw adjoint, and the difference between the two
// is the point of offering both.
function backprojectFilter(accumulator, options, filter) {
  const { scanSide: n, bins: m } = options;
  const volume = new Float32Array(m * n * n);
  if (filter === "none") {
    for (let index = 0; index < volume.length; index += 1) volume[index] = Math.max(0, accumulator[index]);
    return volume;
  }
  const plane = n * n;
  for (let z = 0; z < m; z += 1) {
    for (let index = 0; index < plane; index += 1) {
      const here = accumulator[z * plane + index];
      const below = z > 0 ? accumulator[(z - 1) * plane + index] : here;
      const above = z < m - 1 ? accumulator[(z + 1) * plane + index] : here;
      volume[z * plane + index] = Math.max(0, -below + 2 * here - above);
    }
  }
  return volume;
}

// ---------------------------------------------------------------------------
// f-k migration (Lindell, Wetzstein & O'Toole, CVPR 2019).
//
// The contrast with the LCT next door is the whole reason this lane exists. Both share this
// file's FFT and the same padded grid, and nothing else:
//
//   LCT  : resample z -> z^2, deconvolve against a measured light-cone PSF with a Wiener
//          filter whose regularizer is a hand-set constant.
//   f-k  : treat the transient as an exploding-reflector wavefield and apply the change of
//          variables the scalar wave equation dictates (Stolt migration). No PSF, no filter,
//          and no tunable parameter at all.
//
// Cross-check tying the two together: the LCT's cone is coneZ = (4*slope)^2 (x^2+y^2) with
// slope = width/range, so the Stolt constant K = (n*range)/(4*m*width) = (n/m)/(4*slope) is
// the reciprocal of that slope, rescaled by the grid aspect. fkStoltConstant() is asserted
// against that identity in the test suite; if it drifts, the port is wrong.
function fkStoltConstant(n, m, width, range) {
  return (n * range) / (4 * m * width);
}

function fkMigrate(measurement, options) {
  const { scanSide: n, bins: m, width, range, maxDepth, acquiredScans, scanOrder } = options;
  const pz = m * 2;
  const py = n * 2;
  const px = n * 2;
  const real = new Float64Array(pz * py * px);
  const imag = new Float64Array(real.length);
  const acquired = new Uint8Array(n * n);
  for (let index = 0; index < acquiredScans; index += 1) acquired[scanOrder[index]] = 1;

  // Algorithm 1 line 3: attenuate by t and take the square root of intensity. Taking sqrt
  // discards phase; the paper measures the cost (11 mm mean AE with phase, 19 mm without,
  // 16 mm after 50 HIO iterations) and concludes phase retrieval is not worth it here.
  const lastBin = m - 1;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const scan = y * n + x;
      if (!acquired[scan]) continue;
      for (let t = 0; t < m; t += 1) {
        const amplitude = Math.sqrt(Math.max(0, measurement[scan * m + t]));
        real[(t * py + y) * px + x] = (t / lastBin) * amplitude;
      }
    }
  }

  fft3d(real, imag, pz, py, px, false);

  // Stolt interpolation. Three traps, all of them silent if you get them wrong:
  //   1. the resampling is 1-D along z only -- x and y query coordinates pass through
  //      untouched, so no 3-D interpolator is needed;
  //   2. it is not in-place;
  //   3. this file's fft3d is unshifted, so the signed frequency index has to be folded into
  //      the index arithmetic rather than handled by an fftshift.
  const outReal = new Float64Array(real.length);
  const outImag = new Float64Array(real.length);
  const K = fkStoltConstant(n, m, width, range);
  const signed = (index, size) => (index < (size >> 1) ? index : index - size);
  const unsigned = (value, size) => (value >= 0 ? value : value + size);
  let zeroedBins = 0;
  for (let iz = 0; iz < pz; iz += 1) {
    const sz = signed(iz, pz);
    const zn = sz / m;
    for (let iy = 0; iy < py; iy += 1) {
      const yn = signed(iy, py) / n;
      for (let ix = 0; ix < px; ix += 1) {
        const out = (iz * py + iy) * px + ix;
        // Only the positive-frequency half of the exploding-reflector field is physical.
        if (sz <= 0) { zeroedBins += 1; continue; }
        const xn = signed(ix, px) / n;
        const q = Math.sqrt(K * K * (xn * xn + yn * yn) + zn * zn);
        const target = q * m;
        const base = Math.floor(target);
        // Because q >= |zn| always, high transverse frequencies fall off the top of the
        // sampled axis and are dropped. That cutoff IS the lateral resolution limit.
        if (base < -m || base + 1 > m - 1) { zeroedBins += 1; continue; }
        const frac = target - base;
        const amplitude = Math.abs(zn) / Math.max(q, 1e-6);
        const a = (unsigned(base, pz) * py + iy) * px + ix;
        const b = (unsigned(base + 1, pz) * py + iy) * px + ix;
        outReal[out] = amplitude * (real[a] * (1 - frac) + real[b] * frac);
        outImag[out] = amplitude * (imag[a] * (1 - frac) + imag[b] * frac);
      }
    }
  }

  fft3d(outReal, outImag, pz, py, px, true);

  const volume = new Float32Array(m * n * n);
  for (let z = 0; z < m; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const source = (z * py + y) * px + x;
        const re = outReal[source];
        const im = outImag[source];
        volume[(z * n + y) * n + x] = re * re + im * im;
      }
    }
  }
  return { volume, zeroedFraction: zeroedBins / (pz * py * px) };
}

// ---------------------------------------------------------------------------
// What the physics allows, computed from the constants the forward simulator already uses.
// No inverse on this page beats dz >= c * FWHM / 2, and the displayed voxel grid is finer
// than that limit -- so the extra detail is interpolation, not measurement.
function resolutionLimits(options) {
  const { bins, range, pulseSigma, width, standoff, scanSide, maxDepth } = options;
  const fwhmBins = 2.354820045 * pulseSigma;
  const pathPerBin = range / Math.max(1, bins - 1);
  const fwhmPath = fwhmBins * pathPerBin;
  const axialLimit = fwhmPath / 2;
  // Transverse resolution degrades with standoff: a wall aperture of half-width `width`
  // viewing a point at distance `standoff` resolves no better than this.
  const transverseLimit = (Math.sqrt(width * width + standoff * standoff) / (2 * width)) * fwhmPath;
  const lateralPitch = 2 * width / Math.max(1, scanSide - 1);
  const axialPitch = maxDepth / Math.max(1, bins - 1);
  return {
    fwhmBins,
    fwhmPath,
    axialLimit,
    transverseLimit,
    lateralPitch,
    axialPitch,
    axialOversample: axialLimit / axialPitch,
    lateralOversample: transverseLimit / lateralPitch
  };
}

function getLctKernel(n, m, width, range) {
  const key = `${n}:${m}:${width.toFixed(5)}:${range.toFixed(5)}`;
  const cached = lctKernelCache.get(key);
  if (cached) return cached;

  const forwardRows = Array.from({ length: m }, () => []);
  const inverseRows = Array.from({ length: m }, () => []);
  for (let sample = 0; sample < m * m; sample += 1) {
    const row = Math.floor(sample / m);
    const column = Math.ceil(Math.sqrt(sample + 1)) - 1;
    const value = 1 / Math.sqrt(sample + 1) / m;
    forwardRows[row].push(column, value);
    inverseRows[column].push(row, value);
  }
  for (let row = 0; row < m; row += 1) {
    forwardRows[row] = mergeSparseEntries(forwardRows[row]);
    inverseRows[row] = mergeSparseEntries(inverseRows[row]);
  }

  const pz = m * 2;
  const py = n * 2;
  const px = n * 2;
  const psfReal = new Float64Array(pz * py * px);
  const psfImag = new Float64Array(psfReal.length);
  const slopeScale = (4 * width / range) ** 2;
  const amplitude = 1 / Math.sqrt(px * py);
  for (let y = 0; y < py; y += 1) {
    const normalizedY = -1 + 2 * y / Math.max(1, py - 1);
    for (let x = 0; x < px; x += 1) {
      const normalizedX = -1 + 2 * x / Math.max(1, px - 1);
      const coneZ = slopeScale * (normalizedX * normalizedX + normalizedY * normalizedY);
      const z = clamp(Math.round(coneZ * (pz - 1) * 0.5), 0, pz - 1);
      const shiftedY = (y + n) % py;
      const shiftedX = (x + n) % px;
      psfReal[(z * py + shiftedY) * px + shiftedX] = amplitude;
    }
  }
  fft3d(psfReal, psfImag, pz, py, px, false);
  const kernel = { forwardRows, inverseRows, psfReal, psfImag };
  lctKernelCache.set(key, kernel);
  return kernel;
}

function mergeSparseEntries(entries) {
  const merged = new Map();
  for (let index = 0; index < entries.length; index += 2) {
    merged.set(entries[index], (merged.get(entries[index]) || 0) + entries[index + 1]);
  }
  const output = [];
  for (const [column, value] of merged) output.push(column, value);
  return output;
}

function extractLctResult(volume, options) {
  const { scanSide: n, bins: m, width, maxDepth, geometry } = options;
  const frontProjection = new Float32Array(n * n);
  const depthMap = new Float32Array(n * n);
  let globalMax = 0;

  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let bestValue = 0;
      let bestDepth = 0;
      for (let z = 1; z < m; z += 1) {
        const value = volume[(z * n + y) * n + x];
        if (value > bestValue) {
          bestValue = value;
          bestDepth = z / (m - 1) * maxDepth;
        }
      }
      const imageIndex = (n - 1 - y) * n + x;
      frontProjection[imageIndex] = bestValue;
      depthMap[imageIndex] = bestDepth;
      globalMax = Math.max(globalMax, bestValue);
    }
  }
  if (globalMax > 0) {
    for (let index = 0; index < frontProjection.length; index += 1) {
      frontProjection[index] /= globalMax;
    }
  }

  const positions = [];
  const weights = [];
  const centerY = (geometry.relayBounds[2] + geometry.relayBounds[3]) * 0.5;
  const localYShift = centerY - geometry.hiddenOrigin[1];
  const baseDepth = geometry.hiddenOrigin[2] - geometry.wallZ;
  const cutoff = Math.max(n >= 32 ? 0.2 : n >= 16 ? 0.24 : 0.28, otsuThreshold(frontProjection));
  for (let imageY = 0; imageY < n; imageY += 1) {
    const y = n - 1 - imageY;
    for (let x = 0; x < n; x += 1) {
      const imageIndex = imageY * n + x;
      const value = frontProjection[imageIndex];
      if (value < cutoff) continue;
      const depth = depthMap[imageIndex];
      positions.push(
        lerp(-width, width, x / Math.max(1, n - 1)),
        lerp(-width, width, y / Math.max(1, n - 1)) + localYShift,
        depth - baseDepth
      );
      weights.push(value);
    }
  }
  return {
    positions: new Float32Array(positions),
    weights: new Float32Array(weights),
    frontProjection,
    depthMap
  };
}

function otsuThreshold(values) {
  const binCount = 64;
  const histogram = new Uint32Array(binCount);
  for (const value of values) {
    histogram[clamp(Math.floor(value * (binCount - 1)), 0, binCount - 1)] += 1;
  }
  let weightedTotal = 0;
  for (let bin = 0; bin < binCount; bin += 1) weightedTotal += bin * histogram[bin];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestBin = 0;
  for (let bin = 0; bin < binCount; bin += 1) {
    backgroundWeight += histogram[bin];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = values.length - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += bin * histogram[bin];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const separation = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (separation > bestVariance) {
      bestVariance = separation;
      bestBin = bin;
    }
  }
  return bestBin / Math.max(1, binCount - 1);
}

function evaluateLctResult(reconstruction, samples, options) {
  const { scanSide: n, width, maxDepth, geometry } = options;
  const truthProjection = new Float32Array(n * n);
  const truthDepth = new Float32Array(n * n);
  const truthCounts = new Uint16Array(n * n);
  const centerY = (geometry.relayBounds[2] + geometry.relayBounds[3]) * 0.5;

  for (let sample = 0; sample < samples.count; sample += 1) {
    const solverX = samples.positions[sample * 3];
    const solverY = samples.positions[sample * 3 + 1] + geometry.hiddenOrigin[1] - centerY;
    const depth = samples.positions[sample * 3 + 2] + geometry.hiddenOrigin[2] - geometry.wallZ;
    const x = Math.round((solverX + width) / (2 * width) * (n - 1));
    const y = Math.round((solverY + width) / (2 * width) * (n - 1));
    if (x < 0 || x >= n || y < 0 || y >= n || depth < 0 || depth > maxDepth) continue;
    const imageIndex = (n - 1 - y) * n + x;
    truthProjection[imageIndex] = 1;
    truthDepth[imageIndex] += depth;
    truthCounts[imageIndex] += 1;
  }
  blurImage(truthProjection, n, 1);
  normalizeArray(truthProjection);
  const correlation = zeroMeanCorrelation(truthProjection, reconstruction.frontProjection);
  const depthErrors = [];
  for (let index = 0; index < truthProjection.length; index += 1) {
    if (truthCounts[index] === 0 || reconstruction.frontProjection[index] < 0.12) continue;
    const expectedDepth = truthDepth[index] / truthCounts[index];
    depthErrors.push(Math.abs(expectedDepth - reconstruction.depthMap[index]));
  }
  // 50th percentile, not a mean absolute error. The label downstream must say "median".
  depthErrors.sort((a, b) => a - b);
  const depthError = depthErrors.length ? depthErrors[Math.floor(depthErrors.length * 0.5)] : maxDepth;
  return { correlation, depthError, truthProjection };
}

function fft3d(real, imag, nz, ny, nx, inverse) {
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) fftLine(real, imag, (z * ny + y) * nx, 1, nx, inverse);
  }
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) fftLine(real, imag, z * ny * nx + x, nx, ny, inverse);
  }
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) fftLine(real, imag, y * nx + x, ny * nx, nz, inverse);
  }
  if (!inverse) return;
  const scale = 1 / (nx * ny * nz);
  for (let index = 0; index < real.length; index += 1) {
    real[index] *= scale;
    imag[index] *= scale;
  }
}

function fftLine(real, imag, offset, stride, length, inverse) {
  const plan = getFftPlan(length);
  for (let index = 0; index < length; index += 1) {
    const reverse = plan.reversal[index];
    if (reverse <= index) continue;
    const a = offset + index * stride;
    const b = offset + reverse * stride;
    [real[a], real[b]] = [real[b], real[a]];
    [imag[a], imag[b]] = [imag[b], imag[a]];
  }
  for (const stage of plan.stages) {
    const half = stage.length >> 1;
    for (let start = 0; start < length; start += stage.length) {
      for (let j = 0; j < half; j += 1) {
        const even = offset + (start + j) * stride;
        const odd = offset + (start + j + half) * stride;
        const wr = stage.cos[j];
        const wi = inverse ? -stage.sin[j] : stage.sin[j];
        const oddReal = real[odd] * wr - imag[odd] * wi;
        const oddImag = real[odd] * wi + imag[odd] * wr;
        const evenReal = real[even];
        const evenImag = imag[even];
        real[even] = evenReal + oddReal;
        imag[even] = evenImag + oddImag;
        real[odd] = evenReal - oddReal;
        imag[odd] = evenImag - oddImag;
      }
    }
  }
}

function getFftPlan(length) {
  const cached = fftPlanCache.get(length);
  if (cached) return cached;
  const bits = Math.round(Math.log2(length));
  if (2 ** bits !== length) throw new Error("LCT FFT dimensions must be powers of two");
  const reversal = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    let value = index;
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>>= 1;
    }
    reversal[index] = reversed;
  }
  const stages = [];
  for (let stageLength = 2; stageLength <= length; stageLength *= 2) {
    const half = stageLength >> 1;
    const cos = new Float64Array(half);
    const sin = new Float64Array(half);
    for (let j = 0; j < half; j += 1) {
      const angle = -2 * Math.PI * j / stageLength;
      cos[j] = Math.cos(angle);
      sin[j] = Math.sin(angle);
    }
    stages.push({ length: stageLength, cos, sin });
  }
  const plan = { reversal, stages };
  fftPlanCache.set(length, plan);
  return plan;
}

function makeConfocalScanGrid(side, geometry) {
  const points = new Float32Array(side * side * 3);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const index = y * side + x;
      points[index * 3] = lerp(geometry.relayBounds[0], geometry.relayBounds[1], x / Math.max(1, side - 1));
      points[index * 3 + 1] = lerp(geometry.relayBounds[2], geometry.relayBounds[3], y / Math.max(1, side - 1));
      points[index * 3 + 2] = geometry.wallZ + 0.1;
    }
  }
  return points;
}

function makeSerpentineOrder(side) {
  const order = new Uint32Array(side * side);
  let cursor = 0;
  for (let y = 0; y < side; y += 1) {
    for (let step = 0; step < side; step += 1) {
      const x = y % 2 === 0 ? step : side - 1 - step;
      order[cursor++] = y * side + x;
    }
  }
  return order;
}

function progressiveRowStages(side) {
  const stages = [];
  const stageCount = Math.min(8, side);
  for (let stage = 1; stage <= stageCount; stage += 1) {
    stages.push(Math.max(1, Math.round(stage / stageCount * side)));
  }
  return [...new Set(stages)];
}

function postEvidence(jobId, evidence, transferKeys) {
  const transferableEvidence = { ...evidence };
  for (const key of transferKeys) {
    if (transferableEvidence[key]?.slice) transferableEvidence[key] = transferableEvidence[key].slice();
  }
  self.postMessage(
    { type: "evidence", jobId, evidence: transferableEvidence },
    collectTransferBuffers(transferableEvidence, transferKeys)
  );
}

function postSnapshot(jobId, snapshot) {
  const transferableSnapshot = { ...snapshot };
  const transferKeys = ["positions", "weights", "frontProjection", "aux"];
  for (const key of transferKeys) {
    if (transferableSnapshot[key]?.slice) transferableSnapshot[key] = transferableSnapshot[key].slice();
  }
  self.postMessage(
    { type: "snapshot", jobId, snapshot: transferableSnapshot },
    collectTransferBuffers(transferableSnapshot, transferKeys)
  );
}

function collectTransferBuffers(object, keys) {
  const seen = new Set();
  const buffers = [];
  for (const key of keys) {
    const value = object[key];
    if (!value?.buffer || seen.has(value.buffer)) continue;
    seen.add(value.buffer);
    buffers.push(value.buffer);
  }
  return buffers;
}

function yieldToWorker() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function poissonSample(lambda, rng) {
  if (lambda <= 0) return 0;
  if (lambda > 36) return Math.max(0, Math.round(lambda + gaussian(rng) * Math.sqrt(lambda)));
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng();
  } while (product > limit && count < 256);
  return count - 1;
}

async function runStructured(payload, jobId) {
  const samples = unpackSamples(payload.samples);
  const side = 16;
  const coefficientCount = side * side;
  const truth = rasterizeTarget(samples.positions, side);
  const measurement = new Float32Array(payload.budget);
  const positiveExposure = new Float32Array(payload.budget);
  const negativeExposure = new Float32Array(payload.budget);
  const rng = mulberry32(hashSeed(payload.target, payload.budget, 211));

  for (let pair = 0; pair < payload.budget; pair += 1) {
    const row = grayCode(pair % coefficientCount);
    let positive = 0;
    let negative = 0;
    for (let pixel = 0; pixel < coefficientCount; pixel += 1) {
      if (walshSign(row, pixel) > 0) positive += truth[pixel];
      else negative += truth[pixel];
    }
    positive /= coefficientCount;
    negative /= coefficientCount;
    const commonAmbient = 0.035 + gaussian(rng) * payload.noise * 0.0015;
    const readNoise = 0.00045 + payload.noise * 0.006;
    positiveExposure[pair] = commonAmbient + positive + gaussian(rng) * readNoise * Math.sqrt(0.03 + positive);
    negativeExposure[pair] = commonAmbient + negative + gaussian(rng) * readNoise * Math.sqrt(0.03 + negative);
    measurement[pair] = positiveExposure[pair] - negativeExposure[pair];
  }
  postEvidence(jobId, {
    measurement,
    positiveExposure,
    negativeExposure,
    measurementWidth: payload.budget,
    measurementHeight: 1,
    patternSide: side,
    totalPairs: payload.budget,
    totalExposures: payload.budget * 2,
    measurementLabel: `${payload.budget} Hadamard/complement pairs = ${payload.budget * 2} camera exposures`
  }, ["measurement", "positiveExposure", "negativeExposure"]);
  postProgress(jobId, 0.2, "paired projector exposures simulated");

  const stages = progressiveAcquisitionStages(payload.budget);
  let recovered = null;
  let pointResult = null;
  for (let stage = 0; stage < stages.length; stage += 1) {
    const acquiredPairs = stages[stage];
    recovered = invertHadamard(measurement, coefficientCount, acquiredPairs);
    if (acquiredPairs < coefficientCount) blurImage(recovered, side, 1);
    normalizeArray(recovered);
    pointResult = imageToPoints(recovered, side, payload.noise);
    postSnapshot(jobId, {
      ...pointResult,
      aux: recovered,
      auxWidth: side,
      auxHeight: side,
      acquiredUnits: acquiredPairs,
      totalUnits: payload.budget,
      acquiredPairs,
      totalPairs: payload.budget,
      acquiredExposures: acquiredPairs * 2,
      totalExposures: payload.budget * 2
    });
    postProgress(
      jobId,
      0.22 + 0.72 * (stage + 1) / stages.length,
      `inverse Hadamard image from ${acquiredPairs}/${payload.budget} pattern pairs`
    );
    await yieldToWorker();
    if (currentJobId !== jobId) return null;
  }

  const correlation = zeroMeanCorrelation(truth, recovered);
  const sampledRank = Math.min(1, payload.budget / coefficientCount);
  postProgress(jobId, 0.97, "reciprocal image complete");

  return {
    ...pointResult,
    measurement,
    positiveExposure,
    negativeExposure,
    measurementWidth: payload.budget,
    measurementHeight: 1,
    aux: recovered,
    auxWidth: side,
    auxHeight: side,
    resultKind: "image",
    resultLabel: "reciprocal 2D virtual image",
    forward: "paired Hadamard/complement projections measuring one transport row",
    inverse: "ambient-cancelled coefficient averaging + inverse Hadamard transform",
    scope: "Reciprocal image only; transport reciprocity does not supply metric depth",
    measurementLabel: `${payload.budget} pattern pairs = ${payload.budget * 2} ordinary camera exposures`,
    metricLabel: "dual-image fidelity",
    metricValue: `${Math.round(correlation * 100)}% corr / ${Math.round(sampledRank * 100)}% rank`,
    resultScore: correlation,
    totalPairs: payload.budget,
    totalExposures: payload.budget * 2
  };
}

async function runPassive(payload, jobId) {
  const samples = unpackSamples(payload.samples);
  const angularBins = 64;
  const floorSamples = 64;
  const frames = payload.budget;
  const thetaMin = -0.15;
  const thetaMax = 1.35;
  const truth = angularProfile(samples.positions, payload.geometry, angularBins, thetaMin, thetaMax);
  const measurement = new Float32Array(frames * floorSamples);
  const rng = mulberry32(hashSeed(payload.target, payload.budget, 307));
  const background = new Float32Array(floorSamples);
  for (let floor = 0; floor < floorSamples; floor += 1) {
    background[floor] = 0.17 + 0.035 * Math.sin(floor * 0.12) + floor / floorSamples * 0.025;
  }

  // y = A x, with A carrying the arctangent penumbra mapping and the cos/r^2 floor falloff.
  const aperture = payload.aperture === "none" || payload.aperture === "occluder" ? payload.aperture : "edge";
  const transfer = buildApertureTransfer(aperture, floorSamples, angularBins, payload.geometry, thetaMin, thetaMax);
  const spectrum = edgeOperatorSpectrum(transfer, floorSamples, angularBins);
  const apertureRanks = apertureRankComparison(floorSamples, angularBins, payload.geometry, thetaMin, thetaMax);
  const clean = new Float64Array(floorSamples);
  let cleanPeak = 0;
  for (let floor = 0; floor < floorSamples; floor += 1) {
    let sum = 0;
    for (let angle = 0; angle < angularBins; angle += 1) {
      sum += transfer[floor * angularBins + angle] * truth[angle];
    }
    clean[floor] = sum;
    cleanPeak = Math.max(cleanPeak, sum);
  }
  // Scale the penumbra to a realistic contrast over the ambient floor. The relative shape --
  // including the falloff that makes the informative far samples the dimmest -- is preserved.
  const contrast = 0.42 / Math.max(1e-9, cleanPeak);
  for (let floor = 0; floor < floorSamples; floor += 1) clean[floor] *= contrast;

  for (let frame = 0; frame < frames; frame += 1) {
    const gain = 0.93 + 0.07 * Math.sin(frame * 0.173 + 0.4);
    const ambientDrift = 0.006 * Math.sin(frame * 0.071);
    for (let floor = 0; floor < floorSamples; floor += 1) {
      const signal = background[floor] + ambientDrift + gain * clean[floor];
      const shotNoise = (0.0015 + payload.noise * 0.018) * Math.sqrt(Math.max(0.02, signal));
      measurement[frame * floorSamples + floor] = signal + gaussian(rng) * shotNoise;
    }
  }
  // Prior strength scaled to the operator and the known noise level. It is a stated capture
  // parameter rather than an estimate from the data, and the panel says so.
  const gramScale = spectrum.singular[0] * spectrum.singular[0];
  const lambda = gramScale * (0.004 + payload.noise * 0.06);
  postEvidence(jobId, {
    measurement,
    background,
    measurementWidth: frames,
    measurementHeight: floorSamples,
    totalFrames: frames,
    measurementLabel: `${frames} ordinary RGB frames x ${floorSamples} calibrated floor samples`
  }, ["measurement", "background"]);
  postProgress(jobId, 0.2, "calibrated floor-penumbra exposure stack complete");

  const stages = progressiveAcquisitionStages(frames);
  let profile = null;
  let pointResult = null;
  for (let stage = 0; stage < stages.length; stage += 1) {
    const acquiredFrames = stages[stage];
    profile = reconstructPenumbraProfile(measurement, background, acquiredFrames, angularBins, {
      floorSamples, rows: transfer, lambda
    });
    pointResult = profileToAngularRays(profile, thetaMin, thetaMax, payload.noise);
    postSnapshot(jobId, {
      ...pointResult,
      aux: profile,
      auxWidth: angularBins,
      auxHeight: 1,
      acquiredUnits: acquiredFrames,
      totalUnits: frames,
      acquiredFrames,
      totalFrames: frames
    });
    postProgress(
      jobId,
      0.22 + 0.72 * (stage + 1) / stages.length,
      `edge-transfer inverse from ${acquiredFrames}/${frames} RGB frames`
    );
    await yieldToWorker();
    if (currentJobId !== jobId) return null;
  }

  const correlation = zeroMeanCorrelation(truth, profile);
  postProgress(jobId, 0.97, "angular uncertainty fan complete");

  return {
    ...pointResult,
    measurement,
    measurementWidth: frames,
    measurementHeight: floorSamples,
    aux: profile,
    auxWidth: angularBins,
    auxHeight: 1,
    resultKind: "angular",
    resultLabel: "1D angular radiance",
    forward: "edge-transfer integral with arctangent penumbra mapping and cos/r^2 floor falloff",
    inverse: "frame averaging + nonnegative Tikhonov solve against the edge-transfer operator",
    operatorSpectrum: spectrum.singular,
    usableDirections: spectrum.usableDirections,
    effectiveRank: spectrum.effectiveRank,
    conditionNumber: spectrum.conditionNumber,
    aperture,
    apertureRanks,
    scope: `Aperture "${aperture}": with no occluder at all the operator collapses to `
      + `${apertureRanks.none.usableDirections} usable direction, because every floor sample sees the same `
      + `hidden range up to a smooth falloff. A knife edge gives ${apertureRanks.edge.usableDirections} and a `
      + `finite occluder ${apertureRanks.occluder.usableDirections}. Occlusion is what makes this solvable at `
      + `all -- it adds no measurements, it makes the ones you have independent. `
      + `One edge recovers angle, not object shape, height, or range. The transfer operator's `
      + `condition number is ${spectrum.conditionNumber.toExponential(1)} and only `
      + `${spectrum.usableDirections} of ${angularBins} singular directions sit above 1% of the largest, `
      + `so structure beyond those comes from the smoothness prior rather than from the measurement. `
      + `Repeated frames of a static scene buy signal-to-noise and never rank.`,
    measurementLabel: `${frames} ordinary RGB frames x ${floorSamples} calibrated floor samples`,
    metricLabel: "angular-profile correlation",
    metricValue: `${Math.round(correlation * 100)}% angular correlation`,
    resultScore: correlation,
    totalFrames: frames,
    background
  };
}

function invertHadamard(measurement, coefficientCount, acquiredCount = measurement.length) {
  const coefficientSums = new Float64Array(coefficientCount);
  const coefficientSamples = new Uint16Array(coefficientCount);
  for (let pattern = 0; pattern < Math.min(acquiredCount, measurement.length); pattern += 1) {
    const row = grayCode(pattern % coefficientCount);
    coefficientSums[row] += measurement[pattern];
    coefficientSamples[row] += 1;
  }
  const recovered = new Float32Array(coefficientCount);
  for (let pixel = 0; pixel < coefficientCount; pixel += 1) {
    let value = 0;
    for (let row = 0; row < coefficientCount; row += 1) {
      if (!coefficientSamples[row]) continue;
      value += walshSign(row, pixel) * coefficientSums[row] / coefficientSamples[row];
    }
    recovered[pixel] = Math.max(0, value);
  }
  return recovered;
}

// The edge-transfer operator.
//
// The previous forward model integrated the angular profile straight along the floor index,
// so angle bin i landed on floor sample i and every weight was 1. That makes A an exact
// lower-triangular matrix of ones, whose inverse is a one-line finite difference -- which is
// why a single frame recovered 99.5% of the profile and the noise slider barely mattered.
// A real corner camera is not that.
//
// Two terms restore the conditioning that matters:
//
//   1. The penumbra boundary moves as an ARCTANGENT of floor position, not linearly. Equal
//      steps along the floor are not equal steps in hidden azimuth, so grazing angles are
//      compressed into a handful of floor samples and are correspondingly hard to recover.
//   2. Floor irradiance falls off as cos/r^2. The samples that carry the new angular
//      information at large offsets are also the dimmest ones.
//
// Together these make the operator genuinely ill-conditioned, which is the property the lane
// is supposed to be teaching.
function buildEdgeTransfer(floorSamples, angularBins, geometry, thetaMin, thetaMax) {
  return buildApertureTransfer("edge", floorSamples, angularBins, geometry, thetaMin, thetaMax);
}

// Spectra for all three apertures over identical geometry. Cheap -- a 64x64 Gram plus a Jacobi
// sweep each -- so the comparison can ship with every passive result rather than behind a
// toggle nobody presses.
function apertureRankComparison(floorSamples, angularBins, geometry, thetaMin, thetaMax) {
  const out = {};
  for (const aperture of ["none", "edge", "occluder"]) {
    const rows = buildApertureTransfer(aperture, floorSamples, angularBins, geometry, thetaMin, thetaMax);
    const spectrum = edgeOperatorSpectrum(rows, floorSamples, angularBins);
    out[aperture] = {
      usableDirections: spectrum.usableDirections,
      effectiveRank: spectrum.effectiveRank,
      conditionNumber: spectrum.conditionNumber
    };
  }
  return out;
}

// Occluder as a coded aperture.
//
// The central claim of the occluder-based NLOS literature is that occlusion does not add
// MEASUREMENTS -- it makes the measurements you already have linearly independent. An
// unoccluded passive operator is a smooth cos/r^2 kernel whose singular values decay fast, so
// it is effectively rank-deficient no matter how many photons are collected. A binary,
// discontinuous visibility mask flattens that spectrum.
//
// Three apertures over the identical geometry, so the comparison isolates visibility:
//
//   none      every floor sample sees the whole hidden angular range. Rows differ only by a
//             smooth falloff, so they are nearly parallel and the operator is close to rank 1.
//   edge      a knife edge: each floor sample sees angles below its own cut. Triangular.
//   occluder  a finite opaque strip -- an ANTI-pinhole. Light arrives from everywhere except
//             a band whose position slides with floor position, so rows are banded rather
//             than nested.
//
// Whether the finite occluder actually beats the bare edge here is measured, not assumed.
function buildApertureTransfer(aperture, floorSamples, angularBins, geometry, thetaMin, thetaMax) {
  const rows = new Float64Array(floorSamples * angularBins);
  const standoff = Math.max(0.25, Math.abs(geometry.hiddenOrigin[2] - geometry.edgePoint[2]));
  const floorExtent = 2.6;
  const dTheta = (thetaMax - thetaMin) / Math.max(1, angularBins - 1);
  const cutScale = Math.atan2(floorExtent, standoff);
  // Angular half-width of the occluder's shadow, as seen from the floor.
  const shadowHalfWidth = (thetaMax - thetaMin) * 0.16;
  for (let floor = 0; floor < floorSamples; floor += 1) {
    const offset = (floor + 0.5) / floorSamples * floorExtent;
    const thetaCut = thetaMin + (thetaMax - thetaMin) * (Math.atan2(offset, standoff) / cutScale);
    const distanceSq = standoff * standoff + offset * offset;
    const irradiance = (standoff / Math.sqrt(distanceSq)) / distanceSq;
    for (let angle = 0; angle < angularBins; angle += 1) {
      const theta = thetaMin + (thetaMax - thetaMin) * angle / Math.max(1, angularBins - 1);
      let visible;
      if (aperture === "none") visible = 1;
      else if (aperture === "occluder") visible = Math.abs(theta - thetaCut) < shadowHalfWidth ? 0 : 1;
      else visible = theta <= thetaCut ? 1 : 0;
      if (!visible) continue;
      rows[floor * angularBins + angle] = irradiance * dTheta;
    }
  }
  return rows;
}

// Eigenvalues of a small symmetric matrix by cyclic Jacobi. Used to report what the operator
// can actually resolve, rather than only showing a reconstruction.
function symmetricEigenvalues(matrix, size) {
  const work = Float64Array.from(matrix);
  for (let sweep = 0; sweep < 12; sweep += 1) {
    let offDiagonal = 0;
    for (let p = 0; p < size - 1; p += 1) {
      for (let q = p + 1; q < size; q += 1) offDiagonal += work[p * size + q] ** 2;
    }
    if (offDiagonal < 1e-22) break;
    for (let p = 0; p < size - 1; p += 1) {
      for (let q = p + 1; q < size; q += 1) {
        const pq = work[p * size + q];
        if (Math.abs(pq) < 1e-18) continue;
        const theta = (work[q * size + q] - work[p * size + p]) / (2 * pq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < size; k += 1) {
          const kp = work[k * size + p];
          const kq = work[k * size + q];
          work[k * size + p] = c * kp - s * kq;
          work[k * size + q] = s * kp + c * kq;
        }
        for (let k = 0; k < size; k += 1) {
          const pk = work[p * size + k];
          const qk = work[q * size + k];
          work[p * size + k] = c * pk - s * qk;
          work[q * size + k] = s * pk + c * qk;
        }
      }
    }
  }
  const values = [];
  for (let i = 0; i < size; i += 1) values.push(Math.max(0, work[i * size + i]));
  return values.sort((a, b) => b - a);
}

function edgeOperatorSpectrum(rows, floorSamples, angularBins) {
  const gram = new Float64Array(angularBins * angularBins);
  for (let i = 0; i < angularBins; i += 1) {
    for (let j = i; j < angularBins; j += 1) {
      let sum = 0;
      for (let floor = 0; floor < floorSamples; floor += 1) {
        sum += rows[floor * angularBins + i] * rows[floor * angularBins + j];
      }
      gram[i * angularBins + j] = sum;
      gram[j * angularBins + i] = sum;
    }
  }
  const eigenvalues = symmetricEigenvalues(gram, angularBins);
  const singular = eigenvalues.map((value) => Math.sqrt(Math.max(0, value)));
  const largest = singular[0] || 1;
  const usable = singular.filter((value) => value / largest > 1e-2).length;
  const total = singular.reduce((sum, value) => sum + value, 0) || 1;
  // Entropy effective rank: threshold-free, so it moves smoothly instead of stepping.
  let entropy = 0;
  for (const value of singular) {
    const p = value / total;
    if (p > 1e-12) entropy -= p * Math.log(p);
  }
  return {
    singular: Float32Array.from(singular),
    usableDirections: usable,
    effectiveRank: Math.exp(entropy),
    conditionNumber: largest / Math.max(1e-12, singular[singular.length - 1])
  };
}

// Regularized nonnegative least squares against the measured penumbra.
//
// The old inverse half-wave rectified each frame's derivative BEFORE averaging, which turns
// noise into signal: on a featureless scene it left about 4.5% phantom angular structure that
// more frames could not remove, because rectify-then-average does not converge to the mean.
// Averaging the frames first and enforcing nonnegativity once, inside the solve, removes that
// bias -- and now more frames genuinely buy signal-to-noise.
function reconstructPenumbraProfile(measurement, background, acquiredFrames, angularBins, options) {
  const { floorSamples, rows, lambda } = options;
  // Average the raw frames first. This is the only place the frame count enters, and it is
  // the honest one: repeated photographs of a static scene buy statistics, never rank.
  const observed = new Float64Array(floorSamples);
  for (let frame = 0; frame < acquiredFrames; frame += 1) {
    for (let floor = 0; floor < floorSamples; floor += 1) {
      observed[floor] += measurement[frame * floorSamples + floor] - background[floor];
    }
  }
  for (let floor = 0; floor < floorSamples; floor += 1) observed[floor] /= Math.max(1, acquiredFrames);

  // A^T y and A^T A once, then projected gradient on the Tikhonov objective
  //   min_x  ||A x - y||^2 + lambda ||D x||^2   subject to  x >= 0.
  const atY = new Float64Array(angularBins);
  const atA = new Float64Array(angularBins * angularBins);
  for (let i = 0; i < angularBins; i += 1) {
    let sum = 0;
    for (let floor = 0; floor < floorSamples; floor += 1) sum += rows[floor * angularBins + i] * observed[floor];
    atY[i] = sum;
    for (let j = i; j < angularBins; j += 1) {
      let inner = 0;
      for (let floor = 0; floor < floorSamples; floor += 1) {
        inner += rows[floor * angularBins + i] * rows[floor * angularBins + j];
      }
      atA[i * angularBins + j] = inner;
      atA[j * angularBins + i] = inner;
    }
  }

  let scale = 0;
  for (let i = 0; i < angularBins; i += 1) {
    let rowSum = 0;
    for (let j = 0; j < angularBins; j += 1) rowSum += Math.abs(atA[i * angularBins + j]);
    scale = Math.max(scale, rowSum);
  }
  const step = 1 / Math.max(1e-9, scale + 4 * lambda);

  const estimate = new Float64Array(angularBins);
  const gradient = new Float64Array(angularBins);
  for (let iteration = 0; iteration < 400; iteration += 1) {
    for (let i = 0; i < angularBins; i += 1) {
      let sum = -atY[i];
      for (let j = 0; j < angularBins; j += 1) sum += atA[i * angularBins + j] * estimate[j];
      // First-difference smoothness prior, the standard stabilizer for an edge-transfer
      // inverse. It is a prior, not evidence -- the panel says so.
      const left = i > 0 ? estimate[i - 1] : estimate[i];
      const right = i < angularBins - 1 ? estimate[i + 1] : estimate[i];
      sum += lambda * (2 * estimate[i] - left - right);
      gradient[i] = sum;
    }
    for (let i = 0; i < angularBins; i += 1) {
      estimate[i] = Math.max(0, estimate[i] - step * gradient[i]);
    }
  }

  const profile = Float32Array.from(estimate);
  normalizeArray(profile);
  return profile;
}

function unpackSamples(samples) {
  return {
    positions: samples.positions instanceof Float32Array ? samples.positions : new Float32Array(samples.positions),
    normals: samples.normals instanceof Float32Array ? samples.normals : new Float32Array(samples.normals),
    count: samples.positions.length / 3
  };
}

function rasterizeTarget(positions, side) {
  const image = new Float32Array(side * side);
  for (let index = 0; index < positions.length / 3; index += 1) {
    const x = clamp(Math.round((positions[index * 3] + 1.35) / 2.7 * (side - 1)), 0, side - 1);
    const y = clamp(Math.round((1 - positions[index * 3 + 1] / 2.8) * (side - 1)), 0, side - 1);
    const z = positions[index * 3 + 2];
    image[y * side + x] += 0.55 + clamp((z + 1.2) / 2.4, 0, 1) * 0.45;
  }
  normalizeArray(image);
  blurImage(image, side, 1);
  normalizeArray(image);
  return image;
}

function imageToPoints(image, side, noise) {
  let maxValue = 0;
  for (const value of image) maxValue = Math.max(maxValue, value);
  const points = [];
  const weights = [];
  const rng = mulberry32(71237 + Math.round(noise * 1000));
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const value = image[y * side + x];
      if (value < maxValue * 0.24) continue;
      const copies = 2 + Math.round(value * 5);
      for (let copy = 0; copy < copies; copy += 1) {
        points.push(
          lerp(-1.28, 1.28, (x + 0.5 + gaussian(rng) * 0.14) / side),
          lerp(2.72, 0.04, (y + 0.5 + gaussian(rng) * 0.14) / side),
          gaussian(rng) * (0.035 + noise * 0.16)
        );
        weights.push(value);
      }
    }
  }
  return { positions: new Float32Array(points), weights: new Float32Array(weights) };
}

function angularProfile(positions, geometry, bins, thetaMin, thetaMax) {
  const profile = new Float32Array(bins);
  const origin = geometry.hiddenOrigin;
  const edge = geometry.edgePoint;
  for (let index = 0; index < positions.length / 3; index += 1) {
    const x = positions[index * 3] + origin[0] - edge[0];
    const z = positions[index * 3 + 2] + origin[2] - edge[2];
    const angle = Math.atan2(z, x);
    const bin = Math.round((angle - thetaMin) / (thetaMax - thetaMin) * (bins - 1));
    if (bin >= 0 && bin < bins) profile[bin] += 1;
  }
  smooth1d(profile, 2);
  normalizeArray(profile);
  return profile;
}

function profileToAngularRays(profile, thetaMin, thetaMax, noise) {
  const points = [];
  const weights = [];
  const rng = mulberry32(58191 + Math.round(noise * 1000));
  for (let angleIndex = 0; angleIndex < profile.length; angleIndex += 1) {
    const value = profile[angleIndex];
    if (value < 0.18) continue;
    const theta = lerp(thetaMin, thetaMax, angleIndex / Math.max(1, profile.length - 1));
    const radialSamples = 11;
    const heightSamples = 7;
    for (let radial = 0; radial < radialSamples; radial += 1) {
      const radius = lerp(0.48, 2.15, (radial + 0.5) / radialSamples);
      for (let height = 0; height < heightSamples; height += 1) {
        points.push(
          Math.cos(theta) * radius + gaussian(rng) * 0.012,
          lerp(0.12, 2.45, (height + 0.5) / heightSamples),
          Math.sin(theta) * radius + gaussian(rng) * 0.012
        );
        weights.push(value * (0.7 + rng() * 0.3));
      }
    }
  }
  return { positions: new Float32Array(points), weights: new Float32Array(weights) };
}

function progressiveAcquisitionStages(total) {
  const stages = [];
  const stageCount = Math.min(8, total);
  for (let stage = 1; stage <= stageCount; stage += 1) {
    stages.push(Math.max(1, Math.round(stage / stageCount * total)));
  }
  return [...new Set(stages)];
}

function blurImage(image, side, passes) {
  for (let pass = 0; pass < passes; pass += 1) {
    const copy = image.slice();
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        let sum = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const px = x + ox;
            const py = y + oy;
            if (px < 0 || px >= side || py < 0 || py >= side) continue;
            sum += copy[py * side + px];
            count += 1;
          }
        }
        image[y * side + x] = sum / count;
      }
    }
  }
}

function smooth1d(values, radius) {
  const copy = values.slice();
  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const source = clamp(index + offset, 0, values.length - 1);
      const localWeight = radius + 1 - Math.abs(offset);
      sum += copy[source] * localWeight;
      weight += localWeight;
    }
    values[index] = sum / weight;
  }
}

function zeroMeanCorrelation(a, b) {
  const length = Math.min(a.length, b.length);
  let meanA = 0;
  let meanB = 0;
  for (let index = 0; index < length; index += 1) {
    meanA += a[index];
    meanB += b[index];
  }
  meanA /= Math.max(1, length);
  meanB /= Math.max(1, length);
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < length; index += 1) {
    const centeredA = a[index] - meanA;
    const centeredB = b[index] - meanB;
    dot += centeredA * centeredB;
    aa += centeredA * centeredA;
    bb += centeredB * centeredB;
  }
  return clamp(dot / Math.sqrt(Math.max(1e-9, aa * bb)), 0, 1);
}

function normalizeArray(values) {
  let maxValue = 0;
  for (const value of values) maxValue = Math.max(maxValue, value);
  if (maxValue <= 0) return;
  for (let index = 0; index < values.length; index += 1) values[index] /= maxValue;
}

function walshSign(row, column) {
  let bits = row & column;
  bits ^= bits >>> 16;
  bits ^= bits >>> 8;
  bits ^= bits >>> 4;
  bits &= 0xf;
  return ((0x6996 >>> bits) & 1) ? -1 : 1;
}

function grayCode(value) {
  return value ^ value >>> 1;
}

function postProgress(jobId, progress, phase) {
  self.postMessage({ type: "progress", jobId, progress, phase });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(a, b, c) {
  const text = `${a}:${b}:${c}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = Math.max(1e-7, rng());
  const v = Math.max(1e-7, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}
