/* Fire studies: deterministic Canvas2D scenes on the portfolio's shared clock. */
(() => {
  'use strict';
  const presets = [
    ['cinderstorm', 'Cinder squall', 'Windblown copper trails, tiny white-hot cores, and drifting fire dust.'],
    ['hearth', 'Velvet furnace', 'A turbulent field of copper heat, luminous amber filaments, and suspended embers.'],
    ['firewhirl', 'Fire whirl', 'Twin updrafts weave glowing embers into ascending, helical plumes.'],
    ['sparkcascade', 'Spark cascade', 'White-hot showers fall through the dark, splitting into fine copper trails.'],
    ['iondrift', 'Ion drift', 'Gold and copper motes follow curling currents, with occasional cool ionized glints.']
  ];
  const TAU = Math.PI * 2;
  const fract = n => n - Math.floor(n);
  const seed = n => fract(Math.sin(n * 127.1 + 91.7) * 43758.5453);
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const q = clamp(n); return q * q * (3 - 2 * q); };
  // Keep the middle quiet enough for type; the heat lives in the margins.
  const marginLight = (x, w) => .2 + .8 * smooth(Math.abs(x / w - .5) * 3.2);

  function sprite(stops, size = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  function create() {
    const hot = sprite([[0, '#fffde5'], [.035, '#fff5bb'], [.1, '#ffc35adb'], [.24, '#f07c244a'], [.58, '#ce4d1210'], [1, '#9b270000']]);
    const copper = sprite([[0, '#ffd583'], [.07, '#ff9b41db'], [.24, '#dc56194a'], [.56, '#a82e1112'], [1, '#67190700']]);
    const pale = sprite([[0, '#fffef7'], [.045, '#fff5d4'], [.12, '#ffce6fc4'], [.3, '#e699332c'], [1, '#a74c0800']]);
    const heat = sprite([[0, '#ed741044'], [.22, '#cc4d132a'], [.58, '#8e2c1010'], [1, '#4c150000']], 128);
    const amberHeat = sprite([[0, '#e99c2745'], [.18, '#d479182c'], [.54, '#a6420c12'], [1, '#50220800']], 128);
    const ion = sprite([[0, '#f4ffff'], [.04, '#e4ffff'], [.1, '#93e8f7c2'], [.24, '#51a0bc34'], [.58, '#3061760a'], [1, '#15394100']]);
    const sparks = [hot, copper, pale, ion];
    // Fixed seeds make pause, reduced motion, and a resized viewport reproducible.
    const particles = Array.from({ length: 148 }, (_, i) => ({
      phase: seed(i + 1), lane: seed(i + 185), spread: seed(i + 341),
      depth: seed(i + 530), turn: seed(i + 727), speed: seed(i + 906)
    }));
    // A periodic value-noise table avoids per-pixel trigonometric hashes. The
    // sampled domain is much smaller than its period, so no repetition is visible.
    const noiseTable = Float32Array.from({ length: 128 * 128 }, (_, i) => seed(i + 1801));
    const noise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const x0 = ix & 127, x1 = (ix + 1) & 127, y0 = (iy & 127) * 128, y1 = ((iy + 1) & 127) * 128;
      const a = noiseTable[y0 + x0], b = noiseTable[y0 + x1];
      const c = noiseTable[y1 + x0], d = noiseTable[y1 + x1];
      return a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy;
    };
    const field = document.createElement('canvas');
    const fieldCtx = field.getContext('2d');
    let fieldImage = null, fieldTick = NaN, fieldWidth = 0, fieldHeight = 0;
    // At most 8,640 samples at 15 Hz (3,072 on a narrow screen). Reuse the image
    // buffer, and derive everything from supplied time: pause and scene crossfades
    // never create another clock or accumulate simulation drift.
    function updateHeat(w, h, t) {
      const mobile = w < 760, cols = mobile ? 64 : 120, rows = mobile ? 48 : 72;
      const tick = Math.floor(t * 15);
      if (field.width !== cols || field.height !== rows || !fieldImage) {
        field.width = cols; field.height = rows;
        fieldImage = fieldCtx.createImageData(cols, rows); fieldTick = NaN;
      }
      if (tick === fieldTick && w === fieldWidth && h === fieldHeight) return;
      fieldTick = tick; fieldWidth = w; fieldHeight = h;
      const time = tick / 15, data = fieldImage.data;
      const aspect = Math.max(.7, Math.min(2.7, w / h));
      for (let iy = 0; iy < rows; iy++) {
        const v = iy / (rows - 1), lower = smooth((v - .12) / .88);
        for (let ix = 0; ix < cols; ix++) {
          const u = ix / (cols - 1), edge = .075 + .925 * smooth(Math.abs(u - .5) * 2.5);
          const x = u * 5.5 * aspect, y = v * 3.6 + time * .38;
          const warpX = noise(x * .61 + 17.3, y * .72 + 7.7) - .5;
          const warpY = noise(x * .74 - time * .052 + 61.5, y * .62 + 39.1) - .5;
          const qx = x + warpX * 1.5, qy = y + warpY * 1.05;
          const turbulence = noise(qx, qy) * .58 + noise(qx * 2.13 + 13.1, qy * 2.13) * .28
            + noise(qx * 4.19, qy * 4.19 + 71.4) * .14;
          // Thresholded emission has irregular gaps and fine bright ridges;
          // there is no outline, tongue, or closed geometric flame silhouette.
          const density = smooth((turbulence - (.64 - lower * .2)) * 3.5);
          const ridge = Math.pow(clamp(1 - Math.abs(turbulence - .56) * 17), 3);
          const emission = clamp(density * .73 + ridge * density * .42);
          const alpha = lower * edge * emission * (.23 + lower * .39);
          const temperature = clamp(density * .85 + ridge * .35);
          const offset = (iy * cols + ix) * 4;
          data[offset] = 135 + temperature * 120;
          data[offset + 1] = 30 + temperature * temperature * 170;
          data[offset + 2] = 8 + Math.pow(temperature, 3) * 70;
          data[offset + 3] = alpha * 255;
        }
      }
      fieldCtx.putImageData(fieldImage, 0, 0);
    }
    function renderHeat(ctx, w, h, t, strength = 1) {
      if (!fieldCtx || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(t)
        || !Number.isFinite(strength) || w <= 0 || h <= 0 || strength <= 0) return;
      updateHeat(w, h, t);
      ctx.save(); ctx.globalAlpha = Math.min(1, ctx.globalAlpha * strength);
      ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(field, 0, 0, w, h); ctx.restore();
    }
    const bloom = (ctx, image, x, y, rx, ry, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, x - rx, y - ry, rx * 2, ry * 2);
    };
    const trace = (ctx, points) => {
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    };
    const trail = (ctx, points, alpha, width, color = '#ffcb79') => {
      trace(ctx, points);
      ctx.globalAlpha = alpha * .13; ctx.strokeStyle = '#e9691e'; ctx.lineWidth = width * 4.4; ctx.stroke();
      ctx.globalAlpha = alpha * .65; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    const ember = (ctx, x, y, r, alpha, tint, angle = 0, stretch = 1) => {
      if (alpha < .004) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      bloom(ctx, sparks[tint], 0, 0, r, r * stretch, alpha);
      if (r > 5.3) {
        ctx.globalAlpha = alpha * .85; ctx.fillStyle = tint === 3 ? '#efffff' : tint === 1 ? '#ffba64' : '#fff8d8';
        ctx.fillRect(-.32, -.66 * stretch, .64, 1.32 * stretch);
      }
      ctx.restore();
    };

    function cinderstorm(ctx, w, h, t) {
      const mobile = w < 760, count = mobile ? 72 : 148;
      const gust = .5 + .5 * Math.sin(t * .29);
      bloom(ctx, heat, w * .04, h * .96, Math.min(w * .52, 560), h * .34, .7);
      bloom(ctx, amberHeat, w * .96, h * .7, Math.min(w * .35, 420), h * .48, .25);
      for (let i = 0; i < count; i++) {
        const p = particles[i], life = 10 + p.speed * 15;
        const u = fract(t / life + p.phase), fast = i % 7 === 0;
        const at = q => {
          const sway = Math.sin(q * 7.4 + p.turn * TAU + t * .17) * .033;
          return [w * (p.lane * 1.13 - .3 + q * (.35 + p.depth * .25) + sway),
            h * (1.1 - q * 1.28) + Math.sin(q * 11 + p.turn * TAU) * 13];
        };
        const [x, y] = at(u);
        const opacity = smooth(u * 12) * smooth((1 - u) * 7) * marginLight(x, w);
        const flicker = .77 + .17 * Math.sin(t * 4.1 + i * 2.3);
        const alpha = opacity * (.32 + p.depth * .54) * flicker;
        const tail = (fast ? .037 : .006 + p.depth * .009) * (.75 + gust * .5);
        if (u > tail && (fast || p.depth > .43)) {
          const points = [];
          for (let j = 0; j <= 4; j++) points.push(at(u - tail * j / 4));
          trail(ctx, points, alpha * (fast ? .8 : .4), fast ? .8 : .36 + p.depth * .24);
        }
        const previous = at(Math.max(0, u - .002));
        const angle = Math.atan2(y - previous[1], x - previous[0]) + Math.PI / 2;
        ember(ctx, x, y, 3 + p.depth * 7.5, alpha, u > .72 ? 1 : i % 3, angle, fast ? 1.8 : 1.1);
      }
    }

    function hearth(ctx, w, h, t) {
      const mobile = w < 760, count = mobile ? 64 : 128;
      const pulse = .88 + Math.sin(t * .65) * .08 + Math.sin(t * 1.39) * .04;
      bloom(ctx, heat, w * .07, h * 1.02, Math.min(w * .57, 620), h * .43, pulse);
      bloom(ctx, amberHeat, w * .93, h * 1.05, Math.min(w * .51, 620), h * .43, pulse * .82);
      renderHeat(ctx, w, h, t, 1.15);
      for (let i = 0; i < count; i++) {
        const p = particles[i], u = fract(t / (27 + p.speed * 35) + p.phase);
        const side = i % 2, source = side ? .9 : .1;
        const x = w * (source + (p.lane - .5) * .43 + Math.sin(t * .3 + u * 6 + p.turn * TAU) * .033);
        const y = h * (1.035 - Math.pow(u, 1.36) * 1.12);
        const alpha = smooth(u * 15) * smooth((1 - u) * 6) * (.29 + p.depth * .56) * marginLight(x, w);
        const breathing = .75 + .18 * Math.sin(t * 2.7 + i * 1.7) + .07 * Math.sin(t * 5.2 + i);
        const size = 3.1 + p.depth * 8.5;
        ember(ctx, x, y, size, alpha * breathing, u > .64 ? 1 : i % 3, Math.sin(t * .45 + i) * .4, 1.12);
      }
    }

    function firewhirl(ctx, w, h, t) {
      const mobile = w < 760, count = mobile ? 72 : 144;
      const radius = Math.min(w * .115, 150);
      for (let side = 0; side < 2; side++) {
        const x = w * (side ? .92 : .075);
        bloom(ctx, side ? heat : amberHeat, x, h * .94, radius * 2.6, h * .31, .59);
      }
      for (let i = 0; i < count; i++) {
        const p = particles[i], side = i % 2, life = 16 + p.speed * 18;
        const u = fract(t / life + p.phase);
        const at = q => {
          const a = q * TAU * (1.35 + p.turn * .6) + t * .18 + p.lane * TAU;
          const envelope = .21 + Math.sin(q * Math.PI * .86) * .79;
          const center = w * (side ? .92 : .075) + Math.sin(q * 3 + t * .16 + side * 2.4) * radius * .25;
          const r = radius * envelope * (.55 + p.spread * .45);
          return [center + Math.sin(a) * r, h * (1.06 - q * (side ? 1.15 : .91)) + Math.cos(a) * r * .24,
            .56 + Math.cos(a) * .44];
        };
        const [x, y, depth] = at(u);
        const edge = smooth(u * 12) * smooth((1 - u) * 7);
        const alpha = edge * (.22 + depth * .66) * (.55 + p.depth * .45) * marginLight(x, w);
        const tail = .017 + p.depth * .024;
        if (u > tail && i % 3 !== 0) {
          const points = [];
          for (let j = 0; j <= 6; j++) points.push(at(u - tail * j / 6));
          trail(ctx, points, alpha * .65, .35 + depth * .4, depth > .6 ? '#ffe2a2' : '#e68d3d');
        }
        const previous = at(Math.max(0, u - .003));
        const angle = Math.atan2(y - previous[1], x - previous[0]) + Math.PI / 2;
        ember(ctx, x, y, 3.4 + depth * 5.6 + p.depth * 1.6, alpha, depth < .32 || u > .82 ? 1 : i % 3, angle, 1.25);
      }
    }

    function sparkcascade(ctx, w, h, t) {
      const count = w < 760 ? 72 : 144;
      bloom(ctx, heat, w * .04, h * .12, Math.min(w * .28, 340), h * .19, .39);
      bloom(ctx, amberHeat, w * .96, h * .04, Math.min(w * .23, 300), h * .22, .25);
      for (let i = 0; i < count; i++) {
        const p = particles[i], side = i % 2, sign = side ? -1 : 1;
        const u = fract(t / (4.5 + p.speed * 8.5) + p.phase);
        const at = q => {
          const wind = Math.sin(q * 5 + p.turn * TAU + t * .12) * q * .018;
          const source = side ? .965 : .035;
          return [w * (source + (p.lane - .5) * .18 + sign * q * (.02 + p.spread * .15) + wind),
            h * (-.08 + p.turn * .14 + .2 * q + q * q * 1.08)];
        };
        const [x, y] = at(u), previous = at(Math.max(0, u - .003));
        const alpha = smooth(u * 14) * smooth((1 - u) * 6) * (.35 + p.depth * .57) * marginLight(x, w);
        const tail = .014 + p.depth * .026;
        if (u > tail) {
          const points = [];
          for (let j = 0; j <= 3; j++) points.push(at(u - tail * j / 3));
          trail(ctx, points, alpha, .32 + p.depth * .35, u < .48 ? '#ffecca' : '#edaa55');
          // Occasional branches split from a real parent trail. Their brightness
          // decays within the particle lifetime instead of forming a fixed motif.
          if (i % 7 === 0 && u > .3 && u < .8) {
            const split = smooth((u - .3) * 5) * smooth((.8 - u) * 7);
            const start = at(u - tail), bx = x + sign * (5 + p.spread * 19) * split;
            const by = y - h * tail * .18;
            trail(ctx, [start, [(start[0] + bx) * .5, (start[1] + by) * .5], [bx, by]], alpha * split * .7, .36);
            ember(ctx, bx, by, 3.8, alpha * split * .73, 1, -.2 * sign, 1.2);
          }
        }
        const angle = Math.atan2(y - previous[1], x - previous[0]) + Math.PI / 2;
        ember(ctx, x, y, 3 + p.depth * 5.2, alpha, u > .61 ? 1 : i % 3, angle, 1.55);
      }
    }

    function iondrift(ctx, w, h, t) {
      const count = w < 760 ? 76 : 148;
      bloom(ctx, amberHeat, w * .055, h * .78, Math.min(w * .38, 440), h * .42, .3);
      bloom(ctx, heat, w * .96, h * .36, Math.min(w * .31, 360), h * .38, .2);
      for (let i = 0; i < count; i++) {
        const p = particles[i], life = 31 + p.speed * 44;
        const u = fract(t / life + p.phase), cool = i % 13 === 0;
        const at = (q, time) => {
          const px = p.lane * 4.2 + time * .035, py = q * 3.7 + p.turn * 2;
          const epsilon = .075;
          // Rotate the gradient of a noise potential by 90 degrees. These curl
          // offsets let dust sweep into small eddies without cursor interaction.
          const curlX = (noise(px, py + epsilon) - noise(px, py - epsilon)) / (2 * epsilon);
          const curlY = (noise(px - epsilon, py) - noise(px + epsilon, py)) / (2 * epsilon);
          const lane = p.lane < .5 ? p.lane * .62 : 1 - (1 - p.lane) * .62;
          return [w * (lane + curlX * .075 + Math.sin(q * 5 + p.turn * TAU) * .018),
            h * (1.06 - q * 1.18 + curlY * .035)];
        };
        const [x, y] = at(u, t);
        const alpha = smooth(u * 12) * smooth((1 - u) * 8) * (.3 + p.depth * .57) * marginLight(x, w);
        const scintillation = .77 + .23 * Math.pow(.5 + .5 * Math.sin(t * (2 + p.speed * 2) + i * 3.7), 3);
        const age = .22 + p.depth * .48;
        if (p.depth > .55 && u > age / life) {
          const points = [];
          for (let j = 0; j <= 4; j++) points.push(at(u - age * j / (4 * life), t - age * j / 4));
          trail(ctx, points, alpha * .54, .3 + p.depth * .23, cool ? '#bdeff4' : '#f7ce87');
        }
        const previous = at(Math.max(0, u - .002), t - life * .002);
        const angle = Math.atan2(y - previous[1], x - previous[0]) + Math.PI / 2;
        ember(ctx, x, y, 3 + p.depth * 6.5, alpha * scintillation, cool ? 3 : i % 3, angle, 1.1);
      }
    }

    const scenes = { cinderstorm, hearth, firewhirl, sparkcascade, iondrift };
    return {
      renderHeat,
      render(mode, ctx, w, h, t) {
        if (!scenes[mode] || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(t) || w <= 0 || h <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        scenes[mode](ctx, w, h, t);
        ctx.restore();
      }
    };
  }
  window.PortfolioFireStudies = { presets, create };
})();
