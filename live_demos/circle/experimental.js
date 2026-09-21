(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessExperimental = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_SCALES = Object.freeze([0.75, 1.25, 2, 3, 4.5, 6.5, 9, 12]);
  var TAU = Math.PI * 2;

  function finite(value) {
    return Number.isFinite(value);
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function sanitizedScales(scales, sampleCount) {
    var input = Array.isArray(scales) && scales.length ? scales : DEFAULT_SCALES;
    var result = [];
    for (var i = 0; i < input.length; i += 1) {
      var scale = Number(input[i]);
      if (!finite(scale)) continue;
      scale = Math.max(0.25, Math.min(sampleCount / 8, scale));
      if (result.indexOf(scale) === -1) result.push(scale);
    }
    result.sort(function (a, b) { return a - b; });
    if (result.length) return result;
    return input === DEFAULT_SCALES ? [Math.min(sampleCount / 8, 1)] : sanitizedScales(DEFAULT_SCALES, sampleCount);
  }

  function zeroCrossings(values, deadband) {
    if (!Array.isArray(values) || values.length < 3) return [];
    var epsilon = finite(deadband) ? Math.max(0, deadband) : 1e-3;
    var count = values.length;
    var signed = [];
    for (var i = 0; i < count; i += 1) {
      if (!finite(values[i])) return [];
      if (values[i] > epsilon) signed.push({ index: i, sign: 1, value: values[i] });
      else if (values[i] < -epsilon) signed.push({ index: i, sign: -1, value: values[i] });
    }
    if (signed.length < 2) return [];

    var result = [];
    for (i = 0; i < signed.length; i += 1) {
      var current = signed[i];
      var next = signed[(i + 1) % signed.length];
      if (current.sign === next.sign) continue;
      var span = next.index > current.index ? next.index - current.index : next.index + count - current.index;
      var offset = span === 1 ?
        Math.abs(current.value) / (Math.abs(current.value) + Math.abs(next.value)) :
        span * 0.5;
      result.push(((current.index + offset) % count) / count);
    }
    return result;
  }

  function signedPeakBins(values, count) {
    if (!Array.isArray(values) || !values.length) return [];
    var binCount = Math.max(1, Math.min(values.length, Math.round(Number(count) || values.length)));
    var bins = [];
    for (var bin = 0; bin < binCount; bin += 1) {
      var start = Math.floor(bin / binCount * values.length);
      var end = Math.max(start + 1, Math.floor((bin + 1) / binCount * values.length));
      var peak = null;
      for (var i = start; i < end; i += 1) {
        var value = values[i];
        if (finite(value) && (peak === null || Math.abs(value) > Math.abs(peak))) peak = value;
      }
      bins.push(peak);
    }
    return bins;
  }

  function bendingExcess(result) {
    var points = result && result.points ? result.points.smoothed : [];
    var curvature = result && result.profiles ? result.profiles.curvatureSmoothed : [];
    var radius = result && result.fit ? result.fit.r : null;
    if (!Array.isArray(points) || points.length < 3 || curvature.length !== points.length || !(radius > 0)) {
      return { raw: null, value: null };
    }
    if (curvature.some(function (value) { return !finite(value); })) return { raw: null, value: null };
    var perimeter = 0;
    var integral = 0;
    for (var i = 0; i < points.length; i += 1) {
      var previous = points[(i - 1 + points.length) % points.length];
      var current = points[i];
      var next = points[(i + 1) % points.length];
      var localArc = (distance(previous, current) + distance(current, next)) * 0.5;
      var kappa = curvature[i] / radius;
      perimeter += localArc;
      if (finite(kappa)) integral += kappa * kappa * localArc;
    }
    var raw = perimeter > 0 ? perimeter * integral / (TAU * TAU) - 1 : null;
    return { raw: raw, value: finite(raw) ? raw : null };
  }

  function invalidReasons(result) {
    var validity = result && result.validity ? result.validity : {};
    var reasons = [];
    if (!result || !result.fit || !result.fit.valid) reasons.push("A stable reference scale could not be fitted.");
    if (!validity.isClosed) reasons.push("This preview needs a closed loop for periodic smoothing.");
    if (validity.selfIntersecting) reasons.push("Self-crossing loops make the scale-space interpretation ambiguous.");
    if (!validity.curvatureValid) reasons.push("A complete curvature profile is required.");
    return reasons;
  }

  function analyze(rawPoints, engine, options) {
    options = options || {};
    if (!engine || typeof engine.analyze !== "function") {
      throw new Error("A roundness analysis engine is required.");
    }
    var sampleCount = Math.max(64, Math.min(720, Math.round(Number(options.sampleCount) || 240)));
    var scales = sanitizedScales(options.scales, sampleCount);
    var first = engine.analyze(rawPoints, { sampleCount: sampleCount, smoothing: scales[0], maxHarmonic: 12 });
    var reasons = invalidReasons(first);
    if (reasons.length) {
      return {
        valid: false,
        rows: [],
        scales: scales,
        sampleCount: sampleCount,
        reasons: reasons,
        warnings: ["Experimental preview withheld rather than extrapolating missing or ambiguous geometry."],
      };
    }

    var rows = [];
    for (var i = 0; i < scales.length; i += 1) {
      var result = i === 0 ? first : engine.analyze(rawPoints, {
        sampleCount: sampleCount,
        smoothing: scales[i],
        maxHarmonic: 12,
      });
      var curvature = result.profiles.curvatureSmoothed.slice();
      var deviations = curvature.map(function (value) { return finite(value) ? value - 1 : null; });
      var energy = bendingExcess(result);
      rows.push({
        scale: scales[i],
        scalePct: scales[i] / sampleCount * 100,
        curvature: curvature,
        deviations: deviations,
        inflections: zeroCrossings(curvature),
        curvatureRms: result.metrics.curvatureRms,
        bendingExcess: energy.value,
        rawBendingExcess: energy.raw,
      });
    }

    var warnings = [];
    if (first.points && Array.isArray(first.points.cleaned) && first.points.cleaned.length < 48) {
      warnings.push("Sparse input: fine-scale bands may reflect sampling more than shape.");
    }
    if (!rows.some(function (row) { return row.inflections.length > 0; })) {
      warnings.push("No inflection tracks were detected. Classical CSS can also be blank for a noncircular convex shape.");
    }
    for (i = 1; i < rows.length; i += 1) {
      if (rows[i].inflections.length > rows[i - 1].inflections.length) {
        warnings.push("Inflection count rises at a coarser scale; discrete feature tracks may be splitting or shifting.");
        break;
      }
    }
    if (rows.some(function (row) { return finite(row.rawBendingExcess) && row.rawBendingExcess < -1e-6; })) {
      warnings.push("Bending excess dipped below the continuous zero bound; negative values are numerical undershoot, not extra roundness.");
    }
    if (rows.some(function (row) { return finite(row.rawBendingExcess) && row.rawBendingExcess < -0.02; })) {
      warnings.push("The discrete bending estimate substantially violated its continuous-theory bound; treat this plot as numerically unstable.");
    }

    var rowsWithInflections = rows.filter(function (row) { return row.inflections.length > 0; });
    return {
      valid: true,
      rows: rows,
      scales: scales,
      sampleCount: sampleCount,
      reasons: [],
      warnings: warnings,
      lastInflectionScale: rowsWithInflections.length ? rowsWithInflections[rowsWithInflections.length - 1].scale : null,
      maturity: {
        theory: "established",
        roundnessInterpretation: "experimental",
        includedInScore: false,
      },
    };
  }

  return {
    analyze: analyze,
    zeroCrossings: zeroCrossings,
    signedPeakBins: signedPeakBins,
    bendingExcess: bendingExcess,
    DEFAULT_SCALES: DEFAULT_SCALES,
  };
});
