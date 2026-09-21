// BalanceForge — 3D CNN inset renderer.
//
// Sits to the upper-right of the sim canvas (below the 2D CNN inset). Three
// visualization modes, all driven by the data exposed on a BF.cnn3d.policy
// instance (lastVolume, lastConv, lastFilterActivations) plus the
// parameter vector (for the most-active-filter mode).
//
// Modes:
//   'flipbook' — cycles through the volume's depth slices over a fixed
//                period (~800ms), so each slice gets shown long enough
//                to read. Bottom strip: timeline of slice indices.
//   'slices'   — renders the FIRST, MIDDLE, and LAST depth slices side
//                by side. Static — useful when you want to compare
//                "early" / "mid" / "now" without animation.
//   'filter'   — finds the most-active conv filter (highest summed
//                activation), then renders its (filterDepth) spatial
//                kernel slices side-by-side. Shows what spatio-temporal
//                pattern that filter has learned to detect.
//
// All three render to a single canvas; the layout adapts per mode.

(function (BF) {
  'use strict';
  const { fitCanvas } = BF.util;

  const PURPLE = [80, 50, 200];
  const ORANGE = [245, 130, 30];

  function makeRenderer(canvas) {
    let flipStart = 0;  // ms
    return {
      // Reset internal animation state — call when policy changes so the
      // flipbook restarts from slice 0.
      reset() { flipStart = (typeof performance !== 'undefined') ? performance.now() : 0; },

      // policy: BF.cnn3d.policy instance with .config + .lastVolume etc.
      // params: the controller's parameter vector (for filter mode).
      // mode: 'flipbook' | 'slices' | 'filter'.
      draw(policy, params, mode) {
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#0b0d12';
        ctx.fillRect(0, 0, w, h);
        if (!policy || !policy.config || !policy.lastVolume) {
          ctx.fillStyle = 'rgba(154,163,187,0.55)';
          ctx.font = '10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('awaiting first forward pass', w / 2, h / 2);
          ctx.restore();
          return;
        }
        const cfg = policy.config;
        const D = cfg.depthSize, H = cfg.imageSize, W = cfg.imageSize;
        if (mode === 'slices') drawSlices(ctx, policy.lastVolume, cfg, w, h);
        else if (mode === 'filter') drawFilter(ctx, params, policy, cfg, w, h);
        else if (mode === 'volumetric') drawVolumetric(ctx, policy.lastVolume, cfg, w, h);
        else drawFlipbook(ctx, policy.lastVolume, cfg, w, h, flipStart);
        ctx.restore();
      },
    };
  }

  // Render a single slice as a grayscale-on-purple image with a small label.
  function drawSliceTo(ctx, slice, H, W, x0, y0, sw, sh, label, hue) {
    const cellW = sw / W, cellH = sh / H;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = slice[y * W + x];
        if (v < 1e-3) continue;
        // Interpolate background-purple → highlight-orange.
        const a = Math.min(1, v);
        const r = Math.round(PURPLE[0] + (ORANGE[0] - PURPLE[0]) * a);
        const g = Math.round(PURPLE[1] + (ORANGE[1] - PURPLE[1]) * a);
        const b = Math.round(PURPLE[2] + (ORANGE[2] - PURPLE[2]) * a);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x0 + x * cellW, y0 + y * cellH, cellW + 0.5, cellH + 0.5);
      }
    }
    // Border + label.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, sw - 1, sh - 1);
    if (label != null) {
      ctx.fillStyle = `rgba(${hue || '255,255,255'}, 0.65)`;
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x0 + sw / 2, y0 + sh + 9);
    }
  }

  // Cycle through depth slices over CYCLE_MS, one at a time. Bottom strip
  // shows a tiny timeline with the active index highlighted.
  function drawFlipbook(ctx, volume, cfg, w, h, startMs) {
    const D = cfg.depthSize, H = cfg.imageSize, W = cfg.imageSize;
    const CYCLE_MS = 1200;
    const now = (typeof performance !== 'undefined') ? performance.now() : startMs;
    const t = ((now - startMs) % CYCLE_MS) / CYCLE_MS;
    const idx = Math.min(D - 1, Math.floor(t * D));
    const slice = new Float64Array(H * W);
    const off = idx * H * W;
    for (let i = 0; i < H * W; i++) slice[i] = volume[off + i];

    const padX = 6, padY = 4, stripH = 10;
    const sw = w - padX * 2;
    const sh = h - padY * 2 - stripH - 12; // leave room for strip + label
    drawSliceTo(ctx, slice, H, W, padX, padY, sw, sh,
                cfg.inputMode === 'spatial' ? `z=${idx}/${D-1}` : `t=${idx}/${D-1}`,
                '255, 255, 255');

    // Timeline strip.
    const stripY = padY + sh + 12;
    const stripW = w - padX * 2;
    const cellW = stripW / D;
    for (let i = 0; i < D; i++) {
      ctx.fillStyle = i === idx ? 'rgba(245, 130, 30, 0.85)' : 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(padX + i * cellW + 0.5, stripY, cellW - 1.5, stripH - 2);
    }
  }

  // Static row of 3 slices: oldest, middle, newest (for temporal mode) or
  // similar depth tiers for spatial mode.
  function drawSlices(ctx, volume, cfg, w, h) {
    const D = cfg.depthSize, H = cfg.imageSize, W = cfg.imageSize;
    const indices = D >= 3 ? [0, Math.floor(D / 2), D - 1] : [0, 0, D - 1];
    const padX = 6, padY = 4, gap = 4;
    const sliceW = (w - padX * 2 - gap * 2) / 3;
    const sliceH = h - padY * 2 - 12;
    for (let k = 0; k < 3; k++) {
      const idx = indices[k];
      const slice = new Float64Array(H * W);
      const off = idx * H * W;
      for (let i = 0; i < H * W; i++) slice[i] = volume[off + i];
      const x0 = padX + k * (sliceW + gap);
      const tag = cfg.inputMode === 'spatial'
        ? `z=${idx}` : (k === 0 ? 'oldest' : k === 1 ? 'mid' : 'newest');
      drawSliceTo(ctx, slice, H, W, x0, padY, sliceW, sliceH, tag, '255, 255, 255');
    }
  }

  // Volumetric viz — render all depth slices STACKED with a perspective
  // offset and decreasing alpha so the result reads as a 3D block rather
  // than disconnected slices. Cheap (just N * H * W rect fills, one
  // additive layer per slice) and gives the user a "this is 3D" cue
  // without needing WebGL raymarching. The trade-off is fidelity: occluded
  // back-slice voxels are still visible because we don't ray-test, but
  // for a 4-6 deep volume that's a feature (you see the whole structure
  // at once).
  function drawVolumetric(ctx, volume, cfg, w, h) {
    const D = cfg.depthSize, H = cfg.imageSize, W = cfg.imageSize;
    // Lay the stack as if viewed from upper-right: each slice shifted by
    // (offsetX, offsetY) relative to the previous, with the deepest slice
    // drawn first so it ends up behind. Front slice is bright; back is
    // dimmer to imply depth.
    const padX = 8, padY = 6;
    const offsetX = 4;            // px per slice along x (depth shift)
    const offsetY = -3;           // px per slice along y (depth shift, up-and-right cue)
    const totalShiftX = (D - 1) * offsetX;
    const totalShiftY = (D - 1) * Math.abs(offsetY);
    const sliceW = w - padX * 2 - totalShiftX;
    const sliceH = h - padY * 2 - totalShiftY - 12;  // bottom label space
    if (sliceW < 8 || sliceH < 8) {
      // Fallback if canvas is too narrow.
      ctx.fillStyle = 'rgba(154,163,187,0.55)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('viewport too small for stack', w / 2, h / 2);
      return;
    }
    // Draw deepest first so front slice ends up on top.
    for (let z = D - 1; z >= 0; z--) {
      const sx = padX + z * offsetX;
      const sy = padY + (D - 1 - z) * Math.abs(offsetY);
      // Depth alpha: front (z=D-1) bright, back (z=0) dim.
      const depthFrac = D > 1 ? z / (D - 1) : 1;
      // Slice background — faint outline so even empty slices are visible.
      ctx.fillStyle = `rgba(20, 25, 40, ${0.4 + depthFrac * 0.4})`;
      ctx.fillRect(sx, sy, sliceW, sliceH);
      // Per-voxel rendering with depth-cued alpha.
      const cellW = sliceW / W, cellH = sliceH / H;
      const off = z * H * W;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = volume[off + y * W + x];
          if (v < 1e-3) continue;
          const intensity = Math.min(1, v);
          const a = (0.25 + 0.75 * depthFrac) * intensity;
          // Color ramps from cool purple (back) to warm orange (front).
          const r = Math.round(80 + 175 * depthFrac);
          const g = Math.round(80 + 70 * depthFrac);
          const b = Math.round(180 - 130 * depthFrac);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
          ctx.fillRect(sx + x * cellW, sy + y * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
      // Outline so slice edges are legible.
      ctx.strokeStyle = `rgba(245, 183, 105, ${0.20 + depthFrac * 0.45})`;
      ctx.lineWidth = depthFrac > 0.99 ? 1.2 : 0.8;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sliceW - 1, sliceH - 1);
    }
    // Bottom label.
    ctx.fillStyle = 'rgba(245, 183, 105, 0.65)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const tag = cfg.inputMode === 'spatial'
      ? `${D} cart-x slices`
      : `${D} time slices · oldest → newest`;
    ctx.fillText(tag, w / 2, h - 4);
  }

  // Find the most-active filter's per-depth kernel slices and render them
  // side by side. Each slice is a mini grid of the kernel weights, mapped
  // through a diverging colormap (negative blue, positive orange).
  function drawFilter(ctx, params, policy, cfg, w, h) {
    const acts = policy.lastFilterActivations;
    if (!params || !acts || acts.length === 0) {
      ctx.fillStyle = 'rgba(154,163,187,0.55)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('awaiting forward pass', w / 2, h / 2);
      return;
    }
    let topF = 0, topV = -Infinity;
    for (let f = 0; f < acts.length; f++) {
      if (acts[f] > topV) { topV = acts[f]; topF = f; }
    }
    const fS = cfg.filterSize, fD = cfg.filterDepth;
    const padX = 6, padY = 4, gap = 3;
    const cellsPerRow = fD;
    const sliceW = (w - padX * 2 - (cellsPerRow - 1) * gap) / cellsPerRow;
    const sliceH = h - padY * 2 - 12;
    // Find the max abs weight in this filter for normalization.
    let maxAbs = 1e-9;
    for (let kd = 0; kd < fD; kd++) {
      const k = BF.cnn3d.extractFilterKernel(params, cfg, topF, kd);
      for (let i = 0; i < k.length; i++) {
        const a = Math.abs(k[i]);
        if (a > maxAbs) maxAbs = a;
      }
    }
    for (let kd = 0; kd < fD; kd++) {
      const kernel = BF.cnn3d.extractFilterKernel(params, cfg, topF, kd);
      const x0 = padX + kd * (sliceW + gap);
      const cellW = sliceW / fS, cellH = sliceH / fS;
      for (let y = 0; y < fS; y++) {
        for (let x = 0; x < fS; x++) {
          const v = kernel[y * fS + x] / maxAbs; // [-1, 1]
          // Diverging: blue for negative, orange for positive, dark-gray for zero.
          let r, g, b;
          if (v >= 0) {
            const t = Math.min(1, v);
            r = Math.round(40 + 215 * t);
            g = Math.round(40 + 100 * t);
            b = Math.round(50 - 30 * t);
          } else {
            const t = Math.min(1, -v);
            r = Math.round(40 - 30 * t);
            g = Math.round(40 + 80 * t);
            b = Math.round(50 + 200 * t);
          }
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x0 + x * cellW, padY + y * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, padY + 0.5, sliceW - 1, sliceH - 1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`k=${kd}`, x0 + sliceW / 2, padY + sliceH + 9);
    }
    // Top-right info: filter idx + activation magnitude.
    ctx.fillStyle = 'rgba(245, 183, 105, 0.85)';
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`filter ${topF} · act ${topV.toFixed(1)}`, w - padX, padY + 9);
  }

  BF.cnn3dInsetRenderer = { make: makeRenderer };
})(window.BF);
