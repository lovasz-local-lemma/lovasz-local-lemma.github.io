/* Independent teaching implementation of RIVX's documented covariance projection.
   Uses the correct eigensystem, not a bit-identical native renderer port. */
(() => {
  'use strict';
  const transpose = a => a[0].map((_, j) => a.map(r => r[j]));
  const matmul = (a, b) => a.map(r => b[0].map((_, j) => r.reduce((sum, x, k) => sum + x * b[k][j], 0)));
  const mv = (a, v) => a.map(r => r.reduce((sum, x, k) => sum + x * v[k], 0));
  function rotation(yaw, roll) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    return matmul([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]], [[c, 0, s], [0, 1, 0], [-s, 0, c]]);
  }
  function covariance(scales, r) { return matmul(matmul(r, scales.map((s, i) => scales.map((_, j) => i === j ? s * s : 0))), transpose(r)); }
  function eigen2(a, b, c) {
    const radius = Math.hypot(a - c, 2 * b), major = (a + c + radius) / 2, minor = (a + c - radius) / 2;
    return {major, minor, theta: radius < 1e-12 ? 0 : Math.atan2(2 * b, a - c) / 2};
  }
  function project(mean, cov, focal = 350, dilation = .3) {
    const [x, y, z] = mean;
    if (!(z > .02)) return null;
    const j = [[focal / z, 0, -focal * x / (z * z)], [0, -focal / z, focal * y / (z * z)]];
    const s = matmul(matmul(j, cov), transpose(j)); s[0][0] += dilation; s[1][1] += dilation;
    const e = eigen2(s[0][0], s[0][1], s[1][1]); e.minor = Math.max(e.minor, .09);
    return {...e, covariance: s, jacobian: j, mean: [focal * x / z, -focal * y / z]};
  }
  function boundedProfile(radius) { return radius >= 1 ? 0 : (Math.exp(-4 * radius * radius) - Math.exp(-4)) / (1 - Math.exp(-4)); }
  if (typeof module !== 'undefined' && module.exports) module.exports = {rotation, covariance, eigen2, project, matmul, mv, boundedProfile};
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id), canvas = $('stage'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  let pending = 0, disposed = false;
  const schedule = () => { if (!disposed && !pending && !document.hidden) pending = requestAnimationFrame(() => { pending = 0; draw(); }); };
  function draw() {
    const box = canvas.getBoundingClientRect(), w = box.width, h = box.height, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const length = +$('length').value, thickness = +$('thickness').value, depth = +$('depth').value;
    const yaw = +$('yaw').value, roll = +$('roll').value;
    for (const id of ['length', 'thickness', 'depth']) $(id + '-out').value = (+$(id).value).toFixed(2);
    $('yaw-out').value = yaw + '°'; $('roll-out').value = roll + '°';
    const r = rotation(yaw * Math.PI / 180, roll * Math.PI / 180), scales = [length, .27, thickness];
    const cov = covariance(scales, r), proj = project([.65, .18, depth], cov);
    const s1 = Math.sqrt(proj.major), s2 = Math.sqrt(proj.minor);
    $('major').textContent = s1.toFixed(1) + ' px'; $('minor').textContent = s2.toFixed(1) + ' px';
    $('ratio').textContent = (s1 / s2).toFixed(2) + '×';
    const left = w * .245, right = w * .75, centerY = h * .48;
    const worldScale = Math.min(w * .18, h * .32) / 1.2;
    // An inspection camera shows the long axis clearly; the perspective
    // covariance calculation on the right retains its own camera model.
    function world(p) { return [left + (p[0] - p[2] * .45) * worldScale, centerY - (p[1] - p[2] * .30) * worldScale]; }
    function path(points, color, width = 1) {
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    ctx.strokeStyle = '#ffffff0c'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    path([[w / 2, 42], [w / 2, h - 42]], '#a9bddb22');
    const origin = world([0, 0, 0]);
    for (let latitude = -5; latitude <= 5; ++latitude) {
      const a = latitude / 6 * Math.PI / 2;
      const points = Array.from({length: 81}, (_, k) => {
        const t = k / 80 * Math.PI * 2;
        return world(mv(r, [Math.cos(a) * Math.cos(t) * length, Math.sin(a) * .27, Math.cos(a) * Math.sin(t) * thickness]));
      });
      path(points, latitude === 0 ? '#bba5f1a0' : '#a793e349', latitude === 0 ? 1.6 : 1);
    }
    for (let k = 0; k < 12; ++k) {
      const t = k / 12 * Math.PI * 2;
      const points = Array.from({length: 49}, (_, j) => {
        const a = -Math.PI / 2 + j / 48 * Math.PI;
        return world(mv(r, [Math.cos(a) * Math.cos(t) * length, Math.sin(a) * .27, Math.cos(a) * Math.sin(t) * thickness]));
      }); path(points, '#a692e43f');
    }
    for (const [axis, color] of [[0, '#f0c675'], [1, '#86e0d0'], [2, '#b7a5ff']]) {
      const v = scales.map((s, j) => j === axis ? s * 1.25 : 0);
      const point = world(mv(r, v)); path([origin, point], color, 2);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(...point, 3, 0, Math.PI * 2); ctx.fill();
    }
    const displayScale = Math.min((w * .21) / (2 * Math.SQRT2 * s1), (h * .31) / (2 * Math.SQRT2 * s1), 1);
    const isDisk = $('profile').value === 'disk';
    const a = 2 * Math.SQRT2 * (isDisk ? Math.sqrt(s1 * s2) : s1) * displayScale;
    const b = 2 * Math.SQRT2 * (isDisk ? Math.sqrt(s1 * s2) : s2) * displayScale;
    ctx.save(); ctx.translate(right, centerY); ctx.rotate(isDisk ? 0 : proj.theta); ctx.scale(a, b);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let i = 0; i <= 48; ++i) gradient.addColorStop(i / 48, `rgba(125,225,205,${boundedProfile(i / 48) * .88})`);
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(right, centerY); ctx.rotate(proj.theta);
    for (const q of [1, 2, 2 * Math.SQRT2]) {
      ctx.beginPath(); ctx.ellipse(0, 0, s1 * q * displayScale, s2 * q * displayScale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = isDisk ? '#f0bf8070' : '#8bdecf55'; ctx.lineWidth = q === 1 ? 1.4 : 1; ctx.setLineDash(isDisk ? [4, 4] : []); ctx.stroke();
    }
    ctx.setLineDash([]); path([[-s1 * displayScale, 0], [s1 * displayScale, 0]], '#f5d293', 2);
    path([[0, -s2 * displayScale], [0, s2 * displayScale]], '#b6a2ee', 2); ctx.restore();
    ctx.fillStyle = '#bbc9dd'; ctx.font = `${w < 740 ? 11 : 12}px system-ui`;
    ctx.fillText(w < 740 ? '3D covariance · 1σ ellipsoid' : '3D covariance · one-standard-deviation ellipsoid', 14, 25);
    ctx.fillText(isDisk ? 'Round approximation · true contour dashed' : 'Projected field · principal axes', w / 2 + 13, 25);
    ctx.fillStyle = '#94a5ba'; ctx.font = '11px system-ui';
    ctx.fillText(w < 740 ? 'Gold: long · mint: middle · violet: thin' : 'Gold: long axis · mint: middle · violet: thin', 14, h - 24);
    ctx.fillText(w < 740 ? 'f = 350 px · local projection' : 'f = 350 px · first-order perspective · fitted to panel', w / 2 + 13, h - 24);
    ctx.fillStyle = '#d5c5a3'; ctx.font = '18px system-ui'; ctx.fillText('→', w / 2 - 8, centerY + 6);
    canvas.setAttribute('aria-label', `Projected Gaussian with major standard deviation ${s1.toFixed(1)} pixels, minor ${s2.toFixed(1)} pixels, anisotropy ${(s1 / s2).toFixed(2)}. ${isDisk ? 'The round approximation loses the true orientation.' : 'The ellipse retains orientation and axis ratio.'}`);
  }
  ['length', 'thickness', 'yaw', 'roll', 'depth', 'profile'].forEach(id => $(id).addEventListener('input', schedule));
  $('reset').addEventListener('click', () => { for (const [id, value] of Object.entries({length: .8, thickness: .12, yaw: 38, roll: -26, depth: 4, profile: 'ellipse'})) $(id).value = value; schedule(); });
  const observer = new ResizeObserver(schedule); observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(pending); pending = 0; } else schedule(); });
  window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(pending); pending = 0; observer.disconnect(); });
  window.addEventListener('pageshow', () => { disposed = false; observer.observe(canvas); schedule(); });
  schedule();
})();
