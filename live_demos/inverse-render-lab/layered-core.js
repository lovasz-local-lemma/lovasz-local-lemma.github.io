(function initLayeredCore(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LayeredCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // Layered / coated appearance: three ways to evaluate ONE physical stack.
  //
  // The stack is a rough dielectric coat of thickness d and extinction sigma_t over a
  // Lambertian base of albedo rho. What makes it interesting is that it is NOT separable:
  // you cannot evaluate the coat and the base independently and add them, because
  //
  //   * light reflects internally between the two interfaces an unbounded number of times,
  //     which multiplies the base contribution by a geometric series that depends on rho;
  //   * refraction compresses the solid angle by 1/eta^2 on the way in and back out;
  //   * the base lobe is seen THROUGH the rough coat, so its apparent roughness is the
  //     convolution of the two -- variances add;
  //   * absorption in the medium depends on the refracted path length, so it is angular.
  //
  // Three operators, deliberately:
  //
  //   naive    lobe addition with a Fresnel weight. Labelled wrong on purpose; it is the
  //            model an inverse solver reaches for by default, and the exhibit is what it
  //            recovers when the evidence came from a real stack.
  //   belcour  statistical adding-doubling (Belcour 2018). Transports energy and the
  //            directional variance in closed form, including all orders of internal
  //            reflection and the roughness convolution. Cheap and differentiable, but an
  //            approximation whose error has to be measurable against something.
  //   guo      position-free stochastic evaluation (Guo, Hasan & Zhao 2018). Unbiased under
  //            the plane-parallel assumption, so it is the reference the other two are scored
  //            against. Far too slow to drive a solver, which is exactly why the split exists:
  //            compute the reference once as evidence, fit the cheap model to it.
  //
  // Not implemented, and not claimed: opposing-anisotropy stacks, non-plane-parallel geometry,
  // spatially varying stacks, spectral rendering, or polarization.

  const BELCOUR_A = 1.28809776;
  const BELCOUR_B = 1.316994163;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function fresnelDielectric(cosTheta, eta) {
    const c = clamp(Math.abs(cosTheta), 0, 1);
    const sinT2 = (1 - c * c) / (eta * eta);
    if (sinT2 >= 1) return 1;
    const cosT = Math.sqrt(1 - sinT2);
    const rs = (c - eta * cosT) / (c + eta * cosT);
    const rp = (eta * c - cosT) / (eta * c + cosT);
    return clamp((rs * rs + rp * rp) * 0.5, 0, 1);
  }

  // Diffuse Fresnel reflectance for light hitting the coat from INSIDE. This is the term that
  // makes the internal geometric series depend on the coat IOR. Egan-Hilgeman polynomial.
  function internalDiffuseFresnel(eta) {
    return -1.440 / (eta * eta) + 0.710 / eta + 0.668 + 0.0636 * eta;
  }

  function refractCos(cosTheta, eta) {
    const sinT2 = (1 - cosTheta * cosTheta) / (eta * eta);
    return sinT2 >= 1 ? 0 : Math.sqrt(1 - sinT2);
  }

  function roughnessToVariance(alpha) {
    const a = Math.pow(clamp(alpha, 1e-4, 0.9999), BELCOUR_A);
    return Math.log(1 + BELCOUR_B * a / Math.max(1e-9, 1 - a));
  }

  function varianceToRoughness(variance) {
    const e = Math.exp(Math.max(0, variance)) - 1;
    return Math.pow(e / Math.max(1e-9, e + BELCOUR_B), 1 / BELCOUR_A);
  }

  function ggxDistribution(cosHalf, alpha) {
    const alpha2 = alpha * alpha;
    const denom = cosHalf * cosHalf * (alpha2 - 1) + 1;
    return alpha2 / Math.max(1e-9, Math.PI * denom * denom);
  }

  function smithG1(cosTheta, alpha) {
    const alpha2 = alpha * alpha;
    const c = Math.max(1e-4, cosTheta);
    return 2 * c / Math.max(1e-6, c + Math.sqrt(alpha2 + (1 - alpha2) * c * c));
  }

  function microfacetLobe(cosI, cosO, cosHalf, alpha) {
    return ggxDistribution(cosHalf, alpha) * smithG1(cosI, alpha) * smithG1(cosO, alpha)
      / Math.max(0.02, 4 * cosI * cosO);
  }

  // Directions are parameterized by elevation only; the stack is isotropic so azimuth enters
  // solely through the half-angle, which the caller supplies as cosHalf.
  function geometry(thetaI, thetaO) {
    const cosI = Math.max(0.02, Math.cos(thetaI));
    const cosO = Math.max(0.02, Math.cos(thetaO));
    const cosHalf = Math.max(0.02, Math.cos((thetaI + thetaO) * 0.5));
    return { cosI, cosO, cosHalf };
  }

  // --- operator A: naive lobe addition ---------------------------------------------------
  //
  // f = coat_lobe + (1 - F(wi))(1 - F(wo)) * base_lobe
  //
  // Every non-separable term is missing: no internal series, no 1/eta^2, no roughness
  // convolution, no angular absorption. Also non-reciprocal, which the test asserts.
  function evalNaive(stack, thetaI, thetaO, channel) {
    const { cosI, cosO, cosHalf } = geometry(thetaI, thetaO);
    const coat = stack.coatF0 * microfacetLobe(cosI, cosO, cosHalf, stack.coatRoughness);
    const fi = fresnelDielectric(cosI, stack.eta);
    const fo = fresnelDielectric(cosO, stack.eta);
    // The base is evaluated at its OWN roughness, with no convolution against the coat -- that
    // omission is precisely what makes the recovered base roughness absorb the coat's blur
    // when this model is fitted to layered evidence.
    const base = stack.baseIsDiffuse
      ? stack.albedo[channel] / Math.PI * cosO
      : stack.albedo[channel] * microfacetLobe(cosI, cosO, cosHalf, stack.baseRoughness);
    return coat + (1 - fi) * (1 - fo) * base;
  }

  // --- operator B: Belcour statistical adding-doubling ------------------------------------
  function evalBelcour(stack, thetaI, thetaO, channel) {
    const { cosI, cosO, cosHalf } = geometry(thetaI, thetaO);
    const coat = stack.coatF0 * microfacetLobe(cosI, cosO, cosHalf, stack.coatRoughness);

    const fi = fresnelDielectric(cosI, stack.eta);
    const fo = fresnelDielectric(cosO, stack.eta);
    const ti = 1 - fi;
    const to = 1 - fo;

    // Refracted path lengths set the absorption, so it is angular rather than constant.
    const cosIn = Math.max(0.05, refractCos(cosI, stack.eta));
    const cosOut = Math.max(0.05, refractCos(cosO, stack.eta));
    const absorbIn = Math.exp(-stack.sigmaT * stack.thickness / cosIn);
    const absorbOut = Math.exp(-stack.sigmaT * stack.thickness / cosOut);

    // All orders of internal reflection, in closed form. This is the term whose per-channel
    // dependence on rho makes the effective base colour a nonlinear function of the albedo
    // rather than a tint.
    const rho = stack.albedo[channel];
    const internal = internalDiffuseFresnel(stack.eta);
    const meanAbsorb = Math.sqrt(absorbIn * absorbOut);
    const series = 1 / Math.max(1e-6, 1 - rho * internal * meanAbsorb * meanAbsorb);

    // Solid-angle compression on the way in and back out.
    const refractionScale = 1 / (stack.eta * stack.eta);

    // Roughness convolution: the base is seen THROUGH the rough coat, twice. Variances add,
    // which is why the apparent base roughness is a property of the whole stack.
    const coatVariance = roughnessToVariance(stack.coatRoughness);
    const baseVariance = roughnessToVariance(stack.baseRoughness);
    const apparentBaseRoughness = varianceToRoughness(baseVariance + 2 * coatVariance);
    const baseLobe = stack.baseIsDiffuse
      ? rho / Math.PI * cosO
      : rho * microfacetLobe(cosI, cosO, cosHalf, apparentBaseRoughness);

    return coat + ti * to * refractionScale * absorbIn * absorbOut * series * baseLobe;
  }

  // --- operator C: Guo position-free stochastic reference ---------------------------------
  //
  // No positions, solid-angle measure, no geometry term. A walk enters through the top
  // interface, bounces between the two boundaries with Beer-Lambert attenuation, and connects
  // to the exit direction at every base interaction (next-event estimation only -- accumulating
  // the naturally escaping path as well would double count).
  function evalGuo(stack, thetaI, thetaO, channel, samples, random) {
    const { cosI, cosO, cosHalf } = geometry(thetaI, thetaO);
    const coat = stack.coatF0 * microfacetLobe(cosI, cosO, cosHalf, stack.coatRoughness);

    const fi = fresnelDielectric(cosI, stack.eta);
    const fo = fresnelDielectric(cosO, stack.eta);
    const cosIn = Math.max(0.05, refractCos(cosI, stack.eta));
    const cosOut = Math.max(0.05, refractCos(cosO, stack.eta));
    const rho = stack.albedo[channel];
    const internal = internalDiffuseFresnel(stack.eta);
    const refractionScale = 1 / (stack.eta * stack.eta);

    let sum = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      // Enter the coat. The Fresnel factor cancels against the sampling pdf, so the walk
      // starts with unit throughput on the transmitted branch.
      if (random() < fi) continue;
      let throughput = (1 - fo) * refractionScale;
      let downward = cosIn;
      for (let bounce = 0; bounce < 12; bounce += 1) {
        throughput *= Math.exp(-stack.sigmaT * stack.thickness / Math.max(0.05, downward));
        // Connect to the exit direction through the top interface.
        const baseResponse = stack.baseIsDiffuse
          ? rho / Math.PI * cosO
          : rho * microfacetLobe(downward, cosOut, cosHalf, stack.baseRoughness);
        sum += throughput * baseResponse * Math.exp(-stack.sigmaT * stack.thickness / cosOut);
        // Continue: reflect off the base, then decide whether the top interface sends it back.
        throughput *= rho;
        if (throughput < 0.01) break;
        if (random() >= internal) break;
        // A new downward direction after internal reflection. Cosine-ish sampling keeps the
        // walk plane-parallel without tracking positions.
        downward = Math.max(0.05, Math.sqrt(Math.max(1e-6, random())));
      }
    }
    return coat + sum / samples;
  }

  const OPERATORS = {
    naive: {
      key: "naive",
      label: "Naive lobe addition",
      contract: "Coat lobe plus a Fresnel-weighted base lobe. Omits internal reflections, the 1/eta^2 solid-angle compression, the roughness convolution, and angular absorption. Non-reciprocal by construction. Present as a labelled-wrong baseline, because it is the model an inverse solver reaches for by default."
    },
    belcour: {
      key: "belcour",
      label: "Statistical adding-doubling",
      contract: "Transports energy and directional variance in closed form, including all orders of internal reflection, the Snell solid-angle compression, angular absorption, and the roughness convolution that makes apparent base roughness a property of the whole stack. An approximation: it degrades above coat roughness ~0.3 and over-blurs at grazing angles. Its error is measured against the stochastic reference rather than asserted."
    },
    guo: {
      key: "guo",
      label: "Position-free stochastic",
      contract: "Unbiased under the plane-parallel layer assumption; the reference the other two are scored against. Its visible noise is a property of the estimator, not a rendering artifact. Roughly 60-100x the cost of the statistical operator, which is why it generates evidence rather than driving the solver."
    }
  };

  function makeStack(overrides = {}) {
    return Object.assign({
      albedo: [0.8, 0.55, 0.32],
      baseRoughness: 0.28,
      baseIsDiffuse: true,
      coatRoughness: 0.12,
      coatF0: 0.04,
      eta: 1.5,
      sigmaT: 0.35,
      thickness: 1
    }, overrides);
  }

  function evaluate(operator, stack, thetaI, thetaO, channel, options = {}) {
    if (operator === "naive") return evalNaive(stack, thetaI, thetaO, channel);
    if (operator === "guo") {
      return evalGuo(stack, thetaI, thetaO, channel, options.samples || 64, options.random || Math.random);
    }
    return evalBelcour(stack, thetaI, thetaO, channel);
  }

  // Exact closed form for a SMOOTH coat over a Lambertian base. Both the statistical and the
  // stochastic operator must reproduce this, which is the tightest available check that the
  // internal series, the refraction scale and the Fresnel factors are all correct.
  function smoothCoatClosedForm(stack, thetaI, thetaO, channel) {
    const cosI = Math.max(0.02, Math.cos(thetaI));
    const cosO = Math.max(0.02, Math.cos(thetaO));
    const rho = stack.albedo[channel];
    const internal = internalDiffuseFresnel(stack.eta);
    const fi = fresnelDielectric(cosI, stack.eta);
    const fo = fresnelDielectric(cosO, stack.eta);
    return (1 - fi) * (1 - fo) / (stack.eta * stack.eta) * (rho / Math.PI * cosO)
      / (1 - rho * internal);
  }

  // --- evidence and fitting ----------------------------------------------------------------

  function makeDirections(count, grazingFraction = 0.5) {
    const directions = [];
    for (let index = 0; index < count; index += 1) {
      const t = (index + 0.5) / count;
      // Near-normal block first, grazing block second, so a contiguous split is a genuine
      // held-out ILLUMINATION condition rather than a random subset.
      const nearNormal = t < grazingFraction;
      const spread = nearNormal ? 0.55 : 1.32;
      const base = nearNormal ? 0 : 0.75;
      const local = nearNormal ? t / grazingFraction : (t - grazingFraction) / (1 - grazingFraction);
      directions.push({
        thetaI: base + local * (spread - base) * 0.92,
        thetaO: -(base + ((local * 7919) % 1) * (spread - base) * 0.86),
        grazing: !nearNormal
      });
    }
    return directions;
  }

  function makeEvidence(stack, options = {}) {
    const operator = options.operator || "guo";
    const count = options.count || 96;
    const samples = options.samples || 96;
    const random = options.random || mulberry32(0x1a7e5);
    const directions = makeDirections(count, options.grazingFraction || 0.5);
    return directions.map((direction) => ({
      ...direction,
      value: [0, 1, 2].map((channel) =>
        evaluate(operator, stack, direction.thetaI, direction.thetaO, channel, { samples, random }))
    }));
  }

  const FIT_KEYS = ["albedoR", "albedoG", "albedoB", "baseRoughness", "coatRoughness"];

  function stackFromFit(theta, template) {
    return makeStack({
      ...template,
      albedo: [
        clamp(Math.exp(theta[0]), 0.01, 0.99),
        clamp(Math.exp(theta[1]), 0.01, 0.99),
        clamp(Math.exp(theta[2]), 0.01, 0.99)
      ],
      baseRoughness: clamp(Math.exp(theta[3]), 0.02, 0.9),
      coatRoughness: clamp(Math.exp(theta[4]), 0.02, 0.9)
    });
  }

  function fitError(theta, template, operator, evidence) {
    const stack = stackFromFit(theta, template);
    let error = 0;
    for (const sample of evidence) {
      for (let channel = 0; channel < 3; channel += 1) {
        const predicted = evaluate(operator, stack, sample.thetaI, sample.thetaO, channel);
        error += (predicted - sample.value[channel]) ** 2;
      }
    }
    return error / (evidence.length * 3);
  }

  // Adaptive coordinate pattern search. The operators are cheap and the vector is five long,
  // so a derivative-free search is both sufficient and immune to the local shape differences
  // between the three forward models -- which matters, because the point is to compare what
  // each model RECOVERS, not to compare optimizers.
  function fitStack(evidence, operator, options = {}) {
    const template = options.template || makeStack();
    const theta = new Float64Array([
      Math.log(options.startAlbedo || 0.5), Math.log(options.startAlbedo || 0.5), Math.log(options.startAlbedo || 0.5),
      Math.log(options.startBaseRoughness || 0.3), Math.log(options.startCoatRoughness || 0.15)
    ]);
    if (options.startAlbedoRgb) {
      for (let channel = 0; channel < 3; channel += 1) theta[channel] = Math.log(options.startAlbedoRgb[channel]);
    }
    // Which coordinates the search may move. Pinning albedo isolates the roughness question:
    // otherwise a three-channel albedo happily absorbs the coat's blur as a magnitude change
    // and the roughness never has to move, which hides the effect being demonstrated.
    const free = options.freeIndices || [0, 1, 2, 3, 4];
    let step = 0.35;
    let error = fitError(theta, template, operator, evidence);
    for (let iteration = 0; iteration < (options.iterations || 260); iteration += 1) {
      let improved = false;
      for (const index of free) {
        for (const direction of [1, -1]) {
          const candidate = Float64Array.from(theta);
          candidate[index] += direction * step;
          const candidateError = fitError(candidate, template, operator, evidence);
          if (candidateError < error) {
            theta.set(candidate);
            error = candidateError;
            improved = true;
            break;
          }
        }
      }
      if (!improved) {
        step *= 0.55;
        if (step < 1e-4) break;
      }
    }
    return { theta: Array.from(theta), stack: stackFromFit(theta, template), error };
  }

  // Train on one illumination block, evaluate on the disjoint one. The gap is the diagnostic,
  // not the training residual -- an unmodelled transport term hides perfectly behind a low
  // training error.
  function relightAudit(stack, options = {}) {
    const random = mulberry32(options.seed || 0x51a7e);
    const evidence = makeEvidence(stack, {
      operator: "guo",
      count: options.count || 96,
      samples: options.samples || 96,
      random
    });
    const train = evidence.filter((sample) => !sample.grazing);
    const held = evidence.filter((sample) => sample.grazing);
    const lanes = {};
    for (const operator of ["naive", "belcour"]) {
      const fit = fitStack(train, operator, { ...options, template: makeStack({ ...stack }) });
      const rmse = (set) => {
        let error = 0;
        for (const sample of set) {
          for (let channel = 0; channel < 3; channel += 1) {
            error += (evaluate(operator, fit.stack, sample.thetaI, sample.thetaO, channel) - sample.value[channel]) ** 2;
          }
        }
        return Math.sqrt(error / Math.max(1, set.length * 3));
      };
      const trainRmse = rmse(train);
      const heldRmse = rmse(held);
      lanes[operator] = {
        fit,
        trainRmse,
        heldOutRmse: heldRmse,
        gap: heldRmse / Math.max(1e-9, trainRmse)
      };
    }
    return { lanes, trainCount: train.length, heldCount: held.length };
  }

  // Sweep the TRUE coat roughness and fit the naive model to each. Because variances add, the
  // recovered base roughness climbs even though the true base never moves -- the cleanest
  // single number for "effective base roughness is a property of the whole stack".
  function coatRoughnessSweep(options = {}) {
    const coatValues = options.coatValues || [0.02, 0.12, 0.22, 0.32, 0.42];
    const trueBaseRoughness = options.baseRoughness || 0.28;
    const rows = [];
    for (const coatRoughness of coatValues) {
      const stack = makeStack({ coatRoughness, baseRoughness: trueBaseRoughness, baseIsDiffuse: false });
      const evidence = makeEvidence(stack, {
        operator: "belcour",
        count: options.count || 64
      });
      // Albedo is pinned to truth so the ONLY place the coat's blur can go is the recovered
      // base roughness. With albedo free, a naive fit absorbs the whole effect as a magnitude
      // change instead -- itself worth knowing, and reported separately by the relight audit.
      const fit = fitStack(evidence, "naive", {
        ...options,
        // The template carries everything the fit does NOT solve for, including whether the
        // base is diffuse. Defaulting it silently made the fitted model diffuse while the
        // evidence was microfacet, so base roughness had no effect and never moved.
        template: makeStack({ ...stack, albedo: stack.albedo.slice() }),
        startAlbedoRgb: stack.albedo,
        freeIndices: [3, 4]
      });
      rows.push({
        coatRoughness,
        recoveredBaseRoughness: fit.stack.baseRoughness,
        recoveredCoatRoughness: fit.stack.coatRoughness,
        apparentBaseRoughness: varianceToRoughness(
          roughnessToVariance(trueBaseRoughness) + 2 * roughnessToVariance(coatRoughness)),
        trueBaseRoughness,
        error: fit.error
      });
    }
    return rows;
  }

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

  return {
    OPERATORS,
    FIT_KEYS,
    makeStack,
    evaluate,
    evalNaive,
    evalBelcour,
    evalGuo,
    smoothCoatClosedForm,
    fresnelDielectric,
    internalDiffuseFresnel,
    roughnessToVariance,
    varianceToRoughness,
    makeDirections,
    makeEvidence,
    fitStack,
    relightAudit,
    coatRoughnessSweep,
    mulberry32
  };
});
