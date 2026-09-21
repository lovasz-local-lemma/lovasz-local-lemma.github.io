// BalanceForge — line-search visualization for FD-GD / SPSA.
//
// Each generation, gradient-descent algorithms probe several α (step size)
// candidates along the gradient direction. This panel shows what they tried:
//
//   - X-axis: α value (log-spaced bars, smallest left → largest right).
//   - Bar height: fitness achieved at that α.
//   - Horizontal line at f(μ) (the anchor): bars above improved on the
//     anchor, bars below got worse.
//   - Green outline on the bar that was actually accepted (the best
//     improver), red outline on rejections.
//
// Watching this over time tells you whether α is sized right: if every gen
// accepts the LARGEST α, your steps are too small (algorithm grows α next
// gen). If every gen rejects every probe, you're at a plateau / past optimum
// (algorithm shrinks α).

(function (BF) {
  'use strict';
  const { fitCanvas } = BF.util;

  function makeLineSearchRenderer(canvas) {
    return {
      draw(probes, anchorFitness, opts) {
        opts = opts || {};
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);

        if (!probes || probes.length === 0 || anchorFitness == null) {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('no line-search data — first gen probes only',
            w / 2, h / 2);
          ctx.restore();
          return;
        }

        const padL = 32, padR = 12, padT = 14, padB = 28;
        const innerW = Math.max(20, w - padL - padR);
        const innerH = Math.max(20, h - padT - padB);

        // y-range covers anchor + all probes with a tiny margin.
        let minF = anchorFitness, maxF = anchorFitness;
        for (const p of probes) {
          if (p.fitness < minF) minF = p.fitness;
          if (p.fitness > maxF) maxF = p.fitness;
        }
        const span = Math.max(1e-3, maxF - minF);
        const yPad = span * 0.08;
        const y0 = minF - yPad, y1 = maxF + yPad;
        const yRange = y1 - y0;

        const fy = (f) => padT + innerH * (1 - (f - y0) / yRange);

        // Anchor line.
        const ay = fy(anchorFitness);
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, ay + 0.5);
        ctx.lineTo(padL + innerW, ay + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('f(μ)', padL - 4, ay);

        // Bars — sorted left-to-right by α (smallest first).
        const sorted = probes.slice().sort((a, b) => a.alpha - b.alpha);
        const slot = innerW / sorted.length;
        const barW = Math.min(slot * 0.7, 36);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let i = 0; i < sorted.length; i++) {
          const p = sorted[i];
          const cx = padL + slot * (i + 0.5);
          const yProbe = fy(p.fitness);
          const better = p.fitness >= anchorFitness;
          // Fill: muted gray-blue for rejections, bright green-cyan for the accepted one,
          // medium green for "improved but not chosen" (which can happen if you only accept the largest).
          let fill;
          if (p.accepted) fill = 'rgba(108,226,138,0.85)';
          else if (better) fill = 'rgba(108,226,138,0.32)';
          else fill = 'rgba(255,102,128,0.32)';
          ctx.fillStyle = fill;
          const top = Math.min(ay, yProbe);
          const heightPx = Math.max(1, Math.abs(yProbe - ay));
          ctx.fillRect(cx - barW / 2, top, barW, heightPx);

          // Outline accepted bar.
          if (p.accepted) {
            ctx.strokeStyle = '#6ce28a';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - barW / 2 + 0.5, top + 0.5,
                           barW - 1, heightPx - 1);
          } else if (!better) {
            ctx.strokeStyle = 'rgba(255,102,128,0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - barW / 2 + 0.5, top + 0.5,
                           barW - 1, heightPx - 1);
          }

          // α label below bar.
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillText(formatAlpha(p.alpha), cx, padT + innerH + 4);
        }

        // Y-axis fitness span labels.
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(y1.toFixed(2), padL - 4, padT);
        ctx.fillText(y0.toFixed(2), padL - 4, padT + innerH);

        ctx.restore();
      },
    };
  }

  function formatAlpha(a) {
    if (a >= 0.1) return a.toFixed(2);
    if (a >= 0.01) return a.toFixed(3);
    return a.toExponential(1);
  }

  BF.lineSearchRenderer = { make: makeLineSearchRenderer };
})(window.BF);
