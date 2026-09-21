// js/core/main.js
import * as THREE from 'three';
import { getSim, getAllSims } from './registry.js';
import { PhaseSpaceView } from './PhaseSpaceView.js';
import { ControlPanel } from './ControlPanel.js';
import { playCollisionSound } from './AudioManager.js';
import { estimatePiFromTrajectory } from './PhaseSpaceAnalyzer.js';
import { READING_PATH, WATCH_FOR } from './readingPath.js';

// Import all sims so they self-register
import '../sims/TwoBlocks.js';
import '../sims/ThreeBlocks.js';
import '../sims/NBlocks.js';
import '../sims/RotatingDiscs.js';
import '../sims/GearRackCounter.js';
import '../sims/OpticalWedge.js';
import '../sims/ConeKaleidoscope.js';
import '../sims/WedgeBilliard.js';
import '../sims/HelicalCylinder.js';
import '../sims/RollingSliding.js';
import '../sims/BuffonNeedle.js';
import '../sims/CircleCoverage.js';
import '../sims/ReuleauxRailPi.js';
import '../sims/ReuleauxCollisionLab.js';
import '../sims/CoupledOscillatorWinding.js';
import '../sims/LissajousTurnCounter.js';
import '../sims/StandingWaveNodePi.js';
import '../sims/ChladniPlateEstimator.js';
import '../sims/PolygonRollingRoad.js';
import '../sims/PendulumRail.js';
import '../sims/SphericalTriangleBilliard.js';
import '../sims/TetrahedralMirrorRoom.js';
import '../sims/CoxeterChamberExplorer.js';
import '../sims/TwoPendulums.js';
import '../sims/GaussCircleLattice.js';
import '../sims/VisibleLatticeTrees.js';
import '../sims/SquareFreeSieve.js';
import '../sims/LeibnizWalk.js';
import '../sims/BaselSumWalker.js';
import '../sims/WallisRectangle.js';
import '../sims/BuffonCrossGrid.js';
import '../sims/SphereVolumeMC.js';
import '../sims/BesselZeroCounter.js';
import '../sims/PistonGasGalperin.js';
import '../sims/AirHockeyGalperin.js';
import '../sims/MagneticRepulsionGalperin.js';
import '../sims/RollingShapeOdometer.js';
import '../sims/SlippingDiscOdometer.js';
import '../sims/LoadedDiscGalperin.js';
import '../sims/CoinRotationParadox.js';
import '../sims/GaltonBoardPi.js';
import '../sims/ThreeBodyPi.js';
import '../sims/MandelbrotPi.js';
import '../sims/UniformSumE.js';
import '../sims/LogisticChaosPi.js';
import '../sims/RamanujanPi.js';
import '../sims/RandomMatrixPi.js';
import '../sims/DrunkardsPi.js';
import '../sims/ArchimedesPolygons.js';
import '../sims/DerangementE.js';
import '../sims/OscillatorPeriodPi.js';
import '../sims/GravityRampGalperin.js';
import '../sims/DrainingVesselE.js';
import '../sims/CollisionGasE.js';
import '../sims/ResistorLatticePi.js';
import '../sims/CauchyLighthousePi.js';
import '../sims/IsoperimetricPi.js';
import '../sims/HardSphereCrossSectionPi.js';
import '../sims/RestitutionGalperin.js';

// Tracer afterimage: fraction of the previous sim frame kept each frame.
// With the Tracer toggle on, the sim viewport is not cleared; instead a
// translucent background-colored quad fades old pixels toward the
// background, accumulating motion trails in place.
const TRACER_DAMP = 0.90;

class App {
  constructor() {
    this.sim = null;
    this.simRenderer = null;
    this.phaseRenderer = null;
    this.primaryPhaseView = null;
    this.extraPhaseViews = [];
    this.controlPanel = null;

    this.init();
  }

  init() {
    // Read sim ID from URL
    const params = new URLSearchParams(window.location.search);
    const simId = params.get('id');
    const SimClass = getSim(simId);
    if (!SimClass) {
      document.getElementById('sim-title').textContent = 'Simulation not found';
      return;
    }

    // Parse hash params for initial config
    const hashParams = this.parseHash();
    // Catalog launchers use query parameters; legacy hash presets still win.
    for (const key of ['measurement', 'n']) {
      if (!(key in hashParams) && params.has(key)) {
        hashParams[key] = key === 'n' ? Number(params.get(key)) : params.get(key);
      }
    }

    // Instantiate simulation
    this.sim = new SimClass(hashParams);
    const titleEl = document.getElementById('sim-title');
    titleEl.textContent = SimClass.title;
    document.title = `${SimClass.title} — Computing π Through Physics`;
    this.addAlternativeLinks(SimClass);
    const watch = document.createElement('p');
    watch.className = 'sim-one-liner';
    const watchLabel = document.createElement('strong'); watchLabel.textContent = 'Watch for';
    watch.append(watchLabel, WATCH_FOR[SimClass.id] || SimClass.description);
    document.getElementById('controls-bar').before(watch);

    // Set up description panel
    if (SimClass.explanation) {
      const descContent = document.getElementById('desc-content');
      const descToggle = document.getElementById('desc-toggle');
      const exp = SimClass.explanation;

      let previousDescription = '';
      const updateDesc = () => {
        const html = `
          ${SimClass.rigor ? `<h4>Rigor</h4><p>${SimClass.rigor}</p>` : ''}
          ${SimClass.piMechanism ? `<h4>Method</h4><p>${SimClass.piMechanism}</p>` : ''}
          <h4>Setup</h4><p>${exp.setup}</p>
          <h4>Key Insight</h4><p>${exp.insight}</p>
          ${exp.derivation || ''}
          ${exp.contrast ? `<h4>Why It Differs</h4><p>${exp.contrast}</p>` : ''}
          <h4>Readout</h4><p>${exp.readout || this.getReadoutNote(SimClass)}</p>
          <h4>Formula</h4><p class="formula">${exp.formula}</p>
          <h4>Expected</h4><p class="expected">${exp.getExpected(this.sim.params)}</p>
        `;
        // Preserve expanded derivations, selection and focus while the simulation runs.
        if (html !== previousDescription) {
          descContent.innerHTML = html;
          previousDescription = html;
        }
      };
      updateDesc();
      this.updateDescription = updateDesc;

      descToggle.addEventListener('click', () => {
        // Keep aria-expanded truthful — this button is the only route to the
        // explanation, so assistive tech has to be able to report its state.
        const open = descContent.classList.toggle('open');
        descToggle.setAttribute('aria-expanded', String(open));
      });
    }

    // Create renderers
    this.simRenderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('sim-canvas'),
      antialias: true,
      // Tracer accumulation relies on the previous frame surviving
      // compositing; without this the buffer may be discarded each frame.
      preserveDrawingBuffer: true
    });
    this.simRenderer.setPixelRatio(window.devicePixelRatio);
    this.simRenderer.setClearColor(0x0c1518);

    this.phaseRenderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('phase-canvas'),
      antialias: true
    });
    this.phaseRenderer.setPixelRatio(window.devicePixelRatio);
    this.phaseRenderer.setClearColor(0x0c1518);

    // Init simulation scene
    this.sim.initSimScene();

    // Tracer accumulation state. reset() is invoked by the control panel
    // (and by sims internally), not by this file — wrap it so any restart
    // clears the accumulated afterimage.
    this._tracerWasOn = false;
    this._tracerNeedsClear = false;
    const simReset = this.sim.reset.bind(this.sim);
    this.sim.reset = (...args) => {
      this._tracerNeedsClear = true;
      return simReset(...args);
    };

    // Set up phase space views
    const views = this.sim.getPhaseSpaceViews();
    const primaryDecl = views.find(v => v.primary) || views[0];
    if (primaryDecl) {
      this.primaryPhaseView = new PhaseSpaceView(
        primaryDecl,
        document.getElementById('phase-canvas')
      );
      this.primaryPhaseView.initControls(this.phaseRenderer);
      this.activePhaseView = this.primaryPhaseView;
      this._originalPrimaryView = null;
    }

    // Extra views
    this.initExtraViews(views.filter(v => v !== primaryDecl));

    // Control panel
    this.controlPanel = new ControlPanel(this.sim, document.getElementById('controls-bar'));
    this.controlPanel.build();
    // Allow the sim to request a control-panel rebuild (used when a mode
    // toggle changes which controls are relevant).
    this.sim._onControlsChanged = () => this.controlPanel.build();

    if (this.sim.getDetailedReadoutHTML) {
      const records = document.createElement('details');
      records.className = 'simulation-records'; records.id = 'simulation-records';
      records.innerHTML = '<summary>Grid refinement · bounds and convergence</summary><div class="simulation-records-content"></div>';
      document.getElementById('main-view').after(records);
      records.addEventListener('toggle', () => this.controlPanel.updateReadouts());
    }

    // Handle resize
    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Raw phase space toggle
    this.showRawPhase = false;
    this.supportsRawPhase = typeof this.sim.getRawPhasePoint === 'function';
    const rawToggle = document.getElementById('raw-toggle');
    if (rawToggle) {
      rawToggle.style.display = this.supportsRawPhase ? '' : 'none';
      rawToggle.addEventListener('click', () => {
        if (!this.supportsRawPhase) return;
        this.showRawPhase = !this.showRawPhase;
        rawToggle.classList.toggle('active', this.showRawPhase);
        rawToggle.textContent = this.showRawPhase ? 'Rescaled Phase Space' : 'Raw Phase Space';
        // Update expected boundary shape
        this._updateExpectedShape();
      });
    }
    this.phaseAxisOverlay = this.ensurePhaseAxisOverlay();

    // Transform animation state
    this.transformProgress = 0;  // 0 = rescaled, 1 = raw
    this.transformTarget = 0;
    this.transforming = false;

    const transformBtn = document.getElementById('transform-btn');
    if (transformBtn) {
      transformBtn.style.display = this.supportsRawPhase ? '' : 'none';
      transformBtn.addEventListener('click', () => {
        if (!this.supportsRawPhase) return;
        this.transformTarget = this.transformTarget === 0 ? 1 : 0;
        this.transforming = true;
        transformBtn.classList.toggle('active', this.transformTarget === 1);
        transformBtn.textContent = this.transformTarget === 1 ? 'Morphing → Raw…' : 'Morphing → Rescaled…';
      });
    }

    // Start animation loop
    this.animate();

    window.addEventListener('hashchange', () => {
      const newParams = this.parseHash();
      Object.assign(this.sim.params, newParams);
    });
  }

  initExtraViews(viewDecls) {
    const container = document.getElementById('extra-views-overlay');
    if (!container) return;
    container.innerHTML = '';
    if (viewDecls.length === 0) return;

    for (const decl of viewDecls) {
      // A real button: these swap the main phase view, so they are controls, not
      // decoration. As a clickable <div> they were unreachable by keyboard.
      const wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.className = 'mini-view';
      wrapper.style.position = 'relative';
      wrapper.setAttribute('aria-label', `Show phase view: ${decl.label}`);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${decl.label} thumbnail`);
      wrapper.appendChild(canvas);

      // Label
      const label = document.createElement('div');
      label.className = 'mini-label';
      label.textContent = decl.label.split('(')[0].trim(); // short label
      wrapper.appendChild(label);

      container.appendChild(wrapper);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setClearColor(0x0c1518);

      const view = new PhaseSpaceView(decl, canvas);
      view.renderer = renderer;
      view.wrapper = wrapper;
      this.extraPhaseViews.push(view);

      wrapper.addEventListener('click', () => this.swapPhaseView(view));
    }
  }

  addAlternativeLinks(SimClass) {
    const old = document.querySelector('.alt-links');
    old?.remove();
    document.querySelector('.reading-next')?.remove();
    const alternatives = [...(SimClass.alternatives || [])];
    const pathIndex = READING_PATH.findIndex(step => step.id === SimClass.id);
    if (pathIndex !== -1) {
      const next = READING_PATH[pathIndex + 1];
      const pathLink = document.createElement('a');
      pathLink.className = 'reading-next';
      pathLink.href = READING_PATH[pathIndex].href || (next ? `sim.html?id=${next.id}` : 'index.html');
      pathLink.textContent = `${pathIndex + 1}/${READING_PATH.length} · ${READING_PATH[pathIndex].label} → ${READING_PATH[pathIndex].next}`;
      document.getElementById('header').insertAdjacentElement('afterend', pathLink);
    }
    if (alternatives.length === 0) return;

    const holder = document.createElement('div');
    holder.className = 'alt-links';
    for (const alt of alternatives) {
      const link = document.createElement('a');
      link.className = 'alt-link';
      link.href = `sim.html?id=${alt.id}`;
      link.textContent = alt.label;
      holder.appendChild(link);
    }
    document.getElementById('sim-title').after(holder);
  }

  ensurePhaseAxisOverlay() {
    const wrapper = document.getElementById('phase-canvas-wrapper');
    if (!wrapper) return null;
    let overlay = document.getElementById('phase-axis-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'phase-axis-overlay';
      wrapper.appendChild(overlay);
    }
    return overlay;
  }

  updatePhaseAxisOverlay(view) {
    const overlay = this.phaseAxisOverlay || this.ensurePhaseAxisOverlay();
    if (!overlay || !view) return;

    const labels = view.getAxisLabels?.() || {};
    const dim = view.decl.dimension || 2;
    overlay.className = `phase-axis-overlay phase-axis-overlay-${dim}d`;
    overlay.replaceChildren();

    const title = document.createElement('div');
    title.className = 'phase-axis-title';
    title.textContent = view.decl.label;
    overlay.appendChild(title);

    const makeLabel = (axis, text) => {
      const label = document.createElement('div');
      label.className = `phase-axis-label phase-axis-${axis}`;
      const key = document.createElement('span');
      key.className = 'phase-axis-key';
      key.textContent = axis.toUpperCase();
      const value = document.createElement('span');
      value.textContent = text || axis;
      label.append(key, value);
      return label;
    };

    overlay.appendChild(makeLabel('x', labels.x));
    overlay.appendChild(makeLabel('y', labels.y));
    if (dim === 3) overlay.appendChild(makeLabel('z', labels.z));
  }

  getReadoutNote(SimClass) {
    const nature = this.sim.getPiNature?.() || SimClass.piNature || 'exact';
    if (nature === 'extension') {
      return 'The collision count is a chamber-hit count. It is useful for geometry, but it is not a direct π readout.';
    }
    if (nature === 'legacy') {
      return 'The count checks the reflection geometry, but π is already present in the chosen input angle.';
    }
    if (nature === 'statistical') {
      return 'The estimate converges by repeated random samples. More samples reduce noise, but not digit-by-digit.';
    }
    if (nature === 'bounded') {
      return 'The estimate comes from the solved resistor field. After both finite-grid solves converge, the boundary conditions bracket the infinite-grid answer; increasing the grid narrows that bracket. Solver residual and finite-boundary error are separate.';
    }
    if (nature === 'biased') {
      return 'This is a biased estimate of π: the count is π-free, but the answer drifts from ' +
             'true π depending on the setup. Δ shows the honest distance from π; constant-width ' +
             'shapes drive the bias to zero.';
    }
    return 'The displayed value is computed from the measured count and the setup parameter shown in the formula.';
  }

  swapPhaseView(extraView) {
    if (this.activePhaseView === extraView) {
      // Clicking the already-active extra → restore primary to main
      this.activePhaseView = this.primaryPhaseView;
    } else {
      // Show the clicked extra in the main canvas
      this.activePhaseView = extraView;
    }
    this._updateViewHighlights();
  }

  _updateViewHighlights() {
    // Clear all highlights
    for (const ev of this.extraPhaseViews) {
      if (ev.wrapper) ev.wrapper.classList.remove('active-indicator');
    }

    const isSwapped = this.activePhaseView !== this.primaryPhaseView;

    // Highlight the currently zoomed-in extra view with cyan glow
    if (isSwapped) {
      const active = this.extraPhaseViews.find(v => v === this.activePhaseView);
      if (active?.wrapper) active.wrapper.classList.add('active-indicator');
    }
  }

  _updateExpectedShape() {
    if (!this.primaryPhaseView) return;
    if (this.showRawPhase && this.sim.getRawExpectedShape) {
      const shape = this.sim.getRawExpectedShape(this.primaryPhaseView.decl.id);
      if (shape) {
        this.primaryPhaseView.setExpectedShape(shape.type, shape.params);
        return;
      }
    }
    // Default: show the unit circle for rescaled mode (matches the existing ring)
    // We don't overlay an extra shape on top of the existing ring geometry in rescaled mode.
    this.primaryPhaseView.setExpectedShape('none');
  }

  parseHash() {
    const hash = window.location.hash.slice(1);
    const params = {};
    for (const pair of hash.split('&')) {
      const [k, v] = pair.split('=');
      if (k) params[k] = isNaN(v) ? v : Number(v);
    }
    return params;
  }

  resize() {
    const simWrapper = document.getElementById('sim-canvas-wrapper');
    const phaseWrapper = document.getElementById('phase-canvas-wrapper');

    const simRect = simWrapper.getBoundingClientRect();
    this.simRenderer.setSize(simRect.width, simRect.height, false);

    const phaseRect = phaseWrapper.getBoundingClientRect();
    this.phaseRenderer.setSize(phaseRect.width, phaseRect.height, false);

    for (const ev of this.extraPhaseViews) {
      const rect = ev.canvas.parentElement.getBoundingClientRect();
      ev.renderer.setSize(rect.width, rect.height, false);
    }

    // setSize resets the drawing buffer, so stale tracer math would fade up
    // from black instead of the background color.
    this._tracerNeedsClear = true;
  }

  _ensureTracerScene() {
    if (this._tracerScene) return;
    this._tracerScene = new THREE.Scene();
    this._tracerCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    const fadeMat = new THREE.MeshBasicMaterial({
      color: 0x0c1518,  // must match simRenderer clear color
      transparent: true,
      opacity: 1 - TRACER_DAMP,
      depthTest: false,
      depthWrite: false
    });
    this._tracerScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));
  }

  _renderSimViewport() {
    const tracer = !!this.sim.tracer;
    if (tracer !== this._tracerWasOn) this._tracerNeedsClear = true;
    this._tracerWasOn = tracer;

    if (!tracer) {
      // Unchanged legacy path: autoClear is true here (the tracer path below
      // always restores it), so this clears and renders exactly as before.
      this.simRenderer.render(this.sim.simScene, this.sim.simCamera);
      return;
    }

    this._ensureTracerScene();
    if (this._tracerNeedsClear) {
      this.simRenderer.clear();
      this._tracerNeedsClear = false;
    }
    this.simRenderer.autoClear = false;
    // Depth must still be cleared each frame; only color accumulates.
    this.simRenderer.clearDepth();
    this.simRenderer.render(this._tracerScene, this._tracerCamera);
    this.simRenderer.render(this.sim.simScene, this.sim.simCamera);
    this.simRenderer.autoClear = true;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (document.hidden) return;

    if (this.sim.shouldStep()) {
      // Speed controls physical time per frame.
      // step() handles ALL collisions within dt correctly.
      // Small dt per call = smooth block movement.
      const physDt = 0.0001;
      const stepsPerFrame = Math.max(1, Math.round(this.sim.speed * 10));
      for (let i = 0; i < stepsPerFrame && !this.sim.finished; i++) {
        this.sim.step(physDt);
      }
      // Flush collision-time phase points for sharp reflections in trail
      this.sim.flushPhasePoints();
      // Also record current position for continuous trail between collisions
      this.sim.recordPhasePoint();
      this.sim.recordRawPhasePoint();

      // Play collision sounds for new effects (limit to avoid audio spam)
      if (this.sim.collisionEffects) {
        const now = performance.now();
        const newEffects = this.sim.collisionEffects.filter(e => now - e.time < 20);
        if (newEffects.length > 0 && newEffects.length <= 3) {
          for (const e of newEffects) {
            playCollisionSound(e.type, Math.min(1, 0.3 + 0.7 / newEffects.length));
          }
        }
      }
    }

    // Update simulation visuals
    this.sim.updateSimScene();

    // Fix sim camera aspect ratio — preserve framing, add padding for canvas shape
    const simCam = this.sim.simCamera;
    if (simCam && simCam.isOrthographicCamera) {
      if (!simCam._origBounds) {
        simCam._origBounds = { l: simCam.left, r: simCam.right, t: simCam.top, b: simCam.bottom };
      }
      const ob = simCam._origBounds;
      const simRect = document.getElementById('sim-canvas-wrapper').getBoundingClientRect();
      const canvasAspect = simRect.width / simRect.height;
      const viewAspect = (ob.r - ob.l) / (ob.t - ob.b);
      if (canvasAspect > viewAspect) {
        const cx = (ob.l + ob.r) / 2;
        const halfH = (ob.t - ob.b) / 2;
        const halfW = halfH * canvasAspect;
        simCam.left = cx - halfW; simCam.right = cx + halfW;
        simCam.top = ob.t; simCam.bottom = ob.b;
      } else {
        const cy = (ob.t + ob.b) / 2;
        const halfW = (ob.r - ob.l) / 2;
        const halfH = halfW / canvasAspect;
        simCam.left = ob.l; simCam.right = ob.r;
        simCam.top = cy + halfH; simCam.bottom = cy - halfH;
      }
      simCam.updateProjectionMatrix();
    } else if (simCam && simCam.isPerspectiveCamera) {
      const simRect = document.getElementById('sim-canvas-wrapper').getBoundingClientRect();
      simCam.aspect = simRect.width / simRect.height;
      simCam.updateProjectionMatrix();
    }

    this._renderSimViewport();

    // Advance transform animation (lerp over ~2 seconds at 60fps ≈ 120 frames)
    if (this.transforming) {
      const speed = 0.025;
      const prev = this.transformProgress;
      if (this.transformTarget === 1) {
        this.transformProgress = Math.min(1, this.transformProgress + speed);
      } else {
        this.transformProgress = Math.max(0, this.transformProgress - speed);
      }
      if (this.transformProgress === this.transformTarget) {
        this.transforming = false;
        // Snap showRawPhase to match transform target for consistent button state
        const wasRaw = this.showRawPhase;
        this.showRawPhase = this.transformTarget === 1;
        if (wasRaw !== this.showRawPhase) {
          const rawToggle = document.getElementById('raw-toggle');
          if (rawToggle) {
            rawToggle.classList.toggle('active', this.showRawPhase);
            rawToggle.textContent = this.showRawPhase ? 'Rescaled Phase Space' : 'Raw Phase Space';
          }
          this._updateExpectedShape();
        }
        const transformBtn = document.getElementById('transform-btn');
        if (transformBtn) {
          transformBtn.textContent = this.transformTarget === 1 ? 'Animate Transform' : 'Animate Transform';
        }
      }
    }

    // Update main phase space view (activePhaseView may differ from primaryPhaseView)
    const mainPhaseView = this.activePhaseView || this.primaryPhaseView;
    if (mainPhaseView) {
      this.updatePhaseAxisOverlay(mainPhaseView);
      const t = this.transformProgress;
      let trail, extractFn;
      if (t > 0 && t < 1) {
        const rescaledTrail = this.sim.phaseTrail;
        const rawTrail = this.sim.rawPhaseTrail;
        const len = Math.min(rescaledTrail.length, rawTrail.length);
        trail = new Array(len);
        const rescaledExtract = this.sim.getPhaseExtractor?.(mainPhaseView.decl.id)
          || (pt => pt.slice(0, mainPhaseView.decl.dimension));
        for (let i = 0; i < len; i++) {
          const rPt = rescaledExtract(rescaledTrail[i]);
          const wPt = rawTrail[i];
          trail[i] = rPt.map((v, j) => v * (1 - t) + ((wPt[j] !== undefined ? wPt[j] : v) * t));
        }
        extractFn = pt => pt;
      } else {
        trail = this.showRawPhase && this.supportsRawPhase ? this.sim.rawPhaseTrail : this.sim.phaseTrail;
        extractFn = this.showRawPhase && this.supportsRawPhase
          ? (pt => pt)
          : (this.sim.getPhaseExtractor?.(mainPhaseView.decl.id)
            || (pt => pt.slice(0, mainPhaseView.decl.dimension)));
      }
      mainPhaseView.setTrailStyle(this.sim.phaseTrailStyle || 'line');
      mainPhaseView.updateTrail(trail, extractFn);
      // Render an optional uncertainty band on every view that has a circular
      // boundary. Each sim with an approximate π estimate may expose
      // getPhaseUncertainty(). Diagnostic views with boundary='none' don't get
      // a band — the unit circle isn't meaningful there.
      const sharedDelta = (typeof this.sim.getPhaseUncertainty === 'function')
        ? this.sim.getPhaseUncertainty() : 0;
      const overlayTrails = (typeof this.sim.getOverlayTrails === 'function')
        ? this.sim.getOverlayTrails() : [];
      const overlayMode = (typeof this.sim.getOverlayRenderMode === 'function')
        ? this.sim.getOverlayRenderMode() : 'line';
      const allViews = [this.primaryPhaseView, ...this.extraPhaseViews].filter(Boolean);
      for (const v of allViews) {
        const decl = v.decl;
        const dim = decl.dimension || 2;
        const wantsCircular = dim === 2 && decl.boundary !== 'none';
        v.setUncertaintyBand(wantsCircular ? sharedDelta : 0);
        if (typeof v.setOverlayTrails === 'function') {
          // Only render overlays on circular-boundary 2D views; the unit circle
          // is the meaningful frame for them. Diagnostic views opt out.
          v.setOverlayTrails(wantsCircular ? overlayTrails : [], overlayMode);
        }
      }
      const phaseRect = document.getElementById('phase-canvas-wrapper').getBoundingClientRect();
      mainPhaseView.render(this.phaseRenderer, phaseRect.width, phaseRect.height);
    }

    // Update extra views
    for (const ev of this.extraPhaseViews) {
      const extractFn = this.sim.getPhaseExtractor?.(ev.decl.id)
        || (pt => pt.slice(0, ev.decl.dimension));
      ev.setTrailStyle(this.sim.phaseTrailStyle || 'line');
      ev.updateTrail(this.sim.phaseTrail, extractFn);
      const rect = ev.canvas.parentElement.getBoundingClientRect();
      ev.render(ev.renderer, rect.width, rect.height);
    }

    // Update controls display
    this.controlPanel?.updateReadouts();

    // Volume-based pi estimation for chaotic sims (every 60 frames)
    this._frameCount = (this._frameCount || 0) + 1;
    if (this.sim.getPiMethod?.() === 'volume' && this._frameCount % 60 === 0) {
      const result = estimatePiFromTrajectory(this.sim.phaseTrail, 'volume');
      if (result.pi > 0) {
        const piEl = document.getElementById('pi-approx');
        if (piEl) piEl.textContent = `~${result.pi.toFixed(4)} (vol)`;
      }
    }

    // Refresh description expected count
    this.updateDescription?.();
  }
}

new App();
