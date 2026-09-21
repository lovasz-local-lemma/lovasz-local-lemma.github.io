// BalanceForge — population fitness bars.
// Renders one horizontal bar per individual in the last evaluated generation,
// sorted best-first. Elites are highlighted; bar color encodes node count so
// you can see topology spread alongside fitness.

(function (BF) {
  'use strict';
  const { fitCanvas, clamp } = BF.util;

  function makePopulationRenderer(canvas) {
    return {
      draw(snapshot, opts) {
        opts = opts || {};
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);
        if (!snapshot || snapshot.length === 0) {
          drawEmpty(ctx, w, h);
          ctx.restore();
          return;
        }
        const sorted = snapshot;
        const n = sorted.length;
        const padL = 28, padR = 76, padT = 8, padB = 8;
        const innerW = Math.max(20, w - padL - padR);
        const innerH = Math.max(20, h - padT - padB);

        let bestFit = -Infinity, worstFit = Infinity;
        let bestNodes = 0, worstNodes = Infinity;
        for (const s of sorted) {
          if (s.fitness > bestFit) bestFit = s.fitness;
          if (s.fitness < worstFit) worstFit = s.fitness;
          if (s.nodes > bestNodes) bestNodes = s.nodes;
          if (s.nodes < worstNodes) worstNodes = s.nodes;
        }
        const fitSpan = Math.max(1e-3, bestFit - Math.min(0, worstFit));
        // Anchor zero so negative bars grow leftward from the zero line.
        const zeroX = padL + (Math.min(0, worstFit) < 0
          ? (-Math.min(0, worstFit) / fitSpan) * innerW
          : 0);

        // Zero line marker
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(zeroX + 0.5, padT);
        ctx.lineTo(zeroX + 0.5, padT + innerH);
        ctx.stroke();

        const barH = innerH / n;
        const drawLabels = barH > 9;

        for (let i = 0; i < n; i++) {
          const s = sorted[i];
          const y = padT + i * barH;
          const fitNorm = s.fitness / fitSpan; // can be negative
          const barW = fitNorm * innerW;
          const fillColor = colorFor(s, bestNodes, worstNodes);
          ctx.fillStyle = fillColor;
          if (barW >= 0) {
            ctx.fillRect(zeroX, y, barW, Math.max(1, barH - 0.6));
          } else {
            ctx.fillRect(zeroX + barW, y, -barW, Math.max(1, barH - 0.6));
          }
          // Outline meaning depends on mode:
          //  NEAT       — green outline = elite (kept unmutated next gen)
          //  SA/PT      — green outline = move accepted, red = rejected
          //  CMA-ES     — no outline (no per-individual classification)
          //  Grey Wolf  — gold/silver/bronze outline = α/β/δ leaders
          let outline = null;
          let outlineWidth = 1;
          if (s.elite) outline = '#6ce28a';
          else if (s.saAccepted === true) outline = '#6ce28a';
          else if (s.saAccepted === false) outline = '#ff6680';
          else if (s.swarmRank === 'alpha')  { outline = '#ffd24a'; outlineWidth = 2; }
          else if (s.swarmRank === 'beta')   { outline = '#cfd2da'; outlineWidth = 2; }
          else if (s.swarmRank === 'delta')  { outline = '#cd7f32'; outlineWidth = 2; }
          if (outline) {
            ctx.strokeStyle = outline;
            ctx.lineWidth = outlineWidth;
            ctx.strokeRect(zeroX + Math.min(0, barW) + 0.5, y + 0.5,
                           Math.abs(barW) - 1, Math.max(1, barH - 1.6));
          }
          // Per-individual behavior letter (fish/whale) — single-character tag
          // at the right edge of the bar so you can see the action mix at a glance.
          let tag = null, tagColor = '#9aa3bb';
          if (s.fishBehavior === 'prey')   { tag = 'P'; tagColor = '#6aa9ff'; }
          else if (s.fishBehavior === 'swarm')  { tag = 'S'; tagColor = '#4ee0c0'; }
          else if (s.fishBehavior === 'follow') { tag = 'F'; tagColor = '#a481ff'; }
          else if (s.fishBehavior === 'random') { tag = 'R'; tagColor = '#ff6680'; }
          else if (s.whaleAction === 'spiral')   { tag = '◌'; tagColor = '#a481ff'; }
          else if (s.whaleAction === 'encircle') { tag = '○'; tagColor = '#4ee0c0'; }
          else if (s.whaleAction === 'explore')  { tag = '✕'; tagColor = '#ff6680'; }
          if (tag && barH > 8) {
            ctx.fillStyle = tagColor;
            ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(tag, zeroX + Math.max(barW, 0) + 3, y + barH * 0.7);
          }
          if (drawLabels && i % Math.max(1, Math.round(20 / barH)) === 0) {
            ctx.fillStyle = 'rgba(154,163,187,0.55)';
            ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('#' + (i + 1), padL - 4, y + barH * 0.7);
          }
        }

        // Right-side stats column
        ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        const sx = padL + innerW + 8;
        const sumF = sorted.reduce((s, p) => s + p.fitness, 0);
        const avg = sumF / n;
        const elites = sorted.filter(s => s.elite).length;
        const lines = [
          { k: 'best',  v: bestFit.toFixed(2),  c: '#6ce28a' },
          { k: 'avg',   v: avg.toFixed(2),      c: '#6aa9ff' },
          { k: 'worst', v: worstFit.toFixed(2), c: '#ff6680' },
          { k: 'elite', v: String(elites),      c: '#4ee0c0' },
          { k: 'n',     v: String(n),           c: '#9aa3bb' },
        ];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const yy = padT + 10 + i * 12;
          ctx.fillStyle = line.c;
          ctx.fillText(line.k, sx, yy);
          ctx.fillStyle = '#e6e9f2';
          ctx.fillText(line.v, sx + 30, yy);
        }

        ctx.restore();
      },
    };
  }

  function colorFor(s, bestNodes, worstNodes) {
    // Hue from blue (smaller graph) → magenta (larger graph)
    const span = Math.max(1, bestNodes - worstNodes);
    const t = clamp((s.nodes - worstNodes) / span, 0, 1);
    // 210° = blue, 320° = magenta
    const hue = 210 + (320 - 210) * t;
    const sat = s.elite ? 80 : 60;
    const lit = s.elite ? 60 : 52;
    return `hsl(${hue.toFixed(0)} ${sat}% ${lit}%)`;
  }

  function drawEmpty(ctx, w, h) {
    ctx.fillStyle = 'rgba(154,163,187,0.5)';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('train one generation to populate', w / 2, h / 2);
  }

  BF.popRenderer = { make: makePopulationRenderer };
})(window.BF);
