// BalanceForge — input → action influence chord diagram.
//
// Answers "what did this network learn to LOOK AT": for the current champion
// genome, how much of each ACTION output is driven by each OBSERVATION input.
//
// The metric is the classic connection-weight influence:
//
//     influence[i][o] = Σ over every path i → o of Π |weight| along that path
//
// Every path is aggregated, but paths are never ENUMERATED — that would be
// exponential. It is a DAG dynamic program run in reverse topological order:
//
//     back[outputNode_o] = e_o                       (unit vector)
//     back[n]            = Σ_{n→m enabled} |w| · back[m]
//     influence[i][o]    = back[inputNode_i][o]
//
// which costs O(E · numOutputs) — and numOutputs is 1..9 for every setup here,
// so the backward form is ~60× cheaper in memory than the forward one on the
// big-input genomes (dodge multiscale is 548 inputs).
//
// Biases are deliberately excluded: a bias is not input-driven, so it cannot
// answer "which INPUT drives this action". Disabled connections are skipped,
// matching neat.js's own topoSort/evaluateGenome.
//
// Columns are then normalised to sum to 1, so the picture answers "what drives
// THIS action" rather than "which action has the biggest raw weights".
//
// Topology is read entirely from the genome (nodes + conns), never assumed to
// be layered — NEAT genomes grow arbitrary DAGs.

(function (BF) {
  'use strict';

  // A ribbon is drawn when it is a non-negligible share of EITHER end: of the
  // action it feeds, or of what its own input does. The two-sided test matters
  // on wide encodings — with 548 dodge-multiscale inputs every individual
  // input is <1% of an action, so a column-only test erases every named input
  // and leaves nothing but the aggregate, which is exactly the picture that
  // tells you least.
  const RIBBON_EPS = 0.005;
  // Minimum angular sweep (radians) an input slice gets, so its label is
  // always legible. Slices below it are raised to the floor and the rest are
  // rescaled down to fit. This makes the INPUT arc a legibility-normalised
  // index rather than an exact area encoding; the honest proportional scale
  // lives on the ACTION side, which is the side the question is about
  // ("what drives THIS action"). Without the floor, one dominant input — or
  // the folded "+N more" slice — squeezes every other label to zero width.
  const MIN_INPUT_SWEEP = 0.05;
  // Cap on how many input slices get their own arc. Dodge/grid genomes have
  // hundreds of inputs; beyond ~14 arcs the labels stop being readable, so
  // the tail is aggregated into one "other" slice (its ribbons are kept, so
  // the columns still sum to 1 — nothing is silently discarded).
  const DEFAULT_MAX_INPUTS = 14;

  // ---------- influence ----------

  // Topological order of the genome's enabled DAG, computed locally (Kahn).
  // Deliberately does NOT touch genome._order: that cache holds Maps which do
  // not survive a JSON round-trip, and quietly reusing/overwriting it from a
  // viz module is exactly the kind of shared-mutable-state bug this codebase
  // has been bitten by. Nodes left out by a cycle simply get zero influence.
  function topoOrder(genome) {
    const nodes = genome.nodes || [];
    const conns = genome.conns || [];
    const outgoing = new Map();
    const indeg = new Map();
    for (let i = 0; i < nodes.length; i++) {
      outgoing.set(nodes[i].id, []);
      indeg.set(nodes[i].id, 0);
    }
    for (let i = 0; i < conns.length; i++) {
      const c = conns[i];
      if (!c.enabled) continue;
      if (!outgoing.has(c.from) || !indeg.has(c.to)) continue;
      outgoing.get(c.from).push(c);
      indeg.set(c.to, indeg.get(c.to) + 1);
    }
    const queue = [];
    for (let i = 0; i < nodes.length; i++) {
      if (indeg.get(nodes[i].id) === 0) queue.push(nodes[i].id);
    }
    const order = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const id = queue[qi];
      order.push(id);
      const outs = outgoing.get(id);
      for (let k = 0; k < outs.length; k++) {
        const to = outs[k].to;
        const d = indeg.get(to) - 1;
        indeg.set(to, d);
        if (d === 0) queue.push(to);
      }
    }
    return { order: order, outgoing: outgoing };
  }

  // Returns { numInputs, numOutputs, rows, rowTotals, colTotals } where
  // rows[i] is a Float64Array of length numOutputs holding the RAW (un-
  // normalised) path-product influence of input i on each output.
  // Returns null when the genome isn't a graph policy (CNN placeholders /
  // analytic controllers carry a node-only stub with no connections).
  function influenceMatrix(genome) {
    if (!genome || !Array.isArray(genome.nodes) || !Array.isArray(genome.conns)) return null;
    const nIn = genome.numInputs | 0;
    const nOut = Math.max(1, genome.numOutputs | 0);
    if (nIn <= 0) return null;
    const { order, outgoing } = topoOrder(genome);
    // back[nodeId] = Float64Array(nOut). Allocated lazily so unreachable
    // nodes cost nothing.
    const back = new Map();
    const zero = new Float64Array(nOut);
    function backOf(id) {
      const v = back.get(id);
      return v || zero;
    }
    // Reverse topological order: every successor is finalised before the node.
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const vec = new Float64Array(nOut);
      // Output nodes seed the recursion. Outputs never have outgoing edges
      // (neat.canConnect forbids from-an-output), but summing both is
      // harmless and keeps the DP correct if that ever changes.
      if (id >= nIn && id < nIn + nOut) vec[id - nIn] = 1;
      const outs = outgoing.get(id) || [];
      for (let k = 0; k < outs.length; k++) {
        const c = outs[k];
        if (!c.enabled) continue;
        const w = Math.abs(c.weight);
        if (!(w > 0) || !isFinite(w)) continue;
        const b = backOf(c.to);
        for (let o = 0; o < nOut; o++) vec[o] += w * b[o];
      }
      back.set(id, vec);
    }
    const rows = new Array(nIn);
    const rowTotals = new Float64Array(nIn);
    const colTotals = new Float64Array(nOut);
    for (let i = 0; i < nIn; i++) {
      const v = backOf(i);
      const row = new Float64Array(nOut);
      for (let o = 0; o < nOut; o++) {
        const x = isFinite(v[o]) ? v[o] : 0;
        row[o] = x;
        rowTotals[i] += x;
        colTotals[o] += x;
      }
      rows[i] = row;
    }
    return {
      numInputs: nIn, numOutputs: nOut,
      rows: rows, rowTotals: rowTotals, colTotals: colTotals,
    };
  }

  // Per-output (column) normalisation: each action's column sums to 1, so a
  // ribbon width reads as "share of THIS action's drive". Columns with zero
  // total (a dead output with no live input path) stay all-zero.
  function normalizePerOutput(m) {
    if (!m) return null;
    const nIn = m.numInputs, nOut = m.numOutputs;
    const rows = new Array(nIn);
    const rowTotals = new Float64Array(nIn);
    for (let i = 0; i < nIn; i++) {
      const src = m.rows[i], dst = new Float64Array(nOut);
      for (let o = 0; o < nOut; o++) {
        dst[o] = m.colTotals[o] > 0 ? src[o] / m.colTotals[o] : 0;
        rowTotals[i] += dst[o];
      }
      rows[i] = dst;
    }
    const colTotals = new Float64Array(nOut);
    for (let o = 0; o < nOut; o++) colTotals[o] = m.colTotals[o] > 0 ? 1 : 0;
    return {
      numInputs: nIn, numOutputs: nOut,
      rows: rows, rowTotals: rowTotals, colTotals: colTotals,
    };
  }

  // ---------- labels ----------
  // Both resolvers read the SETUP's own vocabulary. Inputs already have it
  // everywhere (observationLabels / observationAbbr — the same arrays the
  // network panel and its hover tooltip use). Actions have it on every
  // multi-action setup; single-action setups are all cart-command scenes, so
  // the fallback names the thing rather than inventing "output 0".

  function inputLabelsFor(setup, numInputs) {
    const abbrSrc = (setup && setup.observationAbbr) || null;
    const fullSrc = (setup && setup.observationLabels) || null;
    const abbr = new Array(numInputs), full = new Array(numInputs);
    for (let i = 0; i < numInputs; i++) {
      abbr[i] = (abbrSrc && abbrSrc[i] != null) ? String(abbrSrc[i]) : ('i' + i);
      full[i] = (fullSrc && fullSrc[i] != null) ? String(fullSrc[i]) : ('obs ' + i + ' (unlabeled)');
    }
    return { abbr: abbr, full: full };
  }

  function actionLabelsFor(setup, numOutputs) {
    const abbrSrc = (setup && setup.actionAbbr) || null;
    const fullSrc = (setup && setup.actionLabels) || null;
    const abbr = new Array(numOutputs), full = new Array(numOutputs);
    for (let o = 0; o < numOutputs; o++) {
      if (abbrSrc && abbrSrc[o] != null) abbr[o] = String(abbrSrc[o]);
      else if (numOutputs === 1) abbr[o] = 'cart';
      else abbr[o] = 'a' + o;
      if (fullSrc && fullSrc[o] != null) full[o] = String(fullSrc[o]);
      else if (numOutputs === 1) full[o] = 'cart command';
      else full[o] = 'action ' + o;
    }
    return { abbr: abbr, full: full };
  }

  // ---------- layout ----------
  // Pure geometry, separated from painting so it can be asserted headlessly.
  // Angles use canvas convention (0 = +x, growing clockwise on a y-down
  // canvas): inputs occupy the LEFT half arc, actions the RIGHT half.
  function computeLayout(norm, opts) {
    opts = opts || {};
    const maxInputs = opts.maxInputs || DEFAULT_MAX_INPUTS;
    const eps = opts.ribbonEps != null ? opts.ribbonEps : RIBBON_EPS;
    const w = opts.width, h = opts.height;
    const nOut = norm.numOutputs;

    // --- pick which inputs get their own slice ---
    const idxs = [];
    for (let i = 0; i < norm.numInputs; i++) idxs.push(i);
    idxs.sort((a, b) => norm.rowTotals[b] - norm.rowTotals[a] || a - b);
    const kept = [];
    for (let k = 0; k < idxs.length && kept.length < maxInputs; k++) {
      if (norm.rowTotals[idxs[k]] > 0) kept.push(idxs[k]);
    }
    // Aggregate every remaining input into one "other" slice so the columns
    // still sum to 1 (a truncated picture that silently loses mass would lie
    // about how concentrated the drive is).
    const otherRow = new Float64Array(nOut);
    let otherCount = 0, otherTotal = 0;
    const keptSet = new Set(kept);
    for (let i = 0; i < norm.numInputs; i++) {
      if (keptSet.has(i)) continue;
      if (!(norm.rowTotals[i] > 0)) continue;
      otherCount++;
      otherTotal += norm.rowTotals[i];
      for (let o = 0; o < nOut; o++) otherRow[o] += norm.rows[i][o];
    }

    const sources = kept.map(i => ({
      inputIndex: i, isOther: false, row: norm.rows[i], total: norm.rowTotals[i],
    }));
    if (otherCount > 0) {
      sources.push({ inputIndex: -1, isOther: true, otherCount: otherCount, row: otherRow, total: otherTotal });
    }

    const totalMass = sources.reduce((s, x) => s + x.total, 0);
    const cx = w / 2, cy = h / 2;
    const pad = 46;                                  // room for the labels
    const R = Math.max(24, Math.min(w, h) / 2 - pad);
    const arcR = R;                                  // group arc radius
    const ribbonR = R - 9;                           // ribbons start inside it

    const layout = {
      cx: cx, cy: cy, R: R, arcR: arcR, ribbonR: ribbonR,
      inputArcs: [], outputArcs: [], ribbons: [],
      totalMass: totalMass, otherCount: otherCount,
      keptInputs: kept.slice(),
    };
    if (!(totalMass > 0)) return layout;

    // --- group arcs ---
    // Left half for inputs (π/2 → 3π/2), right half for actions
    // (3π/2 → 5π/2 ≡ -π/2 → π/2). Both walk clockwise in canvas space so
    // arc()/quadraticCurveTo ribbon construction stays direction-safe.
    const GAP = 0.06;                                 // radians between slices
    function layGroup(items, startAngle, endAngle, massTotal, minSweep) {
      const n = items.length;
      const span = (endAngle - startAngle) - GAP * n;
      let sweeps = items.map(it => (massTotal > 0 ? Math.max(0, span * it.total / massTotal) : 0));
      // Raise below-floor slices to the floor, paying for it out of the
      // above-floor ones. Iterated because rescaling can push a previously
      // above-floor slice under it; four passes settle every real case and
      // the equal-split branch below is the hard backstop.
      const floor = Math.min(minSweep || 0, n > 0 ? span / n : 0);
      if (floor > 0) {
        for (let iter = 0; iter < 4; iter++) {
          let need = 0, pool = 0, anyBelow = false;
          for (let k = 0; k < n; k++) {
            if (sweeps[k] < floor) { need += floor - sweeps[k]; anyBelow = true; }
            else pool += sweeps[k];
          }
          if (!anyBelow) break;
          if (pool <= need) { sweeps = sweeps.map(() => span / n); break; }
          const scale = (pool - need) / pool;
          for (let k = 0; k < n; k++) {
            if (sweeps[k] < floor) sweeps[k] = floor;
            else sweeps[k] *= scale;
          }
        }
      }
      const out = [];
      let a = startAngle + GAP / 2;
      for (let k = 0; k < n; k++) {
        out.push({ a0: a, a1: a + sweeps[k], item: items[k] });
        a += sweeps[k] + GAP;
      }
      return out;
    }
    // Actions carry equal mass by construction (each normalised column sums
    // to 1, or 0 for a dead output).
    const outItems = [];
    for (let o = 0; o < nOut; o++) outItems.push({ outputIndex: o, total: norm.colTotals[o] });
    const outMass = outItems.reduce((s, x) => s + x.total, 0);

    // Actions are ≤9 everywhere and already carry equal mass, so they need no
    // legibility floor; inputs do.
    layout.inputArcs = layGroup(sources, Math.PI / 2, Math.PI * 1.5, totalMass,
      opts.minInputSweep != null ? opts.minInputSweep : MIN_INPUT_SWEEP);
    layout.outputArcs = layGroup(outItems, -Math.PI / 2, Math.PI / 2, outMass, 0);

    // --- ribbons ---
    // Each side's slice is subdivided in the same order so ribbons never
    // cross within a slice.
    const srcCursor = layout.inputArcs.map(s => s.a0);
    const dstCursor = layout.outputArcs.map(s => s.a0);
    for (let s = 0; s < sources.length; s++) {
      const srcArc = layout.inputArcs[s];
      const srcSpan = srcArc.a1 - srcArc.a0;
      for (let o = 0; o < nOut; o++) {
        const v = sources[s].row[o];
        if (!(v > 0)) continue;
        // Two-sided significance (see RIBBON_EPS): a share of the action it
        // feeds, OR a share of what this input does.
        const shareOfAction = norm.colTotals[o] > 0 ? v / norm.colTotals[o] : 0;
        const shareOfInput = sources[s].total > 0 ? v / sources[s].total : 0;
        if (shareOfAction < eps && shareOfInput < eps) continue;
        const dstArc = layout.outputArcs[o];
        const dstSpan = dstArc.a1 - dstArc.a0;
        const sFrac = sources[s].total > 0 ? v / sources[s].total : 0;
        const dFrac = norm.colTotals[o] > 0 ? v / norm.colTotals[o] : 0;
        const a0 = srcCursor[s], a1 = a0 + srcSpan * sFrac;
        const b0 = dstCursor[o], b1 = b0 + dstSpan * dFrac;
        srcCursor[s] = a1;
        dstCursor[o] = b1;
        layout.ribbons.push({
          sourceSlice: s, inputIndex: sources[s].inputIndex, isOther: !!sources[s].isOther,
          outputIndex: o, value: v, a0: a0, a1: a1, b0: b0, b1: b1,
        });
      }
    }
    return layout;
  }

  // Hue ramp across the input slices — colour identifies the SOURCE, which is
  // what makes a chord readable at a glance ("all the mint ribbons come from
  // cart-x"). "other" is neutral grey so it never reads as a real signal.
  function sliceColor(sliceIndex, sliceCount, isOther) {
    if (isOther) return [120, 128, 148];
    const t = sliceCount > 1 ? sliceIndex / sliceCount : 0;
    const hue = 190 + t * 260;                       // blue → magenta → amber
    return hslToRgb(hue % 360, 0.62, 0.62);
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';

  // ---------- renderer ----------
  function make(canvas) {
    const ctx = canvas.getContext('2d');
    let lastLayout = null;
    let lastInfo = null;

    function frame() {
      // BF.util.fitCanvas is the same DPR fit every other panel uses, so the
      // chord scales identically on hi-dpi.
      return BF.util.fitCanvas(canvas);
    }

    function placeholder(text, sub) {
      const f = frame();
      ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
      ctx.clearRect(0, 0, f.cssW, f.cssH);
      ctx.fillStyle = '#11141b';
      ctx.fillRect(0, 0, f.cssW, f.cssH);
      ctx.fillStyle = 'rgba(154,163,187,0.8)';
      ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, f.cssW / 2, f.cssH / 2 - (sub ? 8 : 0));
      if (sub) {
        ctx.fillStyle = 'rgba(154,163,187,0.5)';
        ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
        ctx.fillText(sub, f.cssW / 2, f.cssH / 2 + 9);
      }
      lastLayout = null;
    }

    return {
      lastLayout: () => lastLayout,
      lastInfo: () => lastInfo,
      // genome: the champion NEAT genome. opts.setup supplies the labels;
      // opts.maxInputs / opts.ribbonEps override the readability caps.
      draw(genome, opts) {
        opts = opts || {};
        const raw = influenceMatrix(genome);
        if (!raw) {
          lastInfo = null;
          placeholder('No graph policy to analyse',
            'CNN and analytic controllers have no per-input weight paths');
          return null;
        }
        const norm = normalizePerOutput(raw);
        let live = 0;
        for (let o = 0; o < norm.numOutputs; o++) if (norm.colTotals[o] > 0) live++;
        if (live === 0) {
          lastInfo = { numInputs: norm.numInputs, numOutputs: norm.numOutputs, ribbonCount: 0 };
          placeholder('No enabled input → action paths yet',
            'every connection into the outputs is disabled or zero-weight');
          return null;
        }
        const setup = opts.setup || null;
        const inLab = inputLabelsFor(setup, norm.numInputs);
        const outLab = actionLabelsFor(setup, norm.numOutputs);
        const f = frame();
        const layout = computeLayout(norm, {
          width: f.cssW, height: f.cssH,
          maxInputs: opts.maxInputs, ribbonEps: opts.ribbonEps,
        });
        lastLayout = layout;
        lastInfo = {
          numInputs: norm.numInputs, numOutputs: norm.numOutputs,
          ribbonCount: layout.ribbons.length, otherCount: layout.otherCount,
        };

        ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
        ctx.clearRect(0, 0, f.cssW, f.cssH);
        ctx.fillStyle = '#11141b';
        ctx.fillRect(0, 0, f.cssW, f.cssH);

        const cx = layout.cx, cy = layout.cy;
        const rr = layout.ribbonR;
        const nSlices = layout.inputArcs.length;

        // Ribbons first, so the group arcs and labels sit on top.
        for (const rb of layout.ribbons) {
          const col = sliceColor(rb.sourceSlice, nSlices, rb.isOther);
          ctx.beginPath();
          ctx.arc(cx, cy, rr, rb.a0, rb.a1, false);
          ctx.quadraticCurveTo(cx, cy, cx + rr * Math.cos(rb.b1), cy + rr * Math.sin(rb.b1));
          ctx.arc(cx, cy, rr, rb.b1, rb.b0, true);
          ctx.quadraticCurveTo(cx, cy, cx + rr * Math.cos(rb.a0), cy + rr * Math.sin(rb.a0));
          ctx.closePath();
          // Alpha tracks the ribbon's share so a dominant path reads as
          // dominant even where two ribbons have similar width.
          ctx.fillStyle = rgba(col, 0.20 + 0.55 * Math.min(1, rb.value * 2));
          ctx.fill();
          ctx.strokeStyle = rgba(col, 0.35);
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Group arcs.
        ctx.lineWidth = 8;
        ctx.lineCap = 'butt';
        for (let s = 0; s < layout.inputArcs.length; s++) {
          const a = layout.inputArcs[s];
          if (a.a1 - a.a0 <= 0) continue;
          ctx.beginPath();
          ctx.strokeStyle = rgba(sliceColor(s, nSlices, a.item.isOther), 0.92);
          ctx.arc(cx, cy, layout.arcR, a.a0, a.a1, false);
          ctx.stroke();
        }
        for (let o = 0; o < layout.outputArcs.length; o++) {
          const a = layout.outputArcs[o];
          if (a.a1 - a.a0 <= 0) continue;
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(230,233,242,0.75)';
          ctx.arc(cx, cy, layout.arcR, a.a0, a.a1, false);
          ctx.stroke();
        }

        // Labels — the setup's OWN vocabulary on both sides.
        ctx.font = '9px -apple-system, "SF Mono", "Segoe UI", monospace';
        ctx.textBaseline = 'middle';
        const lr = layout.arcR + 7;
        for (let s = 0; s < layout.inputArcs.length; s++) {
          const a = layout.inputArcs[s];
          if (a.a1 - a.a0 <= 0.012) continue;          // too thin to label legibly
          const mid = (a.a0 + a.a1) / 2;
          const it = a.item;
          const text = it.isOther
            ? ('+' + it.otherCount + ' more')
            : inLab.abbr[it.inputIndex];
          ctx.fillStyle = it.isOther ? 'rgba(154,163,187,0.7)' : rgba(sliceColor(s, nSlices, false), 0.95);
          ctx.textAlign = 'right';
          ctx.fillText(text, cx + lr * Math.cos(mid), cy + lr * Math.sin(mid));
        }
        ctx.fillStyle = 'rgba(230,233,242,0.85)';
        ctx.textAlign = 'left';
        for (let o = 0; o < layout.outputArcs.length; o++) {
          const a = layout.outputArcs[o];
          if (a.a1 - a.a0 <= 0.012) continue;
          const mid = (a.a0 + a.a1) / 2;
          ctx.fillText(outLab.abbr[o], cx + lr * Math.cos(mid), cy + lr * Math.sin(mid));
        }

        // Corner captions: which side is which, and the dominant driver.
        ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(154,163,187,0.6)';
        ctx.fillText('inputs', 6, 6);
        ctx.textAlign = 'right';
        ctx.fillText('actions', f.cssW - 6, 6);
        // Strongest single input→action link, in plain words. Deliberately
        // the strongest NAMED input: "+N more → my 95%" is true on a wide
        // encoding but says nothing you can act on.
        let top = null;
        for (const rb of layout.ribbons) {
          if (rb.isOther) continue;
          if (!top || rb.value > top.value) top = rb;
        }
        if (top) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(154,163,187,0.75)';
          const pct = top.value * 100;
          ctx.fillText('strongest: ' + inLab.abbr[top.inputIndex] + ' → ' +
                       outLab.abbr[top.outputIndex] + '  ' +
                       (pct >= 1 ? Math.round(pct) : pct.toFixed(2)) + '% of that action',
                       6, f.cssH - 5);
        }
        return layout;
      },
      // Exposed so the panel can show a placeholder without a genome.
      placeholder: placeholder,
    };
  }

  BF.chord = {
    influenceMatrix, normalizePerOutput, computeLayout,
    inputLabelsFor, actionLabelsFor,
    RIBBON_EPS, DEFAULT_MAX_INPUTS, MIN_INPUT_SWEEP,
  };
  BF.chordRenderer = { make };
})(window.BF = window.BF || {});
