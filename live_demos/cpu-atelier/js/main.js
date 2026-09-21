import { createEngineClient } from './engine-client.js';
import { QUALITY, DEFAULT_QUALITY, DEFAULT_VOXEL_GRID, nextAdaptiveWidth, createQualityAdvisory } from './quality.js';
const W = 800, H = 600;       // canvas (display) size
let RW = QUALITY[DEFAULT_QUALITY].width, RH = RW * 3 / 4;
const $ = (id) => document.getElementById(id);
const maxThreads = Math.max(1, navigator.hardwareConcurrency || 4);

$('hw').textContent = String(maxThreads);
$('coi').textContent = String(self.crossOriginIsolated === true);

// Presentation-only navigation: hidden panes keep every engine control mounted.
const inspectorTabs = [...document.querySelectorAll('[data-tab]')];
function selectInspectorTab(tab) {
  for (const button of inspectorTabs) {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(button.getAttribute('aria-controls')).hidden = !selected;
  }
  document.querySelector('.inspector-content').scrollTop = 0;
}
inspectorTabs.forEach((button, index) => {
  button.addEventListener('click', () => selectInspectorTab(button));
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % inspectorTabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + inspectorTabs.length) % inspectorTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = inspectorTabs.length - 1;
    else return;
    event.preventDefault(); selectInspectorTab(inspectorTabs[next]); inspectorTabs[next].focus();
  });
});
const layoutIds = ['lay_flag', 'lay_canopy', 'lay_ring', 'lay_canopy_high'];
const materialIds = ['m_diffuse', 'm_metal', 'm_glass', 'm_coat'];
function markSelection(ids, activeId) {
  ids.forEach(id => $(id).setAttribute('aria-pressed', String(id === activeId)));
}

// Minimal wasm module whose body uses v128 — validates only where SIMD is
// supported. Declared before boot() runs: boot() is called during module
// evaluation below, so a later `const` would be in its temporal dead zone.
// (Body: i32.const 0; i32x4.splat; i32x4.abs; end — it must LEAVE the v128 on
// the stack to match the declared result type. An earlier version dropped it,
// which failed validation everywhere and silently forced the scalar build.)
const SIMD_PROBE = new Uint8Array([
  0,97,115,109,1,0,0,0,           // magic + version
  1,5,1,96,0,1,123,               // type: () -> v128
  3,2,1,0,                        // one function, type 0
  10,10,1,8,0,65,0,253,15,253,98,11,
]);

if (!self.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
  $('err').textContent =
    'This page is not cross-origin isolated, so SharedArrayBuffer (and therefore pthreads) is '
    + 'unavailable. Serve it with `npm run serve`, which sets the required COOP/COEP headers, and '
    + 'open the printed http://localhost:… URL. Opening index.html from disk (file://) will not work.';
} else {
  boot().catch((e) => { $('err').textContent = 'Boot failed: ' + (e && e.message || e); });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const wantScalar = params.has('scalar');
  const simdSupported = WebAssembly.validate(SIMD_PROBE);
  const useScalarBuild = wantScalar || !simdSupported;
  const modUrl = useScalarBuild ? '../build/engine-scalar.js' : '../build/engine.js';
  let mod;
  try {
    mod = await createEngineClient(new URL(modUrl, import.meta.url).href, [RW, RH]);
  } catch (e) {
    $('err').textContent = 'Could not load ' + modUrl
      + ' — run `npm run build:all` (that script builds the scalar module too).';
    throw e;
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) mod.destroy(); });
  $('buildkind').textContent = useScalarBuild
    ? 'Scalar module' : 'SIMD module';
  $('kernel-label').textContent = useScalarBuild ? 'Packet kernels · scalar emulation' : 'SIMD kernels';
  $('status-pill').title = useScalarBuild
    ? 'Compiled with -mno-simd128' + (simdSupported ? ' · selected by ?scalar' : ' · SIMD unsupported here')
    : 'Compiled with -msimd128 · switch the active kernels in Execution';
  if (wantScalar) {
    $('scalarlink').textContent = 'back to the SIMD build';
    $('scalarlink').href = location.pathname;
  }

  const resize     = mod.cwrap('engine_resize', 'void', ['number', 'number']);
  const render     = mod.cwrap('engine_render', 'void', []);
  const setThreads = mod.cwrap('engine_set_threads', 'void', ['number']);
  const setCamera  = mod.cwrap('engine_set_camera', 'void', ['number', 'number', 'number']);
  const getFB      = mod.cwrap('engine_get_framebuffer', 'number', []);
  const lastMs     = mod.cwrap('engine_get_last_ms', 'number', []);
  const getSamples = mod.cwrap('engine_get_samples', 'number', []);
  const setSimd    = mod.cwrap('engine_set_simd', 'void', ['number']);
  const simdOk     = mod.cwrap('engine_simd_verified', 'number', []);
  const setVolume  = mod.cwrap('engine_set_volume', 'void', ['number']);
  const stepSim    = mod.cwrap('engine_step_sim', 'void', []);
  const setPaused  = mod.cwrap('engine_set_paused', 'void', ['number']);
  const resetSim   = mod.cwrap('engine_reset_sim', 'void', []);
  const simMs      = mod.cwrap('engine_get_sim_ms', 'number', []);
  const traceMs    = mod.cwrap('engine_get_trace_ms', 'number', []);
  const setNpr     = mod.cwrap('engine_set_npr', 'void', ['number']);
  const nprMs      = mod.cwrap('engine_get_npr_ms', 'number', []);
  const setCloth   = mod.cwrap('engine_set_cloth', 'void', ['number']);
  const clothMs    = mod.cwrap('engine_get_cloth_ms', 'number', []);
  const resetCloth = mod.cwrap('engine_reset_cloth', 'void', []);
  const setCoupling = mod.cwrap('engine_set_coupling', 'void', ['number']);
  const setSeal    = mod.cwrap('engine_set_seal', 'void', ['number']);
  const setStrat   = mod.cwrap('engine_set_stratified', 'void', ['number']);
  const setDenoise = mod.cwrap('engine_set_denoise', 'void', ['number']);
  const denoiseMs  = mod.cwrap('engine_get_denoise_ms', 'number', []);
  const setTemporal = mod.cwrap('engine_set_temporal', 'void', ['number']);
  const setTemporalDebug = mod.cwrap('engine_set_temporal_debug', 'void', ['number']);
  const temporalMs = mod.cwrap('engine_get_temporal_ms', 'number', []);
  const temporalReuse = mod.cwrap('engine_get_temporal_reuse', 'number', []);
  const temporalHistory = mod.cwrap('engine_get_temporal_history', 'number', []);
  const setVintage = mod.cwrap('engine_set_vintage', 'void', ['number']);
  const vintageMs  = mod.cwrap('engine_get_vintage_ms', 'number', []);
  const setVinFlag = mod.cwrap('engine_set_vintage_flag', 'void', ['number','number']);
  const setMaterial = mod.cwrap('engine_set_material', 'void', ['number','number','number']);
  const setFire     = mod.cwrap('engine_set_fire', 'void', ['number']);
  const setLayout  = mod.cwrap('engine_set_cloth_layout', 'void', ['number']);
  const setRing    = mod.cwrap('engine_set_ring', 'void', ['number']);
  const getRing    = mod.cwrap('engine_get_ring', 'number', []);
  const tempMax    = mod.cwrap('engine_get_temp_max', 'number', ['number']);
  const setClothRes = mod.cwrap('engine_set_cloth_res', 'void', ['number']);
  const clothParts  = mod.cwrap('engine_get_cloth_particles', 'number', []);
  const densAbove   = mod.cwrap('engine_get_density_above', 'number', ['number']);
  const setParam   = mod.cwrap('engine_set_param', 'void', ['number', 'number']);
  const getResets  = mod.cwrap('engine_get_resets', 'number', []);
  const perfPtr    = mod.cwrap('engine_get_perf_ptr', 'number', []);

  // Mirrors EngineParam in src/engine.cpp -- edit both together.
  const P = { SIGMA_T:0, HG_G:1, BUOY:2, VORT:3, DISSIPATION:4, JACOBI:5,
              CLOTH_WIND:6, BRUSH:7, CONTRAST:8, BRIGHT:9, VIGNETTE:10, DRAG:11,
              LIGHT_YAW:12, LIGHT_PITCH:13, SATURATION:14, EMIT_ROW:15, VOLUME_SPLATS:16, VOLUME_STEPS:17 };
  // Mirrors EnginePerf's field order in src/engine.cpp -- edit both together.
  const PERF_FIELDS = ['couple','fluid','cloth','mesh','trace','npr','frame',
                       'mrays','mcells','msprings'];
  function readPerf() {
    const o = {};
    PERF_FIELDS.forEach((k, i) => { o[k] = mod.perf[i] || 0; });
    return o;
  }

  $('simdok').textContent = simdOk() === 1 ? 'spot checks passed' : (simdOk() === 0 ? 'Mismatch detected' : 'Unknown');
  $('simdok').classList.toggle('good', simdOk() === 1);
  let uiSimd = true;
  setSimd(1);
  $('simd').onchange = (e) => { uiSimd = e.target.checked; setSimd(uiSimd ? 1 : 0); };

  // --- camera state ---
  let yaw = 0.7, pitch = 0.22, dist = 6.5;
  const applyCamera = () => setCamera(yaw, pitch, dist);
  applyCamera();
  setVolume(1);
  $('volume').onchange = (e) => { setVolume(e.target.checked ? 1 : 0); };
  let paused = false;
  $('pause').onclick = () => {
    paused = !paused; setPaused(paused ? 1 : 0);
    $('pause').textContent = paused ? 'Resume dynamics' : 'Pause & converge';
    $('pause').setAttribute('aria-pressed', String(paused));
    $('play-state').textContent = paused ? 'ACCUMULATING SAMPLES' : 'LIVE SIMULATION';
  };
  $('resetsim').onclick = () => { resetSim(); };
  $('resetcloth').onclick = () => { resetCloth(); };
  setNpr(0);
  $('npr').onchange = (e) => { setNpr(e.target.checked ? 1 : 0); };
  setCloth(1);
  // These three reset accumulation inside the engine now, so no camera nudge.
  $('cloth').onchange = (e) => { setCloth(e.target.checked ? 1 : 0); };
  setCoupling(1);
  $('coupling').onchange = (e) => { setCoupling(e.target.checked ? 1 : 0); };
  setSeal(1); $('seal').checked = true;
  $('seal').onchange = (e) => { setSeal(e.target.checked ? 1 : 0); };
  setStrat(0); setDenoise(0);
  $('strat').onchange = (e) => { setStrat(e.target.checked ? 1 : 0); };
  $('denoise').onchange = (e) => { setDenoise(e.target.checked ? 1 : 0); };
  setTemporal(1); setTemporalDebug(0);
  const updateReconstructionView = () => {
    const debug = $('reconstruction-view').value === 'history';
    setTemporalDebug(debug ? 1 : 0);
    $('history-legend').hidden = !debug;
  };
  $('temporal').onchange = (e) => {
    setTemporal(e.target.checked ? 1 : 0);
    $('reconstruction-view').disabled = !e.target.checked;
    if (!e.target.checked) $('reconstruction-view').value = 'image';
    updateReconstructionView();
  };
  $('reconstruction-view').onchange = updateReconstructionView;
  setVintage(0);
  let splatMode = false;
  $('splat-resolution').value = String(DEFAULT_VOXEL_GRID);
  const updateVolumeStyle = () => {
    setParam(P.VOLUME_SPLATS, splatMode ? +$('splat-resolution').value : 0);
    markSelection(['volume_smooth', 'volume_splats'], splatMode ? 'volume_splats' : 'volume_smooth');
    $('splat-settings').hidden = !splatMode;
    $('splat-resolution-value').textContent = $('splat-resolution').value;
  };
  $('volume_smooth').onclick = () => { splatMode = false; updateVolumeStyle(); };
  $('volume_splats').onclick = () => { splatMode = true; updateVolumeStyle(); };
  $('splat-resolution').oninput = updateVolumeStyle;
  $('vintage').onchange = (e) => { setVintage(e.target.checked ? 1 : 0); };
  for (const [id, w] of [['v_bloom',0],['v_chroma',1],['v_scan',2],['v_dither',3]]) {
    $(id).onchange = (e) => { setVinFlag(w, e.target.checked ? 1 : 0); };
  }
  setLayout(1);   // canopy by default -- must match g_clothLayout in engine.cpp
  setRing(0);
  $('ring').onchange = (e) => { setRing(e.target.checked ? 1 : 0); };
  {
    const cr = $('clothres');
    const showParts = () => { $('clothparts').textContent = String(clothParts()); };
    cr.oninput = (e) => { $('clothresval').textContent = e.target.value; };
    cr.onchange = (e) => { setClothRes(+e.target.value); showParts(); };
    setClothRes(+cr.value); showParts();
  }
  {
    const fi = $('fire');
    fi.oninput = (e) => { $('fireval').textContent = e.target.value; setFire(+e.target.value); };
    const sa = $('sat');
    sa.oninput = (e) => { $('satval').textContent = e.target.value; setParam(P.SATURATION, +e.target.value); };
  }
  for (const [id, k, r, io] of [['m_diffuse',0,0.15,1.5],['m_metal',1,0.10,1.5],
                                ['m_glass',2,0.0,1.5],['m_coat',3,0.05,1.5]]) {
    $(id).onclick = () => { setMaterial(k, r, io); markSelection(materialIds, id); };
  }
  for (const [id, m] of [['lay_flag',0],['lay_canopy',1],['lay_ring',2],['lay_canopy_high',3]]) {
    $(id).onclick = () => {
      setLayout(m);                       // layout 2 forces the ring on in C++...
      $('ring').checked = getRing() === 1; // ...so resync the box rather than guess
      $('clothparts').textContent = String(clothParts());
      markSelection(layoutIds, id);
      markSelection(Object.keys(PRESETS), null);
      $('scene-name').textContent = 'Custom · ' + $(id).textContent;
      $('study-note').textContent = 'Cloth arrangement changed. Adjust the scene, material and image treatments independently below.';
    };
  }

  // --- presets (spec Phase 7) ---
  const PRESETS = {
    p_default:   { params: { SIGMA_T:16, HG_G:0.40, BUOY:20, VORT:0.20, DISSIPATION:0.22, JACOBI:18, CLOTH_WIND:5,  BRUSH:1.35, CONTRAST:1.30, BRIGHT:0.84, VIGNETTE:0.55, DRAG:9,  LIGHT_YAW:1.03, LIGHT_PITCH:1.04, SATURATION:1.35, EMIT_ROW:-1 }, npr:false, cam:[0.7,0.22,6.5] },
    p_dense:     { params: { SIGMA_T:34, HG_G:0.55, BUOY:26, VORT:0.32, DISSIPATION:0.10, JACOBI:22, CLOTH_WIND:4,  BRUSH:1.35, CONTRAST:1.30, BRIGHT:0.84, VIGNETTE:0.55, DRAG:11, LIGHT_YAW:1.03, LIGHT_PITCH:1.04, SATURATION:1.35, EMIT_ROW:-1 }, npr:false, cam:[0.9,0.18,6.2] },
    p_windy:     { params: { SIGMA_T:12, HG_G:0.35, BUOY:16, VORT:0.16, DISSIPATION:0.30, JACOBI:16, CLOTH_WIND:12, BRUSH:1.35, CONTRAST:1.30, BRIGHT:0.84, VIGNETTE:0.55, DRAG:6,  LIGHT_YAW:1.03, LIGHT_PITCH:1.04, SATURATION:1.35, EMIT_ROW:-1 }, npr:false, cam:[0.5,0.26,6.8] },
    p_painterly: { params: { SIGMA_T:18, HG_G:0.40, BUOY:20, VORT:0.24, DISSIPATION:0.20, JACOBI:18, CLOTH_WIND:5,  BRUSH:1.6,  CONTRAST:1.45, BRIGHT:0.80, VIGNETTE:0.75, DRAG:9,  LIGHT_YAW:1.03, LIGHT_PITCH:1.04, SATURATION:1.35, EMIT_ROW:-1 }, npr:true,  cam:[0.7,0.22,6.2] },
    p_fire:      { params: { SIGMA_T:20, HG_G:0.35, BUOY:24, VORT:0.30, DISSIPATION:0.18, JACOBI:18, CLOTH_WIND:5,  BRUSH:1.35, CONTRAST:1.30, BRIGHT:0.84, VIGNETTE:0.55, DRAG:9,  LIGHT_YAW:1.03, LIGHT_PITCH:1.04, SATURATION:1.5, EMIT_ROW:22 }, npr:false, cam:[0.55,0.06,6.4], fire:120 },
    p_lowsun:    { params: { SIGMA_T:16, HG_G:0.40, BUOY:20, VORT:0.20, DISSIPATION:0.22, JACOBI:18, CLOTH_WIND:5,  BRUSH:1.35, CONTRAST:1.30, BRIGHT:0.84, VIGNETTE:0.55, DRAG:9,  LIGHT_YAW:2.30, LIGHT_PITCH:0.28, SATURATION:1.5, EMIT_ROW:-1 }, npr:false, cam:[0.95,0.16,6.5] },
  };
  const studyInfo = {
    p_default: ['Coupled canopy', 1, 'A rising plume pushes the canopy; the moving cloth becomes an obstacle in the fluid grid.'],
    p_dense: ['Dense smoke', 1, 'Greater extinction and slower dissipation reveal how volume transport changes the rendering workload.'],
    p_windy: ['Windy flag', 0, 'A flag responds to stronger wind and fluid drag. Compare its deformation with the cloth and geometry timers.'],
    p_painterly: ['Oil painting', 1, 'The CPU image becomes brush strokes and impasto relief. Compare the added image-finish time.'],
    p_lowsun: ['Low sun', 1, 'A lower light direction changes surface shading and the visible scattering structure of the plume.'],
    p_fire: ['Emissive plume', 3, 'The hot source is raised above the sphere beneath a high canopy. Fluid temperature drives volumetric emission.'],
  };
  for (const id of Object.keys(PRESETS)) {
    $(id).onclick = () => {
      const pr = PRESETS[id];
      const [name, layout, note] = studyInfo[id];
      // cloth_init installs layout defaults, including wind strength. Apply the
      // preset parameters afterwards so Windy flag retains its intended wind.
      setLayout(layout); markSelection(layoutIds, layoutIds[layout]);
      $('clothparts').textContent = String(clothParts());
      for (const k of Object.keys(pr.params)) setParam(P[k], pr.params[k]);
      setNpr(pr.npr ? 1 : 0); $('npr').checked = pr.npr;
      setFire(pr.fire || 0); $('fire').value = String(pr.fire || 0); $('fireval').textContent = String(pr.fire || 0);
      $('sat').value = String(pr.params.SATURATION); $('satval').textContent = String(pr.params.SATURATION);
      $('ring').checked = getRing() === 1;
      $('scene-name').textContent = name; $('study-note').textContent = note;
      markSelection(Object.keys(PRESETS), id);
      yaw = pr.cam[0]; pitch = pr.cam[1]; dist = pr.cam[2];
      applyCamera();
    };
  }

  // --- threads UI ---
  let uiThreads = Math.min(maxThreads, QUALITY[DEFAULT_QUALITY].threads);
  const thr = $('threads'); thr.max = String(maxThreads); thr.value = String(uiThreads);
  $('threadsval').textContent = String(uiThreads);
  setThreads(uiThreads);
  thr.oninput = (e) => { uiThreads = +e.target.value; $('threadsval').textContent = e.target.value; setThreads(uiThreads); };

  let qualityMode = DEFAULT_QUALITY, adaptiveTimes = [], lastAdapt = 0;
  const qualityAdvisory = createQualityAdvisory();
  let qualityTipTimer;
  function updateQualityHint(ms) {
    const visible = qualityAdvisory.update(ms, performance.now(), !paused && !document.hidden && qualityMode !== 'smooth');
    const newlyVisible = $('quality-advice').hidden && visible;
    $('quality-advice').hidden = !visible;
    if (!visible) $('quality-tip-wrap').classList.remove('preview-tip');
    if (newlyVisible) {
      $('quality-tip-wrap').classList.add('preview-tip');
      clearTimeout(qualityTipTimer);
      qualityTipTimer = setTimeout(() => $('quality-tip-wrap').classList.remove('preview-tip'), 6500);
    }
  }
  $('quality-advice').onclick = () => {
    qualityAdvisory.dismiss(performance.now()); $('quality-advice').hidden = true;
    $('quality-tip-wrap').classList.remove('preview-tip'); $('quality').focus();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      qualityAdvisory.reset(); $('quality-advice').hidden = true;
      $('quality-tip-wrap').classList.remove('preview-tip');
    }
  });
  function setImageWidth(width) {
    RW = width; RH = width * 3 / 4; resize(RW, RH);
    $('image-size').textContent = `${RW} × ${RH}`;
  }
  function applyQuality(key) {
    const q = QUALITY[key]; if (!q) return;
    qualityMode = key; adaptiveTimes = []; lastAdapt = performance.now();
    qualityAdvisory.reset(); $('quality-advice').hidden = true;
    $('quality-tip-wrap').classList.remove('preview-tip');
    $('quality').value = key; $('quality-note').textContent = q.detail;
    setImageWidth(q.width); setParam(P.VOLUME_STEPS, q.steps);
    $('volume-steps').value = String(q.steps); $('volume-steps-value').textContent = String(q.steps);
    setClothRes(q.cloth); $('clothres').value = String(q.cloth); $('clothresval').textContent = String(q.cloth);
    splatMode = !!q.splats; if (q.splats) $('splat-resolution').value = String(q.splats);
    updateVolumeStyle();
    uiThreads = Math.min(maxThreads, q.threads); setThreads(uiThreads);
    thr.value = String(uiThreads); $('threadsval').textContent = String(uiThreads);
    $('adaptive-state').textContent = key === 'smooth' ? 'ADAPTIVE IMAGE BUDGET' : 'FIXED IMAGE BUDGET';
  }
  $('quality').onchange = event => applyQuality(event.target.value);
  $('volume-steps').oninput = event => {
    setParam(P.VOLUME_STEPS, +event.target.value);
    $('volume-steps-value').textContent = event.target.value;
  };
  applyQuality(DEFAULT_QUALITY);

  // --- orbit controls ---
  const canvas = $('view');
  let dragging = false, lx = 0, ly = 0;
  // Pointer events (not mouse) so touch and pen work; capture keeps the drag
  // alive when the pointer leaves the canvas.
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lx = e.clientX; ly = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  const endDrag = (e) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    yaw   -= (e.clientX - lx) * 0.01;
    pitch += (e.clientY - ly) * 0.01;
    pitch = Math.max(-1.4, Math.min(1.4, pitch));
    lx = e.clientX; ly = e.clientY;
    applyCamera(); // resets accumulation in the engine
  });
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') yaw += 0.06;
    else if (k === 'ArrowRight') yaw -= 0.06;
    else if (k === 'ArrowUp') pitch = Math.min(1.4, pitch + 0.05);
    else if (k === 'ArrowDown') pitch = Math.max(-1.4, pitch - 0.05);
    else if (k === '+' || k === '=') dist = Math.max(2.5, dist * 0.93);
    else if (k === '-' || k === '_') dist = Math.min(20, dist * 1.07);
    else return;
    e.preventDefault(); applyCamera();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = Math.max(2.5, Math.min(20, dist * (1 + Math.sign(e.deltaY) * 0.1)));
    applyCamera();
  }, { passive: false });

  // --- WebGL2 blit ---
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 unavailable');
  const vs = `#version 300 es
    out vec2 uv;
    void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); uv=vec2(p.x,1.0-p.y); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;
  const fs = `#version 300 es
    precision highp float; uniform sampler2D tex; in vec2 uv; out vec4 c; void main(){ c=texture(tex,uv); }`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog); gl.useProgram(prog);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RW, RH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  // Per-stage breakdown + throughput (spec sec 8). Throttled to ~6 Hz so the
  // numbers are readable rather than a blur.
  let lastStages = 0;
  const stageMeters = ['physics', 'geometry', 'trace', 'finish'].map(name => ({
    name, label: document.querySelector(`[data-stage-ms="${name}"]`),
    bar: document.querySelector(`[data-stage="${name}"] .stage-track b`),
  }));
  function updateStages() {
    const now = performance.now();
    if (now - lastStages < 160) return;
    lastStages = now;
    const p = readPerf();
    // The C++ perf struct keeps prior simulation counters while paused; use the
    // fluid getter's zero pause marker before presenting a current-frame share.
    const dynamicsActive = simMs() > 0;
    const costs = {
      physics: dynamicsActive ? p.couple + p.fluid + p.cloth : 0,
      geometry: dynamicsActive ? p.mesh : 0,
      trace: p.trace,
      finish: temporalMs() + nprMs() + denoiseMs() + vintageMs(),
    };
    const measuredTotal = Object.values(costs).reduce((sum, value) => sum + Math.max(0, value), 0);
    for (const meter of stageMeters) {
      const value = Math.max(0, costs[meter.name]);
      meter.label.textContent = value > 0 ? value.toFixed(1) + ' ms' : (meter.name === 'physics' || meter.name === 'geometry' ? (dynamicsActive ? 'idle' : 'paused') : 'off');
      meter.bar.style.width = (measuredTotal > 0 ? value / measuredTotal * 100 : 0).toFixed(1) + '%';
    }
    const row = (k, v) => k.padEnd(9) + v.toFixed(2).padStart(7) + ' ms';
    $('stages').textContent = [
      row('coupling', dynamicsActive ? p.couple : 0), row('fluid', dynamicsActive ? p.fluid : 0), row('cloth', dynamicsActive ? p.cloth : 0),
      row('mesh+bvh', costs.geometry), row('trace', p.trace), row('history', temporalMs()), row('npr', p.npr),
      row('render', p.frame), '',
      'Mprimary samples/s ' + p.mrays.toFixed(1),
      'Mfluid cells/s     ' + (dynamicsActive ? p.mcells : 0).toFixed(1),
      'Mconstraints/s     ' + (dynamicsActive ? p.msprings : 0).toFixed(1),
    ].join('\n');
    $('resets').textContent = String(getResets());
  }

  let cfgPrev = '';
  function updateCfg() {
    const path = uiSimd ? (useScalarBuild ? 'SIMD path / scalar emulation' : 'SIMD') : 'scalar kernels';
    const s = `${RW}×${RH} internal → ${W}×${H} · ${path} · ${uiThreads}/${maxThreads} threads`;
    if (s !== cfgPrev) { cfgPrev = s; $('cfg').textContent = s; }
  }

  for (const [id, n] of [['lab_sN', maxThreads], ['lab_vN', maxThreads]]) {
    const el = $(id);
    if (el) el.textContent = el.textContent.replace('N threads', n + ' threads');
  }

  let textureWidth = RW, textureHeight = RH;
  function present() {
    const picture = mod.picture;
    if (!picture) return;
    const { width, height, pixels } = picture;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (width !== textureWidth || height !== textureHeight) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      textureWidth = width; textureHeight = height;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // FPS over a rolling 500 ms window, from real frame-to-frame gaps.
  let fpsCount = 0, fpsT0 = performance.now();
  function updateFps() {
    fpsCount++;
    const now = performance.now();
    if (now - fpsT0 >= 500) {
      $('fps').textContent = (fpsCount * 1000 / (now - fpsT0)).toFixed(1);
      fpsCount = 0; fpsT0 = now;
    }
  }

  $('savepng').onclick = () => {
    // present() just drew, but the drawing buffer may already be cleared by the
    // compositor -- re-present synchronously before reading it out.
    present();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wasm-showcase.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };

  let diagnosticsEnabled = true, lastReadout = -Infinity;
  const uiTiming = { lastMs: 0, totalMs: 0, updates: 0 };
  function updateReadouts(workMs) {
    const now = performance.now();
    if (!diagnosticsEnabled || now - lastReadout < 160) return;
    lastReadout = now;
    const begin = performance.now();
    $('work-ms').textContent = workMs.toFixed(1) + ' ms';
    $('samples').textContent = String(getSamples());
    $('clothparts').textContent = String(clothParts());
    $('ring').checked = getRing() === 1;
    if (!$('pane-looks').hidden) {
      $('history-reuse').textContent = (temporalReuse() * 100).toFixed(0) + '%';
      $('history-frames').textContent = temporalHistory().toFixed(1);
      $('history-ms').textContent = temporalMs().toFixed(1) + ' ms';
      $('history-state').textContent = !$('temporal').checked ? 'Surface history off' : paused
        ? 'Paused · full-image progressive accumulation' : 'Live · stable surfaces only';
    }
    // Hidden detailed panes need no per-frame text formatting or DOM writes.
    if (!$('pane-execution').hidden) {
      $('ms').textContent = traceMs().toFixed(2) + ' ms';
      $('simms').textContent = simMs() > 0 ? simMs().toFixed(2) + ' ms' : '(paused)';
      $('nprms').textContent = nprMs() > 0 ? nprMs().toFixed(1) + ' ms' : 'off';
      $('frametotal').textContent = lastMs().toFixed(2) + ' ms';
      $('dnms').textContent = denoiseMs() > 0 ? denoiseMs().toFixed(1) + ' ms' : 'off';
      $('vinms').textContent = vintageMs() > 0 ? vintageMs().toFixed(1) + ' ms' : 'off';
      $('clothms').textContent = clothMs() > 0 ? clothMs().toFixed(2) + ' ms' : '–';
      $('ui-update-ms').textContent = uiTiming.lastMs.toFixed(2) + ' ms';
    }
    updateStages(); updateCfg();
    uiTiming.lastMs = performance.now() - begin;
    uiTiming.totalMs += uiTiming.lastMs; uiTiming.updates++;
  }
  let inFlight = null, benchmarking = false, running = true, loopEpoch = 0, loopTimer;
  async function frame() {
    if (inFlight || benchmarking || !running) return inFlight;
    inFlight = mod.frame();
    try {
      const result = await inFlight;
      present();
      if (diagnosticsEnabled) updateFps();
      updateReadouts(result.workerMs);
      updateQualityHint(result.workerMs);
      if (qualityMode === 'smooth' && !paused) {
        adaptiveTimes.push(result.workerMs); if (adaptiveTimes.length > 36) adaptiveTimes.shift();
        if (performance.now() - lastAdapt > 4000) {
          const next = nextAdaptiveWidth(RW, adaptiveTimes);
          lastAdapt = performance.now();
          if (next !== RW) { setImageWidth(next); adaptiveTimes = []; }
        }
      }
    } catch (error) {
      running = false; $('err').textContent = 'CPU worker: ' + error.message;
    } finally { inFlight = null; }
  }
  async function tick(epoch) {
    if (epoch !== loopEpoch) return;
    const begin = performance.now();
    if (!document.hidden) await frame();
    if (running && epoch === loopEpoch)
      loopTimer = setTimeout(() => tick(epoch), document.hidden ? 250 : Math.max(0, 16.7 - (performance.now() - begin)));
  }
  loopTimer = setTimeout(() => tick(loopEpoch), 0);

  // The benchmark owns the engine queue while the UI remains responsive.
  async function measure(kind, button) {
    if (benchmarking) return;
    benchmarking = true;
    button.disabled = true; const text = button.textContent; button.textContent = 'Measuring in CPU worker…';
    try {
      if (inFlight) await inFlight;
      const response = await mod.benchmark({ kind, threads: maxThreads,
        restore: { simd: uiSimd ? 1 : 0, threads: uiThreads, paused: paused ? 1 : 0 } });
      const [s1,sN,v1,vN] = response.times;
      if (kind === 'render') {
        for (const [id,value] of [['b_s1',s1],['b_sN',sN],['b_v1',v1],['b_vN',vN]]) $(id).textContent = value.toFixed(2) + ' ms';
        $('sp_simd').textContent = '×' + (s1/v1).toFixed(2) + ' (1 thread)';
        $('sp_simdN').textContent = '×' + (sN/vN).toFixed(2) + ' (N threads)';
        $('sp_thr').textContent = '×' + (s1/sN).toFixed(2);
        $('sp_all').textContent = '×' + (s1/vN).toFixed(2);
      } else {
        $('f_s').textContent = s1.toFixed(1) + ' / ' + sN.toFixed(1) + ' ms';
        $('f_v').textContent = v1.toFixed(1) + ' / ' + vN.toFixed(1) + ' ms';
        $('f_simd').textContent = '×' + (s1/v1).toFixed(2) + ' (1 thread)';
        $('f_thr').textContent = '×' + (s1/sN).toFixed(2);
      }
    } catch (error) { $('err').textContent = 'Benchmark: ' + error.message; }
    finally { benchmarking = false; button.disabled = false; button.textContent = text; }
  }
  $('bench').onclick = () => measure('render', $('bench'));
  $('benchfluid').onclick = () => measure('fluid', $('benchfluid'));

  // Console/automation handle (headless tabs pause rAF).
  window.demo = {
    setDiagnostics: (enabled) => { diagnosticsEnabled = !!enabled; lastReadout = -Infinity; fpsCount = 0; fpsT0 = performance.now(); },
    getUiTiming: () => ({ ...uiTiming, meanMs: uiTiming.updates ? uiTiming.totalMs / uiTiming.updates : 0, includes: 'JS readout formatting and DOM writes only; excludes layout, paint and GPU completion' }),
    applyQuality, getQuality: () => ({mode: qualityMode, width: RW, height: RH, threads: uiThreads}),
    flush: () => mod.flush(), setPlayback: async enabled => {
      running = !!enabled; ++loopEpoch; clearTimeout(loopTimer);
      if (inFlight) await inFlight;
      if (running) loopTimer = setTimeout(() => tick(loopEpoch), 0);
    },
    frame, render, present, getFB, lastMs, getSamples, setThreads, setSimd, setVolume, setNpr, nprMs, setCloth, clothMs, resetCloth, setCoupling, setSeal, setStrat, setDenoise, denoiseMs, setVintage, vintageMs, setVinFlag, setMaterial, setFire, setLayout, setClothRes, clothParts, densAbove, traceMs,
    setRing, getRing, tempMax, setParam, P,
    stepSim, setPaused, resetSim, step: stepSim, stepN: async (n) => { for (let i=0;i<n;i++) await stepSim(); },
    simMs, benchFluid: () => $('benchfluid').click(),
    simdVerified: simdOk, maxThreads,
    setCamera: (y, p, d) => { yaw = y; pitch = p; dist = d; applyCamera(); },
    accumulate: async (n) => { for (let i = 0; i < n; i++) await render(); present(); return getSamples(); },
    bench: () => $('bench').click(),
  };
}
