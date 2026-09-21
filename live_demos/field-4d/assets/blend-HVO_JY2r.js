import"./mode-switch-KVTmJce4.js";import"./whats-new-BGrxnqJH.js";const j=[{w:0,species:0,phase:0,tint:[.16,.88,.95]},{w:6,species:1,phase:2.1,tint:[1,.62,.3]},{w:-6,species:1,phase:4.7,tint:[1,.62,.3]}],et=2.5,X=t=>t.toFixed(1),ht=`const DR_N: i32 = ${j.length};
const DR_TWR: f32 = ${X(et)};
// Per-drifter: (w0 anchor, species [0 = jellyfish, 1 = eel], phase, _) -- generated from DRIFTERS.
fn drifterParams(i: i32) -> vec4f {
${j.slice(1).map((t,e)=>`  if (i == ${e+1}) { return vec4f(${X(t.w)}, ${X(t.species)}, ${X(t.phase)}, 0.0); }`).join(`
`)}
  return vec4f(${X(j[0].w)}, ${X(j[0].species)}, ${X(j[0].phase)}, 0.0);
}`,tt=`
const OMEGA: f32 = 0.7853981634;   // 2*pi / 8 (field period L = 8)

fn shearCoord(abcd: vec4f, e: f32) -> Coord5 {
  // Fixed shear: feed depth + the swept dims into the lateral coords so no axis-aligned
  // view is degenerate, and the medium gets slow life from the time/hidden terms.
  let sx = abcd.x + 0.40 * abcd.z + 0.15 * abcd.w;
  let sy = abcd.y - 0.30 * abcd.z + 0.15 * e;
  return Coord5(vec4f(sx, sy, abcd.z, abcd.w), e);
}
fn blendCoordAt(pos: vec3f, t: f32, w: f32) -> Coord5 {
  let abcd = params.basisX * pos.x + params.basisY * pos.y + params.basisZ * pos.z
           + params.basisT * t + params.basisW * w;
  let e = params.basisE.x * pos.x + params.basisE.y * pos.y + params.basisE.z * pos.z
        + params.basisE.w * t + params.basisMeta.x * w;
  return shearCoord(abcd, e);
}
fn blendCoord(pos: vec3f) -> Coord5 { return blendCoordAt(pos, params.time, params.hidden); }

// Each style is a SPARSE 3D function of the spatial coordinate trio (abcd.xyz) so it
// shows lateral screen structure no matter which axis weights it onto the view (a style
// using only depth/swept coords renders as flat fog). Small abcd.w phase = slow life.
// (Squares use x*x, not pow(x,2): WGSL pow is NaN for negative x.)
// A — cellular caverns: isolated 3D pockets.
fn styleA(c: Coord5) -> f32 {
  let wx = sin(OMEGA * c.abcd.x + 0.3 * c.abcd.w);
  let wy = sin(OMEGA * c.abcd.y + 1.3);
  let wz = sin(OMEGA * c.abcd.z + 2.6);
  let cell = exp(-1.8 * (wx * wx + wy * wy + wz * wz));
  return smoothstep(0.10, 0.55, cell);
}
// B — ridged canyons: warped striations across the lateral plane.
fn styleB(c: Coord5) -> f32 {
  let r = abs(sin(OMEGA * c.abcd.x + 0.6 * sin(OMEGA * c.abcd.z) + 0.4 * c.abcd.y));
  return smoothstep(0.80, 1.0, 1.0 - r);
}
// C — crystal lattice: 3D cubic harmonic cells.
fn styleC(c: Coord5) -> f32 {
  let h = cos(OMEGA * c.abcd.x) + cos(OMEGA * c.abcd.y) + cos(OMEGA * c.abcd.z + 0.2 * c.abcd.w);
  return smoothstep(1.25, 2.45, h);
}
// D — soft nebula: 3D fbm clouds with gaps.
fn styleD(c: Coord5) -> f32 {
  var f = 0.0; var amp = 0.55; var fr = 1.0;
  for (var i = 0; i < 4; i = i + 1) {
    f += amp * sin(OMEGA * fr * c.abcd.x + 1.3 * f32(i)) * cos(OMEGA * fr * c.abcd.y - 0.7 * f32(i)) * cos(OMEGA * fr * c.abcd.z * 0.8 + f32(i));
    amp *= 0.55; fr *= 1.9;
  }
  return smoothstep(0.02, 0.5, f);
}
// E — flow filaments: 1D threads winding through 3D.
fn styleE(c: Coord5) -> f32 {
  let a = sin(OMEGA * c.abcd.y + 0.7 * sin(OMEGA * c.abcd.z));
  let b = sin(OMEGA * c.abcd.x * 0.8 + 0.7 * cos(OMEGA * c.abcd.z + 0.3 * c.abcd.w));
  let thread = (1.0 - abs(a)) * (1.0 - abs(b));
  return pow(max(0.0, thread), 2.0);
}

// ---- Distinct 3D structures ----
// 5 - gyroid / TPMS shell: interwoven channels (bright near the g=0 surface).
fn gen5(c: Coord5) -> f32 {
  let g = sin(OMEGA * c.abcd.x) * cos(OMEGA * c.abcd.y) + sin(OMEGA * c.abcd.y) * cos(OMEGA * c.abcd.z) + sin(OMEGA * c.abcd.z) * cos(OMEGA * c.abcd.x);
  return smoothstep(0.5, 0.07, abs(g));
}
// 6 - voronoi foam: 3D F1 cells (bright near cell centers).
// Local cell hash (identical body to blend.js hash13, distinct name) so blendFieldWGSL
// is self-contained -- it is interpolated into BOTH the render module (which already
// defines hash13) and the heatmap bake module (which does not); a private name avoids
// a redefinition in the former while resolving the reference in the latter.
fn hashFoam(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn gen6(c: Coord5) -> f32 {
  let p = vec3f(c.abcd.x, c.abcd.y, c.abcd.z) * 0.45;
  let ip = floor(p); let fp = p - ip;
  var d1 = 9.0;
  for (var k = -1; k <= 1; k = k + 1) {
    for (var j = -1; j <= 1; j = j + 1) {
      for (var i = -1; i <= 1; i = i + 1) {
        let g = vec3f(f32(i), f32(j), f32(k));
        let o = vec3f(hashFoam(ip + g), hashFoam(ip + g + 19.7), hashFoam(ip + g + 43.3));
        let r = g + o - fp;
        d1 = min(d1, dot(r, r));
      }
    }
  }
  return smoothstep(0.25, 0.04, sqrt(d1));
}
// 7 - layered strata: warped sedimentary bands across Y.
fn gen7(c: Coord5) -> f32 {
  let warp = 0.7 * sin(OMEGA * 0.5 * c.abcd.x) + 0.5 * sin(OMEGA * 0.4 * c.abcd.z + 1.0);
  let layer = sin(OMEGA * 1.4 * c.abcd.y + warp);
  return smoothstep(0.80, 0.985, abs(layer));
}
// 8 - hex-prism lattice: hexagonal columns in X-Z, capped along Y.
fn gen8(c: Coord5) -> f32 {
  let qx = OMEGA * 0.7 * c.abcd.x; let qy = OMEGA * 0.7 * c.abcd.z;
  let h = cos(qx) + cos(0.5 * qx + 0.8660254 * qy) + cos(0.5 * qx - 0.8660254 * qy);
  let col = smoothstep(1.7, 2.78, h);
  let cap = 0.55 + 0.45 * sin(OMEGA * c.abcd.y);
  return col * cap;
}
// 9 - turbulent veins: thin bright veins at the abs-fbm creases.
fn gen9(c: Coord5) -> f32 {
  var f = 0.0; var amp = 0.5; var fr = 1.0;
  for (var i = 0; i < 4; i = i + 1) {
    let v = sin(OMEGA * fr * c.abcd.x + 1.0 * f32(i)) * cos(OMEGA * fr * c.abcd.z - 0.5 * f32(i)) + sin(OMEGA * fr * c.abcd.y * 1.1 + f32(i));
    f = f + amp * abs(v); amp = amp * 0.5; fr = fr * 2.0;
  }
  return smoothstep(0.45, 0.04, f);
}
// ---- 2D-lifted (a 2D pattern on a coord pair + a perpendicular term so it is not flat) ----
// 10 - concentric ripples on (X,Y), shifted in depth by Z.
fn gen10(c: Coord5) -> f32 {
  let r = length(vec2f(c.abcd.x, c.abcd.y));
  let rings = sin(OMEGA * 1.3 * r - 0.4 * c.abcd.z);
  let perp = 0.45 + 0.55 * sin(OMEGA * 0.7 * c.abcd.z);
  return smoothstep(0.80, 0.98, abs(rings)) * perp;
}
// 11 - woven basket: interleaved warp/weft threads on (X,Z), broken along Y.
fn gen11(c: Coord5) -> f32 {
  let u = OMEGA * c.abcd.x; let v = OMEGA * c.abcd.z;
  let warp = abs(sin(u)) * (0.5 + 0.5 * sin(v * 0.5));
  let weft = abs(sin(v)) * (0.5 + 0.5 * sin(u * 0.5 + OMEGA * c.abcd.y));
  return smoothstep(0.72, 0.97, max(warp, weft));
}
// 12 - spiral arms on (X,Y), twisted in depth by Z, center faded.
fn gen12(c: Coord5) -> f32 {
  let r = length(vec2f(c.abcd.x, c.abcd.y));
  let ang = atan2(c.abcd.y, c.abcd.x);
  let arms = sin(3.0 * ang + OMEGA * 1.6 * r + 0.3 * c.abcd.z);
  return smoothstep(0.72, 0.97, abs(arms)) * smoothstep(0.2, 1.8, r);
}
// ---- Role-permutation 5D (a swept dim is used as a structural axis) ----
// 13 - gyroid using W (hidden) as the 3rd structural axis: structure morphs as W scrubs.
fn gen13(c: Coord5) -> f32 {
  let g = sin(OMEGA * c.abcd.x) * cos(OMEGA * c.abcd.y) + sin(OMEGA * c.abcd.y) * cos(OMEGA * c.abcd.w) + sin(OMEGA * c.abcd.w) * cos(OMEGA * c.abcd.x);
  return smoothstep(0.5, 0.07, abs(g));
}
// 14 - crystal lattice using E as the 3rd structural axis: structure evolves with E.
fn gen14(c: Coord5) -> f32 {
  let h = cos(OMEGA * c.abcd.x) + cos(OMEGA * c.abcd.z) + cos(OMEGA * c.e + 0.2 * c.abcd.y);
  return smoothstep(1.7, 2.78, h);
}
// Generator library dispatch (no dynamic indexing in WGSL). Entries 0-4 are the
// original styles A-E; 5+ are added in T2. genLib(sel, c) returns that generator.
fn genLib(idx: i32, c: Coord5) -> f32 {
  if (idx == 1) { return styleB(c); }
  if (idx == 2) { return styleC(c); }
  if (idx == 3) { return styleD(c); }
  if (idx == 4) { return styleE(c); }
  if (idx == 5) { return gen5(c); }
  if (idx == 6) { return gen6(c); }
  if (idx == 7) { return gen7(c); }
  if (idx == 8) { return gen8(c); }
  if (idx == 9) { return gen9(c); }
  if (idx == 10) { return gen10(c); }
  if (idx == 11) { return gen11(c); }
  if (idx == 12) { return gen12(c); }
  if (idx == 13) { return gen13(c); }
  if (idx == 14) { return gen14(c); }
  return styleA(c);   // 0 + fallback
}

// Per-generator color identity: each generator carries its own hue so the medium reads
// as distinct materials instead of one scene-wide tint (which averages to grey for any
// multi-axis view). Mostly one analogous cool family + a few warm accents, so convex
// mixes stay harmonious rather than collapsing to mud.
fn genColor(idx: i32) -> vec3f {
  if (idx == 1) { return vec3f(0.88, 0.56, 0.30); }   // B ridged canyons -- sandstone
  if (idx == 2) { return vec3f(0.42, 0.66, 0.98); }   // C crystal lattice -- ice blue
  if (idx == 3) { return vec3f(0.58, 0.46, 0.88); }   // D soft nebula -- dusty violet
  if (idx == 4) { return vec3f(0.34, 0.88, 0.60); }   // E flow filaments -- mint
  if (idx == 5) { return vec3f(0.18, 0.74, 0.88); }   // gyroid -- cyan
  if (idx == 6) { return vec3f(0.92, 0.60, 0.66); }   // voronoi foam -- pale rose
  if (idx == 7) { return vec3f(0.82, 0.44, 0.22); }   // strata -- rust
  if (idx == 8) { return vec3f(0.38, 0.52, 0.86); }   // hex lattice -- steel blue
  if (idx == 9) { return vec3f(0.96, 0.40, 0.18); }   // turbulent veins -- ember
  if (idx == 10) { return vec3f(0.62, 0.54, 0.94); }  // ripples -- lavender
  if (idx == 11) { return vec3f(0.90, 0.72, 0.34); }  // woven basket -- gold
  if (idx == 12) { return vec3f(0.88, 0.34, 0.58); }  // spiral arms -- magenta rose
  if (idx == 13) { return vec3f(0.46, 0.44, 0.98); }  // gyroid-W -- electric indigo
  if (idx == 14) { return vec3f(0.52, 0.86, 0.36); }  // lattice-E -- spring green
  return vec3f(0.16, 0.62, 0.55);                     // 0 A cellular caverns -- deep teal
}

// Orientation-weighted convex blend of the styles. Weights (wbar) are normalized
// JS-side with the sharpness exponent; near-zero-weight styles are culled.
const TWR: f32 = 6.0;   // t/w localization half-width (wide -> objects mostly visible, gentle fade)
// World + (t,w) anchored heterogeneity mask: full inside R*0.5 spatially AND near (bt,bw),
// fading out by R / TWR. ctr = (x,y,z,R) [R=0 -> off]; btw = (bt,bw,_,_).
fn hetMask(pos: vec3f, t: f32, w: f32, ctr: vec4f, btw: vec4f) -> f32 {
  if (ctr.w < 0.001) { return 1.0; }
  let sFall = 1.0 - smoothstep(ctr.w * 0.5, ctr.w, length(pos - ctr.xyz));
  let tFall = 1.0 - smoothstep(TWR * 0.5, TWR, abs(t - btw.x));
  let wFall = 1.0 - smoothstep(TWR * 0.5, TWR, abs(w - btw.y));
  return sFall * tFall * wFall;
}
// Force field: warp world pos near a 5D-anchored center. ctr=(x,y,z,R) [R=0 off];
// par=(bt, bw, strength, type). type 0 swirl(about Y), 1 pull/push(radial), 2 shear(+X).
fn ffApply(pos: vec3f, t: f32, w: f32, ctr: vec4f, par: vec4f) -> vec3f {
  if (ctr.w < 0.001) { return pos; }
  let d = pos - ctr.xyz;
  let sFall = 1.0 - smoothstep(ctr.w * 0.5, ctr.w, length(d));
  let tFall = 1.0 - smoothstep(TWR * 0.5, TWR, abs(t - par.x));
  let wFall = 1.0 - smoothstep(TWR * 0.5, TWR, abs(w - par.y));
  let amt = sFall * tFall * wFall * par.z;
  let ti = i32(par.w + 0.5);
  if (ti == 0) { let ca = cos(amt); let sa = sin(amt); return ctr.xyz + vec3f(d.x * ca - d.z * sa, d.y, d.x * sa + d.z * ca); }
  if (ti == 1) { return pos + normalize(d + vec3f(0.0001)) * amt; }
  return pos + vec3f(amt, 0.0, 0.0);
}
// Generator blend with per-gen heterogeneity multipliers (hm = A,B,C,D; hmE = E).
// Returns (shaped density, mean color): each generator's contribution carries its
// genColor, and the color channel is the density-weighted mean of the contributors,
// so overlaps blend hues while sparse regions keep their generator's identity.
// dExtra = paletteStack result: (density sum, premultiplied rgb).
fn sampleCoordMasked(c: Coord5, hm: vec4f, hmE: f32, dExtra: vec4f) -> vec4f {
  var d = 0.0;
  var col = vec3f(0.0);
  if (params.styleWeights.x > 0.01) { let g = params.styleWeights.x * genLib(i32(params.styleSel.x + 0.5), c) * hm.x; d += g; col += g * genColor(i32(params.styleSel.x + 0.5)); }
  if (params.styleWeights.y > 0.01) { let g = params.styleWeights.y * genLib(i32(params.styleSel.y + 0.5), c) * hm.y; d += g; col += g * genColor(i32(params.styleSel.y + 0.5)); }
  if (params.styleWeights.z > 0.01) { let g = params.styleWeights.z * genLib(i32(params.styleSel.z + 0.5), c) * hm.z; d += g; col += g * genColor(i32(params.styleSel.z + 0.5)); }
  if (params.styleWeights.w > 0.01) { let g = params.styleWeights.w * genLib(i32(params.styleSel.w + 0.5), c) * hm.w; d += g; col += g * genColor(i32(params.styleSel.w + 0.5)); }
  if (params.styleMeta.x  > 0.01) { let g = params.styleMeta.x  * genLib(i32(params.styleSelMeta.x + 0.5), c) * hmE; d += g; col += g * genColor(i32(params.styleSelMeta.x + 0.5)); }
  d += dExtra.x;
  col += dExtra.yzw;
  let meanCol = col / max(d, 1e-4);
  let dens = pow(clamp(d, 0.0, 1.2), 1.4) * 1.6;
  return vec4f(dens, meanCol);
}
fn sampleCoord(c: Coord5) -> vec4f { return sampleCoordMasked(c, vec4f(1.0), 1.0, vec4f(0.0)); }   // raw (inspector; no stack)
// Stack layers: flat view-independent sum of toggled-on palette generators (weight 0 = off).
// Returns (density sum, premultiplied rgb) so the stack's colors blend into the mean.
fn paletteStack(c: Coord5) -> vec4f {
  var ds = 0.0;
  var cs = vec3f(0.0);
  if (params.paletteA.x > 0.001) { let g = params.paletteA.x * genLib(0, c); ds += g; cs += g * genColor(0); }
  if (params.paletteA.y > 0.001) { let g = params.paletteA.y * genLib(1, c); ds += g; cs += g * genColor(1); }
  if (params.paletteA.z > 0.001) { let g = params.paletteA.z * genLib(2, c); ds += g; cs += g * genColor(2); }
  if (params.paletteA.w > 0.001) { let g = params.paletteA.w * genLib(3, c); ds += g; cs += g * genColor(3); }
  if (params.paletteB.x > 0.001) { let g = params.paletteB.x * genLib(4, c); ds += g; cs += g * genColor(4); }
  if (params.paletteB.y > 0.001) { let g = params.paletteB.y * genLib(5, c); ds += g; cs += g * genColor(5); }
  if (params.paletteB.z > 0.001) { let g = params.paletteB.z * genLib(6, c); ds += g; cs += g * genColor(6); }
  if (params.paletteB.w > 0.001) { let g = params.paletteB.w * genLib(7, c); ds += g; cs += g * genColor(7); }
  if (params.paletteC.x > 0.001) { let g = params.paletteC.x * genLib(8, c); ds += g; cs += g * genColor(8); }
  if (params.paletteC.y > 0.001) { let g = params.paletteC.y * genLib(9, c); ds += g; cs += g * genColor(9); }
  if (params.paletteC.z > 0.001) { let g = params.paletteC.z * genLib(10, c); ds += g; cs += g * genColor(10); }
  if (params.paletteC.w > 0.001) { let g = params.paletteC.w * genLib(11, c); ds += g; cs += g * genColor(11); }
  if (params.paletteD.x > 0.001) { let g = params.paletteD.x * genLib(12, c); ds += g; cs += g * genColor(12); }
  if (params.paletteD.y > 0.001) { let g = params.paletteD.y * genLib(13, c); ds += g; cs += g * genColor(13); }
  if (params.paletteD.z > 0.001) { let g = params.paletteD.z * genLib(14, c); ds += g; cs += g * genColor(14); }
  return vec4f(ds, cs);
}
// Curvature remap (phase 1): radial geodesic warp around the camera. kappa=0 -> identity
// (byte-identical). kappa>0 sphere (compresses toward the antipode), kappa<0 hyperbolic (expands).
fn curvedMap(pos: vec3f) -> vec3f {
  let k = params.spaceMeta.x;
  if (abs(k) < 1e-6) { return pos; }
  let ro = params.camera.xyz;
  let d = pos - ro;
  let r = length(d);
  if (r < 1e-5) { return pos; }
  let s = sqrt(abs(k));
  var f = 1.0;
  if (k > 0.0) { f = sin(s * r) / (s * r); } else { f = sinh(s * r) / (s * r); }
  return ro + d * f;
}
// Ambient flow: a gentle always-on domain warp so the medium churns/breathes IN PLACE as
// time flows -- organic life layered on top of the basis-T structural evolution (moving T
// faster speeds both). A slow divergence-light swirl; smooth in pos and t (no pops), and
// independent of w so it never perturbs the hidden-dimension continuity. Applied to the
// sampling position only -- het-anchored objects use raw pos, so they stay put while the
// medium flows around them.
// Curl noise (Bridson et al., "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007): take the
// curl of a vector potential and the result is divergence-free by construction, so the medium
// swirls like an incompressible fluid. The previous version displaced along a sum of sines
// directly, which has sources and sinks -- it read as inflating and deflating rather than flowing.
//
// The curl is written in CLOSED FORM rather than by finite differences. Differencing would need
// six potential evaluations per sample, tripling both the arithmetic and the inlined code, and
// this shader's compile time is already the binding constraint on the whole mode.
// Potential psi = (a(y,z), b(z,x), c(x,y)), so curl psi has no term that needs the same
// component twice; each partial derivative below is the analytic derivative of one product of
// sines. markerMeta.z is the motion toggle (0 = still medium).
fn ambientFlow(p: vec3f, t: f32) -> vec3f {
  let amt = 0.50 * params.markerMeta.z;
  if (amt < 1e-4) { return p; }
  let f = 0.30;          // spatial frequency of the swirl
  let s = 0.42 * t;      // slow time rate
  let ay = f * p.y + s;         let az = f * 1.3 * p.z - 0.7 * s;
  let bz = f * p.z + 1.1 * s;   let bx = f * 1.3 * p.x - 0.6 * s;
  let cx = f * p.x + 0.9 * s;   let cy = f * 1.3 * p.y - 0.8 * s;
  let fh = f * 1.3;
  let curl = vec3f(
    fh * sin(cx) * cos(cy) - f  * cos(bz) * sin(bx),    // dc/dy - db/dz
    fh * sin(ay) * cos(az) - f  * cos(cx) * sin(cy),    // da/dz - dc/dx
    fh * sin(bz) * cos(bx) - f  * cos(ay) * sin(az));   // db/dx - da/dy
  return p + (amt / (2.3 * f)) * curl;   // 2.3f is the peak curl component, so amt IS the peak displacement (0.50, matching the previous sum-of-sines peak of 0.32*1.6)
}
// ---- Drifter: a 5D-anchored creature -------------------------------------------------------
// The project's thesis made literal. The drifter is anchored at a fixed (t0,w0), so scrubbing T
// or W smoothly materialises/dematerialises it: arriving through a hidden dimension is a
// physical fade, never a pop. It lives in WORLD space (raw pos -- not the basis coords, and not
// the ambient-flow warp), so it stays a coherent body while the medium flows around it.
// Creatures are localised in the HIDDEN axis W and PERSISTENT in time: scrubbing W is a tour of
// inhabitants, each fading smoothly in and out, while time lets them live and swim. (They were
// first written gated on |t - t0| too, which silently made them vanish ~5s after load and never
// return, since simTime only grows -- invisible to tests that pin time to 0.)
${ht}
const DR_BOUND: f32 = 3.6;   // bounding-sphere radius for the perf early-out (body never reaches it)
// Slow closed swim paths, spatially separated so neighbouring inhabitants do not overlap.
fn drifterCenter(i: i32, tt: f32) -> vec3f {
  if (i == 1) { return vec3f(-1.0 + 1.4 * sin(tt * 0.19), 0.5 * sin(tt * 0.23 + 2.0), 4.2 + 1.6 * cos(tt * 0.16)); }
  if (i == 2) { return vec3f( 3.0 + 1.2 * cos(tt * 0.21), -1.4 + 1.0 * sin(tt * 0.18), 3.0 + 1.8 * sin(tt * 0.20)); }
  return vec3f(2.4 * sin(tt * 0.22), 0.7 * sin(tt * 0.17 + 1.0), 3.5 + 2.0 * cos(tt * 0.19));
}

fn drSmin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
fn drCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let pa = p - a; let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
// Jellyfish: a pulsing bell with a hollowed skirt + five swaying tentacles.
fn jellySDF(p: vec3f, tt: f32) -> f32 {
  let pulse = 0.5 + 0.5 * sin(tt * 1.6);
  let bellR = 1.0 + 0.10 * pulse;
  let squash = 0.60 - 0.14 * pulse;                     // the bell flattens as it pulses
  var d = length(vec3f(p.x, p.y / squash, p.z)) - bellR;
  d = max(d, -(length(vec3f(p.x, (p.y + bellR * 0.8) / 0.9, p.z)) - bellR * 0.85));   // hollow the skirt
  for (var i = 0; i < 5; i = i + 1) {
    let a = 6.2831853 * f32(i) / 5.0;
    let ox = cos(a) * 0.5; let oz = sin(a) * 0.5;
    let sway = 0.30 * sin(tt * 1.9 + f32(i) * 1.3);
    d = drSmin(d, drCapsule(p, vec3f(ox, -0.3, oz), vec3f(ox + sway, -2.1 - 0.3 * pulse, oz + sway * 0.6), 0.07), 0.22);
  }
  return d;
}
// Eel: a capsule chain swept by a travelling sine wave, tapering to the tail.
fn eelPoint(u: f32, tt: f32, ph: f32) -> vec3f {
  return vec3f((u - 0.5) * 3.8,
               0.50 * sin(u * 5.5 - tt * 2.3 + ph),    // undulation travels down the body
               0.18 * sin(u * 3.7 - tt * 1.6 + ph));
}
// Body kept thick enough to carry real visual mass -- a thin chain reads as a smudge next to the
// jellyfish's bell. Max extent (1.9 + 0.5 + 0.3) stays inside DR_BOUND so the early-out is safe.
fn eelSDF(p: vec3f, tt: f32, ph: f32) -> f32 {
  var d = 1e9;
  for (var i = 0; i < 7; i = i + 1) {
    let u0 = f32(i) / 7.0;
    d = drSmin(d, drCapsule(p, eelPoint(u0, tt, ph), eelPoint(f32(i + 1) / 7.0, tt, ph), mix(0.30, 0.08, u0)), 0.12);
  }
  return d;
}
fn drifterBody(sp: f32, q: vec3f, tt: f32, ph: f32) -> f32 {
  if (sp < 0.5) { return jellySDF(q, tt); }
  return eelSDF(q, tt, ph);
}
fn drifterColor(sp: f32, tt: f32, qy: f32) -> vec3f {
  if (sp < 0.5) { return mix(vec3f(0.16, 0.88, 0.95), vec3f(0.72, 0.45, 1.00), 0.5 + 0.5 * sin(tt * 0.7 + qy * 0.8)); }
  return mix(vec3f(1.00, 0.62, 0.30), vec3f(1.00, 0.34, 0.55), 0.5 + 0.5 * sin(tt * 0.9 + qy * 1.1));   // eel: amber -> rose
}
// -> (density, rgb). Zero outside the presence window or the bounding sphere; BOTH boundaries
// carry zero amplitude (presence ramps to 0; the body never reaches DR_BOUND), so the early-outs
// stay continuous. Colours are density-weighted where two inhabitants' regions overlap.
fn drifterAt(pos: vec3f, t: f32, w: f32) -> vec4f {
  let engage = params.styleSelMeta.y;              // eased 0..1 toggle, so creatures fade in/out
  if (engage < 0.002) { return vec4f(0.0); }
  // Flat mode only, like the lighting and emissive terms. In sphere mode the march samples the S3
  // embedding (pos*4 and w = 4*P4.w, which satisfy w^2 + |pos|^2 = (4R)^2), so a creature's presence
  // window and its bounding sphere can never both be satisfied -- it was already unreachable there,
  // by accident. Gate it explicitly so the limitation is intentional and visible; creatures come
  // along when flat<->curved is unified.
  if (params.spaceMeta.x > 1e-6) { return vec4f(0.0); }
  var dens = 0.0;
  var colAcc = vec3f(0.0);
  for (var i = 0; i < DR_N; i = i + 1) {
    let P = drifterParams(i);
    let presence = 1.0 - smoothstep(DR_TWR * 0.5, DR_TWR, abs(w - P.x));
    if (presence < 0.002) { continue; }
    let q = pos - drifterCenter(i, t);
    if (dot(q, q) > DR_BOUND * DR_BOUND) { continue; }
    let d = drifterBody(P.y, q, t, P.z);
    let body = smoothstep(0.28, 0.0, d);        // soft-edged body
    let rim = smoothstep(0.50, 0.10, abs(d));   // luminous shell at the surface
    // Kept below the emissive-core threshold's saturation point so each creature reads in its own
    // colour instead of clipping to white; the rim carries the bioluminescent shell.
    let a = (body * 1.05 + rim * 0.45) * presence * engage;
    dens += a;
    colAcc += a * drifterColor(P.y, t, q.y);
  }
  return vec4f(dens, colAcc / max(dens, 1e-4));
}

// Colored light each creature casts INTO the surrounding medium -- its bioluminescence spilling
// onto the fog near it. Summed over active creatures, soft inverse-square falloff from the body
// centre. Returned as additive light; the march multiplies it by the medium's own absorption, so
// only fog NEAR a creature catches the glow (empty space stays dark). Flat mode + presence gated
// exactly like the body, so it is continuous in t/w and absent wherever the creature is.
fn creatureLight(pos: vec3f, t: f32, w: f32) -> vec3f {
  let engage = params.styleSelMeta.y;
  if (engage < 0.002) { return vec3f(0.0); }
  if (params.spaceMeta.x > 1e-6) { return vec3f(0.0); }
  var lit = vec3f(0.0);
  for (var i = 0; i < DR_N; i = i + 1) {
    let P = drifterParams(i);
    let presence = 1.0 - smoothstep(DR_TWR * 0.5, DR_TWR, abs(w - P.x));
    if (presence < 0.002) { continue; }
    let c = drifterCenter(i, t);
    let r2 = dot(pos - c, pos - c);
    let fall = 1.0 / (1.0 + 0.45 * r2);          // soft inverse-square-ish falloff
    lit += drifterColor(P.y, t, pos.y - c.y) * (fall * presence * engage);
  }
  return lit * 0.7;
}

fn sampleFieldRaw(pos: vec3f, t: f32, w: f32) -> vec4f {
  var wp = pos;
  wp = ffApply(wp, t, w, params.ff0a, params.ff0b);
  wp = ffApply(wp, t, w, params.ff1a, params.ff1b);
  wp = ambientFlow(wp, t);
  let c = blendCoordAt(wp, t, w);
  let hm = vec4f(
    hetMask(pos, t, w, params.hetA, params.hetTW0),
    hetMask(pos, t, w, params.hetB, params.hetTW1),
    hetMask(pos, t, w, params.hetC, params.hetTW2),
    hetMask(pos, t, w, params.hetD, params.hetTW3));
  let hmE = hetMask(pos, t, w, params.hetE, params.hetTW4);
  let ds = paletteStack(c);
  let med = sampleCoordMasked(c, hm, hmE, ds);
  let dr = drifterAt(pos, t, w);   // raw world pos: a body, not medium -- unwarped by the ambient flow
  if (dr.x <= 0.0) { return med; }   // no creature here -> EXACTLY the medium (the blend below is only
                                     // algebraically identity for med.x > 1e-4, and this also skips a reciprocal)
  let tot = med.x + dr.x;
  return vec4f(tot, (med.yzw * med.x + dr.yzw * dr.x) / max(tot, 1e-4));   // density-weighted colour blend
}
fn sampleFieldAt(pos: vec3f, t: f32, w: f32) -> vec4f { return sampleFieldRaw(curvedMap(pos), t, w); }
fn sampleField(pos: vec3f) -> vec4f { return sampleFieldAt(pos, params.time, params.hidden); }
`,mt=`
// Params MUST stay byte-identical to the Params struct in blend.js -- the bake binds the
// same uniform buffer (state.uniformBuffer) at binding 0. Reorder/resize one, update both.
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
  basisX: vec4f, basisY: vec4f, basisZ: vec4f, basisT: vec4f, basisW: vec4f,
  basisE: vec4f,
  basisMeta: vec4f,
  styleWeights: vec4f,
  styleMeta: vec4f,
  // ---- mirror of blend.js Params past styleMeta (the bake binds the SAME uniform
  //      buffer; blendFieldWGSL reads styleSel, so it must be declared at the matching
  //      offset; the wall fields are inert padding here, never read by the bake) ----
  wallMeta: vec4f,
  wallTintX: vec4f, wallTintY: vec4f, wallTintZ: vec4f, wallTintT: vec4f, wallTintW: vec4f,
  styleSel: vec4f,
  styleSelMeta: vec4f,
  hetA: vec4f, hetB: vec4f, hetC: vec4f, hetD: vec4f, hetE: vec4f,   // mirror -- bake runs sampleCoord which reads these
  arrowMeta: vec4f, flashMeta: vec4f,   // padding (main-shader only) so hetTW lands at the matching offset
  hetTW0: vec4f, hetTW1: vec4f, hetTW2: vec4f, hetTW3: vec4f, hetTW4: vec4f,   // mirror -- bake reads these in sampleFieldAt
  ff0a: vec4f, ff0b: vec4f, ff1a: vec4f, ff1b: vec4f,   // mirror -- bake warps with these
  markerMeta: vec4f,   // padding (main-shader only) so palette lands at the matching offset
  paletteA: vec4f, paletteB: vec4f, paletteC: vec4f, paletteD: vec4f,   // mirror -- bake reads these in paletteStack
  spaceMeta: vec4f,   // mirror -- bake reads kappa in curvedMap
};
struct Coord5 { abcd: vec4f, e: f32 };
struct HeatParams {
  res: vec2u,
  xyzSamples: u32,
  pad0: u32,
  range: vec4f,      // tMin, tMax, wMin, wMax
  sampleBox: vec4f,  // half-extent, _, _, _
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> heatParams: HeatParams;
@group(0) @binding(2) var heatTex: texture_storage_2d<rgba16float, write>;

${tt}

@compute @workgroup_size(8, 8)
fn bake(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= heatParams.res.x || id.y >= heatParams.res.y) { return; }
  let tNorm = (f32(id.x) + 0.5) / f32(heatParams.res.x);
  let wNorm = (f32(id.y) + 0.5) / f32(heatParams.res.y);
  let t = mix(heatParams.range.x, heatParams.range.y, tNorm);
  let w = mix(heatParams.range.z, heatParams.range.w, wNorm);
  let N = i32(heatParams.xyzSamples);
  let halfBox = heatParams.sampleBox.x;
  var sum = 0.0; var sumSq = 0.0; var prev = 0.0; var gradAccum = 0.0; var count = 0u;
  for (var i = 0; i < N; i = i + 1) {
    for (var j = 0; j < N; j = j + 1) {
      for (var k = 0; k < N; k = k + 1) {
        let fx = (f32(i) + 0.5) / f32(N) - 0.5;
        let fy = (f32(j) + 0.5) / f32(N) - 0.5;
        let fz = (f32(k) + 0.5) / f32(N) - 0.5;
        let pos = vec3f(fx, fy, fz) * (2.0 * halfBox);
        let d = sampleFieldAt(pos, t, w).x;
        sum = sum + d; sumSq = sumSq + d * d;
        if (count > 0u) { gradAccum = gradAccum + abs(d - prev); }
        prev = d; count = count + 1u;
      }
    }
  }
  let mean = sum / f32(count);
  let variance = max(0.0, sumSq / f32(count) - mean * mean);
  let gradMag = gradAccum / max(f32(count - 1u), 1.0);
  textureStore(heatTex, vec2i(i32(id.x), i32(id.y)), vec4f(mean, variance, gradMag, 1.0));
}
`,gt=`
struct DisplayParams {
  crosshair: vec2f,
  texRes: vec2f,
  scale: vec4f,
  markCount: vec4f,           // n active object (t,w) markers, n creature bands, band half-width (norm), _
  marks: array<vec4f, 7>,     // each: (tNorm, wNorm, _, _) in [0,1]
  bands: array<vec4f, 4>,     // creature W bands: (wNorm, r, g, b)
};
@group(0) @binding(0) var heatSampler: sampler;
@group(0) @binding(1) var heatTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> dp: DisplayParams;

struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
  var positions = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  let pos = positions[vi];
  var out: VertexOut;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5);
  return out;
}
@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let sampleUV = vec2f(in.uv.x, 1.0 - in.uv.y);   // W = +Y reads up
  let s = textureSample(heatTex, heatSampler, sampleUV);
  let raw = vec3f(s.r * dp.scale.x, s.g * dp.scale.y, s.b * dp.scale.z);
  let toned = vec3f(1.0) - exp(-max(raw, vec3f(0.0)));
  let lineHalf = 1.5 / dp.texRes.x;
  let cross = dp.crosshair;
  let dx = abs(in.uv.x - cross.x);
  let dy = abs(in.uv.y - (1.0 - cross.y));
  let onV = step(dx, lineHalf);
  let onH = step(dy, lineHalf);
  let onCenter = onV * onH;
  let hColor = vec3f(1.00, 0.62, 0.16);
  let vColor = vec3f(0.30, 0.70, 1.00);
  var color = toned;
  // Creature W bands: each inhabitant lives at a fixed W across ALL time, so on this (t,w) map it
  // is a horizontal band, not a dot. Width = the presence window, so the band shows exactly the W
  // range where that creature can be found -- scrub W onto a band and it materialises. Drawn under
  // the crosshair so the current-position readout stays on top.
  let nBands = i32(dp.markCount.y + 0.5);
  let bandHalf = max(dp.markCount.z, 1e-4);
  for (var bi = 0; bi < nBands; bi = bi + 1) {
    let b = dp.bands[bi];
    let dB = abs(in.uv.y - (1.0 - b.x));
    let fall = 1.0 - smoothstep(0.0, bandHalf, dB);   // soft edges mirror the presence ramp
    let core = 1.0 - smoothstep(0.0, bandHalf * 0.16, dB);
    color = mix(color, b.yzw, clamp(fall, 0.0, 1.0) * 0.30 + clamp(core, 0.0, 1.0) * 0.45);
  }
  color = mix(color, hColor, onH * 0.85);
  color = mix(color, vColor, onV * 0.85);
  color = mix(color, vec3f(1.0), onCenter);
  let edge = step(in.uv.x, 0.02) + step(0.98, in.uv.x) + step(in.uv.y, 0.02) + step(0.98, in.uv.y);
  let withEdge = mix(color, vec3f(0.85, 0.85, 0.92), clamp(edge, 0.0, 1.0) * 0.6);
  var outc = withEdge;
  let nMarks = i32(dp.markCount.x + 0.5);
  for (var mi = 0; mi < nMarks; mi = mi + 1) {
    let m = dp.marks[mi];
    let dm = length((in.uv - vec2f(m.x, 1.0 - m.y)) * dp.texRes);
    let dot = 1.0 - smoothstep(2.0, 3.4, abs(dm - 4.0));
    outc = mix(outc, vec3f(1.0, 1.0, 1.0), clamp(dot, 0.0, 1.0) * 0.9);
  }
  return vec4f(outc, 1.0);
}
`,vt=`
struct Params {
  resolution: vec2f,
  time: f32,
  hidden: f32,
  camera: vec4f,
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  controls: vec4f,    // density, glow, depthTintStrength, depthAxis
  grade: vec4f,       // exposure, focal, maxSteps, stepMul
  basisX: vec4f, basisY: vec4f, basisZ: vec4f, basisT: vec4f, basisW: vec4f,
  basisE: vec4f,      // E component of the X,Y,Z,T columns
  basisMeta: vec4f,   // E component of the W column, _, _, _
  styleWeights: vec4f, // normalized wbar for A,B,C,D
  styleMeta: vec4f,    // wbar E, tintR, tintG, tintB
  // NOTE: floats 0-63 (resolution..styleMeta) are mirrored by blend-heatmap.js Params
  // on the SAME uniform buffer -- only ever APPEND new fields past this line.
  wallMeta: vec4f,     // viewWalls enabled, R, frameW, _
  wallTintX: vec4f,    // -X wall style tint (rgb), _
  wallTintY: vec4f,    // -Y wall style tint (rgb), _
  wallTintZ: vec4f,    // -Z wall style tint (rgb), _
  wallTintT: vec4f,    // -T slot-axis style tint (rgb), _
  wallTintW: vec4f,    // -W slot-axis style tint (rgb), _
  styleSel: vec4f,      // generator index for axes A,B,C,D
  styleSelMeta: vec4f,  // generator index for axis E, drifter engage, colour-identity, atmosphere   (spare slots -- no struct growth, and the heatmap mirror already covers this field)
  hetA: vec4f, hetB: vec4f, hetC: vec4f, hetD: vec4f, hetE: vec4f,   // per-gen blob: WORLD center.xyz, radius (0 = off)
  arrowMeta: vec4f,   // showAxes, length, thickness, _
  flashMeta: vec4f,   // flashOn, cosHalfAngle, reach, darkMode
  hetTW0: vec4f, hetTW1: vec4f, hetTW2: vec4f, hetTW3: vec4f, hetTW4: vec4f,   // per-blob bt, bw, _, _
  ff0a: vec4f, ff0b: vec4f, ff1a: vec4f, ff1b: vec4f,   // force field: (x,y,z,R) and (bt,bw,strength,type)
  markerMeta: vec4f,   // showMarkers, lighting look, motion look, _
  paletteA: vec4f, paletteB: vec4f, paletteC: vec4f, paletteD: vec4f,   // stack-layer weights gen 0-14 (on?w:0), +1 spare
  spaceMeta: vec4f,   // curvature kappa, wFold (phase 3), wRot (phase 3), _
  cam4R: vec4f, cam4U: vec4f, cam4F: vec4f, cam4P: vec4f,   // 4-D geodesic camera frame (sphere); |cam4P| = R
};
struct Coord5 { abcd: vec4f, e: f32 };

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var frame: texture_storage_2d<rgba8unorm, write>;

fn sat(v: f32) -> f32 { return clamp(v, 0.0, 1.0); }
fn hash13(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
// Interleaved gradient noise (Jimenez, "Next Generation Post Processing in Call of Duty", 2014).
// Same one value per pixel as a white-noise hash, but its error spectrum is concentrated in high
// frequencies the eye discounts, so the same number of samples simply looks cleaner. No texture.
fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}
// Henyey-Greenstein phase function (Henyey and Greenstein, 1941): how much light a participating
// medium scatters toward the viewer as a function of the angle between the view ray and the light.
// Normalised so isotropic (g = 0) returns 1.0. Positive g is forward scattering, which is what
// makes real fog glow when you look toward a light and go moody when you look away -- direction
// dependence a surface-style N.L term cannot express, because it only knows about the normal.
fn hgPhase(cosT: f32, g: f32) -> f32 {
  let g2 = g * g;
  let d = max(1.0 + g2 - 2.0 * g * cosT, 1e-4);
  return (1.0 - g2) / pow(d, 1.5);
}

${tt}

// Lightweight density for lighting normals: only the orientation-blended generators
// (the dominant visible structure), skipping paletteStack / het masks / ff warps. This
// keeps the normal's 4 taps cheap -- inlining the FULL sampleField 4x here ballooned the
// shader and pushed compile past 20s. Matches sampleCoordMasked's shaping so the normal
// tracks what the eye reads as structure.
fn densityLite(pos: vec3f) -> f32 {
  let c = blendCoordAt(pos, params.time, params.hidden);
  var d = 0.0;
  if (params.styleWeights.x > 0.01) { d += params.styleWeights.x * genLib(i32(params.styleSel.x + 0.5), c); }
  if (params.styleWeights.y > 0.01) { d += params.styleWeights.y * genLib(i32(params.styleSel.y + 0.5), c); }
  if (params.styleWeights.z > 0.01) { d += params.styleWeights.z * genLib(i32(params.styleSel.z + 0.5), c); }
  if (params.styleWeights.w > 0.01) { d += params.styleWeights.w * genLib(i32(params.styleSel.w + 0.5), c); }
  if (params.styleMeta.x  > 0.01) { d += params.styleMeta.x  * genLib(i32(params.styleSelMeta.x + 0.5), c); }
  return pow(clamp(d, 0.0, 1.2), 1.4) * 1.6;
}
// Tetrahedral gradient of densityLite (toward INCREASING density; outward normal is
// -normalize(this)). Returned UNNORMALIZED so the caller can gauge reliability from |g|
// and fade lighting toward neutral where the gradient is near-zero (flats / critical
// points / palette-dominated views) instead of snapping the normal -- no lit-crease pop.
// A large epsilon (0.35, ~one march step) averages over the C0 kinks in abs/min generators.
fn fieldGrad(pos: vec3f) -> vec3f {
  let e = vec2f(1.0, -1.0) * 0.35;
  return e.xyy * densityLite(pos + e.xyy)
       + e.yyx * densityLite(pos + e.yyx)
       + e.yxy * densityLite(pos + e.yxy)
       + e.xxx * densityLite(pos + e.xxx);
}

// Orthographic secondary march of the medium from start along dir for depth,
// reduced step budget -- this is one wall's per-axis view of the medium.
fn wallMarch(start: vec3f, dir: vec3f, depth: f32) -> vec3f {
  var travel = 0.0;
  var color = vec3f(0.0);
  var alpha = 0.0;
  let stp = depth / 48.0;
  for (var i = 0; i < 48; i = i + 1) {
    if (alpha > 0.98 || travel > depth) { break; }
    let pos = start + dir * travel;
    let si = sampleField(pos);
    let density = si.x;
    let absorb = 1.0 - exp(-density * params.controls.x * 2.8 * stp);
    let trans = 1.0 - alpha;
    let shade = si.yzw * (0.18 + 1.5 * density);   // si.yzw = the field's own per-generator color
    color = color + trans * absorb * shade;
    alpha = alpha + trans * absorb;
    travel = travel + stp;
  }
  return color + (1.0 - alpha) * vec3f(0.02, 0.02, 0.028);   // dark wall base behind the medium
}

// Nearest negative-face wall hit -> (rgb, t); .w < 0 means no wall hit.
fn wallAt(ro: vec3f, rd: vec3f, R: f32, frameW: f32) -> vec4f {
  var bestT = 1e9;
  var col = vec3f(0.0);
  // -X wall (plane x = -R, normal +X, in-plane y,z, tint X)
  if (abs(rd.x) > 1e-5) {
    let t = (-R - ro.x) / rd.x;
    if (t > 0.0 && t < bestT) {
      let H = ro + rd * t;
      if (abs(H.y) <= R && abs(H.z) <= R) {
        bestT = t;
        var c = wallMarch(H, vec3f(1.0, 0.0, 0.0), 2.0 * R);
        if (abs(H.y) > R - frameW || abs(H.z) > R - frameW) { c = params.wallTintX.rgb; }
        col = c;
      }
    }
  }
  // -Y wall (plane y = -R, normal +Y, in-plane x,z, tint Y)
  if (abs(rd.y) > 1e-5) {
    let t = (-R - ro.y) / rd.y;
    if (t > 0.0 && t < bestT) {
      let H = ro + rd * t;
      if (abs(H.x) <= R && abs(H.z) <= R) {
        bestT = t;
        var c = wallMarch(H, vec3f(0.0, 1.0, 0.0), 2.0 * R);
        if (abs(H.x) > R - frameW || abs(H.z) > R - frameW) { c = params.wallTintY.rgb; }
        col = c;
      }
    }
  }
  // -Z wall (plane z = -R, normal +Z, in-plane x,y, tint Z)
  if (abs(rd.z) > 1e-5) {
    let t = (-R - ro.z) / rd.z;
    if (t > 0.0 && t < bestT) {
      let H = ro + rd * t;
      if (abs(H.x) <= R && abs(H.y) <= R) {
        bestT = t;
        var c = wallMarch(H, vec3f(0.0, 0.0, 1.0), 2.0 * R);
        if (abs(H.x) > R - frameW || abs(H.y) > R - frameW) { c = params.wallTintZ.rgb; }
        col = c;
      }
    }
  }
  if (bestT > 1e8) { return vec4f(0.0, 0.0, 0.0, -1.0); }
  return vec4f(col, bestT);
}

fn background(ro: vec3f, rd: vec3f) -> vec3f {
  let horizon = pow(sat(0.5 + 0.5 * rd.y), 1.6);
  let base = mix(vec3f(0.010, 0.013, 0.017), vec3f(0.030, 0.025, 0.045), horizon);
  let star = step(0.9975, hash13(floor(rd * 180.0)));
  let sky = base + vec3f(star) * 0.45;
  if (params.wallMeta.x > 0.5) {
    let w = wallAt(ro, rd, params.wallMeta.y, params.wallMeta.z);
    if (w.w >= 0.0) { return w.rgb; }
  }
  return sky;
}

fn wallTintFor(axis: i32) -> vec3f {
  if (axis == 0) { return params.wallTintX.rgb; }
  if (axis == 1) { return params.wallTintY.rgb; }
  if (axis == 2) { return params.wallTintZ.rgb; }
  if (axis == 3) { return params.wallTintT.rgb; }
  return params.wallTintW.rgb;
}
// Orthographic view down any axis k (0=X,1=Y,2=Z,3=T,4=W): lateral plane = X/Y,
// depth = that axis's basis column. Spatial k<=2 reproduce the world-ortho views
// byte-identically; T/W march their column centred on the current time/hidden.
fn orthoView(k: i32, a: f32, b: f32, R: f32) -> vec3f {
  var color = vec3f(0.0); var alpha = 0.0;
  let stp = (2.0 * R) / 48.0;
  for (var i = 0; i < 48; i = i + 1) {
    if (alpha > 0.98) { break; }
    let dv = R - f32(i) * stp;
    var cx = a; var cy = b; var cz = 0.0; var ct = params.time; var cw = params.hidden;
    if (k == 0) { cx = dv; cz = a; }
    else if (k == 1) { cy = dv; cz = b; }
    else if (k == 2) { cz = dv; }
    else if (k == 3) { ct = params.time + dv; }
    else { cw = params.hidden + dv; }
    let abcd = params.basisX * cx + params.basisY * cy + params.basisZ * cz + params.basisT * ct + params.basisW * cw;
    let e = params.basisE.x * cx + params.basisE.y * cy + params.basisE.z * cz + params.basisE.w * ct + params.basisMeta.x * cw;
    let c = shearCoord(abcd, e);
    let si = sampleCoord(c);
    let density = si.x;
    let absorb = 1.0 - exp(-density * params.controls.x * 2.8 * stp);
    let trans = 1.0 - alpha;
    let shade = si.yzw * (0.18 + 1.5 * density);   // per-generator color
    color = color + trans * absorb * shade;
    alpha = alpha + trans * absorb;
  }
  return color + (1.0 - alpha) * vec3f(0.02, 0.02, 0.028);
}
// Inspector: focused axis fills the main region; a filmstrip of all 5 axis thumbs runs
// along the screen top (uv.y > stripTop; the present pass flips Y, so high uv.y = top).
fn inspectorPixel(uv: vec2f, aspect: f32) -> vec3f {
  let R = max(params.wallMeta.y, 1.0);
  let focus = i32(params.up.w + 0.5);
  let stripTop = 0.82;
  if (uv.y > stripTop) {
    let cellW = 1.0 / 5.0;
    let axis = clamp(i32(floor(uv.x / cellW)), 0, 4);
    let lu = (uv.x - f32(axis) * cellW) / cellW;
    let lv = (uv.y - stripTop) / (1.0 - stripTop);
    let su = (lu * 2.0 - 1.0) * R;
    let sv = ((1.0 - lv) * 2.0 - 1.0) * R;
    var col = orthoView(axis, su, sv, R);
    let bw = 0.05;
    let onBorder = lu < bw || lu > 1.0 - bw || lv < bw || lv > 1.0 - bw;
    if (onBorder) { col = select(vec3f(0.12, 0.12, 0.14), wallTintFor(axis), axis == focus); }
    return col;
  }
  let mv = uv.y / stripTop;
  let su = (uv.x * 2.0 - 1.0) * aspect * R;
  let sv = ((1.0 - mv) * 2.0 - 1.0) * R;
  return orthoView(focus, su, sv, R);
}

// Closest approach between the camera ray and segment a..b -> (dist, rayDepth, segParam).
fn raySeg(ro: vec3f, rd: vec3f, a: vec3f, b: vec3f) -> vec3f {
  let v = b - a; let w0 = ro - a;
  let aa = dot(rd, rd); let bb = dot(rd, v); let cc = dot(v, v);
  let dq = dot(rd, w0); let eq = dot(v, w0);
  let denom = aa * cc - bb * bb;
  var s = 0.0;
  if (abs(denom) > 1e-6) { s = (aa * eq - bb * dq) / denom; }
  s = clamp(s, 0.0, 1.0);
  let segPt = a + v * s;
  let tRay = max(dot(segPt - ro, rd) / max(aa, 1e-6), 0.0);
  let rayPt = ro + rd * tRay;
  return vec3f(length(rayPt - segPt), tRay, s);
}
fn drawArrow(col: vec3f, ro: vec3f, rd: vec3f, tip: vec3f, tint: vec3f, th: f32) -> vec3f {
  if (length(tip) < 0.05) { return col; }                 // degenerate (swept axis) -> skip
  let r = raySeg(ro, rd, vec3f(0.0), tip);
  if (r.y <= 0.02) { return col; }                        // behind camera
  let w = th * max(r.y, 0.6);                              // constant screen width
  let line = 1.0 - smoothstep(w * 0.5, w, r.x);
  let bright = select(1.0, 1.7, r.z > 0.8);               // brighter near the tip
  return mix(col, clamp(tint * bright, vec3f(0.0), vec3f(1.0)), clamp(line, 0.0, 1.0) * 0.9);
}
fn overlayAxes(col: vec3f, ro: vec3f, rd: vec3f) -> vec3f {
  if (params.arrowMeta.x < 0.5) { return col; }
  let L = params.arrowMeta.y; let th = params.arrowMeta.z;
  var c = col;
  c = drawArrow(c, ro, rd, vec3f(L * 0.7, 0.0, 0.0), vec3f(1.00, 0.45, 0.35), th);        // +X coral
  c = drawArrow(c, ro, rd, vec3f(0.0, L * 0.7, 0.0), vec3f(0.55, 1.00, 0.35), th);        // +Y lime
  c = drawArrow(c, ro, rd, vec3f(0.0, 0.0, L), vec3f(0.30, 0.80, 1.00), th * 1.7);        // +Z cyan (depth, emphasized)
  return c;
}
// Silhouette ring of a sphere (object marker): bright where the ray grazes radius R.
fn markerRing(col: vec3f, ro: vec3f, rd: vec3f, ctr: vec4f, tint: vec3f) -> vec3f {
  if (ctr.w < 0.001) { return col; }
  let oc = ctr.xyz - ro;
  let tca = dot(oc, rd);
  if (tca < 0.05) { return col; }
  let b = length(oc - rd * tca);
  let thick = 0.05 * tca;
  let ring = 1.0 - smoothstep(thick * 0.5, thick, abs(b - ctr.w));
  return mix(col, tint, clamp(ring, 0.0, 1.0) * 0.85);
}
fn overlayMarkers(col: vec3f, ro: vec3f, rd: vec3f) -> vec3f {
  if (params.markerMeta.x < 0.5) { return col; }
  var c = col;
  c = markerRing(c, ro, rd, params.hetA, vec3f(0.08, 0.92, 0.78));
  c = markerRing(c, ro, rd, params.hetB, vec3f(1.00, 0.76, 0.22));
  c = markerRing(c, ro, rd, params.hetC, vec3f(0.55, 0.42, 1.00));
  c = markerRing(c, ro, rd, params.hetD, vec3f(1.00, 0.30, 0.50));
  c = markerRing(c, ro, rd, params.hetE, vec3f(0.45, 1.00, 0.70));
  c = markerRing(c, ro, rd, params.ff0a, vec3f(0.95, 0.95, 1.00));
  c = markerRing(c, ro, rd, params.ff1a, vec3f(0.95, 0.95, 1.00));
  // Creature markers: a ring around each present inhabitant so you can find it (and see one
  // approaching from screen-edge) even when the body is faint. Opacity fades with presence*engage,
  // so a marker dissolves exactly as its creature does -- no pop. Flat mode only, where creatures live.
  if (params.styleSelMeta.y > 0.002 && params.spaceMeta.x <= 1e-6) {
    for (var i = 0; i < DR_N; i = i + 1) {
      let P = drifterParams(i);
      let pres = 1.0 - smoothstep(DR_TWR * 0.5, DR_TWR, abs(params.hidden - P.x));
      let a = pres * params.styleSelMeta.y;
      if (a < 0.01) { continue; }
      let ctr = drifterCenter(i, params.time);
      let oc = ctr - ro; let tca = dot(oc, rd);
      if (tca < 0.05) { continue; }
      let b = length(oc - rd * tca);
      let thick = 0.05 * tca;
      let ring = 1.0 - smoothstep(thick * 0.5, thick, abs(b - 2.2));
      c = mix(c, drifterColor(P.y, params.time, 0.0), clamp(ring, 0.0, 1.0) * 0.7 * a);
    }
  }
  return c;
}
fn renderPixel(pixel: vec2u) -> vec3f {
  let p = vec2f(f32(pixel.x), f32(pixel.y)) + vec2f(0.5);
  let uv = p / params.resolution;
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  if (params.forward.w > 0.5) { return inspectorPixel(uv, aspect); }   // view-inspector mode
  let xy = (uv * 2.0 - vec2f(1.0)) * vec2f(aspect, 1.0);
  let localRay = normalize(vec3f(xy, params.grade.y));
  let rd = normalize(params.right.xyz * localRay.x + params.up.xyz * localRay.y + params.forward.xyz * localRay.z);
  let ro = params.camera.xyz;

  var travel = 0.08;
  travel = travel + ign(p) * 0.34 * params.grade.w * params.styleSelMeta.w;   // per-pixel dither (atmosphere): step banding -> fine grain, in a spectrum the eye discounts
  var color = vec3f(0.0);
  var alpha = 0.0;
  let maxSteps = i32(params.grade.z);
  var coneMask = 1.0; var invReach = 0.0;
  if (params.flashMeta.x > 0.5) {
    let cosA = dot(rd, params.forward.xyz);
    coneMask = smoothstep(params.flashMeta.y - 0.06, params.flashMeta.y, cosA);
    invReach = 1.0 / max(params.flashMeta.z, 0.5);
  }
  var marchMax = 50.0;
  let kapM = params.spaceMeta.x;
  if (kapM > 1e-6) { marchMax = 3.14159265 / sqrt(kapM); }   // sphere: stop at the antipode (half the great circle) -- no oscillation/washout
  for (var i = 0; i < 128; i = i + 1) {
    if (alpha > 0.98 || travel > marchMax || i >= maxSteps) { break; }
    var pos: vec3f;
    var si: vec4f;
    let kap = params.spaceMeta.x;
    if (kap > 1e-6) {
      let s = sqrt(kap); let R = 1.0 / s; let ang = travel * s;
      let tang = params.cam4R * localRay.x + params.cam4U * localRay.y + params.cam4F * localRay.z;   // unit 4-D tangent (localRay is normalized)
      let P4 = cos(ang) * params.cam4P + (R * sin(ang)) * tang;
      pos = P4.xyz;
      si = sampleFieldRaw(pos * 4.0, params.time, P4.w * 4.0);
      si.x = si.x * 1.7;
    } else {
      pos = ro + rd * travel;
      si = sampleField(pos);
    }
    let density = si.x;
    let step = params.grade.w * mix(0.34, 0.085, sat(density * 1.8));
    let absorb = 1.0 - exp(-density * params.controls.x * 2.2 * step);   // high enough to commit to near structure, low enough that 2-3 layers still contribute (was 2.8: clipped everything to the front layer and blew out whites)
    let trans = 1.0 - alpha;
    var emis = 0.0;   // dense cores emit (HDR), gated by threshold so only cores glow; glow slider scales it. Flat mode only, like the lighting -- keeps the curved kappa-sweep continuity guard untouched.
    if (kap <= 1e-6) { emis = pow(sat(density * 1.25 - 0.35), 2.0) * params.controls.y * 0.5 * params.markerMeta.y; }
    // Colour identity toggle: at 0 the medium falls back to one neutral tint (the pre-overhaul grey
    // look), at 1 each generator carries its own hue. si.yzw = the field's per-generator colour.
    let medCol = mix(vec3f(0.58, 0.63, 0.63), si.yzw, params.styleSelMeta.z);
    var shade = medCol * (0.18 + 1.5 * density);   // brightness tracks local density so structure reads (not flat tint)
    let lit = select(0.0, smoothstep(0.10, 0.26, density) * params.markerMeta.y, kap <= 1e-6);   // gradient lighting, FLAT MODE ONLY, ramped in softly over a density band so no hard iso-contour slides through the medium as W/T/camera scrub
    if (lit > 0.0) {
      let g = fieldGrad(pos);
      let m = length(g);
      let conf = smoothstep(1e-3, 1e-2, m);                // gradient reliability: near flats / critical points / palette-dominated views (densityLite ~0) fade lighting to neutral instead of snapping the normal
      let N = -g / max(m, 1e-6);                           // outward normal (toward decreasing density)
      let L = normalize(vec3f(0.5, 0.75, 0.35));           // fixed key light, upper-right-front
      let diff = mix(0.62, 0.5 + 0.5 * dot(N, L), conf);   // half-Lambert wrap, blended toward neutral where the normal is unreliable (no flash through gradient zeros)
      let rim = pow(1.0 - sat(dot(N, -rd)), 2.0) * conf;   // view-grazing rim, faded out with confidence so no spurious rim on unreliable normals
      // Anisotropic scattering. The normal-based term above gives the medium form; this gives it
      // atmosphere, by making brightness depend on where the light is relative to the view. Mixed
      // only 60% toward the raw phase so the swing stays dramatic rather than blown out.
      let ph = mix(1.0, hgPhase(dot(rd, L), 0.42), 0.6);
      let litShade = shade * (0.22 + 1.05 * diff * ph) + medCol * (rim * 0.55);
      shade = mix(shade, litShade, lit);                   // ramp the whole lit term in by the band weight -> continuous across the band edges
    }
    if (params.controls.z > 0.001) {                       // depth tint on (strength > 0)
      let ax = i32(params.controls.w + 0.5);               // 0=X, 1=Y, 2=Z
      var dcoord = pos.z;
      if (ax == 0) { dcoord = pos.x; } else if (ax == 1) { dcoord = pos.y; }
      let ramp = 0.5 + 0.5 * cos(dcoord * 0.45 + vec3f(0.0, 2.1, 4.2));
      shade = mix(shade, shade * (0.4 + 1.2 * ramp), params.controls.z);
    }
    let fogAmt = (1.0 - exp(-travel * 0.055)) * 0.7 * params.styleSelMeta.w;    // aerial perspective (atmosphere toggle): distant medium cools + fades, so near/far separate
    shade = mix(shade, vec3f(0.05, 0.08, 0.14), fogAmt);
    shade = shade + creatureLight(pos, params.time, params.hidden);   // creatures light the fog around them (added after fog so the local glow punches through the haze; caught by absorb below, so only nearby medium lights up)
    let beam = coneMask * exp(-travel * invReach);
    color = color + trans * absorb * shade * beam;
    color = color + trans * emis * medCol * beam;   // additive emissive core glow in the generator color (bypasses shade dimming so cores read as light sources)
    alpha = alpha + trans * absorb * beam;
    travel = travel + step;
  }
  if (params.flashMeta.x > 0.5 && params.flashMeta.w > 0.5) {
    color = color * coneMask;   // flashlight darkness: lit medium only, void elsewhere
  } else {
    color = color + (1.0 - alpha) * background(ro, rd);
  }
  let center = uv - vec2f(0.5);
  let vignette = smoothstep(0.85, 0.25, dot(center, center));
  color = color * (0.72 + 0.28 * vignette);
  color = vec3f(1.0) - exp(-max(color, vec3f(0.0)) * params.grade.x);
  let lum = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = clamp(mix(vec3f(lum), color, 1.15), vec3f(0.0), vec3f(1.0));   // gentle post-tonemap saturation lift
  color = pow(max(color, vec3f(0.0)), vec3f(0.4545));
  color = overlayAxes(color, ro, rd);
  color = overlayMarkers(color, ro, rd);
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(frame);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  let color = renderPixel(id.xy);
  textureStore(frame, vec2i(i32(id.x), i32(id.y)), vec4f(color, 1.0));
}
`,yt=`
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var pts = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  var o: VO; o.pos = vec4f(pts[i], 0.0, 1.0); o.uv = pts[i] * 0.5 + vec2f(0.5); return o;
}
@group(0) @binding(2) var snapTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> pp: vec4f;   // pp.x = crossfade (0 = pre-change snapshot .. 1 = live)
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let live = textureSample(tex, samp, in.uv);
  let snap = textureSample(snapTex, samp, in.uv);
  return mix(snap, live, pp.x);
}
`,B=["A","B","C","D","E"],q=[[.08,.92,.78],[1,.76,.22],[.55,.42,1],[1,.3,.5],[.45,1,.7]],at={x:"slotX",y:"slotY",z:"slotZ",t:"slotT",w:"slotW"},M=document.querySelector("#cc"),oe=document.querySelector("#status"),Oe=document.querySelector("#readout"),Ge=document.querySelector("#weightHud"),rt=document.querySelector("#engage"),ze=document.querySelector("#heatmapCanvas"),N=64;let me=!0;const z={colour:{on:!0,live:1},atmos:{on:!0,live:1},light:{on:!0,live:1},motion:{on:!0,live:1}};let G=0,le=!1;const f={ctx:null,bakePipeline:null,displayPipeline:null,heatTex:null,heatTexView:null,heatSampler:null,heatParamsBuf:null,dispParamsBuf:null,bakeBind:null,displayBind:null,format:null},x={x:0,y:1,z:2,t:3,w:4},A={a:0,b:1,c:2,d:3,e:4},g={a:{on:!1,x:0,y:0,z:0,t:0,w:0,r:4.5},b:{on:!1,x:-3,y:2,z:1,t:2,w:0,r:4},c:{on:!1,x:3,y:-2,z:2,t:0,w:2,r:4},d:{on:!1,x:3,y:0,z:-2,t:-2,w:0,r:4},e:{on:!1,x:-2,y:-2.5,z:-1,t:0,w:-2,r:4}},k=[{on:!1,x:0,y:0,z:0,t:0,w:0,r:5,strength:1.5,type:0,rLive:0},{on:!1,x:0,y:0,z:0,t:0,w:0,r:5,strength:1.5,type:1,rLive:0}];let F=0;const wt=["swirl","pull / push","shear"],T=Array.from({length:15},()=>({on:!1,w:.6,wLive:0})),Ae=["a","b","c","d","e"];let ce="a",ge=!1,ve=!1,de=!1,ye=!0;const We=["caverns","canyons","crystal lattice","soft nebula","flow filaments","gyroid","voronoi foam","layered strata","hex lattice","turbulent veins","concentric ripples","woven basket","spiral arms","gyroid (W-swept)","lattice (E-swept)"],st={a:"genA",b:"genB",c:"genC",d:"genD",e:"genE"},h={};let we=!1,fe=2,be=!1,L=!1,O=0;const y={position:[0,0,10.5],yaw:0,pitch:0,roll:0},Ne=1.55,w=new Set,xe=new URLSearchParams(location.search).has("blendTest"),b={pinnedTime:xe?0:null,pinnedCamera:null,pinnedHidden:xe?0:null,easeToggles:!1,crossfade:!1};let i=null,ne=0,ie=0,ot=[],_e=performance.now();const De=.32;let ke=!1,K=!1,pe=0;function qe(){xe&&!b.crossfade||(ke=!0)}const nt=t=>Math.hypot(t[0],t[1],t[2]),Ee=t=>{const e=nt(t)||1;return[t[0]/e,t[1]/e,t[2]/e]},bt=(t,e)=>[t[0]*e,t[1]*e,t[2]*e],I=(t,e,a)=>{t[0]+=e[0]*a,t[1]+=e[1]*a,t[2]+=e[2]*a},xt=(t,e)=>[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]];function kt(t,e){const a=document.querySelector(`#${t}`),r=document.querySelector(`#${t}Val`),s={input:a,out:r,value:Number((a==null?void 0:a.value)??e)},o=()=>{s.value=Number(a.value),r&&(r.textContent=s.value.toFixed(2))};a.addEventListener("input",o),o(),h[t]=s}function R(t,e){const a=h[t];a.input.value=String(e),a.value=Number(e),a.out&&(a.out.textContent=a.value.toFixed(2))}function Mt(){for(const[t,e]of Object.entries(at)){const a=document.querySelector(`#${e}`);a.textContent="",B.forEach((r,s)=>{const o=document.createElement("option");o.value=String(s),o.textContent=r,a.append(o)}),a.value=String(x[t]),a.addEventListener("change",()=>it(t,Number(a.value)))}}function St(){for(const[t,e]of Object.entries(st)){const a=document.querySelector(`#${e}`);a.textContent="",We.forEach((r,s)=>{const o=document.createElement("option");o.value=String(s),o.textContent=r,a.append(o)}),a.value=String(A[t]),a.addEventListener("change",()=>{A[t]=Number(a.value),qe()})}}function Pe(){const t=g[ce],e={X:t.x,Y:t.y,Z:t.z,T:t.t,W:t.w,R:t.r};for(const a of["X","Y","Z","T","W","R"]){const r=document.querySelector(`#het${a}`);if(!r)continue;r.value=String(e[a]);const s=document.querySelector(`#het${a}Val`);s&&(s.textContent=Number(e[a]).toFixed(1))}}function Tt(){const t=document.querySelector("#hetChecks");t.textContent="",Ae.forEach((a,r)=>{const s=document.createElement("label");s.style.cssText="display:flex;align-items:center;gap:3px;font-size:11px;cursor:pointer";const o=document.createElement("input");o.type="checkbox",o.id=`het${a.toUpperCase()}`,o.checked=g[a].on,o.addEventListener("change",()=>{g[a].on=o.checked}),s.append(o,document.createTextNode(B[r])),t.append(s)});const e=document.querySelector("#hetAxis");e.textContent="",Ae.forEach((a,r)=>{const s=document.createElement("option");s.value=a,s.textContent=B[r],e.append(s)}),e.value=ce,e.addEventListener("change",()=>{ce=e.value,Pe()});for(const a of["X","Y","Z","T","W","R"]){const r=document.querySelector(`#het${a}`);r.addEventListener("input",()=>{const s=a==="R"?"r":a.toLowerCase();g[ce][s]=Number(r.value);const o=document.querySelector(`#het${a}Val`);o&&(o.textContent=Number(r.value).toFixed(1))})}Pe()}function Le(){const t=k[F],e=document.querySelector("#ffOn");e&&(e.checked=t.on);const a=document.querySelector("#ffType");a&&(a.value=String(t.type));const r={X:t.x,Y:t.y,Z:t.z,T:t.t,W:t.w,R:t.r,S:t.strength};for(const s of["X","Y","Z","T","W","R","S"]){const o=document.querySelector(`#ff${s}`);if(!o)continue;o.value=String(r[s]);const c=document.querySelector(`#ff${s}Val`);c&&(c.textContent=Number(r[s]).toFixed(1))}}function Et(){const t=document.querySelector("#ffPick");t.textContent="",k.forEach((s,o)=>{const c=document.createElement("option");c.value=String(o),c.textContent=`FF${o+1}`,t.append(c)}),t.value=String(F),t.addEventListener("change",()=>{F=Number(t.value),Le()});const e=document.querySelector("#ffOn");e.addEventListener("change",()=>{k[F].on=e.checked});const a=document.querySelector("#ffType");a.textContent="",wt.forEach((s,o)=>{const c=document.createElement("option");c.value=String(o),c.textContent=s,a.append(c)}),a.addEventListener("change",()=>{k[F].type=Number(a.value)});const r={X:"x",Y:"y",Z:"z",T:"t",W:"w",R:"r",S:"strength"};for(const s of["X","Y","Z","T","W","R","S"]){const o=document.querySelector(`#ff${s}`);o.addEventListener("input",()=>{k[F][r[s]]=Number(o.value);const c=document.querySelector(`#ff${s}Val`);c&&(c.textContent=Number(o.value).toFixed(1))})}Le()}function Ct(){const t=document.querySelector("#paletteRows");t.textContent="",We.forEach((e,a)=>{const r=document.createElement("label");r.style.cssText="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;margin:2px 0";const s=document.createElement("input");s.type="checkbox",s.id=`palTog${a}`,s.checked=T[a].on,s.addEventListener("change",()=>{T[a].on=s.checked});const o=document.createElement("span");o.textContent=e,o.style.cssText="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";const c=document.createElement("input");c.type="range",c.id=`palWgt${a}`,c.min="0",c.max="1.5",c.step="0.05",c.value=String(T[a].w),c.style.cssText="width:70px;flex:none",c.addEventListener("input",()=>{T[a].w=Number(c.value)}),r.append(s,o,c),t.append(r)})}function it(t,e){const a=x[t],r=Object.keys(x).find(s=>s!==t&&x[s]===e);x[t]=e,r&&(x[r]=a);for(const[s,o]of Object.entries(at))document.querySelector(`#${o}`).value=String(x[s]);qe()}function Rt(){Ge.textContent="",ot=B.map((t,e)=>{const a=document.createElement("div");a.className="hud-row";const r=document.createElement("span");r.className="hud-lab",r.textContent=t;const s=document.createElement("div");s.className="hud-track";const o=document.createElement("div");return o.className="hud-bar",o.style.background=`rgb(${q[e].map(c=>Math.round(c*255)).join(",")})`,s.append(o),a.append(r,s),Ge.append(a),o})}function se(t,e,a,r){const s=Math.sin(r),o=Math.cos(r);for(const c of t){const d=c[e],m=c[a];c[e]=o*d-s*m,c[a]=s*d+o*m}}function ct(){const e=["x","y","z","t","w"].map(s=>{const o=[0,0,0,0,0];return o[x[s]]=1,o}),a=h.tilt.value,r=h.spin.value;return(Math.abs(a)>1e-4||Math.abs(r)>1e-4)&&(se(e,0,3,a*.84+r*.2),se(e,1,4,a*.68-r*.31),se(e,2,3,a*.53+r*.17),se(e,0,4,a*.37-r*.13),se(e,1,2,a*.24+r*.29)),e}function lt(t,e){const o=[0,0,0,0,0];for(let m=0;m<5;m++)o[m]=Math.sqrt(.4*t[0][m]**2+.65*t[1][m]**2+1*t[2][m]**2);const c=o.map(m=>Math.pow(m,e)),d=c.reduce((m,C)=>m+C,0)||1;return c.map(m=>m/d)}function He(t,e){const a=Math.cos(e),r=Math.sin(e),s=Math.sin(t),o=Math.cos(t),c=Ee([s*a,r,-o*a]),d=Ee([o,0,s]),m=Ee(xt(d,c));return{forward:c,right:d,up:m}}function Te(){if(b.pinnedCamera){const e=b.pinnedCamera;return He(e.yaw,e.pitch)}const t=He(y.yaw,y.pitch);return Math.abs(y.roll)<1e-6?t:{forward:t.forward,right:Ue(t.right,t.forward,y.roll),up:Ue(t.up,t.forward,y.roll)}}function Ue(t,e,a){const r=Math.cos(a),s=Math.sin(a),o=e[0]*t[0]+e[1]*t[1]+e[2]*t[2],c=e[1]*t[2]-e[2]*t[1],d=e[2]*t[0]-e[0]*t[2],m=e[0]*t[1]-e[1]*t[0];return[t[0]*r+c*s+e[0]*o*(1-r),t[1]*r+d*s+e[1]*o*(1-r),t[2]*r+m*s+e[2]*o*(1-r)]}const l={pos:[0,0,0,1],right:[1,0,0,0],up:[0,1,0,0],fwd:[0,0,1,0],R:1e9},ee=(t,e)=>t[0]*e[0]+t[1]*e[1]+t[2]*e[2]+t[3]*e[3],_=(t,e,a)=>[t[0]+e[0]*a,t[1]+e[1]*a,t[2]+e[2]*a,t[3]+e[3]*a],ue=(t,e)=>[t[0]*e,t[1]*e,t[2]*e,t[3]*e],H=t=>{const e=Math.hypot(t[0],t[1],t[2],t[3])||1;return ue(t,1/e)};function dt(){const t=H(l.pos);let e=H(_(l.right,t,-ee(l.right,t))),a=_(l.up,t,-ee(l.up,t));a=H(_(a,e,-ee(a,e)));let r=_(l.fwd,t,-ee(l.fwd,t));r=_(r,e,-ee(r,e)),r=H(_(r,a,-ee(r,a))),l.right=e,l.up=a,l.fwd=r,l.pos=ue(t,l.R)}function Ye(t){const e=Math.sqrt(Math.abs(t))||1e-9;l.R=1/e,l.pos=[0,0,0,l.R];const a=Te();l.right=[a.right[0],a.right[1],a.right[2],0],l.up=[a.up[0],a.up[1],a.up[2],0],l.fwd=[a.forward[0],a.forward[1],a.forward[2],0],dt()}function he(t,e,a){const r=Math.cos(a),s=Math.sin(a);return[_(ue(t,r),e,s),_(ue(e,r),t,-s)]}function V(t,e){const a=e/l.R,r=H(l.pos),[s,o]=he(r,l[t],a);l.pos=ue(s,l.R),l[t]=o,dt()}function Be(t,e,a){if(t){const[r,s]=he(l.right,l.fwd,t);l.right=r,l.fwd=s}if(e){const[r,s]=he(l.up,l.fwd,e);l.up=r,l.fwd=s}if(a){const[r,s]=he(l.right,l.up,a);l.right=r,l.up=s}}let U=!1;function ft(t,e){if(U){Be(t*.0022,-e*.0022,0);return}y.yaw+=t*.0022,y.pitch=Math.max(-Ne,Math.min(Ne,y.pitch-e*.0022))}function $e(t){if(U){Be(0,0,t);return}y.roll+=t}function zt(t,e){for(let a=0;a<5;a++){const r=28+a*4;t[r]=e[a][0],t[r+1]=e[a][1],t[r+2]=e[a][2],t[r+3]=e[a][3]}t[48]=e[0][4],t[49]=e[1][4],t[50]=e[2][4],t[51]=e[3][4],t[52]=e[4][4],t[53]=0,t[54]=0,t[55]=0}function At(){return`X${B[x.x]} Y${B[x.y]} Z${B[x.z]} T${B[x.t]} W${B[x.w]}`}const Z=[{hold:7,pos:[0,0,10.5],yaw:0,pitch:0,w:0,tilt:0,spin:0,kap:0},{hold:9,pos:[1.3,.7,6.2],yaw:-.2,pitch:-.06,w:0,tilt:.04,spin:0,kap:0},{hold:10,pos:[-1.6,.3,5.2],yaw:.26,pitch:.04,w:6,tilt:.06,spin:.03,kap:0},{hold:11,pos:[2.1,-.9,6.6],yaw:-.32,pitch:.07,w:-6,tilt:.1,spin:.06,kap:0},{hold:10,pos:[.6,1.1,8.2],yaw:.16,pitch:-.09,w:0,tilt:.64,spin:.34,kap:0},{hold:9,pos:[0,.4,9.2],yaw:0,pitch:0,w:0,tilt:.22,spin:.12,kap:-.045},{hold:8,pos:[0,0,10.5],yaw:0,pitch:0,w:0,tilt:0,spin:0,kap:0}],E={on:!1,t:0};function pt(){return Z.reduce((t,e)=>t+e.hold,0)}function Pt(t){if(!E.on)return;E.t=(E.t+t)%pt();let e=0,a=0;for(;a<Z.length&&!(E.t<e+Z[a].hold);a++)e+=Z[a].hold;const r=Z[a],s=Z[(a+1)%Z.length],o=(E.t-e)/r.hold,c=o*o*o*(o*(o*6-15)+10),d=(m,C)=>m+(C-m)*c;y.position=[d(r.pos[0],s.pos[0]),d(r.pos[1],s.pos[1]),d(r.pos[2],s.pos[2])],y.yaw=d(r.yaw,s.yaw),y.pitch=d(r.pitch,s.pitch),R("hidden",d(r.w,s.w)),R("tilt",d(r.tilt,s.tilt)),R("spin",d(r.spin,s.spin)),R("curvature",d(r.kap,s.kap))}function Lt(t){if(b.pinnedCamera||L)return;w.has("KeyQ")&&$e(h.rollSpeed.value*t),w.has("KeyE")&&$e(-h.rollSpeed.value*t);const e=w.has("ShiftLeft")||w.has("ShiftRight")?8.5:3.25;if(U){w.has("KeyW")&&V("fwd",e*t),w.has("KeyS")&&V("fwd",-e*t),w.has("KeyD")&&V("right",e*t),w.has("KeyA")&&V("right",-e*t),w.has("Space")&&V("up",e*t),(w.has("ControlLeft")||w.has("KeyC"))&&V("up",-e*t);return}const{forward:a,right:r}=Te(),s=[0,0,0];w.has("KeyW")&&I(s,a,1),w.has("KeyS")&&I(s,a,-1),w.has("KeyD")&&I(s,r,1),w.has("KeyA")&&I(s,r,-1),w.has("Space")&&I(s,[0,1,0],1),(w.has("ControlLeft")||w.has("KeyC"))&&I(s,[0,1,0],-1);const o=nt(s);o>1e-4&&I(y.position,bt(s,1/o),e*t)}function Wt(t){return t===0?0:t===1?1:2}function Dt(t){ne+=t*h.timeRate.value,b.pinnedTime!==null&&(ne=b.pinnedTime),b.pinnedCamera&&(y.position=[...b.pinnedCamera.position]);const e=i.uniformData,{forward:a,right:r,up:s}=Te();let o=r,c=s,d=a;h.curvature.value>1e-6&&U&&(o=H(l.right).slice(0,3),c=H(l.up).slice(0,3),d=H(l.fwd).slice(0,3));const m=1/Math.tan(68*Math.PI/360);ie+=(h.hidden.value-ie)*(1-Math.exp(-t*6)),b.pinnedHidden!==null&&(ie=b.pinnedHidden);const C=xe&&!b.easeToggles;for(const n of k){const p=n.on?n.r:0;n.rLive+=(p-n.rLive)*(1-Math.exp(-t*7)),C&&(n.rLive=p)}for(const n of T){const p=n.on?n.w:0;n.wLive+=(p-n.wLive)*(1-Math.exp(-t*7)),C&&(n.wLive=p)}{const n=le?1:0;G+=(n-G)*(1-Math.exp(-t*7)),C&&(G=n)}for(const n of Object.keys(z)){const p=z[n],Fe=p.on?1:0;p.live+=(Fe-p.live)*(1-Math.exp(-t*7)),C&&(p.live=Fe)}e[0]=i.outW,e[1]=i.outH,e[2]=ne,e[3]=ie,e[4]=y.position[0],e[5]=y.position[1],e[6]=y.position[2],e[7]=0,e[8]=o[0],e[9]=o[1],e[10]=o[2],e[11]=0,e[12]=c[0],e[13]=c[1],e[14]=c[2],e[15]=O,e[16]=d[0],e[17]=d[1],e[18]=d[2],e[19]=L?1:0,e[20]=h.density.value,e[21]=h.glow.value,e[22]=we?.6:0,e[23]=Wt(fe),e[24]=h.exposure.value,e[25]=m,e[26]=96,e[27]=1;const J=ct();zt(e,J);const v=lt(J,Math.max(1,h.sharpness.value));e[56]=v[0],e[57]=v[1],e[58]=v[2],e[59]=v[3];const S=[0,0,0];for(let n=0;n<5;n++)S[0]+=v[n]*q[n][0],S[1]+=v[n]*q[n][1],S[2]+=v[n]*q[n][2];e[60]=v[4],e[61]=S[0],e[62]=S[1],e[63]=S[2];const te=h.wallR.value;e[64]=be?1:0,e[65]=te,e[66]=.06*te,e[67]=0;const ae=q[x.x],Q=q[x.y],Y=q[x.z];e[68]=ae[0],e[69]=ae[1],e[70]=ae[2],e[71]=0,e[72]=Q[0],e[73]=Q[1],e[74]=Q[2],e[75]=0,e[76]=Y[0],e[77]=Y[1],e[78]=Y[2],e[79]=0;const P=q[x.t],re=q[x.w];e[80]=P[0],e[81]=P[1],e[82]=P[2],e[83]=0,e[84]=re[0],e[85]=re[1],e[86]=re[2],e[87]=0,e[88]=A.a,e[89]=A.b,e[90]=A.c,e[91]=A.d,e[92]=A.e,e[93]=G,e[94]=z.colour.live,e[95]=z.atmos.live;const W=(n,p)=>{e[p]=n.x,e[p+1]=n.y,e[p+2]=n.z,e[p+3]=n.on?n.r:0};W(g.a,96),W(g.b,100),W(g.c,104),W(g.d,108),W(g.e,112);const D=(n,p)=>{e[p]=n.t,e[p+1]=n.w,e[p+2]=0,e[p+3]=0};D(g.a,124),D(g.b,128),D(g.c,132),D(g.d,136),D(g.e,140);const $=(n,p)=>{e[p]=n.x,e[p+1]=n.y,e[p+2]=n.z,e[p+3]=n.rLive,e[p+4]=n.t,e[p+5]=n.w,e[p+6]=n.strength,e[p+7]=n.type};$(k[0],144),$(k[1],152),e[160]=de?1:0,e[161]=z.light.live,e[162]=z.motion.live,e[163]=0;for(let n=0;n<15;n++)e[164+n]=T[n].wLive;e[179]=0,e[180]=h.curvature.value,e[181]=0,e[182]=0,e[183]=0;const u=h.curvature.value;u>1e-6?U?Math.abs(l.R-1/Math.sqrt(u))>1e-6&&Ye(u):(Ye(u),U=!0):U=!1,e[184]=l.right[0],e[185]=l.right[1],e[186]=l.right[2],e[187]=l.right[3],e[188]=l.up[0],e[189]=l.up[1],e[190]=l.up[2],e[191]=l.up[3],e[192]=l.fwd[0],e[193]=l.fwd[1],e[194]=l.fwd[2],e[195]=l.fwd[3],e[196]=l.pos[0],e[197]=l.pos[1],e[198]=l.pos[2],e[199]=l.pos[3],e[116]=ge?1:0,e[117]=6,e[118]=.012,e[119]=0,e[120]=ve?1:0,e[121]=Math.cos(h.flashAngle.value*Math.PI/180),e[122]=h.flashReach.value,e[123]=ye?1:0,i.device.queue.writeBuffer(i.uniformBuffer,0,e);for(let n=0;n<5;n++)ot[n].style.width=`${(v[n]*100).toFixed(1)}%`;Oe&&(Oe.textContent=`x${y.position[0].toFixed(1)} y${y.position[1].toFixed(1)} z${y.position[2].toFixed(1)} w${h.hidden.value.toFixed(1)} t${ne.toFixed(1)} · ${At()} · sharp ${h.sharpness.value.toFixed(1)}`)}function Ce(t=!1){var c,d;const e=Math.min(window.devicePixelRatio||1,1.5),a=Math.max(1,Math.floor(M.clientWidth*e)),r=Math.max(1,Math.floor(M.clientHeight*e)),s=Math.max(1,Math.floor(a*h.scale.value)),o=Math.max(1,Math.floor(r*h.scale.value));!t&&a===i.cw&&r===i.ch&&s===i.outW&&o===i.outH||(i.cw=a,i.ch=r,i.outW=s,i.outH=o,M.width=a,M.height=r,i.context.configure({device:i.device,format:i.format,alphaMode:"opaque"}),(c=i.outputTexture)==null||c.destroy(),i.outputTexture=i.device.createTexture({size:[s,o],format:"rgba8unorm",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC}),(d=i.snapTexture)==null||d.destroy(),i.snapTexture=i.device.createTexture({size:[s,o],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),K=!1,ke=!1,i.computeBind=i.device.createBindGroup({layout:i.computePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:i.uniformBuffer}},{binding:1,resource:i.outputTexture.createView()}]}),i.presentBind=i.device.createBindGroup({layout:i.presentPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:i.sampler},{binding:1,resource:i.outputTexture.createView()},{binding:2,resource:i.snapTexture.createView()},{binding:3,resource:{buffer:i.presentParamsBuffer}}]}))}async function qt(){f.format=i.format,f.ctx=ze.getContext("webgpu"),f.ctx.configure({device:i.device,format:f.format,alphaMode:"opaque"});const t=i.device.createShaderModule({code:mt}),e=i.device.createShaderModule({code:gt});f.bakePipeline=await i.device.createComputePipelineAsync({layout:"auto",compute:{module:t,entryPoint:"bake"}}),f.displayPipeline=await i.device.createRenderPipelineAsync({layout:"auto",vertex:{module:e,entryPoint:"vs"},fragment:{module:e,entryPoint:"fs",targets:[{format:f.format}]},primitive:{topology:"triangle-list"}}),f.heatParamsBuf=i.device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),f.dispParamsBuf=i.device.createBuffer({size:224,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),f.heatSampler=i.device.createSampler({magFilter:"nearest",minFilter:"nearest"}),Bt()}function Bt(){var t;(t=f.heatTex)==null||t.destroy(),f.heatTex=i.device.createTexture({size:[N,N],format:"rgba16float",usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING}),f.heatTexView=f.heatTex.createView(),f.sigValid=!1,f.bakeBind=i.device.createBindGroup({layout:f.bakePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:i.uniformBuffer}},{binding:1,resource:{buffer:f.heatParamsBuf}},{binding:2,resource:f.heatTexView}]}),f.displayBind=i.device.createBindGroup({layout:f.displayPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:f.heatSampler},{binding:1,resource:f.heatTexView},{binding:2,resource:{buffer:f.dispParamsBuf}}]})}function Ft(){if(!me||!f.bakeBind)return;const t=-8,e=8,a=-8,r=8,s=new ArrayBuffer(48),o=new Uint32Array(s),c=new Float32Array(s);o[0]=N,o[1]=N,o[2]=3,o[3]=0,c[4]=t,c[5]=e,c[6]=a,c[7]=r,c[8]=3,c[9]=0,c[10]=0,c[11]=0,i.device.queue.writeBuffer(f.heatParamsBuf,0,s);const d=e-t,C=(((ne-t)%d+d)%d+t-t)/d,J=(h.hidden.value-a)/(r-a),v=new Float32Array(56);v.set([C,J,N,N,1,8,12,0],0);const S=e-t,te=(u,n,p)=>Math.min(1,Math.max(0,(u-n)/(p-n))),ae=u=>(((u-t)%S+S)%S+t-t)/S;let Q=0;if(de){const u=[];for(const n of Ae)g[n].on&&u.push([g[n].t,g[n].w]);for(const n of k)n.on&&u.push([n.t,n.w]);for(let n=0;n<u.length&&n<7;n++)v[12+n*4]=ae(u[n][0]),v[13+n*4]=te(u[n][1],a,r),Q++}let Y=0;if(G>.002)for(let u=0;u<j.length&&u<4;u++){const n=j[u],p=40+Y*4;v[p]=te(n.w,a,r),v[p+1]=n.tint[0]*G,v[p+2]=n.tint[1]*G,v[p+3]=n.tint[2]*G,Y++}v[8]=Q,v[9]=Y,v[10]=et/(r-a),v[11]=0,i.device.queue.writeBuffer(f.dispParamsBuf,0,v);const P=i.uniformData,re=Math.abs(P[180])<1e-6;(!f.sig||f.sig.length!==P.length)&&(f.sig=new Float32Array(P.length),f.sigValid=!1);let W=!f.sigValid;if(!W){for(let u=0;u<P.length;u++)if(!(u===2||u===3)&&!(re&&u>=4&&u<=19)&&P[u]!==f.sig[u]){W=!0;break}}const D=i.device.createCommandEncoder();if(W){f.sig.set(P),f.sigValid=!0,f.bakes=(f.bakes||0)+1;const u=D.beginComputePass();u.setPipeline(f.bakePipeline),u.setBindGroup(0,f.bakeBind),u.dispatchWorkgroups(Math.ceil(N/8),Math.ceil(N/8)),u.end()}const $=D.beginRenderPass({colorAttachments:[{view:f.ctx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});$.setPipeline(f.displayPipeline),$.setBindGroup(0,f.displayBind),$.draw(3),$.end(),i.device.queue.submit([D.finish()])}function Ot(){if(!i.outputTexture)return;const t=i.device.createCommandEncoder();ke&&(t.copyTextureToTexture({texture:i.outputTexture},{texture:i.snapTexture},[i.outW,i.outH]),K=!0,pe=0,ke=!1);const e=t.beginComputePass();e.setPipeline(i.computePipeline),e.setBindGroup(0,i.computeBind),e.dispatchWorkgroups(Math.ceil(i.outW/8),Math.ceil(i.outH/8)),e.end();const a=K?Math.min(1,pe/De):1;i.device.queue.writeBuffer(i.presentParamsBuffer,0,new Float32Array([a,0,0,0]));const r=t.beginRenderPass({colorAttachments:[{view:i.context.getCurrentTexture().createView(),clearValue:{r:.02,g:.02,b:.03,a:1},loadOp:"clear",storeOp:"store"}]});r.setPipeline(i.presentPipeline),r.setBindGroup(0,i.presentBind),r.draw(3),r.end(),i.device.queue.submit([t.finish()])}function ut(t){const e=Math.min((t-_e)/1e3,.05);_e=t,Lt(e),Pt(e),Dt(e),Ot(),K&&(pe+=e,pe>=De&&(K=!1)),L?ze.style.display="none":(ze.style.display="",Ft()),requestAnimationFrame(ut)}async function Gt(){if(!navigator.gpu){oe.textContent="No WebGPU";return}const t=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!t){oe.textContent="No GPU";return}const e=await t.requestDevice(),a=M.getContext("webgpu"),r=navigator.gpu.getPreferredCanvasFormat(),s=e.createShaderModule({code:vt}),o=e.createShaderModule({code:yt}),c=await e.createComputePipelineAsync({layout:"auto",compute:{module:s,entryPoint:"main"}}),d=await e.createRenderPipelineAsync({layout:"auto",vertex:{module:o,entryPoint:"vs"},fragment:{module:o,entryPoint:"fs",targets:[{format:r}]},primitive:{topology:"triangle-list"}}),m=new Float32Array(200),C=e.createBuffer({size:m.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),J=e.createSampler({magFilter:"linear",minFilter:"linear"}),v=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});i={device:e,context:a,format:r,computePipeline:c,presentPipeline:d,uniformData:m,uniformBuffer:C,sampler:J,presentParamsBuffer:v,outputTexture:null,snapTexture:null,computeBind:null,presentBind:null,cw:0,ch:0,outW:0,outH:0},window.addEventListener("resize",()=>Ce()),h.scale.input.addEventListener("input",()=>Ce(!0)),Ce(!0),await qt(),e.lost.then(S=>{oe.textContent="Device lost",console.error(S.message)}),oe.textContent="Live",requestAnimationFrame(ut)}function Nt(){window.__blendTest={ready:!0,setSlot:(t,e)=>it(t,e),getSlots:()=>({...x}),setSlider:(t,e)=>R(t,e),getSlider:t=>h[t].value,setSharpness:t=>R("sharpness",t),getWeights:()=>lt(ct(),Math.max(1,h.sharpness.value)),setDepthTint:t=>{we=!!t;const e=document.querySelector("#depthTint");e&&(e.checked=!!t)},getDepthTint:()=>we,setDepthAxis:t=>{fe=t;const e=document.querySelector("#depthAxis");e&&(e.value=String(t))},getDepthAxis:()=>fe,setTwMap:t=>{me=!!t;const e=document.querySelector("#twMap");e&&(e.checked=!!t)},getTwMap:()=>me,setViewWalls:t=>{be=!!t;const e=document.querySelector("#viewWalls");e&&(e.checked=!!t)},getViewWalls:()=>be,setInspector:t=>{L=!!t;const e=document.querySelector("#viewInspector");e&&(e.checked=!!t)},getInspector:()=>L,setFocusAxis:t=>{O=Math.max(0,Math.min(4,t|0))},getFocusAxis:()=>O,setGen:(t,e)=>{const a=String(t).toLowerCase();if(!(a in A))return;A[a]=Math.max(0,Math.min(We.length-1,e|0));const r=document.querySelector("#"+st[a]);r&&(r.value=String(A[a])),qe()},setCrossfade:t=>{b.crossfade=!!t},getXfade:()=>({active:K,fade:K?Math.min(1,pe/De):1}),getGens:()=>({...A}),setHet:(t,e)=>{const a=String(t).toLowerCase();if(g[a]){g[a].on=!!e;const r=document.querySelector("#het"+a.toUpperCase());r&&(r.checked=!!e)}},setHetShape:(t,e,a,r,s,o,c)=>{const d=String(t).toLowerCase();g[d]&&(g[d].x=e,g[d].y=a,g[d].z=r,g[d].t=s,g[d].w=o,g[d].r=c,ce===d&&Pe())},getHet:()=>JSON.parse(JSON.stringify(g)),setFF:(t,e)=>{if(k[t]&&(k[t].on=!!e,F===t)){const a=document.querySelector("#ffOn");a&&(a.checked=!!e)}},setFFShape:(t,e,a,r,s,o,c,d)=>{k[t]&&(Object.assign(k[t],{x:e,y:a,z:r,t:s,w:o,r:c,strength:d}),F===t&&Le())},setFFType:(t,e)=>{if(k[t]&&(k[t].type=e|0,F===t)){const a=document.querySelector("#ffType");a&&(a.value=String(e|0))}},getFF:()=>JSON.parse(JSON.stringify(k)),setMarkers:t=>{de=!!t;const e=document.querySelector("#showMarkers");e&&(e.checked=!!t)},getMarkers:()=>de,setDrifter:t=>{le=!!t;const e=document.querySelector("#drifter");e&&(e.checked=!!t)},getDrifter:()=>le,getDrifterLive:()=>G,setTour:t=>{E.on=!!t,E.on&&(E.t=0);const e=document.querySelector("#autoTour");e&&(e.checked=!!t)},getTour:()=>({on:E.on,t:E.t,total:pt()}),setLook:(t,e)=>{if(z[t]){z[t].on=!!e;const a=document.querySelector("#look"+t[0].toUpperCase()+t.slice(1));a&&(a.checked=!!e)}},getLook:()=>JSON.parse(JSON.stringify(z)),getHeatBakes:()=>f.bakes||0,setPaletteGen:(t,e)=>{if(T[t]){T[t].on=!!e;const a=document.querySelector(`#palTog${t}`);a&&(a.checked=!!e)}},setPaletteWeight:(t,e)=>{if(T[t]){T[t].w=Number(e);const a=document.querySelector(`#palWgt${t}`);a&&(a.value=String(e))}},getPalette:()=>JSON.parse(JSON.stringify(T)),setCurvature:t=>R("curvature",t),getCurvature:()=>h.curvature.value,flyGeo:(t,e)=>V(t,e),lookGeo:(t,e,a)=>Be(t,e,a),get4D:()=>({pos:[...l.pos],right:[...l.right],up:[...l.up],fwd:[...l.fwd],R:l.R,active:U}),setShowAxes:t=>{ge=!!t;const e=document.querySelector("#showAxes");e&&(e.checked=!!t)},getShowAxes:()=>ge,setFlash:t=>{ve=!!t;const e=document.querySelector("#flash");e&&(e.checked=!!t)},setFlashDark:t=>{ye=!!t;const e=document.querySelector("#flashDark");e&&(e.checked=!!t)},setFlashAngle:t=>R("flashAngle",t),setFlashReach:t=>R("flashReach",t),getFlash:()=>({on:ve,dark:ye,angle:h.flashAngle.value,reach:h.flashReach.value}),setWallR:t=>R("wallR",t),getWallR:()=>h.wallR.value,setHidden:t=>{b.pinnedHidden=t,R("hidden",t)},setHiddenEased:t=>{b.pinnedHidden=null,R("hidden",t)},getHiddenLive:()=>ie,setEaseToggles:t=>{b.easeToggles=!!t},getFFRadiusLive:t=>k[t]?k[t].rLive:0,getPaletteWeightLive:t=>T[t]?T[t].wLive:0,setTime:t=>{b.pinnedTime=t},play:()=>{b.pinnedTime=null},setCamera:(t,e,a,r=0,s=0)=>{b.pinnedCamera={position:[t,e,a],yaw:r,pitch:s}},unpinCamera:()=>{b.pinnedCamera=null,y.yaw=0,y.pitch=0,y.roll=0},look:(t,e)=>ft(t,e),getForward:()=>[...Te().forward]}}for(const t of["tilt","spin","hidden","timeRate","density","glow","exposure","scale","sharpness","curvature","wallR","rollSpeed","flashAngle","flashReach"])kt(t,0);Mt();St();Tt();Et();Ct();const Xe=document.querySelector("#depthTint");Xe.addEventListener("change",()=>{we=Xe.checked});const Me=document.querySelector("#depthAxis");["X","Y","Z"].forEach((t,e)=>{const a=document.createElement("option");a.value=String(e),a.textContent=t,Me.append(a)});Me.value=String(fe);Me.addEventListener("change",()=>{fe=Number(Me.value)});const Ie=document.querySelector("#twMap");Ie.addEventListener("change",()=>{me=Ie.checked});const Ve=document.querySelector("#viewWalls");Ve.addEventListener("change",()=>{be=Ve.checked});const Ze=document.querySelector("#viewInspector");Ze.addEventListener("change",()=>{L=Ze.checked});const je=document.querySelector("#showAxes");je.addEventListener("change",()=>{ge=je.checked});const Ke=document.querySelector("#showMarkers");Ke.addEventListener("change",()=>{de=Ke.checked});const Se=document.querySelector("#drifter");Se.addEventListener("change",()=>{le=Se.checked});const Re=document.querySelector("#autoTour");Re&&Re.addEventListener("change",()=>{E.on=Re.checked,E.on&&(E.t=0,le=!0,Se&&(Se.checked=!0))});for(const[t,e]of[["colour","lookColour"],["atmos","lookAtmos"],["light","lookLight"],["motion","lookMotion"]]){const a=document.querySelector("#"+e);a&&(a.checked=z[t].on,a.addEventListener("change",()=>{z[t].on=a.checked}))}const Je=document.querySelector("#flash");Je.addEventListener("change",()=>{ve=Je.checked});const Qe=document.querySelector("#flashDark");Qe.addEventListener("change",()=>{ye=Qe.checked});Rt();M.addEventListener("click",t=>{var e;if(L){const a=M.getBoundingClientRect();(t.clientY-a.top)/a.height<.18&&(O=Math.max(0,Math.min(4,Math.floor((t.clientX-a.left)/a.width*5))));return}(e=M.requestPointerLock)==null||e.call(M)});rt.addEventListener("click",()=>{var t;L||(t=M.requestPointerLock)==null||t.call(M)});document.addEventListener("pointerlockchange",()=>{rt.textContent=document.pointerLockElement===M?"Live (Esc to release)":"Engage (click canvas)"});document.addEventListener("mousemove",t=>{L||document.pointerLockElement!==M||ft(t.movementX,t.movementY)});document.addEventListener("keydown",t=>{w.add(t.code),["Space","ControlLeft"].includes(t.code)&&t.preventDefault(),L&&(t.code==="Digit1"||t.code==="Numpad1"?O=0:t.code==="Digit2"||t.code==="Numpad2"?O=1:t.code==="Digit3"||t.code==="Numpad3"?O=2:t.code==="Digit4"||t.code==="Numpad4"?O=3:(t.code==="Digit5"||t.code==="Numpad5")&&(O=4))});document.addEventListener("keyup",t=>w.delete(t.code));Nt();Gt().catch(t=>{console.error(t),oe.textContent="Error"});
