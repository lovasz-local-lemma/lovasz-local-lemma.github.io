// Animating the Fusion Principle on the board itself.
//
// The reduction is a sequence of graph surgeries, and each one is visible:
// cycles light up, the vertices on a cycle physically travel together into a
// single point, the edges swallowed by that contraction curl into loops, and
// what is left is a bamboo forest carrying the answer. Watching it is the
// argument — you can see why the search was never necessary.
//
// The geometry is a pure function of (position, fusion result, progress), so it
// can be tested without a browser; only playFusionReduction touches the DOM.

const NS = "http://www.w3.org/2000/svg";

/** Where each fused blob collapses to: the centroid of its member vertices. */
export function blobCentroids(position, fused) {
  const sums = new Map();
  for (const node of position.nodes) {
    const blob = fused.repByNodeId[node.id];
    if (!blob) continue;
    const acc = sums.get(blob) ?? { x: 0, y: 0, n: 0 };
    acc.x += node.x;
    acc.y += node.y;
    acc.n += 1;
    sums.set(blob, acc);
  }
  const centroids = new Map();
  for (const [blob, acc] of sums) centroids.set(blob, { x: acc.x / acc.n, y: acc.y / acc.n });
  return centroids;
}

/**
 * Node and edge geometry part-way through the contraction.
 * progress 0 = the original board, 1 = fully fused.
 */
export function fusionGeometryAt(position, fused, progress) {
  const p = Math.max(0, Math.min(1, progress));
  const centroids = blobCentroids(position, fused);
  const cycleEdges = new Set(fused.cycleEdgeIds ?? []);
  const nodes = position.nodes.map((node) => {
    const blob = fused.repByNodeId[node.id];
    const target = blob ? centroids.get(blob) : null;
    return {
      id: node.id,
      blob: blob ?? null,
      ground: Boolean(node.ground),
      x: target ? node.x + (target.x - node.x) * p : node.x,
      y: target ? node.y + (target.y - node.y) * p : node.y,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = position.edges.map((edge) => {
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    const sameBlob = a?.blob && a.blob === b?.blob;
    return {
      id: edge.id,
      ax: a?.x ?? 0,
      ay: a?.y ?? 0,
      bx: b?.x ?? 0,
      by: b?.y ?? 0,
      onCycle: cycleEdges.has(edge.id),
      // An edge whose endpoints share a blob is being swallowed: by the end of
      // the contraction it is a loop, not a connection.
      becomesLoop: Boolean(sameBlob),
    };
  });
  return { nodes, edges, centroids };
}

const PHASES = [
  { key: "cycles", until: 0.22, caption: "Edges on a cycle — these are what may fuse" },
  { key: "fuse", until: 0.62, caption: "Vertices sharing a cycle travel to one point" },
  { key: "loops", until: 0.8, caption: "Swallowed edges become loops, each worth one green edge" },
  { key: "value", until: 1, caption: "What remains is bamboo: nim-add the branches" },
];

export function phaseAt(t) {
  return PHASES.find((phase) => t <= phase.until) ?? PHASES[PHASES.length - 1];
}

/**
 * Play the reduction into an overlay SVG. Returns a cancel function.
 * `onPhase(caption)` is called whenever the narration changes.
 */
export function playFusionReduction(svgEl, position, fused, options = {}) {
  const duration = options.duration ?? 5200;
  const onPhase = options.onPhase ?? (() => {});
  const reduce = options.reduceMotion ?? false;

  const edgeLayer = document.createElementNS(NS, "g");
  const nodeLayer = document.createElementNS(NS, "g");
  const loopLayer = document.createElementNS(NS, "g");
  svgEl.append(edgeLayer, loopLayer, nodeLayer);

  const edgeEls = new Map();
  for (const edge of position.edges) {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("stroke", "var(--green)");
    line.setAttribute("stroke-width", "4");
    line.setAttribute("stroke-linecap", "round");
    edgeLayer.appendChild(line);
    edgeEls.set(edge.id, line);
  }
  const nodeEls = new Map();
  for (const node of position.nodes) {
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", node.ground ? "9" : "7");
    circle.setAttribute("fill", node.ground ? "var(--amber)" : "var(--teal)");
    nodeLayer.appendChild(circle);
    nodeEls.set(node.id, circle);
  }

  let cancelled = false;
  let lastPhase = null;
  const start = performance.now();

  function draw(t) {
    const geom = fusionGeometryAt(position, fused, Math.min(t / 0.62, 1));
    for (const edge of geom.edges) {
      const el = edgeEls.get(edge.id);
      if (!el) continue;
      el.setAttribute("x1", edge.ax);
      el.setAttribute("y1", edge.ay);
      el.setAttribute("x2", edge.bx);
      el.setAttribute("y2", edge.by);
      // Before the contraction starts, cycle edges glow to show what will fuse.
      const highlight = t < 0.22 && edge.onCycle;
      el.setAttribute("stroke", highlight ? "var(--amber)" : "var(--green)");
      el.setAttribute("stroke-width", highlight ? "6" : "4");
      el.setAttribute("opacity", edge.becomesLoop && t > 0.62 ? "0" : "1");
    }
    for (const node of geom.nodes) {
      const el = nodeEls.get(node.id);
      if (!el) continue;
      el.setAttribute("cx", node.x);
      el.setAttribute("cy", node.y);
    }
    // Loops appear once the contraction has finished.
    loopLayer.textContent = "";
    if (t > 0.62) {
      const grow = Math.min((t - 0.62) / 0.18, 1);
      for (const group of fused.fusedGroups ?? []) {
        const centre = geom.centroids.get(group.name);
        if (!centre || !group.loops) continue;
        for (let i = 0; i < group.loops; i += 1) {
          const angle = (i / group.loops) * Math.PI * 2 - Math.PI / 2;
          const loop = document.createElementNS(NS, "circle");
          loop.setAttribute("cx", centre.x + Math.cos(angle) * 16);
          loop.setAttribute("cy", centre.y + Math.sin(angle) * 16);
          loop.setAttribute("r", String(7 * grow));
          loop.setAttribute("fill", "none");
          loop.setAttribute("stroke", "var(--green)");
          loop.setAttribute("stroke-width", "3");
          loopLayer.appendChild(loop);
        }
      }
    }
    const phase = phaseAt(t);
    if (phase.key !== lastPhase) {
      lastPhase = phase.key;
      onPhase(phase.caption, phase.key);
    }
  }

  if (reduce) {
    draw(1);
    onPhase(PHASES[PHASES.length - 1].caption, "value");
    return () => { cancelled = true; };
  }

  function step(now) {
    if (cancelled) return;
    const t = Math.min((now - start) / duration, 1);
    draw(t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return () => { cancelled = true; };
}
