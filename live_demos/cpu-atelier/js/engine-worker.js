// The complete C++ frame runs here. WebGL and DOM work remain on the UI thread.
let mod;
const getters = ['engine_get_framebuffer','engine_get_width','engine_get_height',
  'engine_get_last_ms','engine_get_samples','engine_simd_verified','engine_get_sim_ms',
  'engine_get_trace_ms','engine_get_npr_ms','engine_get_cloth_ms','engine_get_denoise_ms',
  'engine_get_vintage_ms','engine_get_ring','engine_get_cloth_particles','engine_get_resets',
  'engine_get_temporal_ms','engine_get_temporal_reuse','engine_get_temporal_history'];
function invoke(name, args = []) {
  const fn = mod['_' + name];
  if (typeof fn !== 'function') throw new Error('Unknown engine function: ' + name);
  return fn(...args);
}
function snapshot() {
  const values = Object.fromEntries(getters.map(name => [name, invoke(name)]));
  const start = invoke('engine_get_perf_ptr') >> 2;
  return { values, perf: Array.from(mod.HEAPF32.subarray(start, start + 10)) };
}
function picture() {
  const width = invoke('engine_get_width'), height = invoke('engine_get_height');
  const pointer = invoke('engine_get_framebuffer');
  const pixels = new Uint8Array(width * height * 4);
  pixels.set(mod.HEAPU8.subarray(pointer, pointer + pixels.length));
  return { width, height, pixels };
}
async function dispatch(message) {
  if (message.type === 'init') {
    const factory = (await import(message.moduleUrl)).default;
    mod = await factory();
    invoke('engine_init', message.size);
    return snapshot();
  }
  for (const command of message.commands || []) invoke(command.name, command.args);
  const begin = performance.now();
  if (message.type === 'frame') {
    if (message.step) invoke('engine_step_sim');
    invoke('engine_render');
    return { ...snapshot(), ...picture(), workerMs: performance.now() - begin };
  }
  if (message.type === 'call') {
    const result = invoke(message.name, message.args);
    return { ...snapshot(), result };
  }
  if (message.type === 'benchmark') {
    const times = [];
    for (const [simd, threads] of [[0,1],[0,message.threads],[1,1],[1,message.threads]]) {
      invoke('engine_set_simd', [simd]); invoke('engine_set_threads', [threads]);
      const frame = message.kind === 'render';
      invoke('engine_set_paused', [frame ? 1 : 0]);
      let best = Infinity;
      for (let k = 0; k < 6; k++) {
        if (frame) invoke('engine_reset_accumulation');
        invoke(frame ? 'engine_render' : 'engine_step_sim');
        if (k) best = Math.min(best, invoke(frame ? 'engine_get_trace_ms' : 'engine_get_sim_ms'));
      }
      times.push(best);
    }
    invoke('engine_set_simd', [message.restore.simd]);
    invoke('engine_set_threads', [message.restore.threads]);
    invoke('engine_set_paused', [message.restore.paused]);
    return { ...snapshot(), times };
  }
  return snapshot();
}
// Serialize init/commands too: an async dynamic import must not let a later
// message race initialization. Frames have only one request in flight.
let queue = Promise.resolve();
self.onmessage = event => {
  const message = event.data;
  queue = queue.then(async () => {
    try {
      const result = await dispatch(message);
      self.postMessage({ id: message.id, result }, result.pixels ? [result.pixels.buffer] : []);
    } catch (error) {
      self.postMessage({ id: message.id, error: error.message || String(error) });
    }
  });
};
