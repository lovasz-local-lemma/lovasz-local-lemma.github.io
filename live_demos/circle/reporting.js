(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessReporting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SCHEMA_VERSION = "roundness-lab-report-v2";
  var COMPONENT_LABELS = Object.freeze({
    rms: "Average fit",
    zone: "Minimum zone",
    compactness: "Compactness",
    curvature: "Curvature",
    harmonics: "Harmonics",
  });

  function finite(value) {
    return Number.isFinite(value);
  }

  function numberOrNull(value) {
    return finite(value) ? value : null;
  }

  function pointOrNull(value) {
    if (!value || !finite(value.x) || !finite(value.y)) return null;
    return { x: value.x, y: value.y };
  }

  function copyPoints(points) {
    if (!Array.isArray(points)) return [];
    return points.map(pointOrNull).filter(Boolean);
  }

  function copyNumbers(values) {
    if (!Array.isArray(values)) return [];
    return values.map(numberOrNull);
  }

  function metricSnapshot(metrics) {
    metrics = metrics || {};
    return {
      rmsPct: numberOrNull(metrics.rmsPct),
      p95Pct: numberOrNull(metrics.p95Pct),
      peakToValleyPct: numberOrNull(metrics.peakToValleyPct),
      zonePct: numberOrNull(metrics.zonePct),
      compactness: numberOrNull(metrics.compactness),
      curvatureRms: numberOrNull(metrics.curvatureRms),
      closureGapPct: numberOrNull(metrics.closureGapPct),
      coveragePct: numberOrNull(metrics.coveragePct),
      measuredCoveragePct: numberOrNull(metrics.measuredCoveragePct),
    };
  }

  function fitSnapshot(fit) {
    fit = fit || {};
    return {
      valid: Boolean(fit.valid),
      cx: numberOrNull(fit.cx),
      cy: numberOrNull(fit.cy),
      r: numberOrNull(fit.r),
      rms: numberOrNull(fit.rms),
      iterations: numberOrNull(fit.iterations),
    };
  }

  function zoneSnapshot(zone) {
    zone = zone || {};
    return {
      valid: Boolean(zone.valid),
      cx: numberOrNull(zone.cx),
      cy: numberOrNull(zone.cy),
      inner: numberOrNull(zone.inner),
      outer: numberOrNull(zone.outer),
      width: numberOrNull(zone.width),
    };
  }

  function componentSnapshot(components) {
    var output = {};
    var source = components || {};
    Object.keys(COMPONENT_LABELS).forEach(function (key) {
      var item = source[key] || {};
      output[key] = {
        label: COMPONENT_LABELS[key],
        raw: numberOrNull(item.raw),
        error: numberOrNull(item.error),
        mode: numberOrNull(item.mode),
        quality: numberOrNull(item.quality),
        weight: numberOrNull(item.weight),
        halfScoreAt: numberOrNull(item.halfScoreAt),
      };
    });
    return output;
  }

  function harmonicSnapshot(harmonics) {
    if (!Array.isArray(harmonics)) return [];
    return harmonics.map(function (item) {
      return {
        mode: numberOrNull(item && item.mode),
        amplitudePct: numberOrNull(item && item.amplitudePct),
        cosinePct: numberOrNull(item && item.cosinePct),
        sinePct: numberOrNull(item && item.sinePct),
      };
    });
  }

  function buildReport(input, generatedAt) {
    input = input || {};
    var composite = input.composite || {};
    var standard = composite.analysis || {};
    var diagnostic = input.result || {};
    var robustness = composite.robustness || {};
    var standardPoints = standard.points || {};
    var profiles = standard.profiles || {};
    var geometry = standard.geometry || {};

    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: generatedAt || new Date().toISOString(),
      specimen: {
        key: input.specimenKey || "custom",
        name: input.specimenName || "Your drawing",
      },
      score: {
        eligible: Boolean(composite.valid),
        value: numberOrNull(composite.score),
        label: composite.label || "Not scorable",
        calibrationId: composite.calibrationId || null,
        policyId: composite.policyId || "geometric",
        policy: composite.policy ? JSON.parse(JSON.stringify(composite.policy)) : null,
        calibration: composite.calibration ? JSON.parse(JSON.stringify(composite.calibration)) : null,
        scoringOptions: composite.scoringOptions || null,
        limitingComponent: composite.limitingComponent || null,
        invalidReasons: Array.isArray(composite.invalidReasons) ? composite.invalidReasons.slice() : [],
        components: componentSnapshot(composite.components),
      },
      measurementConfidence: {
        interpretation: "Heuristic measurement-evidence index; not a statistical confidence probability.",
        value: numberOrNull(robustness.value),
        band: robustness.band || null,
        reasons: Array.isArray(robustness.reasons) ? robustness.reasons.slice() : [],
        nearbyScaleRange: numberOrNull(robustness.scaleScores && robustness.scaleScores.range) ?? numberOrNull(robustness.scaleRange),
        nearbyScaleScores: {
          fine: numberOrNull(robustness.scaleScores && robustness.scaleScores.fine),
          standard: numberOrNull(robustness.scaleScores && robustness.scaleScores.standard),
          coarse: numberOrNull(robustness.scaleScores && robustness.scaleScores.coarse),
          range: numberOrNull(robustness.scaleScores && robustness.scaleScores.range),
          smoothingSamples: robustness.scaleScores && Array.isArray(robustness.scaleScores.smoothingSamples) ?
            robustness.scaleScores.smoothingSamples.slice() : [],
        },
      },
      spatialEvidence: composite.evidence ? JSON.parse(JSON.stringify(composite.evidence)) : null,
      standardAnalysis: {
        options: standard.options ? Object.assign({}, standard.options) : null,
        acquisition: standard.acquisition ? Object.assign({}, standard.acquisition) : null,
        metrics: metricSnapshot(standard.metrics),
        fit: fitSnapshot(standard.fit),
        minimumZone: zoneSnapshot(standard.minimumZone),
        geometry: {
          area: numberOrNull(geometry.area),
          signedArea: numberOrNull(geometry.signedArea),
          perimeter: numberOrNull(geometry.perimeter),
        },
        pointCounts: {
          raw: Array.isArray(standardPoints.raw) ? standardPoints.raw.length : 0,
          cleaned: Array.isArray(standardPoints.cleaned) ? standardPoints.cleaned.length : 0,
          resampled: Array.isArray(standardPoints.resampled) ? standardPoints.resampled.length : 0,
          smoothed: Array.isArray(standardPoints.smoothed) ? standardPoints.smoothed.length : 0,
        },
        harmonics: harmonicSnapshot(standard.harmonics),
        profiles: {
          anglesRad: copyNumbers(profiles.anglesRad),
          residualPct: copyNumbers(profiles.residualPct),
          curvatureRaw: copyNumbers(profiles.curvatureRaw),
          curvatureSmoothed: copyNumbers(profiles.curvatureSmoothed),
        },
      },
      diagnosticView: {
        smoothing: numberOrNull(input.smoothing),
        metrics: metricSnapshot(diagnostic.metrics),
      },
      input: {
        rawPoints: copyPoints(input.rawPoints || standardPoints.raw),
        analyzedPoints: copyPoints(input.analyzedPoints || input.rawPoints || standardPoints.raw),
        completion: input.completion ? JSON.parse(JSON.stringify(Object.assign({}, input.completion, { points: undefined, trimmedTail: undefined }))) : null,
      },
    };
  }

  function rounded(value, digits) {
    return finite(value) ? value.toFixed(digits) : "N/A";
  }

  function summaryText(report) {
    report = report || {};
    var score = report.score || {};
    var confidence = report.measurementConfidence || {};
    var name = report.specimen && report.specimen.name ? report.specimen.name : "Drawing";
    var lines = ["Roundness Lab — " + name];
    if (score.policy) lines.push("Criterion: " + score.policy.label + " · " + score.policy.formula);
    var completion = report.input && report.input.completion;
    if (completion) lines.push("Capture completion: " + (completion.accepted ? completion.alreadyClosed ? "endpoints meet" : completion.usedMode + " seam, " + rounded(completion.gap, 1) + " drawing units" : "no seam added") + (completion.trim && completion.trim.trimmed ? "; short terminal overshoot trimmed" : "") + ". Captured and analyzed points are exported separately.");

    if (score.eligible && finite(score.value)) {
      lines.push("Score: " + Math.round(score.value) + "/100 (" + score.label + ")");
    } else {
      lines.push("Score: Not scorable");
      if (Array.isArray(score.invalidReasons) && score.invalidReasons.length) {
        lines.push("Reason: " + score.invalidReasons.join(" "));
      }
    }

    if (finite(confidence.value)) {
      var band = confidence.band ? confidence.band.charAt(0).toUpperCase() + confidence.band.slice(1) : "Unrated";
      lines.push("Measurement evidence (heuristic): " + band + " · " + Math.round(confidence.value) + "/100");
    }

    var components = score.components || {};
    Object.keys(COMPONENT_LABELS).forEach(function (key) {
      var item = components[key] || {};
      var observed = "unavailable";
      if (key === "rms") observed = rounded(item.raw, 2) + "% R RMS";
      else if (key === "zone") observed = rounded(item.raw, 2) + "% R width";
      else if (key === "compactness") observed = "C = " + rounded(item.raw, 4);
      else if (key === "curvature") observed = rounded(item.raw, 2) + " RMS from κR = 1";
      else if (key === "harmonics") observed = "n=" + (finite(item.mode) ? item.mode : "—") + ", " + rounded(item.raw, 2) + "% R";
      lines.push(COMPONENT_LABELS[key] + ": " + rounded(item.quality, 0) + "/100 (" + observed + "; " + (score.policyId === "bottleneck" ? "minimum rule, unweighted" : rounded(item.weight * 100, 0) + "% weight") + ")");
    });
    if (score.limitingComponent && COMPONENT_LABELS[score.limitingComponent]) {
      lines.push("Largest penalty: " + COMPONENT_LABELS[score.limitingComponent]);
    }
    if (score.calibrationId) lines.push("Calibration: " + score.calibrationId);
    return lines.join("\n");
  }

  function serializeReport(report) {
    return JSON.stringify(report, null, 2) + "\n";
  }

  function makeFilename(report) {
    var specimenName = report && report.specimen && report.specimen.name ? report.specimen.name : "drawing";
    var slug = specimenName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "drawing";
    var generatedAt = report && report.generatedAt ? report.generatedAt : new Date().toISOString();
    var timestamp = generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
    return "roundness-" + slug + "-" + timestamp + ".json";
  }

  return {
    buildReport: buildReport,
    summaryText: summaryText,
    serializeReport: serializeReport,
    makeFilename: makeFilename,
    SCHEMA_VERSION: SCHEMA_VERSION,
    COMPONENT_LABELS: COMPONENT_LABELS,
  };
});
