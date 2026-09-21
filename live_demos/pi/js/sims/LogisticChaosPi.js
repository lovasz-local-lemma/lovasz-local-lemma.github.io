import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step(); rescale so iteration rates
// read as "per wall second" at speed 1 / 60 fps (house convention).
const TIME_SCALE = 16.7;
const TURBO_MULT = 1000;     // turbo iterations per animated iteration
const NBINS = 48;
const COBWEB_STEPS = 60;     // visible cobweb history (2 segments per step)
const CURVE_PTS = 120;

// Panel layout inside the ortho frame [-1.15,1.15]x[-0.95,0.95].
const PAN_Y0 = -0.74, PAN_Y1 = 0.74;
const LX0 = -1.10, LX1 = -0.10;   // left: cobweb
const RX0 = 0.10, RX1 = 1.10;     // right: arcsine histogram
const BAR_MAX_H = (PAN_Y1 - PAN_Y0) * 0.94;

// CDF of the arcsine (invariant) density rho(x) = 1/(pi*sqrt(x(1-x))).
function arcsineCDF(u) { return 2 / Math.PI * Math.asin(Math.sqrt(u)); }

export class LogisticChaosPi extends Simulation {
  static id = 'logistic-chaos-pi';
  static title = 'Logistic Chaos — π from the arcsine law';
  static description = 'Iterate the chaotic map x→4x(1−x); the orbit\'s time average of √(x(1−x)) is exactly 1/π';
  static piMechanism = 'chaos: invariant density 1/(π√(x(1−x))) → π = N/Σ√(xₖ(1−xₖ))';
  static rigor = 'Exact Asymptotic';
  static sortOrder = 57;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 900;
  static alternatives = [{ id: 'mandelbrot-pi', label: 'The complex-plane cousin' }];
  static explanation = {
    setup: 'The logistic map x → 4x(1−x) at r = 4 is the most famous chaotic system there is: a single quadratic fold that stretches the unit interval, doubles it back on itself, and shreds any memory of where the orbit started. One number, iterated forever.',
    insight: 'Chaos forgets initial conditions but remembers its invariant measure. At r = 4 that measure is known exactly — the arcsine density ρ(x) = 1/(π√(x(1−x))) — and its normalizing constant IS π. Ergodicity turns the space average into a time average: one orbit\'s running mean of √(x(1−x)) converges to ∫√(x(1−x))·ρ dx = 1/π, so π falls out of pure iteration.',
    contrast: 'The double pendulum is just as chaotic, but nobody knows its invariant measure in closed form, so its chaos has no clean π readout. The logistic map\'s does — it is smoothly conjugate to the doubling map via x = sin²(πθ/2), which is exactly where the arcsine law comes from. The circle is hiding inside the conjugacy.',
    formula: 'π = lim N / Σₖ √(xₖ(1−xₖ))  [TIME AVERAGE OF ONE CHAOTIC ORBIT]',
    getExpected: () => 'Monte-Carlo-style 1/√N convergence: the observable √(x(1−x)) has mean 1/π and sd ≈ 0.155, giving a typical relative error ≈ 0.48/√N. Expect π ± 0.015 after 10⁴ iterations and π ± 0.0015 after 10⁶ — turbo gets there in about a minute.'
  };

  constructor(params = {}) {
    super(params);
    this.iterRate = params.iterRate || 20;
    this.turbo = true;
    this.reset();
  }

  reset() {
    super.reset();
    this.x = 0.61803398875;   // any seed works — chaos forgets it immediately
    this.totalIters = 0;
    this.sumF = 0;
    this.reseeds = 0;
    this.bins = new Array(NBINS).fill(0);
    this.iterCarry = 0;
    this.turboCarry = 0;
    this.nextMilestone = 1;
    this.cobwebPairs = [];    // recent (x, 4x(1-x)) pairs for the cobweb trail
    this.cobwebDirty = true;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'iterRate', label: 'Iterations/s',
        min: 1, max: 200, step: 1, default: this.iterRate, highlight: true,
        onChange: (val) => { this.iterRate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log iterations vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 N', y: '(π̂−π)/π' }
      }
    ];
  }

  // One iterate of the shared orbit. Turbo calls this too (animate=false):
  // it is the SAME ergodic trajectory, just advanced without drawing.
  _iterate(animate) {
    const x0 = this.x;
    let x1 = 4 * x0 * (1 - x0);
    // Double precision can collapse the r=4 orbit onto x=0 (e.g. 0.5 -> 1 -> 0).
    // Reseed honestly and count it; expected rarely (~1 per 1e6 iterates).
    if (x1 <= 1e-12 || x1 >= 1 - 1e-12) {
      x1 = 0.1 + 0.8 * Math.random();
      this.reseeds++;
    }
    this.x = x1;
    this.sumF += Math.sqrt(x1 * (1 - x1));
    this.totalIters++;
    this.bins[Math.min(NBINS - 1, Math.floor(x1 * NBINS))]++;
    if (animate) {
      this.cobwebPairs.push([x0, x1]);
      if (this.cobwebPairs.length > COBWEB_STEPS) this.cobwebPairs.shift();
      this.cobwebDirty = true;
    }
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let ticked = false;

    this.iterCarry += this.iterRate * t;
    let n = Math.floor(this.iterCarry);
    this.iterCarry -= n;
    for (; n > 0; n--) { this._iterate(true); ticked = true; }

    if (this.turbo) {
      this.turboCarry += this.iterRate * TURBO_MULT * t;
      const m = Math.floor(this.turboCarry);
      this.turboCarry -= m;
      if (m > 0) ticked = true;
      for (let i = 0; i < m; i++) this._iterate(false);
    }

    this.collisionCount = this.totalIters;
    if (this.totalIters >= this.nextMilestone) {
      // One convergence point per ~2% growth keeps the phase trail readable.
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.totalIters + 1, Math.ceil(this.totalIters * 1.02));
    }
    return ticked;
  }

  getCountLabel() { return 'Iterations'; }

  getPiApproximation() {
    return this.totalIters > 10 ? this.totalIters / this.sumF : 0;
  }

  getPiReadout() {
    return this.totalIters > 10 ? this.getPiApproximation().toFixed(6) : 'collecting…';
  }

  getFormulaHTML() {
    const N = this.totalIters;
    const meanF = N > 0 ? this.sumF / N : 0;
    const live = N > 10 ? piDigitsHTML(this.getPiApproximation(), 4) : 'collecting…';
    const reseedNote = this.reseeds > 0
      ? `<br><span class="f-muted" style="font-size:0.85em">reseeds: ${this.reseeds} (orbit hit the x=0 trap in double precision; reseeded uniformly)</span>`
      : '';
    return `
      <strong>ergodic time average</strong>:
      <span class="f-angle">⟨√(x(1−x))⟩ → ∫√(x(1−x))·ρ(x)dx = 1/π</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">N</span> / Σ√(xₖ(1−xₖ)),
      &nbsp;N = <span class="f-count">${N}</span>,
      &nbsp;⟨f⟩ = <span class="f-angle">${meanF.toFixed(6)}</span>
      <br><span style="font-size:1.1em">π = ${live}</span>${reseedNote}
    `;
  }

  getPhasePoint() {
    const est = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.totalIters, 1)) / 6 * 2 - 1));
    const y = Math.min(1, Math.max(-1, (est - Math.PI) / Math.PI * 4));
    return [x, y];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -1.15, x1: 1.15, y0: -0.95, y1: 0.95 };
  }

  // Panel-coordinate helpers: unit square -> screen.
  _lx(u) { return LX0 + u * (LX1 - LX0); }
  _rx(u) { return RX0 + u * (RX1 - RX0); }
  _py(v) { return PAN_Y0 + v * (PAN_Y1 - PAN_Y0); }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    for (const [a, b] of [[LX0, LX1], [RX0, RX1]]) {
      this.simScene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a, PAN_Y0, 0), new THREE.Vector3(b, PAN_Y0, 0),
        new THREE.Vector3(b, PAN_Y1, 0), new THREE.Vector3(a, PAN_Y1, 0),
      ]), frameMat));
    }

    // LEFT: static parabola y = 4x(1-x) and diagonal y = x.
    const paraPts = [];
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      paraPts.push(new THREE.Vector3(this._lx(u), this._py(4 * u * (1 - u)), 0));
    }
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(paraPts),
      new THREE.LineBasicMaterial({ color: 0x8d93c8, transparent: true, opacity: 0.9 })
    ));
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(this._lx(0), this._py(0), 0),
        new THREE.Vector3(this._lx(1), this._py(1), 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    ));

    // Cobweb trail: each step is a self-contained L (diagonal -> parabola ->
    // diagonal), so LineSegments stays correct even when turbo advances the
    // orbit between drawn steps.
    this.cobwebGeom = new THREE.BufferGeometry();
    this.cobwebGeom.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(COBWEB_STEPS * 4 * 3), 3));
    this.cobwebGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.LineSegments(this.cobwebGeom,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.75 })));

    // Bright dot marking the current x on the panel's x-axis.
    this.dotMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.dotMesh.position.set(this._lx(this.x), PAN_Y0, 0.03);
    this.simScene.add(this.dotMesh);

    // RIGHT: pooled histogram bars + ideal arcsine overlay curve.
    const barW = (RX1 - RX0) / NBINS;
    const barGeom = new THREE.PlaneGeometry(1, 1);
    const cyanMat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85 });
    this.barMeshes = [];
    for (let k = 0; k < NBINS; k++) {
      const m = new THREE.Mesh(barGeom, cyanMat);
      m.position.set(RX0 + (k + 0.5) * barW, PAN_Y0, 0);
      m.scale.set(barW * 0.84, 1e-4, 1);
      this.simScene.add(m);
      this.barMeshes.push(m);
    }

    const curvePos = new Float32Array(CURVE_PTS * 3);
    for (let i = 0; i < CURVE_PTS; i++) {
      curvePos[i * 3] = this._rx((i + 0.5) / CURVE_PTS);
      curvePos[i * 3 + 1] = PAN_Y0;
      curvePos[i * 3 + 2] = 0.01;
    }
    this.curveGeom = new THREE.BufferGeometry();
    this.curveGeom.setAttribute('position', new THREE.BufferAttribute(curvePos, 3));
    this.simScene.add(new THREE.Line(this.curveGeom,
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.7 })));

    this.cobwebDirty = true;
  }

  updateSimScene() {
    if (!this.barMeshes) return;

    if (this.cobwebDirty) {
      const pos = this.cobwebGeom.attributes.position.array;
      let v = 0;
      for (const [x0, x1] of this.cobwebPairs) {
        const sx = this._lx(x0), sy = this._py(x0), ty = this._py(x1), tx = this._lx(x1);
        pos[v++] = sx; pos[v++] = sy; pos[v++] = 0.02;   // vertical: diagonal -> parabola
        pos[v++] = sx; pos[v++] = ty; pos[v++] = 0.02;
        pos[v++] = sx; pos[v++] = ty; pos[v++] = 0.02;   // horizontal: parabola -> diagonal
        pos[v++] = tx; pos[v++] = ty; pos[v++] = 0.02;
      }
      this.cobwebGeom.setDrawRange(0, v / 3);
      this.cobwebGeom.attributes.position.needsUpdate = true;
      this.cobwebDirty = false;
    }
    this.dotMesh.position.x = this._lx(this.x);

    let maxBin = 1;
    for (const b of this.bins) if (b > maxBin) maxBin = b;
    for (let k = 0; k < NBINS; k++) {
      const h = Math.max(this.bins[k] / maxBin * BAR_MAX_H, 1e-4);
      const m = this.barMeshes[k];
      m.scale.y = h;
      m.position.y = PAN_Y0 + h / 2;
    }

    // Ideal arcsine overlay scaled to the live total; the density's endpoint
    // spikes are clamped to the panel top.
    const cur = this.curveGeom.attributes.position.array;
    const binW = 1 / NBINS;
    for (let i = 0; i < CURVE_PTS; i++) {
      const u = (i + 0.5) / CURVE_PTS;
      const rho = 1 / (Math.PI * Math.sqrt(u * (1 - u)));
      const h = this.totalIters > 0
        ? Math.min(this.totalIters * rho * binW / maxBin * BAR_MAX_H, PAN_Y1 - PAN_Y0)
        : 0;
      cur[i * 3 + 1] = PAN_Y0 + h;
    }
    this.curveGeom.attributes.position.needsUpdate = true;
  }
}

registerSim(LogisticChaosPi);
