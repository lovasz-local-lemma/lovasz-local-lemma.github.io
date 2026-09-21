// Persistent smoke on a bounded grid. Velocity components represent fluxes
// through each cell's positive faces. The pressure gradient and divergence
// use matching forward/backward differences, with anisotropic cell spacing.
// This is a coarse visual solver, not a calibrated fluid experiment.
struct FlowParameters {
  gridDt: vec4f,
  minimumTime: vec4f,
  spacingFeed: vec4f,
  sourceStrength: vec4f,
  directionCone: vec4f,
  glass: vec4f,
  metal: vec4f,
  tuning: vec4f,
};
struct Cell { motion: vec4f, medium: vec4f };
@group(0) @binding(0) var<uniform> u: FlowParameters;
@group(0) @binding(1) var<storage, read> source: array<Cell>;
@group(0) @binding(2) var<storage, read_write> destination: array<Cell>;
@group(0) @binding(3) var<storage, read> pressureIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> pressureOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> divergence: array<f32>;
@group(0) @binding(6) var<storage, read_write> vorticity: array<vec4f>;
@group(0) @binding(7) var volume: texture_storage_3d<rgba16float, write>;
struct DiagnosticCell { field: vec4f, divergence: vec4f };
@group(0) @binding(8) var<storage, read_write> diagnosticRecords: array<DiagnosticCell>;
const DX = vec3i(1, 0, 0);
const DY = vec3i(0, 1, 0);
const DZ = vec3i(0, 0, 1);

fn dimensions() -> vec3i { return vec3i(u.gridDt.xyz); }
fn valid(c: vec3i) -> bool { return all(c >= vec3i(0)) && all(c < dimensions()); }
fn index(c: vec3i) -> u32 { let d = dimensions(); return u32(c.x + d.x * (c.y + d.y * c.z)); }
fn position(c: vec3i) -> vec3f { return u.minimumTime.xyz + (vec3f(c) + .5) * u.spacingFeed.xyz; }
fn sphereSolid(p: vec3f, sphere: vec4f) -> bool { return distance(p, sphere.xyz) < sphere.w; }
fn solid(c: vec3i) -> bool {
  if (!valid(c)) { return true; }
  let p = position(c);
  if (sphereSolid(p, u.glass) || sphereSolid(p, u.metal)) { return true; }
  if (all(abs(p - vec3f(-2.78, .72, -1.70)) < vec3f(.58, .72, .58))) { return true; }
  let pedestal = vec3f(u.metal.x, .05, u.metal.z);
  return all(abs(p - pedestal) < vec3f(u.metal.w * 1.12 / .93, .05, u.metal.w * 1.12 / .93));
}
fn emptyCell() -> Cell { return Cell(vec4f(0), vec4f(0)); }
fn cell(c: vec3i) -> Cell {
  if (solid(c)) { return emptyCell(); }
  return source[index(c)];
}
fn mixCell(a: Cell, b: Cell, t: f32) -> Cell { return Cell(mix(a.motion, b.motion, t), mix(a.medium, b.medium, t)); }
fn sampleCell(q: vec3f) -> Cell {
  let x = clamp(q, vec3f(0), u.gridDt.xyz - 1.0);
  let low = vec3i(floor(x)); let t = fract(x);
  let a = mixCell(cell(low), cell(low + DX), t.x);
  let b = mixCell(cell(low + DY), cell(low + DX + DY), t.x);
  let c = mixCell(cell(low + DZ), cell(low + DX + DZ), t.x);
  let d = mixCell(cell(low + DY + DZ), cell(low + DX + DY + DZ), t.x);
  return mixCell(mixCell(a, b, t.y), mixCell(c, d, t.y), t.z);
}
fn centerVelocity(c: vec3i) -> vec3f {
  if (solid(c)) { return vec3f(0); }
  let v = cell(c).motion.xyz;
  return .5 * (v + vec3f(cell(c - DX).motion.x, cell(c - DY).motion.y, cell(c - DZ).motion.z));
}
fn wallVelocity(c: vec3i, velocity: vec3f) -> vec3f {
  var result = velocity;
  if (solid(c + DX)) { result.x = 0; }
  if (solid(c + DY)) { result.y = 0; }
  if (solid(c + DZ)) { result.z = 0; }
  return result;
}
fn boundedVelocity(v: vec3f) -> vec3f { return v * min(1.0, 3.2 / max(length(v), .0001)); }
fn plume(p: vec3f, offset: vec2f, phase: f32) -> f32 {
  let y = max(p.y, 0.0);
  let axis = offset + vec2f(.35 * sin(y * 2.15 + phase), .28 * sin(y * 1.75 + phase * 1.7));
  let width = .26 + .105 * y;
  let radial = (p.xz - axis) / width;
  let roll = .72 + .28 * sin(6.0 * y + 3.5 * p.x - 4.2 * p.z + phase);
  return exp(-dot(radial, radial)) * exp(-.19 * y) * roll * smoothstep(0.0, .25, y);
}
fn emitter(p: vec3f, offset: vec2f) -> f32 {
  let q = vec3f((p.xz - offset) / .38, (p.y - .28) / .22);
  return exp(-dot(q, q));
}

@compute @workgroup_size(4, 4, 4)
fn initialize(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { destination[index(c)] = emptyCell(); return; }
  let p = position(c);
  // An explicitly seeded, developed plume gives the toggle an immediate shape.
  // Every following frame transports this state; it is not regenerated noise.
  let smoke = 4.4 * plume(p, vec2f(-1.15, 1.18), 0.0)
            + 3.5 * plume(p, vec2f(1.65, -1.1), 2.2)
            + 2.4 * plume(p, vec2f(-3.0, .8), 4.3);
  let velocity = wallVelocity(c, vec3f(.28 * sin(2.4 * p.y + p.z), .25 + .25 * smoke, .24 * cos(2.1 * p.y + p.x)));
  destination[index(c)] = Cell(vec4f(velocity, min(2.5, smoke * .52)), vec4f(min(6.0, smoke), 0, 0, 0));
}

@compute @workgroup_size(4, 4, 4)
fn advect(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { destination[index(c)] = emptyCell(); return; }
  let p = position(c); let dt = u.gridDt.w; let time = u.minimumTime.w;
  // First-order semi-Lagrangian backtrace with trilinear state sampling.
  // Face components share the cell-center backtrace at this modest resolution.
  var q = vec3f(c) - dt * centerVelocity(c) / u.spacingFeed.xyz;
  if (solid(vec3i(floor(q + .5)))) { q = vec3f(c); }
  let advected = sampleCell(q);
  var velocity = advected.motion.xyz * exp(-.14 * dt);
  var heat = advected.motion.w * exp(-.32 * dt);
  var smoke = advected.medium.x * exp(-.055 * dt);
  let pulse = .86 + .14 * sin(time * 1.7);
  let feed = u.spacingFeed.w * pulse * (emitter(p, vec2f(-1.15, 1.18))
    + .8 * emitter(p, vec2f(1.65, -1.1)) + .55 * emitter(p, vec2f(-3.0, .8)));
  smoke += dt * 3.8 * feed;
  heat += dt * 2.6 * feed;
  velocity.y += dt * (u.tuning.z * heat - .035 * smoke + .65 * feed);

  // A deliberately artistic force follows the directed flashlight cone.
  // It injects a small helical stirring flow, not physical radiation pressure.
  let delta = p - u.sourceStrength.xyz; let axis = u.directionCone.xyz;
  let along = dot(delta, axis); let radial = delta - along * axis;
  let beamWidth = max(.3, max(along, 0.0) * tan(u.directionCone.w) * .8);
  let envelope = exp(-dot(radial, radial) / (beamWidth * beamWidth))
    * smoothstep(0.0, .5, along) * exp(-.055 * max(along, 0.0));
  let swirl = cross(axis, radial) / max(beamWidth, .3);
  let wave = vec3f(sin(p.y * 2.1 + time), sin(p.z * 2.5 + time * .73), cos(p.x * 2.3 - time * .9));
  velocity += dt * u.sourceStrength.w * envelope * (1.55 * swirl + .5 * axis + .28 * wave);
  // Warm smoke gradually escapes at the top; velocity still has a closed wall.
  let top = smoothstep(u.gridDt.y - 4.0, u.gridDt.y - 1.0, f32(c.y));
  smoke *= exp(-top * 1.4 * dt); heat *= exp(-top * dt);
  destination[index(c)] = Cell(vec4f(wallVelocity(c, boundedVelocity(velocity)), clamp(heat, 0.0, 4.0)), vec4f(clamp(smoke, 0.0, 6.0), 0, 0, 0));
}

@compute @workgroup_size(4, 4, 4)
fn curlField(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { vorticity[index(c)] = vec4f(0); return; }
  let dx = (centerVelocity(c + DX) - centerVelocity(c - DX)) / (2.0 * u.spacingFeed.x);
  let dy = (centerVelocity(c + DY) - centerVelocity(c - DY)) / (2.0 * u.spacingFeed.y);
  let dz = (centerVelocity(c + DZ) - centerVelocity(c - DZ)) / (2.0 * u.spacingFeed.z);
  let curl = vec3f(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x);
  vorticity[index(c)] = vec4f(curl, length(curl));
}
fn curlMagnitude(c: vec3i) -> f32 {
  if (solid(c)) { return 0; }
  return vorticity[index(c)].w;
}
@compute @workgroup_size(4, 4, 4)
fn confine(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { destination[index(c)] = emptyCell(); return; }
  let gradient = vec3f(curlMagnitude(c + DX) - curlMagnitude(c - DX),
    curlMagnitude(c + DY) - curlMagnitude(c - DY), curlMagnitude(c + DZ) - curlMagnitude(c - DZ)) / (2.0 * u.spacingFeed.xyz);
  let normal = gradient / max(length(gradient), .0001);
  let force = u.tuning.y * min(u.spacingFeed.x, min(u.spacingFeed.y, u.spacingFeed.z)) * cross(normal, vorticity[index(c)].xyz);
  let previous = source[index(c)];
  destination[index(c)] = Cell(vec4f(wallVelocity(c, boundedVelocity(previous.motion.xyz + force * u.gridDt.w)), previous.motion.w), previous.medium);
}

@compute @workgroup_size(4, 4, 4)
fn divergenceField(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { divergence[index(c)] = 0; return; }
  let v = source[index(c)].motion.xyz;
  let behind = vec3f(cell(c - DX).motion.x, cell(c - DY).motion.y, cell(c - DZ).motion.z);
  divergence[index(c)] = dot((v - behind) / u.spacingFeed.xyz, vec3f(1)) / u.gridDt.w;
}
fn pressureTerm(c: vec3i, weight: f32) -> vec2f {
  if (solid(c)) { return vec2f(0); }
  return vec2f(pressureIn[index(c)] * weight, weight);
}
@compute @workgroup_size(4, 4, 4)
fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { pressureOut[index(c)] = 0; return; }
  let weights = 1.0 / (u.spacingFeed.xyz * u.spacingFeed.xyz);
  let total = pressureTerm(c + DX, weights.x) + pressureTerm(c - DX, weights.x)
    + pressureTerm(c + DY, weights.y) + pressureTerm(c - DY, weights.y)
    + pressureTerm(c + DZ, weights.z) + pressureTerm(c - DZ, weights.z);
  // Solid-neighbor terms are omitted: zero normal pressure gradient.
  let candidate = (total.x - divergence[index(c)]) / max(total.y, .0001);
  // Weighted Jacobi damps the checkerboard mode of a closed Neumann grid.
  pressureOut[index(c)] = mix(pressureIn[index(c)], candidate, .8);
}
fn neighborPressure(c: vec3i, fallback: f32) -> f32 {
  if (solid(c)) { return fallback; }
  return pressureIn[index(c)];
}
@compute @workgroup_size(4, 4, 4)
fn projectVelocity(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { destination[index(c)] = emptyCell(); return; }
  let p = pressureIn[index(c)];
  let gradient = (vec3f(neighborPressure(c + DX, p), neighborPressure(c + DY, p), neighborPressure(c + DZ, p)) - p) / u.spacingFeed.xyz;
  let previous = source[index(c)];
  // No velocity clamp after projection: it would reintroduce divergence.
  let velocity = wallVelocity(c, previous.motion.xyz - u.gridDt.w * gradient);
  destination[index(c)] = Cell(vec4f(velocity, previous.motion.w), previous.medium);
}

@compute @workgroup_size(4, 4, 4)
fn writeVolume(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  if (solid(c)) { textureStore(volume, c, vec4f(0, 0, 0, 1)); return; }
  let current = source[index(c)];
  textureStore(volume, c, vec4f(u.tuning.x + current.medium.x, current.motion.w, length(current.motion.xyz), 1));
}

// Explicit diagnosticRecords action only; never part of an animation step.
@compute @workgroup_size(4, 4, 4)
fn diagnoseField(@builtin(global_invocation_id) id: vec3u) {
  let c = vec3i(id); if (!valid(c)) { return; }
  let current = source[index(c)]; let blocked = solid(c);
  var after = 0.0;
  if (!blocked) {
    let behind = vec3f(cell(c - DX).motion.x, cell(c - DY).motion.y, cell(c - DZ).motion.z);
    after = dot((current.motion.xyz - behind) / u.spacingFeed.xyz, vec3f(1));
  }
  diagnosticRecords[index(c)] = DiagnosticCell(
    vec4f(current.medium.x, current.motion.w, length(current.motion.xyz), select(0.0, 1.0, blocked)),
    vec4f(divergence[index(c)] * u.gridDt.w, after, 0, 0));
}
