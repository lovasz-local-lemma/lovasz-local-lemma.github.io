import"./mode-switch-KVTmJce4.js";import"./whats-new-BGrxnqJH.js";import{s as _e}from"./sdf2d-CdOQmIPv.js";let d=null;function Ge(e){d=e}function He(){new URLSearchParams(window.location.search).has("cc4dTest")&&(window.__cc4dTest={setAlpha0(e){d&&(d.alpha0=Number(e))},setAxisAmplitudes(e){d&&(d.axisAmps=e.slice(0,5).map(Number))},setPairAmplitudes(e){d&&(d.pairAmps=e.slice(0,10).map(Number))},setDetailTier(e){d&&(d.detailTier=Math.max(0,Math.min(3,Math.round(Number(e)))))},pinTime(e){d&&(d.pinnedTime=Number(e))},pinHidden(e){d&&(d.pinnedHidden=Number(e))},pinCamera(e,t,a){d&&(d.pinnedCamera={position:e.slice(0,3).map(Number),yaw:Number(t),pitch:Number(a)})},setBasisRaw(e){d&&(d.basisOverride=e.map(t=>t.slice(0,5).map(Number)))},setPresetId(e){d&&(d.presetId=Math.max(0,Math.min(13,Math.round(Number(e)))))},pinRich(e){d&&(d.pinnedRich=e===null?null:Math.max(0,Math.min(1,Number(e))))},snapshotState(){return d?{alpha0:d.alpha0,axisAmps:d.axisAmps,pairAmps:d.pairAmps,detailTier:d.detailTier,presetId:d.presetId}:null}})}const Pe=`
fn hash41(p: vec4f) -> f32 {
  var q = fract(p * vec4f(0.1031, 0.1030, 0.0973, 0.1099));
  q = q + dot(q, q.wzxy + vec4f(19.19));
  return fract((q.x + q.y) * (q.z + q.w));
}

fn fieldCoordAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> Coord5 {
  let abcd =
    params.basisX * worldPos.x +
    params.basisY * worldPos.y +
    params.basisZ * worldPos.z +
    params.basisT * flow +
    params.basisW * hiddenVal;
  let e = dot(params.basisE, vec4f(worldPos.x, worldPos.y, worldPos.z, flow)) + params.basisMeta.x * hiddenVal;
  return Coord5(abcd, e);
}

fn fieldCoord(worldPos: vec3f) -> Coord5 {
  return fieldCoordAt(worldPos, params.time, params.hidden);
}

// f_A: Cellular pulses — Dirichlet-kernel-style sum, mean-zero.
// Period exactly L (since each cos(k·ω·x) has period L/k).
fn f_axis_A(a: f32, omega: f32) -> f32 {
  let phase = omega * a;
  return 0.20 * (cos(phase) + cos(2.0 * phase) + cos(3.0 * phase) + cos(4.0 * phase) + cos(5.0 * phase));
}

// f_B: Ridge crests — |sin(ω·b)| − 2/π. Mean-zero (since ⟨|sin|⟩ = 2/π).
fn f_axis_B(b: f32, omega: f32) -> f32 {
  return abs(sin(omega * b)) - 0.6366197723675814;
}

// f_C: Lattice harmonic — geometric harmonic stack, mean-zero.
fn f_axis_C(c: f32, omega: f32) -> f32 {
  let phase = omega * c;
  return cos(phase) + 0.5 * cos(2.0 * phase) + 0.25 * cos(3.0 * phase) + 0.125 * cos(4.0 * phase);
}

// f_D: 1D FBM clouds — phased cosines, ascending frequency, descending amplitude.
fn f_axis_D(d: f32, omega: f32) -> f32 {
  let phase = omega * d;
  return 0.55 * cos(phase + 0.41)
       + 0.32 * cos(2.0 * phase + 1.83)
       + 0.18 * cos(3.0 * phase + 2.97);
}

// f_E: Curl-flow density — phased sines at integer harmonics, mean-zero.
fn f_axis_E(e: f32, omega: f32) -> f32 {
  let phase = omega * e;
  return 0.62 * sin(phase + 0.13)
       + 0.34 * sin(2.0 * phase + 1.27)
       + 0.20 * sin(4.0 * phase + 3.05);
}

// Sum of the 5 per-axis ANOVA terms (without alpha0). Used by ANOVA preset
// and by all hybrid presets.
fn f_anova_raw(a: f32, b: f32, c: f32, d: f32, e: f32, omega: f32) -> f32 {
  return params.axisAmps.x * f_axis_A(a, omega)
       + params.axisAmps.y * f_axis_B(b, omega)
       + params.axisAmps.z * f_axis_C(c, omega)
       + params.axisAmps.w * f_axis_D(d, omega)
       + params.axisAmpsE.x * f_axis_E(e, omega);
}

// Per-pair ANOVA interactions: each term is a product of two zero-mean per-axis
// primitives, so it is zero-mean along EACH of its two axes (the Sobol
// orthogonality property — it adds nothing to the 1-D marginals). Cross-axis
// coupling breaks ANOVA's pure-grid look. Tier-gated for cost: tier 1 adds five
// cheap pairs, tier 2 adds the remaining four analytic pairs. (The DE pair is the
// baked reaction-diffusion term, added at tier 3 in P4.)
fn f_anova_pairs(a: f32, b: f32, c: f32, d: f32, e: f32, omega: f32, tier: i32) -> f32 {
  if (tier < 1) { return 0.0; }
  let fa = f_axis_A(a, omega);
  let fb = f_axis_B(b, omega);
  let fc = f_axis_C(c, omega);
  let fd = f_axis_D(d, omega);
  let fe = f_axis_E(e, omega);
  var pairs = params.pairAmpsAB.x * (fa * fb)   // AB
            + params.pairAmpsAB.y * (fa * fc)   // AC
            + params.pairAmpsAB.z * (fa * fd)   // AD
            + params.pairAmpsAB.w * (fa * fe)   // AE
            + params.pairAmpsBC.x * (fb * fc);  // BC
  if (tier >= 2) {
    pairs = pairs
            + params.pairAmpsBC.y * (fb * fd)   // BD
            + params.pairAmpsBC.z * (fb * fe)   // BE
            + params.pairAmpsBC.w * (fc * fd)   // CD
            + params.pairAmpsCE.x * (fc * fe);  // CE
  }
  if (tier >= 3) {
    // DE pair = baked reaction-diffusion texture, sampled periodically in (d,e).
    let inv2pi = 0.15915494309;
    let uv = fract(vec2f(omega * d, omega * e) * inv2pi);
    let rd = textureSampleLevel(rdTex, rdSampler, uv, 0.0).r; // [0,1], pre-centered
    pairs = pairs + params.pairAmpsCE.y * (rd - 0.5) * 2.0;   // remap to ~[-1,1]
  }
  return pairs;
}

fn sampleAnovaAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;

  let alpha0 = params.axisAmpsE.y;
  let omega  = params.axisAmpsE.w;
  let tier   = i32(params.fieldMeta.x);

  let raw = alpha0 + f_anova_raw(a, b, c, d, e, omega)
          + f_anova_pairs(a, b, c, d, e, omega, tier);
  let density = max(0.0, raw) * params.controls.x;
  let ridge  = clamp(0.5 + 0.5 * (params.axisAmps.y * f_axis_B(b, omega)), 0.0, 1.0);
  let coarse = clamp(0.5 + 0.4 * raw, 0.0, 1.0);
  let fine   = clamp(0.5 + 0.5 * (params.axisAmpsE.x * f_axis_E(e, omega)), 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

fn signal4_legacy(seed: vec4f, detail: f32) -> f32 {
  var p = seed;
  var amp = 0.58;
  var value = 0.0;
  for (var i: i32 = 0; i < 5; i = i + 1) {
    if (f32(i) > detail) { break; }
    let fi = f32(i);
    let phase = fi * 1.713;
    let wave =
      sin(p.x + sin(p.w * 0.73 + phase) + phase) +
      sin(p.y * 1.27 + p.z * 0.62 - p.w * 0.31) +
      cos(dot(p, vec4f(0.41, 0.73, -0.56, 0.37)) + phase) +
      sin(length(p.xyz) * 0.9 + p.w * 0.47 - phase);
    value = value + wave * 0.25 * amp;
    p = p.yzwx * 1.91 + vec4f(1.7, 9.2, 4.3, 2.8) + vec4f(value * 0.21);
    amp = amp * 0.54;
  }
  return value;
}

struct LegacyData {
  scenery: f32,   // raw density-feature sum (pre-max, pre-slider)
  gyroid: f32,    // for ridge derivation
  coarse_n: f32,  // signal4 coarse output
  fine_n: f32,    // signal4 fine output
};

fn f_legacy_data(worldPos: vec3f, flow: f32, hiddenVal: f32) -> LegacyData {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let detail = params.controls.y;
  var p = q.abcd * 0.46;
  let e = q.e * 0.46;

  let pxy = rot2(p.xy, p.w * 0.07 + e * 0.12);
  p = vec4f(pxy.x, pxy.y, p.z, p.w);
  let pxz = rot2(p.xz, sin(e * 0.27) * 0.38 + p.w * 0.024);
  p = vec4f(pxz.x, p.y, pxz.y, p.w);
  let pyz = rot2(p.yz, cos(p.w * 0.21) * 0.24 - e * 0.018);
  p = vec4f(p.x, pyz.x, pyz.y, p.w);

  let coarse = signal4_legacy(p * 0.72 + vec4f(0.0, 0.0, 0.0, e * 0.31), detail);
  let warp = vec3f(
    signal4_legacy(p * 0.78 + vec4f(4.1, 1.7, 8.9, e * 0.33), detail - 0.5),
    signal4_legacy(p * 0.74 + vec4f(7.3, 5.2, 2.1, e * -0.28), detail - 0.5),
    signal4_legacy(p * 0.69 + vec4f(2.8, 9.4, 6.5, e * 0.41), detail - 0.5)
  );
  p = p + vec4f(warp * params.controls.z * 1.32, signal4_legacy(p * 0.52 + vec4f(e), detail - 1.0) * params.controls.z * 0.46);

  let gyroid =
    sin(p.x * 1.86 + coarse * 1.9 + p.w * 0.23 + e * 0.17) * cos(p.y * 1.44 - p.w * 0.29) +
    sin(p.y * 1.67 + p.w * 0.21) * cos(p.z * 1.31 + e * 0.31) +
    sin(p.z * 1.52 - e * 0.27) * cos(p.x * 1.25 + p.w * 0.19);

  let fine = signal4_legacy(p * 1.83 + vec4f(3.0, 6.0, 9.0, e * 0.41), detail);
  let strands = pow(1.0 - smoothstep(0.04, 0.54, abs(gyroid + coarse * 1.15)), 1.45);
  let shells = pow(1.0 - smoothstep(0.02, 0.32, abs(sin(length(p.xyz) * 1.08 + coarse * 1.7 + p.w * 0.2 + e * 0.13))), 2.0);
  let clouds = smoothstep(0.18, 0.86, coarse * 0.52 + fine * 0.24 + 0.5);

  var metaballs = 0.0;
  for (var i: i32 = 0; i < 4; i = i + 1) {
    let fi = f32(i);
    let cc = vec3f(
      sin(p.w * 0.37 + fi * 1.71 + e * 0.13),
      cos(e * 0.29 + fi * 2.27 - p.w * 0.09),
      sin(p.w * 0.43 - fi * 1.13 + e * 0.17)
    ) * vec3f(3.25, 2.35, 3.65);
    let delta = p.xyz - cc;
    metaballs = metaballs + exp(-dot(delta, delta) * (0.38 + 0.04 * sin(fi + e)));
  }

  let scenery = strands * 0.55 + shells * 0.25 + clouds * 0.22 + metaballs * 0.17 - 0.18;
  return LegacyData(scenery, gyroid, coarse, fine);
}

fn sampleLegacyAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let ld = f_legacy_data(worldPos, flow, hiddenVal);
  let density = max(0.0, ld.scenery) * params.controls.x;
  let ridge = clamp(ld.gyroid * 0.22 + 0.5, 0.0, 1.0);
  let localFine = clamp(ld.fine_n * 0.5 + 0.5, 0.0, 1.0);
  return vec4f(density, ridge, clamp(ld.coarse_n * 0.5 + 0.5, 0.0, 1.0), localFine);
}

// Centered 3D scenery term — gyroid with cross-axis warps. Each sin*cos beat
// has zero spatial mean over a period, so this stays mean-zero in the long run
// and doesn't shadow into the per-axis 1D terms.
fn f_triple_ABC(a: f32, b: f32, c: f32, omega: f32) -> f32 {
  let pa = omega * a;
  let pb = omega * b;
  let pc = omega * c;
  // Per-axis warps (mean-zero, periodic) feeding into the next axis's phase.
  let wa = 0.42 * sin(pb * 1.13 + pc * 0.71);
  let wb = 0.42 * sin(pc * 1.07 + pa * 0.83);
  let wc = 0.42 * sin(pa * 1.31 + pb * 0.62);
  let gyroid =
      sin(pa + wa) * cos(pb + wb)
    + sin(pb + wb) * cos(pc + wc)
    + sin(pc + wc) * cos(pa + wa);
  // Add a finer second harmonic to the gyroid for scenery texture.
  let fine =
      sin(2.0 * pa + 1.71) * cos(2.0 * pb - 0.83)
    + sin(2.0 * pb + 0.41) * cos(2.0 * pc + 1.27);
  return 0.32 * gyroid + 0.18 * fine;
}

fn sampleTripleAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;

  let alpha0 = params.axisAmpsE.y;
  let omega  = params.axisAmpsE.w;

  // ANOVA backbone (same as preset 2)
  let anova = alpha0
    + params.axisAmps.x * f_axis_A(a, omega)
    + params.axisAmps.y * f_axis_B(b, omega)
    + params.axisAmps.z * f_axis_C(c, omega)
    + params.axisAmps.w * f_axis_D(d, omega)
    + params.axisAmpsE.x * f_axis_E(e, omega);

  // Layer the 3D triple on top — its amplitude is large enough to give scenery
  // feel but small enough that the per-axis personalities still read.
  let triple = f_triple_ABC(a, b, c, omega);

  let raw = anova + 0.85 * triple;
  let density = max(0.0, raw) * params.controls.x;
  let ridge  = clamp(0.5 + 0.5 * triple, 0.0, 1.0);
  let coarse = clamp(0.5 + 0.4 * raw, 0.0, 1.0);
  let fine   = clamp(0.5 + 0.5 * (params.axisAmpsE.x * f_axis_E(e, omega)), 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// 32-wavelet anisotropic plane-wave sum. K components in {0..5} per axis.
// Bounded periodic. Bumped from 16/{0..2} for more high-frequency detail.
fn f_sculpture(a: f32, b: f32, c: f32, d: f32, e: f32, omega: f32) -> f32 {
  var sum = 0.0;
  for (var k: i32 = 0; k < 32; k = k + 1) {
    let s = f32(k) + 1.0;
    let ka = floor(6.0 * fract(sin(s * 12.9898) * 43758.5453));
    let kb = floor(6.0 * fract(sin(s * 17.231 + 1.7) * 43758.5453));
    let kc = floor(6.0 * fract(sin(s * 21.917 + 3.1) * 43758.5453));
    let kd = floor(6.0 * fract(sin(s *  8.713 + 0.9) * 43758.5453));
    let ke = floor(6.0 * fract(sin(s *  4.317 + 2.3) * 43758.5453));
    let mag = ka + kb + kc + kd + ke;
    if (mag >= 1.0) {
      let phase = 6.2831853 * fract(sin(s * 91.13 + 5.7) * 43758.5453);
      sum = sum + cos(omega * (ka*a + kb*b + kc*c + kd*d + ke*e) + phase);
    }
  }
  return sum * 0.03125; // 1/32
}

fn sampleSculptureAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;

  let alpha0 = params.axisAmpsE.y;
  let omega  = params.axisAmpsE.w;

  let sculpt = f_sculpture(a, b, c, d, e, omega);
  // Radial shells (anisotropic metric) warped by the plane-wave field, so the ray
  // crosses crisp concentric surfaces from any distance instead of averaging a
  // smooth space-filling field to flat. Distinct weights/freq from the Warped preset.
  let radial = sqrt(1.7 * a * a + 0.7 * b * b + 1.3 * c * c + 1.1 * d * d + 0.6 * e * e);
  let shellArg = radial * omega * 6.0 + sculpt * 3.2;
  let shells = pow(1.0 - smoothstep(0.0, 0.40, abs(sin(shellArg))), 2.0);
  let cores = max(0.0, sculpt - 0.40);
  let density = (shells * 1.3 + cores * 0.6) * params.controls.x;
  let ridge  = clamp(0.5 + 0.5 * sculpt, 0.0, 1.0);
  let coarse = clamp(0.5 + 0.5 * shells, 0.0, 1.0);
  let fine   = clamp(shells, 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// Preset 4 (key 5): HybridAdd — Legacy scenery + ANOVA per-axis layered additively.
fn sampleHybridAddAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;
  let alpha0 = params.axisAmpsE.y;
  let omega  = params.axisAmpsE.w;

  let ld = f_legacy_data(worldPos, flow, hiddenVal);
  let anova = f_anova_raw(a, b, c, d, e, omega);

  let raw = alpha0 + 0.6 * anova + 0.7 * ld.scenery;
  let density = max(0.0, raw) * params.controls.x;
  let ridge  = clamp(0.5 + 0.5 * (ld.gyroid * 0.22), 0.0, 1.0);
  let coarse = clamp(0.5 + 0.4 * raw, 0.0, 1.0);
  let fine   = clamp(0.5 + 0.5 * (params.axisAmpsE.x * f_axis_E(e, omega)), 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// Preset 5 (key 6): HybridMod — Legacy density modulated by (1 + scale·anova).
// ANOVA boosts/dims local Legacy density rather than adding/subtracting offset.
fn sampleHybridModAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;
  let omega = params.axisAmpsE.w;

  let ld = f_legacy_data(worldPos, flow, hiddenVal);
  let anova = f_anova_raw(a, b, c, d, e, omega);

  // Modulator centered around 1; clamped so it can't go negative (which would invert the field).
  let modulation = max(0.0, 1.0 + 0.5 * anova);
  let raw = ld.scenery * modulation;
  let density = max(0.0, raw) * params.controls.x;
  let ridge  = clamp(ld.gyroid * 0.22 + 0.5, 0.0, 1.0);
  let coarse = clamp(0.5 + 0.4 * raw, 0.0, 1.0);
  let fine   = clamp(0.5 + 0.5 * (params.axisAmpsE.x * f_axis_E(e, omega)), 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// Preset 6 (key 7): HybridShape — Legacy aesthetic, but signal4 input vector is shaped
// by the per-axis primitives so the noise field "remembers" each axis's personality.
fn sampleHybridShapeAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e_coord = q.e;
  let detail = params.controls.y;
  let alpha0 = params.axisAmpsE.y;
  let omega = params.axisAmpsE.w;

  // Build a 4D vector whose components are per-axis primitives instead of raw coords.
  // Scaled to give signal4 something to sink its teeth into.
  var p = vec4f(
    f_axis_A(a, omega),
    f_axis_B(b, omega),
    f_axis_C(c, omega),
    f_axis_D(d, omega)
  ) * 1.6;
  let e_shaped = f_axis_E(e_coord, omega) * 1.6;

  // Same rotations / signal4 calls / feature accumulation as Legacy, but with the shaped p.
  let pxy = rot2(p.xy, p.w * 0.07 + e_shaped * 0.12);
  p = vec4f(pxy.x, pxy.y, p.z, p.w);
  let pxz = rot2(p.xz, sin(e_shaped * 0.27) * 0.38 + p.w * 0.024);
  p = vec4f(pxz.x, p.y, pxz.y, p.w);

  let coarse_n = signal4_legacy(p * 0.72 + vec4f(0.0, 0.0, 0.0, e_shaped * 0.31), detail);
  let warp = vec3f(
    signal4_legacy(p * 0.78 + vec4f(4.1, 1.7, 8.9, e_shaped * 0.33), detail - 0.5),
    signal4_legacy(p * 0.74 + vec4f(7.3, 5.2, 2.1, e_shaped * -0.28), detail - 0.5),
    signal4_legacy(p * 0.69 + vec4f(2.8, 9.4, 6.5, e_shaped * 0.41), detail - 0.5)
  );
  p = p + vec4f(warp * params.controls.z * 1.32, signal4_legacy(p * 0.52 + vec4f(e_shaped), detail - 1.0) * params.controls.z * 0.46);

  let gyroid =
    sin(p.x * 1.86 + coarse_n * 1.9 + p.w * 0.23 + e_shaped * 0.17) * cos(p.y * 1.44 - p.w * 0.29) +
    sin(p.y * 1.67 + p.w * 0.21) * cos(p.z * 1.31 + e_shaped * 0.31) +
    sin(p.z * 1.52 - e_shaped * 0.27) * cos(p.x * 1.25 + p.w * 0.19);

  let fine_n = signal4_legacy(p * 1.83 + vec4f(3.0, 6.0, 9.0, e_shaped * 0.41), detail);
  let strands = pow(1.0 - smoothstep(0.04, 0.54, abs(gyroid + coarse_n * 1.15)), 1.45);
  let clouds = smoothstep(0.18, 0.86, coarse_n * 0.52 + fine_n * 0.24 + 0.5);

  let scenery = strands * 0.55 + clouds * 0.4 - 0.18 + alpha0 * 0.4;
  let density = max(0.0, scenery) * params.controls.x;
  let ridge  = clamp(gyroid * 0.22 + 0.5, 0.0, 1.0);
  let coarse_out = clamp(0.5 + 0.4 * scenery, 0.0, 1.0);
  let fine_out   = clamp(fine_n * 0.5 + 0.5, 0.0, 1.0);
  return vec4f(density, ridge, coarse_out, fine_out);
}

// Preset 7 (key 8): HybridMul — α₀ + product of Legacy scenery and ANOVA sum.
// Pure multiplicative interference; both must be positive to give density,
// producing sharp "lit" regions where both terms cooperate.
fn sampleHybridMulAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;
  let alpha0 = params.axisAmpsE.y;
  let omega  = params.axisAmpsE.w;

  let ld = f_legacy_data(worldPos, flow, hiddenVal);
  let anova = f_anova_raw(a, b, c, d, e, omega);

  // Both factors recentered around small positive values so the product has nonzero average.
  let factorA = ld.scenery + 0.4;
  let factorB = anova + 0.4;
  let prod = factorA * factorB;
  let sharp = pow(max(0.0, prod - 0.35), 1.4);
  // Radial shells warped by the product so the cooperation structure is visible
  // from any distance, not just a soft diffuse product. Distinct metric/freq.
  let radial = sqrt(0.8 * a * a + 1.6 * b * b + 0.9 * c * c + 1.4 * d * d + 1.1 * e * e);
  let shellArg = radial * omega * 5.5 + prod * 4.0;
  let shells = pow(1.0 - smoothstep(0.0, 0.45, abs(sin(shellArg))), 1.8);
  let density = (shells * 1.0 + sharp * 1.4) * params.controls.x;
  let ridge  = clamp(ld.gyroid * 0.22 + 0.5, 0.0, 1.0);
  let coarse = clamp(0.4 + 0.6 * shells, 0.0, 1.0);
  let fine   = clamp(0.5 + 0.5 * (params.axisAmpsE.x * f_axis_E(e, omega)), 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// 5D analytic shape SDFs.
// p_abcd ∈ R⁴, p_e ∈ R, gives a 5D point.

fn sdfSphere5(p_abcd: vec4f, p_e: f32, r: f32) -> f32 {
  let d2 = dot(p_abcd, p_abcd) + p_e * p_e;
  return sqrt(max(d2, 0.0)) - r;
}

// Anisotropic 5-ellipsoid: per-axis stretches give visibly different cross-sections
// from each canonical XYZ axis assignment.
fn sdfEllipsoid5(p_abcd: vec4f, p_e: f32, scale_abcd: vec4f, scale_e: f32, r: f32) -> f32 {
  let s_abcd = p_abcd / scale_abcd;
  let s_e = p_e / scale_e;
  let d2 = dot(s_abcd, s_abcd) + s_e * s_e;
  return (sqrt(max(d2, 0.0)) - r) * min(min(min(scale_abcd.x, scale_abcd.y), min(scale_abcd.z, scale_abcd.w)), scale_e);
}

// 5-torus: ring in (a, b) plane, cross-section radius r in (c, d, e) directions.
// From an (a, b)-aligned slice it looks like a torus; from (c, d) it looks like
// two parallel disks; from (a, c) it looks like two parallel rings.
fn sdfTorus5(p_abcd: vec4f, p_e: f32, R: f32, r: f32) -> f32 {
  let ringDist = length(p_abcd.xy) - R;          // distance to the ring axis in the (a, b) plane
  let cross = length(vec3f(ringDist, p_abcd.z, p_abcd.w));
  return length(vec2f(cross, p_e)) - r;
}

// 5-box (slab intersection): SDF is positive outside, negative inside.
fn sdfBox5(p_abcd: vec4f, p_e: f32, b_abcd: vec4f, b_e: f32) -> f32 {
  let d_abcd = abs(p_abcd) - b_abcd;
  let d_e = abs(p_e) - b_e;
  let outside = sqrt(max(0.0,
    pow(max(d_abcd.x, 0.0), 2.0) + pow(max(d_abcd.y, 0.0), 2.0) +
    pow(max(d_abcd.z, 0.0), 2.0) + pow(max(d_abcd.w, 0.0), 2.0) +
    pow(max(d_e, 0.0), 2.0)
  ));
  let inside = min(max(max(max(d_abcd.x, d_abcd.y), max(d_abcd.z, d_abcd.w)), d_e), 0.0);
  return outside + inside;
}

// Smooth minimum (polynomial form) for soft union.
fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Cornell-box-style 5D scene:
//   ellipsoid (anisotropic, gives axis-distinct ellipses) ∪ torus
//   intersected with a 5-box ("walls"), so contents stay bounded.
fn analyticSDF(p_abcd: vec4f, p_e: f32) -> f32 {
  // Anisotropic ellipsoid centered at origin; per-axis scales chosen so each
  // canonical XYZ assignment shows a different elliptical cross-section.
  let ellipsoid = sdfEllipsoid5(
    p_abcd, p_e,
    vec4f(1.4, 0.95, 1.7, 1.1), 0.85,
    1.6
  );
  // Torus offset along the c axis so it doesn't sit on top of the sphere.
  let torus = sdfTorus5(
    p_abcd - vec4f(0.6, 0.4, -1.5, 0.0),
    p_e + 0.3,
    1.3, 0.4
  );
  // Bounding box (Cornell-box-like). Negate to invert: inside box = negative.
  let box = sdfBox5(p_abcd, p_e, vec4f(3.4, 3.4, 3.4, 3.4), 3.4);

  // Soft union of ellipsoid + torus = the "interior contents".
  let contents = smin(ellipsoid, torus, 0.45);
  // Intersection with box ("clip to room"): keep the larger of (contents, box).
  return max(contents, box);
}

// Preset 8 (key 9): Analytic Scene — SDF-defined shapes booleaned with noise.
// Inside the SDF: density modulated by the ANOVA noise sum.
// Outside the SDF: empty (with a soft blur on the boundary).
fn sampleAnalyticAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x;
  let b = q.abcd.y;
  let c = q.abcd.z;
  let d = q.abcd.w;
  let e = q.e;
  let alpha0 = params.axisAmpsE.y;
  let omega = params.axisAmpsE.w;

  // High-frequency surface displacement so the SDF shapes have detailed, eroded
  // boundaries instead of glassy-smooth ones. Bounded/periodic -> no thinning.
  let nb = omega * 3.0;
  let surfaceDetail =
      0.16 * sin(nb * (1.0 * a + 0.7 * c)) * cos(nb * (1.1 * b - 0.5 * d))
    + 0.08 * sin(nb * 2.3 * (b + 0.6 * e) + 1.3);
  // Tile the scene periodically (period L) in every axis including time, so the
  // Cornell-box scene repeats through space and LOOPS in time, instead of the
  // bounding box clipping everything once you (or time) move past its extent.
  let L = 8.0;
  let pw = vec4f(
    (fract(a / L + 0.5) - 0.5) * L,
    (fract(b / L + 0.5) - 0.5) * L,
    (fract(c / L + 0.5) - 0.5) * L,
    (fract(d / L + 0.5) - 0.5) * L
  );
  let ew = (fract(e / L + 0.5) - 0.5) * L;
  let sdf = analyticSDF(pw, ew) + surfaceDetail;
  // Tighter blur for crisper detail.
  let blur = 0.30;
  let solid = clamp(0.5 - sdf / (2.0 * blur), 0.0, 1.0);

  // ANOVA noise + a finer high-freq layer as textural modulation inside the shapes.
  let anova = f_anova_raw(a, b, c, d, e, omega);
  let fineTex = sin(omega * 6.0 * (a + 0.8 * c) + 2.1) * sin(omega * 6.0 * (b + 0.6 * e));
  let texture = clamp(0.5 + 0.4 * anova + 0.3 * fineTex, 0.0, 1.0);

  let raw = solid * (alpha0 + 0.5 + 0.6 * texture);
  let density = max(0.0, raw) * params.controls.x;

  // Ridge: bright at the SDF surface (boundary glow).
  let surface = exp(-pow(sdf / blur, 2.0) * 1.4);
  let ridge = clamp(0.5 + 0.5 * surface, 0.0, 1.0);
  let coarse = clamp(0.5 + 0.4 * raw, 0.0, 1.0);
  let fine = texture;
  return vec4f(density, ridge, coarse, fine);
}

// ---- Warped preset helpers ----------------------------------------------

// Coupled, anisotropic noise: adjacent-axis sin*cos beats (each mean-zero),
// with per-axis frequency multipliers for anisotropy. freq scales the whole
// thing (used to build octaves); phase shifts it (used to decorrelate layers).
fn coupledNoise5(a: f32, b: f32, c: f32, d: f32, e: f32, freq: f32, phase: f32) -> f32 {
  // Plane-wave sum: each wave couples 2-3 axes via a sum INSIDE the sin, so the
  // field varies strongly along ANY single axis. (The old product form
  // sin(a)*cos(b) vanished whenever one axis was ~0 — e.g. looking down an axis —
  // which made the whole field flatten to uniform haze in the main view.)
  let n =
      sin(freq * (1.00 * a + 0.70 * b) + phase)
    + sin(freq * (1.30 * b + 0.90 * c) + phase * 1.3)
    + sin(freq * (0.80 * c + 1.10 * d) + phase * 0.7)
    + sin(freq * (1.20 * d + 0.60 * e) + phase * 1.7)
    + sin(freq * (0.90 * e + 1.40 * a) + phase * 0.5)
    + sin(freq * (0.70 * a + 1.10 * c + 0.50 * e) + phase * 2.1);
  return n * 0.1667;
}

// Preset 9 (key 0): Warped — anisotropic domain-warped multi-scale FBM.
// Domain warp couples axes (kills the grid look); per-axis frequency differences
// give axis-swap distinctness; three octaves + a ridged layer give multi-scale.
fn sampleWarpedAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x; let b = q.abcd.y; let c = q.abcd.z; let d = q.abcd.w; let e = q.e;
  let alpha0 = params.axisAmpsE.y;
  let omega = params.axisAmpsE.w;

  // Low-frequency warp vector (couples axes).
  let w1 = coupledNoise5(a, b, c, d, e, omega * 0.5, 0.0);
  let w2 = coupledNoise5(a, b, c, d, e, omega * 0.5, 2.10);
  let w3 = coupledNoise5(a, b, c, d, e, omega * 0.5, 4.20);
  let warpAmt = 1.6;
  let aw = a + warpAmt * w1;
  let bw = b + warpAmt * w2;
  let cw = c + warpAmt * w3;
  let dw = d + warpAmt * w2;
  let ew = e + warpAmt * w1;

  // Multi-scale FBM on warped coords: large / medium / fine.
  var fbm = 0.0;
  fbm = fbm + 0.60 * coupledNoise5(aw, bw, cw, dw, ew, omega * 1.4, 0.0);
  fbm = fbm + 0.30 * coupledNoise5(aw, bw, cw, dw, ew, omega * 3.1, 1.7);
  fbm = fbm + 0.15 * coupledNoise5(aw, bw, cw, dw, ew, omega * 6.5, 3.1);

  // Ridged fine layer for crisp filaments (a different structure size).
  let ridgeN = 1.0 - abs(coupledNoise5(aw, bw, cw, dw, ew, omega * 4.5, 0.5));
  fbm = fbm + 0.18 * (ridgeN - 0.5);

  // Concentric shells in field space, warped by the coupled FBM so they're organic
  // rather than perfect spheres. The ray reliably CROSSES these surfaces as its
  // radial distance sweeps, so structure is visible in the long-path main view.
  // (This is the mechanism Legacy's "shells" use; space-filling FBM alone averages
  // out to flat haze over a long ray.) Bounded (sin-based) so no thinning over time.
  // Anisotropic shell metric: per-axis weights make the shells ellipsoidal, so
  // swapping which field axis feeds X/Y/Z (and tilting the basis) changes the
  // cross-section you see. Higher frequency = smaller, more detailed shells.
  let radial = sqrt(2.0 * a * a + 0.6 * b * b + 1.4 * c * c + 0.9 * d * d + 1.7 * e * e);
  let shellArg = radial * omega * 7.0 + fbm * 2.5;
  let shells = pow(1.0 - smoothstep(0.0, 0.42, abs(sin(shellArg))), 2.0);
  let cores = max(0.0, fbm - 0.30);
  let density = (shells * 1.3 + cores * 0.7) * params.controls.x;
  let ridgeOut = clamp(0.5 + 0.5 * ridgeN, 0.0, 1.0);
  let coarse = clamp(0.5 + 0.5 * fbm, 0.0, 1.0);
  let fine = clamp(shells, 0.0, 1.0);
  return vec4f(density, ridgeOut, coarse, fine);
}

// ---- Fractal preset helpers ---------------------------------------------

// Hamilton quaternion product (x = real part, yzw = imaginary).
fn quatMul(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(
    a.x * b.x - a.y * b.y - a.z * b.z - a.w * b.w,
    a.x * b.y + a.y * b.x + a.z * b.w - a.w * b.z,
    a.x * b.z - a.y * b.w + a.z * b.x + a.w * b.y,
    a.x * b.w + a.y * b.z - a.z * b.y + a.w * b.x
  );
}

// Preset 10: Fractal — quaternion Julia set with distance-estimator density.
// abcd is the quaternion; the 5th axis (e) modulates the Julia constant so axis E
// reshapes the entire fractal. Iteration count scales with the detail tier.
fn sampleFractalAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let omega = params.axisAmpsE.w;
  // Wrap coords through sin so the quaternion stays bounded AND periodic in every
  // axis (including time): the fractal tiles through space and LOOPS in time,
  // instead of the time component growing without bound and pushing every point
  // out of the set (which made the fractal fade to nothing after a few seconds).
  // Per-component phase offsets so the quaternion is non-degenerate even when some
  // coords are 0 (e.g. looking straight down an axis) — otherwise sin(0)=0 zeroes
  // those components and the slice misses the set.
  let s = 1.1;
  var z = vec4f(
    s * sin(omega * q.abcd.x + 0.7),
    s * sin(omega * q.abcd.y + 2.1),
    s * sin(omega * q.abcd.z + 4.2),
    s * sin(omega * q.abcd.w + 1.3)
  );
  let m = omega * q.e;
  let cc = vec4f(-0.45 + 0.12 * sin(m), 0.55 + 0.10 * cos(m * 1.3), 0.16 + 0.05 * sin(m * 0.7), 0.24);

  let maxIter = 12 + i32(params.fieldMeta.x) * 5; // tier 0 -> 12, tier 3 -> 27 (more = finer)
  var r = length(z);
  var trap = 1.0e9;
  for (var i: i32 = 0; i < 28; i = i + 1) {
    if (i >= maxIter || r > 4.0) { break; }
    z = quatMul(z, z) + cc;
    r = length(z);
    trap = min(trap, dot(z, z)); // squared orbit-trap distance to origin
  }
  // VOLUMETRIC fill (not a thin DE shell, which the coarse fixed-step raymarch
  // would step over). Interior of the set is filled; orbit-trap bands give it
  // internal nested structure so it isn't a flat solid blob.
  let inside = 1.0 - smoothstep(3.0, 6.0, r);
  // Finer nested bands + a second high-frequency layer for fractal detail.
  let bands = 0.5 + 0.5 * sin(trap * 14.0 - 1.0);
  let fineBands = 0.5 + 0.5 * sin(trap * 38.0 + r * 3.0);
  let density = inside * (0.22 + 0.5 * bands + 0.28 * fineBands) * params.controls.x * 1.5;
  let ridge = clamp(bands, 0.0, 1.0);
  let coarse = clamp(0.4 + 0.6 * fineBands, 0.0, 1.0);
  let fine = clamp(inside, 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// ---- Cellular preset helpers --------------------------------------------

fn hash22(p: vec2f) -> vec2f {
  let h = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(h) * 43758.5453);
}

// 2D Worley F1 distance (nearest feature point), 3x3 neighborhood.
fn worley2(p: vec2f) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  var minDist = 8.0;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let neighbor = vec2f(f32(dx), f32(dy));
      let pt = hash22(cell + neighbor);
      let diff = neighbor + pt - f;
      minDist = min(minDist, dot(diff, diff));
    }
  }
  return sqrt(minDist);
}

// Coupled 5D cellular: min of 2D Worley over decorrelated axis pairs.
fn cellularLayer(a: f32, b: f32, c: f32, d: f32, e: f32, freq: f32) -> f32 {
  // Five pairs forming a ring (a-b-c-d-e-a) so every axis appears in two pairs.
  // This guarantees variation along ANY single view axis (no degeneracy when the
  // other spatial coords sit near 0, e.g. looking straight down one axis).
  let wab = worley2(vec2f(a, b) * freq);
  let wbc = worley2(vec2f(b, c) * freq + vec2f(5.2, 1.7));
  let wcd = worley2(vec2f(c, d) * freq + vec2f(11.3, 5.7));
  let wde = worley2(vec2f(d, e) * freq + vec2f(7.1, 19.3));
  let wea = worley2(vec2f(e, a) * freq + vec2f(23.1, 17.9));
  return min(min(min(wab, wbc), min(wcd, wde)), wea);
}

// Preset 11: Cellular — two-octave 5D Worley, blobby interiors near feature points.
fn sampleCellularAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x; let b = q.abcd.y; let c = q.abcd.z; let d = q.abcd.w; let e = q.e;
  let omega = params.axisAmpsE.w;
  let alpha0 = params.axisAmpsE.y;

  // Smaller cells + a finer octave for more detail per the "smaller scale" goal.
  let c1 = cellularLayer(a, b, c, d, e, omega * 1.3);
  let c2 = cellularLayer(a, b, c, d, e, omega * 3.0);
  let cells = c1 * 0.6 + c2 * 0.4;

  // Sharp thin cell cores with real empty gaps (so the scene doesn't saturate to a
  // flat color). pow sharpens; the narrow smoothstep keeps the gaps fully empty.
  let blob = pow(1.0 - smoothstep(0.0, 0.22, cells), 2.5);
  let density = blob * 2.4 * params.controls.x;
  let ridge = clamp(smoothstep(0.45, 0.05, cells), 0.0, 1.0);
  let coarse = clamp(blob, 0.0, 1.0);
  let fine = clamp(1.0 - c2, 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// Preset 12: Reaction — renders the baked Gray-Scott labyrinth as a volume.
// Two periodic axis-pair projections of the RD texture are combined into walls;
// the third axis modulates depth. Bounded/periodic (texture repeat) -> loops.
fn sampleReactionAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let q = fieldCoordAt(worldPos, flow, hiddenVal);
  let a = q.abcd.x; let b = q.abcd.y; let c = q.abcd.z; let d = q.abcd.w; let e = q.e;
  let omega = params.axisAmpsE.w;
  let inv2pi = 0.15915494309;

  let uvAB = fract(vec2f(omega * a, omega * b) * inv2pi);
  let uvCD = fract(vec2f(omega * c, omega * d) * inv2pi + vec2f(0.37, 0.11));
  let r1 = textureSampleLevel(rdTex, rdSampler, uvAB, 0.0).r;
  let r2 = textureSampleLevel(rdTex, rdSampler, uvCD, 0.0).r;
  let lab = r1 * 0.6 + r2 * 0.4;

  // Render the RD channels (low values) as sharp solid tubes with empty space
  // between them, so the ray hits distinct labyrinth structure instead of
  // averaging a space-filling wall to flat. Depth modulation along e adds volume.
  let tubes = pow(1.0 - smoothstep(0.34, 0.46, lab), 1.3);
  let depth = 0.5 + 0.5 * sin(omega * e + lab * 7.0);
  let density = tubes * (0.6 + 0.5 * depth) * 2.4 * params.controls.x;
  let ridge = clamp(lab, 0.0, 1.0);
  let coarse = clamp(0.4 + 0.6 * lab, 0.0, 1.0);
  let fine = clamp(depth, 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

// ---- Shadow Sculpt preset (low-dim proof-of-concept) --------------------
// A 3D object whose three orthogonal silhouettes are prescribed 2D shapes,
// built by intersecting the unprojected (extruded) silhouette prisms. This is
// the low-dimensional analog of the whole project: the visible shape is a
// "shadow" of a higher-structure object, and we design the object from its
// shadows. Uses raw world space (a pure 3D scene) so orbiting reveals each
// silhouette as you align with its axis.

fn smax2(a: f32, b: f32, k: f32) -> f32 { return -smin(-a, -b, k); }

fn sampleShadowSculptAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let scale = 0.30;            // world -> sculpt space (sculpt radius ~5 world)
  let p = worldPos * scale;

  // Three extruded silhouette prisms (each ignores its own projection axis):
  let prismZ = sd_circle2(p.xy, 1.5);            // looking down Z = circle
  let prismX = sd_box2(p.zy, vec2f(1.25, 1.25)); // looking down X = square
  let prismY = sd_tri2(p.xz, 1.55);              // looking down Y = triangle

  // Sculpture = smooth (rounded) intersection of the three prisms. Orbiting the
  // camera reveals each prescribed silhouette as you align with its axis (down Z =
  // circle, down X = square, down Y = triangle): the object IS its three shadows.
  let sdf = smax2(smax2(prismZ, prismX, 0.18), prismY, 0.18) / scale;
  let omega = params.axisAmpsE.w;
  let bump = 0.08 * sin(omega * 3.0 * worldPos.x + 1.3)
                  * sin(omega * 3.0 * worldPos.y)
                  * sin(omega * 3.0 * worldPos.z);
  let d = sdf + bump;
  let blur = 0.22;
  let solid = clamp(0.5 - d / (2.0 * blur), 0.0, 1.0);
  let density = solid * 2.2 * params.controls.x;
  let surf = exp(-pow(d / blur, 2.0) * 1.2);
  let ridge = clamp(0.5 + 0.5 * surf, 0.0, 1.0);
  let coarse = clamp(0.6 - d * 0.25, 0.0, 1.0);
  let fine = clamp(solid, 0.0, 1.0);
  return vec4f(density, ridge, coarse, fine);
}

fn sampleFieldAt(worldPos: vec3f, flow: f32, hiddenVal: f32) -> vec4f {
  let presetId = i32(params.fieldMeta.y);
  if (presetId == 0) { return sampleLegacyAt(worldPos, flow, hiddenVal); }
  if (presetId == 2) { return sampleTripleAt(worldPos, flow, hiddenVal); }
  if (presetId == 3) { return sampleSculptureAt(worldPos, flow, hiddenVal); }
  if (presetId == 4) { return sampleHybridAddAt(worldPos, flow, hiddenVal); }
  if (presetId == 5) { return sampleHybridModAt(worldPos, flow, hiddenVal); }
  if (presetId == 6) { return sampleHybridShapeAt(worldPos, flow, hiddenVal); }
  if (presetId == 7) { return sampleHybridMulAt(worldPos, flow, hiddenVal); }
  if (presetId == 8) { return sampleAnalyticAt(worldPos, flow, hiddenVal); }
  if (presetId == 9) { return sampleWarpedAt(worldPos, flow, hiddenVal); }
  if (presetId == 10) { return sampleFractalAt(worldPos, flow, hiddenVal); }
  if (presetId == 11) { return sampleCellularAt(worldPos, flow, hiddenVal); }
  if (presetId == 12) { return sampleReactionAt(worldPos, flow, hiddenVal); }
  if (presetId == 13) { return sampleShadowSculptAt(worldPos, flow, hiddenVal); }
  return sampleAnovaAt(worldPos, flow, hiddenVal);
}

fn sampleField(worldPos: vec3f) -> vec4f {
  return sampleFieldAt(worldPos, params.time, params.hidden);
}

fn fieldSample(worldPos: vec3f) -> vec4f {
  return sampleField(worldPos);
}
`,We=`
struct Params {
  resolution: vec2f,
  time: f32,
  hidden: f32,
  camera: vec4f,
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  controls: vec4f,
  grade: vec4f,
  basisX: vec4f,
  basisY: vec4f,
  basisZ: vec4f,
  basisT: vec4f,
  basisW: vec4f,
  basisE: vec4f,
  basisMeta: vec4f,
  axisAmps: vec4f,
  axisAmpsE: vec4f,
  pairAmpsAB: vec4f,
  pairAmpsBC: vec4f,
  pairAmpsCE: vec4f,
  fieldMeta: vec4f,
};

struct Coord5 {
  abcd: vec4f,
  e: f32,
};

struct HeatParams {
  res: vec2u,           // grid resolution (e.g., 64x64)
  xyzSamples: u32,      // per-axis sample count (default 4 -> 64 samples per cell)
  pad0: u32,
  range: vec4f,         // tMin, tMax, wMin, wMax
  sampleBox: vec4f,     // half-extent of the XYZ sample box (e.g., 3.0); padded
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> heatParams: HeatParams;
@group(0) @binding(2) var heatTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var rdTex: texture_2d<f32>;
@group(0) @binding(4) var rdSampler: sampler;

fn sat(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }
fn rot2(v: vec2f, a: f32) -> vec2f {
  let s = sin(a); let c = cos(a);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

${_e}

${Pe}

@compute @workgroup_size(8, 8)
fn bake(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= heatParams.res.x || id.y >= heatParams.res.y) { return; }

  let tNorm = (f32(id.x) + 0.5) / f32(heatParams.res.x);
  let wNorm = (f32(id.y) + 0.5) / f32(heatParams.res.y);
  let t = mix(heatParams.range.x, heatParams.range.y, tNorm);
  let w = mix(heatParams.range.z, heatParams.range.w, wNorm);

  let N = i32(heatParams.xyzSamples);
  let halfBox = heatParams.sampleBox.x;

  var sum = 0.0;
  var sumSq = 0.0;
  var prev = 0.0;
  var gradAccum = 0.0;
  var count = 0u;

  // Walk the XYZ sample box. Density is the .x channel of sampleFieldAt.
  for (var i = 0; i < N; i = i + 1) {
    for (var j = 0; j < N; j = j + 1) {
      for (var k = 0; k < N; k = k + 1) {
        let fx = (f32(i) + 0.5) / f32(N) - 0.5;
        let fy = (f32(j) + 0.5) / f32(N) - 0.5;
        let fz = (f32(k) + 0.5) / f32(N) - 0.5;
        let pos = vec3f(fx, fy, fz) * (2.0 * halfBox);
        let s = sampleFieldAt(pos, t, w);
        let d = s.x;
        sum = sum + d;
        sumSq = sumSq + d * d;
        if (count > 0u) {
          gradAccum = gradAccum + abs(d - prev);
        }
        prev = d;
        count = count + 1u;
      }
    }
  }

  let mean = sum / f32(count);
  let variance = max(0.0, sumSq / f32(count) - mean * mean);
  let gradMag = gradAccum / max(f32(count - 1u), 1.0);

  textureStore(heatTex, vec2i(i32(id.x), i32(id.y)), vec4f(mean, variance, gradMag, 1.0));
}
`,$e=`
struct DisplayParams {
  // Crosshair position in normalized [0,1] (uv) units.
  crosshair: vec2f,
  // Texture resolution (used to size the crosshair line).
  texRes: vec2f,
  // Display normalization: scales for (R, G, B) channels so saturated values can be tuned.
  scale: vec4f,
};

@group(0) @binding(0) var heatSampler: sampler;
@group(0) @binding(1) var heatTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> dp: DisplayParams;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(3.0, 1.0),
    vec2f(-1.0, 1.0)
  );
  let pos = positions[vi];
  var out: VertexOut;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  // Flip Y so W = +Y reads as up on screen.
  let sampleUV = vec2f(in.uv.x, 1.0 - in.uv.y);
  let s = textureSample(heatTex, heatSampler, sampleUV);
  // Apply per-channel scaling and a soft tonemap.
  let raw = vec3f(s.r * dp.scale.x, s.g * dp.scale.y, s.b * dp.scale.z);
  let toned = vec3f(1.0) - exp(-max(raw, vec3f(0.0)));

  // Color-coded crosshair:
  //   horizontal line (T direction)  — orange
  //   vertical line   (W direction)  — sky blue
  //   intersection point             — white
  let lineHalf = 1.5 / dp.texRes.x;
  let cross = dp.crosshair;
  let dx = abs(in.uv.x - cross.x);
  let dy = abs(in.uv.y - (1.0 - cross.y));
  let onV = step(dx, lineHalf);
  let onH = step(dy, lineHalf);
  let onCenter = onV * onH;

  let hColor = vec3f(1.00, 0.62, 0.16);
  let vColor = vec3f(0.30, 0.70, 1.00);
  let centerColor = vec3f(1.0, 1.0, 1.0);

  // Layered: tones first (mix to base), then center punch.
  var color = toned;
  color = mix(color, hColor, onH * 0.85);
  color = mix(color, vColor, onV * 0.85);
  color = mix(color, centerColor, onCenter * 1.0);

  // Subtle border around the inset for visibility against the main canvas background.
  let edge = step(in.uv.x, 0.005) + step(0.995, in.uv.x) + step(in.uv.y, 0.005) + step(0.995, in.uv.y);
  let edgeAlpha = clamp(edge, 0.0, 1.0);
  let withEdge = mix(color, vec3f(0.85, 0.85, 0.92), edgeAlpha * 0.6);
  return vec4f(withEdge, 1.0);
}
`,O=[{name:"Legacy",tints:[[.1,.7,.9],[.45,.4,.95],[1,.72,.3]]},{name:"ANOVA",tints:[[.16,.52,.92],[.4,.72,.98],[.86,.92,1]]},{name:"Triple",tints:[[.1,.8,.62],[.3,.9,.45],[.92,.95,.4]]},{name:"Sculpture",tints:[[.85,.62,.38],[.95,.78,.52],[1,.94,.8]]},{name:"Hyb Add",tints:[[.85,.25,.75],[.55,.35,1],[1,.7,.85]]},{name:"Hyb Mod",tints:[[.1,.75,.95],[.25,.45,.95],[.7,.95,1]]},{name:"Hyb Shape",tints:[[1,.45,.25],[1,.3,.55],[1,.82,.6]]},{name:"Hyb Mul",tints:[[.95,.78,.2],[.55,.85,.35],[1,.95,.65]]},{name:"Analytic",tints:[[.55,.8,1],[.8,.92,1],[1,1,1]]},{name:"Warped",tints:[[.08,.92,.78],[.48,.38,1],[1,.76,.22]]},{name:"Fractal",tints:[[1,.38,.15],[1,.72,.25],[1,.92,.62]]},{name:"Cellular",tints:[[.25,.92,.7],[.6,.98,.45],[.92,1,.78]]},{name:"Reaction",tints:[[1,.45,.42],[.62,.32,.85],[1,.8,.7]]},{name:"Shadow",tints:[[.55,.62,.7],[.78,.84,.9],[1,1,1]]}],L=e=>`vec3f(${e.map(t=>t.toFixed(2)).join(", ")})`,je=`fn presetRamp(id: i32, u: f32) -> vec3f {
  var a = ${L(O[0].tints[0])}; var b = ${L(O[0].tints[1])}; var c = ${L(O[0].tints[2])};
${O.slice(1).map((e,t)=>`  if (id == ${t+1}) { a = ${L(e.tints[0])}; b = ${L(e.tints[1])}; c = ${L(e.tints[2])}; }`).join(`
`)}
  return mix(mix(a, b, sat(u * 2.0)), c, sat(u * 2.0 - 1.0));
}`,Ye=`
struct Params {
  resolution: vec2f,
  time: f32,
  hidden: f32,
  camera: vec4f,
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  controls: vec4f,
  grade: vec4f,
  basisX: vec4f,
  basisY: vec4f,
  basisZ: vec4f,
  basisT: vec4f,
  basisW: vec4f,
  basisE: vec4f,
  basisMeta: vec4f,
  axisAmps: vec4f,    // [aA, aB, aC, aD, _padded]
  axisAmpsE: vec4f,   // [aE, alpha0, L, omega]
  pairAmpsAB: vec4f,  // [β_AB, β_AC, β_AD, β_AE]
  pairAmpsBC: vec4f,  // [β_BC, β_BD, β_BE, β_CD]
  pairAmpsCE: vec4f,  // [β_CE, β_DE, _, _]
  fieldMeta: vec4f,   // [detailTier, presetId, _, _]
};

struct Coord5 {
  abcd: vec4f,
  e: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var frame: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var rdTex: texture_2d<f32>;
@group(0) @binding(3) var rdSampler: sampler;

fn sat(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }
fn rot2(v: vec2f, a: f32) -> vec2f {
  let s = sin(a); let c = cos(a);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

${_e}

${Pe}

${je}

fn palette(pos: vec3f, sampleInfo: vec4f, rich: f32) -> vec3f {
  let q = fieldCoord(pos);
  let phase = sampleInfo.y * 2.1 + sampleInfo.z * 2.4 + q.abcd.w * 0.08 + q.e * 0.035;
  let pulse = 0.5 + 0.5 * sin(vec3f(0.2, 2.0, 4.3) + phase + q.abcd.xyz * 0.075);
  let teal = vec3f(0.08, 0.92, 0.78);
  let rose = vec3f(1.00, 0.26, 0.48);
  let amber = vec3f(1.00, 0.76, 0.22);
  let violet = vec3f(0.48, 0.38, 1.00);
  let plain = teal * pulse.x * 0.52 + rose * pulse.y * 0.32 + amber * pulse.z * 0.22 + violet * sampleInfo.w * 0.18;
  // Why the original reads grey: phase is driven by the ridge/coarse channels, which oscillate at
  // per-SAMPLE frequency, so along one ray the four colours land out of phase and integrate to a
  // desaturated average (~(0.29,0.36,0.30) -- grey). Rich instead drives hue from the field
  // COORDINATES, which vary over tens of world units, and walks a designed 3-stop ramp rather than
  // summing four colours. Hue then drifts across the scene, so regions get their own colour.
  let slow = (q.abcd.x * 0.9 + q.abcd.y * 0.55 + q.abcd.z * 0.75) * 0.062 + q.abcd.w * 0.20 + q.e * 0.14;
  let u = 0.5 + 0.5 * sin(slow);
  let ramp = presetRamp(i32(params.fieldMeta.y + 0.5), u);   // each preset walks its OWN ramp
  let rich3 = ramp * (0.42 + 0.20 * sampleInfo.w);   // scaled to the plain palette's magnitude, not brighter
  return mix(plain, rich3, rich);
}

fn background(rd: vec3f, uv: vec2f) -> vec3f {
  let h = params.hidden;
  let t = params.time;
  let horizon = pow(sat(0.5 + 0.5 * rd.y), 1.7);
  let base = mix(vec3f(0.012, 0.015, 0.014), vec3f(0.034, 0.028, 0.045), horizon);
  let starSeed = floor(vec4f(rd * 170.0, h * 3.0 + t * 0.05));
  let stars = step(0.9977, hash41(starSeed)) * pow(max(0.0, 1.0 - length(fract(rd.xy * 86.0) - vec2f(0.5)) * 2.0), 10.0);
  let spectral = 0.5 + 0.5 * sin(vec3f(0.0, 1.8, 3.7) + h * 0.22 + rd.zxy * 3.0);
  return base + spectral * stars * 0.32;
}

// Field gradient for lighting normals (4-tap tetrahedral). Returned UNNORMALISED so the caller can
// judge reliability from its length and fade lighting toward neutral where the gradient is near
// zero -- snapping the normal at a gradient zero produces a flash, the bug this avoids (learned in
// Prism). Epsilon is about one march step, so it averages over the field's finest detail.
fn fieldGrad(pos: vec3f) -> vec3f {
  let e = vec2f(1.0, -1.0) * 0.32;
  return e.xyy * fieldSample(pos + e.xyy).x
       + e.yyx * fieldSample(pos + e.yyx).x
       + e.yxy * fieldSample(pos + e.yxy).x
       + e.xxx * fieldSample(pos + e.xxx).x;
}

fn renderPixel(pixel: vec2u) -> vec3f {
  let p = vec2f(f32(pixel.x), f32(pixel.y)) + vec2f(0.5);
  let uv = p / params.resolution;
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  let xy = (uv * 2.0 - vec2f(1.0)) * vec2f(aspect, 1.0);
  let localRay = normalize(vec3f(xy, params.grade.y));
  let rd = normalize(
    params.right.xyz * localRay.x +
    params.up.xyz * localRay.y +
    params.forward.xyz * localRay.z
  );
  let ro = params.camera.xyz;

  // Rich look (eased 0..1, fieldMeta.z): the transfer function proven in Prism, ported here. At 0
  // this is byte-for-byte the original render, so the toggle is a true A/B of the whole appearance.
  let rich = params.fieldMeta.z;
  var travel = 0.08 + hash41(vec4f(p, 7.31, 1.7)) * 0.16 * params.grade.w * rich;   // per-pixel dither: step banding -> fine grain (kept low; a bright field shows grain readily)
  var color = vec3f(0.0);
  var alpha = 0.0;
  for (var i: i32 = 0; i < 88; i = i + 1) {
    if (alpha > 0.982 || travel > 50.0 || f32(i) >= params.grade.z) { break; }
    let pos = ro + rd * travel;
    let sampleInfo = fieldSample(pos);
    let density = sampleInfo.x;
    let stepLen = params.grade.w * mix(0.34, 0.085, sat(density * 1.8));
    // Absorption 0.62 -> 2.4: the ray commits to the nearest structure instead of washing into the
    // deep integral, so fronts read as surfaces. Emission tracks density so structure reads bright.
    // 1.5, not Prism's 2.2: this field is denser and space-filling, so a high coefficient saturates
    // every ray to white. Enough to commit to the nearest structure without blowing out.
    let absorb = 1.0 - exp(-density * mix(0.62, 1.5, rich) * stepLen);
    let trans = 1.0 - alpha;
    let rim = pow(sat(sampleInfo.y), 2.0);
    let glow = pow(sat(density * 1.55), 2.0) * params.controls.w;
    let baseCol = palette(pos, sampleInfo, rich);
    var shade = baseCol * mix(0.32 + sampleInfo.z * 0.72 + rim * 0.30,
                              0.14 + 0.95 * density + rim * 0.26, rich);
    // Gradient lighting: a key light and view rim shaded from the field's own gradient, so the
    // medium reads as sculpted form rather than flat fog. Ramped in over a density band (no hard
    // iso-contour sliding through the medium) and only evaluated where it contributes, since each
    // sample here costs 4 extra field taps.
    let lit = smoothstep(0.12, 0.35, density) * params.fieldMeta.w;
    if (lit > 0.0) {
      let g = fieldGrad(pos);
      let m = length(g);
      let conf = smoothstep(1e-3, 1e-2, m);                 // gradient reliability
      let N = -g / max(m, 1e-6);                            // outward normal (toward decreasing density)
      let L = normalize(vec3f(0.45, 0.72, 0.42));           // fixed key light
      let diff = mix(0.62, 0.5 + 0.5 * dot(N, L), conf);    // half-Lambert, neutral where unreliable
      let rimL = pow(1.0 - sat(dot(N, -rd)), 2.0) * conf;
      let litShade = shade * (0.26 + 1.30 * diff) + baseCol * (rimL * 0.45);   // wide range so lit/shadow sides genuinely separate; a narrow one just dims
      shade = mix(shade, litShade, lit);
    }
    let fogAmt = (1.0 - exp(-travel * 0.055)) * 0.7 * rich;   // aerial perspective: near/far separate
    shade = mix(shade, vec3f(0.05, 0.08, 0.14), fogAmt);
    color = color + trans * absorb * shade;
    color = color + trans * glow * shade * mix(0.035, 0.16, rich);   // glow was a near no-op at 0.035
    alpha = alpha + trans * absorb;
    travel = travel + stepLen;
  }
  color = color + (1.0 - alpha) * background(rd, uv);
  let center = uv - vec2f(0.5);
  let vignette = smoothstep(0.86, 0.25, dot(center, center));
  let grain = hash41(vec4f(uv * params.resolution * 0.37, params.time, params.hidden)) - 0.5;
  color = color * (0.70 + 0.30 * vignette) + grain * 0.012;
  color = vec3f(1.0) - exp(-max(color, vec3f(0.0)) * params.grade.x);
  let lum = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = mix(color, clamp(mix(vec3f(lum), color, 1.15), vec3f(0.0), vec3f(1.0)), rich);   // gentle saturation lift
  color = pow(max(color, vec3f(0.0)), vec3f(0.454545));
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(frame);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let pixel = vec2u(id.xy);
  let color = renderPixel(pixel);
  textureStore(frame, vec2i(i32(pixel.x), i32(pixel.y)), vec4f(color, 1.0));
}
`,Xe=`
@group(0) @binding(0) var frameSampler: sampler;
@group(0) @binding(1) var frameTex: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(3.0, 1.0),
    vec2f(-1.0, 1.0)
  );

  let pos = positions[vertexIndex];
  var out: VertexOut;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5);
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  return textureSample(frameTex, frameSampler, in.uv);
}
`,C=["A","B","C","D","E"],Ze=["#f47878","#7adf7a","#7aaef4","#f4c878","#d878f4"],ue=O.map(e=>e.name),te=9,v={x:0,y:1,z:2,t:3,w:4},Se={space:{slots:{x:0,y:1,z:2,t:3,w:4},tilt:0,spin:0},time:{slots:{x:0,y:1,z:3,t:2,w:4},tilt:0,spin:0},pair:{slots:{x:0,y:3,z:4,t:1,w:2},tilt:0,spin:0},tilted:{slots:{x:0,y:1,z:2,t:3,w:4},tilt:.74,spin:.31}},S=document.querySelector("#field"),H=document.querySelector("#status"),be=document.querySelector("#unsupported"),Ke=document.querySelector("#readout"),qe=document.querySelector("#engage"),Qe=document.querySelector("#heatmapCanvas"),xe=document.querySelector("#heatmapRes"),ne=document.querySelector("#heatmapEnabled"),Je=document.querySelector("#heatmapInset"),ze=Array.from(document.querySelectorAll("[data-quality]")),ke=Array.from(document.querySelectorAll("[data-preset]")),W=document.querySelector("#sceneBar"),Be={x:document.querySelector("#axisX"),y:document.querySelector("#axisY"),z:document.querySelector("#axisZ"),t:document.querySelector("#axisT"),w:document.querySelector("#axisW")},ae={speed:{label:"Speed",scale:.42,maxSteps:48,stepMul:1.48,detailMax:1},balanced:{label:"Balanced",scale:.58,maxSteps:64,stepMul:1.16,detailMax:2},quality:{label:"Quality",scale:.82,maxSteps:88,stepMul:.92,detailMax:3}},f={hidden:q("hidden",0),timeRate:q("timeRate",1),density:q("density",1.05),detail:q("detail",3),warp:q("warp",.88),glow:q("glow",1.25),exposure:q("exposure",1.1),tilt:q("tilt",0),spin:q("spin",0),scale:q("scale",.42,e=>`${Math.round(e*100)}%`)},w=new Set,g={position:[0,0,10.5],yaw:0,pitch:0},n={alpha0:.4,axisAmps:[1,1,1,1,1],pairAmps:[1,1,1,1,1,1,1,1,1,1],detailTier:null,pinnedTime:null,pinnedHidden:null,pinnedCamera:null,basisOverride:null,presetId:te,pinnedRich:null};Ge(n);let se="balanced",le=!0,X=1,ce=!0,Z=1,y=null;const l={resolution:64,enabled:!0,initialized:!1,bakePipeline:null,displayPipeline:null,heatTex:null,heatTexView:null,heatSampler:null,bakeBindGroup:null,displayBindGroup:null,bakeUniformBuffer:null,displayUniformBuffer:null,context:null};let z=f.hidden.value,V=z,G=0,we=performance.now(),de=60,ye=0;function q(e,t,a=r=>r.toFixed(2)){const r=document.querySelector(`#${e}`),i=document.querySelector(`#${e}Value`),o={input:r,output:i,value:Number((r==null?void 0:r.value)??t),format:a},c=()=>{o.value=Number(r.value),i.textContent=a(o.value)};return r.addEventListener("input",c),c(),o}function re(e,t){const a=f[e];a.input.value=String(t),a.value=Number(t),a.output.textContent=a.format(a.value)}function et(){for(const[e,t]of Object.entries(Be)){t.textContent="";for(let a=0;a<C.length;a+=1){const r=document.createElement("option");r.value=String(a),r.textContent=C[a],t.append(r)}t.addEventListener("change",()=>tt(e,Number(t.value)))}me(),he()}function tt(e,t){const a=v[e],r=Object.keys(v).find(i=>i!==e&&v[i]===t);v[e]=t,r&&(v[r]=a),me(),he(),$()}function me(){for(const[e,t]of Object.entries(Be))t.value=String(v[e])}function he(){const e=document.querySelector("#heatmapLegend");if(e)for(const t of["x","y","z","t","w"]){const a=e.querySelector(`[data-slot="${t}"]`);if(!a)continue;const r=v[t],i=C[r],o=a.querySelector("em[data-axis]");o&&(o.textContent=i,o.style.color=Ze[r]),t==="t"||t==="w"?a.setAttribute("data-active-tw","true"):a.removeAttribute("data-active-tw")}}function J(e){be.hidden=!1,H.textContent="Unavailable",be.querySelector("span").textContent=e}function ge(e){se=e;const t=ae[e];re("scale",t.scale);for(const a of ze){const r=a.dataset.quality===e;a.classList.toggle("active",r),a.setAttribute("aria-pressed",String(r))}y&&pe(y,!0)}function at(e){const t=Se[e];Object.assign(v,t.slots),re("tilt",t.tilt),re("spin",t.spin),me(),$(e)}function $(e=null){var a;const t=e||((a=Object.entries(Se).find(([,r])=>Object.keys(v).every(i=>v[i]===r.slots[i])&&Math.abs(f.tilt.value-r.tilt)<.001&&Math.abs(f.spin.value-r.spin)<.001))==null?void 0:a[0]);for(const r of ke){const i=r.dataset.preset===t;r.classList.toggle("active",i),r.setAttribute("aria-pressed",String(i))}}function Ce(e){n.presetId=Math.max(0,Math.min(ue.length-1,e)),Ee()}function Ee(){if(!W)return;const e=n.presetId??te;for(const t of W.querySelectorAll(".scene-chip")){const a=Number(t.dataset.preset);t.classList.toggle("active",a===e),t.setAttribute("aria-pressed",String(a===e))}}function rt(){W&&(W.textContent="",ue.forEach((e,t)=>{const a=document.createElement("button");a.type="button",a.className="scene-chip",a.dataset.preset=String(t);const r=t<9?String(t+1):t===9?"0":"";a.innerHTML=r?`<span class="chip-key">${r}</span><span>${e}</span>`:`<span>${e}</span>`,a.addEventListener("click",()=>Ce(t)),W.append(a)}),Ee())}async function st(){if(!navigator.gpu){J("Use a current Chromium or Edge build with hardware acceleration enabled.");return}const e=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!e){J("No compatible GPU adapter was found.");return}const t=await e.requestDevice(),a=S.getContext("webgpu"),r=navigator.gpu.getPreferredCanvasFormat(),i=t.createShaderModule({code:Ye}),o=t.createShaderModule({code:Xe}),c=await t.createComputePipelineAsync({layout:"auto",compute:{module:i,entryPoint:"main"}}),h=await t.createRenderPipelineAsync({layout:"auto",vertex:{module:o,entryPoint:"vs"},fragment:{module:o,entryPoint:"fs",targets:[{format:r}]},primitive:{topology:"triangle-list"}}),s=new Float32Array(80),u=t.createBuffer({size:s.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),m=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge"});y={device:t,context:a,format:r,computePipeline:c,renderPipeline:h,uniformData:s,uniformBuffer:u,sampler:m,outputTexture:null,computeBindGroup:null,renderBindGroup:null,canvasWidth:0,canvasHeight:0,outputWidth:0,outputHeight:0,rdTexture:null,rdSampler:null},y.rdSampler=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"}),y.rdTexture=await ft(t,H);const b=()=>pe(y);window.addEventListener("resize",b),f.scale.input.addEventListener("input",()=>pe(y,!0)),b(),t.lost.then(A=>{H.textContent="Device lost",J(A.message||"The WebGPU device was lost.")}),await mt(t,r),H.textContent="Live compute",requestAnimationFrame(A=>Me(A,y))}function pe(e,t=!1){var h;const a=Math.min(window.devicePixelRatio||1,1.5),r=Math.max(1,Math.floor(S.clientWidth*a)),i=Math.max(1,Math.floor(S.clientHeight*a)),o=Math.max(1,Math.floor(r*f.scale.value)),c=Math.max(1,Math.floor(i*f.scale.value));!t&&r===e.canvasWidth&&i===e.canvasHeight&&o===e.outputWidth&&c===e.outputHeight||(e.canvasWidth=r,e.canvasHeight=i,e.outputWidth=o,e.outputHeight=c,S.width=r,S.height=i,e.context.configure({device:e.device,format:e.format,alphaMode:"opaque"}),(h=e.outputTexture)==null||h.destroy(),e.outputTexture=e.device.createTexture({size:[o,c],format:"rgba8unorm",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC}),e.computeBindGroup=e.device.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:e.uniformBuffer}},{binding:1,resource:e.outputTexture.createView()},{binding:2,resource:e.rdTexture.createView()},{binding:3,resource:e.rdSampler}]}),e.renderBindGroup=e.device.createBindGroup({layout:e.renderPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:e.sampler},{binding:1,resource:e.outputTexture.createView()}]}))}function Me(e,t){const a=Math.min((e-we)/1e3,.05);we=e,de+=(1/Math.max(a,.001)-de)*.08,it(a),ot(t,a,e),gt(t),requestAnimationFrame(r=>Me(r,t))}function it(e){const t=w.has("ShiftLeft")||w.has("ShiftRight")?8.5:3.25,{forward:a,right:r}=Ne(),i=ee([a[0],0,a[2]]),o=[0,0,0];w.has("KeyW")&&U(o,i,1),w.has("KeyS")&&U(o,i,-1),w.has("KeyD")&&U(o,r,1),w.has("KeyA")&&U(o,r,-1),w.has("Space")&&(o[1]+=1),(w.has("KeyC")||w.has("ControlLeft")||w.has("ControlRight"))&&(o[1]-=1);const c=Re(o);c>1e-4&&U(g.position,vt(o,1/c),t*e),w.has("PageUp")&&(z+=1.55*e),w.has("PageDown")&&(z-=1.55*e),z=Ie(z,Number(f.hidden.input.min),Number(f.hidden.input.max)),Math.abs(Number(f.hidden.input.value)-z)>.001&&re("hidden",z)}function ot(e,t,a){G+=t*f.timeRate.value,n.pinnedTime!==null&&(G=n.pinnedTime),n.pinnedCamera&&(g.position[0]=n.pinnedCamera.position[0],g.position[1]=n.pinnedCamera.position[1],g.position[2]=n.pinnedCamera.position[2],g.yaw=n.pinnedCamera.yaw,g.pitch=n.pinnedCamera.pitch),z=f.hidden.value,V+=(z-V)*(1-Math.exp(-t*6)),n.pinnedHidden!==null&&(V=n.pinnedHidden),X+=((le?1:0)-X)*(1-Math.exp(-t*7)),Z+=((ce?1:0)-Z)*(1-Math.exp(-t*7)),n.pinnedRich!==null&&(X=n.pinnedRich,Z=n.pinnedRich);const r=ae[se],{forward:i,right:o,up:c}=Ne(),h=1/Math.tan(68*Math.PI/360),s=e.uniformData;s[0]=e.outputWidth,s[1]=e.outputHeight,s[2]=G,s[3]=V,s[4]=g.position[0],s[5]=g.position[1],s[6]=g.position[2],s[7]=0,s[8]=o[0],s[9]=o[1],s[10]=o[2],s[11]=0,s[12]=c[0],s[13]=c[1],s[14]=c[2],s[15]=0,s[16]=i[0],s[17]=i[1],s[18]=i[2],s[19]=0,s[20]=f.density.value,s[21]=f.detail.value,s[22]=f.warp.value,s[23]=f.glow.value,s[24]=f.exposure.value,s[25]=h,s[26]=r.maxSteps,s[27]=r.stepMul,lt(s,n.basisOverride??nt()),s[56]=n.axisAmps[0],s[57]=n.axisAmps[1],s[58]=n.axisAmps[2],s[59]=n.axisAmps[3],s[60]=n.axisAmps[4],s[61]=n.alpha0,s[62]=8,s[63]=.7853981633974483,s[64]=n.pairAmps[0],s[65]=n.pairAmps[1],s[66]=n.pairAmps[2],s[67]=n.pairAmps[3],s[68]=n.pairAmps[4],s[69]=n.pairAmps[5],s[70]=n.pairAmps[6],s[71]=n.pairAmps[7],s[72]=n.pairAmps[8],s[73]=n.pairAmps[9],s[74]=0,s[75]=0;const u=Math.max(0,Math.min(3,Math.round(f.detail.value-1))),m=n.detailTier!==null?n.detailTier:Math.min(u,r.detailMax);s[76]=m,s[77]=n.presetId??te,s[78]=X,s[79]=Z,e.device.queue.writeBuffer(e.uniformBuffer,0,s),a-ye>250&&(ye=a,H.textContent=`Live compute · ${r.label} · ${Math.round(de)} FPS`),Ke.textContent=`x ${g.position[0].toFixed(1)} y ${g.position[1].toFixed(1)} z ${g.position[2].toFixed(1)} w ${V.toFixed(2)} t ${G.toFixed(1)} ${ct()} · P ${ue[n.presetId??te]} ${e.outputWidth}x${e.outputHeight}`}function nt(){const t=["x","y","z","t","w"].map(i=>{const o=[0,0,0,0,0];return o[v[i]]=1,o}),a=f.tilt.value,r=f.spin.value;return(Math.abs(a)>1e-4||Math.abs(r)>1e-4)&&(F(t,0,3,a*.84+r*.2),F(t,1,4,a*.68-r*.31),F(t,2,3,a*.53+r*.17),F(t,0,4,a*.37-r*.13),F(t,1,2,a*.24+r*.29)),t}function F(e,t,a,r){const i=Math.sin(r),o=Math.cos(r);for(const c of e){const h=c[t],s=c[a];c[t]=o*h-i*s,c[a]=i*h+o*s}}function lt(e,t){for(let r=0;r<5;r+=1){const i=28+r*4;e[i]=t[r][0],e[i+1]=t[r][1],e[i+2]=t[r][2],e[i+3]=t[r][3]}e[48]=t[0][4],e[49]=t[1][4],e[50]=t[2][4],e[51]=t[3][4],e[52]=t[4][4],e[53]=0,e[54]=0,e[55]=0}function ct(){return`X${C[v.x]} Y${C[v.y]} Z${C[v.z]} T${C[v.t]} W${C[v.w]}`}const Te=256,De=3e3,fe={feed:.055,kill:.062,dA:1,dB:.5,dt:1},Ae=`rd-v5cpu-${Te}-${De}-${fe.feed}-${fe.kill}`;function Le(){return new Promise((e,t)=>{const a=indexedDB.open("cc4d-rd",1);a.onupgradeneeded=()=>a.result.createObjectStore("rd"),a.onsuccess=()=>e(a.result),a.onerror=()=>t(a.error)})}async function dt(e){try{const t=await Le();return await new Promise((a,r)=>{const i=t.transaction("rd","readonly").objectStore("rd").get(e);i.onsuccess=()=>a(i.result||null),i.onerror=()=>r(i.error)})}catch{return null}}async function pt(e,t){try{const a=await Le();await new Promise((r,i)=>{const o=a.transaction("rd","readwrite");o.objectStore("rd").put(t,e),o.oncomplete=r,o.onerror=()=>i(o.error)})}catch{}}async function ft(e,t){const a=Te,r=await dt(Ae);let i;r&&r.length===a*a?(i=r,t&&(t.textContent="Live compute · RD cached")):(t&&(t.textContent="Baking reaction-diffusion…"),i=await ut(e,a),await pt(Ae,i));const o=e.createTexture({size:[a,a],format:"r8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return e.queue.writeTexture({texture:o},i,{bytesPerRow:a,rowsPerImage:a},[a,a,1]),o}async function ut(e,t){const{feed:a,kill:r,dA:i,dB:o,dt:c}=fe,h=t*t,s=p=>p-Math.floor(p);let u=new Float32Array(h),m=new Float32Array(h);u.fill(1);for(let p=0;p<t;p+=1)for(let x=0;x<t;x+=1)s(Math.sin(x*12.9898+p*78.233)*43758.5453)<.12&&(u[p*t+x]=0,m[p*t+x]=1);let b=new Float32Array(h),A=new Float32Array(h);const N=p=>(p+t)%t;for(let p=0;p<De;p+=1){for(let k=0;k<t;k+=1){const P=N(k-1)*t,M=N(k+1)*t,B=k*t;for(let _=0;_<t;_+=1){const T=N(_-1),D=N(_+1),Y=u[B+_],I=m[B+_],Ue=-Y+.2*(u[B+T]+u[B+D]+u[P+_]+u[M+_])+.05*(u[P+T]+u[P+D]+u[M+T]+u[M+D]),Oe=-I+.2*(m[B+T]+m[B+D]+m[P+_]+m[M+_])+.05*(m[P+T]+m[P+D]+m[M+T]+m[M+D]),ve=Y*I*I;let ie=Y+c*(i*Ue-ve+a*(1-Y)),oe=I+c*(o*Oe+ve-(r+a)*I);b[B+_]=ie<0?0:ie>1?1:ie,A[B+_]=oe<0?0:oe>1?1:oe}}const x=u;u=b,b=x;const E=m;m=A,A=E,p%200===0&&await new Promise(k=>setTimeout(k,0))}let R=0;for(let p=0;p<h;p+=1)R+=m[p];R/=h;const j=new Uint8Array(h);for(let p=0;p<h;p+=1){const x=(m[p]-R+.5)*255;j[p]=x<0?0:x>255?255:Math.round(x)}return j}async function mt(e,t){const a=Qe.getContext("webgpu");a.configure({device:e,format:t,alphaMode:"premultiplied"});const r=e.createShaderModule({code:We}),i=e.createShaderModule({code:$e}),o=await e.createComputePipelineAsync({layout:"auto",compute:{module:r,entryPoint:"bake"}}),c=await e.createRenderPipelineAsync({layout:"auto",vertex:{module:i,entryPoint:"vs"},fragment:{module:i,entryPoint:"fs",targets:[{format:t}]},primitive:{topology:"triangle-list"}}),h=e.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),u=e.createSampler({magFilter:"nearest",minFilter:"nearest"});l.context=a,l.bakePipeline=o,l.displayPipeline=c,l.bakeUniformBuffer=h,l.displayUniformBuffer=s,l.heatSampler=u,Ve(e),l.initialized=!0}function Ve(e){var a;const t=l.resolution;(a=l.heatTex)==null||a.destroy(),l.heatTex=e.createTexture({size:[t,t],format:"rgba16float",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING}),l.heatTexView=l.heatTex.createView(),l.bakeBindGroup=e.createBindGroup({layout:l.bakePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:y.uniformBuffer}},{binding:1,resource:{buffer:l.bakeUniformBuffer}},{binding:2,resource:l.heatTexView},{binding:3,resource:y.rdTexture.createView()},{binding:4,resource:y.rdSampler}]}),l.displayBindGroup=e.createBindGroup({layout:l.displayPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:l.heatSampler},{binding:1,resource:l.heatTexView},{binding:2,resource:{buffer:l.displayUniformBuffer}}]})}function ht(e){if(!l.initialized||!l.enabled)return;const t=l.resolution,a=f.hidden.input,r=-8,i=8,o=Number(a.min??-8),c=Number(a.max??8),h=4,s=3,u=new ArrayBuffer(48),m=new Uint32Array(u),b=new Float32Array(u);m[0]=t,m[1]=t,m[2]=h,m[3]=0,b[4]=r,b[5]=i,b[6]=o,b[7]=c,b[8]=s,b[9]=0,b[10]=0,b[11]=0,e.queue.writeBuffer(l.bakeUniformBuffer,0,u);const A=i-r,R=(((G-r)%A+A)%A+r-r)/A,j=(V-o)/(c-o),p=new Float32Array([R,j,t,t,1,8,12,0]);e.queue.writeBuffer(l.displayUniformBuffer,0,p);const x=e.createCommandEncoder(),E=x.beginComputePass();E.setPipeline(l.bakePipeline),E.setBindGroup(0,l.bakeBindGroup),E.dispatchWorkgroups(Math.ceil(t/8),Math.ceil(t/8)),E.end();const k=l.context.getCurrentTexture().createView(),P=x.beginRenderPass({colorAttachments:[{view:k,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});P.setPipeline(l.displayPipeline),P.setBindGroup(0,l.displayBindGroup),P.draw(3),P.end(),e.queue.submit([x.finish()])}function gt(e){if(!e.outputTexture)return;const t=e.device.createCommandEncoder(),a=t.beginComputePass();a.setPipeline(e.computePipeline),a.setBindGroup(0,e.computeBindGroup),a.dispatchWorkgroups(Math.ceil(e.outputWidth/8),Math.ceil(e.outputHeight/8)),a.end();const r=t.beginRenderPass({colorAttachments:[{view:e.context.getCurrentTexture().createView(),clearValue:{r:.02,g:.022,b:.024,a:1},loadOp:"clear",storeOp:"store"}]});r.setPipeline(e.renderPipeline),r.setBindGroup(0,e.renderBindGroup),r.draw(3),r.end(),e.device.queue.submit([t.finish()]),ht(e.device)}function Ne(){const e=Math.cos(g.pitch),t=Math.sin(g.pitch),a=Math.sin(g.yaw),r=Math.cos(g.yaw),i=ee([a*e,t,-r*e]),o=ee([r,0,a]),c=ee(bt(o,i));return{forward:i,right:o,up:c}}function Re(e){return Math.hypot(e[0],e[1],e[2])}function ee(e){const t=Re(e)||1;return[e[0]/t,e[1]/t,e[2]/t]}function vt(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function U(e,t,a){e[0]+=t[0]*a,e[1]+=t[1]*a,e[2]+=t[2]*a}function bt(e,t){return[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]]}function Ie(e,t,a){return Math.min(a,Math.max(t,e))}function Fe(){var e;(e=S.requestPointerLock)==null||e.call(S)}et();for(const e of ze)e.addEventListener("click",()=>ge(e.dataset.quality));for(const e of ke)e.addEventListener("click",()=>at(e.dataset.preset));f.tilt.input.addEventListener("input",()=>$());f.spin.input.addEventListener("input",()=>$());S.addEventListener("click",Fe);qe.addEventListener("click",Fe);document.addEventListener("pointerlockchange",()=>{const e=document.pointerLockElement===S;qe.textContent=e?"Live":"Engage"});document.addEventListener("mousemove",e=>{if(document.pointerLockElement!==S)return;const t=.0022;g.yaw+=e.movementX*t,g.pitch=Ie(g.pitch-e.movementY*t,-1.48,1.48)});document.addEventListener("keydown",e=>{w.add(e.code),["Space","PageUp","PageDown","ControlLeft","ControlRight"].includes(e.code)&&e.preventDefault();const t={Digit1:0,Digit2:1,Digit3:2,Digit4:3,Digit5:4,Digit6:5,Digit7:6,Digit8:7,Digit9:8,Digit0:9,Numpad1:0,Numpad2:1,Numpad3:2,Numpad4:3,Numpad5:4,Numpad6:5,Numpad7:6,Numpad8:7,Numpad9:8,Numpad0:9};t.hasOwnProperty(e.code)&&(Ce(t[e.code]),e.preventDefault())});document.addEventListener("keyup",e=>{w.delete(e.code)});f.hidden.input.addEventListener("input",()=>{z=f.hidden.value});ge(se);$("space");const K=document.querySelector("#richLook");K&&(K.checked=le,K.addEventListener("change",()=>{le=K.checked}));const Q=document.querySelector("#lighting");Q&&(Q.checked=ce,Q.addEventListener("change",()=>{ce=Q.checked}));He();window.__cc4dTest&&ae[se]&&(window.__cc4dTest.setQuality=e=>{ae[e]&&ge(e)});xe.addEventListener("change",()=>{l.resolution=Number(xe.value),y&&Ve(y.device)});ne.addEventListener("change",()=>{l.enabled=ne.checked,Je.hidden=!ne.checked});he();rt();st().catch(e=>{console.error(e),J(e.message||"The renderer failed to initialize.")});
