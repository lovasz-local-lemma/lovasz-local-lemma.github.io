import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so this rescales raw sim time to ~1 board-second per wall second at speed 1.
const TIME_SCALE = 16.7;

// Scene layout (ortho, unit circle centred).
const CX = 0, CY = 0.18, R = 0.95;   // circle centre + radius
const DRAW_CAP = 96;                 // max polygon sides actually drawn (a 96-gon
                                     // already hugs the circle to sub-pixel)
// Number line beneath the circle: a fixed π-window the bracket clamps onto.
const AX_Y = -1.4, AX_X0 = -1.15, AX_X1 = 1.15;
const WIN_LO = 2.95, WIN_HI = 3.50;  // contains the widest bracket [3.00, 3.464]
const winX = (v) => AX_X0 + (Math.min(WIN_HI, Math.max(WIN_LO, v)) - WIN_LO) / (WIN_HI - WIN_LO) * (AX_X1 - AX_X0);

export class ArchimedesPolygons extends Simulation {
  static id = 'archimedes-doubling';
  static title = 'Archimedes — the original algorithm';
  static description = 'Inscribed & circumscribed polygons squeeze π by doubling — square roots only, no trig';
  static piMechanism = 'geometric bisection: perimeters of 2ⁿ-gons bracket π (sqrt-only recurrence)';
  static rigor = 'Exact';
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static sortOrder = 8;
  static previewSteps = 6;
  static alternatives = [
    { id: 'two-blocks', label: 'π by counting instead' },
    { id: 'leibniz-walk', label: 'π by summing instead' },
  ];
  static explanation = {
    setup: 'Around 250 BC Archimedes trapped π between the perimeters of two regular polygons: one inscribed inside a circle, one circumscribed around it. Start with hexagons (6 sides) and repeatedly double: 6 → 12 → 24 → 48 → 96. The circle is caught in the ever-thinner gap between the two polygons.',
    insight: 'No trigonometry and no value of π go in — only square roots. A pure geometric fact seeds it: a regular hexagon inscribed in a unit circle has side equal to the radius, so a₆ = 1. Halving each arc gives the inscribed side of the next polygon by aₙ→a₂ₙ = √(2 − √(4 − aₙ²)), and the circumscribed semi-perimeter follows as Uₙ = 2Lₙ/√(4 − aₙ²). The inscribed semi-perimeter Lₙ = (n/2)aₙ rises toward π from below; Uₙ falls toward it from above.',
    contrast: 'This is π\'s oldest algorithm and a fourth exact flavour — not counting collisions, not summing a series, not sampling at random, but geometric bisection. Each doubling roughly quadruples the accuracy (≈ doubling the correct digits). Archimedes stopped at 96 sides and proved 3¹⁰⁄₇₁ < π < 3¹⁄₇, i.e. 3.14. A dozen more doublings by hand were out of reach; here they take a second. One numerical caution: the naïve √(2 − √(4 − aₙ²)) loses precision through catastrophic cancellation once aₙ is tiny, so the engine uses the algebraically equal a₂ₙ² = aₙ²/(2 + √(4 − aₙ²)), which stays accurate past a billion sides.',
    formula: 'a₆ = 1,  a₂ₙ² = aₙ²/(2 + √(4 − aₙ²)),  Lₙ = (n/2)aₙ < π < Uₙ = 2Lₙ/√(4 − aₙ²)  [EXACT]',
    getExpected: () => 'Bracket [Lₙ, Uₙ] by side count: 6 → [3.0000, 3.4641], 12 → [3.1058, 3.2154], 24 → [3.1326, 3.1597], 48 → [3.1394, 3.1461], 96 → [3.14103, 3.14271] (Archimedes\' own stop, giving 3.14). Each doubling shrinks the gap ~4×: by ~24 doublings (≈10⁸ sides) both bounds agree with π to full double precision. The stabilised recurrence keeps improving where the naïve one collapses to 0 near a billion sides.'
  };

  constructor(params = {}) {
    super(params);
    this.doublingRate = params.doublingRate || 1.2;   // doublings per board-second
    this.maxDoublings = params.maxDoublings || 24;     // cap (stay within double precision)
    this.reset();
  }

  reset() {
    super.reset();
    this.doublings = 0;
    this.sides = 6;
    this.a2 = 1;              // aₙ², seeded by the hexagon fact a₆ = 1
    this.carry = 0;
    this._drawn = -1;         // last doublings count whose polygon geometry is built
    this.collisionCount = this.sides;
    this.finished = false;
    this._recordPhase();
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'doublingRate', label: 'Doublings / second',
        min: 0.2, max: 6, step: 0.1, default: this.doublingRate, highlight: true,
        onChange: (val) => { this.doublingRate = val; }
      },
      {
        type: 'slider', id: 'maxDoublings', label: 'Max doublings (sides cap)',
        min: 1, max: 27, step: 1, default: this.maxDoublings,
        onChange: (val) => { this.maxDoublings = val; }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log₂(sides) vs relative error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log₂(sides)', y: '(Lₙ − π)/π  (scaled)' }
      }
    ];
  }

  // --- the algorithm: sqrt-only, π is NEVER an input --------------------------
  _lower() { return this.sides / 2 * Math.sqrt(this.a2); }              // Lₙ (from below)
  _upper() { return 2 * this._lower() / Math.sqrt(4 - this.a2); }       // Uₙ (from above)

  _double() {
    // Stabilised half-angle recurrence a₂ₙ² = aₙ²/(2 + √(4 − aₙ²)); algebraically
    // equal to a₂ₙ = √(2 − √(4 − aₙ²)) but free of catastrophic cancellation.
    this.a2 = this.a2 / (2 + Math.sqrt(4 - this.a2));
    this.sides *= 2;
    this.doublings++;
    this.collisionCount = this.sides;
    this._recordPhase();
  }

  _recordPhase() {
    this.pendingPhasePoints.push([...this.getPhasePoint()]);
  }

  step(dt) {
    if (this.doublings >= this.maxDoublings) { this.finished = true; return false; }
    const t = dt * TIME_SCALE;
    this.carry += this.doublingRate * t;
    let m = Math.floor(this.carry);
    this.carry -= m;
    let event = false;
    for (; m > 0 && this.doublings < this.maxDoublings; m--) {
      this._double();
      event = true;
    }
    return event;
  }

  getCountLabel() { return 'Sides'; }

  getPiApproximation() {
    return (this._lower() + this._upper()) / 2;   // midpoint of the bracket
  }

  getPiReadout() {
    return this.getPiApproximation().toFixed(8);
  }

  getFormulaHTML() {
    const L = this._lower(), U = this._upper(), mid = (L + U) / 2;
    const width = U - L;
    const capNote = this.sides > DRAW_CAP
      ? '<br><span class="f-muted">polygons now within a pixel of the circle — refinement continues numerically</span>'
      : '';
    return `
      <span class="f-angle">a₆ = 1</span>,&nbsp;
      <span class="f-angle">a₂ₙ² = aₙ²/(2 + √(4 − aₙ²))</span><br>
      <span class="f-count">${this.sides.toLocaleString()}</span> sides &nbsp;
      (<span class="f-count">${this.doublings}</span> doublings)<br>
      <span class="f-result">Lₙ</span> = ${piDigitsHTML(L, 8)} &lt; <span class="f-result">π</span> &lt;
      ${piDigitsHTML(U, 8)} = <span class="f-result">Uₙ</span><br>
      best (midpoint): <span style="font-size:1.1em">${piDigitsHTML(mid, 8)}</span>
      &nbsp;<span class="f-muted">gap = ${width.toExponential(2)}</span>${capNote}
      <br><span class="f-muted">Archimedes stopped at 96 sides → 3.14; no trig, only square roots.</span>
    `;
  }

  getPhasePoint() {
    // log₂(sides) across the run vs the (scaled) lower-bound relative error, which
    // climbs geometrically toward 0 — each doubling shrinks it ~4×.
    const x = Math.min(1, Math.max(-1, Math.log2(this.sides) / 27 * 2 - 1));
    const relErr = (this._lower() - Math.PI) / Math.PI;   // negative, → 0
    const y = Math.min(1, Math.max(-1, relErr * 22 + 1));
    return [x, y];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -1.28, x1: 1.28, y0: -0.95, y1: 1.32 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.32, 1.32, 1.4, -1.75, 0.1, 10);
    this.simCamera.position.z = 1;

    // The circle (cyan).
    const circPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * Math.PI * 2;
      circPts.push(new THREE.Vector3(CX + R * Math.cos(a), CY + R * Math.sin(a), 0));
    }
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(circPts),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.9 })));
    this.simScene.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(CX, CY, 0)]),
      new THREE.PointsMaterial({ color: 0x4cc9f0, size: 4, sizeAttenuation: false })));

    // Inscribed (gold) + circumscribed (orange) polygons, pre-allocated LineLoops.
    const mkLoop = (color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((DRAW_CAP + 1) * 3), 3));
      const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color }));
      this.simScene.add(line);
      return line;
    };
    this.inLoop = mkLoop(0xf7c948);
    this.outLoop = mkLoop(0xff9e3d);

    const mkDots = (color, size) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((DRAW_CAP + 1) * 3), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false }));
      this.simScene.add(p);
      return p;
    };
    this.inDots = mkDots(0xf7c948, 4.5);
    this.outDots = mkDots(0xff9e3d, 4);

    // Number line: axis, π marker, and the shrinking [Lₙ, Uₙ] bracket bar.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(AX_X0, AX_Y, 0), new THREE.Vector3(AX_X1, AX_Y, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));
    // π reference tick (cyan).
    const px = winX(Math.PI);
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(px, AX_Y - 0.11, 0.02), new THREE.Vector3(px, AX_Y + 0.11, 0.02)]),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0 })));
    // Faint minor ticks at 3.0, 3.1, 3.2, 3.3, 3.4.
    const ticks = [];
    for (const v of [3.0, 3.1, 3.2, 3.3, 3.4]) {
      const x = winX(v);
      ticks.push(new THREE.Vector3(x, AX_Y - 0.05, 0.01), new THREE.Vector3(x, AX_Y + 0.05, 0.01));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(ticks),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })));

    // Bracket bar (a plane whose x-extent = the current interval, clamping onto π).
    this.bracketBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.5 }));
    this.bracketBar.position.z = 0.005;
    this.simScene.add(this.bracketBar);
    // Bracket end markers (gold = lower, orange = upper).
    this.loMark = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, AX_Y - 0.09, 0.03), new THREE.Vector3(0, AX_Y + 0.09, 0.03)]),
      new THREE.LineBasicMaterial({ color: 0xf7c948 }));
    this.hiMark = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, AX_Y - 0.09, 0.03), new THREE.Vector3(0, AX_Y + 0.09, 0.03)]),
      new THREE.LineBasicMaterial({ color: 0xff9e3d }));
    this.simScene.add(this.loMark);
    this.simScene.add(this.hiMark);

    this._drawn = -1;
    this.updateSimScene();
  }

  _rebuildPolygons() {
    const dn = Math.min(this.sides, DRAW_CAP);
    const rc = 1 / Math.cos(Math.PI / dn);   // circumscribed radius factor (drawing only)
    const inPos = this.inLoop.geometry.attributes.position.array;
    const outPos = this.outLoop.geometry.attributes.position.array;
    const inDot = this.inDots.geometry.attributes.position.array;
    const outDot = this.outDots.geometry.attributes.position.array;
    for (let j = 0; j < dn; j++) {
      const a = -Math.PI / 2 + j * 2 * Math.PI / dn;      // inscribed vertex angle
      const ix = CX + R * Math.cos(a), iy = CY + R * Math.sin(a);
      const b = a + Math.PI / dn;                          // circumscribed vertex angle
      const ox = CX + R * rc * Math.cos(b), oy = CY + R * rc * Math.sin(b);
      inPos[j * 3] = ix; inPos[j * 3 + 1] = iy; inPos[j * 3 + 2] = 0.01;
      outPos[j * 3] = ox; outPos[j * 3 + 1] = oy; outPos[j * 3 + 2] = 0.01;
      inDot[j * 3] = ix; inDot[j * 3 + 1] = iy; inDot[j * 3 + 2] = 0.02;
      outDot[j * 3] = ox; outDot[j * 3 + 1] = oy; outDot[j * 3 + 2] = 0.02;
    }
    for (const l of [this.inLoop, this.outLoop]) {
      l.geometry.setDrawRange(0, dn);
      l.geometry.attributes.position.needsUpdate = true;
    }
    for (const p of [this.inDots, this.outDots]) {
      p.geometry.setDrawRange(0, dn);
      p.geometry.attributes.position.needsUpdate = true;
    }
    this._drawn = this.doublings;
  }

  updateSimScene() {
    if (!this.inLoop) return;
    if (this._drawn !== this.doublings) this._rebuildPolygons();

    // Bracket bar spans [Lₙ, Uₙ] mapped onto the number line; collapses onto π.
    const xl = winX(this._lower()), xu = winX(this._upper());
    const w = Math.max(xu - xl, 1e-4);
    this.bracketBar.scale.set(w, 0.12, 1);
    this.bracketBar.position.set((xl + xu) / 2, AX_Y, 0.005);
    this.loMark.position.x = xl;
    this.hiMark.position.x = xu;
  }
}

registerSim(ArchimedesPolygons);
