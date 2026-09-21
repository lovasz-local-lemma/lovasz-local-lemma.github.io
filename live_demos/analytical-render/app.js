const canvas = document.querySelector("#renderCanvas");
const canvasWrap = document.querySelector(".canvasWrap");
const BASE_WIDTH = 320;
const BASE_HEIGHT = 200;
const MAX_RENDER_SCALE = 4;
const WASM_MAX_WIDTH = BASE_WIDTH * MAX_RENDER_SCALE;
const WASM_MAX_HEIGHT = BASE_HEIGHT * MAX_RENDER_SCALE;
// Shared data layout — kept identical across JS, the WGSL shader (constants are
// injected into the shader string below), and wasm/analytic_renderer.c
// (#defines). Any change here must be mirrored in all three.
//
// params (binding 1, GPU_PARAM_COUNT floats): 0-9 mode/samples/split/exposure/
//   flags/seed, 10-11 light w/d, 12-24 camera, 25-30 legacy light, 31-41 floor/
//   wall/bounds, 42 objectCount, 43 lightCount, 44 roomMode, 45-48 room quat,
//   49-51 room half-extents, 52-54 room center, 55-72 room face colors (px,nx,
//   py,ny,pz,nz), 73 room roughness, 74 room material, 75 room pattern, 76 room
//   normalScale, 77-81 garage materials, 82-91 atmosphere/motion/frame, 92 extra fancy, 93-111 free, 112-124 floor/wall material, 125 DOF aperture,
//   126 DOF focus distance, 127 DOF lens samples, 128-191 free.
// objects (binding 2, MAX_GPU_OBJECTS * GPU_OBJECT_STRIDE): fields 0-23 in use,
//   24 emission, 25 physical IOR, 26 dispersion, 27 analytic shadow caster.
// lights (binding 3, MAX_LIGHT_PANELS * LIGHT_PARAM_STRIDE): 0-2 center,
//   3 width, 4 depth, 5-7 radiance, 8-10 u, 11-13 v, 14-31 reserved (polygon
//   vertices, light shape, emission profile land here in later phases).
const GPU_PARAM_COUNT = 192;
const GPU_OBJECT_STRIDE = 28;
const MAX_GPU_OBJECTS = 12;
const MAX_LIGHT_PANELS = 6;
const LIGHT_PARAM_STRIDE = 32;
const WASM_RENDERER_VERSION = "20260614b";
const RAPIER_CDN_URL = "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.3/+esm";
let presenter = null;
let wasmRendererPromise = null;
let gpuRendererWarningShown = false;
let wasmRendererWarningShown = false;

const controls = {
  mode: [...document.querySelectorAll("input[name='mode']")],
  backend: [...document.querySelectorAll("input[name='backend']")],
  sceneSelect: document.querySelector("#sceneSelect"),
  lightWidth: document.querySelector("#lightWidth"),
  lightDepth: document.querySelector("#lightDepth"),
  lightHeight: document.querySelector("#lightHeight"),
  materialView: document.querySelector("#materialView"),
  floorRoughness: document.querySelector("#floorRoughness"),
  normalStrength: document.querySelector("#normalStrength"),
  coatWeight: document.querySelector("#coatWeight"),
  blendStrength: document.querySelector("#blendStrength"),
  textureScale: document.querySelector("#textureScale"),
  mediumDensity: document.querySelector("#mediumDensity"),
  mediumMode: document.querySelector("#mediumMode"),
  mediumAlbedo: document.querySelector("#mediumAlbedo"),
  mediumFrequency: document.querySelector("#mediumFrequency"),
  mediumSteps: document.querySelector("#mediumSteps"),
  mediumAnimate: document.querySelector("#mediumAnimate"),
  mediumOnly: document.querySelector("#mediumOnly"),
  groundFlow: document.querySelector("#groundFlow"),
  lightFrame: document.querySelector("#lightFrame"),
  extraFancy: document.querySelector("#extraFancy"),
  samples: document.querySelector("#samples"),
  exposure: document.querySelector("#exposure"),
  aaSamples: document.querySelector("#aaSamples"),
  renderScale: document.querySelector("#renderScale"),
  aperture: document.querySelector("#aperture"),
  focusDistance: document.querySelector("#focusDistance"),
  targetFps: document.querySelector("#targetFps"),
  animate: document.querySelector("#animate"),
  bounceFill: document.querySelector("#bounceFill"),
  horizonClip: document.querySelector("#horizonClip"),
  showFalseColor: document.querySelector("#showFalseColor"),
  renderButton: document.querySelector("#renderButton"),
  seedButton: document.querySelector("#seedButton"),
  benchButton: document.querySelector("#benchButton"),
  splitHandle: document.querySelector("#splitHandle"),
};

const outputs = {
  lightWidth: document.querySelector("#lightWidthOut"),
  lightDepth: document.querySelector("#lightDepthOut"),
  lightHeight: document.querySelector("#lightHeightOut"),
  floorRoughness: document.querySelector("#floorRoughnessOut"),
  normalStrength: document.querySelector("#normalStrengthOut"),
  coatWeight: document.querySelector("#coatWeightOut"),
  blendStrength: document.querySelector("#blendStrengthOut"),
  textureScale: document.querySelector("#textureScaleOut"),
  mediumDensity: document.querySelector("#mediumDensityOut"),
  mediumAlbedo: document.querySelector("#mediumAlbedoOut"),
  mediumFrequency: document.querySelector("#mediumFrequencyOut"),
  mediumSteps: document.querySelector("#mediumStepsOut"),
  groundFlow: document.querySelector("#groundFlowOut"),
  samples: document.querySelector("#samplesOut"),
  exposure: document.querySelector("#exposureOut"),
  aaSamples: document.querySelector("#aaSamplesOut"),
  renderScale: document.querySelector("#renderScaleOut"),
  aperture: document.querySelector("#apertureOut"),
  focusDistance: document.querySelector("#focusDistanceOut"),
  targetFps: document.querySelector("#targetFpsOut"),
  modeMetric: document.querySelector("#modeMetric"),
  timeMetric: document.querySelector("#timeMetric"),
  hitCount: document.querySelector("#hitCount"),
  evalCount: document.querySelector("#evalCount"),
  displayBackendLabel: document.querySelector("#displayBackendLabel"),
  resolutionLabel: document.querySelector("#resolutionLabel"),
  frameFpsLabel: document.querySelector("#frameFpsLabel"),
  backendFrameLabel: document.querySelector("#backendFrameLabel"),
  displayFrameLabel: document.querySelector("#displayFrameLabel"),
  splitLabel: document.querySelector("#splitLabel"),
  lightingLabel: document.querySelector("#lightingLabel"),
  assumptionLabel: document.querySelector("#assumptionLabel"),
  backendLabel: document.querySelector("#backendLabel"),
  kernelLabel: document.querySelector("#kernelLabel"),
  backendTime: document.querySelector("#backendTime"),
};

// Presentation metadata only: scene geometry, source tables and kernels stay in
// their original definitions. Scene IDs remain valid URL entry points.
const EXPERIMENT_FAMILIES = [
  { id: "diffuse", home: "studio", scenes: ["studio", "grazing", "closeup", "sweep", "stack", "trio", "meshlights"], question: "Can an area integral be reduced to a small sum over the emitter's boundary?" },
  { id: "materials", home: "garage", scenes: ["garage", "cinematic", "materiallab", "showcase"], question: "What is gained—and approximated—when a glossy lobe is replaced by a linearly transformed cosine?" },
  { id: "extensions", home: "mirror", scenes: ["mirror", "iridescence", "quadrics", "shapelab"], question: "Which geometric and optical operations remain tractable beside the direct-light integral?" },
  { id: "motion", home: "physicspile", scenes: ["physicspile", "physicstorus"], question: "Can a deterministic lighting calculation remain useful when numerical physics moves the geometry?" },
];
const EXPERIMENT_COPY = {
  studio: ["The diffuse reference", "Two curved receivers isolate the polygon-light integral. Freeze motion, disable fill, and compare the deterministic result with low-sample Monte Carlo."],
  grazing: ["At the horizon", "Move the source toward grazing incidence. Horizon clipping is part of the integral's domain, not a cosmetic correction."],
  closeup: ["A large angular footprint", "Bring the light close to the receiver, where its finite area matters most and a point-light approximation becomes inadequate."],
  sweep: ["A continuous light sweep", "The light's angular domain changes continuously while each surface point receives a deterministic evaluation."],
  stack: ["Layered receivers", "Different surface normals see different portions of the same emitter. General mutual shadowing is outside this baseline."],
  trio: ["Moving surface normals", "Three receivers expose how geometry and light direction enter the same local diffuse integral."],
  meshlights: ["A finite mesh of emitters", "Add the polygon integral over several rectangular light faces. Complexity follows the number of emitter edges."],
  garage: ["The material garage", "Normal-mapped paint, blended materials and a separate clearcoat lobe under polygon lights. Compare fitted GGX LTC with BSDF Monte Carlo, then inspect each layer."],
  cinematic: ["The earlier material bay", "Oriented panels and procedural normals explore material response with the earlier deterministic glossy model—not the fitted garage LTC kernel."],
  materiallab: ["Material response studies", "Paint, paper, metal and glass under shared emitters. These earlier material approximations provide context for the fitted garage."],
  showcase: ["The earlier showcase room", "A broader composition of lights and materials using the earlier glossy model. Return to the garage for published GGX LTC tables."],
  mirror: ["One reflected view", "An ideal mirror adds a single reflected ray to the surface-lighting experiment; it does not introduce a global illumination solver."],
  iridescence: ["An angle-dependent film", "A compact thin-film color model illustrates a related optical extension. It is distinct from the polygon integration result."],
  quadrics: ["Analytic intersections", "Sphere, cylinder and cone intersections separate tractable geometry from the lighting integral evaluated at each hit."],
  shapelab: ["Shape and shading", "Static primitives make silhouette and material behavior easier to inspect. Torus geometry uses numerical distance marching."],
  physicspile: ["Lighting a moving pile", "Rapier supplies numerical rigid-body motion; the renderer reevaluates direct lighting from the resulting transforms."],
  physicstorus: ["Torus in motion", "A numerical rigid-body scene and distance-marched torus meet deterministic surface lighting. Each component has a separate role."],
};
const sceneOptionLabels = new Map([...controls.sceneSelect.options].map(option => [option.value, option.textContent]));
let presentationKey = "";
let producerRequestKey = "";
let actualProducer = "pending";

function selectExperiment(sceneId) {
  const family = EXPERIMENT_FAMILIES.find(item => item.scenes.includes(sceneId));
  if (!family) return;
  if (controls.sceneSelect.dataset.family !== family.id) {
    controls.sceneSelect.replaceChildren(...family.scenes.map(id => new Option(sceneOptionLabels.get(id), id)));
    controls.sceneSelect.dataset.family = family.id;
  }
  controls.sceneSelect.value = sceneId;
  document.querySelectorAll("[data-scene-group]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.sceneGroup === family.id)));
}

function updatePresentation(settings, producer) {
  const requestKey = `${settings.sceneId}:${settings.backend}`;
  if (producer) actualProducer = producer;
  else if (requestKey !== producerRequestKey) actualProducer = "pending";
  producerRequestKey = requestKey;
  const key = [requestKey, settings.mode, settings.materialView, settings.mediumDensity > 0, settings.extraFancy, settings.mediumOnly, settings.bounceFill, settings.horizonClip, actualProducer].join(":");
  if (key === presentationKey) return;
  presentationKey = key;
  const family = EXPERIMENT_FAMILIES.find(item => item.scenes.includes(settings.sceneId));
  const [title, description] = EXPERIMENT_COPY[settings.sceneId] || EXPERIMENT_COPY.studio;
  const gpu = actualProducer === "webgpu";
  const pending = actualProducer === "pending";
  const fitted = gpu && settings.sceneId === "garage";
  const diffuse = family?.id === "diffuse";
  const label = pending ? "Preparing selected producer" : !settings.horizonClip ? "Horizon clipping disabled" : fitted ? "Fitted GGX LTC + diffuse" : diffuse ? "Diffuse polygon integral" : gpu ? "Earlier material model" : "CPU diffuse reference";
  document.querySelector("#sceneTitle").textContent = title;
  document.querySelector("#sceneDescription").textContent = description;
  document.querySelector("#sceneQuestion").textContent = family?.question || "";
  document.querySelector("#kernelBadge").textContent = label;
  document.querySelector("#sceneEyebrow").textContent = pending ? "Preparing the experiment" : fitted ? "Main investigation · fitted GGX LTC · GPU" : diffuse ? "Exact foundation · direct diffuse lighting" : "Related study · " + (gpu ? "GPU material extension" : "CPU reference path");
  document.querySelector("#comparisonScope").textContent = pending ? "Preparing the selected scene and producer. Its implemented model will be identified when the image is ready."
    : !settings.horizonClip ? "Clipping is disabled for diagnosis. The analytic domain differs from the cosine-clamped MC estimator; this is not a matched comparison."
    : fitted
    ? "LTC vs sampled diffuse + GGX base + clearcoat. Glass, film and fill are shared. Both direct surface estimators use unoccluded emitters; general object shadows are outside this comparison."
    : !gpu && !diffuse ? "CPU/WASM retain diffuse and selected mirror/film paths. Garage LTC, glass and blocker visibility require GPU."
    : diffuse ? "Same diffuse integral, two estimators. Freeze motion and disable fill to inspect the direct-light comparison."
    : "The comparison samples diffuse lighting. Earlier glossy and optical approximations remain shared.";
  outputs.lightingLabel.textContent = pending ? "preparing" : settings.mode === "mc" ? (fitted ? "sampled diffuse + GGX" : "sampled diffuse") : settings.mode === "split" ? (fitted ? "LTC / BSDF MC" : "diffuse comparison") : fitted ? "LTC + diffuse" : "diffuse boundary";
  document.querySelector("#integralLabel").textContent = fitted ? "Fitted LTC" : "Diffuse integral";
  document.querySelector("#mcLabel").textContent = fitted ? "BSDF Monte Carlo" : "Diffuse Monte Carlo";
  document.querySelector("#integralSubtitle").textContent = "Deterministic direct lighting";
  document.querySelector("#mcSubtitle").textContent = "Sampled direct lighting";
  const materialPanel = document.querySelector("#garageControls");
  materialPanel.hidden = settings.sceneId !== "garage";
  materialPanel.dataset.available = String(fitted || pending);
  materialPanel.querySelectorAll?.("input, select").forEach(field => { field.disabled = !fitted && !pending; });
  const atmospherePanel = document.querySelector("#atmosphereControls");
  atmospherePanel.hidden = settings.sceneId !== "garage";
  atmospherePanel.querySelectorAll?.("input, select").forEach(field => { field.disabled = !fitted && !pending; });
  const fancyControl = document.querySelector("#extraFancyControl");
  fancyControl.hidden = settings.sceneId !== "garage";
  document.querySelector("#extraFancy").disabled = !fitted && !pending;
  document.querySelector("#fancyCaption").textContent = settings.extraFancy
    ? "Organic volume cube · raised-edge normals · flowing inlay"
    : "Add an animated volume cube and a coordinated surface finish.";
  for (const id of ["mediumDensity", "mediumMode", "mediumAlbedo", "mediumFrequency", "mediumSteps", "groundFlow"]) {
    const field = document.querySelector("#" + id);
    field.disabled = !!settings.extraFancy || (!fitted && !pending);
    field.title = settings.extraFancy ? "Extra fancy uses a coordinated preset. Turn it off to edit the room atmosphere." : "";
  }
  document.querySelector("#atmosphereScope").textContent = settings.extraFancy
    ? "Extra fancy uses a bounded organic cube with extinction, single scattering and teal/gold emission. This is a procedural field, not a Physarum simulation. Pause its motion below; turn Extra fancy off to edit the room haze."
    : "These controls add room haze with numerical single scattering and Beer extinction. Both halves share the volume. Ground flow follows the scene animation switch.";
  document.querySelector("#materialControlScope").textContent = !fitted && !pending ? "Material anatomy requires the garage WebGPU producer. The current image uses the CPU reference path." : "The live probe isolates the geometric floor’s base GGX fit. The image also includes mapped normals, procedural blends and a separate coat.";
  if (fitted && settings.materialView > 0 && settings.materialView < 4) {
    const diagnostic = ["", "Shading normals", "Base roughness", "Blend mask"][settings.materialView];
    document.querySelector("#integralLabel").textContent = diagnostic;
    document.querySelector("#mcLabel").textContent = diagnostic;
    document.querySelector("#integralSubtitle").textContent = "Shared input · same field";
    document.querySelector("#mcSubtitle").textContent = "Shared input · same field";
    document.querySelector("#comparisonScope").textContent = "Material diagnostic: the same underlying field appears on both sides. Normals, roughness and masks use pinhole rays with no exposure or false-color transform.";
  } else if (fitted && (settings.mediumDensity > 0 || !!settings.extraFancy) && settings.materialView >= 4) {
    document.querySelector("#comparisonScope").textContent = "Isolated surface lobe before camera-volume accumulation. Incident light includes the same approximate medium transmittance on both sides; volume isolation applies to Beauty view.";
  } else if (fitted && (settings.mediumDensity > 0 || !!settings.extraFancy)) {
    document.querySelector("#comparisonScope").textContent = settings.mediumOnly
      ? "Isolated numerical single scattering, shared by both halves. The volume is not an LTC fit or an analytical ray integral."
      : "The surface comparison is viewed through the same numerical single-scattering medium. Light-path attenuation uses a bounded approximation; volume shadows from objects are not evaluated.";
    if (settings.extraFancy) document.querySelector("#comparisonScope").textContent = settings.mediumOnly
      ? "Isolated numerical scattering + emission from a procedural volume cube. Both halves share this integral; the organic field is not a Physarum simulation."
      : "Extra fancy: procedural volume cube, raised-edge shading normals and flowing inlay. The shared cube uses numerical scattering + emission; LTC still evaluates the opaque surface lighting.";
    if (settings.mediumOnly) {
      document.querySelector("#integralLabel").textContent = settings.extraFancy ? "Scattering + emission" : "Scattering";
      document.querySelector("#mcLabel").textContent = settings.extraFancy ? "Scattering + emission" : "Scattering";
      document.querySelector("#integralSubtitle").textContent = "Shared volume integral";
      document.querySelector("#mcSubtitle").textContent = "Shared volume integral";
    }
  }
}

const SCENES = {
  studio: {
    camera: { position: [0, 1.18, 4.35], target: [0, 0.58, -0.8], fov: 39 },
    lightBase: [0, 2.9, -0.55],
    lightMotion: [0.62, 0, 0.36],
    lightSpeed: 0.86,
    lightRadiance: [9.4, 8.0, 5.4],
    floor: { color: [0.72, 0.76, 0.76], roughness: 1 },
    wall: { color: [0.54, 0.62, 0.78], roughness: 1 },
    bounds: { floorX: 4.2, floorZMin: -3.4, floorZMax: 3.4, wallZ: -3.18, wallHeight: 3.7 },
    spheres: [
      { center: [-0.68, 0.66, -0.32], radius: 0.66, color: [0.92, 0.38, 0.26], motion: [0.06, 0, 0.08] },
      { center: [0.8, 0.39, 0.42], radius: 0.39, color: [0.08, 0.56, 0.52], motion: [-0.04, 0, 0.06] },
    ],
  },
  grazing: {
    camera: { position: [0, 1.36, 5.2], target: [0, 1.15, -2.2], fov: 35 },
    lightBase: [-0.95, 2.55, 0.88],
    lightMotion: [1.36, 0, 0.18],
    lightSpeed: 0.72,
    lightRadiance: [7.5, 8.6, 10.2],
    floor: { color: [0.7, 0.73, 0.69], roughness: 1 },
    wall: { color: [0.74, 0.62, 0.48], roughness: 1 },
    bounds: { floorX: 4.7, floorZMin: -3.8, floorZMax: 3.2, wallZ: -3.28, wallHeight: 4.2 },
    spheres: [
      { center: [-1.35, 0.27, -1.15], radius: 0.27, color: [0.22, 0.48, 0.78], motion: [0.08, 0, 0] },
      { center: [1.12, 0.48, -0.46], radius: 0.48, color: [0.78, 0.27, 0.31], motion: [-0.06, 0, 0.05] },
    ],
  },
  closeup: {
    camera: { position: [0, 0.86, 3.05], target: [0, 0.45, -0.18], fov: 42 },
    lightBase: [0.15, 2.25, -0.1],
    lightMotion: [0.42, 0.1, 0.22],
    lightSpeed: 1.08,
    lightRadiance: [10.8, 8.4, 6.6],
    floor: { color: [0.62, 0.72, 0.77], roughness: 1 },
    wall: { color: [0.68, 0.67, 0.62], roughness: 1 },
    bounds: { floorX: 3.3, floorZMin: -2.8, floorZMax: 2.8, wallZ: -2.46, wallHeight: 3.2 },
    spheres: [
      { center: [-0.36, 0.52, 0.08], radius: 0.52, color: [0.9, 0.42, 0.24], motion: [0.05, 0, 0.05] },
      { center: [0.48, 0.28, 0.5], radius: 0.28, color: [0.15, 0.6, 0.42], motion: [-0.04, 0, 0.05] },
    ],
  },
  sweep: {
    camera: { position: [0, 1.08, 4.55], target: [0, 0.7, -0.78], fov: 38 },
    lightBase: [-0.1, 2.9, -0.28],
    lightMotion: [1.72, 0.34, 0.52],
    lightSpeed: 1.34,
    lightRadiance: [11.2, 7.4, 4.8],
    floor: { color: [0.66, 0.7, 0.73], roughness: 1 },
    wall: { color: [0.5, 0.66, 0.58], roughness: 1 },
    bounds: { floorX: 4.6, floorZMin: -3.6, floorZMax: 3.3, wallZ: -3.08, wallHeight: 3.8 },
    spheres: [
      { center: [-0.88, 0.48, -0.02], radius: 0.48, color: [0.86, 0.3, 0.24], motion: [0.24, 0.04, 0.08], speed: 1.18 },
      { center: [0.74, 0.58, -0.5], radius: 0.58, color: [0.14, 0.5, 0.76], motion: [-0.18, 0.05, 0.12], speed: 0.92, phase: 1.2 },
    ],
  },
  stack: {
    camera: { position: [0, 1.28, 4.05], target: [0.02, 0.85, -0.42], fov: 36 },
    lightBase: [0.38, 2.95, -0.72],
    lightMotion: [0.82, 0.24, 0.62],
    lightSpeed: 1.18,
    lightRadiance: [8.6, 10.0, 7.2],
    floor: { color: [0.72, 0.68, 0.62], roughness: 1 },
    wall: { color: [0.62, 0.64, 0.78], roughness: 1 },
    bounds: { floorX: 3.8, floorZMin: -3.2, floorZMax: 2.9, wallZ: -2.82, wallHeight: 3.6 },
    spheres: [
      { center: [-0.54, 0.34, 0.16], radius: 0.34, color: [0.9, 0.36, 0.24], motion: [0.12, 0.02, 0.04], speed: 1.14 },
      { center: [0.0, 0.72, -0.02], radius: 0.42, color: [0.18, 0.58, 0.48], motion: [0.08, 0.07, 0.06], speed: 0.88, phase: 1.4 },
      { center: [0.5, 0.32, 0.2], radius: 0.32, color: [0.24, 0.42, 0.82], motion: [-0.1, 0.02, 0.05], speed: 1.26, phase: 2.5 },
    ],
  },
  trio: {
    camera: { position: [0, 1.0, 4.75], target: [0, 0.58, -0.48], fov: 40 },
    lightBase: [0, 2.85, 0.05],
    lightMotion: [1.18, 0.3, 0.92],
    lightSpeed: 1.52,
    lightRadiance: [9.0, 7.8, 10.6],
    floor: { color: [0.68, 0.75, 0.72], roughness: 1 },
    wall: { color: [0.74, 0.58, 0.66], roughness: 1 },
    bounds: { floorX: 4.4, floorZMin: -3.5, floorZMax: 3.4, wallZ: -3.12, wallHeight: 3.9 },
    spheres: [
      { center: [-1.08, 0.42, -0.24], radius: 0.42, color: [0.9, 0.48, 0.2], motion: [0.28, 0.05, 0.14], speed: 1.45 },
      { center: [0.0, 0.54, 0.12], radius: 0.54, color: [0.16, 0.62, 0.58], motion: [0.16, 0.07, -0.12], speed: 1.05, phase: 1.8 },
      { center: [1.08, 0.36, -0.18], radius: 0.36, color: [0.34, 0.42, 0.88], motion: [-0.24, 0.04, 0.16], speed: 1.28, phase: 3.1 },
    ],
  },
  mirror: {
    camera: { position: [0, 1.02, 4.35], target: [0, 0.62, -0.52], fov: 38 },
    lightBase: [-0.28, 2.72, -0.18],
    lightMotion: [1.04, 0.26, 0.46],
    lightSpeed: 1.1,
    lightRadiance: [10.2, 8.6, 6.2],
    floor: { color: [0.7, 0.72, 0.68], roughness: 1 },
    wall: { color: [0.56, 0.66, 0.76], roughness: 1 },
    bounds: { floorX: 4.2, floorZMin: -3.4, floorZMax: 3.2, wallZ: -2.92, wallHeight: 3.7 },
    spheres: [
      { center: [-0.52, 0.55, -0.12], radius: 0.55, color: [0.92, 0.95, 0.98], material: "mirror", motion: [0.05, 0.02, 0.04], speed: 0.9 },
      { center: [0.88, 0.38, 0.32], radius: 0.38, color: [0.9, 0.34, 0.22], motion: [-0.14, 0.02, 0.08], speed: 1.2, phase: 1.4 },
    ],
  },
  iridescence: {
    camera: { position: [0, 0.98, 4.1], target: [0.02, 0.62, -0.32], fov: 38 },
    lightBase: [-0.2, 2.72, -0.08],
    lightMotion: [0.95, 0.22, 0.55],
    lightSpeed: 1.18,
    lightRadiance: [10.6, 9.2, 7.4],
    floor: { color: [0.68, 0.72, 0.72], roughness: 1 },
    wall: { color: [0.48, 0.54, 0.68], roughness: 1 },
    bounds: { floorX: 4.2, floorZMin: -3.2, floorZMax: 3.2, wallZ: -2.86, wallHeight: 3.7 },
    spheres: [
      {
        center: [-0.36, 0.62, -0.1],
        radius: 0.62,
        color: [0.95, 0.98, 1.0],
        material: "thinfilm",
        filmThickness: 0.42,
        ior: 1.46,
        normalScale: 0.5,
        pattern: "crisp",
        motion: [0.04, 0.02, 0.05],
        speed: 0.92,
      },
      { center: [0.86, 0.36, 0.28], radius: 0.36, color: [0.18, 0.58, 0.48], motion: [-0.12, 0.02, 0.08], speed: 1.14 },
    ],
  },
  quadrics: {
    camera: { position: [0, 1.18, 4.65], target: [0, 0.78, -0.5], fov: 39 },
    lightBase: [0.1, 3.0, -0.35],
    lightMotion: [1.1, 0.24, 0.55],
    lightSpeed: 1.04,
    lightRadiance: [8.8, 9.7, 10.6],
    floor: { color: [0.68, 0.72, 0.68], roughness: 1 },
    wall: { color: [0.58, 0.62, 0.76], roughness: 1 },
    bounds: { floorX: 4.4, floorZMin: -3.6, floorZMax: 3.4, wallZ: -3.04, wallHeight: 3.9 },
    spheres: [
      { shape: "cylinder", center: [-0.92, 0.52, -0.25], radius: 0.34, height: 1.04, color: [0.14, 0.54, 0.78], motion: [0.08, 0, 0.05], speed: 0.9 },
      { shape: "cone", center: [0.18, 0.5, -0.12], radius: 0.48, height: 1.0, color: [0.9, 0.42, 0.22], motion: [-0.06, 0, 0.06], speed: 1.1 },
      {
        center: [1.08, 0.36, 0.16],
        radius: 0.36,
        color: [0.92, 0.95, 1.0],
        material: "thinfilm",
        filmThickness: 0.34,
        ior: 1.5,
        normalScale: 0.42,
        pattern: "crisp",
        motion: [-0.12, 0.02, 0.08],
        speed: 1.25,
      },
    ],
  },
  meshlights: {
    camera: { position: [0, 1.16, 4.85], target: [0, 0.72, -0.58], fov: 39 },
    lightBase: [0, 2.9, -0.25],
    lightMotion: [0.72, 0.18, 0.42],
    lightSpeed: 1.0,
    lightRadiance: [7.8, 8.4, 9.2],
    lightPanels: [
      { offset: [-0.9, 0, 0.12], width: 0.78, depth: 1.05, radiance: [12.0, 4.2, 3.1], phase: 0.0 },
      { offset: [0.02, 0.08, -0.28], width: 0.92, depth: 0.85, radiance: [3.2, 11.0, 5.8], phase: 1.7 },
      { offset: [0.9, 0, 0.1], width: 0.72, depth: 1.15, radiance: [3.8, 5.4, 13.0], phase: 3.2 },
    ],
    floor: { color: [0.66, 0.7, 0.74], roughness: 1 },
    wall: { color: [0.54, 0.62, 0.72], roughness: 1 },
    bounds: { floorX: 4.5, floorZMin: -3.6, floorZMax: 3.4, wallZ: -3.12, wallHeight: 3.9 },
    spheres: [
      { center: [-1.0, 0.44, -0.12], radius: 0.44, color: [0.92, 0.42, 0.24], motion: [0.16, 0.03, 0.08], speed: 1.12 },
      {
        center: [0.02, 0.62, -0.32],
        radius: 0.62,
        color: [0.92, 0.95, 1.0],
        material: "thinfilm",
        filmThickness: 0.38,
        ior: 1.47,
        normalScale: 0.46,
        pattern: "crisp",
        motion: [0.08, 0.04, -0.06],
        speed: 0.94,
      },
      { shape: "cylinder", center: [1.08, 0.48, 0.08], radius: 0.3, height: 0.96, color: [0.16, 0.58, 0.52], motion: [-0.12, 0, 0.06], speed: 1.2 },
    ],
  },
  cinematic: {
    camera: { position: [0.05, 1.05, 4.55], target: [0.05, 0.92, -1.55], fov: 34 },
    lightBase: [0, 2.9, -3.02],
    lightMotion: [0.14, 0.06, 0.02],
    lightSpeed: 0.72,
    lightRadiance: [8.0, 8.4, 8.8],
    lightPanels: [
      {
        offset: [-1.32, -1.52, 0.05],
        offsetScale: "world",
        width: 0.28,
        depth: 0.72,
        radiance: [3.1, 13.6, 15.2],
        u: [1, 0, 0],
        v: [0, 1, 0],
        motion: [0.02, 0.03, 0.01],
      },
      {
        offset: [-0.12, -1.45, 0.08],
        offsetScale: "world",
        width: 0.24,
        depth: 0.82,
        radiance: [10.4, 14.2, 6.2],
        u: [1, 0, 0],
        v: [0, 1, 0],
        motion: [-0.02, 0.025, 0.01],
        phase: 1.3,
      },
      {
        offset: [1.18, -1.5, 0.04],
        offsetScale: "world",
        width: 0.32,
        depth: 0.76,
        radiance: [17.0, 9.7, 3.4],
        u: [1, 0, 0],
        v: [0, 1, 0],
        motion: [0.025, 0.02, 0.01],
        phase: 2.4,
      },
      {
        offset: [-1.55, -0.12, 2.02],
        offsetScale: "world",
        width: 0.58,
        depth: 0.5,
        radiance: [3.0, 8.2, 15.5],
        u: [1, 0, 0],
        v: [0, 0, 1],
        motion: [0.035, 0.02, -0.02],
        phase: 3.2,
      },
    ],
    floor: {
      color: [0.25, 0.29, 0.29],
      material: "coated",
      roughness: 0.28,
      normalScale: 0.12,
      pattern: "crisp",
      displacementScale: 0,
    },
    wall: { color: [0.2, 0.25, 0.29], material: "coated", roughness: 0.46, normalScale: 0.48, pattern: "panel" },
    bounds: { floorX: 4.8, floorZMin: -3.95, floorZMax: 3.35, wallZ: -3.18, wallHeight: 3.75 },
    spheres: [
      {
        shape: "cylinder",
        center: [-1.28, 0.34, -0.18],
        radius: 0.32,
        height: 0.68,
        color: [0.82, 0.9, 0.95],
        material: "roughmetal",
        roughness: 0.18,
        metalness: 0.86,
        normalScale: 0.42,
        pattern: "brushed",
        motion: [0.04, 0, 0.03],
        speed: 0.85,
      },
      {
        center: [-0.28, 0.46, 0.18],
        radius: 0.46,
        color: [0.92, 0.95, 1.0],
        material: "thinfilm",
        filmThickness: 0.36,
        ior: 1.5,
        normalScale: 0.46,
        pattern: "crisp",
        motion: [0.035, 0.015, -0.04],
        speed: 0.7,
        phase: 1.1,
      },
      {
        shape: "cone",
        center: [0.78, 0.48, -0.06],
        radius: 0.36,
        height: 0.96,
        color: [0.95, 0.42, 0.18],
        material: "coated",
        roughness: 0.24,
        metalness: 0.05,
        normalScale: 0.2,
        pattern: "noise",
        motion: [-0.035, 0.015, 0.04],
        speed: 0.9,
        phase: 2.0,
      },
      {
        center: [1.45, 0.26, 0.5],
        radius: 0.26,
        color: [0.12, 0.48, 0.55],
        material: "coated",
        roughness: 0.2,
        normalScale: 0.28,
        pattern: "noise",
        motion: [-0.05, 0.01, 0.03],
        speed: 1.05,
        phase: 2.9,
      },
    ],
  },
  physicspile: {
    camera: { position: [0.08, 1.45, 5.1], target: [0.03, 0.88, -0.85], fov: 38 },
    lightBase: [0, 3.05, -0.25],
    lightMotion: [0.45, 0.05, 0.25],
    lightSpeed: 0.55,
    lightRadiance: [10.0, 8.8, 6.2],
    lightPanels: [
      { offset: [-0.58, 0.02, 0.1], width: 0.72, depth: 1.08, radiance: [13.0, 6.2, 3.8], phase: 0.2 },
      { offset: [0.34, 0.08, -0.16], width: 0.82, depth: 0.9, radiance: [3.4, 9.4, 13.0], phase: 1.6 },
    ],
    floor: {
      color: [0.42, 0.46, 0.42],
      material: "coated",
      roughness: 0.32,
      normalScale: 0.1,
      pattern: "crisp",
      displacementScale: 0,
    },
    wall: { color: [0.24, 0.31, 0.38], material: "coated", roughness: 0.5, normalScale: 0.35, pattern: "panel" },
    bounds: { floorX: 4.4, floorZMin: -3.7, floorZMax: 3.2, wallZ: -3.18, wallHeight: 3.7 },
    physics: { gravity: [0, -9.8, 0], resetInterval: 10 },
    spheres: [
      {
        shape: "sphere",
        center: [-0.9, 2.15, -0.35],
        radius: 0.32,
        color: [0.92, 0.38, 0.2],
        material: "coated",
        roughness: 0.2,
        normalScale: 0.36,
        pattern: "cellular",
        displacementScale: 0.36,
        physics: { collider: "ball", linvel: [1.6, 0.2, -0.5], angvel: [2.0, 0.6, 1.2], restitution: 0.72 },
      },
      {
        shape: "cube",
        center: [0.02, 1.92, -0.18],
        radius: 0.34,
        height: 0.68,
        color: [0.14, 0.58, 0.68],
        material: "roughmetal",
        roughness: 0.22,
        metalness: 0.52,
        normalScale: 0.28,
        pattern: "brushed",
        displacementScale: 0.18,
        rotation: [0.12, 0.18, 0.08, 0.97],
        physics: { collider: "cuboid", linvel: [-0.5, 0.1, 0.7], angvel: [1.4, 2.1, -0.7], restitution: 0.45 },
      },
      {
        shape: "cylinder",
        center: [0.82, 2.45, -0.42],
        radius: 0.26,
        height: 0.72,
        color: [0.84, 0.86, 0.92],
        material: "roughmetal",
        roughness: 0.16,
        metalness: 0.86,
        normalScale: 0.55,
        pattern: "brushed",
        rotation: [0, 0, 0.7071, 0.7071],
        physics: { collider: "cylinder", linvel: [-1.35, -0.1, 0.35], angvel: [5.2, 0.2, 0.4], restitution: 0.5 },
      },
      {
        shape: "sphere",
        center: [1.34, 1.55, 0.42],
        radius: 0.24,
        color: [0.95, 0.9, 0.35],
        material: "thinfilm",
        filmThickness: 0.31,
        ior: 1.48,
        normalScale: 0.5,
        pattern: "crisp",
        physics: { collider: "ball", linvel: [-1.2, 0.25, -0.8], angvel: [1.0, 1.8, 0.6], restitution: 0.82 },
      },
    ],
  },
  physicstorus: {
    camera: { position: [0.0, 1.28, 4.75], target: [0, 0.78, -0.65], fov: 39 },
    lightBase: [0.05, 3.0, -0.35],
    lightMotion: [0.55, 0.1, 0.36],
    lightSpeed: 0.7,
    lightRadiance: [8.8, 9.4, 10.4],
    lightPanels: [
      { offset: [-0.55, 0.02, 0.08], width: 0.8, depth: 0.9, radiance: [5.0, 11.4, 15.0], phase: 0.3 },
      { offset: [0.5, 0.04, -0.12], width: 0.7, depth: 1.0, radiance: [15.0, 7.4, 4.2], phase: 1.7 },
    ],
    floor: {
      color: [0.3, 0.32, 0.36],
      material: "coated",
      roughness: 0.24,
      normalScale: 0.12,
      pattern: "crisp",
      displacementScale: 0,
    },
    wall: { color: [0.22, 0.26, 0.32], material: "coated", roughness: 0.5, normalScale: 0.38, pattern: "waves" },
    bounds: { floorX: 4.2, floorZMin: -3.5, floorZMax: 3.1, wallZ: -3.05, wallHeight: 3.6 },
    physics: { gravity: [0, -9.8, 0], resetInterval: 11 },
    spheres: [
      {
        shape: "torus",
        center: [-0.72, 2.12, -0.22],
        radius: 0.34,
        height: 0.16,
        color: [0.78, 0.92, 1.0],
        material: "roughmetal",
        roughness: 0.12,
        metalness: 0.88,
        normalScale: 0.4,
        pattern: "waves",
        displacementScale: 0.2,
        physics: { collider: "torus", linvel: [1.1, 0.0, -0.45], angvel: [3.2, 1.6, -0.3], restitution: 0.55 },
      },
      {
        shape: "cube",
        center: [0.22, 1.72, -0.28],
        radius: 0.32,
        height: 0.64,
        color: [0.9, 0.42, 0.22],
        material: "coated",
        roughness: 0.18,
        normalScale: 0.26,
        pattern: "cellular",
        displacementScale: 0.24,
        rotation: [0.06, 0.2, -0.12, 0.97],
        physics: { collider: "cuboid", linvel: [-0.25, 0.1, 0.5], angvel: [-1.0, 1.8, 1.2], restitution: 0.42 },
      },
      {
        shape: "sphere",
        center: [0.95, 2.08, 0.1],
        radius: 0.3,
        color: [0.18, 0.64, 0.48],
        material: "coated",
        roughness: 0.21,
        normalScale: 0.42,
        pattern: "noise",
        displacementScale: 0.32,
        physics: { collider: "ball", linvel: [-1.35, 0.2, -0.7], angvel: [1.0, -1.4, 0.8], restitution: 0.75 },
      },
      {
        shape: "cylinder",
        center: [1.42, 1.48, 0.52],
        radius: 0.22,
        height: 0.62,
        color: [0.9, 0.94, 1.0],
        material: "roughmetal",
        roughness: 0.2,
        metalness: 0.68,
        normalScale: 0.36,
        pattern: "brushed",
        rotation: [0.7071, 0, 0, 0.7071],
        physics: { collider: "cylinder", linvel: [-0.9, 0.0, -0.85], angvel: [0.4, 0.1, -5.0], restitution: 0.5 },
      },
    ],
  },
  shapelab: {
    camera: { position: [0.05, 1.18, 4.6], target: [0.0, 0.68, -0.5], fov: 38 },
    lightBase: [0, 2.92, -0.32],
    lightMotion: [0.55, 0.08, 0.36],
    lightSpeed: 0.72,
    lightRadiance: [9.4, 9.2, 8.6],
    lightPanels: [
      { offset: [-0.5, 0.02, 0.08], width: 0.82, depth: 0.9, radiance: [12.5, 6.4, 4.4], phase: 0.4 },
      { offset: [0.48, 0.04, -0.1], width: 0.74, depth: 1.0, radiance: [4.2, 8.6, 13.0], phase: 1.8 },
    ],
    floor: { color: [0.34, 0.38, 0.4], material: "coated", roughness: 0.26, normalScale: 0.1, pattern: "crisp", displacementScale: 0 },
    wall: { color: [0.22, 0.27, 0.34], material: "coated", roughness: 0.54, normalScale: 0.36, pattern: "waves" },
    bounds: { floorX: 4.2, floorZMin: -3.4, floorZMax: 3.2, wallZ: -3.0, wallHeight: 3.6 },
    spheres: [
      {
        shape: "hemisphere",
        center: [-1.12, 0.02, -0.28],
        radius: 0.52,
        color: [0.92, 0.44, 0.22],
        material: "coated",
        roughness: 0.22,
        normalScale: 0.34,
        pattern: "cellular",
        displacementScale: 0.22,
      },
      {
        shape: "capsule",
        center: [-0.15, 0.58, -0.18],
        radius: 0.22,
        height: 1.12,
        color: [0.82, 0.9, 0.98],
        material: "roughmetal",
        roughness: 0.16,
        metalness: 0.72,
        normalScale: 0.5,
        pattern: "brushed",
        rotation: [0.18, 0, 0.32, 0.93],
      },
      {
        shape: "cube",
        center: [0.78, 0.34, -0.18],
        radius: 0.34,
        height: 0.68,
        color: [0.12, 0.58, 0.6],
        material: "coated",
        roughness: 0.2,
        normalScale: 0.28,
        pattern: "waves",
        displacementScale: 0.18,
        rotation: [0.09, 0.34, -0.14, 0.93],
      },
      {
        shape: "torus",
        center: [1.48, 0.44, 0.18],
        radius: 0.34,
        height: 0.16,
        color: [0.94, 0.96, 1.0],
        material: "thinfilm",
        filmThickness: 0.32,
        ior: 1.48,
        normalScale: 0.44,
        pattern: "crisp",
        rotation: [0.45, 0.12, 0.08, 0.88],
      },
    ],
  },
  materiallab: {
    camera: { position: [0.05, 1.08, 4.85], target: [0.0, 0.68, -0.58], fov: 39 },
    lightBase: [0, 3.0, -0.35],
    lightMotion: [0.7, 0.1, 0.38],
    lightSpeed: 0.74,
    lightRadiance: [9.8, 9.2, 8.0],
    lightPanels: [
      { offset: [-0.78, 0.02, 0.02], width: 0.86, depth: 1.04, radiance: [14.5, 6.1, 4.0], phase: 0.1 },
      { offset: [0.24, 0.06, -0.18], width: 0.78, depth: 0.92, radiance: [4.0, 11.8, 14.0], phase: 1.5 },
      { offset: [1.0, -0.02, 0.12], width: 0.62, depth: 1.1, radiance: [12.0, 10.2, 4.6], phase: 2.6 },
    ],
    floor: {
      color: [0.34, 0.37, 0.38],
      material: "coated",
      roughness: 0.3,
      normalScale: 0.2,
      pattern: "tile",
      displacementScale: 0,
    },
    wall: { color: [0.22, 0.26, 0.31], material: "paper", roughness: 0.9, normalScale: 0.3, pattern: "fbm" },
    bounds: { floorX: 4.6, floorZMin: -3.65, floorZMax: 3.25, wallZ: -3.12, wallHeight: 3.75 },
    spheres: [
      {
        center: [-1.5, 0.48, -0.22],
        radius: 0.48,
        color: [0.86, 0.08, 0.06],
        material: "carpaint",
        roughness: 0.24,
        metalness: 0.04,
        clearcoat: 0.94,
        coatMaskScale: 3.2,
        normalScale: 0.22,
        pattern: "flakes",
        motion: [0.05, 0.02, 0.03],
        speed: 0.82,
      },
      {
        shape: "cylinder",
        center: [-0.55, 0.42, 0.02],
        radius: 0.28,
        height: 0.84,
        color: [0.76, 0.82, 0.88],
        material: "brushedmetal",
        roughness: 0.16,
        metalness: 0.88,
        anisotropy: 0.88,
        normalScale: 0.48,
        pattern: "brushed",
        rotation: [0.18, 0.0, 0.38, 0.9],
        motion: [0.04, 0, -0.04],
        speed: 0.7,
        phase: 0.9,
      },
      {
        shape: "hemisphere",
        center: [0.2, 0.02, -0.14],
        radius: 0.5,
        color: [0.82, 0.76, 0.61],
        material: "paper",
        roughness: 0.96,
        normalScale: 0.28,
        pattern: "fbm",
        motion: [-0.03, 0, 0.04],
        speed: 0.62,
        phase: 1.8,
      },
      {
        center: [0.96, 0.42, 0.22],
        radius: 0.42,
        color: [0.78, 0.92, 1.0],
        material: "roughglass",
        roughness: 0.36,
        ior: 1.45,
        transmission: 0.68,
        normalScale: 0.12,
        pattern: "fbm",
        motion: [0.035, 0.02, -0.03],
        speed: 0.72,
        phase: 2.5,
      },
      {
        shape: "sphere",
        center: [1.62, 0.32, -0.18],
        radius: 0.32,
        color: [0.9, 0.98, 1.0],
        material: "glass",
        roughness: 0.035,
        ior: 1.52,
        transmission: 0.93,
        clearcoat: 0.6,
        normalScale: 0.0,
        motion: [-0.05, 0.015, 0.035],
        speed: 0.8,
        phase: 3.2,
      },
    ],
  },
  garage: {
    camera: { position: [0.08, 1.18, 5.15], target: [0.02, 0.58, -0.48], fov: 37 },
    lightBase: [0, 3.02, -0.32],
    lightMotion: [0.42, 0.08, 0.28],
    lightSpeed: 0.58,
    lightRadiance: [10.0, 9.2, 8.2],
    lightPanels: [
      { offset: [-0.82, 0.02, -0.2], offsetScale: "world", width: 0.78, depth: 0.86, radiance: [16.5, 7.0, 4.2], u: [1, 0, 0], v: [0, 0, 1], motion: [0.05, 0.015, 0.04], phase: 0.1 },
      { offset: [0.96, 0.08, 0.14], offsetScale: "world", width: 0.68, depth: 0.78, radiance: [4.0, 10.8, 16.0], u: [1, 0, 0], v: [0, 0, 1], motion: [-0.04, 0.02, 0.045], phase: 1.7 },
      { offset: [0.08, -1.28, -2.48], offsetScale: "world", width: 0.62, depth: 0.72, radiance: [3.2, 5.2, 2.4], u: [1, 0, 0], v: [0, 1, 0], motion: [0.025, 0.035, 0.02], phase: 2.8 },
    ],
    floor: { color: [0.2, 0.23, 0.24], material: "coated", roughness: 0.18, normalScale: 0.035, pattern: "tile", displacementScale: 0 },
    wall: { color: [0.15, 0.19, 0.22], material: "paper", roughness: 0.88, normalScale: 0.22, pattern: "fbm" },
    bounds: { floorX: 4.8, floorZMin: -3.8, floorZMax: 3.4, wallZ: -3.18, wallHeight: 3.85 },
    spheres: [
      {
        shape: "sphere",
        center: [-1.12, 0.64, -0.4],
        radius: 0.64,
        color: [0.72, 0.025, 0.018],
        material: "carpaint",
        roughness: 0.2,
        metalness: 0.08,
        clearcoat: 0.96,
        coatMaskScale: 3.8,
        normalScale: 0.18,
        pattern: "flakes",
        motion: [0.025, 0, 0.025],
        speed: 0.54,
      },
      {
        center: [0.18, 0.54, -0.08],
        radius: 0.54,
        color: [0.82, 0.93, 0.97],
        material: "glass",
        roughness: 0.025,
        ior: 1.52,
        dispersion: 0.024,
        absorption: 0.14,
        transmission: 0.96,
        motion: [0.025, 0.02, -0.025],
        speed: 0.62,
        phase: 1.2,
      },
      {
        shape: "torus",
        center: [1.38, 0.44, -0.3],
        radius: 0.38,
        height: 0.15,
        color: [0.78, 0.84, 0.9],
        material: "brushedmetal",
        roughness: 0.14,
        metalness: 0.92,
        anisotropy: 0,
        normalScale: 0.08,
        pattern: "brushed",
        rotation: [0.42, 0.08, 0.12, 0.89],
        motion: [-0.03, 0.015, 0.02],
        speed: 0.7,
        phase: 2.1,
      },
      {
        center: [-0.48, 0.29, 0.88],
        radius: 0.29,
        color: [0.96, 0.98, 1.0],
        material: "thinfilm",
        filmThickness: 0.34,
        ior: 1.48,
        normalScale: 0.18,
        pattern: "crisp",
        motion: [0.02, 0.015, -0.02],
        speed: 0.58,
        phase: 2.8,
      },
      {
        shape: "sphere",
        center: [0.9, 0.38, 0.85],
        radius: 0.38,
        color: [0.035, 0.39, 0.32],
        material: "coated",
        clearcoat: 0.88,
        roughness: 0.38,
        normalScale: 0.24,
        pattern: "fbm",
      },
    ],
  },
  showcase: {
    camera: { position: [0, 1.6, 2.05], target: [0, 1.32, -0.6], fov: 52 },
    lightBase: [0, 2.5, 0.1],
    lightMotion: [0.22, 0.06, 0.22],
    lightSpeed: 0.5,
    lightRadiance: [9.2, 8.6, 7.8],
    lightPanels: [
      { offset: [-1.45, 0.7, -0.55], offsetScale: "world", width: 0.72, depth: 0.72, radiance: [17.0, 6.2, 4.0], u: [1, 0, 0], v: [0, 0, 1], phase: 0.0 },
      { offset: [1.45, 0.85, 0.45], offsetScale: "world", width: 0.62, depth: 0.92, radiance: [4.0, 9.4, 16.5], u: [1, 0, 0], v: [0, 0, 1], phase: 1.6 },
      { offset: [0.0, 1.05, -1.25], offsetScale: "world", width: 1.05, depth: 0.5, radiance: [10.5, 14.5, 6.4], u: [1, 0, 0], v: [0, 0, 1], phase: 3.0 },
    ],
    floor: { color: [0.3, 0.32, 0.36], material: "coated", roughness: 0.3, normalScale: 0.12, pattern: "crisp", displacementScale: 0 },
    wall: { color: [0.24, 0.27, 0.32], material: "coated", roughness: 0.45, normalScale: 0.3, pattern: "panel" },
    bounds: { floorX: 4.0, floorZMin: -3.4, floorZMax: 3.4, wallZ: -3.2, wallHeight: 3.6 },
    room: {
      center: [0, 1.5, 0],
      halfExtents: [3.4, 2.6, 3.4],
      material: "coated",
      roughness: 0.4,
      pattern: "panel",
      normalScale: 0.28,
      spin: { axis: [0.25, 1.0, 0.15], speed: 0.18 },
      faces: {
        px: [0.46, 0.24, 0.22],
        nx: [0.22, 0.3, 0.46],
        py: [0.3, 0.33, 0.38],
        ny: [0.26, 0.28, 0.3],
        pz: [0.24, 0.42, 0.34],
        nz: [0.4, 0.3, 0.44],
      },
    },
    spheres: [
      { center: [-0.85, 1.35, -0.2], radius: 0.5, color: [0.86, 0.08, 0.06], material: "carpaint", roughness: 0.24, metalness: 0.04, clearcoat: 0.94, coatMaskScale: 3.2, normalScale: 0.22, pattern: "flakes", motion: [0.05, 0.03, 0.04], speed: 0.7 },
      { center: [0.42, 1.5, -0.1], radius: 0.46, color: [0.95, 0.98, 1.0], material: "thinfilm", filmThickness: 0.4, ior: 1.48, normalScale: 0.46, pattern: "crisp", motion: [0.04, 0.05, -0.04], speed: 0.6, phase: 1.2 },
      { center: [1.15, 1.25, 0.5], radius: 0.34, color: [0.9, 0.98, 1.0], material: "glass", roughness: 0.04, ior: 1.52, transmission: 0.92, clearcoat: 0.6, normalScale: 0, motion: [-0.05, 0.04, 0.03], speed: 0.8, phase: 2.4 },
      { shape: "cylinder", center: [-0.2, 1.1, 0.7], radius: 0.26, height: 0.8, color: [0.82, 0.86, 0.92], material: "brushedmetal", roughness: 0.16, metalness: 0.88, anisotropy: 0.85, normalScale: 0.48, pattern: "brushed", rotation: [0.2, 0, 0.3, 0.9], motion: [0.03, 0, -0.03], speed: 0.55, phase: 0.6 },
    ],
  },
};

const camera = { position: [0, 0, 0], target: [0, 0, -1], fov: 40 };

const scene = {
  lightCenter: [0, 2.9, -0.55],
  lightNormal: [0, -1, 0],
  lightRadiance: [9.4, 8.0, 5.4],
  floor: { color: [0.72, 0.76, 0.76], roughness: 1 },
  wall: { color: [0.54, 0.62, 0.78], roughness: 1 },
  bounds: { floorX: 4.2, floorZMin: -3.4, floorZMax: 3.4, wallZ: -3.18, wallHeight: 3.7 },
  spheres: [],
  lightPanels: [],
  room: null,
};

let seed = 86173;
let frameHandle = 0;
let renderVersion = 0;
let selectionEpoch = 0;
let animationTimer = 0;
let backendBenchTimer = 0;
let animationPhase = 0;
let lastAnimationTime = performance.now();
let mediumClock = 0;
let lastMediumClockTime = performance.now();
let lastAnimationDelta = 0;
let lastFrameMs = 0;
let lastFrameStartTime = 0;
let renderInFlight = false;
let consecutiveFailures = 0;
let renderHalted = false;
let errorBanner = null;
let webgpuUnavailable = false;
let fallbackCanvas = null;
let fallback2dCtx = null;
let renderQueued = false;
let splitPosition = 0.5;
let draggingSplit = false;
let rapierPromise = null;
let physicsState = null;

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function madd(a, b, s) {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v) {
  const inv = 1 / Math.max(length(v), 1e-8);
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

function reflect(v, n) {
  return normalize(sub(v, mul(n, 2 * dot(v, n))));
}

function quatConjugate(q) {
  return [-(q?.[0] || 0), -(q?.[1] || 0), -(q?.[2] || 0), q?.[3] ?? 1];
}

function rotateByQuat(v, q) {
  const x = q?.[0] || 0;
  const y = q?.[1] || 0;
  const z = q?.[2] || 0;
  const w = q?.[3] ?? 1;
  const uv = cross([x, y, z], v);
  const uuv = cross([x, y, z], uv);
  return add(v, add(mul(uv, 2 * w), mul(uuv, 2)));
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mix(a, b, t) {
  return a * (1 - t) + b * t;
}

function random01(state) {
  state.value = (1664525 * state.value + 1013904223) >>> 0;
  return state.value / 4294967296;
}

function getMode() {
  return controls.mode.find((input) => input.checked).value;
}

function getBackend() {
  return controls.backend.find((input) => input.checked).value;
}

function readSettings() {
  return {
    mode: getMode(),
    backend: getBackend(),
    sceneId: controls.sceneSelect.value,
    lightWidth: Number(controls.lightWidth.value),
    lightDepth: Number(controls.lightDepth.value),
    lightHeight: Number(controls.lightHeight.value),
    materialView: Number(controls.materialView.value),
    floorRoughness: Number(controls.floorRoughness.value),
    normalStrength: Number(controls.normalStrength.value),
    coatWeight: Number(controls.coatWeight.value),
    blendStrength: Number(controls.blendStrength.value),
    textureScale: Number(controls.textureScale.value),
    mediumDensity: Number(controls.mediumDensity.value),
    mediumMode: Number(controls.mediumMode.value),
    mediumAlbedo: Number(controls.mediumAlbedo.value),
    mediumFrequency: Number(controls.mediumFrequency.value),
    mediumSteps: Number(controls.mediumSteps.value),
    mediumAnimate: controls.mediumAnimate.checked,
    mediumOnly: controls.mediumOnly.checked,
    groundFlow: Number(controls.groundFlow.value),
    lightFrame: controls.lightFrame.checked,
    extraFancy: controls.extraFancy.checked,
    samples: Number(controls.samples.value),
    exposure: Number(controls.exposure.value),
    aaSamples: Math.max(1, Math.min(4, Math.round(Number(controls.aaSamples.value)))),
    renderScale: Number(controls.renderScale.value),
    aperture: Number(controls.aperture.value),
    focusDistance: Number(controls.focusDistance.value),
    targetFps: Number(controls.targetFps.value),
    animate: controls.animate.checked,
    bounceFill: controls.bounceFill.checked,
    horizonClip: controls.horizonClip.checked,
    showFalseColor: controls.showFalseColor.checked,
  };
}

function updateOutputs(settings) {
  for (const key of ["mediumDensity", "mediumAlbedo", "mediumFrequency", "groundFlow"]) outputs[key].value = settings[key] === 0 && (key === "mediumDensity" || key === "groundFlow") ? "Off" : settings[key].toFixed(2);
  outputs.mediumSteps.value = String(settings.mediumSteps);
  for (const key of ["floorRoughness", "normalStrength", "coatWeight", "blendStrength", "textureScale"]) outputs[key].value = settings[key].toFixed(2);
  for (const field of Object.values(controls)) if (field?.type === "range") field.style.setProperty("--range-fill", `${100 * (Number(field.value) - Number(field.min)) / (Number(field.max) - Number(field.min))}%`);
  outputs.lightWidth.value = settings.lightWidth.toFixed(2);
  outputs.lightDepth.value = settings.lightDepth.toFixed(2);
  outputs.lightHeight.value = settings.lightHeight.toFixed(2);
  outputs.samples.value = String(settings.samples);
  outputs.exposure.value = settings.exposure.toFixed(2);
  outputs.aaSamples.value = `${settings.aaSamples}x`;
  outputs.renderScale.value = settings.renderScale.toFixed(2);
  outputs.aperture.value = settings.aperture.toFixed(3);
  outputs.focusDistance.value = settings.focusDistance.toFixed(2);
  outputs.targetFps.value = String(settings.targetFps);
  outputs.modeMetric.textContent =
    settings.mode === "mc" ? "Monte Carlo" : settings.mode === "split" ? "Compare" : "Integral";
  const comparing = settings.mode === "split";
  outputs.splitLabel.hidden = !comparing;
  controls.splitHandle.hidden = !comparing;
  canvasWrap.dataset.compare = comparing ? "true" : "false";
  canvasWrap.style.setProperty("--split", `${(splitPosition * 100).toFixed(2)}%`);
  outputs.assumptionLabel.textContent = settings.bounceFill ? "direct + fill" : "direct only";
  outputs.backendLabel.textContent =
    settings.backend === "wasm" ? "WASM renderer" : settings.backend === "webgpu" ? "WebGPU renderer" : "JS CPU renderer";
  outputs.kernelLabel.textContent =
    settings.mode === "mc" ? "mc" : settings.mode === "split" ? "analytic + mc" : "analytic";
  updatePresentation(settings);
  updateBackendChrome();
}

function applyRenderScale(settings) {
  const scale = Math.max(0.45, Math.min(MAX_RENDER_SCALE, settings.renderScale));
  // Size to the visible viewport, not the replaced canvas element's intrinsic
  // aspect. All producers already derive their camera aspect from these sizes.
  const aspect = canvasWrap.clientWidth > 0 && canvasWrap.clientHeight > 0
    ? canvasWrap.clientWidth / canvasWrap.clientHeight : BASE_WIDTH / BASE_HEIGHT;
  const desiredHeight = BASE_HEIGHT * scale;
  const desiredWidth = desiredHeight * aspect;
  const fit = Math.min(1, WASM_MAX_WIDTH / desiredWidth, WASM_MAX_HEIGHT / desiredHeight);
  const width = Math.max(1, Math.round(desiredWidth * fit));
  const height = Math.max(1, Math.round(desiredHeight * fit));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  outputs.resolutionLabel.textContent = `${width} x ${height}`;
  return { width, height };
}

function advanceMediumClock(settings) {
  const now = performance.now();
  if (settings.sceneId === "garage" && settings.backend === "webgpu" && (settings.mediumDensity > 0 || !!settings.extraFancy) && settings.mediumAnimate) {
    mediumClock += Math.min(.1, Math.max(0, (now - lastMediumClockTime) / 1000));
  }
  lastMediumClockTime = now;
  return mediumClock;
}

function animationActive(settings) {
  return settings.animate || (settings.backend === "webgpu" && settings.sceneId === "garage" && (settings.mediumDensity > 0 || !!settings.extraFancy) && settings.mediumAnimate);
}

function advanceAnimation(settings) {
  const now = performance.now();
  const delta = Math.min(0.05, Math.max(0, (now - lastAnimationTime) / 1000));
  lastAnimationDelta = settings.animate ? delta : 0;
  if (settings.animate) {
    animationPhase += Math.min(0.18, delta) * 1.55;
  }
  lastAnimationTime = now;
  return animationPhase;
}

async function getRapier() {
  if (!rapierPromise) {
    rapierPromise = import(RAPIER_CDN_URL).then(async (module) => {
      const RAPIER = module.default || module;
      if (typeof RAPIER.init === "function") await RAPIER.init({});
      return RAPIER;
    });
  }
  return rapierPromise;
}

function createPhysicsCollider(RAPIER, world, body, object) {
  const physics = object.physics || {};
  const collider = physics.collider || object.shape || "ball";
  const restitution = physics.restitution ?? 0.55;
  const friction = physics.friction ?? 0.82;
  const height = object.height || object.radius * 2;
  const halfDepth = object.halfDepth || object.radius;
  const finish = (desc) => {
    if (typeof desc.setRestitution === "function") desc.setRestitution(restitution);
    if (typeof desc.setFriction === "function") desc.setFriction(friction);
    return world.createCollider(desc, body);
  };

  if (collider === "cuboid" || object.shape === "cube" || object.shape === "box") {
    return [finish(RAPIER.ColliderDesc.cuboid(object.radius, height * 0.5, halfDepth))];
  }
  if (collider === "cylinder" || object.shape === "cylinder") {
    return [finish(RAPIER.ColliderDesc.cylinder(height * 0.5, object.radius))];
  }
  if (collider === "capsule" || object.shape === "capsule") {
    if (typeof RAPIER.ColliderDesc.capsule === "function") {
      return [finish(RAPIER.ColliderDesc.capsule(Math.max(0.02, height * 0.5 - object.radius), object.radius))];
    }
    const bodyHalf = Math.max(0.0, height * 0.5 - object.radius);
    const colliders = [];
    colliders.push(finish(RAPIER.ColliderDesc.cylinder(bodyHalf, object.radius)));
    for (const y of [-bodyHalf, bodyHalf]) {
      const desc = RAPIER.ColliderDesc.ball(object.radius);
      if (typeof desc.setTranslation === "function") desc.setTranslation(0, y, 0);
      colliders.push(finish(desc));
    }
    return colliders;
  }
  if (collider === "hemisphere" || object.shape === "hemisphere") {
    const desc = RAPIER.ColliderDesc.ball(object.radius);
    if (typeof desc.setTranslation === "function") desc.setTranslation(0, object.radius * 0.5, 0);
    return [finish(desc)];
  }
  if (collider === "torus" || object.shape === "torus") {
    const colliders = [];
    const major = object.radius;
    const minor = Math.max(0.04, height * 0.5);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const desc = RAPIER.ColliderDesc.ball(minor);
      if (typeof desc.setTranslation === "function") {
        desc.setTranslation(Math.cos(angle) * major, 0, Math.sin(angle) * major);
      }
      colliders.push(finish(desc));
    }
    return colliders;
  }
  return [finish(RAPIER.ColliderDesc.ball(object.radius))];
}

function addFixedPhysicsBounds(RAPIER, world, preset) {
  const bounds = preset.bounds;
  const floorDepth = (bounds.floorZMax - bounds.floorZMin) * 0.5;
  const floorCenterZ = (bounds.floorZMax + bounds.floorZMin) * 0.5;
  const fixed = RAPIER.RigidBodyDesc.fixed();
  const ground = world.createRigidBody(fixed);
  const groundDesc = RAPIER.ColliderDesc.cuboid(bounds.floorX, 0.055, floorDepth).setTranslation(0, -0.055, floorCenterZ);
  groundDesc.setFriction(0.92);
  groundDesc.setRestitution(0.22);
  world.createCollider(groundDesc, ground);

  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const wallDesc = RAPIER.ColliderDesc.cuboid(bounds.floorX, bounds.wallHeight * 0.5, 0.055).setTranslation(
    0,
    bounds.wallHeight * 0.5,
    bounds.wallZ - 0.055,
  );
  wallDesc.setFriction(0.78);
  wallDesc.setRestitution(0.4);
  world.createCollider(wallDesc, wallBody);

  for (const side of [-1, 1]) {
    const sideBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const sideDesc = RAPIER.ColliderDesc.cuboid(0.055, bounds.wallHeight * 0.5, floorDepth).setTranslation(
      side * bounds.floorX,
      bounds.wallHeight * 0.5,
      floorCenterZ,
    );
    sideDesc.setFriction(0.78);
    sideDesc.setRestitution(0.38);
    world.createCollider(sideDesc, sideBody);
  }
}

async function resetPhysicsScene(preset) {
  try {
    const RAPIER = await getRapier();
    const gravity = preset.physics?.gravity || [0, -9.8, 0];
    const world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
    addFixedPhysicsBounds(RAPIER, world, preset);
    const bodies = preset.spheres.map((object) => {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(object.center[0], object.center[1], object.center[2]);
      const body = world.createRigidBody(bodyDesc);
      if (object.rotation && typeof body.setRotation === "function") {
        body.setRotation({ x: object.rotation[0], y: object.rotation[1], z: object.rotation[2], w: object.rotation[3] }, true);
      }
      if (object.physics?.linvel && typeof body.setLinvel === "function") {
        body.setLinvel({ x: object.physics.linvel[0], y: object.physics.linvel[1], z: object.physics.linvel[2] }, true);
      }
      if (object.physics?.angvel && typeof body.setAngvel === "function") {
        body.setAngvel({ x: object.physics.angvel[0], y: object.physics.angvel[1], z: object.physics.angvel[2] }, true);
      }
      createPhysicsCollider(RAPIER, world, body, object);
      return body;
    });
    physicsState = { sceneId: preset.id, world, bodies, elapsed: 0, failed: false };
  } catch (error) {
    console.warn("Rapier physics unavailable; using deterministic scene motion", error);
    physicsState = { sceneId: preset.id, world: null, bodies: [], elapsed: 0, failed: true };
  }
}

async function applyPhysicsScene(preset, baseObjects, settings) {
  if (!physicsState || physicsState.sceneId !== preset.id) {
    await resetPhysicsScene(preset);
  }
  if (!physicsState || physicsState.failed || !physicsState.world) {
    return baseObjects;
  }

  const dt = settings.animate ? Math.min(1 / 30, Math.max(1 / 240, lastAnimationDelta || 1 / 60)) : 0;
  if (settings.animate && dt > 0) {
    physicsState.world.timestep = dt;
    physicsState.world.step();
    physicsState.elapsed += dt;
  }

  const resetInterval = preset.physics?.resetInterval || 10;
  const shouldReset =
    physicsState.elapsed > resetInterval ||
    physicsState.bodies.some((body) => {
      const p = body.translation();
      return p.y < -2.5 || Math.abs(p.x) > preset.bounds.floorX + 1.5 || p.z < preset.bounds.floorZMin - 1.8;
    });

  if (shouldReset) {
    await resetPhysicsScene(preset);
  }

  return baseObjects.map((object, index) => {
    const body = physicsState.bodies[index];
    if (!body) return object;
    const translation = body.translation();
    const rotation = body.rotation();
    return {
      ...object,
      center: [translation.x, translation.y, translation.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    };
  });
}

function axisAngleQuat(axis, angle) {
  const n = normalize(axis);
  const h = angle * 0.5;
  const s = Math.sin(h);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(h)];
}

async function applyScene(settings, phase) {
  const preset = SCENES[settings.sceneId] || SCENES.studio;
  preset.id = settings.sceneId;
  camera.position = [...preset.camera.position];
  camera.target = [...preset.camera.target];
  camera.fov = preset.camera.fov;
  scene.lightRadiance = [...preset.lightRadiance];
  scene.floor = preset.floor;
  scene.wall = preset.wall;
  scene.bounds = preset.bounds;
  if (preset.room) {
    const spin = preset.room.spin || { axis: [0, 1, 0], speed: 0.15 };
    const angle = phase * (spin.speed ?? 0.15);
    scene.room = { ...preset.room, quat: axisAngleQuat(spin.axis || [0, 1, 0], angle) };
  } else {
    scene.room = null;
  }
  const baseObjects = preset.spheres.map((sphere, index) => {
    const motion = sphere.motion || [0, 0, 0];
    const wavePhase = phase * (sphere.speed || 1) + (sphere.phase || index * 1.7);
    const supportHeight =
      sphere.shape === "hemisphere"
        ? 0
        : sphere.shape === "cylinder" || sphere.shape === "cone" || sphere.shape === "capsule" || sphere.shape === "cube" || sphere.shape === "box"
          ? (sphere.height || sphere.radius * 2) * 0.5
          : sphere.radius;
    return {
      ...sphere,
      center: [
        sphere.center[0] + motion[0] * Math.sin(wavePhase),
        Math.max(supportHeight + 0.02, sphere.center[1] + motion[1] * Math.sin(wavePhase * 1.27 + 0.6)),
        sphere.center[2] + motion[2] * Math.cos(wavePhase * 0.91),
      ],
    };
  });
  scene.spheres = preset.physics ? await applyPhysicsScene(preset, baseObjects, settings) : baseObjects;
  return preset;
}

function panelVertices(panel) {
  const center = panel.center;
  const u = panel.u || [1, 0, 0];
  const v = panel.v || [0, 0, 1];
  const hu = panel.width * 0.5;
  const hv = panel.depth * 0.5;
  return [
    add(center, add(mul(u, -hu), mul(v, hv))),
    add(center, add(mul(u, -hu), mul(v, -hv))),
    add(center, add(mul(u, hu), mul(v, -hv))),
    add(center, add(mul(u, hu), mul(v, hv))),
  ];
}

function lightPanels(settings, preset, phase) {
  const speed = preset.lightSpeed || 1;
  const motion = preset.lightMotion || [0, 0, 0];
  const center = [
    preset.lightBase[0] + motion[0] * Math.sin(phase * speed),
    settings.lightHeight + motion[1] * Math.sin(phase * speed * 1.13 + 0.7),
    preset.lightBase[2] + motion[2] * Math.cos(phase * speed * 0.83),
  ];
  scene.lightCenter = center;
  const baseWidth = settings.lightWidth;
  const baseDepth = settings.lightDepth;
  const panels = (preset.lightPanels || [{ offset: [0, 0, 0], width: 1, depth: 1, radiance: preset.lightRadiance }])
    .slice(0, MAX_LIGHT_PANELS)
    .map((panel, index) => {
      const localPhase = phase * speed + (panel.phase || index * 1.37);
      const offset = panel.offset || [0, 0, 0];
      const offsetScale = panel.offsetScale === "world" ? [1, 1, 1] : [baseWidth * 0.5, 1, baseDepth * 0.5];
      const drift = panel.motion || [0.08, 0.04, 0.08];
      const u = normalize(panel.u || [1, 0, 0]);
      const v = normalize(panel.v || [0, 0, 1]);
      const panelCenter = [
        center[0] + offset[0] * offsetScale[0] + drift[0] * Math.sin(localPhase),
        center[1] + offset[1] + drift[1] * Math.sin(localPhase * 1.17 + 0.3),
        center[2] + offset[2] * offsetScale[2] + drift[2] * Math.cos(localPhase * 0.91),
      ];
      const built = {
        center: panelCenter,
        width: baseWidth * (panel.width || 1),
        depth: baseDepth * (panel.depth || 1),
        radiance: [...(panel.radiance || preset.lightRadiance)],
        u,
        v,
        normal: normalize(cross(u, v)),
      };
      built.vertices = panelVertices(built);
      return built;
    });
  scene.lightPanels = panels;
  scene.lightRadiance = [...panels[0].radiance];
  return panels;
}

function clipToHemisphere(dirs, normal) {
  if (!dirs.length) return [];

  const clipped = [];
  for (let i = 0; i < dirs.length; i++) {
    const current = dirs[i];
    const next = dirs[(i + 1) % dirs.length];
    const d0 = dot(current, normal);
    const d1 = dot(next, normal);
    const currentInside = d0 >= -1e-7;
    const nextInside = d1 >= -1e-7;

    if (currentInside) clipped.push(current);

    if (currentInside !== nextInside) {
      const t = d0 / (d0 - d1);
      const crossing = normalize(add(mul(current, 1 - t), mul(next, t)));
      clipped.push(crossing);
    }
  }

  return clipped.filter((v, index) => index === 0 || length(sub(v, clipped[index - 1])) > 1e-5);
}

function projectedSolidAngle(point, normal, vertices, shouldClip, panelCenter = scene.lightCenter, panelNormal = scene.lightNormal) {
  if (dot(panelNormal, sub(point, panelCenter)) <= 0) return 0;

  let dirs = vertices.map((vertex) => normalize(sub(vertex, point)));
  if (shouldClip) dirs = clipToHemisphere(dirs, normal);
  if (dirs.length < 3) return 0;

  let sum = 0;
  for (let i = 0; i < dirs.length; i++) {
    const a = dirs[i];
    const b = dirs[(i + 1) % dirs.length];
    const c = cross(a, b);
    const cLen = length(c);
    if (cLen < 1e-7) continue;
    const angle = Math.atan2(cLen, dot(a, b));
    sum += angle * dot(normal, mul(c, 1 / cLen));
  }

  return Math.max(0, -0.5 * sum);
}

function sampleQuadIrradiance(point, normal, settings, rng) {
  const total = [0, 0, 0];

  for (const panel of scene.lightPanels) {
    if (dot(panel.normal, sub(point, panel.center)) <= 0) continue;

    const area = panel.width * panel.depth;
    let e = 0;

    for (let i = 0; i < settings.samples; i++) {
      const sx = (random01(rng) - 0.5) * panel.width;
      const sy = (random01(rng) - 0.5) * panel.depth;
      const sample = add(panel.center, add(mul(panel.u, sx), mul(panel.v, sy)));

      const toLight = sub(sample, point);
      const r2 = Math.max(dot(toLight, toLight), 1e-6);
      const wi = mul(toLight, 1 / Math.sqrt(r2));
      const cosPoint = Math.max(0, dot(normal, wi));
      const cosLight = Math.max(0, dot(panel.normal, mul(wi, -1)));
      e += (cosPoint * cosLight * area) / r2;
    }

    e /= settings.samples;
    total[0] += panel.radiance[0] * e;
    total[1] += panel.radiance[1] * e;
    total[2] += panel.radiance[2] * e;
  }

  return total;
}

function analyticIrradiance(point, normal, panels, settings) {
  const total = [0, 0, 0];
  for (const panel of panels) {
    const omega = projectedSolidAngle(point, normal, panel.vertices, settings.horizonClip, panel.center, panel.normal);
    total[0] += panel.radiance[0] * omega;
    total[1] += panel.radiance[1] * omega;
    total[2] += panel.radiance[2] * omega;
  }
  return total;
}

function floorSolidAngle(settings) {
  return scene.lightPanels.reduce(
    (sum, panel) =>
      sum + projectedSolidAngle([0, 0.002, panel.center[2]], [0, 1, 0], panel.vertices, settings.horizonClip, panel.center, panel.normal),
    0,
  );
}

function indirectFill(point, normal, settings) {
  if (!settings.bounceFill) return [0, 0, 0];

  const up = clamp01(normal[1]);
  const down = clamp01(-normal[1]);
  const side = clamp01(1 - Math.abs(normal[1]));
  const nearWall = clamp01(1 - Math.abs(point[2] - scene.bounds.wallZ) / 3.2);
  const skyColor = [0.48, 0.58, 0.78];
  const floorColor = scene.floor.color;
  const wallColor = scene.wall.color;
  const skyStrength = 0.018 + 0.07 * up;
  const floorStrength = 0.024 + 0.078 * down;
  const wallStrength = 0.018 * side * (0.35 + 0.65 * nearWall);

  return [
    skyColor[0] * skyStrength + floorColor[0] * floorStrength + wallColor[0] * wallStrength,
    skyColor[1] * skyStrength + floorColor[1] * floorStrength + wallColor[1] * wallStrength,
    skyColor[2] * skyStrength + floorColor[2] * floorStrength + wallColor[2] * wallStrength,
  ];
}

function cameraBasis() {
  const forward = normalize(sub(camera.target, camera.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = normalize(cross(right, forward));
  return { forward, right, up };
}

function rayForPixel(x, y, width, height, basis) {
  const aspect = width / height;
  const fovScale = Math.tan((camera.fov * Math.PI) / 360);
  const px = (2 * ((x + 0.5) / width) - 1) * aspect * fovScale;
  const py = (1 - 2 * ((y + 0.5) / height)) * fovScale;
  return normalize(add(add(basis.forward, mul(basis.right, px)), mul(basis.up, py)));
}

function intersectSphere(origin, dir, sphere) {
  const oc = sub(origin, sphere.center);
  const b = dot(oc, dir);
  const c = dot(oc, oc) - sphere.radius * sphere.radius;
  const h = b * b - c;
  if (h < 0) return null;

  const root = Math.sqrt(h);
  let t = -b - root;
  if (t < 1e-4) t = -b + root;
  if (t < 1e-4) return null;

  const point = add(origin, mul(dir, t));
  return {
    t,
    point,
    normal: normalize(sub(point, sphere.center)),
    color: sphere.color,
    material: sphere.material || "diffuse",
    filmThickness: sphere.filmThickness || 0.42,
    ior: sphere.ior || 1.46,
  };
}

function objectHit(t, point, normal, object) {
  return {
    t,
    point,
    normal: normalize(normal),
    color: object.color,
    material: object.material || "diffuse",
    filmThickness: object.filmThickness || 0.42,
    ior: object.ior || 1.46,
  };
}

function intersectCylinder(origin, dir, object) {
  const rotation = object.rotation || [0, 0, 0, 1];
  const invRotation = quatConjugate(rotation);
  const localOrigin = rotateByQuat(sub(origin, object.center), invRotation);
  const localDir = rotateByQuat(dir, invRotation);
  const height = object.height || object.radius * 2;
  const bottom = -height * 0.5;
  const top = height * 0.5;
  const a = localDir[0] * localDir[0] + localDir[2] * localDir[2];
  const b = 2 * (localOrigin[0] * localDir[0] + localOrigin[2] * localDir[2]);
  const c = localOrigin[0] * localOrigin[0] + localOrigin[2] * localOrigin[2] - object.radius * object.radius;
  let best = null;

  if (a > 1e-7) {
    const h = b * b - 4 * a * c;
    if (h >= 0) {
      const root = Math.sqrt(h);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const y = localOrigin[1] + localDir[1] * t;
        if (t > 1e-4 && y >= bottom && y <= top) {
          const point = add(origin, mul(dir, t));
          const localPoint = add(localOrigin, mul(localDir, t));
          const hit = objectHit(t, point, rotateByQuat([localPoint[0], 0, localPoint[2]], rotation), object);
          if (!best || hit.t < best.t) best = hit;
        }
      }
    }
  }

  if (Math.abs(localDir[1]) > 1e-7) {
    for (const cap of [{ y: bottom, n: [0, -1, 0] }, { y: top, n: [0, 1, 0] }]) {
      const t = (cap.y - localOrigin[1]) / localDir[1];
      const localPoint = add(localOrigin, mul(localDir, t));
      const point = add(origin, mul(dir, t));
      const dx = localPoint[0];
      const dz = localPoint[2];
      if (t > 1e-4 && dx * dx + dz * dz <= object.radius * object.radius) {
        const hit = objectHit(t, point, rotateByQuat(cap.n, rotation), object);
        if (!best || hit.t < best.t) best = hit;
      }
    }
  }

  return best;
}

function intersectCone(origin, dir, object) {
  const height = object.height || object.radius * 2;
  const bottom = object.center[1] - height * 0.5;
  const top = object.center[1] + height * 0.5;
  const ox = origin[0] - object.center[0];
  const oz = origin[2] - object.center[2];
  const oy = origin[1] - bottom;
  const k = object.radius / height;
  const m0 = object.radius - k * oy;
  const a = dir[0] * dir[0] + dir[2] * dir[2] - k * k * dir[1] * dir[1];
  const b = 2 * (ox * dir[0] + oz * dir[2] + m0 * k * dir[1]);
  const c = ox * ox + oz * oz - m0 * m0;
  let best = null;

  if (Math.abs(a) > 1e-7) {
    const h = b * b - 4 * a * c;
    if (h >= 0) {
      const root = Math.sqrt(h);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const y = origin[1] + dir[1] * t;
        if (t > 1e-4 && y >= bottom && y <= top) {
          const point = add(origin, mul(dir, t));
          const localY = point[1] - bottom;
          const radiusAtY = object.radius - k * localY;
          const hit = objectHit(t, point, [point[0] - object.center[0], k * radiusAtY, point[2] - object.center[2]], object);
          if (!best || hit.t < best.t) best = hit;
        }
      }
    }
  }

  if (Math.abs(dir[1]) > 1e-7) {
    const t = (bottom - origin[1]) / dir[1];
    const point = add(origin, mul(dir, t));
    const dx = point[0] - object.center[0];
    const dz = point[2] - object.center[2];
    if (t > 1e-4 && dx * dx + dz * dz <= object.radius * object.radius) {
      best = objectHit(t, point, [0, -1, 0], object);
    }
  }

  return best;
}

function intersectBox(origin, dir, object) {
  const rotation = object.rotation || [0, 0, 0, 1];
  const invRotation = quatConjugate(rotation);
  const localOrigin = rotateByQuat(sub(origin, object.center), invRotation);
  const localDir = rotateByQuat(dir, invRotation);
  const half = [object.radius, (object.height || object.radius * 2) * 0.5, object.halfDepth || object.radius];
  let tMin = -Infinity;
  let tMax = Infinity;
  let normalAxis = 0;
  let normalSign = 1;

  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(localDir[axis]) < 1e-7) {
      if (Math.abs(localOrigin[axis]) > half[axis]) return null;
      continue;
    }
    const inv = 1 / localDir[axis];
    let t0 = (-half[axis] - localOrigin[axis]) * inv;
    let t1 = (half[axis] - localOrigin[axis]) * inv;
    let sign = -Math.sign(inv);
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      sign = -sign;
    }
    if (t0 > tMin) {
      tMin = t0;
      normalAxis = axis;
      normalSign = sign || 1;
    }
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }

  const t = tMin > 1e-4 ? tMin : tMax;
  if (t < 1e-4) return null;
  const point = add(origin, mul(dir, t));
  const localNormal = [0, 0, 0];
  localNormal[normalAxis] = normalSign;
  return objectHit(t, point, rotateByQuat(localNormal, rotation), object);
}

function torusDistance(localPoint, majorRadius, minorRadius) {
  const qx = Math.hypot(localPoint[0], localPoint[2]) - majorRadius;
  return Math.hypot(qx, localPoint[1]) - minorRadius;
}

function torusNormal(localPoint, majorRadius, minorRadius) {
  const eps = 0.0015;
  return normalize([
    torusDistance([localPoint[0] + eps, localPoint[1], localPoint[2]], majorRadius, minorRadius) -
      torusDistance([localPoint[0] - eps, localPoint[1], localPoint[2]], majorRadius, minorRadius),
    torusDistance([localPoint[0], localPoint[1] + eps, localPoint[2]], majorRadius, minorRadius) -
      torusDistance([localPoint[0], localPoint[1] - eps, localPoint[2]], majorRadius, minorRadius),
    torusDistance([localPoint[0], localPoint[1], localPoint[2] + eps], majorRadius, minorRadius) -
      torusDistance([localPoint[0], localPoint[1], localPoint[2] - eps], majorRadius, minorRadius),
  ]);
}

function intersectTorus(origin, dir, object) {
  const rotation = object.rotation || [0, 0, 0, 1];
  const invRotation = quatConjugate(rotation);
  const localOrigin = rotateByQuat(sub(origin, object.center), invRotation);
  const localDir = rotateByQuat(dir, invRotation);
  const majorRadius = object.radius;
  const minorRadius = Math.max(0.04, (object.height || object.radius * 0.34) * 0.5);
  let t = 0.02;

  for (let i = 0; i < 56 && t < 12; i++) {
    const localPoint = add(localOrigin, mul(localDir, t));
    const d = torusDistance(localPoint, majorRadius, minorRadius);
    if (d < 0.0015) {
      const point = add(origin, mul(dir, t));
      const normal = rotateByQuat(torusNormal(localPoint, majorRadius, minorRadius), rotation);
      return objectHit(t, point, normal, object);
    }
    t += Math.max(0.004, d * 0.82);
  }

  return null;
}

function intersectHemisphere(origin, dir, object) {
  const rotation = object.rotation || [0, 0, 0, 1];
  const invRotation = quatConjugate(rotation);
  const localOrigin = rotateByQuat(sub(origin, object.center), invRotation);
  const localDir = rotateByQuat(dir, invRotation);
  const radius = object.radius;
  const b = dot(localOrigin, localDir);
  const c = dot(localOrigin, localOrigin) - radius * radius;
  const h = b * b - c;
  let best = null;

  if (h >= 0) {
    const root = Math.sqrt(h);
    for (const t of [-b - root, -b + root]) {
      const localPoint = add(localOrigin, mul(localDir, t));
      if (t > 1e-4 && localPoint[1] >= 0) {
        const point = add(origin, mul(dir, t));
        const hit = objectHit(t, point, rotateByQuat(localPoint, rotation), object);
        if (!best || hit.t < best.t) best = hit;
      }
    }
  }

  if (Math.abs(localDir[1]) > 1e-7) {
    const t = -localOrigin[1] / localDir[1];
    const localPoint = add(localOrigin, mul(localDir, t));
    if (t > 1e-4 && localPoint[0] * localPoint[0] + localPoint[2] * localPoint[2] <= radius * radius) {
      const point = add(origin, mul(dir, t));
      const hit = objectHit(t, point, rotateByQuat([0, -1, 0], rotation), object);
      if (!best || hit.t < best.t) best = hit;
    }
  }

  return best;
}

function intersectCapsule(origin, dir, object) {
  const rotation = object.rotation || [0, 0, 0, 1];
  const invRotation = quatConjugate(rotation);
  const localOrigin = rotateByQuat(sub(origin, object.center), invRotation);
  const localDir = rotateByQuat(dir, invRotation);
  const radius = object.radius;
  const halfBody = Math.max(0, (object.height || radius * 2) * 0.5 - radius);
  let best = null;

  const a = localDir[0] * localDir[0] + localDir[2] * localDir[2];
  const b = 2 * (localOrigin[0] * localDir[0] + localOrigin[2] * localDir[2]);
  const c = localOrigin[0] * localOrigin[0] + localOrigin[2] * localOrigin[2] - radius * radius;
  if (a > 1e-7) {
    const h = b * b - 4 * a * c;
    if (h >= 0) {
      const root = Math.sqrt(h);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const localPoint = add(localOrigin, mul(localDir, t));
        if (t > 1e-4 && localPoint[1] >= -halfBody && localPoint[1] <= halfBody) {
          const point = add(origin, mul(dir, t));
          const hit = objectHit(t, point, rotateByQuat([localPoint[0], 0, localPoint[2]], rotation), object);
          if (!best || hit.t < best.t) best = hit;
        }
      }
    }
  }

  for (const cy of [-halfBody, halfBody]) {
    const sphereOrigin = [localOrigin[0], localOrigin[1] - cy, localOrigin[2]];
    const sb = dot(sphereOrigin, localDir);
    const sc = dot(sphereOrigin, sphereOrigin) - radius * radius;
    const sh = sb * sb - sc;
    if (sh < 0) continue;
    const root = Math.sqrt(sh);
    for (const t of [-sb - root, -sb + root]) {
      if (t <= 1e-4) continue;
      const localPoint = add(localOrigin, mul(localDir, t));
      const normal = [localPoint[0], localPoint[1] - cy, localPoint[2]];
      const point = add(origin, mul(dir, t));
      const hit = objectHit(t, point, rotateByQuat(normal, rotation), object);
      if (!best || hit.t < best.t) best = hit;
    }
  }

  return best;
}

function intersectObject(origin, dir, object) {
  if (object.shape === "cylinder") return intersectCylinder(origin, dir, object);
  if (object.shape === "cone") return intersectCone(origin, dir, object);
  if (object.shape === "box" || object.shape === "cube") return intersectBox(origin, dir, object);
  if (object.shape === "torus") return intersectTorus(origin, dir, object);
  if (object.shape === "hemisphere") return intersectHemisphere(origin, dir, object);
  if (object.shape === "capsule") return intersectCapsule(origin, dir, object);
  return intersectSphere(origin, dir, object);
}

function intersectScene(origin, dir) {
  let hit = null;
  const bounds = scene.bounds;

  if (dir[1] < -1e-4) {
    const t = -origin[1] / dir[1];
    const p = add(origin, mul(dir, t));
    if (t > 0 && Math.abs(p[0]) < bounds.floorX && p[2] > bounds.floorZMin && p[2] < bounds.floorZMax) {
      hit = { t, point: p, normal: [0, 1, 0], color: scene.floor.color, material: "diffuse" };
    }
  }

  if (dir[2] < -1e-4) {
    const t = (bounds.wallZ - origin[2]) / dir[2];
    const p = add(origin, mul(dir, t));
    if (t > 0 && Math.abs(p[0]) < bounds.floorX && p[1] > 0 && p[1] < bounds.wallHeight && (!hit || t < hit.t)) {
      hit = { t, point: p, normal: [0, 0, 1], color: scene.wall.color, material: "diffuse" };
    }
  }

  for (const object of scene.spheres) {
    const objectIntersection = intersectObject(origin, dir, object);
    if (objectIntersection && (!hit || objectIntersection.t < hit.t)) hit = objectIntersection;
  }

  for (const panel of scene.lightPanels) {
    const denom = dot(panel.normal, dir);
    if (Math.abs(denom) > 1e-4 && dot(panel.normal, mul(dir, -1)) > 0) {
      const t = dot(panel.normal, sub(panel.center, origin)) / denom;
      const p = add(origin, mul(dir, t));
      const local = sub(p, panel.center);
      const u = dot(local, panel.u);
      const v = dot(local, panel.v);
      if (t > 0 && Math.abs(u) < panel.width * 0.5 && Math.abs(v) < panel.depth * 0.5 && (!hit || t < hit.t)) {
        hit = { t, point: p, normal: panel.normal, color: [1, 0.9, 0.58], material: "emitter", emitter: true };
      }
    }
  }

  return hit;
}

function shade(hit, settings, vertices, variant, pixelSeed) {
  if (hit.emitter) return [8, 6.8, 3.8];

  const e =
    variant === "mc"
      ? sampleQuadIrradiance(hit.point, hit.normal, settings, { value: pixelSeed })
      : analyticIrradiance(hit.point, hit.normal, vertices, settings);

  const indirect = indirectFill(hit.point, hit.normal, settings);
  const lambert = 1 / Math.PI;
  return [
    hit.color[0] * (e[0] * lambert + indirect[0]),
    hit.color[1] * (e[1] * lambert + indirect[1]),
    hit.color[2] * (e[2] * lambert + indirect[2]),
  ];
}

function evalCost(hit, settings, variant) {
  if (!hit || hit.emitter) return 0;
  return variant === "mc" ? settings.samples : 1;
}

function thinFilmColor(hit, incomingDir) {
  const ior = hit.ior || 1.46;
  const thickness = hit.filmThickness || 0.42;
  const cosI = clamp01(dot(mul(incomingDir, -1), hit.normal));
  const sinT2 = Math.max(0, (1 - cosI * cosI) / (ior * ior));
  const cosT = Math.sqrt(Math.max(0, 1 - sinT2));
  const opticalPath = 2 * ior * thickness * cosT;
  const wavelengths = [0.65, 0.53, 0.46];
  return wavelengths.map((lambda, index) => {
    const phase = (2 * Math.PI * opticalPath) / lambda + index * 0.62;
    return clamp01(0.22 + 0.86 * (0.5 + 0.5 * Math.cos(phase)));
  });
}

function radianceForHit(hit, incomingDir, settings, vertices, variant, pixelSeed, depth) {
  if (!hit) return { color: background(incomingDir), evals: 0 };
  if (hit.emitter) return { color: [8, 6.8, 3.8], evals: 0 };

  if (hit.material === "mirror" || hit.material === "thinfilm") {
    if (depth <= 0) {
      return { color: background(reflect(incomingDir, hit.normal)), evals: 0 };
    }

    const reflectedDir = reflect(incomingDir, hit.normal);
    const reflectedOrigin = madd(hit.point, hit.normal, 0.004);
    const reflectedHit = intersectScene(reflectedOrigin, reflectedDir);
    const traced = reflectedHit
      ? radianceForHit(reflectedHit, reflectedDir, settings, vertices, variant, pixelSeed ^ 0x9e3779b9, depth - 1)
      : { color: background(reflectedDir), evals: 0 };
    const fresnel = 0.82 + 0.16 * Math.pow(1 - clamp01(dot(mul(incomingDir, -1), hit.normal)), 5);
    const film = hit.material === "thinfilm" ? thinFilmColor(hit, incomingDir) : [1, 1, 1];
    return {
      color: [
        hit.color[0] * film[0] * traced.color[0] * fresnel,
        hit.color[1] * film[1] * traced.color[1] * fresnel,
        hit.color[2] * film[2] * traced.color[2] * fresnel,
      ],
      evals: traced.evals,
    };
  }

  return {
    color: shade(hit, settings, vertices, variant, pixelSeed),
    evals: evalCost(hit, settings, variant),
  };
}

function toneMap(color, exposure) {
  return color.map((c) => {
    const x = Math.max(0, c * exposure);
    const mapped = 1 - Math.exp(-x);
    return Math.pow(mapped, 1 / 2.2);
  });
}

function falseColor(color, exposure) {
  const lum = (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) * exposure;
  const t = clamp01(lum * 0.52);
  const low = [0.02, 0.12, 0.28];
  const mid = [0.08, 0.68, 0.62];
  const high = [1, 0.76, 0.16];
  const hot = [1, 0.19, 0.16];
  if (t < 0.5) {
    const u = t / 0.5;
    return [mix(low[0], mid[0], u), mix(low[1], mid[1], u), mix(low[2], mid[2], u)];
  }
  if (t < 0.82) {
    const u = (t - 0.5) / 0.32;
    return [mix(mid[0], high[0], u), mix(mid[1], high[1], u), mix(mid[2], high[2], u)];
  }
  const u = (t - 0.82) / 0.18;
  return [mix(high[0], hot[0], u), mix(high[1], hot[1], u), mix(high[2], hot[2], u)];
}

function background(dir) {
  const t = clamp01(0.5 + 0.5 * dir[1]);
  return [mix(0.64, 0.88, t), mix(0.73, 0.9, t), mix(0.84, 0.98, t)];
}

function drawGuide(width, height, data, split) {
  const x = Math.floor(width * split);
  for (let y = 0; y < height; y++) {
    const offset = (y * width + x) * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
}

function showError(message) {
  if (!errorBanner) {
    errorBanner = document.createElement("div");
    errorBanner.id = "errorBanner";
    errorBanner.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:99999;background:#7a1620;color:#fff;" +
      "font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;padding:8px 12px;white-space:pre-wrap;";
    document.body.appendChild(errorBanner);
  }
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function hideError() {
  if (errorBanner) errorBanner.style.display = "none";
}

function render() {
  renderHalted = false;
  consecutiveFailures = 0;
  clearTimeout(frameHandle);
  const version = ++renderVersion;
  frameHandle = setTimeout(() => {
    if (version !== renderVersion) return;
    renderFrame(version);
  }, 0);
}

async function renderFrame(version) {
  if (renderInFlight) {
    renderQueued = true;
    return;
  }

  renderInFlight = true;
  let errored = false;
  try {
    const frameSelection = selectionEpoch;
    const settings = readSettings();
    const phase = advanceAnimation(settings);
    settings.mediumTime = advanceMediumClock(settings);
    settings.groundTime = phase / 1.55;
    const activeScene = await applyScene(settings, phase);
    if (selectionEpoch !== frameSelection) return;
    updateOutputs(settings);

    const { width, height } = applyRenderScale(settings);
    const frameStart = performance.now();
    const previousFrameStart = lastFrameStartTime;
    const cadenceFps = previousFrameStart > 0 ? 1000 / Math.max(1, frameStart - previousFrameStart) : 0;
    lastFrameStartTime = frameStart;
    const panels = lightPanels(settings, activeScene, phase);
    if (panels[0]) ltcInspector.update({ sceneId: settings.sceneId, animate: settings.animate, camera: camera.position, roughness: settings.sceneId === "garage" ? settings.floorRoughness : (scene.floor.roughness ?? 1), vertices: panels[0].vertices, lightNormal: panels[0].normal, lightCenter: panels[0].center });

    if (settings.backend === "webgpu") {
      const gpuFrame = await renderWebGpuFrame(settings, width, height);
      if (selectionEpoch !== frameSelection) return;
      if (gpuFrame?.pending) {
        outputs.timeMetric.textContent = "Compiling GPU";
        outputs.timeMetric.title = "The selected shader is still compiling; this is not a backend failure.";
        return;
      }
      if (gpuFrame) {
        updatePresentation(settings, "webgpu");
        lastFrameMs = performance.now() - frameStart;
        const submitMs = gpuFrame.backendMs + gpuFrame.displayMs;
        outputs.timeMetric.textContent = `${submitMs < 1 ? "<1 ms" : formatMs(submitMs)} submit`;
        outputs.timeMetric.title = "CPU cost to submit compute and presentation commands; GPU execution is not timed.";
        outputs.frameFpsLabel.textContent = cadenceFps > 0 ? cadenceFps.toFixed(1) : "warming";
        outputs.backendFrameLabel.textContent = formatMs(gpuFrame.backendMs);
        outputs.displayFrameLabel.textContent = formatMs(gpuFrame.displayMs);
        outputs.displayBackendLabel.textContent = "WebGPU shader";
        outputs.hitCount.textContent = "GPU";
        outputs.evalCount.textContent = estimateEvalCount(settings, width, height).toLocaleString();

        const rendererStats = {
          min: null,
          max: null,
          brightPixels: null,
          topLum: null,
          midLum: null,
          bottomLum: null,
          floorOmega: Number(
            floorSolidAngle(settings).toFixed(5),
          ),
          avgDeltaLum: null,
          splitPosition: Number(splitPosition.toFixed(3)),
          sceneId: settings.sceneId,
          frameMs: Number(lastFrameMs.toFixed(2)),
          backendMs: Number(gpuFrame.backendMs.toFixed(2)),
          displayMs: Number(gpuFrame.displayMs.toFixed(2)),
          frameFps: cadenceFps > 0 ? Number(cadenceFps.toFixed(2)) : 0,
          displayBackend: "webgpu-shader",
          renderScale: settings.renderScale,
          aaSamples: settings.aaSamples,
          resolution: [width, height],
          hitCount: null,
          evalCount: estimateEvalCount(settings, width, height),
        };
        window.__analyticalRendererStats = rendererStats;
        document.documentElement.dataset.rendererStats = JSON.stringify(rendererStats);
        return;
      }
      switchBackend("wasm", { reason: "WebGPU could not render this frame. Opened the WASM diffuse reference." });
      renderQueued = true;
      return;
    }

    if (settings.backend === "wasm") {
      const wasmFrame = await renderWasmFrame(settings, width, height);
      if (selectionEpoch !== frameSelection) return;
      if (wasmFrame) {
        updatePresentation(settings, "wasm");
        lastFrameMs = performance.now() - frameStart;
        outputs.timeMetric.textContent = `${formatMs(wasmFrame.backendMs + wasmFrame.displayMs)} CPU`;
        outputs.timeMetric.title = "CPU frame production plus upload/presentation submission; GPU execution is not timed.";
        outputs.frameFpsLabel.textContent = cadenceFps > 0 ? cadenceFps.toFixed(1) : "warming";
        outputs.backendFrameLabel.textContent = formatMs(wasmFrame.backendMs);
        outputs.displayFrameLabel.textContent = formatMs(wasmFrame.displayMs);
        outputs.displayBackendLabel.textContent = webgpuUnavailable ? "Canvas2D (WASM)" : "WASM -> WebGPU";
        outputs.hitCount.textContent = Math.round(wasmFrame.hitCount).toLocaleString();
        outputs.evalCount.textContent = Math.round(wasmFrame.evalCount).toLocaleString();

        const rendererStats = {
          min: wasmFrame.min,
          max: wasmFrame.max,
          brightPixels: wasmFrame.brightPixels,
          topLum: null,
          midLum: null,
          bottomLum: null,
          floorOmega: Number(
            floorSolidAngle(settings).toFixed(5),
          ),
          avgDeltaLum: null,
          splitPosition: Number(splitPosition.toFixed(3)),
          sceneId: settings.sceneId,
          frameMs: Number(lastFrameMs.toFixed(2)),
          backendMs: Number(wasmFrame.backendMs.toFixed(2)),
          displayMs: Number(wasmFrame.displayMs.toFixed(2)),
          frameFps: cadenceFps > 0 ? Number(cadenceFps.toFixed(2)) : 0,
          displayBackend: "wasm-webgpu-upload",
          renderScale: settings.renderScale,
          aaSamples: settings.aaSamples,
          resolution: [width, height],
          hitCount: Math.round(wasmFrame.hitCount),
          evalCount: Math.round(wasmFrame.evalCount),
        };
        window.__analyticalRendererStats = rendererStats;
        document.documentElement.dataset.rendererStats = JSON.stringify(rendererStats);
        return;
      }
      switchBackend("js", { reason: "The WASM module could not render this frame. Opened the JavaScript diffuse reference." });
      renderQueued = true;
      return;
    }

    const backendStart = performance.now();
    const data = new Uint8Array(width * height * 4);
    const basis = cameraBasis();
    const splitX = Math.floor(width * splitPosition);
    let hitCount = 0;
    let evalCount = 0;

    const frameStats = {
      min: 255,
      max: 0,
      brightPixels: 0,
      topLum: 0,
      midLum: 0,
      bottomLum: 0,
      topCount: 0,
      midCount: 0,
      bottomCount: 0,
      deltaLum: 0,
      deltaCount: 0,
      floorOmega: floorSolidAngle(settings),
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dir = rayForPixel(x, y, width, height, basis);
        const hit = intersectScene(camera.position, dir);
        const offset = (y * width + x) * 4;

        let color;
        if (hit) {
          hitCount++;
          const pixelSeed = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
          if (settings.mode === "split") {
            const analyticTrace = radianceForHit(hit, dir, settings, panels, "analytic", pixelSeed || 1, 1);
            const mcTrace = radianceForHit(hit, dir, settings, panels, "mc", pixelSeed || 1, 1);
            const analyticColor = analyticTrace.color;
            const mcColor = mcTrace.color;
            color = x <= splitX ? analyticColor : mcColor;
            if (!hit.emitter) {
              evalCount += analyticTrace.evals + mcTrace.evals;
              const analyticLum = 0.2126 * analyticColor[0] + 0.7152 * analyticColor[1] + 0.0722 * analyticColor[2];
              const mcLum = 0.2126 * mcColor[0] + 0.7152 * mcColor[1] + 0.0722 * mcColor[2];
              frameStats.deltaLum += Math.abs(analyticLum - mcLum);
              frameStats.deltaCount++;
            }
          } else if (settings.mode === "mc") {
            const traced = radianceForHit(hit, dir, settings, panels, "mc", pixelSeed || 1, 1);
            color = traced.color;
            evalCount += traced.evals;
          } else {
            const traced = radianceForHit(hit, dir, settings, panels, "analytic", pixelSeed || 1, 1);
            color = traced.color;
            evalCount += traced.evals;
          }
        } else {
          color = background(dir);
        }

        const mapped = settings.showFalseColor ? falseColor(color, settings.exposure) : toneMap(color, settings.exposure);
        const r = Math.round(clamp01(mapped[0]) * 255);
        const g = Math.round(clamp01(mapped[1]) * 255);
        const b = Math.round(clamp01(mapped[2]) * 255);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;

        frameStats.min = Math.min(frameStats.min, r, g, b);
        frameStats.max = Math.max(frameStats.max, r, g, b);
        if (r + g + b > 540) frameStats.brightPixels++;
        if (y < height / 3) {
          frameStats.topLum += lum;
          frameStats.topCount++;
        } else if (y < (height * 2) / 3) {
          frameStats.midLum += lum;
          frameStats.midCount++;
        } else {
          frameStats.bottomLum += lum;
          frameStats.bottomCount++;
        }
      }
    }

    if (settings.mode === "split") drawGuide(width, height, data, splitPosition);

    const backendMs = performance.now() - backendStart;
    const displayStart = performance.now();
    await presentFrame(data, width, height);
    const displayMs = performance.now() - displayStart;

    lastFrameMs = performance.now() - frameStart;
    outputs.timeMetric.textContent = `${formatMs(backendMs + displayMs)} CPU`;
    outputs.timeMetric.title = "CPU frame production plus upload/presentation submission; GPU execution is not timed.";
    outputs.frameFpsLabel.textContent = cadenceFps > 0 ? cadenceFps.toFixed(1) : "warming";
    outputs.backendFrameLabel.textContent = formatMs(backendMs);
    outputs.displayFrameLabel.textContent = formatMs(displayMs);
    updatePresentation(settings, "js");
    outputs.displayBackendLabel.textContent = webgpuUnavailable
      ? "Canvas2D (JS)"
      : presenter?.rendererDeferred?.has("generic")
          ? "JS (GPU compiling)"
          : "JS -> WebGPU";
    outputs.hitCount.textContent = hitCount.toLocaleString();
    outputs.evalCount.textContent = evalCount.toLocaleString();
    const rendererStats = {
      min: frameStats.min,
      max: frameStats.max,
      brightPixels: frameStats.brightPixels,
      topLum: Math.round(frameStats.topLum / frameStats.topCount),
      midLum: Math.round(frameStats.midLum / frameStats.midCount),
      bottomLum: Math.round(frameStats.bottomLum / frameStats.bottomCount),
      floorOmega: Number(frameStats.floorOmega.toFixed(5)),
      avgDeltaLum: Number((frameStats.deltaLum / Math.max(1, frameStats.deltaCount)).toFixed(5)),
      splitPosition: Number(splitPosition.toFixed(3)),
      sceneId: settings.sceneId,
      frameMs: Number(lastFrameMs.toFixed(2)),
      backendMs: Number(backendMs.toFixed(2)),
      displayMs: Number(displayMs.toFixed(2)),
      frameFps: cadenceFps > 0 ? Number(cadenceFps.toFixed(2)) : 0,
      displayBackend: webgpuUnavailable ? "canvas2d-js" : "webgpu-upload-js",
      renderScale: settings.renderScale,
      aaSamples: settings.aaSamples,
      resolution: [width, height],
      hitCount,
      evalCount,
    };
    window.__analyticalRendererStats = rendererStats;
    document.documentElement.dataset.rendererStats = JSON.stringify(rendererStats);
  } catch (error) {
    errored = true;
    const message = error && error.message ? error.message : String(error);
    outputs.timeMetric.textContent = "Render error";
    outputs.displayBackendLabel.textContent = "WebGPU error";
    console.error(error);
    consecutiveFailures = consecutiveFailures + 1;
    if (consecutiveFailures >= 3) {
      renderHalted = true;
      cancelAnimationFrame(animationTimer);
      animationTimer = 0;
      showError(
        "Rendering halted after " +
          consecutiveFailures +
          " consecutive failures.\nLast error: " +
          message +
          "\nIf this persists, fully quit and reopen the browser (the GPU process may be wedged), then reload.",
      );
    } else {
      showError("Render error: " + message);
    }
  } finally {
    renderInFlight = false;
    if (!errored) {
      consecutiveFailures = 0;
      hideError();
    }
    if (renderQueued && !errored && !renderHalted) {
      renderQueued = false;
      render();
    }
  }
}

function scheduleAnimationLoop() {
  cancelAnimationFrame(animationTimer);
  const settings = readSettings();
  if (!animationActive(settings)) return;

  const targetDelay = 1000 / Math.max(1, settings.targetFps);
  let lastTick = 0;
  const tick = (now) => {
    if (renderHalted) {
      animationTimer = 0;
      return;
    }
    const liveSettings = readSettings();
    if (!animationActive(liveSettings)) {
      animationTimer = 0;
      return;
    }

    const liveDelay = 1000 / Math.max(1, liveSettings.targetFps);
    if (!lastTick || now - lastTick >= liveDelay) {
      lastTick = now;
      renderFrame(++renderVersion);
    }

    animationTimer = requestAnimationFrame(tick);
  };
  animationTimer = requestAnimationFrame((now) => {
    lastTick = now - targetDelay;
    tick(now);
  });
}

function setSplitFromPointer(event) {
  const rect = canvasWrap.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  splitPosition = Math.max(0.08, Math.min(0.92, localX / Math.max(1, rect.width)));
  canvasWrap.style.setProperty("--split", `${(splitPosition * 100).toFixed(2)}%`);
  render();
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const modeInput = controls.mode.find((input) => input.value === mode);
  if (modeInput) modeInput.checked = true;

  const backend = params.get("backend");
  const backendInput = controls.backend.find((input) => input.value === backend);
  if (backendInput) backendInput.checked = true;

  const sceneId = params.get("scene");
  selectExperiment(sceneId && SCENES[sceneId] ? sceneId : controls.sceneSelect.value);

  if (params.has("scale")) {
    const scale = Number(params.get("scale"));
    if (Number.isFinite(scale)) {
      controls.renderScale.value = String(Math.max(Number(controls.renderScale.min), Math.min(Number(controls.renderScale.max), scale)));
    }
  }

  if (params.has("fps")) {
    const fps = Number(params.get("fps"));
    if (Number.isFinite(fps)) {
      controls.targetFps.value = String(Math.max(Number(controls.targetFps.min), Math.min(Number(controls.targetFps.max), fps)));
    }
  }

  if (params.has("aa")) {
    const aa = Number(params.get("aa"));
    if (Number.isFinite(aa)) {
      controls.aaSamples.value = String(Math.max(Number(controls.aaSamples.min), Math.min(Number(controls.aaSamples.max), Math.round(aa))));
    }
  }

  if (params.has("split")) {
    const split = Number(params.get("split"));
    if (Number.isFinite(split)) {
      splitPosition = Math.max(0.08, Math.min(0.92, split));
    }
  }

  if (params.get("animate") === "0") {
    controls.animate.checked = false;
  }

  if (params.get("fill") === "0") {
    controls.bounceFill.checked = false;
  }
}

function formatMs(ms) {
  return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
}

async function getPresenter() {
  if (presenter) return presenter;
  if (!navigator.gpu) throw new Error("WebGPU is required for presentation");

  const gpuApi = navigator.gpu;
  let adapter = await gpuApi.requestAdapter();
  if (!adapter) {
    adapter = await gpuApi.requestAdapter({ forceFallbackAdapter: true });
  }
  if (!adapter) throw new Error("No WebGPU adapter is available");

  const device = await adapter.requestDevice();

  // The adapter and gpu instance are retained on the presenter below: a strict
  // WebGPU implementation will garbage-collect an unreferenced adapter/instance
  // and invalidate the device ("A valid external Instance reference no longer
  // exists"), which silently blanks every backend since they all present via
  // WebGPU. If the device is lost anyway (driver reset, GPU process crash, a
  // frame overrunning the OS watchdog), drop the cached presenter so the next
  // frame re-acquires a fresh device instead of presenting through a dead one.
  device.lost.then((info) => {
    if (info && info.reason === "destroyed") return;
    const message = `WebGPU device lost (${info.reason || "unknown"}): ${info.message}`;
    console.error(message);
    showError(message + "\nReload the page to recover.");
  });
  if (typeof device.addEventListener === "function") {
    device.addEventListener("uncapturederror", (event) => {
      const detail = event.error && event.error.message ? event.error.message : String(event.error);
      console.error("WebGPU uncaptured error:", detail);
      showError("WebGPU error: " + detail);
    });
  }

  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const shader = device.createShaderModule({
    code: `
struct VertexOut {
  @builtin(position) position: vec4<f32>,
};

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: VertexOut;
  out.position = vec4<f32>(positions[index], 0.0, 1.0);
  return out;
}

@fragment
fn fs(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let dims = textureDimensions(sourceTexture);
  let xy = clamp(vec2<i32>(position.xy), vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
  return textureLoad(sourceTexture, xy, 0);
}`,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shader, entryPoint: "vs" },
    fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
  });

  presenter = {
    adapter,
    gpu: gpuApi,
    bindGroup: null,
    context,
    device,
    format,
    height: 0,
    pipeline,
    rendererBindGroups: new Map(),
    rendererDeferred: new Set(),
    rendererPipelines: new Map(),
    rendererPipelinePromises: new Map(),
    paramsBuffer: null,
    spheresBuffer: null,
    ltcMatrixTexture: null,
    ltcAmplitudeTexture: null,
    ltcSampler: null,
    sourceTexture: null,
    width: 0,
  };
  return presenter;
}

function configurePresenterCanvas(gpu, width, height) {
  if (gpu.width === width && gpu.height === height && gpu.sourceTexture) return;

  if (gpu.sourceTexture) gpu.sourceTexture.destroy();
  gpu.width = width;
  gpu.height = height;
  canvas.width = width;
  canvas.height = height;
  gpu.context.configure({ device: gpu.device, format: gpu.format, alphaMode: "opaque" });
  gpu.sourceTexture = gpu.device.createTexture({
    size: [width, height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
  });
  gpu.bindGroup = gpu.device.createBindGroup({
    layout: gpu.pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: gpu.sourceTexture.createView() }],
  });
  gpu.rendererBindGroups.clear();
}

// Canvas2D fallback: when WebGPU presentation is unavailable (no adapter, lost
// device, crashed GPU process, or forced off via ?nogpu), the CPU backends
// (JS/WASM) still produce an RGBA pixel buffer, which we can blit straight to a
// 2D canvas. This decouples the renderer from a healthy WebGPU device.
function ensureFallback2D(width, height) {
  if (!fallback2dCtx) {
    // If WebGPU never claimed the main canvas, draw 2D onto it directly so it
    // keeps the existing canvas styling; otherwise use a sibling canvas.
    const direct = canvas.getContext("2d");
    if (direct) {
      fallbackCanvas = canvas;
      fallback2dCtx = direct;
    } else {
      fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.id = "renderCanvasFallback";
      fallbackCanvas.className = canvas.className;
      canvas.style.display = "none";
      canvas.parentNode.insertBefore(fallbackCanvas, canvas.nextSibling);
      fallback2dCtx = fallbackCanvas.getContext("2d");
    }
  }
  if (fallbackCanvas.width !== width || fallbackCanvas.height !== height) {
    fallbackCanvas.width = width;
    fallbackCanvas.height = height;
  }
  return fallback2dCtx;
}

function present2D(data, width, height) {
  const start = performance.now();
  const ctx = ensureFallback2D(width, height);
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.set(data.subarray(0, width * height * 4));
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return performance.now() - start;
}

async function presentFrame(data, width, height) {
  if (!webgpuUnavailable) {
    try {
      const gpu = await getPresenter();
      configurePresenterCanvas(gpu, width, height);
      const rowBytes = width * 4;
      const alignedRowBytes = Math.ceil(rowBytes / 256) * 256;
      let uploadData = data;

      if (alignedRowBytes !== rowBytes) {
        uploadData = new Uint8Array(alignedRowBytes * height);
        for (let y = 0; y < height; y++) {
          uploadData.set(data.subarray(y * rowBytes, y * rowBytes + rowBytes), y * alignedRowBytes);
        }
      }

      gpu.device.queue.writeTexture(
        { texture: gpu.sourceTexture },
        uploadData,
        { bytesPerRow: alignedRowBytes, rowsPerImage: height },
        { width, height },
      );

      return await drawPresentedTexture(gpu);
    } catch (error) {
      webgpuUnavailable = true;
      console.warn("WebGPU presentation unavailable; using Canvas2D fallback", error);
      showError(
        "WebGPU is unavailable in this browser, so the renderer switched to a Canvas2D fallback (CPU backends only).\n" +
          "For best speed pick the WASM backend. Original error: " +
          (error && error.message ? error.message : String(error)),
      );
    }
  }

  outputs.displayBackendLabel.textContent = "Canvas2D (CPU)";
  return present2D(data, width, height);
}

async function drawPresentedTexture(gpu) {
  const start = performance.now();
  const encoder = gpu.device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: gpu.context.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.025, b: 0.03, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(gpu.pipeline);
  pass.setBindGroup(0, gpu.bindGroup);
  pass.draw(3);
  pass.end();

  gpu.device.queue.submit([encoder.finish()]);
  return performance.now() - start;
}

function estimateEvalCount(settings, width, height) {
  const pixels = width * height;
  const lights = Math.max(1, scene.lightPanels.length);
  const aa = settings.aaSamples || 1;
  if (settings.sceneId === "garage") {
    const diagnostic = settings.materialView >= 1 && settings.materialView <= 3;
    if (diagnostic) return 0;
    const rays = settings.aperture > 0 ? Math.max(aa, 8) : aa;
    const sampledFraction = settings.mode === "mc" ? 1 : settings.mode === "split" ? (width - Math.min(width, Math.floor(splitPosition * width) + 1)) / width : 0;
    // Per-lobe workload estimate: excludes misses and material-dependent lobe counts.
    return Math.round(pixels * rays * lights * ((1 - sampledFraction) + sampledFraction * settings.samples));
  }
  if (settings.mode === "mc") return pixels * settings.samples * lights * aa;
  if (settings.mode === "split") return pixels * (settings.samples + 1) * lights * aa;
  return pixels * lights * aa;
}

function buildGpuRendererParams(settings, width, height) {
  const basis = cameraBasis();
  const params = new Float32Array(GPU_PARAM_COUNT);
  params[0] = width;
  params[1] = height;
  params[2] = settings.mode === "mc" ? 1 : settings.mode === "split" ? 2 : 0;
  params[3] = settings.samples;
  params[4] = splitPosition;
  params[5] = settings.exposure;
  params[6] = settings.horizonClip ? 1 : 0;
  params[7] = settings.bounceFill ? 1 : 0;
  params[8] = settings.showFalseColor ? 1 : 0;
  params[9] = seed & 0xffffff;
  params[10] = settings.lightWidth;
  params[11] = settings.lightDepth;
  params[12] = camera.position[0];
  params[13] = camera.position[1];
  params[14] = camera.position[2];
  params[15] = Math.tan((camera.fov * Math.PI) / 360);
  params[16] = basis.right[0];
  params[17] = basis.right[1];
  params[18] = basis.right[2];
  params[19] = basis.up[0];
  params[20] = basis.up[1];
  params[21] = basis.up[2];
  params[22] = basis.forward[0];
  params[23] = basis.forward[1];
  params[24] = basis.forward[2];
  params[25] = scene.lightCenter[0];
  params[26] = scene.lightCenter[1];
  params[27] = scene.lightCenter[2];
  params[28] = scene.lightRadiance[0];
  params[29] = scene.lightRadiance[1];
  params[30] = scene.lightRadiance[2];
  params[31] = scene.floor.color[0];
  params[32] = scene.floor.color[1];
  params[33] = scene.floor.color[2];
  params[34] = scene.wall.color[0];
  params[35] = scene.wall.color[1];
  params[36] = scene.wall.color[2];
  params[37] = scene.bounds.floorX;
  params[38] = scene.bounds.floorZMin;
  params[39] = scene.bounds.floorZMax;
  params[40] = scene.bounds.wallZ;
  params[41] = scene.bounds.wallHeight;
  params[42] = Math.min(MAX_GPU_OBJECTS, scene.spheres.length);
  params[43] = Math.min(MAX_LIGHT_PANELS, scene.lightPanels.length);
  params[77] = settings.sceneId === "garage" ? (settings.materialView || 0) : 0;
  params[78] = settings.normalStrength ?? 1;
  params[79] = settings.coatWeight ?? 1;
  params[80] = settings.blendStrength ?? 1;
  params[81] = settings.textureScale ?? 1;
  params[82] = settings.sceneId === "garage" ? (settings.mediumDensity ?? 0) : 0;
  params[83] = settings.mediumMode ?? 1;
  params[84] = settings.mediumAlbedo ?? .85;
  params[85] = settings.mediumFrequency ?? 1;
  params[86] = settings.mediumTime ?? 0;
  params[87] = settings.mediumSteps ?? 20;
  params[88] = settings.groundFlow ?? 0;
  params[89] = settings.lightFrame === false ? 0 : 1;
  params[90] = settings.mediumOnly ? 1 : 0;
  params[91] = settings.groundTime ?? 0;
  params[92] = settings.sceneId === "garage" && settings.extraFancy ? 1 : 0;
  params[112] = materialId(scene.floor.material);
  params[113] = materialId(scene.wall.material);
  params[114] = settings.sceneId === "garage" ? (settings.floorRoughness ?? scene.floor.roughness ?? 1) : (scene.floor.roughness ?? 1);
  params[115] = scene.wall.roughness ?? 1;
  params[116] = scene.floor.normalScale || 0;
  params[117] = scene.wall.normalScale || 0;
  params[118] = patternId(scene.floor.pattern);
  params[119] = patternId(scene.wall.pattern);
  params[120] = scene.floor.metalness || 0;
  params[121] = scene.wall.metalness || 0;
  params[122] = settings.aaSamples || 1;
  params[123] = scene.floor.displacementScale || 0;
  params[124] = scene.wall.displacementScale || 0;
  params[125] = settings.aperture || 0; // DOF aperture radius (0 = pinhole)
  params[126] = settings.focusDistance || 4; // DOF focus distance
  params[127] = 8; // DOF lens sample count (GPU)
  const room = scene.room;
  params[44] = room ? 1 : 0;
  if (room) {
    const rq = room.quat || [0, 0, 0, 1];
    params[45] = rq[0];
    params[46] = rq[1];
    params[47] = rq[2];
    params[48] = rq[3];
    params[49] = room.halfExtents[0];
    params[50] = room.halfExtents[1];
    params[51] = room.halfExtents[2];
    params[52] = room.center[0];
    params[53] = room.center[1];
    params[54] = room.center[2];
    const f = room.faces;
    const setFace = (o, c) => {
      params[o] = c[0];
      params[o + 1] = c[1];
      params[o + 2] = c[2];
    };
    setFace(55, f.px);
    setFace(58, f.nx);
    setFace(61, f.py);
    setFace(64, f.ny);
    setFace(67, f.pz);
    setFace(70, f.nz);
    params[73] = room.roughness ?? 0.5;
    params[74] = materialId(room.material);
    params[75] = patternId(room.pattern);
    params[76] = room.normalScale || 0;
  }
  // Light data lives in its own buffer (buildGpuLightData), not in params.
  return params;
}

function materialId(material) {
  if (material === "mirror") return 1;
  if (material === "thinfilm") return 2;
  if (material === "roughmetal") return 3;
  if (material === "coated") return 4;
  if (material === "carpaint") return 5;
  if (material === "paper") return 6;
  if (material === "brushedmetal") return 7;
  if (material === "roughglass") return 8;
  if (material === "glass") return 9;
  return 0;
}

function patternId(pattern) {
  if (pattern === "brushed") return 1;
  if (pattern === "panel") return 2;
  if (pattern === "noise") return 3;
  if (pattern === "waves") return 4;
  if (pattern === "cellular") return 5;
  if (pattern === "crisp") return 6;
  if (pattern === "fbm") return 7;
  if (pattern === "tile") return 8;
  if (pattern === "flakes") return 9;
  return 0;
}

function shapeId(shape) {
  if (shape === "cylinder") return 1;
  if (shape === "cone") return 2;
  if (shape === "box" || shape === "cube") return 3;
  if (shape === "torus") return 4;
  if (shape === "hemisphere") return 5;
  if (shape === "capsule") return 6;
  return 0;
}

function buildGpuSphereData() {
  const values = new Float32Array(MAX_GPU_OBJECTS * GPU_OBJECT_STRIDE);
  const count = Math.min(MAX_GPU_OBJECTS, scene.spheres.length);
  for (let i = 0; i < count; i++) {
    const sphere = scene.spheres[i];
    const offset = i * GPU_OBJECT_STRIDE;
    values[offset] = sphere.center[0];
    values[offset + 1] = sphere.center[1];
    values[offset + 2] = sphere.center[2];
    values[offset + 3] = sphere.radius;
    values[offset + 4] = sphere.color[0];
    values[offset + 5] = sphere.color[1];
    values[offset + 6] = sphere.color[2];
    values[offset + 7] = materialId(sphere.material);
    values[offset + 8] = shapeId(sphere.shape);
    values[offset + 9] = sphere.height || sphere.radius * 2;
    values[offset + 10] = sphere.filmThickness || 0.42;
    values[offset + 11] = sphere.ior || 1.46;
    if (sphere.material !== "thinfilm") {
      values[offset + 10] = sphere.roughness ?? 0.45;
      values[offset + 11] = sphere.metalness ?? 0;
    }
    values[offset + 12] = sphere.normalScale || 0;
    values[offset + 13] = patternId(sphere.pattern);
    values[offset + 14] = sphere.displacementScale || 0;
    values[offset + 15] = sphere.halfDepth || sphere.radius;
    const rotation = sphere.rotation || [0, 0, 0, 1];
    values[offset + 16] = rotation[0] || 0;
    values[offset + 17] = rotation[1] || 0;
    values[offset + 18] = rotation[2] || 0;
    values[offset + 19] = rotation[3] ?? 1;
    const isGlass = sphere.material === "glass" || sphere.material === "roughglass";
    values[offset + 20] = isGlass
      ? (sphere.absorption ?? 0.24)
      : (sphere.clearcoat ?? (sphere.material === "carpaint" ? 0.9 : sphere.material === "coated" ? 0.5 : 0));
    values[offset + 21] = sphere.coatMaskScale || 1;
    values[offset + 22] = sphere.anisotropy || 0;
    values[offset + 23] =
      sphere.transmission ?? (sphere.material === "glass" ? 0.92 : sphere.material === "roughglass" ? 0.65 : 0);
    values[offset + 24] = sphere.emission || 0; // reserve: emissive/glowing objects (Phase 3)
    values[offset + 25] = sphere.ior || 1.46;
    values[offset + 26] = sphere.dispersion || 0;
    values[offset + 27] = sphere.shadowCaster ? 1 : 0;
  }
  return values;
}

function buildGpuLightData() {
  const values = new Float32Array(MAX_LIGHT_PANELS * LIGHT_PARAM_STRIDE);
  const count = Math.min(MAX_LIGHT_PANELS, scene.lightPanels.length);
  for (let i = 0; i < count; i++) {
    const panel = scene.lightPanels[i];
    const offset = i * LIGHT_PARAM_STRIDE;
    values[offset] = panel.center[0];
    values[offset + 1] = panel.center[1];
    values[offset + 2] = panel.center[2];
    values[offset + 3] = panel.width;
    values[offset + 4] = panel.depth;
    values[offset + 5] = panel.radiance[0];
    values[offset + 6] = panel.radiance[1];
    values[offset + 7] = panel.radiance[2];
    values[offset + 8] = panel.u[0];
    values[offset + 9] = panel.u[1];
    values[offset + 10] = panel.u[2];
    values[offset + 11] = panel.v[0];
    values[offset + 12] = panel.v[1];
    values[offset + 13] = panel.v[2];
  }
  return values;
}

function gpuRendererShader() {
  return `
const PI: f32 = 3.141592653589793;
const INV_PI: f32 = 0.3183098861837907;
const MAX_OBJECTS: u32 = ${MAX_GPU_OBJECTS}u;
const OBJECT_STRIDE: u32 = ${GPU_OBJECT_STRIDE}u;
const MAX_LIGHTS: u32 = ${MAX_LIGHT_PANELS}u;
const LIGHT_STRIDE: u32 = ${LIGHT_PARAM_STRIDE}u;

struct F32Buffer {
  values: array<f32>,
};

struct Hit {
  t: f32,
  point: vec3<f32>,
  normal: vec3<f32>,
  color: vec3<f32>,
  material: f32,
  filmThickness: f32,
  ior: f32,
  roughness: f32,
  metalness: f32,
  normalScale: f32,
  pattern: f32,
  displacementScale: f32,
  clearcoat: f32,
  coatMaskScale: f32,
  anisotropy: f32,
  transmission: f32,
  absorption: f32,
  dispersion: f32,
  objectIndex: f32,
  shape: f32,
  emitter: f32,
  exists: f32,
};

struct Trace {
  color: vec3<f32>,
  evals: u32,
};

struct ClipResult {
  dirs: array<vec3<f32>, 8>,
  count: u32,
};

@group(0) @binding(0) var frameTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<storage, read> params: F32Buffer;
@group(0) @binding(2) var<storage, read> spheres: F32Buffer;
@group(0) @binding(3) var<storage, read> lights: F32Buffer;

fn p(index: u32) -> f32 {
  return params.values[index];
}

fn sphereValue(index: u32) -> f32 {
  return spheres.values[index];
}

fn lightCount() -> u32 {
  return min(u32(p(43u)), MAX_LIGHTS);
}

fn lightParam(index: u32, field: u32) -> f32 {
  return lights.values[index * LIGHT_STRIDE + field];
}

fn lightCenter(index: u32) -> vec3<f32> {
  return vec3<f32>(lightParam(index, 0u), lightParam(index, 1u), lightParam(index, 2u));
}

fn lightWidth(index: u32) -> f32 {
  return lightParam(index, 3u);
}

fn lightDepth(index: u32) -> f32 {
  return lightParam(index, 4u);
}

fn lightRadiance(index: u32) -> vec3<f32> {
  return vec3<f32>(lightParam(index, 5u), lightParam(index, 6u), lightParam(index, 7u));
}

fn lightU(index: u32) -> vec3<f32> {
  return normalize(vec3<f32>(lightParam(index, 8u), lightParam(index, 9u), lightParam(index, 10u)));
}

fn lightV(index: u32) -> vec3<f32> {
  return normalize(vec3<f32>(lightParam(index, 11u), lightParam(index, 12u), lightParam(index, 13u)));
}

fn lightNormal(index: u32) -> vec3<f32> {
  return normalize(cross(lightU(index), lightV(index)));
}

fn floorColor() -> vec3<f32> {
  return vec3<f32>(p(31u), p(32u), p(33u));
}

fn wallColor() -> vec3<f32> {
  return vec3<f32>(p(34u), p(35u), p(36u));
}

fn emptyHit() -> Hit {
  var hit: Hit;
  hit.t = 1.0e20;
  hit.point = vec3<f32>(0.0);
  hit.normal = vec3<f32>(0.0, 1.0, 0.0);
  hit.color = vec3<f32>(0.0);
  hit.material = 0.0;
  hit.filmThickness = 0.42;
  hit.ior = 1.46;
  hit.roughness = 1.0;
  hit.metalness = 0.0;
  hit.normalScale = 0.0;
  hit.pattern = 0.0;
  hit.displacementScale = 0.0;
  hit.clearcoat = 0.0;
  hit.coatMaskScale = 1.0;
  hit.anisotropy = 0.0;
  hit.transmission = 0.0;
  hit.absorption = 0.0;
  hit.dispersion = 0.0;
  hit.objectIndex = -1.0;
  hit.shape = 0.0;
  hit.emitter = 0.0;
  hit.exists = 0.0;
  return hit;
}

fn background(dir: vec3<f32>) -> vec3<f32> {
  let t = clamp(0.5 + 0.5 * dir.y, 0.0, 1.0);
  let low = vec3<f32>(0.64, 0.73, 0.84);
  let high = vec3<f32>(0.88, 0.90, 0.98);
  return low * (1.0 - t) + high * t;
}

fn rand01(pixelSeed: u32, salt: u32) -> f32 {
  var x = pixelSeed ^ (salt * 747796405u + 2891336453u);
  x = ((x >> 16u) ^ x) * 2246822519u;
  x = ((x >> 13u) ^ x) * 3266489917u;
  x = (x >> 16u) ^ x;
  return f32(x & 16777215u) / 16777216.0;
}

fn quatRotate(v: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
  let qv = q.xyz;
  let uv = cross(qv, v);
  let uuv = cross(qv, uv);
  return v + (uv * q.w + uuv) * 2.0;
}

fn objectRotation(base: u32) -> vec4<f32> {
  let q = vec4<f32>(sphereValue(base + 16u), sphereValue(base + 17u), sphereValue(base + 18u), sphereValue(base + 19u));
  return normalize(q);
}

fn intersectSphere(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let radius = sphereValue(base + 3u);
  let oc = origin - center;
  let b = dot(oc, dir);
  let c = dot(oc, oc) - radius * radius;
  let h = b * b - c;
  var hit = current;

  if (h >= 0.0) {
    let root = sqrt(h);
    var t = -b - root;
    if (t < 0.0001) {
      t = -b + root;
    }
    if (t > 0.0001 && t < hit.t) {
      hit.t = t;
      hit.point = origin + dir * t;
      hit.normal = normalize(hit.point - center);
      hit.color = vec3<f32>(sphereValue(base + 4u), sphereValue(base + 5u), sphereValue(base + 6u));
      hit.material = sphereValue(base + 7u);
      hit.filmThickness = sphereValue(base + 10u);
      hit.ior = sphereValue(base + 25u);
      hit.roughness = clamp(sphereValue(base + 10u), 0.035, 1.0);
      hit.metalness = clamp(sphereValue(base + 11u), 0.0, 1.0);
      hit.normalScale = sphereValue(base + 12u);
      hit.pattern = sphereValue(base + 13u);
      hit.displacementScale = sphereValue(base + 14u);
      hit.clearcoat = clamp(sphereValue(base + 20u), 0.0, 1.0);
      hit.coatMaskScale = max(0.1, sphereValue(base + 21u));
      hit.anisotropy = clamp(sphereValue(base + 22u), 0.0, 1.0);
      hit.transmission = clamp(sphereValue(base + 23u), 0.0, 1.0);
      hit.absorption = max(0.0, sphereValue(base + 20u));
      hit.dispersion = max(0.0, sphereValue(base + 26u));
      hit.objectIndex = f32(index);
      hit.shape = sphereValue(base + 8u);
      if (hit.material > 1.5 && hit.material < 2.5) {
        hit.roughness = 0.08;
        hit.metalness = 0.0;
      }
      hit.emitter = 0.0;
      hit.exists = 1.0;
    }
  }

  return hit;
}

fn setObjectHit(current: Hit, t: f32, point: vec3<f32>, normal: vec3<f32>, base: u32) -> Hit {
  var hit = current;
  if (t > 0.0001 && t < hit.t) {
    hit.t = t;
    hit.point = point;
    hit.normal = normalize(normal);
    hit.color = vec3<f32>(sphereValue(base + 4u), sphereValue(base + 5u), sphereValue(base + 6u));
    hit.material = sphereValue(base + 7u);
    hit.filmThickness = sphereValue(base + 10u);
    hit.ior = sphereValue(base + 25u);
    hit.roughness = clamp(sphereValue(base + 10u), 0.035, 1.0);
    hit.metalness = clamp(sphereValue(base + 11u), 0.0, 1.0);
    hit.normalScale = sphereValue(base + 12u);
    hit.pattern = sphereValue(base + 13u);
    hit.displacementScale = sphereValue(base + 14u);
    hit.clearcoat = clamp(sphereValue(base + 20u), 0.0, 1.0);
    hit.coatMaskScale = max(0.1, sphereValue(base + 21u));
    hit.anisotropy = clamp(sphereValue(base + 22u), 0.0, 1.0);
    hit.transmission = clamp(sphereValue(base + 23u), 0.0, 1.0);
    hit.absorption = max(0.0, sphereValue(base + 20u));
    hit.dispersion = max(0.0, sphereValue(base + 26u));
    hit.objectIndex = f32(base / OBJECT_STRIDE);
    hit.shape = sphereValue(base + 8u);
    if (hit.material > 1.5 && hit.material < 2.5) {
      hit.roughness = 0.08;
      hit.metalness = 0.0;
    }
    hit.emitter = 0.0;
    hit.exists = 1.0;
  }
  return hit;
}

fn intersectCylinder(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDir = quatRotate(dir, invQ);
  let radius = sphereValue(base + 3u);
  let height = sphereValue(base + 9u);
  let bottom = -height * 0.5;
  let top = height * 0.5;
  let a = localDir.x * localDir.x + localDir.z * localDir.z;
  let b = 2.0 * (localOrigin.x * localDir.x + localOrigin.z * localDir.z);
  let c = localOrigin.x * localOrigin.x + localOrigin.z * localOrigin.z - radius * radius;
  var hit = current;

  if (a > 0.0000001) {
    let h = b * b - 4.0 * a * c;
    if (h >= 0.0) {
      let root = sqrt(h);
      let inv = 0.5 / a;
      for (var j = 0u; j < 2u; j = j + 1u) {
        let t = select((-b + root) * inv, (-b - root) * inv, j == 0u);
        let localPoint = localOrigin + localDir * t;
        let y = localPoint.y;
        if (t > 0.0001 && y >= bottom && y <= top) {
          let point = origin + dir * t;
          hit = setObjectHit(hit, t, point, quatRotate(vec3<f32>(localPoint.x, 0.0, localPoint.z), q), base);
        }
      }
    }
  }

  if (abs(localDir.y) > 0.0000001) {
    let tb = (bottom - localOrigin.y) / localDir.y;
    let pb = localOrigin + localDir * tb;
    let db = pb.xz;
    if (dot(db, db) <= radius * radius) {
      hit = setObjectHit(hit, tb, origin + dir * tb, quatRotate(vec3<f32>(0.0, -1.0, 0.0), q), base);
    }

    let tt = (top - localOrigin.y) / localDir.y;
    let pt = localOrigin + localDir * tt;
    let dt = pt.xz;
    if (dot(dt, dt) <= radius * radius) {
      hit = setObjectHit(hit, tt, origin + dir * tt, quatRotate(vec3<f32>(0.0, 1.0, 0.0), q), base);
    }
  }

  return hit;
}

fn intersectCone(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let radius = sphereValue(base + 3u);
  let height = sphereValue(base + 9u);
  let bottom = center.y - height * 0.5;
  let top = center.y + height * 0.5;
  let ox = origin.x - center.x;
  let oz = origin.z - center.z;
  let oy = origin.y - bottom;
  let k = radius / height;
  let m0 = radius - k * oy;
  let a = dir.x * dir.x + dir.z * dir.z - k * k * dir.y * dir.y;
  let b = 2.0 * (ox * dir.x + oz * dir.z + m0 * k * dir.y);
  let c = ox * ox + oz * oz - m0 * m0;
  var hit = current;

  if (abs(a) > 0.0000001) {
    let h = b * b - 4.0 * a * c;
    if (h >= 0.0) {
      let root = sqrt(h);
      let inv = 0.5 / a;
      for (var j = 0u; j < 2u; j = j + 1u) {
        let t = select((-b + root) * inv, (-b - root) * inv, j == 0u);
        let y = origin.y + dir.y * t;
        if (t > 0.0001 && y >= bottom && y <= top) {
          let point = origin + dir * t;
          let localY = point.y - bottom;
          let radiusAtY = radius - k * localY;
          hit = setObjectHit(hit, t, point, vec3<f32>(point.x - center.x, k * radiusAtY, point.z - center.z), base);
        }
      }
    }
  }

  if (abs(dir.y) > 0.0000001) {
    let t = (bottom - origin.y) / dir.y;
    let point = origin + dir * t;
    let d = point.xz - center.xz;
    if (dot(d, d) <= radius * radius) {
      hit = setObjectHit(hit, t, point, vec3<f32>(0.0, -1.0, 0.0), base);
    }
  }

  return hit;
}

fn intersectBox(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDir = quatRotate(dir, invQ);
  let halfExtents = vec3<f32>(sphereValue(base + 3u), sphereValue(base + 9u) * 0.5, sphereValue(base + 15u));
  var tMin = -1.0e20;
  var tMax = 1.0e20;
  var normal = vec3<f32>(0.0);
  var hit = current;

  if (abs(localDir.x) < 0.0000001) {
    if (abs(localOrigin.x) > halfExtents.x) {
      return hit;
    }
  } else {
    let inv = 1.0 / localDir.x;
    let t0 = min((-halfExtents.x - localOrigin.x) * inv, (halfExtents.x - localOrigin.x) * inv);
    let t1 = max((-halfExtents.x - localOrigin.x) * inv, (halfExtents.x - localOrigin.x) * inv);
    if (t0 > tMin) {
      tMin = t0;
      normal = vec3<f32>(select(1.0, -1.0, localDir.x > 0.0), 0.0, 0.0);
    }
    tMax = min(tMax, t1);
  }

  if (abs(localDir.y) < 0.0000001) {
    if (abs(localOrigin.y) > halfExtents.y) {
      return hit;
    }
  } else {
    let inv = 1.0 / localDir.y;
    let t0 = min((-halfExtents.y - localOrigin.y) * inv, (halfExtents.y - localOrigin.y) * inv);
    let t1 = max((-halfExtents.y - localOrigin.y) * inv, (halfExtents.y - localOrigin.y) * inv);
    if (t0 > tMin) {
      tMin = t0;
      normal = vec3<f32>(0.0, select(1.0, -1.0, localDir.y > 0.0), 0.0);
    }
    tMax = min(tMax, t1);
  }

  if (abs(localDir.z) < 0.0000001) {
    if (abs(localOrigin.z) > halfExtents.z) {
      return hit;
    }
  } else {
    let inv = 1.0 / localDir.z;
    let t0 = min((-halfExtents.z - localOrigin.z) * inv, (halfExtents.z - localOrigin.z) * inv);
    let t1 = max((-halfExtents.z - localOrigin.z) * inv, (halfExtents.z - localOrigin.z) * inv);
    if (t0 > tMin) {
      tMin = t0;
      normal = vec3<f32>(0.0, 0.0, select(1.0, -1.0, localDir.z > 0.0));
    }
    tMax = min(tMax, t1);
  }

  if (tMax >= max(tMin, 0.0001)) {
    var t = tMin;
    if (t < 0.0001) {
      t = tMax;
      normal = -normal;
    }
    let point = origin + dir * t;
    hit = setObjectHit(hit, t, point, quatRotate(normal, q), base);
  }

  return hit;
}

fn torusDistance(point: vec3<f32>, majorRadius: f32, minorRadius: f32) -> f32 {
  let q = vec2<f32>(length(point.xz) - majorRadius, point.y);
  return length(q) - minorRadius;
}

fn torusNormal(point: vec3<f32>, majorRadius: f32, minorRadius: f32) -> vec3<f32> {
  let e = 0.0015;
  return normalize(vec3<f32>(
    torusDistance(point + vec3<f32>(e, 0.0, 0.0), majorRadius, minorRadius) - torusDistance(point - vec3<f32>(e, 0.0, 0.0), majorRadius, minorRadius),
    torusDistance(point + vec3<f32>(0.0, e, 0.0), majorRadius, minorRadius) - torusDistance(point - vec3<f32>(0.0, e, 0.0), majorRadius, minorRadius),
    torusDistance(point + vec3<f32>(0.0, 0.0, e), majorRadius, minorRadius) - torusDistance(point - vec3<f32>(0.0, 0.0, e), majorRadius, minorRadius)
  ));
}

fn intersectTorus(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDir = quatRotate(dir, invQ);
  let majorRadius = sphereValue(base + 3u);
  let minorRadius = max(0.04, sphereValue(base + 9u) * 0.5);
  var t = 0.02;
  var hit = current;

  for (var i = 0u; i < 64u; i = i + 1u) {
    if (t >= min(hit.t, 12.0)) {
      break;
    }
    let point = localOrigin + localDir * t;
    let d = torusDistance(point, majorRadius, minorRadius);
    if (d < 0.0015) {
      let worldPoint = origin + dir * t;
      let worldNormal = quatRotate(torusNormal(point, majorRadius, minorRadius), q);
      hit = setObjectHit(hit, t, worldPoint, worldNormal, base);
      break;
    }
    t = t + max(0.004, d * 0.82);
  }

  return hit;
}

fn intersectHemisphere(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDir = quatRotate(dir, invQ);
  let radius = sphereValue(base + 3u);
  let b = dot(localOrigin, localDir);
  let c = dot(localOrigin, localOrigin) - radius * radius;
  let h = b * b - c;
  var hit = current;

  if (h >= 0.0) {
    let root = sqrt(h);
    for (var j = 0u; j < 2u; j = j + 1u) {
      let t = select(-b + root, -b - root, j == 0u);
      let localPoint = localOrigin + localDir * t;
      if (t > 0.0001 && localPoint.y >= 0.0) {
        hit = setObjectHit(hit, t, origin + dir * t, quatRotate(localPoint, q), base);
      }
    }
  }

  if (abs(localDir.y) > 0.0000001) {
    let t = -localOrigin.y / localDir.y;
    let localPoint = localOrigin + localDir * t;
    if (dot(localPoint.xz, localPoint.xz) <= radius * radius) {
      hit = setObjectHit(hit, t, origin + dir * t, quatRotate(vec3<f32>(0.0, -1.0, 0.0), q), base);
    }
  }

  return hit;
}

fn intersectCapsule(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(sphereValue(base), sphereValue(base + 1u), sphereValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDir = quatRotate(dir, invQ);
  let radius = sphereValue(base + 3u);
  let halfBody = max(0.0, sphereValue(base + 9u) * 0.5 - radius);
  var hit = current;

  let a = localDir.x * localDir.x + localDir.z * localDir.z;
  let b = 2.0 * (localOrigin.x * localDir.x + localOrigin.z * localDir.z);
  let c = localOrigin.x * localOrigin.x + localOrigin.z * localOrigin.z - radius * radius;
  if (a > 0.0000001) {
    let h = b * b - 4.0 * a * c;
    if (h >= 0.0) {
      let root = sqrt(h);
      let inv = 0.5 / a;
      for (var j = 0u; j < 2u; j = j + 1u) {
        let t = select((-b + root) * inv, (-b - root) * inv, j == 0u);
        let localPoint = localOrigin + localDir * t;
        if (t > 0.0001 && localPoint.y >= -halfBody && localPoint.y <= halfBody) {
          hit = setObjectHit(hit, t, origin + dir * t, quatRotate(vec3<f32>(localPoint.x, 0.0, localPoint.z), q), base);
        }
      }
    }
  }

  for (var cap = 0u; cap < 2u; cap = cap + 1u) {
    let cy = select(halfBody, -halfBody, cap == 0u);
    let oc = localOrigin - vec3<f32>(0.0, cy, 0.0);
    let sb = dot(oc, localDir);
    let sc = dot(oc, oc) - radius * radius;
    let sh = sb * sb - sc;
    if (sh >= 0.0) {
      let root = sqrt(sh);
      for (var j = 0u; j < 2u; j = j + 1u) {
        let t = select(-sb + root, -sb - root, j == 0u);
        let localPoint = localOrigin + localDir * t;
        let normal = localPoint - vec3<f32>(0.0, cy, 0.0);
        if (t > 0.0001) {
          hit = setObjectHit(hit, t, origin + dir * t, quatRotate(normal, q), base);
        }
      }
    }
  }

  return hit;
}

fn intersectObject(origin: vec3<f32>, dir: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let shape = sphereValue(base + 8u);
  if (shape > 5.5) {
    return intersectCapsule(origin, dir, index, current);
  }
  if (shape > 4.5) {
    return intersectHemisphere(origin, dir, index, current);
  }
  if (shape > 3.5) {
    return intersectTorus(origin, dir, index, current);
  }
  if (shape > 2.5) {
    return intersectBox(origin, dir, index, current);
  }
  if (shape > 1.5) {
    return intersectCone(origin, dir, index, current);
  }
  if (shape > 0.5) {
    return intersectCylinder(origin, dir, index, current);
  }
  return intersectSphere(origin, dir, index, current);
}

fn roomFaceColor(axis: u32, positive: bool) -> vec3<f32> {
  if (axis == 0u) {
    if (positive) { return vec3<f32>(p(55u), p(56u), p(57u)); }
    return vec3<f32>(p(58u), p(59u), p(60u));
  }
  if (axis == 1u) {
    if (positive) { return vec3<f32>(p(61u), p(62u), p(63u)); }
    return vec3<f32>(p(64u), p(65u), p(66u));
  }
  if (positive) { return vec3<f32>(p(67u), p(68u), p(69u)); }
  return vec3<f32>(p(70u), p(71u), p(72u));
}

// Rotating cubic room: a box viewed from the inside. The exit face the ray
// crosses is the inner wall the camera sees; its inward-facing normal rotates
// with the room while the lights stay fixed in world, so wall shading changes.
fn intersectRoom(origin: vec3<f32>, dir: vec3<f32>, current: Hit) -> Hit {
  var hit = current;
  let q = vec4<f32>(p(45u), p(46u), p(47u), p(48u));
  let invQ = vec4<f32>(-q.xyz, q.w);
  let center = vec3<f32>(p(52u), p(53u), p(54u));
  let half = vec3<f32>(p(49u), p(50u), p(51u));
  let lo = quatRotate(origin - center, invQ);
  let ld = quatRotate(dir, invQ);
  let eps = 0.0000001;

  var tExit = 1.0e30;
  var axis = 0u;
  var positive = true;

  if (abs(ld.x) > eps) {
    let inv = 1.0 / ld.x;
    let tfar = max((half.x - lo.x) * inv, (-half.x - lo.x) * inv);
    if (tfar > 0.0001 && tfar < tExit) { tExit = tfar; axis = 0u; positive = ld.x > 0.0; }
  }
  if (abs(ld.y) > eps) {
    let inv = 1.0 / ld.y;
    let tfar = max((half.y - lo.y) * inv, (-half.y - lo.y) * inv);
    if (tfar > 0.0001 && tfar < tExit) { tExit = tfar; axis = 1u; positive = ld.y > 0.0; }
  }
  if (abs(ld.z) > eps) {
    let inv = 1.0 / ld.z;
    let tfar = max((half.z - lo.z) * inv, (-half.z - lo.z) * inv);
    if (tfar > 0.0001 && tfar < tExit) { tExit = tfar; axis = 2u; positive = ld.z > 0.0; }
  }

  if (tExit > 0.0001 && tExit < hit.t) {
    var localN = vec3<f32>(0.0);
    if (axis == 0u) { localN = vec3<f32>(select(1.0, -1.0, positive), 0.0, 0.0); }
    else if (axis == 1u) { localN = vec3<f32>(0.0, select(1.0, -1.0, positive), 0.0); }
    else { localN = vec3<f32>(0.0, 0.0, select(1.0, -1.0, positive)); }

    hit.t = tExit;
    hit.point = origin + dir * tExit;
    hit.normal = quatRotate(localN, q);
    hit.color = roomFaceColor(axis, positive);
    hit.material = p(74u);
    hit.filmThickness = 0.42;
    hit.ior = 1.46;
    hit.roughness = clamp(p(73u), 0.035, 1.0);
    hit.metalness = 0.0;
    hit.normalScale = p(76u);
    hit.pattern = p(75u);
    hit.displacementScale = 0.0;
    hit.clearcoat = select(0.0, 0.4, hit.material > 3.5 && hit.material < 5.5);
    hit.coatMaskScale = 2.4;
    hit.anisotropy = 0.0;
    hit.transmission = 0.0;
    hit.absorption = 0.0;
    hit.dispersion = 0.0;
    hit.objectIndex = -1.0;
    hit.shape = 0.0;
    hit.emitter = 0.0;
    hit.exists = 1.0;
  }
  return hit;
}

fn intersectScene(origin: vec3<f32>, dir: vec3<f32>) -> Hit {
  var hit = emptyHit();
  let roomMode = p(44u);
  let floorX = p(37u);
  let floorZMin = p(38u);
  let floorZMax = p(39u);
  let wallZ = p(40u);
  let wallHeight = p(41u);

  if (roomMode < 0.5 && dir.y < -0.0001) {
    let t = -origin.y / dir.y;
    let point = origin + dir * t;
    if (t > 0.0 && abs(point.x) < floorX && point.z > floorZMin && point.z < floorZMax) {
      hit.t = t;
      hit.point = point;
      hit.normal = vec3<f32>(0.0, 1.0, 0.0);
      hit.color = floorColor();
      hit.material = p(112u);
      hit.filmThickness = 0.42;
      hit.ior = 1.46;
      hit.roughness = clamp(p(114u), 0.035, 1.0);
      hit.metalness = clamp(p(120u), 0.0, 1.0);
      hit.normalScale = p(116u);
      hit.pattern = p(118u);
      hit.displacementScale = p(123u);
      hit.clearcoat = select(0.0, 0.45, hit.material > 3.5 && hit.material < 5.5);
      hit.coatMaskScale = 2.6;
      hit.anisotropy = 0.0;
      hit.transmission = 0.0;
      hit.absorption = 0.0;
      hit.dispersion = 0.0;
      hit.objectIndex = -1.0;
      hit.shape = 0.0;
      hit.emitter = 0.0;
      hit.exists = 1.0;
    }
  }

  if (roomMode < 0.5 && dir.z < -0.0001) {
    let t = (wallZ - origin.z) / dir.z;
    let point = origin + dir * t;
    if (t > 0.0 && abs(point.x) < floorX && point.y > 0.0 && point.y < wallHeight && t < hit.t) {
      hit.t = t;
      hit.point = point;
      hit.normal = vec3<f32>(0.0, 0.0, 1.0);
      hit.color = wallColor();
      hit.material = p(113u);
      hit.filmThickness = 0.42;
      hit.ior = 1.46;
      hit.roughness = clamp(p(115u), 0.035, 1.0);
      hit.metalness = clamp(p(121u), 0.0, 1.0);
      hit.normalScale = p(117u);
      hit.pattern = p(119u);
      hit.displacementScale = p(124u);
      hit.clearcoat = select(0.0, 0.32, hit.material > 3.5 && hit.material < 5.5);
      hit.coatMaskScale = 2.0;
      hit.anisotropy = 0.0;
      hit.transmission = 0.0;
      hit.absorption = 0.0;
      hit.dispersion = 0.0;
      hit.objectIndex = -1.0;
      hit.shape = 0.0;
      hit.emitter = 0.0;
      hit.exists = 1.0;
    }
  }

  if (roomMode >= 0.5) {
    hit = intersectRoom(origin, dir, hit);
  }

  let objectCount = min(u32(p(42u)), MAX_OBJECTS);
  for (var i = 0u; i < objectCount; i = i + 1u) {
    hit = intersectObject(origin, dir, i, hit);
  }

  let count = lightCount();
  for (var li = 0u; li < count; li = li + 1u) {
    let ln = lightNormal(li);
    let denom = dot(ln, dir);
    if (abs(denom) > 0.0001 && dot(ln, -dir) > 0.0) {
      let lc = lightCenter(li);
      let t = dot(ln, lc - origin) / denom;
      let point = origin + dir * t;
      let local = point - lc;
      let du = dot(local, lightU(li));
      let dv = dot(local, lightV(li));
      if (t > 0.0 && abs(du) < lightWidth(li) * 0.5 && abs(dv) < lightDepth(li) * 0.5 && t < hit.t) {
        hit.t = t;
        hit.point = point;
        hit.normal = ln;
        hit.color = vec3<f32>(1.0, 0.9, 0.58);
        hit.material = 0.0;
        hit.filmThickness = 0.42;
        hit.ior = 1.46;
        hit.roughness = 1.0;
        hit.metalness = 0.0;
        hit.normalScale = 0.0;
        hit.pattern = 0.0;
        hit.displacementScale = 0.0;
        hit.clearcoat = 0.0;
        hit.coatMaskScale = 1.0;
        hit.anisotropy = 0.0;
        hit.transmission = 0.0;
        hit.absorption = 0.0;
        hit.dispersion = 0.0;
        hit.objectIndex = -1.0;
        hit.shape = 0.0;
        hit.emitter = 1.0;
        hit.exists = 1.0;
      }
    }
  }

  return hit;
}

fn clipToHemisphere(dirs: array<vec3<f32>, 8>, count: u32, normal: vec3<f32>) -> ClipResult {
  var result: ClipResult;
  result.count = 0u;

  for (var i = 0u; i < count; i = i + 1u) {
    let current = dirs[i];
    let next = dirs[(i + 1u) % count];
    let d0 = dot(current, normal);
    let d1 = dot(next, normal);
    let currentInside = d0 >= -0.0000001;
    let nextInside = d1 >= -0.0000001;

    if (currentInside && result.count < 8u) {
      result.dirs[result.count] = current;
      result.count = result.count + 1u;
    }

    if (currentInside != nextInside && result.count < 8u) {
      let t = d0 / (d0 - d1);
      result.dirs[result.count] = normalize(current * (1.0 - t) + next * t);
      result.count = result.count + 1u;
    }
  }

  return result;
}

fn lightVertex(lightIndex: u32, corner: u32) -> vec3<f32> {
  let lc = lightCenter(lightIndex);
  let hu = lightWidth(lightIndex) * 0.5;
  let hv = lightDepth(lightIndex) * 0.5;
  let u = lightU(lightIndex);
  let v = lightV(lightIndex);
  if (corner == 0u) {
    return lc - u * hu + v * hv;
  }
  if (corner == 1u) {
    return lc - u * hu - v * hv;
  }
  if (corner == 2u) {
    return lc + u * hu - v * hv;
  }
  return lc + u * hu + v * hv;
}

fn segmentBlockedByAnalyticPanel(point: vec3<f32>, lightPoint: vec3<f32>) -> bool {
  _ = point;
  _ = lightPoint;
  return false;
}

fn projectedSolidAngleFromDirs(sourceDirs: array<vec3<f32>, 8>, sourceCount: u32, normal: vec3<f32>) -> f32 {
  var dirs = sourceDirs;
  var count = sourceCount;
  if (p(6u) > 0.5) {
    let clipped = clipToHemisphere(dirs, count, normal);
    dirs = clipped.dirs;
    count = clipped.count;
  }

  if (count < 3u) {
    return 0.0;
  }

  var sum = 0.0;
  for (var i = 0u; i < count; i = i + 1u) {
    let a = dirs[i];
    let b = dirs[(i + 1u) % count];
    let c = cross(a, b);
    let cLen = length(c);
    if (cLen >= 0.0000001) {
      let angle = atan2(cLen, dot(a, b));
      sum = sum + angle * dot(normal, c / cLen);
    }
  }

  return max(0.0, -0.5 * sum);
}

fn projectedSolidAngle(point: vec3<f32>, normal: vec3<f32>, lightIndex: u32) -> f32 {
  let lc = lightCenter(lightIndex);
  if (dot(lightNormal(lightIndex), point - lc) <= 0.0) {
    return 0.0;
  }

  var dirs: array<vec3<f32>, 8>;
  dirs[0] = normalize(lightVertex(lightIndex, 0u) - point);
  dirs[1] = normalize(lightVertex(lightIndex, 1u) - point);
  dirs[2] = normalize(lightVertex(lightIndex, 2u) - point);
  dirs[3] = normalize(lightVertex(lightIndex, 3u) - point);
  return projectedSolidAngleFromDirs(dirs, 4u, normal);
}

fn visibleProjectedSolidAngle(point: vec3<f32>, normal: vec3<f32>, lightIndex: u32) -> f32 {
  let full = projectedSolidAngle(point, normal, lightIndex);
  return full;
}

fn analyticIrradiance(point: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  var total = vec3<f32>(0.0);
  let count = lightCount();
  for (var li = 0u; li < count; li = li + 1u) {
    total = total + lightRadiance(li) * visibleProjectedSolidAngle(point, normal, li);
  }
  return total;
}

fn sampleQuadIrradiance(point: vec3<f32>, normal: vec3<f32>, pixelSeed: u32) -> vec3<f32> {
  let samples = max(1u, min(64u, u32(p(3u))));
  var total = vec3<f32>(0.0);
  let count = lightCount();

  for (var li = 0u; li < count; li = li + 1u) {
    let lc = lightCenter(li);
    let ln = lightNormal(li);
    if (dot(ln, point - lc) <= 0.0) {
      continue;
    }

    let area = lightWidth(li) * lightDepth(li);
    var e = 0.0;

    for (var s = 0u; s < samples; s = s + 1u) {
      let sx = (rand01(pixelSeed, li * 131u + s * 2u + 1u) - 0.5) * lightWidth(li);
      let sy = (rand01(pixelSeed, li * 131u + s * 2u + 2u) - 0.5) * lightDepth(li);
      let samplePoint = lc + lightU(li) * sx + lightV(li) * sy;
      if (segmentBlockedByAnalyticPanel(point, samplePoint)) {
        continue;
      }
      let toLight = samplePoint - point;
      let r2 = max(dot(toLight, toLight), 0.000001);
      let wi = toLight * inverseSqrt(r2);
      let cosPoint = max(0.0, dot(normal, wi));
      let cosLight = max(0.0, dot(ln, -wi));
      e = e + (cosPoint * cosLight * area) / r2;
    }

    total = total + lightRadiance(li) * (e / f32(samples));
  }

  return total;
}

fn indirectFill(point: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  if (p(7u) <= 0.5) {
    return vec3<f32>(0.0);
  }

  let up = clamp(normal.y, 0.0, 1.0);
  let down = clamp(-normal.y, 0.0, 1.0);
  let side = clamp(1.0 - abs(normal.y), 0.0, 1.0);
  let nearWall = clamp(1.0 - abs(point.z - p(40u)) / 3.2, 0.0, 1.0);
  let skyColor = vec3<f32>(0.48, 0.58, 0.78);
  let skyStrength = 0.018 + 0.07 * up;
  let floorStrength = 0.024 + 0.078 * down;
  let wallStrength = 0.018 * side * (0.35 + 0.65 * nearWall);
  return skyColor * skyStrength + floorColor() * floorStrength + wallColor() * wallStrength;
}

fn tangentOf(normal: vec3<f32>) -> vec3<f32> {
  var up = vec3<f32>(0.0, 1.0, 0.0);
  if (abs(normal.y) > 0.92) {
    up = vec3<f32>(1.0, 0.0, 0.0);
  }
  return normalize(cross(up, normal));
}

fn surfaceUv(point: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
  var q = point.xz;
  if (abs(normal.y) < 0.5) {
    q = point.xy;
  }
  return q;
}

fn hash21(p2: vec2<f32>) -> f32 {
  return fract(sin(dot(p2, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn valueNoise2(p2: vec2<f32>) -> f32 {
  let i = floor(p2);
  let f = fract(p2);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  let x0 = a * (1.0 - u.x) + b * u.x;
  let x1 = c * (1.0 - u.x) + d * u.x;
  return x0 * (1.0 - u.y) + x1 * u.y;
}

fn fbm2(p2: vec2<f32>) -> f32 {
  var q = p2;
  var amp = 0.5;
  var total = 0.0;
  var norm = 0.0;
  for (var i = 0u; i < 5u; i = i + 1u) {
    total = total + valueNoise2(q) * amp;
    norm = norm + amp;
    q = vec2<f32>(q.x * 1.74 + q.y * 0.58, -q.x * 0.58 + q.y * 1.74) + vec2<f32>(13.1, 7.7);
    amp = amp * 0.52;
  }
  return total / max(norm, 0.0001);
}

fn proceduralColor(hit: Hit, normal: vec3<f32>) -> vec3<f32> {
  let q = surfaceUv(hit.point, normal);
  var color = hit.color;

  if (hit.pattern > 6.5 && hit.pattern < 7.5) {
    let fiber = fbm2(q * vec2<f32>(18.0, 4.5) + vec2<f32>(0.3, 8.1));
    let grain = fbm2(q * 36.0 + vec2<f32>(5.2, 2.4));
    color = color * (0.76 + 0.24 * fiber) + vec3<f32>(0.04, 0.035, 0.025) * grain;
  } else if (hit.pattern > 7.5 && hit.pattern < 8.5) {
    let tile = floor(q * vec2<f32>(2.15, 2.55));
    let parity = fract((tile.x + tile.y) * 0.5);
    let gx = abs(fract(q.x * 2.15) - 0.5);
    let gy = abs(fract(q.y * 2.55) - 0.5);
    let grout = 1.0 - smoothstep(0.012, 0.045, min(gx, gy));
    let checker = select(0.88, 1.08, parity > 0.25);
    color = color * checker * (1.0 - 0.28 * grout);
  } else if (hit.pattern > 8.5) {
    let cell = floor(q * 58.0);
    let spot = smoothstep(0.975, 0.998, hash21(cell));
    color = color + vec3<f32>(0.16, 0.12, 0.05) * spot;
  }

  return clamp(color, vec3<f32>(0.0), vec3<f32>(1.5));
}

fn proceduralNormal(hit: Hit) -> vec3<f32> {
  let n = hit.normal;
  let strength = clamp(hit.normalScale, 0.0, 2.0);
  if (strength <= 0.0001 || hit.pattern < 0.5) {
    return n;
  }

  let t = tangentOf(n);
  let b = normalize(cross(n, t));
  var sx = 0.0;
  var sy = 0.0;
  var q = surfaceUv(hit.point, n);

  if (hit.pattern < 1.5) {
    sx = 0.72 * sin(q.y * 46.0 + 0.8 * sin(q.x * 5.0)) + 0.22 * sin(q.y * 119.0);
    sy = 0.08 * sin(q.x * 12.0);
  } else if (hit.pattern < 2.5) {
    let gx = fract(q.x * 1.35 + 0.5) - 0.5;
    let gy = fract(q.y * 1.18 + 0.5) - 0.5;
    let seamX = 1.0 - smoothstep(0.015, 0.05, abs(gx));
    let seamY = 1.0 - smoothstep(0.015, 0.05, abs(gy));
    sx = sign(gx) * seamX * 1.4 + 0.12 * sin(q.y * 18.0);
    sy = sign(gy) * seamY * 1.1 + 0.08 * sin(q.x * 15.0);
  } else if (hit.pattern < 3.5) {
    sx = 0.45 * sin(q.x * 17.0 + sin(q.y * 4.2)) + 0.24 * sin((q.x + q.y) * 31.0);
    sy = 0.4 * cos(q.y * 19.0 + cos(q.x * 3.7)) + 0.2 * sin((q.x - q.y) * 27.0);
  } else if (hit.pattern < 4.5) {
    sx = 0.82 * cos(q.x * 8.0 + 0.8 * sin(q.y * 2.2)) + 0.22 * cos((q.x + q.y) * 18.0);
    sy = 0.64 * sin(q.y * 7.0 + 0.5 * cos(q.x * 3.1)) + 0.18 * sin((q.x - q.y) * 15.0);
  } else if (hit.pattern < 5.5) {
    let cell = vec2<f32>(fract(q.x * 2.4) - 0.5, fract(q.y * 2.4) - 0.5);
    let d = max(length(cell), 0.04);
    sx = -cell.x / d * (1.0 - smoothstep(0.08, 0.42, d)) + 0.18 * sin(q.y * 19.0);
    sy = -cell.y / d * (1.0 - smoothstep(0.08, 0.42, d)) + 0.18 * cos(q.x * 17.0);
  } else if (hit.pattern < 6.5) {
    let gx = fract(q.x * 12.0 + 0.25 * sin(q.y * 1.7)) - 0.5;
    let gy = fract(q.y * 9.0 + 0.18 * sin(q.x * 1.3)) - 0.5;
    let lineX = 1.0 - smoothstep(0.012, 0.035, abs(gx));
    let lineY = 1.0 - smoothstep(0.012, 0.035, abs(gy));
    sx = sign(gx) * lineX * 0.62 + 0.06 * sin(q.y * 42.0);
    sy = sign(gy) * lineY * 0.5 + 0.05 * cos(q.x * 37.0);
  } else if (hit.pattern < 7.5) {
    let scale = 12.0;
    let eps = 0.035;
    let h0 = fbm2(q * scale);
    sx = (fbm2((q + vec2<f32>(eps, 0.0)) * scale) - h0) / eps * 0.18;
    sy = (fbm2((q + vec2<f32>(0.0, eps)) * scale) - h0) / eps * 0.18;
  } else if (hit.pattern < 8.5) {
    let gx = fract(q.x * 2.15) - 0.5;
    let gy = fract(q.y * 2.55) - 0.5;
    let lineX = 1.0 - smoothstep(0.015, 0.052, abs(gx));
    let lineY = 1.0 - smoothstep(0.015, 0.052, abs(gy));
    sx = sign(gx) * lineX * 0.8 + 0.04 * sin(q.y * 36.0);
    sy = sign(gy) * lineY * 0.68 + 0.04 * cos(q.x * 31.0);
  } else {
    let grain = fbm2(q * 44.0);
    sx = 0.34 * sin(q.x * 82.0 + grain * 5.0) + 0.12 * sin((q.x + q.y) * 137.0);
    sy = 0.28 * cos(q.y * 76.0 + grain * 4.0) + 0.1 * cos((q.x - q.y) * 121.0);
  }

  return normalize(n + (t * sx + b * sy) * strength * 0.13);
}

fn surfaceDisplacement(hit: Hit, normal: vec3<f32>) -> f32 {
  let scale = clamp(hit.displacementScale, 0.0, 2.0);
  if (scale <= 0.0001 || hit.pattern < 0.5) {
    return 0.0;
  }

  var q = surfaceUv(hit.point, normal);

  var h = 0.0;
  if (hit.pattern < 1.5) {
    h = 0.45 * sin(q.y * 46.0) + 0.18 * sin(q.y * 119.0);
  } else if (hit.pattern < 2.5) {
    let gx = abs(fract(q.x * 1.35 + 0.5) - 0.5);
    let gy = abs(fract(q.y * 1.18 + 0.5) - 0.5);
    h = -0.8 * (1.0 - smoothstep(0.012, 0.05, min(gx, gy))) + 0.08 * sin(q.x * 10.0 + q.y * 7.0);
  } else if (hit.pattern < 3.5) {
    h = 0.34 * sin(q.x * 17.0 + sin(q.y * 4.2)) + 0.26 * cos(q.y * 19.0 + cos(q.x * 3.7));
  } else if (hit.pattern < 4.5) {
    h = 0.5 * sin(q.x * 8.0 + 0.8 * sin(q.y * 2.2)) + 0.28 * sin(q.y * 7.0);
  } else if (hit.pattern < 5.5) {
    let cell = vec2<f32>(fract(q.x * 2.4) - 0.5, fract(q.y * 2.4) - 0.5);
    h = 0.48 - smoothstep(0.02, 0.45, length(cell));
  } else if (hit.pattern < 6.5) {
    return 0.0;
  } else if (hit.pattern < 7.5) {
    h = fbm2(q * 14.0) - 0.5;
  } else if (hit.pattern < 8.5) {
    let gx = abs(fract(q.x * 2.15) - 0.5);
    let gy = abs(fract(q.y * 2.55) - 0.5);
    h = -0.55 * (1.0 - smoothstep(0.014, 0.052, min(gx, gy)));
  } else {
    return 0.0;
  }

  return h * scale * 0.035;
}

fn ltcGgxIrradiance(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let viewDir = normalize(-incomingDir);
  let ndotv = clamp(dot(normal, viewDir), 0.0, 1.0);
  let rough = clamp(hit.roughness, 0.045, 1.0);
  let alpha = max(rough * rough, 0.006);
  let tangent = tangentOf(normal);
  let bitangent = normalize(cross(normal, tangent));
  let reflected = normalize(reflect(incomingDir, normal));
  let stretch = mix(8.5, 1.0, rough);
  let anisotropy = clamp(hit.anisotropy, 0.0, 0.92);
  let tangentStretch = stretch * (1.0 + anisotropy * 2.4);
  let bitangentStretch = stretch * (1.0 - anisotropy * 0.58);
  let grazing = 1.0 - ndotv;
  let f0 = mix(vec3<f32>(0.04), hit.color, vec3<f32>(hit.metalness));
  let fresnel = f0 + (vec3<f32>(1.0) - f0) * pow(grazing, 5.0);
  var total = vec3<f32>(0.0);
  let count = lightCount();

  for (var li = 0u; li < count; li = li + 1u) {
    let center = lightCenter(li);
    if (dot(lightNormal(li), hit.point - center) <= 0.0) {
      continue;
    }
    var dirs: array<vec3<f32>, 8>;
    for (var corner = 0u; corner < 4u; corner = corner + 1u) {
      let relative = lightVertex(li, corner) - hit.point;
      let local = vec3<f32>(dot(relative, tangent), dot(relative, bitangent), dot(relative, normal));
      let skew = dot(viewDir, tangent) * grazing * 0.72;
      dirs[corner] = normalize(vec3<f32>(
        local.x * tangentStretch + local.z * skew,
        local.y * bitangentStretch * mix(1.0, 0.68, hit.metalness),
        local.z
      ));
    }
    let omega = projectedSolidAngleFromDirs(dirs, 4u, vec3<f32>(0.0, 0.0, 1.0));
    let centerDirection = normalize(center - hit.point);
    let shapeGate = pow(max(0.0, dot(reflected, centerDirection)), mix(52.0, 3.5, rough));
    let amplitude = mix(0.2, 0.72, hit.metalness) / max(0.28, alpha + 0.12);
    total = total + lightRadiance(li) * omega * amplitude * (0.28 + 0.72 * shapeGate);
  }
  return total * fresnel;
}

fn coatingMask(hit: Hit, normal: vec3<f32>) -> f32 {
  let q = surfaceUv(hit.point, normal) * max(0.25, hit.coatMaskScale);
  let noise = fbm2(q + hit.color.xy * 5.7);
  let scratches = 0.5 + 0.5 * sin((q.x - q.y) * 7.0 + fbm2(q * 3.0) * 4.0);
  return clamp(smoothstep(0.28, 0.72, noise * 0.78 + scratches * 0.22), 0.0, 1.0);
}

fn flakeSparkle(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let q = surfaceUv(hit.point, normal) * 70.0;
  let cell = floor(q);
  let centerFalloff = 1.0 - smoothstep(0.08, 0.48, length(fract(q) - vec2<f32>(0.5)));
  let flakeMask = smoothstep(0.968, 0.998, hash21(cell));
  var total = 0.0;
  let count = lightCount();
  for (var li = 0u; li < count; li = li + 1u) {
    let wi = normalize(lightCenter(li) - hit.point);
    let halfDir = normalize(wi - incomingDir);
    total = total + pow(max(0.0, dot(normal, halfDir)), 72.0) * flakeMask * centerFalloff;
  }
  return vec3<f32>(1.0, 0.74, 0.42) * total * 3.2;
}

fn dielectricFresnel(cosIncident: f32, etaIncident: f32, etaTransmitted: f32) -> f32 {
  let ci = clamp(cosIncident, 0.0, 1.0);
  let eta = etaIncident / etaTransmitted;
  let sinTransmitted2 = eta * eta * max(0.0, 1.0 - ci * ci);
  if (sinTransmitted2 >= 1.0) {
    return 1.0;
  }
  let ct = sqrt(max(0.0, 1.0 - sinTransmitted2));
  let rs = (etaTransmitted * ci - etaIncident * ct) / max(0.000001, etaTransmitted * ci + etaIncident * ct);
  let rp = (etaIncident * ci - etaTransmitted * ct) / max(0.000001, etaIncident * ci + etaTransmitted * ct);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}

fn glassTransmission(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  var fallbackDir = refract(incomingDir, normal, 1.0 / max(1.01, hit.ior));
  if (dot(fallbackDir, fallbackDir) < 0.000001) {
    fallbackDir = reflect(incomingDir, normal);
  }
  return background(normalize(fallbackDir));
}

fn shadeHit(hit: Hit, incomingDir: vec3<f32>, variant: u32, pixelSeed: u32) -> vec3<f32> {
  let normal = proceduralNormal(hit);
  var shadedHit = hit;
  shadedHit.normal = normal;
  shadedHit.point = hit.point + normal * surfaceDisplacement(hit, normal);
  shadedHit.color = proceduralColor(hit, normal);
  var e: vec3<f32>;
  if (variant == 1u) {
    e = sampleQuadIrradiance(shadedHit.point, normal, pixelSeed);
  } else {
    e = analyticIrradiance(shadedHit.point, normal);
  }
  let fill = indirectFill(shadedHit.point, normal);
  let diffuse = shadedHit.color * (e * INV_PI + fill);

  var glossyHit = shadedHit;
  var coatMask = 0.0;
  if (hit.material > 6.5 && hit.material < 7.5) {
    glossyHit.metalness = max(hit.metalness, 0.74);
    glossyHit.anisotropy = max(hit.anisotropy, 0.78);
    glossyHit.roughness = clamp(hit.roughness, 0.07, 0.42);
  } else if (hit.material > 4.5 && hit.material < 5.5) {
    coatMask = coatingMask(shadedHit, normal);
    glossyHit.metalness = max(hit.metalness, 0.05);
    glossyHit.roughness = mix(clamp(hit.roughness, 0.16, 0.42), 0.055, hit.clearcoat * coatMask * 0.72);
  } else if (hit.material > 3.5 && hit.material < 4.5) {
    coatMask = max(0.45, coatingMask(shadedHit, normal));
    glossyHit.roughness = mix(clamp(hit.roughness, 0.1, 0.58), 0.075, hit.clearcoat * coatMask * 0.58);
  }

  var glossy = vec3<f32>(0.0);
  if ((hit.material > 2.5 && hit.material < 5.5) || hit.material > 6.5) {
    glossy = ltcGgxIrradiance(glossyHit, incomingDir, normal);
  }

  if (hit.material > 8.5) {
    let viewFacing = clamp(dot(-incomingDir, normal), 0.0, 1.0);
    let fresnel = dielectricFresnel(viewFacing, 1.0, max(1.01, hit.ior));
    let trans = glassTransmission(shadedHit, incomingDir, normal);
    return trans * (hit.transmission * (1.0 - fresnel)) + glossy * (0.18 + fresnel * 0.92) + diffuse * 0.035;
  }

  if (hit.material > 7.5) {
    let viewFacing = clamp(dot(-incomingDir, normal), 0.0, 1.0);
    let fresnel = dielectricFresnel(viewFacing, 1.0, max(1.01, hit.ior));
    let trans = glassTransmission(shadedHit, incomingDir, normal);
    return trans * (hit.transmission * 0.72 * (1.0 - fresnel)) + glossy * (0.28 + fresnel * 0.75) + diffuse * 0.12;
  }

  if (hit.material > 6.5) {
    let q = surfaceUv(shadedHit.point, normal);
    let grain = 0.74 + 0.26 * sin(q.y * 54.0 + fbm2(q * 12.0) * 5.0);
    return diffuse * 0.045 + glossy * grain;
  }

  if (hit.material > 5.5) {
    let q = surfaceUv(shadedHit.point, normal);
    let fiber = 0.78 + 0.22 * fbm2(q * vec2<f32>(26.0, 7.0));
    let grazing = pow(1.0 - clamp(dot(-incomingDir, normal), 0.0, 1.0), 2.0);
    return diffuse * fiber + shadedHit.color * fill * (0.35 + 0.25 * grazing);
  }

  if (hit.material > 4.5) {
    let flakes = flakeSparkle(shadedHit, incomingDir, normal) * coatMask;
    return diffuse * (0.34 + 0.2 * (1.0 - coatMask)) + glossy * (0.36 + hit.clearcoat * coatMask) + flakes;
  }

  if (hit.material > 3.5) {
    return diffuse * (0.5 + 0.08 * (1.0 - coatMask)) + glossy * (0.5 + hit.clearcoat * coatMask);
  }

  if (hit.material > 2.5) {
    return diffuse * (1.0 - hit.metalness) * 0.16 + glossy;
  }
  return diffuse;
}

fn evalCost(variant: u32) -> u32 {
  if (variant == 1u) {
    return max(1u, min(64u, u32(p(3u))));
  }
  return 1u;
}

fn thinFilmColor(hit: Hit, incomingDir: vec3<f32>) -> vec3<f32> {
  let cosI = clamp(dot(-incomingDir, hit.normal), 0.0, 1.0);
  let sinT2 = max(0.0, (1.0 - cosI * cosI) / (hit.ior * hit.ior));
  let cosT = sqrt(max(0.0, 1.0 - sinT2));
  let opticalPath = 2.0 * hit.ior * hit.filmThickness * cosT;
  let wavelengths = vec3<f32>(0.65, 0.53, 0.46);
  let phase = vec3<f32>(
    2.0 * PI * opticalPath / wavelengths.x,
    2.0 * PI * opticalPath / wavelengths.y + 0.62,
    2.0 * PI * opticalPath / wavelengths.z + 1.24
  );
  return clamp(vec3<f32>(0.22) + vec3<f32>(0.86) * (vec3<f32>(0.5) + vec3<f32>(0.5) * cos(phase)), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn traceRadiance(hit: Hit, incomingDir: vec3<f32>, variant: u32, pixelSeed: u32) -> Trace {
  var trace: Trace;
  trace.evals = 0u;

  if (hit.exists < 0.5) {
    trace.color = background(incomingDir);
    return trace;
  }

  if (hit.emitter > 0.5) {
    trace.color = vec3<f32>(8.0, 6.8, 3.8);
    return trace;
  }

  if (hit.material > 0.5 && hit.material < 2.5) {
    var opticalHit = hit;
    if (hit.material > 1.5) {
      let filmNormal = proceduralNormal(hit);
      opticalHit.normal = filmNormal;
      opticalHit.point = hit.point + filmNormal * surfaceDisplacement(hit, filmNormal);
    }
    let reflectedDir = normalize(reflect(incomingDir, opticalHit.normal));
    let reflectedHit = intersectScene(opticalHit.point + opticalHit.normal * 0.004, reflectedDir);
    var reflectedColor: vec3<f32>;
    if (reflectedHit.exists < 0.5) {
      reflectedColor = background(reflectedDir);
    } else if (reflectedHit.emitter > 0.5) {
      reflectedColor = vec3<f32>(8.0, 6.8, 3.8);
    } else if (reflectedHit.material > 0.5 && reflectedHit.material < 2.5) {
      reflectedColor = background(reflectedDir);
    } else {
      reflectedColor = shadeHit(reflectedHit, reflectedDir, variant, pixelSeed ^ 2654435769u);
      trace.evals = evalCost(variant);
    }
    let fresnel = 0.82 + 0.16 * pow(1.0 - clamp(dot(-incomingDir, opticalHit.normal), 0.0, 1.0), 5.0);
    var film = vec3<f32>(1.0);
    if (hit.material > 1.5) {
      film = thinFilmColor(opticalHit, incomingDir);
    }
    trace.color = hit.color * film * reflectedColor * fresnel;
    return trace;
  }

  trace.color = shadeHit(hit, incomingDir, variant, pixelSeed);
  trace.evals = evalCost(variant);
  return trace;
}

fn toneMap(color: vec3<f32>, exposure: f32) -> vec3<f32> {
  let x = max(vec3<f32>(0.0), color * exposure);
  return pow(vec3<f32>(1.0) - exp(-x), vec3<f32>(0.45454545));
}

fn falseColor(color: vec3<f32>, exposure: f32) -> vec3<f32> {
  let lum = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) * exposure;
  let t = clamp(lum * 0.52, 0.0, 1.0);
  let low = vec3<f32>(0.02, 0.12, 0.28);
  let mid = vec3<f32>(0.08, 0.68, 0.62);
  let high = vec3<f32>(1.0, 0.76, 0.16);
  let hot = vec3<f32>(1.0, 0.19, 0.16);

  if (t < 0.5) {
    let u = t / 0.5;
    return low * (1.0 - u) + mid * u;
  }

  if (t < 0.82) {
    let u = (t - 0.5) / 0.32;
    return mid * (1.0 - u) + high * u;
  }

  let u = (t - 0.82) / 0.18;
  return high * (1.0 - u) + hot * u;
}

fn aaOffset(sampleIndex: u32, sampleCount: u32) -> vec2<f32> {
  if (sampleCount <= 1u) {
    return vec2<f32>(0.5, 0.5);
  }
  if (sampleCount == 2u) {
    if (sampleIndex == 0u) {
      return vec2<f32>(0.28, 0.28);
    }
    return vec2<f32>(0.72, 0.72);
  }
  if (sampleIndex == 0u) {
    return vec2<f32>(0.25, 0.25);
  }
  if (sampleIndex == 1u) {
    return vec2<f32>(0.75, 0.25);
  }
  if (sampleIndex == 2u) {
    return vec2<f32>(0.25, 0.75);
  }
  return vec2<f32>(0.75, 0.75);
}

fn dofHash(seed: u32) -> f32 {
  var s = seed * 747796405u + 2891336453u;
  s = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  s = (s >> 22u) ^ s;
  return f32(s) * (1.0 / 4294967296.0);
}

fn rayDirectionForSample(pixel: vec2<f32>, width: f32, height: f32) -> vec3<f32> {
  let aspect = width / height;
  let px = (2.0 * (pixel.x / width) - 1.0) * aspect * p(15u);
  let py = (1.0 - 2.0 * (pixel.y / height)) * p(15u);
  let right = vec3<f32>(p(16u), p(17u), p(18u));
  let up = vec3<f32>(p(19u), p(20u), p(21u));
  let forward = vec3<f32>(p(22u), p(23u), p(24u));
  return normalize(forward + right * px + up * py);
}

fn radianceForSample(camPos: vec3<f32>, dir: vec3<f32>, gid: vec3<u32>, sampleIndex: u32, width: f32) -> vec3<f32> {
  let hit = intersectScene(camPos, dir);
  let mode = u32(p(2u));
  let pixelSeed = u32(p(9u)) ^ (gid.x * 374761393u) ^ (gid.y * 668265263u) ^ (sampleIndex * 362437u);

  if (mode == 2u) {
    let analyticTrace = traceRadiance(hit, dir, 0u, pixelSeed | 1u);
    let mcTrace = traceRadiance(hit, dir, 1u, pixelSeed | 1u);
    let splitX = u32(clamp(p(4u), 0.0, 1.0) * width);
    if (gid.x <= splitX) {
      return analyticTrace.color;
    }
    return mcTrace.color;
  }

  if (mode == 1u) {
    return traceRadiance(hit, dir, 1u, pixelSeed | 1u).color;
  }
  return traceRadiance(hit, dir, 0u, pixelSeed | 1u).color;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(frameTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let width = f32(dims.x);
  let height = f32(dims.y);
  let mode = u32(p(2u));
  let camPos = vec3<f32>(p(12u), p(13u), p(14u));
  let aperture = p(125u);
  var color = vec3<f32>(0.0);

  if (aperture <= 0.0) {
    // Pinhole path: unchanged AA behaviour.
    let sampleCount = max(1u, min(4u, u32(p(122u))));
    // Dynamic bound (not a constant) so the compiler does not unroll the whole
    // per-pixel renderer N times, which bloats the kernel and stalls/crashes the
    // shader compiler.
    for (var sampleIndex = 0u; sampleIndex < sampleCount; sampleIndex = sampleIndex + 1u) {
      let offset = aaOffset(sampleIndex, sampleCount);
      let pixel = vec2<f32>(f32(gid.x), f32(gid.y)) + offset;
      let dir = rayDirectionForSample(pixel, width, height);
      color = color + radianceForSample(camPos, dir, gid, sampleIndex, width);
    }
    color = color / f32(sampleCount);
  } else {
    // Thin-lens depth of field: jitter the origin on the aperture disk and
    // re-aim through the focal point at the focus distance.
    let focusDist = max(0.05, p(126u));
    let lensSamples = max(1u, min(64u, u32(p(127u))));
    let right = vec3<f32>(p(16u), p(17u), p(18u));
    let up = vec3<f32>(p(19u), p(20u), p(21u));
    let baseSeed = (gid.x * 1973u) ^ (gid.y * 9277u) ^ (u32(p(9u)) * 26699u);
    for (var sampleIndex = 0u; sampleIndex < lensSamples; sampleIndex = sampleIndex + 1u) {
      let s = baseSeed + sampleIndex * 4099u;
      let pixel = vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(dofHash(s), dofHash(s + 1u));
      let primaryDir = rayDirectionForSample(pixel, width, height);
      let focalPoint = camPos + primaryDir * focusDist;
      let radius = aperture * sqrt(dofHash(s + 2u));
      let theta = 6.28318530718 * dofHash(s + 3u);
      let lensOffset = right * (cos(theta) * radius) + up * (sin(theta) * radius);
      let origin = camPos + lensOffset;
      let dir = normalize(focalPoint - origin);
      color = color + radianceForSample(origin, dir, gid, sampleIndex, width);
    }
    color = color / f32(lensSamples);
  }

  var mapped: vec3<f32>;
  if (p(8u) > 0.5) {
    mapped = falseColor(color, p(5u));
  } else {
    mapped = toneMap(color, p(5u));
  }

  if (mode == 2u) {
    let splitX = i32(clamp(p(4u), 0.0, 1.0) * width);
    if (abs(i32(gid.x) - splitX) <= 0) {
      mapped = vec3<f32>(1.0);
    }
  }

  textureStore(frameTexture, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0));
}`;
}

// WGSL reserved words that are NOT otherwise valid identifiers. Using one as a
// variable/function/field name makes the whole shader fail to compile (see the
// `active` regression). The guard below names the offender precisely instead of
// leaving only Tint's cascade of validation errors.
const WGSL_RESERVED_WORDS = new Set([
  "NULL", "Self", "abstract", "active", "alignas", "alignof", "as", "asm",
  "asm_fragment", "async", "attribute", "auto", "await", "become", "cast",
  "catch", "class", "co_await", "co_return", "co_yield", "coherent",
  "column_major", "common", "compile", "compile_fragment", "concept",
  "const_cast", "consteval", "constexpr", "constinit", "crate", "debugger",
  "decltype", "delete", "demote", "demote_to_helper", "do", "dynamic_cast",
  "enum", "explicit", "export", "extends", "extern", "external", "filter",
  "final", "finally", "friend", "from", "fxgroup", "get", "goto",
  "groupshared", "highp", "impl", "implements", "import", "inline",
  "instanceof", "interface", "layout", "lowp", "macro", "macro_rules", "match",
  "mediump", "meta", "mod", "module", "move", "mut", "mutable", "namespace",
  "new", "nil", "noexcept", "noinline", "nointerpolation", "non_coherent",
  "noncoherent", "noperspective", "null", "nullptr", "of", "operator",
  "package", "packoffset", "partition", "pass", "patch", "pixelfragment",
  "precise", "precision", "premerge", "priv", "protected", "pub", "public",
  "readonly", "ref", "regardless", "register", "reinterpret_cast", "require",
  "resource", "restrict", "self", "set", "shared", "sizeof", "smooth", "snorm",
  "static", "static_assert", "static_cast", "std", "subroutine", "super",
  "target", "template", "this", "thread_local", "throw", "trait", "try",
  "type", "typedef", "typeid", "typename", "typeof", "union", "unless",
  "unorm", "unsafe", "unsigned", "use", "using", "varying", "virtual",
  "volatile", "wgsl", "where", "with", "writeonly", "yield",
]);

function findReservedWgslIdentifiers(src) {
  const offenders = new Set();
  // Identifiers introduced by a declaration: let/var/const/fn NAME
  const declRe = /\b(?:let|var|const|fn)\s+([A-Za-z_]\w*)/g;
  // Parameter names and struct fields: NAME : type
  const fieldRe = /\b([A-Za-z_]\w*)\s*:/g;
  let m;
  while ((m = declRe.exec(src))) if (WGSL_RESERVED_WORDS.has(m[1])) offenders.add(m[1]);
  while ((m = fieldRe.exec(src))) if (WGSL_RESERVED_WORDS.has(m[1])) offenders.add(m[1]);
  return [...offenders];
}

function createValidatedShaderModule(device, code) {
  const offenders = findReservedWgslIdentifiers(code);
  if (offenders.length) {
    console.error(
      `WGSL reserved-keyword guard: [${offenders.join(", ")}] ` +
        `${offenders.length === 1 ? "is a" : "are"} reserved word(s) in WGSL used as identifier(s). ` +
        "The shader will fail to compile until renamed.",
    );
  }
  return device.createShaderModule({ code });
}

async function ensureGpuRenderer(gpu, shaderKey) {
  // A late rejection after the pending timeout remains a failure, not a reason
  // to restart the same compilation forever while leaving the UI in limbo.
  if (!gpu.rendererPipelineErrors) gpu.rendererPipelineErrors = new Map();
  if (gpu.rendererPipelineErrors.has(shaderKey)) throw gpu.rendererPipelineErrors.get(shaderKey);
  if (!gpu.rendererPipelines.has(shaderKey)) {
    // Compile each feature domain once. The compact garage kernel avoids making
    // Chromium specialize every historical shape/material path for the hero scene.
    if (!gpu.rendererPipelinePromises.has(shaderKey)) {
      const compileStart = performance.now();
      const shaderCode = shaderKey === "garage" ? globalThis.GARAGE_RENDERER_SHADER : gpuRendererShader();
      if (!shaderCode) throw new Error(`Missing ${shaderKey} GPU shader source`);
      outputs.displayBackendLabel.textContent = "Compiling GPU";
      const compilePromise = gpu.device
        .createComputePipelineAsync({
          layout: "auto",
          compute: {
            module: createValidatedShaderModule(gpu.device, shaderCode),
            entryPoint: "main",
          },
        })
        .then((pipeline) => {
          gpu.rendererPipelines.set(shaderKey, pipeline);
          console.log(`${shaderKey} compute pipeline compiled in ${(performance.now() - compileStart).toFixed(0)} ms`);
          if (gpu.rendererDeferred.delete(shaderKey)) render();
          return pipeline;
        })
        .catch((error) => {
          gpu.rendererPipelinePromises.delete(shaderKey);
          gpu.rendererPipelineErrors.set(shaderKey, error);
          if (gpu.rendererDeferred.delete(shaderKey)) render();
          throw error;
        });
      gpu.rendererPipelinePromises.set(shaderKey, compilePromise);
    }
    const compilePromise = gpu.rendererPipelinePromises.get(shaderKey);
    if (shaderKey === "generic") {
      if (gpu.rendererDeferred.has(shaderKey)) return null;
      const compiled = await Promise.race([
        compilePromise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
      ]);
      if (!compiled) {
        gpu.rendererDeferred.add(shaderKey);
        return null;
      }
    } else {
      await compilePromise;
    }
  }

  const paramsBytes = GPU_PARAM_COUNT * Float32Array.BYTES_PER_ELEMENT;
  if (!gpu.paramsBuffer) {
    gpu.paramsBuffer = gpu.device.createBuffer({
      size: paramsBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
  }

  const spheresBytes = MAX_GPU_OBJECTS * GPU_OBJECT_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  if (!gpu.spheresBuffer) {
    gpu.spheresBuffer = gpu.device.createBuffer({
      size: spheresBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
  }

  const lightsBytes = MAX_LIGHT_PANELS * LIGHT_PARAM_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  if (!gpu.lightsBuffer) {
    gpu.lightsBuffer = gpu.device.createBuffer({
      size: lightsBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
  }

  if (shaderKey === "garage" && (!gpu.ltcMatrixTexture || !gpu.ltcAmplitudeTexture || !gpu.ltcSampler)) {
    const data = globalThis.LTC_GGX_DATA;
    if (!data || data.size !== 64) throw new Error("Missing 64x64 GGX LTC lookup data");

    const decode = (encoded) => {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };
    const createLtcTexture = (encoded) => {
      const texture = gpu.device.createTexture({
        size: [data.size, data.size],
        format: "rgba16float",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      gpu.device.queue.writeTexture(
        { texture },
        decode(encoded),
        { bytesPerRow: data.size * 8, rowsPerImage: data.size },
        { width: data.size, height: data.size },
      );
      return texture;
    };
    gpu.ltcMatrixTexture = createLtcTexture(data.matrixBase64);
    gpu.ltcAmplitudeTexture = createLtcTexture(data.amplitudeBase64);
    gpu.ltcSampler = gpu.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      minFilter: "linear",
      magFilter: "linear",
    });
  }
  return gpu.rendererPipelines.get(shaderKey);
}

async function renderWebGpuFrame(settings, width, height) {
  if (webgpuUnavailable) return null;
  try {
    const gpu = await getPresenter();
    configurePresenterCanvas(gpu, width, height);
    const shaderKey = settings.sceneId === "garage" ? "garage" : "generic";
    const rendererPipeline = await ensureGpuRenderer(gpu, shaderKey);
    if (!rendererPipeline) return { pending: true };

    const params = buildGpuRendererParams(settings, width, height);
    const spheres = buildGpuSphereData();
    const lights = buildGpuLightData();
    const backendStart = performance.now();

    gpu.device.queue.writeBuffer(gpu.paramsBuffer, 0, params);
    gpu.device.queue.writeBuffer(gpu.spheresBuffer, 0, spheres);
    gpu.device.queue.writeBuffer(gpu.lightsBuffer, 0, lights);

    // Cache the compute bind group and reuse it every frame. Re-creating it per
    // frame (~3600/min at 60fps) leaks GPU descriptors/texture views until the
    // GPU process is exhausted and crashes ("A valid external Instance reference
    // no longer exists"). The buffers are persistent (writeBuffer updates their
    // contents in place); the bind group only needs rebuilding when the source
    // texture is recreated, which clears gpu.rendererBindGroups in
    // configurePresenterCanvas.
    if (!gpu.rendererBindGroups.has(shaderKey)) {
      const entries = [
        { binding: 0, resource: gpu.sourceTexture.createView() },
        { binding: 1, resource: { buffer: gpu.paramsBuffer } },
        { binding: 2, resource: { buffer: gpu.spheresBuffer } },
        { binding: 3, resource: { buffer: gpu.lightsBuffer } },
      ];
      if (shaderKey === "garage") {
        entries.push(
          { binding: 4, resource: gpu.ltcMatrixTexture.createView() },
          { binding: 5, resource: gpu.ltcAmplitudeTexture.createView() },
          { binding: 6, resource: gpu.ltcSampler },
        );
      }
      gpu.rendererBindGroups.set(shaderKey, gpu.device.createBindGroup({
        layout: rendererPipeline.getBindGroupLayout(0),
        entries,
      }));
    }
    const bindGroup = gpu.rendererBindGroups.get(shaderKey);

    const encoder = gpu.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(rendererPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
    pass.end();
    gpu.device.queue.submit([encoder.finish()]);

    const backendMs = performance.now() - backendStart;
    const displayMs = await drawPresentedTexture(gpu);
    return { backendMs, displayMs };
  } catch (error) {
    if (!gpuRendererWarningShown) {
      console.warn("WebGPU renderer failed; switching to a compatible CPU reference", error);
      gpuRendererWarningShown = true;
    }
    outputs.displayBackendLabel.textContent = "GPU fallback";
    return null;
  }
}

async function getWasmRenderer() {
  if (!wasmRendererPromise) {
    wasmRendererPromise = fetch(`wasm/analytic_renderer.wasm?v=${WASM_RENDERER_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`WASM renderer fetch failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(async (bytes) => {
        if (!WebAssembly.validate(bytes)) throw new Error("WASM renderer is not valid for this browser");
        const module = await WebAssembly.instantiate(bytes, {});
        if (module.instance.exports._initialize) module.instance.exports._initialize();
        return {
          exports: module.instance.exports,
          memory: module.instance.exports.memory,
        };
      });
  }

  return wasmRendererPromise;
}

async function renderWasmFrame(settings, width, height) {
  try {
    if (width > WASM_MAX_WIDTH || height > WASM_MAX_HEIGHT) {
      throw new Error(`WASM renderer buffer is capped at ${WASM_MAX_WIDTH} x ${WASM_MAX_HEIGHT}`);
    }

    const wasm = await getWasmRenderer();
    const exports = wasm.exports;
    const params = buildGpuRendererParams(settings, width, height);
    const spheres = buildGpuSphereData();
    const lights = buildGpuLightData();
    const paramsView = new Float32Array(wasm.memory.buffer, exports.get_params_ptr(), GPU_PARAM_COUNT);
    const spheresView = new Float32Array(
      wasm.memory.buffer,
      exports.get_spheres_ptr(),
      MAX_GPU_OBJECTS * GPU_OBJECT_STRIDE,
    );
    const lightsView = new Float32Array(
      wasm.memory.buffer,
      exports.get_lights_ptr(),
      MAX_LIGHT_PANELS * LIGHT_PARAM_STRIDE,
    );

    paramsView.set(params);
    spheresView.set(spheres);
    lightsView.set(lights);

    const backendStart = performance.now();
    exports.render_frame(width, height);
    const backendMs = performance.now() - backendStart;

    const frame = new Uint8Array(wasm.memory.buffer, exports.get_frame_ptr(), width * height * 4);
    const displayStart = performance.now();
    await presentFrame(frame, width, height);
    const displayMs = performance.now() - displayStart;
    const stats = new Float32Array(wasm.memory.buffer, exports.get_stats_ptr(), 16);

    return {
      backendMs,
      displayMs,
      hitCount: stats[0],
      evalCount: stats[1],
      min: Math.round(stats[2]),
      max: Math.round(stats[3]),
      brightPixels: Math.round(stats[4]),
    };
  } catch (error) {
    if (!wasmRendererWarningShown) {
      console.warn("WASM renderer failed; falling back to JS renderer", error);
      wasmRendererWarningShown = true;
    }
    outputs.displayBackendLabel.textContent = "WASM fallback";
    return null;
  }
}

function analyticKernelValue(x) {
  const x2 = x * x;
  const inv = 1 / Math.sqrt(x2 + 0.32);
  const cosLike = (0.18 + x2) / (1 + x2);
  return inv * cosLike;
}

function analyticalBenchScalar(count, phase) {
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const x = i * 0.0025 + phase;
    acc += analyticKernelValue(x);
  }
  return acc;
}

function mcBenchScalar(count, samples, phase) {
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const x = i * 0.0025 + phase;
    let local = 0;
    for (let s = 0; s < samples; s++) {
      const jitter = ((s * 17 + 11) % 31) * 0.0019;
      local += analyticKernelValue(x + jitter);
    }
    acc += local / samples;
  }
  return acc;
}

function comboBenchScalar(count, samples, phase) {
  return analyticalBenchScalar(count, phase) + mcBenchScalar(count, samples, phase + 0.013);
}

function timeJsBench(count, settings) {
  const start = performance.now();
  const phase = animationPhase + 0.37;
  const result =
    settings.mode === "mc"
      ? mcBenchScalar(count, settings.samples, phase)
      : settings.mode === "split"
        ? comboBenchScalar(count, settings.samples, phase)
        : analyticalBenchScalar(count, phase);
  return { ms: performance.now() - start, result };
}

async function instantiateWasmBench() {
  const response = await fetch(`wasm/analytic_bench.wasm?v=20260612b`);
  const bytes = await response.arrayBuffer();
  if (!WebAssembly.validate(bytes)) {
    throw new Error("SIMD module is not supported by this browser");
  }
  return WebAssembly.instantiate(bytes, {});
}

async function timeWasmBench(count, settings) {
  const module = await instantiateWasmBench();
  const exports = module.instance.exports;
  exports.bench_analytic(16, 0.1);
  const start = performance.now();
  const phase = animationPhase + 0.37;
  const result =
    settings.mode === "mc"
      ? exports.bench_mc(count, settings.samples, phase)
      : settings.mode === "split"
        ? exports.bench_combo(count, settings.samples, phase)
        : exports.bench_analytic(count, phase);
  return { ms: performance.now() - start, result };
}

async function timeWebGpuBench(count, settings) {
  if (!navigator.gpu) throw new Error("not available");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no adapter");

  const device = await adapter.requestDevice();
  const paddedCount = Math.ceil(count / 64) * 64;
  const workgroupCount = Math.ceil(count / 64);
  const outputSize = workgroupCount * 4;
  const samples = Math.max(1, settings.samples);
  const kernelBody =
    settings.mode === "mc"
      ? `acc = mcEval(base, ${samples}u);`
      : settings.mode === "split"
        ? `acc = analyticEval(base) + mcEval(base + 0.013, ${samples}u);`
        : `acc = analyticEval(base);`;
  const shader = `
struct Output {
  values: array<f32>,
};

@group(0) @binding(0) var<storage, read_write> output: Output;
var<workgroup> scratch: array<f32, 64>;

fn analyticEval(x: f32) -> f32 {
  let x2 = x * x;
  let inv = inverseSqrt(x2 + 0.32);
  let cosLike = (0.18 + x2) / (1.0 + x2);
  return inv * cosLike;
}

fn mcEval(x: f32, samples: u32) -> f32 {
  var local = 0.0;
  for (var s = 0u; s < samples; s = s + 1u) {
    let jitter = f32((s * 17u + 11u) % 31u) * 0.0019;
    local = local + analyticEval(x + jitter);
  }
  return local / f32(samples);
}

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>
) {
  let id = gid.x;
  var acc = 0.0;
  if (id >= ${count}u) {
    scratch[lid.x] = 0.0;
  } else {
    let base = f32(id) * 0.0025 + ${Number(animationPhase + 0.37).toFixed(5)};
    ${kernelBody}
    scratch[lid.x] = acc;
  }

  workgroupBarrier();
  for (var stride = 32u; stride > 0u; stride = stride / 2u) {
    if (lid.x < stride) {
      scratch[lid.x] = scratch[lid.x] + scratch[lid.x + stride];
    }
    workgroupBarrier();
  }

  if (lid.x == 0u) {
    output.values[wid.x] = scratch[0];
  }
}`;

  const storage = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: outputSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: shader }),
      entryPoint: "main",
    },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: storage } }],
  });

  async function executeOnce() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, readback, 0, outputSize);

    const start = performance.now();
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(readback.getMappedRange());
    let result = 0;
    for (let i = 0; i < values.length; i++) result += values[i];
    readback.unmap();
    return { ms: performance.now() - start, result };
  }

  await executeOnce();
  const measured = await executeOnce();
  device.destroy();

  return measured;
}

async function runSelectedBackendBench() {
  const settings = readSettings();
  const count = 1 << 18;
  outputs.backendTime.textContent = "running";
  updateOutputs(settings);

  try {
    const result =
      settings.backend === "wasm"
        ? await timeWasmBench(count, settings)
        : settings.backend === "webgpu"
          ? await timeWebGpuBench(count, settings)
          : timeJsBench(count, settings);
    outputs.backendTime.textContent = formatMs(result.ms);
    window.__backendBench = {
      backend: settings.backend,
      mode: settings.mode,
      samples: settings.samples,
      time: outputs.backendTime.textContent,
      count,
      result: Number(result.result.toFixed(3)),
    };
  } catch (error) {
    outputs.backendTime.textContent = "unavailable";
    window.__backendBench = {
      backend: settings.backend,
      mode: settings.mode,
      error: String(error.message || error),
      count,
    };
  }
  document.documentElement.dataset.backendBench = JSON.stringify(window.__backendBench);
}

function scheduleSelectedBackendBench() {
  clearTimeout(backendBenchTimer);
  outputs.backendTime.textContent = "pending";
  backendBenchTimer = setTimeout(runSelectedBackendBench, 220);
}

canvasWrap.addEventListener("pointerdown", (event) => {
  if (getMode() !== "split") return;
  draggingSplit = true;
  canvasWrap.setPointerCapture(event.pointerId);
  setSplitFromPointer(event);
});

canvasWrap.addEventListener("pointermove", (event) => {
  if (!draggingSplit) return;
  setSplitFromPointer(event);
});

canvasWrap.addEventListener("pointerup", (event) => {
  if (!draggingSplit) return;
  draggingSplit = false;
  canvasWrap.releasePointerCapture(event.pointerId);
});

canvasWrap.addEventListener("pointercancel", (event) => {
  draggingSplit = false;
  if (canvasWrap.hasPointerCapture(event.pointerId)) canvasWrap.releasePointerCapture(event.pointerId);
});

let activeBackend = "webgpu";
let savedGpuProfile = null;
let backendSwitchNotice = "";
let backendInfoOpener = null;

function applyProfile(profile) {
  selectExperiment(profile.sceneId);
  for (const [key, value] of Object.entries(profile)) {
    if (key === "backend" || key === "sceneId") continue;
    const control = controls[key];
    if (!control) continue;
    if (Array.isArray(control)) control.forEach(input => { input.checked = input.value === value; });
    else if (control.type === "checkbox") control.checked = !!value;
    else if ("value" in control) control.value = String(value);
  }
}

function switchBackend(next, { initial = false, reason = "" } = {}) {
  if (!initial && activeBackend === next) return;
  const current = readSettings();
  selectionEpoch++;
  if (activeBackend === "webgpu" && !initial) savedGpuProfile = { ...current, backend: "webgpu" };
  if (next === "webgpu") {
    if (savedGpuProfile) applyProfile(savedGpuProfile);
    backendSwitchNotice = reason || (savedGpuProfile ? "Restored the previous GPU scene and its quality settings." : "JS and WASM open supported diffuse studies. Returning to GPU restores this scene.");
  } else {
    if (initial) savedGpuProfile = { ...current, backend: "webgpu" };
    const defaultScale = BackendPolicy.defaults[activeBackend]?.renderScale;
    const requested = next !== activeBackend && current.renderScale === defaultScale
      ? { ...current, renderScale: BackendPolicy.defaults[next].renderScale }
      : current;
    const profile = BackendPolicy.cpuProfile(next, requested);
    applyProfile(profile);
    backendSwitchNotice = reason || `${next === "wasm" ? "WASM" : "JavaScript"} · ${sceneOptionLabels.get(profile.sceneId)} · ${Math.round(200 * profile.renderScale)} px image height, up to ${profile.targetFps} fps. GPU-only features are not applicable.`;
  }
  controls.backend.forEach(input => { input.checked = input.value === next; });
  activeBackend = next;
  physicsState = null;
  lastFrameStartTime = 0;
  updateBackendChrome();
  scheduleAnimationLoop();
}

function updateBackendChrome() {
  const cpu = getBackend() !== "webgpu";
  const badge = document.querySelector("#backendApplicability");
  badge.textContent = cpu ? "Garage features · not applicable" : "Full material path";
  badge.title = cpu ? "Fitted GGX, clearcoat, material textures and atmosphere are not implemented in this project's CPU paths. Learn more explains the supported scenes and measured timings." : "WebGPU implements the full garage. JS/WASM provide the common diffuse reference.";
  badge.dataset.limited = String(cpu);
  document.querySelector("#backendNotice").textContent = backendSwitchNotice || "The full garage uses the WebGPU material renderer. CPU modes open the shared diffuse studies.";
  document.querySelectorAll("[data-scene-group]").forEach(button => {
    const limited = cpu && button.dataset.sceneGroup !== "diffuse";
    button.setAttribute("aria-disabled", String(limited));
    button.title = limited ? "Not applicable to the CPU reference. Learn more about backend support." : "";
  });
  for (const key of ["aaSamples", "aperture", "focusDistance"]) {
    controls[key].disabled = cpu;
    controls[key].title = cpu ? "Not applicable: this control is implemented in the GPU renderer." : "";
  }
}

function openBackendInfo(opener) {
  const panel = document.querySelector("#backendInfo");
  if (!panel.hidden) return;
  backendInfoOpener = opener;
  panel.hidden = false;
  document.querySelector("#closeBackendInfo").focus({ preventScroll: true });
}

document.querySelector("#backendLearnMore").addEventListener("click", event => openBackendInfo(event.currentTarget));
document.querySelector("#closeBackendInfo").addEventListener("click", () => {
  document.querySelector("#backendInfo").hidden = true;
  backendInfoOpener?.focus({ preventScroll: true });
});
document.querySelector("#backendApplicability").addEventListener("click", event => openBackendInfo(event.currentTarget));
document.querySelector("#backendApplicability").addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBackendInfo(event.currentTarget); }
});

for (const input of [
  ...controls.mode,
  ...controls.backend,
  controls.sceneSelect,
  controls.lightWidth,
  controls.lightDepth,
  controls.lightHeight,
  controls.materialView,
  controls.floorRoughness,
  controls.normalStrength,
  controls.coatWeight,
  controls.blendStrength,
  controls.textureScale,
  controls.mediumDensity,
  controls.mediumMode,
  controls.mediumAlbedo,
  controls.mediumFrequency,
  controls.mediumSteps,
  controls.mediumAnimate,
  controls.mediumOnly,
  controls.groundFlow,
  controls.lightFrame,
  controls.extraFancy,
  controls.samples,
  controls.exposure,
  controls.aaSamples,
  controls.renderScale,
  controls.aperture,
  controls.focusDistance,
  controls.targetFps,
  controls.animate,
  controls.bounceFill,
  controls.horizonClip,
  controls.showFalseColor,
]) {
  input.addEventListener("input", () => {
    if (controls.backend.includes(input)) switchBackend(input.value);
    if (input === controls.sceneSelect) { physicsState = null; selectionEpoch++; }
    render();
    if ([controls.animate, controls.targetFps, controls.mediumDensity, controls.mediumAnimate, controls.extraFancy].includes(input)) scheduleAnimationLoop();
  });
  input.addEventListener("change", () => {
    if (controls.backend.includes(input)) switchBackend(input.value);
    render();
    if ([controls.animate, controls.targetFps, controls.mediumDensity, controls.mediumAnimate, controls.extraFancy].includes(input)) scheduleAnimationLoop();
  });
}

controls.renderButton.addEventListener("click", render);
controls.seedButton.addEventListener("click", () => {
  seed = (seed * 1103515245 + 12345) >>> 0;
  physicsState = null;
  render();
});
controls.benchButton.addEventListener("click", runSelectedBackendBench);

document.querySelectorAll("[data-scene-group]").forEach(button => {
  button.addEventListener("click", () => {
    const family = EXPERIMENT_FAMILIES.find(item => item.id === button.dataset.sceneGroup);
    if (!BackendPolicy.supportsScene(getBackend(), family.home)) { openBackendInfo(button); return; }
    selectionEpoch++;
    selectExperiment(family.home);
    physicsState = null;
    render();
  });
});
document.querySelector("#diffuseReferenceButton").addEventListener("click", () => {
  selectionEpoch++;
  selectExperiment("studio");
  controls.mode.find(input => input.value === "split").checked = true;
  controls.animate.checked = false;
  controls.bounceFill.checked = false;
  controls.horizonClip.checked = true;
  physicsState = null;
  render();
  scheduleAnimationLoop();
});

const ltcInspector = globalThis.LTCInspector?.mount(document.querySelector("#ltcProbe"), globalThis.LTC_GGX_DATA) || { update() {} };
applyUrlParams();
switchBackend(getBackend(), { initial: true });
if (new URLSearchParams(window.location.search).has("nogpu")) {
  webgpuUnavailable = true;
  console.warn("nogpu URL param set: forcing Canvas2D (CPU) presentation");
}
render();
scheduleAnimationLoop();
outputs.backendTime.textContent = "Run on request";
new ResizeObserver(() => render()).observe(canvasWrap);
