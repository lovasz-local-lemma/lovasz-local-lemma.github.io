/* Teaching model: exact two-interface Snell rays, schematic rotational display.
   Derived from RadianceLab/docs/hourglass/README.md. No native film estimator. */
(() => {
  'use strict';
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const unit = a => mul(a, 1 / Math.hypot(...a));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function refract(direction, normal, eta) {
    const cosine = clamp(-dot(direction, normal), 0, 1);
    const discriminant = 1 - eta * eta * (1 - cosine * cosine);
    if (discriminant < 0) return null;
    return unit(add(mul(direction, eta), mul(normal, eta * cosine - Math.sqrt(discriminant))));
  }
  function fresnel(cosine, n1, n2) {
    const sin2 = (n1 / n2) ** 2 * (1 - cosine * cosine);
    if (sin2 >= 1) return 1;
    const ct = Math.sqrt(1 - sin2);
    const rs = (n1 * cosine - n2 * ct) / (n1 * cosine + n2 * ct);
    const rp = (n1 * ct - n2 * cosine) / (n1 * ct + n2 * cosine);
    return (rs * rs + rp * rp) / 2;
  }
  function trace(distance, ior, fraction) {
    const psi = Math.asin(1 / distance) * fraction;
    const origin = [-distance, 0], incoming = [Math.cos(psi), Math.sin(psi)];
    const b = dot(origin, incoming), disc = b * b - dot(origin, origin) + 1;
    if (disc < 0) return null;
    const entry = add(origin, mul(incoming, -b - Math.sqrt(disc)));
    const normalIn = unit(entry), cosineIn = -dot(incoming, normalIn);
    const internal = refract(incoming, normalIn, 1 / ior);
    if (!internal) return null;
    const chord = -2 * dot(entry, internal);
    const exit = add(entry, mul(internal, chord));
    const normalOut = mul(unit(exit), -1), cosineOut = -dot(internal, normalOut);
    const outgoing = refract(internal, normalOut, ior);
    if (!outgoing) return null;
    return {origin, incoming, entry, internal, exit, outgoing, chord,
      incidence: Math.acos(clamp(cosineIn, -1, 1)),
      deviation: Math.acos(clamp(dot(incoming, outgoing), -1, 1)),
      transmission: (1 - fresnel(cosineIn, 1, ior)) * (1 - fresnel(cosineOut, ior, 1))};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {trace, refract, fresnel};
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id), canvas = $('stage'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  const controls = ['ior', 'source', 'polar', 'reach', 'orbit', 'view'];
  let pending = 0, disposed = false;
  function schedule() { if (!disposed && !pending && !document.hidden) pending = requestAnimationFrame(() => { pending = 0; draw(); }); }
  function draw() {
    const box = canvas.getBoundingClientRect(), w = box.width, h = box.height;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const distance = +$('source').value, ior = +$('ior').value;
    const fraction = +$('polar').value / 100, reach = +$('reach').value;
    const yaw = +$('orbit').value * Math.PI / 180;
    const meridian = $('view').value === 'meridian';
    $('ior-out').value = ior.toFixed(2); $('source-out').value = distance.toFixed(2) + ' R';
    $('polar-out').value = Math.round(fraction * 100) + '%'; $('reach-out').value = reach.toFixed(1) + ' R';
    $('orbit-out').value = Math.round(yaw * 180 / Math.PI) + '°'; $('orbit').disabled = meridian;
    const selected = trace(distance, ior, fraction);
    if (!selected) return;
    $('entry-angle').textContent = (selected.incidence * 180 / Math.PI).toFixed(1) + '°';
    $('deviation').textContent = (selected.deviation * 180 / Math.PI).toFixed(1) + '°';
    $('transmission').textContent = (selected.transmission * 100).toFixed(1) + '%';
    const cy = meridian ? 0 : Math.sin(yaw), cc = meridian ? 1 : Math.cos(yaw);
    const rotate = (p, az = 0) => {
      if (meridian) return [p[0], p[1]];
      const yy = p[1] * Math.cos(az), zz = p[1] * Math.sin(az);
      return [cc * p[0] + cy * zz, yy * .966 - (-cy * p[0] + cc * zz) * .259];
    };
    const end = add(selected.exit, mul(selected.outgoing, reach));
    const sampleBounds = [[-distance, 0], [1 + reach, 0]];
    for (let a = 0; a < 64; ++a) sampleBounds.push(rotate(end, a / 64 * Math.PI * 2));
    for (let a = 0; a < 64; ++a) sampleBounds.push([Math.cos(a / 64 * Math.PI * 2), Math.sin(a / 64 * Math.PI * 2)]);
    const xs = sampleBounds.map(p => p[0]), ys = sampleBounds.map(p => p[1]);
    const x0 = Math.min(...xs) - .25, x1 = Math.max(...xs) + .25;
    const y0 = Math.min(...ys, -1.2), y1 = Math.max(...ys, 1.2);
    const scale = Math.min((w - 64) / (x1 - x0), (h - 70) / (y1 - y0));
    const project = (p, az = 0) => { const q = rotate(p, az); return [w / 2 + (q[0] - (x0 + x1) / 2) * scale, h / 2 - (q[1] - (y0 + y1) / 2) * scale]; };
    function line(points, color, width = 1, az = 0) {
      ctx.beginPath(); points.forEach((p, i) => { const q = project(p, az); i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    ctx.strokeStyle = '#7e8da011'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    line([[-distance, 0], [reach + 1, 0]], '#95acc22d');
    const center = project([0, 0]);
    const glass = ctx.createRadialGradient(center[0] - scale * .35, center[1] - scale * .4, 1, center[0], center[1], scale);
    glass.addColorStop(0, '#9fa9ed25'); glass.addColorStop(.82, '#8197c709'); glass.addColorStop(1, '#acc6ef35');
    ctx.beginPath(); ctx.arc(...center, scale, 0, Math.PI * 2); ctx.fillStyle = glass; ctx.fill();
    ctx.strokeStyle = '#b7c7ed66'; ctx.lineWidth = 1.4; ctx.stroke();
    if (meridian) {
      for (let k = -24; k <= 24; ++k) {
        const r = trace(distance, ior, k / 25 * .96); if (!r) continue;
        line([r.origin, r.entry], '#e7c37124'); line([r.entry, r.exit], '#b399e83b');
        line([r.exit, add(r.exit, mul(r.outgoing, reach))], '#7bd9c847');
      }
      line([selected.origin, selected.entry], '#f2c777', 2);
      line([selected.entry, selected.exit], '#c6a5ff', 2.2);
      line([selected.exit, end], '#98ffe0', 2.2);
    } else {
      for (let ring = 0; ring <= 15; ++ring) {
        const p = add(selected.exit, mul(selected.outgoing, reach * ring / 15));
        const ringPoints = Array.from({length: 97}, (_, k) => project(p, k / 96 * Math.PI * 2));
        ctx.beginPath(); ringPoints.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q));
        ctx.strokeStyle = ring === 0 ? '#a9f1dfb0' : '#71d8c741'; ctx.lineWidth = ring === 0 ? 1.3 : .8; ctx.stroke();
      }
      for (let k = 0; k < 32; ++k) {
        const a = k / 32 * Math.PI * 2;
        line([selected.origin, selected.entry], '#ecc46e39', .8, a);
        line([selected.entry, selected.exit], '#b89bee52', .9, a);
        line([selected.exit, end], '#79e4ce65', .9, a);
      }
      line([selected.origin, selected.entry], '#f3ce80', 2);
      line([selected.entry, selected.exit], '#d0b8ff', 2.4);
      line([selected.exit, end], '#a5ffe5', 2.4);
    }
    for (const [point, color] of [[selected.origin, '#f9d88b'], [selected.entry, '#ceacf7'], [selected.exit, '#a2f6dc']]) {
      const p = project(point); ctx.shadowColor = color; ctx.shadowBlur = 15; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(...p, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#bcc8dc'; ctx.font = '12px system-ui';
    ctx.fillText(meridian ? 'Different polar seeds · one meridian' : 'One polar seed · azimuth swept around the source–center axis', 16, 24);
    ctx.fillStyle = '#97a9bc'; ctx.fillText('R = sphere radius · ray spacing is schematic', 16, h - 15);
  }
  controls.forEach(id => $(id).addEventListener('input', schedule));
  $('straight').addEventListener('click', () => { $('ior').value = 1; schedule(); });
  $('reset').addEventListener('click', () => {
    for (const [id, value] of Object.entries({ior: 1.5, source: 3.2, polar: 65, reach: 4, orbit: 24, view: 'revolve'})) $(id).value = value;
    schedule();
  });
  const observer = new ResizeObserver(schedule); observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(pending); pending = 0; } else schedule(); });
  window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(pending); pending = 0; observer.disconnect(); });
  window.addEventListener('pageshow', () => { disposed = false; observer.observe(canvas); schedule(); });
  schedule();
})();
