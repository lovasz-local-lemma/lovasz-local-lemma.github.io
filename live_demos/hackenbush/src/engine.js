import { fuseGreen, isAllGreen } from "./fusion.js";
const LEFT = "left";
const RIGHT = "right";

export const PLAYERS = {
  LEFT,
  RIGHT,
};

export const EDGE_COLORS = {
  LEFT: "blue",
  RIGHT: "red",
  NEUTRAL: "green",
};

export const DEFAULT_LIMITS = {
  maxPositions: 12000,
  maxSums: 12000,
};

const MAX_DISPLAY_CHARS = 4096;

export class AnalysisLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnalysisLimitError";
  }
}

class Rational {
  constructor(numerator, denominator = 1n) {
    if (denominator === 0n) {
      throw new Error("Denominator cannot be zero.");
    }

    let n = BigInt(numerator);
    let d = BigInt(denominator);

    if (d < 0n) {
      n = -n;
      d = -d;
    }

    const divisor = gcd(absBigInt(n), d);
    this.numerator = n / divisor;
    this.denominator = d / divisor;
  }

  static zero() {
    return new Rational(0n, 1n);
  }

  add(other) {
    return new Rational(
      (this.numerator * other.denominator) + (other.numerator * this.denominator),
      this.denominator * other.denominator,
    );
  }

  subtract(other) {
    return new Rational(
      (this.numerator * other.denominator) - (other.numerator * this.denominator),
      this.denominator * other.denominator,
    );
  }

  multiplyByInt(value) {
    return new Rational(this.numerator * BigInt(value), this.denominator);
  }

  divideByInt(value) {
    return new Rational(this.numerator, this.denominator * BigInt(value));
  }

  compare(other) {
    const left = this.numerator * other.denominator;
    const right = other.numerator * this.denominator;
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  }

  isInteger() {
    return this.denominator === 1n;
  }

  floorBigInt() {
    if (this.numerator >= 0n) {
      return this.numerator / this.denominator;
    }
    return -(((-this.numerator) + this.denominator - 1n) / this.denominator);
  }

  ceilBigInt() {
    if (this.numerator >= 0n) {
      return (this.numerator + this.denominator - 1n) / this.denominator;
    }
    return -((-this.numerator) / this.denominator);
  }

  toNumber() {
    return Number(this.numerator) / Number(this.denominator);
  }

  toString() {
    if (this.denominator === 1n) {
      return this.numerator.toString();
    }
    return `${this.numerator.toString()}/${this.denominator.toString()}`;
  }
}

class TransfiniteValue {
  constructor(omegaSquaredCoeff = 0n, omegaCoeff = 0n, finite = null) {
    this.omegaSquaredCoeff = BigInt(omegaSquaredCoeff); // coefficient of omega^2
    this.omegaCoeff = BigInt(omegaCoeff); // coefficient of omega
    this.finite = finite ?? Rational.zero(); // finite part (Rational)
  }

  static omega() { return new TransfiniteValue(0n, 1n); }
  static negOmega() { return new TransfiniteValue(0n, -1n); }
  static omegaSquared() { return new TransfiniteValue(1n, 0n); }
  static negOmegaSquared() { return new TransfiniteValue(-1n, 0n); }
  static fromRational(r) { return new TransfiniteValue(0n, 0n, r); }

  isFinite() { return this.omegaSquaredCoeff === 0n && this.omegaCoeff === 0n; }
  isInfinite() { return !this.isFinite(); }

  sign() {
    if (this.omegaSquaredCoeff !== 0n) {
      return this.omegaSquaredCoeff > 0n ? 1 : -1;
    }
    if (this.omegaCoeff !== 0n) {
      return this.omegaCoeff > 0n ? 1 : -1;
    }
    return this.finite.compare(Rational.zero());
  }

  isPositiveInfinite() {
    return this.isInfinite() && this.sign() > 0;
  }

  isNegativeInfinite() {
    return this.isInfinite() && this.sign() < 0;
  }

  add(other) {
    return new TransfiniteValue(
      this.omegaSquaredCoeff + other.omegaSquaredCoeff,
      this.omegaCoeff + other.omegaCoeff,
      this.finite.add(other.finite),
    );
  }

  negate() {
    return new TransfiniteValue(
      -this.omegaSquaredCoeff,
      -this.omegaCoeff,
      new Rational(-this.finite.numerator, this.finite.denominator),
    );
  }

  compare(other) {
    if (this.omegaSquaredCoeff !== other.omegaSquaredCoeff) {
      return this.omegaSquaredCoeff < other.omegaSquaredCoeff ? -1 : 1;
    }
    if (this.omegaCoeff !== other.omegaCoeff) {
      return this.omegaCoeff < other.omegaCoeff ? -1 : 1;
    }
    return this.finite.compare(other.finite);
  }

  toNumber() {
    if (this.sign() > 0 && this.isInfinite()) return Infinity;
    if (this.sign() < 0 && this.isInfinite()) return -Infinity;
    return this.finite.toNumber();
  }

  toString() {
    if (this.isFinite()) return this.finite.toString();

    const parts = [];
    const pushTerm = (coeff, symbol) => {
      if (coeff === 0n) return;
      if (coeff === 1n) parts.push(symbol);
      else if (coeff === -1n) parts.push(`-${symbol}`);
      else parts.push(`${coeff}${symbol}`);
    };

    pushTerm(this.omegaSquaredCoeff, "\u03C9\u00B2");
    pushTerm(this.omegaCoeff, "\u03C9");

    if (this.finite.compare(Rational.zero()) !== 0) {
      parts.push(this.finite.toString());
    }

    return parts.reduce((acc, part, index) => {
      if (index === 0) return part;
      return part.startsWith("-") ? `${acc}${part}` : `${acc}+${part}`;
    }, "");
  }
}

// ── Loopy games ────────────────────────────────────────────────────────────
// Represents named loopy values from Conway's loopy-game theory plus an
// optional finite shift. The five canonical kinds:
//   on     — Blue can play forever, Red has no moves (Blue always wins)
//   off    — mirror of on (Red always wins)
//   over   = { 0 | over }  positive loopy infinitesimal (> 0 but < any positive)
//   under  = { under | 0 } negative loopy infinitesimal (mirror)
//   dud    = { dud | dud } either side keeps the loop alive → outcome: draw
//
// Arithmetic:
//   dud + anything → dud     (draw absorbs)
//   on + off       → dud     (both perpetual → stalemate)
//   on + x         → on       for x ∈ {on, over, under, finite}
//   off + x        → off      for x ∈ {off, over, under, finite}
//   over + over    → over,  under + under → under
//   over + under   → 0        (cancels to finite)
//   finite shifts accumulate through all rules.
class LoopyValue {
  constructor(kind, finite = null) {
    this.kind = kind;
    this.finite = finite ?? Rational.zero();
  }

  static on(finite = null) { return new LoopyValue("on", finite); }
  static off(finite = null) { return new LoopyValue("off", finite); }
  static over(finite = null) { return new LoopyValue("over", finite); }
  static under(finite = null) { return new LoopyValue("under", finite); }
  static dud(finite = null) { return new LoopyValue("dud", finite); }

  negate() {
    const flip = { on: "off", off: "on", over: "under", under: "over", dud: "dud" };
    const negFinite = new Rational(-this.finite.numerator, this.finite.denominator);
    return new LoopyValue(flip[this.kind], negFinite);
  }

  addRational(r) {
    return new LoopyValue(this.kind, this.finite.add(r));
  }

  // Sum two LoopyValues. Returns LoopyValue, or { cancelled: true, finite }
  // when over+under cancels — caller converts to a plain finite result.
  addLoopy(other) {
    const combinedFinite = this.finite.add(other.finite);
    if (this.kind === "dud" || other.kind === "dud") {
      return LoopyValue.dud(combinedFinite);
    }
    const bothPerpetual = (a, b) => (a === "on" && b === "off") || (a === "off" && b === "on");
    if (bothPerpetual(this.kind, other.kind)) {
      return LoopyValue.dud(combinedFinite);
    }
    if (this.kind === "on" || other.kind === "on") {
      return LoopyValue.on(combinedFinite);
    }
    if (this.kind === "off" || other.kind === "off") {
      return LoopyValue.off(combinedFinite);
    }
    if (this.kind === "over" && other.kind === "over") {
      return LoopyValue.over(combinedFinite);
    }
    if (this.kind === "under" && other.kind === "under") {
      return LoopyValue.under(combinedFinite);
    }
    return { cancelled: true, finite: combinedFinite };
  }

  // Compare against a finite Rational → -1, 0, 1, or null (incomparable).
  compareToRational(r) {
    if (this.kind === "on") return 1;
    if (this.kind === "off") return -1;
    if (this.kind === "dud") return null;
    const shiftCmp = this.finite.compare(r);
    if (shiftCmp !== 0) return shiftCmp;
    if (this.kind === "over") return 1;
    if (this.kind === "under") return -1;
    return null;
  }

  // Compare two LoopyValues → -1, 0, 1, or null (incomparable).
  compareLoopy(other) {
    if (this.kind === other.kind) {
      return this.finite.compare(other.finite);
    }
    if (this.kind === "dud" || other.kind === "dud") return null;
    if (this.kind === "on") return 1;
    if (other.kind === "on") return -1;
    if (this.kind === "off") return -1;
    if (other.kind === "off") return 1;
    return this.kind === "over" ? 1 : -1;
  }

  outcomeInfo() {
    const zero = Rational.zero();
    if (this.kind === "on") return { outcomeClass: "L", relation: "gt" };
    if (this.kind === "off") return { outcomeClass: "R", relation: "lt" };
    if (this.kind === "dud") return { outcomeClass: "D", relation: "draw" };
    if (this.kind === "over") {
      return this.finite.compare(zero) >= 0
        ? { outcomeClass: "L", relation: "gt" }
        : { outcomeClass: "N", relation: "fuzzy" };
    }
    if (this.kind === "under") {
      return this.finite.compare(zero) <= 0
        ? { outcomeClass: "R", relation: "lt" }
        : { outcomeClass: "N", relation: "fuzzy" };
    }
    return { outcomeClass: "N", relation: "fuzzy" };
  }

  toString() {
    const zero = Rational.zero();
    if (this.finite.compare(zero) === 0) return this.kind;
    if (this.finite.compare(zero) > 0) return `${this.kind}+${this.finite.toString()}`;
    return `${this.kind}${this.finite.toString()}`;
  }
}

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function gcd(a, b) {
  let x = BigInt(a);
  let y = BigInt(b);
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x === 0n ? 1n : x;
}

function nimberXor(left, right) {
  return Number(BigInt(left) ^ BigInt(right));
}

function transfiniteName(value) {
  const zero = Rational.zero();
  const finiteIsZero = value.finite.compare(zero) === 0;

  if (value.omegaSquaredCoeff === 1n && value.omegaCoeff === 0n && finiteIsZero) return "omega-squared";
  if (value.omegaSquaredCoeff === -1n && value.omegaCoeff === 0n && finiteIsZero) return "neg-omega-squared";
  if (value.omegaCoeff === 1n && value.omegaSquaredCoeff === 0n) {
    if (finiteIsZero) return "omega";
    const finiteLabel = value.finite.compare(zero) > 0
      ? value.finite.toString()
      : new Rational(-value.finite.numerator, value.finite.denominator).toString();
    return value.finite.compare(zero) > 0 ? `omega-plus-${finiteLabel}` : `omega-minus-${finiteLabel}`;
  }
  if (value.omegaCoeff === -1n && value.omegaSquaredCoeff === 0n) {
    if (finiteIsZero) return "neg-omega";
    const finiteLabel = value.finite.compare(zero) > 0
      ? value.finite.toString()
      : new Rational(-value.finite.numerator, value.finite.denominator).toString();
    return value.finite.compare(zero) > 0 ? `neg-omega-plus-${finiteLabel}` : `neg-omega-minus-${finiteLabel}`;
  }
  if (value.omegaSquaredCoeff === 0n && value.omegaCoeff > 1n && finiteIsZero) return `omega-times-${value.omegaCoeff}`;
  if (value.omegaSquaredCoeff === 0n && value.omegaCoeff < -1n && finiteIsZero) return `neg-omega-times-${-value.omegaCoeff}`;
  return value.toString();
}

function simplestIntegerBetween(lowerBound, upperBound) {
  let smallestAllowed = null;
  let largestAllowed = null;

  if (lowerBound !== null) {
    smallestAllowed = lowerBound.isInteger()
      ? lowerBound.floorBigInt() + 1n
      : lowerBound.ceilBigInt();
  }

  if (upperBound !== null) {
    largestAllowed = upperBound.isInteger()
      ? upperBound.ceilBigInt() - 1n
      : upperBound.floorBigInt();
  }

  if (smallestAllowed === null && largestAllowed === null) {
    return 0n;
  }

  if (smallestAllowed === null) {
    return largestAllowed;
  }

  if (largestAllowed === null) {
    return smallestAllowed;
  }

  if (smallestAllowed > largestAllowed) {
    return null;
  }

  if (smallestAllowed <= 0n && 0n <= largestAllowed) {
    return 0n;
  }

  if (smallestAllowed > 0n) {
    return smallestAllowed;
  }

  return largestAllowed;
}

function simplestNumberBetween(lowerBound, upperBound) {
  if (lowerBound !== null && upperBound !== null && lowerBound.compare(upperBound) >= 0) {
    throw new Error("Cannot find a simplest number inside an empty interval.");
  }

  const zero = Rational.zero();
  const containsZero = (lowerBound === null || lowerBound.compare(zero) < 0)
    && (upperBound === null || zero.compare(upperBound) < 0);

  if (containsZero) {
    return zero;
  }

  const integerCandidate = simplestIntegerBetween(lowerBound, upperBound);
  if (integerCandidate !== null) {
    return new Rational(integerCandidate, 1n);
  }

  const doubledLower = lowerBound ? lowerBound.multiplyByInt(2n) : null;
  const doubledUpper = upperBound ? upperBound.multiplyByInt(2n) : null;
  return simplestNumberBetween(doubledLower, doubledUpper).divideByInt(2n);
}

// Conway sign-expansion: a unique +/- string for every surreal number, derived
// from the construction path. At step k+1, we went `+` if the new candidate
// is greater than the previous candidate, `-` if less. The first step (day 1)
// is the first sign.
function signExpansionFromPath(path) {
  if (!path || path.length <= 1) return "";
  let signs = "";
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1].value;
    const cur = path[i].value;
    // Compare via Rational. Path entries have stringified values; reparse.
    const prevR = parseRational(prev);
    const curR = parseRational(cur);
    if (!prevR || !curR) break;
    const cmp = curR.compare(prevR);
    if (cmp > 0) signs += "+";
    else if (cmp < 0) signs += "-";
    else break; // duplicate / settled
  }
  return signs;
}

function parseRational(s) {
  if (s === undefined || s === null) return null;
  const str = String(s).trim();
  if (str === "" || str === "-") return null;
  if (str.includes("/")) {
    const [n, d] = str.split("/");
    try { return new Rational(BigInt(n), BigInt(d)); } catch { return null; }
  }
  try { return new Rational(BigInt(str)); } catch { return null; }
}

function surrealBirthdayExact(rational) {
  if (rational === null || rational.compare(Rational.zero()) === 0) {
    return 0;
  }
  if (rational.denominator === 1n) {
    return Number(absBigInt(rational.numerator));
  }
  const path = surrealConstructionPath(rational);
  return path.length > 0 ? path[path.length - 1].day : 0;
}

function surrealConstructionPath(rational) {
  const steps = [];
  if (rational === null) {
    return steps;
  }
  const zero = Rational.zero();
  steps.push({ day: 0, value: "0", left: "", right: "", description: "0 = { | }" });
  if (rational.compare(zero) === 0) {
    return steps;
  }
  let lower = null;
  let upper = null;
  if (rational.compare(zero) > 0) {
    upper = null;
    lower = zero;
  } else {
    lower = null;
    upper = zero;
  }
  for (let day = 1; day <= 64; day += 1) {
    const candidate = simplestNumberBetween(lower, upper);
    const leftStr = lower !== null ? lower.toString() : "";
    const rightStr = upper !== null ? upper.toString() : "";
    steps.push({
      day,
      value: candidate.toString(),
      left: leftStr,
      right: rightStr,
      description: `${candidate.toString()} = { ${leftStr} | ${rightStr} }`,
    });
    if (candidate.compare(rational) === 0) {
      break;
    }
    if (candidate.compare(rational) < 0) {
      lower = candidate;
    } else {
      upper = candidate;
    }
  }
  return steps;
}

function compareRationals(a, b) {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a.compare(b);
}

function playableBy(color, player) {
  if (color === EDGE_COLORS.NEUTRAL) {
    return true;
  }
  if (player === LEFT) {
    return color === EDGE_COLORS.LEFT;
  }
  return color === EDGE_COLORS.RIGHT;
}

function colorTitle(color) {
  if (color === EDGE_COLORS.LEFT) {
    return "Blue";
  }
  if (color === EDGE_COLORS.RIGHT) {
    return "Red";
  }
  return "Green";
}

function cloneNode(node) {
  return {
    id: node.id,
    x: typeof node.x === "number" ? node.x : 0,
    y: typeof node.y === "number" ? node.y : 0,
    ground: Boolean(node.ground),
  };
}

function cloneEdge(edge) {
  return {
    id: edge.id,
    a: edge.a,
    b: edge.b,
    color: edge.color,
    stable: Boolean(edge.stable),
    infinite: Boolean(edge.infinite),
    loop: Boolean(edge.loop),
    loopKind: edge.loopKind || null,
    pattern: edge.pattern || null,
  };
}

export function clonePosition(position) {
  return {
    nodes: (position.nodes ?? []).map(cloneNode),
    edges: (position.edges ?? []).map(cloneEdge),
  };
}

function positionNodesById(position) {
  const nodes = new Map();
  for (const node of position.nodes) {
    nodes.set(node.id, node);
  }
  return nodes;
}

function buildAdjacency(position) {
  const adjacency = new Map();
  for (const node of position.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of position.edges) {
    if (!adjacency.has(edge.a) || !adjacency.has(edge.b)) {
      continue;
    }
    adjacency.get(edge.a).push(edge);
    if (edge.b !== edge.a) {
      adjacency.get(edge.b).push(edge);
    }
  }

  return adjacency;
}

function survivingEdgeIds(position) {
  const nodes = positionNodesById(position);
  const adjacency = buildAdjacency(position);
  const visitedNodes = new Set();
  const reachableEdges = new Set();
  const queue = [];

  for (const node of position.nodes) {
    if (node.ground) {
      visitedNodes.add(node.id);
      queue.push(node.id);
    }
  }

  for (const edge of position.edges) {
    if (edge.stable) {
      if (!visitedNodes.has(edge.a)) {
        visitedNodes.add(edge.a);
        queue.push(edge.a);
      }
      if (!visitedNodes.has(edge.b)) {
        visitedNodes.add(edge.b);
        queue.push(edge.b);
      }
      reachableEdges.add(edge.id);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const incident = adjacency.get(nodeId) ?? [];
    for (const edge of incident) {
      reachableEdges.add(edge.id);
      const other = edge.a === nodeId ? edge.b : edge.a;
      if (!visitedNodes.has(other)) {
        visitedNodes.add(other);
        queue.push(other);
      }
    }
  }

  if (visitedNodes.size === 0) {
    return new Set(position.edges.filter((edge) => edge.stable).map((edge) => edge.id));
  }

  return reachableEdges;
}

function pruneUnsupported(position) {
  const keepEdgeIds = survivingEdgeIds(position);
  const keptEdges = position.edges.filter((edge) => keepEdgeIds.has(edge.id));
  const incidentNodes = new Set();
  for (const edge of keptEdges) {
    incidentNodes.add(edge.a);
    incidentNodes.add(edge.b);
  }

  const keptNodes = position.nodes.filter((node) => node.ground || incidentNodes.has(node.id));
  return {
    nodes: keptNodes.map(cloneNode),
    edges: keptEdges.map(cloneEdge),
  };
}

function sortedPosition(position) {
  const nodes = [...position.nodes].sort((leftNode, rightNode) => leftNode.id.localeCompare(rightNode.id));
  const edges = [...position.edges].sort((leftEdge, rightEdge) => leftEdge.id.localeCompare(rightEdge.id));
  return {
    nodes,
    edges,
  };
}

export function normalizePosition(position) {
  const nodeMap = new Map();
  for (const rawNode of position.nodes ?? []) {
    if (!rawNode || typeof rawNode.id !== "string") {
      continue;
    }
    nodeMap.set(rawNode.id, cloneNode(rawNode));
  }

  const edges = [];
  for (const rawEdge of position.edges ?? []) {
    if (!rawEdge || typeof rawEdge.id !== "string") {
      continue;
    }
    if (!nodeMap.has(rawEdge.a) || !nodeMap.has(rawEdge.b)) {
      continue;
    }
    if (
      rawEdge.color !== EDGE_COLORS.LEFT
      && rawEdge.color !== EDGE_COLORS.RIGHT
      && rawEdge.color !== EDGE_COLORS.NEUTRAL
    ) {
      continue;
    }

    edges.push(cloneEdge(rawEdge));
  }

  const normalized = pruneUnsupported({
    nodes: [...nodeMap.values()],
    edges,
  });

  return sortedPosition(normalized);
}

function edgeSignature(edge) {
  const loopTag = edge.loop ? `l${edge.loopKind ? edge.loopKind[0] : "b"}` : "";
  return `${edge.color[0]}${edge.stable ? "s" : "f"}${edge.infinite ? "i" : ""}${loopTag}`;
}

// Canonical key that ignores node/edge ID labeling so iso-positions share memo
// entries. Uses Weisfeiler-Lehman color refinement: nodes start partitioned by
// ground/non-ground, then each round refines by the sorted multiset of incident
// edge signatures paired with neighbor labels. After the partition stabilizes,
// the sorted edge list under canonical labels fingerprints the structure.
function positionKey(position) {
  const nodes = position.nodes;
  const edges = position.edges;
  if (nodes.length === 0) {
    return "||";
  }

  const adjacency = new Map();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adjacency.has(edge.a) || !adjacency.has(edge.b)) continue;
    const sig = edgeSignature(edge);
    adjacency.get(edge.a).push({ other: edge.b, sig });
    if (edge.b !== edge.a) {
      adjacency.get(edge.b).push({ other: edge.a, sig });
    }
  }

  let labels = new Map();
  for (const node of nodes) {
    labels.set(node.id, node.ground ? 1 : 0);
  }

  const maxRounds = nodes.length + 1;
  for (let round = 0; round < maxRounds; round += 1) {
    const canonicalSig = new Map();
    for (const node of nodes) {
      const neighbors = adjacency.get(node.id)
        .map(({ other, sig }) => `${sig}:${labels.get(other)}`)
        .sort();
      canonicalSig.set(node.id, `${labels.get(node.id)}|${neighbors.join(",")}`);
    }

    const assignment = new Map();
    let next = 0;
    const newLabels = new Map();
    for (const node of nodes) {
      const sig = canonicalSig.get(node.id);
      let label = assignment.get(sig);
      if (label === undefined) {
        label = next;
        next += 1;
        assignment.set(sig, label);
      }
      newLabels.set(node.id, label);
    }

    let stable = labels.size === newLabels.size;
    if (stable) {
      for (const [id, label] of labels) {
        if (newLabels.get(id) !== label) {
          stable = false;
          break;
        }
      }
    }
    labels = newLabels;
    if (stable) break;
  }

  const edgeReprs = edges.map((edge) => {
    const la = labels.get(edge.a);
    const lb = labels.get(edge.b);
    const endpoints = la <= lb ? `${la}-${lb}` : `${lb}-${la}`;
    return `${endpoints}:${edgeSignature(edge)}`;
  });
  edgeReprs.sort();

  const labelDist = new Map();
  for (const node of nodes) {
    const l = labels.get(node.id);
    labelDist.set(l, (labelDist.get(l) ?? 0) + 1);
  }
  const distStr = [...labelDist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([l, c]) => `${l}:${c}`)
    .join(",");

  return `${distStr}||${edgeReprs.join(";")}`;
}

function independentComponents(position) {
  if (position.edges.length === 0) {
    return [];
  }

  const nodeMap = positionNodesById(position);
  const adjacencyByNonGroundNode = new Map();
  for (const node of position.nodes) {
    if (!node.ground) {
      adjacencyByNonGroundNode.set(node.id, []);
    }
  }

  for (const edge of position.edges) {
    if (adjacencyByNonGroundNode.has(edge.a)) {
      adjacencyByNonGroundNode.get(edge.a).push(edge);
    }
    if (adjacencyByNonGroundNode.has(edge.b) && edge.b !== edge.a) {
      adjacencyByNonGroundNode.get(edge.b).push(edge);
    }
  }

  const seenEdges = new Set();
  const components = [];

  for (const edge of position.edges) {
    if (seenEdges.has(edge.id)) {
      continue;
    }

    const stack = [edge];
    const componentEdges = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (seenEdges.has(current.id)) {
        continue;
      }

      seenEdges.add(current.id);
      componentEdges.push(current);

      for (const endpoint of [current.a, current.b]) {
        const endpointNode = nodeMap.get(endpoint);
        if (!endpointNode || endpointNode.ground) {
          continue;
        }
        const neighbors = adjacencyByNonGroundNode.get(endpoint) ?? [];
        for (const neighbor of neighbors) {
          if (!seenEdges.has(neighbor.id)) {
            stack.push(neighbor);
          }
        }
      }
    }

    components.push(componentEdges);
  }

  return components.map((componentEdges, index) => {
    const referencedNodes = new Map();
    let usesGround = false;
    for (const edge of componentEdges) {
      const aNode = nodeMap.get(edge.a);
      const bNode = nodeMap.get(edge.b);
      if (aNode?.ground || bNode?.ground) {
        usesGround = true;
      }
      if (aNode && !aNode.ground) {
        referencedNodes.set(aNode.id, cloneNode(aNode));
      }
      if (bNode && !bNode.ground) {
        referencedNodes.set(bNode.id, cloneNode(bNode));
      }
    }

    const rootId = usesGround ? `root-${index}` : null;
    const nodes = [];
    if (usesGround) {
      nodes.push({
        id: rootId,
        x: 0,
        y: 0,
        ground: true,
      });
    }

    nodes.push(...referencedNodes.values());

    const edges = componentEdges.map((edge) => {
      const aNode = nodeMap.get(edge.a);
      const bNode = nodeMap.get(edge.b);
      return {
        id: edge.id,
        a: aNode?.ground ? rootId : edge.a,
        b: bNode?.ground ? rootId : edge.b,
        color: edge.color,
        stable: edge.stable,
        infinite: edge.infinite,
        loop: edge.loop,
        loopKind: edge.loopKind,
        pattern: edge.pattern,
      };
    });

    return normalizePosition({
      nodes,
      edges,
    });
  });
}

export function legalMoves(position, player) {
  const normalized = normalizePosition(position);
  return normalized.edges
    .filter((edge) => playableBy(edge.color, player))
    .map((edge) => cloneEdge(edge));
}

export function applyMove(position, edgeId) {
  const normalized = normalizePosition(position);
  return normalizePosition({
    nodes: normalized.nodes,
    edges: normalized.edges.filter((edge) => edge.id !== edgeId),
  });
}

function edgeReferenceLabel(edge) {
  const stableSuffix = edge.stable ? " stable" : "";
  const infiniteSuffix = edge.infinite ? " infinite" : "";
  return `${colorTitle(edge.color)}${stableSuffix}${infiniteSuffix} edge ${edge.id}`;
}

class Solver {
  constructor(limits, verbose = false) {
    this.limits = {
      ...DEFAULT_LIMITS,
      ...(limits ?? {}),
    };
    this.positionMemo = new Map();
    this.sumMemo = new Map();
    this.compareMemo = new Map();
    this.canonicalMemo = new Map();
    this.pureShortMemo = new Map();
    this.rationalGames = new Map();
    this.gamesBySignature = new Map();
    this.displayCache = new Map();
    this.displayTruncations = new Set();
    this.nimberCache = new Map();
    this.nextUid = 0;
    this.nimberGames = new Map();
    this.zero = this.internGame([], []);
    // { | } is the canonical form of 0 by definition; flagging it here keeps
    // an empty board's rigor consistent with a solved position worth 0.
    this.zero.canonical = true;
    this.nimberGames.set(0, this.zero);
    this.verbose = verbose;
    this.trace = [];
    // Optional progress callback (used by the off-main-thread worker to stream
    // a live state count). Fired every ~2048 newly memoized positions.
    this.onProgress = null;
    this._progressCounter = 0;
  }

  log(message) {
    if (this.verbose) {
      this.trace.push(message);
    }
  }

  logLazy(renderMessage) {
    if (this.verbose) {
      this.trace.push(renderMessage());
    }
  }

  internNimber(value) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid nimber ${value}`);
    }
    if (this.nimberGames.has(value)) {
      return this.nimberGames.get(value);
    }

    const options = [];
    for (let i = 0; i < value; i += 1) {
      options.push(this.internNimber(i));
    }

    const game = this.internGame(options, options);
    // {0, *, ..., *(n-1) | same} is exactly the canonical form of *n.
    game.canonical = true;
    this.nimberGames.set(value, game);
    return game;
  }

  grassStalkCount(game) {
    if (!game?.infinite) return null;
    if (game.infiniteName === "omega-star") return 1;
    const match = game.infiniteName.match(/^grass-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  internGrassGame(count) {
    if (count <= 1) {
      return this.internInfiniteGame("omega-star", EDGE_COLORS.NEUTRAL);
    }
    return this.internInfiniteGame(`grass-${count}`, EDGE_COLORS.NEUTRAL);
  }

  internTransfiniteNumber(value, nameHint = null) {
    const name = nameHint ?? value.toString();
    const sig = `INFNUM:${name}`;
    if (this.gamesBySignature.has(sig)) {
      return this.gamesBySignature.get(sig);
    }

    const game = {
      uid: this.nextUid += 1,
      signature: sig,
      left: [],
      right: [],
      isNumber: true,
      numericValue: null,
      switchInfo: null,
      allOptionsNumeric: false,
      infinite: true,
      infiniteName: name,
      transfiniteValue: value,
    };
    this.gamesBySignature.set(sig, game);
    return game;
  }

  // A real game for a standalone rational — used when loopy or transfinite
  // parts cancel and leave a plain finite number behind. The old code here
  // interned {|} (which IS the shared zero object) and then overwrote its
  // numericValue, silently poisoning every later use of zero in the solver.
  // Instead, build the number's actual canonical form: integers count down to
  // 0 one move at a time, and a dyadic m/2^k is { (m-1)/2^k | (m+1)/2^k }.
  internRationalNumber(rational) {
    if (rational.compare(Rational.zero()) === 0) {
      return this.zero;
    }
    const key = rational.toString();
    if (this.rationalGames.has(key)) {
      return this.rationalGames.get(key);
    }

    const isDyadic = (d) => {
      let x = d;
      while (x % 2n === 0n) x /= 2n;
      return x === 1n;
    };
    const magnitudeOk = absBigInt(rational.floorBigInt()) <= 4096n;

    let game;
    if (isDyadic(rational.denominator) && magnitudeOk) {
      const one = new Rational(1n, 1n);
      if (rational.isInteger()) {
        game = rational.compare(Rational.zero()) > 0
          ? this.internGame([this.internRationalNumber(rational.subtract(one))], [])
          : this.internGame([], [this.internRationalNumber(rational.add(one))]);
      } else {
        const step = new Rational(1n, rational.denominator);
        game = this.internGame(
          [this.internRationalNumber(rational.subtract(step))],
          [this.internRationalNumber(rational.add(step))],
        );
      }
      // { simpler | simpler } around a dyadic is that number's canonical form.
      game.canonical = true;
    } else {
      // Non-dyadic or absurdly large: a fresh metadata-only carrier. Degraded
      // (structural comparison will not see the value) but never shared state.
      const sig = `NUM:${key}`;
      game = this.gamesBySignature.get(sig) ?? {
        uid: this.nextUid += 1,
        signature: sig,
        left: [],
        right: [],
        isNumber: true,
        numericValue: rational,
        switchInfo: null,
        allOptionsNumeric: false,
      };
      this.gamesBySignature.set(sig, game);
      this.logLazy(() => `Non-dyadic remainder ${key}: metadata-only number game`);
    }
    this.rationalGames.set(key, game);
    return game;
  }

  internInfiniteGame(name, color) {
    const sig = `INF:${name}`;
    if (this.gamesBySignature.has(sig)) return this.gamesBySignature.get(sig);

    // Determine transfinite value from name
    let tv = null;
    let isNumber = false;
    const towerMatch = name.match(/^(?:neg-)?omega-times-(\d+)$/);
    const plusMatch = name.match(/^omega-plus-(.+)$/);
    const minusMatch = name.match(/^omega-minus-(.+)$/);
    const negPlusMatch = name.match(/^neg-omega-plus-(.+)$/);
    const negMinusMatch = name.match(/^neg-omega-minus-(.+)$/);
    if (name === "omega") {
      tv = TransfiniteValue.omega();
      isNumber = true;
    } else if (name === "neg-omega") {
      tv = TransfiniteValue.negOmega();
      isNumber = true;
    } else if (name === "omega-squared") {
      tv = TransfiniteValue.omegaSquared();
      isNumber = true;
    } else if (name === "neg-omega-squared") {
      tv = TransfiniteValue.negOmegaSquared();
      isNumber = true;
    }
    else if (towerMatch) {
      const n = BigInt(towerMatch[1]);
      tv = new TransfiniteValue(0n, name.startsWith("neg") ? -n : n);
      isNumber = true;
    } else if (plusMatch || minusMatch || negPlusMatch || negMinusMatch) {
      const finiteText = (plusMatch ?? minusMatch ?? negPlusMatch ?? negMinusMatch)[1];
      const parts = finiteText.split("/");
      const baseFinite = parts.length === 2
        ? new Rational(BigInt(parts[0]), BigInt(parts[1]))
        : new Rational(BigInt(finiteText));
      const signedFinite = (plusMatch || negPlusMatch)
        ? baseFinite
        : new Rational(-baseFinite.numerator, baseFinite.denominator);
      if (plusMatch || minusMatch) {
        tv = new TransfiniteValue(0n, 1n, signedFinite);
      } else {
        tv = new TransfiniteValue(0n, -1n, signedFinite);
      }
      isNumber = true;
    }

    const game = {
      uid: this.nextUid += 1,
      signature: sig,
      left: [], right: [],
      isNumber,
      numericValue: null,
      switchInfo: null,
      allOptionsNumeric: false,
      infinite: true,
      infiniteName: name,
      transfiniteValue: tv,
    };
    this.gamesBySignature.set(sig, game);
    return game;
  }

  internLoopyGame(loopyValue) {
    const sig = `LOOP:${loopyValue.toString()}`;
    if (this.gamesBySignature.has(sig)) return this.gamesBySignature.get(sig);
    const game = {
      uid: this.nextUid += 1,
      signature: sig,
      left: [], right: [],
      isNumber: false,
      numericValue: null,
      switchInfo: null,
      allOptionsNumeric: false,
      loopy: true,
      loopyValue,
      loopyName: loopyValue.toString(),
    };
    this.gamesBySignature.set(sig, game);
    return game;
  }

  // Identify a component's loopy contribution, if any. Each loop-tagged edge
  // contributes one LoopyValue; we fold them together with the loopy arithmetic.
  // If a finite tail hangs off a "stalk"-style loop (blue loop + finite blue on
  // top), the tail's Rational is absorbed as the finite shift of the loopy value.
  solveLoopyComponent(position) {
    const loopEdges = position.edges.filter((e) => e.loop);
    if (loopEdges.length === 0) return null;

    const contributions = loopEdges.map((edge) => {
      if (edge.loopKind === "over") return LoopyValue.over();
      if (edge.loopKind === "under") return LoopyValue.under();
      if (edge.loopKind === "dud") return LoopyValue.dud();
      if (edge.color === EDGE_COLORS.LEFT) return LoopyValue.on();
      if (edge.color === EDGE_COLORS.RIGHT) return LoopyValue.off();
      return LoopyValue.dud();
    });

    // If the component also has finite edges hanging off a single loop edge
    // via an attached tail, add the finite tail's value as a shift.
    let combined = contributions[0];
    let cancelledFinite = Rational.zero();
    for (let i = 1; i < contributions.length; i += 1) {
      const result = combined.addLoopy(contributions[i]);
      if (result && result.cancelled) {
        cancelledFinite = cancelledFinite.add(result.finite);
        combined = null;
      } else if (result) {
        combined = result;
      }
    }

    // Fold in any finite-tail contribution: edges that are not loop and not
    // infinite add their Rational value as a shift on the loopy total. This
    // only applies when each loop edge has exactly one attached non-loop
    // finite subgame — we approximate conservatively by solving the finite
    // subgraph with loops pruned and using its numericValue if it's a number.
    const tailEdges = position.edges.filter((e) => !e.loop && !e.infinite);
    if (tailEdges.length > 0) {
      const tailOnly = normalizePosition({
        nodes: position.nodes,
        edges: tailEdges,
      });
      if (tailOnly.edges.length > 0) {
        const tailGame = this.solveNormalized(tailOnly);
        if (tailGame.isNumber && tailGame.numericValue) {
          if (combined) combined = combined.addRational(tailGame.numericValue);
          else cancelledFinite = cancelledFinite.add(tailGame.numericValue);
        }
      }
    }

    if (combined) return this.internLoopyGame(combined);
    // over + under cancelled to a finite: return that number. This used to
    // fall through to the zero game even when the remainder was nonzero,
    // silently dropping it.
    return this.internRationalNumber(cancelledFinite);
  }

  extractFiniteTailPosition(position, rootId) {
    const finiteEdges = position.edges.filter((edge) => !edge.infinite);
    if (finiteEdges.length === 0) {
      return null;
    }

    const nodeMap = positionNodesById(position);
    const visitedNodes = new Set([rootId]);
    const visitedEdges = [];
    let changed = true;

    while (changed) {
      changed = false;
      for (const edge of finiteEdges) {
        const touchesVisited = visitedNodes.has(edge.a) || visitedNodes.has(edge.b);
        if (!touchesVisited || visitedEdges.includes(edge)) {
          continue;
        }
        visitedEdges.push(edge);
        visitedNodes.add(edge.a);
        visitedNodes.add(edge.b);
        changed = true;
      }
    }

    if (visitedEdges.length !== finiteEdges.length) {
      return null;
    }

    const nodes = [];
    for (const nodeId of visitedNodes) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      nodes.push({
        ...cloneNode(node),
        ground: nodeId === rootId,
      });
    }

    return normalizePosition({
      nodes,
      edges: visitedEdges.map((edge) => cloneEdge(edge)),
    });
  }

  detectOrdinalSquare(position, infEdges) {
    if (position.edges.some((edge) => !edge.infinite)) {
      return null;
    }

    const allBlue = infEdges.every((edge) => edge.color === EDGE_COLORS.LEFT);
    const allRed = infEdges.every((edge) => edge.color === EDGE_COLORS.RIGHT);
    if (!allBlue && !allRed) {
      return null;
    }

    const groundIds = new Set(position.nodes.filter((node) => node.ground).map((node) => node.id));
    const trunkEdges = infEdges.filter((edge) => groundIds.has(edge.a) || groundIds.has(edge.b));
    if (trunkEdges.length !== 1) {
      return null;
    }

    const trunk = trunkEdges[0];
    const hubId = groundIds.has(trunk.a) ? trunk.b : trunk.a;
    const branchEdges = infEdges.filter((edge) => edge.id !== trunk.id);
    if (branchEdges.length < 2) {
      return null;
    }

    const allFromHub = branchEdges.every((edge) =>
      (edge.a === hubId || edge.b === hubId)
      && !groundIds.has(edge.a)
      && !groundIds.has(edge.b)
    );
    if (!allFromHub) {
      return null;
    }

    return allBlue
      ? this.internInfiniteGame("omega-squared", EDGE_COLORS.LEFT)
      : this.internInfiniteGame("neg-omega-squared", EDGE_COLORS.RIGHT);
  }

  solveInfiniteComponent(position) {
    const infEdges = position.edges.filter((e) => e.infinite);
    if (infEdges.length === 0) return null;

    // Single infinite edge — original logic
    if (infEdges.length === 1) {
      const infEdge = infEdges[0];
      const color = infEdge.color;
      const nodeMap = positionNodesById(position);
      const aGround = nodeMap.get(infEdge.a)?.ground;
      const bGround = nodeMap.get(infEdge.b)?.ground;
      const tailRootId = aGround && !bGround ? infEdge.b : bGround && !aGround ? infEdge.a : null;
      const finiteTailPosition = tailRootId ? this.extractFiniteTailPosition(position, tailRootId) : null;
      if (finiteTailPosition && (color === EDGE_COLORS.LEFT || color === EDGE_COLORS.RIGHT)) {
        const tailGame = this.solveNormalized(finiteTailPosition);
        if (tailGame.isNumber) {
          const omegaCoeff = color === EDGE_COLORS.LEFT ? 1n : -1n;
          const finitePart = color === EDGE_COLORS.LEFT
            ? tailGame.numericValue
            : new Rational(-tailGame.numericValue.numerator, tailGame.numericValue.denominator);
          const value = new TransfiniteValue(0n, omegaCoeff, finitePart);
          return this.internTransfiniteNumber(value, transfiniteName(value));
        }
      }
      if (color === EDGE_COLORS.LEFT) return this.internInfiniteGame("omega", color);
      if (color === EDGE_COLORS.RIGHT) return this.internInfiniteGame("neg-omega", color);
      return this.internInfiniteGame("omega-star", color);
    }

    // Multiple infinite edges — detect topology
    const allGreen = infEdges.every((e) => e.color === EDGE_COLORS.NEUTRAL);
    const allBlue = infEdges.every((e) => e.color === EDGE_COLORS.LEFT);
    const allRed = infEdges.every((e) => e.color === EDGE_COLORS.RIGHT);
    const hasFiniteEdges = position.edges.some((e) => !e.infinite);

    // Grass, chain-tower, and bare-ω heuristics only give a reliable reading on a
    // purely infinite same-color component. When finite edges share the component,
    // the pattern-matcher can return a value wildly different from the true game
    // (e.g. a fan of two infinite blues on a finite stem is ω+2, not ω·2). In that
    // case bail out of pattern matching and let the caller recurse.
    if (allGreen && !hasFiniteEdges) {
      const name = `grass-${infEdges.length}`;
      this.logLazy(() => `Infinite grass with ${infEdges.length} stalks → first player wins (fuzzy)`);
      return this.internInfiniteGame(name, EDGE_COLORS.NEUTRAL);
    }

    const ordinalSquare = this.detectOrdinalSquare(position, infEdges);
    if (ordinalSquare) {
      this.logLazy(() => `Higher-order ordinal branch detected → ${this.display(ordinalSquare)}`);
      return ordinalSquare;
    }

    // Check if infinite edges form a chain (tower) vs fan (parallel)
    const isChain = infEdges.length > 1 && (() => {
      // A chain means edges are connected end-to-end
      const edgeEndpoints = infEdges.map((e) => [e.a, e.b]);
      // Simple check: see if they share intermediate non-ground nodes
      const allNodes = new Set(edgeEndpoints.flat());
      const groundNodes = position.nodes.filter((n) => n.ground).map((n) => n.id);
      const intermediateShared = [...allNodes].filter((n) =>
        !groundNodes.includes(n) &&
        edgeEndpoints.filter(([a, b]) => a === n || b === n).length >= 2
      );
      return intermediateShared.length > 0;
    })();

    if (isChain && allBlue && !hasFiniteEdges) {
      const name = `omega-times-${infEdges.length}`;
      this.logLazy(() => `Ordinal tower: ${infEdges.length} chained infinite blue edges → ω·${infEdges.length}`);
      return this.internInfiniteGame(name, EDGE_COLORS.LEFT);
    }
    if (isChain && allRed && !hasFiniteEdges) {
      const name = `neg-omega-times-${infEdges.length}`;
      this.logLazy(() => `Ordinal tower: ${infEdges.length} chained infinite red edges → -ω·${infEdges.length}`);
      return this.internInfiniteGame(name, EDGE_COLORS.RIGHT);
    }

    const blueCount = infEdges.filter((e) => e.color === EDGE_COLORS.LEFT).length;
    const redCount = infEdges.filter((e) => e.color === EDGE_COLORS.RIGHT).length;
    const greenCount = infEdges.filter((e) => e.color === EDGE_COLORS.NEUTRAL).length;

    if (!hasFiniteEdges) {
      if (blueCount > 0 && redCount === 0 && greenCount === 0) {
        return this.internInfiniteGame("omega", EDGE_COLORS.LEFT);
      }
      if (redCount > 0 && blueCount === 0 && greenCount === 0) {
        return this.internInfiniteGame("neg-omega", EDGE_COLORS.RIGHT);
      }
      // Mixed colors, pure infinite → flower heuristic
      const name = `flower-${blueCount}b${redCount}r${greenCount}g`;
      this.logLazy(() => `Infinite flower (${blueCount}B ${redCount}R ${greenCount}G) → fuzzy`);
      return this.internInfiniteGame(name, EDGE_COLORS.NEUTRAL);
    }

    // Same-color multi-infinite mixed with finite edges: recurse instead of guessing.
    if (allBlue || allRed || allGreen) {
      this.logLazy(() => `Mixed finite + multi-infinite ${colorTitle(infEdges[0].color)} component: deferring to general recursion`);
      return null;
    }

    // Mixed colors with finite edges: preserve the documented flower approximation.
    const name = `flower-${blueCount}b${redCount}r${greenCount}g`;
    this.logLazy(() => `Infinite flower (${blueCount}B ${redCount}R ${greenCount}G) with finite stem → fuzzy approximation`);
    return this.internInfiniteGame(name, EDGE_COLORS.NEUTRAL);
  }

  solve(position) {
    const normalized = normalizePosition(position);
    return this.solveNormalized(normalized);
  }

  solveNormalized(position) {
    const key = positionKey(position);
    if (this.positionMemo.has(key)) {
      return this.positionMemo.get(key);
    }

    if (this.positionMemo.size >= this.limits.maxPositions) {
      throw new AnalysisLimitError(
        "Exact analysis exceeded the position budget. Mixed hot positions grow very quickly.",
      );
    }

    const components = independentComponents(position);
    let game;

    if (components.length === 0) {
      this.logLazy(() => `Position with ${position.edges.length} edges: no surviving edges \u2192 value 0`);
      game = this.zero;
    } else if (components.length > 1) {
      this.logLazy(() => `Decomposed into ${components.length} independent components`);
      const componentGames = components.map((component, i) => {
        const edgeDesc = component.edges.map((e) => `${colorTitle(e.color)}(${e.id})`).join(", ");
        this.logLazy(() => `  Component ${i + 1}: [${edgeDesc}]`);
        const g = this.solveNormalized(component);
        this.logLazy(() => `  Component ${i + 1} \u2192 ${this.display(g)}`);
        return g;
      });
      //
      // Category-aware multi-component sum.
      //
      // Naive `reduce(sumGames)` loses information when a position has BOTH a
      // transfinite component (\u03c9, grass, etc.) AND a loopy component
      // (over/under/on/off/dud) AND a general short-game component:
      //
      //   sumGames(general_short_game, \u03c9) \u2192 compound game without
      //                                         the `infinite` flag set
      //   sumGames(compound_game, under)     \u2192 hits the
      //                                         `loopy + general game` branch
      //                                         and silently returns just `under`
      //
      // The result reports "Blue is losing" when in fact \u03c9 dominates and
      // Blue clearly wins.
      //
      // Theoretical rules we apply:
      //   - on/off/dud loopy values DOMINATE everything (perpetual moves
      //     trump even transfinite finite gain).
      //   - over/under loopy values are infinitesimal and DOMINATED by any
      //     transfinite component (\u03c9 is bigger than any loopy infinitesimal).
      //
      // Strategy: sum loopy components together first (existing addLoopy logic
      // handles cancellations like over+under), then combine with the non-loopy
      // sum applying the dominance rules above.
      //
      const loopyComponents = componentGames.filter((g) => g.loopy);
      const nonLoopyComponents = componentGames.filter((g) => !g.loopy);
      if (loopyComponents.length > 0 && nonLoopyComponents.length > 0) {
        const loopySum = loopyComponents.reduce((sum, g) => this.sumGames(sum, g), this.zero);
        const nonLoopySum = nonLoopyComponents.reduce((sum, g) => this.sumGames(sum, g), this.zero);
        const hasTransfinite = nonLoopyComponents.some((g) => g.infinite);
        if (!loopySum.loopy) {
          // over+under cancelled to a number, or some other reduction made the
          // loopy part finite. Fall back to normal sum.
          game = this.sumGames(nonLoopySum, loopySum);
        } else if (hasTransfinite) {
          const k = loopySum.loopyValue.kind;
          if (k === "on" || k === "off" || k === "dud") {
            // Perpetual loops dominate; transfinite is moot.
            game = loopySum;
            this.logLazy(() => `Loopy ${k} dominates transfinite \u2192 ${this.display(game)}`);
          } else {
            // over/under: dominated by transfinite, drop them and keep the non-loopy sum.
            game = nonLoopySum;
            this.logLazy(() => `Transfinite dominates loopy ${k} \u2192 ${this.display(game)}`);
          }
        } else {
          // No transfinite: existing sumGames handles loopy + general game correctly.
          game = this.sumGames(nonLoopySum, loopySum);
        }
      } else {
        game = componentGames.reduce((sum, g) => this.sumGames(sum, g), this.zero);
      }
      this.logLazy(() => `Sum of components \u2192 ${this.display(game)}`);
    } else {
      // Check for loop edges first — they dominate the component's value in
      // Conway's loopy theory (on/off/over/under/dud).
      const loopGame = this.solveLoopyComponent(position);
      if (loopGame) {
        game = loopGame;
        this.logLazy(() => `Loopy component detected \u2192 ${this.display(game)}`);
        this.positionMemo.set(key, game);
        return game;
      }
      // An all-green component is impartial, so its value is a single nimber.
      // The Fusion Principle finds it in near-linear time instead of unfolding
      // the whole game tree \u2014 a 13-edge green wheel drops from ~3,800 search
      // states to a graph walk, and prints as *n instead of thousands of
      // characters of unreduced form.
      const fused = fuseGreen(position);
      if (fused) {
        game = this.internNimber(fused.nimValue);
        this.logLazy(() => `Fusion Principle: all-green component \u2192 ${fused.label}`);
        this.positionMemo.set(key, game);
        if (this.onProgress && (this._progressCounter++ & 2047) === 0) this.onProgress(this.positionMemo.size);
        return game;
      }
      // Check for infinite edges in single component
      const infGame = this.solveInfiniteComponent(position);
      if (infGame) {
        game = infGame;
        this.logLazy(() => `Infinite component detected \u2192 ${this.display(game)}`);
      } else {
        const leftOptions = [];
        const rightOptions = [];

        for (const edge of position.edges) {
          if (playableBy(edge.color, LEFT)) {
            leftOptions.push(this.solveNormalized(applyMove(position, edge.id)));
          }
          if (playableBy(edge.color, RIGHT)) {
            rightOptions.push(this.solveNormalized(applyMove(position, edge.id)));
          }
        }

        game = this.reduceGame(leftOptions, rightOptions);
        this.logLazy(() => {
          const leftStr = leftOptions.map((o) => this.display(o)).join(", ");
          const rightStr = rightOptions.map((o) => this.display(o)).join(", ");
          return `Single component: { ${leftStr} | ${rightStr} } \u2192 ${this.display(game)}`;
        });
      }
    }

    this.positionMemo.set(key, game);
    if (this.onProgress && (this._progressCounter++ & 2047) === 0) this.onProgress(this.positionMemo.size);
    return game;
  }

  sumGames(leftGame, rightGame) {
    if (leftGame === this.zero) {
      return rightGame;
    }
    if (rightGame === this.zero) {
      return leftGame;
    }

    // Loopy-game arithmetic (on/off/over/under/dud). Dominates the finite and
    // transfinite branches — loopy values aren't representable as surreal
    // numbers, so we fold everything into the loopy contribution.
    if (leftGame.loopy || rightGame.loopy) {
      if (leftGame.loopy && rightGame.loopy) {
        const result = leftGame.loopyValue.addLoopy(rightGame.loopyValue);
        if (result && result.cancelled) {
          // over + under cancels; whatever finite shift remains is a real
          // number game (never a mutation of the shared zero — see
          // internRationalNumber for the bug this replaces).
          return this.internRationalNumber(result.finite);
        }
        return this.internLoopyGame(result);
      }
      const loopy = leftGame.loopy ? leftGame : rightGame;
      const other = leftGame.loopy ? rightGame : leftGame;
      // loopy + finite number: shift the loopy's finite part
      if (other.isNumber && other.numericValue) {
        return this.internLoopyGame(loopy.loopyValue.addRational(other.numericValue));
      }
      // loopy + transfinite: on/off dominates; over/under let transfinite dominate
      if (other.infinite) {
        const k = loopy.loopyValue.kind;
        if (k === "on" || k === "off" || k === "dud") return this.internLoopyGame(loopy.loopyValue);
        // over/under — transfinite dominates magnitude, loop becomes negligible
        return other;
      }
      // loopy + general game: keep the loopy value (the perpetual behavior
      // outweighs a finite short-game addend in outcome terms).
      return this.internLoopyGame(loopy.loopyValue);
    }

    if (leftGame.infinite || rightGame.infinite) {
      const leftGrass = this.grassStalkCount(leftGame);
      const rightGrass = this.grassStalkCount(rightGame);
      if (leftGrass !== null && rightGrass !== null) {
        return this.internGrassGame(leftGrass + rightGrass);
      }

      // Transfinite-number + finite-rational. Require the "finite" side to really be
      // finite (numericValue is a Rational). Without this guard, ω+ω would fire the
      // first branch with rightGame.numericValue = null and silently collapse to ω.
      if (leftGame.infinite && !rightGame.infinite && rightGame.isNumber && leftGame.isNumber && leftGame.transfiniteValue) {
        return this.internTransfiniteNumber(
          leftGame.transfiniteValue.add(TransfiniteValue.fromRational(rightGame.numericValue)),
          transfiniteName(leftGame.transfiniteValue.add(TransfiniteValue.fromRational(rightGame.numericValue))),
        );
      }
      if (rightGame.infinite && !leftGame.infinite && leftGame.isNumber && rightGame.isNumber && rightGame.transfiniteValue) {
        return this.internTransfiniteNumber(
          rightGame.transfiniteValue.add(TransfiniteValue.fromRational(leftGame.numericValue)),
          transfiniteName(rightGame.transfiniteValue.add(TransfiniteValue.fromRational(leftGame.numericValue))),
        );
      }
      if (leftGame.infinite && rightGame.infinite && leftGame.isNumber && rightGame.isNumber
        && leftGame.transfiniteValue && rightGame.transfiniteValue) {
        const combined = leftGame.transfiniteValue.add(rightGame.transfiniteValue);
        if (combined.isFinite()) {
          // ω-parts cancelled; keep the finite remainder instead of dropping it.
          return this.internRationalNumber(combined.finite);
        }
        return this.internTransfiniteNumber(combined, transfiniteName(combined));
      }

      // Both-infinite signed cancellations (remain a safe heuristic).
      if (leftGame.infiniteName === "omega" && rightGame.infiniteName === "neg-omega") return this.zero;
      if (leftGame.infiniteName === "neg-omega" && rightGame.infiniteName === "omega") return this.zero;

      // For "infinite non-number + finite" (e.g. grass + 1), fall through to the
      // generic game-theoretic sum below so the finite side isn't silently dropped.
      // The one-sided case is the common leak; two opaque infinites still keep the
      // documented same-type fallback here to avoid collapsing to 0.
      if (leftGame.infinite && rightGame.infinite) {
        return leftGame;
      }
    }

    const leftNimber = this.nimberValue(leftGame);
    const rightNimber = this.nimberValue(rightGame);
    if (leftNimber !== null && rightNimber !== null) {
      return this.internNimber(nimberXor(leftNimber, rightNimber));
    }

    const ordered = leftGame.uid < rightGame.uid
      ? [leftGame, rightGame]
      : [rightGame, leftGame];
    const key = `${ordered[0].uid}+${ordered[1].uid}`;
    if (this.sumMemo.has(key)) {
      return this.sumMemo.get(key);
    }

    if (this.sumMemo.size >= this.limits.maxSums) {
      throw new AnalysisLimitError(
        "Exact analysis exceeded the sum budget. The game likely needs deeper thermal machinery.",
      );
    }

    const leftOptions = [
      ...leftGame.left.map((option) => this.sumGames(option, rightGame)),
      ...rightGame.left.map((option) => this.sumGames(leftGame, option)),
    ];
    const rightOptions = [
      ...leftGame.right.map((option) => this.sumGames(option, rightGame)),
      ...rightGame.right.map((option) => this.sumGames(leftGame, option)),
    ];

    const sum = this.reduceGame(leftOptions, rightOptions);
    this.sumMemo.set(key, sum);
    return sum;
  }

  reduceGame(leftOptions, rightOptions) {
    const pruned = this.pruneDominated(leftOptions, rightOptions);
    return this.canonicalize(this.internGame(pruned.left, pruned.right));
  }

  // Domination: a Left option loses to another Left option that is at least as
  // good for Left; symmetrically for Right. Shared by reduceGame and the
  // canonical-form loop so the two can never drift apart.
  pruneDominated(leftOptions, rightOptions) {
    let left = this.deduplicateOptions(leftOptions);
    let right = this.deduplicateOptions(rightOptions);

    left = left.filter((candidate, index) => !left.some((other, otherIndex) => {
      if (index === otherIndex) {
        return false;
      }
      const relation = this.compare(candidate, other);
      return relation === "lt" || relation === "eq";
    }));

    right = right.filter((candidate, index) => !right.some((other, otherIndex) => {
      if (index === otherIndex) {
        return false;
      }
      const relation = this.compare(other, candidate);
      return relation === "lt" || relation === "eq";
    }));

    return { left, right };
  }

  // ── Canonical form ──
  // Domination alone leaves reversible options in place, which is why forms
  // like { * | * } (= 0) or 4,000-character towers survived to the display.
  // The second half of the classical simplification (ONAG / Siegel, and what
  // CGSuite applies to every game):
  //
  //   A Left option G^L is REVERSIBLE when some Right option G^LR of it has
  //   G^LR <= G: Right would answer Left's move immediately, so Left may as
  //   well move straight to G^LR's Left options. Replace G^L by all of
  //   G^LR.left (possibly none). Symmetrically, G^R is reversible through a
  //   G^RL >= G and is replaced by G^RL.right.
  //
  // Every replacement preserves equality, so all tests compare against the
  // ORIGINAL game. Bypassing substitutes grandchildren for children, so the
  // formal depth of each slot strictly decreases and the loop terminates; a
  // generous guard backstops that, and failing open only means a correct but
  // less-simplified form. The result is the unique canonical form.
  canonicalize(game) {
    if (this.canonicalMemo.has(game.uid)) {
      return this.canonicalMemo.get(game.uid);
    }
    // Reversibility theory covers finite loop-free short games only. Loopy and
    // transfinite games (at any depth) keep their existing dominated-only form.
    if (!this.isPureShort(game)) {
      this.canonicalMemo.set(game.uid, game);
      return game;
    }

    // Options built through reduceGame are already canonical (memo hits);
    // canonicalize defensively in case a caller interned by hand.
    let left = game.left.map((option) => this.canonicalize(option));
    let right = game.right.map((option) => this.canonicalize(option));

    let guard = 0;
    for (;;) {
      if ((guard += 1) > 300) {
        this.logLazy(() => "Canonicalization guard tripped; keeping dominated-only form");
        const fallback = this.internGame(game.left, game.right);
        this.canonicalMemo.set(game.uid, fallback);
        return fallback;
      }
      let changed = false;

      const bypassedLeft = [];
      for (const option of left) {
        const through = option.right.find((reply) => this.lessThanOrEqual(reply, game));
        if (through) {
          bypassedLeft.push(...through.left);
          changed = true;
        } else {
          bypassedLeft.push(option);
        }
      }
      const bypassedRight = [];
      for (const option of right) {
        const through = option.left.find((reply) => this.lessThanOrEqual(game, reply));
        if (through) {
          bypassedRight.push(...through.right);
          changed = true;
        } else {
          bypassedRight.push(option);
        }
      }

      const pruned = this.pruneDominated(bypassedLeft, bypassedRight);
      const stable = !changed
        && pruned.left.length === left.length
        && pruned.right.length === right.length;
      left = pruned.left;
      right = pruned.right;
      if (stable) {
        break;
      }
    }

    const canonical = this.internGame(left, right);
    // The flag propagates: it is only earned when every option carries it too,
    // so a guard-tripped (unreduced) option deep in the tree denies the flag
    // to every ancestor instead of hiding under one.
    canonical.canonical = left.every((o) => o.canonical === true)
      && right.every((o) => o.canonical === true);
    this.canonicalMemo.set(game.uid, canonical);
    this.canonicalMemo.set(canonical.uid, canonical);
    return canonical;
  }

  // True when the game is a plain finite short game all the way down — the
  // only territory where domination/reversibility are valid.
  isPureShort(game) {
    if (this.pureShortMemo.has(game.uid)) {
      return this.pureShortMemo.get(game.uid);
    }
    // Seed true to break cycles defensively; loop-free games never recurse
    // into themselves, but a malformed graph must not hang the solver.
    this.pureShortMemo.set(game.uid, true);
    let result = !game.loopy && !game.infinite && !game.transfiniteValue;
    if (result) {
      for (const option of [...game.left, ...game.right]) {
        if (!this.isPureShort(option)) {
          result = false;
          break;
        }
      }
    }
    this.pureShortMemo.set(game.uid, result);
    return result;
  }

  deduplicateOptions(options) {
    const unique = [];
    for (const option of options) {
      const alreadyPresent = unique.some((existing) => this.compare(existing, option) === "eq");
      if (!alreadyPresent) {
        unique.push(option);
      }
    }
    return unique;
  }

  internGame(leftOptions, rightOptions) {
    const sortedLeft = [...leftOptions].sort((a, b) => a.uid - b.uid);
    const sortedRight = [...rightOptions].sort((a, b) => a.uid - b.uid);
    const signature = `L:${sortedLeft.map((game) => game.uid).join(",")}|R:${sortedRight.map((game) => game.uid).join(",")}`;

    if (this.gamesBySignature.has(signature)) {
      return this.gamesBySignature.get(signature);
    }

    const numberInfo = this.detectNumber(sortedLeft, sortedRight);
    const game = {
      uid: this.nextUid += 1,
      signature,
      left: sortedLeft,
      right: sortedRight,
      isNumber: numberInfo.isNumber,
      numericValue: numberInfo.numericValue,
      switchInfo: numberInfo.switchInfo,
      allOptionsNumeric: numberInfo.allOptionsNumeric,
    };

    this.gamesBySignature.set(signature, game);
    return game;
  }

  detectNumber(leftOptions, rightOptions) {
    const allOptions = [...leftOptions, ...rightOptions];
    const allOptionsNumeric = allOptions.every((option) => option.isNumber);

    if (!allOptionsNumeric) {
      return {
        isNumber: false,
        numericValue: null,
        switchInfo: null,
        allOptionsNumeric: false,
      };
    }

    // simplestNumberBetween uses Rational arithmetic; transfinite-valued options
    // (ω, ω+n, etc.) don't have a Rational numericValue. Surface the position as a
    // general game form instead of attempting (and crashing) a numeric reduction.
    if (allOptions.some((option) => option.infinite)) {
      return {
        isNumber: false,
        numericValue: null,
        switchInfo: null,
        allOptionsNumeric: true,
      };
    }

    let lowerBound = null;
    let upperBound = null;

    for (const option of leftOptions) {
      if (lowerBound === null || option.numericValue.compare(lowerBound) > 0) {
        lowerBound = option.numericValue;
      }
    }

    for (const option of rightOptions) {
      if (upperBound === null || option.numericValue.compare(upperBound) < 0) {
        upperBound = option.numericValue;
      }
    }

    const separated = leftOptions.every((leftOption) => rightOptions.every(
      (rightOption) => leftOption.numericValue.compare(rightOption.numericValue) < 0,
    ));

    if (separated) {
      return {
        isNumber: true,
        numericValue: simplestNumberBetween(lowerBound, upperBound),
        switchInfo: null,
        allOptionsNumeric: true,
      };
    }

    if (lowerBound !== null && upperBound !== null && lowerBound.compare(upperBound) > 0) {
      return {
        isNumber: false,
        numericValue: null,
        switchInfo: {
          mean: lowerBound.add(upperBound).divideByInt(2n),
          temperature: lowerBound.subtract(upperBound).divideByInt(2n),
        },
        allOptionsNumeric: true,
      };
    }

    return {
      isNumber: false,
      numericValue: null,
      switchInfo: null,
      allOptionsNumeric: true,
    };
  }

  lessThanOrEqual(leftGame, rightGame) {
    const key = `${leftGame.uid}<=${rightGame.uid}`;
    if (this.compareMemo.has(key)) {
      return this.compareMemo.get(key);
    }

    // Loopy-game comparison — dud is incomparable with non-dud, on/off dominate.
    if (leftGame.loopy || rightGame.loopy) {
      let result;
      if (leftGame.loopy && rightGame.loopy) {
        const cmp = leftGame.loopyValue.compareLoopy(rightGame.loopyValue);
        result = cmp !== null && cmp <= 0;
      } else if (leftGame.loopy) {
        // loopy ≤ finite: only if loopy compares ≤ 0-shifted-by-finite
        if (rightGame.isNumber && rightGame.numericValue) {
          const cmp = leftGame.loopyValue.compareToRational(rightGame.numericValue);
          result = cmp !== null && cmp <= 0;
        } else {
          const cmp = leftGame.loopyValue.compareToRational(Rational.zero());
          result = cmp !== null && cmp <= 0;
        }
      } else {
        // finite ≤ loopy: only if loopy kind puts it above that finite
        if (leftGame.isNumber && leftGame.numericValue) {
          const cmp = rightGame.loopyValue.compareToRational(leftGame.numericValue);
          result = cmp !== null && cmp >= 0;
        } else {
          const cmp = rightGame.loopyValue.compareToRational(Rational.zero());
          result = cmp !== null && cmp >= 0;
        }
      }
      this.compareMemo.set(key, result);
      return result;
    }

    // Handle infinite games
    if (leftGame.infinite || rightGame.infinite) {
      let result;
      if (leftGame.infinite && rightGame.infinite) {
        // Both infinite: compare transfinite values if available
        if (leftGame.transfiniteValue && rightGame.transfiniteValue) {
          result = leftGame.transfiniteValue.compare(rightGame.transfiniteValue) <= 0;
        } else if (leftGame.infiniteName === rightGame.infiniteName) {
          result = true; // equal
        } else {
          // Fuzzy games are incomparable with positive/negative infinites
          const lPos = leftGame.isNumber && leftGame.transfiniteValue?.isPositiveInfinite();
          const rPos = rightGame.isNumber && rightGame.transfiniteValue?.isPositiveInfinite();
          const lNeg = leftGame.isNumber && leftGame.transfiniteValue?.isNegativeInfinite();
          const rNeg = rightGame.isNumber && rightGame.transfiniteValue?.isNegativeInfinite();
          if (lNeg) result = true; // -ω·n <= anything infinite
          else if (rPos) result = true; // anything <= ω·n
          else result = false;
        }
      } else if (leftGame.infinite) {
        // infinite <= finite: only if negative infinite
        result = leftGame.isNumber && leftGame.transfiniteValue?.isNegativeInfinite();
      } else {
        // finite <= infinite: only if positive infinite
        result = rightGame.isNumber && rightGame.transfiniteValue?.isPositiveInfinite();
      }
      this.compareMemo.set(key, result);
      return result;
    }

    const leftNimber = this.nimberValue(leftGame);
    const rightNimber = this.nimberValue(rightGame);
    if (leftNimber !== null && rightNimber !== null) {
      const result = leftNimber === rightNimber;
      this.compareMemo.set(key, result);
      return result;
    }

    let result = true;
    for (const option of leftGame.left) {
      if (this.lessThanOrEqual(rightGame, option)) {
        result = false;
        break;
      }
    }

    if (result) {
      for (const option of rightGame.right) {
        if (this.lessThanOrEqual(option, leftGame)) {
          result = false;
          break;
        }
      }
    }

    this.compareMemo.set(key, result);
    return result;
  }

  compare(leftGame, rightGame) {
    const leftLeqRight = this.lessThanOrEqual(leftGame, rightGame);
    const rightLeqLeft = this.lessThanOrEqual(rightGame, leftGame);

    if (leftLeqRight && rightLeqLeft) {
      return "eq";
    }
    if (leftLeqRight) {
      return "lt";
    }
    if (rightLeqLeft) {
      return "gt";
    }
    return "fuzzy";
  }

  specialName(game) {
    if (game.infinite) {
      return this.display(game);
    }

    if (game.isNumber) {
      return game.numericValue.toString();
    }

    if (game.switchInfo) {
      const m = game.switchInfo.mean;
      const t = game.switchInfo.temperature;
      const zero = Rational.zero();
      if (m.compare(zero) === 0) {
        return `\u00b1${t.toString()}`;
      }
      return `${m.toString()}\u00b1${t.toString()}`;
    }

    const nimber = this.nimberValue(game);
    if (nimber !== null) {
      return nimber === 0 ? "0" : nimber === 1 ? "*" : `*${nimber}`;
    }

    if (game.left.length === 1 && game.right.length === 1) {
      const leftName = this.specialName(game.left[0]);
      const rightName = this.specialName(game.right[0]);
      if (leftName === "0" && rightName === "*") {
        return "\u2191";
      }
      if (leftName === "*" && rightName === "0") {
        return "\u2193";
      }
      if (game.left[0].isNumber && game.right[0].left.length === 1
        && game.right[0].right.length === 1
        && this.specialName(game.right[0].left[0]) === "0"
        && game.right[0].right[0].isNumber) {
        const x = game.right[0].right[0].numericValue;
        if (leftName === "0" && x.compare(Rational.zero()) < 0) {
          const absX = new Rational(-x.numerator, x.denominator);
          return `tiny(${absX.toString()})`;
        }
      }
      if (game.right[0].isNumber && game.left[0].left.length === 1
        && game.left[0].right.length === 1
        && this.specialName(game.left[0].right[0]) === "0"
        && game.left[0].left[0].isNumber) {
        const x = game.left[0].left[0].numericValue;
        if (rightName === "0" && x.compare(Rational.zero()) > 0) {
          return `miny(${x.toString()})`;
        }
      }
    }

    if (game.left.length === 2 && game.right.length === 1) {
      const rName = this.specialName(game.right[0]);
      const l0Name = this.specialName(game.left[0]);
      const l1Name = this.specialName(game.left[1]);
      if (rName === "0") {
        if ((l0Name === "0" && l1Name === "*") || (l0Name === "*" && l1Name === "0")) {
          return "\u2191*";
        }
        if ((l0Name === "0" && l1Name === "\u2191") || (l0Name === "\u2191" && l1Name === "0")) {
          return "\u21d1";
        }
      }
    }
    if (game.left.length === 1 && game.right.length === 2) {
      const lName = this.specialName(game.left[0]);
      const r0Name = this.specialName(game.right[0]);
      const r1Name = this.specialName(game.right[1]);
      if (lName === "0") {
        if ((r0Name === "0" && r1Name === "*") || (r0Name === "*" && r1Name === "0")) {
          return "\u2193*";
        }
        if ((r0Name === "0" && r1Name === "\u2193") || (r0Name === "\u2193" && r1Name === "0")) {
          return "\u21d3";
        }
      }
    }

    return null;
  }

  nimberValue(game) {
    if (this.nimberCache.has(game.uid)) {
      return this.nimberCache.get(game.uid);
    }

    if (game.infinite) {
      this.nimberCache.set(game.uid, null);
      return null;
    }

    if (game.isNumber) {
      const value = game.numericValue.compare(Rational.zero()) === 0 ? 0 : null;
      this.nimberCache.set(game.uid, value);
      return value;
    }

    if (game.left.length !== game.right.length) {
      this.nimberCache.set(game.uid, null);
      return null;
    }

    const leftIds = game.left.map((option) => option.uid).sort((a, b) => a - b);
    const rightIds = game.right.map((option) => option.uid).sort((a, b) => a - b);
    const matchingOptions = leftIds.every((uid, index) => uid === rightIds[index]);
    if (!matchingOptions) {
      this.nimberCache.set(game.uid, null);
      return null;
    }

    const optionValues = [];
    for (const option of game.left) {
      const nimber = this.nimberValue(option);
      if (nimber === null) {
        this.nimberCache.set(game.uid, null);
        return null;
      }
      optionValues.push(nimber);
    }

    const uniqueValues = new Set(optionValues);
    if (uniqueValues.size !== optionValues.length) {
      this.nimberCache.set(game.uid, null);
      return null;
    }

    for (let mexCandidate = 0; mexCandidate < uniqueValues.size; mexCandidate += 1) {
      if (!uniqueValues.has(mexCandidate)) {
        this.nimberCache.set(game.uid, null);
        return null;
      }
    }

    const value = uniqueValues.size;
    this.nimberCache.set(game.uid, value);
    return value;
  }

  display(game) {
    if (this.displayCache.has(game.uid)) {
      return this.displayCache.get(game.uid);
    }

    if (game.loopy) {
      const label = game.loopyValue.toString();
      this.displayCache.set(game.uid, label);
      return label;
    }

    if (game.infinite) {
      let label;
      if (game.isNumber && game.transfiniteValue) label = game.transfiniteValue.toString();
      else if (game.infiniteName === "omega") label = "ω";
      else if (game.infiniteName === "omega-star") label = "ω*";
      else if (game.infiniteName.startsWith("grass-")) label = `ω*[${game.infiniteName.split("-")[1]} stalks]`;
      else if (game.infiniteName.startsWith("flower-")) label = `∞-flower`;
      else label = game.infiniteName;
      this.displayCache.set(game.uid, label);
      return label;
    }

    if (game.isNumber) {
      const label = game.numericValue.toString();
      this.displayCache.set(game.uid, label);
      return label;
    }

    const alias = this.specialName(game);
    if (alias !== null) {
      this.displayCache.set(game.uid, alias);
      return alias;
    }

    const leftLabels = [];
    const rightLabels = [];
    let totalLength = 5;

    for (const option of game.left) {
      const optionLabel = this.display(option);
      const extraLength = optionLabel.length + (leftLabels.length > 0 ? 2 : 0);
      if (totalLength + extraLength > MAX_DISPLAY_CHARS) {
        break;
      }
      leftLabels.push(optionLabel);
      totalLength += extraLength;
    }

    totalLength += 3;
    for (const option of game.right) {
      const optionLabel = this.display(option);
      const extraLength = optionLabel.length + (rightLabels.length > 0 ? 2 : 0);
      if (totalLength + extraLength > MAX_DISPLAY_CHARS) {
        break;
      }
      rightLabels.push(optionLabel);
      totalLength += extraLength;
    }

    const leftSuffix = leftLabels.length < game.left.length ? `${leftLabels.length > 0 ? ", " : ""}…` : "";
    const rightSuffix = rightLabels.length < game.right.length ? `${rightLabels.length > 0 ? ", " : ""}…` : "";
    const label = `{ ${leftLabels.join(", ")}${leftSuffix} | ${rightLabels.join(", ")}${rightSuffix} }`;
    if (leftSuffix || rightSuffix) {
      this.displayTruncations.add(game.uid);
    }
    this.displayCache.set(game.uid, label);
    return label;
  }

  gameTree(game, depth = 0, maxDepth = 4) {
    if (depth >= maxDepth) {
      return { label: this.display(game), truncated: true };
    }
    return {
      label: this.display(game),
      truncated: false,
      isNumber: game.isNumber,
      nimber: this.nimberValue(game),
      left: game.left.map((opt) => this.gameTree(opt, depth + 1, maxDepth)),
      right: game.right.map((opt) => this.gameTree(opt, depth + 1, maxDepth)),
    };
  }

  relationToZero(game) {
    return this.compare(game, this.zero);
  }

  valueSummary(game) {
    if (game.loopy) {
      const label = this.display(game);
      const lv = game.loopyValue;
      const info = lv.outcomeInfo();
      const relationOutcome = outcomeDetails(info.relation);
      const subtitleByKind = {
        on: "Loopy on: Blue can keep moving forever, Red has no response",
        off: "Loopy off: Red can keep moving forever, Blue has no response",
        over: "Loopy over: positive infinitesimal (> 0, < any positive number)",
        under: "Loopy under: negative infinitesimal (< 0, > any negative)",
        dud: "Loopy dud: either side can extend the loop indefinitely — draw",
      };
      return {
        kind: "loopy",
        label,
        form: label,
        subtitle: subtitleByKind[lv.kind] ?? `Loopy value ${label}`,
        number: null,
        mean: null,
        temperature: null,
        heuristicValue: lv.kind === "on" ? 1000 : lv.kind === "off" ? -1000 : lv.kind === "over" ? 0.0001 : lv.kind === "under" ? -0.0001 : 0,
        birthday: null,
        constructionPath: null,
        approximate: false,
        displayTruncated: false,
        outcomeClass: info.outcomeClass,
        outcomeName: relationOutcome.outcomeName,
        shortOutcome: relationOutcome.shortOutcome,
        leftStartWinner: relationOutcome.leftStartWinner,
        rightStartWinner: relationOutcome.rightStartWinner,
        currentPlayerResult: relationOutcome.currentPlayerResult,
        relationToZero: info.relation,
      };
    }

    if (game.infinite) {
      const label = this.display(game);
      const n = game.infiniteName;
      const isPos = game.isNumber && game.transfiniteValue?.isPositiveInfinite();
      const isNeg = game.isNumber && game.transfiniteValue?.isNegativeInfinite();
      const isFuzzy = !isPos && !isNeg;
      const pattern = n.startsWith("grass")
        ? "grass"
        : n.startsWith("flower")
          ? "flower"
          : (n.includes("times") || n.includes("squared"))
            ? "tower"
            : "stalk";
      const patternLabel = pattern === "grass" ? "Infinite grass" : pattern === "flower" ? "Infinite flower" : pattern === "tower" ? "Ordinal tower" : "Infinite stalk";
      return {
        kind: "infinite",
        label, form: label,
        subtitle: `${patternLabel}: ${label} — this position extends to infinity`,
        number: null, mean: null, temperature: null,
        heuristicValue: game.transfiniteValue?.toNumber() ?? 0,
        birthday: null, constructionPath: null,
        approximate: true,
        displayTruncated: this.displayTruncations.has(game.uid),
        outcomeClass: isPos ? "L" : isNeg ? "R" : "N",
        outcomeName: isPos ? "Blue wins whoever starts" : isNeg ? "Red wins whoever starts" : "First player wins",
        shortOutcome: isPos ? "Blue always wins" : isNeg ? "Red always wins" : "First player wins",
        leftStartWinner: isNeg ? "Red" : "Blue",
        rightStartWinner: isPos ? "Blue" : "Red",
        currentPlayerResult: { left: "-", right: "-" },
        relationToZero: isPos ? "gt" : isNeg ? "lt" : "fuzzy",
      };
    }

    const relation = this.relationToZero(game);
    const outcome = outcomeDetails(relation);

    const label = this.display(game);
    let kind = "game";
    let subtitle = "Exact short combinatorial game";
    let mean = null;
    let temperature = null;
    let heuristicValue = 0;
    let birthday = null;
    let constructionPath = null;

    if (game.isNumber) {
      kind = "number";
      constructionPath = surrealConstructionPath(game.numericValue);
      birthday = constructionPath.length > 0 ? constructionPath[constructionPath.length - 1].day : 0;
      subtitle = `Surreal number born on day ${birthday}`;
      heuristicValue = game.numericValue.toNumber();
    } else if (game.switchInfo) {
      kind = "switch";
      subtitle = `Hot switch \u2014 mean ${game.switchInfo.mean.toString()}, temperature ${game.switchInfo.temperature.toString()}`;
      mean = game.switchInfo.mean.toString();
      temperature = game.switchInfo.temperature.toString();
      heuristicValue = game.switchInfo.mean.toNumber();
    } else {
      const nimber = this.nimberValue(game);
      if (nimber !== null) {
        kind = "nimber";
        subtitle = `Nimber *${nimber} \u2014 impartial game (Sprague-Grundy value ${nimber})`;
      } else if (label === "\u2191" || label === "\u2193") {
        kind = "infinitesimal";
        subtitle = `Infinitesimal ${label === "\u2191" ? "up" : "down"} \u2014 positive but less than any positive number`;
      } else if (label === "\u2191*" || label === "\u2193*") {
        kind = "infinitesimal";
        subtitle = `Infinitesimal ${label} \u2014 up-star or down-star`;
      } else if (label === "\u21d1" || label === "\u21d3") {
        kind = "infinitesimal";
        subtitle = `Infinitesimal ${label === "\u21d1" ? "double-up" : "double-down"}`;
      } else if (/^tiny\(/.test(label) || /^miny\(/.test(label)) {
        kind = "infinitesimal";
        subtitle = `Infinitesimal ${label} \u2014 positive but smaller than any up-multiple`;
      }
    }

    const thermograph = this.computeThermograph(game);
    const signExpansion = constructionPath ? signExpansionFromPath(constructionPath) : null;
    const atomicWeight = this.computeAtomicWeight(game);

    return {
      kind,
      label,
      form: label,
      subtitle,
      number: game.isNumber ? game.numericValue.toString() : null,
      mean,
      temperature,
      heuristicValue,
      birthday,
      constructionPath,
      signExpansion,
      atomicWeight,
      thermograph,
      approximate: false,
      displayTruncated: this.displayTruncations.has(game.uid),
      outcomeClass: outcome.outcomeClass,
      outcomeName: outcome.outcomeName,
      shortOutcome: outcome.shortOutcome,
      leftStartWinner: outcome.leftStartWinner,
      rightStartWinner: outcome.rightStartWinner,
      currentPlayerResult: outcome.currentPlayerResult,
      relationToZero: relation,
    };
  }

  // ── Atomic weight (uptimal) ──
  // Defined for "all-small" games — those built from 0/* and other all-small games.
  // Returns an integer (simplicity rule between maxLeftAW+1 and minRightAW-1)
  // or null when the game isn't all-small (e.g. has a number option).
  computeAtomicWeight(game, depth = 0, seen = new Set()) {
    if (!game) return null;
    if (game.infinite || game.loopy) return null;
    if (depth > 10) return null;
    if (seen.has(game.uid)) return null;

    // Numbers larger than * aren't all-small; their atomic weight is undefined.
    if (game.isNumber && game.numericValue) {
      const n = game.numericValue;
      const zero = Rational.zero();
      // Only 0 is all-small among numbers.
      return n.compare(zero) === 0 ? 0 : null;
    }

    // Empty {|} = 0
    if (game.left.length === 0 && game.right.length === 0) return 0;

    // For nimbers (game.left == game.right symbolically) atomic weight is 0.
    const nimber = this.nimberValue(game);
    if (nimber !== null) return 0;

    seen.add(game.uid);
    let maxLeft = -Infinity;
    for (const opt of game.left) {
      const aw = this.computeAtomicWeight(opt, depth + 1, seen);
      if (aw === null) { seen.delete(game.uid); return null; }
      if (aw > maxLeft) maxLeft = aw;
    }
    let minRight = Infinity;
    for (const opt of game.right) {
      const aw = this.computeAtomicWeight(opt, depth + 1, seen);
      if (aw === null) { seen.delete(game.uid); return null; }
      if (aw < minRight) minRight = aw;
    }
    seen.delete(game.uid);

    if (game.left.length === 0) return Math.floor(minRight - 1);
    if (game.right.length === 0) return Math.ceil(maxLeft + 1);

    // Simplicity rule on integers
    const lo = maxLeft + 1;
    const hi = minRight - 1;
    if (lo > hi) {
      // Game is "fuzzy" w.r.t. atomic weights — return null to signal undefined.
      return null;
    }
    if (lo <= 0 && 0 <= hi) return 0;
    if (lo > 0) return Math.ceil(lo);
    return Math.floor(hi);
  }

  // ── Thermograph ──
  // Returns { leftWall, rightWall, mean, temperature, valueRange } where each
  // wall is an array of { t, v } breakpoints (numbers) sorted by ascending t.
  // Returns null when the game can't reasonably be thermographed (infinite,
  // loopy, or recursion depth blows past a sane bound).
  computeThermograph(game, depth = 0) {
    if (!game) return null;
    if (game.infinite || game.loopy) return null;
    if (depth > 8) return null;

    if (game.isNumber && game.numericValue) {
      const v = game.numericValue.toNumber();
      // Pure number → vertical line at x = v for all temperatures ≥ 0.
      // We mark temperature as -1 (sub-zero, "frozen") so the renderer can
      // distinguish a cold number from an actually-thermal game.
      return {
        leftWall: [{ t: 0, v }, { t: 4, v }],
        rightWall: [{ t: 0, v }, { t: 4, v }],
        mean: v,
        temperature: -1,
        valueRange: [v - 1, v + 1],
      };
    }

    if (game.switchInfo) {
      const m = game.switchInfo.mean.toNumber();
      const tmp = game.switchInfo.temperature.toNumber();
      const a = m + tmp;
      const b = m - tmp;
      const top = tmp + Math.max(0.6, tmp * 0.4);
      return {
        leftWall: [{ t: 0, v: a }, { t: tmp, v: m }, { t: top, v: m }],
        rightWall: [{ t: 0, v: b }, { t: tmp, v: m }, { t: top, v: m }],
        mean: m,
        temperature: tmp,
        valueRange: [b - 0.5, a + 0.5],
      };
    }

    // General recursion: thermograph each option, sample walls.
    if (game.left.length === 0 && game.right.length === 0) {
      // {|} = 0 special case
      return this.computeThermograph(this.zero, depth + 1);
    }

    const leftThermos = [];
    for (const opt of game.left) {
      const t = this.computeThermograph(opt, depth + 1);
      if (!t) return null;
      leftThermos.push(t);
    }
    const rightThermos = [];
    for (const opt of game.right) {
      const t = this.computeThermograph(opt, depth + 1);
      if (!t) return null;
      rightThermos.push(t);
    }

    const evalWall = (wall, t) => {
      if (wall.length === 0) return 0;
      if (t <= wall[0].t) return wall[0].v;
      for (let i = 0; i < wall.length - 1; i += 1) {
        if (t >= wall[i].t && t <= wall[i + 1].t) {
          const dt = wall[i + 1].t - wall[i].t;
          if (dt === 0) return wall[i + 1].v;
          const frac = (t - wall[i].t) / dt;
          return wall[i].v + (frac * (wall[i + 1].v - wall[i].v));
        }
      }
      return wall[wall.length - 1].v;
    };

    // Sample at fine grid; find where left wall ≤ right wall (the meeting point).
    const samples = 96;
    const tMax = 4;
    const leftPts = [];
    const rightPts = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = (tMax * i) / samples;
      let lv = -Infinity;
      for (const th of leftThermos) lv = Math.max(lv, evalWall(th.rightWall, t) - t);
      let rv = Infinity;
      for (const th of rightThermos) rv = Math.min(rv, evalWall(th.leftWall, t) + t);
      if (game.left.length === 0) lv = rv; // {|R}: no Left option, walls coincide on Right's reach
      if (game.right.length === 0) rv = lv;
      leftPts.push({ t, v: lv });
      rightPts.push({ t, v: rv });
    }

    // Find meeting point: smallest t where leftPts[i].v ≤ rightPts[i].v after
    // they were strictly separated. Use bisection-style: iterate forward, when
    // walls cross, snap to the intersection.
    let meetT = tMax;
    let meetV = (leftPts[0].v + rightPts[0].v) / 2;
    for (let i = 1; i <= samples; i += 1) {
      const prev = i - 1;
      const lDelta = leftPts[i].v - rightPts[i].v;
      const lDeltaPrev = leftPts[prev].v - rightPts[prev].v;
      if (lDelta <= 0 && lDeltaPrev > 0) {
        // Crossing between prev and i. Linear interpolation for sub-sample resolution.
        const span = lDeltaPrev - lDelta;
        const frac = span === 0 ? 0 : lDeltaPrev / span;
        meetT = leftPts[prev].t + (frac * (leftPts[i].t - leftPts[prev].t));
        meetV = leftPts[prev].v + (frac * (leftPts[i].v - leftPts[prev].v));
        break;
      }
      if (lDelta <= 0 && i === 1) {
        // Already crossed at t=0 — degenerate, treat as cold.
        meetT = 0;
        meetV = leftPts[0].v;
        break;
      }
    }

    // Build clipped walls: keep only the segment up to meetT, then add the
    // mean as a flat top.
    const leftWall = leftPts.filter((p) => p.t <= meetT).concat([{ t: meetT, v: meetV }, { t: meetT + 0.6, v: meetV }]);
    const rightWall = rightPts.filter((p) => p.t <= meetT).concat([{ t: meetT, v: meetV }, { t: meetT + 0.6, v: meetV }]);

    // Compress walls: merge collinear consecutive segments to keep output tight.
    const compress = (wall) => {
      if (wall.length < 3) return wall;
      const out = [wall[0]];
      for (let i = 1; i < wall.length - 1; i += 1) {
        const prev = out[out.length - 1];
        const next = wall[i + 1];
        const slope1 = (wall[i].v - prev.v) / Math.max(1e-9, wall[i].t - prev.t);
        const slope2 = (next.v - wall[i].v) / Math.max(1e-9, next.t - wall[i].t);
        if (Math.abs(slope1 - slope2) > 0.01) out.push(wall[i]);
      }
      out.push(wall[wall.length - 1]);
      return out;
    };

    const allValues = [...leftPts, ...rightPts].map((p) => p.v).filter(Number.isFinite);
    const minV = Math.min(meetV - 0.5, ...allValues);
    const maxV = Math.max(meetV + 0.5, ...allValues);

    return {
      leftWall: compress(leftWall),
      rightWall: compress(rightWall),
      mean: meetV,
      temperature: meetT,
      valueRange: [minV - 0.4, maxV + 0.4],
    };
  }
}

function relationSummary(relation) {
  if (relation === "gt") {
    return "Blue-favored";
  }
  if (relation === "lt") {
    return "Red-favored";
  }
  if (relation === "eq") {
    return "Previous-player win";
  }
  if (relation === "draw") {
    return "Loopy draw";
  }
  return "Next-player win";
}

function outcomeDetails(relation) {
  if (relation === "gt") {
    return {
      outcomeClass: "L",
      outcomeName: "Blue wins whoever starts",
      shortOutcome: "Blue always wins",
      leftStartWinner: "Blue",
      rightStartWinner: "Blue",
      currentPlayerResult: {
        left: "Current player wins: Blue.",
        right: "Current player loses: Blue still wins.",
      },
    };
  }

  if (relation === "lt") {
    return {
      outcomeClass: "R",
      outcomeName: "Red wins whoever starts",
      shortOutcome: "Red always wins",
      leftStartWinner: "Red",
      rightStartWinner: "Red",
      currentPlayerResult: {
        left: "Current player loses: Red still wins.",
        right: "Current player wins: Red.",
      },
    };
  }

  if (relation === "eq") {
    return {
      outcomeClass: "P",
      outcomeName: "Previous player wins",
      shortOutcome: "Second player wins",
      leftStartWinner: "Red",
      rightStartWinner: "Blue",
      currentPlayerResult: {
        left: "Current player loses: Red wins with Blue to move.",
        right: "Current player loses: Blue wins with Red to move.",
      },
    };
  }

  if (relation === "draw") {
    return {
      outcomeClass: "D",
      outcomeName: "Draw / infinite play available",
      shortOutcome: "Draw available",
      leftStartWinner: "Draw",
      rightStartWinner: "Draw",
      currentPlayerResult: {
        left: "Either side can keep the loop alive indefinitely.",
        right: "Either side can keep the loop alive indefinitely.",
      },
    };
  }

  return {
    outcomeClass: "N",
    outcomeName: "Next player wins",
    shortOutcome: "First player wins",
    leftStartWinner: "Blue",
    rightStartWinner: "Red",
    currentPlayerResult: {
      left: "Current player wins: Blue with Blue to move.",
      right: "Current player wins: Red with Red to move.",
    },
  };
}

function moveWinsForPlayer(relation, player) {
  if (player === LEFT) {
    return relation === "gt" || relation === "eq";
  }
  return relation === "lt" || relation === "eq";
}

function heuristicScore(move, player) {
  const relationScores = player === LEFT
    ? { gt: 4, eq: 3, fuzzy: 2, lt: 1 }
    : { lt: 4, eq: 3, fuzzy: 2, gt: 1 };
  const primary = relationScores[move.resultingValue.relationToZero] ?? 0;
  let secondary = move.resultingValue.heuristicValue ?? 0;

  if (player === RIGHT) {
    secondary *= -1;
  }

  return {
    primary,
    secondary,
    tertiary: -move.remainingEdges,
  };
}

function betterMove(leftMove, rightMove, player, solver) {
  const directRelation = solver.compare(leftMove.game, rightMove.game);
  if (directRelation === "gt") {
    return player === LEFT ? leftMove : rightMove;
  }
  if (directRelation === "lt") {
    return player === LEFT ? rightMove : leftMove;
  }

  const leftScore = heuristicScore(leftMove, player);
  const rightScore = heuristicScore(rightMove, player);

  if (leftScore.primary !== rightScore.primary) {
    return leftScore.primary > rightScore.primary ? leftMove : rightMove;
  }

  if (leftScore.secondary !== rightScore.secondary) {
    return leftScore.secondary > rightScore.secondary ? leftMove : rightMove;
  }

  if (leftScore.tertiary !== rightScore.tertiary) {
    return leftScore.tertiary > rightScore.tertiary ? leftMove : rightMove;
  }

  return leftMove.label.localeCompare(rightMove.label) <= 0 ? leftMove : rightMove;
}

function analyzeMovesForPlayer(position, player, solver) {
  const moves = legalMoves(position, player).map((edge) => {
    const resultingPosition = applyMove(position, edge.id);
    const game = solver.solve(resultingPosition);
    const resultingValue = solver.valueSummary(game);
    return {
      edgeId: edge.id,
      edgeColor: edge.color,
      stable: edge.stable,
      label: edgeReferenceLabel(edge),
      player,
      resultingPosition,
      resultingValue,
      game,
      remainingEdges: resultingPosition.edges.length,
      winning: moveWinsForPlayer(resultingValue.relationToZero, player),
    };
  });

  let recommendation = null;
  for (const move of moves) {
    recommendation = recommendation === null
      ? move
      : betterMove(recommendation, move, player, solver);
  }

  return {
    moves,
    recommendation,
  };
}

function enumerateMovesWithoutScoring(position, player) {
  const moves = legalMoves(position, player).map((edge) => {
    const resultingPosition = applyMove(position, edge.id);
    return {
      edgeId: edge.id,
      edgeColor: edge.color,
      stable: edge.stable,
      label: edgeReferenceLabel(edge),
      player,
      resultingPosition,
      resultingValue: null,
      game: null,
      remainingEdges: resultingPosition.edges.length,
      winning: null,
      heuristicOnly: true,
    };
  });

  return {
    moves,
    recommendation: null,
  };
}

function explanationForValue(value) {
  if (value.kind === "infinite") {
    return `This is a transfinite game with value ${value.label}. Infinite positions represent omega-level surreal values arising from infinitely tall stalks.`;
  }
  if (value.kind === "number") {
    const bdayStr = value.birthday !== null ? ` Born on day ${value.birthday} of the surreal construction.` : "";
    return `This position is cold: its exact surreal number is ${value.number}.${bdayStr}`;
  }
  if (value.kind === "switch") {
    return `This is a hot game (switch). Mean value is ${value.mean}, temperature is ${value.temperature}. Each player wants to move to capture the temperature bonus.`;
  }
  if (value.kind === "nimber") {
    return `This is an impartial game (nimber). Both players have identical moves. By the Sprague-Grundy theorem, it behaves like a Nim heap of the indicated size.`;
  }
  if (value.kind === "infinitesimal") {
    return `This is an infinitesimal game \u2014 nonzero but smaller in magnitude than any positive surreal number. It still determines the winner when added to a zero-valued position.`;
  }
  return `This is not a surreal number in general. The engine reports the exact short-game form ${value.form}. The Colon Principle or thermographic analysis may simplify further study.`;
}

// Explains WHERE the value came from, using this position's own options, rather
// than a canned line keyed only on value.kind. Returns null whenever the
// options weren't actually scored, so a derivation is never invented.
function derivationFor(value, leftMoves, rightMoves, unavailable) {
  if (unavailable || !value) return null;
  const optionLabels = (moves) => {
    const seen = [];
    for (const move of moves ?? []) {
      const label = move.resultingValue?.label;
      if (label && !seen.includes(label)) seen.push(label);
    }
    return seen;
  };
  const left = optionLabels(leftMoves);
  const right = optionLabels(rightMoves);
  if (left.length === 0 && right.length === 0) {
    return "Neither player has a legal move, so whoever is to move loses immediately: the value is 0.";
  }
  // Long nested forms make the sentence unreadable, so summarise them.
  const shorten = (label) => (label.length <= 16 ? label : "a game form");
  const show = (arr) => {
    if (arr.length === 0) return "—";
    const shown = [...new Set(arr.slice(0, 3).map(shorten))];
    return shown.join(", ") + (arr.length > 3 ? ", …" : "");
  };
  const form = `Reading the options off the board, G = { ${show(left)} | ${show(right)} }.`;

  // Only claim the simplicity rule when the options really do bracket a gap.
  // Options like * are fuzzy with 0 and can reverse out, so a position can be a
  // number without every left option being below every right one — Deadlock is
  // exactly that case, and asserting the bracket there would be false.
  const asNumber = (label) => {
    const match = /^(-?\d+)(?:\/(\d+))?$/.exec(label);
    if (!match) return null;
    return Number(match[1]) / (match[2] ? Number(match[2]) : 1);
  };
  const leftNums = left.map(asNumber);
  const rightNums = right.map(asNumber);
  const bracketed = leftNums.every((n) => n !== null) && rightNums.every((n) => n !== null)
    && Math.max(...leftNums) < Math.min(...rightNums);
  if (left.length === 0) {
    return `${form} Blue has no move at all, so Red only has to run the position down; that is why it comes out to ${value.label}.`;
  }
  if (right.length === 0) {
    return `${form} Red has no move at all, so Blue only has to run the position down; that is why it comes out to ${value.label}.`;
  }
  if (value.kind === "number") {
    return bracketed
      ? `${form} Every Blue option is smaller than every Red option, so the simplicity rule applies: the value is the simplest number lying strictly between them, ${value.label}.`
      : `${form} Some of those options are fuzzy rather than plainly smaller or larger, so they reverse out under comparison; once they do, what is left is the number ${value.label}.`;
  }
  if (value.kind === "nimber") {
    const symmetric = left.length === right.length && left.every((l) => right.includes(l));
    return symmetric
      ? `${form} Both players face exactly the same options, so the game is impartial and its value is the mex — the least nimber missing from that set — which is ${value.label}.`
      : `${form} The two sides' options differ, yet they cancel exactly, leaving the nimber ${value.label}.`;
  }
  if (value.kind === "switch") {
    return `${form} Some Blue option is at least as big as some Red option, so no number fits between them and the game stays hot: it is the switch ${value.label}, worth moving in first.`;
  }
  if (value.kind === "infinitesimal") {
    return `${form} The options straddle 0 too tightly for any number to fit, which is what makes the value the infinitesimal ${value.label}.`;
  }
  return `${form} No number sits strictly between those options, so the value cannot collapse to a number and stays in game form.`;
}

// How much weight this answer can carry. The app colour-codes by `level`, so a
// heuristic or unsimplified result is never presented with the same confidence
// as an exactly solved one.
//
//   proved     — exact AND reduced by a proven shortcut (the Fusion Principle)
//   exact      — exactly solved and displayed in a recognised named form
//   unreduced  — exactly solved, but printed unsimplified because the canonical
//                form loop hit its iteration guard and bailed out. A fail-open
//                signal: correct value, bigger form. Unreachable in practice —
//                measured across all 98 loadable positions, nothing hits it.
//   heuristic  — pattern-matched rather than derived (transfinite, loopy, or a
//                mixed infinite stem where options could not be scored)
export function rigorOf(value, warnings = [], moveAnalysisUnavailable = false, fusionUsed = false) {
  const reasons = [];
  if (value?.infinite) reasons.push("Transfinite values are pattern-matched from edge topology, not derived.");
  if (value?.loopy) reasons.push("Loopy values cover five named forms only; this is not a general loopy solver.");
  if (moveAnalysisUnavailable) reasons.push("Options could not be scored here, so no move is guaranteed optimal.");
  for (const w of warnings) {
    if (/approximate|pattern|heuristic|not guaranteed/i.test(w)) reasons.push(w);
  }
  if (reasons.length) return { level: "heuristic", reasons };

  if (fusionUsed) {
    return {
      level: "proved",
      reasons: ["Reduced by the Fusion Principle: an all-green position is impartial, so its value is exactly this nimber."],
    };
  }
  const label = value?.label ?? "";
  if (value?.kind === "game" && label.length > 40 && !value?.canonical) {
    return {
      level: "unreduced",
      reasons: ["This value is exact, but the canonical-form loop stopped at its iteration guard rather than risk a wrong answer, so the form shown may be bigger than its simplest name."],
    };
  }
  if (value?.canonical) {
    return {
      level: "exact",
      reasons: ["Solved exactly and reduced to canonical form: dominated options removed and reversible options bypassed, so this is the game's simplest name."],
    };
  }
  return { level: "exact", reasons: [] };
}

function practicalityWarnings(position, value) {
  const warnings = [];
  const edgeCount = position.edges.length;
  const hasGreen = position.edges.some((edge) => edge.color === EDGE_COLORS.NEUTRAL);
  const hasStable = position.edges.some((edge) => edge.stable);
  const hasInfinite = position.edges.some((edge) => edge.infinite);
  const hasLoop = position.edges.some((edge) => edge.loop);
  const isEasyExactKind = value.kind === "number" || value.kind === "infinite" || value.kind === "nimber";

  if (value.approximate) {
    warnings.push("Using heuristic pattern shortcuts; optimistic recommendations are not guaranteed.");
  }

  if (hasInfinite) {
    warnings.push("This position contains infinite edges. Transfinite analysis is experimental and uses simplified omega-level pattern matching.");
  }

  if (hasLoop || value.kind === "loopy") {
    warnings.push("Loopy game (perpetual moves). Outcome is determined directly by the loopy value (on/off/over/under/dud + finite shift); auto-play resolves immediately rather than playing it out, since loopy positions don't terminate under optimal play.");
  }

  if (value.displayTruncated) {
    warnings.push("Exact symbolic form was abbreviated to keep analysis responsive.");
  }

  if (!isEasyExactKind) {
    warnings.push("Not every finite Hackenbush position is a surreal number. Mixed positions can be hot or fuzzy, so the exact answer may be a general game form instead.");
  }

  if ((hasGreen || hasStable) && value.kind !== "nimber") {
    warnings.push("Green edges and stable no-fall edges make exact analysis much harder. Small positions are practical; large hot positions usually are not.");
  }

  if (edgeCount >= 12 && !isEasyExactKind) {
    warnings.push("Exact recursive search grows very quickly around a dozen active edges unless the position splits into independent grounded components.");
  }

  if (hasStable) {
    warnings.push("Stable no-fall edges are treated here as an experimental anchor extension. They are useful, but they are not part of the standard Red-Blue-Green Hackenbush ruleset.");
  }

  return warnings;
}

function shouldSkipMoveAnalysis(position, value) {
  if (!value.approximate) return false;
  const infiniteEdges = position.edges.filter((edge) => edge.infinite);
  const finiteEdges = position.edges.filter((edge) => !edge.infinite);
  if (infiniteEdges.length < 2 || finiteEdges.length === 0) return false;

  const infinitePalette = new Set(infiniteEdges.map((edge) => edge.color));
  const finitePalette = new Set(finiteEdges.map((edge) => edge.color));
  const mixedInfinite = infinitePalette.size >= 2;
  const finiteGreen = finitePalette.has(EDGE_COLORS.NEUTRAL);
  const mixedFinite = finitePalette.size >= 2;

  return mixedInfinite || finiteGreen || mixedFinite;
}

export function analyzePosition(position, limits, options = {}) {
  const verbose = Boolean(options.verbose);
  const normalized = normalizePosition(position);
  const solver = new Solver(limits, verbose);
  solver.onProgress = options.onProgress ?? null;

  solver.log(`Normalized position: ${normalized.edges.length} edges, ${normalized.nodes.length} nodes`);

  const game = solver.solve(normalized);
  const value = solver.valueSummary(game);
  // Finite short games are now fully canonicalized (domination + reversible
  // bypass); the flag lets the rigor badge distinguish a genuinely canonical
  // long form from one the simplifier had to leave alone (loopy/transfinite).
  value.canonical = game.canonical === true;

  solver.log(`Final value: ${value.label} (${value.subtitle})`);
  solver.log(`Outcome class: ${value.outcomeClass} \u2014 ${value.outcomeName}`);

  const moveAnalysisUnavailable = shouldSkipMoveAnalysis(normalized, value);
  const leftMoves = moveAnalysisUnavailable
    ? enumerateMovesWithoutScoring(normalized, LEFT)
    : analyzeMovesForPlayer(normalized, LEFT, solver);
  const rightMoves = moveAnalysisUnavailable
    ? enumerateMovesWithoutScoring(normalized, RIGHT)
    : analyzeMovesForPlayer(normalized, RIGHT, solver);

  if (moveAnalysisUnavailable) {
    solver.log("Skipping exact move scoring for a mixed finite/infinite heuristic pattern");
  }

  if (leftMoves.recommendation) {
    solver.log(`Blue best: ${leftMoves.recommendation.label} \u2192 ${leftMoves.recommendation.resultingValue.label}`);
  }
  if (rightMoves.recommendation) {
    solver.log(`Red best: ${rightMoves.recommendation.label} \u2192 ${rightMoves.recommendation.resultingValue.label}`);
  }

  const components = independentComponents(normalized);
  const componentAnalysis = components.map((comp, i) => {
    const compGame = solver.solve(comp);
    const compValue = solver.valueSummary(compGame);
    return {
      index: i,
      edgeCount: comp.edges.length,
      edges: comp.edges.map((e) => ({ id: e.id, color: e.color })),
      value: compValue,
      gameTree: solver.gameTree(compGame),
    };
  });

  const warnings = practicalityWarnings(normalized, value);
  if (moveAnalysisUnavailable) {
    warnings.push("Move scoring is unavailable for this mixed infinite stem pattern; only legal moves are enumerated and optimism is not guaranteed.");
  }

  return {
    normalizedPosition: normalized,
    value,
    explanation: explanationForValue(value),
    derivation: derivationFor(value, leftMoves.moves, rightMoves.moves, moveAnalysisUnavailable),
    moves: {
      left: leftMoves.moves,
      right: rightMoves.moves,
    },
    recommendations: {
      left: leftMoves.recommendation,
      right: rightMoves.recommendation,
    },
    stats: {
      nodeCount: normalized.nodes.length,
      edgeCount: normalized.edges.length,
      positionStates: solver.positionMemo.size,
      gameStates: solver.gamesBySignature.size,
      sumStates: solver.sumMemo.size,
      independentComponents: Math.max(components.length, normalized.edges.length === 0 ? 0 : 1),
    },
    components: componentAnalysis,
    gameTree: solver.gameTree(game),
    trace: solver.trace,
    moveAnalysisUnavailable,
    warnings,
    // "proved" only when the WHOLE position is all-green, so the Fusion
    // Principle accounts for the entire answer rather than one component of it.
    rigor: rigorOf(value, warnings, moveAnalysisUnavailable, isAllGreen(normalized)),
  };
}

export function analyzeAbstractExample(exampleOrId) {
  const example = typeof exampleOrId === "string"
    ? exampleLibrary().find((entry) => entry.id === exampleOrId)
    : exampleOrId;

  if (!example || example.mode !== "abstract" || !example.abstractAnalysis) {
    throw new Error(`Unknown abstract example: ${typeof exampleOrId === "string" ? exampleOrId : "<inline>"}`);
  }

  const spec = example.abstractAnalysis;
  const outcome = spec.relationToZero ? outcomeDetails(spec.relationToZero) : outcomeDetails("fuzzy");
  const value = {
    kind: spec.kind ?? "game",
    label: spec.label ?? example.notation ?? example.name,
    form: spec.form ?? spec.label ?? example.notation ?? example.name,
    subtitle: spec.subtitle ?? "Pattern-modeled reference analysis",
    number: spec.number ?? null,
    mean: spec.mean ?? null,
    temperature: spec.temperature ?? null,
    heuristicValue: spec.heuristicValue ?? 0,
    birthday: spec.birthday ?? null,
    constructionPath: spec.constructionPath ?? null,
    approximate: spec.approximate ?? true,
    displayTruncated: false,
    outcomeClass: spec.outcomeClass ?? outcome.outcomeClass,
    outcomeName: spec.outcomeName ?? outcome.outcomeName,
    shortOutcome: spec.shortOutcome ?? outcome.shortOutcome,
    leftStartWinner: spec.leftStartWinner ?? outcome.leftStartWinner,
    rightStartWinner: spec.rightStartWinner ?? outcome.rightStartWinner,
    currentPlayerResult: spec.currentPlayerResult ?? outcome.currentPlayerResult,
    relationToZero: spec.relationToZero ?? "fuzzy",
  };

  return {
    normalizedPosition: { nodes: [], edges: [] },
    value,
    explanation: spec.explanation ?? example.note ?? "Named reference analysis.",
    moves: {
      left: [],
      right: [],
    },
    recommendations: {
      left: null,
      right: null,
    },
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      positionStates: 0,
      gameStates: 0,
      sumStates: 0,
      independentComponents: 0,
    },
    components: [],
    gameTree: spec.gameTree ?? null,
    trace: [],
    warnings: [...(spec.warnings ?? [])],
    modeledReference: {
      id: example.id,
      name: example.name,
      support: example.support,
    },
  };
}

function groundedStalkPreset(idPrefix, colors, startX) {
  const nodes = [
    { id: `${idPrefix}-g`, x: startX, y: 560, ground: true },
  ];
  const edges = [];
  let previousId = `${idPrefix}-g`;

  colors.forEach((color, index) => {
    const nodeId = `${idPrefix}-n${index}`;
    nodes.push({
      id: nodeId,
      x: startX,
      y: 460 - (index * 100),
      ground: false,
    });
    edges.push({
      id: `${idPrefix}-e${index}`,
      a: previousId,
      b: nodeId,
      color,
      stable: false,
    });
    previousId = nodeId;
  });

  return {
    nodes,
    edges,
  };
}

function greenForkPreset() {
  return {
    nodes: [
      { id: "g0", x: 490, y: 560, ground: true },
      { id: "n0", x: 490, y: 410, ground: false },
      { id: "n1", x: 360, y: 270, ground: false },
      { id: "n2", x: 620, y: 270, ground: false },
    ],
    edges: [
      { id: "e0", a: "g0", b: "n0", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "e1", a: "n0", b: "n1", color: EDGE_COLORS.LEFT, stable: false },
      { id: "e2", a: "n0", b: "n2", color: EDGE_COLORS.RIGHT, stable: false },
    ],
  };
}

function stableAnchorPreset() {
  return {
    nodes: [
      { id: "n0", x: 320, y: 350, ground: false },
      { id: "n1", x: 500, y: 350, ground: false },
      { id: "n2", x: 640, y: 220, ground: false },
      { id: "n3", x: 640, y: 480, ground: false },
    ],
    edges: [
      { id: "e0", a: "n0", b: "n1", color: EDGE_COLORS.NEUTRAL, stable: true },
      { id: "e1", a: "n1", b: "n2", color: EDGE_COLORS.LEFT, stable: false },
      { id: "e2", a: "n1", b: "n3", color: EDGE_COLORS.RIGHT, stable: false },
    ],
  };
}

// Roof preset family — stable edges that act as uncuttable horizontal beams,
// generating hot games because cuts beneath the roof don't collapse the roof.

function roofedTrioPreset() {
  // Two grounded posts connected by a stable green roof. Each post has a
  // partisan stalk hanging off the roof's anchor node. Cutting either
  // grounded green leaves the roof intact and shifts the value.
  return {
    nodes: [
      { id: "g0", x: 320, y: 560, ground: true },
      { id: "g1", x: 660, y: 560, ground: true },
      { id: "p0", x: 320, y: 320, ground: false },
      { id: "p1", x: 660, y: 320, ground: false },
      { id: "tb", x: 280, y: 180, ground: false },
      { id: "tr", x: 700, y: 180, ground: false },
    ],
    edges: [
      { id: "post-l", a: "g0", b: "p0", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "post-r", a: "g1", b: "p1", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "roof",   a: "p0", b: "p1", color: EDGE_COLORS.NEUTRAL, stable: true },
      { id: "blue",   a: "p0", b: "tb", color: EDGE_COLORS.LEFT,    stable: false },
      { id: "red",    a: "p1", b: "tr", color: EDGE_COLORS.RIGHT,   stable: false },
    ],
  };
}

function stableTowerPreset() {
  // Tall column: cuttable green at the base, stable green in the middle
  // (the "no-fall" segment), and a partisan tip on top. Whoever cuts the
  // base green leaves the upper half hanging on the stable rung.
  return {
    nodes: [
      { id: "g0", x: 500, y: 560, ground: true },
      { id: "n1", x: 500, y: 460, ground: false },
      { id: "n2", x: 500, y: 360, ground: false },
      { id: "n3", x: 500, y: 260, ground: false },
      { id: "tb", x: 440, y: 160, ground: false },
      { id: "tr", x: 560, y: 160, ground: false },
    ],
    edges: [
      { id: "base",  a: "g0", b: "n1", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "lower", a: "n1", b: "n2", color: EDGE_COLORS.NEUTRAL, stable: true },
      { id: "upper", a: "n2", b: "n3", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "blue",  a: "n3", b: "tb", color: EDGE_COLORS.LEFT,    stable: false },
      { id: "red",   a: "n3", b: "tr", color: EDGE_COLORS.RIGHT,   stable: false },
    ],
  };
}

// Up-star and down-star presets — the simplest CONCRETE Hackenbush
// positions whose values are ↑* and ↓*. Useful playground for understanding
// infinitesimals beyond ↑ / ↓.
//
// Pattern: ground → green → mid → partisan → tip.
//   Cutting the green drops everything → 0 (option for either player)
//   Cutting the partisan: partisan removed, mid hangs on green → single green = *
// Blue options for blue tip: { 0, * }; Red options: { 0 }. Game form: { 0, * | 0 } = ↑*.
function upStarPreset() {
  return {
    nodes: [
      { id: "g0", x: 500, y: 560, ground: true },
      { id: "m",  x: 500, y: 400, ground: false },
      { id: "t",  x: 500, y: 240, ground: false },
    ],
    edges: [
      { id: "stem", a: "g0", b: "m", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "tip",  a: "m",  b: "t", color: EDGE_COLORS.LEFT,    stable: false },
    ],
  };
}
function downStarPreset() {
  return {
    nodes: [
      { id: "g0", x: 500, y: 560, ground: true },
      { id: "m",  x: 500, y: 400, ground: false },
      { id: "t",  x: 500, y: 240, ground: false },
    ],
    edges: [
      { id: "stem", a: "g0", b: "m", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "tip",  a: "m",  b: "t", color: EDGE_COLORS.RIGHT,   stable: false },
    ],
  };
}

// Tiny / Miny generators for arbitrary positive G — these are ABSTRACT
// reference structures. We expose tiny(2) and tiny(3) (plus miny mirrors)
// alongside the existing tiny(1) so users can see how the family scales.
function tinyEdgeFor(value, color) {
  // tiny(G) = { 0 | { 0 | -G } }. The Right option is itself a switch
  // {0 | -G}.
  // Since tiny isn't realizable as a pure short Hackenbush position, we
  // only model it as an abstract entry — value field carries the explicit
  // game-tree shape.
  return { value, color };
}

function greenhousePreset() {
  // A "house with two roof beams" — two stable horizontal greens form a
  // double-tier roof, with partisan stalks tucked under each tier. Heavily
  // hot because Blue and Red trade strikes across multiple roof bays.
  return {
    nodes: [
      { id: "g0", x: 280, y: 560, ground: true },
      { id: "g1", x: 700, y: 560, ground: true },
      { id: "p0", x: 280, y: 380, ground: false },
      { id: "p1", x: 490, y: 380, ground: false },
      { id: "p2", x: 700, y: 380, ground: false },
      { id: "p3", x: 490, y: 240, ground: false },
      { id: "tb", x: 280, y: 220, ground: false },
      { id: "tr", x: 700, y: 220, ground: false },
      { id: "tg", x: 490, y: 100, ground: false },
    ],
    edges: [
      { id: "post-l", a: "g0", b: "p0", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "post-r", a: "g1", b: "p2", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "lower-l-roof", a: "p0", b: "p1", color: EDGE_COLORS.NEUTRAL, stable: true },
      { id: "lower-r-roof", a: "p1", b: "p2", color: EDGE_COLORS.NEUTRAL, stable: true },
      { id: "blue-tier", a: "p0", b: "tb", color: EDGE_COLORS.LEFT,  stable: false },
      { id: "red-tier",  a: "p2", b: "tr", color: EDGE_COLORS.RIGHT, stable: false },
      { id: "spire",     a: "p1", b: "p3", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "spire-top", a: "p3", b: "tg", color: EDGE_COLORS.NEUTRAL, stable: false },
    ],
  };
}

function zeroSumPreset() {
  return {
    nodes: [
      { id: "g0", x: 340, y: 560, ground: true },
      { id: "g1", x: 620, y: 560, ground: true },
      { id: "n0", x: 340, y: 380, ground: false },
      { id: "n1", x: 620, y: 380, ground: false },
    ],
    edges: [
      { id: "e0", a: "g0", b: "n0", color: EDGE_COLORS.LEFT, stable: false },
      { id: "e1", a: "g1", b: "n1", color: EDGE_COLORS.RIGHT, stable: false },
    ],
  };
}

function combinePositions(parts) {
  return {
    nodes: parts.flatMap((part) => part.nodes.map(cloneNode)),
    edges: parts.flatMap((part) => part.edges.map(cloneEdge)),
  };
}

function infiniteStalkPreset(idPrefix, color, startX) {
  return {
    nodes: [
      { id: `${idPrefix}-g`, x: startX, y: 560, ground: true },
      { id: `${idPrefix}-n0`, x: startX, y: 200, ground: false },
    ],
    edges: [{
      id: `${idPrefix}-inf`,
      a: `${idPrefix}-g`,
      b: `${idPrefix}-n0`,
      color,
      stable: false,
      infinite: true,
      pattern: "stalk",
    }],
  };
}

function loopyEdgePreset(idPrefix, color, startX, loopKind = null) {
  return {
    nodes: [
      { id: `${idPrefix}-g`, x: startX, y: 560, ground: true },
      { id: `${idPrefix}-n0`, x: startX, y: 220, ground: false },
    ],
    edges: [{
      id: `${idPrefix}-loop`,
      a: `${idPrefix}-g`,
      b: `${idPrefix}-n0`,
      color,
      stable: false,
      loop: true,
      loopKind,
    }],
  };
}

function grassPreset(idPrefix, count, startX) {
  const ground = { id: `${idPrefix}-g`, x: startX, y: 560, ground: true };
  const nodes = [ground];
  const edges = [];
  const spread = Math.min(30, 120 / count);
  for (let i = 0; i < count; i++) {
    const angle = ((i - (count - 1) / 2) * spread * Math.PI) / 180;
    const topX = startX + Math.sin(angle) * 340;
    const topY = 200 - Math.abs(i - (count - 1) / 2) * 15;
    const nid = `${idPrefix}-n${i}`;
    nodes.push({ id: nid, x: topX, y: topY, ground: false });
    edges.push({
      id: `${idPrefix}-inf${i}`,
      a: ground.id,
      b: nid,
      color: EDGE_COLORS.NEUTRAL,
      stable: false,
      infinite: true,
      pattern: "grass",
    });
  }
  return { nodes, edges };
}

function flowerPreset(idPrefix, petalColors, startX) {
  const ground = { id: `${idPrefix}-g`, x: startX, y: 560, ground: true };
  const hub = { id: `${idPrefix}-hub`, x: startX, y: 360, ground: false };
  const stem = {
    id: `${idPrefix}-stem`,
    a: ground.id,
    b: hub.id,
    color: EDGE_COLORS.NEUTRAL,
    stable: false,
  };
  const nodes = [ground, hub];
  const edges = [stem];
  const count = petalColors.length;
  const spread = Math.min(40, 160 / count);
  for (let i = 0; i < count; i++) {
    const angle = ((i - (count - 1) / 2) * spread * Math.PI) / 180;
    const tipX = startX + Math.sin(angle) * 200;
    const tipY = 360 - Math.cos(angle) * 180;
    const nid = `${idPrefix}-p${i}`;
    nodes.push({ id: nid, x: tipX, y: tipY, ground: false });
    edges.push({
      id: `${idPrefix}-petal${i}`,
      a: hub.id,
      b: nid,
      color: petalColors[i],
      stable: false,
      infinite: true,
      pattern: "flower",
    });
  }
  return { nodes, edges };
}

function ordinalTowerPreset(idPrefix, type, startX) {
  const ground = { id: `${idPrefix}-g`, x: startX, y: 560, ground: true };
  if (type === "omega-times-2") {
    const mid = { id: `${idPrefix}-mid`, x: startX, y: 380, ground: false };
    const top = { id: `${idPrefix}-top`, x: startX, y: 200, ground: false };
    return {
      nodes: [ground, mid, top],
      edges: [
        { id: `${idPrefix}-inf0`, a: ground.id, b: mid.id, color: EDGE_COLORS.LEFT, stable: false, infinite: true, pattern: "tower" },
        { id: `${idPrefix}-inf1`, a: mid.id, b: top.id, color: EDGE_COLORS.LEFT, stable: false, infinite: true, pattern: "tower" },
      ],
    };
  }
  if (type === "omega-plus-n") {
    const mid = { id: `${idPrefix}-mid`, x: startX, y: 340, ground: false };
    const nodes = [ground, mid];
    const edges = [
      { id: `${idPrefix}-inf`, a: ground.id, b: mid.id, color: EDGE_COLORS.LEFT, stable: false, infinite: true, pattern: "stalk" },
    ];
    // 3 finite edges above
    let prev = mid.id;
    for (let i = 0; i < 3; i++) {
      const nid = `${idPrefix}-f${i}`;
      nodes.push({ id: nid, x: startX, y: 280 - i * 60, ground: false });
      edges.push({ id: `${idPrefix}-e${i}`, a: prev, b: nid, color: EDGE_COLORS.LEFT, stable: false });
      prev = nid;
    }
    return { nodes, edges };
  }
  // omega-squared: infinite stalk with infinite branches
  const mid = { id: `${idPrefix}-mid`, x: startX, y: 380, ground: false };
  const nodes = [ground, mid];
  const edges = [
    { id: `${idPrefix}-inf0`, a: ground.id, b: mid.id, color: EDGE_COLORS.LEFT, stable: false, infinite: true, pattern: "tower" },
  ];
  // Two infinite branches from mid
  for (let i = 0; i < 2; i++) {
    const bx = startX + (i === 0 ? -80 : 80);
    const nid = `${idPrefix}-br${i}`;
    nodes.push({ id: nid, x: bx, y: 200, ground: false });
    edges.push({ id: `${idPrefix}-binf${i}`, a: mid.id, b: nid, color: EDGE_COLORS.LEFT, stable: false, infinite: true, pattern: "tower" });
  }
  return { nodes, edges };
}

function balancedMarathonPreset() {
  return combinePositions([
    groundedStalkPreset("balanced-b0", [EDGE_COLORS.LEFT], 120),
    groundedStalkPreset("balanced-b1", [EDGE_COLORS.LEFT], 250),
    groundedStalkPreset("balanced-b2", [EDGE_COLORS.LEFT], 380),
    groundedStalkPreset("balanced-r0", [EDGE_COLORS.RIGHT], 610),
    groundedStalkPreset("balanced-r1", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 780),
  ]);
}

function mirrorMarathonPreset() {
  return combinePositions([
    groundedStalkPreset("mirror-b", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 120),
    groundedStalkPreset("mirror-r", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 280),
    groundedStalkPreset("mirror-half", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 480),
    groundedStalkPreset("mirror-neghalf", [EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT], 680),
  ]);
}

function blueMarathonPreset() {
  return combinePositions([
    groundedStalkPreset("blue-marathon-b0", [EDGE_COLORS.LEFT], 120),
    groundedStalkPreset("blue-marathon-b1", [EDGE_COLORS.LEFT], 250),
    groundedStalkPreset("blue-marathon-b2", [EDGE_COLORS.LEFT], 380),
    groundedStalkPreset("blue-marathon-neghalf", [EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT], 560),
    groundedStalkPreset("blue-marathon-r", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 780),
  ]);
}

function quarterRacePreset() {
  return combinePositions([
    groundedStalkPreset("quarter-race-b", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 110),
    groundedStalkPreset("quarter-race-r", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 270),
    groundedStalkPreset("quarter-race-quarter", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 470),
    groundedStalkPreset("quarter-race-b1", [EDGE_COLORS.LEFT], 690),
    groundedStalkPreset("quarter-race-r1", [EDGE_COLORS.RIGHT], 840),
  ]);
}

function hotBlueMarathonPreset() {
  return combinePositions([
    groundedStalkPreset("hot-blue-b0", [EDGE_COLORS.LEFT], 120),
    groundedStalkPreset("hot-blue-b1", [EDGE_COLORS.LEFT], 250),
    groundedStalkPreset("hot-blue-g", [EDGE_COLORS.NEUTRAL], 400),
    groundedStalkPreset("hot-blue-half", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 590),
    groundedStalkPreset("hot-blue-r", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 790),
  ]);
}

function hotRedMarathonPreset() {
  return combinePositions([
    groundedStalkPreset("hot-red-b0", [EDGE_COLORS.LEFT], 120),
    groundedStalkPreset("hot-red-b1", [EDGE_COLORS.LEFT], 250),
    groundedStalkPreset("hot-red-g", [EDGE_COLORS.NEUTRAL], 400),
    groundedStalkPreset("hot-red-neghalf", [EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT], 590),
    groundedStalkPreset("hot-red-r", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 790),
  ]);
}

function balancedSprigsPreset() {
  return combinePositions([
    groundedStalkPreset("balanced-sprig-blue", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.LEFT], 330),
    groundedStalkPreset("balanced-sprig-red", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.RIGHT], 650),
  ]);
}

function negativeQuarterPreset() {
  return groundedStalkPreset("neg-quarter", [EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 500);
}

function fiveEighthsPreset() {
  return groundedStalkPreset("five-eighths", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 500);
}

function nimberFourPreset() {
  return groundedStalkPreset("nimber-four", [
    EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL,
  ], 500);
}

function hotGamePreset() {
  return {
    nodes: [
      { id: "g0", x: 490, y: 560, ground: true },
      { id: "n0", x: 490, y: 410, ground: false },
      { id: "n1", x: 330, y: 260, ground: false },
      { id: "n2", x: 650, y: 260, ground: false },
    ],
    edges: [
      { id: "e0", a: "g0", b: "n0", color: EDGE_COLORS.NEUTRAL, stable: false },
      { id: "e1", a: "n0", b: "n1", color: EDGE_COLORS.LEFT, stable: false },
      { id: "e2", a: "n0", b: "n2", color: EDGE_COLORS.RIGHT, stable: false },
    ],
  };
}

function twoComponentRacePreset() {
  return combinePositions([
    groundedStalkPreset("race-a", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 200),
    groundedStalkPreset("race-b", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 400),
    groundedStalkPreset("race-c", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 600),
    groundedStalkPreset("race-d", [EDGE_COLORS.NEUTRAL], 800),
  ]);
}

function nimSumPreset() {
  return combinePositions([
    groundedStalkPreset("nim-a", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 300),
    groundedStalkPreset("nim-b", [EDGE_COLORS.NEUTRAL], 680),
  ]);
}

function presetEntry(id, name, notation, description, position, details = {}) {
  return {
    id,
    name,
    notation,
    description,
    mode: "loadable",
    support: "finite",
    position,
    ...details,
  };
}

function referenceEntry(id, name, notation, description, form, support, note, details = {}) {
  return {
    id,
    name,
    notation,
    description,
    form,
    mode: "reference",
    support,
    note,
    category: "reference",
    ...details,
  };
}

function abstractEntry(id, name, notation, description, note, abstractAnalysis, details = {}) {
  return {
    id,
    name,
    notation,
    description,
    mode: "abstract",
    support: abstractAnalysis.support ?? details.support ?? "reference-short",
    note,
    category: "reference",
    abstractAnalysis,
    ...details,
  };
}

function abstractTreeNode(label, left = [], right = [], details = {}) {
  return {
    label,
    left,
    right,
    isNumber: Boolean(details.isNumber),
    truncated: Boolean(details.truncated),
  };
}

function abstractNumberNode(label) {
  return abstractTreeNode(label, [], [], { isNumber: true });
}

function abstractLoopNode(label) {
  return abstractTreeNode(label, [], [], { truncated: true });
}

const SHORT_REFERENCE_PATTERN_WARNING = "Pattern-only support: no general constructor or solver for all finite reference values is implemented here yet; this card only covers named short forms structurally similar to this one.";
const LOOPY_PATTERN_WARNING = "Pattern-only loopy support: no general loopy solver is implemented here yet; this card only covers named loopy forms structurally similar to this one.";

export function presetLibrary() {
  return [
    presetEntry(
      "star",
      "Star",
      "*",
      "Single green grounded edge with value *.",
      groundedStalkPreset("star", [EDGE_COLORS.NEUTRAL], 500),
      { category: "nimbers" },
    ),
    presetEntry(
      "green-fork",
      "Green Fork",
      "*",
      "A green trunk with one blue and one red branch. Long labelled \u00b11 here, and it is not hot at all: every option is an infinitesimal, so the game is all-small, its temperature is 0, and in canonical form the whole thing is simply *.",
      greenForkPreset(),
      { category: "hot" },
    ),
    presetEntry(
      "green-two",
      "Green Two",
      "*2",
      "Winning Ways-style green bamboo stalk of length 2. In Green Hackenbush, bamboo stalks line up with Nim heaps.",
      groundedStalkPreset("green-two", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 500),
      {
        category: "nimbers",
        note: "Borrowed from the Green Hackenbush / nimber side of the literature. The solver now recognizes this as the nimber *2.",
      },
    ),
    presetEntry(
      "green-three",
      "Green Three",
      "*3",
      "A length-3 green bamboo stalk, giving a slightly richer impartial nimber example.",
      groundedStalkPreset("green-three", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 500),
      {
        category: "nimbers",
        note: "Another Green Hackenbush / Nim example. The exact value is the nimber *3.",
      },
    ),
    presetEntry(
      "half",
      "Half",
      "1/2",
      "Classic cold stalk with value 1/2.",
      groundedStalkPreset("half", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 500),
      { category: "numbers" },
    ),
    presetEntry(
      "quarter",
      "Quarter",
      "1/4",
      "Blue over red over red gives the dyadic number 1/4.",
      groundedStalkPreset("quarter", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 500),
      { category: "numbers" },
    ),
    presetEntry(
      "three-halves",
      "Three Halves",
      "3/2",
      "Blue over blue over red gives the dyadic number 3/2.",
      groundedStalkPreset("threehalves", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 500),
      { category: "numbers" },
    ),
    presetEntry(
      "blue-three",
      "Blue Three",
      "3",
      "Pure blue stalk with value 3.",
      groundedStalkPreset("blue", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 500),
      { category: "numbers" },
    ),
    presetEntry(
      "zero-sum",
      "Zero Sum",
      "0",
      "Independent blue and red edges that cancel to 0.",
      zeroSumPreset(),
      { category: "numbers" },
    ),
    presetEntry(
      "blue-sprig",
      "Blue Sprig",
      "sprig",
      "Winning Ways-inspired sprig: one rooted green edge with a single blue edge on top.",
      groundedStalkPreset("blue-sprig", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.LEFT], 500),
      {
        category: "infinitesimals",
        note: "Sprigs are the loop-free cousin of flowers. The solver reports the exact short-game form for this small star-based example.",
      },
    ),
    presetEntry(
      "red-sprig",
      "Red Sprig",
      "sprig",
      "The red mirror of the blue sprig, again with a single green root edge.",
      groundedStalkPreset("red-sprig", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.RIGHT], 500),
      {
        category: "infinitesimals",
        note: "A basic sprig-family test case from the flower-garden side of Hackenbush.",
      },
    ),
    presetEntry(
      "half-sprig",
      "Half Sprig",
      "sprig over 1/2",
      "A sprig whose red-blue string on top is the dyadic number 1/2.",
      groundedStalkPreset("half-sprig", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 500),
      {
        category: "infinitesimals",
        note: "Sprig family example: a green root edge with a 1/2 stalk above it.",
      },
    ),
    presetEntry(
      "balanced-sprigs",
      "Balanced Sprigs",
      "sprig + opposite sprig",
      "A small flower-garden style cancellation test: blue sprig plus the matching red sprig.",
      balancedSprigsPreset(),
      {
        category: "infinitesimals",
        note: "Borrowed from the sprig / flower-garden vocabulary. This one is a clean second-player-win sanity check.",
      },
    ),
    presetEntry(
      "neg-quarter",
      "Negative Quarter",
      "-1/4",
      "Red over blue over blue gives the dyadic number -1/4. The mirror of the quarter stalk.",
      negativeQuarterPreset(),
      { category: "numbers" },
    ),
    presetEntry(
      "five-eighths",
      "Five Eighths",
      "5/8",
      "An alternating blue-red-blue-red stalk producing the deeper dyadic fraction 5/8. Born on day 4 of the surreal construction.",
      fiveEighthsPreset(),
      { category: "numbers" },
    ),
    presetEntry(
      "one-eighth",
      "One Eighth",
      "1/8",
      "Blue-red-red-red stalk: deeper fractional descent. Born on day 4.",
      groundedStalkPreset("oneeighth", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 500),
      { category: "numbers" },
    ),
    presetEntry(
      "red-three",
      "Red Three",
      "-3",
      "Pure red stalk of length 3 — the mirror of Blue Three.",
      groundedStalkPreset("redthree", [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 500),
      { category: "numbers" },
    ),
    presetEntry(
      "mixed-trio",
      "Mixed Trio",
      "1 + 1/2 + (-1/4) = 5/4",
      "A composite of three independent stalks: one blue (=1), one half-stalk (=1/2), one negative-quarter (=-1/4). Sums to 5/4.",
      combinePositions([
        groundedStalkPreset("mt-blue", [EDGE_COLORS.LEFT], 200),
        groundedStalkPreset("mt-half", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 480),
        groundedStalkPreset("mt-negq", [EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 760),
      ]),
      { category: "composites", note: "Independent components decompose; the engine sums their exact rationals (1 + 1/2 - 1/4 = 5/4)." },
    ),
    presetEntry(
      "fraction-cascade",
      "Fraction Cascade",
      "1/2 + 1/4 + 1/8 = 7/8",
      "Three independent fractional stalks adding up to 7/8 — close-to-1 demo.",
      combinePositions([
        groundedStalkPreset("fc-half",    [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 200),
        groundedStalkPreset("fc-quarter", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 480),
        groundedStalkPreset("fc-eighth",  [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 760),
      ]),
      { category: "composites", note: "Educational: shows how dyadic stalks lengthen as the denominator grows. 1/2 born day 2, 1/4 day 3, 1/8 day 4." },
    ),
    presetEntry(
      "tight-race",
      "Tight Race",
      "2 + (-2) + 1/2 = 1/2",
      "A balanced 2-vs-2 sum plus a tie-breaking 1/2 stalk. Blue wins by exactly one half.",
      combinePositions([
        groundedStalkPreset("tr-2blue", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 200),
        groundedStalkPreset("tr-2red",  [EDGE_COLORS.RIGHT, EDGE_COLORS.RIGHT], 480),
        groundedStalkPreset("tr-half",  [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 760),
      ]),
      { category: "composites", note: "Sanity check: Blue wins whoever starts. Cancellation of the 2-blue and 2-red components shows in the perfect-play trace." },
    ),

    // === Symmetric mirrors — second-player wins via copy strategy ===
    presetEntry(
      "mirror-twin",
      "Mirror Twin",
      "BRBR + RBRB = 0",
      "Two stalks that are exact mirror images of each other. Whatever side the first player plays, the second player copies on the mirror — second-player wins.",
      combinePositions([
        groundedStalkPreset("mt-a", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 200),
        groundedStalkPreset("mt-b", [EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT], 700),
      ]),
      { category: "composites", note: "Demonstrates the mirror / copy strategy: 5/8 + (-5/8) = 0. Long perfect-play sequences (≈8 moves)." },
    ),
    presetEntry(
      "twin-greens",
      "Twin Greens",
      "*3 + *3 = 0",
      "Two identical 3-edge green bamboo stalks. By Sprague-Grundy XOR, *3 ⊕ *3 = 0. Mirror strategy wins.",
      combinePositions([
        groundedStalkPreset("tg-a", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 250),
        groundedStalkPreset("tg-b", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 700),
      ]),
      { category: "nimbers", note: "Whatever stalk Blue/Red shrinks, the second player mirrors on the other. 6 total moves before the game ends." },
    ),

    // === Non-trivial nimber composites ===
    presetEntry(
      "nimber-symphony",
      "Nimber Symphony",
      "*3 + *5 + *6 = 0",
      "Three green bamboo stalks of length 3, 5, and 6. By XOR: 011 ⊕ 101 ⊕ 110 = 000 — second-player wins. 14 total edges, deep strategic play.",
      combinePositions([
        groundedStalkPreset("ns-a", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 150),
        groundedStalkPreset("ns-b", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 480),
        groundedStalkPreset("ns-c", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 810),
      ]),
      { category: "nimbers", note: "Optimal play: reduce one stalk so the XOR of remaining heaps is 0. Multiple correct first moves." },
    ),
    presetEntry(
      "nimber-cascade",
      "Nimber Cascade",
      "*1 + *2 + *4 = *7",
      "Three green stalks of length 1, 2, 4. XOR = 001 ⊕ 010 ⊕ 100 = 111 = *7 — first-player wins.",
      combinePositions([
        groundedStalkPreset("nc-a", [EDGE_COLORS.NEUTRAL], 200),
        groundedStalkPreset("nc-b", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 480),
        groundedStalkPreset("nc-c", [EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL, EDGE_COLORS.NEUTRAL], 760),
      ]),
      { category: "nimbers", note: "Classic Nim with heaps 1, 2, 4. First player wins by moving the *4 stalk down to *3 (since 3 ⊕ 2 ⊕ 1 = 0)." },
    ),

    // === Long cold race ===
    presetEntry(
      "long-cold-race",
      "Long Cold Race",
      "many cancellations → 0",
      "Eight short stalks (4 blue, 4 red, value 0). Long perfect play — second-player wins after ~8 moves of mirroring.",
      combinePositions([
        groundedStalkPreset("lcr-b0", [EDGE_COLORS.LEFT], 100),
        groundedStalkPreset("lcr-b1", [EDGE_COLORS.LEFT], 200),
        groundedStalkPreset("lcr-b2", [EDGE_COLORS.LEFT], 300),
        groundedStalkPreset("lcr-b3", [EDGE_COLORS.LEFT], 400),
        groundedStalkPreset("lcr-r0", [EDGE_COLORS.RIGHT], 540),
        groundedStalkPreset("lcr-r1", [EDGE_COLORS.RIGHT], 640),
        groundedStalkPreset("lcr-r2", [EDGE_COLORS.RIGHT], 740),
        groundedStalkPreset("lcr-r3", [EDGE_COLORS.RIGHT], 840),
      ]),
      { category: "composites", note: "Demonstrates that long ≠ hard: each move is forced or symmetric, but the game lasts 8 turns." },
    ),
    presetEntry(
      "nimber-four",
      "Nimber *4",
      "*4",
      "A bamboo stalk of 4 green edges. By Sprague-Grundy, equivalent to a Nim heap of size 4.",
      nimberFourPreset(),
      { category: "nimbers", note: "Green Hackenbush bamboo stalks are the bridge between Hackenbush and Nim. The Colon Principle says each bamboo stalk can be replaced by a single edge of the same Nim value." },
    ),
    presetEntry(
      "hot-game",
      "Hot Fork",
      "*",
      "A green trunk forking into one blue and one red branch — the classic Green Fork shape, usually introduced as the standard hot example. Worth seeing that it is nothing of the kind: both sides can only move to infinitesimals, the temperature is 0, and it reduces to plain *.",
      hotGamePreset(),
      { category: "hot", note: "Hot games have positive temperature, meaning each player benefits from moving. The green trunk creates a shared bottleneck: whoever moves first captures the partisan branch." },
    ),
    presetEntry(
      "four-component-race",
      "Four Component Race",
      "3 + (-2) + 1/2 + * = {3/2 | 3/2}",
      "Four independent components: a 3-stalk, a (-2)-stalk, a 1/2-stalk, and a star. The numeric parts sum to 3/2, then adding * gives {3/2|3/2}.",
      twoComponentRacePreset(),
      { category: "composites", note: "The solver decomposes into 4 independent subgames and sums their values. The nimber * makes it hot despite the numeric components being cold. Blue wins since 3/2 > 0." },
    ),
    presetEntry(
      "nim-sum",
      "Nim Sum",
      "*3 + *1 = *2",
      "Two green bamboo stalks demonstrating the Sprague-Grundy XOR rule. *3 \u2295 *1 = *2.",
      nimSumPreset(),
      { category: "nimbers", note: "By Sprague-Grundy, independent impartial games sum via XOR. 3 XOR 1 = 2, so this sum equals *2 (a first-player win). The Colon Principle from Winning Ways simplifies each bamboo stalk to a single Nim heap." },
    ),
    presetEntry(
      "stable-anchor",
      "Stable Anchor",
      "experimental",
      "Experimental no-fall anchor extension supported by the engine.",
      stableAnchorPreset(),
      { category: "experimental" },
    ),
    presetEntry(
      "roofed-trio",
      "Roofed Trio",
      "tepid",
      "Two posts joined by a stable green roof, each carrying a partisan stalk. The roof can't be cut, so cutting a base green tilts the value without collapsing the structure. Intended as a switch, but it resolves to a temperature-0 form.",
      roofedTrioPreset(),
      { category: "hot",
        note: "The stable green roof keeps both posts grounded. Whoever cuts a base green sacrifices their side's anchor without dropping the opposing stalk." },
    ),
    presetEntry(
      "stable-tower",
      "Stable Tower",
      "tepid",
      "Tall column with a STABLE middle rung. Cutting the base or top is the only way to shift value; the middle stands forever. Intended as a switch, but it resolves to a temperature-0 form.",
      stableTowerPreset(),
      { category: "hot",
        note: "Three vertical greens with the middle one stable. The partisan tip on top creates a switch since cuts to base/top change reach but not collapse." },
    ),
    presetEntry(
      "greenhouse",
      "Greenhouse Roof",
      "tepid composite",
      "Two stable green roof beams over Blue and Red bays plus a tall central spire. Built for multi-tier hot exchanges, but like the rest of this group it settles at temperature 0.",
      greenhousePreset(),
      { category: "hot",
        note: "Stable double-tier roof keeps the bays anchored. A tall central spire (mostly green, with partisan tier bays) creates a long hot trade-off." },
    ),
    presetEntry(
      "up-star",
      "Up Star (↑*)",
      "↑*",
      "The simplest concrete Hackenbush position whose value is the infinitesimal ↑* — green stem with a single blue tip.",
      upStarPreset(),
      { category: "infinitesimals",
        note: "Cutting the green stem drops everything → 0. Cutting the blue leaves the green stub alone (=*). Blue options {0, *}, Red option {0} → game form {0, * | 0} = ↑*. Positive infinitesimal stronger than ↑." },
    ),
    presetEntry(
      "down-star",
      "Down Star (↓*)",
      "↓*",
      "Mirror of Up Star — green stem with a single red tip — the simplest position whose value is ↓*.",
      downStarPreset(),
      { category: "infinitesimals",
        note: "Game form {0 | 0, *} = ↓*. Negative mirror of ↑*." },
    ),
    presetEntry(
      "balanced-marathon",
      "Balanced Marathon",
      "0",
      "Cold zero sanity check with three short blue stalks against a red single edge and a red two-edge stalk.",
      balancedMarathonPreset(),
      {
        category: "composites",
        note: "Sanity check: this is a second-player win. Perfect play lasts 6 moves whether Blue or Red starts.",
      },
    ),
    presetEntry(
      "mirror-marathon",
      "Mirror Marathon",
      "0",
      "Another exact zero test built from two-edge blue and red stalks together with +1/2 and -1/2.",
      mirrorMarathonPreset(),
      {
        category: "composites",
        note: "Sanity check: this is a second-player win. Perfect play lasts 6 moves from either starting color.",
      },
    ),
    presetEntry(
      "blue-marathon",
      "Blue Marathon",
      "1/2",
      "Blue is cold-favored, but the win still takes a longer exact sequence through several independent components.",
      blueMarathonPreset(),
      {
        category: "composites",
        note: "Sanity check: Blue wins whoever starts. Perfect play lasts 7 moves with Blue starting, or 6 with Red starting.",
      },
    ),
    presetEntry(
      "quarter-race",
      "Quarter Race",
      "1/4",
      "A longer cold quarter-value race mixing a blue two-edge stalk, a red two-edge stalk, and a quarter stalk.",
      quarterRacePreset(),
      {
        category: "composites",
        note: "Sanity check: Blue wins whoever starts. Perfect play lasts 7 moves with Blue starting, or 8 with Red starting.",
      },
    ),
    presetEntry(
      "hot-blue-marathon",
      "Hot Blue Marathon",
      "{ 1/2 | 1/2 }",
      "Blue-favoured sanity check with a green edge, a half stalk, and a red two-edge stalk. Note that { 1/2 | 1/2 } is 1/2 + *, so despite the braces its temperature is 0 — a switch needs its two sides to differ.",
      hotBlueMarathonPreset(),
      {
        category: "hot",
        note: "Sanity check: Blue wins whoever starts. Perfect play lasts 7 moves with Blue starting, or 6 with Red starting.",
      },
    ),
    presetEntry(
      "hot-red-marathon",
      "Hot Red Marathon",
      "{ -1/2 | -1/2 }",
      "Red-favoured sanity check with a green edge, a negative half stalk, and a red two-edge stalk. Like its mirror, { -1/2 | -1/2 } is -1/2 + * and has temperature 0.",
      hotRedMarathonPreset(),
      {
        category: "hot",
        note: "Sanity check: Red wins whoever starts. Perfect play lasts 6 moves with Blue starting, or 7 with Red starting.",
      },
    ),
    // Infinite presets (experimental)
    presetEntry(
      "omega",
      "Omega",
      "\u03C9",
      "The smallest positive infinite surreal number, modeled by an infinite blue stalk.",
      infiniteStalkPreset("omega", EDGE_COLORS.LEFT, 500),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "neg-omega",
      "Negative Omega",
      "-\u03C9",
      "The smallest negative infinite surreal number, modeled by an infinite red stalk.",
      infiniteStalkPreset("neg-omega", EDGE_COLORS.RIGHT, 500),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "omega-star",
      "Omega Star",
      "\u03C9*",
      "An infinite green stalk, representing a transfinite fuzzy game where the first player wins.",
      infiniteStalkPreset("omega-star", EDGE_COLORS.NEUTRAL, 500),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "omega-minus-one",
      "Omega Minus One",
      "\u03C9 - 1",
      "Infinite blue stalk component plus a single red edge component, demonstrating transfinite sum.",
      combinePositions([
        infiniteStalkPreset("omega-m1-blue", EDGE_COLORS.LEFT, 300),
        groundedStalkPreset("omega-m1-red", [EDGE_COLORS.RIGHT], 680),
      ]),
      { category: "infinite", support: "infinite" },
    ),
    // Grass
    presetEntry(
      "grass-3",
      "Grass (3 Stalks)",
      "ω*[3]",
      "Three infinite green stalks from one vertex. Nim-sum of transfinite nimbers — first player wins.",
      grassPreset("grass3", 3, 490),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "grass-5",
      "Grass (5 Stalks)",
      "ω*[5]",
      "Five infinite green stalks fanning out. A lush transfinite grass — first player wins.",
      grassPreset("grass5", 5, 490),
      { category: "infinite", support: "infinite" },
    ),
    // Flower
    presetEntry(
      "blue-red-flower",
      "Blue-Red Flower",
      "∞-flower",
      "A flower with Blue and Red infinite petals branching from a hub. Mixed-color transfinite structure.",
      flowerPreset("flower-br", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.LEFT], 490),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "rainbow-flower",
      "Rainbow Flower",
      "∞-flower",
      "A flower with all three colors: Blue, Red, and Green infinite petals.",
      flowerPreset("flower-rgb", [EDGE_COLORS.LEFT, EDGE_COLORS.NEUTRAL, EDGE_COLORS.RIGHT, EDGE_COLORS.NEUTRAL, EDGE_COLORS.LEFT], 490),
      { category: "infinite", support: "infinite" },
    ),
    // Ordinal towers
    presetEntry(
      "omega-times-2",
      "Omega Times Two",
      "ω·2",
      "Two stacked infinite blue stalks forming an ordinal tower. Value ω·2 — much larger than ω.",
      ordinalTowerPreset("omt2", "omega-times-2", 490),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "omega-plus-3",
      "Omega Plus Three",
      "ω+3",
      "An infinite blue stalk with 3 finite blue edges on top. Value ω+3 — slightly more than ω.",
      ordinalTowerPreset("omp3", "omega-plus-n", 490),
      { category: "infinite", support: "infinite" },
    ),
    presetEntry(
      "omega-squared",
      "Omega Squared",
      "ω²",
      "An infinite blue stalk with infinite branches — a vast ordinal tower reaching ω².",
      ordinalTowerPreset("omsq", "omega-squared", 490),
      { category: "infinite", support: "infinite" },
    ),
    // Loopy games (on/off/over/under/dud) — now solvable positions
    presetEntry(
      "loopy-on",
      "Loopy On",
      "on",
      "A blue loop edge — Blue can keep playing forever, Red has no response. Blue always wins.",
      loopyEdgePreset("on", EDGE_COLORS.LEFT, 500),
      { category: "loopy", support: "loopy",
        note: "Conway's loopy game `on = { on | }`. Blue's perpetual move dominates any finite addend." },
    ),
    presetEntry(
      "loopy-off",
      "Loopy Off",
      "off",
      "A red loop edge — mirror of on; Red always wins.",
      loopyEdgePreset("off", EDGE_COLORS.RIGHT, 500),
      { category: "loopy", support: "loopy" },
    ),
    presetEntry(
      "loopy-dud",
      "Loopy Dud",
      "dud",
      "A green loop edge — either player can extend the loop indefinitely. Outcome: draw.",
      loopyEdgePreset("dud", EDGE_COLORS.NEUTRAL, 500),
      { category: "loopy", support: "loopy",
        note: "Conway's dud (Deathless Universal Draw). `dud + anything = dud`." },
    ),
    presetEntry(
      "loopy-over",
      "Loopy Over",
      "over",
      "Blue loop with over semantics — positive loopy infinitesimal. Over > 0 but smaller than any positive number.",
      loopyEdgePreset("over", EDGE_COLORS.LEFT, 500, "over"),
      { category: "loopy", support: "loopy",
        note: "`over = { 0 | over }`. `over + under = 0`." },
    ),
    presetEntry(
      "loopy-under",
      "Loopy Under",
      "under",
      "Red loop with under semantics — negative loopy infinitesimal.",
      loopyEdgePreset("under", EDGE_COLORS.RIGHT, 500, "under"),
      { category: "loopy", support: "loopy" },
    ),
    presetEntry(
      "loopy-on-off",
      "On + Off",
      "on + off = dud",
      "Sum of a Blue perpetual and a Red perpetual — stalemate (draw).",
      combinePositions([
        loopyEdgePreset("on2", EDGE_COLORS.LEFT, 300),
        loopyEdgePreset("off2", EDGE_COLORS.RIGHT, 700),
      ]),
      { category: "loopy", support: "loopy" },
    ),
    presetEntry(
      "loopy-over-under",
      "Over + Under",
      "over + under = 0",
      "Sum of positive and negative loopy infinitesimals cancels exactly.",
      combinePositions([
        loopyEdgePreset("ov", EDGE_COLORS.LEFT, 300, "over"),
        loopyEdgePreset("un", EDGE_COLORS.RIGHT, 700, "under"),
      ]),
      { category: "loopy", support: "loopy" },
    ),
    // Additional composite presets
    presetEntry(
      "two-plus-star",
      "Two Plus Star",
      "2 + * = { 2 | 2 }",
      "A blue-blue stalk combined with a green stalk, giving 2+*.",
      combinePositions([
        groundedStalkPreset("tps-blue", [EDGE_COLORS.LEFT, EDGE_COLORS.LEFT], 300),
        groundedStalkPreset("tps-star", [EDGE_COLORS.NEUTRAL], 680),
      ]),
      { category: "composites" },
    ),
    presetEntry(
      "half-plus-star",
      "Half Plus Star",
      "1/2 + * = { 1/2 | 1/2 }",
      "A half stalk combined with a green stalk, giving 1/2+*.",
      combinePositions([
        groundedStalkPreset("hps-half", [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT], 300),
        groundedStalkPreset("hps-star", [EDGE_COLORS.NEUTRAL], 680),
      ]),
      { category: "composites" },
    ),
  ];
}

// Build a position from compact specs; ids are prefixed so they never collide.
//   nodes: [id, x, y, ground?]   edges: [aId, bId, color]
function complexPos(prefix, nodes, edges) {
  return {
    nodes: nodes.map(([id, x, y, g]) => ({ id: `${prefix}-${id}`, x, y, ground: Boolean(g) })),
    edges: edges.map(([a, b, color], i) => ({ id: `${prefix}-e${i}`, a: `${prefix}-${a}`, b: `${prefix}-${b}`, color, stable: false })),
  };
}

// "Complex games": interconnected 3-colour meshes and classics where the winner
// is NOT obvious by inspection. Every value here was confirmed through the
// solver (fuzzy / balanced / hot, all tractable well under the search budget).
function complexGamesLibrary() {
  const B = EDGE_COLORS.LEFT, R = EDGE_COLORS.RIGHT, G = EDGE_COLORS.NEUTRAL;
  return [
    presetEntry(
      "cx-crossed-wires", "Crossed Wires", "*",
      "Two grounds cross-linked by blue and red, tied off with a green bar. It looks perfectly even — and it is — so the win belongs to whoever moves first. Value *.",
      complexPos("cxcw",
        [["g1", 330, 560, 1], ["g2", 650, 560, 1], ["a", 400, 300], ["b", 580, 300]],
        [["g1", "a", B], ["g1", "b", R], ["g2", "a", R], ["g2", "b", B], ["a", "b", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-green-roof", "Green Roof", "fuzzy",
      "A blue leg and a red leg under an all-green roof. Because the roof is either player's, the whole thing collapses — canonically — to the single nimber *, a first-player win you can't read off the picture.",
      complexPos("cxgr",
        [["g", 490, 560, 1], ["a", 380, 400], ["b", 600, 400], ["c", 490, 270]],
        [["g", "a", B], ["g", "b", R], ["a", "b", G], ["a", "c", G], ["b", "c", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-tangled-k4", "Tangled K4", "0",
      "Four nodes, every pair joined, one edge of each colour woven through. All that tension cancels exactly: the position is worth 0, a second-player win — the opposite of what the tangle suggests.",
      complexPos("cxk4",
        [["g", 490, 560, 1], ["a", 340, 370], ["b", 640, 370], ["c", 490, 250]],
        [["g", "a", B], ["g", "b", R], ["g", "c", G], ["a", "b", G], ["b", "c", B], ["c", "a", R]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-deadlock", "Deadlock", "0",
      "A blue strut and a red strut meet a green cap, with a green edge running along the ground. Everything cancels to exactly 0, so the second player always wins — however busy it looks.",
      complexPos("cxdl",
        [["g1", 360, 560, 1], ["g2", 620, 560, 1], ["m", 490, 400], ["t", 490, 260]],
        [["g1", "m", B], ["g2", "m", R], ["m", "t", G], ["g1", "g2", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-green-triangle", "Green Triangle", "*",
      "Three green edges in a loop — a Winning Ways impartial classic. The Fusion Principle fuses the whole cycle to a point, leaving three loops, so it is exactly *: a first-player win.",
      complexPos("cxgt",
        [["g", 490, 560, 1], ["a", 390, 360], ["b", 590, 360]],
        [["g", "a", G], ["g", "b", G], ["a", "b", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-pentagon", "Pentagon", "Blue wins",
      "A five-node ring with a blue diagonal. All that tangle simplifies, canonically, to the plain number 1/2 — cold as a coin, and Blue's by exactly half a move.",
      complexPos("cxpn",
        [["g", 490, 560, 1], ["a", 280, 410], ["b", 380, 250], ["c", 600, 250], ["d", 700, 410]],
        [["g", "a", B], ["a", "b", G], ["b", "c", R], ["c", "d", G], ["d", "g", R], ["a", "c", B]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-bowtie", "Bowtie", "Red wins",
      "Two loops pinched at a green knot. Tangled, and it tips to Red by a hair — invisible without working it through. Measured temperature 0.",
      complexPos("cxbt",
        [["g", 460, 560, 1], ["c", 460, 420], ["a", 330, 300], ["b", 560, 305], ["d", 650, 470]],
        [["g", "c", G], ["c", "a", B], ["c", "b", R], ["a", "b", G], ["c", "d", B], ["d", "g", R]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-plus-minus-star", "Plus, Minus, Star", "1 − 1 + *",
      "A blue stalk (+1), a red stalk (−1), and a lone green edge (*). The numbers cancel and the star decides it: a first-player win dressed up as a tie.",
      complexPos("cxpms",
        [["g1", 200, 560, 1], ["a", 200, 370], ["g2", 490, 560, 1], ["b", 490, 370], ["g3", 780, 560, 1], ["c", 780, 370]],
        [["g1", "a", B], ["g2", "b", R], ["g3", "c", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-up-star", "Up-Star", "↑*",
      "A blue edge balanced on top of a green one — the named infinitesimal up-star. Positive-leaning but fuzzy, so the first player wins.",
      complexPos("cxus",
        [["g", 490, 560, 1], ["a", 490, 420], ["b", 490, 270]],
        [["g", "a", G], ["a", "b", B]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-twisted-snake", "Twisted Snake", "{ 0, ↓* | 0, * }",
      "A green-red-blue zig-zag. The colours fight to a subtle infinitesimal and it lands as a first-player win — impossible to eyeball.",
      complexPos("cxts",
        [["g", 490, 560, 1], ["a", 440, 425], ["b", 565, 330], ["c", 470, 225]],
        [["g", "a", G], ["a", "b", R], ["b", "c", B]]),
      { category: "complex" },
    ),

    // ── harder (8-12 edges) ──
    presetEntry(
      "cx-prism", "Triangular Prism", "fuzzy",
      "Two triangles joined into a prism, every face a mix of colours — it looks like nine edges of real work. But swapping blue and red maps the board onto itself, so it is its own negative and the value must be a nimber. Mirror your opponent and the colour fight cancels; the leftover here is nonzero, so the first player takes it.",
      complexPos("cxprism",
        [["g", 300, 540, 1], ["b1", 540, 540], ["b2", 420, 450], ["t0", 330, 300], ["t1", 560, 300], ["t2", 450, 210]],
        [["g", "b1", B], ["b1", "b2", G], ["b2", "g", R], ["t0", "t1", R], ["t1", "t2", G], ["t2", "t0", B], ["g", "t0", G], ["b1", "t1", G], ["b2", "t2", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-pinwheel", "Pinwheel", "fuzzy",
      "Four blades pinned to a green hub and rimmed in green. It carries two shortcuts at once: the entire pinwheel hangs off the single green stem, and blue and red mirror each other. Either one collapses it — no search required.",
      complexPos("cxpin",
        [["g", 490, 560, 1], ["c", 490, 370], ["a", 400, 250], ["b", 590, 250], ["d", 595, 460], ["e", 385, 460]],
        [["g", "c", G], ["c", "a", B], ["c", "b", R], ["c", "d", B], ["c", "e", R], ["a", "b", G], ["b", "d", G], ["d", "e", G], ["e", "a", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-hex-net", "Hex Net", "fuzzy",
      "A six-ring with all three long diagonals, blue and red alternating round the rim. The alternation is the giveaway: a blue/red swap maps the ring onto itself, so the board is its own negative and the value collapses to a nimber. It reads as deep and isn't.",
      complexPos("cxhex",
        [["g", 390, 500, 1], ["n2", 590, 500], ["n3", 690, 370], ["n4", 590, 240], ["n5", 390, 240], ["n6", 290, 370]],
        [["g", "n2", B], ["n2", "n3", R], ["n3", "n4", B], ["n4", "n5", R], ["n5", "n6", B], ["n6", "g", R], ["g", "n4", G], ["n2", "n5", G], ["n3", "n6", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-wheel5", "Five-Spoke Wheel", "Blue wins",
      "A hub wired to a five-node rim. Fully simplified it is worth exactly one move to Blue — the tangle hides a clean integer. Measured temperature 0.",
      complexPos("cxwheel",
        [["g", 490, 545, 1], ["r1", 700, 430], ["r2", 615, 215], ["r3", 365, 215], ["r4", 280, 430], ["h", 490, 370]],
        [["g", "r1", B], ["r1", "r2", R], ["r2", "r3", G], ["r3", "r4", R], ["r4", "g", B], ["g", "h", G], ["r1", "h", R], ["r2", "h", B], ["r3", "h", R], ["r4", "h", B]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-octahedron", "Octahedron", "Red wins",
      "A layered octahedral cage, blue and red laced with green. Finely balanced, it falls to Red by a hair. Measured temperature 0.",
      complexPos("cxocta",
        [["g", 490, 545, 1], ["a", 370, 440], ["b", 610, 440], ["c", 370, 280], ["d", 610, 280], ["t", 490, 180]],
        [["g", "a", B], ["g", "b", R], ["a", "c", G], ["b", "d", G], ["a", "b", G], ["c", "d", R], ["c", "t", B], ["d", "t", R], ["a", "t", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-double-diamond", "Double Diamond", "balanced · 0",
      "Two cross-barred diamonds stacked on one ground — ten edges of apparent tension. Blue and red are mirror images, so the board is its own negative; copy every move and it cancels to exactly 0, a second-player win.",
      complexPos("cxdd",
        [["g", 490, 560, 1], ["l1", 390, 455], ["r1", 590, 455], ["m", 490, 360], ["l2", 390, 265], ["r2", 590, 265], ["t", 490, 180]],
        [["g", "l1", B], ["g", "r1", R], ["l1", "m", R], ["r1", "m", B], ["l1", "r1", G], ["m", "l2", B], ["m", "r2", R], ["l2", "r2", G], ["l2", "t", G], ["r2", "t", G]]),
      { category: "complex" },
    ),
    presetEntry(
      "cx-cube", "The Cube", "balanced · 0",
      "A full cube wireframe — twelve edges, three colours, no obvious anchor. It looks like the hardest board here, and that is exactly the trick: blue and red mirror each other, so the cube is its own negative. Answer every cut with its mirror image and it nets to exactly 0.",
      complexPos("cxcube",
        [["g", 355, 515, 1], ["a", 615, 515], ["b", 680, 420], ["c", 420, 420], ["e", 355, 275], ["f", 615, 275], ["h", 680, 180], ["i", 420, 180]],
        [["g", "a", B], ["a", "b", R], ["b", "c", B], ["c", "g", R], ["e", "f", R], ["f", "h", B], ["h", "i", R], ["i", "e", B], ["g", "e", G], ["a", "f", G], ["b", "h", G], ["c", "i", G]]),
      // ~3900 search states: heavy enough to need the Solve gate.
      { category: "complex", heavy: true },
    ),
    presetEntry(
      "cx-trellis", "Trellis", "Blue wins",
      "A three-post trellis crossed with green and a pair of diagonals. It lands narrowly with Blue. Measured temperature 0.",
      complexPos("cxtrel",
        [["g1", 300, 560, 1], ["g2", 490, 560, 1], ["g3", 680, 560, 1], ["t1", 300, 355], ["t2", 490, 355], ["t3", 680, 355]],
        [["g1", "t1", B], ["g2", "t2", R], ["g3", "t3", B], ["t1", "t2", G], ["t2", "t3", G], ["g1", "g2", G], ["g2", "g3", G], ["t1", "g2", R], ["t3", "g2", B]]),
      { category: "complex" },
    ),
  ];
}

// "Boss" tier: the hardest meshes (13-16 edges). Still tractable, but solving
// takes ~1-2 seconds, so the UI loads these gated behind a Solve button
// (entries are flagged heavy:true) instead of auto-analyzing on load.
function bossGamesLibrary() {
  const B = EDGE_COLORS.LEFT, R = EDGE_COLORS.RIGHT, G = EDGE_COLORS.NEUTRAL;
  return [
    presetEntry(
      "boss-spoked-standoff", "Spoked Standoff", "fuzzy",
      "A 3-blue / 3-red rim ringed by neutral green spokes and a green hub stem. It looks like a balanced standoff, but the green stem is a hidden tempo — whoever moves first wins (13 edges).",
      complexPos("bwss",
        [["G", 430, 556, 1], ["H", 500, 350], ["R0", 500, 175], ["R1", 652, 263], ["R2", 652, 438], ["R3", 500, 525], ["R4", 348, 438], ["R5", 348, 263]],
        [["G", "H", G], ["R0", "R1", B], ["R1", "R2", R], ["R2", "R3", B], ["R3", "R4", R], ["R4", "R5", B], ["R5", "R0", R], ["H", "R0", G], ["H", "R1", G], ["H", "R2", G], ["H", "R3", G], ["H", "R4", G], ["H", "R5", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-hub-tug", "Hub Tug", "fuzzy",
      "Three blue and three red spokes pull on the hub through an all-green rim, suggesting a draw — yet the position is fuzzy and the first mover wins (13 edges).",
      complexPos("bwht",
        [["G", 430, 556, 1], ["H", 500, 350], ["R0", 500, 175], ["R1", 652, 263], ["R2", 652, 438], ["R3", 500, 525], ["R4", 348, 438], ["R5", 348, 263]],
        [["G", "H", G], ["R0", "R1", G], ["R1", "R2", G], ["R2", "R3", G], ["R3", "R4", G], ["R4", "R5", G], ["R5", "R0", G], ["H", "R0", B], ["H", "R1", R], ["H", "R2", B], ["H", "R3", R], ["H", "R4", B], ["H", "R5", R]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-chorded-wheel", "Chorded Wheel", "fuzzy",
      "Interwoven chords cross the disc and the blue and red counts match exactly, so it reads as even — but the extra green chord plus the stem give the mover the tempo to win (13 edges).",
      complexPos("bwcw",
        [["G", 430, 556, 1], ["H", 500, 350], ["R0", 500, 175], ["R1", 652, 263], ["R2", 652, 438], ["R3", 500, 525], ["R4", 348, 438], ["R5", 348, 263]],
        [["G", "H", G], ["R0", "R1", B], ["R1", "R2", R], ["R2", "R3", B], ["R3", "R4", R], ["R4", "R5", B], ["R5", "R0", R], ["H", "R0", G], ["H", "R2", G], ["H", "R4", G], ["R0", "R3", G], ["R1", "R4", B], ["R2", "R5", R]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-seven-spoke", "Seven-Spoke Split", "fuzzy",
      "Two blue spokes on one side and two red on the other look like a stalemate around the green rim, but the green stem and odd 7-cycle make it a first-player win (13 edges).",
      complexPos("bw7s",
        [["G", 500, 552, 1], ["H", 500, 350], ["R0", 500, 175], ["R1", 637, 241], ["R2", 671, 389], ["R3", 576, 508], ["R4", 424, 508], ["R5", 329, 389], ["R6", 363, 241]],
        [["G", "H", G], ["R0", "R1", G], ["R1", "R2", G], ["R2", "R3", G], ["R3", "R4", G], ["R4", "R5", G], ["R5", "R6", G], ["R6", "R0", G], ["H", "R0", B], ["H", "R1", B], ["H", "R3", R], ["H", "R4", R], ["H", "R6", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-antiprism", "Triangular Antiprism", "fuzzy",
      "A green-capped triangular antiprism: a top triangle, a bottom triangle, six zig-zag struts and a green apex. It looks like a balanced cage, but the green-cycle parity makes it a first-player win (15 edges).",
      complexPos("bant",
        [["b0", 250, 552, 1], ["b1", 650, 552, 1], ["b2", 450, 478, 1], ["t0", 330, 280], ["t1", 560, 280], ["t2", 450, 230], ["a", 450, 150]],
        [["b0", "b1", G], ["b1", "b2", G], ["b2", "b0", G], ["t0", "t1", B], ["t1", "t2", R], ["t2", "t0", G], ["t0", "b0", B], ["t0", "b2", R], ["t1", "b1", R], ["t1", "b2", B], ["t2", "b0", G], ["t2", "b1", G], ["a", "t0", G], ["a", "t1", G], ["a", "t2", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-mirror-grid", "Mirror Grid", "balanced · 0",
      "A full 3x3 lattice where a blue fan and a red fan mirror each other around a green spine. Perfectly antisymmetric, so it is a value-0 draw and the second player wins (14 edges).",
      complexPos("bgrid",
        [["r0c0", 200, 545, 1], ["r0c1", 490, 545, 1], ["r0c2", 780, 545, 1], ["r1c0", 200, 400], ["r1c1", 490, 400], ["r1c2", 780, 400], ["r2c0", 200, 250], ["r2c1", 490, 250], ["r2c2", 780, 250]],
        [["r0c0", "r1c0", B], ["r1c0", "r2c0", B], ["r2c0", "r2c1", B], ["r1c0", "r2c1", B], ["r0c2", "r1c2", R], ["r1c2", "r2c2", R], ["r2c2", "r2c1", R], ["r1c2", "r2c1", R], ["r0c1", "r1c1", G], ["r1c1", "r2c1", G], ["r0c0", "r1c1", G], ["r0c2", "r1c1", G], ["r0c0", "r1c0", B], ["r0c2", "r1c2", R]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-cube-zero", "Rotational Cube", "0",
      "A cube with an all-blue front face and an all-red back face bridged by two green diagonals. It screams lopsided, yet a 180-degree colour-swap symmetry makes it exactly 0 - a second-player win (14 edges).",
      complexPos("bcube",
        [["fbl", 250, 500, 1], ["fbr", 560, 500], ["ftl", 250, 260], ["ftr", 560, 260], ["bbl", 400, 430], ["bbr", 710, 430, 1], ["btl", 400, 190], ["btr", 710, 190]],
        [["fbl", "fbr", B], ["ftl", "ftr", B], ["fbl", "ftl", B], ["fbr", "ftr", B], ["bbl", "bbr", R], ["btl", "btr", R], ["bbl", "btl", R], ["bbr", "btr", R], ["fbl", "bbl", B], ["fbr", "bbr", R], ["ftl", "btl", B], ["ftr", "btr", R], ["fbl", "bbr", G], ["ftl", "btr", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-five-strand", "Five-Strand Bridge", "balanced · 0",
      "Five strands span two grounds - two blue, two red and a green spine - laced together with green cross-rungs. The blue/red mirror collapses the whole tangle to 0, so the second player wins (14 edges).",
      complexPos("bthe",
        [["GL", 150, 552, 1], ["GR", 830, 552, 1], ["p1", 300, 240], ["p2", 300, 470], ["p3", 640, 240], ["p4", 640, 470], ["p5", 470, 355]],
        [["GL", "p1", B], ["p1", "GR", B], ["GL", "p2", R], ["p2", "GR", R], ["GL", "p3", B], ["p3", "GR", B], ["GL", "p4", R], ["p4", "GR", R], ["GL", "p5", G], ["p5", "GR", G], ["p1", "p3", G], ["p2", "p4", G], ["p1", "p5", B], ["p2", "p5", R]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-hot-ladder", "Rung Ladder", "Blue wins",
      "A two-rail ladder with crossed colour rungs and braces, tipping to Blue by a slim margin (14 edges). It was added here as the one genuinely hot board in the set; on measurement its temperature is 0 like all the others, so the name is all that survives of that claim.",
      complexPos("blad",
        [["g", 430, 552, 1], ["g2", 650, 552, 1], ["L1", 380, 500], ["R1", 600, 500], ["L2", 380, 444], ["R2", 600, 444], ["L3", 380, 388], ["R3", 600, 388], ["L4", 380, 332], ["R4", 600, 332], ["L5", 380, 276], ["R5", 600, 276]],
        [["g", "L1", B], ["L1", "L2", R], ["L2", "L3", B], ["L3", "L4", R], ["L4", "L5", B], ["g2", "R1", R], ["R1", "R2", B], ["R2", "R3", R], ["R3", "R4", B], ["R4", "R5", R], ["L1", "R1", B], ["L3", "R3", R], ["L5", "R5", G], ["L2", "R3", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-twin-diamond", "Twin-Diamond Core", "balanced · 0",
      "Two diamond tangles fused by a crossed bridge and a ground link. The interlock looks decisive, but it nets to exactly 0 - a second-player win (14 edges).",
      complexPos("btwin",
        [["L0", 200, 552, 1], ["L1", 210, 230], ["L2", 120, 400], ["L3", 300, 400], ["R0", 780, 552, 1], ["R1", 770, 230], ["R2", 680, 400], ["R3", 860, 400]],
        [["L0", "L2", B], ["L2", "L1", B], ["L0", "L3", B], ["L3", "L1", R], ["L1", "L2", G], ["R0", "R2", R], ["R2", "R1", R], ["R0", "R3", R], ["R3", "R1", B], ["R1", "R2", G], ["L1", "R2", G], ["L2", "R1", G], ["L3", "R3", G], ["L0", "R0", G]]),
      { category: "boss", heavy: true },
    ),

    // ── genuinely hard: no keystone, no mirror, real fractional/switch values ──
    presetEntry(
      "boss-red-whisker", "Red by a Whisker", "≈ −1/16",
      "Twelve edges that come out to −1/16 — Red wins by a sixteenth. It is the Blue by a Hair tangle with a few edges recoloured: same shape, opposite knife-edge.",
      complexPos("bwhisk",
        [["g1", 140, 552, 1], ["g2", 760, 548, 1], ["a", 240, 420], ["b", 410, 440], ["c", 360, 290], ["d", 560, 410], ["e", 600, 270], ["f", 700, 420]],
        [["g1", "a", G], ["a", "b", B], ["a", "c", R], ["b", "c", B], ["b", "d", G], ["c", "e", B], ["d", "e", R], ["d", "f", B], ["e", "f", B], ["f", "g2", G], ["g2", "d", R], ["c", "d", B]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-blue-hair", "Blue by a Hair", "≈ 31/32",
      "The Red by a Whisker tangle recoloured — same board, the other way. It nets to about 31/32, so Blue takes it by a single thirty-second.",
      complexPos("bhair",
        [["g1", 140, 552, 1], ["g2", 760, 548, 1], ["a", 240, 420], ["b", 410, 440], ["c", 360, 290], ["d", 560, 410], ["e", 600, 270], ["f", 700, 420]],
        [["g1", "a", G], ["a", "b", R], ["a", "c", B], ["b", "c", G], ["b", "d", B], ["c", "e", B], ["d", "e", B], ["d", "f", G], ["e", "f", R], ["f", "g2", B], ["g2", "d", G], ["c", "d", B]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-ladder-half", "Half-Point Ladder", "Blue wins",
      "An asymmetrically-coloured ladder whose form sits around 1/2. Blue wins, but only the solver sees by how much. The braces make it look like a switch; the measured temperature is 0.",
      complexPos("blhalf",
        [["L0", 260, 550, 1], ["R0", 720, 550, 1], ["L1", 260, 463], ["R1", 720, 463], ["L2", 260, 375], ["R2", 720, 375], ["L3", 260, 288], ["R3", 720, 288], ["L4", 260, 200], ["R4", 720, 200]],
        [["L0", "L1", B], ["L1", "L2", B], ["L2", "L3", B], ["L3", "L4", G], ["R0", "R1", R], ["R1", "R2", G], ["R2", "R3", R], ["R3", "R4", B], ["L2", "R2", R], ["L4", "R4", G], ["L1", "R1", B], ["L1", "R2", R]]),
      { category: "boss" },
    ),
    presetEntry(
      "boss-ladder-13-8", "Awkward Ladder", "Red wins",
      "A differently-coloured ladder whose form sits around −13/8 — Red wins by an awkward fraction no estimate would land on. Measured temperature 0.",
      complexPos("bl138",
        [["L0", 260, 550, 1], ["R0", 720, 550, 1], ["L1", 260, 463], ["R1", 720, 463], ["L2", 260, 375], ["R2", 720, 375], ["L3", 260, 288], ["R3", 720, 288], ["L4", 260, 200], ["R4", 720, 200]],
        [["L0", "L1", B], ["L1", "L2", B], ["L2", "L3", G], ["L3", "L4", B], ["R0", "R1", R], ["R1", "R2", R], ["R2", "R3", R], ["R3", "R4", B], ["L2", "R2", G], ["L4", "R4", R], ["L0", "R1", R], ["R1", "L2", G]]),
      { category: "boss" },
    ),
    presetEntry(
      "boss-honest-wheel", "Honest Wheel", "fuzzy",
      "A wheel grounded at TWO spokes, so there's no single stem to cut — unlike the paper-tiger wheels. Its all-small structure is genuinely fuzzy: the first player wins, but you have to work it out.",
      complexPos("bhwheel",
        [["g", 490, 552, 1], ["r0", 490, 190], ["r1", 668, 270], ["r2", 668, 430], ["r3", 490, 510], ["r4", 312, 430], ["r5", 312, 270], ["p1", 100, 500], ["p2", 880, 500], ["p3", 490, 200]],
        [["r0", "r1", B], ["r1", "r2", R], ["r2", "r3", G], ["r3", "r4", R], ["r4", "r5", B], ["r5", "r0", G], ["r0", "g", B], ["r3", "g", R], ["r1", "r4", B], ["r2", "r5", R], ["r2", "p1", R], ["r4", "p2", B], ["r0", "p3", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-wheel-eight", "Eight-Spoke Wheel", "Blue wins",
      "An eight-spoke wheel anchored at two points; uneven colours make it worth exactly 5/4 to Blue once fully simplified. Measured temperature 0.",
      complexPos("bw8",
        [["g", 490, 552, 1], ["r0", 490, 190], ["r1", 635, 237], ["r2", 695, 350], ["r3", 635, 463], ["r4", 490, 510], ["r5", 345, 463], ["r6", 285, 350], ["r7", 345, 237]],
        [["r0", "r1", B], ["r1", "r2", R], ["r2", "r3", B], ["r3", "r4", R], ["r4", "r5", B], ["r5", "r6", R], ["r6", "r7", B], ["r7", "r0", R], ["r0", "g", B], ["r4", "g", G], ["r1", "r6", G], ["r2", "r5", B]]),
      { category: "boss" },
    ),
    presetEntry(
      "boss-balanced-tower", "Off-Balance Tower", "2nd player",
      "A lopsided tower with no mirror symmetry that still nets to exactly zero — a genuine second-player draw. Recolour one edge (the Red-Apex Tower) and the draw becomes a loss.",
      complexPos("btower",
        [["g1", 340, 555, 1], ["g2", 600, 555, 1], ["a", 340, 440], ["b", 600, 440], ["c", 400, 335], ["d", 540, 335], ["e", 470, 225]],
        [["g1", "a", B], ["g2", "b", R], ["a", "b", G], ["a", "c", B], ["b", "d", R], ["c", "d", G], ["c", "e", B], ["d", "e", R], ["a", "d", B], ["e", "b", R], ["c", "b", G], ["d", "a", G]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-tower-red", "Red-Apex Tower", "Red wins",
      "The Off-Balance Tower with one edge recoloured — and that single change flips a dead-even draw into a clean −1 win for Red.",
      complexPos("btred",
        [["g1", 340, 555, 1], ["g2", 600, 555, 1], ["a", 340, 440], ["b", 600, 440], ["c", 400, 335], ["d", 540, 335], ["e", 470, 225]],
        [["g1", "a", B], ["g2", "b", R], ["a", "b", G], ["a", "c", B], ["b", "d", R], ["c", "d", G], ["c", "e", B], ["d", "e", R], ["a", "d", B], ["e", "b", R], ["c", "b", G], ["e", "a", R]]),
      { category: "boss", heavy: true },
    ),
    presetEntry(
      "boss-doubled-mesh", "Doubled-Edge Mesh", "Red wins",
      "A mesh with doubled edges resolving to −9/8 — Red wins by a margin past the nearest integer, invisible without solving.",
      complexPos("bdmesh",
        [["g1", 140, 552, 1], ["g2", 760, 548, 1], ["a", 260, 420], ["b", 430, 440], ["p", 560, 330], ["q", 560, 210], ["c", 680, 430]],
        [["g1", "a", G], ["a", "b", B], ["g1", "b", G], ["b", "p", B], ["g2", "p", R], ["p", "q", B], ["q", "p", B], ["q", "c", G], ["c", "g2", R], ["p", "c", G], ["a", "p", R], ["b", "c", G]]),
      { category: "boss", heavy: true },
    ),
  ];
}

// The cheap "tells" that make a big board trivially winnable, so a position
// carrying one only LOOKS hard:
//
//   keystone — a single edge holds up the entire board. Cut it and everything
//              falls at once, so the first player just takes it.
//   mirror   — swapping blue<->red is a graph isomorphism, so G = -G = 0 and
//              the second player wins by copying every move.
//
// Both are structural and cheap — neither requires solving the game — which is
// what lets the tier assignment below be checked by a test rather than asserted.
export function positionTells(position) {
  const normalized = normalizePosition(position);
  let keystone = null;
  for (const edge of normalized.edges) {
    if (normalizePosition(applyMove(normalized, edge.id)).edges.length === 0) {
      keystone = edge.color;
      break;
    }
  }
  const swapped = {
    nodes: normalized.nodes.map((n) => ({ ...n })),
    edges: normalized.edges.map((e) => ({
      ...e,
      color: e.color === EDGE_COLORS.LEFT ? EDGE_COLORS.RIGHT
        : e.color === EDGE_COLORS.RIGHT ? EDGE_COLORS.LEFT
        : e.color,
    })),
  };
  const mirror = normalized.edges.length > 0
    && isomorphismKey(normalized) === isomorphismKey(normalizePosition(swapped));
  return { keystone, mirror, hasTell: Boolean(keystone) || mirror };
}

// Order-invariant structural fingerprint, for asking "are these two positions
// the same graph?" — as opposed to positionKey, which fingerprints a position
// for memoization. The difference matters: positionKey numbers its refinement
// classes by first appearance, so two isomorphic-but-differently-ordered graphs
// can key differently. Here each round re-codes classes by SORTED signature, so
// the result depends only on the graph, never on node order.
function isomorphismKey(position) {
  const { nodes, edges } = position;
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!adjacency.has(edge.a) || !adjacency.has(edge.b)) continue;
    adjacency.get(edge.a).push({ other: edge.b, sig: edgeSignature(edge) });
    if (edge.b !== edge.a) adjacency.get(edge.b).push({ other: edge.a, sig: edgeSignature(edge) });
  }
  let labels = new Map(nodes.map((n) => [n.id, n.ground ? "G" : "n"]));
  for (let round = 0; round < nodes.length + 1; round += 1) {
    const refined = new Map();
    for (const node of nodes) {
      const neighbors = adjacency.get(node.id)
        .map(({ other, sig }) => `${sig}:${labels.get(other)}`)
        .sort();
      refined.set(node.id, `${labels.get(node.id)}|${neighbors.join(",")}`);
    }
    const codes = new Map([...new Set(refined.values())].sort().map((sig, i) => [sig, String(i)]));
    labels = new Map([...refined].map(([id, sig]) => [id, codes.get(sig)]));
  }
  const nodeKey = [...labels.values()].sort().join(";");
  const edgeKey = edges
    .map((e) => {
      const [x, y] = [labels.get(e.a), labels.get(e.b)].sort();
      return `${x}-${y}:${edgeSignature(e)}`;
    })
    .sort()
    .join(";");
  return `${nodeKey}||${edgeKey}`;
}

// A one-line, spoiler-shaped description of a position's tell, or null.
//
// Note on the mirror wording: a blue<->red swap being an isomorphism means the
// position equals its own negative, so G + G = 0 — which forces the value to be
// a NIMBER. That is 0 (second player wins) or *n (first player wins); mirroring
// cancels the partisan fight but does not by itself decide the game. Saying
// "the second player wins by copying" would be wrong for the *n cases, several
// of which are in this library.
export function tellSummary(position) {
  const { keystone, mirror } = positionTells(position);
  const shortcuts = [];
  if (keystone) {
    shortcuts.push(`the whole board hangs from a single ${keystone} edge, so cutting it drops everything at once`);
  }
  if (mirror) {
    shortcuts.push("swapping blue and red maps the board onto itself, so it is its own negative and the value has to be a nimber — mirror each move and the colour fight cancels out");
  }
  if (shortcuts.length === 0) return null;
  return shortcuts.length === 1
    ? `Shortcut: ${shortcuts[0]}.`
    : `Two shortcuts: ${shortcuts[0]}; and ${shortcuts[1]}.`;
}

// Post-audit reclassification. A discriminator (keystone edge / blue<->red mirror
// symmetry / single tiny value) showed several big positions only LOOK hard:
//   - paper-tiger: big board, but the winner follows from one cheap idea —
//     cut the single load-bearing edge, or mirror the opponent.
//   - boss: big board with NO cheap tell — genuinely hard to call who wins.
const RECATEGORIZE = {
  "cx-prism": "paper-tiger", "cx-pinwheel": "paper-tiger", "cx-hex-net": "paper-tiger",
  "cx-double-diamond": "paper-tiger", "cx-cube": "paper-tiger",
  "cx-wheel5": "boss", "cx-octahedron": "boss", "cx-trellis": "boss",
  "boss-spoked-standoff": "paper-tiger", "boss-hub-tug": "paper-tiger",
  "boss-chorded-wheel": "paper-tiger", "boss-seven-spoke": "paper-tiger",
  "boss-mirror-grid": "paper-tiger", "boss-cube-zero": "paper-tiger",
  "boss-five-strand": "paper-tiger", "boss-twin-diamond": "paper-tiger",
};
function recategorize(entries) {
  for (const e of entries) if (RECATEGORIZE[e.id]) e.category = RECATEGORIZE[e.id];
  return entries;
}

export function exampleLibrary() {
  return recategorize([
    ...presetLibrary(),
    ...complexGamesLibrary(),
    ...bossGamesLibrary(),
    referenceEntry(
      "flower",
      "Flower",
      "flower",
      "A classic Winning Ways family: a green stalk with a monochrome blossom of loops on top.",
      "Green stalk with all-blue or all-red blossom loops",
      "reference-short",
      "Reference only. Classic flowers use blossom loops, which this editor does not render cleanly; the loadable sprigs above are the loop-free cousin.",
    ),
    abstractEntry(
      "up",
      "Up",
      "up = { 0 | * }",
      "A standard positive infinitesimal short game.",
      "Pattern-modeled reference. No general constructor for all finite reference values is implemented here yet; this card only handles named cases structurally similar to up.",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "↑",
        form: "{ 0 | * }",
        subtitle: "Pattern-modeled infinitesimal up",
        relationToZero: "gt",
        heuristicValue: 0.125,
        explanation: "This is the named short game up: Blue can move to 0, while Red can only move to *. It is positive, but still smaller than every positive surreal number.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode("↑", [abstractNumberNode("0")], [abstractTreeNode("*")]),
      },
    ),
    abstractEntry(
      "down",
      "Down",
      "down = { * | 0 }",
      "A standard negative infinitesimal short game.",
      "Pattern-modeled reference. No general constructor for all finite reference values is implemented here yet; this card only handles named cases structurally similar to down.",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "↓",
        form: "{ * | 0 }",
        subtitle: "Pattern-modeled infinitesimal down",
        relationToZero: "lt",
        heuristicValue: -0.125,
        explanation: "This is the named short game down: Red can move to 0, while Blue can only move to *. It is negative, but still larger than every negative surreal in magnitude.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode("↓", [abstractTreeNode("*")], [abstractNumberNode("0")]),
      },
    ),
    abstractEntry(
      "tiny-one",
      "Tiny One",
      "tiny(1)",
      "A positive infinitesimal short game.",
      "Pattern-modeled reference. No general constructor for all finite reference values is implemented here yet; this card only handles named cases structurally similar to tiny(1).",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "tiny(1)",
        form: "{ 0 | { 0 | -1 } }",
        subtitle: "Pattern-modeled infinitesimal tiny(1)",
        relationToZero: "gt",
        heuristicValue: 0.0625,
        explanation: "tiny(1) is a named positive infinitesimal. Blue can cash out to 0 immediately, while Red only moves to a hotter negative-leaning switch.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode(
          "tiny(1)",
          [abstractNumberNode("0")],
          [abstractTreeNode("{ 0 | -1 }", [abstractNumberNode("0")], [abstractNumberNode("-1")])],
        ),
      },
    ),
    abstractEntry(
      "miny-one",
      "Miny One",
      "miny(1)",
      "A negative infinitesimal short game.",
      "Pattern-modeled reference. No general constructor for all finite reference values is implemented here yet; this card only handles named cases structurally similar to miny(1).",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "miny(1)",
        form: "{ { 1 | 0 } | 0 }",
        subtitle: "Pattern-modeled infinitesimal miny(1)",
        relationToZero: "lt",
        heuristicValue: -0.0625,
        explanation: "miny(1) is the negative mirror of tiny(1). Red can cash out to 0 immediately, while Blue only reaches a hotter positive-leaning switch.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode(
          "miny(1)",
          [abstractTreeNode("{ 1 | 0 }", [abstractNumberNode("1")], [abstractNumberNode("0")])],
          [abstractNumberNode("0")],
        ),
      },
    ),
    abstractEntry(
      "tiny-two",
      "Tiny Two",
      "tiny(2)",
      "A positive infinitesimal smaller than tiny(1).",
      "Same family as tiny(1), with Right's option scaled to {0 | -2}. The bigger the inner number, the SMALLER the tiny — tiny(2) < tiny(1) < ↑.",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "tiny(2)",
        form: "{ 0 | { 0 | -2 } }",
        subtitle: "Pattern-modeled infinitesimal tiny(2)",
        relationToZero: "gt",
        heuristicValue: 0.03,
        explanation: "tiny(n) ranks below ↑/n among the positive infinitesimals — Right's incentive to wait shrinks as n grows because the eventual punishment is bigger.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode(
          "tiny(2)",
          [abstractNumberNode("0")],
          [abstractTreeNode("{ 0 | -2 }", [abstractNumberNode("0")], [abstractNumberNode("-2")])],
        ),
      },
    ),
    abstractEntry(
      "miny-two",
      "Miny Two",
      "miny(2)",
      "A negative infinitesimal larger in magnitude than miny(1).",
      "Negative mirror of tiny(2). Larger inner number = smaller-magnitude miny.",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "miny(2)",
        form: "{ { 2 | 0 } | 0 }",
        subtitle: "Pattern-modeled infinitesimal miny(2)",
        relationToZero: "lt",
        heuristicValue: -0.03,
        explanation: "miny(n) mirrors tiny(n) — same hierarchy of relative magnitudes, all infinitesimal.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode(
          "miny(2)",
          [abstractTreeNode("{ 2 | 0 }", [abstractNumberNode("2")], [abstractNumberNode("0")])],
          [abstractNumberNode("0")],
        ),
      },
    ),
    abstractEntry(
      "double-up",
      "Double Up (⇑)",
      "⇑",
      "Twice up: ⇑ = ↑ + ↑ = { 0 | ↑* }.",
      "A canonical all-small composite of two ups. Atomic weight 2.",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "⇑",
        form: "{ 0 | ↑* }",
        subtitle: "Pattern-modeled infinitesimal double-up",
        relationToZero: "gt",
        heuristicValue: 0.16,
        explanation: "⇑ = ↑ + ↑. Bigger than ↑ but still smaller than every positive number. The engine's atomic weight should report 2 for this game.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode("⇑", [abstractNumberNode("0")], [abstractTreeNode("↑*")]),
      },
    ),
    abstractEntry(
      "double-down",
      "Double Down (⇓)",
      "⇓",
      "Twice down: ⇓ = ↓ + ↓ = { ↓* | 0 }.",
      "Mirror of double-up. Atomic weight -2.",
      {
        support: "reference-short",
        kind: "infinitesimal",
        label: "⇓",
        form: "{ ↓* | 0 }",
        subtitle: "Pattern-modeled infinitesimal double-down",
        relationToZero: "lt",
        heuristicValue: -0.16,
        explanation: "⇓ = ↓ + ↓. The negative mirror of ⇑. Atomic weight is -2.",
        warnings: [SHORT_REFERENCE_PATTERN_WARNING],
        gameTree: abstractTreeNode("⇓", [abstractTreeNode("↓*")], [abstractNumberNode("0")]),
      },
    ),
    referenceEntry(
      "epsilon",
      "Epsilon",
      "\u03B5 = 1/\u03C9",
      "A positive infinitesimal smaller than every positive dyadic rational.",
      "Positive infinitesimal from an infinite construction",
      "infinite",
      "Reference only. Exact epsilon-style values arise from infinite constructions rather than finite short positions.",
    ),
    referenceEntry(
      "colon-principle",
      "Colon Principle",
      "tree simplification",
      "In a Hackenbush tree, any branch can be replaced by a single edge whose Nim value equals the branch\u2019s Nim value. This is the key simplification tool from Winning Ways.",
      "Replace subtrees by their Nim-equivalent single edges",
      "reference-short",
      "A core theorem from Winning Ways vol. 1 ch. 7. It lets you reduce complex tree-shaped Green Hackenbush positions to equivalent bamboo stalks, and then apply Nim arithmetic.",
    ),
    referenceEntry(
      "hackenbush-hotchpotch",
      "Hackenbush Hotchpotch",
      "mixed",
      "A Winning Ways term for positions mixing all three edge colors. These are the hardest to analyze because impartial and partisan theories interact.",
      "Mixed red, blue, and green edges",
      "reference-short",
      "Hotchpotch positions can produce any short combinatorial game. The Colon Principle only applies to green parts; partisan edges require full recursive analysis.",
    ),
    referenceEntry(
      "thermograph",
      "Thermograph",
      "t(G)",
      "The thermograph of a game G plots its Left and Right walls as temperature rises, showing the mean value and how incentives cool.",
      "Left wall and Right wall converging to the mean",
      "reference-short",
      "From Winning Ways vol. 1 ch. 9 (\"The Heat of Battle\"). At temperature 0, both walls meet the mean. As temperature increases, players\u2019 incentive to move drops.",
    ),
    abstractEntry(
      "over",
      "Over",
      "over",
      "A positive loopy infinitesimal from loopy game theory.",
      "Pattern-modeled loopy reference. No general loopy solver is implemented here yet; this card only handles named cases structurally similar to over.",
      {
        support: "loopy",
        kind: "loopy",
        label: "over",
        form: "{ 0 | over }",
        subtitle: "Pattern-modeled loopy infinitesimal",
        relationToZero: "gt",
        heuristicValue: 0.125,
        explanation: "over is treated here as a named positive loopy infinitesimal: Blue can stop at 0, while Red only feeds the same loop back. This is hand-modeled, not discovered by a general loopy solver.",
        warnings: [LOOPY_PATTERN_WARNING],
        gameTree: abstractTreeNode("over", [abstractNumberNode("0")], [abstractLoopNode("over")]),
      },
    ),
    abstractEntry(
      "under",
      "Under",
      "under",
      "A negative loopy infinitesimal from loopy game theory.",
      "Pattern-modeled loopy reference. No general loopy solver is implemented here yet; this card only handles named cases structurally similar to under.",
      {
        support: "loopy",
        kind: "loopy",
        label: "under",
        form: "{ under | 0 }",
        subtitle: "Pattern-modeled loopy infinitesimal",
        relationToZero: "lt",
        heuristicValue: -0.125,
        explanation: "under is the negative mirror of over. Red can stop at 0, while Blue only feeds the same loop back. This is hand-modeled, not a general loopy derivation.",
        warnings: [LOOPY_PATTERN_WARNING],
        gameTree: abstractTreeNode("under", [abstractLoopNode("under")], [abstractNumberNode("0")]),
      },
    ),
    abstractEntry(
      "on",
      "On",
      "on",
      "Blue can keep moving forever in the loopy model.",
      "Pattern-modeled loopy reference. No general loopy solver is implemented here yet; this card only handles named cases structurally similar to on.",
      {
        support: "loopy",
        kind: "loopy",
        label: "on",
        form: "{ on | }",
        subtitle: "Pattern-modeled one-sided loopy value",
        relationToZero: "gt",
        heuristicValue: 0.25,
        explanation: "on gives Blue a perpetual self-loop while Red has no reply. In this named model, that makes the position Blue-winning, but the interpretation is still hand-modeled rather than solved in general.",
        warnings: [LOOPY_PATTERN_WARNING],
        gameTree: abstractTreeNode("on", [abstractLoopNode("on")], []),
      },
    ),
    abstractEntry(
      "off",
      "Off",
      "off",
      "Red can keep moving forever in the loopy model.",
      "Pattern-modeled loopy reference. No general loopy solver is implemented here yet; this card only handles named cases structurally similar to off.",
      {
        support: "loopy",
        kind: "loopy",
        label: "off",
        form: "{ | off }",
        subtitle: "Pattern-modeled one-sided loopy value",
        relationToZero: "lt",
        heuristicValue: -0.25,
        explanation: "off is the mirror of on: Red can perpetuate the loop while Blue has no reply. This app handles it only as a named loopy reference, not as part of a general loopy theory engine.",
        warnings: [LOOPY_PATTERN_WARNING],
        gameTree: abstractTreeNode("off", [], [abstractLoopNode("off")]),
      },
    ),
    abstractEntry(
      "dud",
      "Dud",
      "dud",
      "Both players can keep moving forever in the loopy model.",
      "Pattern-modeled loopy reference. No general loopy solver is implemented here yet; this card only handles named cases structurally similar to dud.",
      {
        support: "loopy",
        kind: "loopy",
        label: "dud",
        form: "{ dud | dud }",
        subtitle: "Pattern-modeled loopy draw object",
        relationToZero: "draw",
        heuristicValue: 0,
        explanation: "dud is treated here as a named loopy draw object: either player can keep the loop alive indefinitely. This is explicit pattern support, not a general loopy-solver result.",
        warnings: [LOOPY_PATTERN_WARNING],
        gameTree: abstractTreeNode("dud", [abstractLoopNode("dud")], [abstractLoopNode("dud")]),
      },
    ),
  ]);
}

export function exampleCategories() {
  return [
    { id: "complex", label: "Complex Games", description: "Small mixed positions with non-obvious values — fuzzy, balanced, or hot" },
    { id: "boss", label: "Boss Games", description: "Big boards with no cheap tell — genuinely hard to call who wins" },
    { id: "paper-tiger", label: "Paper Tigers", description: "Look complex, win on one idea: cut the load-bearing edge, or mirror your opponent" },
    { id: "numbers", label: "Numbers", description: "Cold positions with exact surreal number values" },
    { id: "nimbers", label: "Nimbers", description: "Impartial games (Green Hackenbush / Nim)" },
    { id: "infinitesimals", label: "Infinitesimals", description: "Nonzero games smaller than any number" },
    { id: "hot", label: "Hot Games (none yet)", description: "Built as hot examples, but the engine computes every one at temperature 0 — a measured finding, not a claim" },
    { id: "composites", label: "Composites & Sums", description: "Multi-component positions demonstrating game sums" },
    { id: "infinite", label: "Infinite (Experimental)", description: "Transfinite positions with omega-level values" },
    { id: "loopy", label: "Loopy Games", description: "On, off, over, under, dud — games with perpetual moves" },
    { id: "experimental", label: "Experimental", description: "Non-standard extensions" },
    { id: "reference", label: "Reference Only", description: "Theoretical examples not yet fully supported" },
  ];
}

export function emptyPosition() {
  return {
    nodes: [
      { id: "g0", x: 270, y: 560, ground: true },
      { id: "g1", x: 710, y: 560, ground: true },
    ],
    edges: [],
  };
}

export function relationLabel(relation) {
  return relationSummary(relation);
}

export function outcomeLabel(relation) {
  return outcomeDetails(relation).outcomeName;
}

export function shortOutcomeLabel(relation) {
  return outcomeDetails(relation).shortOutcome;
}

export function winnerFromStartingSide(relation, startingSide) {
  const outcome = outcomeDetails(relation);
  return startingSide === LEFT ? outcome.leftStartWinner : outcome.rightStartWinner;
}
