(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessTangentTurning = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAU = Math.PI * 2;
  var EPSILON = 1e-10;
  var AMBIGUOUS_TURN = Math.PI - Math.PI / 36;

  function finite(value) {
    return Number.isFinite(value);
  }

  function invalid(reason) {
    return {
      valid: false,
      reason: reason,
      points: [],
      edgeAngles: [],
      tangentAngles: [],
      boundaryFractions: [],
      turns: [],
      cumulativeDeg: [],
      idealDeg: [],
      residualDeg: [],
      turnUniformityDeg: null,
      totalSignedDeg: null,
      totalAbsoluteDeg: null,
      extraTurningDeg: null,
      negativeTurnDeg: null,
      backtrackCount: null,
      orientation: null,
      maxStepDeg: null,
      selfIntersecting: false,
      numericallyAmbiguous: false,
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

  function wrappedDifference(next, previous) {
    return Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
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

  function analyze(inputPoints) {
    var points = cleanPoints(inputPoints);
    if (points.length < 5) return invalid("At least five distinct closed-contour samples are required.");
    var area = signedArea(points);
    if (!finite(area) || Math.abs(area) <= EPSILON) return invalid("The contour orientation is numerically ambiguous.");
    var orientation = area > 0 ? 1 : -1;
    var angles = [];
    var tangentAngles = [];
    var edgeLengths = [];
    var perimeter = 0;
    for (var i = 0; i < points.length; i += 1) {
      var next = points[(i + 1) % points.length];
      var dx = next.x - points[i].x;
      var dy = next.y - points[i].y;
      var edgeLength = Math.hypot(dx, dy);
      if (!(edgeLength > EPSILON)) return invalid("The contour contains a degenerate edge.");
      angles.push(Math.atan2(dy, dx));
      edgeLengths.push(edgeLength);
      perimeter += edgeLength;
    }
    for (i = 0; i < points.length; i += 1) {
      var previousPoint = points[(i - 1 + points.length) % points.length];
      var currentPoint = points[i];
      next = points[(i + 1) % points.length];
      var previousLength = edgeLengths[(i - 1 + edgeLengths.length) % edgeLengths.length];
      var nextLength = edgeLengths[i];
      // Three-point derivative on a nonuniform arclength grid. Smoothing can
      // change local sample speed even when resampling happened beforehand.
      var previousWeight = -nextLength / (previousLength * (previousLength + nextLength));
      var currentWeight = (nextLength - previousLength) / (previousLength * nextLength);
      var nextWeight = previousLength / (nextLength * (previousLength + nextLength));
      var tangentX = previousWeight * previousPoint.x + currentWeight * currentPoint.x + nextWeight * next.x;
      var tangentY = previousWeight * previousPoint.y + currentWeight * currentPoint.y + nextWeight * next.y;
      if (!(Math.hypot(tangentX, tangentY) > EPSILON)) return invalid("A sampled tangent is numerically ambiguous.");
      tangentAngles.push(Math.atan2(tangentY, tangentX));
    }

    var boundaryFractions = [0];
    var distanceAlong = 0;
    for (i = 0; i < edgeLengths.length; i += 1) {
      distanceAlong += edgeLengths[i];
      boundaryFractions.push(distanceAlong / perimeter);
    }

    var turns = [];
    var maximumStep = 0;
    for (i = 0; i < angles.length; i += 1) {
      maximumStep = Math.max(maximumStep, Math.abs(wrappedDifference(angles[i], angles[(i - 1 + angles.length) % angles.length])));
    }
    var signedTotal = 0;
    var absoluteTotal = 0;
    var negativeTotal = 0;
    var backtrackCount = 0;
    for (i = 0; i < tangentAngles.length; i += 1) {
      var previous = tangentAngles[(i - 1 + tangentAngles.length) % tangentAngles.length];
      var rawTurn = wrappedDifference(tangentAngles[i], previous);
      var normalizedTurn = orientation * rawTurn;
      maximumStep = Math.max(maximumStep, Math.abs(rawTurn));
      signedTotal += rawTurn;
      absoluteTotal += Math.abs(rawTurn);
      if (normalizedTurn < -1e-8) {
        negativeTotal += -normalizedTurn;
        backtrackCount += 1;
      }
      turns.push({
        index: i,
        fraction: boundaryFractions[i],
        rawRad: rawTurn,
        normalizedRad: normalizedTurn,
        rawDeg: rawTurn * 180 / Math.PI,
        normalizedDeg: normalizedTurn * 180 / Math.PI,
      });
    }

    var cumulative = [0];
    var ideal = [0];
    var residual = [0];
    var running = 0;
    for (i = 1; i <= turns.length; i += 1) {
      running += turns[i % turns.length].normalizedRad * 180 / Math.PI;
      var idealValue = 360 * boundaryFractions[i];
      cumulative.push(running);
      ideal.push(idealValue);
      residual.push(running - idealValue);
    }

    // Integrate the piecewise-linear residual over normalized arclength. This
    // keeps the diagnostic geometric even when smoothing changes sample speed.
    var residualMean = 0;
    var residualSecondMoment = 0;
    for (i = 0; i < turns.length; i += 1) {
      var interval = boundaryFractions[i + 1] - boundaryFractions[i];
      var residualStart = residual[i], residualEnd = residual[i + 1];
      residualMean += interval * (residualStart + residualEnd) / 2;
      residualSecondMoment += interval * (residualStart * residualStart + residualStart * residualEnd + residualEnd * residualEnd) / 3;
    }

    return {
      valid: true,
      reason: null,
      points: points,
      edgeAngles: angles,
      tangentAngles: tangentAngles,
      boundaryFractions: boundaryFractions,
      turns: turns,
      cumulativeDeg: cumulative,
      idealDeg: ideal,
      residualDeg: residual,
      turnUniformityDeg: Math.sqrt(Math.max(0, residualSecondMoment - residualMean * residualMean)),
      totalSignedDeg: signedTotal * 180 / Math.PI,
      totalAbsoluteDeg: absoluteTotal * 180 / Math.PI,
      extraTurningDeg: Math.max(0, absoluteTotal - TAU) * 180 / Math.PI,
      negativeTurnDeg: negativeTotal * 180 / Math.PI,
      backtrackCount: backtrackCount,
      orientation: orientation,
      maxStepDeg: maximumStep * 180 / Math.PI,
      selfIntersecting: hasSelfIntersection(points),
      numericallyAmbiguous: maximumStep >= AMBIGUOUS_TURN,
    };
  }

  function sample(analysis, fraction) {
    if (!analysis || !analysis.valid || !analysis.points.length) return null;
    var value = Number(fraction);
    value = finite(value) ? Math.max(0, Math.min(1, value)) : 0;
    var count = analysis.points.length;
    var edgeIndex = 0;
    var mix = 0;
    if (value < 1) {
      var low = 0, high = count;
      while (low + 1 < high) {
        var middle = Math.floor((low + high) / 2);
        if (analysis.boundaryFractions[middle] <= value) low = middle;
        else high = middle;
      }
      edgeIndex = Math.min(count - 1, low);
      var edgeStart = analysis.boundaryFractions[edgeIndex];
      var edgeEnd = analysis.boundaryFractions[edgeIndex + 1];
      mix = (value - edgeStart) / Math.max(EPSILON, edgeEnd - edgeStart);
    }
    var start = analysis.points[edgeIndex];
    var end = analysis.points[(edgeIndex + 1) % count];
    var nextVertex = edgeIndex + 1;
    var cumulativeDeg = value >= 1 ? analysis.cumulativeDeg[count] :
      analysis.cumulativeDeg[edgeIndex] * (1 - mix) + analysis.cumulativeDeg[nextVertex] * mix;
    var rawTangent = value >= 1 ? analysis.tangentAngles[0] :
      analysis.tangentAngles[edgeIndex] + analysis.turns[nextVertex % count].rawRad * mix;
    var residualDeg = cumulativeDeg - 360 * value;
    return {
      fraction: value,
      point: { x: start.x * (1 - mix) + end.x * mix, y: start.y * (1 - mix) + end.y * mix },
      tangentAngle: rawTangent,
      normalizedTangentAngle: analysis.tangentAngles[0] + cumulativeDeg * Math.PI / 180,
      cumulativeDeg: cumulativeDeg,
      idealDeg: 360 * value,
      residualDeg: residualDeg,
      edgeIndex: edgeIndex,
      edgeMix: mix,
    };
  }

  return {
    analyze: analyze,
    sample: sample,
    cleanPoints: cleanPoints,
    wrappedDifference: wrappedDifference,
    hasSelfIntersection: hasSelfIntersection,
  };
});
