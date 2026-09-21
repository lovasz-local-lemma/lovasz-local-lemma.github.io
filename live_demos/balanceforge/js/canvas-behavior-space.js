// BalanceForge -- behavior-space heatmap renderer.
//
// Reads trainer.behaviorArchive (a Map of bin -> {bestFitness, count, lastSeen})
// and trainer.lastSetupBehaviors (this gen's per-individual behaviors)
// and paints a NxN grid where:
//   - cell color encodes best-fitness-in-bin (low to high)
//   - cell alpha reflects visit count (more visits = more confident)
//   - the brightest cell = best-ever bin (outlined)
//   - current-generation individuals overlay as small dots
//
// Updated each render frame from app's main draw loop. Cheap: at 16x16
// the heatmap is 256 cells and we redraw all of them every frame.

(function (BF) {
  'use strict';

  function fitnessToColor(t) {
    // viridis-ish: dark purple -> teal -> yellow. Pre-baked stops; lerp.
    // Easier than computing the real viridis curve and good enough for
    // a small heatmap.
    const stops = [
      [ 68,  1, 84],   // 0
      [ 59, 82,139],
      [ 33,144,141],
      [ 94,201, 98],
      [253,231, 37],   // 1
    ];
    const x = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = stops[i], b = stops[i + 1] || a;
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ];
  }

  function make(canvas) {
    const ctx = canvas.getContext('2d');
    let dpr = window.devicePixelRatio || 1;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, r.width | 0);
      const h = Math.max(1, r.height | 0);
      const cssDpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * cssDpr || canvas.height !== h * cssDpr) {
        canvas.width  = w * cssDpr;
        canvas.height = h * cssDpr;
        dpr = cssDpr;
      }
    }

    function clear() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.fillStyle = '#0d0f15';
      ctx.fillRect(0, 0, w * dpr, h * dpr);
    }

    function placeholder(text) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0d0f15';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9aa3bb';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2);
      ctx.restore();
    }

    function draw(state) {
      resize();
      const archive = state && state.archive;
      const setupId = state && state.setupId;
      if (!archive || !archive.xKey || !archive.yKey || archive.cells.size === 0) {
        placeholder(state && state.empty
          ? state.empty
          : 'No exploration data yet — start training');
        return;
      }
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const padL = 36, padR = 12, padT = 12, padB = 26;
      const gridW = Math.max(20, w - padL - padR);
      const gridH = Math.max(20, h - padT - padB);
      const bins = archive.bins;
      const cw = gridW / bins;
      const chh = gridH / bins;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0d0f15';
      ctx.fillRect(0, 0, w, h);

      // Compute fit min/max from cells for color scale.
      let fitMin = Infinity, fitMax = -Infinity, maxCount = 0;
      for (const cell of archive.cells.values()) {
        if (cell.bestFitness < fitMin) fitMin = cell.bestFitness;
        if (cell.bestFitness > fitMax) fitMax = cell.bestFitness;
        if (cell.count > maxCount) maxCount = cell.count;
      }
      if (!isFinite(fitMin) || fitMin === fitMax) {
        fitMin = fitMax - 1;  // collapse to single-color but still draw cells
      }
      const fitSpan = Math.max(1e-6, fitMax - fitMin);

      // Grid background — faint outline of the full bin space so empty
      // regions read as "explicitly unexplored" rather than "screen edge".
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(padL, padT, gridW, gridH);

      // Cells.
      for (const cell of archive.cells.values()) {
        const t = (cell.bestFitness - fitMin) / fitSpan;
        const [r, g, b] = fitnessToColor(t);
        // Visit-count alpha: 1 visit = 0.45, ramps to 0.95 at maxCount.
        const visitAlpha = 0.45 + 0.5 * Math.min(1, cell.count / Math.max(1, maxCount));
        ctx.fillStyle = `rgba(${r},${g},${b},${visitAlpha.toFixed(3)})`;
        const x = padL + cell.xb * cw;
        // Y-axis flips so high values draw at the TOP (standard chart convention).
        const y = padT + (bins - 1 - cell.yb) * chh;
        ctx.fillRect(x, y, cw + 0.5, chh + 0.5);
      }

      // Outline best-ever bin so the "winner" is visible at a glance.
      if (archive.bestEverBin >= 0) {
        const bx = Math.floor(archive.bestEverBin / bins);
        const by = archive.bestEverBin % bins;
        const x = padL + bx * cw;
        const y = padT + (bins - 1 - by) * chh;
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
      }

      // Current-generation scatter overlay. Each dot reads the live
      // descriptor pair off lastSetupBehaviors and gets normalized via
      // the same range the archive uses, so dot positions exactly
      // match the cells they fall in. Untrained gens cluster — that's
      // expected and useful information.
      //
      // Pareto-rank coloring: when state.showParetoOverlay is on AND
      // the population entry at individualIndex has a paretoRank, color
      // the dot by rank (rank 1 = bright mint, rank N>1 fades to grey).
      // This visualizes which behavior regions sit on the Pareto front
      // -- exactly the question "is novelty actually preserving
      // diverse strategies?" Falls back to the white default when rank
      // data isn't available (Pareto off, very first gen, etc).
      const paretoActive = state.showParetoOverlay && state.population;
      let maxRank = 1;
      if (paretoActive) {
        for (const ind of state.population) {
          if (ind && ind.paretoRank && ind.paretoRank > maxRank) maxRank = ind.paretoRank;
        }
      }
      if (state.currentBehaviors && state.currentBehaviors.length && BF.behaviors) {
        for (const b of state.currentBehaviors) {
          const xv = b.values[archive.xKey];
          const yv = b.values[archive.yKey];
          if (xv == null || yv == null) continue;
          const xn = BF.behaviors.normalize(setupId, archive.xKey, xv);
          const yn = BF.behaviors.normalize(setupId, archive.yKey, yv);
          const px = padL + xn * gridW;
          const py = padT + (1 - yn) * gridH;
          // Resolve color + size. Pareto rank 1 is the visually loudest
          // (bright mint, slightly larger) so the front pops at a
          // glance. Higher ranks fade toward grey and shrink.
          let color = 'rgba(255, 255, 255, 0.85)';
          let radius = 2.2;
          if (paretoActive && b.individualIndex != null) {
            const ind = state.population[b.individualIndex];
            const rank = ind && ind.paretoRank ? ind.paretoRank : null;
            if (rank === 1) {
              color = 'rgba(78, 224, 192, 0.95)'; // mint -- Pareto front
              radius = 3.0;
            } else if (rank && maxRank > 1) {
              // Fade from a soft cyan (rank 2) to dim grey (deepest rank).
              const t = Math.min(1, (rank - 1) / Math.max(1, maxRank - 1));
              const r = Math.round(154 + (78 - 154) * (1 - t));   // 78 -> 154
              const g = Math.round(163 + (224 - 163) * (1 - t));  // 224 -> 163
              const b2 = Math.round(187 + (192 - 187) * (1 - t)); // 192 -> 187
              const a = 0.85 - t * 0.45;                          // 0.85 -> 0.40
              color = `rgba(${r}, ${g}, ${b2}, ${a.toFixed(2)})`;
              radius = 2.2 - t * 0.6;
            }
          }
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        // Pareto legend in the top-right corner when the overlay is on.
        if (paretoActive) {
          ctx.save();
          ctx.font = '9px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(78, 224, 192, 0.95)';
          ctx.beginPath();
          ctx.arc(w - padR - 56, padT + 4, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText('rank 1', w - padR - 4, padT + 1);
          ctx.fillStyle = 'rgba(154, 163, 187, 0.6)';
          ctx.beginPath();
          ctx.arc(w - padR - 56, padT + 16, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText('rank ≥2', w - padR - 4, padT + 13);
          ctx.restore();
        }
      }

      // Axes labels. We draw the descriptor labels inside the padding strips
      // and a small color-scale legend along the bottom-right.
      ctx.fillStyle = '#9aa3bb';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const xLabel = (state.xLabel || archive.xKey) + ` [${formatNum(state.xRange[0])}, ${formatNum(state.xRange[1])}]`;
      ctx.fillText(xLabel, padL, h - 14);
      // Y label — rotate 90° so it reads vertically along the left.
      ctx.save();
      ctx.translate(10, padT + gridH);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText((state.yLabel || archive.yKey) + ` [${formatNum(state.yRange[0])}, ${formatNum(state.yRange[1])}]`, 0, 0);
      ctx.restore();

      // Bottom-right legend strip — tiny gradient + min/max fitness labels
      // so the user can read color -> fitness without tooltips.
      const legW = 70, legH = 6;
      const legX = w - padR - legW, legY = h - 6;
      const grad = ctx.createLinearGradient(legX, 0, legX + legW, 0);
      const lo = fitnessToColor(0), hi = fitnessToColor(1);
      grad.addColorStop(0, `rgb(${lo[0]},${lo[1]},${lo[2]})`);
      grad.addColorStop(1, `rgb(${hi[0]},${hi[1]},${hi[2]})`);
      ctx.fillStyle = grad;
      ctx.fillRect(legX, legY - legH, legW, legH);
      ctx.fillStyle = '#9aa3bb';
      ctx.textAlign = 'right';
      ctx.fillText(formatNum(fitMin), legX - 4, legY - legH + 1);
      ctx.textAlign = 'left';
      ctx.fillText(formatNum(fitMax), legX + legW + 4, legY - legH + 1);

      ctx.restore();
    }

    function formatNum(v) {
      if (!isFinite(v)) return String(v);
      const a = Math.abs(v);
      if (a >= 1000) return v.toFixed(0);
      if (a >= 10)   return v.toFixed(1);
      if (a >= 0.1)  return v.toFixed(2);
      return v.toFixed(3);
    }

    return { draw, clear };
  }

  BF.behaviorRenderer = { make };
})(window.BF);
