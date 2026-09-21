(function () {
  "use strict";

  const Engine = window.Roundness;
  const Composite = window.RoundnessComposite;
  const Reporting = window.RoundnessReporting;
  const ViewState = window.RoundnessViewState;
  const Experimental = window.RoundnessExperimental;
  const ConstantWidth = window.RoundnessConstantWidth;
  const TangentTurning = window.RoundnessTangentTurning;
  const CurveFlow = window.RoundnessCurveFlow;
  const DrawingClosure = window.RoundnessDrawingClosure;
  const CaptureReturn = window.RoundnessCaptureReturn;
  if (!Engine || typeof Engine.analyze !== "function") {
    throw new Error("Roundness analysis engine did not load.");
  }
  if (!Composite || typeof Composite.analyze !== "function") {
    throw new Error("Comprehensive scoring engine did not load.");
  }
  if (!Reporting || typeof Reporting.buildReport !== "function") {
    throw new Error("Roundness reporting helpers did not load.");
  }
  if (!ViewState || typeof ViewState.parse !== "function" || typeof ViewState.toUrl !== "function") {
    throw new Error("Roundness view-state helpers did not load.");
  }
  if (!Experimental || typeof Experimental.analyze !== "function" || typeof Experimental.signedPeakBins !== "function") {
    throw new Error("Roundness experimental helpers did not load.");
  }
  if (!ConstantWidth || typeof ConstantWidth.generate !== "function" || typeof ConstantWidth.caliperPose !== "function") {
    throw new Error("Roundness constant-width helpers did not load.");
  }
  if (!TangentTurning || typeof TangentTurning.analyze !== "function" || typeof TangentTurning.sample !== "function") {
    throw new Error("Roundness tangent-turning helpers did not load.");
  }
  if (!CurveFlow || typeof CurveFlow.simulate !== "function" || typeof CurveFlow.sample !== "function" || typeof CurveFlow.areaPlotDomain !== "function") {
    throw new Error("Roundness curve-shortening helpers did not load.");
  }

  const SAMPLE_COUNT = 240;
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const els = {
    preset: $("presetSelect"), drawAgain: $("drawAgainButton"), drawingSvg: $("drawingSvg"),
    drawPrompt: $("drawPrompt"), specimenName: $("specimenName"), traceStatus: $("traceStatus"),
    shapeFill: $("shapeFillLayer"), reference: $("referenceLayer"), residual: $("residualLayer"),
    raw: $("rawLayer"), processed: $("processedLayer"), annotation: $("annotationLayer"),
    overlayLegend: $("overlayLegend"), pipelineSummary: $("pipelineSummary"),
    smoothing: $("smoothingRange"), smoothingValue: $("smoothingValue"), methodTabs: $("methodTabs"),
    methodKicker: $("methodKicker"), methodTitle: $("methodTitle"), methodValue: $("methodValue"),
    methodUnit: $("methodUnit"), methodDescription: $("methodDescription"), methodGoodAt: $("methodGoodAt"),
    methodMisses: $("methodMisses"), methodFormula: $("methodFormula"), rmsMetric: $("rmsMetric"),
    zoneMetric: $("zoneMetric"), compactnessMetric: $("compactnessMetric"), rawCount: $("rawCount"),
    smoothCount: $("smoothCount"), rawMini: $("rawMini"), sampledMini: $("sampledMini"),
    smoothedMini: $("smoothedMini"), radialPlot: $("radialPlot"), curvaturePlot: $("curvaturePlot"),
    harmonicPlot: $("harmonicPlot"), radialSummary: $("radialPlotSummary"),
    curvatureSummary: $("curvaturePlotSummary"), harmonicSummary: $("harmonicPlotSummary"),
    experimentalMap: $("experimentalMap"), experimentalMapSummary: $("experimentalMapSummary"),
    experimentalBendingPlot: $("experimentalBendingPlot"), experimentalBendingSummary: $("experimentalBendingSummary"),
    experimentalWarnings: $("experimentalWarnings"), experimentalStatus: $("experimentalStatus"),
    caliperDeformation: $("caliperDeformation"), caliperDeformationValue: $("caliperDeformationValue"),
    caliperAngle: $("caliperAngle"), caliperAngleValue: $("caliperAngleValue"), caliperDemo: $("caliperDemo"),
    caliperExactGap: $("caliperExactGap"), caliperRoundnessScore: $("caliperRoundnessScore"),
    caliperCurvatureRatio: $("caliperCurvatureRatio"), caliperBarbier: $("caliperBarbier"),
    caliperNarration: $("caliperNarration"),
    caliperWidthPlot: $("caliperWidthPlot"), caliperWidthSummary: $("caliperWidthSummary"),
    supportSpectrum: $("supportSpectrum"), supportSpectrumSummary: $("supportSpectrumSummary"),
    turningPosition: $("turningPosition"), turningPositionValue: $("turningPositionValue"),
    turningOsculating: $("turningOsculating"),
    turningContour: $("turningContour"), turningSoFar: $("turningSoFar"), turningFinal: $("turningFinal"),
    turningBacktrack: $("turningBacktrack"), turningNarration: $("turningNarration"),
    turningPlot: $("turningPlot"), turningPlotSummary: $("turningPlotSummary"),
    flowPosition: $("flowPosition"), flowPositionValue: $("flowPositionValue"), flowStage: $("flowStage"),
    flowArea: $("flowArea"), flowClock: $("flowClock"), flowDeficit: $("flowDeficit"),
    flowNarration: $("flowNarration"), flowAreaPlot: $("flowAreaPlot"), flowPlotSummary: $("flowPlotSummary"),
    modeSwitch: document.querySelector(".mode-switch"), comprehensivePanel: $("comprehensivePanel"),
    explorePanel: $("explorePanel"), scoreDial: $("scoreDial"), overallScore: $("overallScore"),
    overallLabel: $("overallLabel"), scoreConfidence: $("scoreConfidence"),
    scoreConfidenceDetail: $("scoreConfidenceDetail"), scoreStatus: $("scoreStatus"),
    scaleStability: $("scaleStability"), scoreComponents: $("scoreComponents"), scoreLimiting: $("scoreLimiting"),
    inspectLimiting: $("inspectLimitingButton"), copySummary: $("copySummaryButton"),
    copyViewLink: $("copyViewLinkButton"), downloadJson: $("downloadJsonButton"),
    exportStatus: $("exportStatus"), methodPanel: $("methodPanel"),
    resultAnnouncer: $("resultAnnouncer"),
    scoringPolicy: $("scoringPolicySelect"), policyFormula: $("policyFormula"),
    policyExplanation: $("policyExplanation"), scoreEvidence: $("scoreEvidence"),
    closureMode: $("closureModeSelect"), closureNote: $("closureModeNote"),
    closureStatus: $("closureStatus"), completion: $("completionLayer"),
  };

  const methodCopy = {
    fit: {
      kicker: "Least-squares reference circle", title: "Average radial miss",
      description: "The reference center and radius minimize squared radial residuals. This estimates typical deviation; a localized defect can have little influence on the average.",
      good: "Summarizing typical error across the whole trace.",
      misses: "A single deep dent can disappear inside a small average.",
      formula: "Choose c and R to minimize (1/N) Σᵢ (‖pᵢ − c‖ − R)². Report √mean(eᵢ²) / R × 100%.",
      legend: "least-squares circle + residuals",
    },
    zone: {
      kicker: "Minimum-zone annulus · numerical approximation", title: "Tightest tolerance band",
      description: "A numerical search estimates the narrowest concentric annulus enclosing the sampled contour. Its width measures worst-case form error rather than average agreement.",
      good: "Catching the worst peak-to-valley form error.",
      misses: "One outlier can dominate; the fit is harder to optimize.",
      formula: "Z = min_c [ maxᵢ ‖pᵢ − c‖ − minᵢ ‖pᵢ − c‖ ]. Normalize the annulus width by its mean radius.",
      legend: "minimum-zone inner + outer circles",
    },
    compactness: {
      kicker: "Isoperimetric quotient", title: "Area versus perimeter",
      description: "The isoperimetric quotient compares enclosed area with the maximum possible area at the same perimeter. It requires no reference-circle fit.",
      good: "A fast, scale-free measure of global compactness.",
      misses: "Where the error occurs; rough sampling inflates perimeter.",
      formula: "C = 4πA / P². C = 1 only for a perfect circle; smaller values are less compact.",
      legend: "area- and perimeter-equivalent circles",
    },
    curvature: {
      kicker: "Planar curve curvature", title: "Consistency of local bend",
      description: "Curvature measures tangent rotation per unit arclength. A circle has κR = 1; raw and smoothed estimates expose the sensitivity of this second-derivative measurement.",
      good: "Finding flat spots, corners, dents, and local hand wobble.",
      misses: "Stable results without a declared smoothing scale.",
      formula: "κ = dθ/ds. We report RMS(κR − 1) after equal-arc-length resampling and the selected smoothing scale.",
      legend: "curvature-colored contour",
    },
    harmonics: {
      kicker: "Radial Fourier decomposition", title: "Shape fingerprint",
      description: "A Fourier decomposition resolves radial residuals by spatial frequency: low modes describe global deformation, while high modes resolve finer boundary structure.",
      good: "Explaining what kind of wobble produced the error.",
      misses: "Non-star-shaped outlines where one angle meets the boundary twice.",
      formula: "e(θ)/R = Σₙ [aₙ cos(nθ) + bₙ sin(nθ)]. Bar height Aₙ = √(aₙ² + bₙ²).",
      legend: "dominant harmonic reconstruction",
    },
  };

  const presetNames = {
    perfect: "Perfect reference", human: "Near circle", ellipse: "Ellipse", dent: "One dent", noisy: "Noisy rim",
    trilobe: "Three-lobe", roundedSquare: "Rounded square", openArc: "Incomplete arc", custom: "Recorded contour",
  };
  const state = {
    rawPoints: [], result: null, comprehensive: null, experimental: null, mode: "comprehensive",
    method: "fit", drawing: false, pointerId: null, specimen: "human", policy: "geometric",
    gesturePoints: null, closure: null, closureMode: "straight", cancelled: false,
  };
  const criteriaLab = window.RoundnessCriteriaLab && $("criteriaLab")
    ? window.RoundnessCriteriaLab.mount($("criteriaLab"), Engine, Composite) : null;
  const caliperScoreCache = new Map();
  const caliperWidthCache = new Map();
  let turningAnalysis = null;
  let curveFlowResult = null;
  let flowResizeTimer = null;
  let flowAnalysisTimer = null;
  const experimentalBaselineWarnings = [
    "Fine scales amplify pointer sampling and numerical differentiation.",
    "Feature locations depend on the stroke start; smoothing can merge or shift narrow dents.",
    "Classical zero-crossing scale-space can be blank for both a circle and a noncircular convex shape.",
    "Discrete curvature and bending estimates can rebound across scale because of aliasing; monotonic decay is not guaranteed.",
  ];

  const point = (x, y) => ({ x, y });
  const finite = (value) => Number.isFinite(value);
  const angularDistance = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const deterministicNoise = (i) => {
    const x = Math.sin(i * 91.733 + 1.123) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };

  function makePreset(kind) {
    const cx = 320, cy = 260, radius = 168;
    const count = kind === "openArc" ? 150 : 190;
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const t = kind === "openArc" ? -Math.PI * 0.78 + (i / (count - 1)) * Math.PI * 1.56 : (i / count) * TAU;
      if (kind === "ellipse") {
        points.push(point(cx + 190 * Math.cos(t), cy + 140 * Math.sin(t)));
        continue;
      }
      if (kind === "roundedSquare") {
        const exponent = 3.5, c = Math.cos(t), s = Math.sin(t);
        points.push(point(
          cx + radius * Math.sign(c) * Math.pow(Math.abs(c), 2 / exponent),
          cy + radius * Math.sign(s) * Math.pow(Math.abs(s), 2 / exponent),
        ));
        continue;
      }
      let radialFactor = 1;
      if (kind === "human") {
        radialFactor += 0.012 * Math.sin(2 * t + 0.45) + 0.017 * Math.sin(3 * t - 0.8) +
          0.006 * Math.sin(7 * t + 1.4) + 0.0035 * Math.sin(13 * t);
      } else if (kind === "dent") {
        const d = angularDistance(t, -0.3);
        radialFactor += 0.008 * Math.sin(3 * t) - 0.13 * Math.exp(-(d * d) / (2 * 0.13 * 0.13));
      } else if (kind === "noisy") {
        radialFactor += 0.014 * Math.sin(17 * t + 0.2) + 0.008 * Math.sin(29 * t - 0.7) + 0.005 * deterministicNoise(i);
      } else if (kind === "trilobe") {
        radialFactor += 0.065 * Math.cos(3 * t - 0.3);
      } else if (kind === "openArc") {
        radialFactor += 0.003 * Math.sin(6 * t);
      }
      points.push(point(cx + radius * radialFactor * Math.cos(t), cy + radius * radialFactor * Math.sin(t)));
    }
    if (kind !== "openArc" && points.length) points.push(point(points[0].x, points[0].y));
    return points;
  }

  const formatNumber = (value, digits) => finite(value) ? value.toFixed(digits) : "—";

  function percentile(values, q) {
    const sorted = values.filter(finite).slice().sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const index = (sorted.length - 1) * q, lower = Math.floor(index), upper = Math.ceil(index), mix = index - lower;
    return sorted[lower] * (1 - mix) + sorted[upper] * mix;
  }

  function pathData(points, close = false) {
    if (!points || !points.length) return "";
    const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
    for (let i = 1; i < points.length; i += 1) commands.push(`L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`);
    if (close) commands.push("Z");
    return commands.join(" ");
  }

  const polarPoint = (cx, cy, radius, angle) => point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));

  function setPreset(kind) {
    state.specimen = kind;
    state.rawPoints = makePreset(kind);
    state.gesturePoints = null; state.closure = null; state.cancelled = false;
    state.drawing = false;
    state.pointerId = null;
    els.drawPrompt.hidden = true;
    els.specimenName.textContent = presetNames[kind];
    els.preset.value = kind;
    renderClosureStatus();
    runAnalysis();
    syncViewUrl();
  }

  const smoothingPercent = () => Number(els.smoothing.value) / SAMPLE_COUNT * 100;

  function updateSmoothingLabels() {
    const pct = smoothingPercent();
    const label = pct === 0 ? "none (raw)" : `${pct.toFixed(1)}% circumference`;
    els.smoothingValue.textContent = label;
    els.smoothing.setAttribute("aria-valuetext", pct === 0 ? "No smoothing" : `${pct.toFixed(1)} percent of circumference`);
    els.smoothCount.textContent = `scale ${pct === 0 ? "raw" : `${pct.toFixed(1)}%`}`;
  }

  function runAnalysis(refreshComposite = true, deferCurveFlow = true) {
    updateSmoothingLabels();
    if (state.rawPoints.length < 3 || state.cancelled || state.drawing) {
      state.result = null;
      state.comprehensive = null;
      state.experimental = null;
      renderEmpty();
      return;
    }
    const analysisEngine = currentAnalysisEngine();
    state.result = analysisEngine.analyze(state.rawPoints, { sampleCount: SAMPLE_COUNT, smoothing: Number(els.smoothing.value) });
    if (refreshComposite || !state.comprehensive) {
      state.comprehensive = Composite.analyze(state.rawPoints, analysisEngine, state.policy);
      if (criteriaLab) criteriaLab.update(state.rawPoints, state.comprehensive);
      try {
        state.experimental = Experimental.analyze(state.rawPoints, analysisEngine, { sampleCount: SAMPLE_COUNT });
      } catch (_) {
        state.experimental = {
          valid: false, rows: [], reasons: ["The research preview encountered an unexpected numerical failure."],
          warnings: ["Core measurements remain available; this isolated experiment was skipped."],
        };
      }
    }
    renderAll(deferCurveFlow);
    if (refreshComposite) announceResult();
  }

  function renderAll(deferCurveFlow = false) {
    renderCanvas(); renderStatus(); renderMethodReading(); renderMetrics(); renderComprehensive(); renderMiniStages();
    renderRadialPlot(); renderCurvaturePlot(); renderHarmonicPlot(); renderCaliper(); renderTangentWalk();
    window.clearTimeout(flowAnalysisTimer);
    if (deferCurveFlow) {
      els.flowPlotSummary.textContent = "updating telescope…";
      flowAnalysisTimer = window.setTimeout(() => {
        flowAnalysisTimer = null;
        renderCurveFlow();
      }, 140);
    } else {
      renderCurveFlow();
    }
    renderExperimental();
  }

  function renderEmpty() {
    if (els.completion) els.completion.innerHTML = "";
    els.shapeFill.innerHTML = ""; els.reference.innerHTML = ""; els.residual.innerHTML = "";
    els.processed.innerHTML = ""; els.annotation.innerHTML = "";
    els.raw.innerHTML = state.rawPoints.length ? `<path d="${pathData(state.rawPoints)}" class="stage-raw-live" />` : "";
    els.pipelineSummary.textContent = "Draw a larger closed loop to begin the analysis";
    els.rmsMetric.textContent = "—"; els.zoneMetric.textContent = "—"; els.compactnessMetric.textContent = "—";
    els.methodValue.textContent = "—"; els.methodUnit.textContent = "";
    els.scoreDial.style.setProperty("--score", 0); els.scoreDial.classList.add("is-invalid");
    els.overallScore.textContent = "—"; els.overallLabel.textContent = "Not scorable";
    els.scoreConfidence.textContent = "—"; els.scoreConfidenceDetail.textContent = "Draw a complete loop to evaluate measurement confidence.";
    els.scoreStatus.textContent = "Finish a closed loop to unlock the composite score.";
    els.scaleStability.hidden = true; els.scaleStability.innerHTML = "";
    els.scoreComponents.innerHTML = ""; els.scoreLimiting.textContent = "";
    if (els.scoreEvidence) els.scoreEvidence.textContent = "";
    if (els.resultAnnouncer) els.resultAnnouncer.textContent = "Waiting for a new completed drawing.";
    els.rawCount.textContent = "—";
    els.inspectLimiting.disabled = true; els.inspectLimiting.textContent = "Inspect weakest lens";
    els.copySummary.disabled = true; els.copyViewLink.disabled = true; els.downloadJson.disabled = true; els.exportStatus.textContent = "";
    els.rawMini.innerHTML = ""; els.sampledMini.innerHTML = ""; els.smoothedMini.innerHTML = "";
    renderBlankPlot(els.radialPlot, "radial error appears after a complete stroke");
    renderBlankPlot(els.curvaturePlot, "curvature appears after a complete stroke");
    renderBlankPlot(els.harmonicPlot, "harmonics appear after a complete stroke");
    renderTangentWalkBlank("Draw a closed, simple loop to begin the tangent walk.");
    renderCurveFlowBlank("Draw a closed, simple loop to start the round-point telescope.");
    renderExperimentalBlank("Draw a closed, simple loop to enter the research preview.");
    els.radialSummary.textContent = "—"; els.curvatureSummary.textContent = "—"; els.harmonicSummary.textContent = "—";
  }

  function radialSpokes(points, fit, targetCount) {
    const stride = Math.max(1, Math.floor(points.length / targetCount));
    let spokes = "";
    for (let i = 0; i < points.length; i += stride) {
      const p = points[i], angle = Math.atan2(p.y - fit.cy, p.x - fit.cx);
      const q = polarPoint(fit.cx, fit.cy, fit.r, angle);
      const error = Math.hypot(p.x - fit.cx, p.y - fit.cy) - fit.r;
      spokes += `<line x1="${q.x}" y1="${q.y}" x2="${p.x}" y2="${p.y}" class="${error >= 0 ? "stage-spoke-positive" : "stage-spoke-negative"}" />`;
    }
    return spokes;
  }

  function radialExtremeMarkers(points, fit) {
    if (!points || !points.length || !fit || !finite(fit.r) || fit.r <= 0) return "";
    let bulge = null, dent = null;
    points.forEach((p) => {
      const distance = Math.hypot(p.x - fit.cx, p.y - fit.cy);
      const errorPct = (distance - fit.r) / fit.r * 100;
      const item = { p, distance, errorPct };
      if (!bulge || errorPct > bulge.errorPct) bulge = item;
      if (!dent || errorPct < dent.errorPct) dent = item;
    });
    if (!bulge || !dent || Math.max(Math.abs(bulge.errorPct), Math.abs(dent.errorPct)) < 0.02) return "";
    const marker = (item, kind) => {
      const ux = item.distance > 0 ? (item.p.x - fit.cx) / item.distance : 1;
      const uy = item.distance > 0 ? (item.p.y - fit.cy) / item.distance : 0;
      const direction = kind === "bulge" ? 1 : -1;
      const labelX = item.p.x + ux * 24 * direction;
      const labelY = item.p.y + uy * 24 * direction;
      const anchor = labelX >= item.p.x ? "start" : "end";
      const signed = item.errorPct >= 0 ? `+${item.errorPct.toFixed(2)}` : `−${Math.abs(item.errorPct).toFixed(2)}`;
      return `<g class="stage-extreme stage-extreme-${kind}">
        <line x1="${item.p.x}" y1="${item.p.y}" x2="${labelX}" y2="${labelY}" />
        <circle cx="${item.p.x}" cy="${item.p.y}" r="5"><title>${kind}: ${signed}% of fitted radius</title></circle>
        <text x="${labelX + (anchor === "start" ? 4 : -4)}" y="${labelY + 4}" text-anchor="${anchor}">${kind} ${signed}% R</text>
      </g>`;
    };
    return marker(bulge, "bulge") + marker(dent, "dent");
  }

  function renderCanvas() {
    const scoredAnalysis = state.comprehensive && state.comprehensive.analysis;
    const result = state.mode === "comprehensive" && scoredAnalysis ? scoredAnalysis : state.result;
    if (!result || !result.fit || !result.fit.valid) { renderEmpty(); return; }
    const rawPoints = result.points.raw, processed = result.points.smoothed, fit = result.fit;
    const zone = result.minimumZone, validity = result.validity;
    els.shapeFill.innerHTML = ""; els.reference.innerHTML = ""; els.residual.innerHTML = ""; els.annotation.innerHTML = "";
    const captured = state.gesturePoints || rawPoints;
    els.raw.innerHTML = `<path d="${pathData(captured)}" class="stage-raw" />`;
    if (els.completion) els.completion.innerHTML = completionMarkup(state.closure);
    els.processed.innerHTML = `<path d="${pathData(processed, !validity.open)}" class="stage-analysis" />`;

    const start = captured[0], end = captured[captured.length - 1];
    let annotations = `<circle cx="${start.x}" cy="${start.y}" r="4" class="stage-start" />
      <circle cx="${end.x}" cy="${end.y}" r="4" class="stage-end" />`;
    if (validity && validity.open) annotations += `<path d="M ${end.x} ${end.y} L ${start.x} ${start.y}" class="stage-closure" />`;

    if (state.mode === "comprehensive") {
      let combinedReference = `<circle cx="${fit.cx}" cy="${fit.cy}" r="${fit.r}" class="stage-fit-circle" />`;
      if (zone && zone.valid) {
        combinedReference += `<circle cx="${zone.cx}" cy="${zone.cy}" r="${zone.inner}" class="stage-zone-bound stage-zone-faint" />
          <circle cx="${zone.cx}" cy="${zone.cy}" r="${zone.outer}" class="stage-zone-bound stage-zone-faint" />`;
      }
      els.reference.innerHTML = combinedReference + centerMark(fit.cx, fit.cy, "ALL");
      els.residual.innerHTML = radialSpokes(processed, fit, 28);
      if (!validity.open) annotations += radialExtremeMarkers(processed, fit);
    } else if (state.method === "fit") {
      els.reference.innerHTML = `<circle cx="${fit.cx}" cy="${fit.cy}" r="${fit.r}" class="stage-fit-circle" />${centerMark(fit.cx, fit.cy, "LS")}`;
      els.residual.innerHTML = radialSpokes(processed, fit, 34);
    } else if (state.method === "zone" && zone && zone.valid) {
      const meanRadius = (zone.inner + zone.outer) / 2;
      els.reference.innerHTML = `<circle cx="${zone.cx}" cy="${zone.cy}" r="${meanRadius}" class="stage-zone-band" style="stroke-width:${Math.max(3, zone.width).toFixed(2)}" />
        <circle cx="${zone.cx}" cy="${zone.cy}" r="${zone.inner}" class="stage-zone-bound" />
        <circle cx="${zone.cx}" cy="${zone.cy}" r="${zone.outer}" class="stage-zone-bound" />${centerMark(zone.cx, zone.cy, "MZ")}`;
    } else if (state.method === "compactness") {
      if (validity.areaValid && result.geometry.area > 0) {
        const areaRadius = Math.sqrt(result.geometry.area / Math.PI), perimeterRadius = result.geometry.perimeter / TAU;
        els.shapeFill.innerHTML = `<path d="${pathData(processed, true)}" class="stage-shape-fill" />`;
        els.reference.innerHTML = `<circle cx="${fit.cx}" cy="${fit.cy}" r="${areaRadius}" class="stage-area-circle" />
          <circle cx="${fit.cx}" cy="${fit.cy}" r="${perimeterRadius}" class="stage-perimeter-circle" />${centerMark(fit.cx, fit.cy, "")}`;
      }
    } else if (state.method === "curvature") {
      els.processed.innerHTML = curvatureSegments(processed, result.profiles.curvatureSmoothed, !validity.open);
      els.reference.innerHTML = `<circle cx="${fit.cx}" cy="${fit.cy}" r="${fit.r}" class="stage-fit-circle stage-fit-faint" />`;
    } else if (state.method === "harmonics") {
      const dominant = dominantHarmonic(result.harmonics);
      els.reference.innerHTML = `<circle cx="${fit.cx}" cy="${fit.cy}" r="${fit.r}" class="stage-fit-circle stage-fit-faint" />
        <path d="${harmonicPath(fit, dominant)}" class="stage-harmonic" />${centerMark(fit.cx, fit.cy, dominant ? `n=${dominant.mode}` : "")}`;
    }
    els.annotation.innerHTML = annotations;
    const legend = state.mode === "comprehensive" ? "fit + tolerance band + residual extrema" : methodCopy[state.method].legend;
    els.overlayLegend.innerHTML = `<i class="legend-line legend-reference"></i>${legend}`;
  }

  function centerMark(cx, cy, label) {
    return `<path d="M ${cx - 7} ${cy} L ${cx + 7} ${cy} M ${cx} ${cy - 7} L ${cx} ${cy + 7}" class="stage-center" />
      ${label ? `<text x="${cx + 10}" y="${cy - 10}" class="stage-label">${label}</text>` : ""}`;
  }

  function curvatureSegments(points, values, closed = true) {
    if (!values || values.length !== points.length) return `<path d="${pathData(points, closed)}" class="stage-analysis" />`;
    let output = "";
    const segmentCount = closed ? points.length : points.length - 1;
    for (let i = 0; i < segmentCount; i += 1) {
      const next = (i + 1) % points.length, k = values[i];
      let className = "stage-curvature-good";
      if (!finite(k) || k < 0) className = "stage-curvature-negative";
      else if (k > 1.65) className = "stage-curvature-high";
      else if (k < 0.45) className = "stage-curvature-low";
      output += `<path d="M ${points[i].x} ${points[i].y} L ${points[next].x} ${points[next].y}" class="${className}" />`;
    }
    return output;
  }

  function dominantHarmonic(harmonics) {
    return (harmonics || []).filter((h) => h.mode >= 2 && finite(h.amplitudePct))
      .reduce((best, item) => !best || item.amplitudePct > best.amplitudePct ? item : best, null);
  }

  function harmonicPath(fit, harmonic) {
    if (!harmonic) return "";
    const points = [], cosine = finite(harmonic.cosinePct) ? harmonic.cosinePct : harmonic.a;
    const sine = finite(harmonic.sinePct) ? harmonic.sinePct : harmonic.b;
    for (let i = 0; i <= 180; i += 1) {
      const angle = i / 180 * TAU;
      const errorPct = cosine * Math.cos(harmonic.mode * angle) + sine * Math.sin(harmonic.mode * angle);
      points.push(polarPoint(fit.cx, fit.cy, fit.r * (1 + errorPct / 100), angle));
    }
    return pathData(points, true);
  }

  function renderStatus() {
    const result = state.result, validity = result && result.validity;
    els.traceStatus.classList.remove("is-warning");
    if (!result || !validity || !validity.fitValid) {
      els.traceStatus.textContent = "Need a larger loop"; els.traceStatus.classList.add("is-warning"); return;
    }
    if (validity.selfIntersecting) {
      els.traceStatus.textContent = "Self-intersection detected"; els.traceStatus.classList.add("is-warning");
    } else if (validity.open) {
      els.traceStatus.textContent = `Open trace · ${formatNumber(result.metrics.coveragePct, 0)}% coverage`; els.traceStatus.classList.add("is-warning");
    } else els.traceStatus.textContent = `Closed · ${formatNumber(result.metrics.coveragePct, 0)}% coverage`;
    const scale = smoothingPercent();
    els.pipelineSummary.textContent = `${(state.gesturePoints || result.points.raw).length} captured${state.closure && state.closure.applied ? " → gap completed" : ""} → ${result.points.resampled.length} equal-distance → ${scale === 0 ? "no smoothing" : `${scale.toFixed(1)}% smoothing scale`}`;
  }

  function announceResult() {
    if (!els.resultAnnouncer) return;
    const composite = state.comprehensive;
    const specimen = presetNames[state.specimen] || presetNames.custom;
    if (!composite) {
      els.resultAnnouncer.textContent = `${specimen}: draw a complete loop to begin analysis.`;
      return;
    }
    if (composite.valid) {
      const confidence = composite.robustness || {};
      els.resultAnnouncer.textContent = `${specimen}: ${Math.round(composite.score)} out of 100, ${composite.label}. ${confidence.band || "unrated"} measurement confidence.`;
    } else {
      const reason = composite.invalidReasons && composite.invalidReasons.length ? composite.invalidReasons[0] : "The contour did not pass the score checks.";
      els.resultAnnouncer.textContent = `${specimen}: not scorable. ${reason}`;
    }
  }

  function renderMethodReading() {
    const result = state.result, copy = methodCopy[state.method], metrics = result ? result.metrics : {}, validity = result ? result.validity : {};
    let value = "—", unit = "", description = copy.description;
    if (state.method === "fit") { value = formatNumber(metrics.rmsPct, 2); unit = "% of fitted radius"; }
    else if (state.method === "zone") { value = formatNumber(metrics.zonePct, 2); unit = "% radius · band width"; }
    else if (state.method === "compactness") {
      if (validity.compactnessValid) { value = formatNumber(metrics.compactness, 4); unit = "ideal = 1.0000"; }
      else { value = "N/A"; unit = "requires a closed simple loop"; description = "Area compactness is disabled because this trace is open or self-intersecting; silently bridging it would invent an interior."; }
    } else if (state.method === "curvature") { value = formatNumber(metrics.curvatureRms, 2); unit = "RMS variation of κR"; }
    else if (state.method === "harmonics") {
      const dominant = result ? dominantHarmonic(result.harmonics) : null;
      if (validity.open) {
        value = "N/A";
        unit = "requires a full 360° trace";
        description = "Radial harmonics are disabled for this incomplete outline; filling the missing angles would invent a shape that was never drawn.";
      } else {
        value = dominant ? `n = ${dominant.mode}` : "—";
        unit = dominant ? `${formatNumber(dominant.amplitudePct, 2)}% radial amplitude` : "";
      }
    }
    els.methodKicker.textContent = copy.kicker; els.methodTitle.textContent = copy.title;
    els.methodValue.textContent = value; els.methodUnit.textContent = unit; els.methodDescription.textContent = description;
    els.methodGoodAt.textContent = copy.good; els.methodMisses.textContent = copy.misses; els.methodFormula.textContent = copy.formula;
  }

  function renderMetrics() {
    const result = state.result;
    if (!result) return;
    els.rmsMetric.textContent = `${formatNumber(result.metrics.rmsPct, 2)}% R`;
    els.zoneMetric.textContent = `${formatNumber(result.metrics.zonePct, 2)}% R`;
    els.compactnessMetric.textContent = result.validity.compactnessValid ? formatNumber(result.metrics.compactness, 4) : "N/A";
  }

  const componentPresentation = {
    rms: { label: "Average radial fit", code: "A", unit: (item) => `${formatNumber(item.raw, 2)}% R RMS` },
    zone: { label: "Minimum-zone band", code: "B", unit: (item) => `${formatNumber(item.raw, 2)}% R width` },
    compactness: { label: "Compactness", code: "C", unit: (item) => finite(item.raw) ? `C = ${formatNumber(item.raw, 4)}` : "requires area" },
    curvature: { label: "Curvature consistency", code: "D", unit: (item) => `${formatNumber(item.raw, 2)} RMS from κR = 1` },
    harmonics: { label: "Harmonic wobble · modes 2–12", code: "E", unit: (item) => finite(item.raw) ? `n=${item.mode} · ${formatNumber(item.raw, 2)}% R` : "requires 360° profile" },
  };

  function renderComprehensive() {
    renderScoreFormula();
    const composite = state.comprehensive;
    if (!composite) return;
    els.copySummary.disabled = false;
    els.downloadJson.disabled = false;
    const robustness = composite.robustness || {};
    const scaleSweep = robustness.scaleScores || {};
    const nearbyScaleRange = finite(scaleSweep.range) ? scaleSweep.range : robustness.scaleRange;
    els.scoreDial.classList.toggle("is-invalid", !composite.valid);
    els.scoreDial.style.setProperty("--score", composite.valid ? composite.score : 0);
    els.overallScore.textContent = composite.valid ? Math.round(composite.score) : "—";
    els.overallLabel.textContent = composite.label;

    if (composite.valid) {
      const band = robustness.band || "low";
      els.scoreConfidence.textContent = `${band[0].toUpperCase() + band.slice(1)} · ${Math.round(robustness.value)}/100`;
      const caveats = robustness.reasons && robustness.reasons.length ? `Sensitivity factors: ${robustness.reasons.join(", ")}. ` : "";
      els.scoreConfidenceDetail.textContent = `${caveats}Nearby smoothing scales span ${formatNumber(nearbyScaleRange, 1)} points. This is a heuristic evidence index, not a statistical confidence probability.`;
      els.scoreStatus.classList.remove("is-warning");
      els.scoreStatus.textContent = state.closure && state.closure.applied
        ? `Completed contour scored · ${formatNumber(state.closure.coveragePct, 1)}% captured angular coverage before the seam.`
        : `Scored on ${formatNumber(composite.measuredCoveragePct, 1)}% measured angular coverage.`;
      const samples = Array.isArray(scaleSweep.smoothingSamples) ? scaleSweep.smoothingSamples : [2, 3, 4];
      const scaleEntries = [
        { name: "Fine", sample: samples[0], score: scaleSweep.fine },
        { name: "Declared", sample: samples[1], score: scaleSweep.standard },
        { name: "Coarse", sample: samples[2], score: scaleSweep.coarse },
      ];
      if (scaleEntries.every((entry) => finite(entry.score))) {
        els.scaleStability.hidden = false;
        els.scaleStability.innerHTML = `<div class="scale-stability-head"><strong>Nearby-scale stability</strong><span>${formatNumber(nearbyScaleRange, 1)}-point span</span></div>
          <div class="scale-stability-grid">${scaleEntries.map((entry) => `<div class="scale-stability-cell${entry.name === "Declared" ? " is-declared" : ""}">
            <span>${entry.name} · σ=${entry.sample} (${formatNumber(entry.sample / SAMPLE_COUNT * 100, 2)}%)</span><strong>${Math.round(entry.score)}</strong>
          </div>`).join("")}</div>`;
      } else {
        els.scaleStability.hidden = true;
        els.scaleStability.innerHTML = "";
      }
    } else {
      els.scoreConfidence.textContent = "Not evaluated";
      els.scoreConfidenceDetail.textContent = "The contour must first pass the closure, coverage, and simple-loop checks.";
      els.scoreStatus.classList.add("is-warning");
      els.scoreStatus.innerHTML = `<strong>Score withheld.</strong> ${composite.invalidReasons.slice(0, 3).join(" ")}`;
      els.scaleStability.hidden = true;
      els.scaleStability.innerHTML = "";
    }

    const rows = Object.keys(componentPresentation).map((key) => {
      const item = composite.components[key], copy = componentPresentation[key];
      const quality = finite(item.quality) ? Math.max(0, Math.min(100, item.quality)) : null;
      const qualityLabel = finite(quality) ? `${quality.toFixed(0)} / 100` : "—";
      return `<article class="score-component" data-measure="${key}">
        <div class="component-code">${copy.code}</div>
        <div class="component-main">
          <div class="component-title"><strong>${copy.label}</strong><span>${copy.unit(item)}</span></div>
          <div class="component-track" aria-hidden="true"><i style="width:${finite(quality) ? quality : 0}%"></i></div>
        </div>
        <div class="component-quality"><strong>${qualityLabel}</strong><span>${state.policy === "bottleneck" ? "minimum rule" : `${Math.round(item.weight * 100)}% weight`}</span></div>
      </article>`;
    });
    els.scoreComponents.innerHTML = rows.join("");

    if (composite.valid && composite.limitingComponent) {
      const limiting = componentPresentation[composite.limitingComponent];
      const ruleNotes = {
        geometric: "The geometric mean limits compensation, but it can still conceal a severe defect in a lightly weighted component.",
        arithmetic: "The arithmetic mean permits stronger compensation between high and low component qualities.",
        bottleneck: "The lowest component sets the result. No compensation is allowed; noise in one measurement can dominate.",
      };
      els.scoreLimiting.innerHTML = `<strong>${state.policy === "bottleneck" ? "Limiting component" : "Largest composite penalty"}:</strong> ${limiting.label}. ${ruleNotes[state.policy]}`;
      els.inspectLimiting.disabled = false;
      els.inspectLimiting.textContent = `Inspect ${limiting.label.toLowerCase()}`;
    } else {
      els.scoreLimiting.textContent = "Individual diagnostics remain visible even when the overall score is withheld.";
      els.inspectLimiting.disabled = true;
      els.inspectLimiting.textContent = "Inspect weakest lens";
    }
    if (els.scoreEvidence) {
      const radius = composite.analysis && composite.analysis.fit && composite.analysis.fit.r;
      els.scoreEvidence.textContent = finite(radius)
        ? `Fitted radius ${formatNumber(radius, 1)} input units. Rescaling the same resolved contour preserves its geometric score; smaller capture size provides less spatial evidence. The input canvas is 640 × 520 coordinate units.`
        : "Spatial evidence requires a stable fitted radius.";
    }
  }

  function renderScoreFormula() {
    const policy = Composite.POLICIES[state.policy];
    if (els.policyFormula) els.policyFormula.textContent = window.RoundnessScoreFormula
      ? window.RoundnessScoreFormula.accessibleFormula(state.policy) : policy.formula;
    if (els.policyExplanation) els.policyExplanation.textContent = policy.description;
    if (window.RoundnessScoreFormula) window.RoundnessScoreFormula.render(
      $("scoreFormulaDiagram"), $("qualityFormulaDiagram"), state.policy, Composite.MODEL);
  }

  const componentMethods = { rms: "fit", zone: "zone", compactness: "compactness", curvature: "curvature", harmonics: "harmonics" };

  function currentViewState() {
    return { specimen: state.specimen, mode: state.mode, method: state.method, smoothing: Number(els.smoothing.value), policy: state.policy };
  }

  function syncViewUrl() {
    const shareable = ViewState.isShareableSpecimen(state.specimen);
    els.copyViewLink.disabled = !shareable;
    els.copyViewLink.title = shareable ? "Copy a link to this preset and analysis view" : "Custom drawings are shared with Download JSON";
    if (!window.location || !window.history || typeof window.history.replaceState !== "function") return;
    try {
      const url = shareable ? ViewState.toUrl(window.location.href, currentViewState()) : ViewState.clearUrlState(window.location.href);
      window.history.replaceState(null, "", url);
    } catch (_) { /* URL state is an enhancement; analysis still works without it. */ }
  }

  function restoreViewFromUrl() {
    const view = ViewState.parse(window.location && window.location.search ? window.location.search : "");
    els.smoothing.value = view.smoothing;
    state.policy = view.policy;
    if (els.scoringPolicy) els.scoringPolicy.value = state.policy;
    selectMode(view.mode);
    selectMethod(view.method);
    setPreset(view.specimen);
  }

  function inspectLimitingComponent() {
    if (!state.comprehensive || !state.comprehensive.valid) return;
    const method = componentMethods[state.comprehensive.limitingComponent];
    if (!method) return;
    selectMode("explore");
    selectMethod(method);
    const selectedTab = els.methodTabs.querySelector(`[data-method="${method}"]`);
    if (selectedTab && typeof selectedTab.focus === "function") selectedTab.focus();
  }

  let exportFeedbackTimer = null;

  function currentReport() {
    return Reporting.buildReport({
      specimenKey: state.specimen,
      specimenName: presetNames[state.specimen] || presetNames.custom,
      rawPoints: state.gesturePoints || state.rawPoints,
      analyzedPoints: state.rawPoints,
      completion: state.closure,
      result: state.result,
      composite: state.comprehensive,
      smoothing: Number(els.smoothing.value),
    });
  }

  function showExportStatus(message, isError = false) {
    window.clearTimeout(exportFeedbackTimer);
    els.exportStatus.textContent = message;
    els.exportStatus.classList.toggle("is-error", isError);
    exportFeedbackTimer = window.setTimeout(() => {
      els.exportStatus.textContent = "";
      els.exportStatus.classList.remove("is-error");
    }, 3200);
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const previousFocus = document.activeElement;
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.className = "clipboard-fallback";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    if (!copied) throw new Error("Legacy clipboard copy failed.");
  }

  async function copyResultSummary() {
    if (!state.comprehensive) return;
    try {
      await writeClipboard(Reporting.summaryText(currentReport()));
      showExportStatus("Summary copied.");
    } catch (_) {
      showExportStatus("Copy unavailable in this browser.", true);
    }
  }

  async function copyCurrentViewLink() {
    if (!ViewState.isShareableSpecimen(state.specimen)) {
      showExportStatus("Use Download JSON to share a custom drawing.", true);
      return;
    }
    try {
      await writeClipboard(ViewState.toUrl(window.location.href, currentViewState()));
      showExportStatus("View link copied.");
    } catch (_) {
      showExportStatus("Link copy unavailable in this browser.", true);
    }
  }

  function safeFilename(report) {
    const name = report.specimen.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "drawing";
    const timestamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
    return `roundness-${name}-${timestamp}.json`;
  }

  function downloadResultJson() {
    if (!state.comprehensive || typeof Blob === "undefined" || !URL || typeof URL.createObjectURL !== "function") {
      showExportStatus("Download unavailable in this browser.", true);
      return;
    }
    try {
      const report = currentReport();
      const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = safeFilename(report);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showExportStatus("JSON downloaded.");
    } catch (_) {
      showExportStatus("Download unavailable in this browser.", true);
    }
  }

  function fitMiniTransform(groups) {
    const points = groups.flat().filter((p) => finite(p.x) && finite(p.y));
    if (!points.length) return (p) => p;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY), scale = Math.min(220 / width, 116 / height);
    const offsetX = 130 - (minX + maxX) / 2 * scale, offsetY = 75 - (minY + maxY) / 2 * scale;
    return (p) => point(p.x * scale + offsetX, p.y * scale + offsetY);
  }

  function renderMiniStages() {
    const result = state.result;
    if (!result) return;
    const raw = state.gesturePoints || result.points.raw, sampled = result.points.resampled, smoothed = result.points.smoothed;
    const transform = fitMiniTransform([raw, sampled, smoothed]);
    const rawT = raw.map(transform), sampledT = sampled.map(transform), smoothedT = smoothed.map(transform);
    els.rawCount.textContent = `${raw.length} points`;
    let rawDots = "";
    for (let i = 0, stride = Math.max(1, Math.ceil(rawT.length / 70)); i < rawT.length; i += stride) rawDots += `<circle cx="${rawT[i].x}" cy="${rawT[i].y}" r="1.7" class="mini-dot-raw" />`;
    els.rawMini.innerHTML = `<path d="${pathData(rawT)}" class="mini-path-raw" />${rawDots}`;
    let sampleDots = "";
    for (let i = 0; i < sampledT.length; i += 10) sampleDots += `<circle cx="${sampledT[i].x}" cy="${sampledT[i].y}" r="2.2" class="mini-dot-sample" />`;
    const closeMini = !result.validity.open;
    els.sampledMini.innerHTML = `<path d="${pathData(sampledT, closeMini)}" class="mini-path-sample" />${sampleDots}`;
    els.smoothedMini.innerHTML = `<path d="${pathData(sampledT, closeMini)}" class="mini-path-before" /><path d="${pathData(smoothedT, closeMini)}" class="mini-path-smooth" />`;
  }

  function renderBlankPlot(svg, message) {
    svg.innerHTML = `<rect x="46" y="24" width="450" height="184" class="chart-empty-box" /><text x="271" y="119" text-anchor="middle" class="chart-label">${message}</text>`;
  }

  function chartScaffold({ yMin, yMax, yTicks, ideal, xLabels }) {
    const left = 48, right = 500, top = 20, bottom = 210;
    const y = (value) => bottom - ((value - yMin) / (yMax - yMin || 1)) * (bottom - top);
    let markup = "";
    for (const tick of yTicks) {
      const yy = y(tick);
      markup += `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" class="chart-grid" /><text x="40" y="${yy + 3}" text-anchor="end" class="chart-label">${formatAxis(tick)}</text>`;
    }
    xLabels.forEach((label, index) => {
      const x = left + index / (xLabels.length - 1) * (right - left);
      markup += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="chart-grid" /><text x="${x}" y="231" text-anchor="middle" class="chart-label">${label}</text>`;
    });
    if (finite(ideal) && ideal >= yMin && ideal <= yMax) markup += `<line x1="${left}" y1="${y(ideal)}" x2="${right}" y2="${y(ideal)}" class="chart-ideal" />`;
    markup += `<path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom}" class="chart-axis" />`;
    return { markup, x: (t) => left + t * (right - left), y, left, right, top, bottom };
  }

  function formatAxis(value) {
    const abs = Math.abs(value);
    return abs >= 10 ? value.toFixed(0) : abs >= 1 ? value.toFixed(1) : value.toFixed(2);
  }

  function linePath(values, x, y, clampMin = -Infinity, clampMax = Infinity) {
    const valid = values.map((value, index) => ({ value, index })).filter((item) => finite(item.value));
    return valid.map((item, sequenceIndex) => {
      const xx = x(item.index / Math.max(1, values.length - 1)), yy = y(Math.max(clampMin, Math.min(clampMax, item.value)));
      return `${sequenceIndex === 0 ? "M" : "L"} ${xx.toFixed(2)} ${yy.toFixed(2)}`;
    }).join(" ");
  }

  function renderRadialPlot() {
    const result = state.result, values = result && result.profiles ? result.profiles.residualPct : [];
    if (!values || !values.length) {
      renderBlankPlot(els.radialPlot, "full 360° profile requires a closed trace");
      els.radialSummary.textContent = "N/A · closed loop required";
      return;
    }
    const maxAbs = Math.max(...values.filter(finite).map((v) => Math.abs(v)), 0.1), bound = Math.max(0.25, Math.min(25, maxAbs * 1.13));
    const scaffold = chartScaffold({ yMin: -bound, yMax: bound, yTicks: [-bound, 0, bound], ideal: 0, xLabels: ["0°", "90°", "180°", "270°", "360°"] });
    const line = linePath(values, scaffold.x, scaffold.y, -bound, bound), zeroY = scaffold.y(0);
    const area = `${line} L ${scaffold.right} ${zeroY} L ${scaffold.left} ${zeroY} Z`;
    const maxValue = Math.max(...values), minValue = Math.min(...values), maxIndex = values.indexOf(maxValue), minIndex = values.indexOf(minValue);
    els.radialPlot.innerHTML = `${scaffold.markup}<path d="${area}" class="chart-area" /><path d="${line}" class="chart-line-main" />
      ${plotPoint(scaffold.x(maxIndex / Math.max(1, values.length - 1)), scaffold.y(maxValue), `${maxValue.toFixed(2)}%`, "chart-peak")}
      ${plotPoint(scaffold.x(minIndex / Math.max(1, values.length - 1)), scaffold.y(minValue), `${minValue.toFixed(2)}%`, "chart-valley")}
      <text x="7" y="15" class="chart-label">error %R</text>`;
    els.radialSummary.textContent = `RMS ${formatNumber(result.metrics.rmsPct, 2)}% · P95 ${formatNumber(result.metrics.p95Pct, 2)}%`;
  }

  const plotPoint = (x, y, label, className) => `<circle cx="${x}" cy="${y}" r="3.5" class="${className}"><title>${label}</title></circle>`;

  function renderCurvaturePlot() {
    const result = state.result, raw = result && result.profiles ? result.profiles.curvatureRaw : [], smooth = result && result.profiles ? result.profiles.curvatureSmoothed : [];
    if (!smooth || !smooth.length) {
      renderBlankPlot(els.curvaturePlot, "curvature profile unavailable");
      els.curvatureSummary.textContent = "N/A";
      return;
    }
    const combined = raw.concat(smooth).filter(finite), low = Math.min(-0.5, percentile(combined, 0.03)), high = Math.max(2.5, percentile(combined, 0.97));
    const yMin = Math.max(-4, low - 0.2), yMax = Math.min(7, high + 0.2), mid = (yMin + yMax) / 2;
    const scaffold = chartScaffold({ yMin, yMax, yTicks: [yMin, mid, yMax], ideal: 1, xLabels: ["0%", "25%", "50%", "75%", "100%"] });
    const rawLine = linePath(raw, scaffold.x, scaffold.y, yMin, yMax), smoothLine = linePath(smooth, scaffold.x, scaffold.y, yMin, yMax);
    let negativeMarks = "";
    for (let i = 0, stride = Math.max(1, Math.floor(smooth.length / 80)); i < smooth.length; i += stride) {
      if (finite(smooth[i]) && smooth[i] < 0) negativeMarks += `<circle cx="${scaffold.x(i / Math.max(1, smooth.length - 1))}" cy="${scaffold.y(Math.max(yMin, smooth[i]))}" r="2" class="chart-negative" />`;
    }
    els.curvaturePlot.innerHTML = `${scaffold.markup}<path d="${rawLine}" class="chart-line-secondary chart-line-raw" /><path d="${smoothLine}" class="chart-line-main" />${negativeMarks}
      <text x="7" y="15" class="chart-label">κR</text><text x="492" y="${scaffold.y(1) - 6}" text-anchor="end" class="chart-label chart-ideal-label">circle = 1</text>`;
    els.curvatureSummary.textContent = `RMS from 1: ${formatNumber(result.metrics.curvatureRms, 2)}`;
  }

  function renderHarmonicPlot() {
    const result = state.result, harmonics = result ? result.harmonics : [];
    if (!harmonics || !harmonics.length) {
      renderBlankPlot(els.harmonicPlot, "harmonics require a full 360° trace");
      els.harmonicSummary.textContent = "N/A · closed loop required";
      return;
    }
    const maxValue = Math.max(0.1, ...harmonics.map((h) => h.amplitudePct).filter(finite));
    const top = 22, bottom = 210, left = 48, right = 500, slot = (right - left) / harmonics.length, barWidth = slot * 0.62;
    const dominant = dominantHarmonic(harmonics);
    let bars = "";
    harmonics.forEach((harmonic, index) => {
      const value = finite(harmonic.amplitudePct) ? harmonic.amplitudePct : 0, height = value / maxValue * (bottom - top - 13);
      const x = left + index * slot + (slot - barWidth) / 2, y = bottom - height, isDominant = dominant && harmonic.mode === dominant.mode;
      bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="2" class="chart-bar${isDominant ? " is-dominant" : ""}"><title>Mode ${harmonic.mode}: ${value.toFixed(3)}% of radius</title></rect>
        <text x="${x + barWidth / 2}" y="229" text-anchor="middle" class="chart-label">${harmonic.mode}</text>`;
      if (harmonic.mode >= 2 && harmonic.mode <= 4) {
        const names = { 2: "oval", 3: "tri", 4: "square" };
        bars += `<text x="${x + barWidth / 2}" y="242" text-anchor="middle" class="chart-label chart-mode-label">${names[harmonic.mode]}</text>`;
      }
      if (isDominant && height > 18) bars += `<text x="${x + barWidth / 2}" y="${Math.max(13, y - 7)}" text-anchor="middle" class="chart-label chart-dominant-label">${value.toFixed(2)}%</text>`;
    });
    let grid = "";
    [0, 0.5, 1].forEach((fraction) => {
      const y = bottom - fraction * (bottom - top - 13);
      grid += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" class="chart-grid" /><text x="40" y="${y + 3}" text-anchor="end" class="chart-label">${(maxValue * fraction).toFixed(maxValue >= 2 ? 1 : 2)}</text>`;
    });
    els.harmonicPlot.innerHTML = `${grid}<path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom}" class="chart-axis" />${bars}<text x="7" y="15" class="chart-label">amplitude %R</text>`;
    els.harmonicSummary.textContent = dominant ? `dominant n=${dominant.mode} · ${formatNumber(dominant.amplitudePct, 2)}% R` : "—";
  }

  function caliperScore(amplitude) {
    const key = state.policy + ":" + amplitude.toFixed(3);
    if (caliperScoreCache.has(key)) return caliperScoreCache.get(key);
    let score = null;
    try {
      const contour = ConstantWidth.generate(amplitude, { radius: 100, count: 360, close: true });
      const result = Composite.analyze(contour, Engine, state.policy);
      score = result && result.valid && finite(result.score) ? result.score : null;
    } catch (_) {
      score = null;
    }
    caliperScoreCache.set(key, score);
    return score;
  }

  function caliperWidthAnalysis(amplitude) {
    const key = amplitude.toFixed(3);
    if (caliperWidthCache.has(key)) return caliperWidthCache.get(key);
    const contour = ConstantWidth.generate(amplitude, { radius: 100, count: 720 });
    const analysis = ConstantWidth.analyzeWidth(contour, 720);
    caliperWidthCache.set(key, analysis);
    return analysis;
  }

  function renderCaliperDemo(amplitude, orientation) {
    const centerX = 360, centerY = 210, radius = 165;
    const pose = ConstantWidth.caliperPose(amplitude, radius, orientation, {
      cx: centerX, cy: centerY, count: 540,
    });
    const midpoint = pose.contactMidpoint, origin = pose.supportOrigin;
    const labelY = Math.max(34, Math.min(388, midpoint.y - 11));
    const angleDegrees = Math.round(orientation / Math.PI * 180);
    els.caliperDemo.innerHTML = `<title id="caliperDemoTitle">A constant-width curve rolling between fixed parallel calipers</title>
      <desc id="caliperDemoDescription">At deformation ${amplitude.toFixed(3)} and roll angle ${angleDegrees} degrees, the curve remains tangent to rails separated by exactly two R while its support origin and contact midpoint move.</desc>
      <rect x="1" y="1" width="718" height="418" rx="15" class="caliper-field" />
      <line x1="${pose.leftRailX}" y1="18" x2="${pose.leftRailX}" y2="402" class="caliper-rail" />
      <line x1="${pose.rightRailX}" y1="18" x2="${pose.rightRailX}" y2="402" class="caliper-rail" />
      <path d="${pathData(pose.points, true)}" class="caliper-shape" />
      <line x1="${pose.negativeContact.x}" y1="${pose.negativeContact.y}" x2="${pose.positiveContact.x}" y2="${pose.positiveContact.y}" class="caliper-contact-chord" />
      <circle cx="${pose.negativeContact.x}" cy="${pose.negativeContact.y}" r="5" class="caliper-contact"><title>Left support contact</title></circle>
      <circle cx="${pose.positiveContact.x}" cy="${pose.positiveContact.y}" r="5" class="caliper-contact"><title>Right support contact</title></circle>
      <text x="${midpoint.x}" y="${labelY}" text-anchor="middle" class="caliper-chord-label">contact chord = 2R</text>
      <line x1="${origin.x}" y1="${origin.y}" x2="${midpoint.x}" y2="${midpoint.y}" class="caliper-center-link" />
      <path d="M ${origin.x - 7} ${origin.y} L ${origin.x + 7} ${origin.y} M ${origin.x} ${origin.y - 7} L ${origin.x} ${origin.y + 7}" class="caliper-support-origin"><title>Support-function origin</title></path>
      <circle cx="${midpoint.x}" cy="${midpoint.y}" r="4.5" class="caliper-contact-midpoint"><title>Midpoint of opposite contacts</title></circle>
      <g class="caliper-key" aria-hidden="true">
        <path d="M 202 398 L 216 398 M 209 391 L 209 405" class="caliper-support-origin" />
        <text x="222" y="402">support origin</text>
        <circle cx="375" cy="398" r="4.5" class="caliper-contact-midpoint" />
        <text x="386" y="402">contact midpoint</text>
      </g>`;
  }

  function renderCaliperWidthPlot(analysis, orientation) {
    if (!analysis || !analysis.valid || !analysis.values.length) {
      els.caliperWidthPlot.innerHTML = "";
      els.caliperWidthSummary.textContent = "sample unavailable";
      return;
    }
    const left = 64, right = 742, top = 20, bottom = 157, bound = 0.01;
    const x = (fraction) => left + fraction * (right - left);
    const y = (value) => bottom - (value + bound) / (bound * 2) * (bottom - top);
    let markup = "";
    [-bound, 0, bound].forEach((tick) => {
      const yy = y(tick);
      markup += `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" class="chart-grid" />
        <text x="${left - 9}" y="${yy + 4}" text-anchor="end" class="chart-label">${tick.toFixed(2)}</text>`;
    });
    [0, 45, 90, 135, 180].forEach((angle) => {
      const xx = x(angle / 180);
      markup += `<line x1="${xx}" y1="${top}" x2="${xx}" y2="${bottom}" class="chart-grid" />
        <text x="${xx}" y="178" text-anchor="${angle === 0 ? "start" : angle === 180 ? "end" : "middle"}" class="chart-label">${angle}°</text>`;
    });
    const values = analysis.values.map((item) => item.deviationPct);
    const periodicValues = values.concat(values[0]);
    const path = linePath(periodicValues, x, y, -bound, bound);
    const orientationFraction = Math.max(0, Math.min(1, orientation / Math.PI));
    const samplePosition = orientationFraction * values.length;
    const sampleFloor = Math.floor(samplePosition);
    const markerIndex = sampleFloor % values.length;
    const nextIndex = (markerIndex + 1) % values.length;
    const mix = samplePosition - sampleFloor;
    const markerValue = values[markerIndex] + (values[nextIndex] - values[markerIndex]) * mix;
    const markerX = x(orientationFraction), markerY = y(Math.max(-bound, Math.min(bound, markerValue)));
    markup += `<line x1="${left}" y1="${y(0)}" x2="${right}" y2="${y(0)}" class="chart-ideal" />
      <path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom}" class="chart-axis" />
      <path d="${path}" class="caliper-width-line" />
      <line id="caliperWidthGuide" x1="${markerX}" y1="${top}" x2="${markerX}" y2="${bottom}" class="caliper-width-guide" />
      <circle id="caliperWidthMarker" cx="${markerX}" cy="${markerY}" r="4" class="caliper-width-marker"><title>Current roll direction</title></circle>
      <text x="12" y="14" class="chart-label">deviation %</text>
      <text x="${(left + right) / 2}" y="201" text-anchor="middle" class="chart-label caliper-axis-title">support-line direction θ</text>`;
    els.caliperWidthPlot.innerHTML = markup;
    els.caliperWidthSummary.textContent = `720-point span ${formatNumber(analysis.spanPct, 4)}%`;
  }

  function updateCaliperWidthMarker(analysis, orientation) {
    if (!analysis || !analysis.valid || !analysis.values.length || typeof els.caliperWidthPlot.querySelector !== "function") return false;
    const guide = els.caliperWidthPlot.querySelector("#caliperWidthGuide");
    const marker = els.caliperWidthPlot.querySelector("#caliperWidthMarker");
    if (!guide || !marker) return false;
    const left = 64, right = 742, top = 20, bottom = 157, bound = 0.01;
    const fraction = Math.max(0, Math.min(1, orientation / Math.PI));
    const values = analysis.values.map((item) => item.deviationPct);
    const samplePosition = fraction * values.length;
    const sampleFloor = Math.floor(samplePosition);
    const index = sampleFloor % values.length;
    const nextIndex = (index + 1) % values.length;
    const mix = samplePosition - sampleFloor;
    const value = values[index] + (values[nextIndex] - values[index]) * mix;
    const markerX = left + fraction * (right - left);
    const markerY = bottom - (Math.max(-bound, Math.min(bound, value)) + bound) / (bound * 2) * (bottom - top);
    guide.setAttribute("x1", markerX);
    guide.setAttribute("x2", markerX);
    marker.setAttribute("cx", markerX);
    marker.setAttribute("cy", markerY);
    return true;
  }

  function renderSupportSpectrum(amplitude) {
    const left = 92, right = 738, rowTop = 35, rowBottom = 122, baseline = 92;
    const slot = (right - left) / 7, barWidth = Math.min(48, slot * 0.54);
    const normalizedAmplitude = Math.abs(amplitude) * 100;
    const boundary = [100, 0, 0, normalizedAmplitude, 0, 0, 0];
    const width = [100, 0, 0, 0, 0, 0, 0];
    const modeHeight = (value) => Math.max(value > 0 ? 3 : 0, value / 12 * 56);
    let markup = `<line x1="${left}" y1="${baseline}" x2="${right}" y2="${baseline}" class="support-spectrum-axis" />
      <line x1="${left}" y1="${baseline + rowBottom - rowTop}" x2="${right}" y2="${baseline + rowBottom - rowTop}" class="support-spectrum-axis" />
      <text x="12" y="56" class="support-spectrum-label">support h</text>
      <text x="12" y="143" class="support-spectrum-label">width w</text>
      <text x="${left + slot * 0.5}" y="26" text-anchor="middle" class="support-spectrum-label">DC</text>`;
    boundary.forEach((value, mode) => {
      const center = left + (mode + 0.5) * slot;
      const boundaryHeight = mode === 0 ? 56 : modeHeight(value);
      const widthHeight = mode === 0 ? 56 : modeHeight(width[mode]);
      markup += `<line x1="${center}" y1="${rowTop}" x2="${center}" y2="${baseline + rowBottom - rowTop}" class="support-spectrum-tick" />
        <rect x="${center - barWidth / 2}" y="${baseline - boundaryHeight}" width="${barWidth}" height="${boundaryHeight}" rx="2" class="support-spectrum-bar"><title>${mode === 0 ? "Support DC: row-normalized 100% (coefficient R)" : `Support mode ${mode}: ${value.toFixed(1)}% of R`}</title></rect>
        <rect x="${center - barWidth / 2}" y="${baseline + rowBottom - rowTop - widthHeight}" width="${barWidth}" height="${widthHeight}" rx="2" class="support-spectrum-bar is-width"><title>${mode === 0 ? "Width DC: row-normalized 100% (coefficient 2R)" : `Width mode ${mode}: ${width[mode].toFixed(1)}% of R`}</title></rect>
        <text x="${center}" y="211" text-anchor="middle" class="support-spectrum-label">n=${mode}</text>`;
      if (mode === 3 && value > 0) {
        const widthBase = baseline + rowBottom - rowTop;
        markup += `<circle cx="${center}" cy="${widthBase - 2}" r="4" class="support-spectrum-zero"><title>Odd mode cancels from width</title></circle>
          <path d="M ${center - 7} ${widthBase - 9} L ${center + 7} ${widthBase + 5} M ${center + 7} ${widthBase - 9} L ${center - 7} ${widthBase + 5}" class="support-spectrum-cancel" />`;
      }
    });
    markup += `<text x="${right}" y="16" text-anchor="end" class="support-spectrum-label">modes n≥1 use a 0–12% scale</text>`;
    els.supportSpectrum.innerHTML = markup;
    els.supportSpectrumSummary.textContent = amplitude < 0.001 ? "circle: DC only" : `n=3 ${normalizedAmplitude.toFixed(1)}% in h · 0% in w`;
  }

  function renderCaliperAngle() {
    const amplitude = Number(els.caliperDeformation.value) / 1000;
    const angleDegrees = Number(els.caliperAngle.value);
    const orientation = angleDegrees / 180 * Math.PI;
    els.caliperAngleValue.textContent = `${Math.round(angleDegrees)}°`;
    els.caliperAngle.setAttribute("aria-valuetext", `${Math.round(angleDegrees)} degrees`);
    renderCaliperDemo(amplitude, orientation);
    const sampledWidth = caliperWidthAnalysis(amplitude);
    if (!updateCaliperWidthMarker(sampledWidth, orientation)) renderCaliperWidthPlot(sampledWidth, orientation);
  }

  function renderCaliper() {
    const amplitude = Number(els.caliperDeformation.value) / 1000;
    const angleDegrees = Number(els.caliperAngle.value);
    const orientation = angleDegrees / 180 * Math.PI;
    const properties = ConstantWidth.properties(amplitude, 1);
    const sampledWidth = caliperWidthAnalysis(amplitude);
    const score = caliperScore(amplitude);

    els.caliperDeformationValue.textContent = `a = ${amplitude.toFixed(3)}`;
    els.caliperDeformation.setAttribute("aria-valuetext", `deformation ${amplitude.toFixed(3)}, below the one eighth curvature limit`);
    els.caliperAngleValue.textContent = `${Math.round(angleDegrees)}°`;
    els.caliperAngle.setAttribute("aria-valuetext", `${Math.round(angleDegrees)} degrees`);
    els.caliperExactGap.textContent = "0%";
    els.caliperRoundnessScore.textContent = finite(score) ? `${score.toFixed(1)} / 100` : "unavailable";
    els.caliperCurvatureRatio.textContent = finite(properties.curvatureRatio) ? `${properties.curvatureRatio.toFixed(1)}×` : "singular";
    const areaLossPct = (1 - properties.compactness) * 100;
    els.caliperBarbier.textContent = `0% / ${areaLossPct < 0.005 ? "0.00%" : `−${areaLossPct.toFixed(2)}%`}`;

    let narration;
    if (amplitude < 0.001) {
      narration = "At the circle, the calipers and the circle-specific score agree.";
    } else if (amplitude >= 0.11) {
      narration = `Same width and same rim length, but ${areaLossPct.toFixed(2)}% less enclosed area. The circle score is ${finite(score) ? score.toFixed(1) : "unavailable"}, and local curvature is approaching its boundary.`;
    } else {
      narration = `Same width. Same rim length. ${areaLossPct.toFixed(2)}% less enclosed area. The circle score falls to ${finite(score) ? score.toFixed(1) : "an unavailable value"}.`;
    }
    if (els.caliperNarration.textContent !== narration) els.caliperNarration.textContent = narration;

    renderCaliperDemo(amplitude, orientation);
    renderCaliperWidthPlot(sampledWidth, orientation);
    renderSupportSpectrum(amplitude);
  }

  function turningDisplayGeometry(points) {
    if (!points || !points.length) return { points: [], scale: 1 };
    const xs = points.map((item) => item.x), ys = points.map((item) => item.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(540 / Math.max(1, maxX - minX), 330 / Math.max(1, maxY - minY));
    const sourceCx = (minX + maxX) / 2, sourceCy = (minY + maxY) / 2;
    return {
      scale, sourceCx, sourceCy,
      points: points.map((item) => ({ x: 320 + (item.x - sourceCx) * scale, y: 210 + (item.y - sourceCy) * scale })),
    };
  }

  function turningWalkPath(analysis, displayPoints, fraction, markerPoint) {
    if (!analysis || !analysis.valid || !displayPoints.length || !(fraction > 0)) return "";
    const points = displayPoints, count = points.length, progress = Math.min(1, fraction);
    const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
    for (let i = 1; i <= count && analysis.boundaryFractions[i] <= progress + 1e-12; i += 1) {
      const current = points[i % count];
      commands.push(`L ${current.x.toFixed(2)} ${current.y.toFixed(2)}`);
    }
    if (progress < 1) commands.push(`L ${markerPoint.x.toFixed(2)} ${markerPoint.y.toFixed(2)}`);
    return commands.join(" ");
  }

  function renderTurningContour(analysis, fraction) {
    const displayGeometry = turningDisplayGeometry(analysis.points);
    const displayPoints = displayGeometry.points;
    const sourceMarker = TangentTurning.sample(analysis, fraction);
    const marker = {
      ...sourceMarker,
      point: {
        x: 320 + (sourceMarker.point.x - displayGeometry.sourceCx) * displayGeometry.scale,
        y: 210 + (sourceMarker.point.y - displayGeometry.sourceCy) * displayGeometry.scale,
      },
    };
    const tangentLength = 58, half = tangentLength / 2;
    const cosine = Math.cos(marker.tangentAngle), sine = Math.sin(marker.tangentAngle);
    const startX = marker.point.x - half * cosine, startY = marker.point.y - half * sine;
    const endX = marker.point.x + half * cosine, endY = marker.point.y + half * sine;
    const headLength = 12, headSpread = 0.48;
    const headOneX = endX - headLength * Math.cos(marker.tangentAngle - headSpread);
    const headOneY = endY - headLength * Math.sin(marker.tangentAngle - headSpread);
    const headTwoX = endX - headLength * Math.cos(marker.tangentAngle + headSpread);
    const headTwoY = endY - headLength * Math.sin(marker.tangentAngle + headSpread);
    const direction = analysis.orientation > 0 ? "clockwise stroke" : "counterclockwise stroke";
    const compassCx = 540, compassCy = 92, compassRadius = 48;
    const tangentAngle = marker.normalizedTangentAngle;
    const compassEndX = compassCx + compassRadius * Math.cos(tangentAngle);
    const compassEndY = compassCy + compassRadius * Math.sin(tangentAngle);
    const compassHeadOneX = compassEndX - 10 * Math.cos(tangentAngle - headSpread);
    const compassHeadOneY = compassEndY - 10 * Math.sin(tangentAngle - headSpread);
    const compassHeadTwoX = compassEndX - 10 * Math.cos(tangentAngle + headSpread);
    const compassHeadTwoY = compassEndY - 10 * Math.sin(tangentAngle + headSpread);
    const compassStartDegrees = analysis.tangentAngles[0] * 180 / Math.PI;
    const compassSweep = Math.max(0, Math.min(1, marker.cumulativeDeg / 360));
    let microscope = "";
    if (els.turningOsculating.checked && state.result && state.result.profiles && state.result.fit) {
      const curvature = Roundness.normalizedCurvature(analysis.points, state.result.fit.r);
      const referenceRadius = state.result.fit.r;
      const nextCurvature = curvature[(marker.edgeIndex + 1) % curvature.length];
      const currentCurvature = curvature[marker.edgeIndex] * (1 - marker.edgeMix) + nextCurvature * marker.edgeMix;
      let evolutePath = "";
      let drawing = false;
      let previousCurvature = null;
      let previousCenter = null;
      for (let i = 0; i < displayPoints.length; i += 3) {
        const kappaR = curvature[i];
        if (!finite(kappaR) || Math.abs(kappaR) < 0.12) {
          drawing = false;
          previousCurvature = null;
          previousCenter = null;
          continue;
        }
        const tangentX = Math.cos(analysis.tangentAngles[i]), tangentY = Math.sin(analysis.tangentAngles[i]);
        const normalX = analysis.orientation * -tangentY, normalY = analysis.orientation * tangentX;
        const signedRadius = displayGeometry.scale * referenceRadius / kappaR;
        const centerX = displayPoints[i].x + normalX * signedRadius;
        const centerY = displayPoints[i].y + normalY * signedRadius;
        if (!finite(centerX) || !finite(centerY) || Math.abs(signedRadius) > 900 || centerX < -400 || centerX > 1040 || centerY < -400 || centerY > 820) {
          drawing = false;
          previousCurvature = null;
          previousCenter = null;
          continue;
        }
        if (previousCurvature !== null && previousCurvature * kappaR < 0) drawing = false;
        if (previousCenter && Math.hypot(centerX - previousCenter.x, centerY - previousCenter.y) > 170) drawing = false;
        evolutePath += `${drawing ? "L" : "M"} ${centerX.toFixed(2)} ${centerY.toFixed(2)} `;
        drawing = true;
        previousCurvature = kappaR;
        previousCenter = { x: centerX, y: centerY };
      }
      const tangentX = Math.cos(marker.tangentAngle), tangentY = Math.sin(marker.tangentAngle);
      const normalX = analysis.orientation * -tangentY, normalY = analysis.orientation * tangentX;
      if (finite(currentCurvature) && Math.abs(currentCurvature) >= 0.08 && finite(referenceRadius) && referenceRadius > 0) {
        const signedRadius = displayGeometry.scale * referenceRadius / currentCurvature;
        const centerX = marker.point.x + normalX * signedRadius;
        const centerY = marker.point.y + normalY * signedRadius;
        if (finite(centerX) && finite(centerY) && Math.abs(signedRadius) <= 1200) {
          microscope = `<g clip-path="url(#turningFieldClip)" class="turning-microscope">
            ${evolutePath ? `<path d="${evolutePath}" class="turning-evolute" />` : ""}
            <circle cx="${centerX}" cy="${centerY}" r="${Math.abs(signedRadius)}" class="turning-osculating-circle" />
            <line x1="${marker.point.x}" y1="${marker.point.y}" x2="${centerX}" y2="${centerY}" class="turning-radius-line" />
            <circle cx="${centerX}" cy="${centerY}" r="4" class="turning-osculating-center"><title>Sampled center of curvature</title></circle>
          </g>`;
        }
      }
      if (!microscope) {
        const sign = finite(currentCurvature) && currentCurvature < 0 ? -1 : 1;
        const rayX = marker.point.x + normalX * sign * 170, rayY = marker.point.y + normalY * sign * 170;
        microscope = `<g clip-path="url(#turningFieldClip)" class="turning-microscope">
          ${evolutePath ? `<path d="${evolutePath}" class="turning-evolute" />` : ""}
          <line x1="${marker.point.x}" y1="${marker.point.y}" x2="${rayX}" y2="${rayY}" class="turning-radius-line turning-radius-offstage" />
          <text x="${Math.max(88, Math.min(552, rayX))}" y="${Math.max(28, Math.min(392, rayY - 8))}" text-anchor="middle" class="turning-direction-label">near-flat: curvature center off-stage</text>
        </g>`;
      }
    }
    els.turningContour.innerHTML = `<title id="turningContourTitle">A tangent walking around the current contour</title>
      <desc id="turningContourDescription">At ${(fraction * 100).toFixed(1)} percent of the boundary, the normalized cumulative tangent turn is ${marker.cumulativeDeg.toFixed(1)} degrees.${els.turningOsculating.checked ? " The blue dashed circle is the sampled local osculating circle and the yellow path traces sampled curvature centers." : ""}</desc>
      <defs><clipPath id="turningFieldClip"><rect x="1" y="1" width="638" height="418" rx="15" /></clipPath></defs>
      <rect x="1" y="1" width="638" height="418" rx="15" class="turning-field" />
      <path d="${pathData(displayPoints, true)}" class="turning-contour-base" />
      <path d="${turningWalkPath(analysis, displayPoints, fraction, marker.point)}" class="turning-contour-walked" />
      ${microscope}
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" class="turning-tangent" />
      <path d="M ${headOneX} ${headOneY} L ${endX} ${endY} L ${headTwoX} ${headTwoY}" class="turning-tangent-head" />
      <circle cx="${marker.point.x}" cy="${marker.point.y}" r="6" class="turning-position-dot"><title>Current boundary position</title></circle>
      <g class="turning-compass">
        <circle cx="${compassCx}" cy="${compassCy}" r="${compassRadius}" class="turning-compass-ring" />
        <circle cx="${compassCx}" cy="${compassCy}" r="${compassRadius}" pathLength="1" stroke-dasharray="${compassSweep} ${1 - compassSweep}" transform="rotate(${compassStartDegrees} ${compassCx} ${compassCy})" class="turning-compass-sweep" />
        <line x1="${compassCx}" y1="${compassCy}" x2="${compassEndX}" y2="${compassEndY}" class="turning-compass-arrow" />
        <path d="M ${compassHeadOneX} ${compassHeadOneY} L ${compassEndX} ${compassEndY} L ${compassHeadTwoX} ${compassHeadTwoY}" class="turning-compass-arrow" />
        <circle cx="${compassEndX}" cy="${compassEndY}" r="4" class="turning-compass-dot"><title>Unit tangent direction</title></circle>
        <text x="${compassCx}" y="158" text-anchor="middle" class="turning-direction-label">orientation-normalized tangent</text>
      </g>
      <text x="24" y="394" class="turning-direction-label">${direction} · compass normalizes traversal to +360°</text>`;
  }

  function turningPlotGeometry(analysis, fraction) {
    const left = 68, right = 738, top = 22, bottom = 218;
    const values = analysis.cumulativeDeg.concat();
    const minimum = Math.min(0, ...values), maximum = Math.max(360, ...values);
    const pad = Math.max(18, (maximum - minimum) * 0.08);
    const yMin = minimum - pad, yMax = maximum + pad;
    const x = (value) => left + value * (right - left);
    const y = (value) => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
    const position = TangentTurning.sample(analysis, fraction);
    return { left, right, top, bottom, yMin, yMax, x, y, position };
  }

  function renderTurningPlot(analysis, fraction) {
    const geometry = turningPlotGeometry(analysis, fraction);
    const { left, right, top, bottom, x, y, position } = geometry;
    let markup = "";
    [0, 90, 180, 270, 360].forEach((degrees) => {
      const yy = y(degrees);
      markup += `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" class="chart-grid" />
        <text x="${left - 10}" y="${yy + 4}" text-anchor="end" class="chart-label">${degrees}°</text>`;
    });
    [0, 0.25, 0.5, 0.75, 1].forEach((value) => {
      const xx = x(value);
      markup += `<line x1="${xx}" y1="${top}" x2="${xx}" y2="${bottom}" class="chart-grid" />
        <text x="${xx}" y="241" text-anchor="${value === 0 ? "start" : value === 1 ? "end" : "middle"}" class="chart-label">${Math.round(value * 100)}%</text>`;
    });
    const measured = analysis.cumulativeDeg.map((value, index) => {
      const xx = x(analysis.boundaryFractions[index]);
      const yy = y(Math.max(geometry.yMin, Math.min(geometry.yMax, value)));
      return `${index === 0 ? "M" : "L"} ${xx.toFixed(2)} ${yy.toFixed(2)}`;
    }).join(" ");
    const ideal = `M ${x(0).toFixed(2)} ${y(0).toFixed(2)} L ${x(1).toFixed(2)} ${y(360).toFixed(2)}`;
    const markerX = x(fraction), markerY = y(position.cumulativeDeg), idealY = y(position.idealDeg);
    markup += `<path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom}" class="chart-axis" />
      <path d="${ideal}" class="turning-plot-ideal" />
      <path d="${measured}" class="turning-plot-measured" />
      <line id="turningPlotGuide" x1="${markerX}" y1="${top}" x2="${markerX}" y2="${bottom}" class="turning-plot-guide" />
      <line id="turningResidualStick" x1="${markerX}" y1="${idealY}" x2="${markerX}" y2="${markerY}" class="turning-residual-stick" />
      <circle id="turningPlotMarker" cx="${markerX}" cy="${markerY}" r="4.5" class="turning-plot-marker"><title>Current cumulative turn</title></circle>
      <text x="12" y="14" class="chart-label">turn</text>
      <text x="${(left + right) / 2}" y="264" text-anchor="middle" class="chart-label caliper-axis-title">normalized arclength s / L</text>`;
    els.turningPlot.innerHTML = markup;
  }

  function updateTurningPlotMarker(analysis, fraction) {
    if (!analysis || !analysis.valid || typeof els.turningPlot.querySelector !== "function") return false;
    const guide = els.turningPlot.querySelector("#turningPlotGuide");
    const stick = els.turningPlot.querySelector("#turningResidualStick");
    const marker = els.turningPlot.querySelector("#turningPlotMarker");
    if (!guide || !stick || !marker) return false;
    const geometry = turningPlotGeometry(analysis, fraction), markerX = geometry.x(fraction);
    const markerY = geometry.y(geometry.position.cumulativeDeg), idealY = geometry.y(geometry.position.idealDeg);
    guide.setAttribute("x1", markerX); guide.setAttribute("x2", markerX);
    stick.setAttribute("x1", markerX); stick.setAttribute("x2", markerX);
    stick.setAttribute("y1", idealY); stick.setAttribute("y2", markerY);
    marker.setAttribute("cx", markerX); marker.setAttribute("cy", markerY);
    return true;
  }

  function renderTurningPosition() {
    if (!turningAnalysis || !turningAnalysis.valid) return;
    const fraction = Number(els.turningPosition.value) / 1000;
    const position = TangentTurning.sample(turningAnalysis, fraction);
    els.turningPositionValue.textContent = `${(fraction * 100).toFixed(1)}%`;
    const lead = position.residualDeg >= 0 ? `${position.residualDeg.toFixed(1)} degrees ahead of` : `${Math.abs(position.residualDeg).toFixed(1)} degrees behind`;
    els.turningPosition.setAttribute("aria-valuetext", `${(fraction * 100).toFixed(1)} percent around, ${position.cumulativeDeg.toFixed(1)} degrees turned, ${lead} the uniform circle`);
    els.turningSoFar.textContent = `${position.cumulativeDeg.toFixed(1)}°`;
    renderTurningContour(turningAnalysis, fraction);
    if (!updateTurningPlotMarker(turningAnalysis, fraction)) renderTurningPlot(turningAnalysis, fraction);
  }

  function renderTangentWalkBlank(message) {
    turningAnalysis = null;
    els.turningContour.innerHTML = `<title id="turningContourTitle">Tangent walk unavailable</title>
      <desc id="turningContourDescription">${message}</desc>
      <rect x="1" y="1" width="638" height="418" rx="15" class="turning-field" />
      <text x="320" y="210" text-anchor="middle" class="turning-blank-label">Tangent walk unavailable</text>`;
    els.turningPlot.innerHTML = `<rect x="68" y="22" width="670" height="196" class="chart-empty-box" />
      <text x="403" y="124" text-anchor="middle" class="chart-label">Tangent walk unavailable</text>`;
    els.turningSoFar.textContent = "—";
    els.turningFinal.textContent = "withheld";
    els.turningBacktrack.textContent = "—";
    els.turningPlotSummary.textContent = "simple closed loop required";
    els.turningPosition.disabled = true;
    els.turningOsculating.disabled = true;
    if (els.turningNarration.textContent !== message) els.turningNarration.textContent = message;
  }

  function renderTangentWalk() {
    const result = state.result;
    if (!result || !result.validity || !result.validity.valid || result.validity.open || result.validity.selfIntersecting) {
      renderTangentWalkBlank("The ±360° theorem is shown only for a regular, simple closed contour.");
      return;
    }
    turningAnalysis = TangentTurning.analyze(result.points.smoothed);
    if (!turningAnalysis.valid || turningAnalysis.numericallyAmbiguous) {
      renderTangentWalkBlank(turningAnalysis.reason || "A near-180° sample turn made discrete angle unwrapping ambiguous.");
      return;
    }
    if (turningAnalysis.selfIntersecting || Math.abs(Math.abs(turningAnalysis.totalSignedDeg) - 360) > 1e-5) {
      renderTangentWalkBlank("The sampled contour is not a simple one-turn loop, so the ±360° theorem is withheld.");
      return;
    }
    const fraction = Number(els.turningPosition.value) / 1000;
    const position = TangentTurning.sample(turningAnalysis, fraction);
    const direction = turningAnalysis.orientation > 0 ? "CW" : "CCW";
    els.turningPositionValue.textContent = `${(fraction * 100).toFixed(1)}%`;
    const lead = position.residualDeg >= 0 ? `${position.residualDeg.toFixed(1)} degrees ahead of` : `${Math.abs(position.residualDeg).toFixed(1)} degrees behind`;
    els.turningPosition.setAttribute("aria-valuetext", `${(fraction * 100).toFixed(1)} percent around, ${position.cumulativeDeg.toFixed(1)} degrees turned, ${lead} the uniform circle`);
    els.turningPosition.disabled = false;
    els.turningOsculating.disabled = false;
    els.turningSoFar.textContent = `${position.cumulativeDeg.toFixed(1)}°`;
    els.turningFinal.textContent = `${Math.abs(turningAnalysis.totalSignedDeg).toFixed(1)}° ${direction}`;
    els.turningBacktrack.textContent = `σ ${turningAnalysis.turnUniformityDeg.toFixed(1)}°`;
    els.turningPlotSummary.textContent = `final ${Math.abs(turningAnalysis.totalSignedDeg).toFixed(1)}° · reverse ${turningAnalysis.negativeTurnDeg.toFixed(1)}°`;
    const narration = turningAnalysis.negativeTurnDeg < 0.05 ?
      "The tangent never turns backward, but it does not spend its turn uniformly unless the contour is a circle." :
      `The tangent backtracks locally by ${turningAnalysis.negativeTurnDeg.toFixed(1)} degrees, then compensates elsewhere to finish one revolution.`;
    if (els.turningNarration.textContent !== narration) els.turningNarration.textContent = narration;
    renderTurningContour(turningAnalysis, fraction);
    renderTurningPlot(turningAnalysis, fraction);
  }

  function flowScale(result) {
    let extentX = 1, extentY = 1;
    result.frames.forEach((frame) => {
      frame.normalizedPoints.forEach((point) => {
        extentX = Math.max(extentX, Math.abs(point.x));
        extentY = Math.max(extentY, Math.abs(point.y));
      });
    });
    return Math.min(290 / (2 * extentX), 238 / (2 * extentY));
  }

  function flowDisplayPath(points, centerX, centerY, scale) {
    return pathData(points.map((point) => ({
      x: centerX + point.x * scale,
      y: centerY + point.y * scale,
    })), true);
  }

  function flowIsStacked() {
    const container = els.flowStage && els.flowStage.parentElement ? els.flowStage.parentElement : els.flowStage;
    if (container && typeof container.getBoundingClientRect === "function") {
      const measuredWidth = container.getBoundingClientRect().width;
      if (finite(measuredWidth) && measuredWidth > 0) return measuredWidth < 620;
    }
    return finite(Number(window.innerWidth)) && Number(window.innerWidth) <= 720;
  }

  function renderFlowStage(sample) {
    const initial = curveFlowResult.frames[0];
    const scale = flowScale(curveFlowResult);
    const stacked = flowIsStacked();
    const physicalX = stacked ? 190 : 191;
    const physicalY = stacked ? 166 : 178;
    const normalizedX = stacked ? 190 : 569;
    const normalizedY = stacked ? 487 : 178;
    const viewWidth = stacked ? 380 : 760;
    const viewHeight = stacked ? 650 : 350;
    const magnification = sample.areaRatio > 0 ? Math.sqrt(1 / sample.areaRatio) : Infinity;
    const physicalStart = flowDisplayPath(initial.physicalPoints, physicalX, physicalY, scale);
    const physicalCurrent = flowDisplayPath(sample.physicalPoints, physicalX, physicalY, scale);
    const normalizedStart = flowDisplayPath(initial.normalizedPoints, normalizedX, normalizedY, scale);
    const normalizedCurrent = flowDisplayPath(sample.normalizedPoints, normalizedX, normalizedY, scale);
    const divider = stacked ?
      `<line x1="24" y1="326" x2="356" y2="326" class="flow-divider" />` :
      `<line x1="380" y1="30" x2="380" y2="318" class="flow-divider" />`;
    const physicalTitleY = 27;
    const normalizedTitleY = stacked ? 348 : 27;
    const physicalNoteY = stacked ? 310 : 330;
    const normalizedNoteY = stacked ? 631 : 330;
    els.flowStage.classList.toggle("is-stacked", stacked);
    els.flowStage.setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`);
    els.flowStage.innerHTML = `<title id="flowStageTitle">Physical and magnified curve-shortening flow</title>
      <desc id="flowStageDescription">At ${(sample.timeFraction * 100).toFixed(1)} percent of theoretical extinction time, ${(sample.areaRatio * 100).toFixed(1)} percent of the original polygon area remains. The comparison copy is magnified ${magnification.toFixed(2)} times to preserve displayed area.</desc>
      <rect x="1" y="1" width="${viewWidth - 2}" height="${viewHeight - 2}" rx="15" class="flow-field" />
      ${divider}
      <text x="${physicalX}" y="${physicalTitleY}" text-anchor="middle" class="flow-panel-title">recentered physical scale</text>
      <text x="${normalizedX}" y="${normalizedTitleY}" text-anchor="middle" class="flow-panel-title">round-point telescope</text>
      <path d="${physicalStart}" class="flow-start-outline" />
      <path d="${physicalCurrent}" class="flow-current flow-current-physical" />
      <path d="${normalizedStart}" class="flow-start-outline" />
      <path d="${normalizedCurrent}" class="flow-current flow-current-normalized" />
      <text x="${physicalX}" y="${physicalNoteY}" text-anchor="middle" class="flow-panel-note">area ${(sample.areaRatio * 100).toFixed(1)}%</text>
      <text x="${normalizedX}" y="${normalizedNoteY}" text-anchor="middle" class="flow-panel-note">display ×${magnification.toFixed(2)}</text>`;
  }

  function renderFlowAreaPlot(sample) {
    const frames = curveFlowResult.frames;
    const left = 68, right = 738, top = 20, bottom = 178;
    const xMax = Math.max(0.5, curveFlowResult.maxTimeFraction);
    const areaDomain = CurveFlow.areaPlotDomain(curveFlowResult);
    const yMin = areaDomain.minimum, yMax = areaDomain.maximum;
    const x = (value) => left + value / xMax * (right - left);
    const y = (value) => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
    let markup = "";
    [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
      const value = yMin + fraction * (yMax - yMin);
      const yy = y(value);
      markup += `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" class="chart-grid" />
        <text x="${left - 10}" y="${yy + 4}" text-anchor="end" class="chart-label">${Math.round(value * 100)}%</text>`;
    });
    [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
      const value = xMax * fraction, xx = x(value);
      markup += `<line x1="${xx}" y1="${top}" x2="${xx}" y2="${bottom}" class="chart-grid" />
        <text x="${xx}" y="199" text-anchor="${fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}" class="chart-label">${Math.round(value * 100)}%</text>`;
    });
    const measured = frames.map((frame, index) => `${index ? "L" : "M"} ${x(frame.timeFraction).toFixed(2)} ${y(frame.areaRatio).toFixed(2)}`).join(" ");
    const ideal = `M ${x(0).toFixed(2)} ${y(1).toFixed(2)} L ${x(xMax).toFixed(2)} ${y(1 - xMax).toFixed(2)}`;
    const markerX = x(sample.timeFraction), markerY = y(sample.areaRatio), idealY = y(sample.idealAreaRatio);
    markup += `<path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom}" class="chart-axis" />
      <path d="${measured}" class="flow-plot-measured" />
      <path d="${ideal}" class="flow-plot-ideal" />
      <line x1="${markerX}" y1="${top}" x2="${markerX}" y2="${bottom}" class="flow-plot-guide" />
      <line x1="${markerX}" y1="${idealY}" x2="${markerX}" y2="${markerY}" class="flow-clock-stick" />
      <circle cx="${markerX}" cy="${markerY}" r="4.5" class="flow-plot-marker"><title>Current measured area</title></circle>
      <text x="12" y="14" class="chart-label">A / A₀</text>
      <text x="${(left + right) / 2}" y="228" text-anchor="middle" class="chart-label caliper-axis-title">normalized physical time t / T</text>`;
    els.flowAreaPlot.setAttribute("aria-label", "Area remaining during numerical curve shortening");
    els.flowAreaPlot.innerHTML = markup;
  }

  function renderCurveFlowPosition() {
    if (!curveFlowResult || !curveFlowResult.valid) return;
    const fraction = Number(els.flowPosition.value) / 1000;
    const sample = CurveFlow.sample(curveFlowResult, fraction);
    if (!sample) return;
    const timePct = sample.timeFraction * 100;
    const areaPct = sample.areaRatio * 100;
    const magnification = sample.areaRatio > 0 ? Math.sqrt(1 / sample.areaRatio) : Infinity;
    const drift = sample.areaResidualPct;
    els.flowPositionValue.textContent = `t/T = ${timePct.toFixed(1)}%`;
    els.flowPosition.setAttribute("aria-valuetext", `${timePct.toFixed(1)} percent of theoretical extinction time, ${areaPct.toFixed(1)} percent area remaining, display magnification ${magnification.toFixed(2)} times`);
    els.flowArea.textContent = `${areaPct.toFixed(1)}%`;
    els.flowClock.textContent = `${drift >= 0 ? "+" : "−"}${Math.abs(drift).toFixed(2)} pp`;
    els.flowDeficit.textContent = `${(Math.max(0, sample.polygonDeficit) * 100).toFixed(2)}%`;

    let narration;
    if (sample.timeFraction < 0.03) {
      narration = "At the start, the physical and magnified views are identical. Move time forward to let curvature reshape the loop.";
    } else if (sample.timeFraction < 0.52) {
      narration = "Convex bulges retreat while concave dents can fill outward. The physical-scale contour shrinks; the magnified view removes overall shrink so the change in shape is easier to see.";
    } else {
      narration = "Most of the physical area is now gone. Both views are camera-centered, and the magnified copy reveals the approach toward a round point.";
    }
    if (curveFlowResult.warnings.length) narration += ` Numerical note: ${curveFlowResult.warnings[0]}`;
    if (els.flowNarration.textContent !== narration) els.flowNarration.textContent = narration;
    renderFlowStage(sample);
    renderFlowAreaPlot(sample);
  }

  function renderCurveFlowBlank(message) {
    curveFlowResult = null;
    const stacked = flowIsStacked();
    els.flowStage.classList.toggle("is-stacked", stacked);
    els.flowStage.setAttribute("viewBox", stacked ? "0 0 380 650" : "0 0 760 350");
    els.flowStage.innerHTML = `<title id="flowStageTitle">Curve-shortening telescope unavailable</title>
      <desc id="flowStageDescription">${message}</desc>
      <rect x="1" y="1" width="${stacked ? 378 : 758}" height="${stacked ? 648 : 348}" rx="15" class="flow-field" />
      <text x="${stacked ? 190 : 380}" y="${stacked ? 325 : 178}" text-anchor="middle" class="flow-blank-label">Round-point telescope unavailable</text>`;
    els.flowAreaPlot.setAttribute("aria-label", `Area clock unavailable. ${message}`);
    els.flowAreaPlot.innerHTML = `<rect x="68" y="20" width="670" height="158" class="chart-empty-box" />
      <text x="403" y="103" text-anchor="middle" class="chart-label">Area clock unavailable</text>`;
    els.flowPosition.disabled = true;
    els.flowArea.textContent = "—";
    els.flowClock.textContent = "—";
    els.flowDeficit.textContent = "—";
    els.flowPlotSummary.textContent = "preview withheld";
    if (els.flowNarration.textContent !== message) els.flowNarration.textContent = message;
  }

  function renderCurveFlow() {
    const result = state.result;
    if (!result || !turningAnalysis || !turningAnalysis.valid || turningAnalysis.selfIntersecting ||
        Math.abs(Math.abs(turningAnalysis.totalSignedDeg) - 360) > 1e-5) {
      renderCurveFlowBlank("The continuum theorem and numerical preview are shown only for a simple, one-turn closed contour.");
      return;
    }
    try {
      curveFlowResult = CurveFlow.simulate(result.points.smoothed, {
        count: 96, lambda: 0.18, frames: 37, targetTimeFraction: 0.9, intersectionStride: 10,
      });
    } catch (_) {
      curveFlowResult = null;
    }
    if (!curveFlowResult || !curveFlowResult.valid) {
      renderCurveFlowBlank(curveFlowResult && curveFlowResult.reason ? curveFlowResult.reason : "The numerical preview could not advance safely.");
      return;
    }
    els.flowPosition.disabled = false;
    const status = curveFlowResult.complete ? "complete preview" : "stopped early";
    els.flowPlotSummary.textContent = `${status} · max drift ${curveFlowResult.maxAreaResidualPct.toFixed(2)} pp · ${curveFlowResult.options.count} points`;
    renderCurveFlowPosition();
  }

  function renderExperimentalBlank(message) {
    els.experimentalMap.innerHTML = `<rect x="94" y="24" width="448" height="206" class="experimental-empty-box" />
      <text x="318" y="132" text-anchor="middle" class="chart-label">${message}</text>`;
    els.experimentalBendingPlot.innerHTML = `<rect x="58" y="24" width="340" height="206" class="experimental-empty-box" />
      <text x="228" y="132" text-anchor="middle" class="chart-label">Bending profile unavailable</text>`;
    els.experimentalMapSummary.textContent = "—";
    els.experimentalBendingSummary.textContent = "—";
    els.experimentalWarnings.innerHTML = experimentalBaselineWarnings.map((warning) => `<li>${warning}</li>`).join("");
    els.experimentalStatus.textContent = message;
  }

  function experimentalHeatClass(value) {
    if (!finite(value) || Math.abs(value) < 0.12) return "is-near";
    const level = Math.abs(value) < 0.4 ? 1 : Math.abs(value) < 0.9 ? 2 : 3;
    return `${value < 0 ? "is-flat" : "is-sharp"}-${level}`;
  }

  function renderExperimentalMap(experiment) {
    const rows = experiment.rows;
    const left = 94, right = 542, top = 24, bottom = 230;
    const plotWidth = right - left, rowHeight = (bottom - top) / rows.length;
    const binCount = 112, binWidth = plotWidth / binCount;
    const currentScale = Number(els.smoothing.value);
    let selectedIndex = 0;
    rows.forEach((row, index) => {
      if (Math.abs(row.scale - currentScale) < Math.abs(rows[selectedIndex].scale - currentScale)) selectedIndex = index;
    });

    let markup = `<rect x="${left}" y="${top}" width="${plotWidth}" height="${bottom - top}" class="experimental-frame" />`;
    [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
      const x = left + fraction * plotWidth;
      markup += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" class="experimental-grid-line" />
        <text x="${x}" y="249" text-anchor="${fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}" class="chart-label">${Math.round(fraction * 100)}%</text>`;
    });

    rows.forEach((row, index) => {
      const displayIndex = rows.length - 1 - index;
      const y = top + displayIndex * rowHeight;
      const bins = Experimental.signedPeakBins(row.deviations, binCount);
      bins.forEach((value, bin) => {
        markup += `<rect x="${left + bin * binWidth}" y="${y}" width="${binWidth + 0.35}" height="${rowHeight + 0.35}" class="experimental-cell ${experimentalHeatClass(value)}" />`;
      });
      row.inflections.forEach((position) => {
        markup += `<circle cx="${left + position * plotWidth}" cy="${y + rowHeight / 2}" r="2.8" class="experimental-inflection"><title>κ = 0 at ${(position * 100).toFixed(1)}% · σ=${row.scale}</title></circle>`;
      });
      markup += `<text x="${left - 8}" y="${y + rowHeight / 2 + 3}" text-anchor="end" class="chart-label">σ${formatNumber(row.scale, row.scale < 1 ? 2 : 1)} · ${formatNumber(row.scalePct, 2)}%</text>`;
      if (index === selectedIndex) {
        markup += `<rect x="${left - 2}" y="${y + 1}" width="${plotWidth + 4}" height="${Math.max(1, rowHeight - 2)}" class="experimental-selected-scale"><title>Nearest row to the diagnostic slider</title></rect>`;
      }
    });
    markup += `<text x="${(left + right) / 2}" y="274" text-anchor="middle" class="chart-label experimental-axis-title">boundary position from stroke start</text>
      <text x="12" y="${(top + bottom) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(top + bottom) / 2})" class="chart-label experimental-axis-title">Gaussian scale σ · % circumference</text>
      <text x="${right}" y="16" text-anchor="end" class="chart-label">color saturates beyond |κR − 1| = 0.9</text>`;
    els.experimentalMap.innerHTML = markup;

    const fineCount = rows[0].inflections.length;
    els.experimentalMapSummary.textContent = experiment.lastInflectionScale == null ?
      `${fineCount} inflections · convex ambiguity` :
      `${fineCount} fine · last sampled σ=${formatNumber(experiment.lastInflectionScale, 1)}`;
  }

  function renderExperimentalBending(experiment) {
    const rows = experiment.rows.filter((row) => finite(row.bendingExcess));
    if (!rows.length) {
      els.experimentalBendingPlot.innerHTML = "";
      els.experimentalBendingSummary.textContent = "N/A";
      return;
    }
    const left = 58, right = 398, top = 24, bottom = 230;
    const logMin = Math.log(rows[0].scale), logMax = Math.log(rows[rows.length - 1].scale);
    const x = (scale) => left + (Math.log(scale) - logMin) / (logMax - logMin || 1) * (right - left);
    const observed = rows.map((row) => row.bendingExcess);
    const observedMin = Math.min(...observed), observedMax = Math.max(...observed);
    const observedSpan = Math.max(0.02, observedMax - observedMin);
    const yMin = Math.min(0, observedMin < 0 ? observedMin - observedSpan * 0.08 : 0);
    const yMax = Math.max(0.02, observedMax + observedSpan * 0.08);
    const y = (value) => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
    const yTicks = yMin < 0 ? [yMin, 0, yMax] : [0, yMax / 2, yMax];
    let markup = "";

    yTicks.forEach((tick) => {
      const yy = y(tick);
      markup += `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" class="chart-grid" />
        <text x="${left - 8}" y="${yy + 3}" text-anchor="end" class="chart-label">${formatAxis(tick)}</text>`;
    });
    [rows[0], rows.find((row) => row.scale === 3), rows[rows.length - 1]].filter(Boolean)
      .filter((row, index, items) => items.indexOf(row) === index)
      .forEach((row) => {
        const xx = x(row.scale);
        markup += `<line x1="${xx}" y1="${top}" x2="${xx}" y2="${bottom}" class="chart-grid" />
          <text x="${xx}" y="249" text-anchor="${row === rows[0] ? "start" : row === rows[rows.length - 1] ? "end" : "middle"}" class="chart-label">σ${formatNumber(row.scale, row.scale < 1 ? 2 : 1)}</text>`;
      });

    const path = rows.map((row, index) => `${index ? "L" : "M"} ${x(row.scale).toFixed(2)} ${y(row.bendingExcess).toFixed(2)}`).join(" ");
    markup += `<line x1="${left}" y1="${y(0)}" x2="${right}" y2="${y(0)}" class="chart-ideal" />
      <path d="${path}" class="experimental-energy-line" />`;
    const currentScale = Number(els.smoothing.value);
    let selected = rows[0];
    rows.forEach((row) => { if (Math.abs(row.scale - currentScale) < Math.abs(selected.scale - currentScale)) selected = row; });
    rows.forEach((row) => {
      const selectedClass = row === selected ? " is-selected" : "";
      markup += `<circle cx="${x(row.scale)}" cy="${y(row.bendingExcess)}" r="${row === selected ? 5 : 3.2}" class="experimental-energy-point${selectedClass}"><title>σ=${row.scale}: B=${row.bendingExcess.toFixed(4)}</title></circle>`;
    });
    markup += `<path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${bottom}" class="chart-axis" />
      <text x="${(left + right) / 2}" y="274" text-anchor="middle" class="chart-label experimental-axis-title">Gaussian scale σ (log spacing)</text>
      <text x="12" y="${(top + bottom) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(top + bottom) / 2})" class="chart-label experimental-axis-title">dimensionless B(σ)</text>`;
    els.experimentalBendingPlot.innerHTML = markup;

    const declared = rows.find((row) => row.scale === 3) || rows[0];
    const coarse = rows[rows.length - 1];
    els.experimentalBendingSummary.textContent = `B@σ3 ${formatNumber(declared.bendingExcess, 3)} · coarse ${formatNumber(coarse.bendingExcess, 3)}`;
  }

  function renderExperimental() {
    const experiment = state.experimental;
    const baselineWarnings = experimentalBaselineWarnings;
    if (!experiment || !experiment.valid) {
      const reasons = experiment && Array.isArray(experiment.reasons) && experiment.reasons.length ?
        experiment.reasons : ["Draw a closed, simple loop to enter the research preview."];
      renderExperimentalBlank(`Preview withheld: ${reasons[0]}`);
      els.experimentalWarnings.innerHTML = baselineWarnings.concat(reasons)
        .map((warning) => `<li>${warning}</li>`).join("");
      return;
    }

    renderExperimentalMap(experiment);
    renderExperimentalBending(experiment);
    const warnings = baselineWarnings.concat(experiment.warnings || [])
      .filter((warning, index, items) => items.indexOf(warning) === index);
    els.experimentalWarnings.innerHTML = warnings.map((warning) => `<li>${warning}</li>`).join("");
    els.experimentalStatus.textContent = experiment.warnings && experiment.warnings.length ?
      `${experiment.warnings.length} contour-specific caution${experiment.warnings.length === 1 ? "" : "s"} detected; inspect the disclosure before interpreting the pattern.` :
      "No extra numerical warning was triggered for this contour; the general experimental caveats still apply.";
  }

  function currentAnalysisEngine() {
    if (state.specimen !== "custom") return Engine;
    const captured = state.gesturePoints || state.rawPoints;
    const fit = Engine.fitCircle(captured);
    const first = captured[0], last = captured[captured.length - 1];
    const gap = first && last ? Math.hypot(last.x - first.x, last.y - first.y) : null;
    const acquisition = {
      cleanedPointCount: Engine.cleanPoints(captured).length,
      endpointGapPct: finite(gap) && fit.valid ? 100 * gap / fit.r : null,
      completionUsed: !!(state.closure && state.closure.applied),
      capturedCoveragePct: state.closure ? state.closure.coveragePct : null,
    };
    return Object.assign({}, Engine, {
      analyze(points, options) {
        const result = Engine.analyze(points, Object.assign({}, options, { closureMode: "explicit" }));
        result.acquisition = acquisition;
        return result;
      },
    });
  }

  function completedCapture(captured) {
    const prepared = CaptureReturn.prepare(captured, Engine, DrawingClosure);
    const completed = DrawingClosure.complete(prepared.points, state.closureMode, Engine);
    const { points, ...trim } = prepared;
    return Object.assign(completed, {
      trim, accepted: completed.ready, capturedPointCount: captured.length,
      capturedGap: captured.length > 1 ? Math.hypot(captured[0].x - captured[captured.length - 1].x, captured[0].y - captured[captured.length - 1].y) : null,
      trimmedTail: trim.trimmed && completed.ready ? [points[points.length - 1], ...captured.slice(trim.cutIndex + 1)] : [],
    });
  }

  function completionMarkup(completion, preview = false) {
    if (!completion || !completion.accepted) return "";
    const bridge = completion.bridge || [];
    let markup = bridge.length > 1 ? `<path d="${pathData(bridge)}" class="stage-completion${preview ? " is-preview" : ""}"><title>${preview ? "Preview of the added seam" : "System-added seam"} · ${completion.usedMode}</title></path>` : "";
    if (completion.trimmedTail && completion.trimmedTail.length > 1) markup += `<path d="${pathData(completion.trimmedTail)}" class="stage-discarded-tail"><title>Short terminal overshoot excluded from the completed contour</title></path>`;
    if (bridge.length) markup += `<circle cx="${bridge[0].x}" cy="${bridge[0].y}" r="3" class="stage-completion-dot" />`;
    return markup;
  }

  function renderClosureStatus(completion = state.closure, live = false) {
    if (els.closureMode) els.closureMode.value = state.closureMode;
    if (els.closureNote) els.closureNote.textContent = state.closureMode === "straight"
      ? "Joins the endpoints without reshaping the stroke. A straight seam can leave a small corner."
      : "Follows estimated endpoint directions. Noisy tangents can bow the seam; unsafe curves fall back to straight.";
    if (!els.closureStatus) return;
    els.closureStatus.hidden = state.specimen !== "custom";
    els.closureStatus.classList.toggle("is-warning", !!(completion && !completion.accepted) || state.cancelled);
    if (state.cancelled) { els.closureStatus.textContent = "Capture interrupted. No seam was added; draw a new loop to analyze it."; return; }
    if (!completion) { els.closureStatus.textContent = "Draw around once, then release inside the glowing zone. The teal preview shows exactly which seam will be added."; return; }
    if (!completion.accepted) {
      els.closureStatus.textContent = `${live ? "Keep drawing. " : "No seam added. "}${completion.reason || "Return closer to the starting point after a nearly complete loop."}`;
      return;
    }
    const trimNote = completion.trim && completion.trim.trimmed ? " Short overshoot excluded (amber)." : "";
    if (completion.alreadyClosed) {
      els.closureStatus.textContent = `${live ? "Loop closed · release to analyze." : "Endpoints already meet; no seam needed."}${trimNote} Original capture retained.`;
      return;
    }
    const mode = completion.usedMode === "tangent" ? "Tangent-matched" : "Straight";
    const fallback = completion.requestedMode !== completion.usedMode ? ` Fallback: ${completion.reason}` : "";
    els.closureStatus.textContent = live
      ? `Release to complete the loop with the teal seam.${trimNote}${fallback}`
      : `${mode} seam added across ${formatNumber(completion.gap, 1)} drawing units (${formatNumber(100 * completion.gap / completion.radius, 1)}% R).${trimNote}${fallback} The score includes this seam; the original capture is retained.`;
  }

  function beginCustomDrawing(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.isPrimary === false || state.drawing) return;
    event.preventDefault();
    state.specimen = "custom"; state.rawPoints = []; state.result = null; state.comprehensive = null; state.experimental = null; state.drawing = true; state.pointerId = event.pointerId;
    state.gesturePoints = null; state.closure = null; state.cancelled = false;
    window.clearTimeout(flowAnalysisTimer);
    if (criteriaLab) criteriaLab.update([], null);
    renderEmpty(); renderClosureStatus();
    els.drawingSvg.setPointerCapture(event.pointerId); els.drawPrompt.hidden = true; els.specimenName.textContent = presetNames.custom;
    ensureCustomOption(); els.preset.value = "custom"; addPointerPoint(event); renderDrawingLive();
    els.traceStatus.textContent = "Drawing…"; els.traceStatus.classList.remove("is-warning");
    syncViewUrl();
  }

  function ensureCustomOption() {
    if (els.preset.querySelector('option[value="custom"]')) return;
    const option = document.createElement("option"); option.value = "custom"; option.textContent = "Your drawing"; els.preset.appendChild(option);
  }

  function svgPointer(event) {
    const rect = els.drawingSvg.getBoundingClientRect();
    return point((event.clientX - rect.left) / rect.width * 640, (event.clientY - rect.top) / rect.height * 520);
  }

  function addPointerPoint(event) {
    const p = svgPointer(event), previous = state.rawPoints[state.rawPoints.length - 1];
    if (!previous || Math.hypot(p.x - previous.x, p.y - previous.y) >= 1.4) state.rawPoints.push(p);
  }

  function continueCustomDrawing(event) {
    if (!state.drawing || event.pointerId !== state.pointerId) return;
    event.preventDefault(); addPointerPoint(event); renderDrawingLive();
  }

  function finishCustomDrawing(event) {
    if (!state.drawing || event.pointerId !== state.pointerId) return;
    event.preventDefault(); addPointerPoint(event); state.drawing = false;
    try { els.drawingSvg.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
    state.pointerId = null;
    state.gesturePoints = state.rawPoints.map(p => ({ x: p.x, y: p.y }));
    state.closure = completedCapture(state.gesturePoints);
    state.rawPoints = state.closure.accepted ? state.closure.points : state.gesturePoints;
    renderClosureStatus();
    if (state.rawPoints.length < 12) {
      els.traceStatus.textContent = "Too short · try a larger loop"; els.traceStatus.classList.add("is-warning");
      els.drawPrompt.hidden = false; renderEmpty(); return;
    }
    runAnalysis();
  }

  function renderDrawingLive() {
    els.shapeFill.innerHTML = ""; els.reference.innerHTML = ""; els.residual.innerHTML = ""; els.processed.innerHTML = "";
    els.raw.innerHTML = `<path d="${pathData(state.rawPoints)}" class="stage-raw-live" />`;
    const start = state.rawPoints[0], current = state.rawPoints[state.rawPoints.length - 1];
    if (!start || !current) { els.annotation.innerHTML = ""; return; }
    const completion = completedCapture(state.rawPoints);
    const readyToClose = completion.accepted;
    const allowance = finite(completion.allowance) ? completion.allowance : 13;
    if (els.completion) els.completion.innerHTML = completionMarkup(completion, true);
    renderClosureStatus(completion, true);
    const labelX = Math.min(618, Math.max(22, start.x));
    const labelY = start.y < 65 ? start.y + allowance + 18 : start.y - allowance - 12;
    els.annotation.innerHTML = `<circle cx="${start.x}" cy="${start.y}" r="${allowance}" class="stage-close-target${readyToClose ? " is-ready" : ""}" />
      <circle cx="${start.x}" cy="${start.y}" r="3.5" class="stage-start" />
      <text x="${labelX}" y="${labelY}" text-anchor="${labelX > 510 ? "end" : labelX < 130 ? "start" : "middle"}" class="stage-label stage-close-label">${readyToClose ? completion.alreadyClosed ? "release · loop closed" : "release · seam ready" : "return here"}</text>`;
    const liveMessage = state.rawPoints.length < 24 ? "Keep drawing…" : readyToClose ? "Release to complete" : "Return to the start";
    if (els.traceStatus.textContent !== liveMessage) els.traceStatus.textContent = liveMessage;
  }

  function prepareDrawMode() {
    state.rawPoints = []; state.result = null; state.comprehensive = null; state.experimental = null; state.specimen = "custom"; els.specimenName.textContent = presetNames.custom;
    state.gesturePoints = null; state.closure = null; state.cancelled = false;
    window.clearTimeout(flowAnalysisTimer);
    if (criteriaLab) criteriaLab.update([], null);
    renderClosureStatus();
    ensureCustomOption(); els.preset.value = "custom"; els.drawPrompt.hidden = false;
    els.traceStatus.textContent = "Waiting for a loop"; els.traceStatus.classList.add("is-warning"); renderEmpty();
    syncViewUrl();
  }

  function cancelCustomDrawing(event) {
    if (!state.drawing || event.pointerId !== state.pointerId) return;
    state.drawing = false; state.pointerId = null; state.cancelled = true;
    state.gesturePoints = state.rawPoints.map(p => ({ x: p.x, y: p.y }));
    state.closure = null;
    renderEmpty(); renderClosureStatus();
    els.traceStatus.textContent = "Capture interrupted · draw again";
    els.traceStatus.classList.add("is-warning");
  }

  function selectMode(mode) {
    if (mode !== "comprehensive" && mode !== "explore") return;
    state.mode = mode;
    els.modeSwitch.querySelectorAll("[data-mode]").forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    els.comprehensivePanel.hidden = mode !== "comprehensive";
    els.explorePanel.hidden = mode !== "explore";
    if (state.result) {
      renderCanvas();
      if (mode === "comprehensive") renderComprehensive();
      else renderMethodReading();
    }
    syncViewUrl();
  }

  function selectMethod(method) {
    if (!methodCopy[method]) return;
    state.method = method;
    els.methodTabs.querySelectorAll("[data-method]").forEach((button) => {
      const selected = button.dataset.method === method;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
    els.methodPanel.setAttribute("aria-labelledby", `methodTab-${method}`);
    if (state.result) { renderCanvas(); renderMethodReading(); }
    syncViewUrl();
  }

  function handleMethodTabKeys(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(els.methodTabs.querySelectorAll("[data-method]"));
    const currentIndex = tabs.indexOf(event.target);
    if (currentIndex < 0) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    selectMethod(tabs[nextIndex].dataset.method);
    tabs[nextIndex].focus();
  }

  els.preset.addEventListener("change", () => { if (els.preset.value !== "custom") setPreset(els.preset.value); });
  if (els.scoringPolicy) els.scoringPolicy.addEventListener("change", () => {
    if (!Composite.POLICIES[els.scoringPolicy.value]) return;
    state.policy = els.scoringPolicy.value;
    renderScoreFormula();
    if (state.rawPoints.length >= 3 && !state.cancelled && !state.drawing) {
      state.comprehensive = Composite.analyze(state.rawPoints, currentAnalysisEngine(), state.policy);
      renderComprehensive();
      renderCaliper();
      if (criteriaLab) criteriaLab.update(state.rawPoints, state.comprehensive);
      announceResult();
    }
    syncViewUrl();
  });
  els.drawAgain.addEventListener("click", prepareDrawMode);
  if (els.closureMode) els.closureMode.addEventListener("change", () => {
    if (!["straight", "tangent"].includes(els.closureMode.value)) return;
    state.closureMode = els.closureMode.value;
    if (state.drawing) { renderDrawingLive(); return; }
    if (state.gesturePoints && !state.cancelled) {
      state.closure = completedCapture(state.gesturePoints);
      state.rawPoints = state.closure.accepted ? state.closure.points : state.gesturePoints;
      runAnalysis();
    }
    renderClosureStatus();
  });
  els.smoothing.addEventListener("input", () => { runAnalysis(false, true); syncViewUrl(); });
  els.modeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (button) selectMode(button.dataset.mode);
  });
  els.methodTabs.addEventListener("click", (event) => { const button = event.target.closest("[data-method]"); if (button) selectMethod(button.dataset.method); });
  els.methodTabs.addEventListener("keydown", handleMethodTabKeys);
  els.inspectLimiting.addEventListener("click", inspectLimitingComponent);
  els.copySummary.addEventListener("click", copyResultSummary);
  els.copyViewLink.addEventListener("click", copyCurrentViewLink);
  els.downloadJson.addEventListener("click", downloadResultJson);
  els.caliperDeformation.addEventListener("input", renderCaliper);
  els.caliperAngle.addEventListener("input", renderCaliperAngle);
  els.turningPosition.addEventListener("input", renderTurningPosition);
  els.turningOsculating.addEventListener("change", renderTurningPosition);
  els.flowPosition.addEventListener("input", renderCurveFlowPosition);
  els.drawingSvg.addEventListener("pointerdown", beginCustomDrawing);
  els.drawingSvg.addEventListener("pointermove", continueCustomDrawing);
  els.drawingSvg.addEventListener("pointerup", finishCustomDrawing);
  els.drawingSvg.addEventListener("pointercancel", cancelCustomDrawing);
  if (typeof window.addEventListener === "function") {
    window.addEventListener("popstate", restoreViewFromUrl);
    window.addEventListener("resize", () => {
      window.clearTimeout(flowResizeTimer);
      flowResizeTimer = window.setTimeout(() => {
        if (curveFlowResult && curveFlowResult.valid) renderCurveFlowPosition();
        else renderCurveFlowBlank(els.flowNarration.textContent || "Draw a closed, simple loop to start the round-point telescope.");
      }, 120);
    });
  }

  const initialView = ViewState.parse(window.location && window.location.search ? window.location.search : "");
  els.smoothing.value = initialView.smoothing;
  state.policy = initialView.policy;
  if (els.scoringPolicy) els.scoringPolicy.value = state.policy;
  selectMode(initialView.mode);
  selectMethod(initialView.method);
  setPreset(initialView.specimen);
})();
