import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so rescale to make the drop-rate slider read in drops per wall-clock
// second at speed 1 / 60 fps (same convention as GaltonBoardPi).
const TIME_SCALE = 16.7;

// Cauchy–Crofton: for ANY planar curve of length L dropped at a uniform-random
// position and orientation on a floor ruled with lines spaced d apart, the
// EXPECTED number of crossings is E[X] = 2L/(πd) — independent of the shape.
// Only the length matters, so  π = 2L / (d · ⟨crossings⟩).  The circle of
// diameter d is the proof case: it ALWAYS crosses exactly twice, pinning the
// constant to 2. (Its own length πd already contains π, so it demonstrates the
// constant rather than computing π; the honest π-from-length estimators are the
// needle / bent / tangle, whose lengths are π-free Euclidean sums.)
//
// This sim has three orthogonal knobs on top of the shape library:
//   MODE      π (Cauchy–Crofton)  |  dimension (fractal-D)  |  race (4 estimators)
//   SIZE      fixed                |  exponential (random per-drop scale of ANY shape)
//   SAMPLING  iid                  |  mcmc (an evolving Markov chain of pins)
// Default (π + fixed + iid) reproduces the original behaviour exactly.

const CIRCLE_SEGS = 72;
const RACE_VIS = 150;        // scattered colour-coded needles kept on the floor (ring buffer)
const RACE_LOBE_CAP = 2600;  // crossing-points painted per estimator into the phase disc

export class BuffonNeedle extends Simulation {
  static id = 'buffon-needle';
  static title = 'Buffon Noodle — π from the length of any curve';
  static description = 'Drop any curve on a ruled floor: crossings ∝ length reveal π (Cauchy–Crofton); or sweep the ruler to read a fractal dimension';
  static piMechanism = 'statistical: crossings of ANY curve average to E[X] = 2L/(πd)';
  static rigor = 'Statistical';
  static sortOrder = 62;
  static alternatives = [{ id: 'buffon-cross-grid', label: 'Cross-grid variant' }];
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 8;    // hub thumbnail: pool filled with a spread of drops
  static explanation = {
    setup: 'Drop a curve — a straight needle, a bent V, a random tangle, a Koch fractal, a quadratic (Minkowski) Koch, a tunable-angle Cesàro curve, a Sierpiński arrowhead, an Archimedean spiral, a {7/3} star, or a circle — onto a floor ruled with lines spaced d apart. Each drop lands at a uniform-random position and orientation. The Mode knob switches between measuring π (Cauchy–Crofton), measuring the curve’s fractal DIMENSION (Richardson), and a RACE of four estimators converging to π at once. Size can be fixed or exponential (a random per-drop scale of ANY shape — the neutron-transport track-length idea), and Sampling can be i.i.d. drops or an evolving MCMC chain of pins.',
    insight: 'Cauchy–Crofton: the expected number of line crossings is E[X] = 2L/(πd), where L is the curve’s length. This depends ONLY on the length, not the shape. So π = 2L·drops / (d·crossings). Every shape gives the same π — because only length matters. DIMENSION mode turns this around: the crossing count resolvable at ruler scale d scales as d^(1−D) for a curve of divider dimension D, so E[crossings] ∝ d^(−D). Sweep the ruler over K geometric spacings d_k, resolve the curve to each scale, and the slope of log⟨crossings⟩ vs log(1/d_k) IS the dimension D — 1 for a smooth needle, log4/log3≈1.2619 for the Koch curve, log8/log4=1.5 for the quadratic Koch.',
    contrast: 'The circle of diameter d is the proof case: it always crosses exactly twice, no matter where it lands. That fixed 2 pins the constant to 2/(πd). (The circle’s own length πd already contains π, so it demonstrates the constant rather than computing π independently.)',
    formula: 'π ≈ 2 · length · drops / (spacing · crossings)   |   D = slope of  log⟨crossings⟩ vs log(1/d)',
    getExpected: (params) => {
      const mode = params.mode || 'pi';
      if (mode === 'race') return 'Race mode: four Buffon estimators run at once. All reach π, but the one making more crossings per drop (the longer needle) converges FASTER — the dominant effect. At the long mean, randomising the size (exponential) adds variance and converges slower than fixed; at short mean the Σℓ/Σcross ratio correlation flips that, an honest subtlety. None beats the N^(−1/2) Monte-Carlo rate.';
      if (mode === 'dimension') {
        const sh = params.shapeType || 'needle';
        if (sh === 'fractal') return 'Dimension mode: the Koch curve, resolved to each ruler scale, gives slope D → log4/log3 ≈ 1.2619.';
        if (sh === 'quadric') return 'Dimension mode: the quadratic (Minkowski) Koch gives slope D → log8/log4 = 1.5.';
        if (sh === 'cesaro') return 'Dimension mode: the Cesàro curve has a TUNABLE dimension D = log2/log(2·cos θ); the measured slope tracks it as you drag the fractal-angle slider, from ≈1 (θ→0) toward 2 (θ→45°).';
        if (sh === 'sierpinski') return 'Dimension mode: the Sierpiński arrowhead gives slope D → log3/log2 ≈ 1.585.';
        return 'Dimension mode: a smooth (rectifiable) curve gives slope D ≈ 1 — no fractal detail to resolve.';
      }
      const shape = params.shapeType || 'needle';
      const exp = (params.lengthMode || 'fixed') === 'exponential';
      if (shape === 'circle' && !exp) return 'Circle of diameter d: exactly 2 crossings every drop, fixing the constant to 2/(πd).';
      if (shape === 'circle' && exp) return 'Random-size circle: with a random diameter it no longer crosses “exactly 2”, but π = 2·Σℓ/(d·Σcrossings) still converges — an honest estimator (its length carries π, so it demonstrates rather than computes it).';
      if (shape === 'fractal') return 'Koch fractal: length base·(4/3)^depth explodes with depth, crossings explode with it, yet π = 2L/(d·crossings) holds — only length matters.';
      if (exp) return 'Exponential size: every drop scales the shape by a random factor, yet π = 2·Σℓ/(d·Σcrossings) still converges — only the MEAN size matters.';
      if ((params.sampling || 'iid') === 'mcmc') return 'MCMC pins: a correlated Markov chain over (y, angle) still recovers π by time-averaging — noisier per sample than i.i.d.';
      return `Shape “${shape}”: crossings average to 2L/(πd); only the total length L matters.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.shapeType = params.shapeType || 'needle';
    this.mode = params.mode || 'pi';                 // 'pi' | 'dimension' | 'race'
    this.lengthMode = params.lengthMode || 'fixed';  // 'fixed' | 'exponential' (SIZE)
    this.sampling = params.sampling || 'iid';        // 'iid' | 'mcmc'
    this.lengthRatio = params.lengthRatio || 0.8;    // MEAN length / spacing (both size modes)
    this.depth = params.depth != null ? params.depth : 3;   // Koch subdivision depth
    // Cesàro/Koch–Peano peak angle θ (degrees). A plain decimal deg→rad factor is
    // used (like the file's hardcoded cos30°/cos(2π/7) decimals) so no Math.PI leaks
    // — and this angle only shapes DIMENSION-mode geometry, never the π estimator.
    this.fractalAngle = params.fractalAngle != null ? params.fractalAngle : 40;
    this.rate = params.rate || 30;
    this.turbo = false;
    this._lastPiLabel = null;        // set after reset(); see _syncPiLabel()

    // Pooled, fixed preallocation sized for the WORST-CASE shape so a deep
    // fractal or a many-turn spiral always fits (no per-frame allocation, no
    // overflow). The densest single drop is a Koch curve of maximum depth.
    this.MAX_SHAPES = 80;
    this.MAX_FRACTAL_VERTS = 4096;         // hard cap on one fractal's vertices
    this.MAX_FRACTAL_DEPTH = 5;            // slider ceiling
    this.SPIRAL_STEPS = 80;               // spiral polyline segments
    // Koch depth 5 = 4^5 = 1024 segments is the densest DRAWN shape; that sets
    // the per-shape segment ceiling used to size the pooled line buffer.
    this.MAX_SEG_PER_SHAPE = Math.max(
      CIRCLE_SEGS, this.SPIRAL_STEPS, Math.pow(4, this.MAX_FRACTAL_DEPTH));
    this.MAX_VERTS = this.MAX_SHAPES * this.MAX_SEG_PER_SHAPE * 2;
    this.MAX_DOTS = 2400;                  // star/fractal produce many crossings/drop

    this.MCMC_POOL = 40;                   // number of evolving pins
    // Scratch needle reused for the exponential-length track estimator so the
    // hot sampling path allocates nothing per drop.
    this._scratchNeedle = { pts: [{ x: -0.1, y: 0 }, { x: 0.1, y: 0 }], closed: false, isCircle: false, length: 0.2 };

    this.reset();
    this._lastPiLabel = this.getPiLabel();
  }

  reset() {
    super.reset();
    this.spacing = 0.25;
    this._buildShape();
    this.tosses = 0;
    this.crossings = 0;      // TOTAL crossings across all drops (can exceed drops)
    this.sumLength = 0;      // Σ length of each dropped curve (π-free for polylines)
    this.collisionCount = 0;
    this.shapes = [];        // recent visible drops (fading pool)
    this.lastPhasePoint = [0, 0];
    this.dropCarry = 0;
    this.turboCarry = 0;
    this.tangleAge = 0;
    this.finished = false;
    this._histReset();
    if (this.mode === 'dimension') this._buildDimLevels();
    if (this.mode === 'race') this._raceInit();
    if (this.sampling === 'mcmc') this._mcmcInit();
  }

  // ---- shape library (all local coords, centred on their centroid) ----------
  _buildShape() {
    const d = this.spacing;
    if (this.shapeType === 'needle') {
      const L = this.lengthRatio * d;               // straight needle, L ≤ d
      this.shape = { pts: [{ x: -L / 2, y: 0 }, { x: L / 2, y: 0 }], closed: false, isCircle: false, length: L };
    } else if (this.shapeType === 'bent') {
      // Two-segment V; total length 1.5d (π-free Euclidean sum). Can cross 0,1,2.
      // Arms rise at 30° from horizontal — components hardcoded, no π literal.
      const s = 0.75 * d;
      const cx = 0.8660254037844387, sy = 0.5; // (cos30°, sin30°)
      const raw = [
        { x: -s * cx, y: s * sy },
        { x: 0, y: 0 },
        { x: s * cx, y: s * sy }
      ];
      this.shape = this._finishPolyline(raw, false);
    } else if (this.shapeType === 'tangle') {
      this.shape = this._buildTangle();
    } else if (this.shapeType === 'fractal') {
      this.shape = this._buildFractal();
    } else if (this.shapeType === 'quadric') {
      this.shape = this._buildQuadricShape();
    } else if (this.shapeType === 'cesaro') {
      this.shape = this._buildCesaroShape();
    } else if (this.shapeType === 'sierpinski') {
      this.shape = this._buildSierpinskiShape();
    } else if (this.shapeType === 'spiral') {
      this.shape = this._buildSpiral();
    } else if (this.shapeType === 'star') {
      this.shape = this._buildStar();
    } else { // 'circle' — the proof case
      const r = d / 2;                                // diameter exactly d
      const pts = [];
      for (let i = 0; i < CIRCLE_SEGS; i++) {
        const a = (2 * Math.PI * i) / CIRCLE_SEGS;
        pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
      }
      // Length is πd BY DEFINITION — it already contains π. This shape pins the
      // constant (always 2 crossings); it is not an independent π computation.
      this.shape = { pts, closed: true, isCircle: true, length: Math.PI * d };
    }
  }

  _buildTangle() {
    const d = this.spacing;
    const n = 6 + Math.floor(Math.random() * 4);     // 6..9 segments
    const seg = 0.5 * d;
    // Local heading is arbitrary (each drop applies its own π-free rotation), so
    // start at 0 and turn by small π-free increments — no π in the geometry.
    let ang = 0;
    const raw = [{ x: 0, y: 0 }];
    for (let i = 0; i < n; i++) {
      ang += (Math.random() - 0.5) * 1.6;            // gentle turns → smooth noodle
      const p = raw[raw.length - 1];
      raw.push({ x: p.x + seg * Math.cos(ang), y: p.y + seg * Math.sin(ang) });
    }
    return this._finishPolyline(raw, false);
  }

  // ---- the STAR of the show: a Koch curve ------------------------------------
  // Recursive subdivision: every segment becomes 4 segments each 1/3 as long,
  // so the total length is base·(4/3)^depth — it EXPLODES with depth while the
  // curve stays inside a bounded strip. The crossing count explodes in lock-step
  // and π holds, because E[crossings] = 2L/(πd) cares ONLY about the length.
  // Geometry is π-free: the 60° peak uses hardcoded cos/sin constants (like the
  // bent V), and the length is a plain Euclidean sum.
  _buildFractal() {
    const d = this.spacing;
    const base = 1.5 * d;
    // Clamp depth so the vertex count fits the pooled cap (4^depth + 1 verts).
    let depth = Math.max(0, Math.min(this.MAX_FRACTAL_DEPTH, Math.round(this.depth)));
    this.fractalClamped = false;
    while (depth > 0 && Math.pow(4, depth) + 1 > this.MAX_FRACTAL_VERTS) {
      depth--; this.fractalClamped = true;
    }
    this.fractalDepth = depth;
    const pts = depth === 0
      ? [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }]
      : this._kochLevels(base, depth)[depth - 1];
    return this._finishPolyline(pts, false);
  }

  // A quadratic (Minkowski "sausage") Koch curve: each segment → 8 segments each
  // 1/4 as long, so length grows as base·2^depth and the box dimension is
  // log8/log4 = 3/2 — the DENSER fractal, giving the dimension "spectrum" a range.
  // The generator template is π-free (only quarter-turns / rational offsets).
  _buildQuadricShape() {
    const d = this.spacing;
    const base = 1.5 * d;
    let depth = Math.max(0, Math.min(3, Math.round(this.depth)));   // 8^3 = 512 segs
    this.fractalClamped = this.depth > 3;
    this.fractalDepth = depth;
    const pts = depth === 0
      ? [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }]
      : this._quadricLevels(base, depth)[depth - 1];
    return this._finishPolyline(pts, false);
  }

  // A Cesàro / Koch–Peano curve with a TUNABLE peak angle θ: each segment splits
  // into 2 equal segments meeting at an apex, base angle θ, so the self-similar
  // ratio is r = 1/(2cosθ) and the similarity dimension D = log2/log(2cosθ) sweeps
  // continuously from ≈1 (θ→0) toward 2 (θ→45°). π-free apart from the decimal
  // deg→rad factor (a hardcoded constant, like the file's cos30° decimals).
  _buildCesaroShape() {
    const d = this.spacing;
    const base = 1.5 * d;
    // Draw richer than the raw depth slider so 2^depth reads as a fractal, capped
    // to the pooled per-shape segment ceiling (2^depth segments + 1 vertices).
    let depth = Math.max(0, Math.round(this.depth) + 4);
    while (depth > 0 && Math.pow(2, depth) + 1 > this.MAX_SEG_PER_SHAPE) depth--;
    this.fractalDepth = depth;
    this.fractalClamped = false;
    const theta = this.fractalAngle * 0.017453292519943295;   // deg→rad (plain decimal)
    const pts = depth === 0
      ? [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }]
      : this._cesaroLevels(base, depth, theta)[depth - 1];
    return this._finishPolyline(pts, false);
  }

  // A Sierpiński arrowhead curve: each level triples the segment count and halves
  // the length, so N=3 pieces of ratio r=1/2 give D = log3/log2 ≈ 1.585. Built by a
  // turtle whose heading is a UNIT VECTOR rotated by ±60° via hardcoded cos/sin
  // constants (π-free, exactly like the bent V and star).
  _buildSierpinskiShape() {
    const d = this.spacing;
    const base = 1.7 * d;
    let depth = Math.max(0, Math.round(this.depth) + 1);
    while (depth > 0 && Math.pow(3, depth) + 1 > this.MAX_SEG_PER_SHAPE) depth--;
    this.fractalDepth = depth;
    this.fractalClamped = false;
    const pts = depth === 0
      ? [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }]
      : this._sierpinskiLevels(base, depth)[depth - 1];
    return this._finishPolyline(pts, false);
  }

  // Archimedean spiral polyline: r = rBase·θ over several turns. Long length,
  // many crossings. θ is stepped by a fixed π-free increment (no 2π literal).
  _buildSpiral() {
    const d = this.spacing;
    const steps = this.SPIRAL_STEPS;
    const dTheta = 0.35;                    // π-free angular step (~4.5 turns)
    const rMax = 2 * d;
    const rBase = rMax / (steps * dTheta);
    const raw = [];
    for (let i = 0; i <= steps; i++) {
      const a = i * dTheta;
      const r = rBase * a;
      raw.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return this._finishPolyline(raw, false);
  }

  // A {7/3} star polygon (heptagram): a long, self-crossing closed polyline.
  // The 7 vertices are placed by a fixed π-free rotation (cos/sin of 2π/7 as
  // hardcoded constants, like the bent V's 30°), then connected every 3rd.
  _buildStar() {
    const d = this.spacing;
    const n = 7, skip = 3;
    const R = 1.1 * d;
    const c7 = 0.6234898018587336, s7 = 0.7818314824680298; // cos,sin(2π/7) — π-free
    const verts = [];
    let vx = R, vy = 0;
    for (let i = 0; i < n; i++) {
      verts.push({ x: vx, y: vy });
      const nx = vx * c7 - vy * s7, ny = vx * s7 + vy * c7;
      vx = nx; vy = ny;
    }
    const raw = [];
    for (let i = 0; i < n; i++) raw.push(verts[(i * skip) % n]);   // {7/3} traversal
    return this._finishPolyline(raw, true);
  }

  // ---- fractal generators returning EVERY intermediate depth -----------------
  // Koch: levels[k-1] is the depth-k curve (finest segment = base/3^k). Used by
  // the dimension sweep to resolve the curve to each ruler scale.
  _kochLevels(base, K) {
    const c60 = 0.5, s60 = 0.8660254037844386;    // cos60°, sin60° — π-free
    let pts = [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }];
    const levels = [];
    for (let it = 1; it <= K; it++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const vx = (p2.x - p1.x) / 3, vy = (p2.y - p1.y) / 3;
        const b = { x: p1.x + vx, y: p1.y + vy };
        const e = { x: p1.x + 2 * vx, y: p1.y + 2 * vy };
        const c = { x: b.x + vx * c60 - vy * s60, y: b.y + vx * s60 + vy * c60 };
        next.push(b, c, e, p2);
      }
      pts = next;
      levels.push(pts.map((p) => ({ x: p.x, y: p.y })));
    }
    return levels;
  }

  // Quadratic (Minkowski) Koch: each segment → 8 segments of length 1/4 tracing a
  // square-wave bump. Finest segment at depth k = base/4^k; length = base·2^k.
  _quadricLevels(base, K) {
    // Generator template in the segment's local frame (lx along, ly perpendicular).
    const tmpl = [
      [0.25, 0], [0.25, 0.25], [0.5, 0.25], [0.5, 0],
      [0.5, -0.25], [0.75, -0.25], [0.75, 0], [1, 0]
    ];
    let pts = [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }];
    const levels = [];
    for (let it = 1; it <= K; it++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;   // segment vector
        const px = -dy, py = dx;                    // perpendicular (same length)
        for (let t = 0; t < tmpl.length; t++) {
          const lx = tmpl[t][0], ly = tmpl[t][1];
          next.push({ x: p1.x + lx * dx + ly * px, y: p1.y + lx * dy + ly * py });
        }
      }
      pts = next;
      levels.push(pts.map((p) => ({ x: p.x, y: p.y })));
    }
    return levels;
  }

  // Cesàro levels: each segment → 2 segments meeting at an apex of base angle θ.
  // Finest segment at depth k = base·r^k with r = 1/(2cosθ); segments = 2^k.
  // The apex sits a perpendicular height (halfBase·tanθ) off each segment's midpoint.
  _cesaroLevels(base, K, theta) {
    const tan = Math.tan(theta);
    let pts = [{ x: -base / 2, y: 0 }, { x: base / 2, y: 0 }];
    const levels = [];
    for (let it = 1; it <= K; it++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1e-12;
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const px = -dy / len, py = dx / len;          // unit perpendicular
        const h = (len / 2) * tan;                     // apex height
        next.push({ x: mx + px * h, y: my + py * h }, p2);
      }
      pts = next;
      levels.push(pts.map((p) => ({ x: p.x, y: p.y })));
    }
    return levels;
  }

  // Sierpiński arrowhead levels via an L-system (A→B−A−B, B→A+B+A, ±=turn 60°).
  // Heading is a unit vector rotated by hardcoded cos60°/sin60° — no π literal.
  // Finest segment at level k = base/2^k; segments = 3^k; D = log3/log2.
  _sierpinskiLevels(base, K) {
    const c60 = 0.5, s60 = 0.8660254037844386;
    const levels = [];
    for (let order = 1; order <= K; order++) {
      const step = base / Math.pow(2, order);
      const st = { x: -base / 2, y: 0, hx: 1, hy: 0 };  // start heading +x
      const pts = [{ x: st.x, y: st.y }];
      const fwd = () => { st.x += step * st.hx; st.y += step * st.hy; pts.push({ x: st.x, y: st.y }); };
      const turn = (sgn) => { const nx = st.hx * c60 - st.hy * (sgn * s60), ny = st.hx * (sgn * s60) + st.hy * c60; st.hx = nx; st.hy = ny; };
      // Recursive expansion. A and B both draw forward at order 0.
      const A = (o) => { if (o === 0) { fwd(); return; } B(o - 1); turn(-1); A(o - 1); turn(-1); B(o - 1); };
      const B = (o) => { if (o === 0) { fwd(); return; } A(o - 1); turn(+1); B(o - 1); turn(+1); A(o - 1); };
      A(order);
      levels.push(pts);
    }
    return levels;
  }

  // Centre on centroid and measure length as a π-free sum of Euclidean segments.
  _finishPolyline(raw, closed) {
    let cx = 0, cy = 0;
    for (const p of raw) { cx += p.x; cy += p.y; }
    cx /= raw.length; cy /= raw.length;
    const pts = raw.map((p) => ({ x: p.x - cx, y: p.y - cy }));
    let length = 0;
    const nseg = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < nseg; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return { pts, closed, isCircle: false, length };
  }

  // ---- FEATURE 1: dimension sweep --------------------------------------------
  // Build the "ruler ladder": K grid spacings d_k and, for each, a version of the
  // curve resolved to that scale. For a fractal, level k is the depth-k generator
  // (finest segment ≈ d_k); for a smooth curve every level is the full shape (it
  // has no sub-scale detail, so the slope is 1 at every scale). Counting the SAME
  // full-detail curve against every spacing would just measure its true length
  // (Cauchy–Crofton) → slope 1; matching the resolution to the ruler is what
  // exposes the dimension.
  _buildDimLevels() {
    const shape = this.shapeType;
    const levels = [], grids = [];
    let trueD = 1, K;
    // Nested rulers (integer scaling ratio) share ONE uniform offset — exact. The
    // Cesàro ratio 2cosθ is generally NON-integer, so its rulers are not nested;
    // there each ruler gets its OWN independent uniform offset (still unbiased).
    this.dimPerRulerOffset = false;
    if (shape === 'fractal') {
      const base = 1.4; K = 6;
      const raw = this._kochLevels(base, K);            // raw[k-1] = depth k
      for (let k = 1; k <= K; k++) { levels.push({ pts: raw[k - 1], closed: false }); grids.push(base / Math.pow(3, k)); }
      trueD = Math.log(4) / Math.log(3);                // ≈ 1.26186
    } else if (shape === 'quadric') {
      const base = 1.4; K = 4;                          // 8^4 = 4096 verts at the finest
      const raw = this._quadricLevels(base, K);
      for (let k = 1; k <= K; k++) { levels.push({ pts: raw[k - 1], closed: false }); grids.push(base / Math.pow(4, k)); }
      trueD = Math.log(8) / Math.log(4);                // = 1.5
    } else if (shape === 'cesaro') {
      const base = 1.4; K = 8;                          // 2^8 = 256 segments at finest
      const theta = this.fractalAngle * 0.017453292519943295;
      const ratio = 1 / (2 * Math.cos(theta));          // self-similar ratio r
      const raw = this._cesaroLevels(base, K, theta);
      for (let k = 1; k <= K; k++) { levels.push({ pts: raw[k - 1], closed: false }); grids.push(base * Math.pow(ratio, k)); }
      trueD = Math.log(2) / Math.log(2 * Math.cos(theta));  // = log2 / log(2cosθ)
      this.dimPerRulerOffset = true;                    // non-integer ratio → per-ruler offset
    } else if (shape === 'sierpinski') {
      const base = 1.7; K = 7;                          // 3^7 = 2187 segments at finest
      const raw = this._sierpinskiLevels(base, K);
      for (let k = 1; k <= K; k++) { levels.push({ pts: raw[k - 1], closed: false }); grids.push(base / Math.pow(2, k)); }
      trueD = Math.log(3) / Math.log(2);                // ≈ 1.585
    } else {
      // Smooth / rectifiable: full shape at every scale, dyadic ruler ladder.
      K = 6;
      const pts = this.shape.pts, closed = this.shape.closed;
      let maxAbs = 1e-6;
      for (const p of pts) { maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y)); }
      const E = 2 * maxAbs, d1 = 0.45 * E;
      for (let k = 0; k < K; k++) { levels.push({ pts, closed }); grids.push(d1 / Math.pow(2, k)); }
      trueD = 1;
    }
    this.dimLevels = levels;
    this.dimGrids = grids;
    this.dimK = K;
    this.dimD1 = grids[0];         // coarsest spacing; an integer multiple of every
    this.dimTrueD = trueD;         // finer d_k, so a uniform offset in [0,d1) is
    this.dimCounts = new Float64Array(K);   // exactly uniform mod each ruler.
    this.dimDrops = 0;
    // Pick a modest level to DRAW (≤ ~700 verts keeps the pooled buffer light).
    let di = 0;
    for (let k = 0; k < K; k++) if (levels[k].pts.length <= 700) di = k;
    this.dimDisplayIdx = di;
  }

  _dimDrop(visible = true) {
    // Uniform-random orientation (π-free rejection) and offset. The offset is
    // uniform over [0, d1); since d1 = 3^(k-1)·d_k (or 2^(k-1)·d_k for smooth),
    // it is EXACTLY uniform mod every ruler, so each E[crossings@d_k] is unbiased.
    let ux, uy, r2;
    do { ux = 2 * Math.random() - 1; uy = 2 * Math.random() - 1; r2 = ux * ux + uy * uy; }
    while (r2 > 1 || r2 === 0);
    const inv = 1 / Math.sqrt(r2), c = ux * inv, s = uy * inv;
    const perRuler = this.dimPerRulerOffset;
    const tyShared = Math.random() * this.dimD1;
    const K = this.dimK;
    for (let k = 0; k < K; k++) {
      const lvl = this.dimLevels[k], pts = lvl.pts, closed = lvl.closed, d = this.dimGrids[k];
      // Non-nested rulers each get their own exactly-uniform offset over [0, d).
      const ty = perRuler ? Math.random() * d : tyShared;
      const nseg = closed ? pts.length : pts.length - 1;
      let cross = 0;
      // Only y-coordinates matter for horizontal-line crossings: y' = x·s + y·c + ty.
      let ya = pts[0].x * s + pts[0].y * c + ty;
      for (let i = 0; i < nseg; i++) {
        const q = pts[(i + 1) % pts.length];
        const yb = q.x * s + q.y * c + ty;
        const mLo = Math.floor(Math.min(ya, yb) / d);
        const mHi = Math.floor(Math.max(ya, yb) / d) + 1;
        for (let m = mLo; m <= mHi; m++) {
          const Y = m * d;
          if ((ya < Y) !== (yb < Y)) cross++;
        }
        ya = yb;
      }
      this.dimCounts[k] += cross;
    }
    this.dimDrops++;
    const df = this.dimGrids[K - 1];
    this.lastPhasePoint = [Math.max(-1, Math.min(1, 2 * ((tyShared % df) / df) - 1)), 1];
    if (visible) this._pushDimDisplay(c, s);
  }

  _pushDimDisplay(c, s) {
    const lvl = this.dimLevels[this.dimDisplayIdx];
    const tx = -0.5 + Math.random();
    const ty = Math.random() * this.dimD1;
    const built = this._transformLines(lvl.pts, lvl.closed, c, s, tx, ty);
    this.shapes.push({ lineBuf: built.lineBuf, segCount: built.segCount, crossed: true, dots: null });
    if (this.shapes.length > 12) this.shapes.shift();
  }

  // Least-squares slope of log⟨crossings⟩ vs log(1/d_k) — that slope is D.
  _fitD() {
    const K = this.dimK, xs = [], ys = [];
    for (let k = 0; k < K; k++) {
      const m = this.dimDrops > 0 ? this.dimCounts[k] / this.dimDrops : 0;
      if (m > 0) { xs.push(Math.log(1 / this.dimGrids[k])); ys.push(Math.log(m)); }
    }
    const n = xs.length;
    if (n < 2) return { D: NaN, b: 0, r2: 0, n, xs, ys };
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
    const D = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const b = (sy - D * sx) / n;
    const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    const r = den > 0 ? (n * sxy - sx * sy) / den : 0;
    return { D, b, r2: r * r, n, xs, ys };
  }

  // ---- FEATURE 1: racing convergence -----------------------------------------
  // Run K=4 independent Buffon needle estimators concurrently, each with its own
  // (mean-length, size-distribution) config. Feeding one drop per step to each and
  // accumulating each estimator's own π̂ = 2·Σℓ/(d·Σcross) lets the viewer SEE the
  // ranking: more crossings per drop (longer needle) converges faster, and an
  // exponential size law adds variance so it converges slower than fixed at the
  // SAME mean. The four relative-error curves are plotted log–log below.
  _raceInit() {
    const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const defs = [
      { L: 0.9, kind: 'fixed', color: '#f5c542', label: 'L̄=0.9 fixed' },
      { L: 0.3, kind: 'fixed', color: '#5bd0ff', label: 'L̄=0.3 fixed' },
      { L: 0.9, kind: 'exp', color: '#ff7f6b', label: 'L̄=0.9 exp' },
      { L: 0.3, kind: 'exp', color: '#7fd08c', label: 'L̄=0.3 exp' }
    ];
    this.race = {
      n: 0, nextSample: 8, sampleN: [],
      recent: [],   // ring buffer of recent VISIBLE drops, scattered on the floor
      configs: defs.map((dd) => ({
        ...dd, rgb: hex(dd.color), colorNum: parseInt(dd.color.slice(1), 16),
        sumL: 0, cross: 0, err: [], lobe: []   // lobe = phase-disc crossing-point cloud
      }))
    };
  }

  // One Buffon needle drop for a single racing estimator (short-needle geometry:
  // uniform offset over one period, uniform orientation, π-free throughout).
  _raceDropOne(cfg, visible) {
    const d = this.spacing;
    let L;
    if (cfg.kind === 'exp') { let u = Math.random(); if (u <= 0) u = 1e-12; L = -cfg.L * d * Math.log(u); }
    else L = cfg.L * d;
    let ux, uy, r2;
    do { ux = 2 * Math.random() - 1; uy = 2 * Math.random() - 1; r2 = ux * ux + uy * uy; }
    while (r2 > 1 || r2 === 0);
    const inv = 1 / Math.sqrt(r2), c = ux * inv, s = uy * inv;
    // Position. VISIBLE drops are thrown at a random spot over the whole floor
    // (cy spans an EXACT integer number of line periods → still unbiased); turbo
    // drops need only the y-offset within one period.
    const cx = visible ? (-0.72 + Math.random() * 1.44) : 0;
    const cy = visible ? (-0.75 + Math.random() * 1.5) : (Math.random() * d);
    const hy = 0.5 * L * s;
    const ay = cy - hy, by = cy + hy;
    let cross = 0;
    const mLo = Math.floor(Math.min(ay, by) / d), mHi = Math.floor(Math.max(ay, by) / d) + 1;
    for (let m = mLo; m <= mHi; m++) { const Y = m * d; if ((ay < Y) !== (by < Y)) cross++; }
    cfg.sumL += L; cfg.cross += cross;

    // Phase disc: each crossing is plotted at ρ·(c,s) — angle = the needle's
    // orientation, radius ρ = 2·dist(center, nearest line)/d ∈ [0,1]. A needle
    // crosses iff ρ ≤ (L/d)|s|, so hits fill two origin-tangent lobes whose size
    // grows with the needle length — the visual reason the longer needle crosses
    // more and wins. π-free: (c,s) is the sampled orientation and ρ a plain
    // distance ratio; neither feeds the 2·Σℓ/(d·Σcross) estimator.
    if (cross > 0 && cfg.lobe.length < RACE_LOBE_CAP) {
      const t = Math.abs(cy - Math.round(cy / d) * d);
      const rho = Math.min(1, (2 * t) / d);
      cfg.lobe.push([rho * c, rho * s]);
    }

    if (visible) {
      const hx = 0.5 * L * c;
      const R = this.race;
      R.recent.push({ x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy, rgb: cfg.rgb, crossed: cross > 0 });
      if (R.recent.length > RACE_VIS) R.recent.shift();
    }
  }

  _raceStep(count, visible) {
    const R = this.race;
    for (let j = 0; j < count; j++) {
      for (let i = 0; i < R.configs.length; i++) this._raceDropOne(R.configs[i], visible);
      R.n++;
      if (R.n >= R.nextSample) { this._raceRecord(); R.nextSample = Math.ceil(R.nextSample * 1.35); }
    }
    // The race phase view is driven by the four coloured lobe clouds
    // (getOverlayTrails), not the single-stream trail — see getPhasePoint.
  }

  // Record each estimator's relative error at the current N (geometric spacing so
  // turbo's millions of drops still produce a bounded, evenly-log-spaced curve).
  _raceRecord() {
    const R = this.race;
    // DISPLAY-ONLY truth reference for the convergence-error plot — the SAME π that
    // piDigitsHTML() highlights against. It never enters any estimator (each π̂ is
    // computed π-free as 2·Σℓ/(d·Σcross)); it only positions the error curve.
    const PI_TRUTH = Math.PI;
    R.sampleN.push(R.n);
    for (const cfg of R.configs) {
      const pi = cfg.cross > 0 ? (2 * cfg.sumL) / (this.spacing * cfg.cross) : NaN;
      cfg.err.push(isFinite(pi) ? Math.abs(pi - PI_TRUTH) / PI_TRUTH : NaN);
    }
    if (R.sampleN.length > 240) { R.sampleN.shift(); for (const cfg of R.configs) cfg.err.shift(); }
  }

  // ---- FEATURE 3: MCMC pins ---------------------------------------------------
  // A pool of needle-pins evolving as a Markov chain whose stationary law is
  // uniform in (y mod d, angle). A symmetric random-walk proposal on that torus
  // is accepted with probability 1 for the uniform target (valid Metropolis), so
  // the pins simply wiggle; starting from the uniform law there is no burn-in
  // bias. Crossings are time-averaged into the SAME π estimator.
  // A π-free unit-direction sampler (rejection on the unit disk), identical in
  // spirit to the i.i.d. drop's orientation — so no π leaks into the estimator.
  _randUnitDir() {
    let ux, uy, r2;
    do { ux = 2 * Math.random() - 1; uy = 2 * Math.random() - 1; r2 = ux * ux + uy * uy; }
    while (r2 > 1 || r2 === 0);
    const inv = 1 / Math.sqrt(r2);
    return [ux * inv, uy * inv];
  }

  _mcmcInit() {
    const POOL = this.MCMC_POOL, d = this.spacing;
    if (!this.pins) this.pins = new Array(POOL);
    const rows = [];
    for (let y = -0.75; y <= 0.75001; y += d) rows.push(Math.round(y / d) * d);
    for (let i = 0; i < POOL; i++) {
      const dir = this._randUnitDir();
      this.pins[i] = {
        x: -0.85 + 1.7 * (i / (POOL - 1)),
        row: rows[i % rows.length],
        y: Math.random() * d,
        dirx: dir[0], diry: dir[1],
        crossed: false
      };
    }
    this.mcmcStepY = 0.18 * d;    // proposal scale (visible wiggle, correlated)
    this.mcmcStepDir = 0.35;      // isotropic direction-perturbation magnitude
  }

  _mcmcSweep() {
    const d = this.spacing, L = this.lengthRatio * d;
    const pins = this.pins;
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      // Symmetric random walk on (y mod d, direction). y wraps over one period;
      // the direction is perturbed by an ISOTROPIC π-free step then renormalised,
      // so the walk is rotation-invariant → uniform stationary law. A symmetric
      // proposal on a uniform target is accepted with probability 1 (Metropolis).
      p.y += (Math.random() - 0.5) * 2 * this.mcmcStepY; p.y = ((p.y % d) + d) % d;
      const step = this._randUnitDir();
      let nx = p.dirx + this.mcmcStepDir * step[0], ny = p.diry + this.mcmcStepDir * step[1];
      const nl = Math.hypot(nx, ny) || 1; p.dirx = nx / nl; p.diry = ny / nl;
      const cy = p.row + p.y, hy = 0.5 * L * p.diry;
      const ay = cy - hy, by = cy + hy;
      let cross = 0;
      const mLo = Math.floor(Math.min(ay, by) / d), mHi = Math.floor(Math.max(ay, by) / d) + 1;
      for (let m = mLo; m <= mHi; m++) { const Y = m * d; if ((ay < Y) !== (by < Y)) cross++; }
      p.crossed = cross > 0;
      this.tosses++; this.crossings += cross; this.sumLength += L;
    }
    this.collisionCount = this.crossings;
    const p0 = pins[0];
    this.lastPhasePoint = [Math.max(-1, Math.min(1, 2 * p0.y / d - 1)), p0.crossed ? 1 : -1];
  }

  // ---- length histogram (exponential track-length mode) ----------------------
  _histReset() {
    if (!this.hist) this.hist = new Int32Array(24);
    else this.hist.fill(0);
    this.histN = 0;
    // Bin range tracks the MEAN curve length: needle mean = L̄·d; any other shape's
    // mean scaled length = its own (fixed) length (mean-1 exponential factor).
    const mean = this.shapeType === 'needle'
      ? this.lengthRatio * this.spacing
      : (this.shape ? this.shape.length : this.lengthRatio * this.spacing);
    this.histMax = Math.max(1e-3, 5 * mean);
  }
  _histAdd(L) {
    let idx = Math.floor((L / this.histMax) * this.hist.length);
    if (idx < 0) idx = 0; if (idx >= this.hist.length) idx = this.hist.length - 1;
    this.hist[idx]++; this.histN++;
  }

  getControls() {
    return [
      {
        type: 'select', id: 'mode', label: 'Mode', highlight: true,
        default: this.mode,
        options: [
          { value: 'pi', label: 'π — Cauchy–Crofton estimator' },
          { value: 'dimension', label: 'Dimension — fractal D (Richardson)' },
          { value: 'race', label: 'Race — 4 estimators converge' }
        ],
        onChange: (val) => { this.mode = val; this.reset(); this.initSimScene(); this._syncPiLabel(); }
      },
      {
        type: 'select', id: 'shapeType', label: 'Shape', highlight: true,
        default: this.shapeType,
        options: [
          { value: 'needle', label: 'Needle — straight (0/1 crossing)' },
          { value: 'bent', label: 'Bent — a V (0,1,2…)' },
          { value: 'tangle', label: 'Tangle — random noodle (many)' },
          { value: 'fractal', label: 'Fractal — Koch curve (D≈1.262)' },
          { value: 'quadric', label: 'Quadratic Koch — Minkowski (D=1.5)' },
          { value: 'cesaro', label: 'Cesàro — tunable D (angle slider)' },
          { value: 'sierpinski', label: 'Sierpiński arrowhead (D≈1.585)' },
          { value: 'spiral', label: 'Spiral — Archimedean (long, winding)' },
          { value: 'star', label: 'Star — {7/3} heptagram (self-crossing)' },
          { value: 'circle', label: 'Circle Ø = d — proof: always 2' }
        ],
        onChange: (val) => { this.shapeType = val; this.reset(); this.initSimScene(); this._syncPiLabel(); }
      },
      {
        type: 'slider', id: 'depth', label: 'Fractal depth (Koch)',
        min: 0, max: 5, step: 1, default: this.depth,
        onChange: (val) => { this.depth = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'fractalAngle', label: 'Fractal angle θ° (Cesàro)',
        min: 5, max: 44, step: 1, default: this.fractalAngle,
        onChange: (val) => { this.fractalAngle = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'lengthRatio', label: 'Mean length / spacing',
        min: 0.1, max: 1, step: 0.05, default: this.lengthRatio,
        onChange: (val) => { this.lengthRatio = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'select', id: 'lengthMode', label: 'Size',
        default: this.lengthMode,
        options: [
          { value: 'fixed', label: 'Fixed — every drop the same size' },
          { value: 'exponential', label: 'Exponential — random size per drop' }
        ],
        onChange: (val) => { this.lengthMode = val; this.reset(); this.initSimScene(); this._syncPiLabel(); }
      },
      {
        type: 'select', id: 'sampling', label: 'Sampling',
        default: this.sampling,
        options: [
          { value: 'iid', label: 'i.i.d. — independent drops' },
          { value: 'mcmc', label: 'MCMC — evolving pins (correlated)' }
        ],
        onChange: (val) => { this.sampling = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'rate', label: 'Drops/s',
        min: 1, max: 200, step: 1, default: this.rate,
        onChange: (val) => { this.rate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      // Echo the LIVE speed: _syncPiLabel() can rebuild the panel (the headline
      // label is baked in at build time), and a rebuild re-applies `default`.
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: this.speed ?? 1 },
    ];
  }

  getPhaseSpaceViews() {
    if (this.mode === 'race') {
      // Polar crossing-geometry disc: a point at (ρ·cosθ, ρ·sinθ) — angle = the
      // needle's orientation, radius ρ = its gap to the nearest line. Circular
      // boundary kept so the coloured overlay clouds render.
      return [{
        id: 'race-lobes',
        label: 'Crossing geometry — orientation (angle) × gap to line (radius)',
        dimension: 2, primary: true,
        axisLabels: { x: 'gap · cosθ', y: 'gap · sinθ' }
      }];
    }
    return [
      { id: 'angle-distance', label: 'Orientation vs nearest-line distance', dimension: 2, primary: true }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let sampled = false;

    this.dropCarry += this.rate * t;
    let drops = Math.floor(this.dropCarry);
    this.dropCarry -= drops;

    if (this.mode === 'dimension') {
      for (; drops > 0; drops--) { this._dimDrop(true); sampled = true; }
      if (this.turbo) {
        this.turboCarry += this.rate * 999 * t;
        let m = Math.floor(this.turboCarry); this.turboCarry -= m;
        if (m > 0) sampled = true;
        for (; m > 0; m--) this._dimDrop(false);
      }
      return sampled;
    }

    if (this.mode === 'race') {
      if (drops > 0) { this._raceStep(drops, true); sampled = true; }
      if (this.turbo) {
        this.turboCarry += this.rate * 999 * t;
        let m = Math.floor(this.turboCarry); this.turboCarry -= m;
        if (m > 0) { this._raceStep(m, false); sampled = true; }
      }
      return sampled;
    }

    if (this.sampling === 'mcmc') {
      for (; drops > 0; drops--) { this._mcmcSweep(); sampled = true; }
      if (this.turbo) {
        this.turboCarry += this.rate * 999 * t;
        let m = Math.floor(this.turboCarry); this.turboCarry -= m;
        if (m > 0) sampled = true;
        for (; m > 0; m--) this._mcmcSweep();
      }
      return sampled;
    }

    // π + i.i.d. (the original path)
    for (; drops > 0; drops--) {
      this._dropShape(true);
      this.pendingPhasePoints.push([...this.lastPhasePoint]);
      sampled = true;
    }
    if (this.turbo) {
      this.turboCarry += this.rate * 999 * t;
      let m = Math.floor(this.turboCarry); this.turboCarry -= m;
      if (m > 0) sampled = true;
      for (; m > 0; m--) this._dropShape(false);
    }
    return sampled;
  }

  _dropShape(visible = true) {
    const d = this.spacing;
    let shape = this.shape;
    const expMode = this.lengthMode === 'exponential';
    // FEATURE 3: exponential SIZE for ANY shape. Each drop is scaled by an
    // exponential-random factor (π-free: uses ln, never a π literal), so E[size] =
    // the fixed size. The needle keeps its dedicated track-length form (scale its
    // length directly); every other shape is scaled uniformly by `scale`. The
    // Σ-form estimator π = 2·Σℓ/(d·Σcross) absorbs the varying total length, so
    // only the MEAN matters and π still emerges — even for the circle and the star.
    let scale = 1;
    if (expMode && this.shapeType === 'needle') {
      const mean = this.lengthRatio * d;               // MEAN length = the slider
      let u = Math.random(); if (u <= 0) u = 1e-12;
      const L = -mean * Math.log(u);
      const sc = this._scratchNeedle;
      sc.pts[0].x = -L / 2; sc.pts[1].x = L / 2; sc.length = L;
      shape = sc;
      this._histAdd(L);
    } else if (expMode) {
      let u = Math.random(); if (u <= 0) u = 1e-12;
      scale = -Math.log(u);                             // mean-1 factor → E[size] = fixed size
      this._histAdd(shape.length * scale);
    }

    // Uniform-random translation. y spans an EXACT integer number of line
    // periods (7 × 0.25 = 1.75) so the distance-to-line distribution is unbiased.
    const tx = -0.9 + Math.random() * 1.8;
    const ty = -0.875 + Math.random() * 1.75;

    let crossings, dots, lineBuf, segCount, L;

    // In exponential SIZE mode the circle has a RANDOM diameter, so it no longer
    // crosses exactly twice — route it through the general crossing count and it
    // becomes an HONEST π estimator via Σℓ/Σcross (its length still carries π, so
    // it demonstrates rather than independently computes π). Only the fixed-size
    // circle keeps the analytic always-2 proof case below.
    if (shape.isCircle && !expMode) {
      // A circle of diameter d spans a vertical extent of exactly one period,
      // so the half-open interval [ty−r, ty+r) contains exactly ONE grid line —
      // which the circle crosses twice. Always 2. Computed analytically.
      const r = d / 2;
      const k = Math.ceil((ty - r) / d);
      const lineY = k * d;
      const dxr = Math.sqrt(Math.max(0, r * r - (lineY - ty) * (lineY - ty)));
      crossings = 2;
      dots = [tx - dxr, lineY, tx + dxr, lineY];
      L = shape.length;                              // πd (contains π by design)
      const built = this._transformLines(shape.pts, shape.closed, 1, 0, tx, ty);
      lineBuf = built.lineBuf; segCount = built.segCount;
    } else {
      // Uniform-random orientation sampled π-free (rejection on the unit disk),
      // so no value of π enters the estimator — it emerges from the geometry. The
      // exponential-size `scale` folds into (c,s): (c,s) = scale·(cosθ,sinθ) applies
      // rotation AND scaling in one pass, so the drawn/counted curve has length
      // scale·shape.length.
      let ux, uy, r2;
      do { ux = 2 * Math.random() - 1; uy = 2 * Math.random() - 1; r2 = ux * ux + uy * uy; }
      while (r2 > 1 || r2 === 0);
      const inv = scale / Math.sqrt(r2);
      const built = this._transformLines(shape.pts, shape.closed, ux * inv, uy * inv, tx, ty);
      lineBuf = built.lineBuf; segCount = built.segCount;
      const counted = this._countCrossings(lineBuf, segCount, visible);
      crossings = counted.crossings;
      dots = counted.dots;
      L = shape.length * scale;                      // π-free Euclidean length × scale
    }

    this.tosses++;
    this.crossings += crossings;
    this.sumLength += L;
    this.collisionCount = this.crossings;

    const nearestLine = Math.round(ty / d) * d;
    const signedDistance = ty - nearestLine;
    this.lastPhasePoint = [
      Math.max(-1, Math.min(1, (2 * signedDistance) / d)),
      crossings > 0 ? 1 : -1
    ];

    if (this.shapeType === 'tangle' && visible) {
      // Occasionally regenerate the noodle so the audience sees a fresh shape;
      // the estimator stays correct because Σlength accumulates each drop's own L.
      if (++this.tangleAge >= 240) { this.tangleAge = 0; this.shape = this._buildTangle(); }
    }

    if (!visible) return;                             // turbo drop: counted, not drawn

    this.shapes.push({ lineBuf, segCount, crossed: crossings > 0, dots });
    if (this.shapes.length > this.MAX_SHAPES) this.shapes.shift();
  }

  // Rotate points by the direction (c,s) = (cosθ,sinθ) and translate by (tx,ty),
  // emitting a flat segment buffer [x1,y1,x2,y2, …]. Allocated per drop (like the
  // original needle record), never per render frame.
  _transformLines(pts, closed, c, s, tx, ty) {
    const segCount = closed ? pts.length : pts.length - 1;
    const lineBuf = new Float32Array(segCount * 4);
    for (let i = 0; i < segCount; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      lineBuf[i * 4] = a.x * c - a.y * s + tx;
      lineBuf[i * 4 + 1] = a.x * s + a.y * c + ty;
      lineBuf[i * 4 + 2] = b.x * c - b.y * s + tx;
      lineBuf[i * 4 + 3] = b.x * s + b.y * c + ty;
    }
    return { lineBuf, segCount };
  }

  // Exact count of segment-vs-horizontal-line intersections. Each grid line
  // y = m·d is crossed when the segment endpoints fall on opposite sides
  // (half-open convention: a shared polyline vertex is never double-counted).
  _countCrossings(lineBuf, segCount, wantDots) {
    const d = this.spacing;
    let crossings = 0;
    const dots = wantDots ? [] : null;
    for (let sidx = 0; sidx < segCount; sidx++) {
      const ay = lineBuf[sidx * 4 + 1], by = lineBuf[sidx * 4 + 3];
      const ax = lineBuf[sidx * 4], bx = lineBuf[sidx * 4 + 2];
      const mLo = Math.floor(Math.min(ay, by) / d);
      const mHi = Math.floor(Math.max(ay, by) / d) + 1;
      for (let m = mLo; m <= mHi; m++) {
        const Y = m * d;
        if ((ay < Y) !== (by < Y)) {
          crossings++;
          if (wantDots) {
            const tt = (Y - ay) / (by - ay);
            dots.push(ax + tt * (bx - ax), Y);
          }
        }
      }
    }
    return { crossings, dots };
  }

  // ---- honest headline labelling ---------------------------------------------
  // The card's big readout must NAME the quantity it is showing. This sim has
  // three modes and only two of them produce π, so the static piLabel ('π ≈')
  // cannot be right for all of them:
  //   • dimension mode shows a fractal DIMENSION D (e.g. 1.2619) — not π;
  //   • the fixed-diameter circle shows the PROOF constant (always 2 crossings
  //     per drop), not an estimate — see _isProofCircle below.
  // ControlPanel.build() reads getPiLabel()/getCountLabel() ONCE, so the mode /
  // shape / size selects call _syncPiLabel() to request a rebuild when — and
  // only when — the headline label actually changes.
  getPiLabel() {
    if (this.mode === 'dimension') return 'D ≈';
    if (this._isProofCircle()) return 'proof case ⇒ 2/(πd)';
    return this.constructor.piLabel;
  }

  // Hub badge vocabulary (js/hub.js CONVERGENCE_BADGES): exact | statistical |
  // biased | experimental | extension | legacy. Dimension mode measures no π at
  // all, so 'extension' ("not a π counter") is the honest existing value; the
  // π and race modes keep the class's 'statistical'. (The hub CARD is built from
  // the STATIC piNature, which stays 'statistical' — the sim's default mode.)
  getPiNature() {
    if (this.mode === 'dimension') return 'extension';
    return this.constructor.piNature;
  }

  // The fixed-diameter circle is the PROOF case, not a competitor. It spans
  // exactly one line period, so it meets the floor exactly twice wherever it
  // lands, and its own length is πd BY DEFINITION — so 2·Σℓ/(d·Σcross) returns
  // π to full precision from the very first drop. Printing that as an 8-digit
  // "estimate" alongside the honest π-free shapes would be a rigged scoreboard,
  // so the readout states the identity instead. Two nearby cases are genuine
  // estimators and are deliberately EXCLUDED here:
  //   • exponential SIZE randomises the diameter, killing the always-2 identity;
  //   • MCMC sampling ignores the shape entirely and drops needle-pins.
  _isProofCircle() {
    return this.mode === 'pi' && this.shapeType === 'circle'
      && this.lengthMode === 'fixed' && this.sampling === 'iid';
  }

  // Rebuild the control panel only when the headline label really changed, so a
  // shape/size tweak inside π mode does not reset the shared toggles for nothing.
  _syncPiLabel() {
    const label = this.getPiLabel();
    if (label === this._lastPiLabel) return;
    this._lastPiLabel = label;
    this.notifyControlsChanged();
  }

  getCollisionCount() {
    if (this.mode === 'dimension') return `${this.dimDrops} drops`;
    if (this.mode === 'race') return `${this.race ? this.race.n : 0} × 4`;
    return `${this.crossings}/${this.tosses}`;
  }

  getCountLabel() {
    if (this.mode === 'dimension') return `Fractal drops (× ${this.dimK} rulers)`;
    if (this.mode === 'race') return 'Drops (× 4 estimators)';
    if (this.sampling === 'mcmc') return 'Crossings / pin-samples';
    return 'Crossings / drops';
  }

  // The headline π̂ for a racing estimator (config i) — π-free Cauchy–Crofton.
  _racePi(i) {
    const c = this.race && this.race.configs[i];
    return c && c.cross > 0 ? (2 * c.sumL) / (this.spacing * c.cross) : 0;
  }

  getPiApproximation() {
    if (this.mode === 'dimension') { const f = this._fitD(); return isNaN(f.D) ? 0 : f.D; }
    if (this.mode === 'race') return this._racePi(0);   // the L̄=0.9 fixed leader
    if (this.crossings === 0) return 0;
    // π = 2 · Σlength / (d · Σcrossings). Σlength is a π-free Euclidean sum for
    // needle/bent/tangle; for the circle it is πd (so this returns π trivially).
    return (2 * this.sumLength) / (this.spacing * this.crossings);
  }

  getPiReadout() {
    if (this.mode === 'dimension') {
      const f = this._fitD();
      return isNaN(f.D) ? 'n/a' : `D ≈ ${f.D.toFixed(4)}`;
    }
    if (this.mode === 'race') { const p = this._racePi(0); return p > 0 ? p.toFixed(8) : 'n/a'; }
    // Proof case: report the FACT being proved (⟨X⟩ = 2), not eight digits of a
    // π that was put in by hand as the circle's length. No digit scoreboard.
    if (this._isProofCircle()) return 'exactly 2 crossings/drop';
    return this.crossings > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    if (this.mode === 'dimension') return this._dimensionHTML();
    if (this.mode === 'race') return this._raceHTML();
    if (this._isProofCircle()) return this._proofCircleHTML();

    const live = this.crossings > 0 ? piDigitsHTML(this.getPiApproximation(), 4) : 'collecting…';
    const avg = this.tosses > 0 ? (this.crossings / this.tosses) : 0;
    const expMode = this.lengthMode === 'exponential';
    const expNeedle = expMode && this.shapeType === 'needle';
    const expShape = expMode && this.shapeType !== 'needle';   // scaled non-needle shape
    const expCircle = expShape && this.shape.isCircle;
    // No fixed-size-circle branch here: that combination is the proof case and
    // already returned via _proofCircleHTML(). What remains is either a genuine
    // Σℓ/Σcross estimator (any non-circle shape, or the random-diameter circle)
    // or MCMC, which drops needle-pins and never uses the circle at all.

    let shapeName = {
      needle: 'needle', bent: 'bent V', tangle: 'tangle',
      fractal: `Koch depth ${this.fractalDepth != null ? this.fractalDepth : this.depth}`,
      quadric: `quadratic Koch depth ${this.fractalDepth != null ? this.fractalDepth : this.depth}`,
      cesaro: `Cesàro θ=${this.fractalAngle}°`, sierpinski: 'Sierpiński arrowhead',
      spiral: 'spiral', star: '{7/3} star', circle: 'circle Ø=d'
    }[this.shapeType];
    let Ld;
    if (this.sampling === 'mcmc') { shapeName = 'needle-pins'; Ld = this.lengthRatio; }
    else if (expNeedle) { shapeName = 'needle (Exp mean L̄)'; Ld = this.lengthRatio; }
    else if (expShape) { shapeName += ' (random size)'; Ld = this.shape.length / this.spacing; }
    else Ld = this.shape.length / this.spacing;

    const fractalNote = (this.shapeType === 'fractal' || this.shapeType === 'quadric') && !expMode && this.sampling !== 'mcmc'
      ? `<br><span style="opacity:.7;font-size:.85em">${this.shapeType === 'fractal' ? `Koch depth ${this.fractalDepth}: L = base·(4/3)<sup>${this.fractalDepth}</sup>` : `quadratic Koch depth ${this.fractalDepth}: L = base·2<sup>${this.fractalDepth}</sup>`} — length &amp; crossings explode together, yet π holds because E[X]=2L/(πd) sees only length${this.fractalClamped ? ' · depth clamped to fit the vertex cap' : ''}</span>`
      : '';
    const expNote = expNeedle
      ? `<br><span style="opacity:.85;font-size:.85em"><strong>Track-length estimator</strong> (neutron transport): each needle length L = −L̄·ln(u) is exponentially distributed, mean L̄ = ${(this.lengthRatio * this.spacing).toFixed(3)}. π = 2·Σℓ/(d·Σcrossings) sums track lengths — robust to the length law, only the MEAN matters.</span>${this._histSVG()}`
      : expShape
        ? `<br><span style="opacity:.85;font-size:.85em"><strong>Random size</strong>: every drop scales the ${shapeName.replace(' (random size)', '')} by an exponential factor −ln(u) (mean 1), so each drop's length varies wildly. π = 2·Σℓ/(d·Σcrossings) sums the varying lengths and still converges — only the MEAN size matters.${expCircle ? ' With a RANDOM diameter the circle no longer crosses “exactly 2” — it becomes an HONEST Σℓ/Σcross estimator (its length still carries π, so it demonstrates rather than independently computes π).' : ''}</span>${this._histSVG()}`
        : '';
    const mcmcNote = this.sampling === 'mcmc'
      ? `<br><span style="opacity:.85;font-size:.85em"><strong>MCMC sampling</strong>: ${this.MCMC_POOL} needle-pins evolve as a random walk on (y mod d, angle); a symmetric proposal on the uniform target is always accepted. The SAME estimator time-averages to π. Samples are CORRELATED, so effective sample size &lt; count and convergence is noisier per sample than i.i.d. — not better, just an honest chain that still recovers π.</span>`
      : '';

    return `
      <strong>Cauchy–Crofton</strong>:
      <span class="f-angle">E[X] = 2L/(πd)</span> — shape-independent<br>
      shape <span class="f-angle">${shapeName}</span>,
      L/d = <span class="f-angle">${Ld.toFixed(3)}</span>,
      ⟨crossings⟩ = <span class="f-count">${avg.toFixed(3)}</span><br>
      <span class="f-result">π</span> ≈
      2 · <span class="f-angle">Σℓ</span> /
      (<span class="f-angle">d</span> · <span class="f-count">${this.crossings}</span>)
      <br><span style="font-size:1.1em">π = ${live}</span>
      <br><span style="opacity:.7;font-size:.85em">same π from any shape — only the length matters (Cauchy–Crofton); the circle always crosses exactly twice, which fixes the 2/(πd)</span>${fractalNote}${expNote}${mcmcNote}
    `;
  }

  // The fixed-diameter circle: a PROOF, not an estimate. Presented as the
  // derivation it actually is — measured ⟨crossings⟩ (identically 2) on the left
  // of the identity, the pinned constant on the right — with no digit readout,
  // because π enters through the circle's own length πd and would come back out
  // to machine precision on the first drop. See _isProofCircle().
  _proofCircleHTML() {
    const avg = this.tosses > 0 ? (this.crossings / this.tosses) : 0;
    const exact = this.tosses > 0 && this.crossings === 2 * this.tosses;
    return `
      <strong>Circle Ø = d — the proof case</strong>, not an estimator<br>
      a circle of diameter d spans exactly one line period, so it meets the ruled
      floor <span class="f-count">twice</span> wherever it lands<br>
      ⟨crossings⟩ = <span class="f-count">${avg.toFixed(6)}</span>
      over <span class="f-count">${this.tosses}</span> drops${exact ? ' — exactly 2, every single one' : ''}<br>
      <span class="f-angle">E[X] = 2L/(πd)</span> with
      <span class="f-angle">L = πd</span> ⇒
      <span class="f-result">E[X] = 2</span> — an identity, so the constant is
      <span class="f-result">2/(πd)</span>
      <br><span style="opacity:.7;font-size:.85em">This drop PINS the Cauchy–Crofton constant; it does not compute π. The circle's length πd already contains π, so feeding it into π = 2·Σℓ/(d·Σcrossings) returns π exactly, from the first drop — no digits are earned, which is why none are shown. For an honest estimator pick a shape whose length is a π-free Euclidean sum (needle, bent V, tangle, Koch…), or set Size = exponential: a random diameter breaks the always-2 identity and turns even the circle into a real Σℓ/Σcross estimator.</span>
    `;
  }

  _raceHTML() {
    const R = this.race;
    if (!R) return 'collecting…';
    let rows = '';
    for (let i = 0; i < R.configs.length; i++) {
      const c = R.configs[i];
      const pi = this._racePi(i);
      const e = c.err.length ? c.err[c.err.length - 1] : NaN;
      rows += `<tr><td><span style="color:${c.color}">■</span> ${c.label}</td>`
        + `<td style="text-align:right">${pi > 0 ? pi.toFixed(5) : '—'}</td>`
        + `<td style="text-align:right">${isFinite(e) ? (e * 100).toFixed(3) + '%' : '—'}</td></tr>`;
    }
    // ONE top-level block wrapper: `.formula-readout` is itself a flex ROW capped
    // at 520px, so every top-level node returned here would otherwise become a
    // sibling flex ITEM and the chart would sit BESIDE the text, squeezing it into
    // an unreadable column. Wrapping restores block flow and gives the chart its
    // own full-width row.
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;width:100%;text-align:right">`
      + `<div><strong>Race</strong> — four independent Buffon estimators, one drop each per step<br>`
      + `<span style="opacity:.85">${R.n.toLocaleString()} drops · π̂ = 2·Σℓ/(d·Σcross) for each</span></div>`
      + this._raceSVG()
      + `<table style="width:100%;border-collapse:collapse;font-size:.85em">`
      + `<tr style="opacity:.6"><td style="text-align:left">estimator</td><td style="text-align:right">π̂</td><td style="text-align:right">|π̂−π|/π</td></tr>`
      + rows
      + `</table>`
      + `<div style="opacity:.72;font-size:.85em"><strong>Lesson — more crossings ⇒ faster.</strong> A longer needle makes more crossings per drop, so L̄=0.9 (gold) outruns L̄=0.3 (blue) — the dominant effect. At the long mean L̄=0.9, randomising the size (exponential, warm) adds variance and sits ABOVE its fixed twin. (At short mean the picture flips — the Σℓ/Σcross ratio correlates a long draw's extra length with its extra crossings, which cancels some variance, so 0.3-exp can even beat 0.3-fixed. An honest subtlety, not a bug.) All four fall as N<sup>−1/2</sup> (dashed) — none beats Monte-Carlo scaling; they differ only by the constant set by per-drop variance.</div>`
      + `<div style="opacity:.72;font-size:.85em"><strong>Phase disc (right).</strong> Every crossing is plotted at angle = the needle's orientation and radius = its gap to the nearest line, so hits fill two origin-tangent lobes of size L/d. The gold (longest) lobes reach furthest — that larger crossing region is exactly why it crosses more per drop. Fixed sizes give crisp lobes; exponential sizes smear them wider and fuzzier — the extra variance, drawn.</div>`
      + `</div>`;
  }

  // Four relative-error curves |π̂−π|/π vs N, log–log, one colour each + a legend
  // and an N^−1/2 reference slope. Inline SVG (no per-frame geometry allocation).
  _raceSVG() {
    const R = this.race;
    if (!R || R.sampleN.length < 2) return '';
    const W = 260, H = 168, ml = 40, mr = 10, mt = 10, mb = 26;
    const L10 = Math.log(10);
    const xs = R.sampleN.map((n) => Math.log(Math.max(1, n)) / L10);
    // Collect finite log-errors across all configs to fix the y-range.
    let ymin = Infinity, ymax = -Infinity, xmin = xs[0], xmax = xs[xs.length - 1];
    const logErr = R.configs.map((c) => c.err.map((e) => (isFinite(e) && e > 0) ? Math.log(e) / L10 : NaN));
    for (const arr of logErr) for (const v of arr) { if (isFinite(v)) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; } }
    if (!isFinite(ymin)) return '';
    if (ymax - ymin < 0.5) { ymax += 0.25; ymin -= 0.25; }
    if (xmax - xmin < 1e-9) xmax = xmin + 1;
    const px = (x) => ml + (x - xmin) / (xmax - xmin) * (W - ml - mr);
    const py = (y) => H - mb - (y - ymin) / (ymax - ymin) * (H - mt - mb);
    let paths = '';
    for (let i = 0; i < R.configs.length; i++) {
      const arr = logErr[i];
      let dstr = '', started = false;
      for (let k = 0; k < arr.length; k++) {
        if (!isFinite(arr[k])) { started = false; continue; }
        dstr += (started ? 'L' : 'M') + px(xs[k]).toFixed(1) + ' ' + py(arr[k]).toFixed(1) + ' ';
        started = true;
      }
      if (dstr) paths += `<path d="${dstr}" fill="none" stroke="${R.configs[i].color}" stroke-width="1.6"/>`;
    }
    // N^−1/2 reference slope through the top-left of the data band.
    const refY0 = ymax;
    const ry1 = refY0, ry2 = refY0 - 0.5 * (xmax - xmin);
    const ref = `<line x1="${px(xmin).toFixed(1)}" y1="${py(ry1).toFixed(1)}" x2="${px(xmax).toFixed(1)}" y2="${py(ry2).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity="0.45"/>`;
    const axis = `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/><line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`;
    let legend = '';
    for (let i = 0; i < R.configs.length; i++) {
      const c = R.configs[i], lx = ml + 6 + (i % 2) * 108, ly = mt + 6 + Math.floor(i / 2) * 13;
      legend += `<rect x="${lx}" y="${ly - 6}" width="8" height="8" fill="${c.color}"/><text x="${lx + 11}" y="${ly + 1}" font-size="8" fill="currentColor" opacity="0.85">${c.label}</text>`;
    }
    const cy = ((mt + H - mb) / 2).toFixed(1);
    // display:block + its own row in the wrapper: the chart no longer sits beside
    // the text, so it can use the readout's full width (the viewBox scales, so the
    // 260×168 aspect stays undistorted).
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:470px;margin-top:2px;overflow:visible;color:inherit">
      ${axis}${ref}${paths}${legend}
      <text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">log₁₀ N (drops)</text>
      <text x="11" y="${cy}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle" transform="rotate(-90 11 ${cy})">log₁₀ |π̂−π|/π</text>
    </svg>`;
  }

  _dimensionHTML() {
    const f = this._fitD();
    const name = {
      needle: 'needle (smooth, D=1)', bent: 'bent V (D=1)', tangle: 'tangle (D=1)',
      fractal: 'Koch curve', quadric: 'quadratic Koch (Minkowski)',
      cesaro: `Cesàro θ=${this.fractalAngle}° (tunable D)`, sierpinski: 'Sierpiński arrowhead',
      spiral: 'spiral (D=1)', star: '{7/3} star (D=1)', circle: 'circle (D=1)'
    }[this.shapeType];
    const Dtxt = isNaN(f.D) ? 'collecting…' : f.D.toFixed(4);
    const r2txt = isNaN(f.D) ? '–' : f.r2.toFixed(4);
    const plot = isNaN(f.D) ? '' : this._loglogSVG(f);
    const shapeNote = this.shapeType === 'cesaro'
      ? `<div style="opacity:.85;font-size:.85em"><strong>Tunable dimension</strong>: the Cesàro curve replaces each segment by 2 at base angle θ=${this.fractalAngle}°, so its similarity dimension is D = log2 / log(2·cos θ) = <strong>${this.dimTrueD.toFixed(4)}</strong>. Drag the angle slider and watch the MEASURED slope track the theory continuously from ≈1 (θ→0) toward 2 (θ→45°).</div>`
      : this.shapeType === 'sierpinski'
        ? `<div style="opacity:.85;font-size:.85em">The Sierpiński arrowhead triples the segments and halves the length each level: D = log3/log2 ≈ 1.585.</div>`
        : '';
    // Same own-row wrapper as _raceHTML: without it the inline log–log plot becomes
    // a sibling flex item of the text inside the `.formula-readout` flex row.
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;width:100%;text-align:right">`
      + `<div><strong>Fractal dimension</strong> — Richardson via Cauchy–Crofton<br>`
      + `shape <span class="f-angle">${name}</span> · ${this.dimDrops} drops · ${this.dimK} rulers<br>`
      + `E[crossings @ spacing d] ∝ d<sup>−D</sup>, resolving the curve to each ruler scale d<sub>k</sub><br>`
      + `slope of log⟨X⟩ vs log(1/d): <span class="f-result">D ≈ ${Dtxt}</span>`
      + `&nbsp;(true D = ${this.dimTrueD.toFixed(4)}, R² = ${r2txt})</div>`
      + plot
      + shapeNote
      + `<div style="opacity:.7;font-size:.85em">A straight needle → D≈1; the Koch curve → log4/log3≈1.2619; the quadratic Koch → log8/log4=1.5; the Cesàro curve is continuously tunable via θ. Each ruler d<sub>k</sub> only resolves detail down to its own scale, so ⟨crossings⟩ tracks the resolvable length ∝ d<sup>1−D</sup>, i.e. ⟨crossings⟩ ∝ d<sup>−D</sup>. (Counting one full-detail curve against every ruler would just measure its true length → slope 1.)</div>`
      + `</div>`;
  }

  _loglogSVG(f) {
    const xs = f.xs, ys = f.ys, n = xs.length;
    if (n < 2) return '';
    const W = 240, H = 150, ml = 34, mr = 10, mt = 10, mb = 24;
    let xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    if (xmax - xmin < 1e-9) xmax = xmin + 1;
    if (ymax - ymin < 1e-9) ymax = ymin + 1;
    const px = (x) => ml + (x - xmin) / (xmax - xmin) * (W - ml - mr);
    const py = (y) => H - mb - (y - ymin) / (ymax - ymin) * (H - mt - mb);
    const y1 = f.D * xmin + f.b, y2 = f.D * xmax + f.b;
    let dots = '';
    for (let i = 0; i < n; i++) dots += `<circle cx="${px(xs[i]).toFixed(1)}" cy="${py(ys[i]).toFixed(1)}" r="3" fill="#f5c542"/>`;
    const line = `<line x1="${px(xmin).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(xmax).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="#5bd0ff" stroke-width="1.5"/>`;
    const axis = `<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/><line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>`;
    const cy = ((mt + H - mb) / 2).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:440px;margin-top:2px;overflow:visible;color:inherit">
      ${axis}${line}${dots}
      <text x="${((ml + W - mr) / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">log(1/d)</text>
      <text x="10" y="${cy}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle" transform="rotate(-90 10 ${cy})">log⟨X⟩</text>
    </svg>`;
  }

  _histSVG() {
    if (!this.hist || this.histN < 1) return '';
    const HB = this.hist.length, W = 240, H = 90, mb = 16, mt = 6, ml = 6, mr = 6;
    let hmax = 1;
    for (let i = 0; i < HB; i++) if (this.hist[i] > hmax) hmax = this.hist[i];
    const bw = (W - ml - mr) / HB;
    let bars = '';
    for (let i = 0; i < HB; i++) {
      const h = (this.hist[i] / hmax) * (H - mt - mb);
      bars += `<rect x="${(ml + i * bw).toFixed(1)}" y="${(H - mb - h).toFixed(1)}" width="${(bw * 0.86).toFixed(1)}" height="${h.toFixed(1)}" fill="#7fd08c"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:270px;margin-top:6px">
      <line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="currentColor" opacity="0.4"/>${bars}
      <text x="${W / 2}" y="${H - 4}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">${this.shapeType === 'needle' ? 'needle length L' : 'curve length ℓ'} — exponential (mean = fixed size)</text>
    </svg>`;
  }

  getPhasePoint() {
    if (this.mode === 'race') return [];   // race uses the coloured lobe overlays, not one trail
    return [...this.lastPhasePoint];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  // RACE: four colour-coded crossing-point clouds, one per estimator, painted
  // additively into the phase disc. Each fills its crossing lobe ρ ≤ (L/d)|sinθ|;
  // the longer-needle lobes reach further out — the visual reason they cross more
  // and converge faster. (Fixed needles → crisp lobes; exponential → fuzzy, larger-
  // reaching lobes, the added-variance story.) Empty in every non-race mode.
  getOverlayTrails() {
    if (this.mode !== 'race' || !this.race) return [];
    return this.race.configs.map((cfg) => ({ trail: cfg.lobe, color: cfg.colorNum, opacity: 0.9 }));
  }

  getOverlayRenderMode() {
    return this.mode === 'race' ? 'pixel' : 'line';
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 10);
    this.simCamera.position.z = 1;

    const linePoints = [];
    for (let y = -1; y <= 1.001; y += this.spacing) {
      linePoints.push(new THREE.Vector3(-1, y, 0), new THREE.Vector3(1, y, 0));
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(linePoints),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
    ));

    // One pooled line buffer for every dropped shape / evolving pin; colour
    // encodes hit/miss and recency fade via vertex colours.
    const shapePos = new Float32Array(this.MAX_VERTS * 3);
    const shapeCol = new Float32Array(this.MAX_VERTS * 3);
    this.shapeGeom = new THREE.BufferGeometry();
    this.shapeGeom.setAttribute('position', new THREE.BufferAttribute(shapePos, 3));
    this.shapeGeom.setAttribute('color', new THREE.BufferAttribute(shapeCol, 3));
    this.shapeGeom.setDrawRange(0, 0);
    this.shapeLines = new THREE.LineSegments(
      this.shapeGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 })
    );
    this.simScene.add(this.shapeLines);

    // Crossing markers.
    const dotPos = new Float32Array(this.MAX_DOTS * 3);
    const dotCol = new Float32Array(this.MAX_DOTS * 3);
    this.dotGeom = new THREE.BufferGeometry();
    this.dotGeom.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
    this.dotGeom.setAttribute('color', new THREE.BufferAttribute(dotCol, 3));
    this.dotGeom.setDrawRange(0, 0);
    this.dots = new THREE.Points(
      this.dotGeom,
      new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 })
    );
    this.simScene.add(this.dots);
  }

  updateSimScene() {
    if (!this.shapeGeom || !this.dotGeom) return;

    // MCMC: draw the evolving pins directly from their live state (overwriting
    // the pooled buffer each frame — no allocation).
    if (this.mode === 'pi' && this.sampling === 'mcmc' && this.pins) {
      this._drawPins();
      return;
    }

    // RACE: draw the four estimators' latest needles in their legend colours.
    if (this.mode === 'race' && this.race) {
      this._drawRace();
      return;
    }

    const pos = this.shapeGeom.attributes.position.array;
    const col = this.shapeGeom.attributes.color.array;
    const dpos = this.dotGeom.attributes.position.array;
    const dcol = this.dotGeom.attributes.color.array;

    const n = this.shapes.length;
    let v = 0;      // vertex cursor (shape lines)
    let dp = 0;     // point cursor (dots)

    for (let idx = 0; idx < n; idx++) {
      const shp = this.shapes[idx];
      const fade = 0.28 + 0.72 * ((idx + 1) / n);   // newest brightest
      // hit = gold, miss = blue
      const r = shp.crossed ? 0.97 * fade : 0.30 * fade;
      const g = shp.crossed ? 0.79 * fade : 0.79 * fade;
      const b = shp.crossed ? 0.28 * fade : 0.94 * fade;

      const lb = shp.lineBuf;
      for (let s = 0; s < shp.segCount; s++) {
        if (v + 2 > this.MAX_VERTS) break;
        pos[v * 3] = lb[s * 4]; pos[v * 3 + 1] = lb[s * 4 + 1]; pos[v * 3 + 2] = 0;
        col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b; v++;
        pos[v * 3] = lb[s * 4 + 2]; pos[v * 3 + 1] = lb[s * 4 + 3]; pos[v * 3 + 2] = 0;
        col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b; v++;
      }

      const dd = shp.dots;
      if (dd) {
        for (let k = 0; k < dd.length; k += 2) {
          if (dp >= this.MAX_DOTS) break;
          dpos[dp * 3] = dd[k]; dpos[dp * 3 + 1] = dd[k + 1]; dpos[dp * 3 + 2] = 0.01;
          dcol[dp * 3] = 1.0 * fade; dcol[dp * 3 + 1] = 0.55 * fade; dcol[dp * 3 + 2] = 0.18 * fade;
          dp++;
        }
      }
    }

    this.shapeGeom.attributes.position.needsUpdate = true;
    this.shapeGeom.attributes.color.needsUpdate = true;
    this.shapeGeom.setDrawRange(0, v);
    this.dotGeom.attributes.position.needsUpdate = true;
    this.dotGeom.attributes.color.needsUpdate = true;
    this.dotGeom.setDrawRange(0, dp);
  }

  _drawPins() {
    const pos = this.shapeGeom.attributes.position.array;
    const col = this.shapeGeom.attributes.color.array;
    const dpos = this.dotGeom.attributes.position.array;
    const dcol = this.dotGeom.attributes.color.array;
    const d = this.spacing, L = this.lengthRatio * d;
    let v = 0, dp = 0;
    for (let i = 0; i < this.pins.length; i++) {
      const p = this.pins[i];
      const cy = p.row + p.y, cx = p.x;
      const dx = 0.5 * L * p.dirx, dy = 0.5 * L * p.diry;
      const r = p.crossed ? 0.97 : 0.30, g = 0.79, b = p.crossed ? 0.28 : 0.94;
      pos[v * 3] = cx - dx; pos[v * 3 + 1] = cy - dy; pos[v * 3 + 2] = 0;
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b; v++;
      pos[v * 3] = cx + dx; pos[v * 3 + 1] = cy + dy; pos[v * 3 + 2] = 0;
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b; v++;
      if (p.crossed && dp < this.MAX_DOTS) {
        const Y = Math.round(cy / d) * d;
        dpos[dp * 3] = cx; dpos[dp * 3 + 1] = Y; dpos[dp * 3 + 2] = 0.01;
        dcol[dp * 3] = 1.0; dcol[dp * 3 + 1] = 0.55; dcol[dp * 3 + 2] = 0.18; dp++;
      }
    }
    this.shapeGeom.attributes.position.needsUpdate = true;
    this.shapeGeom.attributes.color.needsUpdate = true;
    this.shapeGeom.setDrawRange(0, v);
    this.dotGeom.attributes.position.needsUpdate = true;
    this.dotGeom.attributes.color.needsUpdate = true;
    this.dotGeom.setDrawRange(0, dp);
  }

  // RACE: draw the recent drops thrown at RANDOM positions across the floor, each
  // in its estimator's legend colour (hits bright, misses dimmed), newest brightest.
  // Overwrites the pooled buffers each frame — no allocation.
  _drawRace() {
    const pos = this.shapeGeom.attributes.position.array;
    const col = this.shapeGeom.attributes.color.array;
    const dpos = this.dotGeom.attributes.position.array;
    const dcol = this.dotGeom.attributes.color.array;
    const d = this.spacing;
    const recent = this.race.recent;
    const n = recent.length;
    let v = 0, dp = 0;
    for (let i = 0; i < n; i++) {
      const sdrop = recent[i];
      const fade = 0.30 + 0.70 * ((i + 1) / n);        // newest brightest
      const m = sdrop.crossed ? 1.0 : 0.40;            // dim the misses, keep the hue
      const rgb = sdrop.rgb;
      const r = rgb[0] * fade * m, g = rgb[1] * fade * m, b = rgb[2] * fade * m;
      if (v + 2 > this.MAX_VERTS) break;
      pos[v * 3] = sdrop.x0; pos[v * 3 + 1] = sdrop.y0; pos[v * 3 + 2] = 0;
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b; v++;
      pos[v * 3] = sdrop.x1; pos[v * 3 + 1] = sdrop.y1; pos[v * 3 + 2] = 0;
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b; v++;
      // Crossing marker: dot on the ruled line the needle actually crosses.
      if (sdrop.crossed && dp < this.MAX_DOTS && sdrop.y1 !== sdrop.y0) {
        const midy = 0.5 * (sdrop.y0 + sdrop.y1);
        const Y = Math.round(midy / d) * d;
        const u = (Y - sdrop.y0) / (sdrop.y1 - sdrop.y0);
        if (u >= 0 && u <= 1) {
          dpos[dp * 3] = sdrop.x0 + u * (sdrop.x1 - sdrop.x0); dpos[dp * 3 + 1] = Y; dpos[dp * 3 + 2] = 0.01;
          dcol[dp * 3] = rgb[0]; dcol[dp * 3 + 1] = rgb[1]; dcol[dp * 3 + 2] = rgb[2]; dp++;
        }
      }
    }
    this.shapeGeom.attributes.position.needsUpdate = true;
    this.shapeGeom.attributes.color.needsUpdate = true;
    this.shapeGeom.setDrawRange(0, v);
    this.dotGeom.attributes.position.needsUpdate = true;
    this.dotGeom.attributes.color.needsUpdate = true;
    this.dotGeom.setDrawRange(0, dp);
  }

  getPreviewBox() {
    return { x0: -1.05, x1: 1.05, y0: -1.05, y1: 1.05 };
  }
}

registerSim(BuffonNeedle);
