import"./mode-switch-KVTmJce4.js";import"./whats-new-BGrxnqJH.js";import{s as wt}from"./sdf2d-CdOQmIPv.js";const zt=`
struct CParams {
  resolution: vec2f,
  focal: f32,
  pad0: f32,
  camPos: vec4f,
  camRight: vec4f,
  camUp: vec4f,
  camFwd: vec4f,
  dA: vec4f, uA: vec4f, vA: vec4f, paramA: vec4f,
  dB: vec4f, uB: vec4f, vB: vec4f, paramB: vec4f,
  bound: vec4f,
  show: vec4f,      // (showWallA, showWallB, selected, showOrbit)
  param2A: vec4f,   // (lightType, lightDist, cosSpot, armScale)
  param2B: vec4f,   // (lightType, lightDist, cosSpot, armScale)
  targetA: vec4f,   // (Tx,Ty,Tz, _) light A gizmo target offset (cone apex = target + d*lightDist)
  targetB: vec4f,
  drag: vec4f,      // (dragMode[0/1/2], dragAxis, showTarget, hoveredMat)
  param3A: vec4f,   // (warp, grain, nscale, opacity) light A
  param3B: vec4f,   // (warp, grain, nscale, opacity) light B
  dC: vec4f, uC: vec4f, vC: vec4f, paramC: vec4f,   // light C basis + (scale, wallDist, shape, clipSolid)
  param2C: vec4f,   // (lightType, lightDist, cosSpot, armScale)
  targetC: vec4f,   // (Tx,Ty,Tz, _)
  param3C: vec4f,   // (warp, grain, nscale, opacity)
  lc: vec4f,        // (showWallC, enabledC, _, _)
  gen: vec4f,       // (genMode, iterations/count, seed, objScale)
  genA: vec4f,      // generator params, reinterpreted per mode
  genB: vec4f,      // generator params, reinterpreted per mode
  anim: vec4f,      // (time, speed, _, _) fractal animation clock; shader reads only .x (time) — speed is applied JS-side into time
  fracA: vec4f, fracB: vec4f, fracC: vec4f,   // per-light fractal params, reinterpreted per shape type
  coneMode: vec4f,  // (coneFixedAngleA, ...B, ...C, _) per-light: 1 = fixed cone angle, 0 = fit target
  wallSize: vec4f,  // (wallSizeA, ...B, ...C, _) manual margin multiplier (>=1) on the fixed-angle spotlight pool
  bendA: vec4f,     // (bendType, bendAmount, bendFreq, showRays[global]) light A
  bendB: vec4f,     // (bendType, bendAmount, bendFreq, _) light B
  bendC: vec4f,     // (bendType, bendAmount, bendFreq, _) light C
};
@group(0) @binding(0) var<uniform> P: CParams;
@group(0) @binding(1) var frame: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var shapeTexA: texture_2d<f32>;
@group(0) @binding(3) var shapeTexB: texture_2d<f32>;
@group(0) @binding(4) var shapeSamp: sampler;
@group(0) @binding(5) var shapeTexC: texture_2d<f32>;

${wt}

fn sdBox3(p: vec3f, b: f32) -> f32 {
  let d = abs(p) - vec3f(b);
  return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
}

fn shape2D(p2: vec2f, t: f32) -> f32 {
  if (t < 0.5) { return sd_circle2(p2, 1.0); }
  if (t < 1.5) { return sd_box2(p2, vec2f(1.0, 1.0)); }
  return sd_tri2(p2, 1.0);
}
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
fn fracFor(lightIdx: i32) -> vec4f {
  if (lightIdx == 0) { return P.fracA; }
  if (lightIdx == 1) { return P.fracB; }
  return P.fracC;
}
fn coneModeFor(lightIdx: i32) -> f32 {
  if (lightIdx == 0) { return P.coneMode.x; }
  if (lightIdx == 1) { return P.coneMode.y; }
  return P.coneMode.z;
}
// Julia: fr=(cx,cy,orbitR,iters). Filled set is negative; boundary uses the escape-time DE. c orbits with time.
fn julia2D(p2: vec2f, fr: vec4f, lightIdx: i32) -> f32 {
  let iters = i32(clamp(fr.w, 2.0, 24.0) + 0.5);
  let phase = P.anim.x + f32(lightIdx) * 2.0944;
  let c = vec2f(fr.x, fr.y) + fr.z * vec2f(cos(phase), sin(phase));
  var z = p2 * 1.5;                       // map target [-1,1] into Julia space
  var dz = vec2f(1.0, 0.0);
  var escaped = false;
  for (var i = 0; i < iters; i = i + 1) {
    if (dot(z, z) > 16.0) { escaped = true; break; }
    dz = 2.0 * cmul(z, dz);
    z = cmul(z, z) + c;
  }
  if (!escaped && dot(z, z) <= 16.0) { return -0.25; }   // inside the filled set
  let r = length(z);
  let de = 0.5 * r * log(max(r, 1e-6)) / max(length(dz), 1e-6);   // r > 4 here (escaped); the max() guards are defensive
  let lipK = 1.5;   // escape-time DE is already a conservative lower bound; small constant margin only (iters-scaling needlessly starved the march)
  return de / lipK;
}
// Fold: fr=(angle,sway,offset,iters). 2D Sierpinski-ish; angle sways with time.
fn fold2D(p2: vec2f, fr: vec4f, lightIdx: i32) -> f32 {
  let iters = i32(clamp(fr.w, 1.0, 10.0) + 0.5);
  let angle = fr.x + fr.y * sin(P.anim.x + f32(lightIdx) * 2.0944);
  let off = fr.z;
  let s = 1.9;
  var p = p2;
  var scaleAcc = 1.0;
  for (var i = 0; i < iters; i = i + 1) {
    p = abs(p);
    p = rot2(p, angle);
    p = p * s - vec2f(off * (s - 1.0));
    scaleAcc = scaleAcc * s;
  }
  let lipK = 1.3;   // abs/rot/scale fold is already 1-Lipschitz via scaleAcc; small constant margin (sway is animation amplitude, not spatial Lipschitz)
  return sd_box2(p, vec2f(0.5, 0.5)) / scaleAcc / lipK;
}
// Burning Ship (6): escape-time z = (|x|+i|y|)^2 + c; filled set negative; c orbits time.
fn burningShip2D(p2: vec2f, fr: vec4f, lightIdx: i32) -> f32 {
  let iters = i32(clamp(fr.w, 2.0, 24.0) + 0.5);
  let phase = P.anim.x + f32(lightIdx) * 2.0944;
  let c = vec2f(fr.x, fr.y) + fr.z * vec2f(cos(phase), sin(phase));
  var z = p2 * 1.5; var dz = vec2f(1.0, 0.0); var escaped = false;
  for (var i = 0; i < iters; i = i + 1) {
    if (dot(z, z) > 16.0) { escaped = true; break; }
    let za = vec2f(abs(z.x), abs(z.y));
    dz = 2.0 * cmul(za, dz);   // dz via abs-chain (non-holomorphic kink); lipK margin covers the gap
    z = cmul(za, za) + c;
  }
  if (!escaped && dot(z, z) <= 16.0) { return -0.25; }
  let r = length(z);
  return 0.5 * r * log(max(r, 1e-6)) / max(length(dz), 1e-6) / 1.5;
}
// Tricorn (9): escape-time z = conj(z)^2 + c.
fn tricorn2D(p2: vec2f, fr: vec4f, lightIdx: i32) -> f32 {
  let iters = i32(clamp(fr.w, 2.0, 24.0) + 0.5);
  let phase = P.anim.x + f32(lightIdx) * 2.0944;
  let c = vec2f(fr.x, fr.y) + fr.z * vec2f(cos(phase), sin(phase));
  var z = p2 * 1.5; var dz = vec2f(1.0, 0.0); var escaped = false;
  for (var i = 0; i < iters; i = i + 1) {
    if (dot(z, z) > 16.0) { escaped = true; break; }
    let zc = vec2f(z.x, -z.y);
    dz = 2.0 * cmul(zc, dz);   // dz via conj-chain (anti-holomorphic); lipK margin covers the gap
    z = cmul(zc, zc) + c;
  }
  if (!escaped && dot(z, z) <= 16.0) { return -0.25; }
  let r = length(z);
  return 0.5 * r * log(max(r, 1e-6)) / max(length(dz), 1e-6) / 1.5;
}
// Phoenix (8): escape-time z' = z^2 + c + p*zPrev; p=fr.z, small fixed c-orbit.
fn phoenix2D(p2: vec2f, fr: vec4f, lightIdx: i32) -> f32 {
  let iters = i32(clamp(fr.w, 2.0, 30.0) + 0.5);
  let phase = P.anim.x + f32(lightIdx) * 2.0944;
  let c = vec2f(fr.x, fr.y) + 0.1 * vec2f(cos(phase), sin(phase));
  let pp = fr.z;
  var z = p2 * 1.5; var zPrev = vec2f(0.0, 0.0); var dz = vec2f(1.0, 0.0); var dzPrev = vec2f(0.0, 0.0); var escaped = false;
  for (var i = 0; i < iters; i = i + 1) {
    if (dot(z, z) > 16.0) { escaped = true; break; }
    let zNext = cmul(z, z) + c + pp * zPrev;
    let dzNext = 2.0 * cmul(z, dz) + pp * dzPrev;   // include the memory term -> DE stays conservative even at large |p|
    zPrev = z; z = zNext; dzPrev = dz; dz = dzNext;
  }
  if (!escaped && dot(z, z) <= 16.0) { return -0.25; }
  let r = length(z);
  return 0.5 * r * log(max(r, 1e-6)) / max(length(dz), 1e-6) / 1.5;
}
// Newton (7): basin of root 0 of z^3-1 (roots spin with time). Binary fill.
fn newton2D(p2: vec2f, fr: vec4f, lightIdx: i32) -> f32 {
  let spin = fr.x + P.anim.x + f32(lightIdx) * 2.0944;
  let relax = max(fr.y, 0.1);
  let iters = i32(clamp(fr.z, 4.0, 40.0) + 0.5);
  var z = p2 * 1.4;
  for (var i = 0; i < iters; i = i + 1) {
    let z2 = cmul(z, z); let z3 = cmul(z2, z);
    let f = z3 - vec2f(1.0, 0.0);
    let fp = 3.0 * z2;
    let denom = max(dot(fp, fp), 1e-6);
    let quot = vec2f(f.x * fp.x + f.y * fp.y, f.y * fp.x - f.x * fp.y) / denom;   // f / f'
    z = z - relax * quot;
  }
  var d0 = 1e9; var dOther = 1e9;
  for (var k = 0; k < 3; k = k + 1) {
    let ang = spin + f32(k) * 2.0944;
    let root = vec2f(cos(ang), sin(ang));
    let dd = length(z - root);
    if (k == 0) { d0 = dd; } else { dOther = min(dOther, dd); }
  }
  // Smooth signed proxy instead of a binary +/-0.08. Same zero set (negative inside root 0's basin,
  // zero exactly on the boundary where d0 == dOther), but continuous in position AND in the spin
  // phase -- the basin boundary is fractal and the roots turn with the anim clock, so the binary
  // version made the wall shadow a 1-bit pattern that flickered every frame while animating. The
  // magnitude still saturates at 0.08, so march step sizes stay in the range this was tuned for.
  return 0.08 * (d0 - dOther) / max(d0 + dOther, 1e-6);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
fn smaxc(a: f32, b: f32, k: f32) -> f32 { return -smin(-a, -b, k); }

fn hash21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i); let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0)); let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm2(p: vec2f) -> f32 {
  var v = 0.0; var amp = 0.5; var pp = p;
  for (var i = 0; i < 4; i = i + 1) { v = v + amp * vnoise(pp); pp = pp * 2.0; amp = amp * 0.5; }
  return v;     // ~[0,1)
}
fn rot2(p: vec2f, a: f32) -> vec2f { let c = cos(a); let s = sin(a); return vec2f(c * p.x - s * p.y, s * p.x + c * p.y); }
fn hash33(p3in: vec3f) -> vec3f {                       // deterministic [0,1]^3 from an index/seed
  var p3 = fract(p3in * vec3f(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
fn fwdStepK() -> f32 {                                   // forward-mode march step safety
  let m = i32(P.gen.x + 0.5);
  if (m == 2) { return 0.5; }                           // Mandelbulb DE approximate -> half steps
  return 1.0;                                            // exact (Menger) + smin-union (composite/metaballs, near-Lip-1, stable at exposed slider ranges) + inverse: full steps; mode 0 is byte-identical
}
// Space-warp in a light's local frame. dir=-1 => inverse warp Winv (used by the SDF so beams/shadows bend);
// dir=+1 => forward warp W (used by the ray-grid viz). W and Winv are reciprocal, so the viz matches the SDF.
fn bendXform(p: vec3f, d: vec3f, u: vec3f, v: vec3f, tgt: vec3f, btype: f32, amount: f32, freq: f32, dir: f32) -> vec3f {
  let ti = i32(btype + 0.5);
  if (ti == 0 || abs(amount) < 1e-5) { return p; }
  let rel = p - tgt;
  let a = dot(rel, d);
  var pu = dot(rel, u);
  var pv = dot(rel, v);
  if (ti == 1) {                                  // wave: perpendicular ripple along the axis
    pu = pu + dir * amount * sin(a * freq);
  } else if (ti == 2) {                           // swirl: axial twist increasing with distance
    let ang = dir * amount * a;
    let c = cos(ang); let s = sin(ang);
    let nu = pu * c - pv * s; let nv = pu * s + pv * c; pu = nu; pv = nv;
  } else if (ti == 3) {                           // lens: perpendicular converge/diverge with distance
    let f = pow(max(1.0 + amount * a, 0.05), -dir);
    pu = pu * f; pv = pv * f;
  } else {                                        // pinch+twist: twist (freq) + radial scale (amount)
    let ang = dir * freq * a;
    let c = cos(ang); let s = sin(ang);
    let nu = pu * c - pv * s; let nv = pu * s + pv * c; pu = nu; pv = nv;
    let f = pow(max(1.0 + 0.5 * amount * a, 0.05), -dir);
    pu = pu * f; pv = pv * f;
  }
  return tgt + a * d + pu * u + pv * v;
}
// Step deflation: a warp changes the SDF's Lipschitz constant, so shrink the march step as the
// largest active bend amount grows. All bends off => 1.0 => byte-identical marching.
fn bendStepK() -> f32 {
  if (P.bendC.w < 0.5) { return 1.0; }   // anyBend flag off -> no light bends -> full-step march (cheap per-step early-out)
  // only deflate the step for lights whose bend is actually ON (bendType > 0); the default
  // bendAmount is nonzero, so gating on amount alone would slow every march even with bend off.
  let mA = select(0.0, abs(P.bendA.y), P.bendA.x > 0.5);
  let mB = select(0.0, abs(P.bendB.y), P.bendB.x > 0.5);
  let mC = select(0.0, abs(P.bendC.y), P.bendC.x > 0.5);
  let m = max(mA, max(mB, mC));
  return 1.0 / (1.0 + 2.5 * m);
}
fn sampleCustom(p2: vec2f, lightIdx: i32) -> f32 {
  let uv = p2 * 0.5 + 0.5;
  if (lightIdx == 0) { return textureSampleLevel(shapeTexA, shapeSamp, uv, 0.0).r; }
  if (lightIdx == 1) { return textureSampleLevel(shapeTexB, shapeSamp, uv, 0.0).r; }
  return textureSampleLevel(shapeTexC, shapeSamp, uv, 0.0).r;
}
// base silhouette + parametric noise (warp edge, grain holes). np=(warp,grain,nscale,opacity); seed varies per light.
// np.w (opacity) is consumed by the shadow march, not here.
fn shapeNoisy(p2: vec2f, t: f32, np: vec4f, seed: f32, lightIdx: i32) -> f32 {
  var base: f32;
  if (t >= 8.5) { base = tricorn2D(p2, fracFor(lightIdx), lightIdx); }
  else if (t >= 7.5) { base = phoenix2D(p2, fracFor(lightIdx), lightIdx); }
  else if (t >= 6.5) { base = newton2D(p2, fracFor(lightIdx), lightIdx); }
  else if (t >= 5.5) { base = burningShip2D(p2, fracFor(lightIdx), lightIdx); }
  else if (t >= 4.5) { base = fold2D(p2, fracFor(lightIdx), lightIdx); }
  else if (t >= 3.5) { base = julia2D(p2, fracFor(lightIdx), lightIdx); }
  else if (t >= 2.5) { base = sampleCustom(p2, lightIdx); }
  else { base = shape2D(p2, t); }
  if (np.x < 1e-4 && np.y < 1e-4) { return base; }          // clean fast path (custom SDF is Lipschitz-1)
  let q = p2 * np.z + vec2f(seed, seed * 1.7);
  var s = base;
  if (np.x >= 1e-4) { s = base - np.x * (fbm2(q) - 0.5); }
  if (np.y >= 1e-4) { s = max(s, np.y * (0.5 - fbm2(q * 2.7 + vec2f(11.0, 7.0)))); }
  let lipK = 1.0 + np.x * 4.25 * np.z + np.y * 11.47 * np.z;
  return s / lipK;
}
fn bendForFor(lightIdx: i32) -> vec4f {
  if (lightIdx == 0) { return P.bendA; }
  if (lightIdx == 1) { return P.bendB; }
  return P.bendC;
}
fn bendTgtFor(lightIdx: i32) -> vec3f {
  if (lightIdx == 0) { return P.targetA.xyz; }
  if (lightIdx == 1) { return P.targetB.xyz; }
  return P.targetC.xyz;
}
fn prism(p: vec3f, d: vec3f, u: vec3f, v: vec3f, param: vec4f, np: vec4f, seed: f32, lightIdx: i32) -> f32 {
  var pb = p;
  if (P.bendC.w > 0.5) { let bf = bendForFor(lightIdx); pb = bendXform(p, d, u, v, bendTgtFor(lightIdx), bf.x, bf.y, bf.z, -1.0); }
  let x2 = dot(pb, u);
  let y2 = dot(pb, v);
  let scale = max(param.x, 0.05);
  var s = shapeNoisy(vec2f(x2, y2) / scale, param.z, np, seed, lightIdx) * scale;
  if (param.w > 0.5) { s = max(s, abs(dot(pb, d)) - param.y); }
  return s;
}
fn cone(p: vec3f, d: vec3f, u: vec3f, v: vec3f, param: vec4f, param2: vec4f, tgt: vec3f, np: vec4f, seed: f32, lightIdx: i32) -> f32 {
  var pb = p;
  if (P.bendC.w > 0.5) { let bf = bendForFor(lightIdx); pb = bendXform(p, d, u, v, tgt, bf.x, bf.y, bf.z, -1.0); }
  let baseScale = max(param.x, 0.05);
  let L = tgt + d * param2.y;                   // light position = target offset + lightDist along d
  let denom = dot(pb - L, d);
  if (denom > -1e-3) { return 1e9; }            // at/behind the light
  let t = (-param.y - dot(L, d)) / denom;       // t: param so (L + t*(pb-L)) lands on the wall plane dot(q,d) = -param.y
  let hit = L + t * (pb - L);
  var effScale = baseScale;
  if (coneModeFor(lightIdx) > 0.5) {                              // fixed cone angle: footprint = cone spread at the wall
    let cosT = clamp(param2.z, 0.05, 0.999);
    let tanSpot = sqrt(1.0 - cosT * cosT) / cosT;
    let distLW = max(dot(L, d) + param.y, 1e-3);                  // apex->wall distance along d (dot(L,d) + wallDist)
    effScale = max(distLW * tanSpot * baseScale, 1e-3);
  }
  var s = shapeNoisy(vec2f(dot(hit, u), dot(hit, v)) / effScale, param.z, np, seed, lightIdx) * effScale / max(t, 1e-3);
  if (param.w > 0.5) { s = max(s, abs(dot(pb, d)) - param.y); }
  return s;
}
fn fieldFor(p: vec3f, d: vec3f, u: vec3f, v: vec3f, param: vec4f, param2: vec4f, tgt: vec3f, np: vec4f, seed: f32, lightIdx: i32) -> f32 {
  if (param2.x < 0.5) { return prism(p, d, u, v, param, np, seed, lightIdx); }
  return cone(p, d, u, v, param, param2, tgt, np, seed, lightIdx);
}

fn boundSDF(p: vec3f) -> f32 {
  if (P.bound.x < 0.5) { return length(p) - P.bound.y; }
  return sdBox3(p, P.bound.y);
}

fn genComposite(pin: vec3f) -> f32 {
  let count = i32(clamp(P.gen.y, 1.0, 24.0) + 0.5);
  let seed = P.gen.z;
  let spread = max(P.genA.x, 0.1);
  let sizeVar = clamp(P.genA.y, 0.0, 0.9);
  let smoothK = max(P.genA.z, 0.001);
  let rotAmt = P.genA.w;
  var d = 1e4;
  for (var i = 0; i < count; i = i + 1) {
    let h = hash33(vec3f(f32(i) + 1.0, seed + 1.7, f32(i) * 2.3 + 4.0));
    let pos = (h * 2.0 - 1.0) * spread;
    let sz = 0.2 * (1.0 + (h.x - 0.5) * 2.0 * sizeVar);
    var q = pin - pos;
    let ang = (h.y - 0.5) * 6.28318 * rotAmt;
    let xz = rot2(q.xz, ang); q.x = xz.x; q.z = xz.y;
    let kind = i32(h.z * 3.0);
    var sd = sdBox3(q, sz);
    if (kind == 1) { sd = length(q) - sz; }
    if (kind == 2) { sd = (abs(q.x) + abs(q.y) + abs(q.z) - sz) * 0.57735027; }   // octahedron, 1/sqrt(3) normalization
    d = smin(d, sd, smoothK);
  }
  return d;
}
fn genMandelbulb(pin: vec3f) -> f32 {
  let iters = i32(clamp(P.gen.y, 1.0, 16.0) + 0.5);
  let power = max(P.genA.x, 2.0);
  var z = pin; var dr = 1.0; var r = 0.0;
  for (var i = 0; i < iters; i = i + 1) {
    r = length(z);
    if (r > 2.0) { break; }
    var theta = acos(clamp(z.z / max(r, 1e-6), -1.0, 1.0));
    var phi = atan2(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    let zr = pow(r, power);
    theta = theta * power; phi = phi * power;
    z = zr * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + pin;
  }
  return 0.5 * log(max(r, 1e-6)) * r / max(dr, 1e-6);
}
fn genMenger(pin: vec3f) -> f32 {
  let iters = i32(clamp(P.gen.y, 1.0, 8.0) + 0.5);
  let asym = P.genA.x;   // uniform phase-shift of the fold grid (same on all axes; not a per-axis asymmetry)
  var d = sdBox3(pin, 1.0); var s = 1.0;
  for (var i = 0; i < iters; i = i + 1) {
    let m = pin * s;
    let a = (m - 2.0 * floor(m * 0.5 + vec3f(asym))) - 1.0;   // GLSL mod(m,2)-1 with asymmetry shift
    s = s * 3.0;
    let r = abs(1.0 - 3.0 * abs(a));
    let da = max(r.x, r.y); let db = max(r.y, r.z); let dc = max(r.z, r.x);
    let c = (min(min(da, db), dc) - 1.0) / s;
    d = max(d, c);
  }
  return d;
}
fn genMetaballs(pin: vec3f) -> f32 {
  let count = i32(clamp(P.gen.y, 1.0, 24.0) + 0.5);
  let seed = P.gen.z;
  let radius = max(P.genA.x, 0.05);
  let spread = max(P.genA.y, 0.1);
  let smoothK = max(P.genA.z, 0.02);
  var d = 1e4;
  for (var i = 0; i < count; i = i + 1) {
    let h = hash33(vec3f(f32(i) + 1.0, seed + 2.3, f32(i) * 1.9 + 5.0));
    let pos = (h * 2.0 - 1.0) * spread;
    d = smin(d, length(pin - pos) - radius, smoothK);
  }
  return d;
}
fn generator(pw: vec3f) -> f32 {
  let s = max(P.gen.w, 0.05);
  let p = pw / s;
  let m = i32(P.gen.x + 0.5);
  var d = 0.0;                        // overwritten by the dispatch below (generator() is only called for modes 1-4)
  if (m == 1) { d = genComposite(p); }
  else if (m == 2) { d = genMandelbulb(p); }
  else if (m == 3) { d = genMenger(p); }
  else if (m == 4) { d = genMetaballs(p); }
  return d * s;
}

fn shapeSDF(p: vec3f) -> f32 {
  if (P.gen.x > 0.5) {
    let kf = max(0.04 * P.bound.y, 0.02);
    return smaxc(boundSDF(p), generator(p), kf);
  }
  let pa = fieldFor(p, P.dA.xyz, P.uA.xyz, P.vA.xyz, P.paramA, P.param2A, P.targetA.xyz, P.param3A, 0.0, 0);
  let pb = fieldFor(p, P.dB.xyz, P.uB.xyz, P.vB.xyz, P.paramB, P.param2B, P.targetB.xyz, P.param3B, 53.0, 1);
  var pc = -1e4;
  if (P.lc.y > 0.5) { pc = fieldFor(p, P.dC.xyz, P.uC.xyz, P.vC.xyz, P.paramC, P.param2C, P.targetC.xyz, P.param3C, 107.0, 2); }
  let k = max(0.04 * P.bound.y, 0.02);
  return smaxc(boundSDF(p), smaxc(pa, smaxc(pb, pc, k), k), k);
}

fn segSDF(p: vec3f, d: vec3f, len: f32, r: f32) -> f32 {
  let t = clamp(dot(p, d), 0.0, len);
  return length(p - d * t) - r;
}
fn sphSDF(p: vec3f, c: vec3f, r: f32) -> f32 { return length(p - c) - r; }
fn solidConeSDF(p: vec3f, base: vec3f, axis: vec3f, len: f32, rad: f32) -> f32 {
  let rel = p - base;
  let h = dot(rel, axis);
  let radial = length(rel - axis * h);
  let tipR = rad * (1.0 - clamp(h / len, 0.0, 1.0));
  let lateral = (radial - tipR) * (len / sqrt(len * len + rad * rad));
  return max(lateral, max(-h, h - len));
}
fn coneShellSDF(p: vec3f, apex: vec3f, axis: vec3f, cosT: f32, len: f32, thick: f32) -> f32 {
  let rel = p - apex;
  let along = dot(rel, axis);
  if (along < 0.0 || along > len) { return 1e9; }
  let radial = length(rel - axis * along);
  let tanT = sqrt(max(1.0 - cosT * cosT, 0.0)) / max(cosT, 1e-3);
  return abs(radial - along * tanT) * cosT - thick;       // distance to the lateral cone surface
}
fn ringSDF(p: vec3f, center: vec3f, axis: vec3f, radius: f32, tube: f32) -> f32 {
  let rel = p - center;
  let along = dot(rel, axis);
  let radial = length(rel - axis * along);
  return length(vec2f(radial - radius, along)) - tube;
}
fn gizmoArrow(p: vec3f, base: vec3f, dir: vec3f, len: f32, shaftR: f32, headR: f32) -> f32 {
  let q = p - base;
  let shaft = segSDF(q, dir, len * 0.80, shaftR);                          // shaft covers 80% of len...
  let head = solidConeSDF(q, dir * (len * 0.80), dir, len * 0.22, headR);  // ...head base at that junction; headR>shaftR hides the overlap
  return min(shaft, head);
}
fn gizmoQuadBorder(p: vec3f, c: vec3f, a: vec3f, b: vec3f, half: f32, lineW: f32, thick: f32) -> f32 {
  let rel = p - c;
  let n = cross(a, b);
  let x = dot(rel, a); let y = dot(rel, b); let z = dot(rel, n);
  let frame = abs(sd_box2(vec2f(x, y), vec2f(half))) - lineW;   // Euclidean square-frame band (1-Lipschitz, tracer-safe)
  return max(frame, abs(z) - thick);                            // confine to the plate thickness
}
fn spreadGlyph(p: vec3f, H: vec3f, d: vec3f, u: vec3f, v: vec3f, isPoint: bool, st: f32, gs: f32) -> f32 {
  // A thin neon outline of the light's source shape (circle/square/triangle per st),
  // drawn in the light's u/v plane at the handle. Point lights add a short aim stub.
  // For custom shape (st >= 2.5), show a circle outline as placeholder.
  let rel = p - H;
  let along = dot(rel, d);
  let R = 0.12 * gs;            // > 0 (gs = bound size, UI-clamped >= 0.8) -> safe divisor below
  let lineW = 0.010 * gs;
  let thick = 0.012 * gs;
  let p2 = vec2f(dot(rel, u), dot(rel, v));
  let glyphSt = select(st, 0.0, st >= 2.5);                // custom shape -> circle placeholder
  let s2 = shape2D(p2 / R, glyphSt) * R;                   // <0 inside, 0 on the edge
  let outline = max(abs(s2) - lineW, abs(along) - thick); // abs() of a Euclidean SDF stays ~1-Lipschitz; max with the slab preserves it (tracer-safe)
  if (isPoint) {
    let stub = segSDF(rel, -d, 0.16 * gs, 0.006 * gs);   // d is unit (lightBasis), so -d is an exact axis; stub points from the handle toward the light's target
    return min(outline, stub);
  }
  return outline;
}
fn dashedAxis(p: vec3f, base: vec3f, dir: vec3f, halfLen: f32, r: f32, dashes: f32) -> f32 {
  let q = p - base;
  let t = dot(q, dir);
  if (abs(t) > halfLen) { return 1e9; }
  if (fract((t + halfLen) / (2.0 * halfLen) * dashes) > 0.5) { return 1e9; }
  return length(q - dir * t) - r;
}
fn dashedSquareBorder(p: vec3f, c: vec3f, a: vec3f, b: vec3f, half: f32, r: f32, dashes: f32) -> f32 {
  let e1 = dashedAxis(p, c + b * half, a, half, r, dashes);
  let e2 = dashedAxis(p, c - b * half, a, half, r, dashes);
  let e3 = dashedAxis(p, c + a * half, b, half, r, dashes);
  let e4 = dashedAxis(p, c - a * half, b, half, r, dashes);
  return min(min(e1, e2), min(e3, e4));
}
fn wallSDF(p: vec3f, d: vec3f, u: vec3f, v: vec3f, planeDist: f32, scale: f32, fixedAngle: f32, lightDist: f32, cosSpot: f32, wallSize: f32) -> f32 {
  let along = dot(p, d) + planeDist;        // plane at dot(p,d) = -planeDist
  let x2 = dot(p, u); let y2 = dot(p, v);
  var E = 1.4 * scale;
  if (fixedAngle > 0.5) {
    let cosT = clamp(cosSpot, 0.05, 0.999);
    let tanT = sqrt(1.0 - cosT * cosT) / cosT;
    let poolR = max((lightDist + planeDist) * tanT, 1e-3);   // spotlight pool radius on the wall
    E = poolR * max(wallSize, 1.0);
  }
  let inPlane = max(abs(x2) - E, abs(y2) - E);
  return max(abs(along) - 0.02, inPlane);
}

fn shadowRay(w: vec3f, dir: vec3f, maxT: f32, density: f32) -> f32 {   // Beer-Lambert occlusion in [0,1]
  var t = 0.02;
  var inside = 0.0;
  let sbudget = select(200, 128, P.anim.z > 0.5);   // perf mode (anim.z) trims the shadow-ray budget
  for (var i = 0; i < sbudget; i = i + 1) { // budget; half-step modes (KIFS/Mandelbulb) cover less distance/iter but opaque rays still early-out
    let s = shapeSDF(w + dir * t);
    // Inside the solid s is negative, so max(s, floor) degenerated to the 0.012 floor: crossing a
    // ~2-unit body cost ~167 steps and ate the whole budget whenever a per-light opacity below ~1
    // kept the saturation early-out from firing. |s| is the distance to the nearest boundary from
    // inside, so striding by it is safe and collapses a thick crossing to a few steps -- and it
    // still refines automatically near surfaces, where |s| -> 0. Optical depth is unaffected: the
    // accumulator adds the step actually taken, so the path length stays exact at any stride.
    // The 0.9 factor is insurance against smooth-min blends over-reporting distance near unions.
    let step = max(abs(s) * 0.9, 0.012) * fwdStepK() * bendStepK();
    if (s < 0.0) { inside = inside + step; }                  // accumulate physical path length (step), so optical depth is correct at any step-safety scale
    t = t + step;
    if (1.0 - exp(-density * inside) > 0.99) { return 1.0; }  // fully opaque -> just black (early out)
    if (t > maxT) { break; }
  }
  return 1.0 - exp(-density * inside);
}

// returns vec2(distance, materialId)  -- mats: 0 sculpture, 1 arrowA, 2 arrowB, 3 wallA, 4 wallB, 5 gizmo, 6 wallC
fn sceneSDF(p: vec3f) -> vec2f {
  var best = vec2f(shapeSDF(p), 0.0);
  var selI = i32(floor(P.show.z + 0.5));
  if (selI == 2 && P.lc.y < 0.5) { selI = -1; }   // disabled C is never the active gizmo
  // --- minimum gizmo (dot + glyph) for every light; full manipulator for the active light ---
  let ex = vec3f(1.0, 0.0, 0.0); let ey = vec3f(0.0, 1.0, 0.0); let ez = vec3f(0.0, 0.0, 1.0);
  let gs = P.bound.y;
  let armA = select(gs * 1.6 * P.param2A.w, P.param2A.y, P.param2A.x > 0.5);
  let HA = P.targetA.xyz + P.dA.xyz * armA;
  let armB = select(gs * 1.6 * P.param2B.w, P.param2B.y, P.param2B.x > 0.5);
  let HB = P.targetB.xyz + P.dB.xyz * armB;
  let dotA = sphSDF(p, HA, 0.03 * gs);
  if (dotA < best.x) { best = vec2f(dotA, 5.0); }      // amber handle dot, light A
  let dotB = sphSDF(p, HB, 0.03 * gs);
  if (dotB < best.x) { best = vec2f(dotB, 5.0); }      // amber handle dot, light B
  let glyA = spreadGlyph(p, HA, P.dA.xyz, P.uA.xyz, P.vA.xyz, P.param2A.x > 0.5, P.paramA.z, gs);
  if (glyA < best.x) { best = vec2f(glyA, 14.0); }     // source-shape glyph, light A
  let glyB = spreadGlyph(p, HB, P.dB.xyz, P.uB.xyz, P.vB.xyz, P.param2B.x > 0.5, P.paramB.z, gs);
  if (glyB < best.x) { best = vec2f(glyB, 14.0); }     // source-shape glyph, light B
  let armC = select(gs * 1.6 * P.param2C.w, P.param2C.y, P.param2C.x > 0.5);
  let HC = P.targetC.xyz + P.dC.xyz * armC;
  if (P.lc.y > 0.5) {
    let dotC = sphSDF(p, HC, 0.03 * gs);
    if (dotC < best.x) { best = vec2f(dotC, 5.0); }
    let glyC = spreadGlyph(p, HC, P.dC.xyz, P.uC.xyz, P.vC.xyz, P.param2C.x > 0.5, P.paramC.z, gs);
    if (glyC < best.x) { best = vec2f(glyC, 14.0); }
  }
  var Hsel = HA; var tgtSel = P.targetA.xyz; var armSel = armA;
  if (selI == 1) { Hsel = HB; tgtSel = P.targetB.xyz; armSel = armB; }
  if (selI == 2) { Hsel = HC; tgtSel = P.targetC.xyz; armSel = armC; }
  if (selI >= 0) {                                      // full manipulator for the active light
    let aLen = 0.46 * gs; let shaftR = 0.006 * gs; let headR = 0.022 * gs;
    let gx = gizmoArrow(p, Hsel, ex, aLen, shaftR, headR);
    if (gx < best.x) { best = vec2f(gx, 10.0); }        // X axis
    let gy = gizmoArrow(p, Hsel, ey, aLen, shaftR, headR);
    if (gy < best.x) { best = vec2f(gy, 11.0); }        // Y axis
    let gz = gizmoArrow(p, Hsel, ez, aLen, shaftR, headR);
    if (gz < best.x) { best = vec2f(gz, 12.0); }        // Z axis
    let qh = 0.085 * gs; let qoff = 0.16 * gs; let qline = 0.010 * gs; let qthick = 0.004 * gs;
    let qxy = gizmoQuadBorder(p, Hsel + (ex + ey) * qoff, ex, ey, qh, qline, qthick);
    if (qxy < best.x) { best = vec2f(qxy, 13.0); }      // XY plane quad (border)
    let qyz = gizmoQuadBorder(p, Hsel + (ey + ez) * qoff, ey, ez, qh, qline, qthick);
    if (qyz < best.x) { best = vec2f(qyz, 16.0); }      // YZ plane quad (border)
    let qzx = gizmoQuadBorder(p, Hsel + (ez + ex) * qoff, ez, ex, qh, qline, qthick);
    if (qzx < best.x) { best = vec2f(qzx, 17.0); }      // ZX plane quad (border)
  }
  if (P.show.w > 0.5 && selI >= 0) {                    // thin wireframe orbit sphere (cardinals + filler), active ring bright
    let tube = 0.0035 * gs; let ft = 0.0028 * gs;
    var dsel = P.dA.xyz; if (selI == 1) { dsel = P.dB.xyz; } if (selI == 2) { dsel = P.dC.xyz; }
    var activeRing = -1;
    if (P.drag.x > 0.5) {
      if (abs(P.drag.x - 3.0) < 0.5) { activeRing = i32(P.drag.y + 0.5); }   // orbit-drag -> the grabbed ring
      else {                                                                 // re-aim -> the ring the dir lies most within
        let ax = abs(dsel.x); let ay = abs(dsel.y); let az = abs(dsel.z);
        if (ax <= ay && ax <= az) { activeRing = 0; } else if (ay <= az) { activeRing = 1; } else { activeRing = 2; }
      }
    }
    let rx = ringSDF(p, tgtSel, ex, armSel, tube);
    if (rx < best.x) { best = vec2f(rx, select(18.0, 19.0, activeRing == 0)); }   // YZ-plane cardinal
    let ry = ringSDF(p, tgtSel, ey, armSel, tube);
    if (ry < best.x) { best = vec2f(ry, select(18.0, 19.0, activeRing == 1)); }   // XZ-plane cardinal
    let rz = ringSDF(p, tgtSel, ez, armSel, tube);
    if (rz < best.x) { best = vec2f(rz, select(18.0, 19.0, activeRing == 2)); }   // XY-plane cardinal
    // faint filler -> a denser globe: latitudes at +/-30 and +/-60 deg, meridians every ~30 deg
    let c30 = 0.86602540; let s30 = 0.5;            // cos/sin 30
    let lat1 = ringSDF(p, tgtSel + ey * (armSel * s30), ey, armSel * c30, ft);   // +30
    if (lat1 < best.x) { best = vec2f(lat1, 18.0); }
    let lat2 = ringSDF(p, tgtSel - ey * (armSel * s30), ey, armSel * c30, ft);   // -30
    if (lat2 < best.x) { best = vec2f(lat2, 18.0); }
    let lat3 = ringSDF(p, tgtSel + ey * (armSel * c30), ey, armSel * s30, ft);   // +60
    if (lat3 < best.x) { best = vec2f(lat3, 18.0); }
    let lat4 = ringSDF(p, tgtSel - ey * (armSel * c30), ey, armSel * s30, ft);   // -60
    if (lat4 < best.x) { best = vec2f(lat4, 18.0); }
    let m1 = ringSDF(p, tgtSel, normalize(vec3f(c30, 0.0, -s30)), armSel, ft);   // meridian 30
    if (m1 < best.x) { best = vec2f(m1, 18.0); }
    let m2 = ringSDF(p, tgtSel, normalize(vec3f(s30, 0.0, -c30)), armSel, ft);   // meridian 60
    if (m2 < best.x) { best = vec2f(m2, 18.0); }
    let m3 = ringSDF(p, tgtSel, normalize(vec3f(-s30, 0.0, -c30)), armSel, ft);  // meridian 120
    if (m3 < best.x) { best = vec2f(m3, 18.0); }
    let m4 = ringSDF(p, tgtSel, normalize(vec3f(-c30, 0.0, -s30)), armSel, ft);  // meridian 150
    if (m4 < best.x) { best = vec2f(m4, 18.0); }
  }
  if (P.drag.x > 0.5 && P.drag.x < 2.5) {               // axis/plane drag guide (orbit mode 3 uses the active-ring highlight instead)
    let gi = i32(P.drag.y + 0.5);
    if (P.drag.x < 1.5) {                               // axis drag -> dashed line
      var ax = ex;
      if (gi == 1) { ax = ey; }
      if (gi == 2) { ax = ez; }
      let gl = dashedAxis(p, Hsel, ax, 1.2 * gs, 0.006 * gs, 22.0);
      if (gl < best.x) { best = vec2f(gl, 15.0); }
    } else {                                            // plane drag -> dashed square border
      var a1 = ex; var a2 = ey;
      if (gi == 1) { a1 = ey; a2 = ez; }
      if (gi == 2) { a1 = ez; a2 = ex; }
      let gb = dashedSquareBorder(p, Hsel, a1, a2, 0.5 * gs, 0.006 * gs, 10.0);
      if (gb < best.x) { best = vec2f(gb, 15.0); }
    }
  }
  if (P.show.x > 0.5) {
    let wl = wallSDF(p, P.dA.xyz, P.uA.xyz, P.vA.xyz, P.paramA.y, P.paramA.x, select(0.0, 1.0, P.coneMode.x > 0.5 && P.param2A.x > 0.5), P.param2A.y, P.param2A.z, P.wallSize.x);
    if (wl < best.x) { best = vec2f(wl, 3.0); }
  }
  if (P.show.y > 0.5) {
    let wl = wallSDF(p, P.dB.xyz, P.uB.xyz, P.vB.xyz, P.paramB.y, P.paramB.x, select(0.0, 1.0, P.coneMode.y > 0.5 && P.param2B.x > 0.5), P.param2B.y, P.param2B.z, P.wallSize.y);
    if (wl < best.x) { best = vec2f(wl, 4.0); }
  }
  if (P.lc.y > 0.5 && P.lc.x > 0.5) {
    let wl = wallSDF(p, P.dC.xyz, P.uC.xyz, P.vC.xyz, P.paramC.y, P.paramC.x, select(0.0, 1.0, P.coneMode.z > 0.5 && P.param2C.x > 0.5), P.param2C.y, P.param2C.z, P.wallSize.z);
    if (wl < best.x) { best = vec2f(wl, 6.0); }
  }
  if (selI == 0 && P.param2A.x > 0.5) {
    let apexA = P.targetA.xyz + P.dA.xyz * P.param2A.y;
    let cAxis = -P.dA.xyz;
    let len = P.param2A.y + P.paramA.y;                                  // lightDist + wallDist
    let tanT = sqrt(max(1.0 - P.param2A.z * P.param2A.z, 0.0)) / max(P.param2A.z, 1e-3);
    let baseC = apexA + cAxis * len;                                     // cone base center (on the wall)
    let rim = ringSDF(p, baseC, cAxis, len * tanT, 0.01 * P.bound.y);
    if (rim < best.x) { best = vec2f(rim, 9.0); }
    let apx = sphSDF(p, apexA, 0.045 * P.bound.y);
    if (apx < best.x) { best = vec2f(apx, 9.0); }
  }
  if (selI == 1 && P.param2B.x > 0.5) {
    let apexB = P.targetB.xyz + P.dB.xyz * P.param2B.y;
    let cAxis = -P.dB.xyz;
    let len = P.param2B.y + P.paramB.y;
    let tanT = sqrt(max(1.0 - P.param2B.z * P.param2B.z, 0.0)) / max(P.param2B.z, 1e-3);
    let baseC = apexB + cAxis * len;
    let rim = ringSDF(p, baseC, cAxis, len * tanT, 0.01 * P.bound.y);
    if (rim < best.x) { best = vec2f(rim, 9.0); }
    let apx = sphSDF(p, apexB, 0.045 * P.bound.y);
    if (apx < best.x) { best = vec2f(apx, 9.0); }
  }
  if (selI == 2 && P.lc.y > 0.5 && P.param2C.x > 0.5) {
    let apexC = P.targetC.xyz + P.dC.xyz * P.param2C.y;
    let cAxis = -P.dC.xyz;
    let len = P.param2C.y + P.paramC.y;
    let tanT = sqrt(max(1.0 - P.param2C.z * P.param2C.z, 0.0)) / max(P.param2C.z, 1e-3);
    let baseC = apexC + cAxis * len;
    let rim = ringSDF(p, baseC, cAxis, len * tanT, 0.01 * P.bound.y);
    if (rim < best.x) { best = vec2f(rim, 9.0); }
    let apx = sphSDF(p, apexC, 0.045 * P.bound.y);
    if (apx < best.x) { best = vec2f(apx, 9.0); }
  }
  return best;
}

fn normalScene(p: vec3f) -> vec3f {
  let e = 0.0015;
  return normalize(vec3f(
    sceneSDF(p + vec3f(e,0,0)).x - sceneSDF(p - vec3f(e,0,0)).x,
    sceneSDF(p + vec3f(0,e,0)).x - sceneSDF(p - vec3f(0,e,0)).x,
    sceneSDF(p + vec3f(0,0,e)).x - sceneSDF(p - vec3f(0,0,e)).x
  ));
}

fn iridPalette(t: f32) -> vec3f {
  // cosine palette tuned toward the film colors (cyan/violet/rose/gold)
  let a = vec3f(0.60, 0.58, 0.66);
  let b = vec3f(0.36, 0.32, 0.30);
  let c = vec3f(1.0, 1.0, 1.0);
  let d = vec3f(0.55, 0.78, 0.95);
  return a + b * cos(6.28318 * (c * t + d));
}

fn iridMaterial(p: vec3f, n: vec3f, rd: vec3f, base: vec3f, iridStr: f32, shininess: f32) -> vec3f {
  let v = -rd;
  let l = normalize(vec3f(0.5, 0.8, 0.4));
  let h = normalize(l + v);
  let ndl = max(dot(n, l), 0.0);
  let f = pow(1.0 - max(dot(n, v), 0.0), 3.0);                 // Fresnel
  let irid = iridPalette(f * 0.85 + dot(n, vec3f(0.0, 1.0, 0.0)) * 0.15);
  let spec = pow(max(dot(n, h), 0.0), shininess);
  var col = base * (0.18 + 0.72 * ndl);
  col = mix(col, irid, iridStr * f);
  col = col + mix(vec3f(1.0), base, 0.6) * (spec * 0.9);       // tinted chrome glint
  return col;
}

fn matColor(mid: f32) -> vec3f {
  if (mid < 0.5) { return vec3f(0.72, 0.74, 0.82); }   // sculpture
  if (mid < 1.5) { return vec3f(0.22, 0.42, 0.85); }   // A arrow dim
  if (mid < 2.5) { return vec3f(0.82, 0.24, 0.40); }   // B arrow dim
  if (mid < 3.5) { return vec3f(0.30, 0.55, 1.00); }   // wall A
  if (mid < 4.5) { return vec3f(1.00, 0.32, 0.48); }   // wall B
  if (mid < 5.5) { return vec3f(1.0, 0.84, 0.30); }    // gizmo handle (amber)
  if (mid < 6.5) { return vec3f(0.55, 0.62, 0.78); }   // spotlight cone (mat 6 is also wall C, but walls shade in the wall branch and never reach matColor)
  if (mid < 7.5) { return vec3f(0.55, 0.74, 1.00); }   // A arrow bright (selected glow)
  if (mid < 8.5) { return vec3f(1.00, 0.55, 0.68); }   // B arrow bright (selected glow)
  if (mid < 9.5) { return vec3f(0.78, 0.93, 1.0); }    // cone rim / apex
  if (mid < 10.5) { return vec3f(1.00, 0.12, 0.14); }  // gizmo X axis (clean red, +X)
  if (mid < 11.5) { return vec3f(0.16, 1.00, 0.28); }  // gizmo Y axis (clean green, +Y up)
  if (mid < 12.5) { return vec3f(0.20, 0.40, 1.00); }  // gizmo Z axis (clean blue, +Z)
  if (mid < 13.5) { return vec3f(0.52, 0.20, 1.00); }  // gizmo XY plane quad (deep violet; stays violet under overdrive)
  if (mid < 14.5) { return vec3f(0.95, 0.92, 0.82); }  // spread glyph (warm white; distinct from the green Y axis)
  if (mid < 15.5) { return vec3f(0.86, 0.95, 1.0); }   // reticle / drag guides
  if (mid < 16.5) { return vec3f(0.52, 0.20, 1.00); }  // YZ plane quad (deep violet)
  if (mid < 17.5) { return vec3f(0.52, 0.20, 1.00); }  // ZX plane quad (deep violet)
  if (mid < 18.5) { return vec3f(0.50, 0.66, 0.74); }   // mat 18 = orbit sphere wire (faint cyan-grey)
  return vec3f(1.00, 0.78, 0.30);                       // mat 19 = active orbit ring (warm amber)
}

fn blendCone(ro: vec3f, rd: vec3f, col0: vec3f, tHit: f32, d: vec3f, param2: vec4f, wallDist: f32, tgt: vec3f) -> vec3f {
  let apex = tgt + d * param2.y;
  let axis = -d;
  let len = param2.y + wallDist;
  let band = 0.05 * P.bound.y;
  let tmax = min(tHit, 60.0);
  var acc = 0.0;
  for (var i = 0; i < 48; i = i + 1) {
    let tt = (f32(i) + 0.5) / 48.0 * tmax;
    let q = ro + rd * tt;
    let dShell = abs(coneShellSDF(q, apex, axis, param2.z, len, 0.0)); // dist to lateral surface
    if (dShell < band) { acc = acc + (1.0 - dShell / band); }
  }
  let alpha = clamp(acc * 0.10, 0.0, 0.5); // accumulate -> silhouette glow
  let coneTint = vec3f(0.62, 0.80, 1.0);
  return mix(col0, coneTint, alpha);
}
fn overlayCones(ro: vec3f, rd: vec3f, col0: vec3f, tHit: f32) -> vec3f {
  if (any(col0 > vec3f(1.0))) { return col0; }   // preserve HDR gizmo pixels for the bloom bright-pass
  var col = col0;
  var selI = i32(floor(P.show.z + 0.5));
  if (selI == 2 && P.lc.y < 0.5) { selI = -1; }
  if (selI == 0 && P.param2A.x > 0.5) { col = blendCone(ro, rd, col, tHit, P.dA.xyz, P.param2A, P.paramA.y, P.targetA.xyz); }
  if (selI == 1 && P.param2B.x > 0.5) { col = blendCone(ro, rd, col, tHit, P.dB.xyz, P.param2B, P.paramB.y, P.targetB.xyz); }
  if (selI == 2 && P.lc.y > 0.5 && P.param2C.x > 0.5) { col = blendCone(ro, rd, col, tHit, P.dC.xyz, P.param2C, P.paramC.y, P.targetC.xyz); }
  return col;
}
fn rayLightTint(selI: i32) -> vec3f {
  if (selI == 1) { return vec3f(1.0, 0.45, 0.6); }
  if (selI == 2) { return vec3f(0.5, 1.0, 0.6); }
  return vec3f(0.45, 0.7, 1.0);
}
fn overlayRayGrid(ro: vec3f, rd: vec3f, col0: vec3f, tHit: f32) -> vec3f {
  if (P.bendA.w < 0.5) { return col0; }            // global show-rays off
  if (any(col0 > vec3f(1.0))) { return col0; }     // preserve HDR gizmo pixels for the bloom bright-pass
  let selI = i32(floor(P.show.z + 0.5));
  if (selI < 0) { return col0; }
  var d = P.dA.xyz; var u = P.uA.xyz; var v = P.vA.xyz; var tg = P.targetA.xyz;
  var lt = P.param2A.x; var ld = P.param2A.y; var cosT = P.param2A.z; var arm = P.param2A.w; var bp = P.bendA;
  if (selI == 1) { d=P.dB.xyz; u=P.uB.xyz; v=P.vB.xyz; tg=P.targetB.xyz; lt=P.param2B.x; ld=P.param2B.y; cosT=P.param2B.z; arm=P.param2B.w; bp=P.bendB; }
  if (selI == 2) { d=P.dC.xyz; u=P.uC.xyz; v=P.vC.xyz; tg=P.targetC.xyz; lt=P.param2C.x; ld=P.param2C.y; cosT=P.param2C.z; arm=P.param2C.w; bp=P.bendC; }
  let armW = arm * P.bound.y * 1.6;
  let apex = tg + d * ld;                                   // point-light apex
  let reach = select(2.0 * P.bound.y + armW, ld + 2.0 * P.bound.y, lt > 0.5);
  let tanT = sqrt(max(1.0 - cosT * cosT, 0.0)) / max(cosT, 0.05);
  var glow = 0.0;
  let field = P.bendB.w > 0.5;                             // ray field (dense glow) vs a few thin curved rays (default)
  let gridN = select(3, 5, field);                         // few: 3x3=9 thin rays; field: 5x5=25 glowing rays
  let denom = select(0.025, 0.06, field);                  // few: thin distinct lines; field: fat merged glow
  let mult = select(0.5, 0.22, field);
  for (var gi = 0; gi < gridN; gi = gi + 1) {
    for (var gj = 0; gj < gridN; gj = gj + 1) {
      let gu = f32(gi) / f32(gridN - 1) * 2.0 - 1.0;        // -1..1
      let gv = f32(gj) / f32(gridN - 1) * 2.0 - 1.0;
      var origin = apex; var dir = d;
      if (lt > 0.5) { dir = normalize(-d + (u * gu + v * gv) * tanT); }   // point: fan from the apex toward the wall (-d)
      else { origin = tg + (u * gu + v * gv) * armW + d * (P.bound.y + armW); dir = -d; }   // planar: parallel rays toward the wall
      for (var k = 0; k < 20; k = k + 1) {
        let s = (f32(k) + 0.5) / 20.0 * reach;
        let bent = bendXform(origin + dir * s, d, u, v, tg, bp.x, bp.y, bp.z, 1.0);   // forward warp W
        let toP = bent - ro;
        let proj = dot(toP, rd);
        if (proj > 0.05) {                                   // draw the whole ray (additive glow over the scene)
          let perp = length(toP - rd * proj);
          glow = glow + exp(-perp * perp / denom);
        }
      }
    }
  }
  return col0 + rayLightTint(selI) * min(glow * mult, 3.0);
}
fn overlayDragPlane(ro: vec3f, rd: vec3f, col0: vec3f, tHit: f32) -> vec3f {
  if (P.drag.x < 1.5 || P.drag.x > 2.5) { return col0; }   // plane drag only
  if (any(col0 > vec3f(1.0))) { return col0; }   // preserve HDR gizmo pixels for the bloom bright-pass
  let selI = i32(floor(P.show.z + 0.5));
  let gs = P.bound.y;
  let armA = select(gs * 1.6 * P.param2A.w, P.param2A.y, P.param2A.x > 0.5);
  let armB = select(gs * 1.6 * P.param2B.w, P.param2B.y, P.param2B.x > 0.5);
  var H = P.targetA.xyz + P.dA.xyz * armA;
  if (selI == 1) { H = P.targetB.xyz + P.dB.xyz * armB; }
  if (selI == 2) { let armC2 = select(gs * 1.6 * P.param2C.w, P.param2C.y, P.param2C.x > 0.5); H = P.targetC.xyz + P.dC.xyz * armC2; }
  let ex = vec3f(1.0, 0.0, 0.0); let ey = vec3f(0.0, 1.0, 0.0); let ez = vec3f(0.0, 0.0, 1.0);
  let gi = i32(P.drag.y + 0.5);
  var a1 = ex; var a2 = ey;
  if (gi == 1) { a1 = ey; a2 = ez; }
  if (gi == 2) { a1 = ez; a2 = ex; }
  let n = cross(a1, a2);
  let denom = dot(rd, n);
  if (abs(denom) < 1e-5) { return col0; }
  let t = dot(H - ro, n) / denom;
  if (t < 0.0 || t > tHit) { return col0; }
  let q = ro + rd * t - H;
  let half = 0.5 * gs;
  if (abs(dot(q, a1)) > half || abs(dot(q, a2)) > half) { return col0; }
  return mix(col0, vec3f(0.70, 0.80, 1.0), 0.18);
}
fn fillPlane(ro: vec3f, rd: vec3f, col: vec3f, tHit: f32, c: vec3f, a: vec3f, b: vec3f, half: f32, st: f32, tint: vec3f, alpha: f32) -> vec3f {
  let n = cross(a, b);
  let denom = dot(rd, n);
  if (abs(denom) < 1e-5) { return col; }
  let t = dot(c - ro, n) / denom;
  if (t < 0.0 || t > tHit) { return col; }            // behind camera or occluded by nearer geometry
  let q = ro + rd * t - c;
  let x = dot(q, a); let y = dot(q, b);
  if (st < -0.5) {                                    // st<0 sentinel -> square quad interior
    if (abs(x) > half || abs(y) > half) { return col; }
  } else {                                            // shape interior (circle/square/triangle)
    if (shape2D(vec2f(x, y) / half, st) > 0.0) { return col; }
  }
  return mix(col, tint, alpha);
}
fn overlayGizmoFills(ro: vec3f, rd: vec3f, col0: vec3f, tHit: f32) -> vec3f {
  let selI = i32(floor(P.show.z + 0.5));
  if (selI < 0) { return col0; }                      // only the expanded light has quads/glyph fills
  if (any(col0 > vec3f(1.0))) { return col0; }        // preserve HDR cores for the bloom bright-pass
  let gs = P.bound.y;
  let ex = vec3f(1.0,0.0,0.0); let ey = vec3f(0.0,1.0,0.0); let ez = vec3f(0.0,0.0,1.0);
  let armA = select(gs * 1.6 * P.param2A.w, P.param2A.y, P.param2A.x > 0.5);
  let armB = select(gs * 1.6 * P.param2B.w, P.param2B.y, P.param2B.x > 0.5);
  var H = P.targetA.xyz + P.dA.xyz * armA; var uu = P.uA.xyz; var vv = P.vA.xyz; var st = P.paramA.z;
  if (selI == 1) { H = P.targetB.xyz + P.dB.xyz * armB; uu = P.uB.xyz; vv = P.vB.xyz; st = P.paramB.z; }
  if (selI == 2) { let armC2 = select(gs * 1.6 * P.param2C.w, P.param2C.y, P.param2C.x > 0.5); H = P.targetC.xyz + P.dC.xyz * armC2; uu = P.uC.xyz; vv = P.vC.xyz; st = P.paramC.z; }
  var col = col0;
  let qh = 0.085 * gs; let qoff = 0.16 * gs;
  let violet = vec3f(0.52, 0.20, 1.0);
  col = fillPlane(ro, rd, col, tHit, H + (ex + ey) * qoff, ex, ey, qh, -1.0, violet, 0.16);   // XY
  col = fillPlane(ro, rd, col, tHit, H + (ey + ez) * qoff, ey, ez, qh, -1.0, violet, 0.16);   // YZ
  col = fillPlane(ro, rd, col, tHit, H + (ez + ex) * qoff, ez, ex, qh, -1.0, violet, 0.16);   // ZX
  let fillSt = select(st, 0.0, st >= 2.5);              // custom shape (t=3) -> circle placeholder fill
  col = fillPlane(ro, rd, col, tHit, H, uu, vv, 0.12 * gs, fillSt, vec3f(0.95, 0.92, 0.82), 0.14); // source-shape glyph
  return col;
}
fn overlayOrbitShell(ro: vec3f, rd: vec3f, col0: vec3f, tHit: f32) -> vec3f {
  if (P.show.w < 0.5) { return col0; }                 // show-orbit off
  let selI = i32(floor(P.show.z + 0.5));
  if (selI < 0) { return col0; }
  if (any(col0 > vec3f(1.0))) { return col0; }          // preserve HDR gizmo pixels for the bloom
  let gs = P.bound.y;
  let armA = select(gs * 1.6 * P.param2A.w, P.param2A.y, P.param2A.x > 0.5);
  let armB = select(gs * 1.6 * P.param2B.w, P.param2B.y, P.param2B.x > 0.5);
  var T = P.targetA.xyz; var arm = armA;
  if (selI == 1) { T = P.targetB.xyz; arm = armB; }
  if (selI == 2) { let armC2 = select(gs * 1.6 * P.param2C.w, P.param2C.y, P.param2C.x > 0.5); T = P.targetC.xyz; arm = armC2; }
  let oc = ro - T;                                      // ray-sphere intersection (near hit)
  let b = dot(oc, rd);
  let disc = b * b - (dot(oc, oc) - arm * arm);
  if (disc < 0.0) { return col0; }
  let t = -b - sqrt(disc);
  if (t < 0.0 || t > tHit) { return col0; }
  return mix(col0, vec3f(0.40, 0.55, 0.70), 0.05);      // faint cool shell -> the globe reads as a 3D surface
}
fn ringMark(ro: vec3f, rd: vec3f, c: vec3f, axis: vec3f, refDir: vec3f, radius: f32, tube: f32, dashes: f32) -> bool {
  let denom = dot(rd, axis);
  if (abs(denom) < 1e-5) { return false; }              // ray parallel to the ring's plane
  let t = dot(c - ro, axis) / denom;
  if (t <= 0.0) { return false; }                        // behind the camera
  let q = ro + rd * t - c;
  if (abs(length(q) - radius) > tube) { return false; }  // not on the ring band
  let b2 = cross(axis, refDir);
  let ang = atan2(dot(q, b2), dot(q, refDir));
  return fract(ang / 6.28318 * dashes) <= 0.5;           // dash gate
}
fn overlayReticle(ro: vec3f, rd: vec3f, col0: vec3f) -> vec3f {
  if (P.drag.z < 0.5) { return col0; }                   // showTarget off
  let selI = i32(floor(P.show.z + 0.5));
  if (selI < 0) { return col0; }                         // nothing expanded -> no reticle
  if (any(col0 > vec3f(1.0))) { return col0; }   // preserve HDR gizmo pixels for the bloom bright-pass
  var tgt = P.targetA.xyz;
  if (selI == 1) { tgt = P.targetB.xyz; }
  if (selI == 2) { tgt = P.targetC.xyz; }
  let ex = vec3f(1.0, 0.0, 0.0); let ey = vec3f(0.0, 1.0, 0.0); let ez = vec3f(0.0, 0.0, 1.0);
  let rr = 0.17 * P.bound.y; let tube = 0.018 * P.bound.y; let nd = 10.0;
  var hit = false;
  hit = hit || ringMark(ro, rd, tgt, ex, ey, rr, tube, nd);
  hit = hit || ringMark(ro, rd, tgt, ey, ez, rr, tube, nd);
  hit = hit || ringMark(ro, rd, tgt, ez, ex, rr, tube, nd);
  if (hit) { return mix(col0, vec3f(1.0, 0.82, 0.28), 0.95); }  // dashed target marker, always on top
  return col0;
}

fn bgGrid(ro: vec3f, rd: vec3f, uv: vec2f) -> vec3f {
  let g = 0.04 + 0.03 * uv.y;
  var col = vec3f(g, g + 0.005, g + 0.012);
  if (rd.y < -1e-3) {
    let tf = (-P.bound.y - ro.y) / rd.y;                       // floor at y = -bound.y
    if (tf > 0.0) {
      let q = ro + rd * tf;
      let spacing = 0.5 * P.bound.y;
      let gx = abs(fract(q.x / spacing + 0.5) - 0.5) * spacing;
      let gz = abs(fract(q.z / spacing + 0.5) - 0.5) * spacing;
      let lineW = 0.02 * spacing * (1.0 + tf * 0.2);
      let line = 1.0 - smoothstep(0.0, lineW, min(gx, gz));
      let fade = (1.0 / (1.0 + tf * 0.06)) * clamp(-rd.y * 3.0, 0.0, 1.0);
      col = mix(col, vec3f(0.32, 0.46, 0.54), line * fade * 0.5);
    }
  }
  return col;
}

fn render(uv: vec2f) -> vec3f {
  let aspect = P.resolution.x / max(P.resolution.y, 1.0);
  let xy = (uv * 2.0 - vec2f(1.0)) * vec2f(aspect, 1.0);
  let rd = normalize(P.camRight.xyz * xy.x + P.camUp.xyz * xy.y + P.camFwd.xyz * P.focal);
  let ro = P.camPos.xyz;
  let noiseActive = max(max(P.param3A.x, P.param3A.y), max(P.param3B.x, P.param3B.y)) > 1e-4;
  let marchFloor = select(0.0, 0.004, noiseActive);
  var t = 0.0; var hitM = -1.0;
  let mbudget = select(200, 128, P.anim.z > 0.5);   // perf mode (anim.z) trims the main raymarch budget
  for (var i = 0; i < mbudget; i = i + 1) {
    let p = ro + rd * t;
    let s = sceneSDF(p);
    if (s.x < 0.002) { hitM = s.y; break; }
    t = t + select(s.x, max(s.x, marchFloor), noiseActive) * fwdStepK() * bendStepK();
    if (t > 60.0) { break; }
  }
  var col: vec3f;
  var tHit: f32;
  if (hitM < 0.0) {
    col = bgGrid(ro, rd, uv);
    tHit = 60.0;
  } else {
    let p = ro + rd * t;
    tHit = t;
    if ((hitM > 2.5 && hitM < 4.5) || (hitM > 5.5 && hitM < 6.5)) {
      var wi = 0; if (hitM > 3.5) { wi = 1; } if (hitM > 5.5) { wi = 2; }   // mat 3->A, 4->B, 6->C
      var dd = P.dA.xyz; var uu = P.uA.xyz; var vv = P.vA.xyz; var sc = P.paramA.x; var st = P.paramA.z;
      var tint = vec3f(0.30, 0.55, 1.00); var lt = P.param2A.x; var ld = P.param2A.y; var tg = P.targetA.xyz; var opac = P.param3A.w; var cosTheta = P.param2A.z; var cm = P.coneMode.x;
      if (wi == 1) { dd = P.dB.xyz; uu = P.uB.xyz; vv = P.vB.xyz; sc = P.paramB.x; st = P.paramB.z; tint = vec3f(1.0, 0.32, 0.48); lt = P.param2B.x; ld = P.param2B.y; tg = P.targetB.xyz; opac = P.param3B.w; cosTheta = P.param2B.z; cm = P.coneMode.y; }
      if (wi == 2) { dd = P.dC.xyz; uu = P.uC.xyz; vv = P.vC.xyz; sc = P.paramC.x; st = P.paramC.z; tint = vec3f(0.45, 0.95, 0.55); lt = P.param2C.x; ld = P.param2C.y; tg = P.targetC.xyz; opac = P.param3C.w; cosTheta = P.param2C.z; cm = P.coneMode.z; }
      let dens = max(opac, 0.0) * 40.0;
      var sh: f32;
      if (lt > 0.5) { let L = tg + dd * ld; sh = shadowRay(p, normalize(L - p), length(L - p) - 0.02, dens); }
      else { sh = shadowRay(p, dd, 2.0 * P.bound.y + 4.5, dens); }
      var within = 1.0;
      var litFactor = 1.0;
      // Soft penumbra: a hard select() put a 1.0 -> 0.12 brightness cliff at the cone edge, which
      // swept across the wall as the light was re-aimed or the spot angle changed. smoothstep over a
      // narrow band keeps the pool edge crisp but continuous under all light motion.
      if (lt > 0.5) { let L = tg + dd * ld; let cosFrag = dot(normalize(p - L), -dd); within = smoothstep(cosTheta - 0.015, cosTheta + 0.015, cosFrag); litFactor = mix(0.12, 1.0, within); }
      if (cm > 0.5 && lt > 0.5) {
        let wcol = tint * (0.05 + 0.90 * within * (1.0 - sh));   // fixed-angle spotlight: pure ray-traced occlusion, no outline, no dim floor presumption
        col = pow(clamp(wcol, vec3f(0.0), vec3f(1.0)), vec3f(0.4545));
      } else {
        let x2 = dot(p, uu) / max(sc, 0.05);
        let y2 = dot(p, vv) / max(sc, 0.05);
        let wallSt = select(st, 0.0, st >= 2.5);
        let tgt = shape2D(vec2f(x2, y2), wallSt);
        var wcol = tint * 0.22 * litFactor;
        wcol = wcol * (1.0 - 0.72 * sh);
        if (abs(tgt) < 0.05 && litFactor > 0.5) { wcol = mix(wcol, tint * 0.95, 0.85); }
        col = pow(clamp(wcol, vec3f(0.0), vec3f(1.0)), vec3f(0.4545));
      }
    } else {
      let n = normalScene(p);
      let base = matColor(hitM);
      let isGizmo = hitM > 0.5;
      if (isGizmo) {
        // Self-illuminated: emit the base hue itself. No white rim, no pre-overdrive clamp -- a
        // gentle normal term gives 3D form and a uniform HDR overdrive (>1) preserves the hue, so
        // the bright-pass bloom is the arrow's OWN color instead of a washed-out white.
        let ndl = max(dot(n, normalize(vec3f(0.5, 0.8, 0.4))), 0.0);
        var emis = base * (0.82 + 0.20 * ndl);
        if (abs(hitM - P.drag.w) < 0.5) { emis = emis * 1.4; }   // dragged handle: hotter, same hue
        let od = select(3.0, 1.0, abs(hitM - 18.0) < 0.5);   // orbit wires dim; active ring (mat 19) keeps full drive
        col = emis * od;
      } else {
        let c = iridMaterial(p, n, rd, base, 0.25, 24.0);                   // sculpture keeps the iridescent material (<=1)
        col = pow(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(0.4545));
      }
    }
  }
  col = overlayOrbitShell(ro, rd, col, tHit);
  col = overlayCones(ro, rd, col, tHit);
  col = overlayRayGrid(ro, rd, col, tHit);
  col = overlayDragPlane(ro, rd, col, tHit);
  col = overlayGizmoFills(ro, rd, col, tHit);
  col = overlayReticle(ro, rd, col);
  return col;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(frame);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let uv = (vec2f(f32(id.x), f32(id.y)) + vec2f(0.5)) / P.resolution;
  let col = render(uv);
  textureStore(frame, vec2i(i32(id.x), i32(id.y)), vec4f(col, 1.0));
}
`,St=`
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> P2: vec4f;   // (ssaa, _, _, _)
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var pts = array<vec2f,3>(vec2f(-1.0,-3.0), vec2f(3.0,1.0), vec2f(-1.0,1.0));
  var o: VOut; o.pos = vec4f(pts[i], 0.0, 1.0); o.uv = pts[i] * 0.5 + vec2f(0.5); return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  // SSAA box-resolve: average the ss x ss scene-texel footprint. A single bilinear textureSample
  // only blends the 4 nearest texels, discarding most of the supersampling (the real aliasing cause).
  let foot = P2.x;                                  // footprint width in scene texels (= ss, may be fractional)
  let n = max(1, i32(round(foot)));
  let texel = 1.0 / vec2f(textureDimensions(tex));
  var acc = vec3f(0.0);
  for (var j = 0; j < n; j = j + 1) {
    for (var i = 0; i < n; i = i + 1) {
      let frac = (vec2f(f32(i), f32(j)) + vec2f(0.5)) / f32(n) - vec2f(0.5);   // evenly across [-0.5,0.5]
      acc = acc + textureSample(tex, samp, in.uv + frac * foot * texel).rgb;
    }
  }
  let scene = acc / f32(n * n);
  // Bloom chain = bright + 2 blur iterations = 3 fullscreen passes (odd). Each fullscreen pass
  // mirrors clip-space-y (up) against texture-v (down), so after an odd pass count the bloom
  // texture is stored vertically mirrored relative to the (upright) scene texture. Sample it at
  // mirrored v so the halo re-aligns with the scene. (If the blur-iteration count ever changes
  // parity, revisit this flip.)
  let bloom = textureSample(bloomTex, samp, vec2f(in.uv.x, 1.0 - in.uv.y)).rgb;
  let strength = 0.9;
  return vec4f(clamp(scene + bloom * strength, vec3f(0.0), vec3f(1.0)), 1.0);
}
`,At=`
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var pts = array<vec2f,3>(vec2f(-1.0,-3.0), vec2f(3.0,1.0), vec2f(-1.0,1.0));
  var o: VOut; o.pos = vec4f(pts[i], 0.0, 1.0); o.uv = pts[i] * 0.5 + vec2f(0.5); return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let c = textureSample(tex, samp, in.uv).rgb;
  return vec4f(max(c - vec3f(1.0), vec3f(0.0)), 1.0);   // keep only >1 (the overdriven gizmo) -> bloom source
}
`,Bt=`
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var pts = array<vec2f,3>(vec2f(-1.0,-3.0), vec2f(3.0,1.0), vec2f(-1.0,1.0));
  var o: VOut; o.pos = vec4f(pts[i], 0.0, 1.0); o.uv = pts[i] * 0.5 + vec2f(0.5); return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(tex));
  let spread = 2.6;
  var acc = vec3f(0.0); var wsum = 0.0;
  for (var dy = -2; dy <= 2; dy = dy + 1) {
    for (var dx = -2; dx <= 2; dx = dx + 1) {
      let w = exp(-f32(dx * dx + dy * dy) / 4.0);       // 5x5 gaussian
      acc = acc + textureSample(tex, samp, in.uv + vec2f(f32(dx), f32(dy)) * texel * spread).rgb * w;
      wsum = wsum + w;
    }
  }
  return vec4f(acc / wsum, 1.0);
}
`,fe=document.querySelector("#cc"),Xe=document.querySelector("#status"),D={yaw:.7,pitch:.5,dist:9},a=[{shape:0,az:0,el:0,scale:1.4,roll:0,wallDist:2,showWall:!0,clipSolid:!1,type:0,lightDist:3,spot:.6,target:[0,0,0],fixTarget:!0,fixDist:!1,warp:0,grain:0,nscale:2,opacity:1,enabled:!0,armScale:1,coneFixedAngle:!1,wallSize:1,bendType:0,bendAmount:.5,bendFreq:1.5},{shape:1,az:Math.PI/2,el:0,scale:1.4,roll:0,wallDist:2,showWall:!0,clipSolid:!1,type:0,lightDist:3,spot:.6,target:[0,0,0],fixTarget:!0,fixDist:!1,warp:0,grain:0,nscale:2,opacity:1,enabled:!0,armScale:1,coneFixedAngle:!1,wallSize:1,bendType:0,bendAmount:.5,bendFreq:1.5},{shape:2,az:-Math.PI/2,el:0,scale:1.4,roll:0,wallDist:2,showWall:!0,clipSolid:!1,type:0,lightDist:3,spot:.6,target:[0,0,0],fixTarget:!0,fixDist:!1,warp:0,grain:0,nscale:2,opacity:1,enabled:!1,armScale:1,coneFixedAngle:!1,wallSize:1,bendType:0,bendAmount:.5,bendFreq:1.5}],R=256;function dt(e,t){const l=new Float64Array(t),s=new Int32Array(t),r=new Float64Array(t+1);let o=0;s[0]=0,r[0]=-1e20,r[1]=1e20;for(let n=1;n<t;n++){let d=(e[n]+n*n-(e[s[o]]+s[o]*s[o]))/(2*n-2*s[o]);for(;d<=r[o];)o--,d=(e[n]+n*n-(e[s[o]]+s[o]*s[o]))/(2*n-2*s[o]);o++,s[o]=n,r[o]=d,r[o+1]=1e20}o=0;for(let n=0;n<t;n++){for(;r[o+1]<n;)o++;l[n]=(n-s[o])*(n-s[o])+e[s[o]]}return l}function ft(e,t,l){const s=new Float64Array(Math.max(t,l));for(let r=0;r<l;r++){for(let n=0;n<t;n++)s[n]=e[r*t+n];const o=dt(s,t);for(let n=0;n<t;n++)e[r*t+n]=o[n]}for(let r=0;r<t;r++){for(let n=0;n<l;n++)s[n]=e[n*t+r];const o=dt(s,l);for(let n=0;n<l;n++)e[n*t+r]=o[n]}}function Ve(e){const t=R,l=new Float64Array(t*t),s=new Float64Array(t*t);for(let n=0;n<t*t;n++)l[n]=e[n]?0:1e20,s[n]=e[n]?1e20:0;ft(l,t,t),ft(s,t,t);const r=new Float32Array(t*t),o=2/t;for(let n=0;n<t*t;n++)r[n]=(e[n]?-Math.sqrt(s[n]):Math.sqrt(l[n]))*o;return r}a.forEach(e=>{e.mask=new Uint8Array(R*R)});a.forEach(e=>{e.frac=[0,0,0,0]});let Ce=-1,Ye=!0,Ge=!1,Ae=!1,Le=!1,ne=!0,_e=null,rt=0,ut=0,Me=0,Fe=!1,Ke=!1,gt=0;function Oe(){!Me&&!Fe&&!document.hidden&&!Ke&&(Me=requestAnimationFrame(_t))}document.addEventListener("visibilitychange",()=>{document.hidden?(cancelAnimationFrame(Me),Me=0):(M.last=performance.now(),ne=!0,f&&Oe())});window.addEventListener("message",e=>{var t;e.source!==parent||e.origin!==location.origin||((t=e.data)==null?void 0:t.type)!=="portfolio-lab-visibility"||(Ke=e.data.visible===!1,Ke?(cancelAnimationFrame(Me),Me=0):(M.last=performance.now(),ne=!0,f&&Oe()))});let Ee=!1,je=0,Ie={mode:0,axis:0};const te={type:0,size:2.2},M={playing:!0,speed:1,time:0,last:0};let Z=0,We=1;const b={iters:8,seed:1,objScale:1.4,a:[.92,.92,.92,2],b:[.4,.4,.12,0]},Ct=["Inverse","Composite","Mandelbulb","Menger","Metaballs"],Mt=["none","wave","swirl","lens","pinch+twist"],Dt=[null,{iterLabel:"object count",iter:[1,24,1],seed:!0,sliders:[{lbl:"spread",slot:"a0",min:.2,max:2,step:.01},{lbl:"size variance",slot:"a1",min:0,max:.9,step:.01},{lbl:"blend",slot:"a2",min:.01,max:.6,step:.01},{lbl:"rotation",slot:"a3",min:0,max:1,step:.01}]},{iterLabel:"iterations",iter:[1,16,1],sliders:[{lbl:"power",slot:"a0",min:2,max:12,step:.1}]},{iterLabel:"iterations",iter:[1,8,1],sliders:[{lbl:"phase shift",slot:"a0",min:0,max:.5,step:.005}]},{iterLabel:"ball count",iter:[1,24,1],seed:!0,sliders:[{lbl:"radius",slot:"a0",min:.05,max:.6,step:.01},{lbl:"spread",slot:"a1",min:.2,max:1.8,step:.01},{lbl:"blend",slot:"a2",min:.02,max:.6,step:.01}]}],Tt=[null,{iters:12,seed:3,objScale:1.6,a:[1.1,.5,.2,.5],b:[0,0,0,0]},{iters:8,objScale:1.3,a:[8,0,0,0],b:[0,0,0,0]},{iters:4,objScale:1,a:[0,0,0,0],b:[0,0,0,0]},{iters:10,seed:5,objScale:1.5,a:[.28,1,.25,0],b:[0,0,0,0]}];function Ft(e){const t=Tt[e];t&&(b.iters=t.iters,b.objScale=t.objScale,t.seed!==void 0&&(b.seed=t.seed),b.a=t.a.slice(),b.b=t.b.slice())}function ht(){const e=Z>0;document.querySelectorAll(".target-only").forEach(l=>{l.style.display=e?"none":""});const t=document.getElementById("gen-panel");t&&(t.style.display=e?"":"none")}function nt(e){Z=Math.max(0,Math.min(4,e|0)),Z>0&&(We=Z),Ft(Z),window.__rebuildGenPanel&&window.__rebuildGenPanel(),ht()}function qe(e){const t=Q([Math.cos(e.el)*Math.sin(e.az),Math.sin(e.el),Math.cos(e.el)*Math.cos(e.az)]);let l=[0,1,0];Math.abs(t[0]*l[0]+t[1]*l[1]+t[2]*l[2])>.99&&(l=[1,0,0]);const s=t[0]*l[0]+t[1]*l[1]+t[2]*l[2],r=Q([l[0]-s*t[0],l[1]-s*t[1],l[2]-s*t[2]]),o=Ue(t,r),n=Math.cos(e.roll),d=Math.sin(e.roll),m=[o[0]*n+r[0]*d,o[1]*n+r[1]*d,o[2]*n+r[2]*d],P=[-o[0]*d+r[0]*n,-o[1]*d+r[1]*n,-o[2]*d+r[2]*n];return{d:t,u:m,v:P}}function Be(e){Ce=e,document.querySelectorAll(".light-grp").forEach(t=>{const l=Number(t.dataset.lightIdx);t.classList.toggle("active",l===e),t.style.display=l===e?"":"none"})}const kt={4:[{lbl:"c-x",k:0,min:-1,max:1,step:.005},{lbl:"c-y",k:1,min:-1,max:1,step:.005},{lbl:"orbit",k:2,min:0,max:.5,step:.005},{lbl:"iterations",k:3,min:6,max:24,step:1}],5:[{lbl:"fold angle",k:0,min:-3.14,max:3.14,step:.01},{lbl:"sway",k:1,min:0,max:1.5,step:.01},{lbl:"offset",k:2,min:0,max:1.5,step:.01},{lbl:"iterations",k:3,min:1,max:10,step:1}],6:[{lbl:"c-x",k:0,min:-1,max:1,step:.005},{lbl:"c-y",k:1,min:-1,max:1,step:.005},{lbl:"orbit",k:2,min:0,max:.4,step:.005},{lbl:"iterations",k:3,min:6,max:24,step:1}],7:[{lbl:"root spin",k:0,min:-3.14,max:3.14,step:.01},{lbl:"relax",k:1,min:.3,max:1.5,step:.01},{lbl:"iterations",k:2,min:4,max:40,step:1}],8:[{lbl:"c-x",k:0,min:-1,max:1,step:.005},{lbl:"c-y",k:1,min:-1,max:1,step:.005},{lbl:"p (memory)",k:2,min:-1,max:1,step:.005},{lbl:"iterations",k:3,min:6,max:30,step:1}],9:[{lbl:"c-x",k:0,min:-1,max:1,step:.005},{lbl:"c-y",k:1,min:-1,max:1,step:.005},{lbl:"orbit",k:2,min:0,max:.4,step:.005},{lbl:"iterations",k:3,min:6,max:24,step:1}]},pt={4:[-.4,.6,.15,16],5:[.4,.15,.4,4],6:[-.5,-.55,.12,20],7:[0,1,16,0],8:[.46,0,-.5,20],9:[-.55,0,.06,24]};function Et(){const e=document.querySelector("#controls"),t=["circle","square","triangle","custom","julia","fold","ship","newton","phoenix","tricorn"],l=(i,u,g,F,B,k)=>{const w=document.createElement("div");w.className="control-block";const G=document.createElement("div");G.className="ctl-head";const J=document.createElement("span");J.className="lbl",J.textContent=i;const $=document.createElement("span");$.className="val",$.textContent=Number(u()).toFixed(2),G.append(J,$);const z=document.createElement("input");return z.type="range",z.min=F,z.max=B,z.step=k,z.value=u(),z.addEventListener("input",()=>{const ce=Number(z.value);g(ce),$.textContent=ce.toFixed(2)}),w.append(G,z),w._input=z,w._val=$,w},s=(i,u,g,F,B)=>{const k=document.createElement("div");k.className="control-block";const w=document.createElement("span");w.className="lbl",w.textContent=i,k.append(w);const G=document.createElement("div");return G.className="segmented",u.forEach((J,$)=>{const z=document.createElement("button");z.type="button",z.textContent=J,z.dataset.seg=B,z.dataset.val=String($),$===g()&&z.classList.add("active"),z.addEventListener("click",()=>{F($),G.querySelectorAll("button").forEach(ce=>ce.classList.remove("active")),z.classList.add("active")}),G.append(z)}),k.append(G),k};{const i=document.createElement("label");i.className="toggle-row";const u=document.createElement("span");u.className="lbl",u.textContent="enable 3rd light (C)";const g=document.createElement("input");g.type="checkbox",g.className="toggle",g.checked=a[2].enabled,g.dataset.toggle="enable-c",g.addEventListener("change",()=>{a[2].enabled=g.checked,!g.checked&&Ce===2&&Be(-1)}),i.append(u,g),e.append(i)}let r=null;const o=s("mode",["fixed shadows","fixed shape"],()=>Z>0?1:0,i=>{nt(i===0?0:We),r&&(r.value=String(We))},"cat");e.append(o);const n=document.createElement("div");n.className="grp",n.id="gen-panel",n.style.display="none";{const i=document.createElement("h2");i.textContent="Generator",n.append(i)}r=document.createElement("select"),r.dataset.genPick="1",Object.assign(r.style,{width:"100%",margin:"2px 0 6px"}),Ct.forEach((i,u)=>{if(u>=1){const g=document.createElement("option");g.value=String(u),g.textContent=i,r.append(g)}}),r.value=String(Z>0?Z:We),r.addEventListener("change",()=>{nt(Number(r.value))}),n.append(r);const d=document.createElement("div");n.append(d),e.append(n),window.__rebuildGenPanel=()=>{const i=Dt[Z];d.innerHTML="",i&&(d.append(l(i.iterLabel,()=>b.iters,u=>b.iters=Math.round(u),i.iter[0],i.iter[1],i.iter[2])),d.append(l("object scale",()=>b.objScale,u=>b.objScale=u,.4,3,.01)),i.seed&&d.append(l("seed",()=>b.seed,u=>b.seed=Math.round(u),1,64,1)),i.sliders.forEach(u=>{const g=u.slot.match(/^([ab])([0-3])$/);if(!g)throw new Error("bad gen slot: "+u.slot);const F=g[1]==="a"?b.a:b.b,B=Number(g[2]);d.append(l(u.lbl,()=>F[B],k=>F[B]=k,u.min,u.max,u.step))}))},a.forEach((i,u)=>{const g=document.createElement("div");g.className="grp light-grp",g.dataset.lightIdx=String(u),g.addEventListener("mousedown",()=>Be(u));const F=document.createElement("h2");F.textContent="Light "+(u===0?"A":u===1?"B":"C"),g.append(F);const B=document.createElement("div");B.className="frac-body target-only";const k=()=>{B.innerHTML="";const x=kt[i.shape];x&&x.forEach(C=>{B.append(l(C.lbl,()=>i.frac[C.k],E=>i.frac[C.k]=C.step>=1?Math.round(E):E,C.min,C.max,C.step))})};{const x=document.createElement("div");x.className="control-block target-only";const C=document.createElement("span");C.className="lbl",C.textContent="shape",x.append(C);const E=document.createElement("select");E.dataset.shapeSelect=String(u),Object.assign(E.style,{width:"100%",marginTop:"4px"}),t.forEach((K,he)=>{const U=document.createElement("option");U.value=String(he),U.textContent=K,E.append(U)}),E.value=String(i.shape),E.addEventListener("change",()=>{const K=Number(E.value);i.shape=K,K===3&&window.__openDesigner(u),K>=4&&pt[K]&&(i.frac=pt[K].slice()),k()}),x.append(E),g.append(x)}g.append(B),k(),i._els={},i._vals={};const w=(x,C,E,K,he)=>{const U=l(C,()=>i[x],de=>i[x]=de,E,K,he);return U._input.dataset.slider=x,i._els[x]=U._input,i._vals[x]=U._val,g.append(U),U};w("az","azimuth",-Math.PI,Math.PI,.01),w("el","elevation",-1.5,1.5,.01),w("scale","scale",.4,3,.01).classList.add("target-only"),w("roll","roll",-Math.PI,Math.PI,.01),w("wallDist","wall dist",.3,4,.01);const G=w("lightDist","light dist",1,50,.01),J=w("spot","spotlight",.2,1.5,.01),$=w("wallSize","wall size",1,3,.01);let z=null;const ce=()=>{const x=i.type===1;G.style.display=x?"":"none",J.style.display=x?"":"none",z&&(z.style.display=x?"":"none"),$.style.display=x&&i.coneFixedAngle?"":"none"};ce();const bt=s("type",["planar","point"],()=>i.type,x=>{i.type=x,ce()},"type");g.insertBefore(bt,g.children[1]);const Re=(x,C,E,K)=>{const he=document.createElement("label");he.className="toggle-row";const U=document.createElement("span");U.className="lbl",U.textContent=x;const de=document.createElement("input");if(de.type="checkbox",de.className="toggle",de.checked=C(),K)for(const[yt,Pt]of Object.entries(K))de.dataset[yt]=Pt;return de.addEventListener("change",()=>E(de.checked)),he.append(U,de),g.append(he),he};Re("show wall",()=>i.showWall,x=>i.showWall=x),Re("clip solid",()=>i.clipSolid,x=>i.clipSolid=x).classList.add("target-only"),Re("fix target",()=>i.fixTarget,x=>i.fixTarget=x,{toggle:"fix-target",idx:String(u)}),Re("fix dist to target",()=>i.fixDist,x=>i.fixDist=x,{toggle:"fix-dist",idx:String(u)}),z=Re("fixed cone angle",()=>i.coneFixedAngle,x=>{i.coneFixedAngle=x,ce()},{toggle:"cone-fixed",idx:String(u)}),ce();const Se=document.createElement("select");Se.dataset.bendSelect=String(u),Object.assign(Se.style,{width:"100%",margin:"2px 0"}),Mt.forEach((x,C)=>{const E=document.createElement("option");E.value=String(C),E.textContent=x,Se.append(E)}),Se.value=String(i.bendType),Se.addEventListener("change",()=>{i.bendType=Number(Se.value)});{const x=document.createElement("div");x.className="control-block";const C=document.createElement("span");C.className="lbl",C.textContent="bend",x.append(C,Se),g.append(x)}w("bendAmount","bend amount",0,1.2,.01),w("bendFreq","bend freq",.2,4,.01),e.append(g)});let m=0;const P=document.createElement("div");P.id="designer",Object.assign(P.style,{position:"fixed",inset:"0",display:"none",zIndex:"50",background:"rgba(6,10,18,0.82)",backdropFilter:"blur(8px)",alignItems:"center",justifyContent:"center",gap:"24px"});const y=document.createElement("canvas");y.width=R,y.height=R,Object.assign(y.style,{width:"420px",height:"420px",borderRadius:"12px",border:"1px solid rgba(120,160,220,0.5)",cursor:"crosshair",background:"#0a0e16",touchAction:"none"});const q=document.createElement("div");Object.assign(q.style,{display:"flex",flexDirection:"column",gap:"10px",width:"240px"});const X=document.createElement("h2");X.textContent="Pattern Designer",q.append(X);const L=y.getContext("2d");let _=18,pe=!1,S=!1,ae=0;const le=()=>{const i=a[m].mask,u=L.createImageData(R,R);for(let g=0;g<R*R;g++){const F=i[g];u.data[g*4]=F?235:12,u.data[g*4+1]=F?180:18,u.data[g*4+2]=F?120:28,u.data[g*4+3]=255}L.putImageData(u,0,0)},He=()=>{clearTimeout(ae),ae=setTimeout(()=>f.uploadShapeSDF(m,Ve(a[m].mask)),120)},De=i=>{const u=y.getBoundingClientRect(),g=Math.floor((i.clientX-u.left)/u.width*R),F=Math.floor((i.clientY-u.top)/u.height*R),B=a[m].mask;for(let k=-_;k<=_;k++)for(let w=-_;w<=_;w++){if(w*w+k*k>_*_)continue;const G=g+w,J=F+k;G<0||J<0||G>=R||J>=R||(B[J*R+G]=pe?0:1)}le(),He()};y.addEventListener("pointerdown",i=>{S=!0,y.setPointerCapture(i.pointerId),De(i)}),y.addEventListener("pointermove",i=>{S&&De(i)}),y.addEventListener("pointerup",()=>{S=!1}),y.addEventListener("pointercancel",()=>{S=!1});const me=document.createElement("div");Object.assign(me.style,{display:"flex",gap:"8px"});const O=document.createElement("button");O.type="button",O.textContent="brush",O.dataset.tool="brush";const Y=document.createElement("button");Y.type="button",Y.textContent="eraser",Y.dataset.tool="eraser",O.classList.add("active"),O.onclick=()=>{pe=!1,O.classList.add("active"),Y.classList.remove("active")},Y.onclick=()=>{pe=!0,Y.classList.add("active"),O.classList.remove("active")};const xe=document.createElement("button");xe.type="button",xe.textContent="clear",xe.onclick=()=>{a[m].mask.fill(0),le(),He()},me.append(O,Y,xe),q.append(me);const Ze=l("brush size",()=>_,i=>_=Math.round(i),2,48,1),be=l("shape warp",()=>a[m].warp,i=>a[m].warp=i,0,1,.01),c=l("shape grain",()=>a[m].grain,i=>a[m].grain=i,0,1,.01),p=l("noise scale",()=>a[m].nscale,i=>a[m].nscale=i,.5,6,.01),h=l("opacity",()=>a[m].opacity,i=>a[m].opacity=i,.05,1,.01);be._input.dataset.dslider="warp",c._input.dataset.dslider="grain",p._input.dataset.dslider="nscale",h._input.dataset.dslider="opacity",q.append(Ze,be,c,p,h);const A=()=>{const i=a[m];for(const[u,g]of[[be,i.warp],[c,i.grain],[p,i.nscale],[h,i.opacity]])u._input.value=g,u._val.textContent=Number(g).toFixed(2)},v=document.createElement("button");v.type="button",v.id="designer-done",v.textContent="Done",v.onclick=()=>{clearTimeout(ae),f.uploadShapeSDF(m,Ve(a[m].mask)),a[m].shape=3,P.style.display="none"},q.append(v),P.append(y,q),document.body.append(P),window.__openDesigner=i=>{m=i,a[i].shape=3,A(),le(),P.style.display="flex"},document.addEventListener("keydown",i=>{i.key==="Escape"&&P.style.display!=="none"&&(clearTimeout(ae),f.uploadShapeSDF(m,Ve(a[m].mask)),P.style.display="none")});const T=document.createElement("div");T.className="grp";const re=document.createElement("h2");re.textContent="Bound",T.append(re),T.append(s("type",["sphere","box"],()=>te.type,i=>te.type=i,"bound")),T.append(l("size",()=>te.size,i=>te.size=i,.8,4,.01)),e.append(T);const H=document.createElement("div");H.className="grp";const ue=document.createElement("h2");ue.textContent="Display",H.append(ue);const ie=document.createElement("label");ie.className="toggle-row";const se=document.createElement("span");se.className="lbl",se.textContent="show target";const j=document.createElement("input");j.type="checkbox",j.className="toggle",j.checked=Ye,j.dataset.toggle="show-target",j.addEventListener("change",()=>{Ye=j.checked}),ie.append(se,j),H.append(ie);const ge=document.createElement("label");ge.className="toggle-row";const oe=document.createElement("span");oe.className="lbl",oe.textContent="show orbit";const ye=document.createElement("input");ye.type="checkbox",ye.className="toggle",ye.checked=Ge,ye.dataset.toggle="show-orbit",ye.addEventListener("change",()=>{Ge=ye.checked}),ge.append(oe,ye),H.append(ge);const Qe=document.createElement("label");Qe.className="toggle-row";const Je=document.createElement("span");Je.className="lbl",Je.textContent="show rays";const Pe=document.createElement("input");Pe.type="checkbox",Pe.className="toggle",Pe.checked=Ae,Pe.dataset.toggle="show-rays";const Ne=document.createElement("label");Ne.className="toggle-row",Ne.style.display=Ae?"":"none";const $e=document.createElement("span");$e.className="lbl",$e.textContent="ray field";const we=document.createElement("input");we.type="checkbox",we.className="toggle",we.checked=Le,we.dataset.toggle="ray-field",we.addEventListener("change",()=>{Le=we.checked}),Pe.addEventListener("change",()=>{Ae=Pe.checked,Ne.style.display=Ae?"":"none"}),Qe.append(Je,Pe),H.append(Qe),Ne.append($e,we),H.append(Ne);const et=document.createElement("label");et.className="toggle-row";const tt=document.createElement("span");tt.className="lbl",tt.textContent="performance";const ze=document.createElement("input");ze.type="checkbox",ze.className="toggle",ze.checked=Ee,ze.dataset.toggle="perf-mode",ze.addEventListener("change",()=>{Ee=ze.checked,f.resize()}),et.append(tt,ze),H.append(et),e.append(H);{const i=document.createElement("div");i.className="grp";const u=document.createElement("h2");u.textContent="Animation",i.append(u);const g=document.createElement("label");g.className="toggle-row";const F=document.createElement("span");F.className="lbl",F.textContent="play";const B=document.createElement("input");B.type="checkbox",B.className="toggle",B.checked=M.playing,B.dataset.toggle="anim-play",B.addEventListener("change",()=>{M.playing=B.checked}),g.append(F,B),i.append(g),i.append(l("speed",()=>M.speed,k=>M.speed=k,0,3,.01)),e.append(i)}Be(Ce),ht()}function ke(){const e=Math.cos(D.pitch),t=Math.sin(D.pitch),l=Math.cos(D.yaw),s=Math.sin(D.yaw),r=[D.dist*e*s,D.dist*t,D.dist*e*l],o=Q([-r[0],-r[1],-r[2]]),n=Math.abs(o[1])>.999?[0,0,1]:[0,1,0],d=Q(Ue(o,n)),m=Ue(d,o);return{pos:r,fwd:o,right:d,up:m}}const Q=e=>{const t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]},Ue=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],N=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],V=(e,t)=>[e[0]+t[0],e[1]+t[1],e[2]+t[2]],I=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],W=(e,t)=>[e[0]*t,e[1]*t,e[2]*t];function at(e,t){const l=fe.getBoundingClientRect(),s=(e-l.left)/l.width,r=(t-l.top)/l.height,o=f.w/Math.max(f.h,1),n=(s*2-1)*o,d=-(r*2-1),{pos:m,fwd:P,right:y,up:q}=ke(),X=1/Math.tan(55*Math.PI/360),L=Q([y[0]*n+q[0]*d+P[0]*X,y[1]*n+q[1]*d+P[1]*X,y[2]*n+q[2]*d+P[2]*X]);return{ro:m,rd:L}}function lt(e,t,l,s){const r=N(t,s);if(Math.abs(r)<1e-6)return null;const o=N(I(l,e),s)/r;return o>0?V(e,W(t,o)):null}function qt(e,t,l,s){const r=I(e,l),o=N(t,t),n=N(t,s),d=N(s,s),m=N(t,r),P=N(s,r),y=o*d-n*n;return Math.abs(y)<1e-6?N(r,t)/Math.max(o,1e-6):(n*P-d*m)/y}const ee=[[1,0,0],[0,1,0],[0,0,1]],It=[[0,1],[1,2],[2,0]];function ve(e){const t=a[e],l=qe(t),s=t.type===1?t.lightDist:te.size*1.6*t.armScale;return V(t.target,W(l.d,s))}function it(e){const t=ve(e),l=te.size,s=.46*l,r=.16*l,o=[];for(let d=0;d<3;d++)o.push({mode:"axis",axis:d,pos:V(t,W(ee[d],s*.55)),H:t});for(let d=0;d<3;d++){const[m,P]=It[d],y=V(t,V(W(ee[m],r),W(ee[P],r)));o.push({mode:"plane",plane:d,axisA:m,axisB:P,pos:y,H:t})}const n=Math.hypot(...I(t,a[e].target));for(let d=0;d<3;d++){const m=ee[(d+1)%3];o.push({mode:"orbit",axis:d,pos:V(a[e].target,W(m,n)),H:t})}return o}function ct(e){let t=null,l=1e9;const s=r=>{const o=I(r.pos,e.ro),n=N(o,e.rd);if(n<=0)return;const d=Math.hypot(...Ue(o,e.rd));d<.07*n&&d<l&&(l=d,t=r)};for(let r=0;r<a.length;r++)if(a[r].enabled&&(s({i:r,mode:"select",pos:ve(r)}),r===Ce)){for(const o of it(r))o.mode!=="orbit"&&s({i:r,...o});if(Ge){const o=a[r].target,n=Math.hypot(...I(ve(r),o));for(let d=0;d<3;d++){const m=lt(e.ro,e.rd,o,ee[d]);if(!m)continue;const P=N(I(m,e.ro),e.rd),y=Math.abs(Math.hypot(...I(m,o))-n);P>0&&y<.05*te.size&&y<l&&(l=y,t={i:r,mode:"orbit",axis:d,pos:m,H:ve(r)})}}}return t}function Ht(e){return e.mode==="select"?5:e.mode==="axis"?10+e.axis:e.mode==="orbit"?18:[13,16,17][e.plane]}function st(e){const t=ct(e);je=t?Ht(t):0}let f=null;async function Nt(){if(!navigator.gpu){Xe.textContent="WebGPU unavailable";return}const t=await(await navigator.gpu.requestAdapter({powerPreference:"high-performance"})).requestDevice(),l=fe.getContext("webgpu"),s=navigator.gpu.getPreferredCanvasFormat(),r=t.createComputePipeline({layout:"auto",compute:{module:t.createShaderModule({code:zt}),entryPoint:"main"}}),o=t.createShaderModule({code:St}),n=t.createRenderPipeline({layout:"auto",vertex:{module:o,entryPoint:"vs"},fragment:{module:o,entryPoint:"fs",targets:[{format:s}]},primitive:{topology:"triangle-list"}}),d=t.createShaderModule({code:At}),m=t.createRenderPipeline({layout:"auto",vertex:{module:d,entryPoint:"vs"},fragment:{module:d,entryPoint:"fs",targets:[{format:"rgba16float"}]},primitive:{topology:"triangle-list"}}),P=t.createShaderModule({code:Bt}),y=t.createRenderPipeline({layout:"auto",vertex:{module:P,entryPoint:"vs"},fragment:{module:P,entryPoint:"fs",targets:[{format:"rgba16float"}]},primitive:{topology:"triangle-list"}}),q=new Float32Array(168),X=t.createBuffer({size:q.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),L=t.createSampler({magFilter:"linear",minFilter:"linear"}),_=new Float32Array(4),pe=t.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),S=256,ae=new Float32Array(1),le=new Int32Array(ae.buffer),He=c=>{ae[0]=c;const p=le[0];let h=p>>16&32768,A=p>>12&2047;const v=p>>23&255;return v<103?h:v>142?h|31744:v<113?(A|=2048,h|A>>114-v):h|v-112<<10|A>>1},De=()=>t.createTexture({size:[S,S],format:"r16float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),me=De(),O=De(),Y=De(),xe=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"}),Ze=(c,p)=>{const h=new Uint16Array(p.length);for(let v=0;v<p.length;v++)h[v]=He(p[v]);const A=c===0?me:c===1?O:Y;t.queue.writeTexture({texture:A},h,{bytesPerRow:S*2,rowsPerImage:S},{width:S,height:S}),ne=!0};{const c=new Uint16Array(S*S).fill(He(1.5));for(const p of[me,O,Y])t.queue.writeTexture({texture:p},c,{bytesPerRow:S*2,rowsPerImage:S},{width:S,height:S})}f={device:t,ctx:l,format:s,computePipeline:r,presentPipeline:n,brightPipeline:m,blurPipeline:y,uniformData:q,uniformBuffer:X,sampler:L,tex:null,bloomA:null,bloomB:null,computeBG:null,brightBG:null,blurBG:null,blurBG2:null,presentBG:null,w:0,h:0,shapeTexA:me,shapeTexB:O,shapeTexC:Y,shapeSampler:xe,uploadShapeSDF:Ze,SHAPE_TEX:S};const be=()=>{var se,j,ge;const c=Ee?2:4,p=2560,h=Math.min(window.devicePixelRatio||1,1),A=Math.max(1,Math.floor(fe.clientWidth*h)),v=Math.max(1,Math.floor(fe.clientHeight*h));fe.width=A,fe.height=v;const T=Math.min(c,p/A,p/v);_[0]=T,t.queue.writeBuffer(pe,0,_);const re=Math.max(1,Math.floor(A*T)),H=Math.max(1,Math.floor(v*T));f.w=re,f.h=H,l.configure({device:t,format:s,alphaMode:"opaque"}),(se=f.tex)==null||se.destroy(),f.tex=t.createTexture({size:[re,H],format:"rgba16float",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});const ue=Math.max(1,Math.floor(A/2)),ie=Math.max(1,Math.floor(v/2));(j=f.bloomA)==null||j.destroy(),(ge=f.bloomB)==null||ge.destroy(),f.bloomA=t.createTexture({size:[ue,ie],format:"rgba16float",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),f.bloomB=t.createTexture({size:[ue,ie],format:"rgba16float",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),f.texView=f.tex.createView(),f.bloomAView=f.bloomA.createView(),f.bloomBView=f.bloomB.createView(),f.computeBG=t.createBindGroup({layout:r.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:X}},{binding:1,resource:f.texView},{binding:2,resource:me.createView()},{binding:3,resource:O.createView()},{binding:4,resource:xe},{binding:5,resource:Y.createView()}]}),f.brightBG=t.createBindGroup({layout:m.getBindGroupLayout(0),entries:[{binding:0,resource:L},{binding:1,resource:f.texView}]}),f.blurBG=t.createBindGroup({layout:y.getBindGroupLayout(0),entries:[{binding:0,resource:L},{binding:1,resource:f.bloomAView}]}),f.blurBG2=t.createBindGroup({layout:y.getBindGroupLayout(0),entries:[{binding:0,resource:L},{binding:1,resource:f.bloomBView}]}),f.presentBG=t.createBindGroup({layout:n.getBindGroupLayout(0),entries:[{binding:0,resource:L},{binding:1,resource:f.texView},{binding:2,resource:f.bloomAView},{binding:3,resource:{buffer:pe}}]}),ne=!0};window.addEventListener("resize",be),f.resize=be,be(),Gt(),Et(),Xe.textContent="Live",Oe(),new URLSearchParams(location.search).has("creatorTest")&&(window.__creatorTest={setLight(c,p){Object.assign(a[c],p)},setBound(c){Object.assign(te,c)},setCamera(c,p,h){D.yaw=c,D.pitch=p,D.dist=h},getCam(){return{yaw:D.yaw,pitch:D.pitch,dist:D.dist}},orbit(c,p){vt(c,p)},lookDownLight(c){const p=qe(a[c]);D.pitch=Math.asin(Math.max(-1,Math.min(1,-p.d[1]))),D.yaw=Math.atan2(-p.d[0],-p.d[2])},getLight(c){return{...a[c]}},getShowTarget(){return Ye},getShowOrbit(){return Ge},getShowRays(){return Ae},getRayField(){return Le},setRayField(c){Le=!!c},getPerfMode(){return Ee},setPerfMode(c){Ee=!!c,f.resize&&f.resize()},setShowRays(c){Ae=!!c},selectLight(c){Be(c)},getSelected(){return Ce},getHoveredMat(){return je},hoverHandle(c,p){if(p.mode==="select"){const{pos:v}=ke();st({ro:v,rd:Q(I(ve(c),v))});return}Ce=c;const h=it(c).find(v=>v.mode===p.mode&&(p.axis!==void 0?v.axis===p.axis:v.plane===p.plane)),{pos:A}=ke();st({ro:A,rd:Q(I(h.pos,A))})},pickHandleAt(c){const{pos:p}=ke(),h=ct({ro:p,rd:Q(I(ve(c),p))});return h?{i:h.i,mode:h.mode}:null},uploadShapeSDF:(c,p)=>f.uploadShapeSDF(c,p instanceof Float32Array?p:Float32Array.from(p)),getShape:c=>a[c].shape,loadCustomShape:(c,p)=>{const h=R,A=a[c].mask;A.fill(0);for(let v=0;v<h;v++)for(let T=0;T<h;T++){const re=(T+.5)/h*2-1,H=(v+.5)/h*2-1;(p==="disc"?Math.hypot(re,H)<.6:Math.abs(re)<.5&&Math.abs(H)<.5)&&(A[v*h+T]=1)}f.uploadShapeSDF(c,Ve(A)),a[c].shape=3},setMode(c){nt(c)},getMode(){return Z},setGen(c){if(c.iters!==void 0&&(b.iters=Math.round(c.iters)),c.seed!==void 0&&(b.seed=Math.round(c.seed)),c.objScale!==void 0&&(b.objScale=c.objScale),Array.isArray(c.a)){const p=b.a.slice();for(let h=0;h<4;h++)c.a[h]!==void 0&&(p[h]=c.a[h]);b.a=p}if(Array.isArray(c.b)){const p=b.b.slice();for(let h=0;h<4;h++)c.b[h]!==void 0&&(p[h]=c.b[h]);b.b=p}},getGen(){return{mode:Z,iters:b.iters,seed:b.seed,objScale:b.objScale,a:b.a.slice(),b:b.b.slice()}},setTime(c){M.playing=!1,M.time=c},play(){M.playing=!0},pause(){M.playing=!1},getTime(){return M.time},getRenderCount(){return rt},getFrameStats(){return{renderCount:rt,submitCount:ut,gpuBusy:Fe,lastQueueWaitMs:gt,width:f.w,height:f.h}},setAnimSpeed(c){M.speed=c},setFrac(c,p){const h=Array.from(p).slice(0,4);for(;h.length<4;)h.push(0);a[c].frac=h},getFrac(c){return a[c].frac.slice()},setDrag(c,p){Ie={mode:c,axis:p}},gizmoDrag(c,p,h,A){Be(c);const v=it(c).find(oe=>oe.mode===p.mode&&(p.axis!==void 0?oe.axis===p.axis:oe.plane===p.plane)),{pos:T,fwd:re,right:H,up:ue}=ke(),ie=N(I(v.pos,T),re),se=oe=>Q(I(oe,T)),j=xt({...v,i:c});ot(j,{ro:T,rd:se(v.pos)});const ge=V(v.pos,V(W(H,h*ie),W(ue,A*ie)));ot(j,{ro:T,rd:se(ge)}),Ie={mode:0,axis:0}}})}function Rt(){const e=f.uniformData;{const P=performance.now();M.last===0&&(M.last=P);const y=a[0].shape>=4||a[1].shape>=4||a[2].enabled&&a[2].shape>=4;M.playing&&y&&(M.time+=(P-M.last)*.001*M.speed),M.last=P}const{pos:t,fwd:l,right:s,up:r}=ke(),o=1/Math.tan(55*Math.PI/360);e[0]=f.w,e[1]=f.h,e[2]=o,e[3]=0,e[4]=t[0],e[5]=t[1],e[6]=t[2],e[7]=0,e[8]=s[0],e[9]=s[1],e[10]=s[2],e[11]=0,e[12]=r[0],e[13]=r[1],e[14]=r[2],e[15]=0,e[16]=l[0],e[17]=l[1],e[18]=l[2],e[19]=0;const n=qe(a[0]);e[20]=n.d[0],e[21]=n.d[1],e[22]=n.d[2],e[23]=0,e[24]=n.u[0],e[25]=n.u[1],e[26]=n.u[2],e[27]=0,e[28]=n.v[0],e[29]=n.v[1],e[30]=n.v[2],e[31]=0,e[32]=a[0].scale,e[33]=a[0].wallDist,e[34]=a[0].shape,e[35]=a[0].clipSolid?1:0;const d=qe(a[1]);e[36]=d.d[0],e[37]=d.d[1],e[38]=d.d[2],e[39]=0,e[40]=d.u[0],e[41]=d.u[1],e[42]=d.u[2],e[43]=0,e[44]=d.v[0],e[45]=d.v[1],e[46]=d.v[2],e[47]=0,e[48]=a[1].scale,e[49]=a[1].wallDist,e[50]=a[1].shape,e[51]=a[1].clipSolid?1:0,e[52]=te.type,e[53]=te.size,e[54]=0,e[55]=0,e[56]=a[0].showWall?1:0,e[57]=a[1].showWall?1:0,e[58]=Ce,e[59]=Ge?1:0,e[60]=a[0].type,e[61]=a[0].lightDist,e[62]=Math.cos(a[0].spot),e[63]=a[0].armScale,e[64]=a[1].type,e[65]=a[1].lightDist,e[66]=Math.cos(a[1].spot),e[67]=a[1].armScale,e[68]=a[0].target[0],e[69]=a[0].target[1],e[70]=a[0].target[2],e[71]=0,e[72]=a[1].target[0],e[73]=a[1].target[1],e[74]=a[1].target[2],e[75]=0,e[76]=Ie.mode,e[77]=Ie.axis,e[78]=Ye?1:0,e[79]=je,e[80]=a[0].warp,e[81]=a[0].grain,e[82]=a[0].nscale,e[83]=a[0].opacity,e[84]=a[1].warp,e[85]=a[1].grain,e[86]=a[1].nscale,e[87]=a[1].opacity;const m=qe(a[2]);e[88]=m.d[0],e[89]=m.d[1],e[90]=m.d[2],e[91]=0,e[92]=m.u[0],e[93]=m.u[1],e[94]=m.u[2],e[95]=0,e[96]=m.v[0],e[97]=m.v[1],e[98]=m.v[2],e[99]=0,e[100]=a[2].scale,e[101]=a[2].wallDist,e[102]=a[2].shape,e[103]=a[2].clipSolid?1:0,e[104]=a[2].type,e[105]=a[2].lightDist,e[106]=Math.cos(a[2].spot),e[107]=a[2].armScale,e[108]=a[2].target[0],e[109]=a[2].target[1],e[110]=a[2].target[2],e[111]=0,e[112]=a[2].warp,e[113]=a[2].grain,e[114]=a[2].nscale,e[115]=a[2].opacity,e[116]=a[2].showWall?1:0,e[117]=a[2].enabled?1:0,e[118]=0,e[119]=0,e[120]=Z,e[121]=b.iters,e[122]=b.seed,e[123]=b.objScale,e[124]=b.a[0],e[125]=b.a[1],e[126]=b.a[2],e[127]=b.a[3],e[128]=b.b[0],e[129]=b.b[1],e[130]=b.b[2],e[131]=b.b[3],e[132]=M.time,e[133]=M.speed,e[134]=Ee?1:0,e[135]=0,e[136]=a[0].frac[0],e[137]=a[0].frac[1],e[138]=a[0].frac[2],e[139]=a[0].frac[3],e[140]=a[1].frac[0],e[141]=a[1].frac[1],e[142]=a[1].frac[2],e[143]=a[1].frac[3],e[144]=a[2].frac[0],e[145]=a[2].frac[1],e[146]=a[2].frac[2],e[147]=a[2].frac[3],e[148]=a[0].coneFixedAngle?1:0,e[149]=a[1].coneFixedAngle?1:0,e[150]=a[2].coneFixedAngle?1:0,e[151]=0,e[152]=a[0].wallSize,e[153]=a[1].wallSize,e[154]=a[2].wallSize,e[155]=0,e[156]=a[0].bendType,e[157]=a[0].bendAmount,e[158]=a[0].bendFreq,e[159]=Ae?1:0,e[160]=a[1].bendType,e[161]=a[1].bendAmount,e[162]=a[1].bendFreq,e[163]=Le?1:0,e[164]=a[2].bendType,e[165]=a[2].bendAmount,e[166]=a[2].bendFreq,e[167]=a[0].bendType>0||a[1].bendType>0||a[2].bendType>0?1:0}function _t(){if(Me=0,document.hidden||Ke||Fe)return;Rt();const e=f.uniformData;if((!_e||_e.length!==e.length)&&(_e=new Float32Array(e.length),ne=!0),!ne){for(let r=0;r<e.length;r++)if(e[r]!==_e[r]){ne=!0;break}}if(!ne){Oe();return}const t=f.device.createCommandEncoder();if(ne){ne=!1,_e.set(e),rt+=1,f.device.queue.writeBuffer(f.uniformBuffer,0,e);const r=t.beginComputePass();r.setPipeline(f.computePipeline),r.setBindGroup(0,f.computeBG),r.dispatchWorkgroups(Math.ceil(f.w/8),Math.ceil(f.h/8)),r.end();const o=t.beginRenderPass({colorAttachments:[{view:f.bloomAView,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});o.setPipeline(f.brightPipeline),o.setBindGroup(0,f.brightBG),o.draw(3),o.end();const n=t.beginRenderPass({colorAttachments:[{view:f.bloomBView,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});n.setPipeline(f.blurPipeline),n.setBindGroup(0,f.blurBG),n.draw(3),n.end();const d=t.beginRenderPass({colorAttachments:[{view:f.bloomAView,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});d.setPipeline(f.blurPipeline),d.setBindGroup(0,f.blurBG2),d.draw(3),d.end()}const l=t.beginRenderPass({colorAttachments:[{view:f.ctx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});l.setPipeline(f.presentPipeline),l.setBindGroup(0,f.presentBG),l.draw(3),l.end(),f.device.queue.submit([t.finish()]),ut++,Fe=!0;const s=performance.now();f.device.queue.onSubmittedWorkDone().then(()=>{gt=performance.now()-s,Fe=!1,Oe()},()=>{Fe=!1,Xe.textContent="Device lost"})}let Te=null;function vt(e,t){D.yaw-=e*.005,D.pitch=Math.max(-1.5,Math.min(1.5,D.pitch+t*.005))}function Gt(){let e="none",t=0,l=0;fe.addEventListener("mousedown",s=>{const r=ct(at(s.clientX,s.clientY));r&&r.mode==="select"?(Be(r.i),Te=null,e="none"):r?(Te=xt(r),e="gizmo"):(Be(-1),Te=null,e="orbit",t=s.clientX,l=s.clientY)}),window.addEventListener("mouseup",()=>{e="none",Te=null,Ie={mode:0,axis:0},je=0}),window.addEventListener("mousemove",s=>{e==="orbit"?(vt(s.clientX-t,s.clientY-l),t=s.clientX,l=s.clientY):e==="gizmo"&&Te?ot(Te,at(s.clientX,s.clientY)):st(at(s.clientX,s.clientY))}),fe.addEventListener("mouseleave",()=>{je=0}),fe.addEventListener("wheel",s=>{s.preventDefault(),D.dist=Math.max(2.5,Math.min(30,D.dist*(1+Math.sign(s.deltaY)*.08)))},{passive:!1})}function xt(e,t){const l=a[e.i];return Ie={mode:e.mode==="axis"?1:e.mode==="plane"?2:e.mode==="orbit"?3:0,axis:e.axis??e.plane??0},{i:e.i,mode:e.mode,axis:e.axis,plane:e.plane,axisA:e.axisA,axisB:e.axisB,H0:e.H?e.H.slice():ve(e.i),T0:l.target.slice(),fixTarget:l.fixTarget,arm0:Math.hypot(...I(e.H?e.H:ve(e.i),l.target)),d0:qe(l).d.slice()}}function ot(e,t){if(e.mode==="select")return;const l=a[e.i];if(e.mode==="orbit"){const r=e.axis,o=ee[(r+1)%3],n=ee[(r+2)%3],d=ee[r],m=lt(t.ro,t.rd,e.T0,d);if(!m)return;const P=I(m,e.T0),y=Math.atan2(N(P,n),N(P,o));e.thPrev===void 0&&(e.thPrev=y,e.accum=0);let q=y-e.thPrev;q-=Math.round(q/(2*Math.PI))*(2*Math.PI),e.accum+=q,e.thPrev=y;const X=e.accum,L=N(e.d0,o),_=N(e.d0,n),pe=N(e.d0,d),S=Math.cos(X),ae=Math.sin(X),le=Q(V(V(W(o,L*S-_*ae),W(n,L*ae+_*S)),W(d,pe)));l.az=Math.atan2(le[0],le[2]),l.el=Math.max(-1.5,Math.min(1.5,Math.asin(Math.max(-1,Math.min(1,le[1]))))),mt(e.i);return}let s;if(e.mode==="axis"){const r=ee[e.axis],o=qt(e.H0,r,t.ro,t.rd);e.s0===void 0&&(e.s0=o),s=V(e.H0,W(r,o-e.s0))}else{const r=Ue(ee[e.axisA],ee[e.axisB]),o=lt(t.ro,t.rd,e.H0,r);if(!o)return;e.p0===void 0&&(e.p0=o),s=V(e.H0,I(o,e.p0))}if(e.fixTarget){let r=I(s,e.T0);l.fixDist&&(r=W(Q(r),e.arm0));const o=Q(r);l.az=Math.atan2(o[0],o[2]),l.el=Math.max(-1.5,Math.min(1.5,Math.asin(Math.max(-1,Math.min(1,o[1]))))),l.fixDist||(l.type===1?l.lightDist=Math.max(1,Math.min(8,Math.hypot(...r))):l.armScale=Math.max(.2,Math.min(4,Math.hypot(...r)/(te.size*1.6))))}else l.target=V(e.T0,I(s,e.H0));mt(e.i)}function mt(e){const t=a[e]._els,l=a[e]._vals;if(t)for(const s of["az","el","scale","roll","wallDist","lightDist"])t[s]&&(t[s].value=a[e][s]),l&&l[s]&&(l[s].textContent=Number(a[e][s]).toFixed(2))}Nt().catch(e=>{Xe.textContent="Error: "+e.message,console.error(e)});
