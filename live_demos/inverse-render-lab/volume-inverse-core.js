(function initVolumeInverseCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.VolumeInverseCore = api;
})(typeof self !== "undefined" ? self : globalThis, () => {
  "use strict";

  const EXTINCTION = 2.2;
  const REGIMES = {
    dense: {
      label: "dense differential tracking",
      angles: Array.from({ length: 24 }, (_, index) => Math.PI * 2 * index / 24),
      batch: 3,
      smoothing: 0.018
    },
    sparse: {
      label: "sparse stereo + cloud prior",
      angles: [-0.72, -0.2, 0.36, 0.88],
      batch: 2,
      smoothing: 0.055
    },
    single: {
      label: "single-view posterior",
      angles: [0],
      batch: 1,
      smoothing: 0.025
    }
  };

  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function index3(size, x, y, z) {
    return (z * size + y) * size + x;
  }

  function gaussian3(x, y, z, cx, cy, cz, sx, sy, sz) {
    return Math.exp(-0.5 * (
      Math.pow((x - cx) / sx, 2)
      + Math.pow((y - cy) / sy, 2)
      + Math.pow((z - cz) / sz, 2)
    ));
  }

  function makeTarget(size = 24) {
    const volume = new Float32Array(size * size * size);
    for (let z = 0; z < size; z += 1) {
      const pz = -1 + 2 * (z + 0.5) / size;
      for (let y = 0; y < size; y += 1) {
        const py = -1 + 2 * (y + 0.5) / size;
        for (let x = 0; x < size; x += 1) {
          const px = -1 + 2 * (x + 0.5) / size;
          let density = 0;
          density += 0.95 * gaussian3(px, py, pz, -0.26, -0.08, -0.08, 0.42, 0.3, 0.36);
          density += 0.82 * gaussian3(px, py, pz, 0.28, 0.04, 0.12, 0.36, 0.42, 0.3);
          density += 0.62 * gaussian3(px, py, pz, 0.04, 0.34, -0.25, 0.28, 0.24, 0.28);
          density += 0.45 * gaussian3(px, py, pz, 0.44, -0.28, -0.24, 0.23, 0.2, 0.2);
          density -= 0.38 * gaussian3(px, py, pz, 0.02, 0.02, 0.06, 0.2, 0.2, 0.18);
          const curl = 0.1 * Math.sin(px * 8 + pz * 4.3) * Math.cos(py * 7.2 - pz * 3.1)
            + 0.055 * Math.sin((px + py + pz) * 15.3);
          const envelope = Math.max(0, 1 - 0.25 * (px * px + py * py + pz * pz));
          volume[index3(size, x, y, z)] = clamp01((density + curl - 0.11) * 1.15) * envelope;
        }
      }
    }
    return volume;
  }

  function forEachRayVoxel(size, angle, pixelX, pixelY, callback) {
    const u = -1 + 2 * (pixelX + 0.5) / size;
    const y = pixelY;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (let sample = 0; sample < size; sample += 1) {
      const t = -1 + 2 * (sample + 0.5) / size;
      const worldX = u * cosine + t * sine;
      const worldZ = -u * sine + t * cosine;
      const x = Math.floor((worldX + 1) * 0.5 * size);
      const z = Math.floor((worldZ + 1) * 0.5 * size);
      if (x >= 0 && x < size && z >= 0 && z < size) callback(index3(size, x, y, z), sample);
    }
  }

  function project(volume, size, angle) {
    const projection = new Float32Array(size * size);
    const ds = 2 / size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let opticalDepth = 0;
        forEachRayVoxel(size, angle, x, y, (index) => {
          opticalDepth += volume[index] * ds * EXTINCTION;
        });
        projection[y * size + x] = opticalDepth;
      }
    }
    return projection;
  }

  function backprojectUpdate(volume, targetProjections, size, angles, angleIndices, learningRate) {
    const gradient = new Float32Array(volume.length);
    const weight = new Float32Array(volume.length);
    const ds = 2 / size;
    let loss = 0;
    let samples = 0;
    for (const angleIndex of angleIndices) {
      const angle = angles[angleIndex];
      const predicted = project(volume, size, angle);
      const target = targetProjections[angleIndex];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const pixel = y * size + x;
          const residual = predicted[pixel] - target[pixel];
          loss += residual * residual;
          samples += 1;
          forEachRayVoxel(size, angle, x, y, (index) => {
            gradient[index] += residual * ds * EXTINCTION;
            weight[index] += ds * EXTINCTION;
          });
        }
      }
    }
    for (let index = 0; index < volume.length; index += 1) {
      const update = learningRate * gradient[index] / Math.max(0.08, weight[index]);
      volume[index] = clamp01(volume[index] - update);
    }
    return loss / Math.max(1, samples);
  }

  function smoothVolume(volume, size, amount) {
    if (amount <= 0) return;
    const source = volume.slice();
    for (let z = 1; z < size - 1; z += 1) {
      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          const index = index3(size, x, y, z);
          const average = (
            source[index3(size, x - 1, y, z)] + source[index3(size, x + 1, y, z)]
            + source[index3(size, x, y - 1, z)] + source[index3(size, x, y + 1, z)]
            + source[index3(size, x, y, z - 1)] + source[index3(size, x, y, z + 1)]
          ) / 6;
          volume[index] = clamp01(source[index] * (1 - amount) + average * amount);
        }
      }
    }
  }

  function makeSingleViewPrior(size, opticalDepth, variant) {
    const prior = new Float32Array(size * size * size);
    const ds = 2 / size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const px = -1 + 2 * (x + 0.5) / size;
        const weights = new Float32Array(size);
        let sum = 0;
        for (let z = 0; z < size; z += 1) {
          const pz = -1 + 2 * (z + 0.5) / size;
          let weight;
          if (variant === 0) weight = Math.exp(-0.5 * Math.pow((pz + 0.05) / 0.34, 2));
          else if (variant === 1) weight = Math.exp(-0.5 * Math.pow((pz - 0.48) / 0.2, 2)) + 0.82 * Math.exp(-0.5 * Math.pow((pz + 0.5) / 0.23, 2));
          else if (variant === 2) weight = Math.exp(-0.5 * Math.pow((pz - px * 0.5) / 0.24, 2));
          else weight = 0.3 + 0.7 * Math.exp(-0.5 * Math.pow((pz + 0.2 * Math.sin(px * 5)) / 0.58, 2));
          weights[z] = weight;
          sum += weight;
        }
        const lineMass = opticalDepth[y * size + x] / Math.max(1e-6, ds * EXTINCTION);
        for (let z = 0; z < size; z += 1) prior[index3(size, x, y, z)] = clamp01(lineMass * weights[z] / Math.max(1e-6, sum));
      }
    }
    return prior;
  }

  function blendPrior(volume, prior, amount) {
    for (let index = 0; index < volume.length; index += 1) {
      volume[index] = clamp01(volume[index] * (1 - amount) + prior[index] * amount);
    }
  }

  function evidenceLoss(volume, targetProjections, size, angles) {
    let sum = 0;
    let count = 0;
    angles.forEach((angle, index) => {
      const predicted = project(volume, size, angle);
      const target = targetProjections[index];
      for (let pixel = 0; pixel < predicted.length; pixel += 1) {
        const residual = predicted[pixel] - target[pixel];
        sum += residual * residual;
        count += 1;
      }
    });
    return sum / Math.max(1, count);
  }

  function createSolver(options = {}) {
    const size = Math.max(16, Math.min(32, Number(options.size) || 24));
    const regime = REGIMES[options.regime] ? options.regime : "dense";
    const target = makeTarget(size);
    const angles = REGIMES[regime].angles.slice();
    const targetProjections = angles.map((angle) => project(target, size, angle));
    const candidates = [];
    const priors = [];
    const count = regime === "single" ? 4 : 1;
    const rng = mulberry32(0x4c0f + size * 13);
    for (let candidate = 0; candidate < count; candidate += 1) {
      if (regime === "single") {
        const prior = makeSingleViewPrior(size, targetProjections[0], candidate);
        priors.push(prior);
        const volume = prior.slice();
        for (let index = 0; index < volume.length; index += 1) volume[index] *= 0.025;
        candidates.push(volume);
      } else {
        const volume = new Float32Array(size * size * size);
        for (let index = 0; index < volume.length; index += 1) volume[index] = rng() * 0.006;
        candidates.push(volume);
        priors.push(null);
      }
    }
    return {
      size,
      regime,
      scattering: options.scattering === "multiple" ? "multiple" : "single",
      priorStrength: Number.isFinite(options.priorStrength) ? options.priorStrength : 0.55,
      inspectAngle: Number.isFinite(options.inspectAngle) ? options.inspectAngle : 0.62,
      target,
      angles,
      targetProjections,
      candidates,
      priors,
      iteration: 0,
      cursor: 0,
      history: [],
      loss: evidenceLoss(candidates[0], targetProjections, size, angles)
    };
  }

  function stepSolver(state, steps = 1) {
    const regime = REGIMES[state.regime];
    for (let iteration = 0; iteration < steps; iteration += 1) {
      const indices = [];
      for (let offset = 0; offset < regime.batch; offset += 1) indices.push((state.cursor + offset) % state.angles.length);
      state.cursor = (state.cursor + regime.batch) % state.angles.length;
      state.candidates.forEach((volume, candidateIndex) => {
        const learningRate = state.regime === "dense" ? 0.115 : state.regime === "sparse" ? 0.095 : 0.075;
        backprojectUpdate(volume, state.targetProjections, state.size, state.angles, indices, learningRate);
        smoothVolume(volume, state.size, regime.smoothing * (0.5 + state.priorStrength));
        if (state.regime === "single") {
          const priorAmount = 0.012 + state.priorStrength * 0.028;
          blendPrior(volume, state.priors[candidateIndex], priorAmount);
        }
      });
      state.iteration += 1;
      state.loss = evidenceLoss(state.candidates[0], state.targetProjections, state.size, state.angles);
      state.history.push(state.loss);
      if (state.history.length > 180) state.history.shift();
    }
    return snapshot(state);
  }

  function radianceFromOpticalDepth(opticalDepth, size, scattering) {
    const rgb = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        const tau = opticalDepth[index];
        const transmittance = Math.exp(-tau);
        const sky = 0.045 + 0.035 * (1 - y / Math.max(1, size - 1));
        const illumination = 0.58 + 0.42 * (1 - x / Math.max(1, size - 1));
        const single = (1 - transmittance) * illumination;
        const multiple = scattering === "multiple" ? 0.24 * Math.pow(1 - transmittance, 1.45) : 0;
        const base = index * 4;
        rgb[base] = Math.round(255 * clamp01(sky * transmittance + single * 0.68 + multiple * 0.74));
        rgb[base + 1] = Math.round(255 * clamp01((sky + 0.015) * transmittance + single * 0.79 + multiple * 0.84));
        rgb[base + 2] = Math.round(255 * clamp01((sky + 0.035) * transmittance + single * 0.92 + multiple));
        rgb[base + 3] = 255;
      }
    }
    return rgb;
  }

  function slice(volume, size, axis = "z", position = 0.5) {
    const output = new Float32Array(size * size);
    const fixed = Math.max(0, Math.min(size - 1, Math.floor(position * size)));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let index;
        if (axis === "x") index = index3(size, fixed, y, x);
        else if (axis === "y") index = index3(size, x, fixed, y);
        else index = index3(size, x, y, fixed);
        output[y * size + x] = volume[index];
      }
    }
    return output;
  }

  function uncertaintyProjection(candidates, size, angle) {
    const projections = candidates.map((volume) => project(volume, size, angle));
    const uncertainty = new Float32Array(size * size);
    for (let pixel = 0; pixel < uncertainty.length; pixel += 1) {
      const mean = projections.reduce((sum, projection) => sum + projection[pixel], 0) / projections.length;
      const variance = projections.reduce((sum, projection) => sum + Math.pow(projection[pixel] - mean, 2), 0) / projections.length;
      uncertainty[pixel] = Math.sqrt(variance);
    }
    return { projections, uncertainty };
  }

  function evaluationMetrics(volume, target) {
    let intersection = 0;
    let union = 0;
    let mse = 0;
    for (let index = 0; index < volume.length; index += 1) {
      const currentOccupied = volume[index] > 0.18;
      const targetOccupied = target[index] > 0.18;
      if (currentOccupied && targetOccupied) intersection += 1;
      if (currentOccupied || targetOccupied) union += 1;
      mse += Math.pow(volume[index] - target[index], 2);
    }
    return { iou: intersection / Math.max(1, union), rmse: Math.sqrt(mse / volume.length) };
  }

  function sampleDensityOnFrontRay(volume, size, pixelX, pixelY, t) {
    const x = Math.max(0, Math.min(size - 1, pixelX));
    const y = Math.max(0, Math.min(size - 1, pixelY));
    const z = Math.max(0, Math.min(size - 1, Math.floor((t + 1) * 0.5 * size)));
    return volume[index3(size, x, y, z)];
  }

  function ratioTrackingAudit(volume, size, trajectoryCount = 64) {
    const pixelX = Math.floor(size * 0.43);
    const pixelY = Math.floor(size * 0.48);
    const exactTau = project(volume, size, 0)[pixelY * size + pixelX];
    const exactTransmittance = Math.exp(-exactTau);
    const exactGradient = -exactTau * exactTransmittance;
    const majorant = EXTINCTION * 1.05;
    const rng = mulberry32(0x715f + size * 11);
    const estimates = [];
    const gradients = [];
    const firstEvents = [];
    let runningWeight = 0;
    let runningGradient = 0;
    for (let trajectory = 0; trajectory < trajectoryCount; trajectory += 1) {
      let t = -1;
      let weight = 1;
      let score = 0;
      while (t < 1) {
        t += -Math.log(Math.max(1e-8, 1 - rng())) / majorant;
        if (t >= 1) break;
        const density = sampleDensityOnFrontRay(volume, size, pixelX, pixelY, t);
        const ratio = Math.min(0.999, EXTINCTION * density / majorant);
        weight *= 1 - ratio;
        score += -ratio / Math.max(1e-6, 1 - ratio);
        if (trajectory === 0) firstEvents.push({ t, density, ratio });
      }
      runningWeight += weight;
      runningGradient += weight * score;
      estimates.push(runningWeight / (trajectory + 1));
      gradients.push(runningGradient / (trajectory + 1));
    }
    return { exactTau, exactTransmittance, exactGradient, estimates, gradients, events: firstEvents };
  }

  function snapshot(state) {
    const current = state.candidates[0];
    const targetProjection = project(state.target, state.size, state.inspectAngle);
    const currentProjection = project(current, state.size, state.inspectAngle);
    const targetRgba = radianceFromOpticalDepth(targetProjection, state.size, state.scattering);
    const currentRgba = radianceFromOpticalDepth(currentProjection, state.size, state.scattering);
    const residual = new Float32Array(state.size * state.size);
    for (let index = 0; index < residual.length; index += 1) residual[index] = Math.abs(targetProjection[index] - currentProjection[index]);
    const posterior = uncertaintyProjection(state.candidates, state.size, Math.PI * 0.5);
    return {
      size: state.size,
      regime: state.regime,
      scattering: state.scattering,
      priorStrength: state.priorStrength,
      inspectAngle: state.inspectAngle,
      iteration: state.iteration,
      loss: state.loss,
      history: state.history.slice(),
      angles: state.angles.slice(),
      targetRgba,
      currentRgba,
      residual,
      targetSlice: slice(state.target, state.size, "z", 0.5),
      currentSlice: slice(current, state.size, "z", 0.5),
      posteriorProjections: posterior.projections,
      uncertainty: posterior.uncertainty,
      metrics: evaluationMetrics(current, state.target),
      tracker: ratioTrackingAudit(state.target, state.size, 64),
      capturePreviews: state.targetProjections.map((projection) => radianceFromOpticalDepth(projection, state.size, state.scattering))
    };
  }

  return {
    EXTINCTION,
    REGIMES,
    makeTarget,
    project,
    createSolver,
    stepSolver,
    snapshot,
    radianceFromOpticalDepth,
    ratioTrackingAudit,
    evaluationMetrics
  };
});
