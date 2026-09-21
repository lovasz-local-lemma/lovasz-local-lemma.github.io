import * as THREE from 'three';
import { BiasedPiCounter } from '../core/BiasedPiCounter.js';
import { registerSim } from '../core/registry.js';
import { circle, ellipse, regularPolygon, reuleaux, perimeter, widthStats } from '../core/rolling-shapes.js';

const TAU = Math.PI * 2;

const SHAPES = {
  circle:   { label: 'Circle',         constantWidth: true },
  reuleaux: { label: 'Reuleaux △', constantWidth: true },
  ellipse:  { label: 'Ellipse',        constantWidth: false },
  polygon:  { label: 'Regular polygon', constantWidth: false },
};

export class RollingShapeOdometer extends BiasedPiCounter {
  static id = 'rolling-shape-odometer';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Rolling Shape Odometer';
  static description = 'Roll a shape one turn; perimeter ÷ width ≈ π — biased unless constant-width';
  static piMechanism = 'biased: distance per turn = perimeter; ÷ width gives π, biased for non-round shapes';
  static rigor = 'Biased';
  static piNature = 'biased';
  static sortOrder = 40;
  static explanation = {
    setup: 'A convex shape rolls without slipping. One full turn advances by its perimeter ' +
           '(read off the rail). Divide that distance by the shape’s width to estimate π.',
    insight: 'Width depends on orientation for non-round shapes, so the π reading is biased and ' +
             'wobbles as it rolls — watch the board on top bounce. Constant-width shapes (circle, ' +
             'Reuleaux) have ONE width, so the board stays level and π is exact (Barbier). ' +
             'Averaging the width over a turn gives exact π for ANY shape (Cauchy).',
    formula: 'π_measured = perimeter / width(θ)  (π-free); Δ = π_measured − π',
    getExpected: (params) => {
      const k = params.shape || 'circle';
      return SHAPES[k]?.constantWidth
        ? 'Constant-width: the board stays level, π is exact, the band collapses.'
        : 'Non-round: the board bounces, π is biased, the band opens up. Cauchy mode (mean width) → π.';
    },
  };

  constructor(params = {}) {
    super(params);
    this.shapeKey = params.shape || 'circle';
    this.ellipseRatio = params.ratio ?? 0.6;
    this.polygonN = params.sides ?? 5;
    this.tickPower = params.tickPower ?? 2;
    this.cauchy = !!params.cauchy;
    this.angularRate = 50;
    this.reset();
  }

  buildPoints() {
    if (this.shapeKey === 'circle') return circle(1);
    if (this.shapeKey === 'reuleaux') return reuleaux(1);
    if (this.shapeKey === 'ellipse') return ellipse(0.5, 0.5 * this.ellipseRatio);
    return regularPolygon(Math.round(this.polygonN), 0.5);
  }

  reset() {
    super.reset();
    this.points = this.buildPoints();
    this.perimeter = perimeter(this.points);
    this.widthStats = widthStats(this.points);
    this.theta = 0;
    this.distance = 0;
    this.turns = 0;
    this.collisionCount = 0;
    const pose = this._poseFromTheta(0);
    this.contactMinY = pose.minY;
    this.curWidth = pose.width;
    this.finished = false;
  }

  // vertical extent of the body rotated by theta (matches the render rotation.z = theta)
  _poseFromTheta(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    let minY = Infinity, maxY = -Infinity;
    for (const p of this.points) { const y = p[0] * s + p[1] * c; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return { minY, width: maxY - minY };
  }

  idealKnobValue() { return 'constant-width shape'; }
  biasSource() { return 'width changes with orientation (zero for constant-width)'; }

  getControls() {
    const controls = [
      { type: 'select', id: 'shape', label: 'Shape', default: this.shapeKey,
        options: Object.entries(SHAPES).map(([value, s]) => ({ value, label: s.label })),
        onChange: (v) => { this.shapeKey = v; this.reset(); this.initSimScene(); this.notifyControlsChanged(); } },
    ];
    if (this.shapeKey === 'ellipse') controls.push(
      { type: 'slider', id: 'ratio', label: 'Ellipse b/a', min: 0.3, max: 1, step: 0.05, default: this.ellipseRatio,
        onChange: (v) => { this.ellipseRatio = v; this.reset(); this.initSimScene(); } });
    if (this.shapeKey === 'polygon') controls.push(
      { type: 'slider', id: 'sides', label: 'Polygon sides', min: 3, max: 16, step: 1, default: this.polygonN,
        onChange: (v) => { this.polygonN = v; this.reset(); this.initSimScene(); } });
    controls.push(
      { type: 'toggle', id: 'cauchy', label: 'Cauchy (mean width)', default: this.cauchy,
        onChange: (v) => { this.cauchy = v; } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 40, step: 0.1, default: 1 });
    return controls;
  }

  getPhaseSpaceViews() {
    return [{ id: 'pi-band', label: 'π reading vs turn phase', dimension: 2, primary: true, boundary: 'none',
      axisLabels: { x: 'turn phase', y: 'π reading − π' }}];
  }

  step(dt) {
    const dtheta = this.angularRate * dt;
    this.theta += dtheta;
    const pose = this._poseFromTheta(this.theta);
    this.distance += (-pose.minY) * dtheta;          // h*dtheta, h = centroid height above contact
    this.contactMinY = pose.minY;
    this.curWidth = pose.width;
    this.turns = Math.floor(this.theta / TAU);
    this.collisionCount = this.turns;
    return true;
  }

  getCountLabel() { return 'Turns'; }
  getCollisionCount() { return this.turns; }

  measuredPi() {
    if (this.cauchy) return this.perimeter / this.widthStats.mean;     // = pi (Cauchy)
    return this.curWidth > 1e-9 ? this.perimeter / this.curWidth : NaN; // live, biased, wobbles
  }

  getBand() {
    const w = this.widthStats;
    if (!w || w.max - w.min < 1e-4) return null;       // constant-width -> collapsed -> hide band
    return { lo: this.perimeter / w.max, mid: this.perimeter / w.mean, hi: this.perimeter / w.min };
  }

  getFormulaHTML() {
    const m = this.measuredPi();
    const wr = (this.curWidth || 0).toFixed(3);
    const mode = this.cauchy ? 'mean width (Cauchy)' : `width(θ)=${wr}`;
    return `<strong>${SHAPES[this.shapeKey]?.label || this.shapeKey}</strong>: ` +
      `<span class="f-muted">perimeter=${this.perimeter.toFixed(3)}</span>; ` +
      `<span class="f-angle">${mode}</span>; ` +
      `<span class="f-result">π≈${Number.isFinite(m) ? m.toFixed(4) : 'n/a'}</span>`;
  }

  getPhasePoint() {
    const m = this.measuredPi();
    const phase = ((this.theta / TAU) % 1 + 1) % 1;
    const y = Math.max(-1, Math.min(1, (m - Math.PI) / 1.5));
    return [phase * 2 - 1, y];
  }

  // --- rendering ---
  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.2, 4.0, 1.7, -0.35, 0.1, 10);
    this.simCamera.position.z = 1;

    // road
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(4.0, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));

    // tick rail (minor) + major ticks one width apart
    const nominal = this.widthStats.mean;
    const tickScale = 10 ** Math.round(this.tickPower);
    let spacing = nominal / tickScale;
    const minSpacing = 4.2 / 160;
    if (spacing < minSpacing) spacing = minSpacing;
    const minor = [];
    for (let x = 0; x <= 4.0; x += spacing) minor.push(new THREE.Vector3(x, -0.02, 0), new THREE.Vector3(x, 0.02, 0));
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(minor),
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.32 })));
    const major = [];
    for (let x = 0; x <= 4.0; x += nominal) major.push(new THREE.Vector3(x, -0.05, 0), new THREE.Vector3(x, 0.05, 0));
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(major),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.7 })));

    // body group: fill + outline + marker dot
    this.bodyGroup = new THREE.Group();
    const v2 = this.points.map(p => new THREE.Vector2(p[0], p[1]));
    this.bodyGroup.add(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(v2)),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.13, side: THREE.DoubleSide })));
    const outline = this.points.map(p => new THREE.Vector3(p[0], p[1], 0.01));
    outline.push(outline[0].clone());
    this.bodyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline),
      new THREE.LineBasicMaterial({ color: 0xf7c948 })));
    const marker = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }));
    marker.position.set(this.points[0][0], this.points[0][1], 0.02);
    this.bodyGroup.add(marker);
    this.simScene.add(this.bodyGroup);

    // flat board resting on top (level for constant-width, bouncing otherwise)
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    this.simScene.add(this.board);

    this._placeBody();
  }

  _placeBody() {
    if (!this.bodyGroup) return;
    const displayX = 0.6 + (this.distance % 3.0);
    this.bodyGroup.position.set(displayX, -this.contactMinY, 0);
    this.bodyGroup.rotation.z = this.theta;
    if (this.board) this.board.position.set(2.0, this.curWidth + 0.026, -0.02);
  }

  updateSimScene() { this._placeBody(); }
}

registerSim(RollingShapeOdometer);
