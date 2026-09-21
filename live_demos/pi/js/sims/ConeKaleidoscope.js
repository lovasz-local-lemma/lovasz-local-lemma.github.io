import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// ── ONE stepper, THREE surfaces ──────────────────────────────────────────────
// The state (x, y, vx, vy) always lives in the FLAT developed wedge
//     W = { 0 ≤ y ≤ x·tanθ, 0 ≤ x ≤ R },   θ = atan(10^-n)
// and step() below is the plain two-mirror stepper — the same one OpticalWedge
// runs. The `surface` selector only chooses how W is BENT into 3D for the eye:
//     plane    — leave it flat (a pie sector about the apex)
//     cone     — roll it up about the apex     (polar wrap)
//     cylinder — wrap it along x around a tube (Cartesian wrap: ring + helix)
// Bending paper without stretching it is an isometry, so geodesics, reflections
// and therefore the COUNT are identical on all three. That is this card's whole
// thesis, so switching surface deliberately does NOT reset — the counter does
// not blink. Nothing in the SURFACE EMBEDDING section may touch state or count.
//
// HONESTY: the true wedge is a hair (0.573° at n=2, 0.00573° at n=4), so every
// surface here is drawn with a transverse VISUAL EXAGGERATION. That factor is a
// labelled control, is printed live in the readout, and can be set to 1× — at
// which point the picture really is the isometry the prose claims. It never
// touches the dynamics.
// ─────────────────────────────────────────────────────────────────────────────

const SURFACE_LABEL = {
  plane: 'flat sector',
  cone: 'cone',
  cylinder: 'cylinder (ring + helix)',
};

export class ConeKaleidoscope extends Simulation {
  static id = 'cone-kaleidoscope';
  static title = 'The Wedge in Disguise';
  static description = 'One wedge on three surfaces — flat sector, cone, cylinder: bending changes the picture, never the count';
  static piMechanism = 'exact geometric: developed wedge angle θ = arctan(10^-n) → reflections → π (identical on all three surfaces)';
  static rigor = 'Exact Geometric';
  static sortOrder = 46;
  // Hub thumbnail: perspective scene (no getPreviewBox — that's ortho-only).
  // At dt=0.04/step the ball reaches the apex ≈ step 24 and is back at the rim
  // by ≈ step 48, so 24 is peak action: full inbound trail, ball at the tip.
  static previewSteps = 24;
  static previewParams = { surface: 'cone' };
  static alternatives = [
    { id: 'optical-wedge', label: 'The flat mirror wedge (one ray, unfolded)' },
    { id: 'helical-cylinder', label: 'The retired standalone cylinder card' },
  ];
  static explanation = {
    setup: 'A geodesic ray bounces between two mirrors on a surface. Whatever surface you pick — a flat sector, a cone patch between two meridians, or a cylinder between a ring and a helix — the mirrors bound the SAME flat wedge of opening angle θ = arctan(10^-n) once you develop (unroll) the surface.',
    insight: 'Cones and cylinders are developable: you can flatten them without stretching. An isometry carries geodesics to straight lines and reflections to reflections, so all three surfaces run one and the same flat two-mirror problem, and all three give the same reflection count N with π ≈ Nθ. The wedge is intrinsic; the surface is a costume. Switch surfaces mid-flight and the counter does not blink — that is the demonstration.',
    contrast: 'Honest picture warning: the true wedge is a hair — 5.71° at n=1, 0.573° at n=2, 0.00573° at n=4 — so every render here stretches it ACROSS the wedge to keep the path visible. On Auto that factor is 31× / 314× / 31416× for the sector and cone (n=1/2/4) and 2× / 20× / 2000× for the cylinder; the live value is printed in the readout. Set "Visual exaggeration" to 1× and the picture becomes a true isometry — at n=1 the sector is a thin 5.7° sliver, the cone a needle, the cylinder a squat tube — and the count is identical to the count at 31416×. That is the point: the exaggeration is a lie about the picture, never about the counting.',
    formula: 'π = reflections × θ, with θ = arctan(10^-n)  [EXACT GEOMETRIC COUNTER]',
    getExpected: (params) => {
      const n = params.n || 2;
      const theta = Math.atan(Math.pow(10, -n));
      const expected = Math.floor(Math.PI / theta);
      return `For n=${n}: θ = arctan(10^-${n}) = ${theta.toFixed(6)} rad. Expect ${expected} reflections on EVERY surface (plane, cone, cylinder), so Nθ ≈ ${(expected * theta).toFixed(6)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.maxTrailLength = 12000;
    this.surface = SURFACE_LABEL[params.surface] ? params.surface : 'cone';
    this.developT = 0;            // 0 = bent surface, 1 = flat development (view only)
    this.exagMode = params.exaggeration || 'auto';   // visual exaggeration (view only)
    this.zoom = 2.0;              // uniform display scale for the cylinder (a zoom, not a stretch)
    this.wraps = 4;               // how many times the wedge wraps around the cylinder
    this.speed = params.speed || 10;   // the panel echoes this on rebuilds
    this._e3 = [0, 0, 0];         // scratch for _embed — no per-frame allocation
    this.reset();
  }

  reset() {
    super.reset();
    this.wedgeAngle = Math.atan(Math.pow(10, -this.n));
    this.outerRadius = 1.0;
    this.x = 0.95 * this.outerRadius;
    this.y = 0.92 * this.x * Math.tan(this.wedgeAngle);
    this.x0 = this.x;
    this.y0 = this.y;
    this.vx = -1.0;
    this.vy = 0.0;
    this.unfoldS = 0;
    // display-only reference: how many reflections a π-knowing observer expects.
    this.unfoldN = Math.floor(Math.PI / this.wedgeAngle);
    // Trail ring buffer (allocated lazily on first push, once maxTrailLength is
    // final — card previews shrink it after construction).
    this._trailXY = null;
    this._trailCount = 0;
    this._trailHead = 0;
    // Fixed pool of pulse records: reused forever, so step() allocates nothing.
    // main.js reads {time, type} off these for collision sound.
    this.collisionEffects = [];
    for (let i = 0; i < 64; i++) this.collisionEffects.push({ x: 0, y: 0, time: -1e9, type: 'lower' });
    this._effectHead = 0;
    this.finished = false;
    this._syncEmbedParams();
  }

  getControls() {
    const controls = [
      {
        type: 'slider', id: 'n', label: 'Sector exponent n',
        min: 1, max: 4, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      // Surface is a VIEW control: it re-bends the same wedge and deliberately
      // does not reset, so the count carries straight across the change.
      {
        type: 'select', id: 'surface', label: 'Surface (view only — same stepper)', highlight: true,
        default: this.surface,
        options: [
          { value: 'plane', label: 'Flat sector — the developed wedge itself' },
          { value: 'cone', label: 'Cone — the sector rolled about its apex' },
          { value: 'cylinder', label: 'Cylinder — ring + helix around a tube' },
        ],
        onChange: (v) => {
          if (!SURFACE_LABEL[v]) return;
          this.surface = v;
          this.initSimScene();       // no reset: the counter must not blink
          this.notifyControlsChanged();
        }
      },
      // Exaggeration is a VIEW control, and the readout always prints its value.
      {
        type: 'select', id: 'exaggeration', label: 'Visual exaggeration (view only)', highlight: true,
        default: this.exagMode,
        options: [
          { value: 'auto', label: 'Auto — open the sliver to fit the frame' },
          { value: '1', label: '1× — none: the TRUE shape (try n = 1)' },
          { value: '10', label: '10× across the wedge' },
          { value: '100', label: '100× across the wedge' },
          { value: '1000', label: '1000× across the wedge' },
        ],
        onChange: (v) => { this.exagMode = v; this.initSimScene(); }
      },
    ];
    // The flat sector is already developed, so a develop morph there would be an
    // inert control. Offer it only where it actually bends something.
    if (this.surface !== 'plane') {
      controls.push({
        type: 'slider', id: 'developT', label: 'Develop — unroll to flat (view only)',
        min: 0, max: 1, step: 0.01, default: this.developT,
        onChange: (v) => { this.developT = v; if (this.ballMesh) this.updateSimScene(); }
      });
    }
    // Echo live speed: control-panel rebuilds re-apply `default`.
    controls.push({ type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 80, step: 0.1, default: this.speed ?? 10 });
    return controls;
  }

  getPhaseSpaceViews() {
    return [
      { id: 'pos-angle', label: 'Developed radius vs velocity angle', dimension: 2, primary: true }
    ];
  }

  // ── DYNAMICS ───────────────────────────────────────────────────────────────
  // Flat two-mirror wedge, exact event stepping. Surface-independent by
  // construction: nothing below reads this.surface, this.developT or the
  // exaggeration.
  step(dt) {
    if (this.finished) return false;

    let remaining = dt;
    let collided = false;
    const theta = this.wedgeAngle;
    const tanTheta = Math.tan(theta);
    const now = performance.now();

    while (remaining > 1e-12) {
      let tLower = Infinity;
      if (this.vy < -1e-12) {
        const t = -this.y / this.vy;
        if (t > -1e-10) tLower = Math.max(0, t);
      }

      let tUpper = Infinity;
      const denom = this.vy - this.vx * tanTheta;
      if (denom > 1e-12) {
        const t = (this.x * tanTheta - this.y) / denom;
        const clampedT = Math.max(0, t);
        if (t > -1e-10 && this.x + this.vx * clampedT > 0) {
          tUpper = clampedT;
        }
      }

      const tNext = Math.min(tLower, tUpper);
      if (!Number.isFinite(tNext)) {
        this.x += this.vx * remaining;
        this.y += this.vy * remaining;
        this.unfoldS += remaining;
        this._pushTrailPoint();
        this.finished = true;
        break;
      }

      if (tNext > remaining) {
        this.x += this.vx * remaining;
        this.y += this.vy * remaining;
        this.unfoldS += remaining;
        this._pushTrailPoint();
        break;
      }

      this.x += this.vx * tNext;
      this.y += this.vy * tNext;
      this.unfoldS += tNext;
      remaining -= tNext;

      if (tLower <= tUpper) {
        this.y = 0;
        this.vy = -this.vy;
        this._recordEffect(this.x, this.y, 'lower', now);
      } else {
        const nx = -Math.sin(theta);
        const ny = Math.cos(theta);
        const dot = this.vx * nx + this.vy * ny;
        this.vx -= 2 * dot * nx;
        this.vy -= 2 * dot * ny;
        this.y = this.x * tanTheta;
        this._recordEffect(this.x, this.y, 'upper', now);
      }

      this.collisionCount++;
      collided = true;
      this._pushTrailPoint();
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }

    return collided;
  }

  _pushTrailPoint() {
    const cap = this.maxTrailLength;
    if (!this._trailXY || this._trailXY.length !== cap * 2) {
      this._trailXY = new Float32Array(cap * 2);
      this._trailCount = 0;
      this._trailHead = 0;
    }
    const k = this._trailHead * 2;
    this._trailXY[k] = this.x;
    this._trailXY[k + 1] = this.y;
    this._trailHead = (this._trailHead + 1) % cap;
    this._trailCount++;
  }

  // Reuse a pooled record instead of allocating one per collision.
  _recordEffect(x, y, type, now) {
    const e = this.collisionEffects[this._effectHead];
    e.x = x; e.y = y; e.time = now; e.type = type;
    this._effectHead = (this._effectHead + 1) % this.collisionEffects.length;
  }

  getPiApproximation() {
    return this.collisionCount * this.wedgeAngle;
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const value = count * this.wedgeAngle;
    const E = this._exagFactor();
    const eTxt = E < 10 ? E.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : String(Math.round(E));
    const honest = E <= 1.0001;
    const stretch = honest
      ? '<span class="f-result">1× — no stretching: this picture IS the isometry</span>'
      : `picture stretched <span class="f-warning">×${eTxt}</span> across the wedge (view only — the count never sees it)`;
    // ONE top-level node: .formula-readout is a flex row, so everything ships in
    // a single block container.
    return `<div>
      <strong>${SURFACE_LABEL[this.surface]}</strong> — one developed wedge:
      <span class="f-angle">θ = atan(10^-${this.n})</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${count}</span> ·
      <span class="f-angle">${this.wedgeAngle.toFixed(6)}</span> =
      <span class="f-result">${value.toFixed(6)}</span>
      <br><span style="font-size:1.1em">π = ${piDigitsHTML(count / Math.pow(10, this.n), this.n + 2)}</span>
      <br><span class="f-muted">${stretch}</span>
      <br><span class="f-muted">switch <em>Surface</em> mid-flight — same stepper, same count. Drag <em>Develop</em> to unroll the bend away.</span>
    </div>`;
  }

  getPhasePoint() {
    const radius = Math.hypot(this.x, this.y);
    const velocityAngle = Math.atan2(this.vy, this.vx);
    return [radius / this.outerRadius, velocityAngle / Math.PI];
  }

  getPhaseExtractor(viewId) {
    return (pt) => pt;
  }

  // ── SURFACE EMBEDDING (display only) ───────────────────────────────────────
  // Everything from here down is picture. It reads the state; it never writes it.

  // Transverse visual exaggeration E: how far the render opens the wedge ACROSS
  // its long direction. E = 1 is a true isometry (up to a uniform zoom, which is
  // just camera distance). Anything above 1 is honest only because it is
  // labelled, clamped and printed live.
  _exagFactor() {
    const th = this.wedgeAngle;
    // A sector wider than a full turn cannot be rolled onto a cone, so the
    // polar surfaces cap at 2π/θ. (π here is display-only geometry, not the
    // estimator — the estimator is collisionCount · atan(10^-n).)
    const maxE = this.surface === 'cylinder' ? 1e7 : (2 * Math.PI * 0.999) / th;
    let E;
    if (this.exagMode === 'auto') {
      // Targets that reproduce the classic look of each surface: a half-turn
      // sector (→ a 30° cone), or an axial rise of 0.2·R on the tube.
      E = this.surface === 'cylinder' ? 0.2 / Math.tan(th) : Math.PI / th;
    } else {
      E = Number(this.exagMode);
      if (!Number.isFinite(E) || E < 1) E = 1;
    }
    return Math.max(1, Math.min(maxE, E));
  }

  // Cache the per-frame embedding constants once instead of per trail point.
  _syncEmbedParams() {
    const th = this.wedgeAngle;
    const E = this._E = this._exagFactor();
    this._Theta = Math.min(th * E, 2 * Math.PI * 0.999);        // displayed sector angle
    const sinA = this._sinA = this._Theta / (2 * Math.PI);      // cone half-angle sine
    this._cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
    this._rho = this.zoom * this.outerRadius / (this.wraps * 2 * Math.PI);   // tube radius
    this._H = this.zoom * E * this.outerRadius * Math.tan(th);  // displayed helix rise
  }

  // Effective develop parameter: the flat sector is already developed.
  _t() { return this.surface === 'plane' ? 1 : this.developT; }

  // Bend a developed wedge point (x, y) into 3D. t = 0 → the bent surface,
  // t = 1 → the flat development. Writes into `out` (a reused 3-array).
  _embed(x, y, t, out) {
    const R = this.outerRadius;
    // The ball has no outer wall: after its last reflection it flies off past
    // the rim, so park it on the rim instead of letting it leave the frame.
    let px = x < 0 ? 0 : x;
    let py = y < 0 ? 0 : y;
    const d = Math.hypot(px, py);
    if (d > R) { const k = R / d; px *= k; py *= k; }

    if (this.surface === 'cylinder') {
      // Cartesian wrap: x runs `wraps` times around the tube, y is the axial
      // rise. At E = 1 this is an isometric wrap (a uniform zoom aside).
      const phi = -(this.wraps * 2 * Math.PI) * (px / R);
      const cx = this._rho * Math.cos(phi), cz = this._rho * Math.sin(phi);
      const fx = this.zoom * (px - R / 2);
      out[0] = cx * (1 - t) + fx * t;
      out[1] = this.zoom * this._E * py - this._H / 2;
      out[2] = cz * (1 - t);
      return out;
    }

    // Polar wrap (plane & cone): radius from the apex is preserved, the wedge
    // fraction becomes the azimuth.
    const r = Math.hypot(px, py);
    const frac = this.wedgeAngle > 1e-9 ? Math.atan2(py, px) / this.wedgeAngle : 0;   // 0..1 across the wedge
    const apexY = 1.0;
    const fa = (frac - 0.5) * this._Theta;
    const fx = r * Math.sin(fa), fy = apexY - r * Math.cos(fa);
    if (this.surface === 'plane') { out[0] = fx; out[1] = fy; out[2] = 0; return out; }
    // The Θ-sector has arc r·Θ and the cone circle at slant r has circumference
    // 2πr·sinα = r·Θ, so the sector wraps exactly once: a genuine roll-up.
    const psi = (frac - 0.5) * 2 * Math.PI;
    const radial = r * this._sinA;
    out[0] = radial * Math.sin(psi) * (1 - t) + fx * t;
    out[1] = (apexY - r * this._cosA) * (1 - t) + fy * t;
    out[2] = radial * Math.cos(psi) * (1 - t);
    return out;
  }

  _lineFromXY(xy, material) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xy.length * 3), 3));
    const line = new THREE.Line(geom, material);
    line.userData.xy = xy;
    return line;
  }

  _morphLine(line, t) {
    const arr = line.geometry.attributes.position.array;
    const xy = line.userData.xy;
    const e = this._e3;
    for (let i = 0; i < xy.length; i++) {
      this._embed(xy[i][0], xy[i][1], t, e);
      arr[i * 3] = e[0]; arr[i * 3 + 1] = e[1]; arr[i * 3 + 2] = e[2];
    }
    line.geometry.attributes.position.needsUpdate = true;
  }

  initSimScene() {
    this.simScene.clear();
    this._syncEmbedParams();
    const cyl = this.surface === 'cylinder';
    this.simCamera = new THREE.PerspectiveCamera(cyl ? 38 : 42, 1, 0.1, 20);

    const R = this.outerRadius, th = this.wedgeAngle, tanT = Math.tan(th);
    this.devLines = [];
    const dim = (c, o) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o });

    // The two mirrors, y = 0 and y = x·tanθ. On the cone they stay straight
    // (generators); on the cylinder they become a `wraps`-turn ring and helix,
    // so they need dense sampling once bent.
    const MS = cyl ? 200 : 24;
    const lowXY = [], upXY = [];
    for (let i = 0; i <= MS; i++) { const s = (i / MS) * R; lowXY.push([s, 0]); upXY.push([s, s * tanT]); }
    this.devLines.push(this._lineFromXY(lowXY, new THREE.LineBasicMaterial({ color: 0xffffff })));
    this.devLines.push(this._lineFromXY(upXY, new THREE.LineBasicMaterial({ color: 0xffffff })));

    // Far edge r = R: the cone's base arc, the cylinder's end cap.
    const arcXY = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * th; arcXY.push([R * Math.cos(a), R * Math.sin(a)]); }
    this.devLines.push(this._lineFromXY(arcXY, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Interior texture so the bend is readable.
    if (cyl) {
      for (const frac of [0.34, 0.67]) {
        const lv = []; for (let i = 0; i <= 200; i++) { const s = (i / 200) * R; lv.push([s, frac * s * tanT]); }
        this.devLines.push(this._lineFromXY(lv, dim(0x2a4a6a, 0.45)));
      }
      const RIBS = 16;
      for (let j = 1; j < RIBS; j++) {
        const s = (j / RIBS) * R;
        this.devLines.push(this._lineFromXY([[s, 0], [s, s * tanT]], dim(0x2a4a6a, 0.4)));
      }
    } else {
      const RIBS = 18;
      for (let j = 1; j < RIBS; j++) {
        const a = (j / RIBS) * th, ca = Math.cos(a), sa = Math.sin(a);
        const rib = []; for (let i = 0; i <= 12; i++) { const s = (i / 12) * R; rib.push([s * ca, s * sa]); }
        this.devLines.push(this._lineFromXY(rib, dim(0x2a4a6a, 0.4)));
      }
    }

    for (const ln of this.devLines) this.simScene.add(ln);

    // Ball.
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(cyl ? 0.022 : 0.026, 18, 18), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.simScene.add(this.ballMesh);

    // Trail.
    const trailPositions = new Float32Array(this.maxTrailLength * 3);
    this.simTrailGeom = new THREE.BufferGeometry();
    this.simTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.simTrailGeom.setDrawRange(0, 0);
    this.simTrailLine = new THREE.Line(this.simTrailGeom, new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 }));
    this.simScene.add(this.simTrailLine);

    // Reflection pulses — the count made visible.
    this.effectMeshes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(cyl ? 0.014 : 0.017, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      m.visible = false;
      this.simScene.add(m);
      this.effectMeshes.push(m);
    }

    this.updateSimScene();
  }

  updateSimScene() {
    if (!this.ballMesh) return;
    this._syncEmbedParams();
    const t = this._t();
    const e = this._e3;

    for (const ln of this.devLines) this._morphLine(ln, t);

    this._embed(this.x, this.y, t, e);
    this.ballMesh.position.set(e[0], e[1], e[2]);

    // Trail (ring buffer, oldest first).
    this.simTrailLine.visible = this.showTrail;
    const positions = this.simTrailGeom.attributes.position.array;
    const cap = this.maxTrailLength;
    const xy = this._trailXY;
    const shown = xy ? Math.min(this._trailCount, cap, positions.length / 3) : 0;
    const start = this._trailCount > cap ? this._trailHead : 0;
    for (let i = 0; i < shown; i++) {
      const k = ((start + i) % cap) * 2;
      this._embed(xy[k], xy[k + 1], t, e);
      positions[i * 3] = e[0]; positions[i * 3 + 1] = e[1]; positions[i * 3 + 2] = e[2];
    }
    this.simTrailGeom.attributes.position.needsUpdate = true;
    this.simTrailGeom.setDrawRange(0, shown);

    // Pulses at the most recent reflections (fixed pool, no allocation).
    const now = performance.now();
    const EFFECT_DURATION = 280;
    let used = 0;
    for (let i = 0; i < this.collisionEffects.length && used < this.effectMeshes.length; i++) {
      const fx = this.collisionEffects[i];
      const age = now - fx.time;
      if (age < 0 || age >= EFFECT_DURATION) continue;
      const m = this.effectMeshes[used++];
      const p = age / EFFECT_DURATION;
      this._embed(fx.x, fx.y, t, e);
      m.position.set(e[0], e[1], e[2]);
      const sc = 1 + p * 2.5;
      m.scale.set(sc, sc, sc);
      m.material.opacity = (1 - p) * 0.8;
      m.material.color.setHex(fx.type === 'upper' ? 0x4cc9f0 : 0xffffff);
      m.visible = true;
    }
    for (let i = used; i < this.effectMeshes.length; i++) this.effectMeshes[i].visible = false;

    this._updateCamera(t);
  }

  _updateCamera(t) {
    const cam = this.simCamera;
    if (!cam) return;
    if (this.surface === 'cylinder') {
      // Frame the tube: its displayed rise grows with the exaggeration, so back
      // off enough to keep both the rise and the tube diameter in view.
      const d3 = Math.max(0.5, Math.min(6, (this._H + 3.2 * this._rho) / 0.55));
      cam.position.set(0.62 * d3 * (1 - t), 0.22 * d3 * (1 - t), 0.78 * d3 * (1 - t) + 3.2 * t);
      cam.lookAt(0, 0, 0);
      return;
    }
    // Plane & cone share the sector camera: swing face-on as it flattens, and
    // pull back for wider developed sectors so the whole fan stays framed.
    const dFlat = 2.0 + Math.max(0, this._Theta / Math.PI - 1) * 0.9;
    cam.position.set(1.5 * (1 - t), 0.7 * (1 - t) + 0.45 * t, 1.8 * (1 - t) + dFlat * t);
    cam.lookAt(0, 0.5 * (1 - t) + 0.45 * t, 0);
  }
}

registerSim(ConeKaleidoscope);
