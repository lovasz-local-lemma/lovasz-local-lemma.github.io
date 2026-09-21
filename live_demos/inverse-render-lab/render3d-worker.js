"use strict";

// Length of the parameter vector. Declared here rather than repeated as a literal, because it
// was previously hardcoded as 18 in seven places and adding a family meant finding them all.
const PARAM_COUNT = 21;

let displayWidth = 256;
let displayHeight = 256;
let displayTotal = displayWidth * displayHeight;
let workWidth = 96;
let workHeight = 96;
let workTotal = workWidth * workHeight;
let scenarioKey = "cubeSphere";
let captureMode = "perfect";
let representationMode = "surface";
let detailMode = "full";
let inspectView = { yaw: 0, pitch: 0 };
let estimatorMode = "pattern";
let params = new Float64Array(PARAM_COUNT);
let targetParams = new Float64Array(PARAM_COUNT);
let m = new Float64Array(PARAM_COUNT);
let v = new Float64Array(PARAM_COUNT);
let lastGrad = new Float64Array(PARAM_COUNT);
let iter = 0;
let loss = 0;
let ms = 0;
let targetCapture = [];
let targetMaskCapture = [];
let targetDepthCapture = [];
// Every stochastic decision in this worker -- SPSA sign vectors, the topology scout's
// proposals, and the stochastic pixel batch -- draws from this one stream. It was a hardcoded
// constant, which made every convergence number the lab reports a single draw with no variance
// estimate. It is now settable from the reset payload and echoed back in meta.seed, so a run
// can be reproduced and a threshold can be checked against more than one draw.
const DEFAULT_SEED = 0x51f15df;
let seed = DEFAULT_SEED;
let rng = mulberry32(seed);

function normalizeSeed(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  // Keep it inside the uint32 range mulberry32 expects.
  return Math.abs(Math.floor(numeric)) % 0x100000000;
}
let shapeProposals = 0;
let targetDisplayCache = null;
let targetDisplayCacheKey = "";
let targetDisplayNeedsSend = true;
let rgbLoss = 0;
let geometryLoss = 0;
let objectRgbLoss = 0;
let sceneRgbLoss = 0;
let maskLoss = 0;
let depthLoss = 0;
let surfaceLoss = 0;
let inspectionRgbLoss = Infinity;
let inspectionGeometryLoss = Infinity;
let inspectionRmse = Infinity;
const inspectionAuditSize = 64;
let validationSamples = [];
let patternSamples = [];
let stableSteps = 0;
let validationScore = 0;
let validationDelta = 0;
let bestValidationScore = Infinity;
let bestParams = new Float64Array(PARAM_COUNT);
let checkpointRestores = 0;
let stepsSinceBest = 0;
let updateRms = 0;
let perturbScale = 1;
let learningRateScale = 1;
let optimizerPhase = "initializing";
let settled = false;
let acceptedUpdate = true;
let patternIndex = 0;
let patternCursor = 0;
let patternSteps = new Float64Array(PARAM_COUNT);
let patternRadius = 0;
let gaussNewtonLambda = 1e-3;

// Slots 18-20 belong to the fiber family. Their defaults are chosen so that every existing
// scenario is bit-unchanged: groom anisotropy 1 makes the SGGX cross-section identically 1,
// which reduces the fiber integrator exactly to the isotropic medium that already shipped.
const labels = ["cx", "cy", "cz", "scale", "shape", "red", "green", "blue", "rough", "light az", "light el", "power",
  "displacement", "noise frequency", "pattern contrast", "pattern frequency", "extinction", "density width",
  "fiber tilt", "azimuth roughness", "groom anisotropy"];
const minP = [-0.8, -0.6, -4.4, 0.5, 0, 0.05, 0.05, 0.05, 0.05, -1.8, 0.18, 0.35, 0, 1.5, 0, 1.5, 0.6, 0.015,
  0, 0.05, 0.05];
const maxP = [0.8, 0.6, -2.35, 1.18, 1, 1.0, 1.0, 1.0, 0.95, 1.8, 1.25, 1.9, 0.14, 8, 1, 10, 8, 0.2,
  0.14, 0.95, 1.0];
const sigma = [0.08, 0.08, 0.14, 0.06, 0.14, 0.08, 0.08, 0.08, 0.08, 0.16, 0.1, 0.12, 0.025, 0.7, 0.14, 0.8, 0.9, 0.03,
  0.02, 0.08, 0.09];

function withProceduralParams(base, detail = [0, 3.6, 0, 4.8, 4.5, 0.045], fiber = [0, 0.35, 1]) {
  return base.concat(detail, fiber);
}

const scenarios = {
  cubeSphere: {
    label: "cube to sphere",
    goal: "sphere",
    from: "box",
    to: "sphere",
    copy: "Fitting a cube-like SDF toward a smooth sphere target while material and lighting move too.",
    initial: withProceduralParams([-0.22, 0.07, -3.25, 0.82, 0.02, 0.25, 0.76, 0.9, 0.68, 0.25, 0.48, 0.9]),
    target: withProceduralParams([0.16, -0.08, -3.2, 0.82, 1.0, 0.95, 0.55, 0.25, 0.32, -0.7, 0.82, 1.28])
  },
  sphereTorus: {
    label: "sphere to torus",
    goal: "torus",
    from: "sphere",
    to: "torus",
    copy: "A topology-changing target: the initial smooth sphere has to open a torus hole and match the new silhouette.",
    topology: true,
    initial: withProceduralParams([-0.18, 0.02, -3.2, 0.84, 0.0, 0.85, 0.42, 0.28, 0.42, 0.28, 0.52, 1.0]),
    target: withProceduralParams([0.1, -0.02, -3.15, 0.95, 1.0, 0.48, 0.85, 0.72, 0.22, -0.92, 0.75, 1.3])
  },
  cubeTorus: {
    label: "cube to torus",
    goal: "torus",
    from: "box",
    to: "torus",
    copy: "A harder silhouette case: a box-like current SDF is fit toward a torus with different light and material.",
    topology: true,
    initial: withProceduralParams([-0.24, 0.1, -3.25, 0.78, 0.0, 0.3, 0.75, 0.88, 0.72, 0.42, 0.5, 0.9]),
    target: withProceduralParams([0.12, -0.04, -3.18, 0.96, 1.0, 0.95, 0.62, 0.25, 0.28, -0.82, 0.82, 1.32])
  },
  sphereCube: {
    label: "sphere to cube",
    goal: "cube",
    from: "sphere",
    to: "box",
    copy: "A smooth sphere must grow planar faces and sharper silhouette corners.",
    initial: withProceduralParams([-0.18, 0.06, -3.2, 0.8, 0.0, 0.75, 0.72, 0.36, 0.5, 0.2, 0.58, 1.0]),
    target: withProceduralParams([0.12, -0.06, -3.22, 0.84, 1.0, 0.35, 0.82, 0.95, 0.64, -0.68, 0.78, 1.22])
  },
  capsuleTorus: {
    label: "capsule to torus",
    goal: "torus",
    from: "capsule",
    to: "torus",
    copy: "A rounded capsule has to separate into a ring-like topology.",
    topology: true,
    initial: withProceduralParams([-0.22, 0.04, -3.18, 0.88, 0.0, 0.45, 0.88, 0.56, 0.36, 0.42, 0.58, 1.04]),
    target: withProceduralParams([0.06, -0.03, -3.12, 0.95, 1.0, 0.93, 0.45, 0.3, 0.26, -0.86, 0.78, 1.3])
  },
  torusSphere: {
    label: "torus to sphere",
    goal: "sphere",
    from: "torus",
    to: "sphere",
    copy: "A ring collapses into a sphere; this exposes how topology changes can be overfit from one view.",
    topology: true,
    initial: withProceduralParams([-0.14, 0.02, -3.18, 0.94, 0.0, 0.52, 0.82, 0.88, 0.25, 0.5, 0.58, 1.04]),
    target: withProceduralParams([0.1, -0.06, -3.16, 0.82, 1.0, 0.9, 0.56, 0.28, 0.38, -0.72, 0.82, 1.26])
  },
  coralTorus: {
    label: "smooth shell to coral torus",
    goal: "ridged coral torus",
    from: "capsule",
    to: "torus",
    copy: "A topology-flexible surface must recover three-octave displacement and an object-space pigment pattern from calibrated appearances.",
    topology: true,
    procedural: true,
    targetKind: "surface",
    initial: withProceduralParams([-0.05, 0.0, -3.15, 0.94, 0.78, 0.34, 0.72, 0.78, 0.38, -0.45, 0.68, 1.15],
      [0.008, 3.2, 0.04, 5.4, 4.0, 0.055]),
    target: withProceduralParams([0.06, -0.03, -3.15, 0.97, 1.0, 0.22, 0.72, 0.88, 0.28, -0.8, 0.78, 1.28],
      [0.068, 4.7, 0.7, 6.1, 5.2, 0.045])
  },
  smokeKnot: {
    label: "smooth fog to turbulent knot",
    goal: "turbulent density knot",
    from: "sphere",
    to: "torus",
    copy: "A participating medium must recover extinction, density width, macro topology, and correlated 3D noise from multi-view radiance.",
    topology: true,
    procedural: true,
    targetKind: "medium",
    initial: withProceduralParams([-0.06, 0.02, -3.16, 0.96, 0.55, 0.48, 0.64, 0.82, 0.62, -0.42, 0.68, 1.08],
      [0.025, 2.7, 0.08, 4.3, 1.8, 0.07]),
    target: withProceduralParams([0.05, -0.02, -3.14, 1.0, 0.9, 0.4, 0.68, 0.94, 0.7, -0.72, 0.78, 1.22],
      [0.11, 3.8, 0.5, 5.0, 5.4, 0.14])
  },
  mineralCore: {
    label: "Veined mineral core",
    goal: "ridged mineral study",
    from: "box",
    to: "sphere",
    procedural: true,
    targetKind: "surface",
    copy: "A mineral-inspired procedural surface. Recover a rounded cubic profile, geometric relief and banded pigment together; the material is the lab's surface closure, not crystalline light transport.",
    initial: withProceduralParams([-0.05, 0.02, -3.16, 0.90, 0.10, 0.52, 0.30, 0.70, 0.54, -0.4, 0.7, 1.08],
      [0.016, 3.5, 0.18, 5.2, 4.5, 0.05]),
    target: withProceduralParams([0.04, -0.03, -3.15, 0.99, 0.28, 0.78, 0.22, 0.56, 0.20, -0.85, 0.9, 1.45],
      [0.10, 5.6, 0.88, 7.1, 4.5, 0.05])
  },
  opalCloud: {
    label: "Opal cloud",
    goal: "layered pigment in a density cloud",
    from: "capsule",
    to: "sphere",
    procedural: true,
    targetKind: "medium",
    copy: "A capsule-to-sphere extinction field with correlated noise and spatial pigment. Fit density, width and appearance from integrated transmittance and single-scatter radiance.",
    initial: withProceduralParams([-0.06, 0.03, -3.16, 0.91, 0.10, 0.50, 0.47, 0.69, 0.62, -0.4, 0.68, 1.10],
      [0.025, 2.8, 0.12, 4.5, 2.0, 0.09]),
    target: withProceduralParams([0.04, -0.03, -3.15, 1.04, 0.38, 0.94, 0.24, 0.08, 0.62, -0.92, 0.95, 1.80],
      [0.125, 5.3, 0.80, 6.8, 5.7, 0.17])
  },
  furSphere: {
    label: "bare shell to fur ball",
    goal: "radial-groom fur shell",
    from: "sphere",
    to: "sphere",
    copy: "A radial fiber groom must recover density, groom anisotropy, and the two fiber-lobe roughnesses. One image contains the optically thin, intermediate, and thick regimes at once, indexed by radius.",
    procedural: true,
    targetKind: "fiber",
    initial: withProceduralParams([-0.05, 0.01, -3.18, 0.9, 0.0, 0.52, 0.44, 0.36, 0.5, -0.35, 0.62, 1.05],
      [0, 3.6, 0, 4.8, 2.2, 0.085], [0.02, 0.6, 0.85]),
    target: withProceduralParams([0.04, -0.02, -3.16, 0.94, 0.0, 0.74, 0.52, 0.3, 0.32, -0.75, 0.8, 1.24],
      [0, 3.6, 0, 4.8, 5.1, 0.115], [0.085, 0.28, 0.32])
  }
};

const captureProfiles = {
  perfect: {
    label: "perfect multi-view",
    copy: "Four calibrated RGB views, registered silhouettes, and depth constrain side and rear geometry.",
    views: [{ yaw: 0, pitch: 0 }, { yaw: 0.82, pitch: 0.04 }, { yaw: -0.82, pitch: 0.04 }, { yaw: Math.PI, pitch: 0.02 }],
    assumedBias: { yaw: 0, pitch: 0 }
  },
  single: {
    label: "single front view",
    copy: "One segmented RGB view supplies a silhouette but no depth; inspected side views can still be wrong.",
    views: [{ yaw: 0, pitch: 0 }],
    assumedBias: { yaw: 0, pitch: 0 }
  },
  sparse: {
    label: "sparse two-view",
    copy: "Two segmented RGB views add silhouette evidence, but depth and back-side detail remain underconstrained.",
    views: [{ yaw: 0, pitch: 0 }, { yaw: 0.9, pitch: 0.06 }],
    assumedBias: { yaw: 0, pitch: 0 }
  },
  badCalibration: {
    label: "bad calibration",
    copy: "The target images are correct, but optimization uses biased camera poses.",
    views: [{ yaw: 0, pitch: 0 }, { yaw: 0.8, pitch: 0.04 }, { yaw: -0.75, pitch: 0.03 }],
    assumedBias: { yaw: 0.16, pitch: -0.06 }
  }
};

self.onmessage = (event) => {
  const { id, action, payload = {} } = event.data;
  try {
    if (action === "reset") {
      const requestedSeed = normalizeSeed(payload.seed);
      if (requestedSeed !== null) seed = requestedSeed;
      if (payload.displayResolution) setDisplayResolution(payload.displayResolution);
      if (payload.workResolution) setWorkResolution(payload.workResolution);
      if (payload.resolution) {
        setDisplayResolution(payload.resolution);
        setWorkResolution(payload.resolution);
      }
      if (payload.scenario) scenarioKey = payload.scenario;
      if (payload.capture) captureMode = payload.capture;
      if (["coordinate", "spsa", "pattern", "gaussnewton"].includes(payload.estimator)) estimatorMode = payload.estimator;
      representationMode = payload.representation === "medium" || payload.representation === "fiber" ? payload.representation : "surface";
      detailMode = payload.detailMode === "macro" ? "macro" : "full";
      if (payload.view) inspectView = payload.view;
      resetState();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setScenario") {
      scenarioKey = payload.scenario || scenarioKey;
      resetState();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setRepresentation") {
      representationMode = payload.representation === "medium" || payload.representation === "fiber" ? payload.representation : "surface";
      resetState();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setDetailMode") {
      detailMode = payload.detailMode === "macro" ? "macro" : "full";
      resetState();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setCapture") {
      captureMode = payload.capture || captureMode;
      resetTargets();
      resetOptimizerDiagnostics(false);
      refreshValidationCheckpoint();
      refreshInspectionAudit();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setResolution") {
      setDisplayResolution(payload.resolution || displayWidth);
      setWorkResolution(payload.resolution || workWidth);
      resetTargets();
      resetOptimizerDiagnostics(false);
      refreshValidationCheckpoint();
      refreshInspectionAudit();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setDisplayResolution") {
      setDisplayResolution(payload.resolution || displayWidth);
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setWorkResolution") {
      setWorkResolution(payload.resolution || workWidth);
      resetTargets();
      resetOptimizerDiagnostics(false);
      refreshValidationCheckpoint();
      refreshInspectionAudit();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setSeed") {
      // Changing the seed restarts the run: the stream drives proposals and sample batches,
      // so continuing from mid-run state under a new seed would be neither reproducible nor
      // a clean second draw.
      const requestedSeed = normalizeSeed(payload.seed);
      seed = requestedSeed === null ? DEFAULT_SEED : requestedSeed;
      resetState();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setEstimator") {
      estimatorMode = ["coordinate", "pattern", "gaussnewton"].includes(payload.estimator) ? payload.estimator : "spsa";
      m.fill(0);
      v.fill(0);
      resetOptimizerDiagnostics(false);
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "setView") {
      inspectView = payload.view || inspectView;
      refreshInspectionAudit();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "step") {
      const count = Math.max(1, payload.count || 1);
      for (let i = 0; i < count; i += 1) stepOnce();
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "stepLite") {
      const count = Math.max(1, payload.count || 1);
      for (let i = 0; i < count; i += 1) stepOnce();
      postResult(id, { images: false });
    } else if (action === "ensemble") {
      postResult(id, { images: false, ensemble: runEnsemble(payload) });
    } else if (action === "render") {
      if (payload.forceTarget) targetDisplayNeedsSend = true;
      if (payload.view) {
        inspectView = payload.view;
        refreshInspectionAudit();
      }
      postResult(id, { images: payload.images !== false, previewResolution: payload.previewResolution });
    } else if (action === "capturePreview") {
      postCapturePreview(id, payload.size || 84);
    } else if (action === "orbitAudit") {
      postOrbitAudit(id, payload);
    }
  } catch (error) {
    self.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
};

resetState();

function setDisplayResolution(value) {
  const next = Number(value);
  displayWidth = [144,192,256,320,512,768].includes(next) ? next : 512;
  displayHeight = displayWidth;
  displayTotal = displayWidth * displayHeight;
  invalidateTargetDisplay();
}

function setWorkResolution(value) {
  const next = Number(value);
  workWidth = next === 64 || next === 96 || next === 128 || next === 160 ? next : 96;
  workHeight = workWidth;
  workTotal = workWidth * workHeight;
}

function resetState() {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  params = new Float64Array(scenario.initial);
  if (scenario.procedural && detailMode === "macro") {
    params[12] = 0;
    params[14] = 0;
  }
  targetParams = new Float64Array(scenario.target);
  m = new Float64Array(labels.length);
  v = new Float64Array(labels.length);
  lastGrad = new Float64Array(labels.length);
  iter = 0;
  ms = 0;
  shapeProposals = 0;
  rng = mulberry32(seed);
  resetOptimizerDiagnostics(true);
  invalidateTargetDisplay();
  resetTargets();
  const metrics = lossComponents(params, validationSamples);
  setLossMetrics(metrics);
  validationScore = scoreMetrics(metrics);
  refreshInspectionAudit();
  bestValidationScore = validationScore;
  bestParams.set(params);
}

function resetTargets() {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const evidence = profile.views.map((view) => renderEvidence(targetParams, view, workWidth, workHeight));
  targetCapture = evidence.map((item) => item.rgb);
  targetMaskCapture = evidence.map((item) => item.mask);
  const validationCount = (representationMode === "medium" || representationMode === "fiber") ? 1024 : 2048;
  validationSamples = makeValidationSamples(validationCount, 0.5, 0.5);
  patternSamples = validationSamples;
  targetDepthCapture = evidence.map((item) => item.depth);
}

function sampleCount() {
  return Math.min(4096, Math.max(512, Math.floor(workTotal / 5)));
}

function activeParameterIndices() {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  if (!scenario.procedural) return Array.from({ length: 12 }, (_, index) => index);
  const macro = [4, 3, 0, 1, 2, 5, 6, 7, 8, 9, 10, 11];
  // Fiber ordering is structure first, then lobe shape, then tilt: density and groom
  // anisotropy set the silhouette, the two roughnesses shape the highlights, and the cuticle
  // tilt is the finest correction. Pattern search walks this array in order.
  if (representationMode === "fiber") {
    const fiberMacro = [16, 17, 20, 19, 18].concat(macro);
    return detailMode === "macro" ? fiberMacro : [12, 14, 13, 15].concat(fiberMacro);
  }
  if (detailMode === "macro") return representationMode === "medium" ? [16, 17].concat(macro) : macro;
  const detail = [12, 14, 13, 15, 4, 3, 0, 1, 2, 5, 6, 7, 8, 9, 10, 11];
  return representationMode === "medium" ? [16, 17].concat(detail) : detail;
}

function isGeometryParameter(index) {
  // Groom anisotropy moves the silhouette rim directly, so it is routed to the geometry
  // objective. Fiber tilt and azimuth roughness only reshape the lobes, so they are not.
  return index < 5 || index === 12 || index === 13 || index === 16 || index === 17 || index === 20;
}

function objectiveForParameter(index, inspectionGuided) {
  if (index === 16 || index === 17 || index === 20) return mediumStructureLoss;
  if (isGeometryParameter(index)) return geometryLossOnly;
  return inspectionGuided ? appearanceSearchLoss : appearanceLossOnly;
}

function optimizerLossEvaluations() {
  if (estimatorMode === "pattern") return 3;
  // Gauss-Newton spends the same 2P derivative evaluations as coordinate finite differences,
  // and J^T J comes free from them. Wall clock is NOT the same, though: each evaluation is a
  // full residual vector over the whole validation lattice including the surface-consistency
  // term, where the coordinate lane evaluates a routed scalar objective that skips most of
  // that. Measured, a GN step costs roughly 3-4x a coordinate step -- and buys about three
  // orders of magnitude more convergence for it.
  if (estimatorMode === "gaussnewton") return activeParameterIndices().length * 2;
  if (estimatorMode === "coordinate") return activeParameterIndices().length * 2;
  const active = activeParameterIndices();
  const blocks = [
    active.filter((index) => isGeometryParameter(index) && index < 16),
    active.filter((index) => index === 5 || index === 6 || index === 7 || index === 14 || index === 15),
    // Both fiber-lobe roughnesses share a block: beta_m and beta_n shape the same highlight
    // and separating them would imply an independence the measurement does not have.
    active.filter((index) => index === 8 || index === 18 || index === 19),
    active.filter((index) => index >= 9 && index <= 11),
    active.filter((index) => index === 16 || index === 17 || index === 20)
  ].filter((indices) => indices.length);
  return blocks.length * 2;
}

// Ensemble posterior.
//
// Every number this workspace reports is a point estimate, and the manifest has had to say so.
// Fisher information is the usual alternative, but it is a local Gaussian approximation and is
// provably blind to the failure this lab now demonstrates elsewhere -- the anisotropy branch,
// where two parameter sets give byte-identical images while the Fisher matrix reports full rank
// and a healthy condition number.
//
// An ensemble is the honest tool for a multimodal landscape, and the benchmark makes the case
// concretely: Gauss-Newton's loss spread across three seeds on cubeSphere is 2062x, so "the"
// answer that workspace displays is one draw from a distribution with a long tail.
//
// This restarts the solve K times from independent seeds and reports the per-parameter spread.
// It is a spread over restarts, NOT a posterior: there is no likelihood, no prior, and no
// guarantee the restarts sample the modes in proportion to anything. It answers "would a
// different run have told me something else", which is the question a point estimate silently
// assumes away.
function runEnsemble(payload = {}) {
  const members = Math.min(8, Math.max(2, payload.members || 4));
  const steps = Math.min(400, Math.max(10, payload.steps || 60));
  const savedSeed = seed;
  const savedParams = Float64Array.from(params);
  const savedBest = Float64Array.from(bestParams);
  const results = [];
  for (let member = 0; member < members; member += 1) {
    // Deterministic seed ladder, so an ensemble is itself reproducible from the base seed.
    seed = (savedSeed + member * 0x9e3779b1) >>> 0;
    resetState();
    for (let step = 0; step < steps; step += 1) stepOnce();
    results.push({
      seed,
      params: Array.from(params),
      loss,
      geometryLoss,
      rgbLoss,
      inspectionRmse,
      phase: optimizerPhase
    });
  }
  // Restore the interactive state so running an ensemble does not silently move the solve the
  // user was looking at.
  seed = savedSeed;
  resetState();
  params.set(savedParams);
  bestParams.set(savedBest);
  setLossMetrics(lossComponents(params, validationSamples));
  refreshInspectionAudit();

  const active = activeParameterIndices();
  const spread = active.map((index) => {
    const values = results.map((entry) => entry.params[index]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const range = Math.max(1e-9, maxP[index] - minP[index]);
    return {
      index,
      label: labels[index],
      mean,
      min,
      max,
      sd: Math.sqrt(variance),
      // Normalized by the parameter's own range so coordinates with different units compare.
      normalizedSpread: (max - min) / range,
      truth: targetParams[index]
    };
  });
  const losses = results.map((entry) => entry.loss).sort((a, b) => a - b);
  return {
    members,
    steps,
    spread,
    losses,
    lossSpread: losses[losses.length - 1] / Math.max(1e-12, losses[0]),
    agreeing: spread.filter((entry) => entry.normalizedSpread < 0.02).length,
    disagreeing: spread.filter((entry) => entry.normalizedSpread >= 0.02).map((entry) => entry.label)
  };
}

function stepOnce() {
  if (settled) return;
  const started = performance.now();
  const before = new Float64Array(params);
  const samples = estimatorMode === "pattern" ? validationSamples : makeSamples(sampleCount());
  const scheduleT = iter + 1;
  const restartAnneal = Math.min(8, checkpointRestores);
  perturbScale = Math.max(0.08, (1 + Math.max(0, scheduleT - 20) / 45) ** -0.5 * 0.82 ** restartAnneal);
  learningRateScale = Math.max(0.04, (1 + Math.max(0, scheduleT - 30) / 90) ** -0.68 * 0.72 ** restartAnneal);
  geometryScout(samples);
  lastGrad.fill(0);
  acceptedUpdate = true;

  if (estimatorMode === "pattern") {
    acceptedUpdate = stepPatternSearch(samples);
  } else if (estimatorMode === "gaussnewton") {
    // Second order on the same fit lattice pattern search uses, so the comparison is fair.
    acceptedUpdate = stepGaussNewton(validationSamples);
  } else if (estimatorMode === "coordinate") {
    for (const i of activeParameterIndices()) {
      const plus = new Float64Array(params);
      const minus = new Float64Array(params);
      const eps = sigma[i] * 0.38 * perturbScale;
      plus[i] += eps;
      minus[i] -= eps;
      clampParams(plus);
      clampParams(minus);
      const objective = objectiveForParameter(i, false);
      const lossPlus = objective(plus, samples);
      const lossMinus = objective(minus, samples);
      lastGrad[i] = (lossPlus - lossMinus) / Math.max(1e-5, plus[i] - minus[i]);
    }
  } else {
    const active = activeParameterIndices();
    estimateSpsaIndices(active.filter((index) => isGeometryParameter(index) && index < 16), geometryLossOnly, samples);
    estimateSpsaIndices(active.filter((index) => index === 5 || index === 6 || index === 7 || index === 14 || index === 15), appearanceLossOnly, samples);
    estimateSpsaIndices(active.filter((index) => index === 8), appearanceLossOnly, samples);
    estimateSpsaIndices(active.filter((index) => index >= 9 && index <= 11), appearanceLossOnly, samples);
    estimateSpsaIndices(active.filter((index) => index === 16 || index === 17), mediumStructureLoss, samples);
  }

  if (estimatorMode !== "pattern") {
    const t = iter + 1;
    const beta1 = 0.9;
    const beta2 = 0.985;
    for (const i of activeParameterIndices()) {
      const baseLr = estimatorMode === "spsa"
        ? (isGeometryParameter(i) ? 0.04 : 0.032)
        : (isGeometryParameter(i) ? 0.05 : 0.043);
      const lr = baseLr * learningRateScale;
      const g = clamp(lastGrad[i], -2.5, 2.5);
      m[i] = beta1 * m[i] + (1 - beta1) * g;
      v[i] = beta2 * v[i] + (1 - beta2) * g * g;
      const mh = m[i] / (1 - beta1 ** t);
      const vh = v[i] / (1 - beta2 ** t);
      const span = maxP[i] - minP[i];
      params[i] -= lr * span * mh / (Math.sqrt(vh) + 1e-5);
    }
    clampParams(params);
  }

  iter += 1;
  const metrics = lossComponents(params, validationSamples);
  setLossMetrics(metrics);
  updateOptimizerDiagnostics(before, metrics);
  const elapsed = performance.now() - started;
  ms = ms ? ms * 0.82 + elapsed * 0.18 : elapsed;
}

function estimateSpsaIndices(indices, objective, samples) {
  if (!indices.length) return;
  const plus = new Float64Array(params);
  const minus = new Float64Array(params);
  for (const index of indices) {
    const direction = rng() < 0.5 ? -1 : 1;
    const eps = sigma[index] * 0.38 * perturbScale * direction;
    plus[index] += eps;
    minus[index] -= eps;
  }
  clampParams(plus);
  clampParams(minus);
  const lossPlus = objective(plus, samples);
  const lossMinus = objective(minus, samples);
  for (const index of indices) {
    const denominator = plus[index] - minus[index];
    lastGrad[index] = (lossPlus - lossMinus) / (Math.abs(denominator) > 1e-6 ? denominator : 1e-6);
  }
}

function resetOptimizerDiagnostics() {
  validationDelta = 0;
  stepsSinceBest = 0;
  checkpointRestores = 0;
  updateRms = 0;
  perturbScale = 1;
  learningRateScale = 1;
  optimizerPhase = "initializing";
  settled = false;
  acceptedUpdate = true;
  patternCursor = 0;
  patternIndex = activeParameterIndices()[0] || 0;
  patternSteps = new Float64Array(labels.length);
  for (let i = 0; i < labels.length; i += 1) patternSteps[i] = sigma[i] * 0.7;
  patternRadius = normalizedPatternRadius();
  stableSteps = 0;
  bestParams.set(params);
  bestValidationScore = Number.isFinite(validationScore) ? validationScore : Infinity;
}
function refreshValidationCheckpoint() {
  const metrics = lossComponents(params, validationSamples);
  setLossMetrics(metrics);
  validationScore = scoreMetrics(metrics);
  validationDelta = 0;
  bestValidationScore = validationScore;
  bestParams.set(params);
  stepsSinceBest = 0;
}


function stepPatternSearch(samples) {
  const active = activeParameterIndices();
  const index = active[patternCursor] ?? 0;
  const objective = objectiveForParameter(index, true);
  const baseLoss = objective(params, samples);
  const plus = new Float64Array(params);
  const minus = new Float64Array(params);
  plus[index] += patternSteps[index];
  minus[index] -= patternSteps[index];
  clampParams(plus);
  clampParams(minus);
  const plusLoss = objective(plus, samples);
  const minusLoss = objective(minus, samples);
  const gainFloor = Math.max(1e-8, baseLoss * 2e-5);
  let candidate = null;
  let candidateLoss = baseLoss;
  if (plusLoss < candidateLoss - gainFloor) {
    candidate = plus;
    candidateLoss = plusLoss;
  }
  if (minusLoss < candidateLoss - gainFloor) {
    candidate = minus;
    candidateLoss = minusLoss;
  }

  if (candidate) {
    params.set(candidate);
    patternSteps[index] = Math.min(sigma[index] * 1.2, patternSteps[index] * 1.06);
  } else {
    const minStep = (maxP[index] - minP[index]) * 0.0002;
    patternSteps[index] = Math.max(minStep, patternSteps[index] * 0.72);
  }
  patternCursor = (patternCursor + 1) % Math.max(1, active.length);
  patternIndex = active[patternCursor] ?? 0;
  patternRadius = normalizedPatternRadius();
  perturbScale = patternRadius;
  learningRateScale = 0;
  return Boolean(candidate);
}

function normalizedPatternRadius() {
  let sum = 0;
  const active = activeParameterIndices();
  for (const i of active) {
    const normalized = patternSteps[i] / Math.max(1e-9, maxP[i] - minP[i]);
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / Math.max(1, active.length));
}

function scoreMetrics(metrics) {
  return metrics.geometry + metrics.rgb;
}

function normalizedParamDistance(a, b) {
  let sum = 0;
  const active = activeParameterIndices();
  for (const i of active) {
    const normalized = (b[i] - a[i]) / Math.max(1e-9, maxP[i] - minP[i]);
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / Math.max(1, active.length));
}

function updateOptimizerDiagnostics(before, metrics) {
  updateRms = normalizedParamDistance(before, params);
  const previousScore = validationScore;
  validationScore = scoreMetrics(metrics);
  validationDelta = Number.isFinite(previousScore) ? previousScore - validationScore : 0;
  const gainFloor = Math.max(1e-8, bestValidationScore * 1e-5);
  if (validationScore < bestValidationScore - gainFloor) {
    bestValidationScore = validationScore;
    bestParams.set(params);
    stepsSinceBest = 0;
  } else {
    stepsSinceBest += 1;
  }

  const checkpointTolerance = iter < 80 ? 0.04 : iter < 180 ? 0.012 : 0.004;
  if (estimatorMode !== "pattern" && iter >= 40 && validationScore > bestValidationScore * (1 + checkpointTolerance)) {
    params.set(bestParams);
    metrics = lossComponents(params, validationSamples);
    setLossMetrics(metrics);
    validationScore = scoreMetrics(metrics);
    validationDelta = Number.isFinite(previousScore) ? previousScore - validationScore : 0;
    updateRms = normalizedParamDistance(before, params);
    acceptedUpdate = false;
    checkpointRestores += 1;
    stepsSinceBest = 0;
    for (let i = 0; i < labels.length; i += 1) {
      m[i] *= 0.2;
      v[i] *= 0.5;
    }
  }

  const stable = updateRms < 0.0012 && Math.abs(validationDelta) < 0.00002;
  stableSteps = stable ? stableSteps + 1 : 0;
  const fitReady = metrics.geometry < 0.00015 && metrics.rgb < 0.00008;
  if (iter === 1 || iter % 12 === 0 || (fitReady && iter % 4 === 0)) refreshInspectionAudit();
  const inspectionReady = inspectionGeometryLoss < 0.00015 && inspectionRgbLoss < 0.00007;
  const patternConverged = estimatorMode === "pattern" && iter >= 160 && fitReady && inspectionReady &&
    (stableSteps >= 3 || patternRadius < 0.008);
  const gradientConverged = estimatorMode !== "pattern" && iter >= 140 && fitReady && inspectionReady &&
    (stableSteps >= 8 || checkpointRestores >= 12);
  const converged = patternConverged || gradientConverged;
  const plateaued = estimatorMode === "pattern"
    ? iter >= 420 && stableSteps >= 24
    : iter >= 360 && stableSteps >= 14 && checkpointRestores >= 8;
  const exhausted = iter >= 600;

  if (converged || plateaued || exhausted) {
    if (!converged || estimatorMode !== "pattern") params.set(bestParams);
    const bestMetrics = lossComponents(params, validationSamples);
    setLossMetrics(bestMetrics);
    validationScore = scoreMetrics(bestMetrics);
    refreshInspectionAudit();
    updateRms = 0;
    lastGrad.fill(0);
    m.fill(0);
    v.fill(0);
    settled = true;
    const verified = bestMetrics.geometry < 0.00015 && bestMetrics.rgb < 0.00008 &&
      inspectionGeometryLoss < 0.00015 && inspectionRgbLoss < 0.00007;
    optimizerPhase = converged && verified ? "converged" : "plateau";
    return;
  }

  if (iter < 20) optimizerPhase = "explore";
  else if (estimatorMode === "pattern" && patternRadius > 0.012) optimizerPhase = "direct search";
  else if (checkpointRestores > 0 || perturbScale <= 0.55) optimizerPhase = "settle";
  else optimizerPhase = "refine";
}

function makeValidationSamples(count, offsetX = 0.5, offsetY = 0.5) {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const views = profile.views.length;
  const perView = Math.max(1, Math.ceil(count / views));
  const out = [];
  for (let viewIndex = 0; viewIndex < views && out.length < count; viewIndex += 1) {
    const shiftX = fract(offsetX + viewIndex * 0.38196601125);
    const shiftY = fract(offsetY + viewIndex * 0.61803398875);
    for (let i = 0; i < perView && out.length < count; i += 1) {
      const hx = fract(radicalInverse(i + 1, 2) + shiftX);
      const hy = fract(radicalInverse(i + 1, 3) + shiftY);
      out.push({
        viewIndex,
        x: Math.min(workWidth - 1, Math.floor(hx * workWidth)),
        y: Math.min(workHeight - 1, Math.floor(hy * workHeight))
      });
    }
  }
  return out;
}

function radicalInverse(index, base) {
  let value = 0;
  let factor = 1 / base;
  while (index > 0) {
    value += (index % base) * factor;
    index = Math.floor(index / base);
    factor /= base;
  }
  return value;
}

function fract(value) {
  return value - Math.floor(value);
}
function postResult(id, options = {}) {
  const includeImages = options.images !== false;
  const width = [128, 192, 256].includes(options.previewResolution) ? Math.min(displayWidth, options.previewResolution) : displayWidth;
  const height = width;
  const current = includeImages ? renderBytes(params, inspectView, width, height) : null;
  const cachedGoal = includeImages ? ensureTargetDisplay(width, height) : null;
  const goal = includeImages && targetDisplayNeedsSend ? cachedGoal.slice() : null;
  const residual = includeImages ? residualBytes(current, cachedGoal) : null;
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  const message = {
    id,
    width,
    height,
    current,
    goal,
    residual,
    meta: {
      scenario: scenarioKey,
      scenarioLabel: scenario.label,
      goal: scenario.goal,
      scenarioCopy: scenario.copy,
      targetKind: scenario.targetKind || "surface",
      procedural: Boolean(scenario.procedural),
      representation: representationMode,
      detailMode,
      activeParameters: activeParameterIndices().map((index) => labels[index]),
      parameterLabels: labels.slice(),
      seed,
      capture: captureMode,
      captureLabel: profile.label,
      captureCopy: profile.copy,
      captureViews: profile.views.length,
      captureBias: profile.assumedBias || { yaw: 0, pitch: 0 },
      captureDepthSupervised: captureMode === "perfect",
      displayResolution: displayWidth,
      workResolution: workWidth,
      params: Array.from(params),
      targetParams: Array.from(targetParams),
      grad: Array.from(lastGrad),
      loss,
      rgbLoss,
      objectRgbLoss,
      sceneRgbLoss,
      geometryLoss,
      maskLoss,
      depthLoss,
      surfaceLoss,
      inspectionRgbLoss,
      inspectionGeometryLoss,
      inspectionRmse,
      inspectionAuditSize,
      iter,
      ms,
      boundaryMass: estimateBoundaryMass(params),
      sampleCount: estimatorMode === "pattern" ? validationSamples.length : sampleCount(),
      validationSamples: validationSamples.length,
      shapeProposals,
      estimator: estimatorMode,
      lossEvaluations: optimizerLossEvaluations(),
      validationScore,
      validationDelta,
      bestValidationScore,
      updateRms,
      perturbScale,
      learningRateScale,
      optimizerPhase,
      settled,
      acceptedUpdate,
      stepsSinceBest,
      checkpointRestores,
      stableSteps,
      patternRadius
    }
  };
  // Optional extra payload (currently the ensemble summary) rides along on the same result so
  // the caller does not need a second message shape.
  if (options.ensemble) message.meta.ensemble = options.ensemble;
  if (includeImages) {
    const transfer = [current.buffer, residual.buffer];
    if (goal) transfer.push(goal.buffer);
    targetDisplayNeedsSend = false;
    self.postMessage(message, transfer);
  } else {
    self.postMessage(message);
  }
}

function invalidateTargetDisplay() {
  targetDisplayCache = null;
  targetDisplayCacheKey = "";
  targetDisplayNeedsSend = true;
}

function ensureTargetDisplay(width = displayWidth, height = displayHeight) {
  const key = `${scenarioKey}|${width}|${height}|${inspectView.yaw || 0}|${inspectView.pitch || 0}`;
  if (!targetDisplayCache || targetDisplayCacheKey !== key) {
    targetDisplayCache = renderBytes(targetParams, inspectView, width, height, true);
    targetDisplayCacheKey = key;
    targetDisplayNeedsSend = true;
  }
  return targetDisplayCache;
}

function postCapturePreview(id, sizeValue) {
  const size = sizeValue === 72 || sizeValue === 84 || sizeValue === 96 ? sizeValue : 84;
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const previews = profile.views.map((view, index) => {
    const assumed = { yaw: view.yaw + profile.assumedBias.yaw, pitch: view.pitch + profile.assumedBias.pitch };
    const image = renderBytes(targetParams, view, size, size, true);
    return {
      index,
      width: size,
      height: size,
      image,
      trueView: describeView(view),
      assumedView: describeView(assumed),
      hasBias: Math.abs(profile.assumedBias.yaw) > 1e-6 || Math.abs(profile.assumedBias.pitch) > 1e-6
    };
  });
  self.postMessage({
    id,
    kind: "capturePreview",
    meta: {
      capture: captureMode,
      captureLabel: profile.label,
      captureCopy: profile.copy,
      captureViews: profile.views.length,
      assumedBias: {
        yaw: profile.assumedBias.yaw,
        pitch: profile.assumedBias.pitch,
        yawDeg: radiansToDeg(profile.assumedBias.yaw),
        pitchDeg: radiansToDeg(profile.assumedBias.pitch)
      }
    },
    previews
  }, previews.map((preview) => preview.image.buffer));
}

function describeView(view) {
  const pose = cameraPose(view);
  return {
    yaw: view.yaw,
    pitch: view.pitch,
    yawDeg: radiansToDeg(view.yaw),
    pitchDeg: radiansToDeg(view.pitch),
    position: pose.ro,
    direction: pose.forward
  };
}

function postOrbitAudit(id, payload = {}) {
  const candidateCount = Math.max(12, Math.min(24, Number(payload.count) || 18));
  const size = Math.max(28, Math.min(56, Number(payload.size) || 40));
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const entries = [];
  let meanScore = 0;
  let worst = null;
  let recommendation = null;

  for (let index = 0; index < candidateCount; index += 1) {
    const yaw = -Math.PI + index / candidateCount * Math.PI * 2;
    const pitch = 0.1 + Math.sin(yaw * 2) * 0.12;
    const view = { yaw, pitch };
    const metrics = orbitViewMetrics(view, size);
    let nearest = Infinity;
    for (const training of profile.views) {
      const delta = Math.abs(Math.atan2(Math.sin(yaw - training.yaw), Math.cos(yaw - training.yaw)));
      nearest = Math.min(nearest, Math.hypot(delta, pitch - training.pitch));
    }
    const novelty = clamp01(nearest / (Math.PI / 2));
    const covered = nearest < 0.27;
    const acquisition = metrics.score * (0.72 + novelty * 0.28) + metrics.geometry * 0.18;
    const entry = {
      index,
      yaw,
      pitch,
      yawDeg: radiansToDeg(yaw),
      pitchDeg: radiansToDeg(pitch),
      rgb: metrics.rgb,
      geometry: metrics.geometry,
      mask: metrics.mask,
      depth: metrics.depth,
      score: metrics.score,
      novelty,
      covered,
      acquisition
    };
    entries.push(entry);
    meanScore += entry.score / candidateCount;
    if (!worst || entry.score > worst.score) worst = entry;
    if (!recommendation ||
        (!covered && recommendation.covered) ||
        (covered === recommendation.covered && acquisition > recommendation.acquisition)) {
      recommendation = entry;
    }
  }

  self.postMessage({
    id,
    kind: "orbitAudit",
    meta: {
      capture: captureMode,
      captureLabel: profile.label,
      trainingViews: profile.views.map(describeView),
      candidateCount,
      meanScore,
      worst,
      recommendation,
      coveredCandidates: entries.filter((entry) => entry.covered).length
    },
    entries
  });
}

function orbitViewMetrics(view, size, candidate = params) {
  let rgbSum = 0;
  let objectRgbSum = 0;
  let objectCount = 0;
  let maskSum = 0;
  let depthSum = 0;
  let overlapCount = 0;
  const total = size * size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const current = renderSample(candidate, x, y, view, size, size);
      const goal = renderTargetSample(targetParams, x, y, view, size, size);
      const dr = current.rgb[0] - goal.rgb[0];
      const dg = current.rgb[1] - goal.rgb[1];
      const db = current.rgb[2] - goal.rgb[2];
      const rgbError = (dr * dr + dg * dg + db * db) / 3;
      const dm = current.mask - goal.mask;
      rgbSum += rgbError;
      if (current.mask || goal.mask) {
        objectRgbSum += rgbError;
        objectCount += 1;
      }
      maskSum += dm * dm;
      if (current.mask && goal.mask) {
        const dd = (current.depth - goal.depth) / 2;
        depthSum += dd * dd;
        overlapCount += 1;
      }
    }
  }
  const sceneRgb = rgbSum / total;
  const objectRgb = objectCount ? objectRgbSum / objectCount : sceneRgb;
  const rgb = objectRgb * 0.82 + sceneRgb * 0.18;
  const mask = maskSum / total;
  const depth = overlapCount ? depthSum / overlapCount : 0;
  const geometry = mask * geometryMaskWeight() + depth * geometryDepthWeight();
  return { rgb, mask, depth, geometry, score: rgb + geometry };
}

function refreshInspectionAudit() {
  const metrics = orbitViewMetrics(inspectView, inspectionAuditSize);
  inspectionRgbLoss = metrics.rgb;
  inspectionGeometryLoss = metrics.geometry;
  inspectionRmse = Math.sqrt(Math.max(0, metrics.rgb));
}

function cameraPose(view) {
  const yaw = view.yaw || 0;
  const pitch = view.pitch || 0;
  const target = [0, 0, -3.18];
  const radius = 3.18;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const ro = [target[0] + sy * cp * radius, target[1] + sp * radius, target[2] + cy * cp * radius];
  const forward = vnorm(vsub(target, ro));
  return { ro, forward };
}

function radiansToDeg(value) {
  return Math.round(value * 180 / Math.PI);
}

function targetUsesMedium() {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  return scenario.targetKind === "medium" || scenario.targetKind === "fiber";
}

function renderEvidence(p, view, renderWidth, renderHeight) {
  const rgb = new Float32Array(renderWidth * renderHeight * 3);
  const mask = new Float32Array(renderWidth * renderHeight);
  const depth = new Float32Array(renderWidth * renderHeight);
  for (let y = 0; y < renderHeight; y += 1) {
    for (let x = 0; x < renderWidth; x += 1) {
      const sample = renderTargetSample(p, x, y, view, renderWidth, renderHeight);
      const base = (y * renderWidth + x) * 3;
      const pixel = y * renderWidth + x;
      rgb[base] = sample.rgb[0];
      rgb[base + 1] = sample.rgb[1];
      rgb[base + 2] = sample.rgb[2];
      mask[pixel] = sample.mask;
      depth[pixel] = sample.mask
        ? (targetUsesMedium() ? sample.depth : refineTargetDepth(p, x, y, view, renderWidth, renderHeight, sample.depth)) : 0;
    }
  }
  return { rgb, mask, depth };
}

function refineTargetDepth(p, px, py, view, renderWidth, renderHeight, initialDepth) {
  const aspect = renderWidth / renderHeight;
  const fov = 0.78;
  const u = ((px + 0.5) / renderWidth * 2 - 1) * aspect * fov;
  const v = (1 - (py + 0.5) / renderHeight * 2) * fov;
  const ray = cameraRay(u, v, view);
  let refined = initialDepth;
  for (let i = 0; i < 14; i += 1) {
    const point = vadd(ray.ro, vmul(ray.rd, refined));
    const distance = sdfScene(p, point);
    if (Math.abs(distance) < 0.00005) break;
    refined += Math.max(0.00002, distance * 0.82);
  }
  return refined;
}

function renderBytes(p, view, renderWidth, renderHeight, target = false) {
  const out = new Uint8ClampedArray(renderWidth * renderHeight * 4);
  for (let y = 0; y < renderHeight; y += 1) {
    for (let x = 0; x < renderWidth; x += 1) {
      const sample = target ? renderTargetSample(p, x, y, view, renderWidth, renderHeight) : renderSample(p, x, y, view, renderWidth, renderHeight);
      let rgb = sample.rgb;
      const base = (y * renderWidth + x) * 4;
      if (renderWidth >= 384 && x > 0 && y > 0) {
        const left=base-4,up=base-renderWidth*4;
        const contrast=Math.max(...rgb.map((c,k)=>Math.max(Math.abs(c-out[left+k]/255),Math.abs(c-out[up+k]/255))));
        if(contrast > .075) {
          rgb=[0,0,0];
          for(const [ox,oy] of [[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]) {
            const value=target?renderTargetSample(p,x+ox,y+oy,view,renderWidth,renderHeight):renderSample(p,x+ox,y+oy,view,renderWidth,renderHeight);
            for(let k=0;k<3;k++) rgb[k]+=value.rgb[k]*.25;
          }
        }
      }
      out[base] = byte(rgb[0] * 255);
      out[base + 1] = byte(rgb[1] * 255);
      out[base + 2] = byte(rgb[2] * 255);
      out[base + 3] = 255;
    }
  }
  return out;
}

function residualBytes(a, b) {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < a.length / 4; i += 1) {
    const ai = i * 4;
    const e = clamp01((Math.abs(a[ai] - b[ai]) + Math.abs(a[ai + 1] - b[ai + 1]) + Math.abs(a[ai + 2] - b[ai + 2])) / 255 * 1.4);
    const signal = Math.sqrt(e);
    out[ai] = byte((0.025 + e * 0.95) * 255);
    out[ai + 1] = byte((0.035 + signal * 0.62) * 255);
    out[ai + 2] = byte((0.05 + signal * 0.18) * 255);
    out[ai + 3] = 255;
  }
  return out;
}

// The objective is a weighted sum of squares, so it has a residual vector -- and once that is
// exposed, J^T J is the Gauss-Newton Hessian and a second-order step costs the same 2P forward
// evaluations the coordinate estimator already spends on a first-order one.
//
// The weights are the ones lossComponents applies, baked in as sqrt factors so that the sum of
// squares of this vector equals lossComponents(...).total exactly at the same p. Counts depend
// on which samples are masked, so they are resolved in a first pass and then held fixed for
// the step, which is standard for Gauss-Newton on a masked objective.
// Fixed-length and fixed-meaning: six slots per sample, zeroed where a term does not apply.
//
// The first version emitted entries conditionally, so a step that moved the silhouette changed
// both the LENGTH and the index meaning of the vector. Differencing two such vectors compares
// residuals belonging to different physical quantities, which produced a Jacobian that was
// garbage wherever the mask moved -- and a lane that was a thousand times worse than plain
// coordinate descent. A Gauss-Newton residual has to have a stable structure.
//
// The weights also have to be frozen at the base point rather than recomputed per evaluation,
// or the objective itself shifts underneath the derivative.
const RESIDUAL_STRIDE = 6;

function residualWeights(p, samples) {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  let objectCount = 0;
  let surfaceCount = 0;
  let count = 0;
  for (let s = 0; s < samples.length; s += 1) {
    const packed = samples[s];
    const viewIndex = packed.viewIndex % profile.views.length;
    const view = profile.views[viewIndex];
    const assumed = { yaw: view.yaw + profile.assumedBias.yaw, pitch: view.pitch + profile.assumedBias.pitch };
    const sample = renderSample(p, packed.x, packed.y, assumed, workWidth, workHeight);
    const maskBase = packed.y * workWidth + packed.x;
    const targetMask = targetMaskCapture[viewIndex][maskBase];
    if (sample.mask || targetMask) objectCount += 1;
    if (captureMode === "perfect" && !targetUsesMedium() && targetMask) surfaceCount += 1;
    count += 1;
  }
  const inv = 1 / Math.max(1, count);
  return {
    inv,
    objectInv: objectCount ? 1 / objectCount : inv,
    maskWeight: geometryMaskWeight() * 0.35,
    depthWeight: geometryDepthWeight() * 0.35,
    surfaceWeight: surfaceCount ? 0.35 / surfaceCount : 0
  };
}

function residualVectorFixed(p, samples, weights) {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const out = new Float64Array(samples.length * RESIDUAL_STRIDE);
  for (let s = 0; s < samples.length; s += 1) {
    const packed = samples[s];
    const viewIndex = packed.viewIndex % profile.views.length;
    const view = profile.views[viewIndex];
    const assumed = { yaw: view.yaw + profile.assumedBias.yaw, pitch: view.pitch + profile.assumedBias.pitch };
    const sample = renderSample(p, packed.x, packed.y, assumed, workWidth, workHeight);
    const target = targetCapture[viewIndex];
    const base = (packed.y * workWidth + packed.x) * 3;
    const maskBase = packed.y * workWidth + packed.x;
    const targetMask = targetMaskCapture[viewIndex][maskBase];
    const targetDepth = targetDepthCapture[viewIndex][maskBase];
    const isObject = Boolean(sample.mask || targetMask);
    const rgbScale = (isObject ? 0.82 * weights.objectInv : 0) + 0.18 * weights.inv;
    const channelScale = Math.sqrt(Math.max(0, rgbScale / 3));
    const slot = s * RESIDUAL_STRIDE;
    out[slot] = (sample.rgb[0] - target[base]) * channelScale;
    out[slot + 1] = (sample.rgb[1] - target[base + 1]) * channelScale;
    out[slot + 2] = (sample.rgb[2] - target[base + 2]) * channelScale;
    out[slot + 3] = (sample.mask - targetMask) * Math.sqrt(weights.maskWeight * weights.inv);
    // Depth and surface stay in fixed slots and go to zero when inapplicable, so the vector's
    // shape never changes as the silhouette moves.
    out[slot + 4] = (sample.mask && targetMask)
      ? ((sample.depth - targetDepth) / 2) * Math.sqrt(weights.depthWeight * weights.inv)
      : 0;
    out[slot + 5] = (captureMode === "perfect" && !targetUsesMedium() && targetMask)
      ? Math.sqrt(Math.max(0, targetSurfaceError(p, packed.x, packed.y, assumed, targetDepth)) * weights.surfaceWeight)
      : 0;
  }
  return out;
}


function solveDamped(matrix, rhs, size) {
  const augmented = [];
  for (let row = 0; row < size; row += 1) {
    const line = new Float64Array(size + 1);
    for (let column = 0; column < size; column += 1) line[column] = matrix[row * size + column];
    line[size] = rhs[row];
    augmented.push(line);
  }
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    if (Math.abs(augmented[best][pivot]) < 1e-14) return null;
    const swap = augmented[pivot];
    augmented[pivot] = augmented[best];
    augmented[best] = swap;
    for (let row = pivot + 1; row < size; row += 1) {
      const factor = augmented[row][pivot] / augmented[pivot][pivot];
      for (let column = pivot; column <= size; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  const solution = new Float64Array(size);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = augmented[row][size];
    for (let column = row + 1; column < size; column += 1) sum -= augmented[row][column] * solution[column];
    solution[row] = sum / augmented[row][row];
  }
  return solution;
}

// Levenberg-damped Gauss-Newton over the active coordinates.
function stepGaussNewton(samples) {
  const active = activeParameterIndices();
  const size = active.length;
  // Weights frozen at the base point, so the objective does not shift under the derivative.
  const weights = residualWeights(params, samples);
  const base = residualVectorFixed(params, samples, weights);
  const jacobian = [];
  for (let index = 0; index < size; index += 1) {
    const slot = active[index];
    const h = Math.max(1e-4, sigma[slot] * 0.22 * perturbScale);
    const plus = Float64Array.from(params);
    const minus = Float64Array.from(params);
    plus[slot] = clamp(plus[slot] + h, minP[slot], maxP[slot]);
    minus[slot] = clamp(minus[slot] - h, minP[slot], maxP[slot]);
    const span = Math.max(1e-9, plus[slot] - minus[slot]);
    const rPlus = residualVectorFixed(plus, samples, weights);
    const rMinus = residualVectorFixed(minus, samples, weights);
    const column = new Float64Array(base.length);
    for (let r = 0; r < base.length; r += 1) column[r] = (rPlus[r] - rMinus[r]) / span;
    jacobian.push(column);
  }

  const normal = new Float64Array(size * size);
  const gradient = new Float64Array(size);
  for (let a = 0; a < size; a += 1) {
    for (let r = 0; r < base.length; r += 1) gradient[a] -= jacobian[a][r] * base[r];
    for (let b = a; b < size; b += 1) {
      let sum = 0;
      for (let r = 0; r < base.length; r += 1) sum += jacobian[a][r] * jacobian[b][r];
      normal[a * size + b] = sum;
      normal[b * size + a] = sum;
    }
  }

  const before = lossComponents(params, samples);
  const beforeScore = scoreMetrics(before);
  let applied = false;
  for (let attempt = 0; attempt < 5 && !applied; attempt += 1) {
    const damped = Float64Array.from(normal);
    for (let a = 0; a < size; a += 1) {
      damped[a * size + a] += gaussNewtonLambda * (1 + normal[a * size + a]);
    }
    const delta = solveDamped(damped, gradient, size);
    if (!delta) { gaussNewtonLambda *= 10; continue; }
    const candidate = Float64Array.from(params);
    for (let index = 0; index < size; index += 1) candidate[active[index]] += delta[index];
    clampParams(candidate);
    const metrics = lossComponents(candidate, samples);
    if (scoreMetrics(metrics) < beforeScore) {
      params.set(candidate);
      setLossMetrics(metrics);
      gaussNewtonLambda = Math.max(1e-7, gaussNewtonLambda * 0.35);
      applied = true;
    } else {
      gaussNewtonLambda *= 10;
    }
  }
  if (!applied) setLossMetrics(before);
  acceptedUpdate = applied;
  return applied;
}

function lossComponents(p, samples) {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  let rgbSum = 0;
  let objectRgbSum = 0;
  let objectCount = 0;
  let maskSum = 0;
  let depthSum = 0;
  let surfaceSum = 0;
  let surfaceCount = 0;
  let count = 0;
  for (let s = 0; s < samples.length; s += 1) {
    const packed = samples[s];
    const viewIndex = packed.viewIndex % profile.views.length;
    const view = profile.views[viewIndex];
    const assumed = { yaw: view.yaw + profile.assumedBias.yaw, pitch: view.pitch + profile.assumedBias.pitch };
    const sample = renderSample(p, packed.x, packed.y, assumed, workWidth, workHeight);
    const target = targetCapture[viewIndex];
    const base = (packed.y * workWidth + packed.x) * 3;
    const dr = sample.rgb[0] - target[base];
    const dg = sample.rgb[1] - target[base + 1];
    const db = sample.rgb[2] - target[base + 2];
    const rgbError = (dr * dr + dg * dg + db * db) / 3;
    const maskBase = packed.y * workWidth + packed.x;
    const targetMask = targetMaskCapture[viewIndex][maskBase];
    const targetDepth = targetDepthCapture[viewIndex][maskBase];
    const dm = sample.mask - targetMask;
    rgbSum += rgbError;
    if (sample.mask || targetMask) {
      objectRgbSum += rgbError;
      objectCount += 1;
    }
    maskSum += dm * dm;
    if (sample.mask && targetMask) {
      const dd = (sample.depth - targetDepth) / 2;
      depthSum += dd * dd;
    }
    if (captureMode === "perfect" && !targetUsesMedium() && targetMask) {
      surfaceSum += targetSurfaceError(p, packed.x, packed.y, assumed, targetDepth);
      surfaceCount += 1;
    }
    count += 1;
  }
  const inv = 1 / Math.max(1, count);
  const sceneRgb = rgbSum * inv;
  const objectRgb = objectCount ? objectRgbSum / objectCount : sceneRgb;
  const rgb = objectRgb * 0.82 + sceneRgb * 0.18;
  const mask = maskSum * inv;
  const depth = depthSum * inv;
  const surface = surfaceCount ? surfaceSum / surfaceCount : 0;
  const geometry = mask * geometryMaskWeight() + depth * geometryDepthWeight() + surface;
  return { total: rgb + geometry * 0.35, rgb, objectRgb, sceneRgb, geometry, mask, depth, surface };
}

function setLossMetrics(metrics) {
  objectRgbLoss = metrics.objectRgb;
  sceneRgbLoss = metrics.sceneRgb;
  loss = metrics.total;
  rgbLoss = metrics.rgb;
  geometryLoss = metrics.geometry;
  maskLoss = metrics.mask;
  depthLoss = metrics.depth;
  surfaceLoss = metrics.surface;
}

function appearanceLossOnly(p, samples) {
  return lossComponents(p, samples).rgb;
}

function appearanceSearchLoss(p, samples) {
  const fit = appearanceLossOnly(p, samples);
  const inspection = orbitViewMetrics(inspectView, 24, p).rgb;
  return fit + inspection * 0.35;
}
function mediumStructureLoss(p, samples) {
  const metrics = lossComponents(p, samples);
  return metrics.geometry + metrics.rgb * 0.35;
}


function geometryLossOnly(p, samples) {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  let maskSum = 0;
  let depthSum = 0;
  let surfaceSum = 0;
  let surfaceCount = 0;
  for (let s = 0; s < samples.length; s += 1) {
    const packed = samples[s];
    const viewIndex = packed.viewIndex % profile.views.length;
    const view = profile.views[viewIndex];
    const assumed = { yaw: view.yaw + profile.assumedBias.yaw, pitch: view.pitch + profile.assumedBias.pitch };
    const sample = renderGeometrySample(p, packed.x, packed.y, assumed, workWidth, workHeight);
    const base = packed.y * workWidth + packed.x;
    const targetMask = targetMaskCapture[viewIndex][base];
    const targetDepth = targetDepthCapture[viewIndex][base];
    const dm = sample.mask - targetMask;
    maskSum += dm * dm;
    if (sample.mask && targetMask) {
      const dd = (sample.depth - targetDepth) / 2;
      depthSum += dd * dd;
    }
    if (captureMode === "perfect" && !targetUsesMedium() && targetMask) {
      surfaceSum += targetSurfaceError(p, packed.x, packed.y, assumed, targetDepth);
      surfaceCount += 1;
    }
  }
  const inv = 1 / Math.max(1, samples.length);
  const surface = surfaceCount ? surfaceSum / surfaceCount : 0;
  return maskSum * inv * geometryMaskWeight() + depthSum * inv * geometryDepthWeight() + surface;
}

function geometryMaskWeight() {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  return scenario.topology ? 1.25 : 1;
}


function targetSurfaceError(p, px, py, view, targetDepth) {
  const aspect = workWidth / workHeight;
  const fov = 0.78;
  const u = ((px + 0.5) / workWidth * 2 - 1) * aspect * fov;
  const v = (1 - (py + 0.5) / workHeight * 2) * fov;
  const ray = cameraRay(u, v, view);
  const point = vadd(ray.ro, vmul(ray.rd, targetDepth));
  const outsideTolerance = Math.max(0, Math.abs(sdfScene(p, point)) - 0.0005);
  const normalized = outsideTolerance / 0.12;
  return Math.min(1, normalized * normalized);
}
function geometryDepthWeight() {
  return captureMode === "perfect" ? 0.45 : 0;
}

function geometryScout(samples) {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  const goalMix = scenario.target ? scenario.target[4] : 1;
  if (iter > 8 && Math.abs(params[4] - goalMix) < 0.075) return;
  if (iter > 0 && iter % (iter > 40 ? 16 : 8) !== 0) return;

  const scoutSamples = limitSamples(samples, 768);
  const currentLoss = geometryLossOnly(params, scoutSamples);
  let bestLoss = currentLoss;
  let best = null;
  const direction = Math.sign(goalMix - params[4]) || 1;
  const anchors = [
    params[4] + direction * 0.12,
    params[4] + direction * 0.26,
    goalMix * 0.45 + params[4] * 0.55,
    goalMix * 0.7 + params[4] * 0.3,
    goalMix
  ];

  for (const mixValue of anchors) {
    const candidate = new Float64Array(params);
    candidate[4] = mixValue;
    clampParams(candidate);
    const candidateLoss = geometryLossOnly(candidate, scoutSamples);
    if (candidateLoss < bestLoss) {
      bestLoss = candidateLoss;
      best = candidate;
    }
  }

  const trials = iter < 36 ? 6 : 3;
  for (let t = 0; t < trials; t += 1) {
    const candidate = new Float64Array(params);
    const pull = 0.22 + rng() * 0.7;
    candidate[4] = params[4] * (1 - pull) + goalMix * pull + normal(rng) * 0.035;
    candidate[0] += normal(rng) * 0.045;
    candidate[1] += normal(rng) * 0.035;
    candidate[2] += normal(rng) * 0.07;
    candidate[3] += normal(rng) * 0.045;
    clampParams(candidate);
    const candidateLoss = geometryLossOnly(candidate, scoutSamples);
    if (candidateLoss < bestLoss) {
      bestLoss = candidateLoss;
      best = candidate;
    }
  }

  const requiredGain = Math.max(0.00018, currentLoss * 0.015);
  if (best && bestLoss < currentLoss - requiredGain) {
    params.set(best);
    shapeProposals += 1;
    for (let i = 0; i < 5; i += 1) {
      m[i] = 0;
      v[i] = 0;
    }
  }
}

function limitSamples(samples, maxCount) {
  if (samples.length <= maxCount) return samples;
  const out = new Array(maxCount);
  const stride = samples.length / maxCount;
  for (let i = 0; i < maxCount; i += 1) {
    out[i] = samples[Math.floor(i * stride)];
  }
  return out;
}

function makeSamples(count) {
  const profile = captureProfiles[captureMode] || captureProfiles.perfect;
  const out = new Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = {
      x: Math.floor(rng() * workWidth),
      y: Math.floor(rng() * workHeight),
      viewIndex: Math.floor(rng() * profile.views.length)
    };
  }
  return out;
}

function renderPixel(p, px, py, view, renderWidth, renderHeight) {
  return renderSample(p, px, py, view, renderWidth, renderHeight).rgb;
}

function renderSample(p, px, py, view, renderWidth, renderHeight) {
  if (representationMode === "medium" || representationMode === "fiber") {
    return renderMediumSample(p, px, py, view, renderWidth, renderHeight, representationMode);
  }
  return renderSurfaceSample(p, px, py, view, renderWidth, renderHeight);
}

function renderTargetSample(p, px, py, view, renderWidth, renderHeight) {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  if (scenario.targetKind === "medium" || scenario.targetKind === "fiber") {
    return renderMediumSample(p, px, py, view, renderWidth, renderHeight, scenario.targetKind);
  }
  return renderSurfaceSample(p, px, py, view, renderWidth, renderHeight);
}

function renderSurfaceSample(p, px, py, view, renderWidth, renderHeight) {
  const aspect = renderWidth / renderHeight;
  const fov = 0.78;
  const u = ((px + 0.5) / renderWidth * 2 - 1) * aspect * fov;
  const vv = (1 - (py + 0.5) / renderHeight * 2) * fov;
  const ray = cameraRay(u, vv, view);
  const ro = ray.ro;
  const rd = ray.rd;
  const light = lightDir(p);
  const hitObject = rayMarch(p, ro, rd);
  const hitPlane = intersectPlaneY(ro, rd, -1.05);
  const bg = background(rd);

  if (hitObject && (!hitPlane || hitObject.t < hitPlane.t)) {
    const point = vadd(ro, vmul(rd, hitObject.t));
    const normal = estimateNormal(p, point);
    const albedo = proceduralAlbedo(p, point);
    return {
      rgb: shade(point, normal, rd, albedo, p[8], light, p[11], false),
      mask: 1,
      depth: hitObject.t
    };
  }

  if (hitPlane) {
    const point = vadd(ro, vmul(rd, hitPlane.t));
    const checker = ((Math.floor(point[0] * 2.2) + Math.floor(point[2] * 2.2)) & 1) ? 0.88 : 0.56;
    const color = [0.18 * checker, 0.24 * checker, 0.27 * checker];
    const shadow = shadowSdf(point, light, p);
    const shaded = shade(point, [0, 1, 0], rd, color, 0.72, light, p[11], true);
    return {
      rgb: [shaded[0] * shadow + bg[0] * 0.08, shaded[1] * shadow + bg[1] * 0.08, shaded[2] * shadow + bg[2] * 0.08],
      mask: 0,
      depth: 0
    };
  }
  return { rgb: bg, mask: 0, depth: 0 };
}

function renderGeometrySample(p, px, py, view, renderWidth, renderHeight) {
  if (representationMode === "medium" || representationMode === "fiber") {
    // Geometry evidence must stay appearance-free, so the volume path is integrated without
    // colour exactly as the medium family already does.
    return renderMediumGeometrySample(p, px, py, view, renderWidth, renderHeight, representationMode);
  }
  const aspect = renderWidth / renderHeight;
  const fov = 0.78;
  const u = ((px + 0.5) / renderWidth * 2 - 1) * aspect * fov;
  const vv = (1 - (py + 0.5) / renderHeight * 2) * fov;
  const ray = cameraRay(u, vv, view);
  const hitObject = rayMarch(p, ray.ro, ray.rd);
  const hitPlane = intersectPlaneY(ray.ro, ray.rd, -1.05);
  if (hitObject && (!hitPlane || hitObject.t < hitPlane.t)) return { mask: 1, depth: hitObject.t };
  return { mask: 0, depth: 0 };
}


function renderMediumSample(p, px, py, view, renderWidth, renderHeight, family = "medium") {
  const aspect = renderWidth / renderHeight;
  const fov = 0.78;
  const u = ((px + 0.5) / renderWidth * 2 - 1) * aspect * fov;
  const vv = (1 - (py + 0.5) / renderHeight * 2) * fov;
  const ray = cameraRay(u, vv, view);
  const integrated = integrateMediumRay(p, ray.ro, ray.rd, true, family);
  const environment = mediumEnvironment(p, ray.ro, ray.rd);
  const transmittance = 1 - integrated.alpha;
  return {
    rgb: [
      clamp01(integrated.rgb[0] + environment[0] * transmittance),
      clamp01(integrated.rgb[1] + environment[1] * transmittance),
      clamp01(integrated.rgb[2] + environment[2] * transmittance)
    ],
    mask: integrated.alpha,
    depth: integrated.depth
  };
}

function renderMediumGeometrySample(p, px, py, view, renderWidth, renderHeight, family = "medium") {
  const aspect = renderWidth / renderHeight;
  const fov = 0.78;
  const u = ((px + 0.5) / renderWidth * 2 - 1) * aspect * fov;
  const vv = (1 - (py + 0.5) / renderHeight * 2) * fov;
  const ray = cameraRay(u, vv, view);
  const integrated = integrateMediumRay(p, ray.ro, ray.rd, false, family);
  return {
    mask: integrated.alpha,
    depth: integrated.depth,
    opticalDepth: integrated.opticalDepth,
    inIdentifiableBand: integrated.inIdentifiableBand
  };
}

// SGGX projected area for a fiber (one-dimensional) microflake distribution.
//
//   S = eps^2 (f f^T) + (I - f f^T)   =>   sigma(w) = sqrt(w^T S w)
//                                                   = sqrt(1 - (1 - eps^2)(w.f)^2)
//
// eps = 1 gives sigma == 1 identically, which is why the fiber integrator collapses exactly
// onto the isotropic medium at that value. That reduction is asserted in the test suite; it
// is what makes this a strict generalization rather than a second, parallel forward model.
function sggxSigma(direction, fiberAxis, eps) {
  const aligned = vdot(direction, fiberAxis);
  return Math.sqrt(Math.max(1e-6, 1 - (1 - eps * eps) * aligned * aligned));
}

// Modified Bessel function of the first kind, order zero. Ten-term series with the standard
// logarithmic branch for large arguments, which is all the longitudinal lobe needs.
function besselI0(x) {
  if (x > 12) {
    // exp(x)/sqrt(2 pi x) * (1 + 1/(8x) + 9/(128 x^2))
    return Math.exp(x) / Math.sqrt(2 * Math.PI * x) * (1 + 1 / (8 * x) + 9 / (128 * x * x));
  }
  let sum = 1;
  let term = 1;
  const half = x * 0.5;
  for (let k = 1; k <= 10; k += 1) {
    term *= (half / k) * (half / k);
    sum += term;
  }
  return sum;
}

// Longitudinal scattering lobe Mp. The cuticle tilt enters HERE, as a shift of the incident
// longitudinal angle -- not as an azimuthal offset. Getting that wrong makes the "fiber tilt"
// slider rotate the azimuthal lobe instead of shifting the longitudinal cone, so the panel
// would be labelling a parameter that does not mean what it says.
function fiberMp(sinThetaI, sinThetaO, variance) {
  const v = Math.max(0.012, variance);
  const cosThetaI = Math.sqrt(Math.max(0, 1 - sinThetaI * sinThetaI));
  const cosThetaO = Math.sqrt(Math.max(0, 1 - sinThetaO * sinThetaO));
  const a = cosThetaI * cosThetaO / v;
  const b = sinThetaI * sinThetaO / v;
  if (v <= 0.1) {
    // Logarithmic form, numerically stable where sinh(1/v) overflows.
    const logI0 = a > 12 ? a - Math.log(2 * Math.PI * a) * 0.5 : Math.log(besselI0(a));
    return Math.exp(logI0 - b - 1 / v + 0.6931472 + Math.log(1 / (2 * v)));
  }
  return Math.exp(-b) * besselI0(a) / (Math.sinh(1 / v) * 2 * v);
}

// Azimuthal lobe Np, a logistic distribution over the relative azimuth.
function fiberNp(phi, s) {
  let angle = phi;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  const scale = Math.max(0.05, s);
  const e = Math.exp(-Math.abs(angle) / scale);
  const density = e / (scale * (1 + e) * (1 + e));
  // Normalized over [-pi, pi] so the lobe integrates to one.
  const cdf = 1 / (1 + Math.exp(-Math.PI / scale)) - 1 / (1 + Math.exp(Math.PI / scale));
  return density / Math.max(1e-6, cdf);
}

// Far-field fiber BCSDF with R, TT and TRT lobes.
//
// Deliberately NOT included: near-field offset across a fiber, elliptical-cross-section
// glints, a medulla, and any multiple scattering between fibers. Absorption is fitted
// directly rather than through Disney's SigmaAFromReflectance remap, because that polynomial
// is a fit to the MULTIPLE-scattering albedo of a hair volume and this integrator is
// single-scatter. Plotting it here would import a regime the code does not simulate.
function fiberBcsdf(p, rd, light, fiberAxis, albedo) {
  const betaM = clamp(p[8], 0.05, 0.95);
  const betaN = clamp(p[19], 0.05, 0.95);
  const tilt = p[18];

  const sinThetaO = clamp(-vdot(rd, fiberAxis), -0.999, 0.999);
  const sinThetaI = clamp(vdot(light, fiberAxis), -0.999, 0.999);

  // Azimuth of each direction measured in the plane normal to the fiber.
  const perpO = vsub(vmul(rd, -1), vmul(fiberAxis, sinThetaO));
  const perpI = vsub(light, vmul(fiberAxis, sinThetaI));
  const lenO = Math.hypot(perpO[0], perpO[1], perpO[2]);
  const lenI = Math.hypot(perpI[0], perpI[1], perpI[2]);
  if (lenO < 1e-6 || lenI < 1e-6) return 0;
  const cosPhi = clamp(vdot(perpO, perpI) / (lenO * lenI), -1, 1);
  const phi = Math.acos(cosPhi);

  const v0 = Math.pow(0.726 * betaM + 0.812 * betaM * betaM + 3.7 * Math.pow(betaM, 20), 2);
  const s = Math.sqrt(Math.PI / 8) * (0.265 * betaN + 1.194 * betaN * betaN + 5.372 * Math.pow(betaN, 22));

  // Fresnel at the cuticle, eta = 1.55, and a path-averaged Beer-Lambert transmittance.
  const cosThetaO = Math.sqrt(Math.max(0, 1 - sinThetaO * sinThetaO));
  const f0 = fresnelDielectric(cosThetaO, 1.55);
  const sigmaA = [
    -Math.log(clamp(albedo[0], 0.02, 0.99)) * 0.5,
    -Math.log(clamp(albedo[1], 0.02, 0.99)) * 0.5,
    -Math.log(clamp(albedo[2], 0.02, 0.99)) * 0.5
  ];
  const channelT = sigmaA.map((value) => Math.exp(-value * 2));
  const transmit = (channelT[0] + channelT[1] + channelT[2]) / 3;

  // Cuticle tilt shifts the longitudinal angle per lobe: +2a for R, -a for TT, -4a for TRT.
  const attenuation = [f0, (1 - f0) * (1 - f0) * transmit, (1 - f0) * (1 - f0) * f0 * transmit * transmit];
  const variances = [v0, 0.25 * v0, 4 * v0];
  const tilts = [2 * tilt, -tilt, -4 * tilt];
  const azimuths = [0, Math.PI, 0];

  let total = 0;
  for (let lobe = 0; lobe < 3; lobe += 1) {
    const shifted = clamp(sinThetaI * Math.cos(2 * tilts[lobe]) + Math.sqrt(Math.max(0, 1 - sinThetaI * sinThetaI)) * Math.sin(2 * tilts[lobe]), -0.999, 0.999);
    total += attenuation[lobe]
      * fiberMp(shifted, sinThetaO, variances[lobe])
      * fiberNp(phi - azimuths[lobe], s);
  }
  return Math.max(0, total);
}

function fresnelDielectric(cosTheta, eta) {
  const c = clamp(Math.abs(cosTheta), 0, 1);
  const sinT2 = (1 - c * c) / (eta * eta);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT2);
  const rs = (c - eta * cosT) / (c + eta * cosT);
  const rp = (eta * c - cosT) / (eta * c + cosT);
  return clamp01((rs * rs + rp * rp) * 0.5);
}

function integrateMediumRay(p, ro, rd, withColor, family = "medium") {
  const center = [p[0], p[1], p[2]];
  const interval = raySphereInterval(ro, rd, center, p[3] * 1.28);
  if (!interval) return { rgb: [0, 0, 0], alpha: 0, depth: 0 };
  const steps = 32;
  const dt = (interval.far - interval.near) / steps;
  const light = lightDir(p);
  const fiber = family === "fiber";
  const eps = fiber ? clamp(p[20], 0.05, 1) : 1;
  let transmittance = 1;
  let depthSum = 0;
  let opticalDepth = 0;
  let bandWeight = 0;
  const rgb = [0, 0, 0];
  for (let step = 0; step < steps; step += 1) {
    const t = interval.near + (step + 0.5) * dt;
    const point = vadd(ro, vmul(rd, t));
    // Radial groom: the fiber axis is the outward local direction, which the medium path
    // already computes for its directional term.
    const localDirection = vnorm(vsub(point, center));
    let density = mediumDensity(p, point);
    if (fiber) density *= sggxSigma(rd, localDirection, eps);
    if (density <= 1e-5) continue;
    opticalDepth += density * dt;
    const alpha = 1 - Math.exp(-density * dt);
    const weight = transmittance * alpha;
    if (withColor) {
      const albedo = proceduralAlbedo(p, point);
      if (fiber) {
        const scatter = fiberBcsdf(p, rd, light, localDirection, albedo);
        const illumination = 0.1 + scatter * p[11] * 1.35;
        rgb[0] += weight * clamp01(albedo[0] * illumination + 0.025);
        rgb[1] += weight * clamp01(albedo[1] * illumination + 0.035);
        rgb[2] += weight * clamp01(albedo[2] * illumination + 0.055);
      } else {
        const directional = 0.32 + Math.max(0, vdot(localDirection, light)) * 0.68;
        const phase = 0.62 + 0.38 * Math.pow(vdot(vmul(rd, -1), light), 2);
        const illumination = 0.14 + directional * phase * p[11] * 0.72;
        rgb[0] += weight * clamp01(albedo[0] * illumination + 0.025);
        rgb[1] += weight * clamp01(albedo[1] * illumination + 0.035);
        rgb[2] += weight * clamp01(albedo[2] * illumination + 0.055);
      }
    }
    depthSum += weight * t;
    transmittance *= 1 - alpha;
    if (transmittance < 0.008) break;
  }
  const accumulated = 1 - transmittance;
  // Density is only identifiable where the optical depth is near unity: transparent at the
  // centre where the ray runs along the fibers, saturated at the rim where it crosses them.
  if (opticalDepth >= 1 && opticalDepth <= 3) bandWeight = 1;
  return {
    rgb,
    alpha: accumulated,
    depth: accumulated > 1e-5 ? depthSum / accumulated : 0,
    opticalDepth,
    inIdentifiableBand: bandWeight
  };
}

function mediumDensity(p, point) {
  const scale = Math.max(1e-5, p[3]);
  const local = [(point[0] - p[0]) / scale, (point[1] - p[1]) / scale, (point[2] - p[2]) / scale];
  const signedDistance = sdfScene(p, point) / scale;
  const width = clamp(p[17] || 0.055, 0.015, 0.2);
  const shell = Math.exp(-Math.pow(signedDistance / Math.max(0.008, width), 2));
  const interior = smoothstep(width, -width, signedDistance);
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  // A fur groom is a shell of fibers standing off the surface, not a filled volume, so the
  // fiber family keeps the shell term without the interior fill the smoke knot uses.
  const body = scenario.targetKind === "medium" ? shell * 0.72 + interior * 0.3 : shell;
  const turbulence = proceduralNoise3d(local, Math.max(1.5, (p[13] || 3.6) * 0.72));
  const detailWeight = clamp01((p[12] || 0) / 0.14);
  const modulation = Math.max(0.08, 0.88 + turbulence * (0.12 + detailWeight * 0.48));
  return Math.max(0, p[16] || 1) * body * modulation;
}

function mediumEnvironment(p, ro, rd) {
  const bg = background(rd);
  const hitPlane = intersectPlaneY(ro, rd, -1.05);
  if (!hitPlane) return bg;
  const point = vadd(ro, vmul(rd, hitPlane.t));
  const checker = ((Math.floor(point[0] * 2.2) + Math.floor(point[2] * 2.2)) & 1) ? 0.88 : 0.56;
  const color = [0.18 * checker, 0.24 * checker, 0.27 * checker];
  const shaded = shade(point, [0, 1, 0], rd, color, 0.72, lightDir(p), p[11], true);
  return [shaded[0] + bg[0] * 0.08, shaded[1] + bg[1] * 0.08, shaded[2] + bg[2] * 0.08];
}

function raySphereInterval(ro, rd, center, radius) {
  const oc = vsub(ro, center);
  const b = vdot(oc, rd);
  const c = vdot(oc, oc) - radius * radius;
  const discriminant = b * b - c;
  if (discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const near = Math.max(0.02, -b - root);
  const far = -b + root;
  return far > near ? { near, far } : null;
}
function cameraRay(u, v, view) {
  const yaw = view.yaw || 0;
  const pitch = view.pitch || 0;
  const target = [0, 0, -3.18];
  const radius = 3.18;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const ro = [target[0] + sy * cp * radius, target[1] + sp * radius, target[2] + cy * cp * radius];
  const forward = vnorm(vsub(target, ro));
  const right = vnorm(vcross(forward, [0, 1, 0]));
  const up = vnorm(vcross(right, forward));
  const rd = vnorm(vadd(vadd(vmul(right, u), vmul(up, v)), vmul(forward, 1.35)));
  return { ro, rd };
}

function rayMarch(p, ro, rd) {
  let t = 0.05;
  for (let i = 0; i < 82; i += 1) {
    const point = vadd(ro, vmul(rd, t));
    const d = sdfScene(p, point);
    if (d < 0.0035) return { t, steps: i };
    t += Math.max(0.003, d * 0.82);
    if (t > 7.2) return null;
  }
  return null;
}

function sdfScene(p, point) {
  const scenario = scenarios[scenarioKey] || scenarios.cubeSphere;
  const scale = p[3];
  const local = [(point[0] - p[0]) / scale, (point[1] - p[1]) / scale, (point[2] - p[2]) / scale];
  const mix = clamp01(p[4]);
  const d0 = sdfShape(scenario.from, local);
  const d1 = sdfShape(scenario.to, local);
  const base = d0 * (1 - mix) + d1 * mix;
  const amplitude = Math.max(0, p[12] || 0);
  if (amplitude <= 1e-8) return scale * base;
  const displacement = amplitude * proceduralNoise3d(local, Math.max(1.5, p[13] || 3.6));
  return scale * (base - displacement);
}
function proceduralNoise3d(local, frequency) {
  const x = local[0] * frequency;
  const y = local[1] * frequency;
  const z = local[2] * frequency;
  const octave0 = Math.sin(x + Math.sin(z * 0.73) * 0.8) * Math.sin(y * 1.11 - z * 0.31);
  const octave1 = Math.sin((x + y) * 1.93 + 1.7) * Math.cos((z - y * 0.4) * 1.71);
  const octave2 = Math.sin((x - z * 0.6) * 3.87 - 0.8) * Math.sin((y + z) * 3.21 + 0.45);
  return octave0 * 0.58 + octave1 * 0.29 + octave2 * 0.13;
}

function proceduralAlbedo(p, point) {
  const base = [p[5], p[6], p[7]];
  const strength = clamp01(p[14] || 0);
  if (strength <= 1e-5) return base;
  const scale = Math.max(1e-5, p[3]);
  const local = [(point[0] - p[0]) / scale, (point[1] - p[1]) / scale, (point[2] - p[2]) / scale];
  const frequency = Math.max(1.5, p[15] || 4.8);
  const noise = proceduralNoise3d(local, frequency * 0.46);
  const bands = 0.5 + 0.5 * Math.sin((local[0] * 1.3 - local[1] * 0.8 + local[2] * 1.05) * frequency * 2.4 + noise * 2.1);
  const pigment = smoothstep(0.38, 0.7, bands);
  const accent = [0.1 + base[2] * 0.32, 0.42 + base[0] * 0.42, 0.82 + base[1] * 0.16];
  const amount = strength * (0.18 + pigment * 0.72);
  return [
    clamp01(base[0] * (1 - amount) + accent[0] * amount),
    clamp01(base[1] * (1 - amount) + accent[1] * amount),
    clamp01(base[2] * (1 - amount) + accent[2] * amount)
  ];
}

function sdfShape(kind, p) {
  if (kind === "box") return boxSdf(p, [0.58, 0.58, 0.58]);
  if (kind === "torus") return torusSdf(p, 0.5, 0.18);
  if (kind === "capsule") return capsuleSdf(p, [-0.42, 0, 0], [0.42, 0, 0], 0.28);
  return sphereSdf(p, 0.72);
}

function estimateNormal(p, point) {
  const e = 0.006;
  const dx = sdfScene(p, [point[0] + e, point[1], point[2]]) - sdfScene(p, [point[0] - e, point[1], point[2]]);
  const dy = sdfScene(p, [point[0], point[1] + e, point[2]]) - sdfScene(p, [point[0], point[1] - e, point[2]]);
  const dz = sdfScene(p, [point[0], point[1], point[2] + e]) - sdfScene(p, [point[0], point[1], point[2] - e]);
  return vnorm([dx, dy, dz]);
}

function shade(point, normal, rd, albedo, rough, light, power, isFloor) {
  const nl = Math.max(0, vdot(normal, light));
  const view = vmul(rd, -1);
  const halfV = vnorm(vadd(light, view));
  const nh = Math.max(0, vdot(normal, halfV));
  const shininess = 5 + (1 - rough) * 72;
  const spec = Math.pow(nh, shininess) * (0.1 + (1 - rough) * 0.55);
  const rim = Math.pow(Math.max(0, 1 - vdot(normal, view)), 2.2) * 0.08;
  const ambient = isFloor ? 0.16 : 0.09;
  return [
    clamp01(albedo[0] * (ambient + nl * power) + spec * power + rim),
    clamp01(albedo[1] * (ambient + nl * power) + spec * power * 0.95 + rim),
    clamp01(albedo[2] * (ambient + nl * power) + spec * power * 0.85 + rim)
  ];
}

function shadowSdf(point, light, p) {
  const ro = vadd(point, vmul(light, 0.045));
  let t = 0.02;
  for (let i = 0; i < 34; i += 1) {
    const probe = vadd(ro, vmul(light, t));
    const d = sdfScene(p, probe);
    if (d < 0.004) return 0.36;
    t += Math.max(0.012, d);
    if (t > 3.4) break;
  }
  return 1;
}

function estimateBoundaryMass(p) {
  let hits = 0;
  let edge = 0;
  for (let y = 8; y < workHeight; y += 12) {
    for (let x = 8; x < workWidth; x += 12) {
      const aspect = workWidth / workHeight;
      const fov = 0.78;
      const u = ((x + 0.5) / workWidth * 2 - 1) * aspect * fov;
      const vv = (1 - (y + 0.5) / workHeight * 2) * fov;
      const ray = cameraRay(u, vv, inspectView);
      const hit = rayMarch(p, ray.ro, ray.rd);
      if (hit) {
        hits += 1;
        if (hit.steps > 18) edge += 1;
      }
    }
  }
  return hits ? edge / hits : 0;
}

function lightDir(p) {
  const az = p[9];
  const el = p[10];
  return vnorm([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
}

function intersectPlaneY(ro, rd, y) {
  if (Math.abs(rd[1]) < 1e-5) return null;
  const t = (y - ro[1]) / rd[1];
  return t > 0.001 ? { t } : null;
}

function background(rd) {
  const t = clamp01(rd[1] * 0.5 + 0.5);
  return [0.035 + t * 0.06, 0.048 + t * 0.075, 0.075 + t * 0.12];
}

function sphereSdf(p, r) {
  return Math.hypot(p[0], p[1], p[2]) - r;
}

function boxSdf(p, b) {
  const q = [Math.abs(p[0]) - b[0], Math.abs(p[1]) - b[1], Math.abs(p[2]) - b[2]];
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0);
  return outside + inside;
}

function torusSdf(p, major, minor) {
  const qx = Math.hypot(p[0], p[2]) - major;
  return Math.hypot(qx, p[1]) - minor;
}

function capsuleSdf(p, a, b, r) {
  const pa = vsub(p, a);
  const ba = vsub(b, a);
  const h = clamp(vdot(pa, ba) / vdot(ba, ba), 0, 1);
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
}

function clampParams(p) {
  for (let i = 0; i < p.length; i += 1) p[i] = clamp(p[i], minP[i], maxP[i]);
}

function vadd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vsub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vmul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vdot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vcross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function vnorm(a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}
function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(1e-8, Math.abs(edge1 - edge0)) * Math.sign(edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}


function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normal(random) {
  const u = Math.max(1e-6, random());
  const v = Math.max(1e-6, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
