/* GPU garage: fitted LTC / GGX reference, procedural coated surfaces, thin lens.
 * See docs/GARAGE_MATERIAL_MODEL.md for the explicit approximation boundaries.
 */
globalThis.GARAGE_RENDERER_SHADER = `
const PI: f32 = 3.141592653589793;
const INV_PI: f32 = 0.3183098861837907;
const MAX_OBJECTS: u32 = 12u;
const OBJECT_STRIDE: u32 = 28u;
const MAX_LIGHTS: u32 = 6u;
const LIGHT_STRIDE: u32 = 32u;

struct F32Buffer {
  values: array<f32>,
};

struct Hit {
  t: f32,
  point: vec3<f32>,
  normal: vec3<f32>,
  color: vec3<f32>,
  material: f32,
  roughness: f32,
  metalness: f32,
  anisotropy: f32,
  transmission: f32,
  absorption: f32,
  dispersion: f32,
  ior: f32,
  pattern: f32,
  normalScale: f32,
  clearcoat: f32,
  objectIndex: f32,
  shape: f32,
  emitter: f32,
  exists: f32,
};

struct ClipResult {
  dirs: array<vec3<f32>, 8>,
  count: u32,
};

struct RefractPath {
  origin: vec3<f32>,
  direction: vec3<f32>,
  distance: f32,
  exitTransmission: f32,
  valid: f32,
};

@group(0) @binding(0) var frameTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<storage, read> params: F32Buffer;
@group(0) @binding(2) var<storage, read> objects: F32Buffer;
@group(0) @binding(3) var<storage, read> lights: F32Buffer;
@group(0) @binding(4) var ltcMatrixLut: texture_2d<f32>;
@group(0) @binding(5) var ltcAmplitudeLut: texture_2d<f32>;
@group(0) @binding(6) var ltcSampler: sampler;

fn p(index: u32) -> f32 { return params.values[index]; }
fn objectValue(index: u32) -> f32 { return objects.values[index]; }
fn lightValue(index: u32, field: u32) -> f32 { return lights.values[index * LIGHT_STRIDE + field]; }
fn objectCount() -> u32 { return min(u32(p(42u)), MAX_OBJECTS); }
fn lightCount() -> u32 { return min(u32(p(43u)), MAX_LIGHTS); }
fn fancyEnabled() -> bool { return p(92u) > 0.5; }
fn fancyCubeLow() -> vec3<f32> { return vec3<f32>(0.94, 0.79, -2.0); }
fn fancyCubeHigh() -> vec3<f32> { return vec3<f32>(1.94, 1.79, -1.0); }
fn fancyCubeBasis() -> mat3x3<f32> {
  let cy = cos(0.48); let sy = sin(0.48);
  let cz = cos(0.16); let sz = sin(0.16);
  let cx = cos(0.22); let sx = sin(0.22);
  let rotateX = mat3x3<f32>(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, cx, sx), vec3<f32>(0.0, -sx, cx));
  let rotateY = mat3x3<f32>(vec3<f32>(cy, 0.0, -sy), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(sy, 0.0, cy));
  let rotateZ = mat3x3<f32>(vec3<f32>(cz, sz, 0.0), vec3<f32>(-sz, cz, 0.0), vec3<f32>(0.0, 0.0, 1.0));
  return rotateZ * rotateY * rotateX;
}
fn fancyCubePoint(point: vec3<f32>) -> vec3<f32> {
  let center = (fancyCubeLow() + fancyCubeHigh()) * 0.5;
  return transpose(fancyCubeBasis()) * (point - center) + center;
}

fn lightCenter(index: u32) -> vec3<f32> {
  return vec3<f32>(lightValue(index, 0u), lightValue(index, 1u), lightValue(index, 2u));
}
fn lightU(index: u32) -> vec3<f32> {
  return normalize(vec3<f32>(lightValue(index, 8u), lightValue(index, 9u), lightValue(index, 10u)));
}
fn lightV(index: u32) -> vec3<f32> {
  return normalize(vec3<f32>(lightValue(index, 11u), lightValue(index, 12u), lightValue(index, 13u)));
}
fn lightNormal(index: u32) -> vec3<f32> { return normalize(cross(lightU(index), lightV(index))); }
fn lightWidth(index: u32) -> f32 { return lightValue(index, 3u); }
fn lightDepth(index: u32) -> f32 { return lightValue(index, 4u); }
fn lightRadiance(index: u32) -> vec3<f32> {
  return vec3<f32>(lightValue(index, 5u), lightValue(index, 6u), lightValue(index, 7u));
}

fn quatRotate(v: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

fn objectRotation(base: u32) -> vec4<f32> {
  let q = vec4<f32>(
    objectValue(base + 16u), objectValue(base + 17u),
    objectValue(base + 18u), objectValue(base + 19u)
  );
  return normalize(select(vec4<f32>(0.0, 0.0, 0.0, 1.0), q, dot(q, q) > 0.000001));
}

fn emptyHit() -> Hit {
  var hit: Hit;
  hit.t = 1e20;
  hit.point = vec3<f32>(0.0);
  hit.normal = vec3<f32>(0.0, 1.0, 0.0);
  hit.color = vec3<f32>(0.0);
  hit.material = 0.0;
  hit.roughness = 1.0;
  hit.metalness = 0.0;
  hit.anisotropy = 0.0;
  hit.transmission = 0.0;
  hit.absorption = 0.0;
  hit.dispersion = 0.0;
  hit.ior = 1.46;
  hit.pattern = 0.0;
  hit.normalScale = 0.0;
  hit.clearcoat = 0.0;
  hit.objectIndex = -1.0;
  hit.shape = 0.0;
  hit.emitter = 0.0;
  hit.exists = 0.0;
  return hit;
}

fn objectHit(current: Hit, t: f32, point: vec3<f32>, normal: vec3<f32>, index: u32) -> Hit {
  var hit = current;
  if (t <= 0.001 || t >= hit.t) { return hit; }
  let base = index * OBJECT_STRIDE;
  hit.t = t;
  hit.point = point;
  hit.normal = normalize(normal);
  hit.color = vec3<f32>(objectValue(base + 4u), objectValue(base + 5u), objectValue(base + 6u));
  hit.material = objectValue(base + 7u);
  hit.shape = objectValue(base + 8u);
  hit.roughness = clamp(objectValue(base + 10u), 0.025, 1.0);
  hit.metalness = clamp(objectValue(base + 11u), 0.0, 1.0);
  hit.normalScale = objectValue(base + 12u);
  hit.pattern = objectValue(base + 13u);
  hit.clearcoat = select(objectValue(base + 20u), 0.0, hit.material > 7.5);
  hit.absorption = select(0.0, objectValue(base + 20u), hit.material > 7.5);
  hit.anisotropy = clamp(objectValue(base + 22u), 0.0, 1.0);
  hit.transmission = clamp(objectValue(base + 23u), 0.0, 1.0);
  hit.ior = max(1.01, objectValue(base + 25u));
  hit.dispersion = max(0.0, objectValue(base + 26u));
  hit.objectIndex = f32(index);
  hit.emitter = 0.0;
  hit.exists = 1.0;
  return hit;
}

fn intersectSphere(origin: vec3<f32>, direction: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let radius = objectValue(base + 3u);
  let oc = origin - center;
  let b = dot(oc, direction);
  let c = dot(oc, oc) - radius * radius;
  let h = b * b - c;
  if (h <= 0.0) { return current; }
  var t = -b - sqrt(h);
  if (t <= 0.001) { t = -b + sqrt(h); }
  let point = origin + direction * t;
  let shape = objectValue(base + 8u);
  if (shape > 4.5 && point.y < center.y) { return current; }
  return objectHit(current, t, point, (point - center) / radius, index);
}

fn intersectBox(origin: vec3<f32>, direction: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDirection = quatRotate(direction, invQ);
  let extents = vec3<f32>(objectValue(base + 3u), objectValue(base + 9u) * 0.5, objectValue(base + 15u));
  let reciprocal = vec3<f32>(1.0) / localDirection;
  let t0 = (-extents - localOrigin) * reciprocal;
  let t1 = (extents - localOrigin) * reciprocal;
  let near3 = min(t0, t1);
  let far3 = max(t0, t1);
  let nearT = max(max(near3.x, near3.y), near3.z);
  let farT = min(min(far3.x, far3.y), far3.z);
  if (farT < max(nearT, 0.001)) { return current; }
  let t = select(nearT, farT, nearT <= 0.001);
  let localPoint = localOrigin + localDirection * t;
  let face = abs(localPoint / max(extents, vec3<f32>(0.0001)));
  var localNormal = vec3<f32>(0.0, 0.0, sign(localPoint.z));
  if (face.x >= face.y && face.x >= face.z) {
    localNormal = vec3<f32>(sign(localPoint.x), 0.0, 0.0);
  } else if (face.y >= face.z) {
    localNormal = vec3<f32>(0.0, sign(localPoint.y), 0.0);
  }
  return objectHit(current, t, origin + direction * t, quatRotate(localNormal, q), index);
}

fn torusDistance(point: vec3<f32>, majorRadius: f32, minorRadius: f32) -> f32 {
  return length(vec2<f32>(length(point.xz) - majorRadius, point.y)) - minorRadius;
}

fn intersectTorus(origin: vec3<f32>, direction: vec3<f32>, index: u32, current: Hit) -> Hit {
  let base = index * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let localOrigin = quatRotate(origin - center, invQ);
  let localDirection = quatRotate(direction, invQ);
  let majorRadius = objectValue(base + 3u);
  let minorRadius = objectValue(base + 9u);
  var t = 0.02;
  var found = false;
  for (var step = 0u; step < 36u; step = step + 1u) {
    let distance = torusDistance(localOrigin + localDirection * t, majorRadius, minorRadius);
    if (abs(distance) < 0.0015) { found = true; break; }
    t = t + max(0.002, distance * 0.72);
    if (t >= current.t || t > 12.0) { break; }
  }
  if (!found) { return current; }
  let localPoint = localOrigin + localDirection * t;
  let radial = max(length(localPoint.xz), 0.0001);
  let localNormal = normalize(vec3<f32>(localPoint.x * (1.0 - majorRadius / radial), localPoint.y, localPoint.z * (1.0 - majorRadius / radial)));
  return objectHit(current, t, origin + direction * t, quatRotate(localNormal, q), index);
}

fn intersectObject(origin: vec3<f32>, direction: vec3<f32>, index: u32, current: Hit) -> Hit {
  let shape = objectValue(index * OBJECT_STRIDE + 8u);
  if (shape > 2.5 && shape < 3.5) { return intersectBox(origin, direction, index, current); }
  if (shape > 3.5 && shape < 4.5) { return intersectTorus(origin, direction, index, current); }
  return intersectSphere(origin, direction, index, current);
}

fn boxInterval(origin: vec3<f32>, direction: vec3<f32>, low: vec3<f32>, high: vec3<f32>) -> vec2<f32> {
  var nearT = -1e20;
  var farT = 1e20;
  for (var axis = 0u; axis < 3u; axis = axis + 1u) {
    if (abs(direction[axis]) < 0.0000001) {
      if (origin[axis] < low[axis] || origin[axis] > high[axis]) { return vec2<f32>(1.0, 0.0); }
    } else {
      let a = (low[axis] - origin[axis]) / direction[axis];
      let b = (high[axis] - origin[axis]) / direction[axis];
      nearT = max(nearT, min(a, b));
      farT = min(farT, max(a, b));
    }
  }
  return vec2<f32>(nearT, farT);
}

fn intersectLightFrame(origin: vec3<f32>, direction: vec3<f32>, current: Hit) -> Hit {
  var hit = current;
  if (p(89u) < 0.5 || lightCount() < 3u) { return hit; }
  let lightIndex = 2u;
  let u = lightU(lightIndex);
  let v = lightV(lightIndex);
  let n = lightNormal(lightIndex);
  let worldToPanel = transpose(mat3x3<f32>(u, v, n));
  let localOrigin = worldToPanel * (origin - lightCenter(lightIndex));
  let localDirection = worldToPanel * direction;
  let halfW = lightWidth(lightIndex) * 0.5;
  let halfH = lightDepth(lightIndex) * 0.5;
  for (var bar = 0u; bar < 4u; bar = bar + 1u) {
    let side = select(-1.0, 1.0, (bar % 2u) == 1u);
    var center = vec3<f32>(side * (halfW + 0.042), 0.0, 0.025);
    var extents = vec3<f32>(0.042, halfH + 0.084, 0.052);
    if (bar >= 2u) {
      center = vec3<f32>(0.0, side * (halfH + 0.042), 0.025);
      extents = vec3<f32>(halfW, 0.042, 0.052);
    }
    let interval = boxInterval(localOrigin - center, localDirection, -extents, extents);
    if (interval.y < max(0.001, interval.x)) { continue; }
    let t = select(interval.y, interval.x, interval.x > 0.001);
    if (t >= hit.t) { continue; }
    let localPoint = localOrigin + localDirection * t - center;
    let faceDistance = abs(abs(localPoint) - extents);
    var localNormal = vec3<f32>(0.0, 0.0, sign(localPoint.z));
    if (faceDistance.x < faceDistance.y && faceDistance.x < faceDistance.z) {
      localNormal = vec3<f32>(sign(localPoint.x), 0.0, 0.0);
    } else if (faceDistance.y < faceDistance.z) {
      localNormal = vec3<f32>(0.0, sign(localPoint.y), 0.0);
    }
    hit = emptyHit();
    hit.t = t;
    hit.point = origin + direction * t;
    hit.normal = normalize(u * localNormal.x + v * localNormal.y + n * localNormal.z);
    hit.color = vec3<f32>(0.54, 0.34, 0.16);
    hit.material = 7.0;
    hit.roughness = 0.24;
    hit.metalness = 0.94;
    hit.pattern = 1.0;
    hit.normalScale = 0.025;
    hit.objectIndex = -2.0;
    hit.exists = 1.0;
  }
  return hit;
}

fn intersectVolumeCage(origin: vec3<f32>, direction: vec3<f32>, current: Hit) -> Hit {
  var hit = current;
  if (!fancyEnabled()) { return hit; }
  let low = fancyCubeLow();
  let high = fancyCubeHigh();
  let cubeOrigin = fancyCubePoint(origin);
  let cubeDirection = transpose(fancyCubeBasis()) * direction;
  let width = 0.006;
  let interval = boxInterval(cubeOrigin, cubeDirection, low - vec3<f32>(width), high + vec3<f32>(width));
  if (interval.y < max(0.001, interval.x) || interval.x >= current.t) { return hit; }
  for (var axis = 0u; axis < 3u; axis = axis + 1u) {
    let b = (axis + 1u) % 3u;
    let c = (axis + 2u) % 3u;
    for (var edge = 0u; edge < 4u; edge = edge + 1u) {
      var center = (low + high) * 0.5;
      center[b] = select(low[b], high[b], (edge % 2u) == 1u);
      center[c] = select(low[c], high[c], edge >= 2u);
      var extents = vec3<f32>(width);
      extents[axis] = (high[axis] - low[axis]) * 0.5 + width;
      let bar = boxInterval(cubeOrigin - center, cubeDirection, -extents, extents);
      if (bar.y < max(0.001, bar.x)) { continue; }
      let t = select(bar.y, bar.x, bar.x > 0.001);
      if (t >= hit.t) { continue; }
      let local = cubeOrigin + cubeDirection * t - center;
      let face = abs(abs(local) - extents);
      var normal = vec3<f32>(0.0, 0.0, sign(local.z));
      if (face.x < face.y && face.x < face.z) { normal = vec3<f32>(sign(local.x), 0.0, 0.0); }
      else if (face.y < face.z) { normal = vec3<f32>(0.0, sign(local.y), 0.0); }
      hit = emptyHit();
      hit.t = t;
      hit.point = origin + direction * t;
      hit.normal = fancyCubeBasis() * normal;
      hit.material = 7.0;
      hit.color = vec3<f32>(0.40, 0.66, 0.57);
      hit.metalness = 0.94;
      hit.roughness = 0.23;
      hit.objectIndex = -3.0;
      hit.exists = 1.0;
    }
  }
  return hit;
}

fn intersectScene(origin: vec3<f32>, direction: vec3<f32>) -> Hit {
  var hit = emptyHit();
  if (direction.y < -0.0001) {
    let t = -origin.y / direction.y;
    let point = origin + direction * t;
    if (t > 0.001 && abs(point.x) < p(37u) && point.z > p(38u) && point.z < p(39u)) {
      hit.t = t;
      hit.point = point;
      hit.normal = vec3<f32>(0.0, 1.0, 0.0);
      hit.color = vec3<f32>(p(31u), p(32u), p(33u));
      hit.material = p(112u);
      hit.roughness = p(114u);
      hit.metalness = p(120u);
      hit.pattern = p(118u);
      hit.normalScale = p(116u);
      hit.clearcoat = 0.45;
      hit.emitter = 0.0;
      hit.exists = 1.0;
    }
  }
  if (direction.z < -0.0001) {
    let t = (p(40u) - origin.z) / direction.z;
    let point = origin + direction * t;
    if (t > 0.001 && t < hit.t && abs(point.x) < p(37u) && point.y > 0.0 && point.y < p(41u)) {
      hit.t = t;
      hit.point = point;
      hit.normal = vec3<f32>(0.0, 0.0, 1.0);
      hit.color = vec3<f32>(p(34u), p(35u), p(36u));
      hit.material = p(113u);
      hit.roughness = p(115u);
      hit.metalness = p(121u);
      hit.pattern = p(119u);
      hit.normalScale = p(117u);
      hit.clearcoat = 0.0;
      hit.emitter = 0.0;
      hit.exists = 1.0;
    }
  }
  for (var index = 0u; index < objectCount(); index = index + 1u) {
    hit = intersectObject(origin, direction, index, hit);
  }
  hit = intersectLightFrame(origin, direction, hit);
  hit = intersectVolumeCage(origin, direction, hit);
  for (var index = 0u; index < lightCount(); index = index + 1u) {
    let normal = lightNormal(index);
    let denom = dot(normal, direction);
    if (abs(denom) < 0.0001 || dot(normal, -direction) <= 0.0) { continue; }
    let center = lightCenter(index);
    let t = dot(normal, center - origin) / denom;
    let local = origin + direction * t - center;
    if (t > 0.001 && t < hit.t && abs(dot(local, lightU(index))) < lightWidth(index) * 0.5 && abs(dot(local, lightV(index))) < lightDepth(index) * 0.5) {
      hit.t = t;
      hit.point = origin + direction * t;
      hit.normal = normal;
      hit.color = lightRadiance(index);
      hit.emitter = 1.0;
      hit.exists = 1.0;
    }
  }
  return hit;
}

fn hash12(point: vec2<f32>) -> f32 {
  let p3 = fract(vec3<f32>(point.xyx) * 0.1031);
  let q3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((q3.x + q3.y) * q3.z);
}

fn surfaceUv(point: vec3<f32>, normal: vec3<f32>) -> vec2<f32> {
  if (abs(normal.y) > 0.75) { return point.xz; }
  if (abs(normal.z) > 0.75) { return point.xy; }
  return point.zy;
}

fn tangentOf(normal: vec3<f32>) -> vec3<f32> {
  let axis = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.y) > 0.86);
  return normalize(cross(axis, normal));
}

fn isGround(hit: Hit) -> bool {
  return hit.objectIndex == -1.0 && hit.normal.y > 0.99 && abs(hit.point.y) < 0.003;
}

fn fancyGroundStencil(point: vec3<f32>) -> vec3<f32> {
  // Raised hollow seal: two thin rims leave the interior material visible.
  // The derivatives below are of an explicit height field; intersections and
  // silhouettes remain planar (a bump/sticker study, not displacement).
  let q = point.xz - vec2<f32>(-1.32, 1.22);
  let radius = max(0.0001, length(q));
  let radial = q / radius;
  let angle = atan2(q.y, q.x);
  let outerDelta = radius - 0.64;
  let innerDelta = radius - 0.55;
  let outer = exp(-0.5 * outerDelta * outerDelta / 0.000324);
  let inner = exp(-0.5 * innerDelta * innerDelta / 0.000169);
  let arc = 0.65 + 0.35 * cos(angle * 6.0);
  let outerDerivative = -0.009 * outerDelta * outer / 0.000324;
  let innerDerivative = -0.006 * innerDelta * inner * arc / 0.000169;
  let angularDerivative = -0.006 * inner * 2.1 * sin(angle * 6.0);
  let angularGradient = vec2<f32>(-q.y, q.x) / (radius * radius);
  let gradient = radial * (outerDerivative + innerDerivative) + angularGradient * angularDerivative;
  return vec3<f32>(gradient, clamp(outer + inner * arc, 0.0, 1.0));
}

// Object-local coordinates keep the texture attached during rigid motion. The
// smooth 3D height field has no cube-projection seams on spheres or tori.
fn texturePoint(hit: Hit) -> vec3<f32> {
  var point = hit.point;
  if (isGround(hit)) {
    let flow = select(p(88u) * p(91u), p(86u) * 0.42, fancyEnabled());
    point = point + vec3<f32>(flow * 0.13, 0.0, flow * 0.07);
  }
  if (hit.objectIndex >= 0.0) {
    let base = u32(hit.objectIndex) * OBJECT_STRIDE;
    let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
    let q = objectRotation(base);
    point = quatRotate(point - center, vec4<f32>(-q.xyz, q.w));
  }
  return point * clamp(p(81u), 0.2, 4.0);
}

fn textureGradient(hit: Hit) -> vec3<f32> {
  let q = texturePoint(hit);
  let a = vec3<f32>(17.0, 23.0, 19.0);
  let b = vec3<f32>(43.0, -29.0, 37.0);
  let c = vec3<f32>(-71.0, 61.0, 53.0);
  var gradient = a * (0.016 * cos(dot(q, a)))
    + b * (0.006 * cos(dot(q, b) + 1.7))
    + c * (0.0018 * cos(dot(q, c) + 3.1));
  if (hit.pattern > 0.5 && hit.pattern < 1.5) {
    let groove = cos(q.y * 91.0 + q.z * 4.0);
    gradient = vec3<f32>(0.04 * cos(q.x * 9.0), 0.5 * groove, (2.0 / 91.0) * groove);
  }
  if (hit.objectIndex >= 0.0) {
    gradient = quatRotate(gradient, objectRotation(u32(hit.objectIndex) * OBJECT_STRIDE));
  }
  return gradient * clamp(p(81u), 0.2, 4.0);
}

fn finishMask(hit: Hit) -> f32 {
  // A continuous, domain-warped 3D mineral/paint texture. This mask blends two
  // complete base responses below, rather than interpolating their roughness.
  let q = texturePoint(hit);
  let warp = q + 0.14 * sin(q.zxy * 5.7 + vec3<f32>(0.7, 1.3, 2.1));
  let veins = sin(warp.x * 11.0 + 2.1 * sin(warp.y * 4.0))
    * cos(warp.z * 7.0 - warp.y * 3.0);
  let base = smoothstep(-0.18, 0.32, veins) * clamp(p(80u), 0.0, 1.0);
  if (fancyEnabled() && isGround(hit)) {
    return max(base * 0.7, fancyGroundStencil(hit.point).z);
  }
  return base;
}

fn mappedNormal(hit: Hit) -> vec3<f32> {
  if (fancyEnabled() && isGround(hit)) {
    let stencil = fancyGroundStencil(hit.point);
    let time = p(86u);
    let wavePhase = hit.point.x * 3.2 + hit.point.z * 4.5 - time * 0.32;
    let ripple = cos(wavePhase) * 0.012;
    let gradient = stencil.xy + vec2<f32>(3.2, 4.5) * ripple;
    return normalize(hit.normal - vec3<f32>(gradient.x, 0.0, gradient.y) * p(78u));
  }
  let tangent = tangentOf(hit.normal);
  let bitangent = normalize(cross(hit.normal, tangent));
  let uv = surfaceUv(hit.point, hit.normal);
  var slope = vec2<f32>(0.0);
  if (hit.pattern > 7.5 && hit.pattern < 8.5) {
    slope = vec2<f32>(sin(uv.x * 22.0), sin(uv.y * 22.0)) * 0.015;
  } else if (hit.pattern > 5.5 && hit.pattern < 6.5) {
    slope = vec2<f32>(sin(uv.x * 78.0 + sin(uv.y * 7.0)), cos(uv.y * 72.0)) * 0.12;
  } else if (hit.pattern > 0.5 && hit.pattern < 1.5) {
    slope = vec2<f32>(sin(uv.y * 92.0) * 0.035, sin(uv.x * 7.0) * 0.008);
  } else if (hit.pattern > 8.5) {
    let cell = floor(uv * 42.0);
    slope = (vec2<f32>(hash12(cell), hash12(cell + vec2<f32>(7.0, 19.0))) - 0.5) * 0.22;
  } else if (hit.pattern > 6.5) {
    slope = vec2<f32>(sin(uv.x * 13.0 + sin(uv.y * 5.0)), cos(uv.y * 11.0 + sin(uv.x * 4.0))) * 0.08;
  }
  // Smooth relief for the opaque material studies; retain the earlier tile and
  // optical textures. This is a shading-normal field, not displaced geometry.
  if (hit.material > 2.5 && hit.material < 7.5 && !(hit.pattern > 7.5 && hit.pattern < 8.5)) {
    let gradient = textureGradient(hit);
    let tangentGradient = gradient - hit.normal * dot(gradient, hit.normal);
    return normalize(hit.normal - tangentGradient * hit.normalScale * p(78u));
  }
  return normalize(hit.normal + (tangent * slope.x + bitangent * slope.y) * hit.normalScale * p(78u));
}

fn mappedColor(hit: Hit) -> vec3<f32> {
  let uv = surfaceUv(hit.point, hit.normal);
  if (fancyEnabled() && isGround(hit)) {
    let stencil = fancyGroundStencil(hit.point).z;
    let wave = 0.5 + 0.5 * sin(hit.point.x * 1.4 - hit.point.z * 1.1 + p(86u) * 0.17);
    let pigment = mix(vec3<f32>(0.045, 0.20, 0.22), vec3<f32>(0.14, 0.26, 0.22), wave);
    return mix(pigment, vec3<f32>(0.50, 0.66, 0.55), stencil);
  }
  if (hit.pattern > 7.5 && hit.pattern < 8.5) {
    let edge = max(smoothstep(0.455, 0.495, abs(fract(uv.x * 0.72) - 0.5)), smoothstep(0.455, 0.495, abs(fract(uv.y * 0.72) - 0.5)));
    return hit.color * mix(1.08, 0.32, edge);
  }
  if (hit.material > 5.5 && hit.material < 6.5) {
    let fiber = 0.92 + 0.08 * sin(uv.y * 46.0 + sin(uv.x * 4.0));
    return hit.color * fiber;
  }
  return hit.color;
}

fn lightVertex(index: u32, corner: u32) -> vec3<f32> {
  let center = lightCenter(index);
  let u = lightU(index) * lightWidth(index) * 0.5;
  let v = lightV(index) * lightDepth(index) * 0.5;
  if (corner == 0u) { return center - u + v; }
  if (corner == 1u) { return center - u - v; }
  if (corner == 2u) { return center + u - v; }
  return center + u + v;
}

// Participating medium: an optional numerical single-scattering study, not an
// LTC volume integral. The density is evaluated in scene space along real rays.
fn mediumLow() -> vec3<f32> { return select(vec3<f32>(-3.8, 0.0, -3.1), fancyCubeLow(), fancyEnabled()); }
fn mediumHigh() -> vec3<f32> { return select(vec3<f32>(3.8, 3.65, 3.65), fancyCubeHigh(), fancyEnabled()); }
fn mediumStrength() -> f32 { return select(clamp(p(82u), 0.0, 2.0), 1.4, fancyEnabled()); }
fn mediumAlbedo() -> f32 { return select(clamp(p(84u), 0.0, 1.0), 0.78, fancyEnabled()); }
fn mediumInterval(origin: vec3<f32>, direction: vec3<f32>) -> vec2<f32> {
  if (fancyEnabled()) {
    return boxInterval(fancyCubePoint(origin), transpose(fancyCubeBasis()) * direction, mediumLow(), mediumHigh());
  }
  return boxInterval(origin, direction, mediumLow(), mediumHigh());
}

fn fancyFilamentDensity(point: vec3<f32>) -> f32 {
  let time = p(86u);
  let q = (point - (fancyCubeLow() + fancyCubeHigh()) * 0.5) * 8.2;
  let w = q + 0.48 * sin(q.yzx * 0.7 + vec3<f32>(time * 0.17, -time * 0.13, time * 0.19));
  let a = sin(w.x) * cos(w.y) + sin(w.y) * cos(w.z) + sin(w.z) * cos(w.x);
  let b = sin(w.x * 1.13 + 0.4) + sin(w.y * 0.97 - 1.1) + sin(w.z * 1.07 + 0.9);
  let tubes = exp(-12.0 * (a * a + 0.55 * b * b));
  let bridges = 0.22 * exp(-30.0 * a * a) * smoothstep(0.35, 0.85, 0.5 + 0.5 * cos(b * 3.0 + 0.4));
  let branchWave = sin(b * 2.0);
  let fineBranches = 0.18 * exp(-45.0 * a * a - 12.0 * branchWave * branchWave);
  return 0.002 + 0.998 * clamp(tubes + bridges + fineBranches, 0.0, 1.0);
}

fn mediumEmission(point: vec3<f32>) -> vec3<f32> {
  if (!fancyEnabled()) { return vec3<f32>(0.0); }
  let q = fancyCubePoint(point) - (fancyCubeLow() + fancyCubeHigh()) * 0.5;
  let pulse = 0.5 + 0.5 * sin(q.x * 3.0 - q.z * 4.0 + p(86u) * 0.5);
  let pigment = mix(vec3<f32>(0.035, 1.0, 0.68), vec3<f32>(1.0, 0.52, 0.06), smoothstep(0.35, 0.85, pulse));
  // A prescribed luminescent source function: emission coefficient j = σt E.
  // This is a bounded emissive procedural field, not a biological simulation.
  return pigment * (5.0 + 1.5 * sin(q.y * 5.0 + p(86u) * 0.7));
}

fn mediumHash(q: vec3<f32>) -> f32 {
  let a = fract(q * vec3<f32>(0.1031, 0.1030, 0.0973));
  let b = a + dot(a, a.yzx + vec3<f32>(33.33));
  return fract((b.x + b.y) * b.z);
}

fn mediumNoise(point: vec3<f32>) -> f32 {
  let cell = floor(point);
  let f = fract(point);
  let u = f * f * (vec3<f32>(3.0) - 2.0 * f);
  let a = mix(mediumHash(cell), mediumHash(cell + vec3<f32>(1.0, 0.0, 0.0)), u.x);
  let b = mix(mediumHash(cell + vec3<f32>(0.0, 1.0, 0.0)), mediumHash(cell + vec3<f32>(1.0, 1.0, 0.0)), u.x);
  let c = mix(mediumHash(cell + vec3<f32>(0.0, 0.0, 1.0)), mediumHash(cell + vec3<f32>(1.0, 0.0, 1.0)), u.x);
  let d = mix(mediumHash(cell + vec3<f32>(0.0, 1.0, 1.0)), mediumHash(cell + vec3<f32>(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

fn mediumDensity(point: vec3<f32>) -> f32 {
  if (fancyEnabled()) {
    let local = fancyCubePoint(point);
    if (any(local < fancyCubeLow()) || any(local > fancyCubeHigh())) { return 0.0; }
    return fancyFilamentDensity(local);
  }
  if (any(point < mediumLow()) || any(point > mediumHigh())) { return 0.0; }
  if (p(83u) < 0.5) { return 1.0; }
  let time = p(86u);
  let q = point * clamp(p(85u), 0.2, 4.0) + vec3<f32>(time * 0.085, -time * 0.055, time * 0.038);
  let warped = q + 0.26 * sin(q.zxy * 1.4 + vec3<f32>(0.2, 2.1, 1.4));
  let noise = mediumNoise(warped * 1.65);
  if (p(83u) > 1.5) {
    let folds = clamp(abs(sin(q.y * 4.4 + q.x * 1.5 + noise * 5.0)), 0.0, 1.0);
    return 0.015 + 0.985 * pow(1.0 - folds, 3.0);
  }
  return 0.03 + 0.97 * smoothstep(0.25, 0.78, noise);
}

fn mediumExtinction(point: vec3<f32>) -> f32 {
  return mediumStrength() * mediumDensity(point);
}

fn mediumLightTransmittance(point: vec3<f32>, lightEndpoint: vec3<f32>) -> f32 {
  if (mediumStrength() <= 0.0) { return 1.0; }
  let delta = lightEndpoint - point;
  let distance = length(delta);
  if (distance < 0.00001) { return 1.0; }
  let direction = delta / distance;
  let interval = mediumInterval(point, direction);
  let nearT = max(0.0, interval.x);
  let farT = min(distance, interval.y);
  if (farT <= nearT) { return 1.0; }
  if (p(83u) < 0.5 && !fancyEnabled()) { return exp(-mediumStrength() * (farT - nearT)); }
  let count = select(4u, 2u, fancyEnabled());
  let stepSize = (farT - nearT) / f32(count);
  var opticalDepth = 0.0;
  for (var step = 0u; step < count; step = step + 1u) {
    opticalDepth = opticalDepth + mediumExtinction(point + direction * (nearT + (f32(step) + 0.5) * stepSize)) * stepSize;
  }
  return exp(-opticalDepth);
}

fn triangleSolidAngle(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> f32 {
  let numerator = abs(dot(a, cross(b, c)));
  let denominator = 1.0 + dot(a, b) + dot(b, c) + dot(c, a);
  return 2.0 * atan2(numerator, denominator);
}

fn quadSolidAngle(point: vec3<f32>, lightIndex: u32) -> f32 {
  if (dot(lightNormal(lightIndex), point - lightCenter(lightIndex)) <= 0.00001) { return 0.0; }
  let a = normalize(lightVertex(lightIndex, 0u) - point);
  let b = normalize(lightVertex(lightIndex, 1u) - point);
  let c = normalize(lightVertex(lightIndex, 2u) - point);
  let d = normalize(lightVertex(lightIndex, 3u) - point);
  return clamp(triangleSolidAngle(a, b, c) + triangleSolidAngle(a, c, d), 0.0, 2.0 * PI);
}

fn mediumIllumination(point: vec3<f32>) -> vec3<f32> {
  var source = vec3<f32>(0.0);
  for (var index = 0u; index < lightCount(); index = index + 1u) {
    // Isotropic phase is constant: the unobstructed angular integral is the
    // quad's ordinary solid angle, not the surface cosine form factor. Light-
    // path attenuation is approximated at the center direction of each quad.
    source = source + lightRadiance(index) * (quadSolidAngle(point, index) / (4.0 * PI))
      * mediumLightTransmittance(point, lightCenter(index));
  }
  return source;
}

fn mediumSegment(sigmaT: f32, distance: f32, albedo: f32, illumination: vec3<f32>) -> vec4<f32> {
  let transmittance = exp(-max(0.0, sigmaT * distance));
  return vec4<f32>(clamp(albedo, 0.0, 1.0) * illumination * (1.0 - transmittance), transmittance);
}

fn integrateMedium(origin: vec3<f32>, direction: vec3<f32>, surfaceDistance: f32, surfaceRadiance: vec3<f32>) -> vec3<f32> {
  if (mediumStrength() <= 0.0) { return surfaceRadiance; }
  let interval = mediumInterval(origin, direction);
  let nearT = max(0.0, interval.x);
  let farT = min(surfaceDistance, interval.y);
  if (farT <= nearT) { return select(surfaceRadiance, vec3<f32>(0.0), p(90u) > 0.5); }
  let steps = select(clamp(u32(p(87u)), 8u, 40u), 28u, fancyEnabled());
  let stepSize = (farT - nearT) / f32(steps);
  var transmittance = 1.0;
  var scattered = vec3<f32>(0.0);
  for (var step = 0u; step < steps; step = step + 1u) {
    let point = origin + direction * (nearT + (f32(step) + 0.5) * stepSize);
    let sigmaT = mediumExtinction(point);
    var illumination = vec3<f32>(0.0);
    if (sigmaT > 0.00001 && mediumAlbedo() > 0.0) { illumination = mediumIllumination(point); }
    let segment = mediumSegment(sigmaT, stepSize, mediumAlbedo(), illumination);
    let emission = mediumEmission(point) * (1.0 - segment.w);
    scattered = scattered + transmittance * (segment.xyz + emission);
    transmittance = transmittance * segment.w;
  }
  return scattered + select(transmittance * surfaceRadiance, vec3<f32>(0.0), p(90u) > 0.5);
}

fn clipHemisphere(inputDirs: array<vec3<f32>, 8>, inputCount: u32, normal: vec3<f32>) -> ClipResult {
  var result: ClipResult;
  result.count = 0u;
  for (var index = 0u; index < inputCount; index = index + 1u) {
    let currentDir = inputDirs[index];
    let nextDir = inputDirs[(index + 1u) % inputCount];
    let currentDot = dot(currentDir, normal);
    let nextDot = dot(nextDir, normal);
    let currentInside = currentDot >= -0.0000001;
    let nextInside = nextDot >= -0.0000001;
    if (currentInside && result.count < 8u) {
      result.dirs[result.count] = currentDir;
      result.count = result.count + 1u;
    }
    if (currentInside != nextInside && result.count < 8u) {
      let edgeT = currentDot / (currentDot - nextDot);
      result.dirs[result.count] = normalize(mix(currentDir, nextDir, edgeT));
      result.count = result.count + 1u;
    }
  }
  return result;
}

fn boundaryIrradiance(inputDirs: array<vec3<f32>, 8>, inputCount: u32, normal: vec3<f32>) -> f32 {
  var dirs = inputDirs;
  var count = inputCount;
  if (p(6u) > 0.5) {
    let clipped = clipHemisphere(dirs, count, normal);
    dirs = clipped.dirs;
    count = clipped.count;
  }
  if (count < 3u) { return 0.0; }
  var boundary = 0.0;
  for (var index = 0u; index < count; index = index + 1u) {
    let a = dirs[index];
    let b = dirs[(index + 1u) % count];
    let edge = cross(a, b);
    let edgeLength = length(edge);
    if (edgeLength > 0.0000001) {
      boundary = boundary + atan2(edgeLength, dot(a, b)) * dot(normal, edge / edgeLength);
    }
  }
  return max(0.0, -0.5 * boundary);
}

fn projectedIrradiance(point: vec3<f32>, normal: vec3<f32>, lightIndex: u32) -> f32 {
  if (dot(lightNormal(lightIndex), point - lightCenter(lightIndex)) <= 0.0) { return 0.0; }
  var dirs: array<vec3<f32>, 8>;
  dirs[0] = normalize(lightVertex(lightIndex, 0u) - point);
  dirs[1] = normalize(lightVertex(lightIndex, 1u) - point);
  dirs[2] = normalize(lightVertex(lightIndex, 2u) - point);
  dirs[3] = normalize(lightVertex(lightIndex, 3u) - point);
  return boundaryIrradiance(dirs, 4u, normal);
}

fn blockerVertex(corner: u32) -> vec3<f32> {
  let base = 5u * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let q = objectRotation(base);
  let halfWidth = objectValue(base + 3u);
  let halfHeight = objectValue(base + 9u) * 0.5;
  var local = vec3<f32>(-halfWidth, halfHeight, 0.0);
  if (corner == 1u) { local = vec3<f32>(-halfWidth, -halfHeight, 0.0); }
  if (corner == 2u) { local = vec3<f32>(halfWidth, -halfHeight, 0.0); }
  if (corner == 3u) { local = vec3<f32>(halfWidth, halfHeight, 0.0); }
  return center + quatRotate(local, q);
}

fn blockerOverlap(point: vec3<f32>, normal: vec3<f32>, lightIndex: u32) -> f32 {
  if (objectCount() < 6u || objectValue(5u * OBJECT_STRIDE + 27u) < 0.5) { return 0.0; }
  let base = 5u * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let q = objectRotation(base);
  let blockerNormal = normalize(quatRotate(vec3<f32>(0.0, 0.0, 1.0), q));
  let blockerU = normalize(quatRotate(vec3<f32>(1.0, 0.0, 0.0), q));
  let blockerV = normalize(quatRotate(vec3<f32>(0.0, 1.0, 0.0), q));
  let lightN = lightNormal(lightIndex);
  let lightAxisU = lightU(lightIndex);
  let lightAxisV = lightV(lightIndex);
  if (abs(dot(blockerNormal, lightN)) < 0.999 || abs(dot(blockerU, lightAxisU)) < 0.999 || abs(dot(blockerV, lightAxisV)) < 0.999) { return 0.0; }
  let denominator = dot(lightN, center - point);
  if (abs(denominator) < 0.000001) { return 0.0; }
  let projectionT = dot(lightN, lightCenter(lightIndex) - point) / denominator;
  if (projectionT <= 1.0001) { return 0.0; }
  var minUv = vec2<f32>(1e20);
  var maxUv = vec2<f32>(-1e20);
  for (var corner = 0u; corner < 4u; corner = corner + 1u) {
    let projected = point + (blockerVertex(corner) - point) * projectionT;
    let local = projected - lightCenter(lightIndex);
    let uv = vec2<f32>(dot(local, lightAxisU), dot(local, lightAxisV));
    minUv = min(minUv, uv);
    maxUv = max(maxUv, uv);
  }
  let halfSize = vec2<f32>(lightWidth(lightIndex), lightDepth(lightIndex)) * 0.5;
  let clippedMin = max(minUv, -halfSize);
  let clippedMax = min(maxUv, halfSize);
  if (clippedMin.x >= clippedMax.x || clippedMin.y >= clippedMax.y) { return 0.0; }
  let centerLight = lightCenter(lightIndex);
  var dirs: array<vec3<f32>, 8>;
  dirs[0] = normalize(centerLight + lightAxisU * clippedMin.x + lightAxisV * clippedMax.y - point);
  dirs[1] = normalize(centerLight + lightAxisU * clippedMin.x + lightAxisV * clippedMin.y - point);
  dirs[2] = normalize(centerLight + lightAxisU * clippedMax.x + lightAxisV * clippedMin.y - point);
  dirs[3] = normalize(centerLight + lightAxisU * clippedMax.x + lightAxisV * clippedMax.y - point);
  return boundaryIrradiance(dirs, 4u, normal);
}

fn analyticIrradiance(point: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  var total = vec3<f32>(0.0);
  for (var index = 0u; index < lightCount(); index = index + 1u) {
    let full = projectedIrradiance(point, normal, index);
    let visible = max(0.0, full - min(full, blockerOverlap(point, normal, index)));
    total = total + lightRadiance(index) * visible * mediumLightTransmittance(point, lightCenter(index));
  }
  return total;
}

fn random01(seed: u32) -> f32 {
  var value = seed * 747796405u + 2891336453u;
  value = ((value >> ((value >> 28u) + 4u)) ^ value) * 277803737u;
  value = (value >> 22u) ^ value;
  return f32(value) * (1.0 / 4294967296.0);
}

fn segmentBlocked(point: vec3<f32>, lightPoint: vec3<f32>) -> bool {
  if (objectCount() < 6u || objectValue(5u * OBJECT_STRIDE + 27u) < 0.5) { return false; }
  let base = 5u * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let q = objectRotation(base);
  let invQ = vec4<f32>(-q.xyz, q.w);
  let normal = normalize(quatRotate(vec3<f32>(0.0, 0.0, 1.0), q));
  let segment = lightPoint - point;
  let denominator = dot(normal, segment);
  if (abs(denominator) < 0.000001) { return false; }
  let segmentT = dot(normal, center - point) / denominator;
  if (segmentT <= 0.001 || segmentT >= 0.999) { return false; }
  let local = quatRotate(point + segment * segmentT - center, invQ);
  return abs(local.x) <= objectValue(base + 3u) && abs(local.y) <= objectValue(base + 9u) * 0.5;
}

fn sampledIrradiance(point: vec3<f32>, normal: vec3<f32>, pixelSeed: u32) -> vec3<f32> {
  let sampleCount = max(1u, min(64u, u32(p(3u))));
  var total = vec3<f32>(0.0);
  for (var lightIndex = 0u; lightIndex < lightCount(); lightIndex = lightIndex + 1u) {
    let lightN = lightNormal(lightIndex);
    if (dot(lightN, point - lightCenter(lightIndex)) <= 0.0) { continue; }
    let area = lightWidth(lightIndex) * lightDepth(lightIndex);
    var estimate = 0.0;
    for (var sampleIndex = 0u; sampleIndex < sampleCount; sampleIndex = sampleIndex + 1u) {
      let key = pixelSeed ^ (lightIndex * 2246822519u) ^ (sampleIndex * 3266489917u);
      let sx = (random01(key) - 0.5) * lightWidth(lightIndex);
      let sy = (random01(key + 1u) - 0.5) * lightDepth(lightIndex);
      let samplePoint = lightCenter(lightIndex) + lightU(lightIndex) * sx + lightV(lightIndex) * sy;
      if (segmentBlocked(point, samplePoint)) { continue; }
      let toLight = samplePoint - point;
      let distance2 = max(dot(toLight, toLight), 0.000001);
      let wi = toLight * inverseSqrt(distance2);
      estimate = estimate + max(0.0, dot(normal, wi)) * max(0.0, dot(lightN, -wi)) * area / distance2;
    }
    total = total + lightRadiance(lightIndex) * estimate / f32(sampleCount)
      * mediumLightTransmittance(point, lightCenter(lightIndex));
  }
  return total;
}

fn ltcEdge(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
  let cosine = clamp(dot(a, b), -0.999999, 0.999999);
  let absoluteCosine = abs(cosine);
  let numerator = 0.8543985 + (0.4965155 + 0.0145206 * absoluteCosine) * absoluteCosine;
  let denominator = 3.4175940 + (4.1616724 + absoluteCosine) * absoluteCosine;
  let approximation = numerator / denominator;
  let factor = select(0.5 * inverseSqrt(max(1.0 - cosine * cosine, 0.0000001)) - approximation, approximation, cosine > 0.0);
  return cross(a, b) * factor;
}

fn ltcFormFactor(normal: vec3<f32>, viewDir: vec3<f32>, point: vec3<f32>, roughness: f32, anisotropy: f32, lightIndex: u32) -> f32 {
  if (dot(lightNormal(lightIndex), point - lightCenter(lightIndex)) <= 0.0) { return 0.0; }
  let dotNV = clamp(dot(normal, viewDir), 0.0, 1.0);
  let uv = (vec2<f32>(clamp(roughness, 0.001, 1.0), sqrt(max(0.0, 1.0 - dotNV))) * 63.0 + vec2<f32>(0.5)) / 64.0;
  let matrixSample = textureSampleLevel(ltcMatrixLut, ltcSampler, uv, 0.0);
  let inverseMatrix = mat3x3<f32>(
    vec3<f32>(matrixSample.x, 0.0, matrixSample.y),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(matrixSample.z, 0.0, matrixSample.w)
  );
  let projectedView = viewDir - normal * dot(viewDir, normal);
  var viewTangent = tangentOf(normal);
  if (dot(projectedView, projectedView) > 0.0000001) { viewTangent = normalize(projectedView); }
  let viewBitangent = -normalize(cross(normal, viewTangent));
  let worldToView = transpose(mat3x3<f32>(viewTangent, viewBitangent, normal));
  let stretch = 1.0 + clamp(anisotropy, 0.0, 0.92) * 1.45;
  let anisotropicTransform = mat3x3<f32>(
    vec3<f32>(stretch, 0.0, 0.0),
    vec3<f32>(0.0, 1.0 / stretch, 0.0),
    vec3<f32>(0.0, 0.0, 1.0)
  );
  let transform = anisotropicTransform * inverseMatrix * worldToView;
  let c0 = normalize(transform * (lightVertex(lightIndex, 0u) - point));
  let c1 = normalize(transform * (lightVertex(lightIndex, 1u) - point));
  let c2 = normalize(transform * (lightVertex(lightIndex, 2u) - point));
  let c3 = normalize(transform * (lightVertex(lightIndex, 3u) - point));
  let vectorFactor = ltcEdge(c0, c1) + ltcEdge(c1, c2) + ltcEdge(c2, c3) + ltcEdge(c3, c0);
  let lengthFactor = length(vectorFactor);
  return max((lengthFactor * lengthFactor + vectorFactor.z) / (lengthFactor + 1.0), 0.0);
}

fn ltcSpecular(point: vec3<f32>, incomingDir: vec3<f32>, normal: vec3<f32>, roughness: f32, anisotropy: f32, f0: vec3<f32>) -> vec3<f32> {
  let viewDir = normalize(-incomingDir);
  if (dot(normal, viewDir) <= 0.0) { return vec3<f32>(0.0); }
  let dotNV = clamp(dot(normal, viewDir), 0.0, 1.0);
  let uv = (vec2<f32>(clamp(roughness, 0.001, 1.0), sqrt(max(0.0, 1.0 - dotNV))) * 63.0 + vec2<f32>(0.5)) / 64.0;
  let amplitude = textureSampleLevel(ltcAmplitudeLut, ltcSampler, uv, 0.0);
  let fresnel = f0 * amplitude.x + (vec3<f32>(1.0) - f0) * amplitude.y;
  var total = vec3<f32>(0.0);
  for (var index = 0u; index < lightCount(); index = index + 1u) {
    total = total + lightRadiance(index) * ltcFormFactor(normal, viewDir, point, roughness, anisotropy, index)
      * mediumLightTransmittance(point, lightCenter(index));
  }
  return total * fresnel;
}

// Height-correlated Smith GGX and Schlick Fresnel. The perceptual roughness
// parameter maps to alpha=roughness^2, matching the published GGX LTC table.
fn ggxBrdf(normal: vec3<f32>, viewDir: vec3<f32>, lightDir: vec3<f32>, roughness: f32, anisotropy: f32, f0: vec3<f32>) -> vec3<f32> {
  let nv = dot(normal, viewDir);
  let nl = dot(normal, lightDir);
  if (nv <= 0.0 || nl <= 0.0) { return vec3<f32>(0.0); }
  let halfDir = normalize(viewDir + lightDir);
  let tangent = tangentOf(normal);
  let bitangent = cross(normal, tangent);
  let alpha = max(0.000625, roughness * roughness);
  let stretch = 1.0 + clamp(anisotropy, 0.0, 0.92) * 1.45;
  let ax = max(0.00025, alpha / stretch);
  let ay = max(0.00025, alpha * stretch);
  let h = vec3<f32>(dot(halfDir, tangent) / ax, dot(halfDir, bitangent) / ay, dot(halfDir, normal));
  let denominator = dot(h, h);
  let distribution = 1.0 / (PI * ax * ay * denominator * denominator);
  let vx = ax * dot(viewDir, tangent);
  let vy = ay * dot(viewDir, bitangent);
  let lx = ax * dot(lightDir, tangent);
  let ly = ay * dot(lightDir, bitangent);
  let visibility = 0.5 / max(0.0000001, nl * sqrt(nv * nv + vx * vx + vy * vy) + nv * sqrt(nl * nl + lx * lx + ly * ly));
  let fresnel = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - clamp(dot(viewDir, halfDir), 0.0, 1.0), 5.0);
  return distribution * visibility * fresnel;
}

fn sampledSpecular(point: vec3<f32>, incomingDir: vec3<f32>, normal: vec3<f32>, roughness: f32, anisotropy: f32, f0: vec3<f32>, pixelSeed: u32) -> vec3<f32> {
  let sampleCount = max(1u, min(64u, u32(p(3u))));
  let viewDir = -incomingDir;
  var total = vec3<f32>(0.0);
  for (var lightIndex = 0u; lightIndex < lightCount(); lightIndex = lightIndex + 1u) {
    let lightN = lightNormal(lightIndex);
    if (dot(lightN, point - lightCenter(lightIndex)) <= 0.0) { continue; }
    let area = lightWidth(lightIndex) * lightDepth(lightIndex);
    var estimate = vec3<f32>(0.0);
    for (var sampleIndex = 0u; sampleIndex < sampleCount; sampleIndex = sampleIndex + 1u) {
      let key = pixelSeed ^ (lightIndex * 2246822519u) ^ (sampleIndex * 3266489917u);
      let samplePoint = lightCenter(lightIndex)
        + lightU(lightIndex) * ((random01(key) - 0.5) * lightWidth(lightIndex))
        + lightV(lightIndex) * ((random01(key + 1u) - 0.5) * lightDepth(lightIndex));
      let toLight = samplePoint - point;
      let distance2 = max(dot(toLight, toLight), 0.000001);
      let wi = toLight * inverseSqrt(distance2);
      // Both glossy estimators integrate unoccluded emitters. The restricted
      // rectangle blocker is handled by the diffuse comparison only.
      let geometry = max(0.0, dot(normal, wi)) * max(0.0, dot(lightN, -wi)) * area / distance2;
      estimate = estimate + ggxBrdf(normal, viewDir, wi, roughness, anisotropy, f0) * geometry;
    }
    total = total + lightRadiance(lightIndex) * estimate / f32(sampleCount)
      * mediumLightTransmittance(point, lightCenter(lightIndex));
  }
  return total;
}

fn directSpecular(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>, roughness: f32, anisotropy: f32, f0: vec3<f32>, variant: u32, pixelSeed: u32) -> vec3<f32> {
  if (variant == 1u) { return sampledSpecular(hit.point, incomingDir, normal, roughness, anisotropy, f0, pixelSeed); }
  return ltcSpecular(hit.point, incomingDir, normal, roughness, anisotropy, f0);
}

fn ltcIrradiance(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  return ltcSpecular(hit.point, incomingDir, normal, hit.roughness, hit.anisotropy, mix(vec3<f32>(0.04), hit.color, vec3<f32>(hit.metalness)));
}

fn dielectricFresnel(cosineIncident: f32, etaIncident: f32, etaTransmitted: f32) -> f32 {
  let ci = clamp(cosineIncident, 0.0, 1.0);
  let eta = etaIncident / etaTransmitted;
  let sinTransmitted2 = eta * eta * max(0.0, 1.0 - ci * ci);
  if (sinTransmitted2 >= 1.0) { return 1.0; }
  let ct = sqrt(max(0.0, 1.0 - sinTransmitted2));
  let rs = (etaTransmitted * ci - etaIncident * ct) / max(0.000001, etaTransmitted * ci + etaIncident * ct);
  let rp = (etaIncident * ci - etaTransmitted * ct) / max(0.000001, etaIncident * ci + etaTransmitted * ct);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}

fn sphereRefractPath(hit: Hit, incomingDir: vec3<f32>, ior: f32) -> RefractPath {
  var path: RefractPath;
  path.origin = hit.point;
  path.direction = reflect(incomingDir, hit.normal);
  path.distance = 0.0;
  path.exitTransmission = 0.0;
  path.valid = 0.0;
  if (hit.objectIndex < 0.0 || hit.shape > 0.5) { return path; }
  let base = u32(hit.objectIndex) * OBJECT_STRIDE;
  let center = vec3<f32>(objectValue(base), objectValue(base + 1u), objectValue(base + 2u));
  let radius = objectValue(base + 3u);
  let eta = max(1.01, ior);
  let insideDirection = refract(incomingDir, hit.normal, 1.0 / eta);
  if (dot(insideDirection, insideDirection) < 0.000001) { return path; }
  let insideOrigin = hit.point - hit.normal * 0.003;
  let offset = insideOrigin - center;
  let b = dot(offset, insideDirection);
  let c = dot(offset, offset) - radius * radius;
  let discriminant = b * b - c;
  if (discriminant <= 0.0) { return path; }
  let exitDistance = -b + sqrt(discriminant);
  let exitPoint = insideOrigin + insideDirection * exitDistance;
  let exitNormal = normalize(exitPoint - center);
  let exitDirection = refract(insideDirection, -exitNormal, eta);
  if (dot(exitDirection, exitDirection) < 0.000001) { return path; }
  path.origin = exitPoint + exitNormal * 0.003;
  path.direction = normalize(exitDirection);
  path.distance = exitDistance;
  path.exitTransmission = 1.0 - dielectricFresnel(max(0.0, dot(insideDirection, exitNormal)), eta, 1.0);
  path.valid = 1.0;
  return path;
}

fn background(direction: vec3<f32>) -> vec3<f32> {
  let sky = 0.5 + 0.5 * clamp(direction.y, -1.0, 1.0);
  return mix(vec3<f32>(0.018, 0.024, 0.03), vec3<f32>(0.07, 0.12, 0.14), sky);
}

fn transmittedRoom(origin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  var color = background(direction);
  var closest = 1e20;
  if (direction.y < -0.0001) {
    let t = -origin.y / direction.y;
    let point = origin + direction * t;
    if (t > 0.0 && abs(point.x) < p(37u) && point.z > p(38u) && point.z < p(39u)) {
      let edge = max(smoothstep(0.455, 0.495, abs(fract(point.x * 0.72) - 0.5)), smoothstep(0.455, 0.495, abs(fract(point.z * 0.72) - 0.5)));
      color = vec3<f32>(p(31u), p(32u), p(33u)) * mix(0.95, 0.32, edge);
      closest = t;
    }
  }
  if (direction.z < -0.0001) {
    let t = (p(40u) - origin.z) / direction.z;
    let point = origin + direction * t;
    if (t > 0.0 && t < closest && abs(point.x) < p(37u) && point.y > 0.0 && point.y < p(41u)) {
      color = vec3<f32>(p(34u), p(35u), p(36u)) * (0.72 + 0.1 * sin(point.x * 8.0));
      closest = t;
    }
  }
  for (var index = 0u; index < lightCount(); index = index + 1u) {
    let normal = lightNormal(index);
    let denominator = dot(normal, direction);
    if (abs(denominator) < 0.0001 || dot(normal, -direction) <= 0.0) { continue; }
    let center = lightCenter(index);
    let t = dot(normal, center - origin) / denominator;
    let local = origin + direction * t - center;
    if (t > 0.001 && t < closest && abs(dot(local, lightU(index))) < lightWidth(index) * 0.5 && abs(dot(local, lightV(index))) < lightDepth(index) * 0.5) {
      color = lightRadiance(index) * 0.1;
      closest = t;
    }
  }
  return color;
}

fn glassTransmission(hit: Hit, incomingDir: vec3<f32>) -> vec3<f32> {
  let spread = hit.dispersion;
  let redPath = sphereRefractPath(hit, incomingDir, hit.ior - spread);
  let greenPath = sphereRefractPath(hit, incomingDir, hit.ior);
  let bluePath = sphereRefractPath(hit, incomingDir, hit.ior + spread);
  if (redPath.valid < 0.5 || greenPath.valid < 0.5 || bluePath.valid < 0.5) { return background(reflect(incomingDir, hit.normal)); }
  let redColor = transmittedRoom(redPath.origin, redPath.direction);
  let greenColor = transmittedRoom(greenPath.origin, greenPath.direction);
  let blueColor = transmittedRoom(bluePath.origin, bluePath.direction);
  let coefficient = (vec3<f32>(1.0) - clamp(hit.color, vec3<f32>(0.02), vec3<f32>(1.0))) * (0.3 + hit.absorption * 3.2);
  let attenuation = vec3<f32>(
    exp(-coefficient.x * redPath.distance),
    exp(-coefficient.y * greenPath.distance),
    exp(-coefficient.z * bluePath.distance)
  );
  let exitTransmission = vec3<f32>(redPath.exitTransmission, greenPath.exitTransmission, bluePath.exitTransmission);
  return vec3<f32>(redColor.x, greenColor.y, blueColor.z) * attenuation * exitTransmission;
}

fn thinFilmColor(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let cosine = clamp(dot(-incomingDir, normal), 0.0, 1.0);
  let opticalPath = 2.0 * hit.ior * objectValue(u32(hit.objectIndex) * OBJECT_STRIDE + 10u) * sqrt(max(0.0, 1.0 - (1.0 - cosine * cosine) / (hit.ior * hit.ior)));
  let wavelengths = vec3<f32>(0.65, 0.53, 0.46);
  let phase = 2.0 * PI * opticalPath / wavelengths + vec3<f32>(0.0, 0.62, 1.24);
  return vec3<f32>(0.28) + vec3<f32>(0.72) * (vec3<f32>(0.5) + vec3<f32>(0.5) * cos(phase));
}

fn surfaceRoughness(hit: Hit) -> f32 {
  if (hit.pattern < 0.5 || (hit.pattern > 7.5 && hit.pattern < 8.5)) { return clamp(hit.roughness, 0.025, 1.0); }
  let q = texturePoint(hit);
  return clamp(hit.roughness * (0.90 + 0.18 * sin(dot(q, vec3<f32>(19.0, 7.0, 13.0)))), 0.025, 1.0);
}

fn coatedSurface(hit: Hit, incomingDir: vec3<f32>, normal: vec3<f32>, diffuse: vec3<f32>, variant: u32, pixelSeed: u32) -> vec3<f32> {
  let mask = finishMask(hit);
  let roughness = hit.roughness; // already sampled once in shade()
  let viewCosine = max(0.0, dot(-incomingDir, normal));
  let isPaint = hit.material > 4.5;
  let pigmentMetalness = select(0.0, clamp(hit.metalness, 0.0, 0.8), isPaint);
  let pigmentF0 = mix(vec3<f32>(0.04), hit.color, vec3<f32>(pigmentMetalness));
  let pigmentFresnel = pigmentF0 + (vec3<f32>(1.0) - pigmentF0) * pow(1.0 - viewCosine, 5.0);
  var pigment = diffuse * (vec3<f32>(1.0) - pigmentFresnel) * (1.0 - pigmentMetalness);
  // Coated uses a matte substrate; car paint uses a diffuse + microfacet base.
  if (isPaint) {
    pigment = pigment + directSpecular(hit, incomingDir, normal, roughness, 0.0, pigmentF0, variant, pixelSeed);
  }
  let metalF0 = vec3<f32>(0.72, 0.52, 0.25);
  let metalRoughness = clamp(0.26 + roughness * 0.30, 0.08, 0.7);
  var metal = vec3<f32>(0.0);
  if (mask > 0.0) {
    metal = directSpecular(hit, incomingDir, normal, metalRoughness, 0.0, metalF0, variant, pixelSeed);
  }
  let base = mix(pigment, metal, mask);

  // A separately evaluated dielectric GGX coat has its own roughness and a
  // smoother normal. Two-way base attenuation uses view Fresnel and a cosine-
  // weighted Schlick average (F0 + (1-F0)/21), not an exact layered transport.
  let coatWeight = clamp(hit.clearcoat * p(79u), 0.0, 1.0);
  let coatNormal = normalize(mix(hit.normal, normal, 0.18));
  let coatRoughness = 0.09 + 0.035 * mask;
  let eta = max(1.01, hit.ior);
  let coatF0 = ((eta - 1.0) / (eta + 1.0)) * ((eta - 1.0) / (eta + 1.0));
  let coatFv = coatF0 + (1.0 - coatF0) * pow(1.0 - max(0.0, dot(-incomingDir, coatNormal)), 5.0);
  let coatFavg = coatF0 + (1.0 - coatF0) / 21.0;
  let transmission = (1.0 - coatWeight * coatFv) * (1.0 - coatWeight * coatFavg);
  var coat = vec3<f32>(0.0);
  if (coatWeight > 0.0) {
    coat = coatWeight * directSpecular(hit, incomingDir, coatNormal, coatRoughness, 0.0, vec3<f32>(coatF0), variant, pixelSeed);
  }
  if (u32(p(77u)) == 4u) { return base * transmission; }
  if (u32(p(77u)) == 5u) { return coat; }
  return base * transmission + coat;
}

fn shade(hit: Hit, incomingDir: vec3<f32>, variant: u32, pixelSeed: u32) -> vec3<f32> {
  let materialView = u32(p(77u));
  if (hit.exists < 0.5) { return select(background(incomingDir), vec3<f32>(0.025), materialView > 0u); }
  if (hit.emitter > 0.5) { return select(hit.color, vec3<f32>(0.09), materialView > 0u); }
  let normal = mappedNormal(hit);
  if (materialView == 1u) { return normal * 0.5 + vec3<f32>(0.5); }
  if (materialView == 2u) { return vec3<f32>(surfaceRoughness(hit)); }
  let layered = hit.material > 3.5 && hit.material < 5.5;
  if (materialView == 3u) {
    return mix(vec3<f32>(0.06, 0.30, 0.34), vec3<f32>(0.95, 0.68, 0.20), select(0.0, finishMask(hit), layered));
  }
  if (materialView == 5u && !layered) { return vec3<f32>(0.0); }
  var shadedHit = hit;
  shadedHit.color = mappedColor(hit);
  shadedHit.roughness = surfaceRoughness(hit);
  var direct: vec3<f32>;
  if (variant == 1u) {
    direct = sampledIrradiance(hit.point, normal, pixelSeed);
  } else {
    direct = analyticIrradiance(hit.point, normal);
  }
  let fill = select(vec3<f32>(0.0), shadedHit.color * (0.025 + 0.035 * max(0.0, normal.y)), p(7u) > 0.5);
  let diffuse = shadedHit.color * direct * INV_PI + fill;

  if (layered) { return coatedSurface(shadedHit, incomingDir, normal, diffuse, variant, pixelSeed); }

  if (hit.material > 0.5 && hit.material < 1.5) {
    return background(normalize(reflect(incomingDir, normal)));
  }

  var glossyHit = shadedHit;
  if (hit.material > 1.5 && hit.material < 2.5) {
    glossyHit.color = vec3<f32>(1.0);
    glossyHit.roughness = 0.08;
    glossyHit.metalness = 1.0;
  } else if (hit.material > 6.5 && hit.material < 7.5) {
    glossyHit.metalness = max(0.84, hit.metalness);
  }
  var glossy = vec3<f32>(0.0);
  if ((hit.material > 1.5 && hit.material < 5.5) || hit.material > 6.5) {
    if ((hit.material > 2.5 && hit.material < 3.5) || (hit.material > 6.5 && hit.material < 7.5)) {
      glossy = directSpecular(glossyHit, incomingDir, normal, glossyHit.roughness, glossyHit.anisotropy,
        mix(vec3<f32>(0.04), glossyHit.color, vec3<f32>(glossyHit.metalness)), variant, pixelSeed);
    } else {
      glossy = ltcIrradiance(glossyHit, incomingDir, normal);
    }
  }

  if (hit.material > 1.5 && hit.material < 2.5) {
    let reflected = background(normalize(reflect(incomingDir, normal)));
    return thinFilmColor(hit, incomingDir, normal) * (reflected * 1.2 + glossy * 0.72);
  }

  if (hit.material > 8.5) {
    let fresnel = dielectricFresnel(max(0.0, dot(-incomingDir, normal)), 1.0, hit.ior);
    return glassTransmission(hit, incomingDir) * hit.transmission * (1.0 - fresnel) + glossy * (0.22 + fresnel) + diffuse * 0.025;
  }
  if (hit.material > 7.5) {
    let fresnel = dielectricFresnel(max(0.0, dot(-incomingDir, normal)), 1.0, hit.ior);
    return glassTransmission(hit, incomingDir) * hit.transmission * 0.7 * (1.0 - fresnel) + glossy * (0.32 + fresnel) + diffuse * 0.1;
  }
  if (hit.material > 6.5) { return glossy + diffuse * 0.05; }
  if (hit.material > 5.5) { return diffuse * 1.08; }
  if (hit.material > 2.5) { return diffuse * (1.0 - hit.metalness) * 0.12 + glossy; }
  return diffuse;
}

fn toneMap(color: vec3<f32>) -> vec3<f32> {
  let mapped = vec3<f32>(1.0) - exp(-max(vec3<f32>(0.0), color * p(5u)));
  return pow(mapped, vec3<f32>(0.45454545));
}

fn falseColor(color: vec3<f32>) -> vec3<f32> {
  let luminance = clamp(dot(color, vec3<f32>(0.2126, 0.7152, 0.0722)) * p(5u) * 0.52, 0.0, 1.0);
  if (luminance < 0.5) { return mix(vec3<f32>(0.02, 0.12, 0.28), vec3<f32>(0.08, 0.68, 0.62), luminance * 2.0); }
  return mix(vec3<f32>(0.08, 0.68, 0.62), vec3<f32>(1.0, 0.25, 0.12), (luminance - 0.5) * 2.0);
}

fn rayDirection(pixel: vec2<f32>, dimensions: vec2<f32>) -> vec3<f32> {
  let aspect = dimensions.x / dimensions.y;
  let screen = vec2<f32>(2.0 * pixel.x / dimensions.x - 1.0, 1.0 - 2.0 * pixel.y / dimensions.y);
  let right = vec3<f32>(p(16u), p(17u), p(18u));
  let up = vec3<f32>(p(19u), p(20u), p(21u));
  let forward = vec3<f32>(p(22u), p(23u), p(24u));
  return normalize(forward + right * screen.x * aspect * p(15u) + up * screen.y * p(15u));
}

fn aaOffset(index: u32, count: u32) -> vec2<f32> {
  if (count <= 1u) { return vec2<f32>(0.5); }
  if (count == 2u) { return select(vec2<f32>(0.28), vec2<f32>(0.72), index > 0u); }
  if (index == 0u) { return vec2<f32>(0.25, 0.25); }
  if (index == 1u) { return vec2<f32>(0.75, 0.25); }
  if (index == 2u) { return vec2<f32>(0.25, 0.75); }
  return vec2<f32>(0.75, 0.75);
}

fn sampleColor(cameraOrigin: vec3<f32>, direction: vec3<f32>, gid: vec3<u32>, sampleIndex: u32, width: f32) -> vec3<f32> {
  let hit = intersectScene(cameraOrigin, direction);
  let mode = u32(p(2u));
  let pixelSeed = u32(p(9u)) ^ (gid.x * 374761393u) ^ (gid.y * 668265263u) ^ (sampleIndex * 362437u);
  let splitX = u32(clamp(p(4u), 0.0, 1.0) * width);
  let sampled = mode == 1u || (mode == 2u && gid.x > splitX);
  let surfaceColor = shade(hit, direction, select(0u, 1u, sampled), pixelSeed);
  if (u32(p(77u)) != 0u) { return surfaceColor; }
  return integrateMedium(cameraOrigin, direction, hit.t, surfaceColor);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dimensionsU = textureDimensions(frameTexture);
  if (gid.x >= dimensionsU.x || gid.y >= dimensionsU.y) { return; }
  let dimensions = vec2<f32>(dimensionsU);
  let cameraOrigin = vec3<f32>(p(12u), p(13u), p(14u));
  let aaCount = max(1u, min(4u, u32(p(122u))));
  let materialView = u32(p(77u));
  let scalarDiagnostic = materialView >= 1u && materialView <= 3u;
  let aperture = select(max(0.0, p(125u)), 0.0, scalarDiagnostic);
  let sampleCount = select(aaCount, max(aaCount, clamp(u32(p(127u)), 4u, 16u)), aperture > 0.0);
  let forward = normalize(vec3<f32>(p(22u), p(23u), p(24u)));
  let right = vec3<f32>(p(16u), p(17u), p(18u));
  let up = vec3<f32>(p(19u), p(20u), p(21u));
  let lensRotation = 2.0 * PI * random01((gid.x * 1597334677u) ^ (gid.y * 3812015801u));
  var color = vec3<f32>(0.0);
  for (var sampleIndex = 0u; sampleIndex < sampleCount; sampleIndex = sampleIndex + 1u) {
    let pixel = vec2<f32>(gid.xy) + aaOffset(sampleIndex % aaCount, aaCount);
    let direction = rayDirection(pixel, dimensions);
    var rayOrigin = cameraOrigin;
    var rayDir = direction;
    if (aperture > 0.0) {
      // Thin lens: all aperture samples for this film sample meet the same
      // forward-facing focal plane. Lens quadrature is separate from the
      // sample-free LTC angular-light integral; no image-space blur is applied.
      let focusT = max(0.05, p(126u)) / max(0.0001, dot(direction, forward));
      let focusPoint = cameraOrigin + direction * focusT;
      let radius = aperture * sqrt((f32(sampleIndex) + 0.5) / f32(sampleCount));
      let angle = f32(sampleIndex) * 2.399963229728653 + lensRotation;
      rayOrigin = cameraOrigin + right * (radius * cos(angle)) + up * (radius * sin(angle));
      rayDir = normalize(focusPoint - rayOrigin);
    }
    color = color + sampleColor(rayOrigin, rayDir, gid, sampleIndex, dimensions.x);
  }
  color = color / f32(sampleCount);
  var mapped = select(toneMap(color), falseColor(color), p(8u) > 0.5);
  if (scalarDiagnostic) { mapped = color; }
  if (u32(p(2u)) == 2u && abs(i32(gid.x) - i32(clamp(p(4u), 0.0, 1.0) * dimensions.x)) == 0) { mapped = vec3<f32>(1.0); }
  textureStore(frameTexture, vec2<i32>(gid.xy), vec4<f32>(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0));
}
`;
