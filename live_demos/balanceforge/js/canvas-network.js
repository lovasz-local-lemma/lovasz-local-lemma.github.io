// BalanceForge — network topology renderer.
// Lays out nodes by topological depth, colors connections by signed weight, and
// optionally animates activations using the most recent forward pass.

(function (BF) {
  'use strict';
  const { fitCanvas, signedColor, rgba, clamp } = BF.util;
  const N = BF.neat;

  function makeNetRenderer(canvas) {
    let lastLayout = null;
    let lastGenome = null;
    let pointer = null;
    let labelTime = null;
    let labelGenome = null;
    const labelFades = new Map();
    let visualMotion = null;
    let visualMode = null;
    const visualActivations = new Map();
    // Offscreen cache for the connection pass -- by far the most
    // expensive part of the network render on big-input genomes
    // (dodge + 16x16 grid has 260 inputs, leading to 400-800 bezier
    // strokes per frame in a NEAT-full run). Cached because the
    // connections only change when the genome actually mutates;
    // re-rendering them at 60 fps is wasted work.
    let _connCache = null;       // <canvas> element
    let _cacheGenome = null;     // identity-equal check
    let _cacheW = 0, _cacheH = 0;
    let _cacheSimplified = false;
    let _cacheLayout = '';
    function invalidateCache() {
      _cacheGenome = null;
    }
    return {
      lastLayout: () => lastLayout,
      lastGenome: () => lastGenome,
      invalidate: invalidateCache,
      // Coordinates are CSS pixels, just like hitTest. The app owns pointer
      // events; retaining them here lets the ordinary draw loop ease labels
      // without another animation timer or any change to policy evaluation.
      setPointer(x, y) {
        pointer = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      },
      hitTest(x, y) {
        if (!lastLayout) return null;
        let nearest = null, nearestDistance = Infinity;
        for (const node of lastLayout.nodes) {
          const dx = x - node.x, dy = y - node.y;
          const r = node.r + 4;
          const distance = dx * dx + dy * dy;
          if (distance <= r * r && distance < nearestDistance) {
            nearest = node; nearestDistance = distance;
          }
        }
        if (nearest) return nearest;
        for (const label of lastLayout.nodeLabels || []) {
          if (label.quiet && inLabel(x, y, label, 3)) return lastLayout.byId.get(label.id);
        }
        return null;
      },
      draw(genome, opts) {
        opts = opts || {};
        const now = Number.isFinite(opts.time) ? opts.time : performance.now();
        const reducedMotion = opts.reducedMotion != null ? !!opts.reducedMotion
          : typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!visualMotion && BF.visualMotion) visualMotion = BF.visualMotion.make();
        const mode = opts.cnnMode ? 'cnn' : opts.cnn3dMode ? 'cnn3d' : opts.cnnGridMode ? 'cnn-grid'
          : opts.cnnMultiscaleMode ? 'cnn-multiscale' : 'topology';
        if (visualMotion && mode !== visualMode) visualMotion.reset();
        visualMode = mode;
        const smoothing = !!opts.smoothing && !reducedMotion && !!visualMotion;
        if (visualMotion) visualMotion.begin(now, { enabled: smoothing,
          identity: opts.smoothingIdentity || genome || opts.cnnConfig || opts.cnn3dConfig || opts.cnnGridConfig || opts.cnnMultiscaleConfig });
        // Only renderer-owned colors and geometry are eased. The policy's
        // arrays/maps stay untouched, and foreground numeric labels read raw
        // values. CNN state objects are new each frame, so never use them as
        // smoothing identity; the app supplies the stable replay identity.
        function displayedState(state) {
          if (!smoothing || !state) return state;
          const display = { ...state, rawLastOutput: state.lastOutput };
          for (const key of ['image','conv','pool','hidden','volume','filterActivations',
            'localImage','globalImage','localConv','globalConv','localPool','globalPool','lastOutput']) {
            const value = state[key];
            if (typeof value === 'number') display[key] = visualMotion.scalar('cnn:' + key, value);
            else if (value && typeof value.length === 'number') display[key] = visualMotion.vector('cnn:' + key, value);
          }
          return display;
        }
        let activations = opts.activations || null;
        if (smoothing && activations) {
          visualActivations.clear();
          for (const [id, value] of activations) visualActivations.set(id,
            typeof value === 'number' ? visualMotion.scalar('node:' + id, value) : value);
          activations = visualActivations;
        }
        const fit = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(fit.dpr, fit.dpr);
        const w = fit.cssW, h = fit.cssH;
        ctx.clearRect(0, 0, w, h);
        // CNN policy mode: the genome is just a placeholder (no connections),
        // so drawing it as a network gives a useless near-blank panel. Show
        // the actual CNN architecture as a stacked diagram instead.
        if (opts.cnnMode && opts.cnnConfig) {
          drawCNNArchitecture(ctx, w, h, opts.cnnConfig, displayedState(opts.cnnState || null));
          ctx.restore();
          lastLayout = null;
          lastGenome = null;
          return;
        }
        // 3D CNN mode: same idea, but each "image" in the flow is a 3D
        // volume — we render a max-projection along the depth axis as a
        // 2D thumbnail so the user sees a meaningful preview without
        // expensive volumetric rendering. Conv + pool layers similarly
        // collapsed across depth before being shown.
        if (opts.cnn3dMode && opts.cnn3dConfig) {
          drawCNN3DArchitecture(ctx, w, h, opts.cnn3dConfig, displayedState(opts.cnn3dState || null));
          ctx.restore();
          lastLayout = null;
          lastGenome = null;
          return;
        }
        // Dodge grid CNN: a 2D CNN that consumes the setup's danger
        // grid + agent state. Same flow as the 2D CNN renderer, but
        // the output layer is a vector (numOutputs) so we render one
        // bar per action axis instead of a single command bar.
        if (opts.cnnGridMode && opts.cnnGridConfig) {
          drawCNNGridArchitecture(ctx, w, h, opts.cnnGridConfig, displayedState(opts.cnnGridState || null), opts);
          ctx.restore();
          lastLayout = null;
          lastGenome = null;
          return;
        }
        // Multi-scale CNN -- two parallel conv branches over a local
        // and a global grid. Full architectural diagram is in Round 4
        // of this feature; for now we render a minimal stacked preview
        // of the two grids + the dense output so the panel doesn't
        // sit blank.
        if (opts.cnnMultiscaleMode && opts.cnnMultiscaleConfig) {
          drawCNNMultiscaleArchitecture(ctx, w, h, opts.cnnMultiscaleConfig, displayedState(opts.cnnMultiscaleState || null));
          ctx.restore();
          lastLayout = null;
          lastGenome = null;
          return;
        }
        if (!genome) {
          drawEmpty(ctx, w, h);
          ctx.restore();
          lastLayout = null;
          lastGenome = null;
          return;
        }

        const layout = computeLayout(genome, w, h, opts, ctx);
        lastLayout = layout;
        lastGenome = genome;
        layout.nodeLabels = makeNodeLabels(ctx, layout, genome, opts, w, h);
        if (labelGenome !== genome) {
          labelGenome = genome;
          labelFades.clear();
        }
        const elapsed = labelTime == null ? 16 : clamp(now - labelTime, 0, 80);
        labelTime = now;
        const nearby = nearbyLabel(layout, pointer);
        for (const label of layout.nodeLabels) {
          const target = nearby && nearby.id === label.id ? 1 : 0;
          let opacity = labelFades.get(label.id) || 0;
          opacity = reducedMotion ? target : opacity + (target - opacity)
            * (1 - Math.exp(-elapsed / (target ? 85 : 170)));
          if (opacity < .002) opacity = 0;
          labelFades.set(label.id, opacity);
          label.prominence = opacity;
        }
        // Quiet labels belong beneath the connection pass. Input names sit
        // in a left gutter, where outgoing links cannot run through them.
        drawQuietLabels(ctx, layout.nodeLabels);

        // Connection rendering. Cached because it's the dominant
        // cost on big-input genomes (260+ inputs => hundreds of
        // beziers per frame). Cache is invalidated when:
        //   - the genome object reference changes (mutation produces
        //     a new clone, so identity-equality is a sound check),
        //   - the canvas resizes,
        //   - the simplified-render toggle flips.
        // When valid, we just drawImage the offscreen onto the live
        // canvas (cheap).
        const simplified = !!opts.simplifiedRender;
        const dpr = fit.dpr;
        const physW = canvas.width, physH = canvas.height;
        const cacheValid = _connCache
          && _cacheGenome === genome
          && _cacheW === physW && _cacheH === physH
          && _cacheSimplified === simplified
          && _cacheLayout === layout.signature;
        if (!cacheValid) {
          if (!_connCache) _connCache = document.createElement('canvas');
          if (_connCache.width !== physW)  _connCache.width  = physW;
          if (_connCache.height !== physH) _connCache.height = physH;
          const cctx = _connCache.getContext('2d');
          cctx.save();
          cctx.setTransform(1, 0, 0, 1, 0, 0);
          cctx.clearRect(0, 0, physW, physH);
          cctx.scale(dpr, dpr);
          drawConnections(cctx, genome, layout, simplified);
          cctx.restore();
          _cacheGenome = genome;
          _cacheW = physW; _cacheH = physH;
          _cacheSimplified = simplified;
          _cacheLayout = layout.signature;
        }
        // Blit the cached connections onto the live canvas in raw
        // physical pixels (resetTransform first so the dpr scale we
        // set above doesn't double-apply). Then re-apply the dpr
        // scale so the rest of the per-frame drawing uses CSS coords.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(_connCache, 0, 0);
        ctx.restore();
        ctx.setLineDash([]);

        // Grid-input panel: render the pixel array for the 256
        // grid cells as a single 2D image, replacing the 256 individual
        // input circles+labels (which were unreadable at this scale).
        // Connections from cells already drew in the pass above; the
        // panel sits on top, with cells colored by their activation.
        // Drawn BEFORE the activation halos / node circles so the halos
        // for the OTHER nodes (agent state, hidden, output) still glow
        // over the rest of the canvas.
        // Multi-panel input: iterate over layout.gridPanels (array) so
        // multi-scale (two stacked grids) and single-grid layouts share
        // the same render pass. Falls back to the legacy single
        // `layout.gridPanel` field when the array isn't populated (no
        // computeLayout path produces both, but keep both for safety).
        if (layout.gridPanels && layout.gridPanels.length > 0) {
          for (const p of layout.gridPanels) {
            drawGridPanel(ctx, p, activations);
          }
        } else if (layout.gridPanel) {
          drawGridPanel(ctx, layout.gridPanel, activations);
        }

        // Activation halos
        if (activations) {
          for (const node of layout.nodes) {
            if (node.isGridCell) continue;
            const v = activations.get(node.id);
            if (v == null) continue;
            const mag = clamp(Math.abs(v), 0, 1.5);
            if (mag < 0.05) continue;
            const col = signedColor(clamp(v, -1, 1));
            ctx.beginPath();
            ctx.fillStyle = rgba(col, 0.18 * mag);
            ctx.arc(node.x, node.y, 16 + mag * 14, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Nodes
        for (const node of layout.nodes) {
          // Grid cells are rendered by drawGridPanel above -- skip the
          // per-node circle + text pass entirely to avoid 256 tiny dots
          // overlapping each other.
          if (node.isGridCell) continue;
          const v = activations ? activations.get(node.id) : null;
          const fill = v != null
            ? rgba(signedColor(clamp(v, -1, 1)), 1)
            : 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.fillStyle = fill;
          ctx.strokeStyle = '#0b0d12';
          ctx.lineWidth = 1.2;
          ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Activation kind ring
          ctx.beginPath();
          ctx.strokeStyle = actRingColor(node.kind, node.act);
          ctx.lineWidth = 1.2;
          ctx.arc(node.x, node.y, node.r + 2.5, 0, Math.PI * 2);
          ctx.stroke();

          // Activation glyph in the node's center. One character per
          // activation type, sized to fit inside the circle. Drawn in
          // a slightly translucent matching ring color so the glyph
          // is identifiable at a glance but doesn't overpower the
          // halo + ring already encoding the same info. Inputs skip
          // this -- their label (cx/vx/s1/...) is more informative.
          const glyph = glyphFor(node);
          if (glyph) {
            const fontPx = Math.max(7, Math.round(node.r * 1.4));
            ctx.font = fontPx + 'px -apple-system, "SF Mono", "Segoe UI", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(11, 13, 18, 0.85)';
            ctx.fillText(glyph, node.x, node.y);
          }

        }

        // Layer labels
        ctx.fillStyle = 'rgba(154, 163, 187, 0.65)';
        ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        for (const lab of layout.layerLabels) {
          ctx.fillText(lab.text, lab.x, lab.y);
        }
        // Promoted labels are the final pass: glass, lettering and their
        // node ring remain legible above both weight curves and live halos.
        drawPromotedLabels(ctx, layout, opts, w, h);
        ctx.restore();
      },
    };
  }

  const LABEL_FONT = '10px -apple-system, "SF Mono", "Segoe UI", monospace';

  function inLabel(x, y, label, pad) {
    return x >= label.x - pad && x <= label.x + label.width + pad
      && y >= label.y - pad && y <= label.y + label.height + pad;
  }

  function makeNodeLabels(ctx, layout, genome, opts, w, h) {
    ctx.font = LABEL_FONT;
    const labels = [];
    for (const node of layout.nodes) {
      const fullText = String(labelFor(node, genome, opts.observationAbbr, opts.actionAbbr) || '');
      if (!fullText) continue;
      if (node.isGridCell) {
        // Hundreds of screen cells have no quiet text. Defer text metrics to
        // the single promoted label instead of measuring every cell each frame.
        labels.push({ id: node.id, text: fullText, fullText, side: 'above', x: node.x,
          y: node.y - node.r - 17, width: 0, height: 0, quiet: false,
          nodeX: node.x, nodeY: node.y, prominence: 0 });
        continue;
      }
      const side = node.kind === 'input' && !node.agentRow && !node.isGridCell ? 'left' : 'above';
      let text = fullText;
      const maxWidth = side === 'left' ? Math.max(12, node.x - node.r - 17) : Math.max(20, w - 20);
      while (text.length > 2 && ctx.measureText(text).width > maxWidth) text = text.slice(0, -2) + '…';
      const width = ctx.measureText(text).width;
      const x = clamp(side === 'left' ? node.x - node.r - 9 - width : node.x - width / 2, 5, w - width - 5);
      const y = clamp(side === 'left' ? node.y - 6 : node.y - node.r - 17, 18, h - 17);
      labels.push({ id: node.id, text, fullText, side, x, y, width, height: 12,
        quiet: !node.isGridCell, nodeX: node.x, nodeY: node.y, prominence: 0 });
    }
    return labels;
  }

  function nearbyLabel(layout, pointer) {
    if (!pointer) return null;
    let best = null, bestDistance = Infinity;
    for (const label of layout.nodeLabels) {
      const node = layout.byId.get(label.id);
      const dx = pointer.x - node.x, dy = pointer.y - node.y;
      const radius = node.isGridCell ? node.r + 2 : 26;
      const distance = Math.hypot(dx, dy);
      const overLabel = label.quiet && inLabel(pointer.x, pointer.y, label, 5);
      if (distance > radius && !overLabel) continue;
      const priority = overLabel ? Math.min(distance, 12) : distance;
      if (priority < bestDistance) { best = label; bestDistance = priority; }
    }
    return best;
  }

  function drawQuietLabels(ctx, labels) {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const label of labels) {
      if (!label.quiet) continue;
      ctx.fillStyle = label.side === 'left' ? 'rgba(210,222,245,0.58)' : 'rgba(203,216,239,0.34)';
      ctx.fillText(label.text, label.x, label.y + label.height / 2);
    }
  }

  function drawPromotedLabels(ctx, layout, opts, w, h) {
    // Only the active and fading previous label need a foreground pass.
    for (const label of layout.nodeLabels) {
      if (label.prominence <= .002) continue;
      const node = layout.byId.get(label.id);
      const value = opts.activations && opts.activations.get(label.id);
      const name = node.kind === 'hidden' ? label.fullText + ' · n' + node.id : label.fullText;
      const text = name + (Number.isFinite(value) ? '  ' + value.toFixed(2) : '');
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = label.prominence;
      ctx.font = LABEL_FONT;
      const width = Math.min(w - 12, ctx.measureText(text).width + 18), height = 25;
      // A promoted name may be wider than its quiet abbreviation. Keep the
      // complete name on the canvas instead of letting the left gutter clip it.
      const x = clamp(label.side === 'left' ? node.x - node.r - width - 7 : node.x - width / 2, 6, w - width - 6);
      const y = clamp(label.side === 'left' ? node.y - height / 2 : node.y - node.r - height - 5, 6, h - height - 6);
      const color = actRingColor(node.kind, node.act);
      ctx.shadowColor = color;
      ctx.shadowBlur = 13;
      const glass = ctx.createLinearGradient(0, y, 0, y + height);
      glass.addColorStop(0, 'rgba(54,66,87,0.98)');
      glass.addColorStop(.4, 'rgba(21,30,46,0.97)');
      glass.addColorStop(1, 'rgba(11,17,29,0.98)');
      ctx.fillStyle = glass;
      roundRectFill(ctx, x, y, width, height, 8);
      ctx.shadowBlur = 0;
      // The former separate white line at y+2 looked detached from small
      // grid-cell labels. Put the highlight on the rounded rim itself so the
      // glass keeps its bright edge without an independent floating stripe.
      const rim = ctx.createLinearGradient(0, y, 0, y + height);
      rim.addColorStop(0, 'rgba(231,244,255,0.66)');
      rim.addColorStop(.3, color);
      rim.addColorStop(1, 'rgba(149,183,212,0.36)');
      ctx.strokeStyle = rim;
      ctx.lineWidth = .8;
      roundRectStroke(ctx, x + .5, y + .5, width - 1, height - 1, 7.5);
      ctx.fillStyle = '#f4f8ff';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + 9, y + height / 2, width - 18);
      ctx.strokeStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 9;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // Canvas save/restore does not save the current path. Leave no label
      // outline for an unrelated subsequent painter to accidentally stroke.
      ctx.beginPath();
    }
  }

  function labelFor(node, genome, obsAbbr, actAbbr) {
    if (node.kind === 'input') {
      if (obsAbbr && obsAbbr[node.id] != null) return obsAbbr[node.id];
      return 'i' + node.id;
    }
    if (node.kind === 'output') {
      // Per-OUTPUT names when the caller supplies them (the recurrent policy's
      // 1 command + H memory writes would otherwise be nine dots all reading
      // "out"). Node ids run inputs 0..nIn-1 then outputs nIn..nIn+nOut-1.
      if (actAbbr) {
        const oi = node.id - (genome && genome.numInputs != null ? genome.numInputs | 0 : 0);
        if (oi >= 0 && actAbbr[oi] != null) return String(actAbbr[oi]);
      }
      return 'out';
    }
    // hidden — show activation function name
    return N.ACT_NAMES[node.act] || '';
  }

  // Center-of-node glyph indicating the activation function. One
  // character, faint so it doesn't compete with the ring color but
  // visible enough to ID at a glance without mousing over. Inputs
  // get no glyph (their label already names the observation); the
  // output's tanh squash isn't worth glyph noise either.
  function glyphFor(node) {
    if (!node || node.kind === 'input') return '';
    // A2: a TRUE blend (k>=2) gets a distinct marker; a k=1 mixture is
    // functionally a plain node, so fall through to its single-act glyph.
    if (node.mix && node.mix.length > 1) return '∑';
    switch (node.act) {
      case N.ACT.TANH:  return '⟆';  // s-curve
      case N.ACT.RELU:  return '⌐';  // bent line (max(0,x))
      case N.ACT.SIGM:  return 'σ';  // sigma
      case N.ACT.SIN:   return '∿';  // sine wave
      case N.ACT.GAUSS: return '∩';  // bell
      case N.ACT.LIN:   return '−';  // dash (identity)
      case N.ACT.SWISH:    return 'ʃ';  // smooth S
      case N.ACT.MISH:     return 'ɰ';  // smooth non-monotone
      case N.ACT.SOFTPLUS: return '⌒';  // soft ramp
      case N.ACT.ABS:      return '∨';  // V (|x|)
      case N.ACT.SQUARE:   return '∪';  // parabola
      case N.ACT.CAUCHY:   return 'ᴖ';  // fat bump
      case N.ACT.SNAKE:    return '∾';  // periodic-ish
      default:          return '';
    }
  }

  function actRingColor(kind, act) {
    if (kind === 'input') return '#9aa3bb';
    if (kind === 'output') return '#6aa9ff';
    // Per-activation color now comes from the shared ACT_META palette
    // (BF.neat.actColor) so the ring, the hover activation plot, and
    // the mixture legend can never drift. actColor's fallback
    // (#6ce28a) equals this function's previous `default:` so every
    // node-ring color is byte-identical to before this refactor.
    return N.actColor(act);
  }

  function drawEmpty(ctx, w, h) {
    ctx.fillStyle = 'rgba(154,163,187,0.5)';
    ctx.font = '12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('no genome yet — start training', w / 2, h / 2);
  }

  // Draw all genome connections to the given ctx. Factored out so the
  // offscreen connection cache can reuse the exact same code path the
  // pre-cache renderer used. `simplified=true` swaps beziers for
  // straight lines and uniform thin grey strokes -- much faster on
  // genomes with 500+ connections (e.g. dodge + 16x16 grid input +
  // a few hundred gens of add-conn mutations), at the cost of the
  // weight-color and bezier-curvature signal.
  function drawConnections(ctx, genome, layout, simplified) {
    ctx.lineCap = 'round';
    if (simplified) {
      // One uniform style for the whole pass -- single beginPath +
      // moveTo/lineTo per connection, one stroke at the end. This
      // collapses the canvas state-change overhead (which dominates
      // when each connection sets its own strokeStyle/lineWidth/dash).
      ctx.strokeStyle = 'rgba(154, 163, 187, 0.25)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const c of genome.conns) {
        if (!c.enabled) continue;  // skip disabled in simplified mode
        const a = layout.byId.get(c.from);
        const b = layout.byId.get(c.to);
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      return;
    }
    // Full-fidelity path -- per-connection weight color, bezier
    // curvature, disabled-edge dashing. Same code as the original
    // inline loop; cached via the offscreen canvas above.
    for (const c of genome.conns) {
      const a = layout.byId.get(c.from);
      const b = layout.byId.get(c.to);
      if (!a || !b) continue;
      const wAbs = Math.abs(c.weight);
      const tw = clamp(wAbs / 3, 0.1, 1);
      const baseColor = signedColor(clamp(c.weight, -1, 1));
      const alpha = c.enabled ? (0.25 + 0.55 * tw) : 0.07;
      ctx.strokeStyle = rgba(baseColor, alpha);
      ctx.lineWidth = 0.6 + 2.6 * tw;
      if (!c.enabled) ctx.setLineDash([3, 4]); else ctx.setLineDash([]);
      ctx.beginPath();
      if (a.layer === b.layer) {
        const cx = (a.x + b.x) / 2 + 30;
        const cy = (a.y + b.y) / 2;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
      } else {
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(a.x + 32, a.y, b.x - 32, b.y, b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Render a pixel-array input panel (one filled cell per input node)
  // instead of N tiny dots with text labels. Each cell is colored by
  // its current activation (when activations are present) so the user
  // sees the danger grid / multi-scale grid / top-K tail evolve live.
  // Connections from the connection-draw pass already attach to each
  // cell's center.
  //
  // Two panel layouts supported:
  //   * Square (legacy dodge-grid / LOCAL / GLOBAL): panel has
  //     `side` + `gridSize` + `cell`. Cells are gridSize × gridSize.
  //   * Non-square (top-K bullet tail): panel has explicit `width` +
  //     `height` + `rows` + `cols` + `rowH` + `colW`. The cell shape
  //     can be non-square (e.g. 8 rows × 4 cols).
  function drawGridPanel(ctx, panel, activations) {
    const rows = panel.rows != null ? panel.rows | 0 : (panel.gridSize | 0);
    const cols = panel.cols != null ? panel.cols | 0 : (panel.gridSize | 0);
    const rowH = panel.rowH != null ? panel.rowH : panel.cell;
    const colW = panel.colW != null ? panel.colW : panel.cell;
    const W = panel.width  != null ? panel.width  : panel.side;
    const H = panel.height != null ? panel.height : panel.side;
    const { x, y, firstCellId } = panel;
    ctx.save();
    // Outer frame so the panel reads as a screen, not a transparent
    // overlay on top of connections.
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(x - 1, y - 1, W + 2, H + 2);
    ctx.strokeStyle = 'rgba(106, 169, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    // Cells. When activations are absent (no live data yet), render
    // the grid as dim placeholders so the user still SEES the
    // structure -- otherwise the panel looks empty pre-training.
    const cellMin = Math.min(rowH, colW);
    const gap = Math.max(1, Math.floor(cellMin * 0.1));
    const innerW = Math.max(1, colW - gap);
    const innerH = Math.max(1, rowH - gap);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const id = firstCellId != null ? firstCellId + (gy * cols + gx) : null;
        const v = (activations && id != null) ? activations.get(id) : null;
        if (v == null) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        } else {
          // Match the rest of the network panel's signedColor scheme.
          const mag = clamp(Math.abs(v), 0, 1);
          ctx.fillStyle = rgba(signedColor(clamp(v, -1, 1)), 0.25 + 0.75 * mag);
        }
        const cx = x + gx * colW + (gap / 2);
        const cy = y + gy * rowH + (gap / 2);
        ctx.fillRect(cx, cy, innerW, innerH);
      }
    }
    ctx.restore();
  }

  // Live diagram of the CNN policy: each layer rendered as the actual data
  // it currently produces. Input → conv (per-filter feature maps stacked) →
  // pool (smaller per-filter maps) → dense (1D bars) → output (single bar).
  // When state is null (no live data yet), draws empty placeholders with the
  // same shapes so the layout stays stable.
  function drawCNNArchitecture(ctx, w, h, config, state) {
    const c = config;
    const padX = 14;
    const padY = 26;          // leave room for top label
    const labelGap = 4;
    const subGap = 14;
    const blockMaxH = h - padY - 22;     // bottom space for sub labels + footer
    const blockSize = Math.max(28, Math.min(blockMaxH, 78));
    // Pre-compute per-layer block widths so they pack reasonably.
    const layers = [
      { kind: 'image',  label: 'input',  sub: `${c.imageSize}×${c.imageSize}`,                               data: state ? state.image : null, dim: c.imageSize },
      { kind: 'conv',   label: 'conv',   sub: `${c.numFilters}×${c.filterSize}×${c.filterSize}`,            data: state ? state.conv  : null, dim: c.imageSize },
      { kind: 'pool',   label: 'pool',   sub: `${c.poolSize}×${c.poolSize} max`,                            data: state ? state.pool  : null, dim: Math.max(1, Math.floor(c.imageSize / c.poolSize)) },
      { kind: 'bars',   label: 'dense',  sub: `${c.denseHidden} units`,                                      data: state ? state.hidden : null, count: c.denseHidden },
      { kind: 'bar',    label: 'output', sub: 'cmd',                                                          data: state ? state.lastOutput : 0 },
    ];
    // Block widths: image-like blocks scale with imageSize relative to a base
    // 50px; bar columns get fixed ~36px.
    layers.forEach(l => {
      if (l.kind === 'image' || l.kind === 'conv' || l.kind === 'pool') l.w = blockSize;
      else if (l.kind === 'bars') l.w = Math.min(blockSize, Math.max(20, c.denseHidden * 4));
      else l.w = 18;
    });
    const totalW = layers.reduce((s, l) => s + l.w, 0);
    const usableW = Math.max(60, w - padX * 2);
    const gap = Math.max(8, (usableW - totalW) / (layers.length - 1));
    const cy = padY + blockSize / 2;
    let x = padX;

    ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const y = cy - blockSize / 2;
      // Top label.
      ctx.fillStyle = 'rgba(230,233,242,0.95)';
      ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(layer.label, x + layer.w / 2, y - labelGap);
      // Layer body.
      if (layer.kind === 'image') {
        drawImage(ctx, x, y, layer.w, blockSize, layer.data, layer.dim, layer.dim, COLOR_INPUT);
      } else if (layer.kind === 'conv') {
        drawFilterStack(ctx, x, y, layer.w, blockSize, layer.data, c.imageSize, c.imageSize, c.numFilters, COLOR_CONV);
      } else if (layer.kind === 'pool') {
        const pW = Math.max(1, Math.floor(c.imageSize / c.poolSize));
        drawFilterStack(ctx, x, y, layer.w, blockSize, layer.data, pW, pW, c.numFilters, COLOR_POOL);
      } else if (layer.kind === 'bars') {
        drawHiddenBars(ctx, x, y, layer.w, blockSize, layer.data, c.denseHidden);
      } else if (layer.kind === 'bar') {
        drawOutputBar(ctx, x, y, layer.w, blockSize, layer.data || 0);
      }
      // Sub label.
      ctx.fillStyle = 'rgba(154,163,187,0.85)';
      ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(layer.sub, x + layer.w / 2, y + blockSize + subGap);
      // Arrow to next.
      if (i < layers.length - 1) {
        const ax0 = x + layer.w + 4;
        const ax1 = x + layer.w + gap - 4;
        ctx.strokeStyle = 'rgba(106,169,255,0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ax0, cy);
        ctx.lineTo(ax1, cy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(106,169,255,0.6)';
        ctx.beginPath();
        ctx.moveTo(ax1, cy);
        ctx.lineTo(ax1 - 5, cy - 3);
        ctx.lineTo(ax1 - 5, cy + 3);
        ctx.closePath();
        ctx.fill();
      }
      x += layer.w + gap;
    }
    // Footer.
    ctx.fillStyle = 'rgba(154,163,187,0.55)';
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const total = cnnTotalParams(c);
    ctx.fillText(`CNN policy · ${total} params`, w / 2, h - 6);
  }

  // ---- Dodge-grid CNN architecture renderer -----------------------------
  // Same pipeline as the 2D CNN above, but the input image is the dodge
  // setup's pre-built 16x16 danger grid (not a phase-space rendering of
  // pendulum state), and the output is a VECTOR (numOutputs ≥ 2 for
  // dodge's 2D control) rendered as one bar per action axis. The agent-
  // state slice that prefixes the observation is shown as a small
  // "agent" mini-bar between pool and dense so the user can see the
  // additional inputs the CNN has alongside the grid.
  // Multi-scale CNN architectural diagram. Same layout language as
  // drawCNNGridArchitecture (image → conv → pool → dense → outputs)
  // but with TWO parallel branches stacked vertically (LOCAL on top,
  // GLOBAL on bottom) for the first three layers, then converging
  // into the shared dense layer.
  //
  // The first three columns (image, conv, pool) are split in half
  // vertically so both branches show their own activation maps at
  // the same x. After pool, both branches' arrows angle toward the
  // dense block's mid-y, visualizing the concatenation step. Dense
  // and outputs use the full block height.
  function drawCNNMultiscaleArchitecture(ctx, w, h, config, state) {
    const c = config;
    const padX = 14;
    const padY = 26;
    const labelGap = 4;
    const subGap = 14;
    // blockSize is the per-column vertical budget. Bumped up vs the
    // single-branch CNN renderers because we stack TWO branches in the
    // split columns and want each per-branch panel to be at least
    // ~halfH px tall so the grid cells (which are 16x16 by default)
    // are visible. The 160px cap fits most desktop layouts; smaller
    // panels naturally shrink via the height-aware min().
    const blockMaxH = h - padY - 26;
    const blockSize = Math.max(48, Math.min(blockMaxH, 160));
    // Per-branch half-block height (with a small gap between the two
    // branches so the eye reads them as separate).
    const branchGap = 6;
    const halfH = Math.max(24, Math.floor((blockSize - branchGap) / 2));
    const LG = c.localGridSize  || 16;
    const GG = c.globalGridSize || 16;
    const localPooledW  = Math.max(1, Math.floor(LG / c.poolSize));
    const globalPooledW = Math.max(1, Math.floor(GG / c.poolSize));
    const numOutputs = Math.max(1, c.numOutputs | 0) || 1;
    let outArr = state && state.lastOutput;
    if (!outArr) outArr = new Float64Array(numOutputs);
    else if (typeof outArr === 'number') outArr = [outArr];
    // Each "split" entry packs two layers (local + global) into the
    // same column slot. "shared" entries are single-block full-height.
    const layers = [
      { kind: 'split-image', label: 'grids',
        subLocal:  `${LG}×${LG} local (±80px)`,
        subGlobal: `${GG}×${GG} global (full field)`,
        dataLocal:  state ? state.localImage  : null,
        dataGlobal: state ? state.globalImage : null,
        dimLocal: LG, dimGlobal: GG },
      { kind: 'split-conv',  label: 'conv',
        subLocal:  `${c.numFilters}×${c.filterSize}² (local)`,
        subGlobal: `${c.numFilters}×${c.filterSize}² (global)`,
        dataLocal:  state ? state.localConv  : null,
        dataGlobal: state ? state.globalConv : null,
        dimLocal: LG, dimGlobal: GG },
      { kind: 'split-pool',  label: 'pool',
        subLocal:  `${c.poolSize}×${c.poolSize} max`,
        subGlobal: `${c.poolSize}×${c.poolSize} max`,
        dataLocal:  state ? state.localPool  : null,
        dataGlobal: state ? state.globalPool : null,
        dimLocal: localPooledW, dimGlobal: globalPooledW },
      { kind: 'bars',  label: 'dense',  sub: `${c.denseHidden} units`,
        data: state ? state.hidden : null, count: c.denseHidden },
      { kind: 'outs',  label: 'actions', sub: numOutputs === 2 ? 'x · y' : `${numOutputs} cmds`,
        data: outArr, count: numOutputs },
    ];
    // Allocate per-layer widths. Split layers are sized to halfH (so each
    // per-branch panel is roughly square -- preserves the aspect ratio of
    // the underlying 2D grid). Non-split layers (dense bars, output
    // bars) keep their content-driven sizing.
    layers.forEach(l => {
      if (l.kind === 'split-image' || l.kind === 'split-conv' || l.kind === 'split-pool') l.w = halfH;
      else if (l.kind === 'bars') l.w = Math.min(blockSize, Math.max(24, c.denseHidden * 5));
      else if (l.kind === 'outs') l.w = Math.max(36, numOutputs * 18);
      else l.w = 18;
    });
    const totalW = layers.reduce((s, l) => s + l.w, 0);
    const usableW = Math.max(60, w - padX * 2);
    const gap = Math.max(8, (usableW - totalW) / (layers.length - 1));
    const cy = padY + blockSize / 2;
    let x = padX;
    ctx.textAlign = 'center';
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const y = cy - blockSize / 2;
      // Header label (column title).
      ctx.fillStyle = 'rgba(230,233,242,0.95)';
      ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(layer.label, x + layer.w / 2, y - labelGap);
      if (layer.kind === 'split-image') {
        // Local image (top half), then global image (bottom half).
        drawImage(ctx, x, y,                      layer.w, halfH, layer.dataLocal,  layer.dimLocal,  layer.dimLocal,  COLOR_INPUT);
        drawImage(ctx, x, y + halfH + branchGap, layer.w, halfH, layer.dataGlobal, layer.dimGlobal, layer.dimGlobal, COLOR_INPUT);
      } else if (layer.kind === 'split-conv') {
        drawFilterStack(ctx, x, y,                      layer.w, halfH, layer.dataLocal,  layer.dimLocal,  layer.dimLocal,  c.numFilters, COLOR_CONV);
        drawFilterStack(ctx, x, y + halfH + branchGap, layer.w, halfH, layer.dataGlobal, layer.dimGlobal, layer.dimGlobal, c.numFilters, COLOR_CONV);
      } else if (layer.kind === 'split-pool') {
        drawFilterStack(ctx, x, y,                      layer.w, halfH, layer.dataLocal,  layer.dimLocal,  layer.dimLocal,  c.numFilters, COLOR_POOL);
        drawFilterStack(ctx, x, y + halfH + branchGap, layer.w, halfH, layer.dataGlobal, layer.dimGlobal, layer.dimGlobal, c.numFilters, COLOR_POOL);
      } else if (layer.kind === 'bars') {
        drawHiddenBars(ctx, x, y, layer.w, blockSize, layer.data, c.denseHidden);
      } else if (layer.kind === 'outs') {
        // Multi-output: stack N small horizontal bars vertically, each
        // centered on 0. Matches the cnn-grid renderer's output style
        // so the eye reads them the same way across CNN variants.
        const barH = Math.max(6, Math.floor(blockSize / Math.max(1, numOutputs)) - 2);
        for (let oi = 0; oi < numOutputs; oi++) {
          const by = y + 2 + oi * (barH + 2);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x + 2, by, layer.w - 4, barH);
          const midX = x + layer.w / 2;
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.beginPath();
          ctx.moveTo(midX, by);
          ctx.lineTo(midX, by + barH);
          ctx.stroke();
          const v = Math.max(-1, Math.min(1, outArr[oi] || 0));
          const halfBarW = (layer.w - 6) / 2;
          const barW = Math.abs(v) * halfBarW;
          ctx.fillStyle = v >= 0 ? 'rgba(108,226,138,0.85)' : 'rgba(255,102,128,0.85)';
          if (v >= 0) ctx.fillRect(midX, by, barW, barH);
          else        ctx.fillRect(midX - barW, by, barW, barH);
        }
      }
      // Sub-labels under each block. Split layers get TWO sub-labels
      // (one per branch) stacked under their respective halves; single
      // layers get one centered.
      ctx.fillStyle = 'rgba(154,163,187,0.85)';
      ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
      if (layer.kind === 'split-image' || layer.kind === 'split-conv' || layer.kind === 'split-pool') {
        ctx.fillText(layer.subLocal,  x + layer.w / 2, y + halfH + 8);
        ctx.fillText(layer.subGlobal, x + layer.w / 2, y + blockSize + subGap);
      } else {
        ctx.fillText(layer.sub, x + layer.w / 2, y + blockSize + subGap);
      }
      // Inter-layer arrows. Split→split: parallel pair of arrows (one
      // per branch). Split→dense (the merge): two angled arrows
      // converging into the dense block's mid-y, visualizing concat.
      // Shared→shared: single arrow centered on cy as in the other
      // CNN diagrams.
      if (i < layers.length - 1) {
        const next = layers[i + 1];
        const ax0 = x + layer.w + 4;
        const ax1 = x + layer.w + gap - 4;
        const isSplitNow = layer.kind && layer.kind.indexOf('split-') === 0;
        const isSplitNext = next.kind && next.kind.indexOf('split-') === 0;
        ctx.strokeStyle = 'rgba(106,169,255,0.45)';
        ctx.lineWidth = 1.2;
        ctx.fillStyle = 'rgba(106,169,255,0.6)';
        if (isSplitNow && isSplitNext) {
          // Two parallel arrows, one per branch.
          const yTop = y + halfH / 2;
          const yBot = y + halfH + branchGap + halfH / 2;
          for (const ay of [yTop, yBot]) {
            ctx.beginPath();
            ctx.moveTo(ax0, ay);
            ctx.lineTo(ax1, ay);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ax1, ay);
            ctx.lineTo(ax1 - 5, ay - 3);
            ctx.lineTo(ax1 - 5, ay + 3);
            ctx.closePath();
            ctx.fill();
          }
        } else if (isSplitNow && !isSplitNext) {
          // Two angled arrows converging to dense mid-y. Visualizes
          // the concat-then-dense step where both branches' pooled
          // features feed a shared fully-connected layer.
          const yTop = y + halfH / 2;
          const yBot = y + halfH + branchGap + halfH / 2;
          for (const ay of [yTop, yBot]) {
            ctx.beginPath();
            ctx.moveTo(ax0, ay);
            ctx.lineTo(ax1, cy);
            ctx.stroke();
            // Arrowhead at the convergence point.
            const dx = ax1 - ax0, dy = cy - ay;
            const m = Math.hypot(dx, dy) || 1;
            const ux = dx / m, uy = dy / m;
            const px = -uy, py = ux;
            ctx.beginPath();
            ctx.moveTo(ax1, cy);
            ctx.lineTo(ax1 - 5 * ux + 3 * px, cy - 5 * uy + 3 * py);
            ctx.lineTo(ax1 - 5 * ux - 3 * px, cy - 5 * uy - 3 * py);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          // Standard single arrow on cy.
          ctx.beginPath();
          ctx.moveTo(ax0, cy);
          ctx.lineTo(ax1, cy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ax1, cy);
          ctx.lineTo(ax1 - 5, cy - 3);
          ctx.lineTo(ax1 - 5, cy + 3);
          ctx.closePath();
          ctx.fill();
        }
      }
      x += layer.w + gap;
    }
    // Footer with param count.
    ctx.fillStyle = 'rgba(154,163,187,0.55)';
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const total = (BF.cnnMultiscale && BF.cnnMultiscale.paramCount)
      ? BF.cnnMultiscale.paramCount(c) : 0;
    ctx.fillText(`CNN multi-scale · ${total} params`, w / 2, h - 6);
  }

  function drawCNNGridArchitecture(ctx, w, h, config, state, opts) {
    opts = opts || {};
    const c = BF.cnnGrid.resolveConfig(config);
    const GW = c.gridW, GH = c.gridH, CH = c.channels;
    const outputs = state && state.lastOutput;
    const outArr = typeof outputs === 'number' ? [outputs] : outputs;
    const rawOutputs = state && state.rawLastOutput != null ? state.rawLastOutput : outputs;
    const rawOutArr = typeof rawOutputs === 'number' ? [rawOutputs] : rawOutputs;
    const actionNames = opts.cnnGridActionLabels || opts.actionAbbr || [];
    const layers = [
      { label: '01 · Sensor', sub: CH > 1 ? `${CH}×${GH}×${GW} · ch0` : `${GW}×${GH} danger`,
        kind: 'maps', data: state && state.image, gw: GW, gh: GH, count: 1, stride: 1, color: COLOR_INPUT },
      { label: '02 · Conv', sub: `${c.numFilters} filters · ${c.filterSize}²`,
        kind: 'maps', data: state && state.conv, gw: GW, gh: GH, count: c.numFilters, stride: c.numFilters, color: COLOR_CONV },
      { label: '03 · Pool', sub: `${c.poolH}×${c.poolW} max`,
        kind: 'maps', data: state && state.pool, gw: c.pooledW, gh: c.pooledH, count: c.numFilters, stride: c.numFilters, color: COLOR_POOL },
      { label: '04 · Dense', sub: `${c.denseHidden} units · tanh`, kind: 'dense', data: state && state.hidden },
      { label: '05 · Actions', sub: 'neural requests', kind: 'actions', data: outArr },
    ];
    // Five fixed-width blocks could exceed a 310px sidebar by almost a full
    // stage. A two-row flow keeps each map useful at narrow widths, including
    // the 220px concise viewport; wide panels retain the single-row flow.
    const pad = 12, gap = 14, narrow = w < 560;
    const cardH = narrow ? Math.min(124, (h - 54) / 2) : Math.min(172, h - 48);
    const rowGap = 20, y0 = narrow ? 12 : Math.max(12, (h - cardH - 20) / 2);
    const boxes = layers.map((_, i) => {
      const cols = narrow ? (i < 3 ? 3 : 2) : 5;
      const col = narrow && i >= 3 ? i - 3 : i;
      const width = (w - pad * 2 - gap * (cols - 1)) / cols;
      return { x: pad + col * (width + gap), y: y0 + (narrow && i >= 3 ? cardH + rowGap : 0), w: width, h: cardH };
    });
    ctx.save(); ctx.textBaseline = 'middle';
    // Connect stages before drawing their glass cards. The bend from Pool to
    // Dense is explicitly routed through the inter-row gap rather than under
    // an unrelated stage, so the computation order remains unambiguous.
    ctx.strokeStyle = 'rgba(140,190,226,.6)'; ctx.lineWidth = 1.3;
    for (let i = 0; i < boxes.length - 1; i++) {
      const a = boxes[i], b = boxes[i + 1];
      ctx.beginPath();
      if (narrow && i === 2) {
        const ay = a.y + a.h, bx = b.x + b.w / 2;
        ctx.moveTo(a.x + a.w / 2, ay);
        ctx.bezierCurveTo(a.x + a.w / 2, ay + rowGap * .65, bx, b.y - rowGap * .65, bx, b.y);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx - 3, b.y - 5); ctx.lineTo(bx, b.y); ctx.lineTo(bx + 3, b.y - 5); ctx.stroke();
      } else {
        const cy = a.y + a.h / 2;
        ctx.moveTo(a.x + a.w, cy); ctx.lineTo(b.x, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x - 5, cy - 3); ctx.lineTo(b.x, cy); ctx.lineTo(b.x - 5, cy + 3); ctx.stroke();
      }
    }
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i], box = boxes[i], x = box.x, y = box.y;
      const glass = ctx.createLinearGradient(x, y, x, y + box.h);
      glass.addColorStop(0, 'rgba(48,67,90,.56)'); glass.addColorStop(1, 'rgba(10,18,29,.72)');
      ctx.fillStyle = glass; roundRectFill(ctx, x, y, box.w, box.h, 9);
      ctx.strokeStyle = 'rgba(169,203,230,.35)'; ctx.lineWidth = .7;
      roundRectStroke(ctx, x + .5, y + .5, box.w - 1, box.h - 1, 8.5);
      ctx.font = '10px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(230,241,253,.96)';
      ctx.fillText(layer.label, x + 7, y + 12, box.w - 14);
      const content = { x: x + 8, y: y + 26, w: box.w - 16, h: box.h - 46 };
      if (layer.kind === 'maps') {
        // Preserve map aspect ratios and use fractional cell sizes when
        // necessary. The old one-pixel/minimum-filter-height floor could
        // overflow short blocks when more filters were enabled.
        const cols = layer.count > 2 ? 2 : 1, rows = Math.ceil(layer.count / cols), mapGap = 3;
        const slotW = (content.w - mapGap * (cols - 1)) / cols;
        const slotH = (content.h - mapGap * (rows - 1)) / rows;
        for (let f = 0; f < layer.count; f++) {
          const scale = Math.max(.001, Math.min(slotW / layer.gw, slotH / layer.gh));
          const mw = layer.gw * scale, mh = layer.gh * scale;
          const mx = content.x + (f % cols) * (slotW + mapGap) + (slotW - mw) / 2;
          const my = content.y + Math.floor(f / cols) * (slotH + mapGap) + (slotH - mh) / 2;
          ctx.fillStyle = '#090f19'; ctx.fillRect(mx, my, mw, mh);
          let max = 1e-6;
          if (layer.data) for (let k = 0; k < layer.gw * layer.gh; k++) max = Math.max(max, Math.abs(layer.data[k * layer.stride + f] || 0));
          if (layer.data) for (let k = 0; k < layer.gw * layer.gh; k++) {
            const v = layer.data[k * layer.stride + f] || 0;
            const strength = Math.min(1, Math.abs(v) / max);
            if (strength < .02) continue;
            const rgb = v < 0 ? [255,102,128] : layer.color;
            ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${.12 + .8 * strength})`;
            ctx.fillRect(mx + (k % layer.gw) * scale, my + Math.floor(k / layer.gw) * scale, scale, scale);
          }
          ctx.strokeStyle = `rgba(${layer.color[0]},${layer.color[1]},${layer.color[2]},.45)`;
          ctx.strokeRect(mx, my, mw, mh);
        }
      } else if (layer.kind === 'dense') {
        drawHiddenBars(ctx, content.x, content.y, content.w, content.h, layer.data, c.denseHidden);
      } else {
        const rowH = content.h / c.numOutputs;
        for (let oi = 0; oi < c.numOutputs; oi++) {
          const by = content.y + oi * rowH, v = clamp((outArr && outArr[oi]) || 0, -1, 1);
          const name = actionNames[oi] != null ? String(actionNames[oi]) : `a${oi + 1}`;
          ctx.textAlign = 'left'; ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
          ctx.fillStyle = '#c2d8eb'; ctx.fillText(name, content.x, by + rowH * .24, content.w * .62);
          ctx.textAlign = 'right'; ctx.fillStyle = '#d9e8f5';
          const rawValue = clamp((rawOutArr && rawOutArr[oi]) || 0, -1, 1);
          ctx.fillText(rawValue.toFixed(2), content.x + content.w, by + rowH * .24, content.w * .36);
          const trackY = by + rowH * .59, trackH = Math.max(1, rowH * .28), center = content.x + content.w / 2;
          ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(content.x, trackY, content.w, trackH);
          ctx.fillStyle = v >= 0 ? 'rgba(108,226,138,.86)' : 'rgba(255,102,128,.86)';
          const extent = Math.abs(v) * content.w / 2;
          ctx.fillRect(v >= 0 ? center : center - extent, trackY, extent, trackH);
          ctx.strokeStyle = 'rgba(230,240,255,.45)'; ctx.beginPath();
          ctx.moveTo(center, trackY - 1); ctx.lineTo(center, trackY + trackH + 1); ctx.stroke();
        }
      }
      ctx.font = '8px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(174,191,214,.86)';
      ctx.fillText(layer.sub, x + box.w / 2, y + box.h - 9, box.w - 10);
    }
    ctx.font = '9px -apple-system, "Segoe UI", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(157,182,204,.8)';
    ctx.fillText(`CNN · ${BF.cnnGrid.paramCount(c)} params · maps scale per filter`, w / 2, h - 8, w - 20);
    ctx.restore();
  }
  // ---- 3D CNN architecture renderer -------------------------------------
  // Same flow as drawCNNArchitecture but each "image" in the pipeline is a
  // 3D volume; we render a max-projection along the depth axis as a 2D
  // thumbnail. Cheap, gives a meaningful preview without true volumetric
  // rendering. Filter activations are surfaced as a small bar chart in
  // place of the 2D conv-stack so the user can see which 3D filter is
  // most active at any given moment.
  function drawCNN3DArchitecture(ctx, w, h, config, state) {
    const c = config;
    const padX = 14;
    const padY = 26;
    const labelGap = 4;
    const subGap = 14;
    const blockMaxH = h - padY - 22;
    const blockSize = Math.max(28, Math.min(blockMaxH, 78));
    const D = c.depthSize, H = c.imageSize, W = c.imageSize;
    const outDepth = Math.max(1, D - c.filterDepth + 1);
    const pooledW = Math.max(1, Math.floor(W / c.poolSize));

    // Project the volume to 2D via max-along-depth so the panel can show
    // a single legible thumbnail per layer. For temporal mode this means
    // "where in phase space did the system go over the recent window";
    // for spatial mode it's "where in (sin θ, ang_vel) state did it
    // visit, ignoring cart-x".
    const inputThumb   = state && state.volume ? maxProjectDepth(state.volume,    D, H, W, 1)              : null;
    const convThumb    = state && state.conv   ? maxProjectDepth(state.conv,      outDepth, H, W, c.numFilters) : null;
    const poolThumb    = state && state.pool   ? maxProjectDepth(state.pool,      outDepth, pooledW, pooledW, c.numFilters) : null;

    const layers = [
      { kind: 'image',     label: 'volume',  sub: `${D}×${H}×${W} (${c.inputMode})`, data: inputThumb, dim: H },
      { kind: 'conv',      label: 'conv 3D', sub: `${c.numFilters}×${c.filterDepth}×${c.filterSize}²`, data: convThumb, dim: H, stackCount: c.numFilters },
      { kind: 'pool',      label: 'pool',    sub: `${c.poolSize}×${c.poolSize} max`, data: poolThumb, dim: pooledW, stackCount: c.numFilters },
      { kind: 'bars',      label: 'dense',   sub: `${c.denseHidden} units`,         data: state ? state.hidden : null, count: c.denseHidden },
      { kind: 'bar',       label: 'output',  sub: 'cmd',                            data: state ? state.lastOutput : 0 },
    ];
    layers.forEach(l => {
      if (l.kind === 'image' || l.kind === 'conv' || l.kind === 'pool') l.w = blockSize;
      else if (l.kind === 'bars') l.w = Math.min(blockSize, Math.max(20, c.denseHidden * 4));
      else l.w = 18;
    });
    const totalW = layers.reduce((s, l) => s + l.w, 0);
    const usableW = Math.max(60, w - padX * 2);
    const gap = Math.max(8, (usableW - totalW) / (layers.length - 1));
    const cy = padY + blockSize / 2;
    let x = padX;

    ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const y = cy - blockSize / 2;
      ctx.fillStyle = 'rgba(230,233,242,0.95)';
      ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(layer.label, x + layer.w / 2, y - labelGap);
      if (layer.kind === 'image') {
        drawImage(ctx, x, y, layer.w, blockSize, layer.data, layer.dim, layer.dim, COLOR_INPUT);
      } else if (layer.kind === 'conv') {
        drawFilterStack(ctx, x, y, layer.w, blockSize, layer.data, H, H, c.numFilters, COLOR_CONV);
      } else if (layer.kind === 'pool') {
        drawFilterStack(ctx, x, y, layer.w, blockSize, layer.data, pooledW, pooledW, c.numFilters, COLOR_POOL);
      } else if (layer.kind === 'bars') {
        drawHiddenBars(ctx, x, y, layer.w, blockSize, layer.data, c.denseHidden);
      } else if (layer.kind === 'bar') {
        drawOutputBar(ctx, x, y, layer.w, blockSize, layer.data || 0);
      }
      ctx.fillStyle = 'rgba(154,163,187,0.85)';
      ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText(layer.sub, x + layer.w / 2, y + blockSize + subGap);
      if (i < layers.length - 1) {
        const ax0 = x + layer.w + 4;
        const ax1 = x + layer.w + gap - 4;
        ctx.strokeStyle = 'rgba(106,169,255,0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ax0, cy);
        ctx.lineTo(ax1, cy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(106,169,255,0.6)';
        ctx.beginPath();
        ctx.moveTo(ax1, cy);
        ctx.lineTo(ax1 - 5, cy - 3);
        ctx.lineTo(ax1 - 5, cy + 3);
        ctx.closePath();
        ctx.fill();
      }
      x += layer.w + gap;
    }
    ctx.fillStyle = 'rgba(154,163,187,0.55)';
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const total = BF.cnn3d.paramCount(c);
    ctx.fillText(`3D CNN policy · ${total} params · max-proj along depth`, w / 2, h - 6);
  }

  // Project a depth-stacked tensor to 2D via per-pixel max along the depth
  // axis. Layout assumed: tensor[(z*H + y)*W*F + x*F + f] for non-flat F-
  // channel data. We collapse depth and average across filters into a
  // single H*W grayscale-ready array.
  function maxProjectDepth(tensor, D, H, W, F) {
    const out = new Float64Array(H * W);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let mx = -Infinity;
        for (let z = 0; z < D; z++) {
          for (let f = 0; f < F; f++) {
            const idx = F === 1 ? z * H * W + y * W + x
                                : ((z * H + y) * W + x) * F + f;
            const v = tensor[idx];
            if (v > mx) mx = v;
          }
        }
        out[y * W + x] = mx === -Infinity ? 0 : mx;
      }
    }
    return out;
  }

  // ---- CNN layer drawing helpers -----------------------------------------
  const COLOR_INPUT = [106, 169, 255]; // blue
  const COLOR_CONV  = [245, 183, 105]; // amber
  const COLOR_POOL  = [164, 129, 255]; // purple
  const COLOR_HID   = [78, 224, 192];  // teal
  const COLOR_OUT   = [108, 226, 138]; // green

  function cnnTotalParams(c) {
    const conv = c.numFilters * (c.filterSize * c.filterSize + 1);
    const pooledW = Math.max(1, Math.floor(c.imageSize / c.poolSize));
    const flat = pooledW * pooledW * c.numFilters;
    return conv + flat * c.denseHidden + c.denseHidden + c.denseHidden * c.numOutputs + c.numOutputs;
  }

  // Draw a 2D image scaled to fit (fitW × fitH). data is Float64Array of
  // length dimW*dimH. Values are mapped linearly to [0, 1] using the layer's
  // observed range, then to a colored-on-dark gradient. nullable data → empty
  // bordered rectangle as a placeholder.
  function drawImage(ctx, x, y, fitW, fitH, data, dimW, dimH, color) {
    if (!data || data.length === 0) {
      drawEmptyBlock(ctx, x, y, fitW, fitH, color);
      return;
    }
    let mx = -Infinity, mn = Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > mx) mx = data[i];
      if (data[i] < mn) mn = data[i];
    }
    const range = Math.max(1e-6, mx - mn);
    const px = Math.max(1, Math.floor(fitW / dimW));
    const py = Math.max(1, Math.floor(fitH / dimH));
    // Center within fitW×fitH.
    const renderW = px * dimW;
    const renderH = py * dimH;
    const ox = x + (fitW - renderW) / 2;
    const oy = y + (fitH - renderH) / 2;
    // Background fill.
    ctx.fillStyle = '#0e1118';
    ctx.fillRect(ox, oy, renderW, renderH);
    for (let yy = 0; yy < dimH; yy++) {
      for (let xx = 0; xx < dimW; xx++) {
        const v = (data[yy * dimW + xx] - mn) / range;
        if (v < 0.02) continue;
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.12 + 0.85 * v})`;
        ctx.fillRect(ox + xx * px, oy + yy * py, px, py);
      }
    }
    // Frame.
    ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},0.5)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, renderW - 1, renderH - 1);
  }

  // numFilters separate (dimW × dimH) feature maps, stacked vertically inside
  // the block. Data is Float64Array of length dimW*dimH*numFilters with the
  // *interleaved* layout used by cnn_policy.forward (filter index varies
  // fastest, then x, then y).
  function drawFilterStack(ctx, x, y, fitW, fitH, data, dimW, dimH, numFilters, color) {
    if (!data || data.length === 0) {
      drawEmptyBlock(ctx, x, y, fitW, fitH, color);
      return;
    }
    const filterFitH = Math.max(8, Math.floor(fitH / numFilters) - 2);
    let yCursor = y;
    for (let f = 0; f < numFilters; f++) {
      // De-interleave: pull this filter's W*H values into a contiguous array.
      const slice = new Float64Array(dimW * dimH);
      for (let yy = 0; yy < dimH; yy++) {
        for (let xx = 0; xx < dimW; xx++) {
          slice[yy * dimW + xx] = data[(yy * dimW + xx) * numFilters + f];
        }
      }
      drawImage(ctx, x, yCursor, fitW, filterFitH, slice, dimW, dimH, color);
      yCursor += filterFitH + 2;
    }
  }

  // Vertical bars representing dense-layer activations (range [-1, 1] from
  // tanh). Positive bars grow up from the midline; negative grow down.
  function drawHiddenBars(ctx, x, y, fitW, fitH, data, count) {
    if (!data || data.length === 0) {
      drawEmptyBlock(ctx, x, y, fitW, fitH, COLOR_HID);
      return;
    }
    const cy = y + fitH / 2;
    const barW = fitW / count;
    for (let i = 0; i < count; i++) {
      const v = Math.max(-1, Math.min(1, data[i]));
      const halfH = (fitH / 2) * Math.abs(v);
      ctx.fillStyle = v >= 0
        ? `rgba(${COLOR_HID[0]},${COLOR_HID[1]},${COLOR_HID[2]},0.85)`
        : `rgba(255,102,128,0.85)`;
      const bx = x + i * barW + 1;
      const bw = Math.max(1, barW - 2);
      if (v >= 0) ctx.fillRect(bx, cy - halfH, bw, halfH);
      else ctx.fillRect(bx, cy, bw, halfH);
    }
    // Midline.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(x, cy + 0.5);
    ctx.lineTo(x + fitW, cy + 0.5);
    ctx.stroke();
    // Frame.
    ctx.strokeStyle = `rgba(${COLOR_HID[0]},${COLOR_HID[1]},${COLOR_HID[2]},0.4)`;
    ctx.strokeRect(x + 0.5, y + 0.5, fitW - 1, fitH - 1);
  }

  // Single tall bar representing the cart command (range [-1, 1]).
  function drawOutputBar(ctx, x, y, fitW, fitH, value) {
    const cy = y + fitH / 2;
    const v = Math.max(-1, Math.min(1, value));
    const halfH = (fitH / 2) * Math.abs(v);
    ctx.fillStyle = v >= 0
      ? `rgba(${COLOR_OUT[0]},${COLOR_OUT[1]},${COLOR_OUT[2]},0.9)`
      : `rgba(255,102,128,0.9)`;
    if (v >= 0) ctx.fillRect(x, cy - halfH, fitW, halfH);
    else ctx.fillRect(x, cy, fitW, halfH);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(x, cy + 0.5);
    ctx.lineTo(x + fitW, cy + 0.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${COLOR_OUT[0]},${COLOR_OUT[1]},${COLOR_OUT[2]},0.5)`;
    ctx.strokeRect(x + 0.5, y + 0.5, fitW - 1, fitH - 1);
  }

  function drawEmptyBlock(ctx, x, y, w, h, color) {
    ctx.fillStyle = '#0e1118';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},0.4)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
  }

  function roundRectFill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  function roundRectStroke(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
  }

  // Layout: assign each node a layer based on topological depth.
  // Inputs are layer 0, outputs are the last layer; hidden nodes spread between.
  function computeLayout(genome, w, h, opts, ctx) {
    opts = opts || {};
    const concise = opts.layoutDensity === 'concise';
    ctx.font = LABEL_FONT;
    let inputWidth = 0;
    for (const node of genome.nodes) {
      if (node.kind !== 'input') continue;
      if (opts.inputLayout && node.id >= opts.inputLayout.agentInputs) continue;
      const label = labelFor(node, genome, opts.observationAbbr, opts.actionAbbr);
      inputWidth = Math.max(inputWidth, ctx.measureText(String(label)).width);
    }
    const padX = Math.min(Math.max(46, inputWidth + 24), 88, w * .25), padY = 32;
    const innerW = Math.max(60, w - padX - 30);
    const innerH = Math.max(60, Math.min(h - padY * 2, concise ? 216 : Infinity));

    const incoming = new Map();
    const adj = new Map();
    for (const n of genome.nodes) { incoming.set(n.id, []); adj.set(n.id, []); }
    for (const c of genome.conns) {
      if (!c.enabled) continue;
      adj.get(c.from).push(c.to);
      incoming.get(c.to).push(c.from);
    }
    // Longest path from any input → node defines its depth.
    const depth = new Map();
    for (const n of genome.nodes) depth.set(n.id, 0);
    // Process in topological order using Kahn-ish iterative pass.
    // Simpler approach: BFS from inputs, propagate max depth.
    const order = topoOrder(genome);
    for (const id of order) {
      let maxIn = 0;
      for (const fromId of incoming.get(id) || []) {
        maxIn = Math.max(maxIn, (depth.get(fromId) || 0) + 1);
      }
      const node = nodeById(genome, id);
      if (node.kind === 'input') depth.set(id, 0);
      else depth.set(id, Math.max(maxIn, depth.get(id) || 0));
    }
    // Outputs get pinned to maxLayer.
    let maxLayer = 0;
    for (const v of depth.values()) if (v > maxLayer) maxLayer = v;
    maxLayer = Math.max(1, maxLayer);
    for (const n of genome.nodes) {
      if (n.kind === 'output') depth.set(n.id, maxLayer);
    }
    // Group nodes by layer.
    const layers = [];
    for (let i = 0; i <= maxLayer; i++) layers.push([]);
    for (const n of genome.nodes) {
      layers[depth.get(n.id)].push(n);
    }
    // Position.
    const layoutNodes = [];
    const byId = new Map();
    const labels = [];
    // Set by the dodge-grid branch below. Tells the draw function where
    // to render the pixel-array grid panel (replaces 256 individual
    // input nodes). For multi-scale input layouts a second panel
    // is appended to `gridPanels`; the draw pass iterates over the
    // array so both rendering paths share the same drawGridPanel
    // helper.
    let gridPanel = null;
    const gridPanels = [];
    // Input-layout hint: when the genome's inputs have a known 2D
    // structure (e.g. dodge + grid observation -> 4 agent state + 16x16
    // grid = 260 inputs), positioning them in a 1D column is
    // unreadable. The hint tells us "first N inputs are agent state,
    // remaining are an MxM grid"; we lay those out as a small column +
    // a 2D grid below it so the spatial structure is visible.
    const inputLayout = opts.inputLayout;
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const x = padX + (li / Math.max(1, layers.length - 1)) * innerW;
      // Sort within layer for determinism.
      layer.sort((a, b) => {
        const ka = (a.kind === 'input' ? 0 : (a.kind === 'output' ? 2 : 1));
        const kb = (b.kind === 'input' ? 0 : (b.kind === 'output' ? 2 : 1));
        if (ka !== kb) return ka - kb;
        return a.id - b.id;
      });
      // Special 2D layout for the input layer when the hint applies and
      // the input count matches. Inputs in genome.nodes are ordered by id
      // and id < numInputs => kind === 'input', so we trust id order to
      // map to "input index" 0..numInputs-1.
      if (li === 0 && inputLayout && inputLayout.kind === 'dodge-grid'
          && layer.every(n => n.kind === 'input')
          && layer.length === (inputLayout.agentInputs | 0) + (inputLayout.gridSize | 0) ** 2) {
        const G = inputLayout.gridSize | 0;
        const A = inputLayout.agentInputs | 0;
        // Layout: agent state as a horizontal ROW at the top of the
        // input area, grid panel BELOW the row. This keeps the agent
        // state's outgoing connections in a clear band at the top of
        // the panel where the grid doesn't cover them, while the grid
        // itself takes the bulk of the vertical space below for
        // readability. Last round's "column-on-left" arrangement put
        // the agent inputs at varying y values that the grid panel
        // partially overlapped -- the user couldn't see their lines.
        const headerH = 38;             // room for labels above the agent row
        const gridPanelMax = Math.min(innerW * 0.30, innerH - headerH - 4);
        const gridSide = Math.max(64, Math.min(gridPanelMax, 180));
        const gridX0 = padX;
        const gridY0 = padY + headerH;
        const cell = gridSide / G;
        // Agent inputs: horizontal row centered on the grid panel's
        // x-range so they sit ABOVE the grid that consumes their
        // structural neighbors. Normal-node rendering (circle, label,
        // halo) still applies; only the grid cells are special-cased
        // below.
        for (let i = 0; i < A; i++) {
          const n = layer[i];
          const ax = gridX0 + ((i + 0.5) / A) * gridSide;
          const ay = padY + headerH / 2;
          const entry = { id: n.id, x: ax, y: ay, r: 5, layer: li, kind: n.kind, act: n.act, agentRow: true };
          layoutNodes.push(entry);
          byId.set(n.id, entry);
        }
        // Grid cells: each cell records its center as the node position
        // (so connections attach correctly) and is tagged isGridCell so
        // the per-node circle+text rendering skips it. The actual grid
        // is drawn as a single panel after the connection pass.
        for (let gi = 0; gi < G * G; gi++) {
          const n = layer[A + gi];
          if (!n) break;
          const gx = gi % G, gy = (gi / G) | 0;
          const nx = gridX0 + (gx + 0.5) * cell;
          const ny = gridY0 + (gy + 0.5) * cell;
          const entry = {
            id: n.id, x: nx, y: ny,
            r: Math.max(1.5, cell * 0.45),
            layer: li, kind: n.kind, act: n.act,
            isGridCell: true,
          };
          layoutNodes.push(entry);
          byId.set(n.id, entry);
        }
        // Label sits ABOVE the agent state row so it doesn't fight the
        // grid panel for the y=padY-4 slot.
        labels.push({ x: gridX0 + gridSide / 2, y: 14, text: 'in · agent / grid' });
        // Stash grid panel info on the layout so the draw function can
        // render the pixel-array panel without re-deriving it.
        gridPanel = {
          x: gridX0, y: gridY0, side: gridSide,
          gridSize: G, cell: cell, agentInputs: A,
          // The id of the first grid cell, useful so the renderer can
          // index activations sequentially.
          firstCellId: layer[A] ? layer[A].id : null,
        };
        gridPanels.push(gridPanel);
        continue;
      }
      // Multi-scale dodge: agent row at top, two 8x8 grids stacked
      // (LOCAL on top, GLOBAL below). Same conceptual layout as
      // dodge-grid above, just with two panels sharing the input
      // column's vertical space. Drawn as two separate gridPanels so
      // the renderer iterates the array; each panel is independently
      // labeled in the connection arrows + the post-draw legend.
      if (li === 0 && inputLayout && inputLayout.kind === 'dodge-multiscale'
          && layer.every(n => n.kind === 'input')
          && layer.length === (inputLayout.agentInputs | 0)
                              + (inputLayout.localGridSize  | 0) ** 2
                              + (inputLayout.globalGridSize | 0) ** 2
                              + (inputLayout.topKTail | 0)) {
        const LG = inputLayout.localGridSize  | 0;
        const GG = inputLayout.globalGridSize | 0;
        const A  = inputLayout.agentInputs    | 0;
        const TK = inputLayout.topKTail       | 0;
        // Vertical budget: small header for the agent row, then two
        // grid panels with a label gap between them. Aim for square
        // cells in each grid so the danger pattern reads cleanly.
        const headerH = 38;
        const interGap = 18;  // space for the "GLOBAL" label between panels
        const availH = innerH - headerH - interGap - 4;
        const sidePerPanel = Math.max(48, Math.min(innerW * 0.30, availH / 2));
        const cellLocal  = sidePerPanel / LG;
        const cellGlobal = sidePerPanel / GG;
        const gridX0 = padX;
        const localY0  = padY + headerH;
        const globalY0 = localY0 + sidePerPanel + interGap;
        // Agent state row centered on the grid panels' x range.
        for (let i = 0; i < A; i++) {
          const n = layer[i];
          const ax = gridX0 + ((i + 0.5) / A) * sidePerPanel;
          const ay = padY + headerH / 2;
          const entry = { id: n.id, x: ax, y: ay, r: 5, layer: li, kind: n.kind, act: n.act, agentRow: true };
          layoutNodes.push(entry);
          byId.set(n.id, entry);
        }
        // LOCAL grid cells. Indices [A .. A + LG*LG).
        for (let gi = 0; gi < LG * LG; gi++) {
          const n = layer[A + gi];
          if (!n) break;
          const gx = gi % LG, gy = (gi / LG) | 0;
          const nx = gridX0 + (gx + 0.5) * cellLocal;
          const ny = localY0 + (gy + 0.5) * cellLocal;
          const entry = {
            id: n.id, x: nx, y: ny,
            r: Math.max(1.5, cellLocal * 0.45),
            layer: li, kind: n.kind, act: n.act,
            isGridCell: true,
          };
          layoutNodes.push(entry);
          byId.set(n.id, entry);
        }
        // GLOBAL grid cells. Indices [A + LG*LG .. A + LG*LG + GG*GG).
        const globalStart = A + LG * LG;
        for (let gi = 0; gi < GG * GG; gi++) {
          const n = layer[globalStart + gi];
          if (!n) break;
          const gx = gi % GG, gy = (gi / GG) | 0;
          const nx = gridX0 + (gx + 0.5) * cellGlobal;
          const ny = globalY0 + (gy + 0.5) * cellGlobal;
          const entry = {
            id: n.id, x: nx, y: ny,
            r: Math.max(1.5, cellGlobal * 0.45),
            layer: li, kind: n.kind, act: n.act,
            isGridCell: true,
          };
          layoutNodes.push(entry);
          byId.set(n.id, entry);
        }
        // Top-K tail: 8 bullets × 4 floats (dx, dy, vx, vy) appended
        // after the two grids. Renders as a SMALL PANEL (one mini cell
        // per input value, bullet-per-row × feature-per-column) so the
        // user sees one compact pixel block instead of 32 floating
        // circles. Each tail node is tagged isGridCell so the per-node
        // circle+text draw pass skips it; drawGridPanel paints the
        // brightness directly from each cell's activation. Connections
        // still attach to each cell's center because we register the
        // node positions in layoutNodes + byId.
        if (TK > 0) {
          const tailStart = globalStart + GG * GG;
          const featuresPerBullet = 4;  // dx, dy, vx, vy
          const numBullets = Math.max(1, (TK / featuresPerBullet) | 0);
          // Compact block to the right of the panels. Pick cell sizes
          // so the whole block fits within the GLOBAL panel's vertical
          // span; aspect intentionally portrait (more bullets than
          // features) so the layout reads as "one row = one bullet".
          const tailRowH = Math.max(7, Math.min(14, (sidePerPanel - 4) / numBullets));
          const tailColW = Math.max(7, Math.min(14, tailRowH));
          const tailW = featuresPerBullet * tailColW;
          const tailH = numBullets * tailRowH;
          const tailX0 = gridX0 + sidePerPanel + 14;
          const tailY0 = globalY0 + (sidePerPanel - tailH) / 2;
          for (let i = 0; i < TK; i++) {
            const n = layer[tailStart + i];
            if (!n) break;
            const bullet = (i / featuresPerBullet) | 0;
            const feat   = i % featuresPerBullet;
            const nx = tailX0 + (feat + 0.5) * tailColW;
            const ny = tailY0 + (bullet + 0.5) * tailRowH;
            const entry = {
              id: n.id, x: nx, y: ny,
              r: Math.max(1.5, Math.min(tailRowH, tailColW) * 0.4),
              layer: li, kind: n.kind, act: n.act,
              isGridCell: true,  // skip the per-node circle+text draw
            };
            layoutNodes.push(entry);
            byId.set(n.id, entry);
          }
          // Register the tail block as a panel so drawGridPanel can
          // paint each cell's activation as a pixel. Non-square layout
          // (rows ≠ cols) so we pass rows/cols separately; gridSize
          // stays for backward-compat with the square-grid callers.
          gridPanels.push({
            x: tailX0, y: tailY0,
            // For square gridPanel callers the `side` field is the
            // panel edge length; for the non-square tail we expose
            // explicit width/height. drawGridPanel below understands
            // both.
            width:  tailW,
            height: tailH,
            rows:   numBullets,
            cols:   featuresPerBullet,
            cell:   Math.min(tailRowH, tailColW),
            rowH:   tailRowH,
            colW:   tailColW,
            firstCellId: layer[tailStart] ? layer[tailStart].id : null,
          });
          labels.push({ x: tailX0 + tailW / 2, y: tailY0 - 4, text: 'top-K (8×4)' });
        }
        // Labels for each panel + the input column header.
        labels.push({ x: gridX0 + sidePerPanel / 2, y: 14, text: 'in · agent / multi-scale' });
        labels.push({ x: gridX0 + sidePerPanel / 2, y: localY0  - 4, text: 'LOCAL ±80px' });
        labels.push({ x: gridX0 + sidePerPanel / 2, y: globalY0 - 4, text: 'GLOBAL field' });
        // Two grid panels, drawn in order (local then global). The
        // renderer iterates over gridPanels so both pixel arrays paint
        // before the activation halos / node circle pass.
        gridPanels.push({
          x: gridX0, y: localY0, side: sidePerPanel,
          gridSize: LG, cell: cellLocal, agentInputs: A,
          firstCellId: layer[A] ? layer[A].id : null,
        });
        gridPanels.push({
          x: gridX0, y: globalY0, side: sidePerPanel,
          gridSize: GG, cell: cellGlobal, agentInputs: 0,
          firstCellId: layer[globalStart] ? layer[globalStart].id : null,
        });
        // Single-panel pointer kept for backward compat with the draw
        // path that branches on `layout.gridPanel`. We point it at the
        // first panel; the draw path now prefers gridPanels (array)
        // when present so the legacy field is informational only.
        gridPanel = gridPanels[0];
        continue;
      }
      for (let i = 0; i < layer.length; i++) {
        const n = layer[i];
        const y = padY + ((i + 1) / (layer.length + 1)) * innerH;
        const radius = n.kind === 'output' ? 7 : (n.kind === 'input' ? 5 : 5.5);
        const entry = { id: n.id, x, y, r: radius, layer: li, kind: n.kind, act: n.act, mix: n.mix };
        layoutNodes.push(entry);
        byId.set(n.id, entry);
      }
      labels.push({
        x: x,
        y: 14,
        text: li === 0 ? 'in' : (li === layers.length - 1 ? 'out' : 'h' + li),
      });
    }
    // The heterogeneous input block is wider than a single column. Give it
    // its own lateral lane before positioning dense layers, so a top-K screen
    // cannot sit directly on top of the first hidden column at narrow widths.
    if (gridPanels.length && maxLayer > 1) {
      const panelRight = Math.max(...gridPanels.map(panel => panel.x + (panel.width || panel.side)));
      const outputX = padX + innerW;
      const firstHiddenX = Math.min(outputX - 36, Math.max(padX + innerW / maxLayer, panelRight + 28));
      for (const node of layoutNodes) {
        if (node.layer <= 0) continue;
        node.x = firstHiddenX + ((node.layer - 1) / (maxLayer - 1)) * (outputX - firstHiddenX);
      }
      for (const label of labels) {
        const li = label.text === 'out' ? maxLayer : /^h\d+$/.test(label.text) ? Number(label.text.slice(1)) : 0;
        if (li > 0) label.x = firstHiddenX + ((li - 1) / (maxLayer - 1)) * (outputX - firstHiddenX);
      }
    }
    const signature = [padX, innerW, innerH, maxLayer, JSON.stringify(opts.inputLayout || null)].join('|');
    return { nodes: layoutNodes, byId, layerLabels: labels, gridPanel, gridPanels, signature,
      density: concise ? 'concise' : 'loose' };
  }

  function topoOrder(genome) {
    const adj = new Map();
    const indeg = new Map();
    for (const n of genome.nodes) { adj.set(n.id, []); indeg.set(n.id, 0); }
    for (const c of genome.conns) {
      if (!c.enabled) continue;
      adj.get(c.from).push(c.to);
      indeg.set(c.to, (indeg.get(c.to) || 0) + 1);
    }
    const queue = [];
    for (const [id, d] of indeg.entries()) if (d === 0) queue.push(id);
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const nxt of adj.get(id) || []) {
        indeg.set(nxt, indeg.get(nxt) - 1);
        if (indeg.get(nxt) === 0) queue.push(nxt);
      }
    }
    // Append any unvisited (cycle survivors — shouldn't exist, but safe).
    for (const n of genome.nodes) {
      if (!order.includes(n.id)) order.push(n.id);
    }
    return order;
  }

  function nodeById(g, id) { return g.nodes.find(n => n.id === id); }

  BF.netRenderer = { make: makeNetRenderer };
})(window.BF);
