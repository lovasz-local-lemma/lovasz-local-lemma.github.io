// Two advanced views built on data the engine already produces.
//
//   nimSumGridHTML — Sprague-Grundy made visible. The branches meeting the
//     ground are written in binary, one row each, and the XOR is read column by
//     column. A column with an even number of filled cells cancels; the answer
//     is exactly the columns that do not. This is why a position is a
//     second-player win precisely when every column has even parity.
//
//   coolingIntervalAt / coolingFrames — the cooling story from a thermograph.
//     At temperature t the game G_t is confused over the interval between the
//     two walls; as t rises the walls converge and the interval closes, until
//     at t = temperature the game freezes on its mean. Sweeping t animates that.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Nim-sum bit grid ─────────────────────────────────────────────────────────

export function nimSumRows(branches, total) {
  const values = branches.map((b) => b.value);
  const widest = Math.max(1, ...values, total);
  const bits = Math.max(3, widest.toString(2).length);
  const toRow = (n) => Array.from({ length: bits }, (_, i) => ((n >> (bits - 1 - i)) & 1) === 1);
  const rows = branches.map((b) => ({ label: b.label, value: b.value, bits: toRow(b.value) }));
  // Parity per column decides the answer, and is what the picture is really for.
  const parity = Array.from({ length: bits }, (_, i) => rows.reduce((acc, r) => acc + (r.bits[i] ? 1 : 0), 0) % 2 === 1);
  return { bits, rows, parity, total, totalBits: toRow(total) };
}

export function nimSumGridHTML(branches, total) {
  if (!branches?.length) return "";
  const { bits, rows, parity, totalBits } = nimSumRows(branches, total);
  const header = Array.from({ length: bits }, (_, i) => `<span class="nim-bit-head">${2 ** (bits - 1 - i)}</span>`).join("");
  const rowHTML = rows.map((r) => `<div class="nim-row">
      <span class="nim-row-label">${esc(r.label)}</span>
      <span class="nim-row-value">${r.value}</span>
      ${r.bits.map((on) => `<span class="nim-cell${on ? " is-on" : ""}"></span>`).join("")}
    </div>`).join("");
  const totalHTML = `<div class="nim-row is-total">
      <span class="nim-row-label">nim-sum</span>
      <span class="nim-row-value">${total}</span>
      ${totalBits.map((on, i) => `<span class="nim-cell${on ? " is-on" : ""}${parity[i] ? " is-odd" : " is-even"}"></span>`).join("")}
    </div>`;
  const allEven = parity.every((p) => !p);
  return `<div class="nim-grid" style="--nim-bits:${bits}">
      <div class="nim-row is-head"><span class="nim-row-label"></span><span class="nim-row-value"></span>${header}</div>
      ${rowHTML}
      ${totalHTML}
    </div>
    <p class="nim-caption">${allEven
      ? "Every column has an even number of filled cells, so everything cancels: the nim-sum is 0 and the second player wins."
      : "The lit columns are the ones with an odd number of filled cells — those survive the cancellation and make up the value."}</p>`;
}

// ── Cooling ──────────────────────────────────────────────────────────────────

// Describe what this particular analysis establishes. A disabled cooling sweep is not, by
// itself, evidence of an engine gap: exact numbers are already frozen and nimbers need no
// positive temperature. Reference models and general-game thermal limits have their own scope.
export function coolingCaptionHTML(value, { reference = false } = {}) {
  const temperature = value?.thermograph?.temperature;
  if (reference || value?.approximate) {
    return `<span class="rigor-badge rigor-heuristic">Modeled reference</span> This thermograph follows the selected reference model. Its walls illustrate that model’s cooling behavior; they do not certify a general infinite, loopy or unsupported position. Read the reference note for its assumptions.`;
  }
  if (value?.kind === "number" && value.number != null) {
    return `<span class="rigor-badge rigor-exact">Cold number</span> This position is exactly ${esc(value.number)}. Both walls already coincide at that value for every nonnegative cooling parameter, so there is no positive cooling interval to sweep. This is a property of the number, not a missing computation.`;
  }
  if (temperature > 0) {
    return "Raising the cooling parameter charges each move a tax. The confusion interval closes as the tax rises, and at the game’s own temperature it freezes on the mean — the point where moving stops paying.";
  }
  if (temperature === 0 && value?.kind === "nimber") {
    return `<span class="rigor-badge rigor-exact">Zero-temperature nimber</span> Both thermograph walls meet at zero, so there is no positive cooling interval to sweep. A nonzero nimber can still be fuzzy with zero: star is not the number zero, and zero temperature does not erase its move options.`;
  }
  if (temperature === 0 && value?.kind === "infinitesimal") {
    return `<span class="rigor-badge rigor-exact">Zero-temperature infinitesimal</span> No positive cooling interval appears in this thermograph. The infinitesimal’s value and move options still distinguish it from zero; a nonzero game need not have positive temperature.`;
  }
  return `<span class="rigor-badge rigor-heuristic">Thermal scope</span> No positive cooling interval is shown. For general games with nested nonnumeric options, this thermal analysis is limited: a coincident-wall plot alone is not a complete classification. Inspect the exact game form and support notes; this plot does not establish that the position should be hot.`;
}

// Walls are { t, v } breakpoints sorted by ascending t; read a wall at any t.
function wallAt(wall, t) {
  if (!wall?.length) return null;
  if (t <= wall[0].t) return wall[0].v;
  for (let i = 1; i < wall.length; i += 1) {
    const prev = wall[i - 1];
    const next = wall[i];
    if (t <= next.t) {
      const span = next.t - prev.t;
      if (span <= 0) return next.v;
      const f = (t - prev.t) / span;
      return prev.v + (next.v - prev.v) * f;
    }
  }
  return wall[wall.length - 1].v;
}

/**
 * The confusion interval of G cooled by t: everything strictly between the two
 * walls. It shrinks to nothing at the game's temperature, which is the moment
 * the game stops being worth moving in.
 */
export function coolingIntervalAt(thermograph, t) {
  if (!thermograph?.leftWall || !thermograph?.rightWall) return null;
  const left = wallAt(thermograph.leftWall, t);
  const right = wallAt(thermograph.rightWall, t);
  if (left === null || right === null) return null;
  const width = Math.max(left - right, 0);
  return {
    t,
    left,
    right,
    width,
    // A cold number is frozen from the start; a hot game freezes at its temperature.
    frozen: width <= 1e-9,
    mean: thermograph.mean,
  };
}

/** Sampled sweep from t = 0 up past the temperature, for animating the cool. */
export function coolingFrames(thermograph, steps = 48) {
  if (!thermograph) return [];
  const temperature = thermograph.temperature;
  const top = temperature > 0 ? temperature * 1.15 : 1;
  return Array.from({ length: steps + 1 }, (_, i) => coolingIntervalAt(thermograph, (top * i) / steps)).filter(Boolean);
}
