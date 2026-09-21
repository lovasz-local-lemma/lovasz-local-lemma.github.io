import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const panel = document.querySelector('[data-view-panel="nlos3d"]');
const worldCanvas = document.getElementById("nlos3dWorldCanvas");
const reconCanvas = document.getElementById("nlos3dReconCanvas");

if (panel && worldCanvas && reconCanvas) {
  initializeNlos3d();
}

function initializeNlos3d() {
  const els = {};
  [
    "nlos3dRuntimeBadge",
    "nlos3dRunButton",
    "nlos3dResetButton",
    "nlos3dTruthButton",
    "nlos3dNoise",
    "nlos3dNoiseValue",
    "nlos3dWorldBadge",
    "nlos3dReconBadge",
    "nlos3dPathBadge",
    "nlos3dCueBadge",
    "nlos3dPointBadge",
    "nlos3dPhaseLabel",
    "nlos3dProgressBar",
    "nlos3dProgressLabel",
    "nlos3dMeasurementMetric",
    "nlos3dDepthMetric",
    "nlos3dConfidenceMetric",
    "nlos3dFailureMetric",
    "nlos3dLimitMetric",
    "nlos3dTransientPlay",
    "nlos3dTransientBin",
    "nlos3dTransientValue",
    "nlos3dLimitNote",
    "nlos3dSignalBadge",
    "nlos3dSignalCanvas",
    "nlos3dScanBadge",
    "nlos3dShotTitle",
    "nlos3dShotCount",
    "nlos3dShotDetail",
    "nlos3dShotCanvas",
    "nlos3dProjectionCanvas",
    "nlos3dProjectionTitle",
    "nlos3dProjectionMeta",
    "nlos3dMaterialPolicy",
    "nlos3dAcquisitionPolicyLabel",
    "nlos3dAcquisitionPolicy",
    "nlos3dBudgetLabel",
    "nlos3dReconTitle",
    "nlos3dForwardStage",
    "nlos3dEvidenceStage",
    "nlos3dInverseStage",
    "nlos3dOutputStage",
    "nlos3dLegendOutbound",
    "nlos3dLegendIndirect"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  const modeProfiles = {
    active: {
      label: "pulsed ToF",
      path: "sensor -> relay -> target -> relay -> sensor",
      cue: "confocal time-of-flight",
      signal: "rectified confocal wall-time tensor",
      depth: "quadratic resample + padded 3D Wiener FFT",
      failure: "scaled synthetic transient; ideal geometry and timing calibration",
      forward: "confocal three-bounce transient A x",
      inverse: "O'Toole et al. Wiener Light Cone Transform",
      output: "nonnegative 3D albedo volume",
      resultTitle: "Recovered hidden volume",
      duration: 4300,
      color: 0x49d0bd
    },
    structured: {
      label: "dual photography",
      path: "projector patterns -> transport -> camera response",
      cue: "Helmholtz reciprocity",
      signal: "measured Hadamard coefficients + dual image",
      depth: "inverse Hadamard correlation",
      failure: "reciprocal image only; no metric depth",
      forward: "one measured transport row",
      inverse: "inverse Hadamard transform",
      output: "2D reciprocal image",
      resultTitle: "Recovered reciprocal view",
      duration: 2100,
      color: 0x7ba7ff
    },
    passive: {
      label: "passive edge camera",
      path: "hidden radiance -> floor penumbra -> RGB camera",
      cue: "edge visibility angle",
      signal: "computed floor-space x frame exposure stack",
      depth: "calibrated angular finite difference",
      failure: "single edge has no height, shape, or range",
      forward: "edge-visibility floor integral",
      inverse: "background subtraction + temporal average + derivative",
      output: "1D angular radiance",
      resultTitle: "Recovered angular radiance",
      duration: 2800,
      color: 0xf0ba5d
    }
  };

  const targetLabels = {
    calibration: "retroreflective S benchmark",
    person: "person",
    chair: "chair",
    bicycle: "bicycle"
  };

  const state = {
    mode: "active",
    // Only the active lane has a choice of reconstructor; the structured and passive lanes
    // each have exactly one implemented inverse.
    inverse: "lct",
    material: "auto",
    transientBin: 0,
    transientPlaying: false,
    aperture: "edge",
    target: "calibration",
    budget: 256,
    noise: 0.08,
    progress: 0,
    running: false,
    startedAt: 0,
    showTruth: false,
    active: panel.classList.contains("active"),
    recoveredCount: 0,
    totalPoints: 0,
    lastSignalBucket: -1,
    result: null,
    solving: false,
    workerProgress: 0,
    workerPhase: "idle",
    jobId: 0,
    error: "",
    evidence: null,
    snapshots: [],
    displayedSnapshot: -1,
    currentSnapshot: null,
    lastAcquiredScan: -1,
    lastAcquisitionVisual: -1
  };

  let worldRenderer;
  let reconRenderer;
  try {
    worldRenderer = makeRenderer(worldCanvas);
    reconRenderer = makeRenderer(reconCanvas);
  } catch (error) {
    if (els.nlos3dRuntimeBadge) {
      els.nlos3dRuntimeBadge.textContent = "3D renderer unavailable";
      els.nlos3dRuntimeBadge.classList.add("warn");
    }
    console.warn("NLOS 3D scene unavailable", error);
    return;
  }

  const worldScene = new THREE.Scene();
  worldScene.background = new THREE.Color(0x0b0e12);
  worldScene.fog = new THREE.Fog(0x0b0e12, 9, 18);
  const reconScene = new THREE.Scene();
  reconScene.background = new THREE.Color(0x0a0d10);

  const worldCamera = new THREE.PerspectiveCamera(43, 1, 0.05, 60);
  worldCamera.position.set(7.2, 5.8, 8.5);
  const reconCamera = new THREE.PerspectiveCamera(39, 1, 0.05, 40);
  reconCamera.position.set(4.3, 2.9, 5.3);

  const worldControls = new OrbitControls(worldCamera, worldCanvas);
  worldControls.target.set(-0.05, 1.0, -0.75);
  worldControls.enableDamping = true;
  worldControls.dampingFactor = 0.06;
  worldControls.minDistance = 4.5;
  worldControls.maxDistance = 16;
  worldControls.maxPolarAngle = Math.PI * 0.49;

  const reconControls = new OrbitControls(reconCamera, reconCanvas);
  reconControls.target.set(0, 1.15, 0);
  reconControls.enableDamping = true;
  reconControls.dampingFactor = 0.065;
  reconControls.minDistance = 2.8;
  reconControls.maxDistance = 9;
  reconControls.maxPolarAngle = Math.PI * 0.54;

  const worldRoot = new THREE.Group();
  const reconRoot = new THREE.Group();
  worldScene.add(worldRoot);
  reconScene.add(reconRoot);

  const hiddenOrigin = new THREE.Vector3(1.35, 0.03, -0.4);
  const relayPoint = new THREE.Vector3(1.35, 1.4, -3.1);
  const sensorPoint = new THREE.Vector3(-3.45, 1.32, 2.72);
  const edgePoint = new THREE.Vector3(0, 0.03, -0.95);
  const roomLightPoint = new THREE.Vector3(2.9, 3.1, -0.15);
  const geometryConfig = {
    hiddenOrigin: hiddenOrigin.toArray(),
    edgePoint: edgePoint.toArray(),
    wallZ: -3.2,
    relayBounds: [0.1, 2.6, 0.15, 2.65]
  };
  const occluderBounds = {
    min: new THREE.Vector3(-0.11, 0, -0.35),
    max: new THREE.Vector3(0.11, 3.0, 1.55)
  };
  const transportGroup = new THREE.Group();
  worldScene.add(transportGroup);
  const scanMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0x49d0bd })
  );
  scanMarker.position.copy(relayPoint);
  worldScene.add(scanMarker);

  let worldTarget = null;
  let reconTruth = null;
  let reconPoints = null;
  let worldPoints = null;
  let transportMaterials = [];
  let targetSamples = null;
  let inverseWorker = null;
  let scanGridPoints = null;
  let patternPlane = null;
  let patternTexture = null;
  let transientPlane = null;
  let transientTexture = null;
  let hardwareGroup = null;
  let hardwareLabel = null;
  let roomLightGroup = null;

  try {
    // Versioned so a changed worker contract is not masked by a cached script.
    inverseWorker = new Worker(new URL("./nlos-worker.js?v=nlos-inverses-1", import.meta.url));
    inverseWorker.addEventListener("message", handleWorkerMessage);
  } catch (error) {
    state.error = "inverse worker unavailable";
    console.warn("NLOS inverse worker unavailable", error);
  }

  buildWorldScene();
  buildReconScene();
  rebuildTarget();
  bindControls();
  updateControls();
  updateDiagnostics();
  drawSignal();
  drawProjection();
  drawShotLedger();

  if (els.nlos3dRuntimeBadge) {
    els.nlos3dRuntimeBadge.textContent = inverseWorker ? "WebGL + worker 3D FFT" : "3D scene only";
    els.nlos3dRuntimeBadge.classList.add("ready");
  }

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer(worldRenderer, worldCamera, worldCanvas);
    resizeRenderer(reconRenderer, reconCamera, reconCanvas);
  });
  resizeObserver.observe(worldCanvas);
  resizeObserver.observe(reconCanvas);

  document.addEventListener("inverse-view-change", (event) => {
    state.active = event.detail?.view === "nlos3d";
    if (state.active) {
      resizeRenderer(worldRenderer, worldCamera, worldCanvas);
      resizeRenderer(reconRenderer, reconCamera, reconCanvas);
    }
  });

  requestAnimationFrame(animate);

  function makeRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return renderer;
  }

  function buildWorldScene() {
    worldScene.add(new THREE.HemisphereLight(0xb8d5e8, 0x23211f, 1.42));
    const key = new THREE.DirectionalLight(0xffebc7, 2.35);
    key.position.set(-3.2, 6.8, 4.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    worldScene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 10),
      new THREE.MeshStandardMaterial({ color: 0x292d31, roughness: 0.94, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.5);
    floor.receiveShadow = true;
    worldRoot.add(floor);

    const grid = new THREE.GridHelper(10, 20, 0x47515b, 0x2f363e);
    grid.position.y = 0.008;
    grid.position.z = -0.5;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    worldRoot.add(grid);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xa5a49b, roughness: 0.9, metalness: 0 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.25, 0.16), wallMaterial);
    backWall.position.set(0, 1.625, -3.2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    worldRoot.add(backWall);

    const occluder = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 3.0, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x24292e, roughness: 0.82, metalness: 0.08 })
    );
    occluder.position.set(0, 1.5, 0.6);
    occluder.castShadow = true;
    occluder.receiveShadow = true;
    worldRoot.add(occluder);

    const relay = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 2.5),
      new THREE.MeshStandardMaterial({ color: 0xd3d5cd, roughness: 0.98, emissive: 0x101514, emissiveIntensity: 0.32 })
    );
    relay.position.set(1.35, 1.4, -3.108);
    relay.receiveShadow = true;
    worldRoot.add(relay);

    const floorPatch = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 1.0),
      new THREE.MeshStandardMaterial({
        color: 0x5e5137,
        emissive: 0x3e2b12,
        emissiveIntensity: 0.34,
        roughness: 1,
        transparent: true,
        opacity: 0.72
      })
    );
    floorPatch.rotation.x = -Math.PI / 2;
    floorPatch.position.set(-0.72, 0.018, -1.18);
    worldRoot.add(floorPatch);

    const edgeMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 3.0, 10),
      new THREE.MeshBasicMaterial({ color: 0xf0ba5d, transparent: true, opacity: 0.78 })
    );
    edgeMarker.position.set(edgePoint.x - 0.11, 1.5, edgePoint.z + 0.02);
    worldRoot.add(edgeMarker);

    const hiddenZone = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.1, 2.8, 3.2)),
      new THREE.LineBasicMaterial({ color: 0xed7c91, transparent: true, opacity: 0.28 })
    );
    hiddenZone.position.set(hiddenOrigin.x, 1.4, hiddenOrigin.z);
    worldRoot.add(hiddenZone);

    hardwareGroup = makeSensorHardware();
    hardwareGroup.position.copy(sensorPoint);
    hardwareGroup.lookAt(relayPoint);
    worldRoot.add(hardwareGroup);

    hardwareLabel = makeSceneLabel("CONFOCAL LASER + SPAD", sensorPoint.clone().add(new THREE.Vector3(0, 0.74, 0)), 0x86e0d2, 1.28);
    worldRoot.add(hardwareLabel);
    roomLightGroup = new THREE.Group();
    const roomEmitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xffe2a1, emissive: 0xf0ba5d, emissiveIntensity: 3.2 })
    );
    roomLightGroup.add(roomEmitter);
    const roomLight = new THREE.PointLight(0xffd790, 4.2, 5.5, 1.7);
    roomLightGroup.add(roomLight);
    roomLightGroup.add(makeSceneLabel("ROOM LIGHT", new THREE.Vector3(0, 0.48, 0), 0xf0ba5d, 0.76));
    roomLightGroup.position.copy(roomLightPoint);
    roomLightGroup.visible = false;
    worldRoot.add(roomLightGroup);
    worldRoot.add(makeSceneLabel("DIFFUSE RELAY WALL", new THREE.Vector3(1.35, 2.88, -3.02), 0xe1e4dc, 1.24));
    worldRoot.add(makeSceneLabel("DIRECT-VIEW BLOCKER", new THREE.Vector3(-0.05, 2.56, 0.45), 0xed7c91, 1.32));
    worldRoot.add(makeSceneLabel("HIDDEN TARGET", hiddenOrigin.clone().add(new THREE.Vector3(0.52, 2.62, 0)), 0xf0ba5d, 1.0));

    addBlockedSightLine();
  }

  function buildReconScene() {
    reconScene.add(new THREE.HemisphereLight(0xc8def0, 0x17191d, 1.8));
    const light = new THREE.DirectionalLight(0xffffff, 2.1);
    light.position.set(4, 6, 5);
    reconScene.add(light);
    const grid = new THREE.GridHelper(5.5, 18, 0x52606a, 0x293038);
    grid.position.y = 0;
    grid.material.transparent = true;
    grid.material.opacity = 0.43;
    reconScene.add(grid);
    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.5, 3.0, 2.5)),
      new THREE.LineBasicMaterial({ color: 0x7ba7ff, transparent: true, opacity: 0.22 })
    );
    bounds.position.y = 1.45;
    reconScene.add(bounds);
  }

  function makeSensorHardware() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.34, metalness: 0.62 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x49d0bd, emissive: 0x173f39, emissiveIntensity: 1.1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.52), bodyMaterial);
    body.castShadow = true;
    group.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.24, 24), bodyMaterial.clone());
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.34;
    group.add(lens);
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), accentMaterial);
    emitter.position.set(0.25, 0.05, -0.3);
    group.add(emitter);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.1, 12), bodyMaterial);
    stand.position.y = -0.72;
    group.add(stand);
    group.userData.emitterMaterial = accentMaterial;
    return group;
  }

  function replaceHardwareLabel(text, color, width) {
    if (hardwareLabel) {
      worldRoot.remove(hardwareLabel);
      hardwareLabel.material.map?.dispose?.();
      hardwareLabel.material.dispose();
    }
    hardwareLabel = makeSceneLabel(text, sensorPoint.clone().add(new THREE.Vector3(0, 0.74, 0)), color, width);
    worldRoot.add(hardwareLabel);
  }

  function makeSceneLabel(text, position, color, width = 1.5) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(7, 10, 13, 0.88)";
    ctx.beginPath();
    ctx.roundRect(3, 3, 506, 90, 12);
    ctx.fill();
    ctx.strokeStyle = `#${new THREE.Color(color).getHexString()}`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#f3f6f3";
    ctx.font = "700 25px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 50);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.copy(position);
    sprite.scale.set(width * 1.72, width * 0.32, 1);
    sprite.renderOrder = 5;
    return sprite;
  }

  function addBlockedSightLine() {
    const targetCenter = hiddenOrigin.clone().add(new THREE.Vector3(0, 1.28, 0));
    const direction = targetCenter.clone().sub(sensorPoint);
    const intersectionT = (0 - sensorPoint.x) / direction.x;
    const hit = sensorPoint.clone().add(direction.multiplyScalar(intersectionT));
    const blockedMaterial = new THREE.LineDashedMaterial({
      color: 0xed7c91,
      transparent: true,
      opacity: 0.78,
      dashSize: 0.16,
      gapSize: 0.1
    });
    const blockedLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([sensorPoint, hit]),
      blockedMaterial
    );
    blockedLine.computeLineDistances();
    worldRoot.add(blockedLine);

    const occludedLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([hit, targetCenter]),
      new THREE.LineDashedMaterial({
        color: 0xed7c91,
        transparent: true,
        opacity: 0.18,
        dashSize: 0.12,
        gapSize: 0.14
      })
    );
    occludedLine.computeLineDistances();
    worldRoot.add(occludedLine);

    const hitMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.026, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xed7c91 })
    );
    hitMarker.position.copy(hit).add(new THREE.Vector3(-0.11, 0, 0));
    hitMarker.rotation.y = Math.PI / 2;
    worldRoot.add(hitMarker);
    if (!segmentIntersectsOccluder(sensorPoint, targetCenter)) {
      console.warn("NLOS scene invariant failed: direct path does not hit the blocker");
    }
  }

  function segmentIntersectsOccluder(start, end) {
    const direction = end.clone().sub(start);
    let near = 0;
    let far = 1;
    for (const axis of ["x", "y", "z"]) {
      if (Math.abs(direction[axis]) < 1e-8) {
        if (start[axis] < occluderBounds.min[axis] || start[axis] > occluderBounds.max[axis]) return false;
        continue;
      }
      const inverse = 1 / direction[axis];
      let t0 = (occluderBounds.min[axis] - start[axis]) * inverse;
      let t1 = (occluderBounds.max[axis] - start[axis]) * inverse;
      if (t0 > t1) [t0, t1] = [t1, t0];
      near = Math.max(near, t0);
      far = Math.min(far, t1);
      if (near > far) return false;
    }
    return far >= 0 && near <= 1;
  }

  function handleWorkerMessage(event) {
    const { type, jobId, result, progress, phase, message, evidence, snapshot } = event.data || {};
    if (jobId !== state.jobId) return;
    if (type === "progress") {
      state.workerProgress = progress;
      state.workerPhase = phase;
      updateDiagnostics();
      return;
    }
    if (type === "evidence") {
      state.evidence = evidence;
      drawSignal();
      updateDiagnostics();
      return;
    }
    if (type === "snapshot") {
      state.snapshots.push(snapshot);
      state.snapshots.sort((a, b) => snapshotAcquiredUnits(a) - snapshotAcquiredUnits(b));
      applyProgressiveSnapshot();
      updateDiagnostics();
      return;
    }
    if (type === "error") {
      state.solving = false;
      state.running = false;
      state.error = message || "inverse operator failed";
      updateControls();
      updateDiagnostics();
      return;
    }
    if (type !== "result") return;

    state.result = result;
    state.solving = false;
    state.workerProgress = 1;
    state.workerPhase = "operator complete";
    state.error = "";
    if (!state.evidence) state.evidence = result;
    applyProgressiveSnapshot();
    if (!state.currentSnapshot && state.progress >= 0.999) rebuildRecoveredPoints(result, true);
    drawSignal();
    drawProjection();
    updateControls();
    updateDiagnostics();
    if (els.nlos3dRuntimeBadge) {
      els.nlos3dRuntimeBadge.textContent = state.mode === "active"
        ? `Wiener LCT ${result.elapsedMs.toFixed(0)} ms`
        : `${modeProfiles[state.mode].label} inverse ${result.elapsedMs.toFixed(0)} ms`;
    }
  }

  function requestReconstruction() {
    if (!inverseWorker || !targetSamples) {
      state.error = "inverse worker unavailable";
      state.running = false;
      updateControls();
      updateDiagnostics();
      return;
    }
    state.jobId += 1;
    state.solving = true;
    state.workerProgress = 0;
    state.workerPhase = "assembling forward operator";
    state.error = "";
    state.evidence = null;
    state.snapshots = [];
    state.displayedSnapshot = -1;
    state.currentSnapshot = null;
    const positions = targetSamples.positions.slice();
    const normals = targetSamples.normals.slice();
    inverseWorker.postMessage({
      type: "reconstruct",
      jobId: state.jobId,
      payload: {
        mode: state.mode,
        // The inverse is an axis independent of the acquisition: all three reconstructors see
        // the same measurement tensor, so a difference between them is the estimator's.
        inverse: state.inverse,
        // "auto" keeps the worker's historical target-derived default.
        material: state.material === "auto" ? undefined : state.material,
        aperture: state.aperture,
        target: state.target,
        budget: state.budget,
        noise: state.noise,
        geometry: geometryConfig,
        samples: { positions, normals }
      }
    }, [positions.buffer, normals.buffer]);
  }

  function bindControls() {
    document.querySelectorAll("[data-nlos3d-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.getAttribute("data-nlos3d-mode") || "active";
        resetCapture(true);
      });
    });
    document.querySelectorAll("[data-nlos3d-target]").forEach((button) => {
      button.addEventListener("click", () => {
        state.target = button.getAttribute("data-nlos3d-target") || "calibration";
        rebuildTarget();
        resetCapture(true);
      });
    });
    document.querySelectorAll("[data-nlos3d-inverse]").forEach((button) => {
      button.addEventListener("click", () => {
        state.inverse = button.getAttribute("data-nlos3d-inverse") || "lct";
        resetCapture(true);
      });
    });
    document.querySelectorAll("[data-nlos3d-material]").forEach((button) => {
      button.addEventListener("click", () => {
        state.material = button.getAttribute("data-nlos3d-material") || "auto";
        resetCapture(true);
      });
    });
    document.querySelectorAll("[data-nlos3d-aperture]").forEach((button) => {
      button.addEventListener("click", () => {
        state.aperture = button.getAttribute("data-nlos3d-aperture") || "edge";
        resetCapture(true);
      });
    });
    els.nlos3dTransientPlay?.addEventListener("click", () => {
      state.transientPlaying = !state.transientPlaying;
      syncTransientControls();
    });
    els.nlos3dTransientBin?.addEventListener("input", () => {
      state.transientPlaying = false;
      state.transientBin = Number(els.nlos3dTransientBin.value) || 0;
      updateTransientPlane();
      syncTransientControls();
    });
    document.querySelectorAll("[data-nlos3d-budget]").forEach((button) => {
      button.addEventListener("click", () => {
        state.budget = Number(button.getAttribute("data-nlos3d-budget")) || 256;
        resetCapture(true);
      });
    });
    els.nlos3dNoise?.addEventListener("input", () => {
      state.noise = Number(els.nlos3dNoise.value);
      if (els.nlos3dNoiseValue) els.nlos3dNoiseValue.value = state.noise.toFixed(2);
      resetCapture(true);
    });
    els.nlos3dRunButton?.addEventListener("click", () => {
      if (state.running) {
        state.running = false;
      } else {
        if (state.progress >= 0.999) resetCapture(false);
        state.running = true;
        state.startedAt = performance.now() - state.progress * captureDuration();
        if (!state.result && !state.solving) requestReconstruction();
      }
      updateControls();
    });
    els.nlos3dResetButton?.addEventListener("click", () => resetCapture(false));
    els.nlos3dTruthButton?.addEventListener("click", () => {
      state.showTruth = !state.showTruth;
      if (reconTruth) reconTruth.visible = state.showTruth;
      updateControls();
      drawProjection();
    });
  }

  function rebuildTarget() {
    if (worldTarget) worldRoot.remove(worldTarget);
    if (reconTruth) reconRoot.remove(reconTruth);
    const target = makeTarget(state.target);
    target.updateMatrixWorld(true);
    targetSamples = sampleTargetSurfaceData(target, state.target === "calibration" ? 3600 : 3000, hashSeed(state.target, "truth", 17));

    worldTarget = target.clone(true);
    worldTarget.position.copy(hiddenOrigin);
    worldTarget.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    worldRoot.add(worldTarget);

    reconTruth = target.clone(true);
    reconTruth.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshBasicMaterial({
        color: 0xe7f4ef,
        wireframe: true,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      });
    });
    reconTruth.visible = state.showTruth;
    reconRoot.add(reconTruth);
    clearRecoveredPoints();
    rebuildTransport();
  }

  function snapshotAcquiredUnits(snapshot) {
    return snapshot.acquiredUnits ?? snapshot.acquiredScans ?? snapshot.acquiredPairs ?? snapshot.acquiredFrames ?? 0;
  }

  function applyProgressiveSnapshot() {
    const desiredUnits = Math.floor(state.progress * state.budget + 1e-6);
    let nextIndex = -1;
    for (let index = 0; index < state.snapshots.length; index += 1) {
      if (snapshotAcquiredUnits(state.snapshots[index]) <= desiredUnits) nextIndex = index;
      else break;
    }
    if (state.progress >= 0.999 && state.snapshots.length) nextIndex = state.snapshots.length - 1;
    if (nextIndex === state.displayedSnapshot) return;
    state.displayedSnapshot = nextIndex;
    state.currentSnapshot = nextIndex >= 0 ? state.snapshots[nextIndex] : null;
    if (state.currentSnapshot) rebuildRecoveredPoints(state.currentSnapshot, true);
    else clearRecoveredPoints();
    drawProjection();
    drawSignal();
  }

  function clearRecoveredPoints() {
    if (reconPoints) {
      reconRoot.remove(reconPoints);
      reconPoints.geometry.dispose();
      reconPoints.material.dispose();
      reconPoints = null;
    }
    if (worldPoints) {
      worldRoot.remove(worldPoints);
      worldPoints.geometry.dispose();
      worldPoints.material.dispose();
      worldPoints = null;
    }
    state.totalPoints = 0;
    state.recoveredCount = 0;
  }

  function rebuildRecoveredPoints(result, revealAll = false) {
    clearRecoveredPoints();
    const profile = modeProfiles[state.mode];
    const positions = result.positions;
    const colors = new Float32Array(result.weights.length * 3);
    const tint = new THREE.Color(profile.color);
    const lowTint = new THREE.Color(0xed7c91);
    for (let i = 0; i < result.weights.length; i += 1) {
      const base = i * 3;
      const color = lowTint.clone().lerp(tint, THREE.MathUtils.clamp(result.weights[i], 0, 1));
      colors[base] = color.r;
      colors[base + 1] = color.g;
      colors[base + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, revealAll ? result.weights.length : 0);
    const material = new THREE.PointsMaterial({
      size: state.mode === "active" ? 0.115 : state.mode === "passive" ? 0.072 : state.target === "bicycle" ? 0.052 : 0.062,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false
    });
    reconPoints = new THREE.Points(geometry, material);
    reconRoot.add(reconPoints);

    if (state.mode !== "passive") {
      worldPoints = new THREE.Points(geometry.clone(), material.clone());
      worldPoints.position.copy(hiddenOrigin);
      worldPoints.material.opacity = 0.34;
      worldRoot.add(worldPoints);
    }
    state.totalPoints = result.weights.length;
    state.recoveredCount = revealAll ? result.weights.length : 0;
  }

  function makeTarget(kind) {
    if (kind === "calibration") return makeCalibrationTarget();
    if (kind === "chair") return makeChair();
    if (kind === "bicycle") return makeBicycle();
    return makePerson();
  }

  function makeCalibrationTarget() {
    const group = new THREE.Group();
    const retroreflector = new THREE.MeshStandardMaterial({
      color: 0xe8f4ed,
      emissive: 0x2b6258,
      emissiveIntensity: 0.42,
      roughness: 0.93,
      metalness: 0
    });
    const rows = [
      "011111110",
      "111111111",
      "110000000",
      "110000000",
      "111111100",
      "011111110",
      "000001111",
      "000000011",
      "000000011",
      "111111111",
      "011111110"
    ];
    const cell = 0.185;
    for (let row = 0; row < rows.length; row += 1) {
      for (let column = 0; column < rows[row].length; column += 1) {
        if (rows[row][column] !== "1") continue;
        addBox(
          group,
          [cell * 1.04, cell * 1.04, 0.1],
          retroreflector,
          [(column - 4) * cell, 0.36 + (rows.length - 1 - row) * cell, 0]
        );
      }
    }
    return group;
  }

  function makePerson() {
    const group = new THREE.Group();
    const cloth = makeMaterial(0x557f93, 0.72, 0.06);
    const skin = makeMaterial(0xc99672, 0.8, 0.01);
    const dark = makeMaterial(0x252b31, 0.82, 0.03);
    addMesh(group, new THREE.CapsuleGeometry(0.34, 0.72, 6, 14), cloth, [0, 1.45, 0]);
    addMesh(group, new THREE.SphereGeometry(0.28, 22, 16), skin, [0, 2.34, 0]);
    group.add(makeCylinderBetween([-0.2, 1.1, 0], [-0.26, 0.12, 0.04], 0.105, dark));
    group.add(makeCylinderBetween([0.2, 1.1, 0], [0.29, 0.12, -0.03], 0.105, dark));
    group.add(makeCylinderBetween([-0.28, 1.73, 0], [-0.72, 1.1, 0.08], 0.085, skin));
    group.add(makeCylinderBetween([0.28, 1.73, 0], [0.68, 1.2, -0.08], 0.085, skin));
    addMesh(group, new THREE.SphereGeometry(0.12, 12, 9), skin, [-0.73, 1.07, 0.08]);
    addMesh(group, new THREE.SphereGeometry(0.12, 12, 9), skin, [0.69, 1.17, -0.08]);
    group.scale.setScalar(0.9);
    return group;
  }

  function makeChair() {
    const group = new THREE.Group();
    const wood = makeMaterial(0x9a6846, 0.7, 0.08);
    const cushion = makeMaterial(0x9e5966, 0.86, 0.01);
    addBox(group, [1.35, 0.18, 1.15], cushion, [0, 0.9, 0]);
    addBox(group, [1.35, 1.05, 0.16], wood, [0, 1.55, -0.49]);
    [[-0.53, -0.43], [0.53, -0.43], [-0.53, 0.43], [0.53, 0.43]].forEach(([x, z]) => {
      addBox(group, [0.13, 0.9, 0.13], wood, [x, 0.45, z]);
    });
    addBox(group, [0.14, 1.75, 0.14], wood, [-0.54, 1.4, -0.49]);
    addBox(group, [0.14, 1.75, 0.14], wood, [0.54, 1.4, -0.49]);
    group.rotation.y = -0.2;
    group.scale.setScalar(0.95);
    return group;
  }

  function makeBicycle() {
    const group = new THREE.Group();
    const tire = makeMaterial(0x202327, 0.72, 0.18);
    const frame = makeMaterial(0x49a898, 0.4, 0.55);
    const metal = makeMaterial(0xaab4ba, 0.28, 0.82);
    [-0.93, 0.93].forEach((x) => {
      addMesh(group, new THREE.TorusGeometry(0.69, 0.065, 10, 36), tire, [x, 0.76, 0]);
      addMesh(group, new THREE.CylinderGeometry(0.08, 0.08, 0.18, 14), metal, [x, 0.76, 0], [Math.PI / 2, 0, 0]);
    });
    const rear = [-0.93, 0.76, 0];
    const front = [0.93, 0.76, 0];
    const crank = [-0.08, 0.7, 0];
    const seat = [-0.38, 1.48, 0];
    const head = [0.48, 1.45, 0];
    [[rear, crank], [crank, seat], [seat, rear], [seat, head], [head, crank], [head, front]].forEach(([a, b]) => {
      group.add(makeCylinderBetween(a, b, 0.045, frame));
    });
    group.add(makeCylinderBetween([-0.38, 1.45, 0], [-0.32, 1.7, 0], 0.04, metal));
    addBox(group, [0.42, 0.07, 0.18], makeMaterial(0x342b28, 0.9, 0.01), [-0.34, 1.73, 0]);
    group.add(makeCylinderBetween([0.48, 1.43, 0], [0.55, 1.72, 0], 0.035, metal));
    group.add(makeCylinderBetween([0.38, 1.74, 0], [0.73, 1.74, 0], 0.025, metal));
    group.rotation.y = 0.12;
    group.scale.setScalar(0.75);
    return group;
  }

  function makeMaterial(color, roughness, metalness) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  function addMesh(group, geometry, material, position, rotation = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  }

  function addBox(group, size, material, position) {
    return addMesh(group, new THREE.BoxGeometry(...size), material, position);
  }

  function makeCylinderBetween(a, b, radius, material) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  function sampleTargetSurfaceData(target, count, seed) {
    target.updateMatrixWorld(true);
    const triangles = [];
    let totalArea = 0;
    target.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
      const position = mesh.geometry.attributes.position;
      const index = mesh.geometry.index;
      const triangleCount = index ? index.count / 3 : position.count / 3;
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const ia = index ? index.getX(triangle * 3) : triangle * 3;
        const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
        const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
        const a = new THREE.Vector3().fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
        const c = new THREE.Vector3().fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
        const cross = b.clone().sub(a).cross(c.clone().sub(a));
        const area = cross.length() * 0.5;
        if (area <= 1e-7) continue;
        totalArea += area;
        triangles.push({ a, b, c, normal: cross.normalize(), cumulativeArea: totalArea });
      }
    });

    const rng = mulberry32(seed);
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    for (let sample = 0; sample < count; sample += 1) {
      const areaTarget = rng() * totalArea;
      let low = 0;
      let high = triangles.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) * 0.5);
        if (triangles[middle].cumulativeArea < areaTarget) low = middle + 1;
        else high = middle;
      }
      const triangle = triangles[low];
      const root = Math.sqrt(rng());
      const u = 1 - root;
      const v = root * (1 - rng());
      const w = 1 - u - v;
      const point = triangle.a.clone().multiplyScalar(u)
        .add(triangle.b.clone().multiplyScalar(v))
        .add(triangle.c.clone().multiplyScalar(w));
      positions[sample * 3] = point.x;
      positions[sample * 3 + 1] = point.y;
      positions[sample * 3 + 2] = point.z;
      normals[sample * 3] = triangle.normal.x;
      normals[sample * 3 + 1] = triangle.normal.y;
      normals[sample * 3 + 2] = triangle.normal.z;
    }
    return { positions, normals };
  }

  function rebuildTransport() {
    transportGroup.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose?.();
    });
    transportGroup.clear();
    transportMaterials = [];
    scanGridPoints = null;
    patternPlane = null;
    patternTexture?.dispose?.();
    patternTexture = null;
    const profile = modeProfiles[state.mode];
    const hidden = hiddenOrigin.clone().add(new THREE.Vector3(0, 1.25, 0));
    const pathCount = state.mode === "structured" ? 5 : state.mode === "passive" ? 6 : 5;
    for (let i = 0; i < pathCount; i += 1) {
      const t = pathCount === 1 ? 0.5 : i / (pathCount - 1);
      const wall = relayPoint.clone().add(new THREE.Vector3((t - 0.5) * 1.72, Math.sin(i * 1.9) * 0.42, 0));
      const returnWall = state.mode === "active" ? wall.clone() : wall.clone().add(new THREE.Vector3(0.14, -0.1, 0));
      const objectPoint = hidden.clone().add(new THREE.Vector3(
        Math.sin(i * 2.3) * 0.42,
        Math.cos(i * 1.4) * 0.5,
        Math.sin(i) * 0.32
      ));
      if (state.mode === "passive") {
        const floorPoint = new THREE.Vector3(-1.02 + t * 0.68, 0.035, -1.34 + t * 0.24);
        if (segmentIntersectsOccluder(objectPoint, floorPoint)) {
          console.warn("NLOS scene invariant failed: passive path intersects the blocker");
        }
        addTransportLine([roomLightPoint, objectPoint], 0xffd790, 0.2);
        addTransportNode(floorPoint, 0xf0ba5d, 0.038);
        addTransportLine([objectPoint, floorPoint], 0xf0ba5d, 0.48);
        addTransportLine([floorPoint, sensorPoint], 0x8ca7bc, 0.28);
      } else if (state.mode === "structured") {
        if (segmentIntersectsOccluder(wall, objectPoint) || segmentIntersectsOccluder(objectPoint, returnWall)) {
          console.warn("NLOS scene invariant failed: structured relay path intersects the blocker");
        }
        addTransportNode(wall, 0x7ba7ff);
        addTransportNode(returnWall, 0xed7c91);
        addTransportLine([sensorPoint, wall], 0x7ba7ff, 0.38);
        addTransportLine([wall, objectPoint], 0xa9c2ff, 0.34);
        addTransportLine([objectPoint, returnWall], 0xed7c91, 0.3);
        addTransportLine([returnWall, sensorPoint], 0x7ba7ff, 0.25);
      } else {
        if (segmentIntersectsOccluder(sensorPoint, wall)
          || segmentIntersectsOccluder(wall, objectPoint)
          || segmentIntersectsOccluder(objectPoint, returnWall)) {
          console.warn("NLOS scene invariant failed: transient relay path intersects the blocker");
        }
        addTransportNode(wall, 0x49d0bd);
        addTransportNode(returnWall, 0xed7c91);
        addTransportLine([sensorPoint, wall], 0x49d0bd, 0.46);
        addTransportLine([wall, objectPoint], 0xf0ba5d, 0.48);
        addTransportLine([objectPoint, returnWall], 0xed7c91, 0.42);
        addTransportLine([returnWall, sensorPoint], 0x49d0bd, 0.3);
      }
    }
    if (state.mode === "active") {
      buildConfocalScanGrid();
      buildTransientPlane();
    } else if (state.mode === "structured") buildStructuredPatternPlane();
    else buildPassiveFloorStrip();
    const hardwareText = state.mode === "active"
      ? "CONFOCAL LASER + SPAD"
      : state.mode === "structured" ? "PROJECTOR + CAMERA" : "RGB CAMERA";
    replaceHardwareLabel(hardwareText, profile.color, state.mode === "active" ? 1.28 : 1.08);
    if (hardwareGroup?.userData.emitterMaterial) {
      hardwareGroup.userData.emitterMaterial.color.setHex(profile.color);
      hardwareGroup.userData.emitterMaterial.emissive.setHex(profile.color);
    }
    if (roomLightGroup) roomLightGroup.visible = state.mode === "passive";
    scanMarker.material.color.setHex(profile.color);
    scanMarker.visible = state.mode === "active";
    scanMarker.position.copy(relayPoint);
    updateAcquisitionGeometry(true);
  }

  function buildConfocalScanGrid() {
    const side = Math.round(Math.sqrt(state.budget));
    const positions = new Float32Array(state.budget * 3);
    const colors = new Float32Array(state.budget * 3);
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const index = y * side + x;
        positions[index * 3] = THREE.MathUtils.lerp(geometryConfig.relayBounds[0], geometryConfig.relayBounds[1], x / Math.max(1, side - 1));
        positions[index * 3 + 1] = THREE.MathUtils.lerp(geometryConfig.relayBounds[2], geometryConfig.relayBounds[3], y / Math.max(1, side - 1));
        positions[index * 3 + 2] = geometryConfig.wallZ + 0.105;
        colors[index * 3] = 0.16;
        colors[index * 3 + 1] = 0.2;
        colors[index * 3 + 2] = 0.22;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: side >= 32 ? 0.035 : side >= 16 ? 0.052 : 0.072,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    scanGridPoints = new THREE.Points(geometry, material);
    transportGroup.add(scanGridPoints);
  }

  // Transient movie: the measured space-time tensor played back on the relay wall, one time
  // bin per frame. The scan index is the grid index, so a bin slice is directly an n x n wall
  // image with no resampling.
  //
  // The expanding ring IS the light-cone constraint -- a sphere of constant path length
  // intersecting the wall -- and its slope across the wall is the same cone the LCT
  // deconvolves. It is made entirely of data the worker already computes and already
  // transfers; nothing new is simulated.
  function syncTransientControls() {
    if (els.nlos3dTransientPlay) {
      els.nlos3dTransientPlay.textContent = state.transientPlaying ? "Pause" : "Play";
      els.nlos3dTransientPlay.classList.toggle("active", state.transientPlaying);
    }
    const bin = Math.round(state.transientBin);
    if (els.nlos3dTransientBin && document.activeElement !== els.nlos3dTransientBin) {
      els.nlos3dTransientBin.value = String(bin);
    }
    if (els.nlos3dTransientValue) {
      const hasData = Boolean(state.evidence?.measurement || state.result?.measurement);
      els.nlos3dTransientValue.value = hasData ? `bin ${bin}` : "no tensor yet";
    }
    const panel = document.getElementById("nlos3dTransientPanel");
    if (panel) panel.hidden = state.mode !== "active";
  }

  function buildTransientPlane() {
    const side = Math.round(Math.sqrt(state.budget));
    const data = new Uint8Array(side * side * 4);
    transientTexture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
    transientTexture.colorSpace = THREE.SRGBColorSpace;
    transientTexture.magFilter = THREE.NearestFilter;
    transientTexture.minFilter = THREE.NearestFilter;
    transientTexture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      map: transientTexture,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    transientPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.48, 2.48), material);
    transientPlane.position.set(relayPoint.x, relayPoint.y, geometryConfig.wallZ + 0.104);
    transientPlane.renderOrder = 4;
    transportGroup.add(transientPlane);
  }

  function updateTransientPlane() {
    if (!transientPlane || !transientTexture) return;
    const measurement = state.evidence?.measurement || state.result?.measurement;
    const bins = state.evidence?.measurementWidth || 64;
    const side = Math.round(Math.sqrt(state.budget));
    if (!measurement || measurement.length < side * side * bins) {
      transientPlane.visible = false;
      return;
    }
    transientPlane.visible = true;
    const bin = Math.min(bins - 1, Math.max(0, Math.round(state.transientBin)));
    // Normalize per frame so a dim late-arriving return stays visible; the absolute scale is
    // arbitrary anyway because the forward model normalizes before applying photon counts.
    let peak = 1e-6;
    for (let index = 0; index < side * side; index += 1) {
      peak = Math.max(peak, measurement[index * bins + bin]);
    }
    const data = transientTexture.image.data;
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const scan = y * side + x;
        const value = measurement[scan * bins + bin] / peak;
        const color = heatColor(value, "active");
        // Flip vertically so the texture matches the wall's world orientation.
        const texel = ((side - 1 - y) * side + x) * 4;
        data[texel] = color[0];
        data[texel + 1] = color[1];
        data[texel + 2] = color[2];
        data[texel + 3] = Math.round(40 + value * 215);
      }
    }
    transientTexture.needsUpdate = true;
  }

  function buildStructuredPatternPlane() {
    const side = 16;
    const data = new Uint8Array(side * side * 4);
    patternTexture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat);
    patternTexture.colorSpace = THREE.SRGBColorSpace;
    patternTexture.magFilter = THREE.NearestFilter;
    patternTexture.minFilter = THREE.NearestFilter;
    patternTexture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      map: patternTexture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    patternPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.48, 2.48), material);
    patternPlane.position.set(relayPoint.x, relayPoint.y, geometryConfig.wallZ + 0.102);
    patternPlane.renderOrder = 3;
    transportGroup.add(patternPlane);
  }

  function buildPassiveFloorStrip() {
    const sampleCount = 64;
    const positions = new Float32Array(sampleCount * 3);
    const colors = new Float32Array(sampleCount * 3);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const t = sample / (sampleCount - 1);
      positions[sample * 3] = THREE.MathUtils.lerp(-0.12, -1.34, t);
      positions[sample * 3 + 1] = 0.048;
      positions[sample * 3 + 2] = -1.02 - Math.sin(t * Math.PI) * 0.36;
      colors[sample * 3] = 0.24;
      colors[sample * 3 + 1] = 0.18;
      colors[sample * 3 + 2] = 0.09;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    scanGridPoints = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.085,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      depthWrite: false
    }));
    transportGroup.add(scanGridPoints);
  }

  function updateAcquisitionGeometry(force = false) {
    if (state.mode === "active") {
      updateConfocalScanGrid(force);
      updateTransientPlane();
    }
    else if (state.mode === "structured") updateStructuredPattern(force);
    else updatePassiveFloorStrip(force);
  }

  function updateConfocalScanGrid(force = false) {
    if (!scanGridPoints) return;
    const acquired = Math.min(state.budget, Math.floor(state.progress * state.budget + 1e-6));
    if (!force && acquired === state.lastAcquiredScan) return;
    state.lastAcquiredScan = acquired;
    const side = Math.round(Math.sqrt(state.budget));
    const acquiredMask = new Uint8Array(state.budget);
    for (let sequence = 0; sequence < acquired; sequence += 1) {
      acquiredMask[serpentineGridIndex(sequence, side)] = 1;
    }
    const current = serpentineGridIndex(Math.min(state.budget - 1, acquired), side);
    const colors = scanGridPoints.geometry.getAttribute("color");
    for (let index = 0; index < state.budget; index += 1) {
      if (index === current && acquired < state.budget) colors.setXYZ(index, 0.88, 1, 0.95);
      else if (acquiredMask[index]) colors.setXYZ(index, 0.18, 0.82, 0.71);
      else colors.setXYZ(index, 0.16, 0.2, 0.22);
    }
    colors.needsUpdate = true;
  }

  function updateStructuredPattern(force = false) {
    if (!patternTexture) return;
    const totalExposures = state.budget * 2;
    const exposure = Math.min(totalExposures - 1, Math.floor(state.progress * totalExposures));
    if (!force && exposure === state.lastAcquisitionVisual) return;
    state.lastAcquisitionVisual = exposure;
    const pair = Math.floor(exposure / 2);
    const complement = exposure % 2 === 1;
    const row = grayCode(pair % 256);
    const data = patternTexture.image.data;
    for (let pixel = 0; pixel < 256; pixel += 1) {
      const positive = walshSign(row, pixel) > 0;
      const lit = complement ? !positive : positive;
      const index = pixel * 4;
      data[index] = lit ? 116 : 8;
      data[index + 1] = lit ? 157 : 11;
      data[index + 2] = lit ? 255 : 17;
      data[index + 3] = lit ? 255 : 220;
    }
    patternTexture.needsUpdate = true;
  }

  function updatePassiveFloorStrip(force = false) {
    if (!scanGridPoints) return;
    const frame = Math.min(state.budget - 1, Math.floor(state.progress * state.budget));
    if (!force && frame === state.lastAcquisitionVisual) return;
    state.lastAcquisitionVisual = frame;
    const colors = scanGridPoints.geometry.getAttribute("color");
    const measurement = state.evidence?.measurement;
    let minValue = Infinity;
    let maxValue = -Infinity;
    if (measurement) {
      for (let sample = 0; sample < 64; sample += 1) {
        const value = measurement[frame * 64 + sample];
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    }
    const range = Math.max(1e-6, maxValue - minValue);
    for (let sample = 0; sample < 64; sample += 1) {
      const value = measurement
        ? THREE.MathUtils.clamp((measurement[frame * 64 + sample] - minValue) / range, 0, 1)
        : sample / 63 * 0.18;
      colors.setXYZ(sample, 0.28 + value * 0.66, 0.18 + value * 0.54, 0.07 + value * 0.2);
    }
    colors.needsUpdate = true;
  }

  function serpentineGridIndex(sequence, side) {
    const row = Math.floor(sequence / side);
    const step = sequence % side;
    const column = row % 2 === 0 ? step : side - 1 - step;
    return row * side + column;
  }

  function walshSign(row, column) {
    let bits = row & column;
    bits ^= bits >>> 16;
    bits ^= bits >>> 8;
    bits ^= bits >>> 4;
    bits &= 0xf;
    return ((0x6996 >>> bits) & 1) ? -1 : 1;
  }

  function grayCode(value) {
    return value ^ value >>> 1;
  }

  function addTransportLine(points, color, opacity) {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    transportMaterials.push({ material, baseOpacity: opacity });
    transportGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }

  function addTransportNode(position, color, radius = 0.045) {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 8),
      new THREE.MeshBasicMaterial({ color })
    );
    node.position.copy(position);
    transportGroup.add(node);
  }

  function resetCapture(rebuildTransportToo) {
    state.jobId += 1;
    state.running = false;
    state.progress = 0;
    state.recoveredCount = 0;
    state.lastSignalBucket = -1;
    state.result = null;
    state.solving = false;
    state.workerProgress = 0;
    state.workerPhase = "idle";
    state.error = "";
    state.evidence = null;
    state.snapshots = [];
    state.displayedSnapshot = -1;
    state.currentSnapshot = null;
    state.lastAcquiredScan = -1;
    state.lastAcquisitionVisual = -1;
    if (rebuildTransportToo) rebuildTransport();
    clearRecoveredPoints();
    if (els.nlos3dRuntimeBadge) els.nlos3dRuntimeBadge.textContent = "WebGL + inverse worker";
    updateControls();
    updateDiagnostics();
    drawSignal();
    drawProjection();
    drawShotLedger();
    updateAcquisitionGeometry(true);
  }

  function acquisitionState() {
    const acquiredUnits = Math.min(state.budget, Math.floor(state.progress * state.budget + 1e-6));
    if (state.mode === "structured") {
      const acquiredExposures = Math.min(state.budget * 2, Math.floor(state.progress * state.budget * 2 + 1e-6));
      return {
        acquiredUnits,
        acquiredExposures,
        title: "Complementary pattern sequence",
        count: `${state.budget.toLocaleString()} pattern pairs · ${(state.budget * 2).toLocaleString()} camera exposures`,
        detail: "Every Hadamard pattern is followed by its complement; subtracting the pair cancels shared ambient light.",
        badge: `exposure ${acquiredExposures.toLocaleString()} / ${(state.budget * 2).toLocaleString()} · pair ${acquiredUnits.toLocaleString()} / ${state.budget.toLocaleString()}`
      };
    }
    if (state.mode === "passive") {
      return {
        acquiredUnits,
        title: "Ordinary-light exposure stack",
        count: `${state.budget.toLocaleString()} RGB frames · 64 floor samples per frame`,
        detail: "The camera observes the full calibrated floor strip each frame; repetition improves photon statistics, not geometric rank.",
        badge: `frame ${acquiredUnits.toLocaleString()} / ${state.budget.toLocaleString()}`
      };
    }
    return {
      acquiredUnits,
      title: "Confocal wall scan",
      count: `${state.budget.toLocaleString()} wall spots · ${state.budget.toLocaleString()} transient histograms`,
      detail: "Each wall spot records one histogram accumulated from a pulse train; this is not a single laser pulse.",
      badge: `wall histogram ${acquiredUnits.toLocaleString()} / ${state.budget.toLocaleString()}`
    };
  }

  function measurementDescription() {
    if (state.mode === "structured") {
      return `${state.budget} Hadamard/complement pairs = ${state.budget * 2} camera exposures`;
    }
    if (state.mode === "passive") return `${state.budget} ordinary RGB frames x 64 calibrated floor samples`;
    const side = Math.round(Math.sqrt(state.budget));
    return `${side}x${side} wall raster x 64 time bins`;
  }

  function capturePhaseLabel(result, acquisition, side, acquiredScans) {
    if (state.error) return "operator error";
    if (state.progress <= 0) return state.solving ? state.workerPhase : "ready";
    if (state.progress < 0.999) {
      if (state.mode === "active") {
        return `scanning wall row ${Math.min(side, Math.floor(acquiredScans / side) + 1)} / ${side}`;
      }
      if (state.mode === "structured") {
        return `projecting exposure ${Math.min(state.budget * 2, acquisition.acquiredExposures + 1)} / ${state.budget * 2}`;
      }
      return `recording RGB frame ${Math.min(state.budget, acquiredScans + 1)} / ${state.budget}`;
    }
    if (state.solving && !result) return state.workerPhase;
    return "inverse result complete";
  }

  function updateControls() {
    document.querySelectorAll("[data-nlos3d-mode]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nlos3d-mode") === state.mode);
    });
    document.querySelectorAll("[data-nlos3d-target]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nlos3d-target") === state.target);
    });
    document.querySelectorAll("[data-nlos3d-inverse]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nlos3d-inverse") === state.inverse);
    });
    // Hidden rather than disabled for the other two lanes: offering a reconstructor choice
    // where only one is implemented would imply alternatives that do not exist.
    const inversePanel = document.getElementById("nlos3dInversePanel");
    if (inversePanel) inversePanel.hidden = state.mode !== "active";
    document.querySelectorAll("[data-nlos3d-material]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nlos3d-material") === state.material);
    });
    const materialPanel = document.getElementById("nlos3dMaterialPanel");
    if (materialPanel) materialPanel.hidden = state.mode !== "active";
    document.querySelectorAll("[data-nlos3d-aperture]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nlos3d-aperture") === state.aperture);
    });
    const aperturePanel = document.getElementById("nlos3dAperturePanel");
    if (aperturePanel) aperturePanel.hidden = state.mode !== "passive";
    const note = document.getElementById("nlos3dApertureNote");
    const ranks = state.result?.apertureRanks;
    if (note && ranks) {
      note.textContent =
        `Usable directions: none ${ranks.none.usableDirections}, knife edge ${ranks.edge.usableDirections}, `
        + `finite occluder ${ranks.occluder.usableDirections}. With no occluder every floor sample sees the same `
        + `hidden range up to a smooth falloff, so the operator is effectively rank one -- occlusion adds no `
        + `measurements, it makes the ones you have independent. The finite occluder does not beat the knife edge `
        + `here: that advantage comes from a 2D hidden scene where the shadow's shape moves as well as its position, `
        + `and this lane resolves only an angle.`;
    }
    syncTransientControls();
    document.querySelectorAll("[data-nlos3d-budget]").forEach((button) => {
      button.classList.toggle("active", Number(button.getAttribute("data-nlos3d-budget")) === state.budget);
      const budget = Number(button.getAttribute("data-nlos3d-budget"));
      button.textContent = state.mode === "active"
        ? `${Math.round(Math.sqrt(budget))}x${Math.round(Math.sqrt(budget))}`
        : state.mode === "structured" ? `${budget} pairs` : `${budget} frames`;
    });
    if (els.nlos3dRunButton) {
      els.nlos3dRunButton.textContent = state.running
        ? "Pause capture"
        : state.progress >= 0.999 ? "Run again" : state.progress > 0 ? "Resume capture" : "Run capture";
    }
    if (els.nlos3dTruthButton) {
      els.nlos3dTruthButton.classList.toggle("active", state.showTruth);
      els.nlos3dTruthButton.setAttribute("aria-pressed", state.showTruth ? "true" : "false");
    }
    const profile = modeProfiles[state.mode];
    if (els.nlos3dBudgetLabel) {
      els.nlos3dBudgetLabel.textContent = state.mode === "active"
        ? "Relay-wall raster" : state.mode === "structured" ? "Pattern-pair budget" : "RGB frame budget";
    }
    if (els.nlos3dWorldBadge) {
      els.nlos3dWorldBadge.textContent = state.mode === "passive"
        ? `direct view blocked; floor penumbra carries hidden ${targetLabels[state.target]} radiance`
        : `direct view blocked; relay path reaches hidden ${targetLabels[state.target]}`;
    }
    if (els.nlos3dPathBadge) els.nlos3dPathBadge.textContent = profile.path;
    if (els.nlos3dCueBadge) els.nlos3dCueBadge.textContent = profile.cue;
    if (els.nlos3dLegendOutbound) {
      els.nlos3dLegendOutbound.textContent = state.mode === "active"
        ? "sensor to relay" : state.mode === "structured" ? "projector to relay" : "floor to RGB camera";
    }
    if (els.nlos3dLegendIndirect) {
      els.nlos3dLegendIndirect.textContent = state.mode === "passive" ? "hidden target to floor" : "relay to hidden target";
    }
    if (els.nlos3dSignalBadge) {
      els.nlos3dSignalBadge.textContent = state.result?.materialLabel
        || (state.mode === "active" && state.target === "calibration"
          ? "retroreflective target + z^2 radiometric compensation"
          : profile.signal);
    }
    if (els.nlos3dReconTitle) els.nlos3dReconTitle.textContent = profile.resultTitle;
    if (els.nlos3dMaterialPolicy) {
      els.nlos3dMaterialPolicy.textContent = state.mode === "active"
        ? state.target === "calibration" ? "high-albedo retroreflective benchmark" : "matte diffuse stress test"
          : "mode-specific measured response";
    }
    if (els.nlos3dAcquisitionPolicyLabel) {
      els.nlos3dAcquisitionPolicyLabel.textContent = state.mode === "active"
        ? "Active calibration" : state.mode === "structured" ? "Projected illumination" : "Ordinary illumination";
    }
    if (els.nlos3dAcquisitionPolicy) {
      els.nlos3dAcquisitionPolicy.textContent = state.mode === "active"
        ? "co-located laser/SPAD, square wall raster, rectified time zero"
        : state.mode === "structured"
          ? "projector emits known Hadamard/complement pairs; camera records both responses"
          : "room light illuminates the hidden target; RGB camera observes a calibrated floor penumbra";
    }
    if (els.nlos3dForwardStage) els.nlos3dForwardStage.textContent = state.result?.forward || profile.forward;
    if (els.nlos3dEvidenceStage) {
      els.nlos3dEvidenceStage.textContent = state.result?.measurementLabel || measurementDescription();
    }
    if (els.nlos3dInverseStage) els.nlos3dInverseStage.textContent = state.result?.inverse || profile.inverse;
    if (els.nlos3dOutputStage) els.nlos3dOutputStage.textContent = state.result?.resultLabel || profile.output;
  }

  function updateDiagnostics() {
    const profile = modeProfiles[state.mode];
    const result = state.result;
    const side = Math.round(Math.sqrt(state.budget));
    const acquisition = acquisitionState();
    const acquiredScans = acquisition.acquiredUnits;
    const acquiredRows = state.currentSnapshot?.acquiredRows || 0;
    if (els.nlos3dMeasurementMetric) {
      els.nlos3dMeasurementMetric.textContent = result?.measurementLabel || measurementDescription();
    }
    if (els.nlos3dDepthMetric) els.nlos3dDepthMetric.textContent = result?.inverse || profile.depth;
    if (els.nlos3dConfidenceMetric) {
      els.nlos3dConfidenceMetric.textContent = result && state.progress >= 0.999
        ? `${result.metricLabel}: ${result.metricValue}`
        : state.currentSnapshot
          ? state.mode === "active"
            ? `${state.currentSnapshot.positions.length / 3} peak voxels from ${acquiredRows}/${side} rows`
            : state.mode === "structured"
              ? `${state.currentSnapshot.positions.length / 3} image samples from ${state.currentSnapshot.acquiredPairs}/${state.budget} pairs`
              : `${state.currentSnapshot.positions.length / 3} uncertainty samples from ${state.currentSnapshot.acquiredFrames}/${state.budget} frames`
          : state.solving ? `${Math.round(state.workerProgress * 100)}% inverse compute` : "pending measurement";
    }
    if (els.nlos3dFailureMetric) els.nlos3dFailureMetric.textContent = result?.scope || profile.failure;
    // The resolution ledger. This is arithmetic on the pulse width and the geometry, and it
    // bounds every reconstructor on the page -- no software beats dz >= c * FWHM / 2. Stating
    // it beside the reconstruction is the difference between showing detail and claiming it.
    const limits = result?.limits;
    if (els.nlos3dLimitMetric) {
      els.nlos3dLimitMetric.textContent = limits
        ? `axial ${limits.axialLimit.toFixed(3)} / transverse ${limits.transverseLimit.toFixed(3)} scene units`
        : state.mode === "active" ? "pending measurement" : "not applicable to this operator";
    }
    if (els.nlos3dLimitNote) {
      if (limits && state.mode === "active") {
        els.nlos3dLimitNote.hidden = false;
        els.nlos3dLimitNote.textContent =
          `The temporal response is FWHM ${limits.fwhmPath.toFixed(3)} path units, so the physics allows no better than `
          + `${limits.axialLimit.toFixed(3)} axially and ${limits.transverseLimit.toFixed(3)} transversely. The displayed voxel grid is `
          + `${limits.axialOversample.toFixed(1)}x finer axially and ${limits.lateralOversample.toFixed(1)}x finer laterally than those limits, `
          + `so detail below them is interpolation, not measurement. Raising the photon budget improves signal-to-noise and never moves these numbers. `
          + `No inverse on this page beats dz >= c x FWHM / 2.`;
      } else {
        els.nlos3dLimitNote.hidden = true;
        els.nlos3dLimitNote.textContent = "";
      }
    }
    if (els.nlos3dPointBadge) {
      const unit = state.mode === "passive" ? "ray samples" : state.mode === "structured" ? "image samples" : "voxels";
      els.nlos3dPointBadge.textContent = `${state.recoveredCount.toLocaleString()} ${unit}`;
    }
    if (els.nlos3dReconBadge) {
      els.nlos3dReconBadge.textContent = state.error
        ? state.error
        : state.progress >= 0.999 && result
          ? `${result.resultLabel}; ${result.metricValue}`
          : state.currentSnapshot
            ? state.mode === "active" ? `${acquiredRows}/${side} rows; measured LCT update`
              : state.mode === "structured" ? `${state.currentSnapshot.acquiredPairs}/${state.budget} pairs; reciprocal image update`
                : `${state.currentSnapshot.acquiredFrames}/${state.budget} frames; angular inverse update`
            : state.solving ? state.workerPhase : "capture not started";
    }
    if (els.nlos3dProgressBar) els.nlos3dProgressBar.style.width = `${Math.round(state.progress * 100)}%`;
    if (els.nlos3dProgressLabel) els.nlos3dProgressLabel.textContent = `${Math.round(state.progress * 100)}%`;
    if (els.nlos3dScanBadge) els.nlos3dScanBadge.textContent = acquisition.badge;
    if (els.nlos3dProjectionTitle) {
      els.nlos3dProjectionTitle.textContent = state.mode === "active"
        ? "front-view MIP" : state.mode === "structured" ? "reciprocal image" : "angular likelihood";
    }
    if (els.nlos3dProjectionMeta) {
      els.nlos3dProjectionMeta.textContent = state.mode === "active"
        ? `${acquiredRows} / ${side} rows`
        : state.mode === "structured" ? `${state.currentSnapshot?.acquiredPairs || 0} / ${state.budget} pairs`
          : `${state.currentSnapshot?.acquiredFrames || 0} / ${state.budget} frames`;
    }
    if (els.nlos3dPhaseLabel) {
      els.nlos3dPhaseLabel.textContent = capturePhaseLabel(result, acquisition, side, acquiredScans);
    }
    updateControls();
  }

  function captureDuration() {
    const profile = modeProfiles[state.mode];
    return profile.duration * (0.9 + Math.max(0, Math.log2(state.budget / 64)) * 0.13);
  }

  function drawShotLedger() {
    const canvas = els.nlos3dShotCanvas;
    if (!canvas) return;
    const acquisition = acquisitionState();
    if (els.nlos3dShotTitle) els.nlos3dShotTitle.textContent = acquisition.title;
    if (els.nlos3dShotCount) els.nlos3dShotCount.textContent = acquisition.count;
    if (els.nlos3dShotDetail) els.nlos3dShotDetail.textContent = acquisition.detail;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = "#090b0e";
    ctx.fillRect(0, 0, width, height);
    const columns = Math.min(128, state.budget);
    const rows = Math.ceil(state.budget / columns);
    const gap = 1.3;
    const cellWidth = (width - 24) / columns;
    const cellHeight = (height - 14) / rows;
    const acquiredExposures = acquisition.acquiredExposures || 0;
    for (let unit = 0; unit < state.budget; unit += 1) {
      const row = Math.floor(unit / columns);
      const column = unit % columns;
      const x = 12 + column * cellWidth;
      const y = 7 + row * cellHeight;
      const w = Math.max(1, cellWidth - gap);
      const h = Math.max(1, cellHeight - gap);
      if (state.mode === "structured") {
        const half = h * 0.5;
        ctx.fillStyle = unit * 2 < acquiredExposures ? "rgba(123,167,255,0.9)" : "rgba(52,61,72,0.62)";
        ctx.fillRect(x, y, w, Math.max(1, half - 0.5));
        ctx.fillStyle = unit * 2 + 1 < acquiredExposures ? "rgba(237,124,145,0.86)" : "rgba(45,50,59,0.58)";
        ctx.fillRect(x, y + half, w, Math.max(1, half - 0.5));
      } else {
        const acquired = unit < acquisition.acquiredUnits;
        ctx.fillStyle = acquired
          ? state.mode === "active" ? "rgba(73,208,189,0.9)" : "rgba(240,186,93,0.9)"
          : "rgba(45,52,59,0.62)";
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  function animate(now) {
    requestAnimationFrame(animate);
    // Transient playback is independent of capture progress: it replays a tensor that has
    // already been measured, so it runs whether or not the optimizer is stepping.
    if (state.transientPlaying && state.mode === "active") {
      const bins = state.evidence?.measurementWidth || 64;
      state.transientBin = (state.transientBin + 0.55) % bins;
      updateTransientPlane();
      syncTransientControls();
    }
    if (state.running) {
      const desiredProgress = THREE.MathUtils.clamp((now - state.startedAt) / captureDuration(), 0, 1);
      state.progress = state.result ? desiredProgress : Math.min(desiredProgress, 0.985);
      updateAcquisitionGeometry();
      applyProgressiveSnapshot();
      const bucket = Math.floor(state.progress * 36);
      if (bucket !== state.lastSignalBucket) {
        state.lastSignalBucket = bucket;
        drawSignal();
        drawShotLedger();
        updateDiagnostics();
      }
      if (state.progress >= 1 && state.result) {
        state.running = false;
        updateControls();
        updateDiagnostics();
      }
    }
    if (!state.active) return;
    const pulse = Math.sin(now * 0.004) * 0.08;
    transportMaterials.forEach(({ material, baseOpacity }, index) => {
      material.opacity = THREE.MathUtils.clamp(baseOpacity + pulse + (index % 3) * 0.018, 0.08, 0.68);
    });
    if (state.mode === "active") {
      const side = Math.round(Math.sqrt(state.budget));
      const sequence = Math.min(state.budget - 1, Math.floor(state.progress * state.budget));
      const gridIndex = serpentineGridIndex(sequence, side);
      const row = Math.floor(gridIndex / side);
      const column = gridIndex % side;
      scanMarker.position.x = THREE.MathUtils.lerp(geometryConfig.relayBounds[0], geometryConfig.relayBounds[1], column / Math.max(1, side - 1));
      scanMarker.position.y = THREE.MathUtils.lerp(geometryConfig.relayBounds[2], geometryConfig.relayBounds[3], row / Math.max(1, side - 1));
      scanMarker.position.z = geometryConfig.wallZ + 0.1;
    }
    scanMarker.scale.setScalar(0.86 + Math.sin(now * 0.006) * 0.18);
    worldControls.update();
    reconControls.update();
    resizeRenderer(worldRenderer, worldCamera, worldCanvas);
    resizeRenderer(reconRenderer, reconCamera, reconCanvas);
    worldRenderer.render(worldScene, worldCamera);
    reconRenderer.render(reconScene, reconCamera);
  }

  function drawSignal() {
    const canvas = els.nlos3dSignalCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#090b0e";
    ctx.fillRect(0, 0, w, h);
    const signalResult = state.evidence || state.result;
    if (!signalResult) {
      ctx.fillStyle = "rgba(241,244,241,0.72)";
      ctx.font = "600 18px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.solving ? state.workerPhase : "Run capture to compute sensor-space evidence", w * 0.5, h * 0.5);
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = "rgba(175,184,181,0.72)";
      ctx.fillText("No target samples are copied into the inverse result", w * 0.5, h * 0.5 + 28);
      ctx.textAlign = "left";
      return;
    }

    if (state.mode === "structured") drawStructuredEvidence(ctx, w, h, signalResult);
    else if (state.mode === "passive") drawPassiveEvidence(ctx, w, h, signalResult);
    else drawMatrixEvidence(ctx, w, h, signalResult, false);

    ctx.fillStyle = "rgba(241,244,241,0.86)";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    const label = signalResult.measurementLabel
      || `${Math.round(Math.sqrt(state.budget))}x${Math.round(Math.sqrt(state.budget))} wall raster x ${signalResult.measurementWidth} rectified time bins`;
    ctx.fillText(label, 14, 18);
  }

  function drawMatrixEvidence(ctx, w, h, result, transpose) {
    const plotX = 12;
    const plotY = 28;
    const plotW = w - 24;
    const plotH = h - 48;
    const sourceWidth = transpose ? result.measurementWidth : result.measurementWidth;
    const sourceHeight = transpose ? result.measurementHeight : result.measurementHeight;
    const offscreen = document.createElement("canvas");
    offscreen.width = sourceWidth;
    offscreen.height = sourceHeight;
    const offscreenCtx = offscreen.getContext("2d");
    const image = offscreenCtx.createImageData(sourceWidth, sourceHeight);
    const reveal = Math.max(0.015, state.progress);
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (const value of result.measurement) {
      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
    }

    let acquiredMask = null;
    if (!transpose && state.mode === "active") {
      acquiredMask = new Uint8Array(sourceHeight);
      const side = result.scanSide || Math.round(Math.sqrt(sourceHeight));
      const acquired = Math.min(sourceHeight, Math.floor(reveal * sourceHeight));
      for (let sequence = 0; sequence < acquired; sequence += 1) {
        const gridIndex = result.scanOrder?.[sequence] ?? serpentineGridIndex(sequence, side);
        acquiredMask[gridIndex] = 1;
      }
    }
    const dynamicRange = Math.max(1e-8, maxValue - minValue);
    const logDenominator = Math.log1p(32);
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const observed = acquiredMask
          ? acquiredMask[y] === 1
          : transpose ? x / Math.max(1, sourceWidth - 1) <= reveal : y / Math.max(1, sourceHeight - 1) <= reveal;
        const sourceIndex = transpose ? x * sourceHeight + y : y * sourceWidth + x;
        const linearValue = observed ? (result.measurement[sourceIndex] - minValue) / dynamicRange : 0;
        const value = Math.log1p(32 * Math.max(0, linearValue)) / logDenominator;
        const color = heatColor(value, state.mode);
        const targetIndex = (y * sourceWidth + x) * 4;
        image.data[targetIndex] = color[0];
        image.data[targetIndex + 1] = color[1];
        image.data[targetIndex + 2] = color[2];
        image.data[targetIndex + 3] = 255;
      }
    }
    offscreenCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, plotX, plotY, plotW, plotH);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.strokeRect(plotX + 0.5, plotY + 0.5, plotW - 1, plotH - 1);
    ctx.fillStyle = "rgba(205,212,209,0.62)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    if (transpose) {
      ctx.fillText("frame ->", plotX + plotW - 55, h - 6);
      ctx.fillText("floor visibility", plotX + 6, plotY + 13);
    } else {
      ctx.fillText("round-trip time bin ->", plotX + plotW - 138, h - 6);
      ctx.fillText("serpentine relay scan", plotX + 6, plotY + 13);
    }
  }

  function drawProjection() {
    const canvas = els.nlos3dProjectionCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = "#080b0e";
    ctx.fillRect(0, 0, width, height);
    const snapshot = state.currentSnapshot || (state.progress >= 0.999 ? state.result : null);
    if (state.mode === "passive" && snapshot?.aux) {
      drawAngularProjection(ctx, width, height, snapshot.aux);
      return;
    }
    const projection = state.mode === "active" ? snapshot?.frontProjection : snapshot?.aux;
    const sourceWidth = state.mode === "active" ? snapshot?.projectionWidth : snapshot?.auxWidth;
    const sourceHeight = state.mode === "active" ? snapshot?.projectionHeight : snapshot?.auxHeight;
    if (!projection || !sourceWidth || !sourceHeight) {
      ctx.strokeStyle = "rgba(73,208,189,0.12)";
      ctx.lineWidth = 1;
      for (let step = 1; step < 8; step += 1) {
        const position = step / 8 * width;
        ctx.beginPath();
        ctx.moveTo(position, 0);
        ctx.lineTo(position, height);
        ctx.moveTo(0, position);
        ctx.lineTo(width, position);
        ctx.stroke();
      }
      return;
    }
    const offscreen = document.createElement("canvas");
    offscreen.width = sourceWidth;
    offscreen.height = sourceHeight;
    const offscreenCtx = offscreen.getContext("2d");
    const pixels = offscreenCtx.createImageData(sourceWidth, sourceHeight);
    for (let index = 0; index < projection.length; index += 1) {
      const value = Math.pow(THREE.MathUtils.clamp(projection[index], 0, 1), state.mode === "active" ? 0.58 : 0.72);
      const color = heatColor(value, state.mode);
      pixels.data[index * 4] = color[0];
      pixels.data[index * 4 + 1] = color[1];
      pixels.data[index * 4 + 2] = color[2];
      pixels.data[index * 4 + 3] = 255;
    }
    offscreenCtx.putImageData(pixels, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, width, height);
  }

  function drawAngularProjection(ctx, width, height, profile) {
    const originX = width * 0.12;
    const originY = height * 0.86;
    const radius = Math.min(width * 0.82, height * 0.82);
    ctx.strokeStyle = "rgba(240,186,93,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(originX, originY, radius, -1.46, -0.08);
    ctx.stroke();
    for (let index = 0; index < profile.length; index += 1) {
      const value = THREE.MathUtils.clamp(profile[index], 0, 1);
      if (value < 0.04) continue;
      const angle = THREE.MathUtils.lerp(0.12, 1.5, index / Math.max(1, profile.length - 1));
      const color = heatColor(value, "passive");
      ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.18 + value * 0.78})`;
      ctx.lineWidth = 0.8 + value * 4.2;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(originX + Math.cos(angle) * radius, originY - Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(240,186,93,0.9)";
    ctx.beginPath();
    ctx.arc(originX, originY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStructuredEvidence(ctx, w, h, result) {
    const traceX = 14;
    const traceY = 32;
    const traceW = w * 0.72;
    const traceH = h - 58;
    let maxAbs = 0;
    for (const value of result.measurement) maxAbs = Math.max(maxAbs, Math.abs(value));
    const visibleCount = Math.min(result.measurement.length, Math.ceil(result.measurement.length * Math.max(0.015, state.progress)));
    const middle = traceY + traceH * 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(traceX, middle);
    ctx.lineTo(traceX + traceW, middle);
    ctx.stroke();
    const barWidth = traceW / result.measurement.length;
    for (let index = 0; index < visibleCount; index += 1) {
      const value = result.measurement[index] / Math.max(1e-8, maxAbs);
      const height = value * traceH * 0.45;
      ctx.fillStyle = value >= 0 ? "rgba(123,167,255,0.78)" : "rgba(237,124,145,0.72)";
      ctx.fillRect(traceX + index * barWidth, middle - Math.max(0, height), Math.max(1, barWidth), Math.abs(height));
    }
    const exposures = [
      { values: result.positiveExposure, color: "rgba(123,167,255,0.92)" },
      { values: result.negativeExposure, color: "rgba(237,124,145,0.9)" }
    ];
    let exposureMax = 0;
    for (const trace of exposures) {
      if (!trace.values) continue;
      for (const value of trace.values) exposureMax = Math.max(exposureMax, value);
    }
    for (const trace of exposures) {
      if (!trace.values) continue;
      ctx.strokeStyle = trace.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let index = 0; index < visibleCount; index += 1) {
        const x = traceX + index / Math.max(1, result.measurement.length - 1) * traceW;
        const normalized = trace.values[index] / Math.max(1e-8, exposureMax);
        const y = traceY + 8 + (1 - normalized) * traceH * 0.28;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(205,212,209,0.66)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText("blue: + pattern · coral: complement · bars: ambient-cancelled difference", traceX, h - 8);

    const imageSide = Math.min(h - 42, w * 0.2);
    const imageX = w - imageSide - 14;
    const imageY = 28;
    const inverse = state.currentSnapshot || state.result;
    if (inverse?.aux) {
      const offscreen = document.createElement("canvas");
      offscreen.width = inverse.auxWidth;
      offscreen.height = inverse.auxHeight;
      const imageCtx = offscreen.getContext("2d");
      const pixels = imageCtx.createImageData(inverse.auxWidth, inverse.auxHeight);
      for (let index = 0; index < inverse.aux.length; index += 1) {
        const color = heatColor(inverse.aux[index], state.mode);
        pixels.data[index * 4] = color[0];
        pixels.data[index * 4 + 1] = color[1];
        pixels.data[index * 4 + 2] = color[2];
        pixels.data[index * 4 + 3] = 255;
      }
      imageCtx.putImageData(pixels, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, imageX, imageY, imageSide, imageSide);
    } else {
      ctx.fillStyle = "rgba(123,167,255,0.07)";
      ctx.fillRect(imageX, imageY, imageSide, imageSide);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(imageX + 0.5, imageY + 0.5, imageSide - 1, imageSide - 1);
    ctx.fillStyle = "rgba(205,212,209,0.66)";
    ctx.fillText(inverse?.aux ? "partial reciprocal image" : "inverse pending", imageX, h - 8);
  }

  function drawPassiveEvidence(ctx, w, h, result) {
    const plotX = 14;
    const plotY = 30;
    const plotW = w * 0.72;
    const plotH = h - 54;
    const frames = result.measurementWidth;
    const floorSamples = result.measurementHeight;
    const offscreen = document.createElement("canvas");
    offscreen.width = frames;
    offscreen.height = floorSamples;
    const offscreenCtx = offscreen.getContext("2d");
    const pixels = offscreenCtx.createImageData(frames, floorSamples);
    const background = result.background || new Float32Array(floorSamples);
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (let frame = 0; frame < frames; frame += 1) {
      for (let sample = 0; sample < floorSamples; sample += 1) {
        const value = result.measurement[frame * floorSamples + sample] - background[sample];
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    }
    const acquiredFrames = Math.min(frames, Math.floor(state.progress * frames + 1e-6));
    const range = Math.max(1e-8, maxValue - minValue);
    for (let y = 0; y < floorSamples; y += 1) {
      for (let x = 0; x < frames; x += 1) {
        const observed = x < acquiredFrames;
        const value = observed
          ? THREE.MathUtils.clamp((result.measurement[x * floorSamples + y] - background[y] - minValue) / range, 0, 1)
          : 0;
        const color = heatColor(value, "passive");
        const index = (y * frames + x) * 4;
        pixels.data[index] = color[0];
        pixels.data[index + 1] = color[1];
        pixels.data[index + 2] = color[2];
        pixels.data[index + 3] = 255;
      }
    }
    offscreenCtx.putImageData(pixels, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, plotX, plotY, plotW, plotH);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.strokeRect(plotX + 0.5, plotY + 0.5, plotW - 1, plotH - 1);

    const profile = state.currentSnapshot?.aux || state.result?.aux;
    const profileX = w * 0.77;
    const profileY = plotY;
    const profileW = w - profileX - 14;
    const profileH = plotH;
    ctx.fillStyle = "rgba(240,186,93,0.05)";
    ctx.fillRect(profileX, profileY, profileW, profileH);
    if (profile) {
      ctx.fillStyle = "rgba(240,186,93,0.78)";
      const barWidth = profileW / profile.length;
      for (let index = 0; index < profile.length; index += 1) {
        const barHeight = profile[index] * (profileH - 12);
        ctx.fillRect(profileX + index * barWidth, profileY + profileH - barHeight, Math.max(1, barWidth), barHeight);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.strokeRect(profileX + 0.5, profileY + 0.5, profileW - 1, profileH - 1);
    ctx.fillStyle = "rgba(205,212,209,0.66)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText("background-subtracted floor penumbra · frame ->", plotX, h - 7);
    ctx.fillText(profile ? "angular finite difference" : "inverse pending", profileX, h - 7);
  }

  function heatColor(value, mode) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    const low = [11, 16, 21];
    const middle = mode === "passive" ? [141, 93, 53] : mode === "structured" ? [65, 95, 145] : [36, 110, 114];
    const high = mode === "passive" ? [240, 186, 93] : mode === "structured" ? [169, 194, 255] : [190, 247, 234];
    const from = t < 0.55 ? low : middle;
    const to = t < 0.55 ? middle : high;
    const local = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
    return [
      Math.round(from[0] + (to[0] - from[0]) * local),
      Math.round(from[1] + (to[1] - from[1]) * local),
      Math.round(from[2] + (to[2] - from[2]) * local)
    ];
  }

  function resizeRenderer(renderer, camera, canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelRatio = renderer.getPixelRatio();
    const bufferWidth = Math.round(width * pixelRatio);
    const bufferHeight = Math.round(height * pixelRatio);
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  function hashSeed(a, b, c) {
    const text = `${a}:${b}:${c}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function random() {
      let t = seed += 0x6d2b79f5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

}
