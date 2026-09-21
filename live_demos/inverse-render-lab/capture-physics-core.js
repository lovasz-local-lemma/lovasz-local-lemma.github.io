(function initCapturePhysicsCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CapturePhysicsCore = api;
})(typeof self !== "undefined" ? self : globalThis, () => {
  "use strict";

  const MODE_META = {
    photometric: {
      label: "OLAT photometric stereo",
      short: "one light at a time",
      budgets: [3, 6, 12, 24],
      budgetUnit: "light images",
      observes: "surface normal + diffuse albedo",
      blind: "depth, cast-shadow geometry, and unmodeled gloss"
    },
    polarization: {
      label: "Polarized Stokes capture",
      short: "rotating linear analyzer",
      budgets: [3, 4, 8, 16],
      budgetUnit: "analyzer images",
      observes: "AoP + DoLP + polarized intensity",
      blind: "absolute depth and the normal branch without priors"
    },
    transient: {
      label: "Pulsed transient ToF",
      short: "time-resolved return",
      budgets: [1, 4, 16, 64],
      budgetUnit: "k emitted pulses",
      observes: "range + return strength + ambient flux",
      blind: "lateral shape from one sensor pixel"
    },
    ldr: {
      label: "Bracketed LDR to HDR",
      short: "camera response inversion",
      budgets: [2, 3, 5, 7],
      budgetUnit: "exposures",
      observes: "HDR radiance + power-law camera response",
      blind: "motion, spatially varying response, and fully clipped highlights"
    }
  };

  const PRESETS = {
    ceramic: {
      label: "Matte ceramic",
      normal: normalize3([0.35, -0.22, 0.91]),
      albedo: 0.72,
      specular: 0.012,
      exponent: 34,
      dolp: 0.18,
      phase: 0,
      depth: 2.65,
      returnStrength: 0.052,
      ambient: 0.0014,
      gamma: 2.2,
      radiances: [0.018, 0.032, 0.055, 0.09, 0.14, 0.22, 0.34, 0.52, 0.78, 1.1, 1.55, 2.2]
    },
    glossy: {
      label: "Glossy dielectric",
      normal: normalize3([-0.28, 0.32, 0.9]),
      albedo: 0.56,
      specular: 0.24,
      exponent: 58,
      dolp: 0.43,
      phase: 0,
      depth: 3.18,
      returnStrength: 0.038,
      ambient: 0.0022,
      gamma: 2.05,
      radiances: [0.012, 0.025, 0.046, 0.082, 0.13, 0.21, 0.36, 0.64, 1.05, 1.7, 2.65, 3.8]
    },
    conductor: {
      label: "Polished conductor",
      normal: normalize3([0.2, 0.42, 0.885]),
      albedo: 0.34,
      specular: 0.48,
      exponent: 82,
      dolp: 0.64,
      phase: Math.PI * 0.5,
      depth: 2.34,
      returnStrength: 0.084,
      ambient: 0.001,
      gamma: 2.35,
      radiances: [0.009, 0.018, 0.035, 0.07, 0.12, 0.2, 0.33, 0.58, 0.96, 1.55, 2.5, 4.4]
    }
  };

  const SPEED_OF_LIGHT_M_PER_NS = 0.299792458;
  const TRANSIENT_BIN_COUNT = 96;
  const TRANSIENT_MAX_NS = 32;
  const TRANSIENT_IRF_NS = 0.52;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normalize3(value) {
    const length = Math.max(1e-12, Math.hypot(value[0], value[1], value[2]));
    return [value[0] / length, value[1] / length, value[2] / length];
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function rotateY(vector, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [c * vector[0] + s * vector[2], vector[1], -s * vector[0] + c * vector[2]];
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    const u = Math.max(1e-9, rng());
    const v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  function transposeMultiply(rows, values, ridge = 1e-9) {
    const width = rows[0] ? rows[0].length : 0;
    const matrix = Array.from({ length: width }, () => Array(width).fill(0));
    const rhs = Array(width).fill(0);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const value = values[rowIndex];
      for (let i = 0; i < width; i += 1) {
        rhs[i] += row[i] * value;
        for (let j = 0; j < width; j += 1) matrix[i][j] += row[i] * row[j];
      }
    }
    for (let i = 0; i < width; i += 1) matrix[i][i] += ridge;
    return { matrix, rhs, solution: solveLinear(matrix, rhs) };
  }

  function solveLinear(matrix, rhs) {
    const size = rhs.length;
    const augmented = matrix.map((row, index) => row.slice().concat(rhs[index]));
    for (let column = 0; column < size; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (pivot !== column) [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
      const scale = Math.abs(augmented[column][column]) < 1e-12 ? 1e-12 : augmented[column][column];
      for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= scale;
      for (let row = 0; row < size; row += 1) {
        if (row === column) continue;
        const factor = augmented[row][column];
        for (let entry = column; entry <= size; entry += 1) {
          augmented[row][entry] -= factor * augmented[column][entry];
        }
      }
    }
    return augmented.map((row) => row[size]);
  }

  function inverseMatrix(matrix) {
    const size = matrix.length;
    const inverse = Array.from({ length: size }, () => Array(size).fill(0));
    for (let column = 0; column < size; column += 1) {
      const rhs = Array(size).fill(0);
      rhs[column] = 1;
      const solution = solveLinear(matrix, rhs);
      for (let row = 0; row < size; row += 1) inverse[row][column] = solution[row];
    }
    return inverse;
  }

  // Returns eigenvalues AND eigenvectors. The rotations were already being computed here and
  // then discarded, which meant the audit could count how many directions were unidentifiable
  // without ever being able to say WHICH combination of parameters was unconstrained -- the
  // part a reader actually needs.
  function jacobiEigen(matrix) {
    const size = matrix.length;
    const work = matrix.map((row) => row.slice());
    const vectors = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)));
    for (let iteration = 0; iteration < 80; iteration += 1) {
      let p = 0;
      let q = Math.min(1, size - 1);
      let largest = 0;
      for (let i = 0; i < size; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          if (Math.abs(work[i][j]) > largest) {
            largest = Math.abs(work[i][j]);
            p = i;
            q = j;
          }
        }
      }
      if (largest < 1e-10 || size < 2) break;
      const phi = 0.5 * Math.atan2(2 * work[p][q], work[q][q] - work[p][p]);
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const app = c * c * work[p][p] - 2 * s * c * work[p][q] + s * s * work[q][q];
      const aqq = s * s * work[p][p] + 2 * s * c * work[p][q] + c * c * work[q][q];
      for (let index = 0; index < size; index += 1) {
        if (index === p || index === q) continue;
        const aip = work[index][p];
        const aiq = work[index][q];
        work[index][p] = work[p][index] = c * aip - s * aiq;
        work[index][q] = work[q][index] = s * aip + c * aiq;
      }
      for (let index = 0; index < size; index += 1) {
        const vip = vectors[index][p];
        const viq = vectors[index][q];
        vectors[index][p] = c * vip - s * viq;
        vectors[index][q] = s * vip + c * viq;
      }
      work[p][p] = app;
      work[q][q] = aqq;
      work[p][q] = work[q][p] = 0;
    }
    // Sort descending, carrying the eigenvectors with their eigenvalues. Sorting the values
    // alone and leaving the vector columns behind would silently pair each null direction with
    // the wrong eigenvalue.
    const order = Array.from({ length: size }, (_, i) => i)
      .sort((a, b) => work[b][b] - work[a][a]);
    return {
      values: order.map((index) => Math.max(0, work[index][index])),
      vectors: order.map((column) => vectors.map((row) => row[column]))
    };
  }

  function jacobiEigenvalues(matrix) {
    const size = matrix.length;
    const work = matrix.map((row) => row.slice());
    for (let iteration = 0; iteration < 80; iteration += 1) {
      let p = 0;
      let q = Math.min(1, size - 1);
      let largest = 0;
      for (let i = 0; i < size; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          if (Math.abs(work[i][j]) > largest) {
            largest = Math.abs(work[i][j]);
            p = i;
            q = j;
          }
        }
      }
      if (largest < 1e-10 || size < 2) break;
      const phi = 0.5 * Math.atan2(2 * work[p][q], work[q][q] - work[p][p]);
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const app = c * c * work[p][p] - 2 * s * c * work[p][q] + s * s * work[q][q];
      const aqq = s * s * work[p][p] + 2 * s * c * work[p][q] + c * c * work[q][q];
      for (let index = 0; index < size; index += 1) {
        if (index === p || index === q) continue;
        const aip = work[index][p];
        const aiq = work[index][q];
        work[index][p] = work[p][index] = c * aip - s * aiq;
        work[index][q] = work[q][index] = s * aip + c * aiq;
      }
      work[p][p] = app;
      work[q][q] = aqq;
      work[p][q] = work[q][p] = 0;
    }
    return work.map((row, index) => Math.max(0, row[index])).sort((a, b) => b - a);
  }

  function fisherSummary(jacobian, labels, noiseVariance = 1) {
    const width = labels.length;
    const matrix = Array.from({ length: width }, () => Array(width).fill(0));
    const invVariance = 1 / Math.max(1e-12, noiseVariance);
    for (const row of jacobian) {
      for (let i = 0; i < width; i += 1) {
        for (let j = 0; j < width; j += 1) matrix[i][j] += row[i] * row[j] * invVariance;
      }
    }
    const eigenvalues = jacobiEigenvalues(matrix);
    const maximum = Math.max(1e-12, eigenvalues[0] || 0);
    const positive = eigenvalues.filter((value) => value > maximum * 1e-5);
    const minimum = positive.length === width ? positive[positive.length - 1] : 0;
    const rank = positive.length;
    const condition = minimum > 0 ? maximum / minimum : Infinity;
    const regularizer = maximum * 1e-8 + 1e-10;
    const regularized = matrix.map((row, i) => row.map((value, j) => value + (i === j ? regularizer : 0)));
    const covariance = inverseMatrix(regularized);
    const sigma = covariance.map((row, index) => Math.sqrt(Math.max(0, row[index])));
    const correlation = matrix.map((row, i) => row.map((value, j) => {
      const denominator = Math.sqrt(Math.max(1e-20, matrix[i][i] * matrix[j][j]));
      return denominator ? value / denominator : 0;
    }));
    // Entropy effective rank. Threshold-free, so it slides smoothly as a control moves instead
    // of stepping when an eigenvalue crosses an arbitrary cutoff -- which is what makes it
    // readable as a live diagnostic rather than a verdict.
    const total = eigenvalues.reduce((sum, value) => sum + value, 0);
    let entropy = 0;
    for (const value of eigenvalues) {
      const share = value / Math.max(1e-20, total);
      if (share > 1e-12) entropy -= share * Math.log(share);
    }
    const effectiveRank = Math.exp(entropy);

    const decomposition = jacobiEigen(matrix);
    const weakest = decomposition.vectors[decomposition.vectors.length - 1] || [];
    // A weakest direction always exists. That does not make it an ambiguity: on a
    // well-conditioned system the smallest eigenvalue is merely the smallest, and printing
    // "X is unconstrained" there would invent a degeneracy the measurement does not have.
    // Only name it once the spread is wide enough for the direction to mean something.
    const INVARIANT_CONDITION_FLOOR = 25;
    const meaningful = !Number.isFinite(condition) || condition > INVARIANT_CONDITION_FLOOR;
    return {
      labels,
      matrix,
      correlation,
      eigenvalues,
      rank,
      condition,
      sigma,
      effectiveRank,
      eigenvectors: decomposition.vectors,
      nullDirection: weakest,
      invariantThreshold: INVARIANT_CONDITION_FLOOR,
      invariant: meaningful ? describeInvariant(weakest, labels) : ""
    };
  }

  // Name the ambiguity instead of only counting it.
  //
  // The eigenvector for the smallest eigenvalue is the parameter combination the measurement
  // cannot constrain. Rounded to a small-integer basis it reads as a monomial invariant --
  // "rho * L is determined, rho and L separately are not" -- which is the sentence a reader
  // needs. Fitting in log coordinates is what makes this legible: every degeneracy that is a
  // product or a ratio becomes a straight line there.
  function describeInvariant(vector, labels) {
    if (!vector || vector.length < 2) return "";
    let peak = 0;
    for (const value of vector) peak = Math.max(peak, Math.abs(value));
    if (peak < 1e-12) return "";
    const terms = [];
    for (let index = 0; index < vector.length; index += 1) {
      const scaled = vector[index] / peak;
      if (Math.abs(scaled) < 0.28) continue;
      // Round to halves; anything finer is over-reading a numerical eigenvector.
      const exponent = Math.round(scaled * 2) / 2;
      if (exponent === 0) continue;
      terms.push({ label: labels[index], exponent });
    }
    if (terms.length < 2) return "";
    const format = (term) => (Math.abs(term.exponent) === 1 ? term.label : `${term.label}^${Math.abs(term.exponent)}`);
    const numerator = terms.filter((term) => term.exponent > 0).map(format);
    const denominator = terms.filter((term) => term.exponent < 0).map(format);
    if (!numerator.length || !denominator.length) {
      return `${terms.map(format).join(" * ")} is unconstrained`;
    }
    return `${numerator.join(" * ")} / ${denominator.join(" * ")} is unconstrained`;
  }

  function rmse(values, predicted) {
    if (!values.length) return 0;
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      const delta = values[index] - predicted[index];
      sum += delta * delta;
    }
    return Math.sqrt(sum / values.length);
  }

  function angularErrorDegrees(a, b) {
    return Math.acos(clamp(dot3(normalize3(a), normalize3(b)), -1, 1)) * 180 / Math.PI;
  }

  function wrapPi(value) {
    let result = value % Math.PI;
    if (result < 0) result += Math.PI;
    return result;
  }

  function angleDistancePi(a, b) {
    let delta = Math.abs(wrapPi(a) - wrapPi(b));
    delta = Math.min(delta, Math.PI - delta);
    return delta;
  }

  function lightDirections(count) {
    const directions = [];
    const golden = 0.6180339887498949;
    for (let index = 0; index < count; index += 1) {
      const phase = (index * golden + 0.17) % 1;
      const azimuth = Math.PI * 2 * phase;
      const z = 0.48 + 0.42 * ((index * 0.38196601125 + 0.23) % 1);
      const radius = Math.sqrt(Math.max(0, 1 - z * z));
      directions.push([Math.cos(azimuth) * radius, Math.sin(azimuth) * radius, z]);
    }
    return directions;
  }

  function makePhotometricExperiment(config, preset, rng) {
    const trueLights = lightDirections(config.budget);
    const calibrationAngle = config.calibration * 12 * Math.PI / 180;
    const view = [0, 0, 1];
    const shots = trueLights.map((light, index) => {
      const half = normalize3([light[0] + view[0], light[1] + view[1], light[2] + view[2]]);
      const diffuse = preset.albedo * Math.max(0, dot3(preset.normal, light));
      const specular = preset.specular * Math.pow(Math.max(0, dot3(preset.normal, half)), preset.exponent);
      const value = clamp(diffuse + specular + gaussian(rng) * config.noise * 0.055, 0, 1.25);
      return {
        index,
        label: `L${index + 1}`,
        value,
        trueLight: light,
        assumedLight: normalize3(rotateY(light, calibrationAngle))
      };
    });
    return { mode: "photometric", config, preset, shots, truth: { normal: preset.normal, albedo: preset.albedo } };
  }

  function solvePhotometric(experiment, usedShots) {
    const shots = experiment.shots.slice(0, usedShots);
    const rows = shots.map((shot) => shot.assumedLight);
    const values = shots.map((shot) => shot.value);
    const normalFit = transposeMultiply(rows, values, 1e-7);
    const g = normalFit.solution;
    const albedo = Math.max(1e-8, Math.hypot(g[0], g[1], g[2]));
    const normal = normalize3(g);
    const predicted = rows.map((row) => Math.max(0, dot3(row, g)));
    const fisher = fisherSummary(rows, ["rho nx", "rho ny", "rho nz"], Math.pow(0.01 + experiment.config.noise * 0.055, 2));
    return {
      mode: "photometric",
      usedShots: shots.length,
      totalShots: experiment.shots.length,
      shots,
      values,
      predicted,
      recovered: { normal, albedo },
      truth: experiment.truth,
      fisher,
      metrics: {
        normalErrorDeg: angularErrorDegrees(normal, experiment.truth.normal),
        albedoError: Math.abs(albedo - experiment.truth.albedo),
        residualRmse: rmse(values, predicted)
      }
    };
  }

  function makePolarizationExperiment(config, preset, rng) {
    const azimuth = Math.atan2(preset.normal[1], preset.normal[0]);
    const aop = wrapPi(azimuth + preset.phase);
    const s0 = 0.42 + preset.albedo * 0.58;
    const shots = [];
    for (let index = 0; index < config.budget; index += 1) {
      const angle = Math.PI * index / config.budget;
      const value = clamp(0.5 * s0 * (1 + preset.dolp * Math.cos(2 * (angle - aop))) +
        gaussian(rng) * config.noise * 0.035, 0, 1.2);
      shots.push({
        index,
        label: `${Math.round(angle * 180 / Math.PI)} deg`,
        angle,
        assumedAngle: angle + config.calibration * 9 * Math.PI / 180,
        value
      });
    }
    return { mode: "polarization", config, preset, shots, truth: { aop, dolp: preset.dolp, s0, azimuth } };
  }

  function solvePolarization(experiment, usedShots) {
    const shots = experiment.shots.slice(0, usedShots);
    const rows = shots.map((shot) => [
      0.5,
      0.5 * Math.cos(2 * shot.assumedAngle),
      0.5 * Math.sin(2 * shot.assumedAngle)
    ]);
    const values = shots.map((shot) => shot.value);
    const fit = transposeMultiply(rows, values, 1e-8);
    const [s0, s1, s2] = fit.solution;
    const dolp = clamp(Math.hypot(s1, s2) / Math.max(1e-8, Math.abs(s0)), 0, 1);
    const aop = wrapPi(0.5 * Math.atan2(s2, s1));
    const predicted = rows.map((row) => row[0] * s0 + row[1] * s1 + row[2] * s2);
    const fisher = fisherSummary(rows, ["S0", "S1", "S2"], Math.pow(0.006 + experiment.config.noise * 0.035, 2));
    return {
      mode: "polarization",
      usedShots: shots.length,
      totalShots: experiment.shots.length,
      shots,
      values,
      predicted,
      recovered: {
        s0,
        s1,
        s2,
        dolp,
        aop,
        azimuthBranches: [wrapPi(aop - experiment.preset.phase), wrapPi(aop - experiment.preset.phase + Math.PI * 0.5)]
      },
      truth: experiment.truth,
      fisher,
      metrics: {
        aopErrorDeg: angleDistancePi(aop, experiment.truth.aop) * 180 / Math.PI,
        dolpError: Math.abs(dolp - experiment.truth.dolp),
        residualRmse: rmse(values, predicted)
      }
    };
  }

  function makeTransientExperiment(config, preset, rng) {
    const pulseCount = config.budget * 1024;
    const packetCount = Math.min(16, Math.max(4, Math.round(Math.sqrt(config.budget) * 4)));
    const pulsesPerPacket = pulseCount / packetCount;
    const tof = 2 * preset.depth / SPEED_OF_LIGHT_M_PER_NS;
    const shots = [];
    for (let packet = 0; packet < packetCount; packet += 1) {
      const histogram = [];
      for (let bin = 0; bin < TRANSIENT_BIN_COUNT; bin += 1) {
        const time = (bin + 0.5) / TRANSIENT_BIN_COUNT * TRANSIENT_MAX_NS;
        const impulse = Math.exp(-0.5 * Math.pow((time - tof) / TRANSIENT_IRF_NS, 2));
        const expected = pulsesPerPacket * (preset.ambient + preset.returnStrength * impulse);
        histogram.push(Math.max(0, expected + gaussian(rng) * Math.sqrt(Math.max(1e-8, expected)) * config.noise));
      }
      shots.push({ index: packet, label: `packet ${packet + 1}`, pulses: pulsesPerPacket, histogram });
    }
    return {
      mode: "transient",
      config,
      preset,
      shots,
      truth: { depth: preset.depth, tof, returnStrength: preset.returnStrength, ambient: preset.ambient }
    };
  }

  function solveTransient(experiment, usedShots) {
    const shots = experiment.shots.slice(0, usedShots);
    const histogram = Array(TRANSIENT_BIN_COUNT).fill(0);
    let pulses = 0;
    for (const shot of shots) {
      pulses += shot.pulses;
      for (let bin = 0; bin < TRANSIENT_BIN_COUNT; bin += 1) histogram[bin] += shot.histogram[bin];
    }
    let ambientSum = 0;
    for (let bin = 0; bin < 10; bin += 1) ambientSum += histogram[bin] + histogram[TRANSIENT_BIN_COUNT - 1 - bin];
    const ambientCounts = ambientSum / 20;
    let peak = 0;
    for (let bin = 1; bin < TRANSIENT_BIN_COUNT; bin += 1) {
      if (histogram[bin] > histogram[peak]) peak = bin;
    }
    let weightedTime = 0;
    let weightedEnergy = 0;
    for (let bin = Math.max(0, peak - 5); bin <= Math.min(TRANSIENT_BIN_COUNT - 1, peak + 5); bin += 1) {
      const signal = Math.max(0, histogram[bin] - ambientCounts);
      const time = (bin + 0.5) / TRANSIENT_BIN_COUNT * TRANSIENT_MAX_NS;
      weightedTime += signal * time;
      weightedEnergy += signal;
    }
    const measuredTof = weightedEnergy ? weightedTime / weightedEnergy : 0;
    const timingBias = experiment.config.calibration * 0.45;
    const tof = measuredTof - timingBias;
    const depth = tof * SPEED_OF_LIGHT_M_PER_NS * 0.5;
    const returnStrength = weightedEnergy / Math.max(1, pulses * Math.sqrt(2 * Math.PI) * TRANSIENT_IRF_NS /
      (TRANSIENT_MAX_NS / TRANSIENT_BIN_COUNT));
    const ambient = ambientCounts / Math.max(1, pulses);
    const predicted = [];
    const jacobian = [];
    for (let bin = 0; bin < TRANSIENT_BIN_COUNT; bin += 1) {
      const time = (bin + 0.5) / TRANSIENT_BIN_COUNT * TRANSIENT_MAX_NS;
      const delta = time - tof;
      const impulse = Math.exp(-0.5 * Math.pow(delta / TRANSIENT_IRF_NS, 2));
      const expected = pulses * (ambient + returnStrength * impulse);
      predicted.push(expected);
      const dTofDDepth = 2 / SPEED_OF_LIGHT_M_PER_NS;
      const dDepth = pulses * returnStrength * impulse * delta / (TRANSIENT_IRF_NS * TRANSIENT_IRF_NS) * dTofDDepth;
      jacobian.push([dDepth, pulses * impulse, pulses]);
    }
    const variance = Math.max(1, histogram.reduce((sum, value) => sum + value, 0) / TRANSIENT_BIN_COUNT);
    const fisher = fisherSummary(jacobian, ["depth", "return", "ambient"], variance);
    return {
      mode: "transient",
      usedShots: shots.length,
      totalShots: experiment.shots.length,
      pulses,
      shots,
      values: histogram,
      predicted,
      recovered: { depth, tof, returnStrength, ambient, peak },
      truth: experiment.truth,
      fisher,
      metrics: {
        depthError: Math.abs(depth - experiment.truth.depth),
        returnError: Math.abs(returnStrength - experiment.truth.returnStrength),
        residualRmse: rmse(histogram, predicted) / Math.max(1, Math.max(...histogram))
      }
    };
  }

  function exposureStops(count) {
    if (count === 1) return [0];
    return Array.from({ length: count }, (_, index) => -3 + 6 * index / (count - 1));
  }

  function makeLdrExperiment(config, preset, rng) {
    const stops = exposureStops(config.budget);
    const shots = stops.map((stop, index) => {
      const exposure = Math.pow(2, stop);
      const assumedExposure = exposure * Math.pow(2, config.calibration * 0.18 * stop);
      const values = preset.radiances.map((radiance) => {
        const encoded = Math.pow(clamp(exposure * radiance, 0, 1), 1 / preset.gamma);
        return clamp(encoded + gaussian(rng) * config.noise * 0.018, 0, 1);
      });
      return { index, label: `${stop >= 0 ? "+" : ""}${stop.toFixed(1)} EV`, stop, exposure, assumedExposure, values };
    });
    return { mode: "ldr", config, preset, shots, truth: { gamma: preset.gamma, radiances: preset.radiances.slice() } };
  }

  function solveLdr(experiment, usedShots) {
    const shots = experiment.shots.slice(0, usedShots);
    let numerator = 0;
    let denominator = 0;
    for (let patch = 0; patch < experiment.truth.radiances.length; patch += 1) {
      for (let i = 0; i < shots.length; i += 1) {
        for (let j = i + 1; j < shots.length; j += 1) {
          const yi = shots[i].values[patch];
          const yj = shots[j].values[patch];
          if (yi < 0.04 || yi > 0.94 || yj < 0.04 || yj > 0.94) continue;
          const dx = Math.log(shots[i].assumedExposure) - Math.log(shots[j].assumedExposure);
          const dy = Math.log(yi) - Math.log(yj);
          numerator += dx * dy;
          denominator += dx * dx;
        }
      }
    }
    const inverseGamma = denominator > 1e-12 ? numerator / denominator : 1 / 2.2;
    const gamma = clamp(1 / Math.max(0.2, inverseGamma), 1.2, 3.4);
    const radiances = experiment.truth.radiances.map((_, patch) => {
      let weighted = 0;
      let weightSum = 0;
      for (const shot of shots) {
        const value = shot.values[patch];
        if (value <= 0.015 || value >= 0.985) continue;
        const weight = Math.max(0.02, 1 - Math.abs(value - 0.5) * 1.8);
        weighted += weight * Math.pow(value, gamma) / shot.assumedExposure;
        weightSum += weight;
      }
      return weightSum ? weighted / weightSum : 0;
    });
    const predicted = [];
    const values = [];
    const jacobian = [];
    let clipped = 0;
    let total = 0;
    const logRadiances = experiment.truth.radiances.map((value) => Math.log(Math.max(1e-6, value)));
    const logMinimum = Math.min(...logRadiances);
    const logMaximum = Math.max(...logRadiances);
    for (const shot of shots) {
      for (let patch = 0; patch < radiances.length; patch += 1) {
        const observed = shot.values[patch];
        const linear = clamp(shot.assumedExposure * radiances[patch], 0, 1);
        const estimate = Math.pow(linear, 1 / gamma);
        values.push(observed);
        predicted.push(estimate);
        total += 1;
        if (observed <= 0.015 || observed >= 0.985) clipped += 1;
        if (estimate > 0.02 && estimate < 0.98 && linear > 1e-8) {
          const normalizedLog = (logRadiances[patch] - logMinimum) / Math.max(1e-8, logMaximum - logMinimum) - 0.5;
          jacobian.push([
            -estimate * Math.log(linear) / (gamma * gamma),
            estimate / gamma,
            estimate / gamma * normalizedLog
          ]);
        }
      }
    }
    const fisher = fisherSummary(jacobian.length ? jacobian : [[0, 0, 0]],
      ["response gamma", "HDR scale", "highlight slope"], Math.pow(0.004 + experiment.config.noise * 0.018, 2));
    let logError = 0;
    for (let patch = 0; patch < radiances.length; patch += 1) {
      const delta = Math.log1p(radiances[patch]) - Math.log1p(experiment.truth.radiances[patch]);
      logError += delta * delta;
    }
    return {
      mode: "ldr",
      usedShots: shots.length,
      totalShots: experiment.shots.length,
      shots,
      values,
      predicted,
      recovered: { gamma, radiances },
      truth: experiment.truth,
      fisher,
      metrics: {
        gammaError: Math.abs(gamma - experiment.truth.gamma),
        hdrLogRmse: Math.sqrt(logError / radiances.length),
        clippedFraction: total ? clipped / total : 0,
        residualRmse: rmse(values, predicted)
      }
    };
  }

  function createExperiment(options = {}) {
    const mode = MODE_META[options.mode] ? options.mode : "photometric";
    const presetKey = PRESETS[options.preset] ? options.preset : "ceramic";
    const preset = PRESETS[presetKey];
    const meta = MODE_META[mode];
    const requestedBudget = Number(options.budget);
    const budget = meta.budgets.includes(requestedBudget) ? requestedBudget : meta.budgets[1];
    const config = {
      mode,
      preset: presetKey,
      budget,
      noise: clamp(Number(options.noise) || 0, 0, 1),
      calibration: clamp(Number(options.calibration) || 0, -1, 1),
      seed: Number.isFinite(options.seed) ? options.seed : 0x63a5f19
    };
    const rng = mulberry32(config.seed + mode.length * 991 + presetKey.length * 313 + budget * 17);
    if (mode === "polarization") return makePolarizationExperiment(config, preset, rng);
    if (mode === "transient") return makeTransientExperiment(config, preset, rng);
    if (mode === "ldr") return makeLdrExperiment(config, preset, rng);
    return makePhotometricExperiment(config, preset, rng);
  }

  function solveExperiment(experiment, usedShots = experiment.shots.length) {
    const used = clamp(Math.round(usedShots), 1, experiment.shots.length);
    if (experiment.mode === "polarization") return solvePolarization(experiment, used);
    if (experiment.mode === "transient") return solveTransient(experiment, used);
    if (experiment.mode === "ldr") return solveLdr(experiment, used);
    return solvePhotometric(experiment, used);
  }

  function calibrationDescription(mode, value) {
    if (mode === "polarization") return `${(value * 9).toFixed(1)} deg analyzer zero`;
    if (mode === "transient") return `${(value * 450).toFixed(0)} ps timing skew`;
    if (mode === "ldr") return `${(value * 18).toFixed(1)}% EV-scale skew`;
    return `${(value * 12).toFixed(1)} deg light-pose bias`;
  }

  function progressDescription(experiment, result) {
    if (experiment.mode === "transient") {
      const kilopulses = result.pulses / 1024;
      const decimals = kilopulses < 1 ? 2 : kilopulses < 10 ? 1 : 0;
      let acquired = kilopulses.toFixed(decimals);
      if (decimals) acquired = acquired.replace(/0+$/, "").replace(/\.$/, "");
      return `${acquired}k / ${experiment.config.budget}k pulses`;
    }
    return `${result.usedShots} / ${result.totalShots} ${MODE_META[experiment.mode].budgetUnit}`;
  }

  return {
    MODE_META,
    PRESETS,
    SPEED_OF_LIGHT_M_PER_NS,
    TRANSIENT_BIN_COUNT,
    TRANSIENT_MAX_NS,
    createExperiment,
    solveExperiment,
    calibrationDescription,
    progressDescription,
    angularErrorDegrees,
    fisherSummary,
    jacobiEigen,
    describeInvariant
  };
});
