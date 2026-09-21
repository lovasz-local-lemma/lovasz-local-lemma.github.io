import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class PhaseSpaceView {
  constructor(viewDecl, canvas) {
    this.decl = viewDecl;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.controls = null;
    const dim = viewDecl.dimension || 2;

    if (dim === 2) {
      this.camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
      this.camera.position.z = 1;
    } else {
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
      this.camera.position.set(1.5, 1.2, 1.5);
      this.camera.lookAt(0, 0, 0);
    }

    // Boundary circle/sphere — dim purple wireframe. Diagnostic views can opt out.
    if (dim === 2 && viewDecl.boundary !== 'none') {
      const circleGeom = new THREE.RingGeometry(0.99, 1.0, 128);
      const circleMat = new THREE.MeshBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      this.scene.add(new THREE.Mesh(circleGeom, circleMat));
    } else if (dim !== 2 && viewDecl.boundary !== 'none') {
      const sphereGeom = new THREE.SphereGeometry(1, 32, 32);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0x7c83fd, wireframe: true, transparent: true, opacity: 0.15 });
      this.scene.add(new THREE.Mesh(sphereGeom, sphereMat));
    }

    // Optional uncertainty band: two concentric rings at radii 1±δ that the
    // sim can update each frame via setUncertaintyBand(). Used when the sim
    // gives an approximate π estimate with a confidence interval.
    this.uncertaintyBand = null;

    // Axis lines for 2D
    if (dim === 2) {
      const axisMat = new THREE.LineBasicMaterial({ color: 0x405047 });
      const axisX = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.2, 0, 0), new THREE.Vector3(1.2, 0, 0)]);
      this.scene.add(new THREE.Line(axisX, axisMat));
      const axisY = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.2, 0), new THREE.Vector3(0, 1.2, 0)]);
      this.scene.add(new THREE.Line(axisY, axisMat));
    }

    // Trail — preallocated buffer (matches the sims' phase-trail cap so a full
    // ring-buffer window can be shown without truncation).
    this.maxPoints = 12000;
    const positions = new Float32Array(this.maxPoints * 3);
    const colors = new Float32Array(this.maxPoints * 4);
    this.trailGeom = new THREE.BufferGeometry();
    this.trailGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trailGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    this.trailGeom.setDrawRange(0, 0);
    this.trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });
    this.trailLine = new THREE.Line(this.trailGeom, this.trailMat);
    this.scene.add(this.trailLine);

    // Current point dot
    const dotGeom = new THREE.SphereGeometry(0.02, 8, 8);
    this.dot = new THREE.Mesh(dotGeom, new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }));
    this.scene.add(this.dot);

  }

  setTrailStyle(style) {
    const points = style === 'points';
    if (points && !this.trailPoints) {
      this.trailPoints = new THREE.Points(this.trailGeom, new THREE.PointsMaterial({
        vertexColors: true, transparent: true, size: 3, sizeAttenuation: false,
      }));
      this.scene.add(this.trailPoints);
    }
    this.trailLine.visible = !points;
    if (this.trailPoints) this.trailPoints.visible = points;
    this.dot.visible = !points;
  }

  getAxisLabels() {
    if (this.decl.axisLabels) return this.decl.axisLabels;

    const clean = (text) => text
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if ((this.decl.dimension || 2) === 2) {
      const parts = this.decl.label.split(/\s+vs\s+/i);
      if (parts.length === 2) {
        return { x: clean(parts[0]), y: clean(parts[1]) };
      }
      return { x: 'x', y: 'y' };
    }

    const timesParts = this.decl.label.split(/\s+×\s+|\s+x\s+/i).map(clean);
    if (timesParts.length >= 3) {
      return { x: timesParts[0], y: timesParts[1], z: timesParts[2] };
    }

    return { x: 'x', y: 'y', z: 'z' };
  }

  initControls(renderer) {
    this.renderer = renderer;
    if (this.decl.dimension === 3 && !this.controls) {
      this.controls = new OrbitControls(this.camera, renderer.domElement);
      this.controls.enableDamping = true;
    }
  }

  // Lazily set up a render-to-texture for additive overlay accumulation.
  // Each frame the new (since last frame) overlay trail points are drawn as
  // additive splats. The texture builds up over time, so the visualisation
  // is immune to per-frame vertex-buffer explosions and naturally clips any
  // out-of-bounds trail data. Any view with `boundary !== 'none'` and a 2D
  // dimension can use this.
  _initAccum() {
    if (this.accumRT || !this.renderer) return;
    const dim = this.decl.dimension || 2;
    if (dim !== 2) return;
    const SIZE = 1024;
    this.accumRT = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.accumScene = new THREE.Scene();
    // Camera view spans [-1.4, 1.4] so the accumulation texture covers slightly
    // more than the unit circle. Anything outside is naturally clipped.
    this.accumCamera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 10);
    this.accumCamera.position.z = 1;
    const quadMat = new THREE.MeshBasicMaterial({
      map: this.accumRT.texture, transparent: true, depthWrite: false, depthTest: false,
    });
    this.accumQuad = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), quadMat);
    this.accumQuad.position.z = -0.04;
    this.scene.add(this.accumQuad);
    this.lastOverlayLengths = [];
    this._clearAccum();
  }

  _clearAccum() {
    if (!this.accumRT || !this.renderer) return;
    const renderer = this.renderer;
    const oldAutoClear = renderer.autoClear;
    const oldClearColor = renderer.getClearColor(new THREE.Color()).clone();
    const oldClearAlpha = renderer.getClearAlpha();
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.accumRT);
    renderer.clear();
    renderer.setRenderTarget(null);
    renderer.setClearColor(oldClearColor, oldClearAlpha);
    renderer.autoClear = oldAutoClear;
    this.lastOverlayLengths = [];
  }

  updateTrail(phaseTrail, extractFn) {
    const positions = this.trailGeom.attributes.position.array;
    const colors = this.trailGeom.attributes.color.array;
    const total = phaseTrail.length;
    const count = Math.min(total, this.maxPoints);
    const start = total - count;   // show the MOST RECENT points, not the oldest
    for (let i = 0; i < count; i++) {
      const pt = extractFn(phaseTrail[start + i]);
      positions[i * 3] = pt[0];
      positions[i * 3 + 1] = pt[1];
      positions[i * 3 + 2] = pt[2] || 0;
      const alpha = i / count;
      colors[i * 4] = 0.298;
      colors[i * 4 + 1] = 0.788;
      colors[i * 4 + 2] = 0.941;
      colors[i * 4 + 3] = alpha;
    }
    this.trailGeom.attributes.position.needsUpdate = true;
    this.trailGeom.attributes.color.needsUpdate = true;
    this.trailGeom.setDrawRange(0, count);
    if (count > 0) {
      const last = extractFn(phaseTrail[total - 1]);   // dot at the live (newest) point
      this.dot.position.set(last[0], last[1], last[2] || 0);
    }
  }

  // Show multiple overlaid trails. Two rendering modes:
  //   'line'  — persistent THREE.Line meshes, smooth, but vulnerable to
  //             unbounded trail data (vertex extents follow the data).
  //   'pixel' — render-to-texture additive accumulation, robust to extreme
  //             values (out-of-bounds data is clipped to the texture extent).
  // For multi-mode magnetic, 'pixel' is required because the smooth-physics
  // sub-states can occasionally drift outside the unit circle.
  setOverlayTrails(overlays, mode = 'pixel') {
    if (mode === 'line') {
      // Hide accumulation quad if previously created.
      if (this.accumQuad) this.accumQuad.visible = false;
      this._setOverlayTrailsLine(overlays);
    } else {
      // Hide line meshes if previously created.
      if (this.overlayLines) {
        for (const o of this.overlayLines) o.line.visible = false;
      }
      this._setOverlayTrailsPixel(overlays);
    }
  }

  _setOverlayTrailsLine(overlays) {
    if (!this.overlayLines) this.overlayLines = [];
    const list = Array.isArray(overlays) ? overlays : [];
    while (this.overlayLines.length < list.length) {
      const positions = new Float32Array(this.maxPoints * 3);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
      const line = new THREE.Line(geom, mat);
      this.scene.add(line);
      this.overlayLines.push({ line, geom, mat });
    }
    while (this.overlayLines.length > list.length) {
      const o = this.overlayLines.pop();
      this.scene.remove(o.line);
      o.geom.dispose();
      o.mat.dispose();
    }
    for (let i = 0; i < list.length; i++) {
      const overlay = list[i];
      const o = this.overlayLines[i];
      o.line.visible = true;
      const trail = overlay.trail || [];
      const positions = o.geom.attributes.position.array;
      const count = Math.min(trail.length, this.maxPoints);
      const start = trail.length - count;   // most recent points
      for (let j = 0; j < count; j++) {
        positions[j * 3] = trail[start + j][0];
        positions[j * 3 + 1] = trail[start + j][1];
        positions[j * 3 + 2] = 0.006;
      }
      o.geom.setDrawRange(0, count);
      o.geom.attributes.position.needsUpdate = true;
      o.mat.color.setHex(overlay.color ?? 0xffffff);
      o.mat.opacity = overlay.opacity ?? 0.7;
    }
  }

  _setOverlayTrailsPixel(overlays) {
    const list = Array.isArray(overlays) ? overlays : [];
    if (!this.renderer) return;
    this._initAccum();
    if (!this.accumRT) return;
    if (this.accumQuad) this.accumQuad.visible = true;

    // Detect a trail reset (length decreased) — clear the accumulation.
    let needClear = list.length !== this.lastOverlayLengths.length;
    if (!needClear) {
      for (let i = 0; i < list.length; i++) {
        const trailLen = list[i].trail?.length || 0;
        const lastLen = this.lastOverlayLengths[i] || 0;
        if (trailLen < lastLen) { needClear = true; break; }
      }
    }
    if (needClear) this._clearAccum();

    if (list.length === 0) return;

    // Build a single Points mesh with vertex colors for the new trail points
    // across all overlays this frame.
    const newSegs = [];
    let totalNew = 0;
    for (let i = 0; i < list.length; i++) {
      const overlay = list[i];
      const trail = overlay.trail || [];
      const lastLen = this.lastOverlayLengths[i] || 0;
      const newLen = trail.length;
      if (newLen > lastLen) {
        newSegs.push({ trail, lastLen, newLen, color: new THREE.Color(overlay.color ?? 0xffffff) });
        totalNew += newLen - lastLen;
      }
      this.lastOverlayLengths[i] = newLen;
    }
    if (totalNew === 0) return;

    const positions = new Float32Array(totalNew * 3);
    const colors = new Float32Array(totalNew * 3);
    let idx = 0;
    for (const seg of newSegs) {
      for (let j = seg.lastLen; j < seg.newLen; j++) {
        positions[idx * 3] = seg.trail[j][0];
        positions[idx * 3 + 1] = seg.trail[j][1];
        positions[idx * 3 + 2] = 0;
        colors[idx * 3] = seg.color.r;
        colors[idx * 3 + 1] = seg.color.g;
        colors[idx * 3 + 2] = seg.color.b;
        idx++;
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);

    // Render the new points additively onto the accumulation RT (no clear).
    this.accumScene.clear();
    this.accumScene.add(points);
    const renderer = this.renderer;
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.accumRT);
    renderer.render(this.accumScene, this.accumCamera);
    renderer.setRenderTarget(null);
    renderer.autoClear = oldAutoClear;

    geom.dispose();
    mat.dispose();
  }

  // Show/hide concentric rings at radii 1−δ and 1+δ to indicate the
  // confidence interval around the canonical unit circle.
  setUncertaintyBand(delta) {
    if (!Number.isFinite(delta) || delta <= 0) {
      if (this.uncertaintyBand) {
        this.scene.remove(this.uncertaintyBand);
        this.uncertaintyBand.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        this.uncertaintyBand = null;
      }
      return;
    }
    if (this.uncertaintyBand) {
      this.scene.remove(this.uncertaintyBand);
      this.uncertaintyBand.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    const group = new THREE.Group();
    const innerR = Math.max(0.01, 1 - delta);
    const outerR = Math.min(2.0, 1 + delta);
    const ringMat = () => new THREE.MeshBasicMaterial({
      color: 0xf7c948, transparent: true, opacity: 0.32, side: THREE.DoubleSide
    });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(innerR - 0.005, innerR + 0.005, 128), ringMat());
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(outerR - 0.005, outerR + 0.005, 128), ringMat());
    group.add(innerRing);
    group.add(outerRing);
    this.scene.add(group);
    this.uncertaintyBand = group;
  }

  setExpectedShape(type, params = {}) {
    // Remove old expected shape
    if (this.expectedShape) {
      this.scene.remove(this.expectedShape);
      this.expectedShape.geometry?.dispose();
      this.expectedShape.material?.dispose();
      this.expectedShape = null;
    }

    if (type === 'circle') {
      const r = params.radius || 1.0;
      const points = [];
      const segments = 128;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), 0));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color: 0x7c83fd, dashSize: 0.05, gapSize: 0.03,
        transparent: true, opacity: 0.6
      });
      this.expectedShape = new THREE.Line(geom, mat);
      this.expectedShape.computeLineDistances();
      this.scene.add(this.expectedShape);
    }

    if (type === 'sphere') {
      const r = params.radius || 1.0;
      const geom = new THREE.SphereGeometry(r, 32, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x7c83fd, wireframe: true, transparent: true, opacity: 0.08
      });
      this.expectedShape = new THREE.Mesh(geom, mat);
      this.scene.add(this.expectedShape);
    }

    if (type === 'ellipse') {
      const a = params.semiAxisX || 1.0;
      const b = params.semiAxisY || 1.0;
      const points = [];
      const segments = 128;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(a * Math.cos(angle), b * Math.sin(angle), 0));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color: 0x7c83fd, dashSize: 0.05, gapSize: 0.03,
        transparent: true, opacity: 0.6
      });
      this.expectedShape = new THREE.Line(geom, mat);
      this.expectedShape.computeLineDistances();
      this.scene.add(this.expectedShape);
    }

    if (type === 'none' || !type) {
      // Shape already cleared above; nothing more to do
    }
  }

  render(renderer, width, height) {
    // Fix aspect ratio so circles stay circular
    const aspect = width / height;
    if (this.decl.dimension === 2 || !this.decl.dimension) {
      const base = 1.2;
      if (aspect > 1) {
        this.camera.left = -base * aspect;
        this.camera.right = base * aspect;
        this.camera.top = base;
        this.camera.bottom = -base;
      } else {
        this.camera.left = -base;
        this.camera.right = base;
        this.camera.top = base / aspect;
        this.camera.bottom = -base / aspect;
      }
      this.camera.updateProjectionMatrix();
    } else if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }

    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width, height);
    renderer.setScissorTest(true);
    if (this.controls) this.controls.update();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
  }
}
