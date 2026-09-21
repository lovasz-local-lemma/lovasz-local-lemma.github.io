// BalanceForge — genome-space scatter renderer.
// Projects the current evaluated population to 2D via PCA on per-genome
// connection-weight vectors (innovation-id indexed) and draws each individual
// as a dot colored by fitness. The best-ever genome (if available) is pinned
// as a marker so the user can see where the run "lives" in genome space.

(function (BF) {
  'use strict';
  const { fitCanvas, lerpColor, rgba, clamp } = BF.util;

  const COL_LOW = [255, 102, 128];   // bad fitness — pink/red
  const COL_MID = [240, 220, 110];   // mid — yellow
  const COL_HIGH = [108, 226, 138];  // best — green

  function makeGenomeSpaceRenderer(canvas) {
    // Cache the PCA projection per-generation. PCA is the most expensive thing
    // we draw — running it every frame is what was making the UI feel laggy.
    // Keying by generation means we only recompute when something has changed.
    let cache = null;
    // Per-chain trails for SA / PT modes (and short-history trails for swarm
    // modes that benefit from a movement record, e.g. Cuckoo's Lévy flights).
    // We store the original *params* vectors (cloned, since the snapshot's
    // reference may be reused), then reproject through the *current* PCA
    // basis each draw. Trails remain visually coherent even though PCA
    // recomputes per generation.
    //   chainTrails[chainIdx] = [Float64Array(params), ..., Float64Array(params)]
    let chainTrails = null;
    let chainTrailsKey = null;
    let lastSeenGen = -1;
    // Random-projection basis cached per "session" (rebuilt when the user
    // re-rolls). Stored alongside the per-gen cache so we can swap modes
    // without recomputing PCA from scratch.
    let randomBasisSeed = 1;
    let randomBasisCache = null;  // { dim, components: [Float64Array, Float64Array], mean: Float64Array }
    // Draw 1σ + 2σ ellipses computed from the empirical 2D covariance of
    // the projected population. For CMA-ES this is a faithful visualization
    // of the search distribution's shape in PCA space (the algorithm IS
    // sampling from a Gaussian, so the empirical covariance approximates
    // C·σ² projected onto PC1/PC2).
    function drawCovarianceEllipses(ctx, projected, n, X, Y) {
      let mx = 0, my = 0;
      for (let i = 0; i < n; i++) {
        mx += projected[i * 2];
        my += projected[i * 2 + 1];
      }
      mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < n; i++) {
        const dx = projected[i * 2] - mx;
        const dy = projected[i * 2 + 1] - my;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      }
      sxx /= (n - 1); syy /= (n - 1); sxy /= (n - 1);
      // Eigendecomposition of 2×2 symmetric covariance.
      const tr = sxx + syy;
      const det = sxx * syy - sxy * sxy;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const lambda1 = tr / 2 + disc;
      const lambda2 = tr / 2 - disc;
      // Eigenvector for lambda1 (handles sxy==0 gracefully).
      let theta;
      if (Math.abs(sxy) < 1e-12) {
        theta = sxx >= syy ? 0 : Math.PI / 2;
      } else {
        theta = Math.atan2(lambda1 - sxx, sxy);
      }
      // We need axis lengths in CANVAS pixels, not data units. Convert by
      // sampling X(0)/X(1) for x-axis scale and Y(0)/Y(1) for y-axis scale.
      // Both X and Y are linear, so unit-distance = |X(1)-X(0)| in pixels.
      const xPxPerUnit = Math.abs(X(1) - X(0));
      const yPxPerUnit = Math.abs(Y(1) - Y(0));
      // Eigenvector axes in DATA space:
      //   v1 = (cos θ, sin θ),  v2 = (−sin θ, cos θ)
      // axis length on v1 in data units = sqrt(lambda1)
      // We approximate the ellipse-in-pixel-space by treating the major and
      // minor radii as projected separately along the canvas axes — this is
      // exact when X and Y have equal scale per unit; close enough otherwise
      // for our visualization purposes (the chart auto-scales each axis).
      const r1 = Math.sqrt(Math.max(0, lambda1));
      const r2 = Math.sqrt(Math.max(0, lambda2));
      const cx = X(mx);
      const cy = Y(my);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-theta); // canvas Y is flipped vs. data Y
      // 2σ ellipse (faint).
      ctx.strokeStyle = 'rgba(164, 129, 255, 0.30)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r1 * xPxPerUnit * 2, r2 * yPxPerUnit * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 1σ ellipse.
      ctx.strokeStyle = 'rgba(164, 129, 255, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r1 * xPxPerUnit, r2 * yPxPerUnit, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Mean marker.
      ctx.fillStyle = 'rgba(164, 129, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Append the current population's params to the per-chain trail buffers.
    // Crucially we ONLY append on a real generation change — render runs at
    // 60Hz, but the trainer steps at maybe 1-10 gens/sec, so we'd otherwise
    // pile thousands of duplicate points within a single gen.
    function updateChainTrails(gen, population, n, mode) {
      const key = mode + ':' + n;
      if (chainTrailsKey !== key) {
        chainTrails = new Array(n);
        for (let i = 0; i < n; i++) chainTrails[i] = [];
        chainTrailsKey = key;
        lastSeenGen = -1;
      }
      if (gen === lastSeenGen) return;
      lastSeenGen = gen;
      const TRAIL_MAX = 40;
      for (let i = 0; i < n; i++) {
        const ind = population[i];
        if (!ind || !ind.params) continue;
        // Clone — we don't want trail entries to mutate when the trainer
        // overwrites params in the next gen.
        chainTrails[i].push(new Float64Array(ind.params));
        if (chainTrails[i].length > TRAIL_MAX) {
          chainTrails[i].shift();
        }
      }
    }

    // Reproject every stored params through the current PCA basis and draw
    // each chain as a polyline with a per-chain color and a leading-edge
    // gradient (oldest segments faint, newest bright). Only meaningful for
    // fixed-topology modes where buildFeatureMatrix used `byParams: true`,
    // because chainTrails stores raw params arrays that align with PC1/PC2.
    function drawChainTrails(ctx, X, Y, mode, n) {
      if (!chainTrails || !cache || !cache.byParams) return;
      const mean = cache.mean;
      const pc1 = cache.components[0];
      const pc2 = cache.components[1];
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let ci = 0; ci < n; ci++) {
        const trail = chainTrails[ci];
        if (!trail || trail.length < 2) continue;
        // Project each historical params vector into the current basis.
        const xs = new Array(trail.length);
        const ys = new Array(trail.length);
        for (let t = 0; t < trail.length; t++) {
          const params = trail[t];
          let p1 = 0, p2 = 0;
          for (let j = 0; j < params.length; j++) {
            const v = params[j] - mean[j];
            p1 += v * pc1[j];
            p2 += v * pc2[j];
          }
          xs[t] = X(p1);
          ys[t] = Y(p2);
        }
        // PT uses the chain's TEMPERATURE rank for color (cold blue, hot
        // orange). SA uses a teal band varied per chain so adjacent chains
        // are still distinguishable.
        const hue = mode === 'pt'
          ? 220 - (200 * (ci / Math.max(1, n - 1)))
          : 170 + (60 * (ci / Math.max(1, n - 1)));
        // Draw segment-by-segment with growing alpha + thickness so the
        // recent end is bright and the leading edge fades out. Cheap enough
        // (≤ 40 segments × n chains per frame).
        for (let t = 1; t < trail.length; t++) {
          const tFrac = t / (trail.length - 1);
          const alpha = 0.18 + 0.65 * tFrac;
          const lw = 1.0 + 1.4 * tFrac;
          ctx.strokeStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(xs[t - 1], ys[t - 1]);
          ctx.lineTo(xs[t], ys[t]);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // DE: draw a faint arrow from each individual's targetParams (its current
    // accepted state) → params (this gen's trial). Shows where DE is *trying*
    // to move each individual. Trial vectors arranged as a "wind field" hint
    // at where the algorithm thinks the optimum is.
    function drawDEArrows(ctx, population, X, Y) {
      if (!cache || !cache.byParams) return;
      const mean = cache.mean;
      const pc1 = cache.components[0];
      const pc2 = cache.components[1];
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 183, 105, 0.35)';
      ctx.fillStyle = 'rgba(245, 183, 105, 0.55)';
      ctx.lineWidth = 1;
      for (const ind of population) {
        if (!ind.params || !ind.targetParams) continue;
        let tx = 0, ty = 0, px = 0, py = 0;
        for (let j = 0; j < ind.params.length; j++) {
          const m = mean[j];
          tx += (ind.targetParams[j] - m) * pc1[j];
          ty += (ind.targetParams[j] - m) * pc2[j];
          px += (ind.params[j] - m) * pc1[j];
          py += (ind.params[j] - m) * pc2[j];
        }
        const x0 = X(tx), y0 = Y(ty), x1 = X(px), y1 = Y(py);
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 1.5) continue;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        // Tiny arrowhead.
        const ang = Math.atan2(dy, dx);
        const ah = Math.min(5, len * 0.35);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - ah * Math.cos(ang - 0.5), y1 - ah * Math.sin(ang - 0.5));
        ctx.lineTo(x1 - ah * Math.cos(ang + 0.5), y1 - ah * Math.sin(ang + 0.5));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // PSO: each particle has a velocity vector. Project params and (params +
    // velocity) into PCA space, draw arrows showing where the swarm is
    // flowing. Particles that have converged on gBest will have short or
    // zero arrows; explorers point outward.
    function drawPSOArrows(ctx, population, X, Y) {
      if (!cache || !cache.byParams) return;
      const mean = cache.mean;
      const pc1 = cache.components[0];
      const pc2 = cache.components[1];
      ctx.save();
      ctx.strokeStyle = 'rgba(78, 224, 192, 0.55)';
      ctx.fillStyle = 'rgba(78, 224, 192, 0.75)';
      ctx.lineWidth = 1.1;
      for (const ind of population) {
        if (!ind.params || !ind.velocity) continue;
        let px = 0, py = 0, nx = 0, ny = 0;
        for (let j = 0; j < ind.params.length; j++) {
          const m = mean[j];
          px += (ind.params[j] - m) * pc1[j];
          py += (ind.params[j] - m) * pc2[j];
          // Next-step position: x + v.
          const next = ind.params[j] + ind.velocity[j];
          nx += (next - m) * pc1[j];
          ny += (next - m) * pc2[j];
        }
        const x0 = X(px), y0 = Y(py), x1 = X(nx), y1 = Y(ny);
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 1.5) continue;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const ang = Math.atan2(dy, dx);
        const ah = Math.min(5, len * 0.35);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - ah * Math.cos(ang - 0.5), y1 - ah * Math.sin(ang - 0.5));
        ctx.lineTo(x1 - ah * Math.cos(ang + 0.5), y1 - ah * Math.sin(ang + 0.5));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // KDE-style density heatmap painted UNDER the scatter dots. Each
    // individual contributes a 2D Gaussian kernel centered on its projected
    // position; the canvas pixel intensity at (x, y) is the sum across
    // individuals. Tells you at-a-glance whether the swarm has formed a
    // single tight blob (converged) or split into multiple clusters
    // (fish/firefly often do this).
    function drawDensityHeatmap(ctx, projected, n, X, Y, padL, padT, innerW, innerH) {
      if (n < 4) return;
      // Low-res grid for speed (we're at 60Hz). 48×32 keeps each cell ~3-4px.
      const GW = 48, GH = 32;
      // Bandwidth in pixel space — ≈ √(area/n) gives a sane default that
      // grows when the swarm is sparse and shrinks when it's tight.
      const bw = Math.max(8, Math.sqrt((innerW * innerH) / Math.max(4, n)) * 0.55);
      const bw2 = bw * bw;
      const cellW = innerW / GW, cellH = innerH / GH;
      const grid = new Float32Array(GW * GH);
      let maxD = 0;
      // Project each individual to canvas pixels once, then KDE.
      const px = new Float32Array(n), py = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        px[i] = X(projected[i * 2]);
        py[i] = Y(projected[i * 2 + 1]);
      }
      for (let gx = 0; gx < GW; gx++) {
        for (let gy = 0; gy < GH; gy++) {
          const cx = padL + (gx + 0.5) * cellW;
          const cy = padT + (gy + 0.5) * cellH;
          let sum = 0;
          for (let i = 0; i < n; i++) {
            const dx = cx - px[i], dy = cy - py[i];
            const d2 = dx * dx + dy * dy;
            // Truncate at 3·bw to keep the inner loop tight.
            if (d2 < 9 * bw2) sum += Math.exp(-d2 / (2 * bw2));
          }
          grid[gx * GH + gy] = sum;
          if (sum > maxD) maxD = sum;
        }
      }
      if (maxD < 1e-6) return;
      // Render — warm orange for high density, transparent for empty.
      for (let gx = 0; gx < GW; gx++) {
        for (let gy = 0; gy < GH; gy++) {
          const v = grid[gx * GH + gy] / maxD;
          if (v < 0.04) continue;
          const a = Math.min(0.45, v * 0.6);
          // Color ramps from cool (low) → warm (high) to add depth.
          const r = Math.round(80 + 175 * v);
          const g = Math.round(100 + 80 * v);
          const b = Math.round(180 - 100 * v);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
          ctx.fillRect(padL + gx * cellW, padT + gy * cellH,
                       cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Generic 1σ + 2σ spread ellipse — same math as drawCovarianceEllipses
    // above but exposed for any mode (not just CMA-ES). Color subtly
    // different so the two ellipse renders don't visually conflict if
    // both fire (they don't — only one is active per draw).
    function drawSpreadEllipse(ctx, projected, n, X, Y) {
      if (n < 4) return;
      let mx = 0, my = 0;
      for (let i = 0; i < n; i++) {
        mx += projected[i * 2];
        my += projected[i * 2 + 1];
      }
      mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < n; i++) {
        const dx = projected[i * 2] - mx;
        const dy = projected[i * 2 + 1] - my;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      }
      sxx /= (n - 1); syy /= (n - 1); sxy /= (n - 1);
      const tr = sxx + syy;
      const det = sxx * syy - sxy * sxy;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const lambda1 = tr / 2 + disc;
      const lambda2 = tr / 2 - disc;
      const theta = Math.abs(sxy) < 1e-12
        ? (sxx >= syy ? 0 : Math.PI / 2)
        : Math.atan2(lambda1 - sxx, sxy);
      const xPxPerUnit = Math.abs(X(1) - X(0));
      const yPxPerUnit = Math.abs(Y(1) - Y(0));
      const r1 = Math.sqrt(Math.max(0, lambda1));
      const r2 = Math.sqrt(Math.max(0, lambda2));
      const cx = X(mx), cy = Y(my);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-theta);
      ctx.strokeStyle = 'rgba(108, 226, 138, 0.18)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.ellipse(0, 0, r1 * xPxPerUnit * 2, r2 * yPxPerUnit * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(108, 226, 138, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r1 * xPxPerUnit, r2 * yPxPerUnit, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Cuckoo Lévy trails — for each cuckoo, draw a line from its previous-gen
    // position to current. Emphasis on length: long jumps render bright and
    // thick, short jumps almost invisible. The visual signature of Lévy
    // flights is the punctuated-equilibrium pattern (mostly small steps,
    // occasional dramatic ones).
    function drawCuckooTrails(ctx, X, Y, n, mean, pc1, pc2) {
      if (!chainTrails) return;
      ctx.save();
      ctx.lineCap = 'round';
      // Two-pass: compute lengths first to find the max so we can normalize
      // visual emphasis to it.
      let maxLen = 0;
      const segs = [];
      for (let i = 0; i < n; i++) {
        const trail = chainTrails[i];
        if (!trail || trail.length < 2) continue;
        const a = trail[trail.length - 2];
        const b = trail[trail.length - 1];
        let ax = 0, ay = 0, bx = 0, by = 0;
        for (let j = 0; j < a.length; j++) {
          const va = a[j] - mean[j], vb = b[j] - mean[j];
          ax += va * pc1[j]; ay += va * pc2[j];
          bx += vb * pc1[j]; by += vb * pc2[j];
        }
        const x0 = X(ax), y0 = Y(ay), x1 = X(bx), y1 = Y(by);
        const len = Math.hypot(x1 - x0, y1 - y0);
        segs.push({ x0, y0, x1, y1, len });
        if (len > maxLen) maxLen = len;
      }
      if (maxLen < 2) { ctx.restore(); return; }
      for (const s of segs) {
        const norm = s.len / maxLen;            // [0, 1]
        const alpha = 0.10 + 0.80 * norm;
        const lw = 0.8 + 2.4 * norm;
        // Hot pink for long jumps, blue for short.
        const r = Math.round(120 + 135 * norm);
        const g = Math.round(110 - 60 * norm);
        const b = Math.round(220 - 40 * norm);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Firefly attraction — each firefly draws thin lines to its top-3
    // brighter neighbors. Opacity tracks β·exp(−γr²) so distant attractions
    // fade out. Capped at top-3 to keep n² explosion bounded.
    function drawFireflyAttraction(ctx, projected, population, n, X, Y) {
      // Sort indices by fitness descending — for each firefly, attractors are
      // those with higher fitness.
      const ranked = [];
      for (let i = 0; i < n; i++) ranked.push({ i, f: population[i].fitness });
      ranked.sort((a, b) => b.f - a.f);
      const rankOf = new Array(n);
      for (let r = 0; r < ranked.length; r++) rankOf[ranked[r].i] = r;

      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const myRank = rankOf[i];
        if (myRank === 0) continue; // no brighter
        // Find top-3 brighter — those with rank < myRank, closest by canvas distance.
        const myX = X(projected[i * 2]);
        const myY = Y(projected[i * 2 + 1]);
        const brighter = [];
        for (let r = 0; r < myRank; r++) {
          const j = ranked[r].i;
          const jx = X(projected[j * 2]);
          const jy = Y(projected[j * 2 + 1]);
          const d = Math.hypot(jx - myX, jy - myY);
          brighter.push({ j, jx, jy, d });
        }
        brighter.sort((a, b) => a.d - b.d);
        const k = Math.min(3, brighter.length);
        for (let kk = 0; kk < k; kk++) {
          const b = brighter[kk];
          // β·exp(−γr²) in canvas-distance units. We use γ such that ~50px
          // halves the attraction.
          const r2 = b.d * b.d;
          const attr = Math.exp(-r2 / (50 * 50));
          if (attr < 0.05) continue;
          const alpha = 0.10 + 0.55 * attr;
          ctx.strokeStyle = `rgba(245, 220, 110, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.6 + attr * 1.2;
          ctx.beginPath();
          ctx.moveTo(myX, myY);
          ctx.lineTo(b.jx, b.jy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Grey Wolf — 3 thin arrows per wolf, one each toward α / β / δ leader.
    // Arrow opacity ∝ leader weight (α heaviest), color matches the leader
    // outline (gold / silver / bronze).
    function drawGreyWolfLeaders(ctx, projected, population, n, X, Y) {
      let alphaIdx = -1, betaIdx = -1, deltaIdx = -1;
      for (let i = 0; i < n; i++) {
        const r = population[i].swarmRank;
        if (r === 'alpha') alphaIdx = i;
        else if (r === 'beta') betaIdx = i;
        else if (r === 'delta') deltaIdx = i;
      }
      if (alphaIdx < 0) return;
      const leaders = [
        { idx: alphaIdx, color: '255, 210, 74',  weight: 0.55 },
        { idx: betaIdx,  color: '207, 210, 218', weight: 0.40 },
        { idx: deltaIdx, color: '205, 127, 50',  weight: 0.25 },
      ].filter(L => L.idx >= 0);

      ctx.save();
      for (let i = 0; i < n; i++) {
        if (i === alphaIdx || i === betaIdx || i === deltaIdx) continue;
        const myX = X(projected[i * 2]);
        const myY = Y(projected[i * 2 + 1]);
        for (const L of leaders) {
          const lx = X(projected[L.idx * 2]);
          const ly = Y(projected[L.idx * 2 + 1]);
          const dx = lx - myX, dy = ly - myY;
          const len = Math.hypot(dx, dy);
          if (len < 4) continue;
          ctx.strokeStyle = `rgba(${L.color}, ${(L.weight * 0.55).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(myX, myY);
          // Stop the line short of the leader so the marker stays clean.
          const sx = lx - 8 * dx / len;
          const sy = ly - 8 * dy / len;
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ACO archive overlay — the K best-ever solutions held in the colony's
    // pheromone-weighted archive, projected through the current basis as
    // faint persistent dots. Shows the algorithm's "memory" growing.
    function drawACOArchive(ctx, archive, mean, pc1, pc2, X, Y) {
      if (!archive || archive.length === 0) return;
      ctx.save();
      ctx.fillStyle = 'rgba(164, 129, 255, 0.45)';
      for (const entry of archive) {
        if (!entry.params) continue;
        let p1 = 0, p2 = 0;
        for (let j = 0; j < entry.params.length; j++) {
          const v = entry.params[j] - mean[j];
          p1 += v * pc1[j]; p2 += v * pc2[j];
        }
        ctx.beginPath();
        ctx.arc(X(p1), Y(p2), 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Pairwise distance matrix — radically different rendering mode. Fills
    // the canvas with an N×N heatmap where each cell shows ‖params_i − params_j‖.
    // Rows/cols sorted by fitness so top-left = best. Cluster structure
    // appears as warm/cool blocks along the diagonal.
    function drawDistanceMatrix(ctx, population, w, h) {
      const valid = population.filter(p => p.params);
      const n = valid.length;
      if (n < 2) {
        drawEmpty(ctx, w, h, 'distance matrix needs ≥ 2 individuals with params');
        return;
      }
      // Sort by fitness descending so top-left is best.
      const sorted = valid.slice().sort((a, b) => b.fitness - a.fitness);
      const padL = 56, padR = 80, padT = 18, padB = 18;
      const innerW = Math.max(20, w - padL - padR);
      const innerH = Math.max(20, h - padT - padB);
      const cellSize = Math.min(innerW / n, innerH / n);
      const matW = cellSize * n;
      const matH = cellSize * n;
      // Compute pairwise distances + range for normalization.
      const dist = new Float32Array(n * n);
      let maxD = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let s = 0;
          const a = sorted[i].params, b = sorted[j].params;
          const len = Math.min(a.length, b.length);
          for (let k = 0; k < len; k++) {
            const d = a[k] - b[k];
            s += d * d;
          }
          const dd = Math.sqrt(s);
          dist[i * n + j] = dd;
          dist[j * n + i] = dd;
          if (dd > maxD) maxD = dd;
        }
      }
      if (maxD < 1e-9) maxD = 1;
      // Render cells. Cool (purple) = close, warm (orange) = far.
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const t = i === j ? 0 : dist[i * n + j] / maxD;
          // Diverging: low t → blue/purple, high t → orange/red.
          const r = Math.round(60 + 200 * t);
          const g = Math.round(70 + 100 * (1 - Math.abs(2 * t - 1)));
          const b = Math.round(180 - 130 * t);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(padL + j * cellSize, padT + i * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }
      // Border.
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(padL + 0.5, padT + 0.5, matW - 1, matH - 1);
      // Fitness sidebar to the left of the matrix.
      let bestF = -Infinity, worstF = Infinity;
      for (const p of sorted) {
        if (p.fitness > bestF) bestF = p.fitness;
        if (p.fitness < worstF) worstF = p.fitness;
      }
      const fSpan = Math.max(1e-6, bestF - worstF);
      for (let i = 0; i < n; i++) {
        const t = (sorted[i].fitness - worstF) / fSpan;
        const col = fitnessColor(t);
        ctx.fillStyle = rgba(col, 0.85);
        ctx.fillRect(padL - 8, padT + i * cellSize, 6, cellSize + 0.5);
      }
      // Right-side legend.
      ctx.fillStyle = 'rgba(154,163,187,0.7)';
      ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      const sx = padL + matW + 12;
      ctx.fillText('cell = ‖θᵢ − θⱼ‖', sx, padT + 12);
      ctx.fillText('rows: fitness ↓', sx, padT + 28);
      ctx.fillText('purple → orange', sx, padT + 44);
      ctx.fillText('= close → far', sx, padT + 58);
      ctx.fillText('n = ' + n, sx, padT + 78);
    }

    // ---------- Nonlinear projection: Sammon mapping (MDS family) ---------
    // Minimize Σᵢ<ⱼ (dᵢⱼ - δᵢⱼ)² / dᵢⱼ, where d is high-dim distance and
    // δ is low-dim. Init from PCA so the layout is sensibly oriented; then
    // gradient-descent on the stress for a fixed iteration budget. Diverges
    // on small low-dim distances — floor everything with epsilon.
    function runSammon(samples, n) {
      const dim = samples[0].length;
      // High-dim pairwise distances.
      const D = new Float64Array(n * n);
      let dSum = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let s = 0;
          const a = samples[i], b = samples[j];
          for (let k = 0; k < dim; k++) { const v = a[k] - b[k]; s += v * v; }
          const dd = Math.sqrt(s) + 1e-9;
          D[i * n + j] = dd; D[j * n + i] = dd;
          dSum += dd;
        }
      }
      if (dSum < 1e-9) return new Float64Array(n * 2);
      // Init from PCA.
      const pcaRes = BF.pca.pca2(samples);
      const Y = new Float64Array(pcaRes.projected);
      // Normalize Y to unit-ish scale so gradient steps are sane.
      let yMax = 0;
      for (let i = 0; i < n * 2; i++) if (Math.abs(Y[i]) > yMax) yMax = Math.abs(Y[i]);
      if (yMax > 1e-9) for (let i = 0; i < n * 2; i++) Y[i] /= yMax;
      const ITERS = 60;
      const lr = 0.3;
      const grad = new Float64Array(n * 2);
      for (let iter = 0; iter < ITERS; iter++) {
        // Zero gradient.
        for (let i = 0; i < n * 2; i++) grad[i] = 0;
        for (let i = 0; i < n; i++) {
          let gx = 0, gy = 0;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const dx = Y[i * 2] - Y[j * 2];
            const dy = Y[i * 2 + 1] - Y[j * 2 + 1];
            const delta = Math.sqrt(dx * dx + dy * dy) + 1e-9;
            const d = D[i * n + j];
            // ∂stress / ∂y_i ∝ (d − δ) / (d · δ) · (y_i − y_j)
            const factor = (d - delta) / (d * delta);
            gx += factor * dx;
            gy += factor * dy;
          }
          grad[i * 2]     = -2 * gx / dSum;
          grad[i * 2 + 1] = -2 * gy / dSum;
        }
        // Step. Apply scale-down on later iters (simple cooling).
        const stepSize = lr * (1 - 0.6 * iter / ITERS);
        for (let i = 0; i < n * 2; i++) Y[i] -= stepSize * grad[i];
      }
      return Y;
    }

    // ---------- Nonlinear projection: t-SNE -------------------------------
    // Standard symmetric t-SNE. Builds high-dim similarities P (Gaussian
    // kernels with per-point σ tuned to a target perplexity) and minimizes
    // KL(P || Q) where Q uses Cauchy / t-distribution kernels in 2D. Famous
    // for cluster preservation. Heavier than MDS — ~250 iterations of O(n²).
    function runTSNE(samples, n) {
      const dim = samples[0].length;
      const PERPLEXITY = Math.min(30, Math.max(5, Math.floor(n / 4)));
      const ITERS = 250;
      const EARLY_EXAG = 4;
      const EARLY_ITERS = 100;
      const LR = 100;

      // High-dim squared distances.
      const D2 = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let s = 0;
          const a = samples[i], b = samples[j];
          for (let k = 0; k < dim; k++) { const v = a[k] - b[k]; s += v * v; }
          D2[i * n + j] = s; D2[j * n + i] = s;
        }
      }

      // Per-point σ via binary search on perplexity. Perplexity =
      // 2^H(P_i) where H is Shannon entropy of P_j|i.
      function findBeta(i) {
        let betaMin = -Infinity, betaMax = Infinity, beta = 1;
        const targetH = Math.log(PERPLEXITY);
        const Pi = new Float64Array(n);
        for (let attempt = 0; attempt < 50; attempt++) {
          let sum = 0;
          for (let j = 0; j < n; j++) {
            if (j === i) { Pi[j] = 0; continue; }
            Pi[j] = Math.exp(-D2[i * n + j] * beta);
            sum += Pi[j];
          }
          if (sum < 1e-12) sum = 1e-12;
          for (let j = 0; j < n; j++) Pi[j] /= sum;
          // Entropy.
          let H = 0;
          for (let j = 0; j < n; j++) {
            if (Pi[j] > 1e-12) H -= Pi[j] * Math.log(Pi[j]);
          }
          const diff = H - targetH;
          if (Math.abs(diff) < 1e-3) break;
          if (diff > 0) {
            betaMin = beta;
            beta = isFinite(betaMax) ? (beta + betaMax) / 2 : beta * 2;
          } else {
            betaMax = beta;
            beta = isFinite(betaMin) ? (beta + betaMin) / 2 : beta / 2;
          }
        }
        return Pi;
      }

      // Build P (symmetric).
      const P = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        const Pi = findBeta(i);
        for (let j = 0; j < n; j++) P[i * n + j] += Pi[j];
      }
      // Symmetrize and normalize.
      let pSum = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const v = (P[i * n + j] + P[j * n + i]) / (2 * n);
          P[i * n + j] = v; P[j * n + i] = v;
          pSum += 2 * v;
        }
      }
      if (pSum > 0) for (let i = 0; i < n * n; i++) P[i] /= pSum;
      // Floor to avoid log(0) issues.
      for (let i = 0; i < n * n; i++) if (P[i] < 1e-12) P[i] = 1e-12;

      // Init Y from PCA-projected, scaled small.
      const pcaRes = BF.pca.pca2(samples);
      const Y = new Float64Array(pcaRes.projected);
      let yMax = 0;
      for (let i = 0; i < n * 2; i++) if (Math.abs(Y[i]) > yMax) yMax = Math.abs(Y[i]);
      if (yMax > 1e-9) for (let i = 0; i < n * 2; i++) Y[i] = Y[i] / yMax * 1e-2;

      const grad = new Float64Array(n * 2);
      const dY = new Float64Array(n * 2); // momentum buffer
      const Q = new Float64Array(n * n);
      for (let iter = 0; iter < ITERS; iter++) {
        const exag = iter < EARLY_ITERS ? EARLY_EXAG : 1;
        // Compute Q.
        let qSum = 0;
        for (let i = 0; i < n; i++) Q[i * n + i] = 0;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = Y[i * 2] - Y[j * 2];
            const dy = Y[i * 2 + 1] - Y[j * 2 + 1];
            const v = 1 / (1 + dx * dx + dy * dy);
            Q[i * n + j] = v; Q[j * n + i] = v;
            qSum += 2 * v;
          }
        }
        if (qSum < 1e-12) qSum = 1e-12;
        // Gradient: dC/dY_i = 4 Σⱼ (P_ij·exag − Q_ij/qSum) · (Y_i − Y_j) · (1+||Y_i−Y_j||²)^-1
        for (let i = 0; i < n * 2; i++) grad[i] = 0;
        for (let i = 0; i < n; i++) {
          let gx = 0, gy = 0;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const pij = P[i * n + j] * exag;
            const qij = Q[i * n + j] / qSum;
            const factor = (pij - qij) * Q[i * n + j];
            gx += factor * (Y[i * 2] - Y[j * 2]);
            gy += factor * (Y[i * 2 + 1] - Y[j * 2 + 1]);
          }
          grad[i * 2]     = 4 * gx;
          grad[i * 2 + 1] = 4 * gy;
        }
        const momentum = iter < 50 ? 0.5 : 0.8;
        for (let i = 0; i < n * 2; i++) {
          dY[i] = momentum * dY[i] - LR * grad[i];
          Y[i] += dY[i];
        }
        // Recenter every iteration.
        let mx = 0, my = 0;
        for (let i = 0; i < n; i++) { mx += Y[i * 2]; my += Y[i * 2 + 1]; }
        mx /= n; my /= n;
        for (let i = 0; i < n; i++) { Y[i * 2] -= mx; Y[i * 2 + 1] -= my; }
      }
      return Y;
    }

    // ---------- Nonlinear projection: UMAP --------------------------------
    // Simplified UMAP-inspired layout: k-nearest-neighbors graph in high-dim,
    // edge-weighted attractive forces, negative-sampled repulsive forces.
    // Differs from t-SNE in two ways: (1) local σ tuned via the smooth-knn
    // continuous condition rather than perplexity binary search, and
    // (2) probabilistic-OR edge symmetrization that lets clusters have
    // sharper boundaries while preserving more global structure.
    //
    // This is NOT a full UMAP implementation — there's no spectral-embedding
    // init (we PCA-init), no exact a/b curve fitting (we use canonical
    // values), and the negative sampling is uniform rather than degree-
    // biased. It's faithful to the spirit of UMAP and gives a recognizably
    // different layout than t-SNE for cluster-rich data.
    function runUMAP(samples, n) {
      const dim = samples[0].length;
      // UMAP canonical curve params for default min_dist=0.1, spread=1.
      const A = 1.577;
      const B = 0.8951;
      const ITERS = 200;
      const NEG_SAMPLES = 5;

      // High-dim squared distances.
      const D2 = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let s = 0;
          const a = samples[i], b = samples[j];
          for (let k = 0; k < dim; k++) { const v = a[k] - b[k]; s += v * v; }
          D2[i * n + j] = s; D2[j * n + i] = s;
        }
      }

      // k-nearest-neighbors per point (k = min(15, n/4)).
      const K = Math.max(2, Math.min(15, Math.floor(n / 4)));
      const neighbors = new Array(n);  // [{j, d2}] per i
      for (let i = 0; i < n; i++) {
        const dists = [];
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          dists.push({ j, d2: D2[i * n + j] });
        }
        dists.sort((a, b) => a.d2 - b.d2);
        neighbors[i] = dists.slice(0, K);
      }

      // For each point, find σ such that
      //   Σⱼ exp(-(d_ij - ρ_i) / σ_i) = log2(K)
      // where ρ_i is the distance to the nearest neighbor. Binary search.
      const sigma = new Float64Array(n);
      const rho = new Float64Array(n);
      const TARGET = Math.log(K) / Math.log(2);
      for (let i = 0; i < n; i++) {
        const nb = neighbors[i];
        rho[i] = Math.sqrt(nb[0].d2);   // nearest-neighbor distance
        let lo = 1e-6, hi = 1e6, sig = 1;
        for (let iter = 0; iter < 30; iter++) {
          let sum = 0;
          for (const e of nb) {
            const d = Math.sqrt(e.d2) - rho[i];
            if (d > 0) sum += Math.exp(-d / sig);
            else sum += 1;
          }
          if (Math.abs(sum - TARGET) < 1e-3) break;
          if (sum > TARGET) hi = sig;
          else lo = sig;
          sig = (lo + hi) / 2;
        }
        sigma[i] = sig;
      }

      // Build directed edge weights P[i][j] for j in neighbors(i).
      // Then symmetrize via probabilistic OR: P_ij ← P_ij + P_ji − P_ij·P_ji.
      const edges = [];   // {i, j, w}
      const seen = new Set();  // "i,j" with i < j to dedupe
      const pMap = new Map(); // key "i,j" → weight (asymmetric initially)
      for (let i = 0; i < n; i++) {
        for (const e of neighbors[i]) {
          const d = Math.sqrt(e.d2) - rho[i];
          const w = d > 0 ? Math.exp(-d / sigma[i]) : 1;
          pMap.set(i + ',' + e.j, w);
        }
      }
      for (let i = 0; i < n; i++) {
        for (const e of neighbors[i]) {
          const j = e.j;
          if (i >= j) continue;  // dedupe
          const pij = pMap.get(i + ',' + j) || 0;
          const pji = pMap.get(j + ',' + i) || 0;
          const w = pij + pji - pij * pji;
          if (w > 1e-4) edges.push({ i, j, w });
        }
      }

      // Init Y from PCA, normalized to ~[-10, 10].
      const pcaRes = BF.pca.pca2(samples);
      const Y = new Float64Array(pcaRes.projected);
      let yMax = 0;
      for (let i = 0; i < n * 2; i++) if (Math.abs(Y[i]) > yMax) yMax = Math.abs(Y[i]);
      if (yMax > 1e-9) for (let i = 0; i < n * 2; i++) Y[i] = Y[i] / yMax * 10;

      // SGD: each edge gets visited once per "epoch", attractive force toward
      // partner, then NEG_SAMPLES random non-edges get a repulsive force.
      // a/b curve: 1 / (1 + a·d²ᵇ) is the low-dim probability surrogate.
      const rng = BF.util.makeRng(42);
      function lrAt(iter) { return 1.0 * (1 - iter / ITERS); }

      for (let iter = 0; iter < ITERS; iter++) {
        const lr = lrAt(iter);
        // Shuffle edges (Fisher-Yates).
        for (let k = edges.length - 1; k > 0; k--) {
          const r = Math.floor(rng.next() * (k + 1));
          const tmp = edges[k]; edges[k] = edges[r]; edges[r] = tmp;
        }
        for (const ed of edges) {
          if (rng.next() > ed.w) continue;  // edge sampling
          const i = ed.i, j = ed.j;
          const dx = Y[i * 2] - Y[j * 2];
          const dy = Y[i * 2 + 1] - Y[j * 2 + 1];
          const d2 = dx * dx + dy * dy + 1e-6;
          // Attractive gradient: -2·a·b·d^(2b-2) / (1 + a·d²ᵇ)
          const denom = 1 + A * Math.pow(d2, B);
          const gradCoef = (-2 * A * B * Math.pow(d2, B - 1)) / denom;
          const gx = clamp(gradCoef * dx, -4, 4) * lr;
          const gy = clamp(gradCoef * dy, -4, 4) * lr;
          Y[i * 2] += gx;     Y[i * 2 + 1] += gy;
          Y[j * 2] -= gx;     Y[j * 2 + 1] -= gy;
          // Repulsive: NEG_SAMPLES random non-neighbors of i.
          for (let ns = 0; ns < NEG_SAMPLES; ns++) {
            const k = Math.floor(rng.next() * n);
            if (k === i || k === j) continue;
            const rdx = Y[i * 2] - Y[k * 2];
            const rdy = Y[i * 2 + 1] - Y[k * 2 + 1];
            const rd2 = rdx * rdx + rdy * rdy + 1e-6;
            // Repulsive gradient: 2·b / (d² · (1 + a·d²ᵇ))
            const rdenom = (rd2) * (1 + A * Math.pow(rd2, B));
            const rgradCoef = (2 * B) / rdenom;
            const rgx = clamp(rgradCoef * rdx, -4, 4) * lr;
            const rgy = clamp(rgradCoef * rdy, -4, 4) * lr;
            Y[i * 2] += rgx; Y[i * 2 + 1] += rgy;
          }
        }
      }
      return Y;
    }

    // Random projection — pick a 2D random orthogonal basis in the original
    // parameter / feature space. Cheap, gives a fundamentally different view
    // than PCA's "max variance" cut. Re-roll changes the seed.
    function buildRandomBasis(dim, seed) {
      const rng = BF.util.makeRng(seed);
      function randVec() {
        const v = new Float64Array(dim);
        let n2 = 0;
        for (let j = 0; j < dim; j++) { v[j] = rng.gauss(0, 1); n2 += v[j] * v[j]; }
        const n = Math.sqrt(n2) || 1;
        for (let j = 0; j < dim; j++) v[j] /= n;
        return v;
      }
      const v1 = randVec();
      let v2 = randVec();
      // Gram-Schmidt orthogonalize v2 against v1.
      let dot = 0;
      for (let j = 0; j < dim; j++) dot += v2[j] * v1[j];
      let n2 = 0;
      for (let j = 0; j < dim; j++) { v2[j] -= dot * v1[j]; n2 += v2[j] * v2[j]; }
      const n = Math.sqrt(n2) || 1;
      for (let j = 0; j < dim; j++) v2[j] /= n;
      return [v1, v2];
    }

    return {
      invalidate() { cache = null; chainTrails = null; chainTrailsKey = null; randomBasisCache = null; },
      rerollRandomBasis() {
        randomBasisSeed = (randomBasisSeed * 1103515245 + 12345 + Date.now()) >>> 0;
        randomBasisCache = null;
        cache = null;
      },
      draw(population, options) {
        options = options || {};
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);
        if (!population || population.length === 0) {
          drawEmpty(ctx, w, h);
          ctx.restore();
          return;
        }

        // Distance-matrix mode is a totally different render path — no
        // projection at all, we just draw the N×N pairwise heatmap.
        const projectionMode = options.projectionMode || 'pca';
        if (projectionMode === 'distmatrix') {
          drawDistanceMatrix(ctx, population, w, h);
          ctx.restore();
          return;
        }

        const cacheKey = projectionMode + ':' + (options.generation == null ? -1 : options.generation);
        if (!cache || cache.key !== cacheKey || cache.size !== population.length) {
          // Behavior-space mode reads each individual's `behavior` Float64Array
          // (collected during evaluation) instead of the param vector. PCA
          // is still used for the 2D basis — but on a 6D feature space that
          // describes WHAT the policy does, not WHICH weights it uses.
          // Two policies with very different params but similar behavior
          // end up nearby; this is the classical novelty-search /
          // MAP-Elites lens.
          const built = projectionMode === 'behavior'
            ? BF.pca.buildBehaviorMatrix(population)
            : BF.pca.buildFeatureMatrix(population);
          if (built.samples.length === 0 || built.dim < 2) {
            cache = { key: cacheKey, empty: true };
          } else if (projectionMode === 'mds' || projectionMode === 'tsne' || projectionMode === 'umap') {
            // Nonlinear projection. Run iterative method, then synthesize a
            // cache that "looks like" a PCA result so all the downstream
            // overlays (best-ever trail, density, ellipses, …) work
            // unchanged. Components are stored as identity-ish so trail-
            // reprojection of historical params works approximately.
            const fn = projectionMode === 'mds' ? runSammon
                     : projectionMode === 'tsne' ? runTSNE
                     : runUMAP;
            const projected = fn(built.samples, built.samples.length);
            // Synthesize a mean and components vector. Trails project via
            // pc1·v + pc2·v which works for params in the same space as
            // built.samples — store first two PCA components as a fallback
            // basis for trail reprojection (best-effort; the scatter is
            // still the correct nonlinear layout).
            const pcaRes = BF.pca.pca2(built.samples);
            cache = {
              key: cacheKey, size: population.length, empty: false,
              byParams: built.byParams, innovIndex: built.innovIndex,
              mean: pcaRes.mean, components: pcaRes.components,
              projected: projected,
              explained: [NaN, NaN], dim: built.dim,
              nonlinear: true,
            };
          } else if (projectionMode === 'random') {
            // Random projection: build a 2D random orthonormal basis once
            // per (dim, seed) combo and reuse it. The "mean" we subtract
            // is just the empirical mean of the current samples, so the
            // view stays centered.
            const dimL = built.dim;
            if (!randomBasisCache || randomBasisCache.dim !== dimL) {
              randomBasisCache = {
                dim: dimL,
                components: buildRandomBasis(dimL, randomBasisSeed),
              };
            }
            const pc1 = randomBasisCache.components[0];
            const pc2 = randomBasisCache.components[1];
            // Compute mean across samples.
            const N = built.samples.length;
            const mean = new Float64Array(dimL);
            for (const s of built.samples) {
              for (let j = 0; j < dimL; j++) mean[j] += s[j];
            }
            for (let j = 0; j < dimL; j++) mean[j] /= N;
            const projected = new Float64Array(N * 2);
            for (let i = 0; i < N; i++) {
              const s = built.samples[i];
              let p1 = 0, p2 = 0;
              for (let j = 0; j < dimL; j++) {
                const v = s[j] - mean[j];
                p1 += v * pc1[j]; p2 += v * pc2[j];
              }
              projected[i * 2] = p1;
              projected[i * 2 + 1] = p2;
            }
            cache = {
              key: cacheKey, size: population.length, empty: false,
              byParams: built.byParams, innovIndex: built.innovIndex,
              mean: mean, components: [pc1, pc2],
              projected: projected,
              // Random projection doesn't have meaningful "explained variance" —
              // store NaN so the UI shows '—' instead of a misleading number.
              explained: [NaN, NaN], dim: built.dim,
            };
          } else {
            const projRes = BF.pca.pca2(built.samples);
            cache = {
              key: cacheKey,
              size: population.length,
              empty: false,
              byParams: built.byParams,
              innovIndex: built.innovIndex,
              mean: projRes.mean,
              components: projRes.components,
              projected: projRes.projected,
              explained: projRes.explained,
              dim: built.dim,
            };
          }
        }
        if (cache.empty) {
          drawEmpty(ctx, w, h, 'genome too sparse for projection');
          ctx.restore();
          return;
        }
        const proj = {
          mean: cache.mean,
          components: cache.components,
          projected: cache.projected,
          explained: cache.explained,
        };
        const dim = cache.dim;

        // Scale projection to fit canvas with margin.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const n = population.length;
        for (let i = 0; i < n; i++) {
          const px = proj.projected[i * 2];
          const py = proj.projected[i * 2 + 1];
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        const padL = 40, padR = 80, padT = 18, padB = 12;
        const innerW = Math.max(20, w - padL - padR);
        const innerH = Math.max(20, h - padT - padB);
        // Best-ever trail only makes sense in linear PCA mode where the
        // cached components are a valid linear basis for params / genomes.
        // In nonlinear modes (MDS, t-SNE) the displayed scatter doesn't
        // correspond to a linear projection, so reprojecting historical
        // params through cached PCA components would render points off
        // the scatter. In behavior mode the cached components live in the
        // 6-D behavior space, not the param space — so old genomes can't
        // be projected into it at all.
        const skipTrail = cache.nonlinear || projectionMode === 'behavior';
        // Project the best-ever history into the current PCA basis so we can
        // draw a trail showing the path the run has taken through genome space.
        // Old genomes won't have entries for new innovation IDs (treat as 0),
        // and vice-versa — that's the right "no edge" interpretation.
        const trail = [];
        if (!skipTrail && options.bestEverHistory && options.bestEverHistory.length > 0) {
          for (const entry of options.bestEverHistory) {
            // Two projection paths depending on what the cache used.
            // Fixed-topology runs have entry.params (Float64Array aligned to
            // the param vector); NEAT runs only have entry.genome (innov-id
            // keyed feature vector).
            const [tx, ty] = cache.byParams
              ? projectParams(entry.params, cache.mean, cache.components[0], cache.components[1])
              : projectGenome(entry.genome, cache.innovIndex, cache.mean, cache.components[0], cache.components[1]);
            trail.push({ gen: entry.gen, fitness: entry.fitness, x: tx, y: ty });
            if (tx < minX) minX = tx;
            if (tx > maxX) maxX = tx;
            if (ty < minY) minY = ty;
            if (ty > maxY) maxY = ty;
          }
        }

        const xSpan = Math.max(1e-6, maxX - minX);
        const ySpan = Math.max(1e-6, maxY - minY);

        const X = (px) => padL + ((px - minX) / xSpan) * innerW;
        const Y = (py) => padT + (1 - (py - minY) / ySpan) * innerH;

        // Axes (just centered crosshairs at the projection mean).
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, padT + innerH / 2 + 0.5);
        ctx.lineTo(padL + innerW, padT + innerH / 2 + 0.5);
        ctx.moveTo(padL + innerW / 2 + 0.5, padT);
        ctx.lineTo(padL + innerW / 2 + 0.5, padT + innerH);
        ctx.stroke();

        // Fitness range for color mapping.
        let bestF = -Infinity, worstF = Infinity;
        for (const ind of population) {
          if (ind.fitness > bestF) bestF = ind.fitness;
          if (ind.fitness < worstF) worstF = ind.fitness;
        }
        const fSpan = Math.max(1e-6, bestF - worstF);

        // Density heatmap underlayer (universal). Painted FIRST so dots /
        // arrows / outlines all sit on top of it.
        if (options.showDensity !== false && n >= 4) {
          drawDensityHeatmap(ctx, proj.projected, n, X, Y, padL, padT, innerW, innerH);
        }

        // CMA-ES covariance ellipsoid: empirical 2D covariance of the
        // projected population gives a meaningful proxy for the algorithm's
        // search-distribution shape. Eigendecompose the 2×2 matrix to get
        // axis lengths + rotation, draw 1σ and 2σ contours.
        if (options.mode === 'cmaes' && n >= 4) {
          drawCovarianceEllipses(ctx, proj.projected, n, X, Y);
        } else if (options.showSpreadEllipse !== false && n >= 4) {
          // Universal swarm spread: same math, lighter color so it doesn't
          // visually conflict with CMA-ES's purple. Off by default for
          // NEAT (where it would just track topology dispersion, not search
          // distribution).
          if (options.mode !== 'neat' && options.mode !== 'neat-full') {
            drawSpreadEllipse(ctx, proj.projected, n, X, Y);
          }
        }

        // Per-chain trails (SA / PT / Cuckoo): each chain has a stable
        // population index, so we accumulate its params over generations and
        // reproject through the *current* basis each frame. Distinct from
        // the best-ever trail (one global path); these show per-individual
        // movement history. Skipped in non-linear and behavior modes — same
        // reasoning as the best-ever trail above.
        const trailModes = ['annealing', 'pt', 'cuckoo'];
        if (!skipTrail && trailModes.indexOf(options.mode) >= 0 && options.generation != null) {
          updateChainTrails(options.generation, population, n, options.mode);
          if (options.mode === 'cuckoo') {
            // Cuckoo gets a special bright Lévy-emphasizing render (last-gen
            // segment only — long jumps stand out visually).
            if (cache.byParams) {
              drawCuckooTrails(ctx, X, Y, n, cache.mean, cache.components[0], cache.components[1]);
            }
          } else {
            drawChainTrails(ctx, X, Y, options.mode, n);
          }
        }
        // DE: difference-vector arrows from each individual's targetParams
        // (its current accepted state) → params (this gen's trial).
        if (options.mode === 'de') {
          drawDEArrows(ctx, population, X, Y);
        }
        // PSO: per-particle velocity arrows from x → x + v.
        if (options.mode === 'pso') {
          drawPSOArrows(ctx, population, X, Y);
        }
        // Firefly: pairwise attraction lines to top-3 brighter neighbors.
        if (options.mode === 'firefly') {
          drawFireflyAttraction(ctx, proj.projected, population, n, X, Y);
        }
        // Grey Wolf: 3 leader-pull arrows per wolf.
        if (options.mode === 'greywolf') {
          drawGreyWolfLeaders(ctx, proj.projected, population, n, X, Y);
        }
        // ACO: pheromone-weighted archive overlay. Skipped in non-PCA
        // projection modes for the same reason as the trails — the cached
        // components don't map archive params onto the displayed scatter.
        if (options.mode === 'aco' && options.acoArchive && cache.byParams && !skipTrail) {
          drawACOArchive(ctx, options.acoArchive, cache.mean,
                         cache.components[0], cache.components[1], X, Y);
        }

        // Dots.
        for (let i = 0; i < n; i++) {
          const ind = population[i];
          const t = (ind.fitness - worstF) / fSpan;
          const col = fitnessColor(t);
          const x = X(proj.projected[i * 2]);
          const y = Y(proj.projected[i * 2 + 1]);
          const r = 2 + 3 * t;
          ctx.fillStyle = rgba(col, 0.55 + 0.45 * t);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mark elites (top fraction) with outline.
        const eliteCount = Math.max(1, Math.floor((options.eliteRatio || 0.2) * n));
        const ranked = population.map((p, i) => ({ p, i })).sort((a, b) => b.p.fitness - a.p.fitness);
        for (let r = 0; r < eliteCount && r < ranked.length; r++) {
          const i = ranked[r].i;
          const x = X(proj.projected[i * 2]);
          const y = Y(proj.projected[i * 2 + 1]);
          ctx.strokeStyle = '#6ce28a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Best-ever trajectory: polyline through every recorded best-ever, with
        // dots at each waypoint. The latest point is the active best-ever.
        if (trail.length > 0) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(78, 224, 192, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < trail.length; i++) {
            const tx = X(trail[i].x);
            const ty = Y(trail[i].y);
            if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
          }
          ctx.stroke();
          // Waypoint dots, fading from older (transparent) to newer (opaque).
          for (let i = 0; i < trail.length; i++) {
            const tx = X(trail[i].x);
            const ty = Y(trail[i].y);
            const alpha = 0.25 + 0.65 * (i / Math.max(1, trail.length - 1));
            ctx.beginPath();
            ctx.fillStyle = `rgba(78, 224, 192, ${alpha})`;
            ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          // Highlight the latest best-ever waypoint.
          const last = trail[trail.length - 1];
          const tx = X(last.x), ty = Y(last.y);
          ctx.strokeStyle = '#4ee0c0';
          ctx.fillStyle = 'rgba(78, 224, 192, 0.20)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(tx, ty, 9, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.restore();
        }

        // Right column: explained variance + axis labels. For random
        // projection there's no "explained variance" (the basis is arbitrary)
        // so we show the projection mode name instead.
        ctx.fillStyle = 'rgba(154,163,187,0.7)';
        ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        const sx = padL + innerW + 8;
        const ax1Label =
          projectionMode === 'random'   ? 'r₁'   :
          projectionMode === 'mds'      ? 'MDS-x':
          projectionMode === 'tsne'     ? 'tSNE-1':
          projectionMode === 'umap'     ? 'UMAP-1':
          projectionMode === 'behavior' ? 'b-PC1' : 'PC1';
        const ax2Label =
          projectionMode === 'random'   ? 'r₂'   :
          projectionMode === 'mds'      ? 'MDS-y':
          projectionMode === 'tsne'     ? 'tSNE-2':
          projectionMode === 'umap'     ? 'UMAP-2':
          projectionMode === 'behavior' ? 'b-PC2' : 'PC2';
        ctx.fillText(ax1Label, sx, padT + 12);
        ctx.fillText(isFinite(proj.explained[0]) ? (proj.explained[0] * 100).toFixed(1) + '%' : '—',
                     sx + 28, padT + 12);
        ctx.fillText(ax2Label, sx, padT + 26);
        ctx.fillText(isFinite(proj.explained[1]) ? (proj.explained[1] * 100).toFixed(1) + '%' : '—',
                     sx + 28, padT + 26);
        ctx.fillText('dim', sx, padT + 44);
        ctx.fillText(String(dim), sx + 28, padT + 44);
        ctx.fillText('n', sx, padT + 58);
        ctx.fillText(String(n), sx + 28, padT + 58);
        // Legend
        ctx.fillStyle = 'rgba(154,163,187,0.6)';
        ctx.fillText('color = fitness', sx, padT + 82);
        const lgW = 60, lgH = 6;
        const grad = ctx.createLinearGradient(sx, 0, sx + lgW, 0);
        grad.addColorStop(0, rgba(COL_LOW, 1));
        grad.addColorStop(0.5, rgba(COL_MID, 1));
        grad.addColorStop(1, rgba(COL_HIGH, 1));
        ctx.fillStyle = grad;
        ctx.fillRect(sx, padT + 88, lgW, lgH);
        ctx.fillStyle = 'rgba(154,163,187,0.55)';
        ctx.fillText('low', sx, padT + 104);
        ctx.fillText('high', sx + lgW - 18, padT + 104);

        ctx.restore();
      },
    };
  }

  // Project an arbitrary genome into a precomputed 2D PCA basis. Build the
  // sparse feature vector against the current innovation index (missing edges
  // contribute 0), then dot with each component after mean-centering.
  // Project a flat parameter vector into the cached PCA basis. Used for
  // best-ever-trail / chain-trail entries when buildFeatureMatrix produced
  // a `byParams` cache. Returns null-safe zeros if params is missing.
  function projectParams(params, mean, pc1, pc2) {
    if (!params) return [0, 0];
    let p1 = 0, p2 = 0;
    for (let j = 0; j < params.length; j++) {
      const v = params[j] - mean[j];
      p1 += v * pc1[j];
      p2 += v * pc2[j];
    }
    return [p1, p2];
  }

  function projectGenome(genome, innovIndex, mean, pc1, pc2) {
    const d = innovIndex.size;
    const v = new Float64Array(d);
    for (const c of genome.conns) {
      if (!c.enabled) continue;
      const idx = innovIndex.get(c.innov);
      if (idx != null) v[idx] = c.weight;
    }
    let p1 = 0, p2 = 0;
    for (let j = 0; j < d; j++) {
      const x = v[j] - mean[j];
      p1 += x * pc1[j];
      p2 += x * pc2[j];
    }
    return [p1, p2];
  }

  function fitnessColor(t) {
    t = clamp(t, 0, 1);
    if (t < 0.5) return lerpColor(COL_LOW, COL_MID, t * 2);
    return lerpColor(COL_MID, COL_HIGH, (t - 0.5) * 2);
  }

  function drawEmpty(ctx, w, h, msg) {
    ctx.fillStyle = 'rgba(154,163,187,0.5)';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg || 'train one generation to project genome space', w / 2, h / 2);
  }

  BF.genomeSpaceRenderer = { make: makeGenomeSpaceRenderer };
})(window.BF);
