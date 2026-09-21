(function initAperture2dCore(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Aperture2dCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // Coded aperture over a TWO-dimensional hidden scene.
  //
  // The passive edge lane in this app recovers a 1-D angular profile, which is the honest
  // ceiling for a single knife edge with no time of flight. Measured on that problem, a finite
  // occluder LOSES to a bare edge (23 usable directions against 25). That result is correct and
  // it is also the wrong question: a 1-D unknown has no second axis for an occluder's shadow
  // SHAPE to encode, so the anti-pinhole is being scored where it structurally cannot win.
  //
  // This module lifts the unknown to azimuth x elevation and puts the same apertures back on
  // trial. The prediction that motivated it, stated before measuring:
  //
  //   a single straight edge should COLLAPSE, because its visibility test cannot depend on
  //   elevation at all, so every elevation difference lands exactly in the null space;
  //   apertures that break that symmetry -- two edges, a finite occluder, a random mask --
  //   should now separate.
  //
  // Whether they do, and in what order, is measured. See aperture2d-core-test.js, which locks
  // the ordering that actually came out.
  //
  // Anchor: Baradad et al. 2018, Inferring Light Fields from Shadows -- a 4-D light field
  // recovered from the shadow a known occluder casts on a diffuse wall, modelled as a linear
  // system. This is the same operator with a smaller unknown.
  //
  // SCOPE. The hidden scene is directional: it lives at infinity and is parameterized only by
  // direction, so there is no range axis and none is claimed. Occlusion is binary and the
  // aperture is a single plane. Everything here is geometry and visibility; no transport,
  // no time of flight, no wavelength.

  const DEFAULTS = {
    grid: 16,            // hidden scene: grid x grid directions (azimuth x elevation)
    sensor: 32,          // observation plane: sensor x sensor points
    thetaHalf: 0.55,     // half-extent of the azimuth range, radians
    phiHalf: 0.55,       // half-extent of the elevation range, radians
    sensorExtent: 2.4,   // world width of the observation plane
    standoff: 1.1,       // observation plane to aperture plane
    edgeX: 0,            // knife edge position in the aperture plane
    edgeY: 0,
    occluderX: 0,
    occluderY: 0,
    occluderHalf: 0.34,  // half-width of the finite opaque square
    maskCells: 7,        // pseudorandom mask resolution across the aperture plane
    maskExtent: 4.2,     // world width the mask cells tile
    maskSeed: 20260818,
    lambda: 0.004,       // Tikhonov weight on the 2-D Laplacian
    iterations: 600
  };

  const APERTURE_KEYS = ["none", "edge", "twoEdge", "occluder", "mask"];

  const APERTURE_LABELS = {
    none: "no occlusion",
    edge: "single knife edge",
    twoEdge: "two crossed edges",
    occluder: "finite occluder (anti-pinhole)",
    mask: "pseudorandom mask"
  };

  // ---------------------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------------------

  // Where a ray leaving observation point (px, py) toward direction (theta, phi) crosses the
  // aperture plane. Tangent-plane parameterization: exact for the plane crossing, and the two
  // angular axes stay separable, which is what makes the edge's null space provable rather
  // than merely small.
  //
  // Split into one function per axis rather than written as a single expression, because the
  // separability is the load-bearing fact of this whole lane: apertureX cannot take phi and
  // apertureY cannot take theta, so a straight edge testing only ax is blind to elevation as a
  // matter of what it is possible to write here. buildOperator hoists these out of its inner
  // loop and must call THESE, not its own copy -- an earlier version inlined the arithmetic and
  // left the geometry defined in two places, which is the standard way a proof and the code it
  // describes drift apart.
  function apertureX(px, theta, config) {
    return px + config.standoff * Math.tan(theta);
  }

  function apertureY(py, phi, config) {
    return py + config.standoff * Math.tan(phi);
  }

  function aperturePoint(px, py, theta, phi, config) {
    return { ax: apertureX(px, theta, config), ay: apertureY(py, phi, config) };
  }

  function makeMaskLookup(config) {
    const cells = config.maskCells;
    const table = new Uint8Array(cells * cells);
    const rng = mulberry32(config.maskSeed);
    // A 50% open mask. Not a MURA: the point of this entry is that even an UNDESIGNED random
    // mask breaks the symmetries the structured apertures have, so any advantage it shows is a
    // lower bound on what aperture design buys.
    for (let index = 0; index < table.length; index += 1) table[index] = rng() < 0.5 ? 1 : 0;
    const cellSize = config.maskExtent / cells;
    return function lookup(ax, ay) {
      const cx = Math.floor((ax + config.maskExtent * 0.5) / cellSize);
      const cy = Math.floor((ay + config.maskExtent * 0.5) / cellSize);
      if (cx < 0 || cy < 0 || cx >= cells || cy >= cells) return 1;
      return table[cy * cells + cx];
    };
  }

  // Each aperture is one predicate on the crossing point. Deliberately: the comparison is only
  // honest if visibility is the ONLY thing that differs between them.
  function visibilityTest(aperture, config) {
    if (aperture === "none") return () => 1;
    // Depends on ax alone. ax depends on theta alone. Therefore the whole operator is
    // independent of phi, and every elevation difference is exactly unobservable.
    if (aperture === "edge") return (ax) => (ax <= config.edgeX ? 1 : 0);
    if (aperture === "twoEdge") {
      return (ax, ay) => (ax <= config.edgeX && ay <= config.edgeY ? 1 : 0);
    }
    if (aperture === "occluder") {
      return (ax, ay) => (
        Math.abs(ax - config.occluderX) < config.occluderHalf
        && Math.abs(ay - config.occluderY) < config.occluderHalf ? 0 : 1
      );
    }
    if (aperture === "mask") {
      const lookup = makeMaskLookup(config);
      return (ax, ay) => lookup(ax, ay);
    }
    throw new Error(`unknown aperture ${aperture}`);
  }

  function makeConfig(overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    config.unknowns = config.grid * config.grid;
    config.rows = config.sensor * config.sensor;
    return config;
  }

  // ---------------------------------------------------------------------------------------
  // Forward operator
  // ---------------------------------------------------------------------------------------

  // A is rows x unknowns, row-major. Column (i, j) is azimuth bin i, elevation bin j.
  function buildOperator(aperture, overrides) {
    const config = makeConfig(overrides);
    const { grid, sensor, unknowns } = config;
    const visible = visibilityTest(aperture, config);
    const A = new Float64Array(config.rows * unknowns);
    const dTheta = grid > 1 ? (2 * config.thetaHalf) / (grid - 1) : 2 * config.thetaHalf;
    const dPhi = grid > 1 ? (2 * config.phiHalf) / (grid - 1) : 2 * config.phiHalf;

    const thetas = new Float64Array(grid);
    const phis = new Float64Array(grid);
    for (let i = 0; i < grid; i += 1) {
      thetas[i] = -config.thetaHalf + (grid > 1 ? (2 * config.thetaHalf) * i / (grid - 1) : 0);
      phis[i] = -config.phiHalf + (grid > 1 ? (2 * config.phiHalf) * i / (grid - 1) : 0);
    }

    for (let v = 0; v < sensor; v += 1) {
      const py = -config.sensorExtent * 0.5 + config.sensorExtent * (v + 0.5) / sensor;
      for (let u = 0; u < sensor; u += 1) {
        const px = -config.sensorExtent * 0.5 + config.sensorExtent * (u + 0.5) / sensor;
        const base = (v * sensor + u) * unknowns;
        for (let j = 0; j < grid; j += 1) {
          const phi = phis[j];
          const ay = apertureY(py, phi, config);
          // Foreshortening of the hidden direction. Scales columns, never rows, so it cannot
          // manufacture rank -- which is exactly why it is safe to include.
          const cosPhi = Math.cos(phi);
          for (let i = 0; i < grid; i += 1) {
            const theta = thetas[i];
            const ax = apertureX(px, theta, config);
            if (!visible(ax, ay)) continue;
            A[base + j * grid + i] = Math.cos(theta) * cosPhi * dTheta * dPhi;
          }
        }
      }
    }
    return { matrix: A, config, aperture };
  }

  function applyForward(operator, x) {
    const { matrix, config } = operator;
    const { rows, unknowns } = config;
    const y = new Float64Array(rows);
    for (let r = 0; r < rows; r += 1) {
      const base = r * unknowns;
      let sum = 0;
      for (let c = 0; c < unknowns; c += 1) sum += matrix[base + c] * x[c];
      y[r] = sum;
    }
    return y;
  }

  function applyAdjoint(operator, y) {
    const { matrix, config } = operator;
    const { rows, unknowns } = config;
    const out = new Float64Array(unknowns);
    for (let r = 0; r < rows; r += 1) {
      const base = r * unknowns;
      const scale = y[r];
      if (scale === 0) continue;
      for (let c = 0; c < unknowns; c += 1) out[c] += matrix[base + c] * scale;
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------
  // Conditioning
  // ---------------------------------------------------------------------------------------

  function gramMatrix(operator) {
    const { matrix, config } = operator;
    const { rows, unknowns } = config;
    const gram = new Float64Array(unknowns * unknowns);
    for (let i = 0; i < unknowns; i += 1) {
      for (let j = i; j < unknowns; j += 1) {
        let sum = 0;
        for (let r = 0; r < rows; r += 1) {
          sum += matrix[r * unknowns + i] * matrix[r * unknowns + j];
        }
        gram[i * unknowns + j] = sum;
        gram[j * unknowns + i] = sum;
      }
    }
    return gram;
  }

  // Cyclic Jacobi. Eigenvalues only -- the panel reports what the operator can resolve, and
  // that is a question about the spectrum, not about any particular reconstruction.
  function symmetricEigenvalues(matrix, size, sweeps) {
    const work = Float64Array.from(matrix);
    const passes = sweeps || 10;
    for (let sweep = 0; sweep < passes; sweep += 1) {
      let offDiagonal = 0;
      for (let p = 0; p < size - 1; p += 1) {
        for (let q = p + 1; q < size; q += 1) offDiagonal += work[p * size + q] ** 2;
      }
      if (offDiagonal < 1e-24) break;
      for (let p = 0; p < size - 1; p += 1) {
        for (let q = p + 1; q < size; q += 1) {
          const pq = work[p * size + q];
          if (Math.abs(pq) < 1e-20) continue;
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

  // Singular values of A, obtained as sqrt of the Gram eigenvalues. "Usable" counts directions
  // above 1% of the largest, the same threshold the 1-D lane uses, so the two are comparable.
  //
  // numericalRank is a SEPARATE question from usable directions, and the difference is the
  // interesting part. Rank asks what the operator can represent at all; usable asks what
  // survives a realistic noise floor. The apertures that break the edge's symmetry all reach
  // full rank, and they are still far apart on usable directions -- full rank is not the
  // same as a well posed problem, and reporting only one of the two would say so.
  //
  // The rank threshold sits at 1e-6 of the largest singular value. That is not a taste
  // judgement: a Gram eigenvalue that is exactly zero comes back at about machine epsilon
  // relative to the largest, so its singular value lands near 1e-8. spectralGap reports the
  // largest consecutive ratio in the spectrum so the choice can be checked rather than
  // trusted -- for the single edge that gap is nearly six orders of magnitude wide.
  function operatorSpectrum(operator, options) {
    const settings = options || {};
    const size = operator.config.unknowns;
    const eigenvalues = symmetricEigenvalues(gramMatrix(operator), size, settings.sweeps);
    const singular = eigenvalues.map((value) => Math.sqrt(value));
    const largest = singular[0] || 0;
    const cutoff = largest * 0.01;
    let usable = 0;
    for (const value of singular) if (value > cutoff) usable += 1;
    const rankCutoff = largest * (settings.rankThreshold || 1e-6);
    let numericalRank = 0;
    for (const value of singular) if (value > rankCutoff) numericalRank += 1;
    // The gap ACROSS THE CUT, not the largest gap anywhere. Searching the whole spectrum for a
    // maximum finds ratios inside the numerical floor, where a jump from 1e-9 to 1e-12 is
    // meaningless. The question this answers is narrower and the only one worth asking: how
    // much daylight is there exactly where the rank threshold was placed? A wide gap means
    // the threshold could have been anywhere in orders of magnitude; a narrow one means the
    // rank is a judgement call and should be reported as such.
    const gapRatio = numericalRank > 0 && numericalRank < singular.length
      ? (singular[numericalRank] > 0 ? singular[numericalRank - 1] / singular[numericalRank] : Infinity)
      : null;
    let smallest = 0;
    for (let i = singular.length - 1; i >= 0; i -= 1) {
      if (singular[i] > 0) { smallest = singular[i]; break; }
    }
    // Entropy effective rank: exp of the Shannon entropy of the normalized spectrum. Unlike a
    // threshold count it has no free parameter, so the two disagreeing is informative.
    let total = 0;
    for (const value of singular) total += value;
    let entropy = 0;
    if (total > 0) {
      for (const value of singular) {
        const p = value / total;
        if (p > 0) entropy -= p * Math.log(p);
      }
    }
    return {
      aperture: operator.aperture,
      label: APERTURE_LABELS[operator.aperture] || operator.aperture,
      singular,
      largest,
      smallest,
      usableDirections: usable,
      numericalRank,
      spectralGapRatio: gapRatio,
      totalDirections: size,
      condition: smallest > 0 ? largest / smallest : Infinity,
      effectiveRank: Math.exp(entropy)
    };
  }

  function apertureComparison(overrides, options) {
    const result = {};
    for (const key of APERTURE_KEYS) {
      result[key] = operatorSpectrum(buildOperator(key, overrides), options);
    }
    return result;
  }

  // ---------------------------------------------------------------------------------------
  // Hidden scenes
  // ---------------------------------------------------------------------------------------

  // Four scenes chosen so the apertures cannot all be ranked by one of them.
  //
  //   stackedPair  the edge-killer: two blobs at the SAME azimuth, different elevation. A
  //                single straight edge cannot separate them with any number of photons.
  //   columns      vertical stripes, essentially uniform in elevation. This is the edge's own
  //                subspace, so the edge should do WELL here -- the claim is that it is blind
  //                along one axis, not that it is a bad operator.
  //   bar          a horizontal stripe. Counterintuitively this is HARD for the edge: its
  //                range is the full-height cos(phi) profile, so it can only answer with a
  //                floor-to-ceiling smear, and a narrow stripe is nearly orthogonal to that.
  //   diagonalPair varies along both axes at once.
  //
  // sigmaPhi defaults to sigma; setting it large makes a blob a column.
  const SCENES = {
    stackedPair: [
      { theta: -0.12, phi: 0.30, sigma: 0.10, weight: 1 },
      { theta: -0.12, phi: -0.28, sigma: 0.10, weight: 0.8 }
    ],
    columns: [
      { theta: -0.32, phi: 0, sigma: 0.075, sigmaPhi: 4, weight: 1 },
      { theta: 0.02, phi: 0, sigma: 0.075, sigmaPhi: 4, weight: 0.75 },
      { theta: 0.33, phi: 0, sigma: 0.075, sigmaPhi: 4, weight: 1 }
    ],
    diagonalPair: [
      { theta: -0.30, phi: 0.28, sigma: 0.10, weight: 1 },
      { theta: 0.28, phi: -0.26, sigma: 0.10, weight: 0.8 }
    ],
    bar: [
      { theta: -0.34, phi: 0.10, sigma: 0.09, weight: 1 },
      { theta: -0.11, phi: 0.10, sigma: 0.09, weight: 1 },
      { theta: 0.12, phi: 0.10, sigma: 0.09, weight: 1 },
      { theta: 0.35, phi: 0.10, sigma: 0.09, weight: 1 }
    ]
  };

  function makeScene(name, overrides) {
    const config = makeConfig(overrides);
    if(name==="stilllife") return makeStillLifeScene(config);
    const blobs = SCENES[name];
    if (!blobs) throw new Error(`unknown scene ${name}`);
    const { grid } = config;
    const x = new Float64Array(config.unknowns);
    for (let j = 0; j < grid; j += 1) {
      const phi = -config.phiHalf + (grid > 1 ? 2 * config.phiHalf * j / (grid - 1) : 0);
      for (let i = 0; i < grid; i += 1) {
        const theta = -config.thetaHalf + (grid > 1 ? 2 * config.thetaHalf * i / (grid - 1) : 0);
        let value = 0;
        for (const blob of blobs) {
          const dx = theta - blob.theta;
          const dy = phi - blob.phi;
          const sigmaPhi = blob.sigmaPhi || blob.sigma;
          value += blob.weight * Math.exp(
            -(dx * dx) / (2 * blob.sigma * blob.sigma)
            - (dy * dy) / (2 * sigmaPhi * sigmaPhi)
          );
        }
        x[j * grid + i] = value;
      }
    }
    normalize(x);
    return x;
  }

  // A recognizable angular radiance image, not a finite-distance geometry reconstruction.
  // The sphere and vase are shaded motifs in the directional unknown; no range is introduced.
  function makeStillLifeScene(config) {
    const grid=config.grid,image=new Float64Array(config.unknowns);
    function sample(x,y) {
      let value=y>.75?.13:.045+.04*(1-y);
      value-=.08*Math.exp(-(((x-.38)/.24)**2+((y-.78)/.04)**2));
      const sx=(x-.30)/.22,sy=(y-.54)/.22,r2=sx*sx+sy*sy;
      if(r2<1) value=.14+.64*Math.max(0,-.40*sx-.55*sy+.72*Math.sqrt(1-r2));
      if(y>.15&&y<.76) {
        const radius=.055+.12*Math.exp(-(((y-.57)/.18)**4));
        const nx=(x-.71)/radius;
        if(Math.abs(nx)<1) {
          const z=Math.sqrt(1-nx*nx);
          value=.17+.68*Math.max(0,-.45*nx+.83*z);
          if(y<.18) value=.16+.32*z;
          if(y>.38&&y<.41) value*=.60;
        }
      }
      return Math.max(0,value);
    }
    for(let j=0;j<grid;j+=1) for(let i=0;i<grid;i+=1) {
      let sum=0;
      for(let sy=0;sy<3;sy+=1) for(let sx=0;sx<3;sx+=1) {
        sum+=sample((i+(sx+.5)/3)/grid,1-(j+(sy+.5)/3)/grid);
      }
      image[j*grid+i]=sum/9;
    }
    normalize(image);return image;
  }

  // ---------------------------------------------------------------------------------------
  // Inversion
  // ---------------------------------------------------------------------------------------

  function measure(operator, truth, noise, seed) {
    const clean = applyForward(operator, truth);
    if (!noise) return clean;
    let scale = 0;
    for (const value of clean) scale = Math.max(scale, Math.abs(value));
    const rng = mulberry32((seed || 1) >>> 0);
    const noisy = new Float64Array(clean.length);
    for (let i = 0; i < clean.length; i += 1) {
      noisy[i] = clean[i] + gaussian(rng) * noise * scale;
    }
    return noisy;
  }

  // Projected gradient on
  //   min_x ||A x - y||^2 + lambda ||L x||^2   subject to x >= 0,
  // with L the 2-D Laplacian. Same solver family as the 1-D lane, lifted to two axes. The
  // prior is a prior: it stabilizes, it does not add rank, and the panel says so.
  function reconstruct(operator, measurement, overrides) {
    const config = Object.assign({}, operator.config, overrides || {});
    const { unknowns, grid } = operator.config;
    const lambda = config.lambda;
    const gram = gramMatrix(operator);
    const atY = applyAdjoint(operator, measurement);

    let scale = 0;
    for (let i = 0; i < unknowns; i += 1) {
      let rowSum = 0;
      for (let j = 0; j < unknowns; j += 1) rowSum += Math.abs(gram[i * unknowns + j]);
      scale = Math.max(scale, rowSum);
    }
    const step = 1 / Math.max(1e-9, scale + 8 * lambda);

    const estimate = new Float64Array(unknowns);
    const gradient = new Float64Array(unknowns);
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      for (let j = 0; j < grid; j += 1) {
        for (let i = 0; i < grid; i += 1) {
          const index = j * grid + i;
          let sum = -atY[index];
          const base = index * unknowns;
          for (let c = 0; c < unknowns; c += 1) sum += gram[base + c] * estimate[c];
          // Neumann boundary: reflect, so the prior does not pull the border toward zero.
          const left = i > 0 ? estimate[index - 1] : estimate[index];
          const right = i < grid - 1 ? estimate[index + 1] : estimate[index];
          const down = j > 0 ? estimate[index - grid] : estimate[index];
          const up = j < grid - 1 ? estimate[index + grid] : estimate[index];
          sum += lambda * (4 * estimate[index] - left - right - down - up);
          gradient[index] = sum;
        }
      }
      for (let c = 0; c < unknowns; c += 1) {
        estimate[c] = Math.max(0, estimate[c] - step * gradient[c]);
      }
    }
    normalize(estimate);
    return estimate;
  }

  // ---------------------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------------------

  function rmse(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
    return Math.sqrt(sum / a.length);
  }

  // Zero-normalized cross correlation, so a recovery that has the right shape at the wrong
  // overall brightness is not punished for the brightness.
  function zncc(a, b) {
    let meanA = 0;
    let meanB = 0;
    for (let i = 0; i < a.length; i += 1) { meanA += a[i]; meanB += b[i]; }
    meanA /= a.length;
    meanB /= b.length;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i += 1) {
      const u = a[i] - meanA;
      const v = b[i] - meanB;
      num += u * v;
      da += u * u;
      db += v * v;
    }
    if (da <= 0 || db <= 0) return 0;
    return num / Math.sqrt(da * db);
  }

  // The elevation marginal, normalized. This is the sharp instrument for the edge's blindness.
  //
  // The edge's columns for a shared azimuth are proportional rather than identical -- the
  // cos(phi) foreshortening scales them -- so its range is spanned by vectors of the form
  // (azimuth pattern) x (cos phi). The elevation profile it recovers is therefore fixed by the
  // OPERATOR and carries nothing from the scene: swap the hidden scene for a different one and
  // the recovered elevation profile does not move. That is a stronger and more falsifiable
  // statement than "the recovery looks flat", and it needs no threshold.
  function elevationProfile(image, grid) {
    const profile = new Float64Array(grid);
    for (let j = 0; j < grid; j += 1) {
      let sum = 0;
      for (let i = 0; i < grid; i += 1) sum += image[j * grid + i];
      profile[j] = sum;
    }
    let total = 0;
    for (const value of profile) total += value;
    if (total > 0) for (let j = 0; j < grid; j += 1) profile[j] /= total;
    return profile;
  }

  function maxAbsDifference(a, b) {
    let worst = 0;
    for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    return worst;
  }

  // How much of the image's variation runs along elevation rather than azimuth. The single
  // edge drives this to nearly zero -- not exactly zero, because the cos(phi) column scaling
  // leaves a small fixed gradient that is a property of the operator, not of the scene.
  function elevationContrast(image, grid) {
    const columnMean = new Float64Array(grid);
    for (let i = 0; i < grid; i += 1) {
      let sum = 0;
      for (let j = 0; j < grid; j += 1) sum += image[j * grid + i];
      columnMean[i] = sum / grid;
    }
    let within = 0;
    let total = 0;
    let grand = 0;
    for (let c = 0; c < image.length; c += 1) grand += image[c];
    grand /= image.length;
    for (let j = 0; j < grid; j += 1) {
      for (let i = 0; i < grid; i += 1) {
        within += (image[j * grid + i] - columnMean[i]) ** 2;
        total += (image[j * grid + i] - grand) ** 2;
      }
    }
    return total > 0 ? within / total : 0;
  }

  // One aperture, end to end: build, measure, invert, score.
  function runTrial(aperture, sceneName, overrides, options) {
    const settings = options || {};
    const operator = buildOperator(aperture, overrides);
    const truth = makeScene(sceneName, overrides);
    const measurement = measure(operator, truth, settings.noise || 0, settings.seed || 12345);
    const recovery = reconstruct(operator, measurement, overrides);
    return {
      aperture,
      label: APERTURE_LABELS[aperture] || aperture,
      scene: sceneName,
      truth,
      recovery,
      measurement,
      grid: operator.config.grid,
      sensor: operator.config.sensor,
      rmse: rmse(truth, recovery),
      zncc: zncc(truth, recovery),
      truthElevationContrast: elevationContrast(truth, operator.config.grid),
      recoveryElevationContrast: elevationContrast(recovery, operator.config.grid),
      truthElevationProfile: elevationProfile(truth, operator.config.grid),
      recoveryElevationProfile: elevationProfile(recovery, operator.config.grid)
    };
  }

  // ---------------------------------------------------------------------------------------
  // Larger image camera: a calibrated, periodically tiled aperture plane.
  //
  // This is deliberately a separate acquisition from the finite-edge diagnostic above.
  // Tangent-direction shifts and detector positions share a lattice. A known tiled binary
  // mask then gives an EXACT circular convolution, y = H * (W x), with cosine/quadrature
  // weights W. Increasing size changes real detector samples and image unknowns, not only
  // display interpolation. There is no metric-distance unknown and no perspective geometry fit.
  const IMAGE_CAMERA_DEFAULTS = { size: 64, mask: "coded", seed: 70931, noise: .0002, tangentHalf: .62 };
  const IMAGE_SCENES = { ceramics: "Ceramic observatory", botanical: "Botanical alcove", arcade: "Sunlit arcade" };
  const IMAGE_MASKS = { coded: "Fine coded mask", coarse: "Coarse coded blocks", slit: "Vertical slit code", open: "Open aperture" };

  function imageFft1(re, im, inverse) {
    const n=re.length;
    for(let i=1,j=0;i<n;i+=1) {
      let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
      if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}
    }
    for(let len=2;len<=n;len<<=1) {
      const angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
      for(let i=0;i<n;i+=len) {
        let cr=1,ci=0;
        for(let j=0;j<len/2;j+=1) {
          const a=i+j,b=a+len/2,br=re[b]*cr-im[b]*ci,bi=re[b]*ci+im[b]*cr;
          re[b]=re[a]-br;im[b]=im[a]-bi;re[a]+=br;im[a]+=bi;
          const next=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=next;
        }
      }
    }
    if(inverse)for(let i=0;i<n;i+=1){re[i]/=n;im[i]/=n;}
  }

  function imageTransform(field, size, imaginary, inverse) {
    const re=Float64Array.from(field),im=imaginary?Float64Array.from(imaginary):new Float64Array(field.length);
    const rowRe=new Float64Array(size),rowIm=new Float64Array(size);
    for(let y=0;y<size;y+=1) imageFft1(re.subarray(y*size,(y+1)*size),im.subarray(y*size,(y+1)*size),inverse);
    for(let x=0;x<size;x+=1) {
      for(let y=0;y<size;y+=1){rowRe[y]=re[y*size+x];rowIm[y]=im[y*size+x];}
      imageFft1(rowRe,rowIm,inverse);
      for(let y=0;y<size;y+=1){re[y*size+x]=rowRe[y];im[y*size+x]=rowIm[y];}
    }
    return {re,im};
  }

  function buildImageCamera(overrides) {
    const config=Object.assign({},IMAGE_CAMERA_DEFAULTS,overrides||{}),n=config.size;
    if(![16,32,64,128].includes(n)) throw new Error("image camera size must be 16, 32, 64 or 128");
    if(!IMAGE_MASKS[config.mask]) throw new Error("unknown image camera mask");
    const cells=n*n,mask=new Float64Array(cells),weights=new Float64Array(cells);
    const rng=mulberry32(config.seed),block=config.mask==="coarse"?4:1,table=new Uint8Array(cells);
    for(let i=0;i<cells;i+=1)table[i]=rng()<.5?1:0;
    const pitch=2*config.tangentHalf/n;
    for(let y=0;y<n;y+=1)for(let x=0;x<n;x+=1) {
      const i=y*n+x;
      mask[i]=config.mask==="open"?1:config.mask==="slit"?table[x]:table[Math.floor(y/block)*n+Math.floor(x/block)];
      const sx=(x+.5-n/2)*pitch,sy=(y+.5-n/2)*pitch;
      weights[i]=pitch*pitch/Math.pow((1+sx*sx)*(1+sy*sy),1.5);
    }
    const transfer=imageTransform(mask,n);
    let transmission=0;for(const value of mask)transmission+=value;transmission/=cells;
    let visibleFrequencies=0;
    const magnitudes=new Float64Array(cells),dc=Math.hypot(transfer.re[0],transfer.im[0]);
    for(let i=0;i<cells;i+=1){magnitudes[i]=Math.hypot(transfer.re[i],transfer.im[i]);if(magnitudes[i]>dc*.01)visibleFrequencies+=1;}
    return {config,mask,weights,transfer,transmission,magnitudes,visibleFrequencies};
  }

  function applyImageForward(camera,image) {
    const n=camera.config.size,cells=n*n;
    if(image.length!==cells)throw new Error("image camera input length mismatch");
    const spectrum=imageTransform(Float64Array.from(image,(v,i)=>v*camera.weights[i]),n);
    for(let i=0;i<cells;i+=1) {
      const a=spectrum.re[i],b=spectrum.im[i],h=camera.transfer;
      spectrum.re[i]=a*h.re[i]-b*h.im[i];spectrum.im[i]=a*h.im[i]+b*h.re[i];
    }
    return imageTransform(spectrum.re,n,spectrum.im,true).re;
  }

  function applyImageAdjoint(camera,measurement) {
    const n=camera.config.size,cells=n*n;
    if(measurement.length!==cells)throw new Error("image camera measurement length mismatch");
    const spectrum=imageTransform(measurement,n);
    for(let i=0;i<cells;i+=1) {
      const a=spectrum.re[i],b=spectrum.im[i],h=camera.transfer;
      spectrum.re[i]=a*h.re[i]+b*h.im[i];spectrum.im[i]=b*h.re[i]-a*h.im[i];
    }
    return Float64Array.from(imageTransform(spectrum.re,n,spectrum.im,true).re,(v,i)=>v*camera.weights[i]);
  }

  function captureImageCamera(camera,rgb,noise,seed) {
    const cells=camera.config.size**2;
    if(rgb.length!==cells*3)throw new Error("RGB image size mismatch");
    const output=new Float64Array(rgb.length),rng=mulberry32(seed||113);
    for(let channel=0;channel<3;channel+=1) {
      const field=Float64Array.from({length:cells},(_,i)=>rgb[i*3+channel]);
      const measurement=applyImageForward(camera,field);
      for(let i=0;i<cells;i+=1)output[i*3+channel]=measurement[i]+gaussian(rng)*(noise||0);
    }
    return output;
  }

  // Solve for z = W x with a fixed smoothness prior in frequency space, then undo the known
  // quadrature weights. This is a measurement-only regularized inverse; no scene generator,
  // truth pixels or evaluation score are available inside this function. Null frequencies
  // stay unfilled. The prior suppresses noise, and cannot restore a direction the mask removes.
  function reconstructImageCamera(camera,measurement,noise) {
    const n=camera.config.size,cells=n*n;
    if(measurement.length!==cells*3)throw new Error("RGB measurement size mismatch");
    const output=new Float64Array(measurement.length),prior=new Float64Array(cells);
    let priorSum=0,meanWeight=0;
    for(const weight of camera.weights)meanWeight+=weight;meanWeight/=cells;
    for(let y=0;y<n;y+=1)for(let x=0;x<n;x+=1) {
      const fx=Math.min(x,n-x),fy=Math.min(y,n-y),i=y*n+x;
      prior[i]=1/Math.pow(1+fx*fx+fy*fy,1.5);priorSum+=prior[i];
    }
    const gain=cells*cells*.025*meanWeight*meanWeight/priorSum;
    const noiseTerm=cells*(noise||0)**2;
    for(let channel=0;channel<3;channel+=1) {
      const spectrum=imageTransform(Float64Array.from({length:cells},(_,i)=>measurement[i*3+channel]),n);
      for(let i=0;i<cells;i+=1) {
        const h=camera.transfer,a=spectrum.re[i],b=spectrum.im[i],power=h.re[i]**2+h.im[i]**2;
        const regularizer=i===0?0:noiseTerm/Math.max(1e-20,prior[i]*gain);
        const denominator=power+regularizer;
        if(power<1e-18||denominator<=0){spectrum.re[i]=0;spectrum.im[i]=0;continue;}
        spectrum.re[i]=(a*h.re[i]+b*h.im[i])/denominator;
        spectrum.im[i]=(b*h.re[i]-a*h.im[i])/denominator;
      }
      const field=imageTransform(spectrum.re,n,spectrum.im,true).re;
      for(let i=0;i<cells;i+=1)output[i*3+channel]=field[i]/camera.weights[i];
    }
    return output;
  }

  function makeImageScene(name,size) {
    if(!IMAGE_SCENES[name])throw new Error("unknown rendered image scene");
    const n=size||64,output=new Float64Array(n*n*3);
    const shade=(base,nx,ny,nz,rough=.2)=>{
      const light=Math.max(0,-.46*nx-.57*ny+.68*nz),spec=Math.pow(Math.max(0,-.32*nx-.42*ny+.85*nz),24+rough*60);
      return base.map((v,i)=>v*(.22+.85*light)+spec*(i===2?.19:.24));
    };
    const leaves=[[.67,.24,.51,.12,.035],[.67,.32,.85,.20,.041],[.67,.40,.43,.29,.048],[.66,.47,.87,.41,.049],[.66,.55,.46,.50,.039],[.66,.60,.84,.58,.039]];
    function sample(x,y) {
      let c=y>.76?[.29+.1*y,.17+.065*y,.105+.025*y]:[.12+.16*(1-y),.17+.17*(1-y),.19+.21*(1-y)];
      if(name==="arcade") {
        c=y>.68?[.52,.285,.12]:[.19+.12*(1-y),.35+.10*(1-y),.39+.14*(1-y)];
        for(let a=0;a<3;a+=1) {
          const center=.19+a*.285,width=.105,arch=((x-center)/width)**2+((y-.29)/.17)**2;
          if(x>center-width-.04&&x<center+width+.04&&y>.14&&y<.70)c=[.77,.53,.285];
          if(Math.abs(x-center)<width&&y<.66&&(y>.29||arch<1))c=[.12+.1*y,.15+.065*y,.17];
          if(x>center+width&&x<center+width+.027&&y>.29&&y<.70)c=[.40,.25,.145];
        }
        if(y>.70&&Math.abs(Math.sin((x+.18/(y-.55))*18))>.95)c=c.map(v=>v*.76);
      } else {
        const arch=((x-.52)/.43)**2+((y-.29)/.245)**2;
        if(x>.09&&x<.95&&y<.75&&(y>.29||arch<1))c=[.27+.13*(1-y),.34+.10*(1-y),.35+.10*(1-y)];
      }
      const shadow=.20*Math.exp(-(((x-.37)/.27)**2+((y-.805)/.043)**2))+.12*Math.exp(-(((x-.70)/.17)**2+((y-.77)/.035)**2));
      c=c.map(v=>Math.max(0,v-shadow));
      const sx=(x-(name==="arcade"?.65:.30))/.185,sy=(y-(name==="arcade"?.77:.61))/.185,r2=sx*sx+sy*sy;
      if(r2<1) {
        const z=Math.sqrt(1-r2);c=shade(name==="arcade"?[.045,.34,.29]:[.12,.31,.40],sx,sy,z,.3);
        if(name!=="arcade")c=c.map(v=>v*(1-.10*Math.pow(.5+.5*Math.cos((sy+.12*z)*35),10)));
      }
      if(name==="ceramics"&&y>.17&&y<.785) {
        const radius=.060+.112*Math.exp(-(((y-.58)/.175)**4)),nx=(x-.70)/radius;
        if(Math.abs(nx)<1) {
          const z=Math.sqrt(1-nx*nx);c=shade([.62,.32,.105],nx,-.12,z,.2);
          if(y<.20)c=[.15+.20*z,.10+.15*z,.08+.06*z];
          if((y>.35&&y<.367)||(y>.694&&y<.710))c=c.map(v=>v*.42);
        }
      }
      if(name==="botanical") {
        if(y>.61&&y<.78&&Math.abs(x-.665)<.12-(y-.61)*.24) {
          const nx=(x-.665)/.12;c=shade([.57,.20,.105],nx,-.05,Math.sqrt(Math.max(0,1-nx*nx)),.8);
        }
        if(y>.603&&y<.625&&Math.abs(x-.665)<.129)c=[.67,.30,.145];
        if(y>.20&&y<.615&&Math.abs(x-.665)<.006)c=[.12,.19,.065];
        for(const [ax,ay,bx,by,width]of leaves) {
          const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),t=((x-ax)*dx+(y-ay)*dy)/(length*length),across=((x-ax)*-dy+(y-ay)*dx)/length;
          if(t>0&&t<1&&Math.abs(across)<width*4*t*(1-t)) {
            const highlight=1-Math.abs(across)/width;c=[.075+.08*highlight,.20+.25*highlight+.04*t,.07+.085*highlight];
            if(Math.abs(across)<.0025)c=[.25,.48,.11];
          }
        }
      }
      if(name!=="arcade"&&x>.1&&x<.28&&y>.85&&y<.9){c=[.66,.55,.31];if(Math.abs(y-.873)<.003||Math.abs(Math.sin(x*190))>.93)c=[.12,.15,.15];}
      return c.map(v=>Math.max(0,Math.min(1,v)));
    }
    for(let y=0;y<n;y+=1)for(let x=0;x<n;x+=1) {
      const color=[0,0,0];
      for(let sy=0;sy<2;sy+=1)for(let sx=0;sx<2;sx+=1){const value=sample((x+(sx+.5)/2)/n,(y+(sy+.5)/2)/n);for(let k=0;k<3;k+=1)color[k]+=value[k]*.25;}
      for(let k=0;k<3;k+=1)output[(y*n+x)*3+k]=color[k];
    }
    return output;
  }

  function normalize(array) {
    let max = 0;
    for (const value of array) max = Math.max(max, value);
    if (max <= 0) return array;
    for (let i = 0; i < array.length; i += 1) array[i] /= max;
    return array;
  }

  function gaussian(rng) {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    DEFAULTS,
    APERTURE_KEYS,
    APERTURE_LABELS,
    SCENES,
    IMAGE_CAMERA_DEFAULTS,
    IMAGE_SCENES,
    IMAGE_MASKS,
    buildImageCamera,
    applyImageForward,
    applyImageAdjoint,
    captureImageCamera,
    reconstructImageCamera,
    makeImageScene,
    makeConfig,
    apertureX,
    apertureY,
    aperturePoint,
    visibilityTest,
    buildOperator,
    applyForward,
    applyAdjoint,
    gramMatrix,
    symmetricEigenvalues,
    operatorSpectrum,
    apertureComparison,
    makeScene,
    measure,
    reconstruct,
    runTrial,
    rmse,
    zncc,
    elevationContrast,
    elevationProfile,
    maxAbsDifference,
    mulberry32
  };
});
