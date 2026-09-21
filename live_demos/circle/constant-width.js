(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessConstantWidth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAU = Math.PI * 2;
  var CONVEXITY_LIMIT = 1 / 8;
  var MAX_SAFE_RADIUS = Math.sqrt(Number.MAX_VALUE / (Math.PI * 2));

  function finite(value) {
    return Number.isFinite(value);
  }

  function amplitudeValue(value) {
    var numeric = Number(value);
    return finite(numeric) ? Math.max(-CONVEXITY_LIMIT, Math.min(CONVEXITY_LIMIT, numeric)) : 0;
  }

  function radiusValue(value) {
    var numeric = Number(value);
    return finite(numeric) && numeric > 0 && numeric <= MAX_SAFE_RADIUS ? numeric : 1;
  }

  function coordinateValue(value) {
    var numeric = Number(value);
    return finite(numeric) && Math.abs(numeric) <= MAX_SAFE_RADIUS ? numeric : 0;
  }

  function supportValue(amplitude, radius, theta) {
    var a = amplitudeValue(amplitude);
    var r = radiusValue(radius);
    var angle = finite(Number(theta)) ? Number(theta) : 0;
    return r * (1 + a * Math.cos(3 * angle));
  }

  function supportDerivative(amplitude, radius, theta) {
    var a = amplitudeValue(amplitude);
    var r = radiusValue(radius);
    var angle = finite(Number(theta)) ? Number(theta) : 0;
    return -3 * r * a * Math.sin(3 * angle);
  }

  function pointAt(amplitude, radius, theta) {
    var angle = finite(Number(theta)) ? Number(theta) : 0;
    var h = supportValue(amplitude, radius, angle);
    var derivative = supportDerivative(amplitude, radius, angle);
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    return {
      x: h * cosine - derivative * sine,
      y: h * sine + derivative * cosine,
    };
  }

  function generate(amplitude, options) {
    options = options || {};
    var radius = radiusValue(options.radius);
    var count = Math.max(48, Math.min(4096, Math.round(Number(options.count) || 720)));
    var centerX = coordinateValue(options.cx);
    var centerY = coordinateValue(options.cy);
    var phase = finite(Number(options.phase)) ? Number(options.phase) : 0;
    var points = [];
    for (var i = 0; i < count; i += 1) {
      var theta = i / count * TAU;
      var source = pointAt(amplitude, radius, theta - phase);
      var cosine = Math.cos(phase);
      var sine = Math.sin(phase);
      points.push({
        x: centerX + source.x * cosine - source.y * sine,
        y: centerY + source.x * sine + source.y * cosine,
      });
    }
    if (options.close && points.length) points.push({ x: points[0].x, y: points[0].y });
    return points;
  }

  function cleanPoints(points) {
    if (!Array.isArray(points)) return [];
    var result = [];
    for (var i = 0; i < points.length; i += 1) {
      var point = points[i];
      if (!point) continue;
      var x = Array.isArray(point) ? Number(point[0]) : Number(point.x);
      var y = Array.isArray(point) ? Number(point[1]) : Number(point.y);
      if (finite(x) && finite(y)) result.push({ x: x, y: y });
    }
    if (result.length > 1) {
      var first = result[0];
      var last = result[result.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-12) result.pop();
    }
    return result;
  }

  function directionalWidth(points, theta) {
    var cosine = Math.cos(theta);
    var sine = Math.sin(theta);
    var minimum = Infinity;
    var maximum = -Infinity;
    for (var i = 0; i < points.length; i += 1) {
      var projection = points[i].x * cosine + points[i].y * sine;
      minimum = Math.min(minimum, projection);
      maximum = Math.max(maximum, projection);
    }
    return maximum - minimum;
  }

  function analyzeWidth(inputPoints, angleCount) {
    var points = cleanPoints(inputPoints);
    var count = Math.max(36, Math.min(2880, Math.round(Number(angleCount) || 360)));
    if (points.length < 3) {
      return { valid: false, values: [], mean: null, minimum: null, maximum: null, spanPct: null, rmsPct: null };
    }
    var widths = [];
    var sum = 0;
    var minimum = Infinity;
    var maximum = -Infinity;
    for (var i = 0; i < count; i += 1) {
      var angle = i / count * Math.PI;
      var width = directionalWidth(points, angle);
      if (!finite(width)) {
        return { valid: false, values: [], mean: null, minimum: null, maximum: null, spanPct: null, rmsPct: null };
      }
      widths.push({ angle: angle, width: width, deviationPct: null });
      sum += width;
      if (!finite(sum)) {
        return { valid: false, values: [], mean: null, minimum: null, maximum: null, spanPct: null, rmsPct: null };
      }
      minimum = Math.min(minimum, width);
      maximum = Math.max(maximum, width);
    }
    var mean = sum / widths.length;
    if (!finite(mean) || !(mean > 0)) {
      return { valid: false, values: [], mean: null, minimum: null, maximum: null, spanPct: null, rmsPct: null };
    }
    var sumSquares = 0;
    for (i = 0; i < widths.length; i += 1) {
      var deviation = mean > 0 ? (widths[i].width / mean - 1) * 100 : 0;
      widths[i].deviationPct = deviation;
      sumSquares += deviation * deviation;
      if (!finite(sumSquares)) {
        return { valid: false, values: [], mean: null, minimum: null, maximum: null, spanPct: null, rmsPct: null };
      }
    }
    return {
      valid: true,
      values: widths,
      mean: mean,
      minimum: minimum,
      maximum: maximum,
      spanPct: (maximum - minimum) / mean * 100,
      rmsPct: Math.sqrt(sumSquares / widths.length),
    };
  }

  function properties(amplitude, radius) {
    var a = Math.abs(amplitudeValue(amplitude));
    var r = radiusValue(radius);
    var denominator = 1 - 8 * a;
    return {
      amplitude: a,
      width: 2 * r,
      perimeter: TAU * r,
      area: Math.PI * r * r * (1 - 4 * a * a),
      compactness: 1 - 4 * a * a,
      minimumRadiusOfCurvature: r * denominator,
      maximumRadiusOfCurvature: r * (1 + 8 * a),
      curvatureRatio: denominator > 0 ? (1 + 8 * a) / denominator : Infinity,
      positiveCurvature: a < CONVEXITY_LIMIT,
      regularSupportBoundary: a < CONVEXITY_LIMIT,
      atConvexityBoundary: Math.abs(a - CONVEXITY_LIMIT) <= 1e-12,
    };
  }

  function rotate(point, angle) {
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    return {
      x: point.x * cosine - point.y * sine,
      y: point.x * sine + point.y * cosine,
    };
  }

  function caliperPose(amplitude, radius, orientation, options) {
    options = options || {};
    var a = amplitudeValue(amplitude);
    var r = radiusValue(radius);
    var angle = finite(Number(orientation)) ? Number(orientation) : 0;
    var centerX = coordinateValue(options.cx);
    var centerY = coordinateValue(options.cy);
    var count = Math.max(48, Math.min(4096, Math.round(Number(options.count) || 720)));
    var shiftX = r - supportValue(a, r, angle);
    var base = generate(a, { radius: r, count: count });
    var points = base.map(function (point) {
      var turned = rotate(point, -angle);
      return { x: centerX + shiftX + turned.x, y: centerY + turned.y };
    });

    function contact(theta) {
      var turned = rotate(pointAt(a, r, theta), -angle);
      return { x: centerX + shiftX + turned.x, y: centerY + turned.y };
    }

    var positive = contact(angle);
    var negative = contact(angle + Math.PI);
    return {
      points: points,
      positiveContact: positive,
      negativeContact: negative,
      contactMidpoint: { x: (positive.x + negative.x) / 2, y: (positive.y + negative.y) / 2 },
      supportOrigin: { x: centerX + shiftX, y: centerY },
      leftRailX: centerX - r,
      rightRailX: centerX + r,
      exactWidth: 2 * r,
      shiftX: shiftX,
    };
  }

  return {
    generate: generate,
    pointAt: pointAt,
    supportValue: supportValue,
    supportDerivative: supportDerivative,
    analyzeWidth: analyzeWidth,
    properties: properties,
    caliperPose: caliperPose,
    CONVEXITY_LIMIT: CONVEXITY_LIMIT,
  };
});
