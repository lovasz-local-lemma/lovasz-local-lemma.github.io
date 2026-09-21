(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessCurveFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAU = Math.PI * 2;
  var EPSILON = 1e-10;

  function finite(value) {
    return Number.isFinite(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function invalid(reason) {
    return {
      valid: false,
      complete: false,
      reason: reason,
      frames: [],
      warnings: [],
      maxTimeFraction: 0,
      maxAreaResidualPct: null,
      options: null,
    };
  }

  function cleanPoints(input) {
    if (!Array.isArray(input)) return [];
    var points = [];
    for (var i = 0; i < input.length; i += 1) {
      var source = input[i];
      if (!source) continue;
      var x = Array.isArray(source) ? Number(source[0]) : Number(source.x);
      var y = Array.isArray(source) ? Number(source[1]) : Number(source.y);
      if (!finite(x) || !finite(y)) continue;
      if (!points.length || Math.hypot(x - points[points.length - 1].x, y - points[points.length - 1].y) > EPSILON) {
        points.push({ x: x, y: y });
      }
    }
    if (points.length > 1 && Math.hypot(
      points[0].x - points[points.length - 1].x,
      points[0].y - points[points.length - 1].y
    ) <= EPSILON) points.pop();
    return points;
  }

  function signedArea(points) {
    var sum = 0;
    for (var i = 0; i < points.length; i += 1) {
      var next = points[(i + 1) % points.length];
      sum += points[i].x * next.y - next.x * points[i].y;
    }
    return sum / 2;
  }

  function perimeter(points) {
    var total = 0;
    for (var i = 0; i < points.length; i += 1) {
      var next = points[(i + 1) % points.length];
      total += Math.hypot(next.x - points[i].x, next.y - points[i].y);
    }
    return total;
  }

  function meanCenter(points) {
    var x = 0, y = 0;
    for (var i = 0; i < points.length; i += 1) {
      x += points[i].x;
      y += points[i].y;
    }
    return { x: x / points.length, y: y / points.length };
  }

  function resampleClosed(inputPoints, count) {
    var points = cleanPoints(inputPoints);
    var targetCount = Math.max(3, Math.round(Number(count) || points.length));
    if (points.length < 3) return [];
    var lengths = [];
    var total = 0;
    for (var i = 0; i < points.length; i += 1) {
      var next = points[(i + 1) % points.length];
      var length = Math.hypot(next.x - points[i].x, next.y - points[i].y);
      lengths.push(length);
      total += length;
    }
    if (!(total > EPSILON)) return [];

    var result = [];
    var edgeIndex = 0;
    var edgeStart = 0;
    for (i = 0; i < targetCount; i += 1) {
      var target = total * i / targetCount;
      while (edgeIndex < lengths.length - 1 && edgeStart + lengths[edgeIndex] < target) {
        edgeStart += lengths[edgeIndex];
        edgeIndex += 1;
      }
      var edgeLength = Math.max(EPSILON, lengths[edgeIndex]);
      var mix = clamp((target - edgeStart) / edgeLength, 0, 1);
      var a = points[edgeIndex];
      var b = points[(edgeIndex + 1) % points.length];
      result.push({ x: a.x * (1 - mix) + b.x * mix, y: a.y * (1 - mix) + b.y * mix });
    }
    return result;
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function rangesOverlap(a0, a1, b0, b1, epsilon) {
    return Math.max(Math.min(a0, a1), Math.min(b0, b1)) <= Math.min(Math.max(a0, a1), Math.max(b0, b1)) + epsilon;
  }

  function segmentsIntersect(a, b, c, d, epsilon) {
    if (!rangesOverlap(a.x, b.x, c.x, d.x, epsilon) || !rangesOverlap(a.y, b.y, c.y, d.y, epsilon)) return false;
    var o1 = orientation(a, b, c);
    var o2 = orientation(a, b, d);
    var o3 = orientation(c, d, a);
    var o4 = orientation(c, d, b);
    if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
        ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
    function onSegment(p, q, r) {
      return r.x >= Math.min(p.x, q.x) - epsilon && r.x <= Math.max(p.x, q.x) + epsilon &&
        r.y >= Math.min(p.y, q.y) - epsilon && r.y <= Math.max(p.y, q.y) + epsilon;
    }
    return (Math.abs(o1) <= epsilon && onSegment(a, b, c)) ||
      (Math.abs(o2) <= epsilon && onSegment(a, b, d)) ||
      (Math.abs(o3) <= epsilon && onSegment(c, d, a)) ||
      (Math.abs(o4) <= epsilon && onSegment(c, d, b));
  }

  function hasSelfIntersection(inputPoints) {
    var points = cleanPoints(inputPoints);
    if (points.length < 4) return false;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < points.length; i += 1) {
      minX = Math.min(minX, points[i].x); minY = Math.min(minY, points[i].y);
      maxX = Math.max(maxX, points[i].x); maxY = Math.max(maxY, points[i].y);
    }
    var diagonal = Math.hypot(maxX - minX, maxY - minY);
    var epsilon = Math.max(1e-12, diagonal * diagonal * 1e-12);
    for (i = 0; i < points.length; i += 1) {
      var iNext = (i + 1) % points.length;
      for (var j = i + 1; j < points.length; j += 1) {
        var jNext = (j + 1) % points.length;
        if (iNext === j || jNext === i || (i === 0 && jNext === 0)) continue;
        if (segmentsIntersect(points[i], points[iNext], points[j], points[jNext], epsilon)) return true;
      }
    }
    return false;
  }

  function centeredPoints(points, scale) {
    var center = meanCenter(points);
    var factor = finite(scale) && scale > 0 ? scale : 1;
    return points.map(function (point) {
      return { x: (point.x - center.x) * factor, y: (point.y - center.y) * factor };
    });
  }

  function maximumVertexTurn(points) {
    var maximum = 0;
    for (var i = 0; i < points.length; i += 1) {
      var previous = points[(i - 1 + points.length) % points.length];
      var current = points[i];
      var next = points[(i + 1) % points.length];
      var ax = current.x - previous.x;
      var ay = current.y - previous.y;
      var bx = next.x - current.x;
      var by = next.y - current.y;
      maximum = Math.max(maximum, Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)));
    }
    return maximum;
  }

  function frameFor(points, elapsed, initialArea, extinctionTime) {
    var area = Math.abs(signedArea(points));
    var length = perimeter(points);
    var count = points.length;
    var polygonCircleFactor = 4 * count * Math.tan(Math.PI / count);
    var polygonCompactness = length > EPSILON ? polygonCircleFactor * area / (length * length) : 0;
    var scale = area > EPSILON ? Math.sqrt(initialArea / area) : 1;
    var timeFraction = extinctionTime > EPSILON ? elapsed / extinctionTime : 0;
    var areaRatio = initialArea > EPSILON ? area / initialArea : 0;
    return {
      physicalPoints: centeredPoints(points, 1),
      normalizedPoints: centeredPoints(points, scale),
      elapsed: elapsed,
      timeFraction: timeFraction,
      area: area,
      areaRatio: areaRatio,
      idealAreaRatio: Math.max(0, 1 - timeFraction),
      areaResidualPct: (areaRatio - Math.max(0, 1 - timeFraction)) * 100,
      perimeter: length,
      compactness: length > EPSILON ? 4 * Math.PI * area / (length * length) : 0,
      polygonDeficit: polygonCompactness > EPSILON ? 1 / polygonCompactness - 1 : Infinity,
    };
  }

  function simulate(inputPoints, inputOptions) {
    var options = inputOptions || {};
    var count = clamp(Math.round(Number(options.count) || 96), 48, 180);
    var lambda = clamp(Number(options.lambda) || 0.18, 0.02, 0.24);
    var frameCount = clamp(Math.round(Number(options.frames) || 37), 9, 61);
    var targetTimeFraction = clamp(Number(options.targetTimeFraction) || 0.9, 0.5, 0.96);
    var maxSteps = clamp(Math.round(Number(options.maxSteps) || 5000), 400, 12000);
    var intersectionStride = clamp(Math.round(Number(options.intersectionStride) || 10), 1, 50);
    var maxClockDriftPct = clamp(Number(options.maxClockDriftPct) || 5, 1, 12);
    var source = cleanPoints(inputPoints);
    if (source.length < 4) return invalid("A closed contour with enough distinct points is required.");
    if (hasSelfIntersection(source)) return invalid("Curve shortening is shown only for a simple, non-self-intersecting contour.");
    var sourceArea = Math.abs(signedArea(source));
    var sourcePerimeter = perimeter(source);
    if (!(sourceArea > EPSILON) || !(sourcePerimeter > EPSILON)) return invalid("The contour has no stable enclosed area.");

    var points = resampleClosed(source, count);
    if (points.length !== count) return invalid("A closed contour with enough distinct points is required.");
    if (hasSelfIntersection(points)) return invalid("Curve shortening is shown only for a simple, non-self-intersecting contour.");

    var initialSignedArea = signedArea(points);
    var initialArea = Math.abs(initialSignedArea);
    var initialPerimeter = perimeter(points);
    if (!(initialArea > EPSILON) || !(initialPerimeter > EPSILON)) return invalid("The contour has no stable enclosed area.");
    var resampleAreaChangePct = Math.abs(initialArea / sourceArea - 1) * 100;
    var resamplePerimeterChangePct = Math.abs(initialPerimeter / sourcePerimeter - 1) * 100;
    if (resampleAreaChangePct > 1 || resamplePerimeterChangePct > 2) {
      return invalid("The contour has more detail than the flow grid can resolve without changing its area or perimeter.");
    }
    var maximumTurnDeg = maximumVertexTurn(points) * 180 / Math.PI;
    if (maximumTurnDeg >= 120) {
      return invalid("A sampled bend is too sharp for a trustworthy curve-shortening step.");
    }
    var initialOrientation = initialSignedArea > 0 ? 1 : -1;
    var extinctionTime = initialArea / TAU;
    var timeTolerance = extinctionTime * 1e-10;
    var frames = [frameFor(points, 0, initialArea, extinctionTime)];
    var warnings = [];
    var elapsed = 0;
    var steps = 0;
    var abortedReason = null;

    for (var frameIndex = 1; frameIndex < frameCount; frameIndex += 1) {
      var target = targetTimeFraction * frameIndex / (frameCount - 1);
      var targetElapsed = target * extinctionTime;
      var advanced = false;
      while (elapsed + timeTolerance < targetElapsed) {
        if (steps >= maxSteps) {
          abortedReason = "The numerical step budget ended before the requested flow horizon.";
          break;
        }
        var length = perimeter(points);
        var spacing = length / count;
        var spacingSquared = spacing * spacing;
        var remaining = targetElapsed - elapsed;
        var effectiveLambda = Math.min(lambda, remaining / spacingSquared);
        var dt = effectiveLambda * spacingSquared;
        if (!(effectiveLambda > 1e-12) || !(dt > 0)) {
          abortedReason = "The numerical time step became too small to advance reliably.";
          break;
        }
        var next = [];
        for (var i = 0; i < count; i += 1) {
          var previous = points[(i - 1 + count) % count];
          var current = points[i];
          var following = points[(i + 1) % count];
          next.push({
            x: (1 - 2 * effectiveLambda) * current.x + effectiveLambda * (previous.x + following.x),
            y: (1 - 2 * effectiveLambda) * current.y + effectiveLambda * (previous.y + following.y),
          });
        }
        next = resampleClosed(next, count);
        steps += 1;
        if (next.length !== count || next.some(function (point) { return !finite(point.x) || !finite(point.y); })) {
          abortedReason = "The discrete solver produced non-finite geometry.";
          break;
        }
        var nextSignedArea = signedArea(next);
        var nextArea = Math.abs(nextSignedArea);
        var currentArea = Math.abs(signedArea(points));
        if (!(nextArea > initialArea * 0.005) || (nextSignedArea > 0 ? 1 : -1) !== initialOrientation) {
          abortedReason = "The numerical contour approached its collapse limit.";
          break;
        }
        if (nextArea > currentArea + initialArea * 1e-9) {
          abortedReason = "The discrete step increased area instead of following curvature-flow shrinkage.";
          break;
        }
        var nextElapsed = elapsed + dt;
        var clockResidualPct = Math.abs(nextArea / initialArea - Math.max(0, 1 - nextElapsed / extinctionTime)) * 100;
        if (clockResidualPct > maxClockDriftPct) {
          abortedReason = "The discrete area clock drifted beyond its declared safety limit.";
          break;
        }
        if (steps % intersectionStride === 0 && hasSelfIntersection(next)) {
          abortedReason = "The polygon approximation crossed itself before the continuum flow should.";
          break;
        }
        points = next;
        elapsed = nextElapsed;
        advanced = true;
      }
      if (abortedReason) break;
      if (!advanced) {
        abortedReason = "The numerical preview could not advance to its next saved time.";
        break;
      }
      if (hasSelfIntersection(points)) {
        abortedReason = "The polygon approximation crossed itself before a saved frame.";
        break;
      }
      frames.push(frameFor(points, elapsed, initialArea, extinctionTime));
    }

    if (abortedReason) warnings.push(abortedReason);
    var deficitRises = 0;
    for (var j = 1; j < frames.length; j += 1) {
      if (frames[j].polygonDeficit > frames[j - 1].polygonDeficit + 1e-7) deficitRises += 1;
    }
    if (deficitRises) warnings.push("The polygon-corrected form deficit rose at " + deficitRises + " saved step" + (deficitRises === 1 ? "" : "s") + ".");
    var maxAreaResidualPct = frames.reduce(function (maximum, frame) {
      return Math.max(maximum, Math.abs(frame.areaResidualPct));
    }, 0);
    if (maxAreaResidualPct > 2) warnings.push("The discrete area clock drifted more than two percentage points from the continuum law.");

    var maxTimeFraction = frames[frames.length - 1].timeFraction;
    var complete = !abortedReason && frames.length === frameCount && maxTimeFraction >= targetTimeFraction - 1e-8;
    return {
      valid: frames.length >= 2,
      complete: complete,
      reason: frames.length >= 2 ? null : (abortedReason || "The curve-shortening preview could not advance."),
      frames: frames,
      warnings: warnings,
      maxTimeFraction: maxTimeFraction,
      maxAreaResidualPct: maxAreaResidualPct,
      initialArea: initialArea,
      initialPerimeter: initialPerimeter,
      extinctionTime: extinctionTime,
      options: {
        count: count,
        lambda: lambda,
        frames: frameCount,
        targetTimeFraction: targetTimeFraction,
        maxSteps: maxSteps,
        maxClockDriftPct: maxClockDriftPct,
        intersectionStride: intersectionStride,
      },
      sampling: {
        areaChangePct: resampleAreaChangePct,
        perimeterChangePct: resamplePerimeterChangePct,
        maximumTurnDeg: maximumTurnDeg,
      },
    };
  }

  function interpolatePoints(a, b, mix) {
    return a.map(function (point, index) {
      return {
        x: point.x * (1 - mix) + b[index].x * mix,
        y: point.y * (1 - mix) + b[index].y * mix,
      };
    });
  }

  function interpolateNumber(a, b, mix) {
    return a * (1 - mix) + b * mix;
  }

  function areaPlotDomain(result) {
    if (!result || !Array.isArray(result.frames) || !result.frames.length) return { minimum: 0, maximum: 1 };
    var values = [];
    for (var i = 0; i < result.frames.length; i += 1) {
      if (finite(result.frames[i].areaRatio)) values.push(result.frames[i].areaRatio);
      if (finite(result.frames[i].idealAreaRatio)) values.push(result.frames[i].idealAreaRatio);
    }
    if (!values.length) return { minimum: 0, maximum: 1 };
    var rawMinimum = Math.min.apply(null, values);
    var rawMaximum = Math.max.apply(null, values);
    var padding = Math.max(0.025, (rawMaximum - rawMinimum) * 0.04);
    return {
      minimum: Math.max(0, rawMinimum - padding),
      maximum: Math.min(1.08, rawMaximum + padding),
    };
  }

  function sample(result, fraction) {
    if (!result || !result.valid || !result.frames.length) return null;
    var value = clamp(finite(Number(fraction)) ? Number(fraction) : 0, 0, 1);
    var target = value * result.maxTimeFraction;
    var upper = 1;
    while (upper < result.frames.length && result.frames[upper].timeFraction < target) upper += 1;
    if (upper >= result.frames.length) upper = result.frames.length - 1;
    var lower = Math.max(0, upper - 1);
    var a = result.frames[lower], b = result.frames[upper];
    var span = b.timeFraction - a.timeFraction;
    var mix = span > EPSILON ? clamp((target - a.timeFraction) / span, 0, 1) : 0;
    var physicalPoints = centeredPoints(interpolatePoints(a.physicalPoints, b.physicalPoints, mix), 1);
    var area = Math.abs(signedArea(physicalPoints));
    var length = perimeter(physicalPoints);
    var count = physicalPoints.length;
    var areaRatio = result.initialArea > EPSILON ? area / result.initialArea : 0;
    var timeFraction = interpolateNumber(a.timeFraction, b.timeFraction, mix);
    var idealAreaRatio = Math.max(0, 1 - timeFraction);
    var polygonCircleFactor = 4 * count * Math.tan(Math.PI / count);
    var polygonCompactness = length > EPSILON ? polygonCircleFactor * area / (length * length) : 0;
    var normalization = area > EPSILON ? Math.sqrt(result.initialArea / area) : 1;
    return {
      fraction: value,
      physicalPoints: physicalPoints,
      normalizedPoints: centeredPoints(physicalPoints, normalization),
      elapsed: interpolateNumber(a.elapsed, b.elapsed, mix),
      timeFraction: timeFraction,
      area: area,
      areaRatio: areaRatio,
      idealAreaRatio: idealAreaRatio,
      areaResidualPct: (areaRatio - idealAreaRatio) * 100,
      perimeter: length,
      compactness: length > EPSILON ? 4 * Math.PI * area / (length * length) : 0,
      polygonDeficit: polygonCompactness > EPSILON ? 1 / polygonCompactness - 1 : Infinity,
      lowerFrame: lower,
      upperFrame: upper,
      frameMix: mix,
    };
  }

  return {
    simulate: simulate,
    sample: sample,
    cleanPoints: cleanPoints,
    resampleClosed: resampleClosed,
    signedArea: signedArea,
    perimeter: perimeter,
    hasSelfIntersection: hasSelfIntersection,
    areaPlotDomain: areaPlotDomain,
  };
});
