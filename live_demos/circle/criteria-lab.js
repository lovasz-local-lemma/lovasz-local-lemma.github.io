(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessCriteriaLab = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var TAU = 2 * Math.PI;
  var BASELINE_HALF_ERROR = 10;
  var MAX_INPUT = 1024;
  var instanceCount = 0;
  var PRESETS = Object.freeze({
    radial: { label: "Controlled radial family", amplitude: 0.045, frequency: 5,
      insight: "At fixed amplitude, increasing frequency leaves the radial deviation unchanged while the bends become sharper." },
    circle: { label: "Circle", amplitude: 0, frequency: 2,
      insight: "A small circle is still a circle. Size can affect measurement evidence without changing mathematical roundness." },
    ellipse: { label: "Ellipse", amplitude: 0.24, frequency: 2,
      insight: "A better-fitting circle cannot remove elongation. Several criteria agree that the shape is noncircular." },
    dent: { label: "Narrow dent", amplitude: 0.28, frequency: 5,
      insight: "An isolated dent occupies little of the boundary. RMS averages it away more than zone width or local curvature do." },
    lobed: { label: "Six-lobed contour", amplitude: 0.08, frequency: 6,
      insight: "A small positional error can have a large derivative. Curvature notices what a radial average can overlook." },
    noisy: { label: "Fine wobble · modes 17 + 29", amplitude: 0.014, frequency: 5,
      insight: "These ripples lie above the harmonic score’s inspected modes 2–12. A good harmonic component is not proof that every oscillation is absent; curvature and smoothing expose a different part of the shape." },
    arc: { label: "Partial circle · 240°", amplitude: 0, frequency: 2,
      insight: "The surviving arc fits a circle very well. A radial residual alone cannot establish a complete closed boundary." },
    user: { label: "Your contour · analyzed copy", amplitude: 0.045, frequency: 5,
      insight: "A scaled copy of the analyzed contour, including any disclosed gap completion above. Its dimensionless geometry should stay constant as its coordinate size changes." }
  });
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function number(value, fallback) { var n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function settings(options) {
    options = options || {};
    var kind = Object.prototype.hasOwnProperty.call(PRESETS, options.kind) ? options.kind : "radial";
    var preset = PRESETS[kind];
    return { kind: kind, radius: clamp(number(options.radius, 100), 0.0001, 10000),
      amplitude: clamp(number(options.amplitude, preset.amplitude), 0, 0.32),
      frequency: clamp(Math.round(number(options.frequency, preset.frequency)), 2, 12),
      count: clamp(Math.round(number(options.count, 480)), 96, MAX_INPUT) };
  }
  // q = r/R. The derivatives below are with respect to theta, not arc length.
  // r > 0 throughout the allowed family, so its polar curvature is finite.
  function radialSample(theta, options) {
    var o = settings(options), t = number(theta, 0), a = o.amplitude, n = o.frequency;
    var q = 1 + a * Math.cos(n * t), dq = -a * n * Math.sin(n * t);
    var ddq = -a * n * n * Math.cos(n * t);
    var normalizedCurvature = (q * q + 2 * dq * dq - q * ddq) / Math.pow(q * q + dq * dq, 1.5);
    return { theta: t, radius: o.radius * q, radialResidual: q - 1,
      radialDerivative: o.radius * dq, radialSecondDerivative: o.radius * ddq,
      normalizedCurvature: normalizedCurvature, curvature: normalizedCurvature / o.radius };
  }
  function boundedPoints(raw) {
    var clean = [];
    if (Array.isArray(raw)) raw.forEach(function (p) {
      var x = p && (Array.isArray(p) ? p[0] : p.x), y = p && (Array.isArray(p) ? p[1] : p.y);
      if (Number.isFinite(x) && Number.isFinite(y)) clean.push({ x: x, y: y });
    });
    var sourceCount = clean.length;
    if (clean.length > MAX_INPUT) {
      var original = clean;
      clean = Array.from({ length: MAX_INPUT }, function (_, i) {
        return original[Math.round(i * (original.length - 1) / (MAX_INPUT - 1))];
      });
    }
    return { points: clean, sourceCount: sourceCount, subsampled: sourceCount > MAX_INPUT };
  }
  function generateContour(options) {
    var o = settings(options), points = [], closed = o.kind !== "arc";
    if (o.kind === "user") throw new Error("Use evaluate with rawPoints for the user contour.");
    for (var i = 0; i < o.count; i += 1) {
      var t = (closed ? i / o.count * TAU : i / (o.count - 1) * TAU * 2 / 3) - Math.PI;
      var r = o.radius;
      if (o.kind === "radial" || o.kind === "lobed") r = radialSample(t, o).radius;
      if (o.kind === "noisy") r *= 1 + o.amplitude * Math.sin(17 * t + 0.2) + o.amplitude * (4 / 7) * Math.sin(29 * t - 0.7);
      if (o.kind === "dent") {
        var wrapped = Math.atan2(Math.sin(t + 0.45), Math.cos(t + 0.45));
        r *= 1 - o.amplitude * Math.exp(-wrapped * wrapped / (2 * 0.085 * 0.085));
      }
      points.push(o.kind === "ellipse" ?
        { x: r * (1 + o.amplitude) * Math.cos(t), y: r * (1 - o.amplitude) * Math.sin(t) } :
        { x: r * Math.cos(t), y: r * Math.sin(t) });
    }
    if (closed) points.push({ x: points[0].x, y: points[0].y });
    return { points: points, closed: closed, options: o, sourceCount: points.length, subsampled: false };
  }
  function absoluteQuality(error, halfError) {
    var threshold = halfError == null ? BASELINE_HALF_ERROR : Number(halfError);
    if (!Number.isFinite(error) || error < 0 || !Number.isFinite(threshold) || threshold <= 0) return null;
    return 100 / (1 + Math.pow(error / threshold, 2));
  }
  function radialDiagnostics(options) {
    var o = settings(options), samples = [], square = 0, count = 1536;
    for (var i = 0; i < count; i += 1) {
      var sample = radialSample(TAU * i / count, o);
      square += Math.pow(sample.normalizedCurvature - 1, 2);
      samples.push(sample);
    }
    return { options: o, samples: samples, radialRms: o.amplitude / Math.sqrt(2),
      radialRmsPct: 100 * o.amplitude / Math.sqrt(2), curvatureRms: Math.sqrt(square / count),
      curvatureQuadratureSamples: count, measure: "uniform theta; unsmoothed analytic curve" };
  }
  function frequencySweep(amplitude) {
    return Array.from({ length: 11 }, function (_, i) {
      var d = radialDiagnostics({ amplitude: amplitude, frequency: i + 2, radius: 1 });
      return { frequency: i + 2, radialRms: d.radialRms, curvatureRms: d.curvatureRms };
    });
  }
  function evaluate(options, engine, compositeApi) {
    if (!engine || typeof engine.analyze !== "function" || !compositeApi || typeof compositeApi.scoreResult !== "function")
      throw new Error("Roundness and its composite scoring API are required.");
    var o = settings(options), input;
    if (o.kind === "user") {
      input = boundedPoints(options && options.rawPoints);
      if (options.sourceInfo && options.sourceInfo.subsampled) {
        input.sourceCount = options.sourceInfo.sourceCount;
        input.subsampled = true;
      }
      var sourceFit = engine.fitCircle(input.points);
      if (sourceFit.valid) input.points = input.points.map(function (p) {
        return { x: (p.x - sourceFit.cx) * o.radius / sourceFit.r,
          y: (p.y - sourceFit.cy) * o.radius / sourceFit.r };
      });
      input.options = o;
    } else input = generateContour(o);
    var model = compositeApi.MODEL;
    var analysis = engine.analyze(input.points, { sampleCount: model.sampleCount, smoothing: model.smoothing, maxHarmonic: 12,
      closureMode: o.kind === "user" && options ? options.closureMode : "auto" });
    var policies = {};
    ["arithmetic", "geometric", "bottleneck"].forEach(function (id) { policies[id] = compositeApi.scoreResult(analysis, id); });
    var rms = analysis.metrics.rmsPct;
    var absoluteError = analysis.fit.valid && Number.isFinite(rms) ? rms * analysis.fit.r / 100 : null;
    return { options: o, input: input, analysis: analysis, policies: policies,
      baseline: { error: absoluteError, score: absoluteQuality(absoluteError), halfError: BASELINE_HALF_ERROR,
        coordinateUnit: "drawing units", formula: "100 / (1 + (absolute RMS / 10)^2)", inventedComparator: true },
      evidence: typeof compositeApi.assessEvidence === "function" ? compositeApi.assessEvidence(analysis, {
        minimumRadius: 20, coordinateUnit: "drawing units" }) : null,
      ideal: o.kind === "radial" || o.kind === "lobed" || o.kind === "circle" ?
        radialDiagnostics({ amplitude: o.kind === "circle" ? 0 : o.amplitude, frequency: o.frequency, radius: o.radius }) : null };
  }
  function challengeEligibility(result, minimumRadius) {
    var minimum = Math.max(0, number(minimumRadius, 60));
    var valid = !!(result && result.policies && result.policies.geometric.valid);
    var radius = result && result.analysis && result.analysis.fit.r;
    return { eligible: valid && Number.isFinite(radius) && radius >= minimum,
      status: !valid ? "invalid contour" : radius >= minimum ? "eligible" : "undersized capture",
      minimumRadius: minimum, radius: radius, coordinateUnit: "drawing units", affectsGeometryScore: false };
  }
  // Both copies are actually analyzed at their own coordinate size. Geometry is
  // not copied between them, so this comparison also exercises scale invariance.
  function scaleComparison(options, engine, compositeApi) {
    var large = evaluate(Object.assign({}, options, { radius: 100 }), engine, compositeApi);
    var small = evaluate(Object.assign({}, options, { radius: 8 }), engine, compositeApi);
    var baselineFinite = Number.isFinite(large.baseline.score) && Number.isFinite(small.baseline.score);
    var geometryFinite = large.policies.geometric.valid && small.policies.geometric.valid;
    return { large: large, small: small, radiusRatio: 12.5,
      baselineGain: baselineFinite ? small.baseline.score - large.baseline.score : null,
      geometricChange: geometryFinite ? small.policies.geometric.score - large.policies.geometric.score : null };
  }
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(value, digits) { return Number.isFinite(value) ? value.toFixed(digits == null ? 1 : digits) : "—"; }
  function pathOf(points, mapX, mapY, close) {
    if (!points || !points.length) return "";
    return points.map(function (p, i) { return (i ? "L" : "M") + fmt(mapX(p), 3) + " " + fmt(mapY(p), 3); }).join(" ") + (close ? " Z" : "");
  }
  function contourSvg(result, id) {
    var a = result.analysis, fit = a.fit, x = function (p) { return 280 + p.x; }, y = function (p) { return 200 + p.y; };
    var grid = "";
    for (var n = 0; n <= 560; n += 20) grid += '<path d="M' + n + ' 0V400"/>';
    for (n = 0; n <= 400; n += 20) grid += '<path d="M0 ' + n + 'H560"/>';
    var circle = fit.valid ? '<circle class="cl-fit" cx="' + x({ x: fit.cx }) + '" cy="' + y({ y: fit.cy }) + '" r="' + fit.r + '"/>' : "";
    return '<title id="' + id + '-contour-title">Input contour, scored contour, and fitted circle</title>' +
      '<desc>The fixed coordinate grid lets radius change visibly. Orange is the supplied contour, blue is the scored smoothed contour, and mint is its fitted circle.</desc>' +
      '<g class="cl-grid">' + grid + '</g><path class="cl-axes" d="M280 0V400M0 200H560"/>' + circle +
      '<path class="cl-input" d="' + pathOf(result.input.points, x, y, a.validity.isClosed) + '"/>' +
      '<path class="cl-scored" d="' + pathOf(a.points.smoothed, x, y, a.validity.isClosed) + '"/>' +
      '<text class="cl-stage-label" x="18" y="25">FIXED COORDINATE SCALE</text>' +
      '<text class="cl-stage-label" x="18" y="381">grid = 20 drawing units</text>' +
      '<text class="cl-stage-label cl-stage-right" x="540" y="381">fitted R = ' + fmt(fit.r) + '</text>';
  }
  function comparisonCard(result, small, id) {
    var x = function (p) { return 100 + p.x * 0.5; }, y = function (p) { return 80 + p.y * 0.5; };
    var grid = "";
    for (var n = 0; n <= 200; n += 10) grid += '<path d="M' + n + ' 0V160"/>';
    for (n = 0; n <= 160; n += 10) grid += '<path d="M0 ' + n + 'H200"/>';
    var titleId = id + (small ? '-small-title' : '-large-title');
    return '<div class="cl-scale-card' + (small ? ' cl-scale-small' : '') + '"><svg viewBox="0 0 200 160" role="img" aria-labelledby="' + titleId + '"><title id="' + titleId + '">' +
      (small ? 'The same contour shrunk to radius 8 drawing units, without zooming' : 'Reference contour at radius 100 drawing units') +
      '</title><g class="cl-grid">' + grid + '</g><circle class="cl-scale-guide" cx="100" cy="80" r="50"/>' +
      '<path class="cl-scale-path" d="' + pathOf(result.input.points, x, y, result.analysis.validity.isClosed) + '"/></svg>' +
      '<div><p class="cl-scale-label">' + (small ? 'Shrunk copy · R = 8' : 'Original size · R = 100') + '</p>' +
      '<dl><div class="cl-baseline-value"><dt>Illustrative baseline</dt><dd>' + fmt(result.baseline.score) + '</dd></div>' +
      '<div><dt>Geometric score</dt><dd>' + (result.policies.geometric.valid ? fmt(result.policies.geometric.score) : 'withheld') + '</dd></div></dl></div></div>';
  }
  function sweepSvg(rows, selected, id) {
    var width = 560, left = 48, right = 535, top = 30, bottom = 222;
    var maximum = Math.max(0.02, Math.max.apply(null, rows.map(function (r) { return r.curvatureRms; })) * 1.12);
    var x = function (r) { return left + (r.frequency - 2) / 10 * (right - left); };
    var y = function (v) { return bottom - v / maximum * (bottom - top); };
    var markup = '<title id="' + id + '-sweep-title">Frequency sensitivity at constant radial amplitude</title>' +
      '<desc>Raw radial RMS is constant across frequency. Radius-normalized curvature RMS is calculated from the exact polar curvature formula, with uniform angular quadrature.</desc>';
    for (var i = 0; i < 4; i += 1) {
      var v = maximum * i / 3, yy = y(v);
      markup += '<path class="cl-gridline" d="M' + left + ' ' + yy + 'H' + right + '"/><text class="cl-tick" x="40" y="' + (yy + 4) + '" text-anchor="end">' + fmt(v, 2) + '</text>';
    }
    rows.forEach(function (r) { markup += '<text class="cl-tick" x="' + x(r) + '" y="244" text-anchor="middle">' + r.frequency + '</text>'; });
    markup += '<path class="cl-radial-line" d="' + pathOf(rows, x, function (r) { return y(r.radialRms); }) + '"/>';
    markup += '<path class="cl-curvature-line" d="' + pathOf(rows, x, function (r) { return y(r.curvatureRms); }) + '"/>';
    var chosen = rows.find(function (r) { return r.frequency === selected; });
    markup += '<path class="cl-marker-line" d="M' + x(chosen) + ' ' + top + 'V' + bottom + '"/><circle class="cl-marker" cx="' + x(chosen) + '" cy="' + y(chosen.curvatureRms) + '" r="5"/>';
    return markup + '<text class="cl-plot-label" x="48" y="16">dimensionless RMS · raw analytic family</text>' +
      '<text class="cl-tick" x="' + width / 2 + '" y="267" text-anchor="middle">number of lobes n</text>';
  }
  function mount(host, engine, compositeApi) {
    if (!host || !host.ownerDocument) throw new Error("A host element is required.");
    var document = host.ownerDocument, win = document.defaultView || globalThis, id = "criteria-" + (++instanceCount);
    var state = { kind: "dent", amplitude: 0.28, frequency: 5, radius: 100 }, userRaw = [], userInfo = null, revision = 0;
    var challengeEnabled = false;
    var cache = new Map(), sweepCache = new Map(), comparisonCache = new Map(), frame = null, dead = false, observed = null;
    host.classList.add("criteria-lab");
    host.innerHTML = '<div class="cl-heading"><div><p class="eyebrow">Criteria under controlled change</p><h3>What does the score reward?</h3></div><p>Controlled changes separate scale dependence, local defects, and aggregation effects.</p></div>' +
      '<div class="cl-controls"><label class="cl-select">Counterexample<select data-cl="kind">' + Object.keys(PRESETS).map(function (key) {
        return '<option value="' + key + '"' + (key === state.kind ? ' selected' : '') + (key === "user" ? ' disabled' : '') + '>' + PRESETS[key].label + '</option>';
      }).join("") + '</select></label>' +
      '<label>Radius R <output data-cl="radius-value"></output><input aria-label="Radius R" data-cl="radius" type="range" min="8" max="140" step="1" value="100"><small>drawing coordinates, not screen pixels</small></label>' +
      '<label>Amplitude a <output data-cl="amplitude-value"></output><input aria-label="Relative amplitude" data-cl="amplitude" type="range" min="0" max="0.32" step="0.005" value="0.045"><small>relative to the nominal radius</small></label>' +
      '<label>Lobes n <output data-cl="frequency-value"></output><input aria-label="Lobe count" data-cl="frequency" type="range" min="2" max="12" step="1" value="5"><small>controlled radial family only</small></label></div>' +
      '<section class="cl-scale-comparison" aria-labelledby="' + id + '-scale-title"><div class="cl-scale-heading"><h4 id="' + id + '-scale-title">Shrinking the error, preserving the defect</h4><span>Same coordinate scale · no zoom</span></div>' +
      '<div class="cl-scale-cards" data-cl="scale-cards"></div><p class="cl-scale-verdict" data-cl="scale-verdict"></p>' +
      '<p class="cl-scale-caveat">The baseline is an illustrative fixed absolute-error rule, 100 / (1 + (e / 10)²), not an existing game’s implementation. Both copies are recomputed with the same scoring scale; the geometric score normalizes size.</p></section>' +
      '<div class="cl-main-grid"><figure class="cl-figure"><svg data-cl="contour" viewBox="0 0 560 400" role="img" aria-labelledby="' + id + '-contour-title"></svg><figcaption><span class="cl-key cl-orange">Input</span><span class="cl-key cl-blue">Scored contour</span><span class="cl-key cl-mint">Circle fit</span><small data-cl="scoring-scale"></small></figcaption></figure>' +
      '<aside class="cl-scoreboard"><p class="cl-insight" data-cl="insight"></p><div class="cl-score-pair"><div class="cl-baseline"><span>Absolute-error baseline</span><strong data-cl="absolute-score"></strong><small data-cl="absolute-error"></small></div><div><span>Normalized RMS quality</span><strong data-cl="relative-score"></strong><small data-cl="relative-error"></small></div></div>' +
      '<div class="cl-compactness"><span>Compactness · 4πA / L²</span><output data-cl="compactness"></output></div>' +
      '<div class="cl-policy-bars" data-cl="policies"></div><p class="cl-policy-note">Same five component qualities. Arithmetic allows compensation; geometric emphasizes weak parts; worst component takes the minimum without weights.</p>' +
      '<p class="cl-evidence" data-cl="evidence"></p><div class="cl-challenge"><label><input type="checkbox" data-cl="challenge"> Optional drawing challenge</label><output data-cl="challenge-status"></output><small>Closed, scorable contour + fitted radius ≥ 60 drawing units. This eligibility rule leaves geometry scores unchanged.</small></div><p class="cl-invalid" data-cl="invalid" role="status"></p></aside></div>' +
      '<details class="cl-baseline-note"><summary>What exactly is the absolute-error baseline?</summary><p>A deliberately simple comparator: <b>100 / (1 + (e / 10)²)</b>, where e is the scored contour’s radial RMS in drawing units. Ten units means half score. It ignores closure and scales with the drawing; it is not attributed to an existing game. Normalized RMS divides that error by the fitted radius. The separate 20-unit size guideline affects evidence only. SVG drawing units are not device or CSS pixels.</p></details>' +
      '<div class="cl-suite-heading"><h4>Counterexample suite</h4><p>Measured at R = 100 units and the same fixed smoothing. Each contour opens its detailed measurements. These are designed checks, not human perception ratings.</p></div><div class="cl-suite-scroll"><table class="cl-suite"><thead><tr><th>Reference contour</th><th>Illustrative<br>baseline</th><th>Arithmetic</th><th>Geometric</th><th>Worst</th></tr></thead><tbody data-cl="suite"></tbody></table></div>' +
      '<div class="cl-derivative-heading"><p class="eyebrow">Why the criteria disagree</p><h4>The same wobble, more derivatives.</h4></div>' +
      '<div class="cl-main-grid cl-derivative-grid"><figure class="cl-figure cl-light-figure"><svg data-cl="sweep" viewBox="0 0 560 280" role="img" aria-labelledby="' + id + '-sweep-title"></svg><figcaption><span class="cl-key cl-blue">RMS of δr / R</span><span class="cl-key cl-orange">RMS of Rκ − 1</span><small>Uniform angular measure; no smoothing or circle refit.</small></figcaption></figure>' +
      '<aside class="cl-derivative-notes"><p data-cl="family-description"></p><div class="cl-formula">r(θ) = R [1 + a cos(nθ)]</div><dl><div><dt>Raw radial RMS / R</dt><dd data-cl="ideal-radial"></dd></div><div><dt>Raw RMS of Rκ − 1</dt><dd data-cl="ideal-curvature"></dd></div><div><dt>Scored curvature RMS</dt><dd data-cl="scored-curvature"></dd></div></dl><p>Position changes with a; second derivatives also contain n². The raw analytic family and the fitted, smoothed scoring contour are different measurements.</p>' +
      '<details><summary>The exact derivative calculation</summary><p>With q = 1 + a cos(nθ), q′ = −an sin(nθ), q″ = −an² cos(nθ).</p><p class="cl-formula">Rκ = (q² + 2q′² − qq″) / (q² + q′²)<sup>3/2</sup></p><p>Radial RMS is exactly a/√2. Curvature RMS uses 1,536 equally spaced θ samples of this exact formula. For small a at fixed n, Rκ − 1 ≈ (n² − 1)a cos(nθ). This is a sensitivity experiment, not another overall score.</p></details></aside></div>' +
      '<p class="cl-sources">Measurement context: <a href="https://www.itl.nist.gov/div898/handbook/mpc/section3/mpc344.htm" target="_blank" rel="noreferrer">NIST · roundness measurement</a>. Aggregation choices: <a href="https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html" target="_blank" rel="noreferrer">OECD · composite indicators</a>. These lab score mappings are design choices, not a calibrated perceptual standard.</p>';
    function el(name) { return host.querySelector('[data-cl="' + name + '"]'); }
    el("amplitude").value = state.amplitude;
    function remember(map, key, value, size) { map.set(key, value); if (map.size > size) map.delete(map.keys().next().value); return value; }
    var suite = ["circle", "ellipse", "dent", "noisy", "arc"].map(function (kind) {
      return evaluate({ kind: kind, radius: 100 }, engine, compositeApi);
    });
    el("suite").innerHTML = suite.map(function (result) {
      var thumbnail = pathOf(result.input.points, function (p) { return 32 + p.x * 0.2; }, function (p) { return 26 + p.y * 0.2; }, result.analysis.validity.isClosed);
      var reason = { circle: "Control: a complete circular boundary.", ellipse: "Elongation survives the circle fit.",
        dent: "Radial RMS averages over the narrow local defect.", noisy: "Low positional error; large local bending error.",
        arc: "A near-perfect radial fit does not establish closure." }[result.options.kind];
      return '<tr><th><button type="button" data-cl-case="' + result.options.kind + '"><svg viewBox="0 0 64 52" aria-hidden="true"><path d="' + thumbnail + '"/></svg><span>' + PRESETS[result.options.kind].label + '<small>' + reason + '</small></span></button></th>' +
        '<td class="cl-baseline-value">' + fmt(result.baseline.score) + '</td>' +
        ["arithmetic", "geometric", "bottleneck"].map(function (policy) { return '<td>' + (result.policies[policy].valid ? fmt(result.policies[policy].score) : 'withheld') + '</td>'; }).join("") + '</tr>';
    }).join("");
    function draw() {
      frame = null; if (dead) return;
      var family = state.kind === "radial" || state.kind === "lobed";
      el("amplitude").disabled = !(family || state.kind === "ellipse" || state.kind === "dent" || state.kind === "noisy");
      el("frequency").disabled = !family;
      el("radius-value").textContent = state.radius + " units";
      el("amplitude-value").textContent = fmt(state.amplitude * 100, 1) + "%";
      el("frequency-value").textContent = state.frequency;
      var key = JSON.stringify(state) + ":" + (state.kind === "user" ? revision : 0);
      var sourceMode = observed && observed.analysis && observed.analysis.options.closureMode;
      var result = cache.get(key) || remember(cache, key, evaluate(Object.assign({}, state, { rawPoints: userRaw, sourceInfo: userInfo, closureMode: sourceMode }), engine, compositeApi), 16);
      var a = result.analysis, geometric = result.policies.geometric;
      var comparisonKey = JSON.stringify([state.kind, state.amplitude, state.frequency, state.kind === "user" ? revision : 0]);
      var comparison = comparisonCache.get(comparisonKey) || remember(comparisonCache, comparisonKey,
        scaleComparison(Object.assign({}, state, { rawPoints: userRaw, sourceInfo: userInfo, closureMode: sourceMode }), engine, compositeApi), 12);
      el("scale-cards").innerHTML = comparisonCard(comparison.large, false, id) + comparisonCard(comparison.small, true, id);
      el("scale-verdict").textContent = !Number.isFinite(comparison.baselineGain) ? "No valid radial measurement is available for this input." :
        !Number.isFinite(comparison.geometricChange) ? "A radial-fit score alone does not establish a valid closed boundary. The geometric composite is withheld at both sizes." :
        comparison.baselineGain < 0.01 ? "At this error level, shrinking has negligible influence on either displayed score. Ellipses, dents, and lobes expose the baseline’s size dependence." :
        "Same shape, 12.5× smaller: the baseline gains " + fmt(comparison.baselineGain) + " points; the geometric score changes by " +
          (Math.abs(comparison.geometricChange) < 0.01 ? "less than 0.01" : fmt(comparison.geometricChange, 2)) + " points.";
      el("contour").innerHTML = contourSvg(result, id);
      el("scoring-scale").textContent = "Scored: " + a.options.sampleCount + " arc-length samples · Gaussian σ = " + a.options.smoothing + " samples. " + (result.input.subsampled ? "Input thinned to 1,024 vertices for this lab." : "");
      el("insight").textContent = PRESETS[state.kind].insight;
      el("absolute-score").textContent = fmt(result.baseline.score);
      el("absolute-error").textContent = "e = " + fmt(result.baseline.error, 2) + " drawing units";
      el("relative-score").textContent = fmt(geometric.components.rms.quality);
      el("relative-error").textContent = "e / fitted R = " + fmt(a.metrics.rmsPct, 2) + "%";
      el("compactness").textContent = fmt(a.metrics.compactness, 4);
      el("policies").innerHTML = Object.keys(result.policies).map(function (policyId) {
        var p = result.policies[policyId], label = p.policy ? p.policy.label : policyId;
        return '<div class="cl-policy-row' + (observed && observed.policyId === policyId ? ' is-current' : '') + '"><span>' + esc(label) + '</span><div class="cl-policy-track"><i style="width:' + (Number.isFinite(p.score) ? p.score : 0) + '%"></i></div><output>' + fmt(p.score) + '</output></div>';
      }).join("");
      var evidence = result.evidence;
      el("evidence").textContent = evidence ? (evidence.passesScaleGuideline === true ? "Size guideline met" : evidence.passesScaleGuideline === false ? "Below the 20-unit size guideline" : "Size evidence unavailable") + " · evidence only, no roundness penalty." : "Size evidence is separate from the mathematical score.";
      el("evidence").classList.toggle("is-small", !!evidence && evidence.passesScaleGuideline === false);
      var gate = challengeEligibility(result);
      el("challenge-status").textContent = challengeEnabled ? gate.status : "Geometry only · gate off";
      el("challenge-status").classList.toggle("is-ineligible", challengeEnabled && !gate.eligible);
      el("invalid").textContent = geometric.valid ? "" : "Composite withheld: " + geometric.invalidReasons.join(" ");
      var amplitude = family ? state.amplitude : state.kind === "circle" ? 0 : 0.045;
      var sweepKey = String(amplitude), rows = sweepCache.get(sweepKey) || remember(sweepCache, sweepKey, frequencySweep(amplitude), 12);
      el("sweep").innerHTML = sweepSvg(rows, state.frequency, id);
      var ideal = result.ideal || radialDiagnostics({ amplitude: amplitude, frequency: state.frequency, radius: state.radius });
      el("family-description").textContent = result.ideal ? "Same analytic family as the contour above: frequency varies while relative amplitude stays fixed." : "Independent controlled family (a = 4.5%), not an analytic model of the selected contour. Its parameters are editable under Controlled radial family.";
      el("ideal-radial").textContent = fmt(ideal.radialRmsPct, 2) + "%";
      el("ideal-curvature").textContent = fmt(ideal.curvatureRms, 3);
      el("scored-curvature").textContent = fmt(a.metrics.curvatureRms, 3) + (result.ideal ? " · contour above" : " · selected contour");
    }
    function schedule() { if (!dead && frame == null) frame = win.requestAnimationFrame(draw); }
    function input(event) {
      var name = event.target.getAttribute("data-cl");
      if (["radius", "amplitude", "frequency"].indexOf(name) < 0) return;
      state[name] = Number(event.target.value); schedule();
    }
    function change(event) {
      if (event.target === el("challenge")) { challengeEnabled = event.target.checked; schedule(); return; }
      if (event.target !== el("kind")) return;
      state.kind = event.target.value;
      state.amplitude = PRESETS[state.kind].amplitude; state.frequency = PRESETS[state.kind].frequency;
      el("amplitude").value = state.amplitude; el("frequency").value = state.frequency; schedule();
    }
    function chooseCase(event) {
      var button = event.target.closest("[data-cl-case]");
      if (!button || !host.contains(button)) return;
      el("kind").value = button.getAttribute("data-cl-case"); state.radius = 100; el("radius").value = "100";
      change({ target: el("kind") });
    }
    host.addEventListener("input", input); host.addEventListener("change", change); host.addEventListener("click", chooseCase); draw();
    return { update: function (raw, composite) {
      if (dead) return;
      userInfo = boundedPoints(raw); userRaw = userInfo.points; observed = composite || null; revision += 1;
      el("kind").querySelector('option[value="user"]').disabled = userRaw.length < 3;
      if (state.kind === "user" && userRaw.length < 3) { state.kind = "radial"; el("kind").value = state.kind; }
      schedule();
    }, destroy: function () {
      dead = true; if (frame != null) win.cancelAnimationFrame(frame);
      host.removeEventListener("input", input); host.removeEventListener("change", change);
      host.removeEventListener("click", chooseCase);
      cache.clear(); sweepCache.clear(); comparisonCache.clear();
    } };
  }
  return { PRESETS: PRESETS, BASELINE_HALF_ERROR: BASELINE_HALF_ERROR, settings: settings,
    radialSample: radialSample, generateContour: generateContour, absoluteQuality: absoluteQuality,
    radialDiagnostics: radialDiagnostics, frequencySweep: frequencySweep, evaluate: evaluate,
    challengeEligibility: challengeEligibility, scaleComparison: scaleComparison, mount: mount };
});
