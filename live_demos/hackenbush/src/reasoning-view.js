// Live reasoning view: how a position turns into a value, step by step.
//
// Honesty note: the step data below is all real — edge counts before and after
// pruning, the actual independent components and their solved values, the real
// option values. The classification ladder is the STANDARD CGT test applied to
// the engine's computed value; it is not a transcript of the solver's
// recursion. The verbose trace underneath is the literal log.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (label, max = 16) => {
  const text = String(label ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

// ── The classification ladder ────────────────────────────────────────────────
// Each rung is a yes/no question from the standard theory. Exactly one verdict
// fires, decided by the kind the engine already computed.
const LADDER = [
  {
    kind: "nimber",
    question: "Do both players have exactly the same options?",
    yes: "Impartial — the value is a nimber",
    detail: "With identical options the game is impartial, so Sprague-Grundy applies: the value is the mex, the least nimber missing from the options.",
  },
  {
    kind: "number",
    question: "Is every Blue option strictly below every Red option?",
    yes: "Cold — the value is a surreal number",
    detail: "A gap between the two sides means neither player gains by moving. The simplicity rule picks the simplest number sitting in that gap.",
  },
  {
    kind: "switch",
    question: "Does some Blue option reach or pass a Red option?",
    yes: "Hot — the value is a switch",
    detail: "The options overlap, so no number fits between them and both players are impatient to move. That is a switch, with a mean and a positive temperature.",
  },
  {
    kind: "infinitesimal",
    question: "Is it tangled with 0, yet smaller than every positive number?",
    yes: "Infinitesimal — up, down, star and friends",
    detail: "Nonzero but beneath every positive number. Infinitesimals still decide games when added to a position worth exactly 0.",
  },
];

const FALLBACK = {
  yes: "A general short game — no simpler name",
  detail: "None of the standard shapes fit, so the engine reports the exact game form { left | right } without collapsing it further.",
};

export function classificationLadder(value) {
  const kind = value?.kind;
  const rungs = [];
  let decided = false;
  for (const rung of LADDER) {
    if (decided) {
      rungs.push({ ...rung, state: "unreached" });
      continue;
    }
    if (kind === rung.kind) {
      rungs.push({ ...rung, state: "taken" });
      decided = true;
    } else {
      rungs.push({ ...rung, state: "rejected" });
    }
  }
  return { rungs, verdict: decided ? rungs.find((r) => r.state === "taken") : { ...FALLBACK, state: "taken" }, fellThrough: !decided };
}

// ── Steps ────────────────────────────────────────────────────────────────────
export function buildReasoningSteps(analysis, rawPosition) {
  if (!analysis) return [];
  const steps = [];
  const rawEdges = rawPosition?.edges?.length ?? analysis.normalizedPosition?.edges?.length ?? 0;
  const keptEdges = analysis.normalizedPosition?.edges?.length ?? 0;
  const dropped = Math.max(rawEdges - keptEdges, 0);

  steps.push({
    key: "normalize",
    label: "Prune",
    headline: dropped > 0
      ? `${keptEdges} of ${rawEdges} edges still reach the ground`
      : `All ${keptEdges} edges reach the ground`,
    detail: dropped > 0
      ? `${dropped} edge${dropped === 1 ? "" : "s"} had no path to the ground, so ${dropped === 1 ? "it falls" : "they fall"} before play begins.`
      : "Nothing is floating, so the whole board is in play.",
  });

  const components = analysis.components ?? [];
  if (components.length > 1) {
    steps.push({
      key: "decompose",
      label: "Split",
      headline: `${components.length} independent components`,
      detail: "Components share no vertex, so each is solved on its own and the results are added — this is what makes big boards tractable at all.",
      chips: components.map((c, i) => ({
        text: `#${i + 1}: ${c.edgeCount} edge${c.edgeCount === 1 ? "" : "s"} → ${short(c.value?.label)}`,
      })),
    });
    steps.push({
      key: "sum",
      label: "Add",
      headline: `${components.map((c) => short(c.value?.label, 10)).join("  +  ")}  =  ${short(analysis.value?.label, 18)}`,
      detail: "The disjunctive sum of the parts. Adding games is not adding numbers — infinitesimals and nimbers combine by their own rules.",
    });
  } else {
    steps.push({
      key: "decompose",
      label: "Split",
      headline: "One connected component",
      detail: "Nothing separates, so the whole position has to be searched together.",
    });
  }

  const leftCount = analysis.moves?.left?.length ?? 0;
  const rightCount = analysis.moves?.right?.length ?? 0;
  steps.push({
    key: "options",
    label: "Branch",
    headline: `${leftCount} Blue option${leftCount === 1 ? "" : "s"}, ${rightCount} Red option${rightCount === 1 ? "" : "s"}`,
    detail: "Every legal cut is a branch; the value of this position is built from the values of everything those branches lead to.",
  });

  steps.push({
    key: "classify",
    label: "Classify",
    headline: analysis.value?.subtitle || "Classify the resulting form",
    detail: "Now the shape of that form decides what kind of value this is.",
    ladder: true,
  });

  steps.push({
    key: "result",
    label: "Value",
    headline: short(analysis.value?.label, 40),
    detail: analysis.value?.outcomeName ? `Outcome: ${analysis.value.outcomeName}.` : "",
    isResult: true,
  });

  return steps;
}

// ── Branch fan ───────────────────────────────────────────────────────────────
// The position in the middle, Blue's options fanning left, Red's fanning right,
// each labelled with what it leads to. This is the "show me the branches" view:
// one hop deep, which is the level at which the value is actually determined.
export function branchFanSVG(analysis, options = {}) {
  const width = options.width ?? 460;
  const height = options.height ?? 240;
  const maxPerSide = options.maxPerSide ?? 5;
  const left = (analysis?.moves?.left ?? []).slice(0, maxPerSide);
  const right = (analysis?.moves?.right ?? []).slice(0, maxPerSide);
  const leftTotal = analysis?.moves?.left?.length ?? 0;
  const rightTotal = analysis?.moves?.right?.length ?? 0;
  const cx = width / 2;
  const cy = height / 2;

  const fan = (moves, total, dir, color) => {
    if (!moves.length) {
      return `<text x="${cx + dir * 150}" y="${cy}" class="fan-none" text-anchor="middle">no moves</text>`;
    }
    const spread = Math.min(height - 46, moves.length * 34);
    const step = moves.length > 1 ? spread / (moves.length - 1) : 0;
    const top = cy - spread / 2;
    return moves.map((move, i) => {
      const y = moves.length > 1 ? top + i * step : cy;
      const x = cx + dir * 132;
      const midX = cx + dir * 66;
      const hidden = i === maxPerSide - 1 && total > maxPerSide;
      const label = hidden ? `+${total - maxPerSide} more` : short(move.resultingValue?.label, 12);
      return `<path d="M${cx + dir * 26},${cy} C${midX},${cy} ${midX},${y} ${x - dir * 26},${y}"
          fill="none" stroke="${color}" stroke-width="2" class="fan-link" opacity="0.75"/>
        <rect x="${x - dir * 26 - (dir > 0 ? 0 : 92)}" y="${y - 12}" width="92" height="24" rx="7"
          class="fan-node" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.5"/>
        <text x="${x - dir * 26 + dir * 46}" y="${y}" class="fan-label" text-anchor="middle"
          dominant-baseline="middle">${esc(label)}</text>`;
    }).join("");
  };

  return `<svg viewBox="0 0 ${width} ${height}" class="branch-fan" role="img"
      aria-label="${leftTotal} Blue options and ${rightTotal} Red options from this position">
    ${fan(left, leftTotal, -1, "var(--blue)")}
    ${fan(right, rightTotal, 1, "var(--red)")}
    <rect x="${cx - 34}" y="${cy - 15}" width="68" height="30" rx="9" class="fan-root"/>
    <text x="${cx}" y="${cy}" class="fan-root-label" text-anchor="middle" dominant-baseline="middle">G</text>
    <text x="${cx - 132}" y="18" class="fan-side fan-side-blue" text-anchor="middle">Blue cuts</text>
    <text x="${cx + 132}" y="18" class="fan-side fan-side-red" text-anchor="middle">Red cuts</text>
  </svg>`;
}

// ── HTML ─────────────────────────────────────────────────────────────────────
export function renderReasoningHTML(analysis, rawPosition) {
  const steps = buildReasoningSteps(analysis, rawPosition);
  if (!steps.length) return "";
  const { rungs, verdict, fellThrough } = classificationLadder(analysis.value);

  const ladderHTML = `<div class="ladder">
    ${rungs.map((rung) => `<div class="ladder-rung is-${rung.state}">
      <span class="ladder-mark" aria-hidden="true">${rung.state === "taken" ? "✓" : rung.state === "rejected" ? "✕" : "·"}</span>
      <div class="ladder-body">
        <p class="ladder-q">${esc(rung.question)}</p>
        ${rung.state === "taken" ? `<p class="ladder-a">${esc(rung.yes)}</p><p class="ladder-detail">${esc(rung.detail)}</p>` : ""}
      </div>
    </div>`).join("")}
    ${fellThrough ? `<div class="ladder-rung is-taken">
      <span class="ladder-mark" aria-hidden="true">✓</span>
      <div class="ladder-body">
        <p class="ladder-a">${esc(verdict.yes)}</p>
        <p class="ladder-detail">${esc(verdict.detail)}</p>
      </div></div>` : ""}
  </div>`;

  const stepsHTML = steps.map((step, i) => `<li class="reason-step${step.isResult ? " is-result" : ""}" data-step="${i}">
    <span class="reason-index">${step.label}</span>
    <div class="reason-body">
      <p class="reason-headline">${esc(step.headline)}</p>
      ${step.detail ? `<p class="reason-detail">${esc(step.detail)}</p>` : ""}
      ${step.chips ? `<div class="reason-chips">${step.chips.map((c) => `<span class="reason-chip">${esc(c.text)}</span>`).join("")}</div>` : ""}
      ${step.ladder ? ladderHTML : ""}
      ${step.key === "options" ? branchFanSVG(analysis) : ""}
    </div>
  </li>`).join("");

  return `<ol class="reason-steps">${stepsHTML}</ol>`;
}
