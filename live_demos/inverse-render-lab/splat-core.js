(function initSplatCore(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SplatCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // 2D Gaussian splatting with a hand-derived analytic adjoint and adaptive density control.
  //
  // The existing 2D lab is structurally the same object -- soft anisotropic primitives, alpha
  // compositing, an exact adjoint -- but pinned at three shapes with a sigmoid-of-ellipse
  // kernel. This lane keeps that lab intact and changes the four things that make the
  // difference between "differentiable ellipses" and the representation the field actually
  // uses:
  //
  //   1. a true Gaussian kernel, exp(-q/2), not a sigmoid of the implicit ellipse;
  //   2. front-to-back compositing with explicit transmittance, which is the form the
  //      backward recurrence below assumes;
  //   3. an unbounded, mutable splat population instead of a fixed vector;
  //   4. ADAPTIVE DENSITY CONTROL -- clone, split and prune driven by the positional
  //      gradient. This is the part that is actually the contribution of 3D Gaussian
  //      Splatting; rendering ellipses was never the hard bit.
  //
  // What this is NOT: it is the 2D case. No 3D covariance, no view-dependent spherical
  // harmonics, no camera. Depth is an ordering key, not a coordinate. The lane exists to make
  // densification and the bake-in failure mode inspectable, not to claim a 3DGS
  // implementation.

  const FLOATS_PER_SPLAT = 10;
  const OFFSET = {
    x: 0, y: 1, logSx: 2, logSy: 3, theta: 4,
    r: 5, g: 6, b: 7, logitOpacity: 8, depth: 9
  };

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const clamp01 = (value) => clamp(value, 0, 1);
  const sigmoid = (value) => 1 / (1 + Math.exp(-value));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- splat population -----------------------------------------------------------------
  //
  // Stored flat so the population can grow and shrink without reallocating per splat. Scale is
  // held in log space and opacity behind a logit, exactly as 3DGS does: it keeps both strictly
  // positive under unconstrained gradient steps, and it is what makes a scale of 0.004 and one
  // of 0.4 take comparable step sizes.
  function createPopulation(count, options = {}) {
    const random = options.random || mulberry32(0x5b1a7);
    const data = new Float64Array(count * FLOATS_PER_SPLAT);
    for (let index = 0; index < count; index += 1) {
      const base = index * FLOATS_PER_SPLAT;
      data[base + OFFSET.x] = (random() * 2 - 1) * 0.75;
      data[base + OFFSET.y] = (random() * 2 - 1) * 0.75;
      const scale = options.initialScale || 0.22;
      data[base + OFFSET.logSx] = Math.log(scale * (0.7 + random() * 0.6));
      data[base + OFFSET.logSy] = Math.log(scale * (0.7 + random() * 0.6));
      data[base + OFFSET.theta] = random() * Math.PI;
      data[base + OFFSET.r] = 0.4 + random() * 0.2;
      data[base + OFFSET.g] = 0.4 + random() * 0.2;
      data[base + OFFSET.b] = 0.4 + random() * 0.2;
      data[base + OFFSET.logitOpacity] = 0;
      data[base + OFFSET.depth] = random();
    }
    return { data, count };
  }

  function splatView(population, index) {
    const base = index * FLOATS_PER_SPLAT;
    const data = population.data;
    return {
      base,
      x: data[base + OFFSET.x],
      y: data[base + OFFSET.y],
      sx: Math.exp(data[base + OFFSET.logSx]),
      sy: Math.exp(data[base + OFFSET.logSy]),
      theta: data[base + OFFSET.theta],
      color: [data[base + OFFSET.r], data[base + OFFSET.g], data[base + OFFSET.b]],
      opacity: sigmoid(data[base + OFFSET.logitOpacity]),
      depth: data[base + OFFSET.depth]
    };
  }

  // Sorted front-to-back. Real 3DGS sorts per view every frame; here depth is a fixed ordering
  // key, so the sort is stable for a given population and only changes when depth is optimized
  // or the population mutates.
  function sortedOrder(population) {
    const order = Array.from({ length: population.count }, (_, index) => index);
    order.sort((a, b) =>
      population.data[a * FLOATS_PER_SPLAT + OFFSET.depth] - population.data[b * FLOATS_PER_SPLAT + OFFSET.depth]);
    return order;
  }

  // --- forward --------------------------------------------------------------------------
  //
  //   Sigma^-1 = R S^-2 R^T, so with d rotated into the splat frame
  //     q  = (xr/sx)^2 + (yr/sy)^2
  //     a  = opacity * exp(-q/2)
  //   composited front to back with transmittance T:
  //     C  = sum_i c_i a_i T_i + bg * T_N,   T_{i+1} = T_i (1 - a_i)
  function evaluatePixel(population, order, u, v, background) {
    let transmittance = 1;
    const color = [0, 0, 0];
    for (let slot = 0; slot < order.length; slot += 1) {
      const splat = splatView(population, order[slot]);
      const dx = u - splat.x;
      const dy = v - splat.y;
      const cosT = Math.cos(splat.theta);
      const sinT = Math.sin(splat.theta);
      const xr = cosT * dx + sinT * dy;
      const yr = -sinT * dx + cosT * dy;
      const xu = xr / splat.sx;
      const yu = yr / splat.sy;
      const q = xu * xu + yu * yu;
      // 3DGS skips beyond ~3 sigma; the cut is a real approximation and is stated as one.
      if (q > 9) continue;
      const alpha = clamp(splat.opacity * Math.exp(-0.5 * q), 0, 0.999);
      const weight = alpha * transmittance;
      color[0] += splat.color[0] * weight;
      color[1] += splat.color[1] * weight;
      color[2] += splat.color[2] * weight;
      transmittance *= 1 - alpha;
      if (transmittance < 1e-4) break;
    }
    color[0] += background[0] * transmittance;
    color[1] += background[1] * transmittance;
    color[2] += background[2] * transmittance;
    return color;
  }

  function renderImage(population, width, height, background) {
    const order = sortedOrder(population);
    const out = new Float64Array(width * height * 3);
    for (let py = 0; py < height; py += 1) {
      const v = (py + 0.5) / height * 2 - 1;
      for (let px = 0; px < width; px += 1) {
        const u = (px + 0.5) / width * 2 - 1;
        const rgb = evaluatePixel(population, order, u, v, background);
        const base = (py * width + px) * 3;
        out[base] = rgb[0];
        out[base + 1] = rgb[1];
        out[base + 2] = rgb[2];
      }
    }
    return out;
  }

  // --- analytic adjoint -------------------------------------------------------------------
  //
  // The backward recurrence avoids the usual division by (1 - a_i). Define post_i as the colour
  // contributed by everything AFTER splat i, expressed relative to T_{i+1}:
  //
  //   post_i = a_{i+1} c_{i+1} + (1 - a_{i+1}) post_{i+1},   post_{N-1} = background
  //
  // then C = ... + T_i a_i c_i + T_i (1 - a_i) post_i, so
  //
  //   dC/da_i = T_i (c_i - post_i)
  //
  // which is stable even where a_i approaches 1. Walking the splats backward while updating
  // post costs one pass and no stored suffix sums.
  function accumulateGradient(population, order, u, v, background, dLdC, gradient, positionalGrad) {
    const visible = [];
    let transmittance = 1;
    for (let slot = 0; slot < order.length; slot += 1) {
      const index = order[slot];
      const splat = splatView(population, index);
      const dx = u - splat.x;
      const dy = v - splat.y;
      const cosT = Math.cos(splat.theta);
      const sinT = Math.sin(splat.theta);
      const xr = cosT * dx + sinT * dy;
      const yr = -sinT * dx + cosT * dy;
      const q = (xr / splat.sx) ** 2 + (yr / splat.sy) ** 2;
      if (q > 9) continue;
      const raw = splat.opacity * Math.exp(-0.5 * q);
      const alpha = clamp(raw, 0, 0.999);
      visible.push({ index, splat, dx, dy, cosT, sinT, xr, yr, q, alpha, raw, transmittance });
      transmittance *= 1 - alpha;
      if (transmittance < 1e-4) break;
    }

    let post = [background[0], background[1], background[2]];
    for (let slot = visible.length - 1; slot >= 0; slot -= 1) {
      const entry = visible[slot];
      const { splat, alpha } = entry;
      const base = splat.base;
      const weight = alpha * entry.transmittance;

      // colour
      gradient[base + OFFSET.r] += dLdC[0] * weight;
      gradient[base + OFFSET.g] += dLdC[1] * weight;
      gradient[base + OFFSET.b] += dLdC[2] * weight;

      // alpha
      const dLdAlpha = entry.transmittance * (
        dLdC[0] * (splat.color[0] - post[0])
        + dLdC[1] * (splat.color[1] - post[1])
        + dLdC[2] * (splat.color[2] - post[2])
      );

      // The clamp at 0.999 is a hard saturation: past it alpha stops responding, so its
      // derivative is genuinely zero rather than small.
      const responsive = entry.raw < 0.999 ? 1 : 0;

      // alpha = opacity * exp(-q/2), opacity = sigmoid(logit)
      const dAlphaDOpacity = Math.exp(-0.5 * entry.q) * responsive;
      const dOpacityDLogit = splat.opacity * (1 - splat.opacity);
      gradient[base + OFFSET.logitOpacity] += dLdAlpha * dAlphaDOpacity * dOpacityDLogit;

      const dAlphaDq = -0.5 * alpha * responsive;
      const dLdq = dLdAlpha * dAlphaDq;

      // q = (xr/sx)^2 + (yr/sy)^2
      const invSx2 = 1 / (splat.sx * splat.sx);
      const invSy2 = 1 / (splat.sy * splat.sy);
      const dqDxr = 2 * entry.xr * invSx2;
      const dqDyr = 2 * entry.yr * invSy2;

      // scale, in log space: dq/d(log s) = s * dq/ds = -2 (xr/sx)^2 for x, likewise y
      gradient[base + OFFSET.logSx] += dLdq * (-2 * entry.xr * entry.xr * invSx2);
      gradient[base + OFFSET.logSy] += dLdq * (-2 * entry.yr * entry.yr * invSy2);

      // rotation: dxr/dtheta = yr, dyr/dtheta = -xr
      gradient[base + OFFSET.theta] += dLdq * (dqDxr * entry.yr - dqDyr * entry.xr);

      // centre: d(dx)/dx = -1, so dxr/dx = -cos, dyr/dx = +sin; dxr/dy = -sin, dyr/dy = -cos
      const dqDx = dqDxr * -entry.cosT + dqDyr * entry.sinT;
      const dqDy = dqDxr * -entry.sinT + dqDyr * -entry.cosT;
      gradient[base + OFFSET.x] += dLdq * dqDx;
      gradient[base + OFFSET.y] += dLdq * dqDy;

      // Positional gradient magnitude drives densification: a splat whose centre the loss keeps
      // pulling is one that is trying to explain more than it can.
      if (positionalGrad) {
        positionalGrad[entry.index] += Math.hypot(dLdq * dqDx, dLdq * dqDy);
      }

      post = [
        alpha * splat.color[0] + (1 - alpha) * post[0],
        alpha * splat.color[1] + (1 - alpha) * post[1],
        alpha * splat.color[2] + (1 - alpha) * post[2]
      ];
    }
  }

  function lossAndGradient(population, target, width, height, background, options = {}) {
    const gradient = new Float64Array(population.data.length);
    const positionalGrad = options.positionalGrad || null;
    const order = sortedOrder(population);
    const samples = options.samples || null;
    const total = samples ? samples.length : width * height;
    let loss = 0;
    const scale = 1 / (total * 3);
    for (let s = 0; s < total; s += 1) {
      const pixel = samples ? samples[s] : s;
      const px = pixel % width;
      const py = Math.floor(pixel / width);
      const u = (px + 0.5) / width * 2 - 1;
      const v = (py + 0.5) / height * 2 - 1;
      const rgb = evaluatePixel(population, order, u, v, background);
      const base = pixel * 3;
      const dr = rgb[0] - target[base];
      const dg = rgb[1] - target[base + 1];
      const db = rgb[2] - target[base + 2];
      loss += (dr * dr + dg * dg + db * db) * scale;
      const dLdC = [2 * dr * scale, 2 * dg * scale, 2 * db * scale];
      accumulateGradient(population, order, u, v, background, dLdC, gradient, positionalGrad);
    }
    return { loss, gradient };
  }

  // --- adaptive density control ------------------------------------------------------------
  //
  // The actual contribution of Gaussian splatting, and the part a fixed-size primitive fit
  // cannot do. Splats whose centre the loss keeps pulling are under-fitting their footprint:
  // small ones are CLONED toward the gradient, large ones are SPLIT into two narrower children
  // sampled from their own distribution. Anything that has gone transparent is PRUNED.
  function densify(population, positionalGrad, iterations, options = {}) {
    const gradientThreshold = options.gradientThreshold ?? 2e-6;
    const scaleThreshold = options.scaleThreshold ?? 0.16;
    const opacityFloor = options.opacityFloor ?? 0.012;
    const maxSplats = options.maxSplats ?? 600;
    const random = options.random || mulberry32(0x9a71);
    const splitScale = 1.6;

    const kept = [];
    const keptSource = [];
    const spawned = [];
    const spawnedSource = [];
    let cloned = 0;
    let split = 0;
    let pruned = 0;

    for (let index = 0; index < population.count; index += 1) {
      const splat = splatView(population, index);
      if (splat.opacity < opacityFloor) { pruned += 1; continue; }
      const meanGrad = positionalGrad[index] / Math.max(1, iterations);
      const record = population.data.slice(splat.base, splat.base + FLOATS_PER_SPLAT);
      const oversized = Math.max(splat.sx, splat.sy) > scaleThreshold;

      if (meanGrad > gradientThreshold && kept.length + spawned.length < maxSplats) {
        if (oversized) {
          // Split: two children at reduced scale, offset by a draw from the parent's own
          // covariance. The parent is replaced, so a split does not inflate total mass.
          split += 1;
          for (let child = 0; child < 2; child += 1) {
            const copy = record.slice();
            const nx = (random() * 2 - 1);
            const ny = (random() * 2 - 1);
            const cosT = Math.cos(splat.theta);
            const sinT = Math.sin(splat.theta);
            copy[OFFSET.x] += (cosT * nx * splat.sx - sinT * ny * splat.sy) * 0.5;
            copy[OFFSET.y] += (sinT * nx * splat.sx + cosT * ny * splat.sy) * 0.5;
            copy[OFFSET.logSx] -= Math.log(splitScale);
            copy[OFFSET.logSy] -= Math.log(splitScale);
            copy[OFFSET.depth] += (random() - 0.5) * 1e-3;
            spawned.push(copy);
            // Children inherit the parent's optimizer state: they start where it was heading.
            spawnedSource.push(index);
          }
          continue;
        }
        // Clone: keep the parent and add a sibling nudged along the gradient the loss is
        // applying, which is where the unexplained detail is.
        cloned += 1;
        const copy = record.slice();
        copy[OFFSET.x] += (random() - 0.5) * splat.sx * 0.6;
        copy[OFFSET.y] += (random() - 0.5) * splat.sy * 0.6;
        copy[OFFSET.depth] += (random() - 0.5) * 1e-3;
        spawned.push(copy);
        spawnedSource.push(index);
      }
      kept.push(record);
      keptSource.push(index);
    }

    const all = kept.concat(spawned).slice(0, maxSplats);
    const source = keptSource.concat(spawnedSource).slice(0, maxSplats);
    const data = new Float64Array(all.length * FLOATS_PER_SPLAT);
    for (let index = 0; index < all.length; index += 1) data.set(all[index], index * FLOATS_PER_SPLAT);
    return {
      population: { data, count: all.length },
      source,
      cloned,
      split,
      pruned,
      before: population.count,
      after: all.length
    };
  }

  // --- optimizer ---------------------------------------------------------------------------

  function createSolver(options = {}) {
    const width = options.width || 64;
    const height = options.height || 64;
    const random = mulberry32(options.seed || 0x5b1a7);
    const background = options.background || [0.06, 0.07, 0.09];
    const population = createPopulation(options.initialSplats || 8, { random, initialScale: 0.28 });
    return {
      width,
      height,
      background,
      population,
      target: options.target,
      iteration: 0,
      loss: Infinity,
      learningRate: options.learningRate || 0.035,
      moment: new Float64Array(population.data.length),
      velocity: new Float64Array(population.data.length),
      positionalGrad: new Float64Array(population.count),
      sinceDensify: 0,
      densifyInterval: options.densifyInterval || 25,
      densifyUntil: options.densifyUntil || 400,
      maxSplats: options.maxSplats || 600,
      random,
      history: [],
      lastDensify: null
    };
  }

  function stepSolver(solver, steps = 1) {
    for (let step = 0; step < steps; step += 1) {
      const { loss, gradient } = lossAndGradient(
        solver.population, solver.target, solver.width, solver.height, solver.background,
        { positionalGrad: solver.positionalGrad }
      );
      solver.loss = loss;
      // Adam, with position and colour on the same schedule. 3DGS uses per-group learning
      // rates; a single rate is enough at this scale and keeps the lane honest about being a
      // simplification.
      const beta1 = 0.9;
      const beta2 = 0.999;
      const t = solver.iteration + 1;
      const correction1 = 1 - Math.pow(beta1, t);
      const correction2 = 1 - Math.pow(beta2, t);
      for (let index = 0; index < gradient.length; index += 1) {
        solver.moment[index] = beta1 * solver.moment[index] + (1 - beta1) * gradient[index];
        solver.velocity[index] = beta2 * solver.velocity[index] + (1 - beta2) * gradient[index] * gradient[index];
        const m = solver.moment[index] / correction1;
        const v = solver.velocity[index] / correction2;
        solver.population.data[index] -= solver.learningRate * m / (Math.sqrt(v) + 1e-8);
      }
      // Keep colours in gamut; scale and opacity are already parameterized to stay valid.
      for (let index = 0; index < solver.population.count; index += 1) {
        const base = index * FLOATS_PER_SPLAT;
        solver.population.data[base + OFFSET.r] = clamp01(solver.population.data[base + OFFSET.r]);
        solver.population.data[base + OFFSET.g] = clamp01(solver.population.data[base + OFFSET.g]);
        solver.population.data[base + OFFSET.b] = clamp01(solver.population.data[base + OFFSET.b]);
        solver.population.data[base + OFFSET.logSx] = clamp(solver.population.data[base + OFFSET.logSx], Math.log(0.004), Math.log(0.9));
        solver.population.data[base + OFFSET.logSy] = clamp(solver.population.data[base + OFFSET.logSy], Math.log(0.004), Math.log(0.9));
      }

      solver.iteration += 1;
      solver.sinceDensify += 1;
      solver.history.push({ iteration: solver.iteration, loss, splats: solver.population.count });
      if (solver.history.length > 1200) solver.history.shift();

      if (solver.sinceDensify >= solver.densifyInterval && solver.iteration <= solver.densifyUntil) {
        const result = densify(solver.population, solver.positionalGrad, solver.sinceDensify, {
          random: solver.random,
          maxSplats: solver.maxSplats
        });
        // Carry Adam state across the mutation. Discarding it wiped momentum for every surviving
        // splat on every densify interval -- a handicap the fixed-population baseline never
        // pays, and one that made adaptive densification look far worse than it is.
        const nextMoment = new Float64Array(result.population.data.length);
        const nextVelocity = new Float64Array(result.population.data.length);
        for (let slot = 0; slot < result.population.count; slot += 1) {
          const from = result.source[slot];
          if (from === undefined || from < 0) continue;
          const fromBase = from * FLOATS_PER_SPLAT;
          const toBase = slot * FLOATS_PER_SPLAT;
          for (let k = 0; k < FLOATS_PER_SPLAT; k += 1) {
            nextMoment[toBase + k] = solver.moment[fromBase + k];
            nextVelocity[toBase + k] = solver.velocity[fromBase + k];
          }
        }
        solver.population = result.population;
        solver.moment = nextMoment;
        solver.velocity = nextVelocity;
        solver.positionalGrad = new Float64Array(solver.population.count);
        solver.sinceDensify = 0;
        solver.lastDensify = result;
      }
    }
    return solver;
  }

  // --- targets -------------------------------------------------------------------------------

  // A shaded target: the point of the lane's failure exhibit is that per-splat colour absorbs
  // whatever lighting was present when it was fitted, so the target has to have lighting in it.
  function makeShadedTarget(width, height, options = {}) {
    const lightAngle = options.lightAngle ?? 0.9;
    const background = options.background || [0.06, 0.07, 0.09];
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);
    const out = new Float64Array(width * height * 3);
    const albedo = options.albedo || [0.82, 0.46, 0.30];
    for (let py = 0; py < height; py += 1) {
      const v = (py + 0.5) / height * 2 - 1;
      for (let px = 0; px < width; px += 1) {
        const u = (px + 0.5) / width * 2 - 1;
        const base = (py * width + px) * 3;
        // A sphere-ish disc with a smooth terminator plus a small specular lobe.
        const r2 = u * u + v * v;
        if (r2 > 0.62 * 0.62) {
          out[base] = background[0];
          out[base + 1] = background[1];
          out[base + 2] = background[2];
          continue;
        }
        const z = Math.sqrt(Math.max(0, 0.62 * 0.62 - r2)) / 0.62;
        const nx = u / 0.62;
        const ny = v / 0.62;
        const ndotl = Math.max(0, nx * lx + ny * ly + z * 0.55);
        const spec = Math.pow(ndotl, 22) * 0.55;
        for (let channel = 0; channel < 3; channel += 1) {
          out[base + channel] = clamp01(albedo[channel] * (0.12 + 0.88 * ndotl) + spec);
        }
      }
    }
    return out;
  }

  function targetFromRgba(rgba, width, height) {
    const out = new Float64Array(width * height * 3);
    for (let index = 0; index < width * height; index += 1) {
      out[index * 3] = rgba[index * 4] / 255;
      out[index * 3 + 1] = rgba[index * 4 + 1] / 255;
      out[index * 3 + 2] = rgba[index * 4 + 2] / 255;
    }
    return out;
  }

  function imageRmse(a, b) {
    let sum = 0;
    for (let index = 0; index < a.length; index += 1) sum += (a[index] - b[index]) ** 2;
    return Math.sqrt(sum / a.length);
  }

  function toRgba(image, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      out[index * 4] = Math.round(255 * Math.pow(clamp01(image[index * 3]), 1 / 2.2));
      out[index * 4 + 1] = Math.round(255 * Math.pow(clamp01(image[index * 3 + 1]), 1 / 2.2));
      out[index * 4 + 2] = Math.round(255 * Math.pow(clamp01(image[index * 3 + 2]), 1 / 2.2));
      out[index * 4 + 3] = 255;
    }
    return out;
  }

  return {
    FLOATS_PER_SPLAT,
    OFFSET,
    mulberry32,
    createPopulation,
    splatView,
    sortedOrder,
    evaluatePixel,
    renderImage,
    lossAndGradient,
    densify,
    createSolver,
    stepSolver,
    makeShadedTarget,
    targetFromRgba,
    imageRmse,
    toRgba
  };
});
