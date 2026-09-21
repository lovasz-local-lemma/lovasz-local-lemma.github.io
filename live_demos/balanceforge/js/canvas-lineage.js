// BalanceForge — NEAT lineage panel.
//
// Visualizes the parent→child relationships for the most recent generation
// transition. Top row: top-K parents from the just-evaluated population, each
// rendered as a box whose height is proportional to fitness. Bottom row:
// children grouped under their parent's column, with a connecting curve and
// per-child mutation indicators (colored dots: add-conn / add-node / toggle).
//
// Children whose parent isn't in the top-K are aggregated into a "+ N more"
// summary at the right; they belong to the population but aren't worth
// drawing individually for our purposes.

(function (BF) {
  'use strict';
  const { fitCanvas } = BF.util;

  // Colors for mutation-event indicator dots. Picked to match the algo-
  // internals chart palette.
  const COL_WEIGHT = '#6aa9ff';
  const COL_ADD_CONN = '#f5b769';
  const COL_ADD_NODE = '#a481ff';
  const COL_TOGGLE = '#ff6680';
  const COL_ACT = '#4ee0c0';
  const COL_LINE = 'rgba(154, 163, 187, 0.35)';
  const COL_RESCUE_LINE = 'rgba(78, 224, 192, 0.5)';
  // Origin pill palette. Each parentless lineage origin (inject, QD,
  // transplant) renders as its own colored pill on the bottom row so
  // the user can see at a glance how diverse the gen's lineage is.
  const COL_INJECT_CLONE  = 'rgba(78, 224, 192, 0.95)';      // mint -- bestEver perturbations
  const COL_INJECT_RANDOM = 'rgba(154, 163, 187, 0.95)';     // grey -- random genomes
  const COL_QD_ARCHIVE    = 'rgba(190, 150, 240, 0.95)';     // lavender -- MAP-Elites archive
  const COL_TRANSPLANT    = 'rgba(255, 160, 80, 0.95)';      // amber -- prior-level HoF transplant

  function makeLineageRenderer(canvas) {
    return {
      draw(lineage, prevPop, opts) {
        opts = opts || {};
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);
        if (!lineage || lineage.length === 0 || !prevPop || prevPop.length === 0) {
          drawEmpty(ctx, w, h);
          ctx.restore();
          return;
        }

        // Top-K parents to render individually. K=6 keeps boxes readable on
        // typical panel widths; larger K cramps both rows.
        const K = Math.min(6, prevPop.length);
        // Layout regions.
        const padX = 10, padTop = 16, padBot = 26;
        const innerW = Math.max(40, w - padX * 2);
        const parentMaxH = 38;
        const parentY = padTop + 2;
        const childY = h - padBot - 22;
        const childH = 18;

        // Fitness range for parent box scaling.
        let mxF = -Infinity, mnF = Infinity;
        for (let i = 0; i < K; i++) {
          if (prevPop[i].fitness > mxF) mxF = prevPop[i].fitness;
          if (prevPop[i].fitness < mnF) mnF = prevPop[i].fitness;
        }
        const fSpan = Math.max(0.1, mxF - mnF);

        // Parent column centers.
        const colW = innerW / K;
        const parentCx = [];
        for (let i = 0; i < K; i++) parentCx.push(padX + colW * (i + 0.5));

        // Group children by parent. Negative parentIdx values are
        // sentinel origins (no live-population parent):
        //   -1 = best-ever inject (clone or random; further split by kind)
        //   -2 = MAP-Elites archive parent
        //   -3 = per-level HoF transplant
        // Anything not in those buckets and not in top-K just lumps
        // into outsideCount ("+N outside top"). When the
        // showExtendedTags option is off, all origin pills collapse
        // into a single "+N rescue/extra" indicator for compactness.
        const buckets = new Array(K);
        for (let i = 0; i < K; i++) buckets[i] = [];
        let injectCloneCount   = 0;
        let injectRandomCount  = 0;
        let qdArchiveCount     = 0;
        let transplantCount    = 0;
        let outsideCount       = 0;
        for (const e of lineage) {
          if (e.parentIdx === -1) {
            // inject path: distinguish clone vs random by kind tag
            // (set by selectAndMutate when emitting the lineage entry).
            if (e.kind === 'inject-random') injectRandomCount += 1;
            else                            injectCloneCount  += 1;
          } else if (e.parentIdx === -2 || e.kind === 'qd-archive') {
            qdArchiveCount += 1;
          } else if (e.parentIdx === -3 || e.kind === 'transplant') {
            transplantCount += 1;
          } else if (e.parentIdx >= 0 && e.parentIdx < K) {
            buckets[e.parentIdx].push(e);
          } else {
            outsideCount += 1;
          }
        }
        const showExtended = opts.showExtendedTags !== false;

        // Draw connection curves first so boxes draw on top.
        for (let i = 0; i < K; i++) {
          const bucket = buckets[i];
          if (bucket.length === 0) continue;
          const px = parentCx[i];
          const py = parentY + parentMaxH;
          // Spread children evenly within parent's column.
          const colSpan = Math.min(colW * 0.92, Math.max(28, bucket.length * 14));
          const childW = Math.min(16, Math.max(6, colSpan / bucket.length));
          const totalChildW = childW * bucket.length;
          const startX = px - totalChildW / 2 + childW * 0.5;
          for (let j = 0; j < bucket.length; j++) {
            const e = bucket[j];
            const cx = startX + childW * j;
            // Bezier from parent bottom to child top.
            ctx.strokeStyle = COL_LINE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.bezierCurveTo(px, py + 28, cx, childY - 28, cx, childY);
            ctx.stroke();
            // Mutation indicator dot at midpoint.
            if (e.mutEvents) {
              drawMutationDot(ctx, (px + cx) / 2, (py + childY) / 2 + 4, e.mutEvents);
            }
            // Child box.
            drawChildBox(ctx, cx, childY, childW * 0.85, childH, e);
          }
        }

        // Origin pills on the left side of the child row. Each
        // parentless-origin category renders as its own colored pill
        // showing the count + a glyph + a one-word label below. When
        // showExtendedTags is off (per-user toggle in app.js), all
        // origins collapse into a single combined pill to preserve the
        // pre-feature-C look.
        const originPills = [];
        if (showExtended) {
          if (injectCloneCount > 0)  originPills.push({ glyph: '★', count: injectCloneCount,  color: COL_INJECT_CLONE,  label: 'inject·clone' });
          if (injectRandomCount > 0) originPills.push({ glyph: '?', count: injectRandomCount, color: COL_INJECT_RANDOM, label: 'inject·rand' });
          if (qdArchiveCount > 0)    originPills.push({ glyph: 'Q', count: qdArchiveCount,    color: COL_QD_ARCHIVE,    label: 'qd·archive' });
          if (transplantCount > 0)   originPills.push({ glyph: 'T', count: transplantCount,   color: COL_TRANSPLANT,    label: 'transplant' });
        } else {
          const combined = injectCloneCount + injectRandomCount + qdArchiveCount + transplantCount;
          if (combined > 0) originPills.push({ glyph: '★', count: combined, color: COL_INJECT_CLONE, label: 'rescue' });
        }
        const pillSpacing = 36;
        for (let i = 0; i < originPills.length; i++) {
          const pill = originPills[i];
          const rx = padX + 10 + i * pillSpacing;
          const ry = childY + childH * 0.5;
          // The pill's base color drives both fill (low-alpha) and
          // stroke (full-alpha). Glyph + count drawn centered; label
          // is rendered below, smaller, lighter.
          const base = pill.color;
          // Decompose rgba(r,g,b,a) so we can derive a low-alpha fill.
          // Cheap regex parse — every constant we use is in this form.
          const m = /rgba\((\d+),\s*(\d+),\s*(\d+),/.exec(base);
          const fillAlpha = 0.18;
          const fillCol = m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${fillAlpha})` : base;
          ctx.fillStyle   = fillCol;
          ctx.strokeStyle = base;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(rx, ry, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Glyph (single character).
          ctx.fillStyle = base;
          ctx.font = '9px -apple-system, "SF Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pill.glyph, rx, ry - 1);
          // Count just below the glyph, inside the pill, smaller.
          ctx.font = '8px -apple-system, "SF Mono", monospace';
          ctx.fillText('×' + pill.count, rx, ry + 5);
          // Label under the pill.
          ctx.font = '8.5px -apple-system, "Segoe UI", sans-serif';
          const labelCol = m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, 0.65)` : base;
          ctx.fillStyle = labelCol;
          ctx.fillText(pill.label, rx, ry + 18);
        }

        // Draw parent boxes.
        for (let i = 0; i < K; i++) {
          const cx = parentCx[i];
          const f = prevPop[i].fitness;
          const norm = (f - mnF) / fSpan;
          const boxH = 12 + norm * (parentMaxH - 12);
          const boxW = Math.min(38, colW * 0.7);
          const x0 = cx - boxW / 2;
          const y0 = parentY + (parentMaxH - boxH);
          // Gradient by rank — best (i=0) brightest.
          const rankFrac = 1 - i / K;
          ctx.fillStyle = `rgba(106, 169, 255, ${0.25 + 0.45 * rankFrac})`;
          ctx.strokeStyle = `rgba(106, 169, 255, ${0.6 + 0.4 * rankFrac})`;
          ctx.lineWidth = 1;
          roundRect(ctx, x0, y0, boxW, boxH, 3);
          ctx.fill();
          ctx.stroke();
          // Rank label above.
          ctx.fillStyle = 'rgba(230, 233, 242, 0.85)';
          ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(`#${i + 1}`, cx, parentY - 3);
          // Fitness label inside box if box is tall enough.
          if (boxH >= 16) {
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
            ctx.fillText(f.toFixed(1), cx, y0 + boxH / 2 + 3);
          }
        }

        // Outside-top-K children summary on the right.
        if (outsideCount > 0) {
          const tx = w - padX - 6;
          const ty = childY + childH * 0.5;
          ctx.fillStyle = 'rgba(154, 163, 187, 0.12)';
          ctx.strokeStyle = 'rgba(154, 163, 187, 0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(tx, ty, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(154, 163, 187, 0.95)';
          ctx.font = '8.5px -apple-system, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`+${outsideCount}`, tx, ty);
          ctx.fillStyle = 'rgba(154, 163, 187, 0.55)';
          ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
          ctx.fillText('outside top', tx, ty + 18);
        }

        // Mini legend bottom-right.
        drawLegend(ctx, w, h);
        ctx.restore();
      },
    };
  }

  function drawChildBox(ctx, cx, y, w, h, entry) {
    const x0 = cx - w / 2;
    let fill, stroke;
    if (entry.mutEvents && (entry.mutEvents.addNode > 0 || entry.mutEvents.addConn > 0)) {
      // Topology-changing children stand out.
      fill = 'rgba(245, 183, 105, 0.22)';
      stroke = 'rgba(245, 183, 105, 0.7)';
    } else {
      fill = 'rgba(255, 255, 255, 0.08)';
      stroke = 'rgba(255, 255, 255, 0.30)';
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    roundRect(ctx, x0, y, w, h, 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawMutationDot(ctx, x, y, ev) {
    // Pick the most "loud" mutation kind for the indicator. Order: addNode >
    // addConn > toggle > act > weight (which is the boring default).
    let color = null;
    if (ev.addNode > 0) color = COL_ADD_NODE;
    else if (ev.addConn > 0) color = COL_ADD_CONN;
    else if (ev.toggle > 0) color = COL_TOGGLE;
    else if (ev.act > 0) color = COL_ACT;
    if (!color) return; // weight-only mutations: no indicator (would be noise)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLegend(ctx, w, h) {
    const items = [
      { color: COL_ADD_NODE, label: 'add-node' },
      { color: COL_ADD_CONN, label: 'add-conn' },
      { color: COL_TOGGLE,   label: 'toggle' },
      { color: COL_ACT,      label: 'act-mut' },
    ];
    const y = h - 8;
    let x = w - 8;
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const tw = ctx.measureText(it.label).width;
      ctx.fillStyle = 'rgba(154, 163, 187, 0.7)';
      ctx.fillText(it.label, x, y);
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(x - tw - 6, y - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      x -= tw + 18;
    }
  }

  function drawEmpty(ctx, w, h) {
    ctx.fillStyle = 'rgba(154, 163, 187, 0.5)';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('train one generation to see lineage', w / 2, h / 2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  BF.lineageRenderer = { make: makeLineageRenderer };
})(window.BF);
