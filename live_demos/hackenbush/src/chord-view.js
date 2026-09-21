// Circular chord / ribbon diagrams.
//
// A Hackenbush position IS a graph, and on the denser boss meshes the board
// drawing turns into a tangle. A chord diagram re-reads the same data as a
// circle of endpoints joined by ribbons, which stays legible however knotted
// the board gets — and the same layout doubles as a distribution view.
//
// Self-contained SVG: no d3, no layout library.

const TAU = Math.PI * 2;

function polar(radius, angle) {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

const fmt = (n) => (Math.abs(n) < 1e-6 ? "0" : n.toFixed(2));

// Annulus sector — the band that represents one group on the rim.
function arcBand(inner, outer, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(outer, a0);
  const [x1, y1] = polar(outer, a1);
  const [x2, y2] = polar(inner, a1);
  const [x3, y3] = polar(inner, a0);
  return `M${fmt(x0)},${fmt(y0)} A${outer},${outer} 0 ${large} 1 ${fmt(x1)},${fmt(y1)}`
    + ` L${fmt(x2)},${fmt(y2)} A${inner},${inner} 0 ${large} 0 ${fmt(x3)},${fmt(y3)} Z`;
}

// The classic chord ribbon: follow the source arc, sweep through the middle to
// the target arc, follow it, and sweep back. Both sweeps use the circle centre
// as the control point, which is what gives a chord diagram its pinched waist.
function ribbonPath(radius, s0, s1, t0, t1) {
  const [x0, y0] = polar(radius, s0);
  const [x1, y1] = polar(radius, s1);
  const [x2, y2] = polar(radius, t0);
  const [x3, y3] = polar(radius, t1);
  const largeS = s1 - s0 > Math.PI ? 1 : 0;
  const largeT = t1 - t0 > Math.PI ? 1 : 0;
  return `M${fmt(x0)},${fmt(y0)}`
    + ` A${radius},${radius} 0 ${largeS} 1 ${fmt(x1)},${fmt(y1)}`
    + ` Q0,0 ${fmt(x2)},${fmt(y2)}`
    + ` A${radius},${radius} 0 ${largeT} 1 ${fmt(x3)},${fmt(y3)}`
    + ` Q0,0 ${fmt(x0)},${fmt(y0)} Z`;
}

// Give every group an arc proportional to the traffic through it, then hand out
// a sub-slot on each end for every ribbon.
function layout(groups, links, padAngle) {
  const totals = new Map(groups.map((g) => [g.id, 0]));
  for (const link of links) {
    if (!totals.has(link.source) || !totals.has(link.target)) continue;
    totals.set(link.source, totals.get(link.source) + link.value);
    totals.set(link.target, totals.get(link.target) + link.value);
  }
  const present = groups.filter((g) => totals.get(g.id) > 0);
  const sum = present.reduce((acc, g) => acc + totals.get(g.id), 0);
  if (!present.length || sum <= 0) return null;
  const scale = (TAU - padAngle * present.length) / sum;

  let angle = -Math.PI / 2;
  const arcs = new Map();
  for (const group of present) {
    const span = totals.get(group.id) * scale;
    arcs.set(group.id, { group, start: angle, end: angle + span, cursor: angle });
    angle += span + padAngle;
  }
  const ribbons = [];
  for (const link of links) {
    const source = arcs.get(link.source);
    const target = arcs.get(link.target);
    if (!source || !target) continue;
    const span = link.value * scale;
    const s0 = source.cursor; source.cursor += span;
    const t0 = target.cursor; target.cursor += span;
    ribbons.push({ ...link, s0, s1: s0 + span, t0, t1: t0 + span });
  }
  return { arcs: [...arcs.values()], ribbons };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Render a chord diagram to an SVG string.
 * groups: [{ id, label, color }]
 * links:  [{ source, target, value, color, title }]
 */
export function chordSVG(groups, links, options = {}) {
  const size = options.size ?? 420;
  const labelRoom = options.labelRoom ?? 54;
  const outer = size / 2 - labelRoom;
  const inner = outer - (options.bandWidth ?? 11);
  const placed = layout(groups, links, options.padAngle ?? 0.035);
  if (!placed) {
    return `<svg viewBox="0 0 ${size} ${size}" class="chord-svg" role="img" aria-label="${esc(options.emptyLabel ?? "Nothing to show")}">
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" class="chord-empty">${esc(options.emptyLabel ?? "Nothing to show")}</text></svg>`;
  }

  const bands = placed.arcs.map((arc) => {
    const mid = (arc.start + arc.end) / 2;
    const [lx, ly] = polar(outer + 9, mid);
    const deg = (mid * 180) / Math.PI;
    const flip = deg > 90 || deg < -90;
    const rotate = flip ? deg + 180 : deg;
    return `<path d="${arcBand(inner, outer, arc.start, arc.end)}" fill="${arc.group.color}" class="chord-band" data-group="${esc(arc.group.id)}">
        <title>${esc(arc.group.label)}</title></path>
      <text x="${fmt(lx)}" y="${fmt(ly)}" class="chord-label" text-anchor="${flip ? "end" : "start"}"
        transform="rotate(${fmt(rotate)}, ${fmt(lx)}, ${fmt(ly)})" dominant-baseline="middle">${esc(arc.group.label)}</text>`;
  }).join("");

  // Widest ribbons first so thin ones stay visible on top.
  const ribbons = [...placed.ribbons]
    .sort((a, b) => (b.s1 - b.s0) - (a.s1 - a.s0))
    .map((r) => `<path d="${ribbonPath(inner - 1, r.s0, r.s1, r.t0, r.t1)}" fill="${r.color}"
      class="chord-ribbon"><title>${esc(r.title ?? "")}</title></path>`)
    .join("");

  return `<svg viewBox="${-size / 2} ${-size / 2} ${size} ${size}" class="chord-svg" role="img"
      aria-label="${esc(options.ariaLabel ?? "Chord diagram")}">
      <g class="chord-ribbons">${ribbons}</g>
      <g class="chord-bands">${bands}</g>
    </svg>`;
}

const COLORS = {
  blue: "var(--blue)",
  red: "var(--red)",
  green: "var(--green)",
  ground: "var(--amber)",
  node: "var(--teal)",
};

/**
 * Connections view — the board's own graph. Each node is a group on the rim and
 * each edge is a ribbon, coloured by which player may cut it. Parallel edges
 * stack into a thicker ribbon, so multi-edges read as weight rather than
 * overlapping curves the way they do on the board.
 */
export function buildConnectionsChord(position, options = {}) {
  const nodes = position?.nodes ?? [];
  const edges = position?.edges ?? [];
  const groups = nodes.map((n) => ({
    id: n.id,
    label: n.ground ? `${n.id} ⏚` : n.id,
    color: n.ground ? COLORS.ground : COLORS.node,
  }));
  const links = edges.map((e) => ({
    source: e.a,
    target: e.b,
    value: 1,
    color: COLORS[e.color] ?? COLORS.node,
    title: `${e.color} edge · ${e.a} — ${e.b}`,
  }));
  return chordSVG(groups, links, {
    ...options,
    ariaLabel: `Chord diagram of ${edges.length} edges between ${nodes.length} nodes`,
    emptyLabel: "No edges to connect",
  });
}

const OUTCOME_GROUPS = [
  { id: "out:L", label: "→ Blue wins", color: "var(--blue)" },
  { id: "out:R", label: "→ Red wins", color: "var(--red)" },
  { id: "out:N", label: "→ 1st player", color: "var(--amber)" },
  { id: "out:P", label: "→ 2nd player", color: "var(--teal)" },
];

/**
 * Distribution view — where each side's options lead. Every legal move becomes
 * a unit of flow from the player who owns it to the outcome class of the
 * position it produces, so the ribbon widths show at a glance how many of your
 * moves actually keep you winning.
 */
export function buildDistributionChord(analysis, options = {}) {
  const groups = [
    { id: "Blue", label: "Blue to move", color: "var(--blue)" },
    { id: "Red", label: "Red to move", color: "var(--red)" },
    ...OUTCOME_GROUPS,
  ];
  const links = [];
  const tally = new Map();
  for (const [player, moves] of [["Blue", analysis?.moves?.left], ["Red", analysis?.moves?.right]]) {
    for (const move of moves ?? []) {
      const outcome = move.resultingValue?.outcomeClass;
      if (!outcome) continue;
      const key = `${player}|out:${outcome}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of tally) {
    const [player, target] = key.split("|");
    links.push({
      source: player,
      target,
      value: count,
      color: player === "Blue" ? "var(--blue)" : "var(--red)",
      title: `${count} ${player} move${count === 1 ? "" : "s"} lead to ${OUTCOME_GROUPS.find((g) => g.id === target)?.label ?? target}`,
    });
  }
  return chordSVG(groups, links, {
    ...options,
    ariaLabel: "Chord diagram of where each side's moves lead",
    emptyLabel: "No scored moves",
  });
}
