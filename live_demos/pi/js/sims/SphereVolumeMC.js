import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so rescale to make the sample-rate slider read in points per wall-clock
// second at speed 1 / 60 fps (same convention as GaltonBoardPi).
const TIME_SCALE = 16.7;
const TURBO_MULT = 1000;

// First primes — one per axis — for the Halton low-discrepancy sequence.
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];

// Convergence-plot scaling: x = log10(N) mapped [0, LOGN_MAX] → [−1, 1];
// y = relative error × ERR_SCALE, clamped to [−1, 1].
const LOGN_MAX = 7;
const ERR_SCALE = 6;

// Theoretical inside-fraction f = V_n / 2^n per dimension — DISPLAY ONLY
// (the estimator never touches these; they just caption the shrinkage).
const F_LABELS = {
  2: '0.785', 3: '0.524', 4: '0.308', 5: '0.164',
  6: '0.0807', 7: '0.0369', 8: '0.0159'
};

// ── CONCENTRATION-OF-MEASURE view ──────────────────────────────────────────
// Histogram of the distance |x| = √(Σxᵢ²) of the uniform cube samples. As n
// grows the whole distribution MARCHES RIGHT (its mean sits at √(n/3), far
// outside the unit ball) and narrows relative to the axis, so the shaded
// inside-mass to the LEFT of |x| = 1 — which IS the inside-fraction f = Vₙ/2ⁿ
// — visibly vanishes. All render-only; the estimator is untouched.
const NBINS = 96;
const R_MAX = Math.sqrt(8);            // largest possible |x| across dims 2..8 → fixed plot axis
const SIGMA_R = Math.sqrt(1 / 15);     // asymptotic std of |x| for a uniform-cube point (delta method)
// E[x²]=1/3, E[x⁴]=1/5 for x∼U(−1,1) ⇒ E|x|≈√(n/3), Var|x|≈1/15 (≈const): marching-right, narrowing.
const CONC_REF = [
  { n: 2, hex: 0x4cc9f0, css: '#4cc9f0' },
  { n: 4, hex: 0x6ee36e, css: '#6ee36e' },
  { n: 6, hex: 0xf7c948, css: '#f7c948' },
  { n: 8, hex: 0xff6b6b, css: '#ff6b6b' },
];

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// The pi-free rational coefficient K in  f = π^p / K  with p = floor(dim/2):
//   V_n = π^(n/2)/Γ(n/2+1),  f = V_n/2^n.
//   even dim = 2m:   f = π^m /(m! · 4^m)          → K = m! · 4^m
//   odd  dim = 2m+1: f = m! · π^m /(2m+1)!        → K = (2m+1)! / m!
// K is built from integer factorials only — NO Math.PI anywhere.
function coeffK(dim) {
  const m = Math.floor(dim / 2);
  if (dim % 2 === 0) return factorial(m) * Math.pow(4, m);
  return factorial(2 * m + 1) / factorial(m);
}

// π̂ from the measured inside-fraction:  π = (K · f)^(1/p),  p = floor(dim/2).
function piFromFraction(f, dim) {
  const p = Math.floor(dim / 2);
  if (f <= 0) return 0;
  return Math.pow(coeffK(dim) * f, 1 / p);
}

// Van der Corput radical inverse — pure integer digit reversal in the given
// base. No π, no trig: just modulo/divide on the sample index.
function radicalInverse(base, index) {
  let result = 0, f = 1 / base, i = index;
  while (i > 0) {
    result += (i % base) * f;
    i = Math.floor(i / base);
    f /= base;
  }
  return result; // in [0, 1)
}

// Human-readable extraction rule per dimension, e.g. "4·f", "√(32·f)", "(384·f)^(1/3)".
function extractionText(dim) {
  const p = Math.floor(dim / 2);
  const K = coeffK(dim);
  if (p === 1) return `${K}·f`;
  if (p === 2) return `√(${K}·f)`;
  return `(${K}·f)^(1/${p})`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  WHAT THE d ≥ 4 CLOUD SHOWS  (RENDER ONLY — never touches the estimator).
//  TWO channels, and only two:
//    • POSITION = (x₁,x₂,x₃) — the first three coordinates, in a rotating cloud.
//    • COLOUR   = |x| = √(Σᵢxᵢ²) — the FULL radius of the sample, on a FIXED
//      0 → 1 ramp (blue at the centre → white at ½ → red on the shell).
//
//  An earlier version folded x₄…x₈ into a growing colour ladder plus a size
//  channel (x₇) and an opacity channel (x₈). Mapping x₇ to a dot radius teaches
//  exactly one thing — that x₇ exists — and worse, those legends INVERTED the
//  lesson: every marginal coordinate of a uniform n-ball point concentrates on 0
//  as n grows, yet they drew full −1 → +1 ramps advertising variation the
//  geometry is actively suppressing.
//
//  |x| does the opposite: it makes the concentration visible. Inside points are
//  uniform in the unit n-ball, where |x| has density n·r^(n−1) — it piles up ON
//  THE SHELL as n climbs (E|x| = n/(n+1); the share below |x| = 0.7 is 0.7ⁿ,
//  i.e. 24.0% at n = 4 but 5.8% at n = 8). Because the ramp is pinned to the
//  absolute range [0, 1] and is NEVER renormalised per dimension, raising n
//  literally drains the blue and white out of the cloud — including at its
//  visual CENTRE, where a point with a small (x₁,x₂,x₃) can still sit at |x| ≈ 1
//  with all of its length hidden in the coordinates you cannot see. That is the
//  same story the 'Concentration' and 'Volume' views tell, told a third way.
//  colorForPoint / radiusForPoint are PURE so the encoding is testable.
//
//  The two view overrides, and what they do to the colour (_buildLegendHUD):
//    • SPLIT (needs d ≥ 6) puts x₁,x₂,x₃ in the left panel's position and
//      x₄,x₅,x₆ in the right's. |x| is a property of the whole vector, so ONE
//      colour rule is true of both panels — and it is not a restatement of
//      either panel's position, so no per-panel caveat is needed. Below d = 6
//      there are not enough coordinates for a second panel and the single cloud
//      renders instead; the legend says so on screen rather than silently.
//    • SLICE pins x_d ≈ 0. It CANNOT collapse this channel (the colour is still
//      the full norm), but conditioning on the slab does pull the shown |x| a
//      little low, which _buildRadiusColorbar states where it can be read.
// ─────────────────────────────────────────────────────────────────────────────

function clamp1(x) { return x < -1 ? -1 : x > 1 ? 1 : x; }

// Diverging colormap over a scalar t ∈ [−1, 1]:  −1 → blue, 0 → white, +1 → red.
const CB_NEG = [0.16, 0.55, 1.00]; // blue   (t = −1)
const CB_MID = [0.93, 0.94, 0.98]; // white  (t =  0)
const CB_POS = [1.00, 0.35, 0.30]; // red    (t = +1)
function divergingRGB(t, out) {
  const s = clamp1(t);
  let a, b, u;
  if (s < 0) { a = CB_NEG; b = CB_MID; u = s + 1; } // [−1,0] → u∈[0,1]
  else       { a = CB_MID; b = CB_POS; u = s; }     // [ 0,1] → u∈[0,1]
  out[0] = a[0] + (b[0] - a[0]) * u;
  out[1] = a[1] + (b[1] - a[1]) * u;
  out[2] = a[2] + (b[2] - a[2]) * u;
  return out;
}

// |x| = √(Σxᵢ²) of a cloud point. `pt.r` is cached at sample time — the inside
// test already formed the sum of squares, so the radius the colour channel wants
// costs one sqrt and no extra allocation. The fallback keeps the helper PURE and
// testable against a bare {c:[…]} record.
export function radiusForPoint(pt, dim) {
  if (typeof pt.r === 'number') return pt.r;
  const c = pt.c;
  let s = 0;
  for (let j = 0; j < dim; j++) s += c[j] * c[j];
  return Math.sqrt(s);
}

// THE ONE COLOUR CHANNEL: radius |x| ∈ [0,1] on a FIXED absolute ramp —
// 0 → blue (centre), ½ → white, 1 → red (shell). Writes into `out=[r,g,b]`
// (allocating only when omitted — never in the render loop).
// The scale is DIMENSION-INDEPENDENT on purpose: `dim` only says how many
// coordinates to sum, never how to normalise. Auto-scaling per dimension would
// rescale away the very effect this channel exists to show — as n climbs the
// whole cloud must be seen sliding into the shell colour.
export function colorForPoint(pt, dim, out = [0, 0, 0]) {
  return divergingRGB(2 * radiusForPoint(pt, dim) - 1, out);
}

// Legend reference threshold: the share of a uniform n-ball's points below this
// radius is exactly 0.7ⁿ — 24.0% at n = 4, 5.8% at n = 8. Display only.
const R_LOW = 0.7;
// Frames between rebuilds of the live |x| readout string (see _updateHiDim).
const RSTAT_EVERY = 12;

// ─────────────────────────────────────────────────────────────────────────────
//  VOLUME view — inline GLSL ray-march. PURE AESTHETICS: it reads nothing back
//  into the π estimate (which keeps running underneath). Strings are inline
//  because the CSP forbids external shader files.
//
//  WHAT IS TRUE HERE — and only this:
//      ρ₃(r) ∝ (1 − r²)^((n−3)/2)   for r = |x₁,x₂,x₃| ≤ 1, else 0
//  is the genuine marginal density of the first three coordinates of a point
//  drawn uniformly in the unit n-ball. As n climbs the exponent grows, so the
//  glow CONCENTRATES ever more sharply toward the centre — the same
//  concentration-of-measure story the estimator lives on, rendered as light.
//  ρ₃ is the RADIAL ENVELOPE and it is the ONLY term that knows about n.
//
//  WHAT IS DECORATION: ρ₃ depends on r alone, so the field it defines is
//  perfectly spherically symmetric — which is exactly why this view used to look
//  frozen: an orbiting camera around a spherically symmetric field renders a
//  pixel-identical image from every angle. So we MULTIPLY ρ₃ by a bounded,
//  time-advected, domain-warped value-noise flow (`flowFBM`, ∈ [0,1]) that gives
//  the interior nebula-like churn and gives the orbit something real to
//  parallax against. That texture has NO statistical meaning whatsoever.
//  Because it only ever multiplies, the radial profile keeps its shape and the
//  n → sharper-core story survives intact.
//
//  n is clamped to ≥ 3 in the shader (the first-three-coord density needs n ≥ 3;
//  n = 3 is the uniform ball, exponent 0). The march is analytic (ray↔unit
//  sphere), front-to-back, with early-ray-termination on accumulated alpha.
// ─────────────────────────────────────────────────────────────────────────────
const VOL_STEPS = 72;                 // march samples across the ball (60fps-friendly)
const VOL_DT = 0.016;                 // dedicated flow-clock tick (≈ seconds at 60 fps)

const VOL_VERT = `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const VOL_FRAG = `
  varying vec3 vWorld;
  uniform float uN;      // effective dimension (≥ 3)
  uniform float uTime;   // dedicated flow clock, ≈ seconds (advanced VOL_DT per frame)
  uniform int   uSteps;  // march sample count

  // ── THE HONEST TERM ───────────────────────────────────────────────────────
  // Marginal 3D density (unnormalised so ρ₃(0)=1): peakier as n grows. This is
  // the ONLY term that depends on the dimension, and it depends only on r — so
  // the radial profile alone carries the concentration-of-measure story.
  float rho3(float r) {
    float s = 1.0 - r * r;
    if (s <= 0.0) return 0.0;
    return pow(s, (uN - 3.0) * 0.5);
  }

  // Deep-blue core → cyan → warm rim, indexed by the (normalised) density.
  vec3 colormap(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 warm = vec3(1.00, 0.55, 0.22);
    vec3 cyan = vec3(0.16, 0.86, 1.00);
    vec3 core = vec3(0.22, 0.36, 1.00);
    vec3 col = mix(warm, cyan, smoothstep(0.0, 0.5, t));
    col      = mix(col,  core, smoothstep(0.5, 1.0, t));
    return col;
  }

  // ── THE DECORATIVE TERM ───────────────────────────────────────────────────
  // A bounded, time-advected, domain-warped value-noise field. No statistical
  // meaning: it exists to break the perfect spherical symmetry of ρ₃ (so the
  // orbiting camera gets genuine parallax instead of a pixel-identical image
  // from every angle) and to make the interior visibly churn.
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Smooth value noise: trilinear blend of the hash at the 8 lattice corners,
  // with the classic smoothstep fade → C¹ everywhere. This replaces the old
  // floor(hash) lattice, whose blockiness was what made the shimmer read as a
  // static grid rather than as flow.
  float vnoise(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = p - ip;
    vec3 w = fp * fp * (3.0 - 2.0 * fp);
    float n000 = hash13(ip + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(ip + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(ip + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(ip + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(ip + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(ip + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(ip + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(ip + vec3(1.0, 1.0, 1.0));
    float x00 = mix(n000, n100, w.x);
    float x10 = mix(n010, n110, w.x);
    float x01 = mix(n001, n101, w.x);
    float x11 = mix(n011, n111, w.x);
    return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z);   // → [0, 1]
  }

  // 3-octave FBM (freq ×2 per octave) where each octave DOMAIN-WARPS the next and
  // every octave is advected along its own drift, so the structure shears and
  // churns instead of merely fading. Weights sum to 1, and vnoise ∈ [0,1], so the
  // result is provably bounded to [0, 1]. Cost: 3 × 8 = 24 hashes per march step.
  float flowFBM(vec3 p, float t) {
    float n1 = vnoise(p * 1.7 + vec3(0.15, -0.60, 0.28) * t);
    float n2 = vnoise(p * 3.4 + vec3(-0.32, 0.36, 0.19) * t
                      + vec3(1.7 * n1, 1.2 * n1, -1.5 * n1));
    float n3 = vnoise(p * 6.9 + vec3(0.24, -0.44, -0.14) * t
                      + vec3(-1.3 * n2, 1.1 * n2, 0.9 * n2));
    return n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - cameraPosition);

    // Analytic ray ↔ unit sphere (centred at origin).
    float b = dot(ro, rd);
    float c = dot(ro, ro) - 1.0;
    float disc = b * b - c;
    if (disc <= 0.0) discard;
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.0);
    float t1 = -b + sq;
    if (t1 <= t0) discard;

    float dt = (t1 - t0) / float(uSteps);
    float t = t0 + 0.5 * dt;

    vec3 col = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < 256; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * t;
      float rho = rho3(length(p));                          // TRUE radial marginal density
      if (rho > 0.0018) {
        // Decorative flow, contrast-shaped into filaments. flowFBM ∈ [0,1] and
        // the shaping is a smoothstep, so g ∈ [0,1] and the multiplier stays
        // inside [0.28, 1.58] — strong enough to read as motion (vs the old ±14%
        // that was invisible), but ρ₃ remains the recognisable envelope because
        // the flow only ever MULTIPLIES it and never touches its n-dependence.
        float g = smoothstep(0.38, 0.64, flowFBM(p, uTime));
        float dens = rho * (0.28 + 1.30 * g);
        float a = 1.0 - exp(-dens * dt * 5.4);              // step opacity (step-count robust)
        vec3  e = colormap(rho)                             // hue keyed on the TRUE density
                  * (0.35 + 0.95 * rho)                     // emissive glow, brighter in the core
                  * (0.55 + 0.90 * g);                      // brightness rides the flow (mean ≈ 1)
        col   += (1.0 - alpha) * a * e;                     // front-to-back compositing
        alpha += (1.0 - alpha) * a;
        if (alpha > 0.985) break;                           // early-ray termination
      }
      t += dt;
    }
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Radius of a cloud instance — the SAME for every point (there is no size
// channel any more) — and the depth at which the camera-anchored HUD sits in
// front of the lens.
const CLOUD_R = 0.028;
const HUD_Z = -2.4;
// The legend was laid out for a frustum ~1.9x bigger than the 35° camera actually
// shows at HUD_Z, so it spilled off every edge. Parent it to one group and shrink
// that group to map the whole layout back inside the visible frustum.
const HUD_S = 0.5;
const SPLIT_OFF = 1.28;   // half-separation of the two split-view panels

// Every encoding caption is prefixed with this scope: position and colour
// describe the INSIDE points and nothing else. The rejected darts are drawn as
// unencoded grey dots (see _buildMissLegend), so an unqualified "colour = |x|"
// would be a claim about markers that ignore it.
// The split variants keep the per-panel wording readable on one line.
const SCOPE = 'inside points: ';
const SCOPE_SPLIT_L = 'inside points, left: ';
const SCOPE_SPLIT_R = 'inside points, right: ';

export class SphereVolumeMC extends Simulation {
  static id = 'sphere-volume-mc';
  static title = 'Monte Carlo — dimensions and discrepancy';
  static description = 'Random and low-discrepancy darts pull π out of the n-ball across dimensions 2–8 — watch the inside-fraction collapse and Halton beat random';
  static piMechanism = 'statistical: inside-fraction f = Vₙ/2ⁿ gives π cleanly per dimension (π = 4f, 6f, √32f, …); Halton quasi-random converges ~1/N vs random ~1/√N';
  static rigor = 'Statistical';
  static sortOrder = 77;
  static previewSteps = 70;
  // Hub thumbnail always shows the rotating 3D ball, whatever the live dim is.
  static previewParams = { dim: 3 };
  static alternatives = [
    { id: 'circle-coverage', label: 'Circle coverage (2D)' },
    { id: 'gauss-circle-lattice', label: 'Gauss circle lattice' },
    { id: 'visible-lattice-trees', label: 'Visible lattice points' },
  ];
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static explanation = {
    setup: 'Throw uniformly-random points into the cube [−1, 1]ⁿ and mark each one that lands inside the unit n-ball (Σxᵢ² ≤ 1). Start with the 2D dartboard (π/4) and climb the dimension ladder 2 → 3 → 4 → 5 → 6 → 7 → 8.',
    insight: 'The inside-fraction is f = Vₙ/2ⁿ, and the Gamma factor makes it a pi-free rational times a power of π: 2D f = π/4 → π = 4f; 3D f = π/6 → π = 6f; 4D f = π²/32 → π = √(32f); 6D f = π³/384 → π = (384f)^(1/3). So π drops out cleanly in every dimension.',
    contrast: 'Two things get harder as n grows. The curse of dimensionality: f collapses 0.785 → 0.524 → 0.308 → 0.164 → 0.081 → 0.037 → 0.016, so almost every dart misses and you need vastly more of them. The real reason is concentration of measure: the distance |x| = √(Σxᵢ²) of a random cube point piles up near √(n/3), which races past the unit-ball radius 1, so the inside-mass to the left of |x| = 1 — that shaded slice IS the inside-fraction f — vanishes. The "Concentration" view plots this |x| distribution marching right and narrowing as n climbs, and the "Volume" view ray-marches the same story as light: the marginal density of the first three coordinates, ρ₃(r) ∝ (1 − r²)^((n−3)/2), whose glow concentrates ever more sharply toward the centre as the dimension grows. Be clear about what is real in that view: the RADIAL PROFILE is the true marginal density and is the only thing there that knows about n. The drifting nebula texture multiplied on top is decoration — a time-advected, domain-warped value-noise field with no statistical meaning at all. It is there because ρ₃ depends on r alone, so on its own it is perfectly spherically symmetric and an orbiting camera renders it pixel-identical from every angle; the flow makes the volume legible in motion and gives the orbit something to parallax against. It only ever multiplies ρ₃, so the envelope — and the concentration story — is untouched. The n ≥ 4 point cloud tells that story a third way: each inside point is drawn at (x₁,x₂,x₃) and coloured by its FULL radius |x| on a fixed 0 → 1 scale. Inside points are uniform in the ball, where |x| has density n·r^(n−1), so the blues and whites drain out of the cloud as n climbs — 24.0% of points sit below |x| = 0.7 at n = 4, but only 5.8% at n = 8 — including at the visual centre, where a point with small x₁,x₂,x₃ can still sit on the shell with all its length in the coordinates you cannot see. The colour scale is never renormalised per dimension, because renormalising would hide precisely that. And discrepancy matters: a Halton low-discrepancy sequence (digit-reversed integers, no π) equidistributes far better than Math.random, converging near 1/N instead of 1/√N. Both estimators run at once so you can watch the smooth Halton trace overtake the noisy random one.',
    formula: 'π ≈ (K · inside/total)^(1/⌊n/2⌋),  K a pi-free rational',
    getExpected: () => 'At 1 000 darts in 2D expect ≈ 785 inside (π/4); in 8D only ≈ 16. The random estimate jitters at the 1/√N rate; the Halton estimate hugs π far tighter for the same N.'
  };

  constructor(params = {}) {
    super(params);
    this.rate = params.rate || 40;
    this.turbo = false;
    this.dim = params.dim || 2;
    this.sampling = params.sampling || 'random';
    this.view = params.view || 'cloud';        // 'cloud' | 'split' | 'slice'
    this.eps = params.eps != null ? params.eps : 0.15; // slice slab half-thickness
    this.showMisses = params.showMisses != null ? params.showMisses : true;
    this.maxPoints = 4000;
    this.maxCloud = 3000;      // capped visible instances in the d ≥ 4 cloud
    this.maxMiss = 2000;       // capped visible outside markers (d ≥ 4)
    this.maxConvPoints = 6000;
    this._rc = new Float64Array(8);
    this._qc = new Float64Array(8);
    this._histInvBw = NBINS / R_MAX;     // radius → bin index scale (fixed)
    this.radHist = new Int32Array(NBINS); // |x| histogram of the random cube samples
    this.reset();
  }

  reset() {
    super.reset();
    this.samples = 0;
    this.randInside = 0;
    this.quasiInside = 0;
    this.collisionCount = 0;
    this.points = [];
    this.cloudPts = [];        // inside points (full coords) for the d ≥ 4 cloud
    this.missPts = [];         // outside points (x₁,x₂,x₃ + last coord) for d ≥ 4
    this.quasiConv = [];
    this._lastConv = null;
    this._qi = 0;
    this.sampleCarry = 0;
    this.turboCarry = 0;
    this.nextMilestone = 1;
    if (this.radHist) this.radHist.fill(0);   // clear the concentration histogram
  }

  getControls() {
    const controls = [
      { type: 'select', id: 'dim', label: 'Dimension n', highlight: true, default: this.dim,
        options: [
          { value: 2, label: '2 — dartboard  (f = π/4)' },
          { value: 3, label: '3 — ball  (f = π/6)' },
          { value: 4, label: '4 — hypersphere  (f = π²/32)' },
          { value: 5, label: '5  (f = π²/60)' },
          { value: 6, label: '6  (f = π³/384)' },
          { value: 7, label: '7  (f = π³/840)' },
          { value: 8, label: '8  (f = π⁴/6144)' },
        ],
        onChange: (val) => { this.dim = Number(val); this.reset(); this.initSimScene(); } },
      { type: 'select', id: 'sampling', label: 'Sampling', highlight: true, default: this.sampling,
        options: [
          { value: 'random', label: 'Random (Math.random)' },
          { value: 'quasi', label: 'Quasi (Halton low-discrepancy)' },
        ],
        onChange: (val) => { this.sampling = val; } },
      { type: 'select', id: 'view', label: 'View', highlight: true, default: this.view,
        options: [
          { value: 'cloud', label: 'Cloud — position (x₁,x₂,x₃) + colour |x|' },
          { value: 'split', label: 'Split — (x₁,x₂,x₃) | (x₄,x₅,x₆)  [needs n ≥ 6 — below: single cloud]' },
          { value: 'slice', label: 'Slice — thin |xₙ| < ε slab' },
          { value: 'concentration', label: 'Concentration — |x| distribution  [all n]' },
          { value: 'volume', label: 'Volume — ray-marched' },
        ],
        onChange: (val) => { this.view = val; this.initSimScene(); } },
      { type: 'slider', id: 'eps', label: 'Slice ε (slab half-thickness)', min: 0.02, max: 0.5, step: 0.01, default: this.eps,
        onChange: (val) => { this.eps = Number(val); } },
      // Rebuild the scene (and therefore the legend) on toggle — same
      // initSimScene path the dim/view selects use — so the miss-marker legend
      // entry appears and disappears with the markers it describes. Statistics
      // are deliberately NOT reset: this is a pure display toggle.
      { type: 'toggle', id: 'showMisses', label: 'Show misses (outside darts)', default: this.showMisses,
        onChange: (val) => { this.showMisses = val; this.initSimScene(); } },
      { type: 'slider', id: 'rate', label: 'Points/s', min: 1, max: 300, step: 1, default: this.rate,
        onChange: (val) => { this.rate = val; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 1 },
    ];
    return controls;
  }

  getPhaseSpaceViews() {
    return [
      { id: 'convergence', label: 'log₁₀ N vs (π̂ − π)/π — random vs Halton', dimension: 2, primary: true,
        axisLabels: { x: 'log₁₀ N', y: '(π̂ − π)/π' } }
    ];
  }

  // Advance both estimators by one matched sample. `visible` decides whether the
  // dart from the SELECTED sampler is drawn; both counters always update so the
  // two convergence traces stay in lock-step at the same N.
  _advance(visible) {
    const d = this.dim;

    // Random dart.
    let rs = 0;
    for (let j = 0; j < d; j++) { const c = -1 + 2 * Math.random(); this._rc[j] = c; rs += c * c; }
    const rin = rs <= 1;

    // Concentration view: bin the distance |x| = √rs of the random cube point
    // (rs is already in hand — the inside test is rs ≤ 1). Runs on EVERY advance
    // (visible + turbo), so the histogram total == samples and its below-1 count
    // == randInside → the shaded mass is exactly the inside-fraction. The
    // estimator counters below are untouched.
    let _bin = (Math.sqrt(rs) * this._histInvBw) | 0;
    if (_bin >= NBINS) _bin = NBINS - 1;
    this.radHist[_bin]++;

    // Halton dart (radical inverse of the running index in the first d primes).
    this._qi++;
    let qs = 0;
    for (let j = 0; j < d; j++) {
      const c = -1 + 2 * radicalInverse(PRIMES[j], this._qi);
      this._qc[j] = c; qs += c * c;
    }
    const qin = qs <= 1;

    this.samples++;
    if (rin) this.randInside++;
    if (qin) this.quasiInside++;
    this.collisionCount = this.sampling === 'quasi' ? this.quasiInside : this.randInside;

    if (visible) {
      const useQ = this.sampling === 'quasi';
      const src = useQ ? this._qc : this._rc;
      const inside = useQ ? qin : rin;
      if (d >= 4) {
        // Rich cloud: keep the full coordinate vector for INSIDE points (position
        // x₁,x₂,x₃ + colour |x|) and a light (x₁,x₂,x₃ + last coord) record for
        // OUTSIDE points (the miss markers). Purely visual — the counters above
        // already updated, so this can never feed the estimate.
        // `r` is the colour channel, and the squared norm is already in hand from
        // the inside test, so it costs one sqrt and no extra allocation.
        if (inside) {
          this.cloudPts.push({ c: src.slice(0, d), r: Math.sqrt(useQ ? qs : rs) });
          if (this.cloudPts.length > this.maxCloud) this.cloudPts.shift();
        } else {
          this.missPts.push({ x: src[0], y: src[1], z: src[2], w: src[d - 1] });
          if (this.missPts.length > this.maxMiss) this.missPts.shift();
        }
      } else {
        this.points.push({ x: src[0], y: src[1], z: d >= 3 ? src[2] : 0, inside });
        if (this.points.length > this.maxPoints) this.points.shift();
      }
    }
  }

  _convX(N) {
    const x = Math.log10(Math.max(N, 1)) / LOGN_MAX * 2 - 1;
    return Math.min(1, Math.max(-1, x));
  }

  // DISPLAY ONLY: the phase plot's y axis is the RELATIVE ERROR of the estimate,
  // so it needs the true π as a ruler to measure against. Nothing here feeds back
  // into getPiApproximation — the estimator path (coeffK / piFromFraction /
  // radicalInverse) contains no π at all.
  _convY(piHat) {
    const y = (piHat - Math.PI) / Math.PI * ERR_SCALE;   // Math.PI: convergence-truth reference, display only
    return Math.min(1, Math.max(-1, y));
  }

  _recordConvergence() {
    if (this.samples < this.nextMilestone) return;
    const x = this._convX(this.samples);
    const yR = this._convY(piFromFraction(this.randInside / this.samples, this.dim));
    const yQ = this._convY(piFromFraction(this.quasiInside / this.samples, this.dim));
    this._lastConv = [x, yR];
    this.pendingPhasePoints.push([x, yR]);        // random trace → primary trail (cyan)
    this.quasiConv.push([x, yQ]);                 // quasi trace → overlay (gold)
    if (this.quasiConv.length > this.maxConvPoints) this.quasiConv.shift();
    // One point per ~3% growth in N keeps the log-axis trail readable.
    this.nextMilestone = Math.max(this.samples + 1, Math.ceil(this.samples * 1.03));
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let sampled = false;

    this.sampleCarry += this.rate * t;
    let k = Math.floor(this.sampleCarry);
    this.sampleCarry -= k;
    for (; k > 0; k--) { this._advance(true); sampled = true; }

    if (this.turbo) {
      // Statistics only: ×999 extra invisible matched samples → total ×1000.
      this.turboCarry += this.rate * (TURBO_MULT - 1) * t;
      let m = Math.floor(this.turboCarry);
      this.turboCarry -= m;
      if (m > 0) sampled = true;
      for (; m > 0; m--) this._advance(false);
    }

    if (sampled) this._recordConvergence();
    return sampled;
  }

  _selectedInside() { return this.sampling === 'quasi' ? this.quasiInside : this.randInside; }

  getCollisionCount() { return `${this._selectedInside()}/${this.samples}`; }
  getCountLabel() { return 'Inside / total'; }

  getPiApproximation() {
    return this.samples > 0 ? piFromFraction(this._selectedInside() / this.samples, this.dim) : 0;
  }

  getPiReadout() {
    return this.samples > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const d = this.dim, N = this.samples;
    const fSel = N > 0 ? this._selectedInside() / N : 0;
    const piSel = N > 0 ? this.getPiApproximation() : 0;
    const piRand = N > 0 ? piFromFraction(this.randInside / N, d) : 0;
    const piQuasi = N > 0 ? piFromFraction(this.quasiInside / N, d) : 0;
    const live = N > 0 ? piDigitsHTML(piSel, 4) : 'collecting…';
    const rand = N > 0 ? piDigitsHTML(piRand, 4) : '—';
    const quasi = N > 0 ? piDigitsHTML(piQuasi, 4) : '—';
    // Shrinking-fraction bar (fill ∝ f, full width ≈ f = 0.8).
    const barPct = Math.min(100, fSel / 0.8 * 100);
    return `
      <strong>${d}D n-ball coverage</strong>:
      <span class="f-angle">f = Vₙ/2ⁿ = π<sup>${Math.floor(d / 2)}</sup> / ${coeffK(d)}</span><br>
      <span class="f-result">π</span> ≈ ${extractionText(d)} with
      f = <span class="f-count">${this._selectedInside()}</span> /
      <span class="f-count">${N}</span> = ${fSel.toFixed(4)}
      <br><span style="font-size:1.1em">π = ${live}</span>
      <div style="margin:4px 0 2px;font-size:0.85em">inside-fraction (theory ${F_LABELS[d] || '?'}, shrinks with n):</div>
      <div style="height:9px;background:#22243a;border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${barPct.toFixed(1)}%;background:#4cc9f0"></div>
      </div>
      <div style="margin-top:5px;font-size:0.85em">
        <span style="color:#4cc9f0">random</span> π = ${rand} &nbsp;·&nbsp;
        <span style="color:#f7c948">Halton</span> π = ${quasi}
      </div>
      <span class="f-muted">honesty: Halton uses the radical inverse — digit-reversed integers in the primes 2,3,5,… — pure modulo/divide, no π and no trig. It equidistributes, so its error falls ~1/N versus random's ~1/√N.</span>
    `;
  }

  getPhasePoint() { return this._lastConv ? [...this._lastConv] : []; }
  getPhaseExtractor() { return (pt) => pt; }

  // Gold Halton trace overlaid on the (cyan) random trail. Overlays render on the
  // circular-boundary 2D phase view as persistent lines.
  getOverlayTrails() {
    return [{ trail: this.quasiConv, color: 0xf7c948, opacity: 0.9 }];
  }
  getOverlayRenderMode() { return 'line'; }

  // Ortho focus box only for the flat 2D dartboard; the 3D / hi-dim views use a
  // perspective camera, so return null and let the framework frame the scene.
  getPreviewBox() {
    if (this.view === 'concentration') return null; // its own ortho plot camera stands
    if (this.view === 'volume') return null;        // perspective ray-march camera
    return this.dim === 2 ? { x0: -1.15, x1: 1.15, y0: -1.15, y1: 1.15 } : null;
  }

  initSimScene() {
    this.simScene.clear();
    this._hudFill = null;
    this._clouds = null;
    this._cloudGroup = null;
    this.missGeom = null;
    this.insideGeom = null;
    this.outsideGeom = null;
    this._barGeom = null;
    this._barMesh = null;
    this._barPos = null;
    this._fLabel = null;
    this._rLabel = null;
    this._rStatTick = 0;
    this._volMat = null;
    this._volMesh = null;
    this._volClock = 0;
    const d = this.dim;

    if (this.view === 'concentration') {
      this._initConcentrationScene();   // 2D ortho |x|-distribution plot (all n)
      return;
    }

    if (this.view === 'volume') {
      this._initVolumeScene(d);         // inline-GLSL ray-marched density glow
      return;
    }

    if (d === 2) {
      this._initFlatScene();
      this._initPointClouds(2);
    } else if (d === 3) {
      this._initSphereScene();
      this._initPointClouds(3);
    } else {
      this._initHiDimScene(d);   // rich instanced cloud with the full encoding ladder
    }
  }

  // Pooled inside/outside Points clouds — the 2D dartboard and the 3D ball.
  _initPointClouds(d) {
    this.insideGeom = new THREE.BufferGeometry();
    this.insideGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 3), 3));
    this.insideGeom.setDrawRange(0, 0);
    this.insidePts = new THREE.Points(
      this.insideGeom,
      new THREE.PointsMaterial({ color: 0x4cc9f0, size: d === 3 ? 0.04 : 0.022 })
    );
    this.simScene.add(this.insidePts);

    this.outsideGeom = new THREE.BufferGeometry();
    this.outsideGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 3), 3));
    this.outsideGeom.setDrawRange(0, 0);
    this.outsidePts = new THREE.Points(
      this.outsideGeom,
      new THREE.PointsMaterial({ color: 0x6b6f9c, size: d === 3 ? 0.03 : 0.02, transparent: true, opacity: 0.5 })
    );
    this.simScene.add(this.outsidePts);
  }

  _initSphereScene() {
    this.simCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    this.simCamera.position.set(2.6, 2.0, 2.6);
    this.simCamera.lookAt(0, 0, 0);

    const cubeEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
    this.simScene.add(new THREE.LineSegments(
      cubeEdges,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    ));

    const sphereWire = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 16));
    this.simScene.add(new THREE.LineSegments(
      sphereWire,
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.35 })
    ));
    this._sceneRotation = 0;
  }

  // VOLUME view: a glowing ray-marched cloud of the marginal 3D density ρ₃ of the
  // first three coordinates of a uniform n-ball point, plus the faint reference
  // sphere/cube for scale. The ShaderMaterial (inline GLSL, per CSP) marches the
  // view ray through the unit sphere with front-to-back compositing; the density
  // uniform makes the glow concentrate as n grows. Guards for the no-WebGL/no-DOM
  // verify path: the material only needs to CONSTRUCT without throwing there.
  _initVolumeScene(d) {
    this.simCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    this.simCamera.position.set(2.95, 2.05, 2.95);
    this.simCamera.lookAt(0, 0, 0);

    // Faint reference cube + unit-sphere wireframe (scale cues, drawn behind glow).
    this.simScene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })));
    this.simScene.add(new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 16)),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.16 })));

    // Effective dimension ≥ 3 (the first-three-coordinate density needs n ≥ 3;
    // n = 3 is the uniform ball). Estimator dim is UNCHANGED — display only.
    const nEff = Math.max(3, d);
    this._volMat = new THREE.ShaderMaterial({
      vertexShader: VOL_VERT,
      fragmentShader: VOL_FRAG,
      uniforms: {
        uN:     { value: nEff },
        uTime:  { value: 0 },
        uSteps: { value: VOL_STEPS },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    // A camera-facing enclosing cube: its front faces seed the entry points the
    // fragment shader marches from. Slightly larger than the sphere so the whole
    // ball is covered from every viewing angle.
    this._volMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), this._volMat);
    this._volMesh.frustumCulled = false;
    this._volMesh.renderOrder = 2;
    this.simScene.add(this._volMesh);

    this._sceneRotation = 0;
    this._volClock = 0;
  }

  // Per-frame: gently orbit the camera — which NOW produces genuine parallax,
  // because the flow field breaks ρ₃'s spherical symmetry — and advance the
  // DEDICATED flow clock. The clock is deliberately independent of the orbit: it
  // ticks VOL_DT = 0.016 per frame (≈ 1 s of flow per wall-clock second at
  // 60 fps), where the old code derived uTime from the orbit angle and so crept
  // at ~0.002 rad/frame — imperceptible. Only uniform/position writes — NO
  // allocation.
  _updateVolume() {
    this._sceneRotation += 0.0035;
    this._volClock += VOL_DT;
    const r = 4.15;
    this.simCamera.position.set(
      r * Math.cos(this._sceneRotation), 2.05, r * Math.sin(this._sceneRotation));
    this.simCamera.lookAt(0, 0, 0);
    if (this._volMat) this._volMat.uniforms.uTime.value = this._volClock;
  }

  // 2D dartboard: bounding square + the unit circle boundary.
  _initFlatScene() {
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 10);
    this.simCamera.position.z = 1;

    const square = [
      new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, 1, 0), new THREE.Vector3(-1, -1, 0),
    ];
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(square),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    ));

    this.simScene.add(new THREE.Mesh(
      new THREE.RingGeometry(0.994, 1.0, 128),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide,
        transparent: true, opacity: 0.8 })
    ));
  }

  // ── HUD helpers (children of the camera → fixed on screen while the cloud
  //    spins). All no-op safely where there is no DOM (the node verify harness). ──

  // A small screen-anchored text sprite. The sprite WIDTH is derived from the
  // measured text so the glyphs keep their natural aspect (no horizontal smear);
  // the caller's `w` is ignored. `h` is the text height in HUD units.
  _hudLabel(text, x, y, _w, h = 0.075, color = '#c9d1ff') {
    if (typeof document === 'undefined') return null;
    const fontPx = 34;
    let c = document.createElement('canvas');
    let g = c.getContext('2d');
    if (!g) return null;
    g.font = `${fontPx}px Georgia, serif`;
    const tw = Math.max(8, Math.ceil(g.measureText(text).width)) + 10;
    const th = Math.ceil(fontPx * 1.4);
    c.width = tw; c.height = th;
    g = c.getContext('2d');
    g.font = `${fontPx}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, tw / 2, th / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex,
      transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    sp.position.set(x, y, HUD_Z);
    sp.scale.set(h * (tw / th), h, 1);   // natural text aspect, never stretched
    (this._hudGroup || this.simCamera).add(sp);
    return sp;
  }

  // A flat solid-colour HUD swatch/bar.
  _hudSwatch(x, y, w, h, rgbHex, opacity = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: rgbHex, transparent: true, opacity,
        depthTest: false, depthWrite: false }));
    m.position.set(x, y, HUD_Z);
    (this._hudGroup || this.simCamera).add(m);
    return m;
  }

  // d ≥ 4: a perspective view of position (x₁,x₂,x₃) + colour |x|. Dispatches on
  // the current view. The cloud + reference sphere spin gently; the legend and
  // shrinking inside-fraction bar ride along as a fixed HUD parented to the
  // camera. `split` is the EFFECTIVE layout: asking for split below d = 6 falls
  // back to the single cloud, and _buildLegendHUD posts a note saying so.
  _initHiDimScene(d) {
    const split = this.view === 'split' && d >= 6;

    this.simCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    if (split) { this.simCamera.position.set(0.0, 2.4, 8.4); }
    else       { this.simCamera.position.set(2.95, 2.05, 2.95); }
    this.simCamera.lookAt(0, 0, 0);
    this.simScene.add(this.simCamera); // render its HUD children

    // All legend/HUD elements live in this camera-child group; shrinking it maps
    // the (oversized) layout back inside the visible frustum.
    this._hudGroup = new THREE.Group();
    this._hudGroup.scale.set(HUD_S, HUD_S, 1);
    this.simCamera.add(this._hudGroup);

    // Rotating group holds the reference frames and the instanced cloud(s).
    const group = new THREE.Group();
    this._cloudGroup = group;
    this.simScene.add(group);

    // `ci` = the coordinate triple a cloud puts in POSITION. There is no
    // per-panel colour rule any more: colour is |x|, a property of the WHOLE
    // vector, so the single rule is true of both panels and — unlike the old
    // per-panel RGB triples — is not a restatement of either panel's position.
    this._clouds = [];
    if (split) {
      this._addRefFrame(group, -SPLIT_OFF);
      this._addRefFrame(group, +SPLIT_OFF);
      this._clouds.push({ mesh: this._makeCloudMesh(group), ci: [0, 1, 2], ox: -SPLIT_OFF, shown: 0 });
      this._clouds.push({ mesh: this._makeCloudMesh(group), ci: [3, 4, 5], ox: +SPLIT_OFF, shown: 0 });
      this._missOffsetX = -SPLIT_OFF;   // misses live in position space (left panel)
    } else {
      this._addRefFrame(group, 0);
      this._clouds.push({ mesh: this._makeCloudMesh(group), ci: [0, 1, 2], ox: 0, shown: 0 });
      this._missOffsetX = 0;
    }

    this._dummy = new THREE.Object3D();
    this._tmpColor = new THREE.Color();
    this._tmpRGB = [1, 1, 1];

    // Pooled miss markers — small, faint, flat grey dots, visually distinct from
    // the shaded coloured inside spheres. Rotates with the group.
    this.missGeom = new THREE.BufferGeometry();
    this.missGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxMiss * 3), 3));
    this.missGeom.setDrawRange(0, 0);
    this._missPoints = new THREE.Points(this.missGeom,
      new THREE.PointsMaterial({ color: 0x8a8fb0, size: 0.014, transparent: true, opacity: 0.32,
        depthWrite: false }));
    group.add(this._missPoints);

    this._sceneRotation = 0;

    this._buildLegendHUD(d, split);
  }

  // Reference cube + unit-sphere wireframe centred at x-offset `ox`.
  _addRefFrame(group, ox) {
    const cube = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 }));
    cube.position.x = ox;
    group.add(cube);
    const sph = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 16)),
      new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.20 }));
    sph.position.x = ox;
    group.add(sph);
  }

  // One instanced cloud: a small glowing ball per inside point, all the SAME
  // size, carrying one per-instance colour (|x|). Pooled at maxCloud, hidden
  // slots kept at zero scale.
  _makeCloudMesh(group) {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
    const mesh = new THREE.InstancedMesh(ico, mat, this.maxCloud);
    mesh.frustumCulled = false;
    const tmp = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxCloud; i++) {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, tmp.setRGB(1, 1, 1));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  // ── Legend HUD (adapts to the current view) ───────────────────────────────
  // The legend must never claim an encoding that is not actually varying on
  // screen — the failure mode that killed the old size/opacity ladder. With
  // exactly two channels left, the ways it could still lie are:
  //  • SLICE pins the LAST coordinate x_d to ≈ 0. It cannot collapse the colour
  //    (|x| is the full norm, not a coordinate), but the slab is a filter, so it
  //    biases the shown radii a little low — the colour bar says so.
  //  • SPLIT asked for below d = 6 silently rendered the single-cloud layout.
  //    Now _buildSplitFallbackNote posts the fallback on screen.
  //  • WHO the channels describe: the encoding covers the INSIDE points only.
  //    The miss markers (_missPoints) are flat grey dots at one fixed size and
  //    opacity, placed by x₁,x₂,x₃ alone — no colour rule at all — and in split
  //    view they are drawn in the LEFT (position) panel only. So every encoding
  //    caption carries the SCOPE prefix and _buildMissLegend states the
  //    exception outright whenever the markers are on screen.
  _buildLegendHUD(d, split) {
    const slice = this.view === 'slice';

    // Always: what the 3D position means — for the inside points.
    if (split) {
      this._hudLabel(SCOPE_SPLIT_L + 'position = x₁,x₂,x₃', -0.86, 1.00, 0.98, 0.066, '#cdd3ff');
      this._hudLabel(SCOPE_SPLIT_R + 'position = x₄,x₅,x₆', 0.80, 1.00, 1.02, 0.066, '#cdd3ff');
    } else {
      this._hudLabel(SCOPE + 'position = x₁,x₂,x₃', -0.60, 1.00, 0.86, 0.075, '#cdd3ff');
    }
    if (slice) {
      this._hudLabel(`slice: |x${sub(d)}| < ε  (slab from slider)`, -0.60, 0.34, 1.08, 0.072, '#9fe0c8');
      // The slab hides points; it never reaches the counters. Said here, next to
      // the slice caption itself, so the two cannot be read as one claim.
      this._hudLabel('slab is a display filter — f counts all samples',
        -0.60, 0.25, 1.08, 0.058, '#9aa0c8');
    }

    // Asked for split, got the single cloud: say it rather than let the selector
    // and the screen disagree.
    if (this.view === 'split' && !split) this._buildSplitFallbackNote(d);

    // The one thing on screen the encoding does NOT describe.
    this._buildMissLegend(split);

    // The ONE colour channel.
    this._buildRadiusColorbar(d, slice);

    // Shrinking inside-fraction bar (top-left HUD): grey track + growing fill.
    // The bar is the ESTIMATOR's readout — _selectedInside()/samples over every
    // sample ever drawn, turbo included — not a count of the dots on screen. The
    // slice slab in particular filters the display only, so the caption says
    // "all samples" outright (and slice view repeats it next to the slab caption).
    const barX0 = -1.14, barSpan = 0.92, barY = 1.18, barH = 0.05;
    this._hudLabel('inside-fraction f (all samples)', barX0 + barSpan / 2, barY + 0.11, 0.62, 0.07, '#9fd8ee');
    this._hudSwatch(barX0 + barSpan / 2, barY, barSpan, barH, 0x2a2d47);
    this._hudFill = new THREE.Mesh(new THREE.PlaneGeometry(1, barH * 0.7),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, depthTest: false, depthWrite: false }));
    this._hudFill.scale.x = 1e-4;
    this._hudFill.position.set(barX0, barY, HUD_Z + 0.01);
    this._hudGroup.add(this._hudFill);
    this._hudBarX0 = barX0; this._hudBarSpan = barSpan; this._hudBarFMax = 0.8;
  }

  // ── MISS-MARKER legend entry ──────────────────────────────────────────────
  // The rejected darts are drawn by _missPoints as flat grey PointsMaterial dots
  // at a FIXED size (0.014) and opacity (0.32), positioned by x₁,x₂,x₃ only —
  // they carry no |x| colour (a miss has |x| > 1, off the end of the bar).
  // Without this entry the encoding captions read as if they covered every dot
  // on screen. Drawn only when the
  // markers themselves are (showMisses), so the legend can never advertise
  // something that is not there; the toggle's onChange re-runs initSimScene, so
  // this entry appears and vanishes with them.
  // In SPLIT view the markers live in the LEFT panel alone (_missOffsetX =
  // −SPLIT_OFF, they are position-space points), which the second line states —
  // otherwise the emptier right panel reads as "the right panel has no misses".
  _buildMissLegend(split) {
    if (!this.showMisses) return;
    const x0 = -1.12, y = 0.86;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.030, 16),
      new THREE.MeshBasicMaterial({ color: 0x8a8fb0, transparent: true, opacity: 0.7,
        depthTest: false, depthWrite: false }));
    dot.position.set(x0, y, HUD_Z);
    this._hudGroup.add(dot);
    // Left-align the caption against the swatch using the sprite's own measured
    // width (see _hudLabel); null only on the no-DOM verify path.
    const sp = this._hudLabel('grey dot = miss (no encoding)', 0, y, 0.9, 0.07, '#9aa0c8');
    if (sp) sp.position.x = x0 + 0.075 + sp.scale.x / 2;
    if (split) {
      this._hudLabel('misses drawn in the left (x₁,x₂,x₃) panel only',
        -0.58, 0.74, 1.0, 0.06, '#9aa0c8');
    }
  }

  // ── SPLIT-below-6 fallback note ───────────────────────────────────────────
  // The split layout needs six coordinates (three per panel), so it is only
  // built at d ≥ 6; at d = 4 or 5 the single cloud renders instead. That used to
  // happen silently, leaving the selector reading "Split" over a single-cloud
  // screen. State it where the screen is.
  _buildSplitFallbackNote(d) {
    this._hudLabel(`split needs n ≥ 6 — at n = ${d} the single cloud is shown`,
      -0.30, 0.56, 1.1, 0.068, '#f7c948');
    this._hudLabel('(x₄,x₅,x₆ do not all exist yet, so there is no second panel)',
      -0.30, 0.47, 1.1, 0.056, '#9aa0c8');
  }

  // ── THE ONE COLOUR LEGEND: |x| on a FIXED 0 → 1 ramp ──────────────────────
  // Built from the SAME divergingRGB the points use, sampled across the absolute
  // range [0, 1]. Nothing here depends on the dimension: an auto-scaled bar
  // would renormalise the drain away, and the drain is the lesson. What changes
  // with n is the CLOUD — its blues and whites disappear into the shell colour.
  //
  // Two reference lines make that checkable instead of merely assertable:
  //  • a STATIC theory line — for a point uniform in the unit n-ball, |x| has
  //    density n·r^(n−1), so E|x| = n/(n+1) exactly and the share below R_LOW is
  //    exactly R_LOWⁿ. Both are π-free and display-only in any case.
  //  • a LIVE line (one reused canvas, see _updateHiDim) — the same two numbers
  //    measured off the points actually on screen.
  // In slice view the slab conditions the shown points on |x_d| ≈ 0, which pulls
  // the measured radius slightly below the theory value; the caption says so
  // rather than letting the two lines look like a contradiction.
  _buildRadiusColorbar(d, slice) {
    // Layout: the bar sits high enough that its five caption rows all stay inside
    // the HUD frustum (the group is scaled by HUD_S, giving roughly ±1.51 in y).
    const SEG = 48, cbW = 1.34, cbH = 0.11, cbCX = 0.28, cbCY = -0.90;
    const cbGeom = new THREE.PlaneGeometry(cbW, cbH, SEG, 1);
    const pos = cbGeom.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const rgb = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      const r = pos.getX(i) / cbW + 0.5;   // 0..1 across the bar → |x| ∈ [0,1]
      divergingRGB(2 * r - 1, rgb);        // identical mapping to colorForPoint
      col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
    }
    cbGeom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cbMesh = new THREE.Mesh(cbGeom,
      new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false }));
    cbMesh.position.set(cbCX, cbCY, HUD_Z);
    this._hudGroup.add(cbMesh);

    this._hudLabel(SCOPE + 'colour = |x| = √(Σxᵢ²)', cbCX, cbCY + 0.16, 0.80, 0.080, '#e6e9ff');
    this._hudLabel('0 centre', cbCX - cbW / 2, cbCY - 0.12, 0.22, 0.062, '#9aa0c8');
    this._hudLabel('0.5', cbCX, cbCY - 0.12, 0.12, 0.062, '#9aa0c8');
    this._hudLabel('1 shell', cbCX + cbW / 2, cbCY - 0.12, 0.22, 0.062, '#9aa0c8');
    this._hudLabel('fixed 0 → 1 scale, never renormalised — watch the colour drain as n climbs',
      cbCX, cbCY - 0.23, 1.3, 0.058, '#9fd8ee');

    // Static theory line (exact for a uniform n-ball; no π anywhere in it).
    const eR = d / (d + 1);
    const share = Math.pow(R_LOW, d) * 100;
    this._hudLabel(`theory: E|x| = n/(n+1) = ${eR.toFixed(3)}   ·   |x| < ${R_LOW} is ${R_LOW}ⁿ = ${share.toFixed(1)}%`,
      cbCX, cbCY - 0.33, 1.3, 0.056, '#9aa0c8');

    // Live line, measured off the shown cloud. Wide canvas (1024×64) so the
    // whole one-line readout fits without shrinking the glyphs.
    this._rLabel = this._makeDynLabel(cbCX, cbCY - 0.43, 0.075, '#f7c948', this._hudGroup, HUD_Z, 1024);
    this._rStatTick = RSTAT_EVERY;   // fill it on the very first update
    if (slice) {
      this._hudLabel('slab keeps |x_n| ≈ 0, so the shown mean runs a touch under theory',
        cbCX, cbCY - 0.52, 1.3, 0.052, '#9fe0c8');
    }
  }

  // ── CONCENTRATION-OF-MEASURE view (2D ortho) ──────────────────────────────
  // A distance histogram of the uniform cube samples: |x| = √(Σxᵢ²), binned over
  // the fixed axis [0, √8]. Faint reference Gaussians for dims 2/4/6/8 show the
  // marching-right + narrowing at a glance; the current dim's histogram is bold
  // and filled, its mass to the left of |x| = 1 shaded (that area IS f). Pooled
  // bar buffer + static line/label buffers → no per-frame allocation.
  _initConcentrationScene() {
    const d = this.dim;
    const invR = 1 / R_MAX;

    // Ortho camera framing the [0,1]×[0,1] plot rectangle with label margins.
    this.simCamera = new THREE.OrthographicCamera(-0.28, 1.20, 1.32, -0.36, 0.1, 10);
    this.simCamera.position.z = 2;

    // Shaded inside-mass slab (0 … |x| = 1) sitting behind everything.
    const shadeW = 1 * invR;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(shadeW, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.10,
        depthTest: false, depthWrite: false }));
    shade.position.set(shadeW / 2, 0.5, -0.02);
    shade.renderOrder = 0;
    this.simScene.add(shade);

    // Axes: baseline + left rule.
    this._addPlotLine([[0, 0], [1.0, 0]], 0x8a8fb0, 0.7, 1, 0.01);
    this._addPlotLine([[0, 0], [0, 1.06]], 0x8a8fb0, 0.35, 1, 0.01);

    // Pooled histogram bars: NBINS quads, x fixed, top-y updated in place.
    const bw = R_MAX / NBINS;
    const pos = new Float32Array(NBINS * 4 * 3);
    const col = new Float32Array(NBINS * 4 * 3);
    const index = new Uint16Array(NBINS * 6);
    const cFill = [0.30, 0.79, 0.94];   // inside (|x| < 1) → blue fill
    const cOut = [0.42, 0.45, 0.62];    // outside (|x| ≥ 1) → faint grey
    for (let i = 0; i < NBINS; i++) {
      const x0 = i / NBINS, x1 = (i + 1) / NBINS;
      const rc = (i + 0.5) * bw;
      const c = rc < 1 ? cFill : cOut;
      const b = i * 12;
      // verts: 0 bottom-left, 1 bottom-right, 2 top-right, 3 top-left
      pos[b] = x0;      pos[b + 1] = 0; pos[b + 2] = 0.02;
      pos[b + 3] = x1;  pos[b + 4] = 0; pos[b + 5] = 0.02;
      pos[b + 6] = x1;  pos[b + 7] = 0; pos[b + 8] = 0.02;
      pos[b + 9] = x0;  pos[b + 10] = 0; pos[b + 11] = 0.02;
      for (let v = 0; v < 4; v++) { col[b + v * 3] = c[0]; col[b + v * 3 + 1] = c[1]; col[b + v * 3 + 2] = c[2]; }
      const ib = i * 6, vb = i * 4;
      index[ib] = vb; index[ib + 1] = vb + 1; index[ib + 2] = vb + 2;
      index[ib + 3] = vb; index[ib + 4] = vb + 2; index[ib + 5] = vb + 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, NBINS * 6);
    this._barGeom = g;
    this._barPos = pos;
    this._barMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true,
      transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
    this._barMesh.renderOrder = 1;
    this.simScene.add(this._barMesh);

    // Faint reference Gaussians (theory |x| density) for a spread of dims — the
    // marching-right + narrowing made legible at a glance. Current dim brighter.
    const NREF = 100;
    for (const rf of CONC_REF) {
      const mu = Math.sqrt(rf.n / 3);
      const pts = [];
      for (let i = 0; i <= NREF; i++) {
        const r = i / NREF * R_MAX;
        const y = Math.exp(-((r - mu) * (r - mu)) / (2 * SIGMA_R * SIGMA_R)) * 0.92;
        pts.push([r * invR, y]);
      }
      const cur = rf.n === d;
      this._addPlotLine(pts, rf.hex, cur ? 0.9 : 0.4, 2, cur ? 0.05 : 0.035);
      this._plotLabel(`n=${rf.n}`, Math.min(0.97, mu * invR), 0.965, cur ? 0.052 : 0.044,
        cur ? '#ffffff' : rf.css);
    }

    // Unit-ball boundary |x| = 1 (the shading edge).
    const xUnit = 1 * invR;
    this._addPlotLine([[xUnit, 0], [xUnit, 1.08]], 0xffffff, 0.9, 3, 0.08);
    this._plotLabel('|x| = 1  (ball)', xUnit, 1.15, 0.05, '#ffffff');

    // Mean-distance tick E|x| ≈ √(n/3).
    const mu = Math.sqrt(d / 3), xMu = mu * invR;
    this._addPlotLine([[xMu, 0], [xMu, 0.86]], 0x9fe0c8, 0.85, 3, 0.07);
    this._plotLabel(`E|x| ≈ √(n/3) = ${mu.toFixed(2)}`, Math.min(xMu, 0.78), 0.92, 0.046, '#9fe0c8');

    // Max-radius marker √n (right end of the cube's reach for this dim).
    const xMax = Math.sqrt(d) * invR;
    this._addPlotLine([[xMax, 0], [xMax, 0.10]], 0xf0e6c8, 0.7, 3, 0.07);
    this._plotLabel('√n', xMax, -0.055, 0.044, '#f0e6c8');

    // Title, axis label, live-f readout, and the caption.
    this._plotLabel(`distance |x| distribution — dim n = ${d}`, 0.5, 1.26, 0.056, '#e6e9ff');
    this._plotLabel('|x| (distance from centre)', 0.5, -0.15, 0.048, '#c9d1ff');
    this._plotLabel('0', 0, -0.055, 0.04, '#9aa0c8');
    this._plotLabel('in high-D almost every point is far outside the ball —', 0.5, -0.24, 0.04, '#9aa0c8');
    this._plotLabel('that is why the fraction (and MC) collapses', 0.5, -0.30, 0.04, '#9aa0c8');

    // Live inside-fraction f = shaded mass (dynamic; reuses one canvas texture).
    this._fLabel = this._makeDynLabel(0.30, 1.13, 0.058, '#4cc9f0');
  }

  // A static polyline in plot world-space. `points` are [x,y] pairs already in
  // [0,1] plot coords. Built once → no per-frame allocation.
  _addPlotLine(points, hex, opacity, renderOrder = 1, z = 0.03) {
    const arr = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) { arr[i * 3] = points[i][0]; arr[i * 3 + 1] = points[i][1]; arr[i * 3 + 2] = z; }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: hex,
      transparent: true, opacity, depthTest: false, depthWrite: false }));
    line.renderOrder = renderOrder;
    this.simScene.add(line);
    return line;
  }

  // A static text sprite anchored in plot world-space (no-op without a DOM).
  _plotLabel(text, x, y, h = 0.05, color = '#c9d1ff', renderOrder = 4) {
    if (typeof document === 'undefined') return null;
    const fontPx = 32;
    let c = document.createElement('canvas');
    let g = c.getContext('2d');
    if (!g) return null;
    g.font = `${fontPx}px Georgia, serif`;
    const tw = Math.max(8, Math.ceil(g.measureText(text).width)) + 8;
    const th = Math.ceil(fontPx * 1.4);
    c.width = tw; c.height = th;
    g = c.getContext('2d');
    g.font = `${fontPx}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, tw / 2, th / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true,
      opacity: 0.96, depthTest: false, depthWrite: false }));
    sp.position.set(x, y, 0.1);
    sp.scale.set(h * (tw / th), h, 1);
    sp.renderOrder = renderOrder;
    this.simScene.add(sp);
    return sp;
  }

  // A dynamic-text sprite reusing ONE canvas + CanvasTexture: redrawn in place
  // only when the text actually changes → never allocates in the render loop.
  // `parent`/`z` let the same helper serve the plot views (default: the scene at
  // z = 0.1) and the camera-anchored HUD (parent = _hudGroup, z = HUD_Z); `W` is
  // the canvas width, widened for long single-line HUD readouts.
  _makeDynLabel(x, y, h, color, parent = null, z = 0.1, W = 256) {
    if (typeof document === 'undefined') return null;
    const H = 64, fontPx = 34;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true,
      opacity: 0.98, depthTest: false, depthWrite: false }));
    sp.position.set(x, y, z);
    sp.scale.set(h * (W / H), h, 1);
    sp.renderOrder = 4;
    (parent || this.simScene).add(sp);
    return { canvas, ctx, tex, sprite: sp, W, H, fontPx, color, last: null };
  }

  _updateDynLabel(rec, text) {
    if (!rec || rec.last === text) return;
    rec.last = text;
    const g = rec.ctx;
    g.clearRect(0, 0, rec.W, rec.H);
    g.font = `${rec.fontPx}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = rec.color;
    g.fillText(text, rec.W / 2, rec.H / 2);
    rec.tex.needsUpdate = true;
  }

  // Per-frame: rescale the pooled bars to the current histogram and refresh the
  // live inside-fraction readout. No allocation (bar y written in place; the
  // dyn label only redraws its canvas when its text changes).
  _updateConcentration() {
    if (!this._barGeom) return;
    const hist = this.radHist, pos = this._barPos;
    let maxC = 1;
    for (let i = 0; i < NBINS; i++) { if (hist[i] > maxC) maxC = hist[i]; }
    const scale = 0.92 / maxC;
    for (let i = 0; i < NBINS; i++) {
      const h = hist[i] * scale;
      const b = i * 12;
      pos[b + 7] = h;    // top-right vert y
      pos[b + 10] = h;   // top-left  vert y
    }
    this._barGeom.attributes.position.needsUpdate = true;

    if (this._fLabel && this.samples > 0) {
      // Shaded inside-mass == below-|x|=1 count == randInside (both accumulated
      // on every advance), so this is exactly the pi-derived inside-fraction.
      this._updateDynLabel(this._fLabel, 'inside f = ' + (this.randInside / this.samples).toFixed(4));
    }
  }

  updateSimScene() {
    if (this.view === 'volume') { this._updateVolume(); return; }
    if (this.view === 'concentration') { this._updateConcentration(); return; }
    if (this.dim >= 4) { this._updateHiDim(); return; }
    if (!this.insideGeom) return;
    const d = this.dim;
    const insidePos = this.insideGeom.attributes.position.array;
    const outsidePos = this.outsideGeom.attributes.position.array;
    let ii = 0, oi = 0;
    for (const p of this.points) {
      const target = p.inside ? insidePos : outsidePos;
      const idx = p.inside ? ii : oi;
      target[idx * 3] = p.x;
      target[idx * 3 + 1] = p.y;
      target[idx * 3 + 2] = d === 3 ? p.z : 0;
      if (p.inside) ii++; else oi++;
    }
    this.insideGeom.attributes.position.needsUpdate = true;
    this.outsideGeom.attributes.position.needsUpdate = true;
    this.insideGeom.setDrawRange(0, ii);
    // PART 4 for dim 2/3: honour the showMisses toggle.
    this.outsideGeom.setDrawRange(0, this.showMisses ? oi : 0);

    if (d === 3) {
      this._sceneRotation += 0.0035;
      const r = 3.4;
      this.simCamera.position.set(
        r * Math.cos(this._sceneRotation), 2.0, r * Math.sin(this._sceneRotation));
      this.simCamera.lookAt(0, 0, 0);
    }
  }

  _updateHiDim() {
    if (!this._clouds) return;
    const d = this.dim;
    const slice = this.view === 'slice';
    const eps = this.eps;
    const dummy = this._dummy, tc = this._tmpColor, rgb = this._tmpRGB;
    const pts = this.cloudPts, nPts = pts.length;
    const first = this._clouds[0];
    let rSum = 0, rLow = 0, rN = 0;      // live |x| stats for the shown cloud

    // Each cloud (one for cloud/slice, two for split) reads the same inside
    // points but positions them by its own coordinate triple. Colour is the same
    // rule everywhere: |x| on the fixed 0 → 1 ramp.
    for (const cl of this._clouds) {
      const mesh = cl.mesh, ci0 = cl.ci[0], ci1 = cl.ci[1], ci2 = cl.ci[2], ox = cl.ox;
      const collect = cl === first;   // gather the stats once, not once per panel
      let k = 0;
      for (let i = 0; i < nPts && k < this.maxCloud; i++) {
        const p = pts[i];
        if (slice && Math.abs(p.c[d - 1]) >= eps) continue;   // hide points outside the slab
        dummy.position.set(ox + p.c[ci0], p.c[ci1], p.c[ci2]);
        dummy.scale.setScalar(CLOUD_R);                        // one size for every point
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
        colorForPoint(p, d, rgb);                              // |x| → colour (fixed 0→1 ramp)
        tc.setRGB(rgb[0], rgb[1], rgb[2]);
        mesh.setColorAt(k, tc);
        if (collect) {
          const r = radiusForPoint(p, d);
          rSum += r; rN++;
          if (r < R_LOW) rLow++;
        }
        k++;
      }
      // Hide any slots shown last frame but unused now.
      if (cl.shown > k) {
        dummy.scale.setScalar(0); dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        for (let i = k; i < cl.shown; i++) mesh.setMatrixAt(i, dummy.matrix);
      }
      cl.shown = k;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // PART 4: miss markers (outside darts), pooled + capped.
    if (this.missGeom) {
      const arr = this.missGeom.attributes.position.array;
      let m = 0;
      if (this.showMisses) {
        const misses = this.missPts, nM = misses.length, ox = this._missOffsetX;
        for (let i = 0; i < nM && m < this.maxMiss; i++) {
          const p = misses[i];
          if (slice && Math.abs(p.w) >= eps) continue;
          arr[m * 3] = ox + p.x; arr[m * 3 + 1] = p.y; arr[m * 3 + 2] = p.z;
          m++;
        }
      }
      this.missGeom.attributes.position.needsUpdate = true;
      this.missGeom.setDrawRange(0, m);
    }

    // Live |x| readout under the colour bar — the measured twin of the static
    // theory line. The sprite reuses ONE canvas, so the only allocation here is
    // the short string, and the RSTAT_EVERY throttle keeps even that off most
    // frames (the numbers move far slower than 60 Hz anyway).
    if (this._rLabel && rN > 0 && ++this._rStatTick >= RSTAT_EVERY) {
      this._rStatTick = 0;
      this._updateDynLabel(this._rLabel,
        'shown: mean |x| = ' + (rSum / rN).toFixed(3) +
        '   ·   |x| < ' + R_LOW + ' is ' + (rLow / rN * 100).toFixed(1) + '%');
    }

    // Gentle spin of the cloud(s) + reference sphere(s); camera and HUD stay put.
    if (this._cloudGroup) this._cloudGroup.rotation.y += 0.0035;

    // Shrinking inside-fraction HUD bar.
    if (this._hudFill && this.samples > 0) {
      const f = this._selectedInside() / this.samples;
      const w = Math.min(1, f / this._hudBarFMax) * this._hudBarSpan;
      this._hudFill.scale.x = Math.max(1e-4, w);
      this._hudFill.position.x = this._hudBarX0 + w / 2;
    }
  }
}

// Unicode subscript digit for a small-integer dimension (used in HUD captions).
function sub(n) {
  const map = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
  return String(n).split('').map((ch) => map[ch] || ch).join('');
}

registerSim(SphereVolumeMC);
