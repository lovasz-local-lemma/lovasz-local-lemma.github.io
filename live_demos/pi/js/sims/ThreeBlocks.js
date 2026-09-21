// js/sims/ThreeBlocks.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { ThreeBlockAreaCounter } from './three-blocks-area.js';

// ─────────────────────────────────────────────────────────────────────────────
// The reflection geometry of three free blocks (derived, not asserted).
//
// Rescaled momentum:  q_i = √m_i · v_i.  Kinetic energy is ½Σm_i v_i² = ½|q|²,
// so every collision keeps |q| fixed: the state lives on a sphere.
//
// Wall bounce (v_0 → −v_0) is q_0 → −q_0, i.e. reflection in the plane with
// normal e₁ = (1,0,0).
//
// Elastic pair (i, i+1), the formula the scheduler below actually uses:
//     v_i'   = ((m_i − m_j)·v_i + 2 m_j·v_j) / (m_i + m_j)
//     v_j'   = ((m_j − m_i)·v_j + 2 m_i·v_i) / (m_i + m_j)      (j = i+1)
// In q coordinates that is
//     q_i'   = ((m_i − m_j)·q_i + 2√(m_i m_j)·q_j) / (m_i + m_j)
//     q_j'   = ((m_j − m_i)·q_j + 2√(m_i m_j)·q_i) / (m_i + m_j)
// which is exactly q ↦ q − 2(q·n)n/|n|² with
//     n = (1/√m_i, −1/√m_j)  in those two coordinates.
// (Check: q·n = v_i − v_j, the closing speed — the collision plane is where the
// relative velocity vanishes, so the mirror is the collision condition itself.)
// The harness for this file verifies both claims against the running scheduler
// to machine precision, and against random masses/velocities.
//
// The same three planes bound the CONFIGURATION chamber. Shift out the block
// widths, u_0 = x_0, u_1 = x_1 − s_0, u_2 = x_2 − s_0 − s_1, so the contact
// conditions become u_0 ≥ 0, u_1 ≥ u_0, u_2 ≥ u_1; rescale y_i = √m_i·u_i and
// those are three half-spaces through the origin with inward normals
//     (1,0,0),  (−1/√m_0, 1/√m_1, 0),  (0, −1/√m_1, 1/√m_2).
// Between collisions ẏ = q is constant, so y runs in a straight line inside a
// solid cone and reflects off its faces. Project radially: the direction ŷ is a
// billiard ball inside a SPHERICAL TRIANGLE whose sides are the mirror great
// circles. That triangle is what the "chamber" panel draws, live, for the
// masses currently on screen.
// ─────────────────────────────────────────────────────────────────────────────

const MIRROR_COLORS = [0xffffff, 0x4cc9f0, 0xf7c948];   // wall, A|B, B|C
const MIRROR_NAMES = ['wall', 'A|B', 'B|C'];

// Chamber-panel layout, in sim-scene units.
const SPHERE_CX = 0.28, SPHERE_CY = 0.62, SPHERE_R = 0.21;
const PANEL_CX = 0.83, PANEL_CY = 0.62, PANEL_HW = 0.235, PANEL_HH = 0.19;
const PANEL_FILL = 0.92;              // fraction of the panel the triangle fills

const TRAIL_CAP = 1500;               // ring buffer of chamber-billiard points
const TRAIL_PTS_PER_FRAME = 12;       // cap: high mass ratios fire 100s of hits/frame
const FLASH_MS = 260;

// Small allocation-free vector helpers (out arrays are caller-owned).
function v3cross(a, b, out) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function v3unit(v, out) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  out[0] = v[0] / n; out[1] = v[1] / n; out[2] = v[2] / n;
  return out;
}
// Rotation matrix (rows) carrying unit vector a onto unit vector b.
function rotationBetween(a, b) {
  const v = v3cross(a, b, [0, 0, 0]);
  const s = Math.hypot(v[0], v[1], v[2]);
  const c = v3dot(a, b);
  if (s < 1e-12) {
    return c > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
  }
  const k = [v[0] / s, v[1] / s, v[2] / s];
  const th = Math.atan2(s, c);
  const ct = Math.cos(th), st = Math.sin(th), t = 1 - ct;
  return [
    [t * k[0] * k[0] + ct, t * k[0] * k[1] - st * k[2], t * k[0] * k[2] + st * k[1]],
    [t * k[0] * k[1] + st * k[2], t * k[1] * k[1] + ct, t * k[1] * k[2] - st * k[0]],
    [t * k[0] * k[2] - st * k[1], t * k[1] * k[2] + st * k[0], t * k[2] * k[2] + ct],
  ];
}
function applyR(R, p, out) {
  const x = R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2];
  const y = R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2];
  const z = R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export class ThreeBlocks extends Simulation {
  static id = 'three-blocks';
  static title = 'Three Blocks';
  static description = 'Three reflecting planes: collisions or an optional 3D chamber-area measurement of π';
  static piMechanism = 'spherical billiard; optional statistical solid-angle counter';
  static rigor = 'Extension';
  static sortOrder = 80;
  static previewSteps = 14;   // hub thumbnail: early, while the three blocks are still spread out
  static piNature = 'extension';
  static piLabel = 'Status';
  static alternatives = [
    { id: 'three-body-pi', label: 'Make three blocks count π' },
    { id: 'spherical-triangle', label: 'The sphere billiard, literally' },
  ];
  static explanation = {
    setup: 'Three blocks in a line: wall | A (mass 1) | B (mass 100ⁿ) | C (mass 100²ⁿ). Block C starts moving left. All collisions are elastic.',
    insight: 'Rescale to q_i = √m_i·v_i and the energy fixes |q|: the state sits on a sphere, and each of the three possible collisions is a reflection in a plane whose normal comes straight from the masses. Those same three planes bound a chamber, and the rescaled configuration direction is a billiard ball bouncing inside the spherical triangle they cut — drawn beside the blocks, rebuilt whenever you change n.',
    contrast: 'The old one-angle unfolding argument does not apply to a chamber bounded by three planes. This is not a proof against every possible special identity, but the general collision sequence here is not a digit counter. The area mode makes a different, statistical measurement of the same mass-defined chamber.',
    derivation: `<details class="area-derivation"><summary>How can this 3D sphere still measure π?</summary>
      <h4>Count escape states</h4><p>Hold the blocks at their separated positions. A unit mass-weighted velocity Q is collision-free exactly when 0 ≤ v_A ≤ v_B ≤ v_C. These directions form a spherical triangle of solid angle Ω. Uniform directions hit it with probability Ω/(4π).</p>
      <h4>Find a thin target efficiently</h4><p>Direct darts almost never hit a needle-thin chamber. Instead sample a uniform direction U and transform it by A = diag(√m): Q = AU / |AU|. Now a hit is simply 0 ≤ U_A ≤ U_B ≤ U_C. The transformed directions are deliberately nonuniform.</p>
      <h4>Correct the area, not the picture</h4><p>The solid-angle Jacobian is J(U) = det(A)/|AU|³. Average zero for a miss and J for a hit; its expectation is Ω/(4π). Then π̂ = Ω / (4 × mean weighted hit). Ω itself is computed from the three triangle vertices with an arithmetic arctangent series, without supplying π.</p>
      <h4>What the uncertainty means</h4><p>The displayed interval is a normal approximation for the weighted mean, inverted afterwards. The reciprocal has finite-sample bias, so this is a convergent statistical estimate, not exact digits. Independent samples do not assume that one billiard trajectory explores the sphere uniformly.</p>
      <p>Geometry: <a href="https://doi.org/10.1109/TBME.1983.325207" target="_blank" rel="noopener">van Oosterom &amp; Strackee’s solid-angle identity ↗</a>. Sampling: <a href="https://doi.org/10.1214/aoms/1177692644" target="_blank" rel="noopener">Marsaglia’s sphere sampler ↗</a>.</p></details>`,
    formula: 'Collisions have no general digit-count formula here. Select Measurement → 3D chamber area to estimate π from independent, weighted samples of the mass-defined solid angle. This changes the observable; it does not assume a collision trajectory fills the sphere.',
    getExpected: (params) => {
      const n = params.n || 1;
      return params.measurement === 'area'
        ? `For n=${n}: the blocks stay still while independent directions accumulate on the energy sphere. Weighted escape-state hits estimate π, with statistical uncertainty.`
        : `For n=${n}: expect a sequence of collisions and a curved configuration path inside the spherical chamber. This inspects the geometry; switch to area measurement to estimate π from independent samples.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 1;
    this.measurement = params.measurement === 'area' ? 'area' : 'collisions';
    this.reset();
  }

  reset() {
    super.reset();
    this.masses = [1, Math.pow(100, this.n), Math.pow(100, this.n * 2)];
    this.positions = [0.15, 0.35, 0.65];
    this.velocities = [0, 0, -1];
    this.sizes = [0.04, 0.06, 0.09];
    this.finished = false;
    this.collisionEffects = [];
    this.areaCounter = new ThreeBlockAreaCounter(this.masses);
    this.phaseTrailStyle = this.measurement === 'area' ? 'points' : 'line';
    this._areaFrameTrials = 0;
    this._areaCredit = 0;
    this._buildChamber();
    this._resetChamberTrail();
  }

  getControls() {
    return [
      {
        type: 'select', id: 'measurement', label: 'Measurement', default: this.measurement,
        options: [
          { value: 'collisions', label: 'Collisions' },
          { value: 'area', label: '3D chamber area' },
        ],
        onChange: val => {
          this.measurement = val;
          this.reset();
          this.initSimScene();
        },
      },
      {
        type: 'slider', id: 'n', label: 'Mass exponent n',
        min: 1, max: 3, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: this.speed },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: '3d', label: 'Energy sphere Q_A × Q_B × Q_C', dimension: 3, primary: true,
        axisLabels: { x: 'Q_A', y: 'Q_B', z: 'Q_C' }
      },
      // One representative projection. A 2D slice of a point on the unit
      // 2-sphere lives strictly inside the unit disc (its radius is
      // √(1−Q_C²), which itself jumps at every B|C hit), so the unit circle
      // would be a bound the trajectory can never touch — suppressed.
      {
        id: 'q1-q2', label: 'Q_A vs Q_B (slice bounded by √(1−Q_C²), not by 1)',
        dimension: 2, boundary: 'none'
      },
    ];
  }

  step(dt) {
    if (this.measurement === 'area') return this._stepArea(dt);
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const MAX = 1000;
    let count = 0;

    while (remaining > 1e-15 && count < MAX) {
      // Find earliest collision
      let tMin = remaining;
      let collisionType = -1; // -1=none, 0=wall, 1+=block pair index

      // Wall collision: positions[0] + velocities[0]*t = 0
      if (this.velocities[0] < 0 && this.positions[0] > 0) {
        const t = this.positions[0] / (-this.velocities[0]);
        if (t < tMin) { tMin = t; collisionType = 0; }
      }

      // Adjacent block collisions
      for (let i = 0; i < 2; i++) {
        const gap = this.positions[i + 1] - this.positions[i] - this.sizes[i];
        const closing = this.velocities[i] - this.velocities[i + 1];
        if (closing > 0 && gap > 0) {
          const t = gap / closing;
          if (t < tMin) { tMin = t; collisionType = i + 1; }
        }
      }

      // Advance all blocks
      for (let i = 0; i < 3; i++) this.positions[i] += this.velocities[i] * tMin;
      remaining -= tMin;

      const now = performance.now();
      if (collisionType === 0) {
        this.positions[0] = 0;
        this.velocities[0] = Math.abs(this.velocities[0]);
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: this.sizes[0] / 2, time: now, type: 'wall', mirror: 0 });
        collided = true;
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        if (this.getRawPhasePoint) this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
        this._mirrorFlash[0] = now;
        this._pushChamberPoint();
      } else if (collisionType > 0) {
        const i = collisionType - 1;
        const m1 = this.masses[i], m2 = this.masses[i + 1];
        const v1 = this.velocities[i], v2 = this.velocities[i + 1];
        this.velocities[i] = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
        this.velocities[i + 1] = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2);
        this.positions[i] = this.positions[i + 1] - this.sizes[i];
        this.collisionCount++;
        this.collisionEffects.push({ x: this.positions[i + 1], y: Math.max(this.sizes[i], this.sizes[i + 1]) / 2, time: now, type: 'block', mirror: i + 1 });
        collided = true;
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
        if (this.getRawPhasePoint) this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
        this._mirrorFlash[i + 1] = now;
        this._pushChamberPoint();
      } else {
        break; // no collision in remaining time
      }
      count++;
    }

    // Done: all moving right in increasing order (all must be non-negative)
    const allRight = this.velocities.every(v => v >= 0);
    if (allRight && this.velocities[2] > 0 && this.velocities[2] >= this.velocities[1]
        && this.velocities[1] >= this.velocities[0]) {
      this.finished = true;
    }
    return collided;
  }

  getPiApproximation() {
    // A 3D collision count times one wedge angle has no general pi law.
    return this.measurement === 'area' ? this.areaCounter.stats().estimate ?? NaN : NaN;
  }

  getPiNature() { return this.measurement === 'area' ? 'statistical' : 'extension'; }
  getPiLabel() { return this.measurement === 'area' ? 'π ≈ (statistical)' : 'Status'; }
  getCountLabel() { return this.measurement === 'area' ? 'Independent samples' : 'Chamber hits'; }
  getCollisionCount() { return this.measurement === 'area' ? this.areaCounter.count : this.collisionCount; }

  getPiReadout() {
    if (this.measurement === 'area') {
      const value = this.areaCounter.stats().estimate;
      return value === null ? 'awaiting hits' : value.toFixed(4);
    }
    return 'no direct π';
  }

  getPhasePoint() {
    if (this.measurement === 'area') return this.areaCounter.last?.point || [];
    const R = Math.sqrt(this.masses[2]) * 1; // normalization from initial KE
    return this.velocities.map((v, i) => Math.sqrt(this.masses[i]) * v / R);
  }

  getRawPhasePoint() {
    if (this.measurement === 'area') {
      return this.getPhasePoint().map((q, i) => q * this.areaCounter.geometry.axes[i]);
    }
    const R = this.masses[2] * 1;
    return this.velocities.map((v, i) => this.masses[i] * v / R);
  }

  getPhaseExtractor(viewId) {
    switch (viewId) {
      case '3d': return (pt) => [pt[0], pt[1], pt[2]];
      case 'q1-q2': return (pt) => [pt[0], pt[1]];
      default: return (pt) => pt;
    }
  }

  getFormulaHTML() {
    if (this.measurement === 'area') {
      const stats = this.areaCounter.stats();
      const interval = stats.interval
        ? `Approx. 95% interval: <b>${stats.interval[0].toFixed(3)}–${stats.interval[1].toFixed(3)}</b>.`
        : 'Approx. interval appears after 30 chamber hits.';
      return `<div style="display:block;line-height:1.45">
        <div><b>Count the area of this 3D chamber.</b> Blocks are held still; independent directions replace the collision trajectory.</div>
        <div>A hit is an escape state: 0 ≤ v<sub>A</sub> ≤ v<sub>B</sub> ≤ v<sub>C</sub>, so no further collision occurs.</div>
        <div>${stats.hits.toLocaleString()} chamber hits / ${stats.count.toLocaleString()} samples.
          Ω = ${this.areaCounter.geometry.solidAngle.toExponential(5)} sr, from the mass-defined mirror planes.</div>
        <div>π ≈ Ω / (4 × weighted hit fraction). Samples concentrate near the needle; each hit has its correct area weight.</div>
        <div>${interval} <span class="f-muted">Statistical convergence, not digits; the reciprocal estimate has finite-sample bias.</span></div>
        <div class="f-muted">The 3D dots are independent energy-sphere states. The magnified panel shows chamber hits.
          Sampling and area arithmetic use no supplied π constant. No trajectory-equidistribution assumption.</div>
      </div>`;
    }
    // Static per mass ratio — cached in _buildChamber() so the per-frame
    // readout refresh does no work and allocates nothing.
    return this._formulaHTML;
  }

  _stepArea(dt) {
    if (!(dt > 0) || this._areaFrameTrials >= 4096) return false;
    this._areaCredit = Math.min(128, this._areaCredit + dt * 640000);
    const count = Math.min(Math.floor(this._areaCredit), 4096 - this._areaFrameTrials);
    this._areaCredit -= count;
    for (let i = 0; i < count; i++) {
      const sample = this.areaCounter.sample();
      if (sample.hit) this._pushChamberPoint(sample.point);
      // The visual cloud is thinned; all samples contribute to the estimator.
      if (this.areaCounter.count % 16 === 0) {
        this.pendingPhasePoints.push([...sample.point]);
        this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
      }
    }
    this._areaFrameTrials += count;
    return false; // Samples are not collision events.
  }

  // Hub thumbnail focus: wall + all three blocks (the chamber panel sits well
  // above y = 0.4 and stays out of this crop).
  getPreviewBox() {
    const x1 = Math.max(0.6, this.positions[2] + this.sizes[2] + 0.1);
    return { x0: -0.06, x1, y0: -0.045, y1: 0.22 };
  }

  // ── chamber geometry ───────────────────────────────────────────────────────

  // Everything the chamber panel needs, derived from the current masses:
  // mirror normals, the spherical triangle's vertices, its dihedral angles,
  // and the (magnify, then stretch-across) map from the sphere to the panel.
  _buildChamber() {
    const m = this.masses;
    const inv = [1 / Math.sqrt(m[0]), 1 / Math.sqrt(m[1]), 1 / Math.sqrt(m[2])];
    this._sqrtM = [Math.sqrt(m[0]), Math.sqrt(m[1]), Math.sqrt(m[2])];

    // Inward normals of the chamber (y-space). Mirror k reflects at collision k.
    const inward = [
      [1, 0, 0],
      [-inv[0], inv[1], 0],
      [0, -inv[1], inv[2]],
    ];
    const unitN = inward.map(v => v3unit(v, [0, 0, 0]));

    // Vertices: V[0] = mirrors 0∩1, V[1] = 0∩2, V[2] = 1∩2 (sign fixed so the
    // vertex lies in the closed chamber).
    const pairs = [[0, 1], [0, 2], [1, 2]];
    const verts = pairs.map(([i, j]) => {
      const v = v3unit(v3cross(inward[i], inward[j], [0, 0, 0]), [0, 0, 0]);
      if (inward.some(u => v3dot(u, v) < -1e-12)) { v[0] = -v[0]; v[1] = -v[1]; v[2] = -v[2]; }
      return v;
    });
    // Dihedral angle at each vertex = π − angle between the two inward normals.
    const angles = pairs.map(([i, j]) =>
      Math.PI - Math.acos(Math.max(-1, Math.min(1, v3dot(unitN[i], unitN[j])))));
    const excess = angles[0] + angles[1] + angles[2] - Math.PI;

    // Chamber centre and a tangent frame there.
    const c = v3unit([verts[0][0] + verts[1][0] + verts[2][0],
                      verts[0][1] + verts[1][1] + verts[2][1],
                      verts[0][2] + verts[1][2] + verts[2][2]], [0, 0, 0]);
    const seed = Math.abs(c[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const d = v3dot(seed, c);
    const e1 = v3unit([seed[0] - d * c[0], seed[1] - d * c[1], seed[2] - d * c[2]], [0, 0, 0]);
    const e2 = v3cross(c, e1, [0, 0, 0]);

    // Gnomonic (central) projection about c: great circles → straight lines, so
    // the chamber walls are exact straight edges and the billiard legs are exact
    // straight segments. The chamber is far smaller than a radian, so this is a
    // magnifying glass, not a distortion of the story.
    const g = verts.map(v => {
      const t = v3dot(v, c);
      return [v3dot(v, e1) / t, v3dot(v, e2) / t];
    });
    // Longest edge defines the panel's horizontal axis.
    let best = 0, bestLen = -1, bi = 0, bj = 1;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      const L = Math.hypot(g[i][0] - g[j][0], g[i][1] - g[j][1]);
      if (L > bestLen) { bestLen = L; bi = i; bj = j; }
    }
    best = Math.atan2(g[bj][1] - g[bi][1], g[bj][0] - g[bi][0]);
    const cs = Math.cos(best), sn = Math.sin(best);
    const rot = g.map(([x, y]) => [x * cs + y * sn, -x * sn + y * cs]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of rot) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const hx = Math.max((x1 - x0) / 2, 1e-15);
    const hy = Math.max((y1 - y0) / 2, 1e-15);
    const kx = (PANEL_HW * PANEL_FILL) / hx;
    const ky = (PANEL_HH * PANEL_FILL) / hy;

    const panelVerts = rot.map(([x, y]) => [
      PANEL_CX + kx * (x - (x0 + x1) / 2),
      PANEL_CY + ky * (y - (y0 + y1) / 2),
    ]);

    this.chamber = {
      inward, unitN, verts, angles, excess, c, e1, e2,
      cos: cs, sin: sn, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, kx, ky,
      panelVerts,
      // Angular size (radians) of the triangle's bounding box, for the marker.
      extent: Math.max(hx, hy) * 2,
      aspect: hx / hy,          // how needle-like the chamber really is
      zoom: kx / SPHERE_R,      // magnification relative to the drawn sphere
      stretch: ky / kx,         // extra widening across the needle
    };

    this._yTmp = this._yTmp || new Float64Array(3);
    this._pTmp = this._pTmp || new Float64Array(2);

    const deg = (r) => (r * 180 / Math.PI);
    const fmt = (x, d = 3) => x.toFixed(d);
    const ang = this.chamber.angles;
    // ONE top-level block node: .formula-readout is a flex row, so anything at
    // top level would become a side-by-side flex item.
    this._formulaHTML = `<div style="display:block;line-height:1.45">
        <div>q<sub>i</sub> = √m<sub>i</sub>·v<sub>i</sub> &nbsp;⇒&nbsp; |q|² = 2E is fixed — the state rides an <b>energy sphere</b>.</div>
        <div style="margin-top:2px">Each collision is a reflection q ↦ q − 2(q·n)n/|n|²:
          <span style="color:#ffffff">wall n₀ = (1, 0, 0)</span> ·
          <span style="color:#4cc9f0">A|B n₁ ∝ (1/√m<sub>A</sub>, −1/√m<sub>B</sub>, 0)</span> ·
          <span style="color:#f7c948">B|C n₂ ∝ (0, 1/√m<sub>B</sub>, −1/√m<sub>C</sub>)</span>
        </div>
        <div style="margin-top:2px">Those three planes cut a spherical triangle. Angles
          ${fmt(deg(ang[0]))}° / ${fmt(deg(ang[1]))}° / ${fmt(deg(ang[2]))}°,
          spherical excess ${deg(this.chamber.excess).toExponential(2)}° — a needle, not a wedge.</div>
        <div class="f-muted" style="margin-top:2px">Chamber panel: magnified ×${this.chamber.zoom.toFixed(0)} off the sphere.
          The real chamber is ${this.chamber.aspect.toFixed(0)}:1 long-to-thin (each step of n multiplies that by 10),
          so it is drawn stretched ×${this.chamber.stretch.toFixed(0)} across — otherwise the bounces are thinner than a pixel.
          Each bounce there is one collision counted on the left.</div>
      </div>`;
  }

  _resetChamberTrail() {
    if (!this._chamberTrail) this._chamberTrail = new Float32Array(TRAIL_CAP * 2);
    this._trailHead = 0;
    this._trailCount = 0;
    this._framePts = 0;
    this._mirrorFlash = this._mirrorFlash || new Float64Array(3);
    this._mirrorFlash[0] = -1e9; this._mirrorFlash[1] = -1e9; this._mirrorFlash[2] = -1e9;
    this._lastPanelX = NaN;
    this._lastPanelY = NaN;
  }

  // Direction of the rescaled configuration vector y_i = √m_i·u_i (block widths
  // shifted out). This is the point that lives inside the chamber.
  _chamberDirection(out) {
    const p = this.positions, s = this.sizes, r = this._sqrtM;
    const y0 = r[0] * p[0];
    const y1 = r[1] * (p[1] - s[0]);
    const y2 = r[2] * (p[2] - s[0] - s[1]);
    const n = Math.hypot(y0, y1, y2);
    if (!(n > 1e-14)) return false;
    out[0] = y0 / n; out[1] = y1 / n; out[2] = y2 / n;
    return true;
  }

  _toPanel(y, out) {
    const ch = this.chamber;
    const t = v3dot(y, ch.c);
    if (!(t > 1e-9)) return false;
    const gx = v3dot(y, ch.e1) / t;
    const gy = v3dot(y, ch.e2) / t;
    const X = gx * ch.cos + gy * ch.sin;
    const Y = -gx * ch.sin + gy * ch.cos;
    out[0] = PANEL_CX + ch.kx * (X - ch.cx);
    out[1] = PANEL_CY + ch.ky * (Y - ch.cy);
    return true;
  }

  // Append the current chamber point. Called at every collision (so wall
  // contacts are exact) and once per frame (so the straight legs are drawn),
  // with a per-frame cap because n = 3 fires hundreds of hits per frame.
  _pushChamberPoint(areaPoint = null) {
    if (!this._chamberTrail || this._framePts >= TRAIL_PTS_PER_FRAME) return;
    if (this.measurement === 'area') {
      if (!areaPoint) return;
      this._yTmp.set(areaPoint);
    } else if (!this._chamberDirection(this._yTmp)) return;
    if (!this._toPanel(this._yTmp, this._pTmp)) return;
    const x = this._pTmp[0], y = this._pTmp[1];
    if (Math.abs(x - this._lastPanelX) < 1e-4 && Math.abs(y - this._lastPanelY) < 1e-4) return;
    const i = this._trailHead * 2;
    this._chamberTrail[i] = x;
    this._chamberTrail[i + 1] = y;
    this._lastPanelX = x; this._lastPanelY = y;
    this._trailHead = (this._trailHead + 1) % TRAIL_CAP;
    if (this._trailCount < TRAIL_CAP) this._trailCount++;
    this._framePts++;
  }

  // ── scene ─────────────────────────────────────────────────────────────────

  // Screen-anchored text sprite (skipped when there is no DOM, e.g. in tests).
  _label(text, x, y, h = 0.032, color = '#9aa3c7') {
    if (typeof document === 'undefined') return null;
    const fontPx = 32;
    let cv = document.createElement('canvas');
    let g = cv.getContext('2d');
    if (!g) return null;
    g.font = `${fontPx}px Georgia, serif`;
    const tw = Math.max(8, Math.ceil(g.measureText(text).width)) + 8;
    const th = Math.ceil(fontPx * 1.4);
    cv.width = tw; cv.height = th;
    g = cv.getContext('2d');
    g.font = `${fontPx}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, tw / 2, th / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
    }));
    sp.position.set(x, y, 0.3);
    sp.scale.set(h * (tw / th), h, 1);
    sp.renderOrder = 6;
    return sp;
  }

  _addLine(points, color, opacity) {
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity, depthTest: false, depthWrite: false
    });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 3;
    this.simScene.add(line);
    return line;
  }

  initSimScene() {
    this.simScene.clear();
    // Taller box than the bare block track: the lower strip is the blocks, the
    // upper half is the energy sphere and the chamber it cuts.
    this.simCamera = new THREE.OrthographicCamera(-0.12, 1.12, 0.92, -0.20, 0.1, 10);
    this.simCamera.position.z = 1;

    // Wall (kept clear of the divider now that the box is taller)
    const wallGeom = new THREE.PlaneGeometry(0.02, 0.26);
    const wallMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const wall = new THREE.Mesh(wallGeom, wallMat);
    wall.position.set(-0.01, 0.1, 0);
    this.simScene.add(wall);

    // Floor
    const floorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.1, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(floorGeom, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Blocks
    this.blockMeshes = [];
    const colors = [0xe94560, 0xe94560, 0xe94560];
    const opacities = [1, 0.7, 0.5];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.PlaneGeometry(this.sizes[i], this.sizes[i]);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i], transparent: true, opacity: opacities[i]
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = this.sizes[i] / 2;
      this.simScene.add(mesh);
      this.blockMeshes.push(mesh);
    }

    // Collision effect rings (pool of 5)
    this.effectMeshes = [];
    for (let i = 0; i < 5; i++) {
      const ringGeom = new THREE.RingGeometry(0.01, 0.015, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }

    this._initChamberScene();
  }

  _initChamberScene() {
    const ch = this.chamber;

    // Divider between the block track and the reflection geometry. Kept above
    // the hub thumbnail's crop (getPreviewBox), which tops out near y = 0.28.
    this._addLine([
      new THREE.Vector3(-0.10, 0.355, 0), new THREE.Vector3(1.10, 0.355, 0)
    ], 0x2a2a4a, 0.8);

    // ── the energy sphere with the three mirrors cut into it ────────────────
    // Orient so the chamber (always near the Q_C axis for these mass ratios)
    // faces the viewer, up and to the left.
    const facing = v3unit([-0.30, 0.52, 0.80], [0, 0, 0]);
    const R = rotationBetween(ch.c, facing);
    this._sphereRotation = R;
    const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
    const project = (p) => {
      applyR(R, p, tmp2);
      return new THREE.Vector3(
        SPHERE_CX + SPHERE_R * tmp2[0],
        SPHERE_CY + SPHERE_R * tmp2[1],
        SPHERE_R * tmp2[2]
      );
    };

    // Sphere skin: latitude/longitude wireframe, drawn dim and depth-free so
    // the far side of every mirror stays visible (the planes cut all the way
    // through).
    const skin = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_R, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x7c83fd, wireframe: true, transparent: true, opacity: 0.13,
        depthWrite: false
      })
    );
    skin.position.set(SPHERE_CX, SPHERE_CY, 0);
    skin.renderOrder = 1;
    this.simScene.add(skin);

    // Mirror great circles.
    this.mirrorCircles = [];
    for (let k = 0; k < 3; k++) {
      const n = ch.unitN[k];
      const seed = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const d = v3dot(seed, n);
      const u = v3unit([seed[0] - d * n[0], seed[1] - d * n[1], seed[2] - d * n[2]], [0, 0, 0]);
      const w = v3cross(n, u, [0, 0, 0]);
      const pts = [];
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        tmp[0] = u[0] * ca + w[0] * sa;
        tmp[1] = u[1] * ca + w[1] * sa;
        tmp[2] = u[2] * ca + w[2] * sa;
        pts.push(project(tmp));
      }
      this.mirrorCircles.push(this._addLine(pts, MIRROR_COLORS[k], 0.5));
    }

    // Where the chamber actually is on that sphere: a ring around it, sized a
    // few times the chamber so it is findable at all mass ratios.
    const rho = Math.min(0.22, Math.max(0.05, ch.extent * 2.5));
    const ringPts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const ca = Math.cos(rho), sa = Math.sin(rho);
      const cb = Math.cos(a), sb = Math.sin(a);
      tmp[0] = ch.c[0] * ca + (ch.e1[0] * cb + ch.e2[0] * sb) * sa;
      tmp[1] = ch.c[1] * ca + (ch.e1[1] * cb + ch.e2[1] * sb) * sa;
      tmp[2] = ch.c[2] * ca + (ch.e1[2] * cb + ch.e2[2] * sb) * sa;
      ringPts.push(project(tmp));
    }
    this._addLine(ringPts, 0xe94560, 0.85);

    // Magnifier leaders from that ring to the panel.
    const ringRight = project((() => {
      const ca = Math.cos(rho), sa = Math.sin(rho);
      tmp[0] = ch.c[0] * ca + ch.e1[0] * sa;
      tmp[1] = ch.c[1] * ca + ch.e1[1] * sa;
      tmp[2] = ch.c[2] * ca + ch.e1[2] * sa;
      return tmp;
    })());
    this._addLine([
      new THREE.Vector3(ringRight.x, ringRight.y, 0.05),
      new THREE.Vector3(PANEL_CX - PANEL_HW, PANEL_CY + PANEL_HH, 0.05)
    ], 0xe94560, 0.22);
    this._addLine([
      new THREE.Vector3(ringRight.x, ringRight.y, 0.05),
      new THREE.Vector3(PANEL_CX - PANEL_HW, PANEL_CY - PANEL_HH, 0.05)
    ], 0xe94560, 0.22);

    // Axis stubs, so the sphere reads as Q-space.
    const axisNames = ['Q_A', 'Q_B', 'Q_C'];
    for (let k = 0; k < 3; k++) {
      tmp[0] = tmp[1] = tmp[2] = 0; tmp[k] = 1.0;
      const tip = project(tmp);
      tmp[0] = tmp[1] = tmp[2] = 0; tmp[k] = -1.0;
      const tail = project(tmp);
      this._addLine([tail, tip], 0x5a6096, 0.5);
      const lab = this._label(axisNames[k], tip.x, tip.y + 0.025, 0.03, '#7c83fd');
      if (lab) this.simScene.add(lab);
    }

    // ── the chamber panel: the spherical triangle, magnified ────────────────
    const pv = ch.panelVerts;
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pv[0][0], pv[0][1], 0.0,
      pv[1][0], pv[1][1], 0.0,
      pv[2][0], pv[2][1], 0.0,
    ]), 3));
    const fill = new THREE.Mesh(fillGeom, new THREE.MeshBasicMaterial({
      color: 0x7c83fd, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthTest: false, depthWrite: false
    }));
    fill.renderOrder = 2;
    this.simScene.add(fill);

    // Panel frame.
    this._addLine([
      new THREE.Vector3(PANEL_CX - PANEL_HW, PANEL_CY - PANEL_HH, 0),
      new THREE.Vector3(PANEL_CX + PANEL_HW, PANEL_CY - PANEL_HH, 0),
      new THREE.Vector3(PANEL_CX + PANEL_HW, PANEL_CY + PANEL_HH, 0),
      new THREE.Vector3(PANEL_CX - PANEL_HW, PANEL_CY + PANEL_HH, 0),
      new THREE.Vector3(PANEL_CX - PANEL_HW, PANEL_CY - PANEL_HH, 0),
    ], 0x2a2a4a, 0.9);

    // Chamber walls. Mirror k owns the edge between the two vertices that were
    // built from it: 0 → (V01,V02), 1 → (V01,V12), 2 → (V02,V12).
    const edgeVerts = [[0, 1], [0, 2], [1, 2]];
    this.mirrorEdges = [];
    for (let k = 0; k < 3; k++) {
      const [i, j] = edgeVerts[k];
      this.mirrorEdges.push(this._addLine([
        new THREE.Vector3(pv[i][0], pv[i][1], 0.04),
        new THREE.Vector3(pv[j][0], pv[j][1], 0.04),
      ], MIRROR_COLORS[k], 0.9));
      const mx = (pv[i][0] + pv[j][0]) / 2, my = (pv[i][1] + pv[j][1]) / 2;
      const lab = this._label(MIRROR_NAMES[k], mx, my + (k === 0 ? 0.028 : -0.028), 0.027,
        '#' + MIRROR_COLORS[k].toString(16).padStart(6, '0'));
      if (lab) this.simScene.add(lab);
    }

    // Billiard trail inside the chamber.
    const trailPos = new Float32Array(TRAIL_CAP * 3);
    this.chamberTrailGeom = new THREE.BufferGeometry();
    this.chamberTrailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    this.chamberTrailGeom.setDrawRange(0, 0);
    this.chamberTrailLine = this.measurement === 'area'
      ? new THREE.Points(this.chamberTrailGeom, new THREE.PointsMaterial({
        color: 0x4cc9f0, size: 3, sizeAttenuation: false, transparent: true,
        opacity: 0.75, depthTest: false, depthWrite: false,
      }))
      : new THREE.Line(this.chamberTrailGeom, new THREE.LineBasicMaterial({
        color: 0x4cc9f0, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false
      }));
    this.chamberTrailLine.renderOrder = 4;
    this.simScene.add(this.chamberTrailLine);

    this.chamberDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 20),
      new THREE.MeshBasicMaterial({ color: 0xe94560, depthTest: false, depthWrite: false })
    );
    this.chamberDot.renderOrder = 5;
    this.chamberDot.position.set(PANEL_CX, PANEL_CY, 0.06);
    this.simScene.add(this.chamberDot);
    this.chamberDot.visible = this.measurement !== 'area';

    this.areaSphereDot = null;
    if (this.measurement === 'area') {
      this.areaSphereDot = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16),
        new THREE.MeshBasicMaterial({ color: 0x4cc9f0, depthTest: false, depthWrite: false }));
      this.areaSphereDot.visible = false;
      this.areaSphereDot.renderOrder = 5;
      this.simScene.add(this.areaSphereDot);
      const note = this._label('blocks held still · sampling independent directions', 0.5, 0.27, 0.032, '#4cc9f0');
      if (note) this.simScene.add(note);
    }

    // Titles.
    const t1 = this._label('energy sphere  |q| = 1,  three mirrors', SPHERE_CX, 0.875, 0.033);
    if (t1) this.simScene.add(t1);
    const t2 = this._label(
      `chamber ×${ch.zoom.toFixed(0)}  (needle ${ch.aspect.toFixed(0)}:1, stretched ×${ch.stretch.toFixed(0)} across)`,
      PANEL_CX, 0.875, 0.033);
    if (t2) this.simScene.add(t2);
    const t3 = this._label(this.measurement === 'area' ? 'sampled hits · weights used in estimate'
      : 'one bounce = one collision', PANEL_CX, 0.405, 0.026, '#6b7299');
    if (t3) this.simScene.add(t3);
  }

  updateSimScene() {
    this._areaFrameTrials = 0;
    if (!this.blockMeshes) return;
    for (let i = 0; i < 3; i++) {
      this.blockMeshes[i].position.x = this.positions[i] + this.sizes[i] / 2;
    }

    // Collision pulse effects
    const now = performance.now();
    const EFFECT_DURATION = 300;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);

    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        const scale = 1 + progress * 5;
        ring.visible = true;
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }

    // Chamber billiard: one sample per frame plus the exact collision points
    // recorded by step(), then redraw the ring buffer in time order.
    this._framePts = 0;
    this._pushChamberPoint();

    if (this.chamberTrailGeom) {
      const src = this._chamberTrail;
      const dst = this.chamberTrailGeom.attributes.position.array;
      const count = this._trailCount;
      const start = (this._trailHead - count + TRAIL_CAP) % TRAIL_CAP;
      for (let k = 0; k < count; k++) {
        const s = (((start + k) % TRAIL_CAP) * 2);
        dst[k * 3] = src[s];
        dst[k * 3 + 1] = src[s + 1];
        dst[k * 3 + 2] = 0.05;
      }
      this.chamberTrailGeom.attributes.position.needsUpdate = true;
      this.chamberTrailGeom.setDrawRange(0, count);
      if (count > 0 && this.chamberDot) {
        this.chamberDot.visible = true;
        const last = ((this._trailHead - 1 + TRAIL_CAP) % TRAIL_CAP) * 2;
        this.chamberDot.position.x = src[last];
        this.chamberDot.position.y = src[last + 1];
      }
    }

    if (this.areaSphereDot && this.areaCounter.last) {
      const p = applyR(this._sphereRotation, this.areaCounter.last.point, this._yTmp);
      this.areaSphereDot.position.set(SPHERE_CX + SPHERE_R * p[0],
        SPHERE_CY + SPHERE_R * p[1], 0.25);
      this.areaSphereDot.material.color.setHex(this.areaCounter.last.hit ? 0xf7c948 : 0x4cc9f0);
      this.areaSphereDot.visible = true;
    }

    // Flash the mirror that just fired, on the sphere and in the chamber.
    if (this.mirrorEdges) {
      for (let k = 0; k < 3; k++) {
        const age = now - this._mirrorFlash[k];
        const f = age < FLASH_MS ? 1 - age / FLASH_MS : 0;
        this.mirrorEdges[k].material.opacity = 0.55 + 0.45 * f;
        this.mirrorCircles[k].material.opacity = 0.32 + 0.5 * f;
      }
    }
  }
}

registerSim(ThreeBlocks);
