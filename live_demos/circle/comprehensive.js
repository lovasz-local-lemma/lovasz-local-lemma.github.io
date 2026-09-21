(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessComposite = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MODEL = Object.freeze({
    id: "circle-educational-v1",
    sampleCount: 240,
    smoothing: 3,
    minimumPoints: 24,
    minimumCoveragePct: 95,
    components: Object.freeze({
      rms: Object.freeze({ weight: 0.30, halfScoreAt: 6 }),
      zone: Object.freeze({ weight: 0.25, halfScoreAt: 15 }),
      compactness: Object.freeze({ weight: 0.15, halfScoreAt: 0.03 }),
      curvature: Object.freeze({ weight: 0.20, halfScoreAt: 0.75 }),
      harmonics: Object.freeze({ weight: 0.10, halfScoreAt: 6 }),
    }),
  });

  var DEFAULT_POLICY = "geometric";
  var CALIBRATION = Object.freeze({
    id: MODEL.id,
    origin: "human-designed",
    perceptuallyValidated: false,
    description: "The half-score thresholds, weights, and verbal labels are educational design choices, not a fit to empirical human judgments.",
    componentDependence: "The five measurements overlap; they are not independent evidence or probabilities.",
    scaleInterpretation: "Dimensionless qualities describe the shape at the declared smoothing scale. Uniform resizing does not by itself change its geometric score.",
  });
  var POLICIES = Object.freeze({
    geometric: Object.freeze({
      id: "geometric",
      label: "Weighted geometric",
      formula: "100 × exp(Σ wᵢ ln(qᵢ / 100))",
      description: "A multiplicative compromise: weak qualities reduce the total more than under the weighted arithmetic mean.",
      usesWeights: true,
      penaltyMeaning: "Weighted negative log quality; the largest term limits this product most.",
      numericalFloor: 1e-12,
      numericalNote: "The existing model floors normalized quality at 10⁻¹² inside the logarithm.",
    }),
    arithmetic: Object.freeze({
      id: "arithmetic",
      label: "Weighted arithmetic",
      formula: "Σ wᵢ qᵢ",
      description: "Allows compensation: strong qualities can offset a weak component according to the declared weights.",
      usesWeights: true,
      penaltyMeaning: "Weighted score-point loss from 100; the largest loss limits the sum most.",
    }),
    bottleneck: Object.freeze({
      id: "bottleneck",
      label: "Worst component",
      formula: "minᵢ qᵢ",
      description: "A strict bottleneck: only the lowest component quality sets the total. Component weights do not apply.",
      usesWeights: false,
      penaltyMeaning: "Score-point loss from 100; the weakest quality is the bottleneck.",
    }),
  });

  function resolvePolicy(policyOrOptions) {
    var id = typeof policyOrOptions === "string" ? policyOrOptions : policyOrOptions && policyOrOptions.policy;
    if (id == null) id = DEFAULT_POLICY;
    if (!Object.prototype.hasOwnProperty.call(POLICIES, id)) throw new RangeError("Unknown circle scoring policy: " + id);
    return POLICIES[id];
  }

  function finite(value) {
    return Number.isFinite(value);
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function squaredQuality(error, halfScoreAt) {
    if (!finite(error) || !finite(halfScoreAt) || halfScoreAt <= 0) return null;
    var ratio = Math.max(0, error) / halfScoreAt;
    return 100 / (1 + ratio * ratio);
  }

  function compactnessQuality(deficit, halfScoreAt) {
    if (!finite(deficit) || !finite(halfScoreAt) || halfScoreAt <= 0) return null;
    return 100 / (1 + Math.max(0, deficit) / halfScoreAt);
  }

  function dominantHarmonic(harmonics) {
    if (!Array.isArray(harmonics)) return null;
    var best = null;
    for (var i = 0; i < harmonics.length; i += 1) {
      var item = harmonics[i];
      if (!item || item.mode < 2 || item.mode > 12 || !finite(item.amplitudePct)) continue;
      if (!best || item.amplitudePct > best.amplitudePct) best = item;
    }
    return best;
  }

  function scoreLabel(score) {
    if (!finite(score)) return "Not scorable";
    if (score >= 95) return "Exceptional";
    if (score >= 85) return "Very round";
    if (score >= 70) return "Round with visible imperfections";
    if (score >= 50) return "Visibly noncircular";
    return "Strongly noncircular";
  }

  function invalidReasonText(key) {
    var messages = {
      fit: "A stable reference circle could not be fitted.",
      points: "Use at least 24 distinct points so local measurements are meaningful.",
      open: "Finish a closed loop; the score will not invent the missing boundary.",
      crossing: "Self-intersecting traces do not define one simple circular boundary.",
      coverage: "Trace the full loop; at least 95% angular coverage is required.",
      compactness: "A valid enclosed area and perimeter are required.",
      curvature: "The curvature profile is incomplete.",
      harmonics: "A complete radial harmonic profile is required.",
      metrics: "One or more component measurements are unavailable.",
    };
    return messages[key] || key;
  }

  function scoreResult(result, policyOrOptions) {
    var policy = resolvePolicy(policyOrOptions);
    var validity = result && result.validity ? result.validity : {};
    var metrics = result && result.metrics ? result.metrics : {};
    var cleaned = result && result.points && Array.isArray(result.points.cleaned) ? result.points.cleaned : [];
    var measuredCoverage = finite(metrics.measuredCoveragePct) ? metrics.measuredCoveragePct : metrics.coveragePct;
    var dominant = dominantHarmonic(result && result.harmonics);
    var invalidKeys = [];

    if (!result || !result.fit || !result.fit.valid) invalidKeys.push("fit");
    var acquiredCount = result && result.acquisition && finite(result.acquisition.cleanedPointCount) ? result.acquisition.cleanedPointCount : cleaned.length;
    if (acquiredCount < MODEL.minimumPoints) invalidKeys.push("points");
    if (!validity.isClosed) invalidKeys.push("open");
    if (validity.selfIntersecting) invalidKeys.push("crossing");
    if (!finite(measuredCoverage) || measuredCoverage < MODEL.minimumCoveragePct) invalidKeys.push("coverage");
    if (!validity.compactnessValid || !finite(metrics.compactness)) invalidKeys.push("compactness");
    if (!validity.curvatureValid || !finite(metrics.curvatureRms)) invalidKeys.push("curvature");
    if (!dominant) invalidKeys.push("harmonics");

    var compactnessDeficit = finite(metrics.compactness) ? Math.max(0, 1 - metrics.compactness) : null;
    var components = {
      rms: {
        raw: metrics.rmsPct,
        quality: squaredQuality(metrics.rmsPct, MODEL.components.rms.halfScoreAt),
        weight: MODEL.components.rms.weight,
        halfScoreAt: MODEL.components.rms.halfScoreAt,
      },
      zone: {
        raw: metrics.zonePct,
        quality: squaredQuality(metrics.zonePct, MODEL.components.zone.halfScoreAt),
        weight: MODEL.components.zone.weight,
        halfScoreAt: MODEL.components.zone.halfScoreAt,
      },
      compactness: {
        raw: metrics.compactness,
        error: compactnessDeficit,
        quality: compactnessQuality(compactnessDeficit, MODEL.components.compactness.halfScoreAt),
        weight: MODEL.components.compactness.weight,
        halfScoreAt: MODEL.components.compactness.halfScoreAt,
      },
      curvature: {
        raw: metrics.curvatureRms,
        quality: squaredQuality(metrics.curvatureRms, MODEL.components.curvature.halfScoreAt),
        weight: MODEL.components.curvature.weight,
        halfScoreAt: MODEL.components.curvature.halfScoreAt,
      },
      harmonics: {
        raw: dominant ? dominant.amplitudePct : null,
        mode: dominant ? dominant.mode : null,
        quality: squaredQuality(dominant ? dominant.amplitudePct : null, MODEL.components.harmonics.halfScoreAt),
        weight: MODEL.components.harmonics.weight,
        halfScoreAt: MODEL.components.harmonics.halfScoreAt,
      },
    };

    var names = Object.keys(components);
    for (var i = 0; i < names.length; i += 1) {
      if (!finite(components[names[i]].quality)) {
        if (invalidKeys.indexOf("metrics") === -1) invalidKeys.push("metrics");
      }
    }

    if (invalidKeys.length) {
      return {
        valid: false,
        score: null,
        label: "Not scorable",
        calibrationId: MODEL.id,
        calibration: CALIBRATION,
        policyId: policy.id,
        policy: policy,
        components: components,
        limitingComponent: null,
        invalidReasons: invalidKeys.map(invalidReasonText),
        measuredCoveragePct: measuredCoverage,
        scoringOptions: { sampleCount: MODEL.sampleCount, smoothing: MODEL.smoothing },
      };
    }

    var logScore = 0;
    var arithmeticScore = 0;
    var minimumScore = 100;
    var limiting = null;
    for (i = 0; i < names.length; i += 1) {
      var component = components[names[i]];
      component.penalty = policy.id === "arithmetic" ? component.weight * (100 - component.quality) :
        policy.id === "bottleneck" ? 100 - component.quality :
          -component.weight * Math.log(Math.max(1e-12, component.quality / 100));
      logScore += component.weight * Math.log(Math.max(1e-12, component.quality / 100));
      arithmeticScore += component.weight * component.quality;
      minimumScore = Math.min(minimumScore, component.quality);
      if (!limiting || component.penalty > limiting.penalty) {
        limiting = { key: names[i], penalty: component.penalty };
      }
    }
    var score = clamp(policy.id === "arithmetic" ? arithmeticScore :
      policy.id === "bottleneck" ? minimumScore : 100 * Math.exp(logScore), 0, 100);
    return {
      valid: true,
      score: score,
      label: scoreLabel(score),
      calibrationId: MODEL.id,
      calibration: CALIBRATION,
      policyId: policy.id,
      policy: policy,
      components: components,
      limitingComponent: limiting ? limiting.key : null,
      invalidReasons: [],
      measuredCoveragePct: measuredCoverage,
      scoringOptions: { sampleCount: MODEL.sampleCount, smoothing: MODEL.smoothing },
    };
  }

  // Size and sampling are acquisition evidence, not an extra geometric penalty.
  // Input coordinates need an externally known unit before a radius threshold has meaning.
  function assessEvidence(result, options) {
    options = options || {};
    var minimumRadius = options.minimumRadius == null ? 20 : Number(options.minimumRadius);
    if (!finite(minimumRadius) || minimumRadius < 0) throw new RangeError("minimumRadius must be a finite nonnegative number.");
    var radius = result && result.fit && result.fit.valid && finite(result.fit.r) ? result.fit.r : null;
    var cleanedCount = result && result.points && Array.isArray(result.points.cleaned) ? result.points.cleaned.length : 0;
    if (result && result.acquisition && finite(result.acquisition.cleanedPointCount)) cleanedCount = result.acquisition.cleanedPointCount;
    var scalePass = radius == null ? null : radius >= minimumRadius;
    var enoughSamples = cleanedCount >= MODEL.minimumPoints;
    var reasons = [];
    if (radius == null) reasons.push("No fitted radius is available.");
    else if (!scalePass) reasons.push("The drawing is below the selected radius guideline; input resolution may limit what its fine detail can establish.");
    if (!enoughSamples) reasons.push("Too few cleaned samples for the declared score.");
    return {
      affectsScore: false,
      radius: radius,
      minimumRadius: minimumRadius,
      coordinateUnit: typeof options.coordinateUnit === "string" ? options.coordinateUnit : "input units",
      passesScaleGuideline: scalePass,
      cleanedSampleCount: cleanedCount,
      minimumPoints: MODEL.minimumPoints,
      passesSampleRequirement: enoughSamples,
      reasons: reasons,
      interpretation: "A separate acquisition guideline, not an anti-cheat test. A small accurate circle can have the same score as a large one; point count does not establish independent samples, input precision, or human authorship.",
    };
  }

  function confidence(result, scoreAtLowScale, scoreAtHighScale) {
    var cleanedCount = result && result.points && result.points.cleaned ? result.points.cleaned.length : 0;
    if (result && result.acquisition && finite(result.acquisition.cleanedPointCount)) cleanedCount = result.acquisition.cleanedPointCount;
    var radius = result && result.fit ? result.fit.r : 0;
    var gap = result && result.metrics ? result.metrics.closureGapPct : null;
    if (result && result.acquisition) gap = result.acquisition.endpointGapPct;
    var sampleFactor = clamp((cleanedCount - 24) / 72, 0, 1);
    var radiusFactor = clamp((radius - 20) / 60, 0, 1);
    var gapFactor = finite(gap) ? clamp((25 - gap) / 20, 0, 1) : 0;
    var scaleRange = finite(scoreAtLowScale) && finite(scoreAtHighScale) ?
      Math.abs(scoreAtLowScale - scoreAtHighScale) : 15;
    var scaleFactor = clamp(1 - scaleRange / 15, 0, 1);
    var value = 100 * (0.20 * sampleFactor + 0.15 * radiusFactor + 0.25 * gapFactor + 0.40 * scaleFactor);
    var reasons = [];
    if (sampleFactor < 0.75) reasons.push("sparse gesture");
    if (radiusFactor < 0.75) reasons.push("small drawing");
    if (gapFactor < 0.75) reasons.push("wide endpoint gap");
    if (scaleFactor < 0.75) reasons.push("sensitive to smoothing scale");
    return {
      value: clamp(value, 0, 100),
      band: value >= 80 ? "high" : value >= 60 ? "moderate" : "low",
      reasons: reasons,
      scaleRange: scaleRange,
      method: "human-designed heuristic",
      isProbability: false,
      description: "A heuristic summary of sample count, drawing radius, closure gap, and smoothing sensitivity; not a statistical confidence interval or perceptual validation.",
    };
  }

  function analyze(rawPoints, engine, policyOrOptions) {
    if (!engine || typeof engine.analyze !== "function") {
      throw new Error("A roundness analysis engine is required.");
    }
    var policy = resolvePolicy(policyOrOptions);
    var analysis = engine.analyze(rawPoints, {
      sampleCount: MODEL.sampleCount,
      smoothing: MODEL.smoothing,
      maxHarmonic: 12,
    });
    var composite = scoreResult(analysis, policy.id);
    var lowScore = null;
    var highScore = null;
    if (composite.valid) {
      lowScore = scoreResult(engine.analyze(rawPoints, {
        sampleCount: MODEL.sampleCount,
        smoothing: MODEL.smoothing - 1,
        maxHarmonic: 12,
      }), policy.id).score;
      highScore = scoreResult(engine.analyze(rawPoints, {
        sampleCount: MODEL.sampleCount,
        smoothing: MODEL.smoothing + 1,
        maxHarmonic: 12,
      }), policy.id).score;
    }
    composite.analysis = analysis;
    composite.evidence = assessEvidence(analysis);
    composite.robustness = confidence(analysis, lowScore, highScore);
    var scaleScores = [lowScore, composite.score, highScore].filter(finite);
    composite.robustness.scaleScores = {
      fine: lowScore,
      standard: composite.score,
      coarse: highScore,
      smoothingSamples: [MODEL.smoothing - 1, MODEL.smoothing, MODEL.smoothing + 1],
      range: scaleScores.length ? Math.max.apply(null, scaleScores) - Math.min.apply(null, scaleScores) : null,
    };
    return composite;
  }

  return {
    analyze: analyze,
    scoreResult: scoreResult,
    assessEvidence: assessEvidence,
    quality: squaredQuality,
    scoreLabel: scoreLabel,
    MODEL: MODEL,
    DEFAULT_POLICY: DEFAULT_POLICY,
    POLICIES: POLICIES,
    CALIBRATION: CALIBRATION,
  };
});
