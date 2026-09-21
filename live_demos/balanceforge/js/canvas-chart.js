// BalanceForge — line chart renderer for fitness history & topology growth.

(function (BF) {
  'use strict';
  const { fitCanvas, clamp } = BF.util;

  // series: [{ key, color, get(point) }, ...]
  // history: [point, ...]
  function makeChart(canvas, series, options) {
    options = options || {};
    return {
      // history: [point, ...]
      // overrideSeries (optional): use these series instead of the ones passed
      // to make(). Useful when one canvas needs to render different lines for
      // different modes (e.g. NEAT topology vs SA temperature).
      // drawOpts (optional):
      //   markerGens: [gen, ...] -- generation numbers where a vertical
      //     dashed line should be drawn (e.g. curriculum level-up boundaries).
      //     Used to make per-level fitness deltas visually obvious on the
      //     main fitness chart without needing a separate panel.
      //   overlayHistory: a SECOND history array (compare-mode trainer
      //     B) plotted as DASHED lines in the same y-range. Series and
      //     getters are shared; only the visual style differs (so the
      //     reader can tell "this dashed line is the B counterpart of
      //     that solid line").
      draw(history, overrideSeries, drawOpts) {
        const activeSeries = overrideSeries || series;
        drawOpts = drawOpts || {};
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);
        if (!history || history.length === 0) {
          drawEmpty(ctx, w, h);
          ctx.restore();
          return;
        }
        const padL = 38, padR = 12, padT = 12, padB = 22;
        const innerW = w - padL - padR;
        const innerH = h - padT - padB;
        // Compute y range across all series. Include overlayHistory's
        // values so the y axis covers both A and B comfortably.
        let minY = Infinity, maxY = -Infinity;
        const overlayHist = (drawOpts.overlayHistory && drawOpts.overlayHistory.length > 0)
          ? drawOpts.overlayHistory : null;
        for (const pt of history) {
          for (const s of activeSeries) {
            const v = s.get(pt);
            if (!isFinite(v)) continue;
            if (v < minY) minY = v;
            if (v > maxY) maxY = v;
          }
        }
        if (overlayHist) {
          for (const pt of overlayHist) {
            for (const s of activeSeries) {
              const v = s.get(pt);
              if (!isFinite(v)) continue;
              if (v < minY) minY = v;
              if (v > maxY) maxY = v;
            }
          }
        }
        if (minY === maxY) { minY -= 0.5; maxY += 0.5; }
        if (options.minY != null) minY = Math.min(minY, options.minY);
        if (options.maxY != null) maxY = Math.max(maxY, options.maxY);
        const span = maxY - minY;
        const ySpan = span === 0 ? 1 : span;

        const xAt = (i) => padL + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW);
        const yAt = (v) => padT + innerH - ((v - minY) / ySpan) * innerH;

        // grid + axis labels
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const ticks = 4;
        ctx.fillStyle = 'rgba(154,163,187,0.7)';
        ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
        for (let i = 0; i <= ticks; i++) {
          const v = minY + (ySpan * i) / ticks;
          const y = yAt(v);
          ctx.beginPath();
          ctx.moveTo(padL, y + 0.5);
          ctx.lineTo(w - padR, y + 0.5);
          ctx.stroke();
          ctx.textAlign = 'right';
          ctx.fillText(formatTick(v), padL - 4, y + 3);
        }

        // Level-up markers (curriculum). Drawn before the data lines so
        // the actual fitness curves render on top of them. We translate
        // each marker gen into the chart's x-index space by matching the
        // history point with the same gen number. Markers outside the
        // visible window are silently skipped.
        if (drawOpts.markerGens && drawOpts.markerGens.length > 0) {
          // Build a gen -> index lookup once (history is already sorted
          // by gen ascending, but searching is fine at this scale).
          const genToIdx = new Map();
          for (let i = 0; i < history.length; i++) {
            genToIdx.set(history[i].gen, i);
          }
          ctx.save();
          ctx.strokeStyle = 'rgba(140, 200, 255, 0.45)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.fillStyle = 'rgba(140, 200, 255, 0.85)';
          ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
          ctx.textAlign = 'left';
          for (const g of drawOpts.markerGens) {
            const i = genToIdx.get(g);
            if (i == null) continue;
            const x = xAt(i);
            ctx.beginPath();
            ctx.moveTo(x + 0.5, padT);
            ctx.lineTo(x + 0.5, h - padB);
            ctx.stroke();
          }
          ctx.restore();
        }
        // Series (primary trainer = A). Solid lines.
        for (const s of activeSeries) {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([]);
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < history.length; i++) {
            const v = s.get(history[i]);
            if (!isFinite(v)) continue;
            const x = xAt(i), y = yAt(v);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          // dot at last point
          const last = history[history.length - 1];
          const lastV = s.get(last);
          if (isFinite(lastV)) {
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(xAt(history.length - 1), yAt(lastV), 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Overlay history (compare-mode trainer B). Same series, same
        // y range, but plotted with DASHED strokes so the eye can
        // distinguish A from B at a glance. Each curve has its own
        // x-axis normalization (both curves span the full chart width)
        // -- compare is fundamentally about training-curve shape, not
        // wall-clock alignment, so this is the cleanest framing.
        if (overlayHist) {
          const xAtB = (i) => padL
            + (overlayHist.length === 1 ? innerW / 2
                : (i / (overlayHist.length - 1)) * innerW);
          ctx.setLineDash([5, 4]);
          for (const s of activeSeries) {
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < overlayHist.length; i++) {
              const v = s.get(overlayHist[i]);
              if (!isFinite(v)) continue;
              const x = xAtB(i), y = yAt(v);
              if (!started) { ctx.moveTo(x, y); started = true; }
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
            // Small hollow dot at B's last point so the eye can find the
            // current tip without confusing it with the primary's.
            const last = overlayHist[overlayHist.length - 1];
            const lastV = s.get(last);
            if (isFinite(lastV)) {
              ctx.beginPath();
              ctx.arc(xAtB(overlayHist.length - 1), yAt(lastV), 3, 0, Math.PI * 2);
              ctx.fillStyle = '#0e1118';
              ctx.fill();
              ctx.strokeStyle = s.color;
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
          }
          ctx.setLineDash([]);
        }

        // legend — wraps to multiple rows when entries don't fit on a single
        // line. Avoids the legend running off the right edge in dense mode-
        // specific charts (NEAT mutation events + topology = 6 lines).
        ctx.textAlign = 'left';
        const legendStartX = padL + 4;
        const legendMaxX = w - padR - 4;
        const legendLineH = 14;
        let lx = legendStartX, ly = padT + 12;
        for (const s of activeSeries) {
          const labelW = 14 + ctx.measureText(s.key).width + 14;
          // Wrap if this entry would overflow the chart width (but always
          // place at least one entry per row even if it's wider than the row).
          if (lx > legendStartX && lx + labelW > legendMaxX) {
            lx = legendStartX;
            ly += legendLineH;
          }
          ctx.fillStyle = s.color;
          ctx.fillRect(lx, ly - 7, 10, 3);
          ctx.fillStyle = 'rgba(230,233,242,0.8)';
          ctx.fillText(s.key, lx + 14, ly);
          lx += labelW;
        }

        // x-axis label = generation count
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(154,163,187,0.6)';
        ctx.fillText(`gen ${history[history.length - 1].gen}`, w - padR, h - 6);
        ctx.restore();
      },
    };
  }

  function drawEmpty(ctx, w, h) {
    ctx.fillStyle = 'rgba(154,163,187,0.5)';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('—', w / 2, h / 2);
  }

  function formatTick(v) {
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  BF.chart = { make: makeChart };
})(window.BF);
