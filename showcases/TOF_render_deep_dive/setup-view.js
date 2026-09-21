/* The shared frame guard owns brochure suspension; this viewer retains scan state. */
(() => {
  'use strict';
  const M = HolographySetup, $ = id => document.getElementById(id);
  const fromCarrier = new URLSearchParams(location.search).get('view') === 'carrier';
  const initial = { ...M.defaults, ...(fromCarrier ? { source: 'flood', shutter: 'global', code: 'source' } : {}) };
  const inputs = ['source', 'shutter', 'code', 'frequency', 'cycles', 'tilt', 'relief', 'width', 'offset', 'indirect', 'selected', 'scan'];
  let p = { ...initial }, model, elapsed = 0, previous = 0, pending = 0, visible = true;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvases = [$('geometry'), $('waveform')];
  for (const id of inputs) $(id).value = initial[id];
  function read() {
    for (const id of inputs) p[id] = ['source', 'shutter', 'code'].includes(id) ? $(id).value : +$(id).value;
    if (p.source !== 'point' && p.shutter === 'pixel') { p.shutter = 'column'; $('shutter').value = 'column'; }
    $('shutter').querySelector('option[value="pixel"]').disabled = p.source !== 'point';
    $('tilt').disabled = p.source !== 'tilt';
    $('cycles').disabled = p.code === 'none';
    $('width').disabled = $('offset').disabled = p.shutter === 'global' || !M.scanned(p);
    for (const id of inputs.filter(id => !['source', 'shutter', 'code'].includes(id))) {
      $(id + '-out').value = id === 'frequency' ? p[id] + ' MHz' : id === 'scan' ? Math.round(p[id] * 100) + '%' : Number(p[id].toFixed(2));
    }
    model = M.measure(p);
    $('gate-result').textContent = (100 * model.indirectAcceptance).toFixed(1) + '%';
    $('phase-result').textContent = (model.phaseBias * 180 / Math.PI).toFixed(1) + '°';
    $('correlation-result').textContent = model.correlation.toFixed(3);
    $('scan-result').textContent = model.temporalSteps;
    $('setup-note').textContent = M.scanned(p) ? 'Slow scan is animated. The recorded trace integrates a complete scan.' : 'Steady illumination has no source-address scan. Rolling exposure alone does not reject indirect source regions.';
    $('observation').textContent = p.code === 'source' && !M.scanned(p)
      ? 'The source phase is attached to world position X. A perspective pixel samples X at its surface depth, so the added fringe rate varies across the relief. Tilting the illumination changes propagation separately.'
      : p.shutter === 'global' ? 'All source-to-sensor connections contribute. An image-linear code can separate Fourier sidebands, but it does not remove the indirect phasors summed into each pixel.'
      : p.shutter === 'pixel' ? 'A raster point plus a pixel gate also rejects displaced rows. The extra-length return to the same pixel survives: a tighter spatial gate is not a guarantee of one path.'
      : 'A synchronized column gate rejects the across-column path. The same-column and same-pixel returns remain. Switch to a point projector and pixel gate to test the additional row constraint.';
    schedule();
  }
  function fit(canvas) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = rect.width, h = rect.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#0b1420'; c.fillRect(0, 0, w, h);
    c.font = '12px Inter, Segoe UI, sans-serif'; return { c, w, h };
  }
  function line(c, pts, color, width = 1, dash = []) { c.beginPath(); pts.forEach((pt, i) => i ? c.lineTo(...pt) : c.moveTo(...pt)); c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.stroke(); c.setLineDash([]); }
  function dot(c, pt, color, r = 3) { c.beginPath(); c.arc(...pt, r, 0, M.TAU); c.fillStyle = color; c.fill(); }
  function geometry() {
    const { c, w, h } = fit(canvases[0]);
    const project = q => [w * .5 + q[0] * w / 18 + q[1] * w / 34, h * .61 - q[2] * h / 24 + q[1] * h / 78];
    const address = Math.min(model.temporalSteps - 1, Math.floor(p.scan * model.temporalSteps));
    const [col, row] = p.source === 'point' ? [Math.floor(address / p.rows), address % p.rows] : [address, model.receiver[1]];
    c.fillStyle = '#dfc48b'; c.fillText('01  Source support → surface → camera', 14, 23);
    for (let y = 0; y < p.rows; y++) line(c, Array.from({ length: p.n }, (_, x) => project(M.location(x, y, p))), '#8bb9c52a');
    for (let x = 0; x < p.n; x += 2) line(c, Array.from({ length: p.rows }, (_, y) => project(M.location(x, y, p))), '#8bb9c52a');
    const addressed = M.scanned(p) ? p.source === 'point' ? [[col, row]] : Array.from({ length: p.rows }, (_, y) => [col, y]) : Array.from({ length: 8 }, (_, i) => [Math.round(i * (p.n - 1) / 7), 6]);
    for (const [x, y] of addressed) {
      const q = M.location(x, y, p);
      const start = M.scanned(p) ? [0, 0, 0] : [q[0] - (p.source === 'tilt' ? q[2] * Math.tan(p.tilt * Math.PI / 180) : 0), q[1], 0];
      line(c, [project(start), project(q)], '#ecc66f65', 1.2); dot(c, project(q), '#f5d68a', 2.5);
    }
    const phase = elapsed * .002;
    model.paths.forEach((path, i) => {
      const points = i ? [project(path.sourcePoint), project(path.target), project([0, 0, 0])] : [project(path.target), project([0, 0, 0])];
      const color = i ? `rgba(191,154,239,${.1 + .55 * path.gate})` : '#91e5cfa8';
      line(c, points, color, i ? 1.2 : 2, i ? [3, 4] : []);
      const t = ((phase / M.TAU + i * .21) % 1), a = points[0], b = points[1];
      dot(c, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], color, i ? 2 : 3);
    });
    dot(c, project(model.paths[0].target), '#fff2c7', 4);
    dot(c, project([0, 0, 0]), '#e4c882', 5);
    c.fillStyle = '#9cafbc'; c.fillText('Camera + calibrated projector', Math.max(10, w * .5 - 86), h * .61 + 20);
    const gx = 18, gy = h * .74, gw = w - 36, gh = h * .19, cw = gw / p.n, ch = gh / p.rows;
    const scanColumn = M.scanned(p) ? col : Math.floor(p.scan * p.n);
    c.fillStyle = '#b4c6d4'; c.fillText('02  Sensor pixels: blue = exposed now', gx, gy - 10);
    for (let y = 0; y < p.rows; y++) for (let x = 0; x < p.n; x++) {
      const dx = x - scanColumn + p.offset, dy = p.shutter === 'pixel' && p.source === 'point' ? y - row : 0;
      const open = p.shutter === 'global' ? 1 : Math.exp(-.5 * (dx * dx + dy * dy) / (p.width * p.width));
      const emitted = !M.scanned(p) || (x === col && (p.source === 'line' || y === row));
      c.fillStyle = `rgb(${Math.round(22 + emitted * 92)},${Math.round(32 + open * 93 + emitted * 28)},${Math.round(48 + open * 145)})`;
      c.fillRect(gx + x * cw, gy + y * ch, Math.max(.5, cw - .65), Math.max(.5, ch - .65));
    }
    c.strokeStyle = '#fff1d1'; c.lineWidth = 1.4; c.strokeRect(gx + model.receiver[0] * cw, gy + model.receiver[1] * ch, cw, ch);
    c.font = '11px Inter, Segoe UI, sans-serif'; c.fillStyle = '#afbbcb';
    c.fillText(p.source === 'point' ? 'One spot now · rows and columns are addressed' : p.source === 'line' ? 'One column illuminated · all its rows together' : 'All surface regions are illuminated together', gx, h - 10);
  }
  function waveform() {
    const { c, w, h } = fit(canvases[1]), left = 38, width = w - 56;
    const waveTop = 45, waveH = h * .3, productTop = h * .49, productH = h * .18, imageTop = h * .79;
    const ymax = 1 + p.indirect, px = t => left + t / (2 * M.TAU) * width;
    c.fillStyle = '#bfabeb'; c.fillText('03  Received AC signal and reference', 14, 23);
    line(c, [[left, waveTop + waveH / 2], [left + width, waveTop + waveH / 2]], '#a1b6c437');
    const py = v => waveTop + waveH / 2 - v / ymax * waveH * .46;
    line(c, model.trace.map(t => [px(t.theta), py(t.received)]), '#a4e6d1', 1.7);
    line(c, model.trace.map(t => [px(t.theta), py(t.reference)]), '#edcd88', 1.5);
    c.fillStyle = '#a7e6d2'; c.fillText('Received', left, waveTop + waveH + 18);
    c.fillStyle = '#edcd88'; c.fillText('Reference', left + 86, waveTop + waveH + 18);
    c.fillStyle = '#bdc9d8'; c.fillText('04  Their product; dashed = exact mean', 14, productTop - 13);
    const sy = v => productTop + productH / 2 - v / ymax * productH * .46;
    line(c, model.trace.map(t => [px(t.theta), sy(t.product)]), '#b99ade', 1.4);
    line(c, [[left, sy(model.correlation)], [left + width, sy(model.correlation)]], '#f5d38f', 1, [4, 3]);
    const cursor = elapsed * .002 % (2 * M.TAU), cx = px(cursor);
    line(c, [[cx, waveTop], [cx, productTop + productH]], '#edf1ef55', 1, [2, 4]);
    c.fillStyle = '#bed2dc'; c.fillText('05  Full-scan correlation across image', 14, imageTop - 13);
    const step = width / p.n;
    for (let x = 0; x < p.n; x++) {
      const a = .5 + model.fringes[x] / (1 + p.indirect), v = Math.round(Math.max(0, Math.min(1, a)) * 230);
      c.fillStyle = `rgb(${v},${v},${Math.min(255, v + 20)})`; c.fillRect(left + x * step, imageTop, step + .5, 27);
    }
    c.strokeStyle = '#f4d38d'; c.strokeRect(left + p.selected * step, imageTop - 2, step, 31);
    c.fillStyle = '#a4b7c5'; c.font = '11px Inter, Segoe UI, sans-serif';
    c.fillText('White cursor: modulation clock (slowed down)', 14, h - 12);
  }
  function render(time) {
    pending = 0; if (!visible || document.hidden) { previous = 0; return; }
    const dt = previous ? Math.min(50, Math.max(0, time - previous)) : 0; previous = time;
    if (playing) { elapsed += dt; p.scan = (p.scan + dt / 12000) % 1; $('scan').value = p.scan; $('scan-out').value = Math.round(p.scan * 100) + '%'; }
    geometry(); waveform(); if (playing) schedule();
  }
  function schedule() { if (!pending && visible && !document.hidden) pending = requestAnimationFrame(render); }
  inputs.forEach(id => $(id).addEventListener('input', () => { if (id === 'scan') { playing = false; $('play').textContent = '▶ Play scan'; } read(); }));
  $('play').addEventListener('click', () => { playing = !playing; previous = 0; $('play').textContent = playing ? '⏸ Pause scan' : '▶ Play scan'; schedule(); });
  $('reset').addEventListener('click', () => { inputs.forEach(id => $(id).value = initial[id]); elapsed = 0; previous = 0; read(); });
  new ResizeObserver(schedule).observe(document.querySelector('.view-grid'));
  new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); previous = 0; if (visible) schedule(); }).observe(document.querySelector('.view-grid'));
  document.addEventListener('visibilitychange', () => { previous = 0; if (!document.hidden) schedule(); });
  if (!playing) $('play').textContent = '▶ Play scan';
  read();
})();
