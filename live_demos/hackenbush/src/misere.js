// Misère play for impartial (all-green) Hackenbush.
//
// Under misère rules the player who makes the LAST move LOSES. That single
// flip breaks almost everything convenient about normal play:
//
//   * A terminal position is a WIN for the player to move, because it was the
//     opponent who made the last move. So the recursion bottoms out at 1, not 0.
//   * Misère Grundy values DO NOT nim-add. In normal play the value of a sum is
//     the XOR of the parts; in misère play that is simply false, which is why
//     misère analysis needs quotient theory (Plambeck & Siegel) rather than a
//     single number. Everything here is therefore computed on the WHOLE
//     position by recursion — never by combining components.
//
// Because of that, this module deliberately reports only what it can compute
// exactly: the misère Grundy value of this position and who wins. It does not
// claim a genus symbol or a misère quotient.

const MISERE_BUDGET = 20000;

export class MisereBudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = "MisereBudgetError";
  }
}

// `stable` ("no-fall") edges are excluded for the same reason as in fusion:
// survivingEdges below prunes everything that loses its path to the ground,
// which is exactly the rule a stable edge suspends. Analysing such a position
// here would silently produce the wrong Grundy values.
function isImpartial(position) {
  const edges = position?.edges ?? [];
  return edges.length > 0
    && edges.every((e) => e.color === "green" && !e.infinite && !e.loop && !e.stable);
}

// Which edges still reach the ground once `removed` are gone.
function survivingEdges(position, removed) {
  const groundIds = new Set(position.nodes.filter((n) => n.ground).map((n) => n.id));
  const live = position.edges.filter((e) => !removed.has(e.id));
  const adjacency = new Map();
  for (const e of live) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a).push(e);
    adjacency.get(e.b).push(e);
  }
  const reached = new Set();
  const seenNodes = new Set();
  const queue = [...groundIds];
  for (const g of queue) seenNodes.add(g);
  while (queue.length) {
    const node = queue.pop();
    for (const e of adjacency.get(node) ?? []) {
      if (reached.has(e.id)) continue;
      reached.add(e.id);
      const other = e.a === node ? e.b : e.a;
      if (!seenNodes.has(other)) {
        seenNodes.add(other);
        queue.push(other);
      }
    }
  }
  return reached;
}

function mex(values) {
  const seen = new Set(values);
  let m = 0;
  while (seen.has(m)) m += 1;
  return m;
}

/**
 * Misère analysis of an impartial position. Returns null when the position is
 * not all-green (misère theory for partisan games is a different subject).
 * Throws MisereBudgetError if the search is too large — misère has no Fusion
 * shortcut, so this is a plain exponential walk.
 */
export function misereAnalysis(position) {
  if (!isImpartial(position)) return null;
  const allIds = position.edges.map((e) => e.id);
  const memoNormal = new Map();
  const memoMisere = new Map();
  let visits = 0;

  const keyOf = (alive) => allIds.filter((id) => alive.has(id)).join(",");

  function grundy(alive, memo, terminalValue) {
    if (alive.size === 0) return terminalValue;
    const key = keyOf(alive);
    if (memo.has(key)) return memo.get(key);
    visits += 1;
    if (visits > MISERE_BUDGET) {
      throw new MisereBudgetError("Misère search exceeded its budget — misère play has no Fusion shortcut, so it stays exponential.");
    }
    const options = [];
    for (const id of alive) {
      const removed = new Set(allIds.filter((e) => !alive.has(e)));
      removed.add(id);
      const next = survivingEdges(position, removed);
      options.push(grundy(next, memo, terminalValue));
    }
    const value = mex(options);
    memo.set(key, value);
    return value;
  }

  const start = new Set(allIds);
  // Normal play bottoms out at 0 (no move = you lose); misère at 1 (no move = you win).
  const normal = grundy(start, memoNormal, 0);
  const misere = grundy(start, memoMisere, 1);

  return {
    normalGrundy: normal,
    misereGrundy: misere,
    normalLabel: normal === 0 ? "0" : `*${normal === 1 ? "" : normal}`,
    misereLabel: misere === 0 ? "0" : `*${misere === 1 ? "" : misere}`,
    // A nonzero Grundy value means the player to move wins, under both conventions.
    normalWinner: normal === 0 ? "second" : "first",
    misereWinner: misere === 0 ? "second" : "first",
    differs: (normal === 0) !== (misere === 0),
    states: memoNormal.size + memoMisere.size,
  };
}
