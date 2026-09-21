// Commands are applied at the next completed engine operation. Getters expose
// the latest completed snapshot; explicit numeric queries remain awaitable.
export async function createEngineClient(moduleUrl, size) {
  const worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
  let sequence = 0, commands = [], state = { values: {}, perf: [] }, lastPicture, terminalError;
  const pending = new Map();
  const fail = error => {
    terminalError = error;
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  };
  worker.onerror = event => fail(new Error(event.message || 'CPU worker failed'));
  worker.onmessage = ({ data }) => {
    const waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id);
    if (data.error) { waiter.reject(new Error(data.error)); return; }
    if (data.result.values) state = data.result;
    if (data.result.pixels) lastPicture = data.result;
    waiter.resolve(data.result);
  };
  function request(type, data = {}) {
    if (terminalError) return Promise.reject(terminalError);
    const id = ++sequence, batch = commands; commands = [];
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, commands: batch, ...data });
    });
  }
  function command(name, args) {
    // Orbit events can arrive faster than the CPU. Keep the newest view,
    // without reordering scene/layout/material setters relative to each other.
    if (name === 'engine_set_camera' || name === 'engine_resize')
      commands = commands.filter(item => item.name !== name);
    commands.push({ name, args });
  }
  const client = {
    cwrap(name) {
      if (name === 'engine_render') return () => request('frame', { step: false });
      if (name === 'engine_step_sim') return () => request('call', { name, args: [] });
      if (name === 'engine_get_perf_ptr') return () => 0;
      if (name === 'engine_get_density_above' || name === 'engine_get_temp_max')
        return async (...args) => (await request('call', { name, args })).result;
      if (name.startsWith('engine_get_') || name === 'engine_simd_verified')
        return () => state.values[name] ?? 0;
      return (...args) => command(name, args);
    },
    frame: () => request('frame', { step: true }),
    benchmark: options => request('benchmark', options),
    flush: () => request('flush'),
    get perf() { return state.perf; },
    get picture() { return lastPicture; },
    destroy() { worker.terminate(); fail(new Error('CPU worker disposed')); },
  };
  try { await request('init', { moduleUrl, size }); }
  catch (error) { client.destroy(); throw error; }
  return client;
}
