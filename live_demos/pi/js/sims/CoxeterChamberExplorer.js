import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js runs dt=1e-4 sim-seconds × ~speed*10 steps/frame; the TIME_SCALE carry
// pattern (see GaltonBoardPi.js) turns that into a wall-clock dart rate.
const TIME_SCALE = 16.7;
const TURBO_RATE = 1000;   // invisible statistical darts / board-second
const MAX_DARTS = 2000;    // visible dart pool; statistics continue past the cap
const KALEIDO_MAX = 80;    // draw the true-angle kaleidoscope only when 2·floor(π/θ) ≤ this
const RD = 0.98;           // display disk / sphere radius
const BALL_TURBO = 50;     // turbo multiplier on the ball's clock (its statistics, like the darts')
const TRACE_MAX = 3000;    // ring buffer of ball positions — display only
const BALL_SIGMA = 0.4;    // measured 1/√(arc) noise scale of the ball's occupancy g (see header note)

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function nrm(v, s = 1) { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] * s / m, v[1] * s / m, v[2] * s / m]; }
const clamp1 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);

// Three INWARD unit normals bounding a spherical triangle, built from its vertices so
// orientation (toward the centroid) is automatic and the chamber is always valid. The
// shape slider u∈[0,1] tilts vertex A, varying the angle sum AND area continuously.
function trianglePlanes(u) {
  const ang = 0.85 + 1.1 * u;
  const A = nrm([Math.cos(ang), Math.sin(ang), 0.85]);
  const B = nrm([1.05, -0.85, 0.45]);
  const C = nrm([-0.9, 0.7, 0.55]);
  const mk = (p, q, inside) => { let n = nrm(cross(p, q)); if (dot(n, inside) < 0) n = [-n[0], -n[1], -n[2]]; return n; };
  return { normals: [mk(B, C, A), mk(C, A, B), mk(A, B, C)], verts: [A, B, C] };
}

// Interior-angle sum from inward normals: angle opposite plane i = arccos(-nⱼ·nₖ).
function angleSum(ns) {
  const [a, b, c] = ns;
  return Math.acos(clamp1(-dot(b, c))) + Math.acos(clamp1(-dot(c, a))) + Math.acos(clamp1(-dot(a, b)));
}

// The ball's test region. Cut the chamber ABC along the great circle through vertex A
// and M, the arc-midpoint of the opposite edge BC; the piece containing B is again a
// spherical triangle (A, B, M), so Girard gives its area as S_T − π from arccos of
// measured dot products alone. Its walls are the chamber's own BC- and AB-planes plus
// the cut, all already inward-oriented, so the same angleSum() applies unchanged.
// This is the ONE place the second estimator needs beyond the chamber itself.
function chamberGeometry(u) {
  const tp = trianglePlanes(u);
  const [A, B, C] = tp.verts;
  const M = nrm([B[0] + C[0], B[1] + C[1], B[2] + C[2]]);
  let cutN = nrm(cross(A, M));
  if (dot(cutN, B) < 0) cutN = [-cutN[0], -cutN[1], -cutN[2]];
  return {
    normals: tp.normals, verts: tp.verts, cutN, M,
    S: angleSum(tp.normals),
    ST: angleSum([tp.normals[0], tp.normals[2], cutN]),
  };
}

// Marsaglia (1972) uniform point on S²: sqrt only — no π, no sin/cos.
function sampleSphere() {
  let x, y, s;
  do { x = 2 * Math.random() - 1; y = 2 * Math.random() - 1; s = x * x + y * y; } while (s >= 1);
  const t = 2 * Math.sqrt(1 - s);
  return [t * x, t * y, 1 - 2 * s];
}

export class CoxeterChamberExplorer extends Simulation {
  static id = 'coxeter-chambers';
  static title = 'Coxeter Chambers — π from reflections & curvature';
  static description = 'Two independent π machines share one spherical chamber — raining darts measure its area by rejection sampling, the ricocheting ball measures it by ergodic time-average — plus a flat dihedral kaleidoscope that counts reflections for exact digits';
  static piMechanism = 'statistical (default, spherical): Girard angle-surplus area of a spherical chamber, measured TWO independent ways — π-free darts (rejection sampling) and the ball\'s own occupancy (ergodic time-average) — both ∝ 1/√N; exact (kaleidoscope): θ = arctan(10⁻ⁿ) → count reflections → digits of π';
  // Both static badges describe the mode the card OPENS in — the spherical chamber,
  // where BOTH instruments (dart fraction f and ball occupancy g) are 1/√N estimates.
  // Stamping 'exact' here put an "exact digits" badge on a 1/√N estimator; the instance
  // getPiNature() below tells the truth for whichever mode is actually running.
  static rigor = 'Statistical / Geometric';
  static sortOrder = 52;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 16;
  static alternatives = [
    { id: 'optical-wedge', label: 'The flat mirror wedge' },
    { id: 'n-blocks', label: 'The k-dimensional chamber' },
    { id: 'three-body-pi', label: 'Three blocks in a chamber' },
  ];
  static explanation = {
    setup: 'Two rank views of one reflection group. RANK 2 (kaleidoscope): a ray bounces between two mirrors meeting at angle θ = arctan(10⁻ⁿ); reflecting the wedge instead of the ray tiles a disk, and the straight unfolded ray crosses floor(π/θ) chamber copies before it has swept through π. RANK 3 (spherical): three great circles cut a triangular chamber on the sphere, and the SAME area gets measured twice by two machines that share no data. The darts rain uniformly over the whole sphere and count what lands inside — rejection sampling. The gold ball ricochets inside the chamber and its own clock is the second instrument: an ergodic trajectory spends time in a sub-region in proportion to that sub-region’s AREA, so the fraction of TIME it spends on one side of a cut through the chamber measures the same area ratio, with no darts at all. Both fractions are pushed through Girard’s surplus to get π, and the card shows both answers and their disagreement. That they agree IS ergodicity.',
    insight: 'Flat and curved chambers encode π two different honest ways. On the flat side, a chamber angle of exactly θ means the count of chambers a π-sweep crosses IS π/θ — so reflections × θ ≈ π. On the sphere, Girard’s theorem says a triangle’s area equals its angle surplus S − π, and the surplus is the ONLY place π appears; measure any area FRACTION with a π-free instrument and π falls out. The darts measure f = chamber/sphere and give π = S/(1+4f). The ball measures g = (time in the sub-triangle ABM)/(total time) = (S_T − π)/(S − π) and gives π = (S_T − g·S)/(1 − g). Same theorem, same chamber, two instruments that never touch each other’s counters. Both are 1/√N: measured rms error ≈2·10⁻³ for 3·10⁵ darts, and ≈1.1/√(arc length) for the ball. There is a real catch, and the card does not hide it: the time-average is only valid if the ball equidistributes, and a MIRROR-walled billiard in a great-circle triangle does not — see the wall-law control.',
    contrast: 'How this differs from the Optical Wedge: that card unfolds ONE ray and counts its reflections — a rank-2 trajectory. This card is about the reflection GROUP that the mirrors generate. Its flat kaleidoscope mode reproduces the wedge count (the shared rank-2 face), but the reason it exists is rank 3: on the sphere the same reflection idea builds a triangular chamber whose curvature — not any reflection count — hands back π through Girard’s angle surplus, something no flat wedge can do. And where the wedge’s ray is the measurement by counting, here the ball is the measurement by DWELLING: it is timed, not counted. Nothing is handed π: the kaleidoscope angle is a slope 10⁻ⁿ (not π/k), the darts are Marsaglia sqrt-only, and the ball’s wall scattering draws sin θ uniformly (sqrt only) — no trig, no π anywhere in either estimator.',
    formula: 'kaleidoscope: π ≈ reflections × arctan(10⁻ⁿ).   spherical darts: π = S / (1 + 4f),  S = Σ arccos(−nⱼ·nₖ),  f = inside-darts / total.   spherical ball: π = (S_T − g·S) / (1 − g),  g = time inside sub-triangle / total time.',
    getExpected: (params) => {
      const mode = params.mode || 'kaleidoscope';
      if (mode === 'spherical') {
        const g = chamberGeometry(params.shape ?? 0.5);
        const S = g.S, ST = g.ST;
        const f = (S - Math.PI) / (4 * Math.PI);
        const gr = (ST - Math.PI) / (S - Math.PI);
        return `Spherical chamber: angle sum S = ${S.toFixed(4)}, area = S − π = ${(S - Math.PI).toFixed(4)}. Darts converge on f = (S−π)/(4π) = ${f.toFixed(4)}, so π = S/(1+4f) → ${(S / (1 + 4 * f)).toFixed(4)}. The ball's sub-triangle has S_T = ${ST.toFixed(4)}, so its occupancy converges on g = (S_T−π)/(S−π) = ${gr.toFixed(4)} and π = (S_T − g·S)/(1 − g) → ${((ST - gr * S) / (1 - gr)).toFixed(4)}. Both statistical (noise ~ 1/√N); with ROUGH walls they agree, with MIRROR walls the ball's g misses ${params.shape >= 0.7 ? 'badly (≈0.11–0.16 off)' : 'by ≈0.002–0.017'} because a specular great-circle billiard does not equidistribute.`;
      }
      const n = params.n || 1;
      const theta = Math.atan(Math.pow(10, -n));
      const N = Math.floor(Math.PI / theta);   // display-only: the blurb's expected count
      return `Kaleidoscope n=${n}: θ = arctan(10⁻${n}) = ${theta.toFixed(6)}. Expect ${N} reflections, so the count reads π = ${N}/10^${n} = ${(N / Math.pow(10, n)).toFixed(n + 2)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    // Default to the spherical chamber — the rank-3 curvature mechanism is what
    // sets this apart from the Optical Wedge (whose flat kaleidoscope this mode's
    // sibling reproduces); leading with the sphere makes the difference visible.
    this.mode = params.mode || 'spherical';
    this.n = Math.min(3, Math.max(1, Math.round(params.n || 1)));
    this.shape = params.shape ?? 0.5;
    this.dartRate = params.dartRate || 40;
    this.ballRate = params.ballRate || 30;
    // 'rough' = Knudsen cosine scattering, which makes the ball's time-average a real
    // area measurement; 'mirror' = ordinary specular reflection, which does NOT
    // equidistribute here (kept as a selectable demonstration of the failure).
    this.wallLaw = params.wallLaw || 'rough';
    this.turbo = false;
    this.maxTrailLength = 6000;
    this.reset();
    this._lastHeadline = this._headlineKey();
  }

  getControls() {
    const rebuild = (k) => (v) => { this[k] = v; this.reset(); this.initSimScene(); };
    return [
      // Mode also flips the headline (count label AND π label), and ControlPanel.build()
      // reads those ONCE — so this knob, unlike the others, must request a rebuild.
      { type: 'select', id: 'mode', label: 'Mode', highlight: true, default: this.mode,
        options: [{ value: 'kaleidoscope', label: 'Kaleidoscope (flat, exact digits)' }, { value: 'spherical', label: 'Spherical (curved, statistical)' }],
        onChange: (v) => { this.mode = v; this.reset(); this.initSimScene(); this._syncHeadline(); } },
      { type: 'slider', id: 'n', label: 'Kaleidoscope slope exponent n', min: 1, max: 3, step: 1, default: this.n, onChange: rebuild('n') },
      { type: 'slider', id: 'shape', label: 'Triangle shape (spherical)', highlight: true, min: 0, max: 1, step: 0.02, default: this.shape, onChange: rebuild('shape') },
      { type: 'slider', id: 'dartRate', label: 'Darts / second (spherical)', min: 5, max: 200, step: 5, default: this.dartRate, onChange: (v) => { this.dartRate = v; } },
      // The wall law decides whether the BALL is an instrument or a demo of failure.
      // It changes no headline label, so it needs no controls rebuild — just a clean
      // restart of the ball's clock (the darts keep their own tally running).
      { type: 'select', id: 'wallLaw', label: 'Ball wall law (spherical)', highlight: true, default: this.wallLaw,
        options: [{ value: 'rough', label: 'Rough — cosine law (equidistributes)' }, { value: 'mirror', label: 'Mirror — specular (does NOT)' }],
        onChange: (v) => { this.wallLaw = v; this._resetBall(); } },
      { type: 'slider', id: 'ballRate', label: 'Ball arc / second (spherical)', min: 5, max: 120, step: 5, default: this.ballRate, onChange: (v) => { this.ballRate = v; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 darts, ×50 ball clock', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 40, step: 0.1, default: 10 },
    ];
  }

  reset() {
    super.reset();
    this.trail = [];
    this.finished = false;
    if (this.mode === 'spherical') this._resetSphere();
    else this._resetKaleido();
  }

  _resetKaleido() {
    this.theta = Math.atan(Math.pow(10, -this.n));
    this.tanT = Math.tan(this.theta);
    // display-only: how many chamber copies to DRAW (and whether the tiling is fine
    // enough to skip). The estimator is count/10ⁿ and never reads N.
    this.N = Math.floor(Math.PI / this.theta);
    this.showKaleido = 2 * this.N <= KALEIDO_MAX;
    this.dispTheta = this.showKaleido ? this.theta : Math.max(this.theta, 0.42);
    this.kx = 0.95 * RD;
    this.ky = 0.92 * this.kx * this.tanT;
    this.kvx = -1.0; this.kvy = 0.0;
    this.wall2 = [-Math.sin(this.theta), Math.cos(this.theta)];
  }

  _resetSphere() {
    const cg = chamberGeometry(this.shape);
    this.normals = cg.normals;
    this.verts = cg.verts;
    this.cutV = cg.cutN;
    this.midM = cg.M;
    this.S = cg.S;
    this.ST = cg.ST;
    // flat scalar copies so the billiard inner loop allocates nothing per bounce
    this.nrmFlat = this.nrmFlat || new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.nrmFlat[i * 3 + j] = this.normals[i][j];
    this.cutFlat = this.cutFlat || new Float64Array(3);
    for (let j = 0; j < 3; j++) this.cutFlat[j] = this.cutV[j];
    this.dartInside = 0;
    this.dartTotal = 0;
    this.dartCut = 0;
    this.visibleCount = 0;
    this.dartCarry = 0; this.turboCarry = 0;
    this.nextMilestone = 1;
    this._dartsDirty = true;
    this._resetBall();
    if (this.dartPos) this.dartPos.fill(0);
  }

  // The ball's own clock. Speed is fixed at 1, so ARC LENGTH IS ELAPSED TIME — that is
  // what makes ballIn/ballTime a genuine time average and not a per-event average.
  _resetBall() {
    this.bpos = this.bpos || new Float64Array(3);
    this.bvel = this.bvel || new Float64Array(3);
    this.ballIn = 0;
    this.ballTime = 0;
    this.ballBounces = 0;
    this.ballEscapes = 0;
    this.lastWall = -1;
    this.traceCount = 0;
    this.traceHead = 0;
    this.traceCarry = 0;
    this.traceStride = 0.05;
    this._traceDirty = true;
    if (this.tracePos) this.tracePos.fill(0);
    this._homeBilliard();
  }

  _homeBilliard() {
    const [A, B, C] = this.verts, p = this.bpos;
    const x = A[0] + B[0] + C[0], y = A[1] + B[1] + C[1], z = A[2] + B[2] + C[2];
    const m = Math.hypot(x, y, z) || 1;
    p[0] = x / m; p[1] = y / m; p[2] = z / m;
    this._setVel(0.7, 0.2, -0.5);
    this.lastWall = -1;
  }

  // write a unit tangent direction at bpos into bvel, in place
  _setVel(x, y, z) {
    const p = this.bpos, v = this.bvel;
    const d = x * p[0] + y * p[1] + z * p[2];
    x -= d * p[0]; y -= d * p[1]; z -= d * p[2];
    const m = Math.hypot(x, y, z) || 1;
    v[0] = x / m; v[1] = y / m; v[2] = z / m;
  }

  step(dt) {
    if (this.finished) return false;
    return this.mode === 'spherical' ? this._stepSphere(dt) : this._stepKaleido(dt);
  }

  _stepKaleido(dt) {
    let remaining = dt, collided = false;
    while (remaining > 1e-12) {
      let tLower = Infinity;
      if (this.kvy < -1e-12) { const t = -this.ky / this.kvy; if (t > -1e-10) tLower = Math.max(0, t); }
      let tUpper = Infinity;
      const denom = this.kvy - this.kvx * this.tanT;
      if (denom > 1e-12) {
        const t = (this.kx * this.tanT - this.ky) / denom;
        const ct = Math.max(0, t);
        if (t > -1e-10 && this.kx + this.kvx * ct > 0) tUpper = ct;
      }
      const tNext = Math.min(tLower, tUpper);
      if (!Number.isFinite(tNext) || tNext > remaining) {
        this.kx += this.kvx * remaining; this.ky += this.kvy * remaining;
        this._pushTrail(this.kx, this.ky);
        if (!Number.isFinite(tNext)) this.finished = true;
        break;
      }
      this.kx += this.kvx * tNext; this.ky += this.kvy * tNext;
      remaining -= tNext;
      if (tLower <= tUpper) { this.ky = 0; this.kvy = -this.kvy; }
      else {
        const d = this.kvx * this.wall2[0] + this.kvy * this.wall2[1];
        this.kvx -= 2 * d * this.wall2[0]; this.kvy -= 2 * d * this.wall2[1];
        this.ky = this.kx * this.tanT;
      }
      this.collisionCount++;
      collided = true;
      this._pushTrail(this.kx, this.ky);
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
    }
    return collided;
  }

  _stepSphere(dt) {
    const t = dt * TIME_SCALE;
    let threw = false;
    this.dartCarry += this.dartRate * t;
    let m = Math.floor(this.dartCarry); this.dartCarry -= m;
    for (; m > 0; m--) { this._throwDart(true); threw = true; }
    if (this.turbo) {
      this.turboCarry += TURBO_RATE * t;
      let k = Math.floor(this.turboCarry); this.turboCarry -= k;
      if (k > 0) threw = true;
      for (let i = 0; i < k; i++) this._throwDart(false);
    }
    // The ball's clock advances in the same board-seconds the darts use. Speed is 1,
    // so this arc budget IS the elapsed time credited to the occupancy average.
    const boost = this.turbo ? BALL_TURBO : 1;
    this.traceStride = 0.05 * boost;
    this._advanceBilliard(t * this.ballRate * boost);
    this.collisionCount = this.dartTotal;
    if (this.dartTotal >= this.nextMilestone) {
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.dartTotal + 1, Math.ceil(this.dartTotal * 1.02));
    }
    return threw;
  }

  _throwDart(visible) {
    const p = sampleSphere();
    const inside = dot(this.normals[0], p) >= 0 && dot(this.normals[1], p) >= 0 && dot(this.normals[2], p) >= 0;
    this.dartTotal++;
    // dartCut is NOT part of the dart π estimate. It is the rejection-sampled twin of
    // the ball's occupancy g, so that |g − dartCut/dartInside| is a live, π-free test
    // of whether the ball is really equidistributing.
    if (inside) { this.dartInside++; if (dot(this.cutV, p) >= 0) this.dartCut++; }
    if (visible && this.dartPos && this.visibleCount < MAX_DARTS) {
      const i = this.visibleCount++;
      this.dartPos[i * 3] = p[0]; this.dartPos[i * 3 + 1] = p[1]; this.dartPos[i * 3 + 2] = p[2];
      const c = inside ? [0.49, 0.99, 0.54] : [0.32, 0.34, 0.46];
      this.dartCol[i * 3] = c[0]; this.dartCol[i * 3 + 1] = c[1]; this.dartCol[i * 3 + 2] = c[2];
      this._dartsDirty = true;
    }
  }

  // ---- the ball as an INSTRUMENT ---------------------------------------------
  // The ball is the card's SECOND π machine and shares no counter with the darts.
  // An equidistributing trajectory dwells in a sub-region in proportion to its AREA,
  // so the fraction of TIME spent inside the sub-triangle ABM measures area(ABM)/
  // area(ABC), and Girard turns that fraction into π exactly as f does for the darts.
  //
  // Three things have to be right for that fraction to be unbiased, and all three are
  // done in closed form below rather than by sampling:
  //  1. TIME, not events. Speed is 1, so arc length is elapsed time; a geodesic at
  //     constant speed sweeps equal arc in equal time, so weighting by arc length IS
  //     weighting by time. Averaging over BOUNCES instead would weight by collision
  //     count, which is not area-uniform — that is the classic way to get this wrong.
  //  2. No step-size bias. Over each free flight the indicator of the test region is
  //     integrated EXACTLY (see _cutArc), so the answer does not depend on dt, on the
  //     frame rate, or on where a chunk boundary happens to fall.
  //  3. Equidistribution itself. Specular walls do NOT deliver it here (verified: see
  //     the wall-law control and the on-screen darts-vs-ball check). Rough walls do.

  // Exact arc-length measure of {a ∈ [0,L] : Ac·cos a + Bc·sin a ≥ 0}, for L ≤ π.
  // Ac·cos a + Bc·sin a = R·cos(a − φ) has zeros exactly π apart, so a window no
  // longer than π contains at most ONE sign change and atan2 locates it in closed
  // form: descending zero at atan2(Ac, −Bc), ascending at atan2(−Ac, Bc), both landing
  // in [0, π] for the relevant sign of Ac. Free flights here are ≤ π by construction
  // (that is exactly what _wallArc returns), so this is exact — and π-free.
  _cutArc(Ac, Bc, L) {
    if (L <= 0) return 0;
    if (Ac > 0) { const aD = Math.atan2(Ac, -Bc); return aD < L ? aD : L; }
    if (Ac < 0) { const aU = Math.atan2(-Ac, Bc); return aU >= L ? 0 : L - aU; }
    return Bc > 0 ? L : 0;
  }

  // Arc to the next crossing of the wall plane with inward normal n: the first zero of
  // A·cos a + B·sin a at which it is DESCENDING, i.e. atan2(A, −B) ∈ [0, π]. A ≥ 0
  // inside the chamber; clamping the numerical −1e-17 up to 0 keeps a just-reflected
  // wall returning π (the antipodal re-crossing) instead of a spurious −π.
  _wallArc(A, B) { return Math.atan2(A > 0 ? A : 0, -B); }

  _advanceBilliard(arc) {
    if (!(arc > 0) || !this.bpos) return;
    const p = this.bpos, v = this.bvel, ns = this.nrmFlat, cn = this.cutFlat;
    const rough = this.wallLaw !== 'mirror';
    let rem = arc, guard = 0;
    while (rem > 1e-12 && guard++ < 64) {
      let best = Infinity, bi = -1;
      for (let i = 0; i < 3; i++) {
        const o = i * 3;
        const A = ns[o] * p[0] + ns[o + 1] * p[1] + ns[o + 2] * p[2];
        const B = ns[o] * v[0] + ns[o + 1] * v[1] + ns[o + 2] * v[2];
        const a = this._wallArc(A, B);
        if (a < 1e-7 && i === this.lastWall) continue;   // numerical re-hit of the wall just left
        if (a < best) { best = a; bi = i; }
      }
      const hit = bi >= 0 && best <= rem;
      const L = hit ? best : rem;
      // exact time-in-test-region over this free flight, then exact time
      this.ballIn += this._cutArc(
        cn[0] * p[0] + cn[1] * p[1] + cn[2] * p[2],
        cn[0] * v[0] + cn[1] * v[1] + cn[2] * v[2], L);
      this.ballTime += L;
      // advance along the great circle (exact rotation in the (p, v) plane)
      const cs = Math.cos(L), sn = Math.sin(L);
      const px = cs * p[0] + sn * v[0], py = cs * p[1] + sn * v[1], pz = cs * p[2] + sn * v[2];
      const vx = -sn * p[0] + cs * v[0], vy = -sn * p[1] + cs * v[1], vz = -sn * p[2] + cs * v[2];
      const m = Math.hypot(px, py, pz) || 1;
      p[0] = px / m; p[1] = py / m; p[2] = pz / m;
      this._setVel(vx, vy, vz);
      this.traceCarry += L;
      if (this.traceCarry >= this.traceStride) { this.traceCarry = 0; this._recordTrace(); }
      if (!hit) break;
      rem -= best;
      const o = bi * 3, nx = ns[o], ny = ns[o + 1], nz = ns[o + 2];
      // re-seat exactly on the wall plane so drift cannot leak the ball out
      const dp = nx * p[0] + ny * p[1] + nz * p[2];
      const qx = p[0] - dp * nx, qy = p[1] - dp * ny, qz = p[2] - dp * nz;
      const qm = Math.hypot(qx, qy, qz) || 1;
      p[0] = qx / qm; p[1] = qy / qm; p[2] = qz / qm;
      if (rough) {
        // Knudsen's cosine law. On the wall n·p = 0, so n is itself tangent to the
        // sphere at p and {n, p×n} is an orthonormal tangent frame. Drawing sin θ
        // uniform on (−1,1) about the inward normal IS the cosine law — a sqrt and a
        // uniform, no trig and no π — and it is what makes the uniform (Liouville)
        // measure stationary, hence the time-average equal to area.
        const wx = p[1] * nz - p[2] * ny, wy = p[2] * nx - p[0] * nz, wz = p[0] * ny - p[1] * nx;
        const s = 2 * Math.random() - 1, ct = Math.sqrt(1 - s * s);
        this._setVel(ct * nx + s * wx, ct * ny + s * wy, ct * nz + s * wz);
      } else {
        const vn = v[0] * nx + v[1] * ny + v[2] * nz;
        this._setVel(v[0] - 2 * vn * nx, v[1] - 2 * vn * ny, v[2] - 2 * vn * nz);
      }
      this.lastWall = bi; this.ballBounces++;
    }
    // Escape guard. Re-homing would bias the average, so it is counted and disclosed;
    // in offline runs of 4·10⁵ arc units at every shape setting it never fired.
    if (ns[0] * p[0] + ns[1] * p[1] + ns[2] * p[2] < -1e-6 ||
        ns[3] * p[0] + ns[4] * p[1] + ns[5] * p[2] < -1e-6 ||
        ns[6] * p[0] + ns[7] * p[1] + ns[8] * p[2] < -1e-6) {
      this.ballEscapes++; this._homeBilliard();
    }
  }

  // display-only breadcrumb ring: shows the orbit filling the chamber (rough walls) or
  // clinging to a thin family of great circles (mirror walls). Feeds no estimate.
  _recordTrace() {
    if (!this.tracePos) return;
    const i = this.traceHead * 3, p = this.bpos;
    this.tracePos[i] = p[0]; this.tracePos[i + 1] = p[1]; this.tracePos[i + 2] = p[2];
    this.traceHead = (this.traceHead + 1) % TRACE_MAX;
    if (this.traceCount < TRACE_MAX) this.traceCount++;
    this._traceDirty = true;
  }

  _pushTrail(x, y) {
    this.trail.push([x, y]);
    if (this.trail.length > this.maxTrailLength) this.trail.shift();
  }
  _polar(x, y) {
    return { r: Math.min(Math.hypot(x, y), RD), phi: Math.max(0, Math.min(this.theta, Math.atan2(Math.max(0, y), x))) };
  }
  _writeTrail(map) {
    const arr = this.trailGeom.attributes.position.array;
    const cnt = Math.min(this.trail.length, this.maxTrailLength);
    for (let i = 0; i < cnt; i++) {
      const [tx, ty] = map(this.trail[i][0], this.trail[i][1]);
      arr[i * 3] = tx; arr[i * 3 + 1] = ty; arr[i * 3 + 2] = 0;
    }
    this.trailGeom.attributes.position.needsUpdate = true;
    this.trailGeom.setDrawRange(0, cnt);
  }

  // pi = S/(1+4f) is exact; the darts only estimate f, so convergence is statistical.
  getSphereEstimate() { return this.dartTotal ? this.S / (1 + 4 * (this.dartInside / this.dartTotal)) : 0; }

  // The ball's independent estimate, through the SAME Girard step as the darts:
  //   darts: area(chamber)   = S  − π   and   area(chamber) = f · (whole sphere, 4π)
  //          ⇒ S − π = 4πf ⇒ π = S / (1 + 4f)
  //   ball : area(sub-tri)   = S_T − π  and   area(sub-tri) = g · area(chamber)
  //          ⇒ S_T − π = g·(S − π) ⇒ π = (S_T − g·S) / (1 − g)
  // Same theorem, same chamber; one reads a count of darts, the other reads a clock.
  // S and S_T are sums of arccos of measured dot products, g is a measured time
  // fraction — no π enters on either side.
  getBallOccupancy() { return this.ballTime > 0 ? this.ballIn / this.ballTime : 0; }
  getBallEstimate() {
    if (!(this.ballTime > 0)) return 0;
    const g = this.ballIn / this.ballTime;
    return g < 1 ? (this.ST - g * this.S) / (1 - g) : 0;
  }

  // Live, π-free equidistribution verdict. The darts measure the same area ratio the
  // ball's clock does, by rejection sampling — a method whose fairness is not in
  // question — so the two must agree to within their combined 1/√N noise. σ_dart is
  // the binomial error on dartCut/dartInside; σ_ball is the measured 0.4/√(arc) noise
  // of the occupancy. A gap past 6σ is reported as a failure to equidistribute rather
  // than quietly folded into a π readout.
  getErgodicityCheck() {
    const g = this.getBallOccupancy();
    const r = this.dartInside > 0 ? this.dartCut / this.dartInside : 0;
    const sD = this.dartInside > 0 ? Math.sqrt(Math.max(r * (1 - r), 1e-9) / this.dartInside) : 1;
    const sB = this.ballTime > 0 ? BALL_SIGMA / Math.sqrt(this.ballTime) : 1;
    const tol = 6 * Math.hypot(sD, sB);
    const ready = this.dartInside >= 20000 && this.ballTime >= 2000;
    const dev = Math.abs(g - r);
    return { g, r, dev, tol, ready, fail: ready && dev > tol };
  }
  getKaleidoEstimate() { return this.collisionCount / Math.pow(10, this.n); }
  getPiApproximation() { return this.mode === 'spherical' ? this.getSphereEstimate() : this.getKaleidoEstimate(); }
  getCountLabel() { return this.mode === 'spherical' ? 'Darts thrown' : 'Reflections'; }

  // ---- honest per-mode badge / headline --------------------------------------
  // Hub badge vocabulary (js/hub.js CONVERGENCE_BADGES): exact | statistical |
  // biased | experimental | extension | legacy. This card carries BOTH kinds of
  // machine, so one static value cannot be honest for both: the flat kaleidoscope
  // really does yield exact digits (count × atan(10⁻ⁿ)), while the spherical chamber
  // samples the area fraction f with random darts and its error falls only like
  // 1/√N (measured: rms relative error ≈2e-3 over six runs of 3·10⁵ darts — right at
  // the 1/√N = 1.8e-3 scale, and nowhere near "exact digits").
  // The hub CARD is built from the STATIC piNature, which is 'statistical' — the mode
  // the card opens in — and this instance override reports the mode actually running.
  getPiNature() { return this.mode === 'kaleidoscope' ? 'exact' : this.constructor.piNature; }
  getPiLabel() { return this.mode === 'kaleidoscope' ? 'π ≈ (exact)' : 'π ≈ (1/√N)'; }

  // ControlPanel.build() reads getCountLabel()/getPiLabel() once, so ask for a
  // rebuild only when the mode switch actually changed the headline (a rebuild
  // resets the shared Trail/Grid/Step toggles, so never do it for nothing).
  _headlineKey() { return `${this.getCountLabel()}|${this.getPiLabel()}`; }
  _syncHeadline() {
    const key = this._headlineKey();
    if (key === this._lastHeadline) return;
    this._lastHeadline = key;
    this.notifyControlsChanged();
  }
  getPiReadout() {
    if (this.mode === 'spherical') return this.dartInside > 0 ? this.getSphereEstimate().toFixed(6) : 'collecting…';
    return this.getKaleidoEstimate().toFixed(this.n + 2);
  }

  getFormulaHTML() {
    if (this.mode === 'spherical') {
      const f = this.dartTotal ? this.dartInside / this.dartTotal : 0;
      const piD = this.getSphereEstimate();
      const piB = this.getBallEstimate();
      const chk = this.getErgodicityCheck();
      const mirror = this.wallLaw === 'mirror';
      const dartLive = this.dartInside > 0 ? piDigitsHTML(piD, 4) : 'collecting…';
      const ballLive = this.ballTime > 0 && piB > 0 ? piDigitsHTML(piB, 4) : 'collecting…';
      // the chamber area, reported from the live dart estimate rather than a built-in π
      const areaLive = this.dartInside > 0 ? (this.S - piD).toFixed(5) : '—';
      const gap = (this.dartInside > 0 && piB > 0) ? Math.abs(piD - piB) : null;
      const verdict = mirror
        ? `<span class="f-muted" style="color:#e94560"><b>mirror walls — not a measurement.</b> A specular geodesic billiard in a great-circle triangle does <b>not</b> equidistribute: its orbit stays on a thin family of great circles, so the time-average settles fast onto the <b>wrong</b> area fraction. Measured at every shape setting: the occupancy misses by 0.0024 at shape 0, 0.011 at 0.5, and 0.16 at 0.8, where the ball is trapped bouncing between just two walls. Live evidence: g = ${chk.g.toFixed(5)} vs the darts' ${chk.r.toFixed(5)}, gap ${chk.dev.toExponential(2)} against ${chk.tol.toExponential(2)} of noise${chk.fail ? ' — <b>already past tolerance</b>' : ' (at small shape the miss is real but still under the noise floor; run longer)'}. The π beside it is shown only so the failure is visible.</span>`
        : chk.fail
          ? `<span class="f-muted" style="color:#e94560"><b>⚠ not equidistributing:</b> the ball's occupancy g and the darts' rejection-sampled ratio differ by ${chk.dev.toExponential(2)}, past the ${chk.tol.toExponential(2)} the combined 1/√N noise allows. The ball's π is not trustworthy here.</span>`
          : chk.ready
            ? `<span class="f-muted">two instruments, no shared counter, same answer: occupancy g = <b>${chk.g.toFixed(5)}</b> vs the darts' rejection-sampled ${chk.r.toFixed(5)} — a gap of ${chk.dev.toExponential(2)} against ${chk.tol.toExponential(2)} of combined 1/√N noise. <b>That agreement IS ergodicity</b>: to the precision reached so far, the ball really does dwell in proportion to area.</span>`
            : `<span class="f-muted">collecting — the darts-vs-ball equidistribution check needs 20k inside darts and 2000 arc units (now ${this.dartInside} and ${this.ballTime.toFixed(0)}). Turbo speeds both.</span>`;
      // ONE top-level block: .formula-readout is a flex row, so anything returned at
      // top level would be laid out side by side.
      return `
      <div style="display:block;width:100%">
        <strong>spherical chamber — Girard surplus, measured twice</strong><br>
        <span class="f-angle">S = Σ arccos(−nⱼ·nₖ) = ${this.S.toFixed(5)}</span>,
        <span class="f-angle">S_T = ${this.ST.toFixed(5)}</span>,
        area = S − π̂ = <span class="f-count">${areaLive}</span>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px 12px;margin-top:5px">
          <div>
            <b>darts — rejection sampling</b><br>
            f = inside/total = <span class="f-count">${f.toFixed(5)}</span><br>
            <span class="f-result">π</span> = S/(1+4f) = <span style="font-size:1.05em">${dartLive}</span><br>
            <span class="f-muted">${this.dartTotal} darts, Marsaglia sqrt-only</span>
          </div>
          <div>
            <b>ball — ergodic time-average</b><br>
            g = time inside / total time = <span class="f-count">${chk.g.toFixed(5)}</span><br>
            <span class="f-result">π</span> = (S_T − g·S)/(1 − g) = <span style="font-size:1.05em">${ballLive}</span><br>
            <span class="f-muted">${this.ballTime.toFixed(0)} arc units, ${this.ballBounces} bounces, ${mirror ? 'mirror' : 'rough'} walls${this.ballEscapes ? `, ${this.ballEscapes} escapes` : ''}</span>
          </div>
        </div>
        <div style="margin-top:4px">
          ${gap === null ? '' : `disagreement |π̂<sub>darts</sub> − π̂<sub>ball</sub>| = <span class="f-count">${gap.toExponential(2)}</span><br>`}
          ${verdict}
        </div>
        <span class="f-muted">Neither instrument is handed π: the darts are sqrt-only, the ball's wall scattering draws sin θ uniform (sqrt only), and its occupancy is integrated in closed form along each great-circle arc — arc length is elapsed time at unit speed, so equal arc is equal time and the average is a true TIME average, never a per-bounce one.</span>
      </div>
      `;
    }
    const N = this.collisionCount;
    const val = N * this.theta;
    return `
      <strong>slope-made mirror angle</strong>:
      <span class="f-angle">θ = atan(10⁻${this.n})</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${N}</span> · <span class="f-angle">${this.theta.toFixed(6)}</span> =
      <span class="f-result">${val.toFixed(6)}</span>
      <br><span style="font-size:1.1em">π = ${piDigitsHTML(this.getKaleidoEstimate(), this.n + 2)}</span>
      <br><span class="f-muted">${this.showKaleido
        ? `dihedral kaleidoscope: ${2 * this.N} chamber copies tile the disk; the straight unfolded ray crosses ${this.N} of them before sweeping π. θ from a slope 10⁻${this.n}, never π/k.`
        : `θ = ${this.theta.toFixed(6)} rad gives 2·${this.N} ≈ ${2 * this.N} chambers — too fine to tile; showing the live wedge (opening exaggerated for visibility).`}</span>
    `;
  }

  getPhaseSpaceViews() {
    return [
      { id: 'convergence', label: 'log darts/reflections vs estimate error', dimension: 2, primary: true, boundary: 'none', axisLabels: { x: 'log₁₀ count', y: '(π̂ − π)/π' } },
      { id: 'geometry', label: 'chamber sweep / measuring ball path', dimension: 2, axisLabels: { x: 'x', y: 'y' } },
    ];
  }

  getPhasePoint() {
    // display-only: the convergence view plots the signed error against true π, and
    // the π-sweep arc below is drawn against it. Neither feeds getPiApproximation().
    const est = this.getPiApproximation() || Math.PI;
    const cx = clamp1(Math.log10(Math.max(this.collisionCount, 1)) / 4 * 2 - 1);
    const cy = clamp1((est - Math.PI) / Math.PI * 8);
    // geometry view: the measuring ball's own xy (spherical) — this trace IS the second
    // instrument's raw signal — or the π-sweep semicircle (kaleidoscope)
    let gx = 0, gy = 0;
    if (this.mode === 'spherical') { if (this.bpos) { gx = clamp1(this.bpos[0]); gy = clamp1(this.bpos[1]); } }
    else { const a = Math.min(Math.PI, this.collisionCount * this.theta); gx = Math.cos(a); gy = Math.sin(a); }
    return [cx, cy, gx, gy];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'geometry') return (pt) => [pt[2] || 0, pt[3] || 0];
    return (pt) => [pt[0], pt[1]];
  }

  getPreviewBox() {
    if (this.mode === 'spherical') return null;
    return { x0: -1.1, x1: 1.1, y0: -1.1, y1: 1.1 };
  }

  initSimScene() {
    this.simScene.clear();
    if (this.mode === 'spherical') { this._initSphere(); return; }
    if (this.showKaleido) this._initKaleido(); else this._initWedge();
  }

  _addTrailLine(color, cap) {
    const pos = new Float32Array(cap * 3);
    this.trailGeom = new THREE.BufferGeometry();
    this.trailGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trailGeom.setDrawRange(0, 0);
    this.trailLine = new THREE.Line(this.trailGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
    this.simScene.add(this.trailLine);
  }

  _initKaleido() {
    this.simCamera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 10);
    this.simCamera.position.z = 1;
    const th = this.theta, twoN = 2 * this.N;
    // Alternating-colored chamber copies (two fan meshes) + radial mirror lines.
    const evenP = [], oddP = [];
    for (let s = 0; s < twoN; s++) {
      const a0 = s * th, a1 = (s + 1) * th;
      const tri = [0, 0, 0, RD * Math.cos(a0), RD * Math.sin(a0), 0, RD * Math.cos(a1), RD * Math.sin(a1), 0];
      (s % 2 === 0 ? evenP : oddP).push(...tri);
    }
    const fan = (arr, color, op) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide }));
      m.position.z = -0.02; this.simScene.add(m);
    };
    fan(evenP, 0x4cc9f0, 0.14);
    fan(oddP, 0x7c5cff, 0.12);
    const lineP = [];
    for (let k = 0; k <= twoN; k++) { const a = k * th; lineP.push(0, 0, 0, RD * Math.cos(a), RD * Math.sin(a), 0); }
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lineP, 3)),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a, transparent: true, opacity: 0.55 })));
    for (const a of [0, th]) this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(   // real walls bright
      [new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(RD * Math.cos(a), RD * Math.sin(a), 0.01)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })));
    const rim = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2; rim.push(new THREE.Vector3(RD * Math.cos(a), RD * Math.sin(a), 0)); }
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineBasicMaterial({ color: 0x2a2a4a })));
    this.images = []; // one ghost image per chamber copy
    for (let i = 0; i < twoN; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.016, 12), new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.4 }));
      m.position.z = 0.03; this.simScene.add(m); this.images.push(m);
    }
    this._addTrailLine(0x4cc9f0, this.maxTrailLength);
    this.ballMesh = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.ballMesh.position.z = 0.05; this.simScene.add(this.ballMesh);
    // Unfolded straight ray: one chamber per reflection, sweeps toward π.
    this.ghost = new THREE.Mesh(new THREE.CircleGeometry(0.028, 24), new THREE.MeshBasicMaterial({ color: 0x7CFC8A }));
    this.ghost.position.z = 0.06; this.simScene.add(this.ghost);
    this.ghostLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7CFC8A, transparent: true, opacity: 0.6 }));
    this.simScene.add(this.ghostLine);
    this.ghostPts = [];
  }

  _initWedge() {
    const td = this.dispTheta;
    const top = Math.max(0.5, RD * Math.sin(td) * 1.15);
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.1, top, -0.1, 0.1, 10);
    this.simCamera.position.z = 1;
    for (const a of [0, td]) this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(RD * Math.cos(a), RD * Math.sin(a), 0)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })));
    const arc = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * td; arc.push(new THREE.Vector3(RD * Math.cos(a), RD * Math.sin(a), 0)); }
    this.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5 })));
    this._addTrailLine(0x4cc9f0, this.maxTrailLength);
    this.ballMesh = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
    this.ballMesh.position.z = 0.05; this.simScene.add(this.ballMesh);
    this.images = null; this.ghost = null;
  }

  _greatCircleArc(p, q, color) {
    const w = Math.acos(clamp1(dot(p, q))) || 1e-3, sw = Math.sin(w);
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const s = i / 48;
      const a = Math.sin((1 - s) * w) / sw, b = Math.sin(s * w) / sw;
      pts.push(new THREE.Vector3(a * p[0] + b * q[0], a * p[1] + b * q[1], a * p[2] + b * q[2]));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, linewidth: 2 }));
  }

  _initSphere() {
    this.simCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    this.simCamera.position.set(2.1, 1.4, 1.9);
    this.simCamera.lookAt(0, 0, 0);
    this.simScene.add(new THREE.Mesh(new THREE.SphereGeometry(0.995, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x16213e, wireframe: true, transparent: true, opacity: 0.2 })));
    // Three triangle edges in distinct colors (edge i opposite vertex i) + white vertices.
    const [A, B, C] = this.verts;
    this.simScene.add(this._greatCircleArc(B, C, 0xe94560));
    this.simScene.add(this._greatCircleArc(C, A, 0x4cc9f0));
    this.simScene.add(this._greatCircleArc(A, B, 0xf7c948));
    for (const v of this.verts) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(v[0], v[1], v[2]); this.simScene.add(m);
    }
    // Pooled dart cloud: vertex colors green inside / dim outside; statistics run past the cap.
    this.dartPos = this.dartPos || new Float32Array(MAX_DARTS * 3);
    this.dartCol = this.dartCol || new Float32Array(MAX_DARTS * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.dartPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.dartCol, 3));
    g.setDrawRange(0, this.visibleCount);
    this.dartGeom = g;
    this.simScene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.028, vertexColors: true, transparent: true, opacity: 0.9 })));
    // The cut the ball is timed against: the great-circle arc from A to the midpoint
    // of BC. Everything on the B side of it is the test region.
    this.simScene.add(this._greatCircleArc(this.verts[0], this.midM, 0x7CFC8A));
    // Ball breadcrumb ring — display only, but it is what makes equidistribution (or
    // its failure under mirror walls) visible: a filled triangle vs a few thin circles.
    this.tracePos = this.tracePos || new Float32Array(TRACE_MAX * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracePos, 3));
    tg.setDrawRange(0, this.traceCount);
    this.traceGeom = tg;
    this.simScene.add(new THREE.Points(tg, new THREE.PointsMaterial({ color: 0xffd166, size: 0.014, transparent: true, opacity: 0.55 })));
    // The billiard itself — the card's SECOND instrument, not decoration.
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    this.simScene.add(this.ballMesh);
  }

  updateSimScene() {
    if (!this.ballMesh) return;
    if (this.mode === 'spherical') { this._updateSphere(); return; }
    if (this.showKaleido) this._updateKaleido(); else this._updateWedge();
  }

  _updateKaleido() {
    const th = this.theta;
    const { r, phi } = this._polar(this.kx, this.ky);
    this.ballMesh.position.set(r * Math.cos(phi), r * Math.sin(phi), 0.05);
    // Dihedral images at angles 2k·θ ± φ tile the disk around the real ball.
    let idx = 0;
    for (let k = 0; k < this.N; k++) for (const sgn of [1, -1]) {
      const m = this.images[idx++]; if (!m) continue;
      const a = 2 * k * th + sgn * phi;
      m.position.set(r * Math.cos(a), r * Math.sin(a), 0.03);
    }
    this._writeTrail((x, y) => { const p = this._polar(x, y); return [p.r * Math.cos(p.phi), p.r * Math.sin(p.phi)]; });
    // Unfolded straight ray: one chamber per reflection, sweeping toward π.
    const m = this.collisionCount;
    const gAng = (m % 2 === 0) ? m * th + phi : (m + 1) * th - phi;
    const gx = r * Math.cos(gAng), gy = r * Math.sin(gAng);
    this.ghost.position.set(gx, gy, 0.06);
    if (m === 0) this.ghostPts.length = 0;
    this.ghostPts.push(gx, gy);
    if (this.ghostPts.length > 400) this.ghostPts.splice(0, this.ghostPts.length - 400);
    const gp = []; for (let i = 0; i < this.ghostPts.length; i += 2) gp.push(new THREE.Vector3(this.ghostPts[i], this.ghostPts[i + 1], 0.055));
    this.ghostLine.geometry.setFromPoints(gp);
  }

  _updateWedge() {
    const map = (x, y) => { const { r, phi } = this._polar(x, y); const pd = (phi / this.theta) * this.dispTheta; return [r * Math.cos(pd), r * Math.sin(pd)]; };
    const [bx, by] = map(this.kx, this.ky);
    this.ballMesh.position.set(bx, by, 0.05);
    this._writeTrail(map);
  }

  _updateSphere() {
    if (this._dartsDirty && this.dartGeom) {
      this.dartGeom.attributes.position.needsUpdate = true;
      this.dartGeom.attributes.color.needsUpdate = true;
      this.dartGeom.setDrawRange(0, this.visibleCount);
      this._dartsDirty = false;
    }
    if (this._traceDirty && this.traceGeom) {
      this.traceGeom.attributes.position.needsUpdate = true;
      this.traceGeom.setDrawRange(0, this.traceCount);
      this._traceDirty = false;
    }
    if (this.bpos) this.ballMesh.position.set(this.bpos[0], this.bpos[1], this.bpos[2]);
  }
}

registerSim(CoxeterChamberExplorer);
