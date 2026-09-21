(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessCaptureReturn = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var TAU = Math.PI * 2;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function copyInput(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(function (p) {
      return p && Number.isFinite(Array.isArray(p) ? p[0] : p.x) && Number.isFinite(Array.isArray(p) ? p[1] : p.y);
    }).map(function (p) { return { x: Array.isArray(p) ? p[0] : p.x, y: Array.isArray(p) ? p[1] : p.y }; });
  }
  function angleStep(a, b, fit) {
    var ax = a.x - fit.cx, ay = a.y - fit.cy, bx = b.x - fit.cx, by = b.y - fit.cy;
    return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  function prepare(input, engine, closure) {
    if (!engine || typeof engine.fitCircle !== "function" || !closure || typeof closure.inspect !== "function")
      throw new Error("Roundness and drawing-closure inspection APIs are required.");
    var points = copyInput(input), count = points.length;
    var originalGap = count > 1 ? distance(points[0], points[count - 1]) : null;
    var result = { points: points, trimmed: false, removedPointCount: 0, removedLength: 0,
      cutIndex: null, cutFraction: null, interpolatedCut: false, originalGap: originalGap, usedGap: originalGap,
      inputPointCount: count, radius: null, proximityLimit: null, maximumTailLength: null,
      reasonCode: "insufficient-input", coordinateUnit: "drawing units" };
    result.sourcePointCount = Array.isArray(input) ? input.length : 0;
    result.discardedPointCount = result.sourcePointCount - count;
    if (result.discardedPointCount) { result.reasonCode = "invalid-input"; return result; }
    if (count < 24) return result;
    var fit = engine.fitCircle(points);
    if (!fit.valid || !(fit.r > 0)) { result.reasonCode = "invalid-scale"; return result; }
    result.radius = fit.r;
    // The closure inspector is authoritative; this bound only limits the search.
    // Its present allowance is clamp(.25 R, 10, 36). The accepted prefix is
    // checked again against inspect(prefix).allowance below.
    var rules = closure.RULES || { radiusFraction: 0.25, minimumAllowance: 10, maximumAllowance: 36 };
    var tailLimit = clamp(fit.r * rules.radiusFraction, rules.minimumAllowance, rules.maximumAllowance);
    var proximity = clamp(fit.r * 0.08, 3, 8);
    result.maximumTailLength = tailLimit; result.proximityLimit = proximity;
    if (originalGap <= Math.max(1e-8, fit.r * 1e-8)) { result.reasonCode = "already-at-start"; return result; }
    var lengths = [0], angles = [0], absoluteTurn = 0;
    for (var i = 1; i < count; i += 1) {
      lengths[i] = lengths[i - 1] + distance(points[i - 1], points[i]);
      var delta = angleStep(points[i - 1], points[i], fit);
      angles[i] = angles[i - 1] + delta;
      absoluteTurn += Math.abs(delta);
    }
    var totalLength = lengths[count - 1], netTurn = angles[count - 1], direction = Math.sign(netTurn);
    result.netTurns = netTurn / TAU;
    // No global minimum search, repeated lap, or materially reversing stroke.
    if (Math.abs(netTurn) < TAU + 0.005 || Math.abs(netTurn) > TAU + 0.4 || absoluteTurn - Math.abs(netTurn) > 0.15) {
      result.reasonCode = "not-a-short-first-return"; return result;
    }
    var start = points[0], best = null;
    for (i = count - 2; i >= 0 && totalLength - lengths[i + 1] <= tailLimit; i -= 1) {
      var a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y;
      var segmentLength = lengths[i + 1] - lengths[i];
      if (segmentLength <= 1e-12) continue;
      var earliest = clamp((totalLength - tailLimit - lengths[i]) / segmentLength, 0, 1);
      var fraction = clamp(((start.x - a.x) * dx + (start.y - a.y) * dy) / (segmentLength * segmentLength), earliest, 1);
      var cut = { x: a.x + fraction * dx, y: a.y + fraction * dy }, gap = distance(start, cut);
      if (!best || gap < best.gap) best = { index: i, fraction: fraction, point: cut, gap: gap,
        length: totalLength - lengths[i] - fraction * segmentLength,
        turn: angles[i] + angleStep(a, cut, fit) };
    }
    if (!best || best.gap > proximity || best.length < Math.max(0.5, fit.r * 0.005) ||
        originalGap - best.gap < Math.max(0.4, fit.r * 0.004) || best.gap > originalGap * 0.5) {
      result.reasonCode = "no-clear-return-minimum"; return result;
    }
    if (Math.abs(Math.abs(best.turn) - TAU) > 0.12) { result.reasonCode = "ambiguous-return"; return result; }
    // A deliberate reversal is not a late-release overshoot. A tiny amount of
    // subpixel angular noise is allowed; it never changes the cut location.
    var backwards = 0, previous = best.point;
    for (i = best.index + 1; i < count; i += 1) {
      if (distance(points[i], start) > tailLimit) { result.reasonCode = "tail-left-return-zone"; return result; }
      backwards += Math.max(0, -direction * angleStep(previous, points[i], fit));
      previous = points[i];
    }
    if (backwards > 0.003) { result.reasonCode = "reversing-tail"; return result; }
    var prefix = points.slice(0, best.index + 1);
    if (best.fraction > 1e-9) prefix.push({ x: best.point.x, y: best.point.y });
    var check = closure.inspect(prefix, engine);
    if (!check.ready || !(check.allowance >= best.length)) { result.reasonCode = "prefix-not-ready"; return result; }
    result.points = prefix;
    result.trimmed = true;
    // cutIndex/fraction refer to the sanitized capture segment [index,index+1].
    // A fractional cut removes its original endpoint, replacing it with the
    // interpolation on that captured segment, not a fitted-circle projection.
    result.cutIndex = best.index; result.cutFraction = best.fraction;
    result.interpolatedCut = best.fraction > 1e-9 && best.fraction < 1 - 1e-9;
    var retainedOriginal = best.index + 1 + (best.fraction >= 1 - 1e-9 ? 1 : 0);
    result.removedPointCount = count - retainedOriginal;
    result.removedLength = best.length;
    result.usedGap = distance(prefix[prefix.length - 1], start);
    result.reasonCode = "short-terminal-overshoot";
    return result;
  }
  return { prepare: prepare };
});
