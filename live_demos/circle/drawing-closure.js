(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessDrawingClosure = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var TAU = 2 * Math.PI;
  var RULES = Object.freeze({ minimumPoints: 24, minimumCoveragePct: 90,
    radiusFraction: 0.25, minimumAllowance: 10, maximumAllowance: 36,
    minimumTurns: 0.85, maximumTurns: 1.12, maximumBacktrackingTurns: 0.15,
    angularBins: 360, crossingCheckPoints: 128 });

  function point(p) { return { x: p.x, y: p.y }; }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function inputPoints(raw) {
    var points = [], discarded = 0;
    if (Array.isArray(raw)) raw.forEach(function (p) {
      var x = p && (Array.isArray(p) ? p[0] : p.x), y = p && (Array.isArray(p) ? p[1] : p.y);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x: x, y: y });
      else discarded += 1;
    });
    return { points: points, sourcePointCount: Array.isArray(raw) ? raw.length : 0,
      discardedPointCount: discarded, validInput: Array.isArray(raw) && discarded === 0 };
  }
  function cleanConsecutive(points, epsilon) {
    var clean = [];
    points.forEach(function (p) { if (!clean.length || distance(clean[clean.length - 1], p) > epsilon) clean.push(p); });
    return clean;
  }
  function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
  function intersects(a, b, c, d, epsilon) {
    if (Math.max(a.x, b.x) + epsilon < Math.min(c.x, d.x) ||
      Math.max(c.x, d.x) + epsilon < Math.min(a.x, b.x) ||
      Math.max(a.y, b.y) + epsilon < Math.min(c.y, d.y) ||
      Math.max(c.y, d.y) + epsilon < Math.min(a.y, b.y)) return false;
    var tolerance = epsilon * Math.max(1, distance(a, b) + distance(c, d));
    var abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    return !(abC > tolerance && abD > tolerance || abC < -tolerance && abD < -tolerance ||
      cdA > tolerance && cdB > tolerance || cdA < -tolerance && cdB < -tolerance);
  }
  // Adjacent segments may share their endpoint, but cannot retrace an interval.
  function endpointOnly(a, b, shared, epsilon) {
    var u = { x: a.x - shared.x, y: a.y - shared.y }, v = { x: b.x - shared.x, y: b.y - shared.y };
    var area = Math.abs(u.x * v.y - u.y * v.x);
    if (area > epsilon * Math.max(1, Math.hypot(u.x, u.y) + Math.hypot(v.x, v.y))) return true;
    return u.x * v.x + u.y * v.y < 0;
  }
  function bridgeClear(bridge, points, epsilon) {
    var lastOriginal = points.length - 2, lastBridge = bridge.length - 2;
    for (var i = 0; i <= lastBridge; i += 1) {
      for (var j = 0; j <= lastOriginal; j += 1) {
        if (!intersects(bridge[i], bridge[i + 1], points[j], points[j + 1], epsilon)) continue;
        if (i === 0 && j === lastOriginal && endpointOnly(bridge[1], points[j], bridge[0], epsilon)) continue;
        if (i === lastBridge && j === 0 && endpointOnly(bridge[i], points[1], points[0], epsilon)) continue;
        return false;
      }
    }
    return true;
  }
  // Bounded preview rejection, not a certification of the whole captured topology.
  // The proposed seam is separately checked against every original segment.
  function coarseCrossing(points, epsilon, closed) {
    var count = Math.min(points.length, RULES.crossingCheckPoints);
    var sampled = Array.from({ length: count }, function (_, i) {
      return points[Math.round(i * (points.length - 1) / (count - 1))];
    });
    for (var i = 0; i < sampled.length - 1; i += 1) {
      for (var j = i + 2; j < sampled.length - 1; j += 1) {
        if (closed && i === 0 && j === sampled.length - 2) continue;
        if (intersects(sampled[i], sampled[i + 1], sampled[j], sampled[j + 1], epsilon)) return true;
      }
    }
    return false;
  }
  function inspectPrepared(input, engine) {
    if (!engine || typeof engine.fitCircle !== "function") throw new Error("A circle-fitting engine is required.");
    var points = input.points, clean = cleanConsecutive(points, 1e-9);
    var result = { ready: false, reason: "Keep drawing a complete loop.", reasonCode: "too-few-points",
      gap: points.length > 1 ? distance(points[0], points[points.length - 1]) : null,
      radius: null, allowance: null, coveragePct: 0, pathLength: 0, cleanedPointCount: clean.length,
      sourcePointCount: input.sourcePointCount, discardedPointCount: input.discardedPointCount,
      netTurns: 0, backtrackingTurns: 0, alreadyClosed: false,
      coverageMethod: "conservative angular-bin gap bound", topologyCheck: "bounded preview plus exact straight-seam segment checks" };
    function fail(code, reason) { result.reasonCode = code; result.reason = reason; return result; }
    if (!input.validInput) return fail("invalid-input", "The captured path contains unavailable coordinates.");
    if (clean.length < RULES.minimumPoints) return result;
    var fit = engine.fitCircle(clean);
    if (!fit || !fit.valid || !Number.isFinite(fit.r) || fit.r <= 1e-8 || !Number.isFinite(fit.cx) || !Number.isFinite(fit.cy))
      return fail("unstable-fit", "Keep drawing until a stable loop scale is available.");
    result.radius = fit.r;
    result.allowance = clamp(fit.r * RULES.radiusFraction, RULES.minimumAllowance, RULES.maximumAllowance);
    var epsilon = Math.max(1e-9, fit.r * 1e-8);
    clean = cleanConsecutive(points, epsilon);
    result.alreadyClosed = result.gap === 0;
    result.cleanedPointCount = clean.length - (result.gap <= epsilon ? 1 : 0);
    var bins = new Uint8Array(RULES.angularBins), net = 0, travel = 0, previous = null, minimumRadius = Infinity, maxAngleStep = 0;
    for (var i = 0; i < clean.length; i += 1) {
      var dx = clean[i].x - fit.cx, dy = clean[i].y - fit.cy, angle = Math.atan2(dy, dx);
      minimumRadius = Math.min(minimumRadius, Math.hypot(dx, dy));
      bins[Math.min(bins.length - 1, Math.floor((angle + Math.PI) / TAU * bins.length))] = 1;
      if (previous != null) {
        var change = Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
        net += change; travel += Math.abs(change); maxAngleStep = Math.max(maxAngleStep, Math.abs(change));
        result.pathLength += distance(clean[i - 1], clean[i]);
      }
      previous = angle;
    }
    var longest = 0, empty = 0;
    for (i = 0; i < bins.length * 2; i += 1) {
      empty = bins[i % bins.length] ? 0 : empty + 1;
      longest = Math.max(longest, empty);
    }
    result.coveragePct = Math.max(0, 100 * (1 - (Math.min(longest, bins.length) + 2) / bins.length));
    result.netTurns = net / TAU;
    result.backtrackingTurns = Math.max(0, (travel - Math.abs(net)) / (2 * TAU));
    if (result.cleanedPointCount < RULES.minimumPoints) return fail("too-few-points", "Use at least 24 distinct samples around the loop.");
    if (result.coveragePct < RULES.minimumCoveragePct || Math.abs(result.netTurns) < RULES.minimumTurns || result.pathLength < 4 * fit.r)
      return fail("incomplete-loop", "Continue around the loop before returning to the start.");
    if (Math.abs(result.netTurns) > RULES.maximumTurns || result.backtrackingTurns > RULES.maximumBacktrackingTurns || maxAngleStep > Math.PI / 2 || minimumRadius < fit.r * 0.04)
      return fail("retraced-loop", "The stroke doubles back or makes more than one loop.");
    if (result.gap > result.allowance) return fail("gap-too-large", "Move closer to the start before releasing.");
    if (coarseCrossing(clean, epsilon, result.gap <= epsilon)) return fail("crossing-stroke", "The stroke crosses or retraces itself.");
    if (result.gap > epsilon && !bridgeClear([clean[clean.length - 1], clean[0]], clean, epsilon))
      return fail("crossing-seam", "A closing segment would cross the captured stroke.");
    result.ready = true;
    result.reasonCode = result.alreadyClosed ? "already-closed" : "ready";
    result.reason = result.alreadyClosed ? "The captured loop is already closed." : "Release to join the small remaining gap.";
    return result;
  }
  function inspect(points, engine) { return inspectPrepared(inputPoints(points), engine); }

  function pointAtDistance(points, fromEnd, target) {
    var index = fromEnd ? points.length - 1 : 0, direction = fromEnd ? -1 : 1, traveled = 0;
    while (index + direction >= 0 && index + direction < points.length) {
      var a = points[index], b = points[index + direction], length = distance(a, b);
      if (length > 0 && traveled + length >= target) {
        var t = (target - traveled) / length;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      traveled += length; index += direction;
    }
    return null;
  }
  function endpointTangent(points, fromEnd, windowLength) {
    var p = points[fromEnd ? points.length - 1 : 0];
    var half = pointAtDistance(points, fromEnd, windowLength / 2), full = pointAtDistance(points, fromEnd, windowLength);
    if (!half || !full) return null;
    var sign = fromEnd ? 1 : -1;
    var dx = sign * (3 * p.x - 4 * half.x + full.x) / windowLength;
    var dy = sign * (3 * p.y - 4 * half.y + full.y) / windowLength;
    var length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < 0.2 || length > 2) return null;
    return { x: dx / length, y: dy / length };
  }
  function sampleBridge(start, end, controls, segments) {
    return Array.from({ length: segments + 1 }, function (_, i) {
      if (!i) return point(start);
      if (i === segments) return point(end);
      var t = i / segments, u = 1 - t;
      return controls ? {
        x: u * u * u * start.x + 3 * u * u * t * controls[0].x + 3 * u * t * t * controls[1].x + t * t * t * end.x,
        y: u * u * u * start.y + 3 * u * u * t * controls[0].y + 3 * u * t * t * controls[1].y + t * t * t * end.y,
      } : { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };
    });
  }
  function complete(raw, mode, engine) {
    mode = mode == null ? "straight" : mode;
    if (mode !== "straight" && mode !== "tangent") throw new RangeError("Unknown drawing closure mode: " + mode);
    var input = inputPoints(raw), report = inspectPrepared(input, engine), points = input.points;
    var result = Object.assign({}, report, { points: points, bridge: [], applied: false, requestedMode: mode,
      usedMode: "none", syntheticPointCount: 0, controlPoints: null, tangents: null,
      continuity: "Synthetic bridge; captured points remain unchanged. Tangent mode matches estimated directions, not guaranteed C1 or C2 continuity." });
    if (!report.ready || report.alreadyClosed) return result;
    var start = points[points.length - 1], end = points[0], epsilon = Math.max(1e-9, report.radius * 1e-8);
    var clean = cleanConsecutive(points, epsilon);
    var spacing = Math.min(4, Math.max(0.75, TAU * report.radius / 240));
    var segments = Math.min(64, Math.max(2, Math.ceil(report.gap / spacing)));
    var bridge = sampleBridge(start, end, null, segments), usedMode = "straight", fallback = null;
    if (mode === "tangent" && report.gap > epsilon) {
      var windowLength = Math.min(0.15 * report.radius, Math.max(0.08 * report.radius, 0.75 * report.gap));
      var lastTangent = endpointTangent(clean, true, windowLength), firstTangent = endpointTangent(clean, false, windowLength);
      var cx = (end.x - start.x) / report.gap, cy = (end.y - start.y) / report.gap;
      if (!lastTangent || !firstTangent) fallback = "unstable-tangents";
      else if (lastTangent.x * cx + lastTangent.y * cy < 0.15 || firstTangent.x * cx + firstTangent.y * cy < 0.15) fallback = "backward-tangents";
      else {
        var handle = report.gap / 3;
        var controls = [{ x: start.x + lastTangent.x * handle, y: start.y + lastTangent.y * handle },
          { x: end.x - firstTangent.x * handle, y: end.y - firstTangent.y * handle }];
        var candidate = sampleBridge(start, end, controls, Math.min(64, Math.max(8, segments * 2)));
        if (!bridgeClear(candidate, clean, epsilon)) fallback = "crossing-tangent-bridge";
        else {
          usedMode = "tangent"; bridge = candidate;
          result.controlPoints = [point(start), controls[0], controls[1], point(end)];
          result.tangents = { start: lastTangent, end: firstTangent };
        }
      }
    }
    result.points = points.concat(bridge.slice(1).map(point));
    result.bridge = bridge;
    result.applied = true;
    result.usedMode = usedMode;
    result.syntheticPointCount = bridge.length - 1;
    result.reasonCode = fallback ? "fallback-" + fallback : "completed-" + usedMode;
    result.reason = fallback ? "Used a straight bridge because the endpoint-direction bridge was unstable or would cross the stroke." :
      usedMode === "tangent" ? "Joined with a bounded cubic following estimated endpoint directions." : "Joined with a straight segment.";
    return result;
  }
  return { inspect: inspect, complete: complete, RULES: RULES };
});
