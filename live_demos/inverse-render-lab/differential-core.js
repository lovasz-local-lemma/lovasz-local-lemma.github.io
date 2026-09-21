(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DifferentialCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const SIGNAL_WIDTH = 96;
  const MAX_ITERATIONS = 140;
  const PARAM_MIN = [0.08, 0.12];
  const PARAM_MAX = [0.92, 1.08];

  const BACKENDS = [
    {
      key: "finite",
      short: "Finite difference",
      label: "CRN finite difference",
      className: "numerical",
      color: "#aab5c3",
      contract: "Four deterministic primal evaluations; numerical reference, not a renderer derivative."
    },
    {
      key: "prb",
      short: "Attached PRB",
      label: "Path replay backpropagation",
      className: "attached",
      color: "#7ba7ff",
      contract: "Replays sampled smooth paths in constant memory; deliberately omits the visibility boundary term."
    },
    {
      key: "rb",
      short: "Radiative BP",
      label: "Radiative backpropagation",
      className: "attached",
      color: "#c08bd8",
      contract: "Adjoint transport re-sampled per order with no replay transcript; same estimand as attached PRB at higher cost."
    },
    {
      key: "pathspace",
      short: "Path-space",
      label: "Path-space boundary estimator",
      className: "unbiased",
      color: "#49d0bd",
      contract: "Combines attached path derivatives with an explicit differential silhouette sample."
    },
    {
      key: "warped",
      short: "Warped area",
      label: "Unbiased warped-area estimator",
      className: "unbiased",
      color: "#f0ba5d",
      contract: "Converts the boundary contribution into a stratified divergence-form area integral."
    },
    {
      key: "photon",
      short: "Diff. photons",
      label: "Differentiable photon mapping",
      className: "kernel",
      color: "#ed7c91",
      contract: "Differentiates photon positions and a smooth density kernel; unbiased for that KDE, bandwidth-biased for the primal."
    }
  ];

  const SCENES = {
    visibility: {
      key: "visibility",
      label: "Moving visibility",
      copy: "A hard shadow edge dominates the geometry signal. Attached replay misses the decisive boundary term.",
      ambient: 0.055,
      direct: 0.58,
      bounce: 0.045,
      caustic: 0.025,
      edgeBase: 0.12,
      edgeScale: 0.68,
      bounceFrequency: 1.25,
      bounceShift: 0.18,
      photonMuBase: 0.2,
      photonMuScale: 0.56,
      photonSpread: 0.032,
      kernelWidth: 0.046,
      causticHitProbability: 0.18,
      initial: [0.26, 0.42],
      target: [0.72, 0.82],
      learningRate: [0.027, 0.024]
    },
    indirect: {
      key: "indirect",
      label: "Indirect transport",
      copy: "Smooth one-bounce transport carries most of the signal, so replay is efficient while edge terms still finish geometry.",
      ambient: 0.05,
      direct: 0.24,
      bounce: 0.31,
      caustic: 0.11,
      edgeBase: 0.13,
      edgeScale: 0.64,
      bounceFrequency: 1.7,
      bounceShift: 0.34,
      photonMuBase: 0.16,
      photonMuScale: 0.66,
      photonSpread: 0.045,
      kernelWidth: 0.055,
      causticHitProbability: 0.12,
      initial: [0.25, 0.38],
      target: [0.69, 0.88],
      learningRate: [0.025, 0.022]
    },
    caustic: {
      key: "caustic",
      label: "Specular caustic",
      copy: "A narrow photon focus dominates. Camera-path estimates are rare-event noisy; photon density gradients target it directly.",
      ambient: 0.045,
      direct: 0.13,
      bounce: 0.055,
      caustic: 0.62,
      edgeBase: 0.15,
      edgeScale: 0.55,
      bounceFrequency: 1.4,
      bounceShift: 0.2,
      photonMuBase: 0.12,
      photonMuScale: 0.72,
      photonSpread: 0.024,
      kernelWidth: 0.035,
      causticHitProbability: 0.025,
      initial: [0.48, 0.34],
      target: [0.73, 0.86],
      learningRate: [0.018, 0.019]
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    const u = Math.max(1e-9, random());
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  function sceneFor(key) {
    return SCENES[key] || SCENES.visibility;
  }

  function signalData(params, sceneOrKey) {
    const scene = typeof sceneOrKey === "string" ? sceneFor(sceneOrKey) : sceneOrKey;
    const shape = params[0];
    const albedo = params[1];
    const edge = scene.edgeBase + scene.edgeScale * shape;
    const mu = scene.photonMuBase + scene.photonMuScale * shape;
    const variance = scene.kernelWidth * scene.kernelWidth + scene.photonSpread * scene.photonSpread;
    const gaussianScale = scene.kernelWidth / Math.sqrt(variance);
    const image = new Float64Array(SIGNAL_WIDTH);
    const dShape = new Float64Array(SIGNAL_WIDTH);
    const dAlbedo = new Float64Array(SIGNAL_WIDTH);
    const visibility = new Float64Array(SIGNAL_WIDTH);
    const dVisibility = new Float64Array(SIGNAL_WIDTH);
    const bounce = new Float64Array(SIGNAL_WIDTH);
    const dBounce = new Float64Array(SIGNAL_WIDTH);
    const caustic = new Float64Array(SIGNAL_WIDTH);
    const dCaustic = new Float64Array(SIGNAL_WIDTH);
    const pixelWidth = 1 / SIGNAL_WIDTH;

    for (let i = 0; i < SIGNAL_WIDTH; i += 1) {
      const left = i * pixelWidth;
      const right = left + pixelWidth;
      const x = (left + right) * 0.5;
      const visible = clamp((right - edge) / pixelWidth, 0, 1);
      const edgeInside = edge > left && edge < right;
      const dVisible = edgeInside ? -scene.edgeScale / pixelWidth : 0;
      const phase = Math.PI * 2 * (scene.bounceFrequency * x - scene.bounceShift * shape);
      const bounceValue = 0.55 + 0.45 * Math.cos(phase);
      const dBounceValue = 0.45 * Math.sin(phase) * Math.PI * 2 * scene.bounceShift;
      const delta = x - mu;
      const causticValue = gaussianScale * Math.exp(-0.5 * delta * delta / variance);
      const dCausticValue = causticValue * delta / variance * scene.photonMuScale;
      const basis = scene.direct * visible + scene.bounce * bounceValue + scene.caustic * causticValue;

      visibility[i] = visible;
      dVisibility[i] = dVisible;
      bounce[i] = bounceValue;
      dBounce[i] = dBounceValue;
      caustic[i] = causticValue;
      dCaustic[i] = dCausticValue;
      image[i] = scene.ambient + albedo * basis;
      dShape[i] = albedo * (
        scene.direct * dVisible +
        scene.bounce * dBounceValue +
        scene.caustic * dCausticValue
      );
      dAlbedo[i] = basis;
    }

    return {
      image,
      dShape,
      dAlbedo,
      visibility,
      dVisibility,
      bounce,
      dBounce,
      caustic,
      dCaustic,
      edge,
      mu
    };
  }

  function objective(params, sceneOrKey, target) {
    const data = signalData(params, sceneOrKey);
    let loss = 0;
    let gShape = 0;
    let gAlbedo = 0;
    const residual = new Float64Array(SIGNAL_WIDTH);
    for (let i = 0; i < SIGNAL_WIDTH; i += 1) {
      const error = data.image[i] - target[i];
      residual[i] = error;
      loss += error * error;
      gShape += error * data.dShape[i];
      gAlbedo += error * data.dAlbedo[i];
    }
    const scale = 1 / SIGNAL_WIDTH;
    return {
      loss: loss * scale,
      gradient: [gShape * 2 * scale, gAlbedo * 2 * scale],
      residual,
      data
    };
  }

  function boundaryGradient(params, scene, target, evaluation) {
    const current = evaluation || objective(params, scene, target);
    let gradient = 0;
    for (let i = 0; i < SIGNAL_WIDTH; i += 1) {
      const derivative = params[1] * scene.direct * current.data.dVisibility[i];
      gradient += current.residual[i] * derivative;
    }
    return gradient * 2 / SIGNAL_WIDTH;
  }

  function sampleAttached(params, scene, target, budget, random, options = {}) {
    const current = options.evaluation || objective(params, scene, target);
    const includeCaustic = options.includeCaustic !== false;
    const samples = Math.max(1, budget | 0);
    const pathXs = [];
    let gShape = 0;
    let gAlbedo = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const index = Math.min(SIGNAL_WIDTH - 1, Math.floor(random() * SIGNAL_WIDTH));
      const causticWeight = includeCaustic && random() < scene.causticHitProbability
        ? 1 / scene.causticHitProbability
        : 0;
      const dShape = params[1] * (
        scene.bounce * current.data.dBounce[index] +
        scene.caustic * current.data.dCaustic[index] * causticWeight
      );
      const dAlbedo = scene.direct * current.data.visibility[index] +
        scene.bounce * current.data.bounce[index] +
        scene.caustic * current.data.caustic[index] * causticWeight;
      const lossDerivative = 2 * current.residual[index];
      gShape += lossDerivative * dShape;
      gAlbedo += lossDerivative * dAlbedo;
      if (pathXs.length < 56) pathXs.push((index + 0.5) / SIGNAL_WIDTH);
    }
    return {
      gradient: [gShape / samples, gAlbedo / samples],
      pathXs,
      photons: [],
      areaXs: [],
      cost: samples
    };
  }

  // Radiative backpropagation (Nimier-David et al. 2020).
  //
  // The notes have cited RB in prose since before this lane existed while implementing only
  // PRB, and the two are not synonyms. RB propagates adjoint radiance through a fresh
  // simulation with no transcript: each transport order is re-sampled independently rather
  // than replayed from a stored path. PRB records one path and reuses it for every term.
  //
  // At this scale that difference shows up exactly where the paper says it does -- in cost,
  // not in the answer. RB is an unbiased estimator of the SAME quantity as attached PRB, so it
  // inherits the same omission of the moving-visibility boundary term and must plateau on the
  // visibility preset in the same way. What differs is that its work grows with the number of
  // transport orders instead of staying constant, which is the linear-versus-quadratic
  // distinction reduced to the smallest setting that can still show it.
  function radiativeBackpropGradient(params, scene, target, budget, random) {
    const current = objective(params, scene, target);
    const samples = Math.max(1, budget | 0);
    const pathXs = [];
    let gShape = 0;
    let gAlbedo = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      // Direct order: an independently sampled adjoint connection.
      const directIndex = Math.min(SIGNAL_WIDTH - 1, Math.floor(random() * SIGNAL_WIDTH));
      gAlbedo += 2 * current.residual[directIndex] * scene.direct * current.data.visibility[directIndex];

      // Indirect order: re-sampled rather than reusing the direct connection, which is the
      // whole structural difference from replay.
      const indirectIndex = Math.min(SIGNAL_WIDTH - 1, Math.floor(random() * SIGNAL_WIDTH));
      const causticWeight = random() < scene.causticHitProbability ? 1 / scene.causticHitProbability : 0;
      const lossDerivative = 2 * current.residual[indirectIndex];
      gShape += lossDerivative * params[1] * (
        scene.bounce * current.data.dBounce[indirectIndex] +
        scene.caustic * current.data.dCaustic[indirectIndex] * causticWeight
      );
      gAlbedo += lossDerivative * (
        scene.bounce * current.data.bounce[indirectIndex] +
        scene.caustic * current.data.caustic[indirectIndex] * causticWeight
      );
      if (pathXs.length < 56) pathXs.push((indirectIndex + 0.5) / SIGNAL_WIDTH);
    }
    return {
      gradient: [gShape / samples, gAlbedo / samples],
      pathXs,
      photons: [],
      areaXs: [],
      // Two adjoint connections per sample instead of one shared path.
      cost: samples * 2
    };
  }

  function finiteDifferenceGradient(params, scene, target) {
    const gradient = [0, 0];
    const eps = [0.0035, 0.003];
    for (let p = 0; p < 2; p += 1) {
      const plus = params.slice();
      const minus = params.slice();
      plus[p] = clamp(plus[p] + eps[p], PARAM_MIN[p], PARAM_MAX[p]);
      minus[p] = clamp(minus[p] - eps[p], PARAM_MIN[p], PARAM_MAX[p]);
      const plusLoss = objective(plus, scene, target).loss;
      const minusLoss = objective(minus, scene, target).loss;
      gradient[p] = (plusLoss - minusLoss) / Math.max(1e-9, plus[p] - minus[p]);
    }
    return {
      gradient,
      pathXs: Array.from({ length: 24 }, (_, i) => (i + 0.5) / 24),
      photons: [],
      areaXs: [],
      cost: SIGNAL_WIDTH * 4
    };
  }

  function pathSpaceGradient(params, scene, target, budget, random) {
    const current = objective(params, scene, target);
    const estimate = sampleAttached(params, scene, target, budget, random, { evaluation: current });
    estimate.gradient[0] += boundaryGradient(params, scene, target, current);
    estimate.edge = current.data.edge;
    estimate.cost += 1;
    return estimate;
  }

  function warpedAreaGradient(params, scene, target, budget, random) {
    const current = objective(params, scene, target);
    const estimate = sampleAttached(params, scene, target, budget, random, { evaluation: current });
    const boundary = boundaryGradient(params, scene, target, current);
    const samples = Math.max(1, budget | 0);
    let areaIntegral = 0;
    for (let i = 0; i < samples; i += 1) {
      const x = (i + random()) / samples;
      const divergenceWeight = 1 + 0.42 * Math.cos(Math.PI * 2 * x);
      areaIntegral += divergenceWeight;
      if (estimate.areaXs.length < 56) estimate.areaXs.push(x);
    }
    estimate.gradient[0] += boundary * areaIntegral / samples;
    estimate.edge = current.data.edge;
    estimate.cost += samples;
    return estimate;
  }

  function photonGradient(params, scene, target, budget, random) {
    const current = objective(params, scene, target);
    const estimate = sampleAttached(params, scene, target, budget, random, {
      evaluation: current,
      includeCaustic: false
    });
    estimate.gradient[0] += boundaryGradient(params, scene, target, current);
    const photonCount = Math.max(1, budget | 0);
    const h2 = scene.kernelWidth * scene.kernelWidth;
    let photonShape = 0;
    let photonAlbedo = 0;
    for (let photon = 0; photon < photonCount; photon += 1) {
      const position = current.data.mu + scene.photonSpread * normal(random);
      if (estimate.photons.length < 96) estimate.photons.push(position);
      let shapeContribution = 0;
      let albedoContribution = 0;
      for (let i = 0; i < SIGNAL_WIDTH; i += 1) {
        const x = (i + 0.5) / SIGNAL_WIDTH;
        const delta = x - position;
        const kernel = Math.exp(-0.5 * delta * delta / h2);
        const dKernel = kernel * delta / h2 * scene.photonMuScale;
        const lossDerivative = 2 * current.residual[i] / SIGNAL_WIDTH;
        shapeContribution += lossDerivative * params[1] * scene.caustic * dKernel;
        albedoContribution += lossDerivative * scene.caustic * kernel;
      }
      photonShape += shapeContribution;
      photonAlbedo += albedoContribution;
    }
    estimate.gradient[0] += photonShape / photonCount;
    estimate.gradient[1] += photonAlbedo / photonCount;
    estimate.edge = current.data.edge;
    estimate.cost += photonCount;
    return estimate;
  }

  function estimateGradient(key, params, scene, target, budget, random) {
    if (key === "finite") return finiteDifferenceGradient(params, scene, target);
    if (key === "rb") return radiativeBackpropGradient(params, scene, target, budget, random);
    if (key === "pathspace") return pathSpaceGradient(params, scene, target, budget, random);
    if (key === "warped") return warpedAreaGradient(params, scene, target, budget, random);
    if (key === "photon") return photonGradient(params, scene, target, budget, random);
    return sampleAttached(params, scene, target, budget, random);
  }

  function vectorNorm(vector) {
    return Math.hypot(...vector);
  }

  function relativeError(estimate, reference) {
    return Math.hypot(estimate[0] - reference[0], estimate[1] - reference[1]) /
      Math.max(1e-8, vectorNorm(reference));
  }

  function cosine(estimate, reference) {
    const denominator = vectorNorm(estimate) * vectorNorm(reference);
    if (denominator < 1e-10) return 1;
    return clamp((estimate[0] * reference[0] + estimate[1] * reference[1]) / denominator, -1, 1);
  }

  function auditBackend(key, params, scene, target, budget, seed) {
    const reference = objective(params, scene, target).gradient;
    const repetitions = key === "finite" ? 1 : budget >= 1024 ? 8 : budget >= 256 ? 14 : 24;
    const estimates = [];
    const mean = [0, 0];
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const random = mulberry32(seed + repeat * 0x9e3779b1);
      const estimate = estimateGradient(key, params, scene, target, budget, random).gradient;
      estimates.push(estimate);
      mean[0] += estimate[0] / repetitions;
      mean[1] += estimate[1] / repetitions;
    }
    let variance = 0;
    for (const estimate of estimates) {
      variance += (estimate[0] - mean[0]) ** 2 + (estimate[1] - mean[1]) ** 2;
    }
    variance /= Math.max(1, repetitions - 1);
    return {
      mean,
      reference,
      relativeBias: relativeError(mean, reference),
      normalizedStdDev: Math.sqrt(variance) / Math.max(1e-8, vectorNorm(reference)),
      repetitions
    };
  }

  function makeLane(backend, lab, index) {
    const params = lab.scene.initial.slice();
    const evaluation = objective(params, lab.scene, lab.target);
    return {
      key: backend.key,
      params,
      m: [0, 0],
      v: [0, 0],
      iteration: 0,
      work: 0,
      loss: evaluation.loss,
      settled: false,
      random: mulberry32(lab.seed + (index + 1) * 0x45d9f3b),
      audit: auditBackend(backend.key, params, lab.scene, lab.target, lab.budget, lab.seed + index * 7919),
      last: {
        gradient: [0, 0],
        exactGradient: evaluation.gradient,
        relativeError: 0,
        cosine: 1,
        pathXs: [],
        photons: [],
        areaXs: [],
        edge: evaluation.data.edge
      },
      history: [{ iteration: 0, work: 0, loss: evaluation.loss }]
    };
  }

  function createLab(options = {}) {
    const scene = sceneFor(options.scene);
    const budget = [64, 256, 1024].includes(Number(options.budget)) ? Number(options.budget) : 256;
    const seed = Number(options.seed) || 0x5eeda11;
    const target = Array.from(signalData(scene.target, scene).image);
    const lab = { scene, budget, seed, target, lanes: [], maxIterations: MAX_ITERATIONS };
    lab.lanes = BACKENDS.map((backend, index) => makeLane(backend, lab, index));
    return lab;
  }

  function stepLane(lane, lab) {
    if (lane.settled) return;
    const before = objective(lane.params, lab.scene, lab.target);
    const estimate = estimateGradient(lane.key, lane.params, lab.scene, lab.target, lab.budget, lane.random);
    const exactGradient = before.gradient;
    lane.iteration += 1;
    const beta1 = 0.9;
    const beta2 = 0.98;
    const decay = 0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - lane.iteration / lab.maxIterations));
    for (let p = 0; p < 2; p += 1) {
      const gradient = clamp(estimate.gradient[p], -3, 3);
      lane.m[p] = beta1 * lane.m[p] + (1 - beta1) * gradient;
      lane.v[p] = beta2 * lane.v[p] + (1 - beta2) * gradient * gradient;
      const correctedM = lane.m[p] / (1 - beta1 ** lane.iteration);
      const correctedV = lane.v[p] / (1 - beta2 ** lane.iteration);
      lane.params[p] -= lab.scene.learningRate[p] * decay * correctedM / (Math.sqrt(correctedV) + 1e-7);
      lane.params[p] = clamp(lane.params[p], PARAM_MIN[p], PARAM_MAX[p]);
    }
    lane.work += estimate.cost;
    const after = objective(lane.params, lab.scene, lab.target);
    lane.loss = after.loss;
    lane.last = {
      gradient: estimate.gradient,
      exactGradient,
      relativeError: relativeError(estimate.gradient, exactGradient),
      cosine: cosine(estimate.gradient, exactGradient),
      pathXs: estimate.pathXs || [],
      photons: estimate.photons || [],
      areaXs: estimate.areaXs || [],
      edge: estimate.edge == null ? before.data.edge : estimate.edge
    };
    lane.history.push({ iteration: lane.iteration, work: lane.work, loss: lane.loss });
    if (lane.history.length > MAX_ITERATIONS + 1) lane.history.shift();
    lane.settled = lane.iteration >= lab.maxIterations;
  }

  function stepLab(lab, count = 1) {
    const steps = Math.max(1, count | 0);
    for (let step = 0; step < steps; step += 1) {
      for (const lane of lab.lanes) stepLane(lane, lab);
    }
    return snapshot(lab);
  }

  function expectedDerivativeField(key, params, scene) {
    const data = signalData(params, scene);
    const field = new Float64Array(SIGNAL_WIDTH);
    if (key === "finite") {
      const plus = params.slice();
      const minus = params.slice();
      plus[0] += 0.0035;
      minus[0] -= 0.0035;
      const plusImage = signalData(plus, scene).image;
      const minusImage = signalData(minus, scene).image;
      for (let i = 0; i < SIGNAL_WIDTH; i += 1) field[i] = (plusImage[i] - minusImage[i]) / 0.007;
      return field;
    }
    for (let i = 0; i < SIGNAL_WIDTH; i += 1) {
      // RB targets the same estimand as attached PRB, so it shows the same expected field --
      // including the same missing boundary term.
      field[i] = (key === "prb" || key === "rb")
        ? params[1] * (scene.bounce * data.dBounce[i] + scene.caustic * data.dCaustic[i])
        : data.dShape[i];
    }
    return field;
  }

  function snapshot(lab) {
    return {
      scene: lab.scene.key,
      sceneLabel: lab.scene.label,
      sceneCopy: lab.scene.copy,
      budget: lab.budget,
      maxIterations: lab.maxIterations,
      targetParams: lab.scene.target.slice(),
      target: lab.target.slice(),
      backends: BACKENDS,
      lanes: lab.lanes.map((lane) => {
        const data = signalData(lane.params, lab.scene);
        return {
          key: lane.key,
          params: lane.params.slice(),
          iteration: lane.iteration,
          work: lane.work,
          loss: lane.loss,
          settled: lane.settled,
          audit: lane.audit,
          last: lane.last,
          history: lane.history.slice(),
          image: Array.from(data.image),
          derivativeField: Array.from(expectedDerivativeField(lane.key, lane.params, lab.scene)),
          exactDerivativeField: Array.from(data.dShape)
        };
      })
    };
  }

  return {
    SIGNAL_WIDTH,
    MAX_ITERATIONS,
    BACKENDS,
    SCENES,
    createLab,
    stepLab,
    snapshot,
    signalData,
    objective,
    estimateGradient,
    auditBackend,
    expectedDerivativeField,
    mulberry32
  };
});
