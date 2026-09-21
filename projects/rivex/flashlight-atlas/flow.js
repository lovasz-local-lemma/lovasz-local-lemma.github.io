/** Bounded smoke solver. The flashlight force is an artistic interaction,
 * not radiation pressure. Animation/reset never submit command buffers;
 * the explicit async diagnose() action submits a readback command buffer. */
export const FLOW_GRID = Object.freeze([40, 32, 40]);
export const FLOW_BOUNDS = Object.freeze({
  min: Object.freeze([-4.7, 0, -3.6]),
  max: Object.freeze([5.0, 5.2, 3.0]),
});
const PRESSURE_ITERATIONS = 14;
const STEP = 1 / 30;
const CELL_COUNT = FLOW_GRID.reduce((a, b) => a * b, 1);
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => { const n = Math.hypot(...a) || 1; return a.map(value => value / n); };

// Matches scene.wgsl's camera-facing target plane and yaw/pitch convention.
function beamDirection(state, source, sphere) {
  const eye = [5.3, 3.75, 7.6], forward = normalize(eye.map((x, i) => [0, 1.55, -.05][i] - x));
  const right = normalize(cross(forward, [0, 1, 0])), up = cross(right, forward);
  const aspect = finite(state.aspect, finite(state.width, 1040) / finite(state.height, 640));
  const qx = (clamp(finite(state.aimX, .56), 0, 1) * 2 - 1) * aspect * .48;
  const qy = (1 - clamp(finite(state.aimY, .41), 0, 1) * 2) * .48;
  const ray = normalize(forward.map((x, i) => x + qx * right[i] + qy * up[i]));
  const depth = dot(sphere.map((x, i) => x - eye[i]), forward);
  const target = eye.map((x, i) => x + ray[i] * depth / Math.max(.01, dot(ray, forward)));
  const direction = normalize(target.map((x, i) => x - source[i]));
  const yaw = clamp(finite(state.torchYaw, 0), -50, 50) * Math.PI / 180;
  const pitch = clamp(finite(state.torchPitch, 0), -50, 50) * Math.PI / 180;
  const turned = [direction[0] * Math.cos(yaw) + direction[2] * Math.sin(yaw), direction[1], -direction[0] * Math.sin(yaw) + direction[2] * Math.cos(yaw)];
  const pitchAxis = normalize(right.map((x, i) => x - turned[i] * dot(right, turned)));
  const tangent = cross(pitchAxis, turned);
  return normalize(turned.map((x, i) => x * Math.cos(pitch) + tangent[i] * Math.sin(pitch)));
}

/**
 * .view is a stable 3D rgba16float view. R = density multiplier (baseline .02,
 * smoke clamped to 6), G = temperature, B = speed, A = 1. Multiply R by the
 * user's extinction coefficient. Sample only within FLOW_BOUNDS.
 *
 * update(encoder, state, active) encodes at most one 1/30 s step and returns
 * whether the volume changed. A pending reset initializes once while paused
 * if state.flowEnabled is true. flowEnabled:false suppresses all dispatches.
 * reset() schedules a deterministic seeded plume; it never submits work.
 */
export async function createFlowSimulation(device, options = {}) {
  const shaderSource = options.shaderSource ?? await fetch(new URL('./flow.wgsl', import.meta.url)).then(response => {
    if (!response.ok) throw new Error(`Flow shader could not load (${response.status}).`);
    return response.text();
  });
  const shader = device.createShaderModule({ label: 'Flashlight chamber · persistent smoke compute', code: shaderSource });
  const compilation = await shader.getCompilationInfo();
  const diagnostics = compilation.messages.map(message => ({ type: message.type, line: message.lineNum, column: message.linePos, message: message.message }));
  const errors = diagnostics.filter(message => message.type === 'error');
  if (errors.length) throw new Error(errors.map(message => `Flow WGSL ${message.line}:${message.column}: ${message.message}`).join('\n'));
  const layout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ...[4, 5, 6].map(binding => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } })),
    { binding: 7, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
    { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  ] });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const entries = ['initialize', 'advect', 'curlField', 'confine', 'divergenceField', 'jacobi', 'projectVelocity', 'writeVolume', 'diagnoseField'];
  const pipelines = Object.fromEntries(await Promise.all(entries.map(async entryPoint => {
    const pipeline = await device.createComputePipelineAsync({ label: `Chamber smoke · ${entryPoint}`, layout: pipelineLayout, compute: { module: shader, entryPoint } });
    return [entryPoint, pipeline];
  })));
  const allocations = [];
  const buffer = (label, size, usage) => {
    const result = device.createBuffer({ label, size, usage }); allocations.push(result); return result;
  };
  const uniform = buffer('Smoke parameters', 128, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const state = [0, 1].map(i => buffer(`Smoke density / temperature / face velocity ${i}`, CELL_COUNT * 32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST));
  const pressure = [0, 1].map(i => buffer(`Smoke pressure ${i}`, CELL_COUNT * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST));
  const divergence = buffer('Smoke divergence', CELL_COUNT * 4, GPUBufferUsage.STORAGE);
  const curl = buffer('Smoke vorticity', CELL_COUNT * 16, GPUBufferUsage.STORAGE);
  const diagnostic = buffer('Smoke optional numerical diagnostic', CELL_COUNT * 32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  const texture = device.createTexture({
    label: 'Persistent 3D smoke density / heat / speed', dimension: '3d', size: FLOW_GRID,
    format: 'rgba16float', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView({ dimension: '3d' });
  const groups = state.map((input, i) => pressure.map((inputPressure, p) => device.createBindGroup({
    layout, entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: input } },
      { binding: 2, resource: { buffer: state[1 - i] } },
      { binding: 3, resource: { buffer: inputPressure } },
      { binding: 4, resource: { buffer: pressure[1 - p] } },
      { binding: 5, resource: { buffer: divergence } },
      { binding: 6, resource: { buffer: curl } },
      { binding: 7, resource: view },
      { binding: 8, resource: { buffer: diagnostic } },
    ],
  })));
  const values = new Float32Array(32), workgroups = FLOW_GRID.map(size => Math.ceil(size / 4));
  const spacing = FLOW_GRID.map((n, i) => (FLOW_BOUNDS.max[i] - FLOW_BOUNDS.min[i]) / n);
  let disposed = false, pendingReset = true, initialized = false, stateIndex = 0, accumulator = 0, simulationTime = 0;
  let previousNow = 0, running = false, steps = 0, dispatches = 0, resets = 0, lastDispatches = 0, hasProjection = false, diagnosticPromise = null;
  function parameters(settings, dt) {
    const source = [finite(settings.lightX, -2.7), finite(settings.lightY, 6.4), finite(settings.lightZ, 1.4)];
    const sphere = [finite(settings.sphereX, -.85), finite(settings.sphereY, 2.35), finite(settings.sphereZ, .25), clamp(finite(settings.sphereRadius, .86), .35, 1.3)];
    const metal = [finite(settings.metalX, 1.58), finite(settings.metalY, 1.03), finite(settings.metalZ, -.48), clamp(finite(settings.metalRadius, .93), .35, 1.3)];
    values.set([
      ...FLOW_GRID, dt,
      ...FLOW_BOUNDS.min, simulationTime,
      ...spacing, clamp(finite(settings.flowFeed, 1), 0, 2),
      ...source, clamp(finite(settings.flowStrength, 1), 0, 2),
      ...beamDirection(settings, source, sphere.slice(0, 3)), .09 + clamp(finite(settings.radius, .28), .07, .65) * .76,
      ...sphere, ...metal,
      .02, clamp(finite(settings.flowSwirl, .45), 0, 1.5), .95, 0,
    ]);
    device.queue.writeBuffer(uniform, 0, values);
  }
  function dispatch(pass, entryPoint, pressureIndex = 0) {
    pass.setPipeline(pipelines[entryPoint]);
    pass.setBindGroup(0, groups[stateIndex][pressureIndex]);
    pass.dispatchWorkgroups(...workgroups); dispatches++; lastDispatches++;
  }
  function update(encoder, settings = {}, active = true) {
    lastDispatches = 0;
    if (disposed) return false;
    const now = performance.now() / 1000;
    const elapsed = clamp(finite(settings.dt, previousNow ? now - previousNow : STEP), 0, .1);
    previousNow = now;
    const enabled = settings.flowEnabled !== false && (active || settings.flowEnabled === true);
    running = enabled && active;
    if (!enabled) { accumulator = 0; return false; }
    if (pendingReset) {
      simulationTime = 0; accumulator = 0; stateIndex = 0; hasProjection = false;
      parameters(settings, STEP);
      encoder.clearBuffer(state[0]); encoder.clearBuffer(state[1]);
      encoder.clearBuffer(pressure[0]); encoder.clearBuffer(pressure[1]);
      const pass = encoder.beginComputePass({ label: 'Initialize seeded chamber plumes' });
      dispatch(pass, 'initialize'); stateIndex = 1;
      dispatch(pass, 'writeVolume'); pass.end();
      pendingReset = false; initialized = true; resets++;
      return true;
    }
    if (!active) { accumulator = 0; return false; }
    // No catch-up loop: a delayed or hidden frame cannot create a work burst.
    accumulator += elapsed;
    if (accumulator < STEP) return false;
    accumulator %= STEP;
    simulationTime += STEP;
    parameters(settings, STEP);
    encoder.clearBuffer(pressure[0]); encoder.clearBuffer(pressure[1]);
    const pass = encoder.beginComputePass({ label: 'Advect, stir and project chamber smoke' });
    dispatch(pass, 'advect'); stateIndex = 1 - stateIndex;
    dispatch(pass, 'curlField');
    dispatch(pass, 'confine'); stateIndex = 1 - stateIndex;
    dispatch(pass, 'divergenceField');
    let pressureIndex = 0;
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) { dispatch(pass, 'jacobi', pressureIndex); pressureIndex = 1 - pressureIndex; }
    dispatch(pass, 'projectVelocity', pressureIndex); stateIndex = 1 - stateIndex;
    dispatch(pass, 'writeVolume'); pass.end(); steps++; hasProjection = true;
    return true;
  }
  async function diagnose() {
    if (disposed || !initialized) return { available: false, reason: disposed ? 'disposed' : 'not initialized' };
    if (diagnosticPromise) return diagnosticPromise;
    diagnosticPromise = (async () => {
      const sampledSteps = steps, sampledTime = simulationTime, projected = hasProjection;
      const readback = device.createBuffer({ label: 'Smoke diagnostic readback', size: CELL_COUNT * 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      try {
        const encoder = device.createCommandEncoder({ label: 'Explicit smoke numerical check' });
        const pass = encoder.beginComputePass({ label: 'Measure smoke and residual divergence' });
        pass.setPipeline(pipelines.diagnoseField); pass.setBindGroup(0, groups[stateIndex][0]); pass.dispatchWorkgroups(...workgroups); pass.end();
        encoder.copyBufferToBuffer(diagnostic, 0, readback, 0, CELL_COUNT * 32);
        device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(readback.getMappedRange());
        let fluidCells = 0, nonFiniteCells = 0, densityTotal = 0, densityMin = Infinity, densityMax = 0, temperatureMax = 0, speedMax = 0;
        let beforeSquares = 0, afterSquares = 0, solidLeakage = 0;
        for (let i = 0; i < data.length; i += 8) {
          const density = data[i], heat = data[i + 1], speed = data[i + 2], blocked = data[i + 3] > .5;
          const before = data[i + 4], after = data[i + 5];
          if (![density, heat, speed, before, after].every(Number.isFinite)) { nonFiniteCells++; continue; }
          if (blocked) { solidLeakage = Math.max(solidLeakage, Math.abs(density), Math.abs(heat), speed); continue; }
          fluidCells++; densityTotal += density; densityMin = Math.min(densityMin, density); densityMax = Math.max(densityMax, density);
          temperatureMax = Math.max(temperatureMax, heat); speedMax = Math.max(speedMax, speed);
          beforeSquares += before * before; afterSquares += after * after;
        }
        const count = Math.max(1, fluidCells), beforeRms = Math.sqrt(beforeSquares / count), afterRms = Math.sqrt(afterSquares / count);
        return {
          available: true, steps: sampledSteps, simulationTime: sampledTime, cells: CELL_COUNT, fluidCells, nonFiniteCells,
          density: { min: densityMin === Infinity ? 0 : densityMin, max: densityMax, mean: densityTotal / count, integral: densityTotal * spacing.reduce((a, b) => a * b, 1) },
          temperatureMax, speedMax, solidLeakage, projected,
          divergenceBeforeRms: projected ? beforeRms : null, divergenceAfterRms: afterRms,
          divergenceRatio: projected && beforeRms > 1e-12 ? afterRms / beforeRms : null,
        };
      } finally { readback.destroy(); }
    })();
    try { return await diagnosticPromise; } finally { diagnosticPromise = null; }
  }
  return {
    view, texture, shaderSource, diagnostics, update, diagnose,
    reset() { if (!disposed) { pendingReset = true; accumulator = 0; } },
    destroy() { if (disposed) return; disposed = true; allocations.forEach(resource => resource.destroy()); texture.destroy(); },
    stats() { return { grid: [...FLOW_GRID], cells: CELL_COUNT, pressureIterations: PRESSURE_ITERATIONS, maxHz: 30, steps, dispatches, lastDispatches, resets, generation: resets, initialized, pendingReset, running: running && !disposed, simulationTime, bytes: CELL_COUNT * (32 * 2 + 4 * 2 + 4 + 16 + 8 + 32) + 128 }; },
  };
}
