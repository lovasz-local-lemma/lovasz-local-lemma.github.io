(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Roundness = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAU = Math.PI * 2;
  var DEFAULT_OPTIONS = Object.freeze({
    sampleCount: 240,
    smoothing: 1.5,
    maxHarmonic: 12,
  });

  function pointOf(value) {
    var x;
    var y;
    if (Array.isArray(value)) {
      x = Number(value[0]);
      y = Number(value[1]);
    } else if (value && typeof value === "object") {
      x = Number(value.x);
      y = Number(value.y);
    }
    return Number.isFinite(x) && Number.isFinite(y) ? { x: x, y: y } : null;
  }

  function copyPoints(points) {
    return points.map(function (p) {
      return { x: p.x, y: p.y };
    });
  }

  function sanitizePoints(rawPoints) {
    if (!Array.isArray(rawPoints)) return [];
    var result = [];
    for (var i = 0; i < rawPoints.length; i += 1) {
      var p = pointOf(rawPoints[i]);
      if (p) result.push(p);
    }
    return result;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function extent(points) {
    if (!points.length) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, diagonal: 0 };
    }
    var minX = points[0].x;
    var maxX = minX;
    var minY = points[0].y;
    var maxY = minY;
    for (var i = 1; i < points.length; i += 1) {
      minX = Math.min(minX, points[i].x);
      maxX = Math.max(maxX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxY = Math.max(maxY, points[i].y);
    }
    var width = maxX - minX;
    var height = maxY - minY;
    return {
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      width: width,
      height: height,
      diagonal: Math.hypot(width, height),
    };
  }

  function cleanPoints(points) {
    if (!points.length) return [];
    var box = extent(points);
    var epsilon = Math.max(1e-12, box.diagonal * 1e-9);
    var cleaned = [points[0]];
    for (var i = 1; i < points.length; i += 1) {
      if (distance(cleaned[cleaned.length - 1], points[i]) > epsilon) cleaned.push(points[i]);
    }
    // A repeated first point is useful input metadata, but not a useful zero-length segment.
    if (cleaned.length > 1 && distance(cleaned[0], cleaned[cleaned.length - 1]) <= epsilon) cleaned.pop();
    return copyPoints(cleaned);
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
  }

  function solve3(matrix, vector) {
    var a = [
      [matrix[0][0], matrix[0][1], matrix[0][2], vector[0]],
      [matrix[1][0], matrix[1][1], matrix[1][2], vector[1]],
      [matrix[2][0], matrix[2][1], matrix[2][2], vector[2]],
    ];
    var scale = 0;
    for (var r = 0; r < 3; r += 1) {
      for (var c = 0; c < 3; c += 1) scale = Math.max(scale, Math.abs(a[r][c]));
    }
    if (!(scale > 0)) return null;
    for (var col = 0; col < 3; col += 1) {
      var pivot = col;
      for (var row = col + 1; row < 3; row += 1) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }
      if (Math.abs(a[pivot][col]) <= scale * 1e-12) return null;
      if (pivot !== col) {
        var swap = a[pivot];
        a[pivot] = a[col];
        a[col] = swap;
      }
      for (row = col + 1; row < 3; row += 1) {
        var factor = a[row][col] / a[col][col];
        for (var k = col; k < 4; k += 1) a[row][k] -= factor * a[col][k];
      }
    }
    var x = [0, 0, 0];
    for (row = 2; row >= 0; row -= 1) {
      var rhs = a[row][3];
      for (col = row + 1; col < 3; col += 1) rhs -= a[row][col] * x[col];
      x[row] = rhs / a[row][row];
      if (!Number.isFinite(x[row])) return null;
    }
    return x;
  }

  function circleFit(points) {
    var invalid = { cx: null, cy: null, r: null, valid: false, iterations: 0, rms: null };
    if (points.length < 3) return invalid;

    var mx = 0;
    var my = 0;
    for (var i = 0; i < points.length; i += 1) {
      mx += points[i].x;
      my += points[i].y;
    }
    mx /= points.length;
    my /= points.length;

    var scale2 = 0;
    var covXX = 0;
    var covXY = 0;
    var covYY = 0;
    for (i = 0; i < points.length; i += 1) {
      var ux = points[i].x - mx;
      var uy = points[i].y - my;
      scale2 += ux * ux + uy * uy;
      covXX += ux * ux;
      covXY += ux * uy;
      covYY += uy * uy;
    }
    var coordinateScale = Math.sqrt(scale2 / points.length);
    var determinant = covXX * covYY - covXY * covXY;
    if (!(coordinateScale > 1e-14) || determinant <= (covXX + covYY) * (covXX + covYY) * 1e-12) {
      return invalid;
    }

    // Algebraic least-squares initialization in centered, scaled coordinates.
    var normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    var rhs = [0, 0, 0];
    var normalized = [];
    for (i = 0; i < points.length; i += 1) {
      var x = (points[i].x - mx) / coordinateScale;
      var y = (points[i].y - my) / coordinateScale;
      var q = x * x + y * y;
      normalized.push({ x: x, y: y });
      normal[0][0] += x * x;
      normal[0][1] += x * y;
      normal[0][2] += x;
      normal[1][0] += x * y;
      normal[1][1] += y * y;
      normal[1][2] += y;
      normal[2][0] += x;
      normal[2][1] += y;
      normal[2][2] += 1;
      rhs[0] += x * q;
      rhs[1] += y * q;
      rhs[2] += q;
    }
    var algebraic = solve3(normal, rhs);
    var cx = algebraic ? algebraic[0] * 0.5 : 0;
    var cy = algebraic ? algebraic[1] * 0.5 : 0;
    var radiusSquared = algebraic ? algebraic[2] + cx * cx + cy * cy : 0;
    var radius = radiusSquared > 0 ? Math.sqrt(radiusSquared) : 0;
    if (!(radius > 0)) {
      for (i = 0; i < normalized.length; i += 1) radius += Math.hypot(normalized[i].x, normalized[i].y);
      radius /= normalized.length;
    }

    // Geometric radial least squares, refined by damped Gauss-Newton.
    var iterations = 0;
    for (iterations = 0; iterations < 30; iterations += 1) {
      var jtj = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      var jtr = [0, 0, 0];
      for (i = 0; i < normalized.length; i += 1) {
        var dx = normalized[i].x - cx;
        var dy = normalized[i].y - cy;
        var d = Math.hypot(dx, dy);
        if (!(d > 1e-12)) continue;
        var residual = d - radius;
        var jacobian = [-dx / d, -dy / d, -1];
        for (var a = 0; a < 3; a += 1) {
          jtr[a] += jacobian[a] * residual;
          for (var b = 0; b < 3; b += 1) jtj[a][b] += jacobian[a] * jacobian[b];
        }
      }
      for (a = 0; a < 3; a += 1) jtj[a][a] += 1e-10 * normalized.length;
      var delta = solve3(jtj, [-jtr[0], -jtr[1], -jtr[2]]);
      if (!delta) break;
      cx += delta[0];
      cy += delta[1];
      radius += delta[2];
      if (!(radius > 1e-12) || !Number.isFinite(cx + cy + radius)) return invalid;
      if (Math.hypot(delta[0], delta[1], delta[2]) < 1e-11) break;
    }

    var sumSquared = 0;
    for (i = 0; i < normalized.length; i += 1) {
      var radialError = Math.hypot(normalized[i].x - cx, normalized[i].y - cy) - radius;
      sumSquared += radialError * radialError;
    }
    return {
      cx: mx + cx * coordinateScale,
      cy: my + cy * coordinateScale,
      r: radius * coordinateScale,
      valid: true,
      iterations: iterations + 1,
      rms: Math.sqrt(sumSquared / normalized.length) * coordinateScale,
    };
  }

  function resampleClosed(points, count) {
    if (points.length < 2 || count < 2) return copyPoints(points);
    var lengths = [];
    var total = 0;
    for (var i = 0; i < points.length; i += 1) {
      var length = distance(points[i], points[(i + 1) % points.length]);
      lengths.push(length);
      total += length;
    }
    if (!(total > 1e-14)) return copyPoints(points);
    var result = [];
    var segment = 0;
    var segmentStart = 0;
    for (var sample = 0; sample < count; sample += 1) {
      var target = total * sample / count;
      while (segment < lengths.length - 1 && segmentStart + lengths[segment] < target) {
        segmentStart += lengths[segment];
        segment += 1;
      }
      var a = points[segment];
      var b = points[(segment + 1) % points.length];
      var t = lengths[segment] > 0 ? (target - segmentStart) / lengths[segment] : 0;
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return result;
  }

  function resampleOpen(points, count) {
    if (points.length < 2 || count < 2) return copyPoints(points);
    var lengths = [];
    var total = 0;
    for (var i = 0; i < points.length - 1; i += 1) {
      var length = distance(points[i], points[i + 1]);
      lengths.push(length);
      total += length;
    }
    if (!(total > 1e-14)) return copyPoints(points);
    var result = [];
    var segment = 0;
    var segmentStart = 0;
    for (var sample = 0; sample < count; sample += 1) {
      var target = total * sample / (count - 1);
      while (segment < lengths.length - 1 && segmentStart + lengths[segment] < target) {
        segmentStart += lengths[segment];
        segment += 1;
      }
      var a = points[segment];
      var b = points[segment + 1];
      var t = lengths[segment] > 0 ? (target - segmentStart) / lengths[segment] : 0;
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return result;
  }

  function gaussianSmoothClosed(points, sigma) {
    if (points.length < 3 || !(sigma > 0.05)) return copyPoints(points);
    var radius = Math.min(Math.floor((points.length - 1) / 2), Math.max(1, Math.ceil(sigma * 3)));
    var weights = [];
    var weightSum = 0;
    for (var offset = -radius; offset <= radius; offset += 1) {
      var weight = Math.exp(-0.5 * offset * offset / (sigma * sigma));
      weights.push(weight);
      weightSum += weight;
    }
    var result = [];
    for (var i = 0; i < points.length; i += 1) {
      var x = 0;
      var y = 0;
      for (offset = -radius; offset <= radius; offset += 1) {
        var index = (i + offset + points.length) % points.length;
        weight = weights[offset + radius] / weightSum;
        x += points[index].x * weight;
        y += points[index].y * weight;
      }
      result.push({ x: x, y: y });
    }
    return result;
  }

  function gaussianSmoothOpen(points, sigma) {
    if (points.length < 3 || !(sigma > 0.05)) return copyPoints(points);
    var radius = Math.min(points.length - 1, Math.max(1, Math.ceil(sigma * 3)));
    var result = [];
    for (var i = 0; i < points.length; i += 1) {
      var x = 0;
      var y = 0;
      var weightSum = 0;
      for (var offset = -radius; offset <= radius; offset += 1) {
        var index = i + offset;
        if (index < 0 || index >= points.length) continue;
        var weight = Math.exp(-0.5 * offset * offset / (sigma * sigma));
        x += points[index].x * weight;
        y += points[index].y * weight;
        weightSum += weight;
      }
      result.push({ x: x / weightSum, y: y / weightSum });
    }
    return result;
  }

  function signedArea(points) {
    if (points.length < 3) return 0;
    var twiceArea = 0;
    for (var i = 0; i < points.length; i += 1) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      twiceArea += a.x * b.y - b.x * a.y;
    }
    return twiceArea * 0.5;
  }

  function closedPerimeter(points) {
    var result = 0;
    for (var i = 0; i < points.length; i += 1) result += distance(points[i], points[(i + 1) % points.length]);
    return result;
  }

  function normalizedCurvature(points, referenceRadius) {
    if (points.length < 3 || !(referenceRadius > 0)) return [];
    var orientationSign = signedArea(points) < 0 ? -1 : 1;
    var result = [];
    for (var i = 0; i < points.length; i += 1) {
      var a = points[(i - 1 + points.length) % points.length];
      var b = points[i];
      var c = points[(i + 1) % points.length];
      var ab = distance(a, b);
      var bc = distance(b, c);
      var ca = distance(c, a);
      var denominator = ab * bc * ca;
      if (!(denominator > 1e-18)) {
        result.push(0);
        continue;
      }
      var cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      result.push(orientationSign * referenceRadius * 2 * cross / denominator);
    }
    return result;
  }

  function normalizedCurvatureOpen(points, referenceRadius) {
    if (points.length < 3 || !(referenceRadius > 0)) return [];
    var turning = 0;
    for (var j = 1; j < points.length - 1; j += 1) {
      turning += (points[j].x - points[j - 1].x) * (points[j + 1].y - points[j - 1].y) -
        (points[j].y - points[j - 1].y) * (points[j + 1].x - points[j - 1].x);
    }
    var orientationSign = turning < 0 ? -1 : 1;
    var result = new Array(points.length).fill(0);
    for (var i = 1; i < points.length - 1; i += 1) {
      var a = points[i - 1];
      var b = points[i];
      var c = points[i + 1];
      var ab = distance(a, b);
      var bc = distance(b, c);
      var ca = distance(c, a);
      var denominator = ab * bc * ca;
      if (!(denominator > 1e-18)) continue;
      var cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      result[i] = orientationSign * referenceRadius * 2 * cross / denominator;
    }
    result[0] = result[1];
    result[result.length - 1] = result[result.length - 2];
    return result;
  }

  function angularCoverage(points, fit) {
    if (!fit.valid || points.length < 2) return 0;
    var angles = points.map(function (p) {
      var angle = Math.atan2(p.y - fit.cy, p.x - fit.cx);
      return angle < 0 ? angle + TAU : angle;
    }).sort(function (a, b) { return a - b; });
    var maxGap = 0;
    for (var i = 1; i < angles.length; i += 1) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
    maxGap = Math.max(maxGap, angles[0] + TAU - angles[angles.length - 1]);
    return Math.max(0, Math.min(100, (1 - maxGap / TAU) * 100));
  }

  function angularResidualProfile(points, fit, count) {
    var angles = [];
    var values = [];
    if (!fit.valid || !(fit.r > 0) || !points.length) return { anglesRad: angles, residualPct: values };
    var pairs = points.map(function (p) {
      var dx = p.x - fit.cx;
      var dy = p.y - fit.cy;
      var angle = Math.atan2(dy, dx);
      if (angle < 0) angle += TAU;
      return { angle: angle, value: (Math.hypot(dx, dy) - fit.r) / fit.r * 100 };
    }).sort(function (a, b) { return a.angle - b.angle; });

    // Merge samples that share effectively the same polar angle.
    var unique = [];
    for (var i = 0; i < pairs.length; i += 1) {
      var previous = unique[unique.length - 1];
      if (previous && Math.abs(previous.angle - pairs[i].angle) < 1e-10) {
        previous.valueSum += pairs[i].value;
        previous.count += 1;
        previous.value = previous.valueSum / previous.count;
      } else {
        unique.push({ angle: pairs[i].angle, value: pairs[i].value, valueSum: pairs[i].value, count: 1 });
      }
    }
    if (unique.length === 1) {
      for (i = 0; i < count; i += 1) {
        angles.push(TAU * i / count);
        values.push(unique[0].value);
      }
      return { anglesRad: angles, residualPct: values };
    }
    for (i = 0; i < count; i += 1) {
      var target = TAU * i / count;
      angles.push(target);
      var lo = 0;
      var hi = unique.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (unique[mid].angle < target) lo = mid + 1;
        else hi = mid;
      }
      var upperIndex = lo % unique.length;
      var lowerIndex = (lo - 1 + unique.length) % unique.length;
      var lowerAngle = unique[lowerIndex].angle;
      var upperAngle = unique[upperIndex].angle;
      var adjustedTarget = target;
      if (lo === 0) {
        adjustedTarget += TAU;
        upperAngle += TAU;
      } else if (lo === unique.length) {
        upperAngle += TAU;
      }
      var span = upperAngle - lowerAngle;
      var t = span > 0 ? (adjustedTarget - lowerAngle) / span : 0;
      values.push(unique[lowerIndex].value * (1 - t) + unique[upperIndex].value * t);
    }
    return { anglesRad: angles, residualPct: values };
  }

  function harmonicAnalysis(values, maxMode) {
    var result = [];
    if (!values.length) return result;
    for (var mode = 1; mode <= maxMode; mode += 1) {
      var cosine = 0;
      var sine = 0;
      for (var i = 0; i < values.length; i += 1) {
        var angle = TAU * i / values.length;
        cosine += values[i] * Math.cos(mode * angle);
        sine += values[i] * Math.sin(mode * angle);
      }
      cosine *= 2 / values.length;
      sine *= 2 / values.length;
      var amplitude = Math.hypot(cosine, sine);
      result.push({
        mode: mode,
        cosinePct: cosine,
        sinePct: sine,
        a: cosine,
        b: sine,
        amplitudePct: amplitude,
        amplitude: amplitude,
        phaseRad: Math.atan2(sine, cosine),
      });
    }
    return result;
  }

  function zoneAt(points, cx, cy) {
    var inner = Infinity;
    var outer = -Infinity;
    for (var i = 0; i < points.length; i += 1) {
      var radial = Math.hypot(points[i].x - cx, points[i].y - cy);
      inner = Math.min(inner, radial);
      outer = Math.max(outer, radial);
    }
    return { cx: cx, cy: cy, inner: inner, outer: outer, width: outer - inner };
  }

  function minimumZone(points, fit) {
    var invalid = { cx: null, cy: null, inner: null, outer: null, width: null, valid: false };
    if (!fit.valid || points.length < 3) return invalid;
    var box = extent(points);
    var seeds = [
      { x: fit.cx, y: fit.cy },
      { x: (box.minX + box.maxX) * 0.5, y: (box.minY + box.maxY) * 0.5 },
    ];
    var directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2],
      [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
    ];
    var best = null;
    for (var seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
      var current = zoneAt(points, seeds[seedIndex].x, seeds[seedIndex].y);
      var step = Math.max(fit.r, box.diagonal * 0.5, 1e-9) * 0.1;
      var tolerance = Math.max(fit.r, box.diagonal, 1) * 1e-8;
      for (var iteration = 0; iteration < 120 && step > tolerance; iteration += 1) {
        var candidateBest = current;
        for (var d = 0; d < directions.length; d += 1) {
          var candidate = zoneAt(
            points,
            current.cx + directions[d][0] * step,
            current.cy + directions[d][1] * step
          );
          if (candidate.width < candidateBest.width - tolerance * 0.01) candidateBest = candidate;
        }
        if (candidateBest === current) step *= 0.5;
        else current = candidateBest;
      }
      if (!best || current.width < best.width) best = current;
    }
    best.valid = true;
    return best;
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

  function isSelfIntersecting(points, closed) {
    if (points.length < 4) return false;
    // Bound quadratic work for extremely dense pointer traces while retaining their shape.
    var stride = Math.max(1, Math.ceil(points.length / 700));
    var sampled = stride === 1 ? points : points.filter(function (_, index) { return index % stride === 0; });
    var edgeCount = closed ? sampled.length : sampled.length - 1;
    var box = extent(sampled);
    var epsilon = Math.max(1e-12, box.diagonal * box.diagonal * 1e-12);
    for (var i = 0; i < edgeCount; i += 1) {
      var iNext = (i + 1) % sampled.length;
      for (var j = i + 1; j < edgeCount; j += 1) {
        var jNext = (j + 1) % sampled.length;
        if (i === j || iNext === j || jNext === i) continue;
        if (closed && i === 0 && jNext === 0) continue;
        if (segmentsIntersect(sampled[i], sampled[iNext], sampled[j], sampled[jNext], epsilon)) return true;
      }
    }
    return false;
  }

  function quantile(sortedValues, probability) {
    if (!sortedValues.length) return null;
    var position = (sortedValues.length - 1) * probability;
    var lower = Math.floor(position);
    var fraction = position - lower;
    return sortedValues[lower] * (1 - fraction) + sortedValues[Math.min(lower + 1, sortedValues.length - 1)] * fraction;
  }

  function emptyResult(raw, cleaned, sampleCount, smoothing) {
    var validity = {
      valid: false,
      enoughPoints: false,
      fitValid: false,
      isClosed: false,
      open: true,
      selfIntersecting: false,
      areaValid: false,
      compactnessValid: false,
      curvatureValid: false,
    };
    var metrics = {
      rmsPct: null,
      p95Pct: null,
      peakToValleyPct: null,
      zonePct: null,
      compactness: null,
      curvatureRms: null,
      closureGapPct: null,
      coveragePct: 0,
      measuredCoveragePct: 0,
      valid: false,
      isClosed: false,
      selfIntersecting: false,
      areaValid: false,
      compactnessValid: false,
      validity: validity,
    };
    var profiles = { anglesRad: [], residualPct: [], curvatureRaw: [], curvatureSmoothed: [] };
    return {
      options: { sampleCount: sampleCount, smoothing: smoothing, maxHarmonic: 12 },
      rawPoints: copyPoints(raw),
      cleanedPoints: copyPoints(cleaned),
      resampledPoints: [],
      smoothedPoints: [],
      points: { raw: copyPoints(raw), cleaned: copyPoints(cleaned), resampled: [], smoothed: [] },
      fit: { cx: null, cy: null, r: null, valid: false, iterations: 0, rms: null },
      profiles: profiles,
      anglesRad: profiles.anglesRad,
      residualProfile: profiles.residualPct,
      curvatureProfiles: { raw: profiles.curvatureRaw, smoothed: profiles.curvatureSmoothed },
      harmonics: [],
      minimumZone: { cx: null, cy: null, inner: null, outer: null, width: null, valid: false },
      minZone: null,
      geometry: { area: null, signedArea: null, perimeter: null },
      metrics: metrics,
      validity: validity,
    };
  }

  function analyze(rawPoints, options) {
    options = options || {};
    var sampleCount = Math.max(16, Math.min(4096, Math.round(Number(options.sampleCount) || DEFAULT_OPTIONS.sampleCount)));
    var smoothingValue = options.smoothingSigma != null ? options.smoothingSigma : options.smoothing;
    var smoothing = smoothingValue == null ? DEFAULT_OPTIONS.smoothing : Math.max(0, Math.min(sampleCount / 4, Number(smoothingValue) || 0));
    var maxHarmonic = Math.max(12, Math.round(Number(options.maxHarmonic) || DEFAULT_OPTIONS.maxHarmonic));
    var raw = sanitizePoints(rawPoints);
    var cleaned = cleanPoints(raw);
    if (cleaned.length < 3) return emptyResult(raw, cleaned, sampleCount, smoothing);

    var provisionalFit = circleFit(cleaned);
    if (!provisionalFit.valid) return emptyResult(raw, cleaned, sampleCount, smoothing);
    var rawEndpointGap = raw.length > 1 ? distance(raw[0], raw[raw.length - 1]) : Infinity;
    var stepLengths = [];
    for (var i = 1; i < raw.length; i += 1) {
      var stepLength = distance(raw[i - 1], raw[i]);
      if (stepLength > Math.max(1e-12, provisionalFit.r * 1e-10)) stepLengths.push(stepLength);
    }
    var typicalStep = median(stepLengths);
    var estimatedCoveragePct = angularCoverage(cleaned, provisionalFit);
    var explicitClosure = rawEndpointGap <= Math.max(1e-12, provisionalFit.r * 1e-8);
    var closureAllowance = Math.max(typicalStep * 4, provisionalFit.r * 0.25);
    // Interactive capture supplies an explicit, disclosed bridge. Its rejected
    // strokes must not be silently reclosed by the legacy imported-path heuristic.
    var closureMode = options.closureMode === "explicit" ? "explicit" : "auto";
    var isClosed = explicitClosure || (closureMode === "auto" && rawEndpointGap <= closureAllowance && estimatedCoveragePct >= 60);
    var coveragePct = isClosed ? 100 : estimatedCoveragePct;
    var selfIntersecting = isSelfIntersecting(cleaned, isClosed);

    var resampled = isClosed ? resampleClosed(cleaned, sampleCount) : resampleOpen(cleaned, sampleCount);
    var smoothed = isClosed ? gaussianSmoothClosed(resampled, smoothing) : gaussianSmoothOpen(resampled, smoothing);
    var fit = circleFit(smoothed);
    if (!fit.valid) return emptyResult(raw, cleaned, sampleCount, smoothing);
    // Normalize each curvature trace by its own best-fit scale so the raw trace
    // remains stable while the smoothing control changes.
    var rawFit = circleFit(resampled);
    var curvatureRaw = isClosed ?
      normalizedCurvature(resampled, rawFit.valid ? rawFit.r : fit.r) :
      normalizedCurvatureOpen(resampled, rawFit.valid ? rawFit.r : fit.r);
    var curvatureSmoothed = isClosed ?
      normalizedCurvature(smoothed, fit.r) :
      normalizedCurvatureOpen(smoothed, fit.r);
    var radialProfile = isClosed ? angularResidualProfile(smoothed, fit, sampleCount) :
      { anglesRad: [], residualPct: [] };
    var harmonics = isClosed ? harmonicAnalysis(radialProfile.residualPct, maxHarmonic).slice(0, 12) : [];
    var zone = minimumZone(smoothed, fit);

    var residuals = radialProfile.residualPct;
    if (!isClosed) {
      residuals = smoothed.map(function (p) {
        return (Math.hypot(p.x - fit.cx, p.y - fit.cy) - fit.r) / fit.r * 100;
      });
    }
    var sumSquares = 0;
    var minimumResidual = Infinity;
    var maximumResidual = -Infinity;
    var absolutes = [];
    for (i = 0; i < residuals.length; i += 1) {
      sumSquares += residuals[i] * residuals[i];
      minimumResidual = Math.min(minimumResidual, residuals[i]);
      maximumResidual = Math.max(maximumResidual, residuals[i]);
      absolutes.push(Math.abs(residuals[i]));
    }
    // Angular interpolation is ideal for plots/DFT, but can miss a narrow extremum.
    var measuredMinimumResidual = Infinity;
    var measuredMaximumResidual = -Infinity;
    for (i = 0; i < smoothed.length; i += 1) {
      var measuredResidual = (Math.hypot(smoothed[i].x - fit.cx, smoothed[i].y - fit.cy) - fit.r) / fit.r * 100;
      measuredMinimumResidual = Math.min(measuredMinimumResidual, measuredResidual);
      measuredMaximumResidual = Math.max(measuredMaximumResidual, measuredResidual);
    }
    absolutes.sort(function (a, b) { return a - b; });
    var curvatureErrorSquares = 0;
    for (i = 0; i < curvatureSmoothed.length; i += 1) {
      var curvatureError = curvatureSmoothed[i] - 1;
      curvatureErrorSquares += curvatureError * curvatureError;
    }

    var areaSigned = signedArea(smoothed);
    var perimeter = closedPerimeter(smoothed);
    var enoughPoints = cleaned.length >= 5;
    var areaValid = enoughPoints && isClosed && !selfIntersecting && Math.abs(areaSigned) > 1e-14 && perimeter > 1e-14;
    var compactness = areaValid ? Math.max(0, Math.min(1, 4 * Math.PI * Math.abs(areaSigned) / (perimeter * perimeter))) : null;
    var validity = {
      valid: enoughPoints && fit.valid && isClosed && !selfIntersecting,
      enoughPoints: enoughPoints,
      fitValid: fit.valid,
      isClosed: isClosed,
      open: !isClosed,
      selfIntersecting: selfIntersecting,
      areaValid: areaValid,
      compactnessValid: areaValid,
      curvatureValid: enoughPoints && curvatureSmoothed.length === sampleCount,
    };
    var metrics = {
      rmsPct: residuals.length ? Math.sqrt(sumSquares / residuals.length) : null,
      p95Pct: quantile(absolutes, 0.95),
      peakToValleyPct: smoothed.length ? measuredMaximumResidual - measuredMinimumResidual :
        (residuals.length ? maximumResidual - minimumResidual : null),
      zonePct: zone.valid ? zone.width / ((zone.inner + zone.outer) * 0.5) * 100 : null,
      compactness: compactness,
      curvatureRms: curvatureSmoothed.length ? Math.sqrt(curvatureErrorSquares / curvatureSmoothed.length) : null,
      closureGapPct: fit.r > 0 && Number.isFinite(rawEndpointGap) ? rawEndpointGap / fit.r * 100 : null,
      coveragePct: coveragePct,
      measuredCoveragePct: estimatedCoveragePct,
      valid: validity.valid,
      isClosed: isClosed,
      selfIntersecting: selfIntersecting,
      areaValid: areaValid,
      compactnessValid: areaValid,
      validity: validity,
    };
    var profiles = {
      anglesRad: radialProfile.anglesRad,
      residualPct: isClosed ? residuals : [],
      curvatureRaw: curvatureRaw,
      curvatureSmoothed: curvatureSmoothed,
    };
    var pointGroups = {
      raw: copyPoints(raw),
      cleaned: copyPoints(cleaned),
      resampled: copyPoints(resampled),
      smoothed: copyPoints(smoothed),
    };
    return {
      options: { sampleCount: sampleCount, smoothing: smoothing, maxHarmonic: 12, closureMode: closureMode },
      rawPoints: pointGroups.raw,
      cleanedPoints: pointGroups.cleaned,
      resampledPoints: pointGroups.resampled,
      smoothedPoints: pointGroups.smoothed,
      points: pointGroups,
      fit: fit,
      profiles: profiles,
      anglesRad: profiles.anglesRad,
      residualProfile: profiles.residualPct,
      curvatureProfiles: { raw: profiles.curvatureRaw, smoothed: profiles.curvatureSmoothed },
      harmonics: harmonics,
      minimumZone: zone,
      minZone: zone,
      geometry: { area: areaValid ? Math.abs(areaSigned) : null, signedArea: areaValid ? areaSigned : null, perimeter: perimeter },
      metrics: metrics,
      validity: validity,
    };
  }

  return {
    analyze: analyze,
    cleanPoints: function (points) { return cleanPoints(sanitizePoints(points)); },
    resampleClosed: function (points, count) {
      return resampleClosed(cleanPoints(sanitizePoints(points)), Math.max(3, Math.round(Number(count) || DEFAULT_OPTIONS.sampleCount)));
    },
    gaussianSmoothClosed: function (points, sigma) {
      return gaussianSmoothClosed(sanitizePoints(points), Math.max(0, Number(sigma) || 0));
    },
    fitCircle: function (points) { return circleFit(sanitizePoints(points)); },
    normalizedCurvature: function (points, radius) { return normalizedCurvature(sanitizePoints(points), Number(radius)); },
    harmonicAnalysis: harmonicAnalysis,
    approximateMinimumZone: function (points, fit) { return minimumZone(sanitizePoints(points), fit || circleFit(sanitizePoints(points))); },
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
  };
});
